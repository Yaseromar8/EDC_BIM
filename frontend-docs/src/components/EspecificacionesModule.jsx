// EspecificacionesModule — GAP 05 · la exigencia del proyecto, con identidad.
//
// LA PREGUNTA QUE ESTA PANTALLA RESPONDE:
//     ¿QUÉ EXIGE EL PROYECTO PARA ESTO, Y EN QUÉ REVISIÓN LO EXIGE?
//
// LAS DOS DECISIONES DE INTERFAZ QUE MÁS IMPORTAN
// ------------------------------------------------
// 1. La REVISIÓN VIGENTE se ve al lado de cada sección, siempre. «Qué sección
//    estoy mirando» y «qué texto vale» son la misma pregunta: separarlas deja
//    una pantalla que enseña una exigencia sin decir si está superada — y
//    contra una exigencia superada se compra material.
//
// 2. Una sección SIN revisión vigente sale en rojo, no en gris. Es el estado
//    peligroso, no un hueco: significa que hay una exigencia registrada contra
//    la que alguien puede someter un material sin que exista texto que la
//    respalde.
//
// LO QUE ESTA PANTALLA NO HACE
// -----------------------------
// No crea submittals. «Someter un material» pide la propuesta al servidor y
// abre el alta REAL de GAP 01, con su veredicto, su BIC y sus permisos. Un
// segundo camino de alta acabaría dejando de comprobar algo que el primero sí
// comprueba, y nadie se daría cuenta hasta que hiciera falta.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/apiFetch';
import SelectorDeDocumento from './SelectorDeDocumento';

const CAJA = { border: '1px solid #dfe3e8', borderRadius: 6, boxSizing: 'border-box' };

const COLOR_REV = {
  'Vigente':  { fondo: '#e8f5ec', texto: '#1e6b3a' },
  'Superada': { fondo: '#f3f4f6', texto: '#8a9199' },
  'Anulada':  { fondo: '#fdecec', texto: '#a12f2f' },
};

