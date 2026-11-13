// Banco de LAS FUNCIONES DEL MOTOR QUE VENÍAN APAGADAS (docs/visor/70, 13-nov-2026):
//   node frontend-react/pruebas/funcionesDelMotor.prueba.mjs
//
//   · por defecto van encendidas la regla nueva y la sección nueva (decisión del dueño del 13-nov-2026);
//   · la salida de emergencia: `?motor=no` las apaga todas y `?motor=regla` deja solo la regla; se recuerda en el
//     navegador y `?motor=todo` vuelve a lo de todos;
//   · si el motor no trae una función (son API privadas de Autodesk), se dice y el arranque sigue;
//   · el visor lo llama ANTES de arrancar el motor, y nuestra selección cede el clic a la sección nueva;
//   · nuestra antigua herramienta de corte ya no está.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLAVE, POR_DEFECTO, DE_LA_REGLA, DE_LA_SECCION, modoPedido, encenderFuncionesDelMotor,
} from '../src/lib/funcionesDelMotor.js';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
  catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}
const aqui = dirname(fileURLToPath(import.meta.url));
const fuente = (ruta) => readFileSync(join(aqui, '..', ruta), 'utf8');

const almacen = (inicial = {}) => {
  const d = { ...inicial };
  return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: k => { delete d[k]; }, d };
};
// Un motor de mentira con la forma del de Autodesk.
const motor = ({ sin = [], terco = [] } = {}) => {
  const estado = {};
  const nombres = {};
  for (const f of [...DE_LA_REGLA, ...DE_LA_SECCION]) if (!sin.includes(f)) nombres[f] = `BANDERA_${f}`;
  return {
    estado,
    FeatureFlags: { set: (n, v) => { if (!terco.includes(n)) estado[n] = v; }, isEnabled: n => Boolean(estado[n]) },
    Private: { InternalFeatureFlags: nombres },
  };
};
const TODAS = [...DE_LA_REGLA, ...DE_LA_SECCION];

await test('por defecto van encendidas la regla nueva y la sección nueva', () => {
  assert.equal(POR_DEFECTO, 'todo');
  for (const busca of ['', '?obra=1&documento=2', undefined]) {
    const m = motor();
    assert.deepEqual(encenderFuncionesDelMotor(m, busca, almacen()), { modo: 'todo', encendidas: TODAS, fallidas: [] });
    assert.equal(m.estado.BANDERA_EnableSmartSection, true);
    assert.equal(m.estado.BANDERA_EnableLaserMeasurement, true);
  }
});

await test('?motor=no deja el motor como venía: no enciende nada', () => {
  const m = motor();
  assert.deepEqual(encenderFuncionesDelMotor(m, '?motor=no', almacen()), { modo: 'no', encendidas: [], fallidas: [] });
  assert.deepEqual(m.estado, {});
});

await test('?motor=regla enciende lo de la regla y NO la sección nueva', () => {
  const m = motor();
  const r = encenderFuncionesDelMotor(m, '?motor=regla', almacen());
  assert.deepEqual(r, { modo: 'regla', encendidas: DE_LA_REGLA, fallidas: [] });
  assert.equal(m.estado.BANDERA_EnableSmartSection, undefined);
});

await test('la salida de emergencia se recuerda en el navegador, y ?motor=todo vuelve a lo de todos', () => {
  const a = almacen();
  assert.equal(modoPedido('?motor=no', a), 'no');
  assert.equal(a.d[CLAVE], 'no');
  assert.equal(modoPedido('', a), 'no', 'en la siguiente visita sigue apagado, aunque la dirección ya no lo lleve');
  assert.equal(modoPedido('?motor=regla', a), 'regla');
  assert.equal(modoPedido('', a), 'regla');
  assert.equal(modoPedido('?motor=todo', a), 'todo');
  assert.equal(CLAVE in a.d, false, 'lo de todos no deja nada recordado');
  assert.equal(modoPedido('', a), 'todo');
});

await test('un valor que no se conoce no apaga nada', () => {
  const a = almacen({ [CLAVE]: 'no' });
  assert.equal(modoPedido('?motor=cualquiercosa', a), 'todo');
  assert.equal(CLAVE in a.d, false);
  assert.equal(modoPedido('', almacen({ [CLAVE]: 'algo-raro' })), 'todo');
});

await test('sin almacenamiento, o con uno que falla, vale para esta carga y no rompe', () => {
  assert.equal(modoPedido('?motor=no', null), 'no');
  assert.equal(modoPedido('', null), 'todo');
  const roto = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() { throw new Error('bloqueado'); } };
  assert.equal(modoPedido('?motor=regla', roto), 'regla');
  assert.equal(modoPedido('', roto), 'todo');
});

await test('si el motor no trae una función, se dice cuál y las demás se encienden', () => {
  const m = motor({ sin: ['EnableSlopeMeasurement'] });
  const r = encenderFuncionesDelMotor(m, '', almacen());
  assert.deepEqual(r.encendidas, ['EnableLaserMeasurement', 'EnableDeleteAllMeasurements', 'EnableSmartSection']);
  assert.deepEqual(r.fallidas, ['EnableSlopeMeasurement: el motor no la tiene']);
});

await test('si el motor no la deja encender (ya arrancó), se dice', () => {
  const m = motor({ terco: ['BANDERA_EnableSmartSection'] });
  const r = encenderFuncionesDelMotor(m, '', almacen());
  assert.deepEqual(r.fallidas, ['EnableSmartSection: el motor no la encendió']);
});

await test('sin motor, o con un motor de otra forma, no se rompe el arranque', () => {
  for (const m of [undefined, null, {}, { FeatureFlags: {} }, { FeatureFlags: { set() {} } }]) {
    const r = encenderFuncionesDelMotor(m, '', almacen());
    assert.equal(r.encendidas.length, 0);
    assert.equal(r.fallidas.length, 4);
  }
});

await test('el visor lo llama antes de arrancar el motor, que arranca en un solo sitio', () => {
  const visor = fuente('src/components/Viewer.jsx');
  const enciende = visor.indexOf('encenderFuncionesDelMotor(window.Autodesk?.Viewing');
  const arranca = visor.indexOf('Autodesk.Viewing.Initializer(options');
  assert.ok(enciende > 0 && arranca > enciende);
  assert.equal(visor.split('Autodesk.Viewing.Initializer(').length - 1, 1);
});

await test('nuestra selección por clic cede a la sección nueva, como cedía a la de siempre', () => {
  // Sin esto el clic sobre el plano seleccionaba el elemento de debajo, y el motor suelta el plano activo en cuanto
  // cambia la selección: las flechas para mover el corte no salían (visto por el dueño el 13-nov-2026).
  const visor = fuente('src/components/Viewer.jsx');
  assert.match(visor, /for \(const n of \['Autodesk\.Measure', 'Autodesk\.Section', 'Autodesk\.SmartSection'\]\)/);
});

await test('nuestra antigua herramienta de corte ya no está, ni nadie la monta', () => {
  assert.equal(existsSync(join(aqui, '..', 'src', 'components', 'SectionCutTool.jsx')), false);
  assert.ok(!/SectionCutTool/.test(fuente('src/App.jsx')));
});

console.log(JSON.stringify({ total: pass + fail, pass, fail }));
if (fail) process.exit(1);
