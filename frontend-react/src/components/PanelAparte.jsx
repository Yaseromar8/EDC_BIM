// Un panel del visor que se puede llevar a otra ventana — a otra pantalla — y
// volver, sin perder nada (docs/visor/37).
//
// El panel se dibuja SIEMPRE dentro de la misma `caja` (un div propio). Abajo, en
// el visor, la caja vive en una ranura; al sacarlo, la misma caja se muda a la
// ventana nueva. Como React no lo vuelve a montar, conserva todo: la vista, la
// búsqueda, los filtros, lo desplegado. Y como sigue siendo el mismo programa,
// lo que el panel manda al 3D (aislar, seleccionar) llega igual que siempre.
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { abrirVentanaAparte } from '../lib/ventanaAparte';

// La ventana donde se está dibujando el panel. Lo que depende de la pantalla
// (el alto para colocar un menú, el portapapeles, dónde abrir un diálogo, un
// ResizeObserver) debe preguntarle a ESTA, no a `window`. Fuera de un panel
// aparte es la ventana principal.
const VentanaDelPanel = createContext(null);
export const useVentanaDelPanel = () => useContext(VentanaDelPanel) || window;

/**
 * Estado de un panel desacoplable. `sacar()` debe llamarse desde el clic (el
 * navegador solo abre ventanas como respuesta a un gesto) y devuelve `false` si
 * la ventana quedó bloqueada.
 */
export function usePanelAparte({ nombre, titulo }) {
    const caja = useMemo(() => {
        const d = document.createElement('div');
        d.style.cssText = 'display:flex;flex-direction:column;flex:1 1 0;min-width:0;min-height:0;height:100%;width:100%';
        return d;
    }, []);
    const [fuera, setFuera] = useState(null);
    const actual = useRef(null);

    const sacar = useCallback(() => {
        if (actual.current) { actual.current.ventana.focus(); return true; }
        const abierta = abrirVentanaAparte({
            nombre, titulo,
            alCerrar: () => {
                // De vuelta al documento principal ANTES de que muera la ventana;
                // la ranura del visor la recoge en cuanto se vuelve a pintar.
                document.adoptNode(caja);
                actual.current = null;
                setFuera(null);
            },
        });
        if (!abierta) return false;
        abierta.cuerpo.appendChild(caja);
        actual.current = abierta;
        setFuera(abierta);
        return true;
    }, [caja, nombre, titulo]);

    const volver = useCallback(() => { actual.current?.cerrar(); }, []);
    useEffect(() => () => actual.current?.cerrar(), []);

    return { caja, fuera: !!fuera, ventana: fuera ? fuera.ventana : window, sacar, volver };
}

/** El hueco del visor donde vive la caja mientras el panel no está fuera. */
export function RanuraDelPanel({ caja }) {
    const ref = useRef(null);
    useLayoutEffect(() => {
        const ranura = ref.current;
        ranura.appendChild(caja);
        return () => { if (caja.parentNode === ranura) ranura.removeChild(caja); };
    }, [caja]);
    return <div ref={ref} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minWidth: 0, minHeight: 0 }} />;
}

/**
 * Lo que se dibuja dentro de la caja, esté donde esté. Si deja de dibujarse (se
 * cierra el panel, o se desmonta lo que lo contiene), `onDesmontar` cierra la
 * ventana de aparte: no queda una ventana vacía.
 */
export function EnElPanel({ caja, ventana, onDesmontar, children }) {
    const alDesmontar = useRef(onDesmontar);
    alDesmontar.current = onDesmontar;
    useEffect(() => () => alDesmontar.current?.(), []);
    return createPortal(<VentanaDelPanel.Provider value={ventana}>{children}</VentanaDelPanel.Provider>, caja);
}
