// AttributesModule.jsx — Atributos personalizados por proyecto (estilo ACC)
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';

// ── Administración de definiciones (vista Configuración, solo admin) ──
export function AttributesAdmin({ projectPrefix }) {
  const [defs, setDefs] = useState([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('text');
  const [options, setOptions] = useState('');

  const load = () => {
    apiFetch(`${API}/api/attrs/defs?model_urn=${encodeURIComponent(projectPrefix)}`)
      .then(r => r.json()).then(d => { if (d.success) setDefs(d.defs); }).catch(() => {});
  };
  useEffect(load, [projectPrefix]);

  const add = async () => {
    if (!name.trim()) { toast.error('Nombre del atributo requerido'); return; }
    const body = { model_urn: projectPrefix, name: name.trim(), attr_type: type };
    if (type === 'select') body.options = options.split(',').map(s => s.trim()).filter(Boolean);
    const r = await apiFetch(`${API}/api/attrs/defs`, { method: 'POST', body: JSON.stringify(body) });
    const d = await r.json();
    if (d.success) { setName(''); setOptions(''); load(); toast.success('Atributo creado'); }
    else toast.error(d.error || 'Error');
  };

  const remove = async (id) => {
    const r = await apiFetch(`${API}/api/attrs/defs/${id}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.success) { load(); toast.success('Atributo eliminado'); } else toast.error(d.error || 'Error');
  };

  const TYPE_LABELS = { text: 'Texto', number: 'Número', date: 'Fecha', select: 'Lista' };

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: 24, marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 4 }}>Atributos personalizados</div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
        Metadata adicional para los documentos (Disciplina, Código de plano, Revisión…). Se editan por archivo desde su menú contextual → Atributos.
      </div>
      {defs.map(def => (
        <div key={def.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f3f3f3', fontSize: 13 }}>
          <span style={{ fontWeight: 600, color: '#333' }}>{def.name}</span>
          <span style={{ fontSize: 11, background: '#eef2f7', color: '#1a56a8', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{TYPE_LABELS[def.attr_type]}</span>
          {def.attr_type === 'select' && <span style={{ fontSize: 11, color: '#999' }}>{(def.options || []).join(' · ')}</span>}
          <button onClick={() => remove(def.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#e53935', cursor: 'pointer', fontSize: 12 }}>Eliminar</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre (ej: Disciplina)"
          style={{ flex: 1, minWidth: 160, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, outline: 'none' }} />
        <select value={type} onChange={e => setType(e.target.value)} style={{ padding: '7px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13 }}>
          <option value="text">Texto</option><option value="number">Número</option>
          <option value="date">Fecha</option><option value="select">Lista de opciones</option>
        </select>
        {type === 'select' && (
          <input value={options} onChange={e => setOptions(e.target.value)} placeholder="Opciones separadas por coma"
            style={{ flex: 1, minWidth: 180, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, outline: 'none' }} />
        )}
        <button onClick={add} style={{ padding: '7px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Añadir</button>
      </div>
    </div>
  );
}

// ── Panel de valores por archivo ──
export function AttributesPanel({ item, projectPrefix, isAdmin, onClose }) {
  const [defs, setDefs] = useState(null);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch(`${API}/api/attrs/defs?model_urn=${encodeURIComponent(projectPrefix)}`).then(r => r.json()),
      apiFetch(`${API}/api/attrs/values?node_id=${encodeURIComponent(item.id)}`).then(r => r.json()),
    ]).then(([d1, d2]) => {
      setDefs(d1.success ? d1.defs : []);
      setValues(d2.success ? d2.values : {});
    }).catch(() => setDefs([]));
  }, [item.id, projectPrefix]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await apiFetch(`${API}/api/attrs/values`, {
        method: 'PUT', body: JSON.stringify({ node_id: item.id, values })
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      toast.success('Atributos guardados');
      onClose();
    } catch (e) { toast.error(e.message || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'rgba(0,0,0,0.35)', display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 360, height: '100%', background: '#fff', borderLeft: '1px solid #ddd', display: 'flex', flexDirection: 'column', animation: 'slideRight 0.25s ease-out' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#333' }}>Atributos</div>
            <div style={{ fontSize: 11, color: '#999', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#999', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {defs === null ? (
            <div style={{ textAlign: 'center', padding: 30 }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
          ) : defs.length === 0 ? (
            <div style={{ fontSize: 13, color: '#999', textAlign: 'center', padding: 20 }}>
              No hay atributos definidos.<br />El admin puede crearlos en Configuración.
            </div>
          ) : defs.map(def => (
            <div key={def.id}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 5 }}>{def.name}</label>
              {def.attr_type === 'select' ? (
                <select disabled={!isAdmin} value={values[String(def.id)] || ''}
                  onChange={e => setValues(prev => ({ ...prev, [def.id]: e.target.value }))}
                  style={{ width: '100%', padding: '7px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13 }}>
                  <option value="">—</option>
                  {(def.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input disabled={!isAdmin}
                  type={def.attr_type === 'number' ? 'number' : def.attr_type === 'date' ? 'date' : 'text'}
                  value={values[String(def.id)] || ''}
                  onChange={e => setValues(prev => ({ ...prev, [def.id]: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, outline: 'none' }} />
              )}
            </div>
          ))}
        </div>
        {isAdmin && defs && defs.length > 0 && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '7px 14px', background: '#fff', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
            <button onClick={save} disabled={saving} style={{ padding: '7px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
