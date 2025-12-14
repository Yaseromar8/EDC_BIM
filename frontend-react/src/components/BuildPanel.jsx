import React, { useState } from 'react';
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
    // Pin Visibility
    showPins = true,
    onTogglePins,
    // Pin Placement
    placementMode,
    onTogglePlacement
}) => {
    const selectedPin = pins.find(p => p.id === selectedPinId);

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

    return (
        <div className="build-panel source-files-panel"> {/* Reuse SFP class for shared method */}
            {/* Header styled like SourceFilesPanel */}
            <div className="sfp-header">
                <h3>CONTROL DE OBRA</h3>
                {isConnected ? (
                    <div
                        onClick={() => window.location.href = '/api/auth/login'}
                        title="Reconectar"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '10px',
                            color: '#10b981',
                            fontWeight: '600',
                            background: '#ecfdf5',
                            padding: '4px 6px',
                            borderRadius: '4px',
                            border: '1px solid #a7f3d0',
                            cursor: 'pointer'
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

            {/* Models Section */}
            <div className="sfp-section">
                <div className="sfp-section-header">
                    <span className="sfp-section-title">Modelos 3D</span>
                    <button className="sfp-import-text-btn" onClick={onImport}>
                        <PlusIcon /> Importar
                    </button>
                </div>

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
            </div>

            {/* Pins Section */}
            <div className="sfp-section" style={{ marginTop: '15px' }}>
                <div className="sfp-section-header">
                    <span className="sfp-section-title">Puntos de Control</span>
                    <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                        <button
                            onClick={onTogglePlacement}
                            className="sfp-import-text-btn"
                            style={{
                                background: placementMode ? '#3b82f6' : 'transparent',
                                borderColor: placementMode ? '#3b82f6' : 'rgba(255,255,255,0.2)',
                                color: placementMode ? 'white' : '#e0e0e0'
                            }}
                            title="Habilitar modo de creación de puntos"
                        >
                            <TargetIcon /> {placementMode ? 'Creando...' : 'Crear Punto'}
                        </button>
                        <button
                            className={`sfp-action-btn eye ${!showPins ? 'off' : ''}`}
                            onClick={onTogglePins}
                            title={showPins ? "Ocultar Puntos" : "Mostrar Puntos"}
                        >
                            <EyeIcon off={!showPins} />
                        </button>
                    </div>
                </div>

                <div className="sfp-list">
                    {!pins || pins.length === 0 ? (
                        <div className="sfp-empty">
                            Haz clic en el modelo para crear puntos.
                        </div>
                    ) : (
                        pins.map((pin, index) => (
                            <div
                                key={pin.id}
                                className={`sfp-item simple-item ${pin.id === selectedPinId ? 'selected' : ''}`}
                                onClick={() => onPinSelect(pin.id)}
                            >
                                <div className="sfp-item-row">
                                    <span className="pin-index-badge">{index + 1}</span>
                                    <span className="sfp-label">{pin.name}</span>
                                    {pin.documents && pin.documents.length > 0 && (
                                        <span className="pin-doc-badge">📄 {pin.documents.length}</span>
                                    )}
                                    {pin.id === selectedPinId && <span className="selected-indicator"><TargetIcon /></span>}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Selected Pin Details / Upload */}
            <div className="build-upload-section" style={{ marginTop: 'auto', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                <div className="build-panel-info">
                    {!selectedPin ? (
                        <p className="build-instruction" style={{ textAlign: 'center', color: '#666', fontSize: '12px' }}>
                            Selecciona un punto para ver detalles.
                        </p>
                    ) : (
                        <>
                            <div className="selected-pin-header" style={{ marginBottom: '10px' }}>
                                <strong>📍 {selectedPin.name}</strong>
                            </div>

                            <label className={`build-upload-btn ${!selectedPin ? 'disabled' : ''}`}>
                                <input
                                    type="file"
                                    accept=".pdf,.png,.jpg,.jpeg,.webp,.svg,.doc,.docx,.xls,.xlsx,.kml,.kmz,.rvt,.dwg,.iwm"
                                    onChange={handleFileChange}
                                    disabled={uploading || !selectedPin}
                                />
                                <span>{uploading ? 'Subiendo…' : '📤 Cargar Adjunto'}</span>
                            </label>
                            {uploadError && <p className="build-upload-error">{uploadError}</p>}

                            {selectedPin.documents && selectedPin.documents.length > 0 && (
                                <div className="build-docs-list-compact">
                                    {selectedPin.documents.map(doc => (
                                        <div key={doc.id} className="compact-doc-item">
                                            <span>📄</span>
                                            <span className="doc-name" title={doc.name}>{doc.name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BuildPanel;
