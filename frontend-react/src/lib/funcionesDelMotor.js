// frontend-react/src/lib/funcionesDelMotor.js
//
// LAS FUNCIONES DEL MOTOR DE AUTODESK QUE VIENEN APAGADAS (13-nov-2026) — docs/visor/70.
//
// El dueño vio en ACC una regla con láser y un panel «Herramientas de sección» que su visor no tenía. No era otra
// versión: el motor público que cargamos (7.*, hoy 7.131.1) las trae dentro, apagadas como funciones «internas», y
// Autodesk las enciende en su producto. Se encienden ANTES de arrancar el motor (`Autodesk.Viewing.Initializer`);
// después el propio motor ya no deja cambiarlas. El mismo motor dice que en la versión 8 quedan siempre encendidas.
//
// DESDE EL 13-nov-2026 VAN ENCENDIDAS PARA TODOS (decisión del dueño tras probarlas en local): la regla con láser,
// pendiente y «borrar todas», y la sección nueva, que sustituye a la de siempre y a nuestra antigua herramienta de
// corte (`SectionCutTool`, retirada ese día).
//
// LA SALIDA DE EMERGENCIA. Son API privadas de Autodesk y cargamos «la 7 más reciente»: pueden cambiar sin avisar. Si
// un día una versión las rompe, se apagan desde la dirección, sin publicar nada, y la elección se recuerda en ese
// navegador:
//
//     ?motor=no       el motor como venía: regla y sección de siempre
//     ?motor=regla    solo lo de la regla; la sección, la de siempre
//     ?motor=todo     lo de todos (borra lo recordado)
//
// Todo va con guardas y nunca rompe el arranque: si al motor le falta una función, el visor arranca sin ella.

export const CLAVE = 'alephia_motor_experimental';
export const POR_DEFECTO = 'todo';

// Los nombres son los de `Autodesk.Viewing.Private.InternalFeatureFlags`.
export const DE_LA_REGLA = ['EnableLaserMeasurement', 'EnableSlopeMeasurement', 'EnableDeleteAllMeasurements'];
export const DE_LA_SECCION = ['EnableSmartSection'];

const MODOS = { no: [], regla: DE_LA_REGLA, todo: [...DE_LA_REGLA, ...DE_LA_SECCION] };
const esModo = (valor) => Object.prototype.hasOwnProperty.call(MODOS, valor);

/** El modo que vale: 'todo' (el de todos), 'regla' o 'no'. La dirección manda sobre lo recordado. */
export function modoPedido(busca, guardado) {
  let enLaDireccion = null;
  try { enLaDireccion = new URLSearchParams(busca || '').get('motor'); } catch { /* dirección rara: se ignora */ }
  if (enLaDireccion !== null) {
    // Un valor que no se conoce no apaga nada: vale lo de todos.
    const modo = esModo(enLaDireccion) ? enLaDireccion : POR_DEFECTO;
    try {
      if (modo === POR_DEFECTO) guardado?.removeItem(CLAVE); else guardado?.setItem(CLAVE, modo);
    } catch { /* sin almacenamiento: vale para esta carga */ }
    return modo;
  }
  try {
    const recordado = guardado?.getItem(CLAVE) || '';
    return esModo(recordado) ? recordado : POR_DEFECTO;
  } catch { return POR_DEFECTO; }
}

/**
 * Enciende en el motor las funciones del modo que vale. Devuelve { modo, encendidas, fallidas }.
 * Llamar justo antes de `Autodesk.Viewing.Initializer`.
 */
export function encenderFuncionesDelMotor(AV, busca, guardado) {
  const modo = modoPedido(busca, guardado);
  const resultado = { modo, encendidas: [], fallidas: [] };
  const banderas = AV?.FeatureFlags;
  const nombres = AV?.Private?.InternalFeatureFlags;
  for (const funcion of MODOS[modo]) {
    try {
      const nombre = nombres?.[funcion];
      if (!banderas || typeof banderas.set !== 'function' || !nombre) throw new Error('el motor no la tiene');
      banderas.set(nombre, true);
      if (typeof banderas.isEnabled === 'function' && !banderas.isEnabled(nombre)) throw new Error('el motor no la encendió');
      resultado.encendidas.push(funcion);
    } catch (e) {
      resultado.fallidas.push(`${funcion}: ${e.message}`);
    }
  }
  return resultado;
}

// LA ELECCIÓN SE ANOTA AL CARGAR LA PÁGINA. El visor arranca el motor más tarde (al entrar en un proyecto), y para
// entonces la dirección puede haber cambiado: sin esto, `?motor=…` se perdía por el camino.
if (typeof window !== 'undefined') {
  try { modoPedido(window.location.search, window.localStorage); } catch { /* sin dirección o sin almacenamiento */ }
}
