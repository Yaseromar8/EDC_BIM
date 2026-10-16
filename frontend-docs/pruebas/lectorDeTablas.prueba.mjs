// Banco de utils/lectorDeTablas.js — el modo Tabla y el ancla LDA.
// node frontend-docs/pruebas/lectorDeTablas.prueba.mjs
import assert from 'node:assert/strict';
import { letraDeColumna, columnaClave, buscarFilas, filaDeClave, escribirAncla, leerAncla, firmaDelArchivo, motivoSiNoEsPlanilla } from '../src/utils/lectorDeTablas.js';

let ok = 0;
const casos = [];
const caso = (nombre, fn) => casos.push([nombre, fn]);

const PLANILLA = [
  ['PLANILLA DE METRADOS · ESTRUCTURAS'],
  ['Canal de derivación, tramo 2'],
  ['Ítem', 'Descripción', 'Und.', 'Metrado'],
  ['02.01', 'CONCRETO', '', ''],
  ['02.01.03', "Concreto f'c 210 en canal revestido", 'm3', '47,10'],
  ['02.01.04', "Concreto f'c 175 en solado", 'm3', '6,85'],
  ['02.01.05', 'Concreto en cabezal de alcantarilla', 'm3', '3,40'],
];

caso('letras de columna como en Excel', () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52, 701, 702].map(letraDeColumna),
    ['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
});

caso('la columna clave sale de la cabecera «Ítem», con su fila', () => {
  assert.deepEqual(columnaClave(PLANILLA), { columna: 0, filaCabecera: 2 });
});

caso('sin cabecera reconocible, la columna con más ítems (al menos 3); sin ítems, null', () => {
  const sinCab = [['x', 'a'], ['y', '01.01'], ['z', '01.02'], ['w', '01.03']];
  assert.deepEqual(columnaClave(sinCab), { columna: 1, filaCabecera: 0 });
  assert.equal(columnaClave([['a', 'b'], ['c', 'd']]), null);
  assert.equal(columnaClave([]), null);
});

caso('buscar: la clave exacta primero, luego el texto; menos de 2 letras no busca', () => {
  assert.deepEqual(buscarFilas(PLANILLA, '02.01.04', 0), [5]);
  assert.deepEqual(buscarFilas(PLANILLA, 'concreto', 0), [3, 4, 5, 6]);
  assert.deepEqual(buscarFilas(PLANILLA, 'c', 0), []);
});

caso('la fila de una clave se encuentra aunque la planilla se reordene', () => {
  assert.equal(filaDeClave(PLANILLA, 0, '02.01.05'), 6);
  const reordenada = [PLANILLA[2], PLANILLA[6], PLANILLA[4], PLANILLA[5]];
  assert.equal(filaDeClave(reordenada, 0, '02.01.05'), 1);
  assert.equal(filaDeClave(PLANILLA, 0, '99.99'), -1);
  assert.equal(filaDeClave(PLANILLA, null, '02.01.05'), -1);
});

caso('ancla LDA: se escribe y se lee igual (hoja con espacios, zona, elemento)', () => {
  const t = { codigo: '500125-CSSP001-000-XX-SH-ES-000410', version: 5, selector: { hoja: 'Concreto 2', clave: '02.01.03' } };
  const a = escribirAncla(t);
  assert.equal(a, 'lda:500125-CSSP001-000-XX-SH-ES-000410@V5#hoja=Concreto%202&clave=02.01.03');
  assert.deepEqual(leerAncla(a), t);
  const z = escribirAncla({ codigo: 'X-DR-1', version: 'V2', selector: { pagina: 1, zona: [205, 118, 405, 202] } });
  assert.equal(z, 'lda:X-DR-1@V2#pagina=1&zona=205%2C118%2C405%2C202');
  assert.deepEqual(leerAncla(z).selector, { pagina: 1, zona: [205, 118, 405, 202] });
  assert.equal(leerAncla('lda:M3-1@V7#elemento=2Xh9k3$Lr0B').selector.elemento, '2Xh9k3$Lr0B');
});

caso('ancla LDA: sin código no hay ancla; lo que no es LDA se rechaza', () => {
  assert.equal(escribirAncla({}), '');
  assert.equal(escribirAncla({ codigo: 'A-1' }), 'lda:A-1');
  assert.equal(leerAncla('https://alephia.com.pe'), null);
  assert.deepEqual(leerAncla('lda:A-1'), { codigo: 'A-1', version: null, selector: {} });
});

caso('firma de los bytes: un PDF no pasa por planilla (lo que se vio en el banco el 15-oct)', () => {
  const pdf = new TextEncoder().encode('%PDF-1.7\n%âãÏÓ\n4 0 obj');
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
  const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]);
  const csv = new TextEncoder().encode('Item;Descripcion;Metrado\n02.01.03;Concreto;47,10\n');
  assert.deepEqual([pdf, zip, ole, csv].map(firmaDelArchivo), ['pdf', 'zip', 'ole', 'texto']);
  assert.equal(motivoSiNoEsPlanilla(zip, 'Listado.xlsx'), null);
  assert.equal(motivoSiNoEsPlanilla(ole, 'viejo.xls'), null);
  assert.equal(motivoSiNoEsPlanilla(csv, 'datos.csv'), null);
  assert.match(motivoSiNoEsPlanilla(pdf, 'Listado.xlsx'), /parece un PDF/);
  assert.match(motivoSiNoEsPlanilla(csv, 'Listado.xlsx'), /parece texto/);
});

for (const [nombre, fn] of casos) {
  try { await fn(); ok++; console.log(JSON.stringify({ name: nombre, status: 'PASS' })); }
  catch (e) { console.log(JSON.stringify({ name: nombre, status: 'FAIL', error: e.message })); }
}
console.log(JSON.stringify({ suite: 'lectorDeTablas', pass: ok, fail: casos.length - ok }));
if (ok !== casos.length) process.exit(1);
