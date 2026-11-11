# 29 · Conectar Docs con el visor: los modelos y los documentos de Docs en ALEPHIA View (10-nov-2026)

El dueño: «estúdialo, analízalo y hagamos algo profesional para también conectar Docs y poder vincular nuestros
modelos de Docs».

**Estado: aprobado por el dueño el 10-nov-2026 (§5): «SÍ a los puntos 1, 2 y 3». En construcción por fases (§6).**

---

## 1 · Lo que hay hoy (medido en el código, 10-nov-2026)

### 1.1 Modelos 3D en el visor

«Importar modelo» (`frontend-react/src/components/ImportModelModal.jsx`) solo conoce dos orígenes:

| Origen | Cómo entra | Qué se guarda (`model_config`, `/api/config/project/add`) |
|---|---|---|
| **ACC** | `NativeFileTree` navega hubs → proyectos → carpetas de Autodesk | `urn` (la versión), `itemId` (el **linaje** de ACC), `versionId`, `versionNumber`, `source: "DOCS"` (Docs de **Autodesk**) |
| **Subir desde el equipo** | firma, sube a OSS y cierra (`/api/modelos/*`, `upload/finalize`) | `urn`, `source: "LOCAL"`. **Sin linaje** |

Un RVT, DWG o NWD que está en **ALEPHIA Docs** se ve en el visor CAD de Docs (`CadViewer`), pero **no se puede
federar** en el visor 3D.

Docs ya tiene casi todo lo necesario:
- cada CAD se traduce con Autodesk al subirlo (`/api/docs/cad/translate`, idempotente);
- su URN por versión queda guardado (`meta.cad.urn`);
- está en el contenedor de Autodesk de la propia aplicación, legible con el token del visor (`/api/token`), igual
  que los modelos subidos desde el equipo.

### 1.2 Documentos de Docs vinculados a elementos del modelo: **ROTO**

- El panel de documentos del visor (`DocPinPanel.jsx`, «Vincular Documento desde Nube») navega Docs bien, pero
  **guarda el vínculo llamando a `/api/docs/mutate-bind`, que ya no existe en el servidor**.
- `App.jsx` llama a la misma ruta.
- El servidor tiene su sustituta, `/api/element-docs` (`routes/element_docs.py`), pero el visor **nunca se cambió a
  ella**. Lo dice `frontend-react/ARQUITECTURA.md` §6.
- Además, esa sustituta guarda una **URL**, no el documento: no sigue su versión vigente ni comprueba el permiso de
  quien lo abre después.

### 1.3 El linaje, la pieza crítica

La regla de la casa (`docs/AI_DECISIONS.md`, D-01 a D-06): **todo lo que se persiste identifica el modelo por su
linaje**, que es estable entre versiones, y no por el URN, que es de una versión. Si esto se rompe, al subir una
versión nueva se pierden las vistas guardadas, los colores por fuente, los filtros por modelo y el inventario.

- **Visor.** Saca el linaje del URN de ACC (`linajeDeUrn`: `urn:adsk.wipprod:fs.file:vf.<x>?version=N` →
  `…:dm.lineage:<x>`) **o** de la ficha del modelo (`m.lineage || m.item_id || m.itemId`). Lo segundo ya existe en
  Saved Views (`savedViewV2.js`, `restaurarVistaV2.js`, `capturarVistaV2.js`), así que un modelo que traiga su
  `lineage` funciona sin tocar el visor.
- **Servidor.** Dos contratos **CERRADOS** solo aceptan linajes de Autodesk:
  - la identidad del inventario B1 (`backend/inventory_identity.py`, `source_identity`), que **rechaza a
    propósito** los URN que no son de ACC;
  - las Vistas guardadas V2 (`backend/vistas_v2.py`, `es_linaje`), que validan con el mismo patrón.
- **Consecuencia.** Hoy un modelo subido desde el equipo ya es de segunda: sin linaje, no entra en el inventario B1
  ni en una vista guardada V2. **Un modelo de Docs sin linaje propio sería igual de cojo.**

## 2 · Lo que se propone

### 2.1 Los modelos de Docs, un origen de primera

