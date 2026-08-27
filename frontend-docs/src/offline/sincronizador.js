/**
 * GAP 07 · EL SINCRONIZADOR — lleva la cola al servidor y aplica su veredicto.
 *
 * NO DEPENDE DE BACKGROUND SYNC
 * ------------------------------
 * La Background Sync API no existe en iOS y su disponibilidad varía por
 * plataforma y por versión. Apoyar el producto en ella significaría que en
 * media obra la cola no sube nunca — y nadie se enteraría, porque «está
 * pendiente» parece un estado normal.
 *
 * Así que hay TRES disparadores que sí existen en todas partes:
 *
 *     evento `online`      vuelve la cobertura
 *     app abierta/resume   el usuario vuelve a la pantalla
 *     botón Sincronizar    lo pide una persona
 *
 * Si Background Sync está disponible se registra ADEMÁS, como mejora. Nunca
 * como el único camino.
 *
 * EL SERVIDOR MANDA
 * -----------------
 * Aquí no se decide nada: se envía, se recibe un desenlace por `operation_id`
 * y se guarda tal cual. El cliente no reinterpreta un CONFLICTO ni convierte un
 * RECHAZADA en un reintento.
 */
import { apiFetch } from '../utils/apiFetch';
import * as local from './almacenLocal';

const LOTE = 50;

let _enCurso = false;
let _oyentes = [];

export function alCambiar(fn) {
  _oyentes.push(fn);
  return () => { _oyentes = _oyentes.filter(x => x !== fn); };
}

function avisar(evento) {
  _oyentes.forEach(fn => { try { fn(evento); } catch (e) { /* un oyente roto no para la sync */ } });
}

/**
 * Sube las evidencias de una operación ANTES de mandar el acto.
 *
 * Dos colas, y este es el motivo: una foto de 8 MB en un cerro sin cobertura no
 * puede bloquear un acta que pesa 2 KB. Si la foto no sube, el acto NO se manda
 * —iría sin su evidencia y el servidor lo rechazaría con razón— pero tampoco se
 * pierde: se queda pendiente y se reintenta.
 *
 * Devuelve `null` si todo subió, o el motivo si falta algo.
 */
async function subirEvidencias(API, ctx, operacion) {
  const blobs = await local.blobsDeOperacion(operacion.operation_id);
  const faltan = blobs.filter(b => !b.subido);
  if (!faltan.length) return null;

  for (const b of faltan) {
    try {
      const forma = new FormData();
      forma.append('file', b.blob, b.nombre);
      forma.append('operation_id', operacion.operation_id);
      forma.append('project_id', ctx.project_id);
      if (b.sha256) forma.append('sha256', b.sha256);
      const r = await apiFetch(`${API}/api/sync/evidencia`, {
        method: 'POST', body: forma, isUpload: true,
      });
      if (!r.ok) return `no se pudo subir «${b.nombre}»`;
      const d = await r.json();
      await local.marcarBlobSubido(b.blob_id, { objeto_externo: d.objeto_externo });
      // El servidor LIMPIA el GPS del fichero y devuelve lo limpiado: eso
      // pertenece al acto (doc_fotos.exif), no a la nada. Se funde en el
      // payload ANTES de mandar el acto.
      if (d.objeto_externo || d.exif) {
        await local.marcar(operacion.operation_id, {
          payload: { ...(operacion.payload || {}),
                     objeto_externo: d.objeto_externo,
                     ...(d.exif && Object.keys(d.exif).length ? { exif: d.exif } : {}) },
        });
        operacion.payload = { ...(operacion.payload || {}),
                              objeto_externo: d.objeto_externo };
      }
    } catch (e) {
      // Que la subida falle NO marca el blob como subido. Que el acto principal
      // sincronice tampoco: son dos efectos distintos.
      return `«${b.nombre}» sigue pendiente de subir`;
    }
  }
  return null;
}

/**
 * Una pasada de sincronización.
 *
 * Devuelve un resumen; los detalles quedan en la cola local, que es lo que la
 * pantalla enseña.
 */
