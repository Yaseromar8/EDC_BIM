
import React, { useState, useEffect, useCallback } from 'react';
import { DOCS_URL, VISOR_DOCS_SHORTCUT, goToHub } from '../utils/hubLink';
import './LandingPage.css';
import { Capacitor } from '@capacitor/core';
import { apiFetch } from '../utils/apiFetch';

const BACKEND_URL = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ? 'https://visor-ecd-backend.onrender.com' : (import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3000' : (typeof window !== 'undefined' && window.location.hostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/) ? `http://${window.location.hostname}:3000` : 'https://visor-ecd-backend.onrender.com')));

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

    // Frentes DINÁMICOS del proyecto (los 3 base son fijos; estos se crean
    // desde la UI y persisten en Postgres — un frente nuevo = scope de datos
    // nuevo "{proyecto}_{FRENTE}", aislado como CANAL/DRENAJE/INFRAWORKS).
    const [customFrentes, setCustomFrentes] = useState([]);
    const [showNewFrente, setShowNewFrente] = useState(false);
    const [newFrenteName, setNewFrenteName] = useState('');
    const [newFrenteDesc, setNewFrenteDesc] = useState('');
    const [newFrenteIcon, setNewFrenteIcon] = useState('⚠️');
    const [newFrenteType, setNewFrenteType] = useState('');
    // Tipos de componente de obra lineal (agrupan el navegador de frentes)
    const FRENTE_TYPES = ['Aportante', 'Canal', 'Disipador', 'Estructura', 'Vial', 'Otro'];
    const [savingFrente, setSavingFrente] = useState(false);
    const [frenteError, setFrenteError] = useState('');

    useEffect(() => {
        if (!selectedBaseProject) { setCustomFrentes([]); setShowNewFrente(false); return; }
        apiFetch(`${BACKEND_URL}/api/frentes?base=${encodeURIComponent(selectedBaseProject.id)}`)
            .then(r => r.json())
            .then(d => setCustomFrentes(d.frentes || []))
            .catch(() => setCustomFrentes([]));
    }, [selectedBaseProject]);

    const handleCreateFrente = async () => {
        if (!newFrenteName.trim() || savingFrente || !selectedBaseProject) return;
        setSavingFrente(true); setFrenteError('');
        try {
            const res = await apiFetch(`${BACKEND_URL}/api/frentes`, {
                method: 'POST',
                body: JSON.stringify({
                    base_project_id: selectedBaseProject.id,
                    name: newFrenteName.trim(),
                    description: newFrenteDesc.trim(),
                    icon: newFrenteIcon || '📌',
                    front_type: newFrenteType
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setFrenteError(data.error || 'No se pudo crear el frente.'); }
            else {
                setCustomFrentes(prev => [...prev, {
                    frontId: data.frontId, name: newFrenteName.trim(),
                    description: newFrenteDesc.trim(), icon: newFrenteIcon || '📌',
                    frontType: newFrenteType, civil: null
                }]);
                setShowNewFrente(false);
                setNewFrenteName(''); setNewFrenteDesc(''); setNewFrenteType('');
            }
        } catch (e) {
            setFrenteError('Error de conexión.');
        }
        setSavingFrente(false);
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // apiFetch (no fetch crudo): el backend deriva de la SESION que
            // obras puede ver quien llama, en vez de fiarse de ?role= en la URL.
            const [hubsRes, projsRes] = await Promise.all([
                apiFetch(`${BACKEND_URL}/api/hubs`),
                apiFetch(`${BACKEND_URL}/api/projects`)
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
            const res = await apiFetch(`${BACKEND_URL}/api/hubs`, {
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
            const res = await apiFetch(`${BACKEND_URL}/api/hubs/${targetHub}/projects`, {
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

    // (Se retiró typeColor: el tipo de proyecto ya no se pinta de colores; es
    //  texto como el resto de los metadatos.)

    if (selectedBaseProject) {
        // Navegador agrupado por TIPO de componente (Aportantes/Canales/...),
        // con "General" (sin tipo) al final. Escala igual con 3 o 30 frentes.
        const frenteGroups = (() => {
            const g = new Map();
            customFrentes.forEach((f) => {
                const t = (f.frontType || '').trim() || 'General';
                if (!g.has(t)) g.set(t, []);
                g.get(t).push(f);
            });
            return [...g.entries()].sort((a, b) =>
                (a[0] === 'General') - (b[0] === 'General') || a[0].localeCompare(b[0]));
        })();

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
                        <h1>{selectedBaseProject.name}</h1>
                        <p>Selecciona un frente</p>
                    </div>

                    <div className="frente-options">
                        {/* Frentes del PROYECTO (100% dinámicos — aislamiento real:
                            un proyecto nuevo nace vacío, como en ACC). Los 3 frentes
                            históricos se sembraron como datos de los proyectos existentes. */}
                        {customFrentes.length === 0 && !showNewFrente && (
                            <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#8a919c', fontSize: 14, padding: '10px 0 2px' }}>
                                Este proyecto aún no tiene frentes. Crea el primero para empezar.
                            </div>
                        )}
                        {frenteGroups.map(([type, list]) => (
                            <React.Fragment key={type}>
                                {(frenteGroups.length > 1 || type !== 'General') && (
                                    <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                                        <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1.2, color: '#7e9bbd', textTransform: 'uppercase' }}>
                                            {type} ({list.length})
                                        </span>
                                        <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                                    </div>
                                )}
                                {list.map(f => (
                            <div key={f.frontId} className="frente-card" style={{ position: 'relative' }} onClick={() => handleFrontSelect(f.frontId, f.name)}>
                                <div className="frente-card-icon">{f.icon || '·'}</div>
                                <div className="frente-card-content">
                                    <h3>{f.name}</h3>
                                    {/* Lo único que se muestra bajo el nombre es el
                                        estado de la extracción Civil: es dato, no adorno.
                                        La descripción quedó fuera de la ficha. */}
                                    {f.civil && (f.civil.ejes > 0 || f.civil.estaciones > 0) ? (
                                        <p style={{ color: '#4ade80' }}>
                                            {f.civil.ejes} {f.civil.ejes === 1 ? 'eje' : 'ejes'} · {f.civil.estaciones} est
                                        </p>
                                    ) : (
                                        <p>sin extracción Civil</p>
                                    )}
                                </div>
                                <div className="frente-card-arrow">→</div>
                                <button
                                    className="frente-card-del"
                                    title="Eliminar frente (solo la tarjeta; los datos de su scope no se tocan)"
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        if (!window.confirm(`¿Eliminar el frente "${f.name}" de este proyecto?`)) return;
                                        try {
                                            const res = await apiFetch(`${BACKEND_URL}/api/frentes`, {
                                                method: 'DELETE',
                                                body: JSON.stringify({ base_project_id: selectedBaseProject.id, front_id: f.frontId })
                                            });
                                            if (res.ok) setCustomFrentes(prev => prev.filter(x => x.frontId !== f.frontId));
                                        } catch { /* noop */ }
                                    }}
                                >✕</button>
                            </div>
                                ))}
                            </React.Fragment>
                        ))}

                        {/* Crear frente nuevo */}
                        {showNewFrente ? (
                            <div className="frente-card" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 10 }} onClick={(e) => e.stopPropagation()}>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <input
                                        value={newFrenteIcon}
                                        onChange={e => setNewFrenteIcon(e.target.value)}
                                        maxLength={4}
                                        title="Ícono (emoji)"
                                        style={{ width: 52, textAlign: 'center', fontSize: 20, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, color: '#fff', padding: '8px 4px' }}
                                    />
                                    <input
                                        autoFocus
                                        value={newFrenteName}
                                        onChange={e => setNewFrenteName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleCreateFrente(); }}
                                        placeholder="Nombre del frente (ej. Interferencias)"
                                        style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, color: '#fff', padding: '8px 12px', fontSize: 14 }}
                                    />
                                </div>
                                {/* Tipo de componente: agrupa el navegador (Aportantes/Canales/...) */}
                                <select
                                    value={newFrenteType}
                                    onChange={e => setNewFrenteType(e.target.value)}
                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, color: newFrenteType ? '#fff' : '#8a919c', padding: '8px 12px', fontSize: 13 }}
                                >
                                    <option value="" style={{ color: '#111' }}>Tipo de componente (opcional)</option>
                                    {FRENTE_TYPES.map(t => <option key={t} value={t} style={{ color: '#111' }}>{t}</option>)}
                                </select>
                                <input
                                    value={newFrenteDesc}
                                    onChange={e => setNewFrenteDesc(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleCreateFrente(); }}
                                    placeholder="Descripción (ej. Modelo contractual con interferencias de campo)"
                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, color: '#ccc', padding: '8px 12px', fontSize: 13 }}
                                />
                                {frenteError && <span style={{ color: '#ef4444', fontSize: 12 }}>{frenteError}</span>}
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                    <button onClick={() => { setShowNewFrente(false); setFrenteError(''); }}
                                        style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', color: '#aab', borderRadius: 7, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>
                                        Cancelar
                                    </button>
                                    <button onClick={handleCreateFrente} disabled={!newFrenteName.trim() || savingFrente}
                                        style={{ background: '#5f7fa3', border: 'none', color: '#fff', borderRadius: 7, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: (!newFrenteName.trim() || savingFrente) ? 0.5 : 1 }}>
                                        {savingFrente ? 'Creando…' : 'Crear frente'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="frente-card" style={{ borderStyle: 'dashed' }} onClick={() => setShowNewFrente(true)}>
                                <div className="frente-card-icon">+</div>
                                <div className="frente-card-content">
                                    <h3 style={{ color: '#98a1ad', fontWeight: 500 }}>Crear frente</h3>
                                </div>
                            </div>
                        )}
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
                            <rect x="2" y="2" width="9" height="9" rx="1.5" fill="#5f7fa3" />
                            <rect x="13" y="2" width="9" height="9" rx="1.5" fill="#5f7fa3" opacity="0.6" />
                            <rect x="2" y="13" width="9" height="9" rx="1.5" fill="#5f7fa3" opacity="0.6" />
                            <rect x="13" y="13" width="9" height="9" rx="1.5" fill="#5f7fa3" opacity="0.3" />
                        </svg>
                        <span>VISOR ECD</span>
                    </div>
                    <nav className="acc-topnav">
                        {/* "Inicio" = volver al Hub (elegir producto). El atajo
                            lateral a Documentación queda apagado: se llega a
                            Docs por el Hub (ver utils/hubLink.js). */}
                        <span className="acc-topnav-item" onClick={goToHub} title="Volver al inicio (elegir producto)">Inicio</span>
                        <span className="acc-topnav-item active">Proyectos</span>
                        {VISOR_DOCS_SHORTCUT && (
                            <span className="acc-topnav-item" onClick={() => window.open(DOCS_URL, '_blank')}>Documentación</span>
                        )}
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
                            <div className="acc-empty-icon">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="4" width="18" height="16" rx="2" />
                                    <line x1="3" y1="10" x2="21" y2="10" />
                                    <line x1="9" y1="10" x2="9" y2="20" />
                                </svg>
                            </div>
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
                                    {/* Sin miniatura: no hay imagen de proyecto que
                                        mostrar, y el recuadro de 100 px con un icono
                                        genérico era la mitad de la ficha llena de nada.
                                        El estado pasa a un punto junto al nombre. */}
                                    <div className="acc-card-hub">{proj.hub_name || 'Sin portafolio'}</div>
                                    <h3 className="acc-card-name" title={proj.name}>
                                        {proj.status === 'active' && (
                                            <span className="acc-card-status-dot" title="Activo" />
                                        )}
                                        {proj.name}
                                    </h3>
                                    {proj.description && (
                                        <p className="acc-card-desc">{proj.description}</p>
                                    )}
                                    <div className="acc-card-meta">
                                        {proj.project_type && (
                                            <span className="acc-card-tag">{proj.project_type}</span>
                                        )}
                                        {proj.updated_at && (
                                            <span className="acc-card-date">
                                                {new Date(proj.updated_at).toLocaleDateString('es-PE', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </span>
                                        )}
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
