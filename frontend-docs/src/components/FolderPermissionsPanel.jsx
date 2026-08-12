import toast from 'react-hot-toast';
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { confirmAction } from '../utils/confirm';
import AddPermissionModal, { ACCPillBars } from './AddPermissionModal';
import '../index.css';

// Iconos de LÍNEA (sin emojis): mismo lenguaje visual que el resto de la app.
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...stroke} style={{ color: 'var(--accent)', flexShrink: 0 }}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);
const UserIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} style={{ flexShrink: 0 }}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...stroke}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
);
const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...stroke}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
);

export default function FolderPermissionsPanel({ folder, modelUrn, apiBaseUrl, onClose }) {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchPermissions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/docs/folder-permissions?folder_id=${folder.id}&model_urn=${modelUrn}`);
      const data = await res.json();
      if (data.success) {
        setPermissions(data.permissions || []);
      } else {
        setError(data.error || 'Error al cargar permisos.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (folder?.id) {
      fetchPermissions();
    }
  }, [folder]);

  const removePermission = async (permId) => {
    const ok = await confirmAction({
      title: 'Retirar acceso',
      message: 'Este usuario dejará de tener acceso a esta carpeta y a su contenido heredado.',
      confirmText: 'Retirar acceso',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/docs/folder-permissions`, {
        method: 'DELETE',
        body: JSON.stringify({ permission_id: permId, folder_id: folder.id, model_urn: modelUrn })
      });
      const data = await res.json();
      if (data.success) {
        setPermissions(permissions.filter(p => p.id !== permId));
      } else {
        toast.error(data.error || "Error al eliminar");
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const filteredPermissions = permissions.filter(p => 
    p.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.user_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="permissions-panel open">
      <div className="permissions-panel-header">
        <div className="permissions-title">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <FolderIcon />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={folder?.name}>
              {folder?.name}
            </span>
          </h3>
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280', fontSize: 12, margin: '4px 0 0' }}>
            <UserIcon />
            <span>{permissions.length} {permissions.length === 1 ? 'usuario con acceso' : 'usuarios con acceso'}</span>
          </p>
        </div>
        <button className="close-btn" onClick={onClose} title="Cerrar panel">×</button>
      </div>

      <div className="permissions-toolbar">
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" onClick={() => setShowAddModal(true)}>
            <PlusIcon /> Añadir
          </button>
          <button className="btn-secondary" title="Exportación a Excel: próximamente" disabled>Exportar</button>
        </div>
        <div className="search-box">
          <span className="search-icon" style={{ display: 'inline-flex' }}><SearchIcon /></span>
          <input
            type="text"
            placeholder="Buscar por nombre o correo"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="permissions-content">
        {error && <div className="error-alert">{error}</div>}
        {loading ? (
          <div className="loading-spinner">Cargando permisos...</div>
        ) : (
          <table className="permissions-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Permisos</th>
                <th>Tipo</th>
                <th style={{width: '40px'}}></th>
              </tr>
            </thead>
            <tbody>
              {filteredPermissions.length === 0 ? (
                <tr>
                  <td colSpan="4" className="empty-state">
                    {searchTerm ? "No se encontraron coincidencias." : "No hay permisos individuales fijados. Se aplican los permisos heredados del padre o rol global."}
                  </td>
                </tr>
              ) : (
                filteredPermissions.map(perm => {
                  return (
                  <tr key={perm.id}>
                    <td>
                      <div className="user-info">
                        <div style={{color: '#8b93a0', display: 'flex'}}><UserIcon /></div>
                        <div className="user-details" style={{ minWidth: 0 }}>
                          <span className="user-name">{perm.user_name || perm.user_email.split('@')[0]}</span>
                          {/* El correo SÍ se muestra: es el dato que identifica sin ambigüedad */}
                          <span className="user-email" style={{ fontSize: 11, color: '#8b93a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{perm.user_email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="perm-badge">
                        <ACCPillBars level={perm.permission_level} />
                        <span className="lvl-text" style={{fontSize: '11px', color: '#666', marginTop: '2px'}}>{perm.permission_label}</span>
                      </div>
                    </td>
                    <td style={{ color: '#6b7280', fontSize: 12 }}>Usuario</td>
                    <td>
                      <button className="icon-btn action-delete" onClick={() => removePermission(perm.id)} title="Retirar acceso">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </td>
                  </tr>
                )})
              )}
            </tbody>
          </table>
        )}
      </div>

      {showAddModal && (
        <AddPermissionModal 
          folder={folder} 
          modelUrn={modelUrn}
          apiBaseUrl={apiBaseUrl}
          onClose={() => setShowAddModal(false)} 
          onSuccess={() => {
            setShowAddModal(false);
            fetchPermissions();
          }}
        />
      )}
    </div>
  );
}
