// tema.js — los colores, tamaños y nombres del Tablero, en UN sitio (docs/visor/41).
// ===================================================================================
// Paleta oficial de Claude (D-24) y su lista cerrada de derivados
// (docs/ux/PALETA_OFICIAL_CLAUDE_DEFINICION.md): nada fuera de aquí. Es la misma
// que usa la Planilla, para que el Tablero no parezca otro producto.
import { ID_ESTADO, COLORES_ESTADO } from '../../lib/camposDerivados';

export const C = Object.freeze({
  dark: '#141413',        // texto y acción principal
  light: '#faf9f5',       // página
  blanco: '#ffffff',      // tarjetas
  midGray: '#b0aea5',     // secundario, deshabilitado
  lightGray: '#e8e6dc',   // bordes y fondos sutiles
  light50: '#f1f0e8',     // fondo de sección, pie de tarjeta
  gris300: '#cccac0',     // «Otros», atenuado
  gris600: '#72706b',     // texto secundario
  gris700: '#52524d',     // una sola serie
  gris850: '#333330',
  texto2: '#5e5d59',
  orange: '#d97757',
  orange30D: '#9e5943',   // referencia / meta
  blue: '#6a9bcc',        // selección, foco
  blue30D: '#507294',     // enlaces
  blueTinte: '#ecf0f1',   // fondo de lo seleccionado
  green: '#788c5d',
  green20D: '#64744e',
  error: '#b93535',
});

export const FUENTE = "'IBM Plex Sans', system-ui, -apple-system, sans-serif";
export const RADIO = 8;

// Mezcla con Light en % redondo: el método de la lista cerrada para derivar tonos.
function conLight(hex, pct) {
  const a = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const b = [1, 3, 5].map(i => parseInt(C.light.slice(i, i + 2), 16));
  return '#' + a.map((v, i) => Math.round(v * (1 - pct) + b[i] * pct).toString(16).padStart(2, '0')).join('');
}

// Categorías sin significado propio: siete oficiales/derivados y, si hacen falta más,
// los mismos mezclados al 50 % con Light. Sin violetas ni rosas.
const BASE = [C.blue, C.orange, C.green, C.gris700, C.blue30D, C.orange30D, C.green20D];
export const CATEGORIAS = Object.freeze([...BASE, ...BASE.map(h => conLight(h, 0.5))]);
export const OTROS = C.gris300;

// Campos con colores propios: los mismos de la Planilla y de Filters (doc 27).
const COLORES_POR_CAMPO = { [ID_ESTADO]: COLORES_ESTADO };
export const tieneColoresPropios = (campo) => !!COLORES_POR_CAMPO[campo];

/**
 * Color de un grupo del gráfico.
 *   - campo con colores propios (estado frente al itemizado) → su color;
 *   - una sola serie de barras → un solo color (el color no debe inventar un dato);
 *   - el resto (dona, pintar en el 3D) → la paleta de categorías por orden.
 */
export function colorDeGrupo(config, grupo, i, { unaSerie = false } = {}) {
  if (grupo?.isOthers) return OTROS;
  const propios = COLORES_POR_CAMPO[config?.groupBy];
  if (propios && propios[grupo?.key]) return propios[grupo.key];
  if (unaSerie) return C.gris700;
  return CATEGORIAS[i % CATEGORIAS.length];
}

// ── Nombres legibles (solo para mostrar: la configuración guarda la clave real) ──
// «Planilla::Capítulo» → «Planilla › Capítulo»; los Sí/No de Revit llegan en inglés.
const VALORES = { Yes: 'Sí', No: 'No', True: 'Sí', False: 'No', yes: 'Sí', no: 'No', true: 'Sí', false: 'No' };
export const nombreCampo = (k) => (k ? String(k).replace(/::/g, ' › ') : '');
export const nombreValor = (v) => (v == null ? '' : (VALORES[v] ?? String(v)));

// ── Tamaños de tarjeta sobre la cuadrícula: todo encaja (S/M/L = 1, 2 y 3 columnas) ──
export const REJILLA = 16;
export const COLUMNA = 320;
export const HUECO = 16;
export const ANCHOS = Object.freeze({ s: COLUMNA, m: COLUMNA * 2 + HUECO, l: COLUMNA * 3 + HUECO * 2 });
export const ALTO_DEFECTO = Object.freeze({ kpi: 240, qa: 464, grafico: 352 });
// Alto mínimo al ordenar: lo justo para cabecera, cuerpo y pie sin que nada se aplaste.
export const ALTO_MINIMO = Object.freeze({ kpi: 240, qa: 320, grafico: 272 });
export const altoMinimo = (tipo) => (tipo === 'kpi' ? ALTO_MINIMO.kpi : tipo === 'qa' ? ALTO_MINIMO.qa : ALTO_MINIMO.grafico);
/** El ancho de tamaño fijo más cercano (al redimensionar, la tarjeta salta a S, M o L). */
export const anchoCercano = (w) => Object.values(ANCHOS).reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
