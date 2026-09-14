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


Commits posteriores al baseline compatibles con el estado declarado: tres
commits documentales (`8f58a4b`, `cf7a845`, `336e09c`), dos de identidad
protegida (`be114a1`, `06f9a9a`), integración/cutover B1 (`5113e67`,
`89cdc79`) y B2 (`e3218e6`, `8495ad7`). El nuevo commit documental de
sincronización no cambia el baseline funcional desplegado. La referencia
local observada `origin/main` es `cf7a845`; no se hizo fetch ni push.

Historia funcional hasta el baseline:

Posteriores declarados adicionales: `0cf10a5` (handoff), `b7014be` (bloqueo),
`71d23c7` (corrección B2 autorizada) y el commit funcional de checkpoint B3 descrito
en STATUS. Ninguno se desplegó ni cambia el CODE BASELINE de producción.
El handoff documental posterior `docs(filters): prepare b3 independent review checkpoint`
sólo fija el estado de revisión; no duplica ni modifica el commit funcional B3.

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

**FILTERS CORE — B1 = CODE/TEST GREEN.** Identidad
`(scope_id, source_lineage, external_id)` integrada extremo a extremo: migración
**31** numerada y aplicada en desechable, `inventory_identity.py` como única
autoridad, rutas Inventory reales (lectura, PATCH, bulk, extracción), payload
cualificado y frontend que conserva la identidad. Ensayo integrado **23/23**,
identidad 4D/5D **7/7**, suite backend **1721 passed / 1 failed** (el fallo
documentado del backlog nº 1). Los KNOWN FAIL de B2 siguen visibles y **ninguno
desapareció**. Baseline de navegador: **NOT EXECUTED / ENVIRONMENT**.
B1 GREEN no significa Filters terminado. B2 posterior se documenta en LAST COMPLETED; misión vigente en CURRENT TASK.

**Revisión adversarial de la integración: PASS**, con dos defectos encontrados y
corregidos. El cutover es **fail-closed demostrado por código**, no por
documentación: `db.py` fija `search_path` a la proyección canónica y **falla al
arrancar** si falta la migración 31, sin caer nunca a `public.inventory_assets`;
la 31 revoca la escritura legacy a `ecd_app`; y la lectura devuelve **409** en
vez de un 200 incompleto —`INVENTORY_REEXTRACTION_REQUIRED` para lo nativo y
`LEGACY_USER_DATA_PENDING` para la metadata humana—. Ensayo integrado **24/24**.

## LAST COMPLETED

**B5 · CODE/TEST GREEN / COMMITTED, 8-sep-2026. FILTERS CORE HOST READY.**
Checkpoint funcional `e1a16016c192bb8674fb576294771138e29d2df6`.
Build limpio y ensayo backend/frontend desde ese mismo SHA verificados:
516 módulos/15,24 s, PG18 25/25. WIP ajeno intacto, ViewerFacade 0 líneas
incluidas. [Resultados B5](filters/B5_RESULTADOS.md) y
[campaña HOST/release](filters/B5_HOST_RELEASE.md).
Este cierre documental posterior no cambia producto ni el baseline desplegado.
HOST real: NOT EXECUTED / ENVIRONMENT; no confundir HOST READY con HOST GREEN.

**B3 · revisión adversarial independiente, 8-sep-2026: PASS.** Un defecto real
encontrado y corregido, más dos mediciones que se hacían a través de un paso de
limpieza.

- **L2 — el color de Filters sobrevivía a `dispose()`.** El driver restauraba
  los ganchos y vaciaba `painted` sin retirar el tinte: el driver siguiente
  arranca con `painted` vacío, así que nadie podía volver a quitarlo. Sobrevivía
  al OFF, a la revisión nueva y al remount. `dispose()` retira ahora lo que
  Filters pintó, y sólo eso: si otra herramienta tomó el color, `painted` ya
  estaba vacío. Mutante dirigido `dispose-leaves-orphan-color`: sin el arreglo
  quedan 3 modelos tintados.
- **L1 — dos casos medían `painted` después de `dispose()`.** Con el driver
  anterior daba igual, porque `dispose` no tocaba el color; el arreglo lo
  destapó. Se mide antes, sin cambiar ningún valor esperado: lo que afirman es
  que el trabajo de color completa —o que apagarlo no deja cola—, no lo que
  queda tras el desmontaje.
- **L1 — el docstring de `preflightFiltros` describía la regla anterior a B2**
  (`propId.split('::')[1]`, R-08 abierto). Ese módulo importa hoy la identidad
  de propiedad compartida; dejar escrito que la copia es exactamente lo que
  volvería a divergir.

Ataques sin defecto: A tarde tras B y A→B→A, no-filter frente a zero-result,
propiedad de la máscara visual sobre un objectSet ajeno, color OFF con lotes
pendientes y dueño externo, ciclo de vida con remount, scope/readiness, live
edit sin `detail`, popout con el mismo dbId en dos Sources, y búsqueda mecánica
de una segunda autoridad: el motor se llama desde un solo sitio y los globals
legacy se escriben desde uno solo.

Banco nuevo `filtersCore.b3Adversarial` (7 casos). Mutantes 4/4 muertos. Los dos
KNOWN FAIL de B4 —búsqueda y DnD— siguen intactos.



**B2 · representación canónica y cache por revisión, 7-sep-2026.** Diez de los
once P0 de B2 pasan porque el producto se corrigió, no porque se debilitara el
oráculo:

- **Un solo normalizador.** Precarga y refresco llamaban a dos algoritmos que,
  con el mismo dato, producían `Height` y `Group_Height`. Ahora comparten
  `normalizarInventario`, y las filas salen **cualificadas** (`Grupo::Propiedad`
  además del nombre suelto): dos grupos homónimos dejan de pisarse.
- **La cache exige una revisión explícita.** La referencia del array no era una
  revisión: la rejilla edita en sitio y el índice devolvía el valor anterior
  indefinidamente. `markInventoryRevision()` la declara donde se escribe o se
  edita; sin revisión el motor no cachea.
- **La huella de la rosetta mira el contenido**, no la cardinalidad: un remapeo
  que conserva el número de claves ya no reutiliza dbIds viejos.
- **Los valores del modelo dejan de ser claves peligrosas**: `Map` en vez de
  objeto, así que `constructor`, `toString` y `__proto__` son datos ordinarios.
- **Un elemento cuenta una vez**, por `(documento, externalId)`.
- **El respaldo global por externalId se sustituye por linaje**: ya no se cae al
  primer modelo cargado que tenga ese identificador.

Rendimiento medido contra B1 sobre 40.000 filas y cinco modelos: primera pasada
255,7 → **183,3 ms**; repetida 74,8 → **34,1 ms**. Sin regresión.

**B2 CODE/TEST GREEN.** Cero KNOWN FAIL de B2, cero UNEXPECTED FAIL y cero
UNEXPECTED PASS. Los KNOWN FAIL de B3/B4 siguen intactos en sus propios
bancos: 6 en `interacciones` y 6 en `interaccionesIntegradas`.



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

### WIP ajeno adicional confirmado por el propietario — takeover B2/B3

**UNRELATED / PROTECTED / PRESERVE**, sin adoptar ni normalizar:

- `frontend-react/src/lib/predictBim.js` completo en su estado actual
  (+55/−5 respecto de HEAD, no los +30/−0 históricos).
- `frontend-react/public/predict/` y
  `frontend-react/src/lib/predictBim.js.bak.20260907`.
- Delta actual de `docs/filters/evidencias/IDENTIDAD_4D_5D.json`
  (+5/−5, metadatos de una ejecución posterior).
- Los otros tres M históricos: LOB4DExtension.js, ViewerLabelsBar.jsx y
  únicamente los hunks históricos Viewer.jsx / ViewerFacade.
- Todos los untracked históricos y artefactos B1 ya enumerados abajo.

Hay **cinco M ajenos**, no cuatro. Las listas y conteos anteriores de B1 son
históricos; los bancos B1 ya versionados no se consideran untracked.
La divergencia administrativa fue aceptada expresamente por el propietario.
Ninguno de estos archivos forma parte del alcance adoptado de B2/B3.

### Modificados históricos (`M`) — 4 ficheros, +566 / −116

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

### Entrega documental de revisión B2 / bloqueo B3 — 7-sep

Propios de esta revisión: `docs/AI_WORKSTATE.md` y
`docs/filters/B2_REVIEW_B3_BLOCKED.md`, destinados a commit exclusivamente
documental. No hay cambios funcionales propios. Los cinco M ajenos y los
untracked declarados permanecen UNRELATED / PROTECTED / PRESERVE.

### Unidad B3 incorporada — posterior a 71d23c7

El WIP propio anterior entra en el commit funcional B3. Archivos y fitness en
[filters/B3_RESULTADOS.md](filters/B3_RESULTADOS.md).
NO queda WIP propio B3 esperado después del commit. Se conservan exactamente
los cinco M ajenos y todos los untracked históricos de la tabla anterior.
En Viewer sólo quedan sin commit las **48 líneas ViewerFacade** ajenas.
Los dos bancos históricos se adaptaron con autorización explícita:
expected/datos originales intactos; sólo dos KNOWN_FAIL de B4.

### Unidad B4 incorporada — posterior a 6ddc5a0

Commit local `feat(filters): complete b4 search and identity-safe interactions`:
App, TandemSidebar, TandemFilterPanel, FilterConfiguratorModal,
lib/filterPresentation, bancos interacciones/interaccionesIntegradas,
filtersCore.b4/b4Mutants/b4Performance, B4_RESULTADOS y este WORKSTATE.
NO queda WIP propio B4 esperado tras el commit. Siguen exactamente los cinco
M ajenos y los untracked históricos declarados; Viewer queda +48/-0.
Los dos KNOWN_FAIL de B4 ahora son PASS, sin modificar expected históricos.

