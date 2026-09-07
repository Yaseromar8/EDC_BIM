# Autodesk Tandem Filters vs ALEPHIA View Filters

Investigación y contrato aprobado · 6 de septiembre de 2026

Estado: benchmark aprobado por el propietario, con las tres decisiones de §8/§10 incorporadas. B1 autorizado para el siguiente ejecutor; implementación no iniciada.

## 1. Takeover — STATE MATCH

- Rama: `main`.
- CODE BASELINE: `3e413cd880fa1093afc4b4759422044e4642c2d6`.
- HEAD auditado: `cf7a845b8512260c746e316b36f07ddad88c7e40`.
- Posteriores al baseline: `8f58a4b docs(ai): add shared handoff protocol for coding agents` y `cf7a845 docs(ai): make handoff state verification non-self-referential`. Ambos documentales.
- `git merge-base --is-ancestor 3e413cd880fa1093afc4b4759422044e4642c2d6 HEAD`: salida **0**.
- Al iniciar y al concluir la inspección: los cuatro modificados preexistentes, +566/−116, y las 28 entradas untracked coinciden con EXPECTED WORKTREE. Se preservaron.
- CURRENT TASK al tomar el relevo: NONE. Esta investigación es el encargo nuevo del propietario. Saved Views 2.0 permanece CLOSED.

Se leyeron AGENTS, AI_WORKSTATE, AI_DECISIONS y la arquitectura relevante. Se coordinó la inspección en tres frentes: motor/semántica, UI/Inventory y evidencia Tandem; se contrastaron los hallazgos antes de consolidarlos. No se accedió a bases reales, cuentas Tandem ni producción. El estado de producción recogido en AI_WORKSTATE es **evidencia histórica**, no una nueva comprobación de esta investigación.

La investigación original no modificó código ni ejecutó commit, push o deploy. La entrega final incorpora únicamente las decisiones del propietario y el relevo de B1, en un commit exclusivamente documental. No se ejecutó B1, no se modificó código y no hubo push ni deploy.

## 2. Resumen ejecutivo

**Recomendación:** profesionalizar el motor existente, no sustituirlo por una réplica visual de Tandem ni crear otro framework.

ALEPHIA ya tiene filtrado genérico por propiedades, OR dentro de cada propiedad, AND entre propiedades y facetas cruzadas que ignoran su propia selección. Esa semántica sirve bien para explorar alternativas sin importar el orden del panel. El problema principal es que los datos, los resultados y su aplicación visual no tienen una única identidad y revisión compartidas. [A1][A5][A6]

Hay fallos reproducidos: editar datos puede dejar facetas antiguas; nombres de propiedad homónimos se mezclan; una identidad sin modelo puede asociarse al modelo equivocado; Inventory puede mostrar filas de otra fuente; nombres de valores válidos como `constructor` pueden romper el cálculo; un trabajo de color antiguo puede pintar después de apagarlo. Son problemas de corrección, no cosmética. Véase §6.

Tandem aporta referencias útiles de descubrimiento, búsqueda, visualización y explicación de ocultos. Su documentación describe una relación **secuencial** entre filtros, distinta del faceting cruzado de ALEPHIA; no hay motivo para copiar esa dependencia del orden. Tampoco existe evidencia pública suficiente para proclamar que uno de los dos es más rápido. [T1][T3]

Medimos el motor real de ALEPHIA con datos sintéticos: con 100.000 filas, cinco modelos y diez propiedades, una consulta fría tardó **533,00 ms**; siete consultas calientes tuvieron mediana **300,50 ms**. Sin selecciones, las diez facetas produjeron **1.000.000 objetos de referencia**. Esto justifica revisar el cálculo y las asignaciones, pero no equivale a medir la fluidez del navegador.

Propongo cinco bloques: fijar fixtures/baseline; corregir identidad/normalización/caché; unificar resultado y aplicación cancelable; corregir UX; cerrar con pruebas integradas y rendimiento. Se mantienen LMV 7, el cargador, Rosetta, PostgreSQL, Inventory config y Saved Views V2. No hacen falta IA, voz, otro ViewerAdapter, un backend nuevo ni una migración para comenzar.

**Benchmark y plan aprobados, con los ajustes del propietario de §8/§10. Sólo B1 está autorizado; Filters no está implementado ni listo para producción.**

## 3. Mapa técnico actual de ALEPHIA

### 3.1 Autoridades, formas y dependencias

Referencias A1–A20 enlazan al archivo y línea inicial exactos en el registro de evidencia al final.

| Componente / función | Archivo | Responsabilidad y dependencias |
|---|---|---|
| App, estados de filtros | [App.jsx:960][A1] | `filterProperties: string[]`, inicialmente Sources y Revit Category; `filterSelections: {[propId]: string[]}`; colores booleanos por propiedad. Autoridad React de la intención. |
| App, expansión/búsqueda | [App.jsx:960][A1] | Estados de presentación: filtros expandidos, búsqueda de facetas y cuántas propiedades mostrar. No equivalen a predicados. |
| FilterConfiguratorModal | [FilterConfiguratorModal.jsx:19][A9] | Copia temporal `currentSelection`; búsqueda, añadir/quitar y arrastrar. Update publica la lista ordenada en App. |
| App, handlers de selección | [App.jsx:4043][A4] | Resuelve ids contra esquema; `handleValueToggle`, `togglePropertyAll`; emite recálculo. El esquema no encontrado se oculta de la lista visible. |
| App, preload / refresh | [App.jsx:2418][A2], [App.jsx:2595][A3] | Descarga Inventory; normaliza y aplana; genera esquema; publica `window.postgresInventory` y `inventory-ready`. Son dos normalizadores distintos. |
| getCachedInventory / setCachedInventory | [inventoryCache.js:22][A16] | IndexedDB de filas ya mapeadas y esquema. App compara count/last_updated/user_updated del backend antes de reutilizar. No es `_facetCache`. |
| calculateBucketsFromPostgres | [model.js:491][A6] | Cálculo síncrono de facetas y coincidencias, usando filas, selecciones, Rosetta y Sources ocultas. No consulta PostgreSQL durante cada clic. |
| _buildFacetIndex / _rosettaFingerprint | [model.js:399][A7] | Caché normalizada de filas y presencia de columnas; invalida por referencias y una huella incompleta de Rosetta. No es un índice invertido. |
| handleRecalculateFilters | [Viewer.jsx:1287][A5] | Recibe `recalculate-filters`; debounce de 50 ms; calcula, publica globals/buckets y aplica aislamiento a modelos LMV. |
| handleTheme / processGPUBuffer | [Viewer.jsx:1549][A17] | Color por bucket; cruza con ids válidos; aplica en lotes de 5.000 con pausas. No cancela trabajos anteriores. |
| Rosetta y readiness | [Viewer.jsx:1017][A18] | Mapa URN→externalId→dbId para hojas físicas; inverso para nodos; puente IfcGUID; emite `rosetta-ready` y anuncia modelo listo. |
| TandemFilterPanel | [TandemFilterPanel.jsx:29][A8] | Facetas y counts; búsqueda, expansión, checkboxes, colores y reset. Sources especial trabaja con modelos ocultos, no con el diccionario normal de selecciones. |
| InventoryDataGrid | [InventoryDataGrid.jsx:559][A10] | Deriva filas desde buckets o restricciones manuales, aplica Sources/Assets only; selección y Sync locales; virtualiza filas. No es autoridad única de Filters. |
| inventoryConfig | [inventoryConfig.js:48][A19] | Configuración canónica de tabla fuera del montaje del panel. Debe mantenerse. |
| capturarEstadoActualV2 / capturarVistaV2 | [App.jsx:1699][A20], [capturarVistaV2.js:325][A12] | Captura intención de filtros y apariencia; traduce identidades de fuentes al persistir. No guarda la caché de buckets. |
| restaurarVistaV2 / resolverSeleccion | [restaurarVistaV2.js:860][A13], [preflightFiltros.js:67][A15] | Espera datos, valida contra inventario actual, restaura filtros y espera su señal. Interfaz existente, no rediseñada. |
| limpiar sesión de frente | [frenteSession.js:21][A14] | Limpia globals de inventario/Rosetta/resultados al cambiar de frente. La caché privada del módulo no tiene aquí invalidación explícita. |

