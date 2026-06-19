package com.visoraps.app;

import android.Manifest;
import android.graphics.Color;
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
import com.google.ar.core.Pose;
import com.google.ar.core.Session;
import com.google.ar.core.TrackingState;

import java.util.ArrayList;
import java.util.List;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/**
 * Plugin Capacitor "ARCore" — Capa 0 del sándwich transparente.
 *
 * Arranca ARCore, dibuja la cámara real en una GLSurfaceView DETRÁS del WebView
 * (que se pone transparente) y emite la pose de la cámara por frame a JS:
 *   onCameraPose  { view:[16], proj:[16] }
 *   onTracking    { state:'tracking'|'paused'|'stopped', reason }
 *
 * JS (arViewerBridge.js) usa la pose para mover la cámara del viewer de Autodesk,
 * cuyo canvas flota transparente sobre la cámara real.
 *
 * Esqueleto para compilar y empezar a iterar en device. Marcas [TUNE]/[TODO]
 * indican lo que se ajusta contra el celular real.
 */
@CapacitorPlugin(
    name = "ARCore",
    permissions = { @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera") }
)
public class ARCorePlugin extends Plugin {

    private Session session;
    private GLSurfaceView glView;
    private BackgroundRenderer bgRenderer;
    private boolean running = false;
    private final float[] projMatrix = new float[16];
    private final float[] viewMatrix = new float[16];
    private final List<Anchor> anchors = new ArrayList<>();
    private PluginCall pendingAnchorCall = null;

    @PluginMethod
    public void start(final PluginCall call) {
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
            call.reject("Permiso de cámara denegado");
        }
    }

    private void startInternal(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                // 1) Asegurar ARCore instalado/actualizado
                ArCoreApk.Availability avail = ArCoreApk.getInstance().checkAvailability(getContext());
                if (avail.isTransient()) { call.reject("ARCore verificando disponibilidad, reintenta"); return; }
                if (!avail.isSupported()) { call.reject("Este dispositivo no soporta ARCore"); return; }

                ArCoreApk.InstallStatus installStatus =
                        ArCoreApk.getInstance().requestInstall(getActivity(), true);
                if (installStatus == ArCoreApk.InstallStatus.INSTALL_REQUESTED) {
                    call.reject("Instalando ARCore (Google Play Services for AR), reintenta luego");
                    return;
                }

                // 2) Crear sesión
                session = new Session(getContext());
                Config config = new Config(session);
                config.setUpdateMode(Config.UpdateMode.LATEST_CAMERA_IMAGE);
                config.setFocusMode(Config.FocusMode.AUTO);
                config.setPlaneFindingMode(Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL);
                session.configure(config);

                // 3) GLSurfaceView de fondo, DETRÁS del WebView transparente
                final WebView webView = getBridge().getWebView();
                final ViewGroup parent = (ViewGroup) webView.getParent();

                bgRenderer = new BackgroundRenderer();
                glView = new GLSurfaceView(getContext());
                glView.setPreserveEGLContextOnPause(true);
                glView.setEGLContextClientVersion(2);
                glView.setEGLConfigChooser(8, 8, 8, 8, 16, 0);
                glView.setRenderer(renderer);
                glView.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);

                // WebView transparente y por delante (Capa 1/2)
                webView.setBackgroundColor(Color.TRANSPARENT);
                parent.addView(glView, 0, new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                webView.bringToFront();

                session.resume();
                glView.onResume();
                running = true;
                call.resolve();
            } catch (Exception e) {
                call.reject("No se pudo iniciar ARCore: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void stop(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            running = false;
            try {
                if (glView != null) {
                    glView.onPause();
                    ViewGroup parent = (ViewGroup) glView.getParent();
                    if (parent != null) parent.removeView(glView);
                    glView = null;
                }
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().setBackgroundColor(Color.WHITE);
                }
                if (session != null) { session.pause(); session.close(); session = null; }
                anchors.clear();
            } catch (Exception e) { /* noop */ }
            call.resolve();
        });
    }

    /** Fija el mundo en la pose actual de la cámara (anchor). El modelo se bloquea ahí. */
    @PluginMethod
    public void createAnchor(PluginCall call) {
        if (session == null) { call.reject("Sesión AR no activa"); return; }
        // Se crea en el hilo GL en el próximo frame (necesita el Frame actual)
        pendingAnchorCall = call;
    }

    // ── Renderer del hilo GL: dibuja cámara + extrae pose por frame ──
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
                TrackingState ts = camera.getTrackingState();
                emitTracking(ts);
                if (ts != TrackingState.TRACKING) return;

                // Atender un createAnchor pendiente con la pose actual
                if (pendingAnchorCall != null) {
                    Anchor a = session.createAnchor(camera.getPose());
                    anchors.add(a);
                    float[] m = new float[16];
                    a.getPose().toMatrix(m, 0);
                    JSObject ret = new JSObject();
                    ret.put("anchorId", String.valueOf(anchors.size() - 1));
                    ret.put("matrix", floatsToJsonArray(m));
                    pendingAnchorCall.resolve(ret);
                    pendingAnchorCall = null;
                }

                // Pose por frame -> JS
                camera.getViewMatrix(viewMatrix, 0);
                camera.getProjectionMatrix(projMatrix, 0, 0.05f, 2000f); // [TUNE] near/far
                JSObject pose = new JSObject();
                pose.put("view", floatsToJsonArray(viewMatrix));
                pose.put("proj", floatsToJsonArray(projMatrix));
                notifyListeners("onCameraPose", pose);
            } catch (Throwable t) {
                // No reventar el hilo GL; el siguiente frame reintenta
            }
        }
    };

    private TrackingState lastState = null;
    private void emitTracking(TrackingState ts) {
        if (ts == lastState) return;
        lastState = ts;
        JSObject o = new JSObject();
        o.put("state", ts == TrackingState.TRACKING ? "tracking"
                : ts == TrackingState.PAUSED ? "paused" : "stopped");
        notifyListeners("onTracking", o);
    }

    private static com.getcapacitor.JSArray floatsToJsonArray(float[] m) {
        com.getcapacitor.JSArray arr = new com.getcapacitor.JSArray();
        for (float v : m) arr.put((double) v);
        return arr;
    }

    @Override
    protected void handleOnDestroy() {
        try { if (session != null) { session.close(); session = null; } } catch (Exception e) {}
    }
}
