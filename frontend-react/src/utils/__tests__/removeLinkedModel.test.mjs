import test from 'node:test';
import assert from 'node:assert/strict';
import { removeLinkedModel } from '../removeLinkedModel.js';

test('unlink confirmado: envia frente y URN exactos', async () => {
  let request;
  await removeLinkedModel(async (url, options) => {
    request = { url, options };
    return { ok: true };
  }, 'https://backend.test', '1_CANAL', 'version-66');
  assert.equal(request.url, 'https://backend.test/api/config/project/remove');
  assert.deepEqual(JSON.parse(request.options.body), {
    urn: 'version-66', project: '1_CANAL',
  });
});

test('unlink rechazado no se presenta como exito local', async () => {
  await assert.rejects(() => removeLinkedModel(async () => ({
    ok: false, status: 503,
    json: async () => ({ error: 'No se aplicaron cambios.' }),
  }), 'https://backend.test', '1_CANAL', 'version-66'), /No se aplicaron cambios/);
});

test('error de red tambien impide retirar el modelo local', async () => {
  await assert.rejects(() => removeLinkedModel(async () => {
    throw new Error('sin conexion');
  }, 'https://backend.test', '1_CANAL', 'version-66'), /sin conexion/);
});
