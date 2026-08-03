import React, { useState, useEffect, useRef } from 'react';
import './TopBar.css';
import { goToHub } from '../utils/hubLink';

// SVGs for Tandem-like icons
const LogoIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M4 4h16v16H4V4z" fill="#E1251B" />
        <path d="M8 8h8v2h-3v6h-2v-6H8V8z" fill="white" />
    </svg>
);

const SelectionIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    </svg>
);

const MeasureIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 16.5c0 0-4-6.5-12-6.5S3 14 3 14" />
        <path d="M3 17h18" />
        <path d="M3 14v4" />
        <path d="M21 14v4" />
        <path d="M6 17v-1.5" />
        <path d="M9 17v-1.5" />
        <path d="M12 17v-1.5" />
        <path d="M15 17v-1.5" />
        <path d="M18 17v-1.5" />
    </svg>
);

const ChevronDown = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

const SearchIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

const BookmarkIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
);

const PieChartIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
        <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
);

const BellIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
);

const HelpIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
);

const SignOutIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
);

// Engineering Icons (Tandem Style)
const OrbitIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" strokeOpacity="0.2"/>
        <path d="M12 6v12M6 12h12" />
        <circle cx="12" cy="12" r="3" />
        <path d="M19 12a7 7 0 0 0-7-7" />
    </svg>
);

const RulerIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2z" />
        <path d="M7 3v4M11 3v2M15 3v4M19 3v2M3 7h18" />
    </svg>
);

const SectionIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 3H3v18h18V3zM3 12h18" />
        <path d="M12 3v18" strokeDasharray="2 2"/>
    </svg>
);

const ToolboxIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
        <polyline points="2 12 12 17 22 12"></polyline>
        <polyline points="2 17 12 22 22 17"></polyline>
    </svg>
);

const PinIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"></path><circle cx="12" cy="10" r="3"></circle></svg>
);

const HeatmapIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
);

