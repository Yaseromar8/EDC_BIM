import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { apiFetch } from '../utils/apiFetch';
import ColumnConfiguratorModal from './ColumnConfiguratorModal';

const ROW_HEIGHT = 25; // Tandem SlickGrid: 25px per row (from DOM top:25px)
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
    ),
    ExportAction: () => (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
    ),
    ImportAction: () => (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>
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
const InventoryRow = memo(({ row, columns, index, onRowClick, isHighlighted, top, onCellEdit }) => {
    const [editingCol, setEditingCol] = useState(null);
    const [editValue, setEditValue] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        if (editingCol && inputRef.current) inputRef.current.focus();
    }, [editingCol]);

    if (!row) return null;
    return (
        <div 
            data-inventory-dbid={row.dbId}
            style={{
                position: 'absolute', top, left: 0, right: 0, display: 'flex', 
                borderBottom: '1px solid #32363e', alignItems: 'center', 
                fontSize: '12.5px', height: `${ROW_HEIGHT}px`,
                background: isHighlighted ? '#2a4a8a' : (row._isSaving ? '#2d3340' : (index % 2 === 0 ? '#1e1f24' : '#1a1b1f')),
                color: isHighlighted ? '#fff' : '#d1d5db',
                cursor: 'pointer', userSelect: 'none', transition: 'background 0.1s ease',
                opacity: row._isSaving ? 0.6 : 1
            }}
            onClick={() => { if(!editingCol) onRowClick(row.dbId, row.source_urn || row.model_urn); }}
        >
            <div style={{ width: '40px', flexShrink: 0, padding: '0 10px', color: '#666', borderRight: '1px solid #32363e', height: '100%', display: 'flex', alignItems: 'center' }}>
                {index + 1}
            </div>
            {columns.map(col => {
                let cellVal = row[col.key];
                let isEditing = editingCol === col.key;
                let displayText = (cellVal !== undefined && cellVal !== null && cellVal !== '(Unassigned)') ? String(cellVal) : '';
                return (
                    <div 
                        key={col.key} 
                        style={{ width: col.width, flexShrink: 0, padding: isEditing?'0':'0 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderRight: '1px solid #32363e', height: '100%', display: 'flex', alignItems: 'center' }} 
                        onDoubleClick={(e) => {
                            // TANDEM PARITY: Solo permitimos editar propiedades extendidas de Facility (Data gemelo), los datos Nativos de Revit son READ-ONLY (Volumen, Area, etc).
                            const EDITABLE_COLUMNS = ['Material', 'Status', 'Costo', 'Notas', 'Proveedor', 'Fase'];
                            if (!EDITABLE_COLUMNS.includes(col.key)) return;
                            
                            e.stopPropagation();
                            setEditValue(displayText);
                            setEditingCol(col.key);
                        }}
                    >
                        {isEditing ? (
                            <input ref={inputRef} type="text" style={{ width: '100%', height: '100%', background: '#3aa0ff', color: '#fff', border: 'none', padding: '0 12px', outline: 'none', fontSize: '12.5px' }}
                                value={editValue} onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => { if(editValue !== displayText) onCellEdit(row.dbId, col.key, editValue, row.model_urn); setEditingCol(null); }}
                                onKeyDown={(e) => {
                                    if(e.key==='Enter') { onCellEdit(row.dbId, col.key, editValue, row.model_urn); setEditingCol(null); }
                                    else if(e.key==='Escape') setEditingCol(null);
                                }} onClick={e => e.stopPropagation()} />
                        ) : displayText}
                    </div>
                )
            })}
        </div>
    );
});
InventoryRow.displayName = 'InventoryRow';

