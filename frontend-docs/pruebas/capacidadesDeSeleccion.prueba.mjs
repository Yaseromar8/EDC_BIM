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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { capacidadesDeSeleccion, NIVELES, EXIGE, puedeEditarEn } from '../src/utils/capacidadesDeSeleccion.js';

const aqui = dirname(fileURLToPath(import.meta.url));

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

await test('con `edit` se puede suprimir (14-sep-2026: antes pedia `admin` de carpeta)', () => {
    const c = capacidadesDeSeleccion({
        elementos: [doc({ permission_level: 'edit' }), carpeta({ id: 'c2', permission_level: 'edit' })],
        isAdmin: false,
    });
    assert.equal(c.suprimir.disponible, true);
});

await test('con Ver, Descargar o Comentar NO se puede suprimir, y se dice por que', () => {
    for (const nivel of ['viewer', 'view_download', 'view_markup']) {
        const c = capacidadesDeSeleccion({ elementos: [doc({ permission_level: nivel })], isAdmin: false });
        assert.equal(c.suprimir.disponible, false, nivel);
        assert.match(c.suprimir.motivo, /edici/i);
        assert.equal(c.suprimir.mostrar, 'deshabilitada', 'se puede pedir ese permiso: no se esconde');
    }
});

await test('con `admin` de carpeta se puede suprimir aunque no seas admin de obra', () => {
    const c = capacidadesDeSeleccion({ elementos: [doc({ permission_level: 'admin' })], isAdmin: false });
    assert.equal(c.suprimir.disponible, true);
});