### Unidad REVIEWS incorporada — dos commits sobre a325745, PUBLICADA Y DESPLEGADA (13-sep)

> **Actualización del 13-sep-2026: el handoff de esta unidad está superado.**
> - **Auto-Deploy:** comprobado en `Off` en el panel de Render para `visor-ecd-backend-va`, `visor-ecd-portal`, `visor-ecd-frontend` y `visor-ecd-backend` (Oregón). Los cuatro siguen `Yaseromar8/EDC_BIM`, rama `main`, y no hay más servicios.
> - **Push:** lo hizo el propietario (`origin/main` = `596776013ddb01ddb23104cb41f78e9d679b7227`) y no arrancó ningún despliegue. Hashes finales, sin trailer de coautoría: A = `b913e8a`, B = `5967760`.
> - **Despliegue manual del propietario:**
>   - backend de Virginia: `/api/health` → `version 596776013ddb`;
>   - portal: sirve el lote (el chunk `ReviewsModule-*.js` contiene «sin versión válida»).
> - **Oregón:** sigue en `cdf7837`. Actualizarlo o retirarlo es una decisión de infraestructura aparte (D9) que no bloquea Reviews.

Esta tarea entra en DOS commits, en este orden, sobre
`a32574544b9c8f50fb3cda53572c4394b98fa7b7`; tras ellos no queda WIP propio de la
tarea. Al empezarla el worktree ya traía, además de los ajenos de arriba,
`.claude/launch.json` y `frontend-docs/src/pages/FilesPage.jsx` modificados:
ajenos, no tocados, y siguen igual.

A · `fix(reviews)` — seguridad de Reviews (versión fijada, visibilidad y acceso documental):
- `backend/routes/reviews.py`
- `backend/flujo_de_revision.py`
- `backend/encargos.py`
- `backend/routes/directorio.py`
- `frontend-docs/src/components/ReviewsModule.jsx`
- `backend/tests/test_r01_motor_por_contrato.py`
- `backend/tests/test_r01_contrato_de_revision.py` (el ensayo nuevo entra en `ESCRITORES`)
- `backend/herramientas/ensayo_de_revisiones.py`
- `backend/herramientas/ensayo_de_contrato_r01.py`
- `docs/AI_WORKSTATE.md` (sólo el aviso de CURRENT TASK y esta sección)
- nuevo `backend/tests/test_revision_version_y_visibilidad.py`
- nuevo `backend/tests/test_revision_acceso_documental.py`
- nuevo `backend/herramientas/ensayo_de_version_y_visibilidad.py`

B · `fix(docs)` — vista previa por versión (defecto preexistente desde b671559):
- `frontend-docs/src/hooks/useDocPreview.js`
- `frontend-docs/src/components/DocQuickView.jsx`
- `frontend-docs/src/components/BusquedaGlobalModule.jsx`
- nuevo `frontend-docs/src/utils/vistaPrevia.js`
- nuevo `frontend-docs/pruebas/vistaPrevia.prueba.mjs`

[WIP HANDOFF]
TAREA:                REVIEWS · lote correctivo (versión fijada, visibilidad, acceso documental para actuar y para asignar, confidencialidad de Mi Trabajo y avisos) y, aparte, la vista previa por versión: COMMITTED en dos commits (A y luego B), SIN DESPLEGAR.
IMPLEMENTADO:         A) alta con version_id válido del mismo documento y obra; AT sin asociación válida no aprueba; la excepción «sin version_id» del cierre sólo para PRE; GET /api/reviews filtrado por permiso_documental; `/act` exige que el actor pueda consultar todos los documentos, para aprobar y para rechazar, en cualquier paso y contrato (403 SIN_PERMISO_DOCUMENTAL antes de cualquier escritura); alta manual, alta de plantilla y sustitución rechazan a quien no puede consultarlos (400 REVISOR_SIN_ACCESO_DOCUMENTAL); perder el acceso deja la revisión PENDIENTE y BLOQUEADA (causa nueva de `estado_del_flujo`, también en la conciliación) y la sustitución de siempre la desbloquea; Mi Trabajo (global y por obra) y el cuerpo de los avisos de revisión se deciden por destinatario, con asunto neutro «Revisión RV-### · paso N · sin acceso a todos sus documentos»; una sola regla en `flujo_de_revision.puede_consultar_la_revision`. B) `useDocPreview` entrega el nombre intacto y la versión en `versionLabel`; `DocQuickView` decide el formato por el nombre.
PENDIENTE:            1) publicación: antes de cualquier push, confirmar en el panel de Render el Auto-Deploy de todos los servicios que siguen `main` — `visor-ecd-backend-va` (Virginia, creado el 12-sep) no figura en `deploy/render.yaml` y el del backend de Oregón consta como NO VERIFICADO (solo observado); con todos apagados, push normal, sin forzar; 2) planificar el despliegue manual: destino web Virginia y frontend-docs, verificando cada uno por `/api/health` y por contenido; 3) antes, confirmar si Oregón sigue activo y accesible con las rutas anteriores, y que el propietario decida expresamente entre actualizarlo o retirarlo.
ARCHIVOS MODIFICADOS: propios: ninguno pendiente, todo está en A y B. Ajenos, no tocados: .claude/launch.json, docs/filters/evidencias/IDENTIDAD_4D_5D.json, frontend-docs/src/pages/FilesPage.jsx, frontend-react/src/aps/extensions/LOB4DExtension.js, frontend-react/src/components/Viewer.jsx, frontend-react/src/components/ViewerLabelsBar.jsx, frontend-react/src/lib/predictBim.js y todos los untracked históricos.
TESTS EJECUTADOS:     `python -m pytest -q -p no:cacheprovider` desde la raíz → 1777 passed / 1 failed (test_capacidades_con_puerta, preexistente); `python herramientas/ensayo_de_version_y_visibilidad.py` contra base desechable como ecd_app → 67/67 (incluye A8: versión inexistente con quien administra asignado, y A9: independencia tras sustituir); `herramientas/ensayo_de_revisiones.py` → 50/50; `herramientas/ensayo_de_contrato_r01.py` en base nueva parada en la 26, como ecd_migrator → 59/59; `npm test` en frontend-docs → 4 bancos en verde (vistaPrevia 9/9); build de frontend-docs OK; banco de interfaz con el ReviewsView real y un usuario ficticio: el PDF válido se dibuja con nombre y versión separados, y la asociación inválida no abre nada.
TESTS PENDIENTES:     activación por teclado (Enter/Espacio) del botón de un documento válido: pendiente de UAT humana; rendimiento con volumen: no medido; validación en producción: pendiente del despliegue; medición o reparación de revisiones reales de producción: no autorizadas.
FALLO CONOCIDO:       test_capacidades_con_puerta (preexistente, /api/docs/miniaturas/preparar). La independencia al sustituir compara el correo/nombre guardado del autor con el del paso, no el user_id: A9 prueba el caso cubierto, no todos los cambios posibles de identidad. Una AT ya guardada con un version_id inexistente sólo la puede ver o actuar quien administra la obra; sustituir al revisor por esa persona permite gestionarla y rechazarla, pero NO aprobarla: la integridad de versión la sigue bloqueando (A8). Las AT mal formadas existentes no se reparan ni se rechazan automáticamente.
NEXT EXACT ACTION:    confirmar en Render el Auto-Deploy de los servicios que siguen `main` (sobre todo `visor-ecd-backend-va`); si todos están apagados, push normal de A y B, sin forzar; después, planificar con el propietario el despliegue manual.
DO NOT TOUCH:         el WIP ajeno listado; las revisiones reales de producción; la guarda de cierre por versión nueva; el contrato R01 (PRE / AUTORIDAD_TERMINAL); no desplegar Virginia, no desplegar ni reactivar Oregón, no suspender ni eliminar servicios, y no cambiar Cloud SQL, redes, APS ni frontends desplegados.
COMMIT/HEAD REF:      a32574544b9c8f50fb3cda53572c4394b98fa7b7

### Unidad REVIEWS · E1 (detalle, navegación y semántica) — DESPLEGADA (68b14b8 en Virginia y portal), 13-sep

Programa y decisiones aprobadas: `docs/reviews/00_PROGRAMA_Y_DECISIONES.md`. Contrato:
`docs/reviews/E1_CONTRATO_DE_ACEPTACION.md`. Informe: `docs/reviews/E1_INFORME_DE_CIERRE.md`.
La unidad anterior (A y B) ya está publicada: `origin/main` = `5967760`, desplegada por el
propietario en Virginia y en el portal el 13-sep.
E1 está en el commit `68b14b8` (padre `5967760`, 20 ficheros), aceptado (`E1 COMMIT = PASS`) y publicado en
`origin/main` el 13-sep con push normal. Antes del push se comprobó en el panel Auto-Deploy `Off` en los
cuatro servicios (no hay más), y el push no arrancó ningún despliegue.
El propietario lo desplegó a mano el 13-sep, primero el backend y después el portal. Verificado: Virginia
`/api/health` → `version 68b14b8c7d5a`; el portal (origen de Render y `alephia.com.pe`) sirve
`index-BmVOYVjH.js`, que contiene «Dar conformidad» y «Abriendo la revisión», textos que solo existen desde
`68b14b8`. Oregón sigue en `cdf783754574`; el visor no forma parte de E1.
Excepción menor de alcance, registrada por el propietario: `SustituirRevisor` conserva la semántica de
sustitución de `5967760`, pero se retiró su prop no usada `projectPrefix` (diferencia técnica, no funcional).
La documentación que el propietario pidió no commitear aparte (el informe corregido, la guía y los
hallazgos de la UAT) entró en el commit de E1.1. Siguen exactamente los siete M ajenos y los untracked
históricos.

