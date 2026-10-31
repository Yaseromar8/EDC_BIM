// Banco de los COMENTARIOS DEL TABLERO (docs/visor/64): el alfiler, quién puede borrar qué, y la fusión de mensajes
// cuando dos personas responden a la vez (design/lienzo/fusion.js).
import assert from 'node:assert/strict';
import { nuevoComentario, nuevoMensaje, puedeBorrarHilo, puedeBorrarMensaje, sinComentarios, iniciales, cuando, PIN, MAX_TEXTO } from '../src/components/tableros/comentarios.js';
import { fusionar, mismoContenido } from '../../design/lienzo/fusion.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
  catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.message })); }
}
const ana = { id: 1, nombre: 'Ana Pérez' }, luis = { id: 2, nombre: 'Luis' };
const msg = (id, autor, texto, fecha) => ({ id, autorId: autor.id, autor: autor.nombre, texto, fecha });

test('el alfiler se clava con la punta en el clic', () => {
  const c = nuevoComentario({ x: 100.4, y: 200 }, ana);
  assert.deepEqual([c.tipo, c.x, c.y, c.w, c.h, c.autorId, c.mensajes.length, c.resuelto], ['comentario', 100, 200 - PIN, PIN, PIN, 1, 0, false]);
});
test('un mensaje: recortado, sin espacios de sobra, con id y fecha', () => {
  const m = nuevoMensaje(ana, `  ${'x'.repeat(MAX_TEXTO + 10)}  `);
  assert.equal(m.texto.length, MAX_TEXTO);
  assert.ok(m.id && Date.parse(m.fecha));
});
test('borrar el hilo: quien lo abrió o un administrador', () => {
  const c = nuevoComentario({ x: 0, y: 0 }, ana);
  assert.equal(puedeBorrarHilo(c, ana, false), true);
  assert.equal(puedeBorrarHilo(c, luis, false), false);
  assert.equal(puedeBorrarHilo(c, luis, true), true);
});
test('borrar un mensaje: solo el propio, y nunca el primero (ese es el hilo)', () => {
  const c = { mensajes: [msg('a', ana, 'uno'), msg('b', luis, 'dos'), msg('c', ana, 'tres')] };
  assert.equal(puedeBorrarMensaje(c, c.mensajes[0], ana), false);
  assert.equal(puedeBorrarMensaje(c, c.mensajes[1], luis), true);
  assert.equal(puedeBorrarMensaje(c, c.mensajes[1], ana), false);
  assert.equal(puedeBorrarMensaje(c, c.mensajes[2], ana), true);
});
test('sin comentarios: para la miniatura y las vistas', () => {
  const r = sinComentarios({ notas: [{ id: 'n', tipo: 'nota' }, { id: 'c', tipo: 'comentario' }], secciones: [] });
  assert.deepEqual(r.notas.map(n => n.id), ['n']);
});
test('iniciales y fechas', () => {
  assert.equal(iniciales('Ana Pérez'), 'AP');
  assert.equal(iniciales('luis@obra.pe'), 'L');
  assert.equal(iniciales(''), '?');
  const ahora = Date.parse('2026-10-31T18:00:00Z');
  assert.equal(cuando('2026-10-31T17:59:40Z', ahora), 'ahora');
  assert.equal(cuando('2026-10-31T17:45:00Z', ahora), 'hace 15 min');
});

const hilo = (mensajes, extra = {}) => ({ notas: [{ id: 'c1', tipo: 'comentario', x: 0, y: 0, w: 32, h: 32, mensajes, ...extra }], secciones: [] });
const textos = (c) => c.notas[0].mensajes.map(m => m.texto);
const m1 = msg('m1', ana, 'Revisar cota', '2026-10-31T18:00:00Z');
const m2 = msg('m2', luis, 'Corregida', '2026-10-31T18:01:00Z');
const m3 = msg('m3', ana, 'Gracias', '2026-10-31T18:01:05Z');

test('fusión: dos respuestas a la vez se quedan las dos, en orden de fecha', () => {
  const r = fusionar(hilo([m1]), hilo([m1, m3]), hilo([m1, m2]));
  assert.deepEqual(textos(r), ['Revisar cota', 'Corregida', 'Gracias']);
});
test('fusión: yo respondo y el otro resuelve → mi respuesta y resuelto', () => {
  const r = fusionar(hilo([m1]), hilo([m1, m3]), hilo([m1], { resuelto: true }));
  assert.deepEqual(textos(r), ['Revisar cota', 'Gracias']);
  assert.equal(r.notas[0].resuelto, true);
});
test('fusión: yo reabro y el otro responde → reabierto y con su respuesta', () => {
  const r = fusionar(hilo([m1], { resuelto: true }), hilo([m1], { resuelto: false }), hilo([m1, m2], { resuelto: true }));
  assert.deepEqual(textos(r), ['Revisar cota', 'Corregida']);
  assert.equal(r.notas[0].resuelto, false);
});
test('fusión: un campo que quito yo (resueltoPor al reabrir) no vuelve', () => {
  const base = hilo([m1], { resuelto: true, resueltoPor: 'Luis' });
  const r = fusionar(base, hilo([m1, m3], { resuelto: false }), hilo([m1, m2], { resuelto: true, resueltoPor: 'Luis' }));
  assert.equal(r.notas[0].resuelto, false);
  assert.equal('resueltoPor' in r.notas[0], false);
});
test('fusión: el otro borra su respuesta mientras yo respondo → la suya fuera, la mía dentro', () => {
  const r = fusionar(hilo([m1, m2]), hilo([m1, m2, m3]), hilo([m1]));
  assert.deepEqual(textos(r), ['Revisar cota', 'Gracias']);
});
test('fusión: solo cambió el otro → lo suyo, sin tocar', () => {
  const suyo = hilo([m1, m2]);
  assert.equal(fusionar(hilo([m1]), hilo([m1]), suyo).notas[0], suyo.notas[0]);
});
test('mismoContenido ve un mensaje nuevo', () => {
  assert.equal(mismoContenido(hilo([m1]), hilo([m1, m2])), false);
});

console.log(`${pass}/${pass + fail}`);
if (fail) process.exit(1);
