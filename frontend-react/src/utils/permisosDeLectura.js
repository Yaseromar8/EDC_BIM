/**
 * Permisos de lectura para etiquetas <img> y para el lector de PDF.
 *
 * POR QUE EXISTE
 * Las fotos de obra se sirven por /api/docs/proxy, y una etiqueta <img> no puede
 * mandar cabecera de autorización. La solución que había era pegar
 * `?session_token=<sesión>` a la URL — y esa URL se GUARDABA en la base de datos
 * y se compartía por WhatsApp. Es decir: quien recibía la foto heredaba la
 * sesión entera del que la subió: 7 días, reutilizable y con todos sus permisos.
 *
 * Esto lo sustituye por un permiso firmado que abre UN solo fichero y caduca en
 * 24 horas. No se persiste en ningún sitio: se pide al mostrar.
 */
import { apiFetch } from './apiFetch';

const cache = new Map();          // urn -> { token, pedidoEn }
const VIGENCIA_LOCAL_MS = 20 * 60 * 1000;   // se repide antes de que caduque

function urnDeLaUrl(url) {
  try {
    const q = new URL(url, window.location.origin).searchParams;
    return q.get('urn') || q.get('id') || null;
  } catch { return null; }
}

/** Pide permisos para varias urls de golpe y devuelve las urls ya firmadas. */
export async function firmarUrls(backendUrl, urls) {
  const necesarias = new Map();   // urn -> [índices]
  const ahora = Date.now();

  urls.forEach((url, i) => {
    if (!url || !String(url).includes('/api/docs/proxy')) return;
    const urn = urnDeLaUrl(url);
    if (!urn) return;
    const guardado = cache.get(urn);
    if (guardado && ahora - guardado.pedidoEn < VIGENCIA_LOCAL_MS) return;
    if (!necesarias.has(urn)) necesarias.set(urn, []);
    necesarias.get(urn).push(i);
  });

  if (necesarias.size) {
    try {
      const res = await apiFetch(`${backendUrl}/api/docs/asset-tokens`, {
        method: 'POST',
        body: JSON.stringify({ urns: [...necesarias.keys()] }),
      });
      if (res.ok) {
        const { tokens = {} } = await res.json();
        for (const [urn, token] of Object.entries(tokens)) {
          cache.set(urn, { token, pedidoEn: Date.now() });
        }
      }
    } catch { /* sin permiso la imagen no carga; no se rompe la pantalla */ }
  }

  return urls.map((url) => {
    if (!url || !String(url).includes('/api/docs/proxy')) return url;
    const urn = urnDeLaUrl(url);
    const guardado = urn && cache.get(urn);
    if (!guardado) return url;
    // Se limpia cualquier token de sesión heredado de los permalinks antiguos:
    // esas URLs viejas siguen en la base y no deben seguir circulando.
    const limpia = String(url).replace(/[?&]session_token=[^&]*/g, '');
    return limpia + (limpia.includes('?') ? '&' : '?') + `t=${encodeURIComponent(guardado.token)}`;
  });
}

/** Igual, para una sola url. */
export async function firmarUrl(backendUrl, url) {
  const [firmada] = await firmarUrls(backendUrl, [url]);
  return firmada;
}
