/**
 * LA VALORIZACIÓN DEL MES EN EL 3D (25-nov-2026, docs/visor/71).
 *
 * El de costos sube el MISMO Excel de la valorización (p. ej. VAL13_PARTIDA_POR_PARTIDA…): una hoja por componente,
 * una fila por partida, con «YA COBRADO» y «SE VALORIZA EN LA VAL. 13». El visor selecciona y pinta los elementos de
 * las partidas que el propio Excel pinta en VERDE, como la planta de las láminas de la valorización.
 *
 * QUÉ ES «VERDE» — la regla del Excel, no una nuestra: su formato condicional pinta la fila de partida (columna «t»
 * = P) cuyo «SE VALORIZA EN LA VAL. n» es mayor que cero. Aquí se lee ese VALOR tal como lo calculó Excel; la fórmula
 * no se reescribe (cambia de una fila a otra: hay filas con margen 0,05 y otras con 0,005).
 *
 * Si el Excel llega SIN los resultados de sus fórmulas (pasa con un libro generado por un programa y no guardado
 * desde Excel), la columna viene vacía: se dice y se pide abrirlo en Excel y guardarlo. No se inventa el valor.
 *
 * DOS TONOS
 *   entero — no se había cobrado nada de esa partida: entra entera este mes.
 *   saldo  — ya se había cobrado parte: este mes sólo completa un saldo (0,032 und de un buzón, 0,17 m de 12,77 m).
 * El 3D pinta el ELEMENTO entero en los dos casos: una fracción de buzón no es un elemento.
 *
 * Sin React ni visor: pruebas/valorizacionDelMes.prueba.mjs.
 */
import { lineasDePartida } from './planillaPartidas.js';
import { normalizarCodigo } from './planillaItemizado.js';
import { calcularHoja } from './formulasDeExcel.js';

const texto = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const MAYUS = v => texto(v).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Las columnas de la cabecera de una hoja de valorización, o null si la hoja no lo es. */
export function cabeceraDe(filas) {
    for (let r = 0; r < Math.min(filas.length, 40); r++) {
        const fila = filas[r] || [];
        const col = {};
        fila.forEach((v, c) => {
            const t = MAYUS(v);
            if (t === 'PARTIDA' && col.codigo == null) col.codigo = c;
            else if (t.startsWith('DESCRIP') && col.descripcion == null) col.descripcion = c;
            else if ((t === 'UND' || t === 'UNIDAD') && col.unidad == null) col.unidad = c;
            else if (t.startsWith('YA COBRADO') && col.yaCobrado == null) col.yaCobrado = c;
            else if (/^SE VALORIZA EN LA VAL/.test(t) && col.esteMes == null) {
                col.esteMes = c;
                const m = /VAL\.?\s*N?[°º]?\s*(\d+)/.exec(t.replace(/^SE VALORIZA EN LA /, ''));
                col.numero = m ? Number(m[1]) : null;
            } else if (t === 'T' && col.tipo == null) col.tipo = c;
        });
        if (col.codigo != null && col.esteMes != null) return { fila: r, ...col };
    }
    return null;
}

const numero = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Lee una hoja ya convertida a filas (matriz de valores; `undefined` = celda sin valor).
 * → { nombre, numero, partidas: [...], verdes: [...], sinCalcular } o null si no es una hoja de valorización.
 */
export function leerHoja(nombre, filas) {
    const cab = cabeceraDe(filas);
    if (!cab) return null;
    const partidas = [];
    let sinCalcular = 0;
    for (let r = cab.fila + 1; r < filas.length; r++) {
        const f = filas[r] || [];
        const codigo = texto(f[cab.codigo]);
        if (!codigo) continue;
        const tipo = cab.tipo != null ? MAYUS(f[cab.tipo]) : null;
        // Con columna «t», partida = «P» (los títulos son «T»). Sin ella, partida = la que tiene unidad.
        const esPartida = tipo != null ? tipo === 'P' : texto(f[cab.unidad]) !== '';
        if (!esPartida) continue;
        const crudo = f[cab.esteMes];
        if (crudo === undefined) sinCalcular++;
        const esteMes = numero(crudo);
        const yaCobrado = numero(f[cab.yaCobrado]) ?? 0;
        partidas.push({
            fila: r + 1, codigo, descripcion: texto(f[cab.descripcion]), unidad: texto(f[cab.unidad]),
            yaCobrado, esteMes,
            verde: esteMes != null && esteMes > 0,
            tono: yaCobrado > 0 ? 'saldo' : 'entero',
        });
    }
    return { nombre, numero: cab.numero, partidas, verdes: partidas.filter(p => p.verde), sinCalcular, cab };
}

