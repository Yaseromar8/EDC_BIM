/**
 * useColumnResize.js — Hook de redimensionamiento de columnas y sidebars
 * Refactorización Fase 1: Capa de Datos
 * Extraído de App.jsx líneas 1161-1219
 */
import { useState, useRef, useCallback } from 'react';

export function useColumnResize() {
  const [columnWidths, setColumnWidths] = useState({
    checkbox: 40, name: 400, description: 150, version: 80,
    indicators: 150, markup: 100, issues: 80, size: 100,
    updated: 180, user: 150, status: 120, action: 60
  });

  const totalTableWidth = Object.values(columnWidths).reduce((a, b) => a + b, 0);

  const startResizing = useCallback((e, column) => {
    e.preventDefault();
    const startX = e.pageX;
    const startWidth = columnWidths[column];
    const onMouseMove = (moveEvent) => {
      const currentWidth = startWidth + (moveEvent.pageX - startX);
      setColumnWidths(prev => ({ ...prev, [column]: Math.max(currentWidth, 40) }));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [columnWidths]);

  return { columnWidths, setColumnWidths, totalTableWidth, startResizing };
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
