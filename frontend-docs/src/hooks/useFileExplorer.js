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
import toast from 'react-hot-toast';

export function useFileExplorer(project, user) {
  const projectPrefix = `proyectos/${project.name.replace(/ /g, '_')}`;
  const isAdmin = user.role === 'admin';

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
  const [showSopToast, setShowSopToast] = useState(false);
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
  const [membersList, setMembersList] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapseSignal, setCollapseSignal] = useState(0);

  // ── Mock Users for Share ──
  const allProjectUsers = [
    { email: 'omarsanchezh8@gmail.com', name: 'Yaser Omar', initials: 'YO' },
    { email: 'admin@visor.com', name: 'Administrador', initials: 'AD' },
    { email: 'residente@obra.com', name: 'Juan Perez', initials: 'JP' },
    { email: 'supervisor@aps.com', name: 'Maria Lopez', initials: 'ML' }
  ];

  // ── Chunked Upload Engine ──
  const { methods: cacheMethods, cacheVersion } = useFolderCache(API, projectPrefix);
  const chunkedUpload = useChunkedUpload(API, projectPrefix, user, {
    onUploadComplete: (item, res) => {
      if (res.version && res.version > 1) {
        toast.success(`Versión ${res.version} de ${item.filename} guardada exitosamente`);
      } else {
        toast.success(`${item.filename} guardado exitosamente`);
      }
      cacheMethods.invalidateNode(item.folderPath || '__root__');
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

  // Watch chunked upload completions
  const prevCompletedRef = useRef(0);
  useEffect(() => {
    if (chunkedUpload.completedCount > prevCompletedRef.current) {
      triggerRefresh(currentPath);
    }
    prevCompletedRef.current = chunkedUpload.completedCount;
  }, [chunkedUpload.completedCount]);

  // Check pending uploads on mount - Removido por UX (El banner asume estado fantasma)

  // Fetch contents when path/nodeId/trashMode changes
  useEffect(() => {
    fetchContents(currentPath, isTrashMode, false, isTrashMode ? null : currentNodeId);
  }, [currentPath, isTrashMode, currentNodeId]);

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

  const triggerRefresh = useCallback((path = currentPath) => {
    fetchContents(path, isTrashMode, true, isTrashMode ? null : currentNodeId);
    setRefreshSignal(prev => prev + 1);
  }, [currentPath, isTrashMode, currentNodeId, fetchContents]);

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

  const handleFolderClick = useCallback((path) => {
    switchMode(false);
    setCurrentPath(path);
    setSearchQuery('');
    setSelected(new Set());
    triggerRefresh(path);
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
        setRefreshSignal(s => s + 1);
        triggerRefresh();
      } else {
        const err = await res.json();
        alert("Error: " + (err.error || "No se pudo crear la carpeta"));
      }
    } catch (e) { console.error(e); }
    finally {
      if (parentId) setProcessingIds(prev => { const n = { ...prev }; delete n[parentId]; return n; });
    }
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
      }
    } catch (e) { console.error(e); }
    finally {
      if (id) setProcessingIds(prev => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const handleExecuteMove = async () => {
    if (!isAdmin || !moveState.destPath || !moveState.itemIds?.length) return;
    const idsToMove = [...moveState.itemIds];
    setProcessingIds(prev => {
      const n = { ...prev };
      idsToMove.forEach(id => n[id] = true);
      return n;
    });
    for (const nodeId of idsToMove) {
      try {
        const res = await apiFetch(`${API}/api/docs/move`, {
          method: 'PUT',
          body: JSON.stringify({ node_id: nodeId, destNodeId: moveState.destId, model_urn: projectPrefix, user: user?.email })
        });
        if (!res.ok) {
          const errData = await res.json();
          alert(errData.error || "Error al desplazar");
          break;
        }
      } catch (e) {
        console.error(e);
        alert("Error de red al desplazar");
        break;
      }
    }
    setProcessingIds(prev => {
      const n = { ...prev };
      idsToMove.forEach(id => delete n[id]);
      return n;
    });
    setMoveState({ step: 0, items: [], itemIds: [], destPath: '', destId: null });
    setSelected(new Set());
    setRefreshSignal(s => s + 1);
    triggerRefresh();
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
        setSelected(new Set());
        setRefreshSignal(s => s + 1);
        if (cacheMethods && itemIds.length > 0) {
            // Borrado optimista total para respuesta UI de la barra lateral (FolderNode) inmediata
            itemIds.forEach(id => {
                const parentId = currentNodeId || null;
                cacheMethods.commitDelete(parentId, id);
            });
        }
        triggerRefresh();
      } else {
        const errData = await res.json();
        alert(errData.error || "Error al suprimir elementos");
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión al suprimir elementos");
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
    if (!isAdmin || !fileList?.length) return;
    setShowUploadModal(true);
    chunkedUpload.addFiles(fileList, currentPath);
  };

  const handleSopListo = () => {
    setShowUploadModal(false);
    chunkedUpload.clearCompleted();
    triggerRefresh();
    setShowSopToast(true);
    setTimeout(() => setShowSopToast(false), 3000);
  };

  // ── Drag & Drop ──
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) handleSopUpload(e.dataTransfer.files); };

  // ── Computed ──
  const filteredFolders = folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return {
    // Constants
    projectPrefix, isAdmin,
    
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
    showSopToast, setShowSopToast,
    sopMinimized, setSopMinimized,
    showUploadMenu, setShowUploadMenu,
    dragOver, pendingBanner, setPendingBanner,
    chunkedUpload, handleSopUpload, handleSopListo,
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
    membersList, setMembersList,
    membersLoading, setMembersLoading,
    collapseSignal, setCollapseSignal,
    fileRef,
    
    // Cache
    cacheMethods, cacheVersion,
  };
}
