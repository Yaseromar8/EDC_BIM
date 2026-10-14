# Integración pendiente antes de publicar (14-oct-2026, noche)

> El propietario: «y si ya lo publicamos en Render… entonces primero corrijamos todo eso que falta».
>
> Primera versión: solo se miró. Avance de la integración autorizada («Sí, pasos 1 a 3») en §4.

## 1 · El hallazgo

**El disco de esta máquina no es «producción más lo de hoy». Le faltan arreglos que ya están publicados.**

| | Commit |
|---|---|
| HEAD local | `b03d0fb` |
| `origin/main`, lo desplegado en Render (`/api/health` del portal) | `03095cb` |

- El HEAD local es antepasado de `origin/main`: va 11 commits por detrás y ninguno por delante.
- Esos 11 commits se publicaron desde fuera de este disco, con «índice temporal» (ver la memoria
  `local-detras-del-remoto`). **Su contenido no está, o no está entero, en los ficheros de aquí.**

Comprobación en seco, commit a commit (`git apply --check`, sin aplicar nada):

| Commit publicado | En el disco |
|---|---|
| `8c5ce9c` feat(ortofoto): mosaicos del Canal | falta o mezclado |
| `1e7bf89` docs(ortofoto) | falta o mezclado |
| `91b0f88` fix(viewer): rueda hacia delante | falta o mezclado (`forwardWheelZoom.js` **no existe** en el disco) |
| `84509d5` fix(inventory): reimportación | **presente** |
| `802ff0d` docs(viewer) | falta o mezclado |
| `3063692` fix(viewer): rueda del Canal y ortofoto | falta o mezclado |
| `b8bc824` fix(filters): facetas | falta o mezclado |
| `89fe030` docs(workstate) | falta o mezclado |
| `7aba9ad` feat(docs): puente ACC | falta o mezclado |
| `dad8851` feat(docs): revisiones CAD | falta o mezclado |
| `03095cb` fix(docs): referencias CAD y editor | falta o mezclado |

Además:
- **52 ficheros publicados están distintos en el disco.** Entre ellos están varios que se tocaron hoy:
  `routes/documents.py`, `file_system_db.py`, `server.py`, `FilesPage.jsx`, `MatrixTable.jsx`, `DocumentViewer.jsx`,
  `CadViewer.jsx`, `ContextMenu.jsx` y `Viewer.jsx`.
- Hay unos 1.900 ficheros sin seguimiento: artefactos, respaldos, ficheros de obra y los nuevos de hoy.

## 2 · Qué significa

1. **Publicar desde este disco tal cual desharía arreglos ya desplegados:** el puente ACC, las revisiones CAD, la
   ortofoto, la rueda del visor y las facetas de filtros.
2. **Docs en 5174 con `npm run dev`** usa este código de pantalla contra el backend de producción. Hoy funciona
   porque las llamadas viejas siguen existiendo, pero es una mezcla.
3. **Lo de hoy no se puede publicar** hasta juntarlo con esos 11 commits. Ese paso tiene conflictos seguros en los
   ficheros compartidos.

## 3 · Plan propuesto (necesita autorización expresa por acto)

1. **Respaldo** (sin `stash`, que en este repositorio rompió finales de línea): copiar `git diff HEAD` y los
   ficheros nuevos de hoy a una carpeta de respaldo. No toca git.
2. **Rama local de integración** (solo local, sin push): commits del trabajo de hoy por temas, con lista explícita de
   ficheros:
   - identidad D-24;
   - trazabilidad (pasos 0b y 0c);
   - columnas, A1 y B1;
   - A2 y A2-2 (vistas);
   - ficha y portada;
   - arreglos de permisos.

   El WIP ajeno se queda **fuera** de los commits.
3. **Traer `origin/main`** a esa rama (`git fetch` + `merge`) y **resolver los conflictos fichero a fichero**,
   conservando lo publicado y lo de hoy.
4. **Volver a pasar todo:**
   - `pytest`, bancos de Docs y de View, y builds;
   - el ensayo contra PostgreSQL real (`herramientas/ensayo_de_vistas_y_ficha.py`).
5. **Prueba del propietario** en local, con Docs en modo ensayo (`npm --prefix frontend-docs run dev:ensayo --
   --port 5183`).
6. Con su visto bueno: **push** (lo autoriza él), **Manual Deploy** en Render (lo hace él) y verificación por
   `/api/health`.

**Decisiones del propietario:**
- autorizar los commits locales del paso 2;
- autorizar el `fetch` y el `merge` del paso 3;
- decidir qué se hace con el WIP ajeno: queda fuera, pero sigue en el disco.

## 4 · Avance (14-oct-2026, noche)

Hecho, sin tocar HEAD, índice ni rama (`main` sigue en `b03d0fb`; `origin/main` = `03095cb`):

