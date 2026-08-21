import React from 'react';
import IssueModule from './IssueModule';

/**
 * RedLineModule — Red Lines: el registro de los CROQUIS DE MODIFICACIÓN del
 * proyecto.
 *
 * NO es un módulo de observaciones ni un markup gráfico. Los 33 registros
 * reales adjuntan croquis numerados y firmados (`RL_0004_…_SKT_….pdf`) y sus
 * títulos son modificaciones: «Reubicar BP-04 y cambio de cota BP-01». El
 * veredicto acepta o rechaza LA MODIFICACIÓN.
 *
 * El markup gráfico es otra cosa y ya existe aparte: se dibuja con
 * `PdfToolsOverlay` dentro del visor de PDF, y no comparte nada con esto.
 *
 * La implementación vive en IssueModule porque RFI y Red Line son la misma
 * FAMILIA —registro numerado de documentos formales con veredicto— y antes
 * eran dos archivos de 1.387 líneas idénticas. Compartir el componente no es
 * compartir el flujo: `usaDirectorio` enciende el flujo profesional, y las
 * reglas de cada objeto viven en su propio módulo del backend.
 */
const RED_LINE_CFG = {
  endpoint: 'api/redlines',
  singular: 'Red Line',
  plural: 'Red Lines',
  storageKey: 'redline_responsables',
  // Responsable por IDENTIDAD (miembros de la obra, no una lista en el
  // navegador), plazo en días calendario, veredicto sólo por quien lo tiene,
  // aviso de bloqueo, adopción de los heredados e historial.
  usaDirectorio: true,
  // La columna guarda Aceptado/Rechazado sobre la MODIFICACIÓN. Llamarla
  // «Respuesta» hacía pensar que contenía un texto de respuesta.
  etiquetaVeredicto: 'Veredicto',
};

export default function RedLineModule(props) {
  return <IssueModule {...props} cfg={RED_LINE_CFG} />;
}
