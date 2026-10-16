/**
 * decisionEnLector.js — Decidir una revisión SIN SALIR DEL PLANO (C2, diseño A).
 *
 * Procore deja aprobar dentro del visor; aquí se hace por el MISMO camino que la
 * pantalla de Revisiones (`POST /api/reviews/<id>/act`), sin rutas nuevas y sin
 * tocar el contrato REVIEWS-R01:
 *
 *   - la decisión vale para la REVISIÓN ENTERA (todos sus documentos), como hoy;
 *   - solo se ofrece lo que el servidor dice que esta persona puede hacer
 *     (`acciones.aprobar.disponible`, `acciones.rechazar.disponible`);
 *   - aprobar es ASIGNAR UN CÓDIGO DE IDONEIDAD con su consecuencia escrita
 *     (diseño A de docs/ux/maquetas/decision_revision_v1.html). Si la revisión
 *     ya trae su código, ese es el único; si no lo trae y el último paso lo
 *     exige, se elige del catálogo de la obra. El servidor lo vuelve a validar.
 *   - «No apto» es RECHAZAR, y se dice lo que de verdad pasa: la revisión termina
 *     rechazada y los documentos NO cambian de estado. No «vuelve al autor»: eso
 *     lo pintaba la maqueta y el motor no lo hace.
 *
 * Todo aquí es puro (sin red ni React): lo prueba pruebas/decisionEnLector.prueba.mjs.
 */
import { consecuenciaDeAprobar, CONSECUENCIA_DE_RECHAZAR, DESTINO, codigoDe } from './revisiones.js';

// Las familias del catálogo que valen para cada destino (lo mismo que idoneidad.jsx).
export const FAMILIA_DE_DESTINO = { PUBLISHED: 'publicado', SHARED: 'compartido' };

// Como mucho se consultan estas revisiones por documento abierto: «Mi trabajo»
// suele traer muy pocas, y abrir un plano no puede costar decenas de peticiones.
export const MAXIMO_DE_REVISIONES = 8;

