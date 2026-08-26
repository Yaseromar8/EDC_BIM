/**
 * GAP 07 · EL ALMACÉN LOCAL — lo que se capturó en obra vive aquí hasta que el
 * servidor lo acepte.
 *
 * CUATRO TIENDAS SEPARADAS, Y NO ES ORGANIZACIÓN: ES NECESIDAD
 * -------------------------------------------------------------
 *   queue_operations     el ACTO: json pequeño, se reescribe en cada reintento
 *   object_identity_map  local_object_id ↔ canonical_server_id
 *   pending_blobs        los binarios, APARTE
 *   offline_snapshots    lo precargado para poder trabajar sin red
 *
 * Los blobs van aparte porque si viajaran dentro del registro de la operación,
 * cada reintento —que reescribe `intentos`, `ultimo_error`, `estado`— tendría
 * que reescribir también ocho megas de foto. En un móvil eso no es lento: es
 * una operación que falla por cuota a la tercera vez.
 *
 * PARTICIÓN POR IDENTIDAD CANÓNICA
 * ---------------------------------
 * Cada registro lleva `canonical_user_id` + `project_id`. NO email ni nombre:
 * los dos son editables, y una cola que se identifica por algo editable cambia
 * de dueño cuando alguien se cambia el correo.
 *
 * Al cambiar de cuenta en el mismo dispositivo, el usuario B **no ve, no
 * sincroniza y no adjunta** nada de A. Y lo de A **no se borra**: sigue ahí,
 * inaccesible, y vuelve cuando vuelve su identidad. Borrarlo al cerrar sesión
 * sería la forma más rápida de perder una jornada de campo, y la gente cierra
 * sesión sin pensar.
 *
 * NUNCA SE GUARDA UN TOKEN. Ni en el payload, ni al lado. Una cola que
 * sobrevive semanas en un dispositivo compartido no es sitio para una
 * credencial — y además no hace falta: al sincronizar manda la sesión de
 * entonces, no la de cuando se capturó.
 */

const DB_NAME = 'alephia_campo';
const DB_VERSION = 1;

export const OPERACIONES = 'queue_operations';
export const IDENTIDADES = 'object_identity_map';
export const BLOBS = 'pending_blobs';
export const SNAPSHOTS = 'offline_snapshots';

/**
 * LOS ESTADOS DEL CLIENTE.
 *
 * `PENDIENTE` y `ENVIANDO` son suyos: describen una operación que el servidor
 * todavía no ha visto. Los demás los dicta el servidor y aquí solo se guardan.
 *
 * `REINTENTABLE` y `RECHAZADA` no son grados de lo mismo:
 *   REINTENTABLE  el servidor no pudo procesarlo, y NO quedó nada hecho
 *   RECHAZADA     el servidor lo procesó y decidió que ya no estaba autorizado
 *   CONFLICTO     el objeto cambió mientras estabas sin conexión
 *   INDETERMINADA pudo quedar algo fuera de la base y no se sabe
 */
export const PENDIENTE = 'PENDIENTE';
export const ENVIANDO = 'ENVIANDO';
export const SINCRONIZADA = 'SINCRONIZADA';
export const REINTENTABLE = 'REINTENTABLE';
export const BLOQUEADA = 'BLOQUEADA';
export const CONFLICTO = 'CONFLICTO';
export const RECHAZADA = 'RECHAZADA';
export const INDETERMINADA = 'INDETERMINADA';

// Los que NO se reintentan solos. Insistir contra una decisión del servidor no
// la cambia, y reintentar un conflicto pisa lo que otro hizo.
export const NO_SE_REINTENTAN = [SINCRONIZADA, RECHAZADA, CONFLICTO, INDETERMINADA];

let _db = null;

function abrir() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(OPERACIONES)) {
        const s = db.createObjectStore(OPERACIONES, { keyPath: 'operation_id' });
        // El índice por dueño es lo que hace posible listar SOLO lo tuyo sin
        // recorrer la cola entera de todos los que usaron este dispositivo.
        s.createIndex('dueño', ['canonical_user_id', 'project_id']);
        s.createIndex('objeto', ['canonical_user_id', 'local_object_id']);
        s.createIndex('estado', ['canonical_user_id', 'estado']);
      }
      if (!db.objectStoreNames.contains(IDENTIDADES)) {
        const s = db.createObjectStore(IDENTIDADES, { keyPath: 'clave' });
        s.createIndex('dueño', ['canonical_user_id', 'project_id']);
      }
      if (!db.objectStoreNames.contains(BLOBS)) {
        const s = db.createObjectStore(BLOBS, { keyPath: 'blob_id' });
        s.createIndex('operacion', 'operation_id');
        s.createIndex('dueño', ['canonical_user_id', 'project_id']);
      }
      if (!db.objectStoreNames.contains(SNAPSHOTS)) {
        db.createObjectStore(SNAPSHOTS, { keyPath: 'clave' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error || new Error('no se pudo abrir el almacén local'));
  });
}

