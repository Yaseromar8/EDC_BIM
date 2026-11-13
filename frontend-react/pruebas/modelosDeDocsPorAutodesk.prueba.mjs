// Banco de «UN MODELO DE DOCS QUE SE VE POR AUTODESK DOCS» (docs/archivos/29 §8, 13-nov-2026):
//   node frontend-react/pruebas/modelosDeDocsPorAutodesk.prueba.mjs
//
// Visto en producción: una carpeta de Docs con el «puente ACC» no dejaba vincular sus modelos desde «Importar modelo →
// ALEPHIA Docs» («Esta version usa el puente temporal ACC; consulta su estado en Docs»).
//
//   · qué hace el selector según responda `/api/docs/cad/acc-link`: vincular por Autodesk, decir que aún no, o seguir
//     el camino de siempre;
//   · que lo pregunta ANTES de pedir ninguna preparación a Docs;
//   · que el URN y los datos de ACC no los manda el navegador al vincular: los pone el servidor.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { destinoPorAutodesk, NOTA_POR_AUTODESK } from '../src/utils/modelosDeDocsPorAutodesk.js';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
  catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}
const aqui = dirname(fileURLToPath(import.meta.url));
const fuente = (ruta) => readFileSync(join(aqui, '..', ruta), 'utf8');

const URN = 'dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLkFiQ18xLXg_dmVyc2lvbj0z';
const enlace = { project_id: 'b.1', item_id: 'urn:adsk.wipprod:dm.lineage:AbC', version_id: 'urn:adsk.wipprod:fs.file:vf.AbC?version=3', viewer_urn: URN };

await test('con el enlace listo, se vincula por Autodesk Docs con su URN', () => {
  assert.deepEqual(destinoPorAutodesk({ success: true, link: enlace, bridge: null }), { urn: URN });
  // El enlace manda aunque el trabajo del puente siga diciendo algo.
  assert.deepEqual(destinoPorAutodesk({ success: true, link: enlace, bridge: { status: 'ready' } }), { urn: URN });
});

await test('con el puente sin terminar se dice qué pasa, y no se prepara nada', () => {
  assert.match(destinoPorAutodesk({ success: true, link: null, bridge: { status: 'preparing' } }).espera, /aún está preparando/);
  assert.match(destinoPorAutodesk({ success: true, link: null, bridge: { status: 'queued' } }).espera, /aún está preparando/);
  assert.match(destinoPorAutodesk({ success: true, link: null, bridge: { status: 'uploading', paused: true } }).espera, /en pausa/);
  assert.equal(destinoPorAutodesk({ success: true, link: null, bridge: { status: 'error', error: 'ACC no pudo preparar esta version.' } }).espera,
    'Autodesk Docs no pudo preparar esta versión: ACC no pudo preparar esta version. Revísala en Docs.');
  assert.equal(destinoPorAutodesk({ success: true, link: null, bridge: { status: 'error' } }).espera,
    'Autodesk Docs no pudo preparar esta versión. Revísala en Docs.');
});

await test('sin enlace ni puente, el camino de siempre: la preparación de Docs', () => {
  for (const r of [{ success: true, link: null, bridge: null }, { success: true }, { success: false, error: 'x' }, null, undefined, 'texto', {}]) {
    assert.equal(destinoPorAutodesk(r), null, JSON.stringify(r));
  }
});

await test('un URN que no tiene forma de URN de visor no se usa', () => {
  for (const malo of ['', 'corto', 'con espacios dentro del urn', 'a/b/c/d/e/f/g/h/i/j/k', null, 12345]) {
    assert.equal(destinoPorAutodesk({ success: true, link: { ...enlace, viewer_urn: malo }, bridge: null }), null, String(malo));
  }
  // Y si además hay puente, se dice que aún no.
  assert.ok(destinoPorAutodesk({ success: true, link: { viewer_urn: '' }, bridge: { status: 'preparing' } }).espera);
});

await test('el selector lo pregunta antes de pedir ninguna preparación', () => {
  const selector = fuente('src/components/ImportarDesdeDocs.jsx');
  const pregunta = selector.indexOf('/api/docs/cad/acc-link?node_id=');
  const primeraPreparacion = selector.indexOf('const primera = await traducir()');
  assert.ok(pregunta > 0 && primeraPreparacion > 0 && pregunta < primeraPreparacion,
    'la consulta del enlace va antes de la primera llamada a /translate');
  assert.match(selector, /if \(destino\?\.espera\) return rendirse\(destino\.espera\);/);
  assert.match(selector, /await cargarVistas\(destino\.urn\);\s*return;/, 'con el enlace listo no se llega a /translate');
});

await test('al vincular, el navegador manda el documento y la vista: el URN y los datos de ACC los pone el servidor', () => {
  const selector = fuente('src/components/ImportarDesdeDocs.jsx');
  const cuerpo = /add-from-docs'[\s\S]{0,260}?body: JSON\.stringify\(\{([\s\S]*?)\}\)/.exec(selector);
  assert.ok(cuerpo, 'se encuentra el cuerpo de add-from-docs');
  for (const prohibido of ['urn', 'itemId', 'projectId', 'versionId', 'viewer_urn']) {
    assert.ok(!new RegExp(`\\b${prohibido}\\b`).test(cuerpo[1]), `el cuerpo no manda ${prohibido}`);
  }
  assert.match(cuerpo[1], /documento: elegido\.id/);
  // Y no usa la ruta de ACC, que acepta lo que diga el navegador.
  assert.ok(!selector.includes("'/api/config/project/add'"));
});

await test('se le dice a la persona que el modelo se vincula por Autodesk Docs, sin emojis', () => {
  assert.match(NOTA_POR_AUTODESK, /Autodesk Docs/);
  assert.match(NOTA_POR_AUTODESK, /Buscar actualizaciones/);
  assert.ok(!/\p{Extended_Pictographic}/u.test(NOTA_POR_AUTODESK));
  assert.match(fuente('src/components/ImportarDesdeDocs.jsx'), /\{porAutodesk && <p[^>]*>\{NOTA_POR_AUTODESK\}<\/p>\}/);
});

console.log(JSON.stringify({ total: pass + fail, pass, fail }));
if (fail) process.exit(1);
