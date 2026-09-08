# FILTERS CORE — B2 review / B3 BLOCKED

Fecha: 7-sep-2026. Código observado: `8495ad7`; HEAD al reproducir:
`0cf10a5fb4a1ab4e98ea3e401a7e43f9a2a204ec` (sincronización documental).
Rama main, baseline `3e413cd` ancestro, commits B2 `e3218e6` y
`8495ad7` presentes. STATE MATCH — AUTHORIZED PRESERVED WIP.

## Veredicto

**B2 INTEGRATION REVIEW = BLOCKED; B2 NO CLOSED.
B3 = BLOCKED / NOT IMPLEMENTED.**

B2 conserva su evidencia histórica CODE/TEST GREEN, pero los ataques nuevos
refutan un cierre adversarial. No se modificó código funcional ni se reabrió
Saved Views. El STOP es por una frontera FROZEN reproducida, no por dificultad
de implementación ni por el WIP ajeno.

## L3 concreto: el preflight V2 elimina un predicado cualificado válido

Cadena ejecutada con módulos reales:

`normalizeInventoryPreload → calculateBucketsFromPostgres` encuentra el
elemento 1 para `G1::Estado = Ejecutado`.
`restaurarVistaV2 → resolverSeleccion → aplicarFiltros / recalculate-filters`
elimina ese mismo predicado y entrega `filterSelections: {}`.

Dataset sintético de dos elementos:

| Elemento | G1::Estado | G2::Estado | Alias plano Estado |
|---|---|---|---|
| e0 | Ejecutado | Pendiente | Pendiente |
| e1 | Pendiente | Pendiente | Pendiente |

La representación cualificada está intacta. No se pide recuperar información
perdida de una fila exclusivamente plana ni se resucita el oráculo retirado
en 8495ad7.

Localización:

- `frontend-react/src/lib/preflightFiltros.js`, `valoresPresentes`,
  líneas 62–87: indexa por nombre plano; lee `fila[columna]`, no la clave
  cualificada. Con dos grupos pedidos, el Map columna→propId además conserva
  sólo uno.
- Mismo archivo, `resolverSeleccion`, líneas 132–170: al no encontrar
  Ejecutado en el alias plano, descarta la selección.
- `frontend-react/src/lib/restaurarVistaV2.js`, líneas 900–936:
  el pipeline real llama a ese preflight, fija `seguro.selecciones` y emite
  el recálculo con ese resultado.

Observado: restauración **degradada**, aviso
`preflight-valores-ninguno-casa`, selección aplicada `{}`.
No es una eliminación sin aviso: el defecto es que degrada y borra un filtro
que los datos sí respaldan. La futura autoridad B3 recibiría ya una intención
distinta; no puede recuperar la original desde `{}` sin saltarse el
restaurador o crear otra autoridad.

La suite V2 general pasó 150/150 y el banco de frontera 6/6; ninguno cubre este
round-trip con homónimos. No equivalen a PASS de esta nueva reproducción.
El benchmark §6 ya señalaba el riesgo sin reproducción de integración; ahora
se ejecutó el restaurador real hasta su callback/evento. LMV y ventana son
dobles del banco existente: **no** se afirma ensayo de navegador/GPU/DB.

**Permiso mínimo que falta:** autorizar una corrección semántica acotada de
`preflightFiltros.js` y pruebas de esta frontera para consultar identidad
cualificada compatible con B2. Mantener intactos formato/serialización V2,
capturador, datos V1/V2, esquema backend y arquitectura del restaurador.
No basta modificar los aliases de las filas: un nombre plano no representa
dos grupos y `valoresPresentes` colapsa ambos. No se ha implementado ningún
bypass. Si el arreglo necesitara otros cambios FROZEN, volver a STOP.

## Ataques B2 reproducidos; L2 pendientes al alcanzar el STOP

1. **Sólo G1 solicitado, homonimia declarada en el propio dataset.**
   Fila a plana `Estado=Pendiente`; fila b contiene
   `G1::Estado=Ejecutado` y `G2::Estado=Pendiente`.
   Solicitar sólo `G1::Estado=Pendiente` devuelve a/id1: **FAIL**, esperado
   ningún match porque a es ambiguo y b no cumple.
   `model.js:600–621` construye homonimia desde `filterProperties`,
   no desde el universo de claves/esquema. Es la variante que no cubría
   el caso previo con ambos grupos solicitados.

