// El alfiler de un comentario en el tablero (docs/visor/64): un bocadillo con las iniciales de quien lo abrió, del
// mismo tamaño en pantalla con cualquier zoom, la punta donde se clavó. Resuelto, gris con una marca. Un clic (sin
// arrastrar) abre su hilo; arrastrarlo lo mueve.
import React, { useContext, useRef } from 'react';
import { ComentariosDelTablero, PIN, colorDe, iniciales } from './comentarios';

export default function PinComentario({ elemento: c }) {
  const { abrir, abiertoId } = useContext(ComentariosDelTablero);
  const ini = useRef(null);
  const n = (c.mensajes || []).length;
  const abierto = abiertoId === c.id;
  return (
    <div data-comentario={c.id} title={c.mensajes?.[0]?.texto || 'Comentario'}
      onPointerDown={e => { ini.current = [e.clientX, e.clientY]; }}
      onClick={e => { const p = ini.current; if (!p || Math.hypot(e.clientX - p[0], e.clientY - p[1]) < 4) abrir(c.id); }}
      style={{ position: 'absolute', left: 0, bottom: 0, width: PIN, height: PIN, transform: 'scale(calc(1 / var(--s, 1)))', transformOrigin: '0 100%', cursor: 'pointer' }}>
      <div style={{ width: PIN, height: PIN, boxSizing: 'border-box', borderRadius: '16px 16px 16px 3px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: c.resuelto ? '#b0aea5' : colorDe(c.autorId), color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: 'var(--a-font-sans)',
        border: '2px solid #fff', boxShadow: abierto ? '0 0 0 2px #0D66B4, 0 2px 6px rgba(0,0,0,0.25)' : '0 2px 6px rgba(0,0,0,0.25)' }}>
        {c.resuelto
          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          : iniciales(c.autor)}
      </div>
      {n > 1 && (
        <span style={{ position: 'absolute', top: -6, right: -8, minWidth: 16, height: 16, padding: '0 4px', boxSizing: 'border-box', borderRadius: 8,
          background: '#141413', color: '#fff', fontSize: 10, fontWeight: 600, lineHeight: '16px', textAlign: 'center' }}>{n}</span>
      )}
    </div>
  );
}
