import assert from 'node:assert/strict';
import { uploadAccParts } from '../src/utils/accParallelUpload.js';

const size = 11 * 1024 * 1024;
const partSize = 6 * 1024 * 1024;
const file = {
  size,
  slice(start, end) { return { start, end }; },
};
const plan = { urls: ['https://s3.test/1', 'https://s3.test/2'], partSize };
const originalFetch = globalThis.fetch;
const originalTimeout = globalThis.setTimeout;
try {
  const parts = [];
  globalThis.fetch = async (url, request) => {
    parts.push({ url, method: request.method, body: request.body });
    return { ok: true };
  };
  await uploadAccParts(file, plan, new AbortController().signal);
  assert.deepEqual(parts, [
    { url: plan.urls[0], method: 'PUT', body: { start: 0, end: partSize } },
    { url: plan.urls[1], method: 'PUT', body: { start: partSize, end: size } },
  ]);
  await assert.rejects(uploadAccParts(file, { ...plan, urls: [plan.urls[0]] },
    new AbortController().signal), /Plan de subida ACC inválido/);

  let tries = 0;
  globalThis.fetch = async () => { tries++; return { ok: false }; };
  globalThis.setTimeout = callback => { callback(); return 0; };
  await assert.rejects(uploadAccParts(file, plan, new AbortController().signal),
    /se usará la copia de respaldo/);
  assert.equal(tries, 3);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(uploadAccParts(file, plan, controller.signal),
    error => error.name === 'AbortError');
} finally {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalTimeout;
}

console.log('accParallelUpload: partes, plan inválido, fallback y cancelación');
