# E1.2 · Enlace, confirmación, fechas y documentos compartidos — informe de cierre

13-sep-2026. Base: `8875f9e` (E1.1, en producción). Contrato: `E1_2_CONTRATO.md`. Corrige H5, H6 y H9 y aplica H7-A, de la segunda parte de `E1_UAT_HALLAZGOS.md`.

**Estado: en producción desde el 13-sep.** Commit único `27e1a42` sobre `8875f9e` («SI HAZLO»), push normal («VAMOS») y despliegue manual del propietario, verificado (§6). Sin migraciones.

**H7:** tu respuesta no eligió entre A y B, así que se aplicó **A (avisar)**, la recomendada. B (impedir) queda fuera.

## 1 · Qué queda corregido

| # | Antes | Ahora |
|---|---|---|
| H5 | En Archivos, **Adelante** devolvía a la dirección el enlace de una revisión que no se veía. Copiarla daba ese enlace, y «Revisiones» abría esa revisión en vez de la lista | **La dirección y la pantalla dicen lo mismo.** Si Atrás o Adelante traen una revisión de la obra, se abre esa revisión. «Revisiones» en el menú y «Enviar a revisión» abren siempre la lista. Si la revisión es de otra obra, o estás en la portada, se abre como un enlace |
| H6 | Con una confirmación abierta, **Atrás** dejaba la confirmación encima de la lista, y aceptarla registraba el acto | **Si la revisión deja de verse, su confirmación se cancela**, como con «Cancelar», y no se registra nada. Si aun así llegara un «sí» sin la revisión en pantalla, tampoco se actúa |
| H7-A · alta | Nada avisaba de que los documentos ya estaban en otra revisión en curso | Junto a cada documento: **«Ya está en RV-…, en curso.»**, y una línea que explica por qué importa |
| H7-A · detalle | Igual | Junto a cada documento: **«También está en RV-…, en curso.»** El título de cada revisión sale al pasar el ratón. Cuando la otra termina, deja de nombrarse |
| H7-A · cierre | La consecuencia decía siempre «los documentos pasan a Compartido», aunque ya lo estuvieran | Si ya estaban en su destino: **«Los documentos ya están en Compartido, así que su estado no cambia.»** Si solo algunos lo están, los nombra. Si alguno volvería atrás: **«Atención: X está en Publicado y volverá a Compartido.»** Avisa, no impide |
| H9 | La hora de creación y los plazos salían **5 horas adelantados** en Lima. Mi trabajo contaba los días de plazo con esas 5 horas de más | Las revisiones (creación y plazo) y Mi trabajo (plazos) salen **con su zona horaria**, sin tocar ningún dato |

## 2 · Qué no cambia, comprobado

- **Mismas reglas en el servidor.**
  - `/act`, el alta, la sustitución y las plantillas no se tocan. En `routes/reviews.py` solo hay lecturas nuevas: `_otras_en_curso`, el estado de cada documento en el detalle, tres datos más en `acciones` y la ruta `GET /api/reviews/en-curso`.
  - El retroceso se avisa y no se impide. En el ensayo, Colega podía cerrar T4 igualmente; la rechazó, y el PDF siguió en Publicado.
- **Quién ve qué.** Los avisos solo nombran revisiones que esa persona puede abrir. En el ensayo, T3 lleva un documento reservado: para Tú sale nombrada, y para Colega no aparece, ni en el detalle ni en el alta.
- **Las demás confirmaciones del portal no cambian.** `confirmAction` sin `signal` funciona como siempre.
- **Sin migraciones.** Las fechas se convierten al leerlas.
- **No se ha tocado `FilesPage.jsx` ni el resto del WIP ajeno**: sus sha256 siguen iguales.

## 3 · Ficheros

**Backend**
- `routes/reviews.py`:
  - fechas con zona en el listado y el detalle;
  - estado de cada documento y `tambien_en` en el detalle;
  - `ya_en_destino`, `todos_en_destino` y `retroceden` en `acciones`;
  - ruta nueva `GET /api/reviews/en-curso`, solo de lectura.
- `encargos.py`: la consulta de Mi trabajo devuelve los plazos con zona.
- **Pruebas:**
  - `tests/test_revision_detalle_y_listado.py`: 14 pruebas nuevas, y el doble de la base devuelve el estado del documento;
  - `tests/test_encargos.py`: 1 prueba nueva.
- **Nuevo** `herramientas/ensayo_de_revisiones_gemelas.py`: 24 comprobaciones contra PostgreSQL.

