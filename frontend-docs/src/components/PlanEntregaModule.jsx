// PlanEntregaModule — el MIDP/TIDP dentro del ECD.
//
// QUE ENSENA, Y POR QUE ASI
// La primera version de esta pantalla era una tabla de 1.108 codigos, y el
// juicio del usuario fue exacto: «lo veo como una lista y ya, por ningun lado
// me transmite que se debe entregar o como».
//
// Tenia razon, y el fallo era de fondo. Un MIDP no es un inventario de nombres
// de fichero: es el compromiso de entregar unos contenedores CON UNOS
// REQUISITOS. Que formato. Con que nivel de informacion (LOD/LOI). Con que
// idoneidad. En que revision. Para que etapa. Todo eso estaba en el Excel y en
// la base, y la pantalla no lo enseñaba por ninguna parte.
//
// Por eso ahora la pantalla se lee de arriba abajo como se lee un plan:
//   1. QUE Y CUANDO — las etapas, con su fecha y su volumen de entrega.
//   2. COMO         — la nomenclatura desmontada pieza a pieza, y los
//                     requisitos agregados: formato, LOIN, idoneidad, revision.
//   3. QUE CHIRRIA  — los avisos que salen del propio plan.
//   4. EL DETALLE   — la tabla, agrupada por disciplina, y cada compromiso con
//                     su ficha: el encargo escrito en una frase.
//
// La tabla va la ultima a proposito. Es el detalle, no el mensaje.
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

// '2025-03-25' -> '25 mar 2025'. Sin pasar por Date: '2025-03-25' se interpreta
// como UTC y en Peru (-5) retrocede al dia anterior. Una fecha de entrega
// corrida un dia es justo lo que no puede pasar en un plan.
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fecha(iso) {
  if (!iso) return null;
  const [a, m, d] = String(iso).split('-');
  if (!a || !m || !d) return iso;
  return `${Number(d)} ${MESES[Number(m) - 1] || m} ${a}`;
}

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

function Seccion({ titulo, sub, children }) {
  return (
    <section style={{ marginTop: 20 }}>
      <h3 style={{
        margin: 0, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.7,
        textTransform: 'uppercase', color: 'var(--text-muted)',
      }}>{titulo}</h3>
      {sub && (
        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>{sub}</p>
      )}
      <div style={{ marginTop: 9 }}>{children}</div>
    </section>
  );
}

