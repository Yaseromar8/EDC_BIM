import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';

const ColumnConfiguratorModal = ({ open, onClose, availableColumns = [], selectedColumns = [], onUpdate }) => {
    const [currentSelection, setCurrentSelection] = useState([]);
    const [searchTermAvailable, setSearchTermAvailable] = useState('');
    const [searchTermSelected, setSearchTermSelected] = useState('');

    const dragItem = useRef(null);
    const dragOverItem = useRef(null);

    useEffect(() => {
        if (open) {
            setCurrentSelection(Array.isArray(selectedColumns) ? [...selectedColumns] : []);
            setSearchTermAvailable('');
            setSearchTermSelected('');
        }
    }, [open, selectedColumns]);

    // Group available columns by category (simulated from key name patterns)
    const groupedColumns = useMemo(() => {
        const groups = {};
        availableColumns.forEach(col => {
            // Try to extract category from "Category::Name" format, fallback to "Properties"
            let cat = 'Properties';
            if (col.includes('::')) {
                cat = col.split('::')[0];
            } else if (['Name', 'Material', 'Status', 'dbId', 'model_urn'].includes(col)) {
                cat = 'Standard';
            }
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push({ id: col, name: col.includes('::') ? col.split('::')[1] : col });
        });
        return groups;
    }, [availableColumns]);

    const filteredGroups = useMemo(() => {
        if (!searchTermAvailable) return groupedColumns;
        const result = {};
        const lowerTerm = searchTermAvailable.toLowerCase();
        Object.keys(groupedColumns).forEach(cat => {
            const matchesCategory = cat.toLowerCase().includes(lowerTerm);
            const matchingProps = groupedColumns[cat].filter(p => p.name.toLowerCase().includes(lowerTerm));
            if (matchesCategory || matchingProps.length > 0) {
                result[cat] = matchesCategory ? groupedColumns[cat] : matchingProps;
            }
        });
        return result;
    }, [groupedColumns, searchTermAvailable]);

    const [expandedCategories, setExpandedCategories] = useState({});

    const selectedObjects = useMemo(() => {
        return currentSelection.map((id) => {
            const displayName = id.includes('::') ? id.split('::')[1] : id;
            const category = id.includes('::') ? id.split('::')[0] : 'Standard';
            return { id, name: displayName, category };
        }).filter(item => {
            if (!searchTermSelected) return true;
            return item.name.toLowerCase().includes(searchTermSelected.toLowerCase());
        });
    }, [currentSelection, searchTermSelected]);

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

    const toggleCategorySelection = (e, catProps) => {
        e.stopPropagation();
        const catPropIds = catProps.map(p => p.id);
        const allSelected = catPropIds.every(id => currentSelection.includes(id));
        
        if (allSelected) {
            // Remove all
            setCurrentSelection(prev => prev.filter(id => !catPropIds.includes(id)));
        } else {
            // Add all
            setCurrentSelection(prev => {
                const newSelection = [...prev];
                catPropIds.forEach(id => {
                    if (!newSelection.includes(id)) newSelection.push(id);
                });
                return newSelection;
            });
        }
    };

    const handleSave = () => {
        onUpdate(currentSelection);
        onClose();
    };

    const handleReset = () => {
        // Default: show all columns
        setCurrentSelection([...availableColumns]);
    };

    // Quitar todas: para montar una configuración propia sin desmarcar 700
    // columnas una a una. Se deja «Name» para que la tabla nunca quede vacía.
    const handleClear = () => {
        setCurrentSelection(availableColumns.includes('Name') ? ['Name'] : []);
    };

    const handleSort = () => {
        let _list = [...currentSelection];
        const draggedItemContent = _list.splice(dragItem.current, 1)[0];
        _list.splice(dragOverItem.current, 0, draggedItemContent);
        dragItem.current = null;
        dragOverItem.current = null;
        setCurrentSelection(_list);
    };

    if (!open) return null;

    return ReactDOM.createPortal(
        <div className="v-velo" role="dialog" aria-modal="true" aria-label="Editar columnas"
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }} style={{ zIndex: 3000 }}>
            <div className="v-caja" style={{ width: '900px', maxWidth: '95vw', height: '80vh', minHeight: '500px', maxHeight: '750px' }}>

                {/* Header */}
                <div className="v-cabecera">
                    <h2 className="v-titulo">Editar columnas</h2>
                    <button className="v-cerrar" aria-label="Cerrar" onClick={onClose}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M3.47 3.47a.75.75 0 0 1 1.06 0L8 6.94l3.47-3.47a.75.75 0 1 1 1.06 1.06L9.06 8l3.47 3.47a.75.75 0 1 1-1.06 1.06L8 9.06l-3.47 3.47a.75.75 0 0 1-1.06-1.06L6.94 8 3.47 4.53a.75.75 0 0 1 0-1.06Z" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, padding: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                    {/* Top Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', color: '#72706b' }}>
                            {currentSelection.length} de {availableColumns.length} columnas visibles
                        </span>
                        <span style={{ display: 'flex', gap: '16px' }}>
                            <button className="v-enlace" onClick={handleClear}>
                                Quitar todas
                            </button>
                            <button className="v-enlace" onClick={handleReset}>
                                Seleccionar todas
                            </button>
                        </span>
                    </div>

                    <div style={{ display: 'flex', flex: 1, gap: '20px', overflow: 'hidden' }}>

                        {/* Left Column: Available */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <span className="v-etiqueta" style={{ marginBottom: '8px' }}>Columnas disponibles</span>
                            <div style={{ position: 'relative', marginBottom: '8px' }}>
                                <input
                                    type="text"
                                    placeholder="Buscar columnas"
                                    value={searchTermAvailable}
                                    onChange={e => setSearchTermAvailable(e.target.value)}
                                    className="v-campo" style={{ paddingLeft: '30px' }}
                                />
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#72706b" strokeWidth="2" style={{ position: 'absolute', left: '10px', top: '9px' }}>
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                            </div>
                            <div className="v-lista" style={{ flex: 1 }}>
                                {Object.keys(filteredGroups).sort().map(cat => {
                                    const props = filteredGroups[cat];
                                    const isExpanded = expandedCategories[cat] || searchTermAvailable.length > 0;
                                    const selectedCount = props.filter(p => currentSelection.includes(p.id)).length;

                                    return (
                                        <div key={cat} style={{ borderBottom: '1px solid #e8e6dc' }}>
                                            <div
                                                onClick={() => toggleCategory(cat)}
                                                style={{
                                                    padding: '10px 12px', fontSize: '13px', cursor: 'pointer', display: 'flex',
                                                    justifyContent: 'space-between', background: '#f1f0e8', alignItems: 'center'
                                                }}
                                            >
                                                <span style={{ fontWeight: 600, color: '#141413' }}>
                                                    {isExpanded ? '▾' : '▸'} {cat}
                                                </span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ color: '#72706b', fontSize: '11px' }}>
                                                        {selectedCount} de {props.length}
                                                    </span>
                                                    <input 
                                                        type="checkbox"
                                                        checked={selectedCount === props.length}
                                                        ref={input => {
                                                            if (input) input.indeterminate = selectedCount > 0 && selectedCount < props.length;
                                                        }}
                                                        onClick={(e) => toggleCategorySelection(e, props)}
                                                        onChange={() => {}}
                                                        style={{ cursor: 'pointer', accentColor: '#6a9bcc', width: '14px', height: '14px' }}
                                                    />
                                                </div>
                                            </div>
                                            {isExpanded && (
                                                <div style={{ background: '#ffffff' }}>
                                                    {props.map(prop => {
                                                        const isAdded = currentSelection.includes(prop.id);
                                                        return (
                                                            <div
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
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Right Column: Selected (Draggable) */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <span className="v-etiqueta" style={{ marginBottom: '8px' }}>Columnas visibles (arrastra para ordenar)</span>
                            <div style={{ position: 'relative', marginBottom: '8px' }}>
                                <input
                                    type="text"
                                    placeholder="Buscar"
                                    value={searchTermSelected}
                                    onChange={e => setSearchTermSelected(e.target.value)}
                                    className="v-campo" style={{ paddingLeft: '30px' }}
                                />
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#72706b" strokeWidth="2" style={{ position: 'absolute', left: '10px', top: '9px' }}>
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                            </div>
                            <div className="v-lista" style={{ flex: 1 }}>
                                {selectedObjects.map((item, idx) => (
                                    <div
                                        key={item.id}
                                        draggable
                                        onDragStart={(e) => {
                                            dragItem.current = idx;
                                            e.currentTarget.style.opacity = '0.5';
                                        }}
                                        onDragEnter={() => {
                                            dragOverItem.current = idx;
                                        }}
                                        onDragEnd={(e) => {
                                            e.currentTarget.style.opacity = '1';
                                            handleSort();
                                        }}
                                        onDragOver={(e) => e.preventDefault()}
                                        style={{
                                            padding: '8px 8px 8px 12px', borderBottom: '1px solid #e8e6dc', fontSize: '13px',
                                            display: 'flex', alignItems: 'center', background: '#ffffff', gap: '8px',
                                            cursor: 'move'
                                        }}
                                    >
                                        {/* Grip Icon */}
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#72706b">
                                            <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
                                        </svg>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ color: '#141413', fontWeight: 500 }}>{item.name}</div>
                                            <div style={{ fontSize: '11px', color: '#72706b' }}>{item.category}</div>
                                        </div>
                                        <button className="v-icono"
                                            onClick={(e) => { e.stopPropagation(); handleRemove(item.id); }}
                                            title="Quitar" aria-label={`Quitar ${item.name}`}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
                                        </button>
                                    </div>
                                ))}
                                {selectedObjects.length === 0 && (
                                    <div style={{ padding: '20px', textAlign: 'center', color: '#72706b', fontStyle: 'italic', fontSize: '12px' }}>
                                        Ninguna columna seleccionada
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>

                {/* Footer */}
                <div className="v-pie">
                    <button className="v-boton" onClick={onClose}>
                        Cancelar
                    </button>
                    <button className="v-boton v-boton--principal" onClick={handleSave}>
                        Aplicar
                    </button>
                </div>

            </div>
        </div>,
        document.body
    );
};

export default ColumnConfiguratorModal;
