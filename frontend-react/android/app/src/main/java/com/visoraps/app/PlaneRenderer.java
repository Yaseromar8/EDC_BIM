package com.visoraps.app;

import android.opengl.GLES20;
import android.opengl.Matrix;

import com.google.ar.core.Camera;
import com.google.ar.core.Plane;
import com.google.ar.core.Pose;
import com.google.ar.core.TrackingState;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.Collection;

/**
 * Dibuja las superficies que ARCore va detectando como una MALLA translúcida
 * sobre el terreno real — el "escaneo" que se ve en Augin/Dalux al empezar.
 *
 * Sin esto el operario apunta al piso sin ninguna señal de si el equipo está
 * reconociendo algo o no; el retículo solo dice sí/no en un punto, y una obra
 * de tierra y pasto tarda en dar planos.
 *
 * Cómo se dibuja cada plano:
 *   · Abanico de triángulos desde el centro del plano hasta su polígono.
 *   · El centro va opaco y el borde a alpha 0 → la mancha se desvanece en los
 *     bordes en vez de recortarse con un filo duro.
 *   · La rejilla es procedural en el fragment shader (celdas de 20 cm), así que
 *     no hace falta ninguna textura empaquetada en el APK.
 *
 * Se dibuja DESPUÉS del fondo de cámara y ANTES de que el WebView (transparente)
 * pinte el modelo encima. Es Capa 0.5 del sándwich.
 */
public class PlaneRenderer {

    private static final int COORDS_PER_VERTEX = 3;   // x, z (locales al plano) + alpha
    private static final int BYTES_PER_FLOAT = 4;
    private static final int INITIAL_VERTS = 256;

    /** Tamaño de celda de la rejilla, en metros. */
    private static final float GRID_CELL_M = 0.20f;
    /** Grosor de la línea como fracción de celda. */
    private static final float GRID_LINE = 0.055f;

    private static final String VERTEX_SHADER =
            "attribute vec3 a_XZAlpha;\n" +
            "uniform mat4 u_MVP;\n" +
            "uniform float u_CellsPerMeter;\n" +
            "varying float v_Alpha;\n" +
            "varying vec2 v_Cell;\n" +
            "void main() {\n" +
            "  vec4 local = vec4(a_XZAlpha.x, 0.0, a_XZAlpha.y, 1.0);\n" +
            "  gl_Position = u_MVP * local;\n" +
            "  gl_PointSize = 7.0;\n" +
            "  v_Alpha = a_XZAlpha.z;\n" +
            "  v_Cell = vec2(a_XZAlpha.x, a_XZAlpha.y) * u_CellsPerMeter;\n" +
            "}";

    // Sin derivadas (fwidth): GL_OES_standard_derivatives no está garantizado en
    // GLES2 y un shader que no compila deja la pantalla en negro. Línea de ancho
    // fijo en coordenadas de celda; a distancia se ve algo dentada, y basta.
    private static final String FRAGMENT_SHADER =
            "precision mediump float;\n" +
            "varying float v_Alpha;\n" +
            "varying vec2 v_Cell;\n" +
            "uniform vec3 u_Color;\n" +
            "uniform float u_Opacity;\n" +
            "uniform float u_LineWidth;\n" +
            "void main() {\n" +
            "  vec2 f = fract(v_Cell);\n" +
            "  vec2 d = min(f, 1.0 - f);\n" +          // distancia al borde de celda
            "  float line = min(d.x, d.y);\n" +
            "  float grid = 1.0 - smoothstep(0.0, u_LineWidth, line);\n" +
            "  float a = v_Alpha * u_Opacity * (0.16 + 0.84 * grid);\n" +
            "  if (a <= 0.003) discard;\n" +
            "  gl_FragColor = vec4(u_Color, a);\n" +
            "}";

    private int program;
    private int xzAlphaAttrib;
    private int mvpUniform;
    private int colorUniform;
    private int opacityUniform;
    private int cellsUniform;
    private int lineWidthUniform;

    private FloatBuffer vertices;
    // Buffers de la ESTETICA AUGIN: triangulacion radial, contorno y matriz
    // de puntos. Referencia directa: captura de Augin del usuario en su misma
    // sala -- malla oscura con puntitos que se ve profesional sobre cualquier
    // material, donde la rejilla cian brillante parecia un holograma roto.
    private FloatBuffer lineas;
    private FloatBuffer puntos;
    /** Separacion de la matriz de puntos, en metros. */
    private static final float PASO_PUNTOS_M = 0.35f;
    private final float[] modelMatrix = new float[16];
    private final float[] viewMatrix = new float[16];
    private final float[] projMatrix = new float[16];
    private final float[] modelViewMatrix = new float[16];
    private final float[] mvpMatrix = new float[16];