/** Cómo hay que leer el libro con SheetJS para poder calcular lo que llegue sin resultados. */
export const opcionesDeLectura = () => ({ cellFormula: true, sheetStubs: true, cellNF: true });   // nueva cada vez: SheetJS la modifica

/**
 * Todas las hojas de valorización de un libro de SheetJS (leído con opcionesDeLectura()). `XLSX` es la librería (se
 * inyecta para las pruebas). Si el libro llegó sin los resultados de sus fórmulas, se calculan aquí con las fórmulas
 * del propio libro (lib/formulasDeExcel.js) y la hoja lo dice en `calculadasPorElVisor`.
 */
export function leerValorizacion(XLSX, libro) {
    const hojas = [];
    for (const nombre of libro.SheetNames) {
        const hoja = libro.Sheets[nombre];
        const sinResultado = Object.keys(hoja).some(k => k[0] !== '!' && hoja[k]?.f && (hoja[k].t === 'z' || hoja[k].v === undefined));
        const calculo = sinResultado ? calcularHoja(hoja) : { calculadas: 0, sinCalcular: 0, razon: '' };
        const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: undefined, blankrows: true });
        const h = leerHoja(nombre, filas);
        if (h && h.partidas.length) hojas.push({ ...h, calculadasPorElVisor: calculo.calculadas, razonSinCalcular: calculo.razon, hojaXLSX: hoja });
    }
    if (!hojas.length) {
        return { hojas, error: 'Este Excel no tiene ninguna hoja de valorización: hace falta una cabecera con «PARTIDA» y «SE VALORIZA EN LA VAL. n».' };
    }
    return { hojas, error: '' };
}

/** Nota para una hoja cuyas fórmulas calculó el visor (el Excel llegó sin sus resultados). */
export function notaDeCalculo(hoja) {
    if (!hoja?.calculadasPorElVisor || hoja.sinCalcular) return '';
    return `Este Excel llegó sin los resultados de sus fórmulas (se generó con un programa): el visor calculó ${hoja.calculadasPorElVisor.toLocaleString('es-PE')} fórmulas, cada una con la suya del propio Excel.`;
}

/** Aviso para una hoja con partidas que siguen sin resultado (fórmulas que el visor no sabe calcular). */
export function avisoDeCalculo(hoja) {
    if (!hoja || !hoja.sinCalcular) return '';
    if (hoja.sinCalcular >= hoja.partidas.length) {
        return 'Este Excel llega sin los resultados de sus fórmulas (se generó con un programa, no se guardó desde Excel): la columna «Se valoriza» viene vacía. Ábrelo en Microsoft Excel, pulsa Ctrl+S y vuelve a cargarlo aquí.';
    }
    return `${hoja.sinCalcular} partidas llegan sin el resultado de «Se valoriza»: no se pintan. Ábrelo en Microsoft Excel, pulsa Ctrl+S y vuelve a cargarlo aquí.`;
}

const segmentos = c => normalizarCodigo(c).split('.').filter(Boolean);

/**
 * Los códigos del Excel pueden llevar un nivel más delante que los del modelo («1.06.04.02.03.03» frente a
 * «06.04.02.03.03»). Se prueba quitar 0, 1 o 2 niveles y se queda el que más casa: lo dicen los datos.
 */
export function mejorDesfase(codigosExcel, codigosModelo) {
    const modelo = new Set([...codigosModelo].map(c => segmentos(c).join('.')));
    let mejor = { desfase: 0, casan: -1 };
    for (const d of [0, 1, 2]) {
        let casan = 0;
        for (const c of codigosExcel) if (modelo.has(segmentos(c).slice(d).join('.'))) casan++;
        if (casan > mejor.casan) mejor = { desfase: d, casan };
    }
    return mejor;
}

