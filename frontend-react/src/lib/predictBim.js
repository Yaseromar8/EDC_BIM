/**
 * Cliente del cerebro PREDICT (obra PQT-8).
 * ---------------------------------------------------------------------------
 * Traduce el código de agrupación del modelo (el mismo valor del parámetro
 * compartido de Revit) a las partidas del expediente: metrado, precio,
 * valorizado. El visor solo aporta el código; el dato vive en PREDICT y
 * siempre llega fresco — al cargar una valorización nueva no hay que tocar
 * ni el modelo ni el visor.
 *
 * DOS NIVELES para que el hover nunca espere a la red:
 *   iniciar()          1 llamada al arrancar → catálogo completo en memoria
 *   resumen(codigo)    instantáneo, sin red   → para el hover
 *   detalle(codigo)    1 llamada, cacheada    → para el panel ampliado
 *
 * Nota: se usa URL absoluta a propósito. El proxy /api de este visor apunta a
 * su propio backend (3000); PREDICT vive aparte en el 5001.
 */

const BASE = import.meta.env?.VITE_PREDICT_URL || 'http://127.0.0.1:5001';
const GRAPH = import.meta.env?.VITE_PREDICT_GRAPH || 'predict_pqt8_sinohydro';
const TIMEOUT_MS = 8000;

const _catalogo = new Map();   // codigo -> resumen (precargado)
const _detalles = new Map();   // codigo -> detalle (bajo demanda)
const _enVuelo = new Map();    // evita pedir dos veces lo mismo a la vez
let _listo = false;
let _iniciando = null;

const _url = (ruta) => `${BASE}/api/graph/bim/${GRAPH}${ruta}`;

async function _pedir(url) {
    // Timeout propio: si PREDICT está apagado, el visor no se queda colgado
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const r = await fetch(url, { signal: ctrl.signal });
        if (!r.ok && r.status !== 404) throw new Error(`HTTP ${r.status}`);
        return await r.json();
    } finally {
        clearTimeout(t);
    }
}

/** Precarga el catálogo. Idempotente: llamarlo varias veces no duplica trabajo. */
export function iniciarPredict() {
    if (_listo) return Promise.resolve(true);
    if (_iniciando) return _iniciando;
    _iniciando = (async () => {
        try {
            const j = await _pedir(_url(''));
            if (!j.success) throw new Error(j.error || 'respuesta inválida');
            _catalogo.clear();
            for (const g of (j.data || [])) {
                _catalogo.set(g.codigo, {
                    codigo: g.codigo,
                    partidas: g.n_partidas,
                    valor: g.valor,
                    valorizado_pct: g.valorizado_pct,   // lo que ya te pagaron
                    ejecutado_pct: g.ejecutado_pct,     // null = sin mapeo de campo
                    origen: g.origen,
                });
            }
            _listo = true;
            return true;
        } catch {
            _listo = false;                 // PREDICT apagado: el visor sigue igual
            return false;
        } finally {
            _iniciando = null;
        }
    })();
    return _iniciando;
}

/** HOVER — de memoria, sin red. null si ese código no está en el expediente. */
export function resumenPredict(codigo) {
    if (!codigo) return null;
    return _catalogo.get(String(codigo).trim()) || null;
}

/** Las partidas del grupo, agrupadas por su nodo del expediente. Cacheado. */
export async function detallePredict(codigo) {
    const cod = String(codigo || '').trim();
    if (!cod) return null;
    if (_detalles.has(cod)) return _detalles.get(cod);
    if (_enVuelo.has(cod)) return _enVuelo.get(cod);

    const p = (async () => {
        try {
            const j = await _pedir(_url('/' + encodeURIComponent(cod)));
            const d = j.success ? (j.data || null) : null;
            _detalles.set(cod, d);
            return d;
        } catch {
            return null;                    // no se cachea el fallo: se reintenta
        } finally {
            _enVuelo.delete(cod);
        }
    })();
    _enVuelo.set(cod, p);
    return p;
}

export const predictListo = () => _listo;
export const codigosPredict = () => [..._catalogo.keys()];

/** Cuáles códigos del modelo NO están mapeados en el expediente. */
export function coberturaPredict(codigosDelModelo = []) {
    const modelo = new Set(codigosDelModelo.map(c => String(c || '').trim()).filter(Boolean));
    const sinMapear = [...modelo].filter(c => !_catalogo.has(c)).sort();
    return {
        total: modelo.size,
        mapeados: modelo.size - sinMapear.length,
        pct: modelo.size ? Math.round(((modelo.size - sinMapear.length) / modelo.size) * 1000) / 10 : 0,
        sin_mapear: sinMapear,
    };
}

/** S/ 1,234,567 */
export const soles = (v) =>
    'S/ ' + (Number(v) || 0).toLocaleString('es-PE', { maximumFractionDigits: 0 });
