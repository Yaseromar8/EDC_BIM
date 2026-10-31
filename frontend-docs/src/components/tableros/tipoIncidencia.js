/**
 * Los registros de la incidencia y del kanban de incidencias para el Lienzo (design/lienzo/Lienzo.jsx, `tipos`).
 * Reciben `abrir(issueId)`, que enseña el detalle de la incidencia encima del tablero.
 */
import { createElement } from 'react';
import { TarjetaIncidencia, KanbanIncidencias, BarraIncidencia } from './TarjetaIncidencia';

const texto = (v, max = 400) => (typeof v === 'string' ? v.slice(0, max) : '');
const ID = /^\d{1,12}$/;

export function tipoIncidencia({ abrir }) {
  return {
    Pieza: TarjetaIncidencia,
    redimensionable: true,
    minimo: [220, 120],
    etiqueta: 'Incidencia',
    texto: (el) => `${el.codigo || ''} ${el.nombre || ''}`.trim(),
    alDobleClic: (el) => abrir(el.issueId),
    barra: (el) => createElement(BarraIncidencia, { el, abrir }),
    // Al pegar: solo el id (y el código y el título —`nombre`— para buscar); lo demás se lee vivo. No se llama `titulo`:
    // en el lienzo, un elemento con `titulo` es una sección.
    limpiar: (n) => (ID.test(String(n.issueId || '')) ? { issueId: String(n.issueId), codigo: texto(n.codigo, 40), nombre: texto(n.nombre) } : null),
  };
}

export function tipoKanban() {
  return {
    Pieza: KanbanIncidencias,
    redimensionable: true,
    minimo: [560, 300],
    etiqueta: 'Kanban',
    texto: (el) => el.nombre || 'Kanban de incidencias',
    limpiar: (n) => {
      const ids = (Array.isArray(n.issueIds) ? n.issueIds : []).map(String).filter(x => ID.test(x)).slice(0, 500);
      return ids.length ? { issueIds: ids, nombre: texto(n.nombre, 200) || 'Incidencias' } : null;
    },
  };
}
