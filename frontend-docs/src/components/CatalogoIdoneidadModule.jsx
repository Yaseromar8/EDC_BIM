// CatalogoIdoneidadModule — el vocabulario con el que la obra autoriza.
//
// POR QUE ESTA PANTALLA
// El catalogo de idoneidad dice PARA QUE queda autorizado cada documento: si un
// plano sirve para construir o es solo informativo. Es lo primero que mira una
// supervision, y cada obra lo fija en su plan de ejecucion BIM — no todas usan
// el mismo juego de codigos.
//
// El modulo del backend llevaba tiempo documentado como «editable por obra» y
// no habia ninguna via para escribirlo. Un control que se describe y no existe
// es peor que no tenerlo: quien lo lee da por hecho que esta puesto.
//
// LO QUE ESTA PANTALLA TIENE QUE DEJAR CLARO
// Cambiar este catalogo no es cambiar una lista de opciones: cambia lo que
// significa lo ya entregado. Por eso aqui se ve, antes de tocar nada, cuales
// codigos estan EN USO en el expediente — esos no se pueden quitar ni cambiar
// de familia, solo desactivar.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';

const FAMILIAS = [
  { valor: 'compartido', etiqueta: 'Compartido', ayuda: 'material de revisión y coordinación; con esto NO se construye' },
  { valor: 'publicado', etiqueta: 'Publicado', ayuda: 'material autorizado para el uso que declare' },
];

function Etiqueta({ children }) {
  return (
    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', letterSpacing: 0.3, marginBottom: 3 }}>
      {children}
    </div>
  );
}

