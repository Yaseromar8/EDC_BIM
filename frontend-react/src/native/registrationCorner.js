// registrationCorner.js — Calibración POR ESQUINA (dos muros y el piso).
//
// Es el método que usa Revizto ("Calibrar por esquina") y hay una razón
// geométrica preciosa detrás: tres planos no paralelos se cortan en UN solo
// punto y fijan los seis grados de libertad — posición y giro — sin sobrar ni
// faltar información.
//
// Frente a marcar tres PUNTOS, esto gana donde importa, que es la mano del que
// está en obra:
//   · Un punto exige puntería de centímetros con sol y guantes. Una cara es un
//     blanco enorme: tocas cualquier sitio de la pared y aciertas.
//   · ARCore YA detecta planos —horizontales y verticales, así lo tenemos
//     configurado— y nosotros ya los dibujamos con su normal y su centro. La
//     mitad del trabajo estaba hecha.
//   · Una esquina es inequívoca: no hay forma de confundir "el muro izquierdo"
//     con "el muro derecho" como sí se confunde el vértice 2 con el 3.
//
// LA ESCALA NO SE PUEDE DEDUCIR de planos: un rincón grande y uno pequeño se
// ven igual si solo miras orientaciones y distancias al origen. La escala viene
// de las unidades del modelo, que ya conocemos. Por eso aquí no se estima.
//
// Un plano se describe como { n: normal unitaria, p: un punto cualquiera de él }.

import { largestEigenvector4, quatToMatrix } from './registration3p.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v) => {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
};
const rotar = (R, v) => [
  R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2],
  R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
  R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2],
];

/** Determinante de una 3x3 dada por sus filas. */
function det3(m) {
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
       - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
       + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}

/** Resuelve A·x = b (3x3) por Cramer. Devuelve null si A es singular. */
function resolver3(A, b) {
  const d = det3(A);
  if (Math.abs(d) < 1e-12) return null;
  const conCol = (i) => A.map((fila, r) => fila.map((v, c) => (c === i ? b[r] : v)));
  return [det3(conCol(0)) / d, det3(conCol(1)) / d, det3(conCol(2)) / d];
}

/** Rotación óptima que lleva las direcciones `a` sobre las `b` (Horn, sin centrar). */
function rotacionDeDirecciones(a, b) {
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < a.length; i++) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) M[r][c] += a[i][r] * b[i][c];
    }
  }
  const [Sxx, Sxy, Sxz] = M[0];
  const [Syx, Syy, Syz] = M[1];
  const [Szx, Szy, Szz] = M[2];
  return quatToMatrix(largestEigenvector4([
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
  ]));
}

/**
 * Calibra por esquina: hace coincidir 3 planos del modelo con 3 del mundo real.
 *
 * @param {{n:number[],p:number[]}[]} planosModelo  en unidades del MODELO
 * @param {{n:number[],p:number[]}[]} planosMundo   en METROS de ARCore, mismo orden
 * @param {{escala?:number}} opts  unidades del modelo por metro (p.ej. 1000 si
 *        el modelo está en mm). Por defecto 1.
 * @returns {{R:number[][], t:number[], scale:number, rms:number,
 *            residuals:number[], ok:boolean, motivo?:string}}
 *
 * La calidad se mide en `rmsAngle` (GRADOS), no en distancia: ver el comentario
 * dentro de la función. `errorA(metros)` traduce ese ángulo a la desviación
 * esperable a esa distancia, que es lo que el operario entiende.
 */
