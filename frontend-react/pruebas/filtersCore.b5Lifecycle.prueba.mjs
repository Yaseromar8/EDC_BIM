import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { mountFiltersRuntime } from '../src/lib/filterRuntimeBridge.js';
import { makeRuntimeFixture, microtasks, tick } from './filtersRuntime/fixture.mjs';

const f=makeRuntimeFixture({count:1000});
const names=['recalculate-filters','inventory-ready','rosetta-ready','viewer-model-loaded','ecd-frente-reset'];
const listeners=()=>names.map(n=>getEventListeners(f.host,n).length);
const initial=listeners(), retired=[];
const rt=mountFiltersRuntime({host:f.host,viewer:f.viewer,getIntent:()=>f.state,models:()=>f.models,ready:()=>true});
await microtasks();
for(let cycle=0;cycle<20;cycle++) {
    const old=f.models[0];
    const fresh=makeRuntimeFixture({count:1000}).models[0];
    const original=fresh.setThemingColor;
    f.models.splice(0,1,fresh);
    f.host.dispatchEvent(new Event('viewer-model-loaded'));
    await microtasks();
    const before=rt.controller.metrics.requested;
    old.setThemingColor(1,{x:1});
    assert.equal(rt.controller.metrics.requested,before,'retired Source still controls the current runtime');
    retired.push({model:fresh,original});
}
rt.dispose();await tick();
assert.equal(f.host._lastCalculatedBuckets,null,'disposed runtime retains legacy facet result');
assert.equal(f.host._lastValidDbIds,null,'disposed runtime retains legacy membership');
assert.deepEqual(listeners(),initial,'listeners accumulate');
for(const {model,original} of retired) assert.equal(model.setThemingColor,original,'retired model hook retained');
for(let cycle=0;cycle<20;cycle++) {
    const runtime=mountFiltersRuntime({host:f.host,viewer:f.viewer,getIntent:()=>f.state,models:()=>f.models,ready:()=>true});
    await microtasks();
    const current=f.host.__filterResult;
    rt.dispose();
    assert.equal(f.host.__filterResult,current,'repeated dispose erases a newer runtime');
    runtime.dispose();
    assert.deepEqual(listeners(),initial);
}
console.log(JSON.stringify({suite:'b5Lifecycle',pass:5,fail:0,reloads:20,remounts:20,oracle:'retired models cannot trigger requests; hooks restored; listeners baseline; mirrors released; repeated dispose cannot erase new result'}));
