/**
 * restaurarVistaV2 — ABRIR UNA SAVED VIEW v2, GOBERNADO POR SEÑALES.
 * ---------------------------------------------------------------------------
 * El camino v1 que hay en producción restaura así: aplica `restoreState`, y
 * después espera 500 ms y 1500 ms a ver si ya. La Auditoría 02 midió qué pasa
 * cuando no: el `restoreState` borra la visibilidad que los filtros acababan de
 * poner, los filtros se re-inyectan encima con un temporizador, y si el
 * inventario tarda un poco más de la cuenta la vista se abre a medias sin que
 * nada lo diga. Los 500 ms fueron REDUNDANTES en los dos escenarios medidos y
 * no son un mecanismo de sincronización.
 *
 * Aquí no hay ni un temporizador de sincronización. Cada etapa espera la SEÑAL
 * de la anterior, y los únicos plazos que existen son techos de seguridad —para
 * no colgarse— que además degradan y lo dicen.
 *
 * ESTE MÓDULO ENTRA APAGADO
 * -------------------------
 * `restauradorV2Activo()` es `false` salvo que se encienda a mano. Con la
 * bandera apagada el producto se comporta exactamente igual que hoy: v1 sigue
 * siendo v1, la vista compartida sigue igual, y nada de esto se ejecuta.
 *
 * TODO ENTRA POR PARÁMETRO
 * ------------------------
 * El restaurador no lee `window`, no importa el visor y no toca React: recibe
 * un `entorno` con lo que necesita. No es purismo — es lo que permite ejecutar
 * el pipeline entero, con sus esperas y sus cancelaciones, en una batería que
 * corre en un segundo. El banco de pruebas llama a ESTA función, no a una copia.
 *
 * LO QUE NO HACE, Y ES DELIBERADO
 * -------------------------------
 * No retira el camino v1, no toca los temporizadores de 500/1500 ms y no cambia
 * ninguna ruta. Eso es E-7, y mezclarlo aquí haría imposible probar una cosa sin
 * la otra.
 */

import { planDeRebind, aplicarRebind, resolverElementos,
    politicaDeElementos, linajeDeUrn, esPersistibleV2, PROP_SOURCES,
    CAMPOS_LMV_PERSISTIBLES, SCHEMA_VERSION } from './savedViewV2.js';
import { resolverSeleccion, sePuedeAislar } from './preflightFiltros.js';

// ═══════════════════════════════════════════════════════════════════════════
// LA BANDERA
// ═══════════════════════════════════════════════════════════════════════════
//
// Tres formas de encenderla, y NO valen lo mismo:
//
//   VITE_SAVED_VIEWS_V2_RESTORE=true    de BUILD. Vale en cualquier modo.
//   localStorage SAVED_VIEWS_V2_RESTORE sólo fuera de producción
//   window.SAVED_VIEWS_V2_RESTORE       sólo fuera de producción
//
// Las dos últimas existen para el desarrollo y el banco: encender el restaurador
// sin recompilar. Pero en un build de producción CUALQUIERA puede escribirlas
// desde la consola del navegador, y entonces no serían un interruptor de
// desarrollo sino una forma de que un usuario active por su cuenta código que
// todavía no se ha desplegado a nadie. Así que en producción no encienden nada.
//
// Y en la duda, apagado: sin `import.meta.env` —fuera de un bundle, por ejemplo
// en una batería de Node— no hay forma de saber en qué modo se está, y lo que no
// se sabe se trata como producción.
//
// No hay variable de Render, y no la habrá hasta que alguien lo decida.
export const BANDERA = 'SAVED_VIEWS_V2_RESTORE';

/** El entorno del bundler, o nada si no hay bundler. Aparte, para poder probarlo. */
export function entornoDeBuild() {
    try {
        if (typeof import.meta !== 'undefined' && import.meta.env) return import.meta.env;
    } catch { /* sin bundler */ }
    return null;
}

/** ¿Esto es un build de producción? Sin saberlo, se responde que SÍ. */
export function esProduccion(env) {
    if (!env) return true;                       // fail-closed
    if (env.PROD === true) return true;
    if (env.DEV === true) return false;
    return String(env.MODE || 'production') === 'production';
}

