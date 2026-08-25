// SelectorDeDocumento — elegir un fichero DEL EXPEDIENTE, sin subir nada.
//
// POR QUE EXISTE
// --------------
// Planos y especificaciones no almacenan documentos: APUNTAN a un
// `file_version` que ya vive en el expediente, con su carpeta, su permiso y su
// SHA-256. Para apuntar hace falta elegir, y el portal no tenía dónde elegir:
// la única navegación por el expediente estaba enterrada dentro de
// `IssueModule` (el componente de RFI y Red Line), inaccesible para nadie más.
//
// La consecuencia era medible: la pantalla de Planos podía crear la identidad
// de un plano pero no emitir su primera revisión, porque no tenía forma de
// señalar el PDF. La ruta existía en el backend y no la llamaba nadie.
//
// SE DEVUELVE LA VERSION, NO SOLO EL NODO
// ----------------------------------------
// Guardar solo el nodo significa «lo que haya hoy en ese fichero»: bastaría con
// que alguien subiera otra versión para que una revisión ya emitida enseñara
// otro texto. Es el mismo defecto que ya se corrigió en las entregas y en los
// adjuntos de los RFI.
import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiFetch';

export default function SelectorDeDocumento({ API, project, titulo, ayuda,
                                              onElegir, onCerrar }) {
  // EL URN DE LA OBRA, NO UNA RUTA DEDUCIDA DE SU NOMBRE.
  //
  // La primera versión construía `proyectos/<NOMBRE_CON_GUIONES>`, copiado de
  // `IssueModule`. Conduciendo la interfaz de verdad contra producción se vio
  // que el selector salía VACÍO: los documentos de esa obra viven bajo su id
  // canónico (`b.proj_…`) y con la ruta deducida el expediente devolvía cero
  // carpetas y cero ficheros. La ruta deducida solo acierta cuando el nombre
  // de la obra coincide con la carpeta, que es una coincidencia y no una regla.
  //
  // Se conserva la deducción como último recurso, para una obra que solo tenga
  // el árbol antiguo.
  const raiz = project?.model_urn || project?.urn
            || `proyectos/${(project?.name || '').replace(/ /g, '_')}`;
  const [ruta, setRuta] = useState([{ id: null, name: project?.name || 'Obra', path: raiz + '/' }]);
  const [nodos, setNodos] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async (nodeId, path) => {
    setCargando(true);
    try {
      let url = `${API}/api/docs/list?model_urn=${encodeURIComponent(raiz)}`;
      if (nodeId) url += `&id=${nodeId}`;
      if (path) url += `&path=${encodeURIComponent(path)}`;
      const r = await apiFetch(url);
      const j = r.ok ? await r.json() : {};
      const d = j.data || {};
      setNodos([
        ...(d.folders || []).map(f => ({ ...f, _carpeta: true })),
        ...(d.files || []).map(f => ({ ...f, _carpeta: false })),
      ]);
    } catch (e) {
      setNodos([]);
    } finally {
      setCargando(false);
    }
  }, [API, raiz]);

  useEffect(() => { cargar(null, raiz + '/'); }, [cargar, raiz]);

  const entrar = (n) => {
    if (n._carpeta) {
      setRuta(p => [...p, { id: n.id, name: n.name, path: n.fullName || '' }]);
      cargar(n.id, n.fullName);
    } else {
      onElegir({
        file_node_id: n.id,
        file_version_id: n.current_version_id || null,
        nombre: n.name,
        version: n.version_number || null,
      });
    }
  };

  const volverA = (i) => {
    const c = ruta[i];
    setRuta(p => p.slice(0, i + 1));
    cargar(c.id, c.path);
  };

  return (
    <div onClick={onCerrar}
         style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,26,.45)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 1100 }}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: '#fff', borderRadius: 10, padding: 22, width: 560,
                    maxWidth: '94vw', maxHeight: '82vh', display: 'flex',
                    flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,.22)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 650 }}>
          {titulo || 'Elegir documento del expediente'}
        </h3>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#78838f', lineHeight: 1.5 }}>
          {ayuda || 'No se sube nada: se apunta al documento que ya está en el '
                  + 'expediente, y se fija la versión concreta.'}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
                      fontSize: 12, marginBottom: 10 }}>
          {ruta.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ color: '#c3c9d0' }}>/</span>}
              <button type="button" onClick={() => volverA(i)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer',
                               color: i === ruta.length - 1 ? '#1f2933' : '#3E6F91',
                               fontWeight: i === ruta.length - 1 ? 600 : 400,
                               padding: '2px 3px', fontSize: 12 }}>
                {c.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #eceff2',
                      borderRadius: 7, minHeight: 200 }}>
          {cargando && (
            <div style={{ padding: 26, textAlign: 'center', color: '#98a1ab', fontSize: 13 }}>
              Cargando…
            </div>
          )}
          {!cargando && nodos.length === 0 && (
            <div style={{ padding: 26, textAlign: 'center', color: '#98a1ab', fontSize: 13 }}>
              Esta carpeta está vacía.
            </div>
          )}
          {!cargando && nodos.map(n => (
            <button key={n.id} type="button" onClick={() => entrar(n)}
                    style={{ width: '100%', textAlign: 'left', border: 'none',
                             borderBottom: '1px solid #f4f6f8', background: '#fff',
                             padding: '9px 12px', cursor: 'pointer', display: 'flex',
                             alignItems: 'center', gap: 9, fontSize: 13 }}>
              <span style={{ fontSize: 14 }}>{n._carpeta ? '📁' : '📄'}</span>
              <span style={{ flex: 1, color: '#1f2933', overflow: 'hidden',
                             textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {n.name}
              </span>
              {!n._carpeta && n.version_number && (
                <span style={{ fontSize: 11, color: '#8a9199' }}>v{n.version_number}</span>
              )}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" onClick={onCerrar}
                  style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #dfe3e8',
                           background: '#fff', fontSize: 13, cursor: 'pointer' }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
