# 32 · El enlace público de una carpeta (17-nov-2026)

El dueño copió los enlaces de las fichas del sustento de metrados de PQT8 y vio «Acceso denegado · Este enlace
expiró». Esos enlaces están en el Excel `PAQ-08_S1_SUSTENTO_DE_METRADOS_LISTA_DE_CANTIDADES_20261110.xlsb`, que **ya
se envió por correo**: «necesito mantener los enlaces, porque ya fueron enviados por correo».

**En local: sin push, sin desplegar. Sin migración.**

---

## 1 · Lo que pasaba (comprobado en producción)

Había dos problemas, uno debajo del otro.

**El primero, la caducidad.** «Compartir» crea los enlaces con **7 días** si no se cambia. Las 16 fichas se
compartieron el 10-nov y caducaron el 17-nov a la misma hora. En la base había 95 enlaces caducados: esos 16 y 79
antiguos de agosto y septiembre.

Se arregló el mismo día, sin código: el dueño ejecutó en Cloud SQL Studio un `UPDATE` que quitó la caducidad a los
**12 enlaces públicos que lleva el Excel** («La sentencia se ejecutó correctamente»). Los otros 83 caducados no se
tocaron.

**El segundo, que salió al quitar la caducidad.** Esos 12 enlaces **no son de archivos, son de carpetas**
(`node_type = FOLDER`, comprobado por el dueño). «Compartir» deja crear el enlace de una carpeta, pero la página
pública solo sabía abrir un archivo suelto: contestaba «El archivo físico no existe». Esos enlaces no habrían
funcionado ni el primer día.

## 2 · Lo que lleva ese Excel (contado, sin abrirlo entero)

| Tipo de enlace | Cuántos | Estado |
|---|---|---|
| A un documento, interno (`?obra=…&documento=…`) | 1.205 (411 documentos distintos) | Funcionan siempre; piden iniciar sesión |
| A una carpeta, interno (`?obra=…&carpeta=…`) | 54 (108 carpetas distintas) | Funcionan siempre; piden iniciar sesión |
| Públicos de «Compartir» (`/share/…`) | 80 apariciones de 15 enlaces | 3 a archivos (abren); **12 a carpetas** (no abrían) |

Los internos no se pueden volver públicos sin cambiar los enlaces: son la dirección del documento dentro de la
plataforma, y hacerlos públicos abriría toda la obra. Quien no tenga usuario necesita que lo inviten a la obra.

## 3 · Las cuatro preguntas

| | |
|---|---|
| **¿Qué problema resuelve?** | Los enlaces públicos de una carpeta no abrían nada. Doce de ellos ya están en un Excel enviado por correo. |
| **¿Qué cambió?** | Quien abre el enlace de una carpeta ve su contenido —subcarpetas y documentos— y abre cada documento en el mismo lector que el enlace de un archivo suelto. Sin iniciar sesión y solo para leer. Los **mismos** enlaces; no hay que cambiar el Excel. |
| **¿Cómo se comprobó?** | Contra PostgreSQL local con la aplicación real y sin sesión, y en pantalla con la página pública real (§6). |
| **¿Cómo se vuelve atrás?** | Revirtiendo el commit: los enlaces de carpeta vuelven a no abrir. |

## 4 · Lo que concede el enlace de una carpeta, y nada más

- Leer lo que está **dentro** de esa carpeta, a cualquier profundidad. También lo que se suba después: es lo que se
  compartió.
- Los documentos **enlazados** en esas carpetas desde otra cuentan como dentro, porque en Docs se ven dentro.
- Nada de fuera, aunque se conozca su identificador; nada que esté en la papelera ni debajo de una carpeta en la
  papelera.
- Cada documento pasa por la **regla de salida del ECD** (sensibilidad), igual que al compartirlo suelto: lo que no
  puede salir se ve en la lista, apagado y con el motivo, pero no se abre.
- El enlace vale mientras valga: revocado o caducado, nada.
- Cada documento que se abre queda anotado en el registro de accesos, con el id del enlace.

## 5 · Lo que hay que saber antes de publicarlo

- **Un enlace a una carpeta deja ver todo lo que hay dentro, también lo que se suba después.** Para las fichas del
  sustento es lo que se quiere, pero vale para cualquier carpeta que alguien comparta.
