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

            // Horizontal hacia arriba = piso donde SÍ se puede colocar (cian).
            // El resto (paredes, techos) en gris: se ven, pero no invitan.
            boolean floor = plane.getType() == Plane.Type.HORIZONTAL_UPWARD_FACING;
            if (floor) {
                GLES20.glUniform3f(colorUniform, 0.24f, 0.86f, 0.94f);
            } else {
                GLES20.glUniform3f(colorUniform, 0.62f, 0.66f, 0.72f);
            }

            GLES20.glVertexAttribPointer(xzAlphaAttrib, COORDS_PER_VERTEX,
                    GLES20.GL_FLOAT, false, COORDS_PER_VERTEX * BYTES_PER_FLOAT, vertices);
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_FAN, 0, needed);
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