export function solveCorner(planosModelo, planosMundo, opts = {}) {
  const fallo = (motivo) => ({
    R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0], scale: 1,
    rms: Infinity, residuals: [], ok: false, motivo,
  });

  if (!Array.isArray(planosModelo) || !Array.isArray(planosMundo)) return fallo('faltan planos');
  if (planosModelo.length !== 3 || planosMundo.length !== 3) {
    return fallo('hacen falta exactamente 3 caras: dos muros y el piso');
  }

  const escala = Number(opts.escala) > 0 ? Number(opts.escala) : 1;   // unidades del modelo por metro
  const s = 1 / escala;                                               // modelo -> metros

  const nm = planosModelo.map((q) => norm(q.n));
  const nw = planosMundo.map((q) => norm(q.n));

  // ¿Es un RINCÓN de verdad? Si las tres normales son casi coplanares —dos
  // muros paralelos, o los tres planos formando un prisma abierto— el sistema
  // no tiene solución única y el modelo saldría desplazado a lo largo de la
  // dirección que falta. Más vale decirlo que colocarlo mal.
  const rincon = Math.abs(det3(nw));
  if (rincon < 0.15) {
    return fallo('esas tres caras no forman un rincón: elige dos muros que se corten y el piso');
  }

  // La normal de un plano puede apuntar a un lado o al otro sin cambiar el
  // plano. Si el modelo y ARCore eligen sentidos distintos, la rotación sale
  // volteada y el modelo aparece del revés. Se prueban las 8 combinaciones de
  // signo y se elige la que mejor encaja: son 8 cuentas, nada.
  let mejor = null;
  for (let bits = 0; bits < 8; bits++) {
    const signos = [(bits & 1) ? -1 : 1, (bits & 2) ? -1 : 1, (bits & 4) ? -1 : 1];
    const nmS = nm.map((v, i) => [v[0] * signos[i], v[1] * signos[i], v[2] * signos[i]]);

    const R = rotacionDeDirecciones(nmS, nw);

    // Traslación: cada plano impone que un punto suyo, ya transformado, caiga
    // sobre el plano real.  nw·(s·R·p + t) = nw·pw   →   nw·t = nw·pw − nw·(s·R·p)
    const A = nw.map((v) => v.slice());
    const b = nw.map((v, i) => {
      const pModelo = planosModelo[i].p;
      const girado = rotar(R, [pModelo[0] * s, pModelo[1] * s, pModelo[2] * s]);
      return dot(v, planosMundo[i].p) - dot(v, girado);
    });
    const t = resolver3(A, b);
    if (!t) continue;

    // CUIDADO CON EL RESIDUO EN DISTANCIA: con 3 planos y 3 incógnitas, el
    // sistema es exactamente determinado y la solución hace esas tres
    // distancias CERO por construcción — mida bien o mida fatal. Sería un
    // número tranquilizador y vacío, justo lo que no queremos enseñarle al
    // operario antes de que acepte.
    //
    // Donde SÍ hay redundancia es en el giro: tres direcciones para tres
    // grados de libertad. El desajuste ANGULAR entre cada normal del modelo ya
    // girada y su normal real es una medida honesta de la calidad del calce, y
    // es además la que más duele en obra: un grado de error a 30 m son 50 cm.
    const angulos = nmS.map((v, i) => {
      const c = Math.max(-1, Math.min(1, dot(rotar(R, v), nw[i])));
      return Math.acos(c) * 180 / Math.PI;      // grados
    });
    const rmsAngle = Math.sqrt(angulos.reduce((a2, g) => a2 + g * g, 0) / 3);
    const coste = rmsAngle;

    if (!mejor || coste < mejor.coste) mejor = { R, t, angulos, rmsAngle, coste };
  }

  if (!mejor) return fallo('no se pudo resolver: revisa las caras seleccionadas');

  return {
    R: mejor.R, t: mejor.t, scale: s,
    // rmsAngle en GRADOS: la calidad real del calce. Es lo que se le enseña al
    // operario. Regla práctica: por debajo de 1° el modelo aguanta bien a
    // decenas de metros; por encima de 3° conviene repetir la esquina.
    rmsAngle: mejor.rmsAngle,
    angleResiduals: mejor.angulos,
    // Desviación esperable a X metros de la esquina, por el error angular.
    errorA: (metros) => 2 * metros * Math.sin(mejor.rmsAngle * Math.PI / 360),
    ok: true,
  };
}

/**
 * Punto donde se cortan tres planos: la esquina física.
 * Sirve para dibujar dónde ha quedado el rincón y que el operario lo vea.
 */
export function cornerPoint(planos) {
  if (!Array.isArray(planos) || planos.length !== 3) return null;
  const A = planos.map((q) => norm(q.n));
  const b = planos.map((q, i) => dot(A[i], q.p));
  return resolver3(A, b);
}
