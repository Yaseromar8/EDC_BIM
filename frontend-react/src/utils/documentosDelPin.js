/**
 * LOS DOCUMENTOS DE DOCS QUE SE VINCULAN A UN PIN DEL MODELO (docs/archivos/29, F1).
 *
 * Cada uno se guarda por su id de Docs (`nodeId`) y su nombre; nunca una URL hecha: se abre siempre por Docs
 * (`/api/docs/view?id=…`), que sirve la versión vigente y comprueba el permiso de quien lo abre. Sin React, para
 * probarlo (`pruebas/documentosDelPin.prueba.mjs`).
 */

/** Las entradas a añadir: solo documentos (no carpetas), sin repetir los que el pin ya tiene. */
export function documentosParaVincular(idsElegidos, disponibles, yaVinculados = []) {
  const ya = new Set((yaVinculados || []).map(d => String(d?.nodeId || d?.id || '')).filter(Boolean));
  const salida = [];
  for (const id of idsElegidos || []) {
    const f = (disponibles || []).find(x => String(x?.id) === String(id));
    if (!f || /^folder$/i.test(String(f.type || '')) || ya.has(String(f.id))) continue;
    ya.add(String(f.id));
    salida.push({
      id: String(f.id),
      nodeId: String(f.id),
      name: f.name || 'Documento',
      type: String(f.name || '').includes('.') ? String(f.name).split('.').pop().toLowerCase() : '',
    });
  }
  return salida;
}

/** Cómo se abre un documento del pin: por Docs si se sabe cuál es; si es un vínculo antiguo, su URL. */
export function urlParaAbrir(doc, docsApi, obra) {
  if (doc?.nodeId) return `${docsApi}/view?id=${encodeURIComponent(doc.nodeId)}&model_urn=${encodeURIComponent(obra || '')}`;
  return doc?.url || null;
}
