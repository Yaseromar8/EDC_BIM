import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

const API = Capacitor.isNativePlatform()
  ? 'https://visor-ecd-backend.onrender.com'
  : (import.meta.env.VITE_BACKEND_URL || '');

const VISOR_URL = import.meta.env.VITE_VISOR_URL || 'http://localhost:5173';

// ─── HELPERS ───
function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', csv: '📊',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🎨',
    ppt: '📙', pptx: '📙', txt: '📄', dwg: '📐', rvt: '🏗️', ifc: '🏗️',
    zip: '📦', rar: '📦', mp4: '🎬', mp3: '🎵',
  };
  return map[ext] || '📄';
}

function getInitials(name) {
  if (!name) return 'U';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ─── USER HOOK (localStorage & sessionStorage) ───
function useUser() {
  const [user, setUser] = useState(() => {
    const savedLocal = localStorage.getItem('docs_user');
    if (savedLocal) return JSON.parse(savedLocal);
    const savedSession = sessionStorage.getItem('docs_user');
    if (savedSession) return JSON.parse(savedSession);
    return null;
  });

  const saveUser = (data, remember = false) => {
    if (remember) {
      localStorage.setItem('docs_user', JSON.stringify(data));
      sessionStorage.removeItem('docs_user');
    } else {
      sessionStorage.setItem('docs_user', JSON.stringify(data));
      localStorage.removeItem('docs_user');
    }
    setUser(data);
  };

  const logout = () => {
    localStorage.removeItem('docs_user');
    sessionStorage.removeItem('docs_user');
    setUser(null);
  };

  return { user, saveUser, logout };
}

// ─────────────────────────────────────
// 1. LOGIN SCREEN (SCL Dark Style)
// ─────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [step, setStep] = useState(1); // 1: Login, 2: Create Account
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [jobTitleId, setJobTitleId] = useState('');
  const [terms, setTerms] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [companies, setCompanies] = useState([]);
  const [jobTitles, setJobTitles] = useState([]);

  useEffect(() => {
    if (step === 2) {
      fetch(`${API}/api/companies`).then(r => r.json()).then(setCompanies).catch(console.error);
      fetch(`${API}/api/job_titles`).then(r => r.json()).then(setJobTitles).catch(console.error);
    }
  }, [step]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Introduce correo y contraseña.'); return;
    }

    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });
      const data = await res.json();
      if (res.ok) {
        onLogin(data, remember);
      } else {
        setError(data.error || 'Credenciales inválidas');
      }
    } catch (e) { setError('Error de red al conectar con el servidor.'); }
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Por favor, completa todos los campos.'); return;
    }
    if (!companyId || !jobTitleId) {
      setError('Por favor, selecciona Empresa y Cargo.'); return;
    }
    if (!terms) {
      setError('Debes aceptar los términos para continuar.'); return;
    }

    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, company_id: companyId, job_title_id: jobTitleId })
      });
      const data = await res.json();
      if (res.ok) {
        onLogin(data, true);
      } else {
        setError(data.error || 'Error al crear cuenta');
      }
    } catch (e) { setError('Error de red al conectar con el servidor.'); }
    setLoading(false);
  };

  const LogoSCL = () => (
    <div className="adsk-logo" style={{ letterSpacing: '2px', fontSize: '20px' }}>SCL</div>
  );

  return (
    <div className="adsk-login-screen">
      <div className="adsk-card">
        <LogoSCL />

        {/* STEP 1: LOGIN */}
        {step === 1 && (
          <div>
            <h2>Iniciar sesión</h2>
            {error && <div style={{ color: '#d9534f', fontSize: 13, marginBottom: 16 }}>{error}</div>}

            <div className="adsk-input-group">
              <label>Correo electrónico</label>
              <input autoFocus type="email" className="adsk-input" value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()} />
            </div>

            <div className="adsk-input-group">
              <label>Contraseña</label>
              <input type="password" className="adsk-input" value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()} />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555', marginBottom: 24, cursor: 'pointer' }}>
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
              Mantener sesión iniciada
            </label>

            <button className="adsk-btn" onClick={handleLogin} disabled={loading}>
              {loading ? 'Iniciando...' : 'Siguiente'}
            </button>
            <div className="adsk-link" style={{ marginTop: 24 }}>
              ¿Es la primera vez que utiliza SCL? <a onClick={() => { setError(''); setPassword(''); setStep(2); }}>Crear una cuenta</a>
            </div>
          </div>
        )}

        {/* STEP 2: CREATE */}
        {step === 2 && (
          <div>
            <h2>Crear cuenta</h2>
            {error && <div style={{ color: '#d9534f', fontSize: 13, marginBottom: 16 }}>{error}</div>}

            <div className="adsk-input-group" style={{ marginBottom: 12 }}>
              <label>Nombre y Apellidos</label>
              <input autoFocus type="text" className="adsk-input" value={name}
                onChange={e => setName(e.target.value)} />
            </div>

            <div className="adsk-input-group" style={{ marginBottom: 16 }}>
              <label>Correo electrónico</label>
              <input type="email" className="adsk-input" value={email}
                onChange={e => setEmail(e.target.value)} />
            </div>

            <div className="adsk-input-group" style={{ marginBottom: 12 }}>
              <label>Empresa</label>
              <select className="adsk-input" style={{ width: '100%' }} value={companyId} onChange={e => setCompanyId(e.target.value)}>
                <option value="">Seleccione una empresa</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="adsk-input-group" style={{ marginBottom: 12 }}>
              <label>Cargo</label>
              <select className="adsk-input" style={{ width: '100%' }} value={jobTitleId} onChange={e => setJobTitleId(e.target.value)}>
                <option value="">Seleccione un cargo</option>
                {jobTitles.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
            </div>

            <div className="adsk-input-group" style={{ marginBottom: 16 }}>
              <label>Contraseña</label>
              <input type="password" className="adsk-input" value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRegister()} />
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: '#555', marginBottom: 24, cursor: 'pointer' }}>
              <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} style={{ marginTop: 2 }} />
              Acepto los <span style={{ textDecoration: 'underline' }}>Términos de uso de SCL</span> y la <span style={{ textDecoration: 'underline' }}>Declaración de privacidad</span>.
            </label>

            <button className="adsk-btn" onClick={handleRegister} disabled={loading}>
              {loading ? 'Creando...' : 'Crear Cuenta'}
            </button>

            <div className="adsk-link" style={{ marginTop: 24 }}>
              ¿Ya dispone de una cuenta? <a onClick={() => { setError(''); setPassword(''); setStep(1); }}>Iniciar sesión</a>
            </div>
          </div>
        )}

      </div>

      <div className="adsk-footer-links">
        ¿Problemas para iniciar sesión?
        <a>Obtenga ayuda</a>
      </div>
    </div>
  );
}

// ─────────────────────────────────────
// 2. ADMIN: USERS TAB
// ─────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Form create
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [error, setError] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/users`);
      if (res.ok) setUsers(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async () => {
    if (!email.trim()) return;
    setError('');
    try {
      const res = await fetch(`${API}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    await fetch(`${API}/api/users/${id}`, { method: 'DELETE' });
    fetchUsers();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <button className="btn btn-create" onClick={() => setShowCreate(true)}>+ Añadir usuario</button>
      </div>

      {loading ? <div className="loading"><div className="spinner" /><span>Cargando...</span></div> :
        <table className="data-table" style={{ background: '#fff', borderRadius: 6, overflow: 'hidden' }}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Empresa</th>
              <th>Cargo</th>
              <th>Rol</th>
              <th>Añadido el</th>
              <th style={{ width: 80 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 500 }}>{u.name}</td>
                <td>{u.email}</td>
                <td style={{ fontSize: 13, color: '#555' }}>{u.company_name}</td>
                <td style={{ fontSize: 13, color: '#555' }}>{u.job_title_name}</td>
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

      {/* CREATE USER MODAL */}
      {
        showCreate && (
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
        )
      }
    </div >
  );
}

// ─────────────────────────────────────
// 3. SECURE PROJECTS PAGE (Landing ACC)
// ─────────────────────────────────────

