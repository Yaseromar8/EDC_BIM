# FILTERS CORE — B4
## Resultado
B4 CODE/TEST GREEN. Base: `6ddc5a0bbc648cfc7dcc52b06961f718cdb422f0`.
B1/B2/B3 CLOSED; no segunda revisión B3. El propietario autorizó B4 en
adjunto y después directamente en el chat para levantar el bloqueo de ejecución.
B5 no autorizado. Ningún push/deploy/DB.

## Arquitectura y alcance
- `filterPresentation.js` proyecta propiedades/facets ya calculados: búsqueda,
  orden, páginas, etiquetas y colores de leyenda. No recibe filas de elementos
  para evaluar predicados ni calcula matches.
- `App` sigue poseyendo intención; `FilterResult` B3 sigue siendo la verdad
  compartida por Viewer e Inventory. App → Sidebar → Panel lleva resultado,
  revisión/progreso y scope. No nuevo store, controller o motor.
- Configurador usa ids completos y orden canónico; búsquedas/expansión/páginas
  son sólo presentación. Confirmar elimina selecciones/colores de propiedades
  quitadas; Cancelar no escribe intención. Avisa antes de quitar filtros activos.
- No cambios en Viewer, motor, identidad, normalización, caché, runtime, driver,
  Inventory, popout, Saved Views ni backend. Las 48 líneas ViewerFacade ajenas
  siguen sin commit, intactas.

## Correcciones y UX
1. **Búsqueda completa** antes de slice: valor 6000 entre 6001, propiedad 5999
   entre 6000; busca nombre, grupo o Grupo::Propiedad sin aplanar homónimos.
   Orden natural estable de valores, especiales al final; counts sin modificar.
2. **DnD por identidad**, no índice visible. Mueve sólo al drop; cancelar el
   arrastre no mueve nada. Botones Subir/Bajar operan sobre vecinos canónicos
   incluso con búsqueda. Listas grandes avanzan por bloques de presentación.
3. **Selección**: checkbox nativo, multiselección OR, clear property = ausencia
   de restricción, quitar último = Todos. Seleccionados no disponibles siguen
   removibles; ceros no seleccionados se descubren buscando o con Mostrar 0,
   pero no se activan accidentalmente.
4. **Estados**: sin filtros, activos, cero real, pending y error diferenciados;
   reintento por el bridge existente sin detail. No se presenta cero resuelto
   durante pending (corrección local detectada en self-review y fijada en test).
   El progreso de otra revisión nunca se presenta como aplicación vigente.
5. **Clear all** libera Filters y su color, conserva Sources/visibilidad ajena.
   No usa show-all ni manipula la cámara. El configurador tiene Escape,
   autofocus, controles nativos y alternativas al drag con teclado.
6. **Color**, decisión sustentada: se mantienen **múltiples propiedades** porque
   V2 las admite y B3 ya implementa un compuesto determinista. En solapamientos
   gana la última propertyId del orden lexicográfico B3, no el orden del panel.
   La UI explicita esa prioridad; estado configurado no equivale a aplicado.
   Corregido el desajuste de swatch por posición: ahora usa la misma paleta por
   identidad cualificada que el driver cerrado; fitness la contrasta contra su
   salida real. No exclusividad, ni cambio al formato/restaurador/capturador V2.

## Evidencia automatizada
Comando de cada banco: `node frontend-react/pruebas/<nombre>.prueba.mjs`.

| Banco | Resultado |
|---|---|
| filtersCore.b4 | **13/13**: JSX y callbacks reales con host de hooks simulado |
| filtersCore.b4Mutants | **3/3 muertos**; producto sano 13/13 contra los mismos oracles |
| filtersCore.interacciones | **8 PASS**, 0 KNOWN_FAIL, 0 UNEXPECTED_FAIL, 0 UNEXPECTED_PASS |
| filtersCore.interaccionesIntegradas | **8 PASS**, mismos ceros; mutante integrado **1/1** |
| filtersCore | 38 CONTRACT + 1 BASELINE PASS |
| filtersCore.normalizadores | 11/11 |
| filtersCore.adversarial / adversarialMutants | 10/10 / 3/3 muertos |
| filtersCore.savedViewsBoundary | 6/6 |
| filtersCore.runtime / runtimeMutants | 17/17 / 4/4 muertos |
| filtersCore.b3Adversarial | 7/7 |
| filtersCore.popout | 1 escenario, 16 aserciones |
| restaurarVistaV2 / capturarVistaV2 / savedViewV2 | 150/150 / 63/63 / 111/111 |
| inventoryIdentity / inventoryConfig | 17/17 / 20/20 |
| frenteDeVistas / lob4dIdentidad | 20/20 / 26/26 |

