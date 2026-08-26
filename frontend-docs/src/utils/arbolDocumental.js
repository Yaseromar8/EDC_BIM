/**
 * arbolDocumental — DÓNDE VIVEN LOS DOCUMENTOS DE UNA OBRA.
 *
 * UNA SOLA SEMÁNTICA DE RESOLUCIÓN, y esta es la del cliente.
 *
 *     CANONICAL TREE   autoridad para toda obra nueva
 *     DERIVED TREE     compatibilidad legacy, y solo eso
 *
 * EL DEFECTO QUE ESTE FICHERO VIENE A CERRAR
 * -------------------------------------------
 * Seis sitios del portal deducían la ruta del expediente del NOMBRE de la obra:
 *
 *     `proyectos/${project.name.replace(/ /g, '_')}`
 *
 * Eso solo acierta cuando el nombre coincide con la carpeta, que es una
 * coincidencia y no una regla. Medido en producción el 25-ago-2026: las obras
 * creadas desde cierto momento guardan su expediente bajo su id canónico, así
 * que la pantalla **Archivos** enseñaba una obra vacía que no lo estaba — y con
 * ella se caía el selector de documentos, y con él emitir revisiones y aplicar
 * plantillas.
 *
 * Y ADEMÁS el nombre es EDITABLE: renombrar una obra movía el alcance de todo
 * lo que se escribiera después.
 *
 * EL SERVIDOR YA MANDABA LA RESPUESTA
 * ------------------------------------
 * `GET /api/projects` devuelve `scope_escritura` desde hace tiempo, calculado
 * sobre `project_ref.es_escritura` —la misma autoridad que resuelve
 * alias → obra, leída en sentido contrario—. Nadie la leía.
 *
 * NO SE DERIVA DEL NOMBRE NI COMO ÚLTIMO RECURSO. Si faltara `scope_escritura`
 * —un objeto de obra viejo guardado en el navegador— se cae al id canónico, que
 * es la autoridad para todo lo nuevo. Volver a la ruta derivada ahí reintroduce
 * exactamente el fallo: acertaría en las legacy y fallaría en las nuevas, que es
 * el reparto que produjo este lío.
 */

export function arbolDocumental(project) {
  if (!project) return null;
  return project.scope_escritura || project.model_urn || project.id || null;
}

export default arbolDocumental;
