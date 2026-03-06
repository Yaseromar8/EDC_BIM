
import React, { useState, useEffect } from 'react';
import './ActivityLogPanel.css';

/**
 * ActivityLogPanel - Muestra el feed de actividades del proyecto
 * Replica el comportamiento de "Activity" en Autodesk ACC.
 */
const ActivityLogPanel = ({ modelUrn }) => {
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

    const fetchActivities = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/activity?model_urn=${encodeURIComponent(modelUrn)}&limit=50`);
            const json = await res.json();
            if (json.success) {
                setActivities(json.data || []);
            } else {
                setError(json.error);
            }
        } catch (e) {
            console.error('[ActivityLog] Error:', e);
            setError("Error al conectar con el servidor.");
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchActivities();
    }, [modelUrn]);

    const getIcon = (action) => {
        switch (action) {
            case 'upload': return '📤';
            case 'delete': return '🗑️';
            case 'create_folder': return '📁';
            case 'rename': return '✏️';
            case 'view': return '👁️';
            default: return '📝';
        }
    };

    const formatAction = (action) => {
        const map = {
            'upload': 'Subió',
            'delete': 'Eliminó',
            'create_folder': 'Creó carpeta',
            'rename': 'Renombró',
            'view': 'Visualizó'
        };
        return map[action] || action;
    };

    return (
        <div className="activity-panel-container">
            <header className="panel-header">
                <h2>Actividad</h2>
                <span className="panel-subtitle">Registro de cambios del proyecto</span>
            </header>

            <div className="activity-controls">
                <button className="refresh-btn" onClick={fetchActivities} disabled={loading}>
                    {loading ? 'Cargando...' : '🔄 Actualizar'}
                </button>
            </div>

            <div className="activity-list">
                {activities.length === 0 && !loading && (
                    <div className="empty-state">No hay actividad registrada aún.</div>
                )}

                {activities.map((act, i) => (
                    <div key={i} className="activity-item">
                        <div className="activity-icon">{getIcon(act.action)}</div>
                        <div className="activity-content">
                            <div className="activity-header">
                                <span className="activity-user">{act.performed_by || 'Sistema'}</span>
                                <span className="activity-date">
                                    {new Date(act.created_at).toLocaleString('es-PE', {
                                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                    })}
                                </span>
                            </div>
                            <div className="activity-description">
                                <strong>{formatAction(act.action)}</strong> {act.entity_name}
                                {act.details?.size_mb && (
                                    <span className="activity-meta"> ({act.details.size_mb} MB)</span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {error && <div className="activity-error">{error}</div>}
        </div>
    );
};

export default ActivityLogPanel;
