import React, { useState, useEffect } from 'react';
import { API, VISOR_URL } from '../../utils/helpers';
import { apiFetch } from '../../utils/apiFetch';

// Estética por frente conocida; cualquier frente nuevo recibe un estilo del ciclo
const FRONT_STYLES = {
  CANAL: { icon: '🌊', className: 'canal' },
  DRENAJE: { icon: '🌧️', className: 'drenaje' },
  INFRAWORKS: { icon: '🏗️', className: 'infraworks' },
};
const FALLBACK_STYLES = [
  { icon: '🏗️', className: 'infraworks' },
  { icon: '🌊', className: 'canal' },
  { icon: '🌧️', className: 'drenaje' },
];

export default function GatewayPanel({ project, onClose }) {
  const [frentes, setFrentes] = useState(null); // null = cargando
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API}/api/projects/${encodeURIComponent(project.id)}/frentes`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => { if (!cancelled) setFrentes(data.frentes || []); })
      .catch(e => {
        console.error('[Gateway] Error cargando frentes:', e);
        if (!cancelled) { setError('No se pudieron cargar los frentes del proyecto.'); setFrentes([]); }
      });
    return () => { cancelled = true; };
  }, [project.id]);

  const handleOpenFront = (front) => {
    // Intercepta en frontend-react App.jsx Gateway Interceptor:
    // project (id BD) + frente -> el visor construye "1_CANAL" y carga sus modelos.
    const url = `${VISOR_URL}/?project=${encodeURIComponent(project.id)}&frente=${encodeURIComponent(front.id)}&fn=${encodeURIComponent(front.title)}`;
    window.location.href = url;
  };

  const cards = (frentes || []).map((f, i) => {
    const style = FRONT_STYLES[f.id.toUpperCase()] || FALLBACK_STYLES[i % FALLBACK_STYLES.length];
    const title = f.id.charAt(0).toUpperCase() + f.id.slice(1).toLowerCase().replace(/_/g, ' ');
    return {
      id: f.id,
      title,
      desc: `Modelo 3D federado del frente ${title}. ${f.models} modelo${f.models !== 1 ? 's' : ''} vinculado${f.models !== 1 ? 's' : ''}.`,
      ...style,
    };
  });

  return (
    <div className="file-viewer-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000, display: 'flex', flexDirection: 'column', background: '#fff' }}>

      {/* Header del Overlay para mantener estilo nativo ACC */}
      <div className="file-viewer-header" style={{ padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e0e0e0', flexShrink: 0 }}>
        <div className="file-viewer-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: '#0696D7' }}>
            Frentes 3D — {project.name}
          </span>
        </div>
        <div className="file-viewer-actions">
           <button className="file-viewer-close" onClick={onClose} style={{ fontSize: 20, cursor: 'pointer', background: 'none', border: 'none', color: '#666' }}>✕</button>
        </div>
      </div>

      {/* Container de Frentes recuperado del index.css */}
      <div className="gateway-container">
        <div className="gateway-header">
          <h2>Módulos 3D del Proyecto</h2>
          <p>Selecciona un frente para aislar el modelo federado en el Visor 3D</p>
        </div>

        {frentes === null && (
          <div style={{ textAlign: 'center', padding: 60, color: '#888', fontSize: 14 }}>
            <div className="adsk-spinner" style={{ margin: '0 auto 16px' }} />
            Cargando frentes del proyecto...
          </div>
        )}

        {frentes !== null && error && (
          <div style={{ textAlign: 'center', padding: 60, color: '#c62828', fontSize: 14 }}>{error}</div>
        )}

        {frentes !== null && !error && cards.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: '#888', fontSize: 14 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏗️</div>
            Este proyecto aún no tiene frentes 3D con modelos vinculados.<br />
            Vincula modelos desde el Visor (Files → Importar) para que aparezcan aquí.
          </div>
        )}

        <div className="gateway-grid">
          {cards.map(f => (
            <div
              key={f.id}
              className={`gateway-card ${f.className}`}
              onClick={() => handleOpenFront(f)}
            >
              <div className="gateway-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
              <div className="gateway-card-footer">
                Abrir en Visor 3D <span>→</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
