// Vistas publicadas de un tablero (docs/visor/63): qué enseña una vista y cómo se encuadra. Puro, para probarlo sin
// navegador (frontend-react/pruebas/vistaTablero.prueba.mjs).
//
// Una vista es { id, titulo, ids, creadaPor?, creadaEn? } dentro de `config.vistas`. Guarda REFERENCIAS a elementos del
// tablero, nunca copias: lo que cambie en el tablero se ve en la vista, y lo que se borre deja de verse.

export const MAX_VISTAS = 100;
export const MAX_IDS_POR_VISTA = 2000;

// Lo que enseña una vista: sus elementos que siguen en el tablero y, de cada sección elegida, lo que queda dentro de
// ella (publicar una sección es publicar lo que contiene). En el orden de dibujo del tablero.
export function elementosDeVista(contenido, ids) {
  const quiero = new Set(ids || []);
  const secciones = (contenido?.secciones || []).filter(f => quiero.has(f.id));
  const dentro = (n) => secciones.some(f => n.x >= f.x && n.y >= f.y && n.x + n.w <= f.x + f.w && n.y + n.h <= f.y + f.h);
  const notas = (contenido?.notas || []).filter(n => quiero.has(n.id) || dentro(n));
  return { secciones, notas };
}

// La caja que ocupa, en coordenadas del tablero; el título de una sección va 32 px por encima de ella.
export function cajaDeVista({ secciones = [], notas = [] }) {
  const cajas = [...secciones.map(f => [f.x, f.y - 36, f.x + f.w, f.y + f.h]), ...notas.map(n => [n.x, n.y, n.x + n.w, n.y + n.h])];
  if (!cajas.length) return null;
  return {
    x1: Math.min(...cajas.map(c => c[0])), y1: Math.min(...cajas.map(c => c[1])),
    x2: Math.max(...cajas.map(c => c[2])), y2: Math.max(...cajas.map(c => c[3])),
  };
}

// La cámara que la encaja entera en un marco de W × H con un margen, centrada, sin pasar de `maximo`.
export function encuadre(caja, W, H, margen = 48, maximo = 2) {
  const bw = Math.max(1, caja.x2 - caja.x1), bh = Math.max(1, caja.y2 - caja.y1);
  const s = Math.max(0.01, Math.min((W - 2 * margen) / bw, (H - 2 * margen) / bh, maximo));
  return { s, tx: (W - bw * s) / 2 - caja.x1 * s, ty: (H - bh * s) / 2 - caja.y1 * s };
}

// `config.vistas` tal como llega del servidor o de otra persona: solo pasan las que tienen forma de vista.
export function limpiarVistas(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.slice(0, MAX_VISTAS).filter(v => v && typeof v.id === 'string' && Array.isArray(v.ids)).map(v => ({
    id: v.id,
    titulo: (typeof v.titulo === 'string' && v.titulo.trim() ? v.titulo : 'Vista').slice(0, 120),
    ids: v.ids.filter(i => typeof i === 'string').slice(0, MAX_IDS_POR_VISTA),
    ...(typeof v.creadaPor === 'string' ? { creadaPor: v.creadaPor.slice(0, 120) } : {}),
    ...(typeof v.creadaEn === 'string' ? { creadaEn: v.creadaEn.slice(0, 40) } : {}),
  }));
}

// Un nombre de archivo para la imagen o el PDF de una vista.
export const nombreArchivo = (texto) => (String(texto || 'vista').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'vista');
