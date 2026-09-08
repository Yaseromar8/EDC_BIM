import { makePopoutDom } from './filtersRuntime/popoutDom.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate as turn } from 'node:timers/promises';
import { getEventListeners } from 'node:events';
import * as R from '../src/lib/restaurarVistaV2.js';
import { mountFiltersRuntime } from '../src/lib/filterRuntimeBridge.js';
import { filterInventoryRows } from '../src/lib/filtersCore.js';
import { markInventoryRevision } from '../src/lib/inventoryIdentity.js';
import { filterFeedback } from '../src/lib/filterPresentation.js';
import { openInventoryFilterPopout } from '../src/lib/inventoryFilterPopout.js';
import { makeRuntimeFixture,microtasks,tick } from './filtersRuntime/fixture.mjs';
const f=makeRuntimeFixture({count:4000,sources:['m1','m2','m3','m4','m5']});
let ready=true;const runtime=mountFiltersRuntime({host:f.host,viewer:f.viewer,getIntent:()=>f.state,models:()=>f.models,ready:()=>ready});
const wait=async()=>{await microtasks();await tick();};
const request=async patch=>{runtime.request(patch);await wait();};
const select=value=>({'G::Estado':[value]});
const report=[],check=(name,extra={})=>{report.push({name,status:'PASS',...extra});f.events.length=0;f.calls.length=0;};
await wait();
const before={...runtime.controller.metrics};
runtime.request({filterSelections:select('Ejecutado')});
runtime.request({filterSelections:select('Pendiente')});
runtime.request({filterSelections:select('Ejecutado')});
await wait();
assert.equal(runtime.controller.metrics.computed-before.computed,1);
assert.equal(runtime.controller.metrics.published-before.published,1);
assert.equal(f.host.__filterResult.matches.length,10000);
check('A B A coalesced current result',{gestures:3,calculated:1,readyPublications:1,applications:runtime.controller.metrics.applied-before.applied,pendingPublications:3});
await request({filterSelections:select('not-present')});
assert.equal(filterFeedback(f.host.__filterResult,null,'front').state,'zero');
runtime.request({filterSelections:select('Pendiente')});
assert.equal(filterFeedback(f.host.__filterResult,null,'front').state,'pending');
runtime.request({filterSelections:{}});
await wait();assert.equal(f.host.__filterResult.hasActivePredicates,false);
assert.equal(f.host.__filterResult.matches.length,20000);
check('zero -> pending -> clear never old zero or old match');
await request({filterSelections:select('Ejecutado')});
for(const row of f.host.postgresInventory.slice(0,1000))row['G::Estado']='Ejecutado';
markInventoryRevision();f.host.dispatchEvent(new Event('recalculate-filters'));await wait();
assert.deepEqual(runtime.controller.getState().filterSelections,select('Ejecutado'));
assert.equal(f.host.__filterResult.matches.length,10500);
assert.equal(filterInventoryRows(f.host.postgresInventory,f.host.__filterResult,'front').length,10500);
check('live/bulk edit revision retains intent',{edited:1000,matches:10500});
f.host.rosettaToDbId.m1=Object.fromEntries(Object.entries(f.host.rosettaToDbId.m1).map(([key,id])=>[key,id+10000]));
f.host.dispatchEvent(new Event('rosetta-ready'));await wait();
assert.ok(f.host.__filterResult.matches.filter(m=>m.modelUrn==='m1').every(m=>m.dbId>10000));
check('same-cardinality Rosetta rebuild no old dbId');
await request({hiddenModelUrns:['m1']});
assert.equal(f.host.__filterResult.matches.some(m=>m.modelUrn==='m1'),false);
check('hidden Source absent from same Viewer/Inventory result');
await request({hiddenModelUrns:[],filterSelections:{}});ready=false;
f.host.dispatchEvent(new Event('viewer-model-loaded'));await wait();
assert.equal(f.host.__filterResult.status,'pending');
assert.equal(f.host.__filterResult.matches,null);
ready=true;f.host.dispatchEvent(new Event('viewer-model-loaded'));await wait();
assert.equal(f.host.__filterResult.matches.length,20000);
check('late Source pending recovers on readiness');
const isolate=f.viewer.impl.visibilityManager.isolate;
f.viewer.impl.visibilityManager.isolate=()=>{throw new Error('B5 injected LMV failure');};
await request({filterSelections:select('Ejecutado')});
assert.equal(f.host.__filterResult.status,'error');
f.viewer.impl.visibilityManager.isolate=isolate;
runtime.controller.request({}, {force:true});await wait();
assert.equal(f.host.__filterResult.status,'ready');
check('visible current error and explicit retry');
const originalRows=f.host.postgresInventory;
f.state={...f.state,scopeId:'second'};
runtime.request(f.state);await wait();assert.equal(f.host.__filterResult.status,'pending');
f.host.postgresInventory=originalRows.map(r=>({...r,'G::Estado':'Second'}));
f.host.postgresInventoryUrn='second';markInventoryRevision();
f.host.dispatchEvent(new Event('ecd-frente-reset'));runtime.request(f.state);await wait();
assert.equal(f.host.__filterResult.scopeId,'second');
assert.deepEqual(f.host.__filterResult.facets['G::Estado'].values.map(v=>v.value),['Second']);
check('scope switch replaces snapshot without old values');
// First color job begins, then OFF is issued during its yielded batches.
f.host.dispatchEvent(new CustomEvent('theme-property-bucket',{detail:{propId:'G::Estado',active:true}}));
await microtasks();
assert.ok(f.models.some(m=>m.colors.size>0));
f.host.dispatchEvent(new CustomEvent('theme-property-bucket',{detail:{propId:'G::Estado',active:false}}));
await wait();await wait();
assert.equal(f.models.reduce((sum,m)=>sum+m.colors.size,0),0);
assert.ok(f.events.filter(e=>e.name==='viewer-colors-applied').every(e=>e.detail.revision===f.host.__filterResult.revision));
check('color ON OFF cancels in-flight job',{rows:20000});
runtime.dispose();
assert.equal(f.host.__filterResult,null);