[WIP HANDOFF]
TAREA:                REVIEWS · E1 (detalle, navegación y semántica) — `E1 CODE/TEST GREEN LOCAL = PASS` y `E1 COMMIT = PASS`; commit 68b14b8 en origin/main y DESPLEGADO por el propietario el 13-sep (backend de Virginia y portal), verificado por /api/health y por contenido.
IMPLEMENTADO:         GET /api/reviews/<rid> (solo lectura, puertas, `acciones` con las reglas de /act, pasos y versión vigente); GET /api/reviews con filtros y paginación por cursor (permiso antes de cortar la página, tope de 1000 filas, `obra_id`); `get_review` en RUTAS_POR_RECURSO; pantalla RevisionDetalle; lista con filtros y «Cargar más»; enlace `/?obra=&revision=` (router, persistencia tras el login, aviso si la obra no es del usuario); Mi Trabajo abre revisiones; «Dar conformidad» ≠ «Aprobar»; confirmación y mensajes.
PENDIENTE:            1) UAT del propietario en producción, con docs/reviews/E1_GUIA_DE_PRUEBA.md (enlace, Mi Trabajo, botones por paso; Enter/Espacio, pantalla ancha y lector de pantalla); 2) E2 (anular y archivar), NO autorizado todavía; Oregón, sin cambios.
ARCHIVOS MODIFICADOS: la documentación pendiente (docs/reviews/E1_INFORME_DE_CIERRE.md, docs/reviews/E1_GUIA_DE_PRUEBA.md, docs/reviews/E1_UAT_HALLAZGOS.md) entró en el commit de E1.1. Propios, los 20 en el commit 68b14b8: backend/routes/reviews.py, backend/perimetro_de_obra.py, frontend-docs/src/App_Refactor.jsx, frontend-docs/src/components/MiTrabajo.jsx, frontend-docs/src/components/ReviewsModule.jsx, frontend-docs/src/hooks/useFileExplorer.js, frontend-docs/src/pages/HubPage.jsx, frontend-docs/vite.banco.config.js, frontend-docs/pruebas/vistaPrevia.prueba.mjs, docs/AI_WORKSTATE.md; nuevos: backend/tests/test_revision_detalle_y_listado.py, backend/herramientas/ensayo_de_detalle_de_revision.py, frontend-docs/src/components/RevisionDetalle.jsx, frontend-docs/src/utils/revisiones.js, frontend-docs/pruebas/revisiones.prueba.mjs, frontend-docs/probar-revisiones.html, frontend-docs/src/probar-revisiones.jsx, docs/reviews/00_PROGRAMA_Y_DECISIONES.md, docs/reviews/E1_CONTRATO_DE_ACEPTACION.md, docs/reviews/E1_INFORME_DE_CIERRE.md. Ajenos, no tocados (sha256 iguales): .claude/launch.json, docs/filters/evidencias/IDENTIDAD_4D_5D.json, frontend-docs/src/pages/FilesPage.jsx, frontend-react/src/aps/extensions/LOB4DExtension.js, frontend-react/src/components/Viewer.jsx, frontend-react/src/components/ViewerLabelsBar.jsx, frontend-react/src/lib/predictBim.js y los untracked históricos.
TESTS EJECUTADOS:     desde backend `python -m pytest -q -p no:cacheprovider tests` → 1808 passed / 1 failed (test_capacidades_con_puerta, preexistente); `herramientas/ensayo_de_detalle_de_revision.py` en base desechable con ENFORCE → 25/25; `ensayo_de_version_y_visibilidad.py` → 67/67; `ensayo_de_revisiones.py` sin `.env` → 50/50; `npm test` en frontend-docs → 5 bancos en verde (repetido tras quitar una directiva eslint-disable sobrante); `npx eslint` desde frontend-docs sobre los 11 ficheros JS de E1 → 0 errores / 0 avisos; `npx vite build --outDir <fuera del repo>` → OK; banco `probar-revisiones` y E2E local con backend real → PASS (detalle en el informe); sha256 de los 7 M ajenos iguales a la referencia.
TESTS PENDIENTES:     UAT humana (Enter/Espacio, pantalla ancha, lector de pantalla) = PENDING; rendimiento con volumen = NOT MEASURED; validación funcional en producción por el propietario = PENDING (el despliegue ya está verificado por versión y por contenido). El E2E con backend real e identidad inyectada es evidencia válida de la sesión del 13-sep, no un arnés versionado: su servidor quedó en el scratchpad.
FALLO CONOCIDO:       test_capacidades_con_puerta (preexistente). `npm run build` en sitio falla por EPERM sobre frontend-docs/dist/assets (entorno). Con ENFORCE, una revisión inexistente responde 403 PROJECT_UNRESOLVED del middleware, no el 404 de la ruta. Hallazgos de la UAT del 13-sep, ninguno introducido por E1 (docs/reviews/E1_UAT_HALLAZGOS.md): H1 un administrador de la entidad no puede ser revisor, porque la regla de participante choca con que no se le puede añadir como participante; H2 cambiar la plantilla borra los revisores; H3 la lista de revisores ofrece a no participantes y a cuentas retiradas; H4 faltan tildes en un mensaje.
NEXT EXACT ACTION:    esperar el resultado de la UAT del propietario sobre E1 en producción y su autorización para E2; sin ella, no empezar E2 ni tocar Oregón.
DO NOT TOUCH:         el WIP ajeno listado; el contrato R01 (PRE / AUTORIDAD_TERMINAL); /act, el alta, la sustitución y las plantillas; producción y Oregón. `acciones` del detalle es información para presentación: `/act` sigue siendo la autoridad de ejecución y debe revalidar siempre.
COMMIT/HEAD REF:      68b14b8c7d5adfa32d83a10f32b33ce30707ab47 (commit de E1, igual a origin/main; su padre es 5967760)

### Unidad REVIEWS · E1.1 (alta de revisiones y participantes) — DESPLEGADA (8875f9e en Virginia y portal), 13-sep

Autorizada por el propietario: «corrige, pero con criterio, sin romper la funcionalidad». Contrato:
`docs/reviews/E1_1_CONTRATO.md`. Informe: `docs/reviews/E1_1_INFORME_DE_CIERRE.md`. Corrige H1–H4 de
la UAT de E1 (`docs/reviews/E1_UAT_HALLAZGOS.md`).

[WIP HANDOFF]
TAREA:                REVIEWS · E1.1 — corregir H1–H4 de la UAT de E1: probado en local, commit 8875f9e sobre 68b14b8 y publicado en origin/main con push normal el 13-sep (los dos autorizados por el propietario) y DESPLEGADO por el propietario el 13-sep, verificado (Virginia /api/health → 8875f9ed1428; el portal sirve index-BU0VvNh3.js con E1.1). Antes del push se releyó Auto-Deploy Off en los cuatro servicios (no hay más), y el push no arrancó ningún despliegue.
IMPLEMENTADO:         H1 el administrador de la entidad se incorpora como participante (candidatos con role, incorporar sin 409 ENTITY_ADMIN_SIN_MEMBRESIA, retirar en Participantes, sin casilla de administrar la obra); «Guardar accesos» (update_project_users) no borra su participación; H2 alta: confirmar antes de sustituir revisores puestos a mano por una plantilla, «a mano» conserva los pasos, si la plantilla falla vuelven los anteriores; H3 las listas de revisores del alta y de «Sustituir revisor…» salen de /api/projects/<obra>/miembros; H4 tildes en el mensaje de REVISOR_FUERA_DE_LA_OBRA y en el motivo de BLOQUEADA.
PENDIENTE:            1) la UAT del propietario de la noche del 13-sep (bloques C y D) dio H5–H9, en la segunda parte de docs/reviews/E1_UAT_HALLAZGOS.md: los datos NO se cruzan (ensayo local 29/29); H5 tras Adelante fuera de Revisiones la dirección conserva revision= y «Revisiones» abre esa revisión; H6 una confirmación sobrevive a Atrás y actúa sobre su revisión, que ya no se ve; H7 (diseño) la misma versión puede estar en dos revisiones en curso; H8 la guía compartía PDF; H9 created_at y paso_vence_en sin zona horaria (+5 h en Lima). Esperan la autorización de E1.2 (H5, H6, H9) y la decisión del propietario sobre H7 (A avisar / B impedir); 2) el bloque F de la guía (flujo creado), por el propietario; 3) commitear en el próximo handoff este fichero, la guía y los hallazgos.
ARCHIVOS MODIFICADOS: en el commit de E1.1: backend/routes/administracion.py, backend/routes/auth.py, backend/routes/reviews.py, backend/flujo_de_revision.py, backend/tests/test_membresia_por_obra.py, backend/tests/test_accesos_por_diferencia.py, frontend-docs/src/components/ReviewsModule.jsx, frontend-docs/src/components/RevisionDetalle.jsx, frontend-docs/src/components/ParticipantesModule.jsx, frontend-docs/src/probar-revisiones.jsx; nuevos: backend/herramientas/ensayo_de_admin_participante.py, frontend-docs/src/utils/altaDeRevision.js, frontend-docs/pruebas/altaDeRevision.prueba.mjs, docs/reviews/E1_1_CONTRATO.md, docs/reviews/E1_1_INFORME_DE_CIERRE.md. Entró también la documentación pendiente: docs/reviews/E1_INFORME_DE_CIERRE.md, docs/reviews/E1_GUIA_DE_PRUEBA.md, docs/reviews/E1_UAT_HALLAZGOS.md, docs/usuarios/00_ADMIN_UNICO_Y_ELIMINAR_USUARIOS.md y este fichero. Sin commit, para el próximo handoff: este fichero (push y despliegue) y docs/reviews/E1_GUIA_DE_PRUEBA.md (guía actualizada para E1.1). Ajenos, no tocados (sha256 iguales): los siete M de siempre y los untracked históricos.
TESTS EJECUTADOS:     desde backend `python -m pytest -q -p no:cacheprovider tests` → 1812 passed / 1 failed (test_capacidades_con_puerta, preexistente); `npm test` en frontend-docs → 6 bancos en verde (altaDeRevision 8/8); eslint sobre los ficheros JS tocados → 0; build fuera del repo → OK; `herramientas/ensayo_de_admin_participante.py` en base desechable con ENFORCE → 16/16; regresiones: ensayo_de_detalle_de_revision 25/25, ensayo_de_version_y_visibilidad 67/67, ensayo_de_revisiones 50/50; banco probar-revisiones (ReviewModal real) y app real con backend real (Participantes) → PASS.
TESTS PENDIENTES:     «Enviar a revisión» en la app real: el panel del navegador de la sesión (286×307 px) no pinta la tabla; ensayo_de_administracion.py no se ejecutó porque lee el .env; bloque F de la UAT (flujo creado). Diagnóstico del 13-sep por la noche, fuera del repo: scratchpad/e1/diagnostico_gemelas.py 29/29 contra el banco con ENFORCE, y recorrido en la app real del banco (H5 y H6 reproducidos).
FALLO CONOCIDO:       test_capacidades_con_puerta (preexistente). test_perimetro.py falla si corre justo después de test_accesos_por_diferencia.py (su fixture recarga routes.auth en modo estricto, igual que antes de E1.1); pasa solo y en la suite completa.
NEXT EXACT ACTION:    ver «Unidad REVIEWS · E1.2»; E2 sigue sin autorizar.
DO NOT TOUCH:         el WIP ajeno listado; producción; E2–E5; Usuarios U2–U5; las reglas del alta en el servidor, /act y la sustitución.
COMMIT/HEAD REF:      8875f9ed142893505e0135956ce893ede4f13e75 (commit de E1.1, igual a origin/main; su padre es 68b14b8)

