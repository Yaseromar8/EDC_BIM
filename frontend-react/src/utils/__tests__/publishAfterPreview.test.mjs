import test from 'node:test';
import assert from 'node:assert/strict';
import { publishAfterPreview } from '../publishAfterPreview.js';

test('no publica si falta un mosaico o falla la comprobación local', async () => {
  let writes = 0;
  for (const prepared of [false, undefined, null]) {
    assert.equal(await publishAfterPreview(async () => prepared,
      async () => { writes += 1; return true; }), false);
  }
  assert.equal(writes, 0);
});

test('publica una sola vez después de la comprobación local', async () => {
  const steps = [];
  assert.equal(await publishAfterPreview(
    async () => { steps.push('preparar'); return true; },
    async () => { steps.push('publicar'); return true; }), true);
  assert.deepEqual(steps, ['preparar', 'publicar']);
});

test('un fallo de publicación no se convierte en éxito', async () => {
  assert.equal(await publishAfterPreview(async () => true, async () => false), false);
  await assert.rejects(publishAfterPreview(async () => true,
    async () => { throw new Error('publicación fallida'); }), /publicación fallida/);
});
