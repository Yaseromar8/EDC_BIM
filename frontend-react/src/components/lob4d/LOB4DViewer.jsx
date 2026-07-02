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
    onStatus,
}) {
    const hostRef = useRef(null);
    const viewerRef = useRef(null);
    const loadKeyRef = useRef('');

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
                const Ctor = Av.Viewer3D || Av.GuiViewer3D;
                const viewer = new Ctor(host, {
                    disabledExtensions: { measure: false, section: false },
                    canvasConfig: {
                        alpha: true,
                        premultipliedAlpha: false,
                        preserveDrawingBuffer: false,
                    },
                });
                viewer.start();
                viewerRef.current = viewer;
                loadKeyRef.current = key;

                onStatus?.(`Cargando ${configs.length} modelo${configs.length === 1 ? '' : 's'} en 4D LOB...`);
                await loadAlignedModels(viewer, configs);
                if (cancelled) return;

                try { viewer.fitToView(); } catch { /* noop */ }
                try {
                    const ext = await viewer.loadExtension('LOB4DExtension');
                    const { alignmentData, selectedAlignmentId, showStations } = getCivilOverlaySeed();
                    if (ext && alignmentData?.length && selectedAlignmentId) {
                        ext.setStationAnnotationsVisible?.(showStations);
                        ext.bakeAlignment(alignmentData, selectedAlignmentId);
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
        window.dispatchEvent(new CustomEvent('lob-time-update', {
            detail: {
                date: simulationState.dateISO,
                tasks: simulationState.activeTasks,
                completedTasks: simulationState.completedTasks,
                plannedTasks: simulationState.plannedTasks,
                progress: simulationState.progress,
            },
        }));
    }, [simulationState]);

    useEffect(() => () => {
        try { window.dispatchEvent(new CustomEvent('lob-clear')); } catch { /* noop */ }
        if (viewerRef.current) {
            try { viewerRef.current.finish(); } catch { /* noop */ }
            viewerRef.current = null;
        }
    }, []);

    return <div ref={hostRef} className="lob4d-viewer-host" />;
}
