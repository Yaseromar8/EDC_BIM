/**
 * preflightFiltros — VALIDAR UNA SAVED VIEW ANTES DE APLICARLA, SIN TOCAR NADA.
 * ---------------------------------------------------------------------------
 * Una vista guardada en marzo puede traer propiedades que ya no existen y
 * valores que se renombraron. Aplicarla a ciegas produjo el peor de los fallos
 * posibles, medido en la Auditoría 02 sobre la vista `03_AVANCE_MARZO01`:
 *
 *     propId inexistente  ->  0 coincidencias  ->  globalValidDbIds vacío
 *                         ->  isolate([-1]) en los 3 modelos
 *                         ->  MODELO FANTASMA: pantalla vacía, sin un error
 *
 * Este módulo mira ANTES: qué de lo guardado sigue existiendo, y produce una
 * selección segura más un parte de lo descartado.
 *
 * POR QUE NO SE USA `calculateBucketsFromPostgres`
 * -----------------------------------------------
 * Porque no es pura. Sus primeras líneas leen `_facetCache`, y la Auditoría 02
 * demostró (R-08) que esa caché queda obsoleta al editar el inventario: compara
 * `allData` POR REFERENCIA, así que una mutación in-place no la invalida.
 * Medido: 1126 «Walls» antes y 1126 después de mutar 50 filas a otro valor.
 * Validar una vista contra esa caché sería validarla contra datos viejos.
 *
 * R-08 QUEDO ARREGLADO EN B2: la caché ya no compara `allData` por referencia,
 * sino que exige una revisión declarada por quien escribe o edita el inventario.
 * Este módulo sigue sin usar el motor de todos modos, y ahora por un motivo más
 * simple: validar una vista no necesita calcular facetas ni tocar el visor.
 *
 * LAS REGLAS DE VALOR SON LAS DEL PRODUCTO, NO LAS MIAS
 * -----------------------------------------------------
 * La normalización de valores se toma de `aps/utils/model.js` (`_safeUrn`,
 * `_normVal`), y la identidad de propiedad NO se replica: se importa de
 * `lib/filterPropertyIdentity.js`, el mismo módulo que usa el motor.
 *
 *     Grupo::Propiedad                              es la identidad
 *     el nombre suelto                              sólo si no hay homónimos
 *     Standard::Sources                             -> el urn del modelo
 *
 * Antes aquí se copiaba `propId.split('::')[1]`, que aplanaba los homónimos: dos
 * grupos con la misma propiedad se validaban como uno. Compartir el módulo es lo
 * que impide que vuelvan a divergir; si divergieran, el preflight aprobaría una
 * selección que luego no casa.
 *
 * CONSERVADURISMO — LA REGLA QUE LO GOBIERNA TODO
 * -----------------------------------------------
 *     SOLO SE PODA LO QUE SE PUEDE DEMOSTRAR AUSENTE. En cualquier duda,
 *     se conserva, y el guardián `isolate(empty)` hace de última defensa.
 *
 * PUREZA
 * ------
 * Entradas explícitas. Cero `_facetCache`, cero globales derivadas, cero
 * efectos sobre el visor, cero eventos. No calcula conteos facetados: para
 * validar una vista basta saber si un valor EXISTE, no cuántas veces.
 */

import { _safeUrn, _normVal } from '../aps/utils/model.js';
import { knownPropertyNames, readFilterProperty } from './filterPropertyIdentity.js';

/** Los dos valores sintéticos que el motor de facetas fabrica por su cuenta. */
export const VALORES_SINTETICOS = Object.freeze(['(Unassigned)', '(No aplica)']);

/** El propId cuyos valores no son columnas del inventario, sino modelos. */
export const PROP_SOURCES = 'Standard::Sources';

/** propId -> nombre de la columna en la fila. La regla es la de `getRowValue`. */
export const nombreDeColumna = (propId) => String(propId).split('::')[1] || String(propId);

/**
 * Índice de valores presentes, en UNA pasada sobre las filas y solo para las
 * propiedades pedidas. Devuelve `Map<propId, Set<valor>>`.
 */
export function valoresPresentes(filas, propiedades) {
    const porProp = new Map();
    for (const propId of propiedades) {
        porProp.set(propId, new Set());
    }
    if (!Array.isArray(filas)) return porProp;
    const owners = knownPropertyNames(filas, propiedades);

    for (let i = 0; i < filas.length; i++) {
        const fila = filas[i];
        if (!fila) continue;
        if (porProp.has(PROP_SOURCES)) {
            const urn = fila.source_urn || fila.model_urn;
            if (urn) porProp.get(PROP_SOURCES).add(String(urn).trim());
        }
        for (const propId of propiedades) {
            if (propId === PROP_SOURCES) continue;
            const v = _normVal(readFilterProperty(fila, propId, owners));
            if (v) porProp.get(propId).add(v);
        }
    }
    return porProp;
}

