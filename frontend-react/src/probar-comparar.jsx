/**
 * BANCO · el selector de VISTA 3D del comparador.
 *
 * Monta el `CompareView` REAL y le pone delante un backend falso y un
 * `Autodesk.Viewing.Document` falso que devuelve listas de vistas a voluntad.
 *
 * ALCANCE, declarado: se prueba el SELECTOR -- enumerar, emparejar, invalidar
 * y que el GUID llegue al cargador. NO se prueba la comparación en sí: el diff
 * lo calcula Postgres y el pintado necesita modelos reales.
 *
 * PALANCAS
 *   window.__vistasPorUrn   { <urn>: [{guid,name}] }  lo que declara cada versión
 *   window.__msManifiesto   cuánto tarda en leerse el manifiesto
 *   window.__cargas         lo que recibió `loadAlignedModels` (urn + viewGuid)
 *
 * No entra en producción: `vite.config.js` no lo conoce.
 */
/* eslint-disable react-refresh/only-export-components -- banco: se construye
   como produccion, sin HMR ni React Refresh (ver vite.banco.config.js). */
import React from 'react';
import { createRoot } from 'react-dom/client';
import CompareView from './components/CompareView';

window.__msManifiesto = 80;
window.__cargas = [];

// Dos modelos, cada uno con dos versiones. Las vistas por versión son la palanca.
const MODELOS = [
    { id: 'm1', name: 'ESTRUCTURAS', appProjectId: 'PQT8', versionNumber: 2, urn: 'urn-m1-v2' },
    { id: 'm2', name: 'SANITARIAS', appProjectId: 'PQT8', versionNumber: 1, urn: 'urn-m2-v1' },
];
const VERSIONES = {
    m1: [
        { versionNumber: 2, urn: 'urn-m1-v2', isCurrent: true, createTime: '2026-09-01' },
        { versionNumber: 1, urn: 'urn-m1-v1', createTime: '2026-06-01' },
    ],
    m2: [
        { versionNumber: 1, urn: 'urn-m2-v1', isCurrent: true, createTime: '2026-05-01' },
    ],
};

// Por defecto: A y B comparten «Coordinación» (emparejable), A tiene una que B
// no tiene, y la v1 de m1 declara DOS vistas con el mismo nombre (ambigüedad).
window.__vistasPorUrn = {
    'urn-m1-v2': [
        { guid: 'g-coord-a', name: 'Coordinación' },
        { guid: 'g-solo-a', name: 'Solo en A' },
        { guid: 'g-est-a', name: 'Estructuras' },
    ],
    'urn-m1-v1': [
        { guid: 'g-dup-1', name: 'Coordinación' },
        { guid: 'g-dup-2', name: 'Coordinación' },
    ],
    'urn-m2-v1': [
        { guid: 'g-coord-b', name: 'Coordinación' },
        { guid: 'g-otra-b', name: 'Otra de B' },
    ],
};

// ── Backend de mentira ────────────────────────────────────────────────────────
const responder = (cuerpo) => Promise.resolve(
    new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'Content-Type': 'application/json' } })
);
const original = window.fetch.bind(window);
window.fetch = (url, opciones = {}) => {
    const u = String(typeof url === 'string' ? url : url.url);
    if (u.includes('/api/config/project')) return responder({ models: MODELOS });
    if (u.includes('/api/compare/versions')) {
        const id = (u.match(/model_id=([^&]*)/) || [])[1];
        return responder({ versions: VERSIONES[id] || [] });
    }
    if (u.includes('/api/compare/cleanup')) return responder({ ok: true });
    if (u.includes('/api/compare/extracted')) return responder({ extracted: true, count: 10 });
    if (u.includes('/api/compare/diff')) return responder({
        // `unchanged` lo devuelve siempre el backend (compare.py:337) y el panel
        // lo pinta: omitirlo aqui hacia estallar el BANCO, no el producto.
        summary: { total_a: 10, total_b: 10, added: 2, removed: 1, modified: 3, unchanged: 4 },
        added: [{ id: 'e1', name: 'Muro nuevo' }, { id: 'e2', name: 'Buzon B-12' }],
        removed: [{ id: 'e3', name: 'Tuberia vieja' }],
        modified: [{ id: 'e4', name: 'Canal C-1' }, { id: 'e5', name: 'Camara' }, { id: 'e6', name: 'Losa' }],
    });
    if (u.includes('/api/compare/metrados')) return responder({ rows: [] });
    if (!u.includes('/api/')) return original(url, opciones);
    return responder({ success: true });
};

// ── Autodesk de mentira: SÓLO el manifiesto ──────────────────────────────────
// Los nodos traen `is3D()` porque es lo que usa la clasificación real, y se
// mezclan viewables 2D para comprobar que NO aparecen en el selector.
const nodosDe = (urn) => {
    const vistas = window.__vistasPorUrn[urn] || [];
    return [
        // `type: 'geometry'` NO es decorativo: `loadAlignedUrn` descarta cualquier
        // nodo que no lo traiga y cae a la vista por defecto. Sin esto el banco
        // probaba su propio descuido en vez del producto.
        ...vistas.map(v => ({ data: { guid: v.guid, name: v.name, role: '3d', type: 'geometry' }, is3D: () => true, is2D: () => false })),
        // Una lámina, que debe quedar fuera del selector.
        { data: { guid: `2d-${urn}`, name: 'LÁMINA A-101', role: '2d', type: 'geometry' }, is3D: () => false, is2D: () => true },
    ];
};

// El visor de mentira. Sólo lo que el comparador toca: arrancar, cargar un nodo
// y escuchar eventos. `loadDocumentNode` es LA sonda: apunta qué vista recibió.
function VisorDeBanco() {
    this.start = () => {};
    this.addEventListener = () => {};
    this.getAllModels = () => [];
    this.navigation = { getPosition: () => ({}), getTarget: () => ({}), getCameraUpVector: () => ({}), setView: () => {}, setCameraUpVector: () => {} };
    this.loadDocumentNode = (doc, node) => {
        window.__cargas.push({ urn: doc.__urn, guid: node?.data?.guid ?? null, nombre: node?.data?.name ?? null });
        return Promise.resolve({ getData: () => ({ globalOffset: { x: 0, y: 0, z: 0 } }) });
    };
}

window.Autodesk = {
    Viewing: {
        Viewer3D: VisorDeBanco,
        CAMERA_CHANGE_EVENT: 'camera',
        OBJECT_UNDER_MOUSE_CHANGED: 'hover',
        SELECTION_CHANGED_EVENT: 'sel',
        Document: {
            load: (urnConPrefijo, ok) => {
                const urn = String(urnConPrefijo).replace(/^urn:/, '');
                const nodos = nodosDe(urn);
                const raiz = {
                    search: (q) => (q && q.guid ? nodos.filter(n => n.data.guid === q.guid) : nodos),
                    findByGuid: (g) => nodos.find(n => n.data.guid === g) || null,
                    // La «por defecto» del banco: la primera 3D, para distinguirla
                    // de una elegida a mano.
                    getDefaultGeometry: () => nodos.find(n => n.is3D()) || nodos[0],
                };
                setTimeout(() => ok({ __urn: urn, getRoot: () => raiz }), window.__msManifiesto);
            },
        },
    },
};

const nodo = document.getElementById('raiz');
if (!nodo.__raiz) nodo.__raiz = createRoot(nodo);
nodo.__raiz.render(<CompareView BACKEND_URL="" projectId="PQT8" onExit={() => {}} />);