function TagsTab() {
  const [companies, setCompanies] = useState([]);
  const [jobTitles, setJobTitles] = useState([]);
  const [newCompany, setNewCompany] = useState('');
  const [newJobTitle, setNewJobTitle] = useState('');

  const fetchTags = async () => {
    try {
      const rc = await fetch(`${API}/api/companies`);
      if (rc.ok) setCompanies(await rc.json());
      const rj = await fetch(`${API}/api/job_titles`);
      if (rj.ok) setJobTitles(await rj.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchTags(); }, []);

  const handleAddCompany = async () => {
    if (!newCompany.trim()) return;
    await fetch(`${API}/api/companies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCompany }) });
    setNewCompany(''); fetchTags();
  };

  const handleAddJobTitle = async () => {
    if (!newJobTitle.trim()) return;
    await fetch(`${API}/api/job_titles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newJobTitle }) });
    setNewJobTitle(''); fetchTags();
  };

  const handleDeleteComp = async (id) => {
    if (!window.confirm('¿Borrar empresa?')) return;
    await fetch(`${API}/api/companies/${id}`, { method: 'DELETE' }); fetchTags();
  };
  const handleDeleteJob = async (id) => {
    if (!window.confirm('¿Borrar cargo?')) return;
    await fetch(`${API}/api/job_titles/${id}`, { method: 'DELETE' }); fetchTags();
  };

  return (
    <div style={{ display: 'flex', gap: 32 }}>
      {/* Companies */}
      <div style={{ flex: 1, background: '#fff', borderRadius: 6, padding: 24, border: '1px solid #ddd' }}>
        <h3 style={{ marginBottom: 16 }}>Empresas</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input className="adsk-input" placeholder="Nueva Empresa" value={newCompany} onChange={e => setNewCompany(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddCompany()} />
          <button className="btn btn-primary" onClick={handleAddCompany}>Añadir</button>
        </div>
        <table className="data-table">
          <tbody>
            {companies.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td style={{ width: 50 }}><button className="btn-icon" onClick={() => handleDeleteComp(c.id)}>🗑️</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Job Titles */}
      <div style={{ flex: 1, background: '#fff', borderRadius: 6, padding: 24, border: '1px solid #ddd' }}>
        <h3 style={{ marginBottom: 16 }}>Cargos</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input className="adsk-input" placeholder="Nuevo Cargo" value={newJobTitle} onChange={e => setNewJobTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddJobTitle()} />
          <button className="btn btn-primary" onClick={handleAddJobTitle}>Añadir</button>
        </div>
        <table className="data-table">
          <tbody>
            {jobTitles.map(j => (
              <tr key={j.id}>
                <td>{j.name}</td>
                <td style={{ width: 50 }}><button className="btn-icon" onClick={() => handleDeleteJob(j.id)}>🗑️</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SecureProjectsPage({ user, onSelectProject, onLogout }) {
  const [activeTab, setActiveTab] = useState('projects');
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // Hubs
  const [hubs, setHubs] = useState([]);
  const [selectedHub, setSelectedHub] = useState('');

  // Forms
  const [newName, setNewName] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newLocation, setNewLocation] = useState('');

  // Access Modal
  const [showAccess, setShowAccess] = useState(null); // Project ID
  const [projectUsers, setProjectUsers] = useState([]); // user IDs
  const [allUsers, setAllUsers] = useState([]); // solo admin

  const isAdmin = user.role === 'admin';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch hubs first
      const hRes = await fetch(`${API}/api/hubs`);
      if (hRes.ok) {
        const hData = await hRes.json();
        setHubs(hData.hubs || []);
      }

      const res = await fetch(`${API}/api/projects?user_id=${user.id}&role=${user.role}`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.projects || []);
        setProjects(list);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const targetHub = selectedHub || (hubs[0]?.id) || 'b.mdc_default_legacy';
    try {
      await fetch(`${API}/api/hubs/${targetHub}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), number: newNumber, location: newLocation, account: user.email })
      });
      setShowCreate(false);
      setNewName(''); setNewNumber(''); setNewLocation(''); setSelectedHub('');
      fetchData();
    } catch (e) { console.error(e); }
  };

  const openAccess = async (proj, e) => {
    e.stopPropagation();
    try {
      // 1. Fetch todos los usuarios
      const r1 = await fetch(`${API}/api/users`);
      if (r1.ok) setAllUsers(await r1.json());
      // 2. Fetch usuarios asignados a este proyecto
      const r2 = await fetch(`${API}/api/projects/${proj.id}/users`);
      if (r2.ok) setProjectUsers(await r2.json());

      setShowAccess(proj);
    } catch (e) { console.error(e); }
  };

  const saveAccess = async () => {
    if (!showAccess) return;
    try {
      await fetch(`${API}/api/projects/${showAccess.id}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_ids: projectUsers })
      });
      setShowAccess(null);
    } catch (e) { console.error(e); }
  };

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.number || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="app-shell">
      {/* DARK HEADER */}
      <header className="top-header">
        <div className="header-left">
          <span className="header-logo">☁️ Plataforma BIM</span>
        </div>
        <div className="header-right">
          <a href={VISOR_URL} className="header-nav-item" target="_blank" rel="noreferrer">
            🏗️ Visor 3D
          </a>
          <div className="header-user" onClick={onLogout} title="Cerrar sesión">
            <span style={{ fontSize: 13, marginRight: 8, opacity: 0.8 }}>{user.name.split(' ')[0]}</span>
            <div className="header-avatar">{getInitials(user.name)}</div>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, overflow: 'auto', padding: '32px 48px', background: '#fafafa' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, color: '#1e1e1e' }}>
          Le damos la bienvenida, {user.name.split(' ')[0]}
        </h1>
        <p style={{ color: '#999', marginBottom: 24, fontSize: 13 }}>¿Qué desea hacer hoy?</p>

        {/* TABS */}
        <div className="tabs">
          <span className={`tab ${activeTab === 'projects' ? 'active' : ''}`} onClick={() => setActiveTab('projects')}>Proyectos</span>
          {isAdmin && <span className={`tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>Usuarios</span>}
          {isAdmin && <span className={`tab ${activeTab === 'tags' ? 'active' : ''}`} onClick={() => setActiveTab('tags')}>Etiquetas</span>}
        </div>

        {activeTab === 'projects' ? (
          <>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12 }}>
              {isAdmin && (
                <button className="btn btn-create" onClick={() => setShowCreate(true)}>
                  + Crear proyecto
                </button>
              )}
              <div style={{ flex: 1 }} />
              <input type="text" placeholder="Buscar proyectos..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: 280, padding: '7px 12px', background: '#fff', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, outline: 'none' }} />
            </div>

            {/* TABLE */}
            {loading ? <div className="loading"><div className="spinner" /><span>Cargando proyectos...</span></div> :
              filtered.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">🏗️</span>
                  <p>{isAdmin ? 'No hay proyectos. Haz clic en "+ Crear proyecto".' : 'No tienes proyectos asignados.'}</p>
                </div>
              ) : (
                <table className="data-table" style={{ background: '#fff', borderRadius: 6, overflow: 'hidden' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 140 }}>Municipalidad</th>
                      <th>Nombre</th>
                      <th style={{ width: 100 }}>Número</th>
                      <th style={{ width: 140 }}>Acceso por defecto</th>
                      <th style={{ width: 150 }}>Cuenta</th>
                      <th style={{ width: 120 }}>Creado el</th>
                      {isAdmin && <th style={{ width: 120 }}>Gestión</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => (
                      <tr key={p.id} onClick={() => onSelectProject(p)}>
                        <td style={{ fontSize: 12, color: '#0696d7', fontWeight: 600 }}>{p.hub_name || 'Gral'}</td>
                        <td>
                          <div className="project-name-main">{p.name}</div>
                          {p.location && <div className="project-name-sub">{p.location}</div>}
                        </td>
                        <td>{p.number || '—'}</td>
                        <td><span className="access-badge access-badge-docs">📁 Docs</span></td>
                        <td style={{ fontSize: 12 }}>{p.account}</td>
                        <td style={{ fontSize: 12 }}>{formatDate(p.created_at)}</td>
                        {isAdmin && (
                          <td>
                            <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 11 }} onClick={(e) => openAccess(p, e)}>
                              👥 Accesos
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </>
        ) : activeTab === 'users' ? (
          <UsersTab />
        ) : (
          <TagsTab />
        )}
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
                  <input type="checkbox" checked={projectUsers.includes(u.id)}
                    onChange={(e) => {
                      if (e.target.checked) setProjectUsers([...projectUsers, u.id]);
                      else setProjectUsers(projectUsers.filter(id => id !== u.id));
                    }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</span>
                  </div>
                </label>
              ))}
              {allUsers.filter(u => u.role !== 'admin').length === 0 && (
                <div style={{ padding: 16, fontSize: 13, color: '#999', textAlign: 'center' }}>No hay usuarios normales creados.</div>
              )}
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

// ─────────────────────────────────────
// 3.4 MINI SELECT FOLDER TREE
// ─────────────────────────────────────
function SelectFolderNode({ folder, defaultExpanded = false, selectedPath, onSelect }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [children, setChildren] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadChildren = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/docs/list?path=${encodeURIComponent(folder.fullName)}`);
      if (res.ok) {
        const response = await res.json();
        const data = response.data || {};
        const sorted = (data.folders || []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        setChildren(sorted);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    if (defaultExpanded && !children) loadChildren();
  }, [defaultExpanded]);

  const handleToggle = async (e) => {
    e.stopPropagation();
    if (!expanded && !children) await loadChildren();
    setExpanded(!expanded);
  };

  const isSelected = selectedPath === folder.fullName;

  return (
    <div style={{ marginLeft: 16 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', cursor: 'pointer', background: isSelected ? '#e6f3fa' : 'transparent', color: isSelected ? '#0696D7' : '#333', borderRadius: 4 }}
        onClick={() => onSelect(folder.fullName)}
      >
        <div style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 4, cursor: 'pointer' }} onClick={handleToggle}>
          {loading ? <div className="adsk-spinner" style={{ width: 10, height: 10, borderWidth: 1 }} /> : (
            <svg height="16" width="16" viewBox="0 0 24 24" fill="currentColor" style={{ transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform 0.2s', opacity: (children && children.length === 0 && expanded) ? 0 : 1 }}>
              <path d="M12,16.17a.74.74,0,0,1-.54-.23L6.23,10.52a.75.75,0,0,1,1.08-1L12,14.34l4.69-4.86a.75.75,0,1,1,1.08,1l-5.23,5.42A.74.74,0,0,1,12,16.17Z"></path>
            </svg>
          )}
        </div>
        <svg fill={isSelected ? "#0696D7" : "#888"} viewBox="0 0 24 24" width="18" height="18" style={{ marginRight: 6 }}>
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path>
        </svg>
        <span style={{ fontSize: 13, userSelect: 'none', whiteSpace: 'nowrap', flex: 1 }}>{folder.name.replace(/\/$/, '')}</span>
      </div>
      {expanded && children && (
        <div>
          {children.map(c => <SelectFolderNode key={c.fullName} folder={c} selectedPath={selectedPath} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────
// 3.5 RECURSIVE FOLDER NODE
// ─────────────────────────────────────
function FolderNode({ folder, currentPath, onNavigate, projectPrefix, level = 1, defaultExpanded = false, onCreateSubfolder, isAdmin, onTreeRefresh, onGlobalRefresh, refreshSignal = 0, onInitiateMove }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [children, setChildren] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const menuRef = useRef(null);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [isCreatingChild, setIsCreatingChild] = useState(false);
  const [newChildName, setNewChildName] = useState('');

  const submitRename = async () => {
    if (!renameValue.trim() || renameValue.trim() === folder.name.replace(/\/$/, '')) { setIsRenaming(false); return; }
    const isFolder = folder.fullName.endsWith('/');
    let baseName = folder.fullName;
    if (isFolder) baseName = baseName.slice(0, -1);
    const parts = baseName.split('/');
    parts[parts.length - 1] = renameValue.trim();
    let newNamePath = parts.join('/');
    if (isFolder) newNamePath += '/';
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/docs/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: folder.fullName,
          newName: renameValue.trim()
        })
      });

      if (res.ok) {
        const data = await res.json();
        const serverNewPath = data.newFullName + (folder.fullName.endsWith('/') ? '/' : '');

        setLoading(false);
        setIsRenaming(false);
        if (onTreeRefresh) onTreeRefresh();
        if (onGlobalRefresh) onGlobalRefresh(currentPath === folder.fullName ? serverNewPath : null);
      } else {
        const err = await res.json();
        alert("Error al renombrar: " + (err.error || 'Desconocido'));
        setLoading(false);
      }
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const submitCreateChild = async () => {
    if (!newChildName.trim()) { setIsCreatingChild(false); return; }
    const newPath = folder.fullName + newChildName.trim() + '/';
    setLoading(true);
    try { await fetch(`${API}/api/docs/folder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: newPath }) }); } catch (e) { }
    setLoading(false);
    setIsCreatingChild(false);
    setNewChildName('');
    loadChildren();
    if (onGlobalRefresh) onGlobalRefresh();
  };

  const submitDelete = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try { await fetch(`${API}/api/docs/delete`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName: folder.fullName }) }); } catch (e) { }
    setLoading(false);
    if (onTreeRefresh) onTreeRefresh();
    if (onGlobalRefresh) onGlobalRefresh((currentPath === folder.fullName || currentPath.startsWith(folder.fullName)) ? projectPrefix : null);
  };

  useEffect(() => {
    if (expanded && refreshSignal > 0) {
      loadChildren(true);
    }
  }, [refreshSignal]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setShowMenu(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-fetch si viene expandido por defecto
  useEffect(() => {
    if (defaultExpanded && !children) {
      loadChildren();
    }
  }, [defaultExpanded]);

  // Sincronizar recarga desde el exterior
  useEffect(() => {
    if (expanded && refreshSignal > 0) {
      loadChildren(true);
    }
  }, [refreshSignal, expanded]);

  // Auto-expandir el árbol si el usuario navega a un hijo desde la tabla principal o breadcrumbs
  useEffect(() => {
    if (currentPath.startsWith(folder.fullName) && currentPath !== folder.fullName) {
      if (!expanded) setExpanded(true);
      if (!children) loadChildren(true); // Cargar render silencioso
    }
  }, [currentPath, folder.fullName, expanded, children]);

  const loadChildren = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${API}/api/docs/list?path=${encodeURIComponent(folder.fullName)}`);
      if (res.ok) {
        const response = await res.json();
        const data = response.data || {};
        const sorted = (data.folders || []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        setChildren(sorted);
      }
    } catch (e) {
      console.error(e);
    }
    if (!silent) setLoading(false);
  };

  const handleToggle = async (e) => {
    e.stopPropagation();
    if (!expanded && !children) {
      await loadChildren();
    }
    setExpanded(!expanded);
  };

  const isActive = currentPath === folder.fullName;
  const isChildrenActive = currentPath.startsWith(folder.fullName) && !isActive;

  return (
    <>
      <div
        className={`folder-tree-item ${isActive ? 'active' : ''} ${isChildrenActive ? 'child-active' : ''}`}
        style={{ paddingLeft: `${8 + (level * 28)}px`, color: isActive ? '#0696D7' : '#3c3c3c' }}
        onClick={() => onNavigate(folder.fullName)}
      >
        <div className="tree-toggle" onClick={handleToggle} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (children && children.length === 0 && expanded) ? 0 : 1 }}>
          {loading ? (
            <div className="adsk-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
          ) : (
            <svg height="24" width="24" viewBox="0 0 24 24" fill="currentColor" style={{ transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform 0.2s', width: 20, height: 20 }}>
              <path d="M12,16.17a.74.74,0,0,1-.54-.23L6.23,10.52a.75.75,0,0,1,1.08-1L12,14.34l4.69-4.86a.75.75,0,1,1,1.08,1l-5.23,5.42A.74.74,0,0,1,12,16.17Z"></path>
            </svg>
          )}
        </div>

        <div className="tree-icon" style={{ display: 'flex', alignItems: 'center', marginLeft: 4, marginRight: 8 }}>
          <svg fill="currentColor" viewBox="0 0 24 24" width="24" height="24">
            <path d="M18,20.45H6a3.6,3.6,0,0,1-3.6-3.6V7.15A3.6,3.6,0,0,1,6,3.55h4.84a.71.71,0,0,1,.53.22l2.12,2.1H18a3.61,3.61,0,0,1,3.6,3.61v7.37A3.6,3.6,0,0,1,18,20.45ZM3.89,9.48v7.37A2.1,2.1,0,0,0,6,19H18a2.1,2.1,0,0,0,2.1-2.1V9.48A2.1,2.1,0,0,0,18,7.37H13.17a.75.75,0,0,1-.53-.22l-2.12-2.1H6a2.1,2.1,0,0,0-2.1,2.1Z"></path>
          </svg>
        </div>

        {isRenaming ? (
          <div className="inline-edit-box" onClick={e => e.stopPropagation()}>
            <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setIsRenaming(false); }} />
            <button onClick={(e) => { e.stopPropagation(); setIsRenaming(false); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"></path></svg></button>
            <button onClick={(e) => { e.stopPropagation(); submitRename(); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"></path></svg></button>
          </div>
        ) : (
          <div className="tree-name" style={{ fontWeight: 400, flex: 1, whiteSpace: 'nowrap', fontSize: 14, paddingRight: 8 }} title={folder.name.replace(/\/$/, '')}>
            {folder.name.replace(/\/$/, '')}
          </div>
        )}

        {isAdmin && !isRenaming && (
          <button
            className="folder-icon-btn"
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setMenuPos({ top: rect.bottom, left: rect.left });
              setShowMenu(!showMenu);
            }}
            title="Opciones de carpeta"
          >
            <svg height="24" width="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.5,6A1.5,1.5,0,1,1,12,4.5,1.5,1.5,0,0,1,13.5,6ZM12,10.5A1.5,1.5,0,1,0,13.5,12,1.5,1.5,0,0,0,12,10.5Zm0,6A1.5,1.5,0,1,0,13.5,18,1.5,1.5,0,0,0,12,16.5Z"></path>
            </svg>
          </button>
        )}
        {showMenu && (
          <div className="tree-context-menu" ref={menuRef} style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 99999 }}>
            {isAdmin && folder.fullName !== projectPrefix && (
              <button className="tree-context-item" onClick={(e) => { e.stopPropagation(); setShowMenu(false); setIsRenaming(true); setRenameValue(folder.name.replace(/\/$/, '')); }}>
                <svg fill="currentColor" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg> Cambiar nombre
              </button>
            )}
            {isAdmin && (
              <button className="tree-context-item" onClick={(e) => { e.stopPropagation(); setShowMenu(false); setExpanded(true); setIsCreatingChild(true); setNewChildName(''); }}>
                <svg fill="currentColor" viewBox="0 0 24 24"><path d="M19,11H13V5a1,1,0,0,0-2,0v6H5a1,1,0,0,0,0,2h6v6a1,1,0,0,0,2,0V13h6a1,1,0,0,0,0-2Z" /></svg> Añadir subcarpeta
              </button>
            )}
            <button className="tree-context-item" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}>
              <svg fill="currentColor" viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" /></svg> Compartir
            </button>
          </div>
        )}
      </div>
      {expanded && children && (
        <div className="folder-children">
          {children.map(child => (
            <FolderNode
              key={child.fullName}
              folder={child}
              currentPath={currentPath}
              onNavigate={onNavigate}
              projectPrefix={projectPrefix}
              level={level + 1}
              isAdmin={isAdmin}
              onTreeRefresh={loadChildren}
              onGlobalRefresh={(newP) => { if (onGlobalRefresh) onGlobalRefresh(newP || currentPath) }}
              refreshSignal={refreshSignal}
              onInitiateMove={onInitiateMove}
            />
          ))}
          {isCreatingChild && (
            <div className="folder-tree-item child-active" style={{ paddingLeft: `${8 + ((level + 1) * 28)}px` }}>
              <div style={{ width: 24, height: 24 }}></div>
              <div className="tree-icon" style={{ display: 'flex', alignItems: 'center', marginLeft: 4, marginRight: 8 }}>
                <svg fill="currentColor" viewBox="0 0 24 24" width="24" height="24"><path d="M18,20.45H6a3.6,3.6,0,0,1-3.6-3.6V7.15A3.6,3.6,0,0,1,6,3.55h4.84a.71.71,0,0,1,.53.22l2.12,2.1H18a3.61,3.61,0,0,1,3.6,3.61v7.37A3.6,3.6,0,0,1,18,20.45ZM3.89,9.48v7.37A2.1,2.1,0,0,0,6,19H18a2.1,2.1,0,0,0,2.1-2.1V9.48A2.1,2.1,0,0,0,18,7.37H13.17a.75.75,0,0,1-.53-.22l-2.12-2.1H6a2.1,2.1,0,0,0-2.1,2.1Z"></path></svg>
              </div>
              <div className="inline-edit-box" onClick={e => e.stopPropagation()}>
                <input autoFocus value={newChildName} onChange={e => setNewChildName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitCreateChild(); if (e.key === 'Escape') setIsCreatingChild(false); }} placeholder="Carpeta nueva" />
                <button onClick={(e) => { e.stopPropagation(); setIsCreatingChild(false); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"></path></svg></button>
                <button onClick={(e) => { e.stopPropagation(); submitCreateChild(); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"></path></svg></button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────
// 4. FILES PAGE (Dentro del Proyecto)
// ─────────────────────────────────────
function FilesPage({ project, user, onBack }) {
  const projectPrefix = `proyectos/${project.name.replace(/ /g, '_')}/`;
  const [currentPath, setCurrentPath] = useState(projectPrefix);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sidebarFolders, setSidebarFolders] = useState([]);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [activeFile, setActiveFile] = useState(null);
  const [showVersions, setShowVersions] = useState(false);
  const [viewedVersionInfo, setViewedVersionInfo] = useState(null); // { version, urn }
  const [versionHistory, setVersionHistory] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ total: 0, current: 0 });

  // Move Modal State
  const [moveState, setMoveState] = useState({ step: 0, items: [], destPath: '' });

  const fileRef = useRef(null);

  const isAdmin = user.role === 'admin';

  const fetchContents = useCallback(async (path, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${API}/api/docs/list?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const response = await res.json();
        const data = response.data || {};
        const sortedFolders = (data.folders || []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        const sortedFiles = (data.files || []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        setFolders(sortedFolders);
        setFiles(sortedFiles);
      }
    } catch (e) { console.error(e); }
    finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const triggerRefresh = (path = currentPath) => { fetchContents(path, true); setRefreshSignal(prev => prev + 1); };

  useEffect(() => { fetchContents(currentPath); }, [currentPath]);

  const navigate = (path) => {
    if (path === currentPath) return;
    setFolders([]);
    setFiles([]);
    setCurrentPath(path);
    setSelected(new Set());
  };

  const handleUpload = async (fileList) => {
    if (!isAdmin || !fileList?.length) return;
    setUploading(true);
    setUploadProgress({ total: fileList.length, current: 0 });

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      let uploadSuccess = false;

      try {
        // MÉTODO 1: Subida Directa (Estilo ACC)
        const urlRes = await fetch(`${API}/api/docs/upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type || 'application/octet-stream',
            model_urn: 'global'
          })
        });
        const { uploadUrl, gcsUrn } = await urlRes.json();

        if (uploadUrl) {
          await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file
          });

          await fetch(`${API}/api/docs/upload-complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: file.name,
              gcsUrn: gcsUrn,
              sizeBytes: file.size,
              contentType: file.type || 'application/octet-stream',
              path: currentPath,
              user: user.name,
              model_urn: 'global'
            })
          });
          uploadSuccess = true;
        }
      } catch (error) {
        console.warn("Subida directa bloqueada. Usando modo respaldo...", file.name);
      }

      // MÉTODO 2: Backup tradicional (Si falla el directo o hay CORS)
      if (!uploadSuccess) {
        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('path', currentPath);
          fd.append('user', user.name);
          fd.append('model_urn', 'global');

          const resp = await fetch(`${API}/api/docs/upload`, {
            method: 'POST',
            body: fd
          });
          if (resp.ok) uploadSuccess = true;
        } catch (err) {
          console.error("Fallo total de subida:", file.name, err);
          alert(`No se pudo subir ${file.name}.`);
        }
      }
      setUploadProgress(prev => ({ ...prev, current: i + 1 }));
    }

    setUploading(false);
    setUploadProgress({ total: 0, current: 0 });
    triggerRefresh();
  };

  const createFolder = async () => {
    if (!isAdmin || !folderName.trim()) return;
    try {
      await fetch(`${API}/api/docs/folder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: currentPath + folderName.trim() }) });
    } catch (e) { }
    setShowNewFolder(false); setFolderName(''); triggerRefresh();
  };

  const handleDelete = async () => {
    if (!isAdmin || !selected.size) return;
    setLoading(true);
    for (const name of selected) {
      try { await fetch(`${API}/api/docs/delete`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName: name }) }); } catch (e) { }
    }
    setLoading(false);
    setSelected(new Set()); triggerRefresh();
  };

  const deleteSpecificItem = async (fullName) => {
    if (!isAdmin) return;
    try { await fetch(`${API}/api/docs/delete`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName }) }); } catch (e) { }
    triggerRefresh();
    if (currentPath === fullName || currentPath.startsWith(fullName)) navigate(projectPrefix);
  };

  const renameSpecificItem = async (fullName) => {
    if (!isAdmin) return;
    const isFolder = fullName.endsWith('/');
    let baseName = fullName;
    if (isFolder) baseName = baseName.slice(0, -1);
    const parts = baseName.split('/');
    const oldName = parts[parts.length - 1];

    const newNameRaw = window.prompt(`Renombrar '${oldName}' a:`, oldName);
    if (!newNameRaw || newNameRaw.trim() === '' || newNameRaw === oldName) return;

    parts[parts.length - 1] = newNameRaw.trim();
    let newNamePath = parts.join('/');
    if (isFolder) newNamePath += '/';

    try {
      await fetch(`${API}/api/docs/rename`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName: fullName, newName: newNamePath })
      });
    } catch (e) { console.error(e); }
    triggerRefresh();
    if (currentPath === fullName || currentPath.startsWith(fullName)) navigate(projectPrefix);
  };

  const handleRename = async () => {
    if (!isAdmin || selected.size !== 1) return;
    const oldNamePath = Array.from(selected)[0];
    const isFolder = oldNamePath.endsWith('/');

    // Extract name
    let baseName = oldNamePath;
    if (isFolder) baseName = baseName.slice(0, -1);
    const parts = baseName.split('/');
    const oldName = parts[parts.length - 1];

    const newNameRaw = window.prompt(`Renombrar '${oldName}' a:`, oldName);
    if (!newNameRaw || newNameRaw.trim() === '' || newNameRaw === oldName) return;

    parts[parts.length - 1] = newNameRaw.trim();
    let newNamePath = parts.join('/');
    if (isFolder) newNamePath += '/';

    try {
      await fetch(`${API}/api/docs/rename`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName: oldNamePath, newName: newNamePath })
      });
    } catch (e) { console.error(e); }

    setSelected(new Set());
    triggerRefresh();
  };

  const handleInitiateMove = (itemsToMove) => {
    if (!isAdmin || !itemsToMove.length) return;
    setMoveState({ step: 1, items: itemsToMove, destPath: '' });
  };

  const handleExecuteMove = async () => {
    if (!isAdmin || typeof moveState.destPath !== 'string' || !moveState.items.length) return;

    // Solo bloqueamos via un estado "soft" si es necesario, pero quitamos el setLoading global
    for (const fullName of moveState.items) {
      try {
        await fetch(`${API}/api/docs/move`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName: fullName, destPath: moveState.destPath, user: user?.email })
        });
      } catch (e) { console.error(e); }
    }
    setMoveState({ step: 0, items: [], destPath: '' });
    setSelected(new Set());
    triggerRefresh();
  };

  const toggle = (name) => { setSelected(prev => { const s = new Set(prev); s.has(name) ? s.delete(name) : s.add(name); return s; }); };
  const relativePath = currentPath.replace(projectPrefix, '');
  const breadcrumbs = relativePath ? relativePath.replace(/\/$/, '').split('/') : [];

  useEffect(() => {
    if (showVersions && activeFile) {
      const fetchVersions = async () => {
        setLoadingVersions(true);
        try {
          const res = await fetch(`${API}/api/docs/versions?path=${encodeURIComponent(activeFile.fullName)}`);
          if (res.ok) {
            const data = await res.json();
            setVersionHistory(data.data || []);
          }
        } catch (e) { console.error(e); }
        setLoadingVersions(false);
      };
      fetchVersions();
    }
  }, [showVersions, activeFile]);

  return (
    <div className="acc-root">
      <div className="acc-top-strip"></div>
      <header className="acc-top-header">
        <div className="header-left">
          <span className="header-logo" style={{ cursor: 'pointer', fontWeight: 600, fontSize: 16 }} onClick={onBack}>
            <strong>AUTODESK</strong> Construction Cloud
          </span>
        </div>
        <div className="acc-header-center" style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div className="module-selector" style={{ background: '#f0f0f0', borderRadius: 4, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginRight: 8, cursor: 'pointer', fontWeight: 600 }}>
            <span style={{ fontSize: 14 }}>📁</span> Docs
          </div>
          <div className="project-selector" style={{ cursor: 'pointer', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #dcdcdc', padding: '0 12px', height: 32, borderRadius: 4 }} onClick={onBack} title="Volver a proyectos">
            {project.name} <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"></path></svg>
          </div>
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="http://localhost:5173" className="header-nav-item" target="_blank" rel="noreferrer" style={{ fontSize: 13, textDecoration: 'none', color: '#0696D7', fontWeight: 500 }}>Visor 3D</a>
          <div className="header-user" style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 13, marginRight: 8, opacity: 0.8 }}>{user.name.split(' ')[0]}</span>
            <div className="header-avatar" style={{ background: '#dcdcdc', color: '#000', borderRadius: '50%', width: 25, height: 25, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'bold' }}>{getInitials(user.name)}</div>
          </div>
        </div>
      </header>
      <div className="acc-main-layout">
        <aside className="acc-left-sidebar">
          <div className="sidebar-item active">
            <span className="icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 6h4l2 2h14v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"></path><path d="M2 13h20"></path></svg></span>
            Archivos
          </div>
          <div className="sidebar-item"><span className="icon" style={{ opacity: 0.5 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg></span> Especificaciones</div>
          <div className="sidebar-item"><span className="icon" style={{ opacity: 0.5 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><polyline points="12 6 12 12 16 14"></polyline></svg></span> Revisiones</div>
          <div className="sidebar-item"><span className="icon" style={{ opacity: 0.5 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg></span> Informes de transmisión</div>
          <div className="sidebar-item"><span className="icon" style={{ opacity: 0.5 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></span> Incidencias</div>
          <div className="sidebar-item"><span className="icon" style={{ opacity: 0.5 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg></span> Informes</div>
          <div className="sidebar-item"><span className="icon" style={{ opacity: 0.5 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></span> Miembros</div>
          <div className="sidebar-item"><span className="icon" style={{ opacity: 0.5 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></span> Configuración</div>
        </aside>

        <main className="acc-content-wrapper">

          <div className="acc-internal-header">
            <h1>Archivos</h1>
            <div className="acc-tabs">
              <div className="acc-tab active">Carpetas</div>
              <div className="acc-tab">Conjuntos</div>
            </div>
          </div>
          <hr className="acc-divider" />

          <div className="acc-workspace">
            {/* TREE PANEL */}
            <div className="acc-tree-panel">
              <FolderNode
                folder={{ name: 'Archivos de proyecto', fullName: projectPrefix }}
                currentPath={currentPath}
                onNavigate={navigate}
                projectPrefix={projectPrefix}
                level={0}
                defaultExpanded={true}
                isAdmin={isAdmin}
                onTreeRefresh={() => { }}
                onGlobalRefresh={(newPath) => { triggerRefresh(currentPath); if (newPath) navigate(newPath); }}
                refreshSignal={refreshSignal}
                onInitiateMove={handleInitiateMove}
              />
            </div>

            {/* DATA PANEL */}
            <div className={`acc-data-panel ${dragOver && isAdmin ? 'dropzone-active' : ''}`}
              onDragOver={e => { if (isAdmin) { e.preventDefault(); setDragOver(true); } }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { if (isAdmin) { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); } }}>

              <div className="acc-toolbar">
                {isAdmin ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div className="btn-group-blue">
                      <button className="btn-main-blue" onClick={() => setShowUploadModal(true)} disabled={uploading}>
                        {uploading ? (
                          <><span>...</span> Subiendo</>
                        ) : (
                          <><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg> Cargar archivos</>
                        )}
                      </button>
                      <button className="btn-split-blue" onClick={() => setShowUploadModal(true)} disabled={uploading}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                      </button>
                    </div>
                    <input ref={fileRef} type="file" multiple hidden onChange={e => handleUpload(e.target.files)} />
                    {selected.size === 1 && (
                      <button className="btn btn-outline" style={{ background: '#fff', border: '1px solid #ccc', borderRadius: 4, padding: '8px 16px', cursor: 'pointer', color: '#333' }} onClick={handleRename} title="Renombrar">Renombrar</button>
                    )}
                    {selected.size > 0 && (
                      <>
                        <button className="btn btn-outline" style={{ background: '#fff', border: '1px solid #ccc', borderRadius: 4, padding: '8px 16px', cursor: 'pointer', color: '#333' }} onClick={() => handleInitiateMove(Array.from(selected))} title="Desplazar">Desplazar</button>
                        <button className="btn btn-outline" style={{ background: '#fff', border: '1px solid #ccc', borderRadius: 4, padding: '8px 16px', cursor: 'pointer', color: '#333' }} onClick={handleDelete} title="Suprimir">Eliminar</button>
                      </>
                    )}
                  </div>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Solo lectura. Los administradores pueden subir archivos.</span>
                )}
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <button className="btn-icon" title="Filtro">
                    <svg height="20" width="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.59,19.53l-5.32-5.32a6.76,6.76,0,1,0-1.06,1.06l5.32,5.32a.74.74,0,0,0,.53.22.71.71,0,0,0,.53-.22A.74.74,0,0,0,20.59,19.53ZM4.75,10A5.25,5.25,0,1,1,10,15.25,5.26,5.26,0,0,1,4.75,10Z"></path></svg>
                  </button>
                  <div style={{ display: 'flex', border: '1px solid #dcdcdc', borderRadius: 4, overflow: 'hidden' }}>
                    <button className="btn-icon" style={{ borderRadius: 0, padding: '4px 8px', background: '#f5f5f5' }} title="Miniaturas">
                      <svg height="20" width="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8,10.75H5A2.75,2.75,0,0,1,2.27,8V5A2.76,2.76,0,0,1,5,2.27H8A2.76,2.76,0,0,1,10.75,5V8A2.75,2.75,0,0,1,8,10.75Zm-3-7A1.25,1.25,0,0,0,3.77,5V8A1.25,1.25,0,0,0,5,9.25H8A1.25,1.25,0,0,0,9.25,8V5A1.25,1.25,0,0,0,8,3.77Zm14,7H16A2.75,2.75,0,0,1,13.25,8V5A2.75,2.75,0,0,1,16,2.27h3A2.76,2.76,0,0,1,21.73,5V8A2.75,2.75,0,0,1,19,10.75Zm-3-7A1.25,1.25,0,0,0,14.75,5V8A1.25,1.25,0,0,0,16,9.25h3A1.25,1.25,0,0,0,20.23,8V5A1.25,1.25,0,0,0,19,3.77Zm-8,18H5A2.76,2.76,0,0,1,2.27,19V16A2.75,2.75,0,0,1,5,13.25H8A2.75,2.75,0,0,1,10.75,16v3A2.76,2.76,0,0,1,8,21.73Zm-3-7A1.25,1.25,0,0,0,3.77,16v3A1.26,1.26,0,0,0,5,20.23H8A1.26,1.26,0,0,0,9.25,19V16A1.25,1.25,0,0,0,8,14.75Zm14,7H16A2.75,2.75,0,0,1,13.25,19V16A2.75,2.75,0,0,1,16,13.25h3A2.75,2.75,0,0,1,21.73,16v3A2.76,2.76,0,0,1,19,21.73Zm-3-7A1.25,1.25,0,0,0,14.75,16v3A1.26,1.26,0,0,0,16,20.23h3A1.26,1.26,0,0,0,20.23,19V16A1.25,1.25,0,0,0,19,14.75Z"></path></svg>
                    </button>
                    <button className="btn-icon" style={{ borderRadius: 0, padding: '4px 8px', background: '#ececec', color: '#0696D7' }} title="Lista">
                      <svg height="20" width="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20,19.75H4a.75.75,0,0,1,0-1.5H20a.75.75,0,0,1,0,1.5Zm.75-5.42a.76.76,0,0,0-.75-.75H4a.75.75,0,1,0,0,1.5H20A.75.75,0,0,0,20.75,14.33Zm0-4.66A.75.75,0,0,0,20,8.92H4a.75.75,0,0,0,0,1.5H20A.76.76,0,0,0,20.75,9.67Zm0-4.67A.76.76,0,0,0,20,4.25H4a.75.75,0,0,0,0,1.5H20A.76.76,0,0,0,20.75,5Z"></path></svg>
                    </button>
                  </div>
                  <button className="btn-icon" title="Configuración">
                    <svg height="20" width="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2,8.86s0,0,0-.08a.53.53,0,0,0,0,.13S2,9,2,9ZM21.74,14.8a3.24,3.24,0,0,1-1.43-3.39,3.2,3.2,0,0,1,1.43-2.05.75.75,0,0,0,.25-1L20.14,5.19a.75.75,0,0,0-1-.3,3.25,3.25,0,0,1-2,.24,3.21,3.21,0,0,1-2.54-2.92.75.75,0,0,0-.75-.7H10.17a.74.74,0,0,0-.75.69,2.44,2.44,0,0,1-.07.46A3.17,3.17,0,0,1,8,4.68a3.24,3.24,0,0,1-2.41.45,3.7,3.7,0,0,1-.71-.23.75.75,0,0,0-1,.29L2,8.33a.72.72,0,0,0-.1.38v.07s0,.06,0,.08A.5.5,0,0,0,2,9a.58.58,0,0,0,.14.24.61.61,0,0,0,.15.12l.14.1a3.18,3.18,0,0,1,1.31,3.3A3.15,3.15,0,0,1,2.28,14.8a.75.75,0,0,0-.25,1v0L3.87,19a.75.75,0,0,0,1,.29,3.26,3.26,0,0,1,2-.24,3.21,3.21,0,0,1,2.53,2.8.75.75,0,0,0,.74.67h3.71a.76.76,0,0,0,.75-.67c0-.11,0-.22.05-.33A3.22,3.22,0,0,1,18.46,19a4.56,4.56,0,0,1,.71.24.75.75,0,0,0,1-.3L22,15.81A.75.75,0,0,0,21.74,14.8Zm-2.58,2.87a2.79,2.79,0,0,0-.39-.1A4.7,4.7,0,0,0,13.24,21H10.78a4.68,4.68,0,0,0-3.59-3.43,4.57,4.57,0,0,0-2.35.1l-1.17-2A4.69,4.69,0,0,0,5.2,13.06,4.72,4.72,0,0,0,3.66,8.51l1.19-2,.39.09A4.69,4.69,0,0,0,10.81,3h2.38a4.71,4.71,0,0,0,3.63,3.58,4.64,4.64,0,0,0,2.34-.1l1.2,2a4.7,4.7,0,0,0,0,7.1ZM12,8a4.09,4.09,0,1,0,4.09,4.09A4.1,4.1,0,0,0,12,8Zm0,6.68a2.59,2.59,0,1,1,2.59-2.59A2.6,2.6,0,0,1,12,14.67ZM2.42,9.45a.38.38,0,0,1-.13-.06.71.71,0,0,1-.35-.48.53.53,0,0,1,0-.13s0,.06,0,.08L2,9H2a.58.58,0,0,0,.14.24.61.61,0,0,0,.15.12Z"></path></svg>
                  </button>
                  <button className="btn-icon" style={{ marginLeft: 8 }} onClick={() => fetchContents(currentPath)} title="Actualizar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
                  </button>
                </div>
              </div>

              {loading ? <div className="loading"><div className="adsk-spinner" style={{ margin: '0 auto' }} /><span>Cargando...</span></div> :
                (folders.length === 0 && files.length === 0) ? (
                  <div className="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>
                    <p style={{ marginTop: 8 }}>Esta carpeta está vacía.</p>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}></th>
                          <th style={{ width: 387 }}>Nombre ↑</th>
                          <th style={{ width: 160 }}>Descripción</th>
                          <th style={{ width: 100 }}>Versión</th>
                          <th style={{ width: 150 }}>Indicadores</th>
                          <th style={{ width: 85 }}>Marcas de revisión</th>
                          <th style={{ width: 85 }}>Incidencias</th>
                          <th style={{ width: 85 }}>Tamaño</th>
                          <th style={{ width: 150 }}>Últ. actualización</th>
                          <th style={{ width: 150 }}>Actualizado por</th>
                          <th style={{ width: 160 }}>Versión añadida por</th>
                          <th style={{ width: 150 }}>Estado de revisión</th>
                        </tr>
                      </thead>
                      <tbody>
                        {folders.map(f => (
                          <tr key={f.fullName} className={selected.has(f.fullName) ? 'selected' : ''}>
                            <td>{isAdmin && <input type="checkbox" checked={selected.has(f.fullName)} onChange={() => toggle(f.fullName)} />}</td>
                            <td><div className="name-cell" onClick={() => navigate(f.fullName)}>
                              <span className="icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="1.5"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg></span>
                              <span>{f.name.replace(/\/$/, '')}</span>
                            </div></td>
                            <td></td>
                            <td style={{ color: '#aaa' }}>--</td>
                            <td></td>
                            <td style={{ color: '#aaa' }}>--</td>
                            <td style={{ color: '#aaa' }}>--</td>
                            <td style={{ color: '#aaa' }}>--</td>
                            <td style={{ color: '#aaa' }}>--</td>
                            <td style={{ color: '#aaa' }}>--</td>
                            <td style={{ color: '#aaa' }}>--</td>
                            <td style={{ color: '#aaa' }}>--</td>
                          </tr>
                        ))}
                        {files.map(f => (
                          <tr key={f.fullName} className={selected.has(f.fullName) ? 'selected' : ''}>
                            <td>{isAdmin && <input type="checkbox" checked={selected.has(f.fullName)} onChange={() => toggle(f.fullName)} />}</td>
                            <td><div className="name-cell" onClick={() => { setActiveFile(f); setViewedVersionInfo(null); setShowVersions(false); }}>
                              <span className="icon">
                                {f.name.toLowerCase().endsWith('.pdf') ? (
                                  <svg xmlns="http://www.w3.org/2000/svg" xmlSpace="preserve" viewBox="0 0 32 32" width="24" height="24">
                                    <path fill="#5C7896" d="M3 1v30h26V8h-7V1z"></path>
                                    <path fill="#FFF" d="M4 2v20h24V8h-6V2z"></path>
                                    <path fill="#1B3F63" d="m29 15-7-7h7z" opacity="0.3"></path>
                                    <path fill="#769CC2" d="m22 1 7 7h-7z"></path>
                                    <g fill="#FFF">
                                      <path d="M10.1 29v-4.7h1.7c1 0 1.9.4 1.9 1.4 0 1.1-.9 1.5-1.9 1.5h-.6V29zm1-2.4h.4c.6 0 1.1-.1 1.1-.8 0-.6-.4-.8-1-.8h-.4v1.6zM14.3 29v-4.7h1.6c1.5 0 2.5.7 2.5 2.3S17.3 29 15.8 29zm1-.7h.3c1.1 0 1.7-.6 1.7-1.7 0-1-.6-1.6-1.5-1.6h-.4v3.3zM19.2 29v-4.7h3v.7h-2v1.3h1.9v.7h-1.9v2z"></path>
                                    </g>
                                    <g fill="#5C7896">
                                      <path d="M16 5h5v2h-5zM16 9h8v2h-8zM8 13h16v2H8zM8 17h12v2H8zM8 5h6v6H8z"></path>
                                    </g>
                                  </svg>
                                ) : f.name.toLowerCase().endsWith('.docx') || f.name.toLowerCase().endsWith('.doc') ? (
                                  <i style={{ width: 24, height: 24, display: 'inline-block' }}>
                                    <img src="https://static2.sharepointonline.com/files/fabric-cdn-prod_20200430.002/assets/item-types/16/docx.svg" height="100%" width="100%" alt="docx" />
                                  </i>
                                ) : f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls') ? (
                                  <i style={{ width: 24, height: 24, display: 'inline-block' }}>
                                    <img src="https://static2.sharepointonline.com/files/fabric-cdn-prod_20200430.002/assets/item-types/16/xlsx.svg" height="100%" width="100%" alt="xlsx" />
                                  </i>
                                ) : f.name.toLowerCase().endsWith('.pptx') || f.name.toLowerCase().endsWith('.ppt') ? (
                                  <i style={{ width: 24, height: 24, display: 'inline-block' }}>
                                    <img src="https://static2.sharepointonline.com/files/fabric-cdn-prod_20200430.002/assets/item-types/16/pptx.svg" height="100%" width="100%" alt="pptx" />
                                  </i>
                                ) : (
                                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0696D7" strokeWidth="1.5">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline>
                                  </svg>
                                )}
                              </span>
                              <span>{f.name}</span>
                            </div></td>
                            <td></td>
                            <td><span className="version-badge">{f.version || 'V1'}</span></td>
                            <td></td>
                            <td style={{ color: '#aaa' }}>--</td>
                            <td style={{ color: '#aaa' }}>--</td>
                            <td>{formatSize(f.size)}</td>
                            <td>{formatDate(f.updated)}</td>
                            <td><div className="user-cell"><div className="avatar">{getInitials(user.name)}</div><span>{user.name.toUpperCase()}</span></div></td>
                            <td><div className="user-cell"><div className="avatar">{getInitials(user.name)}</div><span>{user.name.toUpperCase()}</span></div></td>
                            <td style={{ color: '#aaa' }}>--</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          </div>
        </main>
      </div>

      {showNewFolder && isAdmin && (
        <div className="modal-overlay" onClick={() => setShowNewFolder(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>📁 Nueva Carpeta</h3>
            <input autoFocus placeholder="Nombre" value={folderName} onChange={e => setFolderName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createFolder()} />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowNewFolder(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={createFolder}>Crear</button>
            </div>
          </div>
        </div>
      )}

      {activeFile && (
        <div className="file-viewer-overlay">
          <div className="file-viewer-header">
            <div className="file-viewer-title" style={{ position: 'relative' }}>
              {activeFile.name}
              <span
                className="file-viewer-version"
                onClick={() => setShowVersions(!showVersions)}
                style={{ cursor: 'pointer', userSelect: 'none', background: (viewedVersionInfo && viewedVersionInfo.version !== (activeFile.version || 'V1')) ? '#333' : '#EBEBEB', color: (viewedVersionInfo && viewedVersionInfo.version !== (activeFile.version || 'V1')) ? '#fff' : '#333' }}
              >
                {viewedVersionInfo ? viewedVersionInfo.version : (activeFile.version || 'V1')}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: showVersions ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', marginLeft: 4 }}>
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </span>

              <span style={{
                marginLeft: 8,
                fontSize: 11,
                fontWeight: 'bold',
                color: (!viewedVersionInfo || viewedVersionInfo.version === (activeFile.version || 'V1')) ? '#52c41a' : '#ff4d4f',
                background: (!viewedVersionInfo || viewedVersionInfo.version === (activeFile.version || 'V1')) ? '#f6ffed' : '#fff1f0',
                border: `1px solid ${(!viewedVersionInfo || viewedVersionInfo.version === (activeFile.version || 'V1')) ? '#b7eb8f' : '#ffa39e'}`,
                padding: '2px 8px',
                borderRadius: 4,
                textTransform: 'uppercase'
              }}>
                {(!viewedVersionInfo || viewedVersionInfo.version === (activeFile.version || 'V1')) ? '(ACTUAL)' : '(NO ACTUAL)'}
              </span>

              {showVersions && (
                <div className="version-popover" onClick={e => e.stopPropagation()}>
                  {loadingVersions ? (
                    <div style={{ padding: 20, textAlign: 'center' }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
                  ) : (
                    <>
                      {versionHistory.map((v, i) => (
                        <div
                          key={i}
                          className="version-popover-item"
                          onClick={() => { setViewedVersionInfo({ version: v.version, urn: v.details.gcs_urn }); setShowVersions(false); }}
                          style={{
                            cursor: 'pointer',
                            borderLeftColor: (viewedVersionInfo ? viewedVersionInfo.version === v.version : i === 0) ? '#0696D7' : '#ccc',
                            background: (viewedVersionInfo ? viewedVersionInfo.version === v.version : i === 0) ? '#f6faff' : '#fcfcfc',
                            transition: 'background 0.2s'
                          }}
                        >
                          <div className="v-tag">{v.version}</div>
                          <div className="v-info">
                            <div className="v-name" title={activeFile.name}>
                              {activeFile.name.length > 25 ? activeFile.name.substring(0, 22) + '...' : activeFile.name}
                            </div>
                            <div className="v-meta">
                              Cargado por <strong>{v.performed_by}</strong> el {new Date(v.created_at).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      ))}
                      {versionHistory.length === 0 && (
                        <div style={{ fontSize: 11, color: '#999', textAlign: 'center', padding: 8 }}>No hay historial disponible</div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="file-viewer-center">
              <span style={{ fontSize: 13, display: 'flex', alignItems: 'center' }}>Página <svg style={{ marginLeft: 6, marginRight: 2 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="15 18 9 12 15 6"></polyline></svg> <input type="text" defaultValue="1" style={{ width: 32, height: 24, textAlign: 'center', border: '1px solid #ccc', margin: '0 4px', borderRadius: 2 }} disabled /> <svg style={{ marginRight: 6, marginLeft: 2 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="9 18 15 12 9 6"></polyline></svg> de 1</span>
            </div>
            <div className="file-viewer-actions">
              <button className="file-viewer-close" onClick={() => { setActiveFile(null); setShowVersions(false); }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 6L6 18M6 6l12 12"></path></svg>
              </button>
            </div>
          </div>
          <iframe
            className="file-viewer-content"
            src={(() => {
              const baseUrl = viewedVersionInfo
                ? `${API}/api/docs/view?urn=${encodeURIComponent(viewedVersionInfo.urn)}`
                : (activeFile.mediaLink || activeFile.url || `${API}/api/docs/view?path=${encodeURIComponent(activeFile.fullName)}`);
              const ext = activeFile.name.toLowerCase().split('.').pop();
              if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
                return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(baseUrl)}`;
              }
              return baseUrl;
            })()}
            title={activeFile.name}
          />
        </div>
      )}

      {/* MOVE MODALS */}
      {moveState.step === 1 && (
        <div className="modal-overlay" onClick={() => setMoveState({ step: 0, items: [], destPath: '' })} style={{ zIndex: 999999 }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 450 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 400 }}>¿Mover carpeta?</h3>
              <button onClick={() => setMoveState({ step: 0, items: [], destPath: '' })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: '#333', lineHeight: 1.5, marginBottom: 24 }}>La carpeta conservará los permisos y los suscriptores de la carpeta de destino. Los suscriptores de la carpeta actual no se conservarán.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn btn-outline" style={{ border: '1px solid #dcdcdc', padding: '6px 16px', borderRadius: 4, background: '#fff', cursor: 'pointer' }} onClick={() => setMoveState({ step: 0, items: [], destPath: '' })}>Cancelar</button>
              <button className="btn-main-blue" style={{ padding: '6px 16px' }} onClick={() => setMoveState({ ...moveState, step: 2 })}>Continuar</button>
            </div>
          </div>
        </div>
      )}

      {moveState.step === 2 && (
        <div className="modal-overlay" onClick={() => setMoveState({ step: 0, items: [], destPath: '' })} style={{ zIndex: 999999 }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 500, padding: 0, display: 'flex', flexDirection: 'column', height: 500 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #e0e0e0' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 400 }}>Seleccionar carpeta de destino</h3>
              <button onClick={() => setMoveState({ step: 0, items: [], destPath: '' })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 8px' }}>
              <SelectFolderNode
                folder={{ name: 'Archivos de proyecto', fullName: projectPrefix }}
                defaultExpanded={true}
                selectedPath={moveState.destPath}
                onSelect={(path) => setMoveState({ ...moveState, destPath: path })}
              />
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #e0e0e0', display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center', background: '#fcfcfc' }}>
              <span style={{ fontSize: 12, color: '#0696D7', marginRight: 'auto', display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <span>❓</span> ¿Estos archivos se sincronizan?
              </span>
              <button className="btn btn-outline" style={{ border: 'none', color: '#0696D7', fontSize: 13, background: 'transparent', cursor: 'pointer', fontWeight: 500 }} onClick={() => setMoveState({ step: 0, items: [], destPath: '' })}>Cancelar</button>
              <button className="btn-main-blue" style={{ padding: '6px 16px', opacity: moveState.destPath ? 1 : 0.5 }} disabled={!moveState.destPath} onClick={handleExecuteMove}>
                {loading ? 'Moviendo...' : 'Desplazar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showUploadModal && isAdmin && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)} style={{ zIndex: 999999 }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 600, padding: 0, display: 'flex', flexDirection: 'column', height: 500 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #e0e0e0' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 400 }}>Cargar archivos</h3>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                <button onClick={() => setShowUploadModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>
            </div>

            <div style={{ padding: '24px' }}>
              <button
                className="btn btn-outline"
                style={{ width: '100%', padding: '12px', border: '1px solid #ccc', borderRadius: 4, background: '#fff', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, fontSize: 14, color: '#333' }}
                onClick={() => fileRef.current?.click()}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="15" x2="21" y2="15"></line></svg>
                Desde su equipo
              </button>
            </div>

            <div
              style={{ flex: 1, margin: '0 24px 24px 24px', border: '1px dashed #ccc', borderRadius: 4, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: dragOver ? '#f0f8ff' : '#fafafa' }}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); setShowUploadModal(false); }}
            >
              {uploading ? (
                <div className="loading"><div className="adsk-spinner" style={{ margin: '0 auto', marginBottom: 16 }} /><span>Subiendo archivos...</span></div>
              ) : (
                <>
                  <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1" style={{ marginBottom: 16 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                  <span style={{ color: '#888', fontSize: 14 }}>Arrastre archivos aquí o elija una opción arriba</span>
                </>
              )}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fcfcfc' }}>
              <span style={{ fontSize: 13, color: '#0696D7', display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <span style={{ border: '1px solid #0696D7', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>?</span> ¿Estos archivos se sincronizan con el dispositivo móvil?
              </span>
              <button
                className="btn btn-outline"
                style={{ padding: '8px 24px', background: '#f0f0f0', border: '1px solid #dcdcdc', borderRadius: 4, cursor: 'pointer', color: '#999', fontWeight: 500 }}
                onClick={() => setShowUploadModal(false)}
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
      {uploadProgress.total > 0 && (
        <div className="upload-toast">
          <div className="spinner"></div>
          <span>Cargando {uploadProgress.current}/{uploadProgress.total} archivos...</span>
        </div>
      )}
    </div>
  );
}
// ─────────────────────────────────────
// MAIN APP ROUTER
// ─────────────────────────────────────
export default function App() {
  const { user, saveUser, logout } = useUser();
  const [selectedProject, setSelectedProject] = useState(null);

  if (!user) return <LoginScreen onLogin={saveUser} />;

  if (!selectedProject) {
    return <SecureProjectsPage user={user} onSelectProject={setSelectedProject} onLogout={logout} />;
  }

  return <FilesPage project={selectedProject} user={user} onBack={() => setSelectedProject(null)} />;
}
