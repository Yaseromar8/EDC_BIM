/**
 * Recorrido de una partida en el 3D (Planilla): el centro de cada pieza y, con muchas piezas (el
 * acero), los TRAMOS de terreno por los que se recorre con «◀ ▶».
 *
 * Aquí estuvieron las marcas numeradas sobre las piezas; el propietario las retiró el 24-oct-2026
 * al pasar a aislar la partida, como Filters: «ahora que se aísla ya no beneficia en nada».
 */
export const MAX_PIEZAS_SUELTAS = 40;   // hasta aquí, cada pieza es su propio grupo para recorrer

export function centroDe(model, dbId) {
    const THREE = window.THREE;
    const arbol = model.getInstanceTree?.();
    const fragmentos = model.getFragmentList?.();
    if (!THREE || !arbol || !fragmentos) return null;
    const caja = new THREE.Box3(), f = new THREE.Box3();
    arbol.enumNodeFragments(dbId, fid => { fragmentos.getWorldBounds(fid, f); caja.union(f); }, true);
    return caja.isEmpty() ? null : caja.getCenter(new THREE.Vector3());
}

/**
 * Grupos del mundo para recorrer con «◀ ▶»: cuadrículas de terreno de `lado` (unidades del
 * modelo), en planta (x, y). Un buzón cae en un grupo; un canal largo se recorre por tramos.
 * (Unir «por cercanía en cadena» juntaría todo el acero continuo de un canal en un grupo.)
 * Devuelve listas de índices, ordenadas a lo largo del eje en que más se extiende la partida.
 * Función pura sobre [x,y,z]: probada sin visor.
 */
export function gruposPorTramos(centros, lado) {
    const celdas = new Map();
    centros.forEach((p, i) => {
        if (!p) return;
        const k = `${Math.floor(p[0] / lado)},${Math.floor(p[1] / lado)}`;
        if (!celdas.has(k)) celdas.set(k, []);
        celdas.get(k).push(i);
    });
    const grupos = [...celdas.values()];
    const medio = g => g.reduce((m, i) => [m[0] + centros[i][0] / g.length, m[1] + centros[i][1] / g.length], [0, 0]);
    const medios = grupos.map(medio);
    const rango = e => Math.max(...medios.map(m => m[e])) - Math.min(...medios.map(m => m[e]));
    const eje = rango(0) >= rango(1) ? 0 : 1;
    return grupos.map((g, k) => ({ g, m: medios[k][eje] })).sort((a, b) => a.m - b.m).map(x => x.g);
}

// Posición por `transform` (no recalcula la maquetación de la página): left/top fijos en 0.
