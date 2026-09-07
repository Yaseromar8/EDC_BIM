# AI_WORKSTATE.md — dónde estamos ahora

> Fotografía del estado **real**, leída del repositorio y de producción el
> **6-sep-2026**. No es memoria de conversación: cada dato de aquí se midió con
> un comando y el comando se indica. Si el repositorio contradice este fichero,
> **manda el repositorio** y el protocolo es STOP / STATE DIVERGENCE
> (`../AGENTS.md § 9`).
>
> Reglas de trabajo → [`../AGENTS.md`](../AGENTS.md) ·
> Decisiones congeladas → [`AI_DECISIONS.md`](AI_DECISIONS.md)

---

## PROJECT

**ALEPHIA View** (visor 3D/BIM, `frontend-react`) dentro del CDE de ALEPHIA,
junto a **ALEPHIA Docs** (`frontend-docs`) y el backend Flask (`backend`).
Repositorio `Yaseromar8/EDC_BIM`.

## BRANCH / HEAD

| Campo | Valor |
|---|---|
| Rama esperada | `main` |
| **CODE BASELINE HEAD** | **`3e413cd`** (`3e413cd880fa1093afc4b4759422044e4642c2d6`, 6-sep-2026 15:09 -05) |
| Current HEAD | **consultar en vivo con `git rev-parse HEAD`. No se incrusta aquí.** |
| Production code baseline | `3e413cd` — backend y frontend desplegados corresponden a este commit |
| Handoff protocol introduced after baseline | **Sí** |

### Qué es `CODE BASELINE HEAD` y por qué no se escribe el HEAD actual

- Es el **último commit funcional desplegado**: el último que cambia código de
  producto. `3e413cd` cierra Saved Views 2.0 (E-7).
- **Producción corresponde a ese baseline**, backend y frontend
  (`/api/health` → `version 3e413cd880fa`; el bundle servido lleva las marcas de
  E-5/E-6/E-7).
- Por encima del baseline **pueden existir commits exclusivamente de
  documentación / handoff**. No mueven producción y **no** son una divergencia:
  el baseline sigue siendo ancestro del HEAD.
- **`CURRENT HEAD` se obtiene siempre en vivo** con `git rev-parse HEAD` y
  **no se incrusta como requisito autorreferencial**. Escribir aquí el hash del
  commit que contiene este fichero es circular: cambiarlo cambia el commit, y
  cambiar el commit cambia el hash. Por eso lo que se verifica es
  **ascendencia**, no igualdad —
  `git merge-base --is-ancestor 3e413cd HEAD` — según `../AGENTS.md § 9`.
- `origin/main` iba en `3e413cd` cuando se midió, y **se queda ahí hasta que el
  propietario autorice el push**. Que el local vaya por delante en commits
  documentales es lo esperado, no una anomalía.

Historia funcional hasta el baseline:

```
3e413cd feat(saved-views/e-7): make the v2 pipeline the default path
e3290ec feat(saved-views/e-6): capture and save canonical v2 views
0fc4a4a feat(saved-views/e-5): add deterministic v2 restore pipeline
87d149b fix(saved-views/e-4d): make shared capability route unambiguous
0a32cdf feat(saved-views/e-4d): separate shared view identity from public capability
f756c58 feat(saved-views/e-4c): enforce project scope and view ownership
c685992 feat(saved-views/e-4b): add validated v2 write contract
34ef8f7 feat(saved-views/e-4a): split saved view list and detail contracts
cabcfd2 feat(saved-views/e-3): signal models only when identity is ready
02efa47 feat(saved-views/e-2): el contrato v2, entero y sin acercarse al visor
56fd35e feat(saved-views/e-1): la configuracion del inventario deja de vivir en el panel
ae364dd feat(saved-views/e-0): seis columnas para v2, y ni una fila tocada
```

## PRODUCTION

Medido con `curl` y `psql` el 6-sep-2026. Los tres servicios tienen
**Auto-Deploy OFF**: un push no publica nada.

| Servicio | Estado medido |
|---|---|
| Backend `visor-ecd-backend` | `GET /api/health` → `status ok`, `rama main`, **`version 3e413cd880fa`**, `configuracion.completa true`, `puntos 7`, `faltan 0` |
| Visor `visor.alephia.com.pe` | HTTP 200, sirviendo `assets/index-QbvxFLR_.js`. **Verificado por contenido**, no por el panel: el paquete servido contiene `SAVED_VIEWS_V2_RESTORE` (E-7), `saved-view-request-capture`, `globalOffsetAtSave`, `hiddenModelLineages` (E-6), `viewer-ready`, `inventory-ready` y `restaurandoVistaV2` (E-5). Es decir, corre el código de `3e413cd` |
| Portal `alephia.com.pe` | HTTP 200, `assets/index-TqLeehpb.js`. **No se tocó** en este ciclo |

**Migraciones aplicadas** (no hay tabla de registro; se verifica por forma del
catálogo, como `ecd_migrator` con `default_transaction_read_only=on`):

- **`29_saved_views_v2.sql`** — seis columnas en `saved_views`, las seis
  presentes: `schema_version`, `state`, `updated_at`, `created_by`,
  `thumbnail`, `description`.
