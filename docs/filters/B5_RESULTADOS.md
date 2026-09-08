# FILTERS CORE — B5: integración final y preparación HOST

8-sep-2026. Base cerrada: B1/B2/B3; B4 implementación `f38bc0c` +
revisión independiente `df2c03e`. B5 no rediseña esos contratos.
**Checkpoint de código/pruebas candidato; falta verificar su commit en checkout
limpio antes de declarar B5 CODE/TEST GREEN / FILTERS CORE HOST READY.**
No HOST GREEN, no despliegue. Evidencia: [B5_CAMPAIGN.json](evidencias/B5_CAMPAIGN.json).

## Integración y correcciones acotadas

Cadena real probada:
HTTP Inventory cualificado → normalizeInventoryPreload/Refresh →
calculateFilterResult(DatasetSnapshot, revisión) → driver/Inventory → presentación.
El banco Python `ensayo_inventory_b1_integrado.py --b5` entrega por stdin el
payload real de seis Sources al módulo Node `filtersCore.b5BackendPayload`;
éste genera un PATCH cualificado que vuelve a la ruta HTTP real. Sólo cambia
la terna objetivo. Saved Views V2 hace POST/GET idéntico y devuelve 403 al ajeno.

PostgreSQL **18.4**, clúster nuevo en loopback, puerto aleatorio: **25/25**.
Incluye full/lite, PATCH, bulk atómico, extractor APS simulado + publicación
real, CAS/ABA, aislamiento entre proyectos, metadata legacy fail-closed.
Bootstrap específico de 31 + grants reales + verificador: 12 combinaciones
(2 roles × 2 search_path × 3 etapas). No se certifica bootstrap integral del
resto de dominios ni transporte APS real. `ecd_app` sin DDL.
La campaña 4D/5D separada pasa **7/7** sobre otra BD nueva; ejecutada en el
checkout desechable porque ese guion escribe evidencia: el JSON ajeno del
worktree principal NO se tocó.

Defectos L2 reproducidos, corregidos y fijados con fitness:

1. **Source retirada aún enganchada al driver.** Tras reload, llamar al antiguo
   `model.setThemingColor` generaba una revisión del runtime nuevo (3 ≠ 2).
   `filterVisualDriver.bindModels/syncModels` restaura sólo su hook y retira
   referencias/máscara de modelos ya ausentes. El bridge reconcilia en señales
   existentes de modelo/Inventory/scope; cancela el job retirado.
2. **Resultados huérfanos al disponer.** Los espejos de facetas/membresía seguían
   reteniendo datos; un dispose repetido borraba el resultado nuevo del mismo
   scope (revisión 3 → null). Cleanup idempotente y por **objeto propietario**,
   no por igualdad de scope; libera espejos propios y referencias de snapshot.
   No borra el resultado de un dueño posterior.

Sólo producto modificado: `filterVisualDriver.js`, `filterRuntimeBridge.js`.
Sin cambios de identidad, matching, OR/AND/self-exclusion, runtime revisionado,
multi-color, Saved Views, Viewer.jsx, schema/backend productivo ni WIP ajeno.

## Escala medida (Node 24.14, sintético)

Seis procesos nuevos; 20k/40k/100k **totales**, 1/5 Sources; diez propiedades,
una de cardinalidad N, dos homónimas, missing/null/empty y 100 duplicados.
Una llamada fría + siete calientes sin filtros sobre el **mismo camino real
calculateFilterResult**. Cada escenario adicional se contrasta con membresía
independiente, Inventory y self-exclusion: single, AND, OR amplio, zero,
null y missing/empty. **6/6 matrices PASS**, sin umbrales inventados.

| Elementos | Sources | Frío ms | Caliente mediana ms | Search ms | Driver color ms | Heap resultado+índice MB |
|---:|---:|---:|---:|---:|---:|---:|
| 20000 | 1 | 202.206 | 171.577 | 1.689 | 70.978 | 73.3 |
| 20000 | 5 | 227.6 | 199.152 | 1.65 | 87.614 | 73.4 |
| 40000 | 1 | 398.164 | 391.869 | 3.716 | 140.299 | 142.9 |
| 40000 | 5 | 458.307 | 430.258 | 3.282 | 183.801 | 143.2 |
| 100000 | 1 | 1018.267 | 1114.204 | 11.852 | 295.735 | 352.5 |
| 100000 | 5 | 1146.044 | 1256.391 | 7.421 | 382.188 | 349.9 |

Search se mide sobre el dominio completo ya presentado. Driver: un job
compuesto, dos propiedades activas, N comandos y dos acknowledgements.
**No son ms de frame, FPS, ni latencia React/DOM.** Memoria = heapUsed después
de cambio de turno + GC; no pico ni GPU. A 100k, liberar el resultado deja
aprox. 269–271 MB incluyendo fixture/índice/runtime; no prometer consumo menor.

No se afirma aceleración frente a B1: aquel banco invocaba el motor directamente,
sin revisión (por eso reconstruía índice), con otro payload. Aquí el tiempo
incluye estructura FilterResult y resolución; son protocolos distintos.
La segunda ejecución completa guardada en JSON es la campaña tabulada.

