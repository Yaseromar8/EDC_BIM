// Iconos de trazo fino del lienzo compartido (Docs y View). Línea, sin relleno; `grosor` 1 en las barras
// flotantes (como Forma Board) y 1,5 en la cabecera.
import React from 'react';

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
  // Barra contextual de la selección (como la de ACC): bloquear, alinear, más.
  candado: <><rect x="5" y="11" width="14" height="9.5" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  candadoAbierto: <><rect x="5" y="11" width="14" height="9.5" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.6-1.8" /></>,
  alinearIzquierda: <><path d="M4 6h16M4 12h10M4 18h14" /></>,
  alinearCentro: <><path d="M4 6h16M7 12h10M5 18h14" /></>,
  alinearDerecha: <><path d="M4 6h16M10 12h10M6 18h14" /></>,
  verticalArriba: <><path d="M5 4h14M12 20V8.5" /><path d="M8.5 12 12 8.5l3.5 3.5" /></>,
  verticalCentro: <><path d="M5 12h14M12 3v5.5M12 21v-5.5" /><path d="M9.5 6 12 8.5 14.5 6M9.5 18 12 15.5l2.5 2.5" /></>,
  verticalAbajo: <><path d="M5 20h14M12 4v11.5" /><path d="M8.5 12 12 15.5l3.5-3.5" /></>,
  puntos: <><circle cx="12" cy="5.5" r="0.9" /><circle cx="12" cy="12" r="0.9" /><circle cx="12" cy="18.5" r="0.9" /></>,
  buscar: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>,
  documento: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M10 13h6M10 17h4" /></>,
  derecha: <><path d="M9 6l6 6-6 6" /></>,
};

export function Icono({ nombre, tam = 15, grosor = 1.5 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={grosor}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{TRAZOS[nombre]}</svg>
  );
}
