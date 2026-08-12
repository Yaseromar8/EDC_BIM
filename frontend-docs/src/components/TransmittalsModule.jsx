// TransmittalsModule.jsx — Emisión formal de documentos (registro inmutable, estilo ACC)
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { API, formatDate, getInitials } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';

export function TransmittalModal({ isOpen, onClose, items, projectPrefix, user, onCreated }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [users, setUsers] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [extEmail, setExtEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSubject(''); setMessage(''); setRecipients([]); setExtEmail('');
    apiFetch(`${API}/api/users`).then(r => r.json())
      .then(d => setUsers(d.users || d || [])).catch(() => setUsers([]));
  }, [isOpen]);

  if (!isOpen) return null;

  const addRecipient = (email, name) => {
    if (!email || recipients.find(r => r.email === email)) return;
    setRecipients(prev => [...prev, { email, name: name || email.split('@')[0] }]);
  };

  const submit = async () => {
    if (!subject.trim()) { toast.error('Falta el asunto'); return; }
    if (!recipients.length) { toast.error('Agrega al menos un destinatario'); return; }
    setSaving(true);
    try {
      const r = await apiFetch(`${API}/api/transmittals`, {
        method: 'POST',
        body: JSON.stringify({
          model_urn: projectPrefix, subject: subject.trim(), message: message.trim(),
          recipients, items
        })
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      // El transmittal existe siempre; el aviso puede haber fallado. Decirlo, en
      // vez de dar la entrega por hecha: quien cree que entrego y no entrego
      // descubre el problema tarde y de la peor manera.
      const tr = `TR-${String(d.number).padStart(3, '0')}`;
      const avisados = d.avisados ?? 0;
      const total = d.destinatarios ?? recipients.length;
      if (avisados === total) {
        toast.success(`${tr} emitido · avisados los ${total} destinatarios`);
      } else if (avisados === 0) {
        toast.error(`${tr} queda registrado, pero NO se pudo avisar a nadie. `
          + `Avísales por tu cuenta.`, { duration: 9000 });
      } else {
        toast(`${tr} emitido · avisados ${avisados} de ${total}. `
          + `A los demás no les llegó el correo.`, { icon: '⚠️', duration: 9000 });
      }
      onCreated?.(); onClose();
    } catch (e) { toast.error(e.message || 'No se pudo emitir'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 540, maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Emitir Transmittal</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#999', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
          <div>
            <label style={{ display: 'block', color: '#666', marginBottom: 6, fontWeight: 600 }}>Asunto</label>
            <input autoFocus value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ej: Entrega planos aprobados — Frente Canal"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, outline: 'none' }} />
          </div>
          <div>
            <label style={{ display: 'block', color: '#666', marginBottom: 6, fontWeight: 600 }}>Mensaje (opcional)</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, outline: 'none', resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', color: '#666', marginBottom: 6, fontWeight: 600 }}>Documentos ({items.length})</label>
            <div style={{ maxHeight: 100, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4 }}>
              {items.map(it => (
                <div key={it.node_id} style={{ padding: '6px 10px', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>V{it.version || 1}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', color: '#666', marginBottom: 6, fontWeight: 600 }}>Destinatarios</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {recipients.map(r => (
                <span key={r.email} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff3e0', color: '#b26a00', padding: '4px 10px', borderRadius: 14, fontSize: 12, fontWeight: 600 }}>
                  {r.name}
                  <button onClick={() => setRecipients(prev => prev.filter(x => x.email !== r.email))} style={{ background: 'none', border: 'none', color: '#b26a00', cursor: 'pointer', padding: 0 }}>×</button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input value={extEmail} onChange={e => setExtEmail(e.target.value)} placeholder="correo@externo.com (Enter para añadir)"
                onKeyDown={e => { if (e.key === 'Enter' && extEmail.includes('@')) { addRecipient(extEmail.trim()); setExtEmail(''); } }}
                style={{ flex: 1, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12, outline: 'none' }} />
            </div>
            <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4 }}>
              {users.filter(u => !recipients.find(r => r.email === u.email)).map(u => (
                <div key={u.email} onClick={() => addRecipient(u.email, u.name)}
                  style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}
                  onMouseOver={e => e.currentTarget.style.background = '#fffaf2'} onMouseOut={e => e.currentTarget.style.background = 'none'}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{getInitials(u.name || u.email)}</span>
                  <span style={{ fontSize: 12 }}>{u.name || '—'} <span style={{ color: '#999', fontSize: 11 }}>{u.email}</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#fcfcfc' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: '#fff', border: '1px solid #dcdcdc', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={submit} disabled={saving} style={{ padding: '8px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Emitiendo…' : 'Emitir transmittal'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TransmittalsView({ projectPrefix }) {
  const [list, setList] = useState(null);
  const [acusando, setAcusando] = useState(null);
  useEffect(() => {
    apiFetch(`${API}/api/transmittals?model_urn=${encodeURIComponent(projectPrefix)}`)
      .then(r => r.json()).then(d => setList(d.success ? d.transmittals : []))
      .catch(() => setList([]));
  }, [projectPrefix]);

  // Acusar recibo: el hecho que convierte "te lo mandé" en "lo recibiste". El
  // servidor decide si puedes (destinatario o admin) y pone la fecha; aquí solo
  // se refleja lo que respondió.
  const acusar = async (t) => {
    setAcusando(t.id);
    try {
      const r = await apiFetch(`${API}/api/transmittals/${t.id}/acuse`, { method: 'POST' });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      setList(prev => prev.map(x => x.id === t.id ? { ...x, acuses: d.acuses } : x));
      toast.success(d.ya_estaba ? 'Ya habías acusado recibo' : 'Recibo acusado');
    } catch (e) {
      toast.error(e.message || 'No se pudo acusar recibo');
    } finally { setAcusando(null); }
  };

  return (
    <div style={{ padding: 32, flex: 1, overflowY: 'auto' }}>
      <div style={{ fontSize: 24, fontWeight: 300, marginBottom: 4 }}>Transmittals</div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
        Registro inmutable de emisiones formales: qué se envió, en qué versión, a quién y cuándo.
      </div>
      {list === null ? (
        <div style={{ textAlign: 'center', padding: 48 }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
      ) : list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#999', fontSize: 13 }}>
          No hay transmittals. Selecciona archivos en Archivos y pulsa "Transmittal".
        </div>
      ) : list.map(t => (
        <div key={t.id} style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, marginBottom: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: 'var(--accent)', padding: '2px 10px', borderRadius: 12 }}>TR-{String(t.number).padStart(3, '0')}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#333', flex: 1 }}>{t.subject}</span>
            <span style={{ fontSize: 11, color: '#aaa' }}>{t.created_by} · {formatDate(t.created_at)}</span>
          </div>
          {t.message && <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>{t.message}</div>}
          <div style={{ fontSize: 12, color: '#555' }}>
            📄 {t.items.map(i => `${i.name} (V${i.version || 1})`).join(', ')}
          </div>
          <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>
            ✉ {t.recipients.map(r => r.name || r.email).join(', ')}
          </div>
          {/* El acuse de recibo separa "yo te lo mandé" de "tú lo recibiste".
              Sin acuse, el registro prueba el envío y nada más — y lo que se
              discute en obra es siempre lo segundo. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10,
                        paddingTop: 10, borderTop: '1px solid var(--divider, #f0f0f0)' }}>
            {(t.acuses || []).length > 0 ? (
              <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}
                title={t.acuses.map(a => `${a.por} · ${formatDate(a.en)}${a.via === 'admin' ? ' (registrado por administración)' : ''}`).join('\n')}>
                ✓ Recibo acusado por {t.acuses.map(a => a.por).join(', ')}
              </span>
            ) : (
              <>
                <span style={{ fontSize: 12, color: 'var(--warning)' }}>Sin acuse de recibo</span>
                <button onClick={() => acusar(t)} disabled={acusando === t.id}
                  style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', cursor: 'pointer',
                           background: 'transparent', color: 'var(--accent)',
                           border: '1px solid var(--border-accent, #cbd2d9)', borderRadius: 4,
                           opacity: acusando === t.id ? 0.6 : 1 }}>
                  {acusando === t.id ? 'Registrando…' : 'Acusar recibo'}
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
