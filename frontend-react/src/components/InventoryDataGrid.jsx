import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { apiFetch } from '../utils/apiFetch';
import ColumnConfiguratorModal from './ColumnConfiguratorModal';
import { Capacitor } from '@capacitor/core';

const ROW_HEIGHT = 25; // Tandem SlickGrid: 25px per row (from DOM top:25px)
const OVERSCAN = 10;

const BACKEND_URL = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ? 'https://visor-ecd-backend.onrender.com' : (import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3000' : (typeof window !== 'undefined' && window.location.hostname.match(/^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$/) ? `http://${window.location.hostname}:3000` : 'https://visor-ecd-backend.onrender.com')));

// ─── Fractional-Inch Formatter ───────────────────────────────────────────
// Autodesk Model Derivative API almacena diámetros y medidas como
// "0.375 fractional-in", pero el visor 3D los muestra como "3/8\"".
// Este formateador replica esa conversión para consistencia visual.
const formatFractionalInch = (raw) => {
    if (typeof raw !== 'string') return raw;
    const match = raw.match(/^(-?\d+\.?\d*)\s+fractional-in$/i);
    if (!match) return raw;
    
    const decimal = parseFloat(match[1]);
    if (isNaN(decimal)) return raw;
    
    const sign = decimal < 0 ? '-' : '';
    const abs = Math.abs(decimal);
    const whole = Math.floor(abs);
    const frac = abs - whole;
    
    // Resolución máxima de Revit: 1/128"
    const denom = 128;
    let num = Math.round(frac * denom);
    
    if (num === 0) {
        return `${sign}${whole}"`;
    }
    
    // Reducir fracción con GCD
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(num, denom);
    num = num / divisor;
    const den = denom / divisor;
    
    if (whole === 0) {
        return `${sign}${num}/${den}"`;
    }
    return `${sign}${whole}-${num}/${den}"`;
};

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
    ),
    Sync: () => (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
    ),
    Sigma: () => (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M18 6H8.83l6 6-6 6H18v2H6v-2l6-6-6-6V4h12v2z" /></svg>
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
const InventoryRow = memo(({ row, columns, index, onRowClick, isHighlighted, top, onCellEdit, isChecked, onToggleCheck }) => {
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
                position: 'absolute', top, left: 0, display: 'inline-flex', 
                minWidth: '100%',
                borderBottom: '1px solid #32363e', alignItems: 'center', 
                fontSize: '12.5px', height: `${ROW_HEIGHT}px`,
                background: isChecked ? '#1e3a5f' : (isHighlighted ? '#2a4a8a' : (row._isSaving ? '#2d3340' : (index % 2 === 0 ? '#1e1f24' : '#1a1b1f'))),
                color: isHighlighted ? '#fff' : '#d1d5db',
                cursor: 'pointer', userSelect: 'none', transition: 'background 0.1s ease',
                opacity: row._isSaving ? 0.6 : 1
            }}
            onClick={() => { if(!editingCol) onRowClick(row.dbId, row.source_urn || row.model_urn); }}
        >
            <div style={{ width: '40px', flexShrink: 0, padding: '0 4px', color: '#666', borderRight: '1px solid #32363e', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                <input type="checkbox" checked={!!isChecked} onChange={(e) => { e.stopPropagation(); onToggleCheck(row.dbId); }} onClick={e => e.stopPropagation()} style={{ accentColor: '#3aa0ff', cursor: 'pointer', width: '13px', height: '13px', margin: 0 }} />
                <span style={{ fontSize: '10px', minWidth: '18px', textAlign: 'right' }}>{index + 1}</span>
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
    const [totalsPickerOpen, setTotalsPickerOpen] = useState(false);
    const [totalColumns, setTotalColumns] = useState(new Set()); // Set of column keys
    const [checkedIds, setCheckedIds] = useState(new Set()); // BULK SELECTION
    const [bulkAssigning, setBulkAssigning] = useState(false);
    const [bulkField, setBulkField] = useState('Status'); // Default column for bulk edit
    const [bulkValue, setBulkValue] = useState('');
    
    const parseNumericCell = (val) => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            const num = parseFloat(val.replace(/,/g, ''));
            return isNaN(num) ? null : num;
        }
        return null;
    };

    // Sync selected columns to cache
    useEffect(() => {
        if (selectedColumnKeys !== null) {
            window.__inventoryCacheSelectedColumns = selectedColumnKeys;
        } else {
            // Do not wipe window cache on mount if it's null, just sync forward
        }
    }, [selectedColumnKeys]);

    // Restore column config from App.jsx (Saved Views)
    useEffect(() => {
        const handleRestoreConfig = (e) => {
            const columns = e.detail;
            if (columns) {
                setSelectedColumnKeys(columns);
            }
        };
        window.addEventListener('restore-inventory-config', handleRestoreConfig);
        return () => window.removeEventListener('restore-inventory-config', handleRestoreConfig);
    }, []);
    
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
            // Normalización Multi-Formato: probar raw, URL-safe base64, y standard base64
            let targetExtId = null;
            const safeUrn = String(urn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            const stdUrn = String(urn).replace(/-/g, '+').replace(/_/g, '/');
            const urnDict = window.rosettaToExtId?.[urn]
                || window.rosettaToExtId?.[safeUrn]
                || window.rosettaToExtId?.[stdUrn]
                || Object.values(window.rosettaToExtId || {}).find((_, i) => {
                    const k = Object.keys(window.rosettaToExtId)[i];
                    return k.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === safeUrn;
                });
            if (urnDict && urnDict[dbId]) {
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
    const [localSelIds, setLocalSelIds] = useState(null); // RAW selection from 3D (no filter yet)
    const [activeSelectionFilter, setActiveSelectionFilter] = useState(null); // The actual filter applied by the button

    useEffect(() => {
        const handleIsolationSync = (e) => {
            const { isolatedExtIds: ids } = e.detail;
            if (!ids || ids.length === 0) {
                // Isolation cleared — restore full view
                setIsolatedExtIds(null);
                setActiveSelectionFilter(null); // MASTER RESET: Clear sync selection
                console.log('[Inventory] Isolation cleared — showing all items & clearing sync');
            } else {
                setIsolatedExtIds(new Set(ids));
                console.log(`[Inventory] Isolation sync: ${ids.length} elements isolated`);
            }
        };

        const handleSelectionSync = (e) => {
            const { selectedExtIds: ids } = e.detail;
            if (!ids || ids.length === 0) {
                setLocalSelIds(null);
            } else {
                setLocalSelIds(new Set(ids));
            }
        };

        window.addEventListener('inventory-isolation-sync', handleIsolationSync);
        window.addEventListener('inventory-selection-sync', handleSelectionSync);
        return () => {
            window.removeEventListener('inventory-isolation-sync', handleIsolationSync);
            window.removeEventListener('inventory-selection-sync', handleSelectionSync);
        };
    }, []);

    useEffect(() => {
        let isMounted = true;

        const processDbData = (dbData) => {
            const allProps = new Set(['Name', 'Material', 'Status', 'Vaciado_Nro']);
            
            const mappedData = dbData.map(node => {
                let row = {
                    dbId: node.external_id,
                    model_urn: node.model_urn,
                    source_urn: node.source_urn || node.model_urn,
                    Name: node.name,
                    Material: node.material || '',
                    Status: node.installation_status || '',
                    Vaciado_Nro: node.vaciado_nro || '',
                    // Preservar node_type para filtro "Assets only" (safety net legacy)
                    _nodeType: node.properties?.__node__?.__node_type__ || 'instance'
                };
                
                if (node.properties && typeof node.properties === 'object') {
                    Object.entries(node.properties).forEach(([catName, cat]) => {
                        if (typeof cat === 'object' && cat !== null) {
                            Object.entries(cat).forEach(([rawPName, pVal]) => {
                                // Civil 3D: strip redundant group prefix
                                let pName = rawPName;
                                if (pName.startsWith(catName)) {
                                    let cleaned = pName.slice(catName.length).replace(/^[\s\-\_\.]+/, '');
                                    if (cleaned.length > 0) pName = cleaned;
                                } else if (catName.toUpperCase() === 'PROPERTY SETS' && pName.match(/^.*?\s*[\-\u2013\u2014]\s*(.+)$/)) {
                                    pName = pName.match(/^.*?\s*[\-\u2013\u2014]\s*(.+)$/)[1];
                                }
                                const rawVal = (pVal === null || pVal === undefined) ? '' : String(pVal).trim();
                                const val = formatFractionalInch(rawVal);
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

            let preferredOrder = ['Name', 'Material', 'Status', 'Vaciado_Nro', 'Level', 'Tandem Category', 'Rooms', 'Dimensions', 'Categoría', 'Nivel base'];
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
                let result;
                if (window.postgresInventory && window.postgresInventory.length > 0) {
                    console.log(`[Inventory] 📦 Using offline window.postgresInventory — ${window.postgresInventory.length} items`);
                    
                    const allProps = new Set(['Name', 'Material', 'Status', 'Vaciado_Nro']);
                    const mappedData = window.postgresInventory.map(row => {
                         const newRow = { ...row };
                         if (!newRow.Name && newRow.name) newRow.Name = newRow.name;
                         Object.keys(newRow).forEach(k => {
                             if (!['dbId', 'name', 'model_urn', 'source_urn', '_nodeType'].includes(k)) {
                                 allProps.add(k);
                             }
                         });
                         return newRow;
                    });
                    
                    const preferredOrder = ['Name', 'Material', 'Status', 'Vaciado_Nro', 'Level', 'Tandem Category', 'Rooms', 'Dimensions', 'Categoría', 'Nivel base'];
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

                    result = { mappedData, cols, orderedCols };
                } else {
                    const urnQ = activeModelUrn && activeModelUrn !== 'global' ? `model_urn=${encodeURIComponent(activeModelUrn)}&` : '';
                    // FASE 1: carga LIVIANA (sin el JSONB properties) -> instantanea, sin timeout
                    // aunque el frente sea enorme (ej. CANAL: ~19k elementos / 48MB de properties).
                    const resLight = await apiFetch(`${BACKEND_URL}/api/inventory?${urnQ}include_props=false`);
                    if (!resLight.ok) throw new Error('Falló el fetch a /api/inventory (light)');
                    result = processDbData(await resLight.json());

                    // FASE 2 (segundo plano): trae properties completas y mejora las columnas.
                    // Si el frente es enorme y hace timeout, nos quedamos con la vista liviana (ya visible).
                    apiFetch(`${BACKEND_URL}/api/inventory?${urnQ}include_props=true`)
                        .then(r => (r.ok ? r.json() : null))
                        .then(full => {
                            if (full && isMounted) {
                                const rich = processDbData(full);
                                window.__inventoryCache[activeModelUrn] = rich;
                                setAllPropertyKeys(rich.orderedCols);
                                setColumns(rich.cols);
                                setRawData(rich.mappedData);
                                setFlattenedData(rich.mappedData);
                                console.log(`[Inventory] ⬆️ ${activeModelUrn}: columnas completas cargadas`);
                            }
                        })
                        .catch(() => { /* timeout en frente grande: se mantiene la vista liviana */ });
                }
                
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

        // Helper: filtro "Assets only" — descarta nodos type/category legacy
        // Nuevas extracciones ya no los traen, pero datos pre-existentes pueden tenerlos
        const applyAssetsFilter = (data) => {
            if (!showAssetsOnly) return data;
            return data.filter(row => row._nodeType === 'instance');
        };

        // PRIORIDAD: Isolation activa desde el visor 3D O Filtro Manual
        const isolationTarget = activeSelectionFilter || isolatedExtIds;

        if (isolationTarget && isolationTarget.size > 0) {
            const filtered = rawData.filter(row => isolationTarget.has(row.dbId));
            setFlattenedData(applyAssetsFilter(applyHiddenFilter(filtered)));
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
            setFlattenedData(applyAssetsFilter(applyHiddenFilter(rawData)));
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
            setFlattenedData(applyAssetsFilter(applyHiddenFilter(filtered)));
            console.log(`[Inventory] Filter sync: ${filtered.length}/${rawData.length} items match active filters`);
        } else {
            setFlattenedData([]);
        }
    }, [rawData, filterSelections, dynamicFilterBuckets, hiddenModelUrns, isolatedExtIds, activeSelectionFilter, showAssetsOnly]);

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

    const handleExportExcel = useCallback(async () => {
        if (!flattenedData.length || !columns.length) return;
        
        // Formatear la data para el Excel — VALORES NUMÉRICOS SIN UNIDAD
        // Esto permite sumar/operar directamente en Excel sin errores de texto.
        const stripUnitsAndParse = (raw) => {
            if (raw === null || raw === undefined || raw === '') return raw;
            const s = String(raw).trim();
            if (s === '') return '';
            // Preservar valores de pulgadas (ej. 3/8", 1") como texto puro para evitar que Excel reciba solo el primer dígito
            if (s.endsWith('"')) return s;
            // Extraer solo la parte numérica: dígitos, punto, coma, signo negativo
            // Ejemplos: "4.520 m³" → 4.52, "88.070 m" → 88.07, "260.89 m^3" → 260.89
            //           "10 kg" → 10, "1,234.56 m2" → 1234.56, "-3.5 °C" → -3.5
            const cleaned = s.replace(/,/g, ''); // Eliminar comas de miles
            const match = cleaned.match(/^(-?\d+\.?\d*)/); // Extraer número del inicio
            if (match) {
                // Verificar que hay texto NO-numérico después (unidad) O es solo número
                const rest = cleaned.slice(match[0].length).trim();
                // Si el resto está vacío o empieza con letra/símbolo (unidad), es un número con unidad
                if (rest === '' || /^[a-zA-Z°^µ²³\/]/.test(rest)) {
                    const parsed = parseFloat(match[1]);
                    if (!isNaN(parsed)) return parsed;
                }
            }
            return raw; // No es numérico, devolver tal cual (texto puro)
        };

        const dataForExcel = flattenedData.map(row => {
            const rowData = {};
            columns.forEach(c => {
                const val = row[c.key];
                rowData[c.header] = (typeof val === 'string') ? stripUnitsAndParse(val) : val;
            });
            return rowData;
        });

        // Si hay columnas de totales, añadimos una fila al final
        if (totalColumns.size > 0) {
            const totalsRow = {};
            columns.forEach((c, index) => {
                if (index === 0) {
                    totalsRow[c.header] = "Σ Totals";
                } else if (totalColumns.has(c.key)) {
                    let sum = 0;
                    flattenedData.forEach(r => {
                        const v = parseNumericCell(r[c.key]);
                        if (v !== null) sum += v;
                    });
                    totalsRow[c.header] = Math.round(sum * 100) / 100;
                } else {
                    totalsRow[c.header] = "";
                }
            });
            dataForExcel.push(totalsRow);
        }

        const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");

        const fileName = `Asset_Inventory_${new Date().toISOString().slice(0,10)}.xlsx`;

        // CAPACITOR NATIVE: Guardar en carpeta Descargas usando Filesystem
        if (Capacitor.isNativePlatform()) {
            try {
                const { Filesystem, Directory } = await import('@capacitor/filesystem');
                const xlsxData = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
                await Filesystem.writeFile({
                    path: fileName,
                    data: xlsxData,
                    directory: Directory.Documents,
                    recursive: true
                });
                alert(`Archivo guardado: ${fileName}`);
            } catch (err) {
                console.error('[Export] Error guardando en dispositivo:', err);
                // Fallback: intentar descarga web
                XLSX.writeFile(workbook, fileName);
            }
        } else {
            XLSX.writeFile(workbook, fileName);
        }
    }, [flattenedData, columns, totalColumns]);

    // (A) Tabla -> Visor
    const handleRowClick = useCallback((rowExtId, rowUrn) => {
        // En nuestro estado visual (React), la fila brilla usando el external_id
        setHighlightedDbId(rowExtId); 

        if (!rowUrn) {
            console.warn(`[Inventory] El elemento ${rowExtId} no tiene model_urn en la base de datos.`);
            return;
        }

        // Traducción Rosetta Bidimensional: Buscamos qué dbId efímero le toca a esta sesión 3D
        // Normalización Multi-Formato: probar raw, URL-safe base64, y standard base64
        const safeUrn = String(rowUrn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const stdUrn = String(rowUrn).replace(/-/g, '+').replace(/_/g, '/');
        const urnDict = window.rosettaToDbId?.[rowUrn]
            || window.rosettaToDbId?.[safeUrn]
            || window.rosettaToDbId?.[stdUrn]
            || Object.values(window.rosettaToDbId || {}).find((_, i) => {
                const k = Object.keys(window.rosettaToDbId)[i];
                return k.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === safeUrn;
            });
        
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
            const res = await apiFetch(`${BACKEND_URL}/api/inventory`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ external_id: extId, fieldName: colKey, fieldValue: newValue, model_urn: modelUrn })
            });

            if (!res.ok) throw new Error('Error al actualizar inventario en Backend');
            setFlattenedData(prev => prev.map(r => r.dbId === extId ? { ...r, _isSaving: false, [colKey]: newValue } : r));
            setRawData(prev => prev.map(r => r.dbId === extId ? { ...r, [colKey]: newValue } : r));
            // Invalidar caché para que el próximo re-open refleje cambios
            window.__inventoryCache = null;
            
            // INYECCIÓN DEMO: Actualizar la fuente de verdad en memoria y forzar re-cálculo
            if (window.postgresInventory) {
                const target = window.postgresInventory.find(node => node.dbId === extId);
                if (target) {
                    target[colKey] = newValue;
                }
                // Si el panel de filtros está abierto, esto actualizará las barras/colores en tiempo real
                window.dispatchEvent(new CustomEvent('recalculate-filters'));
            }

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

    // Compute total content width for horizontal scroll sync
    const totalContentWidth = useMemo(() => {
        const checkboxColWidth = 40;
        const colsWidth = columns.reduce((sum, col) => sum + col.width, 0);
        return checkboxColWidth + colsWidth;
    }, [columns]);

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
            <div style={{ display: 'flex', background: '#1c1d22', minHeight: '36px', alignItems: 'center', padding: '0 12px', borderBottom: checkedIds.size > 0 ? 'none' : '1px solid #252630', gap: '12px' }}>
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

                {/* Right Actions — ALWAYS VISIBLE */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* MANUAL SYNC FROM SELECTION, ISOLATION, OR CHECKBOXES */}
                    {(() => {
                        // Merge: checkedIds from table + localSelIds from 3D viewer
                        const mergedSyncIds = (() => {
                            const merged = new Set();
                            if (checkedIds.size > 0) checkedIds.forEach(id => merged.add(id));
                            if (localSelIds) localSelIds.forEach(id => merged.add(id));
                            return merged.size > 0 ? merged : null;
                        })();

                        const hasSyncSource = mergedSyncIds || activeSelectionFilter || isolatedExtIds;
                        if (!hasSyncSource) return null;

                        const isFiltered = activeSelectionFilter !== null || isolatedExtIds !== null;
                        const filterSize = activeSelectionFilter ? activeSelectionFilter.size : (isolatedExtIds ? isolatedExtIds.size : 0);
                        const isSyncDisabled = mergedSyncIds && isFiltered && mergedSyncIds.size === filterSize;

                        return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginRight: '4px', borderRight: '1px solid #333', paddingRight: '8px' }}>
                                {!isFiltered ? (
                                    <button
                                        onClick={() => setActiveSelectionFilter(mergedSyncIds)}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#aaa',
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontSize: '11.5px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                                        title="Sync inventory with selection (3D + checkboxes)"
                                    >
                                        <Icons.Sync /> Sync ({mergedSyncIds.size})
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => {
                                                if (mergedSyncIds) setActiveSelectionFilter(mergedSyncIds);
                                            }}
                                            disabled={!mergedSyncIds || isSyncDisabled}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: (!mergedSyncIds || isSyncDisabled) ? '#4fc3f7' : '#aaa',
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                fontSize: '11.5px',
                                                cursor: (!mergedSyncIds || isSyncDisabled) ? 'default' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={e => { 
                                                if (mergedSyncIds && !isSyncDisabled) {
                                                    e.currentTarget.style.color = '#fff';
                                                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)';
                                                }
                                            }}
                                            onMouseLeave={e => { 
                                                if (mergedSyncIds && !isSyncDisabled) {
                                                    e.currentTarget.style.color = '#aaa';
                                                    e.currentTarget.style.backgroundColor = 'transparent';
                                                }
                                            }}
                                            title={(mergedSyncIds && !isSyncDisabled) ? "Update filter with new selection" : "Table is currently filtered"}
                                        >
                                            {(mergedSyncIds && !isSyncDisabled) ? <Icons.Sync /> : <Icons.Filter />} Filtered ({filterSize})
                                        </button>
                                        {activeSelectionFilter !== null && (
                                            <button
                                                onClick={() => setActiveSelectionFilter(null)}
                                                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '4px', transition: 'all 0.2s' }}
                                                title="Clear Selection Filter"
                                                onMouseEnter={e => { e.currentTarget.style.color = '#ef5350'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                                            >
                                                <Icons.Close />
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })()}
                    <button 
                        onClick={handleExportExcel}
                        style={{ background: 'none', border: '1px solid #444', color: '#ccc', padding: '4px 10px', fontSize: '11.5px', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#ccc'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                        <Icons.ExportAction /> Export Excel
                    </button>
                    <button 
                        onClick={() => setTotalsPickerOpen(true)}
                        style={{ background: 'none', border: '1px solid #444', color: totalColumns.size > 0 ? '#4fc3f7' : '#ccc', padding: '4px 10px', fontSize: '11.5px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = totalColumns.size > 0 ? '#4fc3f7' : '#ccc'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                        title="Configure Column Totals"
                    >
                        <Icons.Sigma /> Totals {totalColumns.size > 0 ? `(${totalColumns.size})` : ''}
                    </button>
                    {totalColumns.size > 0 && (
                        <button 
                            onClick={() => setTotalColumns(new Set())}
                            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '4px', transition: 'all 0.2s' }}
                            title="Clear Totals"
                            onMouseEnter={e => { e.currentTarget.style.color = '#ef5350'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                            <Icons.Close />
                        </button>
                    )}
                </div>
            </div>

            {/* BULK EDIT TOOLBAR — Second Row (only when checks active) */}
            {checkedIds.size > 0 && (
                <div style={{
                    display: 'flex', background: '#1a2332', minHeight: '34px', alignItems: 'center',
                    padding: '0 12px', borderBottom: '1px solid #252630', gap: '8px',
                    animation: 'fadeIn 0.15s ease-out'
                }}>
                    <span style={{ fontSize: '11px', color: '#4fc3f7', fontWeight: 600, whiteSpace: 'nowrap' }}>{checkedIds.size} sel.</span>
                    <div style={{ width: '1px', height: '16px', background: '#333' }} />
                    <select
                        value={bulkField}
                        onChange={e => setBulkField(e.target.value)}
                        style={{
                            background: '#2a2d33', border: '1px solid #555', color: '#e0e0e0',
                            padding: '3px 6px', fontSize: '11px', borderRadius: '3px', outline: 'none',
                            maxWidth: '120px', cursor: 'pointer'
                        }}
                    >
                        {columns.filter(c => c.key !== 'dbId').map(c => (
                            <option key={c.key} value={c.key}>{c.header}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        value={bulkValue}
                        onChange={e => setBulkValue(e.target.value)}
                        placeholder="Valor..."
                        onKeyDown={e => { if (e.key === 'Enter' && bulkValue.trim()) document.getElementById('bulk-apply-btn')?.click(); }}
                        style={{
                            background: '#1a1c22', border: '1px solid #555', color: '#fff',
                            padding: '3px 8px', fontSize: '11px', borderRadius: '3px', outline: 'none',
                            width: '120px'
                        }}
                    />
                    <button
                        id="bulk-apply-btn"
                        disabled={bulkAssigning || !bulkValue.trim()}
                        onClick={async () => {
                            if (bulkAssigning || !bulkValue.trim()) return;
                            const fieldName = bulkField;
                            const fieldValue = bulkValue.trim();
                            setBulkAssigning(true);
                            const ids = [...checkedIds];
                            try {
                                await apiFetch(`${BACKEND_URL}/api/inventory/bulk`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ external_ids: ids, fieldName, fieldValue })
                                });
                                setFlattenedData(prev => prev.map(r => checkedIds.has(r.dbId) ? { ...r, [fieldName]: fieldValue } : r));
                                setRawData(prev => prev.map(r => checkedIds.has(r.dbId) ? { ...r, [fieldName]: fieldValue } : r));
                                if (window.postgresInventory) {
                                    window.postgresInventory.forEach(node => {
                                        if (checkedIds.has(node.dbId)) node[fieldName] = fieldValue;
                                    });
                                    window.dispatchEvent(new CustomEvent('recalculate-filters'));
                                }
                                window.__inventoryCache = null;
                                setCheckedIds(new Set());
                                setBulkValue('');
                            } catch (e) {
                                console.error('[BULK] Error:', e);
                                alert('Error en asignación masiva: ' + e.message);
                            } finally {
                                setBulkAssigning(false);
                            }
                        }}
                        style={{
                            background: (bulkAssigning || !bulkValue.trim()) ? '#444' : 'linear-gradient(135deg, #3AA0FF, #2d8fa5)',
                            border: 'none', color: '#fff', padding: '3px 10px', fontSize: '11px', borderRadius: '3px',
                            cursor: (bulkAssigning || !bulkValue.trim()) ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px',
                            fontWeight: 600, transition: 'all 0.2s', whiteSpace: 'nowrap',
                            boxShadow: (bulkAssigning || !bulkValue.trim()) ? 'none' : '0 2px 8px rgba(58,160,255,0.3)'
                        }}
                    >
                        {bulkAssigning ? '...' : '▶'} Aplicar
                    </button>
                    <button
                        onClick={() => setCheckedIds(new Set())}
                        style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '4px' }}
                        title="Clear selection"
                    >
                        <Icons.Close />
                    </button>
                </div>
            )}

            {/* Sub-header Summary */}
            <div style={{ padding: '6px 12px', background: '#18191e', fontSize: '11px', color: '#7a808b', borderBottom: '1px solid #252630', display: 'flex', justifyContent: 'space-between' }}>
                 <span>Showing {flattenedData.length.toLocaleString()} items {window._lastHasActiveFilters ? '(Filtered)' : ''}</span>
            </div>
            
            {/* ═══ UNIFIED SCROLL CONTAINER (horizontal + vertical) ═══ */}
            <div 
                ref={containerRef} 
                onScroll={handleScroll}
                style={{ 
                    flex: 1, 
                    minHeight: 0, 
                    overflow: 'auto',
                    position: 'relative'
                }}
            >
                {/* Inner wrapper forces minWidth for horizontal scroll */}
                <div style={{ minWidth: `${totalContentWidth}px` }}>
                    {/* Column Headers (sticky top) */}
                    <div 
                        ref={headerRef}
                        style={{ 
                            display: 'flex', background: '#1e1f24', height: '34px', alignItems: 'center', 
                            fontSize: '12px', fontWeight: 600, color: '#999', flexShrink: 0, 
                            borderBottom: '1px solid #2a2b30',
                            position: 'sticky', top: 0, zIndex: 2
                        }}
                    >
                        <div style={{ width: '40px', flexShrink: 0, borderRight: '1px solid #333', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <input 
                                type="checkbox" 
                                checked={checkedIds.size > 0 && checkedIds.size === flattenedData.length}
                                ref={el => { if (el) el.indeterminate = checkedIds.size > 0 && checkedIds.size < flattenedData.length; }}
                                onChange={() => {
                                    if (checkedIds.size === flattenedData.length) {
                                        setCheckedIds(new Set());
                                    } else {
                                        setCheckedIds(new Set(flattenedData.map(r => r.dbId)));
                                    }
                                }}
                                style={{ accentColor: '#3aa0ff', cursor: 'pointer', width: '13px', height: '13px', margin: 0 }}
                                title={checkedIds.size === flattenedData.length ? 'Deselect all' : `Select all ${flattenedData.length} items`}
                            />
                        </div>
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
                                    isChecked={checkedIds.has(row.dbId)}
                                    onToggleCheck={(dbId) => setCheckedIds(prev => { const next = new Set(prev); if (next.has(dbId)) next.delete(dbId); else next.add(dbId); return next; })}
                                />
                            ))}
                        </div>
                    ) : (
                        <div style={{ padding: '60px 20px', color: '#555', textAlign: 'center', fontSize: '14px' }}>
                            {window._lastHasActiveFilters ? 'No items match the current filter.' : 'Seleccione propiedades en Filters para poblar la tabla...'}
                        </div>
                    )}

                    {/* FOOTER TOTALS ROW (inside scroll container so it scrolls horizontally with data) */}
                    {totalColumns.size > 0 && flattenedData.length > 0 && (
                        <div style={{ 
                            display: 'flex', 
                            background: 'repeating-linear-gradient(45deg, #1a1b20, #1a1b20 10px, #22252a 10px, #22252a 20px)',
                            borderTop: '1px solid #333',
                            alignItems: 'center', fontSize: '12px', fontWeight: 600, color: '#4fc3f7', flexShrink: 0, height: '34px',
                            position: 'sticky', bottom: 0, zIndex: 2
                        }}>
                            <div style={{ width: '40px', flexShrink: 0, borderRight: '1px solid #333', display: 'flex', justifyContent: 'center' }}>
                                Σ
                            </div>
                            {columns.map(col => {
                                if (!totalColumns.has(col.key)) {
                                    return <div key={col.key} style={{ width: col.width, flexShrink: 0, padding: '0 12px', borderRight: '1px solid #333' }} />;
                                }
                                const sum = flattenedData.reduce((acc, row) => {
                                    const val = parseNumericCell(row[col.key]);
                                    return acc + (val || 0);
                                }, 0);
                                
                                return (
                                    <div key={col.key} style={{ 
                                        width: col.width, flexShrink: 0, padding: '0 12px', 
                                        borderRight: '1px solid #333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' 
                                    }}>
                                        {sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </div>
                                );
                            })}
                        </div>
            )}
                </div>{/* close inner minWidth wrapper */}
            </div>{/* close outer scroll container */}

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

            {/* ═══════ TOTALS COLUMN PICKER MODAL ═══════ */}
            {totalsPickerOpen && (
                <div 
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)', zIndex: 200,
                        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                        paddingTop: '10vh'
                    }}
                    onClick={(e) => { if (e.target === e.currentTarget) setTotalsPickerOpen(false); }}
                >
                    <div style={{
                        background: '#2a2a2e', border: '1px solid #444', borderRadius: '8px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.6)', width: '380px', maxHeight: '70vh',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden'
                    }}>
                        {/* Header */}
                        <div style={{ 
                            padding: '16px 20px', borderBottom: '1px solid #444', 
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center' 
                        }}>
                            <div>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>Column Totals</div>
                                <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>Select columns to show sums in the footer</div>
                            </div>
                            <button 
                                onClick={() => setTotalsPickerOpen(false)} 
                                style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: '4px' }}
                            ><Icons.Close /></button>
                        </div>

                        {/* Column List */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                            {columns.filter(c => c.key !== 'dbId').map(col => {
                                const isSelected = totalColumns.has(col.key);
                                // Verificar si la columna tiene datos numéricos
                                const sampleValues = flattenedData.slice(0, 20).map(r => parseNumericCell(r[col.key])).filter(n => n !== null);
                                const hasNumericData = sampleValues.length > 0;
                                
                                return (
                                    <div 
                                        key={col.key}
                                        onClick={() => {
                                            if (!hasNumericData) return;
                                            setTotalColumns(prev => {
                                                const next = new Set(prev);
                                                if (next.has(col.key)) next.delete(col.key);
                                                else next.add(col.key);
                                                return next;
                                            });
                                        }}
                                        style={{ 
                                            padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '12px',
                                            cursor: hasNumericData ? 'pointer' : 'not-allowed',
                                            opacity: hasNumericData ? 1 : 0.35,
                                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                                            background: isSelected ? 'rgba(79, 195, 247, 0.08)' : 'transparent',
                                            transition: 'background 0.15s'
                                        }}
                                        onMouseEnter={e => { if (hasNumericData) e.currentTarget.style.background = isSelected ? 'rgba(79, 195, 247, 0.12)' : 'rgba(255,255,255,0.05)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'rgba(79, 195, 247, 0.08)' : 'transparent'; }}
                                    >
                                        <div style={{
                                            width: '18px', height: '18px', borderRadius: '3px',
                                            border: isSelected ? '2px solid #4fc3f7' : '2px solid #555',
                                            background: isSelected ? '#4fc3f7' : 'transparent',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0, transition: 'all 0.15s'
                                        }}>
                                            {isSelected && (
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="3">
                                                    <polyline points="20 6 9 17 4 12"></polyline>
                                                </svg>
                                            )}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '13px', color: '#eee', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{col.header}</div>
                                            {hasNumericData && (
                                                <div style={{ fontSize: '10px', color: '#666', marginTop: '1px' }}>
                                                    {sampleValues.length} numeric value{sampleValues.length !== 1 ? 's' : ''} detected
                                                </div>
                                            )}
                                            {!hasNumericData && (
                                                <div style={{ fontSize: '10px', color: '#555', marginTop: '1px' }}>Non-numeric column</div>
                                            )}
                                        </div>
                                        {isSelected && (
                                            <div style={{ fontSize: '11px', color: '#4fc3f7', fontWeight: 600 }}>Σ</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Footer */}
                        <div style={{ 
                            padding: '12px 20px', borderTop: '1px solid #444', 
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: 'rgba(0,0,0,0.2)'
                        }}>
                            <span style={{ fontSize: '11px', color: '#888' }}>
                                {totalColumns.size} column{totalColumns.size !== 1 ? 's' : ''} selected
                            </span>
                            <button 
                                onClick={() => setTotalsPickerOpen(false)}
                                style={{ 
                                    background: '#4f83e8', border: 'none', color: '#fff', 
                                    padding: '6px 20px', borderRadius: '4px', fontSize: '12px', 
                                    fontWeight: 600, cursor: 'pointer' 
                                }}
                            >Done</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryDataGrid;
