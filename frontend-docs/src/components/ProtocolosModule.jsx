// ProtocolosModule — GAP 03 · la conformidad, con consecuencia.
//
// LA PREGUNTA QUE ESTA PANTALLA RESPONDE:
//     ¿ESTA ACTIVIDAD PUEDE SEGUIR, O NO?
//
// No es un formulario. Un formulario recoge datos; un protocolo AUTORIZA O
// IMPIDE. Por eso lo que se ve en grande no son los campos: es el veredicto.
//
// LA DECISIÓN DE INTERFAZ QUE MÁS IMPORTA
// El veredicto QUE CORRESPONDERÍA se muestra ANTES de firmar, y se recalcula
// con cada punto que se marca. Nadie debe descubrir que no libera después de
// haber firmado — y nadie debe poder creer que la pantalla decide: la pantalla
// solo enseña lo que los puntos ya dicen. El servidor lo vuelve a calcular y
// no acepta un veredicto que venga de aquí.
import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/apiFetch';
import { confirmAction } from '../utils/confirm';

const COLOR = {
  'Borrador':    { fondo: '#f1f3f5', texto: '#5f6b76' },
  'Firmada':     { fondo: '#e7f0f9', texto: '#2c5d8a' },
  'Liberado':    { fondo: '#e8f5ec', texto: '#1e6b3a' },
  'No liberado': { fondo: '#fdecec', texto: '#a12f2f' },
  'Anulada':     { fondo: '#f3f4f6', texto: '#8a9199' },
};

const COLOR_RESULTADO = {
  'Conforme':    { fondo: '#e8f5ec', texto: '#1e6b3a' },
  'No conforme': { fondo: '#fdecec', texto: '#a12f2f' },
  'No aplica':   { fondo: '#f3f4f6', texto: '#8a9199' },
  'Pendiente':   { fondo: '#fff4e0', texto: '#8a5a12' },
};

