/**
 * useColumnResize.js — Hook de redimensionamiento de columnas y sidebars
 * Refactorización Fase 1: Capa de Datos
 * Extraído de App.jsx líneas 1161-1219
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  ANCHOS_POR_DEFECTO, leerAnchos, guardarAnchos, limitarAncho,
} from '../utils/anchosColumnas';

export const PASO_TECLADO = 16;
export const PASO_TECLADO_GRANDE = 64;

export function useColumnResize() {
  // Inicializador PEREZOSO: el almacen se lee una vez al montar, no en cada
  // pintada.
  const [columnWidths, setColumnWidths] = useState(() => leerAnchos());
  const guardadoDiferido = useRef(null);

  const totalTableWidth = Object.values(columnWidths).reduce((a, b) => a + b, 0);

  // El teclado ajusta de golpe en golpe, y mantener la flecha pulsada repite.
  // Guardar en cada repeticion serian decenas de escrituras sincronas: se
  // espera a que la mano pare.
  const guardarPronto = useCallback((anchos) => {
    clearTimeout(guardadoDiferido.current);
    guardadoDiferido.current = setTimeout(() => guardarAnchos(anchos), 300);
  }, []);

  useEffect(() => () => clearTimeout(guardadoDiferido.current), []);

  /**
   * Arrastre del tirador. Usa PUNTEROS, no raton: el mismo camino de codigo
   * sirve para raton, dedo y lapiz. Antes era `onMouseDown` y en tableta la
   * tabla sencillamente no se podia ajustar.
   */
  const startResizing = useCallback((e, column) => {
    e.preventDefault();

    // El dedo recibe captura implicita, pero el raton no: sin esto, soltar
    // fuera de la ventana dejaba el arrastre pegado.
    const tirador = e.currentTarget;
    if (e.pointerId != null && tirador?.setPointerCapture) {
      try { tirador.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
    }

    const inicioX = e.pageX;
    const anchoInicial = columnWidths[column];
    let anchoFinal = anchoInicial;

    const alMover = (mov) => {
      anchoFinal = limitarAncho(anchoInicial + (mov.pageX - inicioX)) ?? anchoInicial;
      setColumnWidths(prev => ({ ...prev, [column]: anchoFinal }));
    };
    const alSoltar = () => {
      document.removeEventListener('pointermove', alMover);
      document.removeEventListener('pointerup', alSoltar);
      document.removeEventListener('pointercancel', alSoltar);
      // Se guarda al SOLTAR, no en cada pixel. Un arrastre dispara cientos de
      // movimientos y `localStorage` es sincrono: escribir en cada uno
      // convierte un arrastre suave en un tiron.
      guardarAnchos({ ...columnWidths, [column]: anchoFinal });
    };

    document.addEventListener('pointermove', alMover);
    document.addEventListener('pointerup', alSoltar);
    // `pointercancel` lo dispara el navegador cuando se queda el gesto (un
    // desplazamiento en tactil, por ejemplo). Sin escucharlo, el arrastre no
    // terminaba nunca y la columna seguia el dedo por toda la pantalla.
    document.addEventListener('pointercancel', alSoltar);
  }, [columnWidths]);

  /** Ajuste con TECLADO. `delta` en pixeles; `null` devuelve al ancho de fabrica. */
  const ajustarAncho = useCallback((column, delta) => {
    setColumnWidths(prev => {
      const destino = delta === null
        ? ANCHOS_POR_DEFECTO[column]
        : limitarAncho((prev[column] ?? ANCHOS_POR_DEFECTO[column]) + delta);
      if (destino === null || destino === prev[column]) return prev;
      const siguiente = { ...prev, [column]: destino };
      guardarPronto(siguiente);
      return siguiente;
    });
  }, [guardarPronto]);

  return { columnWidths, setColumnWidths, totalTableWidth, startResizing, ajustarAncho };
}

// El ancho del árbol: entre 200 px y la mitad de la ventana (tope 600), y se recuerda
// en este navegador. Si el almacén falla (ventana privada), vale el de siempre.
const ARBOL_MIN = 200;
const CLAVE_ANCHO_ARBOL = 'alephia.docs.anchoArbol';
const arbolMax = () => Math.max(ARBOL_MIN, Math.min(600, Math.round((typeof window !== 'undefined' ? window.innerWidth : 1200) * 0.5)));
const limitarArbol = (w) => Math.round(Math.max(ARBOL_MIN, Math.min(arbolMax(), w)));
function leerAnchoArbol(porDefecto) {
  try {
    const v = Number(window.localStorage.getItem(CLAVE_ANCHO_ARBOL));
    return Number.isFinite(v) && v > 0 ? limitarArbol(v) : porDefecto;
  } catch { return porDefecto; }
}
function guardarAnchoArbol(w) {
  try { window.localStorage.setItem(CLAVE_ANCHO_ARBOL, String(w)); } catch { /* sin almacén: no se recuerda */ }
}

