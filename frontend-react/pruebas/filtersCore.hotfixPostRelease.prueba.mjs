// Banco de regresion del HOTFIX POST-RELEASE.
//
//   B · la caché de facetas dejo de exigir la MISMA referencia de rosetta.
//   D · apagar el coloreo por Source libera el control visual.
//
// Ver docs/filters/HOTFIX_POST_RELEASE.md para las mediciones que motivaron
// cada uno. Aqui solo se fija la conducta, no el tiempo.
import assert from 'node:assert/strict';
import { calculateBucketsFromPostgres } from '../src/aps/utils/model.js';
import { mountFiltersRuntime } from '../src/lib/filterRuntimeBridge.js';
import { calculateFilterResult } from '../src/lib/filtersCore.js';
import { makeRuntimeFixture, microtasks, tick } from './filtersRuntime/fixture.mjs';

let pass = 0, fail = 0;
async function test(name, fn) {
    try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
    catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}

// ── B · CACHE DE FACETAS ─────────────────────────────────────────────────────
// El índice guarda una COPIA de los valores de cada fila, así que una fila
// mutada en sitio solo se ve si el índice se reconstruyó. Ese es el testigo.
const PROPS = ['G::Tipo'];
const filasDe = () => [
    { dbId: 'e0', source_urn: 'm1', 'G::Tipo': 'A' },
    { dbId: 'e1', source_urn: 'm1', 'G::Tipo': 'B' },
];
const rosettaDe = () => ({ m1: { e0: 1, e1: 2 } });
const valores = (r) => (r.buckets?.['G::Tipo']?.values || []).map(v => v.value).sort().join('|');

await test('B · una rosetta CLONADA no reconstruye el indice (la referencia ya no manda)', () => {
    const filas = filasDe(), rosetta = rosettaDe();
    const primero = calculateBucketsFromPostgres(filas, PROPS, {}, rosetta, [], 7001);
    // Mutar EN SITIO sin tocar la revision: si el indice se reutiliza, no se ve.
    filas[0]['G::Tipo'] = 'MUTADO';
    const segundo = calculateBucketsFromPostgres(filas, PROPS, {}, structuredClone(rosetta), [], 7001);
    assert.equal(valores(segundo), valores(primero),
        'un clon de rosetta con el mismo contenido invalidó la caché: vuelve el clic de 1,5 s');
    assert.ok(!valores(segundo).includes('MUTADO'));
});

await test('B · una rosetta MUTADA en sitio SI reconstruye el indice (la huella sigue mandando)', () => {
    const filas = filasDe(), rosetta = rosettaDe();
    const primero = calculateBucketsFromPostgres(filas, PROPS, {}, rosetta, [], 7002);
    assert.equal(valores(primero), 'A|B');
    // Llega un modelo tardio: la rosetta se muta EN EL MISMO OBJETO, como hace
    // Viewer.jsx al terminar de indexar cada modelo.
    filas.push({ dbId: 'e9', source_urn: 'm2', 'G::Tipo': 'C' });
    rosetta.m2 = { e9: 9 };
    const segundo = calculateBucketsFromPostgres(filas, PROPS, {}, rosetta, [], 7002);
    assert.ok(valores(segundo).includes('C'),
        'el elemento del modelo tardío no entró: la huella de contenido dejó de proteger');
});

await test('B · cambiar la revision del dataset sigue invalidando', () => {
    const filas = filasDe(), rosetta = rosettaDe();
    calculateBucketsFromPostgres(filas, PROPS, {}, rosetta, [], 7003);
    filas[0]['G::Tipo'] = 'NUEVO';
    const segundo = calculateBucketsFromPostgres(filas, PROPS, {}, rosetta, [], 7004);
    assert.ok(valores(segundo).includes('NUEVO'));
});

// ── D · PROPIEDAD DEL CONTROL VISUAL ─────────────────────────────────────────
const pintarComoSources = (f, encendido) => {
    f.host.__ecdSourceColorOn = encendido;
    f.host.__ecdTintApplying = true;
    f.viewer.clearThemingColors(f.models[0]);
    f.host.__ecdTintApplying = false;
};
const ultimoProgreso = f => [...f.events].reverse().find(e => e.name === 'filter-progress')?.detail;

