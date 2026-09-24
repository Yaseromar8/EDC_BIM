// Banco visual local: prueba revisión, cancelación y ciclo de vida sin GCS/DB.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import OrthoCanalLayer from './components/OrthoCanalLayer';

const state = { revision: null, active: false, holdA: false, pendingA: [], mounts: [], disposals: [] };
const model = { getData: () => ({ urn: 'urn:terrain' }) };
window.__mainViewer = { impl: {}, getAllModels: () => [model] };

const originalFetch = window.fetch.bind(window);
window.fetch = (resource, options = {}) => {
  const url = new URL(String(resource), location.origin);
  if (!url.pathname.startsWith('/api/orthophoto/')) return originalFetch(resource, options);
  const parts = url.pathname.split('/');
  const scope = parts[3];
  if (scope !== '1_CANAL') {
    return Promise.resolve(Response.json({ active: false, revision: null }));
  }
  if (parts[4] === 'tiles') {
    const revision = parts[5];
    const reply = () => new Response(new Blob([revision], { type: 'image/jpeg' }),
      { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
    if (revision === 'a' && state.holdA) {
      return new Promise((resolve, reject) => {
        const pending = () => resolve(reply());
        state.pendingA.push(pending);
        options.signal?.addEventListener('abort', () => reject(new DOMException('cancelado', 'AbortError')),
          { once: true });
      });
    }
    return Promise.resolve(reply());
  }
  const revision = state.revision;
  return Promise.resolve(Response.json(state.active ? {
    active: true, revision, model_urn: 'urn:terrain', db_id: 42,
    relief_blend: 0.4, directional_shade: 0.7,
    north_path: `/api/orthophoto/1_CANAL/tiles/${revision}/north`,
    south_path: `/api/orthophoto/1_CANAL/tiles/${revision}/south`,
  } : { active: false, revision }));
};

const findSurface = (_viewer, manifest) => manifest.model_urn === 'urn:terrain'
  ? { model, dbId: 42 } : null;

async function mountLayer(_viewer, files, options) {
  const revision = await files[0].text();
  if (options.signal?.aborted) throw new DOMException('cancelado', 'AbortError');
  if (files.length !== 2 || options.surface.model !== model || options.surface.dbId !== 42
      || options.clearSelection !== false) throw new Error('Identidad o archivos alterados');
  state.mounts.push(revision);
  window.dispatchEvent(new Event('ortho-fixture-update'));
  return { dispose() {
    state.disposals.push(revision);
    window.dispatchEvent(new Event('ortho-fixture-update'));
  } };
}

export function Banco() {
  const [scope, setScope] = useState('1_CANAL');
  const [visible, setVisible] = useState(true);
  const [tick, setTick] = useState(0);
  const [status, setStatus] = useState('sin consulta');
  useEffect(() => {
    const update = () => setTick((value) => value + 1);
    const onStatus = (event) => setStatus(JSON.stringify(event.detail));
    window.addEventListener('ortho-fixture-update', update);
    window.addEventListener('orthophoto-status', onStatus);
    return () => {
      window.removeEventListener('ortho-fixture-update', update);
      window.removeEventListener('orthophoto-status', onStatus);
    };
  }, []);
  const change = (revision, active) => {
    state.revision = revision;
    state.active = active;
    window.dispatchEvent(new CustomEvent('orthophoto-changed', { detail: { scope: '1_CANAL' } }));
    setTick((value) => value + 1);
  };
  return <main style={{ fontFamily: 'sans-serif', maxWidth: 720, margin: '2rem auto' }}>
    <h1>Ortofoto compartida · banco aislado</h1>
    <p>No llama a GCS ni PostgreSQL. Los mosaicos son respuestas falsas de un byte.</p>
    <button onClick={() => { state.holdA = true; setTick((value) => value + 1); }}>Retener A</button>{' '}
    <button onClick={() => change('a', true)}>Activar A</button>{' '}
    <button onClick={() => change('b', true)}>Reemplazar por B</button>{' '}
    <button onClick={() => { state.pendingA.splice(0).forEach((release) => release());
      state.holdA = false; setTick((value) => value + 1); }}>Liberar A</button>{' '}
    <button onClick={() => change('c', false)}>Retirar</button>{' '}
    <button onClick={() => setVisible((value) => !value)}>Cerrar/reabrir</button>{' '}
    <button onClick={() => setScope((value) => value === '1_CANAL' ? 'OTRO' : '1_CANAL')}>
      Cambiar scope</button>
    <p>Scope: <output>{scope}</output> · visible: <output>{String(visible)}</output>
      · retenida A: <output>{String(state.holdA)}</output> · tick {tick}</p>
    <p>Estado: <output aria-label="Estado publicado">{status}</output></p>
    <p>Montajes: <output aria-label="Montajes">{state.mounts.join(',') || 'ninguno'}</output></p>
    <p>Retiradas: <output aria-label="Retiradas">{state.disposals.join(',') || 'ninguna'}</output></p>
    {visible && <OrthoCanalLayer scope={scope} backendUrl={location.origin}
      findSurface={findSurface} mountLayer={mountLayer} />}
  </main>;
}

createRoot(document.getElementById('root')).render(<Banco />);
