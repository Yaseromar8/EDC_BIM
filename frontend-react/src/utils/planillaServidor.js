/**
 * La red de los datos de la obra de la Planilla (itemizado, criterios de medida): `pedir` para
 * lib/almacenDeObra.js, con el backend del visor y su sesión.
 */
import { apiFetch } from './apiFetch';
import { enlaceCompartido } from './enlaceCompartido';

const BACKEND_URL = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ? 'https://visor-ecd-backend-va.onrender.com' : (import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3000' : (typeof window !== 'undefined' && window.location.hostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/) ? `http://${window.location.hostname}:3000` : 'https://visor-ecd-backend-va.onrender.com')));

export async function pedirPlanilla(metodo, ruta, cuerpo) {
    // Una vista compartida por enlace no tiene sesión: los datos de la obra no se piden.
    if (enlaceCompartido()) return { ok: false, status: 403, json: { error: 'No está disponible en una vista compartida.', code: 'NO_DISPONIBLE' } };
    const res = await apiFetch(`${BACKEND_URL}${ruta}`, {
        method: metodo,
        ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });
    let json = null;
    try { json = await res.json(); } catch { /* sin cuerpo JSON */ }
    return { ok: res.ok, status: res.status, json: json || {} };
}
