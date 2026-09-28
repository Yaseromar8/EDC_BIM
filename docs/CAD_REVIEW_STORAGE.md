# Revisión CAD de ALEPHIA Docs — almacenamiento local preparado

Esta función es propia de ALEPHIA. No escribe anotaciones ni fotos en ACC y no
modifica el DWG, su versión original ni su traducción Autodesk.

## Datos que se guardan

- `cad_review_marks` (PostgreSQL): documento UUID, versión UUID, GUID de vista
  2D, tipo (nube/texto/foto), coordenadas del modelo en JSONB, texto, autor,
  fechas, estado publicado y retirada lógica. Se usa la migración
  `backend/sql/33_revision_cad.sql` antes de desplegar el código.
- `cad_review_attachments` (PostgreSQL): referencias a documentos de ALEPHIA
  por `file_node_id` o la clave del objeto GCS de una foto subida desde el
  equipo. Quitar una referencia la oculta de manera lógica: conserva su clave
  y quién la quitó; no deja una foto sin rastro en el bucket.
- Foto elegida de las carpetas de ALEPHIA: sólo se guarda el ID del documento.
  No se duplica el binario. El acceso vuelve a comprobar los permisos de la
  carpeta de destino.
- Foto subida desde el equipo: se valida y recodifica a JPEG para quitar EXIF
  (incluida geolocalización), límite 16 MB y 30 megapíxeles. Se guarda en el
  bucket GCS configurado, bajo `cad-review/<documento>/<marca>/<uuid>.jpg`.
  La API sirve los bytes con autenticación y `Cache-Control: private, no-store`;
  la interfaz no recibe una URL pública o firmada de larga duración.

## Visibilidad

Toda marca nace privada. La consulta devuelve las publicadas y los borradores
del usuario actual; publicar exige autoría y permiso `view_markup` en la
carpeta. La lectura de cada foto exige visibilidad de la marca y, si se trata
de un documento de ALEPHIA, permiso sobre el documento de destino. Editar una
marca o agregar/quitar referencias la devuelve a borrador para que el autor
revise el cambio antes de volver a publicarla.

## Estado de activación

El frontend local en modo normal (`localhost:5174`) consulta al backend Virginia,
que todavía no tiene `/api/docs/cad/reviews`; por eso recibía un 404 HTML. El
backend local que ya escuchaba en `127.0.0.1:3000` también respondió 404 a
`OPTIONS` en esa ruta: sigue ejecutando código anterior. La interfaz ahora
desactiva estas herramientas con una explicación discreta cuando el backend
carece de la ruta, sin mostrar el error técnico rojo ni permitir un borrador
que no se puede guardar.

El propietario decidió no usar más el entorno de ensayo `3000`. El frontend
local oficial `5174` mantiene su conexión a Virginia; por tanto, sólo podrá
guardar marcas cuando la migración 33 se aplique manualmente en la base real
como `ecd_migrator` y el backend Virginia actualizado esté desplegado. Ambos
son actos separados que requieren autorización específica. Hasta entonces el
frontend desactiva las herramientas y no simula que guardó una observación.

## Relación con ACC

La documentación pública de Autodesk confirma el comportamiento de producto:
marcas privadas por defecto, publicación para los miembros, referencias a
archivos/planos y fotos existentes o nuevas. No documenta las tablas o el
bucket interno de ACC. Autodesk Platform Services aclara que **Viewer no
persiste las marcas por sí solo**: cada aplicación debe guardar los datos en
su propio servidor. ALEPHIA usa PostgreSQL para las marcas y GCS privado para
los binarios, no intenta copiar un esquema interno no publicado de ACC.

Fuentes oficiales: [Autodesk: crear y publicar marcas](https://help.autodesk.com/cloudhelp/ENU/Build-Sheets/files/sheets-markups/Create_Style_Markups.html),
[Autodesk: marcas de fotos](https://help.autodesk.com/cloudhelp/ENU/Build-Sheets/files/sheets-markups/Feature_Markups.html),
[APS: persistir datos del Viewer](https://aps.autodesk.com/blog/persist-markups-data-viewer).
