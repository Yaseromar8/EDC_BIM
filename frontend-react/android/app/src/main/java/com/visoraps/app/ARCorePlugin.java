package com.visoraps.app;

import android.Manifest;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.hardware.GeomagneticField;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.os.Bundle;
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
 *
 * Además del SLAM (pose de cámara), emite 'onGeoPose' con GPS + rumbo verdadero
 * para el anclaje GEOESPACIAL: colocar el modelo sobre el terreno real según la
 * posición del operario (obra lineal, ±3-5 m para "referenciarse").
 */
@CapacitorPlugin(
    name = "ARCore",
    permissions = {
        @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera"),
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "location")
    }
)
public class ARCorePlugin extends Plugin {

    private static final long POSE_INTERVAL_NS = 33_333_333L; // 30 Hz to reduce JS bridge load.
    private static final long GEO_EMIT_INTERVAL_MS = 200L;    // 5 Hz para GPS/rumbo.

    private Session session;
    private GLSurfaceView glView;
    private BackgroundRenderer bgRenderer;
    private PlaneRenderer planeRenderer;
    /** La malla de escaneo se apaga al colocar el modelo (como Augin). */
    private volatile boolean showPlanes = true;
    /** Planos de piso dibujados en el ultimo frame; la UI lo reporta. */
    private volatile int floorPlanesVisible = 0;
    private volatile boolean running = false;
    private final float[] projMatrix = new float[16];
    private final float[] viewMatrix = new float[16];
    private final List<Anchor> anchors = new ArrayList<>();
    private volatile PluginCall pendingAnchorCall = null;
    private volatile PluginCall pendingCameraAnchorCall = null;
    private volatile int viewportWidth = 0;
    private volatile int viewportHeight = 0;
    private Drawable originalWebViewBackground = null;
    private Drawable originalWindowBackground = null;
    private long lastPoseEmitNs = 0L;
    // Latido de diagnostico: cuantas veces se ha dibujado y por que ARCore no
    // rastrea. Sin esto, "track: paused" no distingue entre "el bucle de
    // dibujo no corre" y "corre pero no hay suficiente luz o textura".
    private long frameCount = 0L;
    private long lastStatsMs = 0L;
    /** Ultimo error del hilo GL, para poder verlo desde la web. */
    private volatile String glError = "";
    /** true en cuanto ARCore tiene una textura valida donde escribir. */
    private volatile boolean textureReady = false;
    private TrackingState lastState = null;