/**
 * Los elementos del modelo de CADA partida de la hoja (verde o no), para que cualquier fila lleve a los suyos.
 * → { desfase, casan, clavesDe: Map(codigoExcel → [claves]), filaDe: Map(clave → fila del inventario) }
 */
export function elementosPorPartida(filas, dic, claveDeFila, partidas) {
    const porCodigo = new Map();          // código del modelo (por segmentos) → claves
    const filaDe = new Map();
    for (const f of filas || []) {
        const cods = lineasDePartida(f, dic).map(l => segmentos(l.codigo).join('.')).filter(Boolean);
        if (!cods.length) continue;
        const k = claveDeFila(f);
        filaDe.set(k, f);
        for (const c of new Set(cods)) {
            if (!porCodigo.has(c)) porCodigo.set(c, []);
            porCodigo.get(c).push(k);
        }
    }
    const { desfase, casan } = mejorDesfase(partidas.map(p => p.codigo), porCodigo.keys());
    const clavesDe = new Map();
    for (const p of partidas) {
        const claves = porCodigo.get(segmentos(p.codigo).slice(desfase).join('.')) || [];
        clavesDe.set(p.codigo, [...new Set([...(clavesDe.get(p.codigo) || []), ...claves])]);
    }
    return { desfase, casan, clavesDe, filaDe };
}

/** El texto de una celda como lo enseña Excel: su texto guardado, o el número con el formato de la celda. */
export function textoDeCelda(XLSX, celda) {
    if (!celda || celda.v == null || celda.t === 'z') return '';
    if (celda.w != null) return celda.w;
    if (typeof celda.v === 'number') {
        if (celda.z && XLSX?.SSF) { try { return XLSX.SSF.format(celda.z, celda.v); } catch { /* formato raro */ } }
        return celda.v.toLocaleString('es-PE', { maximumFractionDigits: 4 });
    }
    if (typeof celda.v === 'boolean') return celda.v ? 'VERDADERO' : 'FALSO';
    return String(celda.v);
}

/**
 * La hoja como tabla, tal como la ve costos en Excel: sus columnas (sin la «t» de servicio) y sus filas desde la
 * cabecera, con los títulos (T) y las partidas (P).
 * → { columnas: [{ c, titulo }], filas: [{ r, tipo, codigo, celdas: [texto], partida? }] }
 */
export function tablaDeLaHoja(XLSX, h) {
    const hoja = h.hojaXLSX;
    const rango = XLSX.utils.decode_range(hoja['!ref']);
    const dir = (r, c) => XLSX.utils.encode_cell({ r, c });
    const columnas = [];
    for (let c = rango.s.c; c <= rango.e.c; c++) {
        if (c === h.cab.tipo) continue;
        const titulo = texto(hoja[dir(h.cab.fila, c)]?.v);
        if (titulo) columnas.push({ c, titulo });
    }
    const partidaDe = new Map(h.partidas.map(p => [p.fila, p]));
    const filas = [];
    for (let r = h.cab.fila + 1; r <= rango.e.r; r++) {
        const celdas = columnas.map(({ c }) => textoDeCelda(XLSX, hoja[dir(r, c)]));
        if (!celdas.some(Boolean)) continue;
        const tipo = h.cab.tipo != null ? MAYUS(hoja[dir(r, h.cab.tipo)]?.v) : '';
        filas.push({ r, tipo, codigo: texto(hoja[dir(r, h.cab.codigo)]?.v), celdas, partida: partidaDe.get(r + 1) || null });
    }
    return { columnas, filas };
}

/**
 * Qué elementos lleva una fila: una partida, los suyos; un título, los de sus partidas EN VERDE (lo que se cobra
 * este mes en ese grupo: «1.06.04» = todas las «1.06.04.…»).
 */
export function clavesDeLaFila(fila, partidas, clavesDe) {
    if (fila.partida) return clavesDe.get(fila.partida.codigo) || [];
    if (!fila.codigo) return [];
    const prefijo = fila.codigo + '.';
    const claves = new Set();
    for (const p of partidas) if (p.verde && p.codigo.startsWith(prefijo)) (clavesDe.get(p.codigo) || []).forEach(k => claves.add(k));
    return [...claves];
}

