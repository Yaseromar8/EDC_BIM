/**
 * Criterios de medida de la obra — «Medir con…» (docs/visor/32). Sin IA.
 *
 * La cantidad de una línea de partida es la medida NATIVA del elemento según la unidad
 * (lib/planillaPartidas.js). Muchos elementos no la traen: familias propias (la malla de cerco
 * con `Long. Reja`), genéricos, metrados volcados a un parámetro, IFC de otros programas, Revit en
 * otro idioma. La medida está en ALGÚN parámetro del elemento y solo la obra sabe cuál. Un criterio
 * lo dice:
 *
 *   { unidad: 'm', partida?: '01.02', donde?: { campo, op: 'es'|'contiene', valor }, medirCon: [clave…] }
 *
 *   unidad     obligatoria (m · m² · m³ · kg);
 *   partida    opcional: sin ella vale para todas las partidas de esa unidad;
 *   donde      opcional: limita a los elementos con ese valor en un campo cualquiera del modelo;
 *   medirCon   claves de parámetros en orden: se usa el primero con valor > 0 EN ESA UNIDAD.
 *
 * Reglas fijas:
 *   - solo rellena: quien llama lo usa únicamente si el elemento no tiene medida nativa;
 *   - gana el más específico (partida+donde → partida → donde → toda la obra); dos del mismo nivel
 *     que aplican al mismo elemento = CONFLICTO: no se elige uno en silencio;
 *   - el valor debe traer la unidad de la partida («11.983 m»); otra unidad o ninguna no se usa.
 * Nada de nombres de familias, parámetros ni idiomas aquí: todo sale de los criterios de la obra.
 */
import { leerValor } from './inventoryTabla.js';
import { compacto } from './inventoryBuscar.js';
import { normalizarUnidad, lineasDePartida } from './planillaPartidas.js';
import { normalizarCodigo } from './planillaItemizado.js';
import { crearAlmacenDeObra } from './almacenDeObra.js';

export const UNIDADES_MEDIBLES = ['m', 'm²', 'm³', 'kg'];
export const MAX_CRITERIOS = 500;
export const MAX_MEDIR_CON = 5;
const OPERADORES = ['es', 'contiene'];
const texto = v => String(v ?? '').trim();
const nombreDe = clave => String(clave).split('::').pop();
const grupoDe = clave => (String(clave).includes('::') ? String(clave).split('::')[0] : '');
// Los parámetros manuales de las líneas DSI ya se enseñan aparte («Manual (aparte)»): no son candidatos.
const ES_MANUAL_DSI = /^\d\d_\d\d_DSI_(Longitud|Area|Volumen|Peso)\d?$/;

/** «Cotas › Long. Reja» */
export const etiquetaDeClave = clave => (grupoDe(clave) ? `${grupoDe(clave)} › ${nombreDe(clave)}` : nombreDe(clave));

/** La identidad de un criterio: dos con la misma no pueden convivir. */
export function claveDeCriterio(c) {
    const d = c.donde ? `${c.donde.campo}|${c.donde.op}|${compacto(c.donde.valor)}` : '';
    return `${c.unidad}|${c.partida ? normalizarCodigo(c.partida) : ''}|${d}`;
}

/**
 * Normaliza y valida una lista. { criterios, errores: [{ i, motivo }] }.
 * Un criterio inválido no entra; los demás sí (la interfaz enseña los errores).
 */
export function validarCriterios(lista) {
    const criterios = [], errores = [], vistos = new Set();
    if (!Array.isArray(lista)) return { criterios, errores: [{ i: -1, motivo: 'No es una lista de criterios.' }] };
    if (lista.length > MAX_CRITERIOS) return { criterios, errores: [{ i: -1, motivo: `Más de ${MAX_CRITERIOS} criterios.` }] };
    lista.forEach((c, i) => {
        const mal = motivo => errores.push({ i, motivo });
        if (!c || typeof c !== 'object') return mal('No es un criterio.');
        const unidad = normalizarUnidad(c.unidad);
        if (!UNIDADES_MEDIBLES.includes(unidad)) return mal(`Unidad «${texto(c.unidad)}» no medible (m, m², m³ o kg).`);
        const partida = texto(c.partida);
        const medirCon = [...new Set((Array.isArray(c.medirCon) ? c.medirCon : []).map(texto).filter(Boolean))];
        if (!medirCon.length) return mal('Falta el parámetro con que se mide.');
        if (medirCon.length > MAX_MEDIR_CON) return mal(`Como mucho ${MAX_MEDIR_CON} parámetros por criterio.`);
        let donde = null;
        if (c.donde) {
            const campo = texto(c.donde.campo), op = texto(c.donde.op), valor = texto(c.donde.valor);
            if (!campo || !valor) return mal('«Solo donde» necesita un campo y un valor.');
            if (!OPERADORES.includes(op)) return mal(`Operador «${op}» desconocido (es / contiene).`);
            donde = { campo, op, valor };
        }
        const limpio = { unidad, ...(partida ? { partida } : {}), ...(donde ? { donde } : {}), medirCon };
        const k = claveDeCriterio(limpio);
        if (vistos.has(k)) return mal('Ya hay un criterio para esa misma unidad, partida y condición.');
        vistos.add(k);
        criterios.push(limpio);
    });
    return { criterios, errores };
}