/**
 * Produce la selección segura.
 *
 * @param {object[]} filas       instantánea del inventario (window.postgresInventory)
 * @param {string[]} propiedades orden de propiedades de la vista
 * @param {object}   selecciones { propId: [valores] }
 * @param {object}   alias       { propIdViejo: propIdNuevo }
 * @param {object[]} modelos     [{ urn }] de la federación, para validar Sources
 * @returns {{ propiedades, selecciones, descartes, seDecidio }}
 */
export function resolverSeleccion({ filas, propiedades = [], selecciones = {}, alias = {}, modelos = [] }) {
    const descartes = [];
    const aliasDe = (p) => (Object.prototype.hasOwnProperty.call(alias, p) ? alias[p] : p);

    // 1 · Alias. Se aplica a las propiedades Y a las claves de selección, y se
    //     anota: que una vista de marzo siga abriéndose no debe ser invisible.
    const propsAlias = [];
    for (const p of propiedades) {
        const n = aliasDe(p);
        if (n !== p) descartes.push({ tipo: 'alias', propId: p, nuevo: n });
        if (!propsAlias.includes(n)) propsAlias.push(n);
    }
    const selAlias = {};
    for (const p of Object.keys(selecciones)) {
        const n = aliasDe(p);
        if (n !== p && !descartes.some((d) => d.tipo === 'alias' && d.propId === p)) {
            descartes.push({ tipo: 'alias', propId: p, nuevo: n });
        }
        const vals = selecciones[p] || [];
        selAlias[n] = (selAlias[n] || []).concat(vals);
        if (!propsAlias.includes(n)) propsAlias.push(n);
    }

    // 2 · SIN DATOS NO SE PODA NADA. Si el inventario todavía no está cargado,
    //     «no aparece» no significa «no existe»: significa que no se sabe. Podar
    //     aquí borraría los filtros de cualquier vista abierta demasiado pronto.
    if (!Array.isArray(filas) || filas.length === 0) {
        return {
            propiedades: propsAlias,
            selecciones: selAlias,
            descartes: descartes.concat([{ tipo: 'sin-inventario' }]),
            seDecidio: false,
        };
    }

    // 3 · Índice de lo que existe de verdad, y los urns de la federación.
    const presentes = valoresPresentes(filas, propsAlias);
    const urnsModelo = new Set();
    for (const m of modelos || []) {
        if (!m) continue;
        const u = m.urn || m;
        if (u) { urnsModelo.add(String(u).trim()); urnsModelo.add(_safeUrn(u)); }
    }

    // 4 · Podar solo lo demostrablemente ausente.
    const propsFinales = [];
    for (const p of propsAlias) {
        const vistos = presentes.get(p);
        // Una propiedad SIN NI UN VALOR en todo el inventario no existe: fuera.
        // `Standard::Sources` nunca se poda: sus valores son modelos, no columnas.
        if (p !== PROP_SOURCES && (!vistos || vistos.size === 0)) {
            descartes.push({ tipo: 'propiedad-inexistente', propId: p });
            delete selAlias[p];
            continue;
        }
        propsFinales.push(p);
    }

    const selFinal = {};
    for (const p of Object.keys(selAlias)) {
        if (!propsFinales.includes(p)) continue;
        const pedidos = Array.from(new Set(selAlias[p] || []));
        if (pedidos.length === 0) continue;
        const vistos = presentes.get(p) || new Set();

        const sobreviven = pedidos.filter((v) => {
            if (VALORES_SINTETICOS.includes(v)) return true;        // no se puede probar su ausencia
            if (p === PROP_SOURCES) return urnsModelo.size === 0 || urnsModelo.has(String(v).trim()) || urnsModelo.has(_safeUrn(v));
            return vistos.has(_normVal(v));
        });

        const perdidos = pedidos.filter((v) => !sobreviven.includes(v));
        if (perdidos.length) {
            descartes.push({
                tipo: sobreviven.length === 0 ? 'valores-ninguno-casa' : 'valores-parcial',
                propId: p, perdidos, conservados: sobreviven.length, pedidos: pedidos.length,
            });
        }
        // Si NINGUNO casa, la propiedad entera se cae: aplicar una selección
        // vacía sobre una propiedad activa es exactamente lo que produce el
        // conjunto vacío que acaba en `isolate([-1])`.
        if (sobreviven.length > 0) selFinal[p] = sobreviven;
    }

    return { propiedades: propsFinales, selecciones: selFinal, descartes, seDecidio: true };
}

/**
 * El guardián de última defensa, aparte a propósito para que se pueda invocar
 * desde el pipeline aunque el preflight no se haya ejecutado.
 *
 * No decide qué aislar: decide si SE PUEDE aislar. Un conjunto vacío nunca.
 */
export function sePuedeAislar(dbIds) {
    return Array.isArray(dbIds) && dbIds.length > 0 && !(dbIds.length === 1 && dbIds[0] === -1);
}
