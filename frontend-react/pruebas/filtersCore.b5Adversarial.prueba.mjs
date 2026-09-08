/**
 * B5 · banco adversarial de la revisión final.
 * Ejecutar: node frontend-react/pruebas/filtersCore.b5Adversarial.prueba.mjs
 *
 * Ataca lo que `b5Lifecycle` y `b5Mutants` no alcanzan: el color de un modelo
 * retirado, la retirada de un modelo ya descargado, y el caso REAL de dos
 * runtimes vivos —el banco existente sólo ejercita el doble dispose, que sale
 * por la guarda de idempotencia sin llegar a comparar dueños—.
 * Módulos de producción reales; dobles sólo de visor. Sin navegador, React DOM,
 * LMV/GPU, DB ni red.
 */
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { createFilterVisualDriver } from '../src/lib/filterVisualDriver.js';
import { calculateFilterResult } from '../src/lib/filtersCore.js';
import { mountFiltersRuntime } from '../src/lib/filterRuntimeBridge.js';
import { makeRuntimeFixture, microtasks, tick } from './filtersRuntime/fixture.mjs';

const cases = [];
const test = async (name, fn) => {
    try { await fn(); cases.push({ name, status: 'PASS' }); }
    catch (error) { cases.push({ name, status: 'FAIL', error: error.message }); }
};
const pintado = async (over = {}) => {
    const f = makeRuntimeFixture({ count: 4, sources: ['m1', 'm2'], ...over });
    f.state.filterColors = { 'G::Estado': true };
    const result = calculateFilterResult(f.state, f.snapshot(), 1);
    const driver = createFilterVisualDriver({ viewer: f.viewer, models: () => f.models,
        window: f.host, yieldFrame: async () => {} });
    await driver.apply(result, f.state, () => true);
    return { f, driver, result };
};

// ── ATAQUE 4 · un modelo retirado no puede conservar tinte de Filters ────────
await test('A4 · retirar un modelo vivo le quita el color propio antes de soltarlo', async () => {
    const { f, driver } = await pintado();
    const retirado = f.models[0], vivo = f.models[1];
    assert.ok(retirado.colors.size > 0 && vivo.colors.size > 0, 'precondición: los dos pintados');
    f.models.splice(0, 1);              // sale de models() sin descargarse del visor
    driver.syncModels();
    assert.equal(retirado.colors.size, 0, 'el modelo retirado conserva tinte que nadie puede limpiar');
    assert.equal(vivo.colors.size, 4, 'retirar uno no puede despintar al que sigue vivo');
    driver.dispose();
    assert.equal(retirado.colors.size, 0);
    assert.equal(vivo.colors.size, 0);
});
await test('A4 · el driver siguiente arranca sin heredar tinte del anterior', async () => {
    const { f, driver } = await pintado();
    const retirado = f.models[0];
    f.models.splice(0, 1);
    driver.syncModels();
    driver.dispose();
    // Un driver nuevo tiene `painted` vacío: si el anterior dejó color, es eterno.
    const nuevo = createFilterVisualDriver({ viewer: f.viewer, models: () => f.models,
        window: f.host, yieldFrame: async () => {} });
    nuevo.dispose();
    assert.equal(retirado.colors.size, 0, 'queda tinte que ningún driver posterior puede retirar');
});
await test('A4 · un modelo ya descargado no aborta el barrido de los demás', async () => {
    const { f, driver } = await pintado({ sources: ['m1', 'm2', 'm3'] });
    const muerto = f.models[0], acompanante = f.models[1], vivo = f.models[2];
    assert.ok(muerto.colors.size && acompanante.colors.size && vivo.colors.size, 'precondición: los tres pintados');
    const clearReal = f.viewer.clearThemingColors;
    // El visor se comporta como LMV con una instancia ya destruida.
    f.viewer.clearThemingColors = m => {
        if (m === muerto) throw new Error('model is not loaded');
        return clearReal.call(f.viewer, m);
    };
    f.models.splice(0, 2);                                 // se retiran el muerto Y su acompañante
    driver.syncModels();                                   // no debe propagar la excepción
    assert.equal(acompanante.colors.size, 0, 'la excepción de un modelo aborta el barrido del siguiente');
    for (const m of [muerto, acompanante]) assert.ok(!String(m.setThemingColor).includes('externalColor'),
        'un modelo retirado se queda con el gancho del driver puesto');
    assert.equal(typeof muerto.setThemingColor, 'function', 'el modelo retirado queda sin método utilizable');
    f.viewer.clearThemingColors = clearReal;
    driver.dispose();
    assert.equal(vivo.colors.size, 0, 'el dispose posterior ya no limpia al que sigue vivo');
});
await test('A4 · un modelo retirado no reclama la propiedad del color', async () => {
    const { f, driver } = await pintado();
    const retirado = f.models[0];
    let avisos = 0;
    const d2 = createFilterVisualDriver({ viewer: f.viewer, models: () => f.models,
        window: f.host, onExternal: () => avisos++, yieldFrame: async () => {} });
    f.models.splice(0, 1);
    d2.syncModels();
    retirado.setThemingColor(99, { x: 1 });                // escritura tardía del retirado
    assert.equal(avisos, 0, 'un modelo retirado sigue pudiendo declarar dueño externo');
    driver.dispose(); d2.dispose();
});

