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
import Button from '../../../design/ui/Button';
import StatusChip from '../../../design/ui/StatusChip';
import './ReviewsModule.css';
import {
  chipDeEstado, papelDelPaso, ESTADO_DEL_PASO, botonAprobar, consecuenciaDeAprobar,
  CONSECUENCIA_DE_RECHAZAR, exitoDe, describirEvento, mensajeDeError, avisoDeOtrasRevisiones,
} from '../utils/revisiones';

const TONO = {
  exito: { background: '#e0e3d7', color: '#64744e' },
  peligro: { background: '#fbebeb', color: '#b93535' },
  aviso: { background: '#f9eeda', color: '#734500' },
  neutro: { background: '#f1f0e8', color: '#52524d' },
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

// Los chips son StatusChip (UI polish F3): el tono es un nombre y el color lo
// pone el canon. TONO queda solo para los puntos del historial.
function Chip({ tono = 'neutro', title, children }) {
  return <StatusChip tono={tono} title={title}>{children}</StatusChip>;
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
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'var(--a-surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCerrar}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, background: '#fff', borderRadius: 'var(--a-radius-lg)', border: '1px solid var(--a-border-subtle)', boxShadow: 'var(--a-shadow-lg)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f0e8', fontSize: 15, fontWeight: 600 }}>
          Sustituir al revisor del paso {rev.current_step + 1}
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
          <div style={{ background: '#fbebeb', border: '1px solid #fbebeb', borderRadius: 6, padding: '8px 10px', color: '#993458', fontSize: 12 }}>
            {rev.flujo_motivo || 'La revisión está bloqueada.'}
          </div>
          <div>
            <label style={{ display: 'block', color: '#72706b', marginBottom: 6, fontWeight: 600 }}>
              Revisor actual
            </label>
            <div style={{ color: '#52524d' }}>{paso.name || paso.email || `usuario ${paso.user_id}`}</div>
            <div style={{ color: '#72706b', fontSize: 11, marginTop: 2 }}>Se conserva en el historial de la revisión.</div>
          </div>
          <div>
            <label style={{ display: 'block', color: '#72706b', marginBottom: 6, fontWeight: 600 }}>Nuevo revisor</label>
            <select value={elegido} onChange={e => setElegido(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', border: '1px solid #e8e6dc', borderRadius: 4, fontSize: 13 }}>
              <option value="">Elige a un miembro de la obra…</option>
              {users.filter(u => String(u.id) !== String(paso.user_id)).map(u => (
                <option key={u.id} value={u.id}>{u.name || u.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', color: '#72706b', marginBottom: 6, fontWeight: 600 }}>Motivo</label>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
              placeholder="Por ejemplo: dejó la obra el 15 de agosto"
              style={{ width: '100%', padding: '7px 10px', border: '1px solid #e8e6dc', borderRadius: 4, fontSize: 13, resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f0e8', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button rango="secondary" onClick={onCerrar}>Cancelar</Button>
          <Button rango="danger" cargando={guardando} onClick={enviar}>
            {guardando ? 'Sustituyendo…' : 'Sustituir'}
          </Button>
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
  const confirmacion = useRef(null);

  useEffect(() => {
    vivo.current = true;
    // Si esta revisión deja de verse con una confirmación abierta --Atrás, otra
    // sección--, la confirmación se retira (E1.2 · H6).
    return () => {
      vivo.current = false;
      confirmacion.current?.abort();
    };
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
    // La confirmación se puede retirar: si la revisión deja de verse, se cancela
    // (E1.2 · H6). Y si aun así llegara un «sí» sin la revisión en pantalla, no se actúa.
    const pregunta = new AbortController();
    confirmacion.current = pregunta;
    const ok = await confirmAction({
      title: `${nombre} · ${rev.codigo}`,
      message: (accion === 'reject' ? CONSECUENCIA_DE_RECHAZAR : consecuenciaDeAprobar(aprobar))
        + (nota ? ` Comentario: «${nota}».` : ''),
      confirmText: nombre,
      danger: accion === 'reject',
      signal: pregunta.signal,
    });
    if (confirmacion.current === pregunta) confirmacion.current = null;
    if (!ok || !vivo.current) return;
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
    <Button rango="ghost" tamano="sm" onClick={onVolver} className="rev-volver">← Revisiones</Button>
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
              <Button rango="danger" onClick={() => setSustituyendo(true)}>
                Sustituir revisor…
              </Button>
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
              <Button rango="primary" onClick={() => actuar('approve')}
                      disabled={!aprobar.disponible} cargando={enviando}>
                {enviando ? 'Enviando…' : botonAprobar(aprobar.tipo)}
              </Button>
            )}
            {rechazar.disponible && (
              <Button rango="danger" onClick={() => actuar('reject')} disabled={enviando}
                      title={CONSECUENCIA_DE_RECHAZAR}>
                Rechazar
              </Button>
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
                <button type="button" onClick={() => openDoc(it)} className="rev-doc"
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
              {/* E1.2 · H7-A: el mismo documento en otra revisión en curso. */}
              {avisoDeOtrasRevisiones(it.tambien_en) && (
                <span style={S.otraRevision}
                      title={(it.tambien_en || []).map(o => `${o.codigo} · ${o.title}`).join('\n')}>
                  {avisoDeOtrasRevisiones(it.tambien_en)}
                </span>
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
                  <div>Plazo al empezar su turno: {p.dias} {p.dias_tipo === 'laborables' ? 'días hábiles' : 'días calendario'}</div>
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
  pagina: { padding: 32, flex: 1, overflowY: 'auto', fontSize: 13, color: '#333330' },
  cabecera: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 4 },
  codigo: { fontSize: 13, color: '#72706b', fontWeight: 700 },
  titulo: { margin: 0, fontSize: 20, fontWeight: 600, color: '#141413', flex: 1, minWidth: 200 },
  meta: { fontSize: 12, color: '#72706b', marginBottom: 16 },
  leve: { fontSize: 11, color: '#72706b' },
  error: { marginTop: 12, padding: '12px 14px', borderRadius: 6, background: '#fbebeb',
           border: '1px solid #fbebeb', color: '#993458' },
  bloqueo: { marginBottom: 14, padding: '10px 12px', borderRadius: 6, background: '#fbebeb',
             border: '1px solid #fbebeb', color: '#993458', fontSize: 12 },
  nota: { marginBottom: 14, padding: '8px 12px', borderRadius: 6, background: '#faf9f5',
          border: '1px solid #f1f0e8', color: '#52524d', fontSize: 12 },
  aviso: { marginBottom: 10, padding: '8px 10px', borderRadius: 6, background: '#faf9f5',
           border: '1px solid #f9eeda', color: '#734500', fontSize: 12 },
  seccion: { background: '#fff', border: '1px solid #e8e6dc', borderRadius: 8, marginBottom: 14 },
  seccionTitulo: { margin: 0, padding: '10px 16px', fontSize: 13, fontWeight: 700, color: '#333330',
                   borderBottom: '1px solid #f1f0e8' },
  consecuencia: { margin: '0 0 10px', fontSize: 12, color: '#52524d', lineHeight: 1.5 },
  etiqueta: { display: 'block', color: '#72706b', marginBottom: 6, fontWeight: 600, fontSize: 12 },
  texto: { width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid #e8e6dc',
           borderRadius: 4, fontSize: 13, resize: 'vertical' },
  botonera: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  lista: { listStyle: 'none', margin: 0, padding: 0 },
  fila: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '5px 0' },
  docInvalido: { background: '#fbebeb', border: '1px solid #fbebeb', color: '#993458',
                 padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  otraRevision: { background: '#faf9f5', border: '1px solid #f9eeda', color: '#734500',
                  padding: '1px 8px', borderRadius: 10, fontSize: 11 },
  paso: { padding: '6px 0', borderBottom: '1px solid #f1f0e8' },
  numero: { width: 22, height: 22, borderRadius: '50%', background: '#f1f0e8', color: '#507294',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
            fontWeight: 700 },
  pasoDetalle: { marginLeft: 30, fontSize: 12, color: '#72706b', display: 'flex', flexDirection: 'column', gap: 2 },
  evento: { display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid #f1f0e8' },
  punto: { width: 10, height: 10, borderRadius: '50%', marginTop: 4, flex: '0 0 auto' },
  cita: { marginTop: 2, fontSize: 12, color: '#52524d', fontStyle: 'italic' },
};
