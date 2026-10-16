/**
 * IlustracionesDeObra — dibujos de obra SOLO CON LÍNEAS, a modo de BOCETO de
 * dibujante: trazos dobles a mano alzada, rayado de corte en el terreno y más
 * piezas por elemento, en el registro de las ilustraciones de Claude (sin caras,
 * sin rellenos ni sombras). Pedido del propietario (14-oct-2026): «fondo
 * disimulado, opaco, gris» y después «tenga lo de boceto pero más elaborados».
 *
 * DÓNDE SÍ Y DÓNDE NO: nunca detrás de una tabla ni de una pantalla de trabajo;
 * solo en la ENTRADA y en los ESTADOS VACÍOS.
 *
 * El trazo «a mano» es DETERMINISTA (semilla fija): el mismo dibujo en cada
 * carga, sin parpadeos. Todo usa `currentColor`; el gris y la opacidad los pone
 * quien lo coloca. Decorativo: `aria-hidden` y sin eventos.
 */
import React from 'react';
import { LAMINAS, COLORES_TINTA } from './laminasDeEstudio';
import { IlustracionPlana } from './IlustracionesPlanas';

// ── Motor de boceto ──────────────────────────────────────────────────────────

function azar(semilla) {
  let s = semilla | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function curva(pts, cerrado) {
  const p = cerrado ? [...pts, pts[0], pts[1]] : pts;
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    d += ` C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)} ${(b[1] + (c[1] - a[1]) / 6).toFixed(1)}`
      + ` ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)} ${(c[1] - (e[1] - b[1]) / 6).toFixed(1)}`
      + ` ${c[0].toFixed(1)} ${c[1].toFixed(1)}`;
  }
  return d;
}

// Un segmento recto se parte en tramos para que el temblor de la mano se note.
function trocear(pts, paso = 18) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / paso));
    for (let k = 1; k <= n; k++) out.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
  }
  return out;
}

/** Convierte una lista de trazos en <path> de boceto (dos pasadas, la segunda más fina). */
function dibujar(trazos, semilla) {
  const r = azar(semilla);
  const tiembla = (p, a) => [p[0] + (r() - 0.5) * a, p[1] + (r() - 0.5) * a];
  const out = [];
  trazos.forEach((t, i) => {
    const base = t.recto ? trocear(t.pts) : t.pts;
    const pasadas = t.pasadas ?? 2;
    for (let k = 0; k < pasadas; k++) {
      out.push(
        <path key={`${i}-${k}`} d={curva(base.map(p => tiembla(p, t.a ?? 1.6)), t.cerrado)}
          strokeWidth={k ? (t.w ?? 2.4) * 0.5 : (t.w ?? 2.4)} opacity={k ? 0.6 : 1} />,
      );
    }
  });
  return out;
}

// Atajos de geometría
const S = (...pts) => ({ pts, recto: true });                          // poligonal recta
const C = (...pts) => ({ pts });                                        // curva suave
const caja = (x, y, w, h, extra = {}) => ({ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], recto: true, cerrado: true, ...extra });
const circulo = (cx, cy, rr, extra = {}) => ({
  pts: Array.from({ length: 14 }, (_, i) => [cx + rr * Math.cos(i * Math.PI / 7), cy + rr * Math.sin(i * Math.PI / 7)]),
  cerrado: true, a: 0.8, ...extra,
});
const fino = t => ({ ...t, w: 1.2, pasadas: 1 });
function rayado(x0, x1, y, alto = 10, paso = 9) {        // rayado de corte bajo el terreno
  const t = [];
  for (let x = x0; x < x1; x += paso) t.push({ pts: [[x, y + alto], [x + alto * 0.8, y + 1]], w: 1, pasadas: 1, a: 0.8 });
  return t;
}

const TRAZO = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' };

// ── El paisaje ───────────────────────────────────────────────────────────────

