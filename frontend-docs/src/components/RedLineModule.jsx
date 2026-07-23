import React from 'react';
import IssueModule from './IssueModule';

/**
 * RedLineModule — Red Lines (observaciones marcadas sobre plano).
 *
 * La implementación completa vive en IssueModule: RFI y Red Line son el MISMO
 * flujo de incidencia (listado, edición inline, adjuntos, export XLSX/PDF) y
 * solo cambian el endpoint y las etiquetas. Antes eran dos archivos de 1.387
 * líneas idénticas — arreglar un bug obligaba a hacerlo dos veces.
 */
const RED_LINE_CFG = {
  endpoint: 'api/redlines',
  singular: 'Red Line',
  plural: 'Red Lines',
  storageKey: 'redline_responsables',
};

export default function RedLineModule(props) {
  return <IssueModule {...props} cfg={RED_LINE_CFG} />;
}
