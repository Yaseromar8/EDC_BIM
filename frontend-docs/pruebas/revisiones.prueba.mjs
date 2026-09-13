// Banco de la pantalla de REVISIONES (E1): enlace, nombres y mensajes.
//
// Lo que fija:
//   · el enlace `/?obra=<id>&revision=<id>` se lee y se escribe sin perder el
//     resto de la URL, y un identificador que no es un número no abre nada;
//   · los botones se llaman como lo que hacen: «Dar conformidad» no es «Aprobar»,
//     y el último paso dice que cierra;
//   · el historial cuenta cada evento que escribe el motor, con el motivo de una
//     sustitución;
//   · los errores dicen algo útil y piden recargar cuando lo mostrado puede estar
//     viejo;
//   · los filtros de la pantalla son exactamente los del servidor.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  FILTROS, leerEnlace, enlaceDeRevision, conRevision, codigoDe, chipDeEstado,
  papelDelPaso, botonAprobar, consecuenciaDeAprobar, exitoDe, describirEvento,
  mensajeDeError, CONSECUENCIA_DE_RECHAZAR,
} from '../src/utils/revisiones.js';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
  catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}

const aqui = dirname(fileURLToPath(import.meta.url));

await test('el enlace se lee con obra y revision', () => {
  assert.deepEqual(leerEnlace('?obra=p-12&revision=7'), { obra: 'p-12', revision: 7 });
  assert.deepEqual(leerEnlace('?revision=7'), { obra: null, revision: 7 });
});

await test('un identificador que no es un numero entero positivo no abre nada', () => {
  for (const s of ['', '?obra=p', '?revision=', '?revision=abc', '?revision=0', '?revision=-3',
                   '?revision=7.5', '?revision=1e3']) {
    assert.equal(leerEnlace(s), null, s);
  }
});

await test('el enlace se escribe y se relee igual', () => {
  const url = enlaceDeRevision('obra con espacios', 42, 'https://alephia.com.pe');
  assert.equal(url, 'https://alephia.com.pe/?obra=obra+con+espacios&revision=42');
  assert.deepEqual(leerEnlace(url.split('/?')[1]), { obra: 'obra con espacios', revision: 42 });
});

await test('abrir y cerrar el detalle conserva el resto de la URL', () => {
  assert.equal(conRevision('?hub=1', 'p-1', 5), '?hub=1&obra=p-1&revision=5');
  assert.equal(conRevision('?hub=1&obra=p-1&revision=5', null, null), '?hub=1');
  assert.equal(conRevision('?obra=p-1&revision=5', null, null), '');
});

await test('codigo RV con tres digitos minimo', () => {
  assert.equal(codigoDe(7), 'RV-007');
  assert.equal(codigoDe(1234), 'RV-1234');
});

await test('estado: una pendiente bloqueada se ve como Bloqueada', () => {
  assert.equal(chipDeEstado({ status: 'pending', flujo: 'BLOQUEADA' }).etiqueta, 'Bloqueada');
  assert.equal(chipDeEstado({ status: 'pending', flujo: 'ACTIVA' }).etiqueta, 'En revisión');
  assert.equal(chipDeEstado({ status: 'approved' }).etiqueta, 'Aprobada');
  assert.equal(chipDeEstado({ status: 'rejected' }).etiqueta, 'Rechazada');
});

await test('el papel sale de la decision declarada y no se inventa en PRE', () => {
  assert.equal(papelDelPaso({ decision: 'REVISA', terminal: false }), 'Revisa');
  assert.equal(papelDelPaso({ decision: 'APRUEBA', terminal: false }), 'Aprueba');
  assert.equal(papelDelPaso({ decision: 'APRUEBA', terminal: true }), 'Aprueba y cierra');
  assert.equal(papelDelPaso({ decision: null, terminal: true }), 'Último paso');
  assert.equal(papelDelPaso({ decision: null, terminal: false }), 'Paso intermedio');
});

await test('Dar conformidad no es Aprobar, y el ultimo paso dice que cierra', () => {
  assert.equal(botonAprobar('conformidad'), 'Dar conformidad');
  assert.equal(botonAprobar('aprobar'), 'Aprobar');
  assert.equal(botonAprobar('aprobar_y_cerrar'), 'Aprobar y cerrar');
  assert.notEqual(botonAprobar('conformidad'), botonAprobar('aprobar'));
});

