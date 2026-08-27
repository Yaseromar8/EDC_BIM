/**
 * NG-03 · CUADERNO DE OBRA — parte diario, asientos e instrucciones (doc 96).
 *
 * LO QUE ESTA PANTALLA DEFIENDE:
 *   - Tres objetos, no uno: el PARTE es la jornada (obra + fecha OPERATIVA
 *     declarada), el ASIENTO es un registro tipado con correlativo POR OBRA,
 *     la INSTRUCCIÓN es un acto formal con acuse.
 *   - Nada se edita: un asiento se corrige con OTRO asiento que lo referencia;
 *     una instrucción emitida se RECTIFICA con una nueva. No hay lápiz.
 *   - Sin red: abrir el parte y registrar asientos ENCOLAN por el motor del
 *     GAP 07. Aprobar, cerrar la jornada y emitir instrucciones EXIGEN
 *     conexión — a propósito, y la pantalla lo dice con esas palabras.
 *   - Una foto se CITA por su id canónico; jamás se copia al parte.
 */
import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/apiFetch';
import * as campo from '../offline/captura';

/* El MISMO catálogo cerrado que cuaderno_de_obra.TIPOS_DE_ASIENTO y el CHECK
 * de la base — hay un tripwire en el backend que los casa: si esta lista
 * diverge, la suite lo dice. */
export const TIPOS_DE_ASIENTO = [
  ['avance', 'Avance de obra'],
  ['personal', 'Personal'],
  ['equipos', 'Equipos'],
  ['materiales', 'Materiales'],
  ['clima', 'Clima'],
  ['seguridad', 'Seguridad'],
  ['calidad', 'Calidad'],
  ['restriccion', 'Restricción / paralización'],
  ['visita', 'Visita'],
  ['foto', 'Foto (cita)'],
  ['instruccion', 'Instrucción (cita)'],
  ['rectificacion', 'Rectificación'],
  ['nota', 'Nota'],
];
const ETIQUETA_TIPO = Object.fromEntries(TIPOS_DE_ASIENTO);

const COLOR_ESTADO = {
  ABIERTO: '#1f6b3a', CERRADO: '#5a6b7d',
  REGISTRADO: '#1f6b3a', EN_APROBACION: '#8a5a00', APROBADO: '#1f6b3a',
  DEVUELTO: '#8a2020',
  EMITIDA: '#8a5a00', ACUSADA: '#2c5d8a', ATENDIDA: '#1f6b3a',
  CERRADA: '#5a6b7d', RECTIFICADA: '#8a2020',
};

const CAJA = { border: '1px solid #d5dde6', borderRadius: 6, padding: '7px 9px',
               fontSize: 13, width: '100%' };
const BTN = { padding: '6px 12px', borderRadius: 6, fontSize: 12.5,
              border: '1px solid #c8d4e3', background: '#fff', cursor: 'pointer' };
const BTN_OSCURO = { ...BTN, border: 'none', background: '#16202b', color: '#fff',
                     fontWeight: 600 };

function Chip({ texto, color }) {
  return <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff',
                        background: color || '#5a6b7d', padding: '2px 7px',
                        borderRadius: 4 }}>{texto}</span>;
}

/** La fecha OPERATIVA del dispositivo: el día LOCAL de la obra (Lima), nunca
 *  el día UTC — a las 7 pm de Lima, UTC ya vive en mañana (regla congelada). */
function hoyOperativo() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Guardia de los actos SOLO EN LÍNEA. Devuelve true si hay que abortar. */
function exigeConexion(queCosa) {
  if (!navigator.onLine) {
    toast.error(`${queCosa} exige conexión: es un acto formal y la autoridad ` +
                'se revalida al momento. Lo capturado sin red no se pierde — ' +
                'este acto simplemente espera a la cobertura.', { duration: 6000 });
    return true;
  }
  return false;
}

// ── EL FORMULARIO DE ASIENTO ────────────────────────────────────────────────

