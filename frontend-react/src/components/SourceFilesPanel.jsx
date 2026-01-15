import React, { useState } from 'react';
import './SourceFilesPanel.css';

// --- TANDEM STYLE ICONS (Extracted from reference) ---

const ChevronRight = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="sfp-icon">
        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
    </svg>
);

const ChevronDown = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="sfp-icon">
        <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6-1.41-1.41z" />
    </svg>
);

const StarIcon = ({ filled }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "#fbbf24" : "currentColor"} className="sfp-icon">
        <path d="M20.54,10.76l-3.73,3.79.94,5a.76.76,0,0,1-.29.74.74.74,0,0,1-.45.15.76.76,0,0,1-.33-.08L12,18,7.31,20.34a.76.76,0,0,1-.33.08.74.74,0,0,1-.45-.15.76.76,0,0,1-.29-.74l1-5L3.47,10.76a.75.75,0,0,1,.41-1.27L9,8.65,11.33,4l0,0a.69.69,0,0,1,.28-.28l.16-.07a.75.75,0,0,1,.42,0l.16.07a.69.69,0,0,1,.28.28l0,0L15,8.65l5.11.84a.74.74,0,0,1,.59.51A.76.76,0,0,1,20.54,10.76Z" />
    </svg>
);

const EyeIcon = ({ off }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="sfp-icon">
        {off ? (
            <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.804 11.804 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" />
        ) : (
            <path d="M22.74,11.84a.43.43,0,0,0,0-.05C22.34,10,17.33,5.08,12,5.08s-10.42,5-10.73,6.76a.88.88,0,0,0,0,.16.66.66,0,0,0,0,.23c.42,1.78,5.32,6.61,10.56,6.69h.3c5.26-.08,10.18-5,10.57-6.71a.11.11,0,0,0,0-.05.65.65,0,0,0,0-.32ZM12,17.43c-4.55,0-8.81-4.36-9.23-5.43C3.23,10.91,7.49,6.58,12,6.58s8.81,4.36,9.23,5.43C20.79,13.1,16.54,17.43,12,17.43ZM12,16a4,4,0,1,1,4-4A4,4,0,0,1,12,16ZM12,9.5a2.51,2.51,0,1,0,2.5,2.5A2.5,2.5,0,0,0,12,9.5Z" />
        )}
    </svg>
);

const MoreIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="sfp-icon">
        <path d="M6,10.5A1.5,1.5,0,1,1,4.5,12,1.5,1.5,0,0,1,6,10.5ZM10.5,12A1.5,1.5,0,1,0,12,10.5,1.5,1.5,0,0,0,10.5,12Zm6,0A1.5,1.5,0,1,0,18,10.5,1.5,1.5,0,0,0,16.5,12Z" />
    </svg>
);

const RevitIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="sfp-icon-rvt">
        <rect x="2" y="2" width="20" height="20" rx="4" fill="#0696D7" />
        <path d="M8 7h3.5a3.5 3.5 0 0 1 3.5 3.5v0a3.5 3.5 0 0 1-3.5 3.5H9v4H7V7h1zm1 5h2.5a1.5 1.5 0 0 0 0-3H9v3z" fill="white" />
    </svg>
);

