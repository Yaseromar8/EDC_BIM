/**
 * ContextMenu.jsx — Menú contextual (click derecho) para archivos y carpetas
 * Refactorización Fase 2: Capa de Modales
 * Extraído de App.jsx líneas 2468-2543
 */
import React from 'react';
import { downloadFolderAsZip } from '../utils/downloadUtils';
import { API } from '../utils/helpers';

export default function ContextMenu({
  activeRowMenu,
  menuRef,
  isAdmin,
  projectPrefix,
  // Action callbacks
  onClose,
  onCreateChild,
  onOpenPermissions,
  onRename,
  onShare,
  onMove,
  onDelete,
}) {
  if (!activeRowMenu) return null;

  const item = activeRowMenu.item;

  return (
    <div className="row-context-menu" 
      ref={menuRef}
      style={{ 
        position: 'fixed', 
        top: activeRowMenu.y, 
        left: Math.min(window.innerWidth - 230, activeRowMenu.x), 
        width: 220,
        zIndex: 10001
      }} 
    >
      {item.type === 'folder' && (
        <button onClick={() => { onClose(); onCreateChild(item.id || item.fullName); }}>
          <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></div>
          Añadir subcarpeta
        </button>
      )}
      {item.type === 'folder' && isAdmin && (
        <button onClick={() => { onClose(); onOpenPermissions(item); }}>
          <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg></div>
          Configuración de permisos
        </button>
      )}
      <button onClick={() => { onClose(); onRename({ id: item.id || item.fullName, source: activeRowMenu.source }); }}>
        <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></div>
        Cambiar nombre
      </button>
      <button onClick={() => { onClose(); onShare(item); }}>
        <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg></div>
        Compartir
      </button>
      {item.type === 'folder' ? (
        <button 
          onClick={() => { 
            onClose(); 
            downloadFolderAsZip(item.id || item.fullName, projectPrefix, API, item.name || 'Carpeta'); 
          }}
        >
           <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></div>
           Descargar Carpeta
        </button>
      ) : (
        <button onClick={() => { 
            onClose();
            const token = localStorage.getItem('visor_session_token') || sessionStorage.getItem('visor_session_token');
            const tokenQuery = token ? `&session_token=${token}` : '';
            if (item.gcs_urn) {
                window.open(`${API}/api/docs/view?urn=${encodeURIComponent(item.gcs_urn)}&model_urn=${encodeURIComponent(projectPrefix)}${tokenQuery}`, '_blank');
            }
        }}>
          <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></div>
          Descargar Archivo
        </button>
      )}
      <button onClick={() => { onClose(); onMove(item); }}>
         <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><path d="M12 11l3 3-3 3"></path><path d="M9 14h6"></path></svg></div>
        Desplazar
      </button>
      <div className="menu-divider" />
      <button className="delete" onClick={() => { onClose(); onDelete(item.fullName, item.id); }}>
        <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></div>
        Suprimir
      </button>
    </div>
  );
}
