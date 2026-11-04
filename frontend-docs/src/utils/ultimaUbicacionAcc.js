/**
 * LA ÚLTIMA UBICACIÓN DE ACC del «Puente temporal con ACC» (5-nov-2026, el dueño: «si en una primera vez navego hasta
 * la carpeta destino, después, cuando vaya a otra carpeta a hacer lo mismo, que reconozca esa última ubicación»).
 *
 * Se guarda en este navegador, por obra: centro, proyecto y la cadena de carpetas (id y nombre), nada más. Es una
 * comodidad de quien navega, no un dato de la obra: si falta, está rota o el navegador no deja guardar, el selector
 * empieza por los centros, como siempre. Sin React ni DOM, para probarlo (`pruebas/ultimaUbicacionAcc.prueba.mjs`).
 */

const TOPE_DE_CARPETAS = 40;

export const llaveDeUbicacion = (obra) => `alephia.acc-puente.ubicacion.${String(obra || '')}`;

const deposito = (almacen) => almacen || (typeof localStorage !== 'undefined' ? localStorage : null);

/** `{id, nombre}` de una entrada de ACC (o de una ya guardada); null si no sirve. */
function paso(e) {
  if (!e || typeof e !== 'object') return null;
  const id = typeof e.id === 'string' && e.id ? e.id : null;
  const nombre = e.nombre ?? e.attributes?.displayName ?? e.attributes?.name ?? id;
  return id ? { id, nombre: String(nombre || id).slice(0, 200) } : null;
}

/** La ubicación guardada: {hub, project, ancestors} con entradas de la forma de ACC, o null. Nunca lanza. */
export function leerUbicacion(obra, almacen) {
  try {
    const d = deposito(almacen);
    if (!d || !obra) return null;
    const crudo = JSON.parse(d.getItem(llaveDeUbicacion(obra)) || 'null');
    const hub = paso(crudo?.hub);
    if (!hub) return null;
    const project = paso(crudo.project);
    const carpetas = project && Array.isArray(crudo.ancestors) ? crudo.ancestors.map(paso) : [];
    if (carpetas.some(c => !c)) return null;
    const comoAcc = (p) => ({ id: p.id, attributes: { displayName: p.nombre } });
    return { hub: comoAcc(hub), project: project ? comoAcc(project) : null,
             ancestors: carpetas.slice(0, TOPE_DE_CARPETAS).map(comoAcc) };
  } catch {
    return null;
  }
}

/** Guarda dónde se está. Sin centro, la borra. Devuelve si pudo. */
export function guardarUbicacion(obra, { hub, project, ancestors } = {}, almacen) {
  try {
    const d = deposito(almacen);
    if (!d || !obra) return false;
    const h = paso(hub);
    if (!h) { d.removeItem(llaveDeUbicacion(obra)); return true; }
    const p = paso(project);
    d.setItem(llaveDeUbicacion(obra), JSON.stringify({
      hub: h, project: p,
      ancestors: p ? (ancestors || []).map(paso).filter(Boolean).slice(0, TOPE_DE_CARPETAS) : [],
    }));
    return true;
  } catch {
    return false;
  }
}

/** Lo que hay que pedir a ACC para mostrar esa ubicación: [nivel, ids] de `accReadOnlyPath`. */
export function nivelDeUbicacion({ hub, project, ancestors = [] } = {}) {
  if (!hub) return ['hubs', {}];
  if (!project) return ['projects', { hub_id: hub.id }];
  if (!ancestors.length) return ['topFolders', { hub_id: hub.id, project_id: project.id }];
  return ['contents', { project_id: project.id, folder_id: ancestors.at(-1).id }];
}
