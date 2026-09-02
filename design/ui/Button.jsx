// BUTTON — rango, no tarea.
//
// Hoy hay 17 clases de botón y solo 5 expresan rango; las otras 12 nombran una
// TAREA (btn-copy-link, btn-create, btn-outline-wide...). Por eso cada función
// nueva inventa su botón y ninguna pantalla dice cuál es su acción principal.
//
// Aquí solo hay rango. Si alguien necesita «el botón de copiar enlace», usa
// `secondary` y le pone su texto: el rango es del sistema, la tarea del sitio.
//
// Esta primitiva NO migra los 847 botones existentes — eso no es UX-08.
import React from 'react';
import './Button.css';

export default function Button({
  rango = 'secondary',   // primary · secondary · danger · ghost
  tamano = 'md',         // sm · md · lg
  cargando = false,
  iconoIzq = null,
  type = 'button',       // NUNCA 'submit' por defecto: un submit accidental envía
  className = '',
  children,
  ...resto
}) {
  return (
    <button
      // Spread delante: `type` y `disabled` son garantías de la primitiva y no
      // deben poder pisarse desde fuera. Un botón que acaba siendo `submit`
      // por accidente envía un formulario que nadie quería enviar.
      {...resto}
      type={type}
      className={`a-btn a-btn--${rango} a-btn--${tamano}${cargando ? ' a-btn--cargando' : ''} ${className} ${resto.className || ''}`}
      aria-busy={cargando || undefined}
      disabled={resto.disabled || cargando}
    >
      {cargando && <span className="a-btn__espera" aria-hidden="true" />}
      {!cargando && iconoIzq}
      <span className="a-btn__texto">{children}</span>
    </button>
  );
}