    public void createOnGlThread() {
        int vertexShader = loadShader(GLES20.GL_VERTEX_SHADER, VERTEX_SHADER);
        int fragmentShader = loadShader(GLES20.GL_FRAGMENT_SHADER, FRAGMENT_SHADER);
        program = GLES20.glCreateProgram();
        GLES20.glAttachShader(program, vertexShader);
        GLES20.glAttachShader(program, fragmentShader);
        GLES20.glLinkProgram(program);

        int[] linked = new int[1];
        GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, linked, 0);
        if (linked[0] == 0) {
            String log = GLES20.glGetProgramInfoLog(program);
            GLES20.glDeleteProgram(program);
            program = 0;
            throw new RuntimeException("Error enlazando shader de planos AR: " + log);
        }

        xzAlphaAttrib = GLES20.glGetAttribLocation(program, "a_XZAlpha");
        mvpUniform = GLES20.glGetUniformLocation(program, "u_MVP");
        colorUniform = GLES20.glGetUniformLocation(program, "u_Color");
        opacityUniform = GLES20.glGetUniformLocation(program, "u_Opacity");
        cellsUniform = GLES20.glGetUniformLocation(program, "u_CellsPerMeter");
        lineWidthUniform = GLES20.glGetUniformLocation(program, "u_LineWidth");

