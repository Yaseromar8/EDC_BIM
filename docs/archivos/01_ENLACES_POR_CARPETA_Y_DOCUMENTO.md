# Archivos · un enlace por obra, carpeta y documento, como en ACC

14-sep-2026. **Solo diagnóstico y propuesta: no hay código.**

> **Estado (14-sep-2026, después):** L1–L3 las decidió tu «CONTRATO FINAL BASADO EN ACC», que manda sobre esta propuesta: formato `obra`/`carpeta`/`documento`/`version`, la carpeta como contexto y el documento como identidad, «Copiar enlace» al documento vigente. Implementado y probado en local: `02_ENLACES_INFORME_DE_CIERRE.md`.

Tu pregunta: en ACC la dirección cambia al elegir un proyecto, al entrar en cada carpeta y al abrir un archivo. ¿Por qué en ALEPHIA no?

## En corto

- **En ALEPHIA la dirección no cambia porque el portal guarda dónde estás en la memoria de la pantalla, no en la dirección.** La obra elegida se guarda en el navegador; la carpeta y el documento abierto, solo en la pantalla.
- **Consecuencias:**
  - no se puede mandar a nadie el enlace de una carpeta o de un plano;
  - al recargar vuelves al inicio de la obra;
  - «Atrás» del navegador no vuelve a la carpeta anterior.
- **La única excepción son las revisiones:** desde E1 tienen su enlace (`/?obra=…&revision=…`), que funciona también tras iniciar sesión y con Atrás/Adelante. Es la prueba de que este portal puede hacerlo.
- **Propuesta:** extender ese mismo mecanismo a obra, carpeta y documento, con identificadores y no con nombres, como ACC.

## 1 · Por qué hoy no cambia la dirección

| Qué | Dónde se guarda hoy | Dónde |
|---|---|---|
| La obra elegida | En el navegador (`localStorage`, `selected_project`) | `frontend-docs/src/App_Refactor.jsx:58-62` |
| Si estás en la portada o en Documentos | En la pestaña (`sessionStorage`) | `App_Refactor.jsx:67` |
| La carpeta en la que estás | En la pantalla: una ruta hecha con los **nombres** de las carpetas y el id de la carpeta. Entrar en otra carpeta no escribe nada en la dirección | `hooks/useFileExplorer.js:49-50`, `navigate` en `:320-342`, `handleFolderClick` en `:350-358` |
| El documento abierto | En la pantalla (`activeFile`) | `pages/FilesPage.jsx:291-297`, visor en `:1440-1447` |

Así se construyó el portal: como una aplicación de una sola página que navega por dentro. Nadie le pidió enlaces hasta las revisiones.

**Además, la ruta interna se hace con nombres** (`obra/02_SHA_Compartido/03_Documentos/`). Un enlace hecho con nombres se rompería al renombrar una carpeta. Por eso ACC usa identificadores: `folderUrn` para la carpeta y `entityId` para el documento.

## 2 · Lo que ya existe y sirve

- **El mecanismo de enlaces de las revisiones** (`utils/revisiones.js` y `App_Refactor.jsx:92-189`):
  - lee la dirección, elige la obra entre las de esa persona y abre lo que toca;
  - guarda el enlace mientras se inicia sesión;
  - Atrás y Adelante mantienen la dirección y la pantalla de acuerdo;
  - si la persona no tiene acceso, lo dice sin enseñar nada.
- **El servidor ya lista una carpeta por su id:** `GET /api/docs/list` usa `id` si viene (`routes/documents.py:905-906`) y devuelve el nivel de quien mira (`current_permission_level`).
- **El árbol de la izquierda ya se abre solo** hasta la carpeta en la que estás, si la pantalla conoce su ruta (`components/FolderNode.jsx:25-35`).
- **El servidor sabe reconstruir la cadena de carpetas** de un nodo (`file_system_db.get_node_full_path`, `:570-600`). Pero no lo ofrece como ruta, no comprueba la obra ni el permiso, y devuelve solo nombres.

## 3 · Propuesta: el formato de los enlaces

La misma forma que ya usan las revisiones, para no tener dos sistemas:

| Qué se ve | En ACC | En ALEPHIA |
|---|---|---|
| Una obra | `…/projects/<proyecto>` | `/?obra=<obra>` |
| Una carpeta | `…?folderUrn=<carpeta>` | `/?obra=<obra>&carpeta=<id de la carpeta>` |
| Un documento abierto | `…&entityId=<documento>` | `/?obra=<obra>&carpeta=<id>&documento=<id del documento>` |
| Una versión concreta | (versión en el identificador) | `…&documento=<id>&version=<id de la versión>` |
| Una vista dentro de un modelo | `…&viewableGuid=<vista>` | Fuera de esta entrega (§7) |
| Una revisión | — | `/?obra=<obra>&revision=<número>` (ya existe) |

- **El documento sin versión abre la vigente,** como el `entityId` de ACC, que es el documento y no una versión. Con `version=` abre esa versión: es lo que ya hacen las revisiones con la versión que revisan.
- **Identificadores, nunca nombres:** renombrar o mover una carpeta no rompe el enlace.

## 4 · Qué verías

1. **Al elegir una obra:** la dirección pasa a `?obra=…`.
2. **Al entrar en una carpeta:** se añade `&carpeta=…`. Cada nivel tiene su enlace.
3. **Atrás y Adelante** del navegador recorren las carpetas por las que pasaste.
4. **Al recargar,** sigues en la misma carpeta.
5. **Al abrir un plano:** se añade `&documento=…`. Al cerrarlo, vuelve el enlace de la carpeta.
6. **Si copias la dirección y se la mandas a alguien de tu equipo,** abre la misma carpeta o el mismo plano, si tiene permiso. Si antes tiene que iniciar sesión, el enlace se conserva.
7. **Propuesto:** «Copiar enlace» en el menú de botón derecho de carpetas y archivos, para no tener que abrir nada.

## 5 · Seguridad

- **Un enlace no da acceso a nada.** Quien lo abre necesita sesión, ser de la obra y tener permiso en esa carpeta (Configuración de permisos). Lo decide el servidor, como hoy.
- **Sin permiso, un mensaje neutro:** «No tienes acceso a esa carpeta o ya no existe». Sin nombres de carpetas ni de archivos.
- **Una carpeta de otra obra no se abre dentro de esta,** aunque alguien cambie el id en la dirección.
- **No es «Compartir».** Compartir crea un enlace público, sin sesión, y tiene su propio análisis (`docs/compartir/01_COMPARTIR_VARIOS_DOCUMENTOS.md`). Estos enlaces son internos.

## 6 · Qué hay que construir

- **Servidor:** una ruta de solo lectura que, dado el id de una carpeta o documento de la obra, devuelva:
  - su cadena de carpetas;
  - si es carpeta o documento;
  - el nivel de quien pregunta.

  Tiene que comprobar la obra y el permiso, y responder neutro si no hay acceso. Con sus pruebas.
- **Portal:**
  - leer y escribir el enlace al elegir obra, al navegar y al abrir o cerrar un documento;
  - atender Atrás y Adelante;
  - abrir desde el enlace y conservarlo al iniciar sesión, generalizando lo de las revisiones;
  - «Copiar enlace» en el menú.

  Con pruebas de reglas puras y el recorrido en pantalla del banco.
- **Cuidados:**
  - **Los enlaces de revisión tienen que seguir funcionando igual:** están en correos y en Mi Trabajo. Las pruebas de E1.2 (Atrás, Adelante y la dirección de las revisiones) se repiten enteras.
  - **`FilesPage.jsx` tiene cambios ajenos sin commit** (la barra de iconos). Otra vez hará falta preparar solo nuestras líneas.
- **Tamaño:** una entrega mediana, de un día con sus pruebas. Sin migraciones.

## 7 · Fuera de esta entrega

- La vista concreta dentro de un modelo CAD o Revit (el `viewableGuid` de ACC).
- Enlaces a la papelera y a resultados de búsqueda.
- El visor 3D (`frontend-react`), que es otra aplicación con sus propias direcciones.
- Enlaces públicos: eso es «Compartir».

## 8 · Decisiones tuyas

| # | Pregunta | Mi recomendación |
|---|---|---|
| L1 | ¿Hago los enlaces por obra, carpeta y documento? | Sí |
| L2 | ¿Orden respecto a E1.3, que está commiteado y sin desplegar? | Primero desplegar E1.3, que ya está listo; esto después, como entrega aparte |
| L3 | ¿Añado «Copiar enlace» al botón derecho de carpetas y archivos? | Sí |