- **La regla de salida se mira al abrir, no solo al crear el enlace.** Es más estricta que el enlace a un archivo
  suelto, que solo se mira al crearlo. Si el triaje de seguridad de la obra caduca, los documentos de las carpetas
  compartidas dejarán de abrirse (los de los enlaces sueltos, no). Antes de publicar conviene comprobar que el
  triaje de PQT8 está vigente (consulta en §7).
- **Los planos CAD (DWG, RVT) dentro de una carpeta compartida** se ofrecen como cualquier documento, pero el lector
  público no los dibuja: sería el siguiente paso si hace falta.
- **No se cambió el plazo de fábrica de «Compartir»** (sigue en 7 días). Queda propuesto aparte.

## 6 · Evidencia (17-nov-2026)

**Ensayo contra PostgreSQL local, con la aplicación real y SIN sesión**
(`backend/herramientas/ensayo_de_carpeta_compartida.py`): **26 de 26**.
- El enlace de la carpeta dice que es una carpeta; el de un archivo sigue igual.
- El contenido de la ficha y de su subcarpeta, con el documento enlazado desde otra ficha; la carpeta de la papelera
  no sale.
- No se lista ni se abre: otra ficha, la papelera, la raíz de la obra, un identificador inventado, una carpeta en
  vez de un documento. En ninguno de esos casos se llega a firmar la descarga.
- Revocado o caducado: 410, para listar y para abrir.
- Sin triaje de seguridad en la obra, los documentos salen en la lista como no disponibles y no se abren (403).

**Pruebas**
- `backend/tests/test_carpeta_compartida.py`: 12 (nuevo).
- `frontend-docs/pruebas/carpetaCompartida.prueba.mjs`: 6 (nuevo).
- La suite entera del backend, los bancos del portal y la compilación, sobre el árbol exacto del commit: en su
  mensaje.

**En pantalla**, con la página pública real y respuestas como las del servidor: se ve la ficha con su carpeta y sus
documentos, el no disponible apagado con su motivo, se entra en la subcarpeta, el camino vuelve atrás, el plano se
abre en el lector y «Cerrar» devuelve a la lista. Sin errores en la consola. Captura:
`evidencias/carpeta-compartida-17nov/enlace-de-carpeta.png`.

**No comprobado:** en producción, con los 12 enlaces reales y sus documentos.

## 7 · Antes de publicar: comprobar el triaje de PQT8

En Cloud SQL Studio (solo lee):

```sql
SELECT s.model_urn, t.requiere_enfoque, t.revisar_en FROM document_shares s LEFT JOIN triaje_seguridad t ON t.model_urn = s.model_urn WHERE s.id = '564fc209-2a7d-4b3f-a216-289645556ad3';
```

- `requiere_enfoque` = `false` y `revisar_en` en el futuro (o vacío): los documentos se abrirán.
- Sin fila de triaje, o `revisar_en` ya pasado: saldrán como «No disponible» hasta que se revise el triaje.

## 8 · Ficheros

| Fichero | Qué es |
|---|---|
| `backend/routes/carpetas_compartidas.py` (nuevo) | Las dos rutas: el contenido y abrir un documento de dentro |
| `backend/routes/documents.py` | El enlace de una carpeta dice que es una carpeta; se cuelgan las rutas nuevas |
| `frontend-docs/src/components/CarpetaCompartida.jsx` (nuevo) | Lo que ve quien abre el enlace |
| `frontend-docs/src/components/SharedViewer.jsx` | Monta la carpeta cuando el enlace es de una carpeta |
| `frontend-docs/src/utils/carpetaCompartida.js` (nuevo) | Lo puro de la página |
| `backend/tests/test_cobertura_autorizacion.py`, `backend/tests/test_perfil_portal.py` | Las dos rutas públicas, declaradas con su motivo; el techo de rutas del portal, +2 |
| `backend/tests/test_carpeta_compartida.py`, `frontend-docs/pruebas/carpetaCompartida.prueba.mjs`, `backend/herramientas/ensayo_de_carpeta_compartida.py` (nuevos) | Pruebas y ensayo |
