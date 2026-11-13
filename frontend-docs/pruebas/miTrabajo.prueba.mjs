// Banco de EL RESUMEN AL ENTRAR Y LA RESPUESTA A UNA NUBE (13-nov-2026).
//
// docs/archivos/31_RESUMEN_AL_ENTRAR_Y_NUBES_RESUELTAS.md.
//
// Qué fija:
//   · los tres números de «Mi trabajo» (pendiente · vencido · entregado) y que no se solapan;
//   · que lo vencido va primero, lo más atrasado arriba, y el resto como lo manda el servidor;
//   · que una nube respondida sin adjuntos se llama «resuelta» y con adjuntos «entregada», en el botón, en el aviso y
//     en su rótulo, y que por dentro sigue siendo el mismo acto;
//   · que la portada pinta el resumen SIEMPRE, también con todo a cero, y no decide nada por su cuenta.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  diasPara, estaVencido, resumenDeMiTrabajo, pendientesEnOrden, haceCuanto, fraseSinPendientes,
} from '../src/utils/miTrabajo.js';
import {
  soloConNota, botonDeRespuesta, avisoDeRespuesta, rotuloDeRespondida,
} from '../../design/incidencias/respuestaDeNube.js';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
  catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}
const aqui = dirname(fileURLToPath(import.meta.url));
const fuente = (ruta) => readFileSync(join(aqui, '..', ruta), 'utf8');

const AHORA = new Date('2026-11-13T12:00:00-05:00').getTime();
const p = (id, vence) => ({ id, vence_en: vence, asunto: `tarea ${id}` });

await test('los días que faltan, y cuándo algo está vencido', () => {
  assert.equal(diasPara('2026-11-15T12:00:00-05:00', AHORA), 2);
  assert.equal(diasPara('2026-11-13T18:00:00-05:00', AHORA), 1, 'vence hoy mismo: todavía no está vencido');
  assert.equal(diasPara('2026-11-10T12:00:00-05:00', AHORA), -3);
  assert.equal(diasPara(null, AHORA), null);
  assert.equal(diasPara('no es una fecha', AHORA), null);
  assert.equal(estaVencido(p(1, '2026-11-10T12:00:00-05:00'), AHORA), true);
  assert.equal(estaVencido(p(2, '2026-11-13T18:00:00-05:00'), AHORA), false);
  assert.equal(estaVencido(p(3, null), AHORA), false, 'sin fecha no vence');
});

await test('los tres números: lo vencido se cuenta aparte de lo pendiente', () => {
  const pendientes = [p(1, '2026-11-10T12:00:00-05:00'), p(2, '2026-11-20T12:00:00-05:00'), p(3, null), p(4, '2026-11-01T12:00:00-05:00')];
  assert.deepEqual(resumenDeMiTrabajo(pendientes, [{ id: 'nube-1' }, { id: 'incidencia-2' }], AHORA),
    { pendiente: 2, vencido: 2, entregado: 2 });
  assert.deepEqual(resumenDeMiTrabajo([], [], AHORA), { pendiente: 0, vencido: 0, entregado: 0 });
  assert.deepEqual(resumenDeMiTrabajo(null, undefined, AHORA), { pendiente: 0, vencido: 0, entregado: 0 });
});

await test('lo vencido va primero, lo más atrasado arriba; el resto, en el orden del servidor', () => {
  const pendientes = [p('a', '2026-11-20T12:00:00-05:00'), p('b', '2026-11-10T12:00:00-05:00'), p('c', null), p('d', '2026-11-01T12:00:00-05:00')];
  assert.deepEqual(pendientesEnOrden(pendientes, AHORA).map(x => x.id), ['d', 'b', 'a', 'c']);
  assert.deepEqual(pendientesEnOrden(null, AHORA), []);
});

await test('desde cuándo espera lo entregado', () => {
  assert.equal(haceCuanto('2026-11-13T09:00:00-05:00', AHORA), 'hoy');
  assert.equal(haceCuanto('2026-11-12T11:00:00-05:00', AHORA), 'ayer');
  assert.equal(haceCuanto('2026-11-08T11:00:00-05:00', AHORA), 'hace 5 d');
  assert.equal(haceCuanto(null, AHORA), '');
  assert.equal(haceCuanto('2026-11-14T11:00:00-05:00', AHORA), 'hoy', 'una fecha un poco adelantada no dice «hace -1 d»');
});

