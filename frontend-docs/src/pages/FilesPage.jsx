/**
 * FilesPage.jsx — Orquestador Principal del Explorador de Archivos
 * Refactorización Fase 3: Capa de Orquestación
 * 
 * Este archivo NO contiene lógica compleja propia — solo orquesta:
 * - Hooks de datos (Fase 1)
 * - Componentes de UI (Fase 2)
 * - Layout JSX del explorador
 */
import React, { lazy, Suspense } from 'react';
import toast, { Toaster } from 'react-hot-toast';

// ── Fase 1: Hooks ──
import { useFileExplorer } from '../hooks/useFileExplorer';
import { useVersionHistory } from '../hooks/useVersionHistory';
import { useColumnResize, useSidebarResize, useVersionPanelResize } from '../hooks/useColumnResize';
import { API, getInitials, getAuthHeaders, formatSize, formatDate, DOCS_VISOR_SHORTCUT } from '../utils/helpers';
import { renderFileIconSop } from '../utils/fileIcons';
import { apiFetch } from '../utils/apiFetch';
import { confirmAction } from '../utils/confirm';

// ── Ligeros (siempre presentes en el flujo de Archivos) → carga inmediata ──
import DeleteModal from '../components/modals/DeleteModal';
import NewFolderModal from '../components/modals/NewFolderModal';
import ShareModal from '../components/modals/ShareModal';
import MoveModal from '../components/modals/MoveModal';
import UploadModal from '../components/modals/UploadModal';
import VersionPanel from '../components/panels/VersionPanel';
import DeletedTable from '../components/panels/DeletedTable';
import ContextMenu from '../components/ContextMenu';
import FolderNode from '../components/FolderNode';
import MatrixTable from '../MatrixTable';
import FolderPermissionsPanel from '../components/FolderPermissionsPanel';
// ESTÁTICO A PROPÓSITO: abrir un PDF es la acción más frecuente del día. Si se
// carga diferido, al hacer clic hay que bajar PRIMERO los chunks del visor y
// recién ahí el archivo → se siente lento. Va precargado con la app.
import DocumentViewer from '../components/DocumentViewer';

// ── Pesados / de uso puntual → CARGA DIFERIDA (code-split) ────────────────────
// Cada uno se descarga solo cuando el usuario entra a ese módulo, en vez de
// inflar el bundle inicial. Antes: 1 chunk de ~1.6 MB con TODO.
const RedLineModule = lazy(() => import('../components/RedLineModule'));
const MultimediaModule = lazy(() => import('../components/MultimediaModule'));
const GatewayPanel = lazy(() => import('../components/panels/GatewayPanel'));
const QuarantineTable = lazy(() => import('../components/panels/QuarantineTable'));
const SharesManager = lazy(() => import('../components/SharesManager'));
const ReviewsView = lazy(() => import('../components/ReviewsModule').then(m => ({ default: m.ReviewsView })));
const ReviewModal = lazy(() => import('../components/ReviewsModule').then(m => ({ default: m.ReviewModal })));
const TransmittalsView = lazy(() => import('../components/TransmittalsModule').then(m => ({ default: m.TransmittalsView })));
const TransmittalModal = lazy(() => import('../components/TransmittalsModule').then(m => ({ default: m.TransmittalModal })));
const SetsView = lazy(() => import('../components/SetsModule').then(m => ({ default: m.SetsView })));
const AddToSetModal = lazy(() => import('../components/SetsModule').then(m => ({ default: m.AddToSetModal })));
const AttributesAdmin = lazy(() => import('../components/AttributesModule').then(m => ({ default: m.AttributesAdmin })));
const AttributesPanel = lazy(() => import('../components/AttributesModule').then(m => ({ default: m.AttributesPanel })));

// Fallback uniforme mientras carga un chunk diferido.
const ChunkFallback = () => (
  <div style={{ padding: 40, textAlign: 'center', flex: 1 }}>
    <div className="adsk-spinner" style={{ margin: '0 auto' }} />
  </div>
);

// Menú de perfil: una sola familia de iconos (trazo de 1.6 px, 16 px, sin
// relleno, heredando el color del texto). Nada de emojis — cada plataforma los
// dibuja distinto y rompen la línea del resto de la interfaz.
const MENU_ICONS = {
  swap: <><polyline points="16 3 20 7 16 11" /><path d="M4 13v-2a4 4 0 0 1 4-4h12" /><polyline points="8 21 4 17 8 13" /><path d="M20 11v2a4 4 0 0 1-4 4H4" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V19a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V9.5" /><path d="M9.5 21v-6h5v6" /></>,
  exit: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
};

function MenuItem({ icon, label, onClick, danger = false, divider = false }) {
  const color = danger ? '#e53935' : '#333';
  const hoverBg = danger ? '#fff5f5' : '#f5f5f5';
  return (
    <button
      onClick={onClick}
      onMouseOver={e => { e.currentTarget.style.background = hoverBg; }}
      onMouseOut={e => { e.currentTarget.style.background = 'none'; }}
      style={{
        width: '100%', padding: '10px 16px', border: 'none', background: 'none',
        textAlign: 'left', fontSize: 13, cursor: 'pointer', color,
        display: 'flex', alignItems: 'center', gap: 10,
        borderTop: divider ? '1px solid #eee' : 'none',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.75 }}>
        {MENU_ICONS[icon]}
      </svg>
      {label}
    </button>
  );
}