await test('un lector no puede nada de lo que exige permiso', () => {
    const c = capacidadesDeSeleccion({ elementos: [doc({ permission_level: 'viewer' })], isAdmin: false });
    // Las que piden más que «Ver». Copiar la estructura y enlazar LEEN lo elegido: lo que escriben es el destino, y
    // ahí el servidor exige «Editar» (lo atan las pruebas de contrato de abajo).
    const exigenMas = Object.keys(EXIGE).filter(cap => EXIGE[cap] !== 'viewer');
    assert.deepEqual(Object.keys(EXIGE).filter(cap => EXIGE[cap] === 'viewer'), ['copiar_estructura', 'enlazar']);
    for (const cap of exigenMas) assert.equal(c[cap].disponible, false, cap);
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

// ── CREAR Y SUBIR CON «EDITAR» (13-sep-2026) ─────────────────────────────────
//
// El portal decidia «Cargar archivos», «Nueva carpeta» y «Añadir subcarpeta»
// con «administra esta obra». Quien tenia «Editar» en la carpeta no los veia,
// aunque el servidor si se lo permite.

await test('con `edit` en la carpeta se puede cargar y crear SIN ser admin de obra', () => {
    assert.equal(puedeEditarEn('edit', false), true);
    assert.equal(puedeEditarEn('admin', false), true);
});

await test('con Ver, Descargar o Comentar NO se ofrece cargar ni crear', () => {
    for (const nivel of ['viewer', 'view_download', 'view_markup', 'none', undefined, null, 'raro']) {
        assert.equal(puedeEditarEn(nivel, false), false, String(nivel));
    }
});

await test('quien administra la obra puede cargar aunque aun no haya llegado el nivel', () => {
    assert.equal(puedeEditarEn(null, true), true);
});

await test('añadir subcarpeta: solo sobre UNA carpeta y con `edit`', () => {
    assert.equal(capacidadesDeSeleccion({ elementos: [carpeta({ permission_level: 'edit' })] }).subcarpeta.disponible, true);
    const lector = capacidadesDeSeleccion({ elementos: [carpeta({ permission_level: 'viewer' })] }).subcarpeta;
    assert.equal(lector.disponible, false);
    assert.equal(lector.mostrar, 'deshabilitada');
    const sobreDoc = capacidadesDeSeleccion({ elementos: [doc()] }).subcarpeta;
    assert.equal(sobreDoc.disponible, false);
    assert.equal(sobreDoc.mostrar, 'oculta', 'una subcarpeta dentro de un documento no significa nada');
});

await test('copiar la estructura: sobre una o VARIAS carpetas, y basta con verlas (los destinos los mira el servidor)', () => {
    assert.equal(capacidadesDeSeleccion({ elementos: [carpeta({ permission_level: 'viewer' })] }).copiar_estructura.disponible, true);
    assert.equal(capacidadesDeSeleccion({ elementos: [doc()] }).copiar_estructura.mostrar, 'oculta');
    // 5-nov-2026: el dueño marca las subcarpetas que quiere repetir y las copia.
    const dos = capacidadesDeSeleccion({ elementos: [carpeta({ id: 'a' }), carpeta({ id: 'b' })] }).copiar_estructura;
    assert.equal(dos.disponible, true);
    assert.equal(capacidadesDeSeleccion({ elementos: [carpeta({ id: 'a' }), doc({ id: 'b' })] }).copiar_estructura.mostrar, 'oculta');
    assert.equal(capacidadesDeSeleccion({ elementos: [carpeta({ permission_level: 'none' })] }).copiar_estructura.disponible, false);
    assert.equal(capacidadesDeSeleccion({ elementos: [carpeta({ id: 'a' }), carpeta({ id: 'b', permission_level: 'none' })] })
        .copiar_estructura.disponible, false);
});

await test('enlazar: uno o varios DOCUMENTOS, y basta con verlos (las carpetas las mira el servidor)', () => {
    assert.equal(capacidadesDeSeleccion({ elementos: [doc({ permission_level: 'viewer' })] }).enlazar.disponible, true);
    assert.equal(capacidadesDeSeleccion({ elementos: [doc({ id: 'a' }), doc({ id: 'b' })] }).enlazar.disponible, true);
    assert.equal(capacidadesDeSeleccion({ elementos: [carpeta()] }).enlazar.mostrar, 'oculta');
    assert.equal(capacidadesDeSeleccion({ elementos: [doc({ permission_level: 'none' })] }).enlazar.disponible, false);
});

await test('un ENLACE: lo suyo se hace en el original, y quitarlo pide «Editar» en ESTA carpeta', () => {
    const enlace = doc({ id: 'e', permission_level: 'admin', enlace: { id: 'x', desde: { ruta: ['0. Generales'] } } });
    const c = capacidadesDeSeleccion({ elementos: [enlace], puedeEditarAqui: true });
    for (const cap of ['renombrar', 'desplazar', 'suprimir', 'reservar', 'atributos', 'nueva_version']) {
        assert.equal(c[cap].disponible, false, cap);
        assert.match(c[cap].motivo, /enlace/, cap);
        assert.notEqual(c[cap].mostrar, 'oculta', cap);                    // se apaga y se dice por qué
    }
    assert.equal(c.descargar.disponible, true);
    assert.equal(c.enlazar.disponible, true);                              // se puede enlazar en más carpetas
    assert.equal(c.quitar_enlace.disponible, true);
    assert.equal(capacidadesDeSeleccion({ elementos: [enlace], puedeEditarAqui: false }).quitar_enlace.disponible, false);
    assert.equal(capacidadesDeSeleccion({ elementos: [enlace], isAdmin: true }).quitar_enlace.disponible, true);
    // Mezclado con un documento propio: suprimir se apaga (no se suprime el original) y quitar el enlace no aplica.
    const mezcla = capacidadesDeSeleccion({ elementos: [enlace, doc({ id: 'p', permission_level: 'edit' })], puedeEditarAqui: true });
    assert.equal(mezcla.suprimir.disponible, false);
    assert.equal(mezcla.quitar_enlace.mostrar, 'oculta');
    // Un documento propio no ofrece quitar un enlace.
    assert.equal(capacidadesDeSeleccion({ elementos: [doc()] }).quitar_enlace.mostrar, 'oculta');
});

await test('subir nueva version: solo sobre UN documento y con `edit`', () => {
    assert.equal(capacidadesDeSeleccion({ elementos: [doc({ permission_level: 'edit' })] }).nueva_version.disponible, true);
    assert.equal(capacidadesDeSeleccion({ elementos: [doc({ permission_level: 'view_markup' })] }).nueva_version.disponible, false);
    assert.equal(capacidadesDeSeleccion({ elementos: [carpeta()] }).nueva_version.mostrar, 'oculta');
    const dos = capacidadesDeSeleccion({ elementos: [doc({ id: 'a' }), doc({ id: 'b' })] }).nueva_version;
    assert.equal(dos.disponible, false);
    assert.match(dos.motivo, /un elemento/i);
});

// ── PAPELERA ─────────────────────────────────────────────────────────────────

await test('en la papelera el repertorio documental no aplica', () => {
    const c = capacidadesDeSeleccion({ elementos: [doc()], isAdmin: true, isTrashMode: true });
    for (const v of Object.values(c)) { assert.equal(v.disponible, false); assert.equal(v.mostrar, 'oculta'); }
});

// ── EL CONTRATO ──────────────────────────────────────────────────────────────

await test('los niveles exigidos son los que se trazaron contra el backend', () => {
    assert.deepEqual(EXIGE, { renombrar: 'edit', compartir: 'edit', desplazar: 'edit', reservar: 'edit',
                              subcarpeta: 'edit', nueva_version: 'edit', suprimir: 'edit',
                              copiar_estructura: 'viewer', enlazar: 'viewer' });
    assert.equal(NIVELES.admin > NIVELES.edit, true);
    // Y el servidor pide lo mismo para suprimir, en lote y restaurar.
    const servidor = readFileSync(join(aqui, '..', '..', 'backend', 'routes', 'documents.py'), 'utf8');
    assert.match(servidor, /'edit', 'suprimir archivos'/, 'suprimir de uno en uno');
    assert.match(servidor, /'edit',\s+'suprimir documentos'/, 'suprimir en lote');
    assert.match(servidor, /'edit', 'restaurar elementos'/, 'restaurar');
    assert.match(servidor, /'viewer', 'copiar la estructura de esta carpeta'/, 'copiar estructura: la modelo');
    assert.match(servidor, /'edit', 'crear carpetas en ese destino'/, 'copiar estructura: cada destino');
    assert.match(servidor, /'viewer', 'enlazar este documento'/, 'enlazar: el documento');
    assert.match(servidor, /'edit', 'enlazar en esa carpeta'/, 'enlazar: cada carpeta');
    assert.match(servidor, /'edit', 'quitar un enlace de esta carpeta'/, 'quitar un enlace: su carpeta');
});

await test('llamarla sin argumentos no revienta', () => {
    const c = capacidadesDeSeleccion();
    assert.equal(c.suprimir.disponible, false);
});

console.log(JSON.stringify({ suite: 'capacidadesDeSeleccion', pass, fail }));
if (fail) process.exit(1);