**En «Importar modelo», una pestaña nueva, «ALEPHIA Docs»**:
- el árbol de carpetas de la obra (el mismo de «Enlazar»);
- solo los formatos que el visor carga (RVT, DWG, DXF, NWD/NWC, IFC);
- solo lo que quien importa puede ver.

Al elegir un modelo:
1. Si su versión vigente no está traducida, se traduce con la ruta de siempre (`/api/docs/cad/translate`) y se
   espera como hoy.
2. Se elige la vista (2D/3D), con la misma ventana que ACC.
3. Se guarda en `model_config`:
   - `source: "ALEPHIA"`;
   - `fileNodeId`, el documento: **es su linaje**;
   - `lineage: "urn:alephia:docs.lineage:<fileNodeId>"`;
   - `versionId` y `versionNumber`, la versión cargada;
   - `urn`, el de esa versión.

**Reglas:**

| Regla | Por qué |
|---|---|
| **El linaje es el documento de Docs** (`urn:alephia:docs.lineage:<id>`), estable entre versiones. | La regla D-01, igual que con ACC: lo persistido no se pierde al versionar. |
| Solo documentos de **la misma obra** que el frente. | Un frente no mezcla obras. |
| **Los permisos son los de Docs**: quien no puede ver el documento no lo carga, aunque esté en el frente; se dice «sin acceso a este modelo». | El visor no puede abrir lo que Docs cierra. |
| **No se duplica**: el mismo documento no entra dos veces en un frente. | Como el guardia de ACC por `itemId`. |
| **Versión nueva en Docs**: «Buscar actualizaciones» la detecta (la vigente es otra que la cargada) y «Actualizar» la trae, la traduce si hace falta y reextrae el inventario. **No se actualiza solo**. | Mismo contrato que ACC (`check-updates` y `update`): el visor y el inventario no se desfasan. |
| Un modelo de Docs en la **papelera** o purgado: el frente lo marca «ya no está en Docs», sin romper el resto. | Como un modelo de ACC borrado. |
| Vincular, actualizar y quitar quedan en la **actividad** de la obra. | Trazabilidad. |

### 2.2 Documentos de Docs vinculados a elementos: arreglar y hacerlo bien

Al construirlo (10-nov-2026) se midió que el vínculo **ya tenía dónde guardarse**: los pines de documentos del
seguimiento de la obra (`/api/project-pins`, pin «docs», `tracking_pins.data`). Lo que lo rompía era la llamada
previa a `/api/docs/mutate-bind`: al fallar, **cortaba el guardado**. Así que:
- se quita esa llamada (en `App.jsx` y en `DocPinPanel.jsx`). Una prueba de contrato vigila que ningún fichero del
  visor vuelva a llamarla;
- cada documento se guarda **por su id de Docs** (`nodeId`) y su nombre, sin URL hecha ni repetidos
  (`utils/documentosDelPin.js`);
- se abre **siempre por Docs** (`/api/docs/view?id=…`), que sirve la **versión vigente** y **comprueba el permiso**
  de quien lo abre. Los vínculos antiguos guardados como URL se siguen abriendo por su URL;
- **sin migración**. `/api/element-docs` queda como estaba, sin usar.
- Pendiente para más adelante: que la ficha del documento en Docs diga a qué pines del modelo está vinculado.

### 2.3 Lo que hay que abrir de lo CERRADO, y solo eso

Para que un modelo de Docs sea de primera hay que **ampliar dos contratos cerrados** para que acepten un segundo
formato de linaje, `urn:alephia:docs.lineage:<uuid>`, además del de Autodesk:

1. **Identidad del inventario B1** (`inventory_identity.source_identity` y `es_linaje`). Un modelo `ALEPHIA` se
   identifica por su linaje propio, que viene de la ficha y no del URN, con el mismo control de conflicto que ya
   tiene `item_id`.
2. **Vistas guardadas V2** (`vistas_v2.es_linaje`): aceptar ese formato al validar.

Nada más cambia en esos contratos. Las pruebas cerradas siguen pasando, y se añaden las del formato nuevo.
AGENTS.md §4.4: **se reabre solo con la autorización del dueño**, por «requisito nuevo».

## 3 · Alternativa sin tocar lo cerrado (no recomendada)

