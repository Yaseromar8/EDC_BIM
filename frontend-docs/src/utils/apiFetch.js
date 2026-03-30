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

export async function apiFetch(url, options = {}) {
  const { isUpload, onUnauthorized, ...fetchOptions } = options;
  
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
  
  const response = await fetch(url, fetchOptions);
  
  // Handle 401 — session expired or invalid
  if (response.status === 401) {
    const data = await response.clone().json().catch(() => ({}));
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

// For XMLHttpRequest uploads (progress tracking) — returns headers object only
export function getUploadAuthHeaders() {
  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}
