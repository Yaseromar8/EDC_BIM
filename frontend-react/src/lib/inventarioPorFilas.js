// EL INVENTARIO SE LEE FILA A FILA (11-nov-2026, docs/rendimiento/04).
//
// Antes: `res.text()` + `JSON.parse`. Con eso el navegador tenía a la vez el texto entero, la lista
// entera que salía de él y la lista ya normalizada. Medido en Chrome con 95.000 elementos: 1,5 GB de
// memoria y 15 s con la pantalla congelada; y por encima de ~512 MB de JSON el texto no cabe en una
// cadena, `res.text()` devuelve vacío y el inventario no cargaba («Unexpected end of JSON input»).
//
// El servidor escribe una fila por línea (backend/inventory_http.py `_construir_cuerpo`): sigue siendo
// la misma lista JSON, pero aquí cada línea se convierte y se entrega según llega, y nunca existen ni
// el texto entero ni la lista cruda. Entre trozo y trozo de red el navegador sigue atendiendo.
//
// Un servidor anterior, que manda la lista en una sola línea, también se entiende: esa línea es la
// lista entera y se entrega fila a fila (con el coste de memoria de antes).
import { crearNormalizador } from './inventoryNormalizers.js';

/** Lo que trae una línea del cuerpo: una fila, la lista entera (servidor anterior) o nada. */
export function filasDeLinea(linea) {
    let texto = linea.trim();
    if (texto === '' || texto === '[' || texto === ']') return [];
    if (texto.startsWith('[')) {                       // servidor anterior, o lista corta en una línea
        const lista = JSON.parse(texto);
        if (!Array.isArray(lista)) throw new Error('El inventario no es una lista.');
        return lista;
    }
    if (texto.startsWith(',')) texto = texto.slice(1);
    if (texto.endsWith(']')) texto = texto.slice(0, -1).trimEnd();   // la última fila, si el «]» viene pegado
    if (texto.endsWith(',')) texto = texto.slice(0, -1);
    if (texto === '') return [];
    return [JSON.parse(texto)];
}

/**
 * Lee el cuerpo de una respuesta de /api/inventory y llama a `alLlegar(fila)` con cada una.
 *
 * Devuelve `{ filas, vacio }`: cuántas llegaron, y si el cuerpo no traía nada (ni siquiera «[]»: es
 * lo que pasa cuando el servidor está despertando, y quien llama reintenta). Lanza si el cuerpo no es
 * JSON o si viene CORTADO: una lista que no llega a su «]» no se da por buena aunque el corte caiga
 * justo entre dos filas.
 */
export async function leerInventarioPorFilas(respuesta, alLlegar) {
    let filas = 0;
    let vacio = true;
    let cerrada = false;
    const entregar = linea => {
        const texto = linea.trim();
        if (texto === '') return;
        vacio = false;
        if (cerrada) throw new Error('Inventario con JSON inválido (hay datos después del final de la lista).');
        let leidas;
        try {
            leidas = filasDeLinea(texto);
        } catch {
            throw new Error(`Inventario con JSON inválido (fila ${filas + 1}, posible respuesta truncada).`);
        }
        for (const fila of leidas) { alLlegar(fila); filas += 1; }
        if (texto.endsWith(']')) cerrada = true;
    };

    if (!respuesta.body || typeof TextDecoderStream === 'undefined') {
        // Sin lectura por trozos (navegador muy antiguo, o un doble de pruebas que solo tiene texto).
        for (const linea of (await respuesta.text()).split('\n')) entregar(linea);
    } else {
        // La línea en curso se guarda en trozos y el salto de línea se busca SOLO en el trozo recién
        // llegado: si el cuerpo fuera una sola línea enorme (servidor anterior) no se vuelve a
        // recorrer lo ya leído.
        const lector = respuesta.body.pipeThrough(new TextDecoderStream()).getReader();
        let pendiente = [];
        for (;;) {
            const { value, done } = await lector.read();
            if (done) break;
            let desde = 0;
            let corte;
            while ((corte = value.indexOf('\n', desde)) >= 0) {
                pendiente.push(value.slice(desde, corte));
                entregar(pendiente.length === 1 ? pendiente[0] : pendiente.join(''));
                pendiente = [];
                desde = corte + 1;
            }
            if (desde < value.length) pendiente.push(value.slice(desde));
        }
        if (pendiente.length) entregar(pendiente.join(''));
    }
    if (!vacio && !cerrada) {
        throw new Error(`Inventario incompleto: la respuesta se cortó tras ${filas} filas.`);
    }
    return { filas, vacio };
}

/**
 * El inventario de una respuesta, ya normalizado: `{ mappedData, schemaMap, vacio }`.
 * Es lo mismo que daba `normalizeInventoryPreload(await res.json())`, sin pasar por la lista cruda.
 */
export async function inventarioDeRespuesta(respuesta, normalizeRevitCategory) {
    const normalizador = crearNormalizador(normalizeRevitCategory);
    const { vacio } = await leerInventarioPorFilas(respuesta, normalizador.fila);
    return { ...normalizador.fin(), vacio };
}
