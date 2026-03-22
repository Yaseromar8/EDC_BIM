import React, { useEffect, useState, useCallback } from 'react';
import NativeFileTree from './NativeFileTree';
import { Capacitor } from '@capacitor/core';
import './ImportModelModal.css';

const BACKEND_URL = Capacitor.isNativePlatform()
  ? 'https://visor-ecd-backend.onrender.com'
  : (import.meta.env.VITE_BACKEND_URL || '');

const ChevronDownIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
  </svg>
);

const UploadIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" className="upload-svg">
    <path d="M16.08,8.09a.75.75,0,0,1-1.06,0L12.75,5.81v9.51a.75.75,0,0,1-1.5,0V5.81L9,8.09a.75.75,0,0,1-1.06,0A.74.74,0,0,1,7.92,7l3.55-3.56a.78.78,0,0,1,.24-.16.73.73,0,0,1,.58,0,.78.78,0,0,1,.24.16L16.08,7A.75.75,0,0,1,16.08,8.09ZM19.75,16V11a.75.75,0,0,0-1.5,0v5A2.25,2.25,0,0,1,16,18.25H8A2.25,2.25,0,0,1,5.75,16V11a.75.75,0,0,0-1.5,0v5A3.75,3.75,0,0,0,8,19.75h8A3.75,3.75,0,0,0,19.75,16Z" />
  </svg>
);

