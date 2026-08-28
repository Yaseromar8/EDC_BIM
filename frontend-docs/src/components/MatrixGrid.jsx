// MatrixGrid — la vista de CUADRÍCULA del explorador (como ACC).
//
// LA PREGUNTA QUE RESUELVE, Y QUE LA LISTA NO PUEDE:
//     ¿CUÁL DE ESTOS PLANOS ES EL QUE BUSCO?
//
// En una carpeta de 45 planos con nombres que difieren en un dígito
// (…011220, …011221, …011222), la lista obliga a leer códigos. La
// cuadrícula deja que el ojo reconozca el dibujo, que es como trabaja
// alguien de obra. La lista sigue siendo la vista por defecto: manda cuando
// lo que importa son los metadatos (versión, estado, quién y cuándo).
import React, { useEffect, useRef, useState } from 'react';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import { pedirMiniatura, urlDeMiniatura } from '../utils/colaMiniaturas';
import { renderFileIconSop } from '../utils/fileIcons';

function Miniatura({ item }) {
  const ref = useRef(null);
  const [src, setSrc] = useState(null);
  const [falla, setFalla] = useState(false);
  const [pidiendo, setPidiendo] = useState(false);

  const puedeTenerVista = /\.(pdfx?|jpe?g|png|webp|gif)$/i.test(item.name || '');

  useEffect(() => {
    const el = ref.current;
    if (!el || src || falla || !item.gcs_urn || !puedeTenerVista) return undefined;
    if (typeof IntersectionObserver === 'undefined') return undefined;
    let vivo = true;
    let objectUrl = null;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      setPidiendo(true);
      pedirMiniatura(() => apiFetch(urlDeMiniatura(API, item.gcs_urn), { timeoutMs: 60000 })
        .then(r => (r.ok ? r.blob() : Promise.reject(new Error('sin miniatura'))))
        .then(b => {
          // Si el servidor no supo hacerla devuelve el original: eso no es
          // una imagen y hay que decirlo, no pintar un hueco.
          if (!b.type.startsWith('image/')) throw new Error('no es imagen');
          return b;
        }))
        .then(b => {
          if (!vivo) return;
          objectUrl = URL.createObjectURL(b);
          setSrc(objectUrl);
        })
        .catch(() => vivo && setFalla(true))
        .finally(() => vivo && setPidiendo(false));
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => {
      vivo = false;
      io.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item, src, falla, puedeTenerVista]);

  return (
    <div ref={ref} className="rejilla-lienzo">
      {src ? <img src={src} alt="" />
           : <div className="rejilla-sin-vista">
               {puedeTenerVista && pidiendo ? <span className="rejilla-punto" />
                 : renderFileIconSop(item.name, 42)}
             </div>}
    </div>
  );
}

export default function MatrixGrid({
  folders = [], files = [], selected, toggle, navigate, setActiveFile,
  onRowMenu, isAdmin,
}) {
  const marcado = (id) => (selected instanceof Set ? selected.has(id) : !!selected?.[id]);

  return (
    <div className="rejilla">
      {folders.map(f => (
        <div key={f.id || f.fullName} className="rejilla-tarjeta es-carpeta"
          onDoubleClick={() => navigate(f.fullName)}
          onContextMenu={(e) => { e.preventDefault(); onRowMenu({ ...f, type: 'folder' }, e); }}>
          <div className="rejilla-lienzo">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#8a95a1"
              strokeWidth="1.4"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
          </div>
          <div className="rejilla-pie">
            <div className="rejilla-nombre" title={f.name}>{f.name}</div>
          </div>
        </div>
      ))}

      {files.map(item => (
        <div key={item.id || item.fullName}
          className={`rejilla-tarjeta${marcado(item.id) ? ' esta-marcada' : ''}`}
          onClick={() => setActiveFile(item)}
          onContextMenu={(e) => { e.preventDefault(); onRowMenu(item, e); }}>
          <label className="rejilla-marca" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={marcado(item.id)}
              onChange={() => toggle(item.id)} />
          </label>
          <Miniatura item={item} />
          <div className="rejilla-pie">
            <div className="rejilla-nombre" title={item.name}>{item.name}</div>
            <div className="rejilla-meta">
              <span className="rejilla-version">V{item.version || 1}</span>
              {item.description && (
                <span className="rejilla-desc" title={item.description}>{item.description}</span>
              )}
            </div>
          </div>
          <button className="rejilla-menu" title="Más acciones"
            onClick={(e) => { e.stopPropagation(); onRowMenu(item, e); }}>⋮</button>
        </div>
      ))}

      {!folders.length && !files.length && (
        <div className="rejilla-vacia">Esta carpeta está vacía.</div>
      )}
    </div>
  );
}