    // ── GPS + brújula ────────────────────────────────────────────────────────
    private LocationManager locationManager;
    private SensorManager sensorManager;
    private Sensor rotationSensor;
    private final float[] rotationMatrix = new float[9];
    private final float[] remappedMatrix = new float[9];
    private final float[] orientationAngles = new float[3];
    private volatile boolean hasFix = false;
    private volatile double lastLat = 0, lastLon = 0, lastAlt = 0;
    private volatile float lastAccuracy = 0f;
    private volatile float declination = 0f;      // magnético → verdadero
    private volatile boolean hasHeading = false;
    private volatile float trueHeadingDeg = 0f;
    private long lastGeoEmitMs = 0L;

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
        // Ubicación: se pide también, pero es OPCIONAL — el AR arranca aunque el
        // usuario la niegue (solo que no habrá orientación por GPS).
        if (getPermissionState("location") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "locationPermsCallback");
            return;
        }
        startInternal(call);
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void cameraPermsCallback(PluginCall call) {
        if (getPermissionState("camera") == com.getcapacitor.PermissionState.GRANTED) {
            start(call); // re-entra: ahora evalúa el permiso de ubicación.
        } else {
            call.reject("Permiso de camara denegado");
        }
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void locationPermsCallback(PluginCall call) {
        // Se haya concedido o no, el AR arranca. Sin ubicación no hay GPS, nada más.
        startInternal(call);
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
                showPlanes = true;
                floorPlanesVisible = 0;
                glView = new GLSurfaceView(getContext());
                glView.setPreserveEGLContextOnPause(true);
                glView.setEGLContextClientVersion(2);
                glView.setEGLConfigChooser(8, 8, 8, 8, 16, 0);
                glView.setRenderer(renderer);
                glView.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);
                // La capa de video se compone POR ENCIMA del fondo de la ventana
                // y POR DEBAJO del WebView — exactamente el sandwich que hace
                // falta. Sin esto la GLSurfaceView queda detras del fondo de la
                // ventana y no se ve: la pantalla sale NEGRA aunque la camara
                // este funcionando y ARCore siga emitiendo poses.
                glView.setZOrderMediaOverlay(true);

                // TODA la pila por encima del video tiene que ser transparente.
                // Con el WebView transparente pero la ventana opaca seguias
                // viendo negro: faltaban estos dos.
                webView.setBackgroundColor(Color.TRANSPARENT);
                parent.setBackgroundColor(Color.TRANSPARENT);
                try {
                    originalWindowBackground = getActivity().getWindow().getDecorView().getBackground();
                    getActivity().getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
                } catch (Exception ignored) { }

                parent.addView(glView, 0, new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));
                webView.bringToFront();

                session.resume();
                running = true;
                glView.onResume();
                startGeoSensors();
                call.resolve();
            } catch (Exception error) {
                cleanupSession();
                call.reject("No se pudo iniciar ARCore: " + error.getMessage(), error);
            }
        });
    }

    // ── GPS + rumbo ──────────────────────────────────────────────────────────
    private void startGeoSensors() {
        // Ubicación (best-effort: si no hay permiso, se omite sin romper el AR).
        try {
            if (getPermissionState("location") == com.getcapacitor.PermissionState.GRANTED) {
                locationManager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
                if (locationManager != null) {
                    // Semilla inmediata con la última posición conocida.
                    // catch amplio: si falta un provider, getLastKnownLocation lanza
                    // IllegalArgumentException — no debe abortar el registro de updates.
                    try {
                        Location known = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                        if (known == null) known = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
                        if (known != null) onNewLocation(known);
                    } catch (Exception ignored) { }
                    try {
                        locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, locationListener);
                    } catch (Exception ignored) { }
                    try {
                        locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 2000L, 0f, locationListener);
                    } catch (Exception ignored) { }
                }
            }
        } catch (Exception ignored) { }

        // Rumbo: vector de rotación (fusiona giroscopio + magnetómetro + acelerómetro).
        try {
            sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
            if (sensorManager != null) {
                rotationSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
                if (rotationSensor != null) {
                    sensorManager.registerListener(sensorListener, rotationSensor, SensorManager.SENSOR_DELAY_UI);
                }
            }
        } catch (Exception ignored) { }
    }

    private void stopGeoSensors() {
        try {
            if (locationManager != null) locationManager.removeUpdates(locationListener);
        } catch (Exception ignored) { }
        try {
            if (sensorManager != null) sensorManager.unregisterListener(sensorListener);
        } catch (Exception ignored) { }
        locationManager = null;
        sensorManager = null;
        rotationSensor = null;
        hasFix = false;
        hasHeading = false;
    }

    private void onNewLocation(Location loc) {
        if (loc == null) return;
        lastLat = loc.getLatitude();
        lastLon = loc.getLongitude();
        lastAlt = loc.hasAltitude() ? loc.getAltitude() : 0;
        lastAccuracy = loc.hasAccuracy() ? loc.getAccuracy() : 0f;
        hasFix = true;
        // Declinación magnética para convertir el rumbo a NORTE VERDADERO.
        try {
            GeomagneticField gmf = new GeomagneticField(
                    (float) lastLat, (float) lastLon, (float) lastAlt, System.currentTimeMillis());
            declination = gmf.getDeclination();
        } catch (Exception ignored) { }
        emitGeoPose(true);
    }

    private final LocationListener locationListener = new LocationListener() {
        @Override public void onLocationChanged(Location location) { onNewLocation(location); }
        @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
        @Override public void onProviderEnabled(String provider) { }
        @Override public void onProviderDisabled(String provider) { }
    };

    private final SensorEventListener sensorListener = new SensorEventListener() {
        @Override
        public void onSensorChanged(SensorEvent event) {
            if (event.sensor.getType() != Sensor.TYPE_ROTATION_VECTOR) return;
            SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values);
            // Celular en vertical con la cámara apuntando al horizonte (uso AR):
            // remapear para que el azimut sea el rumbo de la CÁMARA, no del techo.
            SensorManager.remapCoordinateSystem(
                    rotationMatrix, SensorManager.AXIS_X, SensorManager.AXIS_Z, remappedMatrix);
            SensorManager.getOrientation(remappedMatrix, orientationAngles);
            float magneticDeg = (float) Math.toDegrees(orientationAngles[0]);
            trueHeadingDeg = ((magneticDeg + declination) % 360f + 360f) % 360f;
            hasHeading = true;
            emitGeoPose(false);
        }

        @Override public void onAccuracyChanged(Sensor sensor, int accuracy) { }
    };

    private void emitGeoPose(boolean immediate) {
        if (!hasFix) return; // sin posición no sirve emitir.
        long now = System.currentTimeMillis();
        if (!immediate && now - lastGeoEmitMs < GEO_EMIT_INTERVAL_MS) return;
        lastGeoEmitMs = now;
        JSObject payload = new JSObject();
        payload.put("lat", lastLat);
        payload.put("lon", lastLon);
        payload.put("alt", lastAlt);
        payload.put("accuracy", lastAccuracy);
        payload.put("heading", trueHeadingDeg);
        payload.put("hasHeading", hasHeading);
        notifyListeners("onGeoPose", payload);
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

    /**
     * Ancla en la POSE ACTUAL de la cámara (sin hit-test). Robusto en terreno
     * abierto del canal, donde la detección de plano falla sobre tierra/pasto.
     */
    @PluginMethod
    public void createAnchorAtCamera(PluginCall call) {
        if (!running || session == null) {
            call.reject("Sesion AR no activa");
            return;
        }
        if (pendingCameraAnchorCall != null) {
            call.reject("Ya hay una solicitud de anchor en curso");
            return;
        }
        pendingCameraAnchorCall = call;
    }

    private final GLSurfaceView.Renderer renderer = new GLSurfaceView.Renderer() {
        @Override
        public void onSurfaceCreated(GL10 gl, EGLConfig config) {
            GLES20.glClearColor(0f, 0f, 0f, 0f);
            // La textura de camara se crea AQUI, y hasta ahora sin red de
            // seguridad: si createOnGlThread lanzaba —un shader que no compila
            // basta—, la excepcion salia del metodo y setCameraTextureName no
            // llegaba a ejecutarse NUNCA. ARCore se quedaba sin textura donde
            // escribir, getTimestamp() era 0 para siempre y la pantalla salia
            // vacia mientras el bucle de dibujo seguia corriendo tan tranquilo.
            textureReady = false;
            try {
                bgRenderer.createOnGlThread();
                glError = "";
            } catch (Throwable t) {
                glError = "camara: " + String.valueOf(t.getMessage());
            }
            // Si el shader de planos fallara, el AR debe seguir funcionando: la
            // malla es ayuda visual, no requisito para anclar.
            try {
                planeRenderer = new PlaneRenderer();
                planeRenderer.createOnGlThread();
            } catch (Throwable t) {
                planeRenderer = null;
                if (glError.isEmpty()) glError = "malla: " + String.valueOf(t.getMessage());
            }
            bindCameraTexture();
        }

        /** Entrega la textura a ARCore. Solo con un id valido. */
        private void bindCameraTexture() {
            try {
                int tex = (bgRenderer != null) ? bgRenderer.getTextureId() : -1;
                if (session != null && tex > 0) {
                    session.setCameraTextureName(tex);
                    textureReady = true;
                }
            } catch (Throwable t) {
                glError = "bind: " + String.valueOf(t.getMessage());
            }
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
            // PRUEBA DE VISIBILIDAD: mientras ARCore no rastrea, esta capa se
            // limpia en MAGENTA en vez de transparente.
            //
            // Sirve para decidir algo que llevamos horas sin poder distinguir:
            //   · se ve magenta -> la GLSurfaceView SI es visible, y lo que
            //     falla es la imagen de camara o el propio tracking.
            //   · sigue negro   -> la capa no se ve, y el problema es el
            //     apilado de superficies, no ARCore.
            // En cuanto el tracking arranca vuelve a transparente y no molesta.
            if (lastState != TrackingState.TRACKING) {
                GLES20.glClearColor(1f, 0f, 1f, 1f);
            } else {
                GLES20.glClearColor(0f, 0f, 0f, 0f);
            }
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT | GLES20.GL_DEPTH_BUFFER_BIT);
            if (session == null || !running) return;

            try {
                // Reintento: si la textura no llego a crearse (o su creacion
                // fallo), se vuelve a intentar aqui en vez de dejar la sesion
                // inservible para siempre.
                if (!textureReady) {
                    if (bgRenderer.getTextureId() <= 0) {
                        try { bgRenderer.createOnGlThread(); glError = ""; }
                        catch (Throwable t) { glError = "camara: " + String.valueOf(t.getMessage()); }
                    }
                    bindCameraTexture();
                }
                Frame frame = session.update();
                boolean camaraPintada = bgRenderer.draw(frame);
                long tsCamara = frame.getTimestamp();

                Camera camera = frame.getCamera();
                TrackingState trackingState = camera.getTrackingState();
                emitTracking(trackingState);

                // Latido 1 Hz con la verdad de ARCore. `reason` es lo decisivo:
                // INSUFFICIENT_LIGHT / INSUFFICIENT_FEATURES / EXCESSIVE_MOTION
                // / CAMERA_UNAVAILABLE / BAD_STATE / NONE.
                frameCount++;
                long ahora = System.currentTimeMillis();
                if (ahora - lastStatsMs >= 1000L) {
                    lastStatsMs = ahora;
                    JSObject st = new JSObject();
                    st.put("frames", frameCount);
                    st.put("state", trackingState.name());
                    // ts=0 significa que la CAMARA no entrega imagen: ARCore
                    // corre en vacio. Es la diferencia entre "no dibujamos" y
                    // "no hay nada que dibujar".
                    st.put("ts", tsCamara);
                    st.put("cam", camaraPintada);
                    st.put("tex", bgRenderer != null ? bgRenderer.getTextureId() : -1);
                    st.put("glError", glError);
                    try {
                        st.put("reason", camera.getTrackingFailureReason().name());
                    } catch (Throwable ignored) {
                        st.put("reason", "?");
                    }
                    notifyListeners("onArStats", st);
                }

                if (trackingState != TrackingState.TRACKING) return;

                // MALLA DE ESCANEO: las superficies que ARCore va reconociendo,
                // dibujadas sobre el terreno real. Es lo que le dice al operario
                // que el equipo esta "viendo" el piso y donde puede colocar.
                if (planeRenderer != null && showPlanes) {
                    try {
                        floorPlanesVisible = planeRenderer.draw(
                                session.getAllTrackables(Plane.class), camera, 0.75f);
                    } catch (Throwable ignored) {
                        floorPlanesVisible = 0;
                    }
                } else {
                    floorPlanesVisible = 0;
                }

                resolvePendingAnchor(frame);
                resolvePendingCameraAnchor(camera);

                // RETÍCULO: hit-test en el punto de mira (centro, o donde el
                // usuario tocó) para que la web dibuje el anillo sobre el piso
                // detectado. Sin esta señal el usuario ancla a ciegas.
                if (timestampReticleNs == 0
                        || frame.getTimestamp() - timestampReticleNs >= RETICLE_INTERVAL_NS) {
                    timestampReticleNs = frame.getTimestamp();
                    emitReticle(frame);
                }

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
                PluginCall camCall = pendingCameraAnchorCall;
                pendingCameraAnchorCall = null;
                if (camCall != null) {
                    camCall.reject("Error creando el anchor: " + error.getMessage());
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

        replaceAnchors(anchor);
        anchorCall.resolve(anchorResult(anchor));
    }

    private void resolvePendingCameraAnchor(Camera camera) {
        PluginCall camCall = pendingCameraAnchorCall;
        if (camCall == null) return;
        pendingCameraAnchorCall = null;

        try {
            // Pose de la cámara, pero alineada al mundo (sin heredar su rotación):
            // el modelo se orienta luego por GPS/brújula, no por cómo sostienes el celular.
            Pose camPose = camera.getPose();
            Pose worldAligned = new Pose(camPose.getTranslation(), new float[] { 0f, 0f, 0f, 1f });
            Anchor anchor = session.createAnchor(worldAligned);
            replaceAnchors(anchor);
            camCall.resolve(anchorResult(anchor));
        } catch (Exception error) {
            camCall.reject("No se pudo anclar en la camara: " + error.getMessage());
        }
    }

    private void replaceAnchors(Anchor anchor) {
        for (Anchor oldAnchor : anchors) oldAnchor.detach();
        anchors.clear();
        anchors.add(anchor);
    }

    private JSObject anchorResult(Anchor anchor) {
        float[] matrix = new float[16];
        anchor.getPose().toMatrix(matrix, 0);
        JSObject result = new JSObject();
        result.put("anchorId", "0");
        result.put("matrix", floatsToJsonArray(matrix));
        return result;
    }

    private long timestampReticleNs = 0;
    private static final long RETICLE_INTERVAL_NS = 100_000_000L;  // 10 Hz basta
    private float aimX = -1f;
    private float aimY = -1f;

    /**
     * Enciende o apaga la malla de escaneo. Se apaga al colocar el modelo: una
     * vez anclado, la rejilla solo ensucia la vista de la obra.
     */
    @PluginMethod
    public void setPlanesVisible(PluginCall call) {
        showPlanes = call.getBoolean("visible", Boolean.TRUE);
        call.resolve();
    }

    /** Punto de mira en pixeles de pantalla; negativo = centro. */
    @PluginMethod
    public void setAimPoint(PluginCall call) {
        aimX = call.getFloat("x", -1f);
        aimY = call.getFloat("y", -1f);
        call.resolve();
    }

    /** Emite {found, matrix, type} del hit-test en el punto de mira. */
    private void emitReticle(Frame frame) {
        if (viewportWidth <= 0 || viewportHeight <= 0) return;
        float px = (aimX >= 0f) ? aimX : viewportWidth * 0.5f;
        float py = (aimY >= 0f) ? aimY : viewportHeight * 0.5f;
        JSObject payload = new JSObject();
        // Cuantas superficies de piso hay reconocidas: con esto la web decide si
        // ya puede colocar sola el modelo o hay que seguir barriendo el terreno.
        payload.put("planes", floorPlanesVisible);
        try {
            HitResult best = pickHit(frame.hitTest(px, py));
            if (best == null) {
                payload.put("found", false);
            } else {
                Pose hp = best.getHitPose();
                Pose flat = new Pose(hp.getTranslation(), new float[] { 0f, 0f, 0f, 1f });
                float[] m = new float[16];
                flat.toMatrix(m, 0);
                payload.put("found", true);
                payload.put("matrix", floatsToJsonArray(m));
                payload.put("type", (best.getTrackable() instanceof Plane) ? "plane" : "point");
            }
        } catch (Throwable t) {
            payload.put("found", false);
        }
        notifyListeners("onReticle", payload);
    }

    /** Mejor candidato: plano horizontal dentro del polígono; si no, punto. */
    private HitResult pickHit(List<HitResult> hits) {
        HitResult pointFallback = null;
        for (HitResult hit : hits) {
            Trackable trackable = hit.getTrackable();
            if (trackable instanceof Plane) {
                Plane plane = (Plane) trackable;
                if (plane.getTrackingState() == TrackingState.TRACKING
                        && plane.getType() == Plane.Type.HORIZONTAL_UPWARD_FACING
                        && plane.isPoseInPolygon(hit.getHitPose())) {
                    return hit;
                }
            } else if (trackable instanceof Point
                    && trackable.getTrackingState() == TrackingState.TRACKING
                    && pointFallback == null) {
                pointFallback = hit;
            }
        }
        return pointFallback;
    }

    private Anchor createAnchorFromCenterHit(Frame frame) {
        if (viewportWidth <= 0 || viewportHeight <= 0) return null;

        // Ancla DONDE APUNTA el retículo (centro, o el punto que tocó el
        // usuario vía setAimPoint): lo que ves es donde cae el modelo.
        float px = (aimX >= 0f) ? aimX : viewportWidth * 0.5f;
        float py = (aimY >= 0f) ? aimY : viewportHeight * 0.5f;
        HitResult best = pickHit(frame.hitTest(px, py));
        return best != null ? createWorldAlignedAnchor(best) : null;
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
        stopGeoSensors();
        PluginCall anchorCall = pendingAnchorCall;
        pendingAnchorCall = null;
        if (anchorCall != null) {
            anchorCall.reject("La sesion AR termino antes de crear el anchor");
        }
        PluginCall camCall = pendingCameraAnchorCall;
        pendingCameraAnchorCall = null;
        if (camCall != null) {
            camCall.reject("La sesion AR termino antes de crear el anchor");
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
            if (originalWindowBackground != null) {
                try {
                    getActivity().getWindow().setBackgroundDrawable(originalWindowBackground);
                } catch (Exception ignored) { }
                originalWindowBackground = null;
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
        frameCount = 0L;
        lastStatsMs = 0L;
        glError = "";
        textureReady = false;
        lastState = null;
        planeRenderer = null;
        showPlanes = true;
        floorPlanesVisible = 0;
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
