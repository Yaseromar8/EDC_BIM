// TablerosModule.jsx — los Tableros de la obra (30-oct-2026, docs/visor/57), como los «Paneles» de ACC:
// una lista por obra (crear, abrir, renombrar, archivar; «abierto por última vez por usted», «creado por»)
// y cada tablero en pantalla completa sobre el lienzo compartido de design/lienzo (el mismo motor que el
// Tablero de View).
//
// Guardar sin pisar a nadie: cada guardado lleva la versión sobre la que se hizo; si otra persona guardó
// antes, el servidor responde 409 con lo suyo, se fusiona por elemento (design/lienzo/fusion.js) y se vuelve
// a guardar. Nada se reemplaza a ciegas.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import IconoModulo from './IconoModulo';
import Lienzo from '../../../design/lienzo/Lienzo';
import { fusionar, mismoContenido } from '../../../design/lienzo/fusion';

const GRIS = '#72706b', LINEA = '#e8e6dc', SUAVE = '#f1f0e8', TINTA = '#141413';
const ESPERA_GUARDAR_MS = 800;

function fecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso), hoy = new Date();
  const hora = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoy.toDateString()) return `Hoy, ${hora}`;
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return `Ayer, ${hora}`;
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function llamar(url, metodo = 'GET', cuerpo) {
  try {
    const r = await apiFetch(url, { method: metodo, ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}) });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok && d.success !== false, estado: r.status, ...d };
  } catch {
    return { ok: false, estado: 0, error: 'No se pudo conectar con el servidor.' };
  }
}

