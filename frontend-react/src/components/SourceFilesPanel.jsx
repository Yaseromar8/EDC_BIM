import React, { useState } from 'react';
import './SourceFilesPanel.css';

// Icons
const PlusIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
);

const ChevronDown = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
);

const ChevronRight = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
);

const EyeIcon = ({ off }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {off ? (
            <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
            </>
        ) : (
            <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </>
        )}
    </svg>
);

const StarIcon = ({ filled }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    </svg>
);

const MoreIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="1"></circle>
        <circle cx="19" cy="12" r="1"></circle>
        <circle cx="5" cy="12" r="1"></circle>
    </svg>
);

const SortIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
);

const RevitIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="3" fill="#0696D7" />
        <path d="M8 7h3.5a3.5 3.5 0 0 1 3.5 3.5v0a3.5 3.5 0 0 1-3.5 3.5H9v4H7V7h1zm1 5h2.5a1.5 1.5 0 0 0 0-3H9v3z" fill="white" />
    </svg>
);

const PhaseIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
);

const ClockIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
    </svg>
);

const UpdateIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 4v6h-6" />
        <path d="M1 20v-6h6" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
);

const RelinkIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" opacity="0.5" strokeDasharray="4 4" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
);

const DeleteIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
);

// Helper to extract version from URN
const getVersionFromUrn = (urn) => {
    try {
        if (!urn) return '1';
        const decoded = atob(urn);
        const match = decoded.match(/version=(\d+)/);
        return match ? match[1] : '1';
    } catch (e) {
        return '1';
    }
};

// Helper for relative time
const getTimeAgo = (dateString) => {
    if (!dateString) return 'recently';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return "just now";
};

const SourceFilesPanel = ({ models, hiddenModels = [], onImport, onRemove, onToggleVisibility, modelViews, activeViewableGuids, onLoadView }) => {
    // Local state for UI only (expanded items)
    const [expandedModels, setExpandedModels] = useState({});
    const [activeMenu, setActiveMenu] = useState(null);

    const toggleExpand = (urn) => {
        setExpandedModels(prev => ({ ...prev, [urn]: !prev[urn] }));
    };

    return (
        <div className="source-files-panel">
            <div className="sfp-header">
                <h3>SOURCE FILES</h3>
                <button className="sfp-import-btn" onClick={onImport}>
                    <PlusIcon /> Import Model
                </button>
            </div>

            <div className="sfp-controls">
                <button className="sfp-control-btn">
                    Main Model <span className="sfp-chevron"><ChevronDown /></span>
                </button>
                <button className="sfp-sort-btn" title="Sort">
                    <SortIcon />
                </button>
            </div>

            <div className="sfp-list">
                {models.length === 0 && (
                    <div className="sfp-empty">No models loaded</div>
                )}
                {models.map(model => {
                    const isHidden = hiddenModels.includes(model.urn);
                    return (
                        <div key={model.urn} className="sfp-item">
                            <div className="sfp-item-row" onClick={() => toggleExpand(model.urn)}>
                                <button className="sfp-list-chevron">
                                    {expandedModels[model.urn] ? <ChevronDown /> : <ChevronRight />}
                                </button>
                                <span className="sfp-label" title={model.label}>{model.label}</span>

                                <div className="sfp-actions">
                                    <button className="sfp-action-btn star" title="Favorite">
                                        <StarIcon />
                                    </button>
                                    <button
                                        className={`sfp-action-btn eye ${isHidden ? 'off' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); onToggleVisibility(model.urn); }}
                                        title={isHidden ? "Show model" : "Hide model"}
                                    >
                                        <EyeIcon off={isHidden} />
                                    </button>
                                    <div className="sfp-menu-wrapper">
                                        <button
                                            className="sfp-action-btn more"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveMenu(activeMenu === model.urn ? null : model.urn);
                                            }}
                                        >
                                            <MoreIcon />
                                        </button>
                                        {activeMenu === model.urn && (
                                            <div className="sfp-dropdown">
                                                <button onClick={(e) => { e.stopPropagation(); setActiveMenu(null); }}>
                                                    <span className="sfp-menu-icon"><UpdateIcon /></span> Update
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); setActiveMenu(null); }}>
                                                    <span className="sfp-menu-icon"><RelinkIcon /></span> Relink
                                                </button>
                                                <hr className="sfp-menu-separator" />
                                                <button
                                                    className="delete-option"
                                                    onClick={(e) => { e.stopPropagation(); onRemove(model.urn); setActiveMenu(null); }}
                                                >
                                                    <span className="sfp-menu-icon"><DeleteIcon /></span> Delete
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {expandedModels[model.urn] && (
                                <div className="sfp-details">
                                    <div className="sfp-detail-row file-info">
                                        <RevitIcon />
                                        <span>{model.label} (v{getVersionFromUrn(model.urn)})</span>
                                    </div>

                                    {modelViews && modelViews[model.urn] && modelViews[model.urn].length > 0 && (
                                        <div className="sfp-detail-row view-row">
                                            <span className="detail-icon" style={{ fontSize: 14 }}>👁️</span>
                                            <select
                                                className="sfp-view-select"
                                                value={activeViewableGuids?.[model.urn] || modelViews[model.urn][0]?.guid || ''}
                                                onChange={(e) => onLoadView?.(model.urn, e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {modelViews[model.urn].map(v => (
                                                    <option key={v.guid} value={v.guid}>{v.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div className="sfp-detail-row">
                                        <PhaseIcon />
                                        <span>Phase: Nueva construcción</span>
                                    </div>
                                    <div className="sfp-detail-row">
                                        <ClockIcon />
                                        <span>updated {getTimeAgo(model.added_at)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {
                activeMenu && (
                    <div className="sfp-menu-overlay" onClick={() => setActiveMenu(null)}></div>
                )
            }
        </div >
    );
};

export default SourceFilesPanel;
