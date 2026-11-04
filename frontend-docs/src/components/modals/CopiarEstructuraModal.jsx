/**
 * COPIAR LA ESTRUCTURA DE UNA CARPETA (4-nov-2026, el dueño: «tengo 10 carpetas que tendrán las mismas subcarpetas.
 * Quisiera poder copiar esas subcarpetas, obviamente vacías, solo carpetas»).
 *
 * Se marcan una o varias carpetas en la lista (5-nov-2026: así lo usa el dueño), se elige uno o varios destinos en el
 * árbol y cada destino recibe esas carpetas, vacías, con sus subcarpetas.
 * Las reglas (permisos, lo que ya existe se usa, todo o nada) son del servidor: `POST /api/docs/carpetas/copiar-estructura`
 * y backend/estructura_de_carpetas.py. Aquí solo se elige y se dice el resultado.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { apiFetch } from '../../utils/apiFetch';
import { API } from '../../utils/helpers';
import { SelectFolderNode } from './MoveModal';

const nombreDe = (c) => String(c?.name || '').replace(/\/$/, '');

export default function CopiarEstructuraModal({ carpetas = [], projectPrefix, projectRootId, onCerrar, onHecho }) {
  const [destinos, setDestinos] = useState(() => new Map());   // id → nombre
  const [ocupado, setOcupado] = useState(false);
  if (!carpetas.length) return null;
  const nombres = carpetas.map(nombreDe);
  const titulo = carpetas.length === 1 ? `Copiar «${nombres[0]}»` : `Copiar ${carpetas.length} carpetas`;
  // Ni la raíz ni las propias carpetas marcadas son destino (dentro de ellas lo niega el servidor).
  const noElegibles = new Set([String(projectRootId), ...carpetas.map(c => String(c.id))]);

  const alternar = (ruta, id) => {
    if (!id || noElegibles.has(String(id))) return;
    setDestinos(prev => {
      const sig = new Map(prev);
      if (sig.has(String(id))) sig.delete(String(id));
      else sig.set(String(id), String(ruta || '').replace(/\/$/, '').split('/').pop());
      return sig;
    });
  };

  const copiar = async () => {
    setOcupado(true);
    try {
      const r = await apiFetch(`${API}/api/docs/carpetas/copiar-estructura`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_urn: projectPrefix, carpetas: carpetas.map(c => c.id), destinos: [...destinos.keys()] }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo copiar la estructura.');
      const n = destinos.size;
      toast.success(d.creadas
        ? `${d.creadas === 1 ? '1 carpeta nueva' : `${d.creadas} carpetas nuevas`} en ${n === 1 ? '1 destino' : `${n} destinos`}`
          + (d.ya_estaban ? ` · ${d.ya_estaban} ya estaban` : '')
        : 'Ya tenían esa estructura: no hacía falta crear nada');
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
            {carpetas.length === 1 ? 'La carpeta' : nombres.join(', ') + ':'} con sus subcarpetas, vacías, sin documentos,
            dentro de cada carpeta que elijas.</p>
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
            disabled={!destinos.size || ocupado} onClick={copiar}
            style={{ padding: '8px 24px', background: destinos.size ? 'var(--accent)' : '#f1f0e8',
                     color: destinos.size ? '#fff' : '#72706b', border: 'none', borderRadius: 4, fontWeight: 600,
                     cursor: destinos.size && !ocupado ? 'pointer' : 'default' }}>
            {ocupado ? 'Copiando…' : 'Copiar estructura'}</button>
        </div>
      </div>
    </div>
  );
}
