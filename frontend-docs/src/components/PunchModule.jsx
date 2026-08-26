// PunchModule — GAP 04 · ISSUES Y PUNCH.
//
// LA PREGUNTA QUE ESTA PANTALLA RESPONDE:
//     ¿QUÉ DEFECTOS SIGUEN ABIERTOS, Y DE QUIÉN ES LA PELOTA AHORA?
//
// POR QUÉ NO SE LLAMA `IssueModule`
// ---------------------------------
// Ese nombre ya está ocupado por el componente genérico de RFI y Red Line
// (`IssueModule.jsx`), que a pesar del nombre NO es este objeto. El 25-ago-2026
// se congeló `RED LINE ≠ ISSUE`; reutilizar el nombre habría vuelto a mezclar
// justo lo que se acababa de separar, esta vez en el árbol de ficheros.
//
// LA DECISIÓN DE INTERFAZ QUE MÁS IMPORTA
// ---------------------------------------
// Las TRES identidades se ven SIEMPRE, en la lista y en el detalle:
//
//     DETECTÓ   ≠   CORRIGE   ≠   VERIFICA
//
// No es decoración. El objeto entero se sostiene sobre que sean personas
// distintas, y una pantalla que enseñara solo «responsable» dejaría creer que
// hay dos papeles donde hay tres — que es exactamente el error que tenía el
// backend hasta esta misma semana.
//
// A quién le toca NO se deduce aquí: lo dice el servidor en `a_quien_le_toca`,
// calculado por la misma función que reparte los encargos. Si esta pantalla lo
// dedujera por su cuenta habría dos versiones de la regla —la que manda los
// avisos y la que dibuja la lista— y divergirían en el primer estado nuevo.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/apiFetch';
import * as campo from '../offline/captura';
import { confirmAction } from '../utils/confirm';

const COLOR_ESTADO = {
  'Abierto':    { fondo: '#fdecec', texto: '#a12f2f' },
  'Corregido':  { fondo: '#fff4e0', texto: '#8a5a12' },
  'Verificado': { fondo: '#e8f5ec', texto: '#1e6b3a' },
  'Reabierto':  { fondo: '#fdecec', texto: '#8c1d1d' },
  'Anulado':    { fondo: '#f3f4f6', texto: '#8a9199' },
};

const COLOR_TIPO = {
  PUNCH:          { fondo: '#eef2f7', texto: '#2c5d8a' },
  NO_CONFORMIDAD: { fondo: '#fdecec', texto: '#a12f2f' },
  CALIDAD:        { fondo: '#f2eefa', texto: '#5b4a8a' },
  SEGURIDAD:      { fondo: '#fff1e6', texto: '#9a4a12' },
};

const CAJA = { border: '1px solid #dfe3e8', borderRadius: 6, boxSizing: 'border-box' };

// El historial se guarda con los nombres del motor (`flujo_de_registro.entrada`),
// que son los mismos para todos los registros del producto. Traducirlos AL LEER
// —y no al escribir— es lo que permite que el expediente siga siendo legible por
// una máquina y por una persona a la vez.
const EVENTO = {
  detected: 'Detectado',
  corrected: 'Corregido',
  verified: 'Verificado',
  reopened: 'Reabierto',
  voided: 'Anulado',
  self_verification_allowed: 'Autoverificación autorizada',
};

function Chip({ mapa, valor, texto }) {
  const c = mapa[valor] || { fondo: '#f3f4f6', texto: '#6b7280' };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                   background: c.fondo, color: c.texto, whiteSpace: 'nowrap' }}>
      {texto || valor}
    </span>
  );
}

// ── LAS TRES IDENTIDADES ───────────────────────────────────────────────────
// Un papel vacío se dice, no se esconde. «Sin designar» es información: es un
// issue que va a quedarse sin nadie a quien pasarle la pelota al corregirse.
function Papel({ rotulo, uid, nombres, esElTurno, ausenteGrave }) {
  const nombre = uid ? (nombres[uid] || `usuario ${uid}`) : null;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em',
                    color: esElTurno ? '#a12f2f' : '#9aa3ad' }}>
        {rotulo}{esElTurno ? ' · LE TOCA' : ''}
      </div>
      <div style={{ fontSize: 12, color: nombre ? '#1f2933' : (ausenteGrave ? '#a12f2f' : '#98a1ab'),
                    fontWeight: esElTurno ? 650 : 400, whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {nombre || 'sin designar'}
      </div>
    </div>
  );
}