/** ¿El elemento cumple «solo donde»? Se compara sin tildes, mayúsculas ni espacios de más. */
export function cumpleDonde(fila, donde) {
    if (!donde) return true;
    const v = fila[donde.campo];
    const s = compacto(Array.isArray(v) ? v.join(', ') : v);
    const q = compacto(donde.valor);
    if (!s || !q) return false;
    return donde.op === 'es' ? s === q : s.includes(q);
}

/** Valor de un parámetro EN una unidad: { valor } si es > 0 y trae esa unidad; { unidad } si trae otra. */
export function valorEnUnidad(v, unidad) {
    const r = leerValor(v);
    if (r.tipo !== 'numero') return null;
    if (normalizarUnidad(r.unidad) !== unidad) return r.num ? { unidad: r.unidad || 'sin unidad' } : null;
    return r.num > 0 ? { valor: r.num } : null;
}

/** Mide con un criterio: { valor, clave } · { motivo: 'unidad', clave, unidadEncontrada } · { motivo: 'sin-valor' }. */
export function medirConCriterio(fila, criterio) {
    let distinta = null;
    for (const clave of criterio.medirCon) {
        const r = valorEnUnidad(fila[clave], criterio.unidad);
        if (r?.valor) return { valor: r.valor, clave };
        if (r?.unidad && !distinta) distinta = { motivo: 'unidad', clave, unidadEncontrada: r.unidad };
    }
    return distinta || { motivo: 'sin-valor' };
}

/** «m · 01.02 · donde Nombre de tipo contiene «MALLA» · Long. Reja, si no Largo Total» */
export function describirCriterio(c) {
    const partes = [c.unidad, c.partida ? `partida ${c.partida}` : 'toda la obra'];
    if (c.donde) partes.push(`donde ${nombreDe(c.donde.campo)} ${c.donde.op} «${c.donde.valor}»`);
    partes.push(c.medirCon.map(nombreDe).join(', si no '));
    return partes.join(' · ');
}

/**
 * Índice de los criterios vigentes. `cantidad(fila, codigo, unidad)` para una línea SIN medida nativa:
 *   null                                   ningún criterio le aplica;
 *   { valor, origen: 'criterio', detalle, clave, criterio }
 *   { motivo: 'conflicto', criterios }     dos del mismo nivel;
 *   { motivo: 'unidad' | 'sin-valor', criterio, … }
 */
export function indiceDeCriterios(criterios) {
    const porUnidad = new Map();
    for (const c of criterios || []) {
        if (!porUnidad.has(c.unidad)) porUnidad.set(c.unidad, { porPartida: new Map(), generales: [] });
        const u = porUnidad.get(c.unidad);
        if (c.partida) {
            const k = normalizarCodigo(c.partida);
            if (!u.porPartida.has(k)) u.porPartida.set(k, []);
            u.porPartida.get(k).push(c);
        } else u.generales.push(c);
    }
    const elegir = (fila, lista) => {
        const conDonde = lista.filter(c => c.donde && cumpleDonde(fila, c.donde));
        if (conDonde.length) return conDonde;
        return lista.filter(c => !c.donde);
    };
    function aplicable(fila, codigo, unidad) {
        const u = porUnidad.get(unidad);
        if (!u) return null;
        const dePartida = codigo ? u.porPartida.get(normalizarCodigo(codigo)) : null;
        for (const lista of [dePartida || [], u.generales]) {
            const hay = elegir(fila, lista);
            if (hay.length === 1) return { criterio: hay[0] };
            if (hay.length > 1) return { conflicto: hay };
        }
        return null;
    }
    function cantidad(fila, codigo, unidad) {
        const a = aplicable(fila, codigo, unidad);
        if (!a) return null;
        if (a.conflicto) return { motivo: 'conflicto', criterios: a.conflicto };
        const m = medirConCriterio(fila, a.criterio);
        if (m.valor) return { valor: m.valor, origen: 'criterio', detalle: nombreDe(m.clave), clave: m.clave, criterio: a.criterio };
        return { ...m, criterio: a.criterio };
    }
    return { cantidad, aplicable, total: (criterios || []).length, criterios: criterios || [] };
}

