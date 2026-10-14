/**
 * vistasDeArchivos — las VISTAS de Archivos (A2-2, 14-oct-2026).
 *
 * Una vista es una pregunta a TODA la obra, no a una carpeta. Hay dos clases:
 *
 *   DE ALEPHIA   vienen con el producto y entienden ISO 19650 y el plan de
 *                entregas («Me toca revisar», «Plazo del plan vencido»…). Las
 *                calcula el servidor (`GET /api/docs/search?vista=…`,
 *                backend/vistas_de_obra.py); aquí solo sus nombres.
 *   MÍAS         los filtros de Archivos (texto, estado, tipo, disciplina,
 *                entrega) guardados con un nombre. Por ahora en el navegador,
 *                por obra y por persona: el portal está en su techo de rutas y
 *                guardarlas en el servidor pide una ruta y una tabla (fase 2,
 *                docs/ux/A2-2_VISTAS_GUARDADAS_PROPUESTA.md §3).
 *
 * Aquí no hay React ni DOM: solo decisiones, para poder probarlas
 * (`pruebas/vistasDeArchivos.prueba.mjs`). Lo que venga del almacén puede
 * llegar roto; nada de eso puede romper Archivos.
 */
import { piezasDelCodigo } from './codigoDelNombre.js';

// El orden es el del panel. Las claves son el contrato con el servidor
// (backend/vistas_de_obra.py: CLAVES). Van por COLECCIONES, como en Procore (visto
// en sus vídeos, docs/ux/PROCORE_REVISION_PROPIA_14-oct-2026.md §7), y cada vista
// dice sus CRITERIOS: se enseñan como fichas al abrirla, para que se sepa qué se
// está mirando.
export const COLECCIONES = [
  { clave: 'revision', etiqueta: 'En revisión' },
  { clave: 'publicados', etiqueta: 'Publicados' },
  { clave: 'plan', etiqueta: 'Plan de entregas' },
];

export const VISTAS_DE_SERIE = [
  { clave: 'en_revision', coleccion: 'revision', etiqueta: 'Todos en revisión',
    ayuda: 'En estado ISO 19650 Compartido.',
    criterios: [['Estado ISO', 'Compartido']] },
  { clave: 'me_toca_revisar', coleccion: 'revision', etiqueta: 'Me toca revisar',
    ayuda: 'Documentos de las revisiones cuyo paso actual te espera. Los mismos encargos que «Mi trabajo».',
    criterios: [['Revisión', 'el paso actual te espera']] },
  { clave: 'asignados_mi_empresa', coleccion: 'revision', etiqueta: 'Asignados a mi empresa',
    ayuda: 'Documentos de las revisiones cuyo paso actual espera a tu empresa: a ella, a alguien de ella o a su función en la obra.',
    criterios: [['Revisión', 'el paso actual espera a tu empresa']] },
  { clave: 'publicados', coleccion: 'publicados', etiqueta: 'Todos los publicados',
    ayuda: 'En estado ISO 19650 Publicado.',
    criterios: [['Estado ISO', 'Publicado']] },
  { clave: 'publicados_sin_entrega', coleccion: 'publicados', etiqueta: 'Publicados sin entrega',
    ayuda: 'Publicados que no están atados a ningún compromiso del plan de entregas.', soloConPlan: true,
    criterios: [['Estado ISO', 'Publicado'], ['Entrega', 'fuera del plan']] },
  { clave: 'plazo_vencido', coleccion: 'plan', etiqueta: 'Plazo vencido',
    ayuda: 'Vinculados a un compromiso del plan de entregas cuya fecha ya pasó, y todavía sin publicar.',
    criterios: [['Entrega', 'vinculado'], ['Plazo', 'vencido'], ['Estado ISO', 'sin publicar']] },
  { clave: 'vence_pronto', coleccion: 'plan', etiqueta: 'Vence en 7 días',
    ayuda: 'Vinculados a un compromiso que vence entre hoy y dentro de 7 días, y todavía sin publicar.',
    criterios: [['Entrega', 'vinculado'], ['Plazo', 'próximos 7 días'], ['Estado ISO', 'sin publicar']] },
];

