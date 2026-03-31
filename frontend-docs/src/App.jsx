import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Capacitor } from '@capacitor/core';
import MatrixTable from './MatrixTable';
import LoginScreen from './LoginScreen';
import { apiFetch } from './utils/apiFetch';
import SharedViewer from './components/SharedViewer';
import DocumentViewer from './components/DocumentViewer';
import { useChunkedUpload } from './hooks/useChunkedUpload';
import { useFolderCache } from './hooks/useFolderCache';
import FolderPermissionsPanel from './components/FolderPermissionsPanel';
import toast from 'react-hot-toast';
import { downloadFolderAsZip } from './utils/downloadUtils';


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
  if (!name || typeof name !== 'string') return 'U';
  return name.split(' ').filter(w => w).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ─── AUTH HEADERS HELPER ───
function getAuthHeaders(extra = {}) {
  const saved = localStorage.getItem('visor_session_token') || sessionStorage.getItem('visor_session_token');
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (saved) headers['Authorization'] = `Bearer ${saved}`;
  return headers;
}

// ─── USER HOOK (localStorage & sessionStorage) ───
function useUser() {
  const [user, setUser] = useState(() => {
    const savedLocal = localStorage.getItem('visor_user');
    if (savedLocal) return JSON.parse(savedLocal);
    const savedSession = sessionStorage.getItem('visor_user');
    if (savedSession) return JSON.parse(savedSession);
    return null;
  });

  const saveUser = (data, remember = true) => {
    // Store session token separately for easy access
    if (data && data.session_token) {
      localStorage.setItem('visor_session_token', data.session_token);
    }
    if (remember) {
      localStorage.setItem('visor_user', JSON.stringify(data));
      sessionStorage.removeItem('visor_user');
    } else {
      sessionStorage.setItem('visor_user', JSON.stringify(data));
      localStorage.removeItem('visor_user');
    }
    setUser(data);
  };

  const logout = async () => {
    try {
      await apiFetch(`${API}/api/auth/logout`, { method: 'POST', headers: getAuthHeaders() });
    } catch (e) { /* ignore */ }
    localStorage.removeItem('visor_user');
    localStorage.removeItem('visor_session_token');
    sessionStorage.removeItem('visor_user');
    sessionStorage.removeItem('visor_session_token');
    setUser(null);
  };

  return { user, saveUser, logout };
}

