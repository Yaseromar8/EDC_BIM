// Formas del Tablero (docs/visor/60), como las de Forma Board: datos y geometría, sin componentes.
//
// Una forma es un elemento más del lienzo (`tipo: 'forma'`) con su caja (x, y, w, h) y su estilo: `forma`, `color`,
// `relleno` (nada | suave | solido), `opacidad` (0,1–1), `grosor` (s | m | l | xl), `trazo` (continuo | discontinuo |
// punteado) y, si se escribe dentro, `texto` con su letra, tamaño y alineación. El trazado se calcula aquí a partir
// de la caja, siempre DENTRO de ella (la línea no se sale de lo que se elige).

export const FORMAS = Object.freeze([
  ['nube', 'Nube de revisión'], ['rectangulo', 'Rectángulo'], ['elipse', 'Elipse'], ['triangulo', 'Triángulo'],
  ['rombo', 'Rombo'], ['pentagono', 'Pentágono'], ['hexagono', 'Hexágono'], ['octogono', 'Octógono'],
  ['estrella', 'Estrella'], ['paralelogramo', 'Paralelogramo'], ['trapecio', 'Trapecio'], ['capsula', 'Cápsula'],
  ['flechaDerecha', 'Flecha a la derecha'], ['flechaIzquierda', 'Flecha a la izquierda'], ['rectanguloX', 'Rectángulo con una X'],
]);
export const NOMBRE_FORMA = Object.freeze(Object.fromEntries(FORMAS));

// Colores de línea: fuertes, para que se lean encima de una lámina (las notas tienen los suyos, suaves).
export const COLORES_FORMA = Object.freeze({
  negro: '#1D1D1B', gris: '#8A8880', azul: '#2F6FB3', celeste: '#3E9BD6', verde: '#3F8F5A',
  amarillo: '#D99A00', naranja: '#E06A1B', rojo: '#D0342C', violeta: '#8E5BC9', rosa: '#D9578D',
});
export const GROSORES = Object.freeze({ s: 2, m: 3.5, l: 6, xl: 10 });      // px del lienzo
export const TRAZOS = Object.freeze([['continuo', 'Continuo'], ['discontinuo', 'Discontinuo'], ['punteado', 'Punteado']]);
export const RELLENOS = Object.freeze([['nada', 'Sin relleno'], ['suave', 'Suave'], ['solido', 'Sólido']]);
export const FORMA_LADO = 200;
export const FORMA_MIN = 16;
// Lo que estrena una forma: una nube de revisión roja, como se marcan los cambios en una lámina.
export const ESTILO_FORMA = Object.freeze({ color: 'rojo', relleno: 'nada', opacidad: 1, grosor: 'm', trazo: 'continuo' });

export const estiloForma = (n) => ({ ...ESTILO_FORMA, ...Object.fromEntries(Object.entries(n || {}).filter(([k]) => k in ESTILO_FORMA)) });
export const colorForma = (n) => COLORES_FORMA[n?.color] || COLORES_FORMA[ESTILO_FORMA.color];
export const grosorForma = (n) => GROSORES[n?.grosor] || GROSORES[ESTILO_FORMA.grosor];
export const discontinuo = (n) => {
  const g = grosorForma(n);
  if (n?.trazo === 'discontinuo') return `${(g * 3).toFixed(1)} ${(g * 2.2).toFixed(1)}`;
  if (n?.trazo === 'punteado') return `0 ${(g * 2.2).toFixed(1)}`;
  return undefined;
};
export const rellenoForma = (n) => (n?.relleno === 'solido' ? colorForma(n) : n?.relleno === 'suave' ? colorForma(n) : 'none');
export const opacidadRelleno = (n) => (n?.relleno === 'suave' ? 0.16 : 1);

const f = (v) => Math.round(v * 100) / 100;
const poligono = (pts) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')} Z`;

// Puntos normalizados (0–1) de cada polígono.
const NORMALES = {
  triangulo: [[0.5, 0], [1, 1], [0, 1]],
  rombo: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  paralelogramo: [[0.25, 0], [1, 0], [0.75, 1], [0, 1]],
  trapecio: [[0.2, 0], [0.8, 0], [1, 1], [0, 1]],
  flechaDerecha: [[0, 0.3], [0.62, 0.3], [0.62, 0], [1, 0.5], [0.62, 1], [0.62, 0.7], [0, 0.7]],
  flechaIzquierda: [[1, 0.3], [0.38, 0.3], [0.38, 0], [0, 0.5], [0.38, 1], [0.38, 0.7], [1, 0.7]],
};
const regular = (lados, giro = -Math.PI / 2) => Array.from({ length: lados }, (_, i) => {
  const a = giro + (i * 2 * Math.PI) / lados;
  return [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)];
});
const estrella = () => Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.2 : 0.5;
  return [0.5 + r * Math.cos(a), 0.55 + r * Math.sin(a) * 1.05];
});