**Canónico hoy:** intención React, configuración Inventory en su módulo y documento Saved View al persistir. **Derivado pero con poder de autoridad accidental:** `dynamicFilterBuckets`, `_lastCalculatedBuckets`, `_lastValidDbIds`, `_lastHasActiveFilters`, `_lastThemeEventConfig`. El grid llega a escribir `_lastHasActiveFilters`; el motor de color lo lee. El montaje del panel y el orden de eventos pueden por ello influir en resultados visuales. [A4][A5][A10][A17]

**Estado repartido:** `hiddenModelUrns` vive en App y su ref en Viewer; selección/aislamiento real viven también en LMV. App conserva un conjunto de aislamiento, pero el grid declara otro estado local y no recibe efectivamente esa prop. No existe un único snapshot público de consulta aplicada, ids resueltos, visibilidad y revisión. [A10][A21]

### 3.2 Pipeline real

```text
Inventory HTTP / caché IndexedDB
  → App: filas planas + esquema
  → postgresInventory / viewer-schema-extracted / inventory-ready

Configurar propiedades o seleccionar valores en el panel
  → App: filterProperties / filterSelections
  → recalculate-filters
  → Viewer: debounce 50 ms
  → calculateBucketsFromPostgres + Rosetta + hiddenModelUrns
  → buckets + globalValidDbIds
  → globals + filters-calculated
       ├─ App → panel y sus counts
       ├─ Inventory → reconstruye filas filtradas
       └─ replay de colores
  → aislamiento por modelo y hojas físicas
  → theme-property-bucket → lotes de color → viewer-colors-applied

Guardar vista
  → capturarVistaV2: intención y configuración, no buckets
Restaurar vista
  → readiness + preflight → recalculate-filters → señal existente
```

El orden importa: `filters-calculated` se emite **antes** de aplicar visibilidad, y su payload es sólo el mapa de buckets; no contiene revisión, ids finales o prueba de fotograma aplicado. Hay dos caminos de recálculo en App y dos listeners que actualizan buckets; el debounce puede agrupar peticiones, pero no constituye cancelación de todo el pipeline. También hay replay de color desde App y desde Viewer. [A4][A5][A17]

Existe código nativo APS para extracción/cálculo en el mismo módulo, pero el handler inspeccionado usa Inventory y, si éste falta, avisa en consola y retorna: **no hay fallback nativo conectado en esa ruta**. El listener legado `isolate-property-bucket` tampoco debe confundirse con el flujo principal. [A5][A6]

### 3.3 De dónde proceden los datos

La extracción backend consulta metadata APS, mezcla propiedades heredadas de ancestros y propias, hace normalización/filtros de Civil/Revit y guarda JSON agrupado en `inventory_assets.properties`. Por tanto el universo ya ha sido depurado **antes** de Filters; no representa todos los nodos LMV. [A22]

`get_inventory` combina datos nativos y `asset_user_data` mediante COALESCE, añade extras bajo `Live Edit`, y devuelve campos operativos más `properties`. Con propiedades incluidas, el `model_urn` de la respuesta puede ser el source URN, mientras el `model_urn` almacenado se utiliza como ámbito/frente. **No son conceptos intercambiables pese a compartir nombre.** [A23]

Forma conceptual localizada, no un esquema inventado:

```text
fila HTTP
  external_id
  model_urn / source_urn
  name, material, installation_status, vaciado_nro...
  properties
    grupo
      nombre → valor

fila preparada por App
  dbId = external_id     ← NO es el dbId LMV
  model_urn / source_urn
  Name / Material / Status / Vaciado_Nro
  nombrePlano → string   ← pierde grupo y tipo

Rosetta[sourceUrn][externalId] → dbId LMV
bucket.values[] → value, count, totalCount, dbIds[{id, modelUrn}]
```

El esquema conserva `grupo::nombre`, pero la fila sólo `nombre`: dos grupos homónimos pueden sobrescribirse. El código además elimina prefijos Civil con reglas diferentes entre carga y refresh. Los tipos se convierten a texto; arrays pasan a un único string separado por comas. No hay búsqueda numérica genérica ni operadores de rango en este camino. [A2][A3][A6]

**Frontera de identidad a no ignorar:** App envía `target_urn = selectedProject.id` (frente). El upsert de extracción utiliza `(model_urn, external_id)`, y el join de metadatos de usuario sólo `external_id`. Si dos fuentes del mismo ámbito comparten ese externalId, mejorar la identidad en frontend no recupera información que se haya sobrescrito o combinado antes. Es una condición visible en SQL; **no se comprobó su incidencia en datos reales ni se modificó el esquema**. Su reproducción en BD desechable es una puerta explícita de B1, con las tres salidas fijadas en §10 según la cobertura requerida. [A26][A27][A28]

### 3.4 Semántica y faceting comprobados

| Caso | Comportamiento actual y evidencia |
|---|---|
| Una propiedad, varios valores | OR por igualdad exacta con `includes`. [A6] |
| Varias propiedades | AND entre selecciones no vacías, aunque una propiedad ya no se vea en el panel. [A6][A4] |
| Ninguna selección / array vacío | No restringe. Retirar el último valor vuelve a todos. `globalValidDbIds=[]` puede significar “sin restricciones”, no cero. [A4][A6] |
| Faceta de P | Aplica filtros de las otras propiedades y excluye la selección de P: faceting cruzado/disyuntivo. [A6] |
| count | Filas que aportan ese valor bajo los otros filtros; no necesariamente elementos únicos. [A6] |
| totalCount | Filas para ese valor sin selecciones, pero excluyendo Sources ocultas. No es el total de toda la base. [A6] |
| Orden de valores | Reales primero, después no asignados/no aplicables; count descendente y desempate textual. No orden numérico. [A6] |
| Repeticiones | Valores iguales comparten bucket; filas duplicadas incrementan count e ids. Viewer deduplica posteriormente con Set. [A5][A6] |
| null / vacío | En el motor directo convergen a ausencia. En la carga de App, null escalar se convierte antes a texto `"null"`. El grid propio puede convertirlo a vacío. [A2][A6][A10] |
| Ausencia | Si alguna fila de ese modelo tiene valor en la columna: `(Unassigned)`; si ninguna: `(No aplica)`. Se infiere desde valores, no desde esquema. [A7] |
| 0, false, N/A | Strings `"0"`, `"false"`, `"N/A"`; no son ausencia. [A6] |
| Propiedad inexistente | Puede parecer “No aplica”; si desaparece del esquema, App no la dibuja aunque la selección persista. [A4][A6] |
| Sources | El motor admite selección de URNs; el grupo especial de UI controla `hiddenModelUrns`. Son dos mecanismos actuales. [A6][A8] |
| Ocultos por Source | Se excluyen antes de calcular usando URN original/normalizado. Un fallback hacia otro modelo puede eludir esa prueba. [A7] |
| Fuera de Inventory | No participa en facets. Sin correspondencia Rosetta, la fila se omite; el fallback global puede rescatarla equivocadamente. [A7] |
| Selección manual | No modifica directamente el predicado de filtros; aislamiento/Sync del grid pueden prevalecer sobre las facetas. [A10][A21] |
| Cero coincidencias | Viewer usa `isolate([-1], model)` para dejar contexto ghost; no cambia a “mostrar todo”. El panel no explica suficientemente la causa. [A5][A8] |
| Una coincidencia | Mismo algoritmo; no se localizó auto-fit en la ruta principal de recálculo. [A5] |
| Miles | Cálculo síncrono; filtrado adicional de hojas del árbol; color por lotes. No hay ruta especial por cardinalidad del resultado. [A5][A17] |

