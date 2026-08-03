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
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Toaster } from 'react-hot-toast';

// ── Auth Hook ──
import { useUser } from './hooks/useUser';
import { API } from './utils/helpers';
import { apiFetch } from './utils/apiFetch';

// ── Pages ──
import HubPage from './pages/HubPage';
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

  // Selector de producto (Docs / Visor 3D) tras el login, estilo Tandem.
  // Se muestra SIEMPRE al iniciar sesión. Usa sessionStorage para no reaparecer
  // en cada recarga mientras trabajas (se limpia al cerrar el tab o hacer logout).
  const [enteredDocs, setEnteredDocs] = useState(() => sessionStorage.getItem('ecd_entered_docs') === '1');
  // Documentos (CDE) es exclusivo de administradores. El gate se aplica tanto en
  // la ficha del Hub como aquí en el router, para que un flag viejo en
  // sessionStorage no cuele a un no-admin al explorador.
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';
  const chooseDocs = () => { if (!isAdmin) return; sessionStorage.setItem('ecd_entered_docs', '1'); setEnteredDocs(true); };
  const logoutFull = () => { sessionStorage.removeItem('ecd_entered_docs'); logout(); };
  // Volver al Hub (clic en el logo): el Hub es la ÚNICA puerta entre productos —
  // dentro de Docs no hay puentes directos al visor (sin fugas de navegación).
  const backToHub = () => { sessionStorage.removeItem('ecd_entered_docs'); setEnteredDocs(false); };

  // SSO de vuelta (Visor -> Hub): el visor manda un ticket efímero de un solo
  // uso en el URL; aquí se canjea por la sesión y se aterriza en el Hub sin
  // volver a pedir credenciales. Nunca viaja el token de sesión por el URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // `hub=1`: quien llega desde el Visor pidió el Hub, no el explorador. Se
    // suelta el flag de sesión para que el router muestre el selector aunque
    // en este tab ya se hubiera entrado a Documentos antes.
    if (params.get('hub') === '1') {
      sessionStorage.removeItem('ecd_entered_docs');
      setEnteredDocs(false);
      params.delete('hub');
      const rest = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
    }
    const ticket = params.get('sso_ticket');
    if (!ticket) return;
    fetch(`${API}/api/auth/handoff/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data?.session_token) return null;
        localStorage.setItem('visor_session_token', data.session_token);
        return apiFetch(`${API}/api/auth/me`)
          .then(r => (r.ok ? r.json() : null))
          .then(u => ({ u, token: data.session_token }));
      })
      .then(result => {
        if (result?.u?.id) {
          sessionStorage.removeItem('ecd_entered_docs');  // aterriza en el Hub
          setEnteredDocs(false);
          saveUser({ ...result.u, session_token: result.token });
        }
      })
      .catch(() => { /* si falla, queda la pantalla de login normal */ })
      .finally(() => {
        params.delete('sso_ticket');
        const qs = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Hub de producto: SIEMPRE tras el login (hasta elegir Documentos en esta
  // sesión). "Visor 3D" navega fuera (a la otra app) llevando la sesión.
  // El Hub se muestra si no ha elegido Documentos, o si un no-admin llega con un
  // flag heredado (nunca debe ver el explorador de documentos).
  if (!enteredDocs || !isAdmin) {
    return (
      <HubPage
        user={user}
        onChooseDocs={chooseDocs}
        onLogout={logoutFull}
      />
    );
  }

  if (!selectedProject) {
    return (
      <ErrorBoundary scope="proyectos" title="No se pudo mostrar la lista de proyectos">
        <SecureProjectsPage
          user={user}
          onSelectProject={handleSelectProject}
          onLogout={logoutFull}
          onBackToHub={backToHub}
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
        onBackToHub={() => { handleSelectProject(null); backToHub(); }}
        onLogout={logoutFull}
      />
    </ErrorBoundary>
  );
}
