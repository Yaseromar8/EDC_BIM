/**
 * frenteDeVistas — LAS SAVED VIEWS SON DE UN FRENTE, NO DE LA SESIÓN.
 * ---------------------------------------------------------------------------
 * El resto de la aplicación usa `'global'` como marcador de «todavía no hay
 * frente»: `selectedProject?.id || 'global'` aparece una docena de veces en
 * App.jsx. Para casi todo es inofensivo. Para las vistas guardadas no lo es:
 *
 *   · el listado se ACOTA por frente (`GET /api/views?project=...`), y el
 *     servidor traduce ese valor a obra con `resolve_project_id` antes de
 *     comprobar pertenencia;
 *   · `'global'` NO resuelve, y no por descuido: la regla «si hay una sola obra
 *     activa, esa» se retiró a propósito (backend/db.py), porque resolvía todo
 *     por accidente mientras hubiera una sola obra.
 *
 * Así que pedir el listado con `'global'` solo puede terminar en 403. Esto no
 * relaja nada en el servidor —allí sigue siendo un frente que no resuelve, y
 * por tanto una negativa—: lo que hace es dejar de enviar una petición que ya
 * se sabe que no procede, y decirlo en la interfaz en vez de enseñar una lista
 * vacía que parece decir «este frente no tiene vistas».
 *
 * POR QUE ESTO ES UN MÓDULO Y NO CUATRO LÍNEAS DENTRO DEL EFECTO
 * --------------------------------------------------------------
 * Porque dentro de un componente de 5.000 líneas no se puede ejecutar en una
 * prueba, y una guarda que no se puede ejecutar es una guarda que nadie vuelve
 * a comprobar. Aquí la batería llama a LA MISMA función que llama App.jsx.
 */

/**
 * El frente al que pertenecen las vistas, o `null` si no hay ninguno.
 *
 * Los tres estados «sin frente» que existen de verdad en App.jsx:
 *   · `selectedProject === null`        — todavía en la pantalla de proyectos
 *   · un objeto sin `id` ni `name`      — lo produce la rama de vista
 *                                         compartida cuando la vista no guardó
 *                                         obra (las tres de marzo tienen
 *                                         `project_id` vacío)
 *   · el marcador `'global'`            — el que usa el resto del fichero
 */
export const frenteDeVistas = (proyecto) => {
    const id = proyecto?.id || proyecto?.name || null;
    return id && id !== 'global' ? id : null;
};

/**
 * Carga el listado del frente. Sin frente, NO SE PIDE NADA y la lista se vacía.
 *
 * Vaciarla es la mitad que se olvida: volver a un contexto sin frente dejaría
 * en pantalla las vistas del frente anterior, que es peor que no enseñar nada
 * —parecen tuyas y no lo son—.
 *
 * @returns {boolean} si se llegó a pedir algo. La batería lo usa para contar.
 */
export function cargarVistasDelFrente({ frente, apiFetch, backendUrl, onVistas, onError }) {
    if (!frente) {
        onVistas([]);
        return false;
    }
    apiFetch(`${backendUrl}/api/views?project=${encodeURIComponent(frente)}`)
        .then((res) => res.json())
        .then((data) => {
            if (Array.isArray(data)) onVistas(data);
        })
        .catch((err) => (onError ? onError(err) : console.error('Error loading views:', err)));
    return true;
}