Usar el «Puente temporal ACC» que ya existe: Docs copia el CAD a una carpeta de ACC y el visor lo vincula como
cualquier modelo de ACC, con su linaje de Autodesk.
- Funciona hoy, sin código.
- Pero **duplica cada modelo en ACC**, depende de ACC, que la obra quiere dejar de necesitar, y la copia de ACC no
  es la de Docs: dos verdades.

## 4 · Orden y pruebas

| Fase | Qué | Migración | Toca lo cerrado |
|---|---|---|---|
| **F1** | Arreglar «Vincular documento» del visor: guardar por documento y abrir por Docs (§2.2) | No | No |
| **F2** | Origen «ALEPHIA Docs» en «Importar modelo»: elegir, traducir, vista, `model_config` con linaje propio, permisos, duplicados, papelera (§2.1) | No | No |
| **F3** | Versiones: «Buscar actualizaciones» y «Actualizar» para modelos de Docs | No | No |
| **F4** | Inventario B1 y Vistas guardadas V2 aceptan el linaje de ALEPHIA (§2.3) | No | **Sí, con autorización** |

**Sin F4**, un modelo de Docs se carga, se federa, se alinea y se actualiza, pero, como hoy uno subido desde el
equipo, no entra en el inventario B1 ni en las vistas guardadas V2. **Con F4** es igual que uno de ACC.

**Pruebas, como siempre:**
- reglas sin base de datos;
- rutas reales contra la base desechable;
- el visor en su banco: cargar un modelo de Docs federado con uno de ACC, alineados, y vista guardada y restaurada
  tras subir una versión nueva (F4);
- las suites cerradas de Saved Views (savedViewV2, restaurarVistaV2, capturarVistaV2) y de Inventory identity
  intactas.

## 5 · Lo que decidió el dueño (10-nov-2026: «SÍ A LOS PUNTOS 1, 2 Y 3»)

1. **Por fases, de F1 a F4.**
2. **Autoriza abrir los dos contratos cerrados** (inventario B1 y Vistas guardadas V2), **solo** para que acepten el
   linaje de ALEPHIA (`urn:alephia:docs.lineage:<id>`), por «requisito nuevo» (AGENTS.md §4.4). Nada más cambia en
   ellos.
3. **Formatos:** RVT, DWG, DXF, NWD/NWC e IFC.

## 6 · Avance

| Fase | Estado |
|---|---|
| F1 | Hecha en local (10-nov-2026). Pruebas: `documentosDelPin` 4/4 (incluido el contrato «nadie llama a mutate-bind»); las suites cerradas de Saved Views y la configuración del inventario, intactas; el visor compila. No se probó en el visor real: hacerlo escribe en el seguimiento de la obra en producción. |
| F2 | Hecha en local (10-nov-2026). Pestaña «ALEPHIA DOCS» en «Importar modelo» (`ImportarDesdeDocs.jsx`) y rutas `GET /api/config/project/docs-obra` y `POST /api/config/project/add-from-docs` (`modelos_de_docs.py`). |
| F3 | Hecha en local (10-nov-2026). «Buscar actualizaciones», «Actualizar» y «Actualizar todo» para modelos de Docs, con un mismo núcleo (`_traer_version_de_docs`). |
| F4 | Hecha en local (10-nov-2026). B1 y Vistas guardadas V2 aceptan el linaje de Docs; ver §7, que difiere de §2.3 en dos puntos. **Necesita la migración 50** (la base de B1 solo admitía el linaje de Autodesk: §7.4-A). |

## 7 · Cómo quedó (10-nov-2026)

### 7.1 El recorrido

1. **Importar modelo → ALEPHIA DOCS.** Se navega la obra del frente en Docs (sus carpetas, con los permisos de Docs) y
   solo se listan RVT, DWG, DXF, NWD, NWC e IFC. No se ofrece al **reemplazar** un modelo (relink): eso sigue siendo
   de ACC.
2. **Siguiente.** Se prepara para el visor la versión vigente con la traducción de Docs de siempre
   (`/api/docs/cad/translate` y `/status`, con su guardia de plano). Si ya estaba traducida no se gasta nada. Aguanta
   los 502 pasajeros de Render (~1 min, como el lector de Docs) y el caso «el paquete con imagen adjunta falló».
