import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { apiJson } from '../src/utils/apiFetch.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const fuente = ruta => readFileSync(join(aqui, '..', 'src', ruta), 'utf8');
const originalFetch = globalThis.fetch;
const originalLocalStorage = globalThis.localStorage;
const originalSessionStorage = globalThis.sessionStorage;
globalThis.localStorage = { getItem: () => null };
globalThis.sessionStorage = { getItem: () => null };

let casos = 0;
async function respuesta(body, status, contentType = 'application/json') {
  globalThis.fetch = async () => new Response(body, { status, headers: { 'Content-Type': contentType } });
  return apiJson('/api/docs/cad/acc-link?node_id=ensayo', { retries: 0 });
}

try {
  assert.deepEqual(await respuesta('{"success":true,"link":null}', 200), { success: true, link: null });
  casos++;

  await assert.rejects(respuesta('{"error":"Plano no encontrado"}', 404), /HTTP 404: Plano no encontrado/);
  casos++;

  await assert.rejects(respuesta('<!doctype html><html><body>Not Found</body></html>', 404, 'text/html'),
    error => error.status === 404 && /HTTP 404:.*HTML en vez de JSON/.test(error.message)
      && !error.message.includes('<!doctype'));
  casos++;

  await assert.rejects(respuesta('<!doctype html><html></html>', 200, 'text/html'),
    /HTTP 200:.*HTML en vez de JSON/);
  casos++;

  const lector = fuente('components/DocumentViewer.jsx');
  const selector = fuente('components/AccLinkPicker.jsx');
  assert.match(lector, /apiJson\(`\$\{API\}\/api\/docs\/cad\/acc-link\?/);
  assert.match(selector, /apiJson\(`\$\{API\}\/api\/docs\/cad\/acc-browse\?/);
  assert.match(selector, /apiJson\(`\$\{API\}\/api\/docs\/cad\/acc-link`,\s*\{\s*method: 'POST'/);
  assert.match(selector, /apiJson\(`\$\{API\}\/api\/docs\/cad\/acc-link`,\s*\{\s*method: 'DELETE'/);
  casos++;

  console.log(`accLinkRespuesta: ${casos} casos correctos, sin peticiones de red`);
} finally {
  globalThis.fetch = originalFetch;
  globalThis.localStorage = originalLocalStorage;
  globalThis.sessionStorage = originalSessionStorage;
}
