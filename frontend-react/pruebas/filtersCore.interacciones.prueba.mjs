/**
 * Reproducciones históricas B1, conectadas al producto B3/B4 autorizado.
 * Ejecutar: node frontend-react/pruebas/filtersCore.interacciones.prueba.mjs
 *
 * Extrae fragmentos del producto sin importar/montar App ni tocar DB/red.
 * Los expected representan el contrato correcto, no el defecto del baseline.
 * KNOWN_FAIL exige una firma defectuosa exacta; cualquier otro fallo es
 * UNEXPECTED_FAIL. Los cuatro defectos B3 corregidos exigen el expected original;
 * búsqueda/DnD B4 también cumplen ya sus expected originales.
 * Exit 1 con cualquier KNOWN_FAIL/resultado inesperado. Los controles sanos
 * se clasifican PASS. Esto NO es una prueba de React DOM, LMV GPU ni navegador.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createFilterVisualDriver } from '../src/lib/filterVisualDriver.js';
import { facetItems, searchFacetItems, selectedPropertyItems, reorderProperty } from '../src/lib/filterPresentation.js';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const quietConsole = { log() {}, warn() {}, error() {} };
const sources = {
    viewer: 'frontend-react/src/components/Viewer.jsx',
    app: 'frontend-react/src/App.jsx',
    grid: 'frontend-react/src/components/InventoryDataGrid.jsx',
    panel: 'frontend-react/src/components/TandemFilterPanel.jsx',
    modal: 'frontend-react/src/components/FilterConfiguratorModal.jsx',
    driver: 'frontend-react/src/lib/filterVisualDriver.js',
    bridge: 'frontend-react/src/lib/filterRuntimeBridge.js',
};

const { normalizeInventoryPreload } = await import('../src/lib/inventoryNormalizers.js');

function loadSources() {
    return Object.fromEntries(Object.entries(sources).map(([key, path]) => {
        const raw = readFileSync(resolve(repoRoot, path), 'utf8');
        return [key, { path, text: raw.replace(/\r\n/g, '\n'), sha256: createHash('sha256').update(raw).digest('hex') }];
    }));
}

function between(source, begin, end) {
    const start = source.text.indexOf(begin);
    if (start < 0 || source.text.indexOf(begin, start + begin.length) >= 0) {
        throw new Error(`SOURCE_DRIFT: marcador inicial ausente/ambiguo en ${source.path}: ${begin}`);
    }
    const stop = source.text.indexOf(end, start + begin.length);
    if (stop < 0) throw new Error(`SOURCE_DRIFT: marcador final ausente en ${source.path}: ${end}`);
    return source.text.slice(start, stop);
}

function matchOne(source, expression) {
    const matches = [...source.text.matchAll(expression)];
    if (matches.length !== 1) throw new Error(`SOURCE_DRIFT: ${matches.length} coincidencias para ${expression} en ${source.path}`);
    return matches[0][1];
}

function bus() {
    const listeners = new Map();
    return {
        addEventListener(type, listener) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(listener);
        },
        removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
        dispatchEvent(event) {
            for (const listener of listeners.get(event.type) || []) listener(event);
        },
    };
}

class TestEvent {
    constructor(type, { detail } = {}) { this.type = type; this.detail = detail; }
}

function controlledTimers() {
    const queue = new Map();
    let nextId = 1;
    return {
        setTimeout(callback) { const id = nextId++; queue.set(id, callback); return id; },
        clearTimeout(id) { queue.delete(id); },
        get size() { return queue.size; },
        async drain() {
            let turns = 0;
            while (queue.size) {
                if (++turns > 30) throw new Error('MOCK_LIMIT: demasiados lotes de color');
                const [id, callback] = queue.entries().next().value;
                queue.delete(id);
                callback();
                // Permitir continuar el async real y encolar su siguiente lote.
                await Promise.resolve();
                await Promise.resolve();
            }
        },
    };
}

async function colorScenario(src, { count, turnOff }) {
    const timers = controlledTimers();
    const painted = new Set();
    const emitted = [];
    const model = { getData: () => ({ urn: 'm1' }) };
    const viewer = {
        impl: { modelQueue: () => ({ getModels: () => [model] }), invalidate() {} },
        clearThemingColors: () => painted.clear(),
        setThemingColor: (id) => painted.add(id),
    };
    const fakeWindow = {
        THREE: { Vector4: class { constructor(...values) { this.values = values; } } },
        _lastCalculatedBuckets: { 'G::Estado': { values: [{
            value: 'Ejecutado', dbIds: Array.from({ length: count }, (_, i) => ({ id: i + 1, modelUrn: 'm1' })),
        }] } },
        _lastHasActiveFilters: false,
        dispatchEvent: event => emitted.push({ type: event.type, groups: event.detail.groups.length }),
    };
    // Exact same bucket, values, ids and timer boundary as the original case.
    // Only the locator/argument adapter changes: Viewer now mounts this driver.
    if (!src.viewer.text.includes('mountFiltersRuntime({') || !src.bridge.text.includes('createFilterVisualDriver({'))
        throw new Error('SOURCE_DRIFT: production Viewer/driver connection missing');
    const driver = createFilterVisualDriver({ viewer, models: () => [model], window: fakeWindow,
        yieldFrame: () => new Promise(resolve => timers.setTimeout(resolve)) });
    const result = { revision: 1, hasActivePredicates: false, matchesByModel: [], facets: fakeWindow._lastCalculatedBuckets };
    const job = driver.apply(result, { filterColors: { 'G::Estado': true } }, () => true);
    const afterFirstChunk = painted.size;
    if (afterFirstChunk !== Math.min(count, 5000) || timers.size !== 1) {
        throw new Error(`FIXTURE_DRIFT: primer lote=${afterFirstChunk}, timers=${timers.size}`);
    }
    if (turnOff) {
        driver.cancelColors(true);
        if (painted.size !== 0) throw new Error('FIXTURE_DRIFT: apagar no limpio el primer lote');
    }
    const eventBoundary = emitted.length;
    await timers.drain();
    await job;
    // Se mide ANTES de dispose. Lo que este caso afirma es que el trabajo de
    // color COMPLETA --o que apagarlo no deja cola--, no lo que quede tras el
    // desmontaje. Con el driver antiguo daba igual porque dispose no tocaba el
    // color; ahora si lo retira, y medir a traves del desmontaje confundiria
    // "pinto" con "quedo pintado". Los valores esperados no cambian.
    const paintedAfterDrain = painted.size;
    driver.dispose();
    return {
        afterFirstChunk,
        paintedAfterDrain,
        nonemptyEventsAfterBoundary: emitted.slice(eventBoundary).filter(e => e.type === 'viewer-colors-applied' && e.groups > 0).length,
    };
}

function preloadAssetsScenario(src) {
    // El preload ya no es un fragmento en linea de App.jsx: se extrajo a
    // `lib/inventoryNormalizers`, y App lo llama. Extraerlo con marcadores de
    // texto dejo de ser posible --el banco lo dijo con SOURCE_DRIFT en vez de
    // pasar en falso-- asi que se reancla a la funcion REAL. La expectativa del
    // caso no cambia: se sigue midiendo cuantas filas sobreviven al filtro.
    const rows = normalizeInventoryPreload(
        [{ external_id: 'x', model_urn: 'm1', name: 'Instancia', properties: { __node__: { __node_type__: 'instance' } } }],
        v => v).mappedData;
    const assetsBody = between(src.grid, '        const applyAssetsFilter = (data) => {', '        // PRIORIDAD: Isolation activa');
    const applyAssets = new Function('showAssetsOnly', `${assetsBody}\nreturn applyAssetsFilter;`)(true);
    return { before: rows.length, afterAssetsOnly: applyAssets(rows).length };
}

function inventoryMountScenario(src, { eventBeforeMount }) {
    const signature = matchOne(src.grid, /const InventoryDataGrid = (\([^\n]+\)) => \{/g);
    const body = between(src.grid, '    // (C) Visor 3D Isolation', '    useEffect(() => {\n        let isMounted = true;');
    const events = bus();
    const slots = [];
    const mountedEffects = [];
    let stateCursor = 0;
    let effectCursor = 0;
    const useState = initial => {
        const index = stateCursor++;
        if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
        return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    };
    const useEffect = callback => {
        const index = effectCursor++;
        if (!(index in mountedEffects)) mountedEffects[index] = callback() || null;
    };
    const component = new Function('useState', 'useEffect', 'window', 'console',
        `return ${signature} => {\n${body}\nreturn { isolatedExtIds }; };`)(useState, useEffect, events, quietConsole);
    const render = () => {
        stateCursor = 0; effectCursor = 0;
        return component({ isolatedExtIds: new Set(['x']) });
    };
    const event = new TestEvent('inventory-isolation-sync', { detail: { isolatedExtIds: ['x'] } });
    if (eventBeforeMount) events.dispatchEvent(event);
    let state = render();
    if (!eventBeforeMount) { events.dispatchEvent(event); state = render(); }
    for (const cleanup of mountedEffects) cleanup?.();
    return { isolatedExtIds: state.isolatedExtIds ? [...state.isolatedExtIds] : null };
}

function searchScenario(src) {
    const body = between(src.panel, '    const validItems = useMemo(() => {', '    const handleSearchChange = useCallback');
    const query = new Function('bucket', 'selectedValues', 'expanded', 'DEFAULT_VISIBLE_VALUES', 'searchConfig', 'useMemo', 'useState', 'facetItems', 'searchFacetItems',
        `${body}\nreturn filteredVisibleItems.map(item => item.value);`);
    const bucket = { values: Array.from({ length: 6 }, (_, i) => ({ value: `Valor ${i + 1}`, count: 1 })) };
    const run = expanded => query(bucket, [], expanded, 5, { query: 'Valor 6' }, f => f(), v => [v, () => {}], facetItems, searchFacetItems);
    return { collapsed: run(false), expanded: run(true) };
}

function dragScenario(src) {
    const initial = ['G::A', 'G::BB', 'G::BC'];
    const selectionBody = between(src.modal, '    const selectedObjects = useMemo(() => {', '    // --- HANDLERS ---');
    const select = new Function('currentSelection', 'availableProperties', 'searchTermSelected', 'useMemo', 'selectedPropertyItems',
        `${selectionBody}\nreturn selectedObjects;`);
    const visible = select(initial, initial.map(id => ({ id, name: id.split('::')[1] })), 'B', f => f(), selectedPropertyItems);
    const dragItem = { current: null }, dragOverItem = { current: null };
    const fakeEvent = { currentTarget: { style: {} } };
    const startBody = matchOne(src.modal, /onDragStart=\{\(e\) => \{([\s\S]*?)\}\}/g);
    const enterBody = matchOne(src.modal, /onDragEnter=\{\(e\) => \{([\s\S]*?)\}\}/g);
    new Function('item', 'dragItem', 'dragOverItem', 'e', startBody)(visible.find(v => v.id === 'G::BB'), dragItem, dragOverItem, fakeEvent);
    new Function('item', 'dragOverItem', 'e', enterBody)(visible.find(v => v.id === 'G::BC'), dragOverItem, fakeEvent);
    const sortBody = between(src.modal, '    const handleSort = () => {', '    if (!open) return null;');
    let reordered;
    new Function('currentSelection', 'dragItem', 'dragOverItem', 'setCurrentSelection', 'reorderProperty', `${sortBody}\nhandleSort();`)(
        initial, dragItem, dragOverItem, value => { reordered = typeof value === 'function' ? value(initial) : value; }, reorderProperty);
    return { reordered };
}

function syncScenario(src) {
    const expression = matchOne(src.grid, /const isSyncDisabled = ([^;]+);/g);
    const check = new Function('mergedSyncIds', 'isFiltered', 'filterSize', 'activeSelectionFilter', 'isolatedExtIds', `return ${expression};`);
    return { disabledForReplacement: check(new Set(['B']), true, new Set(['A']).size, new Set(['A']), null) };
}

const definitions = [
    {
        id: 'P0-6-color-off-no-late-write', defect: 'P0-6', fixedIn: 'B3',
        evidence: ['Viewer.jsx mountFiltersRuntime → filterVisualDriver.apply/cancelColors'],
        limitation: 'LMV y timers simulados; no prueba GPU ni navegador.',
        expected: { afterFirstChunk: 5000, paintedAfterDrain: 0, nonemptyEventsAfterBoundary: 0 },
        knownActual: { afterFirstChunk: 5000, paintedAfterDrain: 1, nonemptyEventsAfterBoundary: 1 },
        run: src => colorScenario(src, { count: 5001, turnOff: true }),
    },
    {
        id: 'control-color-completion', evidence: ['filterVisualDriver.apply'],
        limitation: 'Control positivo del mismo mock, sin cancelacion.',
        expected: { afterFirstChunk: 1, paintedAfterDrain: 1, nonemptyEventsAfterBoundary: 1 },
        run: src => colorScenario(src, { count: 1, turnOff: false }),
    },
    {
        id: 'P0-7-assets-only-preload', defect: 'P0-7', fixedIn: 'B3',
        evidence: ['App.jsx:2495 preload', 'InventoryDataGrid.jsx:579 applyAssetsFilter'],
        limitation: 'Fixture de una instancia; normalizador de categoria stub, fuera del caso.',
        expected: { before: 1, afterAssetsOnly: 1 }, knownActual: { before: 1, afterAssetsOnly: 0 },
        run: preloadAssetsScenario,
    },
    {
        id: 'P0-7-isolation-before-inventory-mount', defect: 'P0-7', fixedIn: 'B3',
        evidence: ['InventoryDataGrid.jsx:181 firma', 'InventoryDataGrid.jsx:325 estado/listeners'],
        limitation: 'Hooks y bus minimos: prueba de inicializacion/prop/listener, no montaje React DOM.',
        expected: { isolatedExtIds: ['x'] }, knownActual: { isolatedExtIds: null },
        run: src => inventoryMountScenario(src, { eventBeforeMount: true }),
    },
    {
        id: 'control-isolation-while-mounted', evidence: ['InventoryDataGrid.jsx:330 listener'],
        limitation: 'Control positivo de recepcion de eventos en el mismo mock.',
        expected: { isolatedExtIds: ['x'] },
        run: src => inventoryMountScenario(src, { eventBeforeMount: false }),
    },
    {
        id: 'P1-search-full-domain', defect: 'P1-search', fixedIn: 'B4', evidence: ['TandemFilterPanel.jsx:29 FilterCategory'],
        limitation: 'Se ejecuta derivacion real, sin renderizar input ni DOM.',
        expected: { collapsed: ['Valor 6'], expanded: ['Valor 6'] }, knownActual: { collapsed: [], expanded: ['Valor 6'] },
        run: searchScenario,
    },
    {
        id: 'P0-ui-drag-filtered-list', defect: 'P0-ui', fixedIn: 'B4', evidence: ['FilterConfiguratorModal.jsx seleccion/drag/sort por identidad'],
        limitation: 'Ejecuta cuerpos reales de handlers; no sintetiza gesto HTML drag/drop.',
        expected: { reordered: ['G::A', 'G::BC', 'G::BB'] }, knownActual: { reordered: ['G::BB', 'G::A', 'G::BC'] },
        run: dragScenario,
    },
    {
        id: 'P1-sync-equal-size-different-members', defect: 'P1-sync', fixedIn: 'B3', evidence: ['InventoryDataGrid.jsx isSyncDisabled'],
        limitation: 'Predicado real de habilitacion, no interaccion de boton en navegador.',
        expected: { disabledForReplacement: false }, knownActual: { disabledForReplacement: true },
        run: syncScenario,
    },
];

export async function runInteractionChecks() {
    const cases = [];
    let src;
    try { src = loadSources(); } catch (error) {
        return { suite: 'filtersCore.interacciones B1', status: 'UNEXPECTED_FAIL', cases: [], error: String(error), exitCode: 1 };
    }
    for (const definition of definitions) {
        const { run, knownActual, ...metadata } = definition;
        try {
            const actual = await run(src);
            const matchesContract = isDeepStrictEqual(actual, definition.expected);
            const status = matchesContract
                ? (definition.defect && !definition.fixedIn ? 'UNEXPECTED_PASS' : 'PASS')
                : (definition.defect && !definition.fixedIn && isDeepStrictEqual(actual, knownActual) ? 'KNOWN_FAIL' : 'UNEXPECTED_FAIL');
            cases.push({ ...metadata, status, actual });
        } catch (error) {
            cases.push({ ...metadata, status: 'UNEXPECTED_FAIL', error: String(error) });
        }
    }
    const summary = { total: cases.length, PASS: 0, KNOWN_FAIL: 0, UNEXPECTED_FAIL: 0, UNEXPECTED_PASS: 0 };
    for (const result of cases) summary[result.status]++;
    return {
        suite: 'filtersCore.interacciones B3/B4',
        limits: 'Fragmentos reales con mocks locales; sin DB/red/React DOM/LMV GPU. No certifica UI integrada ni Saved Views.',
        sources: Object.fromEntries(Object.values(src).map(({ path, sha256 }) => [path, sha256])),
        summary,
        b3Green: cases.filter(c => c.fixedIn === 'B3').every(c => c.status === 'PASS') && !summary.UNEXPECTED_FAIL && !summary.UNEXPECTED_PASS,
        b4Green: summary.PASS === 8 && !summary.KNOWN_FAIL && !summary.UNEXPECTED_FAIL && !summary.UNEXPECTED_PASS,
        cases,
        exitCode: summary.KNOWN_FAIL || summary.UNEXPECTED_FAIL || summary.UNEXPECTED_PASS ? 1 : 0,
    };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    const report = await runInteractionChecks();
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.exitCode;
}
