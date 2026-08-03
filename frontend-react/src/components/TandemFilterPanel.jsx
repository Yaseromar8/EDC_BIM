import React, { useState, useMemo, useCallback, useEffect } from 'react';
import HeatmapConfigPanel from './HeatmapConfigPanel';
import {
    GearIcon,
    RevertIcon,
    SearchIconTandem,
    PaletteIconTandem
} from './TandemIcons';

// Subcomponente memoizado para evitar re-renders masivos
const FilterCategory = React.memo(({
    prop,
    bucket,
    selectedValues,
    expanded,
    searchConfig,
    isColorActive,
    togglePropertyAll,
    handleValueToggle,
    setExpandedFilters,
    setFacetSearch,
    handleColorToggle,
    handleCustomColorChange,
    customValueColors,
    DEFAULT_VISIBLE_VALUES,
    PALETTE
}) => {
    // 1. Matriz de Inclusión (Pre-filtro)
    const validItems = useMemo(() => {
        if (!bucket) return [];
        return bucket.values.filter(item => item.count > 0 || selectedValues.includes(item.value));
    }, [bucket, selectedValues]);

    const visibleItems = expanded ? validItems : validItems.slice(0, DEFAULT_VISIBLE_VALUES);
    const hasMore = validItems.length > DEFAULT_VISIBLE_VALUES;

    const allSelected = selectedValues.length === (bucket?.values.length || 0);
    const someSelected = selectedValues.length > 0 && selectedValues.length < (bucket?.values.length || 0);

    const searchQuery = (searchConfig?.query || '').toLowerCase();

    // Filtro matricial sin mutar arrays en el flujo principal del map
    const filteredVisibleItems = useMemo(() => {
        if (!searchQuery) return visibleItems;
        return visibleItems.filter(item => item.value && item.value.toLowerCase().includes(searchQuery));
    }, [visibleItems, searchQuery]);

    const handleSearchChange = useCallback((e) => {
        setFacetSearch(prev => ({
            ...prev,
            [prop.id]: { ...prev[prop.id], query: e.target.value }
        }));
    }, [prop.id, setFacetSearch]);

    // COLOR PICKER STATE
    const [colorPickerTarget, setColorPickerTarget] = useState(null); // { value, anchorRect }

    const PRESET_COLORS = [
        '#10B981', '#059669', '#34D399', // Greens
        '#7e9bbd', '#5f7fa3', '#6366F1', // Blues
        '#F97316', '#EAB308', '#F59E0B', // Oranges/Yellows
        '#EF4444', '#F43F5E', '#EC4899', // Reds/Pinks
        '#A855F7', '#8B5CF6', '#14B8A6', // Purples/Teals
        '#84CC16', '#22D3EE', '#FB923C', // Lime/Cyan/Light Orange
    ];

    return (
        <div className="tandem-group" data-test-id={`facet-item:${prop.name}`}>
            <div className="tandem-group-header">
                <label className="tandem-cb-container" onClick={e => { e.stopPropagation(); togglePropertyAll(prop.id); }}>
                    <div className="tandem-cb-wrap">
                        <div className={`tandem-cb-box ${allSelected || someSelected ? 'checked' : ''} ${selectedValues.length > 0 ? 'active' : ''}`}>
                            <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" className="tandem-cb-icon">
                                {someSelected
                                    ? <line x1="6" y1="12" x2="18" y2="12" stroke="#fff" />
                                    : <path fill="none" stroke={allSelected ? '#fff' : 'transparent'} d="M6,11.3 L10.3,16 L18,6.2" />
                                }
                            </svg>
                        </div>
                    </div>
                </label>
                <div className="tandem-group-info" onClick={() => setExpandedFilters(prev => ({ ...prev, [prop.id]: !prev[prop.id] }))}>
                    <span className="tandem-group-title" title={prop.name}>{prop.name}</span>
                    <span className="tandem-group-count">({selectedValues.length} of {bucket?.values.length || 0})</span>
                </div>
                <div className="tandem-actions" style={{ gap: '4px', alignItems: 'center' }}>
                    <button className={`tandem-action-btn ${searchConfig?.open ? 'active' : ''}`} title="Search" onClick={() => setFacetSearch(prev => ({ ...prev, [prop.id]: { open: !prev[prop.id]?.open, query: '' } }))}>
                        <SearchIconTandem />
                    </button>
                    {/* Disparamos Evento de Color Semántico */}
                    <button
                        className={`tandem-action-btn ${isColorActive ? 'active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); handleColorToggle(prop.id, selectedValues, !isColorActive, prop.name); }}
                        title="Color by property"
                    >
                        <PaletteIconTandem />
                    </button>
                    <button className="tandem-action-btn" onClick={() => setExpandedFilters(prev => ({ ...prev, [prop.id]: !prev[prop.id] }))}>
                        {expanded ? (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M24 24H0L12 0z" /></svg>
                        ) : (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'rotate(180deg)' }}><path d="M24 24H0L12 0z" /></svg>
                        )}
                    </button>
                </div>
            </div>

            {searchConfig?.open && (
                <div style={{ padding: '4px 16px 4px 36px' }}>
                    <input
                        type="search"
                        className="facet-search-input"
                        placeholder={`Search ${prop.name}...`}
                        autoFocus
                        value={searchQuery}
                        onChange={handleSearchChange}
                    />
                </div>
            )}

            <ul className={`tandem-list open`}>
                {filteredVisibleItems.map(item => {
                    const isChecked = selectedValues.length === 0 || selectedValues.includes(item.value);
                    const customColorKey = `${prop.id}::${item.value}`;
                    const customColor = customValueColors[customColorKey];
                    let colorStyle = {};
                    if (isColorActive) {
                        if (customColor === 'none') {
                            // excluido del coloreo: puntito "tachado"
                            colorStyle = {
                                background: 'repeating-linear-gradient(45deg,#3a3d42 0 3px,#1e2126 3px 6px)',
                                border: '1px solid #5a5f66',
                            };
                        } else if (customColor) {
                            colorStyle = { backgroundColor: customColor, border: `1px solid ${customColor}`, boxShadow: `0 0 6px ${customColor}55` };
                        } else {
                            const originalIndex = bucket.values.findIndex(v => v.value === item.value);
                            const color = PALETTE[originalIndex % PALETTE.length];
                            colorStyle = { backgroundColor: color, border: `1px solid ${color}` };
                        }
                    }
                    return (
                        <li key={item.value} className="tandem-item" data-test-id={`facet-value:${item.value}`}>
                            <label className="tandem-item-label">
                                <span className="tandem-cb-container" onClick={e => { e.preventDefault(); handleValueToggle(prop.id, item.value); }}>
                                    <div className="tandem-cb-wrap">
                                        <div className={`tandem-cb-box ${isChecked ? 'checked' : ''} ${selectedValues.length > 0 ? 'active' : ''}`}>
                                            <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" className="tandem-cb-icon">
                                                <path fill="none" stroke={isChecked ? '#fff' : 'transparent'} d="M6,11.3 L10.3,16 L18,6.2" />
                                            </svg>
                                        </div>
                                    </div>
                                </span>
                                <span className="tandem-item-text" title={String(item.value)}>{String(item.value)}</span>
                            </label>
                            <div className="tandem-item-right">
                                <span className="tandem-count-badge">
                                    {item.count}
                                    {typeof item.totalCount === 'number' && item.totalCount !== item.count && (
                                        <span className="tandem-count-total"> ({item.totalCount})</span>
                                    )}
                                </span>
                                <div 
                                    className="tandem-color-box" 
                                    style={{ ...colorStyle, cursor: isColorActive ? 'pointer' : 'default', transition: 'all 0.2s' }}
                                    onClick={(e) => {
                                        if (!isColorActive) return;
                                        e.stopPropagation();
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setColorPickerTarget(prev => 
                                            prev?.value === item.value ? null : { value: item.value, anchorRect: rect }
                                        );
                                    }}
                                    title={isColorActive ? 'Click to change color' : ''}
                                />
                            </div>
                        </li>
                    );
                })}

                {/* INLINE COLOR PICKER POPOVER */}
                {colorPickerTarget && isColorActive && (
                    <li style={{ padding: '8px 16px 8px 36px', background: '#1a1c22', borderTop: '1px solid #333', borderBottom: '1px solid #333' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', color: '#aaa', fontWeight: 600 }}>
                                    Color: {colorPickerTarget.value}
                                </span>
                                <button 
                                    onClick={() => setColorPickerTarget(null)} 
                                    style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}
                                >×</button>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {/* ✕ No pintar: excluye este valor del coloreo (queda con su material natural) */}
                                <div
                                    onClick={() => {
                                        handleCustomColorChange(prop.id, colorPickerTarget.value, 'none');
                                        setColorPickerTarget(null);
                                    }}
                                    title="No pintar este valor (excluir del coloreo)"
                                    style={{
                                        width: '18px', height: '18px', borderRadius: '3px', cursor: 'pointer',
                                        border: customValueColors[`${prop.id}::${colorPickerTarget.value}`] === 'none' ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)',
                                        background: 'repeating-linear-gradient(45deg,#3a3d42 0 3px,#1e2126 3px 6px)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#f87171', fontWeight: 900, fontSize: '11px', lineHeight: 1,
                                    }}
                                >✕</div>
                                {PRESET_COLORS.map(c => {
                                    const isSelected = customValueColors[`${prop.id}::${colorPickerTarget.value}`] === c;
                                    return (
                                        <div
                                            key={c}
                                            onClick={() => {
                                                handleCustomColorChange(prop.id, colorPickerTarget.value, c);
                                                setColorPickerTarget(null);
                                            }}
                                            style={{
                                                width: '18px', height: '18px', borderRadius: '3px',
                                                backgroundColor: c, cursor: 'pointer',
                                                border: isSelected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                                                boxShadow: isSelected ? `0 0 8px ${c}` : 'none',
                                                transition: 'all 0.15s'
                                            }}
                                            title={c}
                                        />
                                    );
                                })}
                                {/* Native color input for full custom */}
                                <label style={{ 
                                    width: '18px', height: '18px', borderRadius: '3px', 
                                    background: 'linear-gradient(135deg, #ff0000, #00ff00, #0000ff)', 
                                    cursor: 'pointer', border: '1px solid rgba(255,255,255,0.3)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    overflow: 'hidden', position: 'relative'
                                }} title="Custom color...">
                                    <input 
                                        type="color" 
                                        style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                                        onChange={(e) => {
                                            handleCustomColorChange(prop.id, colorPickerTarget.value, e.target.value);
                                            setColorPickerTarget(null);
                                        }}
                                    />
                                </label>
                            </div>
                        </div>
                    </li>
                )}

                {hasMore && !expanded && (
                    <li className="tandem-item" style={{ justifyContent: 'flex-end', paddingRight: '16px', cursor: 'pointer', color: '#ccc', fontSize: '11px' }} onClick={() => setExpandedFilters(prev => ({ ...prev, [prop.id]: true }))}>
                        <span>more ⌄</span>
                    </li>
                )}
            </ul>
        </div>
    );
});

// GANCHO GLOBAL anti-parpadeo: varios flujos del visor hacen
// clearThemingColors masivo (reset de filtros, fin de aislamiento). Llamándolo
// INMEDIATAMENTE después de ese borrado, los tintes de fuente se restauran en
// el MISMO frame — sin ventana visible sin color. Lee el mapa persistido
// window.__ecdSourceAssigned (urn normalizado → color efectivo).
window.__ecdReapplySourceTints = (viewer, onlyModel) => {
    // Reentrada: cuando NOSOTROS pintamos, el clear interno no debe repintar
    if (window.__ecdTintApplying) return;
    try {
        const assigned = window.__ecdSourceAssigned || {};
        const THREE = window.THREE;
        if (!viewer || !THREE || !Object.keys(assigned).length) return;
        const norm = (u) => String(u || '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const list = onlyModel ? [onlyModel] : (viewer.getAllModels ? viewer.getAllModels() : []);
        window.__ecdTintApplying = true;
        list.forEach(lmv => {
            try {
                const hex = assigned[norm(lmv.getData()?.urn)];
                if (!hex) return;
                const it = lmv.getInstanceTree && lmv.getInstanceTree();
                if (!it) return;
                const c = new THREE.Color(hex);
                const v = new THREE.Vector4(c.r, c.g, c.b, 0.85);
                // Pintar a nivel de MODELO: viewer.setThemingColor invalida el
                // render en CADA llamada y con varios modelos eso reinicia el
                // sombreado ambiental una y otra vez (el "fondo parpadea").
                if (typeof lmv.setThemingColor === 'function') lmv.setThemingColor(it.getRootId(), v, true);
                else viewer.setThemingColor(it.getRootId(), v, lmv, true);
            } catch { /* noop */ }
        });
        // UNA sola invalidación ligera para todo el lote (sin clear ni AO)
        try { viewer.impl && viewer.impl.invalidate(false, true, false); } catch { /* noop */ }
    } catch { /* noop */ } finally {
        window.__ecdTintApplying = false;
    }
};

// Paleta estable de tintes por fuente (estilo Tandem): el modelo i-ésimo de la
// lista siempre recibe el mismo color — el punto del panel y el 3D coinciden.
const SOURCE_TINT_PALETTE = ['#4fc3f7', '#ab7df6', '#ffb300', '#66bb6a', '#ef5350', '#26c6da', '#ff7043', '#d4e157'];
// Presets del picker de fuentes (mismos del picker de propiedades)
const SOURCE_PRESET_COLORS = [
    '#10B981', '#059669', '#34D399',
    '#7e9bbd', '#5f7fa3', '#6366F1',
    '#F97316', '#EAB308', '#F59E0B',
    '#EF4444', '#F43F5E', '#EC4899',
    '#A855F7', '#8B5CF6', '#14B8A6',
    '#84CC16', '#22D3EE', '#FB923C',
];

const TandemFilterPanel = ({
    models,
    hiddenModelUrns,
    dynamicFilterBuckets,
    filterSelections,
    filterColors,
    expandedFilters,
    facetSearch,
    visiblePropertyObjects,
    hasMoreProperties,
    handleToggleModelVisibility,
    togglePropertyAll,
    handleValueToggle,
    toggleColor,
    setFilterConfiguratorOpen,
    setFilterSelections,
    setHiddenModelUrns,
    setExpandedFilters,
    setFacetSearch,
    setVisiblePropertiesCount,
    PALETTE,
    DEFAULT_VISIBLE_VALUES
}) => {
    // Shared URN normalizer for consistent comparisons
    const normUrn = (u) => String(u || '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const isUrnHidden = (urn) => hiddenModelUrns.some(u => normUrn(u) === normUrn(urn));
    const visibleCount = models.filter(m => !isUrnHidden(m.urn)).length;

    // ── Coloreo por FUENTE (paridad Tandem, MISMO patrón que "color by
    // property"): la paleta del header lo activa/desactiva para TODOS los
    // modelos; el punto de cada fila abre el picker (presets, color custom o
    // "no pintar"). El tinte es setThemingColor del LMV — capa aditiva y
    // reversible: no toca materiales, visibilidad, filtros ni overlays.
    // Estado a nivel de window para sobrevivir a cerrar/abrir el panel.
    const [sourcesColorOn, setSourcesColorOn] = useState(() => !!window.__ecdSourceColorOn);
    const [sourceCustomColors, setSourceCustomColors] = useState(() => ({ ...(window.__ecdSourceCustomColors || {}) }));
    const [sourcePickerUrn, setSourcePickerUrn] = useState(null);
    const sourceTintOf = (urn) => {
        const k = normUrn(urn);
        const custom = sourceCustomColors[k];
        if (custom) return custom; // puede ser 'none' (excluido del coloreo)
        const idx = models.findIndex(m => normUrn(m.urn) === k);
        return SOURCE_TINT_PALETTE[(idx < 0 ? 0 : idx) % SOURCE_TINT_PALETTE.length];
    };
    // Tinte del modelo con EXACTAMENTE el mismo mecanismo que el "color by
    // property" (Vector4 alpha 0.6, THEME_COLOR_ALPHA de Viewer.jsx): 60%
    // color + 40% del material sombreado — conserva relieve y contraste, y
    // el usuario ve UN solo lenguaje visual en todo el panel.
    const _applySourceTint = (urn, color) => {
        const viewer = window.__mainViewer || window.NOP_VIEWER;
        const THREE = window.THREE;
        if (!viewer || !THREE) return;
        const target = normUrn(urn);
        let lmv = null;
        try {
            lmv = (viewer.getAllModels ? viewer.getAllModels() : []).find(m => {
                try { return normUrn(m.getData()?.urn) === target; } catch { return false; }
            }) || null;
        } catch { /* noop */ }
        if (!lmv) return;
        try {
            // el mapa se actualiza ANTES del clear: el choke-point del visor
            // re-aplica dentro del propio clearThemingColors leyendo este mapa
            const assigned = (window.__ecdSourceAssigned = window.__ecdSourceAssigned || {});
            if (color && color !== 'none') {
                assigned[target] = color;
            } else {
                delete assigned[target];
            }
            window.__ecdTintApplying = true;   // el clear no debe repintar aquí
            viewer.clearThemingColors(lmv);
            if (color && color !== 'none') {
                const it = lmv.getInstanceTree && lmv.getInstanceTree();
                if (it) {
                    const c = new THREE.Color(color);
                    // 0.85: en fuentes conviven materiales de colores fuertes
                    // (bordes naranjas, remates amarillos) — con 0.6 el color
                    // original contaminaba el tinte y "las sombras salían de
                    // otro color". 0.85 impone el matiz de la fuente y deja
                    // 15% del sombreado original para el relieve.
                    const v = new THREE.Vector4(c.r, c.g, c.b, 0.85);
                    if (typeof lmv.setThemingColor === 'function') lmv.setThemingColor(it.getRootId(), v, true);
                    else viewer.setThemingColor(it.getRootId(), v, lmv, true);
                }
            }
            // invalidación LIGERA: (true,true,…) fuerza clear+AO y hace
            // "parpadear el fondo" en cada clic de visibilidad
            if (viewer.impl) viewer.impl.invalidate(false, true, false);
        } catch { /* noop */ } finally {
            window.__ecdTintApplying = false;
        }
    };
    // Cambio de FRENTE (App limpia los globales): sincronizar el panel — la
    // config de colores de un frente jamás se arrastra al siguiente.
    useEffect(() => {
        const onReset = () => {
            setSourcesColorOn(false);
            setSourceCustomColors({});
            setSourcePickerUrn(null);
        };
        window.addEventListener('ecd-source-tints-reset', onReset);
        return () => window.removeEventListener('ecd-source-tints-reset', onReset);
    }, []);
    // La restauración de tintes vive en UN solo lugar: el choke-point sobre
    // clearThemingColors (Viewer.jsx) — restaura dentro de la misma llamada
    // de borrado. Aquí NO hay timers ni listeners de respaldo: cada
    // re-aplicación extra reiniciaba el render progresivo (AO/sombras) y el
    // fondo pestañeaba varias veces por gesto. Un modelo que se RECARGA al
    // re-mostrarse pasa por clearThemingColors en su init → cubierto.
    // Solo un caso queda fuera: modelo cargado por primera vez con el coloreo
    // ya activo — una pasada única al cambiar la lista de modelos lo cubre.
    const _modelsKey = models.map(m => normUrn(m.urn)).join('|');
    useEffect(() => {
        if (!sourcesColorOn) return undefined;
        const t = setTimeout(() => {
            models.forEach(m => {
                if (!isUrnHidden(m.urn)) _applySourceTint(m.urn, sourceTintOf(m.urn));
            });
        }, 600);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [_modelsKey, sourcesColorOn]);
    const toggleSourcesColor = () => {
        const next = !sourcesColorOn;
        setSourcesColorOn(next);
        window.__ecdSourceColorOn = next;
        setSourcePickerUrn(null);
        models.forEach(m => _applySourceTint(m.urn, next ? sourceTintOf(m.urn) : null));
    };
    const setSourceColor = (urn, color) => {
        const k = normUrn(urn);
        setSourceCustomColors(prev => {
            const next = { ...prev, [k]: color };
            window.__ecdSourceCustomColors = next;
            return next;
        });
        _applySourceTint(urn, color);
        setSourcePickerUrn(null);
    };

    const [heatmapConfig, setHeatmapConfig] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Escuchar cuando el nativo termine para apagar el spinner
    useEffect(() => {
        console.log(`[REACT] ⏱️ ${performance.now().toFixed(2)}ms - Montaje: TandemFilterPanel (Filtros) montado.`);
        const onCalculated = () => setIsProcessing(false);
        window.addEventListener('filters-calculated', onCalculated);
        return () => window.removeEventListener('filters-calculated', onCalculated);
    }, []);

    // Delegación estricta de eventos: Semantic Payloads

    const handleColorToggle = useCallback((propId, selectedValues, isActive, propName) => {
        // Tandem no usa popup para seleccionar colores; aplica un espectro automático (Heatmap o Classic) a los properties del bucket
        toggleColor(propId); // Marca activo/inactivo localmente
        console.log(`[PUENTE] ⏱️ ${performance.now().toFixed(2)}ms - Disparando: theme-property-bucket con la propiedad ${propId} y active=${isActive}`);
        window.dispatchEvent(new CustomEvent('theme-property-bucket', {
            detail: {
                propId,
                values: selectedValues.length > 0 ? selectedValues : null,
                active: isActive,
                paletteName: 'Classic Tandem',
                customColors: window._customValueColors || {} // Pass custom overrides
            }
        }));
    }, [toggleColor]);

    // CUSTOM COLOR PER VALUE
    const [customValueColors, setCustomValueColors] = useState(() => window._customValueColors || {});

    // Al cargar una VISTA guardada/compartida, App restaura window._customValueColors
    // (colores por valor + exclusiones "no pintar") — sincronizamos los puntitos.
    useEffect(() => {
        const onRestored = (e) => setCustomValueColors({ ...(e.detail || window._customValueColors || {}) });
        window.addEventListener('custom-colors-restored', onRestored);
        return () => window.removeEventListener('custom-colors-restored', onRestored);
    }, []);

    const handleCustomColorChange = useCallback((propId, value, color) => {
        const key = `${propId}::${value}`;
        setCustomValueColors(prev => {
            const next = { ...prev, [key]: color };
            window._customValueColors = next; // Global store for Viewer access
            return next;
        });
        // Re-dispatch theming event to repaint 3D instantly with new color
        if (filterColors[propId]) {
            const selectedVals = filterSelections[propId] || [];
            window.dispatchEvent(new CustomEvent('theme-property-bucket', {
                detail: {
                    propId,
                    values: selectedVals.length > 0 ? selectedVals : null,
                    active: true,
                    paletteName: 'Classic Tandem',
                    customColors: { ...window._customValueColors, [key]: color }
                }
            }));
        }
    }, [filterColors, filterSelections]);

    const handleResetAll = useCallback(() => {
        setFilterSelections({});
        setHiddenModelUrns([]);
        // Emitir un evento de reset nativo, el Viewer se encargará de soltar clusters y theaming
        window.dispatchEvent(new CustomEvent('filters-reset-all'));
    }, [setFilterSelections, setHiddenModelUrns]);

    return (
        <div className="filters-shell" style={{
            display: 'flex', flexDirection: 'column', position: 'absolute', inset: 0,
            height: '100%', background: 'transparent', color: '#adadad', fontSize: '12px',
            zIndex: 20, overflow: 'hidden'
        }}>
            <style>
                {`
          .progressbg { position: absolute; inset: 0; background: rgba(0,0,0,0.5); z-index: 50; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px); }
          .spinner { margin: 100px auto 0; width: 70px; text-align: center; }
          .spinner > div { width: 14px; height: 14px; background-color: #7e9bbd; border-radius: 100%; display: inline-block; animation: sk-bouncedelay 1.4s infinite ease-in-out both; margin: 0 2px; }
          .spinner .bounce1 { animation-delay: -0.32s; }
          .spinner .bounce2 { animation-delay: -0.16s; }
          @keyframes sk-bouncedelay { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
          
          .tandem-header { padding: 12px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); display: flex; justify-content: space-between; align-items: center; background: transparent; }
          .tandem-title { font-weight: 600; font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase; color: #f0f0f0; }
          .tandem-scroll { flex: 1; overflow-y: auto; padding-bottom: 20px; }
          .tandem-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
          .tandem-scroll::-webkit-scrollbar-track { background: transparent; }
          .tandem-scroll::-webkit-scrollbar-thumb { background: #4f5259; border-radius: 3px; }
          .tandem-scroll::-webkit-scrollbar-thumb:hover { background: #5f6269; }
          .tandem-group { border-bottom: 1px solid #3e4045; }
          .tandem-group-header { display: flex; align-items: center; padding: 8px 16px 8px 12px; cursor: pointer; transition: background 0.1s; }
          .tandem-group-header:hover { background: #35383d; }
          .tandem-cb-container { display: inline-flex; cursor: pointer; flex-shrink: 0; margin-right: 8px; }
          .tandem-cb-wrap { position: relative; display: flex; align-items: center; justify-content: center; }
          .tandem-cb-box { width: 18px; height: 18px; border-radius: 3px; display: flex; align-items: center; justify-content: center; transition: background 0.15s, border-color 0.15s; border: 1.5px solid #555; background: #2a2d31; }
          .tandem-cb-container:hover .tandem-cb-box { border-color: #888; background: #353840; }
          .tandem-cb-box.checked { background: #4e5258; border-color: #4e5258; }
          .tandem-cb-container:hover .tandem-cb-box.checked { background: #5e6268; border-color: #5e6268; }
          .tandem-cb-box.checked.active { background: #2d8fa5; border-color: #2d8fa5; }
          .tandem-cb-container:hover .tandem-cb-box.checked.active { background: #35a0b8; border-color: #35a0b8; }
          .tandem-cb-icon { width: 16px; height: 16px; }
          .facet-search-input { width: 100%; background: #1a1a1a; border: 1px solid #444; color: #e0e0e0; padding: 5px 8px; font-size: 12px; border-radius: 2px; outline: none; }
          .tandem-group-info { flex: 1; display: flex; align-items: baseline; gap: 8px; overflow: hidden; }
          .tandem-group-title { font-weight: 600; color: #ffffff; white-space: nowrap; font-size: 13px; text-shadow: 0 1px 2px rgba(0,0,0,0.8); }
          .tandem-group-count { color: #ccc; font-size: 11px; }
          .tandem-actions { display: flex; gap: 2px; opacity: 0.8; transition: opacity 0.2s; }
          .tandem-group-header:hover .tandem-actions { opacity: 1; }
          .tandem-action-btn { background: none; border: none; color: #999; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
          .tandem-action-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
          .tandem-action-btn.active { color: #7e9bbd; background: rgba(58, 160, 255, 0.15); }
          .tandem-list { list-style: none; padding: 0; margin: 0; display: none; }
          .tandem-list.open { display: block; }
          .tandem-item { display: flex; align-items: center; padding: 2px 16px 2px 36px; min-height: 28px; transition: background 0.1s; }
          .tandem-item:hover { background: rgba(53, 56, 61, 0.8); }
          .tandem-item-label { flex: 1; cursor: pointer; display: flex; align-items: center; overflow: hidden; }
          .tandem-item-text { margin-left: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #f0f0f0; font-weight: 500; text-shadow: 0 1px 2px rgba(0,0,0,0.8); }
          .tandem-item-right { display: flex; align-items: center; gap: 8px; margin-left: auto; }
          .tandem-count-badge { color: #ccc; font-size: 11px; min-width: 20px; text-align: right; margin-right: 8px; }
          .tandem-count-total { color: #777; font-size: 10px; }
          .tandem-color-box { width: 10px; height: 10px; border-radius: 50%; box-shadow: 0 0 0 1px rgba(255,255,255,0.15); cursor: pointer; }
          .tandem-color-box.default { background: #333; }
        `}
            </style>

            <header className="tandem-header">
                <div>
                    <h2 className="tandem-title">Filters</h2>
                </div>
                <div className="tandem-actions" style={{ opacity: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button className="tandem-action-btn" onClick={() => setFilterConfiguratorOpen(true)} title="Configure">
                        <GearIcon />
                    </button>
                    <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }}></div>
                    <button className="tandem-action-btn" title="Reset" onClick={handleResetAll}>
                        <RevertIcon />
                    </button>
                </div>
            </header>

            <div className="tandem-scroll">
                {/* 1. SOURCES GROUP (Modelos) */}
                <div className="tandem-group">
                    <div className="tandem-group-header">
                        <label className="tandem-cb-container" title="Toggle all models" onClick={e => { e.stopPropagation(); if (visibleCount === models.length) { setHiddenModelUrns(models.map(m => normUrn(m.urn))); } else { setHiddenModelUrns([]); } }}>
                            <div className="tandem-cb-wrap">
                                <div className={`tandem-cb-box ${visibleCount === models.length ? 'checked' : (visibleCount > 0 && visibleCount < models.length ? 'checked' : '')} ${visibleCount < models.length ? 'active' : ''}`}>
                                    <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" className="tandem-cb-icon">
                                        {visibleCount > 0 && visibleCount < models.length
                                            ? <line x1="6" y1="12" x2="18" y2="12" stroke="#fff" />
                                            : <path fill="none" stroke={visibleCount === models.length ? '#fff' : 'transparent'} d="M6,11.3 L10.3,16 L18,6.2" />
                                        }
                                    </svg>
                                </div>
                            </div>
                        </label>
                        <div className="tandem-group-info" onClick={() => setExpandedFilters(prev => ({ ...prev, 'sources': !prev['sources'] }))}>
                            <span className="tandem-group-title">Sources</span>
                            <span className="tandem-group-count">({visibleCount} of {models.length})</span>
                        </div>
                        <div className="tandem-actions" style={{ gap: '4px', alignItems: 'center' }}>
                            <button className={`tandem-action-btn ${facetSearch['sources']?.open ? 'active' : ''}`} title="Search" onClick={() => setFacetSearch(prev => ({ ...prev, sources: { open: !prev.sources?.open, query: '' } }))}><SearchIconTandem /></button>
                            <button
                                className={`tandem-action-btn ${sourcesColorOn ? 'active' : ''}`}
                                title="Color by source"
                                onClick={(e) => { e.stopPropagation(); toggleSourcesColor(); }}
                            >
                                <PaletteIconTandem />
                            </button>
                        </div>
                        <button className="tandem-action-btn" onClick={() => setExpandedFilters(prev => ({ ...prev, 'sources': !prev['sources'] }))}>
                            {expandedFilters['sources'] !== false ? (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                            ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                            )}
                        </button>
                    </div>

                    {facetSearch['sources']?.open && (
                        <div style={{ padding: '4px 16px 4px 36px' }}>
                            <input
                                type="search"
                                className="facet-search-input"
                                placeholder="Search sources..."
                                autoFocus
                                value={facetSearch['sources']?.query || ''}
                                onChange={e => setFacetSearch(prev => ({ ...prev, sources: { ...prev.sources, query: e.target.value } }))}
                            />
                        </div>
                    )}

                    <ul className={`tandem-list ${expandedFilters['sources'] !== false ? 'open' : ''}`}>
                        {models
                            .filter(model => {
                                const sq = (facetSearch['sources']?.query || '').toLowerCase();
                                return !sq || model.label.toLowerCase().includes(sq);
                            })
                            .map(model => {
                                const effColor = sourceTintOf(model.urn);
                                const isNone = effColor === 'none';
                                const dotStyle = !sourcesColorOn ? {} : (isNone
                                    ? { background: 'repeating-linear-gradient(45deg,#3a3d42 0 3px,#1e2126 3px 6px)', border: '1px solid #5a5f66' }
                                    : { backgroundColor: effColor, border: `1px solid ${effColor}`, boxShadow: `0 0 6px ${effColor}55` });
                                return (
                                    <React.Fragment key={model.urn}>
                                        <li className="tandem-item">
                                            <label className="tandem-item-label">
                                                <span className="tandem-cb-container" onClick={e => { e.preventDefault(); handleToggleModelVisibility(model.urn); }}>
                                                    <div className="tandem-cb-wrap">
                                                        <div className={`tandem-cb-box ${!isUrnHidden(model.urn) ? 'checked' : ''} ${hiddenModelUrns.length > 0 ? 'active' : ''}`}>
                                                            <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" className="tandem-cb-icon">
                                                                <path fill="none" stroke={!isUrnHidden(model.urn) ? '#fff' : 'transparent'} d="M6,11.3 L10.3,16 L18,6.2" />
                                                            </svg>
                                                        </div>
                                                    </div>
                                                </span>
                                                <span className="tandem-item-text" title={model.label}>{model.label.replace(' (Gemelo)', '')}</span>
                                                {model.source === 'GEMELO' && (
                                                    <span style={{
                                                        fontSize: '9px', fontWeight: 'bold', background: '#e67e22', color: '#fff',
                                                        padding: '2px 4px', borderRadius: '4px', marginLeft: '6px', whiteSpace: 'nowrap'
                                                    }}>
                                                        GEMELO
                                                    </span>
                                                )}
                                            </label>
                                            <div className="tandem-item-right">
                                                <span className="tandem-count-badge">1</span>
                                                <div
                                                    className={`tandem-color-box ${sourcesColorOn ? '' : 'default'}`}
                                                    style={{ ...dotStyle, cursor: sourcesColorOn ? 'pointer' : 'default', transition: 'all 0.2s' }}
                                                    title={sourcesColorOn ? 'Click to change color' : ''}
                                                    onClick={(e) => {
                                                        if (!sourcesColorOn) return;
                                                        e.stopPropagation();
                                                        setSourcePickerUrn(prev => (prev === model.urn ? null : model.urn));
                                                    }}
                                                ></div>
                                            </div>
                                        </li>
                                        {sourcesColorOn && sourcePickerUrn === model.urn && (
                                            <li style={{ padding: '8px 16px 8px 36px', background: '#1a1c22', borderTop: '1px solid #333', borderBottom: '1px solid #333' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '11px', color: '#aaa', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            Color: {model.label.replace(' (Gemelo)', '')}
                                                        </span>
                                                        <button
                                                            onClick={() => setSourcePickerUrn(null)}
                                                            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}
                                                        >×</button>
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                        <div
                                                            onClick={() => setSourceColor(model.urn, 'none')}
                                                            title="No pintar este modelo (excluir del coloreo)"
                                                            style={{
                                                                width: '18px', height: '18px', borderRadius: '3px', cursor: 'pointer',
                                                                border: isNone ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)',
                                                                background: 'repeating-linear-gradient(45deg,#3a3d42 0 3px,#1e2126 3px 6px)',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                color: '#f87171', fontWeight: 900, fontSize: '11px', lineHeight: 1,
                                                            }}
                                                        >✕</div>
                                                        {SOURCE_PRESET_COLORS.map(c => (
                                                            <div
                                                                key={c}
                                                                onClick={() => setSourceColor(model.urn, c)}
                                                                style={{
                                                                    width: '18px', height: '18px', borderRadius: '3px',
                                                                    backgroundColor: c, cursor: 'pointer',
                                                                    border: effColor === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                                                                    boxShadow: effColor === c ? `0 0 8px ${c}` : 'none',
                                                                    transition: 'all 0.15s'
                                                                }}
                                                                title={c}
                                                            />
                                                        ))}
                                                        <label style={{
                                                            width: '18px', height: '18px', borderRadius: '3px',
                                                            background: 'linear-gradient(135deg, #ff0000, #00ff00, #0000ff)',
                                                            cursor: 'pointer', border: '1px solid rgba(255,255,255,0.3)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            overflow: 'hidden', position: 'relative'
                                                        }} title="Custom color...">
                                                            <input
                                                                type="color"
                                                                style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                                                                onChange={(e) => setSourceColor(model.urn, e.target.value)}
                                                            />
                                                        </label>
                                                    </div>
                                                </div>
                                            </li>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                    </ul>
                </div>

                {/* 2. PROPERTIES GROUPS */}
                {Object.keys(dynamicFilterBuckets).length === 0 && (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontStyle: 'italic' }}>
                        Loading properties...
                    </div>
                )}

                {visiblePropertyObjects.map(prop => (
                    <FilterCategory 
                        key={prop.id}
                        prop={prop}
                        bucket={dynamicFilterBuckets[prop.id]}
                        selectedValues={filterSelections[prop.id] || []}
                        expanded={expandedFilters[prop.id]}
                        searchConfig={facetSearch[prop.id]}
                        isColorActive={filterColors[prop.id]}
                        togglePropertyAll={togglePropertyAll}
                        handleValueToggle={handleValueToggle}
                        setExpandedFilters={setExpandedFilters}
                        setFacetSearch={setFacetSearch}
                        handleColorToggle={handleColorToggle}
                        handleCustomColorChange={handleCustomColorChange}
                        customValueColors={customValueColors}
                        DEFAULT_VISIBLE_VALUES={DEFAULT_VISIBLE_VALUES}
                        PALETTE={PALETTE}
                    />
                ))}

                {hasMoreProperties && (
                    <div style={{ padding: '12px', textAlign: 'center' }}>
                        <button className="tandem-action-btn" style={{ width: '100%', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} onClick={() => setVisiblePropertiesCount(prev => prev + 5)}>
                            Load more properties
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TandemFilterPanel;
