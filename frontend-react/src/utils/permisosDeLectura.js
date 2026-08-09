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
import { useEffect, useState } from 'react';
import { apiFetch } from './apiFetch';

const cache = new Map();          // urn -> { token, pedidoEn }
const VIGENCIA_LOCAL_MS = 20 * 60 * 1000;   // se repide antes de que caduque

/** Devuelve { clave, tipo } del recurso al que apunta la url, o null. */
function recursoDeLaUrl(url) {
  try {
    const q = new URL(url, window.location.origin).searchParams;
    const urn = q.get('urn');
    if (urn) return { clave: urn, tipo: 'urns' };
    const id = q.get('id');
    // Los PDF y las miniaturas se piden por ?id=<nodo>. El backend lo comprueba
    // distinto que un urn, así que va en su propia lista.
    if (id) return { clave: id, tipo: 'ids' };
    return null;
  } catch { return null; }
}

/** Pide permisos para varias urls de golpe y devuelve las urls ya firmadas. */
export async function firmarUrls(backendUrl, urls) {
  const necesarias = new Map();   // urn -> [índices]
  const ahora = Date.now();

  const porTipo = { urns: [], ids: [] };
  urls.forEach((url) => {
    if (!url || !String(url).includes('/api/docs/proxy')) return;
    const recurso = recursoDeLaUrl(url);
    if (!recurso) return;
    const guardado = cache.get(recurso.clave);
    if (guardado && ahora - guardado.pedidoEn < VIGENCIA_LOCAL_MS) return;
    if (necesarias.has(recurso.clave)) return;
    necesarias.set(recurso.clave, true);
    porTipo[recurso.tipo].push(recurso.clave);
  });

  if (necesarias.size) {
    try {
      const res = await apiFetch(`${backendUrl}/api/docs/asset-tokens`, {
        method: 'POST',
        body: JSON.stringify(porTipo),
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
    const recurso = recursoDeLaUrl(url);
    const guardado = recurso && cache.get(recurso.clave);
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


/**
 * Hook para componentes que reciben UNA url y no pueden mandar cabecera
 * (el lector de PDF). Devuelve null mientras se pide el permiso, para que el
 * componente no intente cargar el documento y se coma un 401.
 */
export function useUrlFirmada(backendUrl, url) {
  const [firmada, setFirmada] = useState(null);
  useEffect(() => {
    if (!url) { setFirmada(null); return; }
    if (!String(url).includes('/api/docs/proxy')) { setFirmada(url); return; }
    let cancelado = false;
    firmarUrl(backendUrl, url).then((u) => { if (!cancelado) setFirmada(u); });
    return () => { cancelado = true; };
  }, [backendUrl, url]);
  return firmada;
}
