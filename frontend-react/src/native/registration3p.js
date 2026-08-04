// registration3p.js — Registro por correspondencia de puntos (Horn, 1987).
//
// El problema: colocar el modelo BIM sobre la obra real con precisión de
// centímetros. El GPS de una tablet da ±16-31 m — medido en campo, en este
// mismo proyecto —, así que no sirve para calzar un buzón. La solución
// profesional es la que usan SiteVision, vGIS o Dalux cuando no hay un receptor
// GNSS topográfico: señalar en el mundo real los MISMOS puntos que ya están
// marcados en el modelo, y resolver la transformación que los hace coincidir.
//
// Tres pares no alineados determinan por completo una transformación rígida:
// posición, rotación y —si se pide— escala. Aquí se resuelve por el método de
// los cuaterniones de Horn: se construye una matriz simétrica 4x4 a partir de
// la correlación entre ambas nubes, y su autovector principal ES el cuaternión
// de la rotación óptima en mínimos cuadrados. Es cerrado y estable; no itera ni
// puede "no converger" como un ajuste numérico.
//
// El tercer par no es un capricho: con dos bastaría (la gravedad de ARCore fija
// la vertical), pero el tercero da REDUNDANCIA, y de ahí sale el residuo que se
// le enseña al operario antes de que acepte. Sin residuo, "dale OK cuando
// coincida" es un juicio a ojo.

/** Producto de dos matrices 3x3 en forma de array de arrays. */
function centroid(pts) {
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return c.map((v) => v / pts.length);
}

/**
 * Autovector del mayor autovalor de una simétrica 4x4, por rotaciones de
 * Jacobi. Una 4x4 simétrica converge en un puñado de barridos.
 */
export function largestEigenvector4(A) {
  // Copia de trabajo y matriz de autovectores acumulada.
  const a = A.map((r) => r.slice());
  let v = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];

  for (let sweep = 0; sweep < 64; sweep++) {
    // Mayor elemento fuera de la diagonal.
    let off = 0, p = 0, q = 1;
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        const m = Math.abs(a[i][j]);
        if (m > off) { off = m; p = i; q = j; }
      }
    }
    if (off < 1e-12) break;                       // ya es diagonal

    const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
    const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const c = 1 / Math.sqrt(t * t + 1);
    const s = t * c;

    // Rotación de Jacobi sobre el plano (p,q).
    const rot = (m) => {
      for (let k = 0; k < 4; k++) {
        const mkp = m[k][p], mkq = m[k][q];
        m[k][p] = c * mkp - s * mkq;
        m[k][q] = s * mkp + c * mkq;
      }
    };
    rot(a);
    // a = Rᵀ a R  → falta aplicar por filas
    for (let k = 0; k < 4; k++) {
      const apk = a[p][k], aqk = a[q][k];
      a[p][k] = c * apk - s * aqk;
      a[q][k] = s * apk + c * aqk;
    }
    rot(v);
  }

  // El mayor autovalor está en la diagonal; su columna en v es el autovector.
  let best = 0;
  for (let i = 1; i < 4; i++) if (a[i][i] > a[best][best]) best = i;
  return [v[0][best], v[1][best], v[2][best], v[3][best]];
}

/** Matriz de rotación 3x3 a partir de un cuaternión (w, x, y, z). */
export function quatToMatrix(q) {
  const [w, x, y, z] = q;
  const n = Math.hypot(w, x, y, z) || 1;
  const [W, X, Y, Z] = [w / n, x / n, y / n, z / n];
  return [
    [1 - 2 * (Y * Y + Z * Z), 2 * (X * Y - W * Z), 2 * (X * Z + W * Y)],
    [2 * (X * Y + W * Z), 1 - 2 * (X * X + Z * Z), 2 * (Y * Z - W * X)],
    [2 * (X * Z - W * Y), 2 * (Y * Z + W * X), 1 - 2 * (X * X + Y * Y)],
  ];
}

/** Aplica rotación + escala + traslación a un punto. */
export function applyTransform(R, s, t, p) {
  return [
    s * (R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2]) + t[0],
    s * (R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2]) + t[1],
    s * (R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2]) + t[2],
  ];
}