// La nube: arcos hacia fuera a lo largo de una elipse, como las nubes de revisión de un plano. El número de arcos
// depende del contorno, para que el «festón» tenga un tamaño parecido en una nube pequeña y en una grande.
function nube(x0, y0, w, h) {
  const lado = Math.min(w, h);
  const festo = Math.min(Math.max(lado * 0.16, 10), 80);            // largo de cada arco
  const rx = w / 2, ry = h / 2;
  const perimetro = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const n = Math.max(8, Math.round(perimetro / festo));
  const alto = festo * 0.32;                                        // lo que el arco sobresale de la elipse
  const ex = Math.max(1, rx - alto), ey = Math.max(1, ry - alto), cx = x0 + rx, cy = y0 + ry;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i * 2 * Math.PI) / n;
    return [cx + ex * Math.cos(a), cy + ey * Math.sin(a)];
  });
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
    const cuerda = Math.hypot(bx - ax, by - ay);
    // Radio del arco a partir de la cuerda y de lo que sobresale (flecha del arco).
    const r = (cuerda * cuerda) / (8 * alto) + alto / 2;
    d += ` A${f(r)} ${f(r)} 0 0 1 ${f(bx)} ${f(by)}`;
  }
  return `${d} Z`;
}

/** El trazado SVG de una forma dentro de su caja (0, 0, w, h), metido medio grosor para que la línea no se salga. */
export function trazadoDe(forma, w, h, grosor = GROSORES.m) {
  const m = grosor / 2, x0 = m, y0 = m, W = Math.max(1, w - grosor), H = Math.max(1, h - grosor);
  const escalar = (pts) => pts.map(([x, y]) => [x0 + x * W, y0 + y * H]);
  switch (forma) {
    case 'nube': return nube(x0, y0, W, H);
    case 'elipse':
      return `M${f(x0)} ${f(y0 + H / 2)} A${f(W / 2)} ${f(H / 2)} 0 1 1 ${f(x0 + W)} ${f(y0 + H / 2)} A${f(W / 2)} ${f(H / 2)} 0 1 1 ${f(x0)} ${f(y0 + H / 2)} Z`;
    case 'capsula': {
      const r = Math.min(W, H) / 2;
      return `M${f(x0 + r)} ${f(y0)} H${f(x0 + W - r)} A${f(r)} ${f(r)} 0 0 1 ${f(x0 + W - r)} ${f(y0 + H)} H${f(x0 + r)} A${f(r)} ${f(r)} 0 0 1 ${f(x0 + r)} ${f(y0)} Z`;
    }
    case 'rectanguloX':
      return `${poligono(escalar([[0, 0], [1, 0], [1, 1], [0, 1]]))} M${f(x0)} ${f(y0)} L${f(x0 + W)} ${f(y0 + H)} M${f(x0 + W)} ${f(y0)} L${f(x0)} ${f(y0 + H)}`;
    case 'pentagono': return poligono(escalar(regular(5)));
    case 'hexagono': return poligono(escalar(regular(6, 0)));
    case 'octogono': return poligono(escalar(regular(8, Math.PI / 8)));
    case 'estrella': return poligono(escalar(estrella()));
    default:
      if (NORMALES[forma]) return poligono(escalar(NORMALES[forma]));
      return poligono(escalar([[0, 0], [1, 0], [1, 1], [0, 1]]));        // rectángulo
  }
}

// Validar una forma que llega del portapapeles: solo pasan los valores que el lienzo conoce.
export function limpiarForma(n) {
  return {
    forma: NOMBRE_FORMA[n.forma] ? n.forma : 'rectangulo',
    ...(COLORES_FORMA[n.color] ? { color: n.color } : {}),
    ...(RELLENOS.some(r => r[0] === n.relleno) ? { relleno: n.relleno } : {}),
    ...(Number.isFinite(n.opacidad) ? { opacidad: Math.min(1, Math.max(0.1, n.opacidad)) } : {}),
    ...(GROSORES[n.grosor] ? { grosor: n.grosor } : {}),
    ...(TRAZOS.some(t => t[0] === n.trazo) ? { trazo: n.trazo } : {}),
  };
}

