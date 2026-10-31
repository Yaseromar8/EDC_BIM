// Banco de los ENLACES DE TABLEROS (docs/visor/63): el tablero y la vista en la dirección.
//
// Lo que fija:
//   · se leen solo identificadores (el tablero es un UUID; la vista, letras, cifras, - y _);
//   · escribirlos no pierde lo demás de la dirección (la obra, una carpeta…), y quitarlos tampoco;
//   · «Copiar enlace» da la obra, el tablero y la vista;
//   · Docs entra en Tableros con `?tablero=` (forma del código de useFileExplorer).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { leerEnlaceDeTablero, conTablero, enlaceDeVista } from '../src/components/tableros/enlaceDeTablero.js';
import { leerEnlaceDeArchivos } from '../src/utils/enlacesDeArchivos.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
  catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.message })); }
}
const T = '0f8e2c1a-3b4d-4e5f-8a9b-0c1d2e3f4a5b';

test('lee el tablero y la vista', () => {
  assert.deepEqual(leerEnlaceDeTablero(`?obra=7&tablero=${T}&vistaTablero=vabc_1-2`), { tablero: T, vista: 'vabc_1-2' });
});
test('sin tablero, o con uno que no es UUID: nada', () => {
  assert.equal(leerEnlaceDeTablero('?obra=7'), null);
  assert.equal(leerEnlaceDeTablero('?tablero=1;DROP'), null);
  assert.equal(leerEnlaceDeTablero(''), null);
});
test('`vista` (la del circuito de la planilla) no es una vista de tablero', () => {
  assert.deepEqual(leerEnlaceDeTablero(`?tablero=${T}&vista=2000`), { tablero: T, vista: null });
  assert.equal(conTablero(`?vista=2000&tablero=${T}`, null), '?vista=2000');
});
test('una vista con caracteres raros se ignora, el tablero no', () => {
  assert.deepEqual(leerEnlaceDeTablero(`?tablero=${T}&vistaTablero=<script>`), { tablero: T, vista: null });
});
test('escribir conserva lo demás', () => {
  assert.equal(conTablero('?obra=7&carpeta=x', { tablero: T, vista: 'v1' }), `?obra=7&carpeta=x&tablero=${T}&vistaTablero=v1`);
});
test('cambiar de vista o quitarla reemplaza, no acumula', () => {
  assert.equal(conTablero(`?obra=7&tablero=${T}&vistaTablero=v1`, { tablero: T, vista: 'v2' }), `?obra=7&tablero=${T}&vistaTablero=v2`);
  assert.equal(conTablero(`?obra=7&tablero=${T}&vistaTablero=v1`, { tablero: T }), `?obra=7&tablero=${T}`);
});
test('quitar el tablero deja la obra', () => {
  assert.equal(conTablero(`?obra=7&tablero=${T}&vistaTablero=v1`, null), '?obra=7');
  assert.equal(conTablero(`?tablero=${T}`, null), '');
});
test('«Copiar enlace» lleva obra, tablero y vista, y abre la obra como un enlace de Archivos', () => {
  const e = enlaceDeVista('https://alephia.com.pe', { obra: 7, tablero: T, vista: 'v1' });
  assert.equal(e, `https://alephia.com.pe/?obra=7&tablero=${T}&vistaTablero=v1`);
  const search = e.slice(e.indexOf('?'));
  assert.deepEqual(leerEnlaceDeArchivos(search), { obra: '7', carpeta: null, documento: null, version: null });
  assert.deepEqual(leerEnlaceDeTablero(search), { tablero: T, vista: 'v1' });
});
test('forma del código: useFileExplorer entra en Tableros con ?tablero=', () => {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(aqui, '../src/hooks/useFileExplorer.js'), 'utf8');
  assert.match(src, /tablero=\[0-9a-f-\]\{36\}\(&\|\$\)\/i\.test\(window\.location\.search\) \? 'tableros'/);
});

console.log(`${pass}/${pass + fail}`);
if (fail) process.exit(1);
