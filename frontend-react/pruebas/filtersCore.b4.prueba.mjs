import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import * as presentation from '../src/lib/filterPresentation.js';
import { calculateFilterResult } from '../src/lib/filtersCore.js';
import { createFilterVisualDriver } from '../src/lib/filterVisualDriver.js';
import { mountFiltersRuntime } from '../src/lib/filterRuntimeBridge.js';
import { makeRuntimeFixture, microtasks, tick } from './filtersRuntime/fixture.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { transformSync } = require('esbuild');
const source = path => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');
// Runs actual JSX and handlers with a deterministic hooks host, not copied handlers.
// It is not React DOM/LMV GPU certification; no network, DB or browser required.
function componentHost(file, { host = new EventTarget(), transform = s => s, exports = '' } = {}) {
    const states = [], refs = [], memos = [], effects = [];
    let cursor = 0, pending = [], dirty = false, tree, props;
    const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
    const hooks = {
        createElement: (type, p, ...children) => ({ type, props: { ...p, children: children.flat(Infinity) } }),
        Fragment: 'fragment', memo: f => f,
        useState(init) { const i = cursor++; if (!(i in states)) states[i] = typeof init === 'function' ? init() : init;
            return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; dirty = true; }]; },
        useRef(init) { const i = cursor++; return refs[i] ||= { current: init }; },
        useMemo(fn, deps) { const i = cursor++; if (!same(memos[i]?.deps, deps)) memos[i] = { deps, value: fn() }; return memos[i].value; },
        useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
        useEffect(fn, deps) { const i = cursor++; if (!same(effects[i]?.deps, deps)) pending.push(() => {
            effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
    };
    const code = transformSync(transform(source(file)) + exports, { loader: 'jsx', format: 'cjs', jsx: 'transform' }).code;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', 'window', code)(id => {
        if (id === 'react') return hooks;
        if (id.includes('filterPresentation')) return presentation;
        return new Proxy({}, { get: () => () => null });
    }, module, module.exports, host);
    let component = module.exports.TestComponent || module.exports.default;
    return {
        render(next = props) { props = next; let turns = 0;
            do { dirty = false; cursor = 0; pending = []; tree = component(props); for (const effect of pending) effect();
                assert.ok(++turns < 20, 'render loop'); } while (dirty);
            return tree;
        },
        dispose() { for (const e of effects) e?.cleanup?.(); },
    };
}
const all = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...(tree.props?.children || []).flatMap(all)];
const nodes = (tree, fn) => all(tree).filter(fn);
const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : (tree?.props?.children || []).map(text).join(' ');
const label = (tree, aria) => { const node = nodes(tree, n => n.props?.['aria-label'] === aria)[0]; assert.ok(node, aria); return node; };
const event = value => ({ target: { value }, currentTarget: { style: {} }, preventDefault() {}, stopPropagation() {}, dataTransfer: { setData() {} } });
const replace = (s, before, after) => { assert.equal(s.split(before).length, 2, 'mutation/source anchor unique'); return s.replace(before, after); };
const panelFile = 'components/TandemFilterPanel.jsx', modalFile = 'components/FilterConfiguratorModal.jsx';
const categoryExport = '\nexport { FilterCategory as TestComponent };';
function appCallback(name, end, bindings) {
    const app = source('App.jsx');
    const start = app.indexOf('  const ' + name + ' = useCallback');
    const stop = app.indexOf(end, start);
    assert.ok(start >= 0 && stop > start, 'actual App callback locator');
    return new Function('useCallback', ...Object.keys(bindings), app.slice(start, stop) + '\nreturn ' + name)(f => f, ...Object.values(bindings));
}