La unión de buckets seleccionados que hace Inventory **no demuestra un OR incorrecto entre propiedades**: como cada bucket ya aplica las demás selecciones, esa unión puede representar el AND correcto. El fallo reproducido es perder el ámbito de modelo al pasar a un Set de externalIds. Esta hipótesis se contrastó entre las dos auditorías para no reportar un falso positivo. [A10]

### 3.5 Rendimiento: coste y medición

Sea N filas preparadas, P propiedades visibles, F propiedades restringidas, K valores seleccionados y R claves de Rosetta. Aproximación del camino caliente: **O(R + N×F×K + N×P×F×K)**, además de normalización inicial y materialización de buckets. Los factores reales dependen de cortocircuitos y cardinalidad; no es simplemente O(N). `_rosettaFingerprint` recorre claves incluso con caché caliente. [A6][A7]

Otros costes localizados: copias completas de filas en el grid; arrays de ids por cada faceta; comprobación de hojas en LMV; búsqueda `findIndex` por valor para colorear, con comportamiento cuadrático respecto al dominio cuando se recorre completo; agrupación y totales del grid. La virtualización del grid reduce DOM, **no** esos cálculos. La faceta expandida no virtualiza valores. [A5][A8][A10][A17]

Medición ejecutada con la función real, datos sintéticos en memoria, Node 24.14.0, Windows x64, i5-11400H, 12 CPU lógicas y 47,74 GiB RAM. Cada caso de tabla se ejecutó en proceso separado: diez propiedades, veinte valores por propiedad, una selección. Warm: siete repeticiones; memoria retenida medida después de GC.

| Modelos | Filas totales | Fría | Caliente mediana | Rango caliente | Caché retenida |
|---:|---:|---:|---:|---:|---:|
| 1 | 20.000 | 127,06 ms | 67,11 ms | 61,55–96,90 ms | +3,98 MiB |
| 5 | 100.000 | 533,00 ms | 300,50 ms | 243,69–442,65 ms | +19,33 MiB |
| 1 | 100.000 | 849,70 ms | 310,43 ms | 245,80–389,71 ms | +19,33 MiB |

Otro proceso, 100k/5 modelos/10 propiedades/sin selección: 366,56 ms frío; **1.000.000 objetos `{id,modelUrn}`**; heap retenido caché+resultado +67,65 MiB. Soltando el resultado: +19,30 MiB de caché.

Límites: no son modelos reales, navegador, GPU, FPS, pico de memoria, churn ni latencia clic→fotograma. No se obtuvo p95 defendible con siete repeticiones. La diferencia entre uno y cinco modelos al mismo N **no demuestra causalidad**; la máquina es compartida. Se descartó una primera interpretación de memoria secuencial y se repitió aislando procesos.

### 3.6 UX actual

Hay configurador por nombre/grupo, búsqueda por valor, expansión de cinco en cinco, agrupación Sources, colores personalizados, reset y counts. Pero buscar se hace **después** de recortar los primeros cinco valores; arrastrar con búsqueda usa índices de la lista filtrada sobre la lista completa. Ambos fallos se reprodujeron con fragmentos reales. [A8][A9]

La UI muestra todos los checks activos cuando no hay restricción, pero puede decir “0 of N”. Al quitar una propiedad del configurador no se borra su selección. Cero datos, carga y fallo no tienen estados inequívocos; `isProcessing` no representa un ciclo completo de trabajo. También faltan controles semánticos accesibles de teclado en las facetas. La prioridad no es cambiar el aspecto: es que la interfaz describa fielmente el predicado y el resultado. [A4][A8][A9]

## 4. Tandem: investigación y certeza

Fuentes consultadas el 6-sep-2026. **Documentado** significa que lo afirma la fuente indicada; no equivale a ensayo independiente del producto actual. No se inició sesión ni se observó una sesión real de Tandem. No se confunden las APIs públicas con la implementación de su UI.

| Ref. / certeza | Hallazgo acotado | Límites |
|---|---|---|
| **T1, alta documental**, ayuda Filters | Propiedades Standard/Asset/Design; búsqueda y reordenamiento. Describe aplicación de arriba abajo; hover, aislamiento, color, clustering, buckets numéricos/fechas, reset y aviso de elementos ocultados manualmente. [T1] | No especifica álgebra completa, denominadores, null, selección cero ni algoritmo interno. |
| **T2, alta documental**, ayuda Views | Guarda filtros, columnas y apariencia: color, clustering, cámara/focal y cortes; no conserva paneles abiertos. [T2] | No publica el formato serializado ni comportamiento preciso ante propiedad borrada o nueva versión. |
| **T3, media-alta documental**, tutorial Autodesk, 6-sep-2024 | Muestra Sources, casillas, búsqueda por grupo y “more”; en un ejemplo, elegir fuente reduce espacios disponibles de 55 a 33. [T3] | Esos números son espacios disponibles, no benchmark de elementos por bucket. El propio artículo advierte que el producto evoluciona. |
| **T4, media / histórica**, respuesta Autodesk, 20-sep-2023 | Filters determina las filas de Inventory; el filtrado de columnas de la tabla funciona separadamente y no dirige el coloreado 3D en ese flujo. [T4] | No demuestra que sea idéntico en septiembre de 2026; no prueba estado único ni sincronización bidireccional completa. |
| **T5, alta para API, no para UI**, APS, 17-ene-2025 | `POST scan` consulta por modelo; admite keys, propiedades cualificadas y familias; `GET schema` describe propiedades. Puede limitar payload y consultar historia. [T5] | No demuestra faceting server-side, workers, índices ni latencias de Filters. |
| **T6, alta documental**, ayuda Files | Gestiona fuentes RVT/IFC y carga por defecto; una fuente no visible por defecto puede activarse después. [T6] | No demuestra que ocultar mediante Filters descargue geometría o purgue datos. |

**No verificado:** OR exacto dentro de propiedad, AND completo entre propiedades, mantenimiento de seleccionados a count 0, etiquetas empty/not-set, orden de valores, igualdad numérico/string, ghost con cero, estructura de persistencia, version drift, rendimiento con datasets equivalentes y estrategia interna de índices/lazy facets.

No se encontró evidencia pública suficiente de esas cuestiones en las fuentes consultadas. Por eso no se asigna ganador técnico por intuición ni se presenta “Tandem escala mejor” como un hecho.

## 5. Matriz Tandem / ALEPHIA

“Ganador” significa ventaja demostrable **para este encargo**; ND = no determinable con evidencia disponible. Prioridad según impacto en ALEPHIA, no según prestigio del competidor. T y A enlazan a las fuentes de este informe.

