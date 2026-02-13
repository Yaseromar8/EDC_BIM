
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

const PhotoAlbumModal = ({ isOpen, onClose, pinId, title = "Album de Fotos", photos = [], onAddPhoto, variant = 'modal' }) => {
    if (!isOpen) return null;

    const [selectedPhoto, setSelectedPhoto] = useState(null);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Preview
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
            const newPhoto = {
                id: Date.now(),
                src: loadEvent.target.result,
                desc: file.name,
                date: new Date().toLocaleDateString()
            };
            if (onAddPhoto) {
                onAddPhoto(newPhoto);
            }
        };
        reader.readAsDataURL(file);
    };

    const content = (
        <div className={variant === 'panel' ? "album-panel-content" : "album-modal"}>
            <header className="album-header">
                <div className="album-title-group">
                    <span className="album-icon">📷</span>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h3>{title}</h3>
                        <span className="pin-id">ID: {pinId}</span>
                    </div>
                </div>
                <div className="album-actions">
                    <label className="upload-btn">
                        + Subir Foto
                        <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                        />
                    </label>
                    <button className="album-close-btn" onClick={onClose}>&times;</button>
                </div>
            </header>

            <div className="album-content">
                {photos.length === 0 ? (
                    <div className="empty-state">
                        <p className="no-photos">No hay fotos en este álbum.</p>
                        <p className="hint">Usa el botón "Subir Foto" para agregar una.</p>
                    </div>
                ) : (
                    <div className="photo-grid">
                        {photos.map(photo => (
                            <div key={photo.id} className="photo-item" onClick={() => setSelectedPhoto(photo)}>
                                <img
                                    src={photo.src}
                                    alt={photo.desc}
                                    onError={(e) => e.target.src = FALLBACK_IMG}
                                />
                                <div className="photo-desc">{photo.desc}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Lightbox for Selected Photo */}
            {selectedPhoto && (
                <div className="lightbox-overlay" onClick={() => setSelectedPhoto(null)}>
                    <div className="lightbox-content" onClick={e => e.stopPropagation()}>
                        <img src={selectedPhoto.src} alt={selectedPhoto.desc} />
                        <p>{selectedPhoto.desc}</p>
                        <button className="lightbox-close" onClick={() => setSelectedPhoto(null)}>✕</button>
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
