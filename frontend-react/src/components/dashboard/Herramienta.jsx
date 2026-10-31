// Herramienta — una acción de la cabecera del Tablero: icono y texto, sin borde ni caja; solo un fondo
// suave al pasar el ratón (como las barras de herramientas de ACC). Si el panel es estrecho
// (`data-compacta="1"` en el panel, que el borde cambia en vivo al arrastrar) queda solo el icono y el
// texto va en la ayuda. `principal` es la única acción en relleno oscuro de la barra (paleta D-24).
import React, { useState } from 'react';
import { C, FUENTE } from './tema';
import { Icono } from '../../../../design/lienzo/Icono';

export { Icono };

export function Separador() {
  return <span aria-hidden="true" style={{ width: 1, height: 18, background: C.lightGray, margin: '0 4px', flexShrink: 0 }} />;
}

// El CSS que esconde el texto en modo compacto (una vez, junto al panel).
// "1": las herramientas, solo icono; "2" (muy estrecho): también «Nuevo gráfico» y el estado de guardado.
export const CSS_HERRAMIENTAS = `[data-compacta="1"] .tablero-herramienta:not(.principal) .tablero-herramienta-texto,
[data-compacta="2"] .tablero-herramienta-texto, [data-compacta="2"] .tablero-guardado { display: none; }
[data-compacta="1"] .tablero-herramienta:not(.principal), [data-compacta="2"] .tablero-herramienta { padding: 0 7px !important; }`;

export default function Herramienta({ icono, texto, ayuda, onClick, apagada = false, principal = false }) {
  const [encima, setEncima] = useState(false);
  const fondo = principal ? (encima && !apagada ? '#1f1e1d' : C.dark) : encima && !apagada ? C.light50 : 'transparent';
  return (
    <button onClick={onClick} disabled={apagada} aria-label={texto} className={`tablero-herramienta${principal ? ' principal' : ''}`}
      title={[texto, ayuda].filter(Boolean).join(' — ')}
      onMouseEnter={() => setEncima(true)} onMouseLeave={() => setEncima(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 9px',
        border: 'none', borderRadius: 6, background: fondo, flexShrink: 0, whiteSpace: 'nowrap',
        color: principal ? C.light : apagada ? C.midGray : C.gris700,
        fontFamily: FUENTE, fontSize: 12.5, fontWeight: principal ? 600 : 500,
        cursor: apagada ? 'default' : 'pointer', opacity: principal && apagada ? 0.45 : 1,
        transition: 'background-color 120ms ease',
      }}>
      <Icono nombre={icono} />
      <span className="tablero-herramienta-texto">{texto}</span>
    </button>
  );
}
