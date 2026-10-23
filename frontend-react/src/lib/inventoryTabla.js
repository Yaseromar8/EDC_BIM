// INVENTORY · el motor de la tabla (23-oct-2026).
//
// Lógica pura, sin React ni visor: leer valores, filtrar, ordenar, agrupar en
// varios niveles y calcular totales. La pantalla solo pinta lo que devuelve.
//
// Por qué existe (docs/visor/16, 17 y 18): el embudo del panel no hacía nada,
// se agrupaba en un solo nivel, no se podía ordenar y los totales solo sumaban
// columnas elegidas a mano, sin mirar la unidad. Tandem (medido el 23-oct)
// filtra solo con Y y elige Suma o Promedio por su cuenta; aquí además:
// grupos Y / O, «entre» y fechas, el cálculo de cada columna se puede cambiar
// y los totales nunca mezclan unidades.
//
// Reglas que no se negocian: sin IA, todo determinista y rastreable. Un valor
// que no se puede leer como número no se suma como 0: se cuenta aparte.

const SIN_VALOR = '(sin valor)';

// ── Leer un valor ───────────────────────────────────────────────────────────

const UNIDADES = { 'm^2': 'm²', 'm2': 'm²', 'm^3': 'm³', 'm3': 'm³', 'cm^2': 'cm²', 'cm^3': 'cm³', 'mm^2': 'mm²', 'mm^3': 'mm³' };

function numeroDeTexto(s) {
    // «1,234.5» (coma de miles) · «1234,5» (coma decimal) · «0.900»
    if (s.includes(',') && s.includes('.')) return Number(s.replace(/,/g, ''));
    if (s.includes(',')) return Number(s.replace(',', '.'));
    return Number(s);
}

function fechaDeTexto(s) {
    let m = /^(\d{4})(\d{2})(\d{2})$/.exec(s) || /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return null;
    const a = +m[1], mes = +m[2], d = +m[3];
    if (a < 1900 || a > 2200 || mes < 1 || mes > 12 || d < 1 || d > 31) return null;
    return Date.UTC(a, mes - 1, d);
}

/** {tipo:'vacio'|'numero'|'fecha'|'texto', num?, unidad?, fecha?, texto} */
export function leerValor(raw) {
    if (raw === null || raw === undefined) return { tipo: 'vacio', texto: '' };
    if (typeof raw === 'number') return Number.isFinite(raw) ? { tipo: 'numero', num: raw, unidad: '', texto: String(raw) } : { tipo: 'vacio', texto: '' };
    const texto = String(raw).trim();
    if (texto === '') return { tipo: 'vacio', texto };
    const fecha = fechaDeTexto(texto);
    if (fecha !== null) return { tipo: 'fecha', fecha, texto };
    const m = /^(-?\d[\d.,]*)\s*([A-Za-zµ°²³^/]+[0-9²³]?)?$/.exec(texto);
    if (m) {
        const num = numeroDeTexto(m[1]);
        if (Number.isFinite(num)) {
            const u = (m[2] || '').trim();
            return { tipo: 'numero', num, unidad: UNIDADES[u] || u, texto };
        }
    }
    return { tipo: 'texto', texto };
}

/** Tipo de una columna por mayoría (≥ 90 % de los valores con dato). */
export function tipoDeColumna(filas, campo) {
    const cuenta = { numero: 0, fecha: 0, texto: 0 }, unidades = {};
    let conDato = 0;
    for (const f of filas) {
        const v = leerValor(f[campo]);
        if (v.tipo === 'vacio') continue;
        conDato++;
        cuenta[v.tipo]++;
        if (v.tipo === 'numero') unidades[v.unidad] = (unidades[v.unidad] || 0) + 1;
    }
    if (!conDato) return { tipo: 'texto', unidad: '', conDato };
    for (const t of ['numero', 'fecha']) {
        if (cuenta[t] / conDato >= 0.9) {
            const unidad = t === 'numero' ? Object.entries(unidades).sort((a, b) => b[1] - a[1])[0][0] : '';
            return { tipo: t, unidad, conDato };
        }
    }
    return { tipo: 'texto', unidad: '', conDato };
}

