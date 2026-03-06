import React, { useState, useEffect, useCallback } from 'react';
import './DocPinPanel.css';
import { Document, Page, pdfjs } from 'react-pdf';
import PdfViewer from './PdfViewer';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const BACKEND_URL = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
    ? 'https://visor-ecd-backend.onrender.com'
    : (import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3000' : ''));

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
    const proxyUrl = docId ? `${PROXY_API}?id=${docId}` : `${PROXY_API}?urn=${url}`;

    useEffect(() => {
        console.log(`[PdfThumbnail] Loading document ${docId}. Proxy: ${proxyUrl}`);
    }, [docId, proxyUrl]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0a0a0c' }}>
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

const IconSparkles = ({ size = 16, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"></path>
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

    // AI Chat State (panel separado - flujo existente sin cambios)
    const [aiDoc, setAiDoc] = useState(null);
    const [aiQuestion, setAiQuestion] = useState('');
    const [aiResponse, setAiResponse] = useState('');
    const [aiLoading, setAiLoading] = useState(false);

    // Estado de precarga del documento
    const [warmupStatus, setWarmupStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
    const [warmupDocType, setWarmupDocType] = useState('text'); // 'text' | 'images'

    // AI Command Bar State (nueva barra tipo AutoCAD dentro del viewer)
    const [cmdMessages, setCmdMessages] = useState([]);  // [{role:'user'|'ai', text}]
    const [cmdInput, setCmdInput] = useState('');
    const [cmdLoading, setCmdLoading] = useState(false);
    const [cmdActive, setCmdActive] = useState(false); // hover/scroll activo → opaco
    const [cmdExpanded, setCmdExpanded] = useState(false); // true = historial completo opaco
    const cmdFadeTimer = React.useRef(null);
    const cmdHistoryRef = React.useRef(null);

    // Búsqueda Avanzada
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);

    // Selección masiva
    const [selectedItems, setSelectedItems] = useState(new Set()); // Set of IDs

    // Notificaciones (Toasts)
    const [notification, setNotification] = useState(null); // { message, type: 'success'|'error' }

    // Control de vista: Cuadrícula (miniaturas) o Lista (Detalle IA)
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
    const attachedDocs = pin.docs || [];

    // Limpiar estados cuando cambia el proyecto (modelUrn)
    useEffect(() => {
        setBrowsing(false);
        setCurrentPath(projectPrefix);
        setIsSearching(false);
        setSearchResults([]);
        setSelectedItems(new Set());
    }, [modelUrn, projectPrefix]);

    const showNotify = (message, type = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3500);
    };

    // EFECTO: Análisis automático de títulos de planos faltantes
    useEffect(() => {
        if (!pin?.docs || browsing) return;

        const docsToAnalyze = pin.docs.filter(d =>
            (d.type === 'pdf' || d.name?.toLowerCase().endsWith('.pdf')) &&
            !d.plano_titulo &&
            d.nodeId
        );

        if (docsToAnalyze.length === 0) return;

        // Analizar solo de a uno para no saturar con 500s si hay errores de red/storage
        const doc = docsToAnalyze[0];

        console.log(`[IA] Analizando título: ${doc.name}`);
        fetch(`${BACKEND_URL}/api/ai/analyze-title`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fullPath: doc.fullPath,
                nodeId: doc.nodeId
            })
        })
            .then(res => res.json())
            .then(data => {
                if (data.success && data.title) {
                    if (onAttachDoc) {
                        onAttachDoc(pin.id, { ...doc, plano_titulo: data.title }, true);
                    }
                }
            })
            .catch(err => console.error("Error analizando título:", err));

    }, [pin.id, pin.docs, onAttachDoc, browsing]);

    // Activa opacidad y la resetea tras 4 seg de inactividad
    const activateCmd = () => {
        setCmdActive(true);
        if (cmdFadeTimer.current) clearTimeout(cmdFadeTimer.current);
        cmdFadeTimer.current = setTimeout(() => setCmdActive(false), 4000);
    };

    // Enviar pregunta desde la Command Bar (usa el mismo endpoint /api/ai/ask)
    const handleCmdAsk = async (e) => {
        if (e) e.preventDefault();
        const q = cmdInput.trim();
        if (!q || !viewingDoc) return;

        const userMsg = { role: 'user', text: q };
        setCmdMessages(prev => [...prev, userMsg]);
        setCmdInput('');
        setCmdLoading(true);
        activateCmd();

        // Auto-scroll al fondo del historial
        setTimeout(() => {
            if (cmdHistoryRef.current) {
                cmdHistoryRef.current.scrollTop = cmdHistoryRef.current.scrollHeight;
            }
        }, 50);

        try {
            const res = await fetch(`${BACKEND_URL}/api/ai/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: q,
                    fullPath: viewingDoc.fullPath,
                    nodeId: viewingDoc.nodeId
                })
            });
            const data = await res.json();
            const aiMsg = {
                role: 'ai',
                text: data.success ? data.answer : `Error: ${data.error || 'Sin respuesta'}`
            };
            setCmdMessages(prev => [...prev, aiMsg]);
            activateCmd();
        } catch (err) {
            setCmdMessages(prev => [...prev, { role: 'ai', text: 'Error de conexión con Gemini.' }]);
        } finally {
            setCmdLoading(false);
            setTimeout(() => {
                if (cmdHistoryRef.current) {
                    cmdHistoryRef.current.scrollTop = cmdHistoryRef.current.scrollHeight;
                }
            }, 80);
        }
    };

    // Fetch folder contents from the DB-backed backend
    const fetchContents = useCallback(async (path) => {
        setLoading(true);
        try {
            const res = await fetch(`${DOCS_API}/list?path=${encodeURIComponent(path)}&model_urn=${encodeURIComponent(modelUrn)}`);
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

    // ── Warmup al abrir el viewer (Command Bar) ──────────────────────────────
    // Se lanza en background cuando el usuario abre un PDF en el viewer.
    // Si ya está cacheado en el servidor, responde al instante.
    useEffect(() => {
        if (!viewingDoc) {
            setWarmupStatus('idle');
            return;
        }
        const isPdf = (viewingDoc.name || '').toLowerCase().endsWith('.pdf');
        if (!isPdf || !viewingDoc.fullPath) return;

        setWarmupStatus('loading');
        setWarmupDocType('text');
        fetch(`${BACKEND_URL}/api/ai/warmup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fullPath: viewingDoc.fullPath,
                nodeId: viewingDoc.nodeId
            })
        })
            .then(r => r.json())
            .then(d => {
                if (d.status === 'ready' || d.status === 'already_cached') {
                    setWarmupStatus('ready');
                    setWarmupDocType(d.type || 'text'); // 'text' o 'images'
                    console.log('[AI Warmup] Doc listo en caché:', d);
                } else if (d.status === 'skipped') {
                    setWarmupStatus('idle');
                } else {
                    setWarmupStatus('error');
                }
            })
            .catch(() => setWarmupStatus('error'));
    }, [viewingDoc]);

    // ── Warmup al abrir el panel IA (botón ✨IA de la tarjeta) ───────────────
    useEffect(() => {
        if (!aiDoc) return;
        const isPdf = (aiDoc.name || '').toLowerCase().endsWith('.pdf');
        if (!isPdf || !aiDoc.fullPath) return;

        // Precarga silenciosa; si falla, el ask normal hace fallback
        fetch(`${BACKEND_URL}/api/ai/warmup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fullPath: aiDoc.fullPath,
                nodeId: aiDoc.nodeId
            })
        }).catch(() => { });
    }, [aiDoc]);

    const handleCreateFolder = async () => {
        const name = window.prompt("Nombre de la nueva carpeta:");
        if (!name) return;

        const fullPath = currentPath + name + '/';
        try {
            const res = await fetch(`${DOCS_API}/folder`, {
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
            const res = await fetch(`${DOCS_API}/upload`, {
                method: 'POST',
                body: formData
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
            const res = await fetch(`${DOCS_API}/delete`, {
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
            const res = await fetch(`${DOCS_API}/rename`, {
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
            const res = await fetch(`${DOCS_API}/search?q=${encodeURIComponent(q)}&model_urn=${encodeURIComponent(modelUrn)}`);
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
            const res = await fetch(`${BACKEND_URL}/api/docs/batch`, {
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

    const handleBatchAttach = () => {
        if (selectedItems.size === 0) return;

        const selectedDocs = [];
        const allAvailableFiles = [...files, ...searchResults];

        selectedItems.forEach(id => {
            const file = allAvailableFiles.find(f => f.id === id);
            if (file && file.type !== 'FOLDER') {
                selectedDocs.push({
                    id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    nodeId: file.id,
                    name: file.name,
                    plano_titulo: file.metadata?.plano_titulo,
                    url: `${DOCS_API}/view?id=${file.id}&model_urn=${encodeURIComponent(modelUrn)}`,
                    fullPath: file.fullName || file.path,
                    type: file.name.split('.').pop().toLowerCase(),
                    addedAt: new Date().toISOString()
                });
            }
        });

        if (selectedDocs.length > 0) {
            if (onAttachBatchDocs) {
                onAttachBatchDocs(pin.id, selectedDocs);
            } else {
                selectedDocs.forEach(doc => {
                    if (onAttachDoc) onAttachDoc(pin.id, doc);
                });
            }
            showNotify(`${selectedDocs.length} documentos vinculados correctamente`);
            setSelectedItems(new Set());
            setBrowsing(false);
        } else {
            showNotify('No se seleccionaron archivos válidos para vincular', 'error');
        }
    };

    const handleOpenDoc = (doc) => {
        // Al abrir, generamos una URL fresca basada en ID si existe (robusto)
        const freshUrl = doc.nodeId
            ? `${DOCS_API}/view?id=${doc.nodeId}&model_urn=${encodeURIComponent(modelUrn)}`
            : doc.url;
        setViewingDoc({ ...doc, url: freshUrl });
    };

    const handleAskAI = async (e) => {
        if (e) e.preventDefault();
        if (!aiQuestion.trim() || !aiDoc) return;

        setAiLoading(true);
        setAiResponse('');
        try {
            const res = await fetch(`${BACKEND_URL}/api/ai/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: aiQuestion,
                    fullPath: aiDoc.fullPath,
                    nodeId: aiDoc.nodeId
                })
            });
            const data = await res.json();
            if (data.success) {
                setAiResponse(data.answer);
            } else {
                setAiResponse(`Error: ${data.error || 'No se pudo obtener respuesta'}`);
            }
        } catch (err) {
            console.error('[AI] Error:', err);
            setAiResponse('Error de conexión con el servicio de IA.');
        } finally {
            setAiLoading(false);
        }
    };


    // Breadcrumb for browsing
    const breadcrumbParts = currentPath.replace(/\/$/, '').split('/').filter(Boolean);

    const getFileIcon = (name) => {
        const ext = name.split('.').pop().toLowerCase();
        if (ext === 'pdf') return <IconPDF color="#ef4444" />;
        if (ext === 'docx' || ext === 'doc') return <IconFile color="#3b82f6" />;
        if (ext === 'xlsx' || ext === 'xls') return <IconFile color="#22c55e" />;
        if (ext === 'dwg') return <IconFile color="#f97316" />;
        if (['png', 'jpg', 'jpeg'].includes(ext)) return <IconFile color="#8b5cf6" />;
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
                                            background: '#1a1b1e',
                                            border: '1px solid #3b82f6',
                                            color: '#fff',
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

            {/* VIEWING A DOC — con Command Bar tipo AutoCAD */}
            {viewingDoc ? (
                <div className="docpin-viewer">
                    <div className="docpin-viewer-bar">
                        <button className="docpin-back-btn" onClick={() => { setViewingDoc(null); setCmdMessages([]); }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 18 9 12 15 6"></polyline>
                            </svg>
                            Volver
                        </button>
                        <span className="docpin-viewer-name">{viewingDoc.name}</span>
                        <span className={`docpin-ai-badge ${warmupStatus === 'loading' ? 'is-warming' : ''}`}>
                            {warmupStatus === 'loading' ? '⏳ Preparando IA...' : (warmupDocType === 'images' ? '📐 Plano detectado' : '✨ IA activa')}
                        </span>
                    </div>

                    {/* Wrapper relativo para superponer la command bar sobre el iframe */}
                    <div className="docpin-viewer-body">
                        {viewingDoc.type === 'pdf' || viewingDoc.name?.toLowerCase().endsWith('.pdf') ? (
                            <PdfViewer url={viewingDoc.nodeId ? `${PROXY_API}?id=${viewingDoc.nodeId}` : viewingDoc.url} />
                        ) : (
                            <iframe
                                className="docpin-iframe"
                                src={viewingDoc.url}
                                title={viewingDoc.name}
                            />
                        )}

                        {/* ═══ AUTOCAD-STYLE COMMAND BAR ═══ */}
                        <div
                            className={`docpin-cmdbar ${cmdActive ? 'is-active' : ''} ${cmdExpanded ? 'is-expanded' : ''}`}
                            onMouseEnter={activateCmd}
                            onMouseLeave={() => {
                                if (cmdExpanded) return; // si está expandido no auto-fade
                                if (cmdFadeTimer.current) clearTimeout(cmdFadeTimer.current);
                                cmdFadeTimer.current = setTimeout(() => setCmdActive(false), 2000);
                            }}
                        >
                            {/* Botón toggle historial (esquina superior derecha del cmd) */}
                            {cmdMessages.length > 0 && (
                                <button
                                    className={`docpin-cmd-toggle ${cmdExpanded ? 'is-expanded' : ''}`}
                                    onClick={() => {
                                        setCmdExpanded(prev => !prev);
                                        activateCmd();
                                        setTimeout(() => {
                                            if (cmdHistoryRef.current) {
                                                cmdHistoryRef.current.scrollTop = cmdHistoryRef.current.scrollHeight;
                                            }
                                        }, 50);
                                    }}
                                    title={cmdExpanded ? 'Contraer historial' : 'Ver historial completo'}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <polyline points={cmdExpanded ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
                                    </svg>
                                    {cmdExpanded ? 'Contraer' : `Historial (${cmdMessages.length})`}
                                </button>
                            )}

                            {/* Historial: flotante con filas resaltadas (estado 1) 
                                         o panel opaco expandido (estado 2) */}
                            {cmdMessages.length > 0 && (
                                <div
                                    className={`docpin-cmd-history ${cmdExpanded ? 'is-expanded' : ''}`}
                                    ref={cmdHistoryRef}
                                    onScroll={activateCmd}
                                >
                                    {cmdMessages.map((msg, i) => (
                                        <div key={i} className={`docpin-cmd-msg docpin-cmd-msg--${msg.role}`}>
                                            <span className="docpin-cmd-prefix">
                                                {msg.role === 'user' ? '› ' : '✦ '}
                                            </span>
                                            <span className="docpin-cmd-text">{msg.text}</span>
                                        </div>
                                    ))}
                                    {cmdLoading && (
                                        <div className="docpin-cmd-msg docpin-cmd-msg--ai docpin-cmd-typing">
                                            <span className="docpin-cmd-prefix">✦ </span>
                                            <span className="docpin-cmd-dots">
                                                <span /><span /><span />
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Barra de input fija */}
                            <form className="docpin-cmd-input-row" onSubmit={handleCmdAsk}>
                                <span className="docpin-cmd-label">Gemini›</span>
                                <input
                                    className="docpin-cmd-input"
                                    type="text"
                                    placeholder="Consulta sobre este documento..."
                                    value={cmdInput}
                                    onChange={e => { setCmdInput(e.target.value); activateCmd(); }}
                                    onFocus={activateCmd}
                                    disabled={cmdLoading}
                                    autoComplete="off"
                                />
                                <button
                                    className="docpin-cmd-send"
                                    type="submit"
                                    disabled={cmdLoading || !cmdInput.trim()}
                                    title="Enviar"
                                >
                                    {cmdLoading ? '…' : '↵'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            ) : aiDoc ? (
                /* AI CHAT VIEW */
                <div className="docpin-ai-chat">
                    <div className="docpin-viewer-bar">
                        <button className="docpin-back-btn" onClick={() => { setAiDoc(null); setAiResponse(''); setAiQuestion(''); }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 18 9 12 15 6"></polyline>
                            </svg>
                            Volver
                        </button>
                        <span className="docpin-viewer-name">Consultar IA: {aiDoc.name}</span>
                    </div>

                    <div className="docpin-ai-content">
                        <div className="docpin-ai-instruction">
                            <span className="ai-sparkle">✨</span>
                            <p>Pregunta cualquier detalle sobre este plano o documento. La IA de Google lo analizará por ti.</p>
                        </div>

                        <div className="docpin-ai-messages">
                            {aiResponse ? (
                                <div className="docpin-ai-bubble">
                                    <div className="ai-bubble-header">Respuesta de IA:</div>
                                    <div className="ai-bubble-text">{aiResponse}</div>
                                </div>
                            ) : aiLoading ? (
                                <div className="docpin-ai-loading">
                                    <div className="docpin-spinner" />
                                    <span>Gemini está analizando el documento...</span>
                                </div>
                            ) : (
                                <div className="docpin-ai-empty">
                                    <p>Ejemplos:</p>
                                    <ul>
                                        <li>"¿Cuál es el presupuesto total de esta partida?"</li>
                                        <li>"Resúmeme las notas técnicas de este plano"</li>
                                        <li>"¿Qué diámetros de tubería se especifican?"</li>
                                    </ul>
                                </div>
                            )}
                        </div>

                        <form className="docpin-ai-input-group" onSubmit={handleAskAI}>
                            <input
                                type="text"
                                placeholder="Escribe tu pregunta aquí..."
                                value={aiQuestion}
                                onChange={(e) => setAiQuestion(e.target.value)}
                                disabled={aiLoading}
                            />
                            <button type="submit" disabled={aiLoading || !aiQuestion.trim()}>
                                {aiLoading ? '...' : 'Preguntar'}
                            </button>
                        </form>
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
                                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#f59e0b', textTransform: 'uppercase', marginBottom: '2px' }}>Descripción</div>
                                <div style={{ fontSize: '14px', color: '#eee', fontWeight: 500 }}>{pin.val}</div>
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
                                                {isPdf && (
                                                    <button
                                                        className="docpin-ai-btn-small"
                                                        onClick={(e) => { e.stopPropagation(); setAiDoc(doc); }}
                                                        title="Preguntar a la IA"
                                                    >
                                                        <IconSparkles size={10} /> IA
                                                    </button>
                                                )}
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
                                    const isPdf = doc.type === 'pdf' || (doc.name && doc.name.toLowerCase().endsWith('.pdf'));
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
                                                            background: 'rgba(255,255,255,0.05)',
                                                            border: '1px solid #3b82f6',
                                                            borderRadius: '4px',
                                                            color: 'white',
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
                                                {isPdf && (
                                                    <button
                                                        className="action-btn ai"
                                                        onClick={(e) => { e.stopPropagation(); setAiDoc(doc); }}
                                                        title="Consultar IA"
                                                    >
                                                        <IconSparkles size={14} />
                                                    </button>
                                                )}
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
