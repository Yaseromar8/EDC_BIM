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
                    // la calle de la que cuelga: el panel la nombra para que el
                    // % de arriba (la calle) no se lea como el de abajo (el tramo)
                    calle_id: g.calle_id,
                    calle: (g.calle_nombre || '').replace(/^[\d.]+\s*-\s*/, ''),
                    // QUÉ ESTÁ Y QUÉ FALTA — conteos exactos, sin supuestos:
                    // salen del valorizado, que es un hecho contractual firmado
                    lista: g.n_lista,                   // te la pagaron entera
                    proceso: g.n_proceso,               // empezada, no cerrada
                    falta: g.n_falta,                   // sin valorizar aún
                    falta_soles: g.falta_soles,
                    // EL DATO BUENO — el metrado de ESTE tramo por su precio,
                    // medido por el cronograma P6 tramo por tramo. No prorratea
                    // nada. null donde P6 no desglosa esa partida (ahí manda el
                    // número de la calle, que en las estructuras sí es exacto).
                    valor_tramo: g.valor_tramo,
                    ejecutado_tramo_pct: g.ejecutado_tramo_pct,
                    falta_tramo_soles: g.falta_tramo_soles,
                    con_tramo: g.n_con_tramo,
                    // La plata separada a propósito: en drenaje una partida
                    // ("excavación DN450 prof 1.51-2.00") cubre varios tramos.
                    // Sumar su parcial íntegro a cada tramo infla el frente
                    // hasta 4x. 'propio' es lo que sí es de este tramo.
                    valor_propio: g.valor_propio,
                    valor_compartido: g.valor_compartido,
                    compartidas: g.n_compartidas,
                    valor: g.valor,                     // total tocado (NO es "su" plata)
                    valorizado_pct: g.valorizado_pct,   // lo que ya te pagaron (TODAS las partidas)
                    ejecutado_pct: g.ejecutado_pct,     // null = sin mapeo de campo
                    // EL PAR COMPARABLE: los dos porcentajes sobre las MISMAS
                    // partidas. El valorizado de arriba cubre todo el frente y
                    // el ejecutado solo lo que tiene dato de campo; ponerlos uno
                    // al lado del otro hacía ver sobrepago donde solo falta dato
                    // (SP-SU-2 marcaba 50.9 vs 42.6 cuando era 41.5 vs 42.6).
                    valorizado_comp_pct: g.valorizado_comp_pct,
                    cobertura_comp_pct: g.cobertura_comp_pct,
                    // El metrado cambió respecto al contrato. Se cuenta en
                    // PARTIDAS y sale del replanteo del RIBA, no de derivarlo
                    // del costo: sumar m con m3 con kg no significa nada.
                    n_mayor: g.n_mayor,
                    n_menor: g.n_menor,
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
