import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiFetch';

/**
 * useGrupos — los grupos de documentos de la obra (routes/grupos.py).
 *
 * Los documentos viven en sus carpetas; un grupo solo apunta a ellos. Si el servidor aún no tiene la
 * ruta (migración 35 sin aplicar), `disponible` queda en false y la barra no enseña la sección.
 */
export function useGrupos(API, obra) {
  const [grupos, setGrupos] = useState([]);
  const [puedeCrearDeLaObra, setPuedeCrearDeLaObra] = useState(false);
  const [disponible, setDisponible] = useState(true);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    if (!API || !obra) return undefined;
    let vivo = true;
    apiFetch(`${API}/api/docs/grupos?model_urn=${encodeURIComponent(obra)}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok || !d.success) { setDisponible(false); setGrupos([]); return; }
        setDisponible(true);
        setGrupos(Array.isArray(d.grupos) ? d.grupos : []);
        setPuedeCrearDeLaObra(!!d.puede_crear_de_la_obra);
      })
      .catch(() => { if (vivo) { setDisponible(false); setGrupos([]); } });
    return () => { vivo = false; };
  }, [API, obra, vuelta]);

  const recargar = useCallback(() => setVuelta(n => n + 1), []);

  const llamar = useCallback(async (url, metodo, cuerpo) => {
    try {
      const r = await apiFetch(url, { method: metodo, ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) return { ok: false, error: d.error || 'No se pudo completar.' };
      return { ok: true, ...d };
    } catch {
      return { ok: false, error: 'No se pudo conectar con el servidor.' };
    }
  }, []);

  const crear = useCallback(async (nombre, deLaObra) => {
    const r = await llamar(`${API}/api/docs/grupos`, 'POST', { model_urn: obra, nombre, de_la_obra: !!deLaObra });
    if (r.ok) recargar();
    return r;
  }, [API, obra, llamar, recargar]);

  const borrar = useCallback(async (gid) => {
    const r = await llamar(`${API}/api/docs/grupos/${gid}`, 'DELETE');
    if (r.ok) recargar();
    return r;
  }, [API, llamar, recargar]);

  const anadir = useCallback(async (gid, nodeId, fijar = false) => {
    const r = await llamar(`${API}/api/docs/grupos/${gid}/documentos`, 'POST', { node_id: nodeId, fijar });
    if (r.ok) recargar();
    return r;
  }, [API, llamar, recargar]);

  const quitar = useCallback(async (gid, nodeId) => {
    const r = await llamar(`${API}/api/docs/grupos/${gid}/documentos/${nodeId}`, 'DELETE');
    if (r.ok) recargar();
    return r;
  }, [API, llamar, recargar]);

  const fijar = useCallback((gid, nodeId, fijo) =>
    llamar(`${API}/api/docs/grupos/${gid}/documentos/${nodeId}`, 'PATCH', { fijar: !!fijo }), [API, llamar]);

  const documentos = useCallback((gid) => llamar(`${API}/api/docs/grupos/${gid}/documentos`, 'GET'), [API, llamar]);

  return { grupos, disponible, puedeCrearDeLaObra, recargar, crear, borrar, anadir, quitar, fijar, documentos };
}
