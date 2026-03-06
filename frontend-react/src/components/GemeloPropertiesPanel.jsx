import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import './GemeloPropertiesPanel.css';

const BACKEND_URL = Capacitor.isNativePlatform()
    ? 'https://visor-ecd-backend.onrender.com'
    : (import.meta.env.VITE_BACKEND_URL || '');

const GemeloPropertiesPanel = ({
    isOpen,
    onClose,
    selectedElementId,
    selectedModelUrn,
    selectedProject,
    nativeProperties = [] // Properties from Revit
}) => {
    const [activeTab, setActiveTab] = useState('tandem'); // 'native' | 'tandem'
    const [customProps, setCustomProps] = useState({});
    const [loading, setLoading] = useState(false);
    const [editingState, setEditingState] = useState(null);

    // Initial load of custom properties
    useEffect(() => {
        if (!selectedElementId || !selectedModelUrn || !selectedProject || !isOpen) return;

        const loadCustomProps = async () => {
            setLoading(true);
            try {
                // We'll map the element using a stable ID, preferably ExternalId if available from nativeProps, 
                // but dbId is okay for a basic demo if ExternalId isn't passed yet.
                const stableId = getStableId(nativeProperties) || selectedElementId;
                const projId = selectedProject?.id || selectedProject || 'default_project';

                const res = await fetch(`${BACKEND_URL}/api/gemelo/properties?urn=${encodeURIComponent(selectedModelUrn)}&elementId=${stableId}&project=${projId}`);

                if (res.ok) {
                    const data = await res.json();
                    setCustomProps(data.properties || {});
                } else {
                    setCustomProps({});
                }
            } catch (err) {
                console.error("Error loading gemelo properties:", err);
            } finally {
                setLoading(false);
            }
        };

        loadCustomProps();
    }, [selectedElementId, selectedModelUrn, selectedProject, isOpen]);

    // Helper to extract an ExternalId if it's in the native props
    const getStableId = (props) => {
        const extIdProp = props.find(p => p.displayName === 'ExternalId' || p.attributeName === 'ExternalId');
        return extIdProp ? extIdProp.displayValue : null;
    };

    const handleSaveCustomProp = async (key, value) => {
        const stableId = getStableId(nativeProperties) || selectedElementId;
        const projId = selectedProject?.id || selectedProject || 'default_project';
        const newProps = { ...customProps, [key]: value };
        setCustomProps(newProps);
        setEditingState(null);

        try {
            await fetch(`${BACKEND_URL}/api/gemelo/properties`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    urn: selectedModelUrn,
                    elementId: stableId,
                    project: projId,
                    properties: newProps
                })
            });
        } catch (error) {
            console.error("Failed to save property", error);
        }
    };

    if (!isOpen) return null;

    // Default template keys for Twin Data
    const defaultKeys = [
        { key: 'FechaInstalacion', label: 'Fecha de Instalación', type: 'date' },
        { key: 'Fabricante', label: 'Fabricante', type: 'text' },
        { key: 'AssetID', label: 'ID de Activo (O&M)', type: 'text' },
        { key: 'EstadoMantenimiento', label: 'Estado Mantenimiento', type: 'select', options: ['Operativo', 'En Reparación', 'Fuera de Servicio'] },
    ];

    return (
        <div className="gemelo-panel-overlay">
            <div className="gemelo-panel glass-panel">
                <div className="gemelo-panel-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e67e22" strokeWidth="2">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                            <polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline>
                            <polyline points="7.5 19.79 7.5 14.6 3 12"></polyline>
                            <polyline points="21 12 16.5 14.6 16.5 19.79"></polyline>
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                            <line x1="12" y1="22.08" x2="12" y2="12"></line>
                        </svg>
                        <h3>Propiedades del Activo</h3>
                    </div>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="gemelo-tabs">
                    <button
                        className={`gemelo-tab ${activeTab === 'tandem' ? 'active' : ''}`}
                        onClick={() => setActiveTab('tandem')}
                    >
                        Gemelo (Editable)
                    </button>
                    <button
                        className={`gemelo-tab ${activeTab === 'native' ? 'active' : ''}`}
                        onClick={() => setActiveTab('native')}
                    >
                        Revit 🔒
                    </button>
                </div>

                <div className="gemelo-panel-content">
                    {activeTab === 'native' ? (
                        <div className="native-props-list">
                            {nativeProperties.length === 0 ? (
                                <p className="empty-state">No se recibieron propiedades de Autodesk.</p>
                            ) : (
                                nativeProperties.map((p, idx) => (
                                    <div className="prop-row" key={idx}>
                                        <div className="prop-name">{p.displayName}</div>
                                        <div className="prop-value">{p.displayValue}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="tandem-props-list">
                            {loading ? (
                                <div className="loading-spinner-small" />
                            ) : (
                                <>
                                    <div className="section-title">Datos de Operación y Mantenimiento</div>
                                    {defaultKeys.map((def) => {
                                        const isEditing = editingState === def.key;
                                        const value = customProps[def.key] || '';

                                        return (
                                            <div className="prop-row editable-row" key={def.key}>
                                                <div className="prop-name">{def.label}</div>
                                                <div className="prop-value-container">
                                                    {isEditing ? (
                                                        def.type === 'select' ? (
                                                            <select
                                                                autoFocus
                                                                defaultValue={value}
                                                                onBlur={(e) => handleSaveCustomProp(def.key, e.target.value)}
                                                                onChange={(e) => handleSaveCustomProp(def.key, e.target.value)}
                                                            >
                                                                <option value="">Seleccionar...</option>
                                                                {def.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                            </select>
                                                        ) : (
                                                            <input
                                                                type={def.type}
                                                                autoFocus
                                                                defaultValue={value}
                                                                onBlur={(e) => handleSaveCustomProp(def.key, e.target.value)}
                                                                onKeyDown={(e) => e.key === 'Enter' && handleSaveCustomProp(def.key, e.target.value)}
                                                            />
                                                        )
                                                    ) : (
                                                        <div className="prop-display" onClick={() => setEditingState(def.key)}>
                                                            {value || <span className="placeholder">Añadir valor...</span>}
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                <path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                                            </svg>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}

                                    <button className="add-custom-param-btn">
                                        + Añadir Nuevo Parámetro
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GemeloPropertiesPanel;