export async function sincronizar(API, ctx, { motivo = 'manual' } = {}) {
  if (_enCurso) return { yaEnCurso: true };
  if (!navigator.onLine) return { sinRed: true };
  if (!ctx || !ctx.canonical_user_id || !ctx.project_id) return { sinIdentidad: true };

  _enCurso = true;
  avisar({ tipo: 'inicio', motivo });
  const resumen = { enviadas: 0, aplicadas: 0, conflictos: 0, rechazadas: 0,
                    bloqueadas: 0, indeterminadas: 0, reintentables: 0,
                    evidenciasPendientes: 0 };
  try {
    const cola = await local.porEnviar(ctx);
    if (!cola.length) return resumen;

    const lote = [];
    for (const op of cola.slice(0, LOTE)) {
      const falta = await subirEvidencias(API, ctx, op);
      if (falta) {
        resumen.evidenciasPendientes += 1;
        await local.marcar(op.operation_id, {
          estado: local.PENDIENTE, ultimo_error: falta,
          intentos: (op.intentos || 0) + 1,
        });
        continue;
      }
      // Si el objeto ya tiene id canónico —porque su CREATE ya sincronizó— se
      // manda: el servidor no tiene por qué volver a deducirlo.
      const canonico = op.server_object_id
                    || await local.idCanonico(ctx, op.local_object_id);
      lote.push({
        operation_id: op.operation_id,
        project_id: op.project_id,
        object_type: op.object_type,
        local_object_id: op.local_object_id,
        server_object_id: canonico || undefined,
        action: op.action,
        payload: op.payload,
        base_version: op.base_version || undefined,
        depende_de: op.depende_de || undefined,
        capturado_en: op.capturado_en,
      });
      await local.marcar(op.operation_id, { estado: local.ENVIANDO });
    }
    if (!lote.length) return resumen;

    resumen.enviadas = lote.length;
    const r = await apiFetch(`${API}/api/sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations: lote }),
    });

    if (!r.ok) {
      // El envío entero falló: NINGUNA operación se procesó. Vuelven a
      // pendiente, que es la verdad. Marcarlas como rechazadas le diría al
      // usuario que el servidor decidió algo, y no decidió nada.
      for (const op of lote) {
        await local.marcar(op.operation_id, {
          estado: local.PENDIENTE,
          ultimo_error: 'no se pudo contactar con el servidor',
        });
      }
      return { ...resumen, sinRespuesta: true };
    }

    const d = await r.json();
    for (const res of (d.resultados || [])) {
      // El servidor dice APLICADA; en el cliente eso se llama SINCRONIZADA,
      // que es lo que significa para quien mira su cola.
      const estado = res.status === 'APLICADA' ? local.SINCRONIZADA : res.status;
      await local.aplicarDesenlace(ctx, { ...res, status: estado });
      if (estado === local.SINCRONIZADA) resumen.aplicadas += 1;
      else if (estado === local.CONFLICTO) resumen.conflictos += 1;
      else if (estado === local.RECHAZADA) resumen.rechazadas += 1;
      else if (estado === local.BLOQUEADA) resumen.bloqueadas += 1;
      else if (estado === local.INDETERMINADA) resumen.indeterminadas += 1;
      else if (estado === local.REINTENTABLE) resumen.reintentables += 1;
    }
    return resumen;
  } finally {
    _enCurso = false;
    avisar({ tipo: 'fin', resumen });
  }
}

/**
 * Engancha los tres disparadores. Devuelve la función para soltarlos.
 *
 * `visibilitychange` cubre el «volver a la app», que en un móvil es el momento
 * más frecuente: la pantalla se apagó en el cerro y se enciende en la caseta,
 * donde hay wifi.
 */
export function engancharDisparadores(API, obtenerContexto) {
  const intentar = (motivo) => {
    const ctx = obtenerContexto();
    if (ctx) sincronizar(API, ctx, { motivo }).catch(() => {});
  };
  const alVolverLaRed = () => intentar('online');
  const alVolverALaApp = () => {
    if (document.visibilityState === 'visible') intentar('resume');
  };
  window.addEventListener('online', alVolverLaRed);
  document.addEventListener('visibilitychange', alVolverALaApp);

  // MEJORA, no requisito: si el navegador la tiene, una pasada más cuando el
  // sistema lo considere oportuno. Si no la tiene, no pasa nada: los tres
  // disparadores de arriba siguen ahí.
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready
      .then(reg => reg.sync && reg.sync.register('alephia-campo'))
      .catch(() => {});
  }

  intentar('arranque');
  return () => {
    window.removeEventListener('online', alVolverLaRed);
    document.removeEventListener('visibilitychange', alVolverALaApp);
  };
}