### Unidad REVIEWS · E1.2 (enlace, confirmación, fechas y documentos compartidos) — DESPLEGADA (27e1a42 en Virginia y portal), 13-sep

Autorizada por el propietario con «SI, HAZLO» sobre la segunda parte de `docs/reviews/E1_UAT_HALLAZGOS.md`. Para H7
la respuesta no eligió: se aplicó A (avisar), la recomendada, y se dice en el contrato. Contrato:
`docs/reviews/E1_2_CONTRATO.md`. Informe: `docs/reviews/E1_2_INFORME_DE_CIERRE.md`.

[WIP HANDOFF]
TAREA:                REVIEWS · E1.2 — H5 dirección y pantalla, H6 confirmación retirable, H9 fechas con zona y H7-A avisos de documentos en otra revisión en curso. Implementado y probado en local; commit único sobre 8875f9e autorizado por el propietario («SI HAZLO») y publicado en origin/main con push normal («VAMOS»), tras releer Auto-Deploy Off en los cuatro servicios de Render. DESPLEGADO por el propietario el 13-sep y verificado: Virginia /api/health → 27e1a428ce3c, también por el /api del portal y de alephia.com.pe; portal index-DgYYQqZD.js con E1.2 en Render y en alephia.com.pe; Oregón cdf783754574 sin cambios. INCIDENTE: el primer arranque tras el Manual Deploy (21:11) se quedó en «Control socket listening» sin «Booting worker»; Render lo marcó Live pero no detectaba puerto, y el backend no respondió de 21:11 a 21:36. Con autorización del propietario («REINICIA») se reinició el servicio y arrancó normal (Booting worker; política aplicada a 393 endpoints). Sin migraciones.
IMPLEMENTADO:         H5 useFileExplorer escucha popstate y abre Revisiones si la dirección trae una revisión de su obra, y setSidebarView('reviews') desde otra sección quita un enlace viejo; App_Refactor abre como enlace una revisión de otra obra o traída fuera de Documentos (destinoTrasNavegar en utils/revisiones.js). H6 confirmAction acepta `signal`; RevisionDetalle la retira al desmontarse y no actúa sin la revisión en pantalla. H7-A GET /api/reviews/en-curso (solo lectura, solo revisiones visibles), items[].tambien_en (solo revisiones en curso) y estado_documento en el detalle, acciones.aprobar.ya_en_destino/todos_en_destino/retroceden, y los avisos en alta, detalle y consecuencia del cierre. H9 _COLUMNAS_DE_REVISION y la consulta de Mi Trabajo leen created_at, paso_vence_en, vence_en y creado_en con AT TIME ZONE current_setting('TimeZone').
PENDIENTE:            1) UAT del propietario: bloques F, D4 y G de docs/reviews/E1_GUIA_DE_PRUEBA.md; 2) commitear en el próximo handoff este fichero y la guía, el informe y los hallazgos actualizados tras el despliegue; 3) B (impedir) sigue fuera; 4) E2 sin autorizar.
ARCHIVOS MODIFICADOS: backend/routes/reviews.py, backend/encargos.py, backend/tests/test_revision_detalle_y_listado.py, backend/tests/test_encargos.py, frontend-docs/src/utils/revisiones.js, frontend-docs/src/hooks/useFileExplorer.js, frontend-docs/src/App_Refactor.jsx, frontend-docs/src/utils/confirm.jsx, frontend-docs/src/components/RevisionDetalle.jsx, frontend-docs/src/components/ReviewsModule.jsx, frontend-docs/pruebas/revisiones.prueba.mjs, frontend-docs/src/probar-revisiones.jsx, docs/reviews/E1_UAT_HALLAZGOS.md, docs/reviews/E1_GUIA_DE_PRUEBA.md, docs/AI_WORKSTATE.md; nuevos: backend/herramientas/ensayo_de_revisiones_gemelas.py, docs/reviews/E1_2_CONTRATO.md, docs/reviews/E1_2_INFORME_DE_CIERRE.md. Ajenos, no tocados (sha256 iguales): los siete M de siempre y los untracked históricos.
TESTS EJECUTADOS:     pytest completo → 1827 passed / 1 failed (test_capacidades_con_puerta, preexistente; 15 pruebas nuevas); npm test en frontend-docs → 6 bancos en verde (revisiones 19/19); ESLint en los ficheros tocados → sin problemas nuevos (confirm.jsx y probar-revisiones.jsx traen el mismo error react-refresh que HEAD); construcción del portal con la configuración del banco y sin .env → OK; ensayo_de_revisiones_gemelas 24/24; regresiones ensayo_de_detalle_de_revision 25/25, ensayo_de_version_y_visibilidad 67/67, ensayo_de_admin_participante 16/16, ensayo_de_revisiones 50/50 (sin .env); app real del banco: H5 (Archivos + Adelante abre T2; «Revisiones» con dirección vieja abre la lista), H6 (Atrás cierra la confirmación y no hay acto) y aviso del detalle; banco probar-revisiones: avisos del alta, del detalle y del cierre, y H6.
TESTS PENDIENTES:     «Enviar a revisión» en la app real (el panel no pinta la tabla); Atrás/Adelante hacia otra obra o desde la portada (App_Refactor) solo con reglas puras y lectura de código; UAT del propietario tras el despliegue.
FALLO CONOCIDO:       test_capacidades_con_puerta (preexistente). Error de lint react-refresh preexistente en confirm.jsx y probar-revisiones.jsx.
NEXT EXACT ACTION:    esperar el resultado de la UAT del propietario (bloques F, D4 y G). Tras cada Manual Deploy del backend: /api/health y «Booting worker» en el log, no basta con «Live».
DO NOT TOUCH:         el WIP ajeno listado; producción; E2–E5; B de H7; Usuarios U2–U5; las reglas del servidor en /act, el alta, la sustitución y las plantillas.
COMMIT/HEAD REF:      27e1a428ce3c35a215f0b7319ecf0fe399ee94df (commit de E1.2, igual a origin/main tras el push del 13-sep; su padre es 8875f9e).

### Análisis de Usuarios · administrador único y eliminar usuarios — VERSIONADO con E1.1, 13-sep

`docs/usuarios/00_ADMIN_UNICO_Y_ELIMINAR_USUARIOS.md` (solo análisis, versionado en el commit de E1.1). El propietario pidió
quedar como único Entity Admin y poder eliminar usuarios. Hallazgos:
- id 19 es el 2.º custodio decidido en el doc 76;
- quitarle el rol ya se puede desde «Usuarios del sistema»;
- la papelera desactiva, y el borrado físico (`?purgar=1`) existe pero no está en la interfaz;
- varias FK con RESTRICT impiden purgar a quien tiene huella.
Nada cambiado en código. En producción, el propietario degradó id 19 al perfil «Editar» (13-sep, desde la
interfaz): queda un solo admin. Pendiente: sus decisiones U2–U5 (U5 = unificar «Usuarios» y «Usuarios del sistema»).

### Unidad PERMISOS · A (planos CAD para todos) y B («Editar» en la carpeta) — COMMIT LOCAL, SIN PUSH NI DESPLIEGUE, 14-sep