const PhaseIcon = () => (
    <svg width="14" height="14" viewBox="0 0 8 8" fill="currentColor" className="sfp-icon">
        <path d="M5.70488 4.23001L4.23488 5.73001C4.19951 5.76664 4.15695 5.79558 4.10988 5.81501C4.06434 5.83554 4.01483 5.84579 3.96488 5.84501C3.91499 5.84517 3.86561 5.83495 3.81988 5.81501C3.77347 5.79438 3.73113 5.76559 3.69488 5.73001L2.22988 4.23001C2.15965 4.1597 2.12021 4.06439 2.12021 3.96501C2.12021 3.86564 2.15965 3.77032 2.22988 3.70001C2.30082 3.63098 2.3959 3.59236 2.49488 3.59236C2.59386 3.59236 2.68894 3.63098 2.75988 3.70001L3.57988 4.55501V1.00001C3.57988 0.900555 3.61939 0.805173 3.68971 0.734846C3.76004 0.66452 3.85542 0.625011 3.95488 0.625011C4.05434 0.625011 4.14972 0.66452 4.22005 0.734846C4.29037 0.805173 4.32988 0.900555 4.32988 1.00001V4.56501L5.15488 3.71001C5.22582 3.64098 5.3209 3.60236 5.41988 3.60236C5.51886 3.60236 5.61394 3.64098 5.68488 3.71001C5.75485 3.77726 5.79603 3.86901 5.79976 3.96598C5.80349 4.06295 5.76948 4.15759 5.70488 4.23001ZM7.86988 6.00001V2.00001C7.86856 1.50446 7.67112 1.02959 7.32071 0.67918C6.9703 0.328772 6.49543 0.131331 5.99988 0.130012C5.90042 0.130012 5.80504 0.16952 5.73471 0.239846C5.66439 0.310173 5.62488 0.405555 5.62488 0.505012C5.62488 0.604468 5.66439 0.69985 5.73471 0.770176C5.80504 0.840503 5.90042 0.880012 5.99988 0.880012C6.29652 0.881327 6.58063 0.999749 6.79039 1.20951C7.00014 1.41926 7.11856 1.70337 7.11988 2.00001V6.00001C7.12054 6.14775 7.09209 6.29417 7.03616 6.43091C6.98023 6.56766 6.89792 6.69204 6.79391 6.79697C6.68991 6.9019 6.56626 6.98532 6.43002 7.04247C6.29378 7.09961 6.14762 7.12936 5.99988 7.13001H1.99988C1.8513 7.13067 1.70406 7.1019 1.56667 7.04534C1.42927 6.98879 1.30444 6.90558 1.19937 6.80052C1.09431 6.69546 1.0111 6.57062 0.954548 6.43323C0.897994 6.29583 0.869218 6.14859 0.86988 6.00001V2.00001C0.870535 1.85227 0.900283 1.70611 0.957426 1.56987C1.01457 1.43363 1.09799 1.30998 1.20292 1.20598C1.30785 1.10198 1.43224 1.01966 1.56898 0.963731C1.70572 0.907801 1.85214 0.879353 1.99988 0.880012C2.09934 0.880012 2.19472 0.840503 2.26504 0.770176C2.33537 0.69985 2.37488 0.604468 2.37488 0.505012C2.37488 0.405555 2.33537 0.310173 2.26504 0.239846C2.19472 0.16952 2.09934 0.130012 1.99988 0.130012C1.75365 0.129354 1.5097 0.177201 1.28197 0.270822C1.05423 0.364443 0.847162 0.502003 0.672588 0.675649C0.498014 0.849294 0.359351 1.05562 0.264517 1.28286C0.169683 1.51009 0.120535 1.75378 0.11988 2.00001V6.00001C0.11922 6.24708 0.167398 6.49185 0.261643 6.72024C0.355888 6.94863 0.494342 7.15614 0.669048 7.33084C0.843753 7.50555 1.05127 7.644 1.27966 7.73825C1.50805 7.83249 1.75281 7.88067 1.99988 7.88001H5.99988C6.24611 7.87936 6.4898 7.83021 6.71703 7.73537C6.94427 7.64054 7.1506 7.50188 7.32424 7.3273C7.49789 7.15273 7.63545 6.94566 7.72907 6.71792C7.82269 6.49019 7.87054 6.24624 7.86988 6.00001Z" />
    </svg>
);

const ClockIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="sfp-icon">
        <path d="M12,21.75A9.75,9.75,0,1,1,21.75,12,9.76,9.76,0,0,1,12,21.75Zm0-18A8.25,8.25,0,1,0,20.25,12,8.26,8.26,0,0,0,12,3.75Zm3.53,11.78a.75.75,0,0,0,0-1.06l-2.78-2.78V8a.75.75,0,0,0-1.5,0v4a.75.75,0,0,0,.22.53l3,3a.75.75,0,0,0,1.06,0Z" />
    </svg>
);

const PlusIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
);

const SortIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
);

const UpdateIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>;
const RelinkIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" opacity="0.5" strokeDasharray="4 4" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>;
const DeleteIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>;

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

    let interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    return "just now";
};

const SourceFilesPanel = ({ models, hiddenModels = [], onImport, onRemove, onToggleVisibility, modelViews, activeViewableGuids, onLoadView, onUpdate, onRelink }) => {
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
                    <PlusIcon /> <span style={{ marginLeft: 4 }}>Import Model</span>
                </button>
            </div>

            <div className="sfp-list">
                {models.length === 0 && (
                    <div className="sfp-empty">No models loaded</div>
                )}
                {models.map(model => {
                    const isHidden = hiddenModels.includes(model.urn);
                    const isExpanded = expandedModels[model.urn];

                    return (
                        <div key={model.urn} className={`sfp-item ${isExpanded ? 'expanded' : ''}`}>
                            <div className="sfp-item-row" onClick={() => toggleExpand(model.urn)}>
                                <button className="sfp-list-chevron">
                                    {isExpanded ? <ChevronDown /> : <ChevronRight />}
                                </button>
                                <span className="sfp-label" title={model.label}>{model.label}</span>

                                <div className="sfp-spacer"></div>

                                <div className="sfp-actions">
                                    <button className="sfp-action-btn star" title="Main Model" onClick={(e) => e.stopPropagation()}>
                                        <StarIcon filled={false} />
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
                                                <button onClick={(e) => { e.stopPropagation(); onUpdate && onUpdate(model.urn); setActiveMenu(null); }}>
                                                    <span className="sfp-menu-icon"><UpdateIcon /></span> Update
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); onRelink && onRelink(model); setActiveMenu(null); }}>
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

                            {/* Expanded Details - Matches Tandem Layout */}
                            {isExpanded && (
                                <div className="sfp-details">
                                    <div className="sfp-detail-row">
                                        <div className="detail-icon-wrap"><RevitIcon /></div>
                                        <span className="detail-text main">{model.label}</span>
                                    </div>

                                    {/* Optional View Selector - Kept but styled discreetly */}

                                    <div className="sfp-detail-row">
                                        <div className="detail-icon-wrap"><ClockIcon /></div>
                                        <span className="detail-text">updated {getTimeAgo(model.lastModifiedTime || model.added_at)}</span>
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
