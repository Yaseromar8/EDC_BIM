import React, { useState, useEffect, useCallback } from 'react';
import './DocPinPanel.css';
import { apiFetch, getUploadAuthHeaders } from '../utils/apiFetch';
import { Document, Page, pdfjs } from 'react-pdf';
import PdfReader from './PdfReader';
import { useUrlFirmada } from '../utils/permisosDeLectura';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const BACKEND_URL = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ? 'https://visor-ecd-backend-va.onrender.com' : (import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3000' : (typeof window !== 'undefined' && window.location.hostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/) ? `http://${window.location.hostname}:3000` : 'https://visor-ecd-backend-va.onrender.com')));

const DOCS_API = `${BACKEND_URL}/api/docs`;
const PROXY_API = `${BACKEND_URL}/api/docs/proxy`;

// Cache para almacenar las miniaturas de los PDFs (DataURLs) y evitar re-renderizados costosos
const thumbnailCache = new Map();

const PdfThumbnail = ({ url, docId }) => {
    const [thumbnail, setThumbnail] = useState(thumbnailCache.get(docId) || null);
    const [loading, setLoading] = useState(!thumbnail);

    const onRenderSuccess = useCallback(() => {
        if (thumbnailCache.has(docId)) return;
        // Pequeño delay para asegurar que el canvas tenga contenido antes de capturarlo
        setTimeout(() => {
            const canvas = document.querySelector(`.pdf-page-${docId} canvas`);
            if (canvas) {
                try {
                    const dataUrl = canvas.toDataURL('image/png', 0.6);
                    thumbnailCache.set(docId, dataUrl);
                    setThumbnail(dataUrl);
                    setLoading(false);
                } catch (e) {
                    console.warn("Error capturing PDF thumbnail:", e);
                }
            }
        }, 500);
    }, [docId]);

    if (thumbnail) {
        return <img src={thumbnail} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 1, transition: 'opacity 0.3s' }} />;
    }

    // Usamos el proxy para cargar el PDF en la miniatura, evita redirects y CORS
    // Si no tenemos docId (nodeId), intentamos pasar el fullPath/fullName al proxy de todas formas
    // react-pdf descarga el fichero por su cuenta y NO manda cabecera de
    // autorización: sin permiso firmado, la miniatura recibía 401 y no salía.
    const proxyUrl = useUrlFirmada(
        BACKEND_URL,
        docId ? `${PROXY_API}?id=${docId}` : `${PROXY_API}?urn=${url}`
    );

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#faf9f5' }}>
            <Document
                file={proxyUrl}
                loading={<div className="loading-small">...</div>}
                onLoadError={(err) => console.error(`[PdfThumbnail] Error loading PDF ${docId}:`, err)}
            >
                <Page
                    pageNumber={1}
                    width={160}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    className={`pdf-page-${docId}`}
                    onRenderSuccess={onRenderSuccess}
                    loading={null}
                />
            </Document>
            {loading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <IconPDF size={32} color="rgba(255,255,255,0.1)" />
                </div>
            )}
        </div>
    );
};

// --- MODERN ICONS (Minimalist/Autodesk Style) ---
const IconPDF = ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <line x1="10" y1="9" x2="8" y2="9"></line>
    </svg>
);

const IconFolder = ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    </svg>
);

const IconFile = ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
        <polyline points="13 2 13 9 20 9"></polyline>
    </svg>
);

const IconDelete = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
);

const IconGrid = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"></rect>
        <rect x="14" y="3" width="7" height="7"></rect>
        <rect x="14" y="14" width="7" height="7"></rect>
        <rect x="3" y="14" width="7" height="7"></rect>
    </svg>
);

const IconList = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"></line>
        <line x1="8" y1="12" x2="21" y2="12"></line>
        <line x1="8" y1="18" x2="21" y2="18"></line>
        <line x1="3" y1="6" x2="3.01" y2="6"></line>
        <line x1="3" y1="12" x2="3.01" y2="12"></line>
        <line x1="3" y1="18" x2="3.01" y2="18"></line>
    </svg>
);

