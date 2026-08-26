// FlujosDeRevisionModule — GAP 06 · el molde, no el proceso.
//
// LA PREGUNTA QUE ESTA PANTALLA RESPONDE:
//     ¿QUIÉN TIENE QUE REVISAR ESTO, Y EN QUÉ ORDEN?
//
// Y la que NO responde, a propósito: qué le pasó a una revisión concreta. Eso
// vive en Revisiones, porque cada revisión se quedó con SU copia del flujo.
//
// LA DECISIÓN DE INTERFAZ QUE MÁS IMPORTA
// ----------------------------------------
// Al lado de cada plantilla se ve **a cuántas revisiones se aplicó** y, al
// editarla, se avisa de que esas revisiones NO cambian. Sin decirlo, cualquiera
// asumiría lo contrario —es lo que hace la mayoría de las plantillas de
// cualquier producto— y editaría el molde creyendo que arregla algo ya abierto.
//
// Deshabilitar tampoco cancela nada: impide abrir revisiones NUEVAS y punto. La
// pantalla lo dice con esas palabras.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/apiFetch';

const CAJA = { border: '1px solid #dfe3e8', borderRadius: 6, boxSizing: 'border-box' };

const COLOR_DECISION = {
  REVISA: { fondo: '#eef2f7', texto: '#2c5d8a' },
  APRUEBA: { fondo: '#e8f5ec', texto: '#1e6b3a' },
};