**Frontend (`frontend-docs`)**
- `utils/revisiones.js`:
  - `destinoTrasNavegar` (qué enseñar tras Atrás o Adelante);
  - `avisoDeOtrasRevisiones` y el texto `AVISO_DOCUMENTOS_EN_CURSO`;
  - la consecuencia del cierre con lo que ya pasó con los documentos.
- `hooks/useFileExplorer.js`: escucha Atrás y Adelante, y «Revisiones» desde otra sección quita un enlace viejo.
- `App_Refactor.jsx`: una revisión de otra obra, o traída desde fuera de Documentos, se abre como un enlace.
- `utils/confirm.jsx`: opción `signal` para retirar una confirmación.
- `components/RevisionDetalle.jsx`: retira su confirmación al dejar de verse y enseña «También está en…».
- `components/ReviewsModule.jsx` (alta): pregunta por sus documentos y enseña «Ya está en…».
- **Pruebas:**
  - `pruebas/revisiones.prueba.mjs`: 6 pruebas nuevas;
  - `probar-revisiones.jsx` (banco): RV-042 y RV-043 llevan los mismos documentos que RV-041.

**Documentación:** `E1_2_CONTRATO.md`, este informe, el estado de los hallazgos, la nota de D4 en la guía y `docs/AI_WORKSTATE.md`.

## 4 · Evidencia

| Prueba | Resultado |
|---|---|
| `python -m pytest -q -p no:cacheprovider tests` (desde `backend`) | **1827 passed, 1 failed**. El fallo es el preexistente `test_capacidades_con_puerta`. Antes eran 1812 / 1; hay 15 pruebas nuevas |
| `npm test` (frontend-docs) | **6 bancos en verde**; `revisiones` 19/19 |
| ESLint sobre los ficheros tocados | **Sin problemas nuevos.** `confirm.jsx` y `probar-revisiones.jsx` traen el mismo error `react-refresh/only-export-components` que en `8875f9e` |
| Construcción del portal con la configuración del banco, sin `.env` | OK |
| `ensayo_de_revisiones_gemelas.py`, base desechable, ENFORCE | **24/24** |
| Regresión `ensayo_de_detalle_de_revision.py` | **25/25** |
| Regresión `ensayo_de_version_y_visibilidad.py` | **67/67** |
| Regresión `ensayo_de_admin_participante.py` | **16/16** |
| Regresión `ensayo_de_revisiones.py`, sin `.env` | **50/50** |
| App real con backend real del banco | PASS, detalle abajo |
| Banco `probar-revisiones` | PASS, detalle abajo |

**Ensayo contra PostgreSQL, 24/24**, con Tú (administrador que participa), Colega y Tercero:
- **Los actos de la guía:**
  - C3, C6, C8, C9 y C10 cambian solo su revisión: la fila de la otra sale idéntica byte a byte;
  - «Me toca» y Mi trabajo dicen lo correcto en cada paso.
- **Avisos:**
  - en T1, Tú ve el PDF 1 en T3 y T2, y el PDF 2 en T2; Colega solo ve T2;
  - la pregunta del alta da lo mismo para cada uno;
  - un documento sin otras revisiones no avisa;
  - tras cerrar T2, T2 deja de nombrarse.
- **Cierre:**
  - con T2 cerrada, cerrar T1 le dice a Colega que los dos PDF ya están en Compartido, y lo deja hacer;
  - con un PDF en Publicado, cerrar T4 avisa de que volvería a Compartido.
- **Fechas:**
  - la creación y el plazo de T1 salen con zona;
  - la creación es el instante real;
  - el plazo vence justo un día después;
  - la lista, el detalle y Mi trabajo dan el mismo instante.
  - La base del banco está en hora de Lima (−05:00) y producción en UTC: la conversión vale para las dos.

**App real con backend real del banco** (personas ficticias, dos revisiones con los mismos PDF):
- **H5:**
  - lista → abrir T2 → Atrás → Archivos → **Adelante**: se abre T2, y la dirección y la pantalla coinciden;
  - en Archivos, con una dirección vieja que apunta a T2, pulsar **Revisiones** abre la lista y limpia la dirección.
- **H6:** en T1, «Dar conformidad» y **Atrás**: la confirmación desaparece, T1 sigue en su paso 1 y el servidor no recibe ningún acto.
- **H7-A:** el detalle de T1 dice «También está en RV-212, en curso.» en los dos documentos.

