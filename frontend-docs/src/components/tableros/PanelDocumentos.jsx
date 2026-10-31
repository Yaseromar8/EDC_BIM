/**
 * PanelDocumentos — «Documentos» de la paleta izquierda del tablero (fase 2, docs/visor/59), como «Data Management»
 * de ACC pero en español y sobre los permisos de Docs: «Actualizados recientemente» de la obra, explorar las
 * carpetas, buscar, elegir varios y «Añadir al tablero».
 *
 * Todo por rutas que ya existen: /api/docs/search?vista=recientes, /api/docs/list y /api/docs/search?q=. Lo que
 * cada persona no puede ver, el servidor ya no lo devuelve.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API } from '../../utils/helpers';
import { apiFetch } from '../../utils/apiFetch';
import { renderFileIconSop } from '../../utils/fileIcons';
import IconoModulo from '../IconoModulo';
import { EXTENSIONES_CON_IMAGEN, extensionDe } from './documentos';

const GRIS = '#72706B', LINEA = '#ECEAE2', TINTA = '#141413';
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export default function PanelDocumentos({ obra, onAnadir, onCerrar }) {
  const [pestana, setPestana] = useState('recientes');          // recientes | explorar
  const [consulta, setConsulta] = useState('');
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');
  const [ruta, setRuta] = useState([{ id: null, nombre: 'Archivos de proyecto', path: obra + '/' }]);
  const [elegidos, setElegidos] = useState(new Map());          // id → documento
  const entrada = useRef(null);

  const cargar = useCallback(async (url, adaptar) => {
    setFilas(null); setError('');
    try {
      const r = await apiFetch(url);
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.success === false) { setFilas([]); setError(d.error || 'No se pudo leer la lista.'); return; }
      setFilas(adaptar(d));
    } catch { setFilas([]); setError('No se pudo conectar con el servidor.'); }
  }, []);

  // Qué se muestra: búsqueda (si hay texto), recientes o la carpeta abierta.
  useEffect(() => {
    const q = consulta.trim();
    const t = setTimeout(() => {
      if (q.length >= 2) {
        cargar(`${API}/api/docs/search?q=${encodeURIComponent(q)}&model_urn=${encodeURIComponent(obra)}`,
          d => (d.data || []).filter(x => String(x.type || '').toUpperCase() !== 'FOLDER')
            .map(x => ({ ...x, ubicacion: x.ubicacion ?? String(x.path || '').split('/').slice(0, -1).join('/'), updated: x.updated || x.updated_at })));
      } else if (pestana === 'recientes') {
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
  }, [consulta, pestana, ruta, obra, cargar]);

  useEffect(() => { entrada.current?.focus(); }, []);

  const alternar = (doc) => setElegidos(m => {
    const n = new Map(m);
    if (n.has(doc.id)) n.delete(doc.id); else n.set(doc.id, doc);
    return n;
  });
  const anadir = () => {
    onAnadir([...elegidos.values()]);
    setElegidos(new Map());
  };

  const tab = (clave, texto) => (
    <button type="button" role="tab" aria-selected={pestana === clave && consulta.trim().length < 2}
      onClick={() => { setConsulta(''); setPestana(clave); }}
      style={{ background: 'none', border: 'none', padding: '8px 0', marginBottom: -1, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
        color: pestana === clave && consulta.trim().length < 2 ? TINTA : GRIS, fontWeight: pestana === clave && consulta.trim().length < 2 ? 600 : 400,
        borderBottom: `2px solid ${pestana === clave && consulta.trim().length < 2 ? TINTA : 'transparent'}` }}>
      {texto}
    </button>
  );

  return (
    <div onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()} role="dialog" aria-label="Documentos"
      style={{ position: 'absolute', left: 80, top: 12, bottom: 84, width: 400, zIndex: 8, display: 'flex', flexDirection: 'column',
        background: '#fff', borderRadius: 8, boxShadow: '0 0 16px rgba(0,0,0,0.12)', fontFamily: 'var(--a-font-sans)', color: TINTA }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px 6px' }}>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Documentos</span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" title="Cerrar"
          style={{ width: 28, height: 28, border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: GRIS, fontSize: 18, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ padding: '0 14px 8px' }}>
        <input ref={entrada} type="search" value={consulta} onChange={e => setConsulta(e.target.value)} placeholder="Buscar en la obra por nombre o código" aria-label="Buscar documentos"
          style={{ width: '100%', boxSizing: 'border-box', height: 32, padding: '0 10px', border: '1px solid #D9D7CD', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
      </div>
      <div role="tablist" style={{ display: 'flex', gap: 18, padding: '0 14px', borderBottom: `1px solid ${LINEA}` }}>
        {tab('recientes', 'Actualizados recientemente')}
        {tab('explorar', 'Explorar la obra')}
      </div>
      {pestana === 'explorar' && consulta.trim().length < 2 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: '8px 14px 2px', fontSize: 12, color: GRIS }}>
          {ruta.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span>/</span>}
              <button type="button" onClick={() => setRuta(r => r.slice(0, i + 1))} disabled={i === ruta.length - 1}
                style={{ border: 'none', background: 'none', padding: 0, cursor: i === ruta.length - 1 ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12,
                  color: i === ruta.length - 1 ? TINTA : 'var(--accent, #0D66B4)' }}>{c.nombre}</button>
            </React.Fragment>
          ))}
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
        {filas === null && <div style={{ padding: 24, textAlign: 'center', color: GRIS, fontSize: 13 }}>Cargando…</div>}
        {filas && error && <div style={{ padding: 24, textAlign: 'center', color: GRIS, fontSize: 13 }}>{error}</div>}
        {filas && !error && !filas.length && (
          <div style={{ padding: 24, textAlign: 'center', color: GRIS, fontSize: 13 }}>
            {consulta.trim().length >= 2 ? 'Nada en la obra se llama así.' : pestana === 'recientes' ? 'Aún no hay documentos en la obra.' : 'Esta carpeta está vacía.'}
          </div>
        )}
        {filas && !error && filas.map(x => {
          if (x.carpeta) {
            return (
              <button key={x.id} type="button" onClick={() => setRuta(r => [...r, { id: x.id, nombre: x.name, path: x.fullName }])}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', border: 'none', borderRadius: 6, background: 'transparent',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, color: TINTA, textAlign: 'left' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F4F3EE'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                <IconoModulo nombre="archivos" tamano={18} style={{ color: 'var(--archivo-carpeta, #72706B)' }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span>
                <span style={{ color: GRIS }}>›</span>
              </button>
            );
          }
          const ext = extensionDe(x.name), admitido = EXTENSIONES_CON_IMAGEN.includes(ext), marcado = elegidos.has(x.id);
          return (
            <label key={x.id} title={admitido ? x.name : 'Los DWG y RVT se podrán añadir en el siguiente paso (fase 2B)'}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, cursor: admitido ? 'pointer' : 'default',
                background: marcado ? 'rgba(13,102,180,0.07)' : 'transparent', opacity: admitido ? 1 : 0.5 }}>
              <input type="checkbox" checked={marcado} disabled={!admitido} onChange={() => alternar(x)} style={{ flexShrink: 0 }} />
              {renderFileIconSop(x.name, 18)}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span>
                <span style={{ display: 'block', fontSize: 12, color: GRIS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[x.version ? `V${x.version}` : null, x.ubicacion, fecha(x.updated)].filter(Boolean).join(' · ')}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: `1px solid ${LINEA}` }}>
        <span style={{ flex: 1, fontSize: 13, color: GRIS }}>{elegidos.size ? `${elegidos.size} ${elegidos.size === 1 ? 'elegido' : 'elegidos'}` : 'Elige uno o varios'}</span>
        <button type="button" className="barra-btn barra-btn--primario" disabled={!elegidos.size} onClick={anadir}>
          Añadir al tablero{elegidos.size ? ` (${elegidos.size})` : ''}
        </button>
      </div>
    </div>
  );
}
