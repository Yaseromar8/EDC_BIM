import React, { useEffect, useState } from 'react';
import NativeFileTree from './NativeFileTree';

const ACCEPTED_TYPES = '.apng,.avif,.csv,.doc,.docx,.gif,.jpeg,.jpg,.odp,.ods,.odt,.pdf,.png,.ppt,.pptx,.svg,.txt,.webp,.xls,.xlsx';

const AddDocumentModal = ({ open, onClose, onConfirm, targetSpriteId, selectedProject }) => {
  const [tab, setTab] = useState('upload');
  const [files, setFiles] = useState([]);
  const [selectedAccDoc, setSelectedAccDoc] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const hubId = selectedProject?.hub_id;
  const projectId = selectedProject?.id?.split('_')[0]; // Extract base project ID if composite

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setSelectedAccDoc(null);
      setTab('upload');
      setError('');
    }
  }, [open]);

  const handleFileChange = event => {
    const picked = Array.from(event.target.files || []);
    setFiles(picked);
  };

  const uploadFiles = async () => {
    const uploads = [];
    for (const file of files) {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: form
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Upload failed.' }));
        throw new Error(payload.error || 'Upload failed.');
      }
      const payload = await response.json();
      uploads.push({
        id: `upload-${payload.filename}-${Date.now()}`,
        name: payload.filename,
        source: 'upload',
        url: payload.url,
        type: payload.content_type || file.type || 'application/octet-stream'
      });
    }
    return uploads;
  };

  const handleConfirm = async () => {
    setError('');
    if (tab === 'upload' && files.length) {
      try {
        setUploading(true);
        const docs = await uploadFiles();
        onConfirm?.(docs.map(doc => ({ ...doc, spriteId: targetSpriteId })));
      } catch (err) {
        setError(err.message || 'Error uploading documents.');
      } finally {
        setUploading(false);
      }
      return;
    }
    if (tab === 'docs' && selectedAccDoc) {
      try {
        setUploading(true);
        const response = await fetch('/api/documents/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: selectedAccDoc.projectId,
            versionId: selectedAccDoc.versionId,
            name: selectedAccDoc.name,
            href: selectedAccDoc.webView || selectedAccDoc.href || null
          })
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'No se pudo vincular el documento.');
        }
        const doc = {
          id: `acc-${selectedAccDoc.versionId}`,
          name: payload.filename || selectedAccDoc.name,
          source: 'acc',
          url: payload.url,
          type: payload.content_type || 'application/octet-stream',
          href: payload.href || selectedAccDoc.webView || selectedAccDoc.href || null,
          message: payload.message || null
        };
        onConfirm?.([{ ...doc, spriteId: targetSpriteId }]);
      } catch (err) {
        setError(err.message || 'Error vinculating document.');
      } finally {
        setUploading(false);
      }
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-panel large">
        <div className="modal-header">
          <h3>Add Documents</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-tabs">
          <button className={tab === 'upload' ? 'active' : ''} onClick={() => setTab('upload')}>File Upload</button>
          <button className={tab === 'docs' ? 'active' : ''} onClick={() => setTab('docs')}>Autodesk Docs</button>
        </div>
        {tab === 'upload' && (
          <div className="modal-body upload">
            <label className="file-drop">
              <input type="file" multiple accept={ACCEPTED_TYPES} onChange={handleFileChange} />
              <span>Drag and drop files here, or click to select</span>
              <small>Accepted: {ACCEPTED_TYPES.replace(/\./g, '').replace(/,/g, ', ')}</small>
            </label>
            <ul className="file-preview-list">
              {files.map(file => (
                <li key={`${file.name}-${file.size}`}>{file.name}</li>
              ))}
            </ul>
            {error && <p className="error-text">{error}</p>}
          </div>
        )}
        {tab === 'docs' && (
          <div className="modal-body">
            <p>Select a document from Autodesk Docs to link it.</p>
            <div className="modal-tree" style={{ maxHeight: '400px', overflowY: 'auto', background: '#25272a', borderRadius: '8px', padding: '12px', border: '1px solid #444' }}>
              <NativeFileTree
                onFileSelect={setSelectedAccDoc}
                forcedHubId={hubId}
                forcedProjectId={projectId}
              />
            </div>
          </div>
        )}
        <div className="modal-footer">
          <button className="modal-secondary" onClick={onClose}>Cancel</button>
          <button
            className="modal-primary"
            disabled={uploading || (tab === 'upload' && !files.length) || (tab === 'docs' && !selectedAccDoc)}
            onClick={handleConfirm}
          >
            {uploading ? 'Uploading…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddDocumentModal;