function Identidades({ d, nombres }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 14, alignItems: 'start' }}>
      <Papel rotulo="DETECTÓ" uid={d.autor_id} nombres={nombres} />
      <Papel rotulo="CORRIGE" uid={d.responsable_id} nombres={nombres}
             esElTurno={d.a_quien_le_toca === d.responsable_id && !!d.responsable_id} />
      <Papel rotulo="VERIFICA" uid={d.verificador_id} nombres={nombres}
             esElTurno={d.a_quien_le_toca === d.verificador_id && !!d.verificador_id}
             // Corregido y sin verificador designado: la pelota se ha caído.
             // Eso hay que verlo en rojo, no en gris.
             ausenteGrave={d.estado === 'Corregido'} />
    </div>
  );
}

export default function PunchModule({ project, API, user, isAdmin }) {
  const [issues, setIssues] = useState(null);
  const [resumen, setResumen] = useState({});
  const [catalogo, setCatalogo] = useState({ tipos: [], estados: [] });
  const [miembros, setMiembros] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [filtro, setFiltro] = useState({ tipo: '', estado: '', mios: false });
  const [abierto, setAbierto] = useState(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState('');

  const urn = project?.model_urn || project?.urn;
  const obra = project?.id;

  const nombres = useMemo(() => {
    const m = {};
    miembros.forEach(p => { m[p.id] = p.name || p.email; });
    return m;
  }, [miembros]);

  const cargar = useCallback(async () => {
    if (!urn) return;
    setError('');
    try {
      const q = new URLSearchParams({ model_urn: urn });
      if (filtro.tipo) q.set('tipo', filtro.tipo);
      if (filtro.estado) q.set('estado', filtro.estado);
      const r = await apiFetch(`${API}/api/issues?${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar.');
      setIssues(d.issues || []);
      setResumen(d.resumen || {});
      // Si hay un detalle abierto, se refresca con la versión recién traída.
      setAbierto(a => (a ? (d.issues || []).find(x => x.id === a.id) || null : null));
    } catch (e) {
      setIssues([]);
      setError(e.message || 'No se pudieron cargar los issues.');
    }
  }, [API, urn, filtro.tipo, filtro.estado]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    apiFetch(`${API}/api/issues/catalogo`)
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

  useEffect(() => {
    if (!urn) return;
    apiFetch(`${API}/api/planos?model_urn=${encodeURIComponent(urn)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setPlanos(d.planos || []); })
      .catch(() => {});
  }, [API, urn]);

  const visibles = useMemo(() => {
    const lista = issues || [];
    if (!filtro.mios) return lista;
    return lista.filter(i => i.a_quien_le_toca === user?.id);
  }, [issues, filtro.mios, user]);

  const meToca = (issues || []).filter(i => i.a_quien_le_toca === user?.id).length;
  // Corregidos que se quedaron sin nadie a quien pasarles la pelota. Deuda
  // visible: preferimos enseñarla a que un administrador la descubra tarde.
  const sinVerificador = (issues || []).filter(
    i => i.estado === 'Corregido' && !i.verificador_id).length;

  const totalPor = (estado) => Object.values(resumen)
    .reduce((n, porEstado) => n + (porEstado[estado] || 0), 0);

  return (
    <div style={{ padding: '18px 22px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 650, color: '#1f2933' }}>
          Issues y punch
        </h2>
        <span style={{ fontSize: 12.5, color: '#78838f' }}>
          Un defecto se cierra cuando <b>otro</b> verifica que se corrigió.
        </span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setCreando(true)}
                style={{ padding: '8px 15px', borderRadius: 6, border: 'none',
                         background: 'var(--accent, #3E6F91)', color: '#fff',
                         fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Levantar issue
        </button>
      </div>

      {/* EL ESTADO DE LA OBRA EN UNA LÍNEA */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0 12px' }}>
        {['Abierto', 'Reabierto', 'Corregido', 'Verificado'].map(e => (
          <button key={e} type="button"
                  onClick={() => setFiltro(f => ({ ...f, estado: f.estado === e ? '' : e }))}
                  style={{ ...CAJA, padding: '6px 12px', cursor: 'pointer',
                           background: filtro.estado === e ? '#eef2f7' : '#fff',
                           borderColor: filtro.estado === e ? '#3E6F91' : '#dfe3e8' }}>
            <span style={{ fontSize: 16, fontWeight: 700,
                           color: (COLOR_ESTADO[e] || {}).texto || '#1f2933' }}>
              {totalPor(e)}
            </span>
            <span style={{ fontSize: 11.5, color: '#78838f', marginLeft: 6 }}>{e}</span>
          </button>
        ))}
        <button type="button" onClick={() => setFiltro(f => ({ ...f, mios: !f.mios }))}
                style={{ ...CAJA, padding: '6px 12px', cursor: 'pointer',
                         background: filtro.mios ? '#fff4e0' : '#fff',
                         borderColor: filtro.mios ? '#c98a2a' : '#dfe3e8' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#8a5a12' }}>{meToca}</span>
          <span style={{ fontSize: 11.5, color: '#78838f', marginLeft: 6 }}>me toca a mí</span>
        </button>
        <select value={filtro.tipo} onChange={e => setFiltro(f => ({ ...f, tipo: e.target.value }))}
                style={{ ...CAJA, height: 34, padding: '0 8px', fontSize: 12.5, background: '#fff' }}>
          <option value="">Todos los tipos</option>
          {(catalogo.tipos || []).map(t => (
            <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>
          ))}
        </select>
      </div>

      {sinVerificador > 0 && (
        <div style={{ ...CAJA, borderColor: '#f0c9a0', background: '#fff8f0',
                      padding: '9px 13px', marginBottom: 12, fontSize: 12.5,
                      color: '#8a5a12' }}>
          <b>{sinVerificador}</b> issue(s) corregidos sin verificador designado: nadie
          tiene la pelota. Hasta que se les asigne uno, solo un administrador de la
          obra puede cerrarlos.
        </div>
      )}

      {error && (
        <div style={{ ...CAJA, borderColor: '#f5c9c9', background: '#fdecec',
                      padding: '9px 13px', marginBottom: 12, fontSize: 12.5,
                      color: '#a12f2f' }}>{error}</div>
      )}

      {issues === null && (
        <div style={{ padding: 30, textAlign: 'center', color: '#98a1ab', fontSize: 13 }}>
          Cargando…
        </div>
      )}

      {issues !== null && visibles.length === 0 && (
        <div style={{ padding: '26px 20px', textAlign: 'center', color: '#98a1ab',
                      fontSize: 13, border: '1px dashed #dfe3e8', borderRadius: 8 }}>
          {filtro.mios ? 'No tienes ningún issue esperándote.' : 'Sin issues con este filtro.'}
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {visibles.map(i => (
          <FilaIssue key={i.id} d={i} nombres={nombres} yo={user?.id}
                     onAbrir={() => setAbierto(i)} abierta={abierto?.id === i.id} />
        ))}
      </div>

      {abierto && (
        <PanelIssue d={abierto} API={API} user={user} isAdmin={isAdmin} nombres={nombres}
                    onCerrar={() => setAbierto(null)} onCambio={cargar} />
      )}

      {creando && (
        <ModalLevantar API={API} urn={urn} catalogo={catalogo} miembros={miembros}
                       planos={planos} yo={user?.id}
                       user={user} project={project}
                       onCerrar={() => setCreando(false)}
                       onCreado={() => { setCreando(false); cargar(); }} />
      )}
    </div>
  );
}

function FilaIssue({ d, nombres, yo, onAbrir, abierta }) {
  const esMio = d.a_quien_le_toca === yo && !!yo;
  return (
    <div onClick={onAbrir}
         style={{ ...CAJA, background: '#fff', padding: '11px 14px', cursor: 'pointer',
                  borderColor: abierta ? '#3E6F91' : (esMio ? '#e6c79a' : '#e5e8eb'),
                  borderLeft: esMio ? '3px solid #c98a2a' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5,
                       fontWeight: 700, color: '#3E6F91' }}>{d.codigo}</span>
        <Chip mapa={COLOR_TIPO} valor={d.tipo} texto={d.tipo_etiqueta} />
        <span style={{ fontSize: 13.5, color: '#1f2933', flex: 1, minWidth: 160 }}>
          {d.titulo}
        </span>
        {d.autoverificacion && (
          <span title={d.autoverificacion_motivo || ''}
                style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                         background: '#f2eefa', color: '#5b4a8a' }}>
            AUTOVERIFICACIÓN AUTORIZADA
          </span>
        )}
        <Chip mapa={COLOR_ESTADO} valor={d.estado} />
      </div>
      <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid #f1f3f5' }}>
        <Identidades d={d} nombres={nombres} />
      </div>
      {(d.ubicacion || d.progresiva || d.origen_tipo) && (
        <div style={{ marginTop: 7, fontSize: 11.5, color: '#8a9199' }}>
          {[d.ubicacion, d.progresiva].filter(Boolean).join(' · ')}
          {d.origen_tipo && (
            <span style={{ marginLeft: 8 }}>
              ← nació de un {d.origen_tipo.toLowerCase()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── EL DETALLE, DONDE SE ACTÚA ─────────────────────────────────────────────
//
// Cada acto es una llamada distinta con su propia autoridad, igual que en el
// backend. Aquí NO hay un «cambiar estado»: no existe en el servidor, y ofrecerlo
// habría sido dibujar una puerta que no está.
function PanelIssue({ d, API, user, isAdmin, nombres, onCerrar, onCambio }) {
  const [ocupado, setOcupado] = useState(false);
  const [texto, setTexto] = useState('');
  const [evidencias, setEvidencias] = useState([]);

  const yo = user?.id;
  const soyResponsable = yo && d.responsable_id === yo;
  const soyVerificador = yo && d.verificador_id === yo;
  const puedeCorregir = soyResponsable && ['Abierto', 'Reabierto'].includes(d.estado);
  // El espejo EXACTO de `flujo_de_issue.puede_verificar`. Si diverge, el
  // servidor gana: la pantalla puede ofrecer de menos, nunca de más.
  const puedeVerificar = d.estado === 'Corregido' && (
    soyResponsable ? !!d.autoverificacion
      : (d.verificador_id ? soyVerificador : !!isAdmin));

  const llamar = async (ruta, cuerpo, exito) => {
    setOcupado(true);
    try {
      const r = await apiFetch(`${API}/api/issues/${d.id}/${ruta}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const res = await r.json();
      if (!r.ok) throw new Error(res.error || 'No se pudo.');
      toast.success(exito);
      setTexto(''); setEvidencias([]);
      await onCambio();
    } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  };

  const verificar = async (acepta) => {
    if (!acepta && !texto.trim()) {
      toast.error('Rechazar exige un motivo: sin él, quien corrige no sabe qué rehacer.');
      return;
    }
    if (acepta && !await confirmAction({
      titulo: `Verificar ${d.codigo}`,
      mensaje: 'Estás dando por buena la corrección y cerrando el issue. '
             + 'Un defecto nuevo sobre lo mismo será un issue nuevo.',
      confirmar: 'Verificar y cerrar',
    })) return;
    await llamar('verificar', { acepta, motivo: texto.trim() },
                 acepta ? 'Verificado y cerrado' : 'Reabierto: vuelve a quien corrige');
  };

  return (
    <div onClick={onCerrar}
         style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,26,.45)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: '#fff', borderRadius: 10, padding: 24, width: 640,
                    maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto',
                    boxShadow: '0 12px 40px rgba(0,0,0,.22)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13,
                         fontWeight: 700, color: '#3E6F91' }}>{d.codigo}</span>
          <Chip mapa={COLOR_TIPO} valor={d.tipo} texto={d.tipo_etiqueta} />
          <Chip mapa={COLOR_ESTADO} valor={d.estado} />
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onCerrar}
                  style={{ border: 'none', background: 'none', fontSize: 20,
                           color: '#98a1ab', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <h3 style={{ margin: '10px 0 4px', fontSize: 16.5, fontWeight: 650 }}>{d.titulo}</h3>
        {d.descripcion && (
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#5f6b76', lineHeight: 1.55 }}>
            {d.descripcion}
          </p>
        )}

        <div style={{ ...CAJA, padding: '11px 13px', background: '#fafbfc', margin: '12px 0' }}>
          <Identidades d={d} nombres={nombres} />
          {d.verificado_por && d.verificado_por !== d.verificador_id && (
            <div style={{ marginTop: 9, fontSize: 11.5, color: '#8a5a12' }}>
              Lo verificó <b>{nombres[d.verificado_por] || d.verificado_por}</b>, que no
              era el verificador designado. Quedan registradas las dos cosas.
            </div>
          )}
        </div>

        {d.autoverificacion && (
          <div style={{ ...CAJA, borderColor: '#ddd0f0', background: '#f7f4fd',
                        padding: '9px 13px', marginBottom: 12, fontSize: 12.5,
                        color: '#5b4a8a' }}>
            <b>Autoverificación autorizada.</b> Quien corrige puede cerrar este issue.
            {d.autoverificacion_motivo && <> Motivo: «{d.autoverificacion_motivo}»</>}
          </div>
        )}

        {(d.evidencia_correccion || []).length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#8a9199',
                          letterSpacing: '.05em', marginBottom: 5 }}>
              EVIDENCIA DE LA CORRECCIÓN
            </div>
            {d.evidencia_correccion.map((e, n) => (
              <div key={n} style={{ fontSize: 12, color: '#5f6b76' }}>
                · {e.nombre || 'evidencia'} <span style={{ color: '#98a1ab' }}>— {e.por}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── LOS ACTOS ─────────────────────────────────────────────────── */}
        {puedeCorregir && (
          <div style={{ ...CAJA, padding: 13, marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 650, marginBottom: 7 }}>
              Declarar corregido
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#78838f', lineHeight: 1.5 }}>
              Exige evidencia: sin ella, quien verifica tiene que volver a la obra —
              y cuando ya se ha construido encima, a veces no se puede.
            </p>
            <div style={{ fontSize: 12, color: evidencias.length ? '#1e6b3a' : '#a12f2f',
                          marginBottom: 8 }}>
              {evidencias.length ? `✓ ${evidencias.length} evidencia(s)` : '✕ Sin evidencia'}
              <button type="button"
                      onClick={() => setEvidencias(a => [...a, { nombre: `correccion-${a.length + 1}.jpg` }])}
                      style={{ marginLeft: 8, padding: '2px 9px', fontSize: 11.5,
                               borderRadius: 4, border: '1px solid #cfd6dd',
                               background: '#fff', cursor: 'pointer' }}>
                Adjuntar
              </button>
            </div>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2}
                      placeholder="Qué se hizo (opcional)"
                      style={{ ...CAJA, width: '100%', padding: '6px 9px', fontSize: 12.5,
                               fontFamily: 'inherit', marginBottom: 8 }} />
            <button type="button" disabled={ocupado || !evidencias.length}
                    onClick={() => llamar('corregir',
                                          { evidencia: evidencias, comentario: texto.trim() },
                                          'Corregido: la pelota pasa a quien verifica')}
                    style={{ padding: '8px 15px', borderRadius: 6, border: 'none',
                             background: evidencias.length ? 'var(--accent, #3E6F91)' : '#cfd6dd',
                             color: '#fff', fontSize: 13, fontWeight: 600,
                             cursor: evidencias.length ? 'pointer' : 'not-allowed' }}>
              {ocupado ? 'Guardando…' : 'Declarar corregido'}
            </button>
          </div>
        )}

        {puedeVerificar && (
          <div style={{ ...CAJA, padding: 13, marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 650, marginBottom: 7 }}>
              Verificar la corrección
            </div>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2}
                      placeholder="Motivo (obligatorio si rechazas)"
                      style={{ ...CAJA, width: '100%', padding: '6px 9px', fontSize: 12.5,
                               fontFamily: 'inherit', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={ocupado} onClick={() => verificar(true)}
                      style={{ padding: '8px 15px', borderRadius: 6, border: 'none',
                               background: '#1e6b3a', color: '#fff', fontSize: 13,
                               fontWeight: 600, cursor: 'pointer' }}>
                Verificar y cerrar
              </button>
              <button type="button" disabled={ocupado} onClick={() => verificar(false)}
                      style={{ padding: '8px 15px', borderRadius: 6,
                               border: '1px solid #f0b8b8', background: '#fff',
                               color: '#a12f2f', fontSize: 13, fontWeight: 600,
                               cursor: 'pointer' }}>
                Rechazar y reabrir
              </button>
            </div>
          </div>
        )}

        {/* POR QUÉ NO PUEDES: decirlo es parte de enseñar la separación. Un
            botón ausente sin explicación se lee como un fallo de la pantalla. */}
        {d.estado === 'Corregido' && !puedeVerificar && (
          <div style={{ ...CAJA, padding: '10px 13px', marginBottom: 10, fontSize: 12.5,
                        color: '#78838f', background: '#fafbfc' }}>
            {soyResponsable
              ? 'Corregiste tú: quien corrige no verifica su propia corrección. '
                + 'Un administrador de la obra puede autorizar la autoverificación, y quedará escrita.'
              : d.verificador_id
                ? `La verificación le corresponde a ${nombres[d.verificador_id] || 'su verificador designado'}.`
                : 'Este issue no tiene verificador designado; hasta que se le asigne uno, '
                  + 'solo un administrador de la obra puede cerrarlo.'}
          </div>
        )}

        {isAdmin && d.estado === 'Corregido' && !d.autoverificacion
          && d.responsable_id && !d.verificador_id && (
          <div style={{ ...CAJA, padding: 13, marginBottom: 10, borderColor: '#ddd0f0',
                        background: '#faf8fe' }}>
            <div style={{ fontSize: 12.5, fontWeight: 650, marginBottom: 5 }}>
              Autorizar autoverificación
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#78838f', lineHeight: 1.5 }}>
              Excepción: permite que <b>quien corrigió</b> cierre este issue. Exige motivo
              escrito y queda en el historial. Una excepción que se puede leer es gobierno;
              una que se concede en silencio es un agujero.
            </p>
            <input value={texto} onChange={e => setTexto(e.target.value)}
                   placeholder="Motivo — por qué en este caso no hay un tercero"
                   style={{ ...CAJA, width: '100%', height: 34, padding: '0 9px',
                            fontSize: 12.5, marginBottom: 8 }} />
            <button type="button" disabled={ocupado || !texto.trim()}
                    onClick={() => llamar('autoverificacion', { motivo: texto.trim() },
                                          'Autoverificación autorizada')}
                    style={{ padding: '7px 14px', borderRadius: 6, border: 'none',
                             background: texto.trim() ? '#5b4a8a' : '#cfd6dd', color: '#fff',
                             fontSize: 12.5, fontWeight: 600,
                             cursor: texto.trim() ? 'pointer' : 'not-allowed' }}>
              Autorizar
            </button>
          </div>
        )}

        {/* ── EL HISTORIAL: quién hizo cada acto ────────────────────────── */}
        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#8a9199',
                      letterSpacing: '.05em', margin: '14px 0 6px' }}>
          HISTORIAL
        </div>
        <div style={{ borderLeft: '2px solid #eceff2', paddingLeft: 11 }}>
          {(d.history || []).map((h, n) => (
            <div key={n} style={{ marginBottom: 7, fontSize: 12 }}>
              <b style={{ color: '#1f2933' }}>{EVENTO[h.event] || h.event}</b>
              <span style={{ color: '#78838f' }}> — {h.by}</span>
              {h.at && (
                <span style={{ color: '#98a1ab' }}>
                  {' · '}{String(h.at).slice(0, 16).replace('T', ' ')}
                </span>
              )}
              {(h.motivo || h.comentario) && (
                <div style={{ color: '#5f6b76', marginTop: 2 }}>«{h.motivo || h.comentario}»</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── LEVANTAR ───────────────────────────────────────────────────────────────
//
// Lo que cada tipo EXIGE lo dice el catálogo del servidor (`exige_responsable`,
// `exige_verificador`, `exige_ubicacion`), no una lista escrita aquí. Si mañana
// se añade un tipo, esta pantalla ya sabe pedirle lo suyo.
function ModalLevantar({ API, urn, catalogo, miembros, planos, yo,
                        user, project, onCerrar, onCreado }) {
  const [f, setF] = useState({
    tipo: 'PUNCH', titulo: '', descripcion: '', responsable_id: '',
    verificador_id: '', revision_id: '', ubicacion: '', progresiva: '', vence_en: '',
  });
  const [guardando, setGuardando] = useState(false);

  const tipo = (catalogo.tipos || []).find(t => t.codigo === f.tipo) || {};
  const conVigente = planos.filter(p => p.vigente);

  const crear = async () => {
    if (!f.titulo.trim()) { toast.error('El título es obligatorio.'); return; }
    if (tipo.exige_responsable && !f.responsable_id) {
      toast.error('Un defecto sin responsable es un defecto que nadie va a corregir.'); return;
    }
    if (tipo.exige_verificador && !f.verificador_id) {
      toast.error('Este tipo exige un verificador designado distinto de quien corrige.'); return;
    }
    if (f.responsable_id && f.responsable_id === f.verificador_id) {
      toast.error('Quien corrige no puede ser quien verifica.'); return;
    }
    if (tipo.exige_ubicacion && !f.revision_id) {
      toast.error('Un punch se levanta sobre una lámina concreta.'); return;
    }
    setGuardando(true);
    try {
      // GAP 07 · EL MISMO CAMINO CON Y SIN COBERTURA.
      //
      // Un punch se levanta EN OBRA, que es exactamente donde no hay señal. Si
      // esta pantalla solo funcionara con red, la observación se apuntaría en
      // una libreta y se pasaría al sistema por la noche -- o no se pasaría.
      const ctx = campo.contextoDe(user, project);
      if (!ctx) throw new Error('no se pudo identificar la obra');
      const { modo, datos, veredicto } = await campo.capturar(API, ctx, {
        object_type: campo.ISSUE,
        action: campo.CREATE,
        local_object_id: campo.nuevoObjetoLocal(),
        payload: {
          ...f, model_urn: urn,
          responsable_id: f.responsable_id ? Number(f.responsable_id) : null,
          verificador_id: f.verificador_id ? Number(f.verificador_id) : null,
          // EL ANCLAJE HISTORICO. Es la revisión que se está mirando AHORA, y
          // sigue siendo esa aunque salga una más nueva mientras no haya red.
          revision_id: f.revision_id || null,
          vence_en: f.vence_en || null,
        },
      });

      if (modo === 'servidor') {
        toast.success(`${(datos.canonical_result || {}).codigo || ''} levantado`);
      } else if (veredicto) {
        // El servidor decidió algo distinto de aceptarlo. No se disfraza de
        // éxito ni de fallo de red: se dice lo que dijo.
        toast.error(veredicto.error || 'el servidor no lo aceptó');
      } else {
        // GUARDADO AQUI, NO CONFIRMADO. La diferencia se dice, no se insinúa.
        toast.success('Guardado en este dispositivo. Subirá cuando haya '
                      + 'cobertura; míralo en «Trabajo de campo».',
                      { duration: 6000 });
      }
      onCreado();
    } catch (e) { toast.error(e.message); } finally { setGuardando(false); }
  };

  const selPersona = (campo, excluir) => (
    <select value={f[campo]} onChange={e => setF(p => ({ ...p, [campo]: e.target.value }))}
            style={{ ...CAJA, width: '100%', height: 36, padding: '0 8px',
                     fontSize: 13, background: '#fff' }}>
      <option value="">Sin designar</option>
      {miembros.filter(m => String(m.id) !== String(excluir)).map(m => (
        <option key={m.id} value={m.id}>
          {m.name || m.email}{m.empresa ? ` — ${m.empresa}` : ''}
        </option>
      ))}
    </select>
  );

  return (
    <div onClick={onCerrar}
         style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,26,.45)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: '#fff', borderRadius: 10, padding: 24, width: 560,
                    maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto',
                    boxShadow: '0 12px 40px rgba(0,0,0,.22)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 650 }}>Levantar issue</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#78838f', lineHeight: 1.5 }}>
          Tú quedas como <b>quien lo detectó</b>. Eso no se elige y no te convierte en
          quien lo cierra: el cierre lo aprueba el verificador designado.
        </p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <select value={f.tipo} onChange={e => setF(p => ({ ...p, tipo: e.target.value }))}
                  style={{ ...CAJA, flex: '0 0 210px', height: 36, padding: '0 8px',
                           fontSize: 13, background: '#fff' }}>
            {(catalogo.tipos || []).map(t => (
              <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>
            ))}
          </select>
          <input value={f.titulo} onChange={e => setF(p => ({ ...p, titulo: e.target.value }))}
                 placeholder="Qué está mal"
                 style={{ ...CAJA, flex: 1, height: 36, padding: '0 10px', fontSize: 13 }} />
        </div>

        <textarea value={f.descripcion} rows={2}
                  onChange={e => setF(p => ({ ...p, descripcion: e.target.value }))}
                  placeholder="Descripción (opcional)"
                  style={{ ...CAJA, width: '100%', padding: '7px 10px', fontSize: 12.5,
                           fontFamily: 'inherit', marginBottom: 12 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
                      marginBottom: 4 }}>
          <div>
            <label style={{ fontSize: 10.5, fontWeight: 700, color: '#8a9199',
                            letterSpacing: '.05em' }}>
              CORRIGE{tipo.exige_responsable ? ' *' : ''}
            </label>
            {selPersona('responsable_id', f.verificador_id)}
          </div>
          <div>
            <label style={{ fontSize: 10.5, fontWeight: 700, color: '#8a9199',
                            letterSpacing: '.05em' }}>
              VERIFICA{tipo.exige_verificador ? ' *' : ''}
            </label>
            {selPersona('verificador_id', f.responsable_id)}
          </div>
        </div>
        <p style={{ margin: '6px 0 14px', fontSize: 11.5, color: '#8a9199', lineHeight: 1.5 }}>
          Tienen que ser personas distintas. Si se deja sin designar quien verifica,
          al corregirse el issue no habrá a quién pasarle la pelota.
        </p>

        {tipo.exige_ubicacion && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10.5, fontWeight: 700, color: '#8a9199',
                            letterSpacing: '.05em' }}>LÁMINA *</label>
            <select value={f.revision_id}
                    onChange={e => setF(p => ({ ...p, revision_id: e.target.value }))}
                    style={{ ...CAJA, width: '100%', height: 36, padding: '0 8px',
                             fontSize: 13, background: '#fff' }}>
              <option value="">Elegir la lámina vigente…</option>
              {conVigente.map(p => (
                <option key={p.id} value={p.vigente.id}>
                  {p.numero} — {p.titulo} (rev. {p.vigente.codigo})
                </option>
              ))}
            </select>
            {conVigente.length === 0 && (
              <div style={{ fontSize: 11.5, color: '#a12f2f', marginTop: 5 }}>
                No hay planos con revisión vigente en esta obra: un punch no puede
                levantarse sin decir dónde.
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <input value={f.ubicacion} onChange={e => setF(p => ({ ...p, ubicacion: e.target.value }))}
                 placeholder="Ubicación — «Losa eje 4, nivel +3.20»"
                 style={{ ...CAJA, flex: 1, height: 36, padding: '0 10px', fontSize: 13 }} />
          <input value={f.progresiva} onChange={e => setF(p => ({ ...p, progresiva: e.target.value }))}
                 placeholder="PK 0+340"
                 style={{ ...CAJA, flex: '0 0 130px', height: 36, padding: '0 10px', fontSize: 13 }} />
          <input type="date" value={f.vence_en}
                 onChange={e => setF(p => ({ ...p, vence_en: e.target.value }))}
                 style={{ ...CAJA, flex: '0 0 150px', height: 36, padding: '0 8px', fontSize: 13 }} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCerrar} disabled={guardando}
                  style={{ ...CAJA, padding: '8px 14px', background: '#fff',
                           fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
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
