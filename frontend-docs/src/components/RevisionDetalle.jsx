// RevisionDetalle.jsx — el detalle de UNA revisión (REVIEWS · E1)
//
// Documentos con su versión fijada, pasos con su papel y su responsable, plazo,
// historial completo y la zona de acción. QUÉ puede hacer quien mira lo decide el
// servidor en `revision.acciones`, con las mismas reglas que `/act`: aquí sólo se
// le pone nombre, se confirma y se envía. Si al actuar el servidor dice otra
// cosa, manda el servidor y la revisión se vuelve a cargar.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { API, formatDate } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import { confirmAction } from '../utils/confirm';
import { etiquetaDeVersion } from '../utils/vistaPrevia';
import DocQuickView from './DocQuickView';
import useDocPreview from '../hooks/useDocPreview';
import {
  chipDeEstado, papelDelPaso, ESTADO_DEL_PASO, botonAprobar, consecuenciaDeAprobar,
  CONSECUENCIA_DE_RECHAZAR, exitoDe, describirEvento, mensajeDeError,
} from '../utils/revisiones';

const TONO = {
  exito: { background: '#dcfce7', color: '#15803d' },
  peligro: { background: '#fee2e2', color: '#b91c1c' },
  aviso: { background: '#fff7e0', color: '#b26a00' },
  neutro: { background: '#f3f4f6', color: '#4b5563' },
};

const TONO_DEL_PASO = {
  hecho: 'exito', actual: 'aviso', rechazado: 'peligro', pendiente: 'neutro', no_alcanzado: 'neutro',
};

const ACTO = { CONFORME: 'Conformidad', APRUEBA: 'Aprobación', RECHAZA: 'Rechazo' };

async function cuerpoDe(r) {
  try { return await r.json(); } catch { return null; }
}

function nombreDe(x) {
  if (!x) return '—';
  return x.name || x.email || (x.user_id ? `usuario ${x.user_id}` : '—');
}