function FilasEditor({ campos, filas, setFilas }) {
  return (
    <div style={{ marginBottom: 8 }}>
      {filas.map((fila, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          {campos.map(c => (
            <input key={c} placeholder={c} value={fila[c] || ''} style={CAJA}
                   onChange={e => setFilas(fs => fs.map((f, j) =>
                     j === i ? { ...f, [c]: e.target.value } : f))} />
          ))}
          <button style={BTN} onClick={() => setFilas(fs => fs.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button style={BTN} onClick={() => setFilas(fs => [...fs, {}])}>+ fila</button>
    </div>
  );
}

function FormAsiento({ API, urn, parte, fotos, instrucciones, user, project,
                       onRegistrado, onCancelar }) {
  const [tipo, setTipo] = useState('avance');
  const [texto, setTexto] = useState('');
  const [est, setEst] = useState({});      // campos estructurados según tipo
  const [filas, setFilas] = useState([]);  // personal / equipos / materiales
  const [refs, setRefs] = useState({});
  const [clima, setClima] = useState(null);          // lo traído del proveedor
  const [correccion, setCorreccion] = useState({});  // corrección manual sobre él
  const [ocupado, setOcupado] = useState(false);

  const traerClima = async () => {
    if (exigeConexion('Consultar el clima')) return;
    const r = await apiFetch(`${API}/api/cuaderno/clima?model_urn=${encodeURIComponent(urn)}&fecha=${parte.fecha_operativa}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(d.error || 'El proveedor no respondió.'); return; }
    setClima(d);
  };

  const registrar = async () => {
    let contenido = { ...est };
    const CAMPOS_FILAS = { personal: 1, equipos: 1, materiales: 1 };
    if (CAMPOS_FILAS[tipo]) contenido = { filas: filas.filter(f => Object.keys(f).length) };
    if (tipo === 'clima') {
      if (clima) {
        // La procedencia COMPLETA viaja con el asiento; la corrección manual
        // NO reemplaza: quedan lo recibido y lo corregido, juntos.
        contenido = { origen: 'proveedor', proveedor: clima.proveedor,
                      consultado_en: clima.consultado_en, fecha: clima.fecha,
                      lat: clima.lat, lon: clima.lon,
                      dato: clima.dato, dato_recibido: clima.dato_recibido };
        const valores = Object.fromEntries(
          Object.entries(correccion).filter(([, v]) => v !== '' && v != null));
        if (Object.keys(valores).length) contenido.correccion = { valores };
      } else {
        contenido = { origen: 'manual', dato: { ...est } };
      }
    }
    const referencias = { ...refs };
    setOcupado(true);
    try {
      const ctx = campo.contextoDe(user, project);
      const res = await campo.capturar(API, ctx, {
        object_type: 'ASIENTO', action: campo.CREATE,
        local_object_id: campo.nuevoObjetoLocal(),
        payload: { parte_id: parte.id || undefined,
                   parte_local: parte.local_object_id || undefined,
                   fecha_operativa: parte.fecha_operativa,
                   tipo, texto, contenido, referencias },
        depende_de: parte.operation_id || undefined,
        enLinea: parte.id ? async () => {
          const r = await apiFetch(`${API}/api/cuaderno/partes/${parte.id}/asientos`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo, texto, contenido, referencias }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || 'no entró');
          return d;
        } : undefined,
      });
      if (res.modo === 'servidor') {
        toast.success('Asiento registrado en el cuaderno.');
      } else if (res.veredicto) {
        toast.error(`El servidor lo dejó en ${res.veredicto.status}: ${res.veredicto.error || ''}`);
      } else {
        toast.success('Asiento guardado EN ESTE DISPOSITIVO — entrará al ' +
                      'cuaderno con cobertura (míralo en Trabajo de campo).',
                      { duration: 6000 });
      }
      onRegistrado();
    } catch (e) {
      toast.error(e.message || 'No se pudo registrar.');
    } finally { setOcupado(false); }
  };

  const num = (v) => (v === '' ? '' : v);
  return (
    <div style={{ border: '1px solid #d5dde6', borderRadius: 10, padding: 14,
                  margin: '10px 0', background: '#fafcfe' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <select value={tipo} style={CAJA}
                onChange={e => { setTipo(e.target.value); setEst({}); setRefs({}); setFilas([]); }}>
          {TIPOS_DE_ASIENTO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {tipo === 'avance' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input placeholder="Progresiva (ej. 0+640)" style={CAJA} value={est.progresiva || ''}
                 onChange={e => setEst(p => ({ ...p, progresiva: e.target.value }))} />
          <input placeholder="Frente" style={CAJA} value={est.frente || ''}
                 onChange={e => setEst(p => ({ ...p, frente: e.target.value }))} />
          <input placeholder="Partida" style={CAJA} value={est.partida || ''}
                 onChange={e => setEst(p => ({ ...p, partida: e.target.value }))} />
        </div>
      )}
      {tipo === 'personal' && <FilasEditor campos={['empresa', 'categoria', 'cantidad']}
                                           filas={filas} setFilas={setFilas} />}
      {tipo === 'equipos' && <FilasEditor campos={['equipo', 'cantidad', 'horas']}
                                          filas={filas} setFilas={setFilas} />}
      {tipo === 'materiales' && <FilasEditor campos={['material', 'cantidad', 'unidad', 'movimiento']}
                                             filas={filas} setFilas={setFilas} />}
      {tipo === 'restriccion' && (
        <input placeholder="Horas afectadas" style={{ ...CAJA, marginBottom: 8 }}
               value={est.horas_afectadas || ''}
               onChange={e => setEst(p => ({ ...p, horas_afectadas: e.target.value }))} />
      )}
      {tipo === 'visita' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input placeholder="Quién" style={CAJA} value={est.quien || ''}
                 onChange={e => setEst(p => ({ ...p, quien: e.target.value }))} />
          <input placeholder="Entidad" style={CAJA} value={est.entidad || ''}
                 onChange={e => setEst(p => ({ ...p, entidad: e.target.value }))} />
          <input placeholder="Motivo" style={CAJA} value={est.motivo || ''}
                 onChange={e => setEst(p => ({ ...p, motivo: e.target.value }))} />
        </div>
      )}

      {tipo === 'clima' && (
        <div style={{ marginBottom: 8 }}>
          <button style={BTN} onClick={traerClima}>
            Traer clima de la obra (Open-Meteo)
          </button>
          {clima && (
            <div style={{ fontSize: 12.5, marginTop: 8, color: '#33475b' }}>
              <b>{clima.dato.cielo}</b> · {clima.dato.temperatura_min}–{clima.dato.temperatura_max} °C ·
              precip. {clima.dato.precipitacion_mm} mm · viento {clima.dato.viento_kmh} km/h
              <div style={{ color: '#78838f', marginTop: 2 }}>
                origen: {clima.proveedor} · consultado {new Date(clima.consultado_en).toLocaleString('es-PE')} ·
                coordenadas DE LA OBRA ({clima.lat?.toFixed?.(4)}, {clima.lon?.toFixed?.(4)})
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input placeholder="Corregir precip. (mm)" style={CAJA}
                       value={num(correccion.precipitacion_mm ?? '')}
                       onChange={e => setCorreccion(p => ({ ...p, precipitacion_mm: e.target.value }))} />
                <input placeholder="Corregir cielo" style={CAJA}
                       value={correccion.cielo || ''}
                       onChange={e => setCorreccion(p => ({ ...p, cielo: e.target.value }))} />
              </div>
              <div style={{ fontSize: 11.5, color: '#8a5a00', marginTop: 2 }}>
                La corrección NO reemplaza el dato recibido: quedan los dos, con quién corrigió.
              </div>
            </div>
          )}
          {!clima && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input placeholder="Cielo (manual)" style={CAJA} value={est.cielo || ''}
                     onChange={e => setEst(p => ({ ...p, cielo: e.target.value }))} />
              <input placeholder="Precip. mm" style={CAJA} value={est.precipitacion_mm || ''}
                     onChange={e => setEst(p => ({ ...p, precipitacion_mm: e.target.value }))} />
              <input placeholder="Temp. °C" style={CAJA} value={est.temperatura || ''}
                     onChange={e => setEst(p => ({ ...p, temperatura: e.target.value }))} />
            </div>
          )}
        </div>
      )}

      {tipo === 'foto' && (
        <select style={{ ...CAJA, marginBottom: 8 }} value={refs.foto_id || ''}
                onChange={e => setRefs({ foto_id: Number(e.target.value) || undefined })}>
          <option value="">— citar una foto de la galería (no se copia) —</option>
          {(fotos || []).map(f => (
            <option key={f.id} value={f.id}>
              {f.nombre || 'foto'} {f.progresiva ? `· ${f.progresiva}` : ''} · id {f.id}
            </option>
          ))}
        </select>
      )}
      {tipo === 'instruccion' && (
        <select style={{ ...CAJA, marginBottom: 8 }} value={refs.instruccion_id || ''}
                onChange={e => setRefs({ instruccion_id: Number(e.target.value) || undefined })}>
          <option value="">— citar una instrucción —</option>
          {(instrucciones || []).map(i => (
            <option key={i.id} value={i.id}>{i.codigo} · {i.asunto}</option>
          ))}
        </select>
      )}
      {tipo === 'rectificacion' && (
        <input placeholder="id del asiento que se rectifica (visible en su tarjeta)"
               style={{ ...CAJA, marginBottom: 8 }} value={refs.asiento_id || ''}
               onChange={e => setRefs({ asiento_id: Number(e.target.value) || undefined })} />
      )}
      {(tipo === 'seguridad' || tipo === 'calidad') && (
        <input placeholder="id de issue relacionado (opcional)"
               style={{ ...CAJA, marginBottom: 8 }} value={refs.issue_id || ''}
               onChange={e => setRefs(p => ({ ...p, issue_id: Number(e.target.value) || undefined }))} />
      )}

      <textarea placeholder="Texto del asiento" rows={3} value={texto}
                style={{ ...CAJA, marginBottom: 10, resize: 'vertical' }}
                onChange={e => setTexto(e.target.value)} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button style={BTN} onClick={onCancelar}>Cancelar</button>
        <button style={BTN_OSCURO} disabled={ocupado} onClick={registrar}>
          {ocupado ? 'Registrando…' : 'Registrar asiento'}
        </button>
      </div>
    </div>
  );
}

// ── EL PARTE ────────────────────────────────────────────────────────────────

function TarjetaAsiento({ asiento, onAprobar, onDevolver }) {
  const a = asiento;
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px',
                  marginBottom: 8, background: '#fff' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13 }}>N.º {a.numero}</b>
        <span style={{ fontSize: 12, color: '#5a6b7d' }}>{ETIQUETA_TIPO[a.tipo] || a.tipo}</span>
        <Chip texto={a.estado} color={COLOR_ESTADO[a.estado]} />
        <span style={{ fontSize: 11, color: '#9aa7b4', marginLeft: 'auto' }}>
          {a.created_by} {a.autor_funcion ? `· ${a.autor_funcion}` : '· sin función'} · id {a.id}
        </span>
      </div>
      {a.texto && <div style={{ fontSize: 13, marginTop: 6 }}>{a.texto}</div>}
      {a.contenido && a.contenido.dato && (
        <div style={{ fontSize: 12, color: '#33475b', marginTop: 4 }}>
          {a.contenido.dato.cielo} {a.contenido.origen === 'proveedor'
            ? `· ${a.contenido.proveedor} (obra: ${a.contenido.lat?.toFixed?.(3)}, ${a.contenido.lon?.toFixed?.(3)})`
            : '· registro manual'}
          {a.contenido.correccion && <b> · corregido a mano (se conservan los dos)</b>}
        </div>
      )}
      {a.contenido && a.contenido.filas && a.contenido.filas.length > 0 && (
        <div style={{ fontSize: 12, color: '#33475b', marginTop: 4 }}>
          {a.contenido.filas.map((f, i) => <div key={i}>· {Object.values(f).join(' — ')}</div>)}
        </div>
      )}
      {a.contenido && (a.contenido.progresiva || a.contenido.frente) && (
        <div style={{ fontSize: 12, color: '#5a6b7d', marginTop: 4 }}>
          {a.contenido.progresiva && <>prog. {a.contenido.progresiva} </>}
          {a.contenido.frente && <>· frente {a.contenido.frente} </>}
          {a.contenido.partida && <>· partida {a.contenido.partida}</>}
        </div>
      )}
      {Object.keys(a.referencias || {}).length > 0 && (
        <div style={{ fontSize: 11.5, color: '#2c5d8a', marginTop: 4 }}>
          cita: {Object.entries(a.referencias).map(([k, v]) => `${k}=${v}`).join(' · ')}
        </div>
      )}
      {a.estado === 'DEVUELTO' && (
        <div style={{ fontSize: 12, color: '#8a2020', marginTop: 4 }}>
          Devuelto: {a.motivo_devolucion} — se corrige RE-REGISTRANDO otro asiento
          que lo referencia (id {a.id}); este queda tal cual.
        </div>
      )}
      {a.estado === 'EN_APROBACION' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button style={{ ...BTN, color: '#1f6b3a' }} onClick={() => onAprobar(a)}>Aprobar</button>
          <button style={{ ...BTN, color: '#8a2020' }} onClick={() => onDevolver(a)}>Devolver</button>
        </div>
      )}
    </div>
  );
}

// ── LAS INSTRUCCIONES ───────────────────────────────────────────────────────

function FormInstruccion({ API, urn, obraId, rectifica, onEmitida, onCancelar }) {
  const [f, setF] = useState({ asunto: rectifica ? `Rectifica ${rectifica.codigo}: ${rectifica.asunto}` : '',
                               contenido: '' });
  const [tipoDest, setTipoDest] = useState('empresa');
  const [dest, setDest] = useState('');
  const [miembros, setMiembros] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    apiFetch(`${API}/api/projects/${encodeURIComponent(obraId)}/miembros`)
      .then(r => (r.ok ? r.json() : { miembros: [] }))
      .then(d => setMiembros(d.miembros || [])).catch(() => {});
    apiFetch(`${API}/api/projects/${encodeURIComponent(obraId)}/participantes`)
      .then(r => (r.ok ? r.json() : {}))
      .then(d => setEmpresas(d.participantes || [])).catch(() => {});
  }, [API, obraId]);

  const emitir = async () => {
    if (exigeConexion('Emitir una instrucción')) return;
    if (!dest) { toast.error('Elige el destinatario: una persona o una empresa concretas.'); return; }
    setOcupado(true);
    const destinatario = tipoDest === 'persona'
      ? { tipo: 'persona', usuario_id: Number(dest) }
      : { tipo: 'empresa', empresa_id: Number(dest) };
    const r = await apiFetch(`${API}/api/cuaderno/instrucciones`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_urn: urn, ...f, destinatario,
                             rectifica_a: rectifica?.id }),
    });
    const d = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) { toast.error(d.error || 'No se pudo emitir.'); return; }
    toast.success(`${d.codigo} emitida${rectifica ? ` — ${rectifica.codigo} queda RECTIFICADA, visible` : ''}.`);
    onEmitida();
  };

  return (
    <div style={{ border: '1px solid #d5dde6', borderRadius: 10, padding: 14,
                  margin: '10px 0', background: '#fafcfe' }}>
      <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>
        {rectifica ? `Rectificar ${rectifica.codigo} (emite una instrucción NUEVA; la anterior queda visible)` : 'Emitir instrucción de obra'}
      </h4>
      <input placeholder="Asunto" value={f.asunto} style={{ ...CAJA, marginBottom: 8 }}
             onChange={e => setF(p => ({ ...p, asunto: e.target.value }))} />
      <textarea placeholder="Contenido de la instrucción" rows={4} value={f.contenido}
                style={{ ...CAJA, marginBottom: 8, resize: 'vertical' }}
                onChange={e => setF(p => ({ ...p, contenido: e.target.value }))} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <select value={tipoDest} style={{ ...CAJA, width: 180 }}
                onChange={e => { setTipoDest(e.target.value); setDest(''); }}>
          <option value="empresa">A una empresa</option>
          <option value="persona">A una persona</option>
        </select>
        <select value={dest} style={CAJA} onChange={e => setDest(e.target.value)}>
          <option value="">— destinatario concreto (nunca «una función») —</option>
          {tipoDest === 'persona'
            ? miembros.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)
            : empresas.map(e2 => <option key={e2.company_id || e2.id} value={e2.company_id || e2.id}>
                {e2.nombre || e2.name} · {e2.funcion}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button style={BTN} onClick={onCancelar}>Cancelar</button>
        <button style={BTN_OSCURO} disabled={ocupado} onClick={emitir}>
          {ocupado ? 'Emitiendo…' : 'Emitir'}
        </button>
      </div>
    </div>
  );
}

function TarjetaInstruccion({ instr, onAccion, onRectificar }) {
  const d = instr;
  const dest = d.destinatario || {};
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px',
                  marginBottom: 8, background: '#fff' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13 }}>{d.codigo}</b>
        <Chip texto={d.estado} color={COLOR_ESTADO[d.estado]} />
        {d.rectifica_a && <span style={{ fontSize: 11, color: '#8a2020' }}>rectifica a #{d.rectifica_a}</span>}
        <span style={{ fontSize: 11, color: '#9aa7b4', marginLeft: 'auto' }}>
          {d.emisor_funcion} → {dest.tipo === 'empresa'
            ? `${dest.empresa} (empresa · ${dest.funcion || 's/f'})`
            : `${dest.nombre || dest.email || dest.usuario_id} (${dest.empresa || 's/e'})`}
        </span>
      </div>
      <div style={{ fontSize: 13, marginTop: 4 }}><b>{d.asunto}</b></div>
      <div style={{ fontSize: 12.5, color: '#33475b', marginTop: 2, whiteSpace: 'pre-wrap' }}>{d.contenido}</div>
      <div style={{ fontSize: 11.5, color: '#5a6b7d', marginTop: 4 }}>
        {(d.acuses || []).length
          ? `Acuses (${d.acuses.length}): ${d.acuses.map(a => a.por).join(', ')}`
          : 'Sin acuse todavía'}
        {d.atencion && <> · atendida por {d.atencion.por}{d.atencion.nota ? `: ${d.atencion.nota}` : ''}</>}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {(d.estado === 'EMITIDA' || d.estado === 'ACUSADA') && (
          <button style={BTN} onClick={() => onAccion(d, 'acusar')}>Acusar recibo</button>
        )}
        {d.estado === 'ACUSADA' && (
          <button style={BTN} onClick={() => onAccion(d, 'atender')}>Declarar atendida</button>
        )}
        {d.estado === 'ATENDIDA' && (
          <button style={BTN} onClick={() => onAccion(d, 'cerrar')}>Verificar y cerrar</button>
        )}
        {['EMITIDA', 'ACUSADA', 'ATENDIDA'].includes(d.estado) && (
          <button style={{ ...BTN, color: '#8a2020' }} onClick={() => onRectificar(d)}>Rectificar</button>
        )}
      </div>
    </div>
  );
}

// ── EL MÓDULO ───────────────────────────────────────────────────────────────

export default function CuadernoModule({ project, API, user }) {
  const urn = project?.scope_escritura || project?.model_urn || project?.id;
  const obraId = project?.id || urn;

  const [pestana, setPestana] = useState('partes');
  const [partes, setPartes] = useState(null);
  const [parte, setParte] = useState(null);          // detalle abierto
  const [instrucciones, setInstrucciones] = useState(null);
  const [fotos, setFotos] = useState([]);
  const [agregando, setAgregando] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);
  const [rectifica, setRectifica] = useState(null);

  const cargar = useCallback(async () => {
    if (!urn) return;
    try {
      const [rp, ri] = await Promise.all([
        apiFetch(`${API}/api/cuaderno/partes?model_urn=${encodeURIComponent(urn)}`),
        apiFetch(`${API}/api/cuaderno/instrucciones?model_urn=${encodeURIComponent(urn)}`),
      ]);
      setPartes(rp.ok ? (await rp.json()).partes || [] : []);
      setInstrucciones(ri.ok ? (await ri.json()).instrucciones || [] : []);
    } catch (e) { setPartes([]); setInstrucciones([]); }
  }, [API, urn]);
  useEffect(() => { cargar(); }, [cargar]);

  const abrirDetalle = async (p) => {
    const r = await apiFetch(`${API}/api/cuaderno/partes/${p.id}`);
    if (r.ok) setParte(await r.json());
    // Para el selector de citas: la galería de NG-02 (solo lo visible).
    apiFetch(`${API}/api/fotos?model_urn=${encodeURIComponent(urn)}`)
      .then(r2 => (r2.ok ? r2.json() : { fotos: [] }))
      .then(d => setFotos(d.fotos || [])).catch(() => {});
  };

  const abrirParte = async (fecha) => {
    try {
      const ctx = campo.contextoDe(user, project);
      const res = await campo.capturar(API, ctx, {
        object_type: 'PARTE', action: campo.CREATE,
        local_object_id: campo.nuevoObjetoLocal(),
        payload: { fecha_operativa: fecha, model_urn: urn },
        enLinea: async () => {
          const r = await apiFetch(`${API}/api/cuaderno/partes`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model_urn: urn, fecha_operativa: fecha }),
          });
          const d = await r.json();
          if (r.status === 409 && d.parte) return d.parte;   // la jornada ya existía
          if (!r.ok) throw new Error(d.error || 'no se pudo abrir');
          return d;
        },
      });
      if (res.modo === 'servidor') {
        const d = res.datos.canonical_result || res.datos;
        toast.success(d.ya_existia ? 'La jornada ya estaba abierta.' : `Parte del ${fecha} abierto.`);
        await cargar();
        const id = res.datos.canonical_object_id || res.datos.id;
        if (id) abrirDetalle({ id });
      } else {
        toast.success('Parte guardado EN ESTE DISPOSITIVO — se abrirá al volver ' +
                      'la cobertura. Puedes seguir registrando asientos sobre él.',
                      { duration: 6000 });
        // La jornada local: los asientos que siga capturando dependen de ella.
        setParte({ local_object_id: res.datos.local_object_id,
                   operation_id: res.datos.operation_id,
                   fecha_operativa: fecha, estado: 'ABIERTO', asientos: [],
                   sinServidor: true });
      }
    } catch (e) { toast.error(e.message || 'No se pudo abrir el parte.'); }
  };

  const cerrarParte = async () => {
    if (exigeConexion('Cerrar la jornada')) return;
    if (!window.confirm(`¿Cerrar el parte del ${parte.fecha_operativa}? Después no entra nada.`)) return;
    const r = await apiFetch(`${API}/api/cuaderno/partes/${parte.id}/cerrar`, { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(d.error || 'No se pudo cerrar.'); return; }
    toast.success('Jornada cerrada: el parte queda congelado.');
    setParte(null); cargar();
  };

  const resolverAsiento = async (a, veredicto) => {
    if (exigeConexion(veredicto === 'aprobar' ? 'Aprobar un asiento' : 'Devolver un asiento')) return;
    let cuerpo = {};
    if (veredicto === 'devolver') {
      const motivo = window.prompt('Motivo de la devolución (se lo dice a su autor):');
      if (!motivo) return;
      cuerpo = { motivo };
    }
    const r = await apiFetch(`${API}/api/cuaderno/asientos/${a.id}/${veredicto}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(d.error || 'No se pudo.', { duration: 6000 }); return; }
    toast.success(veredicto === 'aprobar' ? `Asiento N.º ${d.numero} aprobado.`
                                          : `Asiento N.º ${d.numero} devuelto a su autor.`);
    abrirDetalle({ id: parte.id });
  };

  const accionInstruccion = async (i, accion) => {
    const NOMBRE = { acusar: 'Acusar recibo', atender: 'Atender', cerrar: 'Cerrar' };
    if (exigeConexion(`${NOMBRE[accion]} una instrucción`)) return;
    let cuerpo = {};
    if (accion === 'atender') {
      cuerpo = { nota: window.prompt('Nota de atención (opcional):') || '' };
    }
    const r = await apiFetch(`${API}/api/cuaderno/instrucciones/${i.id}/${accion}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(d.error || 'No se pudo.', { duration: 6000 }); return; }
    toast.success(`${d.codigo} → ${d.estado}`);
    cargar();
  };

  const estilo = (activa) => ({
    padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
    border: '1px solid #c8d4e3',
    background: activa ? '#16202b' : '#fff', color: activa ? '#fff' : '#16202b',
  });

  return (
    <div style={{ padding: '12px 16px', maxWidth: 1000, margin: '0 auto',
                  overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button style={estilo(pestana === 'partes')}
                onClick={() => { setPestana('partes'); setParte(null); }}>Partes diarios</button>
        <button style={estilo(pestana === 'instrucciones')}
                onClick={() => { setPestana('instrucciones'); setParte(null); }}>Instrucciones</button>
      </div>

      {pestana === 'partes' && !parte && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10,
                        alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12.5, color: '#78838f' }}>
              La jornada es única por obra y fecha operativa — la fecha DECLARADA
              del día de obra, no la del reloj del servidor.
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="date" id="fecha-parte" defaultValue={hoyOperativo()}
                     style={{ ...CAJA, width: 150 }} />
              <button style={BTN_OSCURO}
                      onClick={() => abrirParte(document.getElementById('fecha-parte').value)}>
                Abrir parte
              </button>
            </div>
          </div>
          {partes === null && <div style={{ padding: 40, textAlign: 'center', color: '#9aa7b4' }}>Cargando…</div>}
          {partes && partes.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#5a6b7d' }}>
              Todavía no hay partes en esta obra.
            </div>
          )}
          {partes && partes.map(p => (
            <div key={p.id} onClick={() => abrirDetalle(p)}
                 style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px',
                          marginBottom: 8, background: '#fff', cursor: 'pointer',
                          display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <b style={{ fontSize: 14 }}>{p.fecha_operativa}</b>
              <Chip texto={p.estado} color={COLOR_ESTADO[p.estado]} />
              <span style={{ fontSize: 12, color: '#5a6b7d' }}>{p.asientos} asiento(s)</span>
              {p.en_aprobacion > 0 && (
                <span style={{ fontSize: 11.5, color: '#8a5a00' }}>{p.en_aprobacion} por aprobar</span>
              )}
              <span style={{ fontSize: 11.5, color: '#9aa7b4', marginLeft: 'auto' }}>{p.created_by}</span>
            </div>
          ))}
        </>
      )}

      {pestana === 'partes' && parte && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap',
                        marginBottom: 10 }}>
            <button style={BTN} onClick={() => setParte(null)}>← Partes</button>
            <b style={{ fontSize: 15 }}>Parte del {parte.fecha_operativa}</b>
            <Chip texto={parte.estado} color={COLOR_ESTADO[parte.estado]} />
            {parte.sinServidor && (
              <span style={{ fontSize: 11.5, color: '#8a5a00' }}>
                guardado EN ESTE DISPOSITIVO — subirá con cobertura
              </span>
            )}
            {parte.aprobador_contractual === false && (
              <span style={{ fontSize: 11.5, color: '#8a2020' }}>
                SIN_APROBADOR_CONTRACTUAL: nadie ejerce SUPERVISION/ENTIDAD aquí —
                la administración no la sustituye
              </span>
            )}
            {parte.estado === 'ABIERTO' && !parte.sinServidor && (
              <button style={{ ...BTN, marginLeft: 'auto' }} onClick={cerrarParte}>
                Cerrar jornada
              </button>
            )}
          </div>
          {parte.estado === 'ABIERTO' && !agregando && (
            <button style={BTN_OSCURO} onClick={() => setAgregando(true)}>+ Registrar asiento</button>
          )}
          {agregando && (
            <FormAsiento API={API} urn={urn} parte={parte} fotos={fotos}
                         instrucciones={instrucciones || []} user={user} project={project}
                         onRegistrado={() => { setAgregando(false);
                                               if (parte.id) abrirDetalle({ id: parte.id }); }}
                         onCancelar={() => setAgregando(false)} />
          )}
          <div style={{ marginTop: 12 }}>
            {(parte.asientos || []).length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: '#9aa7b4', fontSize: 13 }}>
                La jornada no tiene asientos todavía.
              </div>
            )}
            {(parte.asientos || []).map(a => (
              <TarjetaAsiento key={a.id} asiento={a}
                              onAprobar={x => resolverAsiento(x, 'aprobar')}
                              onDevolver={x => resolverAsiento(x, 'devolver')} />
            ))}
          </div>
        </>
      )}

      {pestana === 'instrucciones' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10,
                        alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12.5, color: '#78838f' }}>
              Una instrucción emitida es INMUTABLE: se corrige emitiendo una
              rectificación que la referencia. Emiten SUPERVISION y ENTIDAD.
            </div>
            <button style={BTN_OSCURO} onClick={() => { setRectifica(null); setEmitiendo(true); }}>
              Emitir instrucción
            </button>
          </div>
          {emitiendo && (
            <FormInstruccion API={API} urn={urn} obraId={obraId} rectifica={rectifica}
                             onEmitida={() => { setEmitiendo(false); setRectifica(null); cargar(); }}
                             onCancelar={() => { setEmitiendo(false); setRectifica(null); }} />
          )}
          {instrucciones === null && <div style={{ padding: 40, textAlign: 'center', color: '#9aa7b4' }}>Cargando…</div>}
          {instrucciones && instrucciones.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#5a6b7d' }}>
              No hay instrucciones en esta obra.
            </div>
          )}
          {(instrucciones || []).map(i => (
            <TarjetaInstruccion key={i.id} instr={i} onAccion={accionInstruccion}
                                onRectificar={x => { setRectifica(x); setEmitiendo(true);
                                                     window.scrollTo(0, 0); }} />
          ))}
        </>
      )}
    </div>
  );
}