Protocolo B4 reutilizado (40 muestras): 6000 propiedades, search cualificado,
10001 valores, reorder canónico. Search valores mediana **0,233 ms** /
p95 **0,506 ms**; reorder mediana **0,033 ms** / p95 **0,043 ms**.
20 intenciones rápidas: un cálculo; cinco espaciadas: cinco cálculos.
Coste de ~1–1,3 s a 100k requiere observar fluidez HOST; no se optimizó por intuición.

## Stress y lifecycle

`filtersCore.b5Stress`: **11/11**, hasta 20k filas/5 Sources.
A→B→A: tres publicaciones pending, **un cálculo, una publicación ready y
una aplicación**. Zero→pending→clear, bulk/live edit de 1000 filas sin detail,
Rosetta de igual cardinalidad con dbIds nuevos, Source oculta/tardía, error
visible/retry, cambio de scope y color ON→OFF en pleno lote.
V2 real con 10001 filas, homónimos, Sources, dos colores, combinación válida
de cero coincidencias, edición manual posterior. Diez ciclos popout de 2000
filas no generan cálculos ni listeners acumulados.

`b5Lifecycle`: **5/5**, veinte reloads + veinte remounts.
`b5Memory`: **1/1**, 25 scopes de 1000 filas: **0 modelos, 0 datasets de entrada
y 0 FilterResult retirados retenidos**, comprobados con WeakRef/GC. Heap observado
6,13–6,74 MB; final 6,35 MB. Sin umbral estadístico ni promesa de fuga cero.
El motor conserva **un último índice** hasta reemplazarlo; no hay colección de
índices históricos. No se cambió esa política B2. Los resultados/listeners
que acumula un logger externo no se atribuyen al producto.

Mutantes B5 **3/3 muertos**, control sano PASS y mismo oracle:
hook de modelo retirado, espejos retenidos, cleanup por scope en vez de dueño.
Se mantienen los mutantes B3 de A tardío, cancelación, zero→show-all y color
huérfano tras dispose; no se añadieron por cantidad.

## Regresión y reproducibilidad

- filtersCore 38 CONTRACT + 1 BASELINE; normalizadores 11; boundary 6.
- Adversarial B2 10 comprobaciones/4 controles, mutantes 3; interacciones e
  integradas 8/8 cada uno, mutante integrado 1.
- Runtime 17; runtimeMutants 4; B3 adversarial 7; popout 1 escenario/16 asserts.
- B4 13, mutantes 3; revisión adversarial B4 19, mutantes 2.
- Restore **150/150**, captura **63/63**, V2 **111/111**.
- Inventory identity 17, config 20, frenteDeVistas 20, LOB identidad 26.
- Backend oficial `python -m pytest -q`: **1721 passed, 1 failed**, 83,52 s.
  Único fallo: `test_toda_capacidad_de_administrador_tiene_puerta`,
  `/api/docs/miniaturas/preparar`, exactamente el histórico aceptado.
- Cero KNOWN_FAIL / UNEXPECTED_FAIL / UNEXPECTED_PASS propios de Filters.
- Checkout limpio real de `df2c03e`: `npm ci --offline --no-audit --no-fund`
  instala 772 paquetes desde lockfile; `npm run build`: 516 módulos, 14,54 s.
  Sin overlays, symlinks a node_modules principal, env copiado, ViewerFacade,
  public/predict ni archivos ajenos. Avisos históricos de clave volver duplicada,
  imports mixtos y bundle grande; no errores. Falta el build del checkpoint B5.

Incidencia del **harness nuevo**, no de producto: el primer intento V2-zero
usó un valor inexistente y obtuvo correctamente restore degradado por preflight.
Se sustituyó ese fixture erróneo por dos valores existentes cuya intersección
es vacía; se exige restore completo + predicates activos + matches[] + [-1].
No se alteró ningún oracle histórico.

## Límites HOST y release

**Viewer → frame: NOT EXECUTED / ENVIRONMENT.** No había servicio local
escuchando en 3000/5173/5174 ni sesión/modelo LMV disponible para la campaña.
No se leyó .env ni secretos, no se usó producción. Dobles Node no prueban
WebGL, drag/drop del navegador ni gestos React reales.

Campaña humana de seis casos y receta coordinada:
[B5_HOST_RELEASE.md](B5_HOST_RELEASE.md).
Backend y frontend deben salir del **mismo checkpoint B5 aprobado**; nunca
frontend nuevo contra backend productivo `3e413cd`.

## Self-review

Una sola autoridad de matching: FilterResult; presentación no reevalúa filas.
Los bancos inyectan trabajos anteriores después de B y no publican/aplican;
Source homónima y dbId repetido no cruzan identidad. Clear conserva máscara
ajena. Multi-color conserva orden determinista B3 y cancela jobs viejos.
Reload/dispose ya no deja modelos enganchados ni espejos sin dueño.
Compatibilidad no se presupone por build: payload HTTP real y PATCH de vuelta,
Saved Views y grants fueron ejecutados. **No hay handshake frontend que garantice
por sí solo el SHA del backend**: por eso release coordinado y health son puerta
operativa obligatoria. El frontend rechaza ediciones de filas sin terna verificable;
el backend nuevo sin 31 falla cerrado. No se autoriza una combinación de versiones.

Rollback antes de escrituras exclusivas y después de ellas son situaciones
distintas; no existe down-migration automática sin pérdida. Ver receta.
Sin cambios productivos, sin push/deploy. WIP histórico permanece protegido.