export function restauradorV2Activo(ventana = (typeof window !== 'undefined' ? window : null),
                                    env = entornoDeBuild()) {
    // La bandera de BUILD manda en cualquier modo: es la que se decide al
    // compilar y no la puede tocar quien abre la página.
    if (env && String(env.VITE_SAVED_VIEWS_V2_RESTORE) === 'true') return true;
    if (esProduccion(env)) return false;         // ni localStorage ni window
    if (!ventana) return false;
    if (ventana[BANDERA] === true) return true;
    try {
        return ventana.localStorage?.getItem(BANDERA) === 'true';
    } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════════════════
// TECHOS DE SEGURIDAD — NO SON SINCRONIZACIÓN
// ═══════════════════════════════════════════════════════════════════════════
//
// Cada uno existe para que una señal que no llega nunca no deje la interfaz
// colgada. Ninguno se usa para «dar tiempo a que termine»: cuando vencen, la
// restauración SIGUE, se marca degradada y el parte dice cuál venció. Si alguno
// se cumple de forma habitual, es que falta una señal — no que el número sea
// pequeño.
export const TECHOS = Object.freeze({
    modelos: 60000,        // cargar una federación fría
    estadoLmv: 15000,      // restoreState -> viewerStateRestored
    inventario: 30000,     // el snapshot canónico del inventario, si aún baja
    filtros: 30000,        // recalculate-filters -> filters-calculated
    theming: 20000,        // theme-property-bucket -> viewer-colors-applied
    barreraVisual: 8000,   // SOLO el fotograma final, contado desde que puede ocurrir
});

/** Nombres de los eventos que ya existen en el producto. No se inventa ninguno. */
export const EVENTOS = Object.freeze({
    inicio: 'saved-view-restore-begin',
    fin: 'saved-view-restore-complete',
    modeloListo: 'viewer-model-loaded',        // E-3
    restaurarLmv: 'viewer-restore-state',
    recalcular: 'recalculate-filters',
    filtrosListos: 'filters-calculated',
    coloresValor: 'custom-colors-restored',
    coloresAplicados: 'viewer-colors-applied',
    coloresFuente: 'ecd-source-tints-restore',
    temaPropiedad: 'theme-property-bucket',
    inventario: 'restore-inventory-config',
    inventarioListo: 'inventory-ready',        // E5: el snapshot ya es utilizable
    heatmapPk: 'lob-pk-heatmap',
});

/**
 * ¿Este disparo de `finalFrameRenderedChanged` significa «ya está dibujado»?
 *
 * El evento se emite DOS veces por restauración y sólo la segunda cuenta.
 * Medido en el visor real (LMV 7.126, federación de 5 en 1_CANAL):
 *
 *     +589 ms   e.value = { finalFrame: false }
 *     +1202 ms  e.value = { finalFrame: true }
 *
 * El estado va en `e.value.finalFrame`. Aceptar cualquier disparo daría por
 * terminada la restauración con el render a medias; rechazarlos todos —que es
 * lo que hacía la primera versión, escrita sin el visor delante— agota el techo
 * y degrada una restauración que había ido bien.
 */
export function esFotogramaFinal(_detalle, evento) {
    const e = evento || _detalle;
    const v = e?.value;
    if (v && typeof v === 'object' && 'finalFrame' in v) return v.finalFrame === true;
    if (typeof v === 'boolean') return v;                  // por si cambia de forma
    return v === undefined && e?.finalFrame !== false;     // sin payload: se acepta
}

/** Los del LMV. Verificados en el bundle 7.126 durante la Auditoría 02. */
export const EVENTOS_LMV = Object.freeze({
    estadoRestaurado: 'viewerStateRestored',
    camaraLista: 'cameraTransitionComplete',
    fotogramaFinal: 'finalFrameRenderedChanged',
    // POR MODELO. `e.model` dice de cuál. Verificado en el visor real:
    // `Autodesk.Viewing.GEOMETRY_LOADED_EVENT === 'geometryLoaded'` (LMV 7.126).
    geometriaModelo: 'geometryLoaded',
});

/**
 * ¿La geometría de este modelo ya puede entrar en composición final?
 *
 * Dos formas, y se usan las dos porque ninguna basta sola:
 *
 *   `isLoadDone()`   ESTADO. Vale aunque el evento se haya emitido antes de que
 *                    nadie escuchara. Verificado en LMV 7.126: existe y devuelve
 *                    `true` cuando la geometría del modelo está completa.
 *   `geometryLoaded` EVENTO por modelo, para los que aún no lo están.
 *
 * NO se usa el `viewer-geometry-loaded` de la aplicación: es agregado, no dice
 * de qué modelo habla, y con una federación de cinco eso no permite saber si
 * los REQUERIDOS están listos o si el que terminó era otro.
 */
export function geometriaLista(modelo, vistos) {
    if (!modelo) return false;
    const urn = modelo.getData?.()?.urn || modelo.urn || null;
    if (urn && vistos && vistos.has(urn)) return true;
    try {
        if (typeof modelo.isLoadDone === 'function') return modelo.isLoadDone() === true;
    } catch { /* el modelo no lo declara */ }
    return false;
}

export const ETAPAS = Object.freeze([
    'begin', 'contextReady', 'modelsReady', 'rebindDone', 'viewerStateRestored',
    'inventoryReady', 'filtersCalculated', 'colorsApplied', 'inventoryApplied',
    'geometryReady', 'cameraComplete', 'finalFrame', 'restoreComplete',
]);

// Tolerancia del marco espacial, EN UNIDADES DEL MODELO.
//
// ESTE NÚMERO ES SÓLO EL RESPALDO: 1 mm expresado en metros, para el modelo que
// no declara su escala. El valor que se usa de verdad lo da `epsilonDelModelo`
// preguntando al modelo base (línea ~697), y por eso este no está congelado.
//
// MEDIDO en el visor real (5-sep-2026, LMV 7.126, federación de 5 en 1_CANAL):
// los cinco modelos declaran `getUnitScale() === 0.001` y `getUnits() === 'mm'`,
// así que la unidad del modelo es el milímetro y 1 mm físico son 1,0 unidades
// —no 0,001—. El `globalOffset` medido lo confirma:
//
//     { x: 469953888.7152726, y: 9496220126.572807, z: 51382.85073776245 }
//
// que en metros es E 469.953,9 / N 9.496.220,1: una coordenada UTM del norte del
// Perú. Idéntico en los cinco modelos, como corresponde a una federación que
// hereda el marco del primero que carga.
//
// Aplicar aquí 0,001 habría sido comparar milímetros con una tolerancia de una
// milésima de milímetro: cualquier reescritura del offset por el motor daría
// «marco distinto» y la vista degradaría sin motivo.
export const TOLERANCIA_OFFSET_M = 0.001;

// ═══════════════════════════════════════════════════════════════════════════
// GENERACIÓN — QUIÉN MANDA CUANDO SE PIDEN DOS VISTAS SEGUIDAS
// ═══════════════════════════════════════════════════════════════════════════
//
// Abrir la vista B mientras A está a medias es lo normal: se pulsa una, no pasa
// nada visible todavía, y se pulsa otra. Sin esto, A sigue viva por dentro y va
// aplicando su estado ENCIMA de B según le van llegando sus esperas. El
// resultado es una mezcla de dos vistas que no es ninguna de las dos.
//
// Cada restauración toma un número. Toda continuación asíncrona comprueba que
// sigue siendo la vigente ANTES y DESPUÉS de cada `await`: antes, porque puede
// haber caducado mientras esperaba su turno; después, porque puede haber
// caducado durante la espera.
//
// Una restauración cancelada no aplica nada, no emite `complete`, y —esto es lo
// que se olvida— NO limpia la generación de la que la sustituyó.

let _generacion = 0;

export class Generacion {
    constructor(controlador) {
        this.n = ++_generacion;
        this.abortador = controlador || (typeof AbortController !== 'undefined' ? new AbortController() : null);
    }
    vigente() { return this.n === _generacion; }
    get senal() { return this.abortador ? this.abortador.signal : undefined; }
    /** Aborta ESTA generación. Solo la usa quien la sustituye. */
    cancelar() { try { this.abortador?.abort(); } catch { /* sin AbortController */ } }
}

/** Para las pruebas: devuelve el contador a cero. No lo usa el producto. */
export function _reiniciarGeneraciones() { _generacion = 0; }

export class Cancelada extends Error {
    constructor(etapa) {
        super('restauración cancelada en ' + etapa);
        this.name = 'Cancelada';
        this.etapa = etapa;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ESPERAR UNA SEÑAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Espera un evento. Devuelve `{ ok, detalle, motivo }` — nunca lanza por techo.
 *
 * El techo NO es sincronización: si vence, se devuelve `ok:false` y quien llama
 * decide si eso degrada o no. Lo que sí corta en seco es la cancelación.
 */
export function esperarEvento(emisor, nombre, { gen, techo, filtro, temporizador } = {}) {
    return new Promise((resolve) => {
        if (gen && !gen.vigente()) { resolve({ ok: false, motivo: 'cancelada' }); return; }

        let terminado = false;
        let idPlazo = null;
        const quitar = () => {
            try { emisor.removeEventListener(nombre, alLlegar); } catch { /* doble */ }
            if (idPlazo !== null) (temporizador?.limpiar || clearTimeout)(idPlazo);
        };
        const acabar = (r) => { if (terminado) return; terminado = true; quitar(); resolve(r); };

        function alLlegar(e) {
            if (gen && !gen.vigente()) { acabar({ ok: false, motivo: 'cancelada' }); return; }
            const detalle = e && e.detail !== undefined ? e.detail : e;
            if (filtro && !filtro(detalle, e)) return;      // no era el que se esperaba, o no todavia
            acabar({ ok: true, detalle });
        }

        emisor.addEventListener(nombre, alLlegar);
        if (techo) {
            const poner = temporizador?.poner || ((f, ms) => setTimeout(f, ms));
            idPlazo = poner(() => acabar({ ok: false, motivo: 'techo' }), techo);
        }
        if (gen?.senal) {
            try { gen.senal.addEventListener('abort', () => acabar({ ok: false, motivo: 'cancelada' })); }
            catch { /* señal sin addEventListener */ }
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// EL PARTE
// ═══════════════════════════════════════════════════════════════════════════

function nuevoParte() {
    return { estado: 'completa', avisos: [], cronologia: {} };
}

// El `tipo` va DESPUES del spread a propósito. Varias llamadas pasan como
// `datos` un objeto que ya trae su propio `tipo` --los descartes del preflight,
// por ejemplo-- y con el orden contrario ese `tipo` de dentro machacaba el que
// se estaba poniendo: el parte acababa diciendo `propiedad-inexistente` donde
// tenía que decir `preflight-propiedad-inexistente`, y dos etapas distintas
// escribían el mismo nombre. Quien nombra el aviso es quien lo levanta.
function anotar(parte, tipo, datos = {}) {
    parte.avisos.push({ ...datos, tipo });
    if (parte.estado === 'completa') parte.estado = 'degradada';
    return parte;
}

/** Un apunte que NO degrada: cuenta lo que pasó, no un daño. */
function apuntar(parte, tipo, datos = {}) {
    parte.avisos.push({ ...datos, tipo });
    return parte;
}

function fallar(parte, motivo, datos = {}) {
    parte.estado = 'fallida';
    parte.avisos.push({ ...datos, tipo: 'fallo', motivo });
    return parte;
}

// ═══════════════════════════════════════════════════════════════════════════
// E2b · ¿SIGUE SIENDO EL MISMO SITIO?
// ═══════════════════════════════════════════════════════════════════════════
//
// El `globalOffset` lo fija el PRIMER modelo que se carga y lo heredan los
// demás (`baseOffsetRef` en Viewer.jsx), combinado con `applyRefPoint: true`.
// Es decir: depende del orden de carga y no es una traslación demostrablemente
// pura. Si hoy no es el mismo que cuando se guardó la vista, la cámara guardada
// apunta a otro punto del espacio, y los planos de corte cortan por otro sitio.
//
// No se inventa una transformación delta. Se deja de aplicar lo espacial, se
// encuadra con `fitToView` y se dice.
export const CAMPOS_ESPACIALES = Object.freeze(['eye', 'target', 'pivot', 'position']);

/**
 * El `globalOffset` de la federación: el del modelo que lo FIJÓ, no el de
 * `viewer.model`.
 *
 * `viewer.model` es «el modelo actual» y puede ser cualquiera de los cinco según
 * qué se haya cargado o mostrado último. El offset de una federación lo fija el
 * PRIMER modelo que se carga y lo heredan los demás (`baseOffsetRef` en
 * Viewer.jsx, con `applyRefPoint: true`), así que comparar contra otro es
 * comparar contra un valor heredado que puede no coincidir por redondeo.
 *
 * El base se identifica por el documento: el modelo de `order === 0`, o el
 * primero de la lista si no hay orden. Si ese no está cargado, se dice —no se
 * coge otro en su lugar, que es como se acaba comparando peras con manzanas—.
 */
export function offsetDelModeloBase(visor, doc, plan) {
    const modelos = visor?.getAllModels?.() || [];
    const base = [...(doc?.models || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
    const urnBase = base && plan ? plan.urnPorLinaje.get(base.lineage) : null;
    if (urnBase) {
        const m = modelos.find((x) => (x.getData?.()?.urn || x.urn) === urnBase);
        if (m) return { offset: m.getData?.()?.globalOffset || null, urn: urnBase, esBase: true };
        return { offset: null, urn: urnBase, esBase: true, motivo: 'el modelo base no está cargado' };
    }
    // Sin base identificable no se inventa uno: se dice y el marco queda sin
    // comprobar, que degrada, en vez de dar por bueno un offset cualquiera.
    return { offset: null, urn: null, esBase: false, motivo: 'no se pudo identificar el modelo base' };
}

/**
 * La tolerancia, en las unidades del modelo.
 *
 * `getUnitScale()` devuelve METROS POR UNIDAD, así que 1 mm físico son
 * `0,001 / escala` unidades del modelo. MEDIDO en los cinco modelos de 1_CANAL
 * (5-sep-2026): escala 0,001 → epsilon 1,0 unidades. Un modelo en metros daría
 * 0,001, y uno en pies 0,00328: el número cambia con el modelo, que es
 * justamente lo que no podía hacer una constante.
 *
 * El respaldo —asumir metros— sólo actúa si el modelo no declara escala. No es
 * el caso de ninguno de los medidos.
 */
export function epsilonDelModelo(modelo, milimetros = 1) {
    const metros = milimetros / 1000;
    try {
        const escala = modelo?.getUnitScale?.();          // metros por unidad
        if (typeof escala === 'number' && escala > 0) return metros / escala;
    } catch { /* el modelo no lo declara */ }
    return metros;                                        // se asume metros
}

export function mismoMarcoEspacial(actual, guardado, tol = TOLERANCIA_OFFSET_M) {
    if (!guardado) return { igual: true, motivo: 'la vista no guardó marco: no hay nada que contradecir' };
    if (!actual) return { igual: false, motivo: 'el visor todavía no tiene globalOffset' };
    const d = ['x', 'y', 'z'].map((k) => Math.abs(Number(actual[k] || 0) - Number(guardado[k] || 0)));
    const mayor = Math.max(...d);
    return { igual: mayor <= tol, delta: mayor, motivo: `desvío máximo ${mayor} m (tolerancia ${tol})` };
}

/** Quita del estado LMV lo que sólo tiene sentido en el marco en que se guardó. */
export function podarEstadoEspacial(lmv) {
    const copia = JSON.parse(JSON.stringify(lmv || {}));
    const fuera = [];
    if (copia.viewport) {
        for (const c of CAMPOS_ESPACIALES) {
            if (copia.viewport[c] !== undefined) { delete copia.viewport[c]; fuera.push('viewport.' + c); }
        }
    }
    if (copia.cutplanes !== undefined) { delete copia.cutplanes; fuera.push('cutplanes'); }
    for (const c of ['floorOffsetMin', 'floorOffsetMax']) {
        if (copia[c] !== undefined) { delete copia[c]; fuera.push(c); }
    }
    return { lmv: copia, retirados: fuera };
}

// ═══════════════════════════════════════════════════════════════════════════
// E2c · REBIND — TRADUCIR EL DOCUMENTO AL PRESENTE
// ═══════════════════════════════════════════════════════════════════════════

/** lineage -> urn vigente, para todo lo que el documento guardó por linaje. */
export function rebindDelDocumento(doc, modelConfig) {
    const plan = planDeRebind(doc, modelConfig);
    const { doc: conSeeds, cambiados } = aplicarRebind(doc, plan);

    // `Standard::Sources` se persiste por LINAJE (E-4B) y en runtime viaja con
    // el urn vigente: aquí se hace el camino de vuelta.
    const sel = conSeeds?.filters?.selections || {};
    const fuentes = sel[PROP_SOURCES];
    const fuentesPerdidas = [];
    if (Array.isArray(fuentes)) {
        const vivas = [];
        for (const linaje of fuentes) {
            const urn = plan.urnPorLinaje.get(linaje);
            if (urn) vivas.push(urn); else fuentesPerdidas.push(linaje);
        }
        // Una selección de Sources que se queda vacía se QUITA. Dejarla vacía
        // sobre una propiedad activa es lo que produce el conjunto vacío que
        // acaba en `isolate([-1])` — el modelo fantasma de la Auditoría 02.
        if (vivas.length) sel[PROP_SOURCES] = vivas;
        else delete sel[PROP_SOURCES];
    }

    // Los colores por fuente también van por linaje en el documento.
    const coloresFuente = {};
    const coloresPerdidos = [];
    for (const [linaje, color] of Object.entries(conSeeds?.filters?.sourceColor?.custom || {})) {
        const urn = plan.urnPorLinaje.get(linaje);
        if (urn) coloresFuente[urn] = color; else coloresPerdidos.push(linaje);
    }

    // Y los modelos ocultos.
    const ocultosUrn = [];
    const ocultosPerdidos = [];
    for (const linaje of conSeeds?.filters?.hiddenModelLineages || []) {
        const urn = plan.urnPorLinaje.get(linaje);
        if (urn) ocultosUrn.push(urn); else ocultosPerdidos.push(linaje);
    }
    for (const m of conSeeds?.models || []) {
        if (m && m.lineage && m.visible === false) {
            const urn = plan.urnPorLinaje.get(m.lineage);
            if (urn && !ocultosUrn.includes(urn)) ocultosUrn.push(urn);
        }
    }

    const activo = conSeeds?.federation?.activeLineage
        ? plan.urnPorLinaje.get(conSeeds.federation.activeLineage) || null : null;

    return {
        doc: conSeeds, plan, cambiados, coloresFuente, ocultosUrn, activo,
        perdidos: { fuentes: fuentesPerdidas, colores: coloresPerdidos, ocultos: ocultosPerdidos },
    };
}

/**
 * E2c · los elementos. Con la MISMA versión vale el objectSet nativo; con otra,
 * hay que traducir por identidad estable, porque los dbId de la v50 aplicados
 * sobre la v51 no dan error: dan OTROS elementos, en silencio.
 */
export function resolverObjectSet(doc, plan, rosettaPorUrn, puentesIfc = {}) {
    const salida = [];
    const informe = [];
    for (const entrada of doc?.lmv?.objectSet || []) {
        if (!entrada) continue;
        const urn = entrada.seedUrn;
        const modelo = (doc.models || []).find((m) => m && plan.urnPorLinaje.get(m.lineage) === urn);
        const cambio = modelo ? plan.versionCambiada.has(modelo.lineage) : true;
        const elementos = modelo?.elements || entrada.elements || null;
        const politica = politicaDeElementos({ tieneElementos: !!elementos, versionCambiada: cambio });

        if (politica === 'objectset-nativo') {
            salida.push(entrada);
            continue;
        }
        if (politica === 'degradar') {
            informe.push({ tipo: 'objectset-descartado', urn, motivo: 'versión distinta y sin identidad de elemento' });
            continue;                                   // NO se aplican dbIds viejos
        }
        const r = resolverElementos(elementos, rosettaPorUrn[urn], puentesIfc[urn]);
        if (r.total > 0 && r.resueltos === 0) {
            informe.push({ tipo: 'elementos-ninguno-resuelto', urn, perdidos: r.total });
            continue;                                   // ni uno: no se aísla nada
        }
        if (r.resueltos < r.total) {
            informe.push({ tipo: 'elementos-parcial', urn, resueltos: r.resueltos, total: r.total });
        }
        salida.push({ ...entrada, id: r.selected, hidden: r.hidden, isolated: r.isolated });
    }
    return { objectSet: salida, informe };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRATO DE ENTRADA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lo que tiene que cumplir un documento ANTES de que se toque el visor.
 *
 * Reusa `esPersistibleV2` —la misma regla que el servidor— y añade lo que el
 * restaurador necesita además: que el inventario, si viene, sea el triestado y
 * no cualquier cosa. Un documento ambiguo no se restaura «lo que se pueda»: se
 * rechaza sin haber movido nada, porque a medio aplicar no se puede volver.
 */
export function contratoDeEntrada(doc) {
    const problemas = [];
    if (!doc || typeof doc !== 'object') {
        return { ok: false, problemas: [{ campo: 'state', motivo: 'NO_ES_OBJETO' }] };
    }
    if (doc.schemaVersion !== SCHEMA_VERSION) {
        problemas.push({ campo: 'state.schemaVersion', motivo: 'SCHEMA_VERSION' });
    }
    const { problemas: dePersistencia } = esPersistibleV2(doc);
    problemas.push(...dePersistencia);

    const inv = doc.inventory?.columns;
    if (inv !== undefined && inv !== null) {
        const modo = inv.mode;
        if (modo !== 'all' && modo !== 'custom') {
            problemas.push({ campo: 'state.inventory.columns.mode', motivo: 'TRIESTADO_INVALIDO' });
        } else if (modo === 'custom' && !Array.isArray(inv.keys)) {
            problemas.push({ campo: 'state.inventory.columns.keys', motivo: 'TRIESTADO_INVALIDO' });
        }
    }
    return { ok: problemas.length === 0, problemas };
}

// ═══════════════════════════════════════════════════════════════════════════
// EL PIPELINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Restaura una Saved View v2. E0 a E9, gobernado por señales.
 *
 * @param {object} doc      SavedViewState v2 YA normalizado
 * @param {object} entorno  todo lo que se toca, inyectado
 * @returns {{estado, parte, cronologia, generacion}}
 */
export async function restaurarVistaV2(doc, entorno) {
    const {
        ventana, visor, modelConfig = [], inventario = null, inventarioFresco = null,
        rosettaPorUrn = {}, puentesIfc = {}, viewId = null,
        cargarModelos = null, aplicarInventario = null,
        aplicarFiltros = null, aplicarTintesDeFuente = null, fijarColoresDeValor = null,
        reloj = null, temporizador = null,
        documentoOculto = null, techos = TECHOS,
    } = entorno || {};

    const ahora = reloj || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    const parte = nuevoParte();
    const t0 = ahora();
    const marca = (etapa) => { parte.cronologia[etapa] = Math.round((ahora() - t0) * 100) / 100; };

    // ── E0 · BEGIN ─────────────────────────────────────────────────────────
    const anterior = _generacion;
    const gen = new Generacion();
    if (anterior > 0) {
        // Cancelar la anterior es lo primero que se hace, antes de mirar el
        // documento: si el de B es inválido, A tampoco puede seguir aplicándose.
        ventana.__restauracionEnCurso?.cancelar?.();
    }
    ventana.__restauracionEnCurso = gen;
    // La guardia de reentrada es UN indicador con el número de generación, no un
    // interruptor global: lo que se quiere impedir es el rebote de los paneles
    // durante ESTA restauración, no apagar la aplicación.
    ventana.__restaurandoVistaV2 = gen.n;
    marca('begin');
    ventana.dispatchEvent(new CustomEvent(EVENTOS.inicio, { detail: { viewId, generacion: gen.n } }));

    // Escuchas que hay que retirar pase lo que pase. `soltar()` corre en TODOS
    // los caminos de cierre --completa, degradada, fallida, cancelada y la
    // excepcion-- asi que es el unico sitio donde ponerlo sin olvidarse de uno.
    const limpiezas = [];
    const soltar = () => {
        for (const f of limpiezas.splice(0)) { try { f(); } catch { /* ya estaba */ } }
        // Solo se suelta la guardia si sigue siendo la nuestra. Una cancelada
        // que limpiara la de su sucesora dejaría a B sin protección.
        if (ventana.__restaurandoVistaV2 === gen.n) ventana.__restaurandoVistaV2 = 0;
        if (ventana.__restauracionEnCurso === gen) ventana.__restauracionEnCurso = null;
    };
    const cerrar = (final) => {
        soltar();
        parte.estado = final;
        if (final !== 'cancelada') {
            ventana.dispatchEvent(new CustomEvent(EVENTOS.fin, {
                detail: { viewId, estado: final, parte: parte.avisos, cronologia: parte.cronologia },
            }));
            marca('restoreComplete');
        }
        return { estado: final, parte, cronologia: parte.cronologia, generacion: gen.n };
    };
    const cancelado = () => !gen.vigente();

    try {
        // ── CONTRATO ───────────────────────────────────────────────────────
        const contrato = contratoDeEntrada(doc);
        if (!contrato.ok) {
            fallar(parte, 'contrato-de-entrada', { problemas: contrato.problemas });
            return cerrar('fallida');                   // el visor no se ha tocado
        }

        // ── E1 · CONTEXTO ──────────────────────────────────────────────────
        // El documento pertenece a unos linajes concretos. Si el frente que hay
        // cargado no los conoce, esto no es «restaurar degradado»: es otra obra.
        // Y cambiar de frente aquí no se puede hacer de forma fiable —lo hace
        // `setSelectedProject`, que desmonta el visor entero— así que se falla y
        // se dice, en vez de fingir que se intentó.
        const linajesDelFrente = new Set((modelConfig || [])
            .map((m) => m && (m.lineage || m.item_id || m.itemId)).filter(Boolean));
        const requeridos = (doc.models || []).map((m) => m.lineage);
        const fueraDelFrente = requeridos.filter((l) => !linajesDelFrente.has(l));
        if (linajesDelFrente.size === 0 || fueraDelFrente.length === requeridos.length) {
            fallar(parte, 'contexto-incorrecto', {
                requeridos, enElFrente: [...linajesDelFrente],
                ayuda: 'la vista es de otro frente; cambiarlo desmonta el visor y no lo hace el restaurador',
            });
            return cerrar('fallida');
        }
        if (fueraDelFrente.length) {
            anotar(parte, 'modelos-fuera-del-frente', { lineages: fueraDelFrente });
        }
        if (cancelado()) return cerrar('cancelada');
        marca('contextReady');

        // ── E2 · MODELOS ───────────────────────────────────────────────────
        // Lo que hay cargado se pregunta al visor, no a un contador. `total` del
        // evento de E-3 es informativo y NO se usa: los modelos que ya estaban
        // no vuelven a anunciarse, así que esperar `total` eventos colgaría.
        const linajeDeModelo = (m) => {
            const urn = m?.getData?.()?.urn || m?.urn || null;
            if (!urn) return null;
            const fila = (modelConfig || []).find((x) => x && x.urn === urn);
            return (fila && (fila.lineage || fila.item_id || fila.itemId)) || linajeDeUrn(urn);
        };
        // PREPARADO NO ES CARGADO. E-3 midió la ventana: `GEOMETRY_LOADED` mete el
        // modelo en el visor, pero la Piedra Rosetta se construye DESPUÉS —
        // `getExternalIdMapping` es asíncrono, y en IFC hay además un
        // `getBulkProperties` detrás—. Restaurar en esa ventana significa tener
        // el modelo y no poder traducir ni un externalId a dbId.
        //
        //     preparado = cargado  +  linaje resuelto  +  Rosetta poblada
        //
        // Un modelo cargado sin Rosetta NO se vuelve a pedir: ya viene de camino
        // y su `viewer-model-loaded` llegará cuando la Rosetta esté. Pedirlo otra
        // vez sería cargarlo dos veces o, con la guarda del cargador, no hacer
        // nada y quedarse esperando igual.
        const cargados = new Map();
        for (const m of visor.getAllModels?.() || []) {
            const l = linajeDeModelo(m);
            if (l) cargados.set(l, (m.getData?.()?.urn || m.urn || null));
        }
        const conRosetta = (urn) => {
            const r = urn ? rosettaPorUrn[urn] : null;
            return !!r && Object.keys(r).length > 0;
        };
        const preparados = new Set();
        const sinRosetta = [];
        for (const [l, urn] of cargados) {
            if (conRosetta(urn)) preparados.add(l);
            else sinRosetta.push(l);
        }
        const enEspera = requeridos.filter((l) => linajesDelFrente.has(l) && !preparados.has(l));
        const faltantes = enEspera.filter((l) => !cargados.has(l));      // ni siquiera cargados
        const cargadosSinRosetta = enEspera.filter((l) => cargados.has(l));

        apuntar(parte, 'modelos', {
            requeridos: requeridos.length, preparados: preparados.size,
            faltantes: faltantes.length, cargadosSinRosetta: cargadosSinRosetta.length,
        });
        if (sinRosetta.length) {
            apuntar(parte, 'modelos-cargados-sin-rosetta', { lineages: cargadosSinRosetta });
        }

        if (enEspera.length) {
            const porLlegar = new Set(enEspera);
            const espera = new Promise((resolve) => {
                let idPlazo = null;
                const fin = (motivo) => {
                    try { ventana.removeEventListener(EVENTOS.modeloListo, alLlegar); } catch { /* */ }
                    if (idPlazo !== null) (temporizador?.limpiar || clearTimeout)(idPlazo);
                    resolve(motivo);
                };
                function alLlegar(e) {
                    if (!gen.vigente()) return fin('cancelada');
                    const l = e?.detail?.lineage;
                    if (l && porLlegar.delete(l) && porLlegar.size === 0) fin('completo');
                }
                ventana.addEventListener(EVENTOS.modeloListo, alLlegar);
                const poner = temporizador?.poner || ((f, ms) => setTimeout(f, ms));
                idPlazo = poner(() => fin('techo'), techos.modelos);
                // La carga se pide DESPUÉS de estar escuchando: al revés se
                // pierde el modelo que llega rápido. Y se piden SOLO los que ni
                // siquiera están cargados: los que están sin Rosetta ya vienen.
                try {
                    if (faltantes.length) cargarModelos?.(faltantes);
                } catch (e) { fin('error-de-carga:' + e.message); }
            });
            const motivo = await espera;
            if (cancelado()) return cerrar('cancelada');
            if (motivo === 'techo') {
                // `onMissing = degrade`: se sigue con lo disponible.
                anotar(parte, 'modelos-no-llegaron', { faltantes: [...porLlegar], techoMs: techos.modelos });
            } else if (motivo !== 'completo') {
                anotar(parte, 'modelos-carga-interrumpida', { motivo });
            }
        }
        if (cancelado()) return cerrar('cancelada');
        marca('modelsReady');

        // ── E2b · MARCO ESPACIAL ───────────────────────────────────────────
        // ── E2c · REBIND ───────────────────────────────────────────────────
        // Va antes del marco porque el modelo base se identifica por su LINAJE y
        // hay que traducirlo al urn de hoy para encontrarlo entre los cargados.
        const rb = rebindDelDocumento(doc, modelConfig);
        if (rb.plan.faltan.length) anotar(parte, 'modelos-sin-resolver', { faltan: rb.plan.faltan });
        if (rb.cambiados.length) apuntar(parte, 'seedUrn-reescritos', { n: rb.cambiados.length });
        for (const [que, lista] of Object.entries(rb.perdidos)) {
            if (lista.length) anotar(parte, 'linajes-sin-urn', { donde: que, lineages: lista });
        }
        const objetos = resolverObjectSet(rb.doc, rb.plan, rosettaPorUrn, puentesIfc);
        for (const av of objetos.informe) anotar(parte, av.tipo, av);
        if (cancelado()) return cerrar('cancelada');
        marca('rebindDone');

        // ── E2b · MARCO ESPACIAL ───────────────────────────────────────────
        // Contra el MODELO BASE de la federación, no contra `viewer.model`.
        const base = offsetDelModeloBase(visor, rb.doc, rb.plan);
        const modeloBase = (visor.getAllModels?.() || [])
            .find((m) => (m.getData?.()?.urn || m.urn) === base.urn) || null;
        const epsilon = epsilonDelModelo(modeloBase);
        const marco = base.offset
            ? mismoMarcoEspacial(base.offset, doc.federation?.globalOffsetAtSave, epsilon)
            : { igual: false, motivo: base.motivo || 'sin offset del modelo base' };
        if (!marco.igual) {
            anotar(parte, 'MARCO_ESPACIAL_CAMBIADO', {
                guardado: doc.federation?.globalOffsetAtSave, actual: base.offset,
                urnBase: base.urn, epsilon, ...marco,
            });
        }

        // ── E3 · ESTADO LMV ────────────────────────────────────────────────
        // Se construye SOLO desde la allowlist, y si el marco cambió llega ya
        // podado: aplicar primero y corregir después significa que el usuario ve
        // la cámara equivocada durante un instante y la corrección puede fallar.
        let lmv = {};
        for (const campo of CAMPOS_LMV_PERSISTIBLES) {
            if (rb.doc.lmv?.[campo] !== undefined) lmv[campo] = rb.doc.lmv[campo];
        }
        lmv.objectSet = objetos.objectSet;
        if (!marco.igual) {
            const podado = podarEstadoEspacial(lmv);
            lmv = podado.lmv;
            apuntar(parte, 'estado-espacial-podado', { campos: podado.retirados });
        }

        // LAS TRES ESCUCHAS SE ABREN ANTES DE PEDIR NADA.
        //
        // La camara puede asentarse mucho antes de que terminen los filtros --lo
        // normal cuando la vista guardada esta cerca de la actual-- y el
        // fotograma final llega detras. Suscribirse en E9, cuando ya han pasado,
        // significa esperar hasta el techo a un evento que ocurrio hace rato y
        // degradar por nada. Es el mismo cuidado que en E2 con la carga de
        // modelos: primero se escucha, despues se pide.
        const inmediato = rb.doc.lmv?.viewport?.immediate === true;
        const oculto = documentoOculto ? documentoOculto() : false;
        const esperaLmv = esperarEvento(visor, EVENTOS_LMV.estadoRestaurado,
            { gen, techo: techos.estadoLmv, temporizador });
        const esperaCamara = (oculto || inmediato) ? null
            : esperarEvento(visor, EVENTOS_LMV.camaraLista,
                { gen, techo: techos.barreraVisual, temporizador });
        // LA GEOMETRÍA, POR MODELO. Se anota quién va terminando; en E9 se mira
        // quién de los REQUERIDOS falta. Suscribirse aquí y no en E9 es lo que
        // permite no perder al que termine mientras corren E4-E8.
        const geometriaVista = new Set();
        if (!oculto) {
            const alGeometria = (ev) => {
                const m = ev?.model || ev?.detail?.model || null;
                const u = m?.getData?.()?.urn || m?.urn || null;
                if (u) geometriaVista.add(u);
            };
            try {
                visor.addEventListener(EVENTOS_LMV.geometriaModelo, alGeometria);
                limpiezas.push(() => {
                    try { visor.removeEventListener(EVENTOS_LMV.geometriaModelo, alGeometria); }
                    catch { /* ya no está */ }
                });
            } catch { /* el visor no lo admite */ }
        }
        // EL FOTOGRAMA FINAL SE ESCUCHA YA, PERO SU TECHO NO ARRANCA AQUÍ.
        //
        // Los 8 s miden "cuánto tarda en dibujarse el fotograma", no "cuánto tarda
        // en cargarse la federación". Desde que E-5 arranca en `viewer-ready`, en
        // una federación fría los dos se solapaban: el reloj empezaba con la
        // geometría a medias y vencia siempre. Medido: colores aplicados a los
        // 4,8 s y geometría llegando hasta los 31,9 s.
        //
        // La escucha se abre ahora --para no perder el evento-- y el techo se
        // arma en E9, cuando el fotograma ya puede producirse. El techo se
        // aplica abortando una señal propia, así que la escucha se retira.
        const ctlFrame = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const genFrame = ctlFrame
            ? { vigente: () => gen.vigente() && !ctlFrame.signal.aborted, senal: ctlFrame.signal }
            : gen;
        const esperaFotograma = oculto ? null
            : esperarEvento(visor, EVENTOS_LMV.fotogramaFinal,
                { gen: genFrame, techo: ctlFrame ? 0 : techos.barreraVisual, temporizador, filtro: esFotogramaFinal });
        ventana.dispatchEvent(new CustomEvent(EVENTOS.restaurarLmv, { detail: lmv }));
        const rLmv = await esperaLmv;
        if (cancelado()) return cerrar('cancelada');
        if (!rLmv.ok && rLmv.motivo === 'techo') {
            anotar(parte, 'lmv-sin-confirmar', { techoMs: techos.estadoLmv });
        }
        marca('viewerStateRestored');

        if (!marco.igual) {
            // La cámara guardada no vale en este marco: se encuadra lo que hay.
            try { visor.fitToView?.(); } catch { /* el visor decide */ }
        }

        // ── E4 · VISIBILIDAD DE MODELOS ────────────────────────────────────
        // La persistencia va por linaje; el runtime necesita urns. Se deriva
        // aquí y no se guarda: dos fuentes de verdad para lo mismo divergen.
        if (rb.ocultosUrn.length || rb.activo) {
            ventana.dispatchEvent(new CustomEvent('viewer-model-visibility', {
                detail: { hiddenUrns: rb.ocultosUrn, activeUrn: rb.activo, generacion: gen.n },
            }));
        }
        if (cancelado()) return cerrar('cancelada');

        // ── E5 · EL INVENTARIO, SI TODAVÍA NO ESTÁ ───────────────────────
        //
        // La espera vive AQUÍ y no en el arranque. Desde que E-5 empieza en
        // `viewer-ready` —y empieza bien— llega a este punto antes de que
        // terminen de bajar los ~7 MB del inventario, y el preflight se
        // encontraba la mesa vacía. No podaba nada, que es lo seguro, pero
        // declaraba degradada una restauración que salía bien.
        //
        // Exigir el inventario para ARRANCAR habría bloqueado E0-E4, que no lo
        // necesitan para nada: los modelos, el rebind y el estado del LMV no
        // saben qué es una fila de inventario.
        //
        // El snapshot se relee FRESCO: el que vino en el entorno se tomó al
        // empezar, y si entonces no estaba, esa foto ya no vale.
        // VACÍO NO ES LO MISMO QUE NO CARGADO. Una obra puede tener cero
        // activos en inventario y estar perfectamente cargada. `null` es "todavía
        // no sé"; `[]` es "ya sé: no hay ninguno". Confundirlos hacía esperar 30 s
        // por algo que ya había llegado.
        const esSnapshot = (v) => Array.isArray(v);
        const leerInventario = () => {
            try {
                const f = inventarioFresco?.();
                if (esSnapshot(f)) return f;
            } catch { /* el lector no responde */ }
            return esSnapshot(inventario) ? inventario : null;
        };
        let filasInventario = leerInventario();
        if (filasInventario === null) {
            const rInv = await esperarEvento(ventana, EVENTOS.inventarioListo,
                { gen, techo: techos.inventario, temporizador });
            // LA ESPERA ES DE ESTA GENERACIÓN. Si mientras se esperaba se abrió
            // otra vista, aquí se sale: A no llega al preflight, no fija
            // filtros y no emite su `recalculate-filters`.
            if (cancelado()) return cerrar('cancelada');
            if (rInv.ok) filasInventario = leerInventario();
            else if (rInv.motivo === 'techo') {
                // No degrada por sí mismo: dice POR QUÉ no hubo inventario.
                // Lo que degrada sigue siendo `preflight-sin-inventario`, que
                // es la consecuencia real.
                apuntar(parte, 'inventario-no-llego', { techoMs: techos.inventario });
            }
        }
        marca('inventoryReady');

        // ── E5 · PREFLIGHT + FILTROS ───────────────────────────────────────
        // El preflight es PURO y mira el inventario vivo. No toca `_facetCache`
        // —que la Auditoría 02 demostró que queda obsoleta (R-08)— ni el visor,
        // ni emite eventos: sólo decide qué selección es segura.
        const urnsVivos = [...linajesDelFrente].map((l) => rb.plan.urnPorLinaje.get(l)).filter(Boolean);
        const seguro = resolverSeleccion({
            filas: filasInventario,
            propiedades: rb.doc.filters?.properties || [],
            selecciones: rb.doc.filters?.selections || {},
            alias: {},                                   // los alias ya vinieron aplicados en la normalización
            modelos: urnsVivos.map((urn) => ({ urn })),
        });
        for (const d of seguro.descartes) {
            if (d.tipo === 'sin-inventario') {
                // El preflight dice "sin inventario" en los dos casos, porque para
                // él son el mismo: no hay filas contra las que comprobar. Aquí sí se
                // distinguen, que es lo único que permite no castigar una obra vacía.
                if (esSnapshot(filasInventario)) apuntar(parte, 'preflight-inventario-vacio', { filas: 0 });
                else anotar(parte, 'preflight-sin-inventario');
            } else if (d.tipo !== 'alias') anotar(parte, 'preflight-' + d.tipo, d);
        }

        const esperaFiltros = esperarEvento(ventana, EVENTOS.filtrosListos,
            { gen, techo: techos.filtros, temporizador });
        // UN SOLO `recalculate-filters`. El camino v1 emite uno por cada
        // re-inyección con temporizador; aquí se fija el estado y se recalcula
        // una vez, que es lo que la batería mide.
        try {
            aplicarFiltros?.({
                properties: seguro.propiedades, selections: seguro.selecciones,
                colors: rb.doc.filters?.colors || {},
            });
        } catch (e) { anotar(parte, 'filtros-no-aplicados', { error: String(e.message || e) }); }
        ventana.dispatchEvent(new CustomEvent(EVENTOS.recalcular, {
            detail: {
                filterProperties: seguro.propiedades, filterSelections: seguro.selecciones,
                generacion: gen.n,
            },
        }));
        const rFiltros = await esperaFiltros;
        if (cancelado()) return cerrar('cancelada');
        if (!rFiltros.ok && rFiltros.motivo === 'techo') {
            anotar(parte, 'filtros-sin-confirmar', { techoMs: techos.filtros });
        }
        marca('filtersCalculated');

        // EL GUARDIÁN. Un conjunto vacío NO se aísla: `isolate([])` e
        // `isolate([-1])` son las dos formas de dejar la pantalla en blanco sin
        // un solo error en consola. Es el «modelo fantasma» de la Auditoría 02.
        const validos = rFiltros.ok ? (rFiltros.detalle?.validIds || rFiltros.detalle?.globalValidDbIds || null) : null;
        if (validos !== null && !sePuedeAislar(validos)) {
            anotar(parte, 'aislamiento-vacio-evitado', { n: Array.isArray(validos) ? validos.length : 0 });
            ventana.dispatchEvent(new CustomEvent('viewer-show-all', { detail: { generacion: gen.n } }));
        }

        // ── E6 · THEMING ───────────────────────────────────────────────────
        //
        // Las tres piezas del coloreado NO son iguales, y esto se midió leyendo
        // a sus oyentes uno por uno:
        //
        //   custom-colors-restored     el oyente sólo hace `setCustomValueColors`
        //                              —los puntitos del panel— y sólo existe si
        //                              el panel está montado. NO pinta. Lo que sí
        //                              importa es dejar `window._customValueColors`
        //                              puesto ANTES del theming, porque
        //                              `handleTheme` lo lee de ahí.
        //   ecd-source-tints-restore   el oyente del panel difiere 700 ms con un
        //                              `setTimeout` Y sólo existe si el panel está
        //                              montado. Por eso no se espera a ese: se
        //                              llama al pintor síncrono, `restoreSourceTints`,
        //                              que es lo que hace el camino v1 de App.jsx.
        //                              El evento se emite igualmente para que los
        //                              puntitos se pongan al día si hay panel.
        //   theme-property-bucket      SÍ difiere: `handleTheme` en Viewer.jsx
        //                              lanza `processGPUBuffer()`, que trocea en
        //                              lotes de 5.000 con `await setTimeout(0)`
        //                              entre ellos, y AL TERMINAR emite
        //                              `viewer-colors-applied`. Ese es el acuse
        //                              real, ya existe, y es el que se espera.
        //
        // Sin esta espera, `complete` se emitía con los colores todavía a medio
        // pintar. Un aviso permanente de «sin señal» no es una alternativa: o se
        // espera el acuse, o `complete` está mintiendo.
        const valores = rb.doc.filters?.valueColors || {};
        try { fijarColoresDeValor?.(valores); } catch { /* el visor los lee de window */ }
        ventana.dispatchEvent(new CustomEvent(EVENTOS.coloresValor, { detail: valores }));

        const tintes = { on: !!rb.doc.filters?.sourceColor?.on, customColors: rb.coloresFuente };
        try { aplicarTintesDeFuente?.(tintes); } catch (e) {
            anotar(parte, 'tintes-de-fuente-no-aplicados', { error: String(e.message || e) });
        }
        ventana.dispatchEvent(new CustomEvent(EVENTOS.coloresFuente, { detail: tintes }));

        const propsConColor = Object.entries(rb.doc.filters?.colors || {})
            .filter(([propId, activo]) => activo && seguro.propiedades.includes(propId))
            .map(([propId]) => propId);
        if (propsConColor.length) {
            // Un acuse por cada `theme-property-bucket` que se emite. El evento de
            // vuelta no dice de qué propiedad es, así que se cuentan: es lo que
            // el acuse existente permite, y contar de menos dejaría pasar a E9
            // con colores a medias.
            let acuses = 0;
            const esperaColores = new Promise((resolve) => {
                let idPlazo = null;
                const fin = (motivo) => {
                    try { ventana.removeEventListener(EVENTOS.coloresAplicados, alLlegar); } catch { /* */ }
                    if (idPlazo !== null) (temporizador?.limpiar || clearTimeout)(idPlazo);
                    resolve(motivo);
                };
                function alLlegar() {
                    if (!gen.vigente()) return fin('cancelada');
                    if (++acuses >= propsConColor.length) fin('completo');
                }
                ventana.addEventListener(EVENTOS.coloresAplicados, alLlegar);
                const poner = temporizador?.poner || ((f, ms) => setTimeout(f, ms));
                idPlazo = poner(() => fin('techo'), techos.theming);
                for (const propId of propsConColor) {
                    const vals = seguro.selecciones[propId] || [];
                    ventana.dispatchEvent(new CustomEvent(EVENTOS.temaPropiedad, {
                        detail: {
                            propId, values: vals.length ? vals : null, active: true,
                            paletteName: 'Classic Tandem', customColors: valores,
                        },
                    }));
                }
            });
            const motivoColores = await esperaColores;
            if (cancelado()) return cerrar('cancelada');
            if (motivoColores === 'techo') {
                // `handleTheme` no acusa cuando no encuentra el bucket de esa
                // propiedad: sale sin pintar y sin decir nada. Se degrada y se
                // nombra, en vez de dar por buenos unos colores que no están.
                anotar(parte, 'theming-sin-acuse', {
                    propiedades: propsConColor, acuses, techoMs: techos.theming,
                });
            }
        }
        if (cancelado()) return cerrar('cancelada');
        marca('colorsApplied');

        // ── E7 · INVENTARIO ────────────────────────────────────────────────
        // Va por el dueño canónico (`inventoryConfig`), así que se aplica esté
        // el panel montado o no. El evento es sólo para que el grid, si está
        // abierto, se entere sin tener que sondear.
        const cfg = rb.doc.inventory || {};
        try {
            const aplicado = aplicarInventario?.({
                columns: cfg.columns, groupBy: cfg.groupBy ?? null,
                totals: cfg.totals || [], assetsOnly: !!cfg.assetsOnly,
            });
            if (aplicado && aplicado.columnasPerdidas?.length) {
                anotar(parte, 'inventario-columnas-desaparecidas', { columnas: aplicado.columnasPerdidas });
            }
        } catch (e) { anotar(parte, 'inventario-no-aplicado', { error: String(e.message || e) }); }
        ventana.dispatchEvent(new CustomEvent(EVENTOS.inventario, { detail: cfg.columns ?? null }));
        if (cancelado()) return cerrar('cancelada');
        marca('inventoryApplied');

        // ── E8 · EXTENSIONES ───────────────────────────────────────────────
        // Sólo lo aprobado. Section y AEC Levels van dentro del bloque LMV y no
        // se repiten aquí; 4D, 5D, AR y Civil quedan fuera de E-5 a propósito.
        const pk = rb.doc.extensions?.pkHeatmap || null;
        if (pk) ventana.dispatchEvent(new CustomEvent(EVENTOS.heatmapPk, { detail: pk }));
        if (cancelado()) return cerrar('cancelada');

        // ── E9 · BARRERA FINAL ─────────────────────────────────────────────
        // `complete` no significa «se pidió todo»: significa que la cámara está
        // quieta y que hay un fotograma dibujado con la vista puesta. Es la
        // señal que hoy no existe y por la que nadie puede encadenar nada a una
        // restauración sin adivinar.
        if (oculto) {
            // Una pestaña oculta no dibuja: la cámara y el fotograma no van a
            // llegar. Esperar aquí sería colgarse hasta el techo por algo que ni
            // siquiera es un fallo. Ni siquiera se abrieron las escuchas.
            apuntar(parte, 'barrera-visual-omitida', { motivo: 'pestaña oculta' });
        } else {
            // PRIMERO LA GEOMETRÍA DE LOS REQUERIDOS, DESPUÉS EL FOTOGRAMA.
            //
            // Son dos esperas distintas y mezclarlas fue el error: cargar la
            // geometría de cinco modelos tarda decenas de segundos, dibujar el
            // fotograma tarda cientos de milisegundos. Con un solo techo de 8 s
            // para las dos, una federación fría degradaba siempre.
            //
            // Se esperan SÓLO los requeridos: que un modelo del frente que la
            // vista no nombra siga cargando no es asunto de esta restauración.
            const urnsRequeridos = requeridos
                .map((l) => rb.plan.urnPorLinaje.get(l)).filter(Boolean);
            const geometriaPendiente = () => {
                const porUrn = new Map();
                for (const m of visor.getAllModels?.() || []) {
                    const u = m?.getData?.()?.urn || m?.urn || null;
                    if (u) porUrn.set(u, m);
                }
                return urnsRequeridos.filter((u) => !geometriaLista(porUrn.get(u), geometriaVista));
            };
            if (geometriaPendiente().length) {
                const rGeo = await esperarEvento(visor, EVENTOS_LMV.geometriaModelo, {
                    gen, techo: techos.modelos, temporizador,
                    filtro: () => geometriaPendiente().length === 0,
                });
                if (cancelado()) return cerrar('cancelada');
                if (!rGeo.ok && rGeo.motivo === 'techo') {
                    anotar(parte, 'geometria-incompleta', {
                        pendientes: geometriaPendiente().length, techoMs: techos.modelos,
                    });
                }
            }
            marca('geometryReady');

            // AHORA SÍ EL FOTOGRAMA FINAL, y su techo empieza a contar aquí: en
            // este punto la geometría de lo que la vista pide ya está, así que si
            // el fotograma no llega en 8 s es que de verdad no llega.
            let idTechoFrame = null;
            if (ctlFrame) {
                const ponerTecho = temporizador?.poner || ((f, ms) => setTimeout(f, ms));
                idTechoFrame = ponerTecho(() => {
                    try { ctlFrame.abort(); } catch { /* sin señal */ }
                }, techos.barreraVisual);
            }
            const rFrame = await esperaFotograma;
            if (idTechoFrame !== null) (temporizador?.limpiar || clearTimeout)(idTechoFrame);
            if (cancelado()) return cerrar('cancelada');
            if (!rFrame.ok) {
                anotar(parte, 'sin-fotograma-final', { techoMs: techos.barreraVisual });
            }
            // LA CÁMARA SE CONSULTA DESPUÉS Y SIN VOLVER A ESPERAR. Si hay un
            // fotograma final dibujado, la cámara ya está donde va a estar: el LMV
            // no lo emite antes. `cameraTransitionComplete` sólo llega si HUBO
            // transición, y en el caso normal --abrir una vista parecida a lo que
            // ya se ve-- la cámara no se mueve y ese evento no se emite nunca.
            // Medido en el visor real: cero disparos. Informativo, nunca degrada,
            // y no se gastan 8 s esperando algo que puede legítimamente no existir.
            if (inmediato) {
                apuntar(parte, 'camara-inmediata');
            } else {
                const rCam = await Promise.race([esperaCamara, Promise.resolve({ ok: false, motivo: 'sin-transicion' })]);
                if (!rCam.ok) apuntar(parte, 'camara-sin-transicion', { motivo: rCam.motivo });
            }
            marca('cameraComplete');
            marca('finalFrame');
        }

        return cerrar(parte.estado === 'completa' ? 'completa' : 'degradada');
    } catch (e) {
        if (e instanceof Cancelada || !gen.vigente()) return cerrar('cancelada');
        fallar(parte, 'excepcion', { error: String(e && e.message || e) });
        return cerrar('fallida');
    }
}
