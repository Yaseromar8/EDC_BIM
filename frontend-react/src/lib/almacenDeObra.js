/**
 * Almacén de un dato de la OBRA guardado con versiones en el servidor (docs/visor/27 §6, 32 §5).
 *
 * Lo comparten el itemizado (migración 40) y los criterios de medida (migración 41): las dos cosas
 * son de la obra, tienen una versión vigente, las cambia solo el administrador y, si el servidor
 * no puede guardarlas, siguen funcionando en el navegador. Antes esto vivía dentro de
 * itemizadoDeObra.js; se sacó aquí para no copiarlo.
 *
 * Contrato:
 *   - `cargar(scope)` pide el vigente de la obra del frente `scope`. Una respuesta que llega tarde
 *     (el usuario ya cambió de obra) se descarta.
 *   - `guardar(datos)` manda los datos; el servidor los valida y crea una versión. Después se vuelve
 *     a pedir: lo que se usa es SIEMPRE lo que quedó guardado, no lo que se mandó.
 *   - `quitar()` (si la ruta lo admite) deja la obra sin vigente; el servidor no borra.
 *   - Cada cambio de estado se avisa a quien escucha (`suscribir`), con un estado nuevo (inmutable).
 *   - SI EL SERVIDOR NO PUEDE GUARDAR (falta la migración, backend anterior sin la ruta, vista
 *     compartida sin sesión), pasa a `modo: 'navegador'`: el dato vive en este navegador y se pierde
 *     al recargar, con un aviso que lo dice. Subir el código antes que la migración no rompe nada.
 *
 * Sin React ni red: `pedir(metodo, ruta, cuerpo)` lo pone quien lo crea.
 */

const VACIO = Object.freeze({ scope: null, cargando: false, guardando: false, vigente: null, versiones: [], puedeEditar: false, error: '', modo: 'obra', aviso: '' });

/**
 * @param {object} o
 * @param {Function} o.pedir           (metodo, ruta, cuerpo) → { ok, status, json }
 * @param {string}   o.ruta            '/api/planilla/itemizado'
 * @param {Function} o.desdeServidor   json.vigente → lo que usa el visor (o null)
 * @param {Function} o.local           datos → lo que usa el visor en modo navegador (o null)
 * @param {Function} [o.cuerpo]        datos → campos del POST (además de `project`)
 * @param {object}   o.textos          { sinMigracion, compartida, antiguo, pedir, guardar, quitar, leer }
 */
export function crearAlmacenDeObra({ pedir, ruta, desdeServidor, local, cuerpo = d => d, textos }) {
    let estado = VACIO;
    let pedido = 0;            // para descartar respuestas viejas
    const oyentes = new Set();
    const publicar = cambio => {
        estado = Object.freeze({ ...estado, ...cambio });
        for (const f of oyentes) f(estado);
    };
    const mensajeDe = (r, porDefecto) => r?.json?.error || porDefecto;

    /** ¿La respuesta dice que este servidor no puede guardar? Entonces, modo navegador. */
    function avisoSinGuardado(r) {
        const code = r?.json?.code;
        if (code === 'MIGRATION_MISSING') return textos.sinMigracion;
        if (code === 'NO_DISPONIBLE') return textos.compartida;
        if (r?.status === 404) return textos.antiguo;
        return null;
    }

    async function cargar(scope) {
        const mio = ++pedido;
        if (!scope || scope === 'global') { publicar({ ...VACIO, scope: scope || null }); return estado; }
        const mismaObra = estado.scope === scope;
        publicar({ scope, cargando: true, error: '', ...(mismaObra ? {} : { vigente: null, versiones: [], puedeEditar: false, modo: 'obra', aviso: '' }) });
        let r;
        try {
            r = await pedir('GET', `${ruta}?project=${encodeURIComponent(scope)}`);
        } catch (e) {
            r = { ok: false, json: { error: `${textos.pedir}: ${e.message}` } };
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
            publicar({ cargando: false, vigente: null, versiones: [], puedeEditar: false, error: mensajeDe(r, textos.leer) });
            return estado;
        }
        publicar({
            cargando: false, error: '', modo: 'obra', aviso: '', vigente: desdeServidor(r.json.vigente),
            versiones: Array.isArray(r.json.versiones) ? r.json.versiones : [], puedeEditar: !!r.json.puede_editar,
        });
        return estado;
    }

    /** { ok, version, sinCambios } o { ok: false, error, code }. */
    async function guardar(datos) {
        const scope = estado.scope;
        if (!scope) return { ok: false, error: 'No hay obra abierta.' };
        if (estado.modo === 'navegador') {
            publicar({ vigente: local(datos), error: '' });
            return { ok: true, local: true };
        }
        publicar({ guardando: true, error: '' });
        let r;
        try {
            r = await pedir('POST', ruta, { project: scope, ...cuerpo(datos) });
        } catch (e) {
            r = { ok: false, json: { error: `${textos.guardar}: ${e.message}` } };
        }
        publicar({ guardando: false });
        if (!r.ok) {
            const aviso = avisoSinGuardado(r);
            if (aviso) {
                publicar({ modo: 'navegador', aviso, puedeEditar: true, vigente: local(datos), error: '' });
                return { ok: true, local: true };
            }
            const error = mensajeDe(r, `${textos.guardar}.`);
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
            r = await pedir('DELETE', `${ruta}?project=${encodeURIComponent(scope)}`);
        } catch (e) {
            r = { ok: false, json: { error: `${textos.quitar}: ${e.message}` } };
        }
        publicar({ guardando: false });
        if (!r.ok) {
            const error = mensajeDe(r, `${textos.quitar}.`);
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
