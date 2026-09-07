/** B1 connected boundary. Real helpers + real Grid callbacks via AST.
 * Only React setters, HTTP and window are doubles; no browser/LMV/DB claim.
 * node frontend-react/pruebas/inventoryIdentity.prueba.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as I from '../src/lib/inventoryIdentity.js';
import { normalizeInventoryPreload, normalizeInventoryRefresh } from '../src/lib/inventoryNormalizers.js';
const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const source = readFileSync(new URL('../src/components/InventoryDataGrid.jsx', import.meta.url), 'utf8');
const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
const nodes = [];
function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (value.type) nodes.push(value);
    for (const [key, child] of Object.entries(value)) {
        if (['loc', 'start', 'end'].includes(key)) continue;
        if (Array.isArray(child)) child.forEach(walk); else if (child && typeof child === 'object') walk(child);
    }
}
walk(ast);
function realFunction(name, context, { callback = false } = {}) {
    const declaration = nodes.find(node => node.type === 'VariableDeclarator' && node.id.name === name);
    assert.ok(declaration, 'Real function missing: ' + name);
    const fn = callback ? declaration.init.arguments[0] : declaration.init;
    return vm.runInNewContext('(' + source.slice(fn.start, fn.end) + ')', context);
}
const plain = value => JSON.parse(JSON.stringify(value));
const urn = id => Buffer.from(`urn:adsk.wipprod:fs.file:vf.${id}?version=1`).toString('base64url');
const node = (id, scope = 'front-A') => ({ scope_id: scope, source_lineage: `urn:adsk.wipprod:dm.lineage:${id}`,
    external_id: 'shared', source_urn: urn(id), model_urn: urn(id), name: id,
    installation_status: 'Before-' + id, properties: { BIM: { Material: id } } });
const input = [node('A'), node('B'), node('A', 'front-B')].map(n => ({ ...n,
    element_key: JSON.stringify([n.scope_id, n.source_lineage, n.external_id]) }));
const rows = normalizeInventoryPreload(input, value => value).mappedData;
let passed = 0, failed = 0;
async function test(id, run) {
    try { await run(); passed++; console.log(JSON.stringify({ id, outcome: 'PASS' })); }
    catch (error) { failed++; console.log(JSON.stringify({ id, outcome: 'FAIL', error: error.message })); }
}
function harness({ response = { ok: true }, selection = new Set([I.inventoryRowKey(rows[0])]), legacy = false } = {}) {
    const state = { flat: structuredClone(rows), raw: structuredClone(rows), error: null, calls: [] };
    const context = { ...I, BACKEND_URL: '', console: { error() {}, warn() {} },
        window: { postgresInventory: structuredClone(rows), dispatchEvent() {} },
        CustomEvent: class { constructor(type) { this.type = type; } },
        apiFetch: async (url, options) => { state.calls.push({ url, payload: JSON.parse(options.body) }); return response; },
        setInventoryError: value => { state.error = value; },
        setFlattenedData: fn => { state.flat = typeof fn === 'function' ? fn(state.flat) : fn; },
        setRawData: fn => { state.raw = typeof fn === 'function' ? fn(state.raw) : fn; },
        bulkAssigning: false, bulkField: 'Status', bulkNewField: '', bulkValue: 'After',
        bulkTargetIds: selection, checkedIds: legacy ? new Set() : selection, rawData: state.raw,
        setBulkAssigning() {}, setCheckedIds() {}, setBulkValue() {}, setColumns() {},
        setAllPropertyKeys() {}, setBulkField() {}, setBulkNewField() {}, alert() {},
    };
    return { state, context };
}
await test('identity/two-sources-and-two-fronts-remain-distinct', () => {
    assert.equal(new Set(rows.map(I.inventoryRowKey)).size, 3);
    assert.deepEqual(rows.map(r => r.dbId), ['shared', 'shared', 'shared']);
    assert.deepEqual(rows.map(r => r.external_id), ['shared', 'shared', 'shared']);
});
await test('identity/refresh-retains-the-same-termas', () => {
    assert.deepEqual(normalizeInventoryRefresh(input, x => x).mappedData.map(I.inventoryRowKey), rows.map(I.inventoryRowKey));
});
await test('identity/cannot-be-overwritten-by-BIM-property', () => {
    const hostile = { ...input[0], properties: { BIM: { scope_id: 'fake', external_id: 'fake', element_key: 'fake', dbId: 99 } } };
    assert.deepEqual(I.inventoryIdentity(normalizeInventoryPreload([hostile], x => x).mappedData[0]), I.inventoryIdentity(rows[0]));
});
await test('identity/mismatched-element-key-rejected', () => assert.throws(() => I.requireInventoryIdentity({ ...rows[0], element_key: rows[1].element_key })));
await test('identity/missing-fields-do-not-infer-scope-from-URN', () => assert.throws(() => I.inventoryEditPayload({ dbId: 'shared', source_urn: urn('A') }, 'Status', 'After')));
await test('identity/reserved-metadata-not-editable', () => assert.throws(() => I.inventoryEditPayload(rows[0], 'scope_id', 'other')));
await test('identity/3D-legacy-selection-is-ambiguous-even-if-visible-subset', () => {
    assert.throws(() => I.resolveInventoryTargets(rows, new Set(['shared']), { legacyExternalIds: true }), /ambigua/);
});
await test('identity/3D-unique-selection-can-be-qualified', () => {
    const unique = { ...rows[0], dbId: 'unique', external_id: 'unique', element_key: JSON.stringify(['front-A', rows[0].source_lineage, 'unique']) };
    assert.deepEqual(I.resolveInventoryTargets([...rows, unique], ['unique'], { legacyExternalIds: true }), [unique]);
});
await test('identity/viewer-highlight-is-source-qualified', () => {
    assert.equal(I.inventoryRowForViewer(rows.filter(r => r.scope_id === 'front-A'), 'shared', urn('B')), rows[1]);
    assert.equal(I.inventoryRowForViewer(rows, 'shared', urn('unknown')), null);
});
await test('identity/grid-HTTP-normalizer-retains-canonical-fields', () => {
    const context = { ...I, window: {} };
    context.formatFractionalInch = realFunction('formatFractionalInch', context);
    const result = realFunction('processDbData', context)(input);
    assert.deepEqual(plain(result.mappedData.map(I.inventoryRowKey)), rows.map(I.inventoryRowKey));
    assert.ok(result.cols.every(c => !['scope_id', 'source_lineage', 'external_id', 'element_key'].includes(c.key)));
});
await test('real-cell-edit/updates-A-not-B-or-other-front', async () => {
    const h = harness(); await realFunction('handleCellEdit', h.context, { callback: true })(rows[0], 'Status', 'After');
    assert.deepEqual(h.state.calls[0].payload, I.inventoryEditPayload(rows[0], 'Status', 'After'));
    assert.deepEqual(h.state.raw.map(r => r.Status), ['After', 'Before-B', 'Before-A']);
    assert.deepEqual(h.context.window.postgresInventory.map(r => r.Status), ['After', 'Before-B', 'Before-A']);
});
await test('real-cell-edit/409-preserves-data-and-shows-error', async () => {
    const h = harness({ response: { ok: false, status: 409, json: async () => ({ code: 'STALE_ACTIVE_URN' }) } });
    await realFunction('handleCellEdit', h.context, { callback: true })(rows[0], 'Status', 'After');
    assert.deepEqual(h.state.raw, rows); assert.match(h.state.error, /409.*STALE_ACTIVE_URN/);
    assert.equal(h.state.flat[0].Status, 'Before-A');
});
await test('real-cell-edit/no-request-for-legacy-row', async () => {
    const h = harness(); await realFunction('handleCellEdit', h.context, { callback: true })({ dbId: 'shared' }, 'Status', 'After');
    assert.equal(h.state.calls.length, 0); assert.match(h.state.error, /identidad/);
});
const bulkFn = nodes.find(n => n.type === 'JSXAttribute' && n.name.name === 'onClick'
    && n.value?.expression?.type === 'ArrowFunctionExpression'
    && source.slice(n.value.expression.start, n.value.expression.end).includes('/api/inventory/bulk'))?.value.expression;
assert.ok(bulkFn, 'Real bulk callback missing');
const bulk = context => vm.runInNewContext('(' + source.slice(bulkFn.start, bulkFn.end) + ')', context)();
await test('real-bulk/qualified-selection-does-not-expand-shared-ext', async () => {
    const h = harness(); await bulk(h.context);
    assert.deepEqual(h.state.calls[0].payload, I.inventoryBulkPayload([rows[0]], 'Status', 'After'));
    assert.deepEqual(h.state.raw.map(r => r.Status), ['After', 'Before-B', 'Before-A']);
});
await test('real-bulk/503-never-shows-success', async () => {
    const h = harness({ response: { ok: false, status: 503, json: async () => ({ error: 'IDENTITY_NOT_READY' }) } });
    await bulk(h.context); assert.deepEqual(h.state.raw, rows); assert.match(h.state.error, /503.*IDENTITY_NOT_READY/);
});
await test('real-bulk/ambiguous-3D-selection-sends-nothing', async () => {
    const h = harness({ selection: new Set(['shared']), legacy: true }); await bulk(h.context);
    assert.equal(h.state.calls.length, 0); assert.deepEqual(h.state.raw, rows); assert.match(h.state.error, /ambigua/);
});
await test('real-bulk/one-stale-row-aborts-entire-selection', async () => {
    const h = harness({ selection: new Set([I.inventoryRowKey(rows[0]), 'missing']) }); await bulk(h.context);
    assert.equal(h.state.calls.length, 0); assert.deepEqual(h.state.raw, rows);
});
console.log(JSON.stringify({ suite: 'inventoryIdentity', passed, failed, limitations: 'No browser, LMV or backend; real helper and callback execution with doubles.' }));
process.exitCode = failed ? 1 : 0;
