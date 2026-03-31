/**
 * FilesPage.jsx — Orquestador Principal del Explorador de Archivos
 * Refactorización Fase 3: Capa de Orquestación
 * 
 * Este archivo NO contiene lógica compleja propia — solo orquesta:
 * - Hooks de datos (Fase 1)
 * - Componentes de UI (Fase 2)
 * - Layout JSX del explorador
 */
import React from 'react';
import { Toaster } from 'react-hot-toast';

// ── Fase 1: Hooks ──
import { useFileExplorer } from '../hooks/useFileExplorer';
import { useVersionHistory } from '../hooks/useVersionHistory';
import { useColumnResize, useSidebarResize, useVersionPanelResize } from '../hooks/useColumnResize';
import { API, getInitials, getAuthHeaders, formatSize, formatDate } from '../utils/helpers';
import { renderFileIconSop } from '../utils/fileIcons';
import { apiFetch } from '../utils/apiFetch';

// ── Fase 2: Modales y Paneles ──
import DeleteModal from '../components/modals/DeleteModal';
import NewFolderModal from '../components/modals/NewFolderModal';
import ShareModal from '../components/modals/ShareModal';
import MoveModal from '../components/modals/MoveModal';
import UploadModal from '../components/modals/UploadModal';
import VersionPanel from '../components/panels/VersionPanel';
import DeletedTable from '../components/panels/DeletedTable';
import GatewayPanel from '../components/panels/GatewayPanel';
import QuarantineTable from '../components/panels/QuarantineTable';
import ContextMenu from '../components/ContextMenu';

// ── Fase 3: Componentes de Layout ──
import FolderNode from '../components/FolderNode';
import MatrixTable from '../MatrixTable';
import DocumentViewer from '../components/DocumentViewer';
import FolderPermissionsPanel from '../components/FolderPermissionsPanel';

