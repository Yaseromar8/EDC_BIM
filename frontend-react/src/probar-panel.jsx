/**
 * BANCO VISUAL · panel de Filtros.
 *
 * Monta el componente REAL con datos de mentira. Existe para mirar la casilla,
 * la cabecera de tres estados, los conteos y el hover sin levantar backend, sin
 * sesión y sin tocar producción. No entra en producción.
 *
 * Si algún día el panel deja de montar aquí, es que se le añadió una
 * dependencia de entorno que antes no tenía — y eso es una noticia, no un
 * inconveniente del banco.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TandemFilterPanel from './components/TandemFilterPanel';
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

function Banco() {
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
        scopeId: 'banco', status: listo ? 'ready' : 'pending', revision: 1,
        hasActivePredicates: Object.values(filterSelections).some(v => v && v.length),
        matches: [], matchesByModel: [], facets: buckets, coverage: {},
    };

    return (
        <div style={{ display: 'flex', gap: 24, padding: 24, background: '#14161a', minHeight: '100vh', alignItems: 'flex-start' }}>
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
                        s.has(v) ? s.delete(v) : s.add(v);
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
            <div style={{ color: '#dcdcdc', fontSize: 13, lineHeight: 1.7, fontFamily: 'Artifakt Element, Inter, sans-serif' }}>
                <p style={{ margin: '0 0 12px' }}>Banco visual. Los datos son de mentira; el componente es el de verdad.</p>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                    <li>Sin restricción: todo marcado, cabecera con palomita, <code>(6 of 6)</code>.</li>
                    <li>Pulsa un valor: aísla ese, la cabecera pasa a guion y azul.</li>
                    <li>«Sin elementos» sólo aparece si lo buscas, y sale deshabilitado.</li>
                    <li>Pasa el ratón por encima: una fila bloqueada ya no se enciende.</li>
                </ul>
                <button onClick={() => setListo(v => !v)} style={{ marginTop: 16, padding: '6px 12px', background: '#2a2d33', color: '#e0e0e0', border: '1px solid #555', borderRadius: 3, cursor: 'pointer' }}>
                    {listo ? 'Simular «calculando»' : 'Volver a «listo»'}
                </button>
            </div>
        </div>
    );
}

createRoot(document.getElementById('raiz')).render(<Banco />);
