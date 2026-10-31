/**
 * AvisoObservaciones — el aviso junto al nombre del plano en Archivos (31-oct-2026, opción A1 elegida por el dueño).
 *
 * Uno por plano y discreto: solo habla de OBSERVACIONES (las nubes sueltas no cuentan: una nube solo dibuja; lo que
 * pide una corrección es la observación que se crea desde ella).
 *   · ámbar «⚠ 2»  → observaciones abiertas (incluye «corregida, falta verificar»)
 *   · rojo  «⚠ 2»  → alguna de esas está vencida
 *   · verde «✓»    → todas las de la versión vigente se cerraron
 * Al pasar el ratón, el detalle (la ayuda global de Docs admite varias líneas). El dato viene del listado de la
 * carpeta (`item.observaciones`, backend/observaciones_en_lista.py).
 */
import React from 'react';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const fecha = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')} ${MESES[d.getMonth()]}`;
};

function ayudaDe(o) {
  if (!o.abiertas) return `${o.cerradas === 1 ? 'La observación está cerrada' : `Las ${o.cerradas} observaciones están cerradas`} en esta versión\nClic: abrir el plano`;
  const lineas = [
    `${o.abiertas} ${o.abiertas === 1 ? 'observación abierta' : 'observaciones abiertas'}`
      + (o.vencidas ? ` · ${o.vencidas} ${o.vencidas === 1 ? 'vencida' : 'vencidas'}` : ''),
  ];
  const quien = o.responsable ? `Responsable: ${String(o.responsable).split('@')[0]}` : '';
  const cuando = o.vence ? `vence ${fecha(o.vence)}` : 'sin fecha límite';
  lineas.push([quien, cuando].filter(Boolean).join(' · '));
  lineas.push('Clic: abrir el plano');
  return lineas.join('\n');
}

export default function AvisoObservaciones({ obs, onAbrir }) {
  if (!obs || (!obs.abiertas && !obs.cerradas)) return null;
  const cerradas = !obs.abiertas;
  const color = cerradas ? 'var(--a-status-success)' : obs.vencidas ? 'var(--a-status-danger)' : 'var(--a-status-warning)';
  return (
    <span
      role="button"
      tabIndex={0}
      className="aviso-observaciones"
      title={ayudaDe(obs)}
      aria-label={ayudaDe(obs).split('\n')[0]}
      onClick={(e) => { e.stopPropagation(); onAbrir?.(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onAbrir?.(); } }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0, color, fontSize: 13, lineHeight: 1, cursor: 'pointer', borderRadius: 4, padding: '2px 3px' }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {cerradas
          ? <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.2 2.4 2.4 4.6-4.8" /></>
          : <><circle cx="12" cy="12" r="9" /><path d="M12 7.6v5" /><path d="M12 16.2h.01" /></>}
      </svg>
      {!cerradas && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{obs.abiertas}</span>}
    </span>
  );
}
