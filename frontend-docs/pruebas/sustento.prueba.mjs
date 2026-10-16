// Banco de utils/sustento.js — cuadre, aviso de versión, zona y metrado de la fila.
// node frontend-docs/pruebas/sustento.prueba.mjs
import assert from 'node:assert/strict';
import { numeroDe, columnaMetrado, columnasConNombre, cuadre, avisoDeVersion, porItem, zonaDeArrastre, cantidadLegible,
  vincularDeLaDireccion, filaDeLaDireccion, sinCircuito, conCircuito, columnaUnidad, mismaUnidad } from '../src/utils/sustento.js';

let ok = 0;
const casos = [];
const caso = (nombre, fn) => casos.push([nombre, fn]);

caso('números como se escriben en obra', () => {
  assert.equal(numeroDe('47,10'), 47.1);
  assert.equal(numeroDe('47.10'), 47.1);
  assert.equal(numeroDe('1 234,5'), 1234.5);
  assert.equal(numeroDe('1.234,5'), 1234.5);
  assert.equal(numeroDe('1,234.5'), 1234.5);
  // Comas de MILES sin decimales, como el Excel de obra con formato #,##0: «9,490» no es 9,49.
  assert.equal(numeroDe('9,490'), 9490);
  assert.equal(numeroDe(' 9,490.00 '), 9490);
  assert.equal(numeroDe('1,234,567'), 1234567);
  assert.equal(numeroDe('1,31'), 1.31);                 // dos decimales: coma decimal
  assert.equal(numeroDe('12,5'), 12.5);
  assert.equal(numeroDe('9,49,0'), null);               // ni miles ni decimal: no es un número
  assert.equal(numeroDe(3.4), 3.4);
  assert.equal(numeroDe('m3'), null);
  assert.equal(numeroDe(''), null);
  assert.equal(numeroDe(NaN), null);
});

caso('la columna del metrado: «Metrado» gana a «Parcial»; sin candidatas, null', () => {
  const filas = [['PLANILLA'], ['Ítem', 'Descripción', 'Und.', 'Parcial', 'Metrado'], ['02.01.03', 'x', 'm3', '30,1', '47,1']];
  assert.equal(columnaMetrado(filas, 1), 4);
  assert.equal(columnaMetrado(filas), 4);
  assert.equal(columnaMetrado([['a', 'b']]), null);
});

caso('Excel real de obra (PQT8): « MTO DISEÑO » antes que los escenarios «LA MALA / LA BUENA»', () => {
  const cab = ['ITEM ', 'CATEGORIA', 'TIPO', 'DESCRIPCION', 'UNIDAD', ' MTO DISENO ', ' LA MALA\r\n113.24% ', ' LA BUENA\r\n110.04% '];
  const filas = [['ENTREGA DEL DRENAJE PLUVIAL'], ['FECHA:', '', '', '10/7/26'], [], cab, ['01.01', '', 'Provisionales', 'MOVILIZACION', 'glb', ' 1.00 ', ' 1.00 ', ' 1.00 ']];
  assert.equal(columnaMetrado(filas, 3), 5);
  assert.deepEqual(columnasConNombre(filas, 3).slice(4).map(c => c.nombre), ['UNIDAD', 'MTO DISENO', 'LA MALA 113.24%', 'LA BUENA 110.04%']);
  assert.equal(numeroDe(' 1.00 '), 1);
  assert.equal(numeroDe('1,037.980'), 1037.98);
  assert.equal(numeroDe('-'), null);
});

caso('cuadre: cuadra, falta, sobra, sin sustento y sin metrado', () => {
  const v = [{ cantidad: 30.1 }, { cantidad: 15.2 }];
  assert.deepEqual(cuadre(v, 45.3), { suma: 45.3, diferencia: 0, estado: 'cuadra' });
  assert.deepEqual(cuadre(v, 47.1), { suma: 45.3, diferencia: 1.8, estado: 'falta' });
  assert.deepEqual(cuadre(v, 40), { suma: 45.3, diferencia: -5.3, estado: 'sobra' });
  assert.equal(cuadre([], 47.1).estado, 'sin-sustento');
  assert.equal(cuadre(v, null).estado, 'sin-metrado');
  assert.equal(cuadre([{ cantidad: 0.1 }, { cantidad: 0.2 }], 0.3).estado, 'cuadra');   // sin falsos descuadres
  assert.equal(cuadre([{ cantidad: null }], 2).diferencia, 2);
});