// ── Filtrar ─────────────────────────────────────────────────────────────────

export const OPERADORES = {
    texto: ['es', 'no_es', 'contiene', 'no_contiene', 'empieza', 'termina', 'uno_de', 'vacio', 'no_vacio'],
    numero: ['=', '≠', '<', '>', 'entre', 'vacio', 'no_vacio'],
    fecha: ['es', 'antes', 'despues', 'entre', 'vacio', 'no_vacio'],
};

// Nombres para personas: los mismos en el embudo, en el pie y en el Excel.
export const NOMBRE_OPERADOR = {
    es: 'es', no_es: 'no es', contiene: 'contiene', no_contiene: 'no contiene', empieza: 'empieza por',
    termina: 'termina en', uno_de: 'es uno de (sep. ;)', vacio: 'está vacío', no_vacio: 'tiene valor',
    '=': '=', '≠': '≠', '<': '<', '>': '>', entre: 'entre', antes: 'antes de', despues: 'después de',
};
export const NOMBRE_CALCULO_LARGO = { suma: 'Suma', promedio: 'Promedio', minimo: 'Mínimo', maximo: 'Máximo', recuento: 'Recuento', distintos: 'Valores distintos' };

/** «Cotas › Área > 4 m² y Name contiene muro»; los grupos anidados, entre paréntesis. */
export function describirFiltro(filtro) {
    if (!filtro || !Array.isArray(filtro.reglas)) return '';
    const une = filtro.modo === 'o' ? ' o ' : ' y ';
    return filtro.reglas.map(r => {
        if (Array.isArray(r?.reglas)) { const d = describirFiltro(r); return d ? `(${d})` : ''; }
        if (!reglaCompleta(r)) return '';
        const op = NOMBRE_OPERADOR[r.op] || r.op;
        if (r.op === 'vacio' || r.op === 'no_vacio') return `${etiquetaDeColumna(r.campo)} ${op}`;
        if (r.op === 'entre') return `${etiquetaDeColumna(r.campo)} entre ${r.valor} y ${r.valor2}`;
        return `${etiquetaDeColumna(r.campo)} ${r.op === 'uno_de' ? 'es uno de' : op} ${r.valor}`;
    }).filter(Boolean).join(une);
}

const plano = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function cumple(raw, regla) {
    const v = leerValor(raw);
    const { op } = regla;
    if (op === 'vacio') return v.tipo === 'vacio';
    if (op === 'no_vacio') return v.tipo !== 'vacio';
    if (v.tipo === 'vacio') return op === 'no_es' || op === 'no_contiene';
    if (op === '=' || op === '≠' || op === '<' || op === '>' || (op === 'entre' && v.tipo === 'numero')) {
        if (v.tipo !== 'numero') return false;
        const a = leerValor(regla.valor).num, b = leerValor(regla.valor2).num;
        if (op === '=') return v.num === a;
        if (op === '≠') return v.num !== a;
        if (op === '<') return v.num < a;
        if (op === '>') return v.num > a;
        return v.num >= Math.min(a, b) && v.num <= Math.max(a, b);
    }
    if (op === 'antes' || op === 'despues' || (op === 'entre' && v.tipo === 'fecha') || (op === 'es' && v.tipo === 'fecha')) {
        if (v.tipo !== 'fecha') return false;
        const a = leerValor(regla.valor).fecha, b = leerValor(regla.valor2).fecha;
        if (op === 'es') return v.fecha === a;
        if (op === 'antes') return v.fecha < a;
        if (op === 'despues') return v.fecha > a;
        return v.fecha >= Math.min(a, b) && v.fecha <= Math.max(a, b);
    }
    const t = plano(v.texto), q = plano(regla.valor);
    if (op === 'es') return t === q;
    if (op === 'no_es') return t !== q;
    if (op === 'contiene') return t.includes(q);
    if (op === 'no_contiene') return !t.includes(q);
    if (op === 'empieza') return t.startsWith(q);
    if (op === 'termina') return t.endsWith(q);
    if (op === 'uno_de') return String(regla.valor ?? '').split(';').map(plano).filter(Boolean).includes(t);
    return false;
}