export default function FlujosDeRevisionModule({ project, API, user, isAdmin }) {
  const [plantillas, setPlantillas] = useState(null);
  const [catalogo, setCatalogo] = useState({ decisiones: [], funciones: [] });
  const [miembros, setMiembros] = useState([]);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState(null);   // objeto plantilla o {} para nueva

  const urn = project?.model_urn || project?.urn;
  const obra = project?.id;

  const cargar = useCallback(async () => {
    if (!urn) return;
    setError('');
    try {
      const r = await apiFetch(`${API}/api/review-templates?model_urn=${encodeURIComponent(urn)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar.');
      setPlantillas(d.plantillas || []);
    } catch (e) {
      setPlantillas([]);
      setError(e.message || 'No se pudieron cargar los flujos.');
    }
  }, [API, urn]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    apiFetch(`${API}/api/review-templates/catalogo`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setCatalogo(d); })
      .catch(() => {});
  }, [API]);

  useEffect(() => {
    if (!obra) return;
    apiFetch(`${API}/api/projects/${encodeURIComponent(obra)}/miembros`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setMiembros(d.miembros || []); })
      .catch(() => {});
  }, [API, obra]);

  const nombres = useMemo(() => {
    const m = {};
    miembros.forEach(p => { m[p.id] = p.name || p.email; });
    return m;
  }, [miembros]);

  const activar = async (p, quiere) => {
    try {
      const r = await apiFetch(`${API}/api/review-templates/${p.id}/activa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activa: quiere }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo.');
      toast.success(quiere ? 'Flujo habilitado'
                           : 'Flujo deshabilitado: no se abrirán revisiones nuevas con él');
      cargar();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div style={{ padding: '18px 22px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 650, color: '#1f2933' }}>
          Flujos de revisión
        </h2>
        <span style={{ fontSize: 12.5, color: '#78838f' }}>
          El molde. Cada revisión se queda con su copia.
        </span>
        <div style={{ flex: 1 }} />
        {isAdmin && (
          <button type="button" onClick={() => setEditando({})}
                  style={{ padding: '8px 15px', borderRadius: 6, border: 'none',
                           background: 'var(--accent, #3E6F91)', color: '#fff',
                           fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Nuevo flujo
          </button>
        )}
      </div>

      <p style={{ margin: '10px 0 16px', fontSize: 12.5, color: '#78838f', lineHeight: 1.6,
                  maxWidth: 760 }}>
        Cambiar un flujo <b>no toca las revisiones ya abiertas ni las cerradas</b>: cada
        una guardó los pasos con los que nació. Deshabilitarlo tampoco las cancela —
        solo impide abrir revisiones nuevas con él.
      </p>

      {error && (
        <div style={{ ...CAJA, borderColor: '#f5c9c9', background: '#fdecec',
                      padding: '9px 13px', marginBottom: 12, fontSize: 12.5,
                      color: '#a12f2f' }}>{error}</div>
      )}

      {plantillas === null && (
        <div style={{ padding: 30, textAlign: 'center', color: '#98a1ab', fontSize: 13 }}>
          Cargando…
        </div>
      )}

      {plantillas !== null && plantillas.length === 0 && (
        <div style={{ padding: '26px 20px', textAlign: 'center', color: '#98a1ab',
                      fontSize: 13, border: '1px dashed #dfe3e8', borderRadius: 8,
                      lineHeight: 1.6 }}>
          Sin flujos definidos. Cada revisión se arma a mano, y en la siguiente obra
          habrá que volver a armarla igual — o distinta sin querer.
        </div>
      )}

      <div style={{ display: 'grid', gap: 9 }}>
        {(plantillas || []).map(p => (
          <div key={p.id} style={{ ...CAJA, background: '#fff', padding: '12px 14px',
                                   opacity: p.activa ? 1 : .62 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 650, color: '#1f2933' }}>
                {p.nombre}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px',
                             borderRadius: 10, background: '#f1f3f5', color: '#5f6b76' }}>
                v{p.version}
              </span>
              {p.alcance === 'ENTIDAD' && (
                <span title="Definida en la entidad: sirve en todas las obras"
                      style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px',
                               borderRadius: 10, background: '#f2eefa', color: '#5b4a8a' }}>
                  DE LA ENTIDAD
                </span>
              )}
              {!p.activa && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px',
                               borderRadius: 10, background: '#fdecec', color: '#a12f2f' }}>
                  DESHABILITADO
                </span>
              )}
              <div style={{ flex: 1 }} />
              {/* Cuántas revisiones se abrieron con él. Es el dato que hace
                  visible que editarlo NO las cambia. */}
              <span style={{ fontSize: 11.5, color: p.aplicada_a ? '#2c5d8a' : '#c3c9d0' }}>
                {p.aplicada_a || 0} revisión(es) abiertas con él
              </span>
              {isAdmin && (
                <>
                  <button type="button" onClick={() => setEditando(p)}
                          style={{ ...CAJA, padding: '4px 11px', background: '#fff',
                                   fontSize: 12, cursor: 'pointer', color: '#3E6F91' }}>
                    Editar
                  </button>
                  <button type="button" onClick={() => activar(p, !p.activa)}
                          style={{ ...CAJA, padding: '4px 11px', background: '#fff',
                                   fontSize: 12, cursor: 'pointer',
                                   color: p.activa ? '#a12f2f' : '#1e6b3a' }}>
                    {p.activa ? 'Deshabilitar' : 'Habilitar'}
                  </button>
                </>
              )}
            </div>

            {p.descripcion && (
              <div style={{ fontSize: 12.5, color: '#78838f', marginTop: 5 }}>
                {p.descripcion}
              </div>
            )}

            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 9 }}>
              {(p.pasos || []).map((paso, i) => {
                const c = COLOR_DECISION[paso.decision] || COLOR_DECISION.REVISA;
                return (
                  <span key={i} style={{ ...CAJA, padding: '4px 10px', fontSize: 12,
                                         background: '#fafbfc', display: 'inline-flex',
                                         alignItems: 'center', gap: 7 }}>
                    <b style={{ color: '#98a1ab' }}>{i + 1}</b>
                    <span style={{ color: '#1f2933' }}>{paso.etiqueta}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px',
                                   borderRadius: 8, background: c.fondo, color: c.texto }}>
                      {paso.decision}
                    </span>
                    <span style={{ color: '#5f6b76' }}>
                      {paso.funcion
                        ? `función ${paso.funcion}`
                        : (nombres[paso.user_id] || `usuario ${paso.user_id}`)}
                    </span>
                    {paso.dias ? (
                      <span style={{ color: '#98a1ab' }}>· {paso.dias} d</span>
                    ) : null}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {editando && (
        <ModalFlujo API={API} urn={urn} catalogo={catalogo} miembros={miembros}
                    inicial={editando}
                    onCerrar={() => setEditando(null)}
                    onGuardado={() => { setEditando(null); cargar(); }} />
      )}
    </div>
  );
}

function ModalFlujo({ API, urn, catalogo, miembros, inicial, onCerrar, onGuardado }) {
  const editar = !!inicial.id;
  const [f, setF] = useState({
    nombre: inicial.nombre || '',
    descripcion: inicial.descripcion || '',
    alcance: inicial.alcance || 'OBRA',
    motivo: '',
  });
  const [pasos, setPasos] = useState(
    (inicial.pasos && inicial.pasos.length ? inicial.pasos : [
      { etiqueta: '', decision: 'REVISA', user_id: '', funcion: '', dias: '' }]));
  const [guardando, setGuardando] = useState(false);

  const cambiar = (i, campo, valor) => setPasos(a => a.map((p, n) => {
    if (n !== i) return p;
    // Persona Y función a la vez no vale: al aplicar no se sabría cuál manda.
    if (campo === 'user_id' && valor) return { ...p, user_id: valor, funcion: '' };
    if (campo === 'funcion' && valor) return { ...p, funcion: valor, user_id: '' };
    return { ...p, [campo]: valor };
  }));

  const guardar = async () => {
    const limpios = pasos
      .filter(p => (p.etiqueta || '').trim())
      .map(p => ({
        etiqueta: p.etiqueta.trim(), decision: p.decision,
        ...(p.funcion ? { funcion: p.funcion }
                      : (p.user_id ? { user_id: Number(p.user_id) } : {})),
        ...(p.dias ? { dias: Number(p.dias) } : {}),
      }));
    if (!f.nombre.trim()) { toast.error('El flujo necesita un nombre.'); return; }
    if (!limpios.length) { toast.error('Un flujo sin pasos no describe nada.'); return; }
    setGuardando(true);
    try {
      const r = await apiFetch(
        editar ? `${API}/api/review-templates/${inicial.id}` : `${API}/api/review-templates`,
        {
          method: editar ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editar
            ? { nombre: f.nombre.trim(), descripcion: f.descripcion.trim(),
                pasos: limpios, motivo: f.motivo.trim() || undefined }
            : { model_urn: urn, alcance: f.alcance, nombre: f.nombre.trim(),
                descripcion: f.descripcion.trim(), pasos: limpios }),
        });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar.');
      toast.success(editar ? `Guardado — ahora es la versión ${d.version}`
                           : `Flujo «${d.nombre}» creado`);
      onGuardado();
    } catch (e) { toast.error(e.message); } finally { setGuardando(false); }
  };

  return (
    <div onClick={onCerrar}
         style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,26,.45)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: '#fff', borderRadius: 10, padding: 24, width: 660,
                    maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
                    boxShadow: '0 12px 40px rgba(0,0,0,.22)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 650 }}>
          {editar ? `Editar «${inicial.nombre}»` : 'Nuevo flujo de revisión'}
        </h3>

        {editar && (
          <div style={{ ...CAJA, borderColor: '#f0d9a0', background: '#fffaf0',
                        padding: '9px 12px', margin: '10px 0 14px', fontSize: 12.5,
                        color: '#8a5a12', lineHeight: 1.55 }}>
            Va a la <b>versión {(inicial.version || 1) + 1}</b>. Las{' '}
            <b>{inicial.aplicada_a || 0} revisión(es)</b> ya abiertas con este flujo{' '}
            <b>no cambian</b>: cada una guardó los pasos con los que nació. Solo las
            que se abran a partir de ahora usarán la versión nueva.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 10, marginTop: editar ? 0 : 14 }}>
          <input value={f.nombre} onChange={e => setF(p => ({ ...p, nombre: e.target.value }))}
                 placeholder="Nombre — «Aprobación de planos estructurales»"
                 style={{ ...CAJA, flex: 1, height: 38, padding: '0 10px', fontSize: 13 }} />
          {!editar && (
            <select value={f.alcance}
                    onChange={e => setF(p => ({ ...p, alcance: e.target.value }))}
                    style={{ ...CAJA, flex: '0 0 180px', height: 38, padding: '0 8px',
                             fontSize: 13, background: '#fff' }}>
              <option value="OBRA">Solo esta obra</option>
              <option value="ENTIDAD">Toda la entidad</option>
            </select>
          )}
        </div>
        <input value={f.descripcion}
               onChange={e => setF(p => ({ ...p, descripcion: e.target.value }))}
               placeholder="Para qué sirve (opcional)"
               style={{ ...CAJA, width: '100%', height: 36, padding: '0 10px',
                        fontSize: 12.5, marginBottom: 6 }} />
        {f.alcance === 'ENTIDAD' && !editar && (
          <p style={{ margin: '0 0 12px', fontSize: 11.5, color: '#5b4a8a', lineHeight: 1.5 }}>
            Un flujo de la entidad designa <b>funciones</b>, no personas: una persona
            concreta no significa nada en otra obra. Al aplicarlo, la función se
            resuelve contra los miembros de la obra donde se use.
          </p>
        )}

        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#8a9199',
                      letterSpacing: '.05em', margin: '12px 0 7px' }}>
          PASOS, EN ORDEN
        </div>
        {pasos.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6,
                                alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ color: '#98a1ab', fontSize: 12, width: 14 }}>{i + 1}</b>
            <input value={p.etiqueta} onChange={e => cambiar(i, 'etiqueta', e.target.value)}
                   placeholder="Qué paso es"
                   style={{ ...CAJA, flex: 1, minWidth: 130, height: 34, padding: '0 9px',
                            fontSize: 12.5 }} />
            <select value={p.decision} onChange={e => cambiar(i, 'decision', e.target.value)}
                    style={{ ...CAJA, height: 34, fontSize: 12, background: '#fff' }}>
              {(catalogo.decisiones || []).map(d => (
                <option key={d.codigo} value={d.codigo}>{d.etiqueta}</option>
              ))}
            </select>
            {f.alcance === 'OBRA' && (
              <select value={p.user_id || ''} onChange={e => cambiar(i, 'user_id', e.target.value)}
                      style={{ ...CAJA, height: 34, fontSize: 12, background: '#fff',
                               maxWidth: 160 }}>
                <option value="">— persona —</option>
                {miembros.map(m => (
                  <option key={m.id} value={m.id}>{m.name || m.email}</option>
                ))}
              </select>
            )}
            <select value={p.funcion || ''} onChange={e => cambiar(i, 'funcion', e.target.value)}
                    style={{ ...CAJA, height: 34, fontSize: 12, background: '#fff' }}>
              <option value="">— función —</option>
              {(catalogo.funciones || []).map(x => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
            <input type="number" min="1" value={p.dias || ''}
                   onChange={e => cambiar(i, 'dias', e.target.value)}
                   placeholder="días"
                   style={{ ...CAJA, width: 66, height: 34, padding: '0 8px', fontSize: 12 }} />
            <button type="button" onClick={() => setPasos(a => a.filter((_x, n) => n !== i))}
                    style={{ border: 'none', background: 'none', color: '#a12f2f',
                             cursor: 'pointer', fontSize: 15 }}>×</button>
          </div>
        ))}
        {pasos.length < (catalogo.max_pasos || 6) && (
          <button type="button"
                  onClick={() => setPasos(a => [...a, { etiqueta: '', decision: 'REVISA',
                                                        user_id: '', funcion: '', dias: '' }])}
                  style={{ ...CAJA, borderStyle: 'dashed', padding: '4px 11px', fontSize: 12,
                           background: '#fff', cursor: 'pointer', color: '#5f6b76' }}>
            + Añadir paso
          </button>
        )}
        <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#98a1ab', lineHeight: 1.5 }}>
          Cada paso designa <b>una persona o una función</b>, no las dos: al aplicarlo
          no se sabría cuál manda. El plazo se cuenta en días naturales desde que
          empieza ese turno. Máximo {catalogo.max_pasos || 6} pasos
          {catalogo.paralelo === false && ' — y son secuenciales: este motor no tiene pasos en paralelo'}.
        </p>

        {editar && (
          <input value={f.motivo} onChange={e => setF(p => ({ ...p, motivo: e.target.value }))}
                 placeholder="Motivo del cambio (queda en el historial del flujo)"
                 style={{ ...CAJA, width: '100%', height: 34, padding: '0 10px',
                          fontSize: 12.5, marginTop: 12 }} />
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" onClick={onCerrar} disabled={guardando}
                  style={{ ...CAJA, padding: '8px 14px', background: '#fff',
                           fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando}
                  style={{ padding: '8px 16px', borderRadius: 6, border: 'none',
                           background: 'var(--accent, #3E6F91)', color: '#fff', fontSize: 13,
                           fontWeight: 600, cursor: guardando ? 'wait' : 'pointer' }}>
            {guardando ? 'Guardando…' : (editar ? 'Guardar nueva versión' : 'Crear flujo')}
          </button>
        </div>
      </div>
    </div>
  );
}
