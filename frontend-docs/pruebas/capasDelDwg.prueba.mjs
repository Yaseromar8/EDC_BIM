// Banco de las CAPAS APAGADAS DEL DWG en las vistas 2D del visor de planos.
//
// Lo que fija (medido el 21-sep-2026 en produccion con
// 500125-CSSP001-780-XX-DR-HD-011220011222): el espacio modelo trae el estado de
// capas «Initial» del DWG y el visor lo aplica solo; las PRESENTACIONES no lo
// traen y salian con todas las capas encendidas, entre ellas las dos que pintan
// las lineas rosas gruesas (POLIGONO_INTERVENCION y ESTRUC. PROYECTADAS PQ5).
// Ahora la lista del espacio modelo manda en todas las vistas 2D.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { visiblesDelDwg, capasQueApagar } from '../src/utils/capasDelDwg.js';

let pass = 0, fail = 0;
async function test(name, fn) {
    try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
    catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}
const aqui = dirname(fileURLToPath(import.meta.url));
const fuente = (rel) => readFileSync(join(aqui, '..', 'src', rel), 'utf8');

// Como lo entrega Autodesk en el espacio modelo (forma medida).
const MODELO = {
    layers: { 1: { name: 'C-ROAD-TEXT' }, 2: { name: 'P-PIPE' }, 3: { name: 'POLIGONO_INTERVENCION' } },
    layer_states: [{ name: 'Initial', hidden: true, visible_layers: ['C-ROAD-TEXT', 'P-PIPE', 'XREF GENERAL$0$CASAS TALARA', 'OVM-Marco 2'] }],
};
// Las capas de la presentacion P08-0006 que salian encendidas y no debian.
const APAGADAS_EN_EL_DWG = ['_block', '_MANZANAS', 'ESTRUC. PROYECTADAS PQ5', 'POLIGONO_INTERVENCION', 'Z_CINTA Y CERCO DE MALLA'];

await test('el estado «Initial» del espacio modelo da las capas encendidas del DWG', () => {
    assert.deepEqual(visiblesDelDwg(MODELO), ['C-ROAD-TEXT', 'P-PIPE', 'XREF GENERAL$0$CASAS TALARA', 'OVM-Marco 2']);
});

await test('una presentacion (sin estado propio) no da lista: se usa la del espacio modelo', () => {
    assert.equal(visiblesDelDwg({ layers: {}, layer_states: [] }), null);
    assert.equal(visiblesDelDwg({ layers: {} }), null);
    assert.equal(visiblesDelDwg(null), null);
});

await test('se apagan justo las que el DWG tiene apagadas, y nada mas', () => {
    const visibles = ['C-ROAD-TEXT', 'P-PIPE', 'XREF GENERAL$0$CASAS TALARA', 'OVM-Marco 2'];
    const deLaPresentacion = ['C-ROAD-TEXT', 'P-PIPE', 'XREF GENERAL$0$CASAS TALARA', 'OVM-Marco 2', ...APAGADAS_EN_EL_DWG];
    assert.deepEqual(capasQueApagar(deLaPresentacion, visibles), APAGADAS_EN_EL_DWG);
});

await test('sin lista del DWG no se apaga nada: mejor verlo todo que no ver nada', () => {
    assert.deepEqual(capasQueApagar(['A', 'B'], null), []);
    assert.equal(visiblesDelDwg({ layer_states: [{ name: 'Initial', visible_layers: [] }] }), null);
    assert.equal(visiblesDelDwg({ layer_states: [{ name: 'Otro', visible_layers: ['A'] }] }), null);
});

await test('el visor lo aplica al abrir y al cambiar de vista, y lo olvida al cambiar de documento', () => {
    const src = fuente('components/CadViewer.jsx');
    assert.match(src, /aplicarCapasDelDwg\(viewer, visiblesDelDwgRef\);\s+setPhase\('listo'\);/);
    assert.match(src, /viewer\.loadDocumentNode\(doc, node\)\.then\(\(\) => aplicarCapasDelDwg\(viewer, visiblesDelDwgRef\)\);/);
    assert.match(src, /documentoRef\.current = doc;\s+visiblesDelDwgRef\.current = null;/);
});

console.log(JSON.stringify({ banco: 'capasDelDwg', pass, fail }));
if (fail) process.exit(1);
