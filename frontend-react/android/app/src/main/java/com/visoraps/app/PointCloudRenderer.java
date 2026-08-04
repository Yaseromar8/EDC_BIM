package com.visoraps.app;

import android.opengl.GLES20;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

/**
 * La nube de puntos acumulada del escaneo, como puntitos blancos — el efecto
 * Revizto: el operario VE el relieve que el equipo va reconociendo mientras
 * barre. Sin este eco visual, escanear un muro liso se siente como apuntar a
 * la nada y la gente abandona antes de que el detector reúna sus puntos.
 */
public class PointCloudRenderer {
    private int program = 0;
    private int aPos;
    private int aColor;
    private int uMvp;
    private FloatBuffer buf;
    private FloatBuffer bufColor;
    private int capacity = 0;

    // Color POR PUNTO: cuando el ajuste reconoce una cara, sus puntos se
    // tinen (cian piso, verde muro A, naranja muro B) y el operario ve la
    // malla armandose de verdad, no una lluvia de puntos sueltos.
    private static final String VS =
            "attribute vec4 a_Position;\n"
            + "attribute vec3 a_Color;\n"
            + "uniform mat4 u_Mvp;\n"
            + "varying vec3 v_Color;\n"
            + "void main() { gl_Position = u_Mvp * a_Position; gl_PointSize = 9.0; v_Color = a_Color; }";

    private static final String FS =
            "precision mediump float;\n"
            + "varying vec3 v_Color;\n"
            + "void main() { gl_FragColor = vec4(v_Color, 0.9); }";

    public void createOnGlThread() {
        int vs = GLES20.glCreateShader(GLES20.GL_VERTEX_SHADER);
        GLES20.glShaderSource(vs, VS);
        GLES20.glCompileShader(vs);
        int fs = GLES20.glCreateShader(GLES20.GL_FRAGMENT_SHADER);
        GLES20.glShaderSource(fs, FS);
        GLES20.glCompileShader(fs);
        program = GLES20.glCreateProgram();
        GLES20.glAttachShader(program, vs);
        GLES20.glAttachShader(program, fs);
        GLES20.glLinkProgram(program);
        aPos = GLES20.glGetAttribLocation(program, "a_Position");
        aColor = GLES20.glGetAttribLocation(program, "a_Color");
        uMvp = GLES20.glGetUniformLocation(program, "u_Mvp");
    }

    /** Dibuja `count` puntos (xyz) con su color rgb por punto. */
    public void draw(float[] mvp, float[] xyz, float[] rgb, int count) {
        if (program == 0 || count <= 0) return;
        if (buf == null || capacity < count * 3) {
            capacity = Math.max(count * 3, 4096);
            buf = ByteBuffer.allocateDirect(capacity * 4)
                    .order(ByteOrder.nativeOrder()).asFloatBuffer();
            bufColor = ByteBuffer.allocateDirect(capacity * 4)
                    .order(ByteOrder.nativeOrder()).asFloatBuffer();
        }
        buf.clear();
        buf.put(xyz, 0, count * 3);
        buf.position(0);
        bufColor.clear();
        bufColor.put(rgb, 0, count * 3);
        bufColor.position(0);
        GLES20.glUseProgram(program);
        GLES20.glEnable(GLES20.GL_BLEND);
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA);
        GLES20.glUniformMatrix4fv(uMvp, 1, false, mvp, 0);
        GLES20.glEnableVertexAttribArray(aPos);
        GLES20.glVertexAttribPointer(aPos, 3, GLES20.GL_FLOAT, false, 0, buf);
        GLES20.glEnableVertexAttribArray(aColor);
        GLES20.glVertexAttribPointer(aColor, 3, GLES20.GL_FLOAT, false, 0, bufColor);
        GLES20.glDrawArrays(GLES20.GL_POINTS, 0, count);
        GLES20.glDisableVertexAttribArray(aPos);
        GLES20.glDisableVertexAttribArray(aColor);
        GLES20.glDisable(GLES20.GL_BLEND);
    }
}
