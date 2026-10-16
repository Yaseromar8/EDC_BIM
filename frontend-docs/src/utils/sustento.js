/**
 * sustento.js — el sustento de metrados (ESTANDAR_LDA.md §6; LECTOR_ALEPHIA_ESTANDAR.md §17 y §21).
 *
 * Una ZONA de un plano, en la versión sobre la que se midió, sustenta una cantidad de una PARTIDA
 * (por su ítem). Aquí se decide, sin red, lo que se enseña: el cuadre de una fila, el aviso cuando el
 * plano cambió de versión, la zona de un arrastre en fracciones de la página y el metrado de una fila.
 *
 * Puro: lo prueba pruebas/sustento.prueba.mjs.
 */

const texto = (v) => String(v ?? '').trim();

/** «47,10», «47.10», «1 234,5», «1,234.5», 47.1 → número; lo demás → null. */
export function numeroDe(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  let s = texto(valor).replace(/\s| /g, '');
  if (!s) return null;
  const coma = s.lastIndexOf(',');
  const punto = s.lastIndexOf('.');
  if (coma >= 0 && punto >= 0) {
    // El separador que va al final es el decimal; el otro, de miles.
    s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (/^-?\d{1,3}(,\d{3})+$/.test(s)) {
    // «9,490» o «1,234,567»: comas de MILES, como escribe el Excel de obra (y es-PE). Leerlo como 9,49
    // haría cuadrar mal una partida sin que nadie lo note.
    s = s.replace(/,/g, '');
  } else if (coma >= 0) {
    s = s.replace(',', '.');
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// La columna del METRADO, por su cabecera. Medido con un Excel real de obra (15-oct-2026, «Listado de
// cantidades» de PQT8): las cabeceras eran « MTO DISEÑO », « LA MALA 113.24% » y « LA BUENA 110.04% »,
// así que «MTO» (la abreviatura de metrado) cuenta. Orden de preferencia: metrado/MTO, luego cantidad, y
// por último total/parcial. Con varias candidatas del mismo tipo, la PRIMERA (la de diseño va antes que
// los escenarios). Quien lee puede cambiarla en la barra: esto solo es el valor inicial.
const PREFERENCIA_METRADO = [/\b(metrado|mto)\b/i, /\bcantidad\b/i, /^(total|parcial|metrado total)$/i];

/** Las cabeceras de la fila de cabecera, para elegir la columna del metrado: [{ col, nombre }]. */
export function columnasConNombre(filas = [], filaCabecera = null) {
  if (filaCabecera == null) return [];
  return (filas[filaCabecera] || []).map((v, col) => ({ col, nombre: texto(v).replace(/\s+/g, ' ') }))
    .filter(c => c.nombre);
}

/** La columna del metrado: por su cabecera, según la preferencia de arriba; null si ninguna encaja. */
export function columnaMetrado(filas = [], filaCabecera = null) {
  const buscar = (fila) => {
    const celdas = (fila || []).map(v => texto(v).replace(/\s+/g, ' '));
    for (const re of PREFERENCIA_METRADO) {
      const c = celdas.findIndex(v => re.test(v));
      if (c >= 0) return c;
    }
    return -1;
  };
  if (filaCabecera != null) {
    const c = buscar(filas[filaCabecera]);
    if (c >= 0) return c;
  }
  for (let f = 0; f < Math.min(filas.length, 15); f++) {
    const c = buscar(filas[f]);
    if (c >= 0) return c;
  }
  return null;
}

/** La columna de la UNIDAD («UND», «Unid.», «Unidad», «U»), en la cabecera o en las primeras filas; o null. */
export function columnaUnidad(filas = [], filaCabecera = null) {
  const es = (v) => /^(und|unid|unidad|u)\.?$/i.test(texto(v).trim());
  const filasAMirar = filaCabecera != null ? [filaCabecera, ...Array.from({ length: 15 }, (_, i) => i)] : Array.from({ length: 15 }, (_, i) => i);
  for (const f of filasAMirar) {
    const c = (filas[f] || []).findIndex(es);
    if (c >= 0) return c;
  }
  return null;
}

/** ¿Es la misma unidad? «m3», «M3», «m³» y «m3.» sí; «m3» y «km», no. Si falta una de las dos, no se juzga. */
export function mismaUnidad(a, b) {
  const n = (u) => texto(u).toLowerCase().replace(/³/g, '3').replace(/²/g, '2').replace(/[\s.]/g, '');
  return !n(a) || !n(b) || n(a) === n(b);
}

/** Redondeo a centésimas para comparar cantidades sin falsos descuadres de coma flotante. */
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * El CUADRE de una partida: lo que sustentan sus zonas frente a lo que dice la planilla.
 * estado: 'cuadra' | 'falta' (la planilla dice más) | 'sobra' | 'sin-sustento' | 'sin-metrado'.
 */
export function cuadre(vinculos = [], metrado = null) {
  const conCantidad = (vinculos || []).filter(v => typeof v.cantidad === 'number');
  const suma = r2(conCantidad.reduce((s, v) => s + v.cantidad, 0));
  if (!(vinculos || []).length) return { suma: 0, diferencia: null, estado: 'sin-sustento' };
  if (metrado == null) return { suma, diferencia: null, estado: 'sin-metrado' };
  const diferencia = r2(metrado - suma);
  const estado = Math.abs(diferencia) < 0.005 ? 'cuadra' : diferencia > 0 ? 'falta' : 'sobra';
  return { suma, diferencia, estado };
}

/** El aviso de un vínculo medido sobre una versión que ya no es la vigente, o ''. */
export function avisoDeVersion(v = {}) {
  if (!v || !v.version_number || !v.version_vigente) return '';
  return v.version_number < v.version_vigente
    ? `Se midió sobre la V${v.version_number}; la vigente es la V${v.version_vigente}. Hay que revisar la cantidad.`
    : '';
}

/** Los vínculos agrupados por ítem: { '02.01.03': [v, v], … }. */
export function porItem(vinculos = []) {
  const mapa = {};
  for (const v of vinculos || []) (mapa[v.item] = mapa[v.item] || []).push(v);
  return mapa;
}

/**
 * La ZONA de un arrastre, en fracciones de la página: [x0, y0, x1, y1] ordenada y recortada a 0–1,
 * con 4 decimales. `a` y `b` son puntos {x, y} en píxeles y `caja` el rectángulo de la hoja.
 * Un arrastre de menos de 6 px no es una zona (null): fue un clic.
 */
export function zonaDeArrastre(a, b, caja) {
  if (!a || !b || !caja || !(caja.width > 0) || !(caja.height > 0)) return null;
  if (Math.abs(b.x - a.x) < 6 || Math.abs(b.y - a.y) < 6) return null;
  const fx = (x) => Math.min(1, Math.max(0, (x - caja.left) / caja.width));
  const fy = (y) => Math.min(1, Math.max(0, (y - caja.top) / caja.height));
  const r4 = (n) => Math.round(n * 10000) / 10000;
  const [x0, x1] = [fx(a.x), fx(b.x)].sort((p, q) => p - q);
  const [y0, y1] = [fy(a.y), fy(b.y)].sort((p, q) => p - q);
  if (x1 - x0 <= 0 || y1 - y0 <= 0) return null;
  return [r4(x0), r4(y0), r4(x1), r4(y1)];
}

/** «30.10 m³», con el mismo formato es-PE que el resto del portal (Partidas). */
export function cantidadLegible(cantidad, unidad = '') {
  if (typeof cantidad !== 'number') return '—';
  const u = texto(unidad).replace(/^m3$/i, 'm³').replace(/^m2$/i, 'm²');
  return `${cantidad.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${u ? ' ' + u : ''}`;
}

// ── EL CIRCUITO PLANILLA ↔ PLANO (LECTOR_ALEPHIA_ESTANDAR §22) ───────────────────────────────
// El metrado se revisa al final: el trabajo EMPIEZA en la planilla. «+ Vincular un plano» abre el
// plano con la intención en la dirección (`vincular`, `cantidad`, `planilla`), y el plano la usa UNA
// vez y la borra, para que abrir otro plano después no vuelva a pedir una zona. De vuelta, «Planilla ›»
// abre el Excel con `fila=<ítem>`, que elige esa fila.

// `vista`: en un DWG, la presentación en la que abrir (la del vínculo).
const DEL_CIRCUITO = ['vincular', 'cantidad', 'unidad', 'planilla', 'fila', 'vista'];

/** La intención de vincular que trae la dirección, o null. */
export function vincularDeLaDireccion(search = '') {
  const p = new URLSearchParams(search || '');
  const item = texto(p.get('vincular'));
  if (!item) return null;
  return { item, cantidad: texto(p.get('cantidad')), unidad: texto(p.get('unidad')), planilla: texto(p.get('planilla')) || null };
}

/** La fila (ítem) que la dirección pide elegir en una planilla, o ''. */
export function filaDeLaDireccion(search = '') {
  return texto(new URLSearchParams(search || '').get('fila'));
}

/** La `search` sin los parámetros del circuito (se consumen una vez). */
export function sinCircuito(search = '') {
  const p = new URLSearchParams(search || '');
  DEL_CIRCUITO.forEach(k => p.delete(k));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** La `search` con parámetros del circuito añadidos a una dirección de documento ya hecha. */
export function conCircuito(searchDelDocumento = '', extra = {}) {
  const p = new URLSearchParams(searchDelDocumento || '');
  DEL_CIRCUITO.forEach(k => p.delete(k));
  for (const k of DEL_CIRCUITO) if (extra[k] != null && texto(extra[k]) !== '') p.set(k, texto(extra[k]));
  const s = p.toString();
  return s ? `?${s}` : '';
}