| Criterio | Tandem | ALEPHIA hoy | Ganador | Brecha / importancia | Evidencia |
|---|---|---|---|---|---|
| Modelo mental | Secuencial documentado | Facetas simétricas; UI ambigua | ALEPHIA en semántica recomendada, no UX medida | Explicar todos/OR/AND, P1 | [T1][A4][A6] |
| Facilidad de uso | Flujo guiado documentado | Similar; fallos de interacción | ND sin prueba de usuarios | Corregir flujo antes de estilo, P1 | [T3][A8][A9] |
| Descubrimiento | Catálogo configurable | Esquema dinámico con deriva | ND | Identidad estable, P0 | [T1][A2][A3] |
| Buscar propiedades | Disponible | Nombre/grupo | Paridad básica | Feedback vacío, P2 | [T1][A9] |
| Buscar valores | Documentado | Sólo primer tramo sin expandir | Tandem en cobertura documentada | Buscar dominio completo, P1 | [T3][A8] |
| Faceting | Dependencia descendente | Autoexclusión de faceta | ALEPHIA para exploración sin orden | Conservar, corregir caché, P0 | [T1][A6][A7] |
| Counts | Denominador no verificado | Filas contextual/global; posibles duplicados | ND | Elementos únicos y definición, P0 | [T3][A6] |
| Multi-select | Casillas documentadas; álgebra ND | OR exacto | ALEPHIA auditable; paridad no probada | Conservar y explicar, P2 | [T3][A6] |
| AND/OR | Formalismo ND | AND/OR comprobado | ND comparativo | Contrato explícito, P1 | [T1][A6] |
| Filtro entre modelos | Varias fuentes | Soportado; fallback ambiguo | ND | Identidad con fuente, P0 | [T3][A7] |
| Sources | Visible en flujo documentado | Ocultos y selección como dos estados | ND | Coherencia de máscaras, P0 | [T3][A8] |
| Vacío/null/not-set | ND | Depende de ruta de carga | ND | Normalización y presencia, P0 | [A2][A3][A7] |
| Cero resultados | ND | Ghost, sin explicación completa | ND | Cero distinto de pendiente/error, P1 | [A5][A8] |
| Feedback visual | Aviso de ocultos | Sin diagnóstico equivalente completo | Tandem documental | Estado explicado, P1 | [T1][A8] |
| Viewer / color | Visualización documentada | Conectada; carrera reproducida | ND en robustez comparativa | Cancelación y propietario, P0 | [T1][A17] |
| Inventory | Relación descrita en 2023 | Conectado; identidad y montaje divergentes | ND actual | Consumir resultado único, P0 | [T4][A10][A21] |
| Persistencia | Documentada | V2 implementado y banco verde | Ambos tienen; ND superioridad | Mantener interfaz, sin reabrir | [T2][A12][A13] |
| Cambio de versión | Detalle ND | Linaje/rebind/readiness explícitos | ALEPHIA: evidencia interna más precisa | No prometer estabilidad externa universal | [A12][A13][A18] |
| Federación | Documentada | BIM/Civil + Rosetta | ND | Colisiones y cobertura, P0 | [T6][A7][A18] |
| Rendimiento | Sin baseline comparable | Mediciones sintéticas §3.5 | ND | Medir navegador, P1 | [T5][A6] |
| Escalabilidad | API granular | Descarga/caché local; listas por faceta | ND | Perfil e índice selectivo, P1 | [T5][A2][A7][A16] |
| Claridad de estado | Algunos estados documentados | Autoridades repartidas | ND global | Snapshot/revisión, P0 | [T1][A4][A10] |
| Diagnóstico | Internals ND | Consola y señal sin fase aplicada | ND | Reporte estructurado, P1 | [A5][A17] |
| Rangos numéricos/fechas | Documentados | Strings exactos | Tandem | Posponer operadores; P2 | [T1][A6] |
| Clustering | Documentado | No en pipeline de filtros inspeccionado | NO COPIAR ahora | Distorsiona lectura espacial; fuera del mínimo | [T1][A5][A17] |

## 6. Top brechas y pruebas adversariales

P0 se usa como pidió el propietario: resultado incorrecto, pérdida de estado o ruptura de corrección; **no** como afirmación automática de incidente de producción.

### P0 — corregir antes de considerar profesional el Core

1. **Caché obsoleta por mutación.** La misma fila cambia Before→After y el siguiente cálculo devuelve Before; un nuevo array devuelve After. Live edit y bulk mutan datos en sitio. La huella Rosetta tampoco detecta remapear id1→id99 conservando referencias/cardinalidad. Reproducido con funciones reales. [A7][A11]
2. **Identidad de propiedad y normalización incoherentes.** G1::Estado/G2::Estado acaban leyendo la misma columna; carga/refresh producen G3::Name frente a G3::G3_Name. El esquema de Status/Vaciado sintético tampoco se reconstruye igual. Puede haber filtros activos invisibles. Reproducciones de fragmentos reales. [A2][A3][A4][A15]
3. **Identidad federada incorrecta.** Fila de fuente no cargada con externalId compartido se asigna al primer modelo; incluso ocultando m1 devuelve m1/id11. En el grid, seleccionar mA/extx deja también la fila mB/extx. Reproducido. Añadir la precaución backend de §3.3: no esconderla con un parche frontend. [A7][A10][A22][A23]
4. **Valores arbitrarios rompen diccionarios.** `constructor`, `toString` y `__proto__` producen error al acumular buckets. En proceso aislado, `__proto__` además añadió `Object.prototype.count = NaN`. No se ensayó explotación ni se alteró ningún proceso persistente. Usar diccionarios seguros/Map es corrección, no cosmética. [A6]
5. **Counts no son conjuntos únicos.** Dos filas del mismo elemento generan count2 y dos referencias; el Viewer muestra un id tras deduplicar. Reproducido sintéticamente; incidencia real no medida. [A5][A6]
6. **Trabajo de color obsoleto.** Se extrajo `handleTheme` real con LMV simulado y temporizadores controlados: 5.001 ids → primer lote pinta 5.000 → apagar deja 0 → reanudar trabajo viejo pinta 1 y vuelve a emitir grupos de colores. Es prueba del algoritmo, no un ensayo GPU. [A17]
7. **Resultado de Inventory depende de entrada/montaje.** Assets only sobre una fila preload sin `_nodeType` deja cero; reproducido. El aislamiento anterior a abrir el panel se pierde por la firma/estado local: evidencia de código, pendiente de smoke visual. [A10][A21]

**P0 adicional acotado de UI:** arrastrar BB sobre BC buscando “B” en [A,BB,BC] produce [BB,A,BC], no [A,BC,BB]. Cambia el estado equivocado; no cambia el AND del motor, pero debe corregirse en el bloque de UX. [A9]

### P1 — uso profesional y cierre verificable

- Buscar Valor6 encuentra cero colapsado y uno expandido. Sync se deshabilita al cambiar {A}→{B} si ambos conjuntos tienen tamaño1. Reproducidos. [A8][A10]
- Múltiples autoridades/replay, cero sin causa y ausencia de revisión aplicada; búsqueda, tabla y Viewer pueden comunicar estados distintos. [A4][A5][A10]
- Rendimiento main-thread y materialización repetida de ids, ya medidos en §3.5. Antes de worker/backend: perfil navegador y eliminación de repetición evitable. [A6][A7]
- El cambio de dataset debe representar confirmación real del servidor: bulk no comprueba `res.ok` antes de mutar el estado local en el fragmento inspeccionado. Riesgo de frontera, no ensayo de escritura ni auditoría general de edición. [A24]

### P2 — mejoras importantes posteriores a corrección

Controles accesibles, labels “Todos/sin restricción”, orden estable de colores, búsqueda vacía honesta, selección visible de valores a count0, unidades/tipos preparados para futuras operaciones. Rangos y fechas requieren contrato tipado explícito y compatibilidad de persistencia; no incluirlos disimuladamente como strings especiales.

### Resultado de las comprobaciones ejecutadas

- Pruebas puras en memoria del motor: álgebra, self-exclusion, caché, Rosetta, homónimos, duplicados, fallback oculto y valores reservados. Fallos observados documentados, no “tests verdes” ficticios.
- Ocho reproducciones de fragmentos UI/datos: búsqueda truncada, DnD filtrado, homónimos, null/0/vacío, deriva de schema, Assets only, externalId repetido, Sync de igual tamaño.
- Una reproducción controlada del handler de color real: carrera confirmada.
- Banco existente: `node frontend-react/pruebas/savedViewV2.prueba.mjs` → **111/111, exit 0**. No cubre todos los casos nuevos.
- No se ejecutaron build, lint, suite backend, HTTP real ni scripts de base de datos: no hubo cambio de código. Los resultados históricos de AI_WORKSTATE no se presentan como pruebas nuevas.

El preflight actual también colapsa nombres homónimos y maneja diferente columnas sólo null/selecciones con espacios. Eso es evidencia de una frontera de semántica a cubrir; **no se ha demostrado una nueva regresión end-to-end de Saved Views ni se reabre su arquitectura**. La implementación deberá frenar y pedir alcance si necesita alterar ese contrato cerrado. [A15]

## 7. Adoptar, conservar y NO copiar

### Tandem hace mejor, según evidencia disponible

Tomar como referencia su descubrimiento documentado, búsqueda por grupo y explicación de ocultos, sin presumir equivalencia exacta de implementación. Los rangos constituyen una capacidad adicional documentada, pero no son requisito del cierre inicial. [T1][T3]

### ALEPHIA tiene ventajas que deben conservarse

