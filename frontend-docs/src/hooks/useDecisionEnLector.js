/**
 * useDecisionEnLector — ¿hay una revisión en la que ESTA persona deba decidir
 * sobre el documento que tiene abierto? Solo lee, con rutas que ya existen:
 *
 *   /api/mi-trabajo?project_id=<obra>   lo que espera por la persona
 *   /api/reviews/<id>?model_urn=<obra>  sus documentos y `acciones` (el servidor
 *                                       decide quién puede, como en Revisiones)
 *   /api/docs/idoneidad?model_urn=      el catálogo, solo si hay revisión
 *
 * Sin pendientes de revisión, abrir un plano cuesta UNA petición más.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { revisionesPendientes, revisionParaDecidir } from '../utils/decisionEnLector';

async function leer(url) {
  const r = await apiFetch(url, { retries: 0 });
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

export default function useDecisionEnLector({ API, projectPrefix, nodeId, activo = true }) {
  const [estado, setEstado] = useState({ rev: null, catalogo: [], para: null });
  const [vuelta, setVuelta] = useState(0);
  const peticion = useRef(0);

  useEffect(() => {
    if (!activo || !nodeId || !projectPrefix) return undefined;
    const n = ++peticion.current;
    let vivo = true;
    (async () => {
      const mt = await leer(`${API}/api/mi-trabajo?project_id=${encodeURIComponent(projectPrefix)}`);
      const ids = revisionesPendientes(mt);
      const revisiones = (await Promise.all(ids.map(id =>
        leer(`${API}/api/reviews/${id}?model_urn=${encodeURIComponent(projectPrefix)}`)
          .then(d => (d && d.success ? d.revision : null))
          .catch(() => null)))).filter(Boolean);
      const rev = revisionParaDecidir(revisiones, nodeId);
      let catalogo = [];
      if (rev) {
        const c = await leer(`${API}/api/docs/idoneidad?model_urn=${encodeURIComponent(projectPrefix)}`).catch(() => null);
        catalogo = (c && c.success && c.codigos) || [];
      }
      if (vivo && n === peticion.current) setEstado({ rev, catalogo, para: nodeId });
    })().catch(() => {
      if (vivo && n === peticion.current) setEstado({ rev: null, catalogo: [], para: nodeId });
    });
    return () => { vivo = false; };
  }, [API, projectPrefix, nodeId, activo, vuelta]);

  const recargar = useCallback(() => setVuelta(v => v + 1), []);
  // Lo de otro documento no se enseña mientras llega lo de este.
  const vigente = activo && estado.para === nodeId;
  return { rev: vigente ? estado.rev : null, catalogo: vigente ? estado.catalogo : [], recargar };
}
