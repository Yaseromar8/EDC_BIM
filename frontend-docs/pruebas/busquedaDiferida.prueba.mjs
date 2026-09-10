// Banco de regresion de la BUSQUEDA DIFERIDA del portal.
//
// El fallo que fija: la limpieza cancelaba el temporizador pero no la peticion
// ya lanzada. Borrabas la caja, volvian tus carpetas, y entonces aterrizaba la
// respuesta de antes y devolvia la pantalla a modo busqueda con la caja YA
// VACIA -- «0 resultados para ""» -- tapando carpetas y archivos. De ahi no se
// salia navegando ni con «Limpiar»: solo recargando.
//
// Esto es una CARRERA. No se demuestra leyendo el codigo: hay que ejecutarla,
// y por eso la regla vive fuera de React.
import assert from 'node:assert/strict';
import { programarBusqueda, LONGITUD_MINIMA, RETRASO_MS } from '../src/utils/busquedaDiferida.js';

let pass = 0, fail = 0;
async function test(name, fn) {
    try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
    catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}

const esperar = (ms) => new Promise(r => setTimeout(r, ms));
/** Un registrador de lo que llega a la pantalla. */
const recoger = () => { const visto = []; const fn = (v) => visto.push(v); fn.visto = visto; return fn; };

// ── LO QUE NI SIQUIERA SALE A BUSCAR ─────────────────────────────────────────

for (const corta of ['', '  ', 'a', 'ab', ' ab ']) {
    await test(`«${corta}» es demasiado corta: limpia y no busca`, async () => {
        let llamadas = 0;
        const alResultado = recoger();
        programarBusqueda({ consulta: corta, buscar: async () => { llamadas++; return []; }, alResultado, retraso: 5 });
        await esperar(30);
        assert.deepEqual(alResultado.visto, [null], 'tiene que devolver a las carpetas');
        assert.equal(llamadas, 0, 'no debe salir ninguna peticion');
    });
}

await test('deshabilitada (papelera u otra seccion): limpia y no busca', async () => {
    let llamadas = 0;
    const alResultado = recoger();
    programarBusqueda({ consulta: 'PROTOCOLO', habilitada: false, buscar: async () => { llamadas++; return []; }, alResultado, retraso: 5 });
    await esperar(30);
    assert.deepEqual(alResultado.visto, [null]);
    assert.equal(llamadas, 0);
});

// ── LO NORMAL ────────────────────────────────────────────────────────────────

await test('una consulta buena acaba en pantalla', async () => {
    const alResultado = recoger();
    programarBusqueda({ consulta: 'PROTOCOLO', buscar: async () => [{ id: 1 }], alResultado, retraso: 5 });
    await esperar(40);
    assert.deepEqual(alResultado.visto, [[{ id: 1 }]]);
});

await test('espera antes de salir: no busca en cada tecla', async () => {
    let llamadas = 0;
    programarBusqueda({ consulta: 'PROTOCOLO', buscar: async () => { llamadas++; return []; }, alResultado: () => {}, retraso: 60 });
    await esperar(20);
    assert.equal(llamadas, 0, 'todavia no deberia haber salido');
    await esperar(80);
    assert.equal(llamadas, 1, 'y solo debe salir una vez');
});

await test('a buscar le llega la consulta RECORTADA', async () => {
    let recibida = null;
    programarBusqueda({ consulta: '  PROTOCOLO  ', buscar: async (q) => { recibida = q; return []; }, alResultado: () => {}, retraso: 5 });
    await esperar(30);
    assert.equal(recibida, 'PROTOCOLO');
});

// ── LA CARRERA ───────────────────────────────────────────────────────────────

await test('CANCELAR antes de que salga: la peticion no llega a nacer', async () => {
    let llamadas = 0;
    const alResultado = recoger();
    const cancelar = programarBusqueda({ consulta: 'PROTOCOLO', buscar: async () => { llamadas++; return []; }, alResultado, retraso: 50 });
    cancelar();
    await esperar(90);
    assert.equal(llamadas, 0);
    assert.deepEqual(alResultado.visto, []);
});

await test('CANCELAR con la respuesta EN VUELO: aterriza y no escribe nada', async () => {
    // Este es el fallo del dueno, exactamente. La peticion ya salio; se borra
    // la caja; la respuesta llega despues. No puede tocar la pantalla.
    let respondio = false;
    const alResultado = recoger();
    const cancelar = programarBusqueda({
        consulta: 'PROTOCOLO',
        buscar: async () => { await esperar(60); respondio = true; return []; },
        alResultado, retraso: 5,
    });
    await esperar(25);              // ya salio, todavia no ha vuelto
    cancelar();                     // <- se borra la caja
    await esperar(90);              // <- aterriza la respuesta vieja
    assert.equal(respondio, true, 'la respuesta TIENE que haber llegado; si no, no probamos nada');
    assert.deepEqual(alResultado.visto, [], 'y aun asi no debe haber tapado las carpetas');
});

await test('la ULTIMA gana: «PRO» no puede pisar a «PROT»', async () => {
    const alResultado = recoger();
    const cancelarA = programarBusqueda({
        consulta: 'PRO',
        buscar: async () => { await esperar(70); return ['viejo']; },
        alResultado, retraso: 5,
    });
    await esperar(20);
    cancelarA();                    // se sigue tecleando: lo de «PRO» ya no vale
    programarBusqueda({
        consulta: 'PROT',
        buscar: async () => ['nuevo'],
        alResultado, retraso: 5,
    });
    await esperar(120);
    assert.deepEqual(alResultado.visto, [['nuevo']], 'solo debe verse lo ultimo');
});

// ── CUANDO LA RED FALLA ──────────────────────────────────────────────────────

await test('si buscar revienta, la pantalla se queda como estaba', async () => {
    const alResultado = recoger();
    programarBusqueda({ consulta: 'PROTOCOLO', buscar: async () => { throw new Error('red caida'); }, alResultado, retraso: 5 });
    await esperar(40);
    assert.deepEqual(alResultado.visto, [], 'un fallo de una peticion no vacia la pantalla');
});

await test('sin respuesta util (undefined) no se escribe nada', async () => {
    const alResultado = recoger();
    programarBusqueda({ consulta: 'PROTOCOLO', buscar: async () => undefined, alResultado, retraso: 5 });
    await esperar(40);
    assert.deepEqual(alResultado.visto, []);
});

await test('cero resultados SI se escribe: es una respuesta', async () => {
    const alResultado = recoger();
    programarBusqueda({ consulta: 'PROTOCOLO', buscar: async () => [], alResultado, retraso: 5 });
    await esperar(40);
    assert.deepEqual(alResultado.visto, [[]]);
});

await test('cancelar dos veces no molesta', async () => {
    const cancelar = programarBusqueda({ consulta: 'PROTOCOLO', buscar: async () => [], alResultado: () => {}, retraso: 5 });
    cancelar(); cancelar();
    await esperar(30);
});

await test('las constantes del contrato siguen donde estaban', () => {
    assert.equal(LONGITUD_MINIMA, 3);
    assert.equal(RETRASO_MS, 350);
});

console.log(JSON.stringify({ suite: 'busquedaDiferida', pass, fail }));
if (fail) process.exit(1);