export function useSidebarResize(initialGlobal = 240, initialTree = 300) {
  const [globalSidebarWidth, setGlobalSidebarWidth] = useState(initialGlobal);
  const [treeSidebarWidth, setTreeSidebarWidth] = useState(() => leerAnchoArbol(initialTree));
  const isResizingGlobal = useRef(false);
  const isResizingTree = useRef(false);

  const startGlobalResize = () => {
    isResizingGlobal.current = true;
    const handleGlobalResize = (e) => {
      if (!isResizingGlobal.current) return;
      setGlobalSidebarWidth(Math.max(160, Math.min(400, e.clientX)));
    };
    const stopGlobalResize = () => {
      isResizingGlobal.current = false;
      document.removeEventListener('mousemove', handleGlobalResize);
      document.removeEventListener('mouseup', stopGlobalResize);
      document.body.style.cursor = 'default';
    };
    document.addEventListener('mousemove', handleGlobalResize);
    document.addEventListener('mouseup', stopGlobalResize);
    document.body.style.cursor = 'col-resize';
  };

  // EL DIVISOR DEL ÁRBOL SIGUE AL RATÓN DESDE DONDE SE AGARRA (16-oct-2026).
  // Antes el ancho era `clientX - globalSidebarWidth`: suponía que el árbol empezaba
  // 240 px a la derecha del borde de la ventana, y empieza en 0. Al agarrarlo saltaba
  // de 300 a 200 px y luego iba 240 px por detrás del ratón (medido en el banco: ratón
  // en x=500 → panel de 260 px). Ahora se mide el DESPLAZAMIENTO desde el agarre, con
  // captura del puntero: no se pierde al pasar por encima de un PDF o un iframe, no
  // selecciona texto al arrastrar, y funciona con el dedo en una tablet.
  const startTreeResize = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const asa = e.currentTarget;
    const x0 = e.clientX;
    const ancho0 = treeSidebarWidth;
    let ultimo = ancho0;
    isResizingTree.current = true;
    try { asa.setPointerCapture(e.pointerId); } catch { /* sin captura, sigue por document */ }
    const mover = (ev) => {
      if (!isResizingTree.current) return;
      ultimo = limitarArbol(ancho0 + (ev.clientX - x0));
      setTreeSidebarWidth(ultimo);
    };
    const soltar = () => {
      isResizingTree.current = false;
      asa.removeEventListener('pointermove', mover);
      asa.removeEventListener('pointerup', soltar);
      asa.removeEventListener('pointercancel', soltar);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      guardarAnchoArbol(ultimo);
    };
    asa.addEventListener('pointermove', mover);
    asa.addEventListener('pointerup', soltar);
    asa.addEventListener('pointercancel', soltar);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Teclado (el divisor es un separador accesible): flechas 16 px, con Mayús 64 px;
  // Inicio/Fin, al mínimo y al máximo.
  const teclaTree = (e) => {
    const paso = e.shiftKey ? PASO_TECLADO_GRANDE : PASO_TECLADO;
    const destino = { ArrowLeft: treeSidebarWidth - paso, ArrowRight: treeSidebarWidth + paso,
                      Home: ARBOL_MIN, End: arbolMax() }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    const w = limitarArbol(destino);
    setTreeSidebarWidth(w);
    guardarAnchoArbol(w);
  };

  // Doble clic: vuelve al ancho de siempre.
  const resetTree = () => { setTreeSidebarWidth(initialTree); guardarAnchoArbol(initialTree); };

  return {
    globalSidebarWidth, setGlobalSidebarWidth,
    treeSidebarWidth, setTreeSidebarWidth,
    startGlobalResize,
    startTreeResize, teclaTree, resetTree,
    arbolMin: ARBOL_MIN, arbolMax: arbolMax(),
  };
}

export function useVersionPanelResize(initialWidth = 450) {
  const [versionPanelWidth, setVersionPanelWidth] = useState(initialWidth);
  const isResizingVersion = useRef(false);

  const startVersionResize = () => {
    isResizingVersion.current = true;
    const handleVersionResize = (e) => {
      if (!isResizingVersion.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setVersionPanelWidth(Math.max(400, Math.min(window.innerWidth * 0.95, newWidth)));
    };
    const stopVersionResize = () => {
      isResizingVersion.current = false;
      document.removeEventListener('mousemove', handleVersionResize);
      document.removeEventListener('mouseup', stopVersionResize);
      document.body.style.cursor = 'default';
    };
    document.addEventListener('mousemove', handleVersionResize);
    document.addEventListener('mouseup', stopVersionResize);
    document.body.style.cursor = 'col-resize';
  };

  return { versionPanelWidth, setVersionPanelWidth, startVersionResize };
}
