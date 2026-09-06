/**
 * savedViewV2 — EL CONTRATO DE UNA SAVED VIEW, Y NADA MAS.
 * ---------------------------------------------------------------------------
 * Lógica pura: no importa React, no toca el visor, no emite eventos y no lee
 * globales. Todo entra por parámetro. Así se puede probar entera con `node`
 * antes de que nada de esto se acerque a un modelo cargado.
 *
 * Cubre E-2a (esquema y allowlist), E-2b (linaje -> URN vigente), E-2c
 * (identidad de elemento) y E-2e (compatibilidad v1 y parte de daños).
 */

export const SCHEMA_VERSION = 2;

// ═══════════════════════════════════════════════════════════════════════════
// E-2a · ALLOWLIST DEL ESTADO NATIVO DEL LMV
// ═══════════════════════════════════════════════════════════════════════════
//
// `viewer.getState()` sin filtro devuelve TODO lo que el LMV y sus extensiones
// calculan. Guardarlo verbatim tiene un problema que no se ve hasta que ocurre:
// una extensión futura añade una clave y esa clave entra al contrato sin que
// nadie lo haya decidido, y se restaura en la máquina de otro.
//
// Y filtrarlo como hoy tiene el problema contrario, este ya medido: la llamada
// actual `getState({viewport, renderOptions, objectSet})` hace que `applyFilter`
// BORRE `cutplanes` y las cinco claves `floor*` --el estado de AEC Levels-- que
// el motor SÍ había calculado. El usuario pone una sección, guarda la vista, y
// la sección no vuelve. Nunca estuvo rota: se tiraba al guardar.
//
// La allowlist resuelve las dos mitades: se deja de borrar lo útil sin abrir la
// puerta a lo desconocido. Lo que no está en la lista se REGISTRA, para que
// añadirlo sea una decisión y no un descuido.
export const CAMPOS_LMV_PERSISTIBLES = Object.freeze([
    'viewport',          // cámara, proyección, FOV (solo si es perspectiva), pivot
    'objectSet',         // selección, ocultos, aislados, explode, seedUrn
    'renderOptions',
    'cutplanes',         // HOY SE PIERDE
    'floorGuid',         // AEC Levels: la planta activa. HOY SE PIERDE
    'floorOffsetMin',
    'floorOffsetMax',
    'floorLineageUrn',
    'floorVersionUrn',
]);

// Excluidos a propósito, con su motivo. Se documentan para que la próxima
// persona no tenga que deducirlo:
//   seedURN  redundante con `models[]`, que además sobrevive al versionado
//   version  versión del formato de estado del LMV; nuestro versionado es `schemaVersion`
//   autocam  estado interno de la herramienta de navegación, no del documento

/** Parte el estado del LMV en lo que se persiste y lo que se deja fuera. */
export function capturarLmv(estadoCompleto) {
    const doc = {};
    const ignorados = [];
    for (const clave of Object.keys(estadoCompleto || {})) {
        if (CAMPOS_LMV_PERSISTIBLES.includes(clave)) doc[clave] = estadoCompleto[clave];
        else ignorados.push(clave);
    }
    return { doc, ignorados };
}

// ═══════════════════════════════════════════════════════════════════════════
// E-2e · ALIAS DE propId
// ═══════════════════════════════════════════════════════════════════════════
//
// Las tres vistas más antiguas de producción guardan `filterSelections` con
// claves que el código de hoy ya no produce. Medido en la Auditoría 02 sobre
// `03_AVANCE_MARZO01`: el único propId con selección real era
// `__category__::Category`, y por eso la vista dejaba los tres modelos en
// `isolate([-1])`.
//
// Esta tabla es DECLARATIVA y va en el repositorio, no en la base: una
// traducción de identificadores es código, se revisa en un diff y se revierte
// con git. En una tabla sería un dato que nadie audita.
/**
 * El propId que selecciona MODELOS, no valores de una columna. Se nombra aquí
 * porque el contrato v2 le da un espacio de identidad propio: linaje.
 */
export const PROP_SOURCES = 'Standard::Sources';

export const ALIAS_PROPID = Object.freeze({
    'Tandem Category': 'Standard::Revit Category',
    '__category__::Category': 'Standard::Revit Category',
    'Standard::Sources': 'Standard::Sources',
});

