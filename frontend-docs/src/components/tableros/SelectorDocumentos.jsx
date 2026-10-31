/**
 * SelectorDocumentos — la ventana «Añadir documento» del tablero (docs/visor/59), como «Añadir archivos de Data
 * Management» de ACC: a la izquierda los atajos (actualizados recientemente, archivos de proyecto), arriba buscar,
 * en medio la carpeta con casillas, y abajo «Cancelar» y «Añadir al tablero (N)». Cualquier tipo de documento.
 *
 * Todo por rutas que ya existen: /api/docs/search?vista=recientes, /api/docs/list y /api/docs/search?q=. Lo que
 * cada persona no puede ver, el servidor ya no lo devuelve.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API } from '../../utils/helpers';
import { apiFetch } from '../../utils/apiFetch';
import { renderFileIconSop } from '../../utils/fileIcons';
import IconoModulo from '../IconoModulo';
import { fechaHora } from './documentos';

const GRIS = '#72706B', LINEA = '#ECEAE2', TINTA = '#141413';
const RAIZ = (obra) => ({ id: null, nombre: 'Archivos de proyecto', path: obra + '/' });

export default function SelectorDocumentos({ obra, onAnadir, onCerrar }) {
  const [lugar, setLugar] = useState('carpeta');                // recientes | carpeta
  const [consulta, setConsulta] = useState('');
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');
  const [ruta, setRuta] = useState([RAIZ(obra)]);
  const [elegidos, setElegidos] = useState(new Map());          // id → documento
  const entrada = useRef(null);
  const buscando = consulta.trim().length >= 2;

  const cargar = useCallback(async (url, adaptar) => {
    setFilas(null); setError('');
    try {
      const r = await apiFetch(url);
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.success === false) { setFilas([]); setError(d.error || 'No se pudo leer la lista.'); return; }
      setFilas(adaptar(d));
    } catch { setFilas([]); setError('No se pudo conectar con el servidor.'); }
  }, []);

  useEffect(() => {
    const q = consulta.trim();
    const t = setTimeout(() => {
      if (q.length >= 2) {
        cargar(`${API}/api/docs/search?q=${encodeURIComponent(q)}&model_urn=${encodeURIComponent(obra)}`,
          d => (d.data || []).filter(x => String(x.type || '').toUpperCase() !== 'FOLDER')
            .map(x => ({ ...x, ubicacion: x.ubicacion ?? String(x.path || '').split('/').slice(0, -1).join('/'), updated: x.updated || x.updated_at })));
      } else if (lugar === 'recientes') {
        cargar(`${API}/api/docs/search?vista=recientes&model_urn=${encodeURIComponent(obra)}`, d => d.data || []);
      } else {
        const c = ruta[ruta.length - 1];
        const qs = c.id ? `id=${encodeURIComponent(c.id)}` : `path=${encodeURIComponent(c.path)}`;
        cargar(`${API}/api/docs/list?${qs}&model_urn=${encodeURIComponent(obra)}`,
          d => [...(d.data?.folders || []).map(f => ({ ...f, carpeta: true })),
            ...(d.data?.files || []).map(f => ({ ...f, parent_id: f.parent_id || d.data?.current_node_id || null }))]);
      }
    }, q.length >= 2 ? 250 : 0);
    return () => clearTimeout(t);
  }, [consulta, lugar, ruta, obra, cargar]);

  useEffect(() => { entrada.current?.focus(); }, []);
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onCerrar(); } };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [onCerrar]);

  const alternar = (doc) => setElegidos(m => {
    const n = new Map(m);
    if (n.has(doc.id)) n.delete(doc.id); else n.set(doc.id, doc);
    return n;
  });

  const atajo = (clave, texto, icono, alPulsar) => {
    const activo = !buscando && lugar === clave && (clave !== 'carpeta' || ruta.length === 1);
    return (
      <button type="button" onClick={alPulsar} aria-current={activo || undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', border: 'none', borderRadius: 6, cursor: 'pointer',
          background: activo ? 'rgba(13,102,180,0.08)' : 'transparent', fontFamily: 'inherit', fontSize: 13, color: TINTA, textAlign: 'left', fontWeight: activo ? 600 : 400 }}>
        {icono}{texto}
      </button>
    );
  };

  const celda = { padding: '0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 };

  return createPortal(
    <div onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}
      style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(20,20,19,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--a-font-sans)' }}>
      <div role="dialog" aria-modal="true" aria-label="Añadir documentos de Archivos"
        style={{ width: 'min(980px, calc(100vw - 48px))', height: 'min(620px, calc(100vh - 64px))', background: '#fff', borderRadius: 8, display: 'flex', flexDirection: 'column',
          boxShadow: '0 12px 40px rgba(0,0,0,0.22)', color: TINTA, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${LINEA}` }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Añadir documentos de Archivos</span>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" title="Cerrar"
            style={{ width: 28, height: 28, border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: GRIS, fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <nav aria-label="Lugares" style={{ width: 240, flexShrink: 0, padding: 8, borderRight: `1px solid ${LINEA}`, background: '#FAF9F5' }}>
            {atajo('recientes', 'Actualizados recientemente',
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>,
              () => { setConsulta(''); setLugar('recientes'); })}
            {atajo('carpeta', 'Archivos de proyecto', <IconoModulo nombre="archivos" tamano={16} style={{ color: 'var(--archivo-carpeta, #72706B)' }} />,
              () => { setConsulta(''); setLugar('carpeta'); setRuta([RAIZ(obra)]); })}
          </nav>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
              <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontSize: 13, color: GRIS, minWidth: 0 }}>
                {buscando ? <span>Resultados de «{consulta.trim()}»</span>
                  : lugar === 'recientes' ? <span style={{ color: TINTA }}>Actualizados recientemente</span>
                    : ruta.map((c, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <span>/</span>}
                        <button type="button" onClick={() => setRuta(r => r.slice(0, i + 1))} disabled={i === ruta.length - 1}
                          style={{ border: 'none', background: 'none', padding: 0, cursor: i === ruta.length - 1 ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 13,
                            color: i === ruta.length - 1 ? TINTA : 'var(--accent, #0D66B4)' }}>{c.nombre}</button>
                      </React.Fragment>
                    ))}
              </div>
              <input ref={entrada} type="search" value={consulta} onChange={e => setConsulta(e.target.value)} placeholder="Buscar en la obra por nombre o código" aria-label="Buscar documentos"
                style={{ width: 300, boxSizing: 'border-box', height: 32, padding: '0 10px', border: '1px solid #D9D7CD', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
            </div>
            <div role="row" style={{ display: 'grid', gridTemplateColumns: '36px minmax(0,1fr) 76px 150px minmax(0,180px)', alignItems: 'center', height: 32,
              background: '#F4F3EE', borderTop: `1px solid ${LINEA}`, borderBottom: `1px solid ${LINEA}`, fontSize: 12, fontWeight: 600, color: GRIS }}>
              <span />
              <span style={celda}>Nombre</span><span style={celda}>Versión</span><span style={celda}>Actualizado</span><span style={celda}>Ubicación</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filas === null && <div style={{ padding: 24, textAlign: 'center', color: GRIS, fontSize: 13 }}>Cargando…</div>}
              {filas && error && <div style={{ padding: 24, textAlign: 'center', color: GRIS, fontSize: 13 }}>{error}</div>}
              {filas && !error && !filas.length && (
                <div style={{ padding: 24, textAlign: 'center', color: GRIS, fontSize: 13 }}>
                  {buscando ? 'Nada en la obra se llama así.' : lugar === 'recientes' ? 'Aún no hay documentos en la obra.' : 'Esta carpeta está vacía.'}
                </div>
              )}
              {filas && !error && filas.map(x => {
                if (x.carpeta) {
                  return (
                    <button key={x.id} type="button" onClick={() => { setLugar('carpeta'); setRuta(r => [...r, { id: x.id, nombre: x.name, path: x.fullName }]); }}
                      style={{ display: 'grid', gridTemplateColumns: '36px minmax(0,1fr)', alignItems: 'center', width: '100%', height: 38, border: 'none', borderBottom: `1px solid ${LINEA}`,
                        background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: TINTA, textAlign: 'left' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#F7F6F2'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                      <span />
                      <span style={{ ...celda, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <IconoModulo nombre="archivos" tamano={16} style={{ color: 'var(--archivo-carpeta, #72706B)' }} />{x.name}
                      </span>
                    </button>
                  );
                }
                const marcado = elegidos.has(x.id);
                return (
                  <label key={x.id} title={x.name}
                    style={{ display: 'grid', gridTemplateColumns: '36px minmax(0,1fr) 76px 150px minmax(0,180px)', alignItems: 'center', height: 38, cursor: 'pointer',
                      borderBottom: `1px solid ${LINEA}`, background: marcado ? 'rgba(13,102,180,0.07)' : 'transparent' }}>
                    <span style={{ display: 'flex', justifyContent: 'center' }}><input type="checkbox" checked={marcado} onChange={() => alternar(x)} aria-label={`Elegir ${x.name}`} /></span>
                    <span style={{ ...celda, display: 'flex', alignItems: 'center', gap: 8 }}>{renderFileIconSop(x.name, 16)}<span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.name}</span></span>
                    <span style={{ ...celda, color: GRIS }}>{x.version ? `V${x.version}` : ''}</span>
                    <span style={{ ...celda, color: GRIS }}>{fechaHora(x.updated)}</span>
                    <span style={{ ...celda, color: GRIS }}>{x.ubicacion || ''}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: `1px solid ${LINEA}` }}>
          <span style={{ flex: 1, fontSize: 13, color: GRIS }}>{elegidos.size ? `${elegidos.size} ${elegidos.size === 1 ? 'elegido' : 'elegidos'}` : 'Elige uno o varios'}</span>
          <button type="button" className="barra-btn" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="barra-btn barra-btn--primario" disabled={!elegidos.size} onClick={() => onAnadir([...elegidos.values()])}>
            Añadir al tablero{elegidos.size ? ` (${elegidos.size})` : ''}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