// ─────────────────────────────────────
// 1. LOGIN SCREEN → Imported from Stitch (LoginScreen.jsx)
// ─────────────────────────────────────

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

  const handleDeleteComp = async (id) => {
    if (!window.confirm('¿Borrar empresa?')) return;
    await apiFetch(`${API}/api/companies/${id}`, { method: 'DELETE' }); fetchTags();
  };
  const handleDeleteJob = async (id) => {
    if (!window.confirm('¿Borrar cargo?')) return;
    await apiFetch(`${API}/api/job_titles/${id}`, { method: 'DELETE' }); fetchTags();
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
      const hRes = await apiFetch(`${API}/api/hubs`);
      if (hRes.ok) {
        const hData = await hRes.json();
        setHubs(hData.hubs || []);
      }

      const res = await apiFetch(`${API}/api/projects?user_id=${user.id}&role=${user.role}`);
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
      await apiFetch(`${API}/api/hubs/${targetHub}/projects`, {
        method: 'POST',
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
      const r1 = await apiFetch(`${API}/api/users`);
      if (r1.ok) setAllUsers(await r1.json());
      // 2. Fetch usuarios asignados a este proyecto
      const r2 = await apiFetch(`${API}/api/projects/${proj.id}/users`);
      if (r2.ok) setProjectUsers(await r2.json());

      setShowAccess(proj);
    } catch (e) { console.error(e); }
  };

  const saveAccess = async () => {
    if (!showAccess) return;
    try {
      await apiFetch(`${API}/api/projects/${showAccess.id}/users`, {
        method: 'POST',
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
function SelectFolderNode({ folder, defaultExpanded = false, selectedPath, onSelect, modelUrn }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [children, setChildren] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadChildren = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API}/api/docs/list?path=${encodeURIComponent(folder.fullName)}&model_urn=${encodeURIComponent(modelUrn || 'global')}`);
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
        onClick={() => onSelect(folder.fullName, folder.id)}
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
          {children.map(c => <SelectFolderNode key={c.fullName} folder={c} selectedPath={selectedPath} onSelect={onSelect} modelUrn={modelUrn} />)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────
// 3.5 RECURSIVE FOLDER NODE
// ─────────────────────────────────────
function FolderNode({ 
  user,
  folder, 
  currentPath, 
  onNavigate, 
  projectPrefix, 
  level = 1, 
  defaultExpanded = false, 
  isAdmin, 
  onTreeRefresh, 
  onGlobalRefresh, 
  refreshSignal = 0, 
  onInitiateMove, 
  collapseSignal = 0, 
  onReset,
  onRowMenu,
  editingNodeId,
  setEditingNodeId,
  rightClickedId,
  processingIds,
  setProcessingIds,
  creatingChildParentId,
  setCreatingChildParentId,
  cacheMethods
}) {
  const folderFullName = folder.fullName || '';
  const nodeId = folder.id || folderFullName;
  const isActive = currentPath === folderFullName;
  const isChildrenActive = folderFullName && currentPath.startsWith(folderFullName) && !isActive;

  const [expanded, setExpanded] = React.useState(defaultExpanded || isChildrenActive);
  const [showMenu, setShowMenu] = React.useState(false);
  const menuRef = React.useRef(null);

  const [isRenaming, setIsRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState('');
  const [isCreatingChild, setIsCreatingChild] = React.useState(false);
  const [newChildName, setNewChildName] = React.useState('');

  const { folders: cachedFolders, files: cachedFiles, stale, loading } = cacheMethods ? cacheMethods.getChildren(nodeId) : { folders: null, loading: false };
  const children = cachedFolders || null;

  const submitRename = async () => {
    const folderNameStr = folder.name || '';
    if (!renameValue.trim() || renameValue.trim() === folderNameStr.replace(/\/$/, '')) {
      setIsRenaming(false);
      return;
    }
    const newName = renameValue.trim();
    if (cacheMethods) cacheMethods.optimisticRename(folder.parentId || null, nodeId, newName);
    setIsRenaming(false);
    
    try {
      const res = await apiFetch(`${API}/api/docs/rename`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ node_id: nodeId, new_name: newName, model_urn: projectPrefix })
      });
      if (res.ok) {
        if (cacheMethods) cacheMethods.commitRename(folder.parentId || null, nodeId);
        if (onGlobalRefresh) onGlobalRefresh();
      } else {
        if (cacheMethods) cacheMethods.rollbackRename(folder.parentId || null, nodeId, folderNameStr);
        const err = await res.json();
        toast.error('Error al renombrar: ' + (err.error || 'Desconocido'));
      }
    } catch (e) {
      if (cacheMethods) cacheMethods.rollbackRename(folder.parentId || null, nodeId, folderNameStr);
      toast.error('Error de conexión');
    }
  };

  const submitCreateChild = async () => {
    if (!newChildName.trim()) { setIsCreatingChild(false); return; }
    const base = folderFullName;
    const newPath = base + (base.endsWith('/') ? '' : '/') + newChildName.trim() + '/';
    
    const tempId = 'temp_' + Date.now();
    const tempFolder = {
      id: tempId,
      name: newChildName.trim(),
      fullName: newPath,
      parentId: nodeId,
      type: 'folder',
      _syncing: true
    };
    
    if (cacheMethods) cacheMethods.optimisticCreate(nodeId, tempFolder);
    setIsCreatingChild(false);
    setNewChildName('');
    setExpanded(true);

    try { 
      const res = await apiFetch(`${API}/api/docs/folder`, { 
        method: 'POST', 
        headers: getAuthHeaders(), 
        body: JSON.stringify({ path: newPath, model_urn: projectPrefix, user: user?.name }) 
      });
      if (res.ok) {
        const data = await res.json();
        const realId = data.folder_id || newPath;
        if (cacheMethods) cacheMethods.commitCreate(nodeId, tempId, realId);
        if (onGlobalRefresh) onGlobalRefresh();
      } else {
        if (cacheMethods) cacheMethods.rollbackCreate(nodeId, tempId);
        const err = await res.json();
        toast.error('Error al crear: ' + (err.error || 'Desconocido'));
      }
    } catch (e) { 
      if (cacheMethods) cacheMethods.rollbackCreate(nodeId, tempId);
      toast.error('Error de red');
    }
  };

  React.useEffect(() => {
    if (expanded && refreshSignal > 0 && cacheMethods) {
      cacheMethods.expandNode(nodeId, folderFullName);
    }
  }, [refreshSignal, expanded, cacheMethods, nodeId, folderFullName]);

  React.useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setShowMenu(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  React.useEffect(() => {
    if (defaultExpanded && !children && cacheMethods) {
      cacheMethods.expandNode(nodeId, folderFullName);
    }
  }, [defaultExpanded, children, cacheMethods, nodeId, folderFullName]);

  React.useEffect(() => {
    if (collapseSignal > 0 && level > 0) {
      setExpanded(false);
    }
  }, [collapseSignal, level]);

  React.useEffect(() => {
    if (folderFullName && currentPath.startsWith(folderFullName) && currentPath !== folderFullName) {
      if (!expanded) setExpanded(true);
      if (!children && cacheMethods) cacheMethods.expandNode(nodeId, folderFullName);
    }
  }, [currentPath, folderFullName, expanded, children, cacheMethods, nodeId]);

  const handleToggle = (e) => {
    e.stopPropagation();
    if (!expanded && !children && cacheMethods) {
      cacheMethods.expandNode(nodeId, folderFullName);
    }
    setExpanded(!expanded);
  };

  React.useEffect(() => {
    if (editingNodeId && editingNodeId.source === 'sidebar' && editingNodeId.id === nodeId) {
      setIsRenaming(true);
      setRenameValue((folder.name || '').replace(/\/$/, ''));
      setEditingNodeId(null);
    }
  }, [editingNodeId, folder.name, nodeId, setEditingNodeId]);

  React.useEffect(() => {
    if (creatingChildParentId === nodeId) {
      if (!expanded) {
         setExpanded(true);
      }
      if (cacheMethods) cacheMethods.expandNode(nodeId, folderFullName);
      setIsCreatingChild(true);
      setNewChildName('');
      setCreatingChildParentId(null);
    }
  }, [creatingChildParentId, nodeId, folderFullName, expanded, cacheMethods, setCreatingChildParentId]);

  return (
    <>
      <div
        className={`folder-tree-item ${isActive ? 'active' : ''} ${isChildrenActive ? 'child-active' : ''} ${nodeId === rightClickedId ? 'context-active' : ''}`}
        style={{ paddingLeft: `${8 + (level * 28)}px`, color: isActive ? '#0696D7' : folder._syncing ? '#999' : '#3c3c3c' }}
        onClick={(e) => {
          e.stopPropagation();
          onNavigate(folderFullName, folder.id);
          if (level === 0 && onReset) onReset();
        }}
        onContextMenu={(e) => {
          if (isAdmin) {
            e.preventDefault();
            e.stopPropagation();
            const item = { ...folder, type: 'folder', id: nodeId }; 
            onRowMenu(item, e);
          }
        }}
      >
        <div className="tree-toggle" onClick={handleToggle} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (!loading && children && children.length === 0 && expanded) ? 0 : 1 }}>
          {processingIds[nodeId] ? (
            <div className="adsk-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
          ) : (
            loading && expanded && !children ? (
              <div className="adsk-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            ) : (
              <svg height="24" width="24" viewBox="0 0 24 24" fill="currentColor" style={{ transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform 0.2s', width: 20, height: 20 }}>
                <path d="M12,16.17a.74.74,0,0,1-.54-.23L6.23,10.52a.75.75,0,0,1,1.08-1L12,14.34l4.69-4.86a.75.75,0,1,1,1.08,1l-5.23,5.42A.74.74,0,0,1,12,16.17Z"></path>
              </svg>
            )
          )}
        </div>

        <div className="tree-icon" style={{ display: 'flex', alignItems: 'center', marginLeft: 4, marginRight: 8, opacity: folder._syncing ? 0.5 : 1 }}>
          <svg fill="currentColor" viewBox="0 0 24 24" width="24" height="24">
            <path d="M18,20.45H6a3.6,3.6,0,0,1-3.6-3.6V7.15A3.6,3.6,0,0,1,6,3.55h4.84a.71.71,0,0,1,.53.22l2.12,2.1H18a3.61,3.61,0,0,1,3.6,3.61v7.37A3.6,3.6,0,0,1,18,20.45ZM3.89,9.48v7.37A2.1,2.1,0,0,0,6,19H18a2.1,2.1,0,0,0,2.1-2.1V9.48A2.1,2.1,0,0,0,18,7.37H13.17a.75.75,0,0,1-.53-.22l-2.12-2.1H6a2.1,2.1,0,0,0-2.1,2.1Z"></path>
          </svg>
        </div>

        {isRenaming ? (
          <div className="inline-edit-box" style={{ margin: '0 8px', height: 28 }} onClick={e => e.stopPropagation()}>
            <input 
              autoFocus 
              value={renameValue} 
              onFocus={(e) => e.target.select()}
              onChange={e => setRenameValue(e.target.value)} 
              onBlur={(e) => {
                if (e.relatedTarget && e.relatedTarget.closest('.inline-edit-box')) return;
                submitRename();
              }}
              onKeyDown={e => { 
                if (e.key === 'Enter') submitRename(); 
                if (e.key === 'Escape') setIsRenaming(false); 
              }}
              style={{ padding: '0 4px', fontSize: 13 }}
            />
            <button className="btn-cancel" style={{ width: 22, height: 22, marginLeft: 2 }} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); setIsRenaming(false); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <button className="btn-submit" style={{ width: 22, height: 22, marginLeft: 2 }} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); submitRename(); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
          </div>
        ) : (
          <div className="tree-text" style={{ textDecoration: undefined }}>
            {folder.name.replace(/\/$/, '')}
          </div>
        )}
      </div>

      {expanded && (
        <div className="folder-children" style={{ display: 'block' }}>
          {isCreatingChild && (
            <div className="folder-tree-item child-creating" style={{ paddingLeft: `${8 + ((level + 1) * 28)}px` }}>
              <div className="tree-icon" style={{ display: 'flex', alignItems: 'center', marginLeft: 28, marginRight: 8 }}>
                 <svg fill="#e0e0e0" viewBox="0 0 24 24" width="24" height="24"><path d="M18,20.45H6a3.6,3.6,0,0,1-3.6-3.6V7.15A3.6,3.6,0,0,1,6,3.55h4.84a.71.71,0,0,1,.53.22l2.12,2.1H18a3.61,3.61,0,0,1,3.6,3.61v7.37A3.6,3.6,0,0,1,18,20.45ZM3.89,9.48v7.37A2.1,2.1,0,0,0,6,19H18a2.1,2.1,0,0,0,2.1-2.1V9.48A2.1,2.1,0,0,0,18,7.37H13.17a.75.75,0,0,1-.53-.22l-2.12-2.1H6a2.1,2.1,0,0,0-2.1,2.1Z"></path></svg>
              </div>
              <div className="inline-edit-box" style={{ flex: 1, margin: '0 8px', height: 28 }}>
                <input 
                  autoFocus 
                  value={newChildName} 
                  onChange={e => setNewChildName(e.target.value)}
                  onBlur={(e) => {
                    if (e.relatedTarget && e.relatedTarget.closest('.inline-edit-box')) return;
                    submitCreateChild();
                  }}
                  onKeyDown={e => { 
                    if (e.key === 'Enter') submitCreateChild(); 
                    if (e.key === 'Escape') setIsCreatingChild(false); 
                  }}
                  style={{ padding: '0 4px', fontSize: 13, width: '100%' }}
                  placeholder="Nombre de carpeta..."
                />
                <button className="btn-cancel" style={{ width: 22, height: 22, marginLeft: 2 }} onMouseDown={(e) => e.preventDefault()} onClick={() => setIsCreatingChild(false)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                <button className="btn-submit" style={{ width: 22, height: 22, marginLeft: 2 }} onMouseDown={(e) => e.preventDefault()} onClick={submitCreateChild}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </button>
              </div>
            </div>
          )}
          {children && children.map(child => (
            <FolderNode 
              key={child.id || child.fullName} 
              user={user}
              folder={child} 
              currentPath={currentPath} 
              onNavigate={onNavigate} 
              projectPrefix={projectPrefix} 
              level={level + 1} 
              isAdmin={isAdmin}
              onTreeRefresh={onTreeRefresh}
              onGlobalRefresh={onGlobalRefresh}
              refreshSignal={refreshSignal}
              onInitiateMove={onInitiateMove}
              collapseSignal={collapseSignal}
              onReset={onReset}
              onRowMenu={onRowMenu}
              editingNodeId={editingNodeId}
              setEditingNodeId={setEditingNodeId}
              rightClickedId={rightClickedId}
              processingIds={processingIds}
              setProcessingIds={setProcessingIds}
              creatingChildParentId={creatingChildParentId}
              setCreatingChildParentId={setCreatingChildParentId}
              cacheMethods={cacheMethods}
            />
          ))}
        </div>
      )}
    </>
  );
}


// ─────────────────────────────────────
// 3. TABLE COMPONENTS (Virtualized)
// ─────────────────────────────────────

function DeletedTable({ items, selectedIds, onToggle, onRestore, getInitials, renderFileIconSop, restoringIds }) {
  const colWidths = { checkbox: 40, name: 400, filename: 300, user: 250, date: 150 };
  const totalWidth = Object.values(colWidths).reduce((a, b) => a + b, 0);

  return (
    <div className="table-wrap" style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', height: '100%', background: '#fff' }}>
      <div style={{ width: totalWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #eee' }}>
        <div className="data-header" style={{ position: 'sticky', top: 0, zIndex: 30, width: totalWidth, background: '#f8f9fa' }}>
          <div className="td-cell checkbox-cell" style={{ width: colWidths.checkbox }}>
            <input 
              type="checkbox" 
              checked={selectedIds.length === items.length && items.length > 0} 
              onChange={() => {
                if (selectedIds.length === items.length) onToggle([]);
                else onToggle(items.map(it => it.id));
              }}
            />
          </div>
          <div className="td-cell" style={{ width: colWidths.name }}>Nombre</div>
          <div className="td-cell" style={{ width: colWidths.filename }}>Nombre de archivo</div>
          <div className="td-cell" style={{ width: colWidths.user }}>Suprimido por</div>
          <div className="td-cell" style={{ width: colWidths.date }}>Fecha de supresión</div>
        </div>
        <div className="deleted-rows" style={{ flex: 1 }}>
          {items.map(item => {
            const isSelected = selectedIds.includes(item.id);
            const isRestoring = restoringIds[item.id];
            return (
              <div 
                key={item.id} 
                className={`data-row ${isSelected ? 'selected' : ''}`} 
                style={{ 
                  height: 48, 
                  display: 'flex', 
                  alignItems: 'center', 
                  borderBottom: '1px solid #f2f2f2',
                  opacity: isRestoring ? 0.5 : 1,
                  filter: isRestoring ? 'grayscale(1)' : 'none',
                  transition: 'all 0.4s ease',
                  width: totalWidth
                }}
              >
                <div className="td-cell checkbox-cell" style={{ width: colWidths.checkbox }}>
                  {!isRestoring && (
                    <input 
                      type="checkbox" 
                      checked={isSelected} 
                      onChange={() => {
                        if (isSelected) onToggle(selectedIds.filter(id => id !== item.id));
                        else onToggle([...selectedIds, item.id]);
                      }}
                    />
                  )}
                </div>
                <div className="td-cell" style={{ width: colWidths.name, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {item.type === 'folder' ? (
                     <svg width="20" height="20" viewBox="0 0 24 24" fill={isRestoring ? '#ccc' : "#666"}><path d="M18,20.45H6a3.6,3.6,0,0,1-3.6-3.6V7.15A3.6,3.6,0,0,1,6,3.55h4.84a.71.71,0,0,1,.53.22l2.12,2.1H18a3.61,3.61,0,0,1,3.6,3.61v7.37A3.6,3.6,0,0,1,18,20.45ZM3.89,9.48v7.37A2.1,2.1,0,0,0,6,19H18a2.1,2.1,0,0,0,2.1-2.1V9.48A2.1,2.1,0,0,0,18,7.37H13.17a.75.75,0,0,1-.53-.22l-2.12-2.1H6a2.1,2.1,0,0,0-2.1,2.1Z"/></svg>
                  ) : (
                    renderFileIconSop(item.name, 22)
                  )}
                  <span style={{ fontSize: 13, color: isRestoring ? '#aaa' : '#1f1f1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                </div>
                <div className="td-cell" style={{ width: colWidths.filename, fontSize: 13, color: isRestoring ? '#ccc' : '#666', borderRight: 'none' }}>{item.filename}</div>
                <div className="td-cell" style={{ width: colWidths.user }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="user-avatar-acc" style={{ width: 24, height: 24, fontSize: 10, background: isRestoring ? '#eee' : '#f5c6cb', color: isRestoring ? '#ccc' : 'white' }}>{item.deletedBy.initials}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <span style={{ fontSize: 13, color: isRestoring ? '#aaa' : '#1f1f1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.deletedBy.name}</span>
                        <span style={{ fontSize: 11, color: isRestoring ? '#ddd' : '#999' }}>Trial account ysan...</span>
                      </div>
                   </div>
                </div>
                <div className="td-cell" style={{ width: colWidths.date, fontSize: 13, color: isRestoring ? '#ccc' : '#666', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 12 }}>
                   <span>{item.date}</span>
                   {!isRestoring && (
                     <button 
                      onClick={() => onRestore(item.id)}
                      className="restore-btn-acc"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: 4 }}
                      title="Restaurar"
                     >
                       <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/></svg>
                     </button>
                   )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ height: 32, borderTop: '1px solid #f2f2f2', display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: 12, color: '#666', background: '#fff' }}>
          Mostrando {items.length} elementos
        </div>
      </div>
    </div>
  );
}

function FilesPage({ project, user, onBack, onLogout }) {
  const projectPrefix = `proyectos/${project.name.replace(/ /g, '_')}`;
  const [currentPath, setCurrentPath] = useState(projectPrefix + '/');
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const [isTrashMode, setIsTrashMode] = useState(false);
  const [deletedItems, setDeletedItems] = useState([]);
  const [selectedDeletedIds, setSelectedDeletedIds] = useState([]);
  const [restoringIds, setRestoringIds] = useState({}); // { [id]: true }
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [newFolderParentPath, setNewFolderParentPath] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [activeFile, setActiveFile] = useState(null);
  const [showVersions, setShowVersions] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTask, setDeleteTask] = useState({ ids: [], count: 0 });
  const [viewedVersionInfo, setViewedVersionInfo] = useState(null);
  const [versionHistory, setVersionHistory] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ total: 0, current: 0 });
  // office preview state extracted to DocumentViewer

  const [showSopToast, setShowSopToast] = useState(false);
  const [sopMinimized, setSopMinimized] = useState(false);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [showUploadMenu, setShowUploadMenu] = useState(false);

  // -- CHUNKED UPLOAD ENGINE (Resumable, 3 concurrent, 8MB chunks) --
  const chunkedUpload = useChunkedUpload(API, projectPrefix, user, {
    onUploadComplete: (item, res) => {
      if (res.version && res.version > 1) {
        toast.success(`Versión ${res.version} de ${item.filename} guardada exitosamente`);
      } else {
        toast.success(`${item.filename} guardado exitosamente`);
      }
      cacheMethods.invalidateNode(item.folderPath || '__root__');
    }
  });
  const { methods: cacheMethods, cacheVersion } = useFolderCache(API, projectPrefix);
  const [pendingBanner, setPendingBanner] = useState(null);
  const [moveState, setMoveState] = useState({ step: 0, items: [], itemIds: [], destPath: '', destId: null });
  const [projectRootId, setProjectRootId] = useState(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState('files');
  const [membersList, setMembersList] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Office URL fetch effect extracted to DocumentViewer

  useEffect(() => {
    const fetchRootId = async () => {
      try {
        const res = await apiFetch(`${API}/api/docs/list?path=${encodeURIComponent(projectPrefix)}&model_urn=${encodeURIComponent(projectPrefix)}`);
        if (res.ok) {
          const resp = await res.json();
          // Solo usar el ID si no es la raíz del proyecto para evitar discrepancias
          if (resp.data?.current_node_id && resp.data.current_node_id !== 'null') {
            setProjectRootId(resp.data.current_node_id);
          } else {
            setProjectRootId(null);
          }
        }
      } catch (e) { }
    };
    fetchRootId();
  }, [projectPrefix]);
  const fileRef = useRef(null);
  const [activeRowMenu, setActiveRowMenu] = useState(null); // { item, x, y, source }
  const [editingNodeId, setEditingNodeId] = useState(null); // { id, source }
  const [rightClickedId, setRightClickedId] = useState(null);
  const [processingIds, setProcessingIds] = useState({}); // { [id]: true }
  const [showShareModal, setShowShareModal] = useState(false);
  const [permissionsFolder, setPermissionsFolder] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);
  const [shareGeneralAccess, setShareGeneralAccess] = useState('restricted'); // 'restricted' | 'anyone'
  const [shareGeneralRole, setShareGeneralRole] = useState('viewer'); // 'viewer' | 'commenter' | 'editor'
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [sharedUsers, setSharedUsers] = useState([]);
  const [searchShareUser, setSearchShareUser] = useState('');
  const [showShareResults, setShowShareResults] = useState(false);
  
  // Mock de usuarios para búsqueda híbrida
  const allProjectUsers = [
    { email: 'omarsanchezh8@gmail.com', name: 'Yaser Omar', initials: 'YO' },
    { email: 'admin@visor.com', name: 'Administrador', initials: 'AD' },
    { email: 'residente@obra.com', name: 'Juan Perez', initials: 'JP' },
    { email: 'supervisor@aps.com', name: 'Maria Lopez', initials: 'ML' }
  ];
  const [creatingChildParentId, setCreatingChildParentId] = useState(null);
  
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveRowMenu(null);
        setRightClickedId(null);
      }
    }
    if (activeRowMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeRowMenu]);
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

  const switchMode = (trashMode) => {
    setIsTrashMode(trashMode);
    setSelected(new Set());
    setSelectedDeletedIds([]); // También limpiar IDs de papelera
  };

  const handleFolderClick = (path) => {
    switchMode(false); // Siempre volver a archivos normales al navegar por el árbol
    setCurrentPath(path);
    setSearchQuery('');
    setTableShowVersions(false);
    setSelected(new Set());
    triggerRefresh(path);
  };

  useEffect(() => {
    if (activeFile && activeFile.type !== 'folder') {
      fetchVersionHistory(activeFile);
      // Initialize viewedVersionInfo with null so it defaults to latest path
      setViewedVersionInfo(null);
    }
  }, [activeFile]);

  const fetchVersionHistory = async (item) => {
    setLoadingVersions(true);
    setVersionHistory([]);
    try {
      const resp = await apiFetch(`${API}/api/docs/versions?id=${item.id || encodeURIComponent(item.fullName)}&model_urn=${encodeURIComponent(projectPrefix)}`);
      const data = await resp.json();
      if (data.success) setVersionHistory(data.versions || []);
    } catch (e) { console.error(e); }
    finally { setLoadingVersions(false); }
  };

  const handlePromote = async (version) => {
    const target = versionTarget || activeFile;
    if (!target) return;
    
    try {
      const resp = await apiFetch(`${API}/api/docs/versions/promote`, {
        method: 'POST',
                body: JSON.stringify({ id: target.id, version_id: version.id, user: user?.name, model_urn: projectPrefix })
      });
      if (resp.ok) {
        setTableShowVersions(false);
        setShowVersions(false);
        triggerRefresh();
        
        // Si estamos viendo el archivo, cerrar y reabrir para refrescar el contenido
        if (activeFile && activeFile.id === target.id) {
          setActiveFile(null);
          setViewedVersionInfo(null);
        }
        
        alert(`Versión ${version.version_number} promocionada exitosamente.`);
      } else {
        const error = await resp.json();
        alert(`Error al promocionar: ${error.error || 'Desconocido'}`);
      }
    } catch (e) { console.error(e); }
  };

  const fetchSeqRef = useRef(0);

  const fetchContents = useCallback(async (path, trash = false, silent = false, nodeId = null) => {
    const seq = ++fetchSeqRef.current;
    if (!silent) {
      setLoading(true);
    }
    try {
      const endpoint = trash 
        ? `/api/docs/deleted?model_urn=${encodeURIComponent(projectPrefix)}` 
        : `/api/docs/list?path=${encodeURIComponent(path)}${nodeId ? `&id=${nodeId}` : ''}&model_urn=${encodeURIComponent(projectPrefix)}`;
      const res = await apiFetch(`${API}${endpoint}`, { headers: getAuthHeaders() });
      if (seq !== fetchSeqRef.current) return; // stale response, discard
      if (res.ok) {
        const response = await res.json();
        if (seq !== fetchSeqRef.current) return; // stale response, discard
        const data = response.data || {};
        setFolders((data.folders || []).map(f => ({...f, type: 'folder'})).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })));
        setFiles((data.files || []).map(f => ({...f, type: 'file'})).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })));
        
        if (trash) {
          const allDel = [...(data.folders || []), ...(data.files || [])].map(it => ({
            ...it,
            type: it.node_type?.toLowerCase() || (it.fullName?.endsWith('/') ? 'folder' : 'file'),
            filename: it.name,
            deletedBy: { name: it.updated_by || 'Sistema', initials: getInitials(it.updated_by || 'Sistema') },
            date: formatDate(it.updated)
          }));
          setDeletedItems(allDel);
        }
      }
    } catch (e) { console.error(e); }
    finally { if (!silent && seq === fetchSeqRef.current) setLoading(false); }
  }, []);

  const triggerRefresh = (path = currentPath) => { 
    fetchContents(path, isTrashMode, true, isTrashMode ? null : currentNodeId); 
    setRefreshSignal(prev => prev + 1); 
  };

  useEffect(() => { 
    fetchContents(currentPath, isTrashMode, false, isTrashMode ? null : currentNodeId); 
  }, [currentPath, isTrashMode, currentNodeId, fetchContents]); 
  // Actually, better to include it and make navigate only set the states.

  const navigate = (path, id = null) => {
    // Normalizar path para comparar con raíz
    const normalizedPath = path.replace(/\/$/, '');
    const isRoot = normalizedPath === projectPrefix;
    
    const finalId = isRoot ? null : id;
    const finalPath = path.endsWith('/') ? path : path + '/';

    if (finalPath === currentPath && finalId === currentNodeId) return;
    
    setLoading(true);
    setFolders([]); 
    setFiles([]); 
    setCurrentPath(finalPath); 
    setCurrentNodeId(finalId);
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

  // -- CHUNKED UPLOAD: Handle file selection --
  const handleSopUpload = async (fileList) => {
    if (!isAdmin || !fileList?.length) return;
    setShowUploadModal(true);
    chunkedUpload.addFiles(fileList, currentPath);
  };

  // -- Watch for completed uploads to trigger refresh --
  const prevCompletedRef = useRef(0);
  useEffect(() => {
    if (chunkedUpload.completedCount > prevCompletedRef.current) {
      triggerRefresh(currentPath);
    }
    prevCompletedRef.current = chunkedUpload.completedCount;
  }, [chunkedUpload.completedCount]);

  // -- Check for pending uploads on mount --
  useEffect(() => {
    const checkPending = async () => {
      try {
        const token = localStorage.getItem('visor_session_token') || sessionStorage.getItem('visor_session_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await apiFetch(`${API}/api/uploads/pending?model_urn=${encodeURIComponent(projectPrefix)}&user=${encodeURIComponent(user?.name || '')}`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.sessions?.length > 0) {
            setPendingBanner({ count: data.sessions.length, sessions: data.sessions });
          }
        }
      } catch (_) { /* ignore */ }
    };
    checkPending();
  }, [projectPrefix]);

  const handleSopListo = () => {
    setShowUploadModal(false);
    chunkedUpload.clearCompleted();
    triggerRefresh();
    setShowSopToast(true);
    setTimeout(() => setShowSopToast(false), 3000);
  };

  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) handleSopUpload(e.dataTransfer.files); };

  const createFolder = async () => {
    if (!isAdmin || !folderName.trim()) return;
    const targetPath = (newFolderParentPath || currentPath) + ( (newFolderParentPath || currentPath).endsWith('/') ? '' : '/' ) + folderName.trim() + '/';
    const parentId = newFolderParentPath || (currentPath.startsWith(projectPrefix) && (currentPath === projectPrefix || currentPath === projectPrefix + '/') ? null : currentPath);
    if (parentId && parentId.length > 30) setProcessingIds(prev => ({ ...prev, [parentId]: true }));
    try { 
      const res = await apiFetch(`${API}/api/docs/folder`, { 
        method: 'POST', 
                body: JSON.stringify({ 
          path: targetPath, 
          model_urn: projectPrefix, 
          user: user?.name 
        }) 
      }); 
      if (res.ok) {
        setShowNewFolder(false); 
        setFolderName(''); 
        setNewFolderParentPath('');
        setRefreshSignal(s => s + 1);
        triggerRefresh();
      } else {
        const err = await res.json();
        alert("Error: " + (err.error || "No se pudo crear la carpeta"));
      }
    } catch (e) { console.error(e); }
    finally {
      if (parentId) setProcessingIds(prev => { const n = { ...prev }; delete n[parentId]; return n; });
    }
  };

  const deleteSpecificItem = async (fullName, id) => {
    if (!isAdmin) return;
    const target = folders.find(f => f.id === id) || files.find(f => f.id === id);
    if (!target) return;

    if (id) setProcessingIds(prev => ({ ...prev, [id]: true }));
    
    try { 
      const res = await apiFetch(`${API}/api/docs/delete`, { 
        method: 'DELETE', 
                body: JSON.stringify({ fullName, id: id, model_urn: projectPrefix, user: user.name }) 
      }); 
      if (res.ok) {
        setRefreshSignal(s => s + 1);
        triggerRefresh(currentPath);
        if (currentPath === fullName || currentPath.startsWith(fullName)) {
          setCurrentPath(projectPrefix);
          setCurrentNodeId(null);
        }
      }
    } catch (e) { console.error(e); }
    finally {
      if (id) setProcessingIds(prev => { const n = { ...prev }; delete n[id]; return n; });
    }
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
    try { await apiFetch(`${API}/api/docs/rename`, { 
      method: 'PUT', 
            body: JSON.stringify({ oldName: fullName, newName: newNamePath, model_urn: projectPrefix }) 
    }); } catch (e) { }
    triggerRefresh();
  };

  const handleExecuteMove = async () => {
    if (!isAdmin || !moveState.destPath || !moveState.itemIds?.length) return;
    const idsToMove = [...moveState.itemIds];
    setProcessingIds(prev => {
       const n = { ...prev };
       idsToMove.forEach(id => n[id] = true);
       return n;
    });
    for (const nodeId of idsToMove) {
      try { 
        const res = await apiFetch(`${API}/api/docs/move`, { 
          method: 'PUT', 
                    body: JSON.stringify({ 
            node_id: nodeId, 
            destNodeId: moveState.destId, 
            model_urn: projectPrefix,
            user: user?.email 
          }) 
        }); 
        if (!res.ok) {
          const errData = await res.json();
          alert(errData.error || "Error al desplazar");
          break;
        }
      } catch (e) { 
        console.error(e);
        alert("Error de red al desplazar");
        break;
      }
    }
    setProcessingIds(prev => {
       const n = { ...prev };
       idsToMove.forEach(id => delete n[id]);
       return n;
    });
    setMoveState({ step: 0, items: [], itemIds: [], destPath: '', destId: null }); 
    setSelected(new Set()); 
    setRefreshSignal(s => s + 1);
    triggerRefresh();
  };

  const handleExecuteBatchDelete = async () => {
    if (!isAdmin || selected.size === 0) return;
    
    // Obtener IDs de los elementos seleccionados
    const itemsToDelete = Array.from(selected);
    const itemIds = itemsToDelete.map(fn => {
      const found = [...folders, ...files].find(i => i.fullName === fn);
      return found?.id;
    }).filter(id => id !== undefined);

    if (itemIds.length === 0) return;

    setDeleteTask({ ids: itemIds, count: itemIds.length });
    setShowDeleteModal(true);
  };

  const confirmBatchDelete = async () => {
    const itemIds = deleteTask.ids;
    if (itemIds.length === 0) return;

    setShowDeleteModal(false);
    setProcessingIds(prev => {
      const n = { ...prev };
      itemIds.forEach(id => n[id] = true);
      return n;
    });

    try {
      const res = await apiFetch(`${API}/api/docs/batch`, {
        method: 'POST',
                body: JSON.stringify({
          items: itemIds,
          action: 'DELETE',
          model_urn: projectPrefix,
          user: user.name
        })
      });

      if (res.ok) {
        setSelected(new Set());
        setRefreshSignal(s => s + 1);
        triggerRefresh();
      } else {
        const errData = await res.json();
        alert(errData.error || "Error al suprimir elementos");
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión al suprimir elementos");
    } finally {
      setProcessingIds(prev => {
        const n = { ...prev };
        itemIds.forEach(id => delete n[id]);
        return n;
      });
      setDeleteTask({ ids: [], count: 0 });
    }
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
          <div className="header-user" style={{ position: 'relative' }}>
             <div className="header-avatar" onClick={() => setProfileMenuOpen(!profileMenuOpen)} style={{ width: 32, height: 32, borderRadius: '50%', background: '#ff6b35', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{getInitials(user.name)}</div>
             {profileMenuOpen && (
               <div style={{ position: 'absolute', top: 40, right: 0, background: '#fff', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,.15)', minWidth: 220, zIndex: 9999, border: '1px solid #e5e5e5', overflow: 'hidden' }}>
                 <div style={{ padding: '14px 16px', borderBottom: '1px solid #eee' }}>
                   <div style={{ fontWeight: 600, fontSize: 13, color: '#333' }}>{user.name}</div>
                   <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{user.email}</div>
                   <div style={{ fontSize: 10, color: '#0696d7', marginTop: 4, textTransform: 'uppercase', fontWeight: 600 }}>{user.role || 'user'}</div>
                 </div>
                 <button onClick={() => { setProfileMenuOpen(false); onBack(); }} style={{ width: '100%', padding: '10px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#333' }}
                   onMouseOver={e => e.currentTarget.style.background = '#f5f5f5'} onMouseOut={e => e.currentTarget.style.background = 'none'}>
                   <span style={{ fontSize: 16 }}>🔄</span> Cambiar proyecto
                 </button>
                 <button onClick={() => { setProfileMenuOpen(false); if (onLogout) onLogout(); }} style={{ width: '100%', padding: '10px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#e53935', borderTop: '1px solid #eee' }}
                   onMouseOver={e => e.currentTarget.style.background = '#fff5f5'} onMouseOut={e => e.currentTarget.style.background = 'none'}>
                   <span style={{ fontSize: 16 }}>🚪</span> Cerrar sesión
                 </button>
               </div>
             )}
          </div>
        </div>
      </header>

      <main className="acc-main-layout" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* GLOBAL SIDEBAR */}
        <div className="Box__StyledBox-sc-1gnk1ba-0 cFPGUB" style={{ width: globalSidebarWidth, flexShrink: 0, borderRight: '1px solid #dcdcdc', background: '#fff', display: 'flex', flexDirection: 'column' }}>
          <div className="Box__StyledBox-sc-1gnk1ba-0 hhhhUH" style={{ flex: 1, overflowY: 'auto' }}>
            <ul data-testid="SideNavigationList" style={{ listStyle: 'none', padding: '8px 0', margin: 0 }}>
              {[
                { label: 'Archivos', mode: 'files', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5,5l2,2H20v12h-16V5H12.5 M13.17,3h-10.34A1.83,1.83,0,0,0,1,4.83v14.34A1.83,1.83,0,0,0,2.83,21h18.34A1.83,1.83,0,0,0,23,19.17V6.83A1.83,1.83,0,0,0,21.17,5H14.83Z"/></svg>, onClick: () => { setSidebarView('files'); switchMode(false); } },
                { label: 'Informes', mode: 'reports', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M19,3H5C3.9,3,3,3.9,3,5v14c0,1.1,0.9,2,2,2h14c1.1,0,2-0.9,2-2V5C21,3.9,20.1,3,19,3z M9,17H7v-7h2V17z M13,17h-2V7h2V17z M17,17h-2v-4h2V17z"/></svg>, onClick: () => setSidebarView('reports') },
                { label: 'Miembros', mode: 'members', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>, onClick: () => { setSidebarView('members'); setMembersLoading(true); apiFetch(`${API}/api/users`).then(r => r.json()).then(d => setMembersList(d.users || d || [])).catch(() => setMembersList([])).finally(() => setMembersLoading(false)); } },
                { label: 'Configuración', mode: 'settings', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>, onClick: () => setSidebarView('settings') }
              ].map((item, idx) => (
                <li key={idx} style={{ marginBottom: 2 }}>
                  <button 
                    onClick={() => { if (item.onClick) item.onClick(); }}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 12, 
                      width: '100%',
                      padding: '8px 12px', 
                      background: sidebarView === item.mode && !isTrashMode ? '#e8f0fe' : 'none', 
                      border: 'none',
                      color: sidebarView === item.mode && !isTrashMode ? '#0696d7' : '#5f6368', 
                      fontSize: '13px', 
                      fontWeight: sidebarView === item.mode && !isTrashMode ? '500' : '400', 
                      borderRadius: '0 20px 20px 0',
                      cursor: 'pointer' 
                    }}
                  >
                    {item.icon}
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                  </button>
                </li>
              ))}
              
              <li style={{ marginBottom: 2 }}>
                <button 
                  onClick={() => switchMode(true)} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 12, 
                    width: '100%', 
                    padding: '8px 12px', 
                    background: isTrashMode ? '#e8f0fe' : 'none', 
                    border: 'none', 
                    color: isTrashMode ? '#0696d7' : '#5f6368', 
                    fontSize: '13px', 
                    fontWeight: isTrashMode ? '500' : '400', 
                    cursor: 'pointer', 
                    borderRadius: '0 20px 20px 0',
                    transition: 'background 0.2s'
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M11 15H5a2.25 2.25 0 0 1-2.25-2.25V5.72a.75.75,0,0,1 1.5 0v7.07a.74.74,0,0,0 .75.75h6a.74.74,0,0,0 .75-.75V5.72a.75.75,0,0,1 1.5 0v7.07A2.25 2.25 0 0 1 11 15Zm3-12h-3a2.26 2.26 0 0 0-2.24-2h-1.5A2.26 2.26 0 0 0 5 3H2a.75.75,0,0,0 0 1.5h12A.75.75,0,0,0,14 3Zm-3.75 8V7.22a.75.75,0,0,0-1.5 0V11a.75.75,0,0,0 1.5 0Zm-3 0V7.22a.75.75,0,0,0-1.5 0V11a.75.75,0,0,0 1.5 0Z"></path></svg>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Elementos suprimidos</span>
                </button>
              </li>
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

        {sidebarView === 'reports' && (
          <div style={{ padding: 32, flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: 24, fontWeight: 300, marginBottom: 24 }}>Informes</div>
            <div style={{ background: '#f8f9fa', borderRadius: 12, padding: 48, textAlign: 'center', border: '2px dashed #dcdcdc' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="#b0b0b0" style={{ marginBottom: 16 }}><path d="M19,3H5C3.9,3,3,3.9,3,5v14c0,1.1,0.9,2,2,2h14c1.1,0,2-0.9,2-2V5C21,3.9,20.1,3,19,3z M9,17H7v-7h2V17z M13,17h-2V7h2V17z M17,17h-2v-4h2V17z"/></svg>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#333', marginBottom: 8 }}>Informes del Proyecto</div>
              <div style={{ fontSize: 13, color: '#888', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
                Los informes generados (análisis de documentos, reportes LSDTs, métricas del proyecto) aparecerán aquí.
              </div>
              <div style={{ marginTop: 24, padding: '10px 20px', background: '#e8f0fe', borderRadius: 6, display: 'inline-block', color: '#0696d7', fontSize: 13, fontWeight: 500 }}>
                Próximamente disponible
              </div>
            </div>
          </div>
        )}

        {sidebarView === 'members' && (
          <div style={{ padding: 32, flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div style={{ fontSize: 24, fontWeight: 300 }}>Miembros</div>
              <div style={{ fontSize: 13, color: '#888' }}>{membersList.length} miembro{membersList.length !== 1 ? 's' : ''} registrado{membersList.length !== 1 ? 's' : ''}</div>
            </div>
            {membersLoading ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#888' }}>Cargando miembros...</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #eee', color: '#888', fontWeight: 500 }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Nombre</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Email</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Rol</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Registro</th>
                  </tr>
                </thead>
                <tbody>
                  {membersList.map((m, i) => (
                    <tr key={m.id || i} style={{ borderBottom: '1px solid #f0f0f0' }}
                      onMouseOver={e => e.currentTarget.style.background = '#fafbfc'}
                      onMouseOut={e => e.currentTarget.style.background = 'none'}>
                      <td style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: m.role === 'admin' ? '#0696d7' : '#ff6b35', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                          {getInitials(m.name || m.email || '?')}
                        </div>
                        <span style={{ fontWeight: 500 }}>{m.name || '—'}</span>
                      </td>
                      <td style={{ padding: '12px', color: '#666' }}>{m.email}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                          background: m.role === 'admin' ? '#e3f2fd' : '#f3e5f5',
                          color: m.role === 'admin' ? '#1565c0' : '#7b1fa2'
                        }}>{m.role || 'user'}</span>
                      </td>
                      <td style={{ padding: '12px', color: '#999', fontSize: 12 }}>{m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {sidebarView === 'settings' && (
          <div style={{ padding: 32, flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: 24, fontWeight: 300, marginBottom: 24 }}>Configuración</div>
            
            {/* Info del Proyecto */}
            <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#0696d7"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                Información del Proyecto
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '12px 16px', fontSize: 13 }}>
                <span style={{ color: '#888', fontWeight: 500 }}>Nombre:</span>
                <span style={{ color: '#333' }}>{project.name}</span>
                <span style={{ color: '#888', fontWeight: 500 }}>Número:</span>
                <span style={{ color: '#333' }}>{project.number || '—'}</span>
                <span style={{ color: '#888', fontWeight: 500 }}>Ubicación:</span>
                <span style={{ color: '#333' }}>{project.location || '—'}</span>
                <span style={{ color: '#888', fontWeight: 500 }}>Cuenta:</span>
                <span style={{ color: '#333' }}>{project.account || project.hub_name || '—'}</span>
                <span style={{ color: '#888', fontWeight: 500 }}>Creado:</span>
                <span style={{ color: '#333' }}>{project.created_at ? new Date(project.created_at).toLocaleDateString() : '—'}</span>
              </div>
            </div>

            {/* Almacenamiento */}
            <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#0696d7"><path d="M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z"/></svg>
                Almacenamiento
              </div>
              <div style={{ fontSize: 13, color: '#888' }}>Google Cloud Storage — activo</div>
              <div style={{ marginTop: 12, background: '#f5f5f5', borderRadius: 8, height: 8, overflow: 'hidden' }}>
                <div style={{ width: '15%', height: '100%', background: 'linear-gradient(90deg, #0696d7, #4fc3f7)', borderRadius: 8 }} />
              </div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>Uso estimado del proyecto</div>
            </div>

            {/* Registro de Actividad */}
            <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#0696d7"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
                Registro de Actividad
              </div>
              <div style={{ fontSize: 13, color: '#888', padding: 24, textAlign: 'center', background: '#fafafa', borderRadius: 8 }}>
                El historial de acciones (subidas, eliminaciones, renombrados) se mostrará aquí. Próximamente.
              </div>
            </div>

            {/* Etiquetas */}
            <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#0696d7"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>
                Etiquetas
              </div>
              <div style={{ fontSize: 13, color: '#888', padding: 24, textAlign: 'center', background: '#fafafa', borderRadius: 8 }}>
                Gestión de etiquetas y tags para documentos. Próximamente.
              </div>
            </div>
          </div>
        )}

        {sidebarView === 'files' && (<>
          <header style={{ padding: '24px 24px 0 24px', flexShrink: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 300, marginBottom: 16 }}>
              {isTrashMode ? 'Elementos suprimidos' : 'Archivos'}
            </div>
            {!isTrashMode && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #dcdcdc' }}>
                <div style={{ display: 'flex', gap: 32 }}>
                  <div style={{ paddingBottom: 8, fontSize: 13, borderBottom: '2px solid #0696d7', color: '#0696d7', fontWeight: 600, cursor: 'pointer' }}>Carpetas</div>
                  <div style={{ paddingBottom: 8, fontSize: 13, color: '#999', cursor: 'pointer' }}>Conjuntos</div>
                </div>
                <div style={{ display: 'flex', gap: 20, paddingBottom: 8 }}>
                   <button onClick={() => switchMode(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: '#666', fontSize: 13, cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}>
                     <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor"><path d="M11 15H5a2.25 2.25 0 0 1-2.25-2.25V5.72a.75.75,0,0,1 1.5 0v7.07a.74.74,0,0,0 .75.75h6a.74.74,0,0,0 .75-.75V5.72a.75.75,0,0,1 1.5 0v7.07A2.25 2.25 0 0 1 11 15Zm3-12h-3a2.26 2.26 0 0 0-2.24-2h-1.5A2.26 2.26 0 0 0 5 3H2a.75.75,0,0,0 0 1.5h12A.75.75,0,0,0,14 3Zm-3.75 8V7.22a.75.75,0,0,0-1.5 0V11a.75.75,0,0,0 1.5 0Zm-3 0V7.22a.75.75,0,0,0-1.5 0V11a.75.75,0,0,0 1.5 0Z"></path></svg>
                     Elementos suprimidos
                   </button>
                   <button style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: '#666', fontSize: 13, cursor: 'pointer' }}>
                     <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14.75 3.53a.76.76,0,0,1-.75.75H7.18a1.78,1.78,0,0,1-3.25,0H2a.75.75,0,0,1,0-1.5h1.93a1.78,1.78,0,0,1,3.25,0H14a.75.75,0,0,1,.75.75ZM14 12.1H7.18a1.79,1.79,0,0,0-3.25,0H2a.75.75,0,0,0,0,1.5h1.93a1.78,1.78,0,0,0,3.25,0H14a.75.75,0,0,0,0-1.5Zm0-4.64h-1.91a1.8,1.8,0,0,0-1.64-1.06 1.78,1.78,0,0,0-1.63,1.06H2A.75.75,0,0,0,2,9h6.84a1.77,1.77,0,0,0,1.61,1 1.8,1.8,0,0,0,1.62-1H14a.75.75,0,0,0,0-1.5Z"></path></svg>
                     Configuración
                   </button>
                </div>
              </div>
            )}
            {isTrashMode && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #dcdcdc', paddingBottom: 8 }}>
                 <button onClick={() => switchMode(false)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: '#666', fontSize: 13, cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}>
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
                   Volver a archivos
                 </button>
                 {isAdmin && selectedDeletedIds.length > 0 && (
                   <button 
                     onClick={async () => {
                       const count = selectedDeletedIds.length;
                       if (!window.confirm('Eliminar PERMANENTEMENTE ' + count + ' elemento(s)?')) return;
                       console.log('[PERM-DELETE] Starting for', count, 'items');
                       let deleted = 0;
                       for (const id of selectedDeletedIds) {
                         try {
                           console.log('[PERM-DELETE] Deleting:', id);
                           const res = await apiFetch(`${API}/api/docs/permanent-delete`, {
                             method: 'DELETE',
                             body: JSON.stringify({ id, model_urn: projectPrefix, user: user.name })
                           });
                           console.log('[PERM-DELETE] Response:', res.status);
                           if (res.ok) {
                             deleted++;
                           } else {
                             const errBody = await res.text();
                             console.error('[PERM-DELETE] FAILED:', res.status, errBody);
                             alert('Error eliminando: ' + errBody);
                           }
                         } catch (e) { console.error('[PERM-DELETE] Error:', e); alert('Error: ' + e.message); }
                       }
                       setDeletedItems(prev => prev.filter(it => !selectedDeletedIds.includes(it.id)));
                       setSelectedDeletedIds([]);
                       triggerRefresh(currentPath);
                       alert(deleted + ' de ' + count + ' eliminado(s) permanentemente.');
                     }}
                     style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#d32f2f', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', padding: '6px 14px', borderRadius: 4, fontWeight: 600 }}
                   >
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                     Eliminar permanentemente ({selectedDeletedIds.length})
                   </button>
                 )}
              </div>
            )}
          </header>

          <div className="acc-workspace" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* TREE SECTION */}
            <aside style={{ width: treeSidebarWidth, flexShrink: 0, borderRight: '1px solid #dcdcdc', background: '#fff', overflowY: 'auto', padding: '16px 0' }}>
              <FolderNode
                user={user}
                folder={{ id: projectRootId, name: 'Archivos de proyecto', fullName: projectPrefix }}
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
                onRowMenu={(item, e) => {
                  if (isAdmin) {
                    setRightClickedId(item.id);
                    setActiveRowMenu({ item, x: e.clientX, y: e.clientY, source: 'sidebar' });
                  }
                }}
                editingNodeId={editingNodeId}
                setEditingNodeId={setEditingNodeId}
                rightClickedId={rightClickedId}
                processingIds={processingIds}
                setProcessingIds={setProcessingIds}
                creatingChildParentId={creatingChildParentId}
                setCreatingChildParentId={setCreatingChildParentId}
                cacheMethods={cacheMethods}
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
                   <button onClick={() => setShowUploadModal(true)} style={{ padding: '6px 16px', background: '#0696D7', color: '#fff', border: 'none', borderRadius: '4px 0 0 4px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                      Cargar archivos
                   </button>
                   <button onClick={() => setShowUploadModal(true)} style={{ padding: '6px 8px', background: '#0696D7', color: '#fff', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.3)', borderRadius: '0 4px 4px 0', cursor: 'pointer' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5H7z"/></svg>
                   </button>
                </div>

                {!isTrashMode && selected.size > 0 && (
                  <>
                    <button 
                      onClick={() => {
                        const itemsToMove = Array.from(selected);
                        const itemIds = itemsToMove.map(fn => {
                          const found = [...folders, ...files].find(i => i.fullName === fn);
                          return found?.id;
                        }).filter(id => id !== undefined);
                        setMoveState({ step: 1, items: itemsToMove, itemIds, destPath: '', destId: null });
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: '#0696D7', fontSize: 13, cursor: 'pointer', padding: '6px 8px' }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        <path d="M12 11l3 3-3 3"></path>
                        <path d="M9 14h6"></path>
                      </svg>
                      Desplazar
                    </button>

                    <button 
                      onClick={handleExecuteBatchDelete}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: '#ff4d4d', fontSize: 13, cursor: 'pointer', padding: '6px 8px' }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                      Suprimir
                    </button>

                  </>
                )}
                
                {isTrashMode && selectedDeletedIds.length > 0 && (
                  <button 
                    onClick={() => {
                      const ids = [...selectedDeletedIds];
                      const newRestoring = { ...restoringIds };
                      ids.forEach(id => { newRestoring[id] = true; });
                      setRestoringIds(newRestoring);
                      
                      setTimeout(async () => {
                        // Realizar restauración masiva en backend
                        try {
                          const res = await Promise.all(ids.map(id => 
                            apiFetch(`${API}/api/docs/restore`, {
                               method: 'POST',
                                                              body: JSON.stringify({ id, model_urn: projectPrefix, user: user.name })
                            })
                          ));
                          const allOk = res.every(r => r.ok);
                          if (!allOk) {
                            alert("No se pudieron restaurar algunos archivos. Verifique si ya existen elementos con el mismo nombre en el destino.");
                          }
                        } catch(e) {
                          alert("Error de conexión al restaurar");
                        }

                        setDeletedItems(prev => prev.filter(it => !ids.includes(it.id)));
                        setSelectedDeletedIds([]);
                        setRestoringIds(prev => {
                          const cleared = { ...prev };
                          ids.forEach(id => { delete cleared[id]; });
                          return cleared;
                        });
                        triggerRefresh(currentPath);
                      }, 1000);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #747775', borderRadius: 4, color: '#1f1f1f', fontSize: 13, fontWeight: 500, padding: '6px 12px', cursor: 'pointer' }}
                  >
                     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/></svg>
                     Restaurar ({selectedDeletedIds.length})
                  </button>
                )}

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
                ) : isTrashMode ? (
                    <DeletedTable 
                      items={deletedItems} 
                      selectedIds={selectedDeletedIds} 
                      onToggle={setSelectedDeletedIds}
                      onRestore={(id) => {
                        setRestoringIds(prev => ({ ...prev, [id]: true }));
                        setTimeout(async () => {
                          try {
                            const res = await apiFetch(`${API}/api/docs/restore`, {
                               method: 'POST',
                               headers: getAuthHeaders(),
                               body: JSON.stringify({ id, model_urn: projectPrefix, user: user.name })
                            });
                            if (!res.ok) {
                              const errData = await res.json().catch(() => ({}));
                              alert(errData.error || "No se pudo restaurar el elemento. Verifique si ya existe uno con el mismo nombre en el destino.");
                            }
                          } catch(e) {
                            alert("Error de conexión al restaurar");
                          }

                          setDeletedItems(prev => prev.filter(it => it.id !== id));
                          setSelectedDeletedIds(prev => prev.filter(x => x !== id));
                          setRestoringIds(prev => {
                            const cleared = { ...prev };
                            delete cleared[id];
                            return cleared;
                          });
                          triggerRefresh(currentPath);
                        }, 1000);
                      }}
                      getInitials={getInitials}
                      renderFileIconSop={renderFileIconSop}
                      restoringIds={restoringIds}
                    />
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
                            const res = await apiFetch(`${API}/api/docs/description`, {
                              method: 'POST',
                                                            body: JSON.stringify({ node_id: item.id, description: newDesc, model_urn: projectPrefix })
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
                          setProcessingIds(prev => ({ ...prev, [item.id]: true }));
                          // Optimistic update — change name locally immediately
                          if (item.type === 'folder') {
                            setFolders(prev => prev.map(f => f.id === item.id ? { ...f, name: newName } : f));
                          } else {
                            setFiles(prev => prev.map(f => f.id === item.id ? { ...f, name: newName } : f));
                          }
                          try {
                            const res = await apiFetch(`${API}/api/docs/rename`, {
                              method: 'POST',
                              body: JSON.stringify({ node_id: item.id, new_name: newName, model_urn: projectPrefix })
                            });
                            if (res.ok) {
                              console.log('Rename success');
                              // Notificar al arbol lateral para que se sincronice el nombre
                              setRefreshSignal(s => s + 1);
                            } else {
                              console.error('Rename failed:', res.status);
                              triggerRefresh(currentPath); // Revert to DB state
                            }
                          } catch (e) {
                            console.error('Error renaming:', e);
                            triggerRefresh(currentPath);
                          } finally {
                            setProcessingIds(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                          }
                        }}
                        formatSize={formatSize}
                        formatDate={formatDate}
                        getInitials={getInitials}
                        user={user}
                        isAdmin={isAdmin}
                        isTrashMode={isTrashMode}
                        onShowVersions={onShowVersions}
                        onRowMenu={(item, e) => { 
                          if (isAdmin) {
                            setRightClickedId(item.id);
                            setActiveRowMenu({ item, x: e.clientX, y: e.clientY, source: 'table' }); 
                          }
                        }}
                        editingNodeId={editingNodeId}
                        setEditingNodeId={setEditingNodeId}
                        processingIds={processingIds}
                        rightClickedId={rightClickedId}
                        startResizing={startResizing}
                        setSelected={setSelected}
                        renderFileIconSop={renderFileIconSop}
                        onStatusChange={async (item, newStatus) => {
                          // Optimistic update
                          setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: newStatus } : f));
                          try {
                            const res = await apiFetch(`${API}/api/docs/batch`, {
                              method: 'POST',
                              body: JSON.stringify({
                                items: [item.id],
                                action: 'SET_STATUS',
                                status: newStatus,
                                model_urn: projectPrefix,
                                user: user?.name
                              })
                            });
                            if (!res.ok) {
                              const err = await res.json().catch(() => ({}));
                              alert(err.error || 'Error al cambiar estado');
                              triggerRefresh(currentPath); // Revert
                            }
                          } catch (e) {
                            console.error('Error updating status:', e);
                            triggerRefresh(currentPath);
                          }
                        }}
                    />
                )}
              </div>
              <footer style={{ padding: '8px 16px', fontSize: 13, color: '#666', borderTop: '1px solid #eee', background: '#fff', flexShrink: 0 }}>
                {selected.size > 0 
                  ? `${selected.size} de ${folders.length + files.length} seleccionados` 
                  : `Mostrando ${folders.length + files.length} elementos`
                }
              </footer>
            </section>
        </div>
        </>)}
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
              const token = localStorage.getItem('visor_session_token') || sessionStorage.getItem('visor_session_token');
              const tokenQuery = token ? `&session_token=${token}` : '';
              if (versionRowMenu.v.gcs_urn) window.open(`${API}/api/docs/view?urn=${encodeURIComponent(versionRowMenu.v.gcs_urn)}&model_urn=${encodeURIComponent(projectPrefix)}${tokenQuery}`, '_blank');
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
          <div className="row-context-menu" 
            ref={menuRef}
            style={{ 
              position: 'fixed', 
              top: activeRowMenu.y, 
              left: Math.min(window.innerWidth - 230, activeRowMenu.x), 
              width: 220,
              zIndex: 10001
            }} 
          >
            {activeRowMenu.item.type === 'folder' && (
              <button onClick={() => { setActiveRowMenu(null); setRightClickedId(null); setCreatingChildParentId(activeRowMenu.item.id || activeRowMenu.item.fullName); }}>
                <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></div>
                Añadir subcarpeta
              </button>
            )}
            {activeRowMenu.item.type === 'folder' && isAdmin && (
              <button onClick={() => { setActiveRowMenu(null); setRightClickedId(null); setPermissionsFolder(activeRowMenu.item); }}>
                <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg></div>
                Configuración de permisos
              </button>
            )}
            <button onClick={() => { 
                setActiveRowMenu(null); 
                setRightClickedId(null); 
                setEditingNodeId({ id: activeRowMenu.item.id || activeRowMenu.item.fullName, source: activeRowMenu.source }); 
            }}>
              <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></div>
              Cambiar nombre
            </button>
            <button onClick={() => { 
              setActiveRowMenu(null); 
              setRightClickedId(null); 
              setShareTarget(activeRowMenu.item);
              setShowShareModal(true);
            }}>
              <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg></div>
              Compartir
            </button>
            {activeRowMenu.item.type === 'folder' ? (
              <button 
                onClick={() => { 
                  setActiveRowMenu(null); 
                  setRightClickedId(null); 
                  downloadFolderAsZip(activeRowMenu.item.id || activeRowMenu.item.fullName, projectPrefix, API, activeRowMenu.item.name || 'Carpeta'); 
                }}
              >
                 <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></div>
                 Descargar Carpeta
              </button>
            ) : (
              <button onClick={() => { 
                  setActiveRowMenu(null); 
                  setRightClickedId(null);
                  const token = localStorage.getItem('visor_session_token') || sessionStorage.getItem('visor_session_token');
                  const tokenQuery = token ? `&session_token=${token}` : '';
                  if (activeRowMenu.item.gcs_urn) {
                      window.open(`${API}/api/docs/view?urn=${encodeURIComponent(activeRowMenu.item.gcs_urn)}&model_urn=${encodeURIComponent(projectPrefix)}${tokenQuery}`, '_blank');
                  }
              }}>
                <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></div>
                Descargar Archivo
              </button>
            )}
            <button onClick={() => { setActiveRowMenu(null); setRightClickedId(null); setMoveState({ step: 1, items: [activeRowMenu.item.name], itemIds: [activeRowMenu.item.id || activeRowMenu.item.fullName], destPath: '', destId: null }); }}>
               <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><path d="M12 11l3 3-3 3"></path><path d="M9 14h6"></path></svg></div>
              Desplazar
            </button>
            <div className="menu-divider" />
            <button className="delete" onClick={() => { setActiveRowMenu(null); setRightClickedId(null); deleteSpecificItem(activeRowMenu.item.fullName, activeRowMenu.item.id); }}>
              <div className="menu-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></div>
              Suprimir
            </button>
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

      {permissionsFolder && (
        <FolderPermissionsPanel
          folder={permissionsFolder}
          modelUrn={projectPrefix}
          apiBaseUrl={API}
          onClose={() => setPermissionsFolder(null)}
        />
      )}

      {activeFile && activeFile.type !== 'folder' && (
        <DocumentViewer 
          file={activeFile}
          projectPrefix={projectPrefix}
          versionHistory={versionHistory}
          viewedVersionInfo={viewedVersionInfo}
          setViewedVersionInfo={setViewedVersionInfo}
          showVersions={showVersions}
          setShowVersions={setShowVersions}
          isAdmin={isAdmin}
          onPromote={handlePromote}
          API={API}
          onClose={() => { setActiveFile(null); setShowVersions(false); setViewedVersionInfo(null); }}
        />
      )}

      {showDeleteModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}>
          <div className="modal-content" style={{ width: 448, background: '#fff', borderRadius: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div className="modal-header" style={{ height: 48, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #eee' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: '#1f1f1f' }}>
                {deleteTask.count === 1 ? '¿Suprimir elemento seleccionado?' : `¿Suprimir ${deleteTask.count} elementos seleccionados?`}
              </h3>
              <button onClick={() => setShowDeleteModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#666', cursor: 'pointer' }}>×</button>
            </div>
            <div className="modal-body" style={{ padding: '24px 16px', fontSize: 13, color: '#3c3c3c' }}>
              Los elementos seleccionados se suprimirán del proyecto.
            </div>
            <div className="modal-footer" style={{ padding: '16px', display: 'flex', justifyContent: 'flex-end', gap: 12, background: '#fcfcfc', borderTop: '1px solid #eee' }}>
              <button 
                onClick={() => setShowDeleteModal(false)} 
                style={{ padding: '8px 16px', background: '#fff', border: '1px solid #dcdcdc', borderRadius: 4, fontSize: 13, fontWeight: 500, color: '#3c3c3c', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button 
                onClick={confirmBatchDelete}
                style={{ padding: '8px 24px', background: '#d92c2c', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Suprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {moveState.step > 0 && (
        <div className="modal-overlay" onClick={() => setMoveState({ step: 0, items: [], destPath: '' })}>
          <div className="acc-modal-box" onClick={e => e.stopPropagation()} style={{ width: 500, borderRadius: 2, padding: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #eee' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 300 }}>
                {moveState.step === 1 ? (moveState.items.length > 1 ? '¿Mover elementos?' : '¿Mover carpeta?') : 'Seleccionar carpeta de destino'}
              </h3>
              <button 
                onClick={() => setMoveState({ step: 0, items: [], destPath: '' })}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}
              >✕</button>
            </div>

            <div style={{ padding: '24px', minHeight: moveState.step === 2 ? 300 : 'auto' }}>
              {moveState.step === 1 ? (
                <div style={{ fontSize: 14, color: '#333', lineHeight: 1.6 }}>
                  La carpeta heredará los permisos y los suscriptores de la carpeta de destino. Los suscriptores de la carpeta actual no se conservarán.
                </div>
              ) : (
                <div className="acc-move-tree-container" style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #eee', padding: '12px', borderRadius: 2 }}>
                  <SelectFolderNode 
                    folder={{ name: 'Archivos de proyecto', fullName: projectPrefix, id: projectRootId }} 
                    defaultExpanded={true} 
                    selectedPath={moveState.destPath} 
                    onSelect={(path, id) => setMoveState({ ...moveState, destPath: path, destId: id })} 
                    modelUrn={projectPrefix}
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 24px', borderTop: '1px solid #eee', background: '#fafafa' }}>
              {moveState.step === 2 && (
                <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 8, color: '#0696d7', fontSize: 12 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M12 16v-4m0-4h.01"/></svg>
                  <span>¿Estos archivos se sincronizan...?</span>
                </div>
              )}
              <button 
                className="acc-btn-flat" 
                onClick={() => setMoveState({ step: 0, items: [], destPath: '' })}
                style={{ padding: '8px 16px', background: 'none', border: 'none', color: '#0696d7', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button 
                className={moveState.step === 2 && !moveState.destPath ? 'acc-btn-disabled' : 'acc-btn-primary-2'} 
                disabled={moveState.step === 2 && !moveState.destPath}
                onClick={() => moveState.step === 1 ? setMoveState({ ...moveState, step: 2 }) : handleExecuteMove()}
                style={{ 
                  padding: '8px 24px', 
                  background: (moveState.step === 2 && !moveState.destPath) ? '#eeeeee' : '#0696D7', 
                  color: (moveState.step === 2 && !moveState.destPath) ? '#999' : '#fff', 
                  border: 'none', 
                  borderRadius: 4, 
                  fontWeight: 600, 
                  cursor: (moveState.step === 2 && !moveState.destPath) ? 'default' : 'pointer' 
                }}
              >
                {moveState.step === 1 ? 'Continuar' : 'Desplazar'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* -- PENDING UPLOADS BANNER -- */}
      {pendingBanner && pendingBanner.count > 0 && (
        <div style={{ position: 'fixed', top: 50, left: '50%', transform: 'translateX(-50%)', zIndex: 10001, background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 8, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxWidth: 500 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#ff9800"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
          <span style={{ fontSize: 13, color: '#333' }}>
            Tienes <strong>{pendingBanner.count}</strong> {pendingBanner.count === 1 ? 'subida pendiente' : 'subidas pendientes'} de una sesion anterior.
          </span>
          <button onClick={() => setPendingBanner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#999', padding: '0 4px' }}>X</button>
        </div>
      )}

      {showUploadModal && !sopMinimized && (
        <div className="modal-overlay" onClick={() => { if (!chunkedUpload.hasActiveUploads) setShowUploadModal(false); }}>
          <div className="acc-upload-modal" onClick={e => e.stopPropagation()}>
            <div className="acc-upload-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Cargar archivos</span>
                <span style={{ color: '#999', fontSize: 12 }}>{currentPath.split('/').filter(Boolean).pop()}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="file-viewer-close" style={{ background: 'none' }} onClick={() => setSopMinimized(true)}>-</button>
                <button className="file-viewer-close" style={{ background: 'none' }} onClick={() => { if (!chunkedUpload.hasActiveUploads) setShowUploadModal(false); else if (window.confirm('Cancelar cargas en curso?')) { chunkedUpload.cancelAll(); setShowUploadModal(false); } }}>X</button>
              </div>
            </div>
            <div className="acc-upload-body" style={{ maxHeight: 600, overflowY: 'auto' }}>
              <div className="acc-upload-entry-section" style={{ marginBottom: 20 }}>
                <button className="acc-upload-btn-secondary" style={{ width: '100%', border: '1px solid #0696d7', color: '#000', padding: '8px', marginBottom: 12, borderRadius: 2 }} onClick={() => fileRef.current.click()}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#666"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
                  Desde su equipo
                </button>
                <div className={`acc-upload-dropzone ${dragOver ? 'drag-over' : ''}`} onClick={() => fileRef.current.click()} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} style={{ border: '1px dashed #ddd', padding: '40px 20px', borderRadius: 2, textAlign: 'center' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ddd" strokeWidth="1"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15l3 3 3-3"/></svg>
                  <div style={{ color: '#999', fontSize: 13, marginTop: 12 }}>Arrastre archivos aqui o elija una opcion arriba</div>
                </div>
                <input type="file" ref={fileRef} multiple style={{ display: 'none' }} onChange={e => handleSopUpload(e.target.files)} />
              </div>
              {chunkedUpload.uploads.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 13, color: '#333', marginBottom: 16, fontWeight: 300 }}>
                    Total de {chunkedUpload.uploads.length} {chunkedUpload.uploads.length === 1 ? 'archivo' : 'archivos'}
                  </div>
                  {chunkedUpload.uploads.map(item => (
                    <div key={item.id} className="acc-upload-file-row">
                      {renderFileIconSop(item.filename, 32)}
                      <div className="acc-upload-file-info">
                        <div className="acc-upload-file-name">{item.filename}</div>
                        <div className="acc-upload-file-status" style={{ marginTop: 4 }}>
                          {item.status === 'completed' ? (
                            <div style={{ color: '#33691e', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                              {item.statusText}
                            </div>
                          ) : item.status === 'error' ? (
                            <div style={{ color: '#d32f2f', fontSize: 11 }}>{item.statusText}</div>
                          ) : item.status === 'paused' ? (
                            <div style={{ color: '#f57c00', fontSize: 11 }}>{item.statusText}</div>
                          ) : (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {(item.status === 'confirming' || item.status === 'init') && (
                                    <div className="acc-mini-spinner" style={{ width: 10, height: 10, border: '2px solid #0696d7', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1.5s linear infinite' }} />
                                  )}
                                  <span style={{ fontSize: 11, color: '#666' }}>
                                    {item.status === 'queued' ? 'En cola...' : item.status === 'init' ? 'Validando...' : item.status === 'confirming' ? 'Procesando...' : `Cargando... (${formatSize(item.bytesUploaded || 0)} / ${formatSize(item.sizeBytes || 0)})`}
                                  </span>
                                </div>
                                {item.status === 'uploading' && <span style={{ fontSize: 11, color: '#0696d7', fontWeight: 600 }}>{item.progress}%</span>}
                              </div>
                              <div className="acc-progress-container" style={{ marginTop: 6, height: 6, background: '#e8e8e8', borderRadius: 3, overflow: 'hidden' }}>
                                {item.status === 'confirming' || item.status === 'init' ? (
                                  <div className="acc-progress-bar indeterminate" style={{ height: '100%', borderRadius: 3 }} />
                                ) : (
                                  <div className="acc-progress-bar" style={{ width: `${item.progress}%`, height: '100%', borderRadius: 3, transition: 'width 0.3s ease', background: item.status === 'paused' ? '#ff9800' : '#0696d7' }} />
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#999', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ minWidth: 60, textAlign: 'right' }}>{formatSize(item.sizeBytes || 0)}</span>
                        {item.status === 'completed' ? (
                          <span style={{ color: '#0696d7', fontWeight: 600, cursor: 'pointer' }}>Ver</span>
                        ) : item.status !== 'cancelled' ? (
                          <span onClick={() => chunkedUpload.cancelUpload(item.id)} style={{ cursor: 'pointer', fontSize: 16 }}>X</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="acc-upload-footer">
              <button className="acc-btn-listo" disabled={chunkedUpload.hasActiveUploads} onClick={handleSopListo}>Listo</button>
            </div>
          </div>
        </div>
      )}

      {showSopToast && (
        <div className="acc-success-toast">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          {chunkedUpload.completedCount === 1 ? 'Un archivo se ha cargado correctamente.' : `${chunkedUpload.completedCount} archivos cargados.`}
        </div>
      )}

      {showUploadModal && sopMinimized && (
        <div className="acc-upload-monitor" style={{ position: 'fixed', bottom: 20, right: 20, width: 320, background: '#fff', border: '1px solid #ddd', borderRadius: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 10000, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: '#fcfcfc', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Cargar</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }} onClick={() => setSopMinimized(false)}>^</button>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }} onClick={() => setShowUploadModal(false)}>X</button>
            </div>
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            <div style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ fontSize: 12, color: '#333' }}>Total de {chunkedUpload.uploads.length} {chunkedUpload.uploads.length === 1 ? 'archivo' : 'archivos'}...</span>
              <span style={{ fontSize: 12, color: '#0696d7', cursor: 'pointer', fontWeight: 600 }} onClick={() => { chunkedUpload.cancelAll(); setShowUploadModal(false); }}>Cancelar todo</span>
            </div>
            {chunkedUpload.uploads.map(item => (
              <div key={item.id} style={{ padding: '12px', borderBottom: '1px solid #f9f9f9', display: 'flex', gap: 12 }}>
                {renderFileIconSop(item.filename, 28)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.filename}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    {item.status === 'completed' ? (
                      <span style={{ fontSize: 11, color: '#33691e' }}>Listo</span>
                    ) : item.status === 'error' ? (
                      <span style={{ fontSize: 11, color: '#d32f2f' }}>Error</span>
                    ) : (
                      <span style={{ fontSize: 11, color: '#666' }}>{item.status === 'paused' ? 'Pausado' : item.status === 'queued' ? 'En cola' : `Cargando: ${item.progress}%`}</span>
                    )}
                    <span style={{ fontSize: 11, color: '#999' }}>| {formatSize(item.sizeBytes || 0)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* SHARE MODAL (DRIVE STYLE REFINED) */}
      {showShareModal && shareTarget && (
        <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="share-modal-box" onClick={e => e.stopPropagation()}>
            <div className="share-header">
              <h2>Compartir "{shareTarget.name.replace(/\/$/, '')}"</h2>
              <div className="share-header-actions">
                <button className="share-icon-btn" title="Ayuda"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></button>
                <button className="share-icon-btn" title="Configuración"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></button>
              </div>
            </div>

            <div className="share-input-wrapper" style={{ position: 'relative' }}>
              <span className="share-input-label">Añadir personas, grupos y eventos de calendario</span>
              <input 
                autoFocus
                className="share-input-acc"
                placeholder=" "
                value={searchShareUser}
                onChange={e => { setSearchShareUser(e.target.value); setShowShareResults(true); }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && searchShareUser.includes('@')) {
                    setSharedUsers([...sharedUsers, { email: searchShareUser, name: searchShareUser.split('@')[0], initials: searchShareUser.slice(0,2).toUpperCase(), role: 'viewer', isExternal: true }]);
                    setSearchShareUser('');
                    setShowShareResults(false);
                  }
                }}
              />
              {showShareResults && searchShareUser && (
                <div className="share-results-popover" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', borderRadius: 8, zIndex: 100, marginTop: 4, maxHeight: 200, overflowY: 'auto', padding: '8px 0' }}>
                  {allProjectUsers.filter(u => u.name.toLowerCase().includes(searchShareUser.toLowerCase()) || u.email.toLowerCase().includes(searchShareUser.toLowerCase())).map(u => (
                    <div key={u.email} className="share-result-item" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => {
                        if (!sharedUsers.find(ex => ex.email === u.email)) setSharedUsers([...sharedUsers, { ...u, role: 'viewer', isExternal: false }]);
                        setSearchShareUser('');
                        setShowShareResults(false);
                    }}>
                      <div className="user-avatar-acc" style={{ width: 28, height: 28, fontSize: 11 }}>{u.initials}</div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</span>
                        <span style={{ fontSize: 11, color: '#666' }}>{u.email}</span>
                      </div>
                    </div>
                  ))}
                  {searchShareUser.includes('@') && (
                    <div className="share-result-item" style={{ padding: '8px 16px', borderTop: '1px solid #eee', fontSize: 13, color: '#0696D7', cursor: 'pointer' }} onClick={() => {
                      setSharedUsers([...sharedUsers, { email: searchShareUser, name: searchShareUser.split('@')[0], initials: searchShareUser.slice(0,2).toUpperCase(), role: 'viewer', isExternal: true }]);
                      setSearchShareUser('');
                      setShowShareResults(false);
                    }}>
                      Invitar a "{searchShareUser}" (Externo)
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ marginTop: 8 }}>
              <div className="share-section-title">Personas con acceso</div>
              <div className="share-access-list">
                <div className="share-user-item">
                  <div className="user-avatar-acc" style={{ width: 32, height: 32, fontSize: 13 }}>{getInitials(user?.email || 'OMAR SAN')}</div>
                  <div className="share-user-info">
                    <span className="share-user-name">{user?.name || 'Yaser Omar'} (tú)</span>
                    <span className="share-user-email">{user?.email || 'omarsanchezh8@gmail.com'}</span>
                  </div>
                  <span className="share-user-role">Propietario</span>
                </div>
                {sharedUsers.map(su => (
                  <div key={su.email} className="share-user-item">
                    <div className="user-avatar-acc" style={{ width: 32, height: 32, fontSize: 13 }}>{su.initials}</div>
                    <div className="share-user-info">
                      <span className="share-user-name">{su.name} {su.isExternal && '(Externo)'}</span>
                      <span className="share-user-email">{su.email}</span>
                    </div>
                    <select className="role-select-acc" value={su.role} onChange={e => setSharedUsers(sharedUsers.map(x => x.email === su.email ? { ...x, role: e.target.value } : x))}>
                      <option value="viewer">Lector</option>
                      <option value="commenter">Comentador</option>
                      <option value="editor">Editor</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 8 }}>
              <div className="share-section-title">Acceso general</div>
              <div className="share-general-access">
                <div className="share-access-icon" style={{ background: shareGeneralAccess === 'restricted' ? '#f1f3f4' : '#e8f0fe', color: shareGeneralAccess === 'restricted' ? '#444746' : '#0b57d0' }}>
                  {shareGeneralAccess === 'restricted' ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                  )}
                </div>
                <div className="share-access-details">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="share-access-type-row" style={{ position: 'relative' }}>
                      <select 
                        style={{ background: 'transparent', border: 'none', fontSize: 14, fontWeight: 500, color: '#1f1f1f', cursor: 'pointer', outline: 'none', paddingRight: 20, appearance: 'none' }}
                        value={shareGeneralAccess}
                        onChange={e => setShareGeneralAccess(e.target.value)}
                      >
                        <option value="restricted">Restringido</option>
                        <option value="anyone">Cualquier persona con el enlace</option>
                      </select>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ position: 'absolute', right: 0, pointerEvents: 'none' }}><path d="M7 10l5 5 5-5H7z"/></svg>
                    </div>
                    {shareGeneralAccess === 'anyone' && (
                      <select className="role-select-acc" style={{ color: '#0b57d0', fontWeight: 500 }} value={shareGeneralRole} onChange={e => setShareGeneralRole(e.target.value)}>
                        <option value="viewer">Lector</option>
                        <option value="commenter">Comentador</option>
                        <option value="editor">Editor</option>
                      </select>
                    )}
                  </div>
                  <div className="share-access-desc">
                    {shareGeneralAccess === 'restricted' 
                      ? 'Solo los usuarios con acceso pueden abrir el enlace' 
                      : `Cualquier usuario de Internet con el enlace puede verlo como ${shareGeneralRole === 'viewer' ? 'Lector' : shareGeneralRole === 'commenter' ? 'Comentador' : 'Editor'}`}
                  </div>
                </div>
              </div>
            </div>

            <div className="share-footer" style={{ position: 'relative' }}>
              <button className="btn-copy-link" style={shareLinkCopied ? { outline: '2px solid #0b57d0', outlineOffset: '2px', background: '#e8f0fe' } : {}} onClick={async () => {
                try {
                  const res = await apiFetch(`${API}/api/docs/share`, {
                    method: 'POST',
                    body: JSON.stringify({
                      node_id: shareTarget.id,
                      model_urn: projectPrefix,
                      shared_by: user?.email || 'Unknown',
                      role: shareGeneralRole,
                      access_type: shareGeneralAccess
                    })
                  });
                  const data = await res.json();
                  if (data.success) {
                    const url = `${window.location.origin}/share/${data.share_id}`;
                    navigator.clipboard.writeText(url);
                    setShareLinkCopied(true);
                    setTimeout(() => setShareLinkCopied(false), 3000);
                  } else {
                    alert("Error al generar el enlace.");
                  }
                } catch (e) {
                  console.error(e);
                  alert("Error de conexión al generar el enlace.");
                }
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                Copiar enlace
              </button>
              
              {shareLinkCopied && (
                <div style={{ position: 'absolute', top: 50, left: 24, background: '#323232', color: '#fff', padding: '12px 16px', borderRadius: 4, fontSize: 14, display: 'flex', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', pointerEvents: 'none', zIndex: 9999 }}>
                  Enlace copiado
                </div>
              )}

              <button className="btn-share-done" onClick={() => {
                setShowShareModal(false);
                apiFetch(`${API}/api/docs/share`, {
                  method: 'POST',
                  body: JSON.stringify({
                    node_id: shareTarget.id,
                    model_urn: projectPrefix,
                    shared_by: user?.email || 'Unknown',
                    role: shareGeneralRole,
                    access_type: shareGeneralAccess
                  })
                }).catch(e => console.error(e));
              }}>Hecho</button>
            </div>
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
  const path = window.location.pathname;
  if (path.startsWith('/share/')) {
    const shareId = path.split('/share/')[1];
    return <SharedViewer shareId={shareId} />;
  }

  const { user, saveUser, logout } = useUser();
  const [selectedProject, setSelectedProject] = useState(() => {
    const saved = localStorage.getItem('selected_project');
    return saved ? JSON.parse(saved) : null;
  });

  const handleSelectProject = (p) => {
    if (p) localStorage.setItem('selected_project', JSON.stringify(p));
    else localStorage.removeItem('selected_project');
    setSelectedProject(p);
  };

  if (!user) return <LoginScreen onLogin={saveUser} />;

  if (!selectedProject) {
    return <SecureProjectsPage user={user} onSelectProject={handleSelectProject} onLogout={logout} />;
  }

  return <FilesPage project={selectedProject} user={user} onBack={() => handleSelectProject(null)} onLogout={logout} />;
}
