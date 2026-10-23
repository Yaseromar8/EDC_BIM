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
    try {
        const caja = !model?.is2d?.() && cajaDe(model, dbIds);
        if (!caja) return viewer.fitToView(dbIds, model);

        const THREE = window.THREE;
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
        });
        nav.setRequestTransitionWithUp(true,
            new THREE.Vector3(...vista.posicion), new THREE.Vector3(...vista.objetivo),
            nav.getVerticalFov(), new THREE.Vector3(...vista.arriba), nav.getWorldUpVector(), centro);
    } catch (e) {
        console.warn('[irAElementos] encuadre propio no disponible, se usa fitToView:', e);
        viewer.fitToView(dbIds, model);
    }
}