await test('D · encender el coloreo por Source declara dueño (no se pierde la pausa real)', async () => {
    const f = makeRuntimeFixture();
    const runtime = mountFiltersRuntime({ host: f.host, viewer: f.viewer, getIntent: () => f.state, models: () => f.models, ready: () => true });
    await microtasks(); await tick();
    pintarComoSources(f, true);
    await microtasks(); await tick();
    const p = ultimoProgreso(f);
    assert.equal(p.phase, 'paused');
    assert.equal(p.owner, 'sources');
    runtime.dispose?.();
});

await test('D · apagar el coloreo por Source libera el control visual', async () => {
    const f = makeRuntimeFixture();
    const runtime = mountFiltersRuntime({ host: f.host, viewer: f.viewer, getIntent: () => f.state, models: () => f.models, ready: () => true });
    await microtasks(); await tick();
    pintarComoSources(f, true);
    await microtasks(); await tick();
    assert.equal(ultimoProgreso(f).owner, 'sources');

    pintarComoSources(f, false);
    await microtasks(); await tick();
    const p = ultimoProgreso(f);
    assert.notEqual(p.owner, 'sources',
        'la línea de estado sigue diciendo «Control visual: sources» con el coloreo apagado');
    assert.equal(p.phase, 'visually-applied');
    runtime.dispose?.();
});

await test('D · un coloreo ajeno que NO es Sources sigue pausando', async () => {
    const f = makeRuntimeFixture();
    const runtime = mountFiltersRuntime({ host: f.host, viewer: f.viewer, getIntent: () => f.state, models: () => f.models, ready: () => true });
    await microtasks(); await tick();
    f.host.__ecdSourceColorOn = false;           // no es el sistema de Sources
    f.viewer.setThemingColor(1, { externo: true }, f.models[0]);
    await microtasks(); await tick();
    const p = ultimoProgreso(f);
    assert.equal(p.phase, 'paused');
    assert.equal(p.owner, 'external-tool');
    runtime.dispose?.();
});

// ── A · MARCADO INICIAL ──────────────────────────────────────────────────────
// Sin restricción el panel se ve TODO marcado, como en baseline y como en
// Tandem. El estado lógico no cambia: `selectedValues` vacío sigue siendo
// «sin restricción» y el motor lo trata como «Virtual All».
const { componentHost, nodes, label, text, categoryExport, panelFile } = await import('./filtersCore.b4.prueba.mjs');
const categoria = (over = {}) => ({
    prop: { id: 'G::Estado', name: 'Estado' },
    bucket: { values: [{ value: 'Ejecutado', count: 3 }, { value: 'Pendiente', count: 2 }, { value: 'Vacia', count: 0 }] },
    selectedValues: [], expanded: false, searchConfig: { open: true, query: '' }, ready: true,
    customValueColors: {}, isColorActive: false, DEFAULT_VISIBLE_VALUES: 5, PALETTE: ['#7e9bbd'],
    setFacetSearch() {}, setExpandedFilters() {}, togglePropertyAll() {}, handleValueToggle() {},
    handleColorToggle() {}, handleCustomColorChange() {}, ...over,
});

await test('A · sin restriccion, todo lo que existe se ve marcado', () => {
    const ui = componentHost(panelFile, { exports: categoryExport });
    const tree = ui.render(categoria());
    for (const v of ['Ejecutado', 'Pendiente']) {
        assert.equal(label(tree, `G::Estado: ${v}`).props.checked, true,
            `el panel arranca en gris: ${v} deberia verse marcado sin restriccion`);
        assert.equal(label(tree, `G::Estado: ${v}`).props.disabled, false);
    }
    ui.dispose();
});

await test('A · un valor SIN elementos no se marca ni se habilita', () => {
    const ui = componentHost(panelFile, { exports: categoryExport });
    // Sólo se alcanza buscándolo; en la vista normal está oculto.
    const tree = ui.render(categoria({ searchConfig: { open: true, query: 'vacia' } }));
    assert.equal(label(tree, 'G::Estado: Vacia').props.checked, false);
    assert.equal(label(tree, 'G::Estado: Vacia').props.disabled, true);
    ui.dispose();
});

