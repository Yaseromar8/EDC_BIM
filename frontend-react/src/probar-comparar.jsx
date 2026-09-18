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
 *   window.__extraccion     la extracción temporal: si la versión ya está
 *                           extraída, qué contesta el servidor y qué recibió
 *   window.__transparentesPorUrn  { <urn>: true } la versión trae piezas
 *                           semitransparentes (una de sus piezas)
 *   window.__geometriaCargada     false = la geometría aún no ha terminado;
 *                           `__terminarGeometria()` la termina y avisa
 *   window.__progresivo     a qué visor se le cambió el dibujo progresivo
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
window.__extraccion = { extracted: true, respuesta: { status: 202, cuerpo: { job_id: 'job-banco' } }, recibido: [] };
// Lo que el comparador hace en los visores y pide al servidor, para mirarlo.
window.__visores = [];
window.__pintado = [];
window.__seleccion = [];
window.__aislado = [];
window.__detalles = [];
window.__transparentesPorUrn = {};
window.__geometriaCargada = true;
window.__progresivo = [];
window.__terminarGeometria = () => {
    window.__geometriaCargada = true;
    window.__visores.forEach(v => v.__disparar('geometryLoaded', {}));
};

// URN de ACC de verdad (base64 URL-safe de `…fs.file:vf.<item>?version=<n>`):
// de ahí sale el linaje, y sin linaje no hay modo por documento que probar.
const urnAcc = (item, version) => btoa(`urn:adsk.wipprod:fs.file:vf.${item}?version=${version}`)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const P60 = urnAcc('PRINCIPAL', 60), P64 = urnAcc('PRINCIPAL', 64), E31 = urnAcc('ENCOFRADOS', 31);
window.__urnDelBanco = { P60, P64, E31 };

// Dos modelos, cada uno con dos versiones. Las vistas por versión son la palanca.
// m3 y m4 son el caso de encofrados (18-sep-2026): el derivado conserva los
// identificadores de su padre, y el comparador tiene que pintar cada elemento
// en SU fichero.
const MODELOS = [
    { id: 'm1', name: 'ESTRUCTURAS', appProjectId: 'PQT8', versionNumber: 2, urn: 'urn-m1-v2' },
    { id: 'm2', name: 'SANITARIAS', appProjectId: 'PQT8', versionNumber: 1, urn: 'urn-m2-v1' },
    { id: 'm3', name: 'HD-011264 (principal)', appProjectId: 'PQT8', versionNumber: 64, urn: P64 },
    { id: 'm4', name: 'HD-011264-ENCOFRADOS', appProjectId: 'PQT8', versionNumber: 31, urn: E31 },
];
const VERSIONES = {
    m1: [
        { versionNumber: 2, urn: 'urn-m1-v2', isCurrent: true, createTime: '2026-09-01' },
        { versionNumber: 1, urn: 'urn-m1-v1', createTime: '2026-06-01' },
    ],
    m2: [
        { versionNumber: 1, urn: 'urn-m2-v1', isCurrent: true, createTime: '2026-05-01' },
    ],
    m3: [
        { versionNumber: 64, urn: P64, isCurrent: true, createTime: '2026-09-15' },
        { versionNumber: 60, urn: P60, createTime: '2026-09-01' },
    ],
    m4: [
        { versionNumber: 31, urn: E31, isCurrent: true, createTime: '2026-09-15' },
    ],
};

