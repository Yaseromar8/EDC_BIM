// HiloComentario — el hilo de un comentario del tablero (docs/visor/64), a la derecha, como el de Forma Board: los
// mensajes con quién y cuándo, «Responder», Resolver / Reabrir y, para quien lo abrió o un administrador, «Eliminar
// comentario». Intro envía (Mayús + Intro, otra línea); Escape cierra. Un comentario nuevo que se cierra sin escribir
// nada desaparece (lo decide quien abre el hilo).
import React, { useEffect, useRef, useState } from 'react';
import { colorDe, iniciales, cuando, puedeBorrarHilo, puedeBorrarMensaje, MAX_TEXTO } from './comentarios';

const GRIS = '#72706B', TINTA = '#141413', BORDE = '#E5E3DA', SUAVE = '#f1f0e8';

function Avatar({ id, nombre, tam = 24 }) {
  return (
    <span aria-hidden="true" style={{ width: tam, height: tam, flexShrink: 0, borderRadius: '50%', background: colorDe(id), color: '#fff', fontSize: tam <= 24 ? 10 : 12,
      fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{iniciales(nombre)}</span>
  );
}

const boton = { height: 30, padding: '0 8px', border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: TINTA,
  display: 'inline-flex', alignItems: 'center', gap: 6 };

// `onVolver`: abierto desde la lista de comentarios, «‹» vuelve a ella.
export default function HiloComentario({ comentario: c, yo, isAdmin, soloLectura, onEnviar, onResolver, onBorrarMensaje, onBorrarHilo, onCerrar, onVolver = null }) {
  const [texto, setTexto] = useState('');
  const [menu, setMenu] = useState(false);
  const campo = useRef(null), lista = useRef(null);
  const mensajes = c.mensajes || [];
  const nuevo = !mensajes.length;
  useEffect(() => { if (!soloLectura) campo.current?.focus({ preventScroll: true }); }, [c.id, soloLectura]);
  useEffect(() => { if (lista.current) lista.current.scrollTop = lista.current.scrollHeight; }, [mensajes.length]);
  // Escape también lo cierra con el foco fuera (cayó al body); el de otra ventana encima es de esa ventana.
  const cerrarRef = useRef(onCerrar);
  useEffect(() => { cerrarRef.current = onCerrar; });
  useEffect(() => {
    const tecla = (e) => { const a = document.activeElement; if (e.key === 'Escape' && (!a || a === document.body)) cerrarRef.current(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  const enviar = () => {
    const t = texto.trim();
    if (!t) return;
    onEnviar(t);
    setTexto('');
  };
  const alTeclear = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); if (menu) setMenu(false); else onCerrar(); }
  };

  return (
    <div role="dialog" aria-label="Comentario" onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()} onKeyDown={alTeclear}
      style={{ position: 'absolute', right: 12, top: 12, width: 340, maxHeight: 'calc(100% - 96px)', zIndex: 8, display: 'flex', flexDirection: 'column',
        background: '#fff', borderRadius: 8, boxShadow: '0 0 16px rgba(0,0,0,0.12)', fontFamily: 'var(--a-font-sans)', color: TINTA }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 8px 8px 14px', borderBottom: `1px solid ${BORDE}` }}>
        {onVolver && (
          <button type="button" aria-label="Volver a los comentarios" title="Todos los comentarios" onClick={onVolver} style={{ ...boton, width: 30, padding: 0, justifyContent: 'center', marginLeft: -8 }}
            onMouseEnter={e => { e.currentTarget.style.background = SUAVE; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.5 6 8.5 12l6 6" /></svg>
          </button>
        )}
        <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{nuevo ? 'Nuevo comentario' : 'Comentario'}</span>
        {c.resuelto && <span style={{ fontSize: 12, color: GRIS, marginRight: 4 }}>Resuelto</span>}
        {!nuevo && !soloLectura && (
          <button type="button" style={boton} onClick={() => onResolver(!c.resuelto)} title={c.resuelto ? 'Reabrir' : 'Resolver'}
            onMouseEnter={e => { e.currentTarget.style.background = SUAVE; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {c.resuelto ? <path d="M4.6 7A8 8 0 1 1 4 12M4.5 2.5V7H9" /> : <path d="m5 12.5 4.5 4.5L19 7.5" />}</svg>
            {c.resuelto ? 'Reabrir' : 'Resolver'}
          </button>
        )}
        {!nuevo && !soloLectura && puedeBorrarHilo(c, yo, isAdmin) && (
          <div style={{ position: 'relative' }}>
            <button type="button" aria-label="Más opciones del comentario" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}
              style={{ ...boton, width: 30, padding: 0, justifyContent: 'center', background: menu ? SUAVE : 'transparent' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
            </button>
            {menu && (
              <div role="menu" style={{ position: 'absolute', right: 0, top: 34, zIndex: 2, minWidth: 200, padding: '6px 0', background: '#fff', borderRadius: 8, boxShadow: '0 0 16px rgba(0,0,0,0.12)' }}>
                <button type="button" role="menuitem" onClick={() => { setMenu(false); if (window.confirm('¿Eliminar este comentario con todas sus respuestas?')) onBorrarHilo(); }}
                  style={{ display: 'block', width: '100%', padding: '8px 14px', border: 'none', background: 'none', textAlign: 'left', fontSize: 14, fontFamily: 'inherit', color: '#b93535', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = SUAVE; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>Eliminar comentario</button>
              </div>
            )}
          </div>
        )}
        <button type="button" aria-label="Cerrar el comentario" onClick={onCerrar} style={{ ...boton, width: 30, padding: 0, justifyContent: 'center' }}
          onMouseEnter={e => { e.currentTarget.style.background = SUAVE; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      {!nuevo && (
        <div ref={lista} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 0' }}>
          {mensajes.map((m, i) => (
            <div key={m.id} data-mensaje={m.id} style={{ display: 'flex', gap: 10, padding: '8px 14px' }}>
              <Avatar id={m.autorId} nombre={m.autor} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.autor}</span>
                  <span style={{ fontSize: 12, color: GRIS, whiteSpace: 'nowrap' }}>{cuando(m.fecha)}</span>
                  <span style={{ flex: 1 }} />
                  {i > 0 && !soloLectura && puedeBorrarMensaje(c, m, yo) && (
                    <button type="button" aria-label="Eliminar mi respuesta" title="Eliminar" onClick={() => onBorrarMensaje(m.id)}
                      style={{ border: 'none', background: 'none', padding: 2, cursor: 'pointer', color: GRIS, display: 'flex' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" /></svg>
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 2 }}>{m.texto}</div>
              </div>
            </div>
          ))}
          {c.resuelto && c.resueltoPor && (
            <div style={{ padding: '4px 14px 8px 48px', fontSize: 12, color: GRIS }}>Resuelto por {c.resueltoPor}{c.resueltoEn ? `, ${cuando(c.resueltoEn)}` : ''}</div>
          )}
        </div>
      )}
      {!soloLectura && (
        <div style={{ padding: 10, borderTop: nuevo ? 'none' : `1px solid ${BORDE}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea ref={campo} value={texto} maxLength={MAX_TEXTO} rows={nuevo ? 3 : 2} aria-label={nuevo ? 'Escribe un comentario' : 'Responder'}
            placeholder={nuevo ? 'Escribe un comentario…' : 'Responder…'} onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 44, padding: '8px 10px', border: `1px solid ${BORDE}`, borderRadius: 6,
              fontSize: 14, lineHeight: 1.4, fontFamily: 'inherit', color: TINTA, outline: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, fontSize: 12, color: GRIS }}>Intro envía · Mayús + Intro, otra línea</span>
            <button type="button" className="barra-btn barra-btn--primario" disabled={!texto.trim()} onClick={enviar}>{nuevo ? 'Comentar' : 'Responder'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
