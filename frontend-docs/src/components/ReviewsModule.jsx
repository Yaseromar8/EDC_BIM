// ReviewsModule.jsx — Flujos de revisión y aprobación (ISO 19650, estilo ACC Reviews)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { API, formatDate, getInitials } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import RevisionDetalle from './RevisionDetalle';
import {
  FILTROS, leerEnlace, conRevision, chipDeEstado, codigoDe, mensajeDeError,
} from '../utils/revisiones';

// ── Modal: enviar documentos a revisión ──
export function ReviewModal({ isOpen, onClose, items, projectPrefix, onCreated }) {
  const [title, setTitle] = useState('');
  const [users, setUsers] = useState([]);
  const [steps, setSteps] = useState([]);
  const [finalStatus, setFinalStatus] = useState('SHARED');
  const [idoneidad, setIdoneidad] = useState('');
  const [codigos, setCodigos] = useState([]);
  const [saving, setSaving] = useState(false);
  // GAP 06 · aplicar una plantilla. `plantillaId` viaja al servidor, que vuelve
  // a resolverla y sella la procedencia; los pasos que se ven aqui son solo la
  // PREVISUALIZACION de lo que va a salir.
  const [plantillas, setPlantillas] = useState([]);
  const [plantillaId, setPlantillaId] = useState('');
  const [avisoPlantilla, setAvisoPlantilla] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setTitle(''); setSteps([]); setFinalStatus('SHARED'); setIdoneidad('');
    setPlantillaId(''); setAvisoPlantilla('');
    apiFetch(`${API}/api/review-templates?model_urn=${encodeURIComponent(projectPrefix)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setPlantillas((d?.plantillas || []).filter(p => p.activa)))
      .catch(() => setPlantillas([]));
    apiFetch(`${API}/api/users`).then(r => r.json())
      .then(d => setUsers(d.users || d || [])).catch(() => setUsers([]));
    // El catalogo de idoneidad es de la obra: lo que se audita es lo que diga
    // el plan de ejecucion BIM del proyecto, no una lista fija del programa.
    apiFetch(`${API}/api/docs/idoneidad?model_urn=${encodeURIComponent(projectPrefix)}`)
      .then(r => r.json()).then(d => setCodigos(d.codigos || [])).catch(() => setCodigos([]));
  }, [isOpen, projectPrefix]);

  if (!isOpen) return null;

  // Al elegir plantilla se PREVISUALIZA: una de entidad designa funciones, y
  // hasta resolverlas contra los miembros de ESTA obra nadie sabe en quien
  // caen. Enseñarlo antes evita descubrirlo con la revisión ya abierta y un
  // encargo circulando.
  const elegirPlantilla = async (id) => {
    setPlantillaId(id);
    setAvisoPlantilla('');
    if (!id) { setSteps([]); return; }
    try {
      const r = await apiFetch(
        `${API}/api/review-templates/${id}/resolver?model_urn=${encodeURIComponent(projectPrefix)}`);
      const d = await r.json();
      if (!r.ok) {
        setSteps([]);
        setAvisoPlantilla(d.error || 'No se pudo aplicar esta plantilla aquí.');
        return;
      }
      setSteps((d.pasos || []).map(p => ({
        id: p.user_id, name: p.name, email: p.email, dias: p.dias,
        etiqueta: p.etiqueta, decision: p.decision, de_funcion: p.de_funcion,
      })));
    } catch (e) {
      setSteps([]);
      setAvisoPlantilla(e.message || 'No se pudo previsualizar.');
    }
  };

  // SI SE TOCAN LOS PASOS, YA NO ES ESA PLANTILLA. Mantener la procedencia
  // después de editar el flujo diría que la revisión siguió un molde que en
  // realidad no siguió -- y eso es peor que no citar ninguno.
  const soltarPlantilla = () => {
    if (!plantillaId) return;
    setPlantillaId('');
    setAvisoPlantilla('Has cambiado los pasos: esta revisión ya no queda '
                    + 'registrada como aplicación de esa plantilla.');
  };

  // QUÉ SE LE PIDE A CADA PASO: revisar o aprobar (REVIEWS-R01).
  //
  // Hasta ahora el camino a mano no lo decía y el de plantilla sí, así que dos
  // revisiones de la misma obra podían tener pasos con contratos distintos. El
  // backend lo exige bajo el contrato nuevo, y aquí se manda siempre: mandarlo
  // sólo cuando el contrato lo pide dejaría el bypass listo para reaparecer.
  //
  // EL VALOR POR DEFECTO ES EL FLUJO CANÓNICO --revisan todos, aprueba el
  // último-- y no una casilla vacía. Un flujo cuyo último paso sólo revisa no
  // se puede cerrar nunca, así que dejar que el usuario lo acierte sería dejar
  // que se equivoque. Se deriva, no se guarda: al añadir un paso, el nuevo
  // último pasa a aprobar sin que nadie lo toque.
  const decisionDe = (s, i, total) =>
    s.decision || (i === total - 1 ? 'APRUEBA' : 'REVISA');

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
          // Con plantilla se manda SOLO su id y el servidor la resuelve: si se
          // mandaran los pasos previsualizados, un cambio entre la vista previa
          // y el envío pasaría inadvertido.
          ...(plantillaId ? { plantilla_id: plantillaId } : {}),
          // `user_id` es la IDENTIDAD del revisor; `email` y `name` van como
          // instantanea de a quien se le pidio y con que nombre, aunque esa
          // persona se llame distinto dentro de dos anos. Antes solo se
          // mandaban esos dos, y quien podia firmar se decidia comparando
          // correo O NOMBRE: dos personas llamadas igual eran las dos
          // candidatas al mismo paso.
          ...(plantillaId ? {} : {
            steps: steps.map((s, i) => ({
              user_id: s.id, email: s.email, name: s.name,
              decision: decisionDe(s, i, steps.length),
              ...(s.dias ? { dias: Number(s.dias) } : {}),
            })),
          }),
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

          {plantillas.length > 0 && (
            <div>
              <label style={{ display: 'block', color: '#666', marginBottom: 6, fontWeight: 600 }}>
                Flujo de revisión
                <span style={{ fontWeight: 400, color: '#999', fontSize: 11 }}>
                  {' '}· la revisión se queda con una copia; cambiar la plantilla después no la toca
                </span>
              </label>
              <select value={plantillaId} onChange={e => elegirPlantilla(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd',
                               borderRadius: 4, fontSize: 13, background: '#fff' }}>
                <option value="">— a mano, paso a paso —</option>
                {plantillas.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · v{p.version} · {(p.pasos || []).length} pasos
                    {p.alcance === 'ENTIDAD' ? ' (de la entidad)' : ''}
                  </option>
                ))}
              </select>
              {avisoPlantilla && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#8a5a12',
                              background: '#fffaf0', border: '1px solid #f0d9a0',
                              borderRadius: 4, padding: '6px 9px', lineHeight: 1.5 }}>
                  {avisoPlantilla}
                </div>
              )}
            </div>
          )}

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
                  {i + 1}. {s.etiqueta ? s.etiqueta + ' — ' : ''}{s.name || s.email}
                  {/* QUÉ SE LE PIDE. Editable también cuando viene de una
                      plantilla: cambiarlo suelta la procedencia igual que
                      cambiar el plazo, porque un flujo retocado ya no es esa
                      plantilla. */}
                  <select
                    value={decisionDe(s, i, steps.length)}
                    onChange={e => { soltarPlantilla(); setSteps(prev => prev.map((x, j) =>
                      j === i ? { ...x, decision: e.target.value } : x)); }}
                    title={s.de_funcion
                      ? 'Sale de la función ' + s.de_funcion
                      : 'REVISA: comenta y da paso. APRUEBA: su firma vale como aprobación. El último paso tiene que aprobar, o la revisión no podría cerrarse.'}
                    style={{ border: '1px solid #c8d6e8', borderRadius: 8, padding: '1px 2px',
                             fontSize: 10, fontWeight: 700, color: '#1a56a8', background: '#fff' }}>
                    <option value="REVISA">REVISA</option>
                    <option value="APRUEBA">APRUEBA</option>
                  </select>
                  {/* El plazo del paso. Se cuenta desde que EMPIEZA su turno,
                      no desde que se crea la revisión: cuando se crea no se
                      sabe cuándo le tocará al paso 3. Vacío = sin plazo. */}
                  <input
                    type="number" min="1" placeholder="d. cal." value={s.dias || ''}
                    onChange={e => { soltarPlantilla(); setSteps(prev => prev.map((x, j) =>
                      j === i ? { ...x, dias: e.target.value } : x)); }}
                    title="Días CALENDARIO de plazo para este paso (opcional). Son días naturales: no hay calendario de días hábiles, así que un plazo de 3 días vence en 3 días aunque caigan en fin de semana."
                    style={{ width: 52, border: '1px solid #c8d6e8', borderRadius: 8, padding: '1px 5px', fontSize: 11, color: '#1a56a8', background: '#fff' }}
                  />
                  <button onClick={() => { soltarPlantilla(); setSteps(prev => prev.filter((_x, j) => j !== i)); }} style={{ background: 'none', border: 'none', color: '#1a56a8', cursor: 'pointer', padding: 0, fontSize: 13 }}>×</button>
                </span>
              ))}
              {!steps.length && <span style={{ color: '#aaa', fontSize: 12 }}>Haz clic en un usuario para añadirlo como paso…</span>}
            </div>
            <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4 }}>
              {users.filter(u => !steps.find(s => s.id === u.id)).map(u => (
                <div key={u.email} onClick={() => { soltarPlantilla(); setSteps(prev => [...prev, { id: u.id, email: u.email, name: u.name, dias: '' }]); }}
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

// ── Vista: listado de revisiones y detalle (REVIEWS · E1) ──
//
// La lista llega del servidor ya filtrada y por páginas: el permiso documental se
// aplica allí, antes de cortar la página. Abrir una revisión la pone en la URL
// (`?obra=<id>&revision=<id>`), así el enlace se puede compartir y atrás/adelante
// funcionan. Los actos viven en el detalle, donde se ve qué se aprueba y qué
// consecuencia tiene.
const LIMITE = 20;

const TONO_DE_LISTA = {
  exito: { background: '#dcfce7', color: '#15803d' },
  peligro: { background: '#fee2e2', color: '#b91c1c' },
  aviso: { background: '#fff7e0', color: '#b26a00' },
  neutro: { background: '#f3f4f6', color: '#4b5563' },
};

function FilaDeRevision({ rev, onAbrir }) {
  const chip = chipDeEstado(rev);
  const pasos = rev.steps || [];
  const paso = pasos[rev.current_step] || {};
  const documentos = (rev.items || []).length;
  return (
    <li style={{ marginBottom: 10 }}>
      <button type="button" onClick={onAbrir} title="Abrir la revisión"
        style={{ width: '100%', textAlign: 'left', background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8,
                 padding: '12px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6,
                 font: 'inherit', color: 'inherit' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
          <span style={{ fontSize: 12, color: '#999', fontWeight: 700 }}>{rev.codigo || codigoDe(rev.id)}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#333', flex: 1 }}>{rev.title}</span>
          {rev.me_toca && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12,
                           background: '#e0ecff', color: '#1a56a8' }}>Te toca</span>
          )}
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12,
                         ...TONO_DE_LISTA[chip.tono] }}>{chip.etiqueta}</span>
        </span>
        <span style={{ fontSize: 12, color: '#666', display: 'flex', flexWrap: 'wrap', gap: 12, width: '100%' }}>
          <span>{documentos} documento{documentos !== 1 ? 's' : ''}</span>
          {rev.status === 'pending' && pasos.length > 0 && (
            <span>Paso {rev.current_step + 1} de {pasos.length}: {paso.name || paso.email || '—'}</span>
          )}
          {rev.status === 'pending' && rev.paso_vence_en && <span>Plazo {formatDate(rev.paso_vence_en)}</span>}
          <span style={{ marginLeft: 'auto', color: '#aaa' }}>{rev.created_by} · {formatDate(rev.created_at)}</span>
        </span>
      </button>
    </li>
  );
}

export function ReviewsView({ projectPrefix }) {
  const [filtro, setFiltro] = useState('todas');
  const [reviews, setReviews] = useState(null);
  const [siguiente, setSiguiente] = useState(null);
  const [obraId, setObraId] = useState(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState(null);
  const [abierta, setAbierta] = useState(() => leerEnlace(window.location.search)?.revision || null);
  const peticion = useRef(0);

  const cargar = useCallback(async (antesDe = null) => {
    const n = ++peticion.current;
    const q = new URLSearchParams({ model_urn: projectPrefix, filtro, limite: String(LIMITE) });
    if (antesDe) { q.set('antes_de', String(antesDe)); setCargandoMas(true); }
    try {
      const r = await apiFetch(`${API}/api/reviews?${q.toString()}`);
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (n !== peticion.current) return;
      if (!r.ok || !d?.success) {
        setError(mensajeDeError(r.status, d).texto);
        if (!antesDe) setReviews([]);
        return;
      }
      setError(null);
      setObraId(d.obra_id || null);
      setReviews(prev => (antesDe ? [...(prev || []), ...(d.reviews || [])] : (d.reviews || [])));
      setSiguiente(d.siguiente ?? null);
    } catch {
      if (n === peticion.current) {
        setError(mensajeDeError(0, null).texto);
        if (!antesDe) setReviews([]);
      }
    } finally {
      if (antesDe) setCargandoMas(false);
    }
  }, [projectPrefix, filtro]);

  useEffect(() => { setReviews(null); setSiguiente(null); cargar(); }, [cargar]);

  // Atrás/adelante abren y cierran el detalle; al salir de Revisiones, el enlace
  // deja de describir lo que se ve y se quita de la URL.
  useEffect(() => {
    const alNavegar = () => setAbierta(leerEnlace(window.location.search)?.revision || null);
    window.addEventListener('popstate', alNavegar);
    return () => {
      window.removeEventListener('popstate', alNavegar);
      if (leerEnlace(window.location.search)) {
        window.history.replaceState(null, '', window.location.pathname
          + conRevision(window.location.search, null, null));
      }
    };
  }, []);

  const abrir = (rev) => {
    const obra = obraId || leerEnlace(window.location.search)?.obra || null;
    window.history.pushState({ revision: rev.id }, '', window.location.pathname
      + conRevision(window.location.search, obra, rev.id));
    setAbierta(rev.id);
  };

  const volver = () => {
    // Abierta desde esta lista: atrás deja la historia del navegador como estaba.
    if (window.history.state && window.history.state.revision) {
      window.history.back();
      return;
    }
    // Abierta por un enlace: no hay lista detrás en la historia.
    window.history.replaceState(null, '', window.location.pathname
      + conRevision(window.location.search, null, null));
    setAbierta(null);
  };

  if (abierta) {
    return (
      <RevisionDetalle key={abierta} rid={abierta} projectPrefix={projectPrefix}
                       onVolver={volver} onCambio={() => cargar()} />
    );
  }

  return (
    <div style={{ padding: 32, flex: 1, overflowY: 'auto' }}>
      <div style={{ fontSize: 24, fontWeight: 300, marginBottom: 4 }}>Revisiones</div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
        Flujos de aprobación: selecciona archivos en Archivos y pulsa "Enviar a revisión".
      </div>
      <div role="group" aria-label="Filtrar revisiones"
           style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {FILTROS.map(f => {
          const activo = filtro === f.id;
          return (
            <button key={f.id} type="button" aria-pressed={activo} onClick={() => setFiltro(f.id)}
              style={{ padding: '5px 12px', borderRadius: 14, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                       border: activo ? '1px solid var(--accent)' : '1px solid #dcdcdc',
                       background: activo ? 'var(--accent)' : '#fff', color: activo ? '#fff' : '#444' }}>
              {f.etiqueta}
            </button>
          );
        })}
      </div>
      {error && (
        <div role="alert" style={{ marginBottom: 12, padding: '9px 12px', borderRadius: 6, background: '#fff1f2',
                                   border: '1px solid #fecdd3', color: '#9f1239', fontSize: 12 }}>
          {error}
        </div>
      )}
      {reviews === null ? (
        <div style={{ textAlign: 'center', padding: 48 }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
      ) : reviews.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#999', fontSize: 13 }}>
          {filtro === 'todas' ? 'No hay revisiones aún.' : 'No hay revisiones en este filtro.'}
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {reviews.map(rev => <FilaDeRevision key={rev.id} rev={rev} onAbrir={() => abrir(rev)} />)}
        </ul>
      )}
      {siguiente && reviews?.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button type="button" onClick={() => cargar(siguiente)} disabled={cargandoMas}
            style={{ padding: '7px 18px', background: '#fff', border: '1px solid #dcdcdc', borderRadius: 4,
                     fontSize: 13, cursor: cargandoMas ? 'wait' : 'pointer' }}>
            {cargandoMas ? 'Cargando…' : 'Cargar más'}
          </button>
        </div>
      )}
    </div>
  );
}
