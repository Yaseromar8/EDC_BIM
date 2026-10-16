// ReviewsModule.jsx — Flujos de revisión y aprobación (ISO 19650, estilo ACC Reviews)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { API, getInitials } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import { confirmAction } from '../utils/confirm';
import {
  cambioDeFlujo, confirmacionDePlantilla, AYUDA_PARTICIPANTES, opcionDePlantilla, pasosSinElegir,
  eleccionesParaEnviar, plazoValido, AVISO_PLAZO, leerRespuesta, textoDeFallo, trasVistaPrevia,
  AVISO_SIN_PLANTILLAS,
} from '../utils/altaDeRevision';
import RevisionDetalle from './RevisionDetalle';
import {
  FILTROS, leerEnlace, conRevision, chipDeEstado, codigoDe, mensajeDeError,
  avisoDeOtrasRevisiones, AVISO_DOCUMENTOS_EN_CURSO,
} from '../utils/revisiones';
import Button from '../../../design/ui/Button';
import IconButton from '../../../design/ui/IconButton';
import './ReviewsModule.css';
import { LaminaVacia } from './IlustracionesDeObra';

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
  // En qué OTRAS revisiones en curso están ya estos documentos (E1.2 · H7-A).
  const [enCurso, setEnCurso] = useState({});
  // E1.3 · flujos creados utilizables. `opciones`: los pasos por función con varias
  // personas posibles; `elecciones`: a quién se eligió en cada uno; `bloqueo`: por qué
  // no se puede iniciar con el flujo elegido. `vistaPrevia` numera las comprobaciones,
  // para que una respuesta que llega tarde no pise a la última.
  const [errorPlantillas, setErrorPlantillas] = useState('');
  const [opciones, setOpciones] = useState({});
  const [elecciones, setElecciones] = useState({});
  const [bloqueo, setBloqueo] = useState('');
  const [previsualizando, setPrevisualizando] = useState(false);
  const vistaPrevia = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(''); setSteps([]); setFinalStatus('SHARED'); setIdoneidad('');
    setPlantillaId(''); setAvisoPlantilla('');
    setOpciones({}); setElecciones({}); setBloqueo(''); setPrevisualizando(false);
    vistaPrevia.current += 1;
    setErrorPlantillas('');
    // SI NO SE PUEDEN CARGAR LOS FLUJOS, SE DICE (E1.3). Antes el selector
    // desaparecía sin más, y no había forma de saber que existían.
    apiFetch(`${API}/api/review-templates?model_urn=${encodeURIComponent(projectPrefix)}`)
      .then(async r => {
        const d = await leerRespuesta(r);
        if (!r.ok || !d) throw new Error('sin flujos');
        setPlantillas((d.plantillas || []).filter(p => p.activa));
      })
      .catch(() => { setPlantillas([]); setErrorPlantillas(AVISO_SIN_PLANTILLAS); });
    // SOLO QUIEN PUEDE REVISAR AQUÍ (E1.1 · H3). `/api/users` le daba a un
    // administrador el padrón entero --gente de otras obras y cuentas retiradas--
    // y el servidor la rechazaba al pulsar «Iniciar revisión». `/miembros`
    // devuelve los participantes activos de ESTA obra y lo puede pedir cualquier
    // miembro, no solo un administrador.
    apiFetch(`${API}/api/projects/${encodeURIComponent(projectPrefix)}/miembros`)
      .then(r => (r.ok ? r.json() : { miembros: [] }))
      .then(d => setUsers(d.miembros || [])).catch(() => setUsers([]));
    // El catalogo de idoneidad es de la obra: lo que se audita es lo que diga
    // el plan de ejecucion BIM del proyecto, no una lista fija del programa.
    apiFetch(`${API}/api/docs/idoneidad?model_urn=${encodeURIComponent(projectPrefix)}`)
      .then(r => r.json()).then(d => setCodigos(d.codigos || [])).catch(() => setCodigos([]));
  }, [isOpen, projectPrefix]);

  // ¿ESTOS DOCUMENTOS YA ESTÁN EN OTRA REVISIÓN EN CURSO? (E1.2 · H7-A). Se avisa antes
  // de crear otra: un documento tiene un solo estado, y lo que emita una revisión cambia
  // lo que la otra sigue revisando. Solo avisa: el servidor no lo impide.
  const nodosDelAlta = (items || []).map(it => it.node_id).filter(Boolean).join(',');
  useEffect(() => {
    if (!isOpen || !nodosDelAlta) return undefined;
    let vigente = true;
    const q = new URLSearchParams({ model_urn: projectPrefix });
    nodosDelAlta.split(',').forEach(n => q.append('node_id', n));
    apiFetch(`${API}/api/reviews/en-curso?${q.toString()}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (vigente) setEnCurso(d?.documentos || {}); })
      .catch(() => { if (vigente) setEnCurso({}); });
    return () => { vigente = false; };
  }, [isOpen, projectPrefix, nodosDelAlta]);

  if (!isOpen) return null;

  const plantillaElegida = plantillas.find(p => String(p.id) === String(plantillaId));
  const noUtilizables = plantillas.filter(p => opcionDePlantilla(p).deshabilitada);
  // Con un flujo elegido que aún no está completo, los pasos de antes no se enseñan:
  // no son los que se van a mandar.
  const pasosVisibles = !(plantillaId && (bloqueo || previsualizando));

  // Al elegir plantilla se PREVISUALIZA: una de entidad designa funciones, y
  // hasta resolverlas contra los miembros de ESTA obra nadie sabe en quien
  // caen. Enseñarlo antes evita descubrirlo con la revisión ya abierta y un
  // encargo circulando.
  //
  // Y SIN TIRAR EL TRABAJO DE NADIE (E1.1 · H2). Elegir plantilla sustituía en
  // silencio los revisores puestos a mano, y volver a «a mano» los vaciaba.
  // Ahora: con pasos a mano se pregunta antes; «a mano» conserva lo que haya; y
  // si la plantilla no se puede aplicar, vuelven los pasos de antes.
  const previsualizar = async (id, eleccionesAhora, opcionesAhora) => {
    const n = ++vistaPrevia.current;
    setPrevisualizando(true);
    let r = null;
    let d = null;
    try {
      // E1.3 · LA VISTA PREVIA HACE TODAS LAS COMPROBACIONES DEL ALTA: es la misma
      // ruta del servidor, que se detiene antes de escribir. La anterior solo
      // resolvía personas, y la independencia, el acceso a los documentos, los
      // plazos y el contrato saltaban al pulsar «Iniciar revisión».
      r = await apiFetch(`${API}/api/reviews/previsualizar`, {
        method: 'POST',
        body: JSON.stringify({
          model_urn: projectPrefix, items, plantilla_id: id, final_status: finalStatus,
          elecciones: eleccionesParaEnviar(opcionesAhora, eleccionesAhora),
        }),
      });
      d = await leerRespuesta(r);
    } catch {
      r = null;
    }
    // Una respuesta que llega tarde --se eligió otro flujo, o se cerró la ventana--
    // no pisa lo que se ve ahora.
    if (n !== vistaPrevia.current) return null;
    setPrevisualizando(false);
    const t = trasVistaPrevia({
      ok: Boolean(r?.ok),
      cuerpo: d || { error: textoDeFallo(r?.status || 0, null, 'comprobar el flujo') },
      elecciones: eleccionesAhora,
      opcionesActuales: opcionesAhora,
    });
    if (t.tipo === 'pasos') {
      setOpciones(t.opciones);
      setBloqueo('');
      setSteps(t.pasos.map(p => ({
        id: p.user_id, name: p.name, email: p.email, dias: p.dias, dias_tipo: p.dias_tipo,
        etiqueta: p.etiqueta, decision: p.decision, de_funcion: p.de_funcion,
      })));
    } else if (t.tipo !== 'recuperar') {
      setOpciones(t.opciones);
      setBloqueo(t.aviso);
    }
    return t;
  };

  const elegirPlantilla = async (id) => {
    const cambio = cambioDeFlujo({ plantillaActual: plantillaId, nueva: id, pasos: steps });
    if (cambio.tipo === 'nada') return;
    if (cambio.tipo === 'a_mano') {
      vistaPrevia.current += 1;
      setPrevisualizando(false);
      setPlantillaId('');
      setOpciones({}); setElecciones({}); setBloqueo('');
      setAvisoPlantilla(cambio.aviso);
      return;
    }
    if (cambio.confirmar) {
      const plantilla = plantillas.find(p => String(p.id) === String(id));
      if (!await confirmAction(confirmacionDePlantilla(steps.length, plantilla?.nombre))) return;
    }
    const anteriores = { pasos: steps, plantilla: plantillaId, opciones, elecciones, bloqueo };
    const recuperar = (aviso) => {
      setSteps(anteriores.pasos);
      setPlantillaId(anteriores.plantilla);
      setOpciones(anteriores.opciones);
      setElecciones(anteriores.elecciones);
      setBloqueo(anteriores.bloqueo);
      setAvisoPlantilla(aviso);
    };
    setPlantillaId(id);
    setAvisoPlantilla('');
    setOpciones({}); setElecciones({}); setBloqueo('');
    const t = await previsualizar(id, {}, {});
    if (t?.tipo === 'recuperar') recuperar(t.aviso);
  };

  // SI SE TOCAN LOS PASOS, YA NO ES ESA PLANTILLA. Mantener la procedencia
  // después de editar el flujo diría que la revisión siguió un molde que en
  // realidad no siguió -- y eso es peor que no citar ninguno.
  const soltarPlantilla = () => {
    if (!plantillaId) return;
    vistaPrevia.current += 1;
    setPrevisualizando(false);
    setPlantillaId('');
    setOpciones({}); setElecciones({}); setBloqueo('');
    setAvisoPlantilla('Has cambiado los pasos: esta revisión ya no queda '
                    + 'registrada como aplicación de esa plantilla.');
  };

  // A QUIÉN SE ELIGE EN UN PASO POR FUNCIÓN (E1.3). El servidor pedía elegir y la
  // pantalla no tenía dónde: ese flujo no se podía usar nunca. Con todos los pasos
  // elegidos se vuelve a comprobar el flujo entero con esas personas.
  const elegirPersona = async (indice, uid) => {
    const nuevas = { ...elecciones, [indice]: uid };
    setElecciones(nuevas);
    const faltan = pasosSinElegir(opciones, nuevas);
    if (faltan.length) {
      vistaPrevia.current += 1;
      setPrevisualizando(false);
      setBloqueo(`Elige quién hace el paso ${faltan.join(', ')}.`);
      return;
    }
    await previsualizar(plantillaId, nuevas, opciones);
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
    if (plantillaId && previsualizando) { toast.error('Espera un momento: se está comprobando el flujo.'); return; }
    if (plantillaId && bloqueo) { toast.error(bloqueo); return; }
    if (!steps.length) { toast.error('Agrega al menos un revisor'); return; }
    if (steps.some(s => !s.id)) {
      toast.error('Algún revisor no se pudo identificar. Recarga la página e inténtalo de nuevo.');
      return;
    }
    const plazoMal = steps.findIndex(s => !plazoValido(s.dias));
    if (!plantillaId && plazoMal >= 0) { toast.error(`Paso ${plazoMal + 1}: ${AVISO_PLAZO}`); return; }
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
          ...(plantillaId ? { plantilla_id: plantillaId, elecciones: eleccionesParaEnviar(opciones, elecciones) } : {}),
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
              ...(s.dias && s.dias_tipo === 'laborables' ? { dias_tipo: 'laborables' } : {}),
            })),
          }),
          final_status: finalStatus, codigo_idoneidad: idoneidad || undefined
        })
      });
      const d = await leerRespuesta(r);
      if (!r.ok || !d?.success) {
        // Si entre la vista previa y el envío apareció otra persona posible en un paso
        // por función, se vuelven a enseñar los selectores.
        if (plantillaId && d?.code === 'ELIGE_REVISOR') {
          setOpciones(d.opciones || {});
          setBloqueo(d.error || '');
        }
        throw new Error(textoDeFallo(r.status, d, 'crear la revisión'));
      }
      toast.success('Revisión iniciada');
      onCreated?.(); onClose();
    } catch (e) { toast.error(e.message || 'No se pudo crear la revisión'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'var(--a-surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 520, maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: 'var(--a-radius-lg)', border: '1px solid var(--a-border-subtle)', boxShadow: 'var(--a-shadow-lg)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f0e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#141413' }}>Enviar a revisión</h3>
          <IconButton etiqueta="Cerrar" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
          </IconButton>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13 }}>
          <div>
            <label style={{ display: 'block', color: '#72706b', marginBottom: 6, fontWeight: 600 }}>Título</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Aprobación planos estructuras Rev B"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #e8e6dc', borderRadius: 4, fontSize: 13, outline: 'none' }} />
          </div>

          <div>
            <label style={{ display: 'block', color: '#72706b', marginBottom: 6, fontWeight: 600 }}>Documentos ({items.length})</label>
            <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid #f1f0e8', borderRadius: 4 }}>
              {items.map(it => {
                const otras = enCurso[it.node_id] || [];
                const aviso = avisoDeOtrasRevisiones(otras, { enElAlta: true });
                return (
                  <div key={it.node_id} style={{ padding: '6px 10px', borderBottom: '1px solid #f1f0e8' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
                      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>V{it.version || 1}</span>
                    </div>
                    {aviso && (
                      <div style={{ marginTop: 2, fontSize: 11, color: '#734500' }}
                           title={otras.map(o => `${o.codigo} · ${o.title}`).join('\n')}>
                        {aviso}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {Object.keys(enCurso).length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#734500', lineHeight: 1.5 }}>
                {AVISO_DOCUMENTOS_EN_CURSO}
              </div>
            )}
          </div>

          {errorPlantillas && (
            <div role="alert" style={{ fontSize: 12, color: '#734500', background: '#faf9f5',
                                       border: '1px solid #f9eeda', borderRadius: 4, padding: '6px 9px',
                                       lineHeight: 1.5 }}>
              {errorPlantillas}
            </div>
          )}
          {plantillas.length > 0 && (
            <div>
              <label style={{ display: 'block', color: '#72706b', marginBottom: 6, fontWeight: 600 }}>
                Flujo de revisión
                <span style={{ fontWeight: 400, color: '#72706b', fontSize: 11 }}>
                  {' '}· la revisión se queda con una copia; cambiar la plantilla después no la toca
                </span>
              </label>
              <select value={plantillaId} onChange={e => elegirPlantilla(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #e8e6dc',
                               borderRadius: 4, fontSize: 13, background: '#fff' }}>
                <option value="">— a mano, paso a paso —</option>
                {plantillas.map(p => {
                  // Un flujo que no se puede usar aquí se ve, pero no se elige (E1.3).
                  const o = opcionDePlantilla(p);
                  return (
                    <option key={p.id} value={p.id} disabled={o.deshabilitada} title={o.motivo}>
                      {o.etiqueta}
                    </option>
                  );
                })}
              </select>
              {noUtilizables.length > 0 && (
                <details style={{ marginTop: 6, fontSize: 11, color: '#734500' }}>
                  <summary style={{ cursor: 'pointer' }}>
                    {noUtilizables.length === 1 ? 'Un flujo no se puede usar aquí'
                      : `${noUtilizables.length} flujos no se pueden usar aquí`}
                  </summary>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, lineHeight: 1.5 }}>
                    {noUtilizables.map(p => (
                      <li key={p.id}><b>{p.nombre}</b>: {opcionDePlantilla(p).motivo}</li>
                    ))}
                  </ul>
                </details>
              )}
              {plantillaId && Object.keys(opciones).length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.keys(opciones).sort((a, b) => Number(a) - Number(b)).map(i => {
                    const molde = (plantillaElegida?.pasos || [])[Number(i)] || {};
                    return (
                      <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <span style={{ flex: '0 0 45%', color: '#333330' }}>
                          Paso {Number(i) + 1}{molde.etiqueta ? ` · ${molde.etiqueta}` : ''}
                          {molde.funcion && <span style={{ color: '#72706b' }}> · función {molde.funcion}</span>}
                        </span>
                        <select value={elecciones[i] || ''} onChange={e => elegirPersona(i, e.target.value)}
                                aria-label={`Quién hace el paso ${Number(i) + 1}`}
                                style={{ flex: 1, padding: '6px 8px', border: '1px solid #e8e6dc', borderRadius: 4,
                                         fontSize: 12, background: '#fff' }}>
                          <option value="">— elige a quién —</option>
                          {opciones[i].map(c => (
                            <option key={c.id} value={c.id}>{c.name || c.email}{c.empresa ? ` · ${c.empresa}` : ''}</option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
              )}
              {plantillaId && previsualizando && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#72706b' }}>Comprobando el flujo…</div>
              )}
              {plantillaId && bloqueo && !previsualizando && (
                <div role="alert" style={{ marginTop: 6, fontSize: 12, color: '#993458', background: '#fbebeb',
                                           border: '1px solid #fbebeb', borderRadius: 4, padding: '6px 9px',
                                           lineHeight: 1.5 }}>
                  {bloqueo}
                </div>
              )}
              {avisoPlantilla && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#734500',
                              background: '#faf9f5', border: '1px solid #f9eeda',
                              borderRadius: 4, padding: '6px 9px', lineHeight: 1.5 }}>
                  {avisoPlantilla}
                </div>
              )}
            </div>
          )}

          <div>
            <label style={{ display: 'block', color: '#72706b', marginBottom: 6, fontWeight: 600 }}>
              Secuencia de revisores (en orden)
              {/* Se dice aquí y no sólo en el tooltip: un plazo que el usuario
                  cree en días hábiles y el sistema cuenta en naturales es una
                  discusión garantizada la primera vez que uno vence en sábado. */}
              <span style={{ fontWeight: 400, color: '#72706b', fontSize: 11 }}> · el plazo se cuenta en días calendario (naturales)</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {pasosVisibles && steps.map((s, i) => (
                // La clave lleva la POSICIÓN (E1.3): una misma persona puede estar en dos
                // pasos, y con la clave repetida React mezclaba sus controles.
                <span key={`${i}-${s.id || s.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f1f0e8', color: '#507294', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
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
                    style={{ border: '1px solid #cccac0', borderRadius: 8, padding: '1px 2px',
                             fontSize: 10, fontWeight: 700, color: '#507294', background: '#fff' }}>
                    <option value="REVISA">REVISA</option>
                    <option value="APRUEBA">APRUEBA</option>
                  </select>
                  {/* El plazo del paso. Se cuenta desde que EMPIEZA su turno,
                      no desde que se crea la revisión: cuando se crea no se
                      sabe cuándo le tocará al paso 3. Vacío = sin plazo. */}
                  <input
                    type="number" min="1" placeholder={s.dias_tipo === 'laborables' ? 'd. háb.' : 'd. cal.'} value={s.dias || ''}
                    onChange={e => { soltarPlantilla(); setSteps(prev => prev.map((x, j) =>
                      j === i ? { ...x, dias: e.target.value } : x)); }}
                    title={s.dias_tipo === 'laborables'
                      ? 'Días HÁBILES de plazo para este paso, como dice su flujo: de lunes a viernes, sin feriados.'
                      : 'Días CALENDARIO de plazo para este paso (opcional): un plazo de 3 días vence en 3 días aunque caigan en fin de semana. Los días hábiles se eligen en el flujo.'}
                    style={{ width: 52, border: '1px solid #cccac0', borderRadius: 8, padding: '1px 5px', fontSize: 11, color: '#507294', background: '#fff' }}
                  />
                  <button type="button" aria-label={`Quitar el paso ${i + 1}`} title="Quitar este paso"
                    onClick={() => { soltarPlantilla(); setSteps(prev => prev.filter((_x, j) => j !== i)); }}
                    className="rev-quitar-paso">×</button>
                </span>
              ))}
              {pasosVisibles && !steps.length && <span style={{ color: '#72706b', fontSize: 12 }}>Haz clic en un usuario para añadirlo como paso…</span>}
              {!pasosVisibles && <span style={{ color: '#72706b', fontSize: 12 }}>Los pasos del flujo aparecen aquí cuando esté completo.</span>}
            </div>
            <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid #f1f0e8', borderRadius: 4 }}>
              {users.filter(u => !steps.find(s => s.id === u.id)).map(u => (
                <button type="button" key={u.email} className="rev-persona"
                  onClick={() => { soltarPlantilla(); setSteps(prev => [...prev, { id: u.id, email: u.email, name: u.name, dias: '' }]); }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{getInitials(u.name || u.email)}</span>
                  <span>{u.name || '—'} <span style={{ color: '#72706b', fontSize: 11 }}>{u.email}{u.empresa ? ` · ${u.empresa}` : ''}</span>
                    {u.pendiente && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: '#9e5943' }}>PENDIENTE</span>}
                  </span>
                </button>
              ))}
              {!users.length && (
                <div style={{ padding: '8px 10px', color: '#72706b', fontSize: 12 }}>No hay participantes activos en esta obra.</div>
              )}
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#72706b', lineHeight: 1.5 }}>{AYUDA_PARTICIPANTES}</div>
          </div>

          <div>
            <label style={{ display: 'block', color: '#72706b', marginBottom: 6, fontWeight: 600 }}>Al aprobar, los documentos pasan a:</label>
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
            <label style={{ display: 'block', color: '#72706b', marginBottom: 6, fontWeight: 600 }}>
              Al aprobarse, ¿para qué queda autorizado?
            </label>
            <select
              value={idoneidad}
              onChange={e => setIdoneidad(e.target.value)}
              style={{ width: '100%', padding: '7px 9px', border: '1px solid #e8e6dc', borderRadius: 4, fontSize: 13 }}
            >
              <option value="">{finalStatus === 'PUBLISHED' ? '— Obligatorio al publicar —' : '— Sin especificar —'}</option>
              {codigos.filter(c => c.familia === (finalStatus === 'PUBLISHED' ? 'publicado' : 'compartido')).map(c => (
                <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.etiqueta}</option>
              ))}
            </select>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#72706b', lineHeight: 1.5 }}>
              El estado dice dónde está el documento; esto dice para qué puede usarse.
              Un plano publicado «solo para información» no autoriza a construir.
            </p>
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f0e8', display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#faf9f5' }}>
          <Button rango="secondary" onClick={onClose}>Cancelar</Button>
          {/* `cargando` pone el indicador DENTRO del botón y lo bloquea: antes
              solo se atenuaba, y no se veía que estaba trabajando. */}
          <Button rango="primary" className="boton-enviar" cargando={saving} onClick={submit}>
            {saving ? 'Creando…' : 'Iniciar revisión'}
          </Button>
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

