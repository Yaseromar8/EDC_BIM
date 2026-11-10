// Banco de LOS DOCUMENTOS DE UN PIN (docs/archivos/29, F1): node frontend-react/pruebas/documentosDelPin.prueba.mjs
//
//   · se vinculan por su id de Docs, con su nombre, sin carpetas ni repetidos;
//   · se abren por Docs (versión vigente y permiso), y los vínculos antiguos por su URL;
//   · NINGÚN fichero del visor vuelve a llamar a /api/docs/mutate-bind, la ruta que ya no existe y que impedía
//     guardar el vínculo.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { documentosParaVincular, urlParaAbrir } from '../src/utils/documentosDelPin.js';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
  catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}

const DOCS = [
  { id: 'a1', name: 'PLANO-001.pdf', type: 'FILE' },
  { id: 'b2', name: 'Protocolo BZ-12.PDF', type: 'file' },
  { id: 'c3', name: '01 Planos', type: 'FOLDER' },
  { id: 'd4', name: 'sin-extension', type: 'FILE' },
];

await test('se vinculan por su id de Docs y con su nombre; las carpetas no', () => {
  assert.deepEqual(documentosParaVincular(['a1', 'b2', 'c3'], DOCS), [
    { id: 'a1', nodeId: 'a1', name: 'PLANO-001.pdf', type: 'pdf' },
    { id: 'b2', nodeId: 'b2', name: 'Protocolo BZ-12.PDF', type: 'pdf' },
  ]);
  assert.equal(documentosParaVincular(['d4'], DOCS)[0].type, '');
});

await test('lo que el pin ya tiene, o se eligió dos veces, no se repite', () => {
  assert.deepEqual(documentosParaVincular(['a1', 'b2', 'b2'], DOCS, [{ nodeId: 'a1', name: 'PLANO-001.pdf' }]).map(d => d.id), ['b2']);
  assert.deepEqual(documentosParaVincular(['a1'], DOCS, [{ id: 'a1' }]), []);              // un vínculo antiguo sin nodeId
  assert.deepEqual(documentosParaVincular(['zz'], DOCS), []);
  assert.deepEqual(documentosParaVincular(null, null), []);
});

await test('se abren por Docs; un vínculo antiguo, por su URL', () => {
  assert.equal(urlParaAbrir({ nodeId: 'a 1' }, 'https://api/docs', 'proyectos/PQT8'),
    'https://api/docs/view?id=a%201&model_urn=proyectos%2FPQT8');
  assert.equal(urlParaAbrir({ url: 'https://antigua' }, 'https://api/docs', 'x'), 'https://antigua');
  assert.equal(urlParaAbrir({}, 'https://api/docs', 'x'), null);
});

await test('ningún fichero del visor llama a /api/docs/mutate-bind (la ruta no existe)', () => {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const llaman = [];
  const recorrer = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { recorrer(p); continue; }
      if (!/\.(jsx?|mjs)$/.test(n)) continue;
      const codigo = readFileSync(p, 'utf8').split('\n')
        .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      if (/['"`][^'"`]*\/api\/docs\/mutate-bind/.test(codigo)) llaman.push(p.slice(raiz.length + 1));
    }
  };
  recorrer(raiz);
  assert.deepEqual(llaman, []);
});

console.log(`\ndocumentosDelPin: ${pass} pasan, ${fail} fallan`);
if (fail) process.exit(1);
