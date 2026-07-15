// ── Caché local del inventario CDE (IndexedDB) ──────────────────────────────
// Patrón estándar de los software grandes (Tandem/ACC/Notion): el cliente
// guarda el dataset una vez; en cada apertura compara una HUELLA de versión
// (~100 bytes) con el servidor y solo re-descarga si algo cambió.
// localStorage no sirve aquí (límite ~5MB); IndexedDB maneja cientos de MB.

const DB_NAME = 'edc_cde';
const STORE = 'inventory';

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE)) {
                req.result.createObjectStore(STORE);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function getCachedInventory(key) {
    try {
        const db = await openDb();
        return await new Promise((resolve, reject) => {
            const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    } catch {
        return null; // sin caché no se rompe nada: se descarga normal
    }
}

export async function setCachedInventory(key, value) {
    try {
        const db = await openDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(value, key);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn('[CDE cache] No se pudo guardar el inventario local:', e);
    }
}
