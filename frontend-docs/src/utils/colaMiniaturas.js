// Las miniaturas de una carpeta, en UNA petición.
//
// Antes esto era una cola que pedía las imágenes de dos en dos al backend,
// autenticadas, y cada una obligaba al servidor a bajar el objeto de Google
// y reenviarlo. Dos saltos por imagen: lentísimo comparado con ACC, que las
// sirve como objetos estáticos que el navegador baja en paralelo.
//
// Ahora se piden de golpe las URLs FIRMADAS de la carpeta y la pantalla las
// pone en <img src>: el navegador las baja directo del almacén, a la vez, y
// las cachea. Lo que todavía no está hecho vuelve como «pendiente» y el
// servidor lo genera mientras tanto.

import { apiFetch } from './apiFetch';
import { API } from './helpers';

export async function urlsDeMiniaturas(modelUrn, urns) {
  const limpias = (urns || []).filter(Boolean);
  if (!limpias.length) return { urls: {}, pendientes: [] };
  try {
    const r = await apiFetch(`${API}/api/docs/miniaturas/urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_urn: modelUrn, urns: limpias }),
      timeoutMs: 45000,
    });
    const d = await r.json();
    if (!r.ok || !d.success) return { urls: {}, pendientes: limpias };
    return { urls: d.urls || {}, pendientes: d.pendientes || [] };
  } catch {
    return { urls: {}, pendientes: limpias };
  }
}
