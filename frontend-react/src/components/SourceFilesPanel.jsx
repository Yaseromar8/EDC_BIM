import React, { useState } from 'react';
import './SourceFilesPanel.css';

// --- ICONS ---

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

const ClockIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="sfp-icon">
        <path d="M12,21.75A9.75,9.75,0,1,1,21.75,12,9.76,9.76,0,0,1,12,21.75Zm0-18A8.25,8.25,0,1,0,20.25,12,8.26,8.26,0,0,0,12,3.75Zm3.53,11.78a.75.75,0,0,0,0-1.06l-2.78-2.78V8a.75.75,0,0,0-1.5,0v4a.75.75,0,0,0,.22.53l3,3a.75.75,0,0,0,1.06,0Z" />
    </svg>
);

const ViewIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="sfp-icon">
        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
    </svg>
);

const InfoIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="sfp-icon">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
    </svg>
);

const PlusIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
);

const CheckIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
);

const UpdateIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>;
const RelinkIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" opacity="0.5" strokeDasharray="4 4" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>;
const DeleteIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>;

// Helper for relative time
const getTimeAgo = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return "just now";
    let interval = seconds / 60;
    if (interval < 60) return Math.floor(interval) + " min ago";
    interval = seconds / 3600;
    if (interval < 24) return Math.floor(interval) + " hours ago";
    interval = seconds / 86400;
    return Math.floor(interval) + " days ago";
};

// Find view name from modelViews, using defaultViewGuid (from DB) as primary source of truth
const getActiveViewName = (modelUrn, modelViews, activeViewableGuids, defaultViewGuid) => {
    if (!modelViews || !modelUrn) return null;
    const views = modelViews[modelUrn];
    if (!views || views.length === 0) return null;
    
    // 1. Primary: use the defaultViewGuid persisted in model_config (DB source of truth)
    if (defaultViewGuid) {
        const dbView = views.find(v => v.guid === defaultViewGuid || (v.allGuids && v.allGuids.includes(defaultViewGuid)));
        if (dbView) return dbView.name;
    }
    // 2. Secondary: check runtime activeViewableGuids (user switched view in session)
    const activeGuid = activeViewableGuids?.[modelUrn];
    if (activeGuid) {
        const activeView = views.find(v => v.guid === activeGuid || (v.allGuids && v.allGuids.includes(activeGuid)));
        if (activeView) return activeView.name;
    }
    // 3. Fallback: first 3D view in the list
    const first3d = views.find(v => v.role === '3d');
    return first3d ? first3d.name : views[0]?.name || null;
};

