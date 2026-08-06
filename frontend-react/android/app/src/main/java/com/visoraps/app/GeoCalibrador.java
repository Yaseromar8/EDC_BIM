package com.visoraps.app;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * ESTACION LIBRE CON LA TABLET: la matematica del AR georreferenciado.
 *
 * Todo son transformaciones de semejanza en el plano horizontal + cota
 * (Helmert 2D+Z, la de los topografos). Espejo del georefFit.js de la web,
 * que es quien tiene la bateria de tests; aqui solo se re-implementa la
 * forma cerrada, identica.
 *
 * Convencion de planos: un punto 3D (x,y,z) de un mundo Y-arriba (glb, AR)
 * se proyecta al plano como (x, -z) para que case con (Este, Norte) sin
 * voltear la quiralidad; la cota es y.
 */
public class GeoCalibrador {

    /** Semejanza 2D + cota: EN = e*R(yaw)*(u,v) + (tx,ty); Z = e*w + tz. */
    public static class Semejanza {
        public double escala = 1, yawRad = 0, tx = 0, ty = 0, tz = 0;

        public double[] aplicar(double u, double v, double w) {
            double c = Math.cos(yawRad), s = Math.sin(yawRad);
            return new double[]{
                    escala * (c * u - s * v) + tx,
                    escala * (s * u + c * v) + ty,
                    escala * w + tz };
        }

        /** this ∘ otra: primero 'otra', despues this. */
        public Semejanza componer(Semejanza otra) {
            Semejanza r = new Semejanza();
            r.escala = escala * otra.escala;
            r.yawRad = yawRad + otra.yawRad;
            double c = Math.cos(yawRad), s = Math.sin(yawRad);
            r.tx = escala * (c * otra.tx - s * otra.ty) + tx;
            r.ty = escala * (s * otra.tx + c * otra.ty) + ty;
            r.tz = escala * otra.tz + tz;
            return r;
        }

        public Semejanza inversa() {
            Semejanza r = new Semejanza();
            r.escala = 1.0 / escala;
            r.yawRad = -yawRad;
            double c = Math.cos(r.yawRad), s = Math.sin(r.yawRad);
            r.tx = -r.escala * (c * tx - s * ty);
            r.ty = -r.escala * (s * tx + c * ty);
            r.tz = -tz / escala;
            return r;
        }
    }

    /** Punto de control del proyecto (viene de la plataforma, via Intent). */
    public static class PuntoControl {
        public final String id;
        public final double este, norte, cota;
        public PuntoControl(String id, double este, double norte, double cota) {
            this.id = id; this.este = este; this.norte = norte; this.cota = cota;
        }
    }

    /** Medicion de campo: donde cayo el punto en el mundo AR (Y-arriba). */
    public static class Medicion {
        public final PuntoControl punto;
        public final double arX, arY, arZ;
        public Medicion(PuntoControl p, double x, double y, double z) {
            punto = p; arX = x; arY = y; arZ = z;
        }
    }

    // Mediciones vivas, una por punto: re-medir REEMPLAZA (re-referenciacion).
    private final Map<String, Medicion> mediciones = new LinkedHashMap<>();

    public void medir(PuntoControl p, double arX, double arY, double arZ) {
        mediciones.put(p.id, new Medicion(p, arX, arY, arZ));
    }

    public int cuantasMediciones() { return mediciones.size(); }

    public static class Resultado {
        public Semejanza utmAAr;      // UTM -> mundo AR
        public double rmsM, peorM;
        public String detalle;        // residual por punto, legible
    }

    /**
     * Ajuste de campo con ESCALA FIJA = 1 (ARCore es metrico: dejarla libre
     * absorberia la deriva y mentiria el residual — hay un test que lo vigila
     * en la version JS). Minimo 2 mediciones.
     */
    public Resultado resolver() {
        int n = mediciones.size();
        if (n < 2) return null;
        double cxO = 0, cyO = 0, czO = 0, cxD = 0, cyD = 0, czD = 0;
        List<Medicion> ms = new ArrayList<>(mediciones.values());
        for (Medicion m : ms) {
            cxO += m.punto.este; cyO += m.punto.norte; czO += m.punto.cota;
            cxD += m.arX; cyD += -m.arZ; czD += m.arY;
        }
        cxO /= n; cyO /= n; czO /= n; cxD /= n; cyD /= n; czD /= n;

        double sxx = 0, sxy = 0, syx = 0, syy = 0, sOO = 0;
        for (Medicion m : ms) {
            double xo = m.punto.este - cxO, yo = m.punto.norte - cyO;
            double xd = m.arX - cxD, yd = -m.arZ - cyD;
            sxx += xo * xd; sxy += xo * yd; syx += yo * xd; syy += yo * yd;
            sOO += xo * xo + yo * yo;
        }
        if (sOO < 1e-9) return null;
        double a = (sxx + syy) / sOO, b = (sxy - syx) / sOO;
        Semejanza t = new Semejanza();
        t.escala = 1.0;                       // fija: ver comentario de arriba
        t.yawRad = Math.atan2(b, a);
        double c = Math.cos(t.yawRad), s = Math.sin(t.yawRad);
        t.tx = cxD - (c * cxO - s * cyO);
        t.ty = cyD - (s * cxO + c * cyO);
        t.tz = czD - czO;

        Resultado r = new Resultado();
        r.utmAAr = t;
        double suma2 = 0; r.peorM = 0;
        StringBuilder det = new StringBuilder();
        for (Medicion m : ms) {
            double[] p = t.aplicar(m.punto.este, m.punto.norte, m.punto.cota);
            double d = Math.sqrt(Math.pow(p[0] - m.arX, 2)
                    + Math.pow(p[1] - (-m.arZ), 2)
                    + Math.pow(p[2] - m.arY, 2));
            suma2 += d * d;
            if (d > r.peorM) r.peorM = d;
            if (det.length() > 0) det.append(" · ");
            det.append(m.punto.id).append(" ").append(Math.round(d * 100)).append(" cm");
        }
        r.rmsM = Math.sqrt(suma2 / n);
        r.detalle = det.toString();
        return r;
    }
}
