/**
 * «Ir al elemento» desde una tabla (Inventory, su ventana aparte): selecciona ya
 * hecha fuera; aquí solo el viaje de cámara.
 *
 * Mismo viaje que `fitToView` y que Tandem (`setRequestTransitionWithUp`, ~490 ms
 * medidos), pero el encuadre se hace en la parte del visor que se ve, no en el
 * lienzo entero: ver lib/encuadreCamara.js. Además el pivote de órbita queda en
 * el elemento, así que al girar después se gira a su alrededor.
 *
 * Los paneles que tapan el visor lo declaran con `data-tapa-visor`.
 */
import { zonaLibre, vistaDeEncuadre } from './encuadreCamara.js';

// Una pieza más pequeña que esto (un estribo, un perno) se enseña como si
// midiera 1 m: sin contexto alrededor no se sabe dónde está.
const RADIO_MINIMO_M = 0.5;

// DISTANCIA PRUDENTE (propietario, 24-oct-2026: «que no nos lleve directo a la zona,
// sino a una distancia prudente, para luego acercarnos»; y después «que se acerque un poco
// más»). Una pieza ocupa la mitad del lado corto de la zona visible: se ve ella y lo que la
// rodea. Un CONJUNTO repartido por la obra ocupa el 75 %: las marcas numeradas ya dicen
// dónde está cada pieza, así que el margen de contexto sobra.
const OCUPACION_PRUDENTE = 0.5;
export const OCUPACION_CONJUNTO = 0.75;

function cajaDe(model, dbIds) {
    const THREE = window.THREE;
    const arbol = model.getInstanceTree?.();
    const fragmentos = model.getFragmentList?.();
    if (!THREE || !arbol || !fragmentos) return null;
    const caja = new THREE.Box3(), f = new THREE.Box3();
    for (const id of dbIds) {
        arbol.enumNodeFragments(id, fid => { fragmentos.getWorldBounds(fid, f); caja.union(f); }, true);
    }
    return caja.isEmpty() ? null : caja;
}

function tapasDelVisor() {
    return [...document.querySelectorAll('[data-tapa-visor]')]
        .map(el => el.getBoundingClientRect())
        .filter(r => r.width > 0 && r.height > 0);
}

export function irAElementos(viewer, model, dbIds) {
    return irAConjunto(viewer, [{ model, dbIds }]);
}

/**
 * Lo mismo para un CONJUNTO de elementos de uno o varios modelos (una partida de la
 * Planilla reúne piezas de varios RVT): se encuadra la caja que los contiene a todos.
 * `items` = [{ model, dbIds }].
 */
export function irAConjunto(viewer, items, { ocupacion = OCUPACION_PRUDENTE } = {}) {
    const validos = (items || []).filter(x => x?.model && x.dbIds?.length);
    if (!validos.length) return;
    const model = validos[0].model;
    const dbIds = validos[0].dbIds;
    try {
        const THREE = window.THREE;
        let caja = null;
        const esquinas = [];
        for (const x of validos) {
            const c = !x.model?.is2d?.() && cajaDe(x.model, x.dbIds);
            if (!c) continue;
            caja = caja ? caja.union(c.clone()) : c.clone();
            // Las 8 esquinas de cada pieza: el encuadre se ajusta a lo que se VE desde la
            // cámara, no a la esfera que envuelve el conjunto (ver vistaDeEncuadre).
            for (const X of [c.min.x, c.max.x]) for (const Y of [c.min.y, c.max.y]) for (const Z of [c.min.z, c.max.z]) esquinas.push([X, Y, Z]);
        }
        if (!caja) return viewer.fitToView(dbIds, model);

        const nav = viewer.navigation;
        const r = viewer.canvas.getBoundingClientRect();
        const centro = caja.getCenter(new THREE.Vector3());
        const metroEnUnidades = 1 / (model.getUnitScale?.() || 1);
        const vista = vistaDeEncuadre({
            centro: centro.toArray(),
            radio: caja.getSize(new THREE.Vector3()).length() / 2,
            radioMinimo: RADIO_MINIMO_M * metroEnUnidades,
            direccion: nav.getEyeVector().toArray(),
            arriba: nav.getCameraUpVector().toArray(),
            fovVertical: nav.getVerticalFov(),
            lienzo: { ancho: r.width, alto: r.height },
            libre: zonaLibre(r, tapasDelVisor()),
            ocupacion,
            puntos: esquinas,
        });
        nav.setRequestTransitionWithUp(true,
            new THREE.Vector3(...vista.posicion), new THREE.Vector3(...vista.objetivo),
            nav.getVerticalFov(), new THREE.Vector3(...vista.arriba), nav.getWorldUpVector(), centro);
    } catch (e) {
        console.warn('[irAConjunto] encuadre propio no disponible, se usa fitToView:', e);
        viewer.fitToView(dbIds, model);
    }
}