Facetas cruzadas independientes del orden; propiedades operativas de obra procedentes del inventario; Rosetta y el puente IFC; frontera explícita linaje/URN y configuración Inventory fuera del panel. Son capacidades comprobadas de ALEPHIA, **no prueba de que Tandem carezca de alternativas equivalentes**. [A6][A12][A18][A19][A23]

### Podemos superar el estado actual de ambos para este uso

Recomendación: mismo conjunto identificado detrás de count/tabla/3D, explicación de ceros y exclusiones, colores deterministas y diagnóstico reproducible por revisión. La ventaja sería la verificabilidad del trabajo BIM, no una afirmación publicitaria contra Tandem.

**NO COPIAR ahora:**

- Dependencia del orden del panel para explorar datos: conservar faceting simétrico.
- Clustering espacial como requisito de Filters: la revisión de obra depende de posición real.
- Un ecosistema de plantillas/activos operativos ajeno al alcance.
- Un segundo estado autoritativo para tabla y visor; tampoco eliminar filtros locales útiles de tabla, sino etiquetarlos.
- Arquitectura backend supuesta a partir de apariencia o lenguaje comercial.
- Refactor global del Viewer, motor nuevo, otro adapter o integración IA como parte de este bloque.

4D/5D y Civil pueden consumir después conjuntos de elementos verificados; sus reglas temporales/coste no entran en el predicado de Filters.

## 8. Target Contract aprobado — comportamiento observable

Esta sección registra el **contrato aprobado con las decisiones del propietario**, no código ya implementado. Los nombres finales del resultado se fijan en B1; la exclusividad de color sigue pendiente de decisión de producto en B4. Saved Views V2 no se altera.

### 8.1 Estado y universo

- Un único `FilterState` de intención: propiedades ordenadas, selecciones exactas por propertyId, Sources/política visual y configuración de colores, sin presuponer exclusividad. La búsqueda/expansión pertenecen a UI, no al predicado.
- Un `DatasetSnapshot` inmutable: scope, revisiones de datos/esquema/modelos/Rosetta, filas con identidad cualificada y propiedad cualificada, cobertura y exclusiones.
- Un `FilterResult` derivado con señales inequívocas equivalentes a `hasActivePredicates`, `status`, `revision` y conjunto `matches`, además de ids por modelo, facets/counts, cobertura y diagnóstico. Los nombres finales se deciden en B1. Inventario y Viewer consumen **ese** resultado; nunca infieren su significado de un array vacío por sí solo.
- **Decisión del propietario — resultado cero:** ausencia de predicados y predicados activos con cero coincidencias son estados distintos. Un resultado vigente y resuelto sin predicados se identifica explícitamente como tal, incluso si el universo está vacío; un resultado vigente y resuelto con predicados activos y matches vacío representa cero coincidencias. Pending/error no son cero resuelto. Estado, revisión y presencia de predicados deben acompañar siempre al conjunto de matches.
- Identidad de elemento runtime: (URN exacto, externalId canónico); dbId sólo como resolución LMV. En el borde persistente se usa linaje según V2. ExternalId/IfcGUID puede sobrevivir a revisiones si el exportador lo mantiene: no es una garantía universal.
- Universo básico: elementos únicos del inventario del frente que se resuelven a hojas físicas de modelos cargados y preparados, excluyendo Sources ocultas. Filas sin correspondencia no se asignan por externalId global.
- Elementos duplicados/ambiguos se diagnostican, no se cuentan dos veces ni se adivinan. Elementos fuera del inventario no forman parte de los resultados, aunque se permita contexto ghost.

### 8.2 Semántica y edición

OR entre valores de una propiedad, AND entre propiedades. Ordenar el panel no cambia coincidencias. Igualdad exacta sobre un valor canónico, con trim consistente en todas las entradas; búsqueda textual case-insensitive sólo descubre valores, no cambia igualdad.

En la intención `filterSelections`, ausencia de selección/array vacío = sin restricción, como hoy. Quitar el último valor vuelve a Todos y debe decirlo. Esto no define el resultado: `FilterResult` siempre distingue ausencia de predicados de cero coincidencias mediante las señales de §8.1, nunca mediante `matches=[]` por sí solo.

Quitar una propiedad mediante el configurador elimina su selección **al confirmar Update** y avisa si tenía restricción; buscar u ocultar visualmente una tarjeta no elimina predicados. Si desaparece del esquema por refresh, la selección sigue visible como “propiedad no disponible”; no se descarta ni se ejecuta como si no existiera.

### 8.3 Facets y counts

Para propiedad P y valor v:

- Dominio = universo preparado después de Sources.
- count(P=v) = número de elementos únicos con v que cumplen todos los predicados **excepto P**.
- totalCount(P=v) = elementos únicos con v en ese universo sin predicados de propiedades.
- Resultado principal = AND completo.
- Mantener valores seleccionados a count0, aunque no tengan bucket materializado; deshabilitar sólo los no seleccionados incompatibles, con opción de mostrar/ocultar ceros.
- Buscar sobre todo el dominio antes de paginar/virtualizar. No limitar descubrimiento a las filas renderizadas.
- Orden predeterminado estable alfabético/natural, con especiales al final; opción por count si se necesita. No recolorear valores porque cambió su posición.
- La selección manual y ocultos individuales no alteran silenciosamente los counts; se informa por separado cuántos resultados no son visibles por esas máscaras.

### 8.4 Sources, versiones y ocultos

- Sources identifica linajes al persistir y URNs exactos en runtime; conservar D-01 a D-06.
- Modelo oculto: excluido del universo de Filters, sin descargarlo automáticamente; su intención de filtro se conserva.
- Modelo descargado: no resolver contra otra fuente; estado “modelo no preparado/no cargado”. No simular resultados completos.
- Cambio de versión: invalidar snapshot de ese modelo, esperar cargador/readiness existentes y rebind por linaje. Si desaparece un elemento, registrar no resuelto; no reaprovechar su dbId viejo.
- Cambio de frente: cancelar trabajos, soltar resultado/caché del ámbito anterior y esperar su inventario.
- Visibilidad de modelos de una vista guardada sigue gobernada por `models[].visible`. La máscara runtime no crea una nueva verdad persistida.

### 8.5 Empty / null / missing y compatibilidad

Distinguir en el snapshot, sin inferir aplicabilidad sólo de valores:

| Entrada real | Interpretación objetivo | Tratamiento mínimo |
|---|---|---|
| Propiedad no declarada para ese elemento/modelo | No aplicable | Estado distinto de sin valor |
| Propiedad declarada, clave omitida | Sin valor presente | Diagnóstico missing |
| Valor JSON null | Null explícito | Diagnóstico null |
| String vacío / sólo espacios | Vacío | Diagnóstico empty |
| String literal “N/A” | Valor de usuario | No convertir a ausencia |
| Número 0 | Valor válido | Contar/filtrar como 0, no falso vacío |
| Esquema insuficiente | Aplicabilidad desconocida | Declarar desconocida, no adivinar |

**Cierre mínimo compatible:** conservar el formato V2 de selección por arrays de strings y sus tokens existentes; “Sin dato” puede agrupar missing/null/empty en UI, pero el diagnóstico mantiene su causa. No introducir ahora operadores ni tokens nuevos que el restore cerrado no comprenda. `(Unassigned)` y `(No aplica)` existentes necesitan fixtures de compatibilidad, incluida colisión con texto literal del mismo nombre.

La tipificación se conserva internamente; no convertir automáticamente “01” a 1 ni fechas por heurística. Para el mínimo, arrays mantienen comparación de valor compuesto compatible, no OR implícito entre sus miembros. Separar filtros seleccionables null/missing o introducir rangos requiere una aprobación posterior si cambia serialización/preflight. Una ambigüedad no resoluble debe mostrarse, no mapearse silenciosamente.

### 8.6 Viewer y colores

