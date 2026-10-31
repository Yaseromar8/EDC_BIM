// Miembros de un tablero (docs/visor/66), como «Miembros del panel» de ACC: quién es miembro y con qué rol, y quién puede
// entrar. Las reglas las pone el servidor (routes/tableros.py); aquí solo se piden y se nombran.
import { API } from '../../utils/helpers';
import { apiFetch } from '../../utils/apiFetch';

export const ROLES = [['responsable', 'Responsable'], ['editor', 'Editor'], ['lector', 'Lector']];
export const NOMBRE_ROL = Object.fromEntries(ROLES);
export const AYUDA_ROL = {
  responsable: 'Edita, invita, decide quién puede entrar y archiva',
  editor: 'Edita el tablero',
  lector: 'Solo lo mira',
};
export const ACCESOS = [['obra', 'Toda la obra'], ['invitados', 'Solo los invitados']];

async function llamar(url, metodo = 'GET', cuerpo) {
  try {
    const r = await apiFetch(url, { method: metodo, ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}) });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok && d.success !== false, estado: r.status, ...d };
  } catch {
    return { ok: false, estado: 0, error: 'No se pudo conectar con el servidor.' };
  }
}

const ruta = (tablero) => `${API}/api/docs/tableros/${tablero}/miembros`;
export const leerMiembros = (tablero) => llamar(ruta(tablero));
export const invitar = (tablero, userId, rol) => llamar(ruta(tablero), 'POST', { user_id: userId, rol });
export const quitarMiembro = (tablero, userId) => llamar(`${ruta(tablero)}?user_id=${encodeURIComponent(userId)}`, 'DELETE');
export const cambiarAcceso = (tablero, acceso) => llamar(`${API}/api/docs/tableros/${tablero}`, 'PATCH', { acceso });

// A quién se puede invitar: la gente de la obra que aún no es miembro, por nombre o correo.
export function invitables(gente, miembros, filtro = '') {
  const ya = new Set((miembros || []).map(m => String(m.id)));
  const f = filtro.trim().toLowerCase();
  return (gente || []).filter(p => !ya.has(String(p.id)) && (!f || `${p.name || ''} ${p.email || ''}`.toLowerCase().includes(f)));
}
