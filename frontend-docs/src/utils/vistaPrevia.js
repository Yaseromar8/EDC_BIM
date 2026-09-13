// Lo que se enseña al abrir un documento por su VERSIÓN, sin mezclarlo con su nombre.
//
// El visor rápido decide cómo pintar un fichero por la EXTENSIÓN de su nombre.
// `useDocPreview` le pegaba la versión al nombre --«DOC-OK3.pdf · v1»-- y el
// nombre dejaba de acabar en `.pdf`: el visor contestaba «Sin vista previa para
// este formato» a un PDF válido. El nombre se entrega intacto y la versión viaja
// aparte, en `versionLabel`, que es como el visor ya la recibe desde el panel de
// versiones. La versión pedida y la URL firmada no cambian.

export function etiquetaDeVersion(it) {
  if (!it || !it.version_id) return 'versión actual';
  return `v${it.version_number || it.version || '?'}`;
}

export function previsualizacion(it, url) {
  return {
    name: (it && it.name) || '',
    versionLabel: etiquetaDeVersion(it),
    url,
    nodeId: it ? it.node_id : undefined,
  };
}

const IMAGENES = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
const VIDEOS = ['.mp4', '.webm', '.ogg'];

export function tipoDeVista(nombre) {
  const n = String(nombre || '').toLowerCase();
  if (n.endsWith('.pdf')) return 'pdf';
  if (IMAGENES.some(e => n.endsWith(e))) return 'imagen';
  if (VIDEOS.some(e => n.endsWith(e))) return 'video';
  return null;
}
