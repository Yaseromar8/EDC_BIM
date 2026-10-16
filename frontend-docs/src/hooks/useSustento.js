import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiFetch';

/**
 * useSustento — los vínculos de sustento de metrados (GET/POST/DELETE /api/docs/sustento).
 *
 * `ambito`: 'documento' (lo que sale de ESTE plano) u 'obra' (todo lo de la obra, para una planilla).
 * Si el servidor aún no tiene la ruta o la tabla (migración 34 sin aplicar), `disponible` queda en
 * false y quien lo usa no enseña nada: el lector sigue funcionando igual.
 */
export function useSustento(API, nodeId, ambito = 'documento') {
  const [vinculos, setVinculos] = useState([]);
  const [disponible, setDisponible] = useState(true);
  const [vuelta, setVuelta] = useState(0);
  // Para qué documento respondió ya el servidor: quien decide algo con los vínculos espera a `listo`.
  const [respondidoPara, setRespondidoPara] = useState(null);

  useEffect(() => {
    if (!API || !nodeId) return undefined;
    let vivo = true;
    apiFetch(`${API}/api/docs/sustento?node_id=${encodeURIComponent(nodeId)}&ambito=${ambito}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!vivo) return;
        setRespondidoPara(nodeId);
        if (!r.ok || !d.success) { setDisponible(false); setVinculos([]); return; }
        setDisponible(true);
        setVinculos(Array.isArray(d.vinculos) ? d.vinculos : []);
      })
      .catch(() => { if (vivo) { setRespondidoPara(nodeId); setDisponible(false); setVinculos([]); } });
    return () => { vivo = false; };
  }, [API, nodeId, ambito, vuelta]);

  const recargar = useCallback(() => setVuelta(n => n + 1), []);

  // El circuito planilla ↔ plano va en DOS pestañas: al volver a esta, lo guardado en la otra ya cuenta.
  useEffect(() => {
    if (!API || !nodeId) return undefined;
    const alVolver = () => { if (document.visibilityState === 'visible') setVuelta(n => n + 1); };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [API, nodeId]);

  /** Devuelve { ok, error }. */
  const crear = useCallback(async (cuerpo) => {
    try {
      const r = await apiFetch(`${API}/api/docs/sustento`, { method: 'POST', body: JSON.stringify(cuerpo) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) return { ok: false, error: d.error || 'No se pudo guardar el vínculo.' };
      recargar();
      return { ok: true };
    } catch {
      return { ok: false, error: 'No se pudo conectar con el servidor.' };
    }
  }, [API, recargar]);

  const retirar = useCallback(async (id) => {
    try {
      const r = await apiFetch(`${API}/api/docs/sustento/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) return { ok: false, error: d.error || 'No se pudo retirar el vínculo.' };
      recargar();
      return { ok: true };
    } catch {
      return { ok: false, error: 'No se pudo conectar con el servidor.' };
    }
  }, [API, recargar]);

  return { vinculos, disponible, listo: !nodeId || respondidoPara === nodeId, recargar, crear, retirar };
}
