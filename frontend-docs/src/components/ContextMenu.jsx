/**
 * ContextMenu.jsx — Menú contextual (click derecho) para archivos y carpetas
 * Refactorización Fase 2: Capa de Modales
 * Extraído de App.jsx líneas 2468-2543
 */
import React from 'react';
import { downloadFolderAsZip } from '../utils/downloadUtils';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import toast from 'react-hot-toast';

export default function ContextMenu({
  activeRowMenu,
  menuRef,
  isAdmin,
  projectPrefix,
  user,
  onRefresh,
  // Action callbacks
  onClose,
  onCreateChild,
  onOpenPermissions,
  onRename,
  onShare,
  onMove,
  onDelete,
  onAttributes,
}) {
  if (!activeRowMenu) return null;

  const item = activeRowMenu.item;
  // Altura estimada del menú según acciones visibles (para no salirse por abajo)
  const estHeight = isAdmin ? 320 : 90;

  return (
    <div className="row-context-menu"
      ref={menuRef}
      style={{
        position: 'fixed',
        top: Math.min(window.innerHeight - estHeight, activeRowMenu.y),
        left: Math.min(window.innerWidth - 230, activeRowMenu.x),
        width: 220,
        zIndex: 10001
      }}
    >
      {item.type === 'folder' && isAdmin && (
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
      {item.node_type !== 'FOLDER' && (
        <button onClick={async () => {
          onClose();
          const tengoYo = item.bloqueado_por && item.bloqueado_por === (user?.email || user?.name);
          try {
            const res = await apiFetch(`${API}/api/docs/reservar`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: item.id, model_urn: projectPrefix, liberar: !!item.bloqueado_por, forzar: !!item.bloqueado_por && !tengoYo })
            });
            const d = await res.json();
            if (!d.success) { toast.error(d.error || 'No se pudo cambiar la reserva'); return; }
            toast.success(item.bloqueado_por ? 'Reserva liberada' : 'Reservado para ti');
            if (onRefresh) onRefresh();
          } catch (e) { toast.error('Error de red'); }
        }}>
          <div className="menu-icon">
            {item.bloqueado_por
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
          </div>
          {item.bloqueado_por ? 'Liberar reserva' : 'Reservar para editar'}
        </button>
      )}
      {isAdmin && (
        <button onClick={() => { onClose(); onRename({ id: item.id || item.fullName, source: activeRowMenu.source }); }}>
          <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></div>
          Cambiar nombre
        </button>
      )}
      {isAdmin && (
        <button onClick={() => { onClose(); onShare(item); }}>
          <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg></div>
          Compartir
        </button>
      )}
      {item.type !== 'folder' && onAttributes && (
        <button onClick={() => { onClose(); onAttributes(item); }}>
          <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg></div>
          Atributos
        </button>
      )}
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
      {isAdmin && (
        <button onClick={() => { onClose(); onMove(item); }}>
           <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><path d="M12 11l3 3-3 3"></path><path d="M9 14h6"></path></svg></div>
          Desplazar
        </button>
      )}
      {isAdmin && (
        <>
          <div className="menu-divider" />
          <button className="delete" onClick={() => { onClose(); onDelete(item.fullName, item.id); }}>
            <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></div>
            Suprimir
          </button>
        </>
      )}
    </div>
  );
}
