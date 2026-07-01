import React, { useState, useEffect, useMemo } from 'react';
import './BuildPanel.css';

// Reuse similar icons for consistency
const PlusIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
);

const EyeIcon = ({ off }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {off ? (
            <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
            </>
        ) : (
            <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </>
        )}
    </svg>
);

const DeleteIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
);

const TargetIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="3" />
        <line x1="12" y1="2" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="22" />
        <line x1="2" y1="12" x2="5" y2="12" />
        <line x1="19" y1="12" x2="22" y2="12" />
    </svg>
);

const MoreIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="1"></circle>
        <circle cx="19" cy="12" r="1"></circle>
        <circle cx="5" cy="12" r="1"></circle>
    </svg>
);

const ChevronDown = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
);

const ChevronRight = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
);

const BuildPanel = ({
    buildUploads,
    pins,
    selectedPinId,
    onPinSelect,
    onFileUpload,
    uploading,
    uploadError,
    // Model Props
    models,
    hiddenModels,
    onImport,
    onToggleVisibility,
    onRemove,
    onPinDelete,
    onPinUpload,
    // Pin Visibility
    showPins = true,
    onTogglePins,
    // Pin Placement
    placementMode,
    onTogglePlacement,
    onCameraCapture,
    onPinMoveRequest, // New Prop for moving pins
    onPinRename
}) => {
    const selectedPin = pins.find(p => p.id === selectedPinId);
    const [activeMenu, setActiveMenu] = useState(null);
    const [isModelsOpen, setIsModelsOpen] = useState(false);
    const [isPinsOpen, setIsPinsOpen] = useState(true);
    const [editingPinId, setEditingPinId] = useState(null);
    const [editingValue, setEditingValue] = useState('');

    // Delegate upload trigger to parent (to open modal)
    const handlePinUploadClick = (pinId) => {
        if (onPinUpload) onPinUpload(pinId);
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            onFileUpload(e.target.files[0]);
        }
    };

    // activeTab state definition must be BEFORE useMemo
    const [activeTab, setActiveTab] = useState('DATA');

    // Pestañas alineadas 1:1 con la barra de seguimiento del visor
    // (label corto para que entren; key = categoría real en trackingData)
    const TABS = [
        { id: 'DATA', label: 'TODOS', type: null },
        { id: 'AVANCE', label: 'AVANCE', type: 'avance' },
        { id: 'FOTOS', label: 'FOTOS', type: 'fotos' },
        { id: 'DOCS', label: 'DOC', type: 'docs' },
        { id: 'RFIS', label: 'RFI', type: 'rfis' },
        { id: 'RESTRICCIONES', label: 'RESTR.', type: 'restricciones' }
    ];
    const activeTabDef = TABS.find(t => t.id === activeTab) || TABS[0];

    // Filter pins based on activeTab (por categoría real _trackingType)
    const filteredPins = useMemo(() => {
        if (!pins) return [];
        if (!activeTabDef.type) return pins;
        return pins.filter(p => p._trackingType === activeTabDef.type);
    }, [pins, activeTabDef]);

    // Handle Tab Switch
    const handleTabChange = (tab) => {
        setActiveTab(tab);
        // Al cambiar de pestaña, apagar el modo colocación (el tipo ya no coincide)
        if (placementMode) {
            onTogglePlacement(null); // Turn off
        }
    };

    // ... handleFileChange ...

    // Camera Ref
    const cameraInputRef = React.useRef(null);

    const handleCameraClick = () => {
        if (cameraInputRef.current) {
            cameraInputRef.current.click();
        }
    };

    const handleCameraChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            if (onCameraCapture) {
                onCameraCapture(e.target.files[0]);
            }
        }
    };

    return (
        <div className="build-panel source-files-panel">
            {/* TABS NAVIGATION */}
            <div className="bp-tabs">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        className={`bp-tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => handleTabChange(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>


            {/* SHARED CONTENT FOR ALL TABS (Filtered) */}
            {(
                <>
                    {/* Header... (Shared) - Only show Models in DATA tab though? User said "when in DATA all are seen". Implies structure might be different per tab.
                        Let's keep Models ONLY in DATA for now as per "DATA contains what we have".
                        So conditionally render Models section.
                    */}


                    {/* Modelos 3D Section - REMOVED per user request (Files handling only in FILES panel) */}
                    {/* 
                    {activeTab === 'DATA' && (
                        <div className="sfp-section">
                            <div
                                className="sfp-section-header clickable"
                                onClick={() => setIsModelsOpen(!isModelsOpen)}
                                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            >
                                <span className="sfp-section-icon" style={{ marginRight: '8px', display: 'flex' }}>
                                    {isModelsOpen ? <ChevronDown /> : <ChevronRight />}
                                </span>
                                <span className="sfp-section-title">Modelos 3D</span>
                                <button
                                    className="sfp-import-text-btn"
                                    onClick={(e) => { e.stopPropagation(); onImport(); }}
                                    style={{ marginLeft: 'auto' }}
                                >
                                    <PlusIcon /> Importar
                                </button>
                            </div>

                            {isModelsOpen && (
                                <div className="sfp-list">
                                    {models && models.length > 0 ? models.map(model => {
                                        const isHidden = hiddenModels.includes(model.urn);
                                        return (
                                            <div key={model.urn} className="sfp-item simple-item">
                                                <div className="sfp-item-row">
                                                    <button
                                                        className={`sfp-action-btn eye ${isHidden ? 'off' : ''}`}
                                                        onClick={() => onToggleVisibility(model.urn)}
                                                    >
                                                        <EyeIcon off={isHidden} />
                                                    </button>
                                                    <span className="sfp-label" title={model.label || model.name}>{model.label || model.name}</span>
                                                    <button
                                                        className="sfp-action-btn delete"
                                                        onClick={() => onRemove(model.urn)}
                                                    >
                                                        <DeleteIcon />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    }) : (
                                        <div className="sfp-empty">No hay modelos activos.</div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    */}

                    {/* Puntos de Control Section - SHOWN IN ALL TABS (Filtered) */}
                    <div className="sfp-section" style={{ marginTop: '0' }}>
                        {/* Header for Points - slightly different per tab? */}
                        <div
                            className="sfp-section-header clickable"
                            onClick={() => setIsPinsOpen(!isPinsOpen)}
                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', borderTop: activeTab === 'DATA' ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
                        >
                            <span className="sfp-section-icon" style={{ marginRight: '8px', display: 'flex' }}>
                                {isPinsOpen ? <ChevronDown /> : <ChevronRight />}
                            </span>
                            <span className="sfp-section-title">
                                {activeTab === 'DATA' ? 'Puntos de Control' :
                                    activeTab === 'DOCS' ? 'Documentos' :
                                        activeTab === 'FOTOS' ? 'Fotos' :
                                            activeTab === 'AVANCE' ? 'Avance' :
                                                activeTab === 'RFIS' ? 'RFIs' : 'Restricciones'}
                                <span style={{ marginLeft: '6px', fontSize: '10px', opacity: 0.55 }}>({filteredPins.length})</span>
                            </span>
                            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                                {/* Crear solo en pestañas con categoría concreta (en TODOS no se sabe qué tipo crear) */}
                                {activeTabDef.type && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onTogglePlacement(activeTabDef.type);
                                        }}
                                        className="sfp-import-text-btn"
                                        style={{
                                            background: placementMode ? '#5f7fa3' : 'transparent',
                                            borderColor: placementMode ? '#5f7fa3' : 'rgba(255,255,255,0.2)',
                                            color: placementMode ? 'white' : '#e0e0e0'
                                        }}
                                        title={`Crear nuevo pin de ${activeTabDef.label.toLowerCase()}`}
                                    >
                                        <TargetIcon /> {placementMode ? 'Creando...' : 'Nuevo'}
                                    </button>
                                )}
                                <button
                                    className={`sfp-action-btn eye ${!showPins ? 'off' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); if (onTogglePins) onTogglePins(); }}
                                    title={showPins ? "Ocultar pins en el modelo" : "Mostrar pins en el modelo"}
                                >
                                    <EyeIcon off={!showPins} />
                                </button>
                            </div>
                        </div>

                        {isPinsOpen && (
                            <div className="sfp-list" style={{ paddingBottom: '120px' }}>
                                {!filteredPins || filteredPins.length === 0 ? (
                                    <div className="sfp-empty">
                                        {activeTab === 'DATA'
                                            ? 'No hay pins aún. Elige una pestaña (Avance, Fotos, Doc…) y pulsa "Nuevo".'
                                            : `No hay pins de ${activeTabDef.label.toLowerCase()}. Pulsa "Nuevo" y haz clic en el modelo.`}
                                    </div>
                                ) : (
                                    filteredPins.map((pin, index) => (
                                        <div
                                            key={pin.id}
                                            className={`sfp-item simple-item ${pin.id === selectedPinId ? 'selected' : ''}`}
                                            onClick={() => onPinSelect(pin.id)}
                                        >
                                            <div className="sfp-item-row">
                                                {/* Badge con el color de la categoría (igual que el marcador 3D) */}
                                                <span className="pin-index-badge" style={{
                                                    background: pin.color || ({
                                                        avance: '#fbbf24',
                                                        fotos: '#3b82f6',
                                                        docs: '#8b5cf6',
                                                        rfis: '#ef4444',
                                                        restricciones: '#f59e0b',
                                                        maquinaria: '#64748b'
                                                    }[pin._trackingType] || '#3b82f6')
                                                }}>
                                                    {index + 1}
                                                </span>
                                                {editingPinId === pin.id ? (
                                                    <input
                                                        autoFocus
                                                        value={editingValue}
                                                        onChange={(e) => setEditingValue(e.target.value)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                const v = editingValue.trim();
                                                                if (v && onPinRename) onPinRename(pin.id, v);
                                                                setEditingPinId(null);
                                                            }
                                                            if (e.key === 'Escape') setEditingPinId(null);
                                                        }}
                                                        onBlur={() => {
                                                            const v = editingValue.trim();
                                                            if (v && v !== (pin.name || pin.val) && onPinRename) onPinRename(pin.id, v);
                                                            setEditingPinId(null);
                                                        }}
                                                        style={{
                                                            flex: 1, minWidth: 0, background: '#12151a',
                                                            border: '1px solid #5f7fa3', borderRadius: '4px',
                                                            color: '#fff', padding: '3px 6px', fontSize: '12px', outline: 'none'
                                                        }}
                                                    />
                                                ) : (
                                                    <span className="sfp-label" title={pin.name || pin.val || pin.id}>
                                                        {pin.name || pin.val || (pin.id && String(pin.id).substring(0, 8)) || 'Sin nombre'}
                                                    </span>
                                                )}

                                                {/* Indicador de categoría en la pestaña TODOS */}
                                                {activeTab === 'DATA' && pin._trackingType && (
                                                    <span style={{ fontSize: '10px', marginRight: '6px', opacity: 0.7 }} title={pin._trackingType}>
                                                        {{
                                                            avance: '✅', fotos: '📷', docs: '📄',
                                                            rfis: '❓', restricciones: '⚠️', maquinaria: '🚜'
                                                        }[pin._trackingType] || ''}
                                                    </span>
                                                )}

                                                {pin.documents && pin.documents.length > 0 && (
                                                    <span className="pin-doc-badge">📄 {pin.documents.length}</span>
                                                )}
                                                {pin.id === selectedPinId && <span className="selected-indicator"><TargetIcon /></span>}

                                                <div className="sfp-actions" style={{ marginLeft: 'auto', display: 'flex' }}>
                                                    <div className="sfp-menu-wrapper">
                                                        <button
                                                            className="sfp-action-btn more"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setActiveMenu(activeMenu === pin.id ? null : pin.id);
                                                            }}
                                                        >
                                                            <MoreIcon />
                                                        </button>
                                                        {activeMenu === pin.id && (
                                                            <div className="sfp-dropdown">
                                                                <button onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onPinSelect(pin.id);
                                                                    setActiveMenu(null);
                                                                }}>
                                                                    <span className="sfp-menu-icon"><TargetIcon /></span> Ir
                                                                </button>
                                                                <button onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setEditingPinId(pin.id);
                                                                    setEditingValue(pin.name || pin.val || '');
                                                                    setActiveMenu(null);
                                                                }}>
                                                                    <span className="sfp-menu-icon" style={{ fontSize: '12px' }}>✏️</span> Renombrar
                                                                </button>
                                                                {onPinMoveRequest && (
                                                                    <button onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onPinMoveRequest(pin.id);
                                                                        setActiveMenu(null);
                                                                    }}>
                                                                        <span className="sfp-menu-icon" style={{ fontSize: '12px' }}>↔</span> Mover
                                                                    </button>
                                                                )}
                                                                {/* Eliminado mover panel de maquinaria */}
                                                                {/* 
                                                                <button onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handlePinUploadClick(pin.id);
                                                                    setActiveMenu(null);
                                                                }}>
                                                                    <span className="sfp-menu-icon">📎</span> Adjuntar
                                                                </button>
                                                                */}
                                                                <hr className="sfp-menu-separator" />
                                                                <button
                                                                    className="delete-option"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onPinDelete(pin.id);
                                                                        setActiveMenu(null);
                                                                    }}
                                                                >
                                                                    <span className="sfp-menu-icon"><DeleteIcon /></span> Eliminar
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}




            {
                activeMenu && (
                    <div className="sfp-menu-overlay" onClick={() => setActiveMenu(null)}></div>
                )
            }

            {/* Hidden Camera Input */}
            <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={cameraInputRef}
                onChange={handleCameraChange}
                style={{ display: 'none' }}
            />
        </div>
    );
};

export default BuildPanel;
