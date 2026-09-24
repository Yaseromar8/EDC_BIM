import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/apiFetch';
import {
  CANAL_ORTHO_TILE_NAMES, DEFAULT_HILLSHADE_STRENGTH, DEFAULT_RELIEF_BLEND,
  mountCanalOrthoTrial, selectedSurface,
} from '../native/orthoCanalTrial';

// El panel puede cerrarse sin retirar la capa. La sesión local sólo vive en esta
// página y se limpia al cambiar de frente, quitar la capa o recargar.
const trial = {
  overlay: null, pending: null, revision: 0, listeners: new Set(), registered: false,
  busy: false, active: false,
  reliefPercent: DEFAULT_RELIEF_BLEND * 100,
  shadePercent: DEFAULT_HILLSHADE_STRENGTH * 100,
  mode: null,
  uploadFiles: { north: null, south: null }, surface: null,
  message: 'Prepara dos JPG, selecciona la superficie y comprueba la vista antes de publicar.',
};

function publish() {
  const snapshot = {
    busy: trial.busy, active: trial.active, message: trial.message,
    reliefPercent: trial.reliefPercent,
    shadePercent: trial.shadePercent, mode: trial.mode,
  };
  trial.listeners.forEach((listener) => listener(snapshot));
}

function removeOverlay(message = 'Capa retirada; el modelo original no cambió.') {
  trial.revision += 1;
  trial.pending?.abort();
  trial.pending = null;
  trial.overlay?.dispose();
  trial.overlay = null;
  trial.busy = false;
  trial.active = false;
  trial.mode = null;
  trial.message = message;
  publish();
}

function onFrontReset() {
  trial.uploadFiles = { north: null, south: null };
  trial.surface = null;
  removeOverlay('Cambió el frente: la capa local se retiró.');
}

function ensureResetListener() {
  if (trial.registered) return;
  window.addEventListener('ecd-frente-reset', onFrontReset);
  trial.registered = true;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    removeOverlay('Ensayo actualizado: vuelve a elegir los mosaicos.');
    if (trial.registered) window.removeEventListener('ecd-frente-reset', onFrontReset);
  });
}

async function apply() {
  const { north, south } = trial.uploadFiles;
  if (!north || !south) {
    trial.message = 'Elige los dos JPG, uno para Norte y otro para Sur.';
    publish();
    return;
  }
  const viewer = window.__mainViewer || window.NOP_VIEWER;
  let surface;
  try {
    surface = selectedSurface(viewer);
    if (!surface.model?.getData?.()?.urn) throw new Error('El modelo seleccionado no tiene URN.');
  } catch (error) {
    trial.message = error.message;
    publish();
    return;
  }
  const files = [
    new File([north], CANAL_ORTHO_TILE_NAMES.north, { type: 'image/jpeg' }),
    new File([south], CANAL_ORTHO_TILE_NAMES.south, { type: 'image/jpeg' }),
  ];
  removeOverlay('Preparando mosaico local…');
  const revision = trial.revision;
  const controller = new AbortController();
  trial.pending = controller;
  trial.busy = true;
  publish();
  try {
    const result = await mountCanalOrthoTrial(viewer, files,
      {
        signal: controller.signal, allModelFragments: true,
        surface,
        reliefBlend: trial.reliefPercent / 100,
        directionalShade: trial.shadePercent / 100,
      });
    if (controller.signal.aborted || trial.revision !== revision) {
      result.dispose();
      return;
    }
    result.setReliefBlend(trial.reliefPercent / 100);
    result.setHillshadeStrength(trial.shadePercent / 100);
    trial.overlay = result;
    trial.surface = { modelUrn: surface.model.getData().urn, dbId: surface.dbId };
    trial.active = true;
    trial.mode = result.mode;
    trial.message = `Capa local: ${result.mode === 'projection'
      ? 'proyección sin clonar triángulos; '
      : `${result.included.toLocaleString()} de ${result.inspected.toLocaleString()} triángulos; `}`
      + `${result.coveredFragments}/${result.fragments} fragmentos ${result.mode === 'projection'
        ? 'con huella intersectada' : 'cubiertos'}; `
      + `${result.tiles} imagen(es) de ${result.width}×${result.height}. `
      + 'Vista previa local: aún no se publicó para los demás.';
  } catch (error) {
    if (!controller.signal.aborted && trial.revision === revision) {
      trial.message = error?.message || 'No se pudo aplicar la ortofoto.';
    }
  } finally {
    if (trial.pending === controller) trial.pending = null;
    if (trial.revision === revision) { trial.busy = false; publish(); }
  }
}