export default function EspecificacionesModule({ project, API, user, isAdmin }) {
  const [secciones, setSecciones] = useState(null);
  const [divisiones, setDivisiones] = useState([]);
  const [catalogo, setCatalogo] = useState({ divisiones_sugeridas: [] });
  const [filtro, setFiltro] = useState({ division: '', texto: '' });
  const [error, setError] = useState('');
  const [creando, setCreando] = useState(false);
  const [creandoDivision, setCreandoDivision] = useState(false);
  const [abierta, setAbierta] = useState(null);
  const [sometiendo, setSometiendo] = useState(null);

  const urn = project?.model_urn || project?.urn;

  const cargar = useCallback(async () => {
    if (!urn) return;
    setError('');
    try {
      const q = new URLSearchParams({ model_urn: urn });
      if (filtro.division) q.set('division_id', filtro.division);
      const [rs, rd] = await Promise.all([
        apiFetch(`${API}/api/specs?${q}`),
        apiFetch(`${API}/api/specs/divisiones?model_urn=${encodeURIComponent(urn)}`),
      ]);
      const ds = await rs.json();
      if (!rs.ok) throw new Error(ds.error || 'No se pudo cargar.');
      setSecciones(ds.secciones || []);
      if (rd.ok) setDivisiones((await rd.json()).divisiones || []);
    } catch (e) {
      setSecciones([]);
      setError(e.message || 'No se pudieron cargar las especificaciones.');
    }
  }, [API, urn, filtro.division]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    apiFetch(`${API}/api/specs/catalogo`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setCatalogo(d); })
      .catch(() => {});
  }, [API]);

  const visibles = useMemo(() => {
    const t = filtro.texto.trim().toLowerCase();
    if (!t) return secciones || [];
    return (secciones || []).filter(
      s => (s.numero || '').toLowerCase().includes(t)
        || (s.titulo || '').toLowerCase().includes(t));
  }, [secciones, filtro.texto]);

  const porDivision = useMemo(() => {
    const grupos = new Map();
    visibles.forEach(s => {
      const clave = s.division_numero || '—';
      if (!grupos.has(clave)) {
        grupos.set(clave, { numero: s.division_numero, titulo: s.division_titulo, items: [] });
      }
      grupos.get(clave).items.push(s);
    });
    return [...grupos.values()];
  }, [visibles]);

  const sinVigente = (secciones || []).filter(s => !s.vigente).length;

  const someter = async (seccion) => {
    try {
      const r = await apiFetch(`${API}/api/specs/secciones/${seccion.id}/submittal-propuesto`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo preparar el sometimiento.');
      setSometiendo({ ...d, _seccion: seccion });
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div style={{ padding: '18px 22px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 650, color: '#1f2933' }}>
          Especificaciones
        </h2>
        <span style={{ fontSize: 12.5, color: '#78838f' }}>
          Contra esto se aprueban los materiales.
        </span>
        <div style={{ flex: 1 }} />
        {isAdmin && (
          <button type="button" onClick={() => setCreandoDivision(true)}
                  style={{ ...CAJA, padding: '7px 13px', background: '#fff',
                           fontSize: 13, cursor: 'pointer', color: '#3E6F91' }}>
            Nueva división
          </button>
        )}
        <button type="button" onClick={() => setCreando(true)}
                style={{ padding: '8px 15px', borderRadius: 6, border: 'none',
                         background: 'var(--accent, #3E6F91)', color: '#fff',
                         fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Nueva sección
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0 12px' }}>
        <select value={filtro.division}
                onChange={e => setFiltro(f => ({ ...f, division: e.target.value }))}
                style={{ ...CAJA, height: 34, padding: '0 8px', fontSize: 12.5,
                         background: '#fff', minWidth: 200 }}>
          <option value="">Todas las divisiones</option>
          {divisiones.map(d => (
            <option key={d.id} value={d.id}>
              {d.numero} · {d.titulo} ({d.secciones})
            </option>
          ))}
        </select>
        <input value={filtro.texto}
               onChange={e => setFiltro(f => ({ ...f, texto: e.target.value }))}
               placeholder="Buscar por número o título"
               style={{ ...CAJA, height: 34, padding: '0 10px', fontSize: 12.5, flex: 1,
                        minWidth: 180 }} />
      </div>

      {sinVigente > 0 && (
        <div style={{ ...CAJA, borderColor: '#f5c9c9', background: '#fdf2f2',
                      padding: '9px 13px', marginBottom: 12, fontSize: 12.5,
                      color: '#a12f2f' }}>
          <b>{sinVigente}</b> sección(es) sin revisión vigente: hay exigencias
          registradas sin ningún texto que las respalde. Someter un material contra
          ellas no prueba nada.
        </div>
      )}

      {error && (
        <div style={{ ...CAJA, borderColor: '#f5c9c9', background: '#fdecec',
                      padding: '9px 13px', marginBottom: 12, fontSize: 12.5,
                      color: '#a12f2f' }}>{error}</div>
      )}

      {secciones === null && (
        <div style={{ padding: 30, textAlign: 'center', color: '#98a1ab', fontSize: 13 }}>
          Cargando…
        </div>
      )}

      {secciones !== null && visibles.length === 0 && (
        <div style={{ padding: '26px 20px', textAlign: 'center', color: '#98a1ab',
                      fontSize: 13, border: '1px dashed #dfe3e8', borderRadius: 8,
                      lineHeight: 1.6 }}>
          Sin secciones. Una <b>sección</b> es una exigencia con número propio
          («03 30 00 · Concreto vaciado in situ»), y sus revisiones dicen qué
          texto vale hoy.
        </div>
      )}

      {porDivision.map(g => (
        <div key={g.numero || 'sin'} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8a9199',
                        letterSpacing: '.05em', margin: '0 0 7px' }}>
            {g.numero ? `DIVISIÓN ${g.numero} · ${(g.titulo || '').toUpperCase()}`
                      : 'SIN DIVISIÓN ASIGNADA'}
          </div>
          <div style={{ display: 'grid', gap: 7 }}>
            {g.items.map(s => (
              <FilaSeccion key={s.id} s={s}
                           onAbrir={() => setAbierta(s)}
                           onSometer={() => someter(s)} />
            ))}
          </div>
        </div>
      ))}

      {abierta && (
        <PanelSeccion s={abierta} API={API} project={project} urn={urn}
                      onCerrar={() => setAbierta(null)}
                      onCambio={() => { setAbierta(null); cargar(); }} />
      )}
      {creando && (
        <ModalSeccion API={API} urn={urn} project={project} divisiones={divisiones}
                      onCerrar={() => setCreando(false)}
                      onCreada={() => { setCreando(false); cargar(); }} />
      )}
      {creandoDivision && (
        <ModalDivision API={API} urn={urn} sugeridas={catalogo.divisiones_sugeridas || []}
                       yaCreadas={divisiones}
                       onCerrar={() => setCreandoDivision(false)}
                       onCreada={() => { setCreandoDivision(false); cargar(); }} />
      )}
      {sometiendo && (
        <ModalSometer API={API} urn={urn} propuesta={sometiendo}
                      onCerrar={() => setSometiendo(null)}
                      onCreado={() => { setSometiendo(null); cargar(); }} />
      )}
    </div>
  );
}

function FilaSeccion({ s, onAbrir, onSometer }) {
  const v = s.vigente;
  return (
    <div style={{ ...CAJA, background: '#fff', padding: '10px 13px',
                  borderColor: v ? '#e5e8eb' : '#f0c9c9',
                  display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
      <button type="button" onClick={onAbrir}
              style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                       fontFamily: 'ui-monospace, monospace', fontSize: 12.5,
                       fontWeight: 700, color: '#3E6F91' }}>
        {s.numero}
      </button>
      <span style={{ fontSize: 13.5, color: '#1f2933', flex: 1, minWidth: 150 }}>
        {s.titulo}
      </span>

      {v ? (
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                       background: COLOR_REV.Vigente.fondo, color: COLOR_REV.Vigente.texto }}>
          REV. {v.codigo}
        </span>
      ) : (
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                       background: '#fdecec', color: '#a12f2f' }}>
          SIN REVISIÓN VIGENTE
        </span>
      )}

      <span style={{ fontSize: 11.5, color: '#8a9199' }}>
        {s.revisiones} rev.
      </span>
      {/* Cuantos submittals se han sometido contra esta seccion: el dato que
          dice si la especificacion se esta USANDO o solo guardando. */}
      <span style={{ fontSize: 11.5, color: s.submittals ? '#2c5d8a' : '#c3c9d0' }}
            title="Submittals sometidos contra esta sección">
        {s.submittals} sometimiento(s)
      </span>

      <button type="button" onClick={onSometer}
              style={{ ...CAJA, padding: '4px 10px', background: '#fff', fontSize: 11.5,
                       cursor: 'pointer', color: '#3E6F91', fontWeight: 600 }}>
        Someter material
      </button>
    </div>
  );
}

