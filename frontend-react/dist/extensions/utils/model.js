/**
 * Encuentra todos los nodos hoja en el árbol del modelo.
 * @param {Autodesk.Viewing.Model} model El modelo del visor.
 * @returns {Promise<number[]>} Una promesa que se resuelve con un array de IDs de nodos hoja.
 */
export function findLeafNodes(model) {
    return new Promise((resolve, reject) => {
        model.getObjectTree(
            (tree) => {
                const leaves = [];
                tree.enumNodeChildren(tree.getRootId(), (dbId) => {
                    if (tree.getChildCount(dbId) === 0) {
                        leaves.push(dbId);
                    }
                }, true /* recursive */);
                resolve(leaves);
            },
            (err) => {
                reject(err);
            }
        );
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
        model.getBulkProperties(dbIds, options, (results) => resolve(results), reject);
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
                if (prop.displayName.toLowerCase().replace(/\s/g, '') === alias.toLowerCase().replace(/\s/g, '')) {
                    return prop.displayValue;
                }
            }
        }
    }
    return null;
}