await test('A · con restriccion manda la seleccion, no el estado vacio', () => {
    const ui = componentHost(panelFile, { exports: categoryExport });
    const tree = ui.render(categoria({ selectedValues: ['Ejecutado'] }));
    assert.equal(label(tree, 'G::Estado: Ejecutado').props.checked, true);
    assert.equal(label(tree, 'G::Estado: Pendiente').props.checked, false);
    ui.dispose();
});

// ── A · CABECERA DE GRUPO ────────────────────────────────────────────────────
const cajas = t => nodes(t, n => typeof n.props.className === 'string' && n.props.className.includes('tandem-cb-box'));
const cuenta = t => text(nodes(t, n => n.props.className === 'tandem-group-count')[0]).replace(/\s+/g, ' ');
const titulo = t => text(nodes(t, n => n.props.className === 'tandem-group-title')[0]).trim();

await test('A · sin restriccion: cabecera VACIA, y (N of N)', () => {
    // La cabecera dice si la seleccion es EXPLICITA, no si hay elementos dentro.
    // Vacia = modo «pulsar un valor lo aisla». Marcada = modo «pulsar lo quita».
    // Sin esa diferencia visible los dos modos son indistinguibles.
    const ui = componentHost(panelFile, { exports: categoryExport });
    const tree = ui.render(categoria());
    const caja = cajas(tree)[0];
    assert.ok(!caja.props.className.includes('checked'), 'sin seleccion explicita la cabecera va vacia');
    assert.equal(cuenta(tree), '( 3 of 3 )', 'pero la cuenta sigue diciendo que esta todo incluido');
    ui.dispose();
});

await test('A · seleccion parcial: guion, azul y (1 of 3)', () => {
    const ui = componentHost(panelFile, { exports: categoryExport });
    const tree = ui.render(categoria({ selectedValues: ['Ejecutado'] }));
    const caja = cajas(tree)[0];
    assert.ok(caja.props.className.includes('active'), 'una restriccion del usuario si va en azul');
    assert.equal(nodes(caja, n => n.type === 'line').length, 1, 'guion, no palomita');
    assert.equal(cuenta(tree), '( 1 of 3 )');
    ui.dispose();
});

await test('A · pulsar la cabecera SELECCIONA TODO; volver a pulsarla lo quita', () => {
    const ui = componentHost(panelFile, { exports: categoryExport });
    let limpiados = 0, elegidos = null;
    const props = { togglePropertyAll: () => limpiados++, seleccionarTodos: (_id, v) => { elegidos = v; } };
    const boton = t => label(t, 'Seleccionar todos los valores de G::Estado');

    // Sin seleccion: selecciona todo. Este es el gesto que faltaba y que hace
    // posible el flujo de «lo tengo todo y voy quitando».
    const b1 = boton(ui.render(categoria(props)));
    assert.ok(!b1.props.disabled);
    b1.props.onClick({ stopPropagation() {} });
    assert.deepEqual(elegidos, ['Ejecutado', 'Pendiente', 'Vacia']);
    assert.equal(limpiados, 0, 'no limpia: selecciona');

    // Con todo seleccionado: limpia.
    boton(ui.render(categoria({ ...props, selectedValues: ['Ejecutado', 'Pendiente', 'Vacia'] })))
        .props.onClick({ stopPropagation() {} });
    assert.equal(limpiados, 1);
    ui.dispose();
});

await test('A · el titulo usa el nombre corto, y se cualifica solo si hay homonimo', () => {
    const ui = componentHost(panelFile, { exports: categoryExport });
    const prop = { id: 'Standard::Revit Category', name: 'Revit Category' };
    assert.equal(titulo(ui.render(categoria({ prop }))), 'Revit Category');
    assert.equal(titulo(ui.render(categoria({ prop, nombreAmbiguo: true }))), 'Standard::Revit Category');
    ui.dispose();
});

