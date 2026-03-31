/**
 * SecureProjectsPage.jsx — Landing de proyectos con pestañas Admin
 * Refactorización Fase 3: Capa de Orquestación
 * Extraído de App.jsx líneas 106-552 (UsersTab + TagsTab + SecureProjectsPage)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { API, VISOR_URL, formatDate, getInitials } from '../utils/helpers';

// ─── USERS TAB ───
function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [error, setError] = useState('');

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
      if (res.ok) {
        setShowCreate(false);
        setEmail(''); setRole('user');
        fetchUsers();
      } else {
        const data = await res.json();
        setError(data.error || 'Error al crear usuario');
      }
    } catch (e) { setError('Error de red'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Seguro que deseas eliminar este usuario?')) return;
    await apiFetch(`${API}/api/users/${id}`, { method: 'DELETE' });
    fetchUsers();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <button className="btn btn-create" onClick={() => setShowCreate(true)}>+ Añadir usuario</button>
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
                <td style={{ fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: 150 }}>{u.name}</td>
                <td style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: 200 }} title={u.email}>{u.email}</td>
                <td style={{ fontSize: 13, color: '#555', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: 100 }}>{u.company_name}</td>
                <td style={{ fontSize: 13, color: '#555', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: 100 }}>{u.job_title_name}</td>
                <td>
                  <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, background: u.role === 'admin' ? 'var(--bg-active)' : 'var(--bg-secondary)', color: u.role === 'admin' ? 'var(--accent)' : 'var(--text-secondary)' }}>
                    {u.role.toUpperCase()}
                  </span>
                </td>
                <td>{formatDate(u.created_at)}</td>
                <td>
                  {u.email !== 'omarsanchezh8@gmail.com' && (
                    <button className="btn-icon" onClick={(e) => { e.stopPropagation(); handleDelete(u.id); }} title="Eliminar">🗑️</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>Adicionar Usuario (Invitación)</h3>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 12, lineHeight: 1.4 }}>
              Introduce el correo del usuario y su nivel de acceso. Los datos como Nombre, Empresa o Cargo los completará él mismo la primera vez que ingrese o al "Crear una cuenta" usando este correo.
            </p>
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
              <button className="btn btn-primary" onClick={handleCreate}>Añadir Correo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TAGS TAB ───
function TagsTab() {
  const [companies, setCompanies] = useState([]);
  const [jobTitles, setJobTitles] = useState([]);
  const [newCompany, setNewCompany] = useState('');
  const [newJobTitle, setNewJobTitle] = useState('');

  const fetchTags = async () => {
    try {
      const rc = await apiFetch(`${API}/api/companies`);
      if (rc.ok) setCompanies(await rc.json());
      const rj = await apiFetch(`${API}/api/job_titles`);
      if (rj.ok) setJobTitles(await rj.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchTags(); }, []);

  const handleAddCompany = async () => {
    if (!newCompany.trim()) return;
    await apiFetch(`${API}/api/companies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCompany }) });
    setNewCompany(''); fetchTags();
  };
  const handleAddJobTitle = async () => {
    if (!newJobTitle.trim()) return;
    await apiFetch(`${API}/api/job_titles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newJobTitle }) });
    setNewJobTitle(''); fetchTags();
  };
  const handleDeleteComp = async (id) => { if (!window.confirm('¿Borrar empresa?')) return; await apiFetch(`${API}/api/companies/${id}`, { method: 'DELETE' }); fetchTags(); };
  const handleDeleteJob = async (id) => { if (!window.confirm('¿Borrar cargo?')) return; await apiFetch(`${API}/api/job_titles/${id}`, { method: 'DELETE' }); fetchTags(); };

  return (
    <div style={{ display: 'flex', gap: 32 }}>
      <div style={{ flex: 1, background: '#fff', borderRadius: 6, padding: 24, border: '1px solid #ddd' }}>
        <h3 style={{ marginBottom: 16 }}>Empresas</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input className="adsk-input" placeholder="Nueva Empresa" value={newCompany} onChange={e => setNewCompany(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddCompany()} />
          <button className="btn btn-primary" onClick={handleAddCompany}>Añadir</button>
        </div>
        <table className="data-table"><tbody>{companies.map(c => (<tr key={c.id}><td>{c.name}</td><td style={{ width: 50 }}><button className="btn-icon" onClick={() => handleDeleteComp(c.id)}>🗑️</button></td></tr>))}</tbody></table>
      </div>
      <div style={{ flex: 1, background: '#fff', borderRadius: 6, padding: 24, border: '1px solid #ddd' }}>
        <h3 style={{ marginBottom: 16 }}>Cargos</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input className="adsk-input" placeholder="Nuevo Cargo" value={newJobTitle} onChange={e => setNewJobTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddJobTitle()} />
          <button className="btn btn-primary" onClick={handleAddJobTitle}>Añadir</button>
        </div>
        <table className="data-table"><tbody>{jobTitles.map(j => (<tr key={j.id}><td>{j.name}</td><td style={{ width: 50 }}><button className="btn-icon" onClick={() => handleDeleteJob(j.id)}>🗑️</button></td></tr>))}</tbody></table>
      </div>
    </div>
  );
}

// ─── SECURE PROJECTS PAGE ───
export default function SecureProjectsPage({ user, onSelectProject, onLogout }) {
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
      const hRes = await apiFetch(`${API}/api/hubs`);
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
        <div className="header-left"><span className="header-logo">☁️ Plataforma BIM</span></div>
        <div className="header-right">
          <a href={VISOR_URL} className="header-nav-item" target="_blank" rel="noreferrer">🏗️ Visor 3D</a>
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
          {isAdmin && <span className={`tab ${activeTab === 'tags' ? 'active' : ''}`} onClick={() => setActiveTab('tags')}>Etiquetas</span>}
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
                        <td style={{ fontSize: 12, color: '#0696d7', fontWeight: 600 }}>{p.hub_name || 'Gral'}</td>
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
                        {isAdmin && (<td><button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 11 }} onClick={(e) => openAccess(p, e)}>👥 Accesos</button></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </>
        ) : activeTab === 'users' ? (<UsersTab />) : (<TagsTab />)}
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
