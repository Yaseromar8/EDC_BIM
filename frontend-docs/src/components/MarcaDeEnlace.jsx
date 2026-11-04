/**
 * LA MARCA DE ENLAZADO de una fila de Archivos (5-nov-2026, docs/archivos/27): el icono «enlace» del juego oficial,
 * en azul 30D, con su ayuda. En la fila de un enlace dice de dónde viene el documento; en el original, en cuántas
 * carpetas más está enlazado (con la cifra al lado).
 */
import React from 'react';
import IconoModulo from './IconoModulo';

export default function MarcaDeEnlace({ texto, cifra = null }) {
  return (
    <span className="marca-de-enlace" role="img" aria-label={texto} data-tip={texto}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0, color: '#507294', fontSize: 12 }}>
      <IconoModulo nombre="enlace" tamano={14} />
      {cifra != null && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{cifra}</span>}
    </span>
  );
}