const SourceFilesPanel = ({
    models, hiddenModels = [], onImport, onRemove, onToggleVisibility,
    modelViews, activeViewableGuids, onLoadView, onUpdate, onUpdateAll, updateAllBusy = false, onRelink,
    extractionJobs = {}, availableUpdates = {}, updateCheckStatus = {}
}) => {
    const [expandedModels, setExpandedModels] = useState({});
    const [activeMenu, setActiveMenu] = useState(null);

    const toggleExpand = (id) => {
        setExpandedModels(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // Coherencia global: cuántos tienen versión nueva y cuántos están extrayendo
    const pendingCount = models.filter(m => availableUpdates[m.id]?.has_update).length;
    const extractingCount = models.filter(m => extractionJobs[m.urn]?.isActive).length;

    return (
        <div className="source-files-panel">
            <div className="sfp-header">
                <h3>MODELOS</h3>
                <button className="sfp-import-btn" onClick={onImport}>
                    <PlusIcon /> <span style={{ marginLeft: 4 }}>Importar</span>
                </button>
            </div>

            {/* Barra de acciones globales: actualizar todos + estado de extracción */}
            {(pendingCount > 0 || extractingCount > 0) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #2a2b30', fontSize: 12 }}>
                    {pendingCount > 0 && (
                        <button
                            onClick={() => onUpdateAll && onUpdateAll()}
                            disabled={updateAllBusy}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: updateAllBusy ? '#3a3f47' : '#7e9bbd', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: updateAllBusy ? 'default' : 'pointer' }}
                        >
                            {updateAllBusy ? 'Actualizando…' : `Actualizar todos (${pendingCount})`}
                        </button>
                    )}
                    {extractingCount > 0 && (
                        <span style={{ color: '#c2a878', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="sfp-check-spinner" /> Extrayendo {extractingCount} modelo{extractingCount !== 1 ? 's' : ''}…
                        </span>
                    )}
                </div>
            )}

            <div className="sfp-list">
                {models.length === 0 && (
                    <div className="sfp-empty">No hay modelos cargados</div>
                )}
                {models.map(model => {
                    const norm = (u) => String(u || '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                    const isHidden = hiddenModels.some(u => norm(u) === norm(model.urn));
                    const isExpanded = expandedModels[model.id];
                    const extractData = extractionJobs[model.urn];
                    const isExtracting = extractData && extractData.isActive;
                    const versionNum = model.versionNumber || null;
                    const updateInfo = availableUpdates[model.id];
                    const hasUpdate = updateInfo?.has_update;
                    const viewName = getActiveViewName(model.urn, modelViews, activeViewableGuids, model.defaultViewGuid);
                    const checkStatus = updateCheckStatus[model.urn];

                    return (
                        <div key={model.id} className={`sfp-item ${isExpanded ? 'expanded' : ''}`}>
                            {/* UPDATE BANNER — Tandem style */}
                            {hasUpdate && (
                                <div className="sfp-update-banner">
                                    <span className="sfp-update-banner-text">
                                        <InfoIcon />
                                        New version available{updateInfo.latest_version ? ` (v${updateInfo.latest_version})` : ''}
                                    </span>
                                    <button 
                                        className="sfp-update-banner-btn"
                                        onClick={(e) => { e.stopPropagation(); onUpdate && onUpdate(model.urn); }}
                                    >
                                        Update
                                    </button>
                                </div>
                            )}

                            <div className="sfp-item-row" onClick={() => toggleExpand(model.id)}>
                                <button className="sfp-list-chevron">
                                    {isExpanded ? <ChevronDown /> : <ChevronRight />}
                                </button>
                                <span className="sfp-label" title={model.label}>
                                    <span className="sfp-label-text">{model.label}</span>
                                    {versionNum && (
                                        <span className="sfp-version-badge">v{versionNum}</span>
                                    )}
                                </span>

                                <div className="sfp-spacer"></div>

                                {/* INLINE STATUS INDICATOR */}
                                {checkStatus && (
                                    <span className={`sfp-check-status sfp-status-${checkStatus.status}`}>
                                        {checkStatus.status === 'checking' && (
                                            <><div className="sfp-check-spinner" /> Checking...</>
                                        )}
                                        {checkStatus.status === 'up_to_date' && (
                                            <><CheckIcon /> Up to date</>
                                        )}
                                        {checkStatus.status === 'updating' && (
                                            <><div className="sfp-check-spinner" /> Updated!</>
                                        )}
                                        {checkStatus.status === 'error' && (
                                            <span style={{ color: '#f87171' }}>⚠ {checkStatus.message}</span>
                                        )}
                                    </span>
                                )}

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
                                                setActiveMenu(activeMenu === model.id ? null : model.id);
                                            }}
                                        >
                                            <MoreIcon />
                                        </button>
                                        {activeMenu === model.id && (
                                            <div className="sfp-dropdown">
                                                <button onClick={(e) => { e.stopPropagation(); onUpdate && onUpdate(model.urn); setActiveMenu(null); }}>
                                                    <span className="sfp-menu-icon"><UpdateIcon /></span> Update
                                                    {hasUpdate && <span className="sfp-menu-badge">NEW</span>}
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

                            {/* PROGRESO DE EXTRACCIÓN — debajo de la fila */}
                            {isExtracting && (
                                <div className="sfp-extraction-bar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 5 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div className="sfp-check-spinner" style={{ width: 10, height: 10 }} />
                                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {extractData.status || 'Extrayendo metadata'} · {Math.round(extractData.progress || 0)}%
                                        </span>
                                    </div>
                                    <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${Math.round(extractData.progress || 0)}%`, background: '#7e9bbd', borderRadius: 2, transition: 'width 0.3s ease' }} />
                                    </div>
                                </div>
                            )}

                            {/* Expanded Details */}
                            {isExpanded && (
                                <div className="sfp-details">
                                    <div className="sfp-detail-row">
                                        <div className="detail-icon-wrap"><RevitIcon /></div>
                                        <span className="detail-text main">{model.name || model.label}</span>
                                        {versionNum && (
                                            <span className="sfp-version-badge-detail">v{versionNum}</span>
                                        )}
                                    </div>

                                    {viewName && (
                                        <div className="sfp-detail-row">
                                            <div className="detail-icon-wrap"><ViewIcon /></div>
                                            <span className="detail-text">{viewName}</span>
                                        </div>
                                    )}

                                    {model.lastModifiedTime && (
                                        <div className="sfp-detail-row">
                                            <div className="detail-icon-wrap"><ClockIcon /></div>
                                            <span className="detail-text">updated {getTimeAgo(model.lastModifiedTime)}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {activeMenu && (
                <div className="sfp-menu-overlay" onClick={() => setActiveMenu(null)}></div>
            )}
        </div>
    );
};

export default SourceFilesPanel;
