
import React, { useState, useEffect, useCallback } from 'react';
import './LandingPage.css';
import { Capacitor } from '@capacitor/core';

const BACKEND_URL = Capacitor.isNativePlatform()
    ? 'https://visor-ecd-backend.onrender.com'
    : (import.meta.env.VITE_BACKEND_URL || '');

// ─── LandingPage (ACC-Style Hub + Project Selector) ─────────────────────────
/*
  Replica el flujo de Autodesk ACC:
    1. Se muestran los Hubs (Municipalidades)
    2. Al hacer click en un Hub se ven sus Proyectos
    3. Al elegir un Proyecto se entra al visor con ese contexto

  En la BD:
    Hub     → tabla 'hubs'     (id, name, region)
    Project → tabla 'projects' (id, hub_id, name, model_urn, ...)
*/
const LandingPage = ({ onSelectProject }) => {
    const [hubs, setHubs] = useState([]);
    const [projects, setProjects] = useState([]);
    const [activeHubId, setActiveHubId] = useState(null);  // null = "Todos"
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showNewHubForm, setShowNewHubForm] = useState(false);
    const [showNewProjForm, setShowNewProjForm] = useState(false);
    const [newHubName, setNewHubName] = useState('');
    const [newHubRegion, setNewHubRegion] = useState('');
    const [newProjName, setNewProjName] = useState('');
    const [newProjType, setNewProjType] = useState('Infraestructura');
    const [newProjDesc, setNewProjDesc] = useState('');
    const [saving, setSaving] = useState(false);

    // --- NEW: Frentes Logic ---
    const [selectedBaseProject, setSelectedBaseProject] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [hubsRes, projsRes] = await Promise.all([
                fetch(`${BACKEND_URL}/api/hubs`),
                fetch(`${BACKEND_URL}/api/projects`)
            ]);
            if (hubsRes.ok) {
                const hd = await hubsRes.json();
                setHubs(hd.hubs || []);
            }
            if (projsRes.ok) {
                const pd = await projsRes.json();
                setProjects(pd.projects || []);
            }
        } catch (e) {
            console.error('[LandingPage] Error fetching hubs/projects:', e);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleProjectClick = (proj) => {
        setSelectedBaseProject(proj);
    };

    const handleFrontSelect = (frontId, frontName) => {
        if (!selectedBaseProject) return;
        // Create a composite project context
        onSelectProject({
            ...selectedBaseProject,
            id: `${selectedBaseProject.id}_${frontId}`, // Isolated DB scope
            frontId: frontId,
            frontName: frontName,
            baseName: selectedBaseProject.name,
            displayName: `${selectedBaseProject.name} - ${frontName}`
        });
    };

    // ── Filtrado ──────────────────────────────────────────────────────────────
    const visibleProjects = projects.filter(p => {
        const matchHub = !activeHubId || p.hub_id === activeHubId;
        const q = searchQuery.toLowerCase();
        const matchSearch = !q || p.name.toLowerCase().includes(q) ||
            (p.hub_name || '').toLowerCase().includes(q) ||
            (p.project_type || '').toLowerCase().includes(q);
        return matchHub && matchSearch;
    });

    // ── Crear Hub ─────────────────────────────────────────────────────────────
    const handleCreateHub = async () => {
        if (!newHubName.trim()) return;
        setSaving(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/hubs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newHubName.trim(), region: newHubRegion.trim() })
            });
            if (res.ok) {
                setNewHubName(''); setNewHubRegion('');
                setShowNewHubForm(false);
                await fetchData();
            }
        } catch { }
        setSaving(false);
    };

    // ── Crear Project ─────────────────────────────────────────────────────────
    const handleCreateProject = async () => {
        const targetHub = activeHubId || (hubs[0]?.id);
        if (!newProjName.trim() || !targetHub) return;
        setSaving(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/hubs/${targetHub}/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newProjName.trim(),
                    project_type: newProjType,
                    description: newProjDesc.trim()
                })
            });
            if (res.ok) {
                setNewProjName(''); setNewProjDesc('');
                setShowNewProjForm(false);
                await fetchData();
            }
        } catch { }
        setSaving(false);
    };

    // ── Project color by type ────────────────────────────────────────────────
    const typeColor = (type) => {
        if (!type) return '#4488cc';
        const t = type.toLowerCase();
        if (t.includes('infraest')) return '#3b82f6';
        if (t.includes('vial') || t.includes('canal')) return '#10b981';
        if (t.includes('edificac')) return '#8b5cf6';
        if (t.includes('drenaje') || t.includes('sanea')) return '#06b6d4';
        return '#f59e0b';
    };

    const DOCS_URL = import.meta.env.VITE_DOCS_URL || 'http://localhost:5174';

    if (selectedBaseProject) {
        return (
            <div className="acc-home-wrapper frente-selection">
                <div className="frente-container">
                    <button className="back-to-projects" onClick={() => setSelectedBaseProject(null)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                        Volver a Proyectos
                    </button>

                    <div className="frente-header">
                        <div className="frente-project-tag" style={{ color: typeColor(selectedBaseProject.project_type), border: `1px solid ${typeColor(selectedBaseProject.project_type)}` }}>
                            {selectedBaseProject.project_type || 'Proyecto'}
                        </div>
                        <h1>{selectedBaseProject.name}</h1>
                        <p>Selecciona el frente de trabajo para continuar</p>
                    </div>

                    <div className="frente-options">
                        <div className="frente-card canal" onClick={() => handleFrontSelect('CANAL', 'Frente Canal')}>
                            <div className="frente-card-icon">🌊</div>
                            <div className="frente-card-content">
                                <h3>Frente Canal</h3>
                                <p>Gestión de infraestructura hidráulica, canales y revestimientos.</p>
                            </div>
                            <div className="frente-card-arrow">→</div>
                        </div>

                        <div className="frente-card drenaje" onClick={() => handleFrontSelect('DRENAJE', 'Frente Drenaje Urbano')}>
                            <div className="frente-card-icon">🏙️</div>
                            <div className="frente-card-content">
                                <h3>Frente Drenaje Urbano</h3>
                                <p>Captación pluvial, tuberías, buzones y obras urbanas de drenaje.</p>
                            </div>
                            <div className="frente-card-arrow">→</div>
                        </div>

                        <div className="frente-card infraworks" onClick={() => handleFrontSelect('INFRAWORKS', 'Frente Infraworks')}>
                            <div className="frente-card-icon">🛣️</div>
                            <div className="frente-card-content">
                                <h3>Frente Infraworks</h3>
                                <p>Visualización de modelos conceptuales y de contexto territorial o urbano.</p>
                            </div>
                            <div className="frente-card-arrow">→</div>
                        </div>
                    </div>

                    <div className="frente-footer">
                        <span>Proyecto Base: {selectedBaseProject.hub_name}</span>
                        <span>•</span>
                        <span>Actualizado: {new Date(selectedBaseProject.updated_at).toLocaleDateString()}</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="acc-home-wrapper">
            {/* ── Top Bar ──────────────────────────────────────────────────── */}
            <header className="acc-topbar">
                <div className="acc-topbar-left">
                    <div className="acc-logo">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <rect x="2" y="2" width="9" height="9" rx="1.5" fill="#4488cc" />
                            <rect x="13" y="2" width="9" height="9" rx="1.5" fill="#4488cc" opacity="0.6" />
                            <rect x="2" y="13" width="9" height="9" rx="1.5" fill="#4488cc" opacity="0.6" />
                            <rect x="13" y="13" width="9" height="9" rx="1.5" fill="#4488cc" opacity="0.3" />
                        </svg>
                        <span>VISOR ECD</span>
                    </div>
                    <nav className="acc-topnav">
                        <span className="acc-topnav-item active">Inicio</span>
                        <span className="acc-topnav-item" onClick={() => window.open(DOCS_URL, '_blank')}>Documentación</span>
                    </nav>
                </div>
                <div className="acc-topbar-right">
                    <div className="acc-search-bar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            placeholder="Buscar proyecto..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="acc-avatar">VE</div>
                </div>
            </header>

            <div className="acc-layout">
                {/* ── Sidebar de Hubs ──────────────────────────────────────── */}
                <aside className="acc-sidebar">
                    <div className="acc-sidebar-title">Portafolio / Cliente</div>

                    <div
                        className={`acc-hub-item ${!activeHubId ? 'active' : ''}`}
                        onClick={() => setActiveHubId(null)}
                    >
                        <div className="acc-hub-icon all">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                            </svg>
                        </div>
                        <div className="acc-hub-info">
                            <span className="acc-hub-name">Todos los proyectos</span>
                            <span className="acc-hub-count">{projects.length} proyectos</span>
                        </div>
                    </div>

                    {hubs.map(hub => (
                        <div
                            key={hub.id}
                            className={`acc-hub-item ${activeHubId === hub.id ? 'active' : ''}`}
                            onClick={() => setActiveHubId(hub.id)}
                        >
                            <div className="acc-hub-icon hub">
                                {hub.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="acc-hub-info">
                                <span className="acc-hub-name">{hub.name}</span>
                                <span className="acc-hub-count">{hub.project_count || 0} proyectos</span>
                                {hub.region && <span className="acc-hub-region">{hub.region}</span>}
                            </div>
                        </div>
                    ))}

                    <button className="acc-add-hub-btn" onClick={() => setShowNewHubForm(true)}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Nuevo Portafolio
                    </button>
                </aside>

                {/* ── Main Content ─────────────────────────────────────────── */}
                <main className="acc-main">
                    <div className="acc-main-header">
                        <div>
                            <h1 className="acc-main-title">
                                {activeHubId ? hubs.find(h => h.id === activeHubId)?.name || 'Proyectos' : 'Todos los proyectos'}
                            </h1>
                            <span className="acc-main-subtitle">
                                {visibleProjects.length} proyecto{visibleProjects.length !== 1 ? 's' : ''} encontrado{visibleProjects.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <button
                            className="acc-new-project-btn"
                            onClick={() => setShowNewProjForm(true)}
                            disabled={hubs.length === 0}
                            title={hubs.length === 0 ? 'Crea primero un portafolio de origen' : 'Nuevo proyecto'}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            Nuevo Proyecto
                        </button>
                    </div>

                    {loading ? (
                        <div className="acc-loading">
                            <div className="acc-spinner" />
                            <span>Cargando proyectos...</span>
                        </div>
                    ) : visibleProjects.length === 0 ? (
                        <div className="acc-empty">
                            <div className="acc-empty-icon">🏗️</div>
                            <h3>Sin proyectos</h3>
                            <p>
                                {searchQuery ? 'No se encontraron resultados para tu búsqueda.' :
                                    activeHubId ? 'Este portafolio no tiene proyectos aún.' :
                                        'Crea un portafolio y luego un proyecto para comenzar.'}
                            </p>
                            {!searchQuery && (
                                <button className="acc-new-project-btn" onClick={() => setShowNewProjForm(true)} disabled={hubs.length === 0}>
                                    + Crear primer proyecto
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="acc-projects-grid">
                            {visibleProjects.map(proj => (
                                <div
                                    key={proj.id}
                                    className="acc-project-card"
                                    onClick={() => handleProjectClick(proj)}
                                >
                                    {/* Thumbnail / Color strip */}
                                    <div className="acc-card-thumb">
                                        {proj.thumbnail_url
                                            ? <img src={proj.thumbnail_url} alt={proj.name} />
                                            : (
                                                <div className="acc-card-thumb-icon">
                                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={typeColor(proj.project_type)} strokeWidth="1.5">
                                                        <rect x="3" y="4" width="18" height="16" rx="2" ry="2" />
                                                        <line x1="12" y1="4" x2="12" y2="20" />
                                                        <line x1="3" y1="12" x2="21" y2="12" />
                                                    </svg>
                                                </div>
                                            )
                                        }
                                        {proj.status === 'active' && (
                                            <div className="acc-card-status-dot" title="Activo" />
                                        )}
                                    </div>

                                    {/* Card Body */}
                                    <div className="acc-card-body">
                                        <div className="acc-card-hub">{proj.hub_name || 'Sin Portafolio'}</div>
                                        <h3 className="acc-card-name" title={proj.name}>{proj.name}</h3>
                                        {proj.description && (
                                            <p className="acc-card-desc">{proj.description}</p>
                                        )}
                                        <div className="acc-card-meta">
                                            {proj.project_type && (
                                                <span className="acc-card-tag" style={{ background: `${typeColor(proj.project_type)}22`, color: typeColor(proj.project_type) }}>
                                                    {proj.project_type}
                                                </span>
                                            )}
                                            {proj.updated_at && (
                                                <span className="acc-card-date">
                                                    {new Date(proj.updated_at).toLocaleDateString('es-PE', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </main>
            </div>

            {/* ── Modal: Nueva Municipalidad ───────────────────────────────── */}
            {showNewHubForm && (
                <div className="acc-modal-overlay" onClick={() => setShowNewHubForm(false)}>
                    <div className="acc-modal" onClick={e => e.stopPropagation()}>
                        <h2>Nuevo Portafolio / Cliente</h2>
                        <label>Nombre *</label>
                        <input
                            type="text"
                            placeholder="Constructora S.A."
                            value={newHubName}
                            onChange={e => setNewHubName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreateHub()}
                            autoFocus
                        />
                        <label>Región / Departamento</label>
                        <input
                            type="text"
                            placeholder="Lima, Cusco, Arequipa..."
                            value={newHubRegion}
                            onChange={e => setNewHubRegion(e.target.value)}
                        />
                        <div className="acc-modal-actions">
                            <button className="acc-btn-ghost" onClick={() => setShowNewHubForm(false)}>Cancelar</button>
                            <button className="acc-btn-primary" onClick={handleCreateHub} disabled={!newHubName.trim() || saving}>
                                {saving ? 'Creando...' : 'Crear'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Nuevo Proyecto ────────────────────────────────────── */}
            {showNewProjForm && (
                <div className="acc-modal-overlay" onClick={() => setShowNewProjForm(false)}>
                    <div className="acc-modal" onClick={e => e.stopPropagation()}>
                        <h2>Nuevo Proyecto</h2>
                        {!activeHubId && hubs.length > 1 && (
                            <p className="acc-modal-hint">Se creará en: <strong>{hubs[0]?.name}</strong>. Selecciona un portafolio primero para cambiar.</p>
                        )}
                        {activeHubId && (
                            <p className="acc-modal-hint">Portafolio / Cliente: <strong>{hubs.find(h => h.id === activeHubId)?.name}</strong></p>
                        )}
                        <label>Nombre del proyecto *</label>
                        <input
                            type="text"
                            placeholder="Rehabilitación Canal Norte 2025"
                            value={newProjName}
                            onChange={e => setNewProjName(e.target.value)}
                            autoFocus
                        />
                        <label>Tipo</label>
                        <select value={newProjType} onChange={e => setNewProjType(e.target.value)}>
                            <option>Infraestructura</option>
                            <option>Obras Viales</option>
                            <option>Edificación</option>
                            <option>Saneamiento</option>
                            <option>Drenaje Pluvial</option>
                            <option>Canal de Riego</option>
                            <option>Electrificación</option>
                            <option>Otro</option>
                        </select>
                        <label>Descripción</label>
                        <textarea
                            placeholder="Breve descripción del proyecto..."
                            value={newProjDesc}
                            onChange={e => setNewProjDesc(e.target.value)}
                            rows={2}
                        />
                        <div className="acc-modal-actions">
                            <button className="acc-btn-ghost" onClick={() => setShowNewProjForm(false)}>Cancelar</button>
                            <button className="acc-btn-primary" onClick={handleCreateProject} disabled={!newProjName.trim() || saving}>
                                {saving ? 'Creando...' : 'Crear Proyecto'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LandingPage;
