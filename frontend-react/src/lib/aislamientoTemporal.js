/**
 * Aislamiento TEMPORAL desde la Planilla (docs/visor/24 §13).
 *
 * Qué resuelve (decisiones del propietario, 24-oct-2026):
 *   - un clic en una partida AÍSLA sus piezas, igual que Filters («que sea lo mismo que Filter
 *     en todo»); otro clic, Escape u otra selección MUESTRAN TODO como estaba;
 *   - volver tiene que ser inmediato, como «Mostrar todos los objetos» del menú del visor.
 *
 * Contrato:
 *   - El estado del visor ANTES de aislar (aislados y ocultos por modelo, p. ej. lo que oculta
 *     Sources o un filtro activo) se guarda UNA vez. Pasar a otra partida o recorrer «◀ ▶» re-aísla
 *     sin restaurar entre medias (menos trabajo, sin parpadeo).
 *   - Restaurar devuelve exactamente ese estado. Si antes no había nada aislado ni oculto, con UNA
 *     operación para todos los modelos (`aggregateIsolate([])`, la del menú); si lo había, modelo
 *     por modelo. Un modelo que ya no está cargado se salta.
 *   - Todo cambio de visibilidad se hace dentro de `silenciar` (lo pone quien crea el
 *     controlador): es visual y temporal, y nadie debe reaccionar a él. Ver
 *     `conVisibilidadProgramada`.
 *   - Si una operación falla a medias, se intenta volver al estado guardado y el error sube.
 *
 * Sin React ni DOM: se prueba con un visor simulado (pruebas/aislamientoTemporal.prueba.mjs).
 */

/** Nombres de los eventos de ventana entre la Planilla y el visor. */
export const EVENTOS = Object.freeze({
    /** La Planilla pide volver a mostrar todo (segundo clic en la partida aislada). */
    MOSTRAR_TODO: 'planilla-mostrar-todo',
    /** El visor dice a la Planilla cuántos pasos tiene el recorrido «◀ ▶» de la partida. */
    RECORRIDO: 'partida-recorrido',
});

/**
 * Ejecuta `fn` marcando que el cambio de visibilidad es PROGRAMADO, para que quien escucha los
 * HIDE/SHOW/ISOLATE del visor no lo trate como un cambio del usuario:
 *   - `window._filterIsolationInProgress`: lo respetan el conductor visual de Filters
 *     (lib/filterVisualDriver.js, CLOSED: sin ella recalcula todos los filtros, 5-6 s medidos en
 *     el Canal) y la sincronización de aislamiento de Viewer.jsx. Es la misma marca con que
 *     Filters aísla él mismo.
 *   - `extra` (opcional): las marcas propias de quien llama (p. ej. la de la fachada del visor).
 * Anidable y seguro ante errores: cada marca vuelve a su valor anterior.
 */
export function conVisibilidadProgramada(fn, { host = globalThis, extra = null } = {}) {
    const previo = host._filterIsolationInProgress;
    host._filterIsolationInProgress = true;
    const deshacerExtra = extra ? extra() : null;
    try {
        return fn();
    } finally {
        if (typeof deshacerExtra === 'function') deshacerExtra();
        host._filterIsolationInProgress = previo;
    }
}

const modelosDe = viewer => viewer.impl.modelQueue().getModels();

function capturar(viewer) {
    return modelosDe(viewer).map(model => ({
        model,
        aislados: [...(viewer.getIsolatedNodes?.(model) || [])],
        ocultos: [...(viewer.getHiddenNodes?.(model) || [])],
    }));
}

function devolver(viewer, guardado) {
    const vm = viewer.impl.visibilityManager;
    const cargados = new Set(modelosDe(viewer));
    const vigentes = guardado.filter(g => cargados.has(g.model));
    const limpio = vigentes.every(g => !g.aislados.length && !g.ocultos.length);
    if (limpio && typeof vm.aggregateIsolate === 'function') {
        vm.aggregateIsolate([]);
    } else {
        for (const { model, aislados, ocultos } of vigentes) {
            viewer.isolate(aislados, model);
            if (ocultos.length) viewer.hide(ocultos, model);
        }
    }
    viewer.impl.invalidate(true, true, true);
}

/**
 * @param viewer   el visor de LMV
 * @param silenciar (fn) => fn() envuelto en las marcas de cambio programado
 */
export function crearAislamientoTemporal(viewer, { silenciar = fn => conVisibilidadProgramada(fn) } = {}) {
    let guardado = null;   // estado antes del primer aislamiento
    let clave = null;      // qué está aislado ahora (p. ej. la clave de la partida)

    return {
        activo: () => guardado !== null,
        clave: () => clave,

        /**
         * Aísla `porModelo` (Map modelo → dbIds); los demás modelos quedan ocultos. Con la misma
         * `claveNueva` que ya está aislada no hace nada (recorrer «◀ ▶» solo mueve la cámara).
         * Devuelve true si cambió algo.
         */
        aislar(porModelo, claveNueva = null) {
            if (guardado && claveNueva !== null && claveNueva === clave) return false;
            silenciar(() => {
                if (!guardado) guardado = capturar(viewer);
                const vm = viewer.impl.visibilityManager;
                try {
                    for (const m of modelosDe(viewer)) {
                        const ids = porModelo.get(m);
                        vm.isolate(ids && ids.length ? ids : [-1], m);
                    }
                } catch (e) {
                    devolver(viewer, guardado);
                    guardado = null;
                    clave = null;
                    throw e;
                }
                viewer.impl.invalidate(true, true, true);
            });
            clave = claveNueva;
            return true;
        },

        /** Vuelve al estado de antes del primer aislamiento. Sin aislamiento, no hace nada. */
        restaurar() {
            if (!guardado) return false;
            const g = guardado;
            guardado = null;
            clave = null;
            silenciar(() => devolver(viewer, g));
            return true;
        },
    };
}
