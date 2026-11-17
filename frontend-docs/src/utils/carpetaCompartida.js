// frontend-docs/src/utils/carpetaCompartida.js
//
// UNA CARPETA COMPARTIDA POR ENLACE PÚBLICO (17-nov-2026, docs/archivos/32). Lo puro de la página pública, para
// probarlo sin navegador (`pruebas/carpetaCompartida.prueba.mjs`). Qué hay dentro y qué se puede abrir lo decide el
// servidor (`/api/docs/shared/<id>/contenido` y `/archivo/<id>`); aquí solo se arman las direcciones y se ordena.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La dirección del contenido de la carpeta compartida o de una de sus subcarpetas. */
export function rutaDelContenido(API, shareId, carpeta = null) {
  const base = `${API || ''}/api/docs/shared/${encodeURIComponent(String(shareId))}/contenido`;
  return carpeta && UUID.test(String(carpeta)) ? `${base}?carpeta=${encodeURIComponent(carpeta)}` : base;
}

/** La dirección de un documento de dentro. null si el id no es válido. */
export function rutaDelArchivo(API, shareId, nodo) {
  if (!UUID.test(String(nodo || ''))) return null;
  return `${API || ''}/api/docs/shared/${encodeURIComponent(String(shareId))}/archivo/${encodeURIComponent(nodo)}`;
}

/** «2,4 MB», «830 KB», «12 B»; '' si no se sabe. */
export function tamano(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** «12/11/2026»; '' si no hay fecha. */
export function fechaCorta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** El tipo que se enseña junto al nombre: la extensión en mayúsculas («PDF», «XLSX»), o ''. */
export function tipoDeArchivo(nombre) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(String(nombre || ''));
  return m ? m[1].toUpperCase() : '';
}

/** Una línea para quien abre el enlace: cuántas carpetas y documentos hay aquí. */
export function resumenDeLaCarpeta(datos) {
  const c = (datos?.carpetas || []).length;
  const a = (datos?.archivos || []).length;
  if (!c && !a) return 'Esta carpeta está vacía.';
  const partes = [];
  if (c) partes.push(c === 1 ? '1 carpeta' : `${c} carpetas`);
  if (a) partes.push(a === 1 ? '1 documento' : `${a} documentos`);
  return partes.join(' · ');
}
