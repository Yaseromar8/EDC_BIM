import React from 'react';
import { VISOR_URL } from '../../utils/helpers';

export default function GatewayPanel({ projectPrefix, onClose }) {
  // As the user didn't specify the exact URNs for each front, 
  // we build them parametrically based on their projectPrefix
  // to ensure the bridge connects to frontend-react properly.
  const fronts = [
    {
      id: 'canal',
      title: 'Canal',
      desc: 'Modelo 3D federado del segmento Canal. Topografía, estructuras hidráulicas y civil.',
      icon: '🌊',
      className: 'canal',
      urn: `${projectPrefix}_Canal`
    },
    {
      id: 'drenaje',
      title: 'Drenaje',
      desc: 'Sistema de drenaje pluvial y saneamiento profundo. Cruces y colectores.',
      icon: '🌧️',
      className: 'drenaje',
      urn: `${projectPrefix}_Drenaje`
    },
    {
      id: 'infraworks',
      title: 'Infraworks',
      desc: 'Modelo master de infraestructura integrado. Coordinación MAC y servicios.',
      icon: '🏗️',
      className: 'infraworks',
      urn: `${projectPrefix}_Infraworks`
    }
  ];

  const handleOpenFront = (urn) => {
    // Intercepta en frontend-react (Puerto 5173) en App.jsx línea 581
    window.open(`${VISOR_URL}/?model_urn=${encodeURIComponent(urn)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="file-viewer-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000, display: 'flex', flexDirection: 'column', background: '#fff' }}>
      
      {/* Header del Overlay para mantener estilo nativo ACC */}
      <div className="file-viewer-header" style={{ padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e0e0e0', flexShrink: 0 }}>
        <div className="file-viewer-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: '#0696D7' }}>
            Frentes 3D (Gateway Interceptor)
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
          <p>Selecciona un frente para aislar el modelo federado en el Visor ACC Central</p>
        </div>
        
        <div className="gateway-grid">
          {fronts.map(f => (
            <div 
              key={f.id} 
              className={`gateway-card ${f.className}`}
              onClick={() => handleOpenFront(f.urn)}
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