// ── ATAQUE 4 · dos runtimes vivos de verdad, no un doble dispose ─────────────
await test('A4 · el runtime viejo no borra el resultado ni los espejos del nuevo', async () => {
    const f = makeRuntimeFixture({ count: 3 });
    const montar = () => mountFiltersRuntime({ host: f.host, viewer: f.viewer,
        getIntent: () => f.state, models: () => f.models, ready: () => true });
    const a = montar(); await microtasks();
    const b = montar(); await microtasks();               // dueño nuevo, mismo scope
    const suyo = f.host.__filterResult;
    const buckets = f.host._lastCalculatedBuckets, ids = f.host._lastValidDbIds;
    assert.ok(suyo && suyo.status === 'ready', 'precondición: el nuevo publicó un resultado');
    a.dispose();                                          // PRIMER dispose del viejo
    assert.equal(f.host.__filterResult, suyo, 'el runtime viejo borró el resultado del nuevo');
    assert.equal(f.host._lastCalculatedBuckets, buckets, 'el viejo borró las facetas del nuevo');
    assert.equal(f.host._lastValidDbIds, ids, 'el viejo borró la membresía del nuevo');
    assert.equal(f.host._lastHasActiveFilters, suyo.hasActivePredicates);
    b.dispose();
    assert.equal(f.host.__filterResult, null, 'el dueño real sí debe limpiar al soltar');
});
await test('A4 · veinte pares solapados no acumulan oyentes ni resultados huérfanos', async () => {
    const f = makeRuntimeFixture({ count: 3 });
    const nombres = ['recalculate-filters', 'inventory-ready', 'rosetta-ready', 'viewer-model-loaded', 'ecd-frente-reset'];
    const oyentes = () => nombres.map(n => getEventListeners(f.host, n).length);
    const base = oyentes();
    const montar = () => mountFiltersRuntime({ host: f.host, viewer: f.viewer,
        getIntent: () => f.state, models: () => f.models, ready: () => true });
    for (let i = 0; i < 20; i++) {
        const viejo = montar(); await microtasks();
        const nuevo = montar(); await microtasks();
        viejo.dispose(); viejo.dispose();                 // idempotencia
        assert.ok(f.host.__filterResult, 'ciclo ' + i + ': el solape dejó al host sin resultado');
        nuevo.dispose();
    }
    assert.deepEqual(oyentes(), base, 'los oyentes se acumulan tras 40 montajes');
    assert.equal(f.host.__filterResult, null);
});

// ── ATAQUE 5 · nada tardío sobrevive al cambio ──────────────────────────────
await test('A5 · recarga de Source en pleno lote de color no deja trabajo tardío', async () => {
    const f = makeRuntimeFixture({ count: 200, sources: ['m1', 'm2'] });
    f.state.filterColors = { 'G::Estado': true };
    const result = calculateFilterResult(f.state, f.snapshot(), 1);
    let vuelta = 0;
    const driver = createFilterVisualDriver({ viewer: f.viewer, models: () => f.models, window: f.host,
        yieldFrame: async () => { if (++vuelta === 1) { f.models.splice(0, 1); driver.syncModels(); } } });
    const salida = await driver.apply(result, f.state, () => true);
    assert.equal(salida.paused, true, 'retirar una Source a media aplicación no cancela el trabajo en vuelo');
    assert.equal(salida.reason, 'superseded');
    driver.dispose();
    for (const m of f.models) assert.equal(m.colors.size, 0, 'queda color tras el dispose');
});
await test('A5 · syncModels sobre un driver dispuesto es inerte', async () => {
    const { f, driver } = await pintado();
    driver.dispose();
    const antes = f.models.map(m => m.colors.size);
    f.models.splice(0, 1);
    driver.syncModels();
    assert.deepEqual(f.models.map(m => m.colors.size), antes.slice(1), 'un driver dispuesto sigue actuando');
});

const pass = cases.filter(c => c.status === 'PASS').length;
const fail = cases.filter(c => c.status === 'FAIL').length;
console.log(JSON.stringify({ suite: 'filtersCore.b5Adversarial', pass, fail, cases,
    limits: 'Driver/controlador/puente reales con visor y modelos simulados; sin navegador, React DOM, LMV/GPU, DB ni red.' }, null, 2));
process.exitCode = fail ? 1 : 0;
