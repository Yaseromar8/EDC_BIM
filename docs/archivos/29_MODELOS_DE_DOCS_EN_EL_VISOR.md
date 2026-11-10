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
| F2 | Pendiente |
| F3 | Pendiente |
| F4 | Pendiente |
