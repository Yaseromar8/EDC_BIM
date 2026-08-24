// FolderPermissionsPanel — quién alcanza esta carpeta, y por qué.
//
// LO QUE ESTA PANTALLA TIENE QUE HACER ENTENDIBLE
// El motor resuelve con CLOSEST-WINS: la carpeta MÁS CERCANA con una regla
// decide, y las de arriba dejan de contar. Dentro de una misma carpeta manda
// la regla más específica: PERSONA > EMPRESA > FUNCIÓN CONTRACTUAL. Y
// «Restringido» (none) es una denegación explícita, no la ausencia de regla.
//
// Con eso, la lista de reglas de una carpeta YA NO CONTESTA «¿puede Ana
// entrar aquí?»: la regla que decide puede estar tres carpetas más arriba y
// llegarle por su empresa. Por eso esta pantalla tiene dos mitades —
//
//   REGLAS DE ESTA CARPETA   lo que se concede aquí, a los tres sujetos
//   PERMISO EFECTIVO         lo que una persona concreta acaba teniendo,
//                            con la carpeta ganadora y el sujeto ganador
//
// La segunda la responde el MOTOR, en la misma pasada con la que decidiría de
// verdad. No hay una segunda lógica que explique lo que otra decide.
import toast from 'react-hot-toast';
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { confirmAction } from '../utils/confirm';
import AddPermissionModal, { ACCPillBars } from './AddPermissionModal';
import '../index.css';

// Iconos de LÍNEA (sin emojis): mismo lenguaje visual que el resto de la app.
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...stroke} style={{ color: 'var(--accent)', flexShrink: 0 }}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);
const UserIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} style={{ flexShrink: 0 }}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const CompanyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} style={{ flexShrink: 0 }}>
    <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4" />
  </svg>
);
const FunctionIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} style={{ flexShrink: 0 }}>
    <path d="M20 7h-9M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" />
  </svg>
);
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...stroke}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
);
const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...stroke}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
);

const ICONO_SUJETO = {
  USER: <UserIcon />, COMPANY: <CompanyIcon />, CONTRACTUAL_FUNCTION: <FunctionIcon />,
};

// El color NO es decorativo: distingue las tres clases de sujeto de un vistazo,
// que es lo que permite ver «aquí manda una regla de empresa» sin leer.
const TONO_SUJETO = {
  USER: { fondo: '#eef3f8', borde: '#cfe0ee', texto: '#153754' },
  COMPANY: { fondo: '#f1f5f9', borde: '#dbe3ea', texto: '#334155' },
  CONTRACTUAL_FUNCTION: { fondo: '#fffbeb', borde: '#fde68a', texto: '#92400e' },
};

function ChipSujeto({ tipo, children }) {
  const t = TONO_SUJETO[tipo] || TONO_SUJETO.USER;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px',
      borderRadius: 11, fontSize: 11, fontWeight: 600,
      background: t.fondo, border: `1px solid ${t.borde}`, color: t.texto,
    }}>
      {ICONO_SUJETO[tipo]}{children}
    </span>
  );
}

// ── La regla del modelo, en dos frases y un diagrama ────────────────────────
// Se explica DONDE se administra, no en un manual aparte. Un administrador que
// no entiende por qué gana una regla acaba concediendo de más «por si acaso».
function ComoSeResuelve() {
  const [abierto, setAbierto] = useState(false);
  return (
    <div style={{ margin: '0 0 12px', fontSize: 12 }}>
      <button onClick={() => setAbierto(v => !v)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                       color: 'var(--accent)', fontSize: 12 }}>
        {abierto ? '− ' : '+ '}Cómo se resuelve un permiso
      </button>
      {abierto && (
        <div style={{ marginTop: 8, padding: '10px 12px', background: '#f8fafc',
                      border: '1px solid #e2e8f0', borderRadius: 6, lineHeight: 1.6,
                      color: '#475569' }}>
          <div style={{ marginBottom: 8 }}>
            <b>1 · Gana la carpeta más cercana.</b> Se busca una regla en esta carpeta;
            si no hay, se sube a la de arriba, y así hasta la raíz. La primera que
            aparece decide — <b>las de más arriba ya no cuentan</b>. Por eso una
            carpeta puede conceder <i>menos</i> que su padre: así se reserva.
          </div>
          <div style={{ marginBottom: 8 }}>
            <b>2 · Dentro de esa carpeta, gana la más específica:</b>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '7px 0 0',
                          flexWrap: 'wrap' }}>
              <ChipSujeto tipo="USER">Persona</ChipSujeto>
              <span style={{ color: '#94a3b8' }}>&gt;</span>
              <ChipSujeto tipo="COMPANY">Empresa</ChipSujeto>
              <span style={{ color: '#94a3b8' }}>&gt;</span>
              <ChipSujeto tipo="CONTRACTUAL_FUNCTION">Función</ChipSujeto>
            </div>
          </div>
          <div>
            <b>3 · «Restringido» es una denegación</b>, no la ausencia de una regla:
            deniega aquí aunque tenga acceso concedido más arriba.
          </div>
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #e2e8f0',
                        color: '#64748b' }}>
            El orden se aplica <b>dentro</b> de la carpeta ganadora: una regla de
            persona lejana <b>no</b> desplaza a una de función cercana. Primero
            decide la distancia; después, la especificidad.
          </div>
        </div>
      )}
    </div>
  );
}

