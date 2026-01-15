import React, { useEffect, useState, useCallback } from 'react';
import NativeFileTree from './NativeFileTree';
import './ImportModelModal.css';

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
  const [selectedPhase, setSelectedPhase] = useState("Default View");

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

  // Fetch Hubs on Mount
  useEffect(() => {
    if (open && activeTab === 'DOCS') {
      fetch('/api/hubs')
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
      fetch(`/api/hubs/${selectedAccountId}/projects`)
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
      setSelectedPhase("Default View");
      setAccountMenuOpen(false);
      setProjectMenuOpen(false);
    }
  }, [open]);

  const handleDocSelection = (files) => {
    setSelectedDocs(files);
  };

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
    onLinkDocs?.(selectedDocs);
    onClose();
  };

  const handleConfirmUpload = async () => {
    if (!localFile) return;
    setUploading(true);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return 90;
        return prev + Math.random() * 5;
      });
    }, 400);

    try {
      await onUploadLocal?.(localFile, uploadLabel || localFile.name);
      clearInterval(interval);
      setProgress(100);
      setTimeout(() => {
        onClose();
        setUploading(false);
        setLocalFile(null);
        setProgress(0);
      }, 800);
    } catch (e) {
      clearInterval(interval);
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
                  <p>Uploading...</p>
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
                      <input type="file" id="file-upload-input" hidden accept=".rvt,.ifc,.nwd" onChange={handleFileChange} />
                      {localFile ? (
                        <div className="file-info"><span className="file-name">{localFile.name}</span></div>
                      ) : (
                        <div className="drop-hint">
                          <div className="upload-icon-circle"><UploadIcon /></div>
                          <p>Drag and drop a file here, or click to select a file<br /><span style={{ fontSize: 12, color: '#6b7280' }}>(only files with extension ".ifc, .rvt" are accepted)</span></p>
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
                    <label className="tandem-checkbox">
                      <input type="checkbox" defaultChecked />
                      <span className="checkmark"></span>
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

              <div className="form-group" style={{ marginTop: 16 }}>
                <label>Import elements from phase or view: <span className="required">*</span></label>
                <div className="select-wrapper">
                  <select
                    className="modal-select full-width"
                    value={selectedPhase}
                    onChange={(e) => setSelectedPhase(e.target.value)}
                    disabled={selectedDocs.length === 0}
                  >
                    <option value="Default View">Default View</option>
                    <option value="New Construction">Phase: New Construction</option>
                    <option value="Existing">Phase: Existing</option>
                    <option value="3D View">3D View</option>
                  </select>
                  <span className="select-arrow"><ChevronDownIcon /></span>
                </div>
              </div>

              <div className="checkbox-container">
                <label className="tandem-checkbox">
                  <input type="checkbox" defaultChecked />
                  <span className="checkmark"></span>
                  Visible in default view
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
    </div>
  );
};

export default ImportModelModal;