Pedido del propietario el 13/14-sep, con su equipo empezando a trabajar en el ECD el 14-sep. Diagnóstico previo:
`docs/usuarios/01_PERFIL_Y_PERMISO_DE_CARPETA.md`. Informe: `docs/usuarios/02_PLANOS_CAD_Y_EDITAR_EN_CARPETA.md`.
En la misma sesión, solo análisis y sin código: `docs/reviews/E1_3_FLUJOS_CREADOS_Y_RECHAZO.md` y
`docs/compartir/01_COMPARTIR_VARIOS_DOCUMENTOS.md`.

[WIP HANDOFF]
TAREA:                PERMISOS · A) el visor web de planos CAD daba 403 PROJECT_UNRESOLVED a todo el que no fuera admin de entidad (ENFORCE encendido desde el 22-ago); B) «Cargar archivos», «Nueva carpeta», soltar ficheros, añadir subcarpeta, mover y suprimir se decidían con «administra esta obra» y no con el permiso de carpeta. Implementado y probado en local; commit autorizado por el propietario («SI»), que es el que contiene este fichero; SIN push ni despliegue: cada uno necesita su autorización.
IMPLEMENTADO:         A) perimetro_de_obra: `cad_status` en RUTAS_POR_QUERY; nuevo RUTAS_POR_CUERPO con `translate_cad` y `obra_por_cuerpo` (solo valores simples de primer nivel); auth_middleware._request_project_id la consulta después de la query; docs_cad `_guardia_del_plano` (guardia_del_documento + permiso_documental.guardia con minimo viewer) en translate y en status; test_cobertura_autorizacion lee también RUTAS_POR_CUERPO. B) /api/docs/list devuelve `current_permission_level` (permiso_efectivo de quien mira sobre la carpeta listada; fail-closed 'none'); move exige 'edit' también en el destino; portal: `puedeEditarEn` y las capacidades `subcarpeta` y `nueva_version` en capacidadesDeSeleccion; useFileExplorer con `nivelCarpetaActual` y `puedeEditarAqui` (cargar, crear, soltar) y `subirNuevaVersion` (sube el fichero elegido con el nombre del documento, del mismo tipo); mover y suprimir sin gate `isAdmin` (deciden capacidades y servidor); ContextMenu con «Añadir subcarpeta» por permiso y «Subir nueva versión»; MatrixTable renombrar y descripción con 'edit'; FilesPage con los botones sobre `fe.puedeEditarAqui` y un selector de fichero oculto para la nueva versión.
PENDIENTE:            1) autorización del propietario para el push (normal, sin forzar, tras releer Auto-Deploy Off en Render) y para cada Manual Deploy (primero el backend `visor-ecd-backend-va`, con /api/health y «Booting worker»; luego `visor-ecd-portal`, verificado por contenido); 2) sus decisiones sobre E1.3 (flujos creados), el contrato de rondas (D8) y el paquete compartido; 3) C (camino hasta una carpeta anidada) y D (ordenar Rol frente a Configuración de permisos), aplazados por el propietario.
ARCHIVOS MODIFICADOS: propios: backend/perimetro_de_obra.py, backend/auth_middleware.py, backend/routes/docs_cad.py, backend/routes/documents.py, backend/tests/test_cobertura_autorizacion.py, frontend-docs/src/utils/capacidadesDeSeleccion.js, frontend-docs/pruebas/capacidadesDeSeleccion.prueba.mjs, frontend-docs/src/hooks/useFileExplorer.js, frontend-docs/src/components/ContextMenu.jsx, frontend-docs/src/MatrixTable.jsx y frontend-docs/src/pages/FilesPage.jsx (SOLO los hunks de los dos botones, del selector de «Subir nueva versión» y de la prop del menú: el fichero ya traía WIP ajeno de la barra de iconos, que no se commitea); nuevos: backend/tests/test_planos_para_todos.py, backend/tests/test_editar_en_carpeta.py, docs/usuarios/01_PERFIL_Y_PERMISO_DE_CARPETA.md, docs/usuarios/02_PLANOS_CAD_Y_EDITAR_EN_CARPETA.md, docs/reviews/E1_3_FLUJOS_CREADOS_Y_RECHAZO.md, docs/compartir/01_COMPARTIR_VARIOS_DOCUMENTOS.md; y este fichero. Pendientes del handoff anterior (E1.2): docs/reviews/E1_2_INFORME_DE_CIERRE.md, docs/reviews/E1_GUIA_DE_PRUEBA.md, docs/reviews/E1_UAT_HALLAZGOS.md. Ajenos, no tocados: los siete M de siempre (incluidos los hunks ajenos de FilesPage.jsx) y los untracked históricos.
TESTS EJECUTADOS:     pytest completo sin .env → 1841 passed / 1 failed (test_capacidades_con_puerta, preexistente; 14 pruebas nuevas); dirigido (planos, editar, cobertura, perímetro, aislamiento, documento, auth, política) → 98 passed; ensayo de banco con rutas reales y ENFORCE (scratchpad/permisos/ensayo_planos_y_editar.py) → 21/21; reproducciones previas: defecto CAD (repro_cad_perimetro.py) 9/9 en sombra y en estricto, y camino de carpetas (ensayo_perfil_vs_carpeta.py) 56/56; npm test en frontend-docs → 6 bancos en verde (capacidadesDeSeleccion 20/20); eslint de los ficheros tocados → los mismos problemas que HEAD, ninguno nuevo; build del portal sin .env → OK; app real del banco con un usuario de rol «Usar» y «Editar» en 03_Documentos → la raíz y 02_SHA_Compartido sin «Cargar archivos»; 03_Documentos con «Cargar archivos» y «Nueva carpeta»; menú de un PDF con «Subir nueva versión», «Cambiar nombre» y «Desplazar», y «Suprimir» apagado («Necesitas permiso de administración en esta carpeta»).
TESTS PENDIENTES:     subir un fichero real desde la pantalla (el banco no tiene GCS y el navegador de pruebas no elige ficheros); ver un plano CAD traducido (sin credenciales APS: se prueba que la petición pasa todas las puertas); validación en producción tras el despliegue.
FALLO CONOCIDO:       test_capacidades_con_puerta (preexistente). En el Browser pane (286×307) la tabla de Archivos no pinta filas: se usó resize_window 1280×800 y un dblclick despachado para abrir filas. Mover por ruta (`destPath` sin `destNodeId`) todavía puede crear carpetas antes de comprobar el destino (preexistente; el portal usa ids). En compartir (solo análisis): revocar no comprueba la obra del enlace, el autor sale del cuerpo y el enlace sirve la versión actual.
NEXT EXACT ACTION:    pedir la autorización del push; con ella, releer Auto-Deploy Off en los cuatro servicios de Render y push normal; después, la autorización de cada Manual Deploy (primero el backend de Virginia).
DO NOT TOUCH:         el WIP ajeno (incluidos los hunks de la barra de iconos de FilesPage.jsx); producción y Oregón; Revisiones (/act, alta, sustitución, plantillas) hasta que decida sobre E1.3 y las rondas; el significado del Rol (D, aplazado).
COMMIT/HEAD REF:      el commit que contiene este fichero; su padre es 27e1a428ce3c35a215f0b7319ecf0fe399ee94df (igual a origin/main)

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

8. **`P0-2/homonyms-cannot-survive-flat-contract`: TEST DEFECT, retirado.**
   El caso entregaba al motor una fila **plana** y exigía que casara a la vez con
   dos propiedades homónimas cualificadas. Desde esa entrada el valor de uno de
   los grupos **ya no existe**: se perdió al aplanar. El oráculo era imposible y
   estaba en la capa equivocada. Se sustituyó por lo que **sí** se puede afirmar
   desde una entrada aplanada —que un dato ambiguo no se atribuye en silencio a
   una propiedad cualificada que no lo respalda, y que sin homonimia el nombre
   suelto sigue resolviendo— y la propiedad original se demuestra extremo a
   extremo en `filtersCore.normalizadores`. Ninguna expectativa de producto se
   cambió para conseguir verde.

7. **Comparador frente↔frente: emparejamiento entre documentos distintos.**
   Cuando los dos lados son frentes, el diff empareja por `external_id`, así que
   un elemento del documento D1 puede quedar emparejado con uno de D2 — y el
   censo B1 midió **2.146 externalIds presentes en dos frentes**. No es un
   lookup: es el algoritmo de compare, congelado. Cambiarlo altera lo que ve el
   usuario en una comparación frente-a-frente deliberada, así que es una
   **decisión de producto pendiente y queda FUERA de B1** por decisión del
   propietario (7-sep-2026). No bloquea B1.
## CURRENT TASK

**14-sep-2026 · PERMISOS · A (planos CAD para todos) y B («Editar» en la carpeta) — COMMIT LOCAL, SIN PUSH NI DESPLIEGUE.**
Probado en local (pytest 1841/1, banco 21/21, npm 6 bancos, pantalla del banco) y commiteado con autorización del
propietario («SI»). Espera la autorización del push y la del despliegue. Revisiones (flujos creados y rondas) y compartir varios documentos: solo análisis,
pendientes de sus decisiones. Ver «Unidad PERMISOS · A y B».

