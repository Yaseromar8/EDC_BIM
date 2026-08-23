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

  // El destinatario de una invitacion presente en la URL, si la hay. Solo
  // para AVISAR: el token va firmado y aqui no se decide nada con el.
  const [invitacionPendiente, setInvitacionPendiente] = useState(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('invite');
      if (!t) return null;
      const carga = JSON.parse(atob(t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
      return carga && carga.email ? { email: carga.email } : null;
    } catch { return null; }
  });
  // DOCUMENTOS YA NO ES EXCLUSIVO DE ADMINISTRADORES. La frontera es la
  // MEMBRESÍA: el listado de proyectos sale filtrado por sesión desde el
  // servidor, y dentro de cada obra manda `mi-administracion` (por obra) más
  // las guardias de cada ruta. El gate por `user.role` que había aquí hacía de
  // «ser admin de la entidad» la llave de las herramientas — administración y
  // acceso a herramientas son cosas distintas, y confundirlas dejaba a todo
  // miembro de obra sin expediente.
  const chooseDocs = () => { sessionStorage.setItem('ecd_entered_docs', '1'); setEnteredDocs(true); };
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

  // REVALIDAR LA SESIÓN AL ARRANCAR.
  // La app se creía lo que hubiera en localStorage y no lo comprobaba nunca:
  // un `visor_user` viejo dejaba la interfaz mintiendo (p. ej. un admin al que
  // se le guardó mal el rol veía "Documentos - Solo administradores"), y un
  // token caducado no se notaba hasta que algo fallaba con un mensaje raro.
  // Ahora se pregunta al servidor quién eres: se refresca el rol —así los
  // cambios de rol surten efecto— y si el token ya no vale, se cierra sesión
  // limpiamente en vez de dejar media pantalla rota.
  useEffect(() => {
    if (!user) return;
    if (new URLSearchParams(window.location.search).get('sso_ticket')) return;
    let cancelado = false;
    apiFetch(`${API}/api/auth/me`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('sesión no válida'))))
      .then(u => {
        if (cancelado || !u?.id) return;
        if (u.role !== user.role || u.email !== user.email) {
          saveUser({ ...user, ...u });   // se conserva el token guardado
        }
      })
      .catch(() => { if (!cancelado) logout(); });
    return () => { cancelado = true; };
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

  // UNA INVITACIÓN NO SE PIERDE POR TENER OTRA SESIÓN ABIERTA.
  //
  // `?invite=` solo lo lee LoginScreen, y LoginScreen solo aparece si NO hay
  // sesión. Abrir el enlace con una sesión viva aterrizaba en el Hub de quien
  // ya estaba dentro: la invitación se ignoraba EN SILENCIO y parecía que
  // había funcionado. Es el peor de los fallos — un éxito aparente: el
  // invitado cree que ya está dentro, el administrador cree que la invitación
  // se usó, y la cuenta sigue sin reclamar.
  //
  // Medido con el propietario el 23-ago-2026 («ese link me abre directamente
  // Docs y View»).
  if (invitacionPendiente && invitacionPendiente.email !== user.email) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', background: '#0B0E12', padding: 24 }}>
        <div style={{ maxWidth: 470, background: '#11161d', color: '#e9ecf1',
                      border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10,
                      padding: '26px 28px' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 600 }}>
            Esta invitación no es para tu sesión
          </h2>
          <p style={{ margin: '0 0 8px', fontSize: 13.5, lineHeight: 1.6, color: '#c3cad3' }}>
            Estás dentro como <b>{user.email}</b>, y esta invitación es para{' '}
            <b>{invitacionPendiente.email}</b>.
          </p>
          <p style={{ margin: '0 0 20px', fontSize: 13.5, lineHeight: 1.6, color: '#c3cad3' }}>
            Para activarla hay que cerrar esta sesión. El enlace <b>no se gasta
            por abrirlo</b>: seguirá siendo válido.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={logoutFull}
                    style={{ padding: '9px 16px', borderRadius: 6, border: 'none',
                             background: '#3E6F91', color: '#fff', fontSize: 13,
                             cursor: 'pointer' }}>
              Cerrar sesión y activar la invitación
            </button>
            <button onClick={() => {
                      window.history.replaceState({}, '', window.location.pathname);
                      setInvitacionPendiente(null);
                    }}
                    style={{ padding: '9px 16px', borderRadius: 6, fontSize: 13,
                             border: '1px solid rgba(255,255,255,0.18)',
                             background: 'transparent', color: '#c3cad3', cursor: 'pointer' }}>
              Seguir como {user.email}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Hub de producto: SIEMPRE tras el login (hasta elegir Documentos en esta
  // sesión). "Visor 3D" navega fuera (a la otra app) llevando la sesión.
  if (!enteredDocs) {
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
