// Banco de utils/decisionEnLector.js — decidir una revisión desde el lector.
// node frontend-docs/pruebas/decisionEnLector.prueba.mjs
import assert from 'node:assert/strict';
import {
  revisionesPendientes, contieneDocumento, puedeDecidir, revisionParaDecidir,
  resumenDeRevision, hayQueElegirCodigo, opcionesDeDecision, faltaParaConfirmar,
  cuerpoDeLaDecision, MAXIMO_DE_REVISIONES,
} from '../src/utils/decisionEnLector.js';
import { CONSECUENCIA_DE_RECHAZAR } from '../src/utils/revisiones.js';

let ok = 0;
const casos = [];
const caso = (nombre, fn) => casos.push([nombre, fn]);

const CATALOGO = [
  { codigo: 'A1', etiqueta: 'Apto para construir', familia: 'publicado' },
  { codigo: 'B1', etiqueta: 'Apto con observaciones', familia: 'publicado' },
  { codigo: 'S2', etiqueta: 'Apto para información', familia: 'compartido' },
];

const rev = (cambios = {}) => ({
  id: 41, codigo: 'RV-041', title: 'Planos de drenaje', status: 'pending',
  items: [{ node_id: 'n1' }, { node_id: 'n2' }],
  steps: [{ name: 'Eva' }, { name: 'Ana' }], current_step: 1,
  codigo_idoneidad: null, paso_vence_en: '2026-10-16T12:00:00',
  acciones: {
    aprobar: { disponible: true, tipo: 'aprobar_y_cerrar', destino: 'PUBLISHED' },
    rechazar: { disponible: true },
  },
  ...cambios,
});

caso('solo las revisiones de Mi trabajo, sin repetir y con tope', () => {
  const mt = { pendientes: [
    { objeto_tipo: 'REVIEW', objeto_id: '41' },
    { objeto_tipo: 'RFI', objeto_id: 'r7' },
    { objeto_tipo: 'review', objeto_id: '42' },
    { objeto_tipo: 'REVIEW', objeto_id: '41' },
    { objeto_tipo: 'REVIEW', objeto_id: 'x;drop' },
  ] };
  assert.deepEqual(revisionesPendientes(mt), ['41', '42']);
  assert.deepEqual(revisionesPendientes(null), []);
  const muchas = { pendientes: Array.from({ length: 20 }, (_, i) => ({ objeto_tipo: 'REVIEW', objeto_id: String(i + 1) })) };
  assert.equal(revisionesPendientes(muchas).length, MAXIMO_DE_REVISIONES);
});

caso('el documento abierto se busca por node_id o id', () => {
  assert.equal(contieneDocumento(rev(), 'n2'), true);
  assert.equal(contieneDocumento(rev({ items: [{ id: 'n9' }] }), 'n9'), true);
  assert.equal(contieneDocumento(rev(), 'otro'), false);
  assert.equal(contieneDocumento(rev(), ''), false);
});

caso('solo se decide lo que el servidor permite', () => {
  assert.equal(puedeDecidir(rev()), true);
  assert.equal(puedeDecidir(rev({ status: 'approved' })), false);
  assert.equal(puedeDecidir(rev({ acciones: { aprobar: { disponible: false }, rechazar: { disponible: false } } })), false);
  const lista = [rev({ id: 40, items: [{ node_id: 'n1' }], acciones: {} }), rev()];
  assert.equal(revisionParaDecidir(lista, 'n1').id, 41, 'salta la que no le toca');
  assert.equal(revisionParaDecidir(lista, 'nada'), null);
});

caso('la cabecera dice el alcance real: la revisión entera', () => {
  const r = resumenDeRevision(rev());
  assert.equal(r.codigo, 'RV-041');
  assert.equal(r.paso, 'paso 2 de 2');
  assert.match(r.alcance, /los 2 documentos de esta revisión/);
  assert.match(resumenDeRevision(rev({ items: [{ node_id: 'n1' }] })).alcance, /único documento/);
});

