/**
 * lectorDeTablas.js — el modo TABLA del lector (docs/ux/ESTANDAR_LDA.md §5 y §6; LECTOR_ALEPHIA_ESTANDAR §20).
 *
 * Una planilla (XLSX, CSV…) se lee como tabla, no como página. Lo que importa en obra es la FILA de cada
 * partida, y una fila se reconoce por su CLAVE (el ítem «02.01.03»), nunca por su número: el Excel se
 * actualiza a diario, se reordena y crece, y la clave sigue siendo la misma.
 *
 * Aquí también vive el ANCLA del estándar LDA en su forma corta (`lda:…`), común a todos los modos:
 *   lda:<código>@V<n>#pagina=1&zona=205,118,405,202
 *   lda:<código>@V<n>#hoja=Concreto&clave=02.01.03
 *   lda:<código>@V<n>#elemento=2Xh9k3$Lr0Bg8uK1a2pQ7Z
 *
 * Puro: lo prueba pruebas/lectorDeTablas.prueba.mjs.
 */

// Un ítem de presupuesto: 01, 01.02, 02.01.03… (dos a seis niveles numéricos separados por puntos).
const ES_ITEM = /^\d{1,3}(\.\d{1,3}){1,5}$/;
const CABECERA_CLAVE = /^(í|i)tem$|^partida$|^c[oó]digo$|^cod\.?$/i;

/** «A», «B»… «Z», «AA»… como en la hoja de cálculo. */
export function letraDeColumna(i) {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const texto = (v) => String(v ?? '').trim();

/**
 * La COLUMNA CLAVE de una hoja (filas = arrays de celdas). Primero por la cabecera («Ítem», «Partida»,
 * «Código») en las 15 primeras filas; si no, la columna con más valores con forma de ítem (al menos 3).
 * Devuelve { columna, filaCabecera } o null: sin clave clara no se inventa una.
 */
export function columnaClave(filas = []) {
  const tope = Math.min(filas.length, 15);
  for (let f = 0; f < tope; f++) {
    const fila = filas[f] || [];
    const c = fila.findIndex(v => CABECERA_CLAVE.test(texto(v)));
    if (c >= 0) return { columna: c, filaCabecera: f };
  }
  const cuenta = new Map();
  for (const fila of filas) {
    (fila || []).forEach((v, c) => { if (ES_ITEM.test(texto(v))) cuenta.set(c, (cuenta.get(c) || 0) + 1); });
  }
  let mejor = null;
  for (const [c, n] of cuenta) if (n >= 3 && (!mejor || n > mejor.n)) mejor = { c, n };
  if (!mejor) return null;
  const primera = filas.findIndex(fila => ES_ITEM.test(texto((fila || [])[mejor.c])));
  return { columna: mejor.c, filaCabecera: primera > 0 ? primera - 1 : null };
}

/** Índices de las filas que contienen `consulta` (en cualquier celda). La clave exacta va primero. */
export function buscarFilas(filas = [], consulta = '', columna = null) {
  const q = texto(consulta).toLowerCase();
  if (q.length < 2) return [];
  const exactas = [];
  const otras = [];
  filas.forEach((fila, i) => {
    if (columna != null && texto((fila || [])[columna]).toLowerCase() === q) exactas.push(i);
    else if ((fila || []).some(v => texto(v).toLowerCase().includes(q))) otras.push(i);
  });
  return [...exactas, ...otras];
}

/** La fila de una clave (la primera, si se repite), o -1. */
export function filaDeClave(filas = [], columna, clave) {
  const k = texto(clave);
  if (columna == null || !k) return -1;
  return filas.findIndex(fila => texto((fila || [])[columna]) === k);
}

// ── EL ANCLA LDA (ESTANDAR_LDA.md §6) ─────────────────────────────────────────────────────────

const ORDEN = ['pagina', 'zona', 'hoja', 'clave', 'vista', 'elemento', 't'];

/** `lda:<código>@V<n>#clave=valor&…`. Los valores se codifican: una hoja puede llamarse «Concreto 2». */
export function escribirAncla({ codigo, version, selector = {} } = {}) {
  if (!codigo) return '';
  const v = version != null && version !== '' ? `@V${String(version).replace(/^V/i, '')}` : '';
  const partes = ORDEN.filter(k => selector[k] != null && selector[k] !== '')
    .map(k => `${k}=${encodeURIComponent(Array.isArray(selector[k]) ? selector[k].join(',') : selector[k])}`);
  return `lda:${codigo}${v}${partes.length ? '#' + partes.join('&') : ''}`;
}

/** Lo contrario de `escribirAncla`. Devuelve null si no es un ancla LDA. */
export function leerAncla(cadena = '') {
  const m = /^lda:([^@#\s]+)(?:@V(\d+))?(?:#(.*))?$/i.exec(texto(cadena));
  if (!m) return null;
  const selector = {};
  for (const par of (m[3] || '').split('&').filter(Boolean)) {
    const i = par.indexOf('=');
    if (i <= 0) continue;
    const k = par.slice(0, i);
    const v = decodeURIComponent(par.slice(i + 1));
    selector[k] = k === 'zona' ? v.split(',').map(Number)
      : k === 'pagina' ? Number(v)
      : v;
  }
  return { codigo: m[1], version: m[2] ? Number(m[2]) : null, selector };
}

// ── ¿ES DE VERDAD UNA PLANILLA? ───────────────────────────────────────────────────────────────
// SheetJS «lee» casi cualquier cosa: con un PDF devolvía una hoja de basura (%PDF-1.7, endobj…) y el
// lector la pintaba como filas (15-oct-2026, en el banco). Antes de leer se mira la firma de los bytes.

/** 'zip' (xlsx, xlsm, ods), 'ole' (xls antiguo), 'pdf', 'texto' u 'otro'. */
export function firmaDelArchivo(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'zip';
  if (b.length >= 4 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'ole';
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
  const muestra = b.slice(0, 512);
  const imprimibles = muestra.filter(c => c === 9 || c === 10 || c === 13 || c >= 32).length;
  return muestra.length && imprimibles / muestra.length > 0.95 ? 'texto' : 'otro';
}

/** null si los bytes son una planilla del tipo que dice el nombre; si no, el motivo para enseñarlo. */
export function motivoSiNoEsPlanilla(bytes, nombre = '') {
  const firma = firmaDelArchivo(bytes);
  const ext = (String(nombre).match(/\.([^.]+)$/) || [])[1]?.toLowerCase() || '';
  const valida = ext === 'csv' ? firma === 'texto'
    : ext === 'xls' ? (firma === 'ole' || firma === 'zip')
    : firma === 'zip';
  if (valida) return null;
  const que = { pdf: 'un PDF', ole: 'un Excel antiguo', zip: 'un archivo comprimido', texto: 'texto', otro: 'otro tipo de archivo' }[firma];
  return `El archivo que llegó no es una planilla: parece ${que}. Puede ser un error de la versión guardada; descárgalo para comprobarlo.`;
}
