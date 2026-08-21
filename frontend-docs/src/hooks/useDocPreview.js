import { useState } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';

// Abre la VERSIÓN entregada, no necesariamente el documento vivo. Los
// elementos históricos sin version_id conservan el comportamiento legacy.
export default function useDocPreview(projectPrefix) {
  const [preview, setPreview] = useState(null);

  const open = async (it) => {
    try {
      const porVersion = it.version_id
        ? `&version_id=${encodeURIComponent(it.version_id)}`
        : '';
      const r = await apiFetch(`${API}/api/docs/signed-url?model_urn=${encodeURIComponent(projectPrefix)}&id=${encodeURIComponent(it.node_id)}${porVersion}`);
      const d = await r.json();
      if (!d.success || !d.url) throw new Error(d.error || 'No se pudo abrir');
      const etiqueta = it.version_id
        ? ` · v${it.version_number || it.version || '?'}`
        : ' · versión actual';
      setPreview({ name: (it.name || '') + etiqueta, url: d.url, nodeId: it.node_id });
    } catch (e) {
      toast.error(e.message || 'No se pudo abrir el documento');
    }
  };

  return [preview, open, () => setPreview(null)];
}
