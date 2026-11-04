/**
 * useVistaDeApertura — la vista con la que abre ESTE documento desde ESTA carpeta (docs/archivos/28).
 *
 * `carpeta`: la carpeta desde la que se mira (la de un enlace); sin ella, la del documento. `activo`: solo para un CAD
 * o un PDF de la obra. Lee una vez por documento y carpeta (`GET /api/docs/vista-de-apertura`); fijar y restablecer
 * devuelven el estado nuevo. Mientras no ha contestado, `listo` es false: quien abre sabe que aún puede llegar una.
 */
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiFetch';

const VACIO = { clave: null, vista: null, carpeta: null, puedeFijar: false, fijadaPor: null, fijadaEn: null, disponible: false };

export function useVistaDeApertura(API, obra, documento, carpeta, activo) {
  const clave = activo && obra && documento ? `${documento}|${carpeta || ''}` : null;
  const [estado, setEstado] = useState(VACIO);

  const consulta = useCallback(() => new URLSearchParams({
    model_urn: obra, documento: String(documento), ...(carpeta ? { carpeta: String(carpeta) } : {}),
  }).toString(), [obra, documento, carpeta]);

  useEffect(() => {
    if (!clave) return undefined;
    let vivo = true;
    apiFetch(`${API}/api/docs/vista-de-apertura?${consulta()}`)
      .then(r => r.json().catch(() => ({})))
      .then(d => {
        if (!vivo) return;
        setEstado(d?.success
          ? { clave, vista: d.vista || null, carpeta: d.carpeta || null, puedeFijar: !!d.puede_fijar,
              fijadaPor: d.fijada_por || null, fijadaEn: d.fijada_en || null, disponible: d.disponible !== false }
          : { ...VACIO, clave });
      })
      .catch(() => { if (vivo) setEstado({ ...VACIO, clave }); });
    return () => { vivo = false; };
  }, [API, clave, consulta]);

  const escribir = useCallback(async (metodo, vista) => {
    const r = await apiFetch(`${API}/api/docs/vista-de-apertura${metodo === 'DELETE' ? `?${consulta()}` : ''}`, {
      method: metodo, headers: { 'Content-Type': 'application/json' },
      ...(metodo === 'PUT' ? { body: JSON.stringify({ model_urn: obra, documento: String(documento),
                                                       ...(carpeta ? { carpeta: String(carpeta) } : {}), vista }) } : {}),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo guardar la vista de apertura.');
    setEstado(e => ({ ...e, vista: d.vista || null, fijadaPor: d.vista ? 'ti' : null,
                      fijadaEn: d.vista ? new Date().toISOString() : null }));
    return d.vista || null;
  }, [API, obra, documento, carpeta, consulta]);

  const listo = !clave || estado.clave === clave;
  return {
    listo,
    ...(listo && clave ? estado : VACIO),
    fijar: (vista) => escribir('PUT', vista),
    restablecer: () => escribir('DELETE'),
  };
}
