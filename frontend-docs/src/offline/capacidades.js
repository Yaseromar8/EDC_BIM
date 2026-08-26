/**
 * GAP 07 · ¿ESTE SERVIDOR SABE RECIBIR TRABAJO DE CAMPO?
 *
 * POR QUÉ ESTO EXISTE, Y NO ES UN PARCHE
 * ---------------------------------------
 * En este producto el portal se despliega SOLO, unos segundos después de cada
 * push, y el backend lo despliega una persona cuando puede. Eso no es un
 * accidente de un día: es cómo está montado. Y significa que **siempre** hay
 * una ventana —minutos u horas— en la que el navegador tiene código más nuevo
 * que el servidor.
 *
 * Un cliente que da por hecho que el servidor ya tiene sus rutas está mal
 * construido para este despliegue. Durante esa ventana llamaría a `/api/sync`,
 * recibiría un 404, y —esto es lo grave— rompería levantar un punch y levantar
 * un acta, que hoy funcionan.
 *
 * Así que se pregunta. Una vez, y se recuerda.
 *
 * CÓMO SE PREGUNTA
 * ----------------
 * `/api/sync` sólo acepta POST. Un GET distingue las dos situaciones sin
 * escribir nada y sin inventarse un endpoint de «salud»:
 *
 *     404  la ruta NO existe        → este servidor no recibe campo
 *     405  existe, método incorrecto → sí lo recibe
 *
 * LO QUE NO SE HACE: ENCOLAR CONTRA UN SERVIDOR QUE NO PUEDE RECIBIRLO
 * --------------------------------------------------------------------
 * Si no lo recibe, la captura va por la ruta de siempre y NO se ofrece trabajar
 * sin cobertura. Una cola que no puede vaciarse nunca es peor que no tener
 * cola: el inspector cree que su jornada está guardada y esperando, y no está
 * esperando nada.
 *
 * Ante la duda —no se pudo preguntar, no hay red para preguntar— la respuesta
 * es NO. Prometer offline sin poder cumplirlo es el único error de esta lista
 * que se paga con trabajo perdido.
 */
import { apiFetch } from '../utils/apiFetch';

// null = todavía no se sabe. No se cachea el «no sé»: la próxima vez se vuelve
// a preguntar, porque entretanto pueden haber desplegado el backend.
let _respuesta = null;
let _preguntando = null;

export async function tieneSincronizacionDeCampo(API) {
  if (_respuesta !== null) return _respuesta;
  if (_preguntando) return _preguntando;

  _preguntando = (async () => {
    try {
      const r = await apiFetch(`${API}/api/sync`, { method: 'GET', retries: 0 });
      // 404 es la única respuesta que significa «esta ruta no está aquí».
      // Cualquier otra —405, 401, 403, 500— la dice existente, y eso es lo que
      // se está preguntando.
      const hay = r.status !== 404;
      _respuesta = hay;
      return hay;
    } catch (e) {
      // No se pudo preguntar. NO se recuerda como «no»: se responde que no
      // ahora y se vuelve a preguntar la próxima vez.
      return false;
    } finally {
      _preguntando = null;
    }
  })();
  return _preguntando;
}

/** Lo que se sabe SIN preguntar. `null` si todavía no se ha preguntado — la
 *  interfaz lo usa para no prometer nada mientras no lo sepa. */
export function loQueSabemos() {
  return _respuesta;
}