// Identificador -> dbId de cada fichero. p2 y p3 están en el principal Y en los
// encofrados (con otro dbId): es lo que confundía al mapa de siempre.
window.__idsPorUrn = {
    [P60]: { p1: 101, p2: 102, p3: 103, p6: 106 },
    [P64]: { p1: 101, p2: 102, p3: 103, p5: 105 },
    [E31]: { p2: 302, p3: 303, e1: 311 },
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
    // EXTRACCIÓN TEMPORAL de una versión histórica. Por defecto todo está ya
    // extraído y no se pide nada. La palanca `window.__extraccion` deja simular
    // lo que contesta el servidor y apunta el cuerpo que recibió: así se ve qué
    // frente manda el comparador y qué le dice al usuario cuando el servidor no
    // arranca la extracción (18-sep-2026: un 409 se leía «No se pudo iniciar»).
    if (u.includes('/api/compare/extracted')) return responder({ extracted: window.__extraccion.extracted, count: window.__extraccion.extracted ? 10 : 0 });
    if (u.includes('/api/compare/prepare-version')) return responder({ status: 'ready' });
    if (u.includes('/api/inventory/extract/status/')) return responder({ status: 'success', progress: 100 });
    if (u.includes('/api/inventory/extract')) {
        try { window.__extraccion.recibido.push(JSON.parse(opciones.body)); } catch { /* sin cuerpo */ }
        const r = window.__extraccion.respuesta;
        return Promise.resolve(new Response(JSON.stringify(r.cuerpo), { status: r.status, headers: { 'Content-Type': 'application/json' } }));
    }
    if (u.includes('/api/compare/diff')) {
        // Con varios documentos en un lado, el servidor empareja por documento y
        // dice de cuál es cada fila (así lo devuelve `compare_diff`): A = principal
        // v60, B = principal v64 + encofrados v31.
        let cuerpo = {};
        try { cuerpo = JSON.parse(opciones.body || '{}'); } catch { /* sin cuerpo */ }
        const varios = [cuerpo.a, cuerpo.b].some(s => s && s.type === 'sources' && (s.values || []).length > 1);
        if (varios) return responder({
            summary: { total_a: 4, total_b: 7, added: 3, removed: 1, modified: 1, unchanged: 3 },
            por_documento: true,
            fuentes: { a: [P60], b: [P64, E31] },
            added: [{ id: 'p5', name: 'Muro 5', fb: 0 }, { id: 'e1', name: 'Encofrado 1', fb: 1 }, { id: 'p3', name: 'Muro 3 (copia)', fb: 1 }],
            removed: [{ id: 'p6', name: 'Muro 6', fa: 0 }],
            modified: [{ id: 'p2', name: 'Muro 2', fa: 0, fb: 0 }],
        });
        return responder({
            // `unchanged` lo devuelve siempre el backend (compare.py:337) y el panel
            // lo pinta: omitirlo aqui hacia estallar el BANCO, no el producto.
            summary: { total_a: 10, total_b: 10, added: 2, removed: 1, modified: 3, unchanged: 4 },
            added: [{ id: 'e1', name: 'Muro nuevo' }, { id: 'e2', name: 'Buzon B-12' }],
            removed: [{ id: 'e3', name: 'Tuberia vieja' }],
            modified: [{ id: 'e4', name: 'Canal C-1' }, { id: 'e5', name: 'Camara' }, { id: 'e6', name: 'Losa' }],
        });
    }
    if (u.includes('/api/compare/element')) {
        let cuerpo = {};
        try { cuerpo = JSON.parse(opciones.body || '{}'); } catch { /* sin cuerpo */ }
        window.__detalles.push(cuerpo);
        return responder({ external_id: cuerpo.external_id, a: null, b: null });
    }
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

// El visor de mentira. Sólo lo que el comparador toca: arrancar, cargar un nodo,
// escuchar eventos, pintar, seleccionar y aislar. `loadDocumentNode` es la sonda
// de la vista; `__pintado`, `__seleccion` y `__aislado`, las del resto. Cada
// modelo sabe de qué documento es (como en LMV, en el nodo raíz) y trae su mapa
// de identificadores de `__idsPorUrn`.
function VisorDeBanco() {
    const visor = this;
    visor.__nombre = 'v' + (window.__visores.push(visor) - 1);
    visor.__modelos = [];
    visor.__oyentes = {};
    visor.start = () => {};
    visor.finish = () => {};
    visor.addEventListener = (tipo, fn) => { (visor.__oyentes[tipo] = visor.__oyentes[tipo] || []).push(fn); };
    visor.removeEventListener = (tipo, fn) => { visor.__oyentes[tipo] = (visor.__oyentes[tipo] || []).filter(f => f !== fn); };
    visor.__disparar = (tipo, ev) => [...(visor.__oyentes[tipo] || [])].forEach(fn => fn(ev));
    visor.setProgressiveRendering = (valor) => window.__progresivo.push({ visor: visor.__nombre, valor });
    visor.getAllModels = () => visor.__modelos;
    Object.defineProperty(visor, 'model', { get: () => visor.__modelos[0] });
    visor.navigation = { getPosition: () => ({}), getTarget: () => ({}), getCameraUpVector: () => ({}), setView: () => {}, setCameraUpVector: () => {} };
    visor.setThemingColor = (dbId, _color, model) => window.__pintado.push({ visor: visor.__nombre, urn: model?.__urn, dbId });
    visor.select = (ids, model) => window.__seleccion.push({ visor: visor.__nombre, urn: model?.__urn, ids });
    visor.clearSelection = () => window.__seleccion.push({ visor: visor.__nombre, limpiar: true });
    visor.isolate = () => {};
    visor.impl = { visibilityManager: { aggregateIsolate: (grupos) => window.__aislado.push({ visor: visor.__nombre, grupos: grupos.map(g => ({ urn: g.model?.__urn, ids: g.ids })) }) } };
    visor.loadDocumentNode = (doc, node) => {
        window.__cargas.push({ urn: doc.__urn, guid: node?.data?.guid ?? null, nombre: node?.data?.name ?? null });
        const modelo = {
            __urn: doc.__urn,
            id: window.__cargas.length,
            getData: () => ({ globalOffset: { x: 0, y: 0, z: 0 } }),
            getDocumentNode: () => ({ getRootNode: () => ({ urn: () => doc.__urn }) }),
            getExternalIdMapping: (ok) => ok(window.__idsPorUrn[doc.__urn] || {}),
            // Cinco piezas; si la versión es de las transparentes, la última lo es.
            getFragmentList: () => ({
                getCount: () => 5,
                getMaterial: (f) => ({ transparent: !!window.__transparentesPorUrn[doc.__urn] && f === 4 }),
            }),
            isLoadDone: () => window.__geometriaCargada,
        };
        visor.__modelos.push(modelo);
        return Promise.resolve(modelo);
    };
}
// El comparador pinta con `new THREE.Vector4`; el banco no carga three.
window.THREE = window.THREE || { Vector4: function Vector4(x, y, z, w) { Object.assign(this, { x, y, z, w }); } };

window.Autodesk = {
    Viewing: {
        Viewer3D: VisorDeBanco,
        CAMERA_CHANGE_EVENT: 'camera',
        GEOMETRY_LOADED_EVENT: 'geometryLoaded',
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