- **`30_saved_views_share_token.sql`** — cuatro columnas, las cuatro presentes:
  `share_token`, `legacy_enlace`, `legacy_accesos`, `legacy_ultimo_acceso`; más
  el **índice UNIQUE parcial `ux_saved_views_share_token`**
  (`ON saved_views (share_token) WHERE share_token IS NOT NULL`), presente.

Las diez columnas y el índice se leyeron del catálogo de producción. Ninguna
columna de la 30 pertenece a la 29.

**Datos de `saved_views` en producción:**

```
total = 7   ·   schema_version 1 = 7   ·   schema_version 2 = 0
legacy_enlace = TRUE en las 7   ·   share_token = NULL en las 7
```

Las 7 vistas históricas conservan **id y md5 idénticos** a la huella tomada
**antes** de migrar (`md5(viewer_state ‖ filter_state ‖ config)`):

| id | nombre | md5 |
|---|---|---|
| `0RA5vWbQiA6qsntpKULDgRRJby-sqWUt` | VISTA INTERFERENCIAS | `a1ce19f0bb84d3b585ebcdc74be0020c` |
| `1772810849105` | 03_AVANCE_MARZO01 | `117a82615dabbae5d78016e08fd1d1c3` |
| `1772810997605` | 01_AVANCE_SEMANAL_MARZO | `4c2e926303875b2d64c565eb2e03d47c` |
| `1772811167363` | 01_AVANCE_MARZO_DU | `36a7a2fd78e82ea5922bae29a2529e7f` |
| `1U9irfuzspSArzPSxnFVLrTMza3S1NO1` | DRENAJE_URBANO | `a37974069caf9e3a1d9ca3fd597e2e43` |
| `K_fYpWc6bxAwndkSOrEIlsXrMB0c9d8l` | CANAL_JESUS_MARIA | `acc639d21ed6d89d2ba4cbb175849c28` |
| `O01yez4jOkPGEfOf4i1CjsH_BsVV0Oao` | ALCANCE | `08e158338e7ebd3b06303caac74d15a9` |

## CURRENT STATUS

**Saved Views 2.0 = CLOSED / PRODUCTION GREEN.**

**FILTERS CORE — B1 = EN CURSO. Primera unidad de identidad conectada: GREEN
y commiteada localmente.** El propietario levantó el STOP de frontera protegida
y autorizó `LOB4DExtension.js`, `backend/routes/lob4d.py` y
`backend/routes/compare.py`. Tres seams cualificados por `(Source, externalId)`,
7/7 en el ensayo de rutas reales y 12/12 en el banco del 4D, cuatro mutantes
muertos, suite backend de vuelta a su línea base.

**PROTECTED IDENTITY HARDENING GREEN.** El seam que motivó el STOP
—`buildParamPhaseIndex`— y sus dos equivalentes —`buildSubZoneLabels` y el
respaldo de `buildZoneHoverIndex`— quedan cualificados por `(Source, externalId)`
con rebind por linaje. La búsqueda residual sobre los tres ficheros autorizados
no encuentra otro consumidor de Inventory que resuelva por externalId global.
[STOP original, ya levantado](filters/B1_INTEGRATION_PROTECTED_STOP.md).
No B1 PASS: quedan los pendientes de B1 que no son de identidad. No push,
deploy ni B2.

## LAST COMPLETED

**B1 · cierre de la identidad en los consumidores protegidos, 7-sep-2026: GREEN.**
Tres seams más, del mismo tipo y con la misma regla:

- `buildParamPhaseIndex` construía un `Map externalId → valor` global —la última
  fila leída ganaba— y luego lo consultaba en TODOS los modelos, así que la fase
  de una Source pintaba elementos de otra. Ahora los valores se agrupan por
  Source y cada grupo se resuelve contra su propio documento.
- `buildSubZoneLabels` tenía exactamente el mismo patrón con las zonas: mapa
  global por `row.dbId` aplicado a todos los modelos.
- `buildZoneHoverIndex` ya resolvía bien el camino principal, pero conservaba el
  respaldo prohibido: cuando el URN de la fila no era el de ningún modelo
  cargado —lo que ocurre siempre al versionar— recorría los modelos y se quedaba
  con el primero que tuviera ese externalId.

Los tres comparten ahora `indiceDeDocumentos`, `claveDeSource` y `urnDeFila`:
URN exacto → mismo linaje → nada. No hay rama de «el primero que lo tenga».


**B1 · identidad cualificada en los consumidores 4D/5D, 7-sep-2026: GREEN.**
Tres seams, ninguna fórmula ni algoritmo tocado:

- `LOB4DExtension.setElementLinks` caía al **primer** modelo que tuviera el
  externalId cuando el `source_urn` del enlace no coincidía —lo que pasa
  **siempre** al versionar, porque el URN lleva la versión pegada—. Ahora
  resuelve por linaje: URN exacto → mismo documento → nada. Dos versiones del
  mismo documento cargadas a la vez es ambigüedad, y no se elige ninguna.
