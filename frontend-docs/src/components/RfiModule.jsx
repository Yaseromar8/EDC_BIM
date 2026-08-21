import React from 'react';
import IssueModule from './IssueModule';

/**
 * RfiModule — RFI (Requerimiento de Información).
 *
 * Wrapper sobre IssueModule. `usaDirectorio` es el interruptor del flujo
 * profesional: responsable por IDENTIDAD (miembros de la obra, no una lista en
 * el navegador), plazo en días calendario, veredicto sólo por quien tiene el
 * RFI, aviso de bloqueo, adopción de los registros heredados e historial.
 *
 * Red Line (RedLineModule) también lo enciende desde F1, pero con SU semántica:
 * su veredicto acepta o rechaza una MODIFICACIÓN DEL PROYECTO, no una respuesta.
 * Compartir el componente no es compartir el flujo — las reglas de cada objeto
 * viven en su propio módulo del backend, y `ensayo_de_desacople` lo vigila.
 */
const RFI_CFG = {
  endpoint: 'api/rfis',
  singular: 'RFI',
  plural: 'RFIs',
  storageKey: 'rfi_responsables',
  usaDirectorio: true,
  // La columna guarda Aceptado/Rechazado. El texto de la respuesta vive en el
  // PDF adjunto, así que llamarla «Respuesta» engañaba a quien leía la tabla.
  etiquetaVeredicto: 'Veredicto',
};

export default function RfiModule(props) {
  return <IssueModule {...props} cfg={RFI_CFG} />;
}
