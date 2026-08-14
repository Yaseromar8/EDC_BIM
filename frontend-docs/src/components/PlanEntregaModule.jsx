// PlanEntregaModule — el MIDP/TIDP dentro del ECD.
//
// QUE ENSENA, Y POR QUE ASI
// Un compromiso no es un documento. Esta vista existe para poder mirar el plan
// ANTES de que existan los ficheros: que se prometio, quien, para cuando, y
// que parte de eso ya esta entregado de verdad.
//
// Las cuatro cifras de arriba son las de la reunion. La de VENCIDO va aparte y
// en rojo a proposito: es la unica que obliga a hacer algo hoy.
//
// Y una columna que suele faltar en las herramientas de este tipo: "cumple",
// que compara la idoneidad COMPROMETIDA con la que tiene el documento
// entregado. Que un PDF exista no significa que cumpla: se puede haber
// entregado como S3 algo que se prometio A1, y eso -- entregado pero no apto
// para construccion -- es justo lo que se discute en una reunion de obra.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';

const COLOR = {
  comprometido: { fondo: 'rgba(120,140,175,0.14)', borde: 'rgba(120,140,175,0.4)', texto: '#a8b4c8' },
  vinculado:    { fondo: 'rgba(245,165,36,0.12)',  borde: 'rgba(245,165,36,0.4)',  texto: '#f5a524' },
  entregado:    { fondo: 'rgba(46,160,67,0.14)',   borde: 'rgba(46,160,67,0.45)',  texto: '#3fb950' },
  vencido:      { fondo: 'rgba(255,107,107,0.14)', borde: 'rgba(255,107,107,0.45)', texto: '#ff8585' },
};

function Chip({ estado, etiqueta }) {
  const c = COLOR[estado] || COLOR.comprometido;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11.5,
      fontWeight: 600, background: c.fondo, border: `1px solid ${c.borde}`, color: c.texto,
      whiteSpace: 'nowrap',
    }}>{etiqueta}</span>
  );
}

function Cifra({ n, texto, color, resaltado }) {
  return (
    <div style={{
      flex: '1 1 130px', padding: '13px 15px', borderRadius: 10,
      background: resaltado ? 'rgba(255,107,107,0.08)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${resaltado ? 'rgba(255,107,107,0.35)' : 'rgba(255,255,255,0.08)'}`,
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || '#e9ecf1', lineHeight: 1.1 }}>{n}</div>
      <div style={{ fontSize: 11.5, color: '#8b94a1', marginTop: 3 }}>{texto}</div>
    </div>
  );
}