- `compare.py`: la identidad de cada lado pasa a ser `(source_urn, external_id)`.
  Con la clave vieja un scope `sources` fundía dos elementos y el metrado de uno
  **sustituía** al del otro —pérdida, no mezcla—. `LIMIT 1` sin orden en el
  detalle → resolución sólo si la identidad es una. `byElement` conserva su forma
  y omite el ext ambiguo en vez de publicarlo como si fuera de un solo documento.
  **El algoritmo de diff no se tocó.**
- `lob4d._derive_locations_from_model`: `GROUP BY (source_urn, external_id)`.
  Latente hoy —el `UNIQUE(model_urn, external_id)` impide la colisión dentro de
  un frente—, y con el frente actual los grupos y los rangos son idénticos.

Además, defecto L1 ajeno al alcance corregido: `test_gap11core_issues` hacía
`io.open` sobre los subdirectorios de `backend/sql/` y desde que existe
`sql/candidates/` fallaba con `PermissionError` — **dejaba de comprobar nada**.
Filtrado a `.sql`, que es lo que aplica `aplicar_migraciones.py`.

**7-sep-2026 — frontera comprobada antes de integrar: B1 BLOCKED.**
Método real protegido LOB4DExtension.buildParamPhaseIndex, extraído sin cambios
y ejecutado en memoria con mapas LMV simulados: control IDs distintos PASS;
mismo externalId, orden invertido y dato humano sólo en A producen tres
mezclas. Sin DB/Viewer ni producto modificado. No repite censo/colisión backend.
La base endurecida aprobada 29/29 sí está presente. 14/14 mutantes es evidencia
de Claude, no una ejecución nueva. Ver [informe](filters/B1_INTEGRATION_PROTECTED_STOP.md).
La nueva autorización permite commits locales GREEN, pero este checkpoint
BLOCKED se deja sin commit. Los candidatos aprobados no se sobrescriben.

**Puerta backend de B1, 6-sep-2026: BACKEND IDENTITY READY (sólo auditoría).**
Identidad elegida: (frente exacto, linaje APS, externalId original), con
snapshots separados. Copia aislada: 20.361 assets / 12 configs / 7 user data;
cero duplicados supervivientes dentro de frente NO descarta pérdida histórica.
2.146 externalIds en dos frentes; siete user data sin identidad demostrable,
propuestos para conservar sin asignar/revisión, no modificados. T1–T10 y
15 controles adicionales PASS; seis tablas shadow, SQL candidato sin número
y servicio desconectado. Censo y prototipo en clústeres nuevos detenidos.
Ver [informe canónico](filters/B1_BACKEND_IDENTITY_RESULTADOS.md),
[contrato](filters/B1_BACKEND_IDENTITY_CONTRACT.md),
[mapa](filters/B1_IDENTITY_USAGE_MAP.md) y
[rollout/rollback NO ejecutado](filters/B1_IDENTITY_ROLLOUT.md).
Doce archivos nuevos sin commit; los nueve B1 previos y cuatro M ajenos
conservan hashes 13/13. No repetir censo/investigación ni seguir optimizando.

**Investigación Filters, 6-sep-2026: FILTERS BENCHMARK READY, aprobado por el propietario.**
Informe definitivo: [Tandem vs ALEPHIA / contrato y plan](filters/FILTERS_BENCHMARK.md).
Takeover STATE MATCH en `main`; baseline `3e413cd`, HEAD observado
`cf7a845b8512260c746e316b36f07ddad88c7e40`. Investigación de código y fuentes
oficiales, reproducciones puras en memoria y mediciones sintéticas. El cierre
aprobado incorpora tres decisiones: resultado explícito (predicados/estado/
revisión/matches); color cancelable y determinista sin aprobar exclusividad;
puerta B1 de colisión source/externalId en BD desechable con tres salidas.
**Sólo documentación commiteada; ningún cambio de código, ejecución de B1,
push, deploy ni acceso a DB real.** READY no significa Filters corregido.
Saved Views sigue CLOSED. No repetir la investigación Tandem.

Saved Views 2.0, de E-0 a E-7:

- **E-0…E-7 cerrados**: columnas, contrato V2, señal de modelos, contratos de
  lectura/escritura/alcance/compartir, restaurador determinista, capturador
  canónico y V2 como camino por defecto.
- **Migraciones 29 y 30** aplicadas a mano como `ecd_migrator`, aditivas.
- **Backend y frontend desplegados** en `3e413cd` (Manual Deploy; el portal no
  se tocó).
- **Smoke P7 verde**: las dos vistas V2 de prueba (`zz_P7_produccion`,
  `zz_P7_saveas`) se crearon, se verificaron y **se borraron** dentro de una
  transacción con guarda de reversión.
- **Las 7 V1 históricas, intactas**: mismos ids, mismos md5, las 7 siguen
  `legacy_enlace = TRUE`.
- **`ENLACES_LEGACY_HASTA=abierto`** en Render, confirmado indirectamente por
  `/api/health` (`ENLACES_LEGACY_DECIDIDA` es el 7.º punto de la postura y
  `faltan = 0`).

## EXPECTED WORKTREE

El worktree **está sucio a propósito**. Nada de lo que sigue pertenece al
trabajo cerrado, y **nada de esto se limpia, se añade ni se commitea**.

