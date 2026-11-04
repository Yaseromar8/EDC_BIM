/**
 * LA MARCA DE ENLAZADO de una fila de Archivos (5-nov-2026, docs/archivos/27): el icono «enlace» del juego oficial,
 * en azul 30D, con su ayuda. En la fila de un enlace dice de dónde viene el documento; en el original, en cuántas
 * carpetas más está enlazado (con la cifra al lado).
 *
 * Con `onClick` es un botón: en el original abre la lista de carpetas donde está enlazado, para ir a cada una o
 * quitar el enlace desde ahí (el dueño: «si por error marqué una carpeta que no recuerdo cuál es»). No abre el
 * documento ni elige la fila.
 */
import React from 'react';
import IconoModulo from './IconoModulo';

const ESTILO = { display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0, color: '#507294', fontSize: 12 };

export default function MarcaDeEnlace({ texto, cifra = null, onClick = null }) {
  const dentro = (
    <>
      <IconoModulo nombre="enlace" tamano={14} />
      {cifra != null && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{cifra}</span>}
    </>
  );
  if (!onClick) {
    return <span className="marca-de-enlace" role="img" aria-label={texto} data-tip={texto} style={ESTILO}>{dentro}</span>;
  }
  return (
    <button type="button" className="marca-de-enlace" aria-label={texto} data-tip={texto} aria-haspopup="dialog"
      onClick={(e) => { e.stopPropagation(); onClick(e.currentTarget.getBoundingClientRect()); }}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{ ...ESTILO, padding: '1px 3px', border: 0, borderRadius: 4, background: 'none', cursor: 'pointer' }}>
      {dentro}
    </button>
  );
}
