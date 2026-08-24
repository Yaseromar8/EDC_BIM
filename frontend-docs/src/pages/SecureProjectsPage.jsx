/**
 * SecureProjectsPage.jsx — Landing de proyectos con pestañas Admin
 * Refactorización Fase 3: Capa de Orquestación
 * Extraído de App.jsx líneas 106-552 (UsersTab + TagsTab + SecureProjectsPage)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { confirmAction } from '../utils/confirm';
import { API, formatDate, getInitials } from '../utils/helpers';
import FichaDePersona from '../components/FichaDePersona';
import PerfilesDeAcceso from '../components/PerfilesDeAcceso';

// ─── USERS TAB ───
function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [error, setError] = useState('');
  // Enlace de invitacion recien emitido. Sin el, la persona no puede reclamar
  // su cuenta: reclamarla ya no basta con conocer el correo.
  const [invitacion, setInvitacion] = useState(null);
  const [fichaDe, setFichaDe] = useState(null);   // P4: id de la persona abierta
  const [copiado, setCopiado] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API}/api/users`);
      if (res.ok) setUsers(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async () => {
    if (!email.trim()) return;
    setError('');
    try {
      const res = await apiFetch(`${API}/api/users`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), role })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // El enlace se arma con el origen de ESTA web (donde se registra la
        // persona), no con el del backend.
        setInvitacion({
          email: email.trim(),
          avisado: data.avisado === true,
          url: `${window.location.origin}/?invite=${encodeURIComponent(data.invite_token || '')}`
        });
        setCopiado(false);
        fetchUsers();
      } else {
        setError(data.error || 'Error al crear usuario');
      }
    } catch (e) { setError('Error de red'); }
  };

  const cerrarInvitacion = () => {
    setInvitacion(null);
    setShowCreate(false);
    setEmail(''); setRole('user');
  };

  const handleDelete = async (id) => {
    if (!await confirmAction({ title: 'Retirar acceso', message: 'La cuenta se desactiva y sus sesiones se cierran. El rastro de lo que hizo se conserva, y puedes reactivarla después.', confirmText: 'Retirar', danger: true })) return;
    await apiFetch(`${API}/api/users/${id}`, { method: 'DELETE' });
    fetchUsers();
  };

  // REVOCAR INVITACIÓN = DESACTIVAR. SIEMPRE (adenda 57 §5). La identidad se
  // conserva y la purga NUNCA se ofrece desde esta pantalla: queda como acto
  // humano explícito y separado (?purgar=1), fuera de la interfaz.
  const handleRevocar = async (id) => {
    if (!await confirmAction({ title: 'Revocar invitación', message: 'La cuenta pendiente se desactiva y su enlace deja de poder reclamarse. Podrás reinvitarla más adelante: un enlace nuevo, los anteriores quedan muertos.', confirmText: 'Revocar', danger: true })) return;
    await apiFetch(`${API}/api/users/${id}`, { method: 'DELETE' });
    fetchUsers();
  };

  // El enlace solo se muestra una vez al invitar. Si se perdió, se reemite:
  // Reinvitar = re-invitacion de la maquina de estados (doc 58): emite un
  // enlace de la GENERACION nueva -- los anteriores dejan de valer -- y si la
  // invitacion estaba revocada, la resucita en el mismo acto.
  const handleReinvitar = async (u) => {
    setError('');
    try {
      const res = await apiFetch(`${API}/api/users/${u.id}/reinvitar`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'No se pudo reemitir.'); return; }
      setShowCreate(true);
      setInvitacion({
        email: u.email,
        avisado: data.avisado === true,
        url: `${window.location.origin}/?invite=${encodeURIComponent(data.invite_token || '')}`,
      });
    } catch { setError('No se pudo reemitir.'); }
  };

  const handleReactivar = async (id) => {
    await apiFetch(`${API}/api/users/${id}/reactivar`, { method: 'POST' });
    fetchUsers();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <button className="btn btn-create" onClick={() => setShowCreate(true)}>+ Invitar usuario</button>
      </div>
      {loading ? <div className="loading"><div className="spinner" /><span>Cargando...</span></div> :
        <table className="data-table" style={{ background: '#fff', borderRadius: 6, overflow: 'hidden' }}>
          <thead style={{ display: 'table-header-group' }}>
            <tr>
              <th style={{ width: '20%' }}>Nombre</th>
              <th style={{ width: '30%' }}>Correo</th>
              <th style={{ width: '15%' }}>Empresa</th>
              <th style={{ width: '15%' }}>Cargo</th>
              <th style={{ width: '10%' }}>Rol</th>
              <th style={{ width: '10%' }}>Añadido</th>
              <th style={{ width: 80 }}>Acciones</th>
            </tr>
          </thead>
          <tbody style={{ display: 'table-row-group' }}>
            {users.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: 150 }}>
                  {/* P4: el nombre abre la ficha transversal (solo lectura). */}
                  <span onClick={() => setFichaDe(u.id)} title="Ver ficha de la persona"
                        style={{ cursor: 'pointer', color: 'var(--link)' }}>{u.name}</span>
                </td>
                <td style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: 200 }} title={u.email}>{u.email}</td>
                <td style={{ fontSize: 13, color: '#555', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: 100 }}>{u.company_name}</td>
                <td style={{ fontSize: 13, color: '#555', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: 100 }}>{u.job_title_name}</td>
                <td>
                  <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, background: u.role === 'admin' ? 'var(--bg-active)' : 'var(--bg-secondary)', color: u.role === 'admin' ? 'var(--accent)' : 'var(--text-secondary)' }}>
                    {u.role.toUpperCase()}
                  </span>
                  {/* El estado de la CUENTA, que la base siempre distinguió y la
                      pantalla no: sin esto, una invitación sin reclamar y un
                      acceso retirado parecían «un usuario más». */}
                  {u.activo === false && (
                    <span style={{ marginLeft: 6, padding: '2px 8px', borderRadius: 12, fontSize: 11, background: '#f3f4f6', color: '#6b7280' }}>DESACTIVADO</span>
                  )}
                  {u.activo !== false && u.pendiente && (
                    <span style={{ marginLeft: 6, padding: '2px 8px', borderRadius: 12, fontSize: 11, background: '#fff8e6', color: '#b45309' }}>PENDIENTE</span>
                  )}
                </td>
                <td>{formatDate(u.created_at)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {/* Protección por ROL, no por correo hardcodeado: cualquier admin
                      queda protegido (antes solo un email concreto, y si ese usuario
                      cambiaba de correo el sistema quedaba sin candado). */}
                  {/* Dos verbos, dos naturalezas (doc 58): REACTIVAR deshace la
                      suspensión de una CUENTA; una invitación revocada no se
                      "reactiva" — se REINVITA (enlace de generación nueva, y
                      la deja pendiente otra vez). El backend además lo exige:
                      reactivar responde 409 INVITACION_REVOCADA. */}
                  {u.role !== 'admin' && u.activo === false && !u.pendiente && (
                    <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 11 }} onClick={(e) => { e.stopPropagation(); handleReactivar(u.id); }} title="Devolver el acceso; el rastro se conservó">
                      Reactivar
                    </button>
                  )}
                  {u.role !== 'admin' && u.activo === false && u.pendiente && (
                    <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 11 }} onClick={(e) => { e.stopPropagation(); handleReinvitar(u); }} title="Emitir un enlace nuevo: la invitación vuelve a quedar pendiente">
                      Reinvitar
                    </button>
                  )}
                  {u.role !== 'admin' && u.activo !== false && u.pendiente && (
                    <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 11, marginRight: 6 }} onClick={(e) => { e.stopPropagation(); handleReinvitar(u); }} title="Emitir un enlace nuevo; los anteriores dejan de valer">
                      Reinvitar
                    </button>
                  )}
                  {u.role !== 'admin' && u.activo !== false && (
                    <button className="btn-icon" onClick={(e) => { e.stopPropagation(); u.pendiente ? handleRevocar(u.id) : handleDelete(u.id); }} title={u.pendiente ? 'Revocar invitación (la cuenta se desactiva)' : 'Retirar acceso'}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
      {fichaDe !== null && (
        <FichaDePersona userId={fichaDe} onClose={() => setFichaDe(null)} />
      )}

      {showCreate && invitacion && (
        <div className="modal-overlay" onClick={cerrarInvitacion}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>Invitación creada</h3>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 12, lineHeight: 1.4 }}>
              {invitacion.avisado
                ? <><b>El correo ya salió</b> hacia <b>{invitacion.email}</b>. Este es el mismo
                  enlace, por si prefieres hacérselo llegar también por otro medio. </>
                : <>Envíale este enlace a <b>{invitacion.email}</b> por WhatsApp o correo. </>}
              Es la prueba de que la invitación es tuya: sin él nadie puede reclamar esa
              cuenta, aunque conozca el correo. <b>Caduca en 14 días.</b>
            </p>
            {/* LO QUE REINVITAR LE HACE AL ENLACE ANTERIOR.
                Cada emisión incrementa la generación y mata la previa (doc 59):
                es la propiedad que hace que un enlace filtrado deje de servir.
                Pero si no se dice, quien vuelve a pulsar «Reinvitar» para
                recuperar el enlace acaba con uno muerto en el portapapeles --
                y cuantas más veces lo intenta, peor. Medido con el propietario
                el 23-ago-2026: tres pulsaciones seguidas, ninguna activación. */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start',
                          background: '#fff8e6', border: '1px solid #f0d9a0',
                          borderRadius: 5, padding: '9px 11px', marginBottom: 12,
                          fontSize: 12.5, color: '#7a5c14', lineHeight: 1.45 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                   style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span><b>Cópialo ahora.</b> Este enlace sustituye a cualquier otro que
                hubieras enviado antes: los anteriores dejan de funcionar. Si vuelves
                a pulsar «Reinvitar», <b>este</b> también dejará de servir.</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <input readOnly value={invitacion.url} onFocus={e => e.target.select()} style={{ flex: 1, fontSize: 12, fontFamily: 'monospace' }} />
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  try { await navigator.clipboard.writeText(invitacion.url); setCopiado(true); }
                  catch { setCopiado(false); }
                }}
              >{copiado ? '✓ Copiado' : 'Copiar'}</button>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={cerrarInvitacion}>Listo</button>
            </div>
          </div>
        </div>
      )}
      {showCreate && !invitacion && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>Invitar usuario</h3>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 12, lineHeight: 1.4 }}>
              Indica el correo y su nivel de acceso. La persona completará su nombre, empresa y cargo al crear su cuenta con ese mismo correo. Después asígnale proyectos desde <b>Accesos</b>.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#fff8e6', border: '1px solid #f0d9a0', borderRadius: 5, padding: '9px 11px', marginBottom: 12, fontSize: 12.5, color: '#7a5c14', lineHeight: 1.45 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              <span>Al invitar se intenta enviar el correo y además se genera el <b>enlace de invitación</b> copiable. Si el correo no está configurado o no llega, el enlace es el camino: hazlo llegar tú (WhatsApp, correo). Sin ese enlace la cuenta no se puede reclamar.</span>
            </div>
            {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="email" autoFocus placeholder="Correo electrónico del usuario" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()} />
              <select value={role} onChange={e => setRole(e.target.value)}>
                <option value="user">Usuario normal (Solo acceso a proyectos asignados)</option>
                <option value="admin">Administrador (Acceso total)</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreate}>Invitar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TAGS TAB ───