### Modificados (`M`) — 4 ficheros, +566 / −116

| Fichero | Qué es | Trato |
|---|---|---|
| `frontend-react/src/aps/extensions/LOB4DExtension.js` | 4D/LOB en vuelo del propietario | **PROTEGIDO** |
| `frontend-react/src/components/ViewerLabelsBar.jsx` | ídem | **PROTEGIDO** |
| `frontend-react/src/lib/predictBim.js` | ídem | **PROTEGIDO** |
| `frontend-react/src/components/Viewer.jsx` | **+48 líneas que NO son de Saved Views**: cablean `registerViewerFacade` desde `../aps/viewer/ViewerFacade` (fichero **untracked**), más tres guardas `facadeVisibilityRef`. Lo de Saved Views que hay en este fichero (`viewer-ready`, `__visorListo`, `__restaurandoVistaV2`, `viewer-request-models`) **ya está commiteado** en `3e413cd` | **NO commitear tal cual** — ver DIVERGENCIA 1 |

### Untracked — 28 entradas

- **Trabajo ajeno al task actual / protegido:**
  `frontend-react/src/aps/viewer/` (`ViewerFacade.js`, `README.md`),
  `frontend-react/pruebas/viewerFacade.prueba.mjs`,
  `frontend-react/src/assistant/`
- **Respaldos históricos del 4D (no borrar):**
  `…/LOB4DExtension.js.bak.20260813_antescolor`,
  `…/LOB4DExtension.js.bak.20260813_predict`,
  `…/LOB4DExtension.js.roto.20260813_mapa`,
  `…/ViewerLabelsBar.jsx.bak.20260810_campo`,
  `…/ViewerLabelsBar.jsx.bak.20260813_costos`,
  `…/ViewerLabelsBar.jsx.bak.20260813_legible`
- **Ficheros de obra y hojas de cálculo:**
  `4D LOB Progress - Standalone.html`, `500125-PQ08-LB00_R00_SEM26-1.xml`,
  `DURACIONES LB00_R00.xlsm`,
  `Metrados RIBA 5 - Paquete 8_SINOHYDRO_V03.xlsx`, `PDF/`, `excel_dump.json`
- **Guiones sueltos de la raíz:** `build_schedule.py`, `check_json.py`,
  `fix_newlines.py`, `read_excel.py`, `safe_fix.py`, `verify_json.py`
- **Banco de primitivas / build alterno:**
  `frontend-docs/probar-primitivas.html`,
  `frontend-docs/src/probar-primitivas.jsx`,
  `frontend-react/probar-primitivas.html`,
  `frontend-react/src/probar-primitivas.jsx`,
  `frontend-react/vite.banco.config.js`, `frontend-react/dist-banco/`
- **Evidencia del ensayo de restauración del 6-sep:**
  `docs/entidad/evidencias/ensayo-restauracion-20260906-1804.json`

`AGENTS.md`, `docs/AI_WORKSTATE.md` y `docs/AI_DECISIONS.md` **ya están
versionados** (commits documentales por encima del baseline). No aparecen como
untracked.

`frontend-react/.env.local` existe y **está ignorado por git**. Contiene
configuración local. **No leer, no copiar, no commitear.**

### Documentación de Filters — versionada, no suciedad esperada

`docs/filters/FILTERS_BENCHMARK.md` y este `docs/AI_WORKSTATE.md` forman la
entrega exclusivamente documental `docs(filters): freeze benchmark and target contract`.
El informe se trasladó de `docs/filters-benchmark/report-source.md`; no quedan
dos copias canónicas. El benchmark permanece versionado e intacto.
Los cuatro modificados de código y las 28 entradas untracked anteriores
permanecen ajenos, intactos y con la misma protección.

### Trabajo propio B1 — esperado SIN COMMIT, pendiente de auditoría

Además de los cuatro M y 28 entradas ajenas anteriores:

- M `docs/AI_WORKSTATE.md`: estado WIP, evidencia y próxima decisión.
- Nuevos `backend/herramientas/ensayo_filters_b1_identidad.py`,
  `docs/filters/FILTER_RESULT_B1.md`, `docs/filters/B1_RESULTADOS.md`,
  `docs/filters/evidencias/B1_BACKEND_IDENTITY.json`,
  `docs/filters/evidencias/B1_NODE_BASELINE.json`,
  `frontend-react/pruebas/filtersCore.prueba.mjs`,
  `frontend-react/pruebas/filtersCore/fixture.mjs`,
  `frontend-react/pruebas/filtersCore.interacciones.prueba.mjs`,
  `frontend-react/pruebas/filtersCore.baseline.mjs`.

Son nueve archivos nuevos de pruebas/documentación, NO implementación de
Filters. El propietario exige auditoría antes de commit. Índice vacío.
Los cuatro M ajenos mantienen los SHA256 previos, +566/-116; no incluirlos.
No tomar los untracked propios de B1 declarados aquí como divergencia nueva.

### Ampliación propia — BACKEND IDENTITY GATE, SIN COMMIT

Además de los nueve archivos anteriores, **12 nuevos** autorizados para el
prerrequisito backend (no B2), pendientes de auditoría:

