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
 * Sin React ni red: `pedir(metodo, ruta, cuerpo)` lo pone quien lo crea (utils/itemizadoDeObraVisor.js).
 * Pruebas: pruebas/itemizadoDeObra.prueba.mjs.
 */
import { indiceDeItemizado, explicarOrigen } from './planillaItemizado.js';

const VACIO = Object.freeze({ scope: null, cargando: false, guardando: false, vigente: null, versiones: [], puedeEditar: false, error: '', modo: 'obra', aviso: '' });

/** ¿La respuesta dice que este servidor no puede guardar itemizados? Entonces, modo navegador. */
function avisoSinGuardado(r) {
    const code = r?.json?.code;
    if (code === 'MIGRATION_MISSING') return 'No se guarda para la obra (falta la migración 40 en el servidor): se usa solo en este navegador y se pierde al recargar.';
    if (code === 'NO_DISPONIBLE') return 'En una vista compartida el itemizado se usa solo en este navegador.';
    if (r?.status === 404) return 'Este servidor aún no guarda itemizados: se usa solo en este navegador y se pierde al recargar.';
    return null;
}

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

const mensajeDe = (r, porDefecto) => r?.json?.error || porDefecto;

export function crearAlmacenDeItemizado({ pedir }) {
    let estado = VACIO;
    let pedido = 0;            // para descartar respuestas viejas
    const oyentes = new Set();
    const publicar = cambio => {
        estado = Object.freeze({ ...estado, ...cambio });
        for (const f of oyentes) f(estado);
    };

    async function cargar(scope) {
        const mio = ++pedido;
        if (!scope || scope === 'global') { publicar({ ...VACIO, scope: scope || null }); return estado; }
        const mismaObra = estado.scope === scope;
        publicar({ scope, cargando: true, error: '', ...(mismaObra ? {} : { vigente: null, versiones: [], puedeEditar: false, modo: 'obra', aviso: '' }) });
        let r;
        try {
            r = await pedir('GET', `/api/planilla/itemizado?project=${encodeURIComponent(scope)}`);
        } catch (e) {
            r = { ok: false, json: { error: `No se pudo pedir el itemizado de la obra: ${e.message}` } };
        }
        if (mio !== pedido) return estado;          // el usuario ya está en otra obra
        if (!r.ok) {
            const aviso = avisoSinGuardado(r);
            if (aviso) {
                // Modo navegador: se conserva lo que ya se hubiera cargado en esta obra.
                publicar({ cargando: false, error: '', modo: 'navegador', aviso, puedeEditar: true, versiones: [],
                    vigente: mismaObra && estado.modo === 'navegador' ? estado.vigente : null });
                return estado;
            }
            publicar({ cargando: false, vigente: null, versiones: [], puedeEditar: false, error: mensajeDe(r, 'No se pudo leer el itemizado de la obra.') });
            return estado;
        }
        publicar({
            cargando: false, error: '', modo: 'obra', aviso: '', vigente: itemizadoDesdeServidor(r.json.vigente),
            versiones: Array.isArray(r.json.versiones) ? r.json.versiones : [], puedeEditar: !!r.json.puede_editar,
        });
        return estado;
    }

    /** { ok, version, sinCambios } o { ok: false, error }. */
    async function guardar({ items, hoja = '', columnas = {}, archivo }) {
        const scope = estado.scope;
        if (!scope) return { ok: false, error: 'No hay obra abierta.' };
        if (estado.modo === 'navegador') {
            publicar({ vigente: itemizadoLocal({ items, hoja, columnas, archivo }), error: '' });
            return { ok: true, local: true };
        }
        publicar({ guardando: true, error: '' });
        let r;
        try {
            r = await pedir('POST', '/api/planilla/itemizado', { project: scope, archivo, hoja, columnas, items });
        } catch (e) {
            r = { ok: false, json: { error: `No se pudo guardar el itemizado: ${e.message}` } };
        }
        publicar({ guardando: false });
        if (!r.ok) {
            const aviso = avisoSinGuardado(r);
            if (aviso) {
                publicar({ modo: 'navegador', aviso, puedeEditar: true, vigente: itemizadoLocal({ items, hoja, columnas, archivo }), error: '' });
                return { ok: true, local: true };
            }
            const error = mensajeDe(r, 'No se pudo guardar el itemizado.');
            publicar({ error });
            return { ok: false, error, code: r.json?.code };
        }
        if (estado.scope === scope) await cargar(scope);
        return { ok: true, version: r.json.version, sinCambios: !!r.json.sin_cambios };
    }

    /** { ok, retirada } o { ok: false, error }. */
    async function quitar() {
        const scope = estado.scope;
        if (!scope) return { ok: false, error: 'No hay obra abierta.' };
        if (estado.modo === 'navegador') { publicar({ vigente: null, error: '' }); return { ok: true, retirada: null, local: true }; }
        publicar({ guardando: true, error: '' });
        let r;
        try {
            r = await pedir('DELETE', `/api/planilla/itemizado?project=${encodeURIComponent(scope)}`);
        } catch (e) {
            r = { ok: false, json: { error: `No se pudo quitar el itemizado: ${e.message}` } };
        }
        publicar({ guardando: false });
        if (!r.ok) {
            const error = mensajeDe(r, 'No se pudo quitar el itemizado.');
            publicar({ error });
            return { ok: false, error };
        }
        if (estado.scope === scope) await cargar(scope);
        return { ok: true, retirada: r.json.retirada ?? null };
    }

    return {
        estado: () => estado,
        suscribir(f) { oyentes.add(f); return () => oyentes.delete(f); },
        cargar, guardar, quitar,
    };
}