const ImportModelModal = ({ open, onClose, onLinkDocs, onUploadLocal }) => {
  const [activeTab, setActiveTab] = useState('UPLOAD');

  // Docs State - Real Data
  const [selectedDocs, setSelectedDocs] = useState([]);

  const [accounts, setAccounts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  // UI State for dropdowns
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  // Helper to get display names
  const selectedAccountName = accounts.find(a => a.id === selectedAccountId)?.attributes.name || "Select Account";
  const selectedProjectName = projects.find(p => p.id === selectedProjectId)?.attributes.name || "Select Project";

  // Upload State
  const [localFile, setLocalFile] = useState(null);
  const [uploadLabel, setUploadLabel] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isGemeloActive, setIsGemeloActive] = useState(false);

  // Fetch Hubs on Mount
  useEffect(() => {
    if (open && activeTab === 'DOCS') {
      fetch(`${BACKEND_URL}/api/hubs`)
        .then(r => r.json())
        .then(res => {
          if (res.data) {
            setAccounts(res.data);
            // Select first if none selected
            if (!selectedAccountId && res.data.length > 0) {
              setSelectedAccountId(res.data[0].id);
            }
          }
        })
        .catch(e => console.error("Error fetching hubs:", e));
    }
  }, [open, activeTab]);

  // Fetch Projects when Account (Hub) changes
  useEffect(() => {
    if (selectedAccountId) {
      fetch(`${BACKEND_URL}/api/hubs/${selectedAccountId}/projects`)
        .then(r => r.json())
        .then(res => {
          if (res.data) {
            setProjects(res.data);
            // Select first project by default
            if (res.data.length > 0) {
              setSelectedProjectId(res.data[0].id);
            } else {
              setSelectedProjectId(null);
            }
          }
        })
        .catch(e => console.error("Error fetching projects:", e));
    } else {
      setProjects([]);
      setSelectedProjectId(null);
    }
  }, [selectedAccountId]);


  // Reset logic
  useEffect(() => {
    if (!open) {
      setSelectedDocs([]);
      setLocalFile(null);
      setUploadLabel('');
      setActiveTab('UPLOAD');
      setUploading(false);
      setProgress(0);
      setAccountMenuOpen(false);
      setProjectMenuOpen(false);
      setIsGemeloActive(false);
    }
  }, [open]);

  const handleDocSelection = useCallback((files) => {
    setSelectedDocs(files);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    if (uploading) return;
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setLocalFile(file);
      setUploadLabel(file.name.split('.').slice(0, -1).join('.'));
    }
  }, [uploading]);

  const handleFileChange = (e) => {
    if (uploading) return;
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLocalFile(file);
      setUploadLabel(file.name.split('.').slice(0, -1).join('.'));
    }
  };

  const handleConfirmDocs = () => {
    if (!selectedDocs || selectedDocs.length === 0) return;
    onLinkDocs?.(selectedDocs, isGemeloActive);
    onClose();
  };

  const handleConfirmUpload = async () => {
    if (!localFile) return;
    setUploading(true);
    setProgress(0);

    try {
      await onUploadLocal?.(localFile, uploadLabel || localFile.name, (p) => {
        setProgress(p);
      });
      
      setProgress(100);
      // Wait a bit to show 100% before closing, as model translation starts in backend
      setTimeout(() => {
        onClose();
        setUploading(false);
        setLocalFile(null);
        setProgress(0);
      }, 1500);
    } catch (e) {
      console.error("Modal upload error:", e);
      setUploading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-panel import-modal">
        <div className="modal-header">
          <h3>IMPORT MODEL</h3>
          {!uploading && (
            <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
          )}
        </div>

        <div className="import-tabs">
          <button
            className={`import-tab ${activeTab === 'UPLOAD' ? 'active' : ''}`}
            onClick={() => !uploading && setActiveTab('UPLOAD')}
            disabled={uploading}
          >
            FILE UPLOAD
          </button>
          <button
            className={`import-tab ${activeTab === 'DOCS' ? 'active' : ''}`}
            onClick={() => !uploading && setActiveTab('DOCS')}
            disabled={uploading}
          >
            AUTODESK DOCS
          </button>
        </div>

        <div className="modal-body import-body">
          {activeTab === 'UPLOAD' && (
            <div className="import-upload-pane">
              {uploading ? (
                <div className="upload-progress-container">
                  <div className="upload-spinner"></div>
                  <p>{progress < 100 ? 'Uploading...' : 'Processing & Translating...'}</p>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                  </div>
                  <span className="progress-text">{Math.round(progress)}%</span>
                </div>
              ) : (
                <div className="upload-form">
                  <div className="form-group">
                    <label>Label <span className="required">*</span></label>
                    <input
                      type="text"
                      className="modal-input"
                      value={uploadLabel}
                      onChange={e => setUploadLabel(e.target.value)}
                      placeholder="Title"
                    />
                  </div>
                  <div className="form-group">
                    <label>File <span className="required">*</span></label>
                    <div
                      className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${localFile ? 'has-file' : ''}`}
                      onDragOver={(e) => setIsDragOver(true)}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={handleDrop}
                      onClick={() => document.getElementById('file-upload-input').click()}
                    >
                      <input type="file" id="file-upload-input" hidden accept=".rvt,.ifc,.nwd,.laz,.las,.e57,.rcp,.rcs,.pts" onChange={handleFileChange} />
                      {localFile ? (
                        <div className="file-info"><span className="file-name">{localFile.name}</span></div>
                      ) : (
                        <div className="drop-hint">
                          <div className="upload-icon-circle"><UploadIcon /></div>
                          <p>Drag and drop a file here, or click to select a file<br /><span style={{ fontSize: 12, color: '#6b7280' }}>Modelos BIM: .rvt .ifc .nwd &nbsp;|&nbsp; Nubes de Puntos: .laz .las .e57 .rcp .rcs</span></p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Import elements from phase or view:</label>
                    <div className="phase-input-group">
                      <button className="phase-btn">
                        <span className="phase-value">Phase</span>
                        <ChevronDownIcon />
                      </button>
                      <input type="text" className="phase-text-input" placeholder="New Construction" />
                    </div>
                  </div>

                  <div className="checkbox-container">
                    <label className="tandem-checkbox" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '18px', height: '18px', borderRadius: '3px',
                        border: '1.5px solid #2d8fa5', background: '#2d8fa5', flexShrink: 0
                      }}>
                        <svg viewBox="0 0 24 24" width="14" height="14">
                          <path fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6,11.3 L10.3,16 L18,6.2" />
                        </svg>
                      </span>
                      Visible in default view
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'DOCS' && (
            <div className="import-docs-pane">
              {/* Account / Project Header (Real Data) */}
              <div className="docs-selectors-row">

                {/* ACCOUNT (HUB) SELECTOR */}
                <div className="doc-selector-wrapper">
                  <div
                    className="doc-selector-item"
                    onClick={() => { setAccountMenuOpen(!accountMenuOpen); setProjectMenuOpen(false); }}
                  >
                    <span>{selectedAccountName}</span>
                    <span style={{ transform: accountMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><ChevronDownIcon /></span>
                  </div>
                  {accountMenuOpen && (
                    <div className="doc-dropdown-menu">
                      {accounts.map(acc => (
                        <div
                          key={acc.id}
                          className={`doc-dropdown-item ${selectedAccountId === acc.id ? 'selected' : ''}`}
                          onClick={() => { setSelectedAccountId(acc.id); setAccountMenuOpen(false); }}
                        >
                          {acc.attributes.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* PROJECT SELECTOR */}
                <div className="doc-selector-wrapper">
                  <div
                    className="doc-selector-item"
                    onClick={() => { if (projects.length) setProjectMenuOpen(!projectMenuOpen); setAccountMenuOpen(false); }}
                  >
                    <span>{selectedProjectName}</span>
                    <span style={{ transform: projectMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><ChevronDownIcon /></span>
                  </div>
                  {projectMenuOpen && (
                    <div className="doc-dropdown-menu">
                      {projects.map(proj => (
                        <div
                          key={proj.id}
                          className={`doc-dropdown-item ${selectedProjectId === proj.id ? 'selected' : ''}`}
                          onClick={() => { setSelectedProjectId(proj.id); setProjectMenuOpen(false); }}
                        >
                          {proj.attributes.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* Tree - Controlled Mode */}
              <div className="tree-container-clean">
                <NativeFileTree
                  onSelectionChange={handleDocSelection}
                  forcedHubId={selectedAccountId}
                  forcedProjectId={selectedProjectId}
                />
              </div>

              {/* Vista publicada: siempre es la vista 3D configurada en Revit */}
              {selectedDocs.length > 0 && (
                <div style={{
                  marginTop: 16,
                  padding: '10px 14px',
                  background: 'rgba(46, 204, 113, 0.08)',
                  border: '1px solid rgba(46, 204, 113, 0.25)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <div>
                    <div style={{ color: '#2ecc71', fontWeight: 600, fontSize: '12px' }}>Vista 3D publicada desde Revit</div>
                    <div style={{ color: '#999', fontSize: '11px', marginTop: '2px' }}>Se cargará la vista 3D que configuraste al publicar en ACC</div>
                  </div>
                </div>
              )}

              <div className="checkbox-container">
                <label className="tandem-checkbox" onClick={() => { }} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '18px', height: '18px', borderRadius: '3px',
                    border: '1.5px solid #2d8fa5', background: '#2d8fa5', flexShrink: 0
                  }}>
                    <svg viewBox="0 0 24 24" width="14" height="14">
                      <path fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6,11.3 L10.3,16 L18,6.2" />
                    </svg>
                  </span>
                  Visible in default view
                </label>
              </div>

              {/* MODO GEMELO DIGITAL TOGGLE */}
              <div className="checkbox-container" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <label
                  className="tandem-checkbox"
                  onClick={() => setIsGemeloActive(!isGemeloActive)}
                  style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}
                >
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '18px', height: '18px', borderRadius: '3px',
                    border: '1.5px solid #e67e22',
                    background: isGemeloActive ? '#e67e22' : 'transparent',
                    flexShrink: 0,
                    transition: 'all 0.2s'
                  }}>
                    {isGemeloActive && (
                      <svg viewBox="0 0 24 24" width="14" height="14">
                        <path fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6,11.3 L10.3,16 L18,6.2" />
                      </svg>
                    )}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: isGemeloActive ? '#e67e22' : '#eee', fontWeight: 600, fontSize: '13px' }}>Activar Operación y Mantenimiento (Gemelo)</span>
                    <span style={{ color: '#888', fontSize: '11px' }}>Habilita una base de datos paralela para este modelo (Estilo Tandem)</span>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose} disabled={uploading}>Cancel</button>

          {activeTab === 'UPLOAD' ? (
            <button className="modal-btn-primary" disabled={!localFile || uploading} onClick={handleConfirmUpload}>Import</button>
          ) : (
            <button className="modal-btn-primary" disabled={selectedDocs.length === 0} onClick={handleConfirmDocs}>Import</button>
          )}
        </div>
      </div>
    </div >
  );
};

export default ImportModelModal;
