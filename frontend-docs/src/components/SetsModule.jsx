// SetsModule.jsx — Conjuntos de documentos por entrega/hito (estilo ACC Sets)
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { API, formatDate } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import DocQuickView from './DocQuickView';
import useDocPreview from '../hooks/useDocPreview';

// ── Modal: añadir selección a un conjunto (existente o nuevo) ──
export function AddToSetModal({ isOpen, onClose, items, projectPrefix, onAdded }) {
  const [sets, setSets] = useState([]);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setNewName('');
    apiFetch(`${API}/api/sets?model_urn=${encodeURIComponent(projectPrefix)}`)
      .then(r => r.json()).then(d => setSets(d.success ? d.sets : [])).catch(() => setSets([]));
  }, [isOpen, projectPrefix]);

  if (!isOpen) return null;

  const addTo = async (setId) => {
    setSaving(true);
    try {
      const r = await apiFetch(`${API}/api/sets/${setId}/items`, {
        method: 'POST', body: JSON.stringify({ items })
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      toast.success(`${items.length} documento(s) añadidos al conjunto`);
      onAdded?.(); onClose();
    } catch (e) { toast.error(e.message || 'Error'); }
    finally { setSaving(false); }
  };

  const createAndAdd = async () => {
    if (!newName.trim()) { toast.error('Nombre del conjunto requerido'); return; }
    setSaving(true);
    try {
      const r = await apiFetch(`${API}/api/sets`, {
        method: 'POST', body: JSON.stringify({ model_urn: projectPrefix, name: newName.trim() })
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      await addTo(d.id);
    } catch (e) { toast.error(e.message || 'Error'); setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 420, background: '#fff', borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Añadir {items.length} documento(s) a conjunto</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#999', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 20, fontSize: 13 }}>
          {sets.length > 0 && (
            <div style={{ marginBottom: 16, maxHeight: 180, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4 }}>
              {sets.map(s => (
                <div key={s.id} onClick={() => !saving && addTo(s.id)}
                  style={{ padding: '9px 12px', borderBottom: '1px solid #f5f5f5', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                  onMouseOver={e => e.currentTarget.style.background = '#f4f6f9'} onMouseOut={e => e.currentTarget.style.background = 'none'}>
                  <span style={{ fontWeight: 600, color: '#333' }}>{s.name}</span>
                  <span style={{ color: '#999', fontSize: 12 }}>{s.items_count} docs</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="O crea uno nuevo: Entrega 30%…"
              onKeyDown={e => { if (e.key === 'Enter') createAndAdd(); }}
              style={{ flex: 1, padding: '8px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, outline: 'none' }} />
            <button onClick={createAndAdd} disabled={saving}
              style={{ padding: '8px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Crear</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Vista: conjuntos del proyecto ──
export function SetsView({ projectPrefix, isAdmin }) {
  const [sets, setSets] = useState(null);
  const [expanded, setExpanded] = useState({}); // { setId: items[] }
  const [preview, openDoc, closePreview] = useDocPreview(projectPrefix);

  const load = () => {
    apiFetch(`${API}/api/sets?model_urn=${encodeURIComponent(projectPrefix)}`)
      .then(r => r.json()).then(d => setSets(d.success ? d.sets : [])).catch(() => setSets([]));
  };
  useEffect(load, [projectPrefix]);

  const toggle = async (s) => {
    if (expanded[s.id]) { setExpanded(prev => ({ ...prev, [s.id]: null })); return; }
    const r = await apiFetch(`${API}/api/sets/${s.id}/items`);
    const d = await r.json();
    setExpanded(prev => ({ ...prev, [s.id]: d.success ? d.items : [] }));
  };

  const removeSet = async (s) => {
    const r = await apiFetch(`${API}/api/sets/${s.id}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.success) { toast.success('Conjunto eliminado'); load(); } else toast.error(d.error || 'Error');
  };

  const removeItem = async (s, it) => {
    const r = await apiFetch(`${API}/api/sets/${s.id}/items/${encodeURIComponent(it.node_id)}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.success) {
      setExpanded(prev => ({ ...prev, [s.id]: (prev[s.id] || []).filter(x => x.node_id !== it.node_id) }));
      load();
    } else toast.error(d.error || 'Error');
  };

  return (
    <div style={{ padding: 32, flex: 1, overflowY: 'auto' }}>
      <DocQuickView file={preview} projectPrefix={projectPrefix} onClose={closePreview} />
      <div style={{ fontSize: 24, fontWeight: 300, marginBottom: 4 }}>Conjuntos</div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
        Agrupa planos por entrega o hito con su versión congelada. Selecciona archivos en Archivos y pulsa "Añadir a conjunto".
      </div>
      {sets === null ? (
        <div style={{ textAlign: 'center', padding: 48 }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
      ) : sets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#999', fontSize: 13 }}>No hay conjuntos aún.</div>
      ) : sets.map(s => (
        <div key={s.id} style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
          <div onClick={() => toggle(s)} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" style={{ transform: expanded[s.id] ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="9 18 15 12 9 6"/></svg>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#333', flex: 1 }}>{s.name}</span>
            <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{s.items_count} documento{s.items_count !== 1 ? 's' : ''}</span>
            <span style={{ fontSize: 11, color: '#aaa' }}>{s.created_by} · {formatDate(s.created_at)}</span>
            {isAdmin && (
              <button onClick={e => { e.stopPropagation(); removeSet(s); }} title="Eliminar conjunto"
                style={{ background: 'none', border: 'none', color: '#e53935', cursor: 'pointer', fontSize: 14 }}>✕</button>
            )}
          </div>
          {expanded[s.id] && (
            <div style={{ borderTop: '1px solid #f3f3f3' }}>
              {expanded[s.id].length === 0 ? (
                <div style={{ padding: 16, fontSize: 12, color: '#999' }}>Conjunto vacío.</div>
              ) : expanded[s.id].map(it => (
                <div key={it.node_id} style={{ padding: '8px 16px 8px 44px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f7f7f7', fontSize: 13 }}>
                  <span onClick={() => openDoc(it)} title="Abrir documento" style={{ flex: 1, color: 'var(--accent)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name} ↗</span>
                  {/* «Congelada» sólo si de verdad lo está. Antes esta etiqueta lo
                      decía siempre, pero sólo se guardaba el NÚMERO de versión y se
                      abría el fichero vivo: bastaba con que alguien subiera una
                      revisión para que la entrega enseñara otra cosa con el cartel
                      puesto. Las filas anteriores al arreglo no tienen version_id y
                      no hay forma de adivinarlo a posteriori: se dicen como son. */}
                  {it.version_id ? (
                    <span title="Se abre exactamente el contenido que tenía al añadirlo"
                      style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--bg-accent)', padding: '2px 8px', borderRadius: 10 }}>
                      V{it.version_number || 1} congelada
                    </span>
                  ) : (
                    <span title="Se añadió antes de que se guardara la referencia a la versión: abre el contenido actual del documento"
                      style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning)', background: 'var(--bg-warning)', padding: '2px 8px', borderRadius: 10 }}>
                      V{it.version_number || 1} · sin congelar
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: '#aaa' }}>{formatDate(it.added_at)}</span>
                  {isAdmin && (
                    <button onClick={() => removeItem(s, it)} style={{ background: 'none', border: 'none', color: '#bbb', cursor: 'pointer' }}>✕</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
