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

export function useSidebarResize(initialGlobal = 240, initialTree = 300) {
  const [globalSidebarWidth, setGlobalSidebarWidth] = useState(initialGlobal);
  const [treeSidebarWidth, setTreeSidebarWidth] = useState(initialTree);
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

  const startTreeResize = () => {
    isResizingTree.current = true;
    const handleTreeResize = (e) => {
      if (!isResizingTree.current) return;
      setTreeSidebarWidth(Math.max(200, Math.min(600, e.clientX - globalSidebarWidth)));
    };
    const stopTreeResize = () => {
      isResizingTree.current = false;
      document.removeEventListener('mousemove', handleTreeResize);
      document.removeEventListener('mouseup', stopTreeResize);
      document.body.style.cursor = 'default';
    };
    document.addEventListener('mousemove', handleTreeResize);
    document.addEventListener('mouseup', stopTreeResize);
    document.body.style.cursor = 'col-resize';
  };

  return {
    globalSidebarWidth, setGlobalSidebarWidth,
    treeSidebarWidth, setTreeSidebarWidth,
    startGlobalResize,
    startTreeResize,
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
