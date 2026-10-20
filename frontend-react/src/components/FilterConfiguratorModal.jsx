import React, { useState, useEffect, useMemo, useRef } from 'react';
import { availablePropertyGroups, selectedPropertyItems, reorderProperty } from '../lib/filterPresentation';

const DEFAULT_SELECTION = [
    'Standard::Sources',
    'Standard::Revit Category'
];

const FilterConfiguratorModal = ({ open, onClose, availableProperties = [], selectedProperties = [], filterSelections = {}, onUpdate }) => {
    // Local state
    const [currentSelection, setCurrentSelection] = useState([]);
    const [searchTermAvailable, setSearchTermAvailable] = useState('');
    const [searchTermSelected, setSearchTermSelected] = useState('');
    const [expandedCategories, setExpandedCategories] = useState({});
    const [availableLimit, setAvailableLimit] = useState(100);
    const [selectedLimit, setSelectedLimit] = useState(100);

    // Drag & Drop state
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);

    useEffect(() => {
        if (open) {
            // Initialize with props or default if empty/invalid
            // We accept whatever comes from props as the "current state"
            setCurrentSelection(Array.isArray(selectedProperties) ? [...selectedProperties] : [...DEFAULT_SELECTION]);
            setSearchTermAvailable(''); setSearchTermSelected('');
            setAvailableLimit(100); setSelectedLimit(100);
            dragItem.current = null; dragOverItem.current = null;
        }
    }, [open, selectedProperties]);

    // --- LOGIC: AVAILABLE ---
    const filteredGroups = useMemo(() => availablePropertyGroups(availableProperties, searchTermAvailable),
        [availableProperties, searchTermAvailable]);
    const selectedIds = useMemo(() => new Set(currentSelection), [currentSelection]);
    const removedActive = selectedProperties.filter(id => !selectedIds.has(id) && filterSelections[id]?.length);

    // --- LOGIC: SELECTED ---
    const selectedObjects = useMemo(() => {
        return selectedPropertyItems(currentSelection, availableProperties, searchTermSelected);
    }, [currentSelection, availableProperties, searchTermSelected]);

    // --- HANDLERS ---
    const handleAdd = (propId) => {
        if (!currentSelection.includes(propId)) {
            setCurrentSelection(prev => [...prev, propId]);
        }
    };

    const handleRemove = (propId) => {
        setCurrentSelection(prev => prev.filter(id => id !== propId));
    };

    const toggleCategory = (cat) => {
        setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
    };

    const handleSave = () => {
        onUpdate(currentSelection);
        onClose();
    };

    const handleReset = () => {
        setCurrentSelection([...DEFAULT_SELECTION]);
    };

    // --- DRAG AND DROP ---
    const handleSort = () => {
        const sourceId = dragItem.current, targetId = dragOverItem.current;
        dragItem.current = null;
        dragOverItem.current = null;
        setCurrentSelection(prev => reorderProperty(prev, sourceId, targetId));
    };

    if (!open) return null;

    return (
        <div className="filter-config-overlay v-velo" role="dialog" aria-modal="true" aria-label="Configurar filtros"
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }} style={{ zIndex: 3000 }}>
            <div className="filter-config-modal v-caja" style={{ width: '800px', maxWidth: '95vw', height: '600px', maxHeight: '90vh' }}>

                {/* Header */}
                <div className="fc-header v-cabecera">
                    <h2 className="v-titulo">Configurar filtros</h2>
                    <button className="v-cerrar" aria-label="Cerrar configuración" onClick={onClose}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M3.47 3.47a.75.75 0 0 1 1.06 0L8 6.94l3.47-3.47a.75.75 0 1 1 1.06 1.06L9.06 8l3.47 3.47a.75.75 0 1 1-1.06 1.06L8 9.06l-3.47 3.47a.75.75 0 0 1-1.06-1.06L6.94 8 3.47 4.53a.75.75 0 0 1 0-1.06Z" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="fc-body" style={{ flex: 1, padding: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                    {/* Top Row: Reset Button Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                        <button className="v-enlace" onClick={handleReset}>
                            Restaurar propiedades iniciales
                        </button>
                    </div>

                    <div className="fc-columns" style={{ display: 'flex', flex: 1, gap: '20px', overflow: 'hidden' }}>

                        {/* Left Column: Available */}
                        <div className="fc-column" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <span className="v-etiqueta" style={{ marginBottom: '8px' }}>Propiedades disponibles</span>
                            <div className="fc-search" style={{ position: 'relative', marginBottom: '8px' }}>
                                <input
                                    type="search" autoFocus aria-label="Buscar propiedades disponibles"
                                    placeholder="Grupo::Propiedad"
                                    value={searchTermAvailable}
                                    onChange={e => { setSearchTermAvailable(e.target.value); setAvailableLimit(100); }}
                                    className="v-campo" style={{ paddingLeft: '30px' }}
                                />
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#72706b" strokeWidth="2" style={{ position: 'absolute', left: '10px', top: '9px' }}>
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                            </div>
                            <div className="fc-list v-lista" style={{ flex: 1 }}>
                                {Object.keys(filteredGroups).sort().slice(0, availableLimit).map(cat => {
                                    const props = filteredGroups[cat];
                                    const isExpanded = expandedCategories[cat] || searchTermAvailable.length > 0;

                                    return (
                                        <div key={cat} style={{ borderBottom: '1px solid #e8e6dc' }}>
                                            <div role="button" tabIndex={0} aria-expanded={!!isExpanded}
                                                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCategory(cat); } }}
                                                onClick={() => toggleCategory(cat)}
                                                style={{
                                                    padding: '10px 12px', fontSize: '13px', cursor: 'pointer', display: 'flex',
                                                    justifyContent: 'space-between', background: '#f1f0e8', alignItems: 'center'
                                                }}
                                            >
                                                <span style={{ fontWeight: 600, color: '#141413' }}>{cat}</span>
                                                <span style={{ color: '#72706b', fontSize: '11px' }}>{props.length}</span>
                                            </div>
                                            {isExpanded && (
                                                <div style={{ background: '#ffffff' }}>
                                                    {props.slice(0, availableLimit).map(prop => {
                                                        const isAdded = selectedIds.has(prop.id);
                                                        return (
                                                            <div role="button" tabIndex={isAdded ? -1 : 0} aria-disabled={isAdded} title={prop.id}
                                                                onKeyDown={e => { if (!isAdded && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleAdd(prop.id); } }}
                                                                key={prop.id}
                                                                onClick={() => !isAdded && handleAdd(prop.id)}
                                                                style={{
                                                                    padding: '6px 12px 6px 24px', fontSize: '12px',
                                                                    color: isAdded ? '#52524d' : '#52524d',
                                                                    cursor: isAdded ? 'default' : 'pointer',
                                                                    display: 'flex', alignItems: 'center', transition: 'background 0.1s'
                                                                }}
                                                                onMouseEnter={e => !isAdded && (e.currentTarget.style.background = '#e8e6dc')}
                                                                onMouseLeave={e => !isAdded && (e.currentTarget.style.background = 'transparent')}
                                                            >
                                                                <span>{isAdded ? '✓ ' : '+ '} {prop.name}</span>
                                                            </div>
                                                        );
                                                    })}
                                                    {props.length > availableLimit && <button className="v-enlace" style={{ padding: '8px 12px' }} onClick={() => setAvailableLimit(n => n + 100)}>Mostrar 100 más ({props.length} encontradas)</button>}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {Object.keys(filteredGroups).length > availableLimit && <button className="v-enlace" style={{ padding: '8px 12px' }} onClick={() => setAvailableLimit(n => n + 100)}>Mostrar más grupos ({Object.keys(filteredGroups).length})</button>}
                                {!Object.keys(filteredGroups).length && <p role="status" style={{ padding: '20px', margin: 0, textAlign: 'center', color: '#72706b', fontSize: '12px' }}>Sin propiedades que coincidan con la búsqueda.</p>}
                            </div>
                        </div>

                        {/* Right Column: Selected (Draggable) */}
                        <div className="fc-column" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <span className="v-etiqueta" style={{ marginBottom: '8px' }}>Propiedades del panel ({currentSelection.length})</span>
                            <div className="fc-search" style={{ position: 'relative', marginBottom: '8px' }}>
                                <input
                                    type="search" aria-label="Buscar propiedades del panel"
                                    placeholder="Grupo::Propiedad"
                                    value={searchTermSelected}
                                    onChange={e => { setSearchTermSelected(e.target.value); setSelectedLimit(100); }}
                                    className="v-campo" style={{ paddingLeft: '30px' }}
                                />
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#72706b" strokeWidth="2" style={{ position: 'absolute', left: '10px', top: '9px' }}>
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                            </div>
                            <div className="fc-list v-lista" style={{ flex: 1 }}>
                                {selectedObjects.slice(0, selectedLimit).map(item => (
                                    <div
                                        key={item.id}
                                        draggable
                                        onDragStart={(e) => {
                                            dragItem.current = item.id;
                                            dragOverItem.current = null;
                                            e.dataTransfer?.setData('text/plain', item.id);
                                            e.currentTarget.style.opacity = '0.5';
                                        }}
                                        onDragEnter={(e) => {
                                            dragOverItem.current = item.id;
                                        }}
                                        onDragEnd={(e) => {
                                            e.currentTarget.style.opacity = '1';
                                            dragItem.current = null; dragOverItem.current = null;
                                        }}
                                        onDrop={e => { e.preventDefault(); dragOverItem.current = item.id; handleSort(); }}
                                        onDragOver={(e) => e.preventDefault()}
                                        style={{
                                            padding: '8px 8px 8px 12px', borderBottom: '1px solid #e8e6dc', fontSize: '13px',
                                            display: 'flex', alignItems: 'center', background: '#ffffff', gap: '6px',
                                            cursor: 'move'
                                        }}
                                    >
                                        {/* 3-Lines Grip Icon */}
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#72706b">
                                            <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
                                        </svg>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ color: '#141413', fontWeight: 500 }}>{item.name}</div>
                                            <div style={{ fontSize: '11px', color: '#72706b' }}>{item.id}{item.unavailable ? ' · no disponible' : ''}{filterSelections[item.id]?.length ? ' · filtro activo' : ''}</div>
                                        </div>
                                        <button className="v-icono" aria-label={`Subir ${item.id}`} disabled={item.originalIndex === 0}
                                            onClick={() => setCurrentSelection(prev => reorderProperty(prev, item.id, prev[prev.indexOf(item.id) - 1]))}>↑</button>
                                        <button className="v-icono" aria-label={`Bajar ${item.id}`} disabled={item.originalIndex === currentSelection.length - 1}
                                            onClick={() => setCurrentSelection(prev => reorderProperty(prev, item.id, prev[prev.indexOf(item.id) + 1]))}>↓</button>
                                        <button className="v-icono"
                                            onClick={(e) => { e.stopPropagation(); handleRemove(item.id); }}
                                            title={`Quitar ${item.id}`} aria-label={`Quitar ${item.id}`}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
                                        </button>
                                    </div>
                                ))}
                                {selectedObjects.length === 0 && (
                                    <div style={{ padding: '20px', textAlign: 'center', color: '#72706b', fontStyle: 'italic', fontSize: '12px' }}>
                                        {currentSelection.length ? 'Sin coincidencias. La búsqueda no elimina propiedades.' : 'Ninguna propiedad seleccionada'}
                                    </div>
                                )}
                                {selectedObjects.length > selectedLimit && <button className="v-enlace" style={{ padding: '8px 12px' }} onClick={() => setSelectedLimit(n => n + 100)}>Mostrar 100 más ({selectedObjects.length} encontradas)</button>}
                            </div>
                        </div>

                    </div>



                </div>

                {/* Footer */}
                {removedActive.length > 0 && <p role="status" style={{ padding: '0 20px', color: '#734500' }}>
                    Al aplicar se quitarán los filtros activos de: {removedActive.join(', ')}. Cancelar conserva la selección.
                </p>}
                <div className="fc-footer v-pie">
                    <button className="v-boton" onClick={onClose}>
                        Cancelar
                    </button>
                    <button className="v-boton v-boton--principal" onClick={handleSave}>
                        Aplicar
                    </button>
                </div>

            </div>
        </div>
    );
};

export default FilterConfiguratorModal;
