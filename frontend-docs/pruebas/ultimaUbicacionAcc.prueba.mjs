// Banco de LA ÚLTIMA UBICACIÓN DE ACC del puente temporal (5-nov-2026): node frontend-docs/pruebas/ultimaUbicacionAcc.prueba.mjs
//
//   · lo navegado vuelve tal cual, por obra;
//   · lo que llegue roto del almacén, o un almacén que no deja, nunca rompe el selector: empieza por los centros;
//   · qué hay que pedir a ACC para enseñar cada ubicación.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerUbicacion, guardarUbicacion, nivelDeUbicacion, llaveDeUbicacion } from '../src/utils/ultimaUbicacionAcc.js';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
  catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}
const almacen = (inicial = {}) => {
  const datos = { ...inicial };
  return { getItem: k => (k in datos ? datos[k] : null), setItem: (k, v) => { datos[k] = v; },
           removeItem: k => { delete datos[k]; }, datos };
};
const queFalla = () => ({ getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } });
const acc = (id, nombre) => ({ id, type: 'folders', attributes: { displayName: nombre, extension: { x: 1 } } });
const nombres = (u) => [u.hub, u.project, ...u.ancestors].filter(Boolean).map(e => e.attributes.displayName);

const HUB = acc('b.hub', 'ysanchez-paq08.talara@sinohydroperu.com');
const PROY = acc('b.proj', 'PQT8 - DRENAJE PLUVIAL TALARA');
const CARPETAS = [acc('urn:1', 'Project Files'), acc('urn:2', 'PQT08_TALARA'), acc('urn:3', '4. METRADOS ASBUILT'),
                  acc('urn:4', 'PLANOS_SUSTENTO')];

await test('lo navegado vuelve tal cual, con sus nombres, y solo en esa obra', () => {
  const a = almacen();
  assert.equal(guardarUbicacion('obra1', { hub: HUB, project: PROY, ancestors: CARPETAS }, a), true);
  const u = leerUbicacion('obra1', a);
  assert.deepEqual(nombres(u), ['ysanchez-paq08.talara@sinohydroperu.com', 'PQT8 - DRENAJE PLUVIAL TALARA',
    'Project Files', 'PQT08_TALARA', '4. METRADOS ASBUILT', 'PLANOS_SUSTENTO']);
  assert.equal(u.ancestors.at(-1).id, 'urn:4');
  assert.equal(leerUbicacion('obra2', a), null);
  // Solo se guarda id y nombre: nada más de lo que trae ACC.
  assert.doesNotMatch(a.datos[llaveDeUbicacion('obra1')], /extension|folders/);
});

await test('volver hasta los centros la olvida', () => {
  const a = almacen();
  guardarUbicacion('o', { hub: HUB, project: PROY, ancestors: CARPETAS }, a);
  guardarUbicacion('o', {}, a);
  assert.equal(leerUbicacion('o', a), null);
});

await test('sin proyecto no hay carpetas', () => {
  const a = almacen();
  guardarUbicacion('o', { hub: HUB, project: null, ancestors: CARPETAS }, a);
  const u = leerUbicacion('o', a);
  assert.equal(u.project, null);
  assert.deepEqual(u.ancestors, []);
});

await test('lo roto o un almacén que no deja: ninguna ubicación, nunca un fallo', () => {
  const k = llaveDeUbicacion('o');
  for (const crudo of ['{', '42', 'null', '{"hub":{}}', '{"hub":{"id":7}}',
                       '{"hub":{"id":"h"},"project":{"id":"p"},"ancestors":[null]}']) {
    assert.equal(leerUbicacion('o', almacen({ [k]: crudo })), null, crudo);
  }
  assert.equal(leerUbicacion('o', queFalla()), null);
  assert.equal(guardarUbicacion('o', { hub: HUB }, queFalla()), false);
  assert.equal(leerUbicacion('', almacen()), null);
});

await test('qué se pide a ACC para enseñar cada ubicación', () => {
  assert.deepEqual(nivelDeUbicacion({}), ['hubs', {}]);
  assert.deepEqual(nivelDeUbicacion({ hub: HUB }), ['projects', { hub_id: 'b.hub' }]);
  assert.deepEqual(nivelDeUbicacion({ hub: HUB, project: PROY }), ['topFolders', { hub_id: 'b.hub', project_id: 'b.proj' }]);
  assert.deepEqual(nivelDeUbicacion({ hub: HUB, project: PROY, ancestors: CARPETAS }),
    ['contents', { project_id: 'b.proj', folder_id: 'urn:4' }]);
});

await test('el selector empieza donde se quedó y, si ACC no responde ahí, por los centros', () => {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const selector = readFileSync(join(raiz, 'src/components/AccFolderBridge.jsx'), 'utf8');
  assert.match(selector, /const antes = leerUbicacion\(modelUrn\)/);
  assert.match(selector, /if \(await load\(nivel, ids, true\)\) \{ recordar\.current = true; return; \}/);
  assert.match(selector, /guardarUbicacion\(modelUrn, \{\}\);\s*\}\s*recordar\.current = true;\s*load\('hubs'\);/);
  assert.match(selector, /if \(recordar\.current\) guardarUbicacion\(modelUrn, \{ hub, project, ancestors \}\)/);
});

console.log(`\nultimaUbicacionAcc: ${pass} pasan, ${fail} fallan`);
if (fail) process.exit(1);
