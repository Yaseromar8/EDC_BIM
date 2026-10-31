/**
 * SelectorIncidencias — «Seleccionar incidencias» del tablero (fase 3, docs/visor/61), como el de ACC: la tabla de las
 * incidencias y observaciones de la obra (número, título, estado, tipo, responsable, vencimiento), buscador por número,
 * título o descripción, filtros de estado y tipo, casillas, y añadir **como tarjetas** o **como kanban**.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChipDeEstado, ChipDeTipo } from '../PunchModule';
import { COLUMNAS, fechaCorta, vencida } from './incidencias';

const GRIS = '#72706B', LINEA = '#ECEAE2', TINTA = '#141413';
const COLS = '36px 104px minmax(0,1fr) 110px 150px 140px 110px';

export default function SelectorIncidencias({ incidencias, catalogo, nombres, onAnadir, onCerrar }) {
  const [consulta, setConsulta] = useState('');
  const [estado, setEstado] = useState('');
  const [tipo, setTipo] = useState('');
  const [elegidos, setElegidos] = useState(new Set());
  const entrada = useRef(null);

  useEffect(() => { entrada.current?.focus(); }, []);
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onCerrar(); } };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [onCerrar]);

  const filas = useMemo(() => {
    const q = consulta.trim().toLowerCase();
    return (incidencias || []).filter(i => (!estado || i.estado === estado) && (!tipo || i.tipo === tipo)
      && (!q || `${i.codigo} ${i.titulo} ${i.descripcion || ''}`.toLowerCase().includes(q)));
  }, [incidencias, consulta, estado, tipo]);

  const alternar = (id) => setElegidos(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todas = filas.length > 0 && filas.every(i => elegidos.has(i.id));
  const elegidas = (incidencias || []).filter(i => elegidos.has(i.id));
  const celda = { padding: '0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 };
  const selector = { height: 32, padding: '0 8px', border: '1px solid #D9D7CD', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: TINTA };

  return createPortal(
    <div onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}
      style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(20,20,19,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--a-font-sans)' }}>
      <div role="dialog" aria-modal="true" aria-label="Seleccionar incidencias"
        style={{ width: 'min(1060px, calc(100vw - 48px))', height: 'min(620px, calc(100vh - 64px))', background: '#fff', borderRadius: 8, display: 'flex', flexDirection: 'column',
          boxShadow: '0 12px 40px rgba(0,0,0,0.22)', color: TINTA, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${LINEA}` }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Seleccione las incidencias que desee añadir al tablero</span>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" title="Cerrar"
            style={{ width: 28, height: 28, border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: GRIS, fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
          <input ref={entrada} type="search" value={consulta} onChange={e => setConsulta(e.target.value)} placeholder="Buscar por número, título o descripción" aria-label="Buscar incidencias"
            style={{ flex: 1, height: 32, padding: '0 10px', border: '1px solid #D9D7CD', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
          <select value={estado} onChange={e => setEstado(e.target.value)} aria-label="Filtrar por estado" style={selector}>
            <option value="">Todos los estados</option>
            {[...COLUMNAS, 'Anulado'].map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <select value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Filtrar por tipo" style={selector}>
            <option value="">Todos los tipos</option>
            {(catalogo?.tipos || []).map(t => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
          </select>
        </div>
        <div role="row" style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', height: 32, background: '#F4F3EE',
          borderTop: `1px solid ${LINEA}`, borderBottom: `1px solid ${LINEA}`, fontSize: 12, fontWeight: 600, color: GRIS }}>
          <span style={{ display: 'flex', justifyContent: 'center' }}>
            <input type="checkbox" checked={todas} aria-label="Elegir todas las de la lista" disabled={!filas.length}
              onChange={() => setElegidos(s => { const n = new Set(s); filas.forEach(i => (todas ? n.delete(i.id) : n.add(i.id))); return n; })} />
          </span>
          <span style={celda}>Nº</span><span style={celda}>Título</span><span style={celda}>Estado</span><span style={celda}>Tipo</span>
          <span style={celda}>Responsable</span><span style={celda}>Vence</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {incidencias === null && <div style={{ padding: 24, textAlign: 'center', color: GRIS, fontSize: 13 }}>Cargando…</div>}
          {incidencias && !filas.length && (
            <div style={{ padding: 24, textAlign: 'center', color: GRIS, fontSize: 13 }}>
              {incidencias.length ? 'Ninguna incidencia coincide con la búsqueda.' : 'La obra aún no tiene incidencias ni observaciones.'}
            </div>
          )}
          {filas.map(i => {
            const marcada = elegidos.has(i.id);
            return (
              <label key={i.id} title={i.titulo}
                style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', minHeight: 40, cursor: 'pointer', borderBottom: `1px solid ${LINEA}`,
                  background: marcada ? 'rgba(13,102,180,0.07)' : 'transparent' }}>
                <span style={{ display: 'flex', justifyContent: 'center' }}><input type="checkbox" checked={marcada} onChange={() => alternar(i.id)} aria-label={`Elegir ${i.codigo}`} /></span>
                <span style={{ ...celda, fontWeight: 600 }}>{i.codigo}</span>
                <span style={celda}>{i.titulo}</span>
                <span style={celda}><ChipDeEstado estado={i.estado} /></span>
                <span style={celda}><ChipDeTipo tipo={i.tipo} etiqueta={i.tipo_etiqueta} /></span>
                <span style={{ ...celda, color: GRIS }}>{i.responsable_id ? (nombres[i.responsable_id] || '—') : 'Sin responsable'}</span>
                <span style={{ ...celda, color: vencida(i) ? '#B93535' : GRIS }}>{i.vence_en ? fechaCorta(i.vence_en) : 'Sin fecha'}</span>
              </label>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: `1px solid ${LINEA}` }}>
          <span style={{ flex: 1, fontSize: 13, color: GRIS }}>{elegidos.size ? `${elegidos.size} ${elegidos.size === 1 ? 'elegida' : 'elegidas'}` : 'Elija una o varias'}</span>
          <button type="button" className="barra-btn" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="barra-btn" disabled={!elegidos.size} onClick={() => onAnadir(elegidas, 'kanban')}>Añadir como kanban</button>
          <button type="button" className="barra-btn barra-btn--primario" disabled={!elegidos.size} onClick={() => onAnadir(elegidas, 'tarjetas')}>
            Añadir como tarjetas{elegidos.size ? ` (${elegidos.size})` : ''}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
