/**
 * ShareModal.jsx — Modal de compartir estilo Google Drive
 * Refactorización Fase 2: Capa de Modales
 * Extraído de App.jsx líneas 2824-3001
 */
import React from 'react';
import { apiFetch } from '../../utils/apiFetch';
import { API, getInitials } from '../../utils/helpers';

export default function ShareModal({
  isOpen,
  shareTarget,
  user,
  projectPrefix,
  // Share state
  searchShareUser, setSearchShareUser,
  showShareResults, setShowShareResults,
  sharedUsers, setSharedUsers,
  allProjectUsers,
  shareGeneralAccess, setShareGeneralAccess,
  shareGeneralRole, setShareGeneralRole,
  shareLinkCopied, setShareLinkCopied,
  onClose
}) {
  if (!isOpen || !shareTarget) return null;

  const handleCopyLink = async () => {
    try {
      const res = await apiFetch(`${API}/api/docs/share`, {
        method: 'POST',
        body: JSON.stringify({
          node_id: shareTarget.id,
          model_urn: projectPrefix,
          shared_by: user?.email || 'Unknown',
          role: shareGeneralRole,
          access_type: shareGeneralAccess
        })
      });
      const data = await res.json();
      if (data.success) {
        const url = `${window.location.origin}/share/${data.share_id}`;
        navigator.clipboard.writeText(url);
        setShareLinkCopied(true);
        setTimeout(() => setShareLinkCopied(false), 3000);
      } else {
        alert("Error al generar el enlace.");
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión al generar el enlace.");
    }
  };

  const handleDone = () => {
    onClose();
    apiFetch(`${API}/api/docs/share`, {
      method: 'POST',
      body: JSON.stringify({
        node_id: shareTarget.id,
        model_urn: projectPrefix,
        shared_by: user?.email || 'Unknown',
        role: shareGeneralRole,
        access_type: shareGeneralAccess
      })
    }).catch(e => console.error(e));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="share-modal-box" onClick={e => e.stopPropagation()}>
        <div className="share-header">
          <h2>Compartir "{shareTarget.name.replace(/\/$/, '')}"</h2>
          <div className="share-header-actions">
            <button className="share-icon-btn" title="Ayuda"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></button>
            <button className="share-icon-btn" title="Configuración"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></button>
          </div>
        </div>

        <div className="share-input-wrapper" style={{ position: 'relative' }}>
          <span className="share-input-label">Añadir personas, grupos y eventos de calendario</span>
          <input 
            autoFocus
            className="share-input-acc"
            placeholder=" "
            value={searchShareUser}
            onChange={e => { setSearchShareUser(e.target.value); setShowShareResults(true); }}
            onKeyDown={e => {
              if (e.key === 'Enter' && searchShareUser.includes('@')) {
                setSharedUsers([...sharedUsers, { email: searchShareUser, name: searchShareUser.split('@')[0], initials: searchShareUser.slice(0,2).toUpperCase(), role: 'viewer', isExternal: true }]);
                setSearchShareUser('');
                setShowShareResults(false);
              }
            }}
          />
          {showShareResults && searchShareUser && (
            <div className="share-results-popover" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', borderRadius: 8, zIndex: 100, marginTop: 4, maxHeight: 200, overflowY: 'auto', padding: '8px 0' }}>
              {allProjectUsers.filter(u => u.name.toLowerCase().includes(searchShareUser.toLowerCase()) || u.email.toLowerCase().includes(searchShareUser.toLowerCase())).map(u => (
                <div key={u.email} className="share-result-item" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => {
                    if (!sharedUsers.find(ex => ex.email === u.email)) setSharedUsers([...sharedUsers, { ...u, role: 'viewer', isExternal: false }]);
                    setSearchShareUser('');
                    setShowShareResults(false);
                }}>
                  <div className="user-avatar-acc" style={{ width: 28, height: 28, fontSize: 11 }}>{u.initials}</div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</span>
                    <span style={{ fontSize: 11, color: '#666' }}>{u.email}</span>
                  </div>
                </div>
              ))}
              {searchShareUser.includes('@') && (
                <div className="share-result-item" style={{ padding: '8px 16px', borderTop: '1px solid #eee', fontSize: 13, color: '#0696D7', cursor: 'pointer' }} onClick={() => {
                  setSharedUsers([...sharedUsers, { email: searchShareUser, name: searchShareUser.split('@')[0], initials: searchShareUser.slice(0,2).toUpperCase(), role: 'viewer', isExternal: true }]);
                  setSearchShareUser('');
                  setShowShareResults(false);
                }}>
                  Invitar a "{searchShareUser}" (Externo)
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 8 }}>
          <div className="share-section-title">Personas con acceso</div>
          <div className="share-access-list">
            <div className="share-user-item">
              <div className="user-avatar-acc" style={{ width: 32, height: 32, fontSize: 13 }}>{getInitials(user?.email || 'OMAR SAN')}</div>
              <div className="share-user-info">
                <span className="share-user-name">{user?.name || 'Yaser Omar'} (tú)</span>
                <span className="share-user-email">{user?.email || 'omarsanchezh8@gmail.com'}</span>
              </div>
              <span className="share-user-role">Propietario</span>
            </div>
            {sharedUsers.map(su => (
              <div key={su.email} className="share-user-item">
                <div className="user-avatar-acc" style={{ width: 32, height: 32, fontSize: 13 }}>{su.initials}</div>
                <div className="share-user-info">
                  <span className="share-user-name">{su.name} {su.isExternal && '(Externo)'}</span>
                  <span className="share-user-email">{su.email}</span>
                </div>
                <select className="role-select-acc" value={su.role} onChange={e => setSharedUsers(sharedUsers.map(x => x.email === su.email ? { ...x, role: e.target.value } : x))}>
                  <option value="viewer">Lector</option>
                  <option value="commenter">Comentador</option>
                  <option value="editor">Editor</option>
                </select>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <div className="share-section-title">Acceso general</div>
          <div className="share-general-access">
            <div className="share-access-icon" style={{ background: shareGeneralAccess === 'restricted' ? '#f1f3f4' : '#e8f0fe', color: shareGeneralAccess === 'restricted' ? '#444746' : '#0b57d0' }}>
              {shareGeneralAccess === 'restricted' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
              )}
            </div>
            <div className="share-access-details">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="share-access-type-row" style={{ position: 'relative' }}>
                  <select 
                    style={{ background: 'transparent', border: 'none', fontSize: 14, fontWeight: 500, color: '#1f1f1f', cursor: 'pointer', outline: 'none', paddingRight: 20, appearance: 'none' }}
                    value={shareGeneralAccess}
                    onChange={e => setShareGeneralAccess(e.target.value)}
                  >
                    <option value="restricted">Restringido</option>
                    <option value="anyone">Cualquier persona con el enlace</option>
                  </select>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ position: 'absolute', right: 0, pointerEvents: 'none' }}><path d="M7 10l5 5 5-5H7z"/></svg>
                </div>
                {shareGeneralAccess === 'anyone' && (
                  <select className="role-select-acc" style={{ color: '#0b57d0', fontWeight: 500 }} value={shareGeneralRole} onChange={e => setShareGeneralRole(e.target.value)}>
                    <option value="viewer">Lector</option>
                    <option value="commenter">Comentador</option>
                    <option value="editor">Editor</option>
                  </select>
                )}
              </div>
              <div className="share-access-desc">
                {shareGeneralAccess === 'restricted' 
                  ? 'Solo los usuarios con acceso pueden abrir el enlace' 
                  : `Cualquier usuario de Internet con el enlace puede verlo como ${shareGeneralRole === 'viewer' ? 'Lector' : shareGeneralRole === 'commenter' ? 'Comentador' : 'Editor'}`}
              </div>
            </div>
          </div>
        </div>

        <div className="share-footer" style={{ position: 'relative' }}>
          <button className="btn-copy-link" style={shareLinkCopied ? { outline: '2px solid #0b57d0', outlineOffset: '2px', background: '#e8f0fe' } : {}} onClick={handleCopyLink}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
            Copiar enlace
          </button>
          
          {shareLinkCopied && (
            <div style={{ position: 'absolute', top: 50, left: 24, background: '#323232', color: '#fff', padding: '12px 16px', borderRadius: 4, fontSize: 14, display: 'flex', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', pointerEvents: 'none', zIndex: 9999 }}>
              Enlace copiado
            </div>
          )}

          <button className="btn-share-done" onClick={handleDone}>Hecho</button>
        </div>
      </div>
    </div>
  );
}
