/**
 * CapaEncima — pone por encima del tablero (que vive en un diálogo a z-index 9000) una ventana de otro módulo que se
 * dibuja con `position: fixed` y su propio z-index (el detalle y el alta de «Issues y punch», a 1000). La capa crea su
 * propio contexto de apilamiento por encima, y es un diálogo con el foco dentro: las teclas son de la ventana, no del
 * tablero (Supr no borra la tarjeta de debajo).
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function CapaEncima({ etiqueta, children }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  return createPortal(
    <div ref={ref} role="dialog" aria-modal="true" aria-label={etiqueta} tabIndex={-1} onPointerDown={e => e.stopPropagation()}
      style={{ position: 'fixed', top: 0, left: 0, width: 0, height: 0, zIndex: 10050, outline: 'none' }}>
      {children}
    </div>,
    document.body,
  );
}
