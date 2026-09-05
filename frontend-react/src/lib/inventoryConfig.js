/**
 * inventoryConfig — LA CONFIGURACIÓN DEL INVENTARIO DEJA DE VIVIR DENTRO DEL PANEL.
 * ---------------------------------------------------------------------------
 * Qué columnas se ven, en qué orden, por qué campo se agrupa y qué se totaliza
 * son decisiones del USUARIO SOBRE EL FRENTE, no del componente que las pinta.
 * Vivían en `useState` de `InventoryDataGrid` con una copia en
 * `window.__inventoryCacheSelectedColumns`, y eso costaba dos cosas:
 *
 *   1. Una Saved View guardada con el panel CERRADO no podía llevar la
 *      configuración: no había a quién preguntársela. La misma vista salía
 *      distinta según si el panel estaba montado.
 *
 *   2. La copia en `window` SOLO AVANZABA. El efecto que la escribía tenía una
 *      rama `else` vacía para no pisarla al montar, así que volver a «todas las
 *      columnas visibles» no se escribía nunca: la global se quedaba con la
 *      última selección parcial. Medido el 5-sep-2026 en el frente 1_DRENAJE:
 *      con «476 of 476» en pantalla, la vista guardada contenía 473 columnas,
 *      y al reabrirla devolvía 473. El usuario perdía tres columnas en
 *      silencio. Es el defecto R-07b de la Auditoría 02.
 *
 * EL TRIESTADO, EXPLÍCITO
 * -----------------------
 * El origen de R-07b es que `null` significaba dos cosas a la vez. Aquí no:
 *
 *     columns === undefined                 → SIN DATO (nunca se configuró)
 *     columns === { mode: 'all' }           → TODAS VISIBLES (decisión tomada)
 *     columns === { mode: 'custom', keys }  → SELECCIÓN PROPIA, y `keys` ES EL ORDEN
 *
 * «Todas visibles» pasa a ser un valor que se escribe, no una ausencia que se
 * deduce. Por eso el defecto no se puede reproducir: no hay nada que deducir.
 *
 * PERTENECE AL FRENTE
 * -------------------
 * `olvidarInventoryConfig()` se llama desde `utils/frenteSession.js`, junto al
 * resto del estado de frente. Sin eso, las columnas de Canal aparecerían en
 * Drenaje Urbano — exactamente la clase de fuga que ese módulo existe para
 * cerrar.
 *
 * NO ES UN GESTOR DE ESTADO. Son cuatro funciones y un objeto. No hace falta
 * más, y meter una biblioteca para esto sería cambiar un problema pequeño por
 * una dependencia grande.
 */

const VACIO = Object.freeze({
    columns: undefined,   // triestado, arriba
    groupBy: null,        // propiedad por la que se agrupan las filas
    totals: [],           // columnas con total al pie
    assetsOnly: false,    // solo elementos con ficha de activo
});

let cfg = { ...VACIO };

const hayVentana = () => typeof window !== 'undefined';

/**
 * Espejo del contrato v1, que la ruta de guardado antigua sigue leyendo
 * (`App.jsx`, `inventoryColumns: window.__inventoryCacheSelectedColumns || null`).
 *
 * Se mantiene aquí, en un solo sitio y derivado del triestado, para que la
 * ruta v1 deje de guardar la selección caducada: con `mode:'all'` escribe
 * `null`, que en v1 significa «todas visibles» — la lectura que el auditor
 * confirmó como canónica. Así R-07b queda cerrado también para las vistas
 * viejas, sin cambiarles el contrato.
 */
function espejoV1() {
    if (!hayVentana()) return;
    window.__inventoryCacheSelectedColumns =
        cfg.columns && cfg.columns.mode === 'custom' ? cfg.columns.keys : null;
}

/** Copia defensiva: quien lee no puede mutar la configuración por accidente. */
export function leerInventoryConfig() {
    return {
        columns: cfg.columns ? { ...cfg.columns, keys: cfg.columns.keys ? [...cfg.columns.keys] : undefined } : undefined,
        groupBy: cfg.groupBy,
        totals: [...cfg.totals],
        assetsOnly: cfg.assetsOnly,
    };
}

/**
 * Fija una parte de la configuración. Solo se tocan las claves presentes.
 * Emite `inventory-config-changed` para quien quiera reaccionar; el propio
 * grid NO lo necesita, porque él es quien llama.
 */
export function fijarInventoryConfig(parcial) {
    if (!parcial || typeof parcial !== 'object') return leerInventoryConfig();

    if ('columns' in parcial) {
        const c = parcial.columns;
        if (c === undefined || c === null) {
            cfg.columns = undefined;
        } else if (c.mode === 'custom') {
            // Las claves se copian: el orden del array ES el orden de columnas,
            // y no puede quedar atado a un array que el grid siga mutando.
            cfg.columns = { mode: 'custom', keys: [...(c.keys || [])] };
        } else {
            cfg.columns = { mode: 'all' };
        }
    }
    if ('groupBy' in parcial) cfg.groupBy = parcial.groupBy || null;
    if ('totals' in parcial) cfg.totals = [...(parcial.totals || [])];
    if ('assetsOnly' in parcial) cfg.assetsOnly = !!parcial.assetsOnly;

    espejoV1();
    if (hayVentana()) {
        try {
            window.dispatchEvent(new CustomEvent('inventory-config-changed', { detail: leerInventoryConfig() }));
        } catch { /* un oyente roto no debe tumbar al que guarda */ }
    }
    return leerInventoryConfig();
}

/** Vuelve a «sin dato». Lo llama el cambio de frente, no el desmontaje del panel. */
export function olvidarInventoryConfig() {
    cfg = { ...VACIO };
    espejoV1();
}

/**
 * Traduce el triestado a lo que el grid usa por dentro (`null` = todas).
 * Vive aquí para que la conversión tenga UN solo dueño.
 */
export function columnasParaElGrid(todasLasClaves) {
    if (!cfg.columns || cfg.columns.mode !== 'custom') return null;
    const validas = cfg.columns.keys.filter((k) => !todasLasClaves || todasLasClaves.includes(k));
    return validas.length ? validas : null;
}

/** El camino inverso: lo que el grid tiene ahora → triestado. */
export function columnasDesdeElGrid(seleccionadas, todasLasClaves) {
    if (!seleccionadas || (todasLasClaves && seleccionadas.length === todasLasClaves.length)) {
        return { mode: 'all' };
    }
    return { mode: 'custom', keys: [...seleccionadas] };
}
