// El linaje de un URN de APS: el documento, que no cambia al versionar.
// Se reutiliza el derivador que ya existe en vez de escribir otro.
import { linajeDeUrn } from '../../lib/savedViewV2.js';
import { knownPropertyNames, legacyAliasAllowed } from '../../lib/filterPropertyIdentity.js';
import { inventoryRowKey } from '../../lib/inventoryIdentity.js';

/**
 * Encuentra todos los nodos hoja en el árbol del modelo.
 * @param {Autodesk.Viewing.Model} model El modelo del visor.
 * @returns {Promise<number[]>} Una promesa que se resuelve con un array de IDs de nodos hoja.
 */
export function findLeafNodes(model) {
    return new Promise((resolve, reject) => {
        model.getObjectTree((tree) => {
            const leaves = [];
            tree.enumNodeChildren(tree.getRootId(), (dbId) => {
                if (tree.getChildCount(dbId) === 0) {
                    leaves.push(dbId);
                }
            }, true /* recursive */);
            resolve(leaves);
        }, (code, msg) => {
            reject(new Error(msg));
        });
    });
}

/**
 * Obtiene propiedades para un conjunto de IDs de base de datos, con un filtro de propiedades.
 * @param {Autodesk.Viewing.Model} model El modelo del visor.
 * @param {number[]} dbIds Array de IDs de base de datos.
 * @param {string[]} propFilter Array de nombres de propiedades a obtener.
 * @returns {Promise<any[]>} Una promesa que se resuelve con un array de objetos de propiedades.
 */
export function getBulkProperties(model, dbIds, propFilter = []) {
    return new Promise((resolve, reject) => {
        const options = propFilter && propFilter.length ? { propFilter } : {};
        model.getBulkProperties(dbIds, options, resolve, reject);
    });
}

/**
 * Limita la ejecución de una función a una vez cada X milisegundos.
 * @param {Function} func La función a ejecutar.
 * @param {number} delay El tiempo de espera en milisegundos.
 * @returns {Function} La función "throttled".
 */
export function throttle(func, delay) {
    let inProgress = false;
    return (...args) => {
        if (inProgress) {
            return;
        }
        inProgress = true;
        setTimeout(() => {
            func(...args);
            inProgress = false;
        }, delay);
    };
}

/**
 * Retrasa la ejecución de una función hasta que hayan pasado X milisegundos sin que se llame.
 * @param {Function} func La función a ejecutar.
 * @param {number} delay El tiempo de espera en milisegundos.
 * @returns {Function} La función "debounced".
 */
export function debounce(func, delay) {
    let timeout = null;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), delay);
    };
}

/**
 * Intenta obtener una propiedad de un objeto, probando varios alias y normalizando los nombres.
 * @param {object} record El objeto del que obtener la propiedad.
 * @param {...string} aliases Los posibles nombres (alias) de la propiedad.
 * @returns {any|null} El valor de la propiedad o null si no se encuentra.
 */
export function tryGetProperty(record, ...aliases) {
    for (const alias of aliases) {
        if (record.properties) {
            for (const prop of record.properties) {
                if (prop.displayName && alias && prop.displayName.toLowerCase().replace(/\s/g, '') === alias.toLowerCase().replace(/\s/g, '')) {
                    return prop.displayValue;
                }
            }
        }
    }
    return null;
}

/**
 * Calcula dinámicamente los Filter Buckets usando PropertyDatabase (Native APS C++ Worker)
 * Extrae y cruza los valores en memoria aislada, devolviendo un objeto serializado ligero.
 * @param {Autodesk.Viewing.Model} model 
 * @param {string[]} filterProperties - Propiedades activas a agrupar
 * @param {Object} filterSelections - Filtros activos
 * @returns {Promise<Object>}
 */
