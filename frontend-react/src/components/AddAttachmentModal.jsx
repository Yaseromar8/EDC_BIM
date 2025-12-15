import React, { useState } from 'react';
import NativeFileTree from './NativeFileTree';
import './ImportModelModal.css'; // Reuse styles for consistency

const AddAttachmentModal = ({ open, onClose, onAttach }) => {
    const [activeTab, setActiveTab] = useState('ACC'); // 'ACC' | 'LOCAL'
    const [localFile, setLocalFile] = useState(null);
    const [selectedAccNode, setSelectedAccNode] = useState(null);
    const [uploading, setUploading] = useState(false);

    if (!open) return null;

    const handleAccSelect = (node) => {
        setSelectedAccNode(node);
    };

    const handleLocalFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setLocalFile(e.target.files[0]);
        }
    };

    const handleSubmit = async () => {
        setUploading(true);
        try {
            if (activeTab === 'ACC' && selectedAccNode) {
                await onAttach({
                    type: 'acc',
                    file: selectedAccNode
                });
            } else if (activeTab === 'LOCAL' && localFile) {
                await onAttach({
                    type: 'local',
                    file: localFile
                });
            }
            onClose();
        } catch (e) {
            console.error(e);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-panel import-modal" style={{ maxWidth: '600px' }}>
                <div className="modal-header">
                    <h3>ADJUNTAR ARCHIVO</h3>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <div className="import-tabs">
                    <button
                        className={`import-tab ${activeTab === 'ACC' ? 'active' : ''}`}
                        onClick={() => setActiveTab('ACC')}
                    >
                        AUTODESK DOCS
                    </button>
                    <button
                        className={`import-tab ${activeTab === 'LOCAL' ? 'active' : ''}`}
                        onClick={() => setActiveTab('LOCAL')}
                    >
                        LOCAL UPLOAD
                    </button>
                </div>

                <div className="modal-body import-body" style={{ minHeight: '300px' }}>
                    {activeTab === 'ACC' && (
                        <div className="import-docs-pane">
                            <p style={{ marginBottom: '10px', color: '#ccc', fontSize: '0.9rem' }}>
                                Selecciona un archivo de tus proyectos Autodesk Docs:
                            </p>
                            <div className="tree-container" style={{ border: '1px solid #444', borderRadius: '4px', height: '250px', overflowY: 'auto' }}>
                                <NativeFileTree onFileSelect={handleAccSelect} />
                            </div>
                            {selectedAccNode && (
                                <div style={{ marginTop: '10px', fontSize: '0.9rem', color: '#3aa0ff' }}>
                                    Seleccionado: <strong>{selectedAccNode.name}</strong>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'LOCAL' && (
                        <div className="import-upload-pane">
                            <div className="form-group">
                                <label>Archivo Local</label>
                                <div className="drop-zone" style={{ padding: '40px', textAlign: 'center' }} onClick={() => document.getElementById('attachment-input').click()}>
                                    <input
                                        type="file"
                                        id="attachment-input"
                                        hidden
                                        onChange={handleLocalFileChange}
                                        accept=".pdf,.png,.jpg,.jpeg,.dwg,application/pdf,image/*"
                                    />
                                    {localFile ? (
                                        <div>
                                            <div style={{ fontSize: '24px' }}>📄</div>
                                            <div>{localFile.name}</div>
                                        </div>
                                    ) : (
                                        <div>
                                            <div style={{ fontSize: '24px' }}>⬆️</div>
                                            <p>Clic para seleccionar archivo</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="modal-secondary" onClick={onClose}>Cancelar</button>
                    <button
                        className="modal-primary"
                        disabled={uploading || (activeTab === 'ACC' ? !selectedAccNode : !localFile)}
                        onClick={handleSubmit}
                    >
                        {uploading ? 'Adjuntando...' : 'Adjuntar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddAttachmentModal;
