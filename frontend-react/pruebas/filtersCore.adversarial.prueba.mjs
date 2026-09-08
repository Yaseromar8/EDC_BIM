import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import * as R from '../src/lib/restaurarVistaV2.js';
import { normalizeInventoryPreload } from '../src/lib/inventoryNormalizers.js';
import { calculateBucketsFromPostgres as calc } from '../src/aps/utils/model.js';
import { resolverSeleccion } from '../src/lib/preflightFiltros.js';
let s = readFileSync(new URL('./restaurarVistaV2.prueba.mjs', import.meta.url),'utf8').replace(/\r\n/g,'\n');
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
check('schema-only-homonym',calc([ambiguous[0]],['G1::Estado'],{'G1::Estado':['Pendiente']},{m:{a:1}},[],null,['G1::Estado','G2::Estado']).globalValidDbIds,[]);
check('two-qualified-groups-preserved',resolverSeleccion({filas:rows,propiedades:['G1::Estado','G2::Estado'],selecciones:{'G1::Estado':['Ejecutado'],'G2::Estado':['Pendiente']}}).selecciones,{'G1::Estado':['Ejecutado'],'G2::Estado':['Pendiente']});
check('empty-qualified-never-borrows-peer-alias',calc([{dbId:'a',source_urn:'m','G1::Estado':'','G2::Estado':'Pendiente',Estado:'Pendiente'}],['G1::Estado'],{'G1::Estado':['Pendiente']},{m:{a:1}}).globalValidDbIds,[]);
console.log(JSON.stringify({failures,controls,limits:'Synthetic payload; real normalizer, engine, preflight and restore; existing LMV/event doubles; no browser, GPU, DB or network.'}));
process.exitCode=failures?1:0;