export function calculateDynamicFilterBucketsNative(model, filterProperties, filterSelections = {}) {
    return new Promise((resolve, reject) => {
        model.getPropertyDb().executeUserFunction(function(pdb, args) {
            const metas = args.filterProperties;
            const selections = args.filterSelections;
            const modelUrn = args.modelUrn;
            
            // 1. Pre-construir los mapas de selección para búsqueda O(1)
            const selMaps = {};
            let hasAnySelection = false;
            for(let propId in selections) {
                if (selections[propId] && selections[propId].length > 0) {
                    selMaps[propId] = {};
                    selections[propId].forEach(function(val) {
                        selMaps[propId][val] = true;
                    });
                    hasAnySelection = true;
                }
            }

            // 2. Preparar los buckets de salida
            const bucketMaps = {};
            metas.forEach(function(meta) { bucketMaps[meta] = {}; });
            
            let dbId = 1;
            const maxId = pdb.getObjectCount();
            
            // 2.5 Pre-cache attribute definitions safely
            const attrDefs = {};
            pdb.enumAttributes(function(attrId, attrDef) {
                attrDefs[attrId] = attrDef;
            });
            
            // 3. Iteración Unificada O(N) sobre toda la geometría
            const globalValidDbIds = []; // Matriz global de intersección
            
            for (; dbId < maxId; dbId++) {
                
                // Extraer propiedades de este elemento
                const elemProps = {};
                var hasAnyProp = false;
                pdb.enumObjectProperties(dbId, function(attrId, valId) {
                    hasAnyProp = true;
                    const attrDef = attrDefs[attrId];
                    if(!attrDef) return;
                    
                    var propName = attrDef.name || 'Unnamed';
                    var propCategory = attrDef.category || 'General';
                    // Civil 3D: strip redundant group prefix (hyphen, en-dash, em-dash)
                    if (propName.indexOf(propCategory) === 0) {
                        var cleaned = propName.substring(propCategory.length).replace(/^[\s\-\_\.]+/, '');
                        if (cleaned.length > 0) propName = cleaned;
                    } else if (propCategory.toUpperCase() === 'PROPERTY SETS' && propName.match(/^.*?\s*[\-\u2013\u2014]\s*(.+)$/)) {
                        propName = propName.match(/^.*?\s*[\-\u2013\u2014]\s*(.+)$/)[1];
                    }
                    var key = propCategory + '::' + propName;
                    
                    if(bucketMaps[key]) {
                        let val = pdb.getAttrValue(attrId, valId);
                        if(val !== null && val !== undefined) {
                            elemProps[key] = String(val).trim();
                        }
                    }
                });

                // --- (Unassigned): Para elementos reales con propiedades pero sin la propiedad tracked ---
                if (hasAnyProp) {
                    metas.forEach(function(propId) {
                        if (!elemProps[propId]) {
                            elemProps[propId] = '(Unassigned)';
                        }
                    });
                }

                // --- ¿Pasa este dbId la validación estricta AND de todas las categorías? ---
                let passesAllFilters = true;
                if (hasAnySelection) {
                    for(let selPropId in selMaps) {
                        const eVal = elemProps[selPropId];
                        if(!eVal || !selMaps[selPropId][eVal]) {
                            passesAllFilters = false;
                            break;
                        }
                    }
                }
                if (hasAnySelection && passesAllFilters) {
                    globalValidDbIds.push({ id: parseInt(dbId, 10), modelUrn: modelUrn });
                }
                // --- FIN ---

                // Inyectar a los buckets si el valor existe
                for(let propId in elemProps) {
                    const val = elemProps[propId];
                    if(!val) continue;

                    // Lógica de Facetas Cruzadas:
                    // Si el elemento es válido, suma a TODOS sus properties.
                    // PERO, para permitir seleccionar múltiples de la misma categoría (OR restrictivo), 
                    // la validación de facetas requiere ignorar la selección de su *misma* categoría.
                    
                    let passesFacet = true;
                    if (hasAnySelection) {
                        for(let selPropId in selMaps) {
                            if (selPropId === propId) continue; // Ignora filtro de la propia categoría
                            const eVal = elemProps[selPropId];
                            if(!eVal || !selMaps[selPropId][eVal]) {
                                passesFacet = false;
                                break;
                            }
                        }
                    }

                    if (passesFacet) {
                        if(!bucketMaps[propId][val]) {
                            bucketMaps[propId][val] = { count: 0, dbIds: [] };
                        }
                        bucketMaps[propId][val].count++;
                        // Anexamos el formato correcto compatible con el resto de la UI
                        bucketMaps[propId][val].dbIds.push({ id: dbId, modelUrn: modelUrn });
                    }
                }
            }
            
            // 4. Formatear salida estructurada para el componente de React TandemFilterPanel
            const result = {};
            metas.forEach(function(propId) {
                const map = bucketMaps[propId];
                const values = [];
                for(let val in map) {
                    values.push({
                         value: val,
                         count: map[val].count,
                         dbIds: map[val].dbIds
                    });
                }
                
                values.sort(function(a, b) {
                     var aIsUnassigned = (a.value === '(Unassigned)' || a.value === 'Unassigned' || a.value === 'Sin asignar');
                     var bIsUnassigned = (b.value === '(Unassigned)' || b.value === 'Unassigned' || b.value === 'Sin asignar');
                     if (aIsUnassigned && !bIsUnassigned) return 1;
                     if (!aIsUnassigned && bIsUnassigned) return -1;

                     if (b.count === a.count) return a.value.localeCompare(b.value);
                     return b.count - a.count;
                });
                
                let total = 0;
                values.forEach(function(entry) { total += entry.count; });
                
                // Fake Meta structure to satisfy frontend expected data
                const fakeMeta = {
                    id: propId,
                    name: propId.split('::')[1] || propId,
                    category: propId.split('::')[0] || 'General'
                };

                result[propId] = {
                    meta: fakeMeta,
                    total: total,
                    values: values
                };
            });
            return {
                buckets: result,
                globalValidDbIds: hasAnySelection ? globalValidDbIds : [] 
            };
            
        }, { 
            filterProperties, 
            filterSelections, 
            modelUrn: typeof model.getData === 'function' ? model.getData().urn : 'unknown'
        })
        .then(resolve)
        .catch(reject);
    });
}

