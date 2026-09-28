import assert from 'node:assert/strict';
import { accPreviewKey, accReadOnlyPath, makeAccPreviewLink,
  readAccPreview, removeAccPreview, saveAccPreview } from '../src/utils/accPreviewLocal.js';

const values = new Map();
const storage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key),
};
let casos = 0;

const key = accPreviewKey('doc-1', 'version-1', 'gs://bytes-1');
assert.notEqual(key, accPreviewKey('doc-1', 'version-2', 'gs://bytes-1'));
assert.notEqual(key, accPreviewKey('doc-1', 'version-1', 'gs://bytes-2'));
assert.equal(accPreviewKey('doc-1', null, null), null);
casos++;

const id = 'urn:adsk.wipprod:fs.file:vf.123?version=2';
const link = makeAccPreviewLink({ fileName: 'ALINEAMIENTOS.dwg', gcsUrn: 'gs://bytes-1',
  projectId: 'b.proyecto', itemId: 'urn:adsk.wipprod:dm.lineage:abc',
  version: { id, attributes: { name: 'ALINEAMIENTOS.dwg', versionNumber: 2 } } });
assert.equal(link.preview_local, true);
assert.equal(link.version_number, 2);
assert.equal(Buffer.from(link.viewer_urn, 'base64url').toString('utf8'), id);
casos++;

assert.equal(saveAccPreview(key, link, storage), true);
assert.deepEqual(readAccPreview(key, storage), link);
removeAccPreview(key, storage);
assert.equal(readAccPreview(key, storage), null);
casos++;

assert.equal(saveAccPreview(key, { viewer_urn: 'x' }, storage), false);
values.set(key, '{html');
assert.equal(readAccPreview(key, storage), null);
casos++;

assert.throws(() => makeAccPreviewLink({ fileName: 'OTRO.dwg', gcsUrn: 'gs://bytes-1',
  version: { id, attributes: { name: 'ALINEAMIENTOS.dwg' } } }), /mismo archivo/);
casos++;

assert.equal(accReadOnlyPath('hubs'), '/api/hubs');
assert.equal(accReadOnlyPath('projects', { hub_id: 'b.123' }), '/api/hubs/b.123/projects');
assert.equal(accReadOnlyPath('topFolders', { hub_id: 'b.123', project_id: 'b.456' }),
  '/api/hubs/b.123/projects/b.456/topFolders');
assert.equal(accReadOnlyPath('contents', { project_id: 'b.456', folder_id: 'urn:a/b' }),
  '/api/projects/b.456/folders/urn%3Aa%2Fb/contents');
assert.equal(accReadOnlyPath('versions', { project_id: 'b.456', item_id: 'urn:x' }),
  '/api/projects/b.456/items/urn%3Ax/versions');
casos++;

assert.throws(() => accReadOnlyPath('contents', { project_id: 'b.456' }), /inválida/);
assert.throws(() => accReadOnlyPath('delete'), /inválida/);
casos++;

console.log(`accPreviewLocal: ${casos} casos correctos, sin peticiones ni escrituras remotas`);
