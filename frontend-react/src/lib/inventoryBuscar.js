/**
 * Buscador de la Planilla: pegar un valor parametrizado en Revit y quedarse con
 * los elementos que lo tienen.
 *
 * Caso real (23-oct-2026, Drenaje): `Datos › 03_05_DSI_CodigoDePartida` lleva a
 * veces el código («06.05.01.04.01») y a veces la descripción entera de la
 * partida («INSTALACION DE TUBERIA ESTRUCTURADA HDPE NTP 21138-2 DN 600 MM, INC.
 * PRUEBA HIDRAULICA»), la misma que en el Excel del presupuesto. Lo pegado y lo
 * del modelo nunca están escritos igual: una coma, una tilde, un espacio de más.
 *
 * Regla (fija, sin IA): se compara la forma COMPACTA de los dos textos —sin
 * tildes, en minúsculas y quedándose solo con letras y números—.
 *   1. valor completo: el parámetro entero coincide con lo pegado;
 *   2. si ninguno coincide entero: el parámetro CONTIENE lo pegado (≥ 3 caracteres).
 * Siempre se dice cuál de las dos se aplicó y en qué parámetro se encontró.
 *
 * Varias líneas pegadas = cualquiera de ellas (con su recuento). Una fila
 * copiada de Excel (celdas separadas por tabulador) se busca por su celda de
 * texto más larga, que es la descripción.
 */

const MINIMO_CONTIENE = 3;

/** «DN 1000 MM, INC.» → «dn1000mminc». */
export function compacto(s) {
    return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Lo pegado → lista de búsquedas: una por línea; de una fila de Excel, su celda más larga. */
export function lineasDeBusqueda(texto) {
    return String(texto ?? '').split(/\r?\n/).map(linea => {
        const celdas = linea.split('\t').map(c => c.trim()).filter(Boolean);
        if (celdas.length <= 1) return linea.trim();
        // La descripción: la celda con más letras (no el código, la unidad ni la cantidad).
        return celdas.reduce((a, b) => (b.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '').length > a.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '').length ? b : a));
    }).filter(l => compacto(l).length > 0);
}

/**
 * Índice: por fila, los pares [campo, forma compacta] con dato. Se arma una vez
 * por carga de datos (Drenaje: 8.378 filas × ~70 valores).
 */
export function crearIndice(filas, campos) {
    const pares = [];
    // Valores distintos por parámetro (para los parecidos): clave = campo + forma compacta.
    const valores = new Map();
    filas.forEach((fila, i) => {
        const propios = [];
        for (const campo of campos) {
            const v = fila[campo];
            if (v === null || v === undefined || v === '') continue;
            const texto = Array.isArray(v) ? v.join(' ') : String(v);
            const c = compacto(texto);
            if (!c) continue;
            propios.push([campo, c]);
            const clave = `${campo}|${c}`;
            const e = valores.get(clave);
            if (e) e.filas.push(i);
            else valores.set(clave, { clave, campo, valor: texto, compacto: c, filas: [i] });
        }
        pares.push(propios);
    });
    return { pares, valores };
}

/**
 * Busca en el índice.
 *   soloCampo    limita a un parámetro
 *   permitidas   Set de índices de fila donde buscar (lo seleccionado); null = todas
 *   confirmados  claves de valores parecidos que el usuario confirmó
 * Devuelve { filas: Set de índices, lineas: [{texto, n, modo}], porCampo: [[campo, n]], confirmados: n }.
 * `modo` por línea: 'completo' | 'contiene' | 'nada'.
 */