export async function runB4({ mutant = null } = {}) {
    const cases = [];
    const test = async (name, fn) => { try { await fn(); cases.push({ name, status: 'PASS' }); }
        catch (error) { cases.push({ name, status: 'FAIL', error: error.message }); } };
    const transformations = {
        'search-after-limit': s => replace(s, 'searchFacetItems(validItems, searchQuery)', 'searchFacetItems(validItems.slice(0, DEFAULT_VISIBLE_VALUES), searchQuery)'),
        'dnd-visible-index': s => replace(replace(s, 'dragItem.current = item.id;', 'dragItem.current = currentSelection[selectedObjects.indexOf(item)];'), 'dragOverItem.current = item.id;', 'dragOverItem.current = currentSelection[selectedObjects.indexOf(item)];'),
        'palette-by-position': s => replace(s, 'filterValueColor(prop.id, item.value)', 'PALETTE[bucket.values.findIndex(v => v.value === item.value) % PALETTE.length]'),
    };
    // DnD has both enter/drop anchors: mutate start only, a real wrong-identity bug.
    transformations['dnd-visible-index'] = s => replace(s, 'dragItem.current = item.id;', 'dragItem.current = currentSelection[selectedObjects.indexOf(item)];');
    const category = () => componentHost(panelFile, { exports: categoryExport,
        transform: ['search-after-limit', 'palette-by-position'].includes(mutant) ? transformations[mutant] : s => s });
    const bucket = { values: Array.from({ length: 6001 }, (_, i) => ({ value: 'Valor ' + i, count: 1, totalCount: 1 })) };
    function categoryProps() {
        const p = { prop: { id: 'G1::Estado', name: 'Estado' }, bucket, selectedValues: [], expanded: false,
            searchConfig: { open: true, query: 'Valor 6000' }, ready: true, customValueColors: {}, isColorActive: false,
            DEFAULT_VISIBLE_VALUES: 5, PALETTE: ['#7e9bbd'], setFacetSearch() {}, setExpandedFilters() {},
            togglePropertyAll() {}, handleValueToggle() {}, handleColorToggle() {}, handleCustomColorChange() {} };
        return p;
    }
    await test('6001 values: search then render; clear preserves selection; bounded DOM', () => {
        const ui = category(), p = categoryProps();
        let changes = 0;
        p.handleValueToggle = (_, value) => { changes++; p.selectedValues = p.selectedValues.includes(value) ? [] : [value]; };
        p.setFacetSearch = updater => { p.searchConfig = updater({ [p.prop.id]: p.searchConfig })[p.prop.id]; };
        let tree = ui.render(p);
        assert.ok(label(tree, 'G1::Estado: Valor 6000'));
        label(tree, 'G1::Estado: Valor 6000').props.onChange();
        tree = ui.render(p);
        assert.equal(label(tree, 'G1::Estado: Valor 6000').props.checked, true);
        nodes(tree, n => n.type === 'button' && text(n) === 'Limpiar búsqueda')[0].props.onClick();
        tree = ui.render(p);
        assert.deepEqual(p.selectedValues, ['Valor 6000']);
        assert.ok(nodes(tree, n => n.type === 'input' && n.props.type === 'checkbox').length <= 5);
        assert.equal(changes, 1); ui.dispose();
    });
    await test('missing selected value count 0 remains removable during pending', () => {
        const ui = category(), p = categoryProps();
        p.bucket = { values: [{ value: 'Otra', count: 0 }] }; p.selectedValues = ['Desaparecida']; p.searchConfig.query = ''; p.ready = false;
        const tree = ui.render(p);
        assert.equal(label(tree, 'G1::Estado: Desaparecida').props.disabled, false);
        assert.equal(label(tree, 'G1::Estado: Desaparecida').props.checked, true);
        assert.ok(text(tree).includes('seleccionado, pendiente'));
        assert.ok(!text(tree).includes('seleccionado, 0'), 'pending must not claim resolved zero');
        p.ready = true;
        assert.ok(text(ui.render(p)).includes('seleccionado, 0')); ui.dispose();
    });
    await test('zero unselected searchable but disabled; no invented count', () => {
        const ui = category(), p = categoryProps(); p.bucket = { values: [{ value: 'Incompatible', count: 0, totalCount: 9 }] }; p.searchConfig.query = 'incompatible';
        const tree = ui.render(p); assert.equal(label(tree, 'G1::Estado: Incompatible').props.disabled, true);
        assert.ok(text(tree).includes('9')); assert.equal(p.bucket.values[0].count, 0); ui.dispose();
    });
    await test('DnD filtered + cancelled + consecutive + clear search + homonyms', () => {
        const ui = componentHost(modalFile, { transform: mutant === 'dnd-visible-index' ? transformations[mutant] : s => s });
        const ids = ['G::A', 'G::BB', 'G::BC', 'G1::Estado', 'G2::Estado'];
        const p = { open: true, selectedProperties: ids, availableProperties: ids.map(id => ({ id, name: id.split('::')[1], category: id.split('::')[0] })),
            filterSelections: { 'G1::Estado': ['Ejecutado'] }, onClose() {}, onUpdate() {} };
        let tree = ui.render(p);
        label(tree, 'Buscar propiedades del panel').props.onChange(event('B')); tree = ui.render(p);
        const dragged = nodes(tree, n => n.props.draggable);
        assert.equal(dragged.length, 2);
        dragged[0].props.onDragStart(event()); dragged[1].props.onDragEnter(event()); dragged[1].props.onDrop(event());
        tree = ui.render(p);
        assert.deepEqual(nodes(tree, n => n.props.draggable).map(n => n.props.key), ['G::BC', 'G::BB']);
        label(tree, 'Buscar propiedades del panel').props.onChange(event('')); tree = ui.render(p);
        assert.deepEqual(nodes(tree, n => n.props.draggable).map(n => n.props.key), ['G::A', 'G::BC', 'G::BB', 'G1::Estado', 'G2::Estado']);
        const first = nodes(tree, n => n.props.draggable)[0]; first.props.onDragStart(event()); first.props.onDragEnd(event());
        assert.deepEqual(nodes(ui.render(p), n => n.props.draggable).map(n => n.props.key), ['G::A', 'G::BC', 'G::BB', 'G1::Estado', 'G2::Estado']);
        label(tree, 'Subir G2::Estado').props.onClick(); tree = ui.render(p);
        assert.deepEqual(nodes(tree, n => n.props.draggable).map(n => n.props.key), ['G::A', 'G::BC', 'G::BB', 'G2::Estado', 'G1::Estado']);
        assert.ok(text(tree).includes('filtro activo')); ui.dispose();
    });
    await test('property search full qualified identity / 6000 properties / reserved groups', () => {
        const props = Array.from({ length: 6000 }, (_, i) => ({ id: 'G' + i + '::Estado', category: 'G' + i, name: 'Estado' }));
        const groups = presentation.availablePropertyGroups(props, 'g5999::estado');
        assert.deepEqual(Object.keys(groups), ['G5999']);
        assert.equal(presentation.selectedPropertyItems(props.map(p => p.id), props, 'G5999::Estado')[0].id, 'G5999::Estado');
        assert.equal(presentation.availablePropertyGroups([{ id: '__proto__::P', name: 'P', category: '__proto__' }]).__proto__.length, 1);
    });
    await test('configured unknown property survives; update prunes by ID only', () => {
        const props = presentation.selectedPropertyItems(['G1::Estado', 'G2::Estado'], [{ id: 'G2::Estado', name: 'Estado' }]);
        assert.equal(props[0].unavailable, true); assert.equal(props.length, 2);
        assert.deepEqual(presentation.retainPropertyConfig({ 'G1::Estado': ['A'], 'G2::Estado': ['B'] }, ['G2::Estado']), { 'G2::Estado': ['B'] });
    });
    await test('actual modal large search finds last property; rendering is capped after search', () => {
        const ui = componentHost(modalFile);
        const properties = Array.from({ length: 6000 }, (_, i) => ({ id: 'G' + i + '::Estado', category: 'G' + i, name: 'Estado' }));
        const p = { open: true, selectedProperties: [], availableProperties: properties, onClose() {}, onUpdate() {} };
        let tree = ui.render(p);
        assert.equal(nodes(tree, n => n.props.role === 'button' && 'aria-expanded' in n.props).length, 100);
        label(tree, 'Buscar propiedades disponibles').props.onChange(event('G5999::Estado')); tree = ui.render(p);
        assert.equal(nodes(tree, n => n.props.role === 'button' && 'aria-expanded' in n.props).length, 1);
        const add = nodes(tree, n => n.props.title === 'G5999::Estado')[0]; assert.ok(add); add.props.onClick();
        tree = ui.render(p); assert.ok(label(tree, 'Quitar G5999::Estado')); ui.dispose();
    });
    await test('actual panel property search, feedback and clear preserve Sources', () => {
        const host = new EventTarget(), ui = componentHost(panelFile, { host });
        let resets = 0, sourceWrites = 0; host.addEventListener('filters-reset-all', () => resets++);
        const f = makeRuntimeFixture(), result = calculateFilterResult(f.state, f.snapshot(), 1);
        const properties = Array.from({ length: 6000 }, (_, i) => ({ id: 'G' + i + '::Estado', name: 'Estado' }));
        const p = { filterScopeId: 'front', filterResult: result, filterProgress: { revision: 1, phase: 'visually-applied' },
            allPropertyObjects: properties, models: [], hiddenModelUrns: ['m2'], dynamicFilterBuckets: result.facets,
            filterSelections: {}, filterColors: {}, expandedFilters: {}, facetSearch: {}, setHiddenModelUrns() { sourceWrites++; },
            setFilterConfiguratorOpen() {}, setExpandedFilters() {}, setFacetSearch() {}, PALETTE: [], DEFAULT_VISIBLE_VALUES: 5 };
        let tree = ui.render(p);
        assert.equal(nodes(tree, n => n.props.prop?.id).length, 5);
        label(tree, 'Buscar propiedades del panel').props.onChange(event('G5999::Estado')); tree = ui.render(p);
        assert.deepEqual(nodes(tree, n => n.props.prop?.id).map(n => n.props.prop.id), ['G5999::Estado']);
        assert.equal(nodes(tree, n => n.props['data-filter-state'])[0].props['data-filter-state'], 'no-filters');
        label(tree, 'Limpiar filtros').props.onClick(); assert.equal(resets, 1); assert.equal(sourceWrites, 0);
        p.filterResult = { ...result, status: 'error', diagnostics: [{ message: 'broken' }] };
        tree = ui.render(p); assert.ok(text(tree).includes('broken')); assert.ok(nodes(tree, n => n.type === 'button' && text(n) === 'Reintentar').length);
        ui.dispose();
    });
    await test('actual App value toggles OR, clear property and restored intent edit', () => {
        let selection = { 'G::Estado': ['Ejecutado'], 'G::Tipo': ['A'] };
        const setter = fn => { selection = fn(selection); };
        const toggle = appCallback('handleValueToggle', '  // State for color toggles', { setFilterSelections: setter });
        const clear = appCallback('togglePropertyAll', '  const handleValueToggle', { setFilterSelections: setter });
        toggle('G::Estado', 'Pendiente'); assert.deepEqual(selection['G::Estado'], ['Ejecutado', 'Pendiente']);
        toggle('G::Estado', 'Ejecutado'); assert.deepEqual(selection['G::Estado'], ['Pendiente']);
        toggle('G::Estado', 'Pendiente'); assert.ok(!('G::Estado' in selection));
        assert.deepEqual(selection['G::Tipo'], ['A']);
        clear('G::Tipo'); assert.deepEqual(selection, {});
    });
    await test('no filter / zero / pending / error / stale progress / scope UI', () => {
        const f = makeRuntimeFixture(), result = calculateFilterResult(f.state, f.snapshot(), 3);
        assert.equal(presentation.filterFeedback(result, { revision: 3, phase: 'visually-applied' }, 'front').state, 'no-filters');
        assert.equal(presentation.filterFeedback({ ...result, hasActivePredicates: true, matches: [] }, null, 'front').state, 'zero');
        assert.equal(presentation.filterFeedback({ ...result, status: 'pending', matches: null }, null, 'front').state, 'pending');
        assert.equal(presentation.filterFeedback({ ...result, status: 'error', matches: null }, null, 'front').state, 'error');
        assert.equal(presentation.filterFeedback(result, { revision: 2, phase: 'visually-applied' }, 'front').visual, 'Aplicación visual pendiente');
        assert.equal(presentation.filterFeedback(result, null, 'another').state, 'pending');
    });
    await test('legend colors equal B3 actual driver; reorder independent; two properties', async () => {
        const f = makeRuntimeFixture({ sources: ['m1', 'm2'] }); f.state.filterColors = { 'G::Tipo': true, 'G::Estado': true };
        const result = calculateFilterResult(f.state, f.snapshot(), 1);
        const driver = createFilterVisualDriver({ viewer: f.viewer, models: () => f.models, window: f.host, yieldFrame: async () => {} });
        await driver.apply(result, f.state, () => true);
        const hex = color => '#' + [color.x, color.y, color.z].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
        for (const model of f.models) assert.equal(hex(model.colors.get(1)).toLowerCase(), presentation.filterValueColor('G::Tipo', 'A').toLowerCase());
        const ui = category(), p = categoryProps(); p.prop = { id: 'G::Tipo', name: 'Tipo' }; p.bucket = result.facets['G::Tipo']; p.isColorActive = true; p.searchConfig.query = 'A';
        const tree = ui.render(p); const swatch = nodes(tree, n => n.props.className === 'tandem-color-box')[0];
        assert.equal(swatch.props.style.backgroundColor.toLowerCase(), hex(f.models[0].colors.get(1)).toLowerCase());
        ui.dispose(); driver.dispose();
    });
    await test('UI rapid selection + clear pending uses single B3 truth / unique counts', async () => {
        const f = makeRuntimeFixture({ count: 20, sources: ['m1', 'm2'] });
        const runtime = mountFiltersRuntime({ host: f.host, viewer: f.viewer, getIntent: () => f.state, models: () => f.models, ready: () => true });
        await tick(); const start = runtime.controller.metrics.computed;
        const ui = category(), p = categoryProps(); p.prop = { id: 'G::Estado', name: 'Estado' }; p.searchConfig.query = '';
        p.bucket = runtime.controller.getResult().facets['G::Estado'];
        let selection = {};
        p.handleValueToggle = appCallback('handleValueToggle', '  // State for color toggles', { setFilterSelections: fn => {
            selection = fn(selection); p.selectedValues = selection['G::Estado'] || []; runtime.request({ filterSelections: selection });
        } });
        label(ui.render(p), 'G::Estado: Ejecutado').props.onChange();
        label(ui.render(p), 'G::Estado: Pendiente').props.onChange();
        f.host.dispatchEvent(new CustomEvent('filters-reset-all')); await tick();
        assert.equal(runtime.controller.metrics.computed - start, 1);
        assert.equal(runtime.controller.getResult().hasActivePredicates, false);
        assert.equal(runtime.controller.getResult().matches.length, 40);
        ui.dispose(); runtime.dispose();
    });
    await test('actual panel color ON/OFF reaches B3 bridge without stale legend', async () => {
        const f = makeRuntimeFixture();
        const runtime = mountFiltersRuntime({ host: f.host, viewer: f.viewer, getIntent: () => f.state, models: () => f.models, ready: () => true });
        await tick();
        const ui = componentHost(panelFile, { host: f.host });
        const p = { filterScopeId: 'front', filterResult: runtime.controller.getResult(), filterProgress: { revision: runtime.controller.getResult().revision, phase: 'visually-applied' },
            allPropertyObjects: [{ id: 'G::Estado', name: 'Estado' }], models: [], hiddenModelUrns: [], dynamicFilterBuckets: runtime.controller.getResult().facets,
            filterSelections: {}, filterColors: {}, expandedFilters: {}, facetSearch: {}, setHiddenModelUrns() {},
            setFilterConfiguratorOpen() {}, setExpandedFilters() {}, setFacetSearch() {}, PALETTE: [], DEFAULT_VISIBLE_VALUES: 5 };
        p.toggleColor = appCallback('toggleColor', '  const handleLogoClick', { setFilterColors: fn => { p.filterColors = fn(p.filterColors); } });
        let tree = ui.render(p);
        nodes(tree, n => n.props.prop?.id)[0].props.handleColorToggle('G::Estado', [], true, 'Estado');
        await tick();
        assert.ok(f.models[0].colors.size > 0);
        p.filterResult = runtime.controller.getResult(); tree = ui.render(p);
        assert.ok(text(tree).includes('aplicación visual pendiente o pausada'), 'old progress cannot claim current legend applied');
        nodes(tree, n => n.props.prop?.id)[0].props.handleColorToggle('G::Estado', [], false, 'Estado');
        await tick(); assert.equal(f.models[0].colors.size, 0);
        assert.equal(runtime.controller.getState().filterColors['G::Estado'], false);
        ui.dispose(); runtime.dispose();
    });
    return { suite: 'filtersCore.b4', cases, pass: cases.filter(c => c.status === 'PASS').length,
        fail: cases.filter(c => c.status === 'FAIL').length, limits: 'JSX/handlers + simulated hooks/LMV; no browser/GPU/DB' };
}
// Reviewer B4: the adversarial bench reuses THIS harness instead of copying it,
// so a divergence between the two can never hide a defect. No oracle changes.
export { componentHost, nodes, text, label, event, all, appCallback, panelFile, modalFile, categoryExport };

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const report = await runB4(); console.log(JSON.stringify(report, null, 2)); process.exitCode = report.fail ? 1 : 0;
}
