/**
 * App_Refactor.jsx — Router mínimo de la aplicación
 * Refactorización Fase 3: Capa de Orquestación
 * 
 * 🎯 Este archivo reemplaza al God Component App.jsx (3,035 líneas)
 *    con un router limpio de ~80 líneas.
 * 
 * Arquitectura:
 *   App_Refactor (Router)
 *   ├── LoginScreen (existente)
 *   ├── SecureProjectsPage (extraído)
 *   ├── FilesPage (orquestador)
 *   │   ├── useFileExplorer (hook)
 *   │   ├── useVersionHistory (hook)
 *   │   ├── useColumnResize (hook)
 *   │   ├── DeleteModal, NewFolderModal, ShareModal... (modales)
 *   │   ├── VersionPanel, DeletedTable, ContextMenu (paneles)
 *   │   ├── FolderNode (árbol recursivo)
 *   │   └── MatrixTable, DocumentViewer (existentes)
 *   └── SharedViewer (existente)
 */
import React, { useState } from 'react';
import { Toaster } from 'react-hot-toast';

// ── Auth Hook ──
import { useUser } from './hooks/useUser';

// ── Pages ──
import SecureProjectsPage from './pages/SecureProjectsPage';
import FilesPage from './pages/FilesPage';

// ── Existing Components ──
import LoginScreen from './LoginScreen';
import SharedViewer from './components/SharedViewer';

// ─────────────────────────────────────
// MAIN APP ROUTER
// ─────────────────────────────────────
export default function App() {
  const path = window.location.pathname;

  // ── Share Route ──
  if (path.startsWith('/share/')) {
    const shareId = path.split('/share/')[1];
    return <SharedViewer shareId={shareId} />;
  }

  // ── Auth ──
  const { user, saveUser, logout } = useUser();

  // ── Project Selection ──
  const [selectedProject, setSelectedProject] = useState(() => {
    const saved = localStorage.getItem('selected_project');
    return saved ? JSON.parse(saved) : null;
  });

  const handleSelectProject = (p) => {
    if (p) localStorage.setItem('selected_project', JSON.stringify(p));
    else localStorage.removeItem('selected_project');
    setSelectedProject(p);
  };

  // ── Route Resolution ──
  if (!user) {
    return <LoginScreen onLogin={saveUser} />;
  }

  if (!selectedProject) {
    return (
      <SecureProjectsPage 
        user={user} 
        onSelectProject={handleSelectProject} 
        onLogout={logout} 
      />
    );
  }

  return (
    <FilesPage 
      project={selectedProject} 
      user={user} 
      onBack={() => handleSelectProject(null)} 
      onLogout={logout} 
    />
  );
}
