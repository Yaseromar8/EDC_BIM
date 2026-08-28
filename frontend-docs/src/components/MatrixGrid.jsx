// MatrixGrid — la vista de CUADRÍCULA del explorador (como ACC).
//
// LA PREGUNTA QUE RESUELVE, Y QUE LA LISTA NO PUEDE:
//     ¿CUÁL DE ESTOS PLANOS ES EL QUE BUSCO?
//
// En una carpeta de 45 planos con nombres que difieren en un dígito
// (…011220, …011221, …011222), la lista obliga a leer códigos. La
// cuadrícula deja que el ojo reconozca el dibujo, que es como trabaja
// alguien de obra.
//
// CÓMO CARGAN LAS MINIATURAS (y por qué antes no cargaban): se piden en UNA
// petición las URLs firmadas de toda la carpeta y se ponen en <img src>. El
// navegador las baja EN PARALELO directo del almacén y las cachea — igual
// que ACC. La versión anterior pedía cada imagen al backend, autenticada y
// de dos en dos, obligándole a bajar y reenviar cada objeto: dos saltos por
// miniatura, y en blanco si el servidor estaba ocupado.
import React, { useEffect, useRef, useState } from 'react';
import { urlsDeMiniaturas } from '../utils/colaMiniaturas';
import { renderFileIconSop } from '../utils/fileIcons';

const CON_VISTA = /\.(pdfx?|jpe?g|png|webp|gif)$/i;

export default function MatrixGrid({
  folders = [], files = [], selected, toggle, navigate, setActiveFile,
  onRowMenu, isAdmin, projectPrefix,
}) {
  const marcado = (id) => (selected instanceof Set ? selected.has(id) : !!selected?.[id]);
  const [urls, setUrls] = useState({});
  const [pendientes, setPendientes] = useState(0);
  const reintento = useRef(null);

  useEffect(() => {
    let vivo = true;
    const conVista = files.filter(f => f.gcs_urn && CON_VISTA.test(f.name || ''));
    if (!conVista.length) { setUrls({}); setPendientes(0); return undefined; }

    const pedir = async () => {
      const { urls: mapa, pendientes: faltan } =
        await urlsDeMiniaturas(projectPrefix, conVista.map(f => f.gcs_urn));
      if (!vivo) return;
      setUrls(prev => ({ ...prev, ...mapa }));
      setPendientes(faltan.length);
      // Las que faltaban se están generando en el servidor: se vuelve a
      // preguntar una vez, sin insistir — mejor un icono honesto que una
      // pantalla que machaca al backend.
      if (faltan.length) reintento.current = setTimeout(pedir, 12000);
    };
    pedir();
    return () => {
      vivo = false;
      if (reintento.current) clearTimeout(reintento.current);
    };
  }, [files, projectPrefix]);

  return (
    <div className="rejilla">
      {pendientes > 0 && (
        <div className="rejilla-aviso">
          Preparando {pendientes} vista{pendientes === 1 ? '' : 's'} previa
          {pendientes === 1 ? '' : 's'} en el servidor…
        </div>
      )}

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
          <div className="rejilla-lienzo">
            {urls[item.gcs_urn]
              ? <img src={urls[item.gcs_urn]} alt="" loading="lazy" />
              : <div className="rejilla-sin-vista">{renderFileIconSop(item.name, 42)}</div>}
          </div>
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