/** El tono de cada elemento de un conjunto: el de su partida verde («entero» gana a «saldo»); sin partida verde, nada. */
export function tonosDe(claves, partidas, clavesDe) {
    const enConjunto = new Set(claves);
    const tono = new Map();
    for (const p of partidas) {
        if (!p.verde) continue;
        for (const k of clavesDe.get(p.codigo) || []) if (enConjunto.has(k) && tono.get(k) !== 'entero') tono.set(k, p.tono);
    }
    return tono;
}

/**
 * Los elementos del modelo de cada partida verde.
 *   filas: el inventario de la obra; dic: el diccionario de la Planilla; claveDeFila(fila) → su clave.
 * → { desfase, porPartida: Map(codigoExcel → { partida, claves }), sinElementos: [partida],
 *     tonoDe: Map(clave → 'entero' | 'saldo'), claves: [todas] }
 */
export function elementosDeLaValorizacion(filas, dic, claveDeFila, verdes) {
    const codigosDe = new Map();          // clave de fila → códigos de partida (normalizados, por segmentos)
    const todosModelo = new Set();
    const filaDe = new Map();
    for (const f of filas || []) {
        const cods = lineasDePartida(f, dic).map(l => segmentos(l.codigo).join('.')).filter(Boolean);
        if (!cods.length) continue;
        const k = claveDeFila(f);
        codigosDe.set(k, cods);
        filaDe.set(k, f);
        cods.forEach(c => todosModelo.add(c));
    }
    const { desfase, casan } = mejorDesfase(verdes.map(p => p.codigo), todosModelo);
    const porCodigo = new Map();          // código del modelo → claves
    for (const [k, cods] of codigosDe) for (const c of cods) {
        if (!porCodigo.has(c)) porCodigo.set(c, []);
        porCodigo.get(c).push(k);
    }
    const porPartida = new Map();
    const sinElementos = [];
    const tonoDe = new Map();
    for (const p of verdes) {
        const c = segmentos(p.codigo).slice(desfase).join('.');
        const claves = porCodigo.get(c) || [];
        if (!claves.length) { sinElementos.push(p); continue; }
        const previo = porPartida.get(p.codigo);
        porPartida.set(p.codigo, { partida: p, claves: previo ? [...new Set([...previo.claves, ...claves])] : claves });
        // Un elemento con dos partidas verdes: si una entra entera, el elemento se pinta como «entero».
        for (const k of claves) if (tonoDe.get(k) !== 'entero') tonoDe.set(k, p.tono);
    }
    return { desfase, casan, porPartida, sinElementos, tonoDe, claves: [...tonoDe.keys()], filaDe };
}

/** La «calle» de un elemento: su parámetro de Ubicación (01_11_DSI_Ubicacion u otro «…Ubicacion», nunca «Sub ubicación»). */
export function claveDeUbicacion(claves) {
    const nombre = c => String(c).split('::').pop();
    const sinTilde = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return claves.find(c => /^\d\d_\d\d_DSI_Ubicacion$/i.test(sinTilde(nombre(c))))
        || claves.find(c => /(^|_)ubicacion$/.test(sinTilde(nombre(c))) && !/sub/.test(sinTilde(nombre(c))))
        || null;
}

/** Agrupa las claves por calle (valor de Ubicación); sin Ubicación, «Sin ubicación». */
export function porUbicacion(claves, filaDe, claveUbic) {
    const grupos = new Map();
    for (const k of claves) {
        const v = claveUbic ? texto(filaDe.get(k)?.[claveUbic]) : '';
        const g = v || 'Sin ubicación';
        if (!grupos.has(g)) grupos.set(g, []);
        grupos.get(g).push(k);
    }
    return [...grupos].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([ubicacion, ks]) => ({ ubicacion, claves: ks }));
}

/** Los colores de los dos tonos (verde, como el Excel). El visor oscurece los claros con su luz: por eso el saldo
 *  es un verde amarillento claro y no un verde pálido, que en pantalla salía igual que el entero (25-nov-2026). */
export const COLOR_ENTERO = '#2e9d44';
export const COLOR_SALDO = '#e3f28c';
