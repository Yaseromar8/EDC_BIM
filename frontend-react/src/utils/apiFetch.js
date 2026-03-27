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
  return localStorage.getItem('visor_session_token') || sessionStorage.getItem('visor_session_token');
}

function clearSession() {
  localStorage.removeItem('visor_user');
  localStorage.removeItem('visor_session_token');
  sessionStorage.removeItem('visor_user');
  sessionStorage.removeItem('visor_session_token');
}

export async function apiFetch(url, options = {}) {
  const { isUpload, onUnauthorized, ...fetchOptions } = options;
  
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
  
  const response = await fetch(url, fetchOptions);
  
  if (response.status === 401) {
    if (!isPublicAuth) {
      console.warn('[apiFetch] 401 Unauthorized — session expired, redirecting to login');
      clearSession();
      if (onUnauthorized) {
        onUnauthorized();
      } else {
        window.location.reload();
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
