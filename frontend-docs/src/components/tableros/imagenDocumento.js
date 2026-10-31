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
import { EXTENSIONES_CON_IMAGEN, EXTENSIONES_CAD } from './documentos';

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

// Una hoja del PDF a 2.000 px, en el navegador. `avance(0..1)` mientras baja (por rangos: solo lo que esa hoja pide).
// `cabeceras`: el permiso de visor de Autodesk, para las presentaciones de un DWG.
function dibujarEnElNavegador(url, avance, numero = 1, cabeceras = null) {
  const trabajo = cola.then(async () => {
    const { abrirPdf } = await import('../../utils/pdfjs');
    const tarea = abrirPdf({ url, disableAutoFetch: true, disableStream: true, ...(cabeceras ? { httpHeaders: cabeceras } : {}) });
    tarea.onProgress = ({ loaded, total }) => { if (total) avance(Math.min(1, loaded / total)); };
    const pdf = await tarea.promise;
    try {
      const pagina = await pdf.getPage(Math.min(Math.max(1, numero), pdf.numPages));
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
  const cad = EXTENSIONES_CAD.includes(el.ext);
  if (!cad && !EXTENSIONES_CON_IMAGEN.includes(el.ext)) return Promise.resolve({ estado: 'ficha' });
  const clave = `${el.versionId || el.nodeId}#${hojaDe(el)}`;
  const guardada = cache.get(clave);
  if (guardada && (guardada.local || Date.now() - guardada.t < VIDA_MS)) return Promise.resolve(guardada.r);
  let curso = enCurso.get(clave);
  if (!curso) {
    curso = { avisos: new Set() };
    curso.promesa = (cad ? buscarEnElPlano : buscar)(el, clave, (f) => curso.avisos.forEach(a => a(f))).finally(() => enCurso.delete(clave));
    enCurso.set(clave, curso);
  }
  curso.avisos.add(avance);
  return curso.promesa;
}

async function buscar(el, clave, avance) {
  let r = null;
  try {
    if (el.ext === 'pdf') {
      // La vista previa del servidor es de la primera hoja; las demás las dibuja siempre el navegador.
      if (hojaDe(el) === 1) {
        const resp = await apiFetch(`${API}/api/docs/vista-previa/url`, { method: 'POST', body: JSON.stringify({ node_id: el.nodeId, version_id: el.versionId || '' }) });
        const d = await resp.json().catch(() => ({}));
        r = estadoDe(resp, d);
      }
      if (!r) {
        // Sin vista previa preparada (u otra hoja): la dibuja el navegador, a partir del PDF de esa versión.
        avance(0);
        const { resp: rf, d: df } = await urlFirmada(el);
        if (rf.status === 403 || rf.status === 404) r = { estado: 'sinAcceso' };
        else if (!df.url) r = { estado: 'error' };
        else {
          const local = await dibujarEnElNavegador(df.url, avance, hojaDe(el));
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

export const hojaDe = (el) => (Number.isInteger(el?.pagina) && el.pagina > 0 ? el.pagina : 1);

// Cuántas hojas tiene un PDF (para ◀ n/N ▶ y «Extraer páginas»): el navegador abre solo su índice, por rangos.
// Una vez por versión. Un DWG: sus presentaciones. Lo demás, una.
const hojas = new Map();
export function hojasDe(el) {
  if (EXTENSIONES_CAD.includes(el.ext)) return planoDe(el).then(p => (p.estado === 'listo' ? p.hojas.length : 1));
  if (el.ext !== 'pdf') return Promise.resolve(1);
  const clave = el.versionId || el.nodeId;
  if (!hojas.has(clave)) {
    hojas.set(clave, (async () => {
      const { resp, d } = await urlFirmada(el);
      if (!resp.ok || !d.url) return 1;
      const { abrirPdf } = await import('../../utils/pdfjs');
      const pdf = await abrirPdf({ url: d.url, disableAutoFetch: true, disableStream: true }).promise;
      try { return pdf.numPages || 1; } finally { pdf.destroy(); }
    })().catch(() => { hojas.delete(clave); return 1; }));
  }
  return hojas.get(clave);
}


// ── Planos de AutoCAD (doc 59 §12) ─────────────────────────────────────────────────────────────────────────────
// La traducción con «vistas de AutoCAD» (`1bd162c8`) deja cada presentación —y el espacio modelo— como un PDF dibujado
// por AutoCAD, en Autodesk. El navegador lo baja directamente de Autodesk con el permiso de VISOR que ya usa el visor
// CAD (`/api/token`, solo lectura de lo traducido) y lo dibuja como una lámina. El servidor no dibuja nada.
// Nuestra ruta de estado da el identificador de esa traducción (y pasa por la guardia del plano: sin permiso, nada).
const APS = 'https://cdn.derivative.autodesk.com';
let permisoAps = null;
async function permisoDeVisor() {
  if (permisoAps && permisoAps.hasta > Date.now() + 60000) return permisoAps.token;
  const r = await apiFetch(`${API}/api/token`);
  const d = await r.json().catch(() => ({}));
  if (!d.access_token) throw new Error('sin permiso de visor');
  permisoAps = { token: d.access_token, hasta: Date.now() + (d.expires_in || 1800) * 1000 };
  return d.access_token;
}

// De dónde sale el plano, en el MISMO orden que el visor CAD (DocumentViewer): la vista ya preparada en ACC si el plano
// está vinculado a ella; si no, nuestra traducción con las vistas de AutoCAD. Solo se pregunta: la tarjeta no lanza
// traducciones (eso lo hace el visor al abrir el plano). null = sin acceso; '' = aún no hay nada que enseñar.
async function urnDelPlano(el) {
  const q = new URLSearchParams({ node_id: el.nodeId, ...(el.versionId ? { version_id: el.versionId } : {}) });
  const v = await apiFetch(`${API}/api/docs/cad/acc-link?${q}`);
  if (v.status === 403 || v.status === 404) return null;
  const vinculo = await v.json().catch(() => ({}));
  if (vinculo?.link?.viewer_urn) return vinculo.link.viewer_urn;
  q.set('vistas', 'autocad');
  const r = await apiFetch(`${API}/api/docs/cad/status?${q}`);
  if (r.status === 403 || r.status === 404) return null;
  const d = await r.json().catch(() => ({}));
  return d.success && d.status === 'success' && d.urn ? d.urn : '';
}

const planos = new Map();                 // versión → Promise<{ estado: 'listo', hojas } | { estado: 'sinAcceso' | 'preparando' }>
export function planoDe(el) {
  const clave = el.versionId || el.nodeId;
  if (!planos.has(clave)) {
    const promesa = (async () => {
      const urn = await urnDelPlano(el);
      if (urn === null) return { estado: 'sinAcceso' };
      if (!urn) return { estado: 'preparando' };
      const token = await permisoDeVisor();
      const m = await fetch(`${APS}/modeldata/manifest/${urn}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!m.ok) return { estado: 'preparando' };
      const indice = await m.json();
      const lista = [];
      const recorrer = (n) => {
        if (n?.type === 'geometry' && n.role === '2d') {
          const pdf = (n.children || []).find(c => c.role === 'pdf-page' && c.urn);
          if (pdf) lista.push({ nombre: n.viewableID === 'Model' ? 'Espacio modelo' : n.name, modelo: n.viewableID === 'Model', url: `${APS}/derivativeservice/v2/derivatives/${pdf.urn}` });
        }
        (n?.children || []).forEach(recorrer);
      };
      recorrer(indice);
      // Las PRESENTACIONES, en el orden del dibujo. El espacio modelo solo si no hay ninguna: en un plano de Civil abarca
      // kilómetros y, dibujado a 2.000 px, sus líneas quedan por debajo del píxel (medido el 31-oct con TP-000844: la
      // tarjeta salía en blanco). Se sigue viendo entero en el visor, con doble clic.
      const presentaciones = lista.filter(h => !h.modelo);
      const hojasDelPlano = presentaciones.length ? presentaciones : lista;
      return hojasDelPlano.length ? { estado: 'listo', hojas: hojasDelPlano } : { estado: 'preparando' };
    })().catch(() => ({ estado: 'preparando' }));
    planos.set(clave, promesa);
    // Lo que aún no está listo se vuelve a preguntar la próxima vez (la traducción puede terminar entre tanto).
    promesa.then(p => { if (p.estado !== 'listo') planos.delete(clave); });
  }
  return planos.get(clave);
}

async function buscarEnElPlano(el, clave, avance) {
  try {
    const plano = await planoDe(el);
    if (plano.estado === 'sinAcceso') return { estado: 'sinAcceso' };
    if (plano.estado !== 'listo') return { estado: 'ficha' };
    const hoja = plano.hojas[Math.min(hojaDe(el), plano.hojas.length) - 1];
    avance(0);
    const local = await dibujarEnElNavegador(hoja.url, avance, 1, { Authorization: `Bearer ${await permisoDeVisor()}` });
    if (!local) return { estado: 'error' };
    const r = { estado: 'lista', url: local, hoja: hoja.nombre };
    cache.set(clave, { t: Date.now(), r, local: true });
    return r;
  } catch {
    return { estado: 'error' };
  }
}
