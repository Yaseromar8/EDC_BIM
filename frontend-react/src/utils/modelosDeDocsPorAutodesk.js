// MODELOS DE DOCS QUE SE VEN POR AUTODESK DOCS (13-nov-2026, docs/archivos/29 §8).
//
// Una carpeta de ALEPHIA Docs puede tener el «puente ACC»: sus RVT y DWG se copian a Autodesk Docs y es Autodesk quien
// los prepara para verse. Esa versión no tiene traducción propia, así que «Importar modelo → ALEPHIA Docs» no la
// prepara: la vincula por Autodesk, con el enlace que Docs guardó en la versión. Aquí, lo puro: qué hacer según
// responda `GET /api/docs/cad/acc-link`. La autoridad es del servidor (`add-from-docs` vuelve a mirarlo todo y pone
// él el URN); esto solo decide qué se le enseña a la persona.

const URN_DE_VISOR = /^[A-Za-z0-9_-]{16,}$/;

/**
 * { urn }        se ve por Autodesk Docs y está lista: se cargan sus vistas y se vincula por ahí;
 * { espera }     usa el puente y Autodesk aún no terminó, falló o está en pausa: el texto para la persona;
 * null           no usa Autodesk Docs (o no se pudo saber): el camino de siempre, con la preparación de Docs.
 */
export function destinoPorAutodesk(respuesta) {
  const r = respuesta && typeof respuesta === 'object' ? respuesta : null;
  if (!r || r.success === false) return null;
  const urn = r.link && typeof r.link.viewer_urn === 'string' ? r.link.viewer_urn : '';
  if (URN_DE_VISOR.test(urn)) return { urn };
  const puente = r.bridge && typeof r.bridge === 'object' ? r.bridge : null;
  if (!puente) return null;
  if (puente.paused) return { espera: 'El puente con Autodesk Docs está en pausa: esta versión todavía no se puede vincular.' };
  if (puente.status === 'error') {
    const motivo = String(puente.error || '').trim().replace(/\.$/, '');
    return { espera: `Autodesk Docs no pudo preparar esta versión${motivo ? `: ${motivo}.` : '.'} Revísala en Docs.` };
  }
  return { espera: 'Autodesk Docs aún está preparando esta versión. Vuelve a intentarlo en unos minutos.' };
}

// Lo que se dice al elegir la vista de un modelo que se vincula por Autodesk Docs.
export const NOTA_POR_AUTODESK = 'Este modelo se ve a través de Autodesk Docs, por el puente de su carpeta. '
  + 'Se vincula por ahí: las versiones nuevas que subas a Docs llegan igual con «Buscar actualizaciones».';