// NO HAY TABLA DE ALIAS DE VALORES, y su ausencia es deliberada.
//
// Las vistas viejas guardan `Revit Muros`, `Revit Suelos`, `Revit Vegetación` y
// el inventario de hoy tiene `Walls`, `Floors`, `Planting`. Traducirlos parece
// obvio y sería una conjetura: no he encontrado en el repositorio ninguna
// versión que produjera esos valores, así que no puedo demostrar que sean el
// mismo valor canónico y no dos cosas distintas que se parecen. La política
// acordada es clara: alias solo con evidencia histórica; sin ella, degradar
// honestamente. Una vista que se abre incompleta y lo dice es mejor que una que
// se abre inventando.

// ═══════════════════════════════════════════════════════════════════════════
// E-2e · DETECCION Y NORMALIZACION v1 -> v2
// ═══════════════════════════════════════════════════════════════════════════

export const esDocumentoV2 = (fila) =>
    !!fila && (fila.schema_version === 2 || fila.schemaVersion === 2 || (!!fila.state && !fila.viewer_state));

/**
 * Convierte una fila v1 en un documento v2 EN MEMORIA. No escribe en la base:
 * una vista se migra cuando su autor la actualiza, no porque alguien la abriera.
 *
 * @returns {{ doc, informe }}
 */
/**
 * El LINAJE que hay dentro de un URN de versión. `null` si no se puede leer.
 *
 * No es una conjetura: el URN de APS lleva el mismo identificador que el linaje,
 * y solo cambia el tipo de recurso y la versión pegada al final.
 *
 *     base64url  ->  urn:adsk.wipprod:fs.file:vf.ub2xfjDiRByamkMzvCD7zg?version=50
 *     linaje         urn:adsk.wipprod:dm.lineage:ub2xfjDiRByamkMzvCD7zg
 *
 * Comprobado sobre los 17 modelos de `model_config`: 17 de 17 coinciden, hub
 * incluido. Importa porque una vista de marzo guardó el URN de la v50 y hoy el
 * frente sirve la v51: `model_config` indexa por el urn VIGENTE, así que buscar
 * por URN no encuentra nada. Por el linaje sí.
 */
export function linajeDeUrn(urn) {
    if (typeof urn !== 'string' || !urn) return null;
    let claro = urn;
    if (!claro.startsWith('urn:')) {
        try {
            const b64 = claro.replace(/-/g, '+').replace(/_/g, '/');
            claro = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
        } catch { return null; }
    }
    const m = /^urn:(adsk\.[a-z0-9]+):fs\.file:vf\.([^?]+)/.exec(claro);
    return m ? `urn:${m[1]}:dm.lineage:${m[2]}` : null;
}

/**
 * URN guardado -> linaje del frente de HOY. `null` si ese modelo ya no está.
 *
 * Dos pasos, y el segundo es el que evita inventar: primero se mira el índice
 * del frente por si el URN sigue siendo el vigente; si no, se DEDUCE el linaje
 * del propio URN y solo se acepta si ese linaje EXISTE en el frente. Deducir sin
 * confirmar daría por buena la identidad de un modelo que ya no está cargado.
 */
export function linajeDelFrente(urn, linajePorUrn, linajesDelFrente) {
    const directo = linajePorUrn.get(String(urn || '').trim());
    if (directo) return directo;
    const deducido = linajeDeUrn(urn);
    return deducido && linajesDelFrente.has(deducido) ? deducido : null;
}

/**
 * Copia las selecciones traduciendo SOLO `Standard::Sources` de URN a linaje.
 *
 * Lo que no resuelve se CAE de la selección y se anota. Guardarlo crudo metería
 * un URN con versión dentro de un documento v2 —justo lo que el invariante
 * prohíbe—, y silenciarlo haría creer que la vista se restauró entera.
 */
export function seleccionesNormalizadas(selecciones, linajePorUrn, linajesDelFrente, informe = []) {
    const salida = {};
    for (const propId of Object.keys(selecciones || {})) {
        const valores = selecciones[propId];
        if (propId !== PROP_SOURCES || !Array.isArray(valores)) {
            salida[propId] = valores;
            continue;
        }
        const traducidos = [];
        const perdidos = [];
        for (const v of valores) {
            if (esLinaje(v)) { traducidos.push(v); continue; }   // ya venía traducido
            const linaje = linajeDelFrente(v, linajePorUrn, linajesDelFrente);
            if (linaje) traducidos.push(linaje);
            else perdidos.push(v);
        }
        if (perdidos.length) {
            informe.push({ tipo: 'v1-source-sin-linaje', perdidos, conservados: traducidos.length });
        }
        // Una selección de Sources que se queda vacía se OMITE: una propiedad
        // activa con selección vacía es lo que produce el conjunto vacío que
        // acaba en `isolate([-1])` (Auditoría 02, modelo fantasma).
        if (traducidos.length) salida[propId] = traducidos;
    }
    return salida;
}

