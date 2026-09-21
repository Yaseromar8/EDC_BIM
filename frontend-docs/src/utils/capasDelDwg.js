// LAS CAPAS APAGADAS DEL DWG, EN TODAS SUS VISTAS 2D.
//
// El DWG guarda qué capas están encendidas. Autodesk lo entrega como el estado
// de capas «Initial» del ESPACIO MODELO (`metadata.layer_states`, oculto en la
// lista de estados), y el visor lo aplica ahí solo. Las PRESENTACIONES no traen
// ese estado, y en ellas el visor encendía TODAS las capas.
//
// Medido el 21-sep-2026 en producción con 500125-CSSP001-780-XX-DR-HD-011220011222
// (el propietario: «en ALEPHIA no respeta las capas ocultas; ACC sí»): en la
// presentación P08-0006 salían las 5 capas que el DWG tiene apagadas, y las
// líneas rosas gruesas que «ensucian» eran dos de ellas, POLIGONO_INTERVENCION
// (+1.446 px magenta en la hoja) y ESTRUC. PROYECTADAS PQ5 (+1.301). Apagadas
// como en el DWG, el magenta de la hoja baja de 4.375 a 1.757 px.
//
// Así que la lista de capas visibles del espacio modelo manda en todas las
// vistas 2D del mismo DWG: lo que no está en ella, se apaga.

/** Las capas visibles del DWG según su estado «Initial», o null si no lo trae. */
export function visiblesDelDwg(metadata) {
  const estados = (metadata && metadata.layer_states) || [];
  const inicial = Array.isArray(estados) ? estados.find(e => e && e.name === 'Initial') : null;
  const visibles = inicial && inicial.visible_layers;
  // Sin lista, o vacía, no se sabe nada: mejor enseñarlo todo que apagarlo todo.
  return Array.isArray(visibles) && visibles.length ? visibles.slice() : null;
}

/** De las capas de una vista, las que el DWG tiene apagadas. */
export function capasQueApagar(nombresDeLaVista, visibles) {
  if (!visibles || !visibles.length) return [];
  const encendidas = new Set(visibles);
  return (nombresDeLaVista || []).filter(n => !encendidas.has(n));
}
