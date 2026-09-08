/**
 * B3 — revisión adversarial independiente.
 *
 *     node frontend-react/pruebas/filtersCore.b3Adversarial.prueba.mjs
 *
 * Ataca los seams que el banco de runtime no cubre: ciclo de vida con remount,
 * el popout con dbId repetido entre Sources, la propiedad de la máscara visual
 * frente a un objectSet ajeno, y qué queda pintado tras `dispose`.
 *
 * Módulos REALES: controlador, motor, driver y bridge de producción. Lo que es
 * doble es el visor y el DOM del popup. Sin navegador, sin GPU, sin backend.
 */
import assert from 'node:assert/strict';
import { mountFiltersRuntime } from '../src/lib/filterRuntimeBridge.js';
import { createFilterVisualDriver } from '../src/lib/filterVisualDriver.js';
import { openInventoryFilterPopout } from '../src/lib/inventoryFilterPopout.js';
import { viewerElementKey } from '../src/lib/filtersCore.js';
import { markInventoryRevision } from '../src/lib/inventoryIdentity.js';
import { makeRuntimeFixture, microtasks, tick } from './filtersRuntime/fixture.mjs';

const totals = { pass: 0, fail: 0 };
const casos = [];
async function check(name, fn) {
    try { const extra = await fn(); totals.pass++; casos.push({ name, status: 'PASS', ...(extra || {}) }); }
    catch (error) { totals.fail++; casos.push({ name, status: 'FAIL', error: error.message }); }
}

const montar = (fixture, extra = {}) => mountFiltersRuntime({
    host: fixture.host, viewer: fixture.viewer,
    getIntent: () => fixture.state,
    models: () => fixture.models,
    ready: () => true, ...extra,
});

// ── 1 · Remount: ninguna revisión del runtime anterior puede volver ─────────
await check('remount: la revisión del runtime anterior no vuelve a publicarse', async () => {
    const f = makeRuntimeFixture();
    const primero = montar(f);
    await microtasks();
    const revisionVieja = f.host.__filterResult.revision;
    primero.dispose();
    const segundo = montar(f);
    await microtasks();
    const revisionNueva = f.host.__filterResult.revision;
    assert.ok(revisionNueva > revisionVieja, 'la revisión no es monótona entre montajes');
    // El controlador viejo ya no puede publicar aunque alguien lo empuje.
    primero.request({ filterSelections: { 'G::Estado': ['Ejecutado'] } });
    await microtasks();
    assert.equal(f.host.__filterResult.revision, revisionNueva, 'un runtime dispuesto publicó');
    // Y el nuevo sigue vivo: un evento del bus lo recalcula.
    f.host.dispatchEvent(new CustomEvent('recalculate-filters', { detail: undefined }));
    await microtasks();
    assert.ok(f.host.__filterResult.revision > revisionNueva, 'el runtime nuevo quedó sordo');
    segundo.dispose();
    return { revisionVieja, revisionNueva };
});

// ── 2 · Un solo runtime: un evento produce un cálculo, no dos ──────────────
await check('un evento del bus produce exactamente un cálculo', async () => {
    const f = makeRuntimeFixture();
    const runtime = montar(f);
    await microtasks();
    const antes = runtime.controller.metrics.computed;
    f.host.dispatchEvent(new CustomEvent('recalculate-filters', { detail: undefined }));
    await microtasks();
    const despues = runtime.controller.metrics.computed;
    assert.equal(despues - antes, 1, 'el bus disparó ' + (despues - antes) + ' cálculos');
    runtime.dispose();
    return { calculos: despues - antes };
});

// ── 3 · El dispose del runtime desengancha: el bus deja de moverlo ─────────
await check('tras dispose, ningún evento del bus recalcula ni aplica', async () => {
    const f = makeRuntimeFixture();
    const runtime = montar(f);
    await microtasks();
    runtime.dispose();
    const calculos = runtime.controller.metrics.computed;
    const llamadas = f.calls.length;
    for (const nombre of ['recalculate-filters', 'inventory-ready', 'rosetta-ready',
                          'viewer-model-loaded', 'filters-reset-all', 'ecd-frente-reset']) {
        f.host.dispatchEvent(new CustomEvent(nombre, { detail: undefined }));
    }
    await microtasks(); await tick();
    assert.equal(runtime.controller.metrics.computed, calculos, 'recalculó tras dispose');
    assert.equal(f.calls.length, llamadas, 'tocó el visor tras dispose');
    return { calculos };
});

// ── 4 · Propiedad visual: un objectSet ajeno sobrevive a «limpiar filtros» ──
await check('clear devuelve el aislamiento ajeno, no una pantalla completa', async () => {
    const f = makeRuntimeFixture();
    // Estado previo que NO es de Filters: una Saved View dejó aislados 1 y 2.
    f.models[0].isolated = [1, 2];
    const runtime = montar(f);
    await microtasks();
    f.host.dispatchEvent(new CustomEvent('isolate-property-bucket',
        { detail: { propId: 'G::Estado', values: ['Ejecutado'] } }));
    await microtasks(); await tick();
    const conFiltro = [...f.models[0].isolated];
    f.host.dispatchEvent(new CustomEvent('filters-reset-all', { detail: {} }));
    await microtasks(); await tick();
    assert.deepEqual([...f.models[0].isolated].sort(), [1, 2],
        'clear no devolvió el objectSet ajeno: ' + JSON.stringify(f.models[0].isolated));
    assert.notDeepEqual(conFiltro, [], 'el filtro no llegó a aislar nada');
    runtime.dispose();
    return { conFiltro, restaurado: [...f.models[0].isolated] };
});