export function normalizarV1aV2(fila, modelConfig = null) {
    const informe = [];
    const vs = fila?.viewer_state || {};
    const fs = fila?.filter_state || {};
    const cfg = fila?.config || {};
    // URN vigente -> linaje. Es el único sentido que hace falta al LEER una v1:
    // lo que guardó fue el URN de aquel día, y hay que averiguar de qué modelo
    // era. Sin `model_config` no se puede, y entonces no se traduce nada: es
    // preferible un documento que no se puede guardar a uno que dice linajes
    // que nadie ha comprobado.
    const linajePorUrn = new Map();
    const linajesDelFrente = new Set();
    for (const m of modelConfig || []) {
        const linaje = m?.lineage || m?.item_id || m?.itemId;
        if (!linaje) continue;
        linajesDelFrente.add(linaje);
        if (m.urn) linajePorUrn.set(String(m.urn).trim(), linaje);
    }

    // El objectSet v1 son dbIds sin identidad estable detrás. Se conserva, pero
    // el pipeline solo podrá usarlo si la versión del modelo no ha cambiado.
    const lmv = {};
    for (const clave of CAMPOS_LMV_PERSISTIBLES) {
        if (vs[clave] !== undefined) lmv[clave] = vs[clave];
    }
    if (vs.cutplanes === undefined) informe.push({ tipo: 'v1-sin-cutplanes' });
    if (vs.floorGuid === undefined) informe.push({ tipo: 'v1-sin-planta-aec' });

    // La federación de una vista v1 solo se puede deducir de los `seedUrn`, y
    // solo existen si había MÁS DE UN modelo visible al guardar: la regla del
    // LMV es `n.length > 1 && (r[e].seedUrn = o)`. Con un modelo, la vista v1
    // no dice a qué modelo pertenecía.
    const models = [];
    for (const entrada of vs.objectSet || []) {
        if (entrada && entrada.seedUrn) {
            const linaje = linajeDelFrente(entrada.seedUrn, linajePorUrn, linajesDelFrente);
            if (!linaje) informe.push({ tipo: 'v1-modelo-sin-linaje', urn: entrada.seedUrn });
            models.push({ lineage: linaje, urnAtSave: entrada.seedUrn, versionAtSave: null, visible: true, order: models.length });
        }
    }
    if (models.length === 0) informe.push({ tipo: 'v1-federacion-desconocida' });

    // Inventory: `null` y `{}` son AUSENCIA DE DATO, no «todas visibles».
    // Traducirlos a `{mode:'all'}` sería afirmar una decisión que nadie tomó.
    let inventory;
    const cols = cfg.inventoryColumns;
    if (Array.isArray(cols) && cols.length) {
        inventory = { columns: { mode: 'custom', keys: cols.slice() } };
    } else {
        informe.push({ tipo: 'v1-inventario-sin-dato' });
    }

    const doc = {
        schemaVersion: SCHEMA_VERSION,
        lmv,
        models,
        federation: { activeLineage: null, globalOffsetAtSave: null },
        filters: {
            properties: Array.isArray(fs.filterProperties) ? fs.filterProperties.slice() : [],
            selections: seleccionesNormalizadas(fs.filterSelections, linajePorUrn, linajesDelFrente, informe),
            colors: fs.filterColors || {},
            valueColors: fs.customValueColors || {},
            sourceColor: { on: !!fs.sourceColorOn, custom: fs.sourceCustomColors || {} },
            hiddenModelLineages: [],
            hiddenModelUrnsV1: Array.isArray(fs.hiddenModelUrns) ? fs.hiddenModelUrns.slice() : [],
        },
        ...(inventory ? { inventory } : {}),
        extensions: { pkHeatmap: fs.pkHeatmap || null },
        meta: { appVersion: null, capturedAt: null, migradoDeV1: true },
    };
    return { doc, informe };
}

