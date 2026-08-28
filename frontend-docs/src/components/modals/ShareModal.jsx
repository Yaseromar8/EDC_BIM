import React from 'react';
import toast from 'react-hot-toast';
import { apiFetch } from '../../utils/apiFetch';
import { API, getInitials } from '../../utils/helpers';

// El backend todavía no persiste ACL por invitado. En vez de aparentar que un
// correo fue invitado, este modal expone únicamente el flujo que sí es seguro:
// enlace público explícito, solo lectura, revocable y con vencimiento.
export default function ShareModal({ isOpen, shareTarget, user, projectPrefix, shareLinkCopied, setShareLinkCopied, onClose, onIrAlTriaje }) {
  const [expiresDays, setExpiresDays] = React.useState(7);
  const [creating, setCreating] = React.useState(false);
  // LA PUERTA SE PREGUNTA ANTES, NO DESPUÉS.
  //
  // Un enlace público es distribución incontrolada: la parte 5 de la ISO 19650
  // exige que la obra haya hecho su triaje de seguridad antes de emitir uno. El
  // backend lo impide -- correctamente-- pero el modal dejaba pulsar «Copiar
  // enlace» y respondía con un aviso rojo que no decía qué hacer: parecía que
  // compartir estuviera roto. Ahora se consulta al abrir, se explica, y se
  // ofrece el camino a quien puede recorrerlo.
  const [puerta, setPuerta] = React.useState({ estado: 'consultando' });

  React.useEffect(() => {
    if (!isOpen) return undefined;
    let vivo = true;
    setPuerta({ estado: 'consultando' });
    apiFetch(`${API}/api/docs/sensibilidad?model_urn=${encodeURIComponent(projectPrefix)}`)
      .then(r => r.json())
      .then(d => {
        if (!vivo) return;
        if (d && d.success && d.sin_evaluar) {
          setPuerta({ estado: 'sin_triaje' });
        } else if (d && d.success && d.triaje && d.triaje.caducado) {
          setPuerta({ estado: 'caducado' });
        } else {
          setPuerta({ estado: 'abierta' });
        }
      })
      .catch(() => { if (vivo) setPuerta({ estado: 'abierta' }); });
    return () => { vivo = false; };
  }, [isOpen, projectPrefix]);

  if (!isOpen || !shareTarget) return null;

  const esAdmin = user?.role === 'admin';
  const bloqueada = puerta.estado === 'sin_triaje' || puerta.estado === 'caducado';

  const handleCopyLink = async () => {
    setCreating(true);
    try {
      const res = await apiFetch(`${API}/api/docs/share`, {
        method: 'POST',
        body: JSON.stringify({
          node_id: shareTarget.id,
          model_urn: projectPrefix,
          shared_by: user?.email || 'Unknown',
          role: 'viewer',
          access_type: 'anyone',
          expires_days: expiresDays,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo generar el enlace.');
      await navigator.clipboard.writeText(`${window.location.origin}/share/${data.share_id}`);
      setShareLinkCopied(true);
      setTimeout(() => setShareLinkCopied(false), 3000);
    } catch (error) {
      toast.error(error.message || 'Error de conexión al generar el enlace.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="share-modal-box" onClick={e => e.stopPropagation()}>
        <div className="share-header"><h2>Compartir &quot;{shareTarget.name.replace(/\/$/, '')}&quot;</h2></div>
        <div style={{ padding: '8px 0', fontSize: 13, color: '#555', lineHeight: 1.55 }}>
          Este piloto crea enlaces públicos de solo lectura. Las invitaciones individuales y los enlaces restringidos se habilitarán cuando exista una lista de acceso persistente. Para usuarios registrados, usa permisos de carpeta.
        </div>

        {bloqueada && (
          <div role="alert" style={{ margin: '4px 0 12px', padding: '12px 14px',
                                     border: '1px solid var(--border-warning, #e6d3a8)',
                                     background: 'var(--bg-warning, #fbf4e6)',
                                     borderRadius: 6, fontSize: 12.5, lineHeight: 1.5,
                                     color: 'var(--text-primary, #16202b)' }}>
            <b>
              {puerta.estado === 'caducado'
                ? 'El triaje de seguridad de esta obra está caducado.'
                : 'Esta obra todavía no tiene hecho el triaje de seguridad.'}
            </b>
            <div style={{ marginTop: 4, color: 'var(--text-secondary, #4a5561)' }}>
              Un enlace público es distribución incontrolada: quien lo tenga, abre.
              La ISO 19650-5 pide decidir antes si la obra maneja información
              delicada. {esAdmin
                ? 'Hazlo una vez y este documento se podrá compartir.'
                : 'Pídeselo a un administrador de la obra.'}
            </div>
            {esAdmin && onIrAlTriaje && (
              <button type="button"
                onClick={() => { onClose(); onIrAlTriaje(); }}
                style={{ marginTop: 10, padding: '7px 14px', border: 'none', borderRadius: 6,
                         background: 'var(--accent)', color: '#fff', fontSize: 12.5,
                         fontWeight: 600, cursor: 'pointer' }}>
                Hacer el triaje de seguridad
              </button>
            )}
          </div>
        )}

        {/* Los transmittals SIGUEN funcionando sin triaje: son canal formal con
            destinatarios, número y acuse. Se dice, para que nadie crea que el
            documento está atrapado. */}
        {bloqueada && (
          <div style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-secondary, #667180)' }}>
            Mientras tanto puedes emitirlo por <b>Transmittal</b>, que es canal formal
            con acuse y no depende del triaje.
          </div>
        )}
        <div className="share-access-list">
          <div className="share-user-item">
            <div className="user-avatar-acc" style={{ width: 32, height: 32, fontSize: 13 }}>{getInitials(user?.email || 'US')}</div>
            <div className="share-user-info"><span className="share-user-name">{user?.name || 'Usuario'} (tú)</span><span className="share-user-email">{user?.email || ''}</span></div>
            <span className="share-user-role">Propietario</span>
          </div>
        </div>
        <div className="share-general-access" style={{ marginTop: 12 }}>
          <div className="share-access-details"><strong>Cualquier persona con el enlace</strong><div className="share-access-desc">Lector; revoca el enlace al terminar el piloto.</div></div>
          <span className="share-user-role">Lector</span>
        </div>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#444' }}>
          <span>El enlace caduca en:</span>
          <select value={expiresDays} onChange={e => setExpiresDays(Number(e.target.value))} disabled={creating}>
            <option value={1}>1 día</option><option value={7}>7 días</option><option value={30}>30 días</option><option value={90}>90 días</option>
            {/* SIN CADUCIDAD: el backend ya lo aceptaba (expires_days 0) y la
                pantalla no lo ofrecía. Hace falta para el uso real que pidió
                el dueño: pegar los enlaces como REFERENCIA en un Excel que
                vive meses — un enlace de 90 días deja el Excel roto en el
                peor momento. Sigue siendo revocable cuando se quiera. */}
            <option value={0}>Sin caducidad</option>
          </select>
        </div>
        <div className="share-footer" style={{ position: 'relative' }}>
          <button className="btn-copy-link"
            disabled={creating || bloqueada || puerta.estado === 'consultando'}
            title={bloqueada ? 'Falta el triaje de seguridad de la obra' : undefined}
            onClick={handleCopyLink}>
            {creating ? 'Creando…' : puerta.estado === 'consultando' ? 'Comprobando…' : 'Copiar enlace'}
          </button>
          {shareLinkCopied && <div style={{ position: 'absolute', top: 50, left: 24, background: '#323232', color: '#fff', padding: '12px 16px', borderRadius: 4 }}>Enlace copiado</div>}
          <button className="btn-share-done" onClick={onClose}>Hecho</button>
        </div>
      </div>
    </div>
  );
}
