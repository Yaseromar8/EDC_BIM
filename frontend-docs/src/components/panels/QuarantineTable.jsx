import React, { useState, useEffect } from 'react';
import { formatSize, formatDate } from '../../utils/helpers';
import { renderFileIconSop } from '../../utils/fileIcons';
import { apiFetch } from '../../utils/apiFetch';

export default function QuarantineTable({ projectPrefix, API, isAdmin, user }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchQuarantineFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${API}/api/docs/quarantine?model_urn=${encodeURIComponent(projectPrefix)}`);
      if (!res.ok) throw new Error('Error al cargar la Sala de Cuarentena');
      const data = await res.json();
      if (data.success) {
        setFiles(data.files || []);
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuarantineFiles();
    // eslint-disable-next-line
  }, [projectPrefix]);

  const handleAction = async (id, actionType) => {
    const payload = {
      items: [id],
      model_urn: projectPrefix,
      action: actionType === 'rehabilitate' ? 'SET_STATUS' : 'DELETE',
      user: user?.name || user?.email || 'Admin'
    };
    if (actionType === 'rehabilitate') {
      payload.status = 'WIP'; // Enviar de vuelta a Borrador
    }

    try {
      const res = await apiFetch(`${API}/api/docs/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        // Remover el archivo de la vista actual tras éxito
        setFiles(prev => prev.filter(f => f.id !== id));
      } else {
        alert("Error: " + (data.error || "Operación fallida"));
      }
    } catch (err) {
      alert("Error de red: " + err.message);
    }
  };

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>
      <div className="spinner-acc" style={{ margin: '0 auto 16px' }} />
      Cargando archivos retenidos...
    </div>
  );

  if (error) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#e53935' }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" style={{ marginBottom: 16 }}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
      <h4>Error en Holding Area</h4>
      <p>{error}</p>
      <button onClick={fetchQuarantineFiles} className="acc-btn-primary" style={{ marginTop: 16 }}>Reintentar</button>
    </div>
  );

  return (
    <div className="quarantine-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
      <div className="quarantine-header" style={{ padding: '24px 32px', borderBottom: '1px solid #eee', background: '#fafafa' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#ffb74d"><path d="M12 2L1 21h22M12 6l7.53 13H4.47zM11 10v4h2v-4zM11 16v2h2v-2z"/></svg>
          <h2 style={{ fontSize: 22, fontWeight: 400, color: '#333', margin: 0 }}>Sala de Cuarentena (ISO 19650)</h2>
        </div>
        <p style={{ margin: 0, color: '#666', fontSize: 13, lineHeight: '1.5' }}>
          Documentos en estado <strong>NON_CONFORMING</strong>. Estos archivos no cumplieron los criterios de validación o nomenclatura y se encuentran aislados del resto del CDE.
          {isAdmin && " Como administrador, rige el destino de estos activos."}
        </p>
      </div>

      <div className="quarantine-body" style={{ flex: 1, overflowY: 'auto' }}>
        {files.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#999' }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.2, marginBottom: 16 }}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            <h3 style={{ fontSize: 18, fontWeight: 500, margin: '0 0 8px', color: '#666' }}>Entorno Sano</h3>
            <p style={{ margin: 0, fontSize: 14 }}>No hay documentos retenidos en cuarentena para este proyecto.</p>
          </div>
        ) : (
          <table className="acc-matrix-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#fff', boxShadow: '0 1px 0 #e0e0e0', zIndex: 10 }}>
              <tr>
                <th style={{ padding: '12px 24px', fontSize: 12, fontWeight: 600, color: '#666', width: '35%' }}>Nombre del Archivo</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#666' }}>Ruta Original</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#666', width: '15%' }}>Actualizado el</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#666', width: '10%' }}>Tamaño</th>
                {isAdmin && (
                  <th style={{ padding: '12px 24px', fontSize: 12, fontWeight: 600, color: '#666', width: '150px', textAlign: 'right' }}>Acciones</th>
                )}
              </tr>
            </thead>
            <tbody>
              {files.map(f => (
                <tr key={f.id} style={{ borderBottom: '1px solid #eee', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background='#f9f9f9'} onMouseOut={e => e.currentTarget.style.background='none'}>
                  <td style={{ padding: '12px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 20 }}>{renderFileIconSop(f.name, false)}</span>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: '#333' }}>{f.name}</span>
                        <span style={{ fontSize: 11, color: '#ffb74d', fontWeight: 600 }}>NON_CONFORMING</span>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>
                    <span style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>{f.path || '/'}</span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>
                    {formatDate(f.updated_at)}
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>por {f.updated_by || 'Sistema'}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>
                    {formatSize(f.size_bytes)}
                  </td>
                  {isAdmin && (
                    <td style={{ padding: '12px 24px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                        <button 
                          onClick={() => handleAction(f.id, 'rehabilitate')}
                          title="Rehabilitar a WIP"
                          style={{ background: '#e8f5e9', color: '#2e7d32', border: '1px solid #c8e6c9', borderRadius: 4, padding: '6px 10px', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                          Rehabilitar
                        </button>
                        <button 
                          onClick={() => {
                            if (window.confirm(`¿Seguro que deseas destruir permanentemente "${f.name}"? Esta acción es irreversible.`)) {
                              handleAction(f.id, 'delete');
                            }
                          }}
                          title="Destruir Permanente"
                          style={{ background: '#ffebee', color: '#c62828', border: '1px solid #ffcdd2', borderRadius: 4, padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
