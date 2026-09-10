// Banco de regresion de los ANCHOS DE COLUMNA de la tabla de ficheros.
//
// Lo que fija: NADA de lo que venga del almacen puede dejar la tabla
// inservible, y una preferencia guardada tiene que volver tal cual.
//
// El dueno tenia que ensanchar «Descripcion» en cada visita porque los anchos
// solo vivian en memoria. Al persistirlos aparece un vecino nuevo -- el
// almacen es de fuera, y lo de fuera llega roto tarde o temprano.
import assert from 'node:assert/strict';
import {
  ANCHOS_POR_DEFECTO, ANCHO_MINIMO, ANCHO_MAXIMO, LLAVE_ANCHOS,
  leerAnchos, guardarAnchos, limitarAncho,
} from '../src/utils/anchosColumnas.js';

let pass = 0, fail = 0;
async function test(name, fn) {
    try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
    catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}

const almacen = (contenido = null) => {
    let valor = contenido;
    return {
        getItem: () => valor,
        setItem: (_, nuevo) => { valor = nuevo; },
        leerCrudo: () => valor,
    };
};
const almacenQueFalla = () => ({
    getItem() { throw new DOMException('almacenamiento no disponible'); },
    setItem() { throw new DOMException('cuota superada'); },
});

// ── LO NORMAL ────────────────────────────────────────────────────────────────

await test('sin nada guardado, los anchos de fabrica', () => {
    assert.deepEqual(leerAnchos(almacen()), ANCHOS_POR_DEFECTO);
});

await test('lo guardado vuelve tal cual', () => {
    const a = almacen();
    assert.equal(guardarAnchos({ ...ANCHOS_POR_DEFECTO, description: 349 }, a), true);
    assert.equal(leerAnchos(a).description, 349);
    assert.equal(JSON.parse(a.leerCrudo()).description, 349);
});

await test('lo leido es una COPIA: mutarlo no contamina los de fabrica', () => {
    const leidos = leerAnchos(almacen());
    leidos.name = 1;
    assert.equal(ANCHOS_POR_DEFECTO.name, 400);
    assert.equal(leerAnchos(almacen()).name, 400);
});

// ── LO ROTO ──────────────────────────────────────────────────────────────────

await test('JSON corrupto: anchos de fabrica, sin reventar', () => {
    assert.deepEqual(leerAnchos(almacen('esto no es json {{{')), ANCHOS_POR_DEFECTO);
});

for (const [etiqueta, contenido] of [
    ['un numero suelto', '42'],
    ['una lista', '[1,2,3]'],
    ['null', 'null'],
    ['una cadena', '"400"'],
]) {
    await test(`lo guardado no es un mapa de anchos (${etiqueta}): de fabrica`, () => {
        assert.deepEqual(leerAnchos(almacen(contenido)), ANCHOS_POR_DEFECTO);
    });
}

await test('valores basura: cada uno a su sitio, el resto intacto', () => {
    const a = almacen(JSON.stringify({
        description: 'ancho',        // no es un numero
        name: -50,                   // por debajo del minimo
        size: 99999,                 // absurdo
        columnaFantasma: 200,        // columna que ya no existe
        version: 240,                // legitimo
    }));
    const r = leerAnchos(a);
    assert.equal(r.description, ANCHOS_POR_DEFECTO.description, 'no numerico -> de fabrica');
    assert.equal(r.name, ANCHO_MINIMO, 'negativo -> minimo');
    assert.equal(r.size, ANCHO_MAXIMO, 'absurdo -> tope');
    assert.equal(r.version, 240, 'el legitimo se respeta');
    assert.equal('columnaFantasma' in r, false, 'columna retirada, ignorada');
    assert.equal(r.updated, ANCHOS_POR_DEFECTO.updated, 'columna ausente -> de fabrica');
    assert.deepEqual(Object.keys(r).sort(), Object.keys(ANCHOS_POR_DEFECTO).sort());
});

await test('un almacen que revienta al leer no tumba la pantalla', () => {
    assert.deepEqual(leerAnchos(almacenQueFalla()), ANCHOS_POR_DEFECTO);
});

await test('un almacen que revienta al escribir avisa, pero no lanza', () => {
    assert.equal(guardarAnchos(ANCHOS_POR_DEFECTO, almacenQueFalla()), false);
});

await test('sin almacen ninguno (navegacion privada dura)', () => {
    assert.deepEqual(leerAnchos(null), ANCHOS_POR_DEFECTO);
});

// ── EL RECORTE ───────────────────────────────────────────────────────────────

await test('limitarAncho deja pasar lo utilizable y recorta lo demas', () => {
    assert.equal(limitarAncho(100), 100);
    assert.equal(limitarAncho(ANCHO_MINIMO), ANCHO_MINIMO);
    assert.equal(limitarAncho(ANCHO_MAXIMO), ANCHO_MAXIMO);
    assert.equal(limitarAncho(10), ANCHO_MINIMO);
    assert.equal(limitarAncho(5000), ANCHO_MAXIMO);
    assert.equal(limitarAncho('350'), 350, 'una cifra en texto es una cifra');
});

await test('limitarAncho dice que NO a lo que no es un numero', () => {
    for (const basura of ['ancho', '', null, undefined, NaN, Infinity, -Infinity, {}, []]) {
        assert.equal(limitarAncho(basura), null, `deberia rechazar ${JSON.stringify(basura)}`);
    }
});

await test('la llave del almacen no cambia sin querer', () => {
    // Cambiarla no rompe nada, pero TIRA la preferencia de todo el mundo.
    assert.equal(LLAVE_ANCHOS, 'ecd.docs.anchosColumnas');
});

console.log(JSON.stringify({ suite: 'anchosColumnas', pass, fail }));
if (fail) process.exit(1);
