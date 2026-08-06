// Ajuste HELMERT 2D + cota: la transformación entre dos sistemas con la
// vertical compartida — exactamente lo que un topógrafo llama "transformación
// de semejanza". Se usa dos veces en el AR georreferenciado:
//
//   1) AMARRE modelo↔UTM (web): pares clic-en-modelo ↔ coordenada UTM.
//      Escala LIBRE: si el DWG está en pies, la escala sale 0.3048 y el
//      desajuste de unidades se detecta solo, con número.
//   2) CALIBRACIÓN AR↔UTM (campo): puntos de control medidos con la tablet.
//      Escala FIJA = 1: ARCore es métrico; dejarla libre absorbería deriva
//      y mentiría la precisión.
//
// Convención de planos: aquí todo es {x: este, y: norte, z: cota} — el que
// llama convierte desde su espacio (LMV es Z-arriba: x,y,z directo; ARCore es
// Y-arriba: [x_ar, -z_ar] es el plano horizontal y y_ar la cota).
//
// Modelo matemático (mínimos cuadrados, forma cerrada clásica):
//   E = s·(cosθ·x − sinθ·y) + tx
//   N = s·(sinθ·x + cosθ·y) + ty
//   Z = s·z + tz
// Devuelve además el residual por punto y el RMS: el sistema NUNCA finge una
// precisión que no midió.

/**
 * @param {Array<{origen:[number,number,number], destino:[number,number,number], id?:string}>} pares
 * @param {{escalaFija?: number}} opts  escalaFija=1 para calibración AR
 */
export function ajustarHelmert(pares, opts = {}) {
  if (!pares || pares.length < 2) {
    return { ok: false, error: 'Se necesitan al menos 2 puntos (tienes ' + (pares ? pares.length : 0) + ')' };
  }
  const n = pares.length;

  // Centroides
  let cxO = 0, cyO = 0, czO = 0, cxD = 0, cyD = 0, czD = 0;
  for (const p of pares) {
    cxO += p.origen[0]; cyO += p.origen[1]; czO += p.origen[2] || 0;
    cxD += p.destino[0]; cyD += p.destino[1]; czD += p.destino[2] || 0;
  }
  cxO /= n; cyO /= n; czO /= n; cxD /= n; cyD /= n; czD /= n;

  // Sumatorias de la forma cerrada (Helmert 2D sobre coordenadas centradas)
  let sxx = 0, sxy = 0, syx = 0, syy = 0, sOO = 0;
  for (const p of pares) {
    const xo = p.origen[0] - cxO, yo = p.origen[1] - cyO;
    const xd = p.destino[0] - cxD, yd = p.destino[1] - cyD;
    sxx += xo * xd; sxy += xo * yd; syx += yo * xd; syy += yo * yd;
    sOO += xo * xo + yo * yo;
  }
  if (sOO < 1e-12) {
    return { ok: false, error: 'Los puntos de origen están todos en el mismo sitio' };
  }
  // s·cosθ = (sxx+syy)/sOO ; s·sinθ = (sxy−syx)/sOO
  const a = (sxx + syy) / sOO;
  const b = (sxy - syx) / sOO;
  let escala = Math.hypot(a, b);
  let theta = Math.atan2(b, a);
  if (opts.escalaFija != null) {
    escala = opts.escalaFija;   // el ángulo óptimo no depende de la escala
  }
  if (escala < 1e-12) {
    return { ok: false, error: 'Escala degenerada' };
  }

  const cos = Math.cos(theta), sin = Math.sin(theta);
  const tx = cxD - escala * (cos * cxO - sin * cyO);
  const ty = cyD - escala * (sin * cxO + cos * cyO);
  const tz = czD - escala * czO;

  const aplicar = (p) => [
    escala * (cos * p[0] - sin * p[1]) + tx,
    escala * (sin * p[0] + cos * p[1]) + ty,
    escala * (p[2] || 0) + tz,
  ];

  // Residuales honestos: distancia 3D entre el destino real y el transformado
  let suma2 = 0, peor = 0;
  const residuales = pares.map((p) => {
    const t = aplicar(p.origen);
    const d = Math.hypot(t[0] - p.destino[0], t[1] - p.destino[1], t[2] - (p.destino[2] || 0));
    suma2 += d * d;
    if (d > peor) peor = d;
    return { id: p.id || '', m: d };
  });
  const rms = Math.sqrt(suma2 / n);

  return {
    ok: true,
    escala,
    yawDeg: (theta * 180) / Math.PI,
    tx, ty, tz,
    rms, peor, residuales,
    aplicar,
    inversa: (p) => {
      const x = (p[0] - tx), y = (p[1] - ty);
      return [
        (cos * x + sin * y) / escala,
        (-sin * x + cos * y) / escala,
        ((p[2] || 0) - tz) / escala,
      ];
    },
  };
}

/** Cierre de poligonal del campo: re-mides un punto ya usado y esto te dice
 *  cuánto se movió el mundo entre la primera medición y ahora (la deriva). */
export function cierreDePunto(ajuste, origenNuevo, destinoConocido) {
  if (!ajuste || !ajuste.ok) return null;
  const t = ajuste.aplicar(origenNuevo);
  return Math.hypot(t[0] - destinoConocido[0], t[1] - destinoConocido[1], t[2] - (destinoConocido[2] || 0));
}