export default function FilesPage({ project, user, onBack, onLogout, onBackToHub }) {
  // ═══════════════════════════════════════
  // HOOK ASSEMBLY (Zero logic — only wiring)
  // ═══════════════════════════════════════
  const fe = useFileExplorer(project, user);
  const [showGateway, setShowGateway] = React.useState(false);
  
  const vh = useVersionHistory(fe.projectPrefix, user, {
    onRefresh: () => fe.triggerRefresh()
  });
  
  const { columnWidths, totalTableWidth, startResizing } = useColumnResize();
  const { globalSidebarWidth, setGlobalSidebarWidth, treeSidebarWidth, startTreeResize, startGlobalResize } = useSidebarResize();
  const { versionPanelWidth, startVersionResize } = useVersionPanelResize();

  const { isAdmin, projectPrefix } = fe;

  // ── Revisiones (flujos de aprobación) ──
  const [reviewModalItems, setReviewModalItems] = React.useState(null); // null = cerrado
  // ── Transmittals ──
  const [transmittalItems, setTransmittalItems] = React.useState(null); // null = cerrado
  // ── Atributos personalizados ──
  const [attributesItem, setAttributesItem] = React.useState(null); // archivo en edición
  // ── Conjuntos (Sets) ──
  const [setModalItems, setSetModalItems] = React.useState(null); // null = cerrado

  // ── Búsqueda global del proyecto (no solo carpeta actual) ──
  const [globalResults, setGlobalResults] = React.useState(null);
  React.useEffect(() => {
    const q = fe.searchQuery.trim();
    if (q.length < 3 || fe.isTrashMode || fe.sidebarView !== 'files') { setGlobalResults(null); return; }
    const t = setTimeout(() => {
      apiFetch(`${API}/api/docs/search?q=${encodeURIComponent(q)}&model_urn=${encodeURIComponent(fe.projectPrefix)}`)
        .then(r => r.json())
        .then(d => { if (d.success) setGlobalResults(d.data || []); })
        .catch(() => {});
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fe.searchQuery, fe.isTrashMode, fe.sidebarView]);

  // Sincronizar historial de versiones con el archivo abierto en el visor.
  // Sin esto, el dropdown de versiones mostraba el historial del último archivo
  // consultado en la tabla (o un spinner infinito) y "Hacer actual" podía
  // promover una versión en el archivo equivocado.
  React.useEffect(() => {
    if (fe.activeFile && fe.activeFile.type !== 'folder') {
      vh.setVersionTarget(fe.activeFile);
      vh.fetchVersionHistory(fe.activeFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fe.activeFile]);

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════
  return (
    <div className="acc-root" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: '#fff' }}>
      <Toaster position="bottom-right" />
      <div className="acc-top-strip" style={{ height: 3, background: '#5f7fa3', flexShrink: 0 }} />

      {/* ─── HEADER ─── */}
      <header className="acc-top-header" style={{ height: 48, borderBottom: '1px solid #e7e9ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0 }}>
        <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="module-selector" onClick={onBack} title="Cambiar proyecto" style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontWeight: 700 }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-label="ECD-VISIION">
              <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="#5f7fa3"/>
              <path d="M7 8.5l5 8 5-8" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: 15, letterSpacing: '0.3px', color: '#2b333d' }}>ECD<span style={{ color: '#5f7fa3', fontWeight: 600 }}>-VISIION</span></span>
          </div>
          {/* Atajo al Visor 3D sin pasar por el Hub: apagado por DOCS_VISOR_SHORTCUT. */}
          {DOCS_VISOR_SHORTCUT && <>
          <div className="separator-line" style={{ width: 1, height: 20, background: '#eee', margin: '0 8px' }} />
          <button 
            className="gateway-trigger-btn"
            onClick={() => setShowGateway(true)}
            style={{ 
              display: 'flex', alignItems: 'center', gap: 6, 
              background: '#5f7fa3', color: '#fff', 
              border: 'none', borderRadius: '4px', 
              padding: '4px 12px', fontSize: 13, 
              fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.2s'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
            Frentes 3D
          </button>
          </>}
          <div className="separator-line" style={{ width: 1, height: 20, background: '#eee', margin: '0 8px' }} />
          <div className="project-selector" style={{ fontSize: 14, fontWeight: 600, color: '#333', textTransform: 'uppercase' }}>
            <span>{project.name}</span>
          </div>
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="header-user" style={{ position: 'relative' }}>
             <div className="header-avatar" onClick={() => fe.setProfileMenuOpen(!fe.profileMenuOpen)} style={{ width: 32, height: 32, borderRadius: '50%', background: '#5f7fa3', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{getInitials(user.name)}</div>
             {fe.profileMenuOpen && (
               <div style={{ position: 'absolute', top: 40, right: 0, background: '#fff', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,.15)', minWidth: 220, zIndex: 9999, border: '1px solid #e5e5e5', overflow: 'hidden' }}>
                 <div style={{ padding: '14px 16px', borderBottom: '1px solid #eee' }}>
                   <div style={{ fontWeight: 600, fontSize: 13, color: '#333' }}>{user.name}</div>
                   <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{user.email}</div>
                   <div style={{ fontSize: 10, color: '#5f7fa3', marginTop: 4, textTransform: 'uppercase', fontWeight: 600 }}>{user.role || 'user'}</div>
                 </div>
                 <MenuItem icon="swap" label="Cambiar proyecto" onClick={() => { fe.setProfileMenuOpen(false); onBack(); }} />
                 {/* Salida al Hub sin cerrar sesión: desde dentro de un proyecto
                     no había ninguna. */}
                 {onBackToHub && (
                   <MenuItem icon="home" label="Ir al inicio" onClick={() => { fe.setProfileMenuOpen(false); onBackToHub(); }} />
                 )}
                 <MenuItem icon="exit" label="Cerrar sesión" danger divider onClick={() => { fe.setProfileMenuOpen(false); if (onLogout) onLogout(); }} />
               </div>
             )}
          </div>
        </div>
      </header>

      {/* ─── MAIN LAYOUT ─── */}
      <main className="acc-main-layout" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* GLOBAL SIDEBAR */}
        <div style={{ width: globalSidebarWidth, flexShrink: 0, borderRight: '1px solid #dcdcdc', background: '#fff', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <ul style={{ listStyle: 'none', padding: '8px 0', margin: 0 }}>
              {[
                { label: 'Archivos', mode: 'files', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5,5l2,2H20v12h-16V5H12.5 M13.17,3h-10.34A1.83,1.83,0,0,0,1,4.83v14.34A1.83,1.83,0,0,0,2.83,21h18.34A1.83,1.83,0,0,0,23,19.17V6.83A1.83,1.83,0,0,0,21.17,5H14.83Z"/></svg>, onClick: () => { fe.setSidebarView('files'); fe.switchMode(false); } },
                { label: 'Red Line', mode: 'redlines', icon: <svg width="22" height="22" viewBox="0 0 24 24"><text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fill="currentColor" fontWeight="bold" fontSize="14" fontFamily="sans-serif">RL</text></svg>, onClick: () => fe.setSidebarView('redlines') },
                { label: 'Informes', mode: 'reports', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M19,3H5C3.9,3,3,3.9,3,5v14c0,1.1,0.9,2,2,2h14c1.1,0,2-0.9,2-2V5C21,3.9,20.1,3,19,3z M9,17H7v-7h2V17z M13,17h-2V7h2V17z M17,17h-2v-4h2V17z"/></svg>, onClick: () => fe.setSidebarView('reports') },
                { label: 'Miembros', mode: 'members', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>, onClick: () => { fe.setSidebarView('members'); fe.setMembersLoading(true); apiFetch(`${API}/api/users`).then(r => r.json()).then(d => fe.setMembersList(d.users || d || [])).catch(() => { fe.setMembersList([]); toast.error('No se pudieron cargar los miembros.'); }).finally(() => fe.setMembersLoading(false)); } },
                { label: 'Configuración', mode: 'settings', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>, onClick: () => fe.setSidebarView('settings') },
                { label: 'Revisiones', mode: 'reviews', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>, onClick: () => fe.setSidebarView('reviews') },
                { label: 'Transmittals', mode: 'transmittals', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>, onClick: () => fe.setSidebarView('transmittals') },
                { label: 'Conjuntos', mode: 'sets', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>, onClick: () => fe.setSidebarView('sets') },
                { label: 'Actividad', mode: 'activity', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, onClick: () => fe.setSidebarView('activity') },
                { label: 'Multimedia', mode: 'multimedia', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>, onClick: () => fe.setSidebarView('multimedia') },
                // Sala de Cuarentena ISO 19650: solo admins (las acciones dentro son destructivas)
                ...(isAdmin ? [{ label: 'Cuarentena', mode: 'quarantine', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>, onClick: () => fe.setSidebarView('quarantine') }] : []),
              ].map((item, idx) => (
                <li key={idx} style={{ marginBottom: 2 }}>
                  <button onClick={() => { if (item.onClick) item.onClick(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '8px 12px',
                      background: fe.sidebarView === item.mode && !fe.isTrashMode ? '#eef2f7' : 'none', border: 'none',
                      color: fe.sidebarView === item.mode && !fe.isTrashMode ? '#5f7fa3' : '#5f6368', fontSize: '13px',
                      fontWeight: fe.sidebarView === item.mode && !fe.isTrashMode ? '500' : '400', borderRadius: '0 20px 20px 0', cursor: 'pointer' }}>
                    {item.icon}
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                  </button>
                </li>
              ))}
              <li style={{ marginBottom: 2 }}>
                <button onClick={() => fe.switchMode(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '8px 12px',
                    background: fe.isTrashMode ? '#eef2f7' : 'none', border: 'none',
                    color: fe.isTrashMode ? '#5f7fa3' : '#5f6368', fontSize: '13px',
                    fontWeight: fe.isTrashMode ? '500' : '400', cursor: 'pointer', borderRadius: '0 20px 20px 0', transition: 'background 0.2s' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M11 15H5a2.25 2.25 0 0 1-2.25-2.25V5.72a.75.75,0,0,1 1.5 0v7.07a.74.74,0,0,0 .75.75h6a.74.74,0,0,0 .75-.75V5.72a.75.75,0,0,1 1.5 0v7.07A2.25 2.25 0 0 1 11 15Zm3-12h-3a2.26 2.26 0 0 0-2.24-2h-1.5A2.26 2.26 0 0 0 5 3H2a.75.75,0,0,0 0 1.5h12A.75.75,0,0,0,14 3Zm-3.75 8V7.22a.75.75,0,0,0-1.5 0V11a.75.75,0,0,0 1.5 0Zm-3 0V7.22a.75.75,0,0,0-1.5 0V11a.75.75,0,0,0 1.5 0Z"></path></svg>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Elementos suprimidos</span>
                </button>
              </li>
            </ul>
          </div>
          <div className="sidebar-bottom" style={{ padding: '12px 16px', borderTop: '1px solid #eee' }}>
            <button onClick={() => setGlobalSidebarWidth(globalSidebarWidth > 100 ? 60 : 240)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>
               <svg height="24" width="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20.75,12a.75.75,0,0,1-.75.75H10.49L12.76,15a.74.74,0,0,1,0,1.06.75.75,0,0,1-.53.22.79.79,0,0,1-.53-.22L8.15,12.53A.78.78,0,0,1,8,12.29a.73.73,0,0,1,0-.58.78.78,0,0,1,.16-.24L11.7,7.92a.75.75,0,0,1,1.06,0,.74.74,0,0,1,0,1.06l-2.27,2.27H20A.76.76,0,0,1,20.75,12Zm-16,8V4a.75.75,0,0,0-1.5,0V20a.75.75,0,0,0,1.5,0Z"></path></svg>
            </button>
          </div>
        </div>

        {/* CONTENT AREA */}
        <div className="acc-docs-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Suspense fallback={<ChunkFallback />}>

        {/* QUARANTINE VIEW */}
        {fe.sidebarView === 'quarantine' && !fe.isTrashMode && (
          <QuarantineTable projectPrefix={projectPrefix} API={API} isAdmin={isAdmin} user={user} />
        )}

        {/* ACTIVITY VIEW */}
        {fe.sidebarView === 'activity' && (
          <ActivityView projectPrefix={projectPrefix} />
        )}

        {/* REVIEWS VIEW */}
        {fe.sidebarView === 'reviews' && (
          <ReviewsView projectPrefix={projectPrefix} user={user} isAdmin={isAdmin} />
        )}

        {/* TRANSMITTALS VIEW */}
        {fe.sidebarView === 'transmittals' && (
          <TransmittalsView projectPrefix={projectPrefix} />
        )}

        {/* SETS VIEW */}
        {fe.sidebarView === 'sets' && (
          <SetsView projectPrefix={projectPrefix} isAdmin={isAdmin} />
        )}

        {/* RED LINES VIEW */}
        {fe.sidebarView === 'redlines' && (
          <RedLineModule project={project} API={API} user={user} isAdmin={isAdmin} />
        )}

        {/* MULTIMEDIA VIEW */}
        {fe.sidebarView === 'multimedia' && (
          <MultimediaModule project={project} user={user} />
        )}

        {/* REPORTS VIEW */}
        {fe.sidebarView === 'reports' && (
          <div style={{ padding: 32, flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: 24, fontWeight: 300, marginBottom: 24 }}>Informes</div>
            <div style={{ background: '#f8f9fa', borderRadius: 12, padding: 48, textAlign: 'center', border: '2px dashed #dcdcdc' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="#b0b0b0" style={{ marginBottom: 16 }}><path d="M19,3H5C3.9,3,3,3.9,3,5v14c0,1.1,0.9,2,2,2h14c1.1,0,2-0.9,2-2V5C21,3.9,20.1,3,19,3z M9,17H7v-7h2V17z M13,17h-2V7h2V17z M17,17h-2v-4h2V17z"/></svg>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#333', marginBottom: 8 }}>Informes del Proyecto</div>
              <div style={{ fontSize: 13, color: '#888', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>Los informes generados aparecerán aquí.</div>
              <div style={{ marginTop: 24, padding: '10px 20px', background: '#eef2f7', borderRadius: 6, display: 'inline-block', color: '#5f7fa3', fontSize: 13, fontWeight: 500 }}>Próximamente disponible</div>
            </div>
          </div>
        )}

        {/* MEMBERS VIEW */}
        {fe.sidebarView === 'members' && (
          <div style={{ padding: 32, flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div style={{ fontSize: 24, fontWeight: 300 }}>Miembros</div>
              <div style={{ fontSize: 13, color: '#888' }}>{fe.membersList.length} miembro{fe.membersList.length !== 1 ? 's' : ''}</div>
            </div>
            {fe.membersLoading ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#888' }}>Cargando miembros...</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ borderBottom: '2px solid #eee', color: '#888', fontWeight: 500 }}><th style={{ padding: '10px 12px', textAlign: 'left' }}>Nombre</th><th style={{ padding: '10px 12px', textAlign: 'left' }}>Email</th><th style={{ padding: '10px 12px', textAlign: 'left' }}>Rol</th><th style={{ padding: '10px 12px', textAlign: 'left' }}>Registro</th></tr></thead>
                <tbody>
                  {fe.membersList.map((m, i) => (
                    <tr key={m.id || i} style={{ borderBottom: '1px solid #f0f0f0' }} onMouseOver={e => e.currentTarget.style.background='#fafbfc'} onMouseOut={e => e.currentTarget.style.background='none'}>
                      <td style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: m.role === 'admin' ? '#5f7fa3' : '#5f7fa3', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{getInitials(m.name || m.email || '?')}</div>
                        <span style={{ fontWeight: 500 }}>{m.name || '—'}</span>
                      </td>
                      <td style={{ padding: '12px', color: '#666' }}>{m.email}</td>
                      <td style={{ padding: '12px' }}><span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', background: m.role === 'admin' ? '#eef2f7' : '#eef2f7', color: m.role === 'admin' ? '#4d6a8f' : '#4d6a8f' }}>{m.role || 'user'}</span></td>
                      <td style={{ padding: '12px', color: '#999', fontSize: 12 }}>{m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* SETTINGS VIEW */}
        {fe.sidebarView === 'settings' && (
          <div style={{ padding: 32, flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: 24, fontWeight: 300, marginBottom: 24 }}>Configuración</div>
            <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="#5f7fa3"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>Información del Proyecto</div>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '12px 16px', fontSize: 13 }}>
                <span style={{ color: '#888', fontWeight: 500 }}>Nombre:</span><span style={{ color: '#333' }}>{project.name}</span>
                <span style={{ color: '#888', fontWeight: 500 }}>Número:</span><span style={{ color: '#333' }}>{project.number || '—'}</span>
                <span style={{ color: '#888', fontWeight: 500 }}>Ubicación:</span><span style={{ color: '#333' }}>{project.location || '—'}</span>
                <span style={{ color: '#888', fontWeight: 500 }}>Cuenta:</span><span style={{ color: '#333' }}>{project.account || project.hub_name || '—'}</span>
                <span style={{ color: '#888', fontWeight: 500 }}>Creado:</span><span style={{ color: '#333' }}>{project.created_at ? new Date(project.created_at).toLocaleDateString() : '—'}</span>
              </div>
            </div>
            {isAdmin && <AttributesAdmin projectPrefix={projectPrefix} />}
            {isAdmin && <SharesManager projectPrefix={projectPrefix} />}
            <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="#5f7fa3"><path d="M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z"/></svg>Almacenamiento</div>
              <div style={{ fontSize: 13, color: '#888' }}>Google Cloud Storage — activo</div>
              <div style={{ marginTop: 12, background: '#f5f5f5', borderRadius: 8, height: 8, overflow: 'hidden' }}><div style={{ width: '15%', height: '100%', background: 'linear-gradient(90deg, #5f7fa3, #7e9bbd)', borderRadius: 8 }} /></div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>Uso estimado del proyecto</div>
            </div>
          </div>
        )}

        {/* FILES VIEW */}
        {fe.sidebarView === 'files' && (<>
          <header style={{ padding: '24px 24px 0 24px', flexShrink: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 300, marginBottom: 16 }}>{fe.isTrashMode ? 'Elementos suprimidos' : 'Archivos'}</div>
            {!fe.isTrashMode && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #dcdcdc' }}>
                <div style={{ display: 'flex', gap: 32 }}>
                  <div style={{ paddingBottom: 8, fontSize: 13, borderBottom: '2px solid #5f7fa3', color: '#5f7fa3', fontWeight: 600 }}>Carpetas</div>
                </div>
                <div style={{ display: 'flex', gap: 20, paddingBottom: 8 }}>
                   <button onClick={() => fe.switchMode(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: '#666', fontSize: 13, cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}>
                     <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor"><path d="M11 15H5a2.25 2.25 0 0 1-2.25-2.25V5.72a.75.75,0,0,1 1.5 0v7.07a.74.74,0,0,0 .75.75h6a.74.74,0,0,0 .75-.75V5.72a.75.75,0,0,1 1.5 0v7.07A2.25 2.25 0 0 1 11 15Zm3-12h-3a2.26 2.26 0 0 0-2.24-2h-1.5A2.26 2.26 0 0 0 5 3H2a.75.75,0,0,0 0 1.5h12A.75.75,0,0,0,14 3Zm-3.75 8V7.22a.75.75,0,0,0-1.5 0V11a.75.75,0,0,0 1.5 0Zm-3 0V7.22a.75.75,0,0,0-1.5 0V11a.75.75,0,0,0 1.5 0Z"></path></svg>
                     Elementos suprimidos
                   </button>
                </div>
              </div>
            )}
            {fe.isTrashMode && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #dcdcdc', paddingBottom: 8 }}>
                 <button onClick={() => fe.switchMode(false)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: '#666', fontSize: 13, cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}>
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
                   Volver a archivos
                 </button>
                 {isAdmin && fe.selectedDeletedIds.length > 0 && (
                   <button onClick={async () => {
                       const count = fe.selectedDeletedIds.length;
                       const ok = await confirmAction({
                         title: 'Eliminar permanentemente',
                         message: `Se eliminarán ${count} elemento(s) de forma irreversible. Esta acción no se puede deshacer.`,
                         confirmText: 'Eliminar',
                         danger: true,
                       });
                       if (!ok) return;
                       let deleted = 0;
                       for (const id of fe.selectedDeletedIds) {
                         try {
                           const res = await apiFetch(`${API}/api/docs/permanent-delete`, { method: 'DELETE', body: JSON.stringify({ id, model_urn: projectPrefix, user: user.name }) });
                           if (res.ok) deleted++; else { const errBody = await res.text(); toast.error('Error eliminando: ' + errBody); }
                         } catch (e) { toast.error('Error: ' + e.message); }
                       }
                       fe.setDeletedItems(prev => prev.filter(it => !fe.selectedDeletedIds.includes(it.id)));
                       fe.setSelectedDeletedIds([]);
                       fe.triggerRefresh(fe.currentPath);
                       toast.success(deleted + ' de ' + count + ' eliminado(s) permanentemente.');
                     }}
                     style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#d32f2f', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', padding: '6px 14px', borderRadius: 4, fontWeight: 600 }}>
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                     Eliminar permanentemente ({fe.selectedDeletedIds.length})
                   </button>
                 )}
              </div>
            )}
          </header>

          <div className="acc-workspace" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* TREE SECTION */}
            <aside style={{ width: treeSidebarWidth, flexShrink: 0, borderRight: '1px solid #dcdcdc', background: '#fff', overflowY: 'auto', padding: '16px 0' }}>
              <FolderNode
                user={user} folder={{ id: fe.projectRootId, name: 'Archivos de proyecto', fullName: projectPrefix }}
                currentPath={fe.currentPath} onNavigate={fe.navigate} onReset={() => fe.setCollapseSignal(s => s+1)}
                collapseSignal={fe.collapseSignal} projectPrefix={projectPrefix} level={0} defaultExpanded={true}
                isAdmin={isAdmin} onTreeRefresh={() => {}} onGlobalRefresh={(p) => { fe.triggerRefresh(fe.currentPath); if (p) fe.navigate(p); }}
                refreshSignal={fe.refreshSignal} onInitiateMove={(items) => fe.setMoveState({ step: 1, items, destPath: '' })}
                onRowMenu={(item, e) => { fe.setRightClickedId(item.id); fe.setActiveRowMenu({ item, x: e.clientX, y: e.clientY, source: 'sidebar' }); }}
                editingNodeId={fe.editingNodeId} setEditingNodeId={fe.setEditingNodeId}
                rightClickedId={fe.rightClickedId} processingIds={fe.processingIds} setProcessingIds={fe.setProcessingIds}
                creatingChildParentId={fe.creatingChildParentId} setCreatingChildParentId={fe.setCreatingChildParentId}
                cacheMethods={fe.cacheMethods}
              />
            </aside>

            {/* RESIZER */}
            <div onMouseDown={startTreeResize} style={{ width: 8, cursor: 'col-resize', background: '#fcfcfc', borderRight: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 2, height: 24, background: '#eee', borderRadius: 1 }} />
            </div>

            {/* DATA PANEL */}
            <section style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div className="acc-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#fff', borderBottom: '1px solid #eee', flexShrink: 0 }}>
                {isAdmin && !fe.isTrashMode && (
                  <button onClick={() => fe.setShowUploadModal(true)} style={{ padding: '6px 16px', background: '#5f7fa3', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cargar archivos</button>
                )}
                {isAdmin && !fe.isTrashMode && (
                  <button onClick={() => { fe.setNewFolderParentPath(''); fe.setShowNewFolder(true); }} title="Crear carpeta en la ubicación actual"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#fff', color: '#5f7fa3', border: '1px solid #5f7fa3', borderRadius: 4, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
                    Nueva carpeta
                  </button>
                )}

                {!fe.isTrashMode && fe.selected.size > 0 && (() => {
                  const selFiles = fe.files.filter(f => fe.selected.has(f.fullName));
                  if (!selFiles.length) return null;
                  return (
                    <button onClick={() => setReviewModalItems(selFiles.map(f => ({ node_id: f.id, name: f.name, version: f.version || 1 })))}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: '#5f7fa3', fontSize: 13, cursor: 'pointer', padding: '6px 8px' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Enviar a revisión
                    </button>
                  );
                })()}

                {!fe.isTrashMode && fe.selected.size > 0 && (() => {
                  const selFiles = fe.files.filter(f => fe.selected.has(f.fullName));
                  if (!selFiles.length) return null;
                  return (
                    <button onClick={() => setTransmittalItems(selFiles.map(f => ({ node_id: f.id, name: f.name, version: f.version || 1 })))}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: '#5f7fa3', fontSize: 13, cursor: 'pointer', padding: '6px 8px' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Transmittal
                    </button>
                  );
                })()}

                {!fe.isTrashMode && fe.selected.size > 0 && (() => {
                  const selFiles = fe.files.filter(f => fe.selected.has(f.fullName));
                  if (!selFiles.length) return null;
                  return (
                    <button onClick={() => setSetModalItems(selFiles.map(f => ({ node_id: f.id, name: f.name, version: f.version || 1 })))}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: '#5f7fa3', fontSize: 13, cursor: 'pointer', padding: '6px 8px' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> Añadir a conjunto
                    </button>
                  );
                })()}

                {!fe.isTrashMode && isAdmin && fe.selected.size > 0 && (
                  <>
                    <button onClick={() => {
                        const itemsToMove = Array.from(fe.selected);
                        const itemIds = itemsToMove.map(fn => { const found = [...fe.folders, ...fe.files].find(i => i.fullName === fn); return found?.id; }).filter(id => id !== undefined);
                        fe.setMoveState({ step: 1, items: itemsToMove, itemIds, destPath: '', destId: null });
                      }} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: '#5f7fa3', fontSize: 13, cursor: 'pointer', padding: '6px 8px' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><path d="M12 11l3 3-3 3"></path><path d="M9 14h6"></path></svg> Desplazar
                    </button>
                    <button onClick={fe.handleExecuteBatchDelete} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: '#ff4d4d', fontSize: 13, cursor: 'pointer', padding: '6px 8px' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg> Suprimir
                    </button>
                  </>
                )}

                {fe.isTrashMode && fe.selectedDeletedIds.length > 0 && (
                  <button onClick={() => {
                      const ids = [...fe.selectedDeletedIds];
                      const newRestoring = { ...fe.restoringIds }; ids.forEach(id => { newRestoring[id] = true; }); fe.setRestoringIds(newRestoring);
                      setTimeout(async () => {
                        try { const res = await Promise.all(ids.map(id => apiFetch(`${API}/api/docs/restore`, { method: 'POST', body: JSON.stringify({ id, model_urn: projectPrefix, user: user.name }) }))); if (!res.every(r => r.ok)) toast.error("No se pudieron restaurar algunos archivos."); } catch(e) { toast.error("Error de conexión al restaurar"); }
                        fe.setDeletedItems(prev => prev.filter(it => !ids.includes(it.id))); fe.setSelectedDeletedIds([]); fe.setRestoringIds(prev => { const c = {...prev}; ids.forEach(id => { delete c[id]; }); return c; }); fe.triggerRefresh(fe.currentPath);
                      }, 1000);
                    }} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #747775', borderRadius: 4, color: '#1f1f1f', fontSize: 13, fontWeight: 500, padding: '6px 12px', cursor: 'pointer' }}>
                     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/></svg> Restaurar ({fe.selectedDeletedIds.length})
                  </button>
                )}

                <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" style={{ position: 'absolute', left: 8, top: 9 }}><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                  <input type="text" placeholder="Buscar y filtrar" value={fe.searchQuery} onChange={e => fe.setSearchQuery(e.target.value)} style={{ width: '100%', height: 32, paddingLeft: 30, paddingRight: 8, border: '1px solid #ddd', borderRadius: 4, fontSize: 13, outline: 'none' }} />
                </div>

                {!fe.isTrashMode && (
                  <select value={fe.statusFilter} onChange={e => fe.setStatusFilter(e.target.value)}
                    title="Filtrar por estado de revisión"
                    style={{ height: 32, padding: '0 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, color: fe.statusFilter === 'ALL' ? '#666' : '#5f7fa3', fontWeight: fe.statusFilter === 'ALL' ? 400 : 600, background: '#fff', cursor: 'pointer', outline: 'none' }}>
                    <option value="ALL">Todos los estados</option>
                    <option value="WIP">WIP</option>
                    <option value="SHARED">Compartido</option>
                    <option value="PUBLISHED">Publicado</option>
                    <option value="ARCHIVED">Archivado</option>
                  </select>
                )}

              </div>

              {/* BREADCRUMBS — ruta actual con navegación clickeable */}
              {!fe.isTrashMode && (() => {
                const rel = fe.currentPath.startsWith(projectPrefix)
                  ? fe.currentPath.slice(projectPrefix.length).replace(/^\/+|\/+$/g, '')
                  : '';
                const segments = rel ? rel.split('/') : [];
                return (
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, padding: '8px 16px', fontSize: 13, background: '#fafbfc', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
                    <span
                      onClick={() => fe.navigate(projectPrefix + '/', null)}
                      style={{ cursor: segments.length ? 'pointer' : 'default', color: segments.length ? '#5f7fa3' : '#333', fontWeight: segments.length ? 500 : 600 }}
                    >
                      Archivos de proyecto
                    </span>
                    {segments.map((seg, i) => {
                      const isLast = i === segments.length - 1;
                      const pathTo = projectPrefix + '/' + segments.slice(0, i + 1).join('/') + '/';
                      return (
                        <React.Fragment key={pathTo}>
                          <span style={{ color: '#bbb' }}>/</span>
                          <span
                            onClick={() => { if (!isLast) fe.navigate(pathTo, null); }}
                            style={{ cursor: isLast ? 'default' : 'pointer', color: isLast ? '#333' : '#5f7fa3', fontWeight: isLast ? 600 : 500 }}
                          >
                            {seg}
                          </span>
                        </React.Fragment>
                      );
                    })}
                  </div>
                );
              })()}

              <div style={{ flex: 1, overflow: 'hidden' }}>
                {globalResults !== null && !fe.isTrashMode ? (
                  <div style={{ height: '100%', overflowY: 'auto', background: '#fff' }}>
                    <div style={{ padding: '10px 16px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{globalResults.length} resultado{globalResults.length !== 1 ? 's' : ''} en todo el proyecto para "{fe.searchQuery}"</span>
                      <button onClick={() => fe.setSearchQuery('')} style={{ background: 'none', border: 'none', color: '#5f7fa3', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✕ Limpiar</button>
                    </div>
                    {globalResults.length === 0 && (
                      <div style={{ padding: 48, textAlign: 'center', color: '#999', fontSize: 13 }}>Sin coincidencias en nombres de archivos o carpetas.</div>
                    )}
                    {globalResults.map(r => {
                      const isFolder = r.type === 'FOLDER';
                      const dir = r.path.includes('/') ? r.path.slice(0, r.path.lastIndexOf('/')) : '';
                      return (
                        <div key={r.id}
                          onClick={() => {
                            fe.setSearchQuery('');
                            if (isFolder) {
                              fe.navigate(`${projectPrefix}/${r.path}/`, r.id);
                            } else {
                              if (dir) fe.navigate(`${projectPrefix}/${dir}/`, null);
                              fe.setActiveFile({ id: r.id, name: r.name, type: 'file', fullName: r.path, version: r.version });
                            }
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #f4f4f4', cursor: 'pointer' }}
                          onMouseOver={e => e.currentTarget.style.background = '#f4f6f9'}
                          onMouseOut={e => e.currentTarget.style.background = 'none'}>
                          {isFolder
                            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="#c2a878"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>
                            : renderFileIconSop(r.name, 20)}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                            <div style={{ fontSize: 11, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dir || 'Archivos de proyecto'}</div>
                          </div>
                          {!isFolder && <span style={{ fontSize: 11, color: '#5f7fa3', fontWeight: 600 }}>V{r.version || 1}</span>}
                          <span style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }}>{r.updated_at ? formatDate(r.updated_at) : ''}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : fe.loading ? (
                    <div style={{ padding: 40, textAlign: 'center' }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
                ) : fe.isTrashMode ? (
                    <DeletedTable items={fe.deletedItems} selectedIds={fe.selectedDeletedIds} onToggle={fe.setSelectedDeletedIds}
                      onRestore={(id) => { fe.setRestoringIds(prev => ({ ...prev, [id]: true })); setTimeout(async () => { try { const res = await apiFetch(`${API}/api/docs/restore`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ id, model_urn: projectPrefix, user: user.name }) }); if (!res.ok) { const errData = await res.json().catch(() => ({})); toast.error(errData.error || "No se pudo restaurar."); } } catch(e) { toast.error("Error de conexión al restaurar"); } fe.setDeletedItems(prev => prev.filter(it => it.id !== id)); fe.setSelectedDeletedIds(prev => prev.filter(x => x !== id)); fe.setRestoringIds(prev => { const c = {...prev}; delete c[id]; return c; }); fe.triggerRefresh(fe.currentPath); }, 1000); }}
                      getInitials={getInitials} restoringIds={fe.restoringIds} />
                ) : (
                    <MatrixTable folders={fe.filteredFolders} files={fe.filteredFiles} selected={fe.selected}
                      columnWidths={columnWidths} totalTableWidth={totalTableWidth} toggle={fe.toggle} navigate={fe.navigate}
                      setActiveFile={fe.setActiveFile}
                      onUpdateDescription={async (item, newDesc) => { if (item.type === 'folder') fe.setFolders(prev => prev.map(f => f.id === item.id ? { ...f, description: newDesc } : f)); else fe.setFiles(prev => prev.map(f => f.id === item.id ? { ...f, description: newDesc } : f)); try { const res = await apiFetch(`${API}/api/docs/description`, { method: 'POST', body: JSON.stringify({ node_id: item.id, description: newDesc, model_urn: projectPrefix }) }); if (res.ok) fe.triggerRefresh(fe.currentPath); else { toast.error('No se pudo guardar la descripción.'); fe.triggerRefresh(fe.currentPath); } } catch (e) { toast.error('Error de conexión al guardar la descripción.'); fe.triggerRefresh(fe.currentPath); } }}
                      onRename={async (item, newName) => {
                        // COHERENCIA TABLA ↔ ÁRBOL: al renombrar una carpeta desde la
                        // tabla hay que actualizar TAMBIÉN el caché del árbol (mismo
                        // camino optimista que usa FolderNode), si no el panel
                        // izquierdo seguía mostrando el nombre viejo hasta refrescar.
                        const isFolder = item.type === 'folder';
                        const oldName = item.name;
                        fe.setProcessingIds(prev => ({ ...prev, [item.id]: true }));
                        if (isFolder) fe.setFolders(prev => prev.map(f => f.id === item.id ? { ...f, name: newName } : f));
                        else fe.setFiles(prev => prev.map(f => f.id === item.id ? { ...f, name: newName } : f));
                        if (isFolder && fe.cacheMethods) fe.cacheMethods.optimisticRename(fe.currentNodeId, item.id, newName);
                        try {
                          const res = await apiFetch(`${API}/api/docs/rename`, { method: 'POST', body: JSON.stringify({ node_id: item.id, new_name: newName, model_urn: projectPrefix }) });
                          if (res.ok) {
                            if (isFolder && fe.cacheMethods) fe.cacheMethods.commitRename(fe.currentNodeId, item.id);
                            fe.setRefreshSignal(s => s + 1);
                          } else {
                            if (isFolder && fe.cacheMethods) fe.cacheMethods.rollbackRename(fe.currentNodeId, item.id, oldName);
                            toast.error('No se pudo renombrar (nombre inválido o duplicado).');
                            fe.triggerRefresh(fe.currentPath);
                          }
                        } catch (e) {
                          if (isFolder && fe.cacheMethods) fe.cacheMethods.rollbackRename(fe.currentNodeId, item.id, oldName);
                          toast.error('No se pudo renombrar: error de conexión.');
                          fe.triggerRefresh(fe.currentPath);
                        } finally {
                          fe.setProcessingIds(prev => { const n = {...prev}; delete n[item.id]; return n; });
                        }
                      }}
                      formatSize={formatSize} formatDate={formatDate} getInitials={getInitials} user={user} isAdmin={isAdmin}
                      isTrashMode={fe.isTrashMode} onShowVersions={vh.onShowVersions}
                      onRowMenu={(item, e) => { fe.setRightClickedId(item.id); fe.setActiveRowMenu({ item, x: e.clientX, y: e.clientY, source: 'table' }); }}
                      editingNodeId={fe.editingNodeId} setEditingNodeId={fe.setEditingNodeId} processingIds={fe.processingIds}
                      rightClickedId={fe.rightClickedId} startResizing={startResizing} setSelected={fe.setSelected}
                      renderFileIconSop={renderFileIconSop}
                      onStatusChange={async (item, newStatus) => { fe.setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: newStatus } : f)); try { const res = await apiFetch(`${API}/api/docs/batch`, { method: 'POST', body: JSON.stringify({ items: [item.id], action: 'SET_STATUS', status: newStatus, model_urn: projectPrefix, user: user?.name }) }); if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.error || 'Error al cambiar estado'); fe.triggerRefresh(fe.currentPath); } } catch (e) { fe.triggerRefresh(fe.currentPath); } }}
                    />
                )}
              </div>
              <footer style={{ padding: '8px 16px', fontSize: 13, color: '#666', borderTop: '1px solid #eee', background: '#fff', flexShrink: 0 }}>
                {fe.selected.size > 0
                  ? `${fe.selected.size} de ${fe.folders.length + fe.files.length} seleccionados`
                  : `Mostrando ${fe.filteredFolders.length + fe.filteredFiles.length}${fe.statusFilter !== 'ALL' || fe.searchQuery ? ` de ${fe.folders.length + fe.files.length}` : ''} elementos`}
              </footer>
            </section>
          </div>
        </>)}
        </Suspense>
        </div>
      </main>

      {/* ═══════════════════════════════════════ */}
      {/* MODALS & OVERLAYS (Fase 2 Components)  */}
      {/* ═══════════════════════════════════════ */}
      {/* fallback null: los overlays aparecen al terminar de cargar, sin
          parpadear un spinner a pantalla completa sobre el explorador. */}
      <Suspense fallback={null}>

      <VersionPanel isOpen={vh.tableShowVersions} versionTarget={vh.versionTarget} versionHistory={vh.versionHistory}
        loadingVersions={vh.loadingVersions} versionPanelWidth={versionPanelWidth} startVersionResize={startVersionResize}
        selectedVersions={vh.selectedVersions} setSelectedVersions={vh.setSelectedVersions}
        versionRowMenu={vh.versionRowMenu} setVersionRowMenu={vh.setVersionRowMenu}
        projectPrefix={projectPrefix} isAdmin={isAdmin} onClose={() => vh.setTableShowVersions(false)} onPromote={vh.handlePromote} />

      <ContextMenu activeRowMenu={fe.activeRowMenu} menuRef={fe.menuRef} isAdmin={isAdmin} projectPrefix={projectPrefix}
        onClose={() => { fe.setActiveRowMenu(null); fe.setRightClickedId(null); }}
        onCreateChild={(id) => fe.setCreatingChildParentId(id)}
        onOpenPermissions={(item) => fe.setPermissionsFolder(item)}
        onRename={(data) => fe.setEditingNodeId(data)}
        onShare={(item) => { fe.setShareTarget(item); fe.setShowShareModal(true); }}
        onMove={(item) => fe.setMoveState({ step: 1, items: [item.name], itemIds: [item.id || item.fullName], destPath: '', destId: null })}
        onDelete={(fullName, id) => { fe.setDeleteTask({ ids: [], count: 1, single: { fullName, id } }); fe.setShowDeleteModal(true); }}
        onAttributes={(item) => setAttributesItem(item)} />

      {attributesItem && (
        <AttributesPanel item={attributesItem} projectPrefix={projectPrefix} isAdmin={isAdmin}
          onClose={() => setAttributesItem(null)} />
      )}

      <NewFolderModal isOpen={fe.showNewFolder} folderName={fe.folderName} onFolderNameChange={fe.setFolderName} onCreate={fe.createFolder} onClose={() => fe.setShowNewFolder(false)} />

      {fe.permissionsFolder && (<FolderPermissionsPanel folder={fe.permissionsFolder} modelUrn={projectPrefix} apiBaseUrl={API} onClose={() => fe.setPermissionsFolder(null)} />)}

      {fe.activeFile && fe.activeFile.type !== 'folder' && (
        <DocumentViewer file={fe.activeFile} projectPrefix={projectPrefix} versionHistory={vh.versionHistory}
          viewedVersionInfo={fe.viewedVersionInfo} setViewedVersionInfo={fe.setViewedVersionInfo}
          showVersions={fe.showVersions} setShowVersions={fe.setShowVersions} isAdmin={isAdmin}
          onPromote={vh.handlePromote} API={API}
          onClose={() => { fe.setActiveFile(null); fe.setShowVersions(false); fe.setViewedVersionInfo(null); }} />
      )}

      <DeleteModal isOpen={fe.showDeleteModal} deleteTask={fe.deleteTask} onConfirm={fe.confirmBatchDelete} onClose={() => fe.setShowDeleteModal(false)} />

      <MoveModal moveState={fe.moveState} setMoveState={fe.setMoveState} projectPrefix={projectPrefix} projectRootId={fe.projectRootId} onExecuteMove={fe.handleExecuteMove} />

      {fe.pendingBanner && fe.pendingBanner.count > 0 && (
        <div 
          onClick={() => { fe.setShowUploadModal(true); fe.setSopMinimized(false); fe.setPendingBanner(null); }}
          style={{ position: 'fixed', top: 50, left: '50%', transform: 'translateX(-50%)', zIndex: 10001, background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 8, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxWidth: 500, cursor: 'pointer', transition: 'transform 0.2s' }}
          onMouseOver={e => e.currentTarget.style.transform = 'translateX(-50%) scale(1.02)'}
          onMouseOut={e => e.currentTarget.style.transform = 'translateX(-50%) scale(1)'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#ff9800"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
          <span style={{ fontSize: 13, color: '#333' }}>Tienes <strong>{fe.pendingBanner.count}</strong> {fe.pendingBanner.count === 1 ? 'subida pendiente' : 'subidas pendientes'} de una sesión anterior. <u>Haz clic para reanudar o cancelar.</u></span>
          <button onClick={(e) => { e.stopPropagation(); fe.setPendingBanner(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#999', padding: '0 8px', marginLeft: 'auto' }}>✕</button>
        </div>
      )}

      <UploadModal isOpen={fe.showUploadModal} sopMinimized={fe.sopMinimized} setSopMinimized={fe.setSopMinimized}
        currentPath={fe.currentPath} chunkedUpload={fe.chunkedUpload} fileRef={fe.fileRef}
        dragOver={fe.dragOver} onDragOver={fe.onDragOver} onDragLeave={fe.onDragLeave} onDrop={fe.onDrop}
        onUpload={fe.handleSopUpload} onListo={fe.handleSopListo} onOpenUploaded={fe.openUploadedFile}
        onClose={() => fe.setShowUploadModal(false)} />

      <ShareModal isOpen={fe.showShareModal} shareTarget={fe.shareTarget} user={user} projectPrefix={projectPrefix}
        searchShareUser={fe.searchShareUser} setSearchShareUser={fe.setSearchShareUser}
        showShareResults={fe.showShareResults} setShowShareResults={fe.setShowShareResults}
        sharedUsers={fe.sharedUsers} setSharedUsers={fe.setSharedUsers} allProjectUsers={fe.allProjectUsers}
        shareGeneralAccess={fe.shareGeneralAccess} setShareGeneralAccess={fe.setShareGeneralAccess}
        shareGeneralRole={fe.shareGeneralRole} setShareGeneralRole={fe.setShareGeneralRole}
        shareLinkCopied={fe.shareLinkCopied} setShareLinkCopied={fe.setShareLinkCopied}
        onClose={() => fe.setShowShareModal(false)} />

      {/* Render CONDICIONAL: así el chunk del modal se descarga recién al abrirlo. */}
      {reviewModalItems !== null && (
        <ReviewModal isOpen items={reviewModalItems}
          projectPrefix={projectPrefix} user={user}
          onClose={() => setReviewModalItems(null)}
          onCreated={() => { fe.setSelected(new Set()); fe.setSidebarView('reviews'); }} />
      )}

      {transmittalItems !== null && (
        <TransmittalModal isOpen items={transmittalItems}
          projectPrefix={projectPrefix} user={user}
          onClose={() => setTransmittalItems(null)}
          onCreated={() => { fe.setSelected(new Set()); fe.setSidebarView('transmittals'); }} />
      )}

      {setModalItems !== null && (
        <AddToSetModal isOpen items={setModalItems}
          projectPrefix={projectPrefix}
          onClose={() => setSetModalItems(null)}
          onAdded={() => fe.setSelected(new Set())} />
      )}

      {/* GATEWAY 3D OVERLAY (FRENTES) */}
      {showGateway && DOCS_VISOR_SHORTCUT && (
        <GatewayPanel
          project={project}
          onClose={() => setShowGateway(false)}
        />
      )}

      </Suspense>
    </div>
  );
}

// ── Vista de Actividad del proyecto (feed estilo ACC) ──
const ACTIVITY_LABELS = {
  upload: { label: 'Subió', color: '#16a34a' },
  create_folder: { label: 'Creó carpeta', color: '#5f7fa3' },
  rename: { label: 'Renombró', color: '#f59e0b' },
  move: { label: 'Movió', color: '#5f7fa3' },
  delete: { label: 'Suprimió', color: '#e53935' },
  restore: { label: 'Restauró', color: '#5f7fa3' },
  permanent_delete: { label: 'Eliminó permanentemente', color: '#b71c1c' },
  set_status: { label: 'Cambió estado', color: '#1e88e5' },
  promote_version: { label: 'Promovió versión', color: '#5f7fa3' },
  share: { label: 'Compartió', color: '#5f7fa3' },
  delete_orphan_photo: { label: 'Purgó foto huérfana', color: '#999' },
};

function ActivityView({ projectPrefix }) {
  const [items, setItems] = React.useState(null);
  React.useEffect(() => {
    apiFetch(`${API}/api/activity?model_urn=${encodeURIComponent(projectPrefix)}&limit=150`)
      .then(r => r.json())
      .then(d => setItems(d.success ? d.data : []))
      .catch(() => { setItems([]); toast.error('No se pudo cargar la actividad del proyecto.'); });
  }, [projectPrefix]);

  return (
    <div style={{ padding: 32, flex: 1, overflowY: 'auto' }}>
      <div style={{ fontSize: 24, fontWeight: 300, marginBottom: 4 }}>Actividad</div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Registro de auditoría del proyecto — quién hizo qué y cuándo.</div>
      {items === null ? (
        <div style={{ textAlign: 'center', padding: 48 }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#999', fontSize: 13 }}>Aún no hay actividad registrada.</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
          {items.map((a, i) => {
            const cfg = ACTIVITY_LABELS[a.action] || { label: a.action, color: '#666' };
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #f4f4f4' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#eef3f8', color: '#456', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {getInitials(a.performed_by)}
                </div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                  <span style={{ fontWeight: 600, color: '#333' }}>{a.performed_by}</span>{' '}
                  <span style={{ color: cfg.color, fontWeight: 600 }}>{cfg.label.toLowerCase()}</span>{' '}
                  <span style={{ color: '#555', overflowWrap: 'anywhere' }}>{a.entity_name || ''}</span>
                  {a.details?.dest_parent_id && <span style={{ color: '#999' }}> (a otra carpeta)</span>}
                </div>
                <span style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }}>{formatDate(a.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
