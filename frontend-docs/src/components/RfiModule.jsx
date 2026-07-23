import React from 'react';
import IssueModule from './IssueModule';

/**
 * RfiModule — RFI (Requerimiento de Información).
 *
 * Wrapper sobre IssueModule (ver RedLineModule). Actualmente NO está montado
 * en la barra lateral —se retiró a pedido—, pero queda listo para reactivarse
 * con una sola línea en FilesPage.
 */
const RFI_CFG = {
  endpoint: 'api/rfis',
  singular: 'RFI',
  plural: 'RFIs',
  storageKey: 'rfi_responsables',
};

export default function RfiModule(props) {
  return <IssueModule {...props} cfg={RFI_CFG} />;
}
