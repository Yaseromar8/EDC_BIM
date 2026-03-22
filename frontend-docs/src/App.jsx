import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Capacitor } from '@capacitor/core';
import MatrixTable from './MatrixTable';

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
function FolderNode({ folder, currentPath, onNavigate, projectPrefix, level = 1, defaultExpanded = false, onCreateSubfolder, isAdmin, onTreeRefresh, onGlobalRefresh, refreshSignal = 0, onInitiateMove, collapseSignal = 0, onReset }) {
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

  useEffect(() => {
    if (collapseSignal > 0 && level > 0) {
      setExpanded(false);
    }
  }, [collapseSignal, level]);

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
        onClick={() => {
          onNavigate(folder.fullName);
          if (level === 0 && onReset) onReset();
        }}
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
            <input 
              autoFocus 
              value={renameValue} 
              onChange={e => setRenameValue(e.target.value)} 
              onBlur={() => submitRename()}
              onKeyDown={e => { 
                if (e.key === 'Enter') submitRename(); 
                if (e.key === 'Escape') setIsRenaming(false); 
              }} 
            />
            <button onMouseDown={(e) => { e.preventDefault(); setIsRenaming(false); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"></path></svg></button>
            <button onMouseDown={(e) => { e.preventDefault(); submitRename(); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"></path></svg></button>
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
            <svg height="20" width="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path>
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
              collapseSignal={collapseSignal}
              onReset={onReset}
            />
          ))}
          {isCreatingChild && (
            <div className="folder-tree-item child-active" style={{ paddingLeft: `${8 + ((level + 1) * 28)}px` }}>
              <div style={{ width: 24, height: 24 }}></div>
              <div className="tree-icon" style={{ display: 'flex', alignItems: 'center', marginLeft: 4, marginRight: 8 }}>
                <svg fill="currentColor" viewBox="0 0 24 24" width="24" height="24"><path d="M18,20.45H6a3.6,3.6,0,0,1-3.6-3.6V7.15A3.6,3.6,0,0,1,6,3.55h4.84a.71.71,0,0,1,.53.22l2.12,2.1H18a3.61,3.61,0,0,1,3.6,3.61v7.37A3.6,3.6,0,0,1,18,20.45ZM3.89,9.48v7.37A2.1,2.1,0,0,0,6,19H18a2.1,2.1,0,0,0,2.1-2.1V9.48A2.1,2.1,0,0,0,18,7.37H13.17a.75.75,0,0,1-.53-.22l-2.12-2.1H6a2.1,2.1,0,0,0-2.1,2.1Z"></path></svg>
              </div>
              <div className="inline-edit-box" onClick={e => e.stopPropagation()}>
                <input 
                  autoFocus 
                  value={newChildName} 
                  onChange={e => setNewChildName(e.target.value)} 
                  onBlur={() => {
                    if (newChildName.trim()) submitCreateChild();
                    else setIsCreatingChild(false);
                  }}
                  onKeyDown={e => { 
                    if (e.key === 'Enter') submitCreateChild(); 
                    if (e.key === 'Escape') setIsCreatingChild(false); 
                  }} 
                  placeholder="Carpeta nueva" 
                />
                <button onMouseDown={(e) => { e.preventDefault(); setIsCreatingChild(false); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"></path></svg></button>
                <button onMouseDown={(e) => { e.preventDefault(); submitCreateChild(); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"></path></svg></button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────
// 3. TABLE COMPONENTS (Virtualized)
// ─────────────────────────────────────

function FilesPage({ project, user, onBack }) {
  const projectPrefix = `proyectos/${project.name.replace(/ /g, '_')}/`;
  const [currentPath, setCurrentPath] = useState(projectPrefix);
  const [isTrashMode, setIsTrashMode] = useState(false);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [activeFile, setActiveFile] = useState(null);
  const [showVersions, setShowVersions] = useState(false);
  const [viewedVersionInfo, setViewedVersionInfo] = useState(null);
  const [versionHistory, setVersionHistory] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ total: 0, current: 0 });

  const [showSopToast, setShowSopToast] = useState(false);
  const [sopHasReappeared, setSopHasReappeared] = useState(false);
  const [sopCompletionTime, setSopCompletionTime] = useState('');
  const [sopQueue, setSopQueue] = useState([]); // [{id, file, status, progress, time, batchId}]
  const [sopBatches, setSopBatches] = useState([]); // [{id, timestamp}]
  const [sopMinimized, setSopMinimized] = useState(false);
  const [uploadSopStep, setUploadSopStep] = useState('IDLE');
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [moveState, setMoveState] = useState({ step: 0, items: [], destPath: '' });
  const fileRef = useRef(null);
  const [activeRowMenu, setActiveRowMenu] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVersions, setSelectedVersions] = useState(new Set());
  const [versionRowMenu, setVersionRowMenu] = useState(null);
  const isAdmin = user.role === 'admin';

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getInitials = (name) => {
    if (!name) return '??';
    const parts = name.split(' ');
    if (parts.length >= 2) return (parts[0][0] + (parts[1][0] || '')).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  // --- SIDEBARS WIDTH STATE ---
  const [globalSidebarWidth, setGlobalSidebarWidth] = useState(240);
  const [treeSidebarWidth, setTreeSidebarWidth] = useState(300);
  const isResizingGlobal = useRef(false);
  const isResizingTree = useRef(false);

  const startGlobalResize = (e) => { isResizingGlobal.current = true; document.addEventListener('mousemove', handleGlobalResize); document.addEventListener('mouseup', stopGlobalResize); document.body.style.cursor = 'col-resize'; };
  const handleGlobalResize = (e) => { if (!isResizingGlobal.current) return; setGlobalSidebarWidth(Math.max(160, Math.min(400, e.clientX))); };
  const stopGlobalResize = () => { isResizingGlobal.current = false; document.removeEventListener('mousemove', handleGlobalResize); document.removeEventListener('mouseup', stopGlobalResize); document.body.style.cursor = 'default'; };

  const startTreeResize = (e) => { isResizingTree.current = true; document.addEventListener('mousemove', handleTreeResize); document.addEventListener('mouseup', stopTreeResize); document.body.style.cursor = 'col-resize'; };
  const handleTreeResize = (e) => { if (!isResizingTree.current) return; setTreeSidebarWidth(Math.max(200, Math.min(600, e.clientX - globalSidebarWidth))); };
  const stopTreeResize = () => { isResizingTree.current = false; document.removeEventListener('mousemove', handleTreeResize); document.removeEventListener('mouseup', stopTreeResize); document.body.style.cursor = 'default'; };

  const [columnWidths, setColumnWidths] = useState({
    checkbox: 40, name: 400, description: 150, version: 80, indicators: 150, markup: 100, issues: 80, size: 100, updated: 180, user: 150, status: 120, action: 60
  });

  const [tableShowVersions, setTableShowVersions] = useState(false);
  const [versionPanelWidth, setVersionPanelWidth] = useState(450);
  const isResizingVersion = useRef(false);

  const startVersionResize = (e) => {
    isResizingVersion.current = true;
    document.addEventListener('mousemove', handleVersionResize);
    document.addEventListener('mouseup', stopVersionResize);
    document.body.style.cursor = 'col-resize';
  };
  const handleVersionResize = (e) => {
    if (!isResizingVersion.current) return;
    const newWidth = window.innerWidth - e.clientX;
    setVersionPanelWidth(Math.max(400, Math.min(window.innerWidth * 0.95, newWidth)));
  };
  const stopVersionResize = () => {
    isResizingVersion.current = false;
    document.removeEventListener('mousemove', handleVersionResize);
    document.removeEventListener('mouseup', stopVersionResize);
    document.body.style.cursor = 'default';
  };
  const [versionAnchor, setVersionAnchor] = useState({ x: 0, y: 0 });
  const [versionTarget, setVersionTarget] = useState(null);

  const startResizing = (e, column) => {
    e.preventDefault();
    const startX = e.pageX;
    const startWidth = columnWidths[column];
    const onMouseMove = (moveEvent) => {
      const currentWidth = startWidth + (moveEvent.pageX - startX);
      setColumnWidths(prev => ({ ...prev, [column]: Math.max(currentWidth, 40) }));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const totalTableWidth = Object.values(columnWidths).reduce((a, b) => a + b, 0);

  const onShowVersions = (f, e) => {
    setVersionTarget(f);
    setTableShowVersions(true);
    setVersionAnchor({ x: e.clientX - 350, y: Math.min(e.clientY, window.innerHeight - 400) });
    fetchVersionHistory(f);
  };

  const fetchVersionHistory = async (item) => {
    setLoadingVersions(true);
    setVersionHistory([]);
    try {
      const resp = await fetch(`${API}/api/docs/versions?id=${item.id || encodeURIComponent(item.fullName)}`);
      const data = await resp.json();
      if (data.success) setVersionHistory(data.versions || []);
    } catch (e) { console.error(e); }
    finally { setLoadingVersions(false); }
  };

  const handlePromote = async (version) => {
    if (!versionTarget) return;
    try {
      const resp = await fetch(`${API}/api/docs/versions/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: versionTarget.id, version_id: version.id, user: user?.name })
      });
      if (resp.ok) {
        setTableShowVersions(false);
        triggerRefresh();
      }
    } catch (e) { console.error(e); }
  };

  const fetchContents = useCallback(async (path, trash = false, silent = false) => {
    if (!silent) {
      setLoading(true);
      setFolders([]);
      setFiles([]);
    }
    try {
      const endpoint = trash ? '/api/docs/deleted' : `/api/docs/list?path=${encodeURIComponent(path)}`;
      const res = await fetch(`${API}${endpoint}`);
      if (res.ok) {
        const response = await res.json();
        const data = response.data || {};
        setFolders((data.folders || []).map(f => ({...f, type: 'folder'})).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })));
        setFiles((data.files || []).map(f => ({...f, type: 'file'})).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })));
      }
    } catch (e) { console.error(e); }
    finally { if (!silent) setLoading(false); }
  }, []);

  const triggerRefresh = (path = currentPath) => { fetchContents(path, isTrashMode, true); setRefreshSignal(prev => prev + 1); };

  useEffect(() => { fetchContents(currentPath, isTrashMode); }, [currentPath, isTrashMode, fetchContents]);

  const navigate = (path) => {
    if (path === currentPath) return;
    setLoading(true);
    setFolders([]); 
    setFiles([]); 
    setCurrentPath(path); 
    setSelected(new Set()); 
    setIsTrashMode(false);
  };

  const getSopFileIcon = (filename) => {
    if (!filename) return { color: '#888', type: 'file' };
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') return { color: '#5C7896', type: 'pdf' };
    if (['doc', 'docx'].includes(ext)) return { color: '#2b579a', type: 'word' };
    if (['xls', 'xlsx', 'csv'].includes(ext)) return { color: '#217346', type: 'excel' };
    if (['ppt', 'pptx'].includes(ext)) return { color: '#d24726', type: 'ppt' };
    if (['jpg', 'jpeg', 'png', 'svg', 'webp', 'gif'].includes(ext)) return { color: '#5C7896', type: 'image' };
    if (ext === 'txt') return { color: '#5C7896', type: 'txt' };
    return { color: '#5C7896', type: 'file' };
  };

  const renderFileIconSop = (filename, size = 24) => {
    const { type } = getSopFileIcon(filename);
    const lowerName = filename?.toLowerCase() || '';

    // EXCEL
    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      return (
        <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="https://res.cdn.office.net/files/fabric-cdn-prod_20251107.003/assets/item-types/16_1.5x/xlsx.svg" style={{ width: '100%', height: '100%' }} alt="xlsx" />
        </div>
      );
    }

    // WORD
    if (lowerName.endsWith('.docx') || lowerName.endsWith('.doc')) {
      return (
        <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="https://res.cdn.office.net/files/fabric-cdn-prod_20251107.003/assets/item-types/16_1.5x/docx.svg" style={{ width: '100%', height: '100%' }} alt="docx" />
        </div>
      );
    }

    // PPT
    if (lowerName.endsWith('.pptx') || lowerName.endsWith('.ppt')) {
      return (
        <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="https://res.cdn.office.net/files/fabric-cdn-prod_20251107.003/assets/item-types/16_1.5x/pptx.svg" style={{ width: '100%', height: '100%' }} alt="pptx" />
        </div>
      );
    }

    // PDF (Extracted from ACC Source)
    if (type === 'pdf') {
       return (
         <div style={{ width: size, height: size, flexShrink: 0 }}>
           <svg viewBox="0 0 32 32" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
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
         </div>
       );
    }

    // IMAGE / GIF (Authentic Paths from Image 1)
    if (type === 'image') {
       return (
         <div style={{ width: size, height: size }}>
           <svg viewBox="0 0 32 32" width="100%" height="100%">
             <path fill="#5C7896" d="M3 1v30h26V8h-7V1z"></path>
             <path fill="#1B3F63" d="m29 15-7-7h7z" opacity="0.3"></path>
             <path fill="#769CC2" d="m22 1 7 7h-7z"></path>
             <rect fill="#FFF" x="6" y="11" width="18" height="15"></rect>
             <path fill="#5C7896" d="M7 12h16v13H7z"></path>
             <circle fill="#FFF" cx="19.5" cy="15" r="1.5"></circle>
             <path fill="#FFF" d="m9 23 4-4 2 2 3-3 4 4v1H9z"></path>
           </svg>
         </div>
       );
    }

    // TXT (Authentic Paths from Image 1)
    if (type === 'txt') {
      return (
        <div style={{ width: size, height: size }}>
          <svg viewBox="0 0 32 32" width="100%" height="100%">
            <path fill="#5C7896" d="M3 1v30h26V8h-7V1z"></path>
            <path fill="#FFF" d="M4 2v20h24V8h-6V2z"></path>
            <path fill="#1B3F63" d="m29 15-7-7h7z" opacity="0.3"></path>
            <path fill="#769CC2" d="m22 1 7 7h-7z"></path>
            <g fill="#5C7896">
              <path d="M8 11h16v2H8zM8 15h16v2H8zM8 19h10v2H8z"></path>
            </g>
          </svg>
        </div>
      );
    }

    // DEFAULT FALLBACK
    return (
      <div style={{ width: size, height: size }}>
        <svg viewBox="0 0 32 32" width="100%" height="100%">
          <path fill="#769CC2" d="m22 1 7 7h-7z"></path>
          <path fill="#5C7896" d="M3 1v30h26V8h-7V1z"></path>
          <path fill="#1B3F63" d="m29 15-7-7h7z" opacity="0.3"></path>
          <path fill="#FFF" d="M4 2v20h24V8h-6V2z"></path>
           <g fill="#FFF">
             <text x="16" y="28" textAnchor="middle" fontSize="6px" fontWeight="800" fontFamily="sans-serif">{type.toUpperCase()}</text>
           </g>
        </svg>
      </div>
    );
  };

  const handleSopUpload = async (fileList) => {
    if (!isAdmin || !fileList?.length) return;
    const batchId = Date.now().toString();
    const newItems = Array.from(fileList).map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      status: 'PROCESANDO_1',
      progress: 0,
      time: '',
      batchId
    }));

    setSopBatches(prev => [{ id: batchId, timestamp: new Date().toLocaleString() }, ...prev]);
    setSopQueue(prev => [...newItems, ...prev]);
    setUploadSopStep('PROCESANDO_1');
    setShowUploadModal(true);

    newItems.forEach(item => {
      const fd = new FormData(); 
      fd.append('file', item.file); 
      fd.append('path', currentPath); 
      fd.append('user', user.name); 
      fd.append('model_urn', 'global');

      const xhr = new XMLHttpRequest();
      console.log(`[Upload] Starting POST to ${API}/api/docs/upload for ${item.file.name} (${item.file.size} bytes)`);
      xhr.open('POST', `${API}/api/docs/upload`, true);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.floor((e.loaded / e.total) * 100);
          console.log(`[Upload Progress] ${item.file.name}: ${percent}% (${e.loaded}/${e.total})`);
          
          if (percent >= 100) {
            // Already at 100% physical transfer, show "Syncing" indeterminate bar
            setSopQueue(q => q.map(it => it.id === item.id ? { ...it, progress: 100, status: 'PROCESANDO_1' } : it));
          } else {
            setSopQueue(q => q.map(it => it.id === item.id ? { ...it, progress: percent, status: 'BARRA_AZUL' } : it));
          }
        } else {
          console.log(`[Upload Progress] ${item.file.name}: progress not computable`);
        }
      };

      xhr.onload = async () => {
        console.log(`[Upload Finish] ${item.file.name}: Status ${xhr.status}`);
        if (xhr.status === 200 || xhr.status === 201) {
          try {
            const resp = JSON.parse(xhr.responseText);
            console.log(`[Upload Success] ${item.file.name}:`, resp);
          } catch(e) {}
          
          // Ensure we are in PROCESANDO_1 state
          setSopQueue(q => q.map(it => it.id === item.id ? { ...it, status: 'PROCESANDO_1', progress: 100 } : it));
          
          // These are the "Fake" processing delays that happen AFTER physical GCS upload is done
          await new Promise(r => setTimeout(r, 4000));
          
          setSopQueue(q => q.map(it => it.id === item.id ? { ...it, status: 'PROCESO_PENDIENTE', progress: 100 } : it));
          await new Promise(r => setTimeout(r, 4000));

          const now = new Date();
          const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const dateStr = now.toLocaleDateString();
          setSopQueue(q => q.map(it => it.id === item.id ? { ...it, status: 'LISTO_1', progress: 100, time: `el ${dateStr} a las ${timeStr}` } : it));
          setUploadSopStep('LISTO_1');
          triggerRefresh();
        } else {
          console.error(`[Upload Error] ${item.file.name}: ${xhr.status} - ${xhr.responseText}`);
          setSopQueue(q => q.map(it => it.id === item.id ? { ...it, status: 'ERROR' } : it));
        }
      };

      xhr.onerror = () => {
        console.error(`[Upload Fatal Error] ${item.file.name}: Network failure`);
        setSopQueue(q => q.map(it => it.id === item.id ? { ...it, status: 'ERROR' } : it));
      };

      setTimeout(() => {
        xhr.send(fd);
      }, 500);
    });
  };

  const handleSopListo = () => {
    setShowUploadModal(false);
    setUploadSopStep('IDLE');
    setSopQueue([]);
    setSopBatches([]);
    triggerRefresh();
    if (uploadSopStep === 'LISTO_1') {
      setShowSopToast(true);
      setTimeout(() => setShowSopToast(false), 3000);
    }
  };

  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) handleSopUpload(e.dataTransfer.files); };

  const createFolder = async () => {
    if (!isAdmin || !folderName.trim()) return;
    try { await fetch(`${API}/api/docs/folder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: currentPath + folderName.trim() }) }); } catch (e) { }
    setShowNewFolder(false); setFolderName(''); triggerRefresh();
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
    let baseName = isFolder ? fullName.slice(0, -1) : fullName;
    const parts = baseName.split('/');
    const oldName = parts[parts.length - 1];
    const newNameRaw = window.prompt(`Renombrar '${oldName}' a:`, oldName);
    if (!newNameRaw || newNameRaw.trim() === '' || newNameRaw === oldName) return;
    parts[parts.length - 1] = newNameRaw.trim();
    let newNamePath = parts.join('/') + (isFolder ? '/' : '');
    try { await fetch(`${API}/api/docs/rename`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldName: fullName, newName: newNamePath }) }); } catch (e) { }
    triggerRefresh();
  };

  const handleExecuteMove = async () => {
    if (!isAdmin || !moveState.destPath || !moveState.items.length) return;
    for (const fullName of moveState.items) {
      try { await fetch(`${API}/api/docs/move`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName: fullName, destPath: moveState.destPath, user: user?.email }) }); } catch (e) { }
    }
    setMoveState({ step: 0, items: [], destPath: '' }); setSelected(new Set()); triggerRefresh();
  };

  const toggle = (name) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(name)) s.delete(name); else s.add(name);
      return s;
    });
  };

  const filteredFolders = folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="acc-root" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: '#fff' }}>
      <div className="acc-top-strip" style={{ height: 24, background: '#000', flexShrink: 0 }} />
      <header className="acc-top-header" style={{ height: 48, borderBottom: '1px solid #dcdcdc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0 }}>
        <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="module-selector" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#0696d7', fontWeight: 600 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 12l2.12 2.12L12 6.24l7.88 7.88L22 12 12 2z"/>
            </svg>
            <span style={{ fontSize: 14 }}>Docs</span>
          </div>
          <div className="separator-line" style={{ width: 1, height: 20, background: '#eee', margin: '0 8px' }} />
          <div className="project-selector" style={{ fontSize: 14, fontWeight: 600, color: '#333', textTransform: 'uppercase' }}>
            <span>{project.name}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 4 }}><path d="M7 10l5 5 5-5H7z"/></svg>
          </div>
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="header-nav-item" style={{ width: 24, height: 24, borderRadius: '50%', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#666', cursor: 'pointer' }}>?</div>
          <div className="header-user">
             <div className="header-avatar" style={{ width: 32, height: 32, borderRadius: '50%', background: '#ff6b35', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>{getInitials(user.name)}</div>
          </div>
        </div>
      </header>

      <main className="acc-main-layout" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* GLOBAL SIDEBAR */}
        <div className="Box__StyledBox-sc-1gnk1ba-0 cFPGUB" style={{ width: globalSidebarWidth, flexShrink: 0, borderRight: '1px solid #dcdcdc', background: '#fff', display: 'flex', flexDirection: 'column' }}>
          <div className="Box__StyledBox-sc-1gnk1ba-0 hhhhUH" style={{ flex: 1, overflowY: 'auto' }}>
            <ul data-testid="SideNavigationList" style={{ listStyle: 'none', padding: '8px 0', margin: 0 }}>
              {[
                { label: 'Archivos', icon: 'files.svg', active: true },
                { label: 'Informes', icon: 'reports.svg' },
                { label: 'Miembros', icon: 'members.svg' },
                { label: 'Configuración', icon: 'settings.svg' }
              ].map((item, idx) => (
                <li key={idx} style={{ marginBottom: 2 }}>
                  <a 
                    href="#" 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 12, 
                      padding: '10px 16px', 
                      textDecoration: 'none', 
                      background: item.active ? '#e6f4fb' : 'transparent', 
                      color: item.active ? '#0696d7' : '#333', 
                      borderLeft: `4px solid ${item.active ? '#0696d7' : 'transparent'}`,
                      fontSize: 13,
                      fontWeight: item.active ? 600 : 400
                    }}
                  >
                    <div style={{ width: 22, height: 22, background: item.active ? '#0696d7' : '#666', maskImage: `url('https://bim360-ea-ue1-prod-storage.s3.amazonaws.com/tools/${item.icon}')`, maskSize: '100% 100%', WebkitMaskImage: `url('https://bim360-ea-ue1-prod-storage.s3.amazonaws.com/tools/${item.icon}')`, WebkitMaskSize: '100% 100%', WebkitMaskRepeat: 'no-repeat' }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="sidebar-bottom" style={{ padding: '12px 16px', borderTop: '1px solid #eee' }}>
            <button onClick={() => setGlobalSidebarWidth(globalSidebarWidth > 100 ? 60 : 240)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>
               <svg height="24" width="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20.75,12a.75.75,0,0,1-.75.75H10.49L12.76,15a.74.74,0,0,1,0,1.06.75.75,0,0,1-.53.22.79.79,0,0,1-.53-.22L8.15,12.53A.78.78,0,0,1,8,12.29a.73.73,0,0,1,0-.58.78.78,0,0,1,.16-.24L11.7,7.92a.75.75,0,0,1,1.06,0,.74.74,0,0,1,0,1.06l-2.27,2.27H20A.76.76,0,0,1,20.75,12Zm-16,8V4a.75.75,0,0,0-1.5,0V20a.75.75,0,0,0,1.5,0Z"></path></svg>
            </button>
          </div>
        </div>

        {/* CONTENT AREA */}
        <div className="acc-docs-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <header style={{ padding: '24px 24px 0 24px', flexShrink: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 300, marginBottom: 16 }}>Archivos</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #dcdcdc' }}>
              <div style={{ display: 'flex', gap: 32 }}>
                <div style={{ paddingBottom: 8, fontSize: 13, borderBottom: '2px solid #0696d7', color: '#0696d7', fontWeight: 600, cursor: 'pointer' }}>Carpetas</div>
                <div style={{ paddingBottom: 8, fontSize: 13, color: '#999', cursor: 'pointer' }}>Conjuntos</div>
              </div>
              <div style={{ display: 'flex', gap: 20, paddingBottom: 8 }}>
                 {(isTrashMode && selected.size > 0) ? (
                   <button style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0696d7', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', padding: '6px 16px', borderRadius: 4, fontWeight: 500 }}>
                     Restaurar ({selected.size})
                   </button>
                 ) : (
                   <button onClick={() => setIsTrashMode(!isTrashMode)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: isTrashMode ? '#e6f4fb' : 'none', border: 'none', color: isTrashMode ? '#0696d7' : '#666', fontSize: 13, cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}>
                     <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor"><path d="M11 15H5a2.25 2.25 0 0 1-2.25-2.25V5.72a.75.75,0,0,1 1.5 0v7.07a.74.74,0,0,0 .75.75h6a.74.74,0,0,0 .75-.75V5.72a.75.75,0,0,1 1.5 0v7.07A2.25 2.25 0 0 1 11 15Zm3-12h-3a2.26 2.26 0 0 0-2.24-2h-1.5A2.26 2.26 0 0 0 5 3H2a.75.75,0,0,0 0 1.5h12A.75.75,0,0,0,14 3Zm-3.75 8V7.22a.75.75,0,0,0-1.5 0V11a.75.75,0,0,0 1.5 0Zm-3 0V7.22a.75.75,0,0,0-1.5 0V11a.75.75,0,0,0 1.5 0Z"></path></svg>
                     Elementos suprimidos
                   </button>
                 )}
                 <button style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: '#666', fontSize: 13, cursor: 'pointer' }}>
                   <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14.75 3.53a.76.76,0,0,1-.75.75H7.18a1.78,1.78,0,0,1-3.25,0H2a.75.75,0,0,1,0-1.5h1.93a1.78,1.78,0,0,1,3.25,0H14a.75.75,0,0,1,.75.75ZM14 12.1H7.18a1.79,1.79,0,0,0-3.25,0H2a.75.75,0,0,0,0,1.5h1.93a1.78,1.78,0,0,0,3.25,0H14a.75.75,0,0,0,0-1.5Zm0-4.64h-1.91a1.8,1.8,0,0,0-1.64-1.06 1.78,1.78,0,0,0-1.63,1.06H2A.75.75,0,0,0,2,9h6.84a1.77,1.77,0,0,0,1.61,1 1.8,1.8,0,0,0,1.62-1H14a.75.75,0,0,0,0-1.5Z"></path></svg>
                   Configuración
                   <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M2.9 4.61a.73.73,0,0,1 .54.23L8 9.57l4.56-4.73a.75.75,0,1,1,1.08 1l-5.1 5.29a.78.78,0,0,1-.54.27.78.78,0,0,1-.54-.23l-5.1-5.29a.75.75,0,0,1,0-1.06.73.73,0,0,1,.54-.21Z"></path></svg>
                 </button>
              </div>
            </div>
          </header>

          <div className="acc-workspace" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* TREE SECTION */}
            <aside style={{ width: treeSidebarWidth, flexShrink: 0, borderRight: '1px solid #dcdcdc', background: '#fff', overflowY: 'auto', padding: '16px 0' }}>
              <FolderNode
                folder={{ name: 'Archivos de proyecto', fullName: projectPrefix }}
                currentPath={currentPath}
                onNavigate={navigate}
                onReset={() => setCollapseSignal(s => s+1)}
                collapseSignal={collapseSignal}
                projectPrefix={projectPrefix}
                level={0}
                defaultExpanded={true}
                isAdmin={isAdmin}
                onTreeRefresh={() => { }}
                onGlobalRefresh={(p) => { triggerRefresh(currentPath); if (p) navigate(p); }}
                refreshSignal={refreshSignal}
                onInitiateMove={(items) => setMoveState({ step: 1, items: items, destPath: '' })}
              />
            </aside>

            {/* RESIZER */}
            <div onMouseDown={startTreeResize} style={{ width: 8, cursor: 'col-resize', background: '#fcfcfc', borderRight: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 2, height: 24, background: '#eee', borderRadius: 1 }} />
            </div>

            {/* DATA PANEL */}
            <section style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div className="acc-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#fff', borderBottom: '1px solid #eee', flexShrink: 0 }}>
                <div style={{ display: 'flex' }}>
                   <button onClick={() => { setShowUploadModal(true); setUploadSopStep('IDLE'); }} style={{ padding: '6px 16px', background: '#0696D7', color: '#fff', border: 'none', borderRadius: '4px 0 0 4px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                      Cargar archivos
                   </button>
                   <button onClick={() => { setShowUploadModal(true); setUploadSopStep('IDLE'); }} style={{ padding: '6px 8px', background: '#0696D7', color: '#fff', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.3)', borderRadius: '0 4px 4px 0', cursor: 'pointer' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5H7z"/></svg>
                   </button>
                </div>

                <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" style={{ position: 'absolute', left: 8, top: 9 }}><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                  <input type="text" placeholder="Buscar y filtrar" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', height: 32, paddingLeft: 30, paddingRight: 8, border: '1px solid #ddd', borderRadius: 4, fontSize: 13, outline: 'none' }} />
                </div>

                <div style={{ display: 'flex', gap: 12, marginLeft: 'auto', alignItems: 'center' }}>
                    <button className="row-action-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg></button>
                    <button className="row-action-btn" style={{ color: '#0696D7' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></button>
                </div>
              </div>

              <div style={{ flex: 1, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center' }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
                ) : (
                    <MatrixTable
                        folders={filteredFolders}
                        files={filteredFiles}
                        selected={selected}
                        columnWidths={columnWidths}
                        totalTableWidth={totalTableWidth}
                        toggle={toggle}
                        navigate={navigate}
                        setActiveFile={setActiveFile}
                        onUpdateDescription={async (item, newDesc) => {
                          // Optimistic update
                          if (item.type === 'folder') {
                            setFolders(prev => prev.map(f => f.id === item.id ? { ...f, description: newDesc } : f));
                          } else {
                            setFiles(prev => prev.map(f => f.id === item.id ? { ...f, description: newDesc } : f));
                          }
                          try {
                            const res = await fetch(`${API}/api/docs/description`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ node_id: item.id, description: newDesc })
                            });
                            if (res.ok) triggerRefresh(currentPath);
                            else triggerRefresh(currentPath); // Revert on error
                          } catch (e) {
                            console.error('Error updating description:', e);
                            triggerRefresh(currentPath);
                          }
                        }}
                        onRename={async (item, newName) => {
                          console.log('Renaming item:', item.id, 'to:', newName);
                          // Optimistic update
                          if (item.type === 'folder') {
                            setFolders(prev => prev.map(f => f.id === item.id ? { ...f, name: newName } : f));
                          } else {
                            setFiles(prev => prev.map(f => f.id === item.id ? { ...f, name: newName } : f));
                          }
                          try {
                            const res = await fetch(`${API}/api/docs/rename`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ node_id: item.id, new_name: newName })
                            });
                            if (res.ok) {
                              console.log('Rename success');
                              triggerRefresh(currentPath);
                            } else {
                              console.error('Rename failed:', res.status);
                              triggerRefresh(currentPath); // Revert
                            }
                          } catch (e) {
                            console.error('Error renaming:', e);
                            triggerRefresh(currentPath);
                          }
                        }}
                        formatSize={formatSize}
                        formatDate={formatDate}
                        getInitials={getInitials}
                        user={user}
                        isAdmin={isAdmin}
                        isTrashMode={isTrashMode}
                        onShowVersions={onShowVersions}
                        onRowMenu={(item, e) => { if (isAdmin) setActiveRowMenu({ item, x: e.clientX, y: e.clientY }); }}
                        startResizing={startResizing}
                        setSelected={setSelected}
                        renderFileIconSop={renderFileIconSop}
                    />
                )}
              </div>
              <footer style={{ padding: '8px 16px', fontSize: 11, color: '#999', borderTop: '1px solid #eee', background: '#fff', flexShrink: 0 }}>
                Mostrando {folders.length + files.length} elementos
              </footer>
            </section>
          </div>
        </div>
      </main>

      {/* MODALS & OVERLAYS (STAY THE SAME) */}
      <>
      {tableShowVersions && versionTarget && (
        <div className="side-panel-overlay" onClick={() => setTableShowVersions(false)} style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.1)' }}>
          <div className="right-side-panel" onClick={e => e.stopPropagation()} style={{ position: 'relative', width: versionPanelWidth, height: '100%', background: '#fff', borderLeft: '1px solid #dcdcdc', display: 'flex', flexDirection: 'column', animation: 'slideRight 0.3s ease-out' }}>
            {/* Resize Handle */}
            <div 
              onMouseDown={startVersionResize}
              style={{ position: 'absolute', left: -2, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 100 }}
            />
            <div className="right-panel-header" style={{ height: 48, borderBottom: '1px solid #dcdcdc', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h1 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: '#333' }}>Historial de versiones</h1>
              <button onClick={() => setTableShowVersions(false)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#666' }}>×</button>
            </div>
            
            <div className="panel-version-table-container" style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', background: '#fff' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', borderBottom: '1px solid #dcdcdc', height: 36 }}>
                    <th style={{ width: 40, padding: '0 12px', position: 'sticky', left: 0, top: 0, background: '#f5f5f5', zIndex: 20, borderBottom: '1px solid #dcdcdc', whiteSpace: 'nowrap' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedVersions.size === versionHistory.length && versionHistory.length > 0} 
                        onChange={() => {
                          if (selectedVersions.size === versionHistory.length) setSelectedVersions(new Set());
                          else setSelectedVersions(new Set(versionHistory.map(v => v.id)));
                        }}
                      />
                    </th>
                    <th style={{ width: 80, padding: '0 12px', fontSize: 13, color: '#666', fontWeight: 600, textAlign: 'left', position: 'sticky', left: 40, top: 0, background: '#f5f5f5', zIndex: 20, borderBottom: '1px solid #dcdcdc', whiteSpace: 'nowrap' }}>Versión</th>
                    <th style={{ minWidth: 300, padding: '0 12px', fontSize: 13, color: '#666', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Nombre</th>
                    <th style={{ width: 100, padding: '0 12px', fontSize: 13, color: '#666', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Indicadores</th>
                    <th style={{ width: 100, padding: '0 12px', fontSize: 13, color: '#666', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Marcas de rev.</th>
                    <th style={{ width: 100, padding: '0 12px', fontSize: 13, color: '#666', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Tamaño</th>
                    <th style={{ width: 150, padding: '0 12px', fontSize: 13, color: '#666', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Última actualización</th>
                    <th style={{ width: 220, padding: '0 12px', fontSize: 13, color: '#666', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Actualizado por</th>
                    <th style={{ width: 220, padding: '0 12px', fontSize: 13, color: '#666', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Versión añadida por</th>
                    <th style={{ width: 150, padding: '0 12px', fontSize: 13, color: '#666', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Estado de revisión</th>
                    <th style={{ width: 40, padding: '0 12px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {loadingVersions ? (
                    <tr><td colSpan="11" style={{ textAlign: 'center', padding: 40 }}><div className="adsk-spinner" /></td></tr>
                  ) : versionHistory.map((v, i) => {
                    const isCurrent = i === 0;
                    const isSelected = selectedVersions.has(v.id);
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #eee', verticalAlign: 'top', background: isSelected ? '#f6fbff' : '#fff' }}>
                        <td style={{ padding: '16px 12px', position: 'sticky', left: 0, background: isSelected ? '#f6fbff' : '#fff', zIndex: 5 }}>
                          <input 
                            type="checkbox" 
                            checked={isSelected} 
                            onChange={() => {
                              const next = new Set(selectedVersions);
                              if (isSelected) next.delete(v.id); else next.add(v.id);
                              setSelectedVersions(next);
                            }} 
                          />
                        </td>
                        <td style={{ padding: '16px 12px', position: 'sticky', left: 40, background: isSelected ? '#f6fbff' : '#fff', zIndex: 5 }}>
                           <span className="version-link-acc">{v.version_number ? `V${v.version_number}` : 'V1'}</span>
                        </td>
                        <td style={{ padding: '16px 12px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 12 }}>
                            {renderFileIconSop(versionTarget.name, 22)}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 13, fontWeight: 500, color: '#3c3c3c' }}>{versionTarget.name}</span>
                              <span style={{ fontSize: 11, color: '#999' }}>Cargado por <span style={{ textTransform: 'uppercase' }}>{v.updated_by || 'ADMIN'}</span></span>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '16px 12px', whiteSpace: 'nowrap' }}>--</td>
                        <td style={{ padding: '16px 12px', whiteSpace: 'nowrap' }}>--</td>
                        <td style={{ padding: '16px 12px', fontSize: 13, color: '#3c3c3c', whiteSpace: 'nowrap' }}>{formatSize(v.size || 0)}</td>
                        <td style={{ padding: '16px 12px', fontSize: 13, color: '#3c3c3c', whiteSpace: 'nowrap' }}>{formatDate(v.updated)}</td>
                        <td style={{ padding: '16px 12px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                             <div className="user-avatar-acc" style={{ width: 24, height: 24, fontSize: 10, flexShrink: 0 }}>{getInitials(v.updated_by || 'ADMIN')}</div>
                             <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                               <span style={{ fontSize: 13, color: '#3c3c3c', textOverflow: 'ellipsis', overflow: 'hidden' }}>{v.updated_by || 'ADMIN'}</span>
                               <span style={{ fontSize: 11, color: '#999', textOverflow: 'ellipsis', overflow: 'hidden' }}>Trial account ysan...</span>
                             </div>
                          </div>
                        </td>
                        <td style={{ padding: '16px 12px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                             <div className="user-avatar-acc" style={{ width: 24, height: 24, fontSize: 10, flexShrink: 0 }}>{getInitials(v.updated_by || 'ADMIN')}</div>
                             <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                               <span style={{ fontSize: 13, color: '#3c3c3c', textOverflow: 'ellipsis', overflow: 'hidden' }}>{v.updated_by || 'ADMIN'}</span>
                               <span style={{ fontSize: 11, color: '#999', textOverflow: 'ellipsis', overflow: 'hidden' }}>Trial account ysan...</span>
                             </div>
                          </div>
                        </td>
                        <td style={{ padding: '16px 12px', whiteSpace: 'nowrap' }}>--</td>
                        <td style={{ padding: '16px 12px', whiteSpace: 'nowrap' }}>
                          <button 
                            className="row-menu-btn" 
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              setVersionRowMenu({ v, x: rect.left - 180, y: rect.bottom + 5, isSelected });
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            <footer style={{ height: 40, borderTop: '1px solid #dcdcdc', padding: '0 16px', display: 'flex', alignItems: 'center', fontSize: 12, color: '#666', background: '#fff' }}>
               {selectedVersions.size > 0 ? `${selectedVersions.size} de ${versionHistory.length} seleccionadas` : `Se están mostrando ${versionHistory.length} versiones`}
            </footer>
          </div>
        </div>
      )}

      {/* VERSION ROW CONTEXT MENU */}
      {versionRowMenu && (
        <div 
          className="modal-overlay" 
          onClick={() => setVersionRowMenu(null)}
          style={{ background: 'transparent', zIndex: 11000 }}
        >
          <div 
            className="row-context-menu" 
            style={{ position: 'fixed', left: versionRowMenu.x, top: versionRowMenu.y, width: 220 }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => { /* Copiar logic */ setVersionRowMenu(null); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
              Copiar
            </button>
            <button onClick={() => { /* Paquetes logic */ setVersionRowMenu(null); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              Añadir a paquetes
            </button>
            <button onClick={() => {
              if (versionRowMenu.v.gcs_urn) window.open(`${API}/api/docs/view?urn=${encodeURIComponent(versionRowMenu.v.gcs_urn)}`, '_blank');
              setVersionRowMenu(null);
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Descargar archivo de origen
            </button>
            
            {versionRowMenu.isSelected && versionRowMenu.v.version_number !== versionHistory[0]?.version_number && (
              <>
                <div className="menu-divider" />
                <button 
                  onClick={() => { handlePromote(versionRowMenu.v); setVersionRowMenu(null); }}
                  style={{ fontWeight: 600 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 1l4 4-4 4"></path><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><path d="M7 23l-4-4 4-4"></path><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                  Establecer como actual
                </button>
              </>
            )}
          </div>
        </div>
      )}
      </>

      {activeRowMenu && (
        <div className="modal-overlay" onClick={() => setActiveRowMenu(null)} style={{ background: 'transparent', zIndex: 10001 }}>
          <div className="row-context-menu" style={{ position: 'absolute', top: activeRowMenu.y, left: activeRowMenu.x - 180, width: 180 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => { setActiveRowMenu(null); setActiveFile(activeRowMenu.item); }}>Ver / Abrir</button>
            <button onClick={() => { setActiveRowMenu(null); onShowVersions(activeRowMenu.item, { clientX: activeRowMenu.x, clientY: activeRowMenu.y }); }}>Historial</button>
            <div className="menu-divider" />
            <button onClick={() => { setActiveRowMenu(null); renameSpecificItem(activeRowMenu.item.fullName); }}>Renombrar</button>
            <button onClick={() => { setActiveRowMenu(null); setMoveState({ step: 1, items: [activeRowMenu.item.fullName], destPath: '' }); }}>Desplazar</button>
            <button className="delete" onClick={() => { setActiveRowMenu(null); deleteSpecificItem(activeRowMenu.item.fullName); }}>Suprimir</button>
          </div>
        </div>
      )}

      {showNewFolder && (
        <div className="modal-overlay" onClick={() => setShowNewFolder(false)}>
          <div className="modal-box">
            <h3>Nueva Carpeta</h3>
            <input autoFocus value={folderName} onChange={e => setFolderName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createFolder()} />
            <div className="modal-actions">
              <button onClick={() => setShowNewFolder(false)}>Cancelar</button>
              <button onClick={createFolder}>Crear</button>
            </div>
          </div>
        </div>
      )}

      {activeFile && activeFile.type !== 'folder' && (
        <div className="file-viewer-overlay">
          <div className="file-viewer-header">
            <div className="file-viewer-title">{activeFile.name}</div>
            <button className="file-viewer-close" onClick={() => { setActiveFile(null); setShowVersions(false); }}>✕</button>
          </div>
          <iframe className="file-viewer-content" src={`${API}/api/docs/view?path=${encodeURIComponent(activeFile.fullName)}`} title={activeFile.name} />
        </div>
      )}

      {moveState.step > 0 && (
        <div className="modal-overlay" onClick={() => setMoveState({ step: 0, items: [], destPath: '' })}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: moveState.step === 2 ? 500 : 400 }}>
            <h3>{moveState.step === 1 ? '¿Mover?' : 'Seleccionar destino'}</h3>
            {moveState.step === 1 ? <p>Mover estos elementos.</p> : (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                <SelectFolderNode folder={{ name: 'Archivos de proyecto', fullName: projectPrefix }} defaultExpanded={true} selectedPath={moveState.destPath} onSelect={(path) => setMoveState({ ...moveState, destPath: path })} />
              </div>
            )}
            <div className="modal-actions">
              <button onClick={() => setMoveState({ step: 0, items: [], destPath: '' })}>Cancelar</button>
              <button onClick={() => moveState.step === 1 ? setMoveState({ ...moveState, step: 2 }) : handleExecuteMove()}>
                {moveState.step === 1 ? 'Continuar' : 'Mover'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUploadModal && !sopMinimized && (
        <div className="modal-overlay" onClick={() => { if (sopQueue.length === 0) setShowUploadModal(false); }}>
          <div className="acc-upload-modal" onClick={e => e.stopPropagation()}>
            <div className="acc-upload-header">
              <h3>Cargar archivos</h3>
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="file-viewer-close" style={{ background: 'none' }} onClick={() => setSopMinimized(true)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h14v14zm-2-2V7H7v10h10z"/></svg>
                </button>
                <button className="file-viewer-close" style={{ background: 'none' }} onClick={() => setShowUploadModal(false)}>✕</button>
              </div>
            </div>
            
            <div className="acc-upload-body" style={{ maxHeight: 600, overflowY: 'auto' }}>
              {/* ENTRY POINTS (PERSISTENT) */}
              <div className="acc-upload-entry-section" style={{ marginBottom: 20 }}>
                <button className="acc-upload-btn-secondary" style={{ width: '100%', border: '1px solid #0696d7', color: '#000', padding: '8px', marginBottom: 12, borderRadius: 2 }} onClick={() => fileRef.current.click()}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#666"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
                  Desde su equipo
                </button>
                <div 
                  className={`acc-upload-dropzone ${dragOver ? 'drag-over' : ''}`} 
                  onClick={() => fileRef.current.click()}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  style={{ border: '1px dashed #ddd', padding: '40px 20px', borderRadius: 2, textAlign: 'center' }}
                >
                   <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ddd" strokeWidth="1"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15l3 3 3-3"/></svg>
                   <div style={{ color: '#999', fontSize: 13, marginTop: 12 }}>Arrastre archivos aquí o elija una opción arriba</div>
                </div>
                <input type="file" ref={fileRef} multiple style={{ display: 'none' }} onChange={e => handleSopUpload(e.target.files)} />
              </div>

              {sopQueue.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 13, color: '#333', marginBottom: 16, fontWeight: 300 }}>
                    Total de {sopQueue.length} {sopQueue.length === 1 ? 'archivo' : 'archivos'}, {sopBatches.length} {sopBatches.length === 1 ? 'lote' : 'lotes'}
                  </div>
                  
                  {sopBatches.map(batch => (
                    <div key={batch.id} className="acc-batch-group" style={{ marginBottom: 16 }}>
                      <div className="acc-batch-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#fcfcfc', borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#333', fontWeight: 500 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5H7z"/></svg>
                          <span>{sopQueue.filter(f => f.batchId === batch.id).length} archivos</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#999' }}>Cargar en {batch.timestamp}</div>
                      </div>
                      <div className="acc-batch-content">
                        {sopQueue.filter(f => f.batchId === batch.id).map(item => (
                          <div key={item.id} className="acc-upload-file-row">
                            {renderFileIconSop(item.file?.name, 32)}
                            <div className="acc-upload-file-info">
                              <div className="acc-upload-file-name">{item.file?.name}</div>
                              <div className="acc-upload-file-status">
                                {item.status === 'PROCESO_PENDIENTE' ? 'Proceso pendiente' : (item.status === 'PROCESANDO_1' || item.status === 'IDLE') ? 'Procesando' : ''}
                                {(item.status === 'BARRA_AZUL' || item.status === 'PROCESANDO_1' || item.status === 'PROCESO_PENDIENTE') && (
                                  <div className="acc-progress-container">
                                    <div className={`acc-progress-bar ${item.status !== 'BARRA_AZUL' ? 'indeterminate' : ''}`} style={{ width: item.status === 'BARRA_AZUL' ? `${item.progress}%` : '100%' }} />
                                  </div>
                                )}
                                {item.status === 'LISTO_1' && (
                                  <div style={{ color: '#33691e', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                                    Cargado en la carpeta {currentPath.split('/').filter(Boolean).pop()} {item.time}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={{ fontSize: 12, color: '#999', display: 'flex', alignItems: 'center', gap: 12 }}>
                              <span style={{ minWidth: 60, textAlign: 'right' }}>{formatSize(item.file?.size || 0)}</span>
                              {item.status === 'LISTO_1' ? (
                                <span style={{ color: '#0696d7', fontWeight: 600, cursor: 'pointer' }}>Ver</span>
                              ) : (
                                <span onClick={() => { setSopQueue(q => q.filter(it => it.id !== item.id)); if (sopQueue.length <= 1) setUploadSopStep('IDLE'); }} style={{ cursor: 'pointer', fontSize: 16 }}>✕</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="acc-upload-footer">
              <button className="acc-btn-listo" 
                disabled={uploadSopStep !== 'LISTO_1'} 
                onClick={handleSopListo}
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {showSopToast && (
        <div className="acc-success-toast">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          Un archivo se ha cargado correctamente.
        </div>
      )}

      {showUploadModal && sopMinimized && (
        <div className="acc-upload-monitor" style={{ position: 'fixed', bottom: 20, right: 20, width: 320, background: '#fff', border: '1px solid #ddd', borderRadius: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 10000, overflow: 'hidden' }}>
          <div className="acc-monitor-header" style={{ padding: '8px 12px', background: '#fcfcfc', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Cargar</span>
            <div style={{ display: 'flex', gap: 12 }}>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }} onClick={() => setSopMinimized(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#666"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
              </button>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#666"><path d="M7 10l5 5 5-5z"/></svg>
              </button>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }} onClick={() => setShowUploadModal(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#666"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </div>
          </div>
          
          <div className="acc-monitor-body" style={{ maxHeight: 400, overflowY: 'auto' }}>
            <div style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ fontSize: 12, color: '#333' }}>Total de {sopQueue.length} {sopQueue.length === 1 ? 'archivo' : 'archivos'}, {sopBatches.length} {sopBatches.length === 1 ? 'lote' : 'lotes'}...</span>
              <span style={{ fontSize: 12, color: '#0696d7', cursor: 'pointer', fontWeight: 600 }} onClick={() => { setSopQueue([]); setSopBatches([]); setShowUploadModal(false); }}>Cancelar todo</span>
            </div>

            {sopBatches.map(batch => (
              <div key={batch.id}>
                <div style={{ padding: '8px 12px', background: '#fafafa', fontSize: 12, color: '#666', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                   <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
                   {sopQueue.filter(f => f.batchId === batch.id).length} archivo
                </div>
                {sopQueue.filter(f => f.batchId === batch.id).map(item => (
                  <div key={item.id} style={{ padding: '12px', borderBottom: '1px solid #f9f9f9', display: 'flex', gap: 12 }}>
                        {renderFileIconSop(item.file?.name, 28)}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file?.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                         {item.status !== 'LISTO_1' ? (
                           <>
                             <div className="acc-mini-spinner" style={{ width: 10, height: 10, border: '2px solid #0696d7', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                             <span style={{ fontSize: 11, color: '#666' }}>Cargando: {item.progress}%</span>
                           </>
                         ) : (
                           <span style={{ fontSize: 11, color: '#33691e' }}>Listo</span>
                         )}
                         <span style={{ fontSize: 11, color: '#999' }}>• {formatSize(item.file?.size || 0)}</span>
                      </div>
                    </div>
                    {item.status !== 'LISTO_1' && (
                      <div style={{ fontSize: 12, color: '#0696d7', cursor: 'pointer', fontWeight: 600 }} onClick={() => setSopQueue(q => q.filter(it => it.id !== item.id))}>Cancelar</div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
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
