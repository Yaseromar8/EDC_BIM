/**
 * LA VISTA DE APERTURA (5-nov-2026, docs/archivos/28): con qué vista abre un CAD o un PDF desde cada carpeta.
 *
 * Aquí solo las decisiones, sin React ni DOM, para probarlas (`pruebas/vistaDeApertura.prueba.mjs`). Lo que se guarda
 * lo valida el servidor (backend/vistas_de_apertura.py); esto decide cómo se captura y cómo se vuelve a ella.
 *
 *   CAD  {tipo: 'cad', presentacion: {guid, nombre, viewable_id}, camara}: la cámara es la de Autodesk Viewer
 *        (`getState({viewport: true}).viewport`).
 *   PDF  {tipo: 'pdf', pagina, zoom, centro: [fx, fy]}: el zoom es RELATIVO a la hoja entera y el centro va en
 *        fracción de la hoja, así la vista vale igual en un portátil y en un monitor grande.
 */

/** 'cad', 'pdf' o null, por el nombre del documento (como el servidor). */
export function tipoDeVista(nombre) {
  const n = String(nombre || '').toLowerCase();
  if (/\.(dwg|dxf)$/.test(n)) return 'cad';
  if (/\.pdf$/.test(n)) return 'pdf';
  return null;
}

/**
 * La presentación de un CAD con la que abrir: la misma (`guid`) si existe; si no --otra versión del plano--, la que
 * se llame igual. `presentaciones`: [{guid, nombre}]. Devuelve {guid, motivo}: motivo 'misma', 'por_nombre' o
 * 'no_esta' (entonces guid es null y se abre la vista por defecto, avisando).
 */
export function presentacionDeApertura(presentaciones, vista) {
  const p = vista?.presentacion;
  if (!p) return { guid: null, motivo: 'no_esta' };
  const lista = presentaciones || [];
  if (lista.some(x => x.guid === p.guid)) return { guid: p.guid, motivo: 'misma' };
  const nombre = String(p.nombre || '').trim().toLowerCase();
  const igual = nombre && lista.find(x => String(x.nombre || '').trim().toLowerCase() === nombre);
  return igual ? { guid: igual.guid, motivo: 'por_nombre' } : { guid: null, motivo: 'no_esta' };
}

/** La vista de un CAD tal como se guarda, de lo que dice el visor. */
export function vistaDeCad(presentacion, viewport) {
  if (!presentacion?.guid || !viewport) return null;
  return {
    tipo: 'cad',
    presentacion: { guid: presentacion.guid, nombre: presentacion.nombre || presentacion.guid,
                    ...(presentacion.viewableID ? { viewable_id: String(presentacion.viewableID) } : {}) },
    camara: viewport,
  };
}

/** La escala con la que la hoja entera cabe en la pantalla, con la misma holgura que «Ajustar página» (64 px). */
export function escalaDeHojaEntera(base, ancho, alto) {
  if (!base?.width || !base?.height || !(ancho > 0) || !(alto > 0)) return null;
  return Math.max(0.2, Math.min((ancho - 64) / base.width, (alto - 64) / base.height));
}

/**
 * La vista de un PDF tal como se guarda: la página, el zoom relativo a la hoja entera y el punto de la hoja que está
 * en el centro de la pantalla. `rectHoja` y `rectVista`, rectángulos de pantalla; `base`, la hoja a escala 1.
 */
export function vistaDePdf({ pagina, rectHoja, rectVista, base }) {
  if (!pagina || !rectHoja || !rectVista || !base?.width) return null;
  const escala = rectHoja.width / base.width;
  const entera = escalaDeHojaEntera(base, rectVista.width, rectVista.height);
  if (!(escala > 0) || !entera) return null;
  const cx = rectVista.left + rectVista.width / 2, cy = rectVista.top + rectVista.height / 2;
  const redondo = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
  return {
    tipo: 'pdf', pagina,
    zoom: redondo(escala / entera, 4),
    centro: [redondo((cx - rectHoja.left) / escala / base.width, 5), redondo((cy - rectHoja.top) / escala / base.height, 5)],
  };
}

/**
 * Cómo volver a una vista de PDF en ESTA pantalla: la escala y el punto anclado al centro, en la forma que usa el
 * zoom del lector (`{ux, uy, clientX, clientY}`, utils/navegacionLector.js). Null si aún no se puede.
 */
export function encuadreDePdf(vista, base, rectVista) {
  if (vista?.tipo !== 'pdf' || !base?.width || !rectVista) return null;
  const entera = escalaDeHojaEntera(base, rectVista.width, rectVista.height);
  if (!entera) return null;
  return {
    escala: entera * vista.zoom,
    punto: { ux: vista.centro[0] * base.width, uy: vista.centro[1] * base.height,
             clientX: rectVista.left + rectVista.width / 2, clientY: rectVista.top + rectVista.height / 2 },
  };
}

/** Lo que se dice de una vista guardada: «PLANTA-SA» o «hoja 4 · ×2,5». */
export function describirVista(vista) {
  if (!vista) return 'la vista por defecto';
  if (vista.tipo === 'cad') return `«${vista.presentacion?.nombre || 'la presentación'}»`;
  if (vista.tipo === 'pdf') {
    const z = Math.round((vista.zoom || 1) * 10) / 10;
    return `hoja ${vista.pagina}${Math.abs(z - 1) > 0.05 ? ` · ×${String(z).replace('.', ',')}` : ''}`;
  }
  return 'una vista guardada';
}
