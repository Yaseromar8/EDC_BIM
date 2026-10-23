/**
 * Catálogo de los campos de la Planilla: qué es cada columna y cuánto sirve.
 *
 * Medido el 23-oct-2026 (docs/visor/19): el inventario de Drenaje trae 357
 * propiedades; 128 tienen dato en una parte real de los elementos y varían,
 * 138 valen lo mismo en todos y 124 casi nunca tienen dato. Todas son
 * parámetros reales de Revit (Tandem guarda incluso más); lo que faltaba era
 * ORDENARLAS. No se esconde ninguna: se clasifican con una regla fija.
 *
 *   propio     campos de la Planilla (Name, Material, Status…)
 *   util       dato en ≥ 1 % de los elementos y más de un valor
 *   constante  el mismo valor en todos los que lo tienen
 *   raro       dato en menos del 1 %
 *   interno    claves de servicio (`__category__`, `__node__`): no se ofrecen,
 *              como los ocultos de Tandem; el dato no se toca
 *
 * Se calcula sobre una muestra repartida (≤ 3.000 filas): con 20.000 filas
 * leerlo todo cada vez no aporta nada a una clasificación.
 */
import * as T from './inventoryTabla.js';

export const GRUPO_PROPIO = 'Planilla';
const MUESTRA_MAXIMA = 3000;
const UMBRAL_RARO = 0.01;

const plano = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** «Cotas::Área» → { grupo: 'Cotas', nombre: 'Área' }; sin «::», grupo de la Planilla. */
export function partesDeClave(clave) {
    const i = String(clave).indexOf('::');
    return i < 0 ? { grupo: GRUPO_PROPIO, nombre: String(clave) } : { grupo: clave.slice(0, i), nombre: clave.slice(i + 2) };
}

function muestraDe(filas) {
    if (filas.length <= MUESTRA_MAXIMA) return filas;
    const paso = filas.length / MUESTRA_MAXIMA;
    const out = [];
    for (let i = 0; i < MUESTRA_MAXIMA; i++) out.push(filas[Math.floor(i * paso)]);
    return out;
}

/**
 * claves: las columnas ofrecidas (ya sin duplicados). Devuelve un Map clave → ficha:
 * { clave, grupo, nombre, unidad, tipo, conDato (0–1), distintos (tope 50), clase }.
 */
export function catalogoDeCampos(filas, claves, propios = T.CAMPOS_PROPIOS) {
    const muestra = muestraDe(filas || []);
    const n = muestra.length || 1;
    const out = new Map();
    for (const clave of claves || []) {
        const { grupo, nombre } = partesDeClave(clave);
        let con = 0;
        const valores = new Set();
        for (const f of muestra) {
            const v = f[clave];
            const s = Array.isArray(v) ? v.filter(Boolean).join(', ') : String(v ?? '').trim();
            if (s === '' || s === 'None') continue;
            con++;
            if (valores.size <= 50) valores.add(s);
        }
        const tipo = T.tipoDeColumna(muestra, clave);
        const conDato = con / n;
        const clase = (grupo.startsWith('__') || nombre.startsWith('__')) ? 'interno'
            : propios.includes(clave) ? 'propio'
            : conDato < UMBRAL_RARO ? 'raro'
                : valores.size <= 1 ? 'constante' : 'util';
        out.set(clave, {
            clave, grupo: clase === 'propio' ? GRUPO_PROPIO : grupo, nombre,
            unidad: tipo.tipo === 'numero' ? tipo.unidad : '', tipo: tipo.tipo,
            conDato, distintos: valores.size, clase,
        });
    }
    return out;
}

/** «54 % con dato», «mismo valor en todos», «casi sin datos». */
export function notaDeCampo(ficha) {
    if (!ficha) return '';
    if (ficha.clase === 'raro') return 'casi sin datos';
    if (ficha.clase === 'constante') return 'mismo valor en todos';
    const pct = Math.round(ficha.conDato * 100);
    return `${pct === 0 && ficha.conDato > 0 ? '<1' : pct} % con dato`;
}

const PESO = { propio: 0, util: 1, constante: 2, raro: 3, interno: 4 };
const ofrecible = f => f.clase !== 'interno';

/** Orden para listas: propios, luego útiles por cobertura, luego el resto. */
export function compararFichas(a, b) {
    return (PESO[a.clase] - PESO[b.clase]) || (b.conDato - a.conDato) || a.nombre.localeCompare(b.nombre, 'es');
}

/**
 * Busca sin tildes ni mayúsculas en el nombre y el grupo; todas las palabras
 * tienen que aparecer («area cotas» encuentra Cotas › Área).
 */
export function buscarCampos(fichas, texto) {
    const palabras = plano(texto).split(/\s+/).filter(Boolean);
    const lista = [...fichas].filter(ofrecible);
    if (!palabras.length) return lista.sort(compararFichas);
    return lista
        .filter(f => { const h = plano(`${f.nombre} ${f.grupo} ${f.unidad}`); return palabras.every(p => h.includes(p)); })
        .sort((a, b) => {
            // Primero lo que empieza por lo escrito, luego el orden de siempre.
            const ea = plano(a.nombre).startsWith(palabras[0]), eb = plano(b.nombre).startsWith(palabras[0]);
            return (eb - ea) || compararFichas(a, b);
        });
}

/**
 * Secciones para la lista sin búsqueda:
 *   Planilla · Con más datos (las útiles, hasta `maxUtiles`) · un grupo por grupo
 *   de Revit con lo demás (útiles que no cupieron, constantes y raras al final).
 */
export function seccionesDeCampos(fichas, maxUtiles = 12) {
    const lista = [...fichas].filter(ofrecible).sort(compararFichas);
    const propias = lista.filter(f => f.clase === 'propio');
    const utiles = lista.filter(f => f.clase === 'util');
    const destacadas = utiles.slice(0, maxUtiles);
    const usadas = new Set([...propias, ...destacadas].map(f => f.clave));
    const porGrupo = new Map();
    for (const f of lista) {
        if (usadas.has(f.clave)) continue;
        if (!porGrupo.has(f.grupo)) porGrupo.set(f.grupo, []);
        porGrupo.get(f.grupo).push(f);
    }
    // Grupos con más campos útiles primero.
    const grupos = [...porGrupo.entries()].sort((a, b) =>
        (b[1].filter(f => f.clase === 'util').length - a[1].filter(f => f.clase === 'util').length) || a[0].localeCompare(b[0], 'es'));
    const out = [];
    if (propias.length) out.push({ titulo: GRUPO_PROPIO, fichas: propias });
    if (destacadas.length) out.push({ titulo: 'Con más datos', fichas: destacadas });
    for (const [grupo, fs] of grupos) out.push({ titulo: grupo, fichas: fs });
    return out;
}
