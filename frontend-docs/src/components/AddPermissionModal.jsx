import React, { useState, useRef, useEffect } from 'react';
import { apiFetch } from '../utils/apiFetch';
import '../index.css';

// Rango de barras por nivel REAL del backend (folder_permissions.PERMISSION_LEVELS).
// Antes comparaba con 'view_only'/'create'/'create_upload' —nombres que ya no
// existen— así que las barras se pintaban mal para viewer/view_markup.
const PILL_RANK = { none: 0, viewer: 1, view_download: 2, view_markup: 3, edit: 3, admin: 4 };

export const ACCPillBars = ({ level }) => {
  const rank = PILL_RANK[level] ?? 0;
  return (
    <div className="acc-pill-bars">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className={`acc-pill-bar ${rank >= i ? 'active' : 'outline'}`}></div>
      ))}
    </div>
  );
};

export default function AddPermissionModal({ folder, modelUrn, apiBaseUrl, onClose, onSuccess }) {
  const [email, setEmail] = useState('');
  const [level, setLevel] = useState('view_download');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  // Niveles EXACTOS que reconoce el backend (folder_permissions.PERMISSION_LEVELS).
  // Antes el modal ofrecía view_only/create/create_upload que NO existen en el
  // backend -> "Nivel inválido" al otorgar (el default view_only siempre fallaba).
  const PERMISSION_LEVELS = [
    { value: 'viewer', label: 'Ver', desc: 'Solo ver archivos' },
    { value: 'view_download', label: 'Ver y descargar', desc: 'Ver y descargar archivos' },
    { value: 'view_markup', label: 'Comentar', desc: 'Ver, descargar y publicar marcas de revisión' },
    { value: 'edit', label: 'Editar', desc: 'Ver, descargar, marcar y subir/editar archivos' },
    { value: 'admin', label: 'Administrar', desc: 'Control total, incluida eliminación y permisos' }
  ];

  const selectedOption = PERMISSION_LEVELS.find(l => l.value === level);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("El correo es requerido");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/docs/folder-permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder_id: folder.id,
          model_urn: modelUrn,
          user_email: email.trim(),
          permission_level: level
        })
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
      } else {
        setError(data.error || "No se pudo otorgar el permiso. Verifica que el usuario exista.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-permission-modal-overlay" onClick={onClose}>
      <div className="add-permission-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Añadir permisos</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-alert">{error}</div>}
            
            <div className="form-group">
              <label>Usuario (Correo Electrónico):</label>
              <input 
                type="email" 
                placeholder="Introduzca nombres, direcciones de correo electrónico, funciones o empresas" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
                required
              />
              <span className="help-text">El usuario debe estar previamente registrado en el sistema VISOR.</span>
            </div>
            
            <div className="form-group">
              <label>Permisos*</label>
              <div className="acc-custom-select" ref={dropdownRef}>
                <div 
                  className={`acc-select-trigger ${isOpen ? 'open' : ''}`} 
                  onClick={() => setIsOpen(!isOpen)}
                >
                  <div className="trigger-content">
                    <ACCPillBars level={selectedOption.value} />
                    <span>{selectedOption.label}</span>
                  </div>
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                </div>
                
                {isOpen && (
                  <div className="acc-select-dropdown">
                    {PERMISSION_LEVELS.map(lvl => (
                      <div 
                        key={lvl.value} 
                        className="acc-select-option"
                        onClick={() => {
                          setLevel(lvl.value);
                          setIsOpen(false);
                        }}
                      >
                        <ACCPillBars level={lvl.value} />
                        <div className="option-text">
                          <span className="opt-title">{lvl.label}</span>
                          <span className="opt-desc">{lvl.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Validando...' : 'Añadir Acceso'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
