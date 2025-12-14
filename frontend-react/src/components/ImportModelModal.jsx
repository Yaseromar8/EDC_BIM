import React, { useEffect, useState, useCallback } from 'react';
import NativeFileTree from './NativeFileTree';
import './ImportModelModal.css';

const ImportModelModal = ({ open, onClose, onLinkDocs, onUploadLocal }) => {
  const [activeTab, setActiveTab] = useState('UPLOAD'); // 'UPLOAD' | 'DOCS'

  // Docs State
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docLabel, setDocLabel] = useState('');

  // Upload State
  const [localFile, setLocalFile] = useState(null);
  const [uploadLabel, setUploadLabel] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!open) {
      // Reset state
      setSelectedDoc(null);
      setDocLabel('');
      setLocalFile(null);
      setUploadLabel('');
      setActiveTab('UPLOAD');
      setUploading(false);
      setProgress(0);
    }
  }, [open]);

  const handleDocSelect = (model) => {
    setSelectedDoc(model);
    setDocLabel(model?.name || '');
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
    if (!selectedDoc) return;
    onLinkDocs?.({ ...selectedDoc, name: docLabel || selectedDoc.name });
    onClose();
  };

  const handleConfirmUpload = async () => {
    if (!localFile) return;
    setUploading(true);
    setProgress(0);

    // Simulation of progress
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return 90;
        return prev + Math.random() * 5; // Slower progress
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
      // Parent likely alerted, but we can reset
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-panel import-modal">
        <div className="modal-header">
          <h3>IMPORT MODEL</h3>
          {!uploading && (
            <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
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
                  <div className="upload-spinner">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3aa0ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  </div>
                  <p style={{ marginTop: '16px', color: '#fff', fontSize: '14px', textAlign: 'center' }}>Uploading and Processing...</p>
                  <div className="progress-bar-track" style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' }}>
                    <div className="progress-bar-fill" style={{ width: `${progress}%`, height: '100%', background: '#3aa0ff', borderRadius: '3px', transition: 'width 0.3s' }}></div>
                  </div>
                  <span className="progress-text" style={{ display: 'block', textAlign: 'right', marginTop: '8px', fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace' }}>{Math.round(progress)}%</span>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label>Label <span className="required">*</span></label>
                    <input
                      type="text"
                      className="modal-input"
                      value={uploadLabel}
                      onChange={e => setUploadLabel(e.target.value)}
                      placeholder="Model Name"
                    />
                  </div>
                  <div className="form-group">
                    <label>File <span className="required">*</span></label>
                    <div
                      className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${localFile ? 'has-file' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={handleDrop}
                      onClick={() => document.getElementById('file-upload-input').click()}
                    >
                      <input
                        type="file"
                        id="file-upload-input"
                        hidden
                        accept=".rvt,.ifc,.nwd,.dwg,.fbx"
                        onChange={handleFileChange}
                      />
                      {localFile ? (
                        <div className="file-info">
                          <span className="file-icon">📄</span>
                          <span className="file-name">{localFile.name}</span>
                          <span className="file-size">{(localFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                        </div>
                      ) : (
                        <div className="drop-hint">
                          <span className="upload-icon">⬆️</span>
                          <p>Drag and drop a file here, or click to select</p>
                          <small>(.rvt, .ifc, .nwd, .dwg, .fbx)</small>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'DOCS' && (
            <div className="import-docs-pane">
              <div className="form-group">
                <label>Label <span className="required">*</span></label>
                <input
                  type="text"
                  className="modal-input"
                  value={docLabel}
                  onChange={e => setDocLabel(e.target.value)}
                  placeholder="Linked Model Name"
                />
              </div>
              <div className="tree-container">
                <NativeFileTree onFileSelect={handleDocSelect} />
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="modal-secondary" onClick={onClose} disabled={uploading}>Cancel</button>

          {activeTab === 'UPLOAD' ? (
            <button
              className="modal-primary"
              disabled={!localFile || uploading}
              onClick={handleConfirmUpload}
            >
              {uploading ? 'Importing...' : 'Import'}
            </button>
          ) : (
            <button
              className="modal-primary"
              disabled={!selectedDoc}
              onClick={handleConfirmDocs}
            >
              Link
            </button>
          )}
        </div>
      </div>
      <style>{`
        .upload-spinner svg {
          animation: spin 1s linear infinite;
          display: block;
          margin: 0 auto;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .upload-progress-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          min-height: 200px;
          background: rgba(0,0,0,0.1);
          border-radius: 8px;
          padding: 20px;
        }
      `}</style>
    </div>
  );
};

export default ImportModelModal;
