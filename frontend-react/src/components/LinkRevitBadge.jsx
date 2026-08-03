// LinkRevitBadge — icono de vínculo Web ↔ Revit (esquina inferior derecha).
//
// Al activarlo, lo que hagas en el visor (seleccionar / aislar) se publica al
// canal del frente (/api/link/cmd) y el plugin "ECD Link" instalado en el Revit
// del modelador lo aplica en ~1 s. El punto verde indica que hay un Revit vivo
// (heartbeat < 10 s). Los externalIds del visor SON los UniqueId de Revit, así
// que no hay tablas de mapeo: identidad directa.
import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/apiFetch';

const norm = (u) => String(u || '').replace(/^urn:/i, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// dbIds → externalIds (UniqueId de Revit) vía propiedades del modelo.
const toExternalIds = (model, dbIds) => new Promise((resolve) => {
  if (!model || !dbIds?.length) return resolve([]);
  try {
    model.getBulkProperties(dbIds, { propFilter: ['externalId'] }, (results) => {
      resolve((results || []).map(r => r.externalId).filter(Boolean));
    }, () => resolve([]));
  } catch { resolve([]); }
});

export default function LinkRevitBadge({ project, backendUrl, variant = 'floating' }) {
  const [active, setActive] = useState(false);
  const [revitOnline, setRevitOnline] = useState(false);
  const activeRef = useRef(false);
  const debounceRef = useRef(null);
  // Anti-eco: mientras aplicamos lo que vino de Revit, NO republicar hacia Revit.
  const suppressRef = useRef(false);
  const reverseVersionRef = useRef(0);
  // Última selección que publicamos hacia Revit: si vuelve idéntica por el canal
  // inverso, es nuestro propio eco → no re-aislar/re-encuadrar.
  const lastForwardKeyRef = useRef('');

  // El vínculo muere al cambiar de frente (aislamiento entre frentes).
  useEffect(() => { setActive(false); }, [project]);
  useEffect(() => { activeRef.current = active; }, [active]);

  // Heartbeat: ¿hay un Revit escuchando este frente?
  useEffect(() => {
    if (!active || !project) { setRevitOnline(false); return undefined; }
    let stop = false;
    const check = async () => {
      try {
        const r = await apiFetch(`${backendUrl}/api/link/status?project=${encodeURIComponent(project)}`);
        const d = await r.json();
        if (!stop) setRevitOnline(!!d.revit_connected);
      } catch { if (!stop) setRevitOnline(false); }
    };
    check();
    const id = setInterval(check, 3000);
    return () => { stop = true; clearInterval(id); };
  }, [active, project, backendUrl]);

  // Selección INVERSA Revit → web: sondear lo que Revit seleccionó y aislarlo aquí.
  useEffect(() => {
    if (!active || !project) return undefined;
    const viewer = window.__mainViewer || window.NOP_VIEWER;
    if (!viewer) return undefined;
    let stop = false;

    const getModels = () => (viewer.getAllModels ? viewer.getAllModels() : (viewer.model ? [viewer.model] : []));
    const externalToDbIds = (model, externalIds) => new Promise((resolve) => {
      try {
        model.getExternalIdMapping((map) => {
          const out = [];
          for (const eid of externalIds) { const db = map[eid]; if (db != null) out.push(db); }
          resolve(out);
        }, () => resolve([]));
      } catch { resolve([]); }
    });

    const applyReverse = async (externalIds) => {
      const models = getModels();
      if (!models.length) return;
      suppressRef.current = true;
      try {
        if (!externalIds.length) { try { viewer.showAll(); } catch { /* */ } return; }
        const byModel = new Map();
        let total = 0;
        for (const m of models) {
          const ids = await externalToDbIds(m, externalIds);
          if (ids.length) { byModel.set(m, ids); total += ids.length; }
        }
        if (!total) return; // los elementos no están en los modelos cargados de este frente
        models.forEach(m => {
          const ids = byModel.get(m);
          if (ids && ids.length) viewer.isolate(ids, m);
          else { try { viewer.hide(m); } catch { /* */ } }
        });
        const first = [...byModel.entries()][0];
        if (first) { try { viewer.fitToView(first[1], first[0]); } catch { /* */ } }
      } finally {
        setTimeout(() => { suppressRef.current = false; }, 500);
      }
    };

    const poll = async () => {
      try {
        const r = await apiFetch(`${backendUrl}/api/link/report?project=${encodeURIComponent(project)}&kind=selection&since_version=${reverseVersionRef.current}`);
        const d = await r.json();
        if (stop || !d.changed || !d.payload) return;
        reverseVersionRef.current = d.version;
        const incoming = d.payload.externalIds || [];
        if (incoming.slice().sort().join(',') === lastForwardKeyRef.current) return; // eco de nuestra propia acción
        await applyReverse(incoming);
      } catch { /* red intermitente */ }
    };
    reverseVersionRef.current = 0; // al re-vincular, aceptar el estado actual de Revit
    const id = setInterval(poll, 1200);
    return () => { stop = true; clearInterval(id); };
  }, [active, project, backendUrl]);

  // Escuchar selección/aislamiento del visor y publicar al canal.
  useEffect(() => {
    if (!active || !project) return undefined;
    // __mainViewer = el 3D principal (NOP_VIEWER puede apuntar al visor de láminas)
    const viewer = window.__mainViewer || window.NOP_VIEWER;
    const Av = window.Autodesk?.Viewing;
    if (!viewer || !Av) return undefined;

    const publish = async (action, aggregate) => {
      // Debounce: un drag de selección dispara varios eventos seguidos.
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        if (!activeRef.current) return;
        if (suppressRef.current) return; // lo provocó la selección inversa de Revit
        let externalIds = [];
        for (const entry of (aggregate || [])) {
          // El evento agregado de LMV entrega los ids como dbIdArray (la API
          // getAggregateSelection usa .selection) — aceptar ambas formas.
          const dbIds = entry.dbIdArray || entry.selection || entry.ids || [];
          const ids = await toExternalIds(entry.model, dbIds);
          externalIds = externalIds.concat(ids);
        }
        const finalAction = externalIds.length ? action : 'clear';
        lastForwardKeyRef.current = externalIds.slice().sort().join(','); // para descartar el eco
        try {
          await apiFetch(`${backendUrl}/api/link/cmd`, {
            method: 'POST',
            body: JSON.stringify({ project, action: finalAction, externalIds, by: 'web' }),
          });
        } catch (e) { console.warn('[Link] No se pudo publicar comando:', e); }
      }, 250);
    };

    const onSelection = (ev) => publish('select', ev.selections || []);

    // VISIBILIDAD EFECTIVA: no confiar solo en el evento de aislamiento — al
    // ocultar elementos DENTRO de un aislamiento, LMV emite aislamiento vacío
    // (y antes eso limpiaba Revit). Se recalcula el estado real cada vez:
    //   aislados − ocultos → 'isolate' · solo ocultos → 'hide' · nada → 'clear'
    const onVisibility = () => {
      const iso = (viewer.getAggregateIsolation?.() || []).map(e => ({ model: e.model, ids: e.ids || e.selection || [] }));
      const hidden = (viewer.getAggregateHiddenNodes?.() || []).map(e => ({ model: e.model, ids: e.ids || e.selection || [] }));

      if (iso.some(e => e.ids.length)) {
        const hiddenByModel = new Map(hidden.map(h => [h.model, new Set(h.ids)]));
        const agg = iso.map(e => ({
          model: e.model,
          selection: e.ids.filter(id => !(hiddenByModel.get(e.model)?.has(id))),
        }));
        publish('isolate', agg);
      } else if (hidden.some(e => e.ids.length)) {
        publish('hide', hidden.map(h => ({ model: h.model, selection: h.ids })));
      } else {
        publish('clear', []);
      }
    };

    // Colores del filtro → Revit: el visor emite los grupos ya pintados;
    // aquí se traducen dbIds→UniqueIds y se publican como 'colorize'.
    const onColors = async (ev) => {
      if (!activeRef.current) return;
      const groups = ev.detail?.groups || [];
      const payloadGroups = [];
      for (const g of groups) {
        let externalIds = [];
        for (const entry of (g.entries || [])) {
          externalIds = externalIds.concat(await toExternalIds(entry.model, entry.dbIds || []));
        }
        if (externalIds.length) payloadGroups.push({ color: g.color, externalIds });
      }
      try {
        await apiFetch(`${backendUrl}/api/link/cmd`, {
          method: 'POST',
          body: JSON.stringify({
            project,
            action: payloadGroups.length ? 'colorize' : 'clearcolors',
            groups: payloadGroups,
            by: 'web',
          }),
        });
      } catch (e) { console.warn('[Link] No se pudo publicar colores:', e); }
    };

    viewer.addEventListener(Av.AGGREGATE_SELECTION_CHANGED_EVENT, onSelection);
    viewer.addEventListener(Av.AGGREGATE_ISOLATION_CHANGED_EVENT, onVisibility);
    if (Av.AGGREGATE_HIDDEN_CHANGED_EVENT) viewer.addEventListener(Av.AGGREGATE_HIDDEN_CHANGED_EVENT, onVisibility);
    if (Av.HIDE_EVENT) viewer.addEventListener(Av.HIDE_EVENT, onVisibility);
    if (Av.SHOW_EVENT) viewer.addEventListener(Av.SHOW_EVENT, onVisibility);
    window.addEventListener('viewer-colors-applied', onColors);
    return () => {
      clearTimeout(debounceRef.current);
      window.removeEventListener('viewer-colors-applied', onColors);
      try {
        viewer.removeEventListener(Av.AGGREGATE_SELECTION_CHANGED_EVENT, onSelection);
        viewer.removeEventListener(Av.AGGREGATE_ISOLATION_CHANGED_EVENT, onVisibility);
        if (Av.AGGREGATE_HIDDEN_CHANGED_EVENT) viewer.removeEventListener(Av.AGGREGATE_HIDDEN_CHANGED_EVENT, onVisibility);
        if (Av.HIDE_EVENT) viewer.removeEventListener(Av.HIDE_EVENT, onVisibility);
        if (Av.SHOW_EVENT) viewer.removeEventListener(Av.SHOW_EVENT, onVisibility);
      } catch { /* visor desmontado */ }
    };
  }, [active, project, backendUrl]);

  if (!project) return null;

  const bg = !active ? 'rgba(40,44,52,0.92)' : revitOnline ? '#166534' : '#1d4ed8';
  const title = !active
    ? 'Vincular con Revit: lo que selecciones/aísles aquí se replicará en el Revit conectado'
    : revitOnline ? 'Vinculado — Revit conectado y escuchando' : 'Vínculo activo — esperando a Revit (abre el plugin ECD Link)';

  // Estilo según dónde vive: chip integrado a la barra inferior, o botón flotante.
  const style = variant === 'inline'
    ? {
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', height: 26,
        background: !active ? 'transparent' : bg,
        color: !active ? '#d8d8d8' : '#fff',
        border: `1px solid ${!active ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.25)'}`,
        borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
      }
    : {
        position: 'fixed', right: 18, bottom: 118, zIndex: 1200,
        display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px',
        background: bg, color: '#fff', border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: 22, fontSize: 12, fontWeight: 700, cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      };

  return (
    <button
      onClick={() => setActive(a => !a)}
      title={title}
      style={style}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      {active ? (revitOnline ? 'Revit ✓' : 'Esperando Revit…') : 'Revit'}
      {active && (
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: revitOnline ? '#4ade80' : '#fbbf24',
          animation: revitOnline ? 'none' : 'pulse 1.2s ease-in-out infinite',
        }} />
      )}
    </button>
  );
}
