// Ensayo de la vista ACC con un expediente real, sin escribir en Virginia.
// No es un vinculo publicado: vive solo en la sesion de esta pestaña.
const PREFIX = 'alephia:acc-preview-local:v1:';
const MODE_KEY = 'alephia:acc-preview-local:enabled';
// App_Refactor reescribe la URL al navegar: conservar la elección hecha al
// cargar la página, antes de que abra DocumentViewer.
const requestedAtLoad = typeof window === 'undefined' ? null
  : new URLSearchParams(window.location.search).get('acc_preview');

export function accPreviewEnabled() {
  if (import.meta.env?.DEV !== true) return false;
  try {
    const requested = requestedAtLoad === '1' || requestedAtLoad === '0'
      ? requestedAtLoad : new URLSearchParams(window.location.search).get('acc_preview');
    if (requested === '1' || requested === '0') {
      sessionStorage.setItem(MODE_KEY, requested);
    }
    return sessionStorage.getItem(MODE_KEY) === '1';
  } catch { return false; }
}

export function accPreviewKey(nodeId, versionId, gcsUrn) {
  if (!nodeId || !gcsUrn) return null;
  return `${PREFIX}${nodeId}:${versionId || 'actual'}:${gcsUrn}`;
}

export function readAccPreview(key, storage = sessionStorage) {
  if (!key) return null;
  try {
    const link = JSON.parse(storage.getItem(key) || 'null');
    return link?.viewer_urn && link?.preview_local === true ? link : null;
  } catch { return null; }
}

export function saveAccPreview(key, link, storage = sessionStorage) {
  if (!key || !link?.viewer_urn || link.preview_local !== true) return false;
  try { storage.setItem(key, JSON.stringify(link)); return true; }
  catch { return false; }
}

export function removeAccPreview(key, storage = sessionStorage) {
  if (!key) return;
  try { storage.removeItem(key); } catch { /* almacenamiento deshabilitado */ }
}

export function makeAccPreviewLink({ fileName, gcsUrn, projectId, itemId, version }) {
  const name = version?.attributes?.name || version?.attributes?.displayName || '';
  if (!version?.id || !gcsUrn || name.toLocaleLowerCase() !== fileName.toLocaleLowerCase()) {
    throw new Error('Selecciona una versión ACC del mismo archivo de Docs.');
  }
  const bytes = new TextEncoder().encode(version.id);
  const viewerUrn = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return {
    project_id: projectId, item_id: itemId, version_id: version.id,
    version_number: version.attributes?.versionNumber, name,
    viewer_urn: viewerUrn, gcs_urn: gcsUrn, preview_local: true,
  };
}

export function accReadOnlyPath(level, { hub_id: hubId, project_id: projectId,
  folder_id: folderId, item_id: itemId } = {}) {
  const segment = value => encodeURIComponent(String(value || ''));
  if (level === 'hubs') return '/api/hubs';
  if (level === 'projects' && hubId) return `/api/hubs/${segment(hubId)}/projects`;
  if (level === 'topFolders' && hubId && projectId) {
    return `/api/hubs/${segment(hubId)}/projects/${segment(projectId)}/topFolders`;
  }
  if (level === 'contents' && projectId && folderId) {
    return `/api/projects/${segment(projectId)}/folders/${segment(folderId)}/contents`;
  }
  if (level === 'versions' && projectId && itemId) {
    return `/api/projects/${segment(projectId)}/items/${segment(itemId)}/versions`;
  }
  throw new Error('Ubicación ACC inválida.');
}
