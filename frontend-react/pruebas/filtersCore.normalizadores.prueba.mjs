/** P0-2: SAME endpoint payload through TWO actual connected App normalizers.
 * Existing algorithms are not fixed here. Exit 1 for exact known divergences.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { normalizeInventoryPreload, normalizeInventoryRefresh } from '../src/lib/inventoryNormalizers.js';
import { inventoryIdentity } from '../src/lib/inventoryIdentity.js';
const sourceUrn = Buffer.from('urn:adsk.wipprod:fs.file:vf.A?version=1').toString('base64url');
const endpoint = [{ scope_id: 'front', source_lineage: 'urn:adsk.wipprod:dm.lineage:A', external_id: 'shared',
    source_urn: sourceUrn, model_urn: sourceUrn, name: 'Element', properties: {
        Group: { Group_Height: 0, 'Group - Width': false },
        'PROPERTY SETS': { 'Pset - Estado': 'Ejecutado' },
        G1: { Estado: 'A' }, G2: { Estado: 'B' },
    } }];
const before = structuredClone(endpoint);
const initial = normalizeInventoryPreload(endpoint, x => x);
const refresh = normalizeInventoryRefresh(endpoint, x => x);
const totals = { pass: 0, knownFail: 0, unexpectedFail: 0, unexpectedPass: 0 };
function check(id, actual, expected, knownSignature) {
    if (isDeepStrictEqual(actual, expected)) {
        totals[knownSignature === undefined ? 'pass' : 'unexpectedPass']++;
        console.log(JSON.stringify({ id, outcome: knownSignature === undefined ? 'PASS' : 'UNEXPECTED PASS' }));
    } else {
        const known = knownSignature !== undefined && isDeepStrictEqual(actual, knownSignature);
        totals[known ? 'knownFail' : 'unexpectedFail']++;
        console.log(JSON.stringify({ id, outcome: known ? 'KNOWN FAIL' : 'UNEXPECTED FAIL', actual, expected }));
    }
}
check('normalizers/input-unmodified', endpoint, before);
check('normalizers/identity-same-endpoint', inventoryIdentity(initial.mappedData[0]), inventoryIdentity(refresh.mappedData[0]));
check('normalizers/zero-false-retained', [initial.mappedData[0].Height, initial.mappedData[0].Width], ['0', 'false']);
check('P0-2/load-refresh-prefix-disagreement', [initial.mappedData[0].Height, refresh.mappedData[0].Height ?? null], ['0', '0']);
check('P0-2/load-refresh-property-sets-disagreement', [initial.schemaMap['PROPERTY SETS::Estado']?.name, refresh.schemaMap['PROPERTY SETS::Estado']?.name ?? null], ['Estado', 'Estado']);
check('P0-2/group-homonyms-qualified', [initial.mappedData[0]['G1::Estado'] ?? null, initial.mappedData[0]['G2::Estado'] ?? null], ['A', 'B']);
// EXTREMO A EXTREMO: normalizador REAL -> motor REAL. Es donde de verdad se
// demuestra que los homonimos sobreviven, porque el motor recibe exactamente lo
// que produce el normalizador y no una fila escrita a mano.
const { calculateBucketsFromPostgres } = await import('../src/aps/utils/model.js');
const rosetta = { [sourceUrn]: { shared: 7 } };
const e2e = (selections) => calculateBucketsFromPostgres(
    initial.mappedData, ['G1::Estado', 'G2::Estado'], selections, rosetta).globalValidDbIds;
check('P0-2/homonyms-survive-normalizer-to-engine', e2e({ 'G1::Estado': ['A'], 'G2::Estado': ['B'] }),
    [{ id: 7, modelUrn: sourceUrn }]);
check('P0-2/homonyms-are-not-interchangeable', e2e({ 'G1::Estado': ['B'] }), []);
check('P0-2/homonym-facets-are-independent', [
    calculateBucketsFromPostgres(initial.mappedData, ['G1::Estado', 'G2::Estado'], {}, rosetta)
        .buckets['G1::Estado'].values.map(v => v.value),
    calculateBucketsFromPostgres(initial.mappedData, ['G1::Estado', 'G2::Estado'], {}, rosetta)
        .buckets['G2::Estado'].values.map(v => v.value),
], [['A'], ['B']]);

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
check('normalizers/real-functions-connected-in-App', [app.includes('normalizeInventoryPreload(dbData, normalizeRevitCategory)'), app.includes('normalizeInventoryRefresh(dbData, normalizeRevitCategory)')], [true, true]);
check('normalizers/old-IDB-format-invalidated', app.includes('cached.identityFormat === INVENTORY_IDENTITY_FORMAT'), true);
assert.equal(initial.mappedData[0].dbId, 'shared');
console.log(JSON.stringify({ suite: 'filtersCore.normalizadores', ...totals, limitations: 'Normalizador y motor REALES, sin navegador ni DB. Los defectos B2 se corrigieron en el producto; las expectativas no se tocaron.' }));
process.exitCode = totals.knownFail || totals.unexpectedFail || totals.unexpectedPass ? 1 : 0;
