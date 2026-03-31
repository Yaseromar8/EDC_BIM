import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';

const ROW_HEIGHT = 28; // Tandem usa filas un poco mas compactas
const OVERSCAN = 10;

// Iconos SVGs extraidos de Autodesk Tandem
const Icons = {
    Filter: () => (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M21.5,3.54a1.53,1.53,0,0,0-1.4-.73H3.91a1.52,1.52,0,0,0-1.4.73A1.77,1.77,0,0,0,2.7,5.43c.5.82,5.34,8.2,6.2,9.51v4.72c0,1.82,1.11,2.06,2.07,2.06h.91a.25.25,0,0,0,.12,0,.25.25,0,0,0,.12,0H13c1,0,2.07-.24,2.07-2.06V14.94c.86-1.31,5.7-8.69,6.2-9.51A1.81,1.81,0,0,0,21.5,3.54ZM20,4.65c-.52.85-6.24,9.57-6.29,9.66a.74.74,0,0,0-.13.41v4.94a1.23,1.23,0,0,1-.06.5,1.15,1.15,0,0,1-.51.06h-.91a.25.25,0,0,0-.12,0,.25.25,0,0,0-.12,0H11c-.45,0-.5,0-.5,0a1.05,1.05,0,0,1-.07-.51V14.72a.73.73,0,0,0-.12-.41C10.22,14.22,4.5,5.5,4,4.65a1.19,1.19,0,0,1-.15-.34H20.17A1,1,0,0,1,20,4.65Z" /></svg>
    ),
    Columns: () => (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19,2.29H5A2.75,2.75,0,0,0,2.28,5V19A2.75,2.75,0,0,0,5,21.72H19A2.75,2.75,0,0,0,21.72,19V5A2.75,2.75,0,0,0,19,2.29ZM3.78,19V5A1.25,1.25,0,0,1,5,3.79H8.26V20.22H5A1.25,1.25,0,0,1,3.78,19Zm6-15.18h4.48V20.22H9.76ZM20.22,19A1.25,1.25,0,0,1,19,20.22H15.74V3.79H19A1.25,1.25,0,0,1,20.22,5Z" /></svg>
    ),
    Group: () => (
        <svg width="16" height="16" viewBox="0 0 17 17" fill="currentColor"><path d="M10.729 10.3363L12.0623 10.3351C12.3716 10.3344 12.6681 10.2111 12.8866 9.99222C13.1051 9.7733 13.2278 9.47664 13.2279 9.16733L13.2267 7.834C13.225 7.52501 13.1013 7.2292 12.8826 7.01091C12.6639 6.79263 12.3679 6.66954 12.0589 6.66843L10.7256 6.66968C10.4162 6.67033 10.1198 6.79364 9.90131 7.01256C9.6828 7.23148 9.56005 7.52814 9.55998 7.83745L9.56014 8.00412L5.22214 8.0082L5.22057 6.34154L5.38724 6.34138C5.54049 6.34159 5.69228 6.31153 5.83388 6.25293C5.97549 6.19433 6.10413 6.10835 6.21243 5.99991C6.32072 5.89148 6.40653 5.76272 6.46495 5.62104C6.52336 5.47935 6.55322 5.32753 6.55281 5.17428L6.55155 3.84095C6.55091 3.53164 6.4276 3.23521 6.20868 3.0167C5.98976 2.79819 5.6931 2.67544 5.38379 2.67538L4.05046 2.67664C3.74147 2.67833 3.44565 2.80197 3.22737 3.02067C3.00909 3.23936 2.886 3.53541 2.88489 3.8444L2.88614 5.17773C2.88679 5.48704 3.0101 5.78347 3.22902 6.00198C3.44794 6.22049 3.7446 6.34324 4.05391 6.3433L4.22058 6.34314L4.22563 11.7098C4.22667 12.8165 4.92081 13.6758 5.80081 13.675L9.56748 13.6714L9.56764 13.8381C9.56752 13.9912 9.5976 14.1428 9.65615 14.2842C9.7147 14.4257 9.80058 14.5542 9.90887 14.6624C10.0172 14.7706 10.1457 14.8564 10.2872 14.9148C10.4287 14.9733 10.5803 15.0032 10.7334 15.003L12.0667 15.0018C12.376 15.0011 12.6725 14.8778 12.891 14.6589C13.1095 14.44 13.2322 14.1433 13.2323 13.834L13.231 12.5007C13.2294 12.1917 13.1057 11.8959 12.887 11.6776C12.6683 11.4593 12.3723 11.3362 12.0633 11.3351L10.7299 11.3363C10.4206 11.337 10.1242 11.4603 9.9057 11.6792C9.68719 11.8981 9.56444 12.1948 9.56438 12.5041L9.56454 12.6708L5.79787 12.6743C5.52454 12.6746 5.22415 12.2615 5.22363 11.7082L5.22109 9.0082L9.56108 9.00412L9.56124 9.17078C9.56103 9.32409 9.59111 9.47593 9.64975 9.61758C9.70839 9.75923 9.79444 9.8879 9.90294 9.9962C10.0115 10.1045 10.1403 10.1903 10.282 10.2487C10.4238 10.3071 10.5757 10.3368 10.729 10.3363Z" /></svg>
    ),
    MoreVertical: () => (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 14a1.2 1.2 0 0 1 0-2.4A1.2 1.2 0 0 1 8 14Zm1.2-6a1.2 1.2 0 1 0-2.4 0 1.2 1.2 0 1 0 2.4 0Zm0-4.8a1.2 1.2 0 1 0-2.4 0 1.2 1.2 0 1 0 2.4 0Z" /></svg>
    ),
    Close: () => (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M3.46967 3.46967C3.76256 3.17678 4.23744 3.17678 4.53033 3.46967L8 6.93934L11.4697 3.46967C11.7626 3.17678 12.2374 3.17678 12.5303 3.46967C12.8232 3.76256 12.8232 4.23744 12.5303 4.53033L9.06066 8L12.5303 11.4697C12.8232 11.7626 12.8232 12.2374 12.5303 12.5303C12.2374 12.8232 11.7626 12.8232 11.4697 12.5303L8 9.06066L4.53033 12.5303C4.23744 12.8232 3.76256 12.8232 3.46967 12.5303C3.17678 12.2374 3.17678 11.7626 3.46967 11.4697L6.93934 8L3.46967 4.53033C3.17678 4.23744 3.17678 3.76256 3.46967 3.46967Z" /></svg>
    ),
    Undock: () => (
        <svg viewBox="0 0 17 15" width="15" height="13" fill="currentColor"><path fillRule="evenodd" d="M5.166 0h9.35a2.07 2.07 0 012.07 2v9.3a.75.75 0 01-.75.75h-12a.76.76 0 01-.75-.75V2a2.08 2.08 0 012.08-2zm-.404 1.6a.59.59 0 00-.176.4v1.25h10.5V2a.559.559 0 00-.57-.57h-9.35a.59.59 0 00-.404.17zm-.176 8.92h10.5V4.75h-10.5v5.77zm-3-6.02a.75.75 0 00-1.5 0V13c0 .966.783 1.75 1.75 1.75h11a.75.75 0 100-1.5h-11a.25.25 0 01-.25-.25V4.5z" clipRule="evenodd" /></svg>
    )
};

