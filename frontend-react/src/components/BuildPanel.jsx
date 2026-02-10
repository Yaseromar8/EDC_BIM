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
    onCameraCapture
}) => {
    const selectedPin = pins.find(p => p.id === selectedPinId);
    const [activeMenu, setActiveMenu] = useState(null);
    const [isModelsOpen, setIsModelsOpen] = useState(false);
    const [isPinsOpen, setIsPinsOpen] = useState(false);

    // Delegate upload trigger to parent (to open modal)
    const handlePinUploadClick = (pinId) => {
        if (onPinUpload) onPinUpload(pinId);
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            onFileUpload(e.target.files[0]);
        }
    };

    const [isConnected, setIsConnected] = React.useState(false);

    React.useEffect(() => {
        fetch('/api/auth/status')
            .then(res => res.json())
            .then(data => setIsConnected(data.connected))
            .catch(err => console.error('Auth check failed', err));
    }, []);

    // activeTab state definition must be BEFORE useMemo
    const [activeTab, setActiveTab] = useState('DATA');

    // Filter pins based on activeTab
    const filteredPins = useMemo(() => {
        if (!pins) return [];
        if (activeTab === 'DATA') return pins;
        // Map tab names to pin types (lowercase)
        const typeMap = {
            'DOCS': 'docs',
            'AVANCE': 'avance',
            'RESTRICCIONES': 'restriccion'
        };
        const targetType = typeMap[activeTab];
        return pins.filter(p => p.type === targetType);
    }, [pins, activeTab]);

    // Handle Tab Switch
    const handleTabChange = (tab) => {
        setActiveTab(tab);
        // Reset or update placement mode if needed? 
        // For now, keep it simple. If user switches tab, placement mode might stay on 
        // but the type will be wrong unless we update it.
        // It's safer to turn off placement mode when switching tabs.
        if (placementMode) {
            onTogglePlacement(); // Turn off
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
                {['DATA', 'DOCS', 'AVANCE', 'RESTRICCIONES'].map((tab) => (
                    <button
                        key={tab}
                        className={`bp-tab ${activeTab === tab ? 'active' : ''}`}
                        onClick={() => handleTabChange(tab)}
                    >
                        {tab}
                    </button>
                ))}
            </div>


            {/* SHARED CONTENT FOR ALL TABS (Filtered) */}
            {(activeTab === 'DATA' || activeTab === 'DOCS' || activeTab === 'AVANCE' || activeTab === 'RESTRICCIONES') && (
                <>
                    {/* Header... (Shared) - Only show Models in DATA tab though? User said "when in DATA all are seen". Implies structure might be different per tab.
                        Let's keep Models ONLY in DATA for now as per "DATA contains what we have".
                        So conditionally render Models section.
                    */}
                    {activeTab === 'DATA' && (
                        <div className="sfp-header">
                            <h3>CONTROL DE OBRA</h3>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <button
                                    onClick={handleCameraClick}
                                    style={{
                                        background: '#3b82f6',
                                        border: 'none',
                                        color: 'white',
                                        borderRadius: '4px',
                                        padding: '4px 8px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        fontSize: '12px',
                                        fontWeight: 600
                                    }}
                                    title="Tomar Foto nueva"
                                >
                                    <span>📷</span> Foto
                                </button>

                                {isConnected ? (
                                    <div
                                        onClick={() => window.location.href = '/api/auth/login'}
                                        title="Reconectar"
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#10b981', fontWeight: '600', background: '#ecfdf5', padding: '4px 6px', borderRadius: '4px', border: '1px solid #a7f3d0', cursor: 'pointer'
                                        }}>
                                        <span>🟢</span> ON
                                    </div>
                                ) : (
                                    <button
                                        className="sfp-import-btn"
                                        onClick={() => window.location.href = '/api/auth/login'}
                                        style={{ background: '#0696D7', border: 'none' }}
                                    >
                                        Connect
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

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
                                        activeTab === 'AVANCE' ? 'Avance' : 'Restricciones'}
                            </span>
                            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        // Determine type based on tab
                                        const typeMap = { 'DATA': 'data', 'DOCS': 'docs', 'AVANCE': 'avance', 'RESTRICCIONES': 'restriccion' };
                                        onTogglePlacement(typeMap[activeTab]);
                                    }}
                                    className="sfp-import-text-btn"
                                    style={{
                                        background: placementMode ? '#3b82f6' : 'transparent',
                                        borderColor: placementMode ? '#3b82f6' : 'rgba(255,255,255,0.2)',
                                        color: placementMode ? 'white' : '#e0e0e0'
                                    }}
                                    title={`Crear nuevo ${activeTab === 'DATA' ? 'Punto' : activeTab}`}
                                >
                                    <TargetIcon /> {placementMode ? 'Creando...' : (activeTab === 'DATA' ? 'Crear Punto' : 'Nuevo')}
                                </button>
                                <button
                                    className={`sfp-action-btn eye ${!showPins ? 'off' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); onTogglePins(); }}
                                    title={showPins ? "Ocultar Puntos" : "Mostrar Puntos"}
                                >
                                    <EyeIcon off={!showPins} />
                                </button>
                            </div>
                        </div>

                        {isPinsOpen && (
                            <div className="sfp-list" style={{ paddingBottom: '120px' }}>
                                {!filteredPins || filteredPins.length === 0 ? (
                                    <div className="sfp-empty">
                                        {activeTab === 'DATA' ? 'Haz clic en el modelo para crear puntos.' : `No hay ${activeTab.toLowerCase()} creados.`}
                                    </div>
                                ) : (
                                    filteredPins.map((pin, index) => (
                                        <div
                                            key={pin.id}
                                            className={`sfp-item simple-item ${pin.id === selectedPinId ? 'selected' : ''}`}
                                            onClick={() => onPinSelect(pin.id)}
                                        >
                                            <div className="sfp-item-row">
                                                {/* Index Badge Color based on Type matching Viewer colors */}
                                                <span className="pin-index-badge" style={{
                                                    background: pin.type === 'restriccion' ? '#f59e0b' : // Yellow/Orange
                                                        pin.type === 'docs' ? '#3b82f6' :        // Blue
                                                            pin.type === 'avance' ? '#9ca3af' :      // Grey
                                                                '#6b7280'                                // Default Grey
                                                }}>
                                                    {/* In DATA tab, index might be confusing if we filter, but filteredPins updates index. 
                                                       Wait, index comes from map. If filtering, indices change relative to view. Perfect.
                                                    */}
                                                    {index + 1}
                                                </span>
                                                <span className="sfp-label">{pin.name}</span>

                                                {/* Type Indicator Icon if in DATA tab */}
                                                {activeTab === 'DATA' && pin.type && pin.type !== 'data' && (
                                                    <span style={{ fontSize: '10px', marginRight: '6px', opacity: 0.7 }}>
                                                        {pin.type === 'docs' ? '📄' : pin.type === 'restriccion' ? '⚠️' : '✅'}
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
                                                                    // Placeholder for rename
                                                                    alert("Funcionalidad de renombrar pronto.");
                                                                    setActiveMenu(null);
                                                                }}>
                                                                    <span className="sfp-menu-icon" style={{ fontSize: '12px' }}>✏️</span> Renombrar
                                                                </button>
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
