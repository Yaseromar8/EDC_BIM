// Banco del ALTA DE REVISIONES (E1.1): el selector de flujo y la lista de revisores.
//
// Lo que fija:
//   · elegir plantilla con revisores puestos a mano pide confirmación; con los
//     pasos de otra plantilla, no; volver a «a mano» conserva los pasos;
//   · la pantalla usa esas reglas, ya no vacía los pasos y los recupera si la
//     plantilla no se puede aplicar;
//   · las listas de revisores del alta y de la sustitución salen de los
//     participantes de la obra (`/miembros`), no del padrón entero (`/api/users`).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  cambioDeFlujo, confirmacionDePlantilla, AVISO_A_MANO, AYUDA_PARTICIPANTES,
} from '../src/utils/altaDeRevision.js';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
  catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}

const aqui = dirname(fileURLToPath(import.meta.url));
const fuente = (ruta) => readFileSync(join(aqui, '..', 'src', ruta), 'utf8');

await test('elegir el mismo flujo no hace nada', () => {
  assert.deepEqual(cambioDeFlujo({ plantillaActual: '', nueva: '', pasos: [{ id: 1 }] }), { tipo: 'nada' });
  assert.deepEqual(cambioDeFlujo({ plantillaActual: '7', nueva: 7, pasos: [] }), { tipo: 'nada' });
});

await test('con revisores puestos a mano, aplicar una plantilla pide confirmacion', () => {
  assert.deepEqual(cambioDeFlujo({ plantillaActual: '', nueva: '7', pasos: [{ id: 1 }, { id: 2 }] }),
                   { tipo: 'aplicar', confirmar: true });
});

await test('sin pasos, o con los de otra plantilla sin tocar, se aplica sin preguntar', () => {
  assert.deepEqual(cambioDeFlujo({ plantillaActual: '', nueva: '7', pasos: [] }),
                   { tipo: 'aplicar', confirmar: false });
  assert.deepEqual(cambioDeFlujo({ plantillaActual: '3', nueva: '7', pasos: [{ id: 1 }] }),
                   { tipo: 'aplicar', confirmar: false });
});

await test('volver a «a mano» conserva los pasos y avisa si venian de una plantilla', () => {
  assert.deepEqual(cambioDeFlujo({ plantillaActual: '7', nueva: '', pasos: [{ id: 1 }] }),
                   { tipo: 'a_mano', aviso: AVISO_A_MANO });
});

await test('la confirmacion dice cuantos revisores se sustituyen y con que plantilla', () => {
  const uno = confirmacionDePlantilla(1, 'PLANOS_ASBUILT');
  assert.equal(uno.confirmText, 'Sustituir');
  assert.match(uno.message, /«PLANOS_ASBUILT» sustituye al revisor que has puesto/);
  assert.match(confirmacionDePlantilla(3).message, /La plantilla sustituye a los 3 revisores/);
});

await test('la pantalla del alta usa esas reglas y ya no vacia los pasos', () => {
  const modal = fuente('components/ReviewsModule.jsx');
  const elegir = modal.slice(modal.indexOf('const elegirPlantilla'), modal.indexOf('const soltarPlantilla'));
  assert.ok(elegir.includes('cambioDeFlujo('), 'no decide con cambioDeFlujo');
  assert.ok(elegir.includes('confirmAction(confirmacionDePlantilla('), 'no confirma antes de sustituir');
  assert.ok(!elegir.includes('setSteps([])'), 'sigue vaciando los pasos');
  assert.ok(elegir.includes('recuperar('), 'si la plantilla falla no recupera los pasos');
});

await test('las listas de revisores salen de los participantes de la obra', () => {
  const modal = fuente('components/ReviewsModule.jsx');
  const alta = modal.slice(modal.indexOf('export function ReviewModal'), modal.indexOf('// ── Vista: listado'));
  assert.ok(alta.length > 0, 'no se encontro el alta en ReviewsModule.jsx');
  // Se busca la LLAMADA, no la palabra: los comentarios explican por qué ya no se
  // usa `/api/users`, y buscar el texto suelto daba por culpable a la explicación.
  assert.ok(alta.includes('apiFetch(`${API}/api/projects/${encodeURIComponent(projectPrefix)}/miembros`)'),
            'el alta no pide los participantes de la obra');
  assert.ok(!alta.includes('${API}/api/users`'), 'el alta sigue ofreciendo el padron entero');
  assert.ok(alta.includes('AYUDA_PARTICIPANTES'), 'no dice como añadir a quien falta');
  const detalle = fuente('components/RevisionDetalle.jsx');
  const sustituir = detalle.slice(detalle.indexOf('function SustituirRevisor'), detalle.indexOf('export default function'));
  assert.ok(sustituir.length > 0, 'no se encontro SustituirRevisor');
  assert.ok(sustituir.includes('apiFetch(`${API}/api/projects/${encodeURIComponent(obraDeLaRevision)}/miembros`)'),
            'la sustitucion no pide los participantes de la obra');
  assert.ok(!sustituir.includes('${API}/api/users`'), 'la sustitucion sigue ofreciendo el padron entero');
});

await test('la ayuda dice donde se añade a quien falta', () => {
  assert.match(AYUDA_PARTICIPANTES, /Administración → Participantes/);
});

console.log(JSON.stringify({ banco: 'altaDeRevision', pass, fail }));
if (fail) process.exit(1);
