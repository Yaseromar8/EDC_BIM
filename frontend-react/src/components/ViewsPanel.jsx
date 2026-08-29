import React, { useState } from 'react';
import './ViewsPanel.css';

// Simple Icons
const SearchIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
);

const SortIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
); // Placeholder for sort/filter

const MoreIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="1"></circle>
        <circle cx="19" cy="12" r="1"></circle>
        <circle cx="5" cy="12" r="1"></circle>
    </svg>
);

const ShareIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
        <polyline points="16 6 12 2 8 6"></polyline>
        <line x1="12" y1="2" x2="12" y2="15"></line>
    </svg>
);

const SaveIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v13a2 2 0 0 1-2 2z"></path>
        <polyline points="17 21 17 13 7 13 7 21"></polyline>
        <polyline points="7 3 7 8 15 8"></polyline>
    </svg>
);

const TrashIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
);

const CheckIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
);

const ViewsPanel = ({ onSaveView, onLoadView, onDeleteView, views, onClose }) => {
    // Nada de window.confirm ni window.alert. Los dos avisos del navegador se
    // veian mal (con el dominio delante y en ingles), pero el problema de
    // fondo era otro: el de borrar no decia QUE vista se borraba, y el de
    // compartir obligaba a leer el enlace en un cuadro que se cierra -- si el
    // copiado al portapapeles fallaba, el enlace se perdia. Ahora las dos
    // cosas pasan en la propia fila, donde el usuario ya esta mirando.
    const [borrando, setBorrando] = useState(null);   // id de la vista a confirmar
    const [enlaceDe, setEnlaceDe] = useState(null);   // id de la vista compartida
    const [copiado, setCopiado] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newViewName, setNewViewName] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const handleSave = () => {
        if (!newViewName.trim()) return;
        onSaveView(newViewName);
        setNewViewName('');
        setIsCreating(false);
    };

    const urlDeVista = (view) =>
        `${window.location.origin}${window.location.pathname}?shareView=${view.id}`;

    const copiarAlPortapapeles = async (texto) => {
        try {
            await navigator.clipboard.writeText(texto);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2200);
        } catch {
            // El portapapeles se puede denegar por permisos. No se avisa de
            // nada: el enlace queda a la vista para copiarlo a mano, que es lo
            // unico que hace falta.
            setCopiado(false);
        }
    };

    const handleShare = (view, e) => {
        e.stopPropagation();
        setBorrando(null);
        setEnlaceDe(prev => (prev === view.id ? null : view.id));
        setCopiado(false);
        copiarAlPortapapeles(urlDeVista(view));
    };

    const filteredViews = views.filter(v =>
        (v.name && v.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="views-panel-popover">
            <header className="views-popover-header">
                <h3>VIEWS</h3>
                <button className="close-btn" onClick={onClose}>×</button>
            </header>

            <div className="views-popover-subtext">
                PROTOCOLOS
            </div>

            <div className="views-actions-row">
                {isCreating ? (
                    <div className="view-creator-inline">
                        <input
                            type="text"
                            placeholder="View Name"
                            value={newViewName}
                            onChange={e => setNewViewName(e.target.value)}
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleSave()}
                        />
                        <button type="button" className="primary-btn sm" onClick={handleSave}>Save</button>
                        <button type="button" className="secondary-btn sm" onClick={() => setIsCreating(false)}>X</button>
                    </div>
                ) : (
                    <>
                        <button type="button" className="primary-btn wide" onClick={() => setIsCreating(true)}>
                            <span className="btn-icon"><SaveIcon /></span> Save
                        </button>
                        <button type="button" className="secondary-btn wide">
                            + Save As...
                        </button>
                    </>
                )}
            </div>

            <div className="views-tabs">
                <button type="button" className="tab active">List</button>
                <button type="button" className="tab">Gallery</button>
            </div>

            <div className="views-search-bar">
                <span className="search-icon"><SearchIcon /></span>
                <input
                    type="text"
                    placeholder="Search views..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <span className="sort-icon"><SortIcon /></span>
            </div>

            <div className="views-list-container">
                {filteredViews.length === 0 && (
                    <div className="views-empty">No views found.</div>
                )}
                {filteredViews.map(view => (
                    <div key={view.id} className="view-fila">
                        <div className="view-list-item" onClick={() => onLoadView(view)}>
                            <span className="view-name-text">{view.name}</span>
                            <div className="view-item-actions">
                                <button
                                    className={`more-btn${enlaceDe === view.id ? ' esta-activo' : ''}`}
                                    onClick={(e) => handleShare(view, e)}
                                    title="Compartir esta vista"
                                    style={{ marginRight: '6px' }}
                                >
                                    <ShareIcon />
                                </button>
                                <button
                                    className="more-btn es-peligro"
                                    onClick={(e) => { e.stopPropagation(); setEnlaceDe(null); setBorrando(view.id); }}
                                    title="Eliminar esta vista"
                                >
                                    <TrashIcon />
                                </button>
                            </div>
                        </div>

                        {borrando === view.id && (
                            <div className="view-tira view-tira-borrar">
                                <span>¿Eliminar <b>{view.name}</b>?</span>
                                <div className="view-tira-botones">
                                    <button type="button" className="tira-btn"
                                        onClick={(e) => { e.stopPropagation(); setBorrando(null); }}>
                                        Cancelar
                                    </button>
                                    <button type="button" className="tira-btn tira-btn-peligro"
                                        onClick={(e) => { e.stopPropagation(); setBorrando(null); onDeleteView(view.id); }}>
                                        Eliminar
                                    </button>
                                </div>
                            </div>
                        )}

                        {enlaceDe === view.id && (
                            <div className="view-tira view-tira-enlace">
                                <div className="view-tira-cabecera">
                                    {copiado
                                        ? <span className="tira-copiado"><CheckIcon /> Enlace copiado</span>
                                        : <span>Enlace de solo lectura</span>}
                                    <button type="button" className="tira-cerrar"
                                        onClick={(e) => { e.stopPropagation(); setEnlaceDe(null); }}
                                        title="Cerrar">×</button>
                                </div>
                                <input
                                    className="tira-enlace-campo"
                                    readOnly
                                    value={urlDeVista(view)}
                                    onClick={(e) => { e.stopPropagation(); e.target.select(); }}
                                />
                                <button type="button" className="tira-btn tira-btn-copiar"
                                    onClick={(e) => { e.stopPropagation(); copiarAlPortapapeles(urlDeVista(view)); }}>
                                    {copiado ? 'Copiado' : 'Copiar'}
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ViewsPanel;