/** Una regla está completa si tiene campo, operador y el valor que ese operador pide. */
export function reglaCompleta(r) {
    if (!r || !r.campo || !r.op) return false;
    if (r.op === 'vacio' || r.op === 'no_vacio') return true;
    if (r.op === 'entre') return String(r.valor ?? '').trim() !== '' && String(r.valor2 ?? '').trim() !== '';
    return String(r.valor ?? '').trim() !== '';
}

/**
 * filtro = { modo: 'y'|'o', reglas: [ {campo, op, valor, valor2} | { modo, reglas } ] }
 * Las reglas incompletas no cuentan (se están escribiendo).
 */
export function cumpleFiltro(fila, filtro) {
    if (!filtro || !Array.isArray(filtro.reglas)) return true;
    const activas = filtro.reglas.filter(r => (r && Array.isArray(r.reglas)) ? r.reglas.some(reglaCompleta) : reglaCompleta(r));
    if (!activas.length) return true;
    const evalua = r => Array.isArray(r.reglas) ? cumpleFiltro(fila, r) : cumple(fila[r.campo], r);
    return filtro.modo === 'o' ? activas.some(evalua) : activas.every(evalua);
}

export function filtrar(filas, filtro) {
    return filtro ? filas.filter(f => cumpleFiltro(f, filtro)) : filas;
}

export function contarReglas(filtro) {
    if (!filtro || !Array.isArray(filtro.reglas)) return 0;
    return filtro.reglas.reduce((n, r) => n + (Array.isArray(r?.reglas) ? contarReglas(r) : (reglaCompleta(r) ? 1 : 0)), 0);
}

// ── Ordenar ─────────────────────────────────────────────────────────────────

const coll = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

function comparar(a, b) {
    const va = leerValor(a), vb = leerValor(b);
    if (va.tipo === 'vacio' || vb.tipo === 'vacio') return (va.tipo === 'vacio') - (vb.tipo === 'vacio');
    if (va.tipo === 'numero' && vb.tipo === 'numero') return va.num - vb.num;
    if (va.tipo === 'fecha' && vb.tipo === 'fecha') return va.fecha - vb.fecha;
    return coll.compare(va.texto, vb.texto);
}

/** orden = [{campo, dir:'asc'|'desc'}], varios criterios; los vacíos siempre al final. */
export function ordenar(filas, orden) {
    if (!orden || !orden.length) return filas;
    return filas.map((f, i) => [f, i]).sort((x, y) => {
        for (const { campo, dir } of orden) {
            const vx = leerValor(x[0][campo]).tipo === 'vacio', vy = leerValor(y[0][campo]).tipo === 'vacio';
            if (vx !== vy) return vx ? 1 : -1;
            const c = comparar(x[0][campo], y[0][campo]);
            if (c) return dir === 'desc' ? -c : c;
        }
        return x[1] - y[1];
    }).map(p => p[0]);
}

// ── Calcular ────────────────────────────────────────────────────────────────

export const CALCULOS = ['suma', 'promedio', 'minimo', 'maximo', 'recuento', 'distintos'];

// Cotas y posiciones se promedian (sumar elevaciones no significa nada); las
// cantidades (m, m², m³, kg…) se suman. Un número sin unidad solo se suma si el
// nombre dice que es una cantidad; si no, no se calcula nada (podría ser un código).
const ES_POSICION = /elev|cota|altura|nivel|desfase|offset|coordenad|progresiva|\bpk\b|pendiente|slope|grade|rotaci|angulo|ángulo/i;
const ES_CANTIDAD = /cantidad|count|metrado|peso|weight|mass|volum|area|área|longitud|length|largo|perimetro|perímetro|espesor|thickness/i;

export function calculoPorDefecto(campo, tipo, unidad) {
    if (tipo !== 'numero') return null;
    // Solo el nombre de la propiedad, no su categoría: «Cotas › Volumen» es un
    // volumen aunque la categoría se llame «Cotas».
    const nombre = String(campo).split(/›|::/).pop();
    if (ES_POSICION.test(nombre)) return 'promedio';
    if (unidad) return 'suma';
    return ES_CANTIDAD.test(nombre) ? 'suma' : null;
}

