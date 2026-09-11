/**
 * ContextMenu.jsx — Menú contextual (click derecho) para archivos y carpetas
 * Refactorización Fase 2: Capa de Modales
 * Extraído de App.jsx líneas 2468-2543
 */
import React from 'react';
import { downloadFolderAsZip } from '../utils/downloadUtils';
import { saveAs } from 'file-saver';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import toast from 'react-hot-toast';

export default function ContextMenu({
  activeRowMenu,
  menuRef,
  isAdmin,
  capacidades = {},
  objetivo = [],
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

  // QUÉ SE PUEDE HACER lo decide `capacidadesDeSeleccion`, la misma respuesta
  // que usa la barra. Aquí no se decide nada: se pinta.
  //
  // Y actúa sobre `objetivo`, que es el elemento pulsado, o TODA la selección
  // si ese elemento forma parte de ella (C-2). Por eso los rótulos dicen
  // cuántos: suprimir cinco desde el botón derecho no puede parecer suprimir uno.
  const varios = objetivo.length > 1;
  const sufijo = varios ? ` (${objetivo.length})` : '';
  const cap = (nombre) => capacidades[nombre] || { disponible: true };
  /** ¿Se dibuja? Oculta significa que anunciarla ya diría demasiado. */
  const visible = (nombre) => { const c = cap(nombre); return c.disponible || c.mostrar !== 'oculta'; };
  const props = (nombre) => ({
    disabled: !cap(nombre).disponible,
    title: cap(nombre).motivo || undefined,
    className: cap(nombre).disponible ? undefined : 'menu-apagado',
  });
  const puedeEditar = cap('reservar').disponible;
  // Altura estimada del menú según acciones visibles (para no salirse por abajo)
  // Alto estimado: se CUENTAN las acciones visibles en vez de suponerlas. Con
  // el número fijo, un menú corto se pegaba al borde inferior sin necesidad.
  const acciones =
    (item.type === 'folder' && isAdmin ? 2 : 0) +
    (item.type !== 'folder' && puedeEditar ? 1 : 0) +
    (isAdmin ? 2 : 0) +
    (item.type !== 'folder' && onAttributes ? 1 : 0) +
    1 +
    (isAdmin ? 2 : 0);
  const estHeight = 16 + acciones * 40;

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
      {/* RESERVAR: solo DOCUMENTOS y solo a quien puede editarlos.
          Dos defectos que tenía esta condición:
            · miraba `node_type`, que la lista NUNCA devuelve (`list_contents`
              solo manda `type`): undefined !== 'FOLDER' era SIEMPRE cierto, así
              que el botón salía también sobre carpetas — y el servidor las
              rechaza siempre («las carpetas no se reservan»);
            · no miraba el permiso, y reservar exige `edit`: a un lector le
              ofrecía un botón que terminaba en 403.
          La regla del producto es no ofrecer lo que el servidor va a negar. */}
      {item.type !== 'folder' && visible('reservar') && (
        <button {...props('reservar')} onClick={async () => {
          if (!cap('reservar').disponible) return;
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
      {visible('renombrar') && (
        <button {...props('renombrar')} onClick={() => { if (!cap('renombrar').disponible) return; onClose(); onRename({ id: item.id || item.fullName, source: activeRowMenu.source }); }}>
          <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></div>
          Cambiar nombre
        </button>
      )}
      {visible('compartir') && (
        <button {...props('compartir')} onClick={() => { if (!cap('compartir').disponible) return; onClose(); onShare(item); }}>
          <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg></div>
          Compartir
        </button>
      )}
      {item.type !== 'folder' && onAttributes && visible('atributos') && (
        <button {...props('atributos')} onClick={() => { if (!cap('atributos').disponible) return; onClose(); onAttributes(item); }}>
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
        <button onClick={async () => {
            onClose();
            // EL TOKEN DE SESIÓN YA NO VIAJA EN LA URL.
            //
            // Antes se abría `/api/docs/view?...&session_token=<token>`: esa
            // dirección queda en el historial del navegador, en los registros
            // del servidor y en la cabecera Referer de lo que se abra después.
            // Es la llave de la sesión escrita en sitios que nadie vigila.
            // Ahora se pide una URL FIRMADA —el mismo camino que usa el
            // lector— y se abre esa: caduca sola y no lleva identidad dentro.
            if (!item.gcs_urn) { toast.error('Este documento no tiene fichero asociado.'); return; }
            // SIN PESTAÑA. La URL firmada se emite con `response_disposition:
            // inline`, o sea «muéstralo», no «descárgalo»: por eso antes había que
            // abrir otra pestaña -- si no, el fichero sustituía a ALEPHIA en la que
            // estabas. El resultado era una pestaña en blanco mientras se firmaba,
            // y luego un visor ajeno.
            //
            // Se trae el fichero y se guarda, que es EXACTAMENTE lo que ya hace la
            // descarga de carpeta con cada uno de sus documentos: mismo `fetch` a
            // la URL firmada, mismo `saveAs`. No se inventa un camino nuevo.
            // FIRMAR LA URL TARDA, y hasta ahora lo único que se veía era una
            // pestaña en blanco: ni señal de que el clic hubiera entrado, ni de
            // qué se estaba esperando. La carpeta ya avisaba con su conteo; el
            // documento suelto, no.
            const aviso = toast.loading(`Preparando "${item.name}"…`);
            try {
              const r = await apiFetch(`${API}/api/docs/signed-url?urn=${encodeURIComponent(item.gcs_urn)}&model_urn=${encodeURIComponent(projectPrefix)}`);
              const d = await r.json().catch(() => ({}));
              if (!r.ok || !d.success || !d.url) throw new Error(d.error || 'No se pudo preparar la descarga.');
              toast.loading(`Descargando "${item.name}"…`, { id: aviso });
              const fichero = await fetch(d.url);
              if (!fichero.ok) throw new Error('El almacén no entregó el fichero.');
              saveAs(await fichero.blob(), item.name);
              toast.success('Descargado.', { id: aviso });
            } catch (e) {
              toast.error(e.message || 'No se pudo descargar.', { id: aviso });
            }
        }}>
          <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></div>
          Descargar Archivo
        </button>
      )}
      {visible('desplazar') && (
        <button {...props('desplazar')} onClick={() => { if (!cap('desplazar').disponible) return; onClose(); onMove(item); }}>
           <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><path d="M12 11l3 3-3 3"></path><path d="M9 14h6"></path></svg></div>
          Desplazar{sufijo}
        </button>
      )}
      {visible('suprimir') && (
        <>
          <div className="menu-divider" />
          <button {...props('suprimir')}
            className={cap('suprimir').disponible ? 'delete' : 'delete menu-apagado'}
            onClick={() => { if (!cap('suprimir').disponible) return; onClose(); onDelete(item.fullName, item.id); }}>
            <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></div>
            Suprimir{sufijo}
          </button>
        </>
      )}
    </div>
  );
}