function ActividadTab() {
  const [eventos, setEventos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    setCargando(true);
    apiFetch(`${API}/api/auth/events?limite=200`)
      .then(r => (r.ok ? r.json() : { eventos: [] }))
      .then(d => setEventos(d.eventos || []))
      .catch(() => setEventos([]))
      .finally(() => setCargando(false));
  }, []);

  // Los eventos que cambian el estado de una obra se pintan distinto: son los
  // que hay que poder encontrar de un vistazo cuando algo no cuadra.
  const ESTADO = {
    obra_creada: ['#f0b429', 'Obra creada'],
    obra_archivada: ['#ff6b6b', 'Obra archivada'],
    obra_modificada: ['#f0b429', 'Obra modificada'],
    portafolio_creado: ['#f0b429', 'Portafolio creado'],
    obra_ingreso_por_codigo: ['#f0b429', 'Ingreso por código'],
    usuario_desactivado: ['#ff6b6b', 'Usuario desactivado'],
    usuario_borrado: ['#ff6b6b', 'Usuario borrado'],
    rol_cambiado: ['#ff6b6b', 'Rol cambiado'],
    login_fallido: ['#9aa5b1', 'Intento fallido'],
    login_desactivado: ['#ff6b6b', 'Entró cuenta desactivada'],
    login_ok: ['#4caf7d', 'Entró'],
  };

  const visibles = eventos.filter(e => {
    if (!filtro) return true;
    const q = filtro.toLowerCase();
    return [e.evento, e.email, e.ip, e.detalle].some(v => (v || '').toLowerCase().includes(q));
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <input
          placeholder="Filtrar por correo, IP, obra o tipo de evento…"
          value={filtro} onChange={e => setFiltro(e.target.value)}
          style={{ flex: 1, maxWidth: 420 }}
        />
        <span style={{ fontSize: 12, color: '#777' }}>{visibles.length} de {eventos.length}</span>
      </div>
      {cargando ? <div className="loading"><div className="spinner" /><span>Cargando…</span></div> : (
        <table className="data-table" style={{ background: '#fff', borderRadius: 6, overflow: 'hidden' }}>
          <thead style={{ display: 'table-header-group' }}>
            <tr>
              <th style={{ width: '17%' }}>Cuándo</th>
              <th style={{ width: '20%' }}>Qué pasó</th>
              <th style={{ width: '25%' }}>Quién</th>
              <th style={{ width: '13%' }}>Desde</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody style={{ display: 'table-row-group' }}>
            {visibles.map((e, i) => {
              const [color, etiqueta] = ESTADO[e.evento] || ['#9aa5b1', e.evento];
              return (
                <tr key={i}>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {e.fecha ? new Date(e.fecha).toLocaleString('es-PE') : '—'}
                  </td>
                  <td><span style={{ color, fontWeight: 600, fontSize: 12.5 }}>{etiqueta}</span></td>
                  <td style={{ fontSize: 12.5 }}>{e.email || (e.user_id ? `usuario ${e.user_id}` : '—')}</td>
                  <td style={{ fontSize: 12, fontFamily: 'monospace', color: '#666' }}>{e.ip || '—'}</td>
                  <td style={{ fontSize: 12, color: '#555' }}>{e.detalle || '—'}</td>
                </tr>
              );
            })}
            {!visibles.length && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#777', padding: 24 }}>
                Sin eventos registrados todavía.
              </td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TagsTab() {
  const [companies, setCompanies] = useState([]);
  const [jobTitles, setJobTitles] = useState([]);
  const [newCompany, setNewCompany] = useState('');
  const [newJobTitle, setNewJobTitle] = useState('');

  // La vista de ENTIDAD: cada empresa con su contexto (personas, obras y
  // función, reglas de permiso que la nombran). Sin esto la pestaña era una
  // lista de nombres — y borrar uno parecía inocuo cuando no lo era.
  const [resumen, setResumen] = useState({});
  const fetchResumen = async () => {
    try {
      const r = await apiFetch(`${API}/api/entidad/empresas`);
      if (!r.ok) return;
      const d = await r.json();
      const m = {};
      (d.empresas || []).forEach(e => { m[e.id] = e; });
      setResumen(m);
    } catch { /* el catálogo pelado sigue sirviendo */ }
  };

  const fetchTags = async () => {
    try {
      const rc = await apiFetch(`${API}/api/companies`);
      if (rc.ok) setCompanies(await rc.json());
      const rj = await apiFetch(`${API}/api/job_titles`);
      if (rj.ok) setJobTitles(await rj.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchTags(); fetchResumen(); }, []);

  const handleAddCompany = async () => {
    if (!newCompany.trim()) return;
    const r = await apiFetch(`${API}/api/companies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCompany }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(d.error || 'No se pudo crear.'); return; }
    setNewCompany(''); fetchTags(); fetchResumen();
  };
  const handleAddJobTitle = async () => {
    if (!newJobTitle.trim()) return;
    const r = await apiFetch(`${API}/api/job_titles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newJobTitle }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(d.error || 'No se pudo crear.'); return; }
    setNewJobTitle(''); fetchTags();
  };
  const handleDeleteComp = async (id) => {
    if (!await confirmAction({ title: 'Borrar empresa', message: 'Se eliminará esta empresa del catálogo.', confirmText: 'Borrar', danger: true })) return;
    // El servidor ahora se NIEGA si la empresa tiene gente, participaciones o
    // reglas de permiso (borrarla degradaría permisos en silencio). Esa
    // negativa se enseña tal cual: dice exactamente qué retirar primero.
    const r = await apiFetch(`${API}/api/companies/${id}`, { method: 'DELETE' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) toast.error(d.error || 'No se pudo borrar.');
    fetchTags(); fetchResumen();
  };
  const handleDeleteJob = async (id) => {
    if (!await confirmAction({ title: 'Borrar cargo', message: 'Se eliminará este cargo del catálogo.', confirmText: 'Borrar', danger: true })) return;
    const r = await apiFetch(`${API}/api/job_titles/${id}`, { method: 'DELETE' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) toast.error(d.error || 'No se pudo borrar.');
    fetchTags();
  };

  return (
    // maxWidth: sin tope, cada tarjeta ocupaba media pantalla en monitores anchos
    // (filas estiradas, había que alejar el zoom). wrap: en tablet se apilan.
    <>
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', maxWidth: 1040 }}>
      <div style={{ flex: '1 1 380px', minWidth: 300, background: '#fff', borderRadius: 6, padding: 18, border: '1px solid #ddd' }}>
        <h3 style={{ marginBottom: 14, fontSize: 15 }}>Empresas</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input className="adsk-input" placeholder="Nueva Empresa" value={newCompany} onChange={e => setNewCompany(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddCompany()} />
          <button className="btn btn-primary" onClick={handleAddCompany}>Añadir</button>
        </div>
        <table className="data-table"><tbody>{companies.map(c => (<tr key={c.id}><td>
          <div style={{ fontWeight: 500 }}>{c.name}</div>
          {/* El contexto que convierte la lista en un directorio de cuenta:
              sin él, borrar un nombre parece inocuo cuando puede dejar a
              media obra sin su función contractual. */}
          {resumen[c.id] && (
            <div style={{ fontSize: 11.5, color: '#8a939e', marginTop: 2 }}>
              {resumen[c.id].personas} persona{resumen[c.id].personas !== 1 ? 's' : ''}
              {resumen[c.id].obras.length > 0 && (
                <> · {resumen[c.id].obras.map(o => `${o.obra} (${o.funcion})`).join(' · ')}</>
              )}
              {resumen[c.id].reglas_de_permiso > 0 && (
                <> · {resumen[c.id].reglas_de_permiso} regla{resumen[c.id].reglas_de_permiso !== 1 ? 's' : ''} de permiso</>
              )}
            </div>
          )}
        </td><td style={{ width: 50 }}><button className="btn-icon" title={resumen[c.id] && (resumen[c.id].personas || resumen[c.id].obras.length || resumen[c.id].reglas_de_permiso) ? 'En uso: retira antes sus referencias' : 'Borrar empresa'} onClick={() => handleDeleteComp(c.id)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></button></td></tr>))}</tbody></table>
      </div>
      <div style={{ flex: '1 1 380px', minWidth: 300, background: '#fff', borderRadius: 6, padding: 18, border: '1px solid #ddd' }}>
        <h3 style={{ marginBottom: 14, fontSize: 15 }}>Cargos</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input className="adsk-input" placeholder="Nuevo Cargo" value={newJobTitle} onChange={e => setNewJobTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddJobTitle()} />
          <button className="btn btn-primary" onClick={handleAddJobTitle}>Añadir</button>
        </div>
        <table className="data-table"><tbody>{jobTitles.map(j => (<tr key={j.id}><td>{j.name}</td><td style={{ width: 50 }}><button className="btn-icon" title="Borrar cargo" onClick={() => handleDeleteJob(j.id)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></button></td></tr>))}</tbody></table>
      </div>
    </div>
    {/* CAPA 13 · el catálogo de perfiles es de la ENTIDAD, y vive junto al
        resto del catálogo de entidad. Aplicarlos es un acto de OBRA y está
        en Participantes: son dos cosas distintas, con dueños distintos. */}
    <div style={{ maxWidth: 1040, marginTop: 24 }}>
      <PerfilesDeAcceso />
    </div>
    </>
  );
}

// ─── SECURE PROJECTS PAGE ───
export default function SecureProjectsPage({ user, onSelectProject, onLogout, onBackToHub }) {
  const [activeTab, setActiveTab] = useState('projects');
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [hubs, setHubs] = useState([]);
  const [selectedHub, setSelectedHub] = useState('');
  const [newName, setNewName] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [showAccess, setShowAccess] = useState(null);
  const [projectUsers, setProjectUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  
  // Join Project state
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  
  const isAdmin = user.role === 'admin';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // `/api/portal/hubs`, no `/api/hubs`: ese camino esta declarado dos
      // veces en el producto (municipalidades aqui, cuentas de Autodesk en el
      // visor) y con DEPLOY_PROFILE=completo ganaba la de APS -- el
      // desplegable de «Crear proyecto» salia vacio. Ver routes/projects.py.
      const hRes = await apiFetch(`${API}/api/portal/hubs`);
      if (hRes.ok) { const hData = await hRes.json(); setHubs(hData.hubs || []); }
      const res = await apiFetch(`${API}/api/projects?user_id=${user.id}&role=${user.role}`);
      if (res.ok) { const data = await res.json(); setProjects(Array.isArray(data) ? data : (data.projects || [])); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const targetHub = selectedHub || (hubs[0]?.id) || 'b.mdc_default_legacy';
    try {
      await apiFetch(`${API}/api/hubs/${targetHub}/projects`, {
        method: 'POST', body: JSON.stringify({ name: newName.trim(), number: newNumber, location: newLocation, account: user.email })
      });
      setShowCreate(false); setNewName(''); setNewNumber(''); setNewLocation(''); setSelectedHub(''); fetchData();
    } catch (e) { console.error(e); }
  };

  const openAccess = async (proj, e) => {
    e.stopPropagation();
    try {
      const r1 = await apiFetch(`${API}/api/users`); if (r1.ok) setAllUsers(await r1.json());
      const r2 = await apiFetch(`${API}/api/projects/${proj.id}/users`); if (r2.ok) setProjectUsers(await r2.json());
      setShowAccess(proj);
    } catch (e) { console.error(e); }
  };

  const saveAccess = async () => {
    if (!showAccess) return;
    try { await apiFetch(`${API}/api/projects/${showAccess.id}/users`, { method: 'POST', body: JSON.stringify({ user_ids: projectUsers }) }); setShowAccess(null); } catch (e) { console.error(e); }
  };

  const handleJoinProject = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true); setJoinError('');
    try {
      const res = await apiFetch(`${API}/api/projects/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, invite_code: joinCode.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setJoinCode('');
        fetchData(); // reload projects
      } else {
        setJoinError(data.error || 'Código inválido');
      }
    } catch (err) {
      setJoinError('Error de red al unirse');
    } finally {
      setJoining(false);
    }
  };

  const filtered = projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.number || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="header-left">
          {/* El logo regresa al Hub (única puerta entre productos — sin puentes
              directos al visor desde dentro de Docs). */}
          <span
            className="header-logo"
            onClick={onBackToHub}
            title="Volver al inicio (elegir producto)"
            style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: onBackToHub ? 'pointer' : 'default' }}
          >
            {/* Cabecera oscura (Ink) ⇒ versión blanca del logo oficial,
                como manda el manual. «Docs» es el producto, no la marca. */}
            <img src="/brand/ALEPHIA_Logo_Horizontal_White.svg" alt="ALEPHIA" style={{ height: 28, width: 'auto', display: 'block' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.72)', letterSpacing: '0.4px', paddingLeft: 10, borderLeft: '1px solid rgba(255,255,255,0.25)' }}>Docs</span>
          </span>
        </div>
        <div className="header-right">
          <div className="header-user" onClick={onLogout} title="Cerrar sesión">
            <span style={{ fontSize: 13, marginRight: 8, opacity: 0.8 }}>{user.name.split(' ')[0]}</span>
            <div className="header-avatar">{getInitials(user.name)}</div>
          </div>
        </div>
      </header>
      <div style={{ flex: 1, overflow: 'auto', padding: '32px 48px', background: '#fafafa' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, color: '#1e1e1e' }}>Le damos la bienvenida, {user.name.split(' ')[0]}</h1>
        <p style={{ color: '#999', marginBottom: 24, fontSize: 13 }}>¿Qué desea hacer hoy?</p>
        <div className="tabs">
          <span className={`tab ${activeTab === 'projects' ? 'active' : ''}`} onClick={() => setActiveTab('projects')}>Proyectos</span>
          {isAdmin && <span className={`tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>Usuarios</span>}
          {isAdmin && <span className={`tab ${activeTab === 'tags' ? 'active' : ''}`} onClick={() => setActiveTab('tags')}>Empresas y cargos</span>}
          {isAdmin && <span className={`tab ${activeTab === 'actividad' ? 'active' : ''}`} onClick={() => setActiveTab('actividad')}>Actividad</span>}
        </div>
        {activeTab === 'projects' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12 }}>
              {isAdmin && (<button className="btn btn-create" onClick={() => setShowCreate(true)}>+ Crear proyecto</button>)}
              <div style={{ flex: 1 }} />
              <input type="text" placeholder="Buscar proyectos..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 280, padding: '7px 12px', background: '#fff', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, outline: 'none' }} />
            </div>
            {loading ? <div className="loading"><div className="spinner" /><span>Cargando proyectos...</span></div> :
              filtered.length === 0 ? (
                isAdmin ? (
                  <div className="empty-state"><span className="empty-icon">🏗️</span><p>No hay proyectos. Haz clic en "+ Crear proyecto".</p></div>
                ) : (
                  <div style={{ maxWidth: 400, margin: '40px auto', background: '#fff', padding: 32, borderRadius: 8, border: '1px solid #e0e0e0', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                    <div style={{ fontSize: 40, marginBottom: 16 }}>🤝</div>
                    <h3 style={{ marginBottom: 8, fontSize: 18 }}>Únete a tu primer proyecto</h3>
                    <p style={{ color: '#777', fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>Ingresa el código de invitación de 6 caracteres proporcionado por el administrador para acceder.</p>
                    
                    <form onSubmit={handleJoinProject} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <input 
                        className="adsk-input"
                        placeholder="Ej. X9K2MA" 
                        value={joinCode} 
                        onChange={e => setJoinCode(e.target.value.toUpperCase())}
                        maxLength={6}
                        style={{ textAlign: 'center', letterSpacing: 2, fontSize: 16, textTransform: 'uppercase' }}
                      />
                      {joinError && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{joinError}</div>}
                      <button type="submit" className="btn btn-primary" disabled={joining} style={{ width: '100%', justifyContent: 'center' }}>
                        {joining ? 'Verificando...' : 'Unirme al Proyecto'}
                      </button>
                    </form>
                  </div>
                )
              ) : (
                <table className="data-table" style={{ background: '#fff', borderRadius: 6, overflow: 'hidden' }}>
                  <thead><tr><th style={{ width: 140 }}>Municipalidad</th><th>Nombre</th><th style={{ width: 100 }}>Número</th><th style={{ width: 140 }}>Acceso por defecto</th><th style={{ width: 150 }}>Cuenta</th>{isAdmin && <th style={{ width: 100 }}>Cód. Acceso</th>}<th style={{ width: 120 }}>Creado el</th>{isAdmin && <th style={{ width: 120 }}>Gestión</th>}</tr></thead>
                  <tbody>
                    {filtered.map(p => (
                      <tr key={p.id} onClick={() => onSelectProject(p)}>
                        <td style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{p.hub_name || 'Gral'}</td>
                        <td><div className="project-name-main">{p.name}</div>{p.location && <div className="project-name-sub">{p.location}</div>}</td>
                        <td>{p.number || '—'}</td>
                        <td><span className="access-badge access-badge-docs">📁 Docs</span></td>
                        <td style={{ fontSize: 12 }}>{p.account}</td>
                        {isAdmin && (
                          <td style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 'bold' }}>
                            {p.invite_code || '---'}
                          </td>
                        )}
                        <td style={{ fontSize: 12 }}>{formatDate(p.created_at)}</td>
                        {isAdmin && (<td><button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }} title="Elegir qué usuarios acceden a este proyecto" onClick={(e) => openAccess(p, e)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg>Accesos</button></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </>
        ) : activeTab === 'users' ? (<UsersTab />) : activeTab === 'actividad' ? (<ActividadTab />) : (<TagsTab />)}
      </div>

      {/* CREATE PROJECT MODAL */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>Crear Proyecto</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <select value={selectedHub} onChange={e => setSelectedHub(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}>
                <option value="">Seleccionar Municipalidad (Hub) *</option>
                {hubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
              <input autoFocus placeholder="Nombre del proyecto *" value={newName} onChange={e => setNewName(e.target.value)} />
              <input placeholder="Número (ej. 001)" value={newNumber} onChange={e => setNewNumber(e.target.value)} />
              <input placeholder="Ubicación (ej. Talara, Piura)" value={newLocation} onKeyDown={e => e.key === 'Enter' && handleCreate()} onChange={e => setNewLocation(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancelar</button>
              <button className="btn btn-create" onClick={handleCreate}>Crear</button>
            </div>
          </div>
        </div>
      )}

      {/* ACCESS MODAL */}
      {showAccess && (
        <div className="modal-overlay" onClick={() => setShowAccess(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>Accesos a {showAccess.name}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Selecciona qué usuarios tienen acceso a ver este proyecto.</p>
            <div style={{ border: '1px solid var(--border)', borderRadius: 4, maxHeight: 300, overflowY: 'auto' }}>
              {allUsers.filter(u => u.role !== 'admin').map(u => (
                <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}>
                  <input type="checkbox" checked={projectUsers.includes(u.id)} onChange={(e) => { if (e.target.checked) setProjectUsers([...projectUsers, u.id]); else setProjectUsers(projectUsers.filter(id => id !== u.id)); }} />
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{u.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{u.email}</span>
                  </div>
                </label>
              ))}
              {allUsers.filter(u => u.role !== 'admin').length === 0 && (<div style={{ padding: 16, fontSize: 13, color: '#999', textAlign: 'center' }}>No hay usuarios normales creados.</div>)}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowAccess(null)}>Cerrar</button>
              <button className="btn btn-primary" onClick={saveAccess}>Guardar Accesos</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