// ═══════════════════════════════════════════════════════════════════════════
// E-2b · LINAJE -> URN VIGENTE
// ═══════════════════════════════════════════════════════════════════════════
//
// El URN de APS LLEVA LA VERSION DENTRO. Decodificado de `model_config`:
//
//     urn (base64)   ->  urn:adsk.wipprod:fs.file:vf.ub2xfj...?version=50
//     item_id        ->  urn:adsk.wipprod:dm.lineage:ub2xfj...
//
// Actualizar un modelo cambia el URN; el linaje no. Por eso el URN no puede ser
// la identidad de nada que se persista.
//
// Y hay una razón concreta por la que el rebind es obligatorio y no cosmético:
// `restoreObjectSet` del LMV hace `if (l && !(s = this.getVisibleModel(l))) continue`
// --descarta EN SILENCIO la entrada cuyo `seedUrn` no esté entre los modelos
// visibles--. Sin rebind, una vista guardada en la v50 abierta sobre la v53
// perdería toda su selección sin decir nada.

/** Índice por linaje de la configuración de modelos del frente. */
export function indicePorLinaje(modelConfig) {
    const idx = new Map();
    for (const m of modelConfig || []) {
        const linaje = m.lineage || m.item_id || m.itemId;
        if (linaje) idx.set(linaje, m);
    }
    return idx;
}

/**
 * Traduce el documento al presente: qué linaje corresponde a qué URN hoy, qué
 * modelos faltan y cuáles han cambiado de versión.
 */
export function planDeRebind(doc, modelConfig) {
    const idx = indicePorLinaje(modelConfig);
    const urnPorLinaje = new Map();
    const reescrituras = new Map();     // urnAtSave -> urn vigente
    const faltan = [];
    const versionCambiada = new Set();

    for (const m of doc?.models || []) {
        if (!m) continue;
        // Una vista v1 no tiene linaje: solo se puede identificar por el URN
        // que guardó. Si ese URN sigue existiendo, sirve; si no, se pierde.
        if (!m.lineage) {
            const porUrn = (modelConfig || []).find((x) => x.urn === m.urnAtSave);
            if (porUrn) {
                reescrituras.set(m.urnAtSave, porUrn.urn);
                urnPorLinaje.set(porUrn.lineage || porUrn.item_id, porUrn.urn);
            } else {
                faltan.push({ lineage: null, urnAtSave: m.urnAtSave, motivo: 'v1-sin-linaje' });
            }
            continue;
        }
        const fila = idx.get(m.lineage);
        if (!fila) { faltan.push({ lineage: m.lineage, motivo: 'no-esta-en-el-frente' }); continue; }
        urnPorLinaje.set(m.lineage, fila.urn);
        if (m.urnAtSave && m.urnAtSave !== fila.urn) reescrituras.set(m.urnAtSave, fila.urn);
        const vActual = fila.version_number ?? fila.versionNumber ?? null;
        if (m.versionAtSave != null && vActual != null && Number(m.versionAtSave) !== Number(vActual)) {
            versionCambiada.add(m.lineage);
        }
        // Sin `versionAtSave` (vista v1) no se puede afirmar que la versión sea
        // la misma. Se trata como CAMBIADA: es el lado seguro.
        if (m.versionAtSave == null) versionCambiada.add(m.lineage);
    }
    return { urnPorLinaje, reescrituras, faltan, versionCambiada };
}

/** Reescribe los `seedUrn` del documento al URN vigente. Devuelve copia. */
export function aplicarRebind(doc, plan) {
    const copia = JSON.parse(JSON.stringify(doc || {}));
    const cambiados = [];
    for (const entrada of copia?.lmv?.objectSet || []) {
        if (entrada && entrada.seedUrn && plan.reescrituras.has(entrada.seedUrn)) {
            const nuevo = plan.reescrituras.get(entrada.seedUrn);
            cambiados.push({ de: entrada.seedUrn, a: nuevo });
            entrada.seedUrn = nuevo;
        }
    }
    for (const m of copia?.models || []) {
        if (m && m.lineage && plan.urnPorLinaje.has(m.lineage)) m.urnActual = plan.urnPorLinaje.get(m.lineage);
    }
    return { doc: copia, cambiados };
}

