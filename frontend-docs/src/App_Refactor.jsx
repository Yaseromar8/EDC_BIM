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
import React, { useState, lazy, Suspense } from 'react';
import { Toaster } from 'react-hot-toast';

// ── Auth Hook ──
import { useUser } from './hooks/useUser';

// ── Pages ──
import SecureProjectsPage from './pages/SecureProjectsPage';
import FilesPage from './pages/FilesPage';

// ── Existing Components ──
import LoginScreen from './LoginScreen';
import ErrorBoundary from './components/ErrorBoundary';

// Ruta pública /share/: se usa en una fracción de las sesiones y arrastra el
// visor de documentos (react-pdf). Diferida → sale del bundle inicial.
const SharedViewer = lazy(() => import('./components/SharedViewer'));

// ─────────────────────────────────────
// MAIN APP ROUTER
// ─────────────────────────────────────
export default function App() {
  const path = window.location.pathname;

  // REGLAS DE HOOKS: todos los hooks van ANTES de cualquier return condicional.
  // Antes, useUser()/useState se llamaban después del early-return de /share/,
  // lo que deja el orden de hooks dependiendo de la ruta (bug latente).
  // ── Auth ──
  const { user, saveUser, logout } = useUser();

  // ── Project Selection ──
  const [selectedProject, setSelectedProject] = useState(() => {
    const saved = localStorage.getItem('selected_project');
    return saved ? JSON.parse(saved) : null;
  });

  // ── Share Route (pública: no requiere sesión) ──
  if (path.startsWith('/share/')) {
    const shareId = path.split('/share/')[1];
    return (
      <Suspense fallback={<div style={{ padding: 48, textAlign: 'center' }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>}>
        <SharedViewer shareId={shareId} />
      </Suspense>
    );
  }

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
      <ErrorBoundary scope="proyectos" title="No se pudo mostrar la lista de proyectos">
        <SecureProjectsPage
          user={user}
          onSelectProject={handleSelectProject}
          onLogout={logout}
        />
      </ErrorBoundary>
    );
  }

  // Cada ruta va envuelta: un fallo de render muestra un aviso con salida,
  // en vez de dejar la PANTALLA EN BLANCO sin explicación.
  return (
    <ErrorBoundary scope="documentos" title="No se pudo mostrar el explorador de documentos">
      <FilesPage
        project={selectedProject}
        user={user}
        onBack={() => handleSelectProject(null)}
        onLogout={logout}
      />
    </ErrorBoundary>
  );
}
