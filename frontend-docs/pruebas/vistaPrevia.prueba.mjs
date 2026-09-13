// Banco de regresion de la VISTA PREVIA POR VERSION.
//
// Lo que fija: abrir un documento por su version no le cambia el nombre, y los
// consumidores compartidos del hook siguen recibiendo nombre y version por
// separado. El defecto que lo motiva: «DOC-OK3.pdf · v1» dejaba de acabar en
// .pdf y el visor rapido decia «Sin vista previa para este formato» a un PDF
// valido (desde b671559).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { previsualizacion, etiquetaDeVersion, tipoDeVista } from '../src/utils/vistaPrevia.js';

let pass = 0, fail = 0;
async function test(name, fn) {
    try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
    catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}

const aqui = dirname(fileURLToPath(import.meta.url));
const fuente = (rel) => readFileSync(join(aqui, '..', 'src', rel), 'utf8');

await test('una version fijada no cambia el nombre ni su extension', () => {
    const p = previsualizacion({ node_id: 'n1', name: 'DOC-OK3.pdf', version: 1, version_id: 'v1' },
                               'https://firmada');
    assert.equal(p.name, 'DOC-OK3.pdf');
    assert.equal(p.versionLabel, 'v1');
    assert.equal(p.url, 'https://firmada');
    assert.equal(p.nodeId, 'n1');
    assert.equal(tipoDeVista(p.name), 'pdf');
});

await test('version_number manda sobre version al etiquetar', () => {
    assert.equal(etiquetaDeVersion({ version_id: 'x', version_number: 4, version: 1 }), 'v4');
});

await test('sin version fijada: el nombre intacto y la etiqueta dice version actual', () => {
    const p = previsualizacion({ node_id: 'n2', name: 'Plano.PDF' }, 'u');
    assert.equal(p.name, 'Plano.PDF');
    assert.equal(p.versionLabel, 'versión actual');
    assert.equal(tipoDeVista(p.name), 'pdf');
});

await test('el nombre del defecto ya no se produce, y por eso fallaba', () => {
    const p = previsualizacion({ name: 'DOC-OK3.pdf', version: 1, version_id: 'v' }, 'u');
    assert.notEqual(p.name, 'DOC-OK3.pdf · v1');
    assert.equal(tipoDeVista('DOC-OK3.pdf · v1'), null);
});

await test('imagenes y videos se siguen reconociendo; lo demas no', () => {
    assert.equal(tipoDeVista('foto.JPG'), 'imagen');
    assert.equal(tipoDeVista('recorrido.mp4'), 'video');
    assert.equal(tipoDeVista('modelo.rvt'), null);
});

await test('el hook entrega el objeto de la funcion compartida', () => {
    const s = fuente('hooks/useDocPreview.js');
    assert.match(s, /previsualizacion\(/);
    assert.doesNotMatch(s, /name:\s*\(it\.name \|\| ''\)\s*\+/);
});

await test('el visor rapido decide por el nombre y toma la etiqueta del fichero', () => {
    const s = fuente('components/DocQuickView.jsx');
    assert.match(s, /tipoDeVista\(file\.name\)/);
    assert.match(s, /file\.versionLabel/);
});

await test('Revisiones y Conjuntos pasan el fichero entero al visor rapido', () => {
    // En Revisiones, la vista previa vive en el detalle de la revision (E1).
    for (const rel of ['components/RevisionDetalle.jsx', 'components/SetsModule.jsx']) {
        assert.match(fuente(rel), /<DocQuickView file=\{preview\}/, rel);
    }
});

await test('la busqueda global sigue ensenando la version junto al nombre', () => {
    const s = fuente('components/BusquedaGlobalModule.jsx');
    assert.match(s, /preview\.versionLabel/);
});

console.log(JSON.stringify({ banco: 'vistaPrevia', pass, fail }));
process.exit(fail ? 1 : 0);
