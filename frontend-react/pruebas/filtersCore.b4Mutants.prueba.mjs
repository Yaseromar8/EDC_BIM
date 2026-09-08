import assert from 'node:assert/strict';
import { runB4 } from './filtersCore.b4.prueba.mjs';
const control = await runB4();
assert.equal(control.fail, 0, 'healthy product must pass original oracles');
const targets = [
    ['search-after-limit', '6001 values: search then render; clear preserves selection; bounded DOM'],
    ['dnd-visible-index', 'DnD filtered + cancelled + consecutive + clear search + homonyms'],
    ['palette-by-position', 'legend colors equal B3 actual driver; reorder independent; two properties'],
];
const mutants = [];
for (const [mutation, target] of targets) {
    const changed = await runB4({ mutant: mutation });
    const healthy = control.cases.find(c => c.name === target);
    const result = changed.cases.find(c => c.name === target);
    const killed = healthy.status === 'PASS' && result.status === 'FAIL';
    mutants.push({ mutation, target, killed, failure: result.error });
}
console.log(JSON.stringify({ healthy: control.pass, mutants, killed: mutants.filter(m => m.killed).length }, null, 2));
assert.ok(mutants.every(m => m.killed), 'mutant survived unchanged healthy oracle');
