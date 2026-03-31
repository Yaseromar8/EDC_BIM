/**
 * useUser.js — Hook de autenticación de usuario
 * Refactorización Fase 1: Capa de Datos
 * Extraído de App.jsx líneas 60-97
 */
import { useState } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { API, getAuthHeaders } from '../utils/helpers';

export function useUser() {
  const [user, setUser] = useState(() => {
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

  const logout = async () => {
    try {
      await apiFetch(`${API}/api/auth/logout`, { method: 'POST', headers: getAuthHeaders() });
    } catch (e) { /* ignore */ }
    localStorage.removeItem('visor_user');
    localStorage.removeItem('visor_session_token');
    sessionStorage.removeItem('visor_user');
    sessionStorage.removeItem('visor_session_token');
    setUser(null);
  };

  return { user, saveUser, logout };
}
