// ─────────────────────────────────────────────────────────────────────────
// UN SOLO SITIO DONDE SE CONFIGURA pdf.js.
//
// POR QUE EXISTE. La biblioteca trae sus propios recursos --descompresores
// en WebAssembly, tablas de codificacion, tipografias estandar-- pero hay que
// DECIRLE DONDE ESTAN. Nunca se hizo, asi que llevaba desde siempre cayendo
// a sus caminos de reserva. En la consola del dueño se veia:
//
//   JBig2Image#instantiateWasm: Ensure that the `wasmUrl` API parameter is
//   provided.
//   CCITTFaxStream: Falling back to JS CCITTFax decoder.
//
// Eso NO es un aviso cosmetico: significa descomprimir las imagenes del plano
// en JavaScript en vez de en WebAssembly, y ocurre DENTRO del dibujado, que es
// justo donde se van los segundos (se ve en la pila: decodeImage ->
// buildPaintImageXObject, durante el render).
//
// POR QUE EN UN FICHERO APARTE. Se abren PDF desde tres sitios distintos
// (el lector, su precarga y la vista de comparacion) y los tres pasaban sus
// propias opciones. Repartir la configuracion es como se termina con tres
// comportamientos distintos sin que nadie lo note; hoy mismo un ayudante
// duplicado en dos ficheros costo una tarde. Aqui hay UNA fuente.
//
// SI LA RUTA FALLA, pdf.js vuelve solo a su camino de reserva: se comporta
// como hasta ahora, no se rompe nada.
// ─────────────────────────────────────────────────────────────────────────
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

// Los recursos se copian al empaquetar (ver vite.config.js). Se descargan solo
// cuando un documento los necesita: no pesan en el arranque.
const BASE = '/pdfjs/';

export const RECURSOS_PDF = {
  // Descompresores JBIG2 / JPEG2000 y perfiles de color, en WebAssembly.
  wasmUrl: `${BASE}wasm/`,
  // Tablas de codificacion: sin esto, el texto de planos con fuentes
  // orientales o codificaciones raras no se extrae ni se puede buscar.
  cMapUrl: `${BASE}cmaps/`,
  cMapPacked: true,
  // Las 14 tipografias estandar del formato. Sin esto se sustituyen por
  // aproximaciones y el membrete puede no medir lo mismo.
  standardFontDataUrl: `${BASE}standard_fonts/`,
};

/** Abre un PDF con la biblioteca bien configurada. */
export function abrirPdf(opciones) {
  return pdfjsLib.getDocument({ ...RECURSOS_PDF, ...opciones });
}

export { pdfjsLib };
