// ICON BUTTON — un botón sin texto TIENE que tener nombre.
//
// `etiqueta` es obligatoria: va a `aria-label` (lo que anuncia un lector de
// pantalla) y a `title` (el tooltip, que pinta design/ui/tooltips.js). Sin
// ella revienta en desarrollo, que es donde debe reventar: un botón «×» sin
// nombre es justo el defecto que esta primitiva hace imposible.
import React from 'react';
import './IconButton.css';

export default function IconButton({
  etiqueta,               // OBLIGATORIA
  tamano = 'md',          // sm · md
  peligro = false,        // hover en rojo: quitar, borrar
  type = 'button',
  className = '',
  children,
  ...resto
}) {
  if (!etiqueta && import.meta.env?.DEV) {
    throw new Error('IconButton necesita `etiqueta`: un botón de solo icono sin nombre no se puede anunciar.');
  }
  return (
    <button
      {...resto}
      type={type}
      aria-label={etiqueta}
      title={resto.title ?? etiqueta}
      className={`a-icon-btn a-icon-btn--${tamano}${peligro ? ' a-icon-btn--peligro' : ''} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
