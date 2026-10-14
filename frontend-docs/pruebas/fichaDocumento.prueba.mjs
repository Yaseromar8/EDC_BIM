// Banco de la FICHA de un documento (paso 3, 14-oct-2026).
//
// Lo que fija:
//   · una sola línea de tiempo, de lo más nuevo a lo más viejo, que junta el
//     registro con revisiones, envíos y RFI sin duplicar subidas;
//   · un evento sin sellar lo dice; uno que no es del registro no inventa sello;
//   · «Comprobar un archivo» compara contra TODAS las versiones y dice si la que
//     coincide es o no la vigente.
import assert from 'node:assert/strict';
import { lineaDeTiempo, accesosDe, comprobarHuella, queOcurrio, fechasDelRecorrido } from '../src/utils/fichaDocumento.js';

let pass = 0, fail = 0;
async function test(name, fn) {
    try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
    catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}

const H2 = 'b'.repeat(64), H1 = 'a'.repeat(64);
const DATOS = {
    versiones: [
        { version: 2, revision: 'P02', subida_en: '2026-10-12T15:10:00Z', subida_por: 'Eva', huella: H2 },
        { version: 1, revision: 'P01', subida_en: '2026-09-02T09:15:00Z', subida_por: 'Eva', huella: H1 },
    ],
    eventos: [
        { accion: 'acceso_a_documento', por: 'sup', detalle: { version: 2, via: 'sesión' }, cuando: '2026-10-13T18:00:00Z', sellado: true },
        { accion: 'cambio_de_estado', por: 'Ana', detalle: { estado_anterior: 'WIP', estado_nuevo: 'SHARED' }, cuando: '2026-10-12T16:40:00Z', sellado: true },
        { accion: 'upload_file', por: 'Eva', detalle: { version: 2 }, cuando: '2026-10-12T15:10:00Z', sellado: true },
        { accion: 'acceso_a_documento', por: 'con', detalle: { version: 1, via: 'DENEGADO por permiso de carpeta' }, cuando: '2026-09-21T08:11:00Z', sellado: false },
    ],
    relacionados: {
        revisiones: [{ id: 41, titulo: 'Etapa 2', estado: 'approved', creada_en: '2026-10-12T17:00:00Z', cerrada_en: '2026-10-13T10:00:00Z' }],
        envios: [{ id: 12, numero: 12, asunto: 'A Supervisión', por: 'Eva', cuando: '2026-09-22T09:30:00Z', acuses: 0 }],
        rfis: [{ id: 'r', codigo: 'RFI-007', titulo: 'Cota', estado: 'Respondido', fecha: '2026-09-15T08:20:00Z' }],
        plan: [], marcas: { publicadas: 0 },
    },
};

await test('la línea de tiempo junta todo, de lo más nuevo a lo más viejo', () => {
    const l = lineaDeTiempo(DATOS);
    const t = l.map(e => new Date(e.cuando).getTime());
    assert.deepEqual(t, [...t].sort((a, b) => b - a));
    const tipos = new Set(l.map(e => e.tipo));
    for (const k of ['estado', 'version', 'revision', 'envio', 'rfi', 'acceso']) assert.ok(tipos.has(k), k);
});

await test('la subida de la V2 no se duplica; la V1, sin registro, sale de las versiones', () => {
    const l = lineaDeTiempo(DATOS).filter(e => e.tipo === 'version');
    assert.deepEqual(l.map(e => e.texto), ['Subió la V2', 'Creado · V1']);
});

await test('revisión: entrada y cierre, con su resultado', () => {
    const l = lineaDeTiempo(DATOS).filter(e => e.tipo === 'revision').map(e => e.texto);
    assert.deepEqual(l, ['Revisión RV-041 aprobada', 'Entró en la revisión RV-041']);
});

await test('el sello: el registro lo dice; lo que no es del registro no lo inventa', () => {
    const l = lineaDeTiempo(DATOS);
    assert.equal(l.find(e => e.tipo === 'acceso' && e.cuando.startsWith('2026-09')).sellado, false);
    assert.equal(l.find(e => e.tipo === 'envio').sellado, undefined);
});

await test('envío sin acuse se dice', () => {
    assert.match(lineaDeTiempo(DATOS).find(e => e.tipo === 'envio').detalle, /sin acuse/);
});

await test('accesos: uno por fila, con versión y vía; los denegados marcados', () => {
    const a = accesosDe(DATOS);
    assert.equal(a.length, 2);
    assert.deepEqual([a[0].version, a[0].via, a[0].denegado], [2, 'sesión', false]);
    assert.equal(a[1].denegado, true);
});

await test('comprobar: coincide con la vigente', () => {
    const r = comprobarHuella(H2.toUpperCase(), DATOS.versiones);
    assert.equal(r.coincide, true);
    assert.equal(r.version.version, 2);
    assert.equal(r.esVigente, true);
});

await test('comprobar: coincide con una versión anterior y lo avisa', () => {
    const r = comprobarHuella(H1, DATOS.versiones);
    assert.equal(r.coincide, true);
    assert.equal(r.esVigente, false);
});

await test('comprobar: no coincide con ninguna', () => {
    const r = comprobarHuella('c'.repeat(64), DATOS.versiones);
    assert.equal(r.coincide, false);
    assert.equal(r.conHuella, 2);
});

await test('comprobar: sin huellas no se afirma nada', () => {
    const r = comprobarHuella(H2, [{ version: 1, huella: null }]);
    assert.equal(r.coincide, false);
    assert.equal(r.conHuella, 0);
    assert.equal(r.sinHuella, 1);
});

await test('sin datos no revienta', () => {
    assert.deepEqual(lineaDeTiempo(null), []);
    assert.deepEqual(accesosDe(undefined), []);
    assert.equal(comprobarHuella('x', undefined).coincide, false);
});

await test('lo compartido con el panel sigue igual', () => {
    assert.equal(queOcurrio({ accion: 'upload_file', detalle: {} }), 'Subió una versión');
    assert.equal(fechasDelRecorrido(DATOS).WIP, '2026-09-02T09:15:00Z');
});

console.log(`\nfichaDocumento: ${pass} pasan, ${fail} fallan`);
if (fail) process.exit(1);
