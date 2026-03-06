import React from 'react';
import {
    GearIcon,
    RevertIcon,
    SearchIconTandem,
    PaletteIconTandem,
    ClusterIconTandem
} from './TandemIcons';

const TandemFilterPanel = ({
    models,
    hiddenModelUrns,
    filterBuckets,
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
    return (
        <div className="filters-shell" style={{
            display: 'flex',
            flexDirection: 'column',
            position: 'absolute',
            inset: 0,
            height: '100%',
            background: 'transparent',
            color: '#adadad',
            fontSize: '12px',
            zIndex: 20,
            overflow: 'hidden'
        }}>
            <style>
                {`
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
          .tandem-cb-box {
            width: 18px;
            height: 18px;
            border-radius: 3px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.15s, border-color 0.15s;
            border: 1.5px solid #555;
            background: #2a2d31;
          }
          .tandem-cb-container:hover .tandem-cb-box { border-color: #888; background: #353840; }
          .tandem-cb-box.checked { background: #4e5258; border-color: #4e5258; }
          .tandem-cb-container:hover .tandem-cb-box.checked { background: #5e6268; border-color: #5e6268; }
          .tandem-cb-box.checked.active { background: #2d8fa5; border-color: #2d8fa5; }
          .tandem-cb-container:hover .tandem-cb-box.checked.active { background: #35a0b8; border-color: #35a0b8; }
          .tandem-cb-icon { width: 16px; height: 16px; }

          .facet-search-input {
            width: 100%;
            background: #1a1a1a;
            border: 1px solid #444;
            color: #e0e0e0;
            padding: 5px 8px;
            font-size: 12px;
            border-radius: 2px;
            outline: none;
          }

          .tandem-group-info { flex: 1; display: flex; align-items: baseline; gap: 8px; overflow: hidden; }
          .tandem-group-title { font-weight: 600; color: #ffffff; white-space: nowrap; font-size: 13px; text-shadow: 0 1px 2px rgba(0,0,0,0.8); }
          .tandem-group-count { color: #ccc; font-size: 11px; }
          
          .tandem-actions { display: flex; gap: 2px; opacity: 0.8; transition: opacity 0.2s; }
          .tandem-group-header:hover .tandem-actions { opacity: 1; }
          .tandem-action-btn { background: none; border: none; color: #999; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
          .tandem-action-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
          .tandem-action-btn.active { color: #3aa0ff; background: rgba(58, 160, 255, 0.15); }
          
          .tandem-list { list-style: none; padding: 0; margin: 0; display: none; }
          .tandem-list.open { display: block; }
          .tandem-item { display: flex; align-items: center; padding: 2px 16px 2px 36px; min-height: 28px; transition: background 0.1s; }
          .tandem-item:hover { background: rgba(53, 56, 61, 0.8); }
          .tandem-item-label { flex: 1; cursor: pointer; display: flex; align-items: center; overflow: hidden; }
          .tandem-item-text { margin-left: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #f0f0f0; font-weight: 500; text-shadow: 0 1px 2px rgba(0,0,0,0.8); }
          .tandem-item-right { display: flex; align-items: center; gap: 8px; margin-left: auto; }
          .tandem-count-badge { color: #ccc; font-size: 11px; min-width: 20px; text-align: right; margin-right: 8px; }
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
                    <button className="tandem-action-btn" title="Reset" onClick={() => {
                        setFilterSelections({});
                        setHiddenModelUrns([]);
                        window.dispatchEvent(new CustomEvent('filters-apply', { detail: { dbIds: [] } }));
                    }}>
                        <RevertIcon />
                    </button>
                </div>
            </header>

            <div className="tandem-scroll">
                {/* 1. SOURCES GROUP */}
                <div className="tandem-group">
                    <div className="tandem-group-header">
                        <label className="tandem-cb-container" title="Toggle all models" onClick={e => { e.stopPropagation(); if (hiddenModelUrns.length === 0) { setHiddenModelUrns(models.map(m => m.urn)); } else { setHiddenModelUrns([]); } }}>
                            <div className="tandem-cb-wrap">
                                <div className={`tandem-cb-box ${hiddenModelUrns.length === 0 ? 'checked' : (hiddenModelUrns.length > 0 && hiddenModelUrns.length < models.length ? 'checked' : '')} ${hiddenModelUrns.length > 0 ? 'active' : ''}`}>
                                    <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" className="tandem-cb-icon">
                                        {hiddenModelUrns.length > 0 && hiddenModelUrns.length < models.length
                                            ? <line x1="6" y1="12" x2="18" y2="12" stroke="#fff" />
                                            : <path fill="none" stroke={hiddenModelUrns.length === 0 ? '#fff' : 'transparent'} d="M6,11.3 L10.3,16 L18,6.2" />
                                        }
                                    </svg>
                                </div>
                            </div>
                        </label>
                        <div className="tandem-group-info" onClick={() => setExpandedFilters(prev => ({ ...prev, 'sources': !prev['sources'] }))}>
                            <span className="tandem-group-title">Sources</span>
                            <span className="tandem-group-count">({models.length - hiddenModelUrns.length} of {models.length})</span>
                        </div>
                        <div className="tandem-actions" style={{ gap: '4px', alignItems: 'center' }}>
                            <button className={`tandem-action-btn ${facetSearch['sources']?.open ? 'active' : ''}`} title="Search" onClick={() => setFacetSearch(prev => ({ ...prev, sources: { open: !prev.sources?.open, query: '' } }))}><SearchIconTandem /></button>
                            <button className="tandem-action-btn" title="Color"><PaletteIconTandem /></button>
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
                            .map(model => (
                                <li key={model.urn} className="tandem-item">
                                    <label className="tandem-item-label">
                                        <span className="tandem-cb-container" onClick={e => { e.preventDefault(); handleToggleModelVisibility(model.urn); }}>
                                            <div className="tandem-cb-wrap">
                                                <div className={`tandem-cb-box ${!hiddenModelUrns.includes(model.urn) ? 'checked' : ''} ${hiddenModelUrns.length > 0 ? 'active' : ''}`}>
                                                    <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" className="tandem-cb-icon">
                                                        <path fill="none" stroke={!hiddenModelUrns.includes(model.urn) ? '#fff' : 'transparent'} d="M6,11.3 L10.3,16 L18,6.2" />
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
                                        <div className="tandem-color-box default"></div>
                                    </div>
                                </li>
                            ))}
                    </ul>
                </div>

                {/* 2. PROPERTIES GROUPS */}
                {Object.keys(filterBuckets).length === 0 && (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontStyle: 'italic' }}>
                        Loading properties...
                    </div>
                )}

                {visiblePropertyObjects.map(prop => {
                    const bucket = dynamicFilterBuckets[prop.id];
                    const selectedValues = filterSelections[prop.id] || [];
                    const validItems = bucket
                        ? bucket.values.filter(item => item.count > 0 || selectedValues.includes(item.value))
                        : [];

                    const isExpanded = expandedFilters[prop.id];
                    const visibleItems = isExpanded ? validItems : validItems.slice(0, DEFAULT_VISIBLE_VALUES);
                    const hasMore = validItems.length > DEFAULT_VISIBLE_VALUES;

                    const allSelected = bucket && selectedValues.length === bucket.values.length;
                    const someSelected = selectedValues.length > 0 && selectedValues.length < (bucket?.values.length || 0);

                    return (
                        <div key={prop.id} className="tandem-group">
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
                                    <button className={`tandem-action-btn ${facetSearch[prop.id]?.open ? 'active' : ''}`} title="Search" onClick={() => setFacetSearch(prev => ({ ...prev, [prop.id]: { open: !prev[prop.id]?.open, query: '' } }))}>
                                        <SearchIconTandem />
                                    </button>
                                    <button className="tandem-action-btn" title="Group by property">
                                        <ClusterIconTandem />
                                    </button>
                                    <button
                                        className={`tandem-action-btn ${filterColors[prop.id] ? 'active' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); toggleColor(prop.id); }}
                                        title="Color by property"
                                    >
                                        <PaletteIconTandem />
                                    </button>
                                    <button className="tandem-action-btn" onClick={() => setExpandedFilters(prev => ({ ...prev, [prop.id]: !prev[prop.id] }))}>
                                        {isExpanded ? (
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M24 24H0L12 0z" /></svg>
                                        ) : (
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'rotate(180deg)' }}><path d="M24 24H0L12 0z" /></svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {facetSearch[prop.id]?.open && (
                                <div style={{ padding: '4px 16px 4px 36px' }}>
                                    <input
                                        type="search"
                                        className="facet-search-input"
                                        placeholder={`Search ${prop.name}...`}
                                        autoFocus
                                        value={facetSearch[prop.id]?.query || ''}
                                        onChange={e => setFacetSearch(prev => ({ ...prev, [prop.id]: { ...prev[prop.id], query: e.target.value } }))}
                                    />
                                </div>
                            )}

                            <ul className={`tandem-list open`}>
                                {visibleItems
                                    .filter(item => {
                                        const sq = (facetSearch[prop.id]?.query || '').toLowerCase();
                                        return !sq || (item.value && item.value.toLowerCase().includes(sq));
                                    })
                                    .map(item => {
                                        const isChecked = selectedValues.length === 0 || selectedValues.includes(item.value);
                                        let colorStyle = {};
                                        if (filterColors[prop.id]) {
                                            const originalIndex = bucket.values.findIndex(v => v.value === item.value);
                                            const color = PALETTE[originalIndex % PALETTE.length];
                                            colorStyle = { backgroundColor: color, border: `1px solid ${color}` };
                                        }
                                        return (
                                            <li key={item.value} className="tandem-item">
                                                <label className="tandem-item-label">
                                                    <span className="tandem-cb-container" onClick={e => { e.preventDefault(); handleValueToggle(prop.id, item.value); }}>
                                                        <div className="tandem-cb-wrap">
                                                            <div className={`tandem-cb-box ${(selectedValues.length === 0 || selectedValues.includes(item.value)) ? 'checked' : ''} ${selectedValues.length > 0 ? 'active' : ''}`}>
                                                                <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" className="tandem-cb-icon">
                                                                    <path fill="none" stroke={(selectedValues.length === 0 || selectedValues.includes(item.value)) ? '#fff' : 'transparent'} d="M6,11.3 L10.3,16 L18,6.2" />
                                                                </svg>
                                                            </div>
                                                        </div>
                                                    </span>
                                                    <span className="tandem-item-text" title={item.value}>{item.value}</span>
                                                </label>
                                                <div className="tandem-item-right">
                                                    <span className="tandem-count-badge">{item.count}</span>
                                                    <div className="tandem-color-box" style={colorStyle}></div>
                                                </div>
                                            </li>
                                        );
                                    })}
                                {hasMore && !isExpanded && (
                                    <li className="tandem-item" style={{ justifyContent: 'flex-end', paddingRight: '16px', cursor: 'pointer', color: '#ccc', fontSize: '11px' }} onClick={() => setExpandedFilters(prev => ({ ...prev, [prop.id]: true }))}>
                                        <span>more ⌄</span>
                                    </li>
                                )}
                            </ul>
                        </div>
                    );
                })}

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