export function PlanEntregaView({ projectPrefix, isAdmin }) {
  const [datos, setDatos] = useState(null);
  const [tipo, setTipo] = useState('');          // '' = MIDP y TIDP
  const [filtro, setFiltro] = useState('');
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const ficheroRef = useRef(null);

  const cargar = useCallback(() => {
    const q = new URLSearchParams({ model_urn: projectPrefix });
    if (tipo) q.set('tipo', tipo);
    apiFetch(`${API}/api/plan?${q}`)
      .then(r => r.json())
      .then(d => setDatos(d.error ? { plan: [], resumen: null, error: d.error } : d))
      .catch(() => setDatos({ plan: [], resumen: null, error: 'No se pudo cargar el plan.' }));
  }, [projectPrefix, tipo]);

  useEffect(() => { cargar(); }, [cargar]);

  const importar = async (archivo, comoTipo) => {
    if (!archivo) return;
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      fd.append('model_urn', projectPrefix);
      fd.append('tipo', comoTipo);
      const r = await apiFetch(`${API}/api/plan/importar`, { method: 'POST', body: fd, isUpload: true });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'No se pudo importar.'); return; }
      toast.success(`${comoTipo}: ${d.nuevos} nuevos, ${d.actualizados} actualizados`);
      cargar();
    } catch {
      toast.error('No se pudo importar el fichero.');
    } finally {
      setSubiendo(false);
      if (ficheroRef.current) ficheroRef.current.value = '';
    }
  };

  const filas = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    return (datos?.plan || []).filter(f => {
      if (soloPendientes && (f.estado === 'entregado')) return false;
      if (!t) return true;
      return [f.identificador, f.titulo, f.disciplina, f.responsable]
        .some(v => (v || '').toLowerCase().includes(t));
    });
  }, [datos, filtro, soloPendientes]);

  const r = datos?.resumen;

  return (
    <div style={{ padding: '18px 22px', color: '#e9ecf1', overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Plan de entrega de información</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#8b94a1', maxWidth: 640 }}>
            Lo que la obra se comprometió a entregar (MIDP/TIDP), y qué parte está
            entregada de verdad en el ECD. Un compromiso existe aunque todavía no
            exista el documento.
          </p>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <input ref={ficheroRef} type="file" accept=".xlsx,.xlsm" style={{ display: 'none' }}
                   onChange={e => importar(e.target.files?.[0], ficheroRef.current?.dataset.tipo || 'MIDP')} />
            {['MIDP', 'TIDP'].map(t => (
              <button key={t} disabled={subiendo}
                      onClick={() => { if (ficheroRef.current) { ficheroRef.current.dataset.tipo = t; ficheroRef.current.click(); } }}
                      style={{
                        background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#fff',
                        padding: '8px 14px', fontSize: 12.5, fontWeight: 600,
                        cursor: subiendo ? 'default' : 'pointer', opacity: subiendo ? 0.6 : 1,
                      }}>
                {subiendo ? 'Importando…' : `Importar ${t}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {r && (
        <div style={{ display: 'flex', gap: 10, margin: '18px 0 6px', flexWrap: 'wrap' }}>
          <Cifra n={r.total} texto="comprometidos en el plan" />
          <Cifra n={r.entregados} texto="entregados y publicados" color="#3fb950" />
          <Cifra n={`${r.porcentaje_entregado}%`} texto="del plan entregado" />
          <Cifra n={r.vencidos} texto="vencidos sin entregar" color="#ff8585" resaltado={r.vencidos > 0} />
        </div>
      )}

      {datos && !datos.plan.length && (
        <div style={{
          marginTop: 20, padding: 20, borderRadius: 10, textAlign: 'center',
          background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.12)',
        }}>
          <p style={{ margin: 0, fontSize: 13.5, color: '#cfd6e0' }}>
            Esta obra todavía no tiene plan de entrega cargado.
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#79818d' }}>
            {isAdmin ? 'Importa el Excel del MIDP o del TIDP con el botón de arriba.'
                     : 'Pide al administrador de la obra que importe el MIDP.'}
          </p>
        </div>
      )}

      {!!datos?.plan.length && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '14px 0 10px', flexWrap: 'wrap' }}>
            <input value={filtro} onChange={e => setFiltro(e.target.value)}
                   placeholder="Buscar por código, título, disciplina o responsable…"
                   style={{
                     flex: '1 1 280px', background: '#0b0d10', color: '#e9ecf1',
                     border: '1px solid rgba(255,255,255,0.14)', borderRadius: 7,
                     padding: '8px 11px', fontSize: 13,
                   }} />
            <select value={tipo} onChange={e => setTipo(e.target.value)}
                    style={{
                      background: '#0b0d10', color: '#e9ecf1', fontSize: 13,
                      border: '1px solid rgba(255,255,255,0.14)', borderRadius: 7, padding: '8px 10px',
                    }}>
              <option value="">MIDP y TIDP</option>
              <option value="MIDP">Solo MIDP</option>
              <option value="TIDP">Solo TIDP</option>
            </select>
            <label style={{ fontSize: 12.5, color: '#cfd6e0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={soloPendientes}
                     onChange={e => setSoloPendientes(e.target.checked)} />
              Solo lo que falta
            </label>
            <span style={{ fontSize: 12, color: '#79818d', marginLeft: 'auto' }}>
              {filas.length} de {datos.plan.length}
            </span>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 860 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.04)', textAlign: 'left' }}>
                  {['Código', 'Título', 'Disc.', 'Idoneidad', 'Rev.', 'Compromiso',
                    'Estado', 'Documento', 'Cumple'].map(h => (
                    <th key={h} style={{ padding: '9px 11px', fontWeight: 600, color: '#a8b4c8',
                                         borderBottom: '1px solid rgba(255,255,255,0.08)',
                                         whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map(f => (
                  <tr key={f.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px 11px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {f.identificador}
                      {f.tipo === 'TIDP' && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: '#79818d' }}>TIDP</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 11px', maxWidth: 300 }}>{f.titulo || '—'}</td>
                    <td style={{ padding: '8px 11px' }}>{f.disciplina || '—'}</td>
                    <td style={{ padding: '8px 11px' }}>{f.idoneidad_prevista || '—'}</td>
                    <td style={{ padding: '8px 11px' }}>{f.revision_prevista || '—'}</td>
                    <td style={{ padding: '8px 11px', whiteSpace: 'nowrap' }}>
                      {f.fecha_comprometida || f.hito || '—'}
                    </td>
                    <td style={{ padding: '8px 11px' }}>
                      <Chip estado={f.estado} etiqueta={f.estado_etiqueta} />
                    </td>
                    <td style={{ padding: '8px 11px', color: f.documento ? '#cfd6e0' : '#5a626e' }}>
                      {f.documento ? f.documento.nombre : 'sin vincular'}
                    </td>
                    <td style={{ padding: '8px 11px', textAlign: 'center' }}>
                      {f.cumple_idoneidad === null ? '—'
                        : f.cumple_idoneidad
                          ? <span style={{ color: '#3fb950' }}>sí</span>
                          : <span style={{ color: '#ff8585' }}
                                  title={`Se comprometió ${f.idoneidad_prevista} y se entregó ${f.documento?.idoneidad || '—'}`}>
                              no
                            </span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {datos?.error && (
        <p style={{ marginTop: 14, fontSize: 12.5, color: '#ff8585' }}>{datos.error}</p>
      )}
    </div>
  );
}
