// ReviewsModule.jsx — Flujos de revisión y aprobación (ISO 19650, estilo ACC Reviews)
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { API, formatDate, getInitials } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import DocQuickView from './DocQuickView';

// Resuelve la URL firmada de un documento por su node_id y lo abre en el visor
export function useDocPreview(projectPrefix) {
  const [preview, setPreview] = useState(null);
  const open = async (it) => {
    try {
      const r = await apiFetch(`${API}/api/docs/signed-url?model_urn=${encodeURIComponent(projectPrefix)}&id=${encodeURIComponent(it.node_id)}`);
      const d = await r.json();
      if (!d.success || !d.url) throw new Error(d.error || 'No se pudo abrir');
      setPreview({ name: it.name, url: d.url, nodeId: it.node_id });
    } catch (e) { toast.error(e.message || 'No se pudo abrir el documento'); }
  };
  return [preview, open, () => setPreview(null)];
}

const STATUS_CHIP = {
  pending: { label: 'En revisión', bg: '#fff7e0', color: '#b26a00' },
  approved: { label: 'Aprobada', bg: '#dcfce7', color: '#15803d' },
  rejected: { label: 'Rechazada', bg: '#fee2e2', color: '#b91c1c' },
};

// ── Modal: enviar documentos a revisión ──
export function ReviewModal({ isOpen, onClose, items, projectPrefix, user, onCreated }) {
  const [title, setTitle] = useState('');
  const [users, setUsers] = useState([]);
  const [steps, setSteps] = useState([]);
  const [finalStatus, setFinalStatus] = useState('SHARED');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(''); setSteps([]); setFinalStatus('SHARED');
    apiFetch(`${API}/api/users`).then(r => r.json())
      .then(d => setUsers(d.users || d || [])).catch(() => setUsers([]));
  }, [isOpen]);

  if (!isOpen) return null;

  const submit = async () => {
    if (!title.trim()) { toast.error('Ponle un título a la revisión'); return; }
    if (!steps.length) { toast.error('Agrega al menos un revisor'); return; }
    setSaving(true);
    try {
      const r = await apiFetch(`${API}/api/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          model_urn: projectPrefix, title: title.trim(), items,
          steps: steps.map(s => ({ email: s.email, name: s.name })),
          final_status: finalStatus, user: user?.name
        })
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      toast.success('Revisión iniciada');
      onCreated?.(); onClose();
    } catch (e) { toast.error(e.message || 'No se pudo crear la revisión'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 520, maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1f1f1f' }}>Enviar a revisión</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#999', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13 }}>
          <div>
            <label style={{ display: 'block', color: '#666', marginBottom: 6, fontWeight: 600 }}>Título</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Aprobación planos estructuras Rev B"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, outline: 'none' }} />
          </div>

          <div>
            <label style={{ display: 'block', color: '#666', marginBottom: 6, fontWeight: 600 }}>Documentos ({items.length})</label>
            <div style={{ maxHeight: 110, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4 }}>
              {items.map(it => (
                <div key={it.node_id} style={{ padding: '6px 10px', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
                  <span style={{ color: '#0696d7', fontWeight: 600 }}>V{it.version || 1}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', color: '#666', marginBottom: 6, fontWeight: 600 }}>Secuencia de revisores (en orden)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {steps.map((s, i) => (
                <span key={s.email} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#e8f0fe', color: '#1a56a8', padding: '4px 10px', borderRadius: 14, fontSize: 12, fontWeight: 600 }}>
                  {i + 1}. {s.name || s.email}
                  <button onClick={() => setSteps(prev => prev.filter(x => x.email !== s.email))} style={{ background: 'none', border: 'none', color: '#1a56a8', cursor: 'pointer', padding: 0, fontSize: 13 }}>×</button>
                </span>
              ))}
              {!steps.length && <span style={{ color: '#aaa', fontSize: 12 }}>Haz clic en un usuario para añadirlo como paso…</span>}
            </div>
            <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4 }}>
              {users.filter(u => !steps.find(s => s.email === u.email)).map(u => (
                <div key={u.email} onClick={() => setSteps(prev => [...prev, { email: u.email, name: u.name }])}
                  style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}
                  onMouseOver={e => e.currentTarget.style.background = '#f6fbff'} onMouseOut={e => e.currentTarget.style.background = 'none'}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#0696d7', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{getInitials(u.name || u.email)}</span>
                  <span>{u.name || '—'} <span style={{ color: '#999', fontSize: 11 }}>{u.email}</span></span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', color: '#666', marginBottom: 6, fontWeight: 600 }}>Al aprobar, los documentos pasan a:</label>
            <div style={{ display: 'flex', gap: 14 }}>
              {[['SHARED', 'Compartido'], ['PUBLISHED', 'Publicado']].map(([v, l]) => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="radio" checked={finalStatus === v} onChange={() => setFinalStatus(v)} /> {l}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#fcfcfc' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: '#fff', border: '1px solid #dcdcdc', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={submit} disabled={saving} style={{ padding: '8px 20px', background: '#0696d7', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Creando…' : 'Iniciar revisión'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Vista: listado de revisiones + aprobar/rechazar ──
export function ReviewsView({ projectPrefix, user, isAdmin }) {
  const [reviews, setReviews] = useState(null);
  const [comments, setComments] = useState({}); // { reviewId: texto }
  const [acting, setActing] = useState(null);
  const [preview, openDoc, closePreview] = useDocPreview(projectPrefix);

  const load = () => {
    apiFetch(`${API}/api/reviews?model_urn=${encodeURIComponent(projectPrefix)}`)
      .then(r => r.json()).then(d => setReviews(d.success ? d.reviews : []))
      .catch(() => setReviews([]));
  };
  useEffect(load, [projectPrefix]);

  const act = async (rev, action) => {
    setActing(rev.id);
    try {
      const r = await apiFetch(`${API}/api/reviews/${rev.id}/act`, {
        method: 'POST',
        body: JSON.stringify({ action, comment: comments[rev.id] || '' })
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      toast.success(action === 'approve' ? 'Paso aprobado' : 'Revisión rechazada');
      setComments(prev => ({ ...prev, [rev.id]: '' }));
      load();
    } catch (e) { toast.error(e.message || 'No se pudo registrar la acción'); }
    finally { setActing(null); }
  };

  return (
    <div style={{ padding: 32, flex: 1, overflowY: 'auto' }}>
      <DocQuickView file={preview} projectPrefix={projectPrefix} onClose={closePreview} />
      <div style={{ fontSize: 24, fontWeight: 300, marginBottom: 4 }}>Revisiones</div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
        Flujos de aprobación: selecciona archivos en Archivos y pulsa "Enviar a revisión".
      </div>
      {reviews === null ? (
        <div style={{ textAlign: 'center', padding: 48 }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
      ) : reviews.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#999', fontSize: 13 }}>No hay revisiones aún.</div>
      ) : reviews.map(rev => {
        const chip = STATUS_CHIP[rev.status] || STATUS_CHIP.pending;
        const step = rev.steps[rev.current_step] || {};
        const myTurn = rev.status === 'pending' && (user?.email === step.email || isAdmin);
        return (
          <div key={rev.id} style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #f3f3f3' }}>
              <span style={{ fontSize: 12, color: '#999', fontWeight: 700 }}>RV-{String(rev.id).padStart(3, '0')}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#333', flex: 1 }}>{rev.title}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12, background: chip.bg, color: chip.color }}>{chip.label}</span>
            </div>
            <div style={{ padding: '10px 16px', fontSize: 12, color: '#666', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <span>📄 {rev.items.length} documento{rev.items.length !== 1 ? 's' : ''}:</span>
              {rev.items.map(i => (
                <button key={i.node_id} onClick={() => openDoc(i)} title="Abrir para revisar"
                  style={{ background: '#f0f7fc', border: '1px solid #cfe7f5', color: '#0696d7', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {i.name} (V{i.version || 1}) ↗
                </button>
              ))}
            </div>
            <div style={{ padding: '4px 16px 12px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {rev.steps.map((s, i) => {
                const done = rev.status === 'approved' || i < rev.current_step;
                const active = rev.status === 'pending' && i === rev.current_step;
                const failed = rev.status === 'rejected' && i === rev.current_step;
                return (
                  <React.Fragment key={i}>
                    {i > 0 && <span style={{ color: '#ccc' }}>→</span>}
                    <span title={s.email} style={{
                      fontSize: 12, padding: '3px 10px', borderRadius: 12, fontWeight: 600,
                      background: done ? '#dcfce7' : failed ? '#fee2e2' : active ? '#e8f0fe' : '#f3f4f6',
                      color: done ? '#15803d' : failed ? '#b91c1c' : active ? '#1a56a8' : '#888'
                    }}>
                      {done ? '✓ ' : failed ? '✕ ' : active ? '● ' : ''}{s.name || s.email}
                    </span>
                  </React.Fragment>
                );
              })}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#aaa' }}>{rev.created_by} · {formatDate(rev.created_at)}</span>
            </div>
            {rev.history.filter(h => h.comment).length > 0 && (
              <div style={{ padding: '0 16px 10px', fontSize: 12, color: '#777' }}>
                {rev.history.filter(h => h.comment).map((h, i) => (
                  <div key={i}>💬 <b>{h.by}</b> ({h.event === 'approve' ? 'aprobó' : 'rechazó'}): {h.comment}</div>
                ))}
              </div>
            )}
            {myTurn && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid #f3f3f3', background: '#fafcff', display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={comments[rev.id] || ''} onChange={e => setComments(prev => ({ ...prev, [rev.id]: e.target.value }))}
                  placeholder="Comentario (opcional)…"
                  style={{ flex: 1, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12, outline: 'none' }} />
                <button onClick={() => act(rev, 'approve')} disabled={acting === rev.id}
                  style={{ padding: '7px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Aprobar</button>
                <button onClick={() => act(rev, 'reject')} disabled={acting === rev.id}
                  style={{ padding: '7px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Rechazar</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
