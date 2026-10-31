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
// Planos de AutoCAD (y de Civil 3D): sus presentaciones, dibujadas por AutoCAD en la traducción (doc 59 §12).
export const EXTENSIONES_CAD = ['dwg'];
export const conLamina = (ext) => EXTENSIONES_CON_IMAGEN.includes(ext) || EXTENSIONES_CAD.includes(ext);
export const extensionDe = (nombre) => (String(nombre || '').split('.').pop() || '').toLowerCase();
// Una lámina entra como hoja ISO apaisada (√2, lo más habitual en planos) y, al cargar su imagen, toma su
// proporción real. Lo que no tiene imagen (Excel, Word, un comprimido…) es una ficha más pequeña.
export const TAMANO_TARJETA = { w: 400, h: 283 };
export const TAMANO_FICHA = { w: 300, h: 168 };
export const tamanoPara = (nombre) => (conLamina(extensionDe(nombre)) ? TAMANO_TARJETA : TAMANO_FICHA);

// «31 oct 2026, 09:48», como ACC.
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const fechaHora = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(d.getDate())} ${MESES[d.getMonth()]} ${d.getFullYear()}, ${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

// Lo que enseña la tarjeta además de la lámina. Por omisión, nada (como ACC): la lámina sola, con sombra.
export const META_POR_OMISION = { ver: false, icono: true, nombre: true, version: true, fecha: true };
export const metaDe = (el) => ({ ...META_POR_OMISION, ...(el?.meta || {}) });

// El historial de versiones de un documento, la más nueva primero ([] si no se puede ver).
export async function versionesDe(obra, nodeId) {
  try {
    const r = await apiFetch(`${API}/api/docs/versions?id=${encodeURIComponent(nodeId)}&model_urn=${encodeURIComponent(obra)}`);
    if (!r.ok) return [];
    const d = await r.json().catch(() => ({}));
    return (d.versions || []).map(v => ({ id: v.id, version: v.version_number, fecha: v.created_at || null }));
  } catch { return []; }
}

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
        if (v) salida[id] = { versionId: v.id, version: v.version_number, fecha: v.created_at || null };
      } catch { /* sin red: se vuelve a mirar al abrir otra vez */ }
    }));
  }
  return salida;
}
