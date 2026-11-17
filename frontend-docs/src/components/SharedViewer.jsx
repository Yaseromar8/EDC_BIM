import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import DocumentViewer from './DocumentViewer';
import CarpetaCompartida from './CarpetaCompartida';

const API = Capacitor.isNativePlatform()
  ? 'https://visor-ecd-backend-va.onrender.com'
  : (import.meta.env.VITE_BACKEND_URL || '');

export default function SharedViewer({ shareId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // We use a regular fetch, not apiFetch, to avoid injecting tokens or catching 401s and redirecting to login.
    fetch(`${API}/api/docs/shared/${shareId}`)
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          setData(res.data);
        } else {
          setError(res.error || "Enlace no válido");
        }
      })
      .catch(() => setError("Error de conexión"))
      .finally(() => setLoading(false));
  }, [shareId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f1f0e8' }}>
        <div className="acc-mini-spinner" style={{ width: 40, height: 40, border: '3px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: 20, color: '#72706b', fontFamily: 'var(--a-font-sans)', fontSize: 14 }}>Preparando visor de documento seguro...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f1f0e8', color: '#333330' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#b93535" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        <h2 style={{ fontFamily: 'var(--a-font-sans)', marginTop: 16 }}>Acceso Denegado</h2>
        <p style={{ fontFamily: 'var(--a-font-sans)', color: '#72706b' }}>{error}</p>
      </div>
    );
  }

  // El enlace de una CARPETA (17-nov-2026, docs/archivos/32): su contenido, para leer.
  if (data.es_carpeta) {
    return <CarpetaCompartida API={API} shareId={shareId} nombre={data.name} />;
  }

  return (
    <DocumentViewer 
      file={{ ...data, shareId }}
      isShared={true} 
      sharedRole={data.role}
      API={API} 
      onClose={() => window.close()} 
    />
  );
}
