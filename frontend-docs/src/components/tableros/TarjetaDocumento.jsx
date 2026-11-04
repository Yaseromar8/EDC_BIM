/**
 * TarjetaDocumento — un documento de Docs dentro de un tablero (fase 2, docs/visor/59), como las tarjetas de ACC.
 *
 * Por omisión es LA LÁMINA SOLA, a su proporción, con una sombra suave (ACC: «Mostrar metadatos» apagado). Al cargar
 * la imagen la tarjeta toma la proporción real de la hoja (`ajustar`, sin paso de deshacer). Lo que no tiene imagen
 * (DWG y RVT de momento, Excel, Word…) es una FICHA con su icono y su nombre.
 *
 * El elemento guarda el DOCUMENTO (`nodeId`, el linaje) y la VERSIÓN elegida (`versionId`, `version`, `fecha`): la
 * tarjeta no cambia sola cuando se sube otra. Lo avisa («Hay V2») y en su barra se elige cualquier versión (V1 ▾).
 * Quien no tiene permiso ve «Documento sin acceso», sin nombre ni imagen.
 *
 * Solo componentes: lo compartido está en documentos.js, la imagen en imagenDocumento.js y el registro para el
 * Lienzo en tipoDocumento.js.
 */
import React, { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { renderFileIconSop } from '../../utils/fileIcons';
import { DocumentosDelTablero, conLamina, hayVersionNueva, metaDe, fechaHora, versionesDe } from './documentos';
import { imagenDe, hojaDe, hojasDe, planoDe } from './imagenDocumento';

const GRIS = '#72706B', TINTA = '#141413', BORDE = '#D9D7CD';
const SOMBRA = '0 1px 2px rgba(20,20,19,0.08), 0 6px 18px rgba(20,20,19,0.10)';

const icono = (d) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICONOS = {
  abrir: icono(<><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>),
  mostrar: icono(<><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><path d="M3.5 9h17M9 9v10.5" /></>),
  completa: icono(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />),
  extraer: icono(<><rect x="8" y="8" width="12" height="12" rx="1.5" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></>),
  antes: icono(<path d="m14.5 6-6 6 6 6" />),
  despues: icono(<path d="m9.5 6 6 6-6 6" />),
  hoja: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></svg>,
};

// Barra de espera sin porcentaje (la imagen viaja desde el almacén y no dice cuánto falta).
const CSS_ESPERA = '@keyframes tarjeta-espera { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }';
const esperando = (
  <div style={{ width: '56%', height: 3, borderRadius: 2, background: '#E2E0D8', overflow: 'hidden' }}>
    <style>{CSS_ESPERA}</style>
    <div style={{ width: '38%', height: '100%', background: 'var(--accent, #0D66B4)', animation: 'tarjeta-espera 1.1s ease-in-out infinite' }} />
  </div>
);

const aviso = (texto, sub, hijo = null) => (
  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
    color: GRIS, fontSize: 13, textAlign: 'center', padding: 16, background: '#F4F3EE' }}>
    {ICONOS.hoja}
    {hijo}
    <span>{texto}</span>
    {sub && <span style={{ fontSize: 12, color: '#8A8880' }}>{sub}</span>}
  </div>
);

// La franja de datos (icono, nombre, versión, última actualización), ENCIMA de la lámina: no tapa la hoja.
function Metadatos({ el, meta, hayNueva, vigente }) {
  const partes = [];
  if (meta.version && el.version) partes.push(`V${el.version}${hayNueva ? ` · hay V${vigente.version}` : ''}`);
  if (hojaDe(el) > 1) partes.push(`Hoja ${hojaDe(el)}`);
  if (meta.fecha && el.fecha) partes.push(`Última actualización: ${fechaHora(el.fecha)}`);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', paddingBottom: 6, display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 13, color: TINTA, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
      {meta.icono && renderFileIconSop(el.nombre, 16)}
      {meta.nombre && <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{el.nombre}</span>}
      {partes.length > 0 && <span style={{ color: hayNueva ? 'var(--a-status-warning)' : GRIS, flexShrink: 0 }}>{partes.join(' · ')}</span>}
    </div>
  );
}

