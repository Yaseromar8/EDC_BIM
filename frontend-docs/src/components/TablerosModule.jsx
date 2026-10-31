// TablerosModule.jsx — los Tableros de la obra (30-oct-2026, docs/visor/57), como los «Paneles» de ACC:
// una lista por obra (crear, abrir, renombrar, archivar; «abierto por última vez por usted», «creado por»)
// y cada tablero en pantalla completa sobre el lienzo compartido de design/lienzo (el mismo motor que el
// Tablero de View).
//
// Guardar sin pisar a nadie: cada guardado lleva la versión sobre la que se hizo; si otra persona guardó
// antes, el servidor responde 409 con lo suyo, se fusiona por elemento (design/lienzo/fusion.js) y se vuelve
// a guardar. Nada se reemplaza a ciegas.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import IconoModulo from './IconoModulo';
import Lienzo from '../../../design/lienzo/Lienzo';
import { DocumentosDelTablero, versionesVigentes, extensionDe, TAMANO_TARJETA } from './tableros/documentos';
import { tipoDocumento } from './tableros/tipoDocumento';
import PanelDocumentos from './tableros/PanelDocumentos';
import { enlaceDeArchivos } from '../utils/enlacesDeArchivos';
import { fusionar, mismoContenido } from '../../../design/lienzo/fusion';
import { miniaturaSvg } from '../../../design/lienzo/miniatura';