// ═══════════════════════════════════════════════════════════════════════════
// E-2c · IDENTIDAD DE ELEMENTO
// ═══════════════════════════════════════════════════════════════════════════
//
// `external_id` es el UniqueId de Revit --`087a7a24-...-0044513a`-- y es el
// MISMO identificador que devuelve `model.getExternalIdMapping()`, de donde
// sale la Piedra Rosetta. Base de datos y visor coinciden, así que no hay que
// inventar ninguna identidad nueva.
//
// DOS LIMITES DEL CODIGO REAL QUE CONDICIONAN ESTO:
//   · `rosettaToDbId` solo contiene HOJAS FISICAS (Viewer.jsx:929) y
//     `rosettaToExtId` contiene TODOS los nodos (:924). Por eso al restaurar
//     hay que invertir `rosettaToExtId`: usar `rosettaToDbId` perdería los
//     nodos que no son hoja.
//   · En IFC los ids son de ruta (`0/0/0/X`) y no son identidad persistente; el
//     puente al `IfcGUID` está en `rosettaToDbId` (:950).
//
// Y UN LIMITE QUE NO SE PUEDE ELIMINAR: el UniqueId es estable para el mismo
// elemento en el mismo fichero. Si alguien borra un muro y lo vuelve a dibujar,
// cambia. Por eso el contrato no promete supervivencia: promete RESOLUCION CON
// PARTE DE DAÑOS.

const esIdDeRuta = (extId) => typeof extId === 'string' && extId.includes('/');

/** dbId -> extId  (captura). Usa `rosettaToExtId`, que tiene todos los nodos. */
export function capturarElementos(objectSetEntrada, rosettaToExtIdDelModelo) {
    const traducir = (ids) => {
        const fuera = [];
        for (const dbId of ids || []) {
            const ext = rosettaToExtIdDelModelo ? rosettaToExtIdDelModelo[dbId] : undefined;
            if (ext !== undefined) fuera.push(ext);
        }
        return fuera;
    };
    return {
        selected: traducir(objectSetEntrada?.id),
        hidden: traducir(objectSetEntrada?.hidden),
        isolated: traducir(objectSetEntrada?.isolated),
    };
}

/** Invierte `rosettaToExtId` (dbId -> extId) para poder resolver al revés. */
export function inversaDeRosetta(rosettaToExtIdDelModelo) {
    const inv = new Map();
    for (const dbId in (rosettaToExtIdDelModelo || {})) {
        const ext = rosettaToExtIdDelModelo[dbId];
        if (ext !== undefined && !inv.has(ext)) inv.set(ext, Number(dbId));
    }
    return inv;
}

/**
 * Resuelve los externalIds guardados contra la Rosetta de la versión vigente.
 * Devuelve los dbIds que existen HOY y el parte de los que no.
 */
export function resolverElementos(elementos, rosettaToExtIdDelModelo, puenteIfc) {
    const inv = inversaDeRosetta(rosettaToExtIdDelModelo);
    const resolver = (extIds) => {
        const dbIds = [];
        const perdidos = [];
        for (const ext of extIds || []) {
            if (esIdDeRuta(ext)) {
                // Un id de ruta no es identidad persistente: solo se acepta por
                // el puente a IfcGUID, nunca tal cual.
                const porPuente = puenteIfc ? puenteIfc[ext] : undefined;
                if (porPuente !== undefined) { dbIds.push(Number(porPuente)); continue; }
                perdidos.push(ext);
                continue;
            }
            const dbId = inv.get(ext) ?? (puenteIfc ? puenteIfc[ext] : undefined);
            if (dbId !== undefined) dbIds.push(Number(dbId));
            else perdidos.push(ext);
        }
        return { dbIds, perdidos };
    };
    const sel = resolver(elementos?.selected);
    const ocu = resolver(elementos?.hidden);
    const ais = resolver(elementos?.isolated);
    return {
        selected: sel.dbIds, hidden: ocu.dbIds, isolated: ais.dbIds,
        perdidos: { selected: sel.perdidos, hidden: ocu.perdidos, isolated: ais.perdidos },
        total: (elementos?.selected?.length || 0) + (elementos?.hidden?.length || 0) + (elementos?.isolated?.length || 0),
        resueltos: sel.dbIds.length + ocu.dbIds.length + ais.dbIds.length,
    };
}

/**
 * LA DECISION, en un solo sitio: ¿se puede usar el objectSet nativo, hay que
 * resolver por externalId, o hay que degradar?
 */
