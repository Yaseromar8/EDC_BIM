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

// ── E1.3 · FLUJOS CREADOS UTILIZABLES ─────────────────────────────────────────

export const AVISO_PLAZO =
  'El plazo tiene que ser un número entero de días, de 1 en adelante, o quedar vacío si no tiene plazo.';

export const AVISO_SIN_PLANTILLAS =
  'No se pudieron cargar los flujos de revisión. Puedes poner los pasos a mano, o cerrar y volver a abrir esta ventana.';

/**
 * Cómo se ofrece un flujo en el selector. El servidor dice si se puede usar en esta
 * obra (`utilizable`) y por qué no: uno que no se puede usar se ve, pero no se elige.
 * Sin el dato (ausente o null) se ofrece, porque el alta lo comprueba igual.
 */
export function opcionDePlantilla(p) {
  const n = (p?.pasos || []).length;
  const base = `${p?.nombre || 'Flujo sin nombre'} · v${p?.version ?? 1} · ${n} ${n === 1 ? 'paso' : 'pasos'}`
    + (p?.alcance === 'ENTIDAD' ? ' (de la entidad)' : '');
  if (p?.utilizable !== false) return { etiqueta: base, deshabilitada: false, motivo: '' };
  return {
    etiqueta: `${base} · no se puede usar aquí`,
    deshabilitada: true,
    motivo: p?.motivo_no_utilizable || 'No se puede usar en esta obra.',
  };
}

/** Los números de paso (desde 1) de los pasos por función que aún no tienen persona. */
export function pasosSinElegir(opciones = {}, elecciones = {}) {
  return Object.keys(opciones || {})
    .filter(i => !(elecciones || {})[i])
    .map(i => Number(i) + 1)
    .sort((a, b) => a - b);
}

/** Las elecciones que se mandan: solo las de los pasos que las piden, como números. */
export function eleccionesParaEnviar(opciones = {}, elecciones = {}) {
  const salida = {};
  Object.keys(opciones || {}).forEach(i => {
    const valor = (elecciones || {})[i];
    if (valor !== undefined && valor !== null && String(valor).trim() !== '') salida[i] = Number(valor);
  });
  return salida;
}

/** ¿Vale este plazo? Vacío es «sin plazo»; si no, un entero de 1 en adelante. */
export function plazoValido(dias) {
  if (dias === undefined || dias === null) return true;
  const texto = String(dias).trim();
  return texto === '' || (/^\d+$/.test(texto) && Number(texto) >= 1);
}

/** El cuerpo JSON de una respuesta, o null si no lo es (un 502, una página de error). */
export async function leerRespuesta(r) {
  try { return await r.json(); } catch { return null; }
}

/** Qué decir cuando algo falla, sin enseñar nunca un error técnico en crudo. */
export function textoDeFallo(status, cuerpo, que = 'completar la acción') {
  if (cuerpo?.error) return cuerpo.error;
  if (!status) return 'No se pudo conectar con el servidor. Revisa la conexión e inténtalo de nuevo.';
  return `No se pudo ${que}: el servidor respondió con un error (${status}). Vuelve a intentarlo en unos minutos.`;
}

/**
 * Qué hacer con la respuesta de la vista previa de un flujo.
 *
 *   'pasos'     todo en regla: se enseñan los pasos que van a salir;
 *   'elegir'    hay pasos por función con varias personas y falta elegir;
 *   'bloqueo'   el flujo sigue elegido, con el motivo, y no se puede iniciar. Pasa
 *               cuando hay selectores: el problema puede ser la persona elegida;
 *   'recuperar' el flujo no se puede usar: vuelven los pasos de antes (E1.1).
 */
export function trasVistaPrevia({ ok, cuerpo, elecciones = {}, opcionesActuales = {} } = {}) {
  if (ok && cuerpo?.success) {
    return { tipo: 'pasos', pasos: cuerpo.pasos || [], opciones: cuerpo.opciones || {} };
  }
  const opciones = cuerpo?.opciones && Object.keys(cuerpo.opciones).length
    ? cuerpo.opciones : (opcionesActuales || {});
  if (cuerpo?.code === 'ELIGE_REVISOR') {
    const faltan = pasosSinElegir(opciones, elecciones);
    return {
      tipo: 'elegir',
      opciones,
      aviso: faltan.length ? `Elige quién hace el paso ${faltan.join(', ')}.`
        : (cuerpo.error || 'Elige quién hace cada paso marcado.'),
    };
  }
  const aviso = cuerpo?.error || 'No se pudo aplicar este flujo aquí.';
  if (Object.keys(opciones).length) return { tipo: 'bloqueo', opciones, aviso };
  return { tipo: 'recuperar', aviso };
}
