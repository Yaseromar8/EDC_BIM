/**
 * busquedaDiferida — BUSCAR SIN QUE TE PISE LO DE ANTES.
 *
 * Dos reglas, y las dos nacieron de un fallo real:
 *
 *   ESPERAR    no se sale a buscar en cada tecla, sino cuando la mano para.
 *   LA ÚLTIMA  una respuesta que llega después de haberse cancelado su
 *              petición NO escribe nada.
 *
 * Sin la segunda, borrar la caja de búsqueda dejaba la pantalla en modo
 * búsqueda con la caja ya vacía —«0 resultados para ""»— tapando carpetas y
 * archivos, y de ahí no se salía navegando: sólo recargando.
 *
 * Vive fuera de React a propósito. Es una carrera, y una carrera sólo se
 * demuestra ejecutándola; aquí se puede, en `pruebas/busquedaDiferida.prueba.mjs`.
 */

export const LONGITUD_MINIMA = 3;
export const RETRASO_MS = 350;

/**
 * Programa una búsqueda y devuelve cómo cancelarla.
 *
 * @param consulta     lo tecleado; se recorta antes de medirlo
 * @param habilitada   si no, se limpia y no se busca (papelera, otra sección…)
 * @param buscar       (consulta) => resultados. Devolver `undefined` significa
 *                     «no tengo respuesta útil»: entonces no se escribe nada y
 *                     se conserva lo que hubiera en pantalla.
 * @param alResultado  recibe los resultados, o `null` para volver a las carpetas
 * @returns cancelar() — llamarla impide TANTO la salida como la escritura
 */
export function programarBusqueda({ consulta, habilitada = true, buscar, alResultado, retraso = RETRASO_MS }) {
  const limpia = String(consulta ?? '').trim();

  if (!habilitada || limpia.length < LONGITUD_MINIMA) {
    alResultado(null);
    return () => {};
  }

  // El pestillo es lo que cierra la carrera: cancelar lo baja, y la respuesta
  // que venga después se descarta aunque el temporizador ya no exista.
  let vigente = true;

  const temporizador = setTimeout(async () => {
    try {
      const resultados = await buscar(limpia);
      if (vigente && resultados !== undefined) alResultado(resultados);
    } catch {
      // Red caída o respuesta ilegible: se conserva lo que hubiera. Un fallo
      // de una petición no es motivo para vaciarle la pantalla a nadie.
    }
  }, retraso);

  return () => { vigente = false; clearTimeout(temporizador); };
}
