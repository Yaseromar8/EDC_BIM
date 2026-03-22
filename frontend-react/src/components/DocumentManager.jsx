import React, { useState, useEffect, useCallback, useRef } from 'react';
import './DocumentManager.css';
import { Document, Page, pdfjs } from 'react-pdf';
import { uploadFile } from '../services/uploadService';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const BACKEND_URL = '';

// Helper: format file size
function formatSize(bytes) {
    if (!bytes || bytes === 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Helper: format date
function formatDate(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Helper: get file icon by extension
function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const icons = {
        pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗',
        jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️',
        ppt: '📙', pptx: '📙', csv: '📊', txt: '📄', svg: '🎨',
        dwg: '📐', rvt: '🏗️', ifc: '🏗️', nwd: '🏗️', nwc: '🏗️',
    };
    return icons[ext] || '📄';
}

export default function DocumentManager({ isOpen, onClose }) {
    const [currentPath, setCurrentPath] = useState('');
    const [folders, setFolders] = useState([]);
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [dragOver, setDragOver] = useState(false);

    // Sidebar: track opened tree paths for expand/collapse
    const [sidebarFolders, setSidebarFolders] = useState([]);
    const [expandedPaths, setExpandedPaths] = useState(new Set(['']));

    const fileInputRef = useRef(null);

    // Fetch contents for a given path
    const fetchContents = useCallback(async (path) => {
        setLoading(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/docs/list?path=${encodeURIComponent(path)}`);
            const data = await res.json();
            if (res.ok) {
                setFolders(data.folders || []);
                setFiles(data.files || []);
            } else {
                console.error('Error fetching docs:', data.error);
            }
        } catch (err) {
            console.error('Network error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch sidebar tree root
    const fetchSidebarRoot = useCallback(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/docs/list?path=`);
            const data = await res.json();
            if (res.ok) {
                setSidebarFolders(data.folders || []);
            }
        } catch (err) {
            console.error('Sidebar fetch error:', err);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchContents(currentPath);
            fetchSidebarRoot();
        }
    }, [isOpen, currentPath, fetchContents, fetchSidebarRoot]);

    const navigateToFolder = (folderPath) => {
        setCurrentPath(folderPath);
        setSelectedItems(new Set());
        setExpandedPaths(prev => new Set([...prev, folderPath]));
    };

    // Breadcrumb parts
    const breadcrumbs = currentPath
        ? currentPath.replace(/\/$/, '').split('/')
        : [];

    // Handle file upload
    const handleUpload = async (fileList) => {
        if (!fileList || fileList.length === 0) return;
        setUploading(true);
        setUploadProgress(0);

        const totalFiles = fileList.length;
        let filesProcessed = 0;

        for (const file of fileList) {
            try {
                // 1. Get Signed URL
                const urlResp = await fetch(`${BACKEND_URL}/api/docs/upload-url`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: file.name,
                        contentType: file.type || 'application/octet-stream',
                        model_urn: 'global' // Or actual model URN
                    })
                });
                const urlData = await urlResp.json();
                if (!urlData.success) throw new Error(urlData.error);

                // 2. Direct Upload to GCS
                await uploadFile(file, urlData.uploadUrl, {
                    isDirect: true,
                    onProgress: (p) => {
                        const overall = Math.round(((filesProcessed / totalFiles) * 100) + (p / totalFiles));
                        setUploadProgress(overall);
                    }
                });

                // 3. Finalize upload in DB
                await fetch(`${BACKEND_URL}/api/docs/upload-complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: file.name,
                        gcsUrn: urlData.gcsUrn,
                        sizeBytes: file.size,
                        contentType: file.type || 'application/octet-stream',
                        path: currentPath,
                        model_urn: 'global'
                    })
                });

                filesProcessed++;
                setUploadProgress(Math.round((filesProcessed / totalFiles) * 100));
            } catch (err) {
                console.error('Upload error:', err);
                alert(`Error subiendo ${file.name}: ${err.message}`);
            }
        }

        setTimeout(() => {
            setUploading(false);
            setUploadProgress(0);
            fetchContents(currentPath);
        }, 500);
    };

    // Create new folder
    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        const fullPath = currentPath + newFolderName.trim();

        try {
            await fetch(`${BACKEND_URL}/api/docs/folder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: fullPath })
            });
            setShowNewFolder(false);
            setNewFolderName('');
            fetchContents(currentPath);
            fetchSidebarRoot();
        } catch (err) {
            console.error('Create folder error:', err);
        }
    };

    // Delete selected item
    const handleDelete = async () => {
        if (selectedItems.size === 0) return;
        if (!window.confirm(`¿Eliminar ${selectedItems.size} elemento(s)?`)) return;

        for (const fullName of selectedItems) {
            try {
                await fetch(`${BACKEND_URL}/api/docs/delete`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fullName })
                });
            } catch (err) {
                console.error('Delete error:', err);
            }
        }
        setSelectedItems(new Set());
        fetchContents(currentPath);
        fetchSidebarRoot();
    };

    // Toggle item selection
    const toggleSelect = (fullName) => {
        setSelectedItems(prev => {
            const next = new Set(prev);
            if (next.has(fullName)) next.delete(fullName);
            else next.add(fullName);
            return next;
        });
    };

    // Drag & Drop handlers
    const handleDragOver = (e) => {
        e.preventDefault();
        setDragOver(true);
    };

    const handleDragLeave = () => setDragOver(false);

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        handleUpload(e.dataTransfer.files);
    };

    if (!isOpen) return null;

    return (
        <div className="doc-manager-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="doc-manager-container">
                {/* TOP BAR */}
                <div className="dm-topbar">
                    <div className="dm-topbar-left">
                        <span className="dm-icon">📁</span>
                        <h2>Gestor de Archivos</h2>
                    </div>
                    <button className="dm-close-btn" onClick={onClose}>✕</button>
                </div>

                {/* BODY */}
                <div className="dm-body">
                    {/* SIDEBAR */}
                    <div className="dm-sidebar">
                        <div className="dm-tree-header">Archivos del Proyecto</div>

                        {/* Root */}
                        <div
                            className={`dm-tree-item ${currentPath === '' ? 'active' : ''}`}
                            onClick={() => navigateToFolder('')}
                        >
                            <span className="folder-icon">🏠</span>
                            <span>Raíz</span>
                        </div>

                        {/* Dynamic root folders */}
                        {sidebarFolders.map(folder => (
                            <div
                                key={folder.fullName}
                                className={`dm-tree-item dm-tree-item-indent ${currentPath === folder.fullName ? 'active' : ''}`}
                                onClick={() => navigateToFolder(folder.fullName)}
                            >
                                <span className="folder-icon">📁</span>
                                <span>{folder.name.replace(/\/$/, '')}</span>
                            </div>
                        ))}
                    </div>

                    {/* CONTENT */}
                    <div
                        className={`dm-content ${dragOver ? 'dm-dropzone-active' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        {/* Breadcrumbs */}
                        <div className="dm-breadcrumbs">
                            <span className="dm-breadcrumb" onClick={() => navigateToFolder('')}>
                                🏠 Raíz
                            </span>
                            {breadcrumbs.map((part, idx) => {
                                const pathUpTo = breadcrumbs.slice(0, idx + 1).join('/') + '/';
                                const isLast = idx === breadcrumbs.length - 1;
                                return (
                                    <React.Fragment key={idx}>
                                        <span className="dm-breadcrumb-sep">›</span>
                                        {isLast ? (
                                            <span className="dm-breadcrumb-current">{part}</span>
                                        ) : (
                                            <span className="dm-breadcrumb" onClick={() => navigateToFolder(pathUpTo)}>
                                                {part}
                                            </span>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>

                        {/* Toolbar */}
                        <div className="dm-toolbar">
                            <div className="dm-upload-wrapper" style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <button
                                    className="dm-btn dm-btn-primary"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                >
                                    {uploading ? `⏳ Subiendo (${uploadProgress}%)` : '📤 Cargar archivos'}
                                </button>
                                {uploading && (
                                    <div className="dm-progress-track" style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                                        <div className="dm-progress-fill" style={{ width: `${uploadProgress}%`, height: '100%', background: '#3b82f6', transition: 'width 0.2s ease' }} />
                                    </div>
                                )}
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                style={{ display: 'none' }}
                                onChange={(e) => handleUpload(e.target.files)}
                            />

                            <button
                                className="dm-btn dm-btn-secondary"
                                onClick={() => setShowNewFolder(true)}
                            >
                                ➕ Nueva carpeta
                            </button>

                            {selectedItems.size > 0 && (
                                <button className="dm-btn dm-btn-danger" onClick={handleDelete}>
                                    🗑️ Eliminar ({selectedItems.size})
                                </button>
                            )}

                            <div className="dm-toolbar-spacer" />
                            <button className="dm-btn dm-btn-secondary" onClick={() => fetchContents(currentPath)}>
                                🔄
                            </button>
                        </div>

                        {/* FILE TABLE */}
                        {loading ? (
                            <div className="dm-loading">
                                <div className="dm-spinner" />
                                <span>Cargando...</span>
                            </div>
                        ) : (folders.length === 0 && files.length === 0) ? (
                            <div className="dm-empty">
                                <span className="empty-icon">📂</span>
                                <p>Esta carpeta está vacía. Arrastra archivos aquí o usa el botón "Cargar archivos".</p>
                            </div>
                        ) : (
                            <div className="dm-table-wrap">
                                <table className="dm-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '40px' }}></th>
                                            <th>Nombre</th>
                                            <th style={{ width: '100px' }}>Tamaño</th>
                                            <th style={{ width: '140px' }}>Última modificación</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* Folders first */}
                                        {folders.map(folder => (
                                            <tr
                                                key={folder.fullName}
                                                className={selectedItems.has(folder.fullName) ? 'selected' : ''}
                                            >
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedItems.has(folder.fullName)}
                                                        onChange={() => toggleSelect(folder.fullName)}
                                                    />
                                                </td>
                                                <td>
                                                    <div
                                                        className="dm-file-name-cell"
                                                        onDoubleClick={() => navigateToFolder(folder.fullName)}
                                                    >
                                                        <span className="file-icon">📁</span>
                                                        <span className="dm-file-name-text">{folder.name.replace(/\/$/, '')}</span>
                                                    </div>
                                                </td>
                                                <td>—</td>
                                                <td>—</td>
                                            </tr>
                                        ))}

                                        {/* Files */}
                                        {files.map(file => (
                                            <tr
                                                key={file.fullName}
                                                className={selectedItems.has(file.fullName) ? 'selected' : ''}
                                            >
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedItems.has(file.fullName)}
                                                        onChange={() => toggleSelect(file.fullName)}
                                                    />
                                                </td>
                                                <td>
                                                    <div className="dm-file-name-cell">
                                                        {file.name.toLowerCase().endsWith('.pdf') ? (
                                                            <div className="dm-pdf-mini-thumb">
                                                                <Document file={file.url || file.mediaLink} loading={<span className="file-icon">📕</span>}>
                                                                    <Page pageNumber={1} width={32} renderTextLayer={false} renderAnnotationLayer={false} />
                                                                </Document>
                                                            </div>
                                                        ) : (
                                                            <span className="file-icon">{getFileIcon(file.name)}</span>
                                                        )}
                                                        <span className="dm-file-name-text">{file.name}</span>
                                                    </div>
                                                </td>
                                                <td>{formatSize(file.size)}</td>
                                                <td>{formatDate(file.updated)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* New Folder Modal */}
                {showNewFolder && (
                    <div className="dm-modal-overlay" onClick={() => setShowNewFolder(false)}>
                        <div className="dm-modal" onClick={e => e.stopPropagation()}>
                            <h3>📁 Nueva Carpeta</h3>
                            <input
                                autoFocus
                                placeholder="Nombre de la carpeta..."
                                value={newFolderName}
                                onChange={e => setNewFolderName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                            />
                            <div className="dm-modal-actions">
                                <button className="dm-btn dm-btn-secondary" onClick={() => setShowNewFolder(false)}>
                                    Cancelar
                                </button>
                                <button className="dm-btn dm-btn-primary" onClick={handleCreateFolder}>
                                    Crear
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