**13-sep-2026 · REVIEWS · E1 (detalle, navegación y semántica) — DESPLEGADA (`68b14b8` en Virginia y portal).**
Dictámenes del propietario: `E1 CODE/TEST GREEN LOCAL = PASS` y `E1 COMMIT = PASS`; despliegue manual
hecho por él el 13-sep y verificado. Falta su UAT en producción. E2 y cambios en Oregón: NO autorizados.
E1.1 (corrige H1–H4 de esa UAT) está DESPLEGADA (`8875f9e` en Virginia y portal, verificado): ver «Unidad REVIEWS · E1.1».
La UAT de la noche del 13-sep (bloques C y D) dio H5–H9 (`docs/reviews/E1_UAT_HALLAZGOS.md`, segunda parte): los datos
no se cruzan. E1.2 (H5, H6, H9 y el aviso H7-A) está DESPLEGADA (27e1a42 en Virginia y portal, verificado; el primer arranque del backend se colgó y se reinició): ver «Unidad REVIEWS · E1.2».
Primera entrega del programa funcional de Reviews que aprobó el propietario
(`docs/reviews/00_PROGRAMA_Y_DECISIONES.md`, decisiones D1–D9). Contrato e informe:
`docs/reviews/E1_CONTRATO_DE_ACEPTACION.md` y `docs/reviews/E1_INFORME_DE_CIERRE.md`.
Ver `[WIP HANDOFF]` en EXPECTED WORKTREE → «Unidad REVIEWS · E1». E2–E5 no han
empezado.

La unidad anterior (A `b913e8a` + B `5967760`) está en `origin/main` desde el 13-sep:
push del propietario, con Auto-Deploy comprobado en `Off` en los cuatro servicios
que siguen `main`. El propietario la desplegó a mano en el backend de Virginia y en
el portal. Oregón sigue en `cdf7837`; qué hacer con él es una decisión de
infraestructura aparte. Lo que sigue en esta sección es el estado anterior de
Filters.

**HOST DEFECT — POPOUT SCALE / CODE/TEST GREEN — pendiente validación HOST**

## STATUS

**B1 = CLOSED. B2 = CLOSED (71d23c7). B3 = CLOSED.**
**B4 = CLOSED. B5 = CLOSED. FILTERS CORE = CODE/INTEGRATION CLOSED.**
**HOST DEFECT POPOUT SCALE = CODE/TEST GREEN / COMMITTED.**
**HOST ENVIRONMENT = READY sobre 82ae5d9; no actualizado al follow-up.**
**HOST VALIDATION = BLOCKED / pendiente reensayo. H1 = FAIL histórico; H2–H6 = NOT EXECUTED.**

Follow-up local autorizado: únicamente ventana virtual del popout, fitness y
handoff. Máximo 103 filas físicas, un click delegado, mismo FilterResult B3 e
identidad cualificada. Edge aislado: 13.783 y 50k × 80 columnas PASS; 36 filas
DOM iniciales y 103 máximas. Mutante render-all muerto; restaurarVistaV2 150/150;
regresiones afectadas y build limpio PASS. **No significa HOST GREEN.**

Evidencia y reproducción: [POPOUT_SCALE_RESULTADOS](filters/POPOUT_SCALE_RESULTADOS.md).
El nuevo candidato es el commit de este follow-up:
`git log -1 --format=%H -- frontend-react/src/lib/inventoryFilterPopout.js`.
Base anterior: `82ae5d9f6e8945dc293e3075bb7d7570d72a5392`; baseline productivo
`3e413cd` intacto. No push, deploy, H1–H6, APS, backend ni BD en esta tarea.

La revisión final independiente de B5 se hizo el 8-sep-2026: diez ataques, un
defecto L2 real encontrado y corregido —color huérfano al retirar un modelo—
más un hueco L1 del plan HOST. Declarar B5 CLOSED es decisión del propietario.
El propietario aceptó B4 (`f38bc0c`, revisión `df2c03e`) y autorizó B5:
integración reproducible, escala/stress, lifecycle y preparación HOST/release.
No cambia el baseline productivo. No push ni deploy.
La revisión independiente de B4 se hizo el 8-sep-2026: diez ataques, ningún
defecto de producto. Declarar B4 CLOSED es decisión del propietario, no del
revisor.
La revisión adversarial independiente se hizo el 8-sep-2026 y dictaminó PASS,
tras corregir un defecto L2 real. El propietario aceptó el cierre de B3 y
autorizó B4. `6ddc5a0bbc648cfc7dcc52b06961f718cdb422f0` es EXPECTED REVIEW
DELTA de Claude sobre `c091c55`, no divergencia. No repetir la revisión B3.
Resultado único revisionado conectado a Viewer/Inventory/popout.
Todos los casos B3 históricos cumplen el mismo expected original.
Los dos KNOWN_FAIL históricos B4 (búsqueda/DnD) ahora son PASS con el mismo
expected original; cero resultados inesperados sanos. Mutante integrado intacto.
Evidencia: [filters/B3_RESULTADOS.md](filters/B3_RESULTADOS.md).
[filters/B3_WIP_VALIDATION.md](filters/B3_WIP_VALIDATION.md) es historia del
bloqueo ya resuelto, NO la instrucción vigente.
Checkpoint B3 verificado el 8-sep-2026:
**`c091c556acc3d0d1af884594f8e5ee259bcae162`**, descendiente de 71d23c7, titulado
`feat(filters): unify revisioned results across viewer and inventory`.
Ya contiene los 17 archivos del delta GREEN; no se creó otro commit funcional.
Este hash es una referencia al checkpoint anterior, no un requisito
autorreferencial del presente documento. Consultar HEAD real por separado.

## EXACT NEXT ACTION

**PERMISOS · A y B (14-sep-2026):** commit local hecho. Pedir al propietario la autorización del push (antes, releer
Auto-Deploy Off en Render) y después la de cada Manual Deploy (primero el backend de Virginia, con /api/health y «Booting
worker»; luego el portal, por contenido). Decisiones pendientes suyas: E1.3, contrato de rondas (D8) y paquete compartido
(`docs/reviews/E1_3_FLUJOS_CREADOS_Y_RECHAZO.md`, `docs/compartir/01_COMPARTIR_VARIOS_DOCUMENTOS.md`).

**REVIEWS · E1.1 (13-sep-2026):** `8875f9e` desplegado en el backend de Virginia (`/api/health` →
`8875f9ed1428`) y en el portal (`index-BU0VvNh3.js`, con E1.1). La UAT de la noche dio H5–H9
(`docs/reviews/E1_UAT_HALLAZGOS.md`). E1.2 está desplegada y verificada (`27e1a42`;
`docs/reviews/E1_2_INFORME_DE_CIERRE.md` §6). Siguiente: la UAT del propietario con los bloques F, D4 y G de
`docs/reviews/E1_GUIA_DE_PRUEBA.md`.

**REVIEWS · E1 (13-sep-2026):** E1 (`68b14b8`) está desplegado en el backend de Virginia y en el
portal, verificado por `/api/health` y por contenido. Esperar la UAT del propietario en producción y
su autorización para E2. Sin ella: ni E2, ni cambios en Oregón.

Producción medida el 13-sep-2026, tras E1.2 y el reinicio del backend:
- backend de Virginia (`visor-ecd-backend-va`): `/api/health` → `version 27e1a428ce3c`, también por el `/api` del portal y de `alephia.com.pe`;
- portal: sirve `index-DgYYQqZD.js`, con E1.2 (verificado por contenido en Render y en `alephia.com.pe`);
- Oregón (`visor-ecd-backend`): `version cdf783754574`, sin cambios.

Lo que sigue es el cierre de Filters del 10-sep; sus SHA son de esa fecha.

**Filters (10-sep-2026): ninguna.** El release y su hotfix están en producción.

**LOS DOS SHA DESPLEGADOS SON DISTINTOS Y ESO ES DELIBERADO.**

```
FILTERS CORE = PRODUCTION GREEN
P0..P9 PASS — evidencia: docs/filters/RELEASE_EJECUTADO.md

FILTERS POST-RELEASE HOTFIX = PRODUCTION GREEN   (10-sep-2026)

backend  visor-ecd-backend    0864878a985b9b30ea6a8e6859eda92b9031e5b6
View     visor-ecd-frontend   74f4dff1935fb174dcfbe5e77f7ad0351712363c
Docs     visor-ecd-portal     f5fe63d  (no se desplegó)

A · UX ............... ARREGLADO — presentación de baseline restituida
B · LATENCIA ......... ARREGLADO — 1402 ms -> 60 ms (baseline 3e413cd = 21 ms)
C · FLUJO DE DATOS ... CERRADO por el propietario
D · COLOR ............ EXPECTED · sin persistencia en ninguno de los dos sistemas
    + STATE/UI INCONSISTENCY en la LINEA DE ESTADO · ARREGLADA
evidencia: docs/filters/HOTFIX_POST_RELEASE.md
```

El hotfix es **sólo frontend**: `TandemFilterPanel.jsx`, `aps/utils/model.js`,
`lib/filterVisualDriver.js` y `lib/filterRuntimeBridge.js`, más el banco nuevo
`pruebas/filtersCore.hotfixPostRelease.prueba.mjs` y siete oráculos reapuntados
en `filtersCore.b4` / `filtersCore.b4Adversarial`. Backend, Docs, PostgreSQL y
migraciones: **sin tocar**. Que View vaya por delante del backend es correcto y
esperado hasta el próximo release; no es una desincronización que haya que
«arreglar» desplegando el backend.

**Verificación del despliegue, por contenido y no por el panel** (10-sep-2026):

```
View     assets/index-B3tSwlc8.js · 3.138.198 bytes
         las 5 cadenas de la UI retirada dan 0 en el paquete servido
backend  /api/health -> status ok · rama main · version 0864878a985b · postura 7/7
```

> **El primer Manual Deploy publicó el commit equivocado.** Construyó
> `index-DjGQhZe_.js`, que es el paquete de `0864878`, y el sitio quedó *live*
> con el código anterior aunque el commit ya estaba en `origin/main`. Se detectó
> porque el paquete servido aún contenía las cadenas que el hotfix elimina. **Un
> «Your site is live 🎉» no prueba qué código se publicó**: la comprobación buena
> es el hash del bundle en el log del build, o grep de un marcador en el paquete
> servido.

