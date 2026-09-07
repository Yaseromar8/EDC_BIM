# AI_DECISIONS.md — decisiones congeladas

> **Reabrir una decisión FROZEN sólo por:**
> 1. **regresión reproducible**,
> 2. **requisito nuevo autorizado por el propietario**,
> 3. **evidencia técnica que invalide la premisa original**.
>
> Cualquier otra cosa —preferencia de estilo, «yo lo haría distinto», un
> refactor de paso— **no** es motivo. Si crees que una decisión está mal,
> escribe cuál de las tres puertas usas y con qué prueba. No la cambies primero.

Esto **no** es el historial del proyecto: es la lista de lo que ya se discutió y
se cerró, para que ningún agente lo vuelva a discutir desde cero. El estado de
hoy está en [`AI_WORKSTATE.md`](AI_WORKSTATE.md); las reglas de trabajo, en
[`../AGENTS.md`](../AGENTS.md).

---

## A · Identidad de modelos APS

### D-01 · La identidad de modelo que se persiste es el **linaje**
Un URN de APS **codifica la versión** del documento. Guardar un URN significa
guardar «la versión que estaba cargada aquel día»: al subir una revisión, todo
lo que apuntaba a ella queda huérfano en silencio. El linaje
(`urn:adsk.wipprod:dm.lineage:…`) es estable entre versiones.
**Todo lo que se persiste identifica por linaje.**
*Vive en* `frontend-react/src/lib/savedViewV2.js` (`linajeDeUrn`).

### D-02 · El URN es identidad **de runtime**, no identidad semántica persistida
Dentro de la sesión el URN sigue siendo la clave legítima: es lo que el LMV
entiende y con lo que se indexan modelos cargados, Rosetta y mapas de color. Lo
que no puede es cruzar la frontera de la persistencia. La traducción
linaje ⇄ URN ocurre **en los bordes**: al capturar (URN → linaje) y al restaurar
(linaje → URN vigente).

### D-03 · `seedUrn` se normaliza al URN **exacto** que está cargado
Un `seedUrn` con distinto padding, distinto `?version=` o distinta forma base64
no es «casi» el mismo modelo: rompe el emparejamiento. Al capturar se normaliza
al URN literal del modelo cargado.
*Vive en* `capturarVistaV2.js`.

## B · Contrato de Saved Views V2

### D-04 · `Standard::Sources` persiste **linajes**, no URNs
`Standard::Sources` es la columna de filtro que dice «de qué modelo viene este
elemento». Es la única selección de filtro cuyos valores son identidades de
modelo, así que es la única que se traduce a linaje al guardar y de vuelta a URN
al restaurar. Las demás columnas se copian tal cual.
*Vive en* `savedViewV2.js` (`PROP_SOURCES`).

### D-05 · Los colores por fuente (*source colors*) también persisten **linajes**
Mismo motivo que D-04: un color asignado «al modelo de drenaje» debe seguir
siendo del modelo de drenaje después de subir la revisión C. Los colores por
valor (`valueColors`, con clave `propId::valor`) **no** son identidades de
modelo y se guardan tal cual.

### D-06 · `models[].visible` es la **fuente canónica** de visibilidad
La visibilidad de un modelo se declara en el documento, en `models[]`, y no se
deduce de listas laterales de ocultos. Corolario aplicado: al capturar,
`hiddenModelLineages` se restringe a los linajes que **están** en `models[]` —
un linaje oculto que no forma parte de la vista no tiene por qué viajar en ella.

### D-07 · Nunca `isolate()` con conjunto vacío durante una restauración
`viewer.isolate([], model)` **no** es «no aislar nada»: en el LMV vacía el
aislamiento y destruye el `objectSet` que se acaba de restaurar. La rama de
«filtros vacíos» debe abstenerse mientras hay una restauración V2 en curso; el
guardia es `window.__restaurandoVistaV2`.
*Vive en* `frontend-react/src/components/Viewer.jsx`.

### D-08 · `globalOffset` se compara contra el **modelo base `order = 0`**
En una federación, el marco espacial lo impone el primer modelo que carga; los
demás lo heredan. Leer el offset de `viewer.model` da «el modelo que el visor
tenga por activo en ese instante», que no es una definición. Se toma del modelo
declarado `order = 0` y se guarda en `federation.globalOffsetAtSave`. La
tolerancia se pregunta al modelo (`getUnitScale`), no se fija a ojo.

## C · Compatibilidad V1 → V2

### D-09 · Una vista **V1 no se reescribe automáticamente**
Abrir, ver o compartir una V1 no la convierte. Migrar en silencio los documentos
de un usuario es una escritura no pedida sobre datos reales de obra, y no hay
vuelta atrás por fila. Una V1 se abre por su propio camino y sigue siendo V1.

### D-10 · «Guardar como» desde una V1 crea una **V2 nueva**
Es la única vía de migración, y es explícita y del usuario: se crea un
documento nuevo con `id` nuevo y `schemaVersion = 2`, y **la V1 original queda
intacta**.

### D-11 · V2 es el **camino por defecto**
`VITE_SAVED_VIEWS_V2_RESTORE` cambió de sentido en E-7: era un interruptor de
encendido y pasó a ser uno de apagado (`=false` apaga). El código V1 **no se
retira**: así, un despliegue que salga mal se revierte poniendo una variable, sin
tocar una línea y sin esperar a un commit.
*Vive en* `restaurarVistaV2.js` (`restauradorV2Activo`).

## D · Compartir

