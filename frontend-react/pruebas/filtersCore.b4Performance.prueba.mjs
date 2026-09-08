import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { availablePropertyGroups, selectedPropertyItems, reorderProperty, facetItems, searchFacetItems } from '../src/lib/filterPresentation.js';
import { mountFiltersRuntime } from '../src/lib/filterRuntimeBridge.js';
import { makeRuntimeFixture, tick } from './filtersRuntime/fixture.mjs';
function measure(name, fn, n = 40) {
    const times = []; let output;
    for (let i = 0; i < n; i++) { const start = performance.now(); output = fn(); times.push(performance.now() - start); }
    times.sort((a,b) => a-b);
    return { name, samples: n, medianMs: +times[Math.floor(n/2)].toFixed(3), p95Ms: +times[Math.floor(n*.95)].toFixed(3), outputSize: output.length ?? Object.keys(output).length };
}
const properties = Array.from({ length: 6000 }, (_, i) => ({ id: 'G' + i + '::Estado', name: 'Estado', category: 'G' + i }));
const ids = properties.map(p=>p.id), bucket = { values: Array.from({ length: 10001 }, (_, i) => ({ value: 'Valor ' + i, count: 1 })) };
const items = facetItems(bucket, []);
const measurements = [
    measure('property search 6000, qualified last item', () => availablePropertyGroups(properties, 'G5999::Estado')),
    measure('selected property search 6000', () => selectedPropertyItems(ids, properties, 'G5999::Estado')),
    measure('facet presentation 10001', () => facetItems(bucket, [])),
    measure('value search 10001 before limit', () => searchFacetItems(items, 'Valor 10000').slice(0, 5)),
    measure('reorder 6000 canonical identities', () => reorderProperty(ids, ids[5999], ids[1])),
];
const f = makeRuntimeFixture({ count: 3000, sources: ['m1','m2'] });
const rt = mountFiltersRuntime({ host: f.host, viewer: f.viewer, getIntent: () => f.state, models: () => f.models, ready: () => true });
await tick();
let start = rt.controller.metrics.computed;
const t = performance.now();
for (let i=0; i<20; i++) rt.request({ filterSelections: { 'G::Estado': [i%2 ? 'Pendiente' : 'Ejecutado'] } });
await tick();
const rapid = { gestures: 20, requestsCoalescedComputations: rt.controller.metrics.computed - start, elapsedMs: +(performance.now()-t).toFixed(3) };
assert.equal(rapid.requestsCoalescedComputations, 1);
start = rt.controller.metrics.computed;
for (let i=0; i<5; i++) { rt.request({ filterSelections: { 'G::Estado': [i%2 ? 'Pendiente' : 'Ejecutado'] } }); await tick(); }
const spaced = { gestures: 5, computations: rt.controller.metrics.computed - start };
assert.equal(spaced.computations, 5);
rt.dispose();
console.log(JSON.stringify({ node: process.version, synthetic: true, measurements, rapid, spaced,
    limits: 'Node presentation + existing runtime. No browser input-to-frame/GPU/production scale claim; no invented acceptance threshold.' }, null, 2));
