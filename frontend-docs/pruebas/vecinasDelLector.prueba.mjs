// Banco de las LAMINAS VECINAS del lector: cuales se adelantan y hasta donde.
//
// Lo que fija (lote P1, medido en produccion el 15-sep-2026): al abrir el plano
// de paisajismo 004122 (23,4 MB) se descargaban ENTERAS sus dos vecinas, ~46 MB
// que nadie habia pedido, y la primera empezaba mientras el plano abierto aun
// se dibujaba. Y si el usuario cerraba el visor en ese momento, la descarga en
// curso seguia hasta el final.
//
// La regla vive en `utils/vecinasDelLector.js` y aqui se ejecuta de verdad. Las
// comprobaciones de fuente del final solo fijan que el lector la USA y que
// corta lo que esta bajando al cerrar; el comportamiento en pantalla se mide
// en el banco del lector.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    planDeVecinas, pesaPoco, VENTANA_DE_VECINAS, TOPE_PARA_DESCARGAR_BYTES,
} from '../src/utils/vecinasDelLector.js';

let pass = 0, fail = 0;
async function test(name, fn) {
    try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
    catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}

const aqui = dirname(fileURLToPath(import.meta.url));
const fuente = (rel) => readFileSync(join(aqui, '..', 'src', rel), 'utf8');

const MB = 1024 * 1024;
const hoja = (n, size) => ({ name: `L${String(n).padStart(2, '0')}.pdf`, gcs_urn: `u${n}`, size });
const carpeta = (total, size) => Array.from({ length: total }, (_, i) => hoja(i, size));

await test('el orden de siempre: pegadas primero, delante antes que detras, hasta 4 de cada lado', () => {
    const plan = planDeVecinas(carpeta(12, MB), 5);
    assert.deepEqual(plan.map(p => p.hermano.name),
        ['L06.pdf', 'L04.pdf', 'L07.pdf', 'L03.pdf', 'L08.pdf', 'L02.pdf', 'L09.pdf', 'L01.pdf']);
    assert.equal(VENTANA_DE_VECINAS, 4);
});

await test('planos pequenos: las dos pegadas se descargan; las de mas lejos solo se autorizan', () => {
    const plan = planDeVecinas(carpeta(12, 400 * 1024), 5);
    assert.deepEqual(plan.map(p => p.interpretar), [true, true, false, false, false, false, false, false]);
});

await test('el caso medido: 004122 con vecinas de 23,4 MB -> se autorizan todas y no se descarga ninguna', () => {
    // PAISAJISMO/PDF: 18 planos, 004122 es el tercero (indice 2).
    const plan = planDeVecinas(carpeta(18, 23.4 * MB), 2);
    assert.equal(plan.length, 6, 'las mismas 6 autorizaciones que hoy');
    assert.ok(plan.every(p => p.interpretar === false));
});

await test('carpeta mezclada: se descarga la pegada pequena y no la pegada pesada', () => {
    const hs = [hoja(0, MB), hoja(1, 23 * MB), hoja(2, MB), hoja(3, 2 * MB), hoja(4, 40 * MB)];
    const plan = planDeVecinas(hs, 2);
    const descarga = Object.fromEntries(plan.map(p => [p.hermano.name, p.interpretar]));
    assert.deepEqual(descarga, { 'L03.pdf': true, 'L01.pdf': false, 'L04.pdf': false, 'L00.pdf': false });
});

await test('el tope es de 5 MB e incluye el propio tope', () => {
    assert.equal(TOPE_PARA_DESCARGAR_BYTES, 5 * MB);
    assert.equal(pesaPoco({ size: TOPE_PARA_DESCARGAR_BYTES }), true);
    assert.equal(pesaPoco({ size: TOPE_PARA_DESCARGAR_BYTES + 1 }), false);
});

await test('sin tamano conocido no se descarga: solo se autoriza', () => {
    for (const size of [undefined, null, 0, -1, 'abc', Number.NaN, Infinity]) {
        assert.equal(pesaPoco({ size }), false, String(size));
    }
    assert.equal(pesaPoco(null), false);
    assert.equal(pesaPoco({ size: '1048576' }), true, 'un numero que llega como texto vale');
    const plan = planDeVecinas([hoja(0, undefined), hoja(1, MB), hoja(2, null)], 1);
    assert.deepEqual(plan.map(p => [p.hermano.name, p.interpretar]), [['L02.pdf', false], ['L00.pdf', false]]);
});

await test('bordes: primera y ultima lamina, indice invalido, sin lista', () => {
    const hs = carpeta(3, MB);
    assert.deepEqual(planDeVecinas(hs, 0).map(p => p.hermano.name), ['L01.pdf', 'L02.pdf']);
    assert.deepEqual(planDeVecinas(hs, 2).map(p => p.hermano.name), ['L01.pdf', 'L00.pdf']);
    assert.deepEqual(planDeVecinas(hs, -1), []);
    assert.deepEqual(planDeVecinas(hs, 1.5), []);
    assert.deepEqual(planDeVecinas([], 0), []);
    assert.deepEqual(planDeVecinas(null, 0), []);
});

await test('el lector usa la regla, no una copia propia', () => {
    const src = fuente('components/PDFViewer.jsx');
    assert.match(src, /import \{ planDeVecinas \} from '\.\.\/utils\/vecinasDelLector';/);
    assert.match(src, /of planDeVecinas\(hermanos, indice\)/);
    assert.doesNotMatch(src, /const VENTANA = 4/, 'la ventana vive en la regla');
    assert.doesNotMatch(src, /d === 1\]\)/, 'ya no se decide la descarga solo por la distancia');
});

await test('al cerrar el visor se corta la descarga en curso, y no se empieza una tras cerrar', () => {
    const src = fuente('components/PDFViewer.jsx');
    assert.match(src, /enCurso\.add\(tarea\);/);
    assert.match(src, /finally \{ enCurso\.delete\(tarea\); \}/);
    assert.match(src, /if \(!sigueValiendo\(\)\) \{ yaPedidos\.delete\(hermano\.gcs_urn\); return; \}/);
    // La limpieza que corta es la del montaje (lista de dependencias vacia): cambiar
    // de lamina NO corta, cerrar SI.
    assert.match(src, /const enCurso = vecinasEnCursoRef\.current;\s+return \(\) => \{\s+for \(const tarea of enCurso\) \{\s+try \{ tarea\.destroy\(\); \}/);
    assert.match(src, /enCurso\.clear\(\);\s+\};\s+\}, \[\]\);/);
});

console.log(JSON.stringify({ banco: 'vecinasDelLector', pass, fail }));
if (fail) process.exit(1);
