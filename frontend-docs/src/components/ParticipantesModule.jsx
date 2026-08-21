// ParticipantesModule — quién participa en ESTA obra, y en qué calidad.
//
// QUÉ ES ESTA PANTALLA, Y QUÉ NO
// Responde a una pregunta concreta de obra pública: «¿quién es quién aquí?».
// Persona, empresa a la que pertenece, y qué función contractual ejerce esa
// empresa EN ESTA OBRA. No es administración de cuentas, ni un directorio
// corporativo, ni un organigrama.
//
// LAS CUATRO COSAS SE MANTIENEN SEPARADAS, PORQUE LO SON
//   Persona   → un usuario concreto.
//   Empresa   → a qué organización pertenece. Es GLOBAL: la misma en todas las
//               obras (`users.company_id`).
//   Función   → ENTIDAD / SUPERVISIÓN / CONTRATISTA / PROYECTISTA / OTRO. Cuelga
//     contractual del par (empresa, obra): SINOHYDRO puede ser contratista aquí
//               y proyectista en la siguiente.
//   Permiso   → lo que la persona PUEDE HACER. Es el rol del sistema y los
//               permisos de carpeta, y no tiene nada que ver con lo anterior.
//
// La función contractual NO da permisos, y el rol del sistema NO es una función
// contractual. La pantalla lo dice donde se puede confundir, no en una ayuda
// que nadie abre.
//
// POR QUÉ NO ES LA PANTALLA «MIEMBROS»
// «Miembros» lista USUARIOS DEL SISTEMA y sirve para cambiar su rol global.
// Esto lista quién participa en esta obra. Son dos preguntas distintas y por eso
// son dos pantallas; juntarlas fue lo que hizo que «Miembros», dentro de una
// obra, enseñara gente de otras.
//
// DE DÓNDE SALEN LOS DATOS
// De lo que ya existe, sin duplicar nada:
//   GET  /api/projects/<id>/miembros       personas de la obra (+empresa, +función)
//   GET  /api/projects/<id>/participantes  empresas de la obra y su función
//   POST /api/projects/<id>/participantes  declarar empresa × función  (admin)
//   PATCH …/miembros/<uid>                 a qué empresa pertenece alguien (admin)
// La función contractual de una PERSONA no se guarda en ninguna parte: se deriva
// de su empresa. Guardarla sería tener dos verdades que pueden contradecirse.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';

const COLOR_FUNCION = {
  ENTIDAD:     { fondo: '#eef2ff', borde: '#c7d2fe', texto: '#3730a3' },
  SUPERVISION: { fondo: '#ecfeff', borde: '#a5f3fc', texto: '#155e75' },
  CONTRATISTA: { fondo: '#f0fdf4', borde: '#bbf7d0', texto: '#166534' },
  PROYECTISTA: { fondo: '#fef3c7', borde: '#fde68a', texto: '#92400e' },
  OTRO:        { fondo: '#f4f4f5', borde: '#e4e4e7', texto: '#52525b' },
};

const ETIQUETA_FUNCION = {
  ENTIDAD: 'Entidad', SUPERVISION: 'Supervisión', CONTRATISTA: 'Contratista',
  PROYECTISTA: 'Proyectista', OTRO: 'Otro',
};

const ETIQUETA_ROL = {
  admin: 'Administrador', editor: 'Editar', user: 'Usar', viewer: 'Ver',
};

function ChipFuncion({ funcion }) {
  if (!funcion) {
    return <span style={{ fontSize: 12, color: '#bbb' }}>sin función asignada</span>;
  }
  const c = COLOR_FUNCION[funcion] || COLOR_FUNCION.OTRO;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 11, fontSize: 11,
      fontWeight: 600, letterSpacing: '.2px',
      background: c.fondo, border: `1px solid ${c.borde}`, color: c.texto,
    }}>{ETIQUETA_FUNCION[funcion] || funcion}</span>
  );
}