/**
 * Extrae solo los valores de CodigoDePartida y NombreDePartida.
 */
export function extractPartidasNative(model) {
    if(!model.getPropertyDb()) return Promise.resolve([]);
    return new Promise((resolve) => {
        model.getPropertyDb().executeUserFunction(function(pdb) {
            const attrDefs = {};
            pdb.enumAttributes(function(attrId, attrDef) {
                attrDefs[attrId] = attrDef.name;
            });

            const partidaMap = {};
            let dbId = 1;
            const maxId = pdb.getObjectCount();
            
            for (; dbId < maxId; dbId++) {
                let code = '';
                let name = '';
                pdb.enumObjectProperties(dbId, function(propId, valId) {
                    const propName = attrDefs[propId];
                    if (propName === '03_05_DSI_CodigoDePartida') {
                        let val = pdb.getAttrValue(propId, valId);
                        if(val !== null && val !== undefined) {
                            code = String(val).trim();
                        }
                    }
                    if (propName === '03_04_DSI_NombreDePartida' || propName === 'Name' || propName === 'name') {
                        if(!name) { // take first available name if multiple exist
                            let val = pdb.getAttrValue(propId, valId);
                            if(val !== null && val !== undefined) {
                                name = String(val).trim();
                            }
                        }
                    }
                });

                if (code) {
                    if (!partidaMap[code]) {
                        partidaMap[code] = { code: code, name: name, count: 0 };
                    }
                    partidaMap[code].count++;
                    if (!partidaMap[code].name && name) {
                        partidaMap[code].name = name;
                    }
                }
            }
            
            const result = [];
            for (let c in partidaMap) {
                result.push(partidaMap[c]);
            }
            return result.sort(function(a,b){return a.code.localeCompare(b.code)});
        })
        .then(resolve)
        .catch(() => resolve([]));
    });
}

/**
 * Recopila todas las categorías y nombres de propiedades existentes.
 * Se utiliza para popular el FilterConfigurator asíncronamente.
 */
export function extractSchemaNative(model) {
    if(!model.getPropertyDb()) return Promise.resolve([]);
    return new Promise((resolve) => {
        model.getPropertyDb().executeUserFunction(function(pdb) {
            const schemaMap = {};
            pdb.enumAttributes(function(attrId, attrDef) {
                var category = attrDef.category || 'General';
                var name = attrDef.name || 'Unnamed';
                if(name.startsWith('__')) return; // ignore internal attributes
                // Civil 3D: strip redundant group prefix (hyphen, en-dash, em-dash)
                if (name.indexOf(category) === 0) {
                    var cleanedName = name.substring(category.length).replace(/^[\s\-\_\.]+/, '');
                    if (cleanedName.length > 0) name = cleanedName;
                } else if (category.toUpperCase() === 'PROPERTY SETS' && name.match(/^.*?\s*[\-\u2013\u2014]\s*(.+)$/)) {
                    name = name.match(/^.*?\s*[\-\u2013\u2014]\s*(.+)$/)[1];
                }
                var key = category + '::' + name;
                if(!schemaMap[key]) {
                    schemaMap[key] = {
                        id: key,
                        name: name,
                        category: category,
                        group: attrDef.dataTypeContext,
                        path: category + ' ▸ ' + name
                    };
                }
            });
            const result = [];
            for(let key in schemaMap) result.push(schemaMap[key]);
            
            // agrupar por categoría
            const grouped = {};
            result.forEach(prop => {
                const label = prop.category;
                if(!grouped[label]) grouped[label] = [];
                grouped[label].push(prop);
            });
            
            return result; // Flat list is what filter configurator uses essentially
        })
        .then(schemaList => {
             // App.jsx needs uniqueProps values. We just emit them.
             resolve(schemaList.sort((a,b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)));
        })
        .catch(() => resolve([]));
    });
}