// Un requisito: la etiqueta a la izquierda y los valores con su recuento. Es la
// forma mas corta de contestar «¿en que formato?» sin abrir mil filas.
function Requisito({ etiqueta, valores, sufijo }) {
  if (!valores || !valores.length) return null;
  return (
    <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderTop: '1px solid var(--divider)' }}>
      <div style={{ flex: '0 0 118px', fontSize: 12, color: 'var(--text-secondary)', paddingTop: 2 }}>
        {etiqueta}
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {valores.map(v => (
          <span key={v.clave} style={{
            display: 'inline-flex', alignItems: 'baseline', gap: 5,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 7, padding: '3px 9px', fontSize: 12.5,
          }}>
            <strong style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{v.clave}</strong>
            <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>{v.n}{sufijo || ''}</span>
            {v.nota && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>· {v.nota}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

// La nomenclatura desmontada. Un codigo de 40 caracteres no se entiende de
// corrido; separado en piezas con su nombre debajo, se entiende de una vez y
// ademas se ve como hay que nombrar el fichero que se va a entregar.
function Nomenclatura({ nom }) {
  if (!nom || !nom.piezas) return null;
  const ORDEN = [
    ['proyecto', 'Proyecto'], ['originador', 'Originador'], ['volumen', 'Volumen'],
    ['nivel', 'Nivel'], ['tipo', 'Tipo'], ['disciplina', 'Disciplina'],
    ['numeracion', 'Numeración'],
  ];
  const piezas = ORDEN.filter(([k]) => nom.piezas[k]);
  if (!piezas.length) return null;
  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 9, padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {piezas.map(([k, nombre], i) => (
          <React.Fragment key={k}>
            {i > 0 && (
              <span style={{
                fontFamily: 'monospace', fontSize: 15, color: 'var(--text-muted)',
                padding: '0 3px 17px',
              }}>–</span>
            )}
            <span style={{ textAlign: 'center' }}>
              <span style={{
                display: 'block', fontFamily: 'monospace', fontSize: 15, fontWeight: 600,
                color: 'var(--text-primary)',
              }}>{nom.piezas[k]}</span>
              <span style={{
                display: 'block', fontSize: 10, color: 'var(--text-muted)',
                marginTop: 2, letterSpacing: 0.2,
              }}>{nombre}</span>
            </span>
          </React.Fragment>
        ))}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--text-secondary)' }}>
        Así se nombra cada contenedor. El fichero que se entregue tiene que llevar
        este código para poder cotejarlo con su compromiso.
      </p>
    </div>
  );
}

// La ficha del compromiso: el encargo escrito como se le diria a la persona que
// lo tiene que producir. Es lo que convierte una fila en una instruccion.
function Ficha({ f }) {
  // El aviso agregado dice «146 codigos discrepan»; eso no ayuda a quien tiene
  // delante UNO. Aqui se señala el que se esta mirando: la disciplina que
  // declara la columna frente a la que lleva el propio codigo.
  const partes = String(f.identificador || '').split('-');
  const discEnCodigo = partes.length === 7 ? partes[5] : null;
  const discrepa = discEnCodigo && f.disciplina && discEnCodigo !== f.disciplina;
  const malFormado = partes.length !== 7;

  const dato = (etiqueta, valor) => (
    <div style={{ flex: '1 1 120px', minWidth: 110 }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', letterSpacing: 0.3 }}>{etiqueta}</div>
      <div style={{ fontSize: 12.5, color: valor ? 'var(--text-primary)' : 'var(--text-muted)', marginTop: 1 }}>
        {valor || '—'}
      </div>
    </div>
  );
  return (
    <div style={{ padding: '13px 14px', background: 'var(--bg-secondary)' }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.65 }}>
        Se entrega <strong>{f.titulo || 'este contenedor'}</strong>
        {f.descripcion ? ` (${f.descripcion})` : ''} como{' '}
        <code style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{f.identificador}</code>
        {f.formato ? <> en <strong>{f.formato}</strong></> : null}
        {f.lod || f.loi ? <>, con nivel de información <strong>LOD {f.lod || '—'} / LOI {f.loi || '—'}</strong></> : null}
        {f.idoneidad_prevista ? <>, idoneidad <strong>{f.idoneidad_prevista}</strong></> : null}
        {f.revision_prevista ? <> y revisión <strong>{f.revision_prevista}</strong></> : null}
        {f.hito ? <>, para la <strong>{f.hito}</strong></> : null}
        {f.fecha_comprometida ? <> ({fecha(f.fecha_comprometida)})</> : null}.
        {f.responsable ? <> Responsable: <strong>{f.responsable}</strong>.</>
                       : <> <span style={{ color: 'var(--warning)' }}>Sin parte responsable asignada en el plan.</span></>}
      </p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
        {dato('Disciplina', f.disciplina)}
        {dato('Volumen', f.volumen)}
        {dato('Escala', f.escala)}
        {dato('Lámina', f.formato_lamina)}
        {dato('Paquete de trabajo', f.paquete_trabajo)}
        {dato('Documentación asociada', f.documentacion_asociada)}
        {dato('Depende de', f.predecesores)}
        {dato('Origen', f.tipo)}
      </div>
      {(discrepa || malFormado) && (
        <p style={{
          margin: '11px 0 0', padding: '8px 11px', borderRadius: 7, fontSize: 12,
          background: 'var(--bg-warning)', border: '1px solid var(--border-warning)',
          color: 'var(--text-primary)', lineHeight: 1.5,
        }}>
          {malFormado
            ? <>Este código no sigue la nomenclatura de siete partes del plan, así que
                un fichero entregado con este nombre no se podrá cotejar con su
                compromiso.</>
            : <>El plan declara la disciplina <strong>{f.disciplina}</strong> pero el
                código lleva <strong>{discEnCodigo}</strong>. Uno de los dos está mal.</>}
        </p>
      )}
      {f.documento && (
        <p style={{ margin: '11px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          Cotejado con <strong>{f.documento.nombre}</strong> — entregado como{' '}
          {f.documento.idoneidad || '—'} / {f.documento.revision || '—'}.
        </p>
      )}
    </div>
  );
}

export function PlanEntregaView({ projectPrefix, isAdmin }) {
  const [datos, setDatos] = useState(null);
  const [tipo, setTipo] = useState('');          // '' = MIDP y TIDP
  const [filtro, setFiltro] = useState('');
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [hito, setHito] = useState('');          // '' = todas las etapas
  const [abierta, setAbierta] = useState(null);  // ficha desplegada
  const [plegadas, setPlegadas] = useState({});  // disciplinas plegadas
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
      if (soloPendientes && f.estado === 'entregado') return false;
      if (hito && f.hito !== hito) return false;
      if (!t) return true;
      return [f.identificador, f.titulo, f.disciplina, f.responsable]
        .some(v => (v || '').toLowerCase().includes(t));
    });
  }, [datos, filtro, soloPendientes, hito]);

  // Mil filas seguidas no se leen. Agrupadas por disciplina son ocho bloques,
  // y cada uno se abre solo si interesa.
  const grupos = useMemo(() => {
    const m = new Map();
    for (const f of filas) {
      const k = f.disciplina || 'Sin disciplina';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(f);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filas]);

  const r = datos?.resumen;
  const req = datos?.requisitos;
  // Con todo desplegado la tabla vuelve a ser el muro de mil filas que motivo
  // esta reescritura. Abre mostrando la ESTRUCTURA -- diez disciplinas -- y se
  // abre lo que interese. Salvo que se este buscando: ahi lo que se quiere ver
  // son los resultados, no las carpetas.
  const buscando = !!filtro.trim() || !!hito;

  return (
    <div style={{ padding: '18px 22px', color: 'var(--text-primary)', overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Plan de entrega de información</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 660 }}>
            Lo que la obra se comprometió a entregar (MIDP/TIDP): qué contenedores,
            con qué requisitos y para cuándo. Un compromiso existe aunque todavía no
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

      {/* 1. QUE Y CUANDO ─ las etapas. Es la primera pregunta de cualquier
          reunion de obra, y la que la tabla de codigos no contestaba. */}
      {!!req?.hitos?.length && (
        <Seccion titulo="Qué se entrega y cuándo"
                 sub="Cada etapa es una entrega completa: el mismo contenedor se vuelve a entregar, con más información.">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {req.hitos.map(h => (
              <button key={h.hito} onClick={() => setHito(hito === h.hito ? '' : h.hito)}
                      style={{
                        flex: '1 1 240px', textAlign: 'left', cursor: 'pointer',
                        background: hito === h.hito ? 'var(--bg-info, var(--bg-secondary))' : 'var(--bg-primary)',
                        border: `1px solid ${hito === h.hito ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 10, padding: '12px 14px',
                      }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{h.hito}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {fecha(h.fecha) || 'sin fecha'}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 5 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{h.total}</strong> contenedores ·{' '}
                  {h.responsables > 0
                    ? `${h.responsables} responsables`
                    : <span style={{ color: 'var(--warning)' }}>sin responsable asignado</span>}
                </div>
              </button>
            ))}
          </div>
        </Seccion>
      )}

      {/* 2. COMO ─ los requisitos. Sin esto el plan no le dice a nadie que
          tiene que producir, que es exactamente lo que fallaba. */}
      {req && (
        <Seccion titulo="Cómo se entrega"
                 sub="Los requisitos que el plan exige a cada contenedor.">
          <Nomenclatura nom={req.nomenclatura} />
          <div style={{ marginTop: 12 }}>
            <Requisito etiqueta="Formato"
                       valores={(req.formatos || []).map(v => ({ clave: v.valor, n: v.n }))} />
            <Requisito etiqueta="Nivel de información"
                       valores={(req.loin || []).map(v => ({
                         clave: `LOD ${v.lod} · LOI ${v.loi}`, n: v.n }))} />
            <Requisito etiqueta="Idoneidad"
                       valores={(req.idoneidad || []).map(v => ({
                         clave: v.valor, n: v.n, nota: v.familia }))} />
            <Requisito etiqueta="Revisión"
                       valores={(req.revision || []).map(v => ({ clave: v.valor, n: v.n }))} />
            <Requisito etiqueta="Escala"
                       valores={(req.escalas || []).slice(0, 8).map(v => ({ clave: v.valor, n: v.n }))} />
            <Requisito etiqueta="Disciplina"
                       valores={(req.disciplinas || []).map(v => ({ clave: v.valor, n: v.n }))} />
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>
            La idoneidad dice para qué sirve lo entregado: la familia <strong>S</strong> es
            material compartido para revisión y coordinación; la familia <strong>A</strong> o{' '}
            <strong>B</strong> es material autorizado. Con un código S no se construye.
          </p>
        </Seccion>
      )}

      {/* 3. QUE CHIRRIA ─ salen del plan, no de una opinion. */}
      {!!req?.avisos?.length && (
        <Seccion titulo="Lo que el plan deja abierto">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {req.avisos.map((a, i) => {
              const err = a.nivel === 'error';
              return (
                <div key={i} style={{
                  padding: '9px 12px', borderRadius: 8, fontSize: 12.5, lineHeight: 1.5,
                  background: err ? 'var(--bg-danger)' : 'var(--bg-warning)',
                  border: `1px solid ${err ? 'var(--border-danger)' : 'var(--border-warning)'}`,
                  color: err ? 'var(--danger)' : 'var(--text-primary)',
                }}>{a.texto}</div>
              );
            })}
          </div>
        </Seccion>
      )}

      {/* 4. EL AVANCE ─ y el aviso que impide leerlo al reves. */}
      {r && (
        <Seccion titulo="Avance del plan">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Cifra n={r.total} texto="comprometidos en el plan" />
            <Cifra n={r.cotejados ?? 0} texto="cotejados con un documento" />
            <Cifra n={r.entregados} texto="entregados y publicados" color="var(--success)" />
            <Cifra n={r.vencidos} texto="con el plazo cumplido" color="var(--danger)"
                   resaltado={r.vencidos > 0 && !r.plan_sin_cotejar} />
          </div>
          {/* Sin un solo documento cotejado, estas cifras hablan de NUESTRO trabajo
              de vinculacion, no de lo que la obra entrego. Decirlo aqui es lo que
              impide que se lea al reves en una reunion con el cliente. */}
          {r.plan_sin_cotejar && (
            <div style={{
              marginTop: 10, padding: '11px 14px', borderRadius: 9,
              background: 'var(--bg-warning)', border: '1px solid var(--border-warning)',
            }}>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--warning)', fontWeight: 600 }}>
                Ningún compromiso está todavía cotejado con un documento del ECD.
              </p>
              <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                «Plazo cumplido» quiere decir que la fecha pasó, <strong>no</strong> que no se
                haya entregado: eso el ECD todavía no lo sabe. El plan está cargado; el
                cotejo con los documentos es el paso siguiente.
              </p>
            </div>
          )}
        </Seccion>
      )}

      {/* 5. EL DETALLE ─ agrupado, y cada fila con su ficha. */}
      {!!datos?.plan.length && (
        <Seccion titulo="Los compromisos, uno a uno"
                 sub="Pulsa un contenedor para ver su encargo completo.">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
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
            {hito && (
              <button onClick={() => setHito('')}
                      style={{
                        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                        borderRadius: 7, padding: '7px 11px', fontSize: 12.5, cursor: 'pointer',
                        color: 'var(--text-primary)',
                      }}>
                {hito} ✕
              </button>
            )}
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
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 900 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', textAlign: 'left' }}>
                  {['Código', 'Título', 'Formato', 'LOD/LOI', 'Idoneidad', 'Rev.',
                    'Entrega', 'Responsable', 'Estado'].map(h => (
                    <th key={h} style={{ padding: '9px 11px', fontWeight: 600,
                                         color: 'var(--text-secondary)',
                                         borderBottom: '1px solid var(--border)',
                                         whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              {grupos.map(([disc, items]) => {
                const plegado = plegadas[disc] ?? !buscando;
                return (
                  <tbody key={disc}>
                    <tr onClick={() => setPlegadas(p => ({ ...p, [disc]: !(p[disc] ?? !buscando) }))}
                        style={{ cursor: 'pointer', background: 'var(--neutral-100)' }}>
                      <td colSpan={9} style={{
                        padding: '7px 11px', fontWeight: 600, fontSize: 12,
                        color: 'var(--text-primary)', borderBottom: '1px solid var(--border)',
                      }}>
                        {plegado ? '▸' : '▾'} Disciplina {disc}
                        <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--text-muted)' }}>
                          {items.length} contenedores
                        </span>
                      </td>
                    </tr>
                    {!plegado && items.map(f => (
                      <React.Fragment key={f.id}>
                        <tr onClick={() => setAbierta(abierta === f.id ? null : f.id)}
                            style={{
                              borderBottom: '1px solid var(--divider)', cursor: 'pointer',
                              background: abierta === f.id ? 'var(--bg-secondary)' : 'transparent',
                            }}>
                          <td style={{ padding: '8px 11px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                            {f.identificador}
                            {f.tipo === 'TIDP' && (
                              <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)' }}>TIDP</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 11px', maxWidth: 260 }}>{f.titulo || '—'}</td>
                          <td style={{ padding: '8px 11px', whiteSpace: 'nowrap' }}>{f.formato || '—'}</td>
                          <td style={{ padding: '8px 11px', whiteSpace: 'nowrap',
                                       color: (f.lod || f.loi) ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            {(f.lod || f.loi) ? `${f.lod || '—'} / ${f.loi || '—'}` : 'sin declarar'}
                          </td>
                          <td style={{ padding: '8px 11px' }}>{f.idoneidad_prevista || '—'}</td>
                          <td style={{ padding: '8px 11px' }}>{f.revision_prevista || '—'}</td>
                          <td style={{ padding: '8px 11px', whiteSpace: 'nowrap' }}>
                            {fecha(f.fecha_comprometida) || f.hito || '—'}
                          </td>
                          <td style={{ padding: '8px 11px', whiteSpace: 'nowrap',
                                       color: f.responsable ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            {f.responsable || 'sin asignar'}
                          </td>
                          <td style={{ padding: '8px 11px' }}>
                            <Chip estado={f.estado} etiqueta={f.estado_etiqueta} />
                          </td>
                        </tr>
                        {abierta === f.id && (
                          <tr>
                            <td colSpan={9} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
                              <Ficha f={f} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                );
              })}
            </table>
          </div>
        </Seccion>
      )}

    </div>
  );
}