3. **Vista.** Las vistas de esa versión, con la 3D elegida por defecto.
4. **Vincular al frente.** El servidor comprueba obra, permiso, formato, duplicado y que la versión vigente esté
   traducida, y escribe la ficha. **El URN, el linaje y la versión los pone el servidor, nunca el navegador.** Lanza
   la extracción del inventario y el visor sondea ese mismo trabajo.
5. **Versión nueva en Docs.** «Buscar actualizaciones» la ve; «Actualizar» y «Actualizar todo» la traen si ya está
   traducida, o la preparan y piden reintentar. La vista se lleva por su nombre (`vista_del_modelo`) y se reextrae el
   inventario. En la papelera: «ya no está en Docs», sin romper el frente.

### 7.2 F4: lo que se abrió de lo cerrado, y en qué difiere de §2.3

Se abrió **solo** lo que autorizó el dueño: que los dos contratos acepten el linaje de Docs. Dos diferencias con
lo que se escribió en §2.3, por lo que se encontró en el código:

1. **El linaje no sale de la ficha, sale del URN, preguntando a la base.** B1 se llama con el URN a secas desde más
   de diez sitios (extracción, inventario, comparador, actualizar…). El URN de Docs es un objeto del bucket de Docs,
   `docs-<id de la versión>`, sin el documento dentro, así que `source_identity` lo resuelve con `file_versions`
   (versión → documento). Es **fail-closed**:
   - otro bucket, u otro OSS (una subida «LOCAL»), sigue rechazado como antes;
   - una versión que no está en la base da `UNKNOWN_DOCS_VERSION`;
   - con `item_id`, se exige que coincida (`ITEM_LINEAGE_CONFLICT`), como con ACC.

   La relación versión → documento no cambia nunca, así que se recuerda en memoria.
2. **El URN de Docs también cuenta como identidad de versión** en las vistas guardadas. El validador reconocía una
   versión por `fs.file:vf.` o `?version=`, y el URN de Docs no lleva ninguna: un mapa de colores indexado por él
   pasaba como válido y se perdía en la siguiente versión (comprobado). Aceptar el linaje sin esto dejaba el agujero.
   La huella es estrecha, solo `os.object:<bucket>/docs-<uuid>`: los OSS de otras subidas siguen como estaban. Va en
   los dos lados, servidor (`vistas_v2.py`) y visor (`savedViewV2.js`), y el corpus compartido los mantiene iguales.

Lo que **no** cambia: el linaje de ACC y todas sus reglas; los sitios del visor que deducen el linaje del URN sin
ficha (`model.js`, `CompareView`) dan `null` para un modelo de Docs, y ahí se queda en «no se resuelve», que ya era
su comportamiento ante lo desconocido.

### 7.3 Pruebas (10-nov-2026)

| Qué | Resultado |
|---|---|
| `backend/tests/test_modelos_de_docs.py` (reglas, B1 con la versión de Docs, mismo bucket que Docs, mismo linaje en los dos contratos) | 10/10 |
| Suites cerradas del backend: `test_vistas_v2`, `test_inventory_identity_core`, `test_identity`, `test_inventory_reimport_snapshot` | 84/84 (eran 72; +6 casos nuevos del corpus, +6 de Docs) |
| Corpus compartido de persistibilidad v2 | 31 → 37 casos, los mismos veredictos en Python y en Node |
| Ensayo con las rutas reales contra la base desechable (`model_config`, `file_versions` y permisos de carpeta reales) | 23/23 |
| Visor: `capturarVistaV2` 63, `restaurarVistaV2` 150, `savedViewV2` 117 (eran 111: los 6 casos nuevos), `inventoryConfig` 20, `frenteDeVistas` 20, `documentosDelPin` 4 | todo en verde |
| `test_vista_del_modelo`: ahora exige tres comprobaciones de la vista (ACC uno, ACC todos y el núcleo de Docs), nombrando la de Docs | en verde |

**No probado:** un modelo de Docs real en el visor real, con Autodesk de verdad (traducir, cargar, extraer el
inventario, guardar una vista y restaurarla tras subir una versión). En el banco Autodesk está sustituido; en el
visor real se escribe en `model_config` de producción. Es la prueba que falta, en local, con un modelo de una obra
de prueba.

