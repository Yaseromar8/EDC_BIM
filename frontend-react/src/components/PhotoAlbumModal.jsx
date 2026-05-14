import { apiFetch } from '../utils/apiFetch';

import React, { useState, useEffect, useRef } from 'react';
import './PhotoAlbumModal.css';
import { uploadFile } from '../services/uploadService';
import { enqueuePhoto, dequeuePhoto } from '../services/uploadQueue';
import CameraCapture from './CameraCapture';
import exifr from 'exifr';

const MOCK_PHOTOS = [
    { id: 1, src: '/photo1.jpg', desc: 'Vaciado de losa' }, // Placeholder
    { id: 2, src: '/photo2.jpg', desc: 'Encofrado lateral' }, // Placeholder
    { id: 3, src: '/photo3.jpg', desc: 'Armado de acero' }, // Placeholder
    { id: 4, src: '/photo4.jpg', desc: 'Vista general' }, // Placeholder
    { id: 5, src: '/photo5.jpg', desc: 'Detalle constructivo' }, // Placeholder
    { id: 6, src: '/photo6.jpg', desc: 'Panorama' }, // Placeholder
];

// Fallback image if source missing
const FALLBACK_IMG = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22300%22%20height%3D%22200%22%3E%3Crect%20width%3D%22300%22%20height%3D%22200%22%20fill%3D%22%23cccccc%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-family%3D%22sans-serif%22%20font-size%3D%2220px%22%20fill%3D%22%23666666%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E';

