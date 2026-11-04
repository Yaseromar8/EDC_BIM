/**
 * DÓNDE ESTÁ ENLAZADO UN DOCUMENTO, desde su marca en la fila del original (5-nov-2026, docs/archivos/27; el dueño:
 * «si por error marqué una carpeta que no recuerdo cuál es, en el original debería poder darle clic a ese icono y que
 * se desenlace, así no agrandamos el clic derecho»).
 *
 * La lista la da el servidor (`GET /api/docs/enlaces`): solo las carpetas que quien mira puede ver, y en cada una si
 * puede quitar el enlace («Editar» en ella, lo mismo que exige `DELETE /api/docs/enlaces/<id>`). «Ir» lleva a la
 * carpeta; «Quitar» quita ese enlace y el original sigue en la suya. Escape y el clic fuera la cierran (capas).
 */
import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import useCapa from '../../../design/ui/useCapa.js';
import { apiFetch } from '../utils/apiFetch';
import { API } from '../utils/helpers';

const ANCHO = 340;

export default function EnlacesDelDocumento({ documento, ancla, obra, onCerrar, onIr, onCambio }) {
  const [lista, setLista] = useState(null);       // null = cargando
  const [error, setError] = useState('');
  const [quitando, setQuitando] = useState(null);
  const raiz = useRef(null);
  useCapa(true, { nivel: 2, contiene: (t) => !!raiz.current?.contains(t), cerrar: onCerrar });

  useEffect(() => {
    let vivo = true;
    apiFetch(`${API}/api/docs/enlaces?model_urn=${encodeURIComponent(obra)}&documento=${encodeURIComponent(documento.id)}`)
      .then(r => r.json().catch(() => ({})))
      .then(d => {
        if (!vivo) return;
        if (d?.success) setLista(d.enlazado_en || []);
        else setError(d?.error || 'No se pudo leer dónde está enlazado.');
      })
      .catch(() => vivo && setError('Sin conexión con el servidor.'));
    return () => { vivo = false; };
  }, [obra, documento.id]);

  const quitar = async (x) => {
    setQuitando(x.enlace);
    try {
      const r = await apiFetch(`${API}/api/docs/enlaces/${encodeURIComponent(x.enlace)}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo quitar el enlace.');
      toast.success(`Enlace quitado de «${x.carpeta.ruta.at(-1)}»: el documento sigue en su carpeta`);
      const resto = (lista || []).filter(y => y.enlace !== x.enlace);
      setLista(resto);
      onCambio?.();
      if (!resto.length) onCerrar();
    } catch (e) { toast.error(e.message); } finally { setQuitando(null); }
  };

  // Debajo de la marca, sin salirse de la ventana.
  const izquierda = Math.max(8, Math.min((ancla?.left ?? 0) - 12, window.innerWidth - ANCHO - 8));
  const arriba = Math.min((ancla?.bottom ?? 0) + 6, window.innerHeight - 120);

  return (
    <div ref={raiz} role="dialog" aria-label={`Dónde está enlazado «${documento.name}»`}
      style={{ position: 'fixed', left: izquierda, top: arriba, zIndex: 10002, width: ANCHO, maxHeight: 360,
               overflowY: 'auto', padding: 12, background: '#fff', border: '1px solid #e8e6dc', borderRadius: 8,
               boxShadow: '0 8px 24px rgb(20 20 19 / .12)', color: '#141413', fontSize: 13 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Enlazado en</div>
      {error && <p role="alert" style={{ margin: 0, color: '#b93535' }}>{error}</p>}
      {!error && lista === null && <p style={{ margin: 0, color: '#72706b' }}>Buscando…</p>}
      {!error && lista?.length === 0 && <p style={{ margin: 0, color: '#72706b' }}>Ya no está enlazado en ninguna carpeta que puedas ver.</p>}
      {(lista || []).map(x => (
        <div key={x.enlace} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                                     borderTop: '1px solid #f1f0e8' }}>
          <div style={{ flex: 1, minWidth: 0 }} title={x.carpeta.ruta.join(' / ')}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.carpeta.ruta.at(-1)}</div>
            {x.carpeta.ruta.length > 1 && (
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#72706b', fontSize: 12 }}>
                {x.carpeta.ruta.slice(0, -1).join(' / ')}</div>
            )}
          </div>
          <button type="button" className="barra-btn barra-btn--contorno" onClick={() => { onCerrar(); onIr(x.carpeta); }}>Ir</button>
          {x.puede_quitar && (
            <button type="button" className="barra-btn barra-btn--contorno" disabled={quitando === x.enlace}
              onClick={() => quitar(x)} style={{ color: '#b93535' }}>
              {quitando === x.enlace ? 'Quitando…' : 'Quitar'}</button>
          )}
        </div>
      ))}
    </div>
  );
}
