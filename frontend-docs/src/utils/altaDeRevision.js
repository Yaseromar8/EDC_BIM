// El alta de revisiones (E1.1): qué hacer al cambiar el «Flujo de revisión» y qué
// decir de la lista de revisores. Funciones puras, con su banco en
// `pruebas/altaDeRevision.prueba.mjs`; la pantalla solo las llama.

// Dónde se añade a quien falta. La lista de revisores solo enseña participantes
// activos de la obra, porque son los únicos que el servidor acepta.
export const AYUDA_PARTICIPANTES =
  'Solo aparecen participantes activos de esta obra. ¿Falta alguien? Añádelo en Administración → Participantes.';

export const AVISO_A_MANO =
  'Has vuelto a «a mano»: se conservan los pasos, que ya no constan como aplicación de la plantilla.';

/**
 * Qué pasa al elegir otro flujo en el selector.
 *
 *   'nada'     se eligió el que ya estaba;
 *   'a_mano'   se quita la plantilla y SE CONSERVAN los pasos que haya;
 *   'aplicar'  la plantilla sustituye los pasos. `confirmar` vale true cuando lo
 *              que se sustituye lo puso una persona a mano: eso no se tira sin
 *              preguntar. Los pasos de otra plantilla, sin tocar, se sustituyen
 *              sin preguntar, porque no son trabajo de nadie.
 */
export function cambioDeFlujo({ plantillaActual = '', nueva = '', pasos = [] } = {}) {
  const actual = plantillaActual == null ? '' : String(plantillaActual);
  const destino = nueva == null ? '' : String(nueva);
  if (actual === destino) return { tipo: 'nada' };
  if (!destino) return { tipo: 'a_mano', aviso: actual ? AVISO_A_MANO : '' };
  return { tipo: 'aplicar', confirmar: !actual && (pasos || []).length > 0 };
}

/** El diálogo que se enseña antes de sustituir revisores puestos a mano. */
export function confirmacionDePlantilla(cuantos, nombre) {
  const n = Number(cuantos) || 0;
  const quienes = n === 1 ? 'al revisor que has puesto' : `a los ${n} revisores que has puesto`;
  return {
    title: 'Aplicar la plantilla',
    message: `${nombre ? `«${nombre}»` : 'La plantilla'} sustituye ${quienes}. ¿La aplicas?`,
    confirmText: 'Sustituir',
  };
}
