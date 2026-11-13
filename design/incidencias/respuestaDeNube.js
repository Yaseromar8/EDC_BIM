// design/incidencias/respuestaDeNube.js
//
// RESPONDER A UNA NUBE: «RESUELTO» O «ENTREGADO» (13-nov-2026).
//
// El dueño: «cuando se requieren fotos o algún documento, dice Entregar. Pero ¿qué pasa si solo es mover o
// actualizar? Deberíamos tener alguna forma de indicar que se solucionó». La forma ya existía —basta escribir qué se
// hizo, adjuntar es opcional (4-nov-2026)—, pero la palabra «Entregar» hacía pensar que había que subir algo. Ahora
// la palabra sigue a lo que la persona hace: sin adjuntos, da por resuelto; con adjuntos, entrega.
//
// Por dentro es el mismo acto y el mismo estado (`entregada`): quien pidió acepta o devuelve igual. Aquí solo se
// decide CÓMO SE LLAMA. Puro, para probarlo sin navegador (frontend-docs/pruebas/respuestaDeNube.prueba.mjs).

/** ¿Lo respondido es solo decir qué se hizo, sin ningún documento? */
export function soloConNota(entregas) {
  const lista = Array.isArray(entregas) ? entregas.filter(e => e && typeof e === 'object') : [];
  return lista.length > 0 && !lista.some(e => e.tipo === 'documento');
}

/** El botón que confirma la respuesta, según lo que lleve. */
export function botonDeRespuesta(entregas) {
  return soloConNota(entregas) ? 'Dar por resuelto' : 'Entregar';
}

/** Lo que se dice al hacerlo. */
export function avisoDeRespuesta(entregas) {
  return `${soloConNota(entregas) ? 'Resuelto' : 'Entregado'}: le llega al encargado del plano`;
}

/**
 * Cómo se lee una nube ya respondida y pendiente de aceptar: «Resuelta» si su última ronda solo lleva una nota;
 * si lleva documentos, o no se sabe, lo que diga el servidor (`estado_etiqueta`, «Entregada»).
 */
export function rotuloDeRespondida(nube) {
  if (!nube || nube.estado !== 'entregada') return null;
  const rondas = Array.isArray(nube.rondas) ? nube.rondas : [];
  const ultima = rondas[rondas.length - 1];
  return ultima && soloConNota(ultima.entregas) ? 'Resuelta' : null;
}