function Iniciales({ texto }) {
  const ini = (texto || '?').trim().split(/\s+/).slice(0, 2)
    .map(p => p[0]).join('').toUpperCase() || '?';
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 600, flexShrink: 0,
    }}>{ini}</div>
  );
}

export default function ParticipantesModule({ project, isAdmin }) {
  const obra = project?.id;
  const [cargando, setCargando] = useState(true);
  const [personas, setPersonas] = useState([]);
  const [empresas, setEmpresas] = useState([]);       // las que participan aquí
  const [funciones, setFunciones] = useState([]);
  const [catalogo, setCatalogo] = useState([]);       // todas las del sistema
  const [miFuncion, setMiFuncion] = useState(null);
  const [guardando, setGuardando] = useState(null);
  const [nuevaEmpresa, setNuevaEmpresa] = useState('');
  const [nuevaFuncion, setNuevaFuncion] = useState('CONTRATISTA');

  const cargar = useCallback(async () => {
    if (!obra) return;
    setCargando(true);
    try {
      const [rMiembros, rParts] = await Promise.all([
        apiFetch(`${API}/api/projects/${encodeURIComponent(obra)}/miembros`),
        apiFetch(`${API}/api/projects/${encodeURIComponent(obra)}/participantes`),
      ]);
      const dm = await rMiembros.json();
      const dp = await rParts.json();
      if (!rMiembros.ok) throw new Error(dm.error || 'No se pudieron cargar las personas');
      if (!rParts.ok) throw new Error(dp.error || 'No se pudieron cargar las empresas');
      setPersonas(dm.miembros || []);
      setEmpresas(dp.participantes || []);
      setFunciones(dp.funciones || []);
      setMiFuncion(dp.mi_funcion || null);
    } catch (e) {
      toast.error(e.message || 'No se pudo cargar el directorio de la obra.');
      setPersonas([]); setEmpresas([]);
    } finally {
      setCargando(false);
    }
  }, [obra]);

  useEffect(() => { cargar(); }, [cargar]);

  // El catálogo de empresas sólo hace falta para EDITAR, así que sólo se pide
  // cuando alguien puede editar.
  useEffect(() => {
    if (!isAdmin) return;
    apiFetch(`${API}/api/companies`).then(r => r.json())
      .then(d => setCatalogo(Array.isArray(d) ? d : []))
      .catch(() => setCatalogo([]));
  }, [isAdmin]);

  // Por `company_id`, no por nombre: dos empresas pueden llamarse igual y la
  // pantalla enseñaría la función de la que no es.
  const funcionDe = useMemo(() => {
    const m = {};
    empresas.forEach(e => { m[e.company_id] = e.funcion; });
    return m;
  }, [empresas]);

  // ── Escrituras ──────────────────────────────────────────────────────────

  async function declararEmpresa(companyId, funcion) {
    setGuardando('empresa:' + companyId);
    try {
      const r = await apiFetch(`${API}/api/projects/${encodeURIComponent(obra)}/participantes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, funcion }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar');
      await cargar();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGuardando(null);
    }
  }

  async function quitarEmpresa(companyId, nombre) {
    if (!window.confirm(
      `¿Quitar a ${nombre} del directorio de esta obra?\n\n` +
      'Deja de constar su función contractual aquí. No borra la empresa, no ' +
      'saca a nadie de la obra y no cambia ningún RFI, Red Line ni revisión ya ' +
      'registrados.')) return;
    setGuardando('empresa:' + companyId);
    try {
      const r = await apiFetch(
        `${API}/api/projects/${encodeURIComponent(obra)}/participantes/${companyId}`,
        { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo quitar');
      await cargar();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGuardando(null);
    }
  }

  async function ponerEmpresaDe(userId, companyId) {
    setGuardando('persona:' + userId);
    try {
      const r = await apiFetch(
        `${API}/api/projects/${encodeURIComponent(obra)}/miembros/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company_id: companyId === '' ? null : Number(companyId) }),
        });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar');
      await cargar();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGuardando(null);
    }
  }


  // ── Nombrar / retirar administrador DE ESTA OBRA ────────────────────────
  //
  // QUÉ CONCEDE: administrar esta obra -- su expediente, sus permisos, sus
  // rescates. Y NADA en ninguna otra obra.
  //
  // QUÉ NO TOCA: la empresa, la función contractual, los encargos ni un solo
  // histórico. Es una casilla en la fila de participación y nada más.
  async function ponerAdminDeObra(persona, quiere) {
    if (!obra) return;
    if (!quiere && !window.confirm(
      `¿Retirar a ${persona.name || persona.email} la administración de esta obra?\n\n`
      + 'Seguirá participando en la obra y conservará sus permisos de carpeta. '
      + 'Lo que pierde es administrarla.')) return;
    setGuardando('admin:' + persona.id);
    try {
      const r = await apiFetch(
        `${API}/api/projects/${encodeURIComponent(obra)}/miembros/${persona.id}/admin`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ es_admin: quiere }),
        });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo cambiar');
      setPersonas(prev => prev.map(x =>
        x.id === persona.id ? { ...x, es_admin_de_obra: quiere } : x));
      toast.success(quiere
        ? `${persona.name || persona.email} administra esta obra`
        : `${persona.name || persona.email} ya no administra esta obra`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGuardando(null);
    }
  }

  // ── Pantalla ────────────────────────────────────────────────────────────

  const sinEmpresa = personas.filter(p => !p.empresa).length;
  const empresasNoDeclaradas = useMemo(() => {
    const declaradas = new Set(empresas.map(e => e.company_id));
    const vistas = new Map();
    personas.forEach(p => {
      if (p.company_id && !declaradas.has(p.company_id)) vistas.set(p.company_id, p.empresa);
    });
    return [...vistas.values()];
  }, [personas, empresas]);

  if (cargando) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>
      Cargando participantes…</div>;
  }

  return (
    <div style={{ padding: 32, flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                    marginBottom: 6 }}>
        <div style={{ fontSize: 24, fontWeight: 300 }}>Participantes</div>
        <div style={{ fontSize: 13, color: '#888' }}>
          {personas.length} persona{personas.length !== 1 ? 's' : ''}
          {' · '}{empresas.length} empresa{empresas.length !== 1 ? 's' : ''}
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: '#777', marginBottom: 26, maxWidth: 720 }}>
        Quién participa en <b>esta obra</b> y en qué calidad.
        {miFuncion && <> Tu empresa participa aquí como <ChipFuncion funcion={miFuncion} />.</>}
      </div>

      {/* ── EMPRESAS ────────────────────────────────────────────────────── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#5f6368', letterSpacing: '.4px',
                    textTransform: 'uppercase', marginBottom: 10 }}>
        Empresas y su función contractual
      </div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 12, maxWidth: 720 }}>
        La función es <b>de la empresa en esta obra</b>: la misma empresa puede
        tener otra función en otro proyecto. <b>No otorga permisos</b> — lo que
        cada persona puede hacer lo decide su perfil del sistema.
      </div>

      {empresas.length === 0 ? (
        <div style={{ padding: '14px 16px', background: '#fafbfc', border: '1px dashed #ddd',
                      borderRadius: 8, fontSize: 13, color: '#777', marginBottom: 16 }}>
          Todavía no consta ninguna empresa en esta obra.
          {isAdmin ? ' Añádela abajo.' : ' Un administrador puede declararlas.'}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13,
                        marginBottom: 16 }}>
          <thead><tr style={{ borderBottom: '2px solid #eee', color: '#888', fontWeight: 500 }}>
            <th style={{ padding: '9px 12px', textAlign: 'left' }}>Empresa</th>
            <th style={{ padding: '9px 12px', textAlign: 'left' }}>Función contractual</th>
            <th style={{ padding: '9px 12px', textAlign: 'left' }}>Personas</th>
            {isAdmin && <th style={{ padding: '9px 12px', width: 40 }} />}
          </tr></thead>
          <tbody>
            {empresas.map(e => {
              const suyas = personas.filter(p => p.company_id === e.company_id);
  return (
                <tr key={e.company_id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '11px 12px', fontWeight: 500 }}>
                    {/* Un cuadrado, no un círculo: una empresa no es una persona. */}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ width: 26, height: 26, borderRadius: 5,
                                     background: '#eef1f4', color: '#5f6368',
                                     display: 'inline-flex', alignItems: 'center',
                                     justifyContent: 'center', fontSize: 13 }}>▪</span>
                      {e.nombre}
                    </span>
                  </td>
                  <td style={{ padding: '11px 12px' }}>
                    {isAdmin ? (
                      <select
                        value={e.funcion}
                        disabled={guardando === 'empresa:' + e.company_id}
                        onChange={ev => declararEmpresa(e.company_id, ev.target.value)}
                        style={{ padding: '4px 6px', border: '1px solid #ddd',
                                 borderRadius: 4, fontSize: 12 }}>
                        {funciones.map(f => (
                          <option key={f} value={f}>{ETIQUETA_FUNCION[f] || f}</option>
                        ))}
                      </select>
                    ) : <ChipFuncion funcion={e.funcion} />}
                  </td>
                  <td style={{ padding: '11px 12px', color: '#666' }}>
                    {suyas.length || '—'}
                  </td>
                  {isAdmin && (
                    <td style={{ padding: '11px 12px' }}>
                      <button onClick={() => quitarEmpresa(e.company_id, e.nombre)}
                              disabled={guardando === 'empresa:' + e.company_id}
                              title="Quitar del directorio de esta obra"
                              style={{ border: 'none', background: 'none', cursor: 'pointer',
                                       color: '#c0392b', fontSize: 15 }}>×</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {isAdmin && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 30 }}>
          <select value={nuevaEmpresa} onChange={e => setNuevaEmpresa(e.target.value)}
                  style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: 5,
                           fontSize: 13, minWidth: 200 }}>
            <option value="">Añadir empresa…</option>
            {catalogo
              .filter(c => !empresas.some(e => e.company_id === c.id))
              .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={nuevaFuncion} onChange={e => setNuevaFuncion(e.target.value)}
                  style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: 5,
                           fontSize: 13 }}>
            {(funciones.length ? funciones : Object.keys(ETIQUETA_FUNCION)).map(f => (
              <option key={f} value={f}>{ETIQUETA_FUNCION[f] || f}</option>
            ))}
          </select>
          <button
            disabled={!nuevaEmpresa || guardando}
            onClick={() => { declararEmpresa(Number(nuevaEmpresa), nuevaFuncion);
                             setNuevaEmpresa(''); }}
            style={{ padding: '6px 14px', border: '1px solid var(--accent)',
                     background: nuevaEmpresa ? 'var(--accent)' : '#f4f4f5',
                     color: nuevaEmpresa ? '#fff' : '#aaa', borderRadius: 5,
                     fontSize: 13, cursor: nuevaEmpresa ? 'pointer' : 'default' }}>
            Añadir
          </button>
        </div>
      )}

      {/* ── PERSONAS ────────────────────────────────────────────────────── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#5f6368', letterSpacing: '.4px',
                    textTransform: 'uppercase', marginBottom: 10 }}>
        Personas de la obra
      </div>

      {(sinEmpresa > 0 || empresasNoDeclaradas.length > 0) && (
        <div role="note" style={{ background: '#fffbeb', border: '1px solid #fde68a',
                                  color: '#92400e', borderRadius: 6, padding: '9px 12px',
                                  fontSize: 12, marginBottom: 12, maxWidth: 720 }}>
          {sinEmpresa > 0 && (
            <div>
              <b>{sinEmpresa} persona{sinEmpresa !== 1 ? 's' : ''} sin empresa.</b>{' '}
              Sin empresa no hay función contractual, porque la función se deriva
              de ella.
            </div>
          )}
          {empresasNoDeclaradas.length > 0 && (
            <div style={{ marginTop: sinEmpresa > 0 ? 5 : 0 }}>
              <b>Sin función declarada en esta obra:</b>{' '}
              {empresasNoDeclaradas.join(', ')}. Hay personas de esas empresas
              aquí, pero no consta en qué calidad participan.
            </div>
          )}
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ borderBottom: '2px solid #eee', color: '#888', fontWeight: 500 }}>
          <th style={{ padding: '9px 12px', textAlign: 'left' }}>Persona</th>
          <th style={{ padding: '9px 12px', textAlign: 'left' }}>Empresa</th>
          <th style={{ padding: '9px 12px', textAlign: 'left' }}>Función contractual</th>
          <th style={{ padding: '9px 12px', textAlign: 'left' }}>Perfil del sistema</th>
          {/* ADMINISTRA ESTA OBRA. Columna aparte del «perfil del sistema» a
              propósito: son dos cosas distintas y confundirlas fue el problema.
              El perfil es de la entidad; esto es de esta obra y solo de esta. */}
          <th style={{ padding: '9px 12px', textAlign: 'left' }}>Administra esta obra</th>
        </tr></thead>
        <tbody>
          {personas.map(p => (
            <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={{ padding: '11px 12px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <Iniciales texto={p.name || p.email} />
                  <span>
                    <div style={{ fontWeight: 500 }}>{p.name || '—'}</div>
                    <div style={{ fontSize: 11.5, color: '#999' }}>{p.email}</div>
                  </span>
                </span>
              </td>
              <td style={{ padding: '11px 12px' }}>
                {isAdmin ? (
                  <select
                    value={p.company_id ?? ''}
                    disabled={guardando === 'persona:' + p.id}
                    onChange={ev => ponerEmpresaDe(p.id, ev.target.value)}
                    title="La empresa es de la persona: cambiarla afecta a todas las obras"
                    style={{ padding: '4px 6px', border: '1px solid #ddd',
                             borderRadius: 4, fontSize: 12, minWidth: 150 }}>
                    <option value="">— sin empresa —</option>
                    {catalogo.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <span style={{ color: p.empresa ? '#444' : '#bbb' }}>
                    {p.empresa || 'sin empresa'}
                  </span>
                )}
              </td>
              <td style={{ padding: '11px 12px' }}>
                {/* DERIVADA, y por eso no se edita aquí: se cambia en la tabla de
                    empresas de arriba, que es donde vive. */}
                <ChipFuncion funcion={p.funcion || funcionDe[p.company_id]} />
              </td>
              <td style={{ padding: '11px 12px', color: '#666' }}>
                {ETIQUETA_ROL[p.role] || p.role || '—'}
              </td>
              <td style={{ padding: '11px 12px' }}>
                {p.role === 'admin' ? (
                  // ENTITY ADMIN: administra la instancia entera, así que esta
                  // obra también. No hay nada que nombrar ni que retirar aquí,
                  // y fingir un interruptor que no hace nada sería peor.
                  <span title="Administra toda la entidad, no solo esta obra"
                        style={{ fontSize: 11.5, color: '#8b5cf6', fontWeight: 500 }}>
                    Administrador de la entidad
                  </span>
                ) : isAdmin ? (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7,
                                  cursor: guardando === 'admin:' + p.id ? 'wait' : 'pointer',
                                  fontSize: 12, color: '#555' }}>
                    <input type="checkbox"
                           checked={!!p.es_admin_de_obra}
                           disabled={guardando === 'admin:' + p.id}
                           onChange={ev => ponerAdminDeObra(p, ev.target.checked)} />
                    {p.es_admin_de_obra ? 'Sí' : 'No'}
                  </label>
                ) : (
                  <span style={{ color: p.es_admin_de_obra ? '#444' : '#bbb' }}>
                    {p.es_admin_de_obra ? 'Sí' : '—'}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {isAdmin && (
        <div style={{ fontSize: 11.5, color: '#999', marginTop: 14, maxWidth: 720 }}>
          La <b>empresa</b> es una propiedad de la persona: es la misma en todas
          las obras. La <b>función contractual</b> sí es de esta obra. Y ninguna
          de las dos concede permisos — eso es el perfil del sistema.
        </div>
      )}
    </div>
  );
}
