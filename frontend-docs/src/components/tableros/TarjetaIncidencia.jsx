/**
 * La tarjeta de una incidencia y el kanban de incidencias en el tablero (fase 3, docs/visor/61), como las de ACC:
 * número, título, estado y tipo con los colores de «Issues y punch», responsable y vencimiento. Lo que enseñan es el
 * estado VIVO (IncidenciasDelTablero). Doble clic: su detalle, con sus actos.
 *
 * El kanban NO cambia estados arrastrando: en ALEPHIA cada cambio es un acto con dueño (corregir exige evidencia y lo
 * hace el responsable; verificar, el verificador), y se hace en el detalle de la incidencia.
 */
import React, { useContext } from 'react';
import { ChipDeEstado, ChipDeTipo } from '../PunchModule';
import { IncidenciasDelTablero, columnasDelKanban, fechaCorta, vencida } from './incidencias';

const GRIS = '#72706B', TINTA = '#141413', BORDE = '#E5E3DA';
const SOMBRA = '0 1px 2px rgba(20,20,19,0.08), 0 6px 18px rgba(20,20,19,0.10)';
const recortar = (n) => ({ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: n, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' });

function Vence({ i }) {
  if (!i.vence_en) return <span style={{ color: GRIS }}>Sin fecha límite</span>;
  const tarde = vencida(i);
  return <span style={{ color: tarde ? '#B93535' : GRIS, fontWeight: tarde ? 600 : 400 }}>{tarde ? 'Venció' : 'Vence'} {fechaCorta(i.vence_en)}</span>;
}

export function TarjetaIncidencia({ elemento: el, elegido }) {
  const { porId, nombres, cargando } = useContext(IncidenciasDelTablero);
  const i = porId[el.issueId];
  return (
    <div style={{ position: 'absolute', inset: 0, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px',
      background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 6, boxShadow: elegido ? 'none' : SOMBRA, fontFamily: 'var(--a-font-sans)', overflow: 'hidden' }}>
      {!i ? (
        <div style={{ margin: 'auto', textAlign: 'center', color: GRIS, fontSize: 13 }}>
          {cargando ? 'Cargando incidencia…' : <>Incidencia no disponible<br /><span style={{ fontSize: 12 }}>#{el.codigo || '?'} · ya no está en la obra o no tienes acceso</span></>}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: TINTA }}>{i.codigo}</span>
            <ChipDeEstado estado={i.estado} />
            <ChipDeTipo tipo={i.tipo} etiqueta={i.tipo_etiqueta} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: TINTA, lineHeight: 1.3, ...recortar(2) }}>{i.titulo}</div>
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: GRIS, minWidth: 0 }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {i.responsable_id ? (nombres[i.responsable_id] || 'Responsable') : 'Sin responsable'}
            </span>
            <Vence i={i} />
          </div>
        </>
      )}
    </div>
  );
}

// Una tarjeta pequeña dentro de una columna del kanban; doble clic abre su detalle.
function Mini({ i, nombres, abrir }) {
  return (
    <div onDoubleClick={(e) => { e.stopPropagation(); abrir(i.id); }}
      style={{ background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 5, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5, cursor: 'default' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: TINTA }}>{i.codigo}</span>
        <ChipDeTipo tipo={i.tipo} etiqueta={i.tipo_etiqueta} />
      </div>
      <div style={{ fontSize: 13, color: TINTA, lineHeight: 1.3, ...recortar(2) }}>{i.titulo}</div>
      <div style={{ display: 'flex', gap: 6, fontSize: 12, color: GRIS }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.responsable_id ? (nombres[i.responsable_id] || '') : 'Sin responsable'}</span>
        <Vence i={i} />
      </div>
    </div>
  );
}

export function KanbanIncidencias({ elemento: el, elegido }) {
  const { porId, nombres, abrir, cargando } = useContext(IncidenciasDelTablero);
  const ids = el.issueIds || [];
  const presentes = ids.map(id => porId[id]).filter(Boolean);
  const columnas = columnasDelKanban(presentes);
  const faltan = cargando ? 0 : ids.length - presentes.length;
  return (
    <div style={{ position: 'absolute', inset: 0, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', background: '#F7F6F2',
      border: `1px solid ${BORDE}`, borderRadius: 8, boxShadow: elegido ? 'none' : SOMBRA, fontFamily: 'var(--a-font-sans)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${BORDE}`, background: '#fff' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: TINTA, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{el.nombre || 'Incidencias'}</span>
        <span style={{ fontSize: 12, color: GRIS }}>{presentes.length} {presentes.length === 1 ? 'incidencia' : 'incidencias'}{faltan > 0 ? ` · ${faltan} no disponibles` : ''}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${columnas.length}, minmax(0, 1fr))`, gap: 10, padding: 10 }}>
        {columnas.map(c => {
          const lista = presentes.filter(i => i.estado === c);
          return (
            <div key={c} style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ChipDeEstado estado={c} />
                <span style={{ fontSize: 12, color: GRIS }}>{lista.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
                {lista.map(i => <Mini key={i.id} i={i} nombres={nombres} abrir={abrir} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const BOTON = { height: 30, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.14)',
  background: '#fff', cursor: 'pointer', fontFamily: 'var(--a-font-sans)', fontSize: 13, color: '#3C3C3C', whiteSpace: 'nowrap' };

export function BarraIncidencia({ el, abrir }) {
  const { porId } = useContext(IncidenciasDelTablero);
  if (!porId[el.issueId]) return null;
  return (
    <button type="button" style={BOTON} title="Abrir aquí" onClick={() => abrir(el.issueId)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
      </svg>
      Abrir
    </button>
  );
}
