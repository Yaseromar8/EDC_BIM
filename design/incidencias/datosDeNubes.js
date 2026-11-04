// LAS NUBES DE CADA INCIDENCIA: UNA SOLA COPIA PARA TODA LA PANTALLA (docs/archivos/25, P1).
//
// Antes la misma nube vivía en tres sitios que no se avisaban: la hoja (las marcas), la barra de la marca y el panel de
// la incidencia. Se asignaba en la barra y el panel seguía diciendo «Sin asignar»; se aceptaba en el panel y la leyenda
// seguía contando lo mismo. Aquí vive la respuesta de `GET /api/issues/<id>/nubes`, una por incidencia:
//
//   · `useNubesDeIncidencia(leer, id)` (useNubesDeIncidencia.js) la lee y la pide si hace falta: dos que la piden a
//     la vez esperan la misma;
//   · `fijarNubes(id, respuesta)` la sustituye tras un acto (el POST devuelve la lista entera) y avisa a quien la lee
//     y a quien escucha cualquier cambio (`alCambiarNubes`: la hoja vuelve a pedir sus marcas);
//   · `recargarNubes(leer, id)` la vuelve a pedir cuando cambió la incidencia (su estado cambia el de sus nubes).
//
// No sabe de dónde se lee: quien llama pasa `leer(id)` (el lector usa apiFetch; el panel, su `entorno`).
const datos = new Map();       // id → respuesta
const enCamino = new Map();    // id → promesa de la lectura en curso
const lectores = new Map();    // id → Set(fn(respuesta))
const deTodo = new Set();      // fn(id): alguien cambió las nubes de una incidencia

export const clave = (id) => String(id);

/** Lo que hay ahora de una incidencia (o undefined si aún no se pidió). */
export const nubesGuardadas = (id) => datos.get(String(id));

function avisarA(id) {
  for (const fn of lectores.get(id) || []) fn(datos.get(id) ?? null);
}

/** Pide las nubes de una incidencia. Sin `fresco`, si ya están, no vuelve a pedirlas. */
export function cargarNubes(leer, id, { fresco = false } = {}) {
  const k = clave(id);
  if (!fresco && datos.has(k)) return Promise.resolve(datos.get(k));
  if (enCamino.has(k)) return enCamino.get(k);
  const p = Promise.resolve(leer(k))
    .then((d) => {
      enCamino.delete(k);
      if (d) { datos.set(k, d); avisarA(k); }
      return d ?? null;
    }, (e) => { enCamino.delete(k); throw e; });
  enCamino.set(k, p);
  return p;
}

/** Tras un acto: la respuesta del servidor ES el estado nuevo. Avisa a quien la lee y a quien escucha cambios. */
export function fijarNubes(id, respuesta) {
  if (!respuesta) return;
  const k = clave(id);
  datos.set(k, respuesta);
  avisarA(k);
  for (const fn of deTodo) fn(k);
}

/** Cambió la incidencia (no una nube): se vuelven a pedir sus nubes y se avisa como tras un acto. */
export function recargarNubes(leer, id) {
  return cargarNubes(leer, id, { fresco: true }).then((d) => { if (d) for (const fn of deTodo) fn(clave(id)); return d; });
}

/** Escuchar cualquier cambio de nubes (de cualquier incidencia). Devuelve con qué dejar de escuchar. */
export function alCambiarNubes(fn) {
  deTodo.add(fn);
  return () => deTodo.delete(fn);
}

/** Leer las nubes de una incidencia cada vez que cambien. Devuelve con qué dejar de leerlas. */
export function leerDe(id, fn) {
  const k = clave(id);
  if (!lectores.has(k)) lectores.set(k, new Set());
  lectores.get(k).add(fn);
  return () => lectores.get(k)?.delete(fn);
}

/** Solo para las pruebas: vacía la copia. */
export function _olvidarNubes() {
  datos.clear(); enCamino.clear(); lectores.clear(); deTodo.clear();
}
