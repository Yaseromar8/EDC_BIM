import React, { useState, useEffect, useMemo, useRef } from 'react';

const DEFAULT_SELECTION = [
    'Standard::Sources',
    'Tandem Category'
];

const FilterConfiguratorModal = ({ open, onClose, availableProperties = [], selectedProperties = [], onUpdate }) => {
    // Local state
    const [currentSelection, setCurrentSelection] = useState([]);
    const [searchTermAvailable, setSearchTermAvailable] = useState('');
    const [searchTermSelected, setSearchTermSelected] = useState('');
    const [expandedCategories, setExpandedCategories] = useState({});

    // Drag & Drop state
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);

    useEffect(() => {
        if (open) {
            // Initialize with props or default if empty/invalid
            // We accept whatever comes from props as the "current state"
            setCurrentSelection(Array.isArray(selectedProperties) ? [...selectedProperties] : [...DEFAULT_SELECTION]);
        }
    }, [open, selectedProperties]);

    // --- LOGIC: AVAILABLE ---
    const groupedProperties = useMemo(() => {
        const groups = {};
        availableProperties.forEach(prop => {
            const cat = prop.category || 'Other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(prop);
        });
        return groups;
    }, [availableProperties]);

    const filteredGroups = useMemo(() => {
        if (!searchTermAvailable) return groupedProperties;
        const result = {};
        const lowerTerm = searchTermAvailable.toLowerCase();

        Object.keys(groupedProperties).forEach(cat => {
            const matchesCategory = cat.toLowerCase().includes(lowerTerm);
            const matchingProps = groupedProperties[cat].filter(p => p.name.toLowerCase().includes(lowerTerm));

            if (matchesCategory || matchingProps.length > 0) {
                result[cat] = matchesCategory ? groupedProperties[cat] : matchingProps;
            }
        });
        return result;
    }, [groupedProperties, searchTermAvailable]);

    // --- LOGIC: SELECTED ---
    const selectedObjects = useMemo(() => {
        return currentSelection.map((id, index) => {
            const found = availableProperties.find(p => p.id === id);
            return {
                originalIndex: index, // keep track of order
                ...(found || {
                    id,
                    name: id.includes('::') ? id.split('::')[1] : id,
                    category: id.includes('::') ? id.split('::')[0] : 'System'
                })
            };
        }).filter(item => {
            if (!searchTermSelected) return true;
            return item.name.toLowerCase().includes(searchTermSelected.toLowerCase());
        });
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
        // Duplicate items
        let _list = [...currentSelection];

        // Remove and save the dragged item content
        const draggedItemContent = _list.splice(dragItem.current, 1)[0];

        // Switch the position
        _list.splice(dragOverItem.current, 0, draggedItemContent);

        // Reset position references
        dragItem.current = null;
        dragOverItem.current = null;

        // Update state
        setCurrentSelection(_list);
    };

    if (!open) return null;

    return (
        <div className="filter-config-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 3000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div className="filter-config-modal" style={{
                background: '#2a2a2a', width: '800px', height: '600px',
                borderRadius: '4px', display: 'flex', flexDirection: 'column',
                boxShadow: '0 10px 40px rgba(0,0,0,0.5)', border: '1px solid #3e4045',
                color: '#ececec', fontFamily: 'Artifakt Element, sans-serif'
            }}>

                {/* Header */}
                <div className="fc-header" style={{
                    padding: '16px 20px', borderBottom: '1px solid #3e4045',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '0.5px', color: '#fff' }}>EDIT FILTERS</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M3.47 3.47a.75.75 0 0 1 1.06 0L8 6.94l3.47-3.47a.75.75 0 1 1 1.06 1.06L9.06 8l3.47 3.47a.75.75 0 1 1-1.06 1.06L8 9.06l-3.47 3.47a.75.75 0 0 1-1.06-1.06L6.94 8 3.47 4.53a.75.75 0 0 1 0-1.06Z" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="fc-body" style={{ flex: 1, padding: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                    {/* Top Row: Reset Button Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                        <button
                            onClick={handleReset}
                            style={{
                                background: 'transparent', color: '#3aa0ff', border: 'none',
                                fontSize: '13px', cursor: 'pointer', fontWeight: 500, padding: 0
                            }}
                        >
                            Reset default
                        </button>
                    </div>

                    <div className="fc-columns" style={{ display: 'flex', flex: 1, gap: '20px', overflow: 'hidden' }}>

                        {/* Left Column: Available */}
                        <div className="fc-column" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: '#bbb' }}>Available Properties:</span>
                            <div className="fc-search" style={{ position: 'relative', marginBottom: '8px' }}>
                                <input
                                    type="text"
                                    placeholder="Search"
                                    value={searchTermAvailable}
                                    onChange={e => setSearchTermAvailable(e.target.value)}
                                    style={{
                                        width: '100%', padding: '6px 8px 6px 30px', background: '#222', border: '1px solid #444',
                                        borderRadius: '2px', color: '#fff', fontSize: '13px'
                                    }}
                                />
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" style={{ position: 'absolute', left: '8px', top: '8px' }}>
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                            </div>
                            <div className="fc-list" style={{ flex: 1, border: '1px solid #3e4045', borderRadius: '2px', overflowY: 'auto', background: '#1f2227' }}>
                                {Object.keys(filteredGroups).sort().map(cat => {
                                    const props = filteredGroups[cat];
                                    const isExpanded = expandedCategories[cat] || searchTermAvailable.length > 0;

                                    return (
                                        <div key={cat} style={{ borderBottom: '1px solid #333' }}>
                                            <div
                                                onClick={() => toggleCategory(cat)}
                                                style={{
                                                    padding: '10px 12px', fontSize: '13px', cursor: 'pointer', display: 'flex',
                                                    justifyContent: 'space-between', background: '#25282d', alignItems: 'center'
                                                }}
                                            >
                                                <span style={{ fontWeight: 600, color: '#f0f0f0' }}>{cat}</span>
                                                <span style={{ color: '#666', fontSize: '11px' }}>{props.length}</span>
                                            </div>
                                            {isExpanded && (
                                                <div style={{ background: '#1a1d21' }}>
                                                    {props.map(prop => {
                                                        const isAdded = currentSelection.includes(prop.id);
                                                        return (
                                                            <div
                                                                key={prop.id}
                                                                onClick={() => !isAdded && handleAdd(prop.id)}
                                                                style={{
                                                                    padding: '6px 12px 6px 24px', fontSize: '12px',
                                                                    color: isAdded ? '#555' : '#ccc',
                                                                    cursor: isAdded ? 'default' : 'pointer',
                                                                    display: 'flex', alignItems: 'center', transition: 'background 0.1s'
                                                                }}
                                                                onMouseEnter={e => !isAdded && (e.currentTarget.style.background = '#30343a')}
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
                        <div className="fc-column" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: '#bbb' }}>Selected Properties:</span>
                            <div className="fc-search" style={{ position: 'relative', marginBottom: '8px' }}>
                                <input
                                    type="text"
                                    placeholder="Search"
                                    value={searchTermSelected}
                                    onChange={e => setSearchTermSelected(e.target.value)}
                                    style={{
                                        width: '100%', padding: '6px 8px 6px 30px', background: '#222', border: '1px solid #444',
                                        borderRadius: '2px', color: '#fff', fontSize: '13px'
                                    }}
                                />
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" style={{ position: 'absolute', left: '8px', top: '8px' }}>
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                            </div>
                            <div className="fc-list" style={{ flex: 1, border: '1px solid #3e4045', borderRadius: '2px', overflowY: 'auto', background: '#1f2227' }}>
                                {selectedObjects.map((item, idx) => (
                                    <div
                                        key={item.id}
                                        draggable
                                        onDragStart={(e) => {
                                            dragItem.current = idx;
                                            e.currentTarget.style.opacity = '0.5';
                                        }}
                                        onDragEnter={(e) => {
                                            dragOverItem.current = idx;
                                        }}
                                        onDragEnd={(e) => {
                                            e.currentTarget.style.opacity = '1';
                                            handleSort();
                                        }}
                                        onDragOver={(e) => e.preventDefault()}
                                        style={{
                                            padding: '8px 12px', borderBottom: '1px solid #333', fontSize: '13px',
                                            display: 'flex', alignItems: 'center', background: '#25282d', gap: '8px',
                                            cursor: 'move'
                                        }}
                                    >
                                        {/* 3-Lines Grip Icon */}
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#666">
                                            <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
                                        </svg>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ color: '#fff', fontWeight: 500 }}>{item.name}</div>
                                            <div style={{ fontSize: '11px', color: '#666' }}>{item.category} &gt; {item.name}</div>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleRemove(item.id); }}
                                            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '4px' }}
                                            title="Remove"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
                                        </button>
                                    </div>
                                ))}
                                {selectedObjects.length === 0 && (
                                    <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontStyle: 'italic', fontSize: '12px' }}>
                                        No properties selected
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>

                    <div className="fc-options" style={{ marginTop: '20px', borderTop: '1px solid #3e4045', paddingTop: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#bbb' }}>Element Visibility:</span>
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: '#ccc', marginBottom: '8px', cursor: 'pointer' }}>
                            <input type="checkbox" style={{ marginRight: '8px' }} />
                            Hide location categories (Levels, Rooms, and Spaces) from graphics and filter results
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: '#ccc', cursor: 'pointer' }}>
                            <input type="checkbox" style={{ marginRight: '8px' }} />
                            Include elements spanning multiple levels in each level's filters
                        </label>
                    </div>

                </div>

                {/* Footer */}
                <div className="fc-footer" style={{
                    padding: '16px 20px', borderTop: '1px solid #3e4045',
                    display: 'flex', justifyContent: 'flex-end', gap: '10px'
                }}>
                    <button onClick={onClose} style={{
                        padding: '6px 16px', background: 'transparent', border: '1px solid #666',
                        color: '#ececec', borderRadius: '4px', cursor: 'pointer', fontSize: '13px'
                    }}>
                        Cancel
                    </button>
                    <button onClick={handleSave} style={{
                        padding: '6px 16px', background: '#3aa0ff', border: 'none',
                        color: '#fff', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 600
                    }}>
                        Update
                    </button>
                </div>

            </div>
        </div>
    );
};

export default FilterConfiguratorModal;
