// SharesManager.jsx — Gestión de enlaces compartidos del proyecto (revocar / ver vencimiento)
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { API, formatDate } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';

const STATE_CHIP = {
  active: { label: 'Activo', bg: '#dcfce7', color: '#15803d' },
  expired: { label: 'Vencido', bg: '#fef3c7', color: '#b45309' },
  revoked: { label: 'Revocado', bg: '#fee2e2', color: '#b91c1c' },
};

export default function SharesManager({ projectPrefix }) {
  const [shares, setShares] = useState(null);

  const load = () => {
    apiFetch(`${API}/api/docs/shares?model_urn=${encodeURIComponent(projectPrefix)}`)
      .then(r => r.json()).then(d => setShares(d.success ? d.shares : [])).catch(() => setShares([]));
  };
  useEffect(load, [projectPrefix]);

  const revoke = async (s) => {
    setShares(prev => prev.map(x => x.id === s.id ? { ...x, state: 'revoked' } : x));
    try {
      const r = await apiFetch(`${API}/api/docs/shares/${s.id}/revoke`, {
        method: 'POST', body: JSON.stringify({ model_urn: projectPrefix })
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      toast.success('Enlace revocado');
    } catch (e) { toast.error(e.message || 'Error'); load(); }
  };

  const copy = (id) => {
    navigator.clipboard.writeText(`${window.location.origin}/share/${id}`);
    toast.success('Enlace copiado');
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: 24, marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 4 }}>Enlaces compartidos</div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
        Enlaces públicos generados desde "Compartir". Revócalos para cortar el acceso externo al instante.
      </div>
      {shares === null ? (
        <div style={{ textAlign: 'center', padding: 24 }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
      ) : shares.length === 0 ? (
        <div style={{ fontSize: 13, color: '#999', padding: 12 }}>No hay enlaces compartidos en este proyecto.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', color: '#888', fontWeight: 500, textAlign: 'left' }}>
              <th style={{ padding: '8px 10px' }}>Documento</th>
              <th style={{ padding: '8px 10px' }}>Creado por</th>
              <th style={{ padding: '8px 10px' }}>Vence</th>
              <th style={{ padding: '8px 10px' }}>Estado</th>
              <th style={{ padding: '8px 10px' }}></th>
            </tr>
          </thead>
          <tbody>
            {shares.map(s => {
              const chip = STATE_CHIP[s.state] || STATE_CHIP.active;
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid #f3f3f3' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 500, color: '#333', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</td>
                  <td style={{ padding: '8px 10px', color: '#666' }}>{s.shared_by}</td>
                  <td style={{ padding: '8px 10px', color: '#666' }}>{s.expires_at ? formatDate(s.expires_at) : 'Nunca'}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 10, background: chip.bg, color: chip.color }}>{chip.label}</span>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {s.state === 'active' && (
                      <>
                        <button onClick={() => copy(s.id)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600, marginRight: 12 }}>Copiar</button>
                        <button onClick={() => revoke(s)} style={{ background: 'none', border: 'none', color: '#e53935', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Revocar</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