export function CatalogoIdoneidadView({ projectPrefix, isAdmin }) {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [avisos, setAvisos] = useState([]);
  const [sucio, setSucio] = useState(false);

  const cargar = useCallback(() => {
    apiFetch(`${API}/api/docs/idoneidad?model_urn=${encodeURIComponent(projectPrefix)}`)
      .then(r => r.json())
      .then(d => {
        if (!d.success) throw new Error(d.error || 'No se pudo leer el catálogo');
        // `catalogo_completo` incluye los desactivados y solo llega si puedes
        // editar: para volver a encender un código hay que poder verlo apagado.
        const base = d.catalogo_completo
          || (d.codigos || []).map(c => ({ ...c, activo: true }));
        setFilas(base.map(c => ({ ...c })));
        setSucio(false);
        setError(null);
      })
      .catch(e => setError(e.message));
  }, [projectPrefix]);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiar = (i, campo, valor) => {
    setFilas(f => f.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));
    setSucio(true);
  };

  const anadir = () => {
    setFilas(f => [...(f || []), { codigo: '', etiqueta: '', familia: 'compartido', activo: true }]);
    setSucio(true);
  };

  const quitar = (i) => {
    setFilas(f => f.filter((_x, j) => j !== i));
    setSucio(true);
  };

  const guardar = async () => {
    setGuardando(true);
    setAvisos([]);
    try {
      const r = await apiFetch(`${API}/api/docs/idoneidad`, {
        method: 'PUT',
        body: JSON.stringify({ model_urn: projectPrefix, codigos: filas }),
      });
      const d = await r.json();
      if (!d.success) { toast.error(d.error || 'No se pudo guardar.'); return; }
      toast.success(`Catálogo guardado: ${d.codigos.length} códigos activos`);
      setAvisos(d.avisos || []);
      setSucio(false);
      cargar();
    } catch {
      toast.error('No se pudo guardar el catálogo.');
    } finally {
      setGuardando(false);
    }
  };

  const porFamilia = useMemo(() => {
    const a = (filas || []).filter(f => f.activo);
    return {
      compartido: a.filter(f => f.familia === 'compartido').length,
      publicado: a.filter(f => f.familia === 'publicado').length,
    };
  }, [filas]);

  if (error) {
    return (
      <div style={{ padding: '18px 22px' }}>
        <div style={{
          padding: '14px 16px', borderRadius: 10, background: 'var(--bg-danger)',
          border: '1px solid var(--border-danger)',
        }}>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--danger)', fontWeight: 600 }}>{error}</p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
            El catálogo puede existir: lo que ha fallado es leerlo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '18px 22px', color: 'var(--text-primary)', overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Códigos de idoneidad</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 660 }}>
            Para qué queda autorizado un documento al emitirlo. Cada obra lo fija en su
            plan de ejecución BIM, y es lo que se audita.
          </p>
        </div>
        {isAdmin && (
          <button onClick={guardar} disabled={guardando || !sucio}
                  style={{
                    background: sucio ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: sucio ? 'var(--text-on-accent)' : 'var(--text-muted)',
                    border: sucio ? 'none' : '1px solid var(--border)',
                    borderRadius: 7, padding: '8px 16px', fontSize: 12.5, fontWeight: 600,
                    cursor: (guardando || !sucio) ? 'default' : 'pointer', flexShrink: 0,
                  }}>
            {guardando ? 'Guardando…' : sucio ? 'Guardar cambios' : 'Sin cambios'}
          </button>
        )}
      </div>

      {/* La advertencia va ARRIBA y siempre, no como aviso al fallar: quien
          edita esto tiene que saber lo que cambia ANTES de tocarlo. */}
      <div style={{
        marginTop: 16, padding: '11px 14px', borderRadius: 9,
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      }}>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Un código <strong>ya usado</strong> en el expediente no se puede quitar ni
          cambiar de familia: hay documentos sellados con él, y moverlo cambiaría lo
          que significa lo que ya se entregó. Lo que sí se puede es{' '}
          <strong>desactivarlo</strong> — deja de ofrecerse para emisiones nuevas y los
          documentos que lo llevan siguen diciendo lo mismo. El servidor lo comprueba.
        </p>
      </div>

      {!!avisos.length && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {avisos.map((a, i) => (
            <div key={i} style={{
              padding: '9px 12px', borderRadius: 8, fontSize: 12.5, lineHeight: 1.5,
              background: 'var(--bg-warning)', border: '1px solid var(--border-warning)',
              color: 'var(--text-primary)',
            }}>{a}</div>
          ))}
        </div>
      )}

      {isAdmin && (porFamilia.compartido === 0 || porFamilia.publicado === 0) && (
        <div style={{
          marginTop: 12, padding: '9px 12px', borderRadius: 8, fontSize: 12.5,
          background: 'var(--bg-warning)', border: '1px solid var(--border-warning)',
          color: 'var(--text-primary)', lineHeight: 1.5,
        }}>
          {porFamilia.publicado === 0
            ? 'Sin ningún código de publicación activo no se podrá pasar ningún documento a Publicado.'
            : 'Sin ningún código para compartir activo no se podrá compartir nada para revisión.'}
        </div>
      )}

      <div style={{ marginTop: 16, overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 9 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)', textAlign: 'left' }}>
              {['Código', 'Qué autoriza', 'Familia', 'Se ofrece', ''].map(h => (
                <th key={h} style={{
                  padding: '9px 11px', fontWeight: 600, color: 'var(--text-secondary)',
                  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(filas || []).map((f, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--divider)' }}>
                <td style={{ padding: '7px 11px' }}>
                  <input value={f.codigo} disabled={!isAdmin} maxLength={10}
                         onChange={e => cambiar(i, 'codigo', e.target.value.toUpperCase())}
                         style={{
                           width: 78, fontFamily: 'monospace', fontSize: 13, fontWeight: 600,
                           background: 'var(--bg-primary)', color: 'var(--text-primary)',
                           border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px',
                         }} />
                </td>
                <td style={{ padding: '7px 11px' }}>
                  <input value={f.etiqueta} disabled={!isAdmin}
                         placeholder="Qué permite hacer con el documento"
                         onChange={e => cambiar(i, 'etiqueta', e.target.value)}
                         style={{
                           width: '100%', minWidth: 260, fontSize: 12.5,
                           background: 'var(--bg-primary)', color: 'var(--text-primary)',
                           border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px',
                         }} />
                </td>
                <td style={{ padding: '7px 11px' }}>
                  <select value={f.familia} disabled={!isAdmin}
                          onChange={e => cambiar(i, 'familia', e.target.value)}
                          style={{
                            fontSize: 12.5, background: 'var(--bg-primary)',
                            color: 'var(--text-primary)', border: '1px solid var(--border)',
                            borderRadius: 6, padding: '5px 8px',
                          }}>
                    {FAMILIAS.map(x => (
                      <option key={x.valor} value={x.valor} title={x.ayuda}>{x.etiqueta}</option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: '7px 11px', textAlign: 'center' }}>
                  <input type="checkbox" checked={f.activo !== false} disabled={!isAdmin}
                         onChange={e => cambiar(i, 'activo', e.target.checked)} />
                </td>
                <td style={{ padding: '7px 11px', textAlign: 'right' }}>
                  {isAdmin && (
                    <button onClick={() => quitar(i)} title="Quitar del catálogo"
                            style={{
                              background: 'transparent', border: '1px solid var(--border)',
                              borderRadius: 6, padding: '3px 9px', fontSize: 12,
                              color: 'var(--text-muted)', cursor: 'pointer',
                            }}>quitar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <button onClick={anadir}
                style={{
                  marginTop: 10, background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)', borderRadius: 7,
                  padding: '7px 13px', fontSize: 12.5, cursor: 'pointer',
                  color: 'var(--text-primary)',
                }}>
          + Añadir código
        </button>
      )}

      <p style={{ margin: '14px 0 0', fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 700 }}>
        Las descripciones son nuestras, en castellano llano. Las definiciones normativas
        viven en la norma, que es de pago: esto no las reproduce ni las sustituye.
      </p>
    </div>
  );
}
