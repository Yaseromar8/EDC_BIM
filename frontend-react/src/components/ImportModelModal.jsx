import React, { useEffect, useState, useCallback, useRef } from 'react';
import NativeFileTree from './NativeFileTree';
import { apiFetch } from '../utils/apiFetch';
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
  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="upload-svg">
    <path d="M16.08,8.09a.75.75,0,0,1-1.06,0L12.75,5.81v9.51a.75.75,0,0,1-1.5,0V5.81L9,8.09a.75.75,0,0,1-1.06,0A.74.74,0,0,1,7.92,7l3.55-3.56a.78.78,0,0,1,.24-.16.73.73,0,0,1,.58,0,.78.78,0,0,1,.24.16L16.08,7A.75.75,0,0,1,16.08,8.09ZM19.75,16V11a.75.75,0,0,0-1.5,0v5A2.25,2.25,0,0,1,16,18.25H8A2.25,2.25,0,0,1,5.75,16V11a.75.75,0,0,0-1.5,0v5A3.75,3.75,0,0,0,8,19.75h8A3.75,3.75,0,0,0,19.75,16Z" />
  </svg>
);

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ImportModelModal = ({ open, onClose, onLinkDocs, onUploadLocal, selectedProject }) => {
  const [activeTab, setActiveTab] = useState('UPLOAD');

  // Docs State
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  const selectedAccountName = accounts.find(a => a.id === selectedAccountId)?.attributes.name || "Select Account";
  const selectedProjectName = projects.find(p => p.id === selectedProjectId)?.attributes.name || "Select Project";

  // Upload / Extraction State
  const [uploadLabel, setUploadLabel] = useState('');
  const [extracting, setExtracting] = useState(false);     // metadata is being extracted
  const [extractionDone, setExtractionDone] = useState(false); // extraction finished 100%
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [visibleInDefault, setVisibleInDefault] = useState(true);
  const pollRef = useRef(null);
  const pendingDocsRef = useRef(null); // store docs to import after view selection

  // View selector (populated after extraction completes)
  const [modelViews, setModelViews] = useState([]);
  const [selectedViewGuid, setSelectedViewGuid] = useState(null);
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false);
  const [loadingViews, setLoadingViews] = useState(false);

  // Local file upload (FILE UPLOAD tab standalone)
  const [localFile, setLocalFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [localUploading, setLocalUploading] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);

  // Phase/View for local file upload
  const [selectorMode, setSelectorMode] = useState('Phase');
  const [selectorDropdownOpen, setSelectorDropdownOpen] = useState(false);
  const [phaseValue, setPhaseValue] = useState('New Construction');

  // Fetch Hubs
  useEffect(() => {
    if (open && activeTab === 'DOCS') {
      fetch(`${BACKEND_URL}/api/hubs`)
        .then(r => r.json())
        .then(res => {
          if (res.data) {
            setAccounts(res.data);
            if (!selectedAccountId && res.data.length > 0) setSelectedAccountId(res.data[0].id);
          }
        })
        .catch(e => console.error("Error fetching hubs:", e));
    }
  }, [open, activeTab]);

  // Fetch Projects
  useEffect(() => {
    if (selectedAccountId) {
      fetch(`${BACKEND_URL}/api/hubs/${selectedAccountId}/projects`)
        .then(r => r.json())
        .then(res => {
          if (res.data) {
            setProjects(res.data);
            if (res.data.length > 0) setSelectedProjectId(res.data[0].id);
            else setSelectedProjectId(null);
          }
        })
        .catch(e => console.error("Error fetching projects:", e));
    } else { setProjects([]); setSelectedProjectId(null); }
  }, [selectedAccountId]);

  // Reset
  useEffect(() => {
    if (!open) {
      setSelectedDocs([]); setUploadLabel('');
      setActiveTab('UPLOAD'); setExtracting(false); setExtractionDone(false);
      setProgress(0); setProgressMsg('');
      setAccountMenuOpen(false); setProjectMenuOpen(false);
      setSelectorDropdownOpen(false); setViewDropdownOpen(false);
      setModelViews([]); setSelectedViewGuid(null); setLoadingViews(false);
      setLocalFile(null); setLocalUploading(false); setLocalProgress(0);
      pendingDocsRef.current = null;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
  }, [open]);

  // Doc selection in tree
  const handleDocSelection = useCallback((files) => setSelectedDocs(files), []);

  // Local file handlers
  const handleDrop = useCallback((e) => {
    e.preventDefault(); setIsDragOver(false);
    if (extracting || localUploading) return;
    if (e.dataTransfer.files?.[0]) {
      const file = e.dataTransfer.files[0];
      setLocalFile(file); setUploadLabel(file.name.split('.').slice(0, -1).join('.'));
    }
  }, [extracting, localUploading]);

  const handleFileChange = (e) => {
    if (extracting || localUploading) return;
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setLocalFile(file); setUploadLabel(file.name.split('.').slice(0, -1).join('.'));
    }
  };

  const cancelProcess = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setExtracting(false); setExtractionDone(false); setProgress(0); setProgressMsg('');
    setModelViews([]); setSelectedViewGuid(null); pendingDocsRef.current = null;
  };

  // Fetch viewables after extraction completes
  const fetchViewables = async (urn) => {
    setLoadingViews(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/api/inventory/viewables/${encodeURIComponent(urn)}`);
      const data = await res.json();
      if (data.views?.length > 0) {
        setModelViews(data.views);
        const def3D = data.views.find(v => v.is3D);
        setSelectedViewGuid(def3D ? def3D.guid : data.views[0].guid);
      }
    } catch (e) {
      console.error('Error fetching viewables:', e);
    } finally {
      setLoadingViews(false);
    }
  };

  // ── AUTODESK DOCS: Start extraction, switch to FILE UPLOAD ──
  const handleStartExtraction = async () => {
    if (!selectedDocs || selectedDocs.length === 0) return;

    const doc = selectedDocs[0];
    const docName = doc.name || doc.label || 'Modelo';
    pendingDocsRef.current = selectedDocs;

    // Switch to FILE UPLOAD tab
    setActiveTab('UPLOAD');
    setUploadLabel(docName);
    setExtracting(true); setExtractionDone(false);
    setProgress(0); setProgressMsg('Conectando con Autodesk...');

    let urn = doc.id || doc.urn;
    const rawUrn = urn; // keep original for viewables
    if (urn && urn.includes('urn:adsk')) {
      try { urn = btoa(urn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch (e) { }
    }

    try {
      const res = await apiFetch(`${BACKEND_URL}/api/inventory/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urn, target_urn: selectedProject ? selectedProject.id : urn })
      });
      if (!res.ok) throw new Error("Error initiating extraction");
      const { job_id } = await res.json();

      pollRef.current = setInterval(async () => {
        try {
          const stRes = await apiFetch(`${BACKEND_URL}/api/inventory/extract/status/${job_id}`);
          if (stRes.ok) {
            const stData = await stRes.json();
            setProgress(stData.progress || 0);
            setProgressMsg(stData.message || '');

            if (stData.status === 'success') {
              clearInterval(pollRef.current); pollRef.current = null;
              setProgress(100);
              setExtracting(false);
              setExtractionDone(true);
              setProgressMsg('Metadata extraida. Selecciona la vista para importar.');
              // Now fetch viewables to populate the view selector
              fetchViewables(urn);
            } else if (stData.status === 'error') {
              clearInterval(pollRef.current); pollRef.current = null;
              setExtracting(false);
              setProgressMsg('Error: ' + stData.message);
            }
          }
        } catch (pollErr) {
          console.error('Polling error:', pollErr);
        }
      }, 3000);
    } catch (e) {
      setExtracting(false); setProgress(0);
      console.error(e);
      alert("Error de conexion: " + e.message);
    }
  };

  // ── FINAL IMPORT: User selected view, now load model in viewer ──
  const handleFinalImport = () => {
    const docs = pendingDocsRef.current;
    if (docs && docs.length > 0) {
      onLinkDocs?.(docs, true, selectedViewGuid);
    }
    onClose();
  };

  // ── LOCAL FILE UPLOAD ──
  const handleLocalUpload = async () => {
    if (!localFile) return;
    setLocalUploading(true); setLocalProgress(0);
    try {
      await onUploadLocal?.(localFile, uploadLabel || localFile.name, (p) => setLocalProgress(p));
      setLocalProgress(100);
      setTimeout(() => { onClose(); }, 1500);
    } catch (e) {
      console.error("Upload error:", e);
      setLocalUploading(false);
    }
  };

  if (!open) return null;

  // Determine what state the FILE UPLOAD tab is in
  const isProcessing = extracting || localUploading;
  const showExtractionInDropzone = extracting || extractionDone;
  const canImport = extractionDone && selectedViewGuid && !loadingViews;

  return (
    <div className="import-overlay" onClick={(e) => { if (e.target === e.currentTarget && !isProcessing) onClose(); }}>
      <div className="import-modal-panel">

        {/* HEADER */}
        <div className="import-header">
          <h3>IMPORT MODEL</h3>
          {!isProcessing && <button className="import-close-btn" onClick={onClose}><CloseIcon /></button>}
        </div>

        {/* TABS */}
        <div className="import-tab-bar">
          <button className={`import-tab-btn ${activeTab === 'UPLOAD' ? 'active' : ''}`}
            onClick={() => !isProcessing && setActiveTab('UPLOAD')} disabled={isProcessing}>FILE UPLOAD</button>
          <button className={`import-tab-btn ${activeTab === 'DOCS' ? 'active' : ''}`}
            onClick={() => !isProcessing && !extractionDone && setActiveTab('DOCS')}
            disabled={isProcessing || extractionDone}>AUTODESK DOCS</button>
        </div>

        <div className="import-body-content">

          {/* ═══ FILE UPLOAD TAB ═══ */}
          {activeTab === 'UPLOAD' && (
            <div className="import-upload-section">
              {/* Label */}
              <div className="import-field">
                <label className="import-label">Label <span className="import-req">*</span></label>
                <input type="text" className="import-input" value={uploadLabel}
                  onChange={e => setUploadLabel(e.target.value)} placeholder="Title"
                  disabled={isProcessing || extractionDone} />
              </div>

              {/* File / Extraction Zone */}
              <div className="import-field">
                <label className="import-label">File <span className="import-req">*</span></label>

                {showExtractionInDropzone ? (
                  /* ── Extraction progress INSIDE the dropzone area ── */
                  <div className="import-dropzone has-file" style={{ flexDirection: 'column', alignItems: 'stretch', padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, color: '#ccc', fontWeight: 500 }}>
                        {uploadLabel.length > 45 ? uploadLabel.substring(0, 42) + '...' : uploadLabel}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: progress >= 100 ? '#2ecc71' : '#3b9eff', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {Math.round(progress)}%
                        </span>
                        {extracting && (
                          <button className="import-file-inline-x" onClick={cancelProcess}><CloseIcon /></button>
                        )}
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="import-progress-track">
                      <div className="import-progress-fill" style={{
                        width: `${progress}%`,
                        background: progress >= 100 ? '#2ecc71' : undefined
                      }} />
                    </div>
                    <span style={{ fontSize: 11, color: '#888', marginTop: 6 }}>{progressMsg}</span>
                  </div>
                ) : (
                  /* ── Normal dropzone for local file ── */
                  <>
                    <div className={`import-dropzone ${isDragOver ? 'hover' : ''} ${localFile ? 'has-file' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={handleDrop}
                      onClick={() => !localFile && !localUploading && document.getElementById('import-file-input').click()}>
                      <input type="file" id="import-file-input" hidden
                        accept=".rvt,.ifc,.nwd,.nwc,.dwg,.laz,.las,.e57,.rcp,.rcs,.pts" onChange={handleFileChange} />
                      {localFile ? (
                        <div className="import-file-selected">
                          <span style={{ flex: 1, fontSize: 13, color: '#ccc' }}>{localFile.name}</span>
                          {localUploading ? (
                            <span style={{ fontSize: 13, color: '#3b9eff', fontWeight: 600 }}>{Math.round(localProgress)}%</span>
                          ) : (
                            <button className="import-file-inline-x" onClick={(e) => { e.stopPropagation(); setLocalFile(null); setUploadLabel(''); }}>
                              <CloseIcon />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="import-drop-hint">
                          <UploadIcon />
                          <p>Drag and drop a file here, or click to select a file</p>
                          <span className="import-drop-formats">
                            (only files with extension <span className="import-ext-highlight">".dwg, .ifc, .nwc, .nwd, .rvt"</span> are accepted)
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Phase / View selector */}
              <div className="import-field">
                <label className="import-label">Import elements from phase or view:</label>

                {extractionDone && modelViews.length > 0 ? (
                  /* Real views from Revit/ACC after extraction */
                  <div style={{ position: 'relative' }}>
                    <button className="import-view-selector" onClick={() => setViewDropdownOpen(!viewDropdownOpen)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{modelViews.find(v => v.guid === selectedViewGuid)?.name || 'Seleccionar vista'}</span>
                        <span style={{ fontSize: 10, color: '#666' }}>
                          ({modelViews.find(v => v.guid === selectedViewGuid)?.is3D ? '3D' : '2D'})
                        </span>
                      </div>
                      <ChevronDownIcon />
                    </button>
                    {viewDropdownOpen && (
                      <div className="import-selector-menu" style={{ left: 0, right: 0, maxHeight: 200, overflowY: 'auto' }}>
                        {modelViews.map(v => (
                          <div key={v.guid}
                            className={`import-selector-option ${selectedViewGuid === v.guid ? 'active' : ''}`}
                            onClick={() => { setSelectedViewGuid(v.guid); setViewDropdownOpen(false); }}>
                            {v.name}
                            <span style={{ fontSize: 10, color: '#888', marginLeft: 'auto', paddingLeft: 12 }}>{v.role}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : extractionDone && loadingViews ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                    <div className="import-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    <span style={{ fontSize: 12, color: '#888' }}>Cargando vistas disponibles...</span>
                  </div>
                ) : (
                  /* Default Phase/View text input (disabled during extraction) */
                  <div className="import-phase-row">
                    <div className="import-phase-selector" style={{ position: 'relative' }}>
                      <button className="import-phase-btn" disabled={extracting}
                        onClick={() => !extracting && setSelectorDropdownOpen(!selectorDropdownOpen)}>
                        <span>{selectorMode}</span> <ChevronDownIcon />
                      </button>
                      {selectorDropdownOpen && (
                        <div className="import-phase-dropdown">
                          <div className={`import-phase-option ${selectorMode === 'Phase' ? 'active' : ''}`}
                            onClick={() => { setSelectorMode('Phase'); setSelectorDropdownOpen(false); }}>Phase</div>
                          <div className={`import-phase-option ${selectorMode === 'View' ? 'active' : ''}`}
                            onClick={() => { setSelectorMode('View'); setSelectorDropdownOpen(false); }}>View</div>
                        </div>
                      )}
                    </div>
                    <input type="text" className="import-phase-input" value={phaseValue}
                      onChange={e => setPhaseValue(e.target.value)} disabled={extracting}
                      placeholder={selectorMode === 'Phase' ? 'New Construction' : '{3D}'} />
                  </div>
                )}
              </div>

              {/* Visible in default view */}
              <div className="import-checkbox-row">
                <label className="import-check-label" onClick={() => setVisibleInDefault(!visibleInDefault)}>
                  <span className={`import-check-box ${visibleInDefault ? 'checked' : ''}`}>
                    {visibleInDefault && (
                      <svg viewBox="0 0 24 24" width="12" height="12">
                        <path fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="M6,12 L10,16 L18,7" />
                      </svg>
                    )}
                  </span>
                  Visible in default view
                </label>
              </div>
            </div>
          )}

          {/* ═══ AUTODESK DOCS TAB ═══ */}
          {activeTab === 'DOCS' && (
            <div className="import-docs-section">
              {/* Selectors */}
              <div className="import-selectors-row">
                <div className="import-selector-wrap">
                  <div className="import-selector-trigger"
                    onClick={() => { setAccountMenuOpen(!accountMenuOpen); setProjectMenuOpen(false); }}>
                    <span>{selectedAccountName}</span>
                    <span style={{ transform: accountMenuOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }}><ChevronDownIcon /></span>
                  </div>
                  {accountMenuOpen && (
                    <div className="import-selector-menu">
                      {accounts.map(acc => (
                        <div key={acc.id} className={`import-selector-option ${selectedAccountId === acc.id ? 'active' : ''}`}
                          onClick={() => { setSelectedAccountId(acc.id); setAccountMenuOpen(false); }}>{acc.attributes.name}</div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="import-selector-wrap">
                  <div className="import-selector-trigger"
                    onClick={() => { if (projects.length) setProjectMenuOpen(!projectMenuOpen); setAccountMenuOpen(false); }}>
                    <span>{selectedProjectName}</span>
                    <span style={{ transform: projectMenuOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }}><ChevronDownIcon /></span>
                  </div>
                  {projectMenuOpen && (
                    <div className="import-selector-menu">
                      {projects.map(proj => (
                        <div key={proj.id} className={`import-selector-option ${selectedProjectId === proj.id ? 'active' : ''}`}
                          onClick={() => { setSelectedProjectId(proj.id); setProjectMenuOpen(false); }}>{proj.attributes.name}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* File Tree */}
              <div className="import-tree-container">
                <NativeFileTree onSelectionChange={handleDocSelection}
                  forcedHubId={selectedAccountId} forcedProjectId={selectedProjectId} />
              </div>

              {/* Visible */}
              <div className="import-checkbox-row">
                <label className="import-check-label" onClick={() => setVisibleInDefault(!visibleInDefault)}>
                  <span className={`import-check-box ${visibleInDefault ? 'checked' : ''}`}>
                    {visibleInDefault && (
                      <svg viewBox="0 0 24 24" width="12" height="12">
                        <path fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="M6,12 L10,16 L18,7" />
                      </svg>
                    )}
                  </span>
                  Visible in default view
                </label>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="import-footer">
          <button className="import-btn-cancel" onClick={isProcessing ? cancelProcess : onClose}>Cancel</button>

          {activeTab === 'DOCS' ? (
            /* AUTODESK DOCS: Start extraction */
            <button className="import-btn-primary"
              disabled={selectedDocs.length === 0}
              onClick={handleStartExtraction}>
              Import
            </button>
          ) : extractionDone ? (
            /* FILE UPLOAD after extraction: final import with selected view */
            <button className="import-btn-primary"
              disabled={!canImport}
              onClick={handleFinalImport}>
              Import
            </button>
          ) : (
            /* FILE UPLOAD standalone: local file upload */
            <button className="import-btn-primary"
              disabled={!localFile || localUploading}
              onClick={handleLocalUpload}>
              Import
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportModelModal;
