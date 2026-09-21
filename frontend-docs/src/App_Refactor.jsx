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
import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Toaster } from 'react-hot-toast';

// ── Auth Hook ──
import { useUser } from './hooks/useUser';
import { API } from './utils/helpers';
import { apiFetch } from './utils/apiFetch';
import {
  leerEnlace, conRevision, destinoTrasNavegar, CLAVE_DEL_ENLACE_PENDIENTE,
} from './utils/revisiones';
import {
  leerEnlaceDeArchivos, conArchivos, destinoDeArchivosTrasNavegar, estadoDeArchivos,
  CLAVE_DEL_ENLACE_DE_ARCHIVOS, ENLACE_NO_DISPONIBLE,
} from './utils/enlacesDeArchivos';

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
  // CADA ENTRADA DEL HISTORIAL SABE QUÉ PANTALLA ES (enlaces de Archivos, 14-sep-2026).
  // La portada y la lista de obras no tienen dirección propia: se marcan en
  // `history.state`, sin añadir pasos a Atrás, para que Atrás y Adelante puedan volver a
  // ellas. La obra, la carpeta y el documento sí van en la dirección.
  const marcarEntrada = (pantalla) => window.history.replaceState(
    { alephia: pantalla }, '', window.location.href);
  const chooseDocs = () => {
    sessionStorage.setItem('ecd_entered_docs', '1'); setEnteredDocs(true); marcarEntrada('lista');
  };
  const logoutFull = () => { sessionStorage.removeItem('ecd_entered_docs'); logout(); };
  // Volver al Hub (clic en el logo): el Hub es la ÚNICA puerta entre productos —
  // dentro de Docs no hay puentes directos al visor (sin fugas de navegación).
  const backToHub = () => { sessionStorage.removeItem('ecd_entered_docs'); setEnteredDocs(false); };
  const backToHubDesdeLaLista = () => { backToHub(); marcarEntrada('hub'); };

  // ── ENLACE DE ARCHIVOS: `/?obra=<id>[&carpeta=<id>[&documento=<id>[&version=<id>]]]` ──
  //
  // Como el de una revisión: se guarda en sessionStorage mientras se inicia sesión, y la
  // obra se busca entre las obras de ESTA persona. Aquí solo se entra en la obra: la
  // carpeta y el documento los abre el explorador, que vuelve a preguntar al servidor
  // (`/api/docs/ubicacion`). Si ya se está dentro de esa obra no hay nada que resolver.
  const [enlaceArchivos, setEnlaceArchivos] = useState(() => {
    const search = window.location.search;
    if (leerEnlace(search)) {
      // La dirección trae una revisión: un enlace de Archivos que esperaba no la pisa.
      sessionStorage.removeItem(CLAVE_DEL_ENLACE_DE_ARCHIVOS);
      return null;
    }
    const deLaUrl = leerEnlaceDeArchivos(search);
    if (deLaUrl) {
      // Y al revés: la dirección manda sobre una revisión que esperaba el login.
      sessionStorage.removeItem(CLAVE_DEL_ENLACE_PENDIENTE);
      let guardada = null;
      try { guardada = JSON.parse(localStorage.getItem('selected_project') || 'null'); } catch { guardada = null; }
      if (user && guardada && String(guardada.id) === deLaUrl.obra
          && sessionStorage.getItem('ecd_entered_docs') === '1') return null;
      sessionStorage.setItem(CLAVE_DEL_ENLACE_DE_ARCHIVOS, JSON.stringify(deLaUrl));
      return deLaUrl;
    }
    try {
      const guardado = JSON.parse(sessionStorage.getItem(CLAVE_DEL_ENLACE_DE_ARCHIVOS) || 'null');
      return guardado?.obra ? guardado : null;
    } catch { return null; }
  });

  // ── ENLACE A UNA REVISIÓN: `/?obra=<id>&revision=<id>`, o desde Mi Trabajo ──
  //
  // Lleva directamente a Documentos → esa obra → Revisiones → el detalle. Se guarda
  // también en sessionStorage porque el login puede limpiar la URL, y el enlace no
  // tiene que perderse por iniciar sesión. La obra se busca entre las obras de
  // ESTA persona: si no está, se avisa y se sigue como siempre. Entrar en la obra
  // no concede nada: el detalle vuelve a pasar por las guardias del servidor.
  const [enlace, setEnlace] = useState(() => {
    const deLaUrl = leerEnlace(window.location.search);
    if (deLaUrl?.obra) {
      sessionStorage.setItem(CLAVE_DEL_ENLACE_PENDIENTE, JSON.stringify(deLaUrl));
      return deLaUrl;
    }
    try {
      const guardado = JSON.parse(sessionStorage.getItem(CLAVE_DEL_ENLACE_PENDIENTE) || 'null');
      return guardado?.obra && guardado?.revision ? guardado : null;
    } catch { return null; }
  });
  const [avisoDeEnlace, setAvisoDeEnlace] = useState(null);

  const abrirRevision = ({ obra, revision }) => {
    const numero = Number(revision);
    if (!obra || !Number.isSafeInteger(numero) || numero < 1) return;
    const destino = { obra: String(obra), revision: numero };
    sessionStorage.setItem(CLAVE_DEL_ENLACE_PENDIENTE, JSON.stringify(destino));
    window.history.pushState(null, '', window.location.pathname
      + conRevision(window.location.search, destino.obra, destino.revision));
    setEnlace(destino);
  };

  useEffect(() => {
    if (!user || !enlace) return undefined;
    let cancelado = false;
    const quitarDeLaUrl = () => window.history.replaceState(null, '', window.location.pathname
      + conRevision(window.location.search, null, null));
    (async () => {
      // La URL dice la revisión que se va a ver, también si el enlace volvió de sessionStorage.
      window.history.replaceState(null, '', window.location.pathname
        + conRevision(window.location.search, enlace.obra, enlace.revision));
      try {
        let obra = null;
        const guardada = JSON.parse(localStorage.getItem('selected_project') || 'null');
        if (guardada && String(guardada.id) === String(enlace.obra)) {
          obra = guardada;
        } else {
          const r = await apiFetch(`${API}/api/projects?user_id=${user.id}&role=${user.role}`);
          const d = r.ok ? await r.json() : null;
          const lista = Array.isArray(d) ? d : (d?.projects || []);
          obra = lista.find(p => String(p.id) === String(enlace.obra)) || null;
        }
        if (cancelado) return;
        if (obra) {
          localStorage.setItem('selected_project', JSON.stringify(obra));
          setSelectedProject(obra);
          sessionStorage.setItem('ecd_entered_docs', '1');
          setEnteredDocs(true);
        } else {
          quitarDeLaUrl();
          setAvisoDeEnlace('No tienes acceso a la obra de esa revisión, o ya no existe.');
        }
      } catch {
        if (!cancelado) {
          quitarDeLaUrl();
          setAvisoDeEnlace('No se pudo abrir la revisión: no se pudo cargar la lista de obras.');
        }
      } finally {
        if (!cancelado) {
          sessionStorage.removeItem(CLAVE_DEL_ENLACE_PENDIENTE);
          setEnlace(null);
        }
      }
    })();
    return () => { cancelado = true; };
  }, [user, enlace]);

  // EL ENLACE DE ARCHIVOS: entrar en su obra. Sin la obra entre las de esta persona, el
  // aviso neutro de siempre y la dirección limpia.
  useEffect(() => {
    if (!user || !enlaceArchivos) return undefined;
    let cancelado = false;
    let sinSesion = false;
    const quitarDeLaUrl = () => window.history.replaceState(window.history.state, '',
      window.location.pathname + conArchivos(window.location.search, null));
    (async () => {
      // La dirección dice lo que se va a ver, también si el enlace volvió de sessionStorage.
      window.history.replaceState(window.history.state, '', window.location.pathname
        + conArchivos(window.location.search, enlaceArchivos));
      try {
        let obra = null;
        let guardada = null;
        try { guardada = JSON.parse(localStorage.getItem('selected_project') || 'null'); } catch { guardada = null; }
        if (guardada && String(guardada.id) === String(enlaceArchivos.obra)) {
          obra = guardada;
        } else {
          const r = await apiFetch(`${API}/api/projects?user_id=${user.id}&role=${user.role}`);
          // Sesión caducada: `apiFetch` recarga hacia el login. El enlace sigue en la
          // dirección y en sessionStorage, y se abre después de entrar.
          if (r.status === 401) { sinSesion = true; return; }
          const d = r.ok ? await r.json() : null;
          const lista = Array.isArray(d) ? d : (d?.projects || []);
          obra = lista.find(p => String(p.id) === String(enlaceArchivos.obra)) || null;
        }
        if (cancelado) return;
        if (obra) {
          localStorage.setItem('selected_project', JSON.stringify(obra));
          setSelectedProject(obra);
          sessionStorage.setItem('ecd_entered_docs', '1');
          setEnteredDocs(true);
        } else {
          quitarDeLaUrl();
          setAvisoDeEnlace(ENLACE_NO_DISPONIBLE);
        }
      } catch {
        if (!cancelado) {
          quitarDeLaUrl();
          setAvisoDeEnlace('No se pudo abrir el enlace: no se pudo cargar la lista de obras.');
        }
      } finally {
        if (!cancelado && !sinSesion) {
          sessionStorage.removeItem(CLAVE_DEL_ENLACE_DE_ARCHIVOS);
          setEnlaceArchivos(null);
        }
      }
    })();
    return () => { cancelado = true; };
  }, [user, enlaceArchivos]);

  // ATRÁS Y ADELANTE HACIA UNA REVISIÓN DE OTRA OBRA, O FUERA DE DOCUMENTOS (E1.2 · H5).
  //
  // Si el navegador devuelve a la dirección el enlace de una revisión estando en la
  // portada, en la lista de obras o dentro de OTRA obra, se abre como un enlace: la
  // dirección y la pantalla tienen que decir lo mismo. Dentro de la misma obra lo
  // resuelve el explorador (`useFileExplorer`), y dentro de Revisiones, `ReviewsView`.
  const pantalla = useRef({ user, enteredDocs, selectedProject });
  useEffect(() => {
    pantalla.current = { user, enteredDocs, selectedProject };
  }, [user, enteredDocs, selectedProject]);
  useEffect(() => {
    const alNavegar = () => {
      const { user: quien, enteredDocs: dentro, selectedProject: obra } = pantalla.current;
      if (!quien) return;
      const destino = destinoTrasNavegar(window.location.search,
                                         { enDocumentos: Boolean(dentro && obra), obraActual: obra?.id });
      if (destino.tipo === 'enlace') {
        setEnlace({ obra: String(destino.enlace.obra), revision: destino.enlace.revision });
      }
    };
    window.addEventListener('popstate', alNavegar);
    return () => window.removeEventListener('popstate', alNavegar);
  }, []);

  // ATRÁS Y ADELANTE ENTRE OBRAS, LA LISTA Y LA PORTADA (enlaces de Archivos). Dentro de
  // la obra que se está viendo, la carpeta y el documento los resuelve el explorador.
  useEffect(() => {
    const alNavegarEntreObras = () => {
      const { user: quien, enteredDocs: dentro, selectedProject: obra } = pantalla.current;
      if (!quien) return;
      const destino = destinoDeArchivosTrasNavegar(window.location.search, window.history.state,
        { enDocumentos: Boolean(dentro && obra), obraActual: obra?.id });
      if (destino.tipo === 'enlace') {
        setEnlaceArchivos(destino.enlace);
      } else if (destino.tipo === 'lista' || destino.tipo === 'hub') {
        localStorage.removeItem('selected_project');
        setSelectedProject(null);
        if (destino.tipo === 'lista') sessionStorage.setItem('ecd_entered_docs', '1');
        else sessionStorage.removeItem('ecd_entered_docs');
        setEnteredDocs(destino.tipo === 'lista');
      }
    };
    window.addEventListener('popstate', alNavegarEntreObras);
    return () => window.removeEventListener('popstate', alNavegarEntreObras);
  }, []);

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
    // SOLO UN 401 CIERRA LA SESIÓN. Antes el `.catch` se tragaba todo: un corte
    // de red, un tiempo agotado, un 500 o un 502 mientras Render recicla un worker
    // o despliega. Cualquiera de esas cosas cerraba la sesión y devolvía al acceso
    // con la sesión intacta en la base: abrir Docs con el backend frío bastaba.
    // Sobre la sesión solo tiene autoridad el servidor, y lo dice con un 401.
    // Es el mismo arreglo que el visor tiene desde f24e8f4.
    apiFetch(`${API}/api/auth/me`)
      .then(r => {
        if (r.status === 401) return { sesionInvalida: true };
        if (!r.ok) return null;          // problema del servidor, no de tu sesión
        return r.json().then(u => ({ usuario: u }));
      })
      .then(res => {
        if (cancelado || !res) return;
        if (res.sesionInvalida) { logout(); return; }
        const u = res.usuario;
        if (!u?.id) return;
        if (u.role !== user.role || u.email !== user.email) {
          saveUser({ ...user, ...u });   // se conserva el token guardado
        }
      })
      .catch(() => { /* red caída o respuesta ilegible: la sesión NO se toca */ });
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

  // ELEGIR UNA OBRA Y SALIR DE ELLA escriben la dirección, con su paso en Atrás.
  const elegirObra = (p) => {
    marcarEntrada('lista');
    const destino = { obra: String(p.id) };
    window.history.pushState(estadoDeArchivos(destino), '', window.location.pathname
      + conArchivos(window.location.search, destino));
    handleSelectProject(p);
  };
  const salirDeLaObra = (pantalla) => {
    window.history.pushState({ alephia: pantalla }, '', window.location.pathname
      + conArchivos(window.location.search, null));
    handleSelectProject(null);
    if (pantalla === 'hub') backToHub();
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

  // Un enlace a una revisión se resuelve ANTES de pintar ninguna página: así el
  // explorador nace ya en la obra del enlace y no en la que estaba guardada.
  if (enlace) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 12, color: '#555', fontSize: 14 }}>
        <div className="adsk-spinner" /> Abriendo la revisión…
      </div>
    );
  }

  if (enlaceArchivos) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 12, color: '#555', fontSize: 14 }}>
        <div className="adsk-spinner" /> Abriendo el enlace…
      </div>
    );
  }

  // Si el enlace no se pudo abrir, se dice encima de la página a la que se llega.
  const conAviso = (pagina) => (!avisoDeEnlace ? pagina : (
    <>
      <div role="alert" style={{ position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
                                 zIndex: 30000, background: '#fff1f2', color: '#9f1239',
                                 border: '1px solid #fecdd3', borderRadius: 8, padding: '10px 14px',
                                 fontSize: 13, boxShadow: '0 8px 24px rgba(0,0,0,.15)',
                                 display: 'flex', gap: 10, alignItems: 'center' }}>
        {avisoDeEnlace}
        <button type="button" onClick={() => setAvisoDeEnlace(null)} aria-label="Cerrar aviso"
                style={{ background: 'none', border: 'none', color: '#9f1239', fontSize: 16,
                         cursor: 'pointer' }}>×</button>
      </div>
      {pagina}
    </>
  ));

  // Hub de producto: SIEMPRE tras el login (hasta elegir Documentos en esta
  // sesión). "Visor 3D" navega fuera (a la otra app) llevando la sesión.
  if (!enteredDocs) {
    return conAviso(
      <HubPage
        user={user}
        onChooseDocs={chooseDocs}
        onLogout={logoutFull}
        onAbrirRevision={abrirRevision}
      />
    );
  }

  if (!selectedProject) {
    return conAviso(
      <ErrorBoundary scope="proyectos" title="No se pudo mostrar la lista de proyectos">
        <SecureProjectsPage
          user={user}
          onSelectProject={elegirObra}
          onLogout={logoutFull}
          onBackToHub={backToHubDesdeLaLista}
        />
      </ErrorBoundary>
    );
  }

  // Cada ruta va envuelta: un fallo de render muestra un aviso con salida,
  // en vez de dejar la PANTALLA EN BLANCO sin explicación.
  return conAviso(
    <ErrorBoundary scope="documentos" title="No se pudo mostrar el explorador de documentos">
      <FilesPage
        project={selectedProject}
        user={user}
        onBack={() => salirDeLaObra('lista')}
        onBackToHub={() => salirDeLaObra('hub')}
        onLogout={logoutFull}
      />
    </ErrorBoundary>
  );
}
