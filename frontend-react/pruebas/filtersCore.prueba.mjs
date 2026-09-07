/**
 * B1 contract/oracle + known-red baseline. Run from repository root:
 *   node frontend-react/pruebas/filtersCore.prueba.mjs
 * No DB, network, viewer, source edits or output artifacts. Exit 1 while any
 * baseline defect remains. A KNOWN FAIL is an actual failing requirement,
 * NOT a passing assertion that the old bug still exists. Unexpected changes
 * (including an unexpected fix) are separate and require review.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { calculateBucketsFromPostgres as calculate } from '../src/aps/utils/model.js';
import { fixture, oracle, inspectCell, elementKey, ref, ALL } from './filtersCore/fixture.mjs';

const totals = { contractPass: 0, baselinePass: 0, knownFail: 0, unexpectedFail: 0, unexpectedPass: 0 };
// Exact defective signatures, independent from the CORRECT expectations.
const baselineSignatures = new Map([
]);
function check(id, run, { baseline = false, known = false } = {}) {
    try {
        run();
        const outcome = known ? 'UNEXPECTED PASS' : baseline ? 'BASELINE PASS' : 'CONTRACT PASS';
        totals[known ? 'unexpectedPass' : baseline ? 'baselinePass' : 'contractPass']++;
        console.log(JSON.stringify({ id, outcome }));
    } catch (error) {
        const recognized = known && error.code === 'ERR_ASSERTION' && baselineSignatures.has(id)
            && isDeepStrictEqual(error.actual, baselineSignatures.get(id));
        totals[recognized ? 'knownFail' : 'unexpectedFail']++;
        console.log(JSON.stringify({ id, outcome: recognized ? 'KNOWN FAIL' : 'UNEXPECTED FAIL',
            expectedInBaseline: recognized, error: error.message, actual: error.actual, expected: error.expected }));
    }
}
const sameMembers = (actual, expected) => assert.deepEqual(
    actual.map(elementKey).sort(), expected.map(elementKey).sort());
const values = (result, propertyId) => result.facets.find(f => f.propertyId === propertyId).values;
const counts = (result, propertyId) => Object.fromEntries(values(result, propertyId).map(v => [v.value, [v.count, v.totalCount]]));
const run = selections => oracle({ ...fixture(), selections });

check('contract/no-predicates-is-ready-universe', () => {
    const result = run({});
    assert.deepEqual([result.status, result.hasActivePredicates, result.scopeId, result.revision], ['ready', false, 'synthetic-front', 1]);
    sameMembers(result.matches, ALL);
    sameMembers(result.matchesByModel.flatMap(m => m.matches), ALL);
});
check('contract/one-property-one-value', () => sameMembers(run({ 'G1::Estado': ['Ejecutado'] }).matches, [ALL[0], ALL[1], ALL[5]]));
check('contract/OR-within-property', () => sameMembers(run({ 'G1::Estado': ['Ejecutado', 'Pendiente', 'Ejecutado'] }).matches, [ALL[0], ALL[1], ALL[2], ALL[3], ALL[5]]));
check('contract/AND-between-properties', () => sameMembers(run({ 'G1::Estado': ['Ejecutado'], 'Obra::Zona': ['Norte'] }).matches, [ALL[0]]));
check('contract/self-excluded-facets', () => {
    const result = run({ 'G1::Estado': ['Ejecutado'], 'Obra::Zona': ['Norte'] });
    assert.deepEqual(counts(result, 'G1::Estado'), { 'Ejecutado': [1, 3], 'En curso': [0, 1], 'Pendiente': [1, 2] });
    assert.deepEqual(counts(result, 'Obra::Zona'), { 'Este': [1, 1], 'Norte': [1, 2], 'Sur': [1, 3] });
});
check('contract/panel-order-independent', () => {
    const input = fixture(); input.selections = { 'G1::Estado': ['Ejecutado'], 'Obra::Zona': ['Norte'] };
    const a = oracle(input), b = oracle({ ...input, filterProperties: [...input.filterProperties].reverse() });
    sameMembers(a.matches, [ALL[0]]); sameMembers(b.matches, [ALL[0]]);
    for (const propertyId of input.filterProperties) assert.deepEqual(counts(a, propertyId), counts(b, propertyId));
});
check('contract/homonyms-are-independent', () => sameMembers(run({ 'G1::Estado': ['Ejecutado'], 'G2::Estado': ['Aprobado'] }).matches, [ALL[0]]));
check('contract/input-order-does-not-reorder-matches', () => {
    const a = fixture(), b = fixture(); b.rows.reverse(); b.models.reverse();
    assert.deepEqual(oracle(a).matches, oracle(b).matches);
    assert.deepEqual(oracle(a).matchesByModel, oracle(b).matchesByModel);
});
check('contract/same-externalId-and-dbId-different-model', () => {
    const result = run({});
    sameMembers(result.matches.filter(m => m.externalId === 'shared'), [ALL[0], ALL[3]]);
    assert.equal(result.matches.filter(m => m.dbId === 1).length, 3);
});
check('contract/duplicates-count-once-and-diagnosed', () => {
    const input = fixture(); input.rows.push(structuredClone(input.rows[0]));
    const result = oracle(input); sameMembers(result.matches, ALL);
    assert.equal(result.coverage.duplicateRows, 1);
    assert.equal(counts(result, 'G1::Estado').Ejecutado[1], 3);
    assert.deepEqual(result.diagnostics, [{ code: 'DUPLICATE_ROWS', count: 1 }]);
});
check('contract/hidden-source-excluded-not-unloaded', () => {
    const input = fixture(); input.models[1].visible = false;
    const result = oracle(input); sameMembers(result.matches, [ALL[0], ALL[1], ALL[2], ALL[5]]);
    assert.equal(result.coverage.hiddenRows, 2); assert.equal(input.models[1].loaded, true);
});
check('contract/conflicting-duplicate-is-not-first-wins', () => {
    const input = fixture(), changed = structuredClone(input.rows[0]); changed.properties['G1::Estado'] = 'Conflict'; input.rows.push(changed);
    const result = oracle(input); assert.equal(result.status, 'invalid'); assert.equal(result.matches, null);
    assert.equal(result.diagnostics[0].code, 'CONFLICTING_DUPLICATE');
});
check('contract/five-models-preserve-shared-identifiers', () => {
    const input = fixture();
    for (const modelUrn of ['bim-D', 'ifc-E']) {
        input.models.push({ ...structuredClone(input.models[0]), modelUrn, mapping: { shared: 1 } });
        input.rows.push({ ...structuredClone(input.rows[0]), modelUrn });
    }
    const result = oracle(input); sameMembers(result.matches, [...ALL, ref('bim-D', 'shared', 1), ref('ifc-E', 'shared', 1)]);
    assert.equal(result.matchesByModel.length, 5); assert.equal(result.coverage.eligibleUniqueElements, 8);
});
check('contract/foreign-source-excluded-with-diagnostic', () => {
    const input = fixture(); input.rows.push({ ...structuredClone(input.rows[0]), modelUrn: 'not-in-this-front' });
    const result = oracle(input); assert.equal(result.status, 'ready'); sameMembers(result.matches, ALL);
    assert.equal(result.coverage.outOfScopeRows, 1); assert.equal(result.diagnostics[0].code, 'OUT_OF_SCOPE_ROWS');
});
for (const field of ['loaded', 'ready']) check(`contract/model-${field}-false-is-pending`, () => {
    const input = fixture(); input.models[1][field] = false;
    const result = oracle(input); assert.equal(result.status, 'pending'); assert.equal(result.matches, null);
});
check('contract/unresolved-never-falls-back-to-other-source', () => {
    const input = fixture(); delete input.models[1].mapping.shared;
    const result = oracle(input); assert.equal(result.status, 'pending'); assert.equal(result.matches, null); assert.equal(result.coverage.unresolvedRows, 1);
});
check('contract/remap-changes-dbId-and-revision', () => {
    const input = fixture(); input.revision = 2; input.models[0].mapping.shared = 99;
    const result = oracle(input); assert.equal(result.revision, 2);
    assert.deepEqual(result.matches.find(m => m.modelUrn === 'bim-A' && m.externalId === 'shared'), ref('bim-A', 'shared', 99));
});
check('contract/empty-universe-vs-zero-with-predicates', () => {
    const empty = oracle({ ...fixture(), rows: [] }), zero = run({ 'G1::Estado': ['not-present'] });
    assert.deepEqual([empty.status, empty.hasActivePredicates, empty.matches], ['ready', false, []]);
    assert.deepEqual([zero.status, zero.hasActivePredicates, zero.matches], ['ready', true, []]);
    assert.deepEqual(counts(zero, 'G1::Estado')['not-present'], [0, 0]);
});
check('contract/missing-property-is-invalid-not-unfiltered', () => {
    const result = run({ 'Deleted::Property': ['x'] });
    assert.deepEqual([result.status, result.hasActivePredicates, result.matches, result.matchesByModel, result.facets], ['invalid', true, null, null, null]);
});
for (const [id, change, status] of [['missing-inventory', { rows: null }, 'pending'], ['missing-schema', { schema: null }, 'pending'],
    ['data-error', { error: true }, 'error'], ['invalid-revision', { revision: -1 }, 'error'], ['invalid-scope', { scopeId: '' }, 'error']]) {
    check(`contract/${id}-not-false-zero`, () => {
        const result = oracle({ ...fixture(), ...change });
        assert.deepEqual([result.status, result.matches, result.matchesByModel, result.facets], [status, null, null, null]);
    });
}
check('contract/value-kinds-are-not-truthiness', () => {
    const model = { declaredProperties: ['G::P'] }, cell = properties => inspectCell({ properties }, model, 'G::P');
    assert.equal(cell({}).kind, 'missing'); assert.equal(cell({ 'G::P': null }).kind, 'null');
    for (const raw of ['', '  ', []]) assert.equal(cell({ 'G::P': raw }).kind, 'empty');
    for (const [raw, token] of [[0, '0'], [false, 'false'], ['N/A', 'N/A'], ['01', '01'], [[' A ', 'B'], 'A, B'], ['constructor', 'constructor'], ['__proto__', '__proto__']]) {
        assert.deepEqual(cell({ 'G::P': raw }), { kind: 'value', token, raw });
    }
    assert.equal(inspectCell({ properties: {} }, { declaredProperties: [] }, 'G::P').kind, 'not-applicable');
    assert.equal(inspectCell({ properties: {} }, {}, 'G::P').kind, 'unknown');
    assert.equal(cell({ 'G::P': '(Unassigned)' }).kind, 'value');
    assert.equal(cell({ 'G::P': '(No aplica)' }).kind, 'value');
});
check('contract/zero-false-reserved-values-filterable', () => {
    const input = fixture(); input.schema = input.filterProperties = ['G::P']; input.models = [input.models[0]];
    input.models[0].declaredProperties = ['G::P']; input.models[0].mapping = { zero: 1, false: 2, reserved: 3 };
    input.rows = [[0, 'zero'], [false, 'false'], ['__proto__', 'reserved']].map(([value, externalId]) => ({ modelUrn: 'bim-A', externalId, properties: { 'G::P': value } }));
    input.selections = { 'G::P': ['0', 'false'] }; sameMembers(oracle(input).matches, [ref('bim-A', 'zero', 1), ref('bim-A', 'false', 2)]);
    input.selections = { 'G::P': ['__proto__'] }; sameMembers(oracle(input).matches, [ref('bim-A', 'reserved', 3)]);
});

// Baseline checks call the REAL existing module, never the test oracle.
const rawRows = [{ dbId: 'a', source_urn: 'm1', P: 'A', Q: 'X' }, { dbId: 'b', source_urn: 'm1', P: 'B', Q: 'Y' }];
check('baseline/AND-OR', () => {
    const result = calculate(rawRows, ['G::P', 'G::Q'], { 'G::P': ['A', 'B'], 'G::Q': ['X'] }, { m1: { a: 1, b: 2 } });
    assert.deepEqual(result.globalValidDbIds, [{ id: 1, modelUrn: 'm1' }]);
}, { baseline: true });
check('P0-1/in-place-inventory-stale', () => {
    const rows = [{ dbId: 'a', source_urn: 'm1', P: 'Before' }], rosetta = { m1: { a: 1 } };
    calculate(rows, ['G::P'], {}, rosetta); rows[0].P = 'After';
    assert.deepEqual(calculate(rows, ['G::P'], {}, rosetta).buckets['G::P'].values.map(v => v.value), ['After']);
});
check('P0-1/rosetta-remap-same-cardinality', () => {
    const rows = [{ dbId: 'a', source_urn: 'm1', P: 'X' }], rosetta = { m1: { a: 1 } };
    calculate(rows, ['G::P'], { 'G::P': ['X'] }, rosetta); rosetta.m1.a = 99;
    assert.deepEqual(calculate(rows, ['G::P'], { 'G::P': ['X'] }, rosetta).globalValidDbIds, [{ id: 99, modelUrn: 'm1' }]);
});
// TEST DEFECT: wrong layer / impossible oracle.
//
// El caso anterior --`P0-2/homonyms-cannot-survive-flat-contract`-- entregaba al
// motor una fila PLANA, la que producia el aplanado, y exigia que el elemento
// casara a la vez con `G1::Estado=['Ejecutado']` y `G2::Estado=['Pendiente']`.
// Desde esa entrada el valor de G1 YA NO EXISTE: se perdio al aplanar. Ningun
// motor correcto puede recuperarlo sin inventarlo, y hacer que un valor no
// atribuible case con cualquier seleccion seria cambiar la semantica de Filters.
// El oraculo era imposible y estaba ademas en la capa equivocada: lo que hay que
// demostrar --que los homonimos sobreviven-- se demuestra sobre el pipeline
// completo, y asi se hace en `filtersCore.normalizadores`:
//   P0-2/homonyms-survive-normalizer-to-engine
//   P0-2/homonyms-are-not-interchangeable
//   P0-2/homonym-facets-are-independent
//
// Lo que SI se puede afirmar desde una entrada aplanada es lo de abajo, y es la
// mitad que faltaba: un dato ambiguo no se atribuye en silencio a una propiedad
// cualificada que no lo respalda.
check('P0-2/flat-input-is-not-attributed-to-qualified-properties', () => {
    const rows = [{ dbId: 'a', source_urn: 'm1', Estado: 'Pendiente' }];
    const seleccionado = calculate(rows, ['G1::Estado', 'G2::Estado'],
        { 'G1::Estado': ['Ejecutado'], 'G2::Estado': ['Pendiente'] }, { m1: { a: 1 } });
    // Ni siquiera casa con el grupo cuyo valor coincide por casualidad: el dato
    // plano no dice de que grupo es, y adivinarlo seria inventar la atribucion.
    assert.deepEqual(seleccionado.globalValidDbIds, []);
    const facetas = calculate(rows, ['G1::Estado', 'G2::Estado'], {}, { m1: { a: 1 } });
    assert.deepEqual(facetas.buckets['G1::Estado'].values.map(v => v.value), ['(No aplica)']);
    assert.deepEqual(facetas.buckets['G2::Estado'].values.map(v => v.value), ['(No aplica)']);
});
check('P0-2/flat-input-still-serves-a-property-without-homonyms', () => {
    // Y no se rompe la compatibilidad: sin homonimia, el nombre suelto sigue
    // resolviendo, que es como llega un dataset aun no cualificado.
    const rows = [{ dbId: 'a', source_urn: 'm1', Estado: 'Pendiente' }];
    const result = calculate(rows, ['G1::Estado'], { 'G1::Estado': ['Pendiente'] }, { m1: { a: 1 } });
    assert.deepEqual(result.buckets['G1::Estado'].values.map(v => v.value), ['Pendiente']);
    assert.deepEqual(result.globalValidDbIds, [{ id: 1, modelUrn: 'm1' }]);
});
check('P0-3/global-fallback-crosses-hidden-source', () => {
    const result = calculate([{ dbId: 'same', source_urn: 'unloaded', P: 'X' }], ['G::P'], { 'G::P': ['X'] }, { m1: { same: 11 }, m2: { same: 22 } }, ['m1']);
    assert.deepEqual(result.globalValidDbIds, []);
});
for (const value of ['constructor', 'toString', '__proto__']) check(`P0-4/reserved-value-${value}`, () => {
    // A fresh process contains Object.prototype damage to the test child.
    const moduleUrl = new URL('../src/aps/utils/model.js', import.meta.url).href;
    const source = `import {calculateBucketsFromPostgres as c} from ${JSON.stringify(moduleUrl)};
const before=Object.hasOwn(Object.prototype,'count'); let outcome;
try {const r=c([{dbId:'a',source_urn:'m1',P:${JSON.stringify(value)}}],['G::P'],{},{m1:{a:1}});outcome={values:r.buckets['G::P'].values.map(v=>v.value),count:r.buckets['G::P'].total};}
catch(error){outcome={error:error.message};}
console.log(JSON.stringify({...outcome,prototypeChanged:Object.hasOwn(Object.prototype,'count')!==before}));`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8' });
    if (child.error || child.status !== 0) throw new Error(`Child infrastructure error: ${child.error?.message || child.stderr}`);
    assert.deepEqual(JSON.parse(child.stdout), { values: [value], count: 1, prototypeChanged: false });
});
// La huella de la rosetta solo es portante CON revision: sin ella no se cachea
// y cualquier remapeo se ve igual. Este caso es el del producto, que si la pasa.
check('P0-1/rosetta-remap-with-revision-invalidates', () => {
    const rows = [{ dbId: 'a', source_urn: 'm1', P: 'X' }], rosetta = { m1: { a: 1 } };
    calculate(rows, ['G::P'], { 'G::P': ['X'] }, rosetta, [], 7); rosetta.m1.a = 99;
    assert.deepEqual(calculate(rows, ['G::P'], { 'G::P': ['X'] }, rosetta, [], 7).globalValidDbIds, [{ id: 99, modelUrn: 'm1' }]);
});
// Y la revision, cuando cambia, invalida aunque el array sea el mismo objeto.
check('P0-1/revision-change-invalidates-in-place-edit', () => {
    const rows = [{ dbId: 'a', source_urn: 'm1', P: 'Before' }], rosetta = { m1: { a: 1 } };
    calculate(rows, ['G::P'], {}, rosetta, [], 1); rows[0].P = 'After';
    assert.deepEqual(calculate(rows, ['G::P'], {}, rosetta, [], 2).buckets['G::P'].values.map(v => v.value), ['After']);
});
check('P0-5/duplicate-rows-not-unique-counts', () => {
    const row = { dbId: 'a', source_urn: 'm1', P: 'X' };
    const result = calculate([row, { ...row }], ['G::P'], { 'G::P': ['X'] }, { m1: { a: 1 } });
    assert.deepEqual({ count: result.buckets['G::P'].values[0].count, matches: result.globalValidDbIds }, { count: 1, matches: [{ id: 1, modelUrn: 'm1' }] });
});

console.log(JSON.stringify({ summary: totals, scope: 'Synthetic contract and code baseline. B1 identity plus the B2 dataset/normalizer/cache correction; B3/B4 defects stay in their own suites',
    green: totals.knownFail + totals.unexpectedFail + totals.unexpectedPass === 0 }));
process.exitCode = totals.knownFail || totals.unexpectedFail || totals.unexpectedPass ? 1 : 0;
