/** B1 contract boundary only. Real V2 capture/rebind/resolution plus the existing
 * independent FilterResult oracle. No new runtime FilterResult, Viewer or V2 changes.
 * Synthetic input; this is NOT an end-to-end browser/LMV or persisted DB test.
 */
import assert from 'node:assert/strict';
import { capturarVistaV2 } from '../src/lib/capturarVistaV2.js';
import * as V from '../src/lib/savedViewV2.js';
import { inventoryIdentity, inventoryRowKey, withInventoryIdentity } from '../src/lib/inventoryIdentity.js';
import { oracle } from './filtersCore/fixture.mjs';

let pass = 0;
function test(name, fn) {
    try { fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
    catch (error) { console.log(JSON.stringify({ name, status: 'UNEXPECTED FAIL', error: error.message })); process.exitCode = 1; }
}
const urn = (id, version = 1) => Buffer.from(`urn:adsk.wipprod:fs.file:vf.${id}?version=${version}`).toString('base64url');
const lineage = id => `urn:adsk.wipprod:dm.lineage:${id}`;
const config = ['A', 'B'].map(id => ({ urn: urn(id), item_id: lineage(id), version_number: 1, name: id }));
const rows = ['A', 'B'].map(id => withInventoryIdentity({ scope_id: 'front', source_lineage: lineage(id),
    external_id: 'shared', source_urn: urn(id), model_urn: urn(id) }, { Status: 'Ejecutado' }));
const input = { scopeId: 'front', revision: 17, schema: ['BIM::Status'], filterProperties: ['BIM::Status'],
    selections: {}, models: config.map((m, index) => ({ modelUrn: m.urn, format: 'BIM', loaded: true,
        ready: true, visible: true, declaredProperties: ['BIM::Status'], mapping: { shared: index + 101 } })),
    rows: rows.map(row => ({ modelUrn: row.source_urn, externalId: row.external_id, properties: { 'BIM::Status': row.Status } })) };
// Test-only binding: a future adapter must prove runtime source+front before
// attaching the new stable ternary. This helper is deliberately not product code.
function qualify(result, candidates = rows) {
    if (result.status !== 'ready' || !Array.isArray(result.matches)) return null;
    return result.matches.map(match => {
        const found = candidates.filter(row => row.scope_id === result.scopeId && row.source_urn === match.modelUrn
            && row.external_id === match.externalId);
        assert.equal(found.length, 1, 'Unresolved/ambiguous match cannot fall back to externalId globally');
        assert.ok(inventoryIdentity(found[0]));
        return { ...match, identity: inventoryIdentity(found[0]), element_key: inventoryRowKey(found[0]) };
    });
}
const ready = oracle(input);
test('FilterResult keeps two Sources sharing externalId separate', () => {
    assert.equal(ready.matches.length, 2);
    assert.deepEqual(new Set(qualify(ready).map(row => row.element_key)), new Set(rows.map(inventoryRowKey)));
    assert.deepEqual(new Set(qualify(ready).map(row => row.dbId)), new Set([101, 102]));
});
test('FilterResult absence, true zero and pending cannot be inferred from [] alone', () => {
    const noPredicates = oracle({ ...input, rows: [] });
    const zero = oracle({ ...input, selections: { 'BIM::Status': ['Pendiente'] } });
    const pending = oracle({ ...input, rows: null });
    assert.deepEqual([noPredicates.status, noPredicates.hasActivePredicates, noPredicates.matches], ['ready', false, []]);
    assert.deepEqual([zero.status, zero.hasActivePredicates, zero.matches], ['ready', true, []]);
    assert.deepEqual([pending.status, pending.matches], ['pending', null]);
    assert.equal(qualify(pending), null);
    assert.equal(zero.revision, 17); assert.equal(zero.scopeId, 'front');
});
test('Boundary rejects unknown source, wrong scope and duplicate qualified occurrence', () => {
    assert.throws(() => qualify({ ...ready, scopeId: 'wrong-front' }));
    assert.throws(() => qualify({ ...ready, matches: [{ modelUrn: urn('C'), externalId: 'shared', dbId: 103 }] }));
    assert.throws(() => qualify(ready, [...rows, rows[0]]));
});
const captureInput = {
    visor: { getAllModels: () => config.map(m => ({ getData: () => ({ urn: m.urn, globalOffset: { x: 0, y: 0, z: 0 } }) })) },
    estadoLmv: { viewport: { eye: [1, 2, 3], target: [0, 0, 0], fieldOfView: 35, isPerspective: false },
        objectSet: config.map((m, index) => ({ id: [index + 101], hidden: [], isolated: [], idType: 'lmv', seedUrn: m.urn })),
        renderOptions: { environment: 'Boardwalk' }, cutplanes: [] },
    modelConfig: config, ocultosUrn: [],
    rosettaPorUrn: { [urn('A')]: { 101: 'shared' }, [urn('B')]: { 102: 'shared' } },
    filtros: { properties: ['BIM::Status', V.PROP_SOURCES],
        selections: { 'BIM::Status': ['Ejecutado'], [V.PROP_SOURCES]: [urn('A')] },
        colors: {}, valueColors: {}, sourceColor: { on: false, custom: {} },
        ...ready },
    inventario: { columns: { mode: 'custom', keys: ['Status'] }, groupBy: null, totals: [], assetsOnly: false,
        matches: qualify(ready), revision: 17, element_key: rows[0].element_key },
    appVersion: 'b1-synthetic', reloj: () => '2026-09-07T00:00:00Z',
};
const captured = capturarVistaV2(captureInput);
test('Existing V2 capture remains valid with additive runtime inventory identity', () => {
    assert.equal(captured.validacion.ok, true, JSON.stringify(captured.validacion));
    assert.equal(V.esPersistibleV2(captured.doc).ok, true);
    assert.equal(captured.doc.schemaVersion, 2);
    assert.deepEqual(captured.doc.filters.selections[V.PROP_SOURCES], [lineage('A')]);
    assert.deepEqual(captured.doc.filters.selections['BIM::Status'], ['Ejecutado']);
});
test('V2 stores intent, not FilterResult runtime or new inventory identity metadata', () => {
    for (const object of [captured.doc, captured.doc.filters, captured.doc.inventory]) {
        for (const key of ['matches', 'matchesByModel', 'status', 'hasActivePredicates', 'revision', 'scopeId',
            'coverage', 'diagnostics', 'facets', 'scope_id', 'source_lineage', 'external_id', 'element_key']) {
            assert.equal(Object.hasOwn(object, key), false, 'Leaked runtime key: ' + key);
        }
    }
    assert.deepEqual(captured.doc.inventory.columns, { mode: 'custom', keys: ['Status'] });
});
test('V2 same externalId remains scoped to each objectSet source after version rebind', () => {
    assert.deepEqual(captured.doc.lmv.objectSet.map(o => o.elements.selected), [['shared'], ['shared']]);
    const nextConfig = config.map(m => ({ ...m, urn: urn(m.name, 2), version_number: 2 }));
    const rebound = V.aplicarRebind(captured.doc, V.planDeRebind(captured.doc, nextConfig));
    assert.deepEqual(rebound.doc.lmv.objectSet.map(o => o.seedUrn), nextConfig.map(m => m.urn));
    assert.deepEqual(V.resolverElementos(rebound.doc.lmv.objectSet[0].elements, { 501: 'shared' }).selected, [501]);
    assert.deepEqual(V.resolverElementos(rebound.doc.lmv.objectSet[1].elements, { 601: 'shared' }).selected, [601]);
    assert.deepEqual(captured.doc.lmv.objectSet.map(o => o.seedUrn), config.map(m => m.urn));
});
console.log(JSON.stringify({ suite: 'filtersCore.savedViewsBoundary', pass, unexpectedFail: process.exitCode ? 1 : 0,
    limits: 'Pure V2 functions and independent FilterResult contract fixture; no runtime engine, browser, DB or SavedViews implementation change.' }));