const PhotoAlbumModal = ({ isOpen, onClose, pinId, title = "Album de Fotos", photos = [], onAddPhoto, variant = 'modal', onDelete, onDeletePhoto, onRename, modelUrn = 'global', targetPath = '', projectPrefix = 'proyectos/' }) => {
    if (!isOpen) return null;

    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [tempTitle, setTempTitle] = useState("");
    const [selectedPhoto, setSelectedPhoto] = useState(null);
    const [editingDesc, setEditingDesc] = useState(false);
    const [tempDesc, setTempDesc] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showFilters, setShowFilters] = useState(photos.length > 20); // Auto-show if many
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [mediaType, setMediaType] = useState('all'); // 'all' | 'image' | 'video'
    const [searchTerm, setSearchTerm] = useState(''); 
    const [browsing, setBrowsing] = useState(false);
    const [browseMode, setBrowseMode] = useState('link'); // 'link' | 'folder'
    const [browsePath, setBrowsePath] = useState('');
    const [browseFolders, setBrowseFolders] = useState([]);
    const [browseFiles, setBrowseFiles] = useState([]);
    const [browseLoading, setBrowseLoading] = useState(false);
    const [toastMsg, setToastMsg] = useState(null); // { text, type: 'success' | 'error' }
    const [showCamera, setShowCamera] = useState(false); // Built-in camera with device selection
    const activeUploadsRef = useRef(0);

    // 🛡️ Prevent accidental page refresh while photos are uploading
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (activeUploadsRef.current > 0) {
                e.preventDefault();
                e.returnValue = 'Hay fotos subiendo. Si sales ahora se perderán.';
                return e.returnValue;
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    const showToast = (text, type = 'success') => {
        setToastMsg({ text, type });
        setTimeout(() => setToastMsg(null), 4000);
    };

    const BACKEND_URL = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ? 'https://visor-ecd-backend.onrender.com' : (import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3000' : (typeof window !== 'undefined' && window.location.hostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/) ? `http://${window.location.hostname}:3000` : 'https://visor-ecd-backend.onrender.com')));
    const DOCS_API = `${BACKEND_URL}/api/docs`;

    const fetchBrowseContents = async (path) => {
        setBrowseLoading(true);
        try {
            const url = `${DOCS_API}/list?path=${encodeURIComponent(path)}&model_urn=${encodeURIComponent(projectPrefix)}`;
            const res = await apiFetch(url);
            const data = await res.json();
            if (data.success) {
                setBrowseFolders(data.data.folders || []);
                setBrowseFiles(data.data.files || []);
                setBrowsePath(path);
            }
        } catch (err) {
            console.error("Error fetching browse contents:", err);
        } finally {
            setBrowseLoading(false);
        }
    };

    const handleOpenBrowser = (mode) => {
        setBrowseMode(mode);
        setBrowsing(true);
        // Start from project root — model_urn already isolates the project
        const initial = (mode === 'folder' && photos.length > 0 && photos[0].fullPath) 
            ? photos[0].fullPath.split('/').slice(0, -1).join('/') + '/'
            : ''; // empty = project root
        fetchBrowseContents(initial);
    };

    const handleSelectFromECD = (file) => {
        if (browseMode === 'link') {
            const newPhoto = {
                id: `ecd-${file.id}-${Date.now()}`,
                nodeId: file.id,
                src: `${DOCS_API}/proxy?id=${file.id}`,
                desc: file.description || file.name,
                fullPath: file.fullName,
                date: file.updated_at || new Date().toISOString(),
                displayDate: new Date(file.updated_at).toLocaleDateString()
            };
            if (onAddPhoto) onAddPhoto(newPhoto);
            setBrowsing(false);
        } else {
            // mode === 'folder'
            const folderPath = file.fullName;
            if (onRename) onRename(pinId, title, { targetPath: folderPath });
            setBrowsing(false);
            alert(`Carpeta de destino configurada: ${folderPath}`);
        }
    };

    // Ordenar fotos: Más recientes primero (por defecto)
    const sortedPhotos = [...photos].map(p => {
        // Priority: src (has GCS UUID URL) > url (may have broken fullPath URL)
        let rawSrc = p.src || p.url;
        if (rawSrc) {
            // Handle relative URLs from the backend (e.g. "/api/docs/proxy?...")
            if (rawSrc.startsWith('/api/')) {
                rawSrc = `${BACKEND_URL}${rawSrc}`;
            }
            if (rawSrc.includes('localhost:3000') && !BACKEND_URL.includes('localhost:3000')) {
                rawSrc = rawSrc.replace(/http:\/\/localhost:3000/g, BACKEND_URL);
            }
            if (rawSrc.includes('/api/docs/proxy') && !rawSrc.includes('session_token=')) {
                const tk = localStorage.getItem('visor_session_token') || 'DEMO_TOKEN';
                rawSrc += (rawSrc.includes('?') ? '&' : '?') + `session_token=${tk}`;
            }
        }
        return { ...p, src: rawSrc };
    }).sort((a, b) => {
        const dateA = new Date(a.date || 0).getTime();
        const dateB = new Date(b.date || 0).getTime();
        return dateB - dateA;
    });

    const setQuickFilter = (type) => {
        const today = new Date();
        const end = today.toISOString().split('T')[0];
        let start = '';

        if (type === 'today') {
            start = end;
        } else if (type === 'week') {
            const lastWeek = new Date();
            lastWeek.setDate(today.getDate() - 7);
            start = lastWeek.toISOString().split('T')[0];
        } else if (type === 'month') {
            const lastMonth = new Date();
            lastMonth.setMonth(today.getMonth() - 1);
            start = lastMonth.toISOString().split('T')[0];
        }

        setDateRange({ start, end });
    };

    const isVideoFile = (src) => {
        if (!src) return false;
        const low = src.toLowerCase();
        return low.endsWith('.mp4') || low.endsWith('.webm') || low.endsWith('.ogg');
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        let captureDate = new Date();
        
        // 1. Intentar extraer EXIF DateTimeOriginal
        try {
            if (!isVideoFile(file.name)) {
                const exifData = await exifr.parse(file, ['DateTimeOriginal']);
                if (exifData && exifData.DateTimeOriginal) {
                    captureDate = new Date(exifData.DateTimeOriginal);
                    console.log("[PhotoAlbum] EXIF Date extracted:", captureDate);
                } else if (file.lastModified) {
                    captureDate = new Date(file.lastModified);
                    console.log("[PhotoAlbum] Fallback to lastModified:", captureDate);
                }
            } else if (file.lastModified) {
                // Video no tiene EXIF fácil en frontend, usamos lastModified
                captureDate = new Date(file.lastModified);
            }
        } catch (err) {
            console.warn("[PhotoAlbum] Could not extract EXIF date, using current date.", err);
        }

        // Optimistic UI: Mostrar inmediatamente (con marca de subiendo)
        const temporaryUrl = URL.createObjectURL(file);
        const tempId = Date.now();
        const newPhotoTemp = {
            id: tempId,
            src: temporaryUrl,
            desc: file.name,
            date: captureDate.toISOString().split('T')[0], // Extract just the YYYY-MM-DD
            displayDate: captureDate.toLocaleDateString(),
            fullPath: 'Subiendo...', 
            isUploading: true
        };


        if (onAddPhoto) {
            onAddPhoto(newPhotoTemp);
        }

        // setIsUploading(true); // Allow background concurrent uploads
        // setUploadProgress(0);

        const uploadPath = targetPath || `Fotos_Generales/Tracking/pin_${pinId}/`;

        // 🛡️ DALUX-STYLE: Save to IndexedDB FIRST (survives page close/refresh)
        await enqueuePhoto({
            id: tempId,
            file,
            pinId,
            modelUrn,
            uploadPath,
            captureDate,
            desc: file.name
        });

        activeUploadsRef.current++;
        try {
            // 1. Get Signed URL
            const urlResp = await apiFetch(`${BACKEND_URL}/api/docs/upload-url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: file.name,
                    contentType: file.type || 'application/octet-stream',
                    model_urn: modelUrn
                })
            });
            const urlData = await urlResp.json();
            if (!urlData.success) throw new Error(urlData.error);

            // 2. Direct Upload to GCS
            await uploadFile(file, urlData.uploadUrl, {
                isDirect: true,
                onProgress: (p) => setUploadProgress(p)
            });

            // 3. Finalize upload in DB
            const completeResp = await apiFetch(`${BACKEND_URL}/api/docs/upload-confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: file.name,
                    gcs_urn: urlData.gcs_urn,
                    size_bytes: file.size,
                    mime_type: file.type || 'application/octet-stream',
                    path: uploadPath,
                    model_urn: modelUrn
                })
            });
            const completeData = await completeResp.json();

            if (completeData.success) {
                // The URL is now fixed to be a proxy URL (or signed read URL)
                const token = localStorage.getItem('visor_session_token') || 'DEMO_TOKEN';
                const permalinkUrl = `${BACKEND_URL}/api/docs/proxy?urn=${urlData.gcs_urn}&session_token=${token}`;

                if (onAddPhoto) {
                    onAddPhoto({
                        ...newPhotoTemp,
                        src: permalinkUrl,
                        fullPath: `${uploadPath}${file.name}`,
                        isUploading: false,
                        tempId: tempId
                    }, true);
                }
                // ✅ Upload complete — remove from IndexedDB queue
                await dequeuePhoto(tempId);
                showToast('✅ Foto guardada en la nube', 'success');
            } else {
                showToast(`❌ Error: ${completeData.error}`, 'error');
            }
        } catch (err) {
            console.error("Upload error:", err);
            showToast(`❌ Error de conexión: ${err.message}`, 'error');
        } finally {
            activeUploadsRef.current = Math.max(0, activeUploadsRef.current - 1);
        }
    };

    const filteredPhotos = sortedPhotos.filter(photo => {
        // 1. Filtro por tipo de medio
        const isVideo = isVideoFile(photo.src);
        if (mediaType === 'image' && isVideo) return false;
        if (mediaType === 'video' && !isVideo) return false;

        // 2. Filtro por texto (Descripción o Nombre)
        if (searchTerm) {
            const query = searchTerm.toLowerCase();
            const inDesc = (photo.desc || "").toLowerCase().includes(query);
            const inName = (photo.name || "").toLowerCase().includes(query);
            if (!inDesc && !inName) return false;
        }

        // 3. Filtro por rango de fechas
        if (!dateRange.start && !dateRange.end) return true;

        const photoTime = new Date(photo.date).setHours(0,0,0,0);
        const startTime = dateRange.start ? new Date(dateRange.start).setHours(0,0,0,0) : -Infinity;
        const endTime = dateRange.end ? new Date(dateRange.end).setHours(23,59,59,999) : Infinity;

        if (isNaN(photoTime)) return true;
        return photoTime >= startTime && photoTime <= endTime;
    });

    // Agrupar por fecha
    const groupedPhotos = filteredPhotos.reduce((groups, photo) => {
        const dateStr = photo.date ? new Date(photo.date).toLocaleDateString(undefined, {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        }) : 'Sin fecha';
        
        if (!groups[dateStr]) groups[dateStr] = [];
        groups[dateStr].push(photo);
        return groups;
    }, {});

    const content = (
        <div className={variant === 'panel' ? "album-panel-content" : "album-modal"}>
            <header className="album-header">
                <div className="album-title-group">
                    <span className="album-icon">📷</span>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isEditingTitle ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <input
                                        autoFocus
                                        className="album-title-input"
                                        value={tempTitle}
                                        onChange={(e) => setTempTitle(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                if (onRename) onRename(pinId, tempTitle);
                                                setIsEditingTitle(false);
                                            } else if (e.key === 'Escape') {
                                                setIsEditingTitle(false);
                                            }
                                        }}
                                        onBlur={() => {
                                            if (onRename) onRename(pinId, tempTitle);
                                            setIsEditingTitle(false);
                                        }}
                                    />
                                    <button className="confirm-btn" onClick={() => {
                                        if (onRename) onRename(pinId, tempTitle);
                                        setIsEditingTitle(false);
                                    }}>✓</button>
                                </div>
                            ) : (
                                <>
                                    <h3 onClick={() => {
                                        setTempTitle(title.replace(/^Zona: /, ''));
                                        setIsEditingTitle(true);
                                    }} style={{ cursor: 'pointer' }}>{title}</h3>
                                    <button
                                        className="rename-btn"
                                        onClick={() => {
                                            setTempTitle(title.replace(/^Zona: /, ''));
                                            setIsEditingTitle(true);
                                        }}
                                        title="Renombrar Zona"
                                    >
                                        ✏️
                                    </button>
                                </>
                            )}
                        </div>
                        <span className="pin-id">ID: {pinId}</span>
                    </div>
                </div>
                <div className="album-actions">
                    <button
                        onClick={() => {
                            if (window.confirm('¿Eliminar este álbum?')) {
                                if (onDelete) onDelete(pinId);
                                onClose();
                            }
                        }}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'rgba(255,255,255,0.35)',
                            cursor: 'pointer',
                            display: onDelete ? 'flex' : 'none',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '6px'
                        }}
                        title="Eliminar Álbum"
                        className="album-delete-btn"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>

                    <button
                        className={`album-filter-toggle ${showFilters ? 'active' : ''}`}
                        onClick={() => setShowFilters(!showFilters)}
                        title="Filtrar"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 3H2l8 9v7l4 3v-10L22 3z"></path>
                        </svg>
                    </button>

                    <button
                        className="upload-btn"
                        onClick={() => handleOpenBrowser('link')}
                        title="Vincular fotos del ECD"
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        Vincular
                    </button>

                    {/* 📸 Camera — opens built-in camera with device selector */}
                    <button
                        className="upload-btn"
                        onClick={() => setShowCamera(true)}
                        title="Tomar foto con cámara"
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                        Cámara
                    </button>

                    {/* 📁 Gallery/Files — opens file picker for existing photos/videos */}
                    <label className="upload-btn" title="Elegir de galería o archivos">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                        Galería
                        <input
                            type="file"
                            accept="image/*,video/*"
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                        />
                    </label>

                    <button className="album-close-btn" onClick={onClose}>✕</button>
                </div>
            </header>

            {/* Folder Configuration Label */}
            <div style={{ 
                padding: '4px 14px', 
                fontSize: '10px', 
                color: 'rgba(255,255,255,0.3)', 
                background: 'rgba(255,255,255,0.02)',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Ruta:</span>
                    <span style={{ color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
                        {targetPath || 'Automática'}
                    </span>
                </div>
                <button 
                    onClick={() => handleOpenBrowser('folder')}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: '10px', fontWeight: 500 }}
                >
                    Cambiar
                </button>
            </div>

            {showFilters && (
                <div className="album-filter-bar">
                    <div className="filter-group-text">
                        <input
                            type="text"
                            placeholder="Buscar por descripción..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="album-search-input"
                        />
                    </div>

                    <div className="filter-presets">
                        <button onClick={() => setQuickFilter('today')} className="preset-btn">Hoy</button>
                        <button onClick={() => setQuickFilter('week')} className="preset-btn">Semana</button>
                        <button onClick={() => setQuickFilter('month')} className="preset-btn">Mes</button>
                    </div>

                    <div className="media-type-filter">
                        <button onClick={() => setMediaType('all')} className={`media-btn ${mediaType === 'all' ? 'active' : ''}`}>Todo</button>
                        <button onClick={() => setMediaType('image')} className={`media-btn ${mediaType === 'image' ? 'active' : ''}`}>Fotos</button>
                        <button onClick={() => setMediaType('video')} className={`media-btn ${mediaType === 'video' ? 'active' : ''}`}>Videos</button>
                    </div>

                    <div className="filter-group">
                        <label>Desde:</label>
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                        />
                    </div>
                    <div className="filter-group">
                        <label>Hasta:</label>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                        />
                    </div>
                    <button
                        className="filter-clear-btn"
                        onClick={() => {
                            setDateRange({ start: '', end: '' });
                            setMediaType('all');
                            setSearchTerm('');
                        }}
                        title="Limpiar filtros"
                    >
                        &times; Reset
                    </button>
                    <div className="filter-results-count">
                        {filteredPhotos.length} {mediaType === 'all' ? 'items' : mediaType === 'image' ? 'fotos' : 'videos'}
                    </div>
                </div>
            )}

            {browsing ? (
                /* EMBEDDED ECD BROWSER (Phase 20) */
                <div className="album-browser-overlay" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#ffffff' }}>
                    <div className="browser-header" style={{ padding: '10px 15px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button onClick={() => setBrowsing(false)} className="text-btn" style={{ color: '#555' }}>✕ Cancelar</button>
                        <div style={{ flex: 1, fontSize: '13px', color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {browseMode === 'link' ? 'Selecciona fotos para vincular' : 'Selecciona carpeta de destino'}
                            <div style={{ fontSize: '10px', opacity: 0.7 }}>{browsePath}</div>
                        </div>
                    </div>
                    
                    <div className="browser-list" style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                        {browseLoading ? (
                             <div style={{ textAlign: 'center', padding: '40px' }}><div className="docpin-spinner" /></div>
                        ) : (
                            <>
                                {/* Subir nivel */}
                                {browsePath !== 'proyectos/' && browsePath !== '' && (
                                    <div 
                                        className="browser-item" 
                                        style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #eee', color: '#555' }}
                                        onClick={() => {
                                            const parts = browsePath.replace(/\/$/, '').split('/');
                                            parts.pop();
                                            fetchBrowseContents(parts.join('/') + '/');
                                        }}
                                    >
                                        ⬆️ .. (Subir nivel)
                                    </div>
                                )}

                                {browseFolders.map(f => (
                                    <div 
                                        key={f.fullName} 
                                        className="browser-item" 
                                        style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                        onClick={() => fetchBrowseContents(f.fullName)}
                                    >
                                        <span style={{ color: '#fbbf24' }}>📁 {f.name.replace(/\/$/, '')}</span>
                                        {browseMode === 'folder' && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleSelectFromECD(f); }}
                                                style={{ background: '#3b82f6', border: 'none', color: 'white', borderRadius: '4px', padding: '4px 8px', fontSize: '10px' }}
                                            >
                                                SELECCIONAR
                                            </button>
                                        )}
                                    </div>
                                ))}

                                {browseFiles.map(f => {
                                    const isImg = (f.mime_type || '').startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name);
                                    const isVid = (f.mime_type || '').startsWith('video/') || /\.(mp4|webm|ogg)$/i.test(f.name);
                                    
                                    if (browseMode === 'link' && !isImg && !isVid) return null;

                                    return (
                                        <div 
                                            key={f.id} 
                                            className="browser-item" 
                                            style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                            onClick={() => browseMode === 'link' && handleSelectFromECD(f)}
                                        >
                                            <span style={{ color: '#333' }}>{isImg ? '🖼️' : isVid ? '🎬' : '📄'} {f.name}</span>
                                            {browseMode === 'link' && (
                                                <span style={{ fontSize: '10px', color: '#3b82f6' }}>VINCULAR</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </div>
            ) : (
                <div className="album-content">
                {isUploading && (
                    <div className="album-uploading-overlay" style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.85)', zIndex: 10, display: 'flex',
                        flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white'
                    }}>
                        <div className="dm-progress-track" style={{ width: '200px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden', marginBottom: '12px' }}>
                            <div className="dm-progress-fill" style={{ width: `${uploadProgress}%`, height: '100%', background: '#3b82f6', transition: 'width 0.2s ease' }} />
                        </div>
                        <span style={{ fontWeight: 600, fontSize: '14px' }}>Subiendo... {uploadProgress}%</span>
                    </div>
                )}
                {photos.length === 0 ? (
                    <div className="empty-state">
                        <p className="no-photos">No hay archivos en este álbum.</p>
                        <p className="hint">Usa el botón "Subir Foto / Video" para agregar uno.</p>
                    </div>
                ) : filteredPhotos.length === 0 ? (
                    <div className="empty-state">
                        <p className="no-photos">No hay elementos que coincidan.</p>
                        <button className="text-btn" onClick={() => {
                            setDateRange({ start: '', end: '' });
                            setMediaType('all');
                        }}>Mostrar todo</button>
                    </div>
                ) : (
                    <div className="album-timeline">
                        {Object.keys(groupedPhotos).map(dateGroup => (
                            <div key={dateGroup} className="timeline-section">
                                <h4 className="timeline-header">{dateGroup}</h4>
                                <div className="photo-grid">
                                    {groupedPhotos[dateGroup].map(photo => {
                                        const isVideo = isVideoFile(photo.src);
                                        return (
                                            <div key={photo.id} className="photo-item" onClick={() => setSelectedPhoto(photo)} style={{ position: 'relative' }}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (window.confirm('¿Eliminar esta foto?')) {
                                                            if (onDeletePhoto) onDeletePhoto(pinId, photo.id);
                                                            if (selectedPhoto && selectedPhoto.id === photo.id) setSelectedPhoto(null);
                                                        }
                                                    }}
                                                    className="photo-delete-btn"
                                                    title="Eliminar"
                                                    style={{
                                                        position: 'absolute',
                                                        top: '4px',
                                                        right: '4px',
                                                        background: 'rgba(0,0,0,0.5)',
                                                        color: 'rgba(255,255,255,0.8)',
                                                        border: 'none',
                                                        borderRadius: '50%',
                                                        width: '20px',
                                                        height: '20px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        zIndex: 5,
                                                        fontSize: '12px',
                                                        lineHeight: 1
                                                    }}
                                                >
                                                    ✕
                                                </button>
                                                {isVideo ? (
                                                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                                                        <video
                                                            src={photo.src}
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                            muted
                                                            preload="metadata"
                                                        />
                                                        <div className="video-play-overlay">▶</div>
                                                    </div>
                                                ) : (
                                                    <img
                                                        src={photo.src}
                                                        alt={photo.desc}
                                                        onError={(e) => {
                                                            if (e.target.src !== FALLBACK_IMG) {
                                                                e.target.src = FALLBACK_IMG;
                                                            }
                                                        }}
                                                    />
                                                )}
                                                <div className="photo-desc">
                                                    <span className="p-desc-text">{photo.desc}</span>
                                                    <span className="p-date-text">{photo.displayDate || photo.date}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            )}

            {/* Lightbox for Selected Photo — Clean, frameless, professional */}
            {selectedPhoto && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.92)', zIndex: 99990,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                }} onClick={() => setSelectedPhoto(null)}>

                    {/* Close button — top right */}
                    <button onClick={() => setSelectedPhoto(null)} style={{
                        position: 'absolute', top: '16px', right: '16px',
                        background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                        color: '#fff', width: '36px', height: '36px', borderRadius: '50%',
                        fontSize: '18px', cursor: 'pointer', zIndex: 99991,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>✕</button>

                    {/* Counter — top center */}
                    <div style={{
                        position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)',
                        color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 500, zIndex: 99991
                    }}>
                        {(() => {
                            const idx = filteredPhotos.findIndex(p => String(p.id) === String(selectedPhoto.id));
                            return idx >= 0 ? `${idx + 1} / ${filteredPhotos.length}` : '';
                        })()}
                    </div>

                    {/* Prev arrow */}
                    {filteredPhotos.length > 1 && (
                        <button onClick={(e) => {
                            e.stopPropagation();
                            const idx = filteredPhotos.findIndex(p => String(p.id) === String(selectedPhoto.id));
                            const prev = idx > 0 ? filteredPhotos[idx - 1] : filteredPhotos[filteredPhotos.length - 1];
                            setSelectedPhoto(prev);
                        }} style={{
                            position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                            color: '#fff', width: '40px', height: '40px', borderRadius: '50%',
                            fontSize: '20px', cursor: 'pointer', zIndex: 99991,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>‹</button>
                    )}

                    {/* Next arrow */}
                    {filteredPhotos.length > 1 && (
                        <button onClick={(e) => {
                            e.stopPropagation();
                            const idx = filteredPhotos.findIndex(p => String(p.id) === String(selectedPhoto.id));
                            const next = idx < filteredPhotos.length - 1 ? filteredPhotos[idx + 1] : filteredPhotos[0];
                            setSelectedPhoto(next);
                        }} style={{
                            position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                            color: '#fff', width: '40px', height: '40px', borderRadius: '50%',
                            fontSize: '20px', cursor: 'pointer', zIndex: 99991,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>›</button>
                    )}

                    {/* Image/Video — no frame, no border, no padding */}
                    <div onClick={e => e.stopPropagation()} style={{
                        maxWidth: '92vw', maxHeight: '80vh', display: 'flex',
                        flexDirection: 'column', alignItems: 'center'
                    }}>
                        {selectedPhoto.src && (selectedPhoto.src.toLowerCase().endsWith('.mp4') || selectedPhoto.src.toLowerCase().endsWith('.webm') || selectedPhoto.src.toLowerCase().endsWith('.ogg')) ? (
                            <video
                                src={selectedPhoto.src}
                                controls
                                style={{ maxHeight: '78vh', maxWidth: '92vw', borderRadius: '2px' }}
                            />
                        ) : (
                            <img
                                src={selectedPhoto.src}
                                alt={selectedPhoto.desc || ''}
                                onError={(e) => e.target.src = FALLBACK_IMG}
                                style={{ maxHeight: '78vh', maxWidth: '92vw', objectFit: 'contain', borderRadius: '2px' }}
                            />
                        )}

                        {/* Caption — minimal */}
                        <div style={{
                            marginTop: '10px', color: 'rgba(255,255,255,0.8)',
                            fontSize: '13px', textAlign: 'center', maxWidth: '90vw',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}>
                            <span>{selectedPhoto.desc || ''}</span>
                            {selectedPhoto.displayDate && (
                                <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: '10px' }}>
                                    {selectedPhoto.displayDate}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 📸 Built-in Camera with Device Selector */}
            <CameraCapture
                isOpen={showCamera}
                onClose={() => setShowCamera(false)}
                onCapture={(file) => {
                    // Feed captured photo through the same upload pipeline
                    handleFileChange({ target: { files: [file] } });
                }}
            />

            {/* 🔔 Toast Notification for Upload Status */}
            {toastMsg && (
                <div style={{
                    position: 'fixed',
                    bottom: '80px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: toastMsg.type === 'success' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)',
                    color: 'white',
                    padding: '12px 24px',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: '600',
                    zIndex: 99999,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                    backdropFilter: 'blur(8px)',
                    animation: 'fadeInUp 0.3s ease',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap'
                }}>
                    {toastMsg.text}
                </div>
            )}
        </div>
    );

    if (variant === 'panel') {
        return content;
    }

    return (
        <div className="album-overlay">
            {content}
        </div>
    );
};

export default PhotoAlbumModal;
