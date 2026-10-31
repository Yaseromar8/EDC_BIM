// Enlaces de los tableros (docs/visor/63): el tablero abierto, y la vista publicada que se está mirando, van en la
// dirección, junto a la obra. Puro, para probarlo sin navegador (pruebas/enlaceDeTablero.prueba.mjs).
//
//   /?obra=<obra>&tablero=<tablero>                    un tablero
//   /?obra=<obra>&tablero=<tablero>&vistaTablero=<vista>   una vista publicada de ese tablero
//
// `vistaTablero` y no `vista`: `vista` ya es del circuito de la planilla, y el lector de Archivos la borra al abrirse
// (utils/sustento.js, DEL_CIRCUITO).
//
// La obra la abre `App_Refactor` como cualquier enlace de Archivos (`leerEnlaceDeArchivos`), y Docs entra en
// Tableros si la dirección trae `tablero` (`useFileExplorer`). Un enlace no concede nada: el servidor decide si
// quien lo abre puede ver ese tablero.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VISTA = /^[A-Za-z0-9_-]{1,64}$/;
export const PARAM_VISTA = 'vistaTablero';

export function leerEnlaceDeTablero(search) {
  const p = new URLSearchParams(search || '');
  const tablero = (p.get('tablero') || '').trim();
  if (!UUID.test(tablero)) return null;
  const vista = (p.get(PARAM_VISTA) || '').trim();
  return { tablero, vista: VISTA.test(vista) ? vista : null };
}

// La `search` con este tablero y esta vista, o sin ellos (null), conservando lo demás.
export function conTablero(search, enlace) {
  const p = new URLSearchParams(search || '');
  p.delete('tablero'); p.delete(PARAM_VISTA);
  if (enlace?.tablero) {
    p.set('tablero', String(enlace.tablero));
    if (enlace.vista) p.set(PARAM_VISTA, String(enlace.vista));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

// «Copiar enlace» de una vista: la dirección completa, con la obra.
export function enlaceDeVista(origen, { obra, tablero, vista }) {
  const p = new URLSearchParams();
  if (obra) p.set('obra', String(obra));
  p.set('tablero', String(tablero));
  if (vista) p.set(PARAM_VISTA, String(vista));
  return `${origen || ''}/?${p.toString()}`;
}

// Poner la dirección al día sin crear una entrada nueva en el historial.
export function ponerEnLaDireccion(enlace) {
  const nueva = window.location.pathname + conTablero(window.location.search, enlace) + window.location.hash;
  if (nueva !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, '', nueva);
}