- `backend/herramientas/censo_filters_b1_identidad.py`
- `backend/herramientas/ensayo_filters_b1_identidad_candidata.py`
- `backend/prototypes/inventory_identity_b1.py`
- `backend/sql/candidates/inventory_identity_b1.sql`
- `backend/sql/candidates/inventory_identity_b1_rollback.sql`
- `docs/filters/B1_BACKEND_IDENTITY_CONTRACT.md`
- `docs/filters/B1_BACKEND_IDENTITY_RESULTADOS.md`
- `docs/filters/B1_IDENTITY_USAGE_MAP.md`
- `docs/filters/B1_IDENTITY_ROLLOUT.md`
- `docs/filters/evidencias/B1_IDENTITY_CENSUS.json`
- `docs/filters/evidencias/B1_IDENTITY_CENSUS_HINTS.json`
- `docs/filters/evidencias/B1_IDENTITY_PROTOTYPE.json`

M propio sigue siendo únicamente `docs/AI_WORKSTATE.md`. Git puede agrupar
untracked por directorio; no autoriza adoptar todo prototypes/ o candidates/.
Ningún archivo funcional versionado fue modificado por esta ampliación.
Índice vacío; no numeración definitiva, ni migración sobre tablas public.

### Artefactos esperados del diagnóstico de frontera — 7-sep, SIN COMMIT

Además de los 9+12 archivos propios anteriores:

- `docs/filters/B1_INTEGRATION_PROTECTED_STOP.md`
- `docs/filters/evidencias/B1_PROTECTED_BOUNDARY_REPRO.cjs`
- `docs/filters/evidencias/B1_PROTECTED_BOUNDARY.json`

M propio: `docs/AI_WORKSTATE.md`. Ningún cambio de producto en este ciclo.
Los candidatos/evidencia previos contienen el hardening aprobado de Claude
(29/29), no se reemplazan por la versión anterior de 25/25.

## FROZEN / DO NOT REOPEN

- **Saved Views 2.0 está cerrado.** No se reabre la arquitectura salvo
  regresión demostrada.
- Las decisiones congeladas están en [`AI_DECISIONS.md`](AI_DECISIONS.md)
  (D-01 … D-23) — **por referencia, no duplicadas aquí**. Las que más
  probablemente tiente reabrir: D-01/D-02 (linaje vs URN), D-07 (nunca
  `isolate([])`), D-09/D-10 (V1 no se reescribe), D-14 (señales, no
  temporizadores) y D-11 (V2 por defecto con el V1 todavía presente).
- Los **33 Red Lines históricos** y las **7 Saved Views V1** de producción son
  datos reales de obra: congelados.

## KNOWN BACKLOG — NON BLOCKING

Observaciones reales, ya conocidas y aceptadas. Ninguna bloquea nada.

1. **`test_capacidades_con_puerta` falla desde el 29-ago-2026.**
   `/api/docs/miniaturas/preparar` existe en el backend y ningún cliente lo
   llama: el botón «Preparar las que falten» se retiró a petición del
   propietario en `a78c267`, y la ruta se quedó. Se arregla borrando la ruta o
   declarándola en `SIN_PANTALLA` con su motivo. **Anterior a Saved Views 2.0**
   (`a78c267` es ancestro de `ae364dd`).
2. **Civil 3D auto-oculto.** `Viewer.jsx:915` oculta por palabra clave
   `['vista de secciones', 'section view', '02.09']` en cada
   `GEOMETRY_LOADED_EVENT`. Es un heurístico por nombre de capa, no una regla
   del modelo: puede ocultar de más en un modelo que use esos nombres para otra
   cosa.
3. **Retiro futuro de los enlaces legacy.** Hoy `ENLACES_LEGACY_HASTA=abierto`.
   Cerrarlo es una decisión de producto, no técnica: hay enlaces por `id` en
   correos y documentos de obra. Al cerrarse devolverán **410**.
4. **DR de copias anteriores a E-4D.** Restaurar una de esas copias deja
   `legacy_enlace` en su DEFAULT y las 7 vistas históricas dejan de ser legacy
   (D-23). Sin receta escrita todavía.
5. **`eslint` no es hoy una puerta usable.** `eslint.config.js` sólo ignora
   `dist`, así que `npx eslint .` lintea también `dist_old/`, `dist_apk/`,
   `dist_field/`, `dist-banco/` y `android/**` — bundles minificados. De ahí que
   dé **17.078 problemas** frente a **422** de `npx eslint src`.
6. **`npm run build` en sitio falla en esta máquina** con `EPERM` sobre
   `frontend-react/dist/assets` (build local viejo, del 29-jul, con un handle
   retenido por Windows). Es un problema **de esta máquina, no del código**: el
   build sí completa apuntando a otro `--outDir`. Render compila en un checkout
   limpio y no lo ve.

