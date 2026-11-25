/**
 * CALCULAR LAS FÓRMULAS DE UNA HOJA QUE LLEGÓ SIN RESULTADOS (25-nov-2026, docs/visor/71).
 *
 * Un Excel generado por un programa (no guardado desde Excel) trae las fórmulas pero no sus resultados: SheetJS,
 * con `sheetStubs`, entrega esas celdas como `{ t: 'z', f: '…' }`. El dueño: «¿no se supone que pueda cargar el Excel
 * que quiero?». Aquí se evalúa LA FÓRMULA ESCRITA EN CADA CELDA, la del propio libro — no una regla nuestra: en la
 * Val. 13 unas filas llevan margen 0,05 y otras 0,005, y cada una se calcula con la suya.
 *
 * Lo que entiende: números, textos, referencias de la misma hoja (A1, $A$1), + - * / ^ &, = <> < > <= >=, y las
 * funciones IF, ROUND, N, AND, OR, NOT, ABS, MIN, MAX, IFERROR, SUM, SUMIF y SUMIFS (rangos de la misma hoja).
 * Lo que no entiende devuelve `undefined`: esa celda queda sin valor y quien lee lo dice. Nunca se inventa.
 *
 * Validado contra Microsoft Excel: pruebas/valorizacionDelMes.prueba.mjs compara celda a celda el libro sin calcular,
 * calculado aquí, con el mismo libro guardado desde Excel.
 */

const ERROR = Symbol('error');

function columnaANumero(letras) {
    let n = 0;
    for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
}
const direccion = (col, fila) => {
    let s = '', n = col + 1;
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s + (fila + 1);
};

function tokens(formula) {
    const t = [];
    const re = /\s*(?:("(?:[^"]|"")*")|(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?)(?![A-Z(])|([A-Z][A-Z0-9.]*)(?=\()|(\d+(?:\.\d+)?(?:E[+-]?\d+)?)|(<>|<=|>=|[-+*/^&=<>(),:]))/giy;
    let m;
    re.lastIndex = 0;
    while (re.lastIndex < formula.length) {
        const pos = re.lastIndex;
        m = re.exec(formula);
        if (!m || m.index !== pos) {
            if (/^\s*$/.test(formula.slice(pos))) break;
            throw new Error('fórmula no entendida');
        }
        if (m[1] != null) t.push({ k: 'txt', v: m[1].slice(1, -1).replace(/""/g, '"') });
        else if (m[2] != null) t.push({ k: 'ref', v: m[2].replace(/\$/g, '').toUpperCase() });
        else if (m[3] != null) t.push({ k: 'fn', v: m[3].toUpperCase() });
        else if (m[4] != null) t.push({ k: 'num', v: Number(m[4]) });
        else t.push({ k: 'op', v: m[5] });
    }
    return t;
}

// Gramática (de menor a mayor precedencia): comparación, &, + -, * /, ^, unario, primario.
function parsear(formula) {
    const t = tokens(formula);
    let i = 0;
    const ver = () => t[i];
    const tomar = (v) => { const x = t[i]; if (v != null && (!x || x.v !== v)) throw new Error('esperaba ' + v); i++; return x; };
    const comparacion = () => {
        let a = concatenacion();
        while (ver() && ver().k === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(ver().v)) { const op = tomar().v; a = { op, a, b: concatenacion() }; }
        return a;
    };
    const concatenacion = () => {
        let a = suma();
        while (ver() && ver().v === '&') { tomar(); a = { op: '&', a, b: suma() }; }
        return a;
    };
    const suma = () => {
        let a = producto();
        while (ver() && ver().k === 'op' && (ver().v === '+' || ver().v === '-')) { const op = tomar().v; a = { op, a, b: producto() }; }
        return a;
    };
    const producto = () => {
        let a = potencia();
        while (ver() && ver().k === 'op' && (ver().v === '*' || ver().v === '/')) { const op = tomar().v; a = { op, a, b: potencia() }; }
        return a;
    };
    const potencia = () => {
        let a = unario();
        while (ver() && ver().v === '^') { tomar(); a = { op: '^', a, b: unario() }; }
        return a;
    };
    const unario = () => {
        if (ver() && ver().k === 'op' && (ver().v === '-' || ver().v === '+')) { const op = tomar().v; const x = unario(); return op === '-' ? { op: 'neg', a: x } : x; }
        return primario();
    };
    const primario = () => {
        const x = ver();
        if (!x) throw new Error('fin inesperado');
        if (x.k === 'num' || x.k === 'txt') { i++; return { lit: x.v }; }
        if (x.k === 'ref') { i++; return x.v.includes(':') ? { rango: x.v } : { ref: x.v }; }
        if (x.k === 'fn') {
            i++; tomar('(');
            const args = [];
            if (!(ver() && ver().v === ')')) {
                args.push(comparacion());
                while (ver() && ver().v === ',') { tomar(); args.push(comparacion()); }
            }
            tomar(')');
            return { fn: x.v, args };
        }
        if (x.v === '(') { i++; const e = comparacion(); tomar(')'); return e; }
        throw new Error('símbolo inesperado');
    };
    const arbol = comparacion();
    if (i !== t.length) throw new Error('sobra texto');
    return arbol;
}

