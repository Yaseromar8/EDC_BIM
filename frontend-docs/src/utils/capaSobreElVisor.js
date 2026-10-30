/**
 * UNA CAPA ENCIMA DEL VISOR DE AUTODESK (29-oct-2026).
 *
 * La revisión de CAD y el sustento en CAD dibujan en una capa que tapa el lienzo del visor. Mientras hay una
 * herramienta puesta, esa capa se queda con el ratón, y con él la rueda: no se podía acercar a una zona del plano
 * para marcarla (queja del propietario). En ACC la rueda acerca con cualquier herramienta; aquí igual.
 *
 * Reenviar el evento al lienzo NO sirve: el visor (LMV 7.131) ignora una rueda simulada, en el lienzo, en su
 * envoltura y en el contenedor (medido en el banco, 0 de 6). Lo que sí acerca, con su velocidad y anclado al
 * cursor, es dársela a su propio manejador de rueda.
 */

/** La rueda sobre la capa es del visor: acercar y alejar, como sin la capa. */
export function pasarRuedaAlVisor(viewer, evento) {
  const manejador = viewer?.toolController?._boundMousewheel;   // interno de LMV 7; sin él, la rueda no hace nada, como antes
  if (typeof manejador === 'function') manejador(evento.nativeEvent || evento);
}