/** Las revisiones de «Mi trabajo» que esperan por esta persona. */
export function revisionesPendientes(miTrabajo) {
  const lista = (miTrabajo && (miTrabajo.pendientes || miTrabajo.items)) || [];
  const ids = [];
  for (const p of lista) {
    if (!p || String(p.objeto_tipo || '').toUpperCase() !== 'REVIEW') continue;
    const id = String(p.objeto_id ?? '').trim();
    if (id && /^\d+$/.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, MAXIMO_DE_REVISIONES);
}

/** ¿Está este documento entre los de la revisión? (`items` guarda {node_id} o {id}). */
export function contieneDocumento(rev, nodeId) {
  if (!rev || !nodeId) return false;
  const objetivo = String(nodeId);
  return (rev.items || []).some(it => it && String(it.node_id ?? it.id ?? '') === objetivo);
}

/** ¿Puede esta persona actuar ahora mismo en la revisión? */
export function puedeDecidir(rev) {
  const a = (rev && rev.acciones) || {};
  return Boolean(rev && rev.status === 'pending'
    && ((a.aprobar && a.aprobar.disponible) || (a.rechazar && a.rechazar.disponible)));
}

/** La revisión en la que decidir sobre este documento, o null. */
export function revisionParaDecidir(revisiones, nodeId) {
  return (revisiones || []).find(r => contieneDocumento(r, nodeId) && puedeDecidir(r)) || null;
}

function etiquetaDelPaso(rev) {
  const pasos = rev.steps || [];
  const total = pasos.length;
  const n = Number.isInteger(rev.current_step) ? rev.current_step + 1 : null;
  return n && total ? `paso ${n} de ${total}` : '';
}

/** Cabecera del panel: código, título, paso y cuántos documentos cubre la decisión. */
export function resumenDeRevision(rev) {
  const documentos = (rev.items || []).length;
  return {
    codigo: rev.codigo || codigoDe(rev.id),
    titulo: rev.title || '',
    paso: etiquetaDelPaso(rev),
    vence: rev.paso_vence_en || null,
    documentos,
    alcance: documentos === 1
      ? 'Tu decisión vale para el único documento de esta revisión.'
      : `Tu decisión vale para los ${documentos} documentos de esta revisión, no solo para el que tienes abierto.`,
  };
}

/** ¿Hay que elegir código al aprobar? Solo al cerrar, si la revisión no lo trae. */
export function hayQueElegirCodigo(rev) {
  const aprobar = (rev && rev.acciones && rev.acciones.aprobar) || {};
  return Boolean(aprobar.disponible && aprobar.tipo === 'aprobar_y_cerrar'
    && !rev.codigo_idoneidad && FAMILIA_DE_DESTINO[aprobar.destino]);
}

/**
 * Las tarjetas que se ofrecen (diseño A), en orden: aprobar (una por código, o
 * una sola) y, si se puede, «No apto». `catalogo` = respuesta de
 * /api/docs/idoneidad (`codigos`), puede venir vacío.
 */
export function opcionesDeDecision(rev, catalogo = []) {
  if (!puedeDecidir(rev)) return [];
  const { aprobar = {}, rechazar = {} } = rev.acciones || {};
  const opciones = [];
  const destino = DESTINO[aprobar.destino] || aprobar.destino || '';
  // /api/docs/idoneidad la llama `etiqueta` (backend/idoneidad.py).
  const frase = c => (c && (c.etiqueta || c.descripcion)) || '';

  if (aprobar.disponible) {
    const consecuencia = consecuenciaDeAprobar(aprobar);
    if (aprobar.tipo === 'aprobar_y_cerrar' && rev.codigo_idoneidad) {
      const c = (catalogo || []).find(x => x.codigo === rev.codigo_idoneidad);
      opciones.push({
        clave: `aprobar:${rev.codigo_idoneidad}`, accion: 'approve', codigo: rev.codigo_idoneidad,
        titulo: frase(c) || `Apto como ${rev.codigo_idoneidad}`,
        breve: `Pasan a ${destino} como ${rev.codigo_idoneidad}.`,
        consecuencia: `${consecuencia} Quedan como ${rev.codigo_idoneidad}.`,
        enviaCodigo: false,
      });
    } else if (hayQueElegirCodigo(rev)) {
      const familia = FAMILIA_DE_DESTINO[aprobar.destino];
      for (const c of (catalogo || []).filter(x => x && x.codigo && (!familia || x.familia === familia))) {
        opciones.push({
          clave: `aprobar:${c.codigo}`, accion: 'approve', codigo: c.codigo,
          titulo: frase(c) || `Apto como ${c.codigo}`,
          breve: `Pasan a ${destino} como ${c.codigo}.`,
          consecuencia: `${consecuencia} Quedan como ${c.codigo}.`,
          enviaCodigo: true,
        });
      }
    } else {
      opciones.push({
        clave: 'aprobar', accion: 'approve', codigo: aprobar.tipo === 'conformidad' ? '✓' : '',
        titulo: aprobar.tipo === 'conformidad' ? 'Conforme'
          : aprobar.tipo === 'aprobar_y_cerrar' ? `Aprobar · pasa a ${destino}` : 'Aprobar este paso',
        breve: aprobar.tipo === 'aprobar_y_cerrar' ? `Se cierra y pasan a ${destino}.`
          : aprobar.siguiente_paso ? `Pasa al paso ${aprobar.siguiente_paso.numero} (${aprobar.siguiente_paso.persona}).`
          : 'Pasa al paso siguiente.',
        consecuencia, enviaCodigo: false,
      });
    }
  }
  if (rechazar.disponible) {
    opciones.push({
      clave: 'rechazar', accion: 'reject', codigo: '—', titulo: 'No apto · rechazar la revisión',
      breve: 'Termina rechazada; los documentos no cambian.',
      consecuencia: CONSECUENCIA_DE_RECHAZAR, enviaCodigo: false, rechazo: true,
    });
  }
  return opciones;
}

/** Lo que falta para poder confirmar (texto) o '' si se puede. */
export function faltaParaConfirmar(rev, opcion, catalogo = []) {
  if (!opcion) return 'Elige una decisión.';
  if (opcion.accion === 'approve' && hayQueElegirCodigo(rev) && !(catalogo || []).length) {
    return 'El catálogo de idoneidad de la obra no tiene códigos para este destino.';
  }
  return '';
}

/** El cuerpo de POST /api/reviews/<id>/act para esa opción. */
export function cuerpoDeLaDecision(opcion, comentario) {
  const cuerpo = { action: opcion.accion, comment: String(comentario || '').trim() };
  if (opcion.accion === 'approve' && opcion.enviaCodigo && opcion.codigo) {
    cuerpo.codigo_idoneidad = opcion.codigo;
  }
  return cuerpo;
}
