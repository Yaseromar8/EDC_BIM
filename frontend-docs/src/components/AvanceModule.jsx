// AvanceModule — NG-04 · Avance físico desde campo.
//
// LA PREGUNTA QUE ESTA PANTALLA RESPONDE:
//     ¿CUÁNTO SE EJECUTÓ DE VERDAD, RECONOCIDO POR QUIÉN?
//
// Tres verdades que no se mezclan (doc 98): lo REPORTADO es testimonio; solo
// lo APROBADO suma; la proyección al 4D es derivada. El que reporta jamás se
// aprueba a sí mismo, y aprobar con conflicto (exceso/solape/duplicado)
// exige confirmarlo uno a uno con motivo — trazable (corrección 3).
//
// La CANTIDAD es magnitud positiva; la dirección la pone el tipo. El
// acumulado se DERIVA: la pantalla convierte en el borde («llevamos X») y lo
// que viaja es SIEMPRE el incremento (doc 98 §F).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/apiFetch';
import * as campo from '../offline/captura';

// Tripwire: casadas por texto con avance_fisico.py y 26_ng04_avance.sql.
export const TIPOS_DE_AVANCE = ['AVANCE', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO'];
export const ESTADOS_DE_AVANCE = ['REPORTADO', 'APROBADO', 'DEVUELTO'];

const COLOR_ESTADO = {
  REPORTADO: { bg: '#fdf3e0', fg: '#8a5a00', texto: 'Reportado' },
  APROBADO: { bg: '#e6f4ea', fg: '#1e7d3e', texto: 'Aprobado' },
  DEVUELTO: { bg: '#fdecea', fg: '#b3261e', texto: 'Devuelto' },
};

export default function AvanceModule({ project, API, user, isAdmin }) {
  const projectPrefix = project?.model_urn || project?.id || 'global';
  const [pestana, setPestana] = useState('actividades');
  const [dataset, setDataset] = useState(null);
  const [actividades, setActividades] = useState([]);
  const [avances, setAvances] = useState([]);
  const [bloqueo, setBloqueo] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [ra, rl] = await Promise.all([
        apiFetch(`${API}/api/avance/actividades?model_urn=${encodeURIComponent(projectPrefix)}`),
        apiFetch(`${API}/api/avance/lista?model_urn=${encodeURIComponent(projectPrefix)}`),
      ]);
      const da = await ra.json();
      const dl = await rl.json();
      if (da.success) { setDataset(da.dataset); setActividades(da.actividades || []); }
      if (dl.success) { setAvances(dl.avances || []); setBloqueo(dl.bloqueo_de_aprobacion); }
    } catch {
      toast.error('Sin conexión: se muestra lo último conocido.');
    } finally {
      setCargando(false);
    }
  }, [API, projectPrefix]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div style={{ padding: '18px 22px', maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 4 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary, #222)', margin: 0 }}>
          Avance físico
        </h1>
        {dataset && (
          <span style={{ fontSize: 11.5, color: 'var(--text-secondary, #777)' }}
            title={dataset.huella}>plan: {dataset.id}</span>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-secondary, #666)', margin: '0 0 14px' }}>
        Se reporta la <b>cantidad física ejecutada</b> (no un %); solo lo que la
        supervisión aprueba suma al 4D. El acumulado y el porcentaje se derivan.
      </p>
      {bloqueo && (
        <div style={{ background: '#fdecea', border: '1px solid #f5c6c0', borderRadius: 8,
                      padding: '10px 14px', fontSize: 12.5, color: '#8a1c14', marginBottom: 12 }}>
          <b>{bloqueo}</b> — esta obra no tiene un sujeto contractual resoluble
          para aprobar avances (se resuelve declarando SUPERVISION —o ENTIDAD
          como contingencia— en el directorio, con una empresa o persona concreta).
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border, #e2e2e2)', marginBottom: 14 }}>
        {[['actividades', 'Actividades'], ['registrar', 'Registrar'],
          ['bandeja', 'Bandeja']].map(([id, texto]) => (
          <button key={id} onClick={() => setPestana(id)}
            style={{ padding: '8px 14px', fontSize: 13, cursor: 'pointer',
                     background: 'transparent', border: 'none',
                     borderBottom: pestana === id ? '2px solid var(--accent, #3e6f91)' : '2px solid transparent',
                     color: pestana === id ? 'var(--accent, #3e6f91)' : 'var(--text-secondary, #666)',
                     fontWeight: pestana === id ? 600 : 400 }}>
            {texto}
          </button>
        ))}
      </div>

      {cargando ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 13 }}>Cargando…</div>
      ) : pestana === 'actividades' ? (
        <Actividades actividades={actividades} />
      ) : pestana === 'registrar' ? (
        <Registrar API={API} user={user} project={project} projectPrefix={projectPrefix}
          actividades={actividades} onHecho={cargar} />
      ) : (
        <Bandeja API={API} user={user} avances={avances} onHecho={cargar} />
      )}
    </div>
  );
}

function Actividades({ actividades }) {
  if (!actividades.length) {
    return <div style={{ padding: 30, color: '#888', fontSize: 13 }}>
      Esta obra no tiene un plan LOB activo con partidas. El avance se reporta
      contra el plan importado; impórtalo desde el workspace LOB.
    </div>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border, #ddd)', textAlign: 'left' }}>
            {['Partida', 'Descripción', 'Unidad', 'Objetivo', 'Aprobado', '% actual', 'Inicio real', 'Fin real'].map(h => (
              <th key={h} style={{ padding: '8px 10px', fontSize: 11, textTransform: 'uppercase',
                                   letterSpacing: '0.05em', color: 'var(--text-secondary, #777)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {actividades.map(a => (
            <tr key={a.activity_id + (a.codigo || '')} style={{ borderBottom: '1px solid var(--border-soft, #f0f0f0)' }}>
              <td style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>{a.codigo}</td>
              <td style={{ padding: '8px 10px' }}>{a.descripcion}</td>
              <td style={{ padding: '8px 10px' }}>{a.unidad}</td>
              <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>{a.metrado ?? '—'}</td>
              <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>
                {a.acumulado_aprobado}
                {a.exceso && <span title="El aprobado excede el objetivo: quedó confirmado explícitamente al aprobar"
                  style={{ marginLeft: 6, fontSize: 10.5, color: '#b3261e', fontWeight: 700 }}>EXCESO</span>}
              </td>
              <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>
                {a.porcentaje_actual == null ? '—' : `${a.porcentaje_actual}%`}
              </td>
              <td style={{ padding: '8px 10px' }}>{a.actual_start || '—'}</td>
              <td style={{ padding: '8px 10px' }}>{a.actual_finish || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Registrar({ API, user, project, projectPrefix, actividades, onHecho }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [actividad, setActividad] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [pIni, setPIni] = useState('');
  const [pFin, setPFin] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [termina, setTermina] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const elegida = useMemo(
    () => actividades.find(a => a.activity_id === actividad),
    [actividades, actividad]);

  // «Llevamos 480» → la pantalla convierte EN EL BORDE; viaja el incremento.
  const acumulado = elegida?.acumulado_aprobado ?? 0;

  const enviar = async () => {
    if (!elegida) { toast.error('Elige la partida o actividad.'); return; }
    const c = parseFloat(cantidad);
    if (!(c > 0)) { toast.error('La cantidad es una magnitud positiva.'); return; }
    setOcupado(true);
    try {
      const ctx = campo.contextoDe(user, project);
      const payload = {
        model_urn: projectPrefix, activity_id: elegida.activity_id,
        cost_item_codigo: elegida.codigo, frente_label: elegida.frente_label,
        cantidad: c, unidad: elegida.unidad, fecha_operativa: fecha,
        progresiva_inicio: pIni === '' ? null : parseFloat(pIni),
        progresiva_fin: pFin === '' ? null : parseFloat(pFin),
        descripcion: descripcion || null, termina_actividad: termina,
        tipo: 'AVANCE',
      };
      const res = await campo.capturar(API, ctx, {
        object_type: 'AVANCE', action: campo.CREATE,
        local_object_id: campo.nuevoObjetoLocal(),
        payload,
        enLinea: async () => {
          const r = await apiFetch(`${API}/api/avance/reportar`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || 'no entró');
          return d;
        },
      });
      if (res?.encolado) toast.success('Sin red: el avance quedó en cola y viajará al sincronizar.');
      else toast.success(`Avance N.º ${res?.numero ?? ''} reportado — espera aprobación.`);
      if ((res?.conflictos_detectados || []).length) {
        toast('La validación verá: ' + res.conflictos_detectados.join(', '),
          { icon: '⚠️', duration: 6000 });
      }
      setCantidad(''); setDescripcion(''); setTermina(false);
      onHecho();
    } catch (e) {
      toast.error(e.message || 'No se pudo reportar.');
    } finally {
      setOcupado(false);
    }
  };

  const campoEstilo = { width: '100%', padding: '8px 10px', fontSize: 13,
                       border: '1px solid var(--border, #ccc)', borderRadius: 6, boxSizing: 'border-box' };
  return (
    <div style={{ maxWidth: 560 }}>
      <label style={{ fontSize: 11.5, color: '#666' }}>Partida / actividad</label>
      <select value={actividad} onChange={e => setActividad(e.target.value)} style={campoEstilo}>
        <option value="">— elige del plan —</option>
        {actividades.map(a => (
          <option key={a.activity_id + (a.codigo || '')} value={a.activity_id}>
            {a.codigo} · {a.descripcion} ({a.unidad})
          </option>
        ))}
      </select>
      {elegida && (
        <div style={{ fontSize: 12, color: '#555', margin: '6px 0 2px' }}>
          Objetivo {elegida.metrado ?? '—'} {elegida.unidad} · aprobado hoy{' '}
          <b>{acumulado}</b> — reporta el <b>incremento</b> ejecutado.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
        <div>
          <label style={{ fontSize: 11.5, color: '#666' }}>Cantidad ejecutada ({elegida?.unidad || 'unidad'})</label>
          <input type="number" min="0" step="any" value={cantidad}
            onChange={e => setCantidad(e.target.value)} style={campoEstilo} />
        </div>
        <div>
          <label style={{ fontSize: 11.5, color: '#666' }}>Fecha operativa</label>
          <input type="date" value={fecha} max={hoy}
            onChange={e => setFecha(e.target.value)} style={campoEstilo} />
        </div>
        <div>
          <label style={{ fontSize: 11.5, color: '#666' }}>Progresiva inicio (m)</label>
          <input type="number" step="any" value={pIni} onChange={e => setPIni(e.target.value)} style={campoEstilo} />
        </div>
        <div>
          <label style={{ fontSize: 11.5, color: '#666' }}>Progresiva fin (m)</label>
          <input type="number" step="any" value={pFin} onChange={e => setPFin(e.target.value)} style={campoEstilo} />
        </div>
      </div>
      <label style={{ fontSize: 11.5, color: '#666', display: 'block', marginTop: 8 }}>Descripción</label>
      <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)}
        rows={2} style={{ ...campoEstilo, resize: 'vertical' }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, margin: '10px 0' }}>
        <input type="checkbox" checked={termina} onChange={e => setTermina(e.target.checked)} />
        Declaro que con esto la actividad TERMINA (el fin real solo existe por
        esta declaración, aprobada — nunca se infiere)
      </label>
      <button onClick={enviar} disabled={ocupado}
        style={{ padding: '9px 18px', fontSize: 13, fontWeight: 600, background: 'var(--accent, #3e6f91)',
                 color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', opacity: ocupado ? 0.6 : 1 }}>
        Reportar avance
      </button>
    </div>
  );
}

function Bandeja({ API, user, avances, onHecho }) {
  const [confirmando, setConfirmando] = useState(null); // avance con conflictos
  const [motivos, setMotivos] = useState({});
  const pendientes = avances.filter(a => a.estado === 'REPORTADO');
  const resto = avances.filter(a => a.estado !== 'REPORTADO');

  const aprobar = async (a, confirmaciones = []) => {
    try {
      const r = await apiFetch(`${API}/api/avance/${a.id}/aprobar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmaciones }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.code === 'CONFLICTO_SIN_CONFIRMAR') {
          setConfirmando({ ...a, conflictos: d.conflictos });
          return;
        }
        throw new Error(d.error || 'No se pudo aprobar.');
      }
      toast.success(`Avance N.º ${a.numero} aprobado y proyectado al 4D.`);
      setConfirmando(null); setMotivos({});
      onHecho();
    } catch (e) { toast.error(e.message); }
  };

  const devolver = async (a) => {
    const motivo = window.prompt('Motivo de la devolución (queda en el registro):');
    if (!motivo || !motivo.trim()) return;
    try {
      const r = await apiFetch(`${API}/api/avance/${a.id}/devolver`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo devolver.');
      toast.success(`Avance N.º ${a.numero} devuelto a su autor.`);
      onHecho();
    } catch (e) { toast.error(e.message); }
  };

  const Tarjeta = ({ a }) => {
    const c = COLOR_ESTADO[a.estado] || {};
    return (
      <div style={{ border: '1px solid var(--border, #e2e2e2)', borderRadius: 8,
                    padding: '10px 14px', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 13 }}>N.º {a.numero}</b>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10,
                         background: c.bg, color: c.fg, fontWeight: 600 }}>{c.texto || a.estado}</span>
          <span style={{ fontSize: 12.5 }}>
            {a.tipo !== 'AVANCE' ? `${a.tipo === 'AJUSTE_NEGATIVO' ? '−' : '+'} ajuste ` : ''}
            <b>{a.cantidad} {a.unidad}</b>
            {a.cost_item_codigo ? ` · ${a.cost_item_codigo}` : ''}
            {a.progresiva_inicio != null ? ` · ${a.progresiva_inicio}→${a.progresiva_fin}` : ''}
          </span>
          <span style={{ fontSize: 11.5, color: '#888' }}>{a.fecha_operativa}
            {a.origen === 'offline' ? ' · capturado sin red' : ''}</span>
        </div>
        {(a.conflictos_detectados || []).length > 0 && (
          <div style={{ fontSize: 11.5, color: '#8a5a00', marginTop: 5 }}>
            ⚠ {a.conflictos_detectados.join(' · ')}
          </div>
        )}
        {a.estado === 'DEVUELTO' && a.motivo_devolucion && (
          <div style={{ fontSize: 11.5, color: '#b3261e', marginTop: 5 }}>
            Devuelto: {a.motivo_devolucion}
          </div>
        )}
        {a.estado === 'REPORTADO' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => aprobar(a)} style={{ padding: '5px 12px', fontSize: 12,
              background: '#1e7d3e', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}>
              Aprobar
            </button>
            <button onClick={() => devolver(a)} style={{ padding: '5px 12px', fontSize: 12,
              background: '#fff', border: '1px solid #b3261e', color: '#b3261e', borderRadius: 5, cursor: 'pointer' }}>
              Devolver
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 760 }}>
      {confirmando && (
        <div style={{ border: '1px solid #e6c26a', background: '#fdf6e3', borderRadius: 8,
                      padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            El avance N.º {confirmando.numero} tiene conflictos: aprobar exige
            confirmarlos uno a uno, con motivo (queda trazado con tu firma y hora).
          </div>
          {confirmando.conflictos.map(codigo => (
            <div key={codigo} style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 11.5, color: '#8a5a00', fontWeight: 700 }}>{codigo}</label>
              <input placeholder="motivo por el que se aprueba igualmente"
                value={motivos[codigo] || ''}
                onChange={e => setMotivos(m => ({ ...m, [codigo]: e.target.value }))}
                style={{ width: '100%', padding: '6px 9px', fontSize: 12.5,
                         border: '1px solid #d9c48a', borderRadius: 5, boxSizing: 'border-box' }} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => aprobar(confirmando,
              confirmando.conflictos.map(c => ({ codigo: c, motivo: motivos[c] || '' })))}
              style={{ padding: '6px 14px', fontSize: 12, background: '#1e7d3e', color: '#fff',
                       border: 'none', borderRadius: 5, cursor: 'pointer' }}>
              Confirmar y aprobar
            </button>
            <button onClick={() => { setConfirmando(null); setMotivos({}); }}
              style={{ padding: '6px 14px', fontSize: 12, background: 'transparent',
                       border: 'none', color: '#777', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      <h3 style={{ fontSize: 13, color: '#555', margin: '4px 0 8px' }}>Por validar ({pendientes.length})</h3>
      {pendientes.length === 0 && <div style={{ fontSize: 12.5, color: '#999', marginBottom: 12 }}>Nada pendiente.</div>}
      {pendientes.map(a => <Tarjeta key={a.id} a={a} />)}
      <h3 style={{ fontSize: 13, color: '#555', margin: '16px 0 8px' }}>Historial</h3>
      {resto.map(a => <Tarjeta key={a.id} a={a} />)}
    </div>
  );
}
