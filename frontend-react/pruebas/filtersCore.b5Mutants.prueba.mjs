import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeRuntimeFixture,microtasks} from './filtersRuntime/fixture.mjs';
const driver=new URL('../src/lib/filterVisualDriver.js',import.meta.url),bridge=new URL('../src/lib/filterRuntimeBridge.js',import.meta.url);
async function load(url,mutation) {
    let source=readFileSync(url,'utf8').replace(/\r\n/g,'\n');
    if(mutation){assert.ok(source.includes(mutation[0]),'missing mutant marker');source=source.replace(...mutation);}
    source=source.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_all,_q,path)=>'from '+JSON.stringify(new URL(path,url).href));
    return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
async function retired(module) {
    const f=makeRuntimeFixture(),old=f.models[0];let writes=0;
    const d=module.createFilterVisualDriver({viewer:f.viewer,models:()=>f.models,window:f.host,onExternal:()=>writes++});
    f.models.splice(0,1,makeRuntimeFixture().models[0]);d.syncModels();
    old.setThemingColor(1,{x:1});assert.equal(writes,0,'retired model retains ownership hook');d.dispose();
}
async function mirrors(module) {
    const f=makeRuntimeFixture(),r=module.mountFiltersRuntime({host:f.host,viewer:f.viewer,getIntent:()=>f.state,models:()=>f.models,ready:()=>true});
    await microtasks();r.dispose();
    assert.ok(f.host._lastCalculatedBuckets===null && f.host._lastValidDbIds===null,'result mirrors retained after dispose');
}
async function newer(module) {
    const f=makeRuntimeFixture(),mount=()=>module.mountFiltersRuntime({host:f.host,viewer:f.viewer,getIntent:()=>f.state,models:()=>f.models,ready:()=>true});
    const a=mount();await microtasks();
    // Cleanup may arrive after a newer owner has published in the same scope.
    const newerResult={...f.host.__filterResult,revision:f.host.__filterResult.revision+1};
    f.host.__filterResult=newerResult;a.dispose();
    assert.equal(f.host.__filterResult,newerResult,'old dispose erases another owner result');
}
const cases=[
    ['retired-model-hook',driver,["if (!live.has(model)) {","if (false) {"],retired],
    ['retained-result-mirrors',bridge,['host._lastHasActiveFilters=false;host._lastValidDbIds=null;host._lastCalculatedBuckets=null;','/* retain orphan mirrors */'],mirrors],
    ['cleanup-by-scope-not-owner',bridge,['if(host.__filterResult===ownedResult) {','if(host.__filterResult?.scopeId===getIntent()?.scopeId) {'],newer]
];
const result=[];
for(const [name,url,mutation,check] of cases) {
    await check(await load(url));
    let caught;try{await check(await load(url,mutation));}catch(e){caught=e;}
    assert.ok(caught instanceof assert.AssertionError,'must fail behavioral oracle, not source/import');
    result.push({name,healthy:'PASS',mutant:'FAIL',killed:true,reason:caught.message.split('\n')[0]});
}
console.log(JSON.stringify({suite:'b5Mutants',killed:result.length,survived:0,result},null,2));