// LA LISTA ES UNA TABLA, como la de ACC (UI polish, 13-oct-2026, comparada en
// vivo con su Revisiones): una fila de 48 px por revisión, el estado como texto
// con una barra de su color, quién tiene la siguiente acción y cuándo vence (en
// rojo si ya venció). Antes eran tarjetas con los datos en dos renglones.
// El tono del estado es un nombre y lo pinta el canon (`--a-status-*`).
const COLUMNAS_DE_REVISION = ['Estado', 'ID', 'Nombre de la revisión', 'Flujo', 'Siguiente acción de',
  'Vence', 'Iniciada por', 'Creada el', 'Finalizada el', 'Documentos'];

// Fecha de tabla: dia y hora, sin segundos, como ACC («12 de sep de 2026 12:32»).
// La completa sigue en el detalle.
function fechaCorta(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric',
                                     hour: '2-digit', minute: '2-digit', hour12: false });
}

function CabeceraDeRevisiones() {
  return (
    <div className="rev-tabla__cabeza" role="row">
      {COLUMNAS_DE_REVISION.map(c => <span key={c} role="columnheader">{c}</span>)}
    </div>
  );
}

function FilaDeRevision({ rev, onAbrir, ahora }) {
  const chip = chipDeEstado(rev);
  const pasos = rev.steps || [];
  const paso = pasos[rev.current_step] || {};
  const documentos = (rev.items || []).length;
  const enCurso = rev.status === 'pending';
  const vence = enCurso ? rev.paso_vence_en : null;
  const vencida = Boolean(vence) && new Date(vence).getTime() < ahora;
  return (
    <li role="row">
      <button type="button" onClick={onAbrir} title="Abrir la revisión" className="rev-fila">
        <span className={`rev-estado rev-estado--${chip.tono}`}>
          <span className="rev-estado__texto">{chip.etiqueta}</span>
          {rev.me_toca && <span className="rev-estado__nota">Te toca</span>}
        </span>
        <span className="rev-fila__codigo">{rev.codigo || codigoDe(rev.id)}</span>
        <span className="rev-fila__titulo">{rev.title}</span>
        <span className="rev-celda">{rev.plantilla_nombre || '—'}</span>
        <span className="rev-celda">
          {enCurso && pasos.length > 0 ? `${paso.name || paso.email || '—'} · paso ${rev.current_step + 1}/${pasos.length}` : '—'}
        </span>
        <span className={`rev-celda${vencida ? ' rev-celda--vencida' : ''}`}>{vence ? fechaCorta(vence) : '—'}</span>
        <span className="rev-celda">{rev.created_by || '—'}</span>
        <span className="rev-celda">{fechaCorta(rev.created_at)}</span>
        <span className="rev-celda">{fechaCorta(rev.cerrada_en)}</span>
        <span className="rev-celda rev-celda--numero">{documentos}</span>
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
  // La hora con la que se decide qué está vencido: se toma al recibir la
  // lista, no al dibujar (un render tiene que ser puro).
  const [ahora, setAhora] = useState(() => Date.now());
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
      setAhora(Date.now());
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
    <div className="rev-pagina">
      <div className="rev-titulo">Revisiones</div>
      <div className="rev-subtitulo">
        Flujos de aprobación: selecciona archivos en Archivos y pulsa "Enviar a revisión".
      </div>
      <div role="group" aria-label="Filtrar revisiones" className="rev-filtros">
        {FILTROS.map(f => (
          <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}
            className="rev-filtro">
            {f.etiqueta}
          </button>
        ))}
      </div>
      {error && <div role="alert" className="rev-alerta">{error}</div>}
      {reviews === null ? (
        <div className="rev-vacio"><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
      ) : reviews.length === 0 ? (
        <div className="rev-vacio">
          {filtro === 'todas' && <LaminaVacia nombre="canal" />}
          {filtro === 'todas' ? 'No hay revisiones aún.' : 'No hay revisiones en este filtro.'}
        </div>
      ) : (
        <div className="rev-tabla" role="table" aria-label="Revisiones">
          <CabeceraDeRevisiones />
          <ul className="rev-lista" role="rowgroup">
            {reviews.map(rev => <FilaDeRevision key={rev.id} rev={rev} ahora={ahora} onAbrir={() => abrir(rev)} />)}
          </ul>
        </div>
      )}
      {siguiente && reviews?.length > 0 && (
        <div className="rev-mas">
          <Button rango="secondary" cargando={cargandoMas} onClick={() => cargar(siguiente)}>
            {cargandoMas ? 'Cargando…' : 'Cargar más'}
          </Button>
        </div>
      )}
    </div>
  );
}