await test('A · pintar todo marcado NO desbloquea filas mientras se calcula', () => {
    const ui = componentHost(panelFile, { exports: categoryExport });
    const tree = ui.render(categoria({ ready: false }));
    const caja = label(tree, 'G::Estado: Ejecutado');
    assert.equal(caja.props.checked, true, 'sin restriccion se sigue viendo marcada');
    assert.equal(caja.props.disabled, true, 'pero pendiente de calculo NO se puede tocar');
    ui.dispose();
});

await test('A · una seleccion con valores que ya no existen sigue siendo parcial', () => {
    const ui = componentHost(panelFile, { exports: categoryExport });
    // Un refresco dejo fuera del bucket el valor elegido: `length` iguala al
    // total sin que este todo incluido. Contar habria dicho «todo».
    const tree = ui.render(categoria({
        bucket: { values: [{ value: 'Ejecutado', count: 3 }] },
        selectedValues: ['Desaparecida'],
    }));
    const caja = cajas(tree)[0];
    assert.equal(nodes(caja, n => n.type === 'line').length, 1, 'guion: la restriccion existe');
    assert.ok(caja.props.className.includes('active'), 'y es del usuario, asi que va en azul');
    ui.dispose();
});

await test('A · marcar TODOS los valores no se dibuja como «sin restriccion»', () => {
    const ui = componentHost(panelFile, { exports: categoryExport });
    const tree = ui.render(categoria({ selectedValues: ['Ejecutado', 'Pendiente', 'Vacia'] }));
    const caja = cajas(tree)[0];
    assert.equal(nodes(caja, n => n.type === 'path').length, 1, 'palomita: esta todo incluido');
    assert.ok(caja.props.className.includes('active'), 'pero lo eligio el usuario: azul, no gris');
    ui.dispose();
});

// ── SELECCION · lo que el filtro oculta no puede seguir seleccionado ─────────
// El visor pinta la seleccion POR ENCIMA del fantasma: un elemento seleccionado
// antes de filtrar se veia solido y parecia escapar del filtro.
const { createFilterVisualDriver } = await import('../src/lib/filterVisualDriver.js');
const aplicar = async (f, patch) => {
    const driver = createFilterVisualDriver({ viewer: f.viewer, models: () => f.models, window: f.host, yieldFrame: async () => {} });
    const r = calculateFilterResult({ ...f.state, ...patch }, f.snapshot(), 1);
    const salida = await driver.apply(r, { ...f.state, ...patch }, () => true);
    return { driver, r, salida };
};

await test('SEL · lo que el filtro oculta deja de estar seleccionado', async () => {
    const f = makeRuntimeFixture();
    f.models[0].seleccion = [1, 2, 3];          // 2 no sobrevive a «Ejecutado»
    const { driver, r } = await aplicar(f, { filterSelections: { 'G::Estado': ['Ejecutado'] } });
    const vivos = new Set(r.matchesByModel[0].matches.map(m => m.dbId));
    assert.ok(!vivos.has(2), 'la premisa: 2 queda fuera del resultado');
    assert.deepEqual(f.models[0].seleccion, [1, 3], 'se queda solo lo que sigue visible');
    driver.dispose();
});

await test('SEL · una seleccion que pasa el filtro NO se toca', async () => {
    const f = makeRuntimeFixture();
    f.models[0].seleccion = [1, 3];
    const { driver } = await aplicar(f, { filterSelections: { 'G::Estado': ['Ejecutado'] } });
    assert.deepEqual(f.models[0].seleccion, [1, 3]);
    assert.equal(f.calls.filter(c => c.op === 'select' || c.op === 'clearSelection').length, 0,
        'idempotente: si no sobra nada, no se escribe la seleccion');
    driver.dispose();
});

await test('SEL · sin restriccion no se poda nada', async () => {
    const f = makeRuntimeFixture();
    f.models[0].seleccion = [1, 2, 3];
    const { driver } = await aplicar(f, {});
    assert.deepEqual(f.models[0].seleccion, [1, 2, 3], 'sin predicados todo sigue visible');
    driver.dispose();
});

console.log(JSON.stringify({ suite: 'hotfixPostRelease', pass, fail }));
if (fail) process.exit(1);
