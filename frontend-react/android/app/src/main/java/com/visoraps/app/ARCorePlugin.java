package com.visoraps.app;

import android.Manifest;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.view.ViewGroup;
import android.webkit.WebView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.google.ar.core.Anchor;
import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Camera;
import com.google.ar.core.Config;
import com.google.ar.core.Frame;
import com.google.ar.core.HitResult;
import com.google.ar.core.Plane;
import com.google.ar.core.Point;
import com.google.ar.core.Pose;
import com.google.ar.core.Session;
import com.google.ar.core.Trackable;
import com.google.ar.core.TrackingState;

import java.util.ArrayList;
import java.util.List;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/**
 * Capacitor plugin that renders the ARCore camera behind the transparent
 * WebView and streams camera matrices to the Autodesk Viewer.
 */
@CapacitorPlugin(
    name = "ARCore",
    permissions = { @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera") }
)
public class ARCorePlugin extends Plugin {

    private static final long POSE_INTERVAL_NS = 33_333_333L; // 30 Hz to reduce JS bridge load.

    private Session session;
    private GLSurfaceView glView;
    private BackgroundRenderer bgRenderer;
    private volatile boolean running = false;
    private final float[] projMatrix = new float[16];
    private final float[] viewMatrix = new float[16];
    private final List<Anchor> anchors = new ArrayList<>();
    private volatile PluginCall pendingAnchorCall = null;
    private volatile int viewportWidth = 0;
    private volatile int viewportHeight = 0;
    private Drawable originalWebViewBackground = null;
    private long lastPoseEmitNs = 0L;
    private TrackingState lastState = null;

    @PluginMethod
    public void start(final PluginCall call) {
        if (running && session != null) {
            call.resolve();
            return;
        }
        if (getPermissionState("camera") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermsCallback");
            return;
        }
        startInternal(call);
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void cameraPermsCallback(PluginCall call) {
        if (getPermissionState("camera") == com.getcapacitor.PermissionState.GRANTED) {
            startInternal(call);
        } else {
            call.reject("Permiso de camara denegado");
        }
    }

    private void startInternal(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                ArCoreApk.Availability availability =
                        ArCoreApk.getInstance().checkAvailability(getContext());
                if (availability.isTransient()) {
                    call.reject("ARCore esta verificando disponibilidad. Reintenta.");
                    return;
                }
                if (!availability.isSupported()) {
                    call.reject("Este dispositivo no soporta ARCore");
                    return;
                }

                ArCoreApk.InstallStatus installStatus =
                        ArCoreApk.getInstance().requestInstall(getActivity(), true);
                if (installStatus == ArCoreApk.InstallStatus.INSTALL_REQUESTED) {
                    call.reject("Instalando Google Play Services for AR. Reintenta al terminar.");
                    return;
                }

                session = new Session(getContext());
                Config config = new Config(session);
                config.setUpdateMode(Config.UpdateMode.LATEST_CAMERA_IMAGE);
                config.setFocusMode(Config.FocusMode.AUTO);
                config.setPlaneFindingMode(Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL);
                session.configure(config);

                final WebView webView = getBridge().getWebView();
                final ViewGroup parent = (ViewGroup) webView.getParent();
                originalWebViewBackground = webView.getBackground();

                bgRenderer = new BackgroundRenderer();
                glView = new GLSurfaceView(getContext());
                glView.setPreserveEGLContextOnPause(true);
                glView.setEGLContextClientVersion(2);
                glView.setEGLConfigChooser(8, 8, 8, 8, 16, 0);
                glView.setRenderer(renderer);
                glView.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);

                webView.setBackgroundColor(Color.TRANSPARENT);
                parent.addView(glView, 0, new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));
                webView.bringToFront();

                session.resume();
                running = true;
                glView.onResume();
                call.resolve();
            } catch (Exception error) {
                cleanupSession();
                call.reject("No se pudo iniciar ARCore: " + error.getMessage(), error);
            }
        });
    }

    @PluginMethod
    public void stop(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            cleanupSession();
            call.resolve();
        });
    }

    @PluginMethod
    public void createAnchor(PluginCall call) {
        if (!running || session == null) {
            call.reject("Sesion AR no activa");
            return;
        }
        if (pendingAnchorCall != null) {
            call.reject("Ya hay una solicitud de anchor en curso");
            return;
        }
        pendingAnchorCall = call;
    }

    private final GLSurfaceView.Renderer renderer = new GLSurfaceView.Renderer() {
        @Override
        public void onSurfaceCreated(GL10 gl, EGLConfig config) {
            GLES20.glClearColor(0f, 0f, 0f, 0f);
            bgRenderer.createOnGlThread();
            if (session != null) session.setCameraTextureName(bgRenderer.getTextureId());
        }

        @Override
        public void onSurfaceChanged(GL10 gl, int width, int height) {
            GLES20.glViewport(0, 0, width, height);
            viewportWidth = width;
            viewportHeight = height;
            if (session != null) {
                int rotation = getActivity().getWindowManager().getDefaultDisplay().getRotation();
                session.setDisplayGeometry(rotation, width, height);
            }
        }

        @Override
        public void onDrawFrame(GL10 gl) {
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT | GLES20.GL_DEPTH_BUFFER_BIT);
            if (session == null || !running) return;

            try {
                session.setCameraTextureName(bgRenderer.getTextureId());
                Frame frame = session.update();
                bgRenderer.draw(frame);

                Camera camera = frame.getCamera();
                TrackingState trackingState = camera.getTrackingState();
                emitTracking(trackingState);
                if (trackingState != TrackingState.TRACKING) return;

                resolvePendingAnchor(frame);

                long timestamp = frame.getTimestamp();
                if (timestamp - lastPoseEmitNs >= POSE_INTERVAL_NS) {
                    lastPoseEmitNs = timestamp;
                    camera.getViewMatrix(viewMatrix, 0);
                    camera.getProjectionMatrix(projMatrix, 0, 0.05f, 2000f);
                    JSObject pose = new JSObject();
                    pose.put("view", floatsToJsonArray(viewMatrix));
                    pose.put("proj", floatsToJsonArray(projMatrix));
                    notifyListeners("onCameraPose", pose);
                }
            } catch (Throwable error) {
                PluginCall anchorCall = pendingAnchorCall;
                pendingAnchorCall = null;
                if (anchorCall != null) {
                    anchorCall.reject("Error creando el anchor: " + error.getMessage());
                }
            }
        }
    };

    private void resolvePendingAnchor(Frame frame) {
        PluginCall anchorCall = pendingAnchorCall;
        if (anchorCall == null) return;
        pendingAnchorCall = null;

        Anchor anchor = createAnchorFromCenterHit(frame);
        if (anchor == null) {
            anchorCall.reject(
                    "No se detecto una superficie en el reticulo. "
                    + "Mueve el celular lentamente y vuelve a intentar.");
            return;
        }

        for (Anchor oldAnchor : anchors) oldAnchor.detach();
        anchors.clear();
        anchors.add(anchor);

        float[] matrix = new float[16];
        anchor.getPose().toMatrix(matrix, 0);
        JSObject result = new JSObject();
        result.put("anchorId", "0");
        result.put("matrix", floatsToJsonArray(matrix));
        anchorCall.resolve(result);
    }

    private Anchor createAnchorFromCenterHit(Frame frame) {
        if (viewportWidth <= 0 || viewportHeight <= 0) return null;

        List<HitResult> hits =
                frame.hitTest(viewportWidth * 0.5f, viewportHeight * 0.5f);
        HitResult pointFallback = null;
        for (HitResult hit : hits) {
            Trackable trackable = hit.getTrackable();
            if (trackable instanceof Plane) {
                Plane plane = (Plane) trackable;
                if (plane.getTrackingState() == TrackingState.TRACKING
                        && plane.getType() == Plane.Type.HORIZONTAL_UPWARD_FACING
                        && plane.isPoseInPolygon(hit.getHitPose())) {
                    return createWorldAlignedAnchor(hit);
                }
            } else if (trackable instanceof Point
                    && trackable.getTrackingState() == TrackingState.TRACKING
                    && pointFallback == null) {
                pointFallback = hit;
            }
        }
        return pointFallback != null ? createWorldAlignedAnchor(pointFallback) : null;
    }

    private Anchor createWorldAlignedAnchor(HitResult hit) {
        Pose hitPose = hit.getHitPose();
        Pose worldAlignedPose = new Pose(
                hitPose.getTranslation(),
                new float[] { 0f, 0f, 0f, 1f });
        return session.createAnchor(worldAlignedPose);
    }

    private void emitTracking(TrackingState trackingState) {
        if (trackingState == lastState) return;
        lastState = trackingState;
        JSObject payload = new JSObject();
        payload.put("state", trackingState == TrackingState.TRACKING ? "tracking"
                : trackingState == TrackingState.PAUSED ? "paused" : "stopped");
        notifyListeners("onTracking", payload);
    }

    private void cleanupSession() {
        running = false;
        PluginCall anchorCall = pendingAnchorCall;
        pendingAnchorCall = null;
        if (anchorCall != null) {
            anchorCall.reject("La sesion AR termino antes de crear el anchor");
        }

        try {
            if (glView != null) {
                glView.onPause();
                ViewGroup parent = (ViewGroup) glView.getParent();
                if (parent != null) parent.removeView(glView);
                glView = null;
            }
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().setBackground(originalWebViewBackground);
            }
            for (Anchor anchor : anchors) anchor.detach();
            anchors.clear();
            if (session != null) {
                session.pause();
                session.close();
                session = null;
            }
        } catch (Exception ignored) {
            // Cleanup must remain idempotent.
        }

        viewportWidth = 0;
        viewportHeight = 0;
        lastPoseEmitNs = 0L;
        lastState = null;
    }

    private static com.getcapacitor.JSArray floatsToJsonArray(float[] matrix) {
        com.getcapacitor.JSArray result = new com.getcapacitor.JSArray();
        try {
            for (float value : matrix) result.put((double) value);
        } catch (org.json.JSONException error) {
            error.printStackTrace();
        }
        return result;
    }

    @Override
    protected void handleOnDestroy() {
        cleanupSession();
    }
}