La campaña de regresiones anterior a la pausa fue aceptada por el propietario.
Se conserva su evidencia, sin repetirla entera: al retomar se ampliaron y
ejecutaron B4/Mutants y se repitieron sólo los dos bancos de interacción tocados.
Expected y datasets históricos de búsqueda/DnD intactos; cambian localizadores,
argumentos y clasificación a PASS porque ahora se cumple el resultado original.
Mutantes nuevos: recortar antes de buscar, usar índice filtrado como identidad
DnD y volver a color por posición. Cada uno rompe su caso sano específico.
El ajuste pending incorpora comprobación positiva de cero únicamente al estar
ready, no elimina la expectativa de mantener el valor seleccionado.

## Build y límites
Build de producción con Vite 7.1.12 **exit 0**, **516 módulos, 14,14 s**.
Se usó un outDir temporal nuevo por el EPERM histórico de dist; un plugin de
load en memoria toma **HEAD** para Viewer, LOB4DExtension, ViewerLabelsBar y
predictBim. Así valida B4 sin depender de las 48 líneas ni del WIP ajeno y sin
reescribir ninguno de esos archivos.
Salida final: `C:/Users/ASUS/AppData/Local/Temp/alephia-b4-build-x9hVZZ`.
Build previo también pasó (12,12 s); no se reutiliza como prueba del último ajuste.
Warnings históricos: claves duplicadas volver en LoginScreen, imports
estáticos/dinámicos coincidentes y bundle grande. No se arreglaron fuera de alcance.
Lint general no es puerta del repositorio; no se declara lint GREEN.
No se ejecutó backend/BD ni se alteraron las protecciones de pytest.

**CODE/TEST no es HOST GREEN**: JSX/handlers reales con hooks/LMV/eventos dobles,
sin navegador real, React DOM/StrictMode real, gesto drag nativo o GPU.
La prueba de selección rápida usa el handler real App contra el bridge existente.
Las cifras sintéticas no prueban latencia input-to-frame ni escala productiva.

## Performance conservada (Node v24.14.0, sintético, 40 muestras)
| Operación | Mediana ms | p95 ms |
|---|---:|---:|
| Buscar propiedad cualificada entre 6000 | 0,618 | 1,633 |
| Buscar en selección de 6000 propiedades | 1,280 | 2,588 |
| Preparar presentación de facet de 10001 valores | 3,300 | 4,719 |
| Buscar valor entre 10001 antes del límite | 0,258 | 0,669 |
| Reorder por identidad, 6000 propiedades | 0,040 | 0,054 |

Runtime con 6000 filas: 20 intenciones rápidas → **1 cálculo** (84,445 ms
incluyendo espera); cinco intenciones separadas → **5 cálculos**.
Reproducible con `filtersCore.b4Performance`; no umbral de aceptación inventado.

## Comprobación manual pendiente de host
1. Configurar dos Estado de grupos distintos. Buscar Grupo::Estado, añadir,
   seleccionar, buscar otra propiedad y limpiar búsqueda: conserva identidad.
2. Con lista A, BB, BC, buscar B; arrastrar BB a BC. Limpiar búsqueda:
   A, BC, BB. Cancelar otro drag fuera de destino: ningún cambio.
   Repetir con Subir/Bajar y confirmar; cancelar el diálogo no altera el panel.
3. En facet de alta cardinalidad, buscar un valor posterior al primer bloque,
   seleccionarlo y limpiar búsqueda. La restricción permanece; quitar último
   devuelve Todos. Count0 seleccionado sigue removible.
4. Crear combinación sin matches: cero real, no show-all. Durante refresh
   mostrar pending, no cero. Error muestra motivo y Reintentar.
5. Colorear dos propiedades y reordenarlas: prioridad/colores no cambian.
   OFF durante trabajo pendiente no recupera color viejo. Con writer externo,
   mostrar aplicación pausada, no éxito visual.
6. Limpiar filtros con Source oculta y ocultos manuales: conservarlos.
   Repetir con Inventory cerrado/abierto y popout; misma revisión B3.
7. Restaurar vista V2 y editar selección manualmente: conservar homónimos,
   Sources, counts y semántica existente; no migración del documento.

## Handoff
Commit funcional local descendiente de 6ddc5a0:
`feat(filters): complete b4 search and identity-safe interactions`.
Consultar hash con git; no referencia autorreferencial.
WIP ajeno preservado por hashes, índice vacío al terminar. B4 no se declara
CLOSED ni desplegado; esperar revisión/decisión del propietario. No B5.
