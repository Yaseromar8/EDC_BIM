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
    private int uMvp;
    private int uColor;
    private FloatBuffer buf;
    private int capacity = 0;

    private static final String VS =
            "attribute vec4 a_Position;\n"
            + "uniform mat4 u_Mvp;\n"
            + "void main() { gl_Position = u_Mvp * a_Position; gl_PointSize = 9.0; }";

    private static final String FS =
            "precision mediump float;\n"
            + "uniform vec4 u_Color;\n"
            + "void main() { gl_FragColor = u_Color; }";

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
        uMvp = GLES20.glGetUniformLocation(program, "u_Mvp");
        uColor = GLES20.glGetUniformLocation(program, "u_Color");
    }

    /** Dibuja `count` puntos (xyz consecutivos) con la matriz proj*view dada. */
    public void draw(float[] mvp, float[] xyz, int count) {
        if (program == 0 || count <= 0) return;
        if (buf == null || capacity < count * 3) {
            capacity = Math.max(count * 3, 4096);
            buf = ByteBuffer.allocateDirect(capacity * 4)
                    .order(ByteOrder.nativeOrder()).asFloatBuffer();
        }
        buf.clear();
        buf.put(xyz, 0, count * 3);
        buf.position(0);
        GLES20.glUseProgram(program);
        GLES20.glEnable(GLES20.GL_BLEND);
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA);
        GLES20.glUniformMatrix4fv(uMvp, 1, false, mvp, 0);
        GLES20.glUniform4f(uColor, 1f, 1f, 1f, 0.85f);
        GLES20.glEnableVertexAttribArray(aPos);
        GLES20.glVertexAttribPointer(aPos, 3, GLES20.GL_FLOAT, false, 0, buf);
        GLES20.glDrawArrays(GLES20.GL_POINTS, 0, count);
        GLES20.glDisableVertexAttribArray(aPos);
        GLES20.glDisable(GLES20.GL_BLEND);
    }
}