/**
 * Resultado: { calculo, porUnidad: {unidad: valor}, sinDato, conDato }.
 * Nunca mezcla unidades: cada una lleva su propio total.
 */
export function calcular(filas, campo, calculo) {
    const res = { calculo, porUnidad: {}, sinDato: 0, conDato: 0 };
    if (calculo === 'recuento') { res.porUnidad[''] = filas.length; return res; }
    if (calculo === 'distintos') {
        const s = new Set();
        for (const f of filas) { const v = leerValor(f[campo]); if (v.tipo === 'vacio') res.sinDato++; else { res.conDato++; s.add(plano(v.texto)); } }
        res.porUnidad[''] = s.size;
        return res;
    }
    const acc = {};
    for (const f of filas) {
        const v = leerValor(f[campo]);
        if (v.tipo !== 'numero') { res.sinDato++; continue; }
        res.conDato++;
        const a = acc[v.unidad] || (acc[v.unidad] = { s: 0, n: 0, min: Infinity, max: -Infinity });
        a.s += v.num; a.n++; a.min = Math.min(a.min, v.num); a.max = Math.max(a.max, v.num);
    }
    for (const [u, a] of Object.entries(acc)) {
        res.porUnidad[u] = calculo === 'suma' ? a.s : calculo === 'promedio' ? a.s / a.n : calculo === 'minimo' ? a.min : a.max;
    }
    return res;
}

const NOMBRE_CALCULO = { suma: 'Σ', promedio: 'Prom.', minimo: 'Mín.', maximo: 'Máx.', recuento: 'N', distintos: 'Distintos' };

export function formatearNumero(n) {
    if (!Number.isFinite(n)) return '';
    const dec = Math.abs(n) >= 1000 ? 1 : Math.abs(n) >= 1 ? 2 : 3;
    return n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: dec });
}

/** «Σ 1,064.8 m³ · 12 kg» o «Prom. 28.26 m»; vacío si no hay dato. */
export function textoDeResultado(r) {
    if (!r) return '';
    const partes = Object.entries(r.porUnidad).map(([u, v]) => `${formatearNumero(v)}${u ? ' ' + u : ''}`);
    return partes.length ? `${NOMBRE_CALCULO[r.calculo]} ${partes.join(' · ')}` : '';
}

// ── Agrupar ─────────────────────────────────────────────────────────────────

const valorDeGrupo = (fila, campo) => {
    const v = fila[campo];
    const s = Array.isArray(v) ? v.filter(Boolean).join(', ') : String(v ?? '').trim();
    return s === '' ? SIN_VALOR : s;
};

/**
 * niveles = ['campo1', 'campo2', …]; calculos = { campo: 'suma'|… }
 * Devuelve [{ clave, campo, valor, nivel, n, totales:{campo: resultado}, hijos, filas }].
 * Los grupos se ordenan por su valor (números y fechas como tales) y «(sin valor)» va al final.
 */
export function agrupar(filas, niveles, calculos = {}, ruta = '') {
    if (!niveles || !niveles.length) return [];
    const [campo, ...resto] = niveles;
    const mapa = new Map();
    for (const f of filas) {
        const v = valorDeGrupo(f, campo);
        if (!mapa.has(v)) mapa.set(v, []);
        mapa.get(v).push(f);
    }
    const valores = [...mapa.keys()].sort((a, b) => (a === SIN_VALOR) - (b === SIN_VALOR) || comparar(a, b));
    return valores.map(valor => {
        const propias = mapa.get(valor);
        const clave = ruta + '\u0000' + campo + '=' + valor;
        const totales = {};
        for (const [c, calc] of Object.entries(calculos)) if (calc) totales[c] = calcular(propias, c, calc);
        return {
            clave, campo, valor, nivel: ruta.split('\u0000').length - 1, n: propias.length, totales,
            hijos: agrupar(propias, resto, calculos, clave), filas: propias,
        };
    });
}