// ── FacetIndex: índice normalizado en memoria (fluidez tipo Tandem) ─────────
// El costo real del filtrado NO es la lógica facetada, es re-normalizar el
// inventario completo (String.replace de URNs, aplanar arrays, resolver rosetta)
// en CADA clic. Eso lo hacemos UNA sola vez y lo cacheamos: cada toggle solo
// recorre filas ya normalizadas y hace intersecciones. Misma semántica exacta.
// Exportados para que `lib/preflightFiltros.js` valide una Saved View con las
// MISMAS reglas con las que aqui se construyen los buckets. Duplicarlas alli
// habria sido garantizar que un dia divergen y la vista se valide contra una
// verdad distinta de la que luego se aplica. No cambia nada de este modulo.
export const _safeUrn = (u) => String(u ?? '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const _normVal = (raw) => Array.isArray(raw)
    ? raw.map(x => String(x ?? '').trim()).filter(Boolean).join(', ')
    : String(raw ?? '').trim();

let _facetCache = { revision: null, allData: null, rosetta: null, rosettaFp: '', prepared: null };

// Huella de la rosetta: window.rosettaToDbId se MUTA en el mismo objeto cuando
// cada modelo termina de indexar (el pesado llega al final). Comparar solo la
// referencia dejaba el índice SIN los elementos de los modelos tardíos
// (p. ej. ENCOFRADO: sin categoría y sin coloreo hasta refrescar la página).
const _rosettaFingerprint = (r) => {
    // Exact content, including full source and externalId. A length/hash of
    // names cannot distinguish {a:1} from {b:1}. Order differences may cause
    // a harmless rebuild, but distinct mappings must never reuse an index.
    return JSON.stringify(Object.entries(r || {}).map(([urn, mapping]) =>
        [urn, Object.entries(mapping || {})]));
};

function _buildFacetIndex(allData, rosettaToExtIdReversed) {
    // POR LINAJE, NO POR "EL PRIMERO QUE LO TENGA".
    //
    // Antes habia un fallback global externalId -> {dbId, urn} que se quedaba
    // con el PRIMER modelo cargado que tuviera ese externalId. Existia por un
    // motivo real --el source_urn guardado deja de coincidir en cuanto se sube
    // una revision, porque el URN de APS lleva la version pegada-- pero la cura
    // cruzaba Sources: un elemento de un documento acababa resuelto contra otro,
    // incluso contra uno que el usuario habia ocultado. Lo que no cambia al
    // versionar es el LINAJE, asi que el respaldo se hace por documento y, si el
    // documento no esta cargado, no se resuelve nada.
    const byLinaje = new Map();
    if (rosettaToExtIdReversed) {
        for (const loadedUrn in rosettaToExtIdReversed) {
            const linaje = linajeDeUrn(loadedUrn);
            if (!linaje) continue;
            // Dos versiones del mismo documento cargadas a la vez no se
            // distinguen por linaje: eso es ambiguedad, y no se elige ninguna.
            byLinaje.set(linaje, byLinaje.has(linaje) ? null
                : { mapping: rosettaToExtIdReversed[loadedUrn], urn: loadedUrn });
        }
    }

    // colUrnsWithValue: por columna, en qué modelos (safeUrn) el parámetro EXISTE.
    // Sirve para distinguir '(Unassigned)' (vacío real) de '(No aplica)' (el modelo
    // ni usa el parámetro). Se computa sobre TODAS las filas (idéntico a antes).
    const colUrnsWithValue = new Map();
    // preparedRows: solo filas que resuelven en rosetta (las que producían buckets).
    const rows = [];
    const unresolved = [];
    const vistos = new Set();
    for (let i = 0; i < allData.length; i++) {
        const row = allData[i];
        const extId = row.dbId;
        const rawUrn = row.source_urn || row.model_urn;
        const safeUrn = _safeUrn(rawUrn);

        // Normalizar columnas una vez + registrar scope por columna.
        //
        // `Map` y no un objeto: los VALORES de una propiedad son datos del
        // modelo, y un elemento cuyo valor es `constructor`, `toString` o
        // `__proto__` es un elemento normal. Con un objeto plano esos nombres
        // caen en Object.prototype: `bucket[val]` devolvia una funcion en vez de
        // undefined --y reventaba con "Cannot read properties of undefined"-- o,
        // con `__proto__`, escribia en el prototipo. Aqui la clave es una clave.
        const norm = new Map();
        for (const k in row) {
            if (k === 'dbId' || k === 'source_urn' || k === 'model_urn') continue;
            const v = _normVal(row[k]);
            if (v) {
                norm.set(k, v);
                let scope = colUrnsWithValue.get(k);
                if (!scope) { scope = new Set(); colUrnsWithValue.set(k, scope); }
                scope.add(safeUrn);
            }
        }

        // Resolver dbId del viewer (rosetta directa o fallback global)
        //
        // LA COMPROBACION DE null NO ES DEFENSIVA POR SI ACASO: treinta lineas
        // mas arriba, al construir `globalExtIdLookup`, ESTA MISMA variable se
        // comprueba con `if (rosettaToExtIdReversed)`. O sea que ya se sabia
        // que podia venir vacia; aqui se olvido. Cuando pasaba, reventaba con
        // "Cannot read properties of null (reading '<urn>')" y la promesa se
        // quedaba sin capturar. Visto en la consola del enlace compartido, pero
        // no es exclusivo de el: le pasa a cualquiera que llegue aqui antes de
        // que la rosetta este lista.
        //
        // Sin rosetta no hay nada que mapear, asi que cada fila cae al fallback
        // global -- vacio en ese caso -- y se descarta con el `continue` de
        // abajo. Ninguna fila inventada.
        const urnDict = rosettaToExtIdReversed
            && (rosettaToExtIdReversed[rawUrn] || rosettaToExtIdReversed[safeUrn]);
        let viewerDbId;
        let effectiveModelUrn = safeUrn;
        if (urnDict && Object.hasOwn(urnDict, extId)) {
            viewerDbId = urnDict[extId];
        } else {
            const linaje = linajeDeUrn(rawUrn);
            const mismoDocumento = linaje ? byLinaje.get(linaje) : null;
            if (mismoDocumento && Object.hasOwn(mismoDocumento.mapping, extId)) {
                viewerDbId = mismoDocumento.mapping[extId];
                effectiveModelUrn = _safeUrn(mismoDocumento.urn);
            } else {
                const nodeType = row._nodeType || row['__node__::__node_type__'] || row.__node_type__;
                if ((urnDict || mismoDocumento) && (!nodeType || nodeType === 'instance'))
                    unresolved.push(_safeUrn(mismoDocumento?.urn || rawUrn));
                continue; // no existe en ningún modelo cargado → no participa
            }
        }
        if (!Number.isFinite(Number(viewerDbId))) {
            unresolved.push(effectiveModelUrn);
            continue;
        }

        // UN ELEMENTO CUENTA UNA VEZ. El inventario puede traer la misma fila
        // repetida --un refresco solapado, una reextraccion-- y contar por fila
        // inflaba los contadores y devolvia el mismo dbId dos veces en las
        // coincidencias. La identidad es (documento, externalId): dos Sources
        // distintas que compartan externalId siguen siendo dos elementos.
        const claveDeElemento = safeUrn + '\u0000' + extId;
        if (vistos.has(claveDeElemento)) continue;
        vistos.add(claveDeElemento);

        rows.push({
            externalId: String(extId),
            rowKey: inventoryRowKey(row),
            keys: new Set(Object.keys(row)),
            viewerDbId,
            effectiveModelUrn,
            rawUrn,
            safeUrn,
            sourceVal: String(rawUrn).trim(),
            norm,
        });
    }
    return { rows, colUrnsWithValue, unresolved, propertyNames: knownPropertyNames(allData) };
}

export function calculateBucketsFromPostgres(allData, filterProperties, filterSelections, rosettaToExtIdReversed, hiddenModelUrns = [], datasetRevision = null, schema = []) {
    // allData is array of objects: { dbId: 'UUID', model_urn: 'URN', <PropName>: 'Value', ... }
    // rosettaToExtIdReversed: URN -> ExternalId -> dbId
    // hiddenModelUrns: array of URNs que el usuario ocultó en Sources (formato React/raw)

    // Índice cacheado: se reconstruye si cambió el inventario o la rosetta
    // (por referencia O por CONTENIDO — la rosetta se muta al indexar cada
    // modelo). Los toggles de Sources/valores NO lo invalidan.
    // LA REFERENCIA DEL ARRAY NO ES UNA REVISION. El inventario se edita EN
    // SITIO --la rejilla escribe sobre las mismas filas al guardar-- asi que el
    // array seguia siendo el mismo objeto y el indice cacheado devolvia el valor
    // anterior indefinidamente. Ahora la cache exige una revision explicita que
    // el llamador incrementa cuando el dataset cambia; sin revision no se
    // cachea, que es lo correcto para un llamador que no sabe declararla.
    const rosettaFp = _rosettaFingerprint(rosettaToExtIdReversed);
    const cacheUtilizable = datasetRevision !== null && datasetRevision !== undefined;
    if (!cacheUtilizable || _facetCache.revision !== datasetRevision
        || _facetCache.allData !== allData || _facetCache.rosetta !== rosettaToExtIdReversed
        || _facetCache.rosettaFp !== rosettaFp || !_facetCache.prepared) {
        _facetCache = {
            revision: cacheUtilizable ? datasetRevision : null,
            allData,
            rosetta: rosettaToExtIdReversed,
            rosettaFp,
            prepared: _buildFacetIndex(allData, rosettaToExtIdReversed),
        };
    }
    const { rows: preparedRows, colUrnsWithValue } = _facetCache.prepared;

    // Pre-compute safe versions of hidden URNs for fast lookup
    const hiddenSet = new Set();
    (hiddenModelUrns || []).forEach(u => {
        hiddenSet.add(u);
        hiddenSet.add(_safeUrn(u));
    });

    // Preparar buckets vacíos para las propiedades solicitadas (filterProperties)
    // Map, no objeto: la clave es un VALOR del modelo y puede llamarse
    // `constructor` o `__proto__` sin dejar de ser un dato corriente.
    const bucketMaps = new Map();
    const totalMaps = new Map(); // val -> count IGNORANDO selecciones (el "(total)" de Tandem)
    filterProperties.forEach(propId => {
        bucketMaps.set(propId, new Map()); // val -> { count, dbIds: [{id, modelUrn}] }
        totalMaps.set(propId, new Map());
    });

    const hasAnySelection = Object.keys(filterSelections).some(k => filterSelections[k] && filterSelections[k].length > 0);
    const globalValidDbIds = [];
    const matches = [];

    // Valor efectivo de una fila para una propiedad (AUDITORÍA COMPLETA):
    //   valor real (incluye typos)  → su propio bucket
    //   '(Unassigned)'              → vacío real, en modelos que SÍ usan el parámetro
    //   '(No aplica)'               → el modelo vinculado no trae ese parámetro
    // LA CLAVE ES `Grupo::Propiedad`, NO SOLO EL NOMBRE. Dos grupos pueden
    // traer una propiedad homonima --`G1::Estado` y `G2::Estado`-- y buscar por
    // el nombre suelto las fundia en una: la fila solo conservaba un valor y el
    // filtro del otro grupo respondia con el ajeno. Se lee primero la clave
    // cualificada; el nombre suelto queda como compatibilidad para datasets que
    // todavia vengan aplanados, y solo cuando NO hay homonimia entre las
    // propiedades pedidas: si la hay, un valor sin grupo no se atribuye a
    // ninguna, porque no se sabe de cual es.
    const propertyNames = knownPropertyNames([], [...schema, ...filterProperties, ...Object.keys(filterSelections)]);
    for (const [name, ids] of _facetCache.prepared.propertyNames) {
        if (!propertyNames.has(name)) propertyNames.set(name, new Set());
        for (const id of ids) propertyNames.get(name).add(id);
    }
    const getRowValue = (r, propId) => {
        if (propId === 'Standard::Sources') return r.sourceVal;
        const cualificado = r.norm.get(propId);
        if (cualificado) return cualificado;
        const pn = propId.split('::')[1] || propId;
        if (!r.keys.has(propId) && legacyAliasAllowed(propId, propertyNames)) {
            const suelto = r.norm.get(pn);
            if (suelto) return suelto;
            if (colUrnsWithValue.get(pn)?.has(r.safeUrn)) return '(Unassigned)';
        }
        return colUrnsWithValue.get(propId)?.has(r.safeUrn) ? '(Unassigned)' : '(No aplica)';
    };

    // Nivel 1: recorrer filas YA normalizadas (sin re-parsear en cada clic)
    for (let i = 0; i < preparedRows.length; i++) {
        const r = preparedRows[i];

        // Excluir elementos de modelos ocultos por Sources
        if (hiddenSet.has(r.rawUrn) || hiddenSet.has(r.safeUrn) || hiddenSet.has(r.effectiveModelUrn)) continue;

        const viewerDbId = r.viewerDbId;
        const effectiveModelUrn = r.effectiveModelUrn;

        // Validar si pasa TODOS los filtros activos
        let passesAllFilters = true;
        if (hasAnySelection) {
            for (let selPropId in filterSelections) {
                const sVals = filterSelections[selPropId];
                if (!sVals || sVals.length === 0) continue;
                if (!sVals.includes(getRowValue(r, selPropId))) {
                    passesAllFilters = false;
                    break;
                }
            }
        }

        if (hasAnySelection && passesAllFilters) {
            globalValidDbIds.push({ id: parseInt(viewerDbId, 10), modelUrn: effectiveModelUrn });
        }
        if (passesAllFilters) matches.push({ dbId: Number(viewerDbId),
            externalId: r.externalId, modelUrn: effectiveModelUrn, rowKey: r.rowKey });

        // Construir buckets (Nivel Facetado - OR para sí mismo)
        for (let propId of filterProperties) {
            const val = getRowValue(r, propId);
            if (!val) continue;

            // "(total)": universo del valor entre los Sources visibles, sin importar
            // las selecciones activas (el segundo número de Tandem: 445 (2891)).
            const totMap = totalMaps.get(propId);
            totMap.set(val, (totMap.get(val) || 0) + 1);

            let passesFacet = true;
            if (hasAnySelection) {
                for (let selPropId in filterSelections) {
                    if (selPropId === propId) continue; // Faceted OR
                    const sVals = filterSelections[selPropId];
                    if (!sVals || sVals.length === 0) continue;
                    if (!sVals.includes(getRowValue(r, selPropId))) {
                        passesFacet = false;
                        break;
                    }
                }
            }

            if (passesFacet) {
                const map = bucketMaps.get(propId);
                let bucket = map.get(val);
                if (!bucket) { bucket = { count: 0, dbIds: [] }; map.set(val, bucket); }
                bucket.count++;
                bucket.dbIds.push({ id: viewerDbId, modelUrn: effectiveModelUrn });
            }
        }
    }

    const result = {};
    filterProperties.forEach(propId => {
        const map = bucketMaps.get(propId) || new Map();
        const totMap = totalMaps.get(propId) || new Map();
        const values = [];
        for (const [val, bucket] of map) {
            values.push({
                 value: val,
                 count: bucket.count,
                 totalCount: totMap.get(val) || bucket.count,
                 dbIds: bucket.dbIds
            });
        }
        
        values.sort(function(a, b) {
             // Orden: valores reales (por conteo) → '(Unassigned)' → '(No aplica)'
             const rank = (v) => (v === '(No aplica)') ? 2
                 : (v === '(Unassigned)' || v === 'Unassigned' || v === 'Sin asignar') ? 1 : 0;
             const ra = rank(a.value);
             const rb = rank(b.value);
             if (ra !== rb) return ra - rb;

             if (b.count === a.count) return a.value.localeCompare(b.value);
             return b.count - a.count;
        });
        
        let total = 0;
        values.forEach(function(entry) { total += entry.count; });
        
        // Fake Meta structure to satisfy frontend expected data
        const fakeMeta = {
            id: propId,
            name: propId.split('::')[1] || propId,
            category: propId.split('::')[0] || 'General'
        };

        result[propId] = {
            meta: fakeMeta,
            total: total,
            values: values
        };
    });

    return { buckets: result, globalValidDbIds, matches,
        coverage: { unresolvedRows: _facetCache.prepared.unresolved.filter(urn => !hiddenSet.has(urn)).length } };
}