/** Las fichas de criterio de una vista propia: [[campo, valor], …]. */
export function criteriosDeFiltros(filtros) {
  const f = filtros || {};
  const c = [];
  if (f.texto) c.push(['Nombre', `contiene «${f.texto}»`]);
  if (f.estado && f.estado !== 'ALL') c.push(['Estado ISO', ETIQUETA_ESTADO[f.estado] || f.estado]);
  if (f.tipo) c.push(['Tipo', f.tipo]);
  if (f.disciplina) c.push(['Disciplina', f.disciplina]);
  if (f.entrega) c.push(['Entrega', (ETIQUETA_ENTREGA[f.entrega] || f.entrega).toLowerCase()]);
  return c;
}

export const ETIQUETA_ESTADO = { WIP: 'WIP', SHARED: 'Compartido', PUBLISHED: 'Publicado', ARCHIVED: 'Archivado' };
export const ETIQUETA_ENTREGA = {
  entregado: 'Entregado', vinculado: 'Vinculado', vencido: 'Vencido',
  comprometido: 'Comprometido', fuera: 'Fuera del plan',
};

export const FILTROS_VACIOS = { tipo: null, disciplina: null, entrega: null };

/**
 * Los filtros de Archivos aplicados a unas filas, con las MISMAS reglas que la
 * carpeta (hooks/useFileExplorer.js): el texto por el nombre, el estado y las
 * fichas de tipo, disciplina (del código) y entrega (del plan).
 */
export function aplicarFiltros(filas, { texto = '', estado = 'ALL', meta = FILTROS_VACIOS } = {}) {
  const q = String(texto || '').trim().toLowerCase();
  const m = meta || FILTROS_VACIOS;
  return (filas || []).filter((f) => {
    if (q && !String(f.name || '').toLowerCase().includes(q)) return false;
    if (estado && estado !== 'ALL' && (f.status || 'WIP') !== estado) return false;
    if (m.tipo || m.disciplina) {
      const c = piezasDelCodigo(f.name);
      if (m.tipo && c?.tipo !== m.tipo) return false;
      if (m.disciplina && c?.disciplina !== m.disciplina) return false;
    }
    if (m.entrega && (f.entrega?.estado || 'fuera') !== m.entrega) return false;
    return true;
  });
}

/** ¿Hay algo que guardar? Una vista sin ningún filtro sería «todo». */
export function hayFiltros({ texto = '', estado = 'ALL', meta = FILTROS_VACIOS } = {}) {
  const m = meta || FILTROS_VACIOS;
  return Boolean(String(texto || '').trim() || (estado && estado !== 'ALL')
    || m.tipo || m.disciplina || m.entrega);
}

/** Los filtros de una vista dichos en una línea: «Disciplina ES · Publicado». */
export function describirFiltros(filtros) {
  const f = filtros || {};
  const partes = [];
  if (f.texto) partes.push(`«${f.texto}»`);
  if (f.estado && f.estado !== 'ALL') partes.push(ETIQUETA_ESTADO[f.estado] || f.estado);
  if (f.tipo) partes.push(`Tipo ${f.tipo}`);
  if (f.disciplina) partes.push(`Disciplina ${f.disciplina}`);
  if (f.entrega) partes.push(`Entrega: ${ETIQUETA_ENTREGA[f.entrega] || f.entrega}`);
  return partes.join(' · ');
}

/** Los parámetros con los que el servidor aplica una vista propia de toda la obra. */
export function parametrosDeVista(filtros) {
  const f = filtros || {};
  const p = new URLSearchParams({ vista: 'todos' });
  if (f.texto) p.set('q', f.texto);
  if (f.estado && f.estado !== 'ALL') p.set('estado', f.estado);
  for (const k of ['tipo', 'disciplina', 'entrega']) if (f[k]) p.set(k, f[k]);
  return p.toString();
}

// ── Las vistas propias, en el navegador ─────────────────────────────────────

export const MAXIMO_PROPIAS = 30;

// EL ORDEN DE LA TABLA viaja con la vista propia (como en Procore, que guarda la
// configuración de columnas). Solo el orden: qué columnas se ven no se elige hoy, y el
// ancho es una preferencia de cada persona para todas las tablas (anchosColumnas).
export const COLUMNAS_ORDENABLES = ['name', 'tipo', 'disciplina', 'version', 'status', 'entrega', 'updated', 'user', 'size'];
export const ORDEN_POR_DEFECTO = { col: 'name', dir: 1 };

export function limpiarOrden(o) {
  if (!o || typeof o !== 'object' || !COLUMNAS_ORDENABLES.includes(o.col)) return null;
  return { col: o.col, dir: o.dir === -1 ? -1 : 1 };
}
const MAX_NOMBRE = 60;