2. **Caché Rosetta: reconstrucción del mapa con igual cardinalidad.**
   Índice caliente con `{m:{a:1}}`, filas a=A y b=B, revisión 17.
   Reemplazar el mapa interno por `{b:1}` mantiene referencia externa,
   número de claves y longitud de clave. Consulta A reutiliza id1: **FAIL**.
   Consulta con revisión 18 da `[]`: control positivo de invalidación.
   `model.js:409–428` calcula la huella usando longitud de claves, no su
   contenido. Ruta de producción compatible:
   `Viewer.jsx:1018–1041` reconstruye `window.rosettaToDbId[urn]` en el
   mismo objeto externo, sin incrementar la revisión de Inventory;
   `Viewer.jsx:1313–1322` entrega esa revisión al motor.
   Se ejercitó el motor real tras esa forma de mutación en memoria; no se
   simuló una recarga real de APS. La huella exacta/remapeo sigue pendiente.

Las ediciones live y bulk observadas sí llaman `markInventoryRevision`.
No se afirma que omitan el incremento. Además, live edit emite
`recalculate-filters` sin detail (`InventoryDataGrid.jsx:811`), mientras
Viewer desreferencia `detail.filterProperties`: revisar al retomar B3,
sin presentarlo aquí como otro ensayo ejecutado.

No se corrigieron L1/L2 después de confirmar la frontera: la instrucción
vigente exige STOP ante FROZEN. No se tocó B1 ni se cambió ningún expected.

## Comprobaciones ejecutadas

Desde raíz, sin DB/red:

| Comando | Resultado nuevo |
|---|---|
| Reproducción § siguiente, stdin Node | 4 controles PASS / 3 expectativas FAIL, exit 1 |
| `node frontend-react/pruebas/filtersCore.normalizadores.prueba.mjs` | 11/11 PASS, exit 0 |
| `node frontend-react/pruebas/filtersCore.savedViewsBoundary.prueba.mjs` | 6/6 PASS, exit 0 |
| `node frontend-react/pruebas/restaurarVistaV2.prueba.mjs` | 150/150 PASS, exit 0 |
| `node frontend-react/pruebas/filtersCore.interacciones.prueba.mjs` | 2 PASS + 6 KNOWN FAIL; 0 unexpected; exit 1 |
| `node frontend-react/pruebas/filtersCore.interaccionesIntegradas.prueba.mjs` | 2 PASS + 6 KNOWN FAIL; 0 unexpected en producto; mutante 1/1 eliminado; exit 1 |

El mutante del puente produce UNEXPECTED_FAIL deliberadamente; no es un
fallo inesperado del producto original. Se conservó el banco íntegro
(incluidos textos históricos de SOURCE_DRIFT ya obsoletos).

No ejecutados: build/lint, backend, campaña B1, 4D/5D, nuevos mutantes B3,
perfil/comparación de rendimiento, navegador. No hay implementación funcional
nueva que validar; STOP de alcance antes de construir B3. No se inventan
métricas de cálculos/gesto ni tiempos de GPU.

## Reproducción exacta

PowerShell en `D:\VISOR_APS_TL`. Sólo importa código y construye objetos
sintéticos en memoria; no escribe archivos. Lee los dobles del banco V2
existente, sin ejecutar su suite dentro de esta reproducción.

