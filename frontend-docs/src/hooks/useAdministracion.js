/**
 * useAdministracion — QUÉ administra quien está mirando, en ESTA obra.
 *
 * POR QUÉ EXISTE
 * --------------
 * Hasta el 21-ago-2026 la interfaz decidía con `user.role === 'admin'` si
 * enseñar «Crear carpeta», «Permisos», «Destruir» o «Archivar obra». Ese valor
 * es global: la misma persona veía los mismos botones en TODAS las obras,
 * incluso en las que no participaba.
 *
 * Ahora hay dos figuras distintas y la interfaz tiene que distinguirlas:
 *
 *   esEntityAdmin    el custodio de la instancia del cliente. Crea y archiva
 *                    obras, administra usuarios y el catálogo de la entidad.
 *                    Sigue siendo `user.role`, y sigue teniendo alcance global.
 *
 *   esAdminDeObra    administra UNA obra: su directorio, sus permisos, sus
 *                    rescates. Vive en la base (`project_users.es_admin`), así
 *                    que hay que PREGUNTARLO — el navegador no puede deducirlo.
 *
 * ESTO NO AUTORIZA NADA
 * ---------------------
 * Ningún valor de aquí concede permiso: cada ruta vuelve a comprobarlo en el
 * servidor. Lo único que evita es ofrecer botones que van a devolver 403.
 *
 * MIENTRAS NO SE SABE, NO SE OFRECE
 * ---------------------------------
 * `cargando` empieza en true y las dos respuestas en false. Es deliberado: si
 * la pregunta falla o todavía no ha vuelto, la interfaz enseña de menos, no de
 * más. Enseñar de más produce un botón que revienta; enseñar de menos produce
 * un botón que aparece medio segundo después.
 */
import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { API } from '../utils/helpers';

export function useAdministracion(project) {
  const projectId = project?.id;
  const [estado, setEstado] = useState({
    esEntityAdmin: false,
    esAdminDeObra: false,
    cargando: true,
  });

  useEffect(() => {
    if (!projectId) {
      setEstado({ esEntityAdmin: false, esAdminDeObra: false, cargando: false });
      return;
    }
    let vigente = true;
    setEstado((e) => ({ ...e, cargando: true }));
    apiFetch(`${API}/api/projects/${encodeURIComponent(projectId)}/mi-administracion`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vigente) return;
        setEstado({
          esEntityAdmin: !!d?.es_entity_admin,
          esAdminDeObra: !!d?.es_admin_de_obra,
          cargando: false,
        });
      })
      .catch(() => {
        // FAIL-CLOSED en la interfaz también: sin respuesta, no se ofrece.
        if (vigente) {
          setEstado({ esEntityAdmin: false, esAdminDeObra: false, cargando: false });
        }
      });
    return () => { vigente = false; };
  }, [projectId]);

  return estado;
}

export default useAdministracion;