const DocPinPanel = ({
    isOpen,
    onClose,
    pin,
    onDelete,
    onAttachDoc,
    onAttachBatchDocs,
    onRemoveDoc,
    onRename,
    projectPrefix = 'proyectos/',
    modelUrn = 'global',
    variant = 'panel'
}) => {
    if (!isOpen || !pin) return null;

    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [tempTitle, setTempTitle] = useState("");

    // Edición de descripción de documentos adjuntos
    const [editingDocId, setEditingDocId] = useState(null);
    const [tempDesc, setTempDesc] = useState("");

    const handleSaveDesc = (e, doc) => {
        e.stopPropagation();
        if (onAttachDoc) {
            onAttachDoc(pin.id, { ...doc, plano_titulo: tempDesc }, true);
        }
        setEditingDocId(null);
    };

    const [browsing, setBrowsing] = useState(false);
    const [currentPath, setCurrentPath] = useState(projectPrefix);
    const [folders, setFolders] = useState([]);
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [viewingDoc, setViewingDoc] = useState(null); // { name, url }

    // Búsqueda Avanzada
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);

    // Selección masiva
    const [selectedItems, setSelectedItems] = useState(new Set()); // Set of IDs

    // Notificaciones (Toasts)
    const [notification, setNotification] = useState(null); // { message, type: 'success'|'error' }

    // Control de vista: Cuadrícula (miniaturas) o Lista (Detalle)
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
    const attachedDocs = pin.docs || [];

    // Limpiar estados cuando cambia el proyecto (modelUrn) o el pin
    useEffect(() => {
        if (!pin) return;
        
        // Start from the project root — the file system DB organizes by model_urn,
        // not by path strings. An empty path = root level (parent_id IS NULL).
        setBrowsing(false);
        setCurrentPath('');
        setIsSearching(false);
        setSearchResults([]);
        setSelectedItems(new Set());
    }, [pin?.id, pin?.type, modelUrn, projectPrefix]);

    const showNotify = (message, type = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3500);
    };

    // Fetch folder contents from the DB-backed backend
    const fetchContents = useCallback(async (path) => {
        setLoading(true);
        try {
            const res = await apiFetch(`${DOCS_API}/list?path=${encodeURIComponent(path)}&model_urn=${encodeURIComponent(modelUrn)}`);
            if (res.ok) {
                const json = await res.json();
                const data = json.data || {}; // Extracting the 'data' field from standardized response
                setFolders((data.folders || []).sort((a, b) => a.name.localeCompare(b.name)));
                setFiles((data.files || []).filter(f => {
                    const ext = f.name.split('.').pop().toLowerCase();
                    return ['pdf', 'docx', 'xlsx', 'png', 'jpg', 'jpeg', 'dwg'].includes(ext);
                }).sort((a, b) => a.name.localeCompare(b.name)));
            }
        } catch (e) {
            console.error('[DocPinPanel] Error fetching:', e);
            showNotify('Error al cargar contenidos de la carpeta', 'error');
        }
        setLoading(false);
    }, [modelUrn]);

    useEffect(() => {
        if (browsing) {
            fetchContents(currentPath);
        }
    }, [browsing, currentPath, fetchContents]);

    const handleCreateFolder = async () => {
        const name = window.prompt("Nombre de la nueva carpeta:");
        if (!name) return;

        const fullPath = currentPath + name + '/';
        try {
            const res = await apiFetch(`${DOCS_API}/folder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: fullPath, model_urn: modelUrn })
            });
            const data = await res.json();
            if (data.success) {
                showNotify(`Carpeta "${name}" creada`);
                fetchContents(currentPath);
            } else {
                showNotify(data.error || 'No se pudo crear carpeta', 'error');
            }
        } catch (err) {
            showNotify('Error de conexión', 'error');
        }
    };

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', currentPath);
        formData.append('model_urn', modelUrn);

        setLoading(true);
        try {
            const res = await apiFetch(`${DOCS_API}/upload`, {
                method: 'POST',
                body: formData,
                isUpload: true
            });
            const data = await res.json();
            if (data.success) {
                showNotify(`Archivo "${file.name}" subido`);
                fetchContents(currentPath);
            } else {
                showNotify(data.error || 'Error al subir', 'error');
            }
        } catch (err) {
            showNotify('Fallo en la subida', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (file) => {
        if (!window.confirm(`¿Seguro que desea eliminar "${file.name}"?`)) return;

        try {
            const res = await apiFetch(`${DOCS_API}/delete`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName: file.fullName, model_urn: modelUrn })
            });
            const data = await res.json();
            if (data.success) {
                showNotify('Elemento enviado a Papelera');
                fetchContents(currentPath);
            } else {
                showNotify(data.error, 'error');
            }
        } catch (err) {
            showNotify('Error al eliminar', 'error');
        }
    };

    const handleRename = async (file) => {
        const newName = window.prompt("Nuevo nombre:", file.name);
        if (!newName || newName === file.name) return;

        try {
            const res = await apiFetch(`${DOCS_API}/rename`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName: file.fullName, newName, model_urn: modelUrn })
            });
            const data = await res.json();
            if (data.success) {
                showNotify('Renombrado exitoso');
                fetchContents(currentPath);
            } else {
                showNotify(data.error, 'error');
            }
        } catch (err) {
            showNotify('Error al renombrar', 'error');
        }
    };

    const navigateToFolder = (fullName) => {
        setCurrentPath(fullName);
    };

    const navigateUp = () => {
        const parts = currentPath.replace(/\/$/, '').split('/');
        if (parts.length > 1) {
            parts.pop();
            setCurrentPath(parts.join('/') + '/');
        }
    };

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        const q = searchQuery.trim();
        if (q.length < 2) {
            setIsSearching(false);
            setSearchResults([]);
            return;
        }

        setSearchLoading(true);
        setIsSearching(true);
        try {
            const res = await apiFetch(`${DOCS_API}/search?q=${encodeURIComponent(q)}&model_urn=${encodeURIComponent(modelUrn)}`);
            const json = await res.json();
            if (json.success) {
                setSearchResults(json.data || []);
            }
        } catch (err) {
            console.error('[Search] Error:', err);
            showNotify('Error al realizar la búsqueda', 'error');
        }
        setSearchLoading(false);
    };

    const toggleSelection = (id) => {
        setSelectedItems(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleBatchDelete = async () => {
        if (selectedItems.size === 0) return;
        if (!window.confirm(`¿Eliminar ${selectedItems.size} elementos?`)) return;

        try {
            const res = await apiFetch(`${BACKEND_URL}/api/docs/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: Array.from(selectedItems),
                    action: 'DELETE',
                    model_urn: modelUrn
                })
            });
            const data = await res.json();
            if (data.success) {
                showNotify(`${selectedItems.size} elementos eliminados`);
                setSelectedItems(new Set());
                fetchContents(currentPath);
            } else {
                showNotify(data.error, 'error');
            }
        } catch (err) {
            showNotify('Error en proceso masivo', 'error');
        }
    };

    const handleBatchAttach = async () => {
        if (selectedItems.size === 0) return;

        const allAvailableFiles = [...files, ...searchResults];
        const muts = [];

        selectedItems.forEach(id => {
            const file = allAvailableFiles.find(f => f.id === id);
            if (file && file.type !== 'FOLDER') {
                muts.push({
                    urn: file.id,
                    url: `${DOCS_API}/view?id=${file.id}&model_urn=${encodeURIComponent(modelUrn)}`,
                    type: file.name.split('.').pop().toLowerCase()
                });
            }
        });

        if (muts.length === 0) {
            showNotify('No se seleccionaron archivos válidos para vincular', 'error');
            return;
        }

        // 1. Arreglo unidimensional keys (Identificadores semánticos del modelo)
        const keys = [pin.id]; // Si el pin agrupa varios dbIds, se enviarán todos: pin.targetIds || [pin.id]

        // Payload simétrico y optimizado para la transacción REST
        const payload = {
            keys: keys,
            muts: muts
        };

        try {
            // Se despacha a la API remota que el backend Python procesará sin saturar React
            const res = await apiFetch(`${BACKEND_URL}/api/docs/mutate-bind`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                showNotify(`${muts.length} URLs inyectadas al elemento (Inyección Simétrica exitosa)`);
                // Si la Vista requiere enterarse del vínculo, mandamos una actualización local mínima
                if (onAttachBatchDocs) {
                    onAttachBatchDocs(pin.id, muts);
                } else if (onAttachDoc) {
                    // Fallback local ultraligero
                    muts.forEach(m => onAttachDoc(pin.id, { id: m.urn, name: `🔗 Link: ${m.urn.substring(0,8)}`, ...m }));
                }
            } else {
                showNotify('El servidor rechazó la inyección simétrica', 'error');
            }
        } catch (error) {
            console.error('[Inyección Simétrica] Error de red:', error);
            showNotify('Fallo de red al despachar payload.', 'error');
        }

        setSelectedItems(new Set());
        setBrowsing(false);
    };

    const handleOpenDoc = (doc) => {
        // Al abrir, generamos una URL fresca basada en ID si existe (robusto)
        const freshUrl = doc.nodeId
            ? `${DOCS_API}/view?id=${doc.nodeId}&model_urn=${encodeURIComponent(modelUrn)}`
            : doc.url;
        setViewingDoc({ ...doc, url: freshUrl });
    };

    // Breadcrumb for browsing
    const breadcrumbParts = currentPath.replace(/\/$/, '').split('/').filter(Boolean);

    const getFileIcon = (name) => {
        const ext = name.split('.').pop().toLowerCase();
        if (ext === 'pdf') return <IconPDF color="#bd8585" />;
        if (ext === 'docx' || ext === 'doc') return <IconFile color="#6a9bcc" />;
        if (ext === 'xlsx' || ext === 'xls') return <IconFile color="#7ea88f" />;
        if (ext === 'dwg') return <IconFile color="#c2a878" />;
        if (['png', 'jpg', 'jpeg'].includes(ext)) return <IconFile color="#9a8fb0" />;
        return <IconFile />;
    };

    const content = (
        <div className={variant === 'panel' ? 'docpin-panel-content' : 'docpin-modal'}>
            {/* HEADER */}
            <header className="docpin-header">
                <div className="docpin-title-group">
                    <span className="docpin-icon">{pin.type === 'restriction' ? '⚠️' : '📑'}</span>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isEditingTitle ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <input
                                        autoFocus
                                        className="docpin-title-input"
                                        value={tempTitle}
                                        onChange={(e) => setTempTitle(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                if (onRename) onRename(pin.id, tempTitle);
                                                setIsEditingTitle(false);
                                            } else if (e.key === 'Escape') {
                                                setIsEditingTitle(false);
                                            }
                                        }}
                                        onBlur={() => {
                                            if (onRename) onRename(pin.id, tempTitle);
                                            setIsEditingTitle(false);
                                        }}
                                        style={{
                                            background: '#ffffff',
                                            border: '1px solid #6a9bcc',
                                            color: '#141413',
                                            fontSize: '14px',
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                            ) : (
                                <>
                                    <h3
                                        onClick={() => {
                                            setTempTitle(pin.val || (pin.type === 'restriction' ? 'Detalle de Restricción' : 'Documentos Vinculados'));
                                            setIsEditingTitle(true);
                                        }}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        {pin.val || (pin.type === 'restriction' ? 'Detalle de Restricción' : 'Documentos Vinculados')}
                                    </h3>
                                    <button
                                        className="docpin-rename-btn"
                                        onClick={() => {
                                            setTempTitle(pin.val || (pin.type === 'restriction' ? 'Detalle de Restricción' : 'Documentos Vinculados'));
                                            setIsEditingTitle(true);
                                        }}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            opacity: 0.3
                                        }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                        </svg>
                                    </button>
                                </>
                            )}
                        </div>
                        <span className="docpin-id">{pin.type === 'restriction' ? 'ALERTA' : 'PIN'}: {pin.id?.substring(0, 8)}</span>
                    </div>
                </div>
                <div className="docpin-actions">
                    {onDelete && (
                        <button
                            className="docpin-delete-btn"
                            onClick={() => {
                                if (window.confirm('¿Eliminar este pin de documentos?')) {
                                    onDelete(pin.id);
                                    onClose();
                                }
                            }}
                            title="Eliminar Pin"
                        >
                            <IconDelete size={18} />
                        </button>
                    )}
                    <button className="docpin-close-btn" onClick={onClose}>&times;</button>
                </div>
            </header>

            {/* VIEWING A DOC */}
            {viewingDoc ? (
                <div className="docpin-viewer">
                    <div className="docpin-viewer-bar">
                        <button className="docpin-back-btn" onClick={() => setViewingDoc(null)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 18 9 12 15 6"></polyline>
                            </svg>
                            Volver
                        </button>
                        <span className="docpin-viewer-name">{viewingDoc.name}</span>
                    </div>

                    <div className="docpin-viewer-body">
                        {viewingDoc.type === 'pdf' || viewingDoc.name?.toLowerCase().endsWith('.pdf') ? (
                            <PdfReader url={viewingDoc.nodeId ? `${PROXY_API}?id=${viewingDoc.nodeId}` : viewingDoc.url} fileName={viewingDoc.name || 'documento.pdf'} />
                        ) : (
                            <iframe
                                className="docpin-iframe"
                                src={viewingDoc.url}
                                title={viewingDoc.name}
                            />
                        )}
                    </div>
                </div>
            ) : browsing ? (
                /* BROWSING GCS FILES */
                <div className="docpin-browser">
                    <div className="docpin-browser-bar">
                        <button className="docpin-back-btn" onClick={() => setBrowsing(false)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 18 9 12 15 6"></polyline>
                            </svg>
                            Mis Docs
                        </button>

                        {/* Breadcrumb */}
                        <div className="docpin-breadcrumb">
                            {breadcrumbParts.map((part, i) => (
                                <span key={i}>
                                    <span
                                        className="docpin-breadcrumb-link"
                                        onClick={() => setCurrentPath(breadcrumbParts.slice(0, i + 1).join('/') + '/')}
                                    >
                                        {part}
                                    </span>
                                    {i < breadcrumbParts.length - 1 && <span className="docpin-breadcrumb-sep">/</span>}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* FILTER & SEARCH ROW */}
                    <div className="docpin-browser-controls">
                        {selectedItems.size > 0 ? (
                            /* BATCH TOOLBAR */
                            <div className="docpin-batch-toolbar">
                                <span className="batch-count">{selectedItems.size} seleccionados</span>
                                <div className="batch-actions">
                                    <button onClick={handleBatchAttach} className="btn-success">VINCULAR</button>
                                    <button onClick={handleBatchDelete} className="btn-danger">Eliminar</button>
                                    <button onClick={() => setSelectedItems(new Set())} className="btn-cancel">Cancelar</button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="docpin-browser-controls-top">
                                    <form className="docpin-search-form" onSubmit={handleSearch}>
                                        <input
                                            type="text"
                                            placeholder="Buscar..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                        />
                                        {isSearching ? (
                                            <button type="button" className="search-clear-btn" onClick={handleClearSearch}>&times;</button>
                                        ) : (
                                            <button type="submit" className="search-submit-btn">🔍</button>
                                        )}
                                    </form>
                                </div>

                                {!isSearching && (
                                    <div className="docpin-admin-actions">
                                        <button className="admin-btn create-folder-btn" onClick={handleCreateFolder}>
                                            <span>+</span> Carpeta
                                        </button>
                                        <label className="admin-btn upload-btn">
                                            <span>↑</span> Subir
                                            <input type="file" onChange={handleUpload} style={{ display: 'none' }} />
                                        </label>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <div className="docpin-browser-list">
                        {loading || searchLoading ? (
                            <div className="docpin-loading">
                                <div className="docpin-spinner" />
                                <span>{searchLoading ? 'Buscando...' : 'Cargando archivos...'}</span>
                            </div>
                        ) : isSearching ? (
                            /* SEARCH RESULTS VIEW */
                            <div className="docpin-search-results">
                                <div className="docpin-list-header">
                                    <span className="col-name">Nombre / Ubicación</span>
                                    <span className="col-version">Vers.</span>
                                </div>
                                {searchResults.length === 0 ? (
                                    <div className="docpin-empty">No se encontraron resultados</div>
                                ) : (
                                    searchResults.filter(res => statusFilter === 'ALL' || res.status === statusFilter).map(res => (
                                        <div
                                            key={res.id}
                                            className={`docpin-browser-item ${res.type.toLowerCase()} ${selectedItems.has(res.id) ? 'is-selected' : ''}`}
                                            onClick={(e) => {
                                                if (e.target.type === 'checkbox') return;
                                                if (res.type === 'FOLDER') {
                                                    setIsSearching(false);
                                                    setCurrentPath(res.path + '/');
                                                } else {
                                                    // Ya no vincula con clic, solo marca
                                                    toggleSelection(res.id);
                                                }
                                            }}
                                        >
                                            <div className="docpin-name-cell">
                                                <input
                                                    type="checkbox"
                                                    className="docpin-checkbox"
                                                    checked={selectedItems.has(res.id)}
                                                    onChange={() => toggleSelection(res.id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                                <span className="docpin-item-icon">
                                                    {res.type === 'FOLDER' ? '📁' : getFileIcon(res.name)}
                                                </span>
                                                <div className="docpin-item-details-stacked">
                                                    <span className="docpin-item-name">{res.name}</span>
                                                    <span className="docpin-item-path">{res.path}</span>
                                                </div>
                                            </div>
                                            <span className="col-version">V{res.version || 1}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        ) : (
                            /* STANDARD FOLDER BROWSER */
                            <>
                                <div className="docpin-list-header">
                                    <span className="col-name">Nombre</span>
                                    <span className="col-version">V.</span>
                                    <span className="col-size">Tamaño</span>
                                </div>
                                {currentPath !== projectPrefix && (
                                    <div className="docpin-browser-item folder" onClick={navigateUp}>
                                        <div className="docpin-name-cell">
                                            <span className="docpin-item-icon">⬆️</span>
                                            <span className="docpin-item-name">.. (Subir nivel)</span>
                                        </div>
                                    </div>
                                )}
                                {folders.map(f => (
                                    <div
                                        key={f.fullName}
                                        className={`docpin-browser-item folder ${selectedItems.has(f.id) ? 'is-selected' : ''}`}
                                        onClick={(e) => {
                                            if (e.target.type === 'checkbox') return;
                                            navigateToFolder(f.fullName);
                                        }}
                                    >
                                        <div className="docpin-name-cell">
                                            <input
                                                type="checkbox"
                                                className="docpin-checkbox"
                                                checked={selectedItems.has(f.id)}
                                                onChange={() => toggleSelection(f.id)}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                            <span className="docpin-item-icon">📁</span>
                                            <span className="docpin-item-name">{f.name.replace(/\/$/, '')}</span>
                                        </div>
                                        <span className="col-version">-</span>
                                        <span className="col-size">-</span>
                                    </div>
                                ))}
                                {files.map(f => (
                                    <div
                                        key={f.fullName || f.name}
                                        className={`docpin-browser-item file ${selectedItems.has(f.id) ? 'is-selected' : ''}`}
                                        onClick={(e) => {
                                            if (e.target.type === 'checkbox') return;
                                            toggleSelection(f.id);
                                        }}
                                    >
                                        <div className="docpin-name-cell">
                                            <input
                                                type="checkbox"
                                                className="docpin-checkbox"
                                                checked={selectedItems.has(f.id)}
                                                onChange={() => toggleSelection(f.id)}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                            <span className="docpin-item-icon">{getFileIcon(f.name)}</span>
                                            <span className="docpin-item-name" title={f.name}>{f.name}</span>
                                        </div>
                                        <span className="col-version">{f.version || 'V1'}</span>
                                        <div className="col-size-group">
                                            <span className="col-size">{f.size ? `${(f.size / 1024).toFixed(0)} KB` : ''}</span>
                                            <div className="row-actions">
                                                <button onClick={(e) => { e.stopPropagation(); handleRename(f); }} title="Renombrar">✏️</button>
                                                <button onClick={(e) => { e.stopPropagation(); handleDelete(f); }} title="Borrar">🗑️</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {folders.length === 0 && files.length === 0 && (
                                    <div className="docpin-empty">
                                        <span>📂</span>
                                        <small>Carpeta vacía</small>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                </div>
            ) : (
                /* ATTACHED DOCS LIST */
                <div className="docpin-content">
                    {pin.type === 'restriction' && pin.val && (
                        <div className="docpin-restriction-banner" style={{
                            background: 'rgba(245, 158, 11, 0.15)',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            borderRadius: '8px',
                            padding: '12px 16px',
                            marginBottom: '16px',
                            display: 'flex',
                            gap: '12px',
                            alignItems: 'center'
                        }}>
                            <span style={{ fontSize: '20px' }}>📢</span>
                            <div>
                                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#c2a878', textTransform: 'uppercase', marginBottom: '2px' }}>Descripción</div>
                                <div style={{ fontSize: '14px', color: '#141413', fontWeight: 500 }}>{pin.val}</div>
                            </div>
                        </div>
                    )}
                    <div className="docpin-content-header">
                        <button className="docpin-add-btn" onClick={() => setBrowsing(true)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            Vincular Documento desde Nube
                        </button>
                        <div className="docpin-view-toggle">
                            <button
                                className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                                onClick={() => setViewMode('grid')}
                                title="Vista miniaturas"
                            >
                                <IconGrid />
                            </button>
                            <button
                                className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                                onClick={() => setViewMode('list')}
                                title="Vista lista detallada"
                            >
                                <IconList />
                            </button>
                        </div>
                    </div>

                    {attachedDocs.length === 0 ? (
                        <div className="docpin-empty-state">
                            <div className="docpin-empty-icon">📑</div>
                            <p>No hay documentos vinculados.</p>
                            <small>Presione el botón para vincular un PDF o documento desde su gestor documental.</small>
                        </div>
                    ) : viewMode === 'grid' ? (
                        <div className="docpin-doc-grid">
                            {attachedDocs.map(doc => {
                                const isPdf = doc.type === 'pdf' || (doc.name && doc.name.toLowerCase().endsWith('.pdf'));
                                return (
                                    <div key={doc.id} className="docpin-pdf-card" onClick={() => handleOpenDoc(doc)}>
                                        <button
                                            className="docpin-remove-btn-card"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (onRemoveDoc) onRemoveDoc(pin.id, doc.id);
                                            }}
                                            title="Desvincular"
                                        >
                                            <IconDelete size={12} />
                                        </button>
                                        <div className="docpin-pdf-preview icon-style" style={{ padding: 0 }}>
                                            {isPdf ? (
                                                <PdfThumbnail url={doc.url} docId={doc.id} />
                                            ) : (
                                                <div className="docpin-preview-fallback">
                                                    {getFileIcon(doc.name)}
                                                </div>
                                            )}
                                            {isPdf && <div className="pdf-overlay-tag">PDF</div>}
                                        </div>
                                        <div className="docpin-pdf-info">
                                            <div className="docpin-pdf-name" title={doc.name}>{doc.name}</div>
                                            <div className="docpin-pdf-actions">
                                                <div className="docpin-pdf-date">
                                                    {doc.addedAt ? new Date(doc.addedAt).toLocaleDateString() : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="docpin-modern-list">
                            <div className="modern-list-header">
                                <div className="header-col code">CÓDIGO / NOMBRE</div>
                                <div className="header-col desc">DESCRIPCIÓN / TÍTULO</div>
                                <div className="header-col date">FECHA</div>
                                <div className="header-col actions"></div>
                            </div>
                            <div className="modern-list-body">
                                {attachedDocs.map(doc => {
                                    return (
                                        <div key={doc.id} className="modern-list-row" onClick={() => handleOpenDoc(doc)}>
                                            <div className="row-col code">
                                                <span className="doc-icon-small">{getFileIcon(doc.name)}</span>
                                                <span className="doc-name-text" title={doc.name}>{doc.name}</span>
                                            </div>
                                            <div className="row-col desc">
                                                {editingDocId === doc.id ? (
                                                    <input
                                                        autoFocus
                                                        className="docpin-edit-desc-input"
                                                        value={tempDesc}
                                                        onChange={(e) => setTempDesc(e.target.value)}
                                                        onBlur={(e) => handleSaveDesc(e, doc)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleSaveDesc(e, doc);
                                                            if (e.key === 'Escape') setEditingDocId(null);
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        style={{
                                                            background: 'rgba(20, 20, 19,0.05)',
                                                            border: '1px solid #6a9bcc',
                                                            borderRadius: '4px',
                                                            color: '#141413',
                                                            padding: '4px 8px',
                                                            width: '100%',
                                                            fontSize: '12px'
                                                        }}
                                                    />
                                                ) : (
                                                    <span
                                                        className={`doc-desc-text ${!doc.plano_titulo ? 'pending' : ''}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditingDocId(doc.id);
                                                            setTempDesc(doc.plano_titulo || "");
                                                        }}
                                                        style={{ cursor: 'text', minHeight: '1.2em', display: 'block', width: '100%' }}
                                                    >
                                                        {doc.plano_titulo || 'Sin descripción...'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="row-col date">
                                                {doc.addedAt ? new Date(doc.addedAt).toLocaleDateString() : '-'}
                                            </div>
                                            <div className="row-col actions">
                                                <button
                                                    className="action-btn delete"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (onRemoveDoc) onRemoveDoc(pin.id, doc.id);
                                                    }}
                                                    title="Desvincular"
                                                >
                                                    <IconDelete size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )
            }

            {/* NOTIFICATION TOAST */}
            {
                notification && (
                    <div className={`docpin-toast ${notification.type}`}>
                        <span className="toast-icon">{notification.type === 'success' ? '✅' : '❌'}</span>
                        <p>{notification.message}</p>
                    </div>
                )
            }
        </div >
    );

    if (variant === 'panel') return content;

    return (
        <div className="docpin-overlay">
            {content}
        </div>
    );
};

export default DocPinPanel;
