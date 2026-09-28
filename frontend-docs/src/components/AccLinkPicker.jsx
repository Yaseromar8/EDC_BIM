import React, { useEffect, useState } from 'react';
import { apiJson } from '../utils/apiFetch';
import { accPreviewKey, accReadOnlyPath, makeAccPreviewLink,
  removeAccPreview, saveAccPreview } from '../utils/accPreviewLocal';

const panel = { background: '#fff', color: '#172334', borderRadius: 8, width: 680,
  maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
  boxShadow: '0 20px 65px #0005' };
const row = { display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px',
  background: '#fff', color: '#172334', border: 0, borderBottom: '1px solid #e8edf2',
  cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const label = entry => entry?.attributes?.displayName || entry?.attributes?.name || entry?.id || 'Sin nombre';

export default function AccLinkPicker({ API, file, docsVersionId, docsGcsUrn,
  currentLink, onLinked, onClose, previewOnly = false }) {
  const [hub, setHub] = useState(null);
  const [project, setProject] = useState(null);
  const [folders, setFolders] = useState([]);
  const [item, setItem] = useState(null);
  const [version, setVersion] = useState(null);
  const [entries, setEntries] = useState([]);
  const [more, setMore] = useState(null);
  const [browse, setBrowse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const previewKey = accPreviewKey(file.id, docsVersionId, docsGcsUrn);

  const query = async (level, extra = {}) => {
    if (previewOnly) {
      // Endpoints GET ya disponibles para importar modelos en View. El ensayo
      // local no llama a POST /job ni a ninguna escritura del backend.
      const path = accReadOnlyPath(level, extra);
      const data = await apiJson(`${API}${path}`, { retries: 0 });
      return { data: data?.data || [], next: null };
    }
    const params = new URLSearchParams({ node_id: file.id, ...(docsVersionId ? { version_id: docsVersionId } : {}), level, ...extra });
    const data = await apiJson(`${API}/api/docs/cad/acc-browse?${params}`, { retries: 0 });
    if (!data?.success) throw new Error(data?.error || 'No se pudo consultar Autodesk Docs');
    return data;
  };

  const load = async (level, extra = {}) => {
    setBrowse({ level, extra });
    setLoading(true);
    setError('');
    setEntries([]);
    setMore(null);
    try {
      const result = await query(level, extra);
      setEntries(result.data || []);
      setMore(result.next || null);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!browse || !more || loading) return;
    setLoading(true); setError('');
    try {
      const result = await query(browse.level, { ...browse.extra, cursor: more });
      setEntries(previous => [...previous, ...(result.data || [])]);
      setMore(result.next || null);
    } catch (cause) { setError(cause.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load('hubs'); }, [file.id, docsVersionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseHub = entry => {
    setHub(entry); setProject(null); setFolders([]); setItem(null); setVersion(null);
    load('projects', { hub_id: entry.id });
  };
  const chooseProject = entry => {
    setProject(entry); setFolders([]); setItem(null); setVersion(null);
    load('topFolders', { hub_id: hub.id, project_id: entry.id });
  };
  const chooseFolder = entry => {
    setFolders(previous => [...previous, entry]); setItem(null); setVersion(null);
    load('contents', { project_id: project.id, folder_id: entry.id });
  };
  const chooseItem = entry => {
    setItem(entry); setVersion(null);
    load('versions', { project_id: project.id, item_id: entry.id });
  };
  const back = () => {
    if (item) {
      setItem(null); setVersion(null);
      const parent = folders[folders.length - 1];
      load('contents', { project_id: project.id, folder_id: parent.id });
    } else if (folders.length) {
      const parent = folders.slice(0, -1);
      setFolders(parent);
      if (parent.length) load('contents', { project_id: project.id, folder_id: parent[parent.length - 1].id });
      else load('topFolders', { hub_id: hub.id, project_id: project.id });
    } else if (project) {
      setProject(null);
      load('projects', { hub_id: hub.id });
    } else if (hub) {
      setHub(null);
      load('hubs');
    }
  };

  const sameName = item && label(item).toLocaleLowerCase() === (file.name || '').toLocaleLowerCase();
  const bind = async () => {
    if (!sameName || !version || saving) return;
    setSaving(true); setError('');
    try {
      if (previewOnly) {
        const link = makeAccPreviewLink({ fileName: file.name, gcsUrn: docsGcsUrn,
          projectId: project.id, itemId: item.id, version });
        if (!saveAccPreview(previewKey, link)) {
          throw new Error('El navegador no permitió guardar este ensayo local.');
        }
        onLinked(link);
        onClose();
        return;
      }
      const data = await apiJson(`${API}/api/docs/cad/acc-link`, {
        method: 'POST', body: JSON.stringify({ node_id: file.id, version_id: docsVersionId,
          project_id: project.id, item_id: item.id, acc_version_id: version.id }),
      });
      if (!data?.success) throw new Error(data?.error || 'No se pudo vincular');
      onLinked(data.link);
      onClose();
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };
  const unlink = async () => {
    if (!currentLink || saving || !window.confirm(previewOnly
      ? '¿Quitar la prueba local de esta vista ACC? El original de Docs no se eliminará.'
      : '¿Retirar esta vista ACC? El original de Docs no se eliminará.')) return;
    setSaving(true); setError('');
    try {
      if (previewOnly) {
        removeAccPreview(previewKey);
        onLinked(null);
        onClose();
        return;
      }
      const data = await apiJson(`${API}/api/docs/cad/acc-link`, {
        method: 'DELETE', body: JSON.stringify({ node_id: file.id, version_id: docsVersionId }),
      });
      if (!data?.success) throw new Error(data?.error || 'No se pudo retirar el vínculo');
      onLinked(null);
      onClose();
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };

  return (
    <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 11000, background: '#0f172acc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div role="dialog" aria-modal="true" aria-label="Vincular archivo de Autodesk Docs" style={panel}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e8edf2', display: 'flex', justifyContent: 'space-between' }}>
          <strong>Vincular vista de Autodesk Docs</strong>
          <button type="button" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div style={{ padding: '12px 20px', fontSize: 13, lineHeight: 1.5 }}>
          Documento: <strong>{file.name}</strong>. Elige el mismo archivo ya preparado en ACC y su versión.
          El original de ALEPHIA Docs permanecerá en su carpeta y se podrá descargar.
          {previewOnly && <p style={{ margin: '8px 0 0', color: '#8a5214' }}>
            Ensayo local: esta vista se guarda sólo en esta pestaña. No modifica Docs ni ACC y no será visible para otros usuarios.
          </p>}
          {currentLink && <p style={{ margin: '8px 0 0' }}>Vista actual: {currentLink.name} · ACC V{currentLink.version_number || '?'}</p>}
        </div>
        <div style={{ padding: '8px 20px', borderTop: '1px solid #e8edf2', borderBottom: '1px solid #e8edf2', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          {(hub || project || folders.length || item) && <button type="button" onClick={back} disabled={loading}>← Volver</button>}
          <span>{[label(hub), label(project), ...folders.map(label), label(item)].filter(value => value !== 'Sin nombre').join(' / ') || 'Centros de Autodesk'}</span>
        </div>
        <div style={{ minHeight: 190, overflowY: 'auto', flex: 1 }}>
          {loading && <div style={{ padding: 16 }}>Cargando…</div>}
          {!loading && entries.map(entry => {
            const kind = entry.type;
            const isFolder = kind === 'folders';
            const isItem = kind === 'items';
            const isVersion = kind === 'versions';
            return <button type="button" key={entry.id} style={{ ...row,
              background: version?.id === entry.id ? '#e8f2fc' : '#fff' }}
              onClick={() => {
                if (!hub) chooseHub(entry);
                else if (!project) chooseProject(entry);
                else if (item && isVersion) setVersion(entry);
                else if (isFolder) chooseFolder(entry);
                else if (isItem) chooseItem(entry);
              }}>
              {isFolder ? '📁 ' : isItem ? '📄 ' : isVersion ? 'V' : '› '}
              {isVersion ? `${entry.attributes?.versionNumber || '?'} · ${label(entry)}` : label(entry)}
            </button>;
          })}
          {!loading && !entries.length && !error && <div style={{ padding: 16 }}>No hay elementos en esta ubicación.</div>}
          {more && <button type="button" style={row} onClick={loadMore} disabled={loading}>Cargar más resultados de ACC…</button>}
        </div>
        <div style={{ padding: '8px 20px', minHeight: 25, fontSize: 12, color: '#a33' }} role="alert">
          {error || (item && !sameName ? 'El nombre del archivo ACC debe coincidir con el de Docs.' : '')}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e8edf2', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {currentLink && <button type="button" onClick={unlink} disabled={saving} style={{ marginRight: 'auto' }}>
            {previewOnly ? 'Quitar prueba local' : 'Retirar vista ACC'}
          </button>}
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="button" onClick={bind} disabled={!sameName || !version || saving}>
            {saving ? 'Guardando…' : previewOnly ? 'Previsualizar aquí' : 'Vincular esta versión'}
          </button>
        </div>
      </div>
    </div>
  );
}