7. **Comparador frente↔frente: emparejamiento entre documentos distintos.**
   Cuando los dos lados son frentes, el diff empareja por `external_id`, así que
   un elemento del documento D1 puede quedar emparejado con uno de D2 — y el
   censo B1 midió **2.146 externalIds presentes en dos frentes**. No es un
   lookup: es el algoritmo de compare, congelado. Cambiarlo altera lo que ve el
   usuario en una comparación frente-a-frente deliberada, así que es una
   **decisión de producto pendiente y queda FUERA de B1** por decisión del
   propietario (7-sep-2026). No bloquea B1.
## CURRENT TASK

**FILTERS CORE — B1**

## STATUS

**B1 EN CURSO — primera unidad de identidad GREEN y commiteada localmente
(`fix(filters): qualify identity in 4d and compare consumers`). Sin push.**

El STOP de frontera protegida quedó levantado por el propietario para los tres
módulos nombrados, y **todos los seams de identidad del alcance autorizado están
cerrados**. No se eligió una Source ni se levantó un Inventory paralelo para
taparlo: donde no hay documento demostrable, no se enlaza nada.

El reproductor del ciclo anterior
(`docs/filters/evidencias/B1_PROTECTED_BOUNDARY_REPRO.cjs`) **ya no puede
ejecutarse**: copia el cuerpo del método fuera de la clase, así que al ganar
`buildParamPhaseIndex` tres helpers falla con `this.urnDeFila is not a function`.
Eso no prueba nada por sí solo y no se presenta como prueba. La demostración
está en `frontend-react/pruebas/lob4dIdentidad.prueba.mjs`, que ejecuta los
métodos reales sobre una instancia real —todos los métodos del prototipo son los
del producto— e incluye los mismos casos control/colisión/orden.

Entrega actual: [B1_INTEGRATION_PROTECTED_STOP.md](filters/B1_INTEGRATION_PROTECTED_STOP.md).
Base aprobada: [B1_BACKEND_IDENTITY_RESULTADOS.md](filters/B1_BACKEND_IDENTITY_RESULTADOS.md).
B1 original: [B1_RESULTADOS.md](filters/B1_RESULTADOS.md).
Contrato: [FILTER_RESULT_B1.md](filters/FILTER_RESULT_B1.md).
Plan: [FILTERS_BENCHMARK.md](filters/FILTERS_BENCHMARK.md).
No reinvestigar Tandem, censo, identidad ni hardening. No B2.

> **Desde `3e413cd` sólo hay commits documentales de handoff y del benchmark
> Filters.** No hay commit funcional posterior declarado ni implementación de
> B1 commiteada. La infraestructura B1 nueva permanece untracked y está
> declarada en EXPECTED WORKTREE. Cualquier otro código nuevo no documentado
> es STATE DIVERGENCE. El baseline funcional y producción no cambian.

Commits documentales por encima del baseline (sin hash autorreferencial):

- `docs(ai): add shared handoff protocol for coding agents` — crea `AGENTS.md`,
  `docs/AI_WORKSTATE.md` y `docs/AI_DECISIONS.md`.
- `docs(ai): make handoff state verification non-self-referential` — sustituye el
  HEAD incrustado por `CODE BASELINE HEAD` + verificación por ascendencia.
- `docs(filters): freeze benchmark and target contract` — incorpora
  `docs/filters/FILTERS_BENCHMARK.md` y actualiza `docs/AI_WORKSTATE.md`;
  sólo documentación aprobada, sin código funcional.

## EXACT NEXT ACTION

**Testigo a Astra.** La identidad de los consumidores 4D/5D del alcance
autorizado está cerrada; lo que queda de B1 no es identidad:

1. Pendientes B1 que nunca se ejecutaron por el SCOPE STOP: normalizadores P0-2,
   fixture de Saved Views V2, baseline de navegador, endpoints y migración
   conectados. Ninguno bloqueado ya por frontera protegida.
2. Antes de conectar nada: la migración real del esquema con identidad
   cualificada sigue sin numerar y sin aplicar
   ([rollout](filters/B1_IDENTITY_ROLLOUT.md)), y el backfill de
   `asset_user_data` exige una prueba de cobertura externa — el flag
   `coverage_complete` no la mide, y así está escrito.

Dos cosas quedan registradas y **no** son trabajo de B1:

- El emparejamiento **frente↔frente** del comparador cruza documentos distintos
  por externalId (backlog nº 7). Semántica de producto, decisión del propietario.
- `buildParamPhaseIndexFromProps` —el respaldo por propiedades de APS— ya es
  por modelo y no cruza; no necesitó cambio.

### [WIP HANDOFF] — identidad 4D/5D cerrada