// ── Flecha y lápiz (docs/visor/62) ──────────────────────────────────────────────────────────────────────────────
// Los dos viven en una caja (x, y, w, h) como el resto, y se mueven y escalan con ella:
// - FLECHA: va de una esquina de su caja a la opuesta; `invX` / `invY` dicen hacia dónde apunta. `puntas`: dónde
//   lleva la punta (fin, ambas, ninguna).
// - TRAZO (lápiz): `puntos` normalizados 0–1 dentro de su caja; al escalarla, el dibujo se escala entero.
export const PUNTAS = Object.freeze([['fin', 'Punta al final'], ['ambas', 'Puntas en los dos extremos'], ['ninguna', 'Sin puntas']]);
export const ESTILO_FLECHA = Object.freeze({ color: 'negro', grosor: 'm', trazo: 'continuo', puntas: 'fin' });
export const ESTILO_TRAZO = Object.freeze({ color: 'negro', grosor: 'm', opacidad: 1 });
export const FLECHA_LARGO = 200;                  // un clic sin arrastrar: una flecha de 200 hacia la derecha

export const extremosDeFlecha = (n) => [[n.invX ? n.w : 0, n.invY ? n.h : 0], [n.invX ? 0 : n.w, n.invY ? 0 : n.h]];

// La línea y sus puntas (chevrones abiertos, como un plano), en coordenadas de la caja.
export function trazadoDeFlecha(n) {
  const g = grosorForma(n);
  const [a, b] = extremosDeFlecha(n);
  const largo = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / largo, uy = (b[1] - a[1]) / largo;
  const s = Math.min(Math.max(10, g * 3.4), largo / 2);
  const punta = (p, sx, sy) => `M${f(p[0] - s * sx + s * 0.55 * -sy)} ${f(p[1] - s * sy + s * 0.55 * sx)} L${f(p[0])} ${f(p[1])} L${f(p[0] - s * sx - s * 0.55 * -sy)} ${f(p[1] - s * sy - s * 0.55 * sx)}`;
  const puntas = n.puntas || 'fin';
  return [
    `M${f(a[0])} ${f(a[1])} L${f(b[0])} ${f(b[1])}`,
    puntas !== 'ninguna' ? punta(b, ux, uy) : '',
    puntas === 'ambas' ? punta(a, -ux, -uy) : '',
  ].join(' ').trim();
}

// El trazo a mano, suavizado (curvas por los puntos medios), escalado a su caja.
export function trazadoDeTrazo(n) {
  const pts = (n.puntos || []).map(([x, y]) => [x * n.w, y * n.h]);
  if (pts.length < 2) return pts.length ? `M${f(pts[0][0])} ${f(pts[0][1])} l0.01 0` : '';
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
    d += ` Q${f(pts[i][0])} ${f(pts[i][1])} ${f(m[0])} ${f(m[1])}`;
  }
  const u = pts[pts.length - 1];
  return `${d} L${f(u[0])} ${f(u[1])}`;
}

// Puntos del mundo → caja + puntos normalizados (con margen de medio grosor para que la línea no se salga).
export function cajaDeTrazo(mundo, grosor = GROSORES.m) {
  const m = grosor / 2;
  const xs = mundo.map(p => p[0]), ys = mundo.map(p => p[1]);
  const x = Math.min(...xs) - m, y = Math.min(...ys) - m;
  const w = Math.max(1, Math.max(...xs) + m - x), h = Math.max(1, Math.max(...ys) + m - y);
  return { x, y, w, h, puntos: mundo.map(([px, py]) => [Math.round(((px - x) / w) * 10000) / 10000, Math.round(((py - y) / h) * 10000) / 10000]) };
}

export function limpiarFlecha(n) {
  return {
    invX: !!n.invX, invY: !!n.invY,
    ...(COLORES_FORMA[n.color] ? { color: n.color } : {}),
    ...(GROSORES[n.grosor] ? { grosor: n.grosor } : {}),
    ...(TRAZOS.some(t => t[0] === n.trazo) ? { trazo: n.trazo } : {}),
    ...(PUNTAS.some(t => t[0] === n.puntas) ? { puntas: n.puntas } : {}),
  };
}

export function limpiarTrazo(n) {
  const puntos = (Array.isArray(n.puntos) ? n.puntos : []).slice(0, 5000)
    .filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([x, y]) => [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]);
  return puntos.length ? {
    puntos,
    ...(COLORES_FORMA[n.color] ? { color: n.color } : {}),
    ...(GROSORES[n.grosor] ? { grosor: n.grosor } : {}),
    ...(Number.isFinite(n.opacidad) ? { opacidad: Math.min(1, Math.max(0.1, n.opacidad)) } : {}),
  } : null;
}
