import React, { useState, useRef, useEffect } from 'react';
import { apiFetch } from '../utils/apiFetch';
import '../index.css';

export const ACCPillBars = ({ level }) => {
  const isView = level === 'view_only';
  const isViewDown = level === 'view_download';
  const isCreate = level === 'create';
  const isCreateUp = level === 'create_upload';
  const isEdit = level === 'edit';
  const isAdmin = level === 'admin';

  return (
    <div className="acc-pill-bars">
      <div className={`acc-pill-bar ${isView ? 'outline' : 'active'}`}></div>
      <div className={`acc-pill-bar ${isView || isViewDown ? '' : 'active'} ${isCreate ? 'outline' : ''}`}></div>
      <div className={`acc-pill-bar ${isEdit || isAdmin ? 'active' : ''}`}></div>
      <div className={`acc-pill-bar ${isAdmin ? 'active' : ''}`}></div>
    </div>
  );
};

export default function AddPermissionModal({ folder, modelUrn, apiBaseUrl, onClose, onSuccess }) {
  const [email, setEmail] = useState('');
  const [level, setLevel] = useState('view_only');
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

  const PERMISSION_LEVELS = [
    { value: 'view_only', label: 'Ver', desc: 'Ver archivos' },
    { value: 'view_download', label: 'Ver', desc: 'Ver y descargar archivos' },
    { value: 'create', label: 'Crear', desc: 'Ver+descargar+publicar marcas de revisión' },
    { value: 'create_upload', label: 'Crear', desc: 'Ver+descargar+publicar marcas de revisión+cargar' },
    { value: 'edit', label: 'Editar', desc: 'Ver+descargar+publicar marcas de revisión+cargar+editar' },
    { value: 'admin', label: 'Administrar', desc: 'Controles administrativos completos' }
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
