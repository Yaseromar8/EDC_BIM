/**
 * hubLink.js — Única salida del Visor hacia la otra app.
 *
 * REGLA DE NAVEGACIÓN (simétrica a DOCS_VISOR_SHORTCUT en frontend-docs):
 * dentro del Visor no hay atajo a Documentos. Lo único que ofrece es
 * "Inicio" → el Hub, la pantalla donde se elige producto; allí las dos
 * tarjetas están activas y el gate de Docs (solo admin) hace su trabajo.
 * Se cierran los puentes laterales, no el camino normal.
 *
 * El Hub vive en la app de Docs, así que su URL es la raíz de Docs; para que
 * nunca caiga directamente en el explorador de documentos se viaja con
 * `hub=1`, que obliga a Docs a soltar el flag "ya entré a Documentos".
 */
import { apiFetch } from './apiFetch';

// El sitio de Docs se llama visor-ecd-PORTAL en Render. El respaldo apuntaba a
// 'visor-ecd-docs', que NO EXISTE (404): el botón INICIO del visor llevaba a un
// host muerto en producción. Define VITE_DOCS_URL para fijarlo sin depender de
// este respaldo.
export const DOCS_URL = import.meta.env.VITE_DOCS_URL
  || (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:5174'
    : 'https://visor-ecd-portal.onrender.com');

// ATAJO INTERNO Visor -> Documentos (saltar al explorador desde dentro del
// visor, sin pasar por el Hub). Apagado a propósito. El Hub sí ofrece
// Documentos con normalidad — esa puerta es otra cosa.
// Poner en true para reactivarlo.
export const VISOR_DOCS_SHORTCUT = false;

const BACKEND_URL = (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.())
  ? 'https://visor-ecd-backend.onrender.com'
  : (import.meta.env.VITE_BACKEND_URL
    || (typeof window !== 'undefined' && window.location.hostname === 'localhost'
      ? 'http://localhost:3000'
      : 'https://visor-ecd-backend.onrender.com'));

/**
 * Vuelve al Hub sin volver a iniciar sesión: pide un ticket SSO de un solo uso
 * (60 s) y viaja con él. El token de sesión NUNCA viaja por el URL. Si el
 * ticket falla se navega igual y Docs pedirá credenciales, aterrizando también
 * en el Hub.
 */
export async function goToHub() {
  let url = `${DOCS_URL}${DOCS_URL.includes('?') ? '&' : '?'}hub=1`;
  try {
    const r = await apiFetch(`${BACKEND_URL}/api/auth/handoff`, { method: 'POST' });
    const data = await r.json();
    if (r.ok && data?.ticket) url += `&sso_ticket=${encodeURIComponent(data.ticket)}`;
  } catch { /* sin ticket: Docs pedirá credenciales */ }
  window.location.href = url;
}