export default function ProtocolosModule({ project, API, user, isAdmin }) {
  const [vista, setVista] = useState('actas');
  const [actas, setActas] = useState(null);
  const [plantillas, setPlantillas] = useState([]);
  const [catalogo, setCatalogo] = useState({ resultados: [], tipos_item: [] });
  const [deuda, setDeuda] = useState({ deuda: [], total_puntos: 0 });
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [levantando, setLevantando] = useState(false);

  const urn = project?.model_urn || project?.urn;

  const cargar = useCallback(async () => {
    if (!urn) return;
    setError('');
    try {
      const [ra, rp, rd] = await Promise.all([
        apiFetch(`${API}/api/protocolos/actas?model_urn=${encodeURIComponent(urn)}`),
        apiFetch(`${API}/api/protocolos/plantillas?model_urn=${encodeURIComponent(urn)}`),
        apiFetch(`${API}/api/protocolos/deuda-escalado?model_urn=${encodeURIComponent(urn)}`),
      ]);
      const da = await ra.json();
      if (!ra.ok) throw new Error(da.error || 'No se pudo cargar.');
      setActas(da.actas || []);
      if (rp.ok) setPlantillas((await rp.json()).plantillas || []);
      if (rd.ok) setDeuda(await rd.json());
    } catch (e) {
      setActas([]);
      setError(e.message || 'No se pudieron cargar las actas.');
    }
  }, [API, urn]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    apiFetch(`${API}/api/protocolos/catalogo`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setCatalogo(d); })
      .catch(() => {});
  }, [API]);

  const marcar = (indice, campo, valor) => {
    setAbierta(a => {
      const items = a.items.map((it, n) => (n === indice ? { ...it, [campo]: valor } : it));
      return { ...a, items };
    });
  };

  const guardar = async () => {
    setOcupado(true);
    try {
      const r = await apiFetch(`${API}/api/protocolos/actas/${abierta.id}/items`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: abierta.items }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar.');
      setAbierta(d);
      toast.success('Guardado');
      await cargar();
    } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  };

  const firmar = async () => {
    const v = abierta.veredicto_que_corresponde;
    if (!await confirmAction({
      titulo: `Firmar ${abierta.codigo}`,
      mensaje: v === 'Liberado'
        ? 'Con lo comprobado, el acta quedará LIBERADA: la actividad puede seguir. '
          + 'Una vez firmada no se edita.'
        : `Con lo comprobado, el acta quedará NO LIBERADA (${abierta.motivo_que_corresponde}). `
          + 'Cada punto no conforme se convertirá en una observación con responsable. '
          + 'Una vez firmada no se edita.',
      confirmar: 'Firmar',
    })) return;

    setOcupado(true);
    try {
      const r = await apiFetch(`${API}/api/protocolos/actas/${abierta.id}/firmar`,
                               { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                 body: JSON.stringify({}) });
      const d = await r.json();
      if (!r.ok) {
        if (d.code === 'FALTA_EVIDENCIA') {
          toast.error(`Faltan evidencias en ${d.faltan.length} punto(s) no conformes.`);
          return;
        }
        throw new Error(d.error || 'No se pudo firmar.');
      }
      setAbierta(d);
      const fall = (d.escalado_fallido || []).length;
      toast.success(fall
        ? `${d.estado} · ${(d.escalados || []).length} observación(es) creada(s), ${fall} sin crear`
        : `${d.estado}${(d.escalados || []).length ? ` · ${d.escalados.length} observación(es)` : ''}`);
      await cargar();
    } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  };

  const reintentarEscalado = async (aid) => {
    setOcupado(true);
    try {
      const r = await apiFetch(`${API}/api/protocolos/actas/${aid}/escalar`,
                               { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                 body: JSON.stringify({}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo reintentar.');
      toast[d.conciliado ? 'success' : 'error'](
        d.conciliado ? 'Escalado conciliado' : `Siguen sin escalar ${d.fallidos.length} punto(s)`);
      await cargar();
    } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  };

  if (actas === null) {
    return <div style={{ padding: 24, fontSize: 13, color: '#888' }}>Cargando protocolos…</div>;
  }

  const soyElAutor = (a) => user?.id && a.autor_id === user.id;

  return (
    <div style={{ padding: '18px 22px', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 650, color: '#1f2933' }}>
          Protocolos
        </h2>
        {['actas', 'plantillas'].map(v => (
          <button key={v} type="button" onClick={() => setVista(v)}
                  style={{ padding: '4px 11px', borderRadius: 5, fontSize: 12.5,
                           border: '1px solid ' + (vista === v ? '#3E6F91' : '#dfe3e8'),
                           background: vista === v ? '#eef4f9' : '#fff',
                           color: vista === v ? '#2c5d8a' : '#5f6b76',
                           fontWeight: vista === v ? 600 : 400, cursor: 'pointer' }}>
            {v === 'actas' ? 'Actas' : 'Plantillas'}
          </button>
        ))}
        {vista === 'actas' && plantillas.length > 0 && (
          <button type="button" onClick={() => setLevantando(true)} disabled={ocupado}
                  style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: 6,
                           border: 'none', background: 'var(--accent, #3E6F91)', color: '#fff',
                           fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Levantar acta
          </button>
        )}
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#78838f',
                  maxWidth: 720, lineHeight: 1.55 }}>
        Un protocolo <b>autoriza o impide</b> una actividad. El veredicto lo dictan
        los puntos comprobados — <b>nadie lo escribe a mano</b>, y un acta con un
        punto no conforme no puede quedar liberada.
      </p>

      {error && (
        <div role="alert" style={{ marginBottom: 14, padding: '9px 12px', borderRadius: 6,
                                   background: '#fef2f2', border: '1px solid #fecaca',
                                   color: '#991b1b', fontSize: 12.5 }}>
          {error} <b>La lista está incompleta</b>, no vacía.
        </div>
      )}

      {/* LA DEUDA DE ESCALADO. Va ARRIBA y en rojo: son no conformidades que
          nadie está reclamando, y esconderlas sería el fallo que el escalado
          existe para impedir. */}
      {deuda.total_puntos > 0 && (
        <div style={{ marginBottom: 16, padding: '11px 13px', borderRadius: 7,
                      background: '#fff7ed', border: '1px solid #fed7aa' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#9a3412', marginBottom: 6 }}>
            ⚠ {deuda.total_puntos} no conformidad(es) sin observación asignada
          </div>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#7c2d12', lineHeight: 1.5 }}>
            Estos puntos quedaron registrados como no conformes pero <b>no llegaron a
            convertirse en una observación con responsable y plazo</b>. Nadie los está
            reclamando todavía.
          </p>
          {deuda.deuda.map(d => (
            <div key={d.acta_id} style={{ display: 'flex', alignItems: 'center', gap: 10,
                                          padding: '5px 0', fontSize: 12, color: '#7c2d12' }}>
              <b>{d.codigo}</b>
              <span>{d.sin_escalar.length} punto(s)</span>
              <span style={{ color: '#9a3412', fontSize: 11 }}>
                {d.sin_escalar[0]?.estado === 'ERROR' ? `· ${d.sin_escalar[0].error?.slice(0, 60)}` : ''}
              </span>
              <button type="button" disabled={ocupado}
                      onClick={() => reintentarEscalado(d.acta_id)}
                      style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 5,
                               border: '1px solid #fdba74', background: '#fff',
                               fontSize: 11.5, fontWeight: 600, color: '#9a3412',
                               cursor: 'pointer' }}>
                Reintentar
              </button>
            </div>
          ))}
        </div>
      )}

      {vista === 'plantillas' && (
        <ListaPlantillas plantillas={plantillas} API={API} urn={urn}
                         catalogo={catalogo} onCambio={cargar} isAdmin={isAdmin} />
      )}

      {vista === 'actas' && (
        <>
          {actas.length === 0 && !error && (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: '#98a1ab',
                          fontSize: 13, border: '1px dashed #dfe3e8', borderRadius: 8 }}>
              {plantillas.length === 0
                ? 'Primero crea una plantilla de protocolo; después se levantan actas con ella.'
                : 'Todavía no hay actas en esta obra.'}
            </div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {actas.map(a => {
              const c = COLOR[a.estado] || COLOR['Borrador'];
              const esta = abierta?.id === a.id;
              return (
                <div key={a.id} style={{ border: '1px solid #e5e8eb', borderRadius: 8,
                                         background: '#fff', overflow: 'hidden' }}>
                  <div onClick={() => setAbierta(esta ? null : a)}
                       style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex',
                                alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5,
                                   fontWeight: 700, color: '#3E6F91' }}>{a.codigo}</span>
                    <span style={{ fontSize: 13.5, color: '#1f2933', flex: 1, minWidth: 160 }}>
                      {a.titulo}
                    </span>
                    {a.ubicacion && (
                      <span style={{ fontSize: 11.5, color: '#8a9199' }}>{a.ubicacion}</span>
                    )}
                    <span style={{ padding: '3px 10px', borderRadius: 11, fontSize: 12,
                                   fontWeight: 700, background: c.fondo, color: c.texto }}>
                      {a.estado}
                    </span>
                    {a.no_conformes > 0 && (
                      <span style={{ fontSize: 11.5, color: '#a12f2f', fontWeight: 600 }}>
                        {a.no_conformes} no conforme{a.no_conformes === 1 ? '' : 's'}
                      </span>
                    )}
                    {a.escalado_pendiente > 0 && (
                      <span title="No conformidades sin observación asignada"
                            style={{ fontSize: 11.5, color: '#9a3412', fontWeight: 700 }}>
                        · {a.escalado_pendiente} sin escalar
                      </span>
                    )}
                  </div>

                  {esta && (
                    <div style={{ borderTop: '1px solid #f0f2f4', padding: '12px 14px',
                                  background: '#fbfcfd' }} onClick={e => e.stopPropagation()}>
                      <div style={{ fontSize: 11.5, color: '#8a9199', marginBottom: 10 }}>
                        Protocolo: <b>{abierta.protocolo_nombre || '—'}</b>
                        {abierta.protocolo_version && ` · v${abierta.protocolo_version}`}
                        {abierta.progresiva && ` · ${abierta.progresiva}`}
                      </div>

                      {abierta.items.map((it, n) => (
                        <Punto key={n} item={it} indice={n} catalogo={catalogo}
                               editable={abierta.estado === 'Borrador' && soyElAutor(abierta)}
                               onMarcar={marcar} />
                      ))}

                      {/* EL VEREDICTO QUE CORRESPONDERÍA, ANTES DE FIRMAR. */}
                      <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 7,
                                    background: abierta.veredicto_que_corresponde === 'Liberado'
                                      ? '#e8f5ec' : '#fdecec',
                                    border: '1px solid ' + (abierta.veredicto_que_corresponde === 'Liberado'
                                      ? '#bfe3cc' : '#f5c9c9') }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700,
                                      color: abierta.veredicto_que_corresponde === 'Liberado'
                                        ? '#1e6b3a' : '#a12f2f' }}>
                          {abierta.estado === 'Borrador' ? 'Con lo comprobado quedaría: ' : ''}
                          {abierta.veredicto_que_corresponde}
                        </div>
                        {abierta.motivo_que_corresponde && (
                          <div style={{ fontSize: 12, color: '#7c2d12', marginTop: 3 }}>
                            {abierta.motivo_que_corresponde}
                          </div>
                        )}
                      </div>

                      {abierta.estado === 'Borrador' && soyElAutor(abierta) && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                          <button type="button" onClick={guardar} disabled={ocupado}
                                  style={{ padding: '7px 14px', borderRadius: 6,
                                           border: '1px solid #cfd6dd', background: '#fff',
                                           fontSize: 12.5, fontWeight: 600, color: '#2c5d8a',
                                           cursor: 'pointer' }}>Guardar</button>
                          <button type="button" onClick={firmar} disabled={ocupado}
                                  style={{ padding: '7px 16px', borderRadius: 6, border: 'none',
                                           background: 'var(--accent, #3E6F91)', color: '#fff',
                                           fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                            Firmar
                          </button>
                        </div>
                      )}

                      {abierta.firmas?.length > 0 && (
                        <div style={{ marginTop: 12, fontSize: 11.5, color: '#8a9199' }}>
                          Firmada por <b>{abierta.firmas[0].como}</b>
                          {abierta.firmada_en && ` · ${abierta.firmada_en.slice(0, 10)}`}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {levantando && (
        <ModalLevantar API={API} urn={urn} plantillas={plantillas}
                       onCerrar={() => setLevantando(false)}
                       onCreada={() => { setLevantando(false); cargar(); }} />
      )}
    </div>
  );
}

function Punto({ item, indice, catalogo, editable, onMarcar }) {
  const c = COLOR_RESULTADO[item.resultado] || COLOR_RESULTADO['Pendiente'];
  const exigeFoto = (item.exige_si_no_conforme || []).includes('foto');
  const exigeObs = (item.exige_si_no_conforme || []).includes('observacion');
  const noConforme = item.resultado === 'No conforme';

  return (
    <div style={{ padding: '9px 0', borderBottom: '1px solid #f0f2f4' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#1f2933', flex: 1, minWidth: 180 }}>
          {item.seccion && (
            <span style={{ color: '#98a1ab', fontSize: 11 }}>{item.seccion} · </span>
          )}
          {item.texto}
        </span>

        {item.tipo === 'conformidad' && (
          editable ? (
            <select value={item.resultado || 'Pendiente'}
                    onChange={e => onMarcar(indice, 'resultado', e.target.value)}
                    style={{ padding: '3px 7px', fontSize: 12, borderRadius: 5,
                             border: '1px solid #dfe3e8' }}>
              {(catalogo.resultados || []).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          ) : (
            <span style={{ padding: '2px 9px', borderRadius: 10, fontSize: 11.5,
                           fontWeight: 600, background: c.fondo, color: c.texto }}>
              {item.resultado || 'Pendiente'}
            </span>
          )
        )}

        {item.tipo !== 'conformidad' && (
          editable ? (
            <input type={item.tipo === 'numero' ? 'number' : item.tipo === 'fecha' ? 'date' : 'text'}
                   value={item.valor || ''}
                   onChange={e => onMarcar(indice, 'valor', e.target.value)}
                   style={{ padding: '3px 7px', fontSize: 12, borderRadius: 5,
                            border: '1px solid #dfe3e8', width: 150 }} />
          ) : (
            <span style={{ fontSize: 12, color: '#5f6b76' }}>{item.valor || '—'}</span>
          )
        )}
      </div>

      {/* LO QUE EL PUNTO EXIGE si se marca no conforme. Se dice ANTES de que
          el servidor lo rechace, para que no sea una sorpresa al firmar. */}
      {noConforme && (
        <div style={{ marginTop: 6, paddingLeft: 12, borderLeft: '2px solid #f5c9c9' }}>
          {exigeObs && (
            editable ? (
              <textarea value={item.observacion || ''} rows={2}
                        onChange={e => onMarcar(indice, 'observacion', e.target.value)}
                        placeholder="Observación (obligatoria para este punto)"
                        style={{ width: '100%', maxWidth: 480, padding: '5px 8px', fontSize: 12,
                                 border: '1px solid ' + (item.observacion ? '#dfe3e8' : '#fca5a5'),
                                 borderRadius: 5, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            ) : (
              <div style={{ fontSize: 12, color: '#5f6b76' }}>{item.observacion || '—'}</div>
            )
          )}
          {exigeFoto && (
            <div style={{ marginTop: 5, fontSize: 11.5,
                          color: (item.fotos || []).length ? '#1e6b3a' : '#a12f2f' }}>
              {(item.fotos || []).length
                ? `✓ ${item.fotos.length} foto(s)`
                : '✕ Este punto exige foto: sin ella no se puede firmar.'}
              {editable && (
                <button type="button"
                        onClick={() => onMarcar(indice, 'fotos',
                                                [...(item.fotos || []), { nombre: `evidencia-${Date.now()}.jpg` }])}
                        style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11,
                                 borderRadius: 4, border: '1px solid #cfd6dd',
                                 background: '#fff', cursor: 'pointer' }}>
                  Adjuntar foto
                </button>
              )}
            </div>
          )}
          {item.redline_codigo && (
            <div style={{ marginTop: 5, fontSize: 11.5, color: '#2c5d8a' }}>
              → Observación <b>{item.redline_codigo}</b> creada
            </div>
          )}
          {item.escalado === 'ERROR' && (
            <div style={{ marginTop: 5, fontSize: 11.5, color: '#9a3412', fontWeight: 600 }}>
              ⚠ No se pudo crear la observación — sigue sin responsable asignado
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ListaPlantillas({ plantillas, API, urn, catalogo, onCambio, isAdmin }) {
  const [creando, setCreando] = useState(false);
  return (
    <div>
      {isAdmin && (
        <button type="button" onClick={() => setCreando(true)}
                style={{ marginBottom: 12, padding: '7px 14px', borderRadius: 6, border: 'none',
                         background: 'var(--accent, #3E6F91)', color: '#fff', fontSize: 13,
                         fontWeight: 600, cursor: 'pointer' }}>
          Nueva plantilla
        </button>
      )}
      {plantillas.length === 0 && (
        <div style={{ padding: '24px 20px', textAlign: 'center', color: '#98a1ab',
                      fontSize: 13, border: '1px dashed #dfe3e8', borderRadius: 8 }}>
          Sin plantillas. Una plantilla define <b>qué hay que comprobar</b>; el acta
          es una aplicación suya.
        </div>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        {plantillas.map(p => (
          <div key={p.id} style={{ border: '1px solid #e5e8eb', borderRadius: 8,
                                   background: '#fff', padding: '11px 14px', display: 'flex',
                                   alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5,
                           fontWeight: 700, color: '#3E6F91' }}>{p.codigo}</span>
            <span style={{ fontSize: 13.5, color: '#1f2933', flex: 1 }}>{p.nombre}</span>
            <span style={{ fontSize: 11.5, color: '#8a9199' }}>{p.puntos} puntos</span>
            <span style={{ fontSize: 11.5, color: '#8a9199' }}>{p.actas} actas</span>
            {!p.activo && (
              <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10,
                             background: '#f3f4f6', color: '#6b7280' }}>DESACTIVADA</span>
            )}
          </div>
        ))}
      </div>
      {creando && (
        <ModalPlantilla API={API} urn={urn} catalogo={catalogo}
                        onCerrar={() => setCreando(false)}
                        onCreada={() => { setCreando(false); onCambio(); }} />
      )}
    </div>
  );
}

function ModalPlantilla({ API, urn, catalogo, onCerrar, onCreada }) {
  const [f, setF] = useState({ codigo: '', nombre: '', disciplina: '' });
  const [items, setItems] = useState([{ texto: '', tipo: 'conformidad', exige_si_no_conforme: ['foto'] }]);
  const [guardando, setGuardando] = useState(false);

  const crear = async () => {
    if (!f.codigo.trim() || !f.nombre.trim()) { toast.error('Código y nombre obligatorios.'); return; }
    const limpios = items.filter(i => i.texto.trim());
    if (!limpios.length) { toast.error('Añade al menos un punto a comprobar.'); return; }
    setGuardando(true);
    try {
      const r = await apiFetch(`${API}/api/protocolos/plantillas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, model_urn: urn,
                               secciones: [{ nombre: 'General', items: limpios }] }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo crear.');
      toast.success(`Plantilla ${d.codigo} creada`);
      onCreada();
    } catch (e) { toast.error(e.message); } finally { setGuardando(false); }
  };

  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,26,.45)',
                                     display: 'flex', alignItems: 'center', justifyContent: 'center',
                                     zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: '#fff', borderRadius: 10, padding: 24, width: 560,
                    maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto',
                    boxShadow: '0 12px 40px rgba(0,0,0,.22)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 650 }}>Nueva plantilla</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#78838f', lineHeight: 1.5 }}>
          Define <b>qué hay que comprobar</b>. Cada acta que se levante con ella
          copia estos puntos y los congela: editar la plantilla después no cambia
          las actas ya firmadas.
        </p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <input value={f.codigo} onChange={e => setF(p => ({ ...p, codigo: e.target.value }))}
                 placeholder="Código (PROT-01)"
                 style={{ flex: '0 0 150px', height: 36, padding: '0 10px', fontSize: 13,
                          border: '1px solid #dfe3e8', borderRadius: 6, boxSizing: 'border-box' }} />
          <input value={f.nombre} onChange={e => setF(p => ({ ...p, nombre: e.target.value }))}
                 placeholder="Nombre del protocolo"
                 style={{ flex: 1, height: 36, padding: '0 10px', fontSize: 13,
                          border: '1px solid #dfe3e8', borderRadius: 6, boxSizing: 'border-box' }} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: '#8a9199',
                      letterSpacing: '.04em', margin: '4px 0 7px' }}>
          PUNTOS A COMPROBAR
        </div>
        {items.map((it, n) => (
          <div key={n} style={{ display: 'flex', gap: 7, marginBottom: 7, alignItems: 'center' }}>
            <input value={it.texto}
                   onChange={e => setItems(a => a.map((x, i) => i === n ? { ...x, texto: e.target.value } : x))}
                   placeholder="Qué se comprueba"
                   style={{ flex: 1, height: 34, padding: '0 9px', fontSize: 12.5,
                            border: '1px solid #dfe3e8', borderRadius: 5, boxSizing: 'border-box' }} />
            <select value={it.tipo}
                    onChange={e => setItems(a => a.map((x, i) => i === n ? { ...x, tipo: e.target.value } : x))}
                    style={{ height: 34, fontSize: 12, border: '1px solid #dfe3e8', borderRadius: 5 }}>
              {(catalogo.tipos_item || []).map(t => (
                <option key={t.codigo} value={t.codigo}>{t.codigo}</option>
              ))}
            </select>
            <label style={{ fontSize: 11.5, color: '#5f6b76', display: 'flex',
                            alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                   title="Si se marca No conforme, exigirá foto">
              <input type="checkbox"
                     checked={(it.exige_si_no_conforme || []).includes('foto')}
                     onChange={e => setItems(a => a.map((x, i) => i === n
                       ? { ...x, exige_si_no_conforme: e.target.checked ? ['foto'] : [] } : x))} />
              foto
            </label>
          </div>
        ))}
        <button type="button"
                onClick={() => setItems(a => [...a, { texto: '', tipo: 'conformidad', exige_si_no_conforme: [] }])}
                style={{ padding: '4px 11px', fontSize: 12, borderRadius: 5,
                         border: '1px dashed #cfd6dd', background: '#fff', cursor: 'pointer',
                         color: '#5f6b76', marginBottom: 16 }}>
          + Añadir punto
        </button>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCerrar} disabled={guardando}
                  style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #dfe3e8',
                           background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button type="button" onClick={crear} disabled={guardando}
                  style={{ padding: '8px 16px', borderRadius: 6, border: 'none',
                           background: 'var(--accent, #3E6F91)', color: '#fff', fontSize: 13,
                           fontWeight: 600, cursor: guardando ? 'wait' : 'pointer' }}>
            {guardando ? 'Creando…' : 'Crear plantilla'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalLevantar({ API, urn, plantillas, onCerrar, onCreada }) {
  const [f, setF] = useState({ protocolo_id: '', titulo: '', ubicacion: '', progresiva: '' });
  const [guardando, setGuardando] = useState(false);

  const crear = async () => {
    if (!f.protocolo_id) { toast.error('Elige el protocolo.'); return; }
    setGuardando(true);
    try {
      const r = await apiFetch(`${API}/api/protocolos/actas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, model_urn: urn }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo levantar.');
      toast.success(`${d.codigo} levantada · ${d.items.length} puntos`);
      onCreada();
    } catch (e) { toast.error(e.message); } finally { setGuardando(false); }
  };

  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,26,.45)',
                                     display: 'flex', alignItems: 'center', justifyContent: 'center',
                                     zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: '#fff', borderRadius: 10, padding: 24, width: 470,
                    maxWidth: '92vw', boxShadow: '0 12px 40px rgba(0,0,0,.22)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 650 }}>Levantar acta</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#78838f', lineHeight: 1.5 }}>
          Los puntos del protocolo se <b>copian</b> a esta acta y quedan fijos: si
          la plantilla cambia mañana, esta acta seguirá diciendo lo que se comprobó hoy.
        </p>
        <select value={f.protocolo_id} onChange={e => setF(p => ({ ...p, protocolo_id: e.target.value }))}
                style={{ width: '100%', height: 38, padding: '0 8px', fontSize: 13,
                         border: '1px solid #dfe3e8', borderRadius: 6, marginBottom: 12 }}>
          <option value="">Elegir protocolo…</option>
          {plantillas.filter(p => p.activo).map(p => (
            <option key={p.id} value={p.id}>{p.codigo} — {p.nombre} ({p.puntos} puntos)</option>
          ))}
        </select>
        {[['titulo', 'Título (opcional, toma el del protocolo)'],
          ['ubicacion', 'Ubicación — «Losa eje 4, nivel +3.20»'],
          ['progresiva', 'Progresiva — «PK 0+340»']].map(([k, ph]) => (
          <input key={k} value={f[k]} onChange={e => setF(p => ({ ...p, [k]: e.target.value }))}
                 placeholder={ph}
                 style={{ width: '100%', height: 36, padding: '0 10px', fontSize: 13,
                          border: '1px solid #dfe3e8', borderRadius: 6, marginBottom: 10,
                          boxSizing: 'border-box' }} />
        ))}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" onClick={onCerrar} disabled={guardando}
                  style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #dfe3e8',
                           background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button type="button" onClick={crear} disabled={guardando}
                  style={{ padding: '8px 16px', borderRadius: 6, border: 'none',
                           background: 'var(--accent, #3E6F91)', color: '#fff', fontSize: 13,
                           fontWeight: 600, cursor: guardando ? 'wait' : 'pointer' }}>
            {guardando ? 'Levantando…' : 'Levantar'}
          </button>
        </div>
      </div>
    </div>
  );
}
