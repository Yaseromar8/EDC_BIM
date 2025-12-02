import React from 'react';
import './BuildPanel.css';

const BuildPanel = ({
    buildUploads, // Legacy prop, might remove later
    pins,
    selectedPinId,
    onPinSelect,
    onFileUpload,
    uploading,
    uploadError,
    layers,
    onLayerUpload,
    onLayerDelete,
    onLayerToggle
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
        <div className="build-panel">
            <header className="build-panel-header">
                <div>
                    <p className="build-panel-title">Seguimiento de Obra</p>
                    <span className="build-panel-subtitle">
                        {pins.length} puntos registrados
                    </span>
                </div>
                {isConnected ? (
                    <div
                        onClick={() => window.location.href = '/api/auth/login'}
                        title="Click para reconectar/refrescar sesión"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '12px',
                            color: '#10b981',
                            fontWeight: '600',
                            marginLeft: 'auto',
                            background: '#ecfdf5',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid #a7f3d0',
                            cursor: 'pointer'
                        }}>
                        <span style={{ fontSize: '10px' }}>🟢</span> Conectado
                    </div>
                ) : (
                    <button
                        className="aps-login-btn"
                        onClick={() => window.location.href = '/api/auth/login'}
                        title="Conectar con Autodesk Construction Cloud"
                        style={{
                            background: '#0696D7',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            marginLeft: 'auto'
                        }}
                    >
                        🔑 Conectar
                    </button>
                )}
            </header>

            <div className="build-panel-info">
                {!selectedPin ? (
                    <p className="build-instruction">
                        🗺️ Haz click en el mapa para crear o seleccionar un punto.
                    </p>
                ) : (
                    <div className="selected-pin-info">
                        <strong>📍 {selectedPin.name}</strong>
                        <small>Seleccionado</small>
                    </div>
                )}
            </div>

            {pins.length > 0 && (
                <div className="pins-list-simple">
                    <h4>Puntos Creados</h4>
                    <ul>
                        {pins.map((pin, index) => (
                            <li
                                key={pin.id}
                                className={pin.id === selectedPinId ? 'selected' : ''}
                                onClick={() => onPinSelect(pin.id)}
                            >
                                <span className="pin-number">{index + 1}</span>
                                <div>
                                    <strong>{pin.name}</strong>
                                    <small>{new Date(pin.createdAt).toLocaleDateString('es-ES')}</small>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Map Layers Section */}
            <div className="build-layers-section" style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
                <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    Capas del Mapa
                    <label className="add-layer-btn" style={{ cursor: 'pointer', fontSize: '12px', color: '#0696D7' }}>
                        + Agregar
                        <input
                            type="file"
                            accept=".kml,.kmz"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                    onLayerUpload(e.target.files[0]);
                                    e.target.value = '';
                                }
                            }}
                        />
                    </label>
                </h4>
                {layers && layers.length > 0 ? (
                    <ul className="layers-list" style={{ listStyle: 'none', padding: 0 }}>
                        {layers.map(layer => (
                            <li key={layer.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', background: '#f9fafb', marginBottom: '5px', borderRadius: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="checkbox"
                                        checked={layer.visible}
                                        onChange={() => onLayerToggle(layer.id, !layer.visible)}
                                    />
                                    <span style={{ fontSize: '13px', fontWeight: 500 }}>{layer.name}</span>
                                </div>
                                <button
                                    onClick={() => onLayerDelete(layer.id)}
                                    style={{ border: 'none', background: 'none', cursor: 'pointer', opacity: 0.5 }}
                                    title="Eliminar capa"
                                >
                                    ✕
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>
                        No hay capas (KMZ) cargadas.
                    </p>
                )}
            </div>

            <div className="build-upload-section">
                <label className={`build-upload-btn ${!selectedPin ? 'disabled' : ''}`}>
                    <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.svg,.doc,.docx,.xls,.xlsx,.kml,.kmz,.rvt,.dwg,.iwm"
                        onChange={handleFileChange}
                        disabled={uploading || !selectedPin}
                    />
                    <span>{uploading ? 'Subiendo…' : '📤 Cargar Documentos'}</span>
                </label>
                {!selectedPin && <small className="upload-hint">Selecciona un punto primero</small>}
                {uploadError && <p className="build-upload-error">{uploadError}</p>}
            </div>

            {selectedPin && selectedPin.documents && selectedPin.documents.length > 0 && (
                <div className="build-docs-list">
                    <h4>Documentos de {selectedPin.name} ({selectedPin.documents.length})</h4>
                    <ul>
                        {selectedPin.documents.map(doc => (
                            <li key={doc.id}>
                                <span className="doc-icon">📄</span>
                                <div>
                                    <strong>{doc.name}</strong>
                                    <small>{new Date(doc.timestamp).toLocaleString()}</small>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default BuildPanel;
