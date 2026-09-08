# FILTERS CORE — B3 · WIP / bloqueo de validación

> Fotografía histórica. **RESUELTO** mediante autorización posterior:
> [B3_RESULTADOS.md](B3_RESULTADOS.md), B3 CODE/TEST GREEN.
> Los estados/siguientes pasos de abajo describen ese momento, no el actual.

7-sep-2026. Rama `main`, HEAD `71d23c749d9ce8fb7e4ae20fe1ebf0051990bb3f`.
**B2 INTEGRATION REVIEW PASS; B2 CLOSED. B3 NO es CODE/TEST GREEN.**
No push, deploy, producción, backend/BD ni B4.

## Implementación local (sin commit funcional B3)

- `lib/filtersCore.js`: estado, snapshot, resultado cualificado único por
  revisión; ready/no-predicates, ready/zero, pending, invalid y error distintos.
  Coalescing de intención; cancelación, dispose y guardas contra publicación,
  progreso y aplicación de A después de B. Mismo motor de predicados B2.
- `aps/utils/model.js`: entrega matches cualificados y cobertura además de los
  buckets existentes; no segundo cálculo OR/AND ni evaluación local del grid.
- `lib/filterRuntimeBridge.js`: entradas React/eventos existentes, revisiones
  de inventario y contenido completo Rosetta; copia estable del snapshot por
  revisión de datos. Live edit sin detail conserva intención y recalcula.
  Escucha `viewer-model-loaded` DESPUÉS de anunciar readiness, no sólo geometría.
- `lib/filterVisualDriver.js`: cancelación por revisión/job, máscara propia
  sobre aislamiento/ocultos base, cero explícito, sin cámara ni showModel.
  Detecta escritor externo de color y pausa toda aplicación visual de Filters;
  una intención explícita de color reclama el control. Varias propiedades siguen
  habilitadas: orden determinista por id, sin introducir exclusividad B4.
- `Viewer.jsx`: retira cálculo/coloreado duplicados y monta el runtime; conserva
  las 48 líneas ajenas ViewerFacade. Eventos de selección/aislamiento incluyen
  claves cualificadas sin quitar los campos legacy. Guarda del evento diferido
  de aislamiento contra revisión vieja.
- `App.jsx`: comparte intención y resultado, muestra pending/error/estado visual
  aun con Inventory cerrado. `InventoryDataGrid.jsx`: consume membresía del
  resultado y aplica sólo subconjuntos locales Sync/Assets; restaura aislamiento
  recibido antes del montaje; Sync compara miembros, no sólo cardinalidad.
- `lib/inventoryFilterPopout.js`: Inventory desacoplado recibe el mismo resultado
  vivo; no retiene una tabla estática de A al aplicar B. Identidad de clic por
  source y dbId resuelto; texto DOM, no HTML interpolado con datos del modelo.

### Frontera V2

No cambian restaurador, capturador, formato, documentos ni contrato V2.
E5 sigue usando el único `recalculate-filters` y el acuse `filters-calculated`
con facets (sin la ambigüedad legacy `validIds=[]`). E6 espera un acuse por
propiedad de color: el driver acusa cada propiedad sólo después de completar
el job compuesto vigente. La prueba nueva integra el restaurador REAL con
el runtime y dos propiedades coloreadas, sin modificar el banco 150/150.

## Comprobaciones ejecutadas sobre este WIP

Comando Node: `node frontend-react/pruebas/<nombre>.prueba.mjs`.

| Banco | Resultado real |
|---|---|
| filtersCore.adversarial | 10/10 PASS |
| filtersCore.adversarialMutants | 3/3 muertos |
| filtersCore | 38 contract + 1 baseline PASS, cero inesperados |
| filtersCore.normalizadores | 11/11 PASS |
| filtersCore.savedViewsBoundary | 6/6 PASS |
| filtersCore.runtime | 16/16 PASS |
| filtersCore.runtimeMutants | 3/3 muertos por la aserción de comportamiento |
| filtersCore.popout | 1 escenario PASS (14 aserciones) |
| restaurarVistaV2 | 150/150 PASS |
| capturarVistaV2 / savedViewV2 | 63/63 y 111/111 PASS |
| inventoryIdentity / inventoryConfig | 17/17 y 20/20 PASS |
| frenteDeVistas / lob4dIdentidad | 20/20 y 26/26 PASS |
| filtersCore.interacciones | exit 1: 1 PASS, 2 KNOWN_FAIL, 3 UNEXPECTED_FAIL, 2 UNEXPECTED_PASS |
| filtersCore.interaccionesIntegradas | mismo resultado; clasificador de mutante informa 0/1 |