/**
 * Parámetros con que se pueden medir `filas` en `unidad`: numéricos cuyo valor trae esa unidad.
 * [{ clave, etiqueta, conDato, suma }] de más a menos elementos con dato. Ninguno se preselecciona.
 */
export function candidatosDeMedida(filas, unidad, claves) {
    const out = [];
    for (const clave of claves || []) {
        if (!String(clave).includes('::')) continue;                  // la clave plana repite la del grupo
        if (grupoDe(clave).startsWith('__') || nombreDe(clave).startsWith('__')) continue;
        if (ES_MANUAL_DSI.test(nombreDe(clave))) continue;
        let conDato = 0, suma = 0;
        for (const f of filas) {
            const r = valorEnUnidad(f[clave], unidad);
            if (r?.valor) { conDato++; suma += r.valor; }
        }
        if (conDato) out.push({ clave, etiqueta: etiquetaDeClave(clave), conDato, suma: Number(suma.toPrecision(12)) });
    }
    return out.sort((a, b) => b.conDato - a.conDato || a.etiqueta.localeCompare(b.etiqueta, 'es'));
}

/**
 * Campos con que limitar un criterio («solo donde») sobre `filas`: texto, con dato en la mitad o más
 * y pocos valores distintos (los que separan grupos: categoría, nombre de tipo…).
 * [{ campo, etiqueta, valores: [{ valor, n }], enObra }] — los valores de más a menos elementos.
 *
 * Con `obra` (todas las filas de la obra), `enObra` = cuántos elementos de la obra tienen alguno de esos
 * valores, y van primero los campos que MÁS distinguen (menos elementos fuera de `filas`). Medido en
 * Canal (26-oct-2026): sin esto, los 47 campos con el mismo valor en todos («Autor», «Fase»…) tapaban
 * «Nombre de tipo».
 */
export function camposParaDonde(filas, claves, { obra = null, maxValores = 30 } = {}) {
    const out = [];
    if (!filas.length) return out;
    // Una clave plana repite la de su grupo; vale solo si no la hay con grupo («Revit Category»).
    const conGrupo = new Set((claves || []).filter(k => String(k).includes('::')).map(nombreDe));
    for (const campo of claves || []) {
        if (!String(campo).includes('::') && conGrupo.has(campo)) continue;
        if (grupoDe(campo).startsWith('__') || nombreDe(campo).startsWith('__')) continue;
        if (grupoDe(campo) === 'Planilla') continue;      // los campos derivados de la propia Planilla
        const cuenta = new Map();
        let con = 0, numerico = 0;
        for (const f of filas) {
            const v = texto(Array.isArray(f[campo]) ? f[campo].join(', ') : f[campo]);
            if (!v) continue;
            con++;
            if (leerValor(v).tipo === 'numero') numerico++;
            cuenta.set(v, (cuenta.get(v) || 0) + 1);
            if (cuenta.size > maxValores) break;
        }
        if (cuenta.size > maxValores || con < filas.length * 0.5 || numerico > con * 0.5) continue;
        let enObra = null;
        if (obra) {
            enObra = 0;
            for (const f of obra) if (cuenta.has(texto(Array.isArray(f[campo]) ? f[campo].join(', ') : f[campo]))) enObra++;
        }
        out.push({ campo, etiqueta: etiquetaDeClave(campo), valores: [...cuenta].map(([valor, n]) => ({ valor, n })).sort((a, b) => b.n - a.n), enObra });
    }
    return out.sort((a, b) => (a.enObra ?? 0) - (b.enObra ?? 0) || a.valores.length - b.valores.length || a.etiqueta.localeCompare(b.etiqueta, 'es'));
}

/**
 * Qué haría un criterio sobre `filas` (los elementos sin medida nativa de una partida), antes de
 * guardarlo: { medidos, suma, sinValor, unidadDistinta, fueraDeDonde }.
 */
