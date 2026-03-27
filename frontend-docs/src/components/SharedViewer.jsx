import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import DocumentViewer from './DocumentViewer';

const API = Capacitor.isNativePlatform()
  ? 'https://visor-ecd-backend.onrender.com'
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
      .catch(err => setError("Error de conexión"))
      .finally(() => setLoading(false));
  }, [shareId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f5f5f5' }}>
        <div className="acc-mini-spinner" style={{ width: 40, height: 40, border: '3px solid #0696d7', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: 20, color: '#666', fontFamily: 'ArtifaktElement', fontSize: 14 }}>Preparando visor de documento seguro...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f5f5f5', color: '#333' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d32f2f" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        <h2 style={{ fontFamily: 'ArtifaktElement', marginTop: 16 }}>Acceso Denegado</h2>
        <p style={{ fontFamily: 'ArtifaktElement', color: '#666' }}>{error}</p>
      </div>
    );
  }

  return (
    <DocumentViewer 
      file={data} 
      isShared={true} 
      sharedRole={data.role}
      API={API} 
      onClose={() => window.close()} 
    />
  );
}
