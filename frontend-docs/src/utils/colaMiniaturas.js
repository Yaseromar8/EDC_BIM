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

// LA VISTA PREVIA LEGIBLE DE UNA LÁMINA (P1, en pruebas).
//
// La miniatura de 420 px sirve de silueta y nada más: en un A1 son 12 DPI, así
// que el cajetín es una mancha. Esto pide la imagen PREPARADA DE ANTEMANO de
// ESA VERSIÓN, con resolución suficiente para leer la lámina encuadrada,
// mientras el PDF original sigue bajando por detrás.
//
// Va por DOCUMENTO Y VERSIÓN, no por el objeto del almacén: quien decide qué
// objeto corresponde es el servidor, que es quien puede comprobar que esa
// versión es de ese documento y que quien pregunta tiene permiso para verla.
// La vista previa de la V2 no puede salir cuando se está mirando la V1.
export async function urlDeVistaPrevia(nodeId, versionId) {
  if (!nodeId && !versionId) return { url: null, pendiente: false };
  try {
    const r = await apiFetch(`${API}/api/docs/vista-previa/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: nodeId || null, version_id: versionId || null }),
      timeoutMs: 20000,
    });
    const d = await r.json();
    if (!r.ok || !d.success) return { url: null, pendiente: false };
    return { url: d.url || null, pendiente: !!d.pendiente };
  } catch {
    // Sin vista previa se abre como hasta ahora: el lector no depende de esto.
    return { url: null, pendiente: false };
  }
}

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
