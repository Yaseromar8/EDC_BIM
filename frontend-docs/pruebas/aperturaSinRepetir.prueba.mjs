// Banco de la APERTURA SIN TRABAJO REPETIDO (lote P1, 15-sep-2026).
//
// Medido en produccion al abrir documentos:
//   - un PDF pedia su URL firmada DOS veces: la de la vista y la de «Abrir en
//     escritorio», cada una por su lado;
//   - un CAD esperaba ~0,9 s detras de «Preparando vista segura…» a una URL
//     firmada que el visor de Autodesk no lee (abre el modelo traducido por su
//     URN), y ademas pedia la de escritorio.
//
// Que la vista CAD monte sin esa espera y que la traduccion guardada se reuse
// se ejecuta en el banco del visor CAD (probar-cad) y en la app del banco. Aqui
// se fijan las piezas en la fuente, para que un cambio posterior no las
// deshaga en silencio.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let pass = 0, fail = 0;
async function test(name, fn) {
    try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
    catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}

const aqui = dirname(fileURLToPath(import.meta.url));
const fuente = (rel) => readFileSync(join(aqui, '..', 'src', rel), 'utf8');
const visor = fuente('components/DocumentViewer.jsx');
const cad = fuente('components/CadViewer.jsx');

await test('la URL firmada solo se pide por el almacen compartido', () => {
    // Antes habia DOS peticiones escritas a mano con urn: la pre-firma y el clic
    // de escritorio. Office y la vista de ficheros antiguos sin urn (`?path=`)
    // montan su URL aparte y la piden con `apiFetch(url)`: no entran aqui.
    const directas = visor.match(/apiFetch\(`\$\{API\}\/api\/docs\/signed-url\?urn=/g) || [];
    assert.equal(directas.length, 0, 'ni la pre-firma ni escritorio piden por libre');
    assert.doesNotMatch(visor, /firmadaRef/, 'la copia propia de escritorio desaparece');
    assert.match(visor, /pedirUrlFirmada\(urn, projectPrefix\)\s+\.catch\(\(\) => \{ \/\* el clic tiene su propio camino con aviso \*\/ \}\);/);
    assert.match(visor, /let firmada = urlFirmadaEnMano\(urn\) \|\| '';/);
    assert.match(visor, /firmada = await pedirUrlFirmada\(urn, projectPrefix\);/);
});

await test('un CAD no pide ni espera la URL de la vista', () => {
    assert.match(visor, /const isCad = CAD_EXTENSIONS\.some\(ext => lowerName\.endsWith\(ext\)\);\s+if \(isShared \|\| isOffice \|\| isCad\) \{/);
    assert.match(visor, /const esCadAqui = CAD_EXTENSIONS\.some\(ext => lowerName\.endsWith\(ext\)\);/);
    assert.match(visor, /!isShared && !esPdfAqui && !esCadAqui && /, 'sin «Preparando vista segura…» para un CAD');
    assert.match(visor, /if \(!isShared && !esCadAqui && previewError\) \{/);
});

await test('el CAD compartido sigue recibiendo su URL (descarga del original)', () => {
    assert.match(visor, /setSecurePreviewUrl\(isShared \? \(file\.url \|\| ''\) : ''\);/);
    assert.match(visor, /<a href=\{fileUrl\} download=\{file\.name\}/);
});

await test('el visor CAD reusa la traduccion guardada y, si no abre, verifica UNA vez', () => {
    assert.match(cad, /const arrancar = async \(\{ verificar = false \} = \{\}\) => \{/);
    // Desde el 21-sep-2026 el cuerpo lleva ademas la version elegida
    // (`pedirVersion`) y pide las vistas de AutoCAD de los DWG (`pedirVistas`,
    // ver routes/docs_cad.py); lo que se fija sigue igual: `verificar: true`
    // SOLO en el reintento.
    assert.match(cad, /JSON\.stringify\(\{ node_id: file\.id, \.\.\.pedirVersion\(\), \.\.\.pedirVistas\(\), \.\.\.\(verificar \? \{ verificar: true \} : \{\}\) \}\)/);
    assert.match(cad, /d\.origen === 'guardado' && !verificar\s+\? \(\) => arrancar\(\{ verificar: true \}\) : null/);
    assert.match(cad, /if \(siNoAbre\) \{\s+try \{ viewer\.finish\(\); \}/, 'el visor fallido se retira antes de reintentar');
});

console.log(JSON.stringify({ banco: 'aperturaSinRepetir', pass, fail }));
if (fail) process.exit(1);
