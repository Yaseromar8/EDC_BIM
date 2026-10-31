// Herramienta — una acción de la cabecera del Tablero: icono y texto, sin borde ni caja; solo un fondo
// suave al pasar el ratón (como las barras de herramientas de ACC). Si el panel es estrecho
// (`data-compacta="1"` en el panel, que el borde cambia en vivo al arrastrar) queda solo el icono y el
// texto va en la ayuda. `principal` es la única acción en relleno oscuro de la barra (paleta D-24).
import React, { useState } from 'react';
import { C, FUENTE } from './tema';

const TRAZOS = {
  seccion: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /></>,
  parametros: <><path d="M9 6h12M9 12h12M9 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
  auditoria: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></>,
  ordenar: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  limpiar: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
  nuevo: <><path d="M12 5v14M5 12h14" /></>,
  cerrar: <><path d="M6 6l12 12M18 6L6 18" /></>,
  ampliar: <><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></>,
  reducir: <><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /></>,
  // Barras flotantes del lienzo (docs/visor/54): trazo fino, como los de Forma Board.
  puntero: <><path d="M5 3.5l13 6.2-5.6 1.6-2.4 5.4z" /><path d="M12.4 11.3l5.1 5.1" /></>,
  mano: <><path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11" /><path d="M11 10.5V5a1.5 1.5 0 0 1 3 0v5.5" /><path d="M14 10.5V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.6-2.2L3.6 15a1.5 1.5 0 0 1 2.3-1.9L8 15.2" /></>,
  texto: <><path d="M5 5h14M12 5v14M9.5 19h5" /></>,
  marco: <><path d="M7 3v18M17 3v18M3 7h18M3 17h18" /></>,
  grafico: <><path d="M4 20h16" /><rect x="6" y="11" width="3" height="7" rx="0.5" /><rect x="10.5" y="6" width="3" height="12" rx="0.5" /><rect x="15" y="9" width="3" height="9" rx="0.5" /></>,
  deshacer: <><path d="M9 7H4.5V2.5" /><path d="M4.6 7A8 8 0 1 1 6 17.5" /></>,
  rehacer: <><path d="M15 7h4.5V2.5" /><path d="M19.4 7A8 8 0 1 0 18 17.5" /></>,
  menos: <><path d="M5 12h14" /></>,
  mas: <><path d="M12 5v14M5 12h14" /></>,
  abajo: <><path d="M6 9l6 6 6-6" /></>,
};

export function Icono({ nombre, tam = 15, grosor = 1.5 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={grosor}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{TRAZOS[nombre]}</svg>
  );
}

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
