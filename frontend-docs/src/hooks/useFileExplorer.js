/**
 * useFileExplorer.js — Hook principal del explorador de archivos
 * Refactorización Fase 1: Capa de Datos
 * Extraído de App.jsx (FilesPage) líneas 1030-1697
 * 
 * Contiene: Todos los estados del explorador, fetchers, navegación,
 * CRUD (crear carpeta, eliminar, renombrar, mover), filtros y upload wiring.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { API, getAuthHeaders, getInitialsDetailed, formatDate } from '../utils/helpers';
import { useChunkedUpload } from './useChunkedUpload';
import { useFolderCache } from './useFolderCache';
import { useAdministracion } from './useAdministracion';
import toast from 'react-hot-toast';

export function useFileExplorer(project, user) {
  const projectPrefix = `proyectos/${project.name.replace(/ /g, '_')}`;

  // ADMINISTRACIÓN **DE ESTA OBRA**, no el rol global.
  //
  // Decía `user.role === 'admin'`, y con eso la misma persona veía «Crear
  // carpeta», «Permisos» y «Destruir» en TODAS las obras, incluso en las que no
  // participaba. El servidor ya lo rechazaba desde el 21-ago-2026; lo que
  // faltaba era que la interfaz dejara de ofrecerlo.
  //
  // `esEntityAdmin` se conserva aparte porque hay cosas que SÍ son de la
  // entidad -- el catálogo de idoneidad, archivar la obra -- y no del proyecto.
  const { esAdminDeObra, esEntityAdmin, cargando: cargandoAdmin } =
    useAdministracion(project);
  const isAdmin = esAdminDeObra;

  // ── Core Navigation State ──
  const [currentPath, setCurrentPath] = useState(projectPrefix + '/');
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const [projectRootId, setProjectRootId] = useState(null);

  // ── File/Folder Data ──
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [refreshSignal, setRefreshSignal] = useState(0);

  // ── Trash Mode ──
  const [isTrashMode, setIsTrashMode] = useState(false);
  const [deletedItems, setDeletedItems] = useState([]);
  const [selectedDeletedIds, setSelectedDeletedIds] = useState([]);
  const [restoringIds, setRestoringIds] = useState({});

  // ── Active File & Viewer ──
  const [activeFile, setActiveFile] = useState(null);
  const [showVersions, setShowVersions] = useState(false);
  const [viewedVersionInfo, setViewedVersionInfo] = useState(null);

  // ── Delete Modal State ──
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTask, setDeleteTask] = useState({ ids: [], count: 0 });

  // ── New Folder Modal ──
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [newFolderParentPath, setNewFolderParentPath] = useState('');

  // ── Upload State ──
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [sopMinimized, setSopMinimized] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pendingBanner, setPendingBanner] = useState(null);

  // ── Context Menu State ──
  const [activeRowMenu, setActiveRowMenu] = useState(null);
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [rightClickedId, setRightClickedId] = useState(null);
  const [processingIds, setProcessingIds] = useState({});
  const [creatingChildParentId, setCreatingChildParentId] = useState(null);

  // ── Share State ──
  const [showShareModal, setShowShareModal] = useState(false);
  const [permissionsFolder, setPermissionsFolder] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);
  const [shareGeneralAccess, setShareGeneralAccess] = useState('restricted');
  const [shareGeneralRole, setShareGeneralRole] = useState('viewer');
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [sharedUsers, setSharedUsers] = useState([]);
  const [searchShareUser, setSearchShareUser] = useState('');
  const [showShareResults, setShowShareResults] = useState(false);

  // ── Move State ──
  const [moveState, setMoveState] = useState({ step: 0, items: [], itemIds: [], destPath: '', destId: null });

  // ── Misc UI State ──
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState('files');

  // CAPA 16 · TOOL ACTIVATION: que herramientas EXISTEN en esta obra. Lo lee
  // el menu para no ofrecer lo que el servidor va a negar. No autoriza nada:
  // la compuerta real vive en el middleware.
  const [herramientasDeObra, setHerramientasDeObra] = useState(null);
  const [membersList, setMembersList] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | WIP | SHARED | PUBLISHED | ARCHIVED
  const [collapseSignal, setCollapseSignal] = useState(0);

  // Lista VACIA a proposito. Aqui vivia una lista de usuarios de prueba con el
  // correo y el nombre PERSONALES del desarrollador. Ninguna pantalla la
  // renderizaba (ShareModal no la desestructura), pero viajaba dentro del JS
  // compilado del portal: cualquiera podia leerla viendo el fuente -- y en la
  // instancia de una entidad, eso es identidad de otro dentro de SU portal.
  // Si algun dia el modal de compartir necesita sugerencias, se piden a
  // /api/users con la sesion, no se escriben en el codigo.
  const allProjectUsers = [];

  // ── Chunked Upload Engine ──
  const { methods: cacheMethods, cacheVersion } = useFolderCache(API, projectPrefix);

  // El estado de las herramientas se pide UNA vez por obra. Si falla se queda
  // en null y el menu no esconde nada: preferimos ofrecer de mas (el servidor
  // niega igual, con un mensaje que explica) a esconder una herramienta viva
  // por un fallo de red.
  useEffect(() => {
    let vigente = true;
    apiFetch(`${API}/api/projects/${encodeURIComponent(projectPrefix)}/herramientas`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (vigente && d && d.estado) setHerramientasDeObra(d.estado); })
      .catch(() => {});
    return () => { vigente = false; };
  }, [projectPrefix]);
  const chunkedUpload = useChunkedUpload(API, projectPrefix, user, {
    onUploadComplete: () => {
      cacheMethods.invalidateAll();
    }
  });

  // ── Refs ──
  const fileRef = useRef(null);
  const menuRef = useRef(null);
  const fetchSeqRef = useRef(0);

  // ═══════════════════════════════════════════════════════════════
  // EFFECTS
  // ═══════════════════════════════════════════════════════════════

  // Fetch project root ID eliminado como useEffect redundante. Se tomará directo de fetchContents
  // Close context menu on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveRowMenu(null);
        setRightClickedId(null);
      }
    }
    if (activeRowMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeRowMenu]);

  // Check pending uploads on mount - Removido por UX (El banner asume estado fantasma)

  // Refs para evitar que fetchContents se re-cree en cada cambio de nodeId/rootId
  const projectRootIdRef = useRef(projectRootId);
  const currentNodeIdRef = useRef(currentNodeId);
  useEffect(() => { projectRootIdRef.current = projectRootId; }, [projectRootId]);
  useEffect(() => { currentNodeIdRef.current = currentNodeId; }, [currentNodeId]);

  const fetchContents = useCallback(async (path, trash = false, silent = false, nodeId = null) => {
    const seq = ++fetchSeqRef.current;
    
    // SWR: Cargar de cache al instante si lo tenemos
    let hasCache = false;
    if (nodeId && cacheMethods && !trash) {
      const cached = cacheMethods.getChildren(nodeId);
      if (cached.folders !== null) {
        hasCache = true;
        if (!silent) {
          setFolders((cached.folders || []).map(f => ({...f, type: 'folder'})));
          setFiles((cached.files || []).map(f => ({...f, type: 'file'})));
        }
      }
    }

    if (!silent && !hasCache) {
      setLoading(true);
    }

    try {
      const endpoint = trash
        ? `/api/docs/deleted?model_urn=${encodeURIComponent(projectPrefix)}`
        : `/api/docs/list?path=${encodeURIComponent(path)}${nodeId ? `&id=${nodeId}` : ''}&model_urn=${encodeURIComponent(projectPrefix)}`;
      const res = await apiFetch(`${API}${endpoint}`, { headers: getAuthHeaders() });
      if (seq !== fetchSeqRef.current) return;
      if (res.ok) {
        const response = await res.json();
        if (seq !== fetchSeqRef.current) return;
        const data = response.data || {};
        
        // Capturar root ID de la primera respuesta
        if (data.current_node_id && data.current_node_id !== 'null') {
           if (!projectRootIdRef.current) setProjectRootId(data.current_node_id);
           if (!currentNodeIdRef.current && (path === projectPrefix || path === projectPrefix + '/')) {
               setCurrentNodeId(data.current_node_id);
           }
        }

        const sortedFolders = (data.folders || []).map(f => ({...f, type: 'folder'})).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        const sortedFiles = (data.files || []).map(f => ({...f, type: 'file'})).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        
        setFolders(sortedFolders);
        setFiles(sortedFiles);
        
        // 🔥 SWR Sync: Asegurar que la tabla principal alimente la caché global para que las flechas laterales estén listas instantáneamente
        if (nodeId && cacheMethods && !trash) {
          if (typeof cacheMethods.forceSetData === 'function') {
            cacheMethods.forceSetData(nodeId, {
              folders: sortedFolders,
              files: sortedFiles,
              timestamp: Date.now()
            });
          }
        }
        
        if (trash) {
          const allDel = [...(data.folders || []), ...(data.files || [])].map(it => ({
            ...it,
            type: it.node_type?.toLowerCase() || (it.fullName?.endsWith('/') ? 'folder' : 'file'),
            filename: it.name,
            deletedBy: { name: it.updated_by || 'Sistema', initials: getInitialsDetailed(it.updated_by || 'Sistema') },
            date: formatDate(it.updated)
          }));
          setDeletedItems(allDel);
        }
      }
    } catch (e) { console.error(e); }
    finally { if (!silent && seq === fetchSeqRef.current) setLoading(false); }
  }, [projectPrefix, cacheMethods]);

  useEffect(() => {
    fetchContents(currentPath, isTrashMode, false, isTrashMode ? null : currentNodeId);
  }, [currentPath, isTrashMode, currentNodeId, fetchContents]);

  const triggerRefresh = useCallback((path = currentPath, specificNodeId = undefined) => {
    const idToUse = specificNodeId !== undefined ? specificNodeId : currentNodeId;
    fetchContents(path, isTrashMode, true, isTrashMode ? null : idToUse);
    setRefreshSignal(prev => prev + 1);
  }, [currentPath, isTrashMode, currentNodeId, fetchContents]);

  // Agrupa finalizaciones simultáneas para evitar una consulta por archivo.
  const prevCompletedRef = useRef(0);
  const uploadRefreshTimerRef = useRef(null);
  useEffect(() => {
    if (chunkedUpload.completedCount > prevCompletedRef.current) {
      clearTimeout(uploadRefreshTimerRef.current);
      uploadRefreshTimerRef.current = setTimeout(() => triggerRefresh(currentPath), 250);
    }
    prevCompletedRef.current = chunkedUpload.completedCount;
    return () => clearTimeout(uploadRefreshTimerRef.current);
  }, [chunkedUpload.completedCount, currentPath, triggerRefresh]);

  const navigate = useCallback((path, id = null) => {
    const normalizedPath = path.replace(/\/$/, '');
    const isRoot = normalizedPath === projectPrefix;
    const finalId = isRoot ? null : id;
    const finalPath = path.endsWith('/') ? path : path + '/';
    if (finalPath === currentPath && finalId === currentNodeId) return;
    
    // No vaciamos los arrays ni ponemos loading bruto, dejamos que fetchContents lo maneje con caché
    setCurrentPath(finalPath);
    setCurrentNodeId(finalId);
    setSelected(new Set());
    setIsTrashMode(false);
  }, [currentPath, currentNodeId, projectPrefix]);

  const switchMode = useCallback((trashMode) => {
    setIsTrashMode(trashMode);
    setSelected(new Set());
    setSelectedDeletedIds([]);
  }, []);

  const handleFolderClick = useCallback((path, nodeId) => {
    switchMode(false);
    setCurrentPath(path);
    if (nodeId) setCurrentNodeId(nodeId);
    setSearchQuery('');
    setSelected(new Set());
    triggerRefresh(path, nodeId);
  }, [switchMode, triggerRefresh]);

  // ═══════════════════════════════════════════════════════════════
  // CRUD OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  const createFolder = async () => {
    if (!isAdmin || !folderName.trim()) return;
    const targetPath = (newFolderParentPath || currentPath) + ((newFolderParentPath || currentPath).endsWith('/') ? '' : '/') + folderName.trim() + '/';
    const parentId = newFolderParentPath || (currentPath.startsWith(projectPrefix) && (currentPath === projectPrefix || currentPath === projectPrefix + '/') ? null : currentPath);
    if (parentId && parentId.length > 30) setProcessingIds(prev => ({ ...prev, [parentId]: true }));
    try {
      const res = await apiFetch(`${API}/api/docs/folder`, {
        method: 'POST',
        body: JSON.stringify({ path: targetPath, model_urn: projectPrefix, user: user?.name })
      });
      if (res.ok) {
        setShowNewFolder(false);
        setFolderName('');
        setNewFolderParentPath('');
        // COHERENCIA ÁRBOL: invalidar el caché del nodo padre para que la
        // carpeta nueva aparezca en el panel izquierdo sin esperar 30s (STALE_TIME).
        if (cacheMethods) cacheMethods.invalidateNode(currentNodeId || '__root__');
        setRefreshSignal(s => s + 1);
        triggerRefresh();
      } else {
        const err = await res.json();
        toast.error(err.error || "No se pudo crear la carpeta");
      }
    } catch (e) { console.error(e); }
    finally {
      if (parentId) setProcessingIds(prev => { const n = { ...prev }; delete n[parentId]; return n; });
    }
  };

  // Quitar de la tabla lo que el servidor ya confirmó que se borró.
  //
  // EL PARPADEO QUE ESTO ARREGLA: las filas se ponían grises, terminaba el
  // DELETE, el `finally` quitaba el gris -y las filas RECUPERABAN su color, como
  // si no se hubiera borrado nada- y solo cuando llegaba el refresco, un segundo
  // después, desaparecían. El refresco se lanzaba sin esperarlo, así que el
  // `finally` siempre iba por delante. Se quitan aquí, y el refresco pasa a ser
  // lo que es: una reconciliación de fondo, no lo que hace desaparecer la fila.
  const quitarDeLaTabla = (ids) => {
    const fuera = new Set(ids.filter(Boolean).map(String));
    if (!fuera.size) return;
    setFolders(prev => prev.filter(f => !fuera.has(String(f.id))));
    setFiles(prev => prev.filter(f => !fuera.has(String(f.id))));
  };

  const deleteSpecificItem = async (fullName, id) => {
    if (!isAdmin) return;
    if (!id || !fullName) return; // Validación básica, asegurar que tenemos data
    if (id) setProcessingIds(prev => ({ ...prev, [id]: true }));
    try {
      const res = await apiFetch(`${API}/api/docs/delete`, {
        method: 'DELETE',
        body: JSON.stringify({ fullName, id, model_urn: projectPrefix, user: user.name })
      });
      if (res.ok) {
        quitarDeLaTabla([id]);
        if (cacheMethods && id) {
            const parentId = currentNodeId || null;
            cacheMethods.commitDelete(parentId, id);
        }
        setRefreshSignal(s => s + 1);
        triggerRefresh(currentPath);
        if (currentPath === fullName || currentPath.startsWith(fullName)) {
          setCurrentPath(projectPrefix);
          setCurrentNodeId(null);
        }
      } else {
        // Un borrado que falla y no dice nada es peor que un error: el usuario
        // cree que el clic no entró y lo vuelve a intentar.
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'No se pudo suprimir');
      }
    } catch (e) {
      console.error(e);
      toast.error('Error de conexión al suprimir');
    }
    finally {
      if (id) setProcessingIds(prev => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const handleExecuteMove = async () => {
    if (!isAdmin || !moveState.destPath || !moveState.itemIds?.length) return;
    const idsToMove = [...moveState.itemIds];
    if (moveState.destId && idsToMove.some(id => String(id) === String(moveState.destId))) {
      toast.error('No puedes mover un elemento dentro de sí mismo.');
      return;
    }
    setProcessingIds(prev => {
      const n = { ...prev };
      idsToMove.forEach(id => n[id] = true);
      return n;
    });
    let moved = 0;
    const failures = [];
    for (const nodeId of idsToMove) {
      try {
        const res = await apiFetch(`${API}/api/docs/move`, {
          method: 'PUT',
          body: JSON.stringify({ node_id: nodeId, destNodeId: moveState.destId, model_urn: projectPrefix, user: user?.email })
        });
        if (!res.ok) {
          const errData = await res.json();
          failures.push(errData.error || 'Error al desplazar');
          continue;
        }
        moved += 1;
      } catch (e) {
        console.error(e);
        failures.push('Error de red al desplazar');
      }
    }
    setProcessingIds(prev => {
      const n = { ...prev };
      idsToMove.forEach(id => delete n[id]);
      return n;
    });
    // COHERENCIA TABLA ↔ ÁRBOL: al desplazar cambian DOS ramas (origen y
    // destino). Sin invalidar ambas, el árbol seguía mostrando el elemento en
    // su sitio viejo (y no aparecía en el nuevo) hasta recargar la página.
    if (cacheMethods) {
      const origen = currentNodeId || '__root__';
      cacheMethods.invalidateNode(origen);
      if (moveState.destId) cacheMethods.invalidateNode(moveState.destId);
      else cacheMethods.invalidateNode('__root__');
    }
    setMoveState({ step: 0, items: [], itemIds: [], destPath: '', destId: null });
    setSelected(new Set());
    setRefreshSignal(s => s + 1);
    triggerRefresh();
    if (failures.length) {
      toast.error(`${moved} de ${idsToMove.length} elemento(s) movido(s). ${failures[0]}`);
    } else {
      toast.success(`${moved} elemento(s) movido(s) correctamente.`);
    }
  };

  const handleExecuteBatchDelete = async () => {
    if (!isAdmin || selected.size === 0) return;
    const itemsToDelete = Array.from(selected);
    const itemIds = itemsToDelete.map(fn => {
      const found = [...folders, ...files].find(i => i.fullName === fn);
      return found?.id;
    }).filter(id => id !== undefined);
    if (itemIds.length === 0) return;
    setDeleteTask({ ids: itemIds, count: itemIds.length });
    setShowDeleteModal(true);
  };

  const confirmBatchDelete = async () => {
    // Borrado individual confirmado (desde el menú contextual)
    if (deleteTask.single) {
      setShowDeleteModal(false);
      const { fullName, id } = deleteTask.single;
      setDeleteTask({ ids: [], count: 0 });
      await deleteSpecificItem(fullName, id);
      return;
    }
    const itemIds = deleteTask.ids;
    if (itemIds.length === 0) return;
    setShowDeleteModal(false);
    setProcessingIds(prev => {
      const n = { ...prev };
      itemIds.forEach(id => n[id] = true);
      return n;
    });
    try {
      const res = await apiFetch(`${API}/api/docs/batch`, {
        method: 'POST',
        body: JSON.stringify({ items: itemIds, action: 'DELETE', model_urn: projectPrefix, user: user.name })
      });
      if (res.ok) {
        // Fuera de la tabla YA, sin esperar al refresco (ver quitarDeLaTabla).
        quitarDeLaTabla(itemIds);
        setSelected(new Set());
        setRefreshSignal(s => s + 1);
        if (cacheMethods && itemIds.length > 0) {
            // Borrado optimista total para respuesta UI de la barra lateral (FolderNode) inmediata
            itemIds.forEach(id => {
                const parentId = currentNodeId || null;
                cacheMethods.commitDelete(parentId, id);
            });
        }
        // El servidor ahora filtra por permiso de carpeta y puede borrar menos de
        // lo pedido. Callarlo haria creer que se borro todo.
        const d = await res.json().catch(() => ({}));
        if (d.sin_permiso) {
          toast(`${d.processed} suprimido(s). ${d.sin_permiso} sin permiso.`,
                { icon: '⚠️', duration: 7000 });
        }
        triggerRefresh();
      } else {
        const errData = await res.json();
        toast.error(errData.error || "Error al suprimir elementos");
      }
    } catch (e) {
      console.error(e);
      toast.error("Error de conexión al suprimir elementos");
    } finally {
      setProcessingIds(prev => {
        const n = { ...prev };
        itemIds.forEach(id => delete n[id]);
        return n;
      });
      setDeleteTask({ ids: [], count: 0 });
    }
  };

  const toggle = (name) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(name)) s.delete(name); else s.add(name);
      return s;
    });
  };

  // ── Upload Handler ──
  const handleSopUpload = async (fileList) => {
    if (!isAdmin) {
      toast.error('Solo un administrador de esta obra puede cargar archivos.');
      return;
    }
    if (!fileList?.length) return;
    setShowUploadModal(true);
    chunkedUpload.addFiles(fileList, currentPath);
  };

  const handleSopListo = () => {
    setShowUploadModal(false);
    chunkedUpload.clearCompleted();
  };

  const openUploadedFile = (item) => {
    if (!item?.nodeId) return;
    const folder = item.folderPath ? `${item.folderPath.replace(/\/+$/, '')}/` : '';
    if (chunkedUpload.hasActiveUploads) {
      setSopMinimized(true);
    } else {
      setShowUploadModal(false);
    }
    setActiveFile({
      id: item.nodeId,
      name: item.filename,
      type: 'file',
      fullName: `${folder}${item.filename}`,
      version: item.version,
      gcs_urn: item.gcsUrn,
    });
  };

  // ── Drag & Drop ──
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) handleSopUpload(e.dataTransfer.files); };

  // ── Computed ──
  const filteredFolders = folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredFiles = files.filter(f =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
    (statusFilter === 'ALL' || (f.status || 'WIP') === statusFilter)
  );

  return {
    // Constants
    projectPrefix,
    // `isAdmin` = administra ESTA obra. Se conserva el nombre porque lo leen 19
    // componentes y renombrarlo en todos era ruido sin valor; lo que cambió es
    // lo que SIGNIFICA, y eso está dicho arriba y en `useAdministracion`.
    isAdmin,
    esAdminDeObra, esEntityAdmin, cargandoAdmin,
    
    // Navigation
    currentPath, setCurrentPath, currentNodeId, setCurrentNodeId,
    projectRootId,
    navigate, handleFolderClick, switchMode,
    
    // Data
    folders, setFolders, files, setFiles,
    loading, setLoading,
    selected, setSelected, toggle,
    refreshSignal, setRefreshSignal, triggerRefresh,
    filteredFolders, filteredFiles,
    searchQuery, setSearchQuery,
    statusFilter, setStatusFilter,
    
    // Trash
    isTrashMode, setIsTrashMode,
    deletedItems, setDeletedItems,
    selectedDeletedIds, setSelectedDeletedIds,
    restoringIds, setRestoringIds,
    
    // Active File
    activeFile, setActiveFile,
    showVersions, setShowVersions,
    viewedVersionInfo, setViewedVersionInfo,
    
    // Delete Modal
    showDeleteModal, setShowDeleteModal,
    deleteTask, setDeleteTask,
    handleExecuteBatchDelete, confirmBatchDelete,
    deleteSpecificItem,
    
    // New Folder
    showNewFolder, setShowNewFolder,
    folderName, setFolderName,
    newFolderParentPath, setNewFolderParentPath,
    createFolder,
    
    // Upload
    showUploadModal, setShowUploadModal,
    sopMinimized, setSopMinimized,
    showUploadMenu, setShowUploadMenu,
    dragOver, pendingBanner, setPendingBanner,
    chunkedUpload, handleSopUpload, handleSopListo, openUploadedFile,
    onDragOver, onDragLeave, onDrop,
    
    // Context Menu
    activeRowMenu, setActiveRowMenu,
    editingNodeId, setEditingNodeId,
    rightClickedId, setRightClickedId,
    processingIds, setProcessingIds,
    creatingChildParentId, setCreatingChildParentId,
    menuRef,
    
    // Share
    showShareModal, setShowShareModal,
    permissionsFolder, setPermissionsFolder,
    shareTarget, setShareTarget,
    shareGeneralAccess, setShareGeneralAccess,
    shareGeneralRole, setShareGeneralRole,
    shareLinkCopied, setShareLinkCopied,
    sharedUsers, setSharedUsers,
    searchShareUser, setSearchShareUser,
    showShareResults, setShowShareResults,
    allProjectUsers,
    
    // Move
    moveState, setMoveState,
    handleExecuteMove,
    
    // Misc
    profileMenuOpen, setProfileMenuOpen,
    sidebarView, setSidebarView,
    herramientasDeObra,
    membersList, setMembersList,
    membersLoading, setMembersLoading,
    collapseSignal, setCollapseSignal,
    fileRef,
    
    // Cache
    cacheMethods, cacheVersion,
  };
}
