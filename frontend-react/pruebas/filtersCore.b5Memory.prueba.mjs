import assert from 'node:assert/strict';
import { setImmediate as turn } from 'node:timers/promises';
import { mountFiltersRuntime } from '../src/lib/filterRuntimeBridge.js';
import { makeRuntimeFixture,microtasks } from './filtersRuntime/fixture.mjs';
import { markInventoryRevision } from '../src/lib/inventoryIdentity.js';
if(typeof global.gc!=='function')throw new Error('Run node --expose-gc');
const f=makeRuntimeFixture({count:1000}),models=[],results=[],rows=[],heap=[];
const runtime=mountFiltersRuntime({host:f.host,viewer:f.viewer,getIntent:()=>f.state,models:()=>f.models,ready:()=>true});
await microtasks();
async function cycle(i) {
    const fresh=makeRuntimeFixture({count:1000});
    models.push(new WeakRef(f.models[0]));rows.push(new WeakRef(f.host.postgresInventory));results.push(new WeakRef(f.host.__filterResult));
    f.models.splice(0,1,fresh.models[0]);f.host.postgresInventory=fresh.host.postgresInventory;
    f.host.rosettaToDbId=fresh.host.rosettaToDbId;
    f.state={...f.state,scopeId:'scope-'+i};f.host.postgresInventoryUrn=f.state.scopeId;
    markInventoryRevision();
    f.host.dispatchEvent(new Event('ecd-frente-reset'));runtime.request(f.state);
    await microtasks();f.events.length=0;f.calls.length=0;
}
for(let i=0;i<25;i++) {
    await cycle(i);await turn();global.gc();heap.push(process.memoryUsage().heapUsed);
}
runtime.dispose();f.events.length=0;f.calls.length=0;
await turn();global.gc();await turn();global.gc();
const retained={models:models.filter(r=>r.deref()).length,rows:rows.filter(r=>r.deref()).length,results:results.filter(r=>r.deref()).length};
assert.deepEqual(retained,{models:0,rows:0,results:0},'retired scopes remain strongly reachable');
console.log(JSON.stringify({suite:'b5Memory',pass:1,cycles:25,rowsPerScope:1000,heapAfterGc:heap,retiredRetained:retained,
limits:'WeakRefs cover 25 retired source models, input datasets, FilterResults. One module-global facet index for the latest dataset remains bounded until replacement; not a browser heap snapshot or zero-memory claim.'},null,2));
