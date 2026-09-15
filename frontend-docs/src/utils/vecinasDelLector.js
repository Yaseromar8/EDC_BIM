// ─────────────────────────────────────────────────────────────────────────
// LAS LAMINAS VECINAS: CUALES SE ADELANTAN Y HASTA DONDE.
//
// Mientras se mira un plano, el lector prepara los de al lado para que el
// siguiente clic no espere (ver `prepararVecinas` en PDFViewer.jsx). Preparar
// tiene dos partes de coste muy distinto:
//
//   autorizar    una peticion pequena al backend; en el navegador no pesa.
//   descargar    el PDF ENTERO, e interpretarlo (~13 MB de memoria por plano).
//
// EL PROBLEMA. Se descargaban las dos pegadas SIEMPRE, pesaran lo que pesaran.
// Medido en produccion el 15-sep-2026 con el plano de paisajismo 004122
// (23,4 MB): al abrirlo bajaban enteras sus dos vecinas, ~46 MB que nadie
// habia pedido, y la primera empezaba mientras el plano abierto aun se estaba
// dibujando.
//
// LA REGLA
//   - Se autorizan las de la ventana, como antes: es lo que quita la espera
//     del clic y no carga al navegador.
//   - Se descargan SOLO las pegadas (distancia 1) y SOLO si se sabe que pesan
//     poco. Un plano pequeno abre al instante al pulsarlo; uno pesado no se
//     baja hasta que el usuario lo pide.
//   - Si no se sabe cuanto pesa, solo se autoriza. Ante la duda, no se gasta.
// ─────────────────────────────────────────────────────────────────────────

export const VENTANA_DE_VECINAS = 4;

// Por debajo de esto una descarga es cuestion de un segundo y adelantarla se
// nota al pulsar; por encima, lo que se nota es el ancho de banda robado al
// plano que se esta mirando.
export const TOPE_PARA_DESCARGAR_BYTES = 5 * 1024 * 1024;

/** ¿Se sabe que el fichero pesa poco? Sin tamano conocido, no. */
export function pesaPoco(hermano, tope = TOPE_PARA_DESCARGAR_BYTES) {
  const bytes = Number(hermano?.size);
  return Number.isFinite(bytes) && bytes > 0 && bytes <= tope;
}

/**
 * Las vecinas a preparar, en el orden en que es probable que se pulsen:
 * primero las pegadas, luego hacia fuera, alternando delante y detras.
 * `interpretar` = ademas de autorizarla, descargarla e interpretarla.
 */
export function planDeVecinas(hermanos, indice,
  { ventana = VENTANA_DE_VECINAS, tope = TOPE_PARA_DESCARGAR_BYTES } = {}) {
  const plan = [];
  if (!Array.isArray(hermanos) || !Number.isInteger(indice) || indice < 0) return plan;
  for (let d = 1; d <= ventana; d++) {
    for (const j of [indice + d, indice - d]) {
      const hermano = j >= 0 ? hermanos[j] : undefined;
      if (hermano) plan.push({ hermano, interpretar: d === 1 && pesaPoco(hermano, tope) });
    }
  }
  return plan;
}