        allocateVertices(INITIAL_VERTS);
    }

    private void allocateVertices(int vertexCount) {
        ByteBuffer bb = ByteBuffer.allocateDirect(vertexCount * COORDS_PER_VERTEX * BYTES_PER_FLOAT);
        bb.order(ByteOrder.nativeOrder());
        vertices = bb.asFloatBuffer();
    }

    /**
     * Dibuja todos los planos en seguimiento.
     *
     * @return cuántos planos se dibujaron (la UI lo usa para decir si ya
     *         reconoció superficie o hay que seguir moviendo el equipo).
     */
    private FloatBuffer asegurar(FloatBuffer b, int floats) {
        if (b == null || b.capacity() < floats) {
            b = ByteBuffer.allocateDirect(Math.max(floats, 1024) * BYTES_PER_FLOAT)
                    .order(ByteOrder.nativeOrder()).asFloatBuffer();
        }
        b.clear();
        return b;
    }

    /** ¿El punto (x,z) cae dentro del poligono del plano? (par-impar). */
    private static boolean dentro(FloatBuffer poly, int n, float x, float z) {
        boolean in = false;
        for (int i = 0, j = n - 1; i < n; j = i++) {
            float xi = poly.get(i * 2), zi = poly.get(i * 2 + 1);
            float xj = poly.get(j * 2), zj = poly.get(j * 2 + 1);
            if (((zi > z) != (zj > z))
                    && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) {
                in = !in;
            }
        }
        return in;
    }

    public int draw(Collection<Plane> planes, Camera camera, float opacity) {
        if (program == 0 || planes == null || planes.isEmpty()) return 0;

        camera.getViewMatrix(viewMatrix, 0);
        camera.getProjectionMatrix(projMatrix, 0, 0.05f, 2000f);

        GLES20.glUseProgram(program);
        GLES20.glEnable(GLES20.GL_BLEND);
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA);
        GLES20.glDisable(GLES20.GL_CULL_FACE);
        GLES20.glEnable(GLES20.GL_DEPTH_TEST);
        GLES20.glDepthMask(false);          // translúcido: no tapa lo que venga después
        GLES20.glEnableVertexAttribArray(xzAlphaAttrib);
        GLES20.glUniform1f(cellsUniform, 1f / GRID_CELL_M);
        GLES20.glUniform1f(lineWidthUniform, GRID_LINE);
        GLES20.glUniform1f(opacityUniform, opacity);

        int drawn = 0;
        for (Plane plane : planes) {
            if (plane.getTrackingState() != TrackingState.TRACKING) continue;
            // Un plano "subsumido" fue absorbido por otro mayor: dibujarlo
            // duplicaría la malla en la misma zona.
            if (plane.getSubsumedBy() != null) continue;

            FloatBuffer polygon = plane.getPolygon();
            if (polygon == null) continue;
            polygon.rewind();
            int boundaryVerts = polygon.limit() / 2;
            if (boundaryVerts < 3) continue;

            // Abanico: centro + contorno + repetición del primer vértice al cerrar.
            int needed = boundaryVerts + 2;
            if (vertices.capacity() / COORDS_PER_VERTEX < needed) {
                allocateVertices(needed * 2);
            }
            vertices.rewind();
            vertices.put(0f).put(0f).put(1f);           // centro, opaco
            float firstX = 0f, firstZ = 0f;
            for (int i = 0; i < boundaryVerts; i++) {
                float x = polygon.get(i * 2);
                float z = polygon.get(i * 2 + 1);
                if (i == 0) { firstX = x; firstZ = z; }
                vertices.put(x).put(z).put(0f);         // borde, transparente
            }
            vertices.put(firstX).put(firstZ).put(0f);   // cierra el abanico
            vertices.rewind();

            Pose center = plane.getCenterPose();
            center.toMatrix(modelMatrix, 0);
            Matrix.multiplyMM(modelViewMatrix, 0, viewMatrix, 0, modelMatrix, 0);
            Matrix.multiplyMM(mvpMatrix, 0, projMatrix, 0, modelViewMatrix, 0);
            GLES20.glUniformMatrix4fv(mvpUniform, 1, false, mvpMatrix, 0);

            // ESTETICA AUGIN: relleno oscuro neutro que lee "superficie" sobre
            // cualquier material. El piso apenas se distingue del resto por un
            // matiz; el dibujo fuerte lo ponen las lineas y los puntos.
            boolean floor = plane.getType() == Plane.Type.HORIZONTAL_UPWARD_FACING;
            if (floor) {
                GLES20.glUniform3f(colorUniform, 0.05f, 0.06f, 0.09f);
            } else {
                GLES20.glUniform3f(colorUniform, 0.10f, 0.10f, 0.10f);
            }

            GLES20.glVertexAttribPointer(xzAlphaAttrib, COORDS_PER_VERTEX,
                    GLES20.GL_FLOAT, false, COORDS_PER_VERTEX * BYTES_PER_FLOAT, vertices);
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_FAN, 0, needed);

            // TRIANGULACION RADIAL + CONTORNO, en un solo buffer de segmentos:
            // (centro -> vi) y (vi -> vi+1). Con u_CellsPerMeter = 0 el shader
            // pinta solido (la rejilla procedural queda neutralizada).
            lineas = asegurar(lineas, boundaryVerts * 4 * COORDS_PER_VERTEX);
            for (int i = 0; i < boundaryVerts; i++) {
                float x = polygon.get(i * 2), z = polygon.get(i * 2 + 1);
                int j = (i + 1) % boundaryVerts;
                float xj = polygon.get(j * 2), zj = polygon.get(j * 2 + 1);
                lineas.put(0f).put(0f).put(1f);
                lineas.put(x).put(z).put(1f);
                lineas.put(x).put(z).put(1f);
                lineas.put(xj).put(zj).put(1f);
            }
            int lineaVerts = boundaryVerts * 4;
            lineas.rewind();
            GLES20.glUniform1f(cellsUniform, 0f);
            GLES20.glUniform3f(colorUniform, 0.02f, 0.02f, 0.02f);
            GLES20.glUniform1f(opacityUniform, opacity * 0.45f);
            GLES20.glLineWidth(2.5f);
            GLES20.glVertexAttribPointer(xzAlphaAttrib, COORDS_PER_VERTEX,
                    GLES20.GL_FLOAT, false, COORDS_PER_VERTEX * BYTES_PER_FLOAT, lineas);
            GLES20.glDrawArrays(GLES20.GL_LINES, 0, lineaVerts);

            // MATRIZ DE PUNTOS: reticula de 35 cm recortada al poligono real.
            float minX = 1e9f, maxX = -1e9f, minZ = 1e9f, maxZ = -1e9f;
            for (int i = 0; i < boundaryVerts; i++) {
                float x = polygon.get(i * 2), z = polygon.get(i * 2 + 1);
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (z < minZ) minZ = z;
                if (z > maxZ) maxZ = z;
            }
            int cabenX = (int) ((maxX - minX) / PASO_PUNTOS_M) + 1;
            int cabenZ = (int) ((maxZ - minZ) / PASO_PUNTOS_M) + 1;
            if (cabenX * cabenZ <= 4000) {
                puntos = asegurar(puntos, cabenX * cabenZ * COORDS_PER_VERTEX);
                int nPuntos = 0;
                for (float px = minX; px <= maxX; px += PASO_PUNTOS_M) {
                    for (float pz = minZ; pz <= maxZ; pz += PASO_PUNTOS_M) {
                        if (dentro(polygon, boundaryVerts, px, pz)) {
                            puntos.put(px).put(pz).put(1f);
                            nPuntos++;
                        }
                    }
                }
                if (nPuntos > 0) {
                    puntos.rewind();
                    GLES20.glUniform3f(colorUniform, 0.02f, 0.02f, 0.02f);
                    GLES20.glUniform1f(opacityUniform, opacity * 0.9f);
                    GLES20.glVertexAttribPointer(xzAlphaAttrib, COORDS_PER_VERTEX,
                            GLES20.GL_FLOAT, false, COORDS_PER_VERTEX * BYTES_PER_FLOAT, puntos);
                    GLES20.glDrawArrays(GLES20.GL_POINTS, 0, nPuntos);
                }
            }

            // Restaurar los uniformes del relleno para el siguiente plano.
            GLES20.glUniform1f(cellsUniform, 1f / GRID_CELL_M);
            GLES20.glUniform1f(opacityUniform, opacity);
            if (floor) drawn++;
        }

        GLES20.glDisableVertexAttribArray(xzAlphaAttrib);
        GLES20.glDepthMask(true);
        GLES20.glDisable(GLES20.GL_BLEND);
        return drawn;
    }

    private static int loadShader(int type, String src) {
        int shader = GLES20.glCreateShader(type);
        GLES20.glShaderSource(shader, src);
        GLES20.glCompileShader(shader);
        int[] ok = new int[1];
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, ok, 0);
        if (ok[0] == 0) {
            String log = GLES20.glGetShaderInfoLog(shader);
            GLES20.glDeleteShader(shader);
            throw new RuntimeException("Error compilando shader de planos AR: " + log);
        }
        return shader;
    }
}
