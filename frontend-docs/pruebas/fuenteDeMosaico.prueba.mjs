// Banco de la FUENTE DE UN MOSAICO: que teselas se piden al servidor, cuando y
// cuantas veces (paso B de docs/archivos/15).
//
// Lo que fija, porque el servidor de produccion es de una CPU y se recicla cada
// ~300 peticiones:
//  · con el manifiesto llegan las URL de los niveles preparados, y esas no se
//    vuelven a pedir;
//  · lo que entra mientras se pasea se junta: una peticion por gesto, en lotes
//    de 6, no una por fotograma; y si el nivel esta preparado (no hay nada que
//    dibujar), todas en una;
//  · si el nivel cambia antes de enviar, lo encolado del anterior no se pide;
//  · una tesela que falla se reintenta UNA vez y luego se deja (nunca un bucle);
//  · si la lamina se esta preparando, se vuelve a mirar un rato, y se deja de
//    mirar en cuanto el lector cambia de documento.
//
// La logica vive en `src/utils/fuenteDeMosaico.js` (sin red) y aqui se ejecuta
// de verdad; el comportamiento en pantalla se mide en el banco del lector.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { crearFuente, AJUSTES } from '../src/utils/fuenteDeMosaico.js';

let pass = 0, fail = 0;
async function test(name, fn) {
    try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
    catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}
const aqui = dirname(fileURLToPath(import.meta.url));
const fuente = (rel) => readFileSync(join(aqui, '..', 'src', rel), 'utf8');
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
const RAPIDO = { juntarMs: 10, esperaSiSePrepara: 10 };

const MAN = { tesela: 512, hoja_mm: [841, 594], preparados: [0, 1], niveles: [{}, {}, {}, {}] };

// Un servidor de mentira: apunta cada pregunta y contesta lo que se le diga.
function servidor({ manifiesto = MAN, pendientes = 0, fallan = new Set() } = {}) {
    const preguntas = [];
    let quedanPendientes = pendientes;
    const preguntar = async (cuerpo) => {
        preguntas.push(cuerpo);
        if (cuerpo.z === undefined) {
            if (quedanPendientes > 0) { quedanPendientes -= 1; return { success: true, manifiesto: null, urls: {}, pendiente: true }; }
            return { success: true, manifiesto, pendiente: false, urls: { '0/0_0': 'u:0/0_0', '1/2_1': 'u:1/2_1' } };
        }
        if (fallan.has(cuerpo.z)) return null;
        const urls = {};
        cuerpo.teselas.forEach(([x, y]) => { urls[`${cuerpo.z}/${x}_${y}`] = `u:${cuerpo.z}/${x}_${y}`; });
        return { success: true, urls, pendiente: false };
    };
    return { preguntar, preguntas, deTeselas: () => preguntas.filter(p => p.z !== undefined) };
}
const siempre = () => true;

await test('con el manifiesto llegan las URL preparadas y esas no se piden', async () => {
    const s = servidor();
    const f = crearFuente({ node_id: 'n1', version_id: null }, s.preguntar, RAPIDO);
    assert.equal(await f.manifiesto(siempre), MAN);
    assert.equal(f.url(1, 2, 1), 'u:1/2_1');
    f.pedir(1, [[2, 1]], () => {});
    await dormir(40);
    assert.equal(s.deTeselas().length, 0);
    assert.equal(f.clave, 'doc:n1:');
});

await test('lo que entra mientras se pasea se junta: una ronda, en lotes de 6', async () => {
    const s = servidor();
    const f = crearFuente({ node_id: 'n1' }, s.preguntar, RAPIDO);
    await f.manifiesto(siempre);
    let avisos = 0;
    f.pedir(3, [[0, 0], [1, 0], [2, 0], [3, 0]], () => { avisos += 1; });
    f.pedir(3, [[4, 0], [5, 0], [6, 0], [7, 0]], () => { avisos += 1; });
    f.pedir(3, [[0, 0], [8, 0]], () => { avisos += 1; });   // la repetida no cuenta
    await dormir(40);
    const lotes = s.deTeselas();
    assert.deepEqual(lotes.map(l => l.teselas.length), [6, 3], 'nueve teselas: un lote de 6 y otro de 3');
    assert.ok(lotes.every(l => l.z === 3 && l.node_id === 'n1'));
    assert.equal(avisos, 2, 'se avisa al llegar cada lote');
    assert.equal(f.url(3, 8, 0), 'u:3/8_0');
    f.pedir(3, [[8, 0]], () => {});
    await dormir(40);
    assert.equal(s.deTeselas().length, 2, 'lo que ya llego no se vuelve a pedir');
    assert.equal(AJUSTES.porLote, 6);
});

