
import React, { useState } from 'react';
import './PhotoAlbumModal.css';

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

const PhotoAlbumModal = ({ isOpen, onClose, pinId, title = "Album de Fotos", photos = [], onAddPhoto, variant = 'modal', onDelete, onRename, modelUrn = 'global' }) => {
    if (!isOpen) return null;

    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [tempTitle, setTempTitle] = useState("");
    const [selectedPhoto, setSelectedPhoto] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Optimistic UI: Mostrar inmediatamente
        const temporaryUrl = URL.createObjectURL(file);
        const tempId = Date.now();
        const newPhotoTemp = {
            id: tempId,
            src: temporaryUrl,
            desc: file.name,
            date: new Date().toISOString().split('T')[0],
            displayDate: new Date().toLocaleDateString(),
            fullPath: 'Subiendo...', // Indicador
            isUploading: true
        };

        if (onAddPhoto) {
            onAddPhoto(newPhotoTemp);
        }

        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', `Fotos_Generales/Tracking/pin_${pinId}/`);
        formData.append('model_urn', modelUrn);

        try {
            const res = await fetch(`${BACKEND_URL}/api/docs/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (data.success) {
                // Background upload exitosa, aquí se debería informar al padre para que 
                // reemplace el "isUploading: true" y el "src" local por el de GCS.
                // Como workaround simple, el padre al recargar o al terminar el useEffect
                // verá la URL real. Si queremos reemplazar mutando:
                if (onAddPhoto) {
                    onAddPhoto({
                        ...newPhotoTemp,
                        src: data.url,
                        fullPath: data.fullName,
                        isUploading: false,
                        tempId: tempId
                    }, true); // El padre necesita soportar update, o lo forzamos.
                }
            } else {
                alert(`Error al subir la foto en 2do plano: ${data.error}`);
            }
        } catch (err) {
            console.error("Upload error:", err);
            alert("Error de conexión al subir la foto en 2do plano.");
        }
    };

    const filteredPhotos = photos.filter(photo => {
        if (!dateRange.start && !dateRange.end) return true;

        // Try to get a comparable date string (YYYY-MM-DD or standard)
        let pDate = photo.date || "";

        // If it's the old toLocaleDateString format (e.g. DD/MM/YYYY or MM/DD/YYYY), it's harder to compare
        // but let's assume we want to store standard dates now.
        // If we have a timestamp or standard YYYY-MM-DD, parsing works:
        const photoTime = new Date(pDate).getTime();
        const startTime = dateRange.start ? new Date(dateRange.start).getTime() : -Infinity;
        const endTime = dateRange.end ? new Date(dateRange.end + "T23:59:59").getTime() : Infinity;

        if (isNaN(photoTime)) return true; // Show photos with unparseable dates

        return photoTime >= startTime && photoTime <= endTime;
    });

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

            {showFilters && (
                <div className="album-filter-bar">
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
                        onClick={() => setDateRange({ start: '', end: '' })}
                        title="Limpiar filtros"
                    >
                        Limpiar
                    </button>
                    <div className="filter-results-count">
                        {filteredPhotos.length} de {photos.length} fotos
                    </div>
                </div>
            )}

            <div className="album-content">
                {isUploading && (
                    <div className="album-uploading-overlay" style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.7)', zIndex: 10, display: 'flex',
                        flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white'
                    }}>
                        <div className="docpin-spinner" style={{ marginBottom: '10px' }} />
                        <span>Subiendo archivo y registrando en inventario...</span>
                    </div>
                )}
                {photos.length === 0 ? (
                    <div className="empty-state">
                        <p className="no-photos">No hay archivos en este álbum.</p>
                        <p className="hint">Usa el botón "Subir Foto / Video" para agregar uno.</p>
                    </div>
                ) : filteredPhotos.length === 0 ? (
                    <div className="empty-state">
                        <p className="no-photos">No hay fotos que coincidan con el rango de fechas.</p>
                        <button className="text-btn" onClick={() => setDateRange({ start: '', end: '' })}>Mostrar todas</button>
                    </div>
                ) : (
                    <div className="photo-grid">
                        {filteredPhotos.map(photo => {
                            const isVideo = photo.src && (photo.src.toLowerCase().endsWith('.mp4') || photo.src.toLowerCase().endsWith('.webm') || photo.src.toLowerCase().endsWith('.ogg'));
                            return (
                                <div key={photo.id} className="photo-item" onClick={() => setSelectedPhoto(photo)}>
                                    {isVideo ? (
                                        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                                            <video
                                                src={photo.src}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                muted
                                                preload="metadata"
                                            />
                                            <div className="video-play-overlay">
                                                ▶
                                            </div>
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
                )}
            </div>

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
