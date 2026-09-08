/**
 * B5: real normalized payload -> authoritative result -> display/driver.
 * Fresh process per size/source case; one cold + seven warm no-filter calls.
 * Node heap after GC, not GPU/DOM or input-to-frame. No thresholds.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { normalizeInventoryPreload } from '../src/lib/inventoryNormalizers.js';
import { calculateFilterResult, filterInventoryRows } from '../src/lib/filtersCore.js';
import { facetItems, searchFacetItems } from '../src/lib/filterPresentation.js';
import { createFilterVisualDriver } from '../src/lib/filterVisualDriver.js';
import { makeRuntimeFixture } from './filtersRuntime/fixture.mjs';

const cases=[20000,40000,100000].flatMap(n=>[1,5].map(sources=>({n,sources})));
const round=x=>+x.toFixed(3);
const heap=async()=>{await nextTurn();global.gc();return process.memoryUsage().heapUsed;};
async function run({n,sources}) {
    const start=performance.now(), before=await heap();
    const urns=Array.from({length:sources},(_,i)=>Buffer.from('urn:adsk.wipprod:fs.file:vf.B5Source'+i+'?version=1').toString('base64url'));
    let payload=Array.from({length:n},(_,i)=>{
        const m=i%sources,local=Math.floor(i/sources),external_id='e'+local;
        const props={G1:{Estado:i%2?'Pendiente':'Ejecutado'},G2:{Estado:i%3?'B':'A'},
            G:{Value:'v'+i,Empty:i%4===0?'':i%4===1?null:'set'}};
        for(let p=0;p<6;p++) props.G['P'+p]='v'+((i+p)%20);
        if(i%4===2) delete props.G.Empty;
        const scope_id='front',source_lineage='urn:adsk.wipprod:dm.lineage:B5Source'+m;
        return {scope_id,source_lineage,external_id,element_key:JSON.stringify([scope_id,source_lineage,external_id]),
            source_urn:urns[m],model_urn:'front',name:'Element '+i,properties:props};
    });
    const normalized=normalizeInventoryPreload(payload,x=>x);payload=null;
    const rows=normalized.mappedData;
    // Identical duplicates must not inflate unique matches/facets.
    rows.push(...rows.slice(0,Math.min(100,n)));
    const rosetta=Object.fromEntries(urns.map(urn=>[urn,{}]));
    for(const row of rows) rosetta[row.source_urn][row.dbId]=Number(row.dbId.slice(1))+1;
    const state={scopeId:'front',schema:Object.values(normalized.schemaMap),models:urns.map(urn=>({urn})),
        filterProperties:Object.keys(normalized.schemaMap),filterSelections:{},filterColors:{},hiddenModelUrns:[]};
    const snapshot={scopeId:'front',rows,rosetta,datasetRevision:1,models:urns.map(modelUrn=>({modelUrn,ready:true}))};
    const fixtureHeap=await heap(), preparationMs=performance.now()-start;
    const invoke=(selections={})=>{const t=performance.now();const result=calculateFilterResult({...state,filterSelections:selections},snapshot,1);return {result,ms:performance.now()-t};};
    let measured=invoke(),coldMs=measured.ms;
    assert.equal(measured.result.matches.length,n);assert.equal(measured.result.hasActivePredicates,false);
    const heldHeap=await heap();
    measured=null;const releasedHeap=await heap(),warm=[];
    for(let i=0;i<7;i++) {measured=invoke();warm.push(round(measured.ms));assert.equal(measured.result.matches.length,n);measured=null;}
    const definitions=[
        ['single',{'G1::Estado':['Ejecutado']},i=>i%2===0],
        ['and',{'G1::Estado':['Ejecutado'],'G2::Estado':['A']},i=>i%6===0],
        ['broad-or',{'G1::Estado':['Ejecutado','Pendiente']},()=>true],
        ['zero',{'G1::Estado':['not-present']},()=>false],
        ['null',{'G::Empty':['null']},i=>i%4===1],
        ['missing-empty',{'G::Empty':['(Unassigned)']},i=>i%4===0||i%4===2],
    ];
    const scenarios=[];
    for(const [name,selections,oracle] of definitions) {
        const {result,ms}=invoke(selections);
        assert.equal(result.status,'ready');
        const expected=Array.from({length:n},(_,i)=>i).filter(oracle);
        const expectedKeys=new Set(expected.map(i=>rows[i].element_key));
        assert.deepEqual(new Set(result.matches.map(m=>m.rowKey)),expectedKeys,name+' membership');
        assert.deepEqual(new Set(filterInventoryRows(rows,result,'front').map(r=>r.element_key)),expectedKeys,name+' Inventory');
        // Independent self-exclusion: for G1 count rows constrained only by G2.
        const g1=result.facets['G1::Estado'].values.reduce((sum,v)=>sum+v.count,0);
        const other=Object.keys(selections).filter(k=>k!=='G1::Estado');
        const expectedFacet=Array.from({length:n},(_,i)=>i).filter(i=>other.every(k=>{
            const raw=rows[i][k],effective=raw===undefined||raw===''?'(Unassigned)':String(raw);
            return selections[k].includes(effective);
        })).length;
        assert.equal(g1,expectedFacet,name+' self-exclusion');
        scenarios.push({name,ms:round(ms),matches:result.matches.length,facetMembers:g1});
    }
    const all=invoke().result, items=facetItems(all.facets['G::Value'],[]);
    const searchStart=performance.now();
    assert.equal(searchFacetItems(items,'v'+(n-1)).some(x=>x.value==='v'+(n-1)),true);
    const searchMs=performance.now()-searchStart;
    const f=makeRuntimeFixture({count:1,sources:urns}),driver=createFilterVisualDriver({viewer:f.viewer,models:()=>f.models,window:f.host,yieldFrame:()=>Promise.resolve()});
    const visualStart=performance.now();
    const visual=await driver.apply(all,{...state,filterColors:{'G1::Estado':true,'G2::Estado':true}},()=>true);
    assert.equal(visual.colorCommands,n);
    assert.equal(f.models.reduce((sum,m)=>sum+m.colors.size,0),n);
    const visualMs=performance.now()-visualStart;
    driver.dispose();assert.equal(f.models.reduce((sum,m)=>sum+m.colors.size,0),0);
    return {n,sources,properties:state.filterProperties.length,duplicateRows:rows.length-n,preparationMs:round(preparationMs),
        coldMs:round(coldMs),warmMs:warm,warmMedianMs:[...warm].sort((a,b)=>a-b)[3],scenarios,
        search:{domain:items.length,ms:round(searchMs)},visual:{ms:round(visualMs),jobs:1,properties:2,commands:visual.colorCommands,acks:f.events.filter(e=>e.name==='viewer-colors-applied').length},
        heapBytes:{before,fixture:fixtureHeap,resultAndCache:heldHeap,cacheAfterResultRelease:releasedHeap}};
}
const argument=process.argv.find(x=>x.startsWith('--case='));
if(argument) console.log(JSON.stringify(await run(cases[Number(argument.slice(7))])));
else {
    const results=[];
    for(let i=0;i<cases.length;i++) {
        const child=spawnSync(process.execPath,['--expose-gc',fileURLToPath(import.meta.url),'--case='+i],{encoding:'utf8',maxBuffer:8*1024*1024});
        if(child.status!==0) {console.error(child.stdout,child.stderr);process.exit(1);}
        results.push(JSON.parse(child.stdout));
    }
    console.log(JSON.stringify({suite:'b5Scale',node:process.version,pass:results.length,fail:0,
        protocol:'fresh process / 1 cold + 7 warm / normalized qualified 10 properties / same real calculateFilterResult path; no historical speedup claim (B1 bypassed controller and lacked revision); heap after GC excludes GPU',
        results},null,2));
}