### 7.4 Revisión del 10-nov-2026: lo que estaba mal en `6fb3e0af` y cómo quedó

El dueño pidió revisarlo a fondo. Una revisión independiente (otro agente, con el código y sin mis conclusiones) y la
mía encontraron defectos reales. Todos se comprobaron antes de corregirlos, y cada corrección tiene su prueba.

| # | Defecto | Gravedad | Corrección |
|---|---|---|---|
| A | **B1 rechazaba en la BASE el linaje de Docs.** La migración 31 puso en `inventory_identity_b1.sources` un CHECK que solo admite el de Autodesk. Extraer el inventario de un modelo de Docs fallaba al escribir, y quitarlo del frente daba 503. El ensayo no lo vio porque sustituía la extracción. | **Alta** | **Migración 50** (`50_linaje_de_docs_en_b1.sql` y su rollback): el CHECK admite los dos linajes. Ensayada en la base desechable: se aplica, se puede repetir, se deshace, y como `ecd_app` se niega. El ensayo publica ahora un inventario de verdad en las tablas de B1. |
| B | «Actualizar» de un modelo de Docs se quedaba en «se está preparando» **para siempre**: la base solo pasa a «traducida» cuando alguien abre el plano en Docs. | Alta | `_estado_de_traduccion` pregunta a Autodesk cuando la base no lo sabe, y apunta el resultado. |
| C | Una traducción fallida se relanzaba (y se cobraba) en cada clic; y las versiones bajo el puente temporal ACC se traducían a sus espaldas. | Media | Una fallida se dice, con el motivo de Autodesk, y se reintenta abriéndola en Docs, como hasta hoy. El puente no se toca. |
| D | Un URN de Docs podía entrar por las rutas de ACC (`add`, `relink`) o pedir la extracción en un frente de otra obra, saltándose obra, carpeta y formato. | Media | `add` y `relink` de ACC rechazan un URN de Docs (`USA_ALEPHIA_DOCS`). La extracción solo admite un documento de Docs en un frente de **su** obra, y `/api/inventory/extract` exige poder verlo en Docs. |
| E | Vincular y actualizar guardaban **toda** la configuración: un modelo quitado mientras tanto resucitaba, y dos vínculos simultáneos del mismo documento entraban los dos. | Media | Cada ruta escribe solo su fila, en una transacción: con cerrojo por frente al vincular y con `FOR UPDATE` al actualizar. Si el modelo se quitó a la vez, lo dice y no lo crea. |
| F | Un documento **purgado** dejaba su modelo imposible de quitar del frente (B1 ya no sabía su linaje). | Media | B1 recurre a la ficha que escribió el servidor (`model_config`, `source = 'ALEPHIA'`) cuando la versión ya no existe. |
| G | «Buscar actualizaciones» no tenía `guardia_de_obra` (de antes de este trabajo), y la respuesta de los modelos de Docs se guardaba en la caché que comparten todos los usuarios. | Media | Guardia de obra en la ruta. Los modelos de Docs se miran en el hilo de la petición, con el permiso de quien pregunta, y nunca entran en la caché: quien no ve el documento no se entera de sus versiones. |
| H | Un modelo de ACC preguntaba a la base por cada modelo de Docs al extraer, y un fallo de la base habría roto también extracciones de ACC. | Baja | Un modelo de un tipo solo se compara con los de su tipo (`es_urn_de_docs`, sin base). |
| I | Pantalla. Un emoji (📁), contra la regla del dueño. Filas sin teclado. La versión sin alinear. Un listado lento se pintaba bajo otra carpeta. Cerrar a media preparación dejaba la pestaña bloqueada hasta recargar. Cerrar mientras se vinculaba dejaba el modelo vinculado sin que el visor se enterara. Espera sin tope. | Media | Iconos de la pestaña de ACC y filas que son botones (anillo de foco del sistema, también sobre la fila elegida). Cada listado lleva su turno. Las pestañas se bloquean mientras se prepara y se liberan al cerrar. El vínculo llega al visor aunque el panel se haya cerrado. Tope de 20 min. Comprobado en el banco de la pantalla (`probar-importar-docs.html`, sin commitear). |
| J | El listado de Docs firmaba una descarga por fichero que el selector no usa (en carpetas grandes, lento). | Baja | `/api/docs/list?enlaces=0`: el selector no las pide; el resto, igual. |
| K | El aviso «hay versión nueva» de un modelo de Docs no se limpiaba al actualizarlo (le faltaba `urn`). «Actualizar» y «quitar» no quedaban en la actividad. Nada decía «ya no está en Docs». | Baja | Con `urn`; la actividad de la obra anota vincular, actualizar y quitar; el panel de modelos dice «Ya no está en ALEPHIA Docs». |

