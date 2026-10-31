/**
 * La imagen de la lámina de una tarjeta del tablero (docs/visor/59), por las puertas de Docs:
 *
 * - PDF: la vista previa legible de ESA versión (2.000 px, preparada al subir). Si no existe —lo antiguo, o un PDF
 *   recién subido— la dibuja el NAVEGADOR con pdf.js, como el lector, y mientras tanto la tarjeta dice «Preparando la
 *   vista previa…» con su avance (lo que ACC enseña como «Preparando 1 páginas…»). El servidor no dibuja al abrir:
 *   está apagado desde las caídas por memoria del 14-oct.
 * - Imágenes (fotos, planos en JPG/PNG): la propia imagen.
 * - Lo demás (DWG, RVT, Excel, Word…): sin imagen, ficha.
 *
 * Una sola imagen por versión en memoria, y los dibujos en el navegador de uno en uno.
 */
import { API } from '../../utils/helpers';
import { apiFetch } from '../../utils/apiFetch';
import { EXTENSIONES_CON_IMAGEN } from './documentos';

const VIDA_MS = 40 * 60 * 1000;           // las URL firmadas caducan: se piden otra vez después
const LADO_MAYOR = 2000;                  // lo mismo que la vista previa del servidor
const cache = new Map();                  // clave → { t, r }
const enCurso = new Map();                // clave → { promesa, avisos }: dos tarjetas de la misma versión, un dibujo
let cola = Promise.resolve();             // dibujos en el navegador, de uno en uno

const estadoDe = (resp, d) => (resp.status === 403 || resp.status === 404 ? { estado: 'sinAcceso' }
  : d.url ? { estado: 'lista', url: d.url } : null);

async function urlFirmada(el) {
  const q = new URLSearchParams({ id: el.nodeId, ...(el.versionId ? { version_id: el.versionId } : {}) });
  const resp = await apiFetch(`${API}/api/docs/signed-url?${q}`);
  const d = await resp.json().catch(() => ({}));
  return { resp, d };
}

// Página 1 del PDF a 2.000 px, en el navegador. `avance(0..1)` mientras baja.
function dibujarEnElNavegador(url, avance) {
  const trabajo = cola.then(async () => {
    const { abrirPdf } = await import('../../utils/pdfjs');
    const tarea = abrirPdf({ url, disableAutoFetch: true, disableStream: true });
    tarea.onProgress = ({ loaded, total }) => { if (total) avance(Math.min(1, loaded / total)); };
    const pdf = await tarea.promise;
    try {
      const pagina = await pdf.getPage(1);
      const base = pagina.getViewport({ scale: 1 });
      const vp = pagina.getViewport({ scale: LADO_MAYOR / Math.max(base.width, base.height) });
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(vp.width); lienzo.height = Math.round(vp.height);
      const ctx = lienzo.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, lienzo.width, lienzo.height);
      await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await new Promise(res => lienzo.toBlob(res, 'image/jpeg', 0.86));
      lienzo.width = lienzo.height = 0;
      return blob ? URL.createObjectURL(blob) : null;
    } finally {
      pdf.destroy();
    }
  });
  cola = trabajo.catch(() => null);
  return trabajo;
}

/**
 * { estado: 'lista', url } | { estado: 'sinAcceso' } | { estado: 'ficha' } | { estado: 'error' }.
 * `avance(fraccion)` se llama si hay que dibujarla en el navegador (la tarjeta enseña «Preparando…»).
 */
export function imagenDe(el, avance = () => {}) {
  if (!EXTENSIONES_CON_IMAGEN.includes(el.ext)) return Promise.resolve({ estado: 'ficha' });
  const clave = el.versionId || el.nodeId;
  const guardada = cache.get(clave);
  if (guardada && (guardada.local || Date.now() - guardada.t < VIDA_MS)) return Promise.resolve(guardada.r);
  let curso = enCurso.get(clave);
  if (!curso) {
    curso = { avisos: new Set() };
    curso.promesa = buscar(el, clave, (f) => curso.avisos.forEach(a => a(f))).finally(() => enCurso.delete(clave));
    enCurso.set(clave, curso);
  }
  curso.avisos.add(avance);
  return curso.promesa;
}

async function buscar(el, clave, avance) {
  let r;
  try {
    if (el.ext === 'pdf') {
      const resp = await apiFetch(`${API}/api/docs/vista-previa/url`, { method: 'POST', body: JSON.stringify({ node_id: el.nodeId, version_id: el.versionId || '' }) });
      const d = await resp.json().catch(() => ({}));
      r = estadoDe(resp, d);
      if (!r) {
        // Sin vista previa preparada: la dibuja el navegador, a partir del PDF de esa versión.
        avance(0);
        const { resp: rf, d: df } = await urlFirmada(el);
        if (rf.status === 403 || rf.status === 404) r = { estado: 'sinAcceso' };
        else if (!df.url) r = { estado: 'error' };
        else {
          const local = await dibujarEnElNavegador(df.url, avance);
          r = local ? { estado: 'lista', url: local } : { estado: 'error' };
          if (local) { cache.set(clave, { t: Date.now(), r, local: true }); return r; }
        }
      }
    } else {
      const { resp, d } = await urlFirmada(el);
      r = estadoDe(resp, d) || { estado: 'error' };
    }
  } catch {
    return { estado: 'error' };
  }
  if (r.estado !== 'error') cache.set(clave, { t: Date.now(), r });
  return r;
}
