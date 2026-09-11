/**
 * capacidadesDeSeleccion — QUÉ SE PUEDE HACER CON LO QUE HAY SELECCIONADO.
 *
 * UNA SOLA FUENTE para las tres superficies: la barra de acciones, el menú
 * contextual y la cuadrícula. Ninguna de ellas decide; las tres preguntan aquí
 * y sólo pintan la respuesta.
 *
 * EL DEFECTO QUE ESTO CIERRA
 * --------------------------
 * Cada superficie decidía por su cuenta, y la barra decidía mal: ofrecía
 * «Desplazar» y «Suprimir» sobre una selección que no sabía resolver, así que
 * el usuario pulsaba y NO PASABA NADA — sin diálogo, sin aviso, sin error.
 * Medido en banco. La regla que lo impide está abajo: si una capacidad no está
 * disponible, se dice; nunca se deja activa e inerte.
 *
 * LOS NIVELES SON LOS DEL SERVIDOR, no una regla propia de la interfaz.
 * Trazados endpoint por endpoint sobre `backend/routes/documents.py`:
 *
 *     renombrar · compartir · desplazar · reservar  ->  'edit'
 *     suprimir                                      ->  'admin' de carpeta
 *
 * Antes la interfaz exigía «administrador de obra» para las cuatro primeras, y
 * eso ESCONDÍA capacidades a quien el servidor sí se las concede. La interfaz
 * refleja la autoridad; no la endurece ni la relaja.
 *
 * Aquí no hay React ni DOM a propósito: son decisiones, y las decisiones se
 * prueban ejecutándolas (`pruebas/capacidadesDeSeleccion.prueba.mjs`).
 */

/** La escalera real de `folder_permissions.PERMISSION_LEVELS`. */
export const NIVELES = { none: -1, viewer: 0, view_download: 1, view_markup: 2, edit: 3, admin: 4 };

/** Lo que EXIGE EL SERVIDOR para cada capacidad. */
export const EXIGE = {
    renombrar: 'edit',
    compartir: 'edit',
    desplazar: 'edit',
    reservar:  'edit',
    suprimir:  'admin',
};

/** Capacidades que sólo tienen sentido sobre UN elemento. */
const SOLO_UNO = new Set(['renombrar', 'compartir', 'reservar', 'atributos']);
/** Capacidades que sólo tienen sentido sobre un DOCUMENTO. */
const SOLO_ARCHIVO = new Set(['reservar', 'atributos']);

const nivelDe = (item, isAdmin) => {
    const n = NIVELES[item?.permission_level];
    if (n !== undefined) return n;
    // Sin dato de nivel se cae al rol de obra, que es lo que hacía la interfaz
    // entera antes de esto. No se inventa permiso: se conserva el suelo previo.
    return isAdmin ? NIVELES.admin : NIVELES.viewer;
};

const no = (motivo, mostrar = 'deshabilitada') => ({ disponible: false, motivo, mostrar });
const si = () => ({ disponible: true });

/**
 * @param elementos   los elementos seleccionados (o el elemento pulsado)
 * @param isAdmin     administrador DE ESTA OBRA
 * @param isTrashMode papelera: el repertorio documental no aplica
 * @returns {Object<string, {disponible, motivo?, mostrar?}>}
 */
export function capacidadesDeSeleccion({ elementos = [], isAdmin = false, isTrashMode = false } = {}) {
    const capacidades = ['renombrar', 'compartir', 'desplazar', 'suprimir', 'reservar', 'atributos', 'descargar'];
    const r = {};

    for (const cap of capacidades) {
        // ── En la papelera no se opera sobre documentos: se restaura o se
        //    destruye, y eso vive en su propia barra.
        if (isTrashMode) { r[cap] = no('No disponible en la papelera', 'oculta'); continue; }

        // ── Nada seleccionado: la capacidad existe, pero no tiene sobre qué.
        if (!elementos.length) { r[cap] = no('No hay nada seleccionado'); continue; }

        // ── Un elemento sin acceso no se anuncia: mostrar lo que se puede
        //    hacer con algo que no deberías ver ya es decir demasiado.
        if (elementos.some(e => e?.has_access === false)) { r[cap] = no('Sin acceso', 'oculta'); continue; }

        // ── Sin identidad no hay operación posible: todos los endpoints
        //    trabajan por `id`.
        if (elementos.some(e => !e?.id)) { r[cap] = no('Elemento sin identificador'); continue; }

        // EL TIPO MANDA SOBRE LA CANTIDAD: «esto no aplica a una carpeta» es
        // más fundamental que «no con varios a la vez», y decide si se oculta
        // o sólo se apaga.
        if (SOLO_ARCHIVO.has(cap) && elementos.some(e => e?.type === 'folder')) {
            r[cap] = no('Sólo para documentos', 'oculta'); continue;
        }
        if (SOLO_UNO.has(cap) && elementos.length > 1) {
            r[cap] = no('Sólo se puede con un elemento a la vez'); continue;
        }

        const exigido = EXIGE[cap];
        if (!exigido) { r[cap] = si(); continue; }   // descargar: basta con verlo

        // ── EN SELECCIÓN MIXTA MANDA EL MÁS POBRE. Basta que uno no se pueda
        //    para que la acción no esté disponible: media operación es peor
        //    que ninguna, porque el usuario cree que hizo las dos.
        const falta = elementos.find(e => nivelDe(e, isAdmin) < NIVELES[exigido]);
        if (falta) {
            r[cap] = no(elementos.length > 1
                ? `No tienes permiso de ${exigido === 'admin' ? 'administración' : 'edición'} sobre todo lo seleccionado`
                : `Necesitas permiso de ${exigido === 'admin' ? 'administración' : 'edición'} en esta carpeta`);
            continue;
        }
        r[cap] = si();
    }
    return r;
}

/** Atajo para las superficies: ¿se dibuja algo para esta capacidad? */
export const seDibuja = (c) => !c || c.disponible || c.mostrar !== 'oculta';