const GRIS = '#72706b', LINEA = '#e8e6dc', SUAVE = '#f1f0e8', TINTA = '#141413';
const ESPERA_GUARDAR_MS = 800;
const VIGILAR_MS = 10000;            // cada cuánto se mira si otra persona guardó (solo la versión)
const imagenDe = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

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
  const [orden, setOrden] = useState(null);           // { campo, asc } · sin orden: los abiertos por mí primero
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

  const filtrados = (lista || []).filter(t => !filtro.trim() || t.nombre.toLowerCase().includes(filtro.trim().toLowerCase()));
  const comparar = {
    nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base', numeric: true }),
    abierto: (a, b) => (a.abierto_por_mi ? Date.parse(a.abierto_por_mi) : -Infinity) - (b.abierto_por_mi ? Date.parse(b.abierto_por_mi) : -Infinity),
    creado: (a, b) => (a.creado_por || '').localeCompare(b.creado_por || '', 'es', { sensitivity: 'base' }),
  };
  const visibles = orden ? [...filtrados].sort((a, b) => (orden.asc ? 1 : -1) * comparar[orden.campo](a, b)) : filtrados;
  const ordenarPor = (campo) => setOrden(o => (o?.campo === campo ? (o.asc === (campo !== 'abierto') ? { campo, asc: !o.asc } : null) : { campo, asc: campo !== 'abierto' }));
  const Cabecera = ({ campo, children }) => (
    <button type="button" onClick={() => ordenarPor(campo)} aria-sort={orden?.campo === campo ? (orden.asc ? 'ascending' : 'descending') : 'none'}
      title="Ordenar" style={{ ...cabecera, display: 'flex', alignItems: 'center', gap: 4, height: '100%', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
      {children}
      <span aria-hidden="true" style={{ fontSize: 12, color: orden?.campo === campo ? TINTA : 'transparent' }}>{orden?.campo === campo && !orden.asc ? '▼' : '▲'}</span>
    </button>
  );
  const tMenu = menu && (lista || []).find(t => t.id === menu.id);
  const celda = { padding: '0 12px', fontSize: 14, color: '#333330', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  const cabecera = { ...celda, fontSize: 13, fontWeight: 600, color: GRIS };
  const COLUMNAS = 'minmax(280px, 1fr) 240px 200px 44px';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      <header style={{ padding: '14px 20px 0', flexShrink: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 400, marginBottom: 10 }}>Tableros</div>
        <div role="tablist" style={{ display: 'flex', gap: 20, borderBottom: `1px solid ${LINEA}` }}>
          {[[false, 'Tableros'], [true, 'Archivados']].map(([valor, texto]) => (
            <button key={texto} role="tab" aria-selected={archivados === valor} onClick={() => setArchivados(valor)}
              style={{ background: 'none', border: 'none', padding: '6px 0 8px', cursor: 'pointer', fontSize: 14,
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
          style={{ width: 240, height: 30, padding: '0 10px', border: `1px solid ${LINEA}`, borderRadius: 6, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLUMNAS, alignItems: 'center', height: 36, borderBottom: `1px solid ${LINEA}`, padding: '0 8px', position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 1 }}>
          <Cabecera campo="nombre">Nombre</Cabecera>
          <Cabecera campo="abierto">Abierto por última vez por usted</Cabecera>
          <Cabecera campo="creado">Creado por</Cabecera>
          <div />
        </div>
        {lista === null ? (
          <div style={{ textAlign: 'center', padding: 48 }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
        ) : error ? (
          <div style={{ padding: 48, textAlign: 'center', fontSize: 14, color: GRIS }}>{error}</div>
        ) : !visibles.length ? (
          <div style={{ padding: '56px 24px', textAlign: 'center', color: GRIS, fontSize: 14, lineHeight: 1.6 }}>
            {filtro.trim() ? 'Ningún tablero se llama así.'
              : archivados ? 'No hay tableros archivados.'
                : <>Aún no hay tableros en esta obra.<br />Un tablero es una pizarra de la obra: notas, textos y secciones para ordenar una reunión, un frente o una entrega.</>}
          </div>
        ) : visibles.map(t => (
          <div key={t.id} role="button" tabIndex={0} onClick={() => setAbierto(t.id)}
            onKeyDown={e => { if (e.key === 'Enter' && renombrando !== t.id) setAbierto(t.id); }}
            style={{ display: 'grid', gridTemplateColumns: COLUMNAS, alignItems: 'center', height: 60, padding: '0 8px', borderBottom: `1px solid ${SUAVE}`, cursor: 'pointer', outline: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#faf9f5'; }} onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
            <div style={{ ...celda, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 64, height: 40, flexShrink: 0, borderRadius: 4, border: `1px solid ${LINEA}`, background: '#faf9f5', color: GRIS, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {t.miniatura ? <img src={imagenDe(t.miniatura)} alt="" width={64} height={40} style={{ display: 'block' }} /> : <IconoModulo nombre="tableros" tamano={18} />}
              </span>
              {renombrando === t.id ? (
                <input autoFocus defaultValue={t.nombre} maxLength={120} aria-label="Nombre del tablero"
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') renombrar(t, e.currentTarget.value); if (e.key === 'Escape') setRenombrando(null); }}
                  onBlur={e => renombrar(t, e.currentTarget.value)}
                  style={{ flex: 1, height: 28, padding: '0 8px', border: `1px solid ${LINEA}`, borderRadius: 4, fontSize: 14, fontFamily: 'inherit' }} />
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
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', color: TINTA }}
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
  const [estado, setEstado] = useState('guardado'); // guardado | pendiente | guardando | error | sinConexion | archivado
  const [aviso, setAviso] = useState('');           // aviso breve en la cabecera («Al día con los cambios de …»)
  const lienzoRef = useRef(null), nombreRef = useRef(''), avisoT = useRef(0);
  const base = useRef({ config: {}, version: 1 });   // lo último que sé que hay en el servidor
  const pendiente = useRef(false), enVuelo = useRef(null), temporizador = useRef(0);
  // DOCUMENTOS (fase 2, docs/visor/59): la versión vigente de cada documento del tablero, para avisar de las nuevas.
  const [vigentes, setVigentes] = useState({});
  const [panelDocumentos, setPanelDocumentos] = useState(false);
  const vigentesRef = useRef({});
  const obra = datos?.model_urn || '';
  const mirarVigentes = useCallback(async (contenido) => {
    if (!obra) return;
    const ids = (contenido?.notas || []).filter(n => n.tipo === 'documento' && n.nodeId && !(n.nodeId in vigentesRef.current)).map(n => n.nodeId);
    if (!ids.length) return;
    ids.forEach(i => { vigentesRef.current[i] = vigentesRef.current[i] || null; });
    const nuevas = await versionesVigentes(obra, ids);
    vigentesRef.current = { ...vigentesRef.current, ...nuevas };
    setVigentes(v => ({ ...v, ...nuevas }));
  }, [obra]);
  const abrir = useCallback((el) => {
    window.open(enlaceDeArchivos(window.location.origin, { obra, carpeta: el.parentId, documento: el.nodeId, version: el.versionId }), '_blank', 'noopener');
  }, [obra]);
  const tipos = useMemo(() => ({ documento: tipoDocumento({ abrir }) }), [abrir]);
  const anadirDocumentos = async (filas) => {
    setPanelDocumentos(false);
    const sinVersion = filas.filter(f => !f.version_id).map(f => f.id);
    const vig = sinVersion.length ? await versionesVigentes(obra, sinVersion) : {};
    lienzoRef.current?.insertar(filas.map(f => ({
      tipo: 'documento', ...TAMANO_TARJETA,
      nodeId: f.id, versionId: f.version_id || vig[f.id]?.versionId || null, version: f.version_id ? (f.version || null) : (vig[f.id]?.version || f.version || null),
      parentId: f.parent_id || null, nombre: f.name, ext: extensionDe(f.name),
    })));
  };

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
        const d = await llamar(`${API}/api/docs/tableros/${id}`, 'PUT', { config, version: base.current.version, miniatura: miniaturaSvg(config) });
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
        // Sin conexión: no es un error de nadie; se guarda solo al volver la red.
        if (d.estado === 0) { setEstado('sinConexion'); return false; }
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

  useEffect(() => { if (datos) mirarVigentes(datos.config); }, [datos ? 1 : 0, mirarVigentes]);   // eslint-disable-line react-hooks/exhaustive-deps
  const alCambiar = useCallback((contenido) => {
    mirarVigentes(contenido);
    if (estado === 'archivado') return;
    pendiente.current = true;
    setEstado(e => (e === 'guardando' ? e : 'pendiente'));
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => { guardar(); }, ESPERA_GUARDAR_MS);
  }, [guardar, estado, mirarVigentes]);

  // Ver lo que guardan los demás sin tener que guardar uno: cada 10 s, con la pestaña a la vista, se pregunta solo
  // la versión. Si hay otra y aquí no hay nada pendiente ni a medio gesto, se trae y se pone; si hay algo
  // pendiente, se guarda ya (el 409 trae lo suyo y se fusiona).
  useEffect(() => {
    if (!datos) return undefined;
    let vivo = true;
    const mirar = async () => {
      if (!vivo || document.visibilityState !== 'visible' || enVuelo.current || estado === 'archivado' || !navigator.onLine) return;
      const v = await llamar(`${API}/api/docs/tableros/${id}?solo_version=1`);
      if (!vivo || !v.ok || !(v.version > base.current.version)) return;
      if (pendiente.current) { guardar(); return; }
      const lienzo = lienzoRef.current;
      if (!lienzo || lienzo.ocupado()) return;           // a mitad de un gesto o escribiendo: en la siguiente vuelta
      const d = await llamar(`${API}/api/docs/tableros/${id}?sin_apertura=1`);
      if (!vivo || !d.ok || pendiente.current || enVuelo.current || lienzo.ocupado() || !(d.version > base.current.version)) return;
      base.current = { config: d.config || {}, version: d.version };
      lienzo.aplicar(d.config || {});
      mirarVigentes(d.config);
      if (d.nombre && d.nombre !== nombreRef.current) { setNombre(d.nombre); setDatos(x => ({ ...x, nombre: d.nombre })); }
      setAviso('Al día con los cambios de otra persona');
      clearTimeout(avisoT.current);
      avisoT.current = setTimeout(() => setAviso(''), 4000);
    };
    const t = setInterval(mirar, VIGILAR_MS);
    return () => { vivo = false; clearInterval(t); };
  }, [datos ? 1 : 0, id, estado, guardar]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Sin conexión: se avisa y, al volver la red, se guarda lo pendiente.
  useEffect(() => {
    const sinRed = () => { if (pendiente.current) setEstado('sinConexion'); };
    const conRed = () => { if (pendiente.current) guardar(); else setEstado(e => (e === 'sinConexion' ? 'guardado' : e)); };
    window.addEventListener('offline', sinRed); window.addEventListener('online', conRed);
    return () => { window.removeEventListener('offline', sinRed); window.removeEventListener('online', conRed); };
  }, [guardar]);

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

  nombreRef.current = nombre;
  const textoEstado = { guardado: 'Guardado', pendiente: 'Cambios sin guardar', guardando: 'Guardando…', error: 'No se pudo guardar',
    sinConexion: 'Sin conexión · se guardará al volver', archivado: 'Archivado' }[estado];

  return createPortal(
    <div role="dialog" aria-label={`Tablero ${nombre}`} style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', flexDirection: 'column', background: '#faf9f5' }}>
      <header style={{ height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', background: '#fff', borderBottom: `1px solid ${LINEA}` }}>
        <button type="button" onClick={cerrar} title="Volver a los tableros"
          style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px 0 6px', border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', color: TINTA }}
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
        <span aria-live="polite" style={{ fontSize: 13, color: estado === 'error' || estado === 'sinConexion' ? '#b93535' : GRIS, minWidth: 130, textAlign: 'right' }}>
          {datos ? (aviso && estado === 'guardado' ? aviso : textoEstado) : ''}
        </span>
      </header>
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {fallo ? (
          <div style={{ padding: 48, textAlign: 'center', color: GRIS, fontSize: 14 }}>{fallo}</div>
        ) : !datos ? (
          <div style={{ textAlign: 'center', padding: 48 }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
        ) : (
          <DocumentosDelTablero.Provider value={{ obra, vigentes }}>
            <Lienzo key={id} ref={lienzoRef} inicial={datos.config} onCambio={alCambiar} claveCamara={`alephia-tablero-camara:${id}`} tipos={tipos}
              paletaExtra={estado === 'archivado' ? [] : [['documento', 'Documentos', () => setPanelDocumentos(p => !p)]]} />
            {panelDocumentos && <PanelDocumentos obra={obra} onAnadir={anadirDocumentos} onCerrar={() => setPanelDocumentos(false)} />}
          </DocumentosDelTablero.Provider>
        )}
      </div>
    </div>,
    document.body,
  );
}
