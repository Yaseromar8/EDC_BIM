
import React, { useState } from 'react';
import './PhotoAlbumModal.css';
import { uploadFile } from '../services/uploadService';

const MOCK_PHOTOS = [
    { id: 1, src: '/photo1.jpg', desc: 'Vaciado de losa' }, // Placeholder
    { id: 2, src: '/photo2.jpg', desc: 'Encofrado lateral' }, // Placeholder
    { id: 3, src: '/photo3.jpg', desc: 'Armado de acero' }, // Placeholder
    { id: 4, src: '/photo4.jpg', desc: 'Vista general' }, // Placeholder
    { id: 5, src: '/photo5.jpg', desc: 'Detalle constructivo' }, // Placeholder
    { id: 6, src: '/photo6.jpg', desc: 'Panorama' }, // Placeholder
];

// Fallback image if source missing
const FALLBACK_IMG = 'https://via.placeholder.com/300x200?text=No+Image';

const PhotoAlbumModal = ({ isOpen, onClose, pinId, title = "Album de Fotos", photos = [], onAddPhoto, variant = 'modal', onDelete, onDeletePhoto, onRename, modelUrn = 'global', targetPath = '', projectPrefix = 'proyectos/' }) => {
    if (!isOpen) return null;

    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [tempTitle, setTempTitle] = useState("");
    const [selectedPhoto, setSelectedPhoto] = useState(null);
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

    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
    const DOCS_API = `${BACKEND_URL}/api/docs`;

    const fetchBrowseContents = async (path) => {
        setBrowseLoading(true);
        try {
            const url = `${DOCS_API}/list?path=${encodeURIComponent(path)}&model_urn=${encodeURIComponent(modelUrn)}`;
            const res = await fetch(url);
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
        // Start from project root if possible, or pin's targetPath
        const initial = (mode === 'folder' && photos.length > 0 && photos[0].fullPath) 
            ? photos[0].fullPath.split('/').slice(0, -1).join('/') + '/'
            : projectPrefix; 
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
    const sortedPhotos = [...photos].sort((a, b) => {
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

        // Optimistic UI: Mostrar inmediatamente (con marca de subiendo)
        const temporaryUrl = URL.createObjectURL(file);
        const tempId = Date.now();
        const newPhotoTemp = {
            id: tempId,
            src: temporaryUrl,
            desc: file.name,
            date: new Date().toISOString().split('T')[0],
            displayDate: new Date().toLocaleDateString(),
            fullPath: 'Subiendo...', 
            isUploading: true
        };

        if (onAddPhoto) {
            onAddPhoto(newPhotoTemp);
        }

        setIsUploading(true);
        setUploadProgress(0);

        const uploadPath = targetPath || `Fotos_Generales/Tracking/pin_${pinId}/`;

        try {
            // 1. Get Signed URL
            const urlResp = await fetch(`${BACKEND_URL}/api/docs/upload-url`, {
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
            const completeResp = await fetch(`${BACKEND_URL}/api/docs/upload-complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: file.name,
                    gcsUrn: urlData.gcsUrn,
                    sizeBytes: file.size,
                    contentType: file.type || 'application/octet-stream',
                    path: uploadPath,
                    model_urn: modelUrn
                })
            });
            const completeData = await completeResp.json();

            if (completeData.success) {
                // The URL is now fixed to be a proxy URL (or signed read URL)
                const permalinkUrl = `${BACKEND_URL}/api/docs/proxy?urn=${urlData.gcsUrn}`;

                if (onAddPhoto) {
                    onAddPhoto({
                        ...newPhotoTemp,
                        src: permalinkUrl,
                        fullPath: `${uploadPath}${file.name}`,
                        isUploading: false,
                        tempId: tempId
                    }, true);
                }
            } else {
                alert(`Error al registrar la foto: ${completeData.error}`);
            }
        } catch (err) {
            console.error("Upload error:", err);
            alert(`Error de conexión al subir la foto: ${err.message}`);
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
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
                            color: '#ef4444',
                            cursor: 'pointer',
                            display: onDelete ? 'flex' : 'none',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '8px',
                            marginRight: '8px',
                            opacity: 0.8
                        }}
                        title="Eliminar Álbum"
                        className="album-delete-btn"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>

                    <button
                        className={`album-filter-toggle ${showFilters ? 'active' : ''}`}
                        onClick={() => setShowFilters(!showFilters)}
                        title="Filtrar por fecha"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 3H2l8 9v7l4 3v-10L22 3z"></path>
                        </svg>
                    </button>

                    <button
                        className="album-link-btn"
                        onClick={() => handleOpenBrowser('link')}
                        title="Vincular fotos del ECD"
                        style={{
                            background: 'rgba(59, 130, 246, 0.2)',
                            border: '1px solid #3b82f6',
                            color: '#60a5fa',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        🔗 Vincular ECD
                    </button>

                    <label className="upload-btn">
                        + Subir Foto / Video
                        <input
                            type="file"
                            accept="image/*,video/*"
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                        />
                    </label>
                    <button className="album-close-btn" onClick={onClose}>&times;</button>
                </div>
            </header>

            {/* Folder Configuration Label (Phase 20) */}
            <div className="album-target-info" style={{ 
                padding: '4px 16px', 
                fontSize: '11px', 
                color: '#888', 
                background: '#1a1b1e',
                borderBottom: '1px solid #333',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📁 Alojamiento:</span>
                    <span style={{ color: '#aaa', fontStyle: 'italic' }}>
                        {targetPath || 'Ruta automática'}
                    </span>
                </div>
                <button 
                    onClick={() => handleOpenBrowser('folder')}
                    style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}
                >
                    CAMBIAR CARPETA
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
                <div className="album-browser-overlay" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0f1115' }}>
                    <div className="browser-header" style={{ padding: '10px 15px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button onClick={() => setBrowsing(false)} className="text-btn" style={{ color: '#888' }}>✕ Cancelar</button>
                        <div style={{ flex: 1, fontSize: '13px', color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                                        style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #222', color: '#ccc' }}
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
                                        style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
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
                                            style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                            onClick={() => browseMode === 'link' && handleSelectFromECD(f)}
                                        >
                                            <span style={{ color: '#fff' }}>{isImg ? '🖼️' : isVid ? '🎬' : '📄'} {f.name}</span>
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
                                                        if (window.confirm('¿Eliminar definitivamente esta foto?')) {
                                                            if (onDeletePhoto) onDeletePhoto(pinId, photo.id);
                                                            if (selectedPhoto && selectedPhoto.id === photo.id) setSelectedPhoto(null);
                                                        }
                                                    }}
                                                    className="photo-delete-btn"
                                                    title="Eliminar Foto"
                                                    style={{
                                                        position: 'absolute',
                                                        top: '6px',
                                                        right: '6px',
                                                        background: 'rgba(239, 68, 68, 0.9)',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '50%',
                                                        width: '24px',
                                                        height: '24px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        zIndex: 5,
                                                        fontSize: '16px',
                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                                                        fontWeight: 'bold'
                                                    }}
                                                >
                                                    &times;
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
                                                        onError={(e) => e.target.src = FALLBACK_IMG}
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

            {/* Lightbox for Selected Photo */}
            {selectedPhoto && (
                <div className="lightbox-overlay" onClick={() => setSelectedPhoto(null)}>
                    <div className="lightbox-content" onClick={e => e.stopPropagation()}>
                        <button className="lightbox-close" onClick={() => setSelectedPhoto(null)}>&times;</button>
                        {selectedPhoto.src && (selectedPhoto.src.toLowerCase().endsWith('.mp4') || selectedPhoto.src.toLowerCase().endsWith('.webm') || selectedPhoto.src.toLowerCase().endsWith('.ogg')) ? (
                            <video
                                src={selectedPhoto.src}
                                controls
                                style={{ maxHeight: '80vh', maxWidth: '100%' }}
                            />
                        ) : (
                            <img src={selectedPhoto.src} alt="Detalle ampliado" onError={(e) => e.target.src = FALLBACK_IMG} />
                        )}
                        <div className="lightbox-caption">
                            {selectedPhoto.desc || "Sin descripción"}
                            {selectedPhoto.displayDate && ` • ${selectedPhoto.displayDate}`}
                        </div>
                    </div>
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
