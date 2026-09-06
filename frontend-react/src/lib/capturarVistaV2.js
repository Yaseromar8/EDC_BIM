/**
 * E-6 · EL CAPTURADOR DE SAVED VIEWS v2.
 *
 * La contraparte de `restaurarVistaV2`: convierte el espacio de trabajo que hay
 * ahora mismo en un documento v2 que el servidor acepta y que el restaurador
 * sabe volver a montar.
 *
 * POR QUÉ UN MÓDULO Y NO OTRO TROZO DE App.jsx
 * --------------------------------------------
 * `handleSaveView` —el camino v1— compone el documento dentro del componente,
 * mezclado con estado de React, y por eso nadie ha podido probarlo nunca sin
 * montar la aplicación entera. Aquí no hay React: entran datos, sale un
 * documento y un informe. La batería lo ejecuta con dobles, en milisegundos.
 *
 * LO QUE ESTE MÓDULO **NO** HACE
 * ------------------------------
 * No pide nada por red, no toca el visor, no lee `window` y no decide si el
 * documento se guarda. Todo lo que necesita llega por el entorno, igual que en
 * el restaurador, para que la batería pueda mentirle sobre cualquier pieza.
 *
 * LAS TRES TRADUCCIONES QUE JUSTIFICAN QUE EXISTA
 * ----------------------------------------------
 *   1. URN -> LINAJE.  Lo que el runtime maneja es el URN, que lleva la versión
 *      dentro; lo que se persiste es el linaje, que sobrevive a actualizar el
 *      modelo. Afecta a `models[]`, a `hiddenModelLineages` y —el caso que más
 *      cuesta ver— a las selecciones de `Standard::Sources`, que no seleccionan
 *      valores de una columna: seleccionan MODELOS.
 *   2. dbId -> externalId.  El `objectSet` del LMV son dbIds, que cambian al
 *      reprocesar el modelo. Se guarda además la identidad estable, y el
 *      restaurador la usa cuando la versión ya no es la misma.
 *   3. globalOffset DEL MODELO BASE.  No de `viewer.model`, que apunta al
 *      último modelo cargado. El marco espacial de una federación lo fija el
 *      PRIMERO que carga y lo heredan los demás; comparar contra otro es
 *      comparar contra un valor heredado.
 */

import {
    SCHEMA_VERSION, CAMPOS_LMV_PERSISTIBLES, capturarLmv, capturarElementos,
    PROP_SOURCES, linajeDeUrn, esLinaje, esPersistibleV2, contieneUrnDeVersion,
} from './savedViewV2.js';

