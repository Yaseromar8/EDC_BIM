/**
 * helpers.js — Utilidades globales extraídas de App.jsx
 * Refactorización Fase 1: Capa de Datos
 */

import { Capacitor } from '@capacitor/core';

export const API = Capacitor.isNativePlatform()
  ? 'https://visor-ecd-backend.onrender.com'
  : (import.meta.env.VITE_BACKEND_URL || '');

// URL del Visor (la ficha "Visor 3D" del Hub navega allí llevando el ticket
// SSO). El respaldo depende del host: en localhost apunta al dev server; en
// cualquier otro sitio, al despliegue. Antes el respaldo era SIEMPRE
// localhost:5173, así que una build de producción sin VITE_VISOR_URL mandaba
// al usuario a su propia máquina. Define VITE_VISOR_URL para fijarla.
export const VISOR_URL = import.meta.env.VITE_VISOR_URL
  || (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:5173'
    : 'https://visor-ecd-frontend.onrender.com');

// ATAJOS INTERNOS Docs -> Visor 3D (boton "Frentes 3D" y overlay de frentes).
// Apagados a proposito: se salta al visor desde DENTRO del explorador, sin
// pasar por el Hub. El Hub SI ofrece el Visor 3D con normalidad — esta puerta
// es otra cosa. Poner en true para reactivarlos.
export const DOCS_VISOR_SHORTCUT = false;

export function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function formatSizeDetailed(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

export function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', csv: '📊',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🎨',
    ppt: '📙', pptx: '📙', txt: '📄', dwg: '📐', rvt: '🏗️', ifc: '🏗️',
    zip: '📦', rar: '📦', mp4: '🎬', mp3: '🎵',
  };
  return map[ext] || '📄';
}

export function getInitials(name) {
  if (!name || typeof name !== 'string') return 'U';
  return name.split(' ').filter(w => w).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function getInitialsDetailed(name) {
  if (!name) return '??';
  const parts = name.split(' ');
  if (parts.length >= 2) return (parts[0][0] + (parts[1][0] || '')).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

export function getAuthHeaders(extra = {}) {
  const saved = localStorage.getItem('visor_session_token') || sessionStorage.getItem('visor_session_token');
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (saved) headers['Authorization'] = `Bearer ${saved}`;
  return headers;
}
