import React from 'react';
import './TopBar.css';
import { goToHub } from '../utils/hubLink';

const BookmarkIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
);

const SignOutIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
);

const TopBar = ({
    user,
    onLogout,
    togglePanel,
    isViewsActive,
    onLogoClick,
    selectedProject
}) => {
    return (
        <header className="top-bar">
            <div className="top-bar-left">
                <div
                    className="logo-section"
                    onClick={onLogoClick}
                    style={{ position: 'relative' }}
                >
                    {/* Espacio compacto de marca ⇒ SÍMBOLO oficial (blanco sobre
                        cabecera oscura), como manda el manual: 28px ≥ mínimo de
                        24px. Clic = inicio. */}
                    <div className="logo-wrapper" title="Inicio">
                        <img src="/brand/ALEPHIA_Symbol_Light.svg" alt="ALEPHIA" style={{ height: '28px', width: 'auto', display: 'block', zIndex: 2, position: 'relative' }} />
                    </div>

                    {selectedProject && (
                        <div className="top-bar-breadcrumb" style={{ display: 'flex', alignItems: 'center' }}>
                            <span className="breadcrumb-project">{selectedProject.baseName || selectedProject.name}</span>
                            <span className="breadcrumb-sep">/</span>
                            <span className="breadcrumb-view">{selectedProject.frontName}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="top-bar-right">
                <button
                    className="tool-btn"
                    onClick={goToHub}
                    title="Volver al inicio (elegir producto)"
                    style={{ marginRight: '8px', color: '#6a9bcc' }}
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
                    <div className="user-profile-section" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '12px', borderLeft: '1px solid #52524d', paddingLeft: '12px' }}>
                        <div className="user-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ color: '#fff', fontSize: '13px', fontWeight: 500 }}>{user.name}</span>
                            <span style={{ color: '#918f88', fontSize: '11px' }}>{user.role === 'admin' ? 'Administrador' : 'Usuario'}</span>
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
