/**
 * El estado de lo elegido en el lector (`seleccionDelLector.js`), con lo que pide la dirección al abrir un documento.
 *
 * Vive en el LECTOR (PDFViewer), que es quien cambia de documento y de versión y tiene el botón del panel del plano:
 * así abrir un documento, la dirección («Mi trabajo» trae `incidencia` y `nube`; «Citado en», `marca`) y lo que se
 * elige después pasan por el mismo sitio y en orden. Antes la capa de marcas leía la dirección en su propio efecto y
 * tenía que esperar a que el lector cerrase el panel del documento anterior (un `setTimeout(0)`).
 *
 * La dirección se lee UNA vez por documento: al cambiar de versión dentro de él no se vuelve a abrir lo mismo.
 */
import { useEffect, useReducer, useRef } from 'react';
import { incidenciaDeLaDireccion, nubeDeLaDireccion, sinIncidencia } from './enlacesDeArchivos';
import { marcaDeLaDireccion } from './marcasConEnlace';
import { SIN_SELECCION, seleccion } from './seleccionDelLector';

export default function useSeleccionDelLector(nodeId, versionId) {
  const [estado, despachar] = useReducer(seleccion, SIN_SELECCION);
  const leidaPara = useRef(null);
  useEffect(() => {
    if (!nodeId) return;
    let pedido = {};
    if (leidaPara.current !== nodeId) {
      leidaPara.current = nodeId;
      const busca = window.location.search;
      const incidencia = incidenciaDeLaDireccion(busca, nodeId);
      pedido = { incidencia, nube: incidencia != null ? nubeDeLaDireccion(busca) : null, marca: marcaDeLaDireccion(busca).marca };
      // La incidencia se abre una vez: se quita de la dirección para que recargar no la vuelva a abrir.
      if (incidencia != null) {
        window.history.replaceState(window.history.state, '',
          window.location.pathname + sinIncidencia(busca) + window.location.hash);
      }
    }
    despachar({ tipo: 'documento', ...pedido });
  }, [nodeId, versionId]);
  return [estado, despachar];
}