export default function OrthoCanalTrial({ scope, backendUrl, canPublish = false }) {
  const northRef = useRef(null);
  const southRef = useRef(null);
  const [fileNames, setFileNames] = useState(() => ({
    north: trial.uploadFiles.north?.name || '', south: trial.uploadFiles.south?.name || '',
  }));
  const [published, setPublished] = useState(null);
  const [remoteError, setRemoteError] = useState('');
  const [snapshot, setSnapshot] = useState(() => ({
    busy: trial.busy, active: trial.active, message: trial.message,
    reliefPercent: trial.reliefPercent,
    shadePercent: trial.shadePercent, mode: trial.mode,
  }));

  useEffect(() => {
    ensureResetListener();
    trial.listeners.add(setSnapshot);
    setSnapshot({
      busy: trial.busy, active: trial.active, message: trial.message,
      reliefPercent: trial.reliefPercent,
      shadePercent: trial.shadePercent, mode: trial.mode,
    });
    return () => trial.listeners.delete(setSnapshot);
  }, []);

  useEffect(() => {
    let alive = true;
    apiFetch(`${backendUrl}/api/orthophoto/${encodeURIComponent(scope)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => { if (alive) { setPublished(data); setRemoteError(''); } })
      .catch((error) => { if (alive) setRemoteError(`No se pudo consultar la capa publicada: ${error.message}`); });
    const onStatus = (event) => {
      if (alive && event.detail?.scope === scope) {
        if (event.detail.error) setRemoteError(event.detail.error);
        else { setRemoteError(''); setPublished({
          active: event.detail.active, revision: event.detail.revision,
          published_at: event.detail.publishedAt,
        }); }
      }
    };
    window.addEventListener('orthophoto-status', onStatus);
    return () => { alive = false; window.removeEventListener('orthophoto-status', onStatus); };
  }, [scope, backendUrl]);

  const pick = (part, event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    trial.uploadFiles[part] = file;
    setFileNames({ north: trial.uploadFiles.north?.name || '',
      south: trial.uploadFiles.south?.name || '' });
    removeOverlay('Archivos cambiados: vuelve a comprobar la vista previa.');
  };

  const publishForAll = async () => {
    if (!trial.surface || !trial.uploadFiles.north || !trial.uploadFiles.south) return;
    trial.busy = true; publish();
    try {
      const form = new FormData();
      form.append('north', trial.uploadFiles.north);
      form.append('south', trial.uploadFiles.south);
      form.append('model_urn', trial.surface.modelUrn);
      form.append('db_id', String(trial.surface.dbId));
      form.append('relief_blend', String(trial.reliefPercent / 100));
      form.append('directional_shade', String(trial.shadePercent / 100));
      form.append('expected_revision', published?.revision || '');
      const response = await apiFetch(`${backendUrl}/api/orthophoto/${encodeURIComponent(scope)}/publish`,
        { method: 'POST', body: form, isUpload: true, timeoutMs: 300000 });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setPublished(data);
      setRemoteError('');
      removeOverlay('Publicada para los usuarios del frente. La vista previa local se retiró.');
      window.dispatchEvent(new CustomEvent('orthophoto-changed', { detail: { scope } }));
    } catch (error) {
      trial.message = `No se publicó: ${error.message}. La capa anterior sigue activa.`;
      trial.busy = false; publish();
    }
  };

  const removeForAll = async () => {
    if (!published?.active || !window.confirm('¿Retirar la ortofoto para todos? Los JPG se conservan.')) return;
    trial.busy = true; publish();
    try {
      const response = await apiFetch(`${backendUrl}/api/orthophoto/${encodeURIComponent(scope)}/deactivate`, {
        method: 'POST', body: JSON.stringify({ expected_revision: published.revision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setPublished(data);
      removeOverlay('Ortofoto retirada para los usuarios del frente.');
      window.dispatchEvent(new CustomEvent('orthophoto-changed', { detail: { scope } }));
    } catch (error) {
      trial.message = `No se retiró: ${error.message}. La capa sigue activa.`;
      trial.busy = false; publish();
    }
  };

  return (
    <div style={{ marginTop: 16, padding: 12, border: '1px solid #56708b', borderRadius: 8 }}>
      <strong>Ortofoto · Frente Canal</strong>
      <p style={{ margin: '6px 0', lineHeight: 1.45 }}>
        {published?.active
          ? `Visible para los usuarios del frente desde ${new Date(published.published_at).toLocaleString()}. `
          : published ? 'No hay una ortofoto publicada. ' : 'Estado de publicación aún no confirmado. '}
        Permanece visible hasta retirarla o reemplazarla; no caduca a los 7 días.
      </p>
      {remoteError && <p role="alert">{remoteError}</p>}
      {canPublish && <>
      <p style={{ margin: '6px 0', lineHeight: 1.45 }}>
        Para actualizarla, prepara los dos JPG con la misma huella de esta superficie
        (4000×5961 cada uno). Selecciona el terreno de PASTEADO_GENERAL.shared.dwg,
        elige Norte y Sur, comprueba la alineación y luego publica. El JPG no guarda
        coordenadas; el ECW no se sube.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <button type="button" onClick={() => northRef.current?.click()}>Norte: {fileNames.north || 'elegir JPG'}</button>
        <button type="button" onClick={() => southRef.current?.click()}>Sur: {fileNames.south || 'elegir JPG'}</button>
      </div>
      <input ref={northRef} type="file" accept="image/jpeg,.jpg,.jpeg" style={{ display: 'none' }}
        onChange={(event) => pick('north', event)} />
      <input ref={southRef} type="file" accept="image/jpeg,.jpg,.jpeg" style={{ display: 'none' }}
        onChange={(event) => pick('south', event)} />
      <label style={{ display: 'block', marginBottom: 8 }}>
        Relieve visible: {snapshot.reliefPercent}%
        <input type="range" min="0" max="75" step="5" value={snapshot.reliefPercent}
          aria-label="Relieve visible bajo la ortofoto"
          style={{ display: 'block', width: '100%' }}
          onChange={(event) => {
            trial.reliefPercent = Number(event.target.value);
            trial.overlay?.setReliefBlend(trial.reliefPercent / 100);
            publish();
          }} />
      </label>
      <p style={{ margin: '0 0 8px', lineHeight: 1.4 }}>
        Mezcla la foto con el sombreado original del terreno.
      </p>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Sombreado de pendientes: {snapshot.shadePercent}%
        <input type="range" min="0" max="100" step="5" value={snapshot.shadePercent}
          aria-label="Sombreado direccional de pendientes"
          disabled={snapshot.mode === 'cpu'}
          style={{ display: 'block', width: '100%' }}
          onChange={(event) => {
            trial.shadePercent = Number(event.target.value);
            trial.overlay?.setHillshadeStrength(trial.shadePercent / 100);
            publish();
          }} />
      </label>
      <p style={{ margin: '0 0 8px', lineHeight: 1.4 }}>
        Acentúa las pendientes de la ortofoto según la malla; no simula sombras proyectadas.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={snapshot.busy}
          style={{ background: '#2872c7', color: '#fff', border: 0, borderRadius: 5, padding: '8px 10px' }}
          onClick={() => apply()}>
          {snapshot.busy ? 'Preparando…' : 'Previsualizar en este navegador'}
        </button>
        <button type="button" disabled={!snapshot.active && !snapshot.busy}
          onClick={() => removeOverlay()}>Quitar vista previa</button>
        <button type="button" disabled={!snapshot.active || snapshot.busy || !!remoteError}
          onClick={publishForAll}>Publicar para todos</button>
        <button type="button" disabled={!published?.active || snapshot.busy}
          onClick={removeForAll}>Retirar capa publicada</button>
      </div>
      <p role="status" style={{ margin: '8px 0 0', color: '#c9d9eb' }}>{snapshot.message}</p>
      </>}
    </div>
  );
}