~~~text
[WIP HANDOFF]
TAREA:                FILTERS CORE — B1, identidad cualificada en los consumidores 4D/5D
IMPLEMENTADO:         Seis seams cerrados en dos commits locales. be114a1: setElementLinks por linaje, compare.py por (source_urn, external_id) con detalle no ambiguo, lob4d GROUP BY por (source_urn, external_id), y el test_gap11core_issues que fallaba con PermissionError. Segundo commit: buildParamPhaseIndex, buildSubZoneLabels y el respaldo de buildZoneHoverIndex, los tres sobre los helpers compartidos indiceDeDocumentos / claveDeSource / urnDeFila
PENDIENTE:            Nada de identidad en el alcance autorizado. De B1 quedan P0-2, fixture Saved Views V2, baseline de navegador, endpoints y migracion conectados. No B2
ARCHIVOS MODIFICADOS: Commiteados: LOB4DExtension.js (SOLO mis hunks de identidad, en dos rondas); backend/routes/compare.py; backend/routes/lob4d.py; backend/tests/test_gap11core_issues.py; frontend-react/pruebas/lob4dIdentidad.prueba.mjs; backend/herramientas/ensayo_identidad_4d_5d.py; docs/filters/evidencias/IDENTIDAD_4D_5D.json; docs/AI_WORKSTATE.md. Ajenos intactos y FUERA del indice: las 136 lineas de los 8 hunks de LOB4DExtension.js, mas Viewer.jsx, ViewerLabelsBar.jsx y predictBim.js
TESTS EJECUTADOS:     node frontend-react/pruebas/lob4dIdentidad.prueba.mjs 26/26; python -B backend/herramientas/ensayo_identidad_4d_5d.py 7/7 exit 0; pytest 1701 passed / 1 failed (el documentado del backlog 1); build del visor OK; filtersCore 8 KNOWN FAIL e interacciones 6 KNOWN FAIL, 0 inesperados; Saved Views 63/63, 150/150, 111/111. Siete mutantes muertos entre las dos rondas
TESTS PENDIENTES:     Navegador, APS real, HTTP auth, migracion conectada y P0-2: NOT EXECUTED, fuera de esta unidad
FALLO CONOCIDO:       Ninguno de identidad en el alcance autorizado. El reproductor ajeno B1_PROTECTED_BOUNDARY_REPRO.cjs ya no corre porque copia el metodo fuera de la clase; no se toco y no se usa como prueba. El emparejamiento frente-frente del comparador sigue cruzando documentos: backlog 7, semantica de producto, fuera de B1
NEXT EXACT ACTION:    Testigo a Astra: pendientes B1 que no son de identidad
DO NOT TOUCH:         Identidad (scope, lineage, externalId) y las seis responsabilidades; Saved Views V2 CLOSED y las V1 historicas; migraciones 29/30; LMV 7; formulas 4D, avance, scheduling, metrados, algoritmo frente-frente de compare, colores, labels y UI; AR; los 4 M ajenos y las entradas untracked ajenas; produccion
COMMIT/HEAD REF:      el segundo commit de esta unidad es el HEAD actual; obtenerlo con git rev-parse HEAD
~~~

Los resultados identidad29/29 y mutantes14/14 son del hardening aprobado de
Claude, no se rehicieron. Los nueve B1 originales y cuatro M ajenos conservaron
sus hashes previos 13/13. No se abrió navegador, DB ni producción en este ciclo.
Una búsqueda del subagente frontend fue rechazada y no se reintentó; el STOP
determinante es la frontera4D reproducida por la tarea principal.

Los clústeres previos siguen documentados en B1_BACKEND_IDENTITY_RESULTADOS.md
y B1_RESULTADOS.md §6; no se arrancaron ni consultaron en este ciclo.
Los census contienen copia local sensible: no compartir/commitear/borrar sin
instrucción. Ninguna variable/configuración persistente cambiada; no .env ni
contraseñas leídas. Los resultados generales siguientes son históricos.

## TEST / BUILD BASELINE

Todo medido el **6-sep-2026 sobre este mismo worktree**.

| Qué | Comando | Resultado real |
|---|---|---|
| Suite backend | `python -m pytest -q` | **1701 passed, 1 failed** en 120,9 s — el fallo es el del backlog nº 1, preexistente y ajeno a Saved Views |
| Capturador V2 | `node frontend-react/pruebas/capturarVistaV2.prueba.mjs` | **63 / 63** |
| Restaurador V2 | `node frontend-react/pruebas/restaurarVistaV2.prueba.mjs` | **150 / 150** |
| Contrato V2 | `node frontend-react/pruebas/savedViewV2.prueba.mjs` | **111 / 111** |
| Inventory config | `node frontend-react/pruebas/inventoryConfig.prueba.mjs` | **20 / 20** |
| Frente de vistas | `node frontend-react/pruebas/frenteDeVistas.prueba.mjs` | **20 / 20** |
| *(ajeno)* ViewerFacade | `node frontend-react/pruebas/viewerFacade.prueba.mjs` | **28 / 28** — banco untracked, trabajo ajeno al task actual: se anota, no se adopta |
| Ensayo HTTP de vistas V2 | `backend/herramientas/ensayo_de_vistas_v2.py` (base desechable) | **201 / 201** en su última ejecución, 6-sep |
| Build del visor | `npx vite build --outDir <fuera del repo> --emptyOutDir` | **✓ en 12,63 s.** Los *chunks* compartidos salen con el mismo hash que sirve producción (`vendor-BzrpNAyj`, `pdf-DNJrdseb`, `xlsx-BmGrHcps`); `index-*` difiere, y difiere **porque el worktree lleva los cambios sin commitear** |
| Identidad 4D | `node frontend-react/pruebas/lob4dIdentidad.prueba.mjs` | **26 / 26** — `setElementLinks` real y `linajeDeUrn` real; dobles sólo del visor |
| Identidad 4D/5D backend | `python -B backend/herramientas/ensayo_identidad_4d_5d.py --pg-bin <bin> --confirm-disposable-only` | **7 / 7**, exit 0 — clúster nuevo, DDL de `inventory_assets` por AST, rutas reales de `compare.py` |
| Lint del visor | `npx eslint src` | 422 problemas (381 errores, 41 avisos). **No es una puerta**, ver backlog nº 5 |

