/**
 * Red y navegación de las marcas con enlace: abrir un documento en su pestaña y subir una foto a la obra.
 * Separado de MarcaConEnlace.jsx para que ese fichero solo exporte componentes.
 */
import toast from 'react-hot-toast';
import { apiFetch } from './apiFetch';
import { uploadFile } from '../services/uploadService';
import { conArchivos, leerEnlaceDeArchivos } from './enlacesDeArchivos';
import { CARPETA_DE_FOTOS, conMarca, nombreParaSubir } from './marcasConEnlace';

// ── Navegación ───────────────────────────────────────────────────────────────
export function obraDeLaDireccion() {
  return leerEnlaceDeArchivos(window.location.search)?.obra || new URLSearchParams(window.location.search).get('obra');
}

/** Abre un documento en su pestaña (como el sustento), en la página y la marca indicadas. */
export function abrirDocumento(documento, extra = {}) {
  const obra = obraDeLaDireccion();
  if (!obra || !documento) { toast.error('No se pudo saber la obra para abrir el documento.'); return; }
  window.open(window.location.pathname + conMarca(conArchivos(window.location.search, { obra, documento }), extra),
    `lda-${documento}`);
}

// ── Subir una foto: upload-url → PUT firmado → upload-confirm en MULTIMEDIA/ ─────
export async function subirFoto(API, obra, file) {
  const nombre = nombreParaSubir(file.name);
  const tipo = file.type || 'application/octet-stream';
  const r1 = await apiFetch(`${API}/api/docs/upload-url`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: nombre, contentType: tipo, model_urn: obra }),
  });
  const d1 = await r1.json().catch(() => ({}));
  if (!r1.ok || !d1.success) throw new Error(d1.error || 'No se pudo preparar la subida.');
  await uploadFile(file, d1.uploadUrl, { isDirect: true });
  const r2 = await apiFetch(`${API}/api/docs/upload-confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: nombre, gcs_urn: d1.gcs_urn, size_bytes: file.size, mime_type: tipo,
                           path: CARPETA_DE_FOTOS, model_urn: obra,
                           description: 'Foto marcada sobre un plano' }),
  });
  const d2 = await r2.json().catch(() => ({}));
  const id = d2?.file?.id;
  if (!r2.ok || !d2.success || !id) throw new Error(d2.error || 'La foto subió, pero no se pudo registrar.');
  return { id, nombre };
}