/** Normaliza un urn como lo hace el resto del visor (base64url sin relleno). */
const normUrn = (u) => String(u || '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function nuevoInforme() { return []; }
function apunte(informe, tipo, datos = {}) { informe.push({ ...datos, tipo }); return informe; }

/**
 * El índice del frente: de URN (en cualquiera de sus formas) a la ficha del
 * modelo. Se indexa por las dos formas porque el URN viaja normalizado en unos
 * sitios y crudo en otros, y una comparación de strings que falla aquí se
 * traduce en un modelo sin linaje, que es un documento no persistible.
 */
export function indicePorUrn(modelConfig) {
    const idx = new Map();
    for (const m of modelConfig || []) {
        if (!m || !m.urn) continue;
        idx.set(String(m.urn).trim(), m);
        idx.set(normUrn(m.urn), m);
    }
    return idx;
}

/** El linaje de una ficha de modelo, con los tres nombres que usa el producto. */
export const linajeDeFicha = (m) => (m && (m.lineage || m.item_id || m.itemId)) || null;

/**
 * EL MODELO BASE DE LA FEDERACIÓN, y de dónde sale su `globalOffset`.
 *
 * `order` es el orden de carga, y el modelo `order === 0` es el que fijó el
 * marco espacial: el LMV se lo da al primero y los siguientes lo heredan
 * (`applyRefPoint: true` más `baseOffsetRef` en Viewer.jsx). Por eso el offset
 * se toma de ÉL y no de `viewer.model`, que es simplemente el último modelo que
 * el visor cargó y puede ser cualquiera de los cinco.
 *
 * Si el base no está o no declara offset, se dice: `globalOffsetAtSave: null`
 * es un valor legítimo —el restaurador lo trata como «la vista no guardó
 * marco»— y es infinitamente mejor que guardar el de otro modelo.
 */
export function offsetDelModeloBase(modelosOrdenados) {
    const base = modelosOrdenados && modelosOrdenados[0];
    if (!base) return { offset: null, motivo: 'no hay ningún modelo cargado' };
    const datos = base.modelo?.getData?.() || {};
    const offset = datos.globalOffset || null;
    if (!offset) {
        return { offset: null, urn: base.urn, lineage: base.lineage, motivo: 'el modelo base no declara globalOffset' };
    }
    return {
        offset: { x: Number(offset.x), y: Number(offset.y), z: Number(offset.z) },
        urn: base.urn, lineage: base.lineage,
    };
}

/**
 * `Standard::Sources` AL REVÉS QUE AL RESTAURAR.
 *
 * En runtime esa selección viaja con el URN vigente —así la produce el panel y
 * así la consume el motor de facetas—. Al guardar se traduce a linaje, porque
 * un URN persistido caduca en cuanto alguien sube una versión nueva del modelo.
 * El resto de propiedades no se toca: sus valores son texto del modelo, no
 * identidades.
 */
export function seleccionesParaGuardar(selecciones, urnALinaje, informe) {
    const salida = {};
    for (const propId of Object.keys(selecciones || {})) {
        const valores = selecciones[propId];
        if (propId !== PROP_SOURCES) { salida[propId] = Array.isArray(valores) ? [...valores] : valores; continue; }
        const traducidos = [];
        for (const v of valores || []) {
            if (esLinaje(v)) { traducidos.push(v); continue; }      // ya venía traducido
            const linaje = urnALinaje.get(String(v).trim()) || urnALinaje.get(normUrn(v)) || linajeDeUrn(v);
            if (linaje) traducidos.push(linaje);
            else apunte(informe, 'sources-sin-linaje', { valor: String(v).slice(-24) });
        }
        salida[propId] = traducidos;
    }
    return salida;
}

/**
 * UN MAPA INDEXADO POR URN NO SE PUEDE PERSISTIR.
 *
 * `sourceColor.custom` viaja en runtime indexado por el URN vigente --así lo
 * escribe el panel de Sources-- y el documento v2 lo quiere por linaje: el
 * validador rechaza cualquier clave que lleve un URN con versión dentro, y con
 * razón, porque al día siguiente de subir una versión esa clave no encuentra
 * nada. El restaurador ya espera linajes y los traduce de vuelta al URN de hoy
 * (`restaurarVistaV2`, "Los colores por fuente también van por linaje").
 */
export function mapaPorLinaje(mapa, urnALinaje, informe, donde) {
    const salida = {};
    for (const clave of Object.keys(mapa || {})) {
        if (esLinaje(clave)) { salida[clave] = mapa[clave]; continue; }
        const linaje = urnALinaje.get(clave.trim()) || urnALinaje.get(normUrn(clave)) || linajeDeUrn(clave);
        if (linaje) { salida[linaje] = mapa[clave]; continue; }
        if (contieneUrnDeVersion(clave)) {
            // No se guarda una clave que caduca, y tampoco se guarda callando.
            apunte(informe, 'clave-urn-sin-linaje', { donde, clave: clave.slice(-16) });
            continue;
        }
        salida[clave] = mapa[clave];
    }
    return salida;
}

/**
 * Los colores POR VALOR se indexan `propId::valor`. Casi todos los valores son
 * texto del modelo y no caducan; la excepción es `Standard::Sources`, cuyos
 * "valores" son modelos. Una clave así lleva un URN dentro y hace el documento
 * no persistible, así que se deja fuera y se dice cuál.
 *
 * No se traduce a linaje a propósito: quien pinta esos colores lee
 * `window._customValueColors` con el URN vigente, y escribir ahí un linaje
 * daría un color que no encuentra a nadie -- perder el color EN SILENCIO, que
 * es peor que perderlo diciendo. El coloreado de modelos tiene su propio camino
 * (`sourceColor`), que sí viaja entero.
 */
export function coloresDeValorPersistibles(valueColors, informe) {
    const salida = {};
    for (const clave of Object.keys(valueColors || {})) {
        if (contieneUrnDeVersion(clave)) {
            apunte(informe, 'color-de-valor-con-urn', { clave: clave.slice(0, 40) });
            continue;
        }
        salida[clave] = valueColors[clave];
    }
    return salida;
}

/**
 * CAPTURA.
 *
 * @param {object} entorno
 *   visor             el visor vivo; sólo se le pide `getAllModels()`
 *   estadoLmv         lo que devuelve `viewer.getState({viewport, renderOptions, objectSet})`
 *   modelConfig       la lista de modelos del frente (urn + linaje + versión)
 *   ocultosUrn        los urns que el usuario tiene apagados
 *   rosettaPorUrn     urn -> { dbId: externalId }
 *   filtros           { properties, selections, colors, valueColors, sourceColor }
 *   inventario        el triestado canónico de `inventoryConfig`
 *   pkHeatmap         el mapa de avance por PK, si lo hay
 *   appVersion, reloj
 * @returns {{doc, informe, validacion}}
 */
export function capturarVistaV2(entorno = {}) {
    const {
        visor, estadoLmv = null, modelConfig = [], ocultosUrn = [],
        rosettaPorUrn = {}, filtros = {}, inventario = null, pkHeatmap = null,
        appVersion = null, reloj = null,
    } = entorno;

    const informe = nuevoInforme();
    const ahora = reloj || (() => new Date().toISOString());
    const idx = indicePorUrn(modelConfig);
    const ocultos = new Set((ocultosUrn || []).map(normUrn));

    // ── LOS MODELOS, EN SU ORDEN DE CARGA ──────────────────────────────────
    // El orden lo da el visor, no la configuración del frente: `order` tiene que
    // significar «el que fijó el marco va primero», y eso sólo lo sabe quien los
    // cargó.
    const modelos = [];
    for (const m of (visor?.getAllModels?.() || [])) {
        const urn = m?.getData?.()?.urn || m?.urn || null;
        if (!urn) { apunte(informe, 'modelo-sin-urn'); continue; }
        const ficha = idx.get(String(urn).trim()) || idx.get(normUrn(urn)) || null;
        const lineage = linajeDeFicha(ficha) || linajeDeUrn(urn);
        if (!lineage) {
            // Sin linaje el documento NO es persistible, y es correcto que lo
            // sea: un modelo que no se puede reencontrar no se puede restaurar.
            apunte(informe, 'modelo-sin-linaje', { urn: normUrn(urn).slice(-16) });
        }
        modelos.push({
            modelo: m, urn, lineage,
            versionAtSave: ficha?.version_number ?? ficha?.versionNumber ?? null,
        });
    }
    if (!modelos.length) apunte(informe, 'sin-modelos-cargados');

    const models = modelos.map((x, i) => ({
        lineage: x.lineage,
        urnAtSave: x.urn,
        versionAtSave: x.versionAtSave,
        visible: !ocultos.has(normUrn(x.urn)),
        order: i,
    }));

    // ── EL MARCO ESPACIAL, DEL MODELO BASE ─────────────────────────────────
    const base = offsetDelModeloBase(modelos);
    if (!base.offset) apunte(informe, 'sin-global-offset', { motivo: base.motivo });

    // ── EL ESTADO DEL LMV, POR ALLOWLIST ───────────────────────────────────
    // `capturarLmv` es el mismo que aprobó E-2: lo que no está en la lista se
    // registra en `ignorados` en vez de colarse o desaparecer en silencio.
    const { doc: lmv, ignorados } = capturarLmv(estadoLmv || {});
    if (ignorados.length) apunte(informe, 'lmv-fuera-de-allowlist', { claves: ignorados });
    for (const clave of ['cutplanes', 'floorGuid']) {
        if (lmv[clave] === undefined) apunte(informe, 'lmv-sin-' + clave);
    }

    // ── IDENTIDAD ESTABLE DE LOS ELEMENTOS ─────────────────────────────────
    // El `objectSet` se conserva tal cual —sirve mientras la versión no cambie,
    // y es lo que el LMV entiende— y ADEMÁS se guarda su traducción a
    // externalIds. El restaurador usa una u otra según haya cambiado la versión.
    // EL `seedUrn` SE NORMALIZA AL URN EXACTO DEL MODELO CARGADO.
    //
    // De el depende que al restaurar se tome el camino NATIVO --misma version,
    // se aplican los dbIds tal cual-- o el de resolver por externalId. E-5 busca
    // el modelo comparando `seedUrn` con el urn vigente CARACTER A CARACTER; si
    // el serializador del LMV escribiera el urn con otra codificacion, no
    // encontraria el modelo, asumiria version cambiada y resolveria por
    // externalId sin necesidad. Medido hoy: el LMV entrega el mismo string que
    // `model.getData().urn`, asi que esto no cambia nada en el caso normal --y
    // por eso mismo la garantia deja de depender de que siga siendo asi.
    const urnExactoPorNormalizado = new Map();
    for (const x of modelos) urnExactoPorNormalizado.set(normUrn(x.urn), x.urn);

    if (Array.isArray(lmv.objectSet) && lmv.objectSet.length) {
        lmv.objectSet = lmv.objectSet.map((entrada) => {
            if (!entrada) return entrada;
            if (entrada.seedUrn) {
                const exacto = urnExactoPorNormalizado.get(normUrn(entrada.seedUrn));
                if (exacto) entrada = { ...entrada, seedUrn: exacto };
                else apunte(informe, 'objectset-sin-modelo-cargado',
                    { seedUrn: normUrn(entrada.seedUrn).slice(-16) });
            }
            const urn = entrada.seedUrn || (modelos.length === 1 ? modelos[0].urn : null);
            const rosetta = urn ? (rosettaPorUrn[urn] || rosettaPorUrn[normUrn(urn)]) : null;
            const cuantos = (entrada.id?.length || 0) + (entrada.hidden?.length || 0) + (entrada.isolated?.length || 0);
            if (!cuantos) return entrada;                 // nada que identificar
            if (!rosetta) {
                apunte(informe, 'elementos-sin-rosetta', { urn: urn ? normUrn(urn).slice(-16) : null, elementos: cuantos });
                return entrada;
            }
            const elements = capturarElementos(entrada, rosetta);
            const traducidos = elements.selected.length + elements.hidden.length + elements.isolated.length;
            if (traducidos < cuantos) {
                apunte(informe, 'elementos-parcialmente-identificados', { traducidos, total: cuantos });
            }
            return { ...entrada, elements };
        });
    }

    // ── FILTROS ────────────────────────────────────────────────────────────
    const urnALinaje = new Map();
    for (const m of modelConfig || []) {
        const l = linajeDeFicha(m);
        if (!l || !m.urn) continue;
        urnALinaje.set(String(m.urn).trim(), l);
        urnALinaje.set(normUrn(m.urn), l);
    }
    // LOS MODELOS OCULTOS, ACOTADOS A LOS DE ESTA CAPTURA.
    //
    // `hiddenModelUrns` es una lista que se arrastra entre vistas y puede traer
    // modelos de OTRO frente --medido: una vista v1 dejo tres, y dos no existen
    // en 1_CANAL--. Persistirlos no oculta nada al restaurar, porque no hay urn
    // que darles: solo hace que el restaurador degrade con `linajes-sin-urn`.
    //
    // Se guarda lo que esta vista puede volver a apagar: los linajes que estan
    // en `models[]`. Lo que se deja fuera se dice, no se calla.
    const linajesDeLaCaptura = new Set(models.map((m) => m.lineage).filter(Boolean));
    const hiddenModelLineages = [];
    const ocultosAjenos = [];
    for (const u of ocultosUrn || []) {
        const l = urnALinaje.get(String(u).trim()) || urnALinaje.get(normUrn(u)) || linajeDeUrn(u);
        if (!l) { apunte(informe, 'oculto-sin-linaje', { urn: normUrn(u).slice(-16) }); continue; }
        if (!linajesDeLaCaptura.has(l)) { ocultosAjenos.push(l); continue; }
        if (!hiddenModelLineages.includes(l)) hiddenModelLineages.push(l);
    }
    if (ocultosAjenos.length) {
        apunte(informe, 'ocultos-fuera-de-la-captura', { lineages: ocultosAjenos });
    }

    const doc = {
        schemaVersion: SCHEMA_VERSION,
        lmv,
        models,
        federation: {
            // El producto no tiene hoy un «modelo activo» de federación: lo que
            // App.jsx llama `activeModelUrn` es el identificador del FRENTE. Se
            // deja en null a propósito en vez de inventar uno; el restaurador ya
            // trata null como «no hay preferencia».
            activeLineage: null,
            globalOffsetAtSave: base.offset,
        },
        filters: {
            properties: Array.isArray(filtros.properties) ? [...filtros.properties] : [],
            selections: seleccionesParaGuardar(filtros.selections, urnALinaje, informe),
            colors: { ...(filtros.colors || {}) },
            valueColors: coloresDeValorPersistibles(filtros.valueColors, informe),
            sourceColor: {
                on: !!(filtros.sourceColor && filtros.sourceColor.on),
                custom: mapaPorLinaje((filtros.sourceColor && filtros.sourceColor.custom) || {},
                    urnALinaje, informe, 'sourceColor.custom'),
            },
            hiddenModelLineages,
            // `hiddenModelUrnsV1` NO SE ESCRIBE. Es el campo de tránsito de la
            // conversión v1->v2 y el servidor rechaza el documento que lo trae:
            // guardar identidad de versión es justo lo que v2 vino a quitar.
        },
        inventory: inventario ? {
            columns: inventario.columns,
            groupBy: inventario.groupBy ?? null,
            totals: [...(inventario.totals || [])],
            assetsOnly: !!inventario.assetsOnly,
        } : undefined,
        extensions: { pkHeatmap: pkHeatmap || null },
        meta: { appVersion: appVersion || null, capturedAt: ahora() },
    };
    if (doc.inventory === undefined) {
        delete doc.inventory;
        apunte(informe, 'inventario-sin-dato');
    }

    // ── LA MISMA REGLA QUE EL SERVIDOR, ANTES DE SALIR ─────────────────────
    // No se «limpia» nada: si el documento no es persistible se dice aquí, y
    // quien llama decide. Validar en el cliente no sustituye al servidor —que
    // vuelve a validar— pero evita mandar a la red algo que ya se sabe malo.
    const validacion = esPersistibleV2(doc);
    return { doc, informe, validacion };
}

/** Las claves del LMV que este capturador puede persistir. Para la batería. */
export const CLAVES_LMV = CAMPOS_LMV_PERSISTIBLES;