const InventoryDataGrid = ({ activeModelUrn = 'global', dynamicFilterBuckets, filterSelections, hiddenModelUrns = [], onClose }) => {
    const [flattenedData, setFlattenedData] = useState([]);
    const [rawData, setRawData] = useState([]); // Unfiltered data from DB
    const [columns, setColumns] = useState([]);
    const [allPropertyKeys, setAllPropertyKeys] = useState([]); // All available column keys
    const [selectedColumnKeys, setSelectedColumnKeys] = useState(window.__inventoryCacheSelectedColumns || null); // null = auto (show all)
    const [columnConfigOpen, setColumnConfigOpen] = useState(false);
    const [highlightedDbId, setHighlightedDbId] = useState(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);
    const [activeTab, setActiveTab] = useState('General');
    const [followSelection, setFollowSelection] = useState(true);
    const [showAssetsOnly, setShowAssetsOnly] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [moreMenuOpen, setMoreMenuOpen] = useState(false);
    const [showGroupTotals, setShowGroupTotals] = useState(false);
    const [showFooterTotals, setShowFooterTotals] = useState(false);
    
    // Sync selected columns to cache
    useEffect(() => {
        if (selectedColumnKeys !== null) {
            window.__inventoryCacheSelectedColumns = selectedColumnKeys;
        } else {
            // Do not wipe window cache on mount if it's null, just sync forward
        }
    }, [selectedColumnKeys]);
    
    const containerRef = useRef(null);
    const headerRef = useRef(null);

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

    // (B) Visor 3D -> Tabla
    useEffect(() => {
        const handleHighlight = (e) => {
            const { dbId, urn } = e.detail; // El visor dispara clicks enviando 'dbId' y el 'urn' del modelo federado
            if (!dbId || !urn) return;
            
            // Traducción Rosetta INVERSA (Multi-Modelo): ¿Qué fila de Postgres le pertenece a este clic 3D?
            let targetExtId = null;
            const safeUrn = String(urn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            const urnDict = window.rosettaToExtId[urn] || window.rosettaToExtId[safeUrn];
            if (window.rosettaToExtId && urnDict && urnDict[dbId]) {
                 targetExtId = urnDict[dbId];
            }

            if (targetExtId) {
                // Hacemos brillar la fila basándonos en nuestra UUID de base de datos
                setHighlightedDbId(targetExtId);
                
                // Efecto Tandem: Scrollear automáticamente hacia el dato en la grilla virtual
                if (followSelection) {
                    const idx = flattenedData.findIndex(r => r.dbId === targetExtId);
                    if (idx >= 0 && containerRef.current) {
                        const targetTop = idx * ROW_HEIGHT;
                        containerRef.current.scrollTop = targetTop - (containerHeight / 2) + ROW_HEIGHT;
                    }
                }
            }
        };

        window.addEventListener('inventory-highlight-row', handleHighlight);
        return () => window.removeEventListener('inventory-highlight-row', handleHighlight);
    }, [flattenedData, containerHeight, followSelection]);

    // (C) Visor 3D Isolation → Tabla (multi-select / isolate sync)
    const [isolatedExtIds, setIsolatedExtIds] = useState(null); // null = no isolation active
    useEffect(() => {
        const handleIsolationSync = (e) => {
            const { isolatedExtIds: ids } = e.detail;
            if (!ids || ids.length === 0) {
                // Isolation cleared — restore full view
                setIsolatedExtIds(null);
                console.log('[Inventory] Isolation cleared — showing all items');
            } else {
                setIsolatedExtIds(new Set(ids));
                console.log(`[Inventory] Isolation sync: ${ids.length} elements isolated`);
            }
        };

        window.addEventListener('inventory-isolation-sync', handleIsolationSync);
        return () => window.removeEventListener('inventory-isolation-sync', handleIsolationSync);
    }, []);

    useEffect(() => {
        let isMounted = true;

        const processDbData = (dbData) => {
            const allProps = new Set(['Name', 'Material', 'Status']);
            
            const mappedData = dbData.map(node => {
                let row = {
                    dbId: node.external_id,
                    model_urn: node.model_urn,
                    source_urn: node.source_urn || node.model_urn,
                    Name: node.name,
                    Material: node.material || '',
                    Status: node.installation_status || ''
                };
                
                if (node.properties && typeof node.properties === 'object') {
                    Object.values(node.properties).forEach(cat => {
                        if (typeof cat === 'object' && cat !== null) {
                            Object.entries(cat).forEach(([pName, pVal]) => {
                                const val = (pVal === null || pVal === undefined) ? '' : String(pVal).trim();
                                if (val !== '' || !row.hasOwnProperty(pName) || row[pName] === '') {
                                    row[pName] = val;
                                }
                                allProps.add(pName);
                            });
                        }
                    });
                }
                return row;
            });

            let preferredOrder = ['Name', 'Material', 'Status', 'Level', 'Tandem Category', 'Rooms', 'Dimensions', 'Categoría', 'Nivel base'];
            const cols = [{ key: 'dbId', header: 'EXT ID', width: 280 }];
            
            const extractedCols = Array.from(allProps);
            const orderedCols = [];
            preferredOrder.forEach(p => {
                 const idx = extractedCols.indexOf(p);
                 if (idx > -1) {
                     orderedCols.push(p);
                     extractedCols.splice(idx, 1);
                 }
            });
            extractedCols.forEach(p => orderedCols.push(p));
            
            orderedCols.forEach(p => {
                cols.push({ key: p, header: p, width: p === 'Name' ? 240 : 160 });
            });

            const validExtIds = new Set();
            mappedData.forEach(r => {
                if(r.dbId) validExtIds.add(String(r.dbId).trim());
            });
            window.rosettaValidExtIds = validExtIds;

            return { mappedData, cols, orderedCols };
        };

        const loadInventoryFromDB = async () => {
            // CACHÉ TANDEM: Si ya tenemos datos en memoria para EL FRENTE ACTUAL, usarlos al instante
            if (!window.__inventoryCache) window.__inventoryCache = {};
            if (window.__inventoryCache[activeModelUrn]) {
                const { mappedData, cols, orderedCols } = window.__inventoryCache[activeModelUrn];
                console.log(`[Inventory] ⚡ Cache hit for ${activeModelUrn} — ${mappedData.length} items loaded instantly`);
                if (!isMounted) return;
                setAllPropertyKeys(orderedCols);
                setColumns(cols);
                setRawData(mappedData);
                setFlattenedData(mappedData);
                setIsLoading(false);
                setScrollTop(0);
                return;
            }

            setIsLoading(true);
            try {
                // Fetch all inventory. DB model_urn contains base64 URNs, not appProjectId.
                // Frontend cache is still keyed by activeModelUrn for per-project segregation.
                const urnParam = activeModelUrn && activeModelUrn !== 'global' ? `?model_urn=${encodeURIComponent(activeModelUrn)}` : '';
                const res = await apiFetch(`/api/inventory${urnParam}`);
                if (!res.ok) throw new Error('Falló el fetch a /api/inventory');
                
                const dbData = await res.json();
                const result = processDbData(dbData);
                
                if (!isMounted) return;

                // Guardar en caché global PARTICIONADO POR FRENTE para que no haya conflictos
                window.__inventoryCache[activeModelUrn] = result;
                console.log(`[Inventory] 📦 First load for ${activeModelUrn} — ${result.mappedData.length} items cached for instant re-open`);

                setAllPropertyKeys(result.orderedCols);
                setColumns(result.cols);
                setRawData(result.mappedData);
                setFlattenedData(result.mappedData);
                setIsLoading(false);
                setScrollTop(0);

            } catch(e) {
                console.error("[InventoryDataGrid] Error al extraer PostgreSQL Data:", e);
                setIsLoading(false);
            }
        };

        loadInventoryFromDB();

        return () => { isMounted = false; };
    }, [activeModelUrn]);

    // React to hiddenModelUrns: filter out rows from hidden models
    useEffect(() => {
        if (rawData.length === 0) return;
        if (!hiddenModelUrns || hiddenModelUrns.length === 0) {
            setFlattenedData(rawData);
        } else {
            // Build a Set with both raw and safe URN variants for matching
            const hiddenSet = new Set();
            hiddenModelUrns.forEach(u => {
                hiddenSet.add(u);
                hiddenSet.add(String(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
            });
            setFlattenedData(rawData.filter(row => {
                const urn = row.source_urn || row.model_urn;
                const safeUrn = String(urn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                return !hiddenSet.has(urn) && !hiddenSet.has(safeUrn);
            }));
        }
    }, [rawData, hiddenModelUrns]);

    // ═══════════════════════════════════════════════════════════
    // SINCRONIZACIÓN BIDIRECCIONAL: Filtros + Isolation → Inventory
    // Prioridad: Isolation 3D > Filtros laterales > Todo
    // ═══════════════════════════════════════════════════════════
    useEffect(() => {
        if (rawData.length === 0) return;

        // Helper: aplicar filtro de modelos ocultos
        const applyHiddenFilter = (data) => {
            if (!hiddenModelUrns || hiddenModelUrns.length === 0) return data;
            const hiddenSet = new Set();
            hiddenModelUrns.forEach(u => {
                hiddenSet.add(u);
                hiddenSet.add(String(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
            });
            return data.filter(row => {
                const urn = row.source_urn || row.model_urn;
                const safeUrn = String(urn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                return !hiddenSet.has(urn) && !hiddenSet.has(safeUrn);
            });
        };

        // PRIORIDAD 1: Isolation activa desde el visor 3D
        if (isolatedExtIds && isolatedExtIds.size > 0) {
            const filtered = rawData.filter(row => isolatedExtIds.has(row.dbId));
            setFlattenedData(applyHiddenFilter(filtered));
            window._lastHasActiveFilters = true;
            console.log(`[Inventory] Isolation active: ${filtered.length}/${rawData.length} items`);
            return;
        }

        // PRIORIDAD 2: Filtros del panel lateral
        const hasActiveFilters = filterSelections && Object.keys(filterSelections).some(
            key => filterSelections[key] && filterSelections[key].length > 0
        );
        window._lastHasActiveFilters = hasActiveFilters;

        if (!hasActiveFilters) {
            // Sin filtros ni isolation: mostrar todo
            setFlattenedData(applyHiddenFilter(rawData));
            return;
        }

        // CON filtros activos: extraer los external_ids válidos de los buckets seleccionados
        const validExtIds = new Set();
        const buckets = dynamicFilterBuckets || window._lastCalculatedBuckets || {};

        Object.entries(filterSelections).forEach(([propKey, selectedValues]) => {
            if (!selectedValues || selectedValues.length === 0) return;
            const bucket = buckets[propKey];
            if (!bucket || !bucket.values) return;

            selectedValues.forEach(val => {
                const entry = bucket.values.find(v => v.value === val);
                if (entry && entry.dbIds) {
                    entry.dbIds.forEach(item => {
                        const urn = item.modelUrn;
                        const safeUrn = String(urn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                        const extIdDict = window.rosettaToExtId && (window.rosettaToExtId[urn] || window.rosettaToExtId[safeUrn]);
                        if (extIdDict && extIdDict[item.id]) {
                            validExtIds.add(extIdDict[item.id]);
                        }
                    });
                }
            });
        });

        if (validExtIds.size > 0) {
            const filtered = rawData.filter(row => validExtIds.has(row.dbId));
            setFlattenedData(applyHiddenFilter(filtered));
            console.log(`[Inventory] Filter sync: ${filtered.length}/${rawData.length} items match active filters`);
        } else {
            setFlattenedData([]);
        }
    }, [rawData, filterSelections, dynamicFilterBuckets, hiddenModelUrns, isolatedExtIds]);

    // React to column selection changes
    useEffect(() => {
        if (allPropertyKeys.length === 0) return;
        const keysToShow = selectedColumnKeys || allPropertyKeys;
        const cols = [{ key: 'dbId', header: 'EXT ID', width: 280 }];
        keysToShow.forEach(p => {
            cols.push({ key: p, header: p, width: p === 'Name' ? 240 : 160 });
        });
        setColumns(cols);
    }, [selectedColumnKeys, allPropertyKeys]);

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

    // (A) Tabla -> Visor
    const handleRowClick = useCallback((rowExtId, rowUrn) => {
        // En nuestro estado visual (React), la fila brilla usando el external_id
        setHighlightedDbId(rowExtId); 

        if (!rowUrn) {
            console.warn(`[Inventory] El elemento ${rowExtId} no tiene model_urn en la base de datos.`);
            return;
        }

        // Traducción Rosetta Bidimensional: Buscamos qué dbId efímero le toca a esta sesión 3D
        const safeUrn = String(rowUrn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const urnDict = window.rosettaToDbId[rowUrn] || window.rosettaToDbId[safeUrn];
        
        if (window.rosettaToDbId && urnDict && urnDict[rowExtId]) {
            const realDbId = urnDict[rowExtId];
            
            // Disparamos el aislamiento. ¡El visor cree que le mandamos un dbId nativo y su URN!
            window.dispatchEvent(new CustomEvent('viewer-select', {
                detail: { dbIds: [realDbId], urn: rowUrn }
            }));
        } else {
            console.warn(`[Inventory] No se encontró malla 3D cargada para el Elemento: ${rowExtId} en la capa modelo ${rowUrn}`);
        }
    }, []);

    const handleCellEdit = useCallback(async (extId, colKey, newValue, modelUrn) => {
        setFlattenedData(prev => prev.map(r => r.dbId === extId ? { ...r, _isSaving: true, [colKey]: newValue } : r));

        try {
            const res = await apiFetch('/api/inventory', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ external_id: extId, fieldName: colKey, fieldValue: newValue, model_urn: modelUrn })
            });

            if (!res.ok) throw new Error('Error al actualizar inventario en Backend');
            setFlattenedData(prev => prev.map(r => r.dbId === extId ? { ...r, _isSaving: false, [colKey]: newValue } : r));
            setRawData(prev => prev.map(r => r.dbId === extId ? { ...r, [colKey]: newValue } : r));
            // Invalidar caché para que el próximo re-open refleje cambios
            window.__inventoryCache = null;
        } catch(e) {
            console.error('[LIVE EDIT] Error:', e);
            alert("Error al guardar: " + e.message);
            setFlattenedData(prev => prev.map(r => r.dbId === extId ? { ...r, _isSaving: false } : r));
        }
    }, []);

    const handleScroll = useCallback((e) => {
        setScrollTop(e.target.scrollTop);
        if (headerRef.current) {
            headerRef.current.scrollLeft = e.target.scrollLeft;
        }
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
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#16161a', color: '#e8e8e8', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', opacity: 0.95 }}>
            
            {/* Header / Tabs - Top Level (Como Tandem) */}
            <div style={{ display: 'flex', background: '#23242a', height: '35px', alignItems: 'flex-end', padding: '0 20px', borderBottom: '1px solid #2a2b30', justifyContent: 'space-between' }}>
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

                {/* Window Controls (Undock / Close) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', paddingBottom: '8px' }}>
                    <button style={{ background:'none', border:'none', color:'#888', cursor:'pointer' }} title="Open in a new window" onClick={() => {
                        // Generar HTML standalone del inventory para la ventana popup
                        const data = flattenedData;
                        const cols = columns;
                        if (!data || data.length === 0) return;

                        const popup = window.open('', 'InventoryPopout', 'width=1100,height=600,menubar=no,toolbar=no,location=no,status=no');
                        if (!popup) { alert('Please allow popups for this site.'); return; }

                        // Guardar referencia para comunicación
                        window.__inventoryPopup = popup;

                        const tableRows = data.map((row, i) => {
                            const cells = cols.map(c => `<td title="${String(row[c.key] || '').replace(/"/g, '&quot;')}">${row[c.key] || ''}</td>`).join('');
                            return `<tr class="${i % 2 === 0 ? 'even' : 'odd'}" data-extid="${row.dbId || ''}">${cells}</tr>`;
                        }).join('');

                        const headerCells = cols.map(c => `<th style="width:${c.width}px">${c.header}</th>`).join('');

                        popup.document.write(`<!DOCTYPE html>
<html><head><title>Inventory — BIM Visor</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #16161a; color: #e8e8e8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 12.5px; }
  .header { background: #23242a; padding: 8px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #2a2b30; }
  .header h1 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #ccc; font-weight: 600; }
  .info { font-size: 11px; color: #7a808b; padding: 6px 12px; background: #18191e; border-bottom: 1px solid #252630; }
  .grid-wrap { overflow: auto; flex: 1; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { background: #1e1f24; color: #999; font-weight: 600; font-size: 12px; padding: 6px 12px; text-align: left; border-bottom: 1px solid #2a2b30; border-right: 1px solid #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; position: sticky; top: 0; z-index: 1; }
  td { padding: 2px 12px; border-bottom: 1px solid #32363e; border-right: 1px solid #2a2b30; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; height: 25px; }
  tr.even { background: #1e1f24; }
  tr.odd { background: #1a1b1f; }
  tr:hover { background: #2a3040 !important; }
  tr.highlighted { background: #2a4a8a !important; color: #fff; }
  .container { display: flex; flex-direction: column; height: 100vh; }
  .dock-btn { background: none; border: 1px solid #444; color: #aaa; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; }
  .dock-btn:hover { background: #333; color: #fff; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1>Inventory</h1>
    <button class="dock-btn" onclick="window.opener && window.opener.postMessage({type:'inventory-dock'},'*'); window.close();">⬇ Dock back</button>
  </div>
  <div class="info">Showing ${data.length.toLocaleString()} items</div>
  <div class="grid-wrap">
    <table><thead><tr>${headerCells}</tr></thead>
    <tbody>${tableRows}</tbody></table>
  </div>
</div>
<script>
  // Click en fila → seleccionar en el visor padre
  document.querySelectorAll('tbody tr').forEach(tr => {
    tr.addEventListener('click', () => {
      document.querySelectorAll('tr.highlighted').forEach(r => r.classList.remove('highlighted'));
      tr.classList.add('highlighted');
      const extId = tr.dataset.extid;
      if (extId && window.opener) {
        window.opener.postMessage({ type: 'inventory-popout-select', extId }, '*');
      }
    });
  });

  // Recibir highlights del visor padre
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'inventory-popout-highlight') {
      document.querySelectorAll('tr.highlighted').forEach(r => r.classList.remove('highlighted'));
      const extId = e.data.extId;
      const tr = document.querySelector('tr[data-extid="' + extId + '"]');
      if (tr) { tr.classList.add('highlighted'); tr.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }
    if (e.data && e.data.type === 'inventory-popout-isolation') {
      const ids = new Set(e.data.isolatedExtIds || []);
      document.querySelectorAll('tbody tr').forEach(tr => {
        if (ids.size === 0) { tr.style.display = ''; return; }
        tr.style.display = ids.has(tr.dataset.extid) ? '' : 'none';
      });
    }
  });
</script>
</body></html>`);
                        popup.document.close();

                        // Cerrar el panel inline
                        if (onClose) onClose();
                    }}><Icons.Undock/></button>
                    <button style={{ background:'none', border:'none', color:'#888', cursor:'pointer' }} onClick={() => onClose ? onClose() : window.dispatchEvent(new CustomEvent('close-inventory'))} title="Close panel"><Icons.Close/></button>
                </div>
            </div>

            {/* Toolbar (Filters, Columns, Group rows...) */}
            <div style={{ display: 'flex', background: '#1c1d22', height: '36px', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid #252630', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <ToolBtn icon={<Icons.Filter />} />
                    <ToolBtn icon={<Icons.Columns />} onClick={() => setColumnConfigOpen(true)} />
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
                    <div id="inventory-more-menu-container" style={{ position: 'relative' }}>
                        <ToolBtn icon={<Icons.MoreVertical />} onClick={() => setMoreMenuOpen(!moreMenuOpen)} active={moreMenuOpen} />
                        {moreMenuOpen && (
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: '4px',
                                background: '#323232', border: '1px solid #444', borderRadius: '4px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 50, minWidth: '180px',
                                display: 'flex', flexDirection: 'column', padding: '4px 0'
                            }}>
                                <div 
                                    onClick={() => { handleExportCSV(); setMoreMenuOpen(false); }}
                                    style={{ padding: '8px 16px', color: '#ececec', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#404040'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <Icons.ExportAction /> Export
                                </div>
                                <div 
                                    onClick={() => { alert('Import functionality coming soon'); setMoreMenuOpen(false); }}
                                    style={{ padding: '8px 16px', color: '#ececec', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#404040'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <Icons.ImportAction /> Import
                                </div>
                                
                                <div style={{ height: '1px', background: '#444', margin: '4px 0' }} />
                                
                                <label style={{ padding: '8px 16px', color: '#ececec', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#404040'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <input type="checkbox" checked={showGroupTotals} onChange={(e) => setShowGroupTotals(e.target.checked)} style={{ accentColor: '#4f83e8', cursor: 'pointer' }} />
                                    Show group totals
                                </label>
                                <label style={{ padding: '8px 16px', color: '#ececec', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#404040'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <input type="checkbox" checked={showFooterTotals} onChange={(e) => setShowFooterTotals(e.target.checked)} style={{ accentColor: '#4f83e8', cursor: 'pointer' }} />
                                    Show footer totals
                                </label>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Sub-header Summary */}
            <div style={{ padding: '6px 12px', background: '#18191e', fontSize: '11px', color: '#7a808b', borderBottom: '1px solid #252630', display: 'flex', justifyContent: 'space-between' }}>
                 <span>Showing {flattenedData.length.toLocaleString()} items {window._lastHasActiveFilters ? '(Filtered)' : ''}</span>
            </div>
            
            {/* Column Headers (SlickGrid style) */}
            <div 
                ref={headerRef}
                style={{ overflow: 'hidden', display: 'flex', background: '#1e1f24', height: '34px', alignItems: 'center', fontSize: '12px', fontWeight: 600, color: '#999', flexShrink: 0, borderBottom: '1px solid #2a2b30' }}
            >
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
                {isLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: '16px' }}>
                        {/* Tandem-style orbital spinner */}
                        <div style={{ width: '40px', height: '40px', position: 'relative' }}>
                            <svg viewBox="0 0 40 40" width="40" height="40" style={{ animation: 'inv-spin 1.2s linear infinite' }}>
                                {[0,1,2,3,4,5,6,7].map(i => (
                                    <circle
                                        key={i}
                                        cx={20 + 14 * Math.cos((i * Math.PI * 2) / 8)}
                                        cy={20 + 14 * Math.sin((i * Math.PI * 2) / 8)}
                                        r={2.2 + (i * 0.35)}
                                        fill="#3AA0FF"
                                        opacity={0.25 + (i * 0.1)}
                                    />
                                ))}
                            </svg>
                            <style>{`@keyframes inv-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                        </div>
                        <span style={{ color: '#7a808b', fontSize: '12px', letterSpacing: '0.5px' }}>Loading inventory data...</span>
                    </div>
                ) : flattenedData.length > 0 ? (
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
                                onCellEdit={handleCellEdit}
                            />
                        ))}
                    </div>
                ) : (
                    <div style={{ padding: '60px 20px', color: '#555', textAlign: 'center', fontSize: '14px' }}>
                        {window._lastHasActiveFilters ? 'No items match the current filter.' : 'Seleccione propiedades en Filters para poblar la tabla...'}
                    </div>
                )}
            </div>

            {/* Column Editor Modal */}
            <ColumnConfiguratorModal
                open={columnConfigOpen}
                onClose={() => setColumnConfigOpen(false)}
                availableColumns={allPropertyKeys}
                selectedColumns={selectedColumnKeys || allPropertyKeys}
                onUpdate={(newCols) => {
                    setSelectedColumnKeys(newCols.length === allPropertyKeys.length ? null : newCols);
                }}
            />
        </div>
    );
};

export default InventoryDataGrid;
