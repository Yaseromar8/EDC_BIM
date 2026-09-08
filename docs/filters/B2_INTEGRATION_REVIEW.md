# B2 INTEGRATION REVIEW — PASS / CLOSED

7-sep-2026. Corrección explícitamente autorizada tras b7014be.
B1 permanece CLOSED. B3 autorizado inmediatamente; B4 fuera de alcance.

## Correcciones y frontera

- `filterPropertyIdentity.js`: regla común de propiedad cualificada para motor
  y preflight. Conoce todo el dataset y el schema disponible, no sólo el panel.
  Una celda cualificada vacía tampoco hereda el alias del otro grupo.
- `model.js`: homonimia de dataset/schema; huella exacta con URNs, claves y
  valores Rosetta completos. No cambia OR/AND ni autoexclusión.
- `preflightFiltros.js`: usa primero grupo::nombre; no colapsa homónimos.
  `restaurarVistaV2` real conserva la selección y termina completa.
- App/Viewer pasan el esquema al cálculo (seam local). No cambió el formato,
  capturador, contrato ni arquitectura Saved Views, ni ningún dato/backend.

Fitness permanente `filtersCore.adversarial.prueba.mjs`: 10/10 PASS.
Incluye las tres reproducciones aceptadas, schema-only, ambos grupos y celda
cualificada vacía. El banco reutiliza dobles del test V2; el normalizador,
preflight, restaurador y motor son reales. No es navegador/LMV/DB.

Mutantes `filtersCore.adversarialMutants.prueba.mjs`: 3/3 eliminados,
sin modificar archivos productivos en disco. Mutar preflight se propaga al
restaurador importado para comprobar la ruta real, no sólo el helper.
El primer ensayo del harness de mutación tuvo SyntaxError al resolver una URL;
se corrigió el harness y se repitió: no se cambió el expected del producto.

## Ejecuciones nuevas

Comandos desde raíz: `node frontend-react/pruebas/<nombre>.prueba.mjs`.

| Nombre | Resultado |
|---|---|
| filtersCore.adversarial | 10/10 PASS |
| filtersCore.adversarialMutants | 3/3 killed |
| filtersCore | 38 CONTRACT PASS + 1 BASELINE PASS; 0 known/unexpected |
| filtersCore.normalizadores | 11/11 |
| filtersCore.savedViewsBoundary | 6/6 |
| filtersCore.interacciones | 2 PASS + 6 KNOWN FAIL; 0 unexpected; exit 1 |
| filtersCore.interaccionesIntegradas | 2 PASS + 6 KNOWN FAIL; exit 1; mutante previo 1/1 |
| restaurarVistaV2 | 150/150 |
| capturarVistaV2 | 63/63 |
| savedViewV2 | 111/111 |
| inventoryIdentity | 17/17 |
| inventoryConfig | 20/20 |
| frenteDeVistas | 20/20 |
| lob4dIdentidad | 26/26 |

Build: desde frontend-react, `npm run build -- --outDir
C:/Users/ASUS/AppData/Local/Temp/alephia-filters-b2-20260907-f0a2`: exit 0,
512 módulos, 10,90 s. Avisos existentes de clave duplicada volver en LoginScreen,
imports mixtos y bundle grande. No se vació dist ni se borró la salida temporal.
Es build del worktree con ViewerFacade ajeno presente, no certificación de un
checkout limpio. Los hunks de esa fachada NO se incorporan al commit.

Backend/BD no ejecutados: no cambiaron y no son dependencias del arreglo.
Regresiones B1 tocadas: inventoryIdentity y bancos Filters/savedViewsBoundary.
Sin navegador ni prueba de GPU. No se afirma cierre productivo/deploy.

## Medición sintética comparada (sin umbral inventado)

Mismo proceso Node24, 40.000 filas / 5 Sources / 10 propiedades / 20 valores,
misma selección G::P0=v0, misma revisión 1, 1 frío + 7 calientes.
Se importó `git show 8495ad7:frontend-react/src/aps/utils/model.js` en memoria
y el módulo actual, sin archivos intermedios.

| Código | Frío ms | Mediana caliente ms |
|---|---:|---:|
| 8495ad7 | 213,14 | 86,83 |
| B2 corregido | 259,53 | 154,37 |

Hay coste real de identidad/huella exacta; no se oculta ni se anuncia mejora.
Muestras anteriores: 213,14;99,18;91,52;88,97;84,35;86,83;84,78;86,02.
Actuales: 259,53;159,56;154,37;150,03;145,26;153,20;187,28;179,12.
No es comparación de GPU/gestos ni un presupuesto de escala aprobado.
B3 debe evitar trabajo duplicado sin sacrificar la corrección recién probada.

## Siguiente unidad

B3: FilterResult autoritativo, intención/revisión, cancelación, consumidores
Viewer/Inventory y estado visual. El evento live edit sin detail queda aquí
registrado como B3; NO se arregló ni se reclasificó como B2.
Los seis KNOWN FAIL siguen con sus oráculos y datos intactos.
Sin push, deploy, B4 ni adopción de WIP ajeno.