- Sólo aplicar un resultado resuelto y de la revisión vigente. Con predicados activos, aplicar exactamente sus ids por modelo; pending/error no se interpretan como cero. Mantener cámara salvo orden explícita de enfocar.
- Sin predicados, liberar la máscara de Filters preservando visibilidad base, Sources y ocultos manuales. Elementos fuera de Inventory pueden seguir visibles en esa vista general, pero no se cuentan como resultados de datos. Limpiar no equivale a aislar permanentemente el inventario.
- Selección manual resalta sin cambiar consulta. “Usar selección” sería una acción explícita y separada, no una reacción a cualquier clic.
- Ocultos manuales y máscara de Filters son capas distinguibles. Capturar/seguir ocultos antes de reemplazar aislamiento, no intentar recuperarlos después.
- Limpiar filtros elimina sólo su restricción; limpiar ocultos manuales es otra acción. Durante restore se conserva la guarda D-07: nunca `isolate([])` que borre el objectSet restaurado.
- Cero: cero coincidencias, nunca mostrar todo como éxito. Se puede mantener contexto ghost explícitamente rotulado; no contarlo como resultado.
- **Decisión del propietario — color:** quedan congelados únicamente jobs cancelables, ninguna aplicación tardía, determinismo y prioridad/ownership visual explícito. Ownership técnico no implica limitar cuántas propiedades pueden estar coloreadas. La política concreta de exclusividad/arbitraje es decisión de producto para B4.
- **NO está aprobada** la regla “activar una propiedad de color desactiva las demás”, ni siquiera para nuevas acciones. Mantener estructura y comportamiento de Saved Views V2; no normalizar silenciosamente vistas con varias propiedades de color activas ni alterar V2 para resolver esta decisión pendiente.
- No pisar estado 4D/AR u otra herramienta. Si el control visual no puede compartirse con garantías, pausar la aplicación visual de Filters y mostrar esa condición; no rediseñar esas extensiones aquí.

### 8.7 Inventory y Saved Views

Inventory consume ids cualificados del mismo resultado, abierto o cerrado. Sus restricciones locales —Sync, Assets only— son subconjuntos explícitos del resultado, no un reemplazo escondido del predicado global. Counts locales y globales se rotulan. La configuración permanece en `inventoryConfig`; selección resaltada no equivale a fila filtrada.

Saved Views V2 conserva exactamente su frontera actual:

- `filters.properties`, `filters.selections`, `filters.colors`, `filters.valueColors`;
- `filters.sourceColor` y `filters.hiddenModelLineages`;
- fuentes traducidas a linaje, `models[].visible` canónico y resto del documento V2 intacto.

No persistir buckets, cache, dbIds transitorios ni revisiones internas. No tocar las V1 históricas, rutas de compartir ni esquema DB. Si un test demuestra incompatibilidad que exige tocar el capturador/restaurador/validador cerrado, separar esa decisión y pedir autorización antes.

### 8.8 Concurrencia, readiness y diagnóstico

Cada cambio produce revisión monotónica por frente. Sólo la revisión más reciente puede publicar/aplicar. Cancelar debounce previo y comprobar revisión tras cada pausa y antes de cada publicación/lote visual. Ningún job A puede pintar o emitir “aplicado” después de B o de apagar colores.

Distinguir solicitado, calculado y visualmente aplicado. Mantener `filters-calculated` compatible para consumidores existentes; añadir diagnóstico separado, sin contaminar el mapa de buckets ni sustituir el pipeline V2.

Readiness exige scope correcto, inventario disponible —[] es válido; null no—, esquema y correspondencias de los modelos requeridos. Pending conserva el último resultado identificado como anterior; no devuelve cero ni éxito falso. Error ofrece motivo y reintento.

Diagnóstico mínimo: request/revision/scope, presencia y número de predicados, status, filas origen, elementos únicos, modelos preparados, filas excluidas por razón, coincidencias, cálculo ms, aplicación visual ms, trabajos reemplazados y número de recálculos. Separar cero resuelto (inventario vacío, todo oculto o combinación incompatible) de propiedad/valor no disponible, cobertura pendiente e identidades sin resolver. Pending/error tienen su estado y causa propios: nunca se presentan como cero resuelto. No registrar tokens ni volcar propiedades sensibles.

## 9. Arquitectura mínima

| Mantener | Cambio acotado propuesto | No crear ahora |
|---|---|---|
| App como propietario de intención | Un reducer/controlador local de Filters y un snapshot derivado versionado | Provider global de toda la aplicación |
| Motor `model.js` | Separar normalización/dataset del cálculo puro; igualdad cualificada; Sets/Maps seguros | Otro motor Viewer o adapter paralelo |
| Cargador, Rosetta, eventos readiness | Exponer revisión y cobertura; resolución estricta por modelo | Cargador alternativo |
| Viewer actual | Un driver de efectos Filters cancelable que consuma resultado | Refactor de todas las herramientas |
| Panel/configurador existentes | Controles fieles al contrato y búsqueda antes de recorte | Rediseño visual total |
| Inventory config y grid virtualizado | Consumir resultado cualificado; no recalcular semántica | Nueva arquitectura Inventory |
| IndexedDB y endpoint existente | Mantener caché de transporte; incluir versión del normalizador en su clave | Nuevo servicio de faceting de entrada |
| Captura/restore V2 | Tests de contrato y eventos compatibles | Saved Views V3 |

Dependencias mínimas: **fuente de datos → snapshot → función pura → resultado → panel / tabla / driver visual**. La aplicación visual no decide coincidencias; el grid no cambia flags leídos por color.

Retirar como autoridad `_lastHasActiveFilters`, `_lastValidDbIds`, `_lastCalculatedBuckets` y `_lastThemeEventConfig`. Pueden permanecer como puentes de compatibilidad de sólo lectura mientras haya consumidores. Lo mismo para el dataset global: publicación única y revisionada, no mutación desde distintos componentes.

Rediseñar `_facetCache` por revisiones explícitas de dataset/esquema/Rosetta, con liberación al cambiar frente. Mantener normalización cacheada. Evitar materializar listas completas por cada valor cuando sólo se requieren counts: referencias compactas/postings internos si el perfil lo justifica.

Primero frontend puro y resultados únicos. Worker se justifica si el perfil sigue bloqueando interacción; índice invertido/bitsets si reduce coste sin romper semántica. Backend faceting se justifica sólo si payload/memoria del dataset rebasa la envolvente medida: sería decisión separada, con autorización por obra y semántica idéntica, no una supuesta imitación de Tandem.

**Precaución del repositorio:** Viewer.jsx contiene +48 líneas ajenas que importan ViewerFacade untracked. No incorporarlas a un commit de Filters ni adoptar ese módulo protegido. Los futuros parches deben aislar sus hunks o esperar decisión del propietario. [A25]

## 10. Plan cerrado — cinco bloques

Benchmark aprobado. **B1 autorizado para el siguiente ejecutor; no ejecutado en este handoff.** B2–B5 describen el plan, pero no están autorizados para ejecución por este relevo. Archivos “nuevos” siguientes son nombres propuestos, no creados.