export function politicaDeElementos({ tieneElementos, versionCambiada }) {
    if (!versionCambiada) return 'objectset-nativo';
    if (tieneElementos) return 'resolver-por-externalid';
    // v1 sin externalIds y con la versión cambiada. Aplicar los dbIds de la v50
    // sobre la v53 no da un error: da OTROS ELEMENTOS, en silencio.
    return 'degradar';
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTE DE DAÑOS
// ═══════════════════════════════════════════════════════════════════════════

export function nuevoInforme() {
    return { estado: 'completa', avisos: [] };
}

export function anotar(informe, tipo, datos = {}) {
    informe.avisos.push({ tipo, ...datos });
    if (tipo !== 'alias' && informe.estado === 'completa') informe.estado = 'degradada';
    return informe;
}

export function fallar(informe, motivo) {
    informe.estado = 'fallida';
    informe.avisos.push({ tipo: 'fallo', motivo });
    return informe;
}

// ═══════════════════════════════════════════════════════════════════════════
// E-4B · ¿ESTE DOCUMENTO SE PUEDE GUARDAR?
// ═══════════════════════════════════════════════════════════════════════════
//
// La autoridad es el SERVIDOR (`backend/vistas_v2.py`). Esto es la misma
// pregunta hecha antes de gastar una petición, para que quien guarda vea el
// problema en el sitio donde puede arreglarlo y no como un 422.
//
// Las dos implementaciones no pueden separarse con el tiempo, y eso no se
// confía a la buena voluntad: `backend/tests/corpus_persistibilidad_v2.json`
// tiene los documentos y su veredicto, y las dos baterías —la de Node y la de
// Python— lo recorren entero. Si una regla cambia en un lado y no en el otro,
// falla una de las dos.
//
// EL INVARIANTE, EN UNA FRASE
//     un documento v2 no se persiste mientras contenga identidad transitoria
//     de v1 o esté indexado por URN.
//
// Un URN de APS lleva la versión dentro: `urn:adsk...:fs.file:vf.<id>?version=50`.
// El linaje —`urn:adsk...:dm.lineage:<id>`— no. Guardar el primero como
// identidad es guardar «la versión 50», y el día que llegue la 51 el LMV la
// descarta sin decir nada (`restoreObjectSet`).

const RE_LINAJE = /^urn:adsk\.[a-z0-9]+:dm\.lineage:[A-Za-z0-9_-]+$/;
const HUELLAS_DE_VERSION = ['fs.file:vf.', '?version='];

export const esLinaje = (v) => typeof v === 'string' && RE_LINAJE.test(v.trim());

/** ¿Hay dentro de este texto un URN con la versión pegada? En claro o en base64. */
export function contieneUrnDeVersion(texto) {
    if (typeof texto !== 'string' || !texto) return false;
    if (HUELLAS_DE_VERSION.some((h) => texto.includes(h))) return true;
    // Se buscan TROZOS de base64 en cualquier posición: las claves de
    // `valueColors` son `propId::valor`, así que la clave entera no es base64
    // pero su cola sí.
    for (const trozo of texto.match(/[A-Za-z0-9_\-+/]{32,}={0,2}/g) || []) {
        let claro;
        try {
            // `atob` a secas: existe en el navegador y en Node desde la 16, que
            // es donde corre la batería. Un respaldo con `Buffer` no compilaría
            // en el navegador y no hace falta en ninguno de los dos sitios.
            const b64 = trozo.replace(/-/g, '+').replace(/_/g, '/');
            claro = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
        } catch { continue; }
        if (HUELLAS_DE_VERSION.some((h) => claro.includes(h))) return true;
    }
    return false;
}

function clavesConUrn(nodo, ruta, problemas, prof = 0) {
    if (prof > 12 || !nodo || typeof nodo !== 'object') return;
    if (Array.isArray(nodo)) {
        nodo.slice(0, 500).forEach((v, i) => clavesConUrn(v, `${ruta}[${i}]`, problemas, prof + 1));
        return;
    }
    for (const k of Object.keys(nodo)) {
        if (contieneUrnDeVersion(k)) {
            problemas.push({
                campo: `${ruta}.${k.slice(0, 60)}`, motivo: 'MAPA_INDEXADO_POR_URN',
                detalle: 'la clave lleva un URN con versión; el índice debe ser el linaje',
            });
        }
        clavesConUrn(nodo[k], `${ruta}.${k.slice(0, 40)}`, problemas, prof + 1);
    }
}

/**
 * ¿Se puede persistir este documento como v2?
 * @returns {{ ok: boolean, problemas: {campo,motivo,detalle}[] }}
 */
export function esPersistibleV2(state) {
    const problemas = [];
    const mal = (campo, motivo, detalle = '') => problemas.push({ campo, motivo, detalle });

    if (!state || typeof state !== 'object' || Array.isArray(state)) {
        mal('state', 'NO_ES_OBJETO', 'se esperaba un objeto');
        return { ok: false, problemas };
    }

    if (state.schemaVersion !== SCHEMA_VERSION) {
        mal('state.schemaVersion', 'SCHEMA_VERSION',
            `debe ser exactamente ${SCHEMA_VERSION}, llegó ${JSON.stringify(state.schemaVersion)}`);
    }

    if (!Array.isArray(state.models) || state.models.length === 0) {
        mal('state.models', 'MODELOS_AUSENTES',
            'un documento v2 nombra los modelos a los que pertenece');
    } else {
        state.models.forEach((m, i) => {
            const campo = `state.models[${i}]`;
            if (!m || typeof m !== 'object' || Array.isArray(m)) {
                mal(campo, 'MODELO_NO_ES_OBJETO', typeof m);
                return;
            }
            const linaje = m.lineage;
            if (linaje === null || linaje === undefined || linaje === '') {
                mal(`${campo}.lineage`, 'LINAJE_AUSENTE',
                    'identidad de v1 sin resolver: este modelo no se podrá reencontrar');
            } else if (!esLinaje(linaje)) {
                mal(`${campo}.lineage`,
                    contieneUrnDeVersion(linaje) ? 'IDENTIDAD_DE_VERSION' : 'LINAJE_NO_ES_LINAJE',
                    'se esperaba urn:adsk.<hub>:dm.lineage:<id>');
            }
            if (m.urnActual) {
                mal(`${campo}.urnActual`, 'IDENTIDAD_DE_VERSION',
                    'campo derivado del rebind; no se persiste');
            }
        });
    }

    const f = state.filters;
    if (f && typeof f === 'object') {
        if (Object.prototype.hasOwnProperty.call(f, 'hiddenModelUrnsV1')) {
            mal('state.filters.hiddenModelUrnsV1', 'TRANSITO_V1',
                'campo de conversión v1→v2; resuélvelo a `hiddenModelLineages` y quítalo');
        }
        const ocultos = f.hiddenModelLineages;
        if (ocultos !== undefined && ocultos !== null) {
            if (!Array.isArray(ocultos)) {
                mal('state.filters.hiddenModelLineages', 'TIPO', 'se esperaba una lista de linajes');
            } else {
                ocultos.forEach((v, i) => {
                    if (!esLinaje(v)) {
                        mal(`state.filters.hiddenModelLineages[${i}]`,
                            contieneUrnDeVersion(v) ? 'IDENTIDAD_DE_VERSION' : 'LINAJE_NO_ES_LINAJE',
                            'se esperaba un linaje');
                    }
                });
            }
        }
    }

    // `Standard::Sources` NO selecciona valores de una columna: selecciona
    // MODELOS. Su espacio de identidad persistido es el LINAJE, no el URN.
    // En runtime la selección viaja con el URN vigente —así la produce el
    // producto y así la consume el motor de facetas—; al GUARDAR se traduce a
    // linaje, y al RESTAURAR se vuelve a traducir al URN de hoy. El shape de
    // `filters.selections` no cambia: cambia el espacio de identidad de ESTA
    // clave, y solo de ésta.
    const sources = f && typeof f === 'object' && f.selections
        ? f.selections[PROP_SOURCES] : undefined;
    if (sources !== undefined && sources !== null) {
        if (!Array.isArray(sources)) {
            mal(`state.filters.selections['${PROP_SOURCES}']`, 'TIPO',
                'se esperaba una lista de linajes');
        } else {
            sources.forEach((v, i) => {
                if (!esLinaje(v)) {
                    mal(`state.filters.selections['${PROP_SOURCES}'][${i}]`,
                        contieneUrnDeVersion(v) ? 'IDENTIDAD_DE_VERSION' : 'LINAJE_NO_ES_LINAJE',
                        'la selección de modelos se persiste por linaje: el URN lleva la versión dentro');
                }
            });
        }
    }

    if (state.meta && typeof state.meta === 'object' && state.meta.migradoDeV1) {
        mal('state.meta.migradoDeV1', 'TRANSITO_V1',
            'marca del normalizador: mientras esté, el documento es la lectura de una v1');
    }

    clavesConUrn(state, 'state', problemas);

    return { ok: problemas.length === 0, problemas };
}
