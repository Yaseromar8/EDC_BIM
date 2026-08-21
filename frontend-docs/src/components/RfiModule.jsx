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
 * Observaciones (RedLineModule) todavía NO lo enciende: su semántica es otra y
 * se decide aparte. Compartir el componente no obliga a compartir el flujo.
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