// ── El inspector: qué tiene una persona, y por qué ──────────────────────────
function PermisoEfectivo({ folder, modelUrn, apiBaseUrl }) {
  const [personas, setPersonas] = useState([]);
  const [quien, setQuien] = useState('');
  const [res, setRes] = useState(null);
  const [cargando, setCargando] = useState(false);
  // VACIO Y ROTO NO SON LO MISMO. Si la carga falla y se deja la lista vacia,
  // el administrador lee «no hay nadie» -- y en una pantalla de permisos esa
  // lectura equivocada empuja a conceder de mas.
  const [falloLista, setFalloLista] = useState('');

  useEffect(() => {
    setFalloLista('');
    apiFetch(`${apiBaseUrl}/api/docs/sujetos-concedibles?folder_id=${folder.id}&model_urn=${encodeURIComponent(modelUrn)}`)
      .then(r => r.json().then(d => (r.ok && d.success !== false)
        ? d
        : Promise.reject(new Error(d.error || 'No se pudo cargar la lista de personas.'))))
      .then(d => setPersonas(d.personas || []))
      .catch(e => { setPersonas([]); setFalloLista(e.message || 'No se pudo cargar la lista de personas.'); });
  }, [folder?.id, modelUrn, apiBaseUrl]);

  useEffect(() => {
    if (!quien) { setRes(null); return; }
    setCargando(true);
    apiFetch(`${apiBaseUrl}/api/docs/permiso-efectivo?node_id=${folder.id}&user_id=${quien}&model_urn=${encodeURIComponent(modelUrn)}`)
      .then(r => r.json())
      .then(d => setRes(d))
      .catch(() => setRes({ success: false, error: 'No se pudo consultar.' }))
      .finally(() => setCargando(false));
  }, [quien, folder?.id, modelUrn, apiBaseUrl]);

  const m = res && res.motivo;
  return (
    <div style={{ borderTop: '1px solid #e5e7eb', padding: '14px 16px', background: '#fcfcfd' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#5f6368', letterSpacing: '.4px',
                    textTransform: 'uppercase', marginBottom: 8 }}>
        Comprobar el permiso de una persona
      </div>
      {falloLista && (
        <div role="alert" style={{ marginBottom: 8, padding: '8px 10px', borderRadius: 5,
                                   background: '#fef2f2', border: '1px solid #fecaca',
                                   color: '#991b1b', fontSize: 12.3 }}>
          {falloLista} <b>La lista está incompleta</b>, no vacía.
        </div>
      )}
      <select value={quien} onChange={e => setQuien(e.target.value)}
              disabled={Boolean(falloLista)}
              style={{ width: '100%', padding: '7px 8px', border: '1px solid #ddd',
                       borderRadius: 5, fontSize: 13 }}>
        <option value="">
          {falloLista ? 'No se pudo cargar' : 'Elegir persona de la obra…'}
        </option>
        {personas.map(p => (
          <option key={p.sujeto_id} value={p.sujeto_id}>
            {p.nombre}{p.empresa ? ` — ${p.empresa}` : ''}
          </option>
        ))}
      </select>

      {cargando && <div style={{ marginTop: 10, fontSize: 12.5, color: '#888' }}>Consultando…</div>}

      {res && res.success === false && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--danger, #b91c1c)' }}>{res.error}</div>
      )}

      {res && res.success && (
        <div style={{ marginTop: 10, padding: '11px 13px', borderRadius: 6,
                      border: `1px solid ${res.denegado ? '#fecaca' : '#d1fae5'}`,
                      background: res.denegado ? '#fef2f2' : '#f0fdf4' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <ACCPillBars level={res.nivel} />
            <b style={{ fontSize: 13, color: res.denegado ? '#991b1b' : '#166534' }}>
              {res.nivel_label}
            </b>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              sobre <b>{folder?.name}</b>
            </span>
          </div>

          {/* EL POR QUÉ, con los tres datos: carpeta ganadora, sujeto ganador
              y nivel. Sin esto, «Restringido» es un misterio que se resuelve
              concediendo de más. */}
          <div style={{ marginTop: 9, fontSize: 12.3, color: '#475569', lineHeight: 1.6 }}>
            {m && m.regla === 'sujeto' && (
              <>
                Gana la regla de <ChipSujeto tipo={m.sujeto_tipo}>{res.sujeto_ganador_label}</ChipSujeto>
                {' '}en la carpeta{' '}
                <b>{res.carpeta_ganadora?.nombre || '—'}</b>
                {m.saltos === 0
                  ? ' (esta misma carpeta).'
                  : ` (${m.saltos} nivel${m.saltos === 1 ? '' : 'es'} por encima).`}
                {/* DESPLAZÓ (misma carpeta): perdieron por ESPECIFICIDAD. */}
                {m.desplazados && m.desplazados.length > 0 && (
                  <div style={{ marginTop: 6, paddingLeft: 10, borderLeft: '2px solid #e2e8f0', color: '#64748b' }}>
                    <b style={{ color: '#475569' }}>Desplazó, en esa misma carpeta:</b>
                    {m.desplazados.map((d, i) => (
                      <div key={i}>
                        {d.sujeto_label || d.sujeto_tipo} = {d.nivel_label || d.nivel}
                      </div>
                    ))}
                    <div style={{ fontSize: 11.5, marginTop: 2 }}>
                      Motivo: al mismo nivel, la regla más específica manda —
                      Persona &gt; Empresa &gt; Función contractual.
                    </div>
                  </div>
                )}
                {/* DESPLAZÓ (carpetas de arriba): perdieron por DISTANCIA.
                    Es la mitad que hace visible closest-wins: sin esto, el
                    «Editar» de la carpeta padre parece mandar, y no manda. */}
                {m.desplazados_lejanos && m.desplazados_lejanos.length > 0 && (
                  <div style={{ marginTop: 6, paddingLeft: 10, borderLeft: '2px solid #e2e8f0', color: '#64748b' }}>
                    <b style={{ color: '#475569' }}>Desplazó, en carpetas superiores:</b>
                    {m.desplazados_lejanos.map((d, i) => (
                      <div key={i}>
                        {d.sujeto_label || d.sujeto_tipo} = {d.nivel_label || d.nivel} en{' '}
                        <b>{d.carpeta_nombre || '—'}</b>
                      </div>
                    ))}
                    <div style={{ fontSize: 11.5, marginTop: 2 }}>
                      Motivo: la regla de la carpeta más cercana tiene precedencia;
                      las de arriba no se aplican, aunque concedan más.
                    </div>
                  </div>
                )}
              </>
            )}
            {m && m.regla === 'defecto' && (
              <>Ninguna regla le alcanza en toda la cadena de carpetas: manda su{' '}
                <b>perfil del sistema</b> ({res.persona?.perfil}).</>
            )}
            {m && m.regla === 'admin_de_obra' && (
              <><b>Administra esta obra</b>: atraviesa los permisos de carpeta, y solo
                los de esta obra.</>
            )}
            {m && !['sujeto', 'defecto', 'admin_de_obra'].includes(m.regla) && <>{m.texto}</>}
          </div>

          {/* Con qué identidades le alcanza una regla AQUÍ: es lo que hace
              comprensible que gane su empresa y no ella. */}
          <div style={{ marginTop: 9, paddingTop: 8, borderTop: '1px dashed #e2e8f0',
                        fontSize: 11.5, color: '#64748b' }}>
            Le alcanzan reglas dirigidas a: <b>ella misma</b>
            {res.alcanzable_por?.COMPANY && <>, su empresa <b>{res.alcanzable_por.COMPANY}</b></>}
            {res.alcanzable_por?.CONTRACTUAL_FUNCTION && <>, y la función <b>{res.alcanzable_por.CONTRACTUAL_FUNCTION}</b></>}
            {!res.alcanzable_por?.COMPANY && ' (no tiene empresa, así que ninguna regla de empresa o función la alcanza)'}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FolderPermissionsPanel({ folder, modelUrn, apiBaseUrl, onClose }) {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchPermissions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/docs/folder-permissions?folder_id=${folder.id}&model_urn=${modelUrn}`);
      const data = await res.json();
      if (data.success) {
        setPermissions(data.permissions || []);
      } else {
        setError(data.error || 'Error al cargar permisos.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (folder?.id) {
      fetchPermissions();
    }
  }, [folder]);

  const removePermission = async (perm) => {
    const esFuncion = perm.sujeto_tipo === 'CONTRACTUAL_FUNCTION';
    const ok = await confirmAction({
      title: 'Retirar esta regla',
      message: esFuncion
        ? `Dejará de aplicarse a las empresas que participan con la función ${perm.sujeto_nombre}. `
          + 'Quien tenga acceso por otra regla lo conserva.'
        : `${perm.sujeto_nombre} dejará de tener este permiso aquí. Si tiene acceso concedido `
          + 'en una carpeta superior, volverá a aplicarse ese.',
      confirmText: 'Retirar regla',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/docs/folder-permissions`, {
        method: 'DELETE',
        body: JSON.stringify({ permission_id: perm.id, folder_id: folder.id, model_urn: modelUrn })
      });
      const data = await res.json();
      if (data.success) {
        setPermissions(permissions.filter(p => p.id !== perm.id));
      } else {
        toast.error(data.error || "Error al eliminar");
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const q = searchTerm.toLowerCase();
  const filteredPermissions = permissions.filter(p =>
    !q
    || p.sujeto_nombre?.toLowerCase().includes(q)
    || p.user_email?.toLowerCase().includes(q)
    || p.sujeto_etiqueta?.toLowerCase().includes(q)
  );

  const cuantas = permissions.length;

  return (
    <div className="permissions-panel open">
      <div className="permissions-panel-header">
        <div className="permissions-title">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <FolderIcon />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={folder?.name}>
              {folder?.name}
            </span>
          </h3>
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280', fontSize: 12, margin: '4px 0 0' }}>
            {/* Se cuentan REGLAS, no usuarios: una sola regla de función puede
                alcanzar a media obra, y decir «1 usuario» sería mentir. */}
            <span>{cuantas} {cuantas === 1 ? 'regla en esta carpeta' : 'reglas en esta carpeta'}</span>
          </p>
        </div>
        <button className="close-btn" onClick={onClose} title="Cerrar panel">×</button>
      </div>

      <div className="permissions-toolbar">
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" onClick={() => setShowAddModal(true)}>
            <PlusIcon /> Conceder
          </button>
          <button className="btn-secondary" title="Exportación a Excel: próximamente" disabled>Exportar</button>
        </div>
        <div className="search-box">
          <span className="search-icon" style={{ display: 'inline-flex' }}><SearchIcon /></span>
          <input
            type="text"
            placeholder="Buscar persona, empresa o función"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="permissions-content">
        {error && <div className="error-alert">{error}</div>}
        <ComoSeResuelve />
        {loading ? (
          <div className="loading-spinner">Cargando permisos...</div>
        ) : (
          <table className="permissions-table">
            <thead>
              <tr>
                <th>Sujeto</th>
                <th>Permisos</th>
                <th>Clase</th>
                <th style={{width: '40px'}}></th>
              </tr>
            </thead>
            <tbody>
              {filteredPermissions.length === 0 ? (
                <tr>
                  <td colSpan="4" className="empty-state">
                    {searchTerm
                      ? "No se encontraron coincidencias."
                      : "Ninguna regla en esta carpeta. Se aplica la de la carpeta superior más cercana; si no hay ninguna en toda la cadena, el perfil del sistema de cada persona."}
                  </td>
                </tr>
              ) : (
                filteredPermissions.map(perm => (
                  <tr key={perm.id}>
                    <td>
                      <div className="user-info">
                        <div style={{color: '#8b93a0', display: 'flex'}}>
                          {ICONO_SUJETO[perm.sujeto_tipo] || <UserIcon />}
                        </div>
                        <div className="user-details" style={{ minWidth: 0 }}>
                          <span className="user-name">{perm.sujeto_nombre}</span>
                          {/* El detalle identifica sin ambigüedad: el correo de
                              la persona, o a quién alcanza la regla. */}
                          <span className="user-email" style={{ fontSize: 11, color: '#8b93a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {perm.sujeto_detalle}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="perm-badge">
                        <ACCPillBars level={perm.permission_level} />
                        <span className="lvl-text" style={{fontSize: '11px', color: '#666', marginTop: '2px'}}>{perm.permission_label}</span>
                      </div>
                    </td>
                    <td>
                      <ChipSujeto tipo={perm.sujeto_tipo}>{perm.sujeto_etiqueta}</ChipSujeto>
                    </td>
                    <td>
                      <button className="icon-btn action-delete" onClick={() => removePermission(perm)} title="Retirar esta regla">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {folder?.id && <PermisoEfectivo folder={folder} modelUrn={modelUrn} apiBaseUrl={apiBaseUrl} />}

      {showAddModal && (
        <AddPermissionModal
          folder={folder}
          modelUrn={modelUrn}
          apiBaseUrl={apiBaseUrl}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchPermissions();
          }}
        />
      )}
    </div>
  );
}