caso('sin código en la revisión: una tarjeta por código del catálogo de su familia + No apto', () => {
  const ops = opcionesDeDecision(rev(), CATALOGO);
  assert.deepEqual(ops.map(o => o.clave), ['aprobar:A1', 'aprobar:B1', 'rechazar']);
  assert.equal(ops[0].titulo, 'Apto para construir');
  assert.match(ops[0].consecuencia, /pasan a Publicado/);
  assert.match(ops[0].consecuencia, /Quedan como A1/);
  assert.equal(ops[0].breve, 'Pasan a Publicado como A1.');
  assert.ok(ops.every(o => o.breve && o.breve.length < 60), 'cada tarjeta lleva una línea breve');
  assert.equal(hayQueElegirCodigo(rev()), true);
});

caso('con código en la revisión: ese y solo ese, y no se reenvía', () => {
  const ops = opcionesDeDecision(rev({ codigo_idoneidad: 'B1' }), CATALOGO);
  assert.deepEqual(ops.map(o => o.clave), ['aprobar:B1', 'rechazar']);
  assert.equal(ops[0].titulo, 'Apto con observaciones');
  assert.deepEqual(cuerpoDeLaDecision(ops[0], ' ok '), { action: 'approve', comment: 'ok' });
});

caso('paso intermedio: conformidad, sin código', () => {
  const r = rev({ acciones: {
    aprobar: { disponible: true, tipo: 'conformidad', siguiente_paso: { numero: 3, persona: 'Luis' } },
    rechazar: { disponible: true } } });
  const ops = opcionesDeDecision(r, CATALOGO);
  assert.deepEqual(ops.map(o => o.titulo), ['Conforme', 'No apto · rechazar la revisión']);
  assert.match(ops[0].consecuencia, /paso 3 \(Luis\)/);
  assert.equal(hayQueElegirCodigo(r), false);
});

caso('No apto dice lo que de verdad pasa (no «vuelve al autor»)', () => {
  const no = opcionesDeDecision(rev(), CATALOGO).find(o => o.accion === 'reject');
  assert.equal(no.consecuencia, CONSECUENCIA_DE_RECHAZAR);
  assert.doesNotMatch(no.consecuencia, /autor/);
  assert.deepEqual(cuerpoDeLaDecision(no, 'falta la cota'), { action: 'reject', comment: 'falta la cota' });
});

caso('el código elegido viaja solo cuando hay que elegirlo', () => {
  const a1 = opcionesDeDecision(rev(), CATALOGO)[0];
  assert.deepEqual(cuerpoDeLaDecision(a1, ''), { action: 'approve', comment: '', codigo_idoneidad: 'A1' });
});

caso('sin catálogo no se puede aprobar un cierre que exige código', () => {
  assert.deepEqual(opcionesDeDecision(rev(), []).map(o => o.clave), ['rechazar']);
  assert.match(faltaParaConfirmar(rev(), { accion: 'approve' }, []), /catálogo/);
  assert.equal(faltaParaConfirmar(rev(), null, CATALOGO), 'Elige una decisión.');
  assert.equal(faltaParaConfirmar(rev(), { accion: 'reject' }, []), '');
});

caso('solo rechazar si aprobar no está disponible', () => {
  const r = rev({ acciones: { aprobar: { disponible: false }, rechazar: { disponible: true } } });
  assert.deepEqual(opcionesDeDecision(r, CATALOGO).map(o => o.clave), ['rechazar']);
});

for (const [nombre, fn] of casos) {
  try { fn(); ok++; console.log(JSON.stringify({ name: nombre, status: 'PASS' })); }
  catch (e) { console.log(JSON.stringify({ name: nombre, status: 'FAIL', error: e.message })); }
}
console.log(JSON.stringify({ suite: 'decisionEnLector', pass: ok, fail: casos.length - ok }));
if (ok !== casos.length) process.exit(1);