/**
 * Una transacción que resuelve CUANDO HA CONFIRMADO, no cuando se pidió.
 *
 * Es la diferencia entre decirle a alguien «guardado» y que lo esté. `oncomplete`
 * es el único evento que significa que los datos están en disco; resolver en
 * `onsuccess` de la petición diría «guardado» sobre algo que todavía puede
 * perderse si la pestaña se cierra en ese instante.
 */
function conTransaccion(tiendas, modo, trabajo) {
  return abrir().then(db => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(tiendas, modo);
    } catch (e) {
      reject(e); return;
    }
    let resultado;
    tx.oncomplete = () => resolve(resultado);
    tx.onerror = () => reject(tx.error || new Error('transacción local fallida'));
    tx.onabort = () => reject(tx.error || new Error('transacción local abortada'));
    try {
      resultado = trabajo(tx);
    } catch (e) {
      try { tx.abort(); } catch (_) { /* ya estaba abortada */ }
      reject(e);
    }
  }));
}

function pedir(peticion) {
  return new Promise((resolve, reject) => {
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

/** ¿Es un fallo de CUOTA? Se distingue porque la respuesta es otra: no hay que
 *  reintentar, hay que liberar sitio o avisar. */
export function esFalloDeCuota(e) {
  if (!e) return false;
  return e.name === 'QuotaExceededError'
      || e.code === 22
      || /quota/i.test(e.message || '');
}

/**
 * Pide que el navegador NO borre esto cuando le falte espacio.
 *
 * Se pide y se sigue: NUNCA se asume concedida. Safari la niega casi siempre y
 * Chrome la concede según heurísticas que no controlamos. El producto tiene que
 * funcionar igual sin ella —el usuario verá su cola— así que esto es una mejora,
 * no un requisito.
 */
export async function pedirPersistencia() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch (e) {
    return null;
  }
}

export async function espacioDisponible() {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return { usado: usage || 0, cuota: quota || 0,
             libre: Math.max(0, (quota || 0) - (usage || 0)) };
  } catch (e) {
    return null;
  }
}

// ── EL DUEÑO ───────────────────────────────────────────────────────────────

/**
 * Quién es el dueño de lo que se guarda. `canonical_user_id` y nada más.
 *
 * Se exige explícitamente en vez de leerlo de una variable global para que sea
 * imposible guardar algo «sin dueño» por descuido: un registro sin dueño lo
 * vería el siguiente que entrara en el dispositivo.
 */
function exigirDueño(ctx) {
  if (!ctx || !ctx.canonical_user_id) {
    throw new Error('no se puede guardar trabajo de campo sin saber de quién es');
  }
  if (!ctx.project_id) {
    throw new Error('no se puede guardar trabajo de campo sin saber de qué obra es');
  }
  return ctx;
}

// ── LA COLA DE OPERACIONES ─────────────────────────────────────────────────

/**
 * Encola un ACTO. Resuelve cuando la transacción HA CONFIRMADO.
 *
 * Hasta que esta promesa resuelve, la operación NO está guardada y la interfaz
 * no puede decir que lo está.
 */
export async function encolar(ctx, operacion) {
  exigirDueño(ctx);
  if (!operacion.operation_id || !operacion.local_object_id) {
    throw new Error('un acto necesita su operation_id y su local_object_id');
  }
  // NUNCA un token, ni aquí ni dentro del payload.
  const fila = {
    operation_id: operacion.operation_id,
    canonical_user_id: ctx.canonical_user_id,
    project_id: ctx.project_id,
    object_type: operacion.object_type,
    local_object_id: operacion.local_object_id,
    server_object_id: operacion.server_object_id || null,
    action: operacion.action,
    payload: operacion.payload || {},
    base_version: operacion.base_version || null,
    depende_de: operacion.depende_de || null,
    // El reloj del DISPOSITIVO. Es lo que declara el móvil, no una prueba.
    capturado_en: operacion.capturado_en || new Date().toISOString(),
    estado: PENDIENTE,
    intentos: 0,
    ultimo_error: null,
    conflict_state: null,
    creado_en: Date.now(),
  };
  await conTransaccion([OPERACIONES], 'readwrite',
                       tx => tx.objectStore(OPERACIONES).add(fila));
  return fila;
}

/** Las operaciones DE ESTE usuario en ESTA obra. Nunca las de otro. */
export async function operacionesDe(ctx) {
  exigirDueño(ctx);
  return conTransaccion([OPERACIONES], 'readonly', tx => {
    const idx = tx.objectStore(OPERACIONES).index('dueño');
    return pedir(idx.getAll([ctx.canonical_user_id, ctx.project_id]));
  }).then(r => r || []);
}

/** Lo que hay que enviar: pendiente o reintentable, en orden de captura. */
export async function porEnviar(ctx) {
  const todas = await operacionesDe(ctx);
  return todas
    .filter(o => o.estado === PENDIENTE || o.estado === REINTENTABLE
                 || o.estado === BLOQUEADA)
    .sort((a, b) => a.creado_en - b.creado_en);
}

export async function marcar(operation_id, cambios) {
  return conTransaccion([OPERACIONES], 'readwrite', tx => {
    const s = tx.objectStore(OPERACIONES);
    const req = s.get(operation_id);
    req.onsuccess = () => {
      const fila = req.result;
      if (!fila) return;
      s.put({ ...fila, ...cambios });
    };
  });
}

/**
 * Aplica el desenlace que devolvió el servidor.
 *
 * `REINTENTABLE` vuelve a la cola; los demás se quedan como están y esperan a
 * una persona. Y una operación SINCRONIZADA no se borra todavía: el usuario
 * tiene derecho a ver qué se subió antes de que desaparezca de su pantalla.
 */
export async function aplicarDesenlace(ctx, resultado) {
  const estado = resultado.status;
  await marcar(resultado.operation_id, {
    estado,
    server_object_id: resultado.canonical_object_id || null,
    resultado_canonico: resultado.canonical_result || null,
    ultimo_error: resultado.error || null,
    error_code: resultado.error_code || null,
    conflict_state: resultado.conflict_state || null,
    dependency_blocker: resultado.dependency_blocker || null,
  });
  if (estado === SINCRONIZADA || estado === 'APLICADA') {
    await atarIdentidad(ctx, resultado.local_object_id,
                        resultado.canonical_object_id);
  }
}

export async function olvidar(operation_id) {
  return conTransaccion([OPERACIONES], 'readwrite',
                        tx => tx.objectStore(OPERACIONES).delete(operation_id));
}

// ── EL PUENTE local ↔ canónico ─────────────────────────────────────────────

export async function atarIdentidad(ctx, local_object_id, server_object_id) {
  exigirDueño(ctx);
  if (!local_object_id || !server_object_id) return null;
  const fila = {
    clave: `${ctx.canonical_user_id}|${ctx.project_id}|${local_object_id}`,
    canonical_user_id: ctx.canonical_user_id,
    project_id: ctx.project_id,
    local_object_id,
    server_object_id: String(server_object_id),
    atado_en: Date.now(),
  };
  await conTransaccion([IDENTIDADES], 'readwrite',
                       tx => tx.objectStore(IDENTIDADES).put(fila));
  return fila;
}

export async function idCanonico(ctx, local_object_id) {
  exigirDueño(ctx);
  const clave = `${ctx.canonical_user_id}|${ctx.project_id}|${local_object_id}`;
  const fila = await conTransaccion([IDENTIDADES], 'readonly',
                                    tx => pedir(tx.objectStore(IDENTIDADES).get(clave)));
  return fila ? fila.server_object_id : null;
}

// ── LOS BLOBS ──────────────────────────────────────────────────────────────

/**
 * Guarda el binario. APARTE de la operación, y con su propia confirmación.
 *
 *     BLOB PERSISTIDO   ≠   FICHERO ELEGIDO EN UN <input>
 *
 * Un `File` de un `<input>` es una referencia del sistema operativo: si la
 * pestaña se cierra, deja de existir. Solo cuenta como evidencia guardada
 * cuando esta transacción confirma.
 */
export async function guardarBlob(ctx, { blob_id, operation_id, nombre, blob, sha256 }) {
  exigirDueño(ctx);
  if (!blob_id || !blob) throw new Error('una evidencia necesita su id y su contenido');
  const fila = {
    blob_id,
    operation_id: operation_id || null,
    canonical_user_id: ctx.canonical_user_id,
    project_id: ctx.project_id,
    nombre: nombre || 'evidencia',
    tipo: blob.type || 'application/octet-stream',
    tamaño: blob.size || 0,
    sha256: sha256 || null,
    blob,
    subido: false,
    creado_en: Date.now(),
  };
  await conTransaccion([BLOBS], 'readwrite',
                       tx => tx.objectStore(BLOBS).put(fila));
  return fila;
}

export async function blobsDe(ctx) {
  exigirDueño(ctx);
  return conTransaccion([BLOBS], 'readonly', tx => {
    const idx = tx.objectStore(BLOBS).index('dueño');
    return pedir(idx.getAll([ctx.canonical_user_id, ctx.project_id]));
  }).then(r => r || []);
}

export async function blobsDeOperacion(operation_id) {
  return conTransaccion([BLOBS], 'readonly', tx => {
    const idx = tx.objectStore(BLOBS).index('operacion');
    return pedir(idx.getAll(operation_id));
  }).then(r => r || []);
}

/**
 * Marca una evidencia como subida. SOLO cuando el servidor lo confirmó.
 *
 * Que el acto principal sincronizara NO significa que su foto lo hiciera: son
 * dos efectos distintos, uno dentro de la base y otro fuera.
 */
export async function marcarBlobSubido(blob_id, { objeto_externo }) {
  return conTransaccion([BLOBS], 'readwrite', tx => {
    const s = tx.objectStore(BLOBS);
    const req = s.get(blob_id);
    req.onsuccess = () => {
      const fila = req.result;
      if (!fila) return;
      s.put({ ...fila, subido: true, objeto_externo: objeto_externo || null });
    };
  });
}

// ── LO PRECARGADO ──────────────────────────────────────────────────────────

/**
 * Guarda un trozo de la obra para poder trabajar sin red.
 *
 * Se guarda con la VERSIÓN que tenía cuando se descargó, porque eso es lo que
 * el usuario tuvo delante: un acta llenada contra la v1 se sincroniza como v1
 * aunque el servidor ya vaya por la v2.
 */
export async function guardarSnapshot(ctx, tipo, datos) {
  exigirDueño(ctx);
  const fila = {
    clave: `${ctx.canonical_user_id}|${ctx.project_id}|${tipo}`,
    canonical_user_id: ctx.canonical_user_id,
    project_id: ctx.project_id,
    tipo,
    datos,
    descargado_en: Date.now(),
  };
  await conTransaccion([SNAPSHOTS], 'readwrite',
                       tx => tx.objectStore(SNAPSHOTS).put(fila));
  return fila;
}

export async function leerSnapshot(ctx, tipo) {
  exigirDueño(ctx);
  const clave = `${ctx.canonical_user_id}|${ctx.project_id}|${tipo}`;
  const fila = await conTransaccion([SNAPSHOTS], 'readonly',
                                    tx => pedir(tx.objectStore(SNAPSHOTS).get(clave)));
  return fila || null;
}

/**
 * Borra el trabajo de un usuario. EXPLÍCITO Y A PETICIÓN, nunca en el logout.
 *
 * Existe porque un dispositivo compartido tiene que poder limpiarse, no porque
 * cerrar sesión deba tirar una jornada de campo.
 */
export async function borrarTodoDe(ctx) {
  exigirDueño(ctx);
  const ops = await operacionesDe(ctx);
  const bl = await blobsDe(ctx);
  await conTransaccion([OPERACIONES, BLOBS, IDENTIDADES, SNAPSHOTS], 'readwrite', tx => {
    ops.forEach(o => tx.objectStore(OPERACIONES).delete(o.operation_id));
    bl.forEach(b => tx.objectStore(BLOBS).delete(b.blob_id));
  });
  return { operaciones: ops.length, blobs: bl.length };
}

/** Cuánto trabajo pendiente hay de OTRAS identidades en este dispositivo.
 *  No se enseña su contenido: solo que existe, para que nadie lo borre creyendo
 *  que el dispositivo está vacío. */
export async function pendienteDeOtros(ctx) {
  const todas = await conTransaccion([OPERACIONES], 'readonly',
                                     tx => pedir(tx.objectStore(OPERACIONES).getAll()));
  return (todas || []).filter(
    o => o.canonical_user_id !== ctx.canonical_user_id
         && o.estado !== SINCRONIZADA).length;
}

export function uuid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  // Respaldo para navegadores viejos. Un correlativo local NO vale: dos
  // personas trabajando sin red a la vez colisionarían.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] % 16);
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}