> **AVISO — pérdida de este fichero, 9-sep-2026.** Al cerrar el hotfix truncué
> `AI_WORKSTATE.md` a 0 bytes con un script mío mal escrito y hubo que
> restaurarlo desde `0864878`. Se perdieron los hunks de handoff **sin commit**
> del release (P0–P9, delta gate, ventana pública, barrera P2). **No se perdió
> evidencia**: todo eso vive versionado en `docs/filters/RELEASE_EJECUTADO.md`,
> `P0_PRECHECK.md`, `P1_BACKUP_RESTORE.md` y `RC_DELTA_GATE.md`. Las secciones
> anteriores de este fichero describen el estado **previo al release** y hay que
> leerlas con esa fecha en la mano.

### Handoff histórico — POPOUT SCALE (previo al release; superado)

[WIP HANDOFF]
TAREA: HOST DEFECT — POPOUT SCALE; código terminado, validación real pendiente.
IMPLEMENTADO: ventana virtual <=103 filas; revisión B3 e identidad intactas; 9 listeners constantes y cleanup; fitness 13.783/50k, navegador aislado, mutante, regresiones y build PASS.
PENDIENTE: integrar el follow-up en el entorno de ensayo mediante autorización separada; propietario/Claude retoman HOST. No afirmar H1 PASS antes del ensayo.
ARCHIVOS MODIFICADOS: propios frontend-react/src/lib/inventoryFilterPopout.js; frontend-react/pruebas/filtersCore.popout.prueba.mjs; frontend-react/pruebas/filtersCore.b3Adversarial.prueba.mjs; frontend-react/pruebas/filtersCore.b5Stress.prueba.mjs; frontend-react/pruebas/filtersCore.popoutScale.prueba.mjs; frontend-react/pruebas/filtersCore.popoutScaleMutants.prueba.mjs; frontend-react/pruebas/filtersCore.popoutBrowser.prueba.mjs; frontend-react/pruebas/filtersRuntime/popoutDom.mjs; docs/filters/POPOUT_SCALE_RESULTADOS.md; hunks selectivos de docs/AI_WORKSTATE.md. Ajenos: todos los de EXPECTED WORKTREE, incluidos los hunks históricos de docs/AI_WORKSTATE.md.
TESTS EJECUTADOS: node frontend-react/pruebas/<banco>.prueba.mjs: popout, scale, browser, mutante 1/1, runtime 17/17, runtimeMutants 4/4, b3Adversarial 7/7, adversarialMutants 3/3, B4 13/13, interacciones 8/8, integradas, B5 lifecycle/stress, inventoryIdentity, Saved Views y boundary; restaurarVistaV2 150/150; npm ci offline y build aislado exit 0, 516 módulos/14,11 s. Detalle reproducible en POPOUT_SCALE_RESULTADOS.
TESTS PENDIENTES: H1–H6 reales; no autorizados aquí. No se midieron GPU/heap del renderer HOST.
FALLO CONOCIDO: H1 FAIL del candidato previo 82ae5d9; follow-up sólo CODE/TEST GREEN. Sin fallo de popout reproducible pendiente en los bancos ejecutados.
NEXT EXACT ACTION: handoff del commit local para preparar el reensayo HOST con el nuevo SHA; esperar instrucciones, no modificar entorno por cuenta propia.
DO NOT TOUCH: B1–B5 CLOSED, Viewer/ViewerFacade/WIP ajeno, multi-color, Saved Views, backend/BD/APS, producción 3e413cd, secretos; no push/deploy ni reextracción.
COMMIT/HEAD REF: base 82ae5d9f6e8945dc293e3075bb7d7570d72a5392; el follow-up es el commit que contiene este handoff y inventoryFilterPopout.js (resolver mediante git log indicado arriba).

### Evidencia histórica B5 (cerrada; no repetir)

Checkpoint B5 de implementación local: lifecycle 5/5, stress 11/11,
memoria 25 scopes sin referencias históricas retenidas, mutantes 3/3,
escala 6/6, integración PostgreSQL + frontend 25/25. Regresiones verdes
salvo el fallo backend histórico aceptado. Detalle y archivos:
[filters/B5_RESULTADOS.md](filters/B5_RESULTADOS.md),
[filters/B5_HOST_RELEASE.md](filters/B5_HOST_RELEASE.md) y
[filters/evidencias/B5_CAMPAIGN.json](filters/evidencias/B5_CAMPAIGN.json).
Checkpoint B5 `e1a1601` creado y comprobado en checkout limpio:
npm ci 772 dependencias/20 s; build 516 módulos/15,24 s;
once bancos de integración pasan allí y ensayo PG18 + frontend 25/25.
Archivos propios B5: filterRuntimeBridge.js, filterVisualDriver.js,
pruebas/filtersCore.b5{BackendPayload,Lifecycle,Memory,Mutants,Scale,Stress}.prueba.mjs,
backend/herramientas/ensayo_inventory_b1_integrado.py (--b5), los tres documentos
anteriores y este handoff. Todos versionados; no queda WIP propio B5.
EXPECTED WORKTREE sigue siendo los cinco M ajenos y untracked históricos
declarados. No adoptarlos. Checks SHA256 de los cinco M coinciden con takeover.
PREDICT y todo WIP ajeno siguen protegidos. No push ni deploy.
El backend vivo registrado sigue en 3e413cd: desplegar este HEAD sin coordinación
arrastraría el cutover B1/B2. CODE/TEST GREEN no certifica host/LMV/GPU/producción.

### Checkpoint B4 — 8-sep-2026

**B4 CODE/TEST GREEN**, implementación acotada sobre `6ddc5a0`.
Informe canónico: [filters/B4_RESULTADOS.md](filters/B4_RESULTADOS.md).
El bloqueo anterior de permisos fue resuelto por autorización directa en chat.
No queda trabajo B4 local a medias; no se declara CLOSED ni validación de host.

- B4 fitness **13/13**; mutantes **3/3 muertos**.
- Interacciones e integradas: **8 PASS** cada una, cero KNOWN_FAIL y cero
  resultados inesperados; mutante integrado 1/1, expected históricos intactos.
- Regresiones B1/B2/B3/V2 aceptadas del WIP conservadas: restore 150/150,
  captura 63/63 y contrato 111/111; detalle completo en el informe.
- Build final con módulos protegidos tomados de HEAD sólo en memoria:
  **exit 0, 516 módulos, 14,14 s**, outDir temporal fuera del repo.
- Búsqueda completa antes de recorte, DnD canónico, estados desde FilterResult,
  selección count0 removible, pending no rotulado como cero y color por identidad.
- Múltiples propiedades de color conservadas con arbitraje B3 explícito.
  Sin cambios en motor/identity/runtime/driver/V2 ni en Viewer.
- Performance sintética aceptada: búsqueda entre 10001 valores mediana
  0,258 ms/p95 0,669 ms; 20 intenciones rápidas coalescidas en un cálculo.
- Commit B4: `feat(filters): complete b4 search and identity-safe interactions`,
  descendiente de `6ddc5a0`; consultar hash real en Git.
- WIP ajeno intacto; las 48 líneas ViewerFacade siguen sin commit.
- No navegador/React DOM/LMV GPU ni producción certificados. Receta manual en
  B4_RESULTADOS. No B5, push, deploy, backend ni DB.

### Evidencia de la revisión final independiente B5 — 8-sep-2026

**B5 FINAL INTEGRATION REVIEW PASS**, tras corregir un defecto L2 real.

- **L2 — un modelo retirado conservaba el tinte de Filters.** La retirada que
  añadió B5 en `bindModels` soltaba el gancho y quitaba el modelo de `painted`
  **sin retirarle antes el color**. El driver siguiente arranca con `painted`
  vacío, así que ese tinte ya no lo podía limpiar nadie: sobrevivía al propio
  `dispose()`. Es la misma invariante que B3 fijó para `dispose()` —el color
  propio se retira ANTES de soltar la propiedad—, que la ruta nueva no cumplía.
  Reproducido en aislamiento y alcanzable: `loadModelSequentially` no descarga,
  y en `reset3D` (`Viewer.jsx`, vuelta de lámina 2D a 3D) el `unloadModel` está
  comentado, así que se borra del registro un modelo que sigue en la escena.
  Los otros dos sitios que borran del registro descargan antes. El arreglo
  limpia sólo lo que Filters pintó y tolera que la instancia ya esté muerta.
- **L1 — el plan HOST no ejercitaba ese camino.** Ningún caso abría una lámina
  2D, que es el único gesto del visor que saca un modelo de `models()` sin
  descargarlo. Se añadió al caso 6 sin crear un séptimo.

**Ataques sin defecto.** Checkout limpio de `afe48dc` reproducido por el
revisor: `npm ci` desde lockfile y `npm run build` **exit 0, 516 módulos**, sin
ViewerFacade, `public/predict`, `.env` ni symlinks —los 517 del worktree son el
import ajeno del ViewerFacade—. Backend↔frontend: `ensayo_inventory_b1_integrado
--b5` ejecutado por el revisor sobre clúster PG18 desechable, **25/25 exit 0**,
clúster detenido. Migración/cutover: 31 revoca INSERT/UPDATE/DELETE/TRUNCATE en
`public.inventory_assets` **y** `public.asset_user_data`, y el rollback SQL trae
`B1_ROLE_GUARD`, `B1_OWNER_GUARD`, `B1_DATA_PRESENT` y ningún CASCADE —las dos
afirmaciones que la receta hace sobre el SQL son ciertas—. Lifecycle: un runtime
viejo no borra resultado ni espejos de uno nuevo, comprobado con dos runtimes
vivos de verdad y no sólo con el doble dispose. Escala y memoria: la campaña se
abstiene explícitamente de comparar protocolos distintos y de leer `heapUsed`
como prueba de ausencia de fugas; sus límites enumeran justo lo que mide.
Release: la receta es orden, no autorización, y cubre frontend-primero, backend
viejo tras 31, escrituras antes de HOST y los dos rollbacks.

