// Banco de las GRÁFICAS DE VIEW en el tablero de Docs (docs/visor/68): el enlace de vuelta a View, la limpieza al pegar
// y el formato de los números.
import assert from 'node:assert/strict';
import { enlaceAView, limpiarGrafica, formato, fechaDeDatos } from '../src/components/tableros/graficas.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
  catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.message })); }
}
const origen = { frente: '1_CANAL', obra: '1', frenteId: 'CANAL', frenteNombre: 'Canal', tablero: '42', grafica: 'c7' };

test('«Abrir en View»: obra, frente, nombre del frente y tablero', () => {
  const u = new URL(enlaceAView('https://visor.alephia.com.pe', origen));
  assert.equal(u.origin, 'https://visor.alephia.com.pe');
  assert.deepEqual(Object.fromEntries(u.searchParams), { project: '1', frente: 'CANAL', fn: 'Canal', tablero: '42' });
});
test('sin visor contratado, o sin obra o frente: no hay enlace', () => {
  assert.equal(enlaceAView('', origen), null);
  assert.equal(enlaceAView('https://v', { ...origen, obra: '' }), null);
  assert.equal(enlaceAView('https://v', { ...origen, frenteId: '' }), null);
});
test('pegar: pasa una gráfica bien formada, con sus colores', () => {
  const g = limpiarGrafica({ grafica: 'bar', metrica: 'sum', nombre: 'Longitud', origen, grupos: [{ k: 'PVC', v: 12.5, c: '#d97757' }, { k: 'X', v: 'mal' }], total: 12.5, extra: 'fuera' });
  assert.deepEqual(g.grupos, [{ k: 'PVC', v: 12.5, c: '#d97757' }]);
  assert.equal(g.metrica, 'sum');
  assert.equal('extra' in g, false);
  assert.deepEqual(g.origen, origen);
});
test('pegar: lo que no es una gráfica no pasa', () => {
  assert.equal(limpiarGrafica({ grafica: 'qa', origen, grupos: [] }), null);
  assert.equal(limpiarGrafica({ grafica: 'bar', origen: { frente: '1_CANAL' }, grupos: [] }), null);
  assert.equal(limpiarGrafica({ grafica: 'bar', origen, grupos: 'x' }), null);
});
test('pegar: un color raro se cae, el grupo se queda; los grupos tienen tope', () => {
  const g = limpiarGrafica({ grafica: 'donut', origen, grupos: [{ k: 'a', v: 1, c: 'url(x)' }, ...Array.from({ length: 80 }, (_, i) => ({ k: String(i), v: i }))] });
  assert.deepEqual(g.grupos[0], { k: 'a', v: 1 });
  assert.equal(g.grupos.length, 60);
});
test('formato: cantidades sin decimales, sumas y promedios con dos', () => {
  assert.equal(formato(1234, 'count'), (1234).toLocaleString('es-PE'));
  assert.equal(formato(12.345, 'sum'), (12.35).toLocaleString('es-PE', { maximumFractionDigits: 2 }));
  assert.equal(fechaDeDatos('no es fecha'), '');
});

console.log(`${pass}/${pass + fail}`);
if (fail) process.exit(1);
