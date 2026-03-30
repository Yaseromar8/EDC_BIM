import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/apiFetch';
import AddPermissionModal, { ACCPillBars } from './AddPermissionModal';
import '../index.css';

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
    if (!window.confirm("¿Seguro que deseas eliminar el acceso a este usuario?")) return;
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/docs/folder-permissions`, {
        method: 'DELETE',
        body: JSON.stringify({ permission_id: permId, folder_id: folder.id, model_urn: modelUrn })
      });
      const data = await res.json();
      if (data.success) {
        setPermissions(permissions.filter(p => p.id !== permId));
      } else {
        alert(data.error || "Error al eliminar");
      }
    } catch (err) {
      alert(err.message);
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
          <h3>Permisos - 📁 {folder?.name}</h3>
          <p>
            <span style={{marginRight: '12px'}}>👤 {permissions.length}</span>
            <span style={{color: '#ccc', marginRight: '12px'}}>👥 0</span>
            <span style={{color: '#ccc'}}>🏢 0</span>
          </p>
        </div>
        <button className="close-btn" onClick={onClose} title="Cerrar panel">×</button>
      </div>

      <div className="permissions-toolbar">
        <button className="btn-primary" onClick={() => setShowAddModal(true)}>+ Añadir</button>
        <button className="btn-secondary" title="Exportar permisos a Excel" disabled>Exportar</button>
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input 
            type="text" 
            placeholder="Buscar por nombre o correo elect." 
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
                <th>Nombre <span style={{fontSize:'10px'}}>↑↓</span></th>
                <th>Permisos <span style={{fontSize:'10px', color:'#ccc'}}>▼</span></th>
                <th>Tipo <span style={{fontSize:'10px', color:'#ccc'}}>▼</span></th>
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
                        <div style={{color: '#888'}}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                        </div>
                        <div className="user-details">
                          <span className="user-name">{perm.user_name || perm.user_email.split('@')[0]}</span>
                          <span className="user-email" style={{display: 'none'}}>{perm.user_email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="perm-badge">
                        <ACCPillBars level={perm.permission_level} />
                        <span className="lvl-text" style={{fontSize: '11px', color: '#666', marginTop: '2px'}}>{perm.permission_label}</span>
                      </div>
                    </td>
                    <td style={{color: '#333'}}>-</td>
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
