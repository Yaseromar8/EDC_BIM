/**
 * Lo que comparten las tarjetas de documento de un tablero (fase 2, docs/visor/59): el contexto con la obra y las
 * versiones vigentes, las medidas de la tarjeta y la consulta de versiones. Sin componentes: estos viven en
 * TarjetaDocumento.jsx y el registro para el Lienzo en tipoDocumento.js.
 */
import { createContext } from 'react';
import { API } from '../../utils/helpers';
import { apiFetch } from '../../utils/apiFetch';

export const DocumentosDelTablero = createContext({ obra: '', vigentes: {} });

export const EXTENSIONES_CON_IMAGEN = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif'];
export const extensionDe = (nombre) => (String(nombre || '').split('.').pop() || '').toLowerCase();
// Una hoja A1/A3 apaisada: lo más habitual en planos; la imagen se ajusta dentro sin deformarse.
export const TAMANO_TARJETA = { w: 360, h: 286 };

// Hay versión nueva si Docs tiene otra versión, posterior a la que muestra la tarjeta.
export const hayVersionNueva = (el, vigente) =>
  !!(vigente && !vigente.sinAcceso && vigente.versionId && el.versionId && vigente.versionId !== el.versionId && (vigente.version || 0) > (el.version || 0));

// Las versiones vigentes de los documentos de un tablero, de cuatro en cuatro (cada una pasa por su puerta).
export async function versionesVigentes(obra, nodeIds) {
  const salida = {};
  const lista = [...new Set(nodeIds)].filter(Boolean);
  for (let i = 0; i < lista.length; i += 4) {
    await Promise.all(lista.slice(i, i + 4).map(async (id) => {
      try {
        const r = await apiFetch(`${API}/api/docs/versions?id=${encodeURIComponent(id)}&model_urn=${encodeURIComponent(obra)}`);
        if (r.status === 403 || r.status === 404) { salida[id] = { sinAcceso: true }; return; }
        const d = await r.json().catch(() => ({}));
        const v = (d.versions || [])[0];
        if (v) salida[id] = { versionId: v.id, version: v.version_number };
      } catch { /* sin red: se vuelve a mirar al abrir otra vez */ }
    }));
  }
  return salida;
}