function Chip({ tono = 'neutro', title, children }) {
  return (
    <span title={title} style={{ ...TONO[tono], fontSize: 11, fontWeight: 700, padding: '3px 10px',
                                 borderRadius: 12, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function Seccion({ titulo, children }) {
  return (
    <section style={S.seccion}>
      <h3 style={S.seccionTitulo}>{titulo}</h3>
      <div style={{ padding: '10px 16px' }}>{children}</div>
    </section>
  );
}

// Sustituir al revisor de un paso BLOQUEADO.
//
// El motivo es obligatorio, igual que en el backend: una sustitución sin
// explicación deja el historial contando QUÉ pasó y no POR QUÉ, que es la mitad
// inútil de una trazabilidad. Y el revisor anterior no desaparece: queda en el
// paso y en el historial.
function SustituirRevisor({ rev, onCerrar, onHecho }) {
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

  // SOLO PARTICIPANTES ACTIVOS DE LA OBRA DE LA REVISIÓN (E1.1 · H3b). La lista
  // decía «Elige a un miembro de la obra» y ofrecía el padrón entero, y el
  // servidor rechaza a quien no participa. La sustitución en sí no cambia.
  const obraDeLaRevision = rev.obra_id || rev.model_urn;
  useEffect(() => {
    apiFetch(`${API}/api/projects/${encodeURIComponent(obraDeLaRevision)}/miembros`)
      .then(r => (r.ok ? r.json() : { miembros: [] }))
      .then(d => setUsers(d.miembros || [])).catch(() => setUsers([]));
  }, [obraDeLaRevision]);

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

export default function RevisionDetalle({ rid, projectPrefix, onVolver, onCambio }) {
  const [carga, setCarga] = useState({ cargando: true, rev: null, error: null });
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [sustituyendo, setSustituyendo] = useState(false);
  const [preview, openDoc, closePreview] = useDocPreview(projectPrefix);
  const vivo = useRef(true);
  const peticion = useRef(0);

  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  const cargar = useCallback(async () => {
    const n = ++peticion.current;
    setCarga(c => ({ ...c, cargando: true }));
    try {
      const r = await apiFetch(`${API}/api/reviews/${rid}?model_urn=${encodeURIComponent(projectPrefix)}`);
      const d = await cuerpoDe(r);
      if (!vivo.current || n !== peticion.current) return;
      if (!r.ok || !d?.success) {
        setCarga({ cargando: false, rev: null, error: mensajeDeError(r.status, d).texto });
      } else {
        setCarga({ cargando: false, rev: d.revision, error: null });
      }
    } catch {
      if (vivo.current && n === peticion.current) {
        setCarga({ cargando: false, rev: null, error: mensajeDeError(0, null).texto });
      }
    }
  }, [rid, projectPrefix]);

  useEffect(() => { setComentario(''); cargar(); }, [cargar]);

  const actuar = async (accion) => {
    const rev = carga.rev;
    if (!rev || enviando) return;
    const aprobar = rev.acciones?.aprobar || {};
    const nombre = accion === 'reject' ? 'Rechazar' : botonAprobar(aprobar.tipo);
    const nota = comentario.trim();
    const ok = await confirmAction({
      title: `${nombre} · ${rev.codigo}`,
      message: (accion === 'reject' ? CONSECUENCIA_DE_RECHAZAR : consecuenciaDeAprobar(aprobar))
        + (nota ? ` Comentario: «${nota}».` : ''),
      confirmText: nombre,
      danger: accion === 'reject',
    });
    if (!ok) return;
    setEnviando(true);
    try {
      const r = await apiFetch(`${API}/api/reviews/${rev.id}/act`, {
        method: 'POST',
        body: JSON.stringify({ action: accion, comment: nota }),
      });
      const d = await cuerpoDe(r);
      if (!r.ok || !d?.success) {
        const m = mensajeDeError(r.status, d);
        toast.error(m.texto);
        if (m.recargar) await cargar();
        return;
      }
      toast.success(exitoDe(accion, aprobar.tipo));
      setComentario('');
      await cargar();
      onCambio?.();
    } catch {
      toast.error(mensajeDeError(0, null).texto);
    } finally {
      if (vivo.current) setEnviando(false);
    }
  };

  const { cargando, rev, error } = carga;
  const volver = (
    <button type="button" onClick={onVolver} style={S.volver}>← Revisiones</button>
  );

  if (!rev) {
    return (
      <div style={S.pagina}>
        {volver}
        {cargando
          ? <div style={{ textAlign: 'center', padding: 48 }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
          : <div role="alert" style={S.error}>{error || 'No se pudo cargar la revisión.'}</div>}
      </div>
    );
  }

  const chip = chipDeEstado(rev);
  const acciones = rev.acciones || {};
  const aprobar = acciones.aprobar || {};
  const rechazar = acciones.rechazar || {};
  const puedeActuar = Boolean(aprobar.disponible || rechazar.disponible);
  const bloqueada = rev.status === 'pending' && rev.flujo === 'BLOQUEADA';
  const historia = (rev.history || []).map(describirEvento);

  return (
    <div style={S.pagina}>
      <DocQuickView file={preview} projectPrefix={projectPrefix} onClose={closePreview} />
      {volver}

      <header style={S.cabecera}>
        <span style={S.codigo}>{rev.codigo}</span>
        <h2 style={S.titulo}>{rev.title}</h2>
        {rev.me_toca && <Chip tono="aviso">Te toca</Chip>}
        <Chip tono={chip.tono}>{chip.etiqueta}</Chip>
        {cargando && <span style={S.leve}>actualizando…</span>}
      </header>
      <div style={S.meta}>
        Creada por {rev.created_by || '—'} · {formatDate(rev.created_at)}
        {rev.cerrada_en && <> · cerrada {formatDate(rev.cerrada_en)}</>}
        {rev.plantilla_nombre && <> · flujo «{rev.plantilla_nombre}» v{rev.plantilla_version}</>}
      </div>

      {bloqueada && (
        <div role="alert" style={S.bloqueo}>
          <b>La revisión no puede avanzar.</b> {rev.flujo_motivo}
          {acciones.sustituir && (
            <div style={{ marginTop: 8 }}>
              <button type="button" onClick={() => setSustituyendo(true)} style={S.botonPeligro}>
                Sustituir revisor…
              </button>
            </div>
          )}
        </div>
      )}

      {puedeActuar && (
        <Seccion titulo="Te toca actuar">
          {aprobar.disponible && <p style={S.consecuencia}>{consecuenciaDeAprobar(aprobar)}</p>}
          {!aprobar.disponible && aprobar.motivo_no && (
            <div style={S.aviso}>
              «{botonAprobar(aprobar.tipo)}» no está disponible: {aprobar.motivo_no}
            </div>
          )}
          <label htmlFor={`comentario-${rev.id}`} style={S.etiqueta}>Comentario (opcional)</label>
          <textarea id={`comentario-${rev.id}`} value={comentario} rows={2} maxLength={2000}
                    disabled={enviando} onChange={e => setComentario(e.target.value)}
                    placeholder="Queda en el historial de la revisión"
                    style={S.texto} />
          <div style={S.botonera}>
            {aprobar.tipo && (
              <button type="button" onClick={() => actuar('approve')}
                      disabled={!aprobar.disponible || enviando}
                      style={{ ...S.botonPrincipal, opacity: !aprobar.disponible || enviando ? 0.5 : 1,
                               cursor: !aprobar.disponible || enviando ? 'not-allowed' : 'pointer' }}>
                {enviando ? 'Enviando…' : botonAprobar(aprobar.tipo)}
              </button>
            )}
            {rechazar.disponible && (
              <button type="button" onClick={() => actuar('reject')} disabled={enviando}
                      title={CONSECUENCIA_DE_RECHAZAR}
                      style={{ ...S.botonPeligro, opacity: enviando ? 0.5 : 1 }}>
                Rechazar
              </button>
            )}
          </div>
        </Seccion>
      )}
      {!puedeActuar && rev.status === 'pending' && !bloqueada && acciones.motivo && (
        <div style={S.nota}>{acciones.motivo}</div>
      )}

      <Seccion titulo={`Documentos (${(rev.items || []).length})`}>
        <ul style={S.lista}>
          {(rev.items || []).map((it, n) => (
            <li key={`${it.node_id}-${n}`} style={S.fila}>
              {it.asociacion_valida === false ? (
                // Sin versión válida no se ofrece abrirlo: la previsualización
                // resuelve por la versión y enseñaría otro documento con este nombre.
                <span style={S.docInvalido}
                      title="Esta revisión no tiene fijada una versión válida de este documento">
                  {it.name} · sin versión válida
                </span>
              ) : (
                <button type="button" onClick={() => openDoc(it)} style={S.docBoton}
                        title="Abrir la versión que se revisa">
                  {it.name}
                </button>
              )}
              {it.asociacion_valida !== false && <Chip>{etiquetaDeVersion(it)}</Chip>}
              {it.es_version_vigente === false && (
                <Chip tono="aviso" title="Se subió una versión más reciente después de mandar esto a revisión">
                  hay v{it.version_vigente_numero}
                </Chip>
              )}
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo="Pasos">
        <ol style={S.lista}>
          {(rev.pasos || []).map(p => (
            <li key={p.numero} style={S.paso}>
              <div style={S.fila}>
                <span style={S.numero}>{p.numero}</span>
                <span style={{ fontWeight: 600 }}>{p.etiqueta ? `${p.etiqueta} — ` : ''}{p.persona}</span>
                <Chip>{papelDelPaso(p)}</Chip>
                <Chip tono={TONO_DEL_PASO[p.estado] || 'neutro'}>{ESTADO_DEL_PASO[p.estado] || p.estado}</Chip>
              </div>
              <div style={S.pasoDetalle}>
                {p.estado === 'actual' && (p.vence
                  ? <div>Plazo: <b>{formatDate(p.vence)}</b></div>
                  : <div>Sin plazo</div>)}
                {p.estado === 'pendiente' && p.dias && (
                  <div>Plazo al empezar su turno: {p.dias} días calendario</div>
                )}
                {p.acto && (
                  <div>
                    {ACTO[p.acto.emitido] || (p.acto.event === 'reject' ? 'Rechazo' : 'Aprobación')}
                    {' '}de {p.acto.by || '—'}{p.acto.at ? ` · ${formatDate(p.acto.at)}` : ''}
                    {p.acto.comment ? ` — «${p.acto.comment}»` : ''}
                  </div>
                )}
                {(p.sustituciones || []).map((s, i) => (
                  <div key={i}>
                    Sustitución: {nombreDe(s.from)} → {nombreDe(s.to)}, por {s.by || '—'}
                    {s.at ? ` · ${formatDate(s.at)}` : ''}{s.reason ? ` — ${s.reason}` : ''}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </Seccion>

      <Seccion titulo="Historial">
        <ol style={S.lista}>
          {historia.map((h, i) => (
            <li key={i} style={S.evento}>
              <span aria-hidden="true" style={{ ...S.punto, ...TONO[h.tono] }} />
              <div>
                <div>{h.texto}</div>
                <div style={S.leve}>
                  {h.at ? formatDate(h.at) : ''}{h.vence ? ` · plazo ${formatDate(h.vence)}` : ''}
                </div>
                {h.detalle && <div style={S.cita}>{h.detalle}</div>}
              </div>
            </li>
          ))}
          {!historia.length && <li style={S.leve}>Sin eventos.</li>}
        </ol>
      </Seccion>

      {sustituyendo && (
        <SustituirRevisor rev={rev} onCerrar={() => setSustituyendo(false)}
                          onHecho={() => { cargar(); onCambio?.(); }} />
      )}
    </div>
  );
}

const S = {
  pagina: { padding: 32, flex: 1, overflowY: 'auto', fontSize: 13, color: '#333' },
  volver: { background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', padding: 0, marginBottom: 12 },
  cabecera: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 4 },
  codigo: { fontSize: 13, color: '#999', fontWeight: 700 },
  titulo: { margin: 0, fontSize: 20, fontWeight: 600, color: '#222', flex: 1, minWidth: 200 },
  meta: { fontSize: 12, color: '#888', marginBottom: 16 },
  leve: { fontSize: 11, color: '#999' },
  error: { marginTop: 12, padding: '12px 14px', borderRadius: 6, background: '#fff1f2',
           border: '1px solid #fecdd3', color: '#9f1239' },
  bloqueo: { marginBottom: 14, padding: '10px 12px', borderRadius: 6, background: '#fff1f2',
             border: '1px solid #fecdd3', color: '#9f1239', fontSize: 12 },
  nota: { marginBottom: 14, padding: '8px 12px', borderRadius: 6, background: '#f5f7fa',
          border: '1px solid #e5e9f0', color: '#555', fontSize: 12 },
  aviso: { marginBottom: 10, padding: '8px 10px', borderRadius: 6, background: '#fffaf0',
           border: '1px solid #f0d9a0', color: '#8a5a12', fontSize: 12 },
  seccion: { background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, marginBottom: 14 },
  seccionTitulo: { margin: 0, padding: '10px 16px', fontSize: 13, fontWeight: 700, color: '#374151',
                   borderBottom: '1px solid #f3f3f3' },
  consecuencia: { margin: '0 0 10px', fontSize: 12, color: '#555', lineHeight: 1.5 },
  etiqueta: { display: 'block', color: '#666', marginBottom: 6, fontWeight: 600, fontSize: 12 },
  texto: { width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid #ddd',
           borderRadius: 4, fontSize: 13, resize: 'vertical' },
  botonera: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  botonPrincipal: { padding: '8px 18px', background: '#16a34a', color: '#fff', border: 'none',
                    borderRadius: 4, fontSize: 13, fontWeight: 700 },
  botonPeligro: { padding: '8px 18px', background: '#dc2626', color: '#fff', border: 'none',
                  borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  lista: { listStyle: 'none', margin: 0, padding: 0 },
  fila: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '5px 0' },
  docBoton: { background: '#f0f7fc', border: '1px solid #cfe7f5', color: 'var(--accent)',
              padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  docInvalido: { background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239',
                 padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  paso: { padding: '6px 0', borderBottom: '1px solid #f5f5f5' },
  numero: { width: 22, height: 22, borderRadius: '50%', background: '#eef2f7', color: '#1a56a8',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
            fontWeight: 700 },
  pasoDetalle: { marginLeft: 30, fontSize: 12, color: '#666', display: 'flex', flexDirection: 'column', gap: 2 },
  evento: { display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid #f7f7f7' },
  punto: { width: 10, height: 10, borderRadius: '50%', marginTop: 4, flex: '0 0 auto' },
  cita: { marginTop: 2, fontSize: 12, color: '#555', fontStyle: 'italic' },
};
