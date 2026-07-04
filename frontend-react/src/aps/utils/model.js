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

export function calculateBucketsFromPostgres(allData, filterProperties, filterSelections, rosettaToExtIdReversed, hiddenModelUrns = []) {
    // allData is array of objects: { dbId: 'UUID', model_urn: 'URN', <PropName>: 'Value', ... }
    // rosettaToExtIdReversed: URN -> ExternalId -> dbId
    // hiddenModelUrns: array of URNs que el usuario ocultó en Sources (formato React/raw)
    
    // Pre-compute safe versions of hidden URNs for fast lookup
    const hiddenSet = new Set();
    (hiddenModelUrns || []).forEach(u => {
        hiddenSet.add(u);
        hiddenSet.add(String(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
    });
    
    // We only care about models that are currently active in rosettaToExtIdReversed
    const activeUrns = Object.keys(rosettaToExtIdReversed || {});
    
    // FALLBACK GLOBAL: Pre-construir lookup extId -> {dbId, urn} para todos los URNs.
    // Necesario para IFC de Civil 3D cuyo source_urn en postgres puede diferir del URN del viewer.
    const globalExtIdLookup = {};
    if (rosettaToExtIdReversed) {
        Object.entries(rosettaToExtIdReversed).forEach(([loadedUrn, mapping]) => {
            Object.entries(mapping).forEach(([extId, dbId]) => {
                if (!globalExtIdLookup[extId]) {
                    globalExtIdLookup[extId] = { dbId, urn: loadedUrn };
                }
            });
        });
    }
    
    // Preparar buckets vacíos para las propiedades solicitadas (filterProperties)
    const bucketMaps = {};
    filterProperties.forEach(propId => {
        bucketMaps[propId] = {}; // val -> { count, dbIds: [{id, modelUrn}] }
    });

    const hasAnySelection = Object.keys(filterSelections).some(k => filterSelections[k] && filterSelections[k].length > 0);
    const globalValidDbIds = [];

    // ── Semántica de "(Unassigned)" para AUDITORÍA ───────────────────────────
    // 1) Solo lo VACÍO de verdad cuenta como sin valor. Cualquier cosa tecleada
    //    (un '-', una letra, un signo por error) es un valor y se muestra como
    //    su propio bucket — así la auditoría detecta datos mal llenados.
    //    Los ARREGLOS multi-slot se aplanan uniendo solo las casillas con
    //    contenido (["",""] → vacío; ["PQ08_1",""] → "PQ08_1"; ["-",""] → "-").
    const normVal = (raw) => {
        if (Array.isArray(raw)) {
            return raw.map(x => String(x ?? '').trim()).filter(Boolean).join(', ');
        }
        return String(raw ?? '').trim();
    };

    // 2) "(Unassigned)" se ACOTA a los modelos donde el parámetro EXISTE:
    //    un elemento de un modelo que ni siquiera usa ese parámetro no es
    //    "sin asignar" — simplemente no aplica, y no debe engordar el bucket
    //    (antes: todos los elementos de los demás modelos del frente caían ahí
    //    → "(Unassigned)" ≈ todo el modelo).
    const propScope = Array.from(new Set([...filterProperties, ...Object.keys(filterSelections || {})]))
        .filter(p => p !== 'Standard::Sources');
    const propUrnsWithValue = {};
    propScope.forEach(propId => { propUrnsWithValue[propId] = new Set(); });
    allData.forEach(row => {
        const u = row.source_urn || row.model_urn;
        const su = String(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        for (const propId of propScope) {
            const pn = propId.split('::')[1] || propId;
            if (normVal(row[pn])) propUrnsWithValue[propId].add(su);
        }
    });

    // Valor efectivo de una fila para una propiedad (AUDITORÍA COMPLETA:
    // ningún elemento vinculado del frente desaparece — la suma de buckets
    // es el total de elementos):
    //   valor real (incluye typos)  → su propio bucket
    //   '(Unassigned)'              → vacío real, en modelos que SÍ usan el parámetro
    //   '(No aplica)'               → el modelo vinculado no trae ese parámetro
    const getRowValue = (row, propId, safeUrn) => {
        if (propId === 'Standard::Sources') {
            return String(row.source_urn || row.model_urn).trim();
        }
        const pn = propId.split('::')[1] || propId;
        const v = normVal(row[pn]);
        if (v) return v;
        return propUrnsWithValue[propId]?.has(safeUrn) ? '(Unassigned)' : '(No aplica)';
    };

    // Nivel 1: Filtrar sólo data activa en el visor (rosetta) y filtrado global
    allData.forEach(row => {
        const extId = row.dbId; // Recordatorio: en mappedData, pospusimos UUID a dbId
        const urn = row.source_urn || row.model_urn;
        const safeUrn = String(urn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        
        // Excluir elementos de modelos ocultos por Sources
        if (hiddenSet.has(urn) || hiddenSet.has(safeUrn)) {
            return;
        }
        
        // Evitar fantasmas:
        // Si el elemento no existe en la piedra Rosetta activa de la UI, ignorar
        const urnDict = rosettaToExtIdReversed[urn] || rosettaToExtIdReversed[safeUrn];
        let viewerDbId;
        let effectiveModelUrn = safeUrn;
        
        if (urnDict && urnDict[extId] !== undefined) {
            viewerDbId = urnDict[extId];
        } else if (globalExtIdLookup[extId]) {
            // FALLBACK: extId encontrado en otro URN (IFC con versión/encoding diferente)
            viewerDbId = globalExtIdLookup[extId].dbId;
            effectiveModelUrn = globalExtIdLookup[extId].urn;
        } else {
            return; // No existe en ningún modelo cargado
        }

        // Validar si pasa TODOS los filtros activos
        let passesAllFilters = true;
        if (hasAnySelection) {
            for (let selPropId in filterSelections) {
                const sVals = filterSelections[selPropId];
                if (!sVals || sVals.length === 0) continue;

                // null = el parámetro no aplica a este modelo → no puede
                // matchear ninguna selección (ni siquiera '(Unassigned)').
                const rowVal = getRowValue(row, selPropId, safeUrn);
                if (rowVal === null || !sVals.includes(rowVal)) {
                    passesAllFilters = false;
                    break;
                }
            }
        }

        if (hasAnySelection && passesAllFilters) {
            globalValidDbIds.push({ id: parseInt(viewerDbId, 10), modelUrn: effectiveModelUrn });
        }

        // Construir buckets (Nivel Facetado - OR para sí mismo)
        for(let propId of filterProperties) {
            // null = parámetro no aplica a este modelo → la fila no participa
            // en los buckets de esta propiedad (tampoco en '(Unassigned)').
            const val = getRowValue(row, propId, safeUrn);
            if (val === null || !val) continue;

            let passesFacet = true;
            if (hasAnySelection) {
                for (let selPropId in filterSelections) {
                    if (selPropId === propId) continue; // Faceted OR
                    const sVals = filterSelections[selPropId];
                    if (!sVals || sVals.length === 0) continue;

                    const rowVal = getRowValue(row, selPropId, safeUrn);
                    if (rowVal === null || !sVals.includes(rowVal)) {
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
                bucketMaps[propId][val].dbIds.push({ id: viewerDbId, modelUrn: effectiveModelUrn });
            }
        }
    });

    const result = {};
    filterProperties.forEach(propId => {
        const map = bucketMaps[propId];
        const values = [];
        for (let val in map) {
            values.push({
                 value: val,
                 count: map[val].count,
                 dbIds: map[val].dbIds
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

    return { buckets: result, globalValidDbIds };
}
