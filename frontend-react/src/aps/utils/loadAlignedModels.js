// loadAlignedModels — carga federada ALINEADA para cualquier visor embebido.
//
// Es la MISMA receta del visor principal (Viewer.jsx loadModelSequentially):
//   - applyScaling:'mm' + applyRefPoint:true  → georreferencia correcta (evita que
//     "uno que otro quede separado" en modelos con punto de referencia).
//   - globalOffset compartido: se captura del PRIMER modelo y se reusa en el resto,
//     así los modelos federados quedan en el mismo origen (sin desfases).
//   - placementTransform: si el nodo trae matriz de emplazamiento, se aplica con
//     setModelTransform (modelos vinculados con transform propio).
//
// Úsalo en TODO visor embebido (4D LOB, Comparar, AR, …) para que coloquen los
// modelos idéntico al visor principal. Una sola fuente de verdad → no más drift.

const isIdentityMatrix4 = (m) => {
    const e = m.elements;
    return e[0] === 1 && e[5] === 1 && e[10] === 1 &&
        e[12] === 0 && e[13] === 0 && e[14] === 0;
};

// Carga un URN y aplica placementTransform si el nodo lo trae. Resuelve al Model.
// viewGuid opcional: carga ESA vista (misma que el visor principal); si no, la default.
export function loadAlignedUrn(viewer, urn, opts = {}, viewGuid = null) {
    const Av = window.Autodesk?.Viewing;
    return new Promise((resolve, reject) => {
        Av.Document.load(`urn:${String(urn).replace(/^urn:/i, '')}`, (doc) => {
            const root = doc.getRoot();
            let node = null;
            if (viewGuid) {
                try { node = root.findByGuid?.(viewGuid) || root.search({ guid: viewGuid })[0] || null; } catch (e) { /* noop */ }
                // loadDocumentNode SOLO acepta nodos type=geometry. Si el GUID apunta a
                // un nodo lógico (2D/resource), escalar al geometry padre — como el visor
                // principal — para que DWG/RVT rendericen la MISMA vista, no la default.
                if (node && node.data && node.data.type !== 'geometry') {
                    let parent = node;
                    while (parent && parent.data && parent.data.type !== 'geometry' && parent.parent) {
                        parent = parent.parent;
                    }
                    node = (parent && parent.data && parent.data.type === 'geometry') ? parent : null;
                }
            }
            const primary = node || root.getDefaultGeometry();

            const applyPlacement = (model) => {
                try {
                    const pt = primary && primary.placementTransform;
                    if (window.THREE && pt && model) {
                        const matrix = new window.THREE.Matrix4().fromArray(pt);
                        if (!isIdentityMatrix4(matrix)) model.setModelTransform(matrix);
                    }
                } catch (e) { /* noop */ }
                resolve(model);
            };

            viewer.loadDocumentNode(doc, primary, opts)
                .then(applyPlacement)
                .catch(() => {
                    // La vista específica falló (nodo no geométrico, error 13…) → geometría por defecto.
                    const fallback = root.getDefaultGeometry();
                    if (fallback && fallback !== primary) {
                        viewer.loadDocumentNode(doc, fallback, opts).then(resolve).catch(reject);
                    } else {
                        reject(new Error('No se pudo cargar la geometría del modelo.'));
                    }
                });
        }, reject);
    });
}

// Carga varios URNs alineados. `sharedOffset` opcional para reusar el offset de
// OTRO visor (p. ej. el lado A del comparador). Devuelve el offset usado.
// items: array de URNs (string) O de configs { urn, viewGuid }. El viewGuid hace
// que se cargue la MISMA vista que el visor principal.
export async function loadAlignedModels(viewer, items = [], { sharedOffset = null } = {}) {
    let offset = sharedOffset || null;
    const list = (items || [])
        .map((it) => (typeof it === 'string' ? { urn: it } : it))
        .filter((it) => it && it.urn);

    for (let i = 0; i < list.length; i += 1) {
        const alreadyLoaded = viewer.getAllModels ? viewer.getAllModels().length > 0 : !!viewer.model;
        const opts = {
            keepCurrentModels: i > 0 || alreadyLoaded,
            applyScaling: 'mm',
            applyRefPoint: true,
            ...(offset ? { globalOffset: offset } : {}),
        };
        const model = await loadAlignedUrn(viewer, list[i].urn, opts, list[i].viewGuid || null);
        if (!offset && model) {
            try {
                offset = (model.getData && model.getData().globalOffset) ||
                    (model.getGlobalOffset && model.getGlobalOffset()) || null;
            } catch (e) { /* noop */ }
        }
    }
    return offset;
}