| Bloque | Objetivo / archivos probables | Invariantes | Pruebas y criterio PASS | Riesgo |
|---|---|---|---|---|
| **B1. Contrato y baseline** | Fixtures sintéticos BIM/Civil/IFC, banco `pruebas/filtersCore.prueba.mjs` propuesto, perfil de navegador y reproducción source/externalId en BD desechable | Sin producción ni datos reales de obra; sin alterar Saved Views; fijar cobertura requerida y señales de FilterResult antes de optimizar | Reproduce P0; distingue sin predicados/cero resuelto/pending/error; registra la salida de la puerta de identidad; medir navegador con 1/5 modelos. Registrar fallos, no exigir verde al código defectuoso | Fixtures no representativos; seguir la puerta de tres salidas de abajo; no implementar correcciones |
| **B2. Dataset, identidad, caché** | `model.js`, normalizador puro propuesto, rutas de mapeo en App/grid, `inventoryCache.js` | Grupo/nombre y modelo/elemento conservados; revisión por edición confirmada; 0≠vacío; ninguna migración escondida | Homónimos, valores reservados, duplicados, in-place/remap, carga/refresh, Source oculta pasan. Ningún fallback entre fuentes | Respetar resultado de la puerta B1. Mezcla/pérdida de datos requeridos exige STOP y autorización de alcance backend |
| **B3. Resultado y driver único** | App, handler Filters de Viewer, interfaz grid; controlador local propuesto | Un resultado por revisión con estado y presencia de predicados explícitos; cancelación; no inferir significado sólo de matches ni del montaje del grid | A→B, color→off, Sources y tabla cerrada/abierta producen mismo conjunto; ningún evento obsoleto “aplicado”; cámara intacta | Eventos V2, colores ajenos y hunks protegidos |
| **B4. UX profesional** | TandemFilterPanel, FilterConfiguratorModal; controles Sync/estado de grid sólo frontera | Operaciones describen consulta real; quitar/limpiar inequívoco; teclado; exclusividad/arbitraje de color pendiente de decisión de producto | Buscar fuera del primer tramo, DnD con búsqueda, seleccionados0, feedback pending/error/0 y Sync mismo tamaño pasan; documentar decisión de color antes de implementarla, sin alterar V2 | Cambiar hábitos; probar instrucciones/labels con usuario; no asumir exclusividad |
| **B5. Cierre y escala** | Bancos existentes + nuevos; perfil; optimizaciones sólo sustentadas | Misma semántica antes/después; persistencia intacta; ningún P0 abierto de la cobertura requerida fijada en B1 | Matriz §11 completa, V2 verde, build/lint acotados reportados, baseline comparado y presupuesto de aceptación aprobado | Sin modelo real autorizado no afirmar cierre productivo; no excluir fixtures silenciosamente |

Orden de cierre: B1 no añade capacidad; B2 resuelve verdad de datos; B3 la aplica; B4 la hace comprensible; B5 prueba que se puede terminar Filters y pasar a Files. No dejar un proyecto indefinido de arquitectura.

**Decisión del propietario — puerta obligatoria de B1:** reproducir la posible colisión source/externalId en una **BD desechable**, aislada de producción y sin datos reales de obra, y contrastarla con la cobertura requerida fijada antes del ensayo:

1. Si la colisión no existe en la reproducción, seguir con B1 y registrar la evidencia.
2. Si existe pero no afecta la cobertura requerida, documentar el caso y su alcance; no ocultarlo ni cambiar la cobertura para conseguir PASS.
3. Si existe y mezcla o pierde datos que Filters necesita, **STOP** y pedir autorización para alcance backend.

Ninguna salida autoriza ejecutar B2 en este handoff. **B2 no puede introducir una migración escondida.** Una colisión que afecta datos requeridos impide cerrar después el PASS federado de B5 sin la decisión y solución autorizadas; una clave compuesta sólo frontend no recupera esos datos.

## 11. Test plan

### 11.1 Banco de corrección

Crear fixture explícito con dos propiedades homónimas, dos fuentes que comparten externalId, un modelo no cargado, null/empty/missing/N/A/0, ids sin Rosetta, duplicados y valores reservados. Oráculo simple por conjuntos únicos, independiente del algoritmo optimizado.

| Caso | Aserción observable |
|---|---|
| 1 propiedad / 1 valor | Coincidencias exactas; count correcto |
| 1 propiedad / N valores | Unión sin duplicados |
| N propiedades | Intersección; orden del panel no importa |
| Faceta seleccionada | Ignora su propia selección y respeta las demás |
| Source / cinco modelos | Ningún id cruza fuente; counts y resultados excluyen ocultos |
| Propiedad/valor inexistente | Restricción visible y diagnóstico; no mostrar todo |
| null/vacío/missing/N/A/0 | Clasificación según §8.5; equivalencia de rutas |
| Cero / uno / todos / pending / error | Afirmar presencia de predicados, status, revision y matches; distinguir universo vacío sin predicados de cero con predicados; nunca interpretar [] por sí solo |
| Colisión source/externalId en BD desechable | Registrar una de las tres salidas de B1 según cobertura requerida; STOP ante mezcla/pérdida de datos necesarios |
| Filas duplicadas | Un elemento contado una vez |
| `__proto__` / `constructor` | No excepción ni mutación de prototipo |
| Edición confirmada | Cambian valor, revisión y count; error HTTP no publica datos confirmados |
| Rosetta remapeada | Nunca conserva dbId viejo |
| A→B / color→off | Ninguna publicación ni pintura tardía de A |
| Cambio de modelo/versión | Espera datos de revisión vigente, rebind por linaje |
| Ocultar / descargar Source | Sin fallback; estado de cobertura correcto |
| Ocultos manuales | Distintos del predicado y restaurables explícitamente |
| Inventory cerrado/abierto | Mismo resultado; selección no depende de evento perdido |
| Sync A→B igual tamaño | Actualiza miembros, no sólo count |
| Assets only | Preload/refresh/fetch tienen mismo criterio |
| Búsqueda / DnD filtrado | Mismos matches expandido/colapsado; mueve el id correcto |
| Saved View restore | Mismo predicado/count con datos iguales; D-07 intacta; V1 no se reescribe; conservar vistas con varias propiedades de color activas, sin normalizarlas ni alterar V2 |
| Cambio de frente | Ningún resultado o color del frente anterior |

La compatibilidad de tokens heredados y homónimos debe comprobarse específicamente con preflight. Una suite V2 general verde no sustituye esas pruebas de frontera.

### 11.2 Rendimiento sin umbrales inventados

Medir en navegador autorizado además del banco Node. Registrar commit+worktree, navegador, CPU/RAM, modelo, filas útiles/origen, propiedades, cardinalidad y cobertura; separar frío/caliente. Ejecutar 1×20k, 5×20k y 1×100k con igual dataset total de control, más un caso de alta cardinalidad. No llamar “real” a un fixture.

Métricas:

1. Tiempo de preparación y cálculo de facets, mediana y percentiles con suficientes repeticiones.
2. Tiempo acción→resultado visible, desde evento de intención hasta señal/fotograma efectivo.
3. Número de requests, cálculos y aplicaciones efectivas por gesto; distinguir debounce de cancelación.
4. Heap antes/después/tras liberar y, con profiler, asignaciones/churn y retención al cambiar frente.
5. Tiempo de aislamiento, número de llamadas LMV y tiempo de color, separado de faceting.
6. Comportamiento con cinco modelos: ids resueltos, pendientes y excluidos por cada fuente.
7. Contraste grid abierto/cerrado, edición, cambio rápido y reactivación Sources.

No se fija “<100 ms” ni otro presupuesto por intuición. B1 mide baseline; B5 compara en las mismas condiciones, no acepta regresión inexplicada y registra con el propietario la envolvente/presupuesto antes de declarar PASS de escala.

### 11.3 Receta mínima de reproducción — sin archivos ni DB

Desde PowerShell en la raíz; importa sólo módulos puros del frontend:

```powershell
@'
import {calculateBucketsFromPostgres as calc} from './frontend-react/src/aps/utils/model.js';
const rows=[{dbId:'a',source_urn:'m1',Estado:'Before'}], ros={m1:{a:1}};
const read=()=>calc(rows,['G::Estado'],{},ros).buckets['G::Estado'].values.map(v=>v.value);
console.log('antes',read());
rows[0].Estado='After';
console.log('inplace',read());
console.log('nuevoArray',calc([...rows],['G::Estado'],{},ros).buckets['G::Estado'].values.map(v=>v.value));
console.log('fallbackOculto',calc(
  [{dbId:'same',source_urn:'unloaded-model',P:'X'}],
  ['G::P'],{'G::P':['X']},{m1:{same:11},m2:{same:22}},['m1']
).globalValidDbIds);
'@ | node --input-type=module
```

Resultado actual observado: Before, Before, After; fallback devuelve m1/id11.

Receta del benchmark sintético; ejecutar cada combinación en proceso nuevo:

```powershell
@'
import {calculateBucketsFromPostgres as calc} from './frontend-react/src/aps/utils/model.js';
const models=5, perModel=20000, data=[], ros={};
const props=Array.from({length:10},(_,j)=>'G::P'+j), sel={'G::P0':['v0']};
for(let m=0;m<models;m++){
  const urn='model-'+m; ros[urn]={};
  for(let i=0;i<perModel;i++){
    const id='ext-'+i,row={dbId:id,source_urn:urn};ros[urn][id]=i+1;
    for(let j=0;j<10;j++)row['P'+j]='v'+((i+j)%20);
    data.push(row);
  }
}
function run(){
  const t=performance.now(),r=calc(data,props,sel,ros);
  return {ms:performance.now()-t,valid:r.globalValidDbIds.length};
}
global.gc(); const before=process.memoryUsage().heapUsed;
const cold=run(); global.gc(); const after=process.memoryUsage().heapUsed;
const warm=Array.from({length:7},()=>run().ms).sort((a,b)=>a-b);
console.log({models,perModel,cold,warm,median:warm[3],retainedMiB:(after-before)/2**20});
'@ | node --expose-gc --input-type=module
```

No ejecutar los test_*.py de raíz ni ensayos de extracción/base real para esta tarea.

## 12. Evidencia pendiente y límites de la decisión

| Pregunta abierta | Cómo cerrarla | ¿Bloquea este benchmark? |
|---|---|---|
| Álgebra exacta, counts, empty y cero de Tandem actual | Sesión Tandem autorizada con fixture controlado; registrar versión/fecha | No; comparación queda ND, contrato ALEPHIA explícito |
| Faceting interno cliente/servidor e índices Tandem | Fuente técnica de Autodesk o trazas autorizadas que realmente lo demuestren | No; no se usa como premisa |
| ¿Qué ocurre en Tandem con propiedades/versiones borradas? | Ensayo de vista guardada con modelo controlado | No; no se cambia V2 por conjetura |
| Latencia real de ALEPHIA con modelos de obra | Baseline navegador B1 con datos autorizados | Sí para PASS productivo de escala, no para diseñar el arreglo |
| Frecuencia de homónimos, ausencias, duplicados y colisiones | Muestra sanitizada, esquema y análisis de cobertura | No para defectos reproducidos; condiciona compatibilidad final |
| ¿Colisionan fuentes en la identidad almacenada? | Puerta obligatoria B1: reproducción en BD desechable, sin producción | No existe: seguir; existe sin afectar cobertura requerida: documentar; mezcla/pierde datos necesarios: STOP y pedir alcance backend |
| ¿Esquema permite diferenciar missing y no aplicable en todos los formatos? | Contrastar payload agrupado y metadata con modelos de muestra | Si no, conservar estado “desconocido”; nunca inventar aplicabilidad |
| Convivencia visual con 4D/AR | Smoke de interfaces, sin modificar extensiones protegidas | Sí para asegurar no pisar otra herramienta al aplicar Filters |
| Compatibilidad de tokens especiales en V2 | Fixtures de frontera con validador actual | Si exige cambiar contrato CLOSED, pedir autorización separada |

No hay evidencia para declarar todos los P0 presentes en todos los modelos de producción. Sí hay evidencia suficiente para corregir los mecanismos que producen resultados erróneos bajo entradas válidas.

## 13. Recomendación final

**Construir:** Filters Core pequeño, determinista y verificable sobre el motor existente: normalización única, identidad cualificada, caché revisionada, resultado compartido y aplicación visual cancelable; completar las interacciones que hoy mienten o pierden estado.

**Dejar:** LMV 7, cargador, Rosetta/IFC, PostgreSQL como fuente, IndexedDB de transporte, configuración Inventory canónica, faceting AND/OR autoexcluyente, V2 y sus decisiones cerradas.

**Posponer:** rangos/fechas persistibles, clustering, búsquedas lingüísticas/IA, worker/backend sin perfil, rediseños Files/Inventory/Viewer y cualquier migración de identidad hasta tener evidencia y autorización específica.

EXACT NEXT ACTION: **el siguiente ejecutor debe implementar únicamente B1 del plan aprobado (§10), incluida su puerta de identidad en BD desechable.** No repetir la investigación Tandem, no implementar Filters ni iniciar B2; reportar la evidencia y detenerse al cerrar B1 o al activarse su condición STOP.

READY aceptado por el propietario significa benchmark aprobado y B1 autorizado. **B1 no se ejecutó en esta entrega documental. No significa código corregido, pruebas integradas completas ni push/deploy autorizado.**

### Registro de evidencia enlazable

Las referencias de código son del worktree auditado; los números pueden cambiar cuando se implemente. Las referencias Tandem son fuentes oficiales; su alcance y antigüedad se explican en §4.

[A1]: D:/VISOR_APS_TL/frontend-react/src/App.jsx:960
[A2]: D:/VISOR_APS_TL/frontend-react/src/App.jsx:2418
[A3]: D:/VISOR_APS_TL/frontend-react/src/App.jsx:2595
[A4]: D:/VISOR_APS_TL/frontend-react/src/App.jsx:4043
[A5]: D:/VISOR_APS_TL/frontend-react/src/components/Viewer.jsx:1287
[A6]: D:/VISOR_APS_TL/frontend-react/src/aps/utils/model.js:491
[A7]: D:/VISOR_APS_TL/frontend-react/src/aps/utils/model.js:399
[A8]: D:/VISOR_APS_TL/frontend-react/src/components/TandemFilterPanel.jsx:29
[A9]: D:/VISOR_APS_TL/frontend-react/src/components/FilterConfiguratorModal.jsx:19
[A10]: D:/VISOR_APS_TL/frontend-react/src/components/InventoryDataGrid.jsx:559
[A11]: D:/VISOR_APS_TL/frontend-react/src/components/InventoryDataGrid.jsx:793
[A12]: D:/VISOR_APS_TL/frontend-react/src/lib/capturarVistaV2.js:325
[A13]: D:/VISOR_APS_TL/frontend-react/src/lib/restaurarVistaV2.js:860
[A14]: D:/VISOR_APS_TL/frontend-react/src/utils/frenteSession.js:21
[A15]: D:/VISOR_APS_TL/frontend-react/src/lib/preflightFiltros.js:67
[A16]: D:/VISOR_APS_TL/frontend-react/src/utils/inventoryCache.js:22
[A17]: D:/VISOR_APS_TL/frontend-react/src/components/Viewer.jsx:1549
[A18]: D:/VISOR_APS_TL/frontend-react/src/components/Viewer.jsx:1017
[A19]: D:/VISOR_APS_TL/frontend-react/src/lib/inventoryConfig.js:48
[A20]: D:/VISOR_APS_TL/frontend-react/src/App.jsx:1699
[A21]: D:/VISOR_APS_TL/frontend-react/src/components/InventoryDataGrid.jsx:181
[A22]: D:/VISOR_APS_TL/backend/routes/inventory.py:551
[A23]: D:/VISOR_APS_TL/backend/server.py:1245
[A24]: D:/VISOR_APS_TL/frontend-react/src/components/InventoryDataGrid.jsx:1273
[A25]: D:/VISOR_APS_TL/docs/AI_WORKSTATE.md
[A26]: D:/VISOR_APS_TL/frontend-react/src/App.jsx:2715
[A27]: D:/VISOR_APS_TL/backend/routes/inventory.py:751
[A28]: D:/VISOR_APS_TL/backend/server.py:1306
[T1]: https://help.autodesk.com/cloudhelp/ENU/Tandem-Facilities/files/tandem-filters.html
[T2]: https://help.autodesk.com/cloudhelp/ENU/Tandem-Facilities/files/tandem-views.html
[T3]: https://blogs.autodesk.com/villagebim/2024/09/tutoriel-autodesk-tandem-utilisation-des-filtres-et-des-vues.html
[T4]: https://forums.autodesk.com/t5/tandem-forum/filter-views-based-on-the-filter-applied-on-the-inventory-table/td-p/12253766
[T5]: https://aps.autodesk.com/blog/how-use-tandem-data-api-retrieve-asset-data
[T6]: https://help.autodesk.com/cloudhelp/ENU/Tandem-Facilities/files/tandem-files.html

**FILTERS BENCHMARK READY**