export function llaveDeVistas(obra, usuario) {
  return `alephia.vistas.${String(obra || '')}.${String(usuario || '')}`;
}

function limpiarFiltros(f) {
  const s = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);
  const salida = {
    texto: s(f?.texto),
    estado: ['WIP', 'SHARED', 'PUBLISHED', 'ARCHIVED'].includes(f?.estado) ? f.estado : null,
    tipo: s(f?.tipo), disciplina: s(f?.disciplina),
    entrega: Object.prototype.hasOwnProperty.call(ETIQUETA_ENTREGA, f?.entrega) ? f.entrega : null,
  };
  return salida;
}

function limpiarVista(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const nombre = typeof v.nombre === 'string' ? v.nombre.trim().slice(0, MAX_NOMBRE) : '';
  const id = typeof v.id === 'string' && v.id ? v.id : null;
  if (!nombre || !id) return null;
  const alcance = v.alcance === 'carpeta' ? 'carpeta' : 'obra';
  const carpeta = alcance === 'carpeta' && v.carpeta && typeof v.carpeta === 'object'
    && typeof v.carpeta.ruta === 'string'
    ? { ruta: v.carpeta.ruta, id: typeof v.carpeta.id === 'string' ? v.carpeta.id : null,
        nombre: typeof v.carpeta.nombre === 'string' ? v.carpeta.nombre : '' }
    : null;
  if (alcance === 'carpeta' && !carpeta) return null;
  const filtros = limpiarFiltros(v.filtros);
  if (!hayFiltros({ texto: filtros.texto, estado: filtros.estado || 'ALL', meta: filtros })) return null;
  return { id, nombre, alcance, carpeta, filtros, orden: limpiarOrden(v.orden) };
}

/** Las vistas propias guardadas. Ante CUALQUIER duda, ninguna (nunca un fallo). */
export function leerVistasPropias(almacen, obra, usuario) {
  try {
    const deposito = almacen || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!deposito || !obra || !usuario) return [];
    const crudo = deposito.getItem(llaveDeVistas(obra, usuario));
    if (!crudo) return [];
    const lista = JSON.parse(crudo);
    if (!Array.isArray(lista)) return [];
    const vistos = new Set();
    return lista.map(limpiarVista).filter((v) => {
      if (!v || vistos.has(v.id)) return false;
      vistos.add(v.id);
      return true;
    }).slice(0, MAXIMO_PROPIAS);
  } catch {
    return [];
  }
}

function escribir(almacen, obra, usuario, lista) {
  try {
    const deposito = almacen || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!deposito) return false;
    deposito.setItem(llaveDeVistas(obra, usuario), JSON.stringify(lista));
    return true;
  } catch {
    return false;
  }
}

/**
 * Guarda una vista propia. Devuelve { ok, lista, motivo }.
 * Un nombre repetido sustituye a la anterior: dos vistas con el mismo nombre
 * no se distinguen en el panel.
 */
export function guardarVistaPropia(almacen, obra, usuario, { nombre, alcance, carpeta, filtros, orden }, generarId) {
  const actual = leerVistasPropias(almacen, obra, usuario);
  const nueva = limpiarVista({
    id: (generarId || (() => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`))(),
    nombre, alcance, carpeta, filtros, orden,
  });
  if (!nueva) return { ok: false, lista: actual, motivo: 'La vista necesita un nombre y algún filtro.' };
  const sinRepetido = actual.filter(v => v.nombre.toLowerCase() !== nueva.nombre.toLowerCase());
  if (sinRepetido.length >= MAXIMO_PROPIAS) {
    return { ok: false, lista: actual, motivo: `Caben ${MAXIMO_PROPIAS} vistas propias por obra. Borra alguna.` };
  }
  const lista = [...sinRepetido, nueva];
  if (!escribir(almacen, obra, usuario, lista)) {
    return { ok: false, lista: actual, motivo: 'Este navegador no deja guardar (modo privado o almacenamiento lleno).' };
  }
  return { ok: true, lista, vista: nueva };
}

export function borrarVistaPropia(almacen, obra, usuario, id) {
  const actual = leerVistasPropias(almacen, obra, usuario);
  const lista = actual.filter(v => v.id !== id);
  if (!escribir(almacen, obra, usuario, lista)) return actual;
  return lista;
}
