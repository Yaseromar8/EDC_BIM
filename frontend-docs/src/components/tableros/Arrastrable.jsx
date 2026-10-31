/**
 * Arrastrable — una tarjeta de un panel del tablero que SE JALA al lienzo (documentos, incidencias), como en ACC: una
 * copia translúcida sigue al ratón y, al soltar fuera del panel, `onSoltar(punto)` con el punto de la pantalla.
 * Un clic sin arrastrar (o Intro) llama `onSoltar(null)`: al centro de la vista. Soltar dentro del panel no hace nada.
 *
 * `children(fantasma)` dibuja la tarjeta (la copia translúcida se dibuja igual, con `fantasma = true`).
 */
import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const UMBRAL = 4;   // px antes de que un clic pase a ser un arrastre (como el lienzo)

export default function Arrastrable({ etiqueta, titulo, onSoltar, dentroDelPanel, estilo, children }) {
  const [arrastre, setArrastre] = useState(null);          // { x, y, dx, dy, w }
  const inicio = useRef(null);

  const abajo = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    inicio.current = { x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, movido: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const mover = (e) => {
    const i = inicio.current;
    if (!i) return;
    if (!i.movido && Math.hypot(e.clientX - i.x, e.clientY - i.y) < UMBRAL) return;
    i.movido = true;
    setArrastre({ x: e.clientX, y: e.clientY, dx: i.dx, dy: i.dy, w: i.w });
  };
  const arriba = (e) => {
    const i = inicio.current;
    inicio.current = null;
    setArrastre(null);
    if (!i) return;
    if (!i.movido) { onSoltar(null); return; }                       // clic: al centro de la vista
    if (dentroDelPanel(e.clientX, e.clientY)) return;               // soltado en el panel: nada
    onSoltar({ clientX: e.clientX, clientY: e.clientY });
  };
  const cancelar = () => { inicio.current = null; setArrastre(null); };

  return (
    <>
      <div role="button" tabIndex={0} aria-label={etiqueta} title={titulo}
        onPointerDown={abajo} onPointerMove={mover} onPointerUp={arriba} onPointerCancel={cancelar}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSoltar(null); } }}
        style={{ ...estilo, cursor: arrastre ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none',
          boxShadow: arrastre ? '0 2px 10px rgba(20,20,19,0.12)' : 'none' }}
        onMouseEnter={e => { if (!arrastre) e.currentTarget.style.boxShadow = '0 1px 6px rgba(20,20,19,0.10)'; }}
        onMouseLeave={e => { if (!arrastre) e.currentTarget.style.boxShadow = 'none'; }}>
        {children(false)}
      </div>
      {arrastre && createPortal(
        <div aria-hidden="true" data-fantasma-documento=""
          style={{ ...estilo, position: 'fixed', zIndex: 10200, left: arrastre.x - arrastre.dx, top: arrastre.y - arrastre.dy, width: arrastre.w,
            opacity: 0.72, pointerEvents: 'none', boxShadow: '0 6px 20px rgba(20,20,19,0.18)' }}>
          {children(true)}
        </div>,
        document.body,
      )}
    </>
  );
}
