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
import { arbolDocumental } from '../utils/arbolDocumental';
import { leerEnlace, conRevision, destinoTrasNavegar } from '../utils/revisiones';
import {
  leerEnlaceDeArchivos, conArchivos, sinCarpetaNiDocumento, enlaceDeArchivos, estadoDeArchivos,
  rutaDeLaCadena, pideLaVistaDeCarpetas, esIdentificador, ENLACE_NO_DISPONIBLE,
} from '../utils/enlacesDeArchivos';

// «Copiar enlace». El portapapeles moderno solo existe en contexto seguro; fuera de él,
// el camino clásico. Si ninguno copia, se dice.
async function copiarAlPortapapeles(texto) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(texto);
    return;
  }
  const area = document.createElement('textarea');
  area.value = texto;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const copiado = document.execCommand('copy');
  document.body.removeChild(area);
  if (!copiado) throw new Error('No se pudo copiar');
}
import { puedeEditarEn } from '../utils/capacidadesDeSeleccion';

export function useFileExplorer(project, user) {
  // EL ALCANCE QUE MANDA EL SERVIDOR, no una ruta deducida del nombre.
  // El nombre es editable: renombrar una obra movia el expediente entero.
  const projectPrefix = arbolDocumental(project);

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

  // QUÉ PUEDE HACER QUIEN MIRA EN LA CARPETA ABIERTA (13-sep-2026).
  //
  // «Cargar archivos», «Nueva carpeta» y soltar ficheros se decidían con
  // `isAdmin`, y a quien tenía «Editar» en la carpeta se le escondía lo que el
  // servidor sí le deja. El nivel lo manda el listado
  // (`current_permission_level`) con la misma regla que todo lo demás; mientras
  // no llega, no se ofrece.
  const [nivelCarpetaActual, setNivelCarpetaActual] = useState(null);
  const puedeEditarAqui = puedeEditarEn(nivelCarpetaActual, isAdmin);

  // ── Core Navigation State ──
  const [currentPath, setCurrentPath] = useState(projectPrefix + '/');
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const [projectRootId, setProjectRootId] = useState(null);

  // ENLACES DE ARCHIVOS. Un enlace con carpeta o documento de esta obra se resuelve
  // ANTES del primer listado: así no se pinta la raíz para saltar después.
  const obraDelEnlace = project?.id != null ? String(project.id) : null;
  const [resolviendoEnlace, setResolviendoEnlace] = useState(() => {
    const enlace = leerEnlaceDeArchivos(window.location.search);
    return Boolean(enlace && enlace.obra === obraDelEnlace && (enlace.carpeta || enlace.documento));
  });

  // ── File/Folder Data ──
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(resolviendoEnlace);
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
  const [creandoCarpeta, setCreandoCarpeta] = useState(false);
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
  // Un enlace a una revisión (`?revision=<id>`) abre directamente Revisiones;
  // `ReviewsView` lee el mismo parámetro para mostrar su detalle.
  const [sidebarView, fijarVista] = useState(() => (
    /[?&]revision=\d+(&|$)/.test(window.location.search) ? 'reviews' : 'files'));
  const vistaActual = useRef(sidebarView);
  useEffect(() => { vistaActual.current = sidebarView; }, [sidebarView]);

  // LA DIRECCIÓN Y LA PANTALLA DICEN LO MISMO (E1.2 · H5).
  //
  // Antes, en Archivos, Adelante devolvía `?revision=` a la dirección sin que nada
  // cambiara en pantalla: copiarla daba el enlace de una revisión que no se veía, y
  // «Revisiones» abría esa revisión en vez de la lista. Ahora:
  //   · «Revisiones» desde el menú, o tras «Enviar a revisión», abre la LISTA: si la
  //     dirección guardaba el enlace de una revisión que no se ve, se quita antes;
  //   · si Atrás o Adelante traen una revisión de esta obra estando en otra sección, se
  //     enseña esa revisión. Dentro de Revisiones manda `ReviewsView`, y una revisión
  //     de otra obra la abre `App_Refactor` como un enlace.
  const setSidebarView = useCallback((vista) => {
    if (vista === 'reviews' && vistaActual.current !== 'reviews'
        && leerEnlace(window.location.search)) {
      window.history.replaceState(null, '', window.location.pathname
        + conRevision(window.location.search, null, null));
    }
    fijarVista(vista);
  }, []);
  const obraDelExplorador = project?.id;
  useEffect(() => {
    const alNavegar = () => {
      const destino = destinoTrasNavegar(window.location.search,
                                         { enDocumentos: true, obraActual: obraDelExplorador });
      if (destino.tipo === 'revisiones' && vistaActual.current !== 'reviews') fijarVista('reviews');
    };
    window.addEventListener('popstate', alNavegar);
    return () => window.removeEventListener('popstate', alNavegar);
  }, [obraDelExplorador]);

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
  const { methods: cacheMethods, cacheVersion, nodosInvalidados } = useFolderCache(API, projectPrefix);

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
      // SOLO LA CARPETA DONDE SE SUBIO, y su padre por el contador de hijos.
      // Antes esto era `invalidateAll()`: borraba la cache del arbol ENTERO,
      // asi que todos los nodos perdian sus hijos, se desmontaban y renacian
      // CERRADOS. Subir un fichero a una carpeta cerraba las otras cuarenta
      // -- lo reporto el dueno, y ACC no hace eso. Una subida a una carpeta
      // no tiene por que invalidar las demas.
      cacheMethods.invalidateNode(currentNodeIdRef.current || '__root__');
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
        
        if (!trash) setNivelCarpetaActual(data.current_permission_level || null);

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
        if (!trash) alListarCarpeta.current(path, data.current_node_id, sortedFiles);
        
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
      } else if (!trash) {
        alFallarListado.current(path);
      }
    } catch (e) {
      console.error(e);
      if (!trash && seq === fetchSeqRef.current) alFallarListado.current(path);
    }
    finally { if (!silent && seq === fetchSeqRef.current) setLoading(false); }
  }, [projectPrefix, cacheMethods]);

  useEffect(() => {
    if (resolviendoEnlace) return;           // primero, dónde está lo que pide la dirección
    fetchContents(currentPath, isTrashMode, false, isTrashMode ? null : currentNodeId);
  }, [currentPath, isTrashMode, currentNodeId, fetchContents, resolviendoEnlace]);

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

  // `historial`: 'push' en los viajes de la persona (su paso en Atrás); 'replace' o 'nada'
  // para lo que solo corrige o restaura. El paso se escribe cuando el listado confirma el
  // id de la carpeta: las migas de pan llegan con la ruta, no con el id.
  const navigate = useCallback((path, id = null, { historial = 'push' } = {}) => {
    const normalizedPath = path.replace(/\/$/, '');
    const isRoot = normalizedPath === projectPrefix;
    const finalId = isRoot ? null : id;
    const finalPath = path.endsWith('/') ? path : path + '/';

    // Pulsar una carpeta SALE de la busqueda, y esto va ANTES de la salida de
    // abajo a proposito: el caso corriente es volver a pulsar la carpeta en la
    // que YA estas para recuperar su contenido. Si esperase a que cambie la
    // ruta, ese clic -el que el usuario repite- seria justo el que no hace
    // nada. La busqueda es de todo el proyecto y no se reencuadra al cambiar
    // de carpeta, asi que no se pierde nada al cerrarla.
    setSearchQuery('');

    if (finalPath === currentPath && finalId === currentNodeId) return;

    // La persona manda sobre un enlace que aún se estuviera resolviendo.
    peticionDeEnlace.current += 1;
    enlaceEnVuelo.current = false;
    aperturaPendiente.current = null;
    historialPendiente.current = historial === 'nada' ? null : { ruta: finalPath, accion: historial };
    setResolviendoEnlace(false);

    // No vaciamos los arrays ni ponemos loading bruto, dejamos que fetchContents lo maneje con caché
    setCurrentPath(finalPath);
    setCurrentNodeId(finalId);
    setNivelCarpetaActual(null);
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
    setNivelCarpetaActual(null);
    setSearchQuery('');
    setSelected(new Set());
    triggerRefresh(path, nodeId);
  }, [switchMode, triggerRefresh]);

  // ═══════════════════════════════════════════════════════════════
  // ENLACES DE ARCHIVOS: la carpeta y el documento en la dirección (14-sep-2026)
  // ═══════════════════════════════════════════════════════════════
  //
  //   · entrar en una carpeta o abrir un documento añade su paso en Atrás;
  //   · Atrás, Adelante y F5 restauran la carpeta y el documento;
  //   · lo que llega por la dirección se valida SIEMPRE en el servidor
  //     (`/api/docs/ubicacion`): la carpeta es contexto y el documento manda; si se
  //     movió, se corrige la dirección sin añadir pasos;
  //   · fuera de la vista de carpetas la dirección no dice carpeta ni documento.
  // La papelera, la búsqueda y Compartir no cambian.
  const peticionDeEnlace = useRef(0);
  const enlaceEnVuelo = useRef(false);
  const historialPendiente = useRef(null);   // { ruta, accion } hasta que llegue el listado
  const aperturaPendiente = useRef(null);    // { ruta, carpeta, documento, version }
  const carpetaListadaRef = useRef(null);
  const filesRef = useRef([]);
  const activeFileRef = useRef(activeFile);
  const versionVistaRef = useRef(viewedVersionInfo);
  const currentPathRef = useRef(currentPath);
  const loadingRef = useRef(loading);
  const isTrashModeRef = useRef(isTrashMode);
  const vistaAnterior = useRef(sidebarView);
  useEffect(() => { activeFileRef.current = activeFile; }, [activeFile]);
  useEffect(() => { versionVistaRef.current = viewedVersionInfo; }, [viewedVersionInfo]);
  useEffect(() => { currentPathRef.current = currentPath; }, [currentPath]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { isTrashModeRef.current = isTrashMode; }, [isTrashMode]);

  const enLaRaiz = (ruta) => ruta === projectPrefix || ruta === `${projectPrefix}/`;
  const carpetaVisible = () => (enLaRaiz(currentPathRef.current)
    ? null : (currentNodeIdRef.current || carpetaListadaRef.current || null));

  const escribirDireccion = (enlace, accion = 'replace', extra = {}) => {
    if (!obraDelEnlace || vistaActual.current !== 'files') return;
    const destino = { ...enlace, obra: obraDelEnlace };
    const url = window.location.pathname + conArchivos(window.location.search, destino);
    const estado = estadoDeArchivos(destino, extra);
    if (accion === 'push' && url !== window.location.pathname + window.location.search) {
      window.history.pushState(estado, '', url);
    } else {
      window.history.replaceState(estado, '', url);
    }
  };

  const cerrarVisor = () => { setActiveFile(null); setShowVersions(false); setViewedVersionInfo(null); };

  // Ir a una carpeta SIN añadir pasos (restaurar, corregir). Dice si cambia lo listado.
  const irACarpeta = (ruta, carpetaId) => {
    const raiz = enLaRaiz(ruta);
    const id = raiz ? null : carpetaId;
    historialPendiente.current = null;
    setSearchQuery('');
    if (vistaActual.current !== 'files') {
      vistaAnterior.current = 'files';
      vistaActual.current = 'files';
      fijarVista('files');
    }
    const misma = ruta === currentPathRef.current
      && (raiz || id === currentNodeIdRef.current || id === carpetaListadaRef.current);
    if (misma && !isTrashModeRef.current) return false;
    currentPathRef.current = ruta;
    currentNodeIdRef.current = id;
    setCurrentPath(ruta);
    setCurrentNodeId(id);
    setNivelCarpetaActual(null);
    setSelected(new Set());
    setIsTrashMode(false);
    return !misma;
  };

  const abrirDesdeElListado = (apertura, lista) => {
    const doc = (lista || []).find(f => String(f.id) === String(apertura.documento));
    if (!doc) {
      // El servidor lo dio por bueno, pero el listado ya no lo trae: se borró o cambió
      // entre tanto. Se dice como cualquier enlace que no se abre.
      toast.error(ENLACE_NO_DISPONIBLE);
      escribirDireccion({ carpeta: apertura.carpeta }, 'replace');
      return;
    }
    const previo = window.history.state;
    const abiertoAqui = Boolean(previo?.alephia === 'archivos' && previo.abiertoAqui
      && String(previo.documento) === String(doc.id));
    setShowVersions(false);
    setViewedVersionInfo(apertura.version || null);
    setActiveFile(doc);
    activeFileRef.current = doc;
    escribirDireccion({ carpeta: apertura.carpeta, documento: String(doc.id),
                        version: apertura.version?.id || null }, 'replace', { abiertoAqui });
  };

  // Lo que llama `fetchContents`: siempre la versión de este render.
  const alListarCarpeta = useRef(() => {});
  const alFallarListado = useRef(() => {});
  const restaurarEnlace = useRef(async () => {});
  useEffect(() => {
    alListarCarpeta.current = (ruta, idListado, lista) => {
      const id = idListado && idListado !== 'null' ? String(idListado) : null;
      const carpeta = enLaRaiz(ruta) ? null : id;
      carpetaListadaRef.current = id;
      filesRef.current = lista;
      const apertura = aperturaPendiente.current;
      if (apertura && apertura.ruta === ruta) {
        aperturaPendiente.current = null;
        abrirDesdeElListado(apertura, lista);
        return;
      }
      const pendiente = historialPendiente.current;
      if (pendiente) {
        if (pendiente.ruta !== ruta) return;
        historialPendiente.current = null;
        escribirDireccion({ carpeta }, pendiente.accion);
        return;
      }
      // Sin viaje pendiente --se suprimió la carpeta abierta, por ejemplo-- la dirección
      // sigue a lo que se ve, sin añadir pasos.
      if (enlaceEnVuelo.current || activeFileRef.current || aperturaPendiente.current) return;
      const enlace = leerEnlaceDeArchivos(window.location.search);
      if (enlace && enlace.obra === obraDelEnlace && ((enlace.carpeta || null) !== carpeta || enlace.documento)) {
        escribirDireccion({ carpeta }, 'replace');
      }
    };

    alFallarListado.current = (ruta) => {
      if (aperturaPendiente.current?.ruta === ruta) {
        aperturaPendiente.current = null;
        toast.error('No se pudo abrir el documento: no se pudo cargar su carpeta.');
      }
      if (historialPendiente.current?.ruta === ruta) historialPendiente.current = null;
    };

    restaurarEnlace.current = async (enlace, { inicial = false } = {}) => {
      const n = ++peticionDeEnlace.current;
      enlaceEnVuelo.current = true;
      const q = new URLSearchParams({ model_urn: projectPrefix });
      ['carpeta', 'documento', 'version'].forEach((clave) => { if (enlace[clave]) q.set(clave, enlace[clave]); });
      let r = null;
      let d = null;
      try {
        r = await apiFetch(`${API}/api/docs/ubicacion?${q.toString()}`);
        d = await r.json().catch(() => null);
      } catch { r = null; }
      if (n !== peticionDeEnlace.current) return;
      enlaceEnVuelo.current = false;
      if (r && r.status === 401) return;          // `apiFetch` ya recarga hacia el login
      if (!r || !r.ok || !d?.success) {
        aperturaPendiente.current = null;
        cerrarVisor();
        if (r) {
          // Inexistente, de otra obra, en la papelera o sin permiso: lo mismo, sin nombres.
          toast.error(ENLACE_NO_DISPONIBLE);
          irACarpeta(`${projectPrefix}/`, null);
          escribirDireccion({ carpeta: null }, 'replace');
        } else {
          toast.error('No se pudo abrir el enlace: no se pudo conectar con el servidor.');
        }
        if (inicial) setResolviendoEnlace(false);
        return;
      }
      const ruta = rutaDeLaCadena(projectPrefix, d.ruta);
      const carpeta = d.carpeta || null;
      if (d.documento) {
        aperturaPendiente.current = { ruta, carpeta, documento: String(d.documento), version: d.version || null };
        const cambia = irACarpeta(ruta, carpeta);
        if (!cambia && !inicial && !loadingRef.current) {
          const apertura = aperturaPendiente.current;
          aperturaPendiente.current = null;
          abrirDesdeElListado(apertura, filesRef.current);
        }
      } else {
        aperturaPendiente.current = null;
        cerrarVisor();
        irACarpeta(ruta, carpeta);
        escribirDireccion({ carpeta }, 'replace');
      }
      if (inicial) setResolviendoEnlace(false);
    };
  });

  // Al montar: el enlace de la dirección, o la dirección de la obra.
  useEffect(() => {
    const enlace = leerEnlaceDeArchivos(window.location.search);
    if (enlace && enlace.obra === obraDelEnlace && (enlace.carpeta || enlace.documento)) {
      restaurarEnlace.current(enlace, { inicial: true });
    } else if (vistaActual.current === 'files' && !leerEnlace(window.location.search)) {
      escribirDireccion({ carpeta: null }, 'replace');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ATRÁS Y ADELANTE dentro de la obra. Las revisiones las resuelve `alNavegar`, y otra
  // obra, la lista y la portada, `App_Refactor`.
  useEffect(() => {
    const alNavegarEnArchivos = () => {
      const enlace = leerEnlaceDeArchivos(window.location.search);
      if (!enlace || enlace.obra !== obraDelEnlace) return;
      if (vistaActual.current !== 'files' && !pideLaVistaDeCarpetas(enlace, obraDelEnlace)) return;
      historialPendiente.current = null;
      if (!enlace.carpeta && !enlace.documento) {
        peticionDeEnlace.current += 1;
        enlaceEnVuelo.current = false;
        aperturaPendiente.current = null;
        cerrarVisor();
        irACarpeta(`${projectPrefix}/`, null);
        return;
      }
      const visible = carpetaVisible();
      const abierto = activeFileRef.current;
      const enCarpetas = vistaActual.current === 'files' && !isTrashModeRef.current;
      if (enCarpetas && !enlace.documento && enlace.carpeta === visible) {
        // Cerrar el documento: su carpeta ya es la que se ve.
        peticionDeEnlace.current += 1;
        enlaceEnVuelo.current = false;
        aperturaPendiente.current = null;
        cerrarVisor();
        return;
      }
      const versionVista = versionVistaRef.current?.id ? String(versionVistaRef.current.id) : null;
      if (enCarpetas && enlace.documento && abierto && String(abierto.id) === enlace.documento
          && (enlace.carpeta || null) === visible && (enlace.version || null) === versionVista) return;
      restaurarEnlace.current(enlace);
    };
    window.addEventListener('popstate', alNavegarEnArchivos);
    return () => window.removeEventListener('popstate', alNavegarEnArchivos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraDelEnlace, projectPrefix]);

  // Fuera de la vista de carpetas la dirección no dice carpeta ni documento; al volver,
  // dice otra vez la carpeta que se ve. Ninguno de los dos añade pasos a Atrás.
  useEffect(() => {
    const antes = vistaAnterior.current;
    vistaAnterior.current = sidebarView;
    if (sidebarView !== 'files') {
      historialPendiente.current = null;
      const search = window.location.search;
      const limpia = sinCarpetaNiDocumento(search);
      if (limpia !== search) window.history.replaceState(null, '', window.location.pathname + limpia);
      return;
    }
    if (antes !== 'files') escribirDireccion({ carpeta: carpetaVisible() }, 'replace');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarView]);

  // Abrir desde la tabla o la cuadrícula: su paso en Atrás. Pasar al siguiente dentro
  // del lector solo cambia la dirección.
  const anotarDocumento = (doc, { reemplazar = false } = {}) => {
    if (!doc?.id || !esIdentificador(doc.id)) return;
    const abiertoAqui = reemplazar ? Boolean(window.history.state?.abiertoAqui) : true;
    escribirDireccion({ carpeta: carpetaVisible(), documento: String(doc.id) },
                      reemplazar ? 'replace' : 'push', { abiertoAqui });
  };

  // Cerrar vuelve a la dirección de su carpeta: con Atrás si el paso lo dio abrirlo aquí,
  // y si llegó por un enlace, sin tocar la historia de antes.
  const cerrarDocumento = () => {
    const previo = window.history.state;
    const abierto = activeFileRef.current;
    cerrarVisor();
    activeFileRef.current = null;
    if (vistaActual.current !== 'files') return;
    if (previo?.alephia === 'archivos' && previo.abiertoAqui && abierto
        && String(previo.documento) === String(abierto.id)) {
      window.history.back();
      return;
    }
    escribirDireccion({ carpeta: carpetaVisible() }, 'replace');
  };

  // Elegir una versión en el lector: la vigente no lleva `version`; otra, sí. Sin pasos.
  const verVersion = (version) => {
    setViewedVersionInfo(version);
    const doc = activeFileRef.current;
    if (!doc?.id || !esIdentificador(doc.id)) return;
    const fija = version?.id && String(version.id) !== String(doc.version_id || '') ? String(version.id) : null;
    escribirDireccion({ carpeta: carpetaVisible(), documento: String(doc.id), version: fija }, 'replace',
                      { abiertoAqui: Boolean(window.history.state?.abiertoAqui) });
  };

  // «Copiar enlace»: al documento vigente, no a una versión congelada.
  const copiarEnlace = async (item) => {
    let enlace = null;
    if (item?.type === 'folder') {
      const raiz = String(item.id) === String(projectRootId) || enLaRaiz(item.fullName || '');
      if (raiz) enlace = { obra: obraDelEnlace };
      else if (esIdentificador(item.id)) enlace = { obra: obraDelEnlace, carpeta: String(item.id) };
    } else if (item && esIdentificador(item.id)) {
      enlace = { obra: obraDelEnlace, carpeta: carpetaVisible(), documento: String(item.id) };
    }
    if (!enlace?.obra) {
      toast.error('Este elemento todavía no tiene enlace. Inténtalo en un momento.');
      return;
    }
    try {
      await copiarAlPortapapeles(enlaceDeArchivos(window.location.origin, enlace));
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar el enlace.');
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // CRUD OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  const createFolder = async () => {
    if (!folderName.trim()) return;
    // Crear en la carpeta abierta exige «Editar» en ella; el servidor lo vuelve a
    // comprobar. Crear en otra carpeta lo decide solo el servidor.
    if (!newFolderParentPath && !puedeEditarAqui) {
      toast.error('Necesitas permiso de Editar en esta carpeta para crear carpetas.');
      return;
    }
    const targetPath = (newFolderParentPath || currentPath) + ((newFolderParentPath || currentPath).endsWith('/') ? '' : '/') + folderName.trim() + '/';
    const parentId = newFolderParentPath || (currentPath.startsWith(projectPrefix) && (currentPath === projectPrefix || currentPath === projectPrefix + '/') ? null : currentPath);
    if (parentId && parentId.length > 30) setProcessingIds(prev => ({ ...prev, [parentId]: true }));
    setCreandoCarpeta(true);
    try {
      const res = await apiFetch(`${API}/api/docs/folder`, {
        method: 'POST',
        body: JSON.stringify({ path: targetPath, model_urn: projectPrefix, user: user?.name })
      });
      if (res.ok) {
        const cuerpo = await res.json().catch(() => ({}));
        setShowNewFolder(false);
        setFolderName('');
        setNewFolderParentPath('');

        // LA CARPETA SE PONE EN LA TABLA YA. Antes habia DOS esperas seguidas:
        // la peticion, y despues el refresco entero de la carpeta -- la carpeta
        // recien creada tardaba otro par de segundos en asomar, y parecia que
        // no se habia creado. El refresco de abajo sigue, pero pasa a ser lo que
        // debe ser: una reconciliacion de fondo, no lo que la hace aparecer.
        //
        // Se usa el id que devuelve el servidor, asi que cuando llegue el
        // listado real sustituye a esta fila en vez de duplicarla. Y el
        // `fullName` de una carpeta lleva barra final, igual que `targetPath`:
        // con eso se puede entrar en ella sin esperar a nada.
        const creada = (nueva) => nueva && !nueva.startsWith('__');
        if (cuerpo.id && creada(String(cuerpo.id)) && !newFolderParentPath) {
          const fila = {
            id: cuerpo.id,
            name: folderName.trim(),
            fullName: targetPath,
            type: 'folder',
            updated: new Date().toISOString(),
            updated_by: user?.name || user?.email || '',
            description: '',
            has_children: false,
            has_access: true,
          };
          setFolders(prev => prev.some(f => String(f.id) === String(fila.id))
            ? prev
            : [...prev, fila].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })));
        }
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
      setCreandoCarpeta(false);
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
    // Sin `isAdmin`: quién puede suprimir lo dicen `capacidadesDeSeleccion`
    // («Administrar» en la carpeta) y el servidor, que lo vuelve a comprobar y
    // dice el motivo si no. Antes el clic de quien no administraba la obra se
    // perdía en silencio.
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

  // CUANTAS peticiones de desplazar caben a la vez. Iban de UNA EN UNA, en fila:
  // mover ocho ficheros eran ocho viajes seguidos al servidor, y el dialogo se
  // quedaba con su ruedecita hasta el ultimo. Sin lote en el servidor
  // (`/api/docs/batch` solo hace estado y borrado), lo que si se puede es dejar
  // de esperar a que uno acabe para empezar el siguiente. Cuatro, no todas:
  // abrir veinte peticiones a la vez castiga al servidor mas de lo que ayuda.
  const DESPLAZAMIENTOS_A_LA_VEZ = 4;

  const handleExecuteMove = async () => {
    if (!moveState.destPath || !moveState.itemIds?.length) return;
    const idsToMove = [...moveState.itemIds];
    if (moveState.destId && idsToMove.some(id => String(id) === String(moveState.destId))) {
      toast.error('No puedes mover un elemento dentro de sí mismo.');
      return;
    }

    // El destino se guarda ANTES de cerrar: cerrar vacia `moveState`.
    const destId = moveState.destId;
    // EL AVISO TIENE QUE DECIR A DONDE. «2 movidos correctamente» deja al
    // usuario mirando una carpeta con dos elementos menos y sin saber adonde
    // fueron -- y si eligio mal el destino, sin enterarse.
    const destRuta = String(moveState.destPath || '').replace(/\/+$/, '');
    const destNombre = (!destRuta || destRuta === String(projectPrefix).replace(/\/+$/, ''))
      ? 'Archivos de proyecto'
      : destRuta.split('/').pop();

    setProcessingIds(prev => {
      const n = { ...prev };
      idsToMove.forEach(id => n[id] = true);
      return n;
    });

    // El dialogo se cierra YA. La espera no desaparece -- el servidor tarda lo
    // que tarda -- pero deja de ser una ventana bloqueada: las filas que se
    // estan moviendo ya salen apagadas en la tabla, que es donde el usuario
    // esta mirando.
    setMoveState({ step: 0, items: [], itemIds: [], destPath: '', destId: null });
    // SOLO SALE DE LA SELECCIÓN LO QUE SE MUEVE. Antes se vaciaba entera, y
    // eso borraba el trabajo de quien tenía cinco marcados y pulsó el botón
    // derecho sobre un sexto que no estaba marcado: ese desplazamiento no es
    // sobre su selección y no tiene por qué deshacerla.
    const enMovimiento = new Set(idsToMove.map(String));
    setSelected(prev => new Set([...prev].filter(id => !enMovimiento.has(String(id)))));

    const movidos = [];
    const failures = [];
    const cola = [...idsToMove];

    const desplazarUno = async (nodeId) => {
      try {
        const res = await apiFetch(`${API}/api/docs/move`, {
          method: 'PUT',
          body: JSON.stringify({ node_id: nodeId, destNodeId: destId, model_urn: projectPrefix, user: user?.email })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          failures.push(errData.error || 'Error al desplazar');
          return;
        }
        movidos.push(nodeId);
      } catch (e) {
        console.error(e);
        failures.push('Error de red al desplazar');
      }
    };

    const trabajador = async () => { while (cola.length) await desplazarUno(cola.shift()); };
    await Promise.all(
      Array.from({ length: Math.min(DESPLAZAMIENTOS_A_LA_VEZ, cola.length) }, trabajador)
    );

    setProcessingIds(prev => {
      const n = { ...prev };
      idsToMove.forEach(id => delete n[id]);
      return n;
    });

    // Lo que se ha movido YA NO ESTA AQUI: se quita de la tabla en cuanto el
    // servidor lo confirma, sin esperar al refresco. Salvo que el destino sea
    // esta misma carpeta, claro, donde moverlo no lo saca de la vista.
    if (String(destId ?? '') !== String(currentNodeId ?? '')) quitarDeLaTabla(movidos);

    // COHERENCIA TABLA ↔ ÁRBOL: al desplazar cambian DOS ramas (origen y
    // destino). Sin invalidar ambas, el árbol seguía mostrando el elemento en
    // su sitio viejo (y no aparecía en el nuevo) hasta recargar la página.
    if (cacheMethods) {
      const origen = currentNodeId || '__root__';
      cacheMethods.invalidateNode(origen);
      if (destId) cacheMethods.invalidateNode(destId);
      else cacheMethods.invalidateNode('__root__');
    }
    setRefreshSignal(s => s + 1);
    triggerRefresh();
    if (failures.length) {
      // Conteo real, destino, y el motivo de lo que no se pudo: las tres cosas.
      toast.error(`${movidos.length} de ${idsToMove.length} elemento(s) movido(s) a "${destNombre}". ${failures[0]}`);
    } else {
      toast.success(`${movidos.length} elemento(s) movido(s) a "${destNombre}".`);
    }
  };

  const handleExecuteBatchDelete = async () => {
    if (selected.size === 0) return;
    // La selección YA son ids: no hay que traducir de ruta a id, que es donde
    // la cuadrícula se caía -- guardaba ids y esta búsqueda los buscaba como
    // rutas, no encontraba ninguno, y «Suprimir» se iba en silencio.
    const presentes = new Set([...folders, ...files].map(i => String(i.id)));
    const itemIds = Array.from(selected).filter(id => presentes.has(String(id)));
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
    if (!puedeEditarAqui) {
      toast.error('Necesitas permiso de Editar en esta carpeta para cargar archivos.');
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

  // SUBIR UNA VERSIÓN NUEVA DE UN DOCUMENTO. El servidor ya versiona por
  // nombre: lo que llega a la misma carpeta con el mismo nombre es la versión
  // siguiente (`create_file_record`). Aquí solo se sube el fichero elegido CON
  // EL NOMBRE DEL DOCUMENTO, para que nadie tenga que renombrarlo a mano.
  const subirNuevaVersion = (item, fichero) => {
    if (!item?.name || !fichero) return;
    const extension = (n) => (String(n).includes('.') ? String(n).split('.').pop().toLowerCase() : '');
    if (extension(fichero.name) !== extension(item.name)) {
      toast.error(`La versión nueva tiene que ser del mismo tipo que «${item.name}».`);
      return;
    }
    const ruta = String(item.fullName || '');
    const carpeta = ruta.includes('/') ? ruta.slice(0, ruta.lastIndexOf('/') + 1) : currentPath;
    const conSuNombre = new File([fichero], item.name, { type: fichero.type, lastModified: fichero.lastModified });
    setShowUploadModal(true);
    chunkedUpload.addFiles([conSuNombre], carpeta);
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
  // LOS OBJETOS seleccionados, no sus claves: es lo que necesita saber
  // qué se puede hacer con ellos (tipo, permiso, acceso).
  const elementosSeleccionados = [...folders, ...files].filter(i => selected.has(i.id));

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
    anotarDocumento, cerrarDocumento, verVersion, copiarEnlace,
    
    // Data
    folders, setFolders, files, setFiles,
    loading, setLoading,
    selected, setSelected, toggle,
    refreshSignal, setRefreshSignal, triggerRefresh, nodosInvalidados,
    filteredFolders, filteredFiles,
    elementosSeleccionados,
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
    creandoCarpeta,
    
    // Upload
    showUploadModal, setShowUploadModal,
    sopMinimized, setSopMinimized,
    showUploadMenu, setShowUploadMenu,
    dragOver, pendingBanner, setPendingBanner,
    chunkedUpload, handleSopUpload, handleSopListo, openUploadedFile,
    subirNuevaVersion, nivelCarpetaActual, puedeEditarAqui,
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
