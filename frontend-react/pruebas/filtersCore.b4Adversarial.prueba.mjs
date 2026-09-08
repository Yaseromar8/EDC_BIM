/**
 * B4 · banco adversarial de la revisión independiente.
 * Ejecutar: node frontend-react/pruebas/filtersCore.b4Adversarial.prueba.mjs
 *
 * Ataca lo que el banco B4 NO cubre. Reutiliza SU arnés (componentHost, etc.)
 * en vez de copiarlo: si el arnés cambia, los dos bancos cambian a la vez.
 * Módulos de producción reales; dobles sólo de visor/hooks. Sin navegador,
 * React DOM, LMV/GPU, DB ni red.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { componentHost, nodes, text, label, event, panelFile, modalFile, categoryExport, appCallback }
    from './filtersCore.b4.prueba.mjs';
import * as presentation from '../src/lib/filterPresentation.js';
import { calculateFilterResult } from '../src/lib/filtersCore.js';
import { createFilterVisualDriver } from '../src/lib/filterVisualDriver.js';
import { mountFiltersRuntime } from '../src/lib/filterRuntimeBridge.js';
import { makeRuntimeFixture, tick } from './filtersRuntime/fixture.mjs';

const src = path => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');
const cases = [];
const test = async (name, fn) => {
    try { await fn(); cases.push({ name, status: 'PASS' }); }
    catch (error) { cases.push({ name, status: 'FAIL', error: error.message }); }
};
const category = () => componentHost(panelFile, { exports: categoryExport });
const hexOf = color => '#' + [color.x, color.y, color.z].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
function categoryProps(over = {}) {
    return { prop: { id: 'G::Estado', name: 'Estado' }, bucket: { values: [] }, selectedValues: [], expanded: false,
        searchConfig: { open: true, query: '' }, ready: true, customValueColors: {}, isColorActive: false,
        DEFAULT_VISIBLE_VALUES: 5, PALETTE: ['#7e9bbd'], setFacetSearch() {}, setExpandedFilters() {},
        togglePropertyAll() {}, handleValueToggle() {}, handleColorToggle() {}, handleCustomColorChange() {}, ...over };
}
const modalProps = (ids, over = {}) => ({ open: true, selectedProperties: ids,
    availableProperties: ids.map(id => ({ id, name: id.split('::')[1] || id, category: id.split('::')[0] })),
    filterSelections: {}, onClose() {}, onUpdate() {}, ...over });

// ── ATAQUE 3 · el configurador no debe mutar la intención antes de Aplicar ──
await test('A3 · Escape tras editar no llama onUpdate ni altera la intención', () => {
    const ui = componentHost(modalFile);
    const ids = ['G::A', 'G::B', 'G::C'];
    let updates = 0, closes = 0, applied = null;
    const p = modalProps(ids, { onUpdate(v) { updates++; applied = v; }, onClose() { closes++; },
        availableProperties: [...ids, 'G::D'].map(id => ({ id, name: id.split('::')[1], category: 'G' })) });
    let tree = ui.render(p);
    label(tree, 'Buscar propiedades disponibles').props.onChange(event('G::D'));  // despliega el grupo
    tree = ui.render(p);
    nodes(tree, n => n.props.title === 'G::D')[0].props.onClick();         // añadir
    tree = ui.render(p);
    label(tree, 'Quitar G::B').props.onClick(event());                     // quitar
    tree = ui.render(p);
    label(tree, 'Subir G::C').props.onClick();                             // reordenar
    tree = ui.render(p);
    assert.deepEqual(nodes(tree, n => n.props.draggable).map(n => n.props.key), ['G::C', 'G::A', 'G::D'], 'edición local aplicada');
    const overlay = nodes(tree, n => n.props.role === 'dialog')[0];
    assert.ok(overlay, 'el overlay debe ser un diálogo con manejador de teclado');
    overlay.props.onKeyDown({ key: 'Escape', stopPropagation() {}, preventDefault() {} });
    assert.equal(updates, 0, 'Escape NO puede aplicar la edición');
    assert.equal(closes, 1, 'Escape cierra');
    assert.equal(applied, null);
    assert.deepEqual(p.selectedProperties, ids, 'la intención del padre queda intacta');
    ui.dispose();
});
await test('A3 · Cancelar y la X tras editar tampoco aplican', () => {
    for (const via of ['Cancelar', 'X']) {
        const ui = componentHost(modalFile);
        let updates = 0, closes = 0;
        const p = modalProps(['G::A', 'G::B'], { onUpdate() { updates++; }, onClose() { closes++; } });
        let tree = ui.render(p);
        label(tree, 'Quitar G::B').props.onClick(event());
        tree = ui.render(p);
        assert.deepEqual(nodes(tree, n => n.props.draggable).map(n => n.props.key), ['G::A']);
        const boton = via === 'Cancelar'
            ? nodes(tree, n => n.type === 'button' && text(n) === 'Cancelar')[0]
            : label(tree, 'Cerrar configuración');
        assert.ok(boton, via);
        boton.props.onClick(event());
        assert.equal(updates, 0, via + ' NO puede aplicar');
        assert.equal(closes, 1);
        ui.dispose();
    }
});
await test('A3 · Aplicar entrega exactamente el conjunto editado, en su orden', () => {
    const ui = componentHost(modalFile);
    let applied = null;
    const p = modalProps(['G::A', 'G::B', 'G::C'], { onUpdate(v) { applied = v; } });
    let tree = ui.render(p);
    label(tree, 'Quitar G::B').props.onClick(event());
    tree = ui.render(p);
    label(tree, 'Bajar G::A').props.onClick();
    tree = ui.render(p);
    nodes(tree, n => n.type === 'button' && text(n) === 'Aplicar')[0].props.onClick(event());
    assert.deepEqual(applied, ['G::C', 'G::A'], 'Confirmar aplica el conjunto resultante exacto');
    ui.dispose();
});
await test('A3 · quitar una propiedad poda SOLO lo suyo, con el onUpdate real de App', () => {
    let properties = ['G1::Estado', 'G2::Estado', 'G3::Tipo'];
    let selections = { 'G1::Estado': ['Ejecutado'], 'G2::Estado': ['Pendiente'], 'G3::Tipo': ['A'] };
    let colors = { 'G1::Estado': true, 'G3::Tipo': true };
    let custom = { 'G1::Estado::Ejecutado': '#123456' };
    const app = src('App.jsx');
    const ini = app.indexOf('          onUpdate={(newProps) => {');
    const fin = app.indexOf('            setFilterConfiguratorOpen(false);', ini);
    assert.ok(ini >= 0 && fin > ini, 'localizador real del onUpdate de App');
    const cuerpo = app.slice(app.indexOf('{', ini + 20) + 1, fin);
    new Function('newProps', 'setFilterProperties', 'setFilterSelections', 'setFilterColors', 'retainPropertyConfig', cuerpo)(
        ['G2::Estado', 'G3::Tipo'],
        v => { properties = v; },
        f => { selections = f(selections); },
        f => { colors = f(colors); },
        presentation.retainPropertyConfig);
    assert.deepEqual(properties, ['G2::Estado', 'G3::Tipo']);
    assert.deepEqual(selections, { 'G2::Estado': ['Pendiente'], 'G3::Tipo': ['A'] }, 'sólo cae la selección de la quitada');
    assert.deepEqual(colors, { 'G3::Tipo': true }, 'sólo cae el color de la quitada');
    assert.deepEqual(custom, { 'G1::Estado::Ejecutado': '#123456' },
        'los colores personalizados sobreviven: el driver sólo los lee si la propiedad vuelve a colorearse');
});

// ── ATAQUE 4 · A = zero result, B = revisión nueva pending ──
await test('A4 · el zero de A no puede quedar como estado publicado de B', async () => {
    const f = makeRuntimeFixture({ count: 4 });
    const publicados = [];
    f.host.addEventListener('filter-result', e => publicados.push(e.detail));
    const runtime = mountFiltersRuntime({ host: f.host, viewer: f.viewer, getIntent: () => f.state,
        models: () => f.models, ready: () => true });
    await tick();
    // A: predicado activo que no casa con nada -> zero real, calculado por B3.
    f.state.filterSelections = { 'G::Estado': ['NoExisteEnElDataset'] };
    runtime.request(f.state); await tick();
    const a = runtime.controller.getResult();
    assert.equal(a.status, 'ready');
    assert.equal(a.hasActivePredicates, true);
    assert.equal(a.matches.length, 0, 'A debe ser un zero real');
    assert.equal(presentation.filterFeedback(a, { revision: a.revision, phase: 'visually-applied' }, 'front').state, 'zero');
    // B: revisión nueva. Lo primero que ve la UI NO puede seguir siendo el zero de A.
    const antes = publicados.length;
    f.state.filterSelections = { 'G::Estado': ['Ejecutado'] };
    runtime.request(f.state);
    const primeroDeB = publicados[antes];
    assert.ok(primeroDeB, 'abrir una revisión debe publicar algo de inmediato');
    assert.notEqual(primeroDeB.revision, a.revision, 'la revisión de B es otra');
    assert.equal(primeroDeB.status, 'pending', 'B se publica pending, no hereda el ready de A');
    // Con el progreso VIEJO de A todavía en mano, la UI sigue diciendo pending.
    const ui = presentation.filterFeedback(primeroDeB, { revision: a.revision, phase: 'visually-applied' }, 'front');
    assert.equal(ui.state, 'pending');
    assert.equal(ui.ready, false);
    assert.ok(!/0 coincidencias/.test(ui.text), 'no puede presentar el conteo viejo');
    await tick();
    assert.equal(runtime.controller.getResult().matches.length, 2, 'B termina con su propio resultado');
    runtime.dispose();
});
await test('A4 · App vacía los buckets salvo ready, y el panel lo muestra pendiente', () => {
    const app = src('App.jsx');
    assert.ok(app.includes("setDynamicFilterBuckets(e.detail?.status === 'ready' ? e.detail.facets : {})"),
        'App no puede conservar facetas de una revisión superada');
    const ui = category();
    const p = categoryProps({ bucket: undefined, selectedValues: ['Ejecutado'], ready: false });
    const tree = ui.render(p);
    assert.equal(label(tree, 'G::Estado: Ejecutado').props.checked, true, 'la intención sobrevive al pending');
    assert.ok(text(tree).includes('—'), 'sin conteo durante pending');
    assert.ok(!text(tree).includes('seleccionado, 0'), 'pending no puede afirmar un cero resuelto');
    ui.dispose();
});
await test('A4 · error tras un resultado previo no conserva el conteo anterior', () => {
    const f = makeRuntimeFixture();
    const previo = calculateFilterResult({ ...f.state, filterSelections: { 'G::Estado': ['Ejecutado'] } }, f.snapshot(), 1);
    assert.equal(presentation.filterFeedback(previo, { revision: 1, phase: 'visually-applied' }, 'front').state, 'active');
    const roto = { ...previo, status: 'error', matches: null, diagnostics: [{ code: 'X', message: 'roto' }] };
    const ui = presentation.filterFeedback(roto, { revision: 1, phase: 'visually-applied' }, 'front');
    assert.equal(ui.state, 'error');
    assert.equal(ui.ready, false);
    assert.ok(!/coincidencias/.test(ui.text), 'un error no puede seguir anunciando coincidencias');
});

// ── ATAQUE 6 · el color de la UI debe ser el que el driver aplica de verdad ──
await test('A6 · con dos propiedades de color, la prioridad que anuncia el panel es la que gana en el driver', async () => {
    const f = makeRuntimeFixture({ count: 6, sources: ['m1'] });
    f.state.filterColors = { 'G::Estado': true, 'G::Tipo': true };
    const result = calculateFilterResult(f.state, f.snapshot(), 1);
    const driver = createFilterVisualDriver({ viewer: f.viewer, models: () => f.models, window: f.host, yieldFrame: async () => {} });
    await driver.apply(result, f.state, () => true);
    // Prioridad tal y como la calcula y la enuncia el panel.
    const panel = src(panelFile);
    const expr = panel.match(/const colorPriority = ([^;]+);/);
    assert.ok(expr, 'localizador real de la prioridad del panel');
    const colorPriority = new Function('filterColors', 'return ' + expr[1])(f.state.filterColors);
    const ganadora = colorPriority[0];
    for (const fila of f.host.postgresInventory) {
        const dbId = f.host.rosettaToDbId.m1[fila.dbId];
        const real = f.models[0].colors.get(dbId);
        assert.ok(real, 'el driver debe haber pintado ' + fila.dbId);
        assert.equal(hexOf(real).toLowerCase(), presentation.filterValueColor(ganadora, fila[ganadora]).toLowerCase(),
            'gana la primera de la prioridad anunciada, para ' + fila.dbId);
    }
    driver.dispose();
});
await test('A6 · el swatch coincide con el driver en TODOS los valores, y no depende del orden', async () => {
    const f = makeRuntimeFixture({ count: 6, sources: ['m1'] });
    f.state.filterColors = { 'G::Estado': true };
    const result = calculateFilterResult(f.state, f.snapshot(), 1);
    const driver = createFilterVisualDriver({ viewer: f.viewer, models: () => f.models, window: f.host, yieldFrame: async () => {} });
    await driver.apply(result, f.state, () => true);
    const realDe = valor => {
        const fila = f.host.postgresInventory.find(r => r['G::Estado'] === valor);
        return hexOf(f.models[0].colors.get(f.host.rosettaToDbId.m1[fila.dbId])).toLowerCase();
    };
    const swatches = bucket => {
        const ui = category();
        const tree = ui.render(categoryProps({ bucket, isColorActive: true, expanded: true }));
        const salida = nodes(tree, n => n.props.className === 'tandem-item').map(li => {
            const valor = li.props['data-test-id'].slice('facet-value:'.length);
            const caja = nodes(li, n => n.props.className === 'tandem-color-box')[0];
            return [valor, caja?.props?.style?.backgroundColor?.toLowerCase()];
        });
        ui.dispose();
        return salida;
    };
    const directo = swatches(result.facets['G::Estado']);
    assert.ok(directo.length >= 2, 'debe haber varios valores');
    for (const [valor, pintado] of directo) assert.equal(pintado, realDe(valor), 'swatch de ' + valor);
    // Mismo bucket con los valores en orden inverso: el color no puede moverse.
    const invertido = swatches({ ...result.facets['G::Estado'], values: [...result.facets['G::Estado'].values].reverse() });
    assert.deepEqual(new Map(invertido), new Map(directo), 'el color es por identidad cualificada, no por posición');
    driver.dispose();
});
await test('A6 · el valor excluido con "none" no se pinta ni en el visor ni en el swatch', async () => {
    const f = makeRuntimeFixture({ count: 6, sources: ['m1'] });
    f.state.filterColors = { 'G::Estado': true };
    f.state.customColors = { 'G::Estado::Ejecutado': 'none' };
    const result = calculateFilterResult(f.state, f.snapshot(), 1);
    const driver = createFilterVisualDriver({ viewer: f.viewer, models: () => f.models, window: f.host, yieldFrame: async () => {} });
    await driver.apply(result, f.state, () => true);
    for (const fila of f.host.postgresInventory) {
        const dbId = f.host.rosettaToDbId.m1[fila.dbId];
        const pintado = f.models[0].colors.has(dbId);
        assert.equal(pintado, fila['G::Estado'] !== 'Ejecutado', 'el driver excluye exactamente "none": ' + fila.dbId);
    }
    const ui = category();
    const tree = ui.render(categoryProps({ bucket: result.facets['G::Estado'], isColorActive: true, expanded: true,
        customValueColors: { 'G::Estado::Ejecutado': 'none' } }));
    const caja = nodes(tree, n => n.props['data-test-id'] === 'facet-value:Ejecutado')
        .flatMap(li => nodes(li, n => n.props.className === 'tandem-color-box'))[0];
    assert.ok(caja, 'debe existir el swatch del valor excluido');
    assert.equal(caja.props.style.backgroundColor, undefined, 'el swatch de "none" no puede fingir un color');
    ui.dispose(); driver.dispose();
});

// ── ATAQUE 1 · dominio de búsqueda ──
await test('A1 · buscar no toca conteos ni el bucket, y limpiar devuelve el dominio entero', () => {
    const bucket = { values: Array.from({ length: 400 }, (_, i) => ({ value: 'V' + String(i).padStart(3, '0'), count: i + 1, totalCount: i + 7 })) };
    const congelado = JSON.stringify(bucket);
    const ui = category();
    const p = categoryProps({ bucket, expanded: true, selectedValues: ['V399'] });
    p.setFacetSearch = updater => { p.searchConfig = updater({ [p.prop.id]: p.searchConfig })[p.prop.id]; };
    let tree = ui.render(p);
    const conteoSinBuscar = new Map(nodes(tree, n => n.props.className === 'tandem-item')
        .map(li => [li.props['data-test-id'], text(nodes(li, n => n.props.className === 'tandem-count-badge')[0])]));
    label(tree, 'Buscar valores de G::Estado').props.onChange(event('V39'));
    tree = ui.render(p);
    const buscados = nodes(tree, n => n.props['data-test-id']?.startsWith('facet-value:'));
    assert.ok(buscados.length >= 10, 'la búsqueda recorre el dominio completo, no el bloque pintado');
    for (const li of buscados) {
        const previo = conteoSinBuscar.get(li.props['data-test-id']);
        if (previo !== undefined) assert.equal(text(nodes(li, n => n.props.className === 'tandem-count-badge')[0]), previo,
            'buscar no puede cambiar el conteo de ' + li.props['data-test-id']);
    }
    assert.equal(JSON.stringify(bucket), congelado, 'la presentación no muta el FilterResult');
    nodes(tree, n => n.type === 'button' && text(n) === 'Limpiar búsqueda')[0].props.onClick();
    tree = ui.render(p);
    assert.deepEqual(p.selectedValues, ['V399'], 'limpiar conserva la selección');
    assert.ok(nodes(tree, n => n.props['data-test-id']?.startsWith('facet-value:')).length > 0);
});
await test('A1 · homónimos: buscar por nombre alcanza los dos grupos; por grupo, sólo uno', () => {
    const props = [{ id: 'G1::Estado', name: 'Estado', category: 'G1' }, { id: 'G2::Estado', name: 'Estado', category: 'G2' }];
    assert.deepEqual(presentation.selectedPropertyItems(props.map(x => x.id), props, 'Estado').map(x => x.id),
        ['G1::Estado', 'G2::Estado']);
    assert.deepEqual(presentation.selectedPropertyItems(props.map(x => x.id), props, 'G2::').map(x => x.id), ['G2::Estado']);
    assert.deepEqual(Object.keys(presentation.availablePropertyGroups(props, 'g1')), ['G1']);
});
await test('A1 · buscar después de reordenar encuentra lo mismo y no deshace el orden', () => {
    const ui = componentHost(modalFile);
    const ids = ['G1::Alfa', 'G2::Beta', 'G3::Gamma'];
    const p = modalProps(ids);
    let tree = ui.render(p);
    label(tree, 'Subir G3::Gamma').props.onClick();
    tree = ui.render(p);
    const orden = nodes(tree, n => n.props.draggable).map(n => n.props.key);
    assert.deepEqual(orden, ['G1::Alfa', 'G3::Gamma', 'G2::Beta']);
    label(tree, 'Buscar propiedades del panel').props.onChange(event('Gamma'));
    tree = ui.render(p);
    assert.deepEqual(nodes(tree, n => n.props.draggable).map(n => n.props.key), ['G3::Gamma'], 'la búsqueda ve el orden nuevo');
    label(tree, 'Buscar propiedades del panel').props.onChange(event(''));
    assert.deepEqual(nodes(ui.render(p), n => n.props.draggable).map(n => n.props.key), orden, 'limpiar no deshace el reorden');
    ui.dispose();
});

// ── ATAQUE 2 · reorder por identidad ──
await test('A2 · Bajar con búsqueda activa usa el vecino canónico, no el visible', () => {
    const ui = componentHost(modalFile);
    const ids = ['P1::Rojo', 'P2::Verde', 'P3::Rombo'];
    const p = modalProps(ids);
    let tree = ui.render(p);
    label(tree, 'Buscar propiedades del panel').props.onChange(event('ro'));  // esconde P2::Verde
    tree = ui.render(p);
    const visibles = nodes(tree, n => n.props.draggable).map(n => n.props.key);
    assert.deepEqual(visibles, ['P1::Rojo', 'P3::Rombo'], 'la vista filtrada omite el elemento intermedio');
    label(tree, 'Bajar P1::Rojo').props.onClick();
    tree = ui.render(p);
    label(tree, 'Buscar propiedades del panel').props.onChange(event(''));
    assert.deepEqual(nodes(ui.render(p), n => n.props.draggable).map(n => n.props.key),
        ['P2::Verde', 'P1::Rojo', 'P3::Rombo'], 'Bajar mueve UNA posición canónica, no salta el elemento oculto');
    ui.dispose();
});
await test('A2 · arrastrar y soltar fuera de la lista no reordena', () => {
    const ui = componentHost(modalFile);
    const ids = ['G::A', 'G::B', 'G::C'];
    const p = modalProps(ids);
    let tree = ui.render(p);
    const filas = nodes(tree, n => n.props.draggable);
    filas[2].props.onDragStart(event());              // empieza el arrastre
    filas[2].props.onDragEnd(event());                // se suelta fuera: sin drop
    assert.deepEqual(nodes(ui.render(p), n => n.props.draggable).map(n => n.props.key), ids, 'arrastre cancelado');
    ui.dispose();
});

// ── ATAQUE 8 · segunda autoridad ──
await test('A8 · la presentación no importa motor, controlador ni driver', () => {
    const p = src('lib/filterPresentation.js');
    for (const prohibido of ['filtersCore', 'filterVisualDriver', 'filterRuntimeBridge', 'aps/utils/model', 'inventoryNormalizers']) {
        assert.ok(!new RegExp("from\\s+'[^']*" + prohibido).test(p), 'filterPresentation no puede importar ' + prohibido);
    }
    for (const prohibido of ['calculateBucketsFromPostgres', 'calculateFilterResult', 'globalValidDbIds', 'postgresInventory']) {
        assert.ok(!p.includes(prohibido), 'filterPresentation no puede nombrar ' + prohibido);
    }
});
await test('A8 · el motor de matching se sigue llamando desde un solo sitio', () => {
    // Se mira el CODIGO, no los comentarios: preflightFiltros nombra el motor en su
    // docstring precisamente para explicar por que no lo usa, y eso no es autoridad.
    const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
    const raiz = fileURLToPath(new URL('../src/', import.meta.url));
    const ficheros = [];
    (function recorrer(dir, rel) {
        for (const entrada of readdirSync(dir, { withFileTypes: true })) {
            const ruta = dir + entrada.name, nombre = rel + entrada.name;
            if (entrada.isDirectory()) recorrer(ruta + '/', nombre + '/');
            else if (/[.](js|jsx|mjs)$/.test(entrada.name) && sinComentarios(readFileSync(ruta, 'utf8')).includes('calculateBucketsFromPostgres'))
                ficheros.push(nombre);
        }
    })(raiz, '');
    assert.deepEqual(ficheros.sort(), ['aps/utils/model.js', 'lib/filtersCore.js'],
        'sólo el motor lo define y sólo filtersCore lo llama: ' + ficheros.join(', '));
});

// ── ATAQUE 7 · listas grandes ──
await test('A7 · un valor seleccionado fuera del bloque visible sigue contando y es alcanzable', () => {
    const bucket = { values: Array.from({ length: 6000 }, (_, i) => ({ value: 'V' + String(i).padStart(4, '0'), count: 1, totalCount: 1 })) };
    const ui = category();
    const p = categoryProps({ bucket, selectedValues: ['V5999'] });
    p.setFacetSearch = updater => { p.searchConfig = updater({ [p.prop.id]: p.searchConfig })[p.prop.id]; };
    let tree = ui.render(p);
    assert.ok(nodes(tree, n => n.type === 'input' && n.props.type === 'checkbox').length <= 5, 'DOM acotado');
    assert.ok(text(tree).includes('1 seleccionados'), 'el panel declara la selección aunque no la pinte');
    const items = presentation.facetItems(bucket, ['V5999']);
    assert.equal(items.length, 6000, 'la selección no duplica ni pierde valores del dominio');
    assert.equal(items.find(x => x.value === 'V5999').selected, true);
    label(tree, 'Buscar valores de G::Estado').props.onChange(event('V5999'));
    tree = ui.render(p);
    assert.equal(label(tree, 'G::Estado: V5999').props.checked, true, 'la búsqueda lo alcanza sin paginar');
    ui.dispose();
});
await test('A7 · paginar no inventa ni pierde valores respecto del dominio buscado', () => {
    const bucket = { values: Array.from({ length: 250 }, (_, i) => ({ value: 'V' + String(i).padStart(3, '0'), count: 1 })) };
    const ui = category();
    const p = categoryProps({ bucket, expanded: true });
    let tree = ui.render(p);
    const vistos = new Set();
    for (let vuelta = 0; vuelta < 4; vuelta++) {
        for (const li of nodes(tree, n => n.props['data-test-id']?.startsWith('facet-value:')))
            vistos.add(li.props['data-test-id'].slice('facet-value:'.length));
        const mas = nodes(tree, n => n.type === 'button' && /^Mostrar más/.test(text(n)))[0];
        if (!mas) break;
        mas.props.onClick();
        tree = ui.render(p);
    }
    assert.equal(vistos.size, 250, 'paginando se alcanza el dominio entero exactamente una vez');
    ui.dispose();
});

const pass = cases.filter(c => c.status === 'PASS').length;
const fail = cases.filter(c => c.status === 'FAIL').length;
console.log(JSON.stringify({ suite: 'filtersCore.b4Adversarial', pass, fail, cases,
    limits: 'JSX/handlers reales con hooks y visor simulados; sin navegador, React DOM, LMV/GPU, DB ni red.' }, null, 2));
process.exitCode = fail ? 1 : 0;
