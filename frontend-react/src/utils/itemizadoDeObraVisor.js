/**
 * La instancia ÚNICA del itemizado de la obra en el visor (lib/itemizadoDeObra.js), con la red real.
 * App la carga al abrir la obra; la Planilla y los campos derivados la leen.
 */
import { apiFetch } from './apiFetch';
import { enlaceCompartido } from './enlaceCompartido';
import { crearAlmacenDeItemizado } from '../lib/itemizadoDeObra';

const BACKEND_URL = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ? 'https://visor-ecd-backend-va.onrender.com' : (import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3000' : (typeof window !== 'undefined' && window.location.hostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/) ? `http://${window.location.hostname}:3000` : 'https://visor-ecd-backend-va.onrender.com')));

async function pedir(metodo, ruta, cuerpo) {
    // Una vista compartida por enlace no tiene sesión: el itemizado de la obra no se pide.
    if (enlaceCompartido()) return { ok: false, status: 403, json: { error: 'El itemizado no está disponible en una vista compartida.', code: 'NO_DISPONIBLE' } };
    const res = await apiFetch(`${BACKEND_URL}${ruta}`, {
        method: metodo,
        ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });
    let json = null;
    try { json = await res.json(); } catch { /* sin cuerpo JSON */ }
    return { ok: res.ok, status: res.status, json: json || {} };
}

export const itemizadoDeObra = crearAlmacenDeItemizado({ pedir });
