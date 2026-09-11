// Banco de regresion de QUE SE PUEDE HACER CON LA SELECCION.
//
// El fallo que fija (OP-1, medido en banco): la barra ofrecia «Suprimir» y
// «Desplazar» sobre una seleccion que no sabia resolver, el usuario pulsaba y
// no pasaba NADA -- ni dialogo, ni aviso, ni error. La regla que lo impide es
// que una capacidad no disponible se DICE; nunca se queda activa e inerte.
//
// Y fija la otra mitad: los niveles son los del SERVIDOR, trazados endpoint por
// endpoint. Antes la interfaz exigia «administrador de obra» para renombrar,
// compartir y desplazar, y escondia esas capacidades a quien el servidor SI se
// las concede.
import assert from 'node:assert/strict';
import { capacidadesDeSeleccion, NIVELES, EXIGE } from '../src/utils/capacidadesDeSeleccion.js';

let pass = 0, fail = 0;
async function test(name, fn) {
    try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
    catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}

const doc = (extra = {}) => ({ id: 'n1', type: 'file', permission_level: 'edit', has_access: true, ...extra });
const carpeta = (extra = {}) => doc({ type: 'folder', ...extra });

// ── NADA ACTIVO QUE NO ACTUE ─────────────────────────────────────────────────

await test('sin seleccion: NINGUNA capacidad queda disponible, y todas dicen por que', () => {
    const c = capacidadesDeSeleccion({ elementos: [] });
    for (const [nombre, v] of Object.entries(c)) {
        assert.equal(v.disponible, false, `${nombre} no deberia poder usarse sin seleccion`);
        assert.ok(v.motivo, `${nombre} tiene que decir por que`);
    }
});

await test('un elemento sin id no se puede operar: todos los endpoints van por id', () => {
    const c = capacidadesDeSeleccion({ elementos: [doc({ id: null })], isAdmin: true });
    assert.equal(c.suprimir.disponible, false);
    assert.match(c.suprimir.motivo, /identificador/i);
});

await test('un elemento sin acceso no se anuncia: se OCULTA, no se deshabilita', () => {
    const c = capacidadesDeSeleccion({ elementos: [doc({ has_access: false })], isAdmin: true });
    assert.equal(c.renombrar.disponible, false);
    assert.equal(c.renombrar.mostrar, 'oculta', 'decir que se podria renombrar ya dice demasiado');
});

// ── LOS NIVELES SON LOS DEL SERVIDOR ─────────────────────────────────────────

await test('con `edit` se puede renombrar, compartir y desplazar SIN ser admin de obra', () => {
    const c = capacidadesDeSeleccion({ elementos: [doc({ permission_level: 'edit' })], isAdmin: false });
    assert.equal(c.renombrar.disponible, true);
    assert.equal(c.compartir.disponible, true);
    assert.equal(c.desplazar.disponible, true);
});

await test('con `edit` NO se puede suprimir: el servidor pide `admin` de carpeta', () => {
    const c = capacidadesDeSeleccion({ elementos: [doc({ permission_level: 'edit' })], isAdmin: false });
    assert.equal(c.suprimir.disponible, false);
    assert.match(c.suprimir.motivo, /administraci/i);
    assert.equal(c.suprimir.mostrar, 'deshabilitada', 'se puede pedir ese permiso: no se esconde');
});

await test('con `admin` de carpeta se puede suprimir aunque no seas admin de obra', () => {
    const c = capacidadesDeSeleccion({ elementos: [doc({ permission_level: 'admin' })], isAdmin: false });
    assert.equal(c.suprimir.disponible, true);
});

await test('un lector no puede nada de lo que exige permiso', () => {
    const c = capacidadesDeSeleccion({ elementos: [doc({ permission_level: 'viewer' })], isAdmin: false });
    for (const cap of Object.keys(EXIGE)) assert.equal(c[cap].disponible, false, cap);
    assert.equal(c.descargar.disponible, true, 'ver y descargar no exige nivel en esta ruta');
});

await test('sin dato de nivel se conserva el suelo anterior: manda el rol de obra', () => {
    const sin = doc({ permission_level: undefined });
    assert.equal(capacidadesDeSeleccion({ elementos: [sin], isAdmin: true }).suprimir.disponible, true);
    assert.equal(capacidadesDeSeleccion({ elementos: [sin], isAdmin: false }).renombrar.disponible, false);
});

// ── SELECCION MIXTA ──────────────────────────────────────────────────────────

await test('en seleccion mixta manda EL MAS POBRE: basta uno sin permiso', () => {
    const c = capacidadesDeSeleccion({
        elementos: [doc({ id: 'a', permission_level: 'admin' }), doc({ id: 'b', permission_level: 'viewer' })],
        isAdmin: false,
    });
    assert.equal(c.suprimir.disponible, false, 'media operacion es peor que ninguna');
    assert.match(c.suprimir.motivo, /todo lo seleccionado/i);
});

await test('varios elementos: renombrar y compartir no aplican', () => {
    const c = capacidadesDeSeleccion({ elementos: [doc({ id: 'a' }), doc({ id: 'b' })], isAdmin: true });
    assert.equal(c.renombrar.disponible, false);
    assert.match(c.renombrar.motivo, /un elemento/i);
    assert.equal(c.desplazar.disponible, true, 'desplazar SI admite varios');
});

await test('carpetas y archivos juntos: desplazar y suprimir siguen valiendo', () => {
    const c = capacidadesDeSeleccion({ elementos: [carpeta({ id: 'c', permission_level: 'admin' }), doc({ id: 'd', permission_level: 'admin' })], isAdmin: false });
    assert.equal(c.desplazar.disponible, true);
    assert.equal(c.suprimir.disponible, true);
    assert.equal(c.reservar.mostrar, 'oculta', 'reservar una carpeta no significa nada');
});

await test('reservar y atributos son de documento, no de carpeta', () => {
    const c = capacidadesDeSeleccion({ elementos: [carpeta()], isAdmin: true });
    assert.equal(c.reservar.disponible, false);
    assert.equal(c.reservar.mostrar, 'oculta');
    assert.equal(c.atributos.mostrar, 'oculta');
});

// ── PAPELERA ─────────────────────────────────────────────────────────────────

await test('en la papelera el repertorio documental no aplica', () => {
    const c = capacidadesDeSeleccion({ elementos: [doc()], isAdmin: true, isTrashMode: true });
    for (const v of Object.values(c)) { assert.equal(v.disponible, false); assert.equal(v.mostrar, 'oculta'); }
});

// ── EL CONTRATO ──────────────────────────────────────────────────────────────

await test('los niveles exigidos son los que se trazaron contra el backend', () => {
    assert.deepEqual(EXIGE, { renombrar: 'edit', compartir: 'edit', desplazar: 'edit', reservar: 'edit', suprimir: 'admin' });
    assert.equal(NIVELES.admin > NIVELES.edit, true);
});

await test('llamarla sin argumentos no revienta', () => {
    const c = capacidadesDeSeleccion();
    assert.equal(c.suprimir.disponible, false);
});

console.log(JSON.stringify({ suite: 'capacidadesDeSeleccion', pass, fail }));
if (fail) process.exit(1);
