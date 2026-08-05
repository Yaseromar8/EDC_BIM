package com.visoraps.app;

import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.google.ar.core.Anchor;
import com.google.ar.core.HitResult;
import com.google.ar.core.Plane;
import com.google.ar.sceneform.AnchorNode;
import com.google.ar.sceneform.rendering.ModelRenderable;
import com.google.ar.sceneform.ux.ArFragment;
import com.google.ar.sceneform.ux.TransformableNode;

/**
 * FASE 2 — BALA 1: el motor nativo de verdad (Filament + ARCore en un solo
 * bucle, el patron de Augin/Dalux/Revizto), como actividad de VALIDACION.
 *
 * El gesto es el que pidio el usuario con la captura de Augin en la mano:
 * ARCore detecta la malla, TOCAS cualquier punto de esa malla y el modelo
 * aparece ahi, anclado por un Anchor real del motor. Pellizcas para escalar,
 * arrastras para mover, un dedo circular para girar (TransformableNode lo da
 * gratis) y lo RODEAS caminando.
 *
 * Si este modelo de muestra queda clavado como en Augin (lo estara: es su
 * mismo stack), la decision esta tomada: el AR definitivo se renderiza aqui,
 * con los tramos exportados a glTF, y el WebView queda solo como interfaz.
 * Nuestra calibracion por esquina (matematica ya probada) se conserva: su
 * salida pasa a ser el transform del nodo respecto al ancla.
 */
public class ArNativoActivity extends AppCompatActivity {

    // Modelo de muestra publico de Google (~4 MB). Solo para validar fijeza:
    // el contenido da igual, lo que se juzga es que quede CLAVADO al mundo.
    private static final String GLB =
            "https://storage.googleapis.com/ar-answers-in-search-models/static/Tiger/model.glb";

    private ArFragment arFragment;
    private ModelRenderable modelo;
    private float escala = 1f;
    private boolean modeloPropio = false;

