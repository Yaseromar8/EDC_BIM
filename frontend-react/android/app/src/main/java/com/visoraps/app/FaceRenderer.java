package com.visoraps.app;

import android.opengl.GLES20;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

/**
 * Una cara RECONOCIDA, dibujada como panel translúcido con borde, recortado a
 * su extensión real. Es el estado visual que no deja dudas: puntitos = el
 * equipo está sintiendo; panel de color = esta cara YA está detectada y mide
 * esto; punto azul = rincón listo. La rejilla infinita de antes mentía —
 * cubría muros con cuadrícula de piso y nadie sabía qué estaba detectado.
 */
public class FaceRenderer {
    private int program = 0;
    private int aPos;
    private int uMvp;
    private int uColor;
    private FloatBuffer buf;

    private static final String VS =
            "attribute vec4 a_Position;\n"
            + "uniform mat4 u_Mvp;\n"
            + "void main() { gl_Position = u_Mvp * a_Position; }";

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
        buf = ByteBuffer.allocateDirect(4 * 3 * 4)
                .order(ByteOrder.nativeOrder()).asFloatBuffer();
    }

    /** Dibuja un cuadrilátero (4 esquinas xyz, en orden) con relleno y borde. */
    public void draw(float[] mvp, float[] quad, float r, float g, float b) {
        if (program == 0 || quad == null || quad.length < 12) return;
        buf.clear();
        buf.put(quad, 0, 12);
        buf.position(0);
        GLES20.glUseProgram(program);
        GLES20.glEnable(GLES20.GL_BLEND);
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA);
        GLES20.glUniformMatrix4fv(uMvp, 1, false, mvp, 0);
        GLES20.glEnableVertexAttribArray(aPos);
        GLES20.glVertexAttribPointer(aPos, 3, GLES20.GL_FLOAT, false, 0, buf);
        // Relleno suave (TRIANGLE_FAN sobre las 4 esquinas)...
        GLES20.glUniform4f(uColor, r, g, b, 0.22f);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_FAN, 0, 4);
        // ...y borde firme, que es lo que "dibuja" la cara ante el ojo.
        GLES20.glUniform4f(uColor, r, g, b, 0.95f);
        GLES20.glLineWidth(4f);
        GLES20.glDrawArrays(GLES20.GL_LINE_LOOP, 0, 4);
        GLES20.glDisableVertexAttribArray(aPos);
        GLES20.glDisable(GLES20.GL_BLEND);
    }
}