await test('sin pendientes se distingue «nada que hacer» de «todo entregado, esperando»', () => {
  assert.equal(fraseSinPendientes({ pendiente: 0, vencido: 0, entregado: 0 }), 'No tienes nada pendiente.');
  assert.equal(fraseSinPendientes({ pendiente: 0, vencido: 0, entregado: 3 }), 'No tienes nada pendiente. Lo que entregaste espera respuesta.');
});

const nota = { tipo: 'nota', texto: 'Movido el cuadro de áreas' };
const doc = { tipo: 'documento', documento: 'x' };

await test('sin adjuntos se da por resuelto; con adjuntos se entrega', () => {
  assert.equal(soloConNota([nota]), true);
  assert.equal(soloConNota([nota, doc]), false);
  assert.equal(soloConNota([doc]), false);
  assert.equal(soloConNota([]), false, 'sin nada escrito aún no es «resuelto»: el botón sigue apagado');
  assert.equal(botonDeRespuesta([nota]), 'Dar por resuelto');
  assert.equal(botonDeRespuesta([nota, doc]), 'Entregar');
  assert.equal(botonDeRespuesta([]), 'Entregar');
  assert.equal(avisoDeRespuesta([nota]), 'Resuelto: le llega al encargado del plano');
  assert.equal(avisoDeRespuesta([doc]), 'Entregado: le llega al encargado del plano');
});

await test('una nube respondida solo con una nota se lee «Resuelta»; lo demás, como diga el servidor', () => {
  assert.equal(rotuloDeRespondida({ estado: 'entregada', rondas: [{ n: 1, entregas: [nota] }] }), 'Resuelta');
  assert.equal(rotuloDeRespondida({ estado: 'entregada', rondas: [{ n: 1, entregas: [nota, doc] }] }), null);
  // Manda la última ronda.
  assert.equal(rotuloDeRespondida({ estado: 'entregada', rondas: [{ n: 1, entregas: [doc] }, { n: 2, entregas: [nota] }] }), 'Resuelta');
  for (const n of [{ estado: 'pedida', rondas: [{ entregas: [nota] }] }, { estado: 'aceptada', rondas: [{ entregas: [nota] }] },
    { estado: 'entregada', rondas: [] }, { estado: 'entregada' }, null]) {
    assert.equal(rotuloDeRespondida(n), null, JSON.stringify(n));
  }
});

await test('por dentro es el mismo acto: la pantalla solo cambia la palabra', () => {
  const nubes = readFileSync(join(aqui, '..', '..', 'design', 'incidencias', 'NubesDeIncidencia.jsx'), 'utf8');
  assert.match(nubes, /dar\(\{ acto: 'entregar', entregas \}, avisoDeRespuesta\(entregas\)\)/);
  assert.match(nubes, /\{botonDeRespuesta\(entregas\)\}<\/button>/);
  assert.match(nubes, /disabled=\{!entregas\.length \|\| subiendo \|\| ocupado\}/, 'sin escribir ni adjuntar no se puede confirmar');
  assert.ok(!/acto: 'resolver'/.test(nubes), 'no hay un acto nuevo en el servidor');
});

await test('la portada pinta el resumen siempre y abre lo entregado en su plano', () => {
  const portada = fuente('src/components/MiTrabajo.jsx');
  assert.match(portada, /const resumen = resumenDeMiTrabajo\(pendientes, entregados\);/);
  for (const rotulo of ['Pendiente', 'Vencido', 'Entregado']) assert.match(portada, new RegExp(`<dt[^>]*>${rotulo}</dt>`));
  // El resumen no está dentro de ninguna condición sobre la lista.
  const resumen = portada.indexOf('aria-label="Resumen de mi trabajo"');
  const vacio = portada.indexOf('pendientes.length === 0 ?');
  assert.ok(resumen > 0 && vacio > resumen);
  assert.match(portada, /setEntregados\(d\.entregados \|\| \[\]\)/, 'un servidor anterior, sin `entregados`, no rompe la portada');
  assert.match(portada, /Entregado, esperando respuesta/);
  assert.match(portada, /nube: e\.objeto_tipo === 'NUBE' \? \(e\.marca \|\| null\) : null/);
  // El color, solo en el dato vencido y solo cuando lo hay.
  assert.match(portada, /resumen\.vencido \? S\.numeroVencido : null/);
});

console.log(JSON.stringify({ total: pass + fail, pass, fail }));
if (fail) process.exit(1);