export default function FilesPage({ project, user, onBack, onLogout }) {
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

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════
  return (
    <div className="acc-root" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: '#fff' }}>
      <Toaster position="bottom-right" />
      <div className="acc-top-strip" style={{ height: 24, background: '#000', flexShrink: 0 }} />

      {/* ─── HEADER ─── */}
      <header className="acc-top-header" style={{ height: 48, borderBottom: '1px solid #dcdcdc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0 }}>
        <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="module-selector" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#0696d7', fontWeight: 600 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 12l2.12 2.12L12 6.24l7.88 7.88L22 12 12 2z"/></svg>
            <span style={{ fontSize: 14 }}>Docs</span>
          </div>
          <div className="separator-line" style={{ width: 1, height: 20, background: '#eee', margin: '0 8px' }} />
          <button 
            className="gateway-trigger-btn"
            onClick={() => setShowGateway(true)}
            style={{ 
              display: 'flex', alignItems: 'center', gap: 6, 
              background: '#0696d7', color: '#fff', 
              border: 'none', borderRadius: '4px', 
              padding: '4px 12px', fontSize: 13, 
              fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.2s'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
            Frentes 3D
          </button>
          <div className="separator-line" style={{ width: 1, height: 20, background: '#eee', margin: '0 8px' }} />
          <div className="project-selector" style={{ fontSize: 14, fontWeight: 600, color: '#333', textTransform: 'uppercase' }}>
            <span>{project.name}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 4 }}><path d="M7 10l5 5 5-5H7z"/></svg>
          </div>
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="header-nav-item" style={{ width: 24, height: 24, borderRadius: '50%', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#666', cursor: 'pointer' }}>?</div>
          <div className="header-user" style={{ position: 'relative' }}>
             <div className="header-avatar" onClick={() => fe.setProfileMenuOpen(!fe.profileMenuOpen)} style={{ width: 32, height: 32, borderRadius: '50%', background: '#ff6b35', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{getInitials(user.name)}</div>
             {fe.profileMenuOpen && (
               <div style={{ position: 'absolute', top: 40, right: 0, background: '#fff', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,.15)', minWidth: 220, zIndex: 9999, border: '1px solid #e5e5e5', overflow: 'hidden' }}>
                 <div style={{ padding: '14px 16px', borderBottom: '1px solid #eee' }}>
                   <div style={{ fontWeight: 600, fontSize: 13, color: '#333' }}>{user.name}</div>
                   <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{user.email}</div>
                   <div style={{ fontSize: 10, color: '#0696d7', marginTop: 4, textTransform: 'uppercase', fontWeight: 600 }}>{user.role || 'user'}</div>
                 </div>
                 <button onClick={() => { fe.setProfileMenuOpen(false); onBack(); }} style={{ width: '100%', padding: '10px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#333' }} onMouseOver={e => e.currentTarget.style.background='#f5f5f5'} onMouseOut={e => e.currentTarget.style.background='none'}>
                   <span style={{ fontSize: 16 }}>🔄</span> Cambiar proyecto
                 </button>
                 <button onClick={() => { fe.setProfileMenuOpen(false); if (onLogout) onLogout(); }} style={{ width: '100%', padding: '10px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#e53935', borderTop: '1px solid #eee' }} onMouseOver={e => e.currentTarget.style.background='#fff5f5'} onMouseOut={e => e.currentTarget.style.background='none'}>
                   <span style={{ fontSize: 16 }}>🚪</span> Cerrar sesión
                 </button>
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
                { label: 'Informes', mode: 'reports', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M19,3H5C3.9,3,3,3.9,3,5v14c0,1.1,0.9,2,2,2h14c1.1,0,2-0.9,2-2V5C21,3.9,20.1,3,19,3z M9,17H7v-7h2V17z M13,17h-2V7h2V17z M17,17h-2v-4h2V17z"/></svg>, onClick: () => fe.setSidebarView('reports') },
                { label: 'Miembros', mode: 'members', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>, onClick: () => { fe.setSidebarView('members'); fe.setMembersLoading(true); apiFetch(`${API}/api/users`).then(r => r.json()).then(d => fe.setMembersList(d.users || d || [])).catch(() => fe.setMembersList([])).finally(() => fe.setMembersLoading(false)); } },
                { label: 'Configuración', mode: 'settings', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>, onClick: () => fe.setSidebarView('settings') },
              ].map((item, idx) => (
                <li key={idx} style={{ marginBottom: 2 }}>
                  <button onClick={() => { if (item.onClick) item.onClick(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '8px 12px',
                      background: fe.sidebarView === item.mode && !fe.isTrashMode ? '#e8f0fe' : 'none', border: 'none',
                      color: fe.sidebarView === item.mode && !fe.isTrashMode ? '#0696d7' : '#5f6368', fontSize: '13px',
                      fontWeight: fe.sidebarView === item.mode && !fe.isTrashMode ? '500' : '400', borderRadius: '0 20px 20px 0', cursor: 'pointer' }}>
                    {item.icon}
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                  </button>
                </li>
              ))}
              <li style={{ marginBottom: 2 }}>
                <button onClick={() => fe.switchMode(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '8px 12px',
                    background: fe.isTrashMode ? '#e8f0fe' : 'none', border: 'none',
                    color: fe.isTrashMode ? '#0696d7' : '#5f6368', fontSize: '13px',
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

        {/* QUARANTINE VIEW */}
        {fe.sidebarView === 'quarantine' && !fe.isTrashMode && (
          <QuarantineTable projectPrefix={projectPrefix} API={API} isAdmin={isAdmin} user={user} />
        )}

        {/* REPORTS VIEW */}
        {fe.sidebarView === 'reports' && (
          <div style={{ padding: 32, flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: 24, fontWeight: 300, marginBottom: 24 }}>Informes</div>
            <div style={{ background: '#f8f9fa', borderRadius: 12, padding: 48, textAlign: 'center', border: '2px dashed #dcdcdc' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="#b0b0b0" style={{ marginBottom: 16 }}><path d="M19,3H5C3.9,3,3,3.9,3,5v14c0,1.1,0.9,2,2,2h14c1.1,0,2-0.9,2-2V5C21,3.9,20.1,3,19,3z M9,17H7v-7h2V17z M13,17h-2V7h2V17z M17,17h-2v-4h2V17z"/></svg>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#333', marginBottom: 8 }}>Informes del Proyecto</div>
              <div style={{ fontSize: 13, color: '#888', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>Los informes generados aparecerán aquí.</div>
              <div style={{ marginTop: 24, padding: '10px 20px', background: '#e8f0fe', borderRadius: 6, display: 'inline-block', color: '#0696d7', fontSize: 13, fontWeight: 500 }}>Próximamente disponible</div>
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
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: m.role === 'admin' ? '#0696d7' : '#ff6b35', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{getInitials(m.name || m.email || '?')}</div>
                        <span style={{ fontWeight: 500 }}>{m.name || '—'}</span>
                      </td>
                      <td style={{ padding: '12px', color: '#666' }}>{m.email}</td>
                      <td style={{ padding: '12px' }}><span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', background: m.role === 'admin' ? '#e3f2fd' : '#f3e5f5', color: m.role === 'admin' ? '#1565c0' : '#7b1fa2' }}>{m.role || 'user'}</span></td>
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
              <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="#0696d7"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>Información del Proyecto</div>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '12px 16px', fontSize: 13 }}>
                <span style={{ color: '#888', fontWeight: 500 }}>Nombre:</span><span style={{ color: '#333' }}>{project.name}</span>
                <span style={{ color: '#888', fontWeight: 500 }}>Número:</span><span style={{ color: '#333' }}>{project.number || '—'}</span>
                <span style={{ color: '#888', fontWeight: 500 }}>Ubicación:</span><span style={{ color: '#333' }}>{project.location || '—'}</span>
                <span style={{ color: '#888', fontWeight: 500 }}>Cuenta:</span><span style={{ color: '#333' }}>{project.account || project.hub_name || '—'}</span>
                <span style={{ color: '#888', fontWeight: 500 }}>Creado:</span><span style={{ color: '#333' }}>{project.created_at ? new Date(project.created_at).toLocaleDateString() : '—'}</span>
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="#0696d7"><path d="M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z"/></svg>Almacenamiento</div>
              <div style={{ fontSize: 13, color: '#888' }}>Google Cloud Storage — activo</div>
              <div style={{ marginTop: 12, background: '#f5f5f5', borderRadius: 8, height: 8, overflow: 'hidden' }}><div style={{ width: '15%', height: '100%', background: 'linear-gradient(90deg, #0696d7, #4fc3f7)', borderRadius: 8 }} /></div>
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
                  <div style={{ paddingBottom: 8, fontSize: 13, borderBottom: '2px solid #0696d7', color: '#0696d7', fontWeight: 600, cursor: 'pointer' }}>Carpetas</div>
                  <div style={{ paddingBottom: 8, fontSize: 13, color: '#999', cursor: 'pointer' }}>Conjuntos</div>
                </div>
                <div style={{ display: 'flex', gap: 20, paddingBottom: 8 }}>
                   <button onClick={() => fe.switchMode(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: '#666', fontSize: 13, cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}>
                     <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor"><path d="M11 15H5a2.25 2.25 0 0 1-2.25-2.25V5.72a.75.75,0,0,1 1.5 0v7.07a.74.74,0,0,0 .75.75h6a.74.74,0,0,0 .75-.75V5.72a.75.75,0,0,1 1.5 0v7.07A2.25 2.25 0 0 1 11 15Zm3-12h-3a2.26 2.26 0 0 0-2.24-2h-1.5A2.26 2.26 0 0 0 5 3H2a.75.75,0,0,0 0 1.5h12A.75.75,0,0,0,14 3Zm-3.75 8V7.22a.75.75,0,0,0-1.5 0V11a.75.75,0,0,0 1.5 0Zm-3 0V7.22a.75.75,0,0,0-1.5 0V11a.75.75,0,0,0 1.5 0Z"></path></svg>
                     Elementos suprimidos
                   </button>
                   <button style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: '#666', fontSize: 13, cursor: 'pointer' }}>
                     <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14.75 3.53a.76.76,0,0,1-.75.75H7.18a1.78,1.78,0,0,1-3.25,0H2a.75.75,0,0,1,0-1.5h1.93a1.78,1.78,0,0,1,3.25,0H14a.75.75,0,0,1,.75.75ZM14 12.1H7.18a1.79,1.79,0,0,0-3.25,0H2a.75.75,0,0,0,0,1.5h1.93a1.78,1.78,0,0,0,3.25,0H14a.75.75,0,0,0,0-1.5Zm0-4.64h-1.91a1.8,1.8,0,0,0-1.64-1.06 1.78,1.78,0,0,0-1.63,1.06H2A.75.75,0,0,0,2,9h6.84a1.77,1.77,0,0,0,1.61,1 1.8,1.8,0,0,0,1.62-1H14a.75.75,0,0,0,0-1.5Z"></path></svg>
                     Configuración
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
                       if (!window.confirm('Eliminar PERMANENTEMENTE ' + count + ' elemento(s)?')) return;
                       let deleted = 0;
                       for (const id of fe.selectedDeletedIds) {
                         try {
                           const res = await apiFetch(`${API}/api/docs/permanent-delete`, { method: 'DELETE', body: JSON.stringify({ id, model_urn: projectPrefix, user: user.name }) });
                           if (res.ok) deleted++; else { const errBody = await res.text(); alert('Error eliminando: ' + errBody); }
                         } catch (e) { alert('Error: ' + e.message); }
                       }
                       fe.setDeletedItems(prev => prev.filter(it => !fe.selectedDeletedIds.includes(it.id)));
                       fe.setSelectedDeletedIds([]);
                       fe.triggerRefresh(fe.currentPath);
                       alert(deleted + ' de ' + count + ' eliminado(s) permanentemente.');
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
                onRowMenu={(item, e) => { if (isAdmin) { fe.setRightClickedId(item.id); fe.setActiveRowMenu({ item, x: e.clientX, y: e.clientY, source: 'sidebar' }); } }}
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
                <div style={{ display: 'flex' }}>
                   <button onClick={() => fe.setShowUploadModal(true)} style={{ padding: '6px 16px', background: '#0696D7', color: '#fff', border: 'none', borderRadius: '4px 0 0 4px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cargar archivos</button>
                   <button onClick={() => fe.setShowUploadModal(true)} style={{ padding: '6px 8px', background: '#0696D7', color: '#fff', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.3)', borderRadius: '0 4px 4px 0', cursor: 'pointer' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5H7z"/></svg>
                   </button>
                </div>

                {!fe.isTrashMode && fe.selected.size > 0 && (
                  <>
                    <button onClick={() => {
                        const itemsToMove = Array.from(fe.selected);
                        const itemIds = itemsToMove.map(fn => { const found = [...fe.folders, ...fe.files].find(i => i.fullName === fn); return found?.id; }).filter(id => id !== undefined);
                        fe.setMoveState({ step: 1, items: itemsToMove, itemIds, destPath: '', destId: null });
                      }} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: '#0696D7', fontSize: 13, cursor: 'pointer', padding: '6px 8px' }}>
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
                        try { const res = await Promise.all(ids.map(id => apiFetch(`${API}/api/docs/restore`, { method: 'POST', body: JSON.stringify({ id, model_urn: projectPrefix, user: user.name }) }))); if (!res.every(r => r.ok)) alert("No se pudieron restaurar algunos archivos."); } catch(e) { alert("Error de conexión al restaurar"); }
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

                <div style={{ display: 'flex', gap: 12, marginLeft: 'auto', alignItems: 'center' }}>
                    <button className="row-action-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg></button>
                    <button className="row-action-btn" style={{ color: '#0696D7' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></button>
                </div>
              </div>

              <div style={{ flex: 1, overflow: 'hidden' }}>
                {fe.loading ? (
                    <div style={{ padding: 40, textAlign: 'center' }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
                ) : fe.isTrashMode ? (
                    <DeletedTable items={fe.deletedItems} selectedIds={fe.selectedDeletedIds} onToggle={fe.setSelectedDeletedIds}
                      onRestore={(id) => { fe.setRestoringIds(prev => ({ ...prev, [id]: true })); setTimeout(async () => { try { const res = await apiFetch(`${API}/api/docs/restore`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ id, model_urn: projectPrefix, user: user.name }) }); if (!res.ok) { const errData = await res.json().catch(() => ({})); alert(errData.error || "No se pudo restaurar."); } } catch(e) { alert("Error de conexión al restaurar"); } fe.setDeletedItems(prev => prev.filter(it => it.id !== id)); fe.setSelectedDeletedIds(prev => prev.filter(x => x !== id)); fe.setRestoringIds(prev => { const c = {...prev}; delete c[id]; return c; }); fe.triggerRefresh(fe.currentPath); }, 1000); }}
                      getInitials={getInitials} restoringIds={fe.restoringIds} />
                ) : (
                    <MatrixTable folders={fe.filteredFolders} files={fe.filteredFiles} selected={fe.selected}
                      columnWidths={columnWidths} totalTableWidth={totalTableWidth} toggle={fe.toggle} navigate={fe.navigate}
                      setActiveFile={fe.setActiveFile}
                      onUpdateDescription={async (item, newDesc) => { if (item.type === 'folder') fe.setFolders(prev => prev.map(f => f.id === item.id ? { ...f, description: newDesc } : f)); else fe.setFiles(prev => prev.map(f => f.id === item.id ? { ...f, description: newDesc } : f)); try { const res = await apiFetch(`${API}/api/docs/description`, { method: 'POST', body: JSON.stringify({ node_id: item.id, description: newDesc, model_urn: projectPrefix }) }); if (res.ok) fe.triggerRefresh(fe.currentPath); else fe.triggerRefresh(fe.currentPath); } catch (e) { fe.triggerRefresh(fe.currentPath); } }}
                      onRename={async (item, newName) => { fe.setProcessingIds(prev => ({ ...prev, [item.id]: true })); if (item.type === 'folder') fe.setFolders(prev => prev.map(f => f.id === item.id ? { ...f, name: newName } : f)); else fe.setFiles(prev => prev.map(f => f.id === item.id ? { ...f, name: newName } : f)); try { const res = await apiFetch(`${API}/api/docs/rename`, { method: 'POST', body: JSON.stringify({ node_id: item.id, new_name: newName, model_urn: projectPrefix }) }); if (res.ok) fe.setRefreshSignal(s => s + 1); else fe.triggerRefresh(fe.currentPath); } catch (e) { fe.triggerRefresh(fe.currentPath); } finally { fe.setProcessingIds(prev => { const n = {...prev}; delete n[item.id]; return n; }); } }}
                      formatSize={formatSize} formatDate={formatDate} getInitials={getInitials} user={user} isAdmin={isAdmin}
                      isTrashMode={fe.isTrashMode} onShowVersions={vh.onShowVersions}
                      onRowMenu={(item, e) => { if (isAdmin) { fe.setRightClickedId(item.id); fe.setActiveRowMenu({ item, x: e.clientX, y: e.clientY, source: 'table' }); } }}
                      editingNodeId={fe.editingNodeId} setEditingNodeId={fe.setEditingNodeId} processingIds={fe.processingIds}
                      rightClickedId={fe.rightClickedId} startResizing={startResizing} setSelected={fe.setSelected}
                      renderFileIconSop={renderFileIconSop}
                      onStatusChange={async (item, newStatus) => { fe.setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: newStatus } : f)); try { const res = await apiFetch(`${API}/api/docs/batch`, { method: 'POST', body: JSON.stringify({ items: [item.id], action: 'SET_STATUS', status: newStatus, model_urn: projectPrefix, user: user?.name }) }); if (!res.ok) { const err = await res.json().catch(() => ({})); alert(err.error || 'Error al cambiar estado'); fe.triggerRefresh(fe.currentPath); } } catch (e) { fe.triggerRefresh(fe.currentPath); } }}
                    />
                )}
              </div>
              <footer style={{ padding: '8px 16px', fontSize: 13, color: '#666', borderTop: '1px solid #eee', background: '#fff', flexShrink: 0 }}>
                {fe.selected.size > 0 ? `${fe.selected.size} de ${fe.folders.length + fe.files.length} seleccionados` : `Mostrando ${fe.folders.length + fe.files.length} elementos`}
              </footer>
            </section>
          </div>
        </>)}
        </div>
      </main>

      {/* ═══════════════════════════════════════ */}
      {/* MODALS & OVERLAYS (Fase 2 Components)  */}
      {/* ═══════════════════════════════════════ */}

      <VersionPanel isOpen={vh.tableShowVersions} versionTarget={vh.versionTarget} versionHistory={vh.versionHistory}
        loadingVersions={vh.loadingVersions} versionPanelWidth={versionPanelWidth} startVersionResize={startVersionResize}
        selectedVersions={vh.selectedVersions} setSelectedVersions={vh.setSelectedVersions}
        versionRowMenu={vh.versionRowMenu} setVersionRowMenu={vh.setVersionRowMenu}
        projectPrefix={projectPrefix} onClose={() => vh.setTableShowVersions(false)} onPromote={vh.handlePromote} />

      <ContextMenu activeRowMenu={fe.activeRowMenu} menuRef={fe.menuRef} isAdmin={isAdmin} projectPrefix={projectPrefix}
        onClose={() => { fe.setActiveRowMenu(null); fe.setRightClickedId(null); }}
        onCreateChild={(id) => fe.setCreatingChildParentId(id)}
        onOpenPermissions={(item) => fe.setPermissionsFolder(item)}
        onRename={(data) => fe.setEditingNodeId(data)}
        onShare={(item) => { fe.setShareTarget(item); fe.setShowShareModal(true); }}
        onMove={(item) => fe.setMoveState({ step: 1, items: [item.name], itemIds: [item.id || item.fullName], destPath: '', destId: null })}
        onDelete={fe.deleteSpecificItem} />

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
        onUpload={fe.handleSopUpload} onListo={fe.handleSopListo} onClose={() => fe.setShowUploadModal(false)} />

      {fe.showSopToast && (
        <div className="acc-success-toast">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          {fe.chunkedUpload.completedCount === 1 ? 'Un archivo se ha cargado correctamente.' : `${fe.chunkedUpload.completedCount} archivos cargados.`}
        </div>
      )}

      <ShareModal isOpen={fe.showShareModal} shareTarget={fe.shareTarget} user={user} projectPrefix={projectPrefix}
        searchShareUser={fe.searchShareUser} setSearchShareUser={fe.setSearchShareUser}
        showShareResults={fe.showShareResults} setShowShareResults={fe.setShowShareResults}
        sharedUsers={fe.sharedUsers} setSharedUsers={fe.setSharedUsers} allProjectUsers={fe.allProjectUsers}
        shareGeneralAccess={fe.shareGeneralAccess} setShareGeneralAccess={fe.setShareGeneralAccess}
        shareGeneralRole={fe.shareGeneralRole} setShareGeneralRole={fe.setShareGeneralRole}
        shareLinkCopied={fe.shareLinkCopied} setShareLinkCopied={fe.setShareLinkCopied}
        onClose={() => fe.setShowShareModal(false)} />

      {/* GATEWAY 3D OVERLAY (FRENTES) */}
      {showGateway && (
        <GatewayPanel 
          projectPrefix={projectPrefix}
          onClose={() => setShowGateway(false)}
        />
      )}
    </div>
  );
}
