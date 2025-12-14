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

const SaveIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v13a2 2 0 0 1-2 2z"></path>
        <polyline points="17 21 17 13 7 13 7 21"></polyline>
        <polyline points="7 3 7 8 15 8"></polyline>
    </svg>
);

const ViewsPanel = ({ onSaveView, onLoadView, onDeleteView, views, onClose }) => {
    const [isCreating, setIsCreating] = useState(false);
    const [newViewName, setNewViewName] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const handleSave = () => {
        if (!newViewName.trim()) return;
        onSaveView(newViewName);
        setNewViewName('');
        setIsCreating(false);
    };

    const filteredViews = views.filter(v =>
        v.name.toLowerCase().includes(searchTerm.toLowerCase())
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
                        <button className="primary-btn sm" onClick={handleSave}>Save</button>
                        <button className="secondary-btn sm" onClick={() => setIsCreating(false)}>X</button>
                    </div>
                ) : (
                    <>
                        <button className="primary-btn wide" onClick={() => setIsCreating(true)}>
                            <span className="btn-icon"><SaveIcon /></span> Save
                        </button>
                        <button className="secondary-btn wide">
                            + Save As...
                        </button>
                    </>
                )}
            </div>

            <div className="views-tabs">
                <button className="tab active">List</button>
                <button className="tab">Gallery</button>
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
                    <div key={view.id} className="view-list-item" onClick={() => onLoadView(view)}>
                        <span className="view-name-text">{view.name}</span>
                        <div className="view-item-actions">
                            <button
                                className="more-btn"
                                onClick={(e) => { e.stopPropagation(); onDeleteView(view.id); }}
                                title="Delete"
                            >
                                <MoreIcon />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ViewsPanel;