export function simularCriterio(filas, criterio) {
    const r = { medidos: 0, suma: 0, sinValor: 0, unidadDistinta: 0, fueraDeDonde: 0 };
    for (const f of filas) {
        if (criterio.donde && !cumpleDonde(f, criterio.donde)) { r.fueraDeDonde++; continue; }
        const m = medirConCriterio(f, criterio);
        if (m.valor) { r.medidos++; r.suma += m.valor; } else if (m.motivo === 'unidad') r.unidadDistinta++; else r.sinValor++;
    }
    r.suma = Number(r.suma.toPrecision(12));
    return r;
}

/**
 * Los elementos de `filas` con una línea de la partida `codigo` (con o sin ceros) en `unidad` que NO
 * tiene medida nativa. `dic` es el diccionario de la Planilla; los criterios que traiga no cuentan
 * (se pregunta por la medida nativa).
 */
export function sinMedidaNativa(filas, dic, codigo, unidad) {
    const d = { ...dic, criterios: null };
    const k = normalizarCodigo(codigo);
    return filas.filter(f => lineasDePartida(f, d).some(l => l.cantidad == null && l.unidad === unidad && normalizarCodigo(l.codigo) === k));
}

/**
 * Qué hace cada criterio en `filas` (con `dic.criterios` puesto): Map(criterio → { medidos, suma,
 * sinValor, unidadDistinta, conflictos }). Un criterio que no mide nada está «sin efecto».
 */
export function usoDeCriterios(filas, dic) {
    const uso = new Map((dic.criterios?.criterios || []).map(c => [c, { medidos: 0, suma: 0, sinValor: 0, unidadDistinta: 0, conflictos: 0 }]));
    for (const f of filas) {
        for (const l of lineasDePartida(f, dic)) {
            if (l.medidoCon && uso.has(l.criterio)) { const u = uso.get(l.criterio); u.medidos++; u.suma += l.cantidad; continue; }
            const por = l.sinMedidaPor;
            if (!por) continue;
            if (por.motivo === 'conflicto') { for (const c of por.criterios) if (uso.has(c)) uso.get(c).conflictos++; continue; }
            const u = uso.get(por.criterio);
            if (!u) continue;
            if (por.motivo === 'unidad') u.unidadDistinta++; else u.sinValor++;
        }
    }
    for (const u of uso.values()) u.suma = Number(u.suma.toPrecision(12));
    return uso;
}

// ── Lo que viene del servidor / se guarda en el navegador ──────────────────────────────────────

function huellaLocal(criterios) {
    let h = 0x811c9dc5;
    const s = JSON.stringify(criterios);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return `local-${(h >>> 0).toString(16)}-${criterios.length}`;
}

/** { criterios, indice, version, huella, creadoPor, creadoEn, local? } — vacío si no hay criterios. */
export function juegoDeCriterios({ criterios, version = null, huella, creadoPor = '', creadoEn = null, local = false }) {
    const { criterios: limpios } = validarCriterios(criterios || []);
    return { criterios: limpios, indice: indiceDeCriterios(limpios), version, huella: huella || huellaLocal(limpios), creadoPor, creadoEn, local };
}

export function criteriosDesdeServidor(v) {
    if (!v || !Array.isArray(v.criterios)) return null;
    return juegoDeCriterios({ criterios: v.criterios, version: v.version, huella: v.huella, creadoPor: v.creado_por || '', creadoEn: v.creado_en || null });
}

export function criteriosLocales({ criterios }) {
    return juegoDeCriterios({ criterios, local: true });
}

/** El almacén de los criterios de la obra (mismo patrón que el itemizado: lib/almacenDeObra.js). */
export function crearAlmacenDeCriterios({ pedir }) {
    return crearAlmacenDeObra({
        pedir, ruta: '/api/planilla/criterios-medida',
        desdeServidor: criteriosDesdeServidor,
        local: criteriosLocales,
        cuerpo: ({ criterios }) => ({ criterios }),
        textos: {
            sinMigracion: 'Los criterios de medida no se guardan para la obra (falta la migración 41 en el servidor): se usan solo en este navegador y se pierden al recargar.',
            compartida: 'En una vista compartida los criterios de medida se usan solo en este navegador.',
            antiguo: 'Este servidor aún no guarda criterios de medida: se usan solo en este navegador y se pierden al recargar.',
            pedir: 'No se pudieron pedir los criterios de medida de la obra',
            leer: 'No se pudieron leer los criterios de medida de la obra.',
            guardar: 'No se pudieron guardar los criterios de medida',
            quitar: 'No se pudieron quitar los criterios de medida',
        },
    });
}