await test('las de un nivel preparado van todas en una peticion: no hay nada que dibujar', async () => {
    const s = servidor();                       // MAN.preparados = [0, 1]
    const f = crearFuente({ node_id: 'n1' }, s.preguntar, RAPIDO);
    await f.manifiesto(siempre);
    const muchas = Array.from({ length: 20 }, (_, i) => [i % 6, Math.floor(i / 6)]).filter(([x, y]) => !(x === 2 && y === 1));
    f.pedir(1, muchas, () => {});
    await dormir(40);
    assert.deepEqual(s.deTeselas().map(l => l.teselas.length), [19]);
});

await test('si el nivel cambia antes de enviar, lo del anterior no se pide', async () => {
    const s = servidor();
    const f = crearFuente({ node_id: 'n1' }, s.preguntar, RAPIDO);
    await f.manifiesto(siempre);
    f.pedir(2, [[0, 0], [1, 0]], () => {});
    f.pedir(3, [[5, 5]], () => {});
    await dormir(40);
    assert.deepEqual(s.deTeselas().map(l => [l.z, l.teselas]), [[3, [[5, 5]]]]);
    // y las de z2 se pueden pedir mas tarde: no quedaron «en camino» para siempre
    f.pedir(2, [[0, 0]], () => {});
    await dormir(40);
    assert.equal(s.deTeselas().length, 2);
});

await test('una tesela que falla se reintenta una vez y luego se deja', async () => {
    const s = servidor({ fallan: new Set([2]) });
    const f = crearFuente({ node_id: 'n1' }, s.preguntar, RAPIDO);
    await f.manifiesto(siempre);
    for (let i = 0; i < 5; i++) { f.pedir(2, [[1, 1]], () => {}); await dormir(30); }
    assert.equal(s.deTeselas().length, AJUSTES.maxFallos, 'dos intentos y basta: nunca un bucle');
    assert.equal(f.url(2, 1, 1), null);
});

await test('una imagen que no carga se olvida y se vuelve a pedir, con el mismo tope', async () => {
    const s = servidor();
    const f = crearFuente({ node_id: 'n1' }, s.preguntar, RAPIDO);
    await f.manifiesto(siempre);
    f.pedir(3, [[2, 2]], () => {});
    await dormir(30);
    assert.equal(f.url(3, 2, 2), 'u:3/2_2');
    f.fallo(3, 2, 2);                           // p. ej. la firma caduco
    assert.equal(f.url(3, 2, 2), null);
    f.pedir(3, [[2, 2]], () => {});
    await dormir(30);
    assert.equal(s.deTeselas().length, 2, 'se volvio a pedir una vez');
    f.fallo(3, 2, 2);
    f.pedir(3, [[2, 2]], () => {});
    await dormir(30);
    assert.equal(s.deTeselas().length, 2, 'y al segundo fallo se deja');
});

await test('si se esta preparando se vuelve a mirar, y se deja si el lector se va', async () => {
    const s = servidor({ pendientes: 2 });
    const f = crearFuente({ node_id: 'n1' }, s.preguntar, RAPIDO);
    assert.equal(await f.manifiesto(siempre), MAN);
    assert.equal(s.preguntas.length, 3);

    const s2 = servidor({ pendientes: 50 });
    const f2 = crearFuente({ node_id: 'n2' }, s2.preguntar, RAPIDO);
    let mirando = true;
    const promesa = f2.manifiesto(() => mirando);
    await dormir(25);
    mirando = false;                            // cambio de lamina
    assert.equal(await promesa, null);
    const hechas = s2.preguntas.length;
    await dormir(60);
    assert.equal(s2.preguntas.length, hechas, 'ya no pregunta por una lamina que no se mira');

    const s3 = servidor({ pendientes: 50 });
    const f3 = crearFuente({ node_id: 'n3' }, s3.preguntar, RAPIDO);
    assert.equal(await f3.manifiesto(siempre), null, 'y tiene tope: al final sigue como hoy');
    assert.equal(s3.preguntas.length, AJUSTES.reintentosSiSePrepara + 1);
});

await test('cerrar tira lo encolado sin enviarlo', async () => {
    const s = servidor();
    const f = crearFuente({ node_id: 'n1' }, s.preguntar, RAPIDO);
    await f.manifiesto(siempre);
    f.pedir(3, [[0, 0]], () => {});
    f.cerrar();
    await dormir(40);
    assert.equal(s.deTeselas().length, 0);
});

await test('el lector la usa por documento y version, con la ruta del servidor', () => {
    const remoto = fuente('utils/mosaicoRemoto.js');
    assert.match(remoto, /\/api\/docs\/mosaico/);
    assert.match(remoto, /crearFuente\(\{ node_id: nodeId \|\| null, version_id: versionId \|\| null \}, preguntar\)/);
    const lector = fuente('components/PDFViewer.jsx');
    assert.match(lector, /fuenteRemota\(nodeId, versionId\)/);
    // sin girar y solo la primera pagina: una tesela no gira con la hoja
    assert.match(lector, /fuenteMosaico && currentPage === 1 && !rotation &&/);
});

console.log(JSON.stringify({ banco: 'fuenteDeMosaico', pass, fail }));
if (fail) process.exit(1);