Los bancos históricos NO se editaron. Sus dos localizadores de color buscan
`handleTheme` retirado de Viewer (`SOURCE_DRIFT`); el predicado Sync extraído
ahora necesita `activeSelectionFilter`/`isolatedExtIds` y el harness no los pasa.
Assets y montaje sí alcanzan sus expected originales, pero se clasifican
UNEXPECTED_PASS por diseño del banco B1. Los dos KNOWN_FAIL de búsqueda y DnD
siguen idénticos: pertenecen a B4, no se tocaron panel/configurador.
El mutante integrado produce `before=0, after=0` y UNEXPECTED_FAIL, pero su
clasificador exige que el control sano sea KNOWN_FAIL; por eso informa survivor.
No se afirma que dicho banco pase ni se cuenta ese mutante como muerto.

`npm run build -- --outDir C:/Users/ASUS/AppData/Local/Temp/alephia-filters-b3-20260907-final-wip`
(desde frontend-react): exit 0, **516 módulos, 9,50 s**. Warnings preexistentes:
clave `volver` duplicada en LoginScreen, imports estáticos/dinámicos, bundle grande.
Build usa este worktree con dependencias ajenas untracked; NO certifica checkout
limpio, navegador, GPU, modelos reales ni producción.

ESLint de los cuatro módulos nuevos de producto: exit 0 (comando
`node node_modules/eslint/bin/eslint.js src/lib/filtersCore.js src/lib/filterRuntimeBridge.js src/lib/filterVisualDriver.js src/lib/inventoryFilterPopout.js`).
`git diff --check`: exit 0. No se ejecutó lint global ni backend: no son puertas
de este cambio frontend; no se ejecutaron diagnósticos de la raíz contra BD.

La primera ejecución de la nueva integración V2 dio 15/16: el doble tenía
nombres incorrectos de techos y `barreraVisual` indefinido (timeout cero).
Se corrigió el fixture para usar exactamente las claves exportadas `R.TECHOS`;
la exigencia `estado=completa`, membresía, aislamiento y dos acuses no cambió.

### Medición, no promesa de rendimiento

40.000 filas, 5 Sources, 2 propiedades, sin color, bridge/motor reales y LMV
doble. Frío **248,127 ms**, mediana de siete intenciones calientes **129,3592 ms**.
Muestras: 151,2567;129,3592;127,4968;122,5645;147,8008;126,5920;132,6642 ms.
8 requested / 8 computed / 8 published / 8 applied; último resultado 20.000.
`published` cuenta resultados calculados, no notificaciones pending.
No comparar esta cifra con el benchmark B2 de DIEZ propiedades ni con GPU real.

## Bloqueo y siguiente acción exacta

La revisión automática de ejecución rechazó dos intentos de adaptar los bancos
históricos: considera arriesgado sustituir su localizador inline por el nuevo
driver y solicita autorización explícita para esa modificación del harness.
El segundo intento mantenía clasificación y expected intactos; también fue
rechazado. Ningún parche de esos intentos se aplicó. No se intenta una vía
indirecta ni se cambian los oráculos. Se solicitó confirmación al propietario.

**B3 BLOCKED por permiso de validación; no se ha demostrado un nuevo L3
funcional/FROZEN.** WIP NO es GREEN. El bloqueo no anula B2 CLOSED.

Con autorización explícita: migrar solamente los localizadores de color y
parámetros de Sync a sus implementaciones conectadas, conservando datos y
expected. Verificar controles y mutantes reales; reconocer como PASS sólo los
casos B3 que cumplan los expected originales. Dejar dos fallos B4 visibles.
Después ejecutar ambos bancos y toda regresión afectada, revisar integración
React/LMV y ownership, cerrar B3 sólo si la evidencia lo permite y crear commit
funcional explícito, excluyendo todo WIP ajeno. NO push/deploy/B4.

## Preservación / riesgos para el relevo

- Cuatro hashes ajenos iguales a la toma B2: evidencia IDENTIDAD_4D_5D,
  LOB4DExtension, ViewerLabelsBar y predictBim. Todos los untracked ajenos intactos.
- Viewer mezcla código B3 y **48 líneas ajenas**: import registerViewerFacade;
  refs facadeVisibilityRef/facadeRevisionRef/facadeOperationRef; efecto de 37
  líneas desde «El visor conserva la propiedad de sus recursos; la fachada lee
  referencias»; guardas facadeVisibilityRef y facadeOperation en Ghost/Sync.
  No añadir Viewer completo al índice sin separar esas adiciones históricas.
- Míos: App, model.js, Viewer (sólo delta B3), InventoryDataGrid, los cuatro
  módulos lib nuevos, runtime/popout/runtimeMutants y fixture de pruebas,
  este informe y AI_WORKSTATE. Índice vacío en la verificación previa al informe.
- No se modificaron `.env`, configuraciones temporales del proyecto, V2 ni BD.
  Builds alternos quedan en Temp; no se borró ningún artefacto del usuario.
- Sin campaña host real: transiciones con extensiones, virtualización/popout
  en navegador y rendimiento GPU siguen sin certificación. Hay guardas y dobles,
  no una afirmación de piloto/productivo listo.
