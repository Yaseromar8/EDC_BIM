/**
 * Las incidencias y observaciones de la obra en el tablero (fase 3, docs/visor/61). Sin rutas nuevas: las de
 * «Issues y punch» (`/api/issues`, su catálogo, los miembros y los planos de la obra). La tarjeta y el kanban guardan
 * solo el id (y el código y el título, para Buscar y para cuando no se puedan leer); lo demás —estado, responsable,
 * vencimiento— se lee VIVO al abrir el tablero y cada minuto, porque lo que cambia una incidencia son sus actos, no
 * el tablero.
 */
import { createContext } from 'react';
import { API } from '../../utils/helpers';
import { apiFetch } from '../../utils/apiFetch';
import { CODIGOS_VIVOS, ESTADOS_DE_ISSUE } from '../../utils/estadosDeIssue';

export const IncidenciasDelTablero = createContext({ porId: {}, nombres: {}, abrir: () => {} });

// Las columnas del kanban, en el orden del flujo (`flujo_de_issue.py`, estados de ACC desde la 45). Las FIJAS se ven
// siempre; En curso, En disputa y Anulada, solo si alguna está en ellas. Un borrador no se pone en un tablero.
export const COLUMNAS = ESTADOS_DE_ISSUE.map(e => e.codigo).filter(c => c !== 'Borrador' && c !== 'Anulado');
export const FIJAS = ['Abierto', 'Corregido', 'Reabierto', 'Verificado'];
export const VIVOS = CODIGOS_VIVOS;
export const columnasDelKanban = (presentes) => [...COLUMNAS, 'Anulado']
  .filter(c => FIJAS.includes(c) || presentes.some(i => i.estado === c));
export const TAMANO_INCIDENCIA = { w: 300, h: 156 };
export const TAMANO_KANBAN = { w: 1040, h: 520 };

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const fechaCorta = (iso) => {
  const d = iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? `${String(d.getDate()).padStart(2, '0')} ${MESES[d.getMonth()]} ${d.getFullYear()}` : '';
};
export const vencida = (i) => !!(i?.vence_en && VIVOS.includes(i.estado) && String(i.vence_en).slice(0, 10) < new Date().toISOString().slice(0, 10));
// Lo último que le pasó (para «Últimas incidencias»).
export const ultimoMovimiento = (i) => [i.cerrado_en, i.verificado_en, i.corregido_en, i.creado_en].filter(Boolean).sort().pop() || '';

async function leer(url) {
  try {
    const r = await apiFetch(url);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function incidenciasDeLaObra(urn) {
  const d = await leer(`${API}/api/issues?model_urn=${encodeURIComponent(urn)}`);
  return d?.issues || null;
}
export const catalogoDeIncidencias = () => leer(`${API}/api/issues/catalogo`);
export async function miembrosDeLaObra(obraId) {
  if (!obraId) return [];
  const d = await leer(`${API}/api/projects/${encodeURIComponent(obraId)}/miembros`);
  return d?.miembros || [];
}
export async function planosDeLaObra(urn) {
  const d = await leer(`${API}/api/planos?model_urn=${encodeURIComponent(urn)}`);
  return d?.planos || [];
}
