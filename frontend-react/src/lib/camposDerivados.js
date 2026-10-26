/**
 * Campos DERIVADOS del inventario (docs/visor/27 §6): datos que la Planilla deduce y que pasan a ser
 * propiedades como cualquier otra, para que Filters los use (filtrar, aislar, colorear, guardar en
 * una vista) sin cambiar su motor.
 *
 * Reglas (sin IA, las mismas que enseña la Planilla):
 *   - qué parámetros del modelo son código, descripción y unidad de cada línea de partida se deduce
 *     de los valores, guiado por el itemizado de la obra (lib/planillaPerfil.js);
 *   - «Estado frente al itemizado» de cada elemento = el mejor de sus líneas (lib/planillaCobertura.js);
 *   - «Capítulo» = primer tramo del código de sus líneas del itemizado, con su nombre oficial; un
 *     elemento con líneas en dos capítulos va a «Varios capítulos»; sin partida del itemizado, sin valor.
 *
 * Los campos se escriben EN las filas del inventario en memoria (con su grupo «Planilla::», que es como
 * Filters lee las propiedades) y se QUITAN si no hay itemizado: nunca queda un valor de otro itemizado.
 * Nada se guarda en la base: se calculan al cargar la obra y al cambiar el itemizado.
 *
 * Sin React ni visor: pruebas/camposDerivados.prueba.mjs.
 */
import { deducirRoles, diccionarioDeducido } from './planillaPerfil.js';
import { estadoDeElemento, ESTADOS } from './planillaCobertura.js';

export const GRUPO = 'Planilla';
export const ID_ESTADO = 'Planilla::Estado frente al itemizado';
export const ID_CAPITULO = 'Planilla::Capítulo';

const ETIQUETA_ESTADO = Object.freeze({
    exacta: 'Con partida del itemizado',
    subpartida: 'Con sub-partida de un ítem',
    fuera: 'Partida fuera del itemizado o sin código',
    sin: 'Sin partida',
});
export const VARIOS_CAPITULOS = 'Varios capítulos';
/** Colores del estado (los de la Planilla) para que Filters los use al colorear: valor → color. */
export const COLORES_ESTADO = Object.freeze(Object.fromEntries(ESTADOS.map(e => [ETIQUETA_ESTADO[e.id], e.color])));

/** Los campos, con la regla que se enseña al usuario. */
export const CAMPOS_DERIVADOS = Object.freeze([
    Object.freeze({
        id: ID_ESTADO, nombre: 'Estado frente al itemizado',
        regla: 'El mejor estado de las líneas de partida del elemento frente al itemizado de la obra: con partida del itemizado, con sub-partida de un ítem, fuera del itemizado (o sin código) o sin partida.',
        valores: Object.freeze(ESTADOS.map(e => ETIQUETA_ESTADO[e.id])),
    }),
    Object.freeze({
        id: ID_CAPITULO, nombre: 'Capítulo',
        regla: 'El capítulo del itemizado (primer tramo del código) de las líneas del elemento, con su nombre oficial. Líneas en dos capítulos: «Varios capítulos». Sin partida del itemizado: sin valor.',
        valores: null,
    }),
]);
const IDS = CAMPOS_DERIVADOS.map(c => c.id);

/** Entradas para el esquema de propiedades del visor (lo que lista el ⚙ de Filters). */
export function esquemaDerivado() {
    return CAMPOS_DERIVADOS.map(c => ({ id: c.id, name: c.nombre, category: GRUPO, group: 'text', path: `${GRUPO} ▸ ${c.nombre}`, derivado: true, regla: c.regla }));
}

/** Quita los campos derivados de las filas (sin itemizado, o antes de recalcular). */
export function quitarDerivados(filas) {
    let n = 0;
    for (const f of filas || []) for (const id of IDS) if (id in f) { delete f[id]; n++; }
    return n;
}

/**
 * Calcula y ESCRIBE los campos en las filas. `itemizado` = { indice, items } (lib/itemizadoDeObra).
 * Devuelve { aplicados, roles, dic, porEstado, ms } — `roles` y `dic` los reutiliza la Planilla, para
 * no deducir dos veces ni con filas distintas.
 */
export function aplicarDerivados(filas, itemizado) {
    const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
    quitarDerivados(filas);
    if (!itemizado?.indice || !Array.isArray(filas) || !filas.length) return { aplicados: 0, roles: null, dic: null, porEstado: null, ms: 0 };
    const indice = itemizado.indice;
    const roles = deducirRoles(filas, undefined, { itemizado: indice });
    const claves = new Set();
    for (const f of filas) for (const k in f) claves.add(k);
    const dic = { ...diccionarioDeducido(roles, [...claves]), itemizado: indice };
    const porEstado = { exacta: 0, subpartida: 0, fuera: 0, sin: 0 };
    for (const f of filas) {
        const { estado, capitulos } = estadoDeElemento(f, dic, indice);
        porEstado[estado]++;
        f[ID_ESTADO] = ETIQUETA_ESTADO[estado];
        if (capitulos.length === 1) {
            const nombre = indice.porCodigo.get(capitulos[0])?.descripcion;
            f[ID_CAPITULO] = nombre ? `${capitulos[0]} ${nombre}` : capitulos[0];
        } else if (capitulos.length > 1) f[ID_CAPITULO] = VARIOS_CAPITULOS;
    }
    const ms = Math.round((typeof performance !== 'undefined' ? performance : Date).now() - t0);
    return { aplicados: filas.length, roles, dic, porEstado, ms };
}