function persona(x, b, conPlano) {
  // De perfil, sin rasgos: casco, cabeza, chaleco con cintas, brazos y botas.
  const t = [
    C([x - 13, b - 92], [x - 12, b - 106], [x, b - 112], [x + 12, b - 106], [x + 13, b - 92]),
    S([x - 18, b - 92], [x + 22, b - 92]),
    C([x - 10, b - 92], [x - 11, b - 80], [x - 6, b - 72], [x + 4, b - 70], [x + 10, b - 76], [x + 11, b - 90]),
    C([x - 20, b - 66], [x - 4, b - 70], [x + 14, b - 66], [x + 20, b - 54], [x + 20, b - 30], [x + 12, b - 28]),
    C([x - 20, b - 66], [x - 22, b - 46], [x - 20, b - 28], [x - 12, b - 28]),
    fino(S([x - 21, b - 48], [x + 20, b - 48])), fino(S([x - 21, b - 40], [x + 20, b - 40])),
    S([x - 12, b - 28], [x - 12, b - 2]), S([x + 8, b - 28], [x + 9, b - 2]),
    S([x - 18, b], [x - 4, b]), S([x + 4, b], [x + 18, b]),
  ];
  if (conPlano) {
    t.push(C([x + 14, b - 62], [x + 26, b - 54], [x + 34, b - 58]));
    t.push(caja(x + 30, b - 74, 34, 24, { w: 2 }), fino(S([x + 47, b - 74], [x + 47, b - 50])));
    t.push(fino(S([x + 34, b - 66], [x + 42, b - 58], [x + 52, b - 66])));
  } else {
    t.push(C([x + 14, b - 62], [x + 28, b - 72], [x + 38, b - 92]));       // señala
    t.push(fino(S([x + 38, b - 92], [x + 42, b - 100])));
  }
  return t;
}

