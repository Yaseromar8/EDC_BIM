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

// Los colores salen del sistema del portal, que ya tiene el contraste medido.
// Inventarlos a mano fue el error de la primera version: quedaron pensados para
// tema oscuro sobre un portal claro, y la tabla no se leia.
const COLOR = {
  comprometido: { fondo: 'var(--neutral-100)', borde: 'var(--border)',         texto: 'var(--text-secondary)' },
  vinculado:    { fondo: 'var(--bg-warning)',  borde: 'var(--border-warning)', texto: 'var(--warning)' },
  entregado:    { fondo: 'var(--bg-success)',  borde: 'var(--border-success)', texto: 'var(--success)' },
  vencido:      { fondo: 'var(--bg-danger)',   borde: 'var(--border-danger)',  texto: 'var(--danger)' },
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
      background: resaltado ? 'var(--bg-danger)' : 'var(--bg-secondary)',
      border: `1px solid ${resaltado ? 'var(--border-danger)' : 'var(--border)'}`,
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--text-primary)', lineHeight: 1.1 }}>{n}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3 }}>{texto}</div>
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
    <div style={{ padding: '18px 22px', color: 'var(--text-primary)', overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Plan de entrega de información</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 640 }}>
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
                        background: 'var(--accent)', border: 'none', borderRadius: 7,
                        color: 'var(--text-on-accent)',
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
          <Cifra n={r.entregados} texto="entregados y publicados" color="var(--success)" />
          <Cifra n={`${r.porcentaje_entregado}%`} texto="del plan entregado" />
          <Cifra n={r.vencidos} texto="vencidos sin entregar" color="var(--danger)" resaltado={r.vencidos > 0} />
        </div>
      )}

      {/* Vacio y error NO son lo mismo. Enseñar "no hay plan cargado" cuando lo
          que pasa es "no pude leerlo" manda a buscar donde no es -- el mismo
          defecto que el "no hay documentos" del explorador. */}
      {datos?.error && (
        <div style={{
          marginTop: 20, padding: '14px 16px', borderRadius: 10,
          background: 'var(--bg-danger)', border: '1px solid var(--border-danger)',
        }}>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--danger)', fontWeight: 600 }}>
            {datos.error}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
            El plan puede estar cargado: lo que ha fallado es leerlo. Si acabas de
            actualizar el servidor, reinícialo y vuelve a probar.
          </p>
        </div>
      )}

      {datos && !datos.error && !datos.plan.length && (
        <div style={{
          marginTop: 20, padding: 20, borderRadius: 10, textAlign: 'center',
          background: 'var(--bg-secondary)', border: '1px dashed var(--border-strong)',
        }}>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-primary)' }}>
            Esta obra todavía no tiene plan de entrega cargado.
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
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
                     flex: '1 1 280px', background: 'var(--bg-primary)',
                     color: 'var(--text-primary)',
                     border: '1px solid var(--border)', borderRadius: 7,
                     padding: '8px 11px', fontSize: 13,
                   }} />
            <select value={tipo} onChange={e => setTipo(e.target.value)}
                    style={{
                      background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13,
                      border: '1px solid var(--border)', borderRadius: 7, padding: '8px 10px',
                    }}>
              <option value="">MIDP y TIDP</option>
              <option value="MIDP">Solo MIDP</option>
              <option value="TIDP">Solo TIDP</option>
            </select>
            <label style={{ fontSize: 12.5, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={soloPendientes}
                     onChange={e => setSoloPendientes(e.target.checked)} />
              Solo lo que falta
            </label>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {filas.length} de {datos.plan.length}
            </span>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 9 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 860 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', textAlign: 'left' }}>
                  {['Código', 'Título', 'Disc.', 'Idoneidad', 'Rev.', 'Compromiso',
                    'Estado', 'Documento', 'Cumple'].map(h => (
                    <th key={h} style={{ padding: '9px 11px', fontWeight: 600,
                                         color: 'var(--text-secondary)',
                                         borderBottom: '1px solid var(--border)',
                                         whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map(f => (
                  <tr key={f.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                    <td style={{ padding: '8px 11px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {f.identificador}
                      {f.tipo === 'TIDP' && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)' }}>TIDP</span>
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
                    <td style={{ padding: '8px 11px',
                                 color: f.documento ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {f.documento ? f.documento.nombre : 'sin vincular'}
                    </td>
                    <td style={{ padding: '8px 11px', textAlign: 'center' }}>
                      {f.cumple_idoneidad === null ? '—'
                        : f.cumple_idoneidad
                          ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>sí</span>
                          : <span style={{ color: 'var(--danger)', fontWeight: 600 }}
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

    </div>
  );
}