    /** Los GLB sin esquema http(s) viajan DENTRO del APK (assets/): en obra no
     *  hay internet. Filament necesita un archivo real, asi que se copia una
     *  vez a cache y se carga con file:// — cero adivinanza de esquemas raros. */
    private Uri resolverFuente(String url) throws java.io.IOException {
        if (url.startsWith("http://") || url.startsWith("https://")) return Uri.parse(url);
        java.io.File destino = new java.io.File(getCacheDir(),
                url.replace('/', '_'));
        try (java.io.InputStream in = getAssets().open(url);
             java.io.OutputStream out = new java.io.FileOutputStream(destino)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
        return Uri.fromFile(destino);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // CAJA NEGRA: si el motor revienta (en el arranque O en el hilo GL de
        // Filament), el stack queda guardado ANTES de morir y 'Ver log nativo'
        // lo ensena como primera linea. Un crash con nombre es un arreglo de
        // un solo tiro; un 'me boto del visor' son tres rondas de adivinanza.
        final android.content.SharedPreferences prefs =
                getSharedPreferences("ar_diag", MODE_PRIVATE);
        final Thread.UncaughtExceptionHandler previo =
                Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((hilo, error) -> {
            try {
                prefs.edit().putString("crash_nativo",
                        android.util.Log.getStackTraceString(error)).commit();
            } catch (Throwable ignored) { }
            if (previo != null) previo.uncaughtException(hilo, error);
        });

        try {
            setContentView(R.layout.activity_ar_nativo);
            arFragment = (ArFragment) getSupportFragmentManager().findFragmentById(R.id.ar_fragment);
        } catch (Throwable t) {
            try {
                prefs.edit().putString("crash_nativo",
                        android.util.Log.getStackTraceString(t)).commit();
            } catch (Throwable ignored) { }
            Toast.makeText(this, "Motor nativo fallo al arrancar: "
                    + String.valueOf(t.getMessage()), Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        // SIN ESTIMACION DE LUZ HDR. La caja negra cazo el crash exacto:
        // Sceneform 1.23 llama acquireEnvironmentalHdrCubeMap() con la firma
        // del ARCore viejo (ArImage[]), que en el 1.46 ya no existe ->
        // NoSuchMethodError en el PRIMER fotograma. La ruta solo corre en modo
        // ENVIRONMENTAL_HDR (iluminacion cosmetica): con AMBIENT_INTENSITY el
        // metodo fantasma jamas se invoca. Bajar ARCore no es opcion: la
        // linterna usa Config.FlashMode (1.42+).
        arFragment.setOnSessionConfigurationListener((session, config) ->
                config.setLightEstimationMode(
                        com.google.ar.core.Config.LightEstimationMode.AMBIENT_INTENSITY));
        // lightEstimationConfig es propiedad de EXTENSION de Kotlin, no metodo
        // de ArSceneView: desde Java se llama por su clase contenedora estatica
        // (firma verificada con javap sobre el jar de core-1.23.0).
        arFragment.setOnViewCreatedListener((arSceneView) -> {
            com.gorisse.thomas.sceneform.ArSceneViewKt.setLightEstimationConfig(
                    arSceneView,
                    com.gorisse.thomas.sceneform.light.LightEstimationConfig.AMBIENT_INTENSITY);
            // Sceneform recorta el render a 30 m por defecto (far plane): en un
            // modelo de obra las partes lejanas aparecian/desaparecian al girar
            // — la "desorientacion" reportada en ar-50. 150 m cubre el tramo.
            arSceneView.getScene().getCamera().setFarClipPlane(150f);
        });

        // BALA 2: el modelo REAL. La web manda url + escala por el Intent;
        // sin url cae al tigre de validacion.
        String glbUrl = getIntent().getStringExtra("glbUrl");
        escala = getIntent().getFloatExtra("escala", 1f);
        modeloPropio = glbUrl != null && !glbUrl.isEmpty();
        final String fuente = modeloPropio ? glbUrl : GLB;

        Uri uriFuente;
        try {
            uriFuente = resolverFuente(fuente);
        } catch (Throwable t) {
            Toast.makeText(this, "No se encontro el modelo " + fuente + ": "
                    + String.valueOf(t.getMessage()), Toast.LENGTH_LONG).show();
            uriFuente = Uri.parse(GLB);
            modeloPropio = false;
        }

        ModelRenderable.builder()
                .setSource(this, uriFuente)
                .setIsFilamentGltf(true)
                .setAsyncLoadEnabled(true)
                .build()
                .thenAccept(renderable -> {
                    modelo = renderable;
                    Toast.makeText(this,
                            modeloPropio
                                    ? "MODELO DE OBRA listo (1:1). Barre el piso y TOCA la malla: quedaras PARADO DENTRO del modelo."
                                    : "Modelo listo. Barre el piso y TOCA la malla para colocarlo.",
                            Toast.LENGTH_LONG).show();
                })
                .exceptionally(t -> {
                    Toast.makeText(this,
                            "No se pudo cargar el modelo: " + t.getMessage(),
                            Toast.LENGTH_LONG).show();
                    return null;
                });

        arFragment.setOnTapArPlaneListener((HitResult hit, Plane plane, android.view.MotionEvent ev) -> {
            if (modelo == null) {
                Toast.makeText(this, "El modelo aun esta cargando…", Toast.LENGTH_SHORT).show();
                return;
            }
            Anchor anchor = hit.createAnchor();
            AnchorNode anchorNode = new AnchorNode(anchor);
            anchorNode.setParent(arFragment.getArSceneView().getScene());
            if (modeloPropio) {
                // Modelo de obra: escala FIJA (1:1 es sagrado — sin pellizco) y
                // sin gestos que lo arrastren sin querer. El GLB ya viene con
                // la planta centrada y el techo del cajon en y=0: al anclar en
                // el piso, la estructura queda ENTERRADA bajo tus pies, que es
                // donde esta la red de drenaje real.
                com.google.ar.sceneform.Node nodo = new com.google.ar.sceneform.Node();
                nodo.setParent(anchorNode);
                nodo.setLocalScale(new com.google.ar.sceneform.math.Vector3(escala, escala, escala));
                nodo.setRenderable(modelo);
            } else {
                TransformableNode nodo = new TransformableNode(arFragment.getTransformationSystem());
                nodo.setParent(anchorNode);
                nodo.setRenderable(modelo);
                nodo.select();
            }
        });
    }
}