const PAISAJE = (() => {
  const t = [];
  const suelo = 188;   // el canal y el buzón van EN CORTE bajo esta línea
  // horizonte y talud lejano
  t.push({ ...C([0, 150], [140, 120], [280, 138], [430, 126], [600, 142], [760, 120], [920, 134], [1060, 118], [1200, 132]), w: 1.6, pasadas: 1 });
  t.push({ ...C([0, 176], [200, 160], [380, 172], [640, 164], [900, 176], [1200, 166]), w: 1.1, pasadas: 1, a: 1 });
  // grúa torre al fondo
  t.push(S([470, suelo], [470, 36]), S([482, suelo], [482, 36]));
  for (let y = 44; y < suelo - 6; y += 14) t.push(fino(S([470, y], [482, y + 14])), fino(S([482, y], [470, y + 14])));
  t.push(S([420, 40], [640, 40]), S([476, 26], [476, 40]), fino(S([476, 26], [600, 40])), fino(S([476, 26], [430, 40])));
  t.push(caja(420, 40, 26, 14, { w: 1.6 }), fino(S([586, 40], [586, 96])), fino(S([580, 96], [592, 96])));
  // terreno con rayado de corte
  t.push({ ...S([0, suelo], [1200, suelo]), w: 2.6 });
  t.push(...rayado(0, 318, suelo), ...rayado(582, 806, suelo), ...rayado(876, 1200, suelo));
  // montículo de tierra con piedras
  t.push(C([228, suelo], [252, suelo - 30], [286, suelo - 38], [318, suelo]));
  [[256, suelo - 12], [276, suelo - 22], [298, suelo - 10], [270, suelo - 6]].forEach(([cx, cy]) => t.push(circulo(cx, cy, 3.5, { w: 1.2, pasadas: 1 })));
  // excavadora
  t.push(caja(36, suelo - 26, 150, 22, { w: 2.6 }));
  [56, 84, 112, 140, 166].forEach(x => t.push(circulo(x, suelo - 15, 6, { w: 1.6 })));
  t.push(caja(50, suelo - 56, 108, 30), caja(30, suelo - 52, 22, 24, { w: 2 }));
  [64, 78, 92].forEach(x => t.push(fino(S([x, suelo - 50], [x, suelo - 32]))));
  t.push(S([118, suelo - 56], [118, suelo - 92], [146, suelo - 92], [160, suelo - 70], [160, suelo - 56]));
  t.push(fino(S([124, suelo - 86], [144, suelo - 86], [154, suelo - 70], [124, suelo - 70], [124, suelo - 86])));
  t.push({ ...S([156, suelo - 62], [214, suelo - 128], [250, suelo - 76]), w: 3.4 });
  t.push({ ...S([166, suelo - 58], [222, suelo - 120], [254, suelo - 74]), w: 1.8 });
  t.push(fino(S([150, suelo - 70], [196, suelo - 116])), fino(S([224, suelo - 116], [244, suelo - 90])));
  t.push(S([238, suelo - 78], [268, suelo - 82], [272, suelo - 58], [258, suelo - 46], [238, suelo - 54]));
  [[244, suelo - 46], [254, suelo - 44], [264, suelo - 48]].forEach(([x, y]) => t.push(fino(S([x, y], [x - 2, y + 7]))));
  [[214, suelo - 125], [252, suelo - 76], [160, suelo - 60]].forEach(([cx, cy]) => t.push(circulo(cx, cy, 3, { w: 1.4, pasadas: 1 })));
  // canal en construcción: revestimiento con juntas, agua y encofrado
  // (en corte: revestimiento de concreto con su espesor, juntas, agua y terreno rayado alrededor)
  t.push({ ...S([318, suelo], [352, suelo + 44], [548, suelo + 44], [582, suelo]), w: 2.6 });
  t.push(S([330, suelo], [360, suelo + 38], [540, suelo + 38], [570, suelo]));
  [400, 450, 500].forEach(x => t.push(fino(S([x, suelo + 38], [x, suelo + 44]))));
  t.push(fino(S([340, suelo + 13], [349, suelo + 26])), fino(S([560, suelo + 13], [551, suelo + 26])));
  t.push({ ...C([348, suelo + 22], [390, suelo + 19], [430, suelo + 22], [470, suelo + 19], [510, suelo + 22], [552, suelo + 21]), w: 1.6, pasadas: 1 });
  [[376, suelo + 30], [444, suelo + 31], [506, suelo + 29]].forEach(([x, y]) => t.push(fino(C([x, y], [x + 8, y - 3], [x + 16, y]))));
  for (let x = 306; x < 318; x += 6) t.push(fino(S([x, suelo + 8], [x + 10, suelo + 44])));
  for (let x = 586; x < 600; x += 6) t.push(fino(S([x, suelo + 8], [x - 6, suelo + 44])));
  // carretilla
  t.push(C([600, suelo - 22], [628, suelo - 26], [648, suelo - 22]), S([600, suelo - 22], [612, suelo - 10], [640, suelo - 10], [648, suelo - 22]));
  t.push(circulo(618, suelo - 6, 6, { w: 1.6 }), S([640, suelo - 18], [668, suelo - 30]), fino(S([630, suelo - 10], [634, suelo])));
  // personas: una revisa el plano, la otra señala
  t.push(...persona(690, suelo, true), ...persona(752, suelo, false));
  // buzón en corte con escalera y tuberías
  // (en corte bajo el suelo: tapa, cuerpo, escalera de pates y tuberías de entrada y salida)
  t.push({ ...S([818, suelo - 4], [818, suelo + 48]), w: 2.4 }, { ...S([864, suelo + 48], [864, suelo - 4]), w: 2.4 });
  t.push({ ...S([810, suelo - 6], [872, suelo - 6]), w: 3.2 }, { ...S([818, suelo + 48], [864, suelo + 48]), w: 2.4 });
  [suelo + 6, suelo + 18, suelo + 30].forEach(y => t.push(fino(S([832, y], [850, y]))));
  t.push(S([776, suelo + 30], [818, suelo + 30]), S([776, suelo + 42], [818, suelo + 42]), S([864, suelo + 30], [906, suelo + 30]), S([864, suelo + 42], [906, suelo + 42]));
  for (let y = suelo + 4; y < suelo + 28; y += 7) t.push(fino(S([808, y], [814, y + 6])), fino(S([868, y], [874, y + 6])));
  // gaviones apilados
  [[908, suelo - 32, 44], [954, suelo - 32, 44], [930, suelo - 64, 44]].forEach(([x, y, w]) => {
    t.push(caja(x, y, w, 32, { w: 2 }));
    for (let k = 1; k < 4; k++) t.push(fino(S([x + k * w / 4, y], [x + k * w / 4, y + 32])));
    t.push(fino(S([x, y + 16], [x + w, y + 16])));
    [[0.2, 0.3], [0.6, 0.25], [0.4, 0.75], [0.8, 0.7]].forEach(([u, v]) => t.push(circulo(x + u * w, y + v * 32, 3, { w: 1, pasadas: 1 })));
  });
  // conos y valla
  [[1018, 0], [1046, 0]].forEach(([x]) => {
    t.push(S([x - 12, suelo], [x, suelo - 38], [x + 12, suelo]), S([x - 16, suelo], [x + 16, suelo]));
    t.push(fino(S([x - 6, suelo - 18], [x + 6, suelo - 18])), fino(S([x - 4, suelo - 26], [x + 4, suelo - 26])));
  });
  // topógrafo: trípode, estación total y jalón con prisma
  t.push(S([1110, suelo - 70], [1088, suelo]), S([1110, suelo - 70], [1132, suelo]), S([1110, suelo - 70], [1110, suelo]));
  t.push(caja(1098, suelo - 92, 24, 22), circulo(1104, suelo - 81, 4, { w: 1.4 }), fino(S([1122, suelo - 86], [1130, suelo - 86])));
  t.push(S([1170, suelo], [1170, suelo - 96]), circulo(1170, suelo - 102, 6, { w: 1.8 }), fino(S([1164, suelo - 60], [1176, suelo - 60])));
  return dibujar(t, 7);
})();

