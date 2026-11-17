// Banco de LA PÁGINA PÚBLICA DE UNA CARPETA COMPARTIDA (17-nov-2026, docs/archivos/32):
//   node frontend-docs/pruebas/carpetaCompartida.prueba.mjs
//
//   · las direcciones del contenido y de un documento, sin aceptar ids raros;
//   · cómo se dicen el tamaño, la fecha, el tipo y el resumen;
//   · que la página pública monta la carpeta cuando el enlace es de una carpeta, y el lector cuando es de un archivo;
//   · que la carpeta no usa la sesión: es una página para quien NO tiene usuario.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  rutaDelContenido, rutaDelArchivo, tamano, fechaCorta, tipoDeArchivo, resumenDeLaCarpeta,
} from '../src/utils/carpetaCompartida.js';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
  catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}
const aqui = dirname(fileURLToPath(import.meta.url));
const fuente = (ruta) => readFileSync(join(aqui, '..', ruta), 'utf8');

const SHARE = '564fc209-2a7d-4b3f-a216-289645556ad3';
const NODO = '22222222-2222-4222-8222-222222222222';

await test('la dirección del contenido: la carpeta compartida o una subcarpeta', () => {
  assert.equal(rutaDelContenido('', SHARE), `/api/docs/shared/${SHARE}/contenido`);
  assert.equal(rutaDelContenido('https://api', SHARE, NODO), `https://api/api/docs/shared/${SHARE}/contenido?carpeta=${NODO}`);
  // Un id raro no se manda: se pide la carpeta compartida.
  for (const raro of ['abc', '../x', 'x?y=1', null, undefined]) {
    assert.equal(rutaDelContenido('', SHARE, raro), `/api/docs/shared/${SHARE}/contenido`);
  }
});

await test('la dirección de un documento, y ninguna si el id no vale', () => {
  assert.equal(rutaDelArchivo('', SHARE, NODO), `/api/docs/shared/${SHARE}/archivo/${NODO}`);
  for (const raro of ['abc', '../x', '', null]) assert.equal(rutaDelArchivo('', SHARE, raro), null);
});

await test('tamaño, fecha y tipo como se leen en obra', () => {
  assert.equal(tamano(2516582), '2,4 MB');
  assert.equal(tamano(84213), '82 KB');
  assert.equal(tamano(12), '12 B');
  assert.equal(tamano(0), '');
  assert.equal(tamano(null), '');
  assert.equal(fechaCorta('2026-11-10T18:15:44Z'), '10/11/2026');
  assert.equal(fechaCorta(null), '');
  assert.equal(tipoDeArchivo('PAQ-08_S1_SUSTENTO.pdf'), 'PDF');
  assert.equal(tipoDeArchivo('METRADO.xlsx'), 'XLSX');
  assert.equal(tipoDeArchivo('SIN EXTENSION'), '');
});

await test('el resumen de lo que hay', () => {
  assert.equal(resumenDeLaCarpeta({ carpetas: [{}], archivos: [{}, {}, {}] }), '1 carpeta · 3 documentos');
  assert.equal(resumenDeLaCarpeta({ carpetas: [{}, {}], archivos: [] }), '2 carpetas');
  assert.equal(resumenDeLaCarpeta({ carpetas: [], archivos: [{}] }), '1 documento');
  assert.equal(resumenDeLaCarpeta({ carpetas: [], archivos: [] }), 'Esta carpeta está vacía.');
  assert.equal(resumenDeLaCarpeta(null), 'Esta carpeta está vacía.');
});

await test('la página pública monta la carpeta si el enlace es de una carpeta, y el lector si es de un archivo', () => {
  const pagina = fuente('src/components/SharedViewer.jsx');
  const carpeta = pagina.indexOf('if (data.es_carpeta)');
  const lector = pagina.lastIndexOf('<DocumentViewer');
  assert.ok(carpeta > 0 && lector > carpeta, 'la carpeta se decide antes de montar el lector');
  assert.match(pagina, /<CarpetaCompartida API=\{API\} shareId=\{shareId\} nombre=\{data\.name\} \/>/);
});

await test('la carpeta no usa la sesión ni manda credenciales', () => {
  const carpeta = fuente('src/components/CarpetaCompartida.jsx');
  assert.ok(!/apiFetch|Authorization|localStorage|sessionStorage/.test(carpeta));
  assert.match(carpeta, /disabled=\{!a\.disponible/, 'lo que no puede salir se ve pero no se abre');
});

console.log(JSON.stringify({ total: pass + fail, pass, fail }));
if (fail) process.exit(1);
