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
    // UN solo ejemplar en escena: cada toque REUBICA (antes cada tap apilaba
    // otra copia y el usuario lo percibia como "el modelo se movio").
    private AnchorNode ancla = null;
    private com.google.ar.sceneform.Node nodoModelo = null;
    private float factorMaqueta = 1f;   // 1 = obra real; 0.01 = 1:100; 0.005 = 1:200
    private android.widget.TextView avisoTracking = null;   // cacheado: el guardian corre por frame

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
            // AUDITORIA ar-54: near quedo en el 0.01 de fabrica al subir far a
            // 150 — razon near:far de 15,000 y el z-buffer pierde precision a
            // distancia: las FRANJAS NEGRAS sobre caras coplanares del DWG son
            // eso. near 0.05 la recorta 5x sin estorbar (nadie pega la tablet
            // a 5 cm de un muro virtual).
            arSceneView.getScene().getCamera().setNearClipPlane(0.05f);
            arSceneView.getScene().getCamera().setFarClipPlane(150f);
            vestirMallaDeEscaneo(arSceneView);
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
            // AUDITORIA ar-54: con el modelo colocado y sano, un roce en la
            // pantalla re-anclaba EN SILENCIO — el modelo "saltaba" sin que
            // nadie supiera por que. Reubicar es un acto deliberado: primero
            // QUITAR (o que el ancla salga de zona), despues tocar.
            if (nodoModelo != null && nodoModelo.isEnabled()) {
                Toast.makeText(this, "Modelo colocado. Para reubicarlo: QUITAR y toca de nuevo.",
                        Toast.LENGTH_SHORT).show();
                return;
            }
            quitarModelo();
            Anchor anchor = hit.createAnchor();
            ancla = new AnchorNode(anchor);
            ancla.setParent(arFragment.getArSceneView().getScene());
            if (modeloPropio) {
                // Modelo de obra: sin gestos que lo arrastren sin querer. La
                // escala la mandan los chips (1:1 sagrado por defecto).
                nodoModelo = new com.google.ar.sceneform.Node();
                nodoModelo.setParent(ancla);
                nodoModelo.setRenderable(modelo);
                aplicarEscala();
            } else {
                TransformableNode nodo = new TransformableNode(arFragment.getTransformationSystem());
                nodo.setParent(ancla);
                nodo.setRenderable(modelo);
                nodo.select();
                nodoModelo = nodo;
            }
            // Modelo colocado: la malla de escaneo ya cumplio (asi lo hace
            // Augin). La deteccion SIGUE corriendo por debajo — un toque
            // nuevo re-ancla — pero sin ensuciar la vista de obra.
            ponerMallaVisible(false);
        });

        // GUARDIAN DE TRACKING. Si ARCore pierde el mapa, la camara virtual se
        // congela mientras el operario sigue caminando: todo lo virtual queda
        // pegado a la pantalla ("el modelo me sigue" tras caminar lejos en
        // 1:1). Fingir que no paso es de amateur; lo profesional es ocultar el
        // modelo, decir POR QUE y como recuperar. Al relocalizar, todo vuelve.
        arFragment.getArSceneView().getScene().addOnUpdateListener(ft -> {
            com.google.ar.core.Frame frame = arFragment.getArSceneView().getArFrame();
            if (frame == null) return;
            boolean camaraOk = frame.getCamera().getTrackingState()
                    == com.google.ar.core.TrackingState.TRACKING;
            boolean anclaOk = ancla == null || ancla.getAnchor() == null
                    || ancla.getAnchor().getTrackingState() == com.google.ar.core.TrackingState.TRACKING;
            String aviso = null;
            if (!camaraOk) {
                aviso = "Se perdio el rastreo — vuelve sobre tus pasos y barre despacio la zona donde anclaste";
            } else if (!anclaOk) {
                aviso = "Saliste de la zona del ancla — toca la malla para re-anclar el tramo AQUI";
            }
            boolean visible = aviso == null;
            if (nodoModelo != null && nodoModelo.isEnabled() != visible) {
                nodoModelo.setEnabled(visible);
                if (!visible && !anclaOk) ponerMallaVisible(true);   // que pueda re-anclar
                // AUDITORIA ar-54: al RECUPERAR el ancla la malla se quedaba
                // encendida sobre el modelo ya colocado — se apaga de vuelta.
                if (visible) ponerMallaVisible(false);
            }
            if (avisoTracking == null) avisoTracking = findViewById(R.id.aviso_tracking);
            if (avisoTracking != null) {
                if (aviso == null && avisoTracking.getVisibility() == android.view.View.VISIBLE) {
                    avisoTracking.setVisibility(android.view.View.GONE);
                } else if (aviso != null) {
                    avisoTracking.setText(aviso);
                    avisoTracking.setVisibility(android.view.View.VISIBLE);
                }
            }
        });

        // Chips de escala + Quitar. En 1:1 el GLB va con el techo del cajon en
        // y=0: anclas al piso y la red queda ENTERRADA bajo tus pies (donde
        // esta la real). En maqueta eso dejaria un modelo microscopico bajo la
        // loseta: se LEVANTA para que repose SOBRE el piso, como en Augin.
        wireEscala(R.id.btn_escala_real, 1f, "Escala real 1:1 — la red queda bajo tus pies");
        wireEscala(R.id.btn_escala_100, 0.01f, "Maqueta 1:100 sobre el piso");
        wireEscala(R.id.btn_escala_200, 0.005f, "Maqueta 1:200 sobre el piso");
        findViewById(R.id.btn_quitar).setOnClickListener(v -> quitarModelo());
    }

    private void wireEscala(int idBoton, float factor, String aviso) {
        findViewById(idBoton).setOnClickListener(v -> {
            factorMaqueta = factor;
            pintarChips(idBoton);
            aplicarEscala();
            Toast.makeText(this, aviso, Toast.LENGTH_SHORT).show();
        });
    }

    private void pintarChips(int activo) {
        int[] ids = { R.id.btn_escala_real, R.id.btn_escala_100, R.id.btn_escala_200 };
        for (int id : ids) {
            android.widget.Button b = findViewById(id);
            b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(
                    id == activo ? 0xFF2E6BE6 : 0xFF3A3A46));
        }
    }

    /** Escala el ejemplar vivo (si lo hay) y lo apoya donde corresponde:
     *  1:1 pegado al ancla (enterrado por diseno del GLB); maqueta levantada
     *  para que su punto MAS BAJO toque el piso. */
    private void aplicarEscala() {
        if (nodoModelo == null || modelo == null) return;
        float e = escala * factorMaqueta;
        nodoModelo.setLocalScale(new com.google.ar.sceneform.math.Vector3(e, e, e));
        float alzado = 0f;
        if (factorMaqueta < 1f) {
            com.google.ar.sceneform.collision.CollisionShape forma = modelo.getCollisionShape();
            if (forma instanceof com.google.ar.sceneform.collision.Box) {
                com.google.ar.sceneform.collision.Box caja = (com.google.ar.sceneform.collision.Box) forma;
                float fondo = caja.getCenter().y - caja.getSize().y / 2f;   // y minimo local
                alzado = -fondo * e;
            }
        }
        nodoModelo.setLocalPosition(new com.google.ar.sceneform.math.Vector3(0f, alzado, 0f));
    }

    private void quitarModelo() {
        if (ancla != null) {
            try {
                if (ancla.getAnchor() != null) ancla.getAnchor().detach();
                arFragment.getArSceneView().getScene().removeChild(ancla);
            } catch (Throwable ignored) { }
            ancla = null;
            nodoModelo = null;
        }
        ponerMallaVisible(true);   // sin modelo, el escaneo vuelve a mandar
    }

    /** Malla de escaneo + manita de instrucciones: visibles solo mientras NO
     *  hay modelo colocado. La deteccion de planos nunca se detiene. */
    private void ponerMallaVisible(boolean visible) {
        try {
            arFragment.getArSceneView().getPlaneRenderer().setVisible(visible);
            if (arFragment.getInstructionsController() != null)
                arFragment.getInstructionsController().setEnabled(visible);
        } catch (Throwable ignored) { }
    }

    /** La malla de escaneo profesional (estilo Augin): rejilla triangulada
     *  fina con puntos en los vertices, tenida de cian, visible en TODO el
     *  plano (no solo el circulo alrededor de la mira). La textura se dibuja
     *  aqui mismo en un Bitmap: sin assets nuevos que empaquetar. */
    private void vestirMallaDeEscaneo(com.google.ar.sceneform.ArSceneView vista) {
        try {
            android.graphics.Bitmap bmp = android.graphics.Bitmap.createBitmap(
                    256, 256, android.graphics.Bitmap.Config.ARGB_8888);
            android.graphics.Canvas c = new android.graphics.Canvas(bmp);
            android.graphics.Paint linea = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
            linea.setColor(0x66FFFFFF);
            linea.setStrokeWidth(2f);
            android.graphics.Paint punto = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
            punto.setColor(0xFFFFFFFF);
            // Celda de 128 px repetida 2x2: lados + una diagonal = triangulos.
            for (int i = 0; i <= 2; i++) {
                c.drawLine(0, i * 128, 256, i * 128, linea);
                c.drawLine(i * 128, 0, i * 128, 256, linea);
            }
            c.drawLine(0, 0, 256, 256, linea);
            c.drawLine(128, 0, 256, 128, linea);
            c.drawLine(0, 128, 128, 256, linea);
            for (int x = 0; x <= 2; x++)
                for (int y = 0; y <= 2; y++)
                    c.drawCircle(x * 128, y * 128, 7f, punto);

            com.google.ar.sceneform.rendering.Texture.Sampler sampler =
                    com.google.ar.sceneform.rendering.Texture.Sampler.builder()
                            .setWrapMode(com.google.ar.sceneform.rendering.Texture.Sampler.WrapMode.REPEAT)
                            .build();
            com.google.ar.sceneform.rendering.Texture.builder()
                    .setSource(bmp)
                    .setSampler(sampler)
                    .build()
                    .thenAccept(tex -> vista.getPlaneRenderer().getMaterial().thenAccept(mat -> {
                        mat.setTexture(com.google.ar.sceneform.rendering.PlaneRenderer.MATERIAL_TEXTURE, tex);
                        mat.setFloat3(com.google.ar.sceneform.rendering.PlaneRenderer.MATERIAL_COLOR,
                                new com.google.ar.sceneform.rendering.Color(0.35f, 0.85f, 1f, 1f));
                        // El foco por defecto solo ilumina ~0.5 m alrededor de
                        // la mira; 15 m = se ve el plano completo detectado.
                        mat.setFloat(com.google.ar.sceneform.rendering.PlaneRenderer.MATERIAL_SPOTLIGHT_RADIUS, 15f);
                    }));
        } catch (Throwable t) {
            // Cosmetico: si algo falla se queda la malla por defecto.
        }
    }
}