caso('aviso de versión: solo si se midió sobre una anterior', () => {
  assert.equal(avisoDeVersion({ version_number: 1, version_vigente: 2 }),
    'Se midió sobre la V1; la vigente es la V2. Hay que revisar la cantidad.');
  assert.equal(avisoDeVersion({ version_number: 2, version_vigente: 2 }), '');
  assert.equal(avisoDeVersion({}), '');
});

caso('agrupar por ítem', () => {
  assert.deepEqual(Object.keys(porItem([{ item: 'a' }, { item: 'b' }, { item: 'a' }])), ['a', 'b']);
  assert.equal(porItem([{ item: 'a' }, { item: 'a' }]).a.length, 2);
});

caso('zona de un arrastre: fracciones ordenadas y recortadas; un clic no es zona', () => {
  const caja = { left: 100, top: 50, width: 800, height: 400 };
  assert.deepEqual(zonaDeArrastre({ x: 500, y: 250 }, { x: 300, y: 130 }, caja), [0.25, 0.2, 0.5, 0.5]);
  assert.deepEqual(zonaDeArrastre({ x: 50, y: 20 }, { x: 300, y: 130 }, caja), [0, 0, 0.25, 0.2]);
  assert.equal(zonaDeArrastre({ x: 300, y: 130 }, { x: 303, y: 200 }, caja), null);
  assert.equal(zonaDeArrastre({ x: 1, y: 1 }, { x: 90, y: 90 }, { width: 0, height: 10 }), null);
});

caso('cantidad legible con el formato peruano del resto del portal (es-PE) y la unidad', () => {
  assert.equal(cantidadLegible(30.1, 'm3'), '30.10 m³');
  assert.equal(cantidadLegible(2410.5, 'kg'), '2,410.50 kg');
  assert.equal(cantidadLegible(null, 'm3'), '—');
});

caso('circuito planilla ↔ plano: la intención viaja en la dirección y se consume una vez', () => {
  const ida = conCircuito('?obra=banco&documento=p1', { vincular: '02.01.03', cantidad: '1.80', planilla: 'x1' });
  assert.equal(ida, '?obra=banco&documento=p1&vincular=02.01.03&cantidad=1.80&planilla=x1');
  assert.deepEqual(vincularDeLaDireccion(ida), { item: '02.01.03', cantidad: '1.80', unidad: '', planilla: 'x1' });
  // La unidad de la fila viaja con la intención (el Excel real dice «km» en 04.01.01).
  const conUnidad = conCircuito('?obra=banco&documento=p1', { vincular: '04.01.01', cantidad: '1.31', unidad: 'km', planilla: 'x1' });
  assert.equal(vincularDeLaDireccion(conUnidad).unidad, 'km');
  assert.equal(sinCircuito(conUnidad), '?obra=banco&documento=p1');
  // Y la columna de la unidad se reconoce como en el Excel real (E · «UNIDAD») o abreviada.
  assert.equal(columnaUnidad([['ITEM', 'CATEGORIA', 'TIPO', 'DESCRIPCION', 'UNIDAD', 'METRADO DISEÑO']], 0), 4);
  assert.equal(columnaUnidad([['Partida', 'Und.', 'Metrado']]), 1);
  assert.equal(columnaUnidad([['a', 'b']]), null);
  // Misma unidad aunque se escriba distinto; distinta si no lo es (no se suma m3 con km).
  assert.ok(mismaUnidad('m3', 'M³') && mismaUnidad('Und', 'und.') && mismaUnidad('', 'km'));
  assert.ok(!mismaUnidad('m3', 'km') && !mismaUnidad('m3-km', 'm3'));
  assert.equal(sinCircuito(ida), '?obra=banco&documento=p1');
  assert.equal(vincularDeLaDireccion('?obra=banco'), null);
  const vuelta = conCircuito('?obra=banco&documento=x1&vincular=viejo', { fila: '02.01.03' });
  assert.equal(vuelta, '?obra=banco&documento=x1&fila=02.01.03');      // la vuelta no arrastra la ida
  assert.equal(filaDeLaDireccion(vuelta), '02.01.03');
  assert.equal(sinCircuito('?vincular=a&fila=b'), '');
});

for (const [nombre, fn] of casos) {
  try { await fn(); ok++; console.log(JSON.stringify({ name: nombre, status: 'PASS' })); }
  catch (e) { console.log(JSON.stringify({ name: nombre, status: 'FAIL', error: e.message })); }
}
console.log(JSON.stringify({ suite: 'sustento', pass: ok, fail: casos.length - ok }));
if (ok !== casos.length) process.exit(1);