/**
 * Resuelve la transformación rígida que lleva `src` sobre `dst`.
 *
 * @param {number[][]} src  puntos origen  [[x,y,z], ...]  (mínimo 3)
 * @param {number[][]} dst  puntos destino, en el MISMO orden
 * @param {{estimateScale?: boolean}} opts
 * @returns {{R:number[][], scale:number, t:number[], rms:number,
 *            residuals:number[], ok:boolean, motivo?:string}}
 *
 * `rms` va en las unidades de `dst`. Es lo que se le enseña al operario: si
 * sale de 4 cm, el calce es bueno; si sale de medio metro, señaló mal o
 * confundió el orden de los puntos.
 */
export function solveRigid(src, dst, opts = {}) {
  const fallo = (motivo) => ({
    R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], scale: 1, t: [0, 0, 0],
    rms: Infinity, residuals: [], ok: false, motivo,
  });

  if (!Array.isArray(src) || !Array.isArray(dst)) return fallo('faltan puntos');
  if (src.length !== dst.length) return fallo('las dos listas deben tener el mismo número de puntos');
  if (src.length < 3) return fallo('hacen falta al menos 3 puntos');

  const n = src.length;
  const cs = centroid(src);
  const cd = centroid(dst);
  const a = src.map((p) => [p[0] - cs[0], p[1] - cs[1], p[2] - cs[2]]);
  const b = dst.map((p) => [p[0] - cd[0], p[1] - cd[1], p[2] - cd[2]]);

  // Puntos ALINEADOS: no determinan el giro alrededor de su propia recta. Se
  // detecta con el área del triángulo; sin esto el resultado seria un giro
  // arbitrario que "cuadra" numericamente y falla en obra.
  const cruz = [
    a[1][1] * a[2][2] - a[1][2] * a[2][1],
    a[1][2] * a[2][0] - a[1][0] * a[2][2],
    a[1][0] * a[2][1] - a[1][1] * a[2][0],
  ];
  const area2 = Math.hypot(cruz[0], cruz[1], cruz[2]);
  const escalaTipica = Math.max(...a.map((p) => Math.hypot(p[0], p[1], p[2]))) || 1;
  if (area2 < 1e-6 * escalaTipica * escalaTipica) {
    return fallo('los tres puntos están casi en línea recta: elige uno fuera de esa recta');
  }

  // Matriz de correlación M = Σ aᵢ bᵢᵀ
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) M[r][c] += a[i][r] * b[i][c];
    }
  }
  const [Sxx, Sxy, Sxz] = M[0];
  const [Syx, Syy, Syz] = M[1];
  const [Szx, Szy, Szz] = M[2];

  // Matriz simétrica de Horn. Su autovector principal es el cuaternión óptimo.
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
  ];
  const R = quatToMatrix(largestEigenvector4(N));

  // Escala. Solo se estima si se pide: en obra la escala YA se conoce (las
  // unidades del modelo), y dejarla libre convierte un error de puntería en un
  // modelo encogido o inflado.
  let scale = 1;
  if (opts.estimateScale) {
    let sa = 0, sb = 0;
    for (let i = 0; i < n; i++) {
      sa += a[i][0] ** 2 + a[i][1] ** 2 + a[i][2] ** 2;
      sb += b[i][0] ** 2 + b[i][1] ** 2 + b[i][2] ** 2;
    }
    scale = sa > 0 ? Math.sqrt(sb / sa) : 1;
  }

  const t = [
    cd[0] - scale * (R[0][0] * cs[0] + R[0][1] * cs[1] + R[0][2] * cs[2]),
    cd[1] - scale * (R[1][0] * cs[0] + R[1][1] * cs[1] + R[1][2] * cs[2]),
    cd[2] - scale * (R[2][0] * cs[0] + R[2][1] * cs[1] + R[2][2] * cs[2]),
  ];

  const residuals = src.map((p, i) => {
    const q = applyTransform(R, scale, t, p);
    return Math.hypot(q[0] - dst[i][0], q[1] - dst[i][1], q[2] - dst[i][2]);
  });
  const rms = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / n);

  return { R, scale, t, rms, residuals, ok: true };
}

/** Matriz 4x4 en orden de columnas (el que espera THREE / el visor). */
export function toMatrix4(R, s, t) {
  return [
    s * R[0][0], s * R[1][0], s * R[2][0], 0,
    s * R[0][1], s * R[1][1], s * R[2][1], 0,
    s * R[0][2], s * R[1][2], s * R[2][2], 0,
    t[0], t[1], t[2], 1,
  ];
}
