# FILTERS CORE — B3 · CODE/TEST GREEN

7-sep-2026 · main · unidad sobre `71d23c7` (B2 CLOSED).
No B4, push, deploy, producción ni cambios backend/BD.

## Implementación entregada

`FilterState → DatasetSnapshot → FilterResult(revision) → Viewer + Inventory`.
Una autoridad de predicados B2, un controlador B3 y un driver visual.
No-filter, active-zero, pending, invalid y error no comparten un array ambiguo.

| Pieza | Archivo relativo a frontend-react/src | Responsabilidad |
|---|---|---|
| Resultado/controlador | lib/filtersCore.js | Revisión, cancelación, coalescing, membresía cualificada y subconjuntos locales |
| Motor existente | aps/utils/model.js | Mismos predicados/facets; añade matches y cobertura |
| Eventos/readiness | lib/filterRuntimeBridge.js | Snapshot, live edit sin detail, señales existentes y compatibilidad V2 |
| Driver | lib/filterVisualDriver.js | Jobs cancelables, máscara propia, ownership visual explícito |
| Integración | App.jsx / components/Viewer.jsx | Intención y resultado compartido; estado visual explícito |
| Inventory | components/InventoryDataGrid.jsx | Consume membresía; Sync/Assets sólo refinan |
| Popout | lib/inventoryFilterPopout.js | Resultado vivo; scope/revisión; clic y resaltado cualificados |

Clear libera sólo máscara propia conservando aislamiento base y ocultos
manuales; cero no ejecuta show-all. Filters no toca cámara. Un escritor externo
de color pausa aplicación visual hasta una intención explícita de color.
Varias propiedades siguen habilitadas y se componen determinísticamente:
no se introduce exclusividad B4. Sólo el job vigente acusa terminación.
V2 conserva formato, captura, documentos y restaurador. Los acuses de color
por propiedad se emiten después del job compuesto terminado.

## Harness autorizado: mismo oracle

- Color conserva el bucket original Estado=Ejecutado, ids 1..5001/control 1,
  primer lote y expected. Sólo cambia localizador/wiring al driver REAL conectado.
- Sync recibe activeSelectionFilter/isolatedExtIds con los mismos miembros A/B.
- Cuatro defectos B3 llevan fixedIn=B3: sólo pasan contra el expected histórico;
  una regresión es UNEXPECTED_FAIL, no vuelve a esconderse como KNOWN_FAIL.
- Comparación con `git show 71d23c7:...interacciones.prueba.mjs`: **8/8 líneas
  expected idénticas**, incluidas las que contienen knownActual.
- Mutante integrado idéntico (`mappedData: []`): control sano PASS, mutante
  UNEXPECTED_FAIL contra ese mismo expected; 1/1 muerto.
- Búsqueda y DnD conservan datos/expected/KNOWN_FAIL. Los bancos completos
  mantienen **exit 1** por B4, pero ambos declaran **b3Green=true**.
  No se anuncia el cierre de Filters completo ni se ocultan esos fallos.

## Fitness final

Comandos: `node frontend-react/pruebas/<nombre>.prueba.mjs`.

| Banco | Resultado |
|---|---|
| filtersCore.interacciones | 6 PASS + 2 KNOWN_FAIL B4; 0 UNEXPECTED_FAIL/PASS |
| filtersCore.interaccionesIntegradas | Igual; mutante 1/1 muerto |
| filtersCore.runtime | 17/17 PASS |
| filtersCore.runtimeMutants | 3/3 muertos (publicación vieja, color tardío, cero→show-all) |
| filtersCore.popout | 1 escenario PASS, 16 aserciones |
| filtersCore.adversarial / adversarialMutants | 10/10 / 3/3 muertos |
| filtersCore / normalizadores / savedViewsBoundary | 39 PASS / 11/11 / 6/6 |
| restaurarVistaV2 / capturarVistaV2 / savedViewV2 | 150/150 / 63/63 / 111/111 |
| inventoryIdentity / inventoryConfig | 17/17 / 20/20 |
| frenteDeVistas / lob4dIdentidad | 20/20 / 26/26 |

Runtime prueba A tarde tras B (también error), reentrancia, cancelación antes
de arrancar, dispose, readiness, cambio de scope, no-filter≠zero, membresía
común Viewer/Inventory, live edit sin detail, clear/base/ocultos, color OFF,
job visual B terminado antes que A, varias propiedades y restaurador V2 REAL
con dos colores. Dobles LMV/eventos explícitos; no GPU ni React DOM reales.

Auto-revisión detectó un L2: popout perdió el highlight desde Viewer. Se
añadió reproducción que FALLÓ (background undefined), se restauró listener
con identidad modelUrn+dbId y pasó contra el mismo expected. Dos Sources con
id compartido no se resaltan juntas. Fue el único cambio funcional adicional
de este desbloqueo; no se simplificó producto para acomodar el harness.

## Build / preservación / límites

- `npm run build -- --outDir C:/Users/ASUS/AppData/Local/Temp/alephia-filters-b3-green-20260907`:
  exit 0, 516 módulos, 11,19 s (antes del fix pequeño de highlight).
- Build final mediante API Vite, sustituyendo **en memoria** sólo Viewer.jsx
  por `git show :frontend-react/src/components/Viewer.jsx`: exit 0,
  **515 módulos, 9,99 s**. Salida:
  `C:/Users/ASUS/AppData/Local/Temp/alephia-filters-b3-staged-viewer-20260907`.
  Incluye highlight y demuestra que excluir las 48 líneas ajenas no rompe el
  build. No se escribió ni reemplazó Viewer en el worktree.
- ESLint de cuatro módulos nuevos de producto: exit 0; diff/check del índice.
  Warnings preexistentes: volver duplicado, imports mixtos, bundle grande.
- Viewer staged: 31 adiciones/413 retiradas propias B3; diff restante **+48/-0**.
  Sin Facade/facade en el blob; aps/viewer y su banco no entran en el commit.
- Hashes ajenos de IDENTIDAD_4D_5D, LOB4DExtension, ViewerLabelsBar y predictBim
  iguales a takeover. Todos los untracked históricos preservados.
- Sin cambios de .env, backend/BD ni producción. Builds alternos en Temp.

CODE/TEST GREEN local, **no HOST GREEN**: no se probaron modelos reales ni GPU.
El resto del worktree conserva WIP protegido; el build final separa Viewer,
no certifica un checkout limpio de todo el repo. Medición previa del runtime:
40k filas/5 Sources/2 propiedades, frío 248,127 ms, mediana 129,3592 ms,
8 cálculos/8 intenciones; no comparar con el benchmark B2 de 10 propiedades.
Historia del bloqueo en [B3_WIP_VALIDATION.md](B3_WIP_VALIDATION.md).

**CURRENT TASK=NONE. Esperar. B4 NOT STARTED / NOT AUTHORIZED.**
