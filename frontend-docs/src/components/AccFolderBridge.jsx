import React, { useEffect, useRef, useState } from 'react';
import { apiJson } from '../utils/apiFetch';
import { accReadOnlyPath } from '../utils/accPreviewLocal';
import { guardarUbicacion, leerUbicacion, nivelDeUbicacion } from '../utils/ultimaUbicacionAcc';

const nameOf = entry => entry?.attributes?.displayName || entry?.attributes?.name || entry?.id || 'Sin nombre';

/** Solo administracion global. Configura la pareja de carpetas, nunca sube bytes. */
export default function AccFolderBridge({ API, folder, modelUrn, onClose, onSaved }) {
  const [config, setConfig] = useState(null);
  const [serviceEnabled, setServiceEnabled] = useState(false);
  const [hub, setHub] = useState(null);
  const [project, setProject] = useState(null);
  const [ancestors, setAncestors] = useState([]);
  const [selected, setSelected] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const params = new URLSearchParams({ local_folder_id: folder.id, model_urn: modelUrn });
  // Se recuerda dónde se está solo después de saber dónde empezar: si no, el estado vacío del primer dibujo borraría
  // la ubicación guardada.
  const recordar = useRef(false);

  // Devuelve si ACC respondió. `callar`: no enseñar el error (al probar la ubicación recordada).
  const load = async (level, ids = {}, callar = false) => {
    setLoading(true); setError(''); setEntries([]);
    try {
      const data = await apiJson(`${API}${accReadOnlyPath(level, ids)}`, { retries: 0 });
      setEntries((data?.data || []).filter(entry => level === 'contents'
        ? entry.type === 'folders' : true));
      return true;
    } catch (cause) { if (!callar) setError(cause.message); return false; }
    finally { setLoading(false); }
  };

  // EMPEZAR DONDE SE QUEDÓ LA ÚLTIMA VEZ en esta obra (5-nov-2026, el dueño). Si ya no se llega (sin acceso, carpeta
  // borrada en ACC), se empieza por los centros y se olvida.
  const empezar = async () => {
    const antes = leerUbicacion(modelUrn);
    if (antes) {
      setHub(antes.hub); setProject(antes.project); setAncestors(antes.ancestors);
      setSelected(antes.ancestors.at(-1) || null);
      const [nivel, ids] = nivelDeUbicacion(antes);
      if (await load(nivel, ids, true)) { recordar.current = true; return; }
      setHub(null); setProject(null); setAncestors([]); setSelected(null);
      guardarUbicacion(modelUrn, {});
    }
    recordar.current = true;
    load('hubs');
  };
  useEffect(() => {
    if (recordar.current) guardarUbicacion(modelUrn, { hub, project, ancestors });
  }, [modelUrn, hub, project, ancestors]);

  useEffect(() => {
    let alive = true;
    apiJson(`${API}/api/docs/cad/acc-bridge/folder?${params}`, { retries: 0 })
      .then(data => { if (alive) { setConfig(data.bridge || null); setServiceEnabled(data.service_enabled === true); } })
      .catch(cause => { if (alive) setError(cause.message); });
    empezar();
    return () => { alive = false; };
  }, [API, folder.id, modelUrn]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = entry => {
    if (!hub) {
      setHub(entry); setProject(null); setAncestors([]); setSelected(null);
      load('projects', { hub_id: entry.id });
    } else if (!project) {
      setProject(entry); setAncestors([]); setSelected(null);
      load('topFolders', { hub_id: hub.id, project_id: entry.id });
    } else {
      setSelected(entry);
      setAncestors(old => [...old, entry]);
      load('contents', { project_id: project.id, folder_id: entry.id });
    }
  };
  const back = () => {
    if (ancestors.length) {
      const previous = ancestors.slice(0, -1);
      setAncestors(previous); setSelected(previous.at(-1) || null);
      if (previous.length) load('contents', { project_id: project.id, folder_id: previous.at(-1).id });
      else load('topFolders', { hub_id: hub.id, project_id: project.id });
    } else if (project) {
      setProject(null); setSelected(null); load('projects', { hub_id: hub.id });
    } else if (hub) {
      setHub(null); load('hubs');
    }
  };

  const save = async (enabled, useSaved = false) => {
    if (saving || (enabled && !useSaved && (!project || !selected))) return;
    setSaving(true); setError('');
    try {
      const destinationProject = useSaved ? config?.project_id : project?.id;
      const destinationFolder = useSaved ? config?.folder_id : selected?.id;
      const data = await apiJson(`${API}/api/docs/cad/acc-bridge/folder`, {
        method: 'PUT', retries: 0,
        body: JSON.stringify({ local_folder_id: folder.id, model_urn: modelUrn,
          enabled, ...(enabled ? { project_id: destinationProject, folder_id: destinationFolder,
            project_name: useSaved ? config?.project_name : nameOf(project) } : {}) }),
      });
      if (!data?.success) throw new Error(data?.error || 'No se pudo guardar');
      setConfig(data.bridge);
      setServiceEnabled(data.service_enabled === true);
      onSaved?.(data.bridge, data.service_enabled === true);
      if (enabled && data.service_enabled === true) onClose();
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };

  return (
    <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 11000, background: '#0f172acc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div role="dialog" aria-modal="true" aria-label="Puente temporal de carpetas ACC"
        style={{ width: 680, maxWidth: '96vw', maxHeight: '90vh', background: '#fff', color: '#141413', borderRadius: 8, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e8e6dc', display: 'flex', justifyContent: 'space-between' }}>
          <strong>Puente temporal con ACC</strong>
          <button type="button" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div style={{ padding: '12px 20px', fontSize: 14, lineHeight: 1.5 }}>
          Carpeta ALEPHIA: <strong>{folder.name}</strong>. Sólo DWG, DXF, DWF/DWFX, RVT/RFA
          y NWD/NWC nuevos subidos directamente aquí se copiarán a la carpeta ACC elegida.
          El vínculo permanece hasta que lo cambies o desactives. La traducción habitual de
          las demás carpetas no cambia.
          {config && <p style={{ marginBottom: 0 }}>
            Estado: <strong>{config.enabled && serviceEnabled ? 'Activado' : config.enabled ? 'Configurado, pero apagado en el servidor' : 'Desactivado'}</strong>
            {config.folder_name && ` · destino: ${config.project_name || config.project_id} / ${config.folder_name}`}
          </p>}
          {!serviceEnabled && <p style={{ color: '#9e5943', marginBottom: 0 }}>
            El cortacircuito del servidor está apagado. Guardar la pareja de carpetas no enviará ningún archivo a ACC.
          </p>}
        </div>
        <div style={{ padding: '8px 20px', borderTop: '1px solid #e8e6dc', borderBottom: '1px solid #e8e6dc', fontSize: 14 }}>
          {(hub || project || ancestors.length > 0) && <button type="button" onClick={back}>← Volver</button>}
          <span style={{ marginLeft: 8 }}>{[hub, project, ...ancestors].filter(Boolean).map(nameOf).join(' / ') || 'Centros de Autodesk'}</span>
        </div>
        <div style={{ overflowY: 'auto', minHeight: 200, padding: '4px 0' }}>
          {loading && <p style={{ padding: '8px 20px' }}>Consultando ACC…</p>}
          {!loading && entries.map(entry => (
            <button key={entry.id} type="button" onClick={() => choose(entry)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 20px', background: 'white', border: 0, borderBottom: '1px solid #f1f0e8', cursor: 'pointer' }}>
              📁 {nameOf(entry)} ›
            </button>
          ))}
          {!loading && !entries.length && !error && <p style={{ padding: '8px 20px' }}>No hay más subcarpetas.</p>}
        </div>
        {error && <p role="alert" style={{ color: '#b93535', margin: '8px 20px' }}>{error}</p>}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e8e6dc', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {config?.enabled && <button type="button" disabled={saving} onClick={() => save(false)}>Desactivar puente</button>}
          {config && !config.enabled && <button type="button" disabled={saving} onClick={() => save(true, true)}>Reactivar mismo destino</button>}
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="button" disabled={!selected || saving} onClick={() => save(true)}>
            {saving ? 'Guardando…' : serviceEnabled ? 'Vincular esta carpeta ACC' : 'Guardar pareja (puente apagado)'}
          </button>
        </div>
      </div>
    </div>
  );
}
