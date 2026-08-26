/**
 * GAP 07 · LA CAPTURA — el único sitio donde se decide «¿ahora o después?».
 *
 * POR QUÉ ESTO ES UNA SOLA FUNCIÓN Y NO UN `if` EN CADA PANTALLA
 * ---------------------------------------------------------------
 * Si cada módulo decidiera por su cuenta cuándo encolar, acabarían decidiendo
 * distinto: uno encolaría al fallar la red, otro solo si `navigator.onLine` es
 * falso, y un tercero se olvidaría. La diferencia se vería el día que alguien
 * pierda una jornada.
 *
 * Aquí la regla es una:
 *
 *     hay red   →  se manda ahora. Si el servidor responde, se acabó.
 *     no la hay →  se encola. Y hasta que IndexedDB CONFIRME, no se dice nada.
 *
 * Y hay un tercer caso, que es el que de verdad importa:
 *
 *     creíamos que había red y la petición murió sin respuesta
 *
 * Eso NO se encola a ciegas. Una petición que sale y no vuelve pudo haberse
 * ejecutado en el servidor —el acto está hecho, la respuesta se perdió— y
 * encolarla crearía un duplicado. Por eso la captura genera su `operation_id`
 * ANTES de intentar nada: si hay que encolarla, el servidor la reconocerá como
 * el mismo acto y devolverá lo que ya hizo en vez de repetirlo.
 *
 * LAS DOS IDENTIDADES, Y NO SON LA MISMA
 * ---------------------------------------
 *     local_object_id   QUÉ cosa es      (un acta, una observación)
 *     operation_id      QUÉ se le hizo   (crearla, marcarla, adjuntarle algo)
 *
 * Un objeto tiene varias operaciones a lo largo de una jornada. Confundirlas
 * haría que marcar un punto y adjuntarle la foto se consideraran el mismo acto,
 * y una de las dos se perdería silenciosamente.
 */
import { apiFetch } from '../utils/apiFetch';
import * as local from './almacenLocal';

export const ISSUE = 'ISSUE';
export const PROTOCOLO = 'PROTOCOLO';
export const CREATE = 'CREATE';
export const MARK_CORRECTED = 'MARK_CORRECTED';
export const ADD_EVIDENCE = 'ADD_EVIDENCE';
export const SET_ITEMS = 'SET_ITEMS';

/** Un objeto nuevo: su identidad la pone el dispositivo, y el servidor la ata
 *  luego a la suya. Sin esto, dos capturas offline del mismo inspector no se
 *  podrían distinguir hasta que subieran. */
export function nuevoObjetoLocal() {
  return 'loc_' + local.uuid();
}

/**
 * Captura un acto. Devuelve `{ modo, datos }`:
 *
 *     modo 'servidor'   entró ya; `datos` es la respuesta canónica
 *     modo 'local'      está en el dispositivo; `datos` es la operación
 *
 * El llamante DEBE distinguirlos en lo que le enseñe al usuario. Decir
 * «levantado» en los dos casos es la mentira que este GAP existe para impedir.
 */
export async function capturar(API, ctx, {
  object_type, action, local_object_id, server_object_id,
  payload, base_version, depende_de,
}) {
  if (!ctx || !ctx.canonical_user_id || !ctx.project_id) {
    throw new Error('no se sabe de quién ni de qué obra es esta captura');
  }
  const operation_id = local.uuid();
  // El reloj DEL DISPOSITIVO. Se conserva porque es lo único que se sabe de
  // cuándo se hizo el trabajo, y se declara como tal: no es autoritativo.
  const capturado_en = new Date().toISOString();

  const acto = {
    operation_id, object_type, action, local_object_id, server_object_id,
    payload: payload || {}, base_version, depende_de, capturado_en,
  };

  if (!navigator.onLine) {
    const fila = await local.encolar(ctx, acto);
    return { modo: 'local', datos: fila };
  }

  // HAY RED (o eso dice el navegador, que a veces miente). Se intenta ahora.
  try {
    const r = await apiFetch(`${API}/api/sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // Va por `/api/sync` incluso con cobertura, a propósito: así el camino
      // con red y el camino sin red son EL MISMO camino. Un offline que usa
      // rutas distintas es un offline que se prueba solo cuando falla.
      body: JSON.stringify({ operations: [{ ...acto, project_id: ctx.project_id }] }),
      retries: 0,
    });
    if (!r.ok) throw new Error('el servidor no aceptó el envío');
    const d = await r.json();
    const res = (d.resultados || [])[0];
    if (!res) throw new Error('el servidor no dijo nada de este acto');

    if (res.status === 'APLICADA') {
      // No se encola: ya está hecho. Se ata la identidad para que los actos
      // siguientes sobre el mismo objeto sepan a qué fila canónica van.
      await local.atarIdentidad(ctx, local_object_id, res.canonical_object_id);
      return { modo: 'servidor', datos: res };
    }

    // RECHAZADA / CONFLICTO / BLOQUEADA / INDETERMINADA: el servidor decidió, y
    // esa decisión se guarda para que la pantalla de campo la enseñe. NO se
    // reintenta y NO se descarta por el cliente.
    const fila = await local.encolar(ctx, acto);
    await local.aplicarDesenlace(ctx, res);
    return { modo: 'local', datos: { ...fila, estado: res.status }, veredicto: res };
  } catch (e) {
    // LA PETICIÓN SALIÓ Y NO VOLVIÓ. No se sabe si se ejecutó.
    //
    // Se encola CON EL MISMO `operation_id` que ya se intentó. Eso convierte el
    // reintento en una consulta: si el acto sí entró, el servidor devuelve lo
    // que hizo; si no entró, lo hace ahora. En ningún caso queda duplicado.
    const fila = await local.encolar(ctx, acto);
    return { modo: 'local', datos: fila, seIntento: true };
  }
}

/**
 * Guarda una evidencia junto a su acto. El binario primero, el acto después.
 *
 * Ese orden importa: si se encolara el acto y luego fallara el blob, habría una
 * operación que dice llevar una foto que no existe, y el servidor la rechazaría
 * sin que nadie entendiera por qué. Al revés, un blob huérfano no rompe nada —
 * se limpia y ya está.
 */
export async function capturarConEvidencia(API, ctx, acto, ficheros) {
  const operation_id = local.uuid();
  const blobs = [];
  for (const fichero of (ficheros || [])) {
    const blob_id = 'blob_' + local.uuid();
    // Si esto falla por cuota, se propaga: el usuario tiene que saber que su
    // foto NO está guardada antes de irse del sitio donde podría repetirla.
    await local.guardarBlob(ctx, {
      blob_id, operation_id, nombre: fichero.name, blob: fichero,
    });
    blobs.push({ blob_id, nombre: fichero.name, tamaño: fichero.size });
  }
  const fila = await local.encolar(ctx, {
    ...acto, operation_id,
    payload: { ...(acto.payload || {}), evidencias: blobs },
    capturado_en: new Date().toISOString(),
  });
  return { modo: 'local', datos: fila, blobs: blobs.length };
}

/**
 * El contexto de identidad. Una sola forma de construirlo, para que ninguna
 * pantalla se invente la suya con el email.
 */
export function contextoDe(usuario, project) {
  if (!usuario || !usuario.id || !project) return null;
  return {
    canonical_user_id: String(usuario.id),
    // El alcance de escritura de la obra, que es la autoridad documental
    // (`project_ref.es_escritura`). NUNCA el nombre de la obra.
    project_id: String(project.scope_escritura || project.id),
  };
}
