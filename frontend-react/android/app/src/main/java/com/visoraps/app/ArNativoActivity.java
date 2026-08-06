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
    // Nodo intermedio ancla→ajuste→modelo: acumula los ajustes de campo
    // (mover/girar/cota) sin pelearse con la escala/alzado del nodo modelo.
    private com.google.ar.sceneform.Node nodoAjuste = null;
    private float factorMaqueta = 1f;   // 1 = obra real; 0.01 = 1:100; 0.005 = 1:200
    private float pasoMetros = 0.1f;    // paso del ajuste de campo: 1 / 0.1 / 0.01
    private android.widget.TextView avisoTracking = null;   // cacheado: el guardian corre por frame

    // ── ESTACION LIBRE (AR georreferenciado por puntos de control) ──────
    // Los datos vienen de la PLATAFORMA via Intent: nada incrustado aqui.
    private final java.util.List<GeoCalibrador.PuntoControl> puntosControl = new java.util.ArrayList<>();
    private final GeoCalibrador calibrador = new GeoCalibrador();
    private GeoCalibrador.Semejanza glbAUtm = null;   // amarre(svf→UTM) ∘ sidecar(glb→svf)

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
            vigilarTracking(arSceneView);
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
                nodoAjuste = new com.google.ar.sceneform.Node();
                nodoAjuste.setParent(ancla);
                nodoModelo = new com.google.ar.sceneform.Node();
                nodoModelo.setParent(nodoAjuste);
                nodoModelo.setRenderable(modelo);
                aplicarEscala();
                android.view.View barra = findViewById(R.id.barra_ajuste);
                if (barra != null) barra.setVisibility(android.view.View.VISIBLE);
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

        // (el guardian de tracking se registra en vigilarTracking(), llamado
        // desde el listener de vista creada: registrarlo aqui directo era el
        // crash de ar-53/55 — ver comentario alla)
        // Chips de escala + Quitar. En 1:1 el GLB va con el techo del cajon en
        // y=0: anclas al piso y la red queda ENTERRADA bajo tus pies (donde
        // esta la real). En maqueta eso dejaria un modelo microscopico bajo la
        // loseta: se LEVANTA para que repose SOBRE el piso, como en Augin.
        wireEscala(R.id.btn_escala_real, 1f, "Escala real 1:1 — la red queda bajo tus pies");
        wireEscala(R.id.btn_escala_100, 0.01f, "Maqueta 1:100 sobre el piso");
        wireEscala(R.id.btn_escala_200, 0.005f, "Maqueta 1:200 sobre el piso");
        findViewById(R.id.btn_quitar).setOnClickListener(v -> quitarModelo());

        prepararEstacionLibre();

        // AJUSTE DE CAMPO. Mover es relativo a COMO MIRA el operario (▲ aleja
        // en la direccion de la vista, ◀▶ de lado): en obra nadie piensa en
        // ejes del modelo. Girar pivota sobre el punto anclado. Todo con paso
        // conocido — esto es referenciar, no decorar.
        findViewById(R.id.btn_mov_lejos).setOnClickListener(v -> moverCampo(0, 1));
        findViewById(R.id.btn_mov_cerca).setOnClickListener(v -> moverCampo(0, -1));
        findViewById(R.id.btn_mov_izq).setOnClickListener(v -> moverCampo(-1, 0));
        findViewById(R.id.btn_mov_der).setOnClickListener(v -> moverCampo(1, 0));
        findViewById(R.id.btn_subir).setOnClickListener(v -> moverCota(1));
        findViewById(R.id.btn_bajar).setOnClickListener(v -> moverCota(-1));
        findViewById(R.id.btn_girar_izq).setOnClickListener(v -> girarCampo(1));
        findViewById(R.id.btn_girar_der).setOnClickListener(v -> girarCampo(-1));
        findViewById(R.id.btn_paso).setOnClickListener(v -> {
            pasoMetros = pasoMetros > 0.5f ? 0.1f : pasoMetros > 0.05f ? 0.01f : 1f;
            ((android.widget.Button) v).setText(etiquetaPaso());
        });
    }

    private String etiquetaPaso() {
        return pasoMetros >= 1f ? "paso: 1 m" : pasoMetros >= 0.1f ? "paso: 10 cm" : "paso: 1 cm";
    }

    /** Grados por toque, proporcionales al paso: grueso 2°, medio 0.5°, fino 0.1°. */
    private float gradosPaso() {
        return pasoMetros >= 1f ? 2f : pasoMetros >= 0.1f ? 0.5f : 0.1f;
    }

    /** Mueve el modelo en el plano horizontal, relativo a la vista del
     *  operario: adelante = a donde miras, proyectado al plano del suelo. */
    private void moverCampo(int lado, int frente) {
        if (nodoAjuste == null) return;
        com.google.ar.sceneform.Camera cam = arFragment.getArSceneView().getScene().getCamera();
        com.google.ar.sceneform.math.Vector3 f = cam.getForward();
        f.y = 0;
        if (f.length() < 1e-4) return;   // mirando al cenit: sin direccion util
        f = f.normalized();
        com.google.ar.sceneform.math.Vector3 der =
                com.google.ar.sceneform.math.Vector3.cross(f, com.google.ar.sceneform.math.Vector3.up()).normalized();
        com.google.ar.sceneform.math.Vector3 delta = com.google.ar.sceneform.math.Vector3.add(
                f.scaled(frente * pasoMetros), der.scaled(lado * pasoMetros));
        nodoAjuste.setWorldPosition(com.google.ar.sceneform.math.Vector3.add(
                nodoAjuste.getWorldPosition(), delta));
    }

    private void moverCota(int signo) {
        if (nodoAjuste == null) return;
        nodoAjuste.setWorldPosition(com.google.ar.sceneform.math.Vector3.add(
                nodoAjuste.getWorldPosition(),
                new com.google.ar.sceneform.math.Vector3(0, signo * pasoMetros, 0)));
    }

    /** Gira alrededor de la vertical que pasa por el punto de ajuste (donde
     *  el operario anclo y esta parado): asi se orienta un tramo en campo. */
    private void girarCampo(int signo) {
        if (nodoAjuste == null) return;
        com.google.ar.sceneform.math.Quaternion giro =
                com.google.ar.sceneform.math.Quaternion.axisAngle(
                        com.google.ar.sceneform.math.Vector3.up(), signo * gradosPaso());
        nodoAjuste.setLocalRotation(com.google.ar.sceneform.math.Quaternion.multiply(
                giro, nodoAjuste.getLocalRotation()));
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
            nodoAjuste = null;
        }
        android.view.View barra = findViewById(R.id.barra_ajuste);
        if (barra != null) barra.setVisibility(android.view.View.GONE);
        ponerMallaVisible(true);   // sin modelo, el escaneo vuelve a mandar
    }

    /** ESTACION LIBRE. Parsea puntos de control + amarre del Intent, compone
     *  la cadena glb→UTM con el sidecar del GLB, y arma la barra de medicion.
     *  Con 2+ puntos medidos el modelo aparece georreferenciado SOLO — sin
     *  tocar la malla — con su cierre visible. Re-medir re-referencia. */
    private void prepararEstacionLibre() {
        try {
            String puntosJson = getIntent().getStringExtra("puntosJson");
            String amarreJson = getIntent().getStringExtra("amarreJson");
            String glbUrl = getIntent().getStringExtra("glbUrl");
            if (puntosJson == null || puntosJson.isEmpty()
                    || amarreJson == null || amarreJson.isEmpty()
                    || glbUrl == null || glbUrl.startsWith("http")) return;

            org.json.JSONArray arr = new org.json.JSONArray(puntosJson);
            for (int i = 0; i < arr.length(); i++) {
                org.json.JSONObject p = arr.getJSONObject(i);
                puntosControl.add(new GeoCalibrador.PuntoControl(
                        p.getString("id"), p.getDouble("e"), p.getDouble("n"),
                        p.optDouble("z", 0)));
            }
            if (puntosControl.isEmpty()) return;

            // amarre: svf(mundo del visor) → UTM, calculado y guardado en la web
            org.json.JSONObject am = new org.json.JSONObject(amarreJson);
            GeoCalibrador.Semejanza svfAUtm = new GeoCalibrador.Semejanza();
            svfAUtm.escala = am.getDouble("escala");
            svfAUtm.yawRad = Math.toRadians(am.getDouble("yawDeg"));
            svfAUtm.tx = am.getDouble("tx");
            svfAUtm.ty = am.getDouble("ty");
            svfAUtm.tz = am.getDouble("tz");

            // sidecar del GLB: p_glb = Ryup(0.3048·p_svf) + off →
            // en el plano (x,−z): glb2 = 0.3048·svf2 + (offx, −offz); cota: y = 0.3048·z_svf + offy
            String sidecarAsset = glbUrl.replace(".glb", ".geo.json");
            org.json.JSONObject sc;
            try (java.io.InputStream in = getAssets().open(sidecarAsset)) {
                byte[] buf = new byte[in.available()];
                int leidos = in.read(buf);
                sc = new org.json.JSONObject(new String(buf, 0, Math.max(leidos, 0), "UTF-8"));
            }
            org.json.JSONArray off = sc.getJSONArray("off");
            double s3 = sc.getDouble("escalaSvf");
            GeoCalibrador.Semejanza svfAGlb = new GeoCalibrador.Semejanza();
            svfAGlb.escala = s3;
            svfAGlb.yawRad = 0;
            svfAGlb.tx = off.getDouble(0);
            svfAGlb.ty = -off.getDouble(2);
            svfAGlb.tz = off.getDouble(1);
            glbAUtm = svfAUtm.componer(svfAGlb.inversa());

            // UI: spinner de puntos + reticula + boton Medir
            android.widget.Spinner sel = findViewById(R.id.sel_punto);
            java.util.List<String> ids = new java.util.ArrayList<>();
            for (GeoCalibrador.PuntoControl p : puntosControl) ids.add(p.id);
            android.widget.ArrayAdapter<String> ad = new android.widget.ArrayAdapter<>(
                    this, android.R.layout.simple_spinner_dropdown_item, ids);
            sel.setAdapter(ad);
            findViewById(R.id.barra_medicion).setVisibility(android.view.View.VISIBLE);
            findViewById(R.id.reticula_geo).setVisibility(android.view.View.VISIBLE);
            findViewById(R.id.btn_medir).setOnClickListener(v -> medirPuntoActual());
            Toast.makeText(this, puntosControl.size()
                    + " puntos de control del proyecto. Parate sobre uno, apunta la cruz a la marca y MIDE.",
                    Toast.LENGTH_LONG).show();
        } catch (Throwable t) {
            Toast.makeText(this, "Estacion libre no disponible: "
                    + String.valueOf(t.getMessage()), Toast.LENGTH_LONG).show();
        }
    }

    /** Hit-test en la cruz central → posicion AR de la marca → re-ajuste. */
    private void medirPuntoActual() {
        try {
            com.google.ar.core.Frame frame = arFragment.getArSceneView().getArFrame();
            if (frame == null || frame.getCamera().getTrackingState()
                    != com.google.ar.core.TrackingState.TRACKING) {
                Toast.makeText(this, "Sin rastreo: barre el piso un momento y reintenta", Toast.LENGTH_SHORT).show();
                return;
            }
            android.view.View vista = arFragment.getArSceneView();
            java.util.List<com.google.ar.core.HitResult> hits =
                    frame.hitTest(vista.getWidth() / 2f, vista.getHeight() / 2f);
            com.google.ar.core.HitResult mejor = null;
            for (com.google.ar.core.HitResult h : hits) {
                if (h.getTrackable() instanceof Plane
                        && ((Plane) h.getTrackable()).isPoseInPolygon(h.getHitPose())) { mejor = h; break; }
                if (mejor == null) mejor = h;
            }
            if (mejor == null) {
                Toast.makeText(this, "La cruz no toca superficie detectada: barre el piso alrededor de la marca", Toast.LENGTH_SHORT).show();
                return;
            }
            android.widget.Spinner sel = findViewById(R.id.sel_punto);
            int idx = sel.getSelectedItemPosition();
            if (idx < 0 || idx >= puntosControl.size()) return;
            GeoCalibrador.PuntoControl pc = puntosControl.get(idx);
            com.google.ar.core.Pose pose = mejor.getHitPose();
            calibrador.medir(pc, pose.tx(), pose.ty(), pose.tz());

            android.widget.TextView estado = findViewById(R.id.txt_geo_estado);
            GeoCalibrador.Resultado res = calibrador.resolver();
            if (res == null) {
                estado.setText(calibrador.cuantasMediciones() + " medido · falta 1 más");
                Toast.makeText(this, pc.id + " medido. Camina al siguiente punto y mide.", Toast.LENGTH_SHORT).show();
                return;
            }
            estado.setText("cierre " + Math.round(res.rmsM * 100) + " cm (" + res.detalle + ")");
            colocarGeorreferenciado(res, pose);
        } catch (Throwable t) {
            Toast.makeText(this, "No se pudo medir: " + String.valueOf(t.getMessage()), Toast.LENGTH_SHORT).show();
        }
    }

    /** Cuelga el modelo de un ancla en el ultimo punto medido y le pone la
     *  transformacion glb→AR compuesta. Re-medir = re-referenciar en vivo. */
    private void colocarGeorreferenciado(GeoCalibrador.Resultado res, com.google.ar.core.Pose poseAncla) {
        if (modelo == null || glbAUtm == null) {
            Toast.makeText(this, "El modelo aun esta cargando…", Toast.LENGTH_SHORT).show();
            return;
        }
        quitarModelo();
        GeoCalibrador.Semejanza glbAAr = res.utmAAr.componer(glbAUtm);

        Anchor anchor = arFragment.getArSceneView().getSession()
                .createAnchor(com.google.ar.core.Pose.makeTranslation(
                        poseAncla.tx(), poseAncla.ty(), poseAncla.tz()));
        ancla = new AnchorNode(anchor);
        ancla.setParent(arFragment.getArSceneView().getScene());
        nodoAjuste = new com.google.ar.sceneform.Node();
        nodoAjuste.setParent(ancla);
        nodoModelo = new com.google.ar.sceneform.Node();
        nodoModelo.setParent(nodoAjuste);
        nodoModelo.setRenderable(modelo);

        // Mundo AR: posicion (tx, tz_cota, −ty) y giro yaw sobre la vertical.
        nodoAjuste.setWorldPosition(new com.google.ar.sceneform.math.Vector3(
                (float) glbAAr.tx, (float) glbAAr.tz, (float) -glbAAr.ty));
        nodoAjuste.setWorldRotation(com.google.ar.sceneform.math.Quaternion.axisAngle(
                com.google.ar.sceneform.math.Vector3.up(), (float) Math.toDegrees(glbAAr.yawRad)));
        float e = (float) glbAAr.escala;
        nodoModelo.setLocalScale(new com.google.ar.sceneform.math.Vector3(e, e, e));

        android.view.View barra = findViewById(R.id.barra_ajuste);
        if (barra != null) barra.setVisibility(android.view.View.VISIBLE);
        ponerMallaVisible(false);
        Toast.makeText(this, "Modelo georreferenciado · cierre " + Math.round(res.rmsM * 100)
                + " cm. Re-mide cualquier punto para re-referenciar.", Toast.LENGTH_LONG).show();
    }

    /** GUARDIAN DE TRACKING. Si ARCore pierde el mapa, la camara virtual se
     *  congela mientras el operario sigue caminando: todo lo virtual queda
     *  pegado a la pantalla ("el modelo me sigue"). Se oculta el modelo y un
     *  letrero dice por que y como recuperar; al relocalizar, todo vuelve.
     *
     *  CRASH ar-53/55 ("me bota" al abrir): esto estaba registrado DIRECTO en
     *  onCreate, pero ahi la vista AR del fragment AUN NO EXISTE (por eso la
     *  luz, el far plane y la malla van dentro de setOnViewCreatedListener).
     *  getArSceneView() devolvia null y reventaba al tocar Motor nativo. Se
     *  registra aqui, llamado desde ese mismo listener. */
    private void vigilarTracking(com.google.ar.sceneform.ArSceneView vista) {
        vista.getScene().addOnUpdateListener(ft -> {
            com.google.ar.core.Frame frame = vista.getArFrame();
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
