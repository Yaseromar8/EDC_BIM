/**
 * DÓNDE SE ABREN LAS PIEZAS DEL LECTOR (docs/archivos/25, P6): el lector dice sus sitios, nadie los busca.
 *
 * El panel de la incidencia, el de la foto y la leyenda de las nubes se pintan dentro del lector (con `createPortal`).
 * Antes cada uno buscaba su sitio con `document.querySelector('.pdf-viewer .pdf-body')` —a veces durante el dibujado,
 * antes de que existiera— y si no lo encontraba se pintaba en otra parte. Ahora el lector (PDFViewer, y el visor de
 * documentos para lo suyo) da por contexto los elementos:
 *   cuerpo  donde va el panel lateral (el panel de la incidencia, el de la foto);
 *   marco   el marco de la hoja, que no se mueve con ella (la leyenda de las nubes).
 * Fuera de un lector, el panel va al documento (como siempre que no había lector).
 */
import { createContext, useContext } from 'react';

export const ContextoDelLector = createContext({ cuerpo: null, marco: null });

/** Donde abrir el panel lateral: el cuerpo del lector, o el documento si no hay lector. */
export function useDestinoDelLector() {
  const { cuerpo } = useContext(ContextoDelLector);
  return cuerpo || (typeof document !== 'undefined' ? document.body : null);
}

/** El marco de la hoja (o null fuera del lector de planos). */
export function useMarcoDelLector() {
  return useContext(ContextoDelLector).marco;
}
