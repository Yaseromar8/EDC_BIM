// EL ANCHO DE UN TEXTO, MEDIDO (docs/archivos/25, P7): con las métricas de su fuente, no «letras × 7».
//
// Los rótulos de la hoja (el número y las iniciales de una nube, el código de una incidencia) son SVG y su caja se
// dibuja antes que el texto, así que hay que saber cuánto mide. Se mide con el contexto 2D de un lienzo, que usa la
// misma fuente que el texto. Mientras la fuente no ha cargado se mide con la de respaldo y NO se recuerda: la medida
// buena llega al cargar (`fuentesListas` avisa para volver a dibujar).
let contexto = null;
const recordado = new Map();
const TOPE = 2000;

export function anchoDeTexto(texto, fuente) {
  const t = String(texto ?? '');
  const k = `${fuente}|${t}`;
  if (recordado.has(k)) return recordado.get(k);
  if (!contexto) {
    if (typeof document === 'undefined') return t.length * 7;
    contexto = document.createElement('canvas').getContext('2d');
  }
  contexto.font = fuente;
  const ancho = contexto.measureText(t).width;
  let cargada = true;
  try { cargada = !document.fonts || document.fonts.check(fuente, t || 'M'); } catch { cargada = true; }
  if (cargada) {
    if (recordado.size > TOPE) recordado.clear();
    recordado.set(k, ancho);
  }
  return ancho;
}

/** Se cumple cuando las fuentes de la página han cargado (para volver a medir los rótulos). */
export function fuentesListas() {
  if (typeof document === 'undefined' || !document.fonts?.ready) return Promise.resolve();
  return document.fonts.ready.then(() => recordado.clear());
}