export function TarjetaDocumento({ elemento: el, elegido, ajustar }) {
  const { vigentes } = useContext(DocumentosDelTablero);
  const [imagen, setImagen] = useState({ estado: 'cargando' });
  const [avance, setAvance] = useState(null);
  const [cargada, setCargada] = useState(false);
  const vigente = vigentes[el.nodeId];
  const sinAcceso = imagen.estado === 'sinAcceso' || vigente?.sinAcceso;
  const hayNueva = hayVersionNueva(el, vigente);
  const meta = metaDe(el);
  const ficha = imagen.estado === 'ficha';
  const conSombra = el.sombra !== false && !elegido;

  useEffect(() => {
    let vivo = true;
    setImagen({ estado: 'cargando' }); setCargada(false); setAvance(null);
    imagenDe(el, (f) => { if (vivo) setAvance(f); }).then(r => { if (vivo) setImagen(r); });
    return () => { vivo = false; };
  }, [el.nodeId, el.versionId, el.ext, el.pagina]);   // eslint-disable-line react-hooks/exhaustive-deps

  // La lámina toma su proporción real la primera vez que se ve (y si otra versión trae otra hoja).
  const alCargar = (e) => {
    setCargada(true);
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (!w || !h || !ajustar) return;
    const ar = w / h;
    if (el.ar && Math.abs(el.ar - ar) <= 0.01) return;
    // Se conserva el lado mayor: una hoja vertical junto a otras apaisadas mide lo mismo de alto que ellas de ancho,
    // en vez de alargarse hacia abajo.
    const lado = Math.max(el.w, el.h);
    ajustar(ar >= 1 ? { ar: Math.round(ar * 10000) / 10000, w: lado, h: Math.round(lado / ar) }
      : { ar: Math.round(ar * 10000) / 10000, w: Math.round(lado * ar), h: lado });
  };

  let cuerpo;
  if (sinAcceso) cuerpo = aviso('Documento sin acceso', 'No tienes permiso para ver este documento');
  else if (ficha) {
    cuerpo = (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, padding: '14px 16px', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ flexShrink: 0, display: 'inline-flex' }}>{renderFileIconSop(el.nombre, 28)}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: TINTA, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>{el.nombre}</span>
        </div>
        <span style={{ fontSize: 12, color: GRIS }}>
          {[el.version ? `V${el.version}` : null, el.fecha ? `Última actualización: ${fechaHora(el.fecha)}` : null].filter(Boolean).join(' · ')}
        </span>
        <span style={{ fontSize: 12, color: '#8A8880' }}>Doble clic para abrirlo</span>
      </div>
    );
  } else if (imagen.estado === 'lista') {
    cuerpo = (
      <>
        {!cargada && aviso('Cargando archivo…', null, esperando)}
        <img src={imagen.url} alt="" draggable={false} onLoad={alCargar} onError={() => setImagen({ estado: 'error' })}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: cargada ? 1 : 0, transition: 'opacity 160ms ease', pointerEvents: 'none' }} />
      </>
    );
  } else if (imagen.estado === 'error') cuerpo = aviso('No se pudo cargar la vista previa', 'Doble clic para abrirlo');
  else if (avance !== null) {
    // Como ACC («Preparando 1 páginas…»): la lámina se está dibujando, con su avance.
    cuerpo = aviso('Preparando la vista previa…', null, (
      <div style={{ width: '56%', height: 3, borderRadius: 2, background: '#E2E0D8', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(6, Math.round(avance * 100))}%`, height: '100%', background: 'var(--accent, #0D66B4)', transition: 'width 200ms ease' }} />
      </div>
    ));
  } else cuerpo = aviso('Cargando archivo…', null, esperando);   // como ACC, en vez de un rectángulo gris vacío

  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'var(--a-font-sans)' }}>
      {meta.ver && !sinAcceso && <Metadatos el={el} meta={meta} hayNueva={hayNueva} vigente={vigente} />}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#fff', borderRadius: 2,
        border: `1px solid ${ficha ? BORDE : 'rgba(20,20,19,0.10)'}`, boxShadow: conSombra ? SOMBRA : 'none' }}>
        {cuerpo}
      </div>
      {hayNueva && !meta.ver && (
        <span title={`V${el.version} · hay V${vigente.version}`}
          style={{ position: 'absolute', top: 8, right: 8, fontSize: 12, fontWeight: 600, padding: '2px 7px', borderRadius: 4, pointerEvents: 'none',
            color: 'var(--a-status-warning)', border: '1px solid var(--a-status-warning-border)', background: 'var(--a-status-warning-surface)' }}>
          Hay V{vigente.version}
        </span>
      )}
    </div>
  );
}

// ── La barra de la tarjeta: V1 ▾ · Abrir · Mostrar como · Pantalla completa ─────────────────────────────────────

const BOTON = { height: 30, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.14)',
  background: '#fff', cursor: 'pointer', fontFamily: 'var(--a-font-sans)', fontSize: 13, color: '#3C3C3C', whiteSpace: 'nowrap' };
const ICONO = { ...BOTON, width: 30, padding: 0, justifyContent: 'center', border: '1px solid transparent', background: 'transparent' };
const MENU = { position: 'absolute', top: 'calc(100% + 8px)', zIndex: 30, background: '#fff', borderRadius: 8, boxShadow: '0 0 16px rgba(0,0,0,0.14)',
  padding: 6, fontFamily: 'var(--a-font-sans)', fontSize: 13, color: TINTA, cursor: 'default' };

// Un desplegable que se cierra al hacer clic fuera o con Escape.
function useDesplegable() {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    const tecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setAbierto(false); } };
    document.addEventListener('pointerdown', fuera, true);
    window.addEventListener('keydown', tecla, true);
    return () => { document.removeEventListener('pointerdown', fuera, true); window.removeEventListener('keydown', tecla, true); };
  }, [abierto]);
  return [abierto, setAbierto, ref];
}

function MenuVersiones({ el, vigente, hayNueva, actualizar }) {
  const { obra } = useContext(DocumentosDelTablero);
  const [abierto, setAbierto, ref] = useDesplegable();
  const [lista, setLista] = useState(null);
  useEffect(() => {
    if (!abierto) return undefined;
    let vivo = true;
    setLista(null);
    versionesDe(obra, el.nodeId).then(l => { if (vivo) setLista(l); });
    return () => { vivo = false; };
  }, [abierto, obra, el.nodeId]);
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" aria-haspopup="listbox" aria-expanded={abierto} onClick={() => setAbierto(a => !a)}
        title={hayNueva ? `V${el.version} · hay V${vigente.version}` : `V${el.version}`}
        style={hayNueva ? { ...BOTON, color: 'var(--a-status-warning)', borderColor: 'var(--a-status-warning-border)', background: 'var(--a-status-warning-surface)' } : BOTON}>
        V{el.version || '?'}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
      </button>
      {abierto && (
        <div role="listbox" aria-label="Versiones" style={{ ...MENU, left: 0, minWidth: 250 }}>
          {lista === null && <div style={{ padding: '8px 10px', color: GRIS }}>Cargando…</div>}
          {lista && !lista.length && <div style={{ padding: '8px 10px', color: GRIS }}>No se pudo leer el historial.</div>}
          {lista && lista.map(v => {
            const actual = v.id === el.versionId;
            return (
              <button key={v.id} type="button" role="option" aria-selected={actual}
                onClick={() => { setAbierto(false); if (!actual) actualizar({ versionId: v.id, version: v.version, fecha: v.fecha }); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 10px', border: 'none', borderRadius: 6, cursor: 'pointer',
                  background: actual ? 'rgba(13,102,180,0.07)' : 'transparent', fontFamily: 'inherit', fontSize: 13, color: TINTA, textAlign: 'left' }}>
                <span style={{ fontWeight: 600, padding: '0 6px', border: `1px solid ${BORDE}`, borderRadius: 4, fontSize: 12 }}>V{v.version}</span>
                <span style={{ flex: 1 }}>{fechaHora(v.fecha)}</span>
                {actual && <span aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}

// Un interruptor como los de ACC: la casilla de verdad sigue ahí (teclado, lector de pantalla), invisible.
function Interruptor({ etiqueta, activo, alCambiar }) {
  return (
    <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', cursor: 'pointer' }}>
      <span style={{ flex: 1 }}>{etiqueta}</span>
      <input type="checkbox" role="switch" checked={activo} onChange={e => alCambiar(e.target.checked)}
        style={{ position: 'absolute', right: 10, width: 30, height: 18, margin: 0, opacity: 0, cursor: 'pointer' }} />
      <span aria-hidden="true" style={{ width: 30, height: 18, borderRadius: 9, flexShrink: 0, position: 'relative', transition: 'background 120ms ease',
        background: activo ? 'var(--accent, #0D66B4)' : '#C9C7BE' }}>
        <span style={{ position: 'absolute', top: 2, left: activo ? 14 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transition: 'left 120ms ease' }} />
      </span>
    </label>
  );
}

function MenuMostrarComo({ el, actualizar }) {
  const [abierto, setAbierto, ref] = useDesplegable();
  const meta = metaDe(el);
  const ponerMeta = (cambio) => actualizar({ meta: { ...meta, ...cambio } });
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" aria-label="Mostrar como" title="Mostrar como" aria-expanded={abierto} onClick={() => setAbierto(a => !a)}
        style={{ ...ICONO, background: abierto ? 'rgba(0,0,0,0.06)' : 'transparent' }}>{ICONOS.mostrar}</button>
      {abierto && (
        <div role="dialog" aria-label="Mostrar como" style={{ ...MENU, left: -110, width: 250 }}>
          <div style={{ padding: '6px 10px 2px', fontWeight: 600 }}>Diseño</div>
          <Interruptor etiqueta="Mostrar sombra" activo={el.sombra !== false} alCambiar={v => actualizar({ sombra: v })} />
          <Interruptor etiqueta="Mostrar metadatos" activo={meta.ver} alCambiar={v => ponerMeta({ ver: v })} />
          {[['icono', 'Icono de archivo'], ['nombre', 'Nombre de archivo'], ['version', 'Versión'], ['fecha', 'Última actualización']].map(([k, t]) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px 6px 18px', cursor: meta.ver ? 'pointer' : 'default', opacity: meta.ver ? 1 : 0.5 }}>
              <input type="checkbox" checked={meta[k]} disabled={!meta.ver} onChange={e => ponerMeta({ [k]: e.target.checked })} />
              <span>{t}</span>
            </label>
          ))}
        </div>
      )}
    </span>
  );
}

// La lámina a pantalla completa (Escape o clic fuera para volver al tablero).
function PantallaCompleta({ el, onCerrar }) {
  const [imagen, setImagen] = useState({ estado: 'cargando' });
  useEffect(() => { let vivo = true; imagenDe(el).then(r => { if (vivo) setImagen(r); }); return () => { vivo = false; }; }, [el]);
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onCerrar(); } };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [onCerrar]);
  return createPortal(
    <div role="dialog" aria-label={`${el.nombre}, pantalla completa`} onPointerDown={e => e.stopPropagation()}
      style={{ position: 'fixed', inset: 0, zIndex: 10100, background: 'rgba(20,20,19,0.88)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--a-font-sans)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', color: '#fff', fontSize: 14 }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{el.nombre}{el.version ? ` · V${el.version}` : ''}</span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" style={{ width: 32, height: 32, border: 'none', borderRadius: 6, background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', fontSize: 18 }}>×</button>
      </div>
      <div onClick={e => { if (e.target === e.currentTarget) onCerrar(); }} style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px 24px' }}>
        {imagen.estado === 'lista'
          ? <img src={imagen.url} alt={el.nombre} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }} />
          : <span style={{ color: '#E2E0D8', fontSize: 14 }}>{imagen.estado === 'cargando' ? 'Cargando…' : 'No hay vista previa de este documento.'}</span>}
      </div>
    </div>,
    document.body,
  );
}

// ◀ 2/3 ▶ y «Extraer páginas» (como ACC), solo si el documento tiene más de una hoja. Cambiar de hoja es un paso de
// deshacer; extraer pone una tarjeta por cada otra hoja, a la derecha: el MISMO documento, otra hoja (nada se copia).
function Hojas({ el, actualizar, extraer }) {
  const [total, setTotal] = useState(null);
  const [nombres, setNombres] = useState([]);           // un DWG: el nombre de cada presentación
  useEffect(() => {
    let vivo = true;
    hojasDe(el).then(n => { if (vivo) setTotal(n); });
    if (el.ext === 'dwg') planoDe(el).then(p => { if (vivo && p.estado === 'listo') setNombres(p.hojas.map(h => h.nombre)); });
    return () => { vivo = false; };
  }, [el.nodeId, el.versionId, el.ext]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!total || total < 2) return null;
  const hoja = Math.min(hojaDe(el), total);
  const ir = (n) => actualizar({ pagina: n, ar: null });
  return (
    <>
      <span role="group" aria-label="Hojas" style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        <button type="button" aria-label="Hoja anterior" title="Hoja anterior" disabled={hoja <= 1} onClick={() => ir(hoja - 1)}
          style={{ ...ICONO, opacity: hoja <= 1 ? 0.35 : 1, cursor: hoja <= 1 ? 'default' : 'pointer' }}>{ICONOS.antes}</button>
        <span title={nombres[hoja - 1] || ''} style={{ minWidth: 34, textAlign: 'center', fontSize: 13, color: '#3C3C3C', fontVariantNumeric: 'tabular-nums' }}>{hoja}/{total}</span>
        <button type="button" aria-label="Hoja siguiente" title="Hoja siguiente" disabled={hoja >= total} onClick={() => ir(hoja + 1)}
          style={{ ...ICONO, opacity: hoja >= total ? 0.35 : 1, cursor: hoja >= total ? 'default' : 'pointer' }}>{ICONOS.despues}</button>
      </span>
      {extraer && (
        <button type="button" aria-label="Extraer páginas" title="Extraer páginas" style={ICONO}
          onClick={() => extraer(el, total)}>{ICONOS.extraer}</button>
      )}
    </>
  );
}

export function BarraDocumento({ el, actualizar, abrir, extraer }) {
  const { vigentes } = useContext(DocumentosDelTablero);
  const vigente = vigentes[el.nodeId];
  const hayNueva = hayVersionNueva(el, vigente);
  const [completa, setCompleta] = useState(false);
  if (vigente?.sinAcceso) return null;
  const conImagen = conLamina(el.ext);
  return (
    <>
      <MenuVersiones el={el} vigente={vigente} hayNueva={hayNueva} actualizar={actualizar} />
      <Hojas el={el} actualizar={actualizar} extraer={extraer} />
      <button type="button" style={BOTON} title="Abrir aquí" onClick={() => abrir(el)}>
        {ICONOS.abrir}
        Abrir
      </button>
      {conImagen && <MenuMostrarComo el={el} actualizar={actualizar} />}
      {conImagen && (
        <button type="button" aria-label="Pantalla completa" title="Pantalla completa" style={ICONO} onClick={() => setCompleta(true)}>{ICONOS.completa}</button>
      )}
      {completa && <PantallaCompleta el={el} onCerrar={() => setCompleta(false)} />}
    </>
  );
}