**Lo que NO se cambió, y por qué (decisión del dueño):**
- **Ver un modelo de Docs ya federado no mira el permiso de su carpeta en Docs.** Pasa igual que con los de ACC: lo
  ve quien entra en el frente. §2.1 prometía «quien no puede ver el documento no lo carga»; hacerlo de verdad toca la
  carga del visor (`Viewer.jsx`, con trabajo ajeno sin commitear) y, además, el token del visor ya abre cualquier URN.
  Hoy el permiso de Docs se exige al **vincular, actualizar, extraer y preguntar por versiones**. Si se quiere que
  tampoco se cargue, es una decisión aparte.
- **Si la reextracción de un modelo de Docs falla tras «Actualizar», el visor pierde la correspondencia de su
  inventario hasta que se repita** (`model.js` deduce el linaje del URN, y el de Docs no se puede deducir). Con ACC se
  conserva. Se arregla dando al visor el linaje desde la ficha; `model.js` tiene trabajo ajeno sin commitear.
- Las rutas de ACC siguen guardando la configuración entera (defecto E, que es suyo de antes); solo las de Docs se
  corrigieron.

**Orden de publicación (cambia):** **migración 50** como `ecd_migrator` → backend → visor. Sin la 50, vincular un
modelo de Docs funciona pero su inventario no se guarda, y quitarlo del frente da 503.

### 7.5 Pruebas tras la revisión (10-nov-2026)

| Qué | Resultado |
|---|---|
| `test_modelos_de_docs.py` (+ estado de la traducción, puente, fallida, sin manifiesto, visibilidad, `es_urn_de_docs`) | 15/15 |
| `test_actualizaciones_compartidas.py` (+ «solo quien entra en la obra pregunta por sus versiones») | en verde |
| Ensayo con rutas y tablas reales en la base desechable, con la migración 50 (incluye R1–R8: Autodesk terminó y la base no lo sabía, fallida sin relanzar, duplicado bajo cerrojo, quitado durante la actualización, permiso al buscar versiones, URN de Docs por ACC, extracción de otra obra y sin permiso, documento purgado que se quita) | 40/40 |
| Migración 50: aplicar, repetir, deshacer, volver a aplicar, y negarse como `ecd_app` | correcto |
| Banco de la pantalla: carpeta lenta y rápida, teclado, contraste de la fila elegida, cerrar a media preparación, cerrar mientras se vincula | correcto |
| Suites cerradas del visor (63, 150, 117, 20, 20, 4) | en verde |

### 7.6 Corrección del 11-nov-2026: la identidad del inventario en el visor

Defecto de F4 (`6fb3e0af`), encontrado al trabajar el inventario de modelos pesados. El servidor (B1) y las vistas
guardadas aceptaban el linaje de Docs, pero `frontend-react/src/lib/inventoryIdentity.js` seguía aceptando solo el de
ACC. Para un modelo federado desde Docs, cada fila del inventario salía **sin identidad**:

- no se podía editar («La fila no tiene identidad verificable»);
- su clave era la de solo lectura, no `[frente, linaje, externalId]`, que es la que usan Filters y el servidor.

`inventoryIdentity` acepta ahora los dos linajes, con la misma regla que `lib/savedViewV2.js` y
`backend/vistas_v2.py`. Una versión, un id suelto, un id en mayúsculas o con espacios siguen sin identidad.

Evidencia: `node frontend-react/pruebas/identidadDeDocs.prueba.mjs`, 19/19; con el fichero anterior la misma fila
da identidad nula. **No verificado con un modelo de Docs real en el visor**: hace falta la sesión del dueño.
