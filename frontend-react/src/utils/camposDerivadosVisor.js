/**
 * Los campos derivados (lib/camposDerivados.js) en el visor: cuándo se calculan y quién se entera.
 *
 *   - Al publicar el inventario (App.tagInventory, el ÚNICO sitio que lo escribe) y ANTES de
 *     anunciarlo con `inventory-ready`: así una vista guardada que filtra por «Planilla › Capítulo»
 *     encuentra el campo al restaurarse.
 *   - Cuando cambia el itemizado de la obra (cargado tarde, otra versión, quitado): se recalcula sobre
 *     el inventario en memoria, se marca la revisión y Filters vuelve a calcular.
 *   - App añade los campos a la lista de propiedades de Filters (`esquemaDerivadoVigente`), y la
 *     Planilla reutiliza la deducción (`contextoDerivado`) en vez de repetirla.
 *
 * Un itemizado solo se aplica al inventario de SU frente (`scope`): nunca el de otra obra.
 */
import { itemizadoDeObra } from './itemizadoDeObraVisor';
import { markInventoryRevision } from '../lib/inventoryIdentity';
import { aplicarDerivados, esquemaDerivado } from '../lib/camposDerivados';

let contexto = null;     // { scope, huella, version, roles, dic, porEstado, aplicados, ms } o null
const oyentes = new Set();
const publicar = () => { for (const f of oyentes) f(contexto); };

export const contextoDerivado = () => contexto;
export function suscribirDerivados(f) { oyentes.add(f); return () => oyentes.delete(f); }
/** Lo que se añade a la lista de propiedades de Filters ([] sin itemizado). */
export const esquemaDerivadoVigente = () => (contexto ? esquemaDerivado() : []);

/** Calcula y escribe los campos en `filas` (las del frente `scope`). Las quita si no hay itemizado. */
export function aplicarAlInventario(filas, scope) {
    const e = itemizadoDeObra.estado();
    const itemizado = scope && e.scope === scope ? e.vigente : null;
    if (!Array.isArray(filas)) {
        const habia = contexto !== null;
        contexto = null;
        if (habia) publicar();
        return null;
    }
    const r = aplicarDerivados(filas, itemizado);
    contexto = itemizado ? { scope, huella: itemizado.huella, version: itemizado.version, ...r } : null;
    if (itemizado) console.log(`[Planilla] campos derivados: ${r.aplicados} elementos en ${r.ms} ms (itemizado v${itemizado.version})`);
    publicar();
    return contexto;
}

// El itemizado cambió (o llegó después del inventario): recalcular sobre lo que hay en memoria.
itemizadoDeObra.suscribir(estado => {
    if (estado.cargando || estado.guardando) return;
    const filas = typeof window !== 'undefined' ? window.postgresInventory : null;
    const scope = typeof window !== 'undefined' ? window.postgresInventoryUrn : null;
    if (!Array.isArray(filas)) return;
    const itemizado = estado.scope === scope ? estado.vigente : null;
    if ((itemizado?.huella || null) === (contexto?.huella || null) && (!itemizado || contexto?.scope === scope)) return;
    aplicarAlInventario(filas, scope);
    markInventoryRevision();
    window.dispatchEvent(new CustomEvent('recalculate-filters'));
});
