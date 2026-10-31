// Presentacion — presentar el tablero por sus secciones (docs/visor/65), como «Presentar» de Forma Board con sus marcos:
// una sección tras otra, a pantalla completa y encajada, en orden de lectura. ◀ ▶ (o ← →, Re Pág / Av Pág, espacio)
// para pasar; Inicio y Fin; Escape sale. Es de consulta: las teclas no llegan al tablero de debajo. Doble clic en un
// documento o una incidencia los abre, como en el tablero.
import React, { useEffect, useRef, useState } from 'react';
import VistaLienzo from '../../../../design/lienzo/VistaLienzo';

const FONDO = '#faf9f5', TINTA = '#141413', GRIS = '#72706B';

export default function Presentacion({ secciones, contenido, tipos, inicio = 0, onCerrar }) {
  const [i, setI] = useState(Math.min(Math.max(0, inicio), Math.max(0, secciones.length - 1)));
  const capa = useRef(null), cerrarRef = useRef(onCerrar), total = useRef(secciones.length);
  useEffect(() => { cerrarRef.current = onCerrar; total.current = secciones.length; });
  useEffect(() => {
    capa.current?.focus({ preventScroll: true });
    capa.current?.requestFullscreen?.().catch(() => {});
    const alSalirDePantallaCompleta = () => { if (!document.fullscreenElement) cerrarRef.current(); };
    document.addEventListener('fullscreenchange', alSalirDePantallaCompleta);
    return () => {
      document.removeEventListener('fullscreenchange', alSalirDePantallaCompleta);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);
  // Las teclas son de la presentación (en captura, antes que el tablero); las de una ventana encima, de esa ventana.
  useEffect(() => {
    const tecla = (e) => {
      const a = document.activeElement;
      if (a && a !== document.body && !capa.current?.contains(a)) return;
      const n = total.current;
      const mover = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1 }[e.key];
      if (mover) setI(x => Math.min(n - 1, Math.max(0, x + mover)));
      else if (e.key === 'Home') setI(0);
      else if (e.key === 'End') setI(n - 1);
      else if (e.key === 'Escape') cerrarRef.current();
      else return;
      e.preventDefault(); e.stopPropagation();
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, []);
  const s = secciones[i];
  const boton = (texto, accion, apagado, etiqueta) => (
    <button type="button" aria-label={etiqueta} disabled={apagado} onClick={accion}
      style={{ width: 36, height: 36, border: 'none', borderRadius: 6, background: 'transparent', cursor: apagado ? 'default' : 'pointer', color: apagado ? '#b0aea5' : TINTA,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}
      onMouseEnter={e => { if (!apagado) e.currentTarget.style.background = '#f1f0e8'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>{texto}</button>
  );
  return (
    <div ref={capa} tabIndex={-1} role="dialog" aria-label="Presentación" data-presentacion=""
      style={{ position: 'fixed', inset: 0, zIndex: 10040, background: FONDO, outline: 'none', fontFamily: 'var(--a-font-sans)' }}>
      {s && <VistaLienzo key={s.id} contenido={contenido} ids={[s.id]} tipos={tipos} fondo={FONDO} margen={56} />}
      <div style={{ position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', height: 48,
        background: '#fff', borderRadius: 8, boxShadow: '0 0 16px rgba(0,0,0,0.12)' }}>
        {boton(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 6 8.5 12l6 6" /></svg>,
          () => setI(x => Math.max(0, x - 1)), i === 0, 'Sección anterior')}
        <span aria-live="polite" style={{ minWidth: 200, maxWidth: 420, textAlign: 'center', fontSize: 14, color: TINTA, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <b style={{ fontWeight: 600 }}>{s?.titulo || 'Sección'}</b><span style={{ color: GRIS }}> · {i + 1} de {secciones.length}</span>
        </span>
        {boton(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9.5 6 6 6-6 6" /></svg>,
          () => setI(x => Math.min(secciones.length - 1, x + 1)), i >= secciones.length - 1, 'Sección siguiente')}
        <span style={{ width: 1, height: 24, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
        {boton(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>,
          onCerrar, false, 'Salir de la presentación (Esc)')}
      </div>
    </div>
  );
}
