// EL MOSAICO DE UNA LÁMINA, PEDIDO AL SERVIDOR (paso B de docs/archivos/15).
//
// La fuente que usa el lector: da el manifiesto de ESA VERSIÓN y la URL
// firmada de cada tesela. Va por documento y versión, como la vista previa:
// qué objeto corresponde, y si quien pregunta puede verlo, lo decide el
// servidor con la misma puerta que el PDF (/api/docs/mosaico).
//
// La lógica --qué se pide, cuándo y cuántas veces-- está en
// utils/fuenteDeMosaico.js, que se prueba sin red; aquí solo se le pone la ruta.

import { apiFetch } from './apiFetch';
import { API } from './helpers';
import { crearFuente } from './fuenteDeMosaico';

async function preguntar(cuerpo, timeoutMs) {
  try {
    const r = await apiFetch(`${API}/api/docs/mosaico`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      timeoutMs,
    });
    const d = await r.json();
    return r.ok && d && d.success ? d : null;
  } catch {
    // Sin mosaico el lector sigue como hasta ahora: no depende de esto.
    return null;
  }
}

export function fuenteRemota(nodeId, versionId) {
  return crearFuente({ node_id: nodeId || null, version_id: versionId || null }, preguntar);
}