### D-12 · La capacidad pública es `share_token`, **no** `saved_views.id`
El identificador de una vista y el permiso para verla sin sesión son dos cosas
distintas. Mientras el enlace público fuera el `id`, conocer el id era poder
leerla. Se separan: `GET /api/views/shared/<clave>` es la ruta pública, y
`GET /api/views/<view_id>` **exige sesión**. Las rutas están separadas para que
no haya ambigüedad de resolución.
*Vive en* `backend/routes/views.py` y `backend/auth_middleware.py`.

### D-13 · Los enlaces *legacy* viven **sólo por política explícita**
Los enlaces históricos que usaban el `id` siguen funcionando únicamente mientras
`ENLACES_LEGACY_HASTA` lo permita, y esa variable es un punto contado de la
postura de seguridad (`/api/health`). Cuando se cierre, esas URLs devolverán
**410**, no 404: la diferencia entre «retirado» y «no existe» importa para quien
tenga el enlace en un correo de hace meses.

## E · Restauración

### D-14 · La restauración V2 se gobierna por **señales**, nunca por temporizadores
Antes dependía de dos plazos de 500 y 1500 ms elegidos a ojo: a veces llegaban
tarde —la vista se abría a medias sin que nadie lo dijera— y siempre llegaban
pronto de más. El pipeline `E0…E9` avanza por eventos reales
(`viewer-ready`, `modelAdded`, `viewerStateRestored`, `inventory-ready`,
`geometryLoaded`, `cameraTransitionComplete`, `finalFrameRenderedChanged`).
**Prohibido**: `viewer-geometry-loaded` como disparador, «el primer modelo»,
temporizadores, 500/1500 ms y *polling*. Los techos que existen son **techos de
seguridad**: cuando uno vence la restauración sigue, se marca *degradada* y el
parte dice cuál venció.

### D-15 · «Preparado» = cargado **+** linaje resuelto **+** Rosetta poblada
Un modelo cargado sin su Piedra Rosetta todavía no sirve para traducir
identidades, así que no cuenta como listo — pero **tampoco se vuelve a pedir**:
ya viene de camino. La distinción **requerido vs preparado** es la que gobierna
el arranque, no el número de modelos.

### D-16 · El cargador normal del visor es el **único** cargador
La restauración no carga modelos por su cuenta ni abre una vía paralela: pide al
cargador de siempre (`viewer-request-models`) y espera. Dos cargadores para el
mismo modelo es la receta de la doble carga y del estado imposible de razonar.

### D-17 · La preparación del Inventory es una **barrera local**, no un requisito de arranque
Exigir el inventario para *empezar* habría bloqueado E0–E4, que no lo necesitan.
Se espera donde de verdad hace falta (E5) y con su propio techo. Y
**`null` ≠ `[]`**: cero filas es un inventario listo y vacío; ausencia es otra
cosa. Si empieza una restauración B, la A en curso se cancela.

### D-18 · Se distingue **readiness lógica** de **readiness visual**
El techo del último fotograma se cuenta desde un momento en el que el fotograma
puede ocurrir de verdad. Subir el número no arregla nada: si se mide desde un
instante en que aún no hay geometría, el techo mide otra cosa.

## F · Alcance y plataforma

### D-19 · La configuración canónica del Inventory vive **fuera del panel**
Mientras vivía dentro del componente del panel, sólo existía si el panel estaba
montado: guardar una vista con el panel cerrado guardaba una configuración
distinta. Se extrajo a `frontend-react/src/lib/inventoryConfig.js`.

### D-20 · **4D / 5D / AR quedan fuera de Saved Views**
LOB, Predict, el holograma de movimiento de tierras y la AR de obra lineal
tienen su propio estado y su propio ciclo. No entran en el documento V2 ni en su
restauración.

### D-21 · Se mantiene **LMV 7.x**
El visor de Autodesk se queda en la serie 7 (verificado sobre 7.126). Todas las
constantes de eventos usadas están comprobadas contra esa versión. Subir de
serie mayor es un proyecto con su propio ensayo, no un cambio de dependencia.

## G · Base de datos

### D-22 · Las migraciones 29 y 30 son **aditivas**, y su rollback no es el camino normal
Cada una añade lo suyo, y no se mezclan:

- **`29_saved_views_v2.sql`** — seis columnas en `saved_views`:
  `schema_version`, `state`, `updated_at`, `created_by`, `thumbnail`,
  `description`.
- **`30_saved_views_share_token.sql`** — cuatro columnas: `share_token`,
  `legacy_enlace`, `legacy_accesos`, `legacy_ultimo_acceso`; y el **índice
  UNIQUE parcial `ux_saved_views_share_token`**
  (`ON saved_views (share_token) WHERE share_token IS NOT NULL`): dos vistas no
  pueden compartir token, pero cualquier número de vistas puede no tener
  ninguno.

Ninguna de las dos borra ni reescribe filas. Existen sus `*_rollback.sql`, pero
**el rollback normal de un despliegue es revertir el código**: las columnas
nuevas no estorban al código viejo.

### D-23 · Restaurar una copia **anterior a E-4D** rompe los enlaces históricos
`legacy_enlace` no existía antes de E-4D, así que una restauración de aquellas
copias deja esa columna en su `DEFAULT` nuevo y las siete vistas históricas
pierden su condición de *legacy*. Es una deuda conocida de recuperación, no un
fallo del esquema. Ver `AI_WORKSTATE.md → KNOWN BACKLOG`.