// Frozen V2, real runtime, homonyms, Source predicate and manual editing.
const fixture=readFileSync(new URL('./restaurarVistaV2.prueba.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const begin=fixture.indexOf('let fallos'),end=fixture.indexOf("titulo('CASO 1");
assert.ok(begin>=0&&end>begin);
const {docV2,configDe,URN}=new Function('R',fixture.slice(begin,end)+'\nreturn {docV2,configDe,URN};')(R);
const v=makeRuntimeFixture({count:10001,sources:[URN[0]]});
for(const [i,row] of v.host.postgresInventory.entries()) row['Other::Estado']=i%2?'Different':'Other';
v.state.schema.push('Other::Estado','Standard::Sources');
v.state.filterProperties.push('Other::Estado','Standard::Sources');
const rt=mountFiltersRuntime({host:v.host,viewer:v.viewer,getIntent:()=>v.state,models:()=>v.models,ready:()=>true});
v.host.addEventListener(R.EVENTOS.restaurarLmv,async()=>{
    for(const name of [R.EVENTOS_LMV.estadoRestaurado,R.EVENTOS_LMV.camaraLista,R.EVENTOS_LMV.fotogramaFinal]) {
        await tick();v.viewer.dispatchEvent(Object.assign(new Event(name),{detail:true}));
    }
});
for(const zero of [false,true]) {
    R._reiniciarGeneraciones();
    const doc=docV2({offset:{x:0,y:0,z:0},objectSet:[],filtros:{
        properties:v.state.filterProperties,selections:{'G::Estado':['Ejecutado'],...(zero?{'Other::Estado':['Different']}:{})},
        colors:{'G::Estado':true,'Other::Estado':true},valueColors:{},
        sourceColor:{on:false,custom:{}},hiddenModelLineages:[]}});
    doc.filters.selections['Standard::Sources']=[doc.models[0].lineage];
    const restored=await R.restaurarVistaV2(doc,{ventana:v.host,visor:v.viewer,modelConfig:configDe(1),inventario:v.host.postgresInventory,
        rosettaPorUrn:{[URN[0]]:Object.fromEntries(v.host.postgresInventory.map((row,i)=>[i+1,row.dbId]))},
        aplicarFiltros:x=>{v.state={...v.state,filterProperties:x.properties,filterSelections:x.selections,filterColors:x.colors};},
        aplicarInventario:()=>({}),cargarModelos:()=>{},documentoOculto:()=>false,
        techos:Object.fromEntries(Object.keys(R.TECHOS).map(k=>[k,2000]))});
    assert.equal(restored.estado,'completa',JSON.stringify(restored.parte));
    if(!zero) {
        assert.equal(v.host.__filterResult.matches.length,5001);
        assert.equal(v.models[0].isolated.length,5001);
        assert.equal(v.events.filter(e=>e.name==='viewer-colors-applied').length>=2,true);
    } else {
        assert.equal(v.host.__filterResult.matches.length,0);
        assert.equal(v.host.__filterResult.hasActivePredicates,true);
        assert.deepEqual(v.models[0].isolated,[-1]);
    }
}
rt.request({filterSelections:{'Other::Estado':['Different'],'G::Estado':['Pendiente']}});
await wait();
assert.equal(v.host.__filterResult.matches.length,5000);
rt.dispose();check('V2 real restore homonyms/Sources/multiple colors followed by manual edit',{rows:10001});

// A popout lifetime releases host listeners; opening/closing never computes.
const p=makeRuntimeFixture({count:2000}),mount=mountFiltersRuntime({host:p.host,viewer:p.viewer,getIntent:()=>p.state,models:()=>p.models,ready:()=>true});
await microtasks();
const initial=getEventListeners(p.host,'filter-result').length,computations=mount.controller.metrics.computed;
p.host.location={origin:'http://local'};
for(let i=0;i<10;i++) {
    const {popup}=makePopoutDom(p.host);
    openInventoryFilterPopout({host:p.host,scopeId:'front',columns:[{key:'dbId',header:'ID'}],selection:null});
    popup.close();
    assert.equal(getEventListeners(p.host,'filter-result').length,initial);
    assert.equal(p.host.__inventoryPopup,null);assert.equal(p.host.__inventoryPopupCleanup,null);
}
assert.equal(mount.controller.metrics.computed,computations);
mount.dispose();check('popout 10 open/close cycles no listener or calculation accumulation',{rows:2000});
console.log(JSON.stringify({suite:'b5Stress',pass:report.length,fail:0,report,limits:'real runtime/restore/presentation, synthetic Node event loop + LMV/DOM doubles; no frame claim'},null,2));