// ── 5 · El popout no resalta el elemento de otra Source ────────────────────
function popupDoble(host) {
    const listeners = new Map();
    const nodo = () => ({ children: [], style: {}, dataset: {}, textContent: '',
        setAttribute() {},
        append(...hijos) { for (const h of hijos) this.children.push(...(h?.esFragmento ? h.children : [h])); },
        replaceChildren(...hijos) { this.children = hijos; },
        addEventListener(tipo, fn) { (listeners.get(this) || listeners.set(this, []).get(this)).push([tipo, fn]); this._click = fn; },
        scrollIntoView() {} });
    const doc = { open() {}, close() {}, write() {}, createElement: () => nodo(),
        createDocumentFragment: () => ({ esFragmento: true, children: [], append(...h) { this.children.push(...h); } }),
        body: nodo() };

    const popup = { closed: false, document: doc, addEventListener() {}, removeEventListener() {},
        close() { this.closed = true; }, opener: null };
    host.open = () => popup;
    host.alert = () => {};
    host.location = { origin: 'http://local' };
    return popup;
}

await check('popout: mismo dbId en dos Sources no resalta el ajeno', async () => {
    const f = makeRuntimeFixture({ count: 2, sources: ['m1', 'm2'] });
    popupDoble(f.host);
    const runtime = montar(f);
    await microtasks();
    const resultado = f.host.__filterResult;
    assert.equal(resultado.status, 'ready');
    // El mismo dbId existe en las dos Sources: es el escenario del defecto.
    const porDbId = resultado.matches.filter(m => m.dbId === 1);
    assert.equal(porDbId.length, 2, 'el fixture no reproduce el dbId compartido');
    assert.notEqual(porDbId[0].modelUrn, porDbId[1].modelUrn);
    assert.notEqual(viewerElementKey(porDbId[0].modelUrn, 1), viewerElementKey(porDbId[1].modelUrn, 1),
        'la clave del popout no distingue Sources');
    openInventoryFilterPopout({ host: f.host, scopeId: 'front',
        columns: [{ header: 'Id', key: 'dbId' }], assetsOnly: false, selection: null });
    const deM1 = resultado.matches.find(m => m.modelUrn === 'm1' && m.dbId === 1);
    assert.ok(deM1, 'DIAGNOSTICO matches=' + JSON.stringify(resultado.matches.map(m => [m.modelUrn, m.dbId])));
    f.host.dispatchEvent(new CustomEvent('inventory-highlight-row', { detail: { urn: 'm1', dbId: 1 } }));
    const todasLasFilas = () => {
        const salida = [];
        const recorrer = nodo => { salida.push(nodo); for (const hijo of nodo.children || []) recorrer(hijo); };
        recorrer(f.host.__inventoryPopup.document.body);
        return salida.filter(nodo => nodo.dataset?.rowKey);
    };
    const resaltadas = () => todasLasFilas().filter(fila => fila.style?.background === '#2a4a8a');
    const filas = resaltadas();
    assert.equal(filas.length <= 1, true, 'se resaltó más de una fila');
    if (filas.length === 1) assert.equal(filas[0].dataset.rowKey, deM1.rowKey,
        'se resaltó la fila de otra Source');
    runtime.dispose();
    return { coincidenciasConEseDbId: 2, filasResaltadas: filas.length };
});

// ── 6 · Qué queda pintado tras dispose del driver ──────────────────────────
await check('dispose del driver no deja color propio sin dueño', async () => {
    const f = makeRuntimeFixture();
    const runtime = montar(f);
    await microtasks();
    f.host.dispatchEvent(new CustomEvent('theme-property-bucket',
        { detail: { propId: 'G::Estado', active: true } }));
    await microtasks(); await tick(); await microtasks();
    const pintados = f.models.filter(m => m.colors.size > 0).length;
    assert.ok(pintados > 0, 'el fixture no llegó a pintar nada');
    runtime.dispose();
    await microtasks(); await tick();
    const quedan = f.models.filter(m => m.colors.size > 0).length;
    assert.equal(quedan, 0,
        'tras dispose quedan ' + quedan + ' modelo(s) con color de Filters y sin dueño que lo pueda quitar');
    return { pintadosAntes: pintados };
});

// ── 7 · Edición en sitio: la intención se conserva y el universo cambia ────
await check('live edit sin detail conserva la intención y ve el dato nuevo', async () => {
    const f = makeRuntimeFixture();
    const runtime = montar(f);
    await microtasks();
    f.host.dispatchEvent(new CustomEvent('isolate-property-bucket',
        { detail: { propId: 'G::Estado', values: ['Ejecutado'] } }));
    await microtasks();
    const antes = f.host.__filterResult;
    const intencion = JSON.stringify(runtime.controller.getState().filterSelections);
    // Edición en sitio: misma referencia de array, revisión declarada.
    f.host.postgresInventory[1]['G::Estado'] = 'Ejecutado';
    markInventoryRevision();
    f.host.dispatchEvent(new CustomEvent('recalculate-filters', { detail: undefined }));
    await microtasks();
    const despues = f.host.__filterResult;
    assert.equal(JSON.stringify(runtime.controller.getState().filterSelections), intencion,
        'la intención se perdió o se vació');
    assert.equal(despues.status, 'ready');
    assert.ok(despues.matches.length > antes.matches.length,
        'la edición en sitio no cambió el resultado: ' + antes.matches.length + ' -> ' + despues.matches.length);
    runtime.dispose();
    return { antes: antes.matches.length, despues: despues.matches.length };
});

for (const caso of casos) console.log(JSON.stringify(caso));
console.log(JSON.stringify({ suite: 'filtersCore.b3Adversarial', ...totals,
    limits: 'Módulos de producción con dobles de visor y DOM; sin navegador, GPU ni backend.' }));
process.exitCode = totals.fail ? 1 : 0;
