/**
 * useUser.js — Hook de autenticación de usuario
 * Refactorización Fase 1: Capa de Datos
 * Extraído de App.jsx líneas 60-97
 */
import { useState } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { API, getAuthHeaders } from '../utils/helpers';
import { clearRecentPdfCache } from '../utils/recentPdfCache';
import { esSesionDeEnsayoEnBackendReal } from '../utils/accesoLocal';

export function useUser() {
  const [user, setUser] = useState(() => {
    const token = localStorage.getItem('visor_session_token')
      || sessionStorage.getItem('visor_session_token');
    if (esSesionDeEnsayoEnBackendReal(import.meta.env.VITE_DOCS_REAL_DATA === 'true', token)) {
      // La identidad local anterior no existe en Virginia. Descartarla antes
      // del primer render evita mostrar por un instante proyectos de ensayo.
      localStorage.removeItem('visor_user');
      localStorage.removeItem('visor_session_token');
      sessionStorage.removeItem('visor_user');
      sessionStorage.removeItem('visor_session_token');
      return null;
    }
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

  const logout = async ({ notifyServer = true } = {}) => {
    const token = localStorage.getItem('visor_session_token')
      || sessionStorage.getItem('visor_session_token');
    // DEMO_TOKEN solo existe en el ensayo local: nunca se envía a Virginia.
    if (notifyServer && token && token !== 'DEMO_TOKEN') {
      try {
        await apiFetch(`${API}/api/auth/logout`, { method: 'POST', headers: getAuthHeaders() });
      } catch { /* ignore */ }
    }
    localStorage.removeItem('visor_user');
    localStorage.removeItem('visor_session_token');
    sessionStorage.removeItem('visor_user');
    sessionStorage.removeItem('visor_session_token');
    clearRecentPdfCache();
    setUser(null);
  };

  return { user, saveUser, logout };
}