const TopBar = ({
    user,
    onLogout,
    activePanel,
    togglePanel,
    isViewsActive,
    onLogoClick,
    selectedProject,
    onUniversalSearch
}) => {
    const [timer, setTimer] = useState(null);
    const [isLongPress, setIsLongPress] = useState(false);
    
    // Obra Lineal Toolbox
    const [isProjectToolsOpen, setIsProjectToolsOpen] = useState(false);
    const toolsRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (toolsRef.current && !toolsRef.current.contains(event.target)) {
                setIsProjectToolsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleStart = () => {
        setIsLongPress(false);
        const t = setTimeout(() => {
            setIsLongPress(true);
            togglePanel('search'); // Activar IA en pulsación larga
        }, 800);
        setTimer(t);
    };

    const handleEnd = (e) => {
        if (timer) clearTimeout(timer);
        if (!isLongPress && e.type === 'click') {
            onLogoClick(); // Clic corto: Inicio
        } else if (isLongPress) {
            // Pulsación larga: Toggle IA
            if (activePanel === 'search') {
                togglePanel(null); // Desactivar si ya está activo
            } else {
                togglePanel('search'); // Activar si no está activo
            }
        }
    };

    return (
        <header className="top-bar">
            <div className="top-bar-left">
                <div
                    className="logo-section"
                    onMouseDown={handleStart}
                    onMouseUp={handleEnd}
                    onTouchStart={handleStart}
                    onTouchEnd={handleEnd}
                    onClick={handleEnd}
                    title="Clic para inicio / Mantener para IA"
                    style={{ position: 'relative' }}
                >
                    <div className={`logo-wrapper ${activePanel === 'search' ? 'ai-active-glow' : ''}`}>
                        <img src="/logo.png" alt="Logo" style={{ height: '28px', transform: 'scale(1.5)', display: 'block', zIndex: 2, position: 'relative' }} />
                    </div>

                    {selectedProject && (
                        <div className="top-bar-breadcrumb" style={{ display: 'flex', alignItems: 'center' }}>
                            <span className="breadcrumb-project">{selectedProject.baseName || selectedProject.name}</span>
                            <span className="breadcrumb-sep">/</span>
                            <span className="breadcrumb-view">{selectedProject.frontName}</span>
                            {/* Obra Lineal Tools Dropdown */}
                            <div 
                                className="obra-lineal-tools" 
                                ref={toolsRef} 
                                style={{ position: 'relative', marginLeft: '16px', borderLeft: '1px solid #444', paddingLeft: '16px' }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onMouseUp={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button 
                                    className="tool-btn"
                                    onClick={() => setIsProjectToolsOpen(!isProjectToolsOpen)}
                                    title="Herramientas de Obra Lineal"
                                    style={{ 
                                        gap: '6px', 
                                        background: isProjectToolsOpen ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                                        color: isProjectToolsOpen ? '#fff' : undefined,
                                        borderRadius: '4px'
                                    }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
                                    <span style={{ fontSize: '11px', fontWeight: 700 }}>OBRA LINEAL</span>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: '4px', transform: isProjectToolsOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }}><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </button>

                                {isProjectToolsOpen && (
                                    <div className="tools-dropdown-menu" style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: '16px',
                                        marginTop: '8px',
                                        background: '#1e1e1e',
                                        border: '1px solid #333',
                                        borderRadius: '6px',
                                        padding: '4px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        minWidth: '160px',
                                        zIndex: 1000,
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                                    }}>
                                        <button
                                            className="dropdown-tool-btn"
                                            onClick={() => {
                                                window.dispatchEvent(new CustomEvent("toggle-progressives"));
                                                setIsProjectToolsOpen(false);
                                            }}
                                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', color: '#ccc', border: 'none', background: 'transparent', textAlign: 'left', borderRadius: '4px', cursor: 'pointer', width: '100%' }}
                                        >
                                            <PinIcon />
                                            <span style={{ fontSize: '12px', fontWeight: 500 }}>Progresivas</span>
                                        </button>
                                        <button
                                            className="dropdown-tool-btn"
                                            onClick={() => {
                                                window.dispatchEvent(new CustomEvent("toggle-workfronts-panel"));
                                                setIsProjectToolsOpen(false);
                                            }}
                                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', color: '#ccc', border: 'none', background: 'transparent', textAlign: 'left', borderRadius: '4px', cursor: 'pointer', width: '100%' }}
                                        >
                                            <HeatmapIcon />
                                            <span style={{ fontSize: '12px', fontWeight: 500 }}>Heatmap</span>
                                        </button>
                                        <div style={{ height: '1px', background: '#333', margin: '2px 0' }} />
                                        <button
                                            className="dropdown-tool-btn"
                                            onClick={() => {
                                                window.dispatchEvent(new CustomEvent("toggle-station-tracker"));
                                                setIsProjectToolsOpen(false);
                                            }}
                                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', color: '#ccc', border: 'none', background: 'transparent', textAlign: 'left', borderRadius: '4px', cursor: 'pointer', width: '100%' }}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16.5c0 0-4-6.5-12-6.5S3 14 3 14" /><path d="M3 17h18" /><path d="M3 14v4" /><path d="M21 14v4" /><path d="M6 17v-1.5" /><path d="M9 17v-1.5" /><path d="M12 17v-1.5" /><path d="M15 17v-1.5" /><path d="M18 17v-1.5" /></svg>
                                            <span style={{ fontSize: '12px', fontWeight: 500 }}>Herramientas de Civil</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="top-bar-center">
                <div className="top-search" style={{ maxWidth: '400px' }}>
                    <div className="search-icon-wrapper">
                        <SearchIcon />
                    </div>
                    <input
                        type="text"
                        placeholder="Preguntar a la IA sobre el proyecto..."
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && onUniversalSearch) {
                                onUniversalSearch(e.target.value);
                            }
                        }}
                    />
                </div>
            </div>

            <div className="top-bar-right">
                <button
                    className="tool-btn"
                    onClick={goToHub}
                    title="Volver al inicio (elegir producto)"
                    style={{ marginRight: '8px', color: '#0696d7' }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 10.5 12 3l9 7.5" />
                        <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
                        <path d="M9.5 21v-6h5v6" />
                    </svg>
                    <span style={{ fontSize: '11px', fontWeight: 700, marginLeft: '4px' }}>INICIO</span>
                </button>

                <button
                    className={`tool-btn view-trigger ${isViewsActive ? 'active' : ''}`}
                    onClick={() => togglePanel('views')}
                    title="Vistas Guardadas"
                >
                    <BookmarkIcon />
                </button>

                {user && (
                    <div className="user-profile-section" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '12px', borderLeft: '1px solid #444', paddingLeft: '12px' }}>
                        <div className="user-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ color: '#fff', fontSize: '13px', fontWeight: 500 }}>{user.name}</span>
                            <span style={{ color: '#888', fontSize: '11px' }}>{user.role === 'admin' ? 'Administrador' : 'Usuario'}</span>
                        </div>
                        {onLogout && (
                        <button
                            className="tool-btn logout-btn"
                            onClick={onLogout}
                            title="Cerrar Sesión"
                            style={{ color: '#ff4d4d' }}
                        >
                            <SignOutIcon />
                        </button>
                        )}
                    </div>
                )}
            </div>
        </header>
    );
};

export default React.memo(TopBar);
