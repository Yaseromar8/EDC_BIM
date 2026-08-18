/**
 * apiFetch — Centralized authenticated fetch for Visor 3D
 * 
 * Automatically injects session token on every API request.
 * Redirects to login on 401 (expired/invalid session).
 * 
 * See frontend-docs/src/utils/apiFetch.js for full documentation.
 */

const AUTH_ENDPOINTS = ['/api/auth/login', '/api/auth/register', '/api/auth/google'];

function getToken() {
  // Sin fallback a DEMO_TOKEN: si no hay sesion devolvemos null -> el backend
  // responde 401 -> el visor muestra login. (El backdoor demo queda cerrado.)
  return localStorage.getItem('visor_session_token') || sessionStorage.getItem('visor_session_token') || null;
}

function clearSession() {
  localStorage.removeItem('visor_user');
  localStorage.removeItem('visor_session_token');
  localStorage.removeItem('visor_selectedProject'); // FIX: Previene reload loop si expira sesión
  sessionStorage.removeItem('visor_user');
  sessionStorage.removeItem('visor_session_token');
  // Los permisos de lectura de fotos y PDF tambien son credenciales, y se
  // quedaban. Import perezoso a proposito: este modulo lo importa medio
  // frontend y no debe arrastrar dependencias en su carga.
  import('./permisosDeLectura.js')
    .then((m) => m.olvidarPermisos && m.olvidarPermisos())
    .catch(() => { });
}

export async function apiFetch(url, options = {}) {
  const { isUpload, onUnauthorized, timeoutMs, ...fetchOptions } = options;

  const headers = {};

  if (!isUpload) {
    headers['Content-Type'] = 'application/json';
  }

  const isPublicAuth = AUTH_ENDPOINTS.some(ep => url.includes(ep));
  if (!isPublicAuth) {
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  fetchOptions.headers = { ...headers, ...(fetchOptions.headers || {}) };

  // TIMEOUT por defecto (estabilidad): un backend colgado dejaba spinners
  // infinitos — el fetch sin límite espera para siempre. 120s cubre de sobra
  // el peor request real (~20s de inventario). Sobrescribible: timeoutMs.
  let timeoutId = null;
  if (!fetchOptions.signal) {
    const controller = new AbortController();
    fetchOptions.signal = controller.signal;
    timeoutId = setTimeout(() => controller.abort(new DOMException('apiFetch timeout', 'TimeoutError')), timeoutMs ?? 120000);
  }

  let response;
  try {
    response = await fetch(url, fetchOptions);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  
  if (response.status === 401) {
    // En modo compartido (?shareView=) NO hay sesión a propósito: quien abre el
    // enlace es un tercero. Tratar ese 401 como "sesión caducada" disparaba
    // clearSession + auth-expired -> handleLogout -> setSelectedProject(null)
    // EN MEDIO de la vista compartida, que se quedaba colgada cargando.
    const esVistaCompartida = typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).has('shareView');
    if (!isPublicAuth && !esVistaCompartida) {
      console.warn('[apiFetch] 401 Unauthorized — session expired');
      clearSession();
      if (onUnauthorized) {
        onUnauthorized();
      } else {
        // En vez de forzar reload y causar bucle infinito, informamos a React
        window.dispatchEvent(new CustomEvent('auth-expired'));
      }
    }
  }
  
  return response;
}

export function getUploadAuthHeaders() {
  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}