```powershell
@'
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import * as R from './frontend-react/src/lib/restaurarVistaV2.js';
import { normalizeInventoryPreload } from './frontend-react/src/lib/inventoryNormalizers.js';
import { calculateBucketsFromPostgres as calc } from './frontend-react/src/aps/utils/model.js';
import { resolverSeleccion } from './frontend-react/src/lib/preflightFiltros.js';
let s = readFileSync('frontend-react/pruebas/restaurarVistaV2.prueba.mjs','utf8').replace(/\r\n/g,'\n');
const start = s.indexOf('let fallos'), end = s.indexOf("titulo('CASO 1");
if (start < 0 || end <= start) throw new Error('SOURCE_DRIFT: restore test fixture locator');
const {docV2,entornoDe,URN} = new Function('R', s.slice(start,end) + '\nreturn {docV2,entornoDe,URN};')(R);
let failures = 0, controls = 0;
function check(id, actual, expected, control = false) {
  const pass = isDeepStrictEqual(actual, expected);
  if (!pass) failures++;
  if (pass && control) controls++;
  console.log(JSON.stringify({id, status:pass?'PASS':'FAIL', actual, expected}));
}
const payload = ['Ejecutado','Pendiente'].map((value,i)=>({
  external_id:'e'+i,model_urn:URN[0],source_urn:URN[0],
  properties:{G1:{Estado:value},G2:{Estado:'Pendiente'}}
}));
const {mappedData:rows} = normalizeInventoryPreload(payload,x=>x);
const selections={'G1::Estado':['Ejecutado']}, props=['G1::Estado'];
const ros={[URN[0]]:{e0:1,e1:2}};
check('control/direct-production-engine',calc(rows,props,selections,ros).globalValidDbIds.map(x=>x.id),[1],true);
const uniqueRows=normalizeInventoryPreload(payload.map(n=>({...n,properties:{G1:n.properties.G1}})),x=>x).mappedData;
check('control/unique-name-preflight',resolverSeleccion({filas:uniqueRows,propiedades:props,selecciones:selections}).selecciones,selections,true);
let applied;
const env=entornoDe({inventario:rows,aplicarFiltros:f=>applied=f});
R._reiniciarGeneraciones();
const restored=await R.restaurarVistaV2(docV2({filtros:{
  properties:props,selections,colors:{},valueColors:{},
  sourceColor:{on:false,custom:{}},hiddenModelLineages:[]
}}),env);
check('L3/real-restore-must-preserve-valid-qualified-selection',applied.selections,selections);
console.log(JSON.stringify({restoreStatus:restored.estado,diagnostics:restored.parte.avisos,
  requests:env.ventana.vistos.filter(e=>e.n===R.EVENTOS.recalcular)}));
const ambiguous=[
  {dbId:'a',source_urn:'m',Estado:'Pendiente'},
  {dbId:'b',source_urn:'m','G1::Estado':'Ejecutado','G2::Estado':'Pendiente'}
];
check('L2/homonym-only-one-group-requested',
  calc(ambiguous,['G1::Estado'],{'G1::Estado':['Pendiente']},{m:{a:1,b:2}}).globalValidDbIds,[]);
const mapping={m:{a:1}};
const dataset=[{dbId:'a',source_urn:'m',Estado:'A'},{dbId:'b',source_urn:'m',Estado:'B'}];
const run=()=>calc(dataset,['G::Estado'],{'G::Estado':['A']},mapping,[],17).globalValidDbIds;
check('control/cache-before-rebuild',run(),[{id:1,modelUrn:'m'}],true);
mapping.m={b:1}; // Same replacement shape as Viewer Rosetta rebuilding; outer reference and inventory revision unchanged.
check('L2/rosetta-rebuild-same-count-key-length',run(),[]);
check('control/fresh-index-after-rebuild',
  calc(dataset,['G::Estado'],{'G::Estado':['A']},mapping,[],18).globalValidDbIds,[],true);
console.log(JSON.stringify({failures,controls,limits:'Synthetic payload; real normalizer, engine, preflight and restore; existing LMV/event doubles; no browser, GPU, DB or network.'}));
process.exitCode=failures?1:0;
'@ | node --input-type=module
```

Salida de contrato: 3 FAIL y 4 controles PASS. Exit 1 intencional por defectos
del producto; **no es un banco GREEN**.

## Integridad / entrega

- Cambios propios exclusivamente documentales:
  `docs/AI_WORKSTATE.md` y este informe.
- Commit previo propio `0cf10a5`: sólo sincronización de AI_WORKSTATE.
- Cinco M ajenos preservados: evidence IDENTIDAD_4D_5D, LOB4DExtension,
  Viewer (+48 históricos), ViewerLabelsBar, predictBim. Todos los untracked
  autorizados siguen ajenos y no se añaden al commit.
- Ningún cambio de variables, .env, permisos, PostgreSQL, Render, despliegue,
  push ni funcionalidades B4.
- SHA256 congelados observados:
  preflight `9FF3F9B3A185DBE5DFF645CE5FF33FC6BCDC5F307D13B255A4675D0D3A4EE98C`;
  restore `ADD726A8EE00F99D7017A691115A7408F29D200707F989996B155FC2BC502A3A`.

## NEXT EXACT ACTION

Solicitar al propietario autorización explícita para el arreglo acotado de
preflight descrito arriba. Con ella: fijar reproducción como fitness, corregir
homonimia/caché B2 y frontera, pasar bancos y cerrar B2; continuar B3 ya
autorizado. Sin ella: mantener STOP, no declarar GREEN ni excluir Saved Views
de la cobertura para cerrar artificialmente.
