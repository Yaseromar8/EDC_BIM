// ReviewsModule.jsx — Flujos de revisión y aprobación (ISO 19650, estilo ACC Reviews)
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { API, formatDate, getInitials } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import DocQuickView from './DocQuickView';
import useDocPreview from '../hooks/useDocPreview';

const STATUS_CHIP = {
  pending: { label: 'En revisión', bg: '#fff7e0', color: '#b26a00' },
  approved: { label: 'Aprobada', bg: '#dcfce7', color: '#15803d' },
  rejected: { label: 'Rechazada', bg: '#fee2e2', color: '#b91c1c' },
};

// ── Modal: enviar documentos a revisión ──
export function ReviewModal({ isOpen, onClose, items, projectPrefix, onCreated }) {
  const [title, setTitle] = useState('');
  const [users, setUsers] = useState([]);
  const [steps, setSteps] = useState([]);
  const [finalStatus, setFinalStatus] = useState('SHARED');
  const [idoneidad, setIdoneidad] = useState('');
  const [codigos, setCodigos] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(''); setSteps([]); setFinalStatus('SHARED'); setIdoneidad('');
    apiFetch(`${API}/api/users`).then(r => r.json())
      .then(d => setUsers(d.users || d || [])).catch(() => setUsers([]));
    // El catalogo de idoneidad es de la obra: lo que se audita es lo que diga
    // el plan de ejecucion BIM del proyecto, no una lista fija del programa.
    apiFetch(`${API}/api/docs/idoneidad?model_urn=${encodeURIComponent(projectPrefix)}`)
      .then(r => r.json()).then(d => setCodigos(d.codigos || [])).catch(() => setCodigos([]));
  }, [isOpen, projectPrefix]);

  if (!isOpen) return null;

  const submit = async () => {
    if (!title.trim()) { toast.error('Ponle un título a la revisión'); return; }
    if (!steps.length) { toast.error('Agrega al menos un revisor'); return; }
    if (steps.some(s => !s.id)) {
      toast.error('Algún revisor no se pudo identificar. Recarga la página e inténtalo de nuevo.');
      return;
    }
    // Publicar exige decir para que queda autorizado. Se avisa AQUI y no al
    // aprobar: enterarse cuando ya han firmado tres revisores es tarde.
    if (finalStatus === 'PUBLISHED' && !idoneidad) {
      toast.error('Elige para qué quedará autorizado al publicarse'); return;
    }
    setSaving(true);
    try {
      const r = await apiFetch(`${API}/api/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          model_urn: projectPrefix, title: title.trim(), items,
          // `user_id` es la IDENTIDAD del revisor; `email` y `name` van como
          // instantanea de a quien se le pidio y con que nombre, aunque esa
          // persona se llame distinto dentro de dos anos. Antes solo se
          // mandaban esos dos, y quien podia firmar se decidia comparando
          // correo O NOMBRE: dos personas llamadas igual eran las dos
          // candidatas al mismo paso.
          steps: steps.map(s => ({
            user_id: s.id, email: s.email, name: s.name,
            ...(s.dias ? { dias: Number(s.dias) } : {}),
          })),
          final_status: finalStatus, codigo_idoneidad: idoneidad || undefined
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
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>V{it.version || 1}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', color: '#666', marginBottom: 6, fontWeight: 600 }}>
              Secuencia de revisores (en orden)
              {/* Se dice aquí y no sólo en el tooltip: un plazo que el usuario
                  cree en días hábiles y el sistema cuenta en naturales es una
                  discusión garantizada la primera vez que uno vence en sábado. */}
              <span style={{ fontWeight: 400, color: '#999', fontSize: 11 }}> · el plazo se cuenta en días calendario (naturales)</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {steps.map((s, i) => (
                <span key={s.id || s.email} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eef2f7', color: '#1a56a8', padding: '4px 10px', borderRadius: 14, fontSize: 12, fontWeight: 600 }}>
                  {i + 1}. {s.name || s.email}
                  {/* El plazo del paso. Se cuenta desde que EMPIEZA su turno,
                      no desde que se crea la revisión: cuando se crea no se
                      sabe cuándo le tocará al paso 3. Vacío = sin plazo. */}
                  <input
                    type="number" min="1" placeholder="d. cal." value={s.dias || ''}
                    onChange={e => setSteps(prev => prev.map((x, j) =>
                      j === i ? { ...x, dias: e.target.value } : x))}
                    title="Días CALENDARIO de plazo para este paso (opcional). Son días naturales: no hay calendario de días hábiles, así que un plazo de 3 días vence en 3 días aunque caigan en fin de semana."
                    style={{ width: 52, border: '1px solid #c8d6e8', borderRadius: 8, padding: '1px 5px', fontSize: 11, color: '#1a56a8', background: '#fff' }}
                  />
                  <button onClick={() => setSteps(prev => prev.filter((_x, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#1a56a8', cursor: 'pointer', padding: 0, fontSize: 13 }}>×</button>
                </span>
              ))}
              {!steps.length && <span style={{ color: '#aaa', fontSize: 12 }}>Haz clic en un usuario para añadirlo como paso…</span>}
            </div>
            <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4 }}>
              {users.filter(u => !steps.find(s => s.id === u.id)).map(u => (
                <div key={u.email} onClick={() => setSteps(prev => [...prev, { id: u.id, email: u.email, name: u.name, dias: '' }])}
                  style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}
                  onMouseOver={e => e.currentTarget.style.background = '#f4f6f9'} onMouseOut={e => e.currentTarget.style.background = 'none'}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{getInitials(u.name || u.email)}</span>
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
                  {/* Al cambiar el destino se limpia el codigo: el desplegable
                      se filtra por familia, asi que el codigo viejo desaparecia
                      de las opciones pero seguia en el estado. El usuario veia un
                      selector en blanco, pulsaba, y recibia un error del servidor
                      que no cuadraba con lo que tenia delante. */}
                  <input type="radio" checked={finalStatus === v} onChange={() => { setFinalStatus(v); setIdoneidad(''); }} /> {l}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', color: '#666', marginBottom: 6, fontWeight: 600 }}>
              Al aprobarse, ¿para qué queda autorizado?
            </label>
            <select
              value={idoneidad}
              onChange={e => setIdoneidad(e.target.value)}
              style={{ width: '100%', padding: '7px 9px', border: '1px solid #dcdcdc', borderRadius: 4, fontSize: 13 }}
            >
              <option value="">{finalStatus === 'PUBLISHED' ? '— Obligatorio al publicar —' : '— Sin especificar —'}</option>
              {codigos.filter(c => c.familia === (finalStatus === 'PUBLISHED' ? 'publicado' : 'compartido')).map(c => (
                <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.etiqueta}</option>
              ))}
            </select>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#888', lineHeight: 1.5 }}>
              El estado dice dónde está el documento; esto dice para qué puede usarse.
              Un plano publicado «solo para información» no autoriza a construir.
            </p>
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#fcfcfc' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: '#fff', border: '1px solid #dcdcdc', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={submit} disabled={saving} style={{ padding: '8px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Creando…' : 'Iniciar revisión'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Vista: listado de revisiones + aprobar/rechazar ──
function SustituirRevisor({ rev, projectPrefix, onCerrar, onHecho }) {
  /* Sustituir al revisor de un paso BLOQUEADO.
   *
   * El motivo es obligatorio, igual que en el backend: una sustitución sin
   * explicación deja el historial contando QUÉ pasó y no POR QUÉ, que es la
   * mitad inútil de una trazabilidad. Y el revisor anterior no desaparece:
   * queda en el paso y en el historial.
   */
  const [users, setUsers] = useState([]);
  const [elegido, setElegido] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const paso = rev.steps[rev.current_step] || {};

  useEffect(() => {
    apiFetch(`${API}/api/users`).then(r => r.json())
      .then(d => setUsers(d.users || d || [])).catch(() => setUsers([]));
  }, []);

  const enviar = async () => {
    if (!elegido) { toast.error('Elige al nuevo revisor'); return; }
    if (!motivo.trim()) { toast.error('Explica por qué se sustituye'); return; }
    setGuardando(true);
    try {
      const r = await apiFetch(`${API}/api/reviews/${rev.id}/reasignar`, {
        method: 'POST',
        body: JSON.stringify({ user_id: Number(elegido), motivo: motivo.trim() }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      toast.success('Revisor sustituido');
      onHecho?.(); onCerrar();
    } catch (e) { toast.error(e.message || 'No se pudo sustituir'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCerrar}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, background: '#fff', borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #eee', fontSize: 15, fontWeight: 600 }}>
          Sustituir al revisor del paso {rev.current_step + 1}
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
          <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 6, padding: '8px 10px', color: '#9f1239', fontSize: 12 }}>
            {rev.flujo_motivo || 'La revisión está bloqueada.'}
          </div>
          <div>
            <label style={{ display: 'block', color: '#666', marginBottom: 6, fontWeight: 600 }}>
              Revisor actual
            </label>
            <div style={{ color: '#555' }}>{paso.name || paso.email || `usuario ${paso.user_id}`}</div>
            <div style={{ color: '#999', fontSize: 11, marginTop: 2 }}>Se conserva en el historial de la revisión.</div>
          </div>
          <div>
            <label style={{ display: 'block', color: '#666', marginBottom: 6, fontWeight: 600 }}>Nuevo revisor</label>
            <select value={elegido} onChange={e => setElegido(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13 }}>
              <option value="">Elige a un miembro de la obra…</option>
              {users.filter(u => String(u.id) !== String(paso.user_id)).map(u => (
                <option key={u.id} value={u.id}>{u.name || u.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', color: '#666', marginBottom: 6, fontWeight: 600 }}>Motivo</label>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
              placeholder="Por ejemplo: dejó la obra el 15 de agosto"
              style={{ width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCerrar} style={{ padding: '7px 14px', background: 'none', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={enviar} disabled={guardando}
            style={{ padding: '7px 16px', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {guardando ? 'Sustituyendo…' : 'Sustituir'}
          </button>
        </div>
      </div>
    </div>
  );
}


export function ReviewsView({ projectPrefix, user, isAdmin }) {
  const [reviews, setReviews] = useState(null);
  const [comments, setComments] = useState({}); // { reviewId: texto }
  const [acting, setActing] = useState(null);
  const [sustituyendo, setSustituyendo] = useState(null);
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
        const bloqueada = rev.status === 'pending' && rev.flujo === 'BLOQUEADA';
        const chip = bloqueada
          ? { label: 'Bloqueada', bg: '#fee2e2', color: '#b91c1c' }
          : (STATUS_CHIP[rev.status] || STATUS_CHIP.pending);
        const step = rev.steps[rev.current_step] || {};
        // La interfaz usa la misma autoridad que el backend. Si el paso nuevo
        // trae user_id, correo y nombre son solo etiquetas históricas y nunca
        // deciden quién puede actuar. El respaldo se conserva sólo para pasos
        // legacy que todavía no tienen identidad estructurada.
        const pasoEsMio = step.user_id
          ? String(user?.id || '') === String(step.user_id)
          : (step.email
              ? String(user?.email || '').toLowerCase() === String(step.email).toLowerCase()
              : Boolean(step.name && user?.name && step.name === user.name));
        const myTurn = rev.status === 'pending' && !bloqueada && (pasoEsMio || isAdmin);
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
                  style={{ background: '#f0f7fc', border: '1px solid #cfe7f5', color: 'var(--accent)', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
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
                      background: done ? '#dcfce7' : failed ? '#fee2e2' : active ? '#eef2f7' : '#f3f4f6',
                      color: done ? '#15803d' : failed ? '#b91c1c' : active ? '#1a56a8' : '#888'
                    }}>
                      {done ? '✓ ' : failed ? '✕ ' : active ? '● ' : ''}{s.name || s.email}
                    </span>
                  </React.Fragment>
                );
              })}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#aaa' }}>{rev.created_by} · {formatDate(rev.created_at)}</span>
            </div>
            {rev.status === 'pending' && rev.paso_vence_en && (
              <div style={{ padding: '0 16px 10px', fontSize: 12, color: '#6b7280' }}>
                Plazo del paso actual: <b>{formatDate(rev.paso_vence_en)}</b>
              </div>
            )}
            {bloqueada && (
              <div role="alert" style={{ margin: '0 16px 12px', padding: '9px 11px', borderRadius: 6, background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', fontSize: 12 }}>
                <b>La revisión no puede avanzar.</b>{rev.flujo_motivo ? ` ${rev.flujo_motivo}` : ''}
                {/* La salida sólo aparece para quien puede tomarla, y sólo
                    aquí: sustituir a un revisor no es administrar el flujo, es
                    desatascar uno concreto que está parado. */}
                {isAdmin && (
                  <div style={{ marginTop: 8 }}>
                    <button onClick={() => setSustituyendo(rev)}
                      style={{ padding: '5px 12px', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Sustituir revisor…
                    </button>
                  </div>
                )}
              </div>
            )}
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

      {sustituyendo && (
        <SustituirRevisor
          rev={sustituyendo}
          projectPrefix={projectPrefix}
          onCerrar={() => setSustituyendo(null)}
          onHecho={load}
        />
      )}
    </div>
  );
}