// Tool Button Component
const ToolBtn = ({ icon, onClick, active }) => (
    <button 
        onClick={onClick}
        style={{
            background: 'transparent',
            border: 'none',
            color: active ? '#fff' : '#888',
            cursor: 'pointer',
            padding: '4px 6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px',
            transition: 'color 0.15s, background 0.15s'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = '#32363e'; }}
        onMouseLeave={(e) => { 
            e.currentTarget.style.color = active ? '#fff' : '#888'; 
            e.currentTarget.style.background = 'transparent'; 
        }}
    >
        {icon}
    </button>
);

// Componente Row estable
const InventoryRow = memo(({ row, columns, index, onRowClick, isHighlighted, top }) => {
    if (!row) return null;
    return (
        <div 
            data-inventory-dbid={row.dbId}
            style={{
                position: 'absolute',
                top,
                left: 0,
                right: 0,
                display: 'flex', 
                borderBottom: '1px solid #32363e', 
                alignItems: 'center', 
                fontSize: '12.5px', // Ligeramente mas grande, estilo Tandem
                height: `${ROW_HEIGHT}px`,
                background: isHighlighted 
                    ? '#2a4a8a' 
                    : (index % 2 === 0 ? '#1f2229' : '#1b1d22'),
                color: isHighlighted ? '#fff' : '#d1d5db',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'background 0.1s ease'
            }}
            onClick={() => onRowClick(row.dbId, row.urn)}
        >
            <div style={{ width: '40px', flexShrink: 0, padding: '0 10px', color: '#666', borderRight: '1px solid #32363e', height: '100%', display: 'flex', alignItems: 'center' }}>
                {index + 1}
            </div>
            {columns.map(col => {
                let cellVal = row[col.key];
                // Vaciamos el texto si es nulo o '(Unassigned)' para que quede limpio como en Tandem
                let displayText = (cellVal !== undefined && cellVal !== null && cellVal !== '(Unassigned)') ? String(cellVal) : '';
                return (
                    <div 
                        key={col.key} 
                        style={{ 
                            width: col.width, 
                            flexShrink: 0,
                            padding: '0 12px', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap',
                            borderRight: '1px solid #32363e',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center'
                        }} 
                    >
                        {displayText}
                    </div>
                )
            })}
        </div>
    );
});
InventoryRow.displayName = 'InventoryRow';