**Banco `probar-revisiones`** (el `ReviewModal`, el `ReviewsView` y la confirmación reales, con servidor simulado):
- **Detalle:** RV-041 dice «También está en RV-043 y RV-042, en curso.», y al pasar el ratón salen los títulos.
- **Alta:** «Ya está en RV-043, RV-042 y RV-041, en curso.», más la línea que lo explica.
- **Cierre, como Luis:**
  - antes de cerrar RV-042, la consecuencia dice «pasan a Compartido»;
  - tras cerrarla, la de RV-043 dice «Los documentos ya están en Compartido, así que su estado no cambia.», y RV-042 deja de nombrarse.
- **H6:** confirmación abierta y Atrás: la confirmación desaparece y no se envía ningún acto.

## 5 · Observaciones

- **Sin ver en la app real: «Enviar a revisión».** El panel del navegador de la sesión no pinta la tabla de archivos, igual que en E1.1. El aviso del alta se vio en el banco, con el `ReviewModal` real, y la respuesta del servidor la prueba el ensayo.
- **Probado solo con las reglas puras y la lectura del código: Atrás o Adelante hacia una revisión de otra obra, o desde la portada.** Es la parte de `App_Refactor`; no se recorrió en pantalla.
- **Los plazos de otros módulos siguen como estaban.** Mi trabajo ya los muestra con zona, pero no se revisaron las fechas de las pantallas de RFI, Red Line o Transmittals.
- **Tras desplegar, la guía cambia:**
  - D4 ya no reproduce H5;
  - sobran las advertencias de «Mientras no llegue la corrección (E1.2)».

## 6 · Despliegue en producción

13-sep-2026, por la noche.

**Antes del push:** `origin/main` estaba en `8875f9e`, y Auto-Deploy en Off en los cuatro servicios de Render. Después del push no arrancó ningún despliegue.

**Despliegue manual del propietario:** primero el backend de Virginia y luego el portal.

**Incidente del backend, de 21:11 a 21:36:**
- El primer arranque de `27e1a42` se quedó en «Control socket listening…» y no llegó a «Booting worker»: la aplicación nunca se cargó.
- Render lo dio por Live, pero avisó de que no detectaba ningún puerto abierto. No respondían ni `/api/health` ni el `/api` del portal.
- El arranque de E1.1 en el mismo servicio y con las mismas librerías (gunicorn 25.1.0) sí siguió con «Booting worker». El fallo ocurrió antes de ejecutarse el código de la aplicación.
- Con tu autorización («REINICIA») se reinició el servicio, y arrancó normal: «Booting worker», y la política de acceso aplicada a 393 endpoints (392 con E1.1; la diferencia es la ruta nueva).
- No se tocó ningún dato.

**Verificación tras el reinicio:**

| Qué | Resultado |
|---|---|
| Backend de Virginia, `/api/health` | `27e1a428ce3c` |
| El mismo, por el `/api` del portal y de `alephia.com.pe` | `27e1a428ce3c`, HTTP 200 |
| Portal | `index-DgYYQqZD.js`, idéntico en Render y en `alephia.com.pe`. Trae «Cada documento tiene un solo estado…» y la llamada a `/api/reviews/en-curso`, que no existen en `8875f9e` |
| Oregón | `cdf783754574`, sin cambios |

**Lección:** tras cada despliegue manual del backend, «Live» no basta. Hay que comprobar `/api/health` y que el log diga «Booting worker».

## 7 · Cierre

```
CORRECCIONES PREVIAS = en producción: versión fijada, lista filtrada por acceso, acceso documental para actuar, vista previa y E1.1 (administrador como revisor, alta sin perder revisores, listas solo con participantes) · E1.2 en producción desde el 13-sep: dirección y pantalla siempre iguales, confirmación que no sobrevive a su revisión, fechas con zona horaria, avisos de documentos en otra revisión en curso
FUNCIONES NUEVAS YA UTILIZABLES = en producción desde el 13-sep: detalle con documentos, versiones, pasos, plazo e historial · enlace y apertura desde Mi Trabajo · filtros y paginación · botones según actor y paso (Dar conformidad ≠ Aprobar) · confirmación y mensajes
FUNCIONES DEL OBJETIVO TODAVÍA PENDIENTES = B: impedir documentos en dos revisiones en curso (decisión) · E2 anular y archivar · contrato nuevo (rondas, devolver al iniciador, volver al paso anterior, decisión por archivo, cierre separado de la emisión) · E5 exportación y contadores · correo opcional por acción
```
