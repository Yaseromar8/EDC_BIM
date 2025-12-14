import React, { useState } from 'react';
import './NavigationPanel.css';

const NavigationPanel = ({
    onToggleMinimap,
    minimapActive,
    onToggleVR,
    vrActive,
    sheets = [],
    onSelectSheet,
    activeSheet,
    docPlacementMode,
    onToggleDocMode
}) => {
    return (
        <div className="navigation-panel-container">
            <header className="panel-header">
                <h2>Navegación</h2>
                <span className="panel-subtitle">Herramientas de visualización</span>
            </header>

            {activeSheet && (
                <div className="nav-section active-view-section" style={{ backgroundColor: 'rgba(58, 160, 255, 0.1)', borderBottom: '1px solid #3aa0ff' }}>
                    <h3 style={{ color: '#3aa0ff' }}>VISTA 2D ACTIVA</h3>
                    <div style={{ padding: '0 0 10px 0' }}>
                        <div style={{ fontSize: '0.9rem', marginBottom: '8px', wordBreak: 'break-all' }}>
                            {activeSheet.name}
                        </div>
                        <button
                            className="primary-btn"
                            style={{ width: '100%', fontSize: '0.85rem' }}
                            onClick={() => onSelectSheet(null)}
                        >
                            ⬅ Volver al 3D
                        </button>
                    </div>
                </div>
            )}

            <div className="nav-section">
                <h3>Auxiliares</h3>
                <div className="nav-item">
                    <label className="nav-switch">
                        <input
                            type="checkbox"
                            checked={minimapActive}
                            onChange={(e) => onToggleMinimap(e.target.checked)}
                        />
                        <span className="slider"></span>
                        <span className="label-text">Minimapa (Planta)</span>
                    </label>
                    <p className="nav-desc">Muestra tu ubicación en un plano 2D.</p>
                </div>

                <div className="nav-item">
                    <label className="nav-switch">
                        <input
                            type="checkbox"
                            checked={vrActive}
                            onChange={(e) => onToggleVR(e.target.checked)}
                        />
                        <span className="slider"></span>
                        <span className="label-text">Modo VR (Beta)</span>
                    </label>
                    <p className="nav-desc">Vista estereoscópica para visores móviles.</p>
                </div>
            </div>

            <div className="nav-section">
                <h3>Documentación 3D</h3>
                <p className="nav-desc" style={{ marginBottom: '10px' }}>Adjunta planos PDF o DWG en ubicaciones específicas del modelo.</p>
                <button
                    className={`primary-btn ${docPlacementMode ? 'active' : ''}`}
                    onClick={() => onToggleDocMode(!docPlacementMode)}
                    style={{
                        width: '100%',
                        background: docPlacementMode ? '#eab308' : '#3aa0ff', // Yellow when active
                        color: docPlacementMode ? '#000' : '#fff'
                    }}
                >
                    {docPlacementMode ? 'Cancelar Colocación' : '+ Nuevo Marcador de Plano'}
                </button>
            </div>

            <div className="nav-section">
                <h3>Planos 2D (Sheets)</h3>
                {sheets.length === 0 ? (
                    <div className="empty-state">
                        No se detectaron planos 2D en los modelos cargados.
                    </div>
                ) : (
                    <div className="sheet-groups">
                        {Object.entries(
                            sheets.reduce((acc, sheet) => {
                                const groupName = sheet.modelName || 'Modelo Desconocido';
                                if (!acc[groupName]) acc[groupName] = [];
                                acc[groupName].push(sheet);
                                return acc;
                            }, {})
                        ).map(([groupName, groupSheets]) => (
                            <div key={groupName} className="sheet-group">
                                <div className="sheet-group-title" style={{ padding: '8px 10px', fontSize: '0.85rem', fontWeight: 'bold', color: '#3aa0ff', backgroundColor: '#2a2a2a', marginTop: '10px', borderRadius: '4px' }}>
                                    {groupName}
                                </div>
                                <ul className="sheet-list" style={{ marginTop: '5px' }}>
                                    {groupSheets.map((sheet, index) => (
                                        <li key={sheet.id || index} onClick={() => onSelectSheet(sheet)}>
                                            <div className="sheet-icon">📄</div>
                                            <div className="sheet-info" style={{ overflow: 'hidden' }}>
                                                <span
                                                    className="sheet-name"
                                                    title={sheet.name}
                                                    style={{
                                                        fontSize: '0.8rem',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        display: 'block',
                                                        maxWidth: '100%'
                                                    }}
                                                >
                                                    {sheet.name}
                                                </span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NavigationPanel;
