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

        ModelRenderable.builder()
                .setSource(this, Uri.parse(GLB))
                .setIsFilamentGltf(true)
                .setAsyncLoadEnabled(true)
                .build()
                .thenAccept(renderable -> {
                    modelo = renderable;
                    Toast.makeText(this,
                            "Modelo listo. Barre el piso y TOCA la malla para colocarlo.",
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
                Toast.makeText(this, "El modelo aun esta descargando…", Toast.LENGTH_SHORT).show();
                return;
            }
            Anchor anchor = hit.createAnchor();
            AnchorNode anchorNode = new AnchorNode(anchor);
            anchorNode.setParent(arFragment.getArSceneView().getScene());
            TransformableNode nodo = new TransformableNode(arFragment.getTransformationSystem());
            nodo.setParent(anchorNode);
            nodo.setRenderable(modelo);
            nodo.select();
        });
    }
}