// ROUND de Excel: la mitad se aleja de cero, y sin el ruido binario (0,285 → 0,29).
function redondear(x, n) {
    const f = Math.pow(10, n);
    const v = Math.abs(x) * f;
    const r = Math.round(Number(v.toPrecision(15)));
    return Math.sign(x) * r / f;
}

function aNumero(v) {
    if (v === ERROR) return ERROR;
    if (v === '' || v == null) return 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'number') return v;
    const n = Number(String(v).trim());
    return Number.isFinite(n) && String(v).trim() !== '' ? n : ERROR;
}
function comparar(a, b, op) {
    // Vacío frente a texto es "", frente a número es 0 (como Excel).
    if (a == null) a = typeof b === 'string' ? '' : 0;
    if (b == null) b = typeof a === 'string' ? '' : 0;
    let c;
    if (typeof a === 'number' && typeof b === 'number') c = a === b ? 0 : (a < b ? -1 : 1);
    else if (typeof a === 'string' && typeof b === 'string') { const x = a.toUpperCase(), y = b.toUpperCase(); c = x === y ? 0 : (x < y ? -1 : 1); }
    else if (typeof a === 'boolean' && typeof b === 'boolean') c = a === b ? 0 : (a ? 1 : -1);
    else {
        // Tipos distintos: número < texto < lógico.
        const rango = v => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
        c = rango(a) - rango(b);
    }
    return { '=': c === 0, '<>': c !== 0, '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0 }[op];
}

/**
 * Calcula las celdas con fórmula y sin valor de una hoja de SheetJS (leída con `sheetStubs: true`) y les pone el
 * resultado en `v` (y `t`). Devuelve { calculadas, sinCalcular } (las que no se pudieron, con la razón de la primera).
 */
export function calcularHoja(hoja) {
    const memo = new Map();
    const enCurso = new Set();
    let razon = '';

    const valorDe = (dir) => {
        const c = hoja[dir];
        if (!c) return null;                                 // vacía
        // Una celda de la que se depende y que no se pudo calcular contamina el resultado: sin ella, nada (si no, un
        // SUM de celdas sin calcular daría 0, un número inventado).
        if (c.f && (c.t === 'z' || c.v === undefined)) { const v = evaluarCelda(dir); return v === undefined ? ERROR : v; }
        if (c.t === 'z') return null;
        return c.v;
    };
    const rango = (txt) => {
        const [a, b] = txt.split(':');
        const ma = /^([A-Z]+)(\d+)$/.exec(a), mb = /^([A-Z]+)(\d+)$/.exec(b);
        const c0 = columnaANumero(ma[1]), c1 = columnaANumero(mb[1]);
        const f0 = Number(ma[2]) - 1, f1 = Number(mb[2]) - 1;
        const celdas = [];
        for (let f = Math.min(f0, f1); f <= Math.max(f0, f1); f++)
            for (let col = Math.min(c0, c1); col <= Math.max(c0, c1); col++) celdas.push(direccion(col, f));
        return celdas;
    };
    const criterio = (v, crit) => {
        const m = /^(<>|<=|>=|=|<|>)?(.*)$/.exec(String(crit));
        const op = m[1] || '=';
        const lado = m[2];
        const num = Number(lado);
        const b = lado !== '' && Number.isFinite(num) ? num : lado;
        if (typeof b === 'string' && typeof v === 'number') return op === '<>';
        return comparar(v == null ? (typeof b === 'string' ? '' : 0) : v, b, op);
    };

    const ev = (n) => {
        if ('lit' in n) return n.lit;
        if (n.ref) return valorDe(n.ref);
        if (n.rango) return ERROR;                            // un rango suelto sólo vale dentro de SUM/SUMIF(S)
        if (n.op === 'neg') { const a = aNumero(ev(n.a)); return a === ERROR ? ERROR : -a; }
        if (n.op) {
            if (['=', '<>', '<', '>', '<=', '>='].includes(n.op)) {
                const a = ev(n.a), b = ev(n.b);
                if (a === ERROR || b === ERROR) return ERROR;
                return comparar(a, b, n.op);
            }
            if (n.op === '&') { const a = ev(n.a), b = ev(n.b); return a === ERROR || b === ERROR ? ERROR : String(a ?? '') + String(b ?? ''); }
            const a = aNumero(ev(n.a)), b = aNumero(ev(n.b));
            if (a === ERROR || b === ERROR) return ERROR;
            if (n.op === '+') return a + b;
            if (n.op === '-') return a - b;
            if (n.op === '*') return a * b;
            if (n.op === '/') return b === 0 ? ERROR : a / b;
            if (n.op === '^') return Math.pow(a, b);
        }
        if (n.fn) {
            const A = n.args;
            switch (n.fn) {
                case 'IF': {
                    const c = ev(A[0]);
                    if (c === ERROR) return ERROR;
                    const verdad = typeof c === 'boolean' ? c : aNumero(c) !== 0 && aNumero(c) !== ERROR;
                    return verdad ? (A[1] ? ev(A[1]) : true) : (A[2] ? ev(A[2]) : false);
                }
                case 'IFERROR': { const v = ev(A[0]); return v === ERROR ? ev(A[1]) : v; }
                case 'ROUND': {
                    const x = aNumero(ev(A[0])), d = aNumero(ev(A[1]));
                    return x === ERROR || d === ERROR ? ERROR : redondear(x, d);
                }
                case 'N': { const v = ev(A[0]); return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0; }
                case 'ABS': { const x = aNumero(ev(A[0])); return x === ERROR ? ERROR : Math.abs(x); }
                case 'AND': return A.every(a => { const v = ev(a); return typeof v === 'boolean' ? v : aNumero(v) !== 0; });
                case 'OR': return A.some(a => { const v = ev(a); return typeof v === 'boolean' ? v : aNumero(v) !== 0; });
                case 'NOT': { const v = ev(A[0]); return !(typeof v === 'boolean' ? v : aNumero(v) !== 0); }
                case 'MIN': case 'MAX': case 'SUM': {
                    const nums = [];
                    for (const a of A) {
                        if (a.rango) for (const d of rango(a.rango)) { const v = valorDe(d); if (v === ERROR) return ERROR; if (typeof v === 'number') nums.push(v); }
                        else { const v = aNumero(ev(a)); if (v === ERROR) return ERROR; nums.push(v); }
                    }
                    if (n.fn === 'SUM') return nums.reduce((s, x) => s + x, 0);
                    return nums.length ? Math[n.fn.toLowerCase()](...nums) : 0;
                }
                case 'SUMIF': case 'SUMIFS': {
                    // SUMIF(rango, criterio, [suma]) · SUMIFS(suma, rango1, criterio1, …)
                    let suma, pares;
                    if (n.fn === 'SUMIF') { suma = rango((A[2] || A[0]).rango); pares = [[rango(A[0].rango), ev(A[1])]]; }
                    else { suma = rango(A[0].rango); pares = []; for (let k = 1; k < A.length; k += 2) pares.push([rango(A[k].rango), ev(A[k + 1])]); }
                    let s = 0;
                    for (let idx = 0; idx < suma.length; idx++) {
                        const vals = pares.map(([r]) => valorDe(r[idx]));
                        if (vals.includes(ERROR)) return ERROR;
                        if (pares.every(([, crit], k) => criterio(vals[k], crit))) {
                            const v = valorDe(suma[idx]);
                            if (v === ERROR) return ERROR;
                            if (typeof v === 'number') s += v;
                        }
                    }
                    return s;
                }
                default:
                    throw new Error('función ' + n.fn + ' no soportada');
            }
        }
        return ERROR;
    };

    function evaluarCelda(dir) {
        if (memo.has(dir)) return memo.get(dir);
        if (enCurso.has(dir)) { memo.set(dir, ERROR); return ERROR; }   // referencia circular
        enCurso.add(dir);
        let v;
        try { v = ev(parsear(hoja[dir].f)); } catch (e) { razon = razon || `${dir}: ${e.message}`; v = undefined; }
        enCurso.delete(dir);
        memo.set(dir, v);
        return v;
    }

    let calculadas = 0, sinCalcular = 0;
    for (const dir of Object.keys(hoja)) {
        if (dir[0] === '!') continue;
        const c = hoja[dir];
        if (!c || !c.f || !(c.t === 'z' || c.v === undefined)) continue;
        const v = evaluarCelda(dir);
        if (v === undefined || v === ERROR) { sinCalcular++; delete c.v; c.t = 'z'; continue; }
        c.v = v;
        c.t = typeof v === 'number' ? 'n' : typeof v === 'boolean' ? 'b' : 's';
        calculadas++;
    }
    return { calculadas, sinCalcular, razon };
}