## PRODUCTION OPERATIONS

- **`ENLACES_LEGACY_HASTA = abierto`** en el servicio backend de Render. Se
  mantiene así por ahora. Cambiarlo es decisión del propietario.
- **`AUTH_POLICY_MODE = estricto`** en producción (en local se usa `sombra`).
- **Rollback**: se revierte el **código**, no las migraciones 29/30 (D-22). Las
  columnas nuevas son aditivas y no estorban al código anterior. Vía rápida sin
  desplegar: poner `VITE_SAVED_VIEWS_V2_RESTORE=false` y reconstruir el visor
  (D-11).
- **Copia verificada existente**: `D:/copias-ecd/produccion/ecd_20260906_230009`
  (`.copia.gz` + `.manifiesto.json`, formato `csv-por-tabla-v1`, tomada
  6-sep-2026 23:00 UTC). **Restaurada de verdad** en un clúster aislado →
  `RESTAURABLE`, 118 tablas, 86.284 filas, las 7 `saved_views` idénticas.
  Evidencia en `docs/entidad/evidencias/ensayo-restauracion-20260906-1804.json`.
  Anterior conservada: `ecd_20260904_214510`.
- **Despliegue**: Auto-Deploy **OFF** en los tres servicios. Publicar exige
  Manual Deploy en Render, y eso exige autorización explícita por acto.
- **Verificación obligatoria tras desplegar**: `GET /api/health` (dice el commit
  vivo). El frontend, además, por contenido del bundle servido — el panel de
  Render no es prueba suficiente.
- **Residuo local pendiente de instrucción**: el clúster desechable **detenido**
  del ensayo de restauración, en `scratchpad/verif/datos`
  (base `ecd_ensayo_20260906_180418`). No estorba; se borra cuando el
  propietario lo diga.
- **Nunca** se piden, leen ni escriben las contraseñas del propietario. DDL sólo
  como `ecd_migrator`, con el fichero de clave que jamás se imprime.

## HANDOFF RULE

Antes de terminar **cualquier** sesión:

1. Cerrar la **unidad mínima segura** — no dejar media refactorización.
2. **Pasar las pruebas** que toquen a lo cambiado, y anotar el resultado real.
3. **Commit GREEN**, o dejar un bloque `[WIP HANDOFF]` explícito (formato
   obligatorio en `../AGENTS.md § 8`) en este mismo fichero.
4. **Actualizar este fichero** con el estado nuevo.
5. Escribir **`EXACT NEXT ACTION`**: una acción concreta y ejecutable.
6. **STOP.**

> **WIP ≠ GREEN.**  **GREEN ≠ COMMITTED.**  **COMMITTED ≠ DEPLOYED.**

---

## DIVERGENCIAS ENCONTRADAS EL 6-SEP-2026

Diferencias reales entre repositorio, producción y lo que se daba por supuesto.
Se registran; **no se han tocado**.

### DIVERGENCIA 1 · El build local no es reproducible desde git

`frontend-react/src/components/Viewer.jsx` está modificado con
`import { registerViewerFacade } from '../aps/viewer/ViewerFacade'`, y ese
módulo **no existe en git**: `frontend-react/src/aps/viewer/` es untracked.

Consecuencias, medidas:

- `npm run build` en esta máquina compila **sólo porque el fichero untracked
  está en el disco**. Un checkout limpio de `3e413cd` produce un bundle
  distinto — y es ese, precisamente, el que sirve producción.
- Commitear `Viewer.jsx` tal como está **rompería el build de Render**: módulo
  no encontrado. Cualquier commit futuro que toque `Viewer.jsx` tiene que
  excluir esas 48 líneas, o esperar a que el propietario decida qué hacer con
  `ViewerFacade`.
- Producción **no está afectada**: `3e413cd` no menciona `ViewerFacade` (0
  coincidencias), y las marcas de Saved Views sí están.

### DIVERGENCIA 2 · La suite backend no está en verde absoluto

Se creía «todo verde». Son **1701 passed y 1 failed**. El fallo
(`test_capacidades_con_puerta`) es real, es del 29-ago-2026 y **no** lo
introdujo Saved Views. Backlog nº 1.

### DIVERGENCIA 3 · El lint no mide lo que parece

`npx eslint .` da 17.078 problemas y eso invita a concluir que el código está
podrido. No es cierto: ~12.400 vienen de bundles minificados en directorios de
build que la configuración no ignora. El código fuente da **422**. Backlog nº 5.

### DIVERGENCIA 4 · `npm run build` falla en sitio en esta máquina

`EPERM` sobre `frontend-react/dist/assets`, un build viejo del 29-jul-2026 con
un handle retenido. Es entorno local, no código. Backlog nº 6.