await test('la consecuencia dice a quien pasa o a que estado van los documentos', () => {
  const conf = consecuenciaDeAprobar({ tipo: 'conformidad', siguiente_paso: { numero: 2, persona: 'Ana' } });
  assert.match(conf, /conformidad/);
  assert.match(conf, /paso 2 \(Ana\)/);
  assert.match(conf, /no cambian de estado/);
  const cierre = consecuenciaDeAprobar({ tipo: 'aprobar_y_cerrar', destino: 'PUBLISHED' });
  assert.match(cierre, /se cierra como aprobada/);
  assert.match(cierre, /Publicado/);
  assert.match(CONSECUENCIA_DE_RECHAZAR, /rechazada/);
});

await test('el aviso de exito nombra lo que paso', () => {
  assert.equal(exitoDe('approve', 'conformidad'), 'Conformidad registrada');
  assert.equal(exitoDe('approve', 'aprobar'), 'Paso aprobado');
  assert.equal(exitoDe('approve', 'aprobar_y_cerrar'), 'Revisión aprobada y cerrada');
  assert.equal(exitoDe('reject', 'conformidad'), 'Revisión rechazada');
});

await test('el historial cuenta cada evento que escribe el motor', () => {
  assert.match(describirEvento({ event: 'created', by: 'autor@obra.pe' }).texto, /creó la revisión/);
  const turno = describirEvento({ event: 'step_started', step: 1, to: 'Ana', due: '2026-09-20T00:00:00Z' });
  assert.match(turno.texto, /paso 2: le toca a Ana/);
  assert.equal(turno.vence, '2026-09-20T00:00:00Z');
  assert.match(describirEvento({ event: 'approve', step: 0, by: 'r1', emitido: 'CONFORME' }).texto,
               /dio su conformidad en el paso 1/);
  assert.match(describirEvento({ event: 'approve', step: 1, by: 'r2', emitido: 'APRUEBA' }).texto,
               /aprobó el paso 2/);
  // PRE no escribe `emitido`: su aprobacion se cuenta como siempre.
  assert.match(describirEvento({ event: 'approve', step: 0, by: 'r1' }).texto, /aprobó el paso 1/);
  const rechazo = describirEvento({ event: 'reject', step: 0, by: 'r1', comment: 'faltan cotas' });
  assert.match(rechazo.texto, /rechazó la revisión en el paso 1/);
  assert.equal(rechazo.detalle, 'faltan cotas');
  const sust = describirEvento({ event: 'step_reassigned', step: 0, by: 'admin',
    from: { name: 'Ana' }, to: { email: 'luis@obra.pe' }, reason: 'dejó la obra' });
  assert.match(sust.texto, /Ana → luis@obra\.pe/);
  assert.equal(sust.detalle, 'Motivo: dejó la obra');
});

await test('los errores dicen algo util y piden recargar si lo mostrado puede estar viejo', () => {
  assert.deepEqual(mensajeDeError(0, null).recargar, false);
  assert.match(mensajeDeError(0, null).texto, /No se pudo conectar/);
  const ya = mensajeDeError(409, { error: 'La revisión ya está approved' });
  assert.equal(ya.recargar, true);
  assert.match(ya.texto, /Otra persona actuó antes/);
  const version = mensajeDeError(409, { error: 'No se puede aprobar: alguien subió una versión nueva' });
  assert.equal(version.texto, 'No se puede aprobar: alguien subió una versión nueva');
  assert.equal(mensajeDeError(403, { code: 'SIN_PERMISO_DOCUMENTAL', error: 'x' }).recargar, true);
  assert.equal(mensajeDeError(404, {}).texto, 'Esa revisión no existe.');
  assert.equal(mensajeDeError(500, { error: 'boom' }).texto, 'boom');
});

await test('los filtros de la pantalla son exactamente los del servidor', () => {
  const fuente = readFileSync(join(aqui, '..', '..', 'backend', 'routes', 'reviews.py'), 'utf8');
  const bloque = fuente.match(/FILTROS_DEL_LISTADO = \(([^)]*)\)/);
  assert.ok(bloque, 'no se encuentra FILTROS_DEL_LISTADO en el backend');
  const servidor = [...bloque[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  assert.deepEqual(FILTROS.map(f => f.id), servidor);
});

console.log(JSON.stringify({ banco: 'revisiones', pass, fail }));
if (fail) process.exit(1);
