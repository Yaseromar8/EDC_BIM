import React from 'react';
import toast from 'react-hot-toast';
import { apiFetch } from '../../utils/apiFetch';
import { API, getInitials } from '../../utils/helpers';

// El backend todavía no persiste ACL por invitado. En vez de aparentar que un
// correo fue invitado, este modal expone únicamente el flujo que sí es seguro:
// enlace público explícito, solo lectura, revocable y con vencimiento.
export default function ShareModal({ isOpen, shareTarget, user, projectPrefix, shareLinkCopied, setShareLinkCopied, onClose }) {
  const [expiresDays, setExpiresDays] = React.useState(7);
  const [creating, setCreating] = React.useState(false);
  if (!isOpen || !shareTarget) return null;

  const handleCopyLink = async () => {
    setCreating(true);
    try {
      const res = await apiFetch(`${API}/api/docs/share`, {
        method: 'POST',
        body: JSON.stringify({
          node_id: shareTarget.id,
          model_urn: projectPrefix,
          shared_by: user?.email || 'Unknown',
          role: 'viewer',
          access_type: 'anyone',
          expires_days: expiresDays,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo generar el enlace.');
      await navigator.clipboard.writeText(`${window.location.origin}/share/${data.share_id}`);
      setShareLinkCopied(true);
      setTimeout(() => setShareLinkCopied(false), 3000);
    } catch (error) {
      toast.error(error.message || 'Error de conexión al generar el enlace.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="share-modal-box" onClick={e => e.stopPropagation()}>
        <div className="share-header"><h2>Compartir &quot;{shareTarget.name.replace(/\/$/, '')}&quot;</h2></div>
        <div style={{ padding: '8px 0', fontSize: 13, color: '#555', lineHeight: 1.55 }}>
          Este piloto crea enlaces públicos de solo lectura. Las invitaciones individuales y los enlaces restringidos se habilitarán cuando exista una lista de acceso persistente. Para usuarios registrados, usa permisos de carpeta.
        </div>
        <div className="share-access-list">
          <div className="share-user-item">
            <div className="user-avatar-acc" style={{ width: 32, height: 32, fontSize: 13 }}>{getInitials(user?.email || 'US')}</div>
            <div className="share-user-info"><span className="share-user-name">{user?.name || 'Usuario'} (tú)</span><span className="share-user-email">{user?.email || ''}</span></div>
            <span className="share-user-role">Propietario</span>
          </div>
        </div>
        <div className="share-general-access" style={{ marginTop: 12 }}>
          <div className="share-access-details"><strong>Cualquier persona con el enlace</strong><div className="share-access-desc">Lector; revoca el enlace al terminar el piloto.</div></div>
          <span className="share-user-role">Lector</span>
        </div>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#444' }}>
          <span>El enlace caduca en:</span>
          <select value={expiresDays} onChange={e => setExpiresDays(Number(e.target.value))} disabled={creating}>
            <option value={1}>1 día</option><option value={7}>7 días</option><option value={30}>30 días</option><option value={90}>90 días</option>
          </select>
        </div>
        <div className="share-footer" style={{ position: 'relative' }}>
          <button className="btn-copy-link" disabled={creating} onClick={handleCopyLink}>{creating ? 'Creando…' : 'Copiar enlace'}</button>
          {shareLinkCopied && <div style={{ position: 'absolute', top: 50, left: 24, background: '#323232', color: '#fff', padding: '12px 16px', borderRadius: 4 }}>Enlace copiado</div>}
          <button className="btn-share-done" onClick={onClose}>Hecho</button>
        </div>
      </div>
    </div>
  );
}
