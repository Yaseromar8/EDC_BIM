// PANEL — superficie elevada.
//
// Es quien CONSUME LA ESCALA DE SOMBRA, y por eso el contrato le asignó
// `--pdf-shadow` (v2.1). Ojo con lo que eso significa en esta pasada: aquí se
// crea el destino, no se migra el consumidor. `--pdf-shadow` sigue intacto en
// el lector con su literal; desaparecerá cuando el lector adopte Panel.
//
// En tema oscuro una sombra sobre #0B0E12 no se ve: los mismos tokens
// --a-shadow-* resuelven allí a un borde luminoso. El componente no lo sabe
// ni debe saberlo.
import React from 'react';
import './Panel.css';

export default function Panel({
  elevacion = 'sm',      // none · sm · md · lg
  densidad = 'normal',   // compacta · normal
  as: Etiqueta = 'div',
  className = '',
  children,
  ...resto               // role, aria-*: los pone quien compone (p. ej. Modal)
}) {
  return (
    <Etiqueta
      // El spread delante por la misma razón que en Field: lo que la primitiva
      // garantiza no debe poder pisarse desde fuera. Aquí `role` y `aria-*` SÍ
      // vienen de quien compone (Modal), así que van en `resto` a propósito;
      // lo que no se pisa es la clase base.
      {...resto}
      className={`a-panel a-panel--e-${elevacion} a-panel--d-${densidad} ${className} ${resto.className || ''}`}
    >
      {children}
    </Etiqueta>
  );
}
