// UN SOLO NORMALIZADOR SEMANTICO.
//
// Habia dos algoritmos para el mismo payload. El de precarga limpiaba el
// prefijo de grupo con `startsWith` y tenia ademas una regla para
// `PROPERTY SETS`; el de refresco solo quitaba `Grupo - `. Con el mismo dato,
// una ruta producia `Height` y la otra `Group_Height`, y `PROPERTY SETS::Estado`
// existia en el esquema de una y no en el de la otra. El filtro que el usuario
// habia guardado dejaba de encontrar su propiedad segun por donde hubiera
// llegado el inventario.
//
// Aqui las dos rutas llaman a la misma funcion. Se conservan los dos nombres
// exportados porque `App.jsx` distingue precarga de refresco por otras razones
// --cache, esquema, avisos-- y esa distincion no es de normalizacion.
//
// Y las filas salen CUALIFICADAS: cada propiedad se escribe con su clave
// `Grupo::Propiedad` ademas del nombre suelto. Aplanar solo por el nombre hacia
// que dos grupos homonimos --`G1::Estado` y `G2::Estado`-- se pisaran en la
// misma columna y el segundo ganara; el nombre suelto se mantiene para los
// consumidores que todavia lo leen, pero la identidad de la propiedad es la
// clave cualificada.
//
// FILA A FILA (11-nov-2026, docs/rendimiento/04). El normalizador se puede alimentar
// con una fila cada vez (`crearNormalizador`), para que el inventario se convierta
// segun llega de la red y nunca exista la lista cruda entera. Dos ahorros, medidos en
// Chrome, que NO cambian lo que sale:
//   - el nombre limpio y la clave `Grupo::Propiedad` se calculan una vez por propiedad
//     y no una vez por celda (eran 16 millones de veces con 95.000 elementos);
//   - los valores repetidos («Construccion nueva», «NIVEL 03») comparten una sola
//     cadena en vez de una copia por elemento.
import { withInventoryIdentity } from './inventoryIdentity.js';

const SEPARADOR_INICIAL = /^[\s\-_.]+/;
const COLA_TRAS_GUION = /^.*?\s*[-–—]\s*(.+)$/;
// A partir de aqui ya no se recuerdan mas valores distintos: los que quedan son casi todos unicos
// (marcas, longitudes) y recordarlos costaria mas de lo que ahorra.
const MAX_VALORES_RECORDADOS = 400000;

/** El nombre de la propiedad sin el prefijo redundante de su grupo. */
export function nombreDePropiedad(grupo, nombreCrudo) {
    let nombre = nombreCrudo;
    if (nombre.startsWith(grupo)) {
        const limpio = nombre.slice(grupo.length).replace(SEPARADOR_INICIAL, '');
        if (limpio.length > 0) return limpio;
        return nombre;
    }
    // Civil 3D publica los conjuntos de propiedades como `Pset - Nombre`.
    if (grupo.toUpperCase() === 'PROPERTY SETS') {
        const cola = nombre.match(COLA_TRAS_GUION);
        if (cola) return cola[1];
    }
    return nombre;
}

/** El valor de una propiedad como texto, sin perder `0` ni `false`. */
export function valorDePropiedad(bruto) {
    if (Array.isArray(bruto)) {
        return bruto.map(x => String(x ?? '').trim()).filter(Boolean).join(', ');
    }
    return String(bruto).trim();
}

/**
 * Un normalizador que recibe las filas del servidor de una en una.
 * `fila(node)` añade la fila normalizada; `fin()` devuelve `{ mappedData, schemaMap }`,
 * lo mismo que daba normalizar la lista entera.
 */
export function crearNormalizador(normalizeRevitCategory) {
    const schemaMap = {};
    const mappedData = [];
    const porGrupo = new Map();      // grupo -> Map(nombre crudo -> { nombre, clave })
    const valores = new Map();       // valor -> la unica cadena que lo representa

    const propiedadDe = (grupo, nombreCrudo) => {
        let delGrupo = porGrupo.get(grupo);
        if (!delGrupo) { delGrupo = new Map(); porGrupo.set(grupo, delGrupo); }
        let propiedad = delGrupo.get(nombreCrudo);
        if (!propiedad) {
            const nombre = nombreDePropiedad(grupo, nombreCrudo);
            propiedad = { nombre, clave: grupo + '::' + nombre };
            delGrupo.set(nombreCrudo, propiedad);
        }
        return propiedad;
    };
    const unica = valor => {
        const ya = valores.get(valor);
        if (ya !== undefined) return ya;
        if (valores.size < MAX_VALORES_RECORDADOS) valores.set(valor, valor);
        return valor;
    };

    const fila = node => {
        const row = {
            dbId: node.external_id,
            model_urn: node.model_urn,
            source_urn: node.source_urn || node.model_urn,
            Name: node.name,
            Material: node.material || '',
            Status: node.installation_status || '',
            Vaciado_Nro: node.vaciado_nro || '',
        };
        if (node.properties && typeof node.properties === 'object') {
            for (const [grupo, contenido] of Object.entries(node.properties)) {
                if (typeof contenido !== 'object' || contenido === null) continue;
                for (const [nombreCrudo, bruto] of Object.entries(contenido)) {
                    const { nombre, clave } = propiedadDe(grupo, nombreCrudo);
                    const valor = unica(valorDePropiedad(bruto));
                    // La clave cualificada es la identidad de la propiedad: se
                    // escribe siempre, sin que otro grupo pueda pisarla.
                    row[clave] = valor;
                    // El nombre suelto se conserva para los consumidores que aun
                    // lo leen. Aqui si puede haber choque entre grupos, y por eso
                    // no es la identidad: se respeta la regla anterior de no
                    // sustituir un valor con uno vacio.
                    if (valor !== '' || !Object.hasOwn(row, nombre) || row[nombre] === '') {
                        row[nombre] = valor;
                    }
                    if (!schemaMap[clave]) {
                        schemaMap[clave] = {
                            id: clave,
                            name: nombre,
                            category: grupo,
                            group: 'text',
                            path: grupo + ' ▸ ' + nombre,
                        };
                    }
                }
            }
        }
        const categoria = node.properties?.['__category__']?.['__category__']
            || row['__category__']
            || '(Unassigned)';
        row['Revit Category'] = normalizeRevitCategory(categoria);
        mappedData.push(withInventoryIdentity(node, row));
    };

    return { fila, fin: () => resultadoDe(mappedData, schemaMap) };
}

// EL UNICO RETORNO del normalizador. Por aqui sale el inventario llegue la lista entera o fila a fila:
// el banco `filtersCore.interaccionesIntegradas` lo muta para demostrar que sigue siendo uno solo.
function resultadoDe(mappedData, schemaMap) {
    return { mappedData, schemaMap };
}

function normalizarInventario(dbData, normalizeRevitCategory) {
    const normalizador = crearNormalizador(normalizeRevitCategory);
    for (const node of (dbData || [])) normalizador.fila(node);
    return normalizador.fin();
}

export function normalizeInventoryPreload(dbData, normalizeRevitCategory) {
    return normalizarInventario(dbData, normalizeRevitCategory);
}

export function normalizeInventoryRefresh(dbData, normalizeRevitCategory) {
    return normalizarInventario(dbData, normalizeRevitCategory);
}