/** Paisaje de obra a lo ancho, en boceto. */
export function PaisajeDeObra({ style }) {
  return (
    <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false"
      style={{ display: 'block', width: '100%', height: '100%', ...style }}>
      <g {...TRAZO}>{PAISAJE}</g>
    </svg>
  );
}

// ── Estados vacíos ───────────────────────────────────────────────────────────

const PLANO = (() => {
  const t = [
    { ...S([30, 44], [176, 36], [182, 166], [36, 174]), cerrado: true, w: 3.4 },
    fino(S([106, 40], [110, 170])), fino(S([33, 106], [179, 100])),
    { ...S([48, 66], [64, 94], [92, 93], [106, 64]), w: 2.6 },                 // sección del canal
    fino(S([56, 80], [98, 79])), fino(S([46, 102], [108, 100])),
    fino(S([46, 98], [46, 106])), fino(S([108, 96], [108, 104])),
    fino(C([60, 104], [76, 106], [92, 104])),
    caja(122, 128, 52, 30, { w: 2 }), fino(S([122, 138], [174, 138])), fino(S([122, 148], [174, 148])), fino(S([146, 128], [146, 158])),
    fino(S([120, 56], [168, 52])), fino(S([120, 66], [158, 63])), fino(S([120, 76], [164, 73])),
    { ...S([142, 92], [196, 26]), w: 5 }, fino(S([150, 82], [158, 88])),     // lápiz
    S([142, 92], [138, 104], [148, 98]), fino(S([186, 38], [194, 44])),
    { ...S([20, 186], [150, 182]), w: 2 },                                     // escalímetro
    ...[30, 46, 62, 78, 94, 110, 126, 142].map(x => fino(S([x, 185], [x, 179]))),
  ];
  return dibujar(t, 3);
})();

const CASCO = (() => {
  const t = [
    { ...C([46, 128], [48, 92], [70, 68], [104, 62], [138, 68], [160, 92], [162, 128]), w: 3.6 },
    { ...C([30, 130], [70, 142], [104, 146], [140, 142], [178, 130]), w: 3.4 },
    C([30, 130], [32, 124], [46, 124]), C([178, 130], [176, 124], [162, 124]),
    S([98, 64], [96, 126]), S([110, 64], [112, 126]),
    fino(C([78, 72], [68, 98], [70, 126])), fino(C([130, 72], [140, 98], [138, 126])),
    caja(88, 88, 32, 20, { w: 1.4, pasadas: 1 }),
    fino(C([58, 132], [70, 168], [104, 176], [138, 168], [150, 132])),        // barbiquejo
    fino(C([60, 120], [104, 112], [148, 120])),                                 // arnés interior
    { ...S([24, 186], [184, 186]), w: 1.8, pasadas: 1 },
    fino(C([150, 186], [164, 170], [182, 168], [190, 178], [186, 186])),        // guante
    fino(S([164, 172], [166, 160])), fino(S([170, 170], [173, 158])), fino(S([177, 170], [180, 160])),
  ];
  return dibujar(t, 5);
})();

