/**
 * apiFetch — Centralized authenticated fetch for ECD
 * 
 * Automatically injects session token on every API request.
 * Redirects to login on 401 (expired/invalid session).
 * 
 * Usage:
 *   import { apiFetch } from './utils/apiFetch';
 *   
 *   // GET
 *   const res = await apiFetch(`${API}/api/docs/list?path=/`);
 *   
 *   // POST with JSON
 *   const res = await apiFetch(`${API}/api/docs/rename`, {
 *     method: 'POST',
 *     body: JSON.stringify({ node_id: '123', new_name: 'test' })
 *   });
 *   
 *   // POST with FormData (file upload — no Content-Type header)
 *   const formData = new FormData();
 *   formData.append('file', file);
 *   const res = await apiFetch(`${API}/api/docs/upload`, {
 *     method: 'POST',
 *     body: formData,
 *     isUpload: true  // skips Content-Type so browser sets multipart boundary
 *   });
 */

const AUTH_ENDPOINTS = ['/api/auth/login', '/api/auth/register', '/api/auth/google'];

function getToken() {
  return localStorage.getItem('visor_session_token') || sessionStorage.getItem('visor_session_token');
}

function clearSession() {
  localStorage.removeItem('visor_user');
  localStorage.removeItem('visor_session_token');
  localStorage.removeItem('visor_selectedProject'); // FIX: Previene reload loop si expira sesión
  sessionStorage.removeItem('visor_user');
  sessionStorage.removeItem('visor_session_token');
}

// Estados que valen la pena reintentar: el servidor está saturado o el proxy
// se cayó un instante, no es culpa de la petición.
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
// Solo reintentamos métodos IDEMPOTENTES. Reintentar un POST/DELETE podría
// duplicar la operación (crear dos carpetas, borrar de más).
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const RETRY_BASE_DELAY = 600; // 600ms → 1.2s → 2.4s

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function apiFetch(url, options = {}) {
  const { isUpload, onUnauthorized, timeoutMs, retries, ...fetchOptions } = options;

  const method = (fetchOptions.method || 'GET').toUpperCase();
  // `retries` permite forzar (o desactivar) el comportamiento por defecto.
  const maxRetries = retries ?? (IDEMPOTENT_METHODS.has(method) ? 2 : 0);

  // Build headers
  const headers = {};
  
  // Add Content-Type for non-upload requests
  if (!isUpload) {
    headers['Content-Type'] = 'application/json';
  }
  
  // Add auth token (skip for login/register endpoints)
  const isPublicAuth = AUTH_ENDPOINTS.some(ep => url.includes(ep));
  if (!isPublicAuth) {
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  
  // Merge with any custom headers
  fetchOptions.headers = { ...headers, ...(fetchOptions.headers || {}) };

  // TIMEOUT por defecto: un backend colgado dejaba spinners INFINITOS (el
  // fetch sin límite espera para siempre). Subidas grandes usan más margen.
  const callerSignal = fetchOptions.signal;
  const timeoutFor = timeoutMs ?? (isUpload ? 600000 : 120000);

  let response;
  for (let attempt = 0; ; attempt++) {
    // La señal se recrea por intento: una vez abortada no se puede reutilizar.
    let timeoutId = null;
    const attemptOptions = { ...fetchOptions };
    if (!callerSignal) {
      const controller = new AbortController();
      attemptOptions.signal = controller.signal;
      timeoutId = setTimeout(
        () => controller.abort(new DOMException('apiFetch timeout', 'TimeoutError')),
        timeoutFor
      );
    }

    try {
      response = await fetch(url, attemptOptions);
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      // Si el LLAMADOR canceló a propósito, no insistir.
      if (callerSignal && callerSignal.aborted) throw err;
      if (attempt < maxRetries) {
        await sleep(RETRY_BASE_DELAY * Math.pow(2, attempt));
        continue;
      }
      // Mensaje entendible en vez de un "Failed to fetch" pelado.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('Sin conexión a internet. Revisa tu red e intenta de nuevo.');
      }
      throw err;
    }
    if (timeoutId) clearTimeout(timeoutId);

    // Servidor saturado o proxy caído un instante → reintentar, no fallar de una.
    if (RETRYABLE_STATUS.has(response.status) && attempt < maxRetries) {
      await sleep(RETRY_BASE_DELAY * Math.pow(2, attempt));
      continue;
    }
    break;
  }

  // Handle 401 — session expired or invalid
  if (response.status === 401) {
    // Don't redirect if this IS the login request failing (wrong password)
    if (!isPublicAuth) {
      console.warn('[apiFetch] 401 Unauthorized — session expired, redirecting to login');
      clearSession();
      if (onUnauthorized) {
        onUnauthorized();
      } else {
        window.location.reload(); // triggers login screen since user is null
      }
    }
  }

  return response;
}

/**
 * apiJson — apiFetch + parseo SEGURO de JSON.
 *
 * El patrón `.then(r => r.json())` está repetido por toda la app y REVIENTA
 * cuando el backend responde HTML (404/500/proxy caído): "Unexpected token '<'".
 * Este helper valida el estado, tolera cuerpos vacíos y devuelve el mensaje
 * real del servidor en el error.
 */
export async function apiJson(url, options = {}) {
  const res = await apiFetch(url, options);
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    let msg = text.slice(0, 200);
    try { msg = JSON.parse(text).error || msg; } catch { /* cuerpo no-JSON */ }
    const err = new Error(`HTTP ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Respuesta no-JSON del servidor (${text.length} bytes)`);
  }
}

// For XMLHttpRequest uploads (progress tracking) — returns headers object only
export function getUploadAuthHeaders() {
  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}
