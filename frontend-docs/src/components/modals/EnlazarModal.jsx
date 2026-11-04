/**
 * ENLAZAR (5-nov-2026, docs/archivos/27; el dueño: «tengo un único archivo que sirve a varias calles. En el archivo
 * original le daría compartir, se abre una ventana donde puedo elegir mis carpetas, selecciono dónde quiero y se
 * comparte. Cuando vaya a esa carpeta, el archivo sale con un signo de enlazado»).
 *
 * Se eligen una o varias carpetas en el árbol y cada una enseña el documento con la marca de enlazado, sin copia.
 * Las reglas (permisos, nombre repetido, todo o nada) son del servidor: `POST /api/docs/enlaces` y
 * backend/enlaces_de_documentos.py. Aquí solo se elige y se dice el resultado.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { apiFetch } from '../../utils/apiFetch';
import { API } from '../../utils/helpers';
import { SelectFolderNode } from './MoveModal';

/** La carpeta donde VIVE el documento: la de su enlace si es una fila enlazada; si no, la que se está mirando. */
const carpetaDe = (doc, carpetaActual) => String(doc?.enlace?.desde?.id || carpetaActual || '');

export default function EnlazarModal({ documentos = [], carpetaActual, projectPrefix, projectRootId, onCerrar, onHecho }) {
  const [destinos, setDestinos] = useState(() => new Map());   // id → nombre
  const [ocupado, setOcupado] = useState(false);
  if (!documentos.length) return null;
  const titulo = documentos.length === 1 ? `Enlazar «${documentos[0].name}»` : `Enlazar ${documentos.length} documentos`;
  // Ni la raíz ni la carpeta propia de cada documento: ahí ya está.
  const noElegibles = new Set([String(projectRootId), ...documentos.map(d => carpetaDe(d, carpetaActual))]);

  const alternar = (ruta, id) => {
    if (!id || noElegibles.has(String(id))) return;
    setDestinos(prev => {
      const sig = new Map(prev);
      if (sig.has(String(id))) sig.delete(String(id));
      else sig.set(String(id), String(ruta || '').replace(/\/$/, '').split('/').pop());
      return sig;
    });
  };

  const enlazar = async () => {
    setOcupado(true);
    try {
      const r = await apiFetch(`${API}/api/docs/enlaces`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_urn: projectPrefix, documentos: documentos.map(d => d.id),
                               carpetas: [...destinos.keys()] }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo enlazar.');
      const n = destinos.size;
      toast.success(d.creados
        ? `Enlazado en ${n === 1 ? '1 carpeta' : `${n} carpetas`}` + (d.ya_estaban ? ` · ${d.ya_estaban} ya estaban` : '')
        : 'Ya estaba enlazado en esas carpetas');
      onHecho?.(d);
    } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  };

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="acc-modal-box" role="dialog" aria-modal="true" aria-label={titulo}
        onClick={e => e.stopPropagation()} style={{ width: 520, padding: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #f1f0e8' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 400 }}>{titulo}</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar"
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#72706b' }}>✕</button>
        </div>
        <div style={{ padding: 24 }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary, #52524d)' }}>
            {documentos.length === 1 ? 'Sigue en su carpeta' : 'Siguen en su carpeta'}: en cada carpeta que elijas se
            {documentos.length === 1 ? ' verá' : ' verán'} con la marca de enlazado, sin copia, y siempre en su última versión.</p>
          <div className="acc-move-tree-container" style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid #f1f0e8', padding: 12, borderRadius: 2 }}>
            <SelectFolderNode folder={{ name: 'Archivos de proyecto', fullName: projectPrefix, id: projectRootId }}
              defaultExpanded modelUrn={projectPrefix} elegidas={destinos} onSelect={alternar}
              noElegibles={noElegibles} />
          </div>
          {destinos.size > 0 && (
            <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-secondary, #52524d)' }}>
              {destinos.size === 1 ? 'En' : `En ${destinos.size} carpetas:`} {[...destinos.values()].join(', ')}</p>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 24px', borderTop: '1px solid #f1f0e8', background: '#faf9f5' }}>
          <button type="button" className="acc-btn-flat" onClick={onCerrar}
            style={{ padding: '8px 16px', background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>
            Cancelar</button>
          <button type="button" className={destinos.size ? 'acc-btn-primary-2' : 'acc-btn-disabled'}
            disabled={!destinos.size || ocupado} onClick={enlazar}
            style={{ padding: '8px 24px', background: destinos.size ? 'var(--accent)' : '#f1f0e8',
                     color: destinos.size ? '#fff' : '#72706b', border: 'none', borderRadius: 4, fontWeight: 600,
                     cursor: destinos.size && !ocupado ? 'pointer' : 'default' }}>
            {ocupado ? 'Enlazando…' : 'Enlazar'}</button>
        </div>
      </div>
    </div>
  );
}
