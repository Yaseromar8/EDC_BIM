/**
 * Cobertura del modelo frente al itemizado (docs/visor/25, P1 «qué falta»). El color en el 3D lo pone
 * Filters con los campos derivados (lib/camposDerivados.js, docs/visor/27 §6).
 *
 * Responde, sin IA y con una regla fija, a «¿cuánto del modelo está metrado con mi
 * itemizado y qué falta?». Cada elemento queda en UNO de cuatro estados, el mejor de sus
 * líneas de partida:
 *   exacta      alguna línea con un código que está en el itemizado;
 *   subpartida  si no, alguna línea con código cuyo PADRE INMEDIATO está en el itemizado;
 *   fuera       tiene líneas, pero sus códigos no están en el itemizado (o no tienen código);
 *   sin         no tiene ninguna línea de partida.
 * Las líneas se leen con `analizarElemento` (mismas reglas que la vista Partidas: la línea
 * padre no cuenta, las repetidas una vez). Sin React ni visor: pruebas/planillaCobertura.prueba.mjs.
 */
import { analizarElemento } from './planillaPartidas.js';

/** Los cuatro estados, en orden y con su color (paleta oficial, docs/ux/PALETA_OFICIAL_CLAUDE_DEFINICION.md). */
export const ESTADOS = Object.freeze([
    Object.freeze({ id: 'exacta', etiqueta: 'con partida del itemizado', color: '#788c5d' }),      // Green
    Object.freeze({ id: 'subpartida', etiqueta: 'con sub-partida de un ítem', color: '#6a9bcc' }), // Blue
    Object.freeze({ id: 'fuera', etiqueta: 'con partida fuera del itemizado o sin código', color: '#b93535' }), // Error
    Object.freeze({ id: 'sin', etiqueta: 'sin partida', color: '#d97757' }),                       // Orange: lo que falta
]);
const RANGO = { exacta: 0, subpartida: 1, fuera: 2, sin: 3 };

/** El capítulo de un código: su primer tramo (05.15.03.05 → 05). */
export const capituloDe = codigo => String(codigo || '').split('.')[0];

/** Estado de un elemento frente al itemizado: { estado, capitulos: [códigos de capítulo] }. */
export function estadoDeElemento(fila, dic, indice) {
    const { lineas } = analizarElemento(fila, dic);
    if (!lineas.length) return { estado: 'sin', capitulos: [] };
    let estado = 'fuera';
    const capitulos = new Set();
    for (const l of lineas) {
        if (!l.codigo) continue;
        const u = indice.ubicar(l.codigo);
        if (u.tipo === 'fuera') continue;
        const e = u.tipo === 'exacto' ? 'exacta' : 'subpartida';
        if (RANGO[e] < RANGO[estado]) estado = e;
        capitulos.add(capituloDe(l.codigo));
    }
    return { estado, capitulos: [...capitulos] };
}

/**
 * Cobertura de las filas dadas.
 * {
 *   total,
 *   porEstado: { exacta: [claves], subpartida: [], fuera: [], sin: [] },
 *   conPartida,                     exacta + subpartida
 *   porcentaje,                     conPartida / total (0-100, una cifra decimal)
 *   sinPorCategoria: [{ categoria, claves }]   los «sin partida», por categoría, de más a menos
 *   capitulos: [{ codigo, nombre, claves }]    elementos por capítulo (uno solo por elemento)
 *   variosCapitulos: [claves]
 * }
 */
export function coberturaDelItemizado(filas, dic, indice, claveDeFila, { categoriaDe = f => f['Revit Category'] } = {}) {
    const porEstado = { exacta: [], subpartida: [], fuera: [], sin: [] };
    const sinPorCategoria = new Map();
    const porCapitulo = new Map();
    const variosCapitulos = [];
    for (const fila of filas) {
        const clave = claveDeFila(fila);
        const { estado, capitulos } = estadoDeElemento(fila, dic, indice);
        porEstado[estado].push(clave);
        if (estado === 'sin') {
            const c = String(categoriaDe(fila) ?? '').trim() || '(sin categoría)';
            if (!sinPorCategoria.has(c)) sinPorCategoria.set(c, []);
            sinPorCategoria.get(c).push(clave);
        }
        if (capitulos.length === 1) {
            if (!porCapitulo.has(capitulos[0])) porCapitulo.set(capitulos[0], []);
            porCapitulo.get(capitulos[0]).push(clave);
        } else if (capitulos.length > 1) variosCapitulos.push(clave);
    }
    const total = filas.length;
    const conPartida = porEstado.exacta.length + porEstado.subpartida.length;
    return {
        total, porEstado, conPartida,
        porcentaje: total ? Math.round((conPartida / total) * 1000) / 10 : 0,
        sinPorCategoria: [...sinPorCategoria].map(([categoria, claves]) => ({ categoria, claves }))
            .sort((a, b) => b.claves.length - a.claves.length || a.categoria.localeCompare(b.categoria, 'es')),
        capitulos: [...porCapitulo].map(([codigo, claves]) => ({ codigo, nombre: indice.porCodigo.get(codigo)?.descripcion || '', claves }))
            .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })),
        variosCapitulos,
    };
}
