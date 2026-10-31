// Comentarios del tablero (fase 5, docs/visor/64), como el bocadillo de Forma Board: un alfiler en el tablero con su hilo.
//
// Un comentario es un elemento más del tablero —{ tipo: 'comentario', x, y, w, h, autorId, autor, creadoEn, mensajes,
// resuelto }— y se guarda y se fusiona con el resto. Si dos personas responden a la vez, design/lienzo/fusion.js junta
// sus mensajes uno a uno. Cada mensaje: { id, autorId, autor, texto, fecha }.
//
// Un mensaje es un acto: Ctrl+Z no lo deshace (se escribe con `ajustar`, sin paso de deshacer), nadie borra desde el
// lienzo el hilo de otro (el tipo es `protegido`) y no se copia ni se duplica.
import { createContext } from 'react';

export const PIN = 32;
export const MAX_TEXTO = 4000;
export const ComentariosDelTablero = createContext({ abrir: () => {}, abiertoId: null });

const PALETA = ['#d97757', '#507294', '#788c5d', '#9e5943', '#6a9bcc', '#8e5bc9', '#b5835a'];
export const colorDe = (id) => PALETA[Math.abs(Number.parseInt(String(id ?? '0').replace(/\D/g, '') || '0', 10)) % PALETA.length];
export function iniciales(nombre) {
  const p = String(nombre || '').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p[1]?.[0] || '')).toUpperCase();
}

const id = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const yoDe = (user) => ({ id: user?.id ?? null, nombre: user?.name || user?.email || 'Yo' });

// El alfiler se clava donde se hace clic: su punta (abajo a la izquierda) en ese punto.
export const nuevoComentario = (punto, yo) => ({
  tipo: 'comentario', x: Math.round(punto.x), y: Math.round(punto.y - PIN), w: PIN, h: PIN,
  autorId: yo.id, autor: yo.nombre, creadoEn: new Date().toISOString(), mensajes: [], resuelto: false,
});
export const nuevoMensaje = (yo, texto) => ({ id: id(), autorId: yo.id, autor: yo.nombre, texto: String(texto).trim().slice(0, MAX_TEXTO), fecha: new Date().toISOString() });

export const esComentario = (n) => n?.tipo === 'comentario';
export const mismoAutor = (a, b) => a != null && b != null && String(a) === String(b);
// Borrar el hilo entero: quien lo abrió o un administrador de la obra. Un mensaje (que no sea el primero): su autor.
export const puedeBorrarHilo = (c, yo, admin) => !!admin || mismoAutor(c.autorId, yo.id);
export const puedeBorrarMensaje = (c, m, yo) => c.mensajes?.[0]?.id !== m.id && mismoAutor(m.autorId, yo.id);

export const textoDe = (c) => (c.mensajes || []).map(m => m.texto).join('\n');
// Lo del tablero sin comentarios: para la miniatura y las vistas publicadas (los comentarios son conversación).
export const sinComentarios = (contenido) => ({ ...contenido, notas: (contenido?.notas || []).filter(n => !esComentario(n)) });

export function cuando(iso, ahora = Date.now()) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((ahora - t) / 1000));
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  const d = new Date(t), hoy = new Date(ahora);
  const hora = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoy.toDateString()) return `hoy, ${hora}`;
  return `${d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}, ${hora}`;
}
