/**
 * BANCO VISUAL · panel de Filtros y rejilla de Inventory.
 *
 * Monta los componentes REALES con datos de mentira. Existe para mirar la
 * casilla, la cabecera, los conteos, el hover de fila y la escala sin levantar
 * backend, sin sesión y sin tocar producción. No entra en producción.
 *
 * Lo que este banco NO cubre, y conviene no olvidarlo: el puente de filtros, el
 * visor y las formas de dato reales. Eso sólo lo prueba la aplicación entera
 * contra una base con datos.
 *
 * Si algún día un componente deja de montar aquí, es que se le añadió una
 * dependencia de entorno que antes no tenía — y eso es una noticia, no un
 * inconveniente del banco.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TandemFilterPanel from './components/TandemFilterPanel';
import InventoryDataGrid from './components/InventoryDataGrid';
import { inventoryRowKey } from './lib/inventoryIdentity';
import './index.css';
import './App.css';

const PROPIEDADES = [
    { id: 'Standard::Revit Category', name: 'Revit Category', category: 'Standard' },
    { id: 'Standard::Sources', name: 'Sources', category: 'Standard' },
];

const VALORES = [
    { value: 'Floors', count: 1336, totalCount: 1336 },
    { value: 'Structural Rebar', count: 5800, totalCount: 5800 },
    { value: 'Planting', count: 4930, totalCount: 4930 },
    { value: 'Walls', count: 1113, totalCount: 1113 },
    { value: 'Generic Models', count: 42, totalCount: 42 },
    { value: 'Sin elementos', count: 0, totalCount: 9 },
];

// El bloque de Sources lee `label`, no `name`: el panel lo usa tal cual.
const MODELOS = [
    { urn: 'm1', label: '500125-CSSP001-740-XX-DR-ST-004120@004145.rvt', name: '500125-CSSP001-740' },
    { urn: 'm2', label: 'PASTEADO_GENERAL.shared.dwg', name: 'PASTEADO_GENERAL' },
    { urn: 'm3', label: 'RELLENO_SANTA_RITA.shared.dwg', name: 'RELLENO_SANTA_RITA' },
];

// La rejilla tiene un camino SIN RED: si `postgresInventoryUrn` coincide con su
// `activeModelUrn` y hay filas en `postgresInventory`, las usa y no pide nada.
// Es la puerta por la que entra este banco.
const CATEGORIAS = ['Floors', 'Walls', 'Structural Rebar', 'Planting', 'Generic Models'];
const NIVELES = ['M.S.N.M', 'INICIO DE CANALES', 'NIVEL DE MURO DE CONTENCION'];
const filasFalsas = (n) => Array.from({ length: n }, (_, i) => ({
    dbId: `[${1000 + i}]S1`,
    model_urn: MODELOS[i % MODELOS.length].urn,
    source_urn: MODELOS[i % MODELOS.length].urn,
    Name: CATEGORIAS[i % CATEGORIAS.length],
    Level: NIVELES[i % NIVELES.length],
    'Standard::Revit Category': CATEGORIAS[i % CATEGORIAS.length],
    Material: i % 3 ? 'Concreto f’c=210' : '',
    Status: i % 4 === 0 ? 'Ejecutado' : 'Pendiente',
    Vaciado_Nro: i % 7 === 0 ? String(100 + i) : '',
}));

function sembrarInventario(n) {
    window.postgresInventory = filasFalsas(n);
    window.postgresInventoryUrn = 'banco';
    window.rosettaToDbId = { m1: {}, m2: {}, m3: {} };
    window.postgresInventory.forEach((f, i) => { window.rosettaToDbId[f.model_urn][f.dbId] = i + 1; });
}
sembrarInventario(400);

// `filterInventoryRows` SIEMPRE cruza contra `matches`; no tiene atajo para
// «sin predicados». Sin restricción el motor devuelve todas las filas ahí, así
// que el banco tiene que hacer lo mismo o la rejilla sale vacía.
const resultadoTodo = () => ({
    scopeId: 'banco', status: 'ready', revision: 1, hasActivePredicates: false,
    matches: window.postgresInventory.map((f, i) => ({
        dbId: i + 1, externalId: f.dbId, modelUrn: f.model_urn, rowKey: inventoryRowKey(f),
    })),
    matchesByModel: [], facets: {}, coverage: {},
});

function Filtros() {
    const [filterSelections, setFilterSelections] = useState({});
    const [filterColors, setFilterColors] = useState({});
    const [expandedFilters, setExpandedFilters] = useState({ 'Standard::Revit Category': true });
    const [facetSearch, setFacetSearch] = useState({});
    const [hiddenModelUrns, setHiddenModelUrns] = useState([]);
    const [listo, setListo] = useState(true);

    const buckets = {
        'Standard::Revit Category': { meta: { id: 'Standard::Revit Category', name: 'Revit Category' }, total: 13221, values: VALORES },
        'Standard::Sources': { meta: { id: 'Standard::Sources', name: 'Sources' }, total: 3, values: MODELOS.map((m, i) => ({ value: m.urn, count: [8601, 362, 4][i], totalCount: [8601, 362, 4][i] })) },
    };
    const resultado = {
        ...resultadoTodo(), status: listo ? 'ready' : 'pending',
        hasActivePredicates: Object.values(filterSelections).some(v => v && v.length),
        facets: buckets,
    };

    return (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
            <div style={{ width: 340, flexShrink: 0 }}>
                <TandemFilterPanel
                    filterResult={resultado}
                    filterProgress={{ revision: 1, phase: 'visually-applied' }}
                    filterScopeId="banco"
                    allPropertyObjects={PROPIEDADES}
                    models={MODELOS}
                    hiddenModelUrns={hiddenModelUrns}
                    setHiddenModelUrns={setHiddenModelUrns}
                    dynamicFilterBuckets={buckets}
                    filterSelections={filterSelections}
                    setFilterSelections={setFilterSelections}
                    filterColors={filterColors}
                    setFilterColors={setFilterColors}
                    expandedFilters={expandedFilters}
                    setExpandedFilters={setExpandedFilters}
                    facetSearch={facetSearch}
                    setFacetSearch={setFacetSearch}
                    setFilterConfiguratorOpen={() => {}}
                    togglePropertyAll={id => setFilterSelections(p => { const n = { ...p }; delete n[id]; return n; })}
                    handleValueToggle={(id, v) => setFilterSelections(p => {
                        const actual = p[id] || [];
                        if (!actual.length) return { ...p, [id]: [v] };
                        const s = new Set(actual);
                        if (s.has(v)) s.delete(v); else s.add(v);
                        return { ...p, [id]: [...s] };
                    })}
                    handleColorToggle={(id, _v, activo) => setFilterColors(p => ({ ...p, [id]: !!activo }))}
                    handleCustomColorChange={() => {}}
                    customValueColors={{}}
                    setVisiblePropertiesCount={() => {}}
                    PALETTE={['#7e9bbd', '#F97316', '#10B981', '#F43F5E', '#A855F7']}
                    DEFAULT_VISIBLE_VALUES={5}
                />
            </div>
            <Notas titulo="Panel de Filtros" puntos={[
                'La cabecera vacía significa «no hay selección explícita»: pulsar un valor lo aísla.',
                'Pulsa la cabecera: selecciona todos y pasa a marcada. Ahora quitar uno resta, no aísla.',
                'Quita uno: la cabecera pasa a guion y la cuenta a (5 of 6).',
                '«Sin elementos» sólo aparece si lo buscas, y sale deshabilitado.',
            ]}>
                <button onClick={() => setListo(v => !v)} style={BOTON}>
                    {listo ? 'Simular «calculando»' : 'Volver a «listo»'}
                </button>
            </Notas>
        </div>
    );
}

function Inventario() {
    const [filas, setFilas] = useState(400);
    // Se recalcula con `filas` porque el sembrado cambia el array de window.
    const resultado = React.useMemo(() => resultadoTodo(), [filas]);
    return (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0, height: 460, border: '1px solid #2a2b30', position: 'relative' }}>
                <InventoryDataGrid
                    key={filas}
                    activeModelUrn="banco"
                    filterResult={resultado}
                    filterProgress={{ revision: 1, phase: 'visually-applied' }}
                    onClose={() => {}}
                />
            </div>
            <Notas titulo="Rejilla de Inventory" puntos={[
                'Pasa el ratón por las filas: se sombrean, para saber dónde estás.',
                'La cebra sigue debajo del sombreado; una fila marcada conserva su azul.',
                'Fuente unificada a 12 px y cabecera más clara que sus datos.',
            ]}>
                <button onClick={() => { const n = filas === 400 ? 5000 : 400; sembrarInventario(n); setFilas(n); }} style={BOTON}>
                    {filas === 400 ? 'Cargar 5.000 filas' : 'Volver a 400 filas'}
                </button>
            </Notas>
        </div>
    );
}

const BOTON = { marginTop: 16, padding: '6px 12px', background: '#2a2d33', color: '#e0e0e0', border: '1px solid #555', borderRadius: 3, cursor: 'pointer' };

function Notas({ titulo, puntos, children }) {
    return (
        <div style={{ width: 300, flexShrink: 0, color: '#dcdcdc', fontSize: 13, lineHeight: 1.7, fontFamily: 'Artifakt Element, Inter, sans-serif' }}>
            <p style={{ margin: '0 0 12px', fontWeight: 500 }}>{titulo}</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>{puntos.map(p => <li key={p}>{p}</li>)}</ul>
            {children}
        </div>
    );
}

function Banco() {
    const [vista, setVista] = useState('filtros');
    const pestania = (id, txt) => (
        <button onClick={() => setVista(id)} style={{
            padding: '6px 14px', cursor: 'pointer', fontSize: 13, border: 'none',
            background: vista === id ? '#2d8fa5' : '#23242a', color: vista === id ? '#fff' : '#aaa',
        }}>{txt}</button>
    );
    return (
        <div style={{ padding: 24, background: '#14161a', minHeight: '100vh', fontFamily: 'Artifakt Element, Inter, sans-serif' }}>
            <div style={{ display: 'flex', gap: 2, marginBottom: 20 }}>
                {pestania('filtros', 'Filters')}
                {pestania('inventario', 'Inventory')}
            </div>
            {vista === 'filtros' ? <Filtros /> : <Inventario />}
        </div>
    );
}

// HMR vuelve a ejecutar este módulo en cada guardado. Sin esta guarda se
// llamaba a createRoot sobre el mismo nodo una y otra vez, y React acababa
// pintando un árbol duplicado y a medias.
const nodo = document.getElementById('raiz');
if (!nodo.__raiz) nodo.__raiz = createRoot(nodo);
nodo.__raiz.render(<Banco />);