// ── Lista ──────────────────────────────────────────────────────────────────────────────────────────
export default function TablerosModule({ projectPrefix, user, isAdmin }) {
  const [archivados, setArchivados] = useState(false);
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('');
  const [abierto, setAbierto] = useState(null);         // id del tablero en pantalla
  const [menu, setMenu] = useState(null);               // { id, x, y }
  const [renombrando, setRenombrando] = useState(null); // id
  const [creando, setCreando] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const recargar = () => setVuelta(n => n + 1);

  useEffect(() => {
    let vivo = true;
    setLista(null); setError('');
    llamar(`${API}/api/docs/tableros?model_urn=${encodeURIComponent(projectPrefix)}${archivados ? '&archivados=1' : ''}`).then(d => {
      if (!vivo) return;
      if (!d.ok) { setLista([]); setError(d.estado === 404 ? 'Los tableros aún no están disponibles en este servidor.' : (d.error || 'No se pudo leer la lista.')); return; }
      setLista(d.tableros || []);
    });
    return () => { vivo = false; };
  }, [projectPrefix, archivados, vuelta]);

  useEffect(() => {
    if (!menu) return undefined;
    const cerrar = () => setMenu(null);
    window.addEventListener('pointerdown', cerrar);
    window.addEventListener('resize', cerrar);
    return () => { window.removeEventListener('pointerdown', cerrar); window.removeEventListener('resize', cerrar); };
  }, [menu]);

  const crear = async () => {
    if (creando) return;
    setCreando(true);
    const d = await llamar(`${API}/api/docs/tableros`, 'POST', { model_urn: projectPrefix });
    setCreando(false);
    if (!d.ok) { toast.error(d.error || 'No se pudo crear el tablero.'); return; }
    setAbierto(d.id);
  };
  const renombrar = async (t, nombre) => {
    setRenombrando(null);
    const limpio = nombre.trim();
    if (!limpio || limpio === t.nombre) return;
    const d = await llamar(`${API}/api/docs/tableros/${t.id}`, 'PATCH', { nombre: limpio });
    if (!d.ok) { toast.error(d.error || 'No se pudo renombrar.'); return; }
    setLista(xs => xs.map(x => (x.id === t.id ? { ...x, nombre: limpio.replace(/\s+/g, ' ') } : x)));
  };
  const archivar = async (t, valor) => {
    const d = await llamar(`${API}/api/docs/tableros/${t.id}`, 'PATCH', { archivado: valor });
    if (!d.ok) { toast.error(d.error || 'No se pudo completar.'); return; }
    toast.success(valor ? 'Tablero archivado' : 'Tablero recuperado');
    setLista(xs => xs.filter(x => x.id !== t.id));
  };
  const puedeArchivar = (t) => isAdmin || String(t.creado_por_id) === String(user?.id ?? '');

  const visibles = (lista || []).filter(t => !filtro.trim() || t.nombre.toLowerCase().includes(filtro.trim().toLowerCase()));
  const tMenu = menu && (lista || []).find(t => t.id === menu.id);
  const celda = { padding: '0 12px', fontSize: 13, color: '#333330', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  const cabecera = { ...celda, fontSize: 12, fontWeight: 600, color: GRIS };
  const COLUMNAS = 'minmax(260px, 1fr) 220px 200px 44px';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      <header style={{ padding: '14px 20px 0', flexShrink: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 400, marginBottom: 10 }}>Tableros</div>
        <div role="tablist" style={{ display: 'flex', gap: 20, borderBottom: `1px solid ${LINEA}` }}>
          {[[false, 'Tableros'], [true, 'Archivados']].map(([valor, texto]) => (
            <button key={texto} role="tab" aria-selected={archivados === valor} onClick={() => setArchivados(valor)}
              style={{ background: 'none', border: 'none', padding: '6px 0 8px', cursor: 'pointer', fontSize: 13,
                fontWeight: archivados === valor ? 600 : 400, color: archivados === valor ? TINTA : GRIS,
                borderBottom: archivados === valor ? `2px solid ${TINTA}` : '2px solid transparent', marginBottom: -1 }}>
              {texto}
            </button>
          ))}
        </div>
      </header>

      <div className="acc-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 8px 20px', borderBottom: `1px solid ${SUAVE}`, flexShrink: 0 }}>
        {!archivados && (
          <button type="button" className="barra-btn barra-btn--primario" onClick={crear} disabled={creando}>
            {creando ? 'Creando…' : 'Crear tablero'}
          </button>
        )}
        <div style={{ flex: 1 }} />
        <input type="search" value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar por nombre" aria-label="Buscar tableros por nombre"
          style={{ width: 240, height: 30, padding: '0 10px', border: `1px solid ${LINEA}`, borderRadius: 6, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLUMNAS, alignItems: 'center', height: 36, borderBottom: `1px solid ${LINEA}`, padding: '0 8px', position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 1 }}>
          <div style={cabecera}>Nombre</div>
          <div style={cabecera}>Abierto por última vez por usted</div>
          <div style={cabecera}>Creado por</div>
          <div />
        </div>
        {lista === null ? (
          <div style={{ textAlign: 'center', padding: 48 }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
        ) : error ? (
          <div style={{ padding: 48, textAlign: 'center', fontSize: 13, color: GRIS }}>{error}</div>
        ) : !visibles.length ? (
          <div style={{ padding: '56px 24px', textAlign: 'center', color: GRIS, fontSize: 13, lineHeight: 1.6 }}>
            {filtro.trim() ? 'Ningún tablero se llama así.'
              : archivados ? 'No hay tableros archivados.'
                : <>Aún no hay tableros en esta obra.<br />Un tablero es una pizarra de la obra: notas, textos y secciones para ordenar una reunión, un frente o una entrega.</>}
          </div>
        ) : visibles.map(t => (
          <div key={t.id} role="button" tabIndex={0} onClick={() => setAbierto(t.id)}
            onKeyDown={e => { if (e.key === 'Enter' && renombrando !== t.id) setAbierto(t.id); }}
            style={{ display: 'grid', gridTemplateColumns: COLUMNAS, alignItems: 'center', height: 52, padding: '0 8px', borderBottom: `1px solid ${SUAVE}`, cursor: 'pointer', outline: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#faf9f5'; }} onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
            <div style={{ ...celda, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 48, height: 32, flexShrink: 0, borderRadius: 4, border: `1px solid ${LINEA}`, background: '#faf9f5', color: GRIS, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconoModulo nombre="tableros" tamano={18} />
              </span>
              {renombrando === t.id ? (
                <input autoFocus defaultValue={t.nombre} maxLength={120} aria-label="Nombre del tablero"
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') renombrar(t, e.currentTarget.value); if (e.key === 'Escape') setRenombrando(null); }}
                  onBlur={e => renombrar(t, e.currentTarget.value)}
                  style={{ flex: 1, height: 28, padding: '0 8px', border: `1px solid ${LINEA}`, borderRadius: 4, fontSize: 13, fontFamily: 'inherit' }} />
              ) : <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.nombre}</span>}
            </div>
            <div style={{ ...celda, color: t.abierto_por_mi ? '#333330' : GRIS }}>{t.abierto_por_mi ? fecha(t.abierto_por_mi) : 'Nunca'}</div>
            <div style={celda}>{t.creado_por || '—'}</div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button type="button" aria-label={`Acciones de ${t.nombre}`} title="Acciones"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu(m => (m?.id === t.id ? null : { id: t.id, x: r.right, y: r.bottom + 4 })); }}
                style={{ width: 30, height: 30, border: 'none', borderRadius: 6, background: menu?.id === t.id ? SUAVE : 'transparent', cursor: 'pointer', color: GRIS, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5.5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="18.5" r="1.5" /></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {tMenu && createPortal(
        <div role="menu" onPointerDown={e => e.stopPropagation()}
          style={{ position: 'fixed', top: menu.y, left: menu.x - 180, width: 180, padding: '4px 0', background: '#fff', borderRadius: 8, boxShadow: '0 0 16px rgba(0,0,0,0.12)', zIndex: 10001 }}>
          {[
            ['Abrir', () => setAbierto(tMenu.id)],
            !archivados && ['Renombrar', () => setRenombrando(tMenu.id)],
            puedeArchivar(tMenu) && (archivados ? ['Recuperar', () => archivar(tMenu, false)] : ['Archivar', () => archivar(tMenu, true)]),
          ].filter(Boolean).map(([texto, accion]) => (
            <button key={texto} role="menuitem" onClick={() => { setMenu(null); accion(); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: TINTA }}
              onMouseEnter={e => { e.currentTarget.style.background = SUAVE; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
              {texto}
            </button>
          ))}
        </div>, document.body)}

      {abierto && <TableroEditor id={abierto} onCerrar={() => { setAbierto(null); recargar(); }} />}
    </div>
  );
}

// ── Editor: el tablero en pantalla completa ──────────────────────────────────────────────────────────
function TableroEditor({ id, onCerrar }) {
  const [datos, setDatos] = useState(null);       // { nombre, archivado, config, version } al abrir
  const [fallo, setFallo] = useState('');
  const [nombre, setNombre] = useState('');
  const [estado, setEstado] = useState('guardado'); // guardado | pendiente | guardando | error | archivado
  const lienzoRef = useRef(null);
  const base = useRef({ config: {}, version: 1 });   // lo último que sé que hay en el servidor
  const pendiente = useRef(false), enVuelo = useRef(null), temporizador = useRef(0);

  useEffect(() => {
    let vivo = true;
    llamar(`${API}/api/docs/tableros/${id}`).then(d => {
      if (!vivo) return;
      if (!d.ok) { setFallo(d.error || 'No se pudo abrir el tablero.'); return; }
      base.current = { config: d.config || {}, version: d.version };
      setNombre(d.nombre);
      setEstado(d.archivado ? 'archivado' : 'guardado');
      setDatos(d);
    });
    return () => { vivo = false; };
  }, [id]);

  const guardar = useCallback(async () => {
    clearTimeout(temporizador.current);
    if (enVuelo.current) { await enVuelo.current; }
    const lienzo = lienzoRef.current;
    if (!lienzo || !pendiente.current) return true;
    const vuelta = (async () => {
      for (let intento = 0; intento < 5; intento++) {
        const mio = lienzo.contenido();
        if (mismoContenido(mio, base.current.config)) { pendiente.current = false; setEstado('guardado'); return true; }
        const config = { ...base.current.config, ...mio };
        setEstado('guardando');
        const d = await llamar(`${API}/api/docs/tableros/${id}`, 'PUT', { config, version: base.current.version });
        if (d.ok) {
          base.current = { config, version: d.version };
          // Si se siguió dibujando mientras guardaba, queda pendiente para la próxima vuelta.
          pendiente.current = !mismoContenido(lienzo.contenido(), config);
          setEstado(pendiente.current ? 'pendiente' : 'guardado');
          if (pendiente.current) temporizador.current = setTimeout(() => { guardar(); }, ESPERA_GUARDAR_MS);
          return true;
        }
        if (d.estado === 409 && d.code === 'VERSION') {
          // Otra persona guardó: se fusiona por elemento sobre lo suyo y se vuelve a intentar.
          const suyo = d.config || {};
          const fusion = fusionar(base.current.config, lienzo.contenido(), suyo);
          base.current = { config: suyo, version: d.version };
          lienzo.aplicar(fusion);
          toast('Otra persona guardó este tablero: se juntaron sus cambios con los tuyos.', { id: 'tablero-fusion' });
          continue;
        }
        if (d.estado === 409 && d.code === 'ARCHIVADO') { pendiente.current = false; setEstado('archivado'); return false; }
        setEstado('error');
        toast.error(d.error || 'No se pudo guardar el tablero.', { id: 'tablero-error' });
        return false;
      }
      setEstado('error');
      return false;
    })();
    enVuelo.current = vuelta;
    try { return await vuelta; } finally { enVuelo.current = null; }
  }, [id]);

  const alCambiar = useCallback(() => {
    if (estado === 'archivado') return;
    pendiente.current = true;
    setEstado(e => (e === 'guardando' ? e : 'pendiente'));
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => { guardar(); }, ESPERA_GUARDAR_MS);
  }, [guardar, estado]);

  // Salir sin perder nada: guardar antes de cerrar, al ocultar la pestaña, y avisar si se cierra la ventana.
  useEffect(() => {
    const alOcultar = () => { if (document.visibilityState === 'hidden' && pendiente.current) guardar(); };
    const alSalir = (e) => { if (pendiente.current || enVuelo.current) { e.preventDefault(); e.returnValue = ''; } };
    document.addEventListener('visibilitychange', alOcultar);
    window.addEventListener('beforeunload', alSalir);
    return () => { document.removeEventListener('visibilitychange', alOcultar); window.removeEventListener('beforeunload', alSalir); clearTimeout(temporizador.current); };
  }, [guardar]);

  const cerrar = async () => {
    if (pendiente.current || enVuelo.current) {
      const ok = await guardar();
      if (!ok && pendiente.current && !window.confirm('No se pudo guardar el último cambio. ¿Salir de todos modos?')) return;
    }
    onCerrar();
  };
  const renombrar = async () => {
    const limpio = nombre.trim().replace(/\s+/g, ' ');
    if (!limpio || limpio === datos?.nombre) { setNombre(datos?.nombre || ''); return; }
    const d = await llamar(`${API}/api/docs/tableros/${id}`, 'PATCH', { nombre: limpio });
    if (!d.ok) { toast.error(d.error || 'No se pudo renombrar.'); setNombre(datos.nombre); return; }
    setDatos(x => ({ ...x, nombre: limpio })); setNombre(limpio);
  };
  const recuperar = async () => {
    const d = await llamar(`${API}/api/docs/tableros/${id}`, 'PATCH', { archivado: false });
    if (!d.ok) { toast.error(d.error || 'No se pudo recuperar.'); return; }
    setEstado('guardado'); toast.success('Tablero recuperado');
  };

  const textoEstado = { guardado: 'Guardado', pendiente: 'Cambios sin guardar', guardando: 'Guardando…', error: 'No se pudo guardar', archivado: 'Archivado' }[estado];

  return createPortal(
    <div role="dialog" aria-label={`Tablero ${nombre}`} style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', flexDirection: 'column', background: '#faf9f5' }}>
      <header style={{ height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', background: '#fff', borderBottom: `1px solid ${LINEA}` }}>
        <button type="button" onClick={cerrar} title="Volver a los tableros"
          style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px 0 6px', border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: TINTA }}
          onMouseEnter={e => { e.currentTarget.style.background = SUAVE; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 6 8.5 12l6 6" /></svg>
          Tableros
        </button>
        <span style={{ width: 1, height: 20, background: LINEA }} />
        <input value={nombre} onChange={e => setNombre(e.target.value)} onBlur={renombrar} maxLength={120} aria-label="Nombre del tablero"
          disabled={!datos || estado === 'archivado'}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setNombre(datos?.nombre || ''); e.currentTarget.blur(); } }}
          style={{ minWidth: 120, width: `${Math.max(12, nombre.length + 2)}ch`, maxWidth: 480, height: 30, padding: '0 8px', border: '1px solid transparent', borderRadius: 6, background: 'transparent', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', color: TINTA, outline: 'none' }}
          onFocus={e => { e.currentTarget.style.borderColor = LINEA; }} onBlurCapture={e => { e.currentTarget.style.borderColor = 'transparent'; }} />
        <div style={{ flex: 1 }} />
        {estado === 'archivado' && (
          <button type="button" className="barra-btn" onClick={recuperar}>Recuperar para editar</button>
        )}
        {estado === 'error' && (
          <button type="button" className="barra-btn" onClick={() => { pendiente.current = true; guardar(); }}>Reintentar</button>
        )}
        <span aria-live="polite" style={{ fontSize: 12, color: estado === 'error' ? '#b93535' : GRIS, minWidth: 130, textAlign: 'right' }}>{datos ? textoEstado : ''}</span>
      </header>
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {fallo ? (
          <div style={{ padding: 48, textAlign: 'center', color: GRIS, fontSize: 13 }}>{fallo}</div>
        ) : !datos ? (
          <div style={{ textAlign: 'center', padding: 48 }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
        ) : (
          <Lienzo key={id} ref={lienzoRef} inicial={datos.config} onCambio={alCambiar} claveCamara={`alephia-tablero-camara:${id}`} />
        )}
      </div>
    </div>,
    document.body,
  );
}
