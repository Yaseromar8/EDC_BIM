import { useEffect } from 'react';
import { apiFetch } from '../utils/apiFetch';
import {
  CANAL_ORTHO_TILE_NAMES, findPublishedSurface, mountCanalOrthoTrial,
} from '../native/orthoCanalTrial';

async function fetchTile(backendUrl, path, scope, name, signal) {
  const prefix = `/api/orthophoto/${encodeURIComponent(scope)}/tiles/`;
  if (typeof path !== 'string' || !path.startsWith(prefix)) {
    throw new Error('Ruta del mosaico publicado no válida.');
  }
  const response = await apiFetch(new URL(path, backendUrl).toString(), { signal });
  if (!response.ok) throw new Error(`No se pudo leer el mosaico: HTTP ${response.status}`);
  if (!/^image\/jpeg\b/i.test(response.headers.get('Content-Type') || '')) {
    throw new Error('El almacén no devolvió un JPG para la ortofoto.');
  }
  const blob = await response.blob();
  return new File([blob], name, { type: 'image/jpeg' });
}

/** La capa publicada vive fuera del panel Topografía y se monta para todo miembro. */
export default function OrthoCanalLayer({ scope, backendUrl,
  findSurface = findPublishedSurface, mountLayer = mountCanalOrthoTrial }) {
  useEffect(() => {
    if (!scope) return undefined;
    let alive = true;
    let sequence = 0;
    let requestSequence = 0;
    let manifestController = null;
    let visualController = null;
    let manifest = null;
    let files = null;
    let overlay = null;
    let overlayModel = null;
    let mounting = false;

    const dispose = () => {
      overlay?.dispose();
      overlay = null;
      overlayModel = null;
    };
    const announce = (data) => window.dispatchEvent(new CustomEvent('orthophoto-status', {
      detail: { scope, ...data },
    }));

    const mount = async () => {
      if (!alive || !manifest?.active || !files || mounting) return;
      const viewer = window.__mainViewer || window.NOP_VIEWER;
      const surface = findSurface(viewer, manifest);
      if (overlay && overlayModel === surface?.model) return;
      dispose();
      if (!surface) return; // El modelo aún puede estar cargando.
      mounting = true;
      const at = sequence;
      try {
        const mounted = await mountLayer(viewer, files, {
          surface, allModelFragments: true, clearSelection: false,
          signal: visualController?.signal,
          reliefBlend: manifest.relief_blend,
          directionalShade: manifest.directional_shade,
        });
        if (!alive || at !== sequence) mounted.dispose();
        else { overlay = mounted; overlayModel = surface.model; }
      } catch (error) {
        if (alive && at === sequence && !visualController?.signal.aborted) {
          announce({ active: true, revision: manifest.revision,
            error: error?.message || 'No se pudo aplicar la ortofoto.' });
          if (surface.model.isLoadDone?.()) files = null; // Error definitivo: no repetir cada 1,5 s.
        }
      } finally {
        mounting = false;
      }
    };

    const refresh = async () => {
      requestSequence += 1;
      const requestAt = requestSequence;
      manifestController?.abort();
      const requestController = new AbortController();
      manifestController = requestController;
      try {
        const response = await apiFetch(`${backendUrl}/api/orthophoto/${encodeURIComponent(scope)}`,
          { signal: requestController.signal });
        if (!response.ok) throw new Error(`No se pudo consultar la ortofoto: HTTP ${response.status}`);
        const data = await response.json();
        if (!alive || requestAt !== requestSequence) return;
        const unchanged = manifest?.revision === data.revision && manifest?.active === data.active;
        if (unchanged && (!data.active || files || mounting)) return;
        if (!unchanged) sequence += 1;
        const visualAt = sequence;
        if (!unchanged) dispose();
        visualController?.abort();
        visualController = new AbortController();
        manifest = data;
        files = null;
        if (!unchanged) announce({ active: !!data.active, revision: data.revision,
          publishedAt: data.published_at || null });
        if (!data.active) return;
        const nextFiles = await Promise.all([
          fetchTile(backendUrl, data.north_path, scope,
            CANAL_ORTHO_TILE_NAMES.north, visualController.signal),
          fetchTile(backendUrl, data.south_path, scope,
            CANAL_ORTHO_TILE_NAMES.south, visualController.signal),
        ]);
        if (!alive || visualAt !== sequence) return;
        files = nextFiles;
        mount();
      } catch (error) {
        if (alive && requestAt === requestSequence
            && !requestController.signal.aborted && !visualController?.signal.aborted) {
          announce({ active: !!manifest?.active, revision: manifest?.revision,
            error: error?.message || 'No se pudo consultar la ortofoto.' });
        }
      }
    };

    const onChanged = (event) => { if (event.detail?.scope === scope) refresh(); };
    const onReset = () => {
      sequence += 1;
      requestSequence += 1;
      manifestController?.abort();
      visualController?.abort();
      manifest = null;
      files = null;
      dispose();
    };
    window.addEventListener('orthophoto-changed', onChanged);
    window.addEventListener('viewer-geometry-loaded', mount);
    window.addEventListener('ecd-frente-reset', onReset);
    const timer = setInterval(mount, 1500);
    const refreshTimer = setInterval(refresh, 60000);
    refresh();
    return () => {
      alive = false;
      sequence += 1;
      requestSequence += 1;
      manifestController?.abort();
      visualController?.abort();
      clearInterval(timer);
      clearInterval(refreshTimer);
      window.removeEventListener('orthophoto-changed', onChanged);
      window.removeEventListener('viewer-geometry-loaded', mount);
      window.removeEventListener('ecd-frente-reset', onReset);
      dispose();
    };
  }, [scope, backendUrl, findSurface, mountLayer]);

  return null;
}