1. **Respaldo** en `D:/respaldo_alephia_14oct/` (parche sobre HEAD, tar de 2.094 ficheros, listas y refs).
2. **Fusión a tres bandas en el disco** (base = HEAD, nuestro = disco, suyo = `origin/main`), fichero a fichero:
   - 43 ya iguales; 9 fusionados limpios (`file_system_db.py`, `routes/documents.py`, `server.py`, `CadViewer.jsx`,
     `ContextMenu.jsx`, `App.jsx`, `GeoControlPanel.jsx`, `ImportModelModal.jsx`, `filterPresentation.js`);
   - 9 «añadidos en ambos»: en el disco son **evoluciones posteriores** de lo publicado (25–28 sep y el barrido D-24
     de hoy): se conserva el disco (`cad_review.py`, `orthophoto.py`, `05_ORTOFOTO_CANAL.md`, `AccFolderBridge.jsx`,
     `AccLinkPicker.jsx`, `CadReviewOverlay.jsx/.css`, `forwardWheelZoom.js` y su prueba);
   - 6 con conflicto, resueltos a mano: `DocumentViewer.jsx`, `MatrixTable.jsx`, `FilesPage.jsx` (colores D-24 y
     la condición `!enVista` del botón ACC: disco), `Viewer.jsx` (`forwardWheelDirectionForScope`: disco),
     `filtersCore.runtime.prueba.mjs` (disco ya contenía lo publicado y más), `AI_WORKSTATE.md` (los dos lados; las
     entradas del 24-sep publicadas no estaban en el disco). Sin marcadores en el árbol.
3. **Pruebas sobre el disco integrado:**
   - `python -m pytest -q` → 2166 passed, 2 failed (los dos históricos: `test_capacidades_con_puerta` por
     `/api/docs/miniaturas/preparar` y `test_reconstruccion_desde_cero`);
   - bancos de Docs 23/23; bancos de View 60/62 a pelo. Los otros dos no son regresiones: `b5Memory` pasa con
     `node --expose-gc`; `b5BackendPayload` espera datos por stdin y `popoutBrowser` un navegador;
   - build de Docs y de View: OK (a `scratchpad`, no a `dist/`).

Pendiente, en orden:
- ensayo contra PostgreSQL real (hay que recrear el clúster desechable);
- commits por tema en la rama local `integracion-14oct`, encima de `03095cb`, con índice temporal y lista explícita
  (sin WIP ajeno, sin protegidos, sin `Co-Authored-By`, sin CR en los blobs);
- prueba del propietario en 5183 (`dev:ensayo`); push y Manual Deploy solo con su autorización.

## 5 · Incidente de memoria en producción (14-oct-2026, 15:15–15:21 Lima)

Render reinició `visor-ecd-backend-va` tres veces por exceso de memoria (más de 2 GB) con 6 usuarios consultando.
Su registro muestra que cada caída llega 40–60 s después de que un usuario no administrador (34 o 35) abre láminas PDF,
y que para esos usuarios `POST /api/docs/mosaico` y `POST /api/docs/vista-previa/url` salían **403
`PROJECT_UNRESOLVED`** (`[authz BLOQUEADO-HUECO]`): faltaban en `RUTAS_POR_CUERPO`. Sin vista previa ni mosaico, su
lector cae al camino pesado del PDF completo. Solo el administrador de la entidad tenía el camino ligero.

- **Arreglado en local, sin commit:** `backend/perimetro_de_obra.py` (+2 rutas) y su prueba en
  `backend/tests/test_planos_para_todos.py` (22/22 en las pruebas de autorización afectadas).
- **Sin demostrar:** qué parte del camino pesado llena los 2 GB en el servidor. Medir en local con un usuario no
  administrador.
- Otras medidas de memoria, propuestas y sin hacer: no reintentar un mosaico que ya tumbó el proceso;
  `MALLOC_ARENA_MAX=2` en Render; servir la ortofoto con URL firmada en vez de cargarla entera en el proceso.
- Ruido del registro que no es la causa: `list_markups` con UUID contra una columna INTEGER (migración 32,
  aparcada por el dueño).

**Arreglo de memoria preparado (14-oct-2026, tarde):** commit `2e093d0` en la rama LOCAL `arreglo-memoria-14oct`, encima de
`03095cb` (lo desplegado), con solo 6 ficheros (`gcs_manager.py`, `mosaicos_almacen.py`, `routes/documents.py`,
`routes/uploads.py` y dos pruebas). Abrir una lámina ya no pone al servidor a dibujar; hay un solo dibujo de PDF a la vez;
la subida va por la cola de un hilo; un PDF sin miniatura ya no se manda entero. Suite sobre `03095cb` + parche: 2092
passed y los 2 fallos históricos. **Sin push.** Para desplegarlo: push de `arreglo-memoria-14oct` a `main` (avance
rápido desde `03095cb`) con su autorización, y después Manual Deploy de `visor-ecd-backend-va`.

El arreglo de las dos rutas en `RUTAS_POR_CUERPO` queda en el disco y **no** va en ese commit: desbloquearlas antes del
freno añadiría trabajo de dibujo. Pendiente: aplicar el mismo parche al disco integrado (los guiones están en
`scratchpad/integ/parche_*.py`).