const InventoryDataGrid = ({ dynamicFilterBuckets, filterSelections }) => {
    const [flattenedData, setFlattenedData] = useState([]);
    const [columns, setColumns] = useState([]);
    const [highlightedDbId, setHighlightedDbId] = useState(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);
    const [activeTab, setActiveTab] = useState('General');
    const [followSelection, setFollowSelection] = useState(true);
    const [showAssetsOnly, setShowAssetsOnly] = useState(false);
    
    const containerRef = useRef(null);

    // Auto-resize observer
    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry) setContainerHeight(entry.contentRect.height);
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // Bidireccional: 3D Viewer -> Inventory
    useEffect(() => {
        const handleHighlight = (e) => {
            const { dbId } = e.detail;
            if (!dbId) return;
            setHighlightedDbId(dbId);
            
            if (followSelection) {
                const idx = flattenedData.findIndex(r => r.dbId === dbId);
                if (idx >= 0 && containerRef.current) {
                    const targetTop = idx * ROW_HEIGHT;
                    containerRef.current.scrollTop = targetTop - containerHeight / 2 + ROW_HEIGHT;
                }
            }
        };

        window.addEventListener('inventory-highlight-row', handleHighlight);
        return () => window.removeEventListener('inventory-highlight-row', handleHighlight);
    }, [flattenedData, containerHeight, followSelection]);

    useEffect(() => {
        if (!dynamicFilterBuckets || typeof dynamicFilterBuckets !== 'object' || Object.keys(dynamicFilterBuckets).length === 0) {
            setFlattenedData([]);
            setColumns([]);
            return;
        }

        const hasActiveFilters = window._lastHasActiveFilters || false;
        const validIdsMap = window._lastValidDbIds || null;

        let validIdSet = null;
        if (hasActiveFilters && validIdsMap && Object.keys(validIdsMap).length > 0) {
            validIdSet = new Set();
            Object.values(validIdsMap).forEach(urnSet => {
                if (urnSet && urnSet.forEach) {
                    urnSet.forEach(id => validIdSet.add(id));
                }
            });
        }

        const propertiesFound = Object.keys(dynamicFilterBuckets).sort();
        const inverseMap = {};
        
        for (const propId of propertiesFound) {
            const bucket = dynamicFilterBuckets[propId];
            if (!bucket || !bucket.values) continue;
            const propName = propId.split('::').pop() || propId;
            bucket.values.forEach(v => {
                 if (!v.dbIds) return;
                 v.dbIds.forEach(item => {
                      if (validIdSet && !validIdSet.has(item.id)) return;
                      // Simulación de "Assets only" (Tandem lo asocia a elementos con la propiedad 'Asset Tag')
                      if (showAssetsOnly && v.value === '(Unassigned)') return; 

                      if (!inverseMap[item.id]) {
                          inverseMap[item.id] = { dbId: item.id, urn: item.modelUrn };
                      }
                      inverseMap[item.id][propName] = v.value;
                 });
            });
        }

        const dataArray = Object.values(inverseMap);
        
        // Setup columnas, similar a Tandem (orden predefinido si existen)
        let preferredOrder = ['Name', 'Level', 'Rooms', 'Tandem Category', 'Classification', 'Category Name', 'System Class', 'Systems'];
        const cols = [{ key: 'dbId', header: 'DB ID', width: 80 }];
        
        const extractedCols = propertiesFound.map(p => p.split('::').pop());
        // Forzamos el orden de Tandem para las comunes encontradas, las demas al final
        const orderedCols = [];
        preferredOrder.forEach(p => {
            if(extractedCols.includes(p)) orderedCols.push(p);
        })
        extractedCols.forEach(p => {
             if(!preferredOrder.includes(p)) orderedCols.push(p);
        })

        orderedCols.forEach(p => {
            cols.push({ key: p, header: p, width: p === 'Name' ? 200 : 160 });
        });

        setColumns(cols);
        setFlattenedData(dataArray);
        setScrollTop(0);
    }, [dynamicFilterBuckets, filterSelections, showAssetsOnly]);

    const handleExportCSV = useCallback(() => {
        if (!flattenedData.length || !columns.length) return;
        const headers = columns.map(c => `"${c.header}"`).join(',');
        const rows = flattenedData.map(row => {
             return columns.map(c => {
                 const cellVal = row[c.key];
                 return `"${cellVal !== undefined && cellVal !== null ? String(cellVal).replace(/"/g, '""') : ''}"`;
             }).join(',');
        });
        const csvContent = [headers, ...rows].join('\n');
        
        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Asset_Inventory_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [flattenedData, columns]);

    const handleRowClick = useCallback((dbId, urn) => {
        setHighlightedDbId(dbId);
        window.dispatchEvent(new CustomEvent('viewer-select', {
            detail: { dbIds: [dbId], urn }
        }));
    }, []);

    const handleScroll = useCallback((e) => {
        setScrollTop(e.target.scrollTop);
    }, []);

    const visibleRows = useMemo(() => {
        if (flattenedData.length === 0 || containerHeight === 0) return [];
        const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
        const endIdx = Math.min(flattenedData.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN);
        
        const rows = [];
        for (let i = startIdx; i < endIdx; i++) {
            rows.push({ index: i, row: flattenedData[i], top: i * ROW_HEIGHT });
        }
        return rows;
    }, [flattenedData, scrollTop, containerHeight]);
    const totalHeight = flattenedData.length * ROW_HEIGHT;

    // ESTILO GENERAL DE LA APP:
    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1c2027', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
            
            {/* Header / Tabs - Top Level (Como Tandem) */}
            <div style={{ display: 'flex', background: '#22252b', height: '35px', alignItems: 'flex-end', padding: '0 20px', borderBottom: '1px solid #333', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '20px' }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#ccc', fontWeight: 600, paddingBottom: '10px', letterSpacing: '0.8px', borderRight: '1px solid #444', paddingRight: '20px' }}>
                        Inventory
                    </div>
                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: '1px' }}>
                        {['General', 'Tickets'].map(tab => (
                            <div 
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                style={{
                                    padding: '8px 16px',
                                    fontSize: '13px',
                                    color: activeTab === tab ? '#fff' : '#aaa',
                                    borderBottom: activeTab === tab ? '2px solid #5591f5' : '2px solid transparent',
                                    cursor: 'pointer',
                                    transition: 'color 0.2s',
                                    marginBottom: '-1px'
                                }}
                            >
                                {tab}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Window Controls (Undock / Close) simulados */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', paddingBottom: '8px' }}>
                    <button style={{ background:'none', border:'none', color:'#888', cursor:'pointer' }} title="Undock panel"><Icons.Undock/></button>
                    <button style={{ background:'none', border:'none', color:'#888', cursor:'pointer' }} onClick={() => window.dispatchEvent(new CustomEvent('close-inventory'))} title="Close panel"><Icons.Close/></button>
                </div>
            </div>

            {/* Toolbar (Filters, Columns, Group rows...) */}
            <div style={{ display: 'flex', background: '#2b2e35', height: '36px', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid #1a1c20', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <ToolBtn icon={<Icons.Filter />} />
                    <ToolBtn icon={<Icons.Columns />} />
                    <ToolBtn icon={<Icons.Group />} />
                </div>
                
                <div style={{ width: '1px', height: '16px', background: '#444' }} />
                
                {/* View Options */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12.5px', color: '#d1d5db' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={showAssetsOnly} onChange={(e) => setShowAssetsOnly(e.target.checked)} style={{ accentColor: '#4f83e8' }} />
                        Assets only
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={followSelection} onChange={(e) => setFollowSelection(e.target.checked)} style={{ accentColor: '#4f83e8' }} />
                        Follow selection
                    </label>
                </div>

                <div style={{ flex: 1 }} />

                {/* Right Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button 
                        onClick={handleExportCSV}
                        style={{ background: 'none', border: '1px solid #444', color: '#ccc', padding: '3px 10px', fontSize: '11px', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        Export CSV
                    </button>
                    <ToolBtn icon={<Icons.MoreVertical />} />
                </div>
            </div>

            {/* Sub-header Summary */}
            <div style={{ padding: '6px 12px', background: '#191b20', fontSize: '11px', color: '#7a808b', borderBottom: '1px solid #32363e', display: 'flex', justifyContent: 'space-between' }}>
                 <span>Showing {flattenedData.length.toLocaleString()} items {window._lastHasActiveFilters ? '(Filtered)' : ''}</span>
            </div>
            
            {/* Column Headers (SlickGrid style) */}
            <div style={{ display: 'flex', background: '#1b1d22', height: '34px', alignItems: 'center', fontSize: '12px', fontWeight: 600, color: '#aaa', flexShrink: 0, borderBottom: '1px solid #333' }}>
                <div style={{ width: '40px', flexShrink: 0, borderRight: '1px solid #333', height: '100%' }}></div>
                {columns.map(col => (
                    <div 
                        key={col.key} 
                        style={{ 
                            width: col.width, 
                            flexShrink: 0,
                            padding: '0 12px', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap',
                            textAlign: 'left',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            borderRight: '1px solid #333',
                            position: 'relative'
                        }}
                    >
                        {col.header}
                    </div>
                ))}
            </div>

            {/* Virtualised Data Grid */}
            <div 
                ref={containerRef} 
                onScroll={handleScroll}
                style={{ 
                    flex: 1, 
                    minHeight: 0, 
                    overflowY: 'auto', 
                    overflowX: 'auto',
                    position: 'relative'
                }}
            >
                {flattenedData.length > 0 ? (
                    <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
                        {visibleRows.map(({ index, row, top }) => (
                            <InventoryRow 
                                key={row.dbId || index}
                                row={row}
                                columns={columns}
                                index={index}
                                onRowClick={handleRowClick}
                                isHighlighted={highlightedDbId === row.dbId}
                                top={top}
                            />
                        ))}
                    </div>
                ) : (
                    <div style={{ padding: '60px 20px', color: '#555', textAlign: 'center', fontSize: '14px' }}>
                        {window._lastHasActiveFilters ? 'No items match the current filter.' : 'Seleccione propiedades en Filters para poblar la tabla...'}
                    </div>
                )}
            </div>
        </div>
    );
};

export default InventoryDataGrid;
