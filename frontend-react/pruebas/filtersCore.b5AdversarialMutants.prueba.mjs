/**
 * Mutante de la revisión final B5.
 * Ejecutar: node frontend-react/pruebas/filtersCore.b5AdversarialMutants.prueba.mjs
 *
 * Restaura la retirada anterior —soltar el modelo sin retirarle el color— y
 * comprueba que el oráculo nuevo lo mata. Producto sano: PASS. Mutante: FAIL
 * contra el MISMO oráculo, sin tocar el oráculo. La mutación es en memoria;
 * ningún fichero de producción se modifica.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeRuntimeFixture } from './filtersRuntime/fixture.mjs';

const driverUrl = new URL('../src/lib/filterVisualDriver.js', import.meta.url);
const coreUrl = new URL('../src/lib/filtersCore.js', import.meta.url);
const { calculateFilterResult } = await import(coreUrl.href);

async function cargar(mutacion) {
    let fuente = readFileSync(driverUrl, 'utf8').replace(/\r\n/g, '\n');
    if (mutacion) {
        assert.equal(fuente.split(mutacion[0]).length, 2, 'ancla de mutación no única');
        fuente = fuente.replace(...mutacion);
    }
    fuente = fuente.replace(/from\s+(['"])(\.[^'"]+)\1/g,
        (_a, _q, ruta) => 'from ' + JSON.stringify(new URL(ruta, driverUrl).href));
    return import('data:text/javascript;base64,' + Buffer.from(fuente).toString('base64'));
}

// El oráculo es idéntico al caso A4 del banco adversarial: un modelo que sale de
// `models()` sin descargarse no puede conservar tinte que nadie pueda limpiar.
async function oraculo(modulo) {
    const f = makeRuntimeFixture({ count: 4, sources: ['m1', 'm2'] });
    f.state.filterColors = { 'G::Estado': true };
    const result = calculateFilterResult(f.state, f.snapshot(), 1);
    const driver = modulo.createFilterVisualDriver({ viewer: f.viewer, models: () => f.models,
        window: f.host, yieldFrame: async () => {} });
    await driver.apply(result, f.state, () => true);
    const retirado = f.models[0], vivo = f.models[1];
    assert.ok(retirado.colors.size > 0, 'precondición: el modelo está pintado');
    f.models.splice(0, 1);
    driver.syncModels();
    try {
        assert.equal(retirado.colors.size, 0, 'el modelo retirado conserva tinte sin dueño');
        assert.equal(vivo.colors.size, 4, 'retirar uno despinta al que sigue vivo');
    } finally { driver.dispose(); }
}

const MARCADOR = [
    '            if (painted.has(model)) {',
    '                try { owned(() => originalClear.call(viewer,model)); } catch { /* modelo ya descargado */ }',
    '            }',
].join('\n');

const mutaciones = [
    { id: 'retire-without-clearing-own-color',
      oraculo: 'un modelo retirado no conserva tinte de Filters',
      mutacion: [MARCADOR, '            /* se suelta la propiedad sin retirar el color */'] },
];

const resultados = [];
for (const m of mutaciones) {
    let sano = 'PASS', errorSano = null;
    try { await oraculo(await cargar()); } catch (e) { sano = 'FAIL'; errorSano = e.message; }
    let roto = 'PASS', errorRoto = null;
    try { await oraculo(await cargar(m.mutacion)); } catch (e) { roto = 'FAIL'; errorRoto = e; }
    const muerto = sano === 'PASS' && roto === 'FAIL' && errorRoto instanceof assert.AssertionError;
    resultados.push({ mutacion: m.id, oraculo: m.oraculo, productoSano: sano, mutante: roto, muerto,
        errorSano, fallaPor: errorRoto?.message?.split('\n')[0] });
}
const muertos = resultados.filter(r => r.muerto).length;
console.log(JSON.stringify({ suite: 'filtersCore.b5AdversarialMutants', total: mutaciones.length, muertos,
    supervivientes: mutaciones.length - muertos, resultados,
    limits: 'Mutación en memoria del driver; ningún fichero de producción se altera. El fallo debe ser del oráculo, no de importación.' }, null, 2));
assert.ok(resultados.every(r => r.muerto), 'un mutante sobrevivió al oráculo sano');