export function buscar(indice, texto, { soloCampo = null, permitidas = null, confirmados = [] } = {}) {
    const lineas = lineasDeBusqueda(texto);
    const filas = new Set();
    const porCampo = new Map();
    const resumen = [];
    const anotar = (i, campo) => { filas.add(i); porCampo.set(campo, (porCampo.get(campo) || new Set()).add(i)); };
    for (const linea of lineas) {
        const q = compacto(linea);
        let modo = 'completo';
        let aciertos = recorrer(indice.pares, (c) => c === q, soloCampo, permitidas);
        if (!aciertos.length && q.length >= MINIMO_CONTIENE) { modo = 'contiene'; aciertos = recorrer(indice.pares, (c) => c.includes(q), soloCampo, permitidas); }
        if (!aciertos.length) modo = 'nada';
        const propias = new Set();
        for (const [i, campo] of aciertos) { propias.add(i); anotar(i, campo); }
        resumen.push({ texto: linea, n: propias.size, modo });
    }
    let nConfirmados = 0;
    for (const clave of confirmados) {
        const e = indice.valores.get(clave);
        if (!e) continue;
        for (const i of e.filas) if (!permitidas || permitidas.has(i)) { anotar(i, e.campo); nConfirmados++; }
    }
    return {
        filas, lineas: resumen, confirmados: nConfirmados,
        porCampo: [...porCampo.entries()].map(([c, s]) => [c, s.size]).sort((a, b) => b[1] - a[1]),
    };
}

function recorrer(pares, cumple, soloCampo, permitidas) {
    const out = [];
    for (let i = 0; i < pares.length; i++) {
        if (permitidas && !permitidas.has(i)) continue;
        for (const [campo, c] of pares[i]) {
            if (soloCampo && campo !== soloCampo) continue;
            if (cumple(c)) out.push([i, campo]);
        }
    }
    return out;
}

// ── Parecidos ───────────────────────────────────────────────────────────────
//
// Cuando lo pegado no está escrito igual en el modelo («PRUEBA HIDRAULICA DE
// TUBERIA HDPE DN 1000 MM A ZANJA TAPADA» frente a «INSTALACION DE TUBERIA
// ESTRUCTURADA HDPE … DN 1000 MM, INC. PRUEBA HIDRAULICA»), se proponen los
// valores que se le parecen y el usuario confirma cuáles valen. Regla fija:
//   - los NÚMEROS de lo pegado tienen que estar todos (DN 1000 nunca es DN 1500);
//   - el parecido es la proporción de palabras en común (Dice), sin las vacías.

const VACIAS = new Set(['de', 'la', 'el', 'los', 'las', 'y', 'a', 'en', 'con', 'del', 'por', 'para', 'al', 'e', 'o', 'u']);
const esNumero = t => /[0-9]/.test(t);

export function palabras(s) {
    return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .split(/[^a-z0-9]+/).filter(t => t && !VACIAS.has(t));
}

/** Parecido entre lo pegado y un valor: 0–1, o 0 si falta algún número. */
export function parecido(q, valor) {
    const tq = palabras(q), tv = new Set(palabras(valor));
    if (!tq.filter(esNumero).every(n => tv.has(n))) return 0;
    const pq = new Set(tq.filter(t => !esNumero(t)));
    const pv = [...tv].filter(t => !esNumero(t));
    // Si uno de los dos no tiene palabras («1000ø»), se mide sobre todo: un número
    // suelto no se parece a una descripción entera solo por compartir el número.
    if (!pq.size || !pv.length) {
        const sq = new Set(tq);
        return (2 * [...sq].filter(t => tv.has(t)).length) / (sq.size + tv.size);
    }
    const comunes = [...pq].filter(t => tv.has(t)).length;
    return (2 * comunes) / (pq.size + pv.length);
}

/**
 * Valores parecidos a cada línea que no hayan salido ya (ni completos ni por contener).
 * Devuelve [{ clave, campo, valor, n, puntos (0–100), linea }] de mayor a menor parecido.
 */
export function parecidos(indice, texto, { soloCampo = null, permitidas = null, minimo = 0.4, maximo = 8 } = {}) {
    const out = [];
    for (const linea of lineasDeBusqueda(texto)) {
        const q = compacto(linea);
        if (palabras(linea).length < 2) continue; // una palabra suelta ya la cubre «contiene»
        for (const e of indice.valores.values()) {
            if (soloCampo && e.campo !== soloCampo) continue;
            if (e.compacto === q || e.compacto.includes(q)) continue;
            const n = permitidas ? e.filas.filter(i => permitidas.has(i)).length : e.filas.length;
            if (!n) continue;
            const p = parecido(linea, e.valor);
            if (p >= minimo) out.push({ clave: e.clave, campo: e.campo, valor: e.valor, n, puntos: Math.round(p * 100), linea });
        }
    }
    return out.sort((a, b) => b.puntos - a.puntos || b.n - a.n).slice(0, maximo);
}
