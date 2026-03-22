import React from 'react';
import './TopBar.css';

const DOCS_URL = import.meta.env.VITE_DOCS_URL || 'http://localhost:5174';

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
    const [timer, setTimer] = React.useState(null);
    const [isLongPress, setIsLongPress] = React.useState(false);

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
                        <img src="/logo.png" alt="Logo" style={{ height: '28px', display: 'block', zIndex: 2, position: 'relative' }} />
                    </div>

                    {selectedProject && (
                        <div className="top-bar-breadcrumb">
                            <span className="breadcrumb-project">{selectedProject.baseName || selectedProject.name}</span>
                            <span className="breadcrumb-sep">/</span>
                            <span className="breadcrumb-view">{selectedProject.frontName}</span>
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
                    onClick={() => window.open(DOCS_URL, '_blank')}
                    title="Gestión Documental (ACC)"
                    style={{ marginRight: '8px', color: '#0696d7' }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                    </svg>
                    <span style={{ fontSize: '11px', fontWeight: 700, marginLeft: '4px' }}>DOCS</span>
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
                        <button
                            className="tool-btn logout-btn"
                            onClick={onLogout}
                            title="Cerrar Sesión"
                            style={{ color: '#ff4d4d' }}
                        >
                            <SignOutIcon />
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
};

export default React.memo(TopBar);
