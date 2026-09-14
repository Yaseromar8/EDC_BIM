// Banco del ALTA DE REVISIONES (E1.1): el selector de flujo y la lista de revisores.
//
// Lo que fija:
//   · elegir plantilla con revisores puestos a mano pide confirmación; con los
//     pasos de otra plantilla, no; volver a «a mano» conserva los pasos;
//   · la pantalla usa esas reglas, ya no vacía los pasos y los recupera si la
//     plantilla no se puede aplicar;
//   · las listas de revisores del alta y de la sustitución salen de los
//     participantes de la obra (`/miembros`), no del padrón entero (`/api/users`).
//
// Y E1.3, flujos creados utilizables: el selector no deja elegir un flujo que no se
// puede usar y dice por qué; en un paso por función con varias personas se elige a
// quién; la vista previa es la del servidor y una respuesta tardía no pisa a la
// última; el plazo es vacío o un entero de 1 en adelante; ningún fallo sale en crudo.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  cambioDeFlujo, confirmacionDePlantilla, AVISO_A_MANO, AYUDA_PARTICIPANTES,
  opcionDePlantilla, pasosSinElegir, eleccionesParaEnviar, plazoValido, textoDeFallo,
  trasVistaPrevia, leerRespuesta, AVISO_PLAZO, AVISO_SIN_PLANTILLAS,
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

// ── E1.3 · flujos creados utilizables ────────────────────────────────────────

await test('un flujo que no se puede usar se ve, con su motivo, pero no se elige', () => {
  const bueno = opcionDePlantilla({ nombre: 'PLANOS', version: 2, pasos: [{}, {}], alcance: 'OBRA', utilizable: true });
  assert.deepEqual(bueno, { etiqueta: 'PLANOS · v2 · 2 pasos', deshabilitada: false, motivo: '' });
  const viejo = opcionDePlantilla({ nombre: 'VIEJO', version: 1, pasos: [{}], alcance: 'ENTIDAD', utilizable: false,
                                    motivo_no_utilizable: 'El último paso de este flujo sólo revisa.' });
  assert.equal(viejo.deshabilitada, true);
  assert.equal(viejo.etiqueta, 'VIEJO · v1 · 1 paso (de la entidad) · no se puede usar aquí');
  assert.equal(viejo.motivo, 'El último paso de este flujo sólo revisa.');
  assert.equal(opcionDePlantilla({ nombre: 'SIN DATO', pasos: [] }).deshabilitada, false,
               'sin el dato del servidor se ofrece: el alta lo comprueba igual');
});

await test('los pasos por función sin persona se cuentan, y solo se mandan las elecciones que se piden', () => {
  const opciones = { 2: [{ id: 7 }, { id: 9 }], 0: [{ id: 1 }, { id: 3 }] };
  assert.deepEqual(pasosSinElegir(opciones, {}), [1, 3]);
  assert.deepEqual(pasosSinElegir(opciones, { 0: '3' }), [3]);
  assert.deepEqual(pasosSinElegir(opciones, { 0: '3', 2: 9 }), []);
  assert.deepEqual(eleccionesParaEnviar(opciones, { 0: '3', 2: '', 5: '8' }), { 0: 3 });
});

await test('el plazo es vacío o un entero de 1 en adelante', () => {
  for (const vale of [undefined, null, '', '  ', '1', 1, '15', 30]) assert.equal(plazoValido(vale), true, String(vale));
  for (const no of ['0', 0, '-1', -2, '2.5', 2.5, 'abc', '1e2']) assert.equal(plazoValido(no), false, String(no));
  assert.match(AVISO_PLAZO, /de 1 en adelante/);
});

await test('la vista previa decide entre pasos, elegir, bloqueo o recuperar', () => {
  const pasos = [{ user_id: 1, name: 'Ana' }];
  assert.deepEqual(trasVistaPrevia({ ok: true, cuerpo: { success: true, pasos, opciones: {} } }),
                   { tipo: 'pasos', pasos, opciones: {} });
  const opciones = { 0: [{ id: 1 }, { id: 3 }] };
  const elegir = trasVistaPrevia({ ok: false, cuerpo: { success: false, code: 'ELIGE_REVISOR', opciones, error: 'x' } });
  assert.equal(elegir.tipo, 'elegir');
  assert.equal(elegir.aviso, 'Elige quién hace el paso 1.');
  const sinAcceso = { success: false, code: 'REVISOR_SIN_ACCESO_DOCUMENTAL', error: 'La persona del paso 1 no puede consultar…' };
  assert.deepEqual(trasVistaPrevia({ ok: false, cuerpo: sinAcceso, elecciones: { 0: 3 }, opcionesActuales: opciones }),
                   { tipo: 'bloqueo', opciones, aviso: sinAcceso.error });
  assert.deepEqual(trasVistaPrevia({ ok: false, cuerpo: { success: false, code: 'SIN_CANDIDATO', error: 'nadie', opciones: {} } }),
                   { tipo: 'recuperar', aviso: 'nadie' });
});

await test('un fallo sin cuerpo se explica sin enseñar el error técnico', async () => {
  assert.equal(textoDeFallo(409, { error: 'Mensaje del servidor' }), 'Mensaje del servidor');
  assert.match(textoDeFallo(502, null, 'crear la revisión'),
               /^No se pudo crear la revisión: el servidor respondió con un error \(502\)/);
  assert.match(textoDeFallo(0, null), /No se pudo conectar/);
  assert.equal(await leerRespuesta({ json: async () => { throw new SyntaxError('Unexpected token <'); } }), null);
  assert.match(AVISO_SIN_PLANTILLAS, /a mano/);
});

await test('el alta usa la vista previa completa, descarta respuestas tardías y deja elegir persona', () => {
  const modal = fuente('components/ReviewsModule.jsx');
  const alta = modal.slice(modal.indexOf('export function ReviewModal'), modal.indexOf('// ── Vista: listado'));
  assert.ok(alta.includes('${API}/api/reviews/previsualizar'), 'no usa la vista previa completa');
  assert.ok(!alta.includes('/resolver?model_urn='), 'sigue usando la vista previa que solo resolvía personas');
  assert.ok(/if \(n !== vistaPrevia\.current\) return null;/.test(alta), 'una respuesta tardía puede pisar a la última');
  assert.ok(alta.includes('elecciones: eleccionesParaEnviar(opciones, elecciones)'), 'el alta no manda a quién se eligió');
  assert.ok(alta.includes('const elegirPersona'), 'no hay dónde elegir persona en un paso por función');
  assert.ok(alta.includes('key={`${i}-${s.id || s.email}`}'), 'la clave de los pasos se puede repetir');
  assert.ok(alta.includes('setErrorPlantillas(AVISO_SIN_PLANTILLAS)'), 'si fallan los flujos, el selector desaparece sin decirlo');
  assert.ok(alta.includes('disabled={o.deshabilitada}'), 'se puede elegir un flujo que no se puede usar');
});

await test('el editor de flujos comprueba el plazo y dice qué flujos no se pueden usar', () => {
  const editor = fuente('components/FlujosDeRevisionModule.jsx');
  assert.ok(editor.includes('!plazoValido(p.dias)'), 'el editor deja guardar un plazo de 0 días');
  assert.ok(editor.includes('p.motivo_no_utilizable'), 'no dice por qué un flujo no se puede usar');
  assert.ok(editor.includes("value={p.dias ?? ''}"), 'un plazo 0 guardado se ve vacío');
});

console.log(JSON.stringify({ banco: 'altaDeRevision', pass, fail }));
if (fail) process.exit(1);