function PanelSeccion({ s, API, project, urn, onCerrar, onCambio }) {
  const [revisiones, setRevisiones] = useState(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  // EL JUEGO DE EMISION. Igual que en planos: una revision puede emitirse
  // suelta o dentro de una entrega, y saber en cual salio es lo que permite
  // responder «que se entrego el 12 de marzo».
  const [sets, setSets] = useState([]);
  const [setId, setSetId] = useState('');
  const [setNuevo, setSetNuevo] = useState('');

  useEffect(() => {
    apiFetch(`${API}/api/specs/secciones/${s.id}/revisiones`)
      .then(r => (r.ok ? r.json() : { revisiones: [] }))
      .then(d => setRevisiones(d.revisiones || []))
      .catch(() => setRevisiones([]));
  }, [API, s.id]);

  const cargarSets = useCallback(() => {
    if (!urn) return;
    apiFetch(`${API}/api/specs/sets?model_urn=${encodeURIComponent(urn)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setSets(d.sets || []); })
      .catch(() => {});
  }, [API, urn]);
  useEffect(() => { cargarSets(); }, [cargarSets]);

  const crearSet = async () => {
    if (!setNuevo.trim()) return;
    try {
      const r = await apiFetch(`${API}/api/specs/sets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_urn: urn, nombre: setNuevo.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo crear la emisión.');
      toast.success(`Emisión «${d.nombre}» creada`);
      setSetId(d.id);
      setSetNuevo('');
      cargarSets();
    } catch (e) { toast.error(e.message); }
  };

  const emitir = async (doc) => {
    setEligiendo(false);
    setOcupado(true);
    try {
      const r = await apiFetch(`${API}/api/specs/secciones/${s.id}/revisiones`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_node_id: doc.file_node_id,
                               file_version_id: doc.file_version_id,
                               set_id: setId || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo emitir.');
      toast.success(`Revisión ${d.codigo} emitida${d.supera_a ? ' — la anterior queda superada' : ''}`);
      onCambio();
    } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  };

  return (
    <div onClick={onCerrar}
         style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,26,.45)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: '#fff', borderRadius: 10, padding: 24, width: 600,
                    maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto',
                    boxShadow: '0 12px 40px rgba(0,0,0,.22)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13,
                         fontWeight: 700, color: '#3E6F91' }}>{s.numero}</span>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onCerrar}
                  style={{ border: 'none', background: 'none', fontSize: 20,
                           color: '#98a1ab', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <h3 style={{ margin: '8px 0 14px', fontSize: 16.5, fontWeight: 650 }}>{s.titulo}</h3>

        <div style={{ display: 'flex', gap: 7, marginBottom: 9, flexWrap: 'wrap' }}>
          <select value={setId} onChange={e => setSetId(e.target.value)}
                  style={{ ...CAJA, height: 34, padding: '0 8px', fontSize: 12.5,
                           background: '#fff', minWidth: 170 }}>
            <option value="">Emisión: — suelta —</option>
            {sets.map(x => (
              <option key={x.id} value={x.id}>{x.nombre} ({x.revisiones})</option>
            ))}
          </select>
          <input value={setNuevo} onChange={e => setSetNuevo(e.target.value)}
                 placeholder="Nueva emisión — «Absolución de consultas 2»"
                 style={{ ...CAJA, flex: 1, minWidth: 180, height: 34, padding: '0 10px',
                          fontSize: 12.5 }} />
          <button type="button" onClick={crearSet} disabled={!setNuevo.trim()}
                  style={{ ...CAJA, padding: '0 12px', background: '#fff', fontSize: 12.5,
                           cursor: setNuevo.trim() ? 'pointer' : 'not-allowed',
                           color: '#3E6F91' }}>
            Crear
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button type="button" onClick={() => setEligiendo(true)} disabled={ocupado}
                  style={{ padding: '8px 15px', borderRadius: 6, border: 'none',
                           background: 'var(--accent, #3E6F91)', color: '#fff',
                           fontSize: 13, fontWeight: 600,
                           cursor: ocupado ? 'wait' : 'pointer' }}>
            {ocupado ? 'Emitiendo…' : 'Emitir revisión'}
          </button>
          <span style={{ fontSize: 11.5, color: '#8a9199', lineHeight: 1.5 }}>
            La nueva pasa a ser la vigente y la anterior queda <b>superada</b>,
            en el mismo acto.
          </span>
        </div>

        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#8a9199',
                      letterSpacing: '.05em', margin: '0 0 7px' }}>
          REVISIONES
        </div>
        {revisiones === null && (
          <div style={{ fontSize: 12.5, color: '#98a1ab' }}>Cargando…</div>
        )}
        {revisiones !== null && revisiones.length === 0 && (
          <div style={{ ...CAJA, borderStyle: 'dashed', padding: '16px 14px',
                        textAlign: 'center', fontSize: 12.5, color: '#a12f2f',
                        lineHeight: 1.55 }}>
            Esta sección no tiene <b>ninguna revisión</b>. Está registrada como
            exigencia, pero no hay texto que la respalde.
          </div>
        )}
        <div style={{ display: 'grid', gap: 6 }}>
          {(revisiones || []).map(r => {
            const c = COLOR_REV[r.estado] || COLOR_REV.Superada;
            return (
              <div key={r.id} style={{ ...CAJA, padding: '9px 12px', display: 'flex',
                                       alignItems: 'center', gap: 10, flexWrap: 'wrap',
                                       background: r.estado === 'Vigente' ? '#fbfdfc' : '#fff' }}>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5,
                               fontWeight: 700 }}>{r.codigo}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px',
                               borderRadius: 10, background: c.fondo, color: c.texto }}>
                  {r.estado.toUpperCase()}
                </span>
                <span style={{ fontSize: 11.5, color: '#8a9199', flex: 1 }}>
                  emitida {String(r.emitida_en || '').slice(0, 10)}
                  {r.superada_en && ` · superada ${String(r.superada_en).slice(0, 10)}`}
                </span>
                {r.set && (
                  <span style={{ fontSize: 11, color: '#2c5d8a' }}>{r.set}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {eligiendo && (
        <SelectorDeDocumento API={API} project={project}
                             titulo="Elegir el texto de la especificación"
                             ayuda="La revisión apunta a este documento del expediente y fija su versión: si mañana alguien sube otra, esta revisión seguirá diciendo lo que decía hoy."
                             onElegir={emitir} onCerrar={() => setEligiendo(false)} />
      )}
    </div>
  );
}

function ModalDivision({ API, urn, sugeridas, yaCreadas, onCerrar, onCreada }) {
  const [f, setF] = useState({ numero: '', titulo: '' });
  const [guardando, setGuardando] = useState(false);
  const usados = new Set((yaCreadas || []).map(d => d.numero));
  const libres = (sugeridas || []).filter(d => !usados.has(d.numero));

  const crear = async () => {
    if (!f.numero.trim()) { toast.error('La división necesita un número.'); return; }
    setGuardando(true);
    try {
      const r = await apiFetch(`${API}/api/specs/divisiones`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, model_urn: urn }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo crear.');
      toast.success(`División ${d.numero} · ${d.titulo}`);
      onCreada();
    } catch (e) { toast.error(e.message); } finally { setGuardando(false); }
  };

  return (
    <div onClick={onCerrar}
         style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,26,.45)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: '#fff', borderRadius: 10, padding: 24, width: 480,
                    maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto',
                    boxShadow: '0 12px 40px rgba(0,0,0,.22)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 650 }}>Nueva división</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#78838f', lineHeight: 1.5 }}>
          La estructura la fija <b>el contrato de esta obra</b>, no la plataforma.
          Abajo está el catálogo estándar por si sirve; también puedes poner el
          número y el título que use el presupuesto.
        </p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <input value={f.numero} onChange={e => setF(p => ({ ...p, numero: e.target.value }))}
                 placeholder="03"
                 style={{ ...CAJA, flex: '0 0 80px', height: 36, padding: '0 10px',
                          fontSize: 13, fontFamily: 'ui-monospace, monospace' }} />
          <input value={f.titulo} onChange={e => setF(p => ({ ...p, titulo: e.target.value }))}
                 placeholder="Título (si lo dejas vacío y está en el catálogo, se toma de ahí)"
                 style={{ ...CAJA, flex: 1, height: 36, padding: '0 10px', fontSize: 13 }} />
        </div>

        {libres.length > 0 && (
          <>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#8a9199',
                          letterSpacing: '.05em', margin: '10px 0 6px' }}>
              CATÁLOGO ESTÁNDAR
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 16 }}>
              {libres.map(d => (
                <button key={d.numero} type="button"
                        onClick={() => setF({ numero: d.numero, titulo: d.titulo })}
                        style={{ ...CAJA, padding: '3px 9px', background: '#fff',
                                 fontSize: 11.5, cursor: 'pointer', color: '#5f6b76' }}>
                  {d.numero} {d.titulo}
                </button>
              ))}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCerrar} disabled={guardando}
                  style={{ ...CAJA, padding: '8px 14px', background: '#fff',
                           fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button type="button" onClick={crear} disabled={guardando}
                  style={{ padding: '8px 16px', borderRadius: 6, border: 'none',
                           background: 'var(--accent, #3E6F91)', color: '#fff',
                           fontSize: 13, fontWeight: 600,
                           cursor: guardando ? 'wait' : 'pointer' }}>
            {guardando ? 'Creando…' : 'Crear división'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalSeccion({ API, urn, project, divisiones, onCerrar, onCreada }) {
  const [f, setF] = useState({ numero: '', titulo: '', division_id: '' });
  const [doc, setDoc] = useState(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);

  // OCR AL ELEGIR EL DOCUMENTO, como hacen los dos fabricantes. Sugerencias,
  // nunca verdad: rellenan los campos y quien crea confirma o corrige.
  const elegir = async (d) => {
    setEligiendo(false);
    setDoc(d);
    setLeyendo(true);
    setAviso('');
    try {
      const r = await apiFetch(`${API}/api/specs/leer-encabezado`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_urn: urn, file_node_id: d.file_node_id }),
      });
      const s = await r.json();
      if (!r.ok) throw new Error(s.error || 'No se pudo leer.');
      if (!s.tiene_texto) {
        setAviso('Este documento es un escaneo sin capa de texto: no hay nada que '
               + 'leer. Escribe el número y el título a mano.');
      } else {
        setF(p => ({
          numero: p.numero || s.numero || '',
          titulo: p.titulo || s.titulo || '',
          division_id: p.division_id || (divisiones.find(x => x.numero === s.division)?.id || ''),
        }));
        if (!s.numero && !s.titulo) {
          setAviso('El documento tiene texto, pero no se reconoció ningún número de '
                 + 'sección en su encabezado.');
        }
      }
    } catch (e) { setAviso(e.message); } finally { setLeyendo(false); }
  };

  const crear = async () => {
    if (!f.numero.trim() || !f.titulo.trim()) {
      toast.error('El número y el título son obligatorios.'); return;
    }
    setGuardando(true);
    try {
      const r = await apiFetch(`${API}/api/specs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...f, model_urn: urn,
          division_id: f.division_id || null,
          file_node_id: doc?.file_node_id || null,
          file_version_id: doc?.file_version_id || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo crear.');
      toast.success(`${d.numero} registrada${d.vigente ? ` · revisión ${d.vigente.codigo}` : ''}`);
      onCreada();
    } catch (e) { toast.error(e.message); } finally { setGuardando(false); }
  };

  return (
    <div onClick={onCerrar}
         style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,26,.45)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: '#fff', borderRadius: 10, padding: 24, width: 520,
                    maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto',
                    boxShadow: '0 12px 40px rgba(0,0,0,.22)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 650 }}>Nueva sección</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#78838f', lineHeight: 1.5 }}>
          El <b>número es la identidad</b> y no se repite en la obra. Admite las dos
          convenciones: <code>03 30 00</code> y <code>03.02.01</code> — no se
          convierte una en la otra.
        </p>

        <button type="button" onClick={() => setEligiendo(true)}
                style={{ ...CAJA, width: '100%', padding: '10px 12px', background: '#fafbfc',
                         cursor: 'pointer', textAlign: 'left', fontSize: 12.5,
                         marginBottom: 10, color: doc ? '#1f2933' : '#78838f' }}>
          {doc ? `📄 ${doc.nombre}${doc.version ? ` · v${doc.version}` : ''}`
               : '📄 Elegir el documento del expediente (opcional)'}
        </button>
        {leyendo && (
          <div style={{ fontSize: 12, color: '#78838f', marginBottom: 10 }}>
            Leyendo el encabezado…
          </div>
        )}
        {aviso && (
          <div style={{ ...CAJA, borderColor: '#f0d9a0', background: '#fffaf0',
                        padding: '8px 11px', marginBottom: 10, fontSize: 12,
                        color: '#8a5a12', lineHeight: 1.5 }}>{aviso}</div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <input value={f.numero} onChange={e => setF(p => ({ ...p, numero: e.target.value }))}
                 placeholder="03 30 00"
                 style={{ ...CAJA, flex: '0 0 140px', height: 38, padding: '0 10px',
                          fontSize: 13, fontFamily: 'ui-monospace, monospace' }} />
          <input value={f.titulo} onChange={e => setF(p => ({ ...p, titulo: e.target.value }))}
                 placeholder="Concreto vaciado in situ"
                 style={{ ...CAJA, flex: 1, height: 38, padding: '0 10px', fontSize: 13 }} />
        </div>

        <select value={f.division_id}
                onChange={e => setF(p => ({ ...p, division_id: e.target.value }))}
                style={{ ...CAJA, width: '100%', height: 38, padding: '0 8px',
                         fontSize: 13, background: '#fff', marginBottom: 18 }}>
          <option value="">— sin división —</option>
          {divisiones.map(d => (
            <option key={d.id} value={d.id}>{d.numero} · {d.titulo}</option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCerrar} disabled={guardando}
                  style={{ ...CAJA, padding: '8px 14px', background: '#fff',
                           fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button type="button" onClick={crear} disabled={guardando}
                  style={{ padding: '8px 16px', borderRadius: 6, border: 'none',
                           background: 'var(--accent, #3E6F91)', color: '#fff',
                           fontSize: 13, fontWeight: 600,
                           cursor: guardando ? 'wait' : 'pointer' }}>
            {guardando ? 'Creando…' : 'Crear sección'}
          </button>
        </div>
      </div>

      {eligiendo && (
        <SelectorDeDocumento API={API} project={project}
                             titulo="Elegir el texto de la especificación"
                             ayuda="Se leerá su encabezado para sugerir el número y el título. Si no aciertan, se corrigen a mano."
                             onElegir={elegir} onCerrar={() => setEligiendo(false)} />
      )}
    </div>
  );
}

// ── SOMETER UN MATERIAL ────────────────────────────────────────────────────
//
// La propuesta la calcula el SERVIDOR y el alta la hace `POST /api/submittals`,
// que es el mismo camino que usa la pantalla de Submittals. Aquí no hay un
// segundo alta escondido.
function ModalSometer({ API, urn, propuesta, onCerrar, onCreado }) {
  const [f, setF] = useState({ titulo: propuesta.titulo || '',
                               descripcion: propuesta.descripcion || '' });
  const [guardando, setGuardando] = useState(false);

  const crear = async () => {
    if (!f.titulo.trim()) { toast.error('El título es obligatorio.'); return; }
    setGuardando(true);
    try {
      const r = await apiFetch(`${API}/api/submittals`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_urn: urn, titulo: f.titulo, descripcion: f.descripcion,
          spec_section_id: propuesta.spec_section_id,
          spec_seccion: propuesta.spec_seccion,
          spec_titulo: propuesta.spec_titulo,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo crear el submittal.');
      toast.success(`${d.codigo} creado — sigue en Submittals`);
      onCreado();
    } catch (e) { toast.error(e.message); } finally { setGuardando(false); }
  };

  return (
    <div onClick={onCerrar}
         style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,26,.45)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: '#fff', borderRadius: 10, padding: 24, width: 520,
                    maxWidth: '92vw', boxShadow: '0 12px 40px rgba(0,0,0,.22)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 650 }}>
          Someter material
        </h3>
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#78838f', lineHeight: 1.5 }}>
          Contra <b>{propuesta.spec_seccion}</b>
          {propuesta.spec_titulo && ` · ${propuesta.spec_titulo}`}. El submittal
          nace en <b>Submittals</b>, con su flujo de revisión y su veredicto:
          esta pantalla solo lo pone en marcha.
        </p>

        {propuesta.sin_revision_vigente && (
          <div style={{ ...CAJA, borderColor: '#f5c9c9', background: '#fdf2f2',
                        padding: '9px 12px', marginBottom: 12, fontSize: 12.5,
                        color: '#a12f2f', lineHeight: 1.5 }}>
            Esta sección <b>no tiene revisión vigente</b>: no hay texto contra el
            que aprobar nada. Puedes crear el submittal igualmente, pero quien lo
            revise no tendrá exigencia que comprobar.
          </div>
        )}

        <input value={f.titulo} onChange={e => setF(p => ({ ...p, titulo: e.target.value }))}
               style={{ ...CAJA, width: '100%', height: 38, padding: '0 10px',
                        fontSize: 13, marginBottom: 10 }} />
        <textarea value={f.descripcion} rows={3}
                  onChange={e => setF(p => ({ ...p, descripcion: e.target.value }))}
                  style={{ ...CAJA, width: '100%', padding: '8px 10px', fontSize: 12.5,
                           fontFamily: 'inherit', marginBottom: 16 }} />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCerrar} disabled={guardando}
                  style={{ ...CAJA, padding: '8px 14px', background: '#fff',
                           fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button type="button" onClick={crear} disabled={guardando}
                  style={{ padding: '8px 16px', borderRadius: 6, border: 'none',
                           background: 'var(--accent, #3E6F91)', color: '#fff',
                           fontSize: 13, fontWeight: 600,
                           cursor: guardando ? 'wait' : 'pointer' }}>
            {guardando ? 'Creando…' : 'Crear submittal'}
          </button>
        </div>
      </div>
    </div>
  );
}