/** Carpeta vacía. Desde el 16-oct-2026, la ilustración plana (estilo ACC) de la
 *  carpeta; el boceto del plano sigue en PLANO para la lámina de la entrada. */
export function IlustracionPlano({ tamano = 130 }) {
  return <IlustracionPlana nombre="carpeta" tamano={Math.round(tamano * 0.75)} />;
}

/** Sin resultados. Desde el 16-oct-2026, la ilustración plana de la búsqueda;
 *  el boceto del casco sigue en CASCO. */
export function IlustracionCasco({ tamano = 120 }) {
  return <IlustracionPlana nombre="busqueda" tamano={Math.round(tamano * 0.8)} />;
}

/** Boceto del plano, tal como era (banco de la entrada). */
export function BocetoPlano({ tamano = 130 }) {
  return (
    <svg viewBox="0 0 208 208" width={tamano} height={tamano} aria-hidden="true" focusable="false">
      <g {...TRAZO}>{PLANO}</g>
    </svg>
  );
}

/** Boceto del casco, tal como era (banco de la entrada). */
export function BocetoCasco({ tamano = 120 }) {
  return (
    <svg viewBox="0 0 208 208" width={tamano} height={tamano} aria-hidden="true" focusable="false">
      <g {...TRAZO}>{CASCO}</g>
    </svg>
  );
}

/** Estado vacío: ilustración tenue + qué pasa + qué hacer. */
export function EstadoVacio({ ilustracion, titulo, texto }) {
  return (
    <div role="status" style={{ height: '100%', minHeight: 260, display: 'flex', flexDirection: 'column', alignItems: 'center',
                                justifyContent: 'center', gap: 10, padding: 32, textAlign: 'center' }}>
      <div style={{ color: 'var(--a-neutral-400, #B0AEA5)' }}>{ilustracion}</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--a-neutral-700, #333330)' }}>{titulo}</div>
      {texto && <div style={{ fontSize: 13, color: 'var(--a-neutral-500, #72706B)', maxWidth: 360, lineHeight: 1.5 }}>{texto}</div>}
    </div>
  );
}

// ── Láminas de estudio (aprobadas el 14-oct-2026) ────────────────────────────
// Se generan UNA vez por combinación de lámina y colores (son deterministas) y se
// insertan tal cual: el SVG sale de laminasDeEstudio.js, sin datos de nadie.
const _cache = new Map();
/**
 * Una lámina de estudio. `tono` = 'tinta' (papel y tinta, para revisarlas) o
 * 'tenue' (solo trazo en gris, sin papel, para pantallas: el gris lo hereda de
 * `color` y la opacidad la pone quien la coloca).
 */
export function LaminaDeEstudio({ nombre, tono = 'tenue', color = '#72706B', style }) {
  const clave = `${nombre}|${tono}|${color}`;
  if (!_cache.has(clave)) {
    const col = tono === 'tinta' ? COLORES_TINTA : { tinta: color, guia: '#C9C6BC', agua: color, papel: null };
    _cache.set(clave, (LAMINAS[nombre] || LAMINAS.canal)(col));
  }
  const { viewBox, markup } = _cache.get(clave);
  return (
    <svg viewBox={viewBox} aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', width: '100%', height: '100%', ...style }}
      dangerouslySetInnerHTML={{ __html: markup }} />
  );
}

// Qué objeto dibuja cada estado vacío. Los nombres son los de las láminas que
// ocupaban ese sitio, para no tocar a quien los llama.
const PLANA_DE = {
  canal: 'revision',        // Revisiones
  excavadora: 'cuaderno',   // Cuaderno de obra
  vial: 'protocolo',        // Protocolos
  gaviones: 'envio',        // Transmittals
  perfil: 'cronograma',     // Plan de entrega
  alcantarilla: 'plano',    // Planos
};

/**
 * La ilustración de un estado vacío, centrada encima del mensaje. Desde el
 * 16-oct-2026 es PLANA, en el registro de ACC que capturó el propietario: un
 * objeto, relleno claro, contorno fino y un círculo de acento.
 */
export function LaminaVacia({ nombre }) {
  return (
    <div style={{ margin: '4px auto 14px' }}>
      <IlustracionPlana nombre={PLANA_DE[nombre] || nombre} tamano={96} />
    </div>
  );
}
