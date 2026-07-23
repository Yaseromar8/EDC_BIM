import React, { useEffect, useMemo, useRef } from 'react';
import { loadAlignedModels } from '../../aps/utils/loadAlignedModels';
import { cleanUrn, modelLabelOf } from './lob4dUtils';

const getCivilOverlaySeed = () => {
    const session = window.__civilToolsSession;
    const record = session?.records?.[session?.lastKey];
    const alignmentData = record?.alignmentData?.length ? record.alignmentData : window.__lobCivilAlignments;
    const selectedAlignmentId = record?.selectedAlignmentId || alignmentData?.[0]?.alignmentId;
    return { alignmentData, selectedAlignmentId, showStations: record?.stationLabelsVisible ?? true };
};

export default function LOB4DViewer({
    models = [],
    selectedUrns = [],
    activeViewableGuids = {},
    simulationState,
    excavationUrns = [],
    elementLinks = null,
    paramSimActive = false,
    onStatus,
}) {
    const hostRef = useRef(null);
    const viewerRef = useRef(null);
    const loadKeyRef = useRef('');
    const extensionRef = useRef(null);
    const elementLinksRef = useRef(elementLinks);
    elementLinksRef.current = elementLinks;

    const configs = useMemo(() => {
        return (models || [])
            .filter((model) => model?.urn)
            .map((model) => {
                const urn = cleanUrn(model.urn);
                return {
                    urn,
                    label: modelLabelOf(model),
                    viewGuid: activeViewableGuids[model.urn] || activeViewableGuids[urn] || model.defaultViewGuid || null,
                };
            })
            .filter((config) => selectedUrns.includes(config.urn));
    }, [models, selectedUrns, activeViewableGuids]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return undefined;
        let cancelled = false;
        let timer = null;
        let resizeObserver = null;

        const boot = async () => {
            const Av = window.Autodesk?.Viewing;
            if (!Av) {
                timer = window.setTimeout(boot, 350);
                return;
            }

            const key = configs.map((item) => `${item.urn}:${item.viewGuid || ''}`).join('|');
            if (viewerRef.current && loadKeyRef.current === key) {
                try { viewerRef.current.resize(); } catch { /* noop */ }
                return;
            }

            if (!configs.length) {
                if (viewerRef.current) {
                    try { viewerRef.current.finish(); } catch { /* noop */ }
                    viewerRef.current = null;
                    loadKeyRef.current = '';
                }
                onStatus?.('No hay modelos seleccionados para la simulacion 4D.');
                return;
            }

            try {
                if (viewerRef.current) {
                    try { viewerRef.current.finish(); } catch { /* noop */ }
                    viewerRef.current = null;
                }

                host.innerHTML = '';
                const Ctor = Av.GuiViewer3D || Av.Viewer3D;
                const viewer = new Ctor(host, {
                    disabledExtensions: { measure: false, section: false },
                    canvasConfig: {
                        alpha: true,
                        premultipliedAlpha: false,
                        preserveDrawingBuffer: false,
                    },
                });
                viewer.start();

                // Igual que el visor principal: click simple SELECCIONA (sin esto, el
                // visor headless exige doble-click). Deselecciona al hacer clic al vacío.
                try {
                    if (viewer.setClickConfig) {
                        viewer.setClickConfig('click', 'onObject', ['selectOnly']);
                        viewer.setClickConfig('click', 'offObject', ['deselectAll']);
                    }
                } catch (e) { /* API opcional según versión LMV */ }
                viewerRef.current = viewer;
                loadKeyRef.current = key;

                onStatus?.(`Cargando ${configs.length} modelo${configs.length === 1 ? '' : 's'} en 4D LOB...`);
                await loadAlignedModels(viewer, configs);
                if (cancelled) return;

                try { viewer.fitToView(); } catch { /* noop */ }

                // Reaplicar tras cargar geometría/extensiones: algunas resetean el
                // click config, dejando la selección exigiendo doble-click.
                try {
                    if (viewer.setClickConfig) {
                        viewer.setClickConfig('click', 'onObject', ['selectOnly']);
                        viewer.setClickConfig('click', 'offObject', ['deselectAll']);
                    }
                    viewer.setSelectionMode?.(window.Autodesk.Viewing.SelectionMode.LEAF_OBJECT);
                } catch (e) { /* noop */ }

                // Órbita alrededor del cursor (igual que el visor principal):
                // el punto bajo el mouse se vuelve pivote al presionar.
                try {
                    const canvasEl = viewer.canvas || viewer.impl?.canvas;
                    if (canvasEl) {
                        const onPivotDown = (event) => {
                            if (event.button !== 0 && event.button !== 1) return;
                            const rect = canvasEl.getBoundingClientRect();
                            const hit = viewer.impl.hitTest(event.clientX - rect.left, event.clientY - rect.top, true);
                            if (hit && hit.intersectPoint) {
                                viewer.navigation.setPivotPoint(hit.intersectPoint);
                                viewer.navigation.setPivotSetFlag(true);
                            }
                        };
                        canvasEl.addEventListener('mousedown', onPivotDown, true);
                    }
                } catch (e) { /* noop */ }

                try {
                    const ext = await viewer.loadExtension('LOB4DExtension');
                    extensionRef.current = ext || null;
                    // NOTA: NO usamos setElementLinks (vínculos del backend por ITEM,
                    // que dan actividad arbitraria). El coloreo lo hace buildPropertyIndex
                    // en vivo, priorizando CodigoPlaneamiento (actividad/paño real).
                    const { alignmentData, selectedAlignmentId, showStations } = getCivilOverlaySeed();
                    if (ext && alignmentData?.length && selectedAlignmentId) {
                        ext.setStationAnnotationsVisible?.(showStations);
                        ext.bakeAlignment(alignmentData, selectedAlignmentId);
                    }
                    // Re-aplicar el alcance de frente vigente (el despacho original
                    // pudo ocurrir antes de que este visor existiera).
                    if (window.__lobScope?.codes?.length) {
                        window.dispatchEvent(new CustomEvent('lob-scope-change', { detail: window.__lobScope }));
                    }
                } catch (e) {
                    console.warn('[LOB4DViewer] Extension 4D no disponible:', e);
                }

                resizeObserver = new ResizeObserver(() => {
                    try { viewer.resize(); } catch { /* noop */ }
                });
                resizeObserver.observe(host);

                const names = configs.slice(0, 2).map((item) => item.label).join(' + ');
                onStatus?.(`${configs.length} modelo${configs.length === 1 ? '' : 's'} listo${configs.length === 1 ? '' : 's'}${names ? `: ${names}` : ''}.`);
            } catch (err) {
                console.error('[LOB4DViewer] carga:', err);
                onStatus?.('No se pudo cargar el visor 4D. Revisa el token APS o los URN vinculados.');
            }
        };

        boot();

        return () => {
            cancelled = true;
            if (timer) window.clearTimeout(timer);
            if (resizeObserver) resizeObserver.disconnect();
        };
    }, [configs, onStatus]);


    useEffect(() => {
        if (!simulationState) return;
        if (paramSimActive) return; // el modo prueba por parámetro controla el coloreado
        // Para el COLOREO se fusionan las tareas por partida con las tareas por
        // ACTIVIDAD del P6 (así colorean también los elementos cuya actividad no
        // tiene partida-puente). Los conteos del resumen no se tocan (van aparte).
        const merge = (a, b) => [...(a || []), ...(b || [])];
        window.dispatchEvent(new CustomEvent('lob-time-update', {
            detail: {
                date: simulationState.dateISO,
                tasks: merge(simulationState.activeTasks, simulationState.activityExecuting),
                completedTasks: merge(simulationState.completedTasks, simulationState.activityDone),
                plannedTasks: merge(simulationState.plannedTasks, simulationState.activityPlanned),
                pendingTasks: simulationState.pendingTasks,
                progress: simulationState.progress,
                taskRows: simulationState.taskRows,
                excavationUrns,
            },
        }));
    }, [simulationState, excavationUrns, paramSimActive]);

    useEffect(() => () => {
        try { window.dispatchEvent(new CustomEvent('lob-clear')); } catch { /* noop */ }
        if (viewerRef.current) {
            try { viewerRef.current.finish(); } catch { /* noop */ }
            viewerRef.current = null;
            extensionRef.current = null;
        }
    }, []);

    return <div ref={hostRef} className="lob4d-viewer-host" />;
}
