/**
 * El itemizado de la OBRA en el visor (docs/visor/27 §6, backend sql/40 + routes/planilla.py).
 *
 * Un solo sitio para todo el visor: la Planilla lo enseña y lo usa, y los campos derivados
 * (paso 2) lo leen al cargar el inventario, esté abierta la Planilla o no. Antes vivía dentro
 * del componente de la Planilla: se perdía al recargar y cada persona veía otra cosa.
 *
 * Contrato:
 *   - `cargar(scope)` pide el vigente de la obra del frente `scope`. Una respuesta que llega tarde
 *     (el usuario ya cambió de obra) se descarta.
 *   - `guardar(leido)` manda la lista leída del Excel; el servidor la valida y crea una versión.
 *     Después se vuelve a pedir: lo que se usa es SIEMPRE lo que quedó guardado, no lo que se mandó.
 *   - `quitar()` deja la obra sin vigente (el servidor no borra: queda en su historial).
 *   - Cada cambio de estado se avisa a quien escucha (`suscribir`), con un estado nuevo (inmutable).
 *   - SI EL SERVIDOR NO PUEDE GUARDAR (falta la migración 40, o es un backend anterior sin la ruta, o
 *     una vista compartida sin sesión), la Planilla NO deja de funcionar: pasa a `modo: 'navegador'`,
 *     como antes de existir el guardado: el itemizado vive en este navegador y se pierde al recargar,
 *     con un aviso que lo dice. Así subir el código antes que la migración no rompe nada.
 *
 * El almacén (cargar, guardar, quitar, modo navegador) es lib/almacenDeObra.js, compartido con los
 * criterios de medida. Sin React ni red: `pedir` lo pone utils/itemizadoDeObraVisor.js.
 * Pruebas: pruebas/itemizadoDeObra.prueba.mjs.
 */
import { indiceDeItemizado, explicarOrigen } from './planillaItemizado.js';
import { crearAlmacenDeObra } from './almacenDeObra.js';

/** Huella de una lista en el navegador (FNV-1a de 32 bits): distingue una lista de otra, nada más. */
function huellaLocal(items) {
    let h = 0x811c9dc5;
    const s = JSON.stringify(items);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return `local-${(h >>> 0).toString(16)}-${items.length}`;
}

/** Lo leído del Excel → lo que usa la Planilla, sin pasar por el servidor (modo navegador). */
export function itemizadoLocal({ items, hoja = '', columnas = {}, archivo }) {
    if (!Array.isArray(items) || !items.length) return null;
    return {
        items, hoja, columnas, archivo, version: null, huella: huellaLocal(items), creadoPor: '', creadoEn: null, local: true,
        porque: explicarOrigen({ hoja, columnas, items }), indice: indiceDeItemizado(items),
    };
}

/** Lo que devuelve el servidor → lo que usa la Planilla ({ items, indice, porque, archivo, version… }). */
export function itemizadoDesdeServidor(v) {
    if (!v || !Array.isArray(v.items) || !v.items.length) return null;
    return {
        items: v.items, hoja: v.hoja || '', columnas: v.columnas || {}, archivo: v.archivo,
        version: v.version, huella: v.huella, creadoPor: v.creado_por || '', creadoEn: v.creado_en || null,
        porque: explicarOrigen(v), indice: indiceDeItemizado(v.items),
    };
}

export function crearAlmacenDeItemizado({ pedir }) {
    return crearAlmacenDeObra({
        pedir, ruta: '/api/planilla/itemizado',
        desdeServidor: itemizadoDesdeServidor,
        local: itemizadoLocal,
        cuerpo: ({ items, hoja = '', columnas = {}, archivo }) => ({ archivo, hoja, columnas, items }),
        textos: {
            sinMigracion: 'No se guarda para la obra (falta la migración 40 en el servidor): se usa solo en este navegador y se pierde al recargar.',
            compartida: 'En una vista compartida el itemizado se usa solo en este navegador.',
            antiguo: 'Este servidor aún no guarda itemizados: se usa solo en este navegador y se pierde al recargar.',
            pedir: 'No se pudo pedir el itemizado de la obra',
            leer: 'No se pudo leer el itemizado de la obra.',
            guardar: 'No se pudo guardar el itemizado',
            quitar: 'No se pudo quitar el itemizado',
        },
    });
}
