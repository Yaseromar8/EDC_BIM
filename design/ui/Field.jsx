// FIELD — un campo NO PUEDE existir sin etiqueta.
//
// Medido: 345 controles de formulario en el producto y 10 con
// `<label htmlFor>`. No es descuido de una pantalla: es que nada lo impedía.
//
// Aquí la etiqueta es obligatoria y revienta en desarrollo si falta. Esa es la
// diferencia entre un componente y una primitiva: la primitiva hace imposible
// el defecto, no lo desaconseja.
//
// El error se asocia con aria-describedby y se anuncia con role="alert": sin
// eso, un lector de pantalla nunca se entera de por qué no puede continuar.
//
// NO migra los 345 existentes — eso es UX-14 (G12).
import React, { useId } from 'react';
import './Field.css';

export default function Field({
  etiqueta,              // OBLIGATORIA
  ayuda,
  error,
  requerido = false,
  as = 'input',          // input · select · textarea
  className = '',
  children,              // las <option> de un select
  ...resto
}) {
  const id = useId();
  const idAyuda = useId();
  const idError = useId();

  if (!etiqueta) {
    throw new Error(
      'Field: falta `etiqueta`. Un campo sin etiqueta asociada no es usable ' +
      'con lector de pantalla, y al pulsar su texto no enfoca. No hay caso ' +
      'legítimo: si debe ser invisible, usa `etiqueta` y ocúltala con la clase ' +
      'a-solo-lectores.');
  }

  const Control = as;
  const descrito = [ayuda ? idAyuda : null, error ? idError : null]
    .filter(Boolean).join(' ') || undefined;

  return (
    <div className={`a-field${error ? ' a-field--error' : ''} ${className}`}>
      <label className="a-field__etiqueta" htmlFor={id}>
        {etiqueta}
        {requerido && <span className="a-field__req" aria-hidden="true"> *</span>}
      </label>
      <Control
        // EL SPREAD VA PRIMERO, Y NO ES UN DETALLE DE ESTILO.
        //
        // Estaba al final y un `id` pasado desde fuera pisaba el generado: el
        // <label htmlFor> seguía apuntando al id interno y la asociación se
        // rompía en silencio. Lo descubrió el banco al ejecutarlo, no la
        // lectura del código -- que es justamente para lo que existe.
        //
        // Una primitiva cuya garantía se puede desactivar desde fuera no es una
        // garantía. Con el spread delante, id y aria-* SIEMPRE ganan.
        {...resto}
        id={id}
        className={`a-field__control ${resto.className || ''}`}
        aria-describedby={descrito}
        aria-invalid={error ? 'true' : undefined}
        aria-required={requerido || undefined}
      >
        {children}
      </Control>
      {ayuda && <p id={idAyuda} className="a-field__ayuda">{ayuda}</p>}
      {error && <p id={idError} className="a-field__error" role="alert">{error}</p>}
    </div>
  );
}
