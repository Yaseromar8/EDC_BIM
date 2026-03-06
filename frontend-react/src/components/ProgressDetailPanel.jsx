
import React, { useState, useMemo, useRef, useEffect } from 'react';

const ProgressDetailPanel = ({ isOpen, onClose, pin, elementProps, onDelete, isDocked = true, onToggleDock, onUpdatePin, availablePartidas = [] }) => {
    // State for Partida dropdown
    const [partidaDropdownOpen, setPartidaDropdownOpen] = useState(false);
    const [partidaSearch, setPartidaSearch] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(-1); // Keyboard nav index
    const dropdownRef = useRef(null);
    const searchInputRef = useRef(null);
    const optionsContainerRef = useRef(null); // Ref for scrolling

    // State for METRADO Table
    const [parametroBase, setParametroBase] = useState(''); // The selected "Header" parameter name
    const [parametroBaseOpen, setParametroBaseOpen] = useState(false); // Dropdown for header
    const [headerHighlightIndex, setHeaderHighlightIndex] = useState(-1); // Keyboard nav for Header
    // const [headerSearch, setHeaderSearch] = useState(''); // REMOVED SEARCH per user request
    const headerDropdownRef = useRef(null);
    // const headerInputRef = useRef(null); // REMOVED
    const headerOptionsRef = useRef(null);
    const [metradoRows, setMetradoRows] = useState([]); // Start empty, auto-fill by default

    // State for Row Dropdowns (Replaces native select)
    const [openRowDropdownId, setOpenRowDropdownId] = useState(null); // ID of the row with open dropdown
    const [rowHighlightIndex, setRowHighlightIndex] = useState(-1); // Keyboard nav index for row dropdown
    const rowDropdownRef = useRef(null);
    const rowOptionsRef = useRef(null); // Ref for scrolling options in row dropdown

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setPartidaDropdownOpen(false);
                setPartidaSearch('');
                setHighlightedIndex(-1);
            }
            if (headerDropdownRef.current && !headerDropdownRef.current.contains(e.target)) {
                setParametroBaseOpen(false);
                setHeaderHighlightIndex(-1);
                // setHeaderSearch('');
            }
            if (rowDropdownRef.current && !rowDropdownRef.current.contains(e.target)) {
                setOpenRowDropdownId(null);
                setRowHighlightIndex(-1);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [partidaDropdownOpen, parametroBaseOpen, openRowDropdownId]);

    // Auto-focus Partida search
    useEffect(() => {
        if (partidaDropdownOpen) {
            setHighlightedIndex(-1);
            if (searchInputRef.current) setTimeout(() => searchInputRef.current?.focus(), 50);
        }
    }, [partidaDropdownOpen]);

    // Auto-focus Header Container (since search is gone)
    // useEffect(() => {
    //     if (parametroBaseOpen) {
    //         setHeaderHighlightIndex(-1);
    //         // if (headerInputRef.current) setTimeout(() => headerInputRef.current?.focus(), 50);
    //     }
    // }, [parametroBaseOpen]);

    // Scroll highlighted Partida into view
    useEffect(() => {
        if (highlightedIndex >= 0 && optionsContainerRef.current) {
            const option = optionsContainerRef.current.children[highlightedIndex];
            if (option) option.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [highlightedIndex]);

    // Scroll highlighted Header Option into view
    useEffect(() => {
        if (headerHighlightIndex >= 0 && headerOptionsRef.current) {
            const option = headerOptionsRef.current.children[headerHighlightIndex];
            if (option) option.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [headerHighlightIndex]);

    // Scroll highlighted Row Option into view
    useEffect(() => {
        if (rowHighlightIndex >= 0 && rowOptionsRef.current) {
            const option = rowOptionsRef.current.children[rowHighlightIndex];
            if (option) option.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [rowHighlightIndex]);

    // Filtered Partidas
    const filteredPartidas = useMemo(() => {
        if (!partidaSearch.trim()) return availablePartidas;
        const q = partidaSearch.toLowerCase();
        return availablePartidas.filter(p =>
            (p.code && p.code.toLowerCase().includes(q)) ||
            (p.name && p.name.toLowerCase().includes(q))
        );
    }, [availablePartidas, partidaSearch]);

    // ────────── METRADO LOGIC ──────────

    // 1. Extract potential "Base Parameters"
    const allAvailableParams = useMemo(() => {
        if (!elementProps) return [];
        // Strict Filter
        let names = elementProps
            .map(p => p.displayName)
            .filter(name => name.includes('_') || name.startsWith('DSI') || name.includes('Metrado'));

        // Fallback: If strict filter returns nothing, show meaningful props (exclude obvious junk)
        if (names.length === 0) {
            names = elementProps
                .map(p => p.displayName)
                .filter(name => !name.startsWith('__') && !name.includes('GUID') && !name.startsWith('Item'));
        }

        return [...new Set(names)].sort();
    }, [elementProps]);

    // Filtered Header Parameters (No search input anymore)
    const filteredHeaders = allAvailableParams;

    // 2. Helper to find value by name (handling suffixes)
    const getValueForBase = (baseName, groupIndex) => {
        if (!elementProps) return null;
        const suffix = groupIndex === 0 ? '' : String(groupIndex);
        const targetName = baseName + suffix;
        const prop = elementProps.find(p => p.displayName === targetName);
        return prop ? prop.displayValue : null;
    };

    // Find Unit and Metrado for a given Group Index
    const getDataForGroup = (groupIndex) => {
        if (!elementProps) return { unit: '', metrado: '' };

        const suffix = groupIndex === 0 ? '' : String(groupIndex);

        // Find Unit prop
        const unitProp = elementProps.find(p =>
            p.displayName && (
                p.displayName.endsWith('Unidad' + suffix) ||
                p.displayName.endsWith('_Unidad' + suffix)
            )
        );
        const unit = unitProp ? String(unitProp.displayValue) : '';

        // Find Metrado prop based on Unit or broad search
        let metradoVal = '';

        const u = unit.toLowerCase();
        const isVol = u.includes('m3') || u.includes('cub');
        const isArea = u.includes('m2') || u.includes('cua');
        const isLen = u.includes('m') && !isVol && !isArea;
        const isKg = u.includes('kg') || u.includes('ton');

        let targets = [];
        if (isVol) targets = ['Volumen', 'Volume', 'Metrado'];
        else if (isArea) targets = ['Area', 'Área', 'Metrado'];
        else if (isLen) targets = ['Longitud', 'Length', 'Metrado'];
        else if (isKg) targets = ['Peso', 'Weight', 'Metrado'];
        else targets = ['Metrado', 'Cantidad', 'Cant', 'Ctd', 'Valor'];

        const meatradoProp = elementProps.find(p => {
            return p.displayName && targets.some(t =>
                p.displayName.endsWith(t + suffix) ||
                p.displayName.endsWith(t + '_' + suffix) ||
                p.displayName.endsWith('_' + t + suffix)
            );
        });

        if (meatradoProp) {
            metradoVal = meatradoProp.displayValue;
            if (!isNaN(parseFloat(metradoVal))) {
                const num = parseFloat(metradoVal);
                if (Number.isInteger(num)) metradoVal = num.toString();
                else metradoVal = num.toFixed(2);
            }
        }

        return { unit, metrado: metradoVal || (unit ? 'NA' : '') };
    };

    // 3. Get All Available Options/Rows for selected base
    const allGroupOptions = useMemo(() => {
        if (!parametroBase || !elementProps) return [];
        const options = [];
        // Scan up to 20 groups
        for (let i = 0; i < 20; i++) {
            const val = getValueForBase(parametroBase, i);
            if (val) {
                const extra = getDataForGroup(i);
                options.push({
                    groupIndex: i,
                    label: val,
                    ...extra
                });
            }
        }
        return options;
    }, [parametroBase, elementProps]);

    // AUTO-POPULATE ROWS when base parameter changes
    useEffect(() => {
        // CHANGED: Default to SINGLE EMPTY ROW so user can "Choose"
        if (parametroBase) {
            setMetradoRows([{ id: 1, selectedVal: '', unit: '', metrado: '' }]);
        } else {
            setMetradoRows([]);
        }
    }, [parametroBase]);


    const handleSelectPartida = (partida) => {
        if (onUpdatePin) {
            onUpdatePin(pin.id, { codigoPartida: partida.code, partidaNombre: partida.name || null });
        }
        setParametroBase('');
        setMetradoRows([]);

        setPartidaDropdownOpen(false);
        setPartidaSearch('');
        setHighlightedIndex(-1);
    };

    const handleSelectHeader = (param) => {
        setParametroBase(param);
        setParametroBaseOpen(false);
        // setHeaderSearch('');
        setHeaderHighlightIndex(-1);
    };

    // KeyDown Handler: Partida Dropdown
    const handlePartidaKeyDown = (e) => {
        if (!partidaDropdownOpen) {
            if (e.key === 'Enter' || e.key === 'ArrowDown') setPartidaDropdownOpen(true);
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev < filteredPartidas.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && filteredPartidas[highlightedIndex]) {
                handleSelectPartida(filteredPartidas[highlightedIndex]);
            }
        } else if (e.key === 'Escape') {
            setPartidaDropdownOpen(false);
        }
    };

    // KeyDown Handler: Header Dropdown
    const handleHeaderKeyDown = (e) => {
        if (!parametroBaseOpen) {
            if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
                e.preventDefault();
                setParametroBaseOpen(true);
                setHeaderHighlightIndex(-1);
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHeaderHighlightIndex(prev => (prev < filteredHeaders.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHeaderHighlightIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (headerHighlightIndex >= 0 && filteredHeaders[headerHighlightIndex]) {
                handleSelectHeader(filteredHeaders[headerHighlightIndex]);
            }
        } else if (e.key === 'Escape') {
            setParametroBaseOpen(false);
            setHeaderHighlightIndex(-1);
        }
    };

    // KeyDown Handler: Row Dropdown
    const handleRowDropdownKeyDown = (e, rowId) => {
        if (openRowDropdownId !== rowId) {
            if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
                e.preventDefault();
                setOpenRowDropdownId(rowId);
                setRowHighlightIndex(-1);
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setRowHighlightIndex(prev => (prev < allGroupOptions.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setRowHighlightIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (rowHighlightIndex >= 0 && allGroupOptions[rowHighlightIndex]) {
                handleRowChange(rowId, allGroupOptions[rowHighlightIndex].label);
                setOpenRowDropdownId(null);
            }
        } else if (e.key === 'Escape') {
            setOpenRowDropdownId(null);
            setRowHighlightIndex(-1);
        }
    };


    const toggleRowDropdown = (rowId) => {
        if (openRowDropdownId === rowId) {
            setOpenRowDropdownId(null);
            setRowHighlightIndex(-1);
        } else {
            setOpenRowDropdownId(rowId);
            setRowHighlightIndex(-1);
        }
    };

    const handleRowChange = (rowId, labelValue) => {
        const option = allGroupOptions.find(o => o.label === labelValue);
        setMetradoRows(prev => prev.map(row => {
            if (row.id === rowId) {
                if (!option) return { ...row, selectedVal: labelValue, unit: '', metrado: '' };
                return {
                    ...row,
                    selectedVal: option.label,
                    unit: option.unit,
                    metrado: option.metrado
                };
            }
            return row;
        }));
    };

    const addRow = () => {
        const newId = Math.max(...metradoRows.map(r => r.id), 0) + 1;
        setMetradoRows(prev => [...prev, { id: newId, selectedVal: '', unit: '', metrado: '' }]);
    };

    const removeRow = (id) => {
        setMetradoRows(prev => prev.filter(r => r.id !== id));
    };


    if (!isOpen || !pin) return null;

    // Parse percentage safely
    const val = pin.val || "0%";
    const valNum = parseInt(val.replace(/\D/g, ''), 10) || 0;

    let color = '#ef4444'; // Red
    if (valNum >= 100) color = '#22c55e'; // Green
    else if (valNum >= 50) color = '#eab308'; // Yellow

    // ────────── FLOATING / PiP MODE ──────────
    if (!isDocked) {
        return (
            <div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                color: '#fff',
                fontFamily: 'Inter, sans-serif',
                overflow: 'hidden',
                borderRadius: 'inherit'
            }}>
                <div style={{
                    padding: '8px 12px',
                    background: 'rgba(255,255,255,0.06)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)'
                }}>
                    <span style={{ fontSize: '11px', color: '#aaa', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        AVANCE · {pin.id?.substring(0, 8)}
                    </span>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button onClick={onToggleDock} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#ccc', width: '26px', height: '26px', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" y1="3" x2="12" y2="21" /></svg>
                        </button>
                        <button onClick={onClose} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: '#888', width: '26px', height: '26px', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
                    </div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px', cursor: 'pointer' }} onClick={onToggleDock}>
                    <div style={{ fontSize: '36px', fontWeight: '800', color: color, textShadow: `0 0 20px ${color}40`, lineHeight: 1.1 }}>{val}</div>
                    <div style={{ width: '120px', height: '5px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', marginTop: '10px', overflow: 'hidden' }}>
                        <div style={{ width: val, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.3s ease' }}></div>
                    </div>
                </div>
            </div>
        );
    }

    // ────────── DOCKED / FULL MODE ──────────
    return (
        <div style={{
            background: '#1a1b1e',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            color: '#fff',
            fontFamily: 'Inter, sans-serif'
        }}>
            <header style={{
                padding: '16px 20px',
                background: '#23252a',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '32px', height: '32px',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '6px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: color
                    }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                            <polyline points="17 6 23 6 23 12"></polyline>
                        </svg>
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Detalle de Avance</h3>
                        <span style={{ fontSize: '12px', color: '#888' }}>ID: {pin.id}</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {onToggleDock && (
                        <button onClick={onToggleDock} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#ccc', width: '32px', height: '32px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="14" rx="2" /><rect x="12" y="10" width="10" height="10" rx="1" fill="currentColor" opacity="0.3" /></svg>
                        </button>
                    )}
                    <button onClick={() => { if (window.confirm('¿Eliminar registro?')) { onDelete(pin.id); onClose(); } }} style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', width: '32px', height: '32px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Eliminar">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: '24px', cursor: 'pointer' }}>&times;</button>
                </div>
            </header>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, overflowY: 'auto' }}>

                {/* ═══════ PARTIDA ASOCIADA (Excel-like 2-cell Row) ═══════ */}
                <div style={{ width: '100%', marginBottom: '24px', position: 'relative' }} ref={dropdownRef}>
                    <div style={{ marginBottom: '6px', fontSize: '11px', color: '#888', fontWeight: 600, paddingLeft: '2px', textTransform: 'uppercase' }}>
                        Partida Asociada
                    </div>

                    <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                        {/* CELL 1: Code */}
                        <div onClick={() => setPartidaDropdownOpen(prev => !prev)} style={{ width: '130px', flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.2)', padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: partidaDropdownOpen ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.02)', transition: 'background 0.2s' }} title="Click para seleccionar partida">
                            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: pin.codigoPartida ? '#fff' : '#666', fontWeight: pin.codigoPartida ? 600 : 400 }}>{pin.codigoPartida || 'Seleccionar...'}</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.6 }}><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </div>
                        {/* CELL 2: Name */}
                        <div style={{ flex: 1, padding: '8px 12px', display: 'flex', alignItems: 'center', overflow: 'hidden', background: 'rgba(0,0,0,0.2)' }}>
                            <span style={{ fontSize: '10px', color: pin.partidaNombre ? '#ddd' : '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontStyle: pin.partidaNombre ? 'normal' : 'italic', lineHeight: '1.2' }} title={pin.partidaNombre || ''}>{pin.partidaNombre || 'Sin descripción'}</span>
                        </div>
                    </div>

                    {/* Partida Dropdown */}
                    {partidaDropdownOpen && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '2px', background: '#2a2d32', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 1000, maxHeight: '300px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <div style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder="Buscar código o nombre..."
                                    value={partidaSearch}
                                    onChange={(e) => setPartidaSearch(e.target.value)}
                                    onKeyDown={handlePartidaKeyDown}
                                    style={{ width: '100%', padding: '6px 8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '3px', color: '#fff', fontSize: '12px', outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div ref={optionsContainerRef} style={{ overflowY: 'auto', flex: 1 }}>
                                {filteredPartidas.length === 0 ? <div style={{ padding: '12px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Sin resultados</div> : filteredPartidas.map((partida, idx) => (
                                    <div
                                        key={partida.code}
                                        onClick={() => handleSelectPartida(partida)}
                                        onMouseEnter={() => setHighlightedIndex(idx)}
                                        style={{
                                            padding: '8px 10px',
                                            cursor: 'pointer',
                                            borderBottom: idx < filteredPartidas.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                                            background: highlightedIndex === idx ? 'rgba(34,197,94,0.15)' : (pin.codigoPartida === partida.code ? 'rgba(34,197,94,0.08)' : 'transparent'),
                                            transition: 'background 0.1s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px'
                                        }}
                                    >
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 600, color: (highlightedIndex === idx || pin.codigoPartida === partida.code) ? '#22c55e' : '#ddd' }}>{partida.code}</div>
                                            {partida.name && <div style={{ fontSize: '10px', color: '#888', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{partida.name}</div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ═══════ TABLA DE METRADO (Dynamic) ═══════ */}
                {pin.codigoPartida && (
                    <div style={{ width: '100%', marginBottom: '24px' }} ref={headerDropdownRef}>
                        <div style={{ marginBottom: '6px', fontSize: '11px', color: '#888', fontWeight: 600, paddingLeft: '2px', textTransform: 'uppercase' }}>
                            Planilla de Metrado
                        </div>

                        {/* REMOVED overflow: hidden to allow dropdowns to show */}
                        <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px' }}>
                            {/* TABLE HEADER - Added border-top-radius manually */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 2fr) 60px 80px', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)', borderTopLeftRadius: '4px', borderTopRightRadius: '4px' }}>
                                {/* Header 1: Configurable Parameter (NO SEARCH INPUT) */}
                                <div style={{ padding: '6px 10px', position: 'relative', borderRight: '1px solid rgba(255,255,255,0.1)' }} ref={headerDropdownRef}>
                                    <div
                                        onClick={() => setParametroBaseOpen(!parametroBaseOpen)}
                                        tabIndex={0}
                                        onKeyDown={handleHeaderKeyDown}
                                        style={{ fontSize: '10px', fontWeight: 700, color: '#aaa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', outline: 'none' }}
                                    >
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                                            {parametroBase || 'SELECCIONAR PARAMETRO'}
                                        </span>
                                        <span style={{ fontSize: '8px' }}>▼</span>
                                    </div>
                                    {/* Header Dropdown List - Enhanced zIndex */}
                                    {parametroBaseOpen && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, width: '250px', background: '#2a2d32', border: '1px solid #444', zIndex: 10000, maxHeight: '200px', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                                            <div ref={headerOptionsRef} style={{ overflowY: 'auto', flex: 1 }}>
                                                {filteredHeaders.length > 0 ? filteredHeaders.map((p, idx) => (
                                                    <div
                                                        key={p}
                                                        onClick={() => handleSelectHeader(p)}
                                                        onMouseEnter={() => setHeaderHighlightIndex(idx)}
                                                        style={{
                                                            padding: '8px 10px',
                                                            fontSize: '11px',
                                                            color: '#ddd',
                                                            cursor: 'pointer',
                                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                            background: headerHighlightIndex === idx ? 'rgba(59,130,246,0.2)' : (parametroBase === p ? 'rgba(59,130,246,0.1)' : 'transparent'),
                                                            wordBreak: 'break-all'
                                                        }}
                                                    >
                                                        {p}
                                                    </div>
                                                )) : <div style={{ padding: '8px', color: '#666', fontSize: '10px' }}>Sin parámetros</div>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div style={{ padding: '6px 4px', fontSize: '10px', fontWeight: 700, color: '#aaa', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>UND.</div>
                                <div style={{ padding: '6px 4px', fontSize: '10px', fontWeight: 700, color: '#aaa', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>METRADO</div>
                            </div>

                            {/* TABLE BODY: Rows */}
                            {metradoRows.map((row, index) => (
                                <div key={row.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 2fr) 60px 80px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                                    {/* Cell 1: Custom Dropdown for Description (NO NATIVE SELECT) */}
                                    <div style={{ borderRight: '1px solid rgba(255,255,255,0.1)', position: 'relative' }} ref={openRowDropdownId === row.id ? rowDropdownRef : null}>
                                        <div
                                            onClick={() => !(!parametroBase) && toggleRowDropdown(row.id)}
                                            tabIndex={0}
                                            onKeyDown={(e) => handleRowDropdownKeyDown(e, row.id)}
                                            style={{
                                                width: '100%', height: '100%',
                                                background: 'transparent',
                                                color: row.selectedVal ? '#fff' : '#666',
                                                padding: '6px 8px',
                                                fontSize: '10px',
                                                cursor: parametroBase ? 'pointer' : 'default',
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                outline: 'none'
                                            }}
                                        >
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {row.selectedVal || (parametroBase ? 'Seleccionar...' : 'Configurar encabezado')}
                                            </span>
                                            {parametroBase && <span style={{ fontSize: '8px', opacity: 0.5 }}>▼</span>}
                                        </div>

                                        {/* Dropdown Options List */}
                                        {openRowDropdownId === row.id && (
                                            <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', minWidth: '150px', background: '#2a2d32', border: '1px solid #444', zIndex: 999, maxHeight: '150px', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                                                <div ref={rowOptionsRef} style={{ overflowY: 'auto', flex: 1 }}>
                                                    {allGroupOptions.length > 0 ? allGroupOptions.map((opt, idx) => (
                                                        <div
                                                            key={idx}
                                                            onClick={() => {
                                                                handleRowChange(row.id, opt.label);
                                                                setOpenRowDropdownId(null);
                                                            }}
                                                            onMouseEnter={() => setRowHighlightIndex(idx)}
                                                            style={{
                                                                padding: '6px 8px',
                                                                fontSize: '10px',
                                                                color: '#ddd',
                                                                cursor: 'pointer',
                                                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                                background: rowHighlightIndex === idx ? 'rgba(59,130,246,0.2)' : (row.selectedVal === opt.label ? 'rgba(59,130,246,0.1)' : 'transparent'),
                                                                wordBreak: 'break-all'
                                                            }}
                                                        >
                                                            {opt.label}
                                                        </div>
                                                    )) : <div style={{ padding: '8px', color: '#666', fontSize: '10px' }}>Sin opciones</div>}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Cell 2: Unit */}
                                    <div style={{ borderRight: '1px solid rgba(255,255,255,0.1)', padding: '6px 4px', fontSize: '10px', color: '#ccc', textAlign: 'center', background: 'rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {row.unit}
                                    </div>
                                    {/* Cell 3: Metrado */}
                                    <div style={{ padding: '6px 4px', fontSize: '10px', color: '#fff', textAlign: 'center', fontWeight: 600, background: 'rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                        {row.metrado}
                                        {metradoRows.length > 1 && (
                                            <div onClick={() => removeRow(row.id)} style={{ cursor: 'pointer', color: '#ef4444', marginLeft: 'auto', opacity: 0.5, fontSize: '14px', fontWeight: 'bold' }}>&times;</div>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {/* ADD ROW BUTTON */}
                            {parametroBase && (
                                <div onClick={addRow} style={{ padding: '6px', textAlign: 'center', cursor: 'pointer', background: 'rgba(59,130,246,0.1)', fontSize: '10px', color: '#60a5fa', fontWeight: 600, borderTop: '1px solid rgba(59,130,246,0.2)' }}>
                                    + Agregar Item
                                </div>
                            )}
                        </div>
                    </div>
                )}


                {/* Percentage Display */}
                <div style={{ fontSize: '64px', fontWeight: '800', color: color, textShadow: `0 0 30px ${color}40`, marginTop: '10px' }}>{val}</div>
                <div style={{ marginTop: '10px', color: '#888', fontSize: '14px' }}>Avance registrado</div>
                <div style={{ width: '200px', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', marginTop: '20px', overflow: 'hidden' }}>
                    <div style={{ width: val, height: '100%', background: color, borderRadius: '4px' }}></div>
                </div>

                {/* Coordinates & Metadata */}
                <div style={{ marginTop: '30px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', width: '100%', maxWidth: '350px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
                        <span style={{ color: '#888' }}>Coordenadas:</span>
                        <span style={{ color: '#eee', fontFamily: 'monospace' }}>
                            {pin.x?.toFixed(2)}, {pin.y?.toFixed(2)}, {pin.z?.toFixed(2)}
                        </span>
                    </div>
                    {pin.dbId && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
                            <span style={{ color: '#888' }}>Element ID:</span>
                            <span style={{ color: '#eee', fontFamily: 'monospace' }}>{pin.dbId}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProgressDetailPanel;
