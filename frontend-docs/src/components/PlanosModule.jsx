// PlanosModule — GAP 02 · el plano como objeto.
//
// LA PREGUNTA QUE ESTA PANTALLA RESPONDE, Y QUE HOY NO SE PODÍA RESPONDER:
//     ¿CUÁL ES LA REVISIÓN VIGENTE DE ESTE PLANO?
//
// Por eso el número y la revisión vigente son lo primero y lo más grande de
// cada fila. Un plano superado usado en obra es un error caro, y la pantalla
// tiene que hacer que sea difícil equivocarse — no bonito.
//
// Las revisiones superadas NO se esconden: se consultan. Es lo que permite
// responder «qué decía el plano cuando se levantó esta observación», que en
// obra pública es una pregunta con consecuencias.
import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/apiFetch';

const COLOR_REVISION = {
  'Vigente':  { fondo: '#e8f5ec', texto: '#1e6b3a', borde: '#bfe3cc' },
  'Superada': { fondo: '#f3f4f6', texto: '#8a9199', borde: '#e3e5e8' },
  'Anulada':  { fondo: '#fdecec', texto: '#a12f2f', borde: '#f5c9c9' },
};

export default function PlanosModule({ project, API, user, isAdmin }) {
  const [planos, setPlanos] = useState(null);
  const [error, setError] = useState('');
  const [disciplinas, setDisciplinas] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [abierto, setAbierto] = useState(null);
  const [revisiones, setRevisiones] = useState({});
  const [creando, setCreando] = useState(false);
  // LOS SETS son el ACTO DE EMITIR: «la entrega del 15 de marzo». Existían en
  // el backend y no en pantalla, y un dato que no se puede consultar no es una
  // capacidad — es una columna.
  const [sets, setSets] = useState([]);

  const urn = project?.model_urn || project?.urn;

  const cargar = useCallback(async () => {
    if (!urn) return;
    setError('');
    try {
      const q = new URLSearchParams({ model_urn: urn });
      if (filtro) q.set('disciplina', filtro);
      const r = await apiFetch(`${API}/api/planos?${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar.');
      setPlanos(d.planos || []);
    } catch (e) {
      // Vacío y roto no son lo mismo. Si esto falla no se puede leer «no hay
      // planos» — y en esta pantalla esa confusión es peligrosa.
      setPlanos([]);
      setError(e.message || 'No se pudo cargar la lista de planos.');
    }
  }, [API, urn, filtro]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    apiFetch(`${API}/api/planos/catalogo`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setDisciplinas(d.disciplinas || []); })
      .catch(() => {});
  }, [API]);

  useEffect(() => {
    if (!urn) return;
    apiFetch(`${API}/api/planos/sets?model_urn=${encodeURIComponent(urn)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setSets(d.sets || []); })
      .catch(() => {});
  }, [API, urn]);

  const verRevisiones = async (pid) => {
    if (abierto === pid) { setAbierto(null); return; }
    setAbierto(pid);
    if (revisiones[pid]) return;
    try {
      const r = await apiFetch(`${API}/api/planos/${pid}/revisiones`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar.');
      setRevisiones(p => ({ ...p, [pid]: d.revisiones || [] }));
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (planos === null) {
    return <div style={{ padding: 24, fontSize: 13, color: '#888' }}>Cargando planos…</div>;
  }

  return (
    <div style={{ padding: '18px 22px', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 650, color: '#1f2933' }}>Planos</h2>
        <select value={filtro} onChange={e => setFiltro(e.target.value)}
                style={{ padding: '5px 8px', border: '1px solid #dfe3e8', borderRadius: 5,
                         fontSize: 12.5, color: '#5f6b76' }}>
          <option value="">Todas las disciplinas</option>
          {disciplinas.map(d => (
            <option key={d.codigo} value={d.codigo}>{d.etiqueta}</option>
          ))}
        </select>
        <button type="button" onClick={() => setCreando(true)}
                style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: 6,
                         border: 'none', background: 'var(--accent, #3E6F91)', color: '#fff',
                         fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Nuevo plano
        </button>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#78838f',
                  maxWidth: 700, lineHeight: 1.55 }}>
        Cada plano es una <b>identidad</b> —su número— con una serie de revisiones.
        Solo una está <b>vigente</b>; las superadas se conservan para poder
        reconstruir qué decía el plano en una fecha dada.
      </p>

      {error && (
        <div role="alert" style={{ marginBottom: 14, padding: '9px 12px', borderRadius: 6,
                                   background: '#fef2f2', border: '1px solid #fecaca',
                                   color: '#991b1b', fontSize: 12.5 }}>
          {error} <b>La lista está incompleta</b>, no vacía — no la uses para decidir
          qué revisión está vigente.
        </div>
      )}

      {planos.length === 0 && !error && (
        <div style={{ padding: '28px 20px', textAlign: 'center', color: '#98a1ab',
                      fontSize: 13, border: '1px dashed #dfe3e8', borderRadius: 8 }}>
          {filtro ? 'Ningún plano de esa disciplina.' : 'Todavía no hay planos en esta obra.'}
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {planos.map(p => (
          <div key={p.id} style={{ border: '1px solid #e5e8eb', borderRadius: 8,
                                   background: '#fff', overflow: 'hidden' }}>
            <div onClick={() => verRevisiones(p.id)}
                 style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex',
                          alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13,
                             fontWeight: 700, color: '#3E6F91', minWidth: 110 }}>
                {p.numero}
              </span>
              <span style={{ fontSize: 13.5, color: '#1f2933', flex: 1, minWidth: 180 }}>
                {p.titulo}
              </span>
              {p.disciplina && (
                <span style={{ fontSize: 11, color: '#8a9199', border: '1px solid #e5e8eb',
                               borderRadius: 4, padding: '1px 6px' }}>
                  {p.disciplina_etiqueta}
                </span>
              )}
              {/* LO MÁS IMPORTANTE DE LA FILA: qué revisión vale. */}
              {p.vigente ? (
                <span style={{ padding: '3px 10px', borderRadius: 11, fontSize: 12,
                               fontWeight: 700, background: '#e8f5ec', color: '#1e6b3a' }}>
                  rev {p.vigente.codigo} · vigente
                </span>
              ) : (
                <span title="Este plano no tiene ninguna revisión emitida: no hay nada que usar en obra."
                      style={{ padding: '3px 10px', borderRadius: 11, fontSize: 12,
                               fontWeight: 700, background: '#fff4e0', color: '#8a5a12' }}>
                  sin revisión emitida
                </span>
              )}
              <span style={{ fontSize: 11.5, color: '#98a1ab' }}>
                {p.revisiones} {p.revisiones === 1 ? 'revisión' : 'revisiones'}
              </span>
            </div>

            {abierto === p.id && (
              <div style={{ borderTop: '1px solid #f0f2f4', background: '#fbfcfd',
                            padding: '10px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8a9199',
                              letterSpacing: '.04em', marginBottom: 7 }}>
                  HISTORIA DEL PLANO
                </div>
                {!revisiones[p.id] && (
                  <div style={{ fontSize: 12.5, color: '#98a1ab' }}>Cargando…</div>
                )}
                {(revisiones[p.id] || []).map(r => {
                  const c = COLOR_REVISION[r.estado] || COLOR_REVISION['Superada'];
                  return (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
                                             padding: '7px 0', borderBottom: '1px solid #f0f2f4',
                                             flexWrap: 'wrap' }}>
                      <span style={{ padding: '2px 9px', borderRadius: 5, fontSize: 11.5,
                                     fontWeight: 700, background: c.fondo, color: c.texto,
                                     border: `1px solid ${c.borde}` }}>
                        rev {r.codigo}
                      </span>
                      <span style={{ fontSize: 12, color: c.texto, fontWeight: 500 }}>
                        {r.estado}
                      </span>
                      {r.emitida_en && (
                        <span style={{ fontSize: 11.5, color: '#98a1ab' }}>
                          emitida {r.emitida_en.slice(0, 10)}
                        </span>
                      )}
                      {r.superada_en && (
                        <span style={{ fontSize: 11.5, color: '#98a1ab' }}>
                          · superada {r.superada_en.slice(0, 10)}
                        </span>
                      )}
                      {r.set && (
                        <span style={{ fontSize: 11.5, color: '#5f6b76' }}>· {r.set}</span>
                      )}
                      {r.anclajes > 0 && (
                        <span title="Observaciones, RFI o submittals clavados sobre esta revisión concreta"
                              style={{ fontSize: 11.5, color: '#2c5d8a', fontWeight: 600 }}>
                          · {r.anclajes} anclado{r.anclajes === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  );
                })}
                {(revisiones[p.id] || []).length === 0 && revisiones[p.id] && (
                  <div style={{ fontSize: 12.5, color: '#98a1ab', padding: '6px 0' }}>
                    Sin revisiones emitidas todavía.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {sets.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px dashed #e2e8f0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8a9199',
                        letterSpacing: '.04em', marginBottom: 7 }}>
            EMISIONES · qué se entregó y cuándo
          </div>
          {sets.map(x => (
            <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
                                     padding: '6px 0', fontSize: 12.5, color: '#5f6b76',
                                     borderBottom: '1px solid #f2f4f6' }}>
              <b style={{ color: '#1f2933' }}>{x.nombre}</b>
              {x.emitido_en && <span style={{ color: '#98a1ab' }}>{x.emitido_en.slice(0, 10)}</span>}
              <span style={{ marginLeft: 'auto', color: '#98a1ab' }}>
                {x.revisiones} {x.revisiones === 1 ? 'lámina' : 'láminas'}
              </span>
            </div>
          ))}
        </div>
      )}

      {creando && (
        <ModalNuevoPlano API={API} urn={urn} disciplinas={disciplinas}
                         onCerrar={() => setCreando(false)}
                         onCreado={() => { setCreando(false); cargar(); }} />
      )}
    </div>
  );
}

function ModalNuevoPlano({ API, urn, disciplinas, onCerrar, onCreado }) {
  const [f, setF] = useState({ numero: '', titulo: '', disciplina: '' });
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const crear = async () => {
    if (!f.numero.trim() || !f.titulo.trim()) {
      toast.error('El número y el título son obligatorios.');
      return;
    }
    setGuardando(true);
    try {
      const r = await apiFetch(`${API}/api/planos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, model_urn: urn }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo crear.');
      toast.success(`Plano ${d.numero} creado`);
      onCreado();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,26,.45)',
                                     display: 'flex', alignItems: 'center',
                                     justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: '#fff', borderRadius: 10, padding: 24, width: 460,
                    maxWidth: '92vw', boxShadow: '0 12px 40px rgba(0,0,0,.22)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 650 }}>Nuevo plano</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#78838f', lineHeight: 1.5 }}>
          El <b>número es la identidad</b> del plano y no se repite en la obra. Las
          revisiones se emiten después, cada una con su documento.
        </p>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500,
                          color: '#5f6b76', marginBottom: 5 }}>Número *</label>
          <input value={f.numero} onChange={e => set('numero', e.target.value)}
                 placeholder="PL-EST-104"
                 style={{ width: '100%', height: 38, padding: '0 10px', fontSize: 13,
                          fontFamily: 'ui-monospace, monospace',
                          border: '1px solid #dfe3e8', borderRadius: 6, boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500,
                          color: '#5f6b76', marginBottom: 5 }}>Título *</label>
          <input value={f.titulo} onChange={e => set('titulo', e.target.value)}
                 placeholder="Encofrado de losa, eje 4"
                 style={{ width: '100%', height: 38, padding: '0 10px', fontSize: 13,
                          border: '1px solid #dfe3e8', borderRadius: 6, boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500,
                          color: '#5f6b76', marginBottom: 5 }}>Disciplina</label>
          <select value={f.disciplina} onChange={e => set('disciplina', e.target.value)}
                  style={{ width: '100%', height: 38, padding: '0 8px', fontSize: 13,
                           border: '1px solid #dfe3e8', borderRadius: 6 }}>
            <option value="">— sin asignar —</option>
            {disciplinas.map(d => (
              <option key={d.codigo} value={d.codigo}>{d.etiqueta}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCerrar} disabled={guardando}
                  style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #dfe3e8',
                           background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button type="button" onClick={crear} disabled={guardando}
                  style={{ padding: '8px 16px', borderRadius: 6, border: 'none',
                           background: 'var(--accent, #3E6F91)', color: '#fff', fontSize: 13,
                           fontWeight: 600, cursor: guardando ? 'wait' : 'pointer' }}>
            {guardando ? 'Creando…' : 'Crear plano'}
          </button>
        </div>
      </div>
    </div>
  );
}
