import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as R from '../src/lib/restaurarVistaV2.js';
import { calculateFilterResult,createFilterController,filterInventoryRows,refineInventorySelection,viewerElementKey } from '../src/lib/filtersCore.js';
import { createFilterVisualDriver } from '../src/lib/filterVisualDriver.js';
import { mountFiltersRuntime } from '../src/lib/filterRuntimeBridge.js';
import { markInventoryRevision } from '../src/lib/inventoryIdentity.js';
import { makeRuntimeFixture,microtasks,tick,gate } from './filtersRuntime/fixture.mjs';
let pass=0,fail=0;
async function test(name,fn){try{await fn();pass++;console.log(JSON.stringify({name,status:'PASS'}));}catch(e){fail++;console.log(JSON.stringify({name,status:'FAIL',error:e.stack}));}}
const calc=(f,patch={},r=1,snapshot=f.snapshot())=>calculateFilterResult({...f.state,...patch},snapshot,r);

await test('explicit no-filter versus active-zero versus pending/error',()=>{
    const f=makeRuntimeFixture();
    const all=calc(f),zero=calc(f,{filterSelections:{'G::Estado':['missing']}}),pending=calc(f,{},1,{...f.snapshot(),rows:null});
    assert.deepEqual([all.status,all.hasActivePredicates,all.matches.length],['ready',false,3]);
    assert.deepEqual([zero.status,zero.hasActivePredicates,zero.matches],['ready',true,[]]);
    assert.deepEqual([pending.status,pending.matches],['pending',null]);
    assert.equal(calc(f,{filterSelections:{'Unknown::X':['v']}}).status,'invalid');
});
await test('federation source qualified matching, AND/OR, hidden Source',()=>{
    const f=makeRuntimeFixture({sources:['m1','m2']});
    const result=calc(f,{filterSelections:{'G::Estado':['Ejecutado'],'G::Tipo':['B']}});
    assert.deepEqual(result.matches.map(m=>[m.modelUrn,m.dbId]),[['m1',3],['m2',3]]);
    assert.equal(new Set(result.matches.map(m=>m.rowKey)).size,2);
    assert.equal(filterInventoryRows(f.host.postgresInventory,result,'front').length,2);
    assert.equal(calc(f,{hiddenModelUrns:['m2']}).matches.length,3);
    assert.deepEqual(refineInventorySelection(f.host.postgresInventory,new Set(['e0'])),[]);
    assert.equal(refineInventorySelection(f.host.postgresInventory,new Set([viewerElementKey('m2','e0')])).length,1);
});
await test('unready, wrong scope and unresolved do not publish false zero',()=>{
    const f=makeRuntimeFixture();
    assert.equal(calc(f,{},1,{...f.snapshot(),models:[{modelUrn:'m1',ready:false}]}).status,'pending');
    assert.equal(calc(f,{},1,{...f.snapshot(),scopeId:'other'}).status,'pending');
    f.host.rosettaToDbId={m1:{e0:1}};
    assert.equal(calc(f).status,'pending');
});
await test('A late after B MUST NOT publish/apply including errors',async()=>{
    const f=makeRuntimeFixture(), A=gate(),B=gate(),published=[],applied=[],progress=[];
    const controller=createFilterController({snapshot:f.snapshot,publish:r=>published.push(r),apply:r=>applied.push(r),
        progress:p=>progress.push(p),compute:async(s,d,r)=>{await (s.label==='A'?A:B).promise;return calculateFilterResult(s,d,r);}});
    controller.request({...f.state,label:'A'});await microtasks();
    const revB=controller.request({...f.state,label:'B'});await microtasks();
    B.resolve();await microtasks();A.reject(new Error('old failure'));await microtasks();
    assert.deepEqual(published.filter(r=>r.status!=='pending').map(r=>r.revision),[revB]);
    assert.deepEqual(applied.map(r=>r.revision),[revB]);
    assert.deepEqual(progress.filter(p=>p.phase==='visually-applied').map(r=>r.revision),[revB]);
    controller.dispose();
});
await test('rapid A B A coalesces; duplicate ready intent does not calculate twice',async()=>{
    const f=makeRuntimeFixture(),published=[];
    const c=createFilterController({snapshot:f.snapshot,publish:r=>published.push(r),apply:()=>({})});
    c.request({...f.state,label:'A'});c.request({label:'B'});const last=c.request({label:'A'});
    await microtasks();
    assert.equal(c.metrics.computed,1);assert.equal(c.getResult().revision,last);
    c.request({label:'A'});await microtasks();assert.equal(c.metrics.computed,1);
    c.dispose();
});
await test('current calculation error explicit; disposal prevents late publication',async()=>{
    const f=makeRuntimeFixture(),published=[];
    const c=createFilterController({snapshot:f.snapshot,publish:r=>published.push(r),apply:()=>{},compute:()=>{throw new Error('broken');}});
    c.request(f.state);await microtasks();assert.equal(c.getResult().status,'error');assert.equal(c.getResult().matches,null);c.dispose();
    const a=gate(),p=[];
    const d=createFilterController({snapshot:f.snapshot,publish:r=>p.push(r),apply:()=>{throw new Error('late apply');},compute:async(s,x,r)=>{await a.promise;return calculateFilterResult(s,x,r);}});
    d.request(f.state);await microtasks();d.dispose();a.resolve();await microtasks();
    assert.equal(p.filter(r=>r.status==='ready').length,0);
});
await test('driver preserves baseline isolate and manual hidden; zero is not show-all; no camera',async()=>{
    const f=makeRuntimeFixture();f.models[0].isolated=[1,2];f.models[0].hidden=[1];
    const driver=createFilterVisualDriver({viewer:f.viewer,models:()=>f.models,window:f.host});
    await driver.apply(calc(f,{filterSelections:{'G::Estado':['Ejecutado']}}),f.state,()=>true);
    assert.deepEqual(f.models[0].isolated,[1]);assert.deepEqual(f.models[0].hidden,[1]);
    await driver.apply(calc(f,{filterSelections:{'G::Estado':['none']}}),f.state,()=>true);
    assert.deepEqual(f.models[0].isolated,[-1]);
    await driver.apply(calc(f),f.state,()=>true);
    assert.deepEqual(f.models[0].isolated,[1,2]);assert.deepEqual(f.models[0].hidden,[1]);
    driver.dispose();
});
await test('color OFF kills old 5001-element job and old applied event',async()=>{
    const f=makeRuntimeFixture({count:5001}),pause=gate();let revision=1;
    const driver=createFilterVisualDriver({viewer:f.viewer,models:()=>f.models,window:f.host,yieldFrame:()=>pause.promise});
    const job=driver.apply(calc(f),{...f.state,filterColors:{'G::Estado':true}},()=>revision===1);
    assert.equal(f.models[0].colors.size,5000);
    revision=2;
    await driver.apply(calc(f,{},2),f.state,()=>revision===2);
    const boundary=f.events.length;assert.equal(f.models[0].colors.size,0);
    pause.resolve();await job;
    assert.equal(f.models[0].colors.size,0);
    assert.equal(f.events.slice(boundary).filter(e=>e.name==='viewer-colors-applied').length,0);
    driver.dispose();
});
await test('new visual B finishes before A: old colors and acknowledgements cannot return',async()=>{
    const f=makeRuntimeFixture({count:5001}),pause=gate();let revision=1,frames=0;
    const driver=createFilterVisualDriver({viewer:f.viewer,models:()=>f.models,window:f.host,
        yieldFrame:()=>++frames===1?pause.promise:Promise.resolve()});
    const A=driver.apply(calc(f,{},1),{...f.state,filterColors:{'G::Estado':true}},()=>revision===1);
    assert.equal(f.models[0].colors.size,5000);
    revision=2;
    await driver.apply(calc(f,{},2),{...f.state,filterColors:{'G::Tipo':true}},()=>revision===2);
    const colorsB=[...f.models[0].colors];
    pause.resolve();await A;
    assert.deepEqual([...f.models[0].colors],colorsB);
    assert.deepEqual(f.events.filter(e=>e.name==='viewer-colors-applied').map(e=>e.detail.revision),[2]);
    driver.dispose();
});
await test('external color owner cancels Filters and is not erased by its stale job',async()=>{
    const f=makeRuntimeFixture({count:5001}),pause=gate(),notices=[];
    const driver=createFilterVisualDriver({viewer:f.viewer,models:()=>f.models,window:f.host,
        yieldFrame:()=>pause.promise,onExternal:(...x)=>notices.push(x)});
    const job=driver.apply(calc(f),{...f.state,filterColors:{'G::Estado':true}},()=>true);
    const external={external:true};f.viewer.setThemingColor(1,external,f.models[0]);
    pause.resolve();await job;
    assert.equal(f.models[0].colors.get(1),external);assert.equal(notices.length,1);
    assert.equal((await driver.apply(calc(f),f.state,()=>true)).paused,true);
    assert.equal(f.models[0].colors.get(1),external);
    driver.dispose();
});
await test('real runtime: live event without detail, revision, ready replay, panel-free same result',async()=>{
    const f=makeRuntimeFixture(),runtime=mountFiltersRuntime({host:f.host,viewer:f.viewer,getIntent:()=>f.state,models:()=>f.models,ready:()=>true});
    await microtasks();await tick();
    const first=f.host.__filterResult;
    assert.equal(first.matches.length,3);
    f.state={...f.state,filterSelections:{'G::Estado':['Ejecutado']}};
    runtime.request(f.state);await microtasks();await tick();
    const result=f.host.__filterResult;
    assert.deepEqual(f.models[0].isolated,[1,3]);
    assert.equal(filterInventoryRows(f.host.postgresInventory,result,'front').length,2);
    f.host.postgresInventory=f.host.postgresInventory.map(row=>({...row,'G::Estado':'Pendiente'}));
    markInventoryRevision();f.host.dispatchEvent(new Event('recalculate-filters'));
    await microtasks();await tick();
    assert.deepEqual(f.host.__filterResult.matches,[]);assert.deepEqual(f.models[0].isolated,[-1]);
    assert.ok(f.host.__filterResult.revision>result.revision);
    runtime.dispose();
});
await test('cancel before queued calculation prevents work until a new request',async()=>{
    const f=makeRuntimeFixture();const c=createFilterController({snapshot:f.snapshot,publish:()=>{},apply:()=>({})});
    c.request(f.state);c.cancel();await microtasks();assert.equal(c.metrics.computed,0);
    c.request(f.state);await microtasks();assert.equal(c.metrics.computed,1);c.dispose();
});
await test('reentrant publication cannot report an old requested/calculated/applied revision',async()=>{
    const f=makeRuntimeFixture(),events=[];let c,reentered=false;
    c=createFilterController({snapshot:f.snapshot,apply:()=>({}),progress:x=>events.push(x),publish:r=>{
        if(!reentered && r.status==='pending'){reentered=true;c.request({...f.state,filterSelections:{'G::Estado':['Pendiente']}});}
    }});
    c.request(f.state);await microtasks();assert.ok(events.every(e=>e.revision===c.getResult().revision));c.dispose();
});
await test('runtime readiness snapshot recovers only after real model-loaded event',async()=>{
    const f=makeRuntimeFixture();let ready=false;
    const r=mountFiltersRuntime({host:f.host,viewer:f.viewer,getIntent:()=>f.state,models:()=>f.models,ready:()=>ready});
    await microtasks();assert.equal(f.host.__filterResult.status,'pending');
    ready=true;f.host.dispatchEvent(new Event('viewer-model-loaded'));await microtasks();
    assert.equal(f.host.__filterResult.status,'ready');r.dispose();
});
await test('scope switch cancels old visual job and wrong-scope rows stay pending',async()=>{
    const f=makeRuntimeFixture({count:5001});f.state.filterColors={'G::Estado':true};
    const r=mountFiltersRuntime({host:f.host,viewer:f.viewer,getIntent:()=>f.state,models:()=>f.models,ready:()=>true});
    await microtasks();const boundary=f.events.length;
    f.state={...f.state,scopeId:'other'};r.request(f.state);await microtasks();await tick();
    assert.equal(f.host.__filterResult.scopeId,'other');assert.equal(f.host.__filterResult.status,'pending');
    assert.equal(f.events.slice(boundary).filter(e=>e.name==='viewer-colors-applied').length,0);r.dispose();
});
await test('two enabled colors are deterministic and acknowledged after final composite job',async()=>{
    const f=makeRuntimeFixture(),driver=createFilterVisualDriver({viewer:f.viewer,models:()=>f.models,window:f.host});
    const state={...f.state,filterColors:{'G::Tipo':true,'G::Estado':true}};
    await driver.apply(calc(f),state,()=>true);const first=[...f.models[0].colors];
    await driver.apply(calc(f),{...state,filterColors:{'G::Estado':true,'G::Tipo':true}},()=>true);
    assert.deepEqual([...f.models[0].colors],first);
    assert.deepEqual(f.events.filter(e=>e.name==='viewer-colors-applied').map(e=>e.detail.propId),['G::Estado','G::Tipo','G::Estado','G::Tipo']);
    driver.dispose();
});
await test('real frozen V2 restore plus runtime, two color properties and qualified predicates',async()=>{
    const fixture=readFileSync(new URL('./restaurarVistaV2.prueba.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
    const begin=fixture.indexOf('let fallos'),end=fixture.indexOf("titulo('CASO 1");
    assert.ok(begin>=0&&end>begin);
    const {docV2,configDe,URN}=new Function('R',fixture.slice(begin,end)+'\nreturn {docV2,configDe,URN};')(R);
    const f=makeRuntimeFixture({sources:[URN[0]]});
    const runtime=mountFiltersRuntime({host:f.host,viewer:f.viewer,getIntent:()=>f.state,models:()=>f.models,ready:()=>true});
    f.host.addEventListener(R.EVENTOS.restaurarLmv,async()=>{
        for(const name of [R.EVENTOS_LMV.estadoRestaurado,R.EVENTOS_LMV.camaraLista,R.EVENTOS_LMV.fotogramaFinal]) {
            await tick();f.viewer.dispatchEvent(Object.assign(new Event(name),{detail:true}));
        }
    });
    R._reiniciarGeneraciones();
    const saved=docV2({offset:{x:0,y:0,z:0},objectSet:[],filtros:{properties:['G::Estado','G::Tipo'],
        selections:{'G::Estado':['Ejecutado']},colors:{'G::Estado':true,'G::Tipo':true},valueColors:{},sourceColor:{on:false,custom:{}},hiddenModelLineages:[]}});
    const restored=await R.restaurarVistaV2(saved,{ventana:f.host,visor:f.viewer,modelConfig:configDe(1),inventario:f.host.postgresInventory,
        rosettaPorUrn:{[URN[0]]:{1:'e0',2:'e1',3:'e2'}},aplicarFiltros:x=>{f.state={...f.state,filterProperties:x.properties,filterSelections:x.selections,filterColors:x.colors};},
        aplicarInventario:()=>({}),cargarModelos:()=>{},documentoOculto:()=>false,
        techos:Object.fromEntries(Object.keys(R.TECHOS).map(key=>[key,300]))});
    assert.equal(restored.estado,'completa',JSON.stringify(restored.parte));
    assert.deepEqual(f.host.__filterResult.matches.map(x=>x.dbId),[1,3]);
    assert.deepEqual(f.models[0].isolated,[1,3]);
    assert.equal(f.events.filter(e=>e.name==='viewer-colors-applied').length,2);
    assert.equal(filterInventoryRows(f.host.postgresInventory,f.host.__filterResult,'front').length,2);
    runtime.dispose();
});
console.log(JSON.stringify({suite:'filtersCore.runtime',pass,fail,limits:'Production controller/engine/driver/bridge and frozen V2 restore; LMV/event doubles, no browser or GPU.'}));
process.exitCode=fail?1:0;
