// pivotUnderPointer.js — El punto que tocas es el centro de giro.
//
// En escritorio ya funcionaba: al presionar el mouse se hace un hitTest y el
// punto del modelo BAJO el cursor pasa a ser el pivote, así orbitas alrededor
// de lo que estás mirando y no del centro del proyecto (estilo Tandem/Fusion).
//
// En tablet no ocurría nada: el visor mueve la cámara con eventos de PUNTERO
// (touch), y el `mousedown` sintético —cuando el navegador llega a emitirlo—
// aparece DESPUÉS de soltar el dedo, cuando el giro ya terminó. Por eso allí
// se seguía orbitando alrededor del centro del modelo.
//
// Aquí se escucha además `touchstart` en captura, antes de que la herramienta
// de órbita procese el gesto:
//   · un dedo  → pivote en el punto tocado (girar alrededor de ese punto).
//   · dos dedos → pivote en el punto medio de la pinza (acercar hacia ahí).
// Si tocas el vacío se conserva el último pivote: sin saltos.

const PICK_TOOLS = /measure|section|markup|pushpin|dimension|pin/i;

/**
 * @param {object} viewer   instancia GuiViewer3D ya inicializada
 * @param {object} [opts]
 * @param {boolean} [opts.respectTools=true]  no robar el toque a Medir/Sección/etc.
 * @returns {() => void} función de limpieza
 */
export function installPivotUnderPointer(viewer, opts = {}) {
  const respectTools = opts.respectTools !== false;
  const canvasEl = viewer?.canvas || viewer?.impl?.canvas;
  if (!canvasEl) return () => {};

  // ¿El dispositivo apunta con el dedo? Sólo entonces cambiamos el
  // comportamiento del zoom, para no tocar nada de la experiencia con mouse.
  const coarsePointer = typeof window !== 'undefined'
    && window.matchMedia?.('(pointer: coarse)')?.matches;

  const blockedByTool = () => {
    if (!respectTools) return false;
    // Herramientas que necesitan el toque para COLOCAR puntos: si les robamos
    // el pickeo, "Medir" acaba seleccionando el elemento en vez de medir.
    const active = viewer.toolController?.getActiveToolName?.() || '';
    return PICK_TOOLS.test(active);
  };

  const setPivotAt = (clientX, clientY) => {
    if (!viewer.model || viewer.model.is2d?.()) return;
    const rect = canvasEl.getBoundingClientRect();
    const hit = viewer.impl.hitTest(clientX - rect.left, clientY - rect.top, true);
    if (hit && hit.intersectPoint) {
      viewer.navigation.setPivotPoint(hit.intersectPoint);
      viewer.navigation.setPivotSetFlag(true);
    }
  };

  const onMouseDown = (event) => {
    if (event.button !== 0 && event.button !== 1) return;  // izq (órbita) o rueda (pan)
    if (blockedByTool()) return;
    setPivotAt(event.clientX, event.clientY);
  };

  const onTouchStart = (event) => {
    if (blockedByTool()) return;
    const t = event.touches;
    if (!t || t.length === 0) return;
    if (t.length === 1) {
      setPivotAt(t[0].clientX, t[0].clientY);
    } else {
      // Pinza: el centro del gesto es a dónde quiere ir el usuario.
      setPivotAt((t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2);
    }
  };

  canvasEl.addEventListener('mousedown', onMouseDown, true);
  // passive: no se llama preventDefault — el gesto de órbita sigue intacto.
  canvasEl.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });

  // En táctil, además, la pinza acerca HACIA el pivote (el punto que pellizcas)
  // en vez de hacia el centro de la pantalla. Con mouse no se toca nada.
  let restoreZoom = null;
  if (coarsePointer) {
    try {
      const nav = viewer.navigation;
      if (nav?.setZoomTowardsPivot && nav.getZoomTowardsPivot) {
        const prev = nav.getZoomTowardsPivot();
        nav.setZoomTowardsPivot(true);
        restoreZoom = () => { try { nav.setZoomTowardsPivot(prev); } catch { /* noop */ } };
      }
    } catch { /* preferencia no disponible: el pivote de órbita ya funciona */ }
  }

  return () => {
    canvasEl.removeEventListener('mousedown', onMouseDown, true);
    canvasEl.removeEventListener('touchstart', onTouchStart, { capture: true });
    restoreZoom?.();
  };
}