**Bancos nuevos del revisor:** `filtersCore.b5Adversarial` (8 casos) y
`filtersCore.b5AdversarialMutants` (1/1 muerto: retirar sin retirar el color).

**Regresión:** filtersCore 38+1 knownFail 0; b5Lifecycle 5/5; b5Stress 11/11;
b5Memory 1/1 con 0 retenidos —exige `node --expose-gc`—; b5Scale exit 0;
b5Mutants 3/3; b5Adversarial 8/8; b5AdversarialMutants 1/1; runtime 17/17;
runtimeMutants 4/4; popout 1(16); b3Adversarial 7/7; adversarial V2 0/4;
normalizadores 11/11; boundary 6/6; b4 13/13; b4Mutants 3/3; b4Adversarial
19/19; b4AdversarialMutants 2/2; interacciones e integradas 8/8 con exit 0;
inventoryIdentity 17/17; inventoryConfig 20/20; lob4dIdentidad 26/26;
**captura 63/63, restore 150/150, V2 111/111**, frenteDeVistas 20/20;
`pytest` 1721 passed / 1 failed (el documentado); build exit 0.

**Límites:** HOST no ejecutado. Sin navegador, React DOM, LMV/GPU ni producción.
`filtersCore.b5BackendPayload` no es autónomo: lo alimenta por stdin el arnés
Python. Se certifica código, bancos y receta, no el host real.

### Evidencia de la revisión independiente B4 — 8-sep-2026

**B4 INTEGRATION REVIEW PASS. Ningún defecto de producto.** Diez ataques contra
el delta `6ddc5a0..f38bc0c`. B4 es capa de presentación: no añade otra autoridad
de matching, conteos, facetas ni selección global.

- **Búsqueda sobre el dominio completo.** Panel y configurador buscan primero y
  limitan después, en las dos listas. Buscar no toca conteos ni muta el
  `FilterResult`; limpiar devuelve el dominio y conserva la selección.
- **Reorder por identidad canónica.** `reorderProperty` opera sobre la lista
  completa por id; `originalIndex` se calcula antes de filtrar, así que Subir y
  Bajar usan el vecino canónico aunque la búsqueda esconda el intermedio. El
  arrastre se confirma sólo en `onDrop`: `onDragEnd` limpia sin reordenar.
- **El configurador no muta antes de Confirmar.** Escape, Cancelar y la X cierran
  sin llamar a `onUpdate`. Aplicar entrega el conjunto exacto, y el `onUpdate`
  real de App poda por id sólo las selecciones y colores de lo quitado.
- **Pending/zero/error.** El controlador publica una instantánea `pending` en
  cada `request()` y App vacía los buckets salvo `ready`: el zero de A no puede
  quedar vigente como estado de B, ni con el progreso viejo de A en mano.
- **El color de la UI es el del driver.** El swatch coincide con el tinte real
  en todos los valores y no depende del orden de la lista; con dos propiedades
  de color, la prioridad que el panel anuncia (`sort().reverse()`) predice
  exactamente la que gana en el driver (`sort()`, último escribe).
- **Sin segunda autoridad.** `filterPresentation.js` no importa motor,
  controlador ni driver, y el motor de matching se sigue llamando desde un solo
  sitio. Los seis `useState` nuevos son límites de render y términos de
  búsqueda; ninguno guarda estado de filtro.

**Fitness histórico:** los dos defectos B4 —búsqueda y DnD— pasan contra sus
`expected` originales, byte a byte; sólo cambió el cableado del banco. 0
KNOWN_FAIL propios de B4, 0 UNEXPECTED_FAIL, 0 UNEXPECTED_PASS.

**Bancos nuevos del revisor:** `filtersCore.b4Adversarial` (19 casos, reutiliza
el arnés del banco B4 en vez de copiarlo) y `filtersCore.b4AdversarialMutants`
(2/2 muertos: mutar la configuración antes de Confirmar, y dejar vigente el
resultado viejo durante pending —los dos ataques que `b4Mutants` no cubría—).

**Regresión:** filtersCore 38+1 knownFail 0; b4 13/13; b4Mutants 3/3 muertos;
b4Adversarial 19/19; b4AdversarialMutants 2/2; runtime 17/17; runtimeMutants
4/4; popout 1(16); adversarial 0 fallos/4 controles; b3Adversarial 7/7;
normalizadores 11/11; boundary 6/6; interacciones e integradas 8/8 PASS con
exit 0 y mutante integrado 1/1; inventoryIdentity 17/17; lob4dIdentidad 26/26;
inventoryConfig 20/20; captura 63/63; restore 150/150; V2 111/111;
frenteDeVistas 20/20; `pytest` 1721 passed / 1 failed (el documentado);
build con `--outDir` alterno exit 0, 517 módulos, 213 ficheros —517 y no 516
porque el `Viewer.jsx` del worktree importa el ViewerFacade ajeno, que no
existe en HEAD—.

**Límites:** sin navegador, React DOM, LMV/GPU, DB ni red. Se certifica código y
bancos, no el host real ni producción.

### Evidencia CODE/TEST del checkpoint B3

- Runtime 17/17, mutantes runtime 3/3, popout 1 escenario/16 aserciones.
- Interacciones e integradas: cada uno 6 PASS + 2 KNOWN_FAIL B4, cero
  inesperados; mutante integrado 1/1. Mantienen exit 1 del banco completo
  por B4; `b3Green=true` indica la puerta autorizada B3.
- Adversarial 10/10, mutantes B2 3/3, core 39 PASS, normalizadores 11/11,
  boundary 6/6; restore 150/150, captura 63/63, V2 111/111; inventoryIdentity
  17/17, inventoryConfig 20/20, frenteDeVistas 20/20, lob4dIdentidad 26/26.
- Build normal alterno exit 0 (516 módulos/11,19 s); build final con Viewer
  del índice sin las 48 líneas ajenas exit 0 (515 módulos/9,99 s).
- WIP ajeno preservado; ningún cambio de DB, .env, backend ni producción.
- Pendiente revisión independiente de integración. Host real no ejecutado;
  ver límites del informe. No se repitió la campaña al fijar este handoff:
  no hubo cambios de producto posteriores al GREEN.

### Evidencia de la revisión independiente B3 — 8-sep-2026

- Diez ataques numerados ejecutados contra `71d23c7..c091c55`. Nueve sin
  defecto; el décimo —propiedad de la máscara visual— destapó el L2 del color
  huérfano tras `dispose()`.
- Bancos tras el arreglo: filtersCore 38 CONTRACT + 1 BASELINE, knownFail 0,
  inesperados 0; normalizadores 11/11; boundary 6/6; runtime 17/17; mutantes
  runtime **4/4 muertos** (uno nuevo, `dispose-leaves-orphan-color`);
  popout 1 escenario/16 aserciones; adversarial de V2 0 fallos/4 controles;
  `filtersCore.b3Adversarial` 7/7; interacciones e integradas 6 PASS +
  2 KNOWN_FAIL B4 cada uno, 0 inesperados, mutante integrado 1/1;
  inventoryIdentity 17/17; lob4dIdentidad 26/26; captura 63/63, restore
  150/150, V2 111/111, frenteDeVistas 20/20.
- `python -m pytest -q`: **1721 passed / 1 failed**, el fallo preexistente del
  backlog nº 1 (`/api/docs/miniaturas/preparar` sin puerta de cliente).
- Build: `npm run build` en sitio vuelve a dar el `EPERM` de DIVERGENCIA 4
  —entorno, no código—; con `--outDir` alterno, **exit 0, 516 módulos, 11,45 s,
  213 ficheros**.
- Sin cambios de DB, `.env`, backend ni producción. WIP ajeno intacto.
- **Incidente de esta sesión, corregido:** al crear el banco nuevo se sobrescribió
  `filtersCore.adversarial.prueba.mjs`, que ya existía desde `71d23c7`. Se
  restauró a su contenido exacto de HEAD —56 líneas, idéntico— y el banco nuevo
  se movió a `filtersCore.b3Adversarial.prueba.mjs`. Los dos existen y pasan.
- Límites: sin navegador, React DOM, LMV/GPU, DB ni red. La revisión certifica
  código y bancos, no el host real ni producción.

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
| Integración B1 | `python -B backend/herramientas/ensayo_inventory_b1_integrado.py --pg-bin <bin> --confirm-disposable-only` | **23 / 23** INTEGRATION PASS — SQL, rutas y middleware reales sobre PG18 nuevo |
| Identidad Inventory (frontend) | `node frontend-react/pruebas/inventoryIdentity.prueba.mjs` | **17 / 17** |
| P0-2 normalizadores | `node frontend-react/pruebas/filtersCore.normalizadores.prueba.mjs` | 5 PASS + **3 KNOWN FAIL** (divergencia load/refresh caracterizada, defecto de B2) |
| Saved Views boundary | `node frontend-react/pruebas/filtersCore.savedViewsBoundary.prueba.mjs` | **6 / 6** — el contrato V2 CLOSED no necesita cambios |
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