/**
 * Aplana el árbol para pintarlo: cabeceras de grupo, filas y, si se piden,
 * filas de totales por grupo. `plegados` es un Set de claves de grupo.
 */
export function aplanar(grupos, plegados = new Set(), totalesPorGrupo = false) {
    const out = [];
    const recorrer = (lista) => {
        for (const g of lista) {
            out.push({ tipo: 'grupo', grupo: g });
            if (!plegados.has(g.clave)) {
                if (g.hijos.length) recorrer(g.hijos);
                else for (const fila of g.filas) out.push({ tipo: 'fila', fila, nivel: g.nivel + 1 });
            }
            if (totalesPorGrupo) out.push({ tipo: 'totales', grupo: g });
        }
    };
    recorrer(grupos);
    return out;
}

// ── Celdas ──────────────────────────────────────────────────────────────────

/**
 * Cómo se enseña un valor: «4.112 m^2» → «4.112 m²» (el número tal cual, sin
 * redondear: es el dato del modelo), «20261024» → «24/10/2026». `numero` para
 * alinearlo a la derecha. El valor guardado no cambia; solo su aspecto.
 */
export function textoDeCelda(raw) {
    const v = leerValor(raw);
    if (v.tipo === 'numero') {
        const cifra = v.unidad ? v.texto.replace(/\s*[A-Za-zµ°²³^/]+[0-9²³]?$/, '') : v.texto;
        return { texto: v.unidad ? `${cifra} ${v.unidad}` : cifra, numero: true };
    }
    if (v.tipo === 'fecha') {
        const d = new Date(v.fecha);
        return { texto: `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`, numero: false, fecha: true };
    }
    return { texto: v.texto, numero: false };
}

/**
 * «Solo con metrado»: deja las filas con alguna cantidad distinta de cero en
 * las columnas que se suman (Σ) en la tabla. Lo que no tiene metrado (ejes,
 * anotaciones, elementos sin cantidades) sale; lo que queda es lo que se mide.
 * Sin columnas que se sumen no hay con qué decidir: devuelve las filas tal cual.
 */
export function conMetrado(filas, campos) {
    if (!campos || !campos.length) return filas;
    return filas.filter(f => campos.some(c => {
        const v = leerValor(f[c]);
        return v.tipo === 'numero' && v.num !== 0;
    }));
}

// ── Columnas ────────────────────────────────────────────────────────────────

/**
 * Las filas traen cada propiedad dos veces (lib/inventoryNormalizers): con su
 * categoría, `Cotas::Área` (la identidad, nunca se pisa), y suelta, `Área` (por
 * compatibilidad; si dos categorías tienen el mismo nombre, se queda la primera
 * con valor). Inventory ofrecía las dos: 711 columnas para 382 propiedades y
 * sumas distintas para «lo mismo» (Drenaje: Cotas::Área Σ 10.046,8 m² frente a
 * Área Σ 13.202,5 m²). Aquí se ofrece solo la cualificada; la suelta queda
 * únicamente si no hay ninguna versión con categoría de ese nombre.
 */
// Campos propios de la tabla (no vienen del modelo; algunos se editan): se
// quedan aunque una categoría del modelo tenga una propiedad con su nombre.
export const CAMPOS_PROPIOS = ['Name', 'Material', 'Status', 'Vaciado_Nro', 'Revit Category'];

export function columnasSinDuplicados(claves, propios = CAMPOS_PROPIOS) {
    const conCategoria = new Set();
    for (const k of claves) if (k.includes('::')) conCategoria.add(k.slice(k.indexOf('::') + 2));
    return claves.filter(k => k.includes('::') || propios.includes(k) || !conCategoria.has(k));
}

/** «Cotas::Área» → «Cotas › Área»; el resto, tal cual. */
export function etiquetaDeColumna(clave) {
    const i = String(clave).indexOf('::');
    return i < 0 ? String(clave) : clave.slice(0, i) + ' › ' + clave.slice(i + 2);
}

export { SIN_VALOR };
