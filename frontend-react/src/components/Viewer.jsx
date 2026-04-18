import { apiFetch } from '../utils/apiFetch';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import './viewer.css';
import './IconMarkup.css'; // Add this line
import { BaseExtension } from '../aps/extensions/BaseExtension';
import { findLeafNodes, getBulkProperties, calculateDynamicFilterBucketsNative, extractPartidasNative, extractSchemaNative, calculateBucketsFromPostgres } from '../aps/utils/model';
import IconMarkupExtension from '../aps/extensions/IconMarkupExtension';
import ProgressiveExtension from '../aps/extensions/ProgressiveExtension';
import WorkfrontsPanel from './WorkfrontsPanel';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

// Utilidad para normalizar base64 vs base64url-safe y comparar URNs sin cruzarse
const normalizeUrn = (urn) => {
    if (!urn) return '';
    return String(urn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// --- Shared texture helpers (extracted to avoid duplication inside useEffects) ---
const getDocTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.beginPath(); ctx.arc(64, 64, 60, 0, 2 * Math.PI);
    ctx.fillStyle = '#F59E0B'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(44, 34, 40, 60);
    ctx.fillStyle = '#E5E7EB'; ctx.fillRect(44, 34, 40, 10);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(50, 50, 28, 4); ctx.fillRect(50, 60, 28, 4); ctx.fillRect(50, 70, 20, 4);
    const tex = new window.THREE.Texture(canvas); tex.needsUpdate = true;
    return tex;
};

const getDaluxTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.beginPath(); ctx.arc(64, 64, 50, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.arc(64, 64, 42, 0, 2 * Math.PI);
    ctx.fillStyle = '#60a5fa'; ctx.fill();
    ctx.beginPath(); ctx.arc(64, 64, 15, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    const tex = new window.THREE.Texture(canvas); tex.needsUpdate = true;
    return tex;
};

const Viewer = ({
    models,
    hiddenModelUrns = [],
    sprites,
    showSprites,
    activeSpriteId,
    onSpriteSelect,
    onSpriteDelete,
    placementMode,
    onPlacementComplete,
    onModelProperties,
    minimapActive,
    vrActive,
    onSheetsLoaded,
    activeSheet,
    docPins = [],
    docPlacementMode = false,
    onDocPlacementComplete,
    onDocPinSelect,
    onViewablesLoaded,
    activeViewableGuids = {},
    // Build Mode Props
    buildMode = false,
    buildPlacementMode = false,
    buildPins = [],
    showBuildPins = true, // Toggle visibility
    onBuildPinCreate,
    onBuildPinSelect,
    selectedPinId, // Add this prop

    accessToken, // Receive token from App
    // SEGUIMIENTO
    trackingTab,

    trackingData = { avance: [], fotos: [] },
    trackingPlacementMode = false,
    onTrackingPinCreate,
    onTrackingPinClick,

    // Gemelo / General Selection (removed - was only used for GemeloPropertiesPanel)
    onSelectionChanged,
    aiModelCommand,
    hideToolbar = false
}) => {
    // --- Refs ---
    const viewerRef = useRef(null);
    const containerRef = useRef(null);
    const loadedModelsRef = useRef({});
    const baseOffsetRef = useRef(null);
    const basePlacementRef = useRef(null);
    const spriteViewRef = useRef(null);
    const spriteStylesRef = useRef(null);
    const spriteMeshesRef = useRef({});
    const buildPinMeshesRef = useRef({});
    const sheetsMapRef = useRef({});
    const hiddenModelUrnsRef = useRef(hiddenModelUrns);
    const lastFilterDetailRef = useRef(null);
    const longPressTimerRef = useRef(null);
    const isLongPressRef = useRef(false);
    const ghostMeshRef = useRef(null);
    const viewerReadyRef = useRef(false);
    const recalcDebounceRef = useRef(null);

    // --- States ---
    const [viewerReady, setViewerReady] = useState(false);
    const [mobileToolsVisible, setMobileToolsVisible] = useState(false);
    const [contextMenu, setContextMenu] = useState(null);
    const [showProgressives, setShowProgressives] = useState(false);
    
    // Workfronts State
    const [isWorkfrontsPanelOpen, setWorkfrontsPanelOpen] = useState(false);
    const [workfronts, setWorkfronts] = useState([
        { id: '1', start: 0, end: 500, color: '#ffaaaa', name: 'Frente 1: Excavación' },
        { id: '2', start: 500, end: 1100, color: '#9c27b0', name: 'Frente 2: Base' },
        { id: '3', start: 1100, end: 2000, color: '#4caf50', name: 'Frente 3: Asfalto' }
    ]);

    // Sync hiddenModelUrnsRef
    useEffect(() => {
        hiddenModelUrnsRef.current = hiddenModelUrns;
    }, [hiddenModelUrns]);

    // Sync viewerReadyRef (para que closures estáticas con deps [] siempre lean el valor actual)
    useEffect(() => {
        viewerReadyRef.current = viewerReady;
    }, [viewerReady]);

    // AI-Driven Model Isolation (Aislamiento Inteligente)
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady || !aiModelCommand) return;

        console.log('[AI] Recibiendo comando:', aiModelCommand);
        const { parameter, value, operator, action } = aiModelCommand;

        // Limpiar selección previa
        viewer.clearSelection();
        viewer.isolate([]);

        const executeAiCommand = async () => {
            // Utilizamos viewer.search que es más robusto a nivel de vista
            // Busca en la base de datos de propiedades de todo lo que está visible
            const doSearch = (attrNames) => {
                viewer.search(
                    value,
                    (dbIds) => {
                        if (dbIds && dbIds.length > 0) {
                            console.log(`[AI] Se encontraron ${dbIds.length} elementos coincidentes.`);
                            // Aislar resultados en el visor
                            viewer.isolate(dbIds);
                            // Hacer un Fit to View a los elementos seleccionados
                            viewer.fitToView(dbIds);
                        } else if (attrNames !== null) {
                            console.warn('[AI] No se encontraron elementos en el parámetro específico. Intentando búsqueda general...');
                            // Fallback: Si no lo encuentra, buscar en todas las propiedades
                            doSearch(null);
                        } else {
                            console.warn('[AI] No se encontraron elementos coincidentes completos.');
                            // Fallback: restablecer
                            viewer.isolate();
                        }
                    },
                    (error) => {
                        console.error('[AI] Error en búsqueda global:', error);
                        viewer.isolate();
                    },
                    attrNames,
                    { searchHidden: true }
                );
            };

            const initialAttrs = (parameter && parameter.trim() !== '') ? [parameter] : null;
            doSearch(initialAttrs);
        };

        executeAiCommand();
    }, [viewerReady, aiModelCommand]);

    // EFECTO: Ocultar/Mostrar barra de herramientas de APS
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        const setVisible = (isVisible) => {
            try {
                // Logic A: Use Viewer API
                if (typeof viewer.setToolbarVisible === 'function') {
                    viewer.setToolbarVisible(isVisible);
                }

                // Logic B: Force CSS Override
                const toolbarContainer = document.querySelector('.adsk-viewing-viewer .adsk-toolbar');
                if (toolbarContainer) {
                    toolbarContainer.style.display = isVisible ? 'flex' : 'none';
                    toolbarContainer.style.visibility = isVisible ? 'visible' : 'hidden';
                }
            } catch (e) {
                console.warn('[Viewer] Error toggling toolbar:', e);
            }
        };

        console.log('[Viewer] hideToolbar status:', hideToolbar);
        setVisible(!hideToolbar);

        // Retry a few times in case the toolbar was not yet created when the effect ran
        if (hideToolbar) {
            setVisible(false);
            // One retry after a short delay is usually enough
            const tm = setTimeout(() => setVisible(false), 2000);
            return () => clearTimeout(tm);
        } else {
            setVisible(true);
        }
    }, [viewerReady, hideToolbar]);

    // --- Ghost Pin Logic (Hover Preview) ---
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        const container = viewer.container;
        const isActive = docPlacementMode || placementMode;

        if (!isActive) {
            if (ghostMeshRef.current) {
                viewer.overlays.removeMesh(ghostMeshRef.current, 'custom-scene');
                ghostMeshRef.current = null;
                viewer.impl.invalidate(true, true, true);
            }
            return;
        }


        // Create Ghost Sprite if needed (uses module-level getDocTexture)
        if (!ghostMeshRef.current) {
            const size = getOptimalPinSize() * 2.5; // Slightly larger for icon

            const tex = getDocTexture();
            const mat = new window.THREE.SpriteMaterial({
                map: tex,
                color: 0xffffff,
                opacity: 0.7,
                transparent: true,
                depthTest: false,
                depthWrite: false
            });

            const sprite = new window.THREE.Sprite(mat);
            sprite.scale.set(size, size, 1);
            sprite.visible = false;

            viewer.overlays.addMesh(sprite, 'custom-scene');
            ghostMeshRef.current = sprite;
        }

        const handleMouseMove = (event) => {
            const hit = viewer.impl.hitTest(event.clientX, event.clientY, true);
            if (hit && ghostMeshRef.current) {
                ghostMeshRef.current.position.copy(hit.intersectPoint);
                // Lift slightly off surface to prevent z-fighting if depthTest was on (optional)
                // ghostMeshRef.current.position.y += 0.1; 
                ghostMeshRef.current.visible = true;
                viewer.impl.invalidate(true, true, true);
            } else if (ghostMeshRef.current) {
                ghostMeshRef.current.visible = false;
                viewer.impl.invalidate(true, true, true);
            }
        };

        container.addEventListener('mousemove', handleMouseMove);

        return () => {
            container.removeEventListener('mousemove', handleMouseMove);
        };
    }, [viewerReady, docPlacementMode, placementMode]);


    // Handle Canvas Click for Pin Creation (Normal & Docs)


    // --- UNIFIED CANVAS CLICK HANDLER (Sprites, Docs, Tracking, Build) ---
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;
        const container = viewer.container;

        const handleUnifiedClick = (event) => {
            const rect = container.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            const hitForDebug = viewer.impl.hitTest(x, y, false);
            if (hitForDebug && hitForDebug.intersectPoint) {
                console.log("[CALIBRACION] Coordenada Visor:", hitForDebug.intersectPoint);
            }

            // Priority 1: Tracking Pins
            if (trackingPlacementMode) {
                const hit = viewer.impl.hitTest(x, y, false);
                if (hit) {
                    const pos = hit.intersectPoint;
                    const getPartidaInfo = (model, dbId) => new Promise((resolve) => {
                        if (!model || !dbId) return resolve({ code: null, name: null });
                        model.getProperties(dbId, (result) => {
                            const codeProp = result.properties?.find(p => p.displayName === '03_05_DSI_CodigoDePartida');
                            const nameProp = result.properties?.find(p => p.displayName === '03_04_DSI_NombreDePartida');
                            resolve({
                                code: codeProp ? codeProp.displayValue : null,
                                name: nameProp ? nameProp.displayValue : null
                            });
                        }, () => resolve({ code: null, name: null }));
                    });

                    getPartidaInfo(hit.model, hit.dbId).then(({ code, name }) => {
                        onTrackingPinCreate?.({
                            id: Date.now().toString(),
                            x: pos.x, y: pos.y, z: pos.z,
                            dbId: hit.dbId || null,
                            codigoPartida: code,
                            partidaNombre: name,
                            val: trackingTab === 'avance' ? '0%' : null
                        });
                    });
                }
                return;
            }

            // Priority 2: Doc Pins
            if (docPlacementMode) {
                const hit = viewer.impl.hitTest(x, y, false);
                if (hit && onDocPlacementComplete) {
                    const { intersectPoint, dbId, model } = hit;
                    if (model && dbId) {
                        model.getProperties(dbId, (props) => {
                            onDocPlacementComplete({
                                x: intersectPoint.x, y: intersectPoint.y, z: intersectPoint.z,
                                dbId, externalId: props.externalId, objectName: props.name
                            });
                        }, () => onDocPlacementComplete({ x: intersectPoint.x, y: intersectPoint.y, z: intersectPoint.z }));
                    } else {
                        onDocPlacementComplete({ x: intersectPoint.x, y: intersectPoint.y, z: intersectPoint.z });
                    }
                }
                return;
            }

            // Priority 3: Build Mode Pins
            if (buildPlacementMode && onBuildPinCreate) {
                const hit = viewer.impl.hitTest(x, y, false);
                if (hit && hit.point) {
                    onBuildPinCreate({
                        x: hit.point.x, y: hit.point.y, z: hit.point.z,
                        objectId: hit.dbId,
                        modelUrn: hit.model?.getData().urn
                    });
                }
                return;
            }

            // Priority 4: Sprites
            if (placementMode) {
                const hit = viewer.impl.hitTest(x, y, false);
                if (hit) {
                    onPlacementComplete({
                        x: hit.intersectPoint.x, y: hit.intersectPoint.y, z: hit.intersectPoint.z,
                        dbId: hit.dbId
                    });
                }
                return;
            }
        };

        const isAnyPlacementActive = trackingPlacementMode || docPlacementMode || placementMode || buildPlacementMode;

        if (isAnyPlacementActive) {
            container.addEventListener('click', handleUnifiedClick, true); // Capture phase
            container.style.cursor = 'crosshair';
            if (viewer.setCursor) viewer.setCursor('crosshair');
        } else {
            container.style.cursor = 'default';
            if (viewer.setCursor) viewer.setCursor('default');
        }

        return () => {
            container.removeEventListener('click', handleUnifiedClick, true);
            container.style.cursor = 'default';
        };
    }, [viewerReady, trackingPlacementMode, docPlacementMode, placementMode, buildPlacementMode, trackingTab, onTrackingPinCreate, onDocPlacementComplete, onPlacementComplete, onBuildPinCreate]);
    // Ref to track if component is mounted - MOVED TO TOP for safety
    const mountedRef = useRef(true);
    const isInitializingRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        let initTimeout;

        const initializeViewer = () => {
            // 1. Prevent overlapping initializations
            if (isInitializingRef.current) return;
            if (!mountedRef.current) return;

            // 2. Strict check: If viewer exists, do NOT re-initialize.
            if (viewerRef.current) {
                // Determine if we need to clean up existing one or just reuse
                // For now, let's assume if it exists, it's valid.
                return;
            }

            if (!window.Autodesk) {
                initTimeout = setTimeout(initializeViewer, 500);
                return;
            }

            isInitializingRef.current = true;

            const options = {
                env: 'AutodeskProduction',
                getAccessToken: (onSuccess) => {
                    if (accessToken) {
                        onSuccess(accessToken, 3600);
                    } else {
                        apiFetch(`${BACKEND_URL}/api/token`)
                            .then(res => res.json())
                            .then(data => onSuccess(data.access_token, data.expires_in))
                            .catch(err => console.error("Token fetch error", err));
                    }
                }
            };

            Autodesk.Viewing.Initializer(options, () => {
                console.log(`[APS LMV] ⏱️ ${performance.now().toFixed(2)}ms - Evento: INITIALIZATION_FINISHED - Entorno WebGL listo.`);
                isInitializingRef.current = false; // Init finished

                // 3. Check if unmounted during async init
                if (!mountedRef.current) {
                    console.warn("[Viewer] Initializer finished but component unmounted. Aborting.");
                    return;
                }

                if (!containerRef.current) return;

                // 4. Double check parallel creation
                if (viewerRef.current) {
                    viewerRef.current.finish();
                    viewerRef.current = null;
                }

                Autodesk.Viewing.theExtensionManager.registerExtension('BaseExtension', BaseExtension);
                Autodesk.Viewing.theExtensionManager.registerExtension('IconMarkupExtension', IconMarkupExtension);
                Autodesk.Viewing.theExtensionManager.registerExtension('ProgressiveExtension', ProgressiveExtension);
                // Custom extensions removed to simplify UI

                const config = {
                    extensions: [
                        'BaseExtension',
                        'Autodesk.BIM360.Extension.PushPin',
                        'Autodesk.PDF',
                        'Autodesk.AEC.LevelsExtension',
                        'Autodesk.AEC.Minimap3DExtension',
                        'ProgressiveExtension'
                    ],
                    disabledExtensions: {
                        measure: false,
                        section: false
                    }
                };

                const viewer = new Autodesk.Viewing.GuiViewer3D(containerRef.current, config);
                viewer.start();

                // INYECCIÓN DE EVENTOS DE CICLO DE VIDA (TRACING)
                // ═══════════════════════════════════════════════════════════
                // GHOST ACC MODE — Solución definitiva (blindada)
                // 
                // Intercepta viewer.setGhosting() para que CUALQUIER código
                // (filtros, extensiones, eventos externos) que active ghosting
                // automáticamente aplique el modo ACC (light + dithered).
                //
                // Propiedades controladas:
                //   _ghostingDark = false     → Light mode (no gray surfaces)
                //   setDitheredGhosting(true) → Patrón puntillado transparente
                //   _edgeColorGhosted.w=0.12  → Bordes al 12% alpha
                // ═══════════════════════════════════════════════════════════
                const enforceACCGhosting = () => {
                    try {
                        if (!viewer?.impl) return;
                        viewer.impl._ghostingDark = false;
                        const renderer = viewer.impl.renderer();
                        if (renderer && typeof renderer.setDitheredGhosting === 'function') {
                            renderer.setDitheredGhosting(true);
                        }
                        viewer.impl._edgeColorGhosted = { x: 0.5, y: 0.5, z: 0.5, w: 0.12 };
                        viewer.impl.invalidate(true, true, true);
                    } catch (e) { /* silencioso */ }
                };

                // Monkey-patch: interceptar setGhosting para auto-reforzar ACC mode
                const _originalSetGhosting = viewer.setGhosting.bind(viewer);
                viewer.setGhosting = (val) => {
                    _originalSetGhosting(val);
                    if (val) enforceACCGhosting();
                };

                // Aplicar en cada carga de geometría (modelos nuevos)
                viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, () => {
                     console.log(`[APS LMV] ⏱️ ${performance.now().toFixed(2)}ms - Evento: GEOMETRY_LOADED_EVENT`);
                     window.dispatchEvent(new CustomEvent('viewer-geometry-loaded'));
                     enforceACCGhosting();
                     console.log('[GHOST ACC] ✅ Modo ACC reforzado en GEOMETRY_LOADED');
                });
                
                // ═══════════════════════════════════════════════════════════
                // GHOST — ghosting nativo del viewer (sin overrides)
                // ═══════════════════════════════════════════════════════════
                const startGhostEnforcement = () => {
                    viewer.setGhosting(true);
                };
                
                const stopGhostEnforcement = () => {
                    const models = viewer.impl.modelQueue().getModels();
                    models.forEach(model => {
                        viewer.clearThemingColors(model);
                    });
                    viewer.impl.invalidate(true, true, true);
                };

                window.__ghostCleanup = stopGhostEnforcement;
                
                viewer.addEventListener(Autodesk.Viewing.ISOLATE_EVENT, () => {
                    const loadedModels = viewer.impl.modelQueue().getModels();
                    let hasIsolation = false;
                    
                    for (const model of loadedModels) {
                        const isolatedIds = viewer.getIsolatedNodes(model);
                        if (isolatedIds && isolatedIds.length > 0) {
                            hasIsolation = true;
                            break;
                        }
                    }
                    
                    if (hasIsolation) {
                        startGhostEnforcement();
                    } else {
                        stopGhostEnforcement();
                    }

                    // --- SYNC: Visor → Inventory ---
                    setTimeout(() => {
                        const allIsolatedExtIds = [];
                        const allModels = viewer.impl.modelQueue().getModels();
                        
                        for (const model of allModels) {
                            const isolatedIds = viewer.getIsolatedNodes(model);
                            if (isolatedIds && isolatedIds.length > 0) {
                                const modelUrn = model.getData()?.urn;
                                const safeUrn = modelUrn ? String(modelUrn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';
                                const urnDict = window.rosettaToExtId?.[modelUrn] || window.rosettaToExtId?.[safeUrn];
                                
                                if (urnDict) {
                                    for (const dbId of isolatedIds) {
                                        const extId = urnDict[dbId];
                                        if (extId) allIsolatedExtIds.push(extId);
                                    }
                                }
                            }
                        }
                        
                        window.dispatchEvent(new CustomEvent('inventory-isolation-sync', {
                            detail: { isolatedExtIds: allIsolatedExtIds }
                        }));
                        console.log(`[SYNC Visor→Inventory] ${allIsolatedExtIds.length} elementos aislados despachados`);
                    }, 100);
                });
                viewer.addEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, (event) => {
                     console.log(`[APS LMV] ⏱️ ${performance.now().toFixed(2)}ms - Evento: OBJECT_TREE_CREATED_EVENT`);
                     
                     // --- FASE 5: PIEDRA ROSETTA (MULTI-MODELO) ---
                     const modelLoaded = event.model;
                     if (!modelLoaded) return;
                     const urn = modelLoaded.getData().urn;

                     modelLoaded.getExternalIdMapping((mapping) => {
                         window.rosettaToDbId = window.rosettaToDbId || {};
                         window.rosettaToDbId[urn] = mapping;
                     
                         window.rosettaToExtId = window.rosettaToExtId || {};
                         window.rosettaToExtId[urn] = {};
                         for (const extId in mapping) {
                             if (mapping.hasOwnProperty(extId)) {
                                 const dbId = mapping[extId];
                                 window.rosettaToExtId[urn][dbId] = extId;
                             }
                         }
                         
                         console.log(`[Piedra Rosetta Multi-Modelo] Mapeo Bidireccional Creado para ${urn}. Total: ${Object.keys(mapping).length}`);
                     }, (err) => {
                         console.error("[Piedra Rosetta] Error obteniendo el ExternalIdMapping:", err);
                     });
                });

                // 5. Final check before state update
                if (!mountedRef.current) {
                    console.warn("[Viewer] Viewer started but component unmounted. Destroying immediately.");
                    viewer.finish();
                    return;
                }

                viewerRef.current = viewer;
                window.NOP_VIEWER = viewer;
                setViewerReady(true);
            });
        };

        if (accessToken) {
            initializeViewer();
        }

        return () => {
            clearTimeout(initTimeout);
            // 6. ROBUST CLEANUP
            if (viewerRef.current) {
                console.log("[Viewer] Cleaning up viewer instance");
                const v = viewerRef.current;
                viewerRef.current = null; // Detach ref immediately
                setViewerReady(false);
                
                // Stop ghost enforcement rAF
                if (window.__ghostCleanup) { window.__ghostCleanup(); }

                try {
                    v.finish();
                } catch (e) {
                    console.warn("Error finishing viewer:", e);
                }
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accessToken]);

    const handleModelLoaded = useCallback(async (event, retryCount = 0) => {
        if (!mountedRef.current) return; // Prevent if unmounted

        const viewer = viewerRef.current;
        if (!viewer) return;

        const model = event.model;
        if (!model) return;

        let urn = model.getData().urn;
        console.log(`[Viewer] Model Loaded Event: ${urn}`);

        // Try to find the exact URN key from our loadedModelsRef that matches this model instance
        const foundUrn = Object.keys(loadedModelsRef.current).find(key => {
            const m = loadedModelsRef.current[key];
            return m === model || m?.id === model.id;
        });

        if (foundUrn) {
            urn = foundUrn;
            console.log(`[Viewer] Matched Model URN: ${urn}`);
        } else if (Object.keys(loadedModelsRef.current).length === 1) {
            // FALLBACK: If only one model is loaded, assume they match.
            urn = Object.keys(loadedModelsRef.current)[0];
            console.log(`[Viewer] Fuzzy Matched Single Model URN: ${urn}`);
        } else {
            console.warn(`[Viewer] Model Loaded but URN not mapped in loadedModelsRef yet. Raw: ${urn}`);

            // RETRY MECHANISM
            if (retryCount <= 5 && mountedRef.current) {
                console.log(`[Viewer] Retrying property sync (Attempt ${retryCount})...`);
                setTimeout(() => {
                    if (mountedRef.current) handleModelLoaded(event, retryCount + 1);
                }, 500);
                return;
            }
            console.error(`[Viewer] Failed to map URN after retries. Using Raw: ${urn}`);
        }

        let props = model.allProps || [];

        // REMOVIDO: Ya no extraeremos propiedades dinámicas de toda la base de datos de manera bruta.
        // Solo indicamos a App.jsx que el modelo ha cargado de manera ligera.
        console.log(`[Viewer] Model Loaded: ${urn}. Native APS Processing applied.`);
        onModelProperties?.({ urn, props: [] });

        // Extraer listado de Partidas (Liviano) en el Background
        extractPartidasNative(model).then(partidas => {
            window.dispatchEvent(new CustomEvent('viewer-partidas-extracted', { detail: { urn, partidas } }));
        }).catch(err => console.error('[Viewer] Error extracting partidas', err));

        // REMOVIDO: extractSchemaNative ya no se utiliza porque la metadata
        // se construye ahora basándose en PostgreSQL (App.jsx), que garantiza
        // incluir *todas* las propiedades DSI (inclusive las instancias únicas)
        // a través de todos los modelos federados sin truncamiento.

        // Ensure model is visible (centered)
        setTimeout(() => {
            if (mountedRef.current && viewer && viewer.model && viewer.impl) {
                try {
                    viewer.fitToView();
                } catch (e) {
                    console.warn("[Viewer] Could not fit to view (viewer might be closing):", e);
                }
            }
        }, 500);
    }, [onModelProperties]);

    // Recalcular Filtros nativamente desde el API de APS (con debounce para evitar double-fire)
    useEffect(() => {
        const handleRecalculateFilters = (event) => {
            // Debounce: cancela ejecución previa si llega otra dentro de 50ms
            if (recalcDebounceRef.current) clearTimeout(recalcDebounceRef.current);
            recalcDebounceRef.current = setTimeout(async () => {
            const detail = event.detail;
            const models = Object.values(loadedModelsRef.current);
            if(models.length === 0) return;
            
            // =========================================================
            // FASE 3: EXTRACCIÓN CDE POSTGRESQL (MILISEGUNDOS)
            // =========================================================
            // Si el inventario global fue descargado existosamente, cruzamos
            // los filtros directamente contra la matriz de la base de datos
            // en O(N) ignorando las miles de llamadas lentas del C++ de Autodesk.

            let finalBuckets = {};
            let mergedValidIdsByUrn = {};

            if (window.postgresInventory) {
                console.log(`[VIEWER EXECUTE] Iniciando filtrado CDE Postgres (${window.postgresInventory.length} elementos)...`);
                
                const { buckets, globalValidDbIds } = calculateBucketsFromPostgres(
                    window.postgresInventory, 
                    detail.filterProperties, 
                    detail.filterSelections,
                    window.rosettaToDbId, // Mapeo Directo: URN -> ExtId -> DbId
                    hiddenModelUrnsRef.current // Modelos ocultos en Sources
                );

                finalBuckets = buckets;
                
                // Agrupar los ids válidos interceptados por modelo
                globalValidDbIds.forEach(item => {
                    if (!mergedValidIdsByUrn[item.modelUrn]) mergedValidIdsByUrn[item.modelUrn] = new Set();
                    mergedValidIdsByUrn[item.modelUrn].add(item.id);
                });
                
                console.log(`[VIEWER EXECUTE] Filtrado CDE finalizado instantáneamente.`);
            } else {
                console.warn("[VIEWER EXECUTE] postgresInventory no está listo, saltando filtrado...");
                return;
            }

            // Enviar respuesta cruzada al App.jsx
            window._lastCalculatedBuckets = finalBuckets;
            // Almacenar valid IDs para Inventory filtrado
            window._lastValidDbIds = mergedValidIdsByUrn;
            window._lastHasActiveFilters = Object.keys(detail.filterSelections || {}).some(k => detail.filterSelections[k].length > 0);
            window.dispatchEvent(new CustomEvent('filters-calculated', { detail: finalBuckets }));

            // --- AUTO-ISOLATION INTERACTION WITH 3D MODEL ---
            const viewer = viewerRef.current;
            const isReady = viewerReadyRef.current;
            console.log(`[VIEWER EXECUTE] ✅ viewerRef.current exists: ${!!viewer}, viewerReadyRef.current: ${isReady}`);
            console.log(`[VIEWER CACHE] mergedValidIdsByUrn keys:`, Object.keys(mergedValidIdsByUrn), `total URNs:`, Object.keys(mergedValidIdsByUrn).length);
            Object.entries(mergedValidIdsByUrn).forEach(([urn, ids]) => console.log(`[VIEWER CACHE]   URN ${urn}: ${ids.size} dbIds válidos`));
            
            if (viewer && isReady) {
                const activeFilters = Object.keys(detail.filterSelections || {}).filter(k => detail.filterSelections[k].length > 0);
                console.log(`[VIEWER EXECUTE] activeFilters count: ${activeFilters.length}`, activeFilters);
                
                // TANDEM GRAY-GHOST: Guardar el filtro global en la memoria para el manejador de Temas
                window._lastHasActiveFilters = activeFilters.length > 0;
                window._lastValidDbIds = mergedValidIdsByUrn;

                if (activeFilters.length === 0) {
                     console.log(`[VIEWER EXECUTE] 🔄 No active filters. Resetting isolation per-model.`);
                     const modelsQueue = viewer.impl.modelQueue().getModels();
                     modelsQueue.forEach(m => viewer.isolate([], m));
                     if (window.__ghostCleanup) window.__ghostCleanup();
                } else {
                    viewer.setGhosting(true);
                     const modelsQueue = viewer.impl.modelQueue().getModels();
                     let totalIsolated = 0;

                     modelsQueue.forEach((m, idx) => {
                         const rawViewerUrn = m.getData()?.urn;
                         const viewerUrn = normalizeUrn(rawViewerUrn);
                         const reactUrn = Object.keys(loadedModelsRef.current).find(k => normalizeUrn(k) === viewerUrn) || rawViewerUrn;
                         
                         // 1. Si el modelo está oculto en Sources → hideModel y saltar
                         if (hiddenModelUrnsRef.current && (hiddenModelUrnsRef.current.includes(reactUrn) || hiddenModelUrnsRef.current.some(u => normalizeUrn(u) === viewerUrn))) {
                             viewer.hideModel(m.id);
                             return;
                         }

                         // 2. Asegurar que este visible si interactuara con el filtro
                         viewer.showModel(m.id);

                         // 3. Aplicar aislamiento por filtro
                         const idsSet = mergedValidIdsByUrn[rawViewerUrn] 
                             || mergedValidIdsByUrn[reactUrn]
                             || Object.entries(mergedValidIdsByUrn).find(([k]) => normalizeUrn(k) === viewerUrn)?.[1];
                         
                         if (idsSet && idsSet.size > 0) {
                             const idsArray = Array.from(idsSet);
                             viewer.impl.visibilityManager.isolate(idsArray, m);
                             console.log(`[VIEWER EXECUTE]   Model ${idx} (${viewerUrn?.slice(-20)}): ${idsArray.length} elements isolated.`);
                             totalIsolated += idsArray.length;
                         } else {
                             viewer.impl.visibilityManager.isolate([-1], m); // Forzar ghost: dbId -1 no existe → todo el modelo queda fantasma
                             console.log(`[VIEWER EXECUTE]   Model ${idx} (${viewerUrn?.slice(-20)}): fully ghosted`);
                         }
                     });

                     console.log(`[VIEWER EXECUTE] \uD83C\uDFAF Per-model isolation complete: ${totalIsolated} total elements visible`);
                     viewer.impl.invalidate(true, true, true);
                }
                
                // TANDEM GRAY-GHOST: Repintar tema automáticamente al cambiar selecciones (respeta memoria fotográfica)
                 if (window._lastThemeEventConfig && window._lastThemeEventConfig.active) {
                      window.dispatchEvent(new CustomEvent('theme-property-bucket', { detail: window._lastThemeEventConfig }));
                 }
                 
                // Restaurar NODOS ocultos manualmente (Right Click -> Hide)
                const hiddenAgg = viewer.getAggregateHiddenNodes();
                if (hiddenAgg && hiddenAgg.length > 0) {
                    hiddenAgg.forEach(agg => {
                        if (agg.selection && agg.selection.length > 0) viewer.hide(agg.selection, agg.model);
                    });
                }
                }
            }, 50); // debounce 50ms
        };

        window.addEventListener('recalculate-filters', handleRecalculateFilters);
        return () => {
            if (recalcDebounceRef.current) clearTimeout(recalcDebounceRef.current);
            window.removeEventListener('recalculate-filters', handleRecalculateFilters);
        };
    }, []);

    // --- LMV Native Event Listeners for Filters (Refactoring) ---
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        const handleIsolate = (e) => {
            const { propId, values } = e.detail;
            console.log(`[PUENTE] ⏱️ ${performance.now().toFixed(2)}ms - Recibido: isolate-property-bucket - propId: ${propId}, values:`, values);
            if (!propId || !values || values.length === 0) {
                console.log(`[PUENTE] ⏱️ ${performance.now().toFixed(2)}ms - Ejecutando: per-model isolate([]) [Reset]`);
                const modelsQueue = viewer.impl.modelQueue().getModels();
                modelsQueue.forEach(m => viewer.isolate([], m));
                return;
            }

            const buckets = window._lastCalculatedBuckets;
            if (buckets && buckets[propId]) {
                // Group by model URN for multi-model aggregate isolation
                const idsByUrn = {};
                values.forEach(val => {
                    const entry = buckets[propId].values.find(v => v.value === val);
                    if (entry && entry.dbIds) {
                        entry.dbIds.forEach(item => {
                            if (!idsByUrn[item.modelUrn]) idsByUrn[item.modelUrn] = new Set();
                            idsByUrn[item.modelUrn].add(item.id);
                        });
                    }
                });
                
                viewer.setGhosting(true);
                const modelsQueue = viewer.impl.modelQueue().getModels();
                modelsQueue.forEach(m => {
                    const rawViewerUrn = m.getData?.()?.urn;
                    const viewerUrn = normalizeUrn(rawViewerUrn);
                    const reactUrn = Object.keys(loadedModelsRef.current).find(k => normalizeUrn(k) === viewerUrn) || rawViewerUrn;
                    
                    if (hiddenModelUrnsRef.current && (hiddenModelUrnsRef.current.includes(reactUrn) || hiddenModelUrnsRef.current.some(u => normalizeUrn(u) === viewerUrn))) {
                        viewer.hideModel(m.id);
                        return;
                    }

                    viewer.showModel(m.id);

                    const idsSet = idsByUrn[rawViewerUrn] || idsByUrn[reactUrn] || Object.entries(idsByUrn).find(([k]) => normalizeUrn(k) === viewerUrn)?.[1];
                    if (idsSet && idsSet.size > 0) {
                        viewer.isolate(Array.from(idsSet), m);
                    } else {
                        // Ghostear toda la geometria de este modelo
                        viewer.impl.visibilityManager.isolate([-1], m);
                    }
                });
                
                viewer.impl.invalidate(true, true, true);
                console.log(`[PUENTE] ⏱️ ${performance.now().toFixed(2)}ms - Per-model isolation applied to ${modelsQueue.length} modelo(s)`);
                
                // Collect all valid IDs for fitToView
                const allIds = [];
                Object.values(idsByUrn).forEach(set => set.forEach(id => allIds.push(id)));
                if (allIds.length > 0) viewer.fitToView(allIds);
            } else {
                // Reset: Show all on every model
                const modelsQueue = viewer.impl.modelQueue().getModels();
                modelsQueue.forEach(m => viewer.isolate([], m));
            }
        };

        const handleTheme = (e) => {
            const { propId, values, active } = e.detail;
            window._lastThemeEventConfig = { propId, values, active }; // MEMORIA FOTOGRAFICA
            console.log(`[PUENTE] ⏱️ ${performance.now().toFixed(2)}ms - Recibido: theme-property-bucket - propId: ${propId}, active: ${active}`);
            
            const PALETTE = [
                '#3AA0FF', '#F97316', '#10B981', '#F43F5E', '#A855F7', '#0EA5E9', '#EAB308',
                '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6', '#84CC16', '#F59E0B'
            ];

            const modelsQueue = viewer.impl.modelQueue().getModels();
            
            if (!active) {
                console.log(`[PUENTE] ⏱️ ${performance.now().toFixed(2)}ms - Ejecutando: viewer.clearThemingColors()`);
                modelsQueue.forEach(m => viewer.clearThemingColors(m));
                return;
            }

            const buckets = window._lastCalculatedBuckets;
            if (buckets && buckets[propId]) {
                const valsToTheme = (!values || values.length === 0) ? buckets[propId].values.map(v => v.value) : values;

                // Paso 1: Motor Gráfico de Aceleración por GPU (FacetsManager Equivalent)
                // Construimos el colorMap (diccionario de shaders) fuera del hilo bloqueante
                
                const colorMapByUrn = {};
                // TANDEM GRAY-GHOST: Si hay aislamientos vivos, solo pintamos los elementos activos (dejando en gris el resto)
                const validIdsFilter = window._lastHasActiveFilters ? window._lastValidDbIds : null;

                valsToTheme.forEach((val) => {
                    const originalIndex = buckets[propId].values.findIndex(v => v.value === val);
                    const entry = buckets[propId].values[originalIndex]; // Equivalente a find o valueIndex
                    if (originalIndex !== -1 && entry) {
                        const hexColor = PALETTE[originalIndex % PALETTE.length];
                        
                        // Parse hex to Vector4 (Shader readable)
                        const rgb = parseInt(hexColor.replace('#', ''), 16);
                        const r = ((rgb >> 16) & 255) / 255;
                        const g = ((rgb >> 8) & 255) / 255;
                        const b = (rgb & 255) / 255;
                        const colorVector = new window.THREE.Vector4(r, g, b, 1);

                        // Mapeo en Diccionario por URN
                        entry.dbIds.forEach(item => {
                            if (validIdsFilter) {
                                const urnSet = validIdsFilter[item.modelUrn];
                                if (!urnSet || !urnSet.has(item.id)) return; // No pintar si está ghosteado o no hay filtro válido para este modelo
                            }
                            if(!colorMapByUrn[item.modelUrn]) colorMapByUrn[item.modelUrn] = [];
                            colorMapByUrn[item.modelUrn].push({ id: item.id, colorVector });
                        });
                    }
                });

                // Inyección Nativa al Pipeline GPU (Non-blocking ASYNC CHUNKING)
                const startGPU = performance.now();
                console.log(`[GPU] 🚀 Compilando ColorMap de FacetsManager para ${Object.keys(colorMapByUrn).length} modelos federados...`);
                
                const processGPUBuffer = async () => {
                    // Iterar por cada modelo
                    for (const m of modelsQueue) {
                        viewer.clearThemingColors(m); // Liberamos memoria de video base
                        const viewerUrn = m.getData?.()?.urn;
                        const reactUrn = Object.keys(loadedModelsRef.current).find(k => loadedModelsRef.current[k] === m) || viewerUrn;
                        const instructions = colorMapByUrn[viewerUrn] || colorMapByUrn[reactUrn] || [];
                        
                        if (instructions.length > 0) {
                            // Procesamiento por Lotes (Chunking: 5,000 elementos) para evitar 'Page Unresponsive'
                            const CHUNK_SIZE = 5000;
                            for (let i = 0; i < instructions.length; i += CHUNK_SIZE) {
                                const chunk = instructions.slice(i, i + CHUNK_SIZE);
                                chunk.forEach(inst => {
                                    viewer.setThemingColor(inst.id, inst.colorVector, m, false);
                                });
                                // Liberar el Hilo Principal del Navegador brevemente
                                await new Promise(resolve => setTimeout(resolve, 0));
                                viewer.impl.invalidate(true, true, true); // Intercambio Parcial (Efecto Progreso Fluido)
                            }
                        }
                    }

                    // Forzar el repintado final de shader
                    viewer.impl.invalidate(true, true, true);
                    console.log(`[GPU] ⚡ Tema visual re-renderizado asíncronamente en ${(performance.now() - startGPU).toFixed(2)}ms`);
                };

                processGPUBuffer();
            }
        };

        const handleReset = () => {
             console.log(`[VIEWER EXECUTE] 🔄 RESET ALL triggered`);
             const modelsQueue = viewer.impl.modelQueue().getModels();
             modelsQueue.forEach(m => viewer.clearThemingColors(m));
             if (viewer.setAggregateIsolation) {
                 viewer.setAggregateIsolation([]);
             } else {
                 viewer.showAll();
                 viewer.isolate();
             }
             viewer.fitToView();
        };

        window.addEventListener('isolate-property-bucket', handleIsolate);
        window.addEventListener('theme-property-bucket', handleTheme);
        window.addEventListener('filters-reset-all', handleReset);

        return () => {
            window.removeEventListener('isolate-property-bucket', handleIsolate);
            window.removeEventListener('theme-property-bucket', handleTheme);
            window.removeEventListener('filters-reset-all', handleReset);
        };
    }, [viewerReady]);

    // Cleanup and Event Listeners
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        viewer.addEventListener('model.loaded', handleModelLoaded);

        // Initial check
        if (viewer?.model?.allProps?.length) {
            handleModelLoaded({ model: viewer.model });
        }

        return () => {
            if (viewer) {
                viewer.removeEventListener('model.loaded', handleModelLoaded);
            }
        };
    }, [viewerReady, handleModelLoaded]);

    // Selection Event
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        const handleSelection = (event) => {
            // Para multi-modelo, extraer selectiones del evento agregado o del evento normal
            const selections = event.selections || (event.dbIdArray ? [{ model: event.model, dbIdArray: event.dbIdArray }] : []);
            
            if (selections.length > 0 && selections[0].dbIdArray.length > 0 && selections[0].model) {
                const dbId = selections[0].dbIdArray[0];
                const model = selections[0].model;
                const reactUrn = Object.keys(loadedModelsRef.current).find(k => loadedModelsRef.current[k] === model) || model.urn || model.getData().urn;
                const urn = reactUrn;

                // Extraemos las propiedades de Revit del elemento
                model.getProperties(dbId, (result) => {
                    const props = result.properties || [];
                    
                    // Recuperación Inmersiva: Buscar propiedad tipo hipervínculo (dataType: 25)
                    const docLinkProp = props.find(p => p.dataType === 25 || (p.displayName && p.displayName.toLowerCase().includes('documento') && p.displayValue && String(p.displayValue).startsWith('http')));
                    
                    if (docLinkProp) {
                        const url = docLinkProp.displayValue || docLinkProp.displayCategory;
                        if (url && typeof url === 'string') {
                            console.log('[Viewer] ¡DocLink Detectado! Despachando recuperación inmersiva:', url);
                            window.dispatchEvent(new CustomEvent('viewer-open-doc-panel', {
                                detail: { url, dbId, urn, propName: docLinkProp.displayName }
                            }));
                        }
                    }

                    if (onSelectionChanged) {
                        onSelectionChanged({ dbId, urn, props, model });
                    }

                    // Bidireccional: Notificar Inventory para highlight de fila correspondiente
                    window.dispatchEvent(new CustomEvent('inventory-highlight-row', {
                        detail: { dbId, urn }
                    }));
                });
            } else {
                if (onSelectionChanged) onSelectionChanged(null);
            }
        };

        viewer.addEventListener(Autodesk.Viewing.AGGREGATE_SELECTION_CHANGED_EVENT, handleSelection);

        return () => {
            viewer.removeEventListener(Autodesk.Viewing.AGGREGATE_SELECTION_CHANGED_EVENT, handleSelection);
        }
    }, [viewerReady, onSelectionChanged]);

    useEffect(() => {
        if (models.length === 0) {
            onModelProperties?.([]); // Clear App state
            // loadedModelsRef.current = {}; // DO NOT CLEAR HERE, Viewer handles unloading.
            // But if we return to Landing Page, Viewer component might Unmount.
            // If Viewer Unmounts, Ref is lost anyway.
            // Issue is App.jsx state persisting.
            sheetsMapRef.current = {};
            onSheetsLoaded?.([]);

            // Force clear events?
            const viewer = viewerRef.current;
            if (viewer) {
                // Unload all?
            }
        }
    }, [models.length, onModelProperties, onSheetsLoaded]);

    // External Custom Event Listener for Component Selection
    useEffect(() => {
        const handleViewerSelect = (e) => {
            const { dbIds, urn } = e.detail;
            const viewer = viewerRef.current;
            if (!viewer || !dbIds || dbIds.length === 0 || !urn) return;

            // Find the correct model in the viewer
            const models = viewer.impl.modelQueue().getModels();
            const normUrn = normalizeUrn(urn);
            const targetModel = models.find(m => {
                 const modelViewerUrn = normalizeUrn(m.getData()?.urn);
                 const modelReactUrn = Object.keys(loadedModelsRef.current).find(k => normalizeUrn(k) === modelViewerUrn) || modelViewerUrn;
                 return normalizeUrn(modelReactUrn) === normUrn || modelViewerUrn === normUrn;
            });

            if (targetModel) {
                viewer.setAggregateSelection([{ model: targetModel, selection: dbIds }]);
                viewer.fitToView(dbIds, targetModel);
            }
        };

        window.addEventListener('viewer-select', handleViewerSelect);
        return () => window.removeEventListener('viewer-select', handleViewerSelect);
    }, [viewerReady]);

    // Handle Active Sheet Change
    // Helper to calculate robust pin size based on Model Extents
    const getOptimalPinSize = () => {
        const viewer = viewerRef.current;
        if (!viewer || !viewer.model) return 20; // Fallback

        try {
            const bbox = viewer.model.getBoundingBox();
            if (!bbox) return 20;

            // Get diagonal length
            const size = bbox.max.clone().sub(bbox.min).length();
            // Target ~1/800th of the model size (Smaller is better)
            const optimal = size / 800;
            return Math.max(optimal, 0.5);
        } catch (e) {
            return 20;
        }
    };

    // Define loadModelSequentially at component scope so it can be used by both effects
    const loadModelSequentially = async (model) => {
        const viewer = viewerRef.current;
        if (!viewer) return;
        if (!model?.urn || loadedModelsRef.current[model.urn]) return;

        return new Promise((resolve, reject) => {
            Autodesk.Viewing.Document.load(
                `urn:${model.urn}`,
                async (doc) => {
                    try {
                        try {
                            await doc.downloadAecModelData();
                        } catch (e) { console.warn('AEC Data fetch failed', e); }

                        // SEARCH FOR ALL GEOMETRIES
                        const allGeometries = doc.getRoot().search({ type: 'geometry' });

                        // Filter for 3D views (explicit 3d role OR unspecified role but not 2d)
                        const viewables = allGeometries.filter(node => {
                            const role = node.data.role;
                            return role === '3d' || (role !== '2d' && role !== 'graphics');
                        });

                        const extractedViews = viewables.map(v => ({ guid: v.guid(), name: v.name() }));
                        console.log('[Viewer] All Found Geometries:', allGeometries.map(v => `${v.name()} (${v.data.role})`));
                        console.log('[Viewer] Filtered 3D Viewables:', extractedViews);

                        if (onViewablesLoaded) {
                            onViewablesLoaded({ urn: model.urn, views: extractedViews });
                        }

                        // Determine which view to load
                        let viewable = null;
                        const targetGuid = activeViewableGuids[model.urn];

                        if (targetGuid) {
                            viewable = doc.getRoot().findByGuid(targetGuid);
                        }

                        if (!viewable) {
                            // 1. Try standard default from metadata (Revit Publish Settings usually sets this)
                            viewable = doc.getRoot().getDefaultGeometry();

                            // 2. If no default is marked, try 'master' (Infraworks) or fallback to first
                            if (!viewable) {
                                viewable = viewables.find(v => v.name() && v.name().toLowerCase() === 'master') || viewables[0];
                            }
                        }

                        if (!viewable) {
                            console.error('[Viewer] No viewable geometry found for model:', model.urn);
                            resolve(null);
                            return;
                        }

                        console.log(`[Viewer] Loading view: ${viewable.name()} (${viewable.guid()})`);

                        // Extract 2D Sheets and Sync
                        const sheets = doc.getRoot().search({ type: 'geometry', role: '2d' });
                        if (sheets && sheets.length > 0) {
                            const sheetData = sheets.map(node => ({
                                id: node.guid(),
                                name: node.name(),
                                node: node,
                                document: doc,
                                modelUrn: model.urn,
                                modelName: model.label || 'Unknown Model'
                            }));
                            sheetsMapRef.current[model.urn] = sheetData;
                        } else {
                            sheetsMapRef.current[model.urn] = [];
                        }

                        if (onSheetsLoaded) {
                            const allSheets = Object.values(sheetsMapRef.current).flat();
                            onSheetsLoaded(allSheets);
                        }

                        const loadOptions = {
                            keepCurrentModels: true,
                            applyScaling: 'mm',
                            applyRefPoint: true,
                            modelNameOverride: model.label || 'model.rvt',
                            memoryLimit: 512      // ⚡ Fuerza a limpiar memoria de geometría lejana
                        };

                        console.log(`[Viewer] Loading model: ${model.label || model.urn}`);

                        if (baseOffsetRef.current) {
                            loadOptions.globalOffset = baseOffsetRef.current;
                        }

                        // Hotfix para Autodesk Viewer: Evitar "Cannot read properties of null (reading 'toLowerCase')" 
                        // cuando el archivo derivado falla (404) y el visor intenta buscar la unidad base o la extensión.
                        try {
                            if (viewable && viewable.data && !viewable.data.unit) {
                                viewable.data.unit = 'm';
                            }
                            if (doc.getRoot() && doc.getRoot().data && !doc.getRoot().data.unit) {
                                doc.getRoot().data.unit = 'm';
                            }
                        } catch (e) { }

                        // Evitar que el panel de Carga se congele infinitamente si falla internamente el Visor de Autodesk
                        const timeoutPromise = new Promise((_, reject) => {
                            setTimeout(() => reject(new Error('Model load timeout triggered to prevent UI freeze')), 120000); // 120s
                        });

                        const loadedModel = await Promise.race([
                            viewer.loadDocumentNode(doc, viewable, loadOptions),
                            timeoutPromise
                        ]);
                        loadedModelsRef.current[model.urn] = loadedModel;

                        if (loadedModel) {
                            const modelData = loadedModel.getData();
                            if (!baseOffsetRef.current && modelData && modelData.globalOffset) {
                                baseOffsetRef.current = modelData.globalOffset;
                                console.log('[Viewer] Established Base Global Offset:', baseOffsetRef.current);
                            }
                        }

                        // Matrix Alignment Check
                        if (window.THREE && viewable.placementTransform) {
                            const matrix = new window.THREE.Matrix4().fromArray(viewable.placementTransform);
                            const elements = matrix.elements;
                            const isIdentity = elements[0] === 1 && elements[5] === 1 && elements[10] === 1 && elements[12] === 0 && elements[13] === 0 && elements[14] === 0;

                            if (!isIdentity) {
                                loadedModel.setModelTransform(matrix);
                            }
                        }


                        if (loadedModel) {
                            // Check visibility immediately to handle race conditions
                            const shouldHide = hiddenModelUrnsRef.current.includes(model.urn);
                            try {
                                if (shouldHide) {
                                    viewer.hideModel(loadedModel.id);
                                } else {
                                    viewer.showModel(loadedModel.id);
                                }
                            } catch (e) {
                                console.error('[Viewer] Error setting initial visibility:', e);
                            }

                            // Force property update with correct URN mapping
                            handleModelLoaded({ model: loadedModel });

                            // Ensure camera frames the new model (Fixes white screen if AEC data skipped)
                            viewer.fitToView(null, loadedModel);
                        }

                        if (Object.keys(loadedModelsRef.current).length >= 1) {
                            // viewer.fitToView(); // Optional
                        }

                        resolve(loadedModel);
                    } catch (err) {
                        console.error('Error loading document node', err);
                        resolve(null);
                    }
                },
                (err) => {
                    console.error('Error loading document', err);
                    resolve(null);
                }
            );
        });
    };

    // Cursor Management for Placement Mode
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewer.canvas) return;

        if (buildPlacementMode) {
            viewer.canvas.style.cursor = 'crosshair';
        } else {
            viewer.canvas.style.cursor = 'default';
        }
    }, [buildPlacementMode, viewerReady]);



    // --- SEGUIMIENTO: Icon Markup Extension Integration ---
    // --- Dynamic Extension Loading for Tracking ---

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        let ext = viewer.getExtension('IconMarkupExtension');

        // Handler wrapper
        const currentClickHandler = (item) => {
            console.log('[Viewer] Pin Clicked:', item);
            if (onTrackingPinClick) onTrackingPinClick(item);
        };

        const updateExtension = async () => {
            console.log(`[Viewer] updateExtension called with trackingTab: ${trackingTab}, docs length: ${trackingData?.docs?.length}`);
            // 1. Load if not present
            if (!ext) {
                try {
                    ext = await viewer.loadExtension('IconMarkupExtension', {
                        onClick: currentClickHandler
                    });
                } catch (e) {
                    console.error('Failed to load IconMarkupExtension', e);
                    return;
                }
            }

            // 2. Update Options (Handler)
            if (ext && ext.options) {
                ext.options.onClick = currentClickHandler;
            }

            // 3. Prepare Data
            const currentProgress = trackingData?.avance || [];
            const currentPhotos = trackingData?.fotos || [];

            let icons = [];
            if (trackingTab === 'avance') {
                icons = currentProgress.map(i => ({ ...i, type: 'text', color: i.color || '#fbbf24' }));
            } else if (trackingTab === 'fotos') {
                icons = currentPhotos.map(i => ({ ...i, type: 'icon', color: '#3b82f6' }));
            } else if (trackingTab === 'docs') {
                const currentDocs = trackingData?.docs || [];
                icons = currentDocs.map(i => ({ ...i, type: 'doc', color: i.color || '#8b5cf6' }));
            } else if (trackingTab === 'restricciones') {
                const currentRestrictions = trackingData?.restricciones || [];
                icons = currentRestrictions.map(i => ({ ...i, type: 'restriction', color: i.color || '#f59e0b' }));
            } else if (trackingTab === 'rfis') {
                const currentRfis = trackingData?.rfis || [];
                icons = currentRfis.map(i => ({ ...i, type: 'rfi', color: i.color || '#ef4444' }));
            } else if (trackingTab === 'maquinaria') {
                const currentMaq = trackingData?.maquinaria || [];
                // We use 'maquinaria' type so IconMarkupExtension can apply specific styles if needed.
                icons = currentMaq.map(i => ({ ...i, type: 'maquinaria', color: i.color || '#a855f7' }));
            }

            // 4. Set Icons
            if (ext && ext.setIcons) {
                console.log(`[Viewer] Setting ${icons.length} icons for tab: ${trackingTab}`);
                ext.setIcons(icons);
            }

            // 5. Force ONE resize if needed (e.g. sidebar opened)
            // But do NOT loop it. Just validatation.
            viewer.impl.invalidate(true, true, true);
        };

        updateExtension();

        return () => {
            // Optional cleanup
        };

    }, [viewerReady, trackingTab, trackingData, onTrackingPinClick]);

    // --- Progressive Markers Logic ---
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        let ext = viewer.getExtension('ProgressiveExtension');
        if (!ext) return; // not loaded yet

        if (showProgressives) {
            // Fetch and Parse CSV
            fetch('/data/progresivas.csv')
                .then(r => r.text())
                .then(text => {
                    const lines = text.split('\n').filter(l => l.trim().length > 0);
                    
                    const rawGroups = {};
                    lines.forEach((line) => {
                        const parts = line.split(',');
                        if (parts.length < 5) return;
                        const tag = parts[4].trim();
                        if (!rawGroups[tag]) rawGroups[tag] = [];
                        rawGroups[tag].push({
                            x: parseFloat(parts[1]),
                            y: parseFloat(parts[2]),
                            z: parseFloat(parts[3])
                        });
                    });

                    const markers = [];

                    // Process each alignment track independently
                    Object.keys(rawGroups).forEach(tag => {
                        const groupPoints = rawGroups[tag];
                        if (groupPoints.length < 2) return;

                        // Santa Rita ('PG') starts from first value (original order)
                        // Politecnico ('POL') starts from last value (reversed order)
                        if (tag === 'POL') {
                            groupPoints.reverse();
                        }

                        // 2. Build polyline with cumulative distances
                        const polyline = [{ dist: 0, ...groupPoints[0] }];
                        for (let i = 1; i < groupPoints.length; i++) {
                            const dx = groupPoints[i].x - groupPoints[i - 1].x;
                            const dy = groupPoints[i].y - groupPoints[i - 1].y;
                            const segLen = Math.sqrt(dx * dx + dy * dy);
                            polyline.push({
                                dist: polyline[i - 1].dist + segLen,
                                ...groupPoints[i]
                            });
                        }

                        const totalLength = polyline[polyline.length - 1].dist;

                        // 3. Interpolate at exact 10m intervals
                        const INTERVAL = 10; // meters
                        let segIdx = 0; // current segment index

                        for (let station = 0; station <= totalLength; station += INTERVAL) {
                            while (segIdx < polyline.length - 2 && polyline[segIdx + 1].dist < station) {
                                segIdx++;
                            }

                            const a = polyline[segIdx];
                            const b = polyline[segIdx + 1];
                            const segLen = b.dist - a.dist;
                            const t = segLen > 0 ? (station - a.dist) / segLen : 0;

                            const x = a.x + (b.x - a.x) * t;
                            const y = a.y + (b.y - a.y) * t;
                            const z = a.z + (b.z - a.z) * t;

                            const len = Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2) + Math.pow(b.z - a.z, 2));
                            const dx = len > 0 ? (b.x - a.x)/len : 0;
                            const dy = len > 0 ? (b.y - a.y)/len : 0;
                            const dz = len > 0 ? (b.z - a.z)/len : 0;

                            const km = Math.floor(station / 1000);
                            const m = Math.round(station % 1000);
                            // Prefix label with Track tag to distinguish overlapping numbers
                            const prefix = Object.keys(rawGroups).length > 1 ? `${tag}-` : '';
                            const label = `${prefix}KM ${km}+${m.toString().padStart(3, '0')}`;

                            markers.push({ x, y, z, label, station, dx, dy, dz });
                        }
                    });
                    
                    // Inject actual Workfronts state
                    ext.setWorkfronts(workfronts);
                    ext.setMarkers(markers);
                    ext.toggleVisibility(true);
                })
                .catch(err => console.error("Error loading progressivas CSV:", err));
        } else {
            ext.toggleVisibility(false);
        }
    }, [showProgressives, viewerReady]);

    // Live update Workfronts without reloading the CSV
    useEffect(() => {
        if (!viewerReady || !showProgressives) return;
        const viewer = viewerRef.current;
        if (!viewer) return;
        const ext = viewer.getExtension('ProgressiveExtension');
        if (ext && ext._markers && ext._markers.length > 0) {
            ext.setWorkfronts(workfronts);
            ext.setMarkers(ext._markers); // Triggers clear and reconstruct
            ext.toggleVisibility(true);
        }
    }, [workfronts, viewerReady, showProgressives]);

    // --- Native Overlay Implementation (Robust & Scaled) ---
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        if (activeSheet) {
            console.log('[Viewer] Active sheet selected. Splitting view...');

            // Only load 2D document if it's NOT a pin (pins stick to 3D)
            if (!activeSheet.isPin) {
                // viewer.loadDocumentNode(activeSheet.document, activeSheet.node);
            }

            // Resize viewer immediately to fit 50% width if parallel
            // setTimeout(() => { viewer.resize(); }, 350); 
        } else {
            // Return to 3D ONLY if we are currently in 2D mode (i.e. coming back from a Sheet)
            // If we are just closing a Pin panel (which overlays 3D), DO NOT RELOAD.
            const is2D = viewer.model && viewer.model.is2d();

            if (models.length > 0 && is2D) {
                console.log('[Viewer] Returning to 3D view from 2D...');

                // Unload current 2D model first
                if (viewer.model) {
                    // viewer.unloadModel(viewer.model);
                }

                const reset3D = async () => {
                    for (const model of models) {
                        // Clear ref to force re-load
                        if (loadedModelsRef.current[model.urn]) {
                            delete loadedModelsRef.current[model.urn];
                        }
                        await loadModelSequentially(model);
                    }
                };
                reset3D();
            }
        }
    }, [activeSheet]); // Only run when activeSheet changes

    // Handle Viewable Switching (Proposals)
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        // Iterate over activeViewableGuids
        // If a model is loaded but has a DIFFERENT view, reload it.
        // We know which models are loaded via loadedModelsRef

        Object.entries(activeViewableGuids).forEach(async ([urn, targetGuid]) => {
            // Find model by URN
            // Note: loadedModelsRef keys are URNs
            const loadedModel = loadedModelsRef.current[urn];

            // How do we know the CURRENT view GUID of the loaded model?
            // We don't easily know it unless we stored it. 
            // Assume if this effect runs, we want to enforce the view.
            // We can check if the model is currently loaded.

            if (loadedModel) {
                // Check if we need to reload. 
                // Since we can't easily check the current GUID, we'll force reload 
                // (Optimize: Store loaded view guid in another ref)

                console.log(`[Viewer] Reloading model ${urn} to switch view to ${targetGuid}`);

                viewer.unloadModel(loadedModel);
                delete loadedModelsRef.current[urn];

                // Find the model config object
                const modelConfig = models.find(m => m.urn === urn);
                if (modelConfig) {
                    await loadModelSequentially(modelConfig);
                }
            }
        });

    }, [activeViewableGuids]);



    // Handle Minimap Toggle
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        const MINIMAP_EXT_ID = 'Autodesk.AEC.Minimap3DExtension';

        if (minimapActive) {
            viewer.loadExtension(MINIMAP_EXT_ID).then(ext => {
                console.log('[Viewer] Minimap extension loaded');
            }).catch(err => {
                console.error('[Viewer] Failed to load Minimap extension:', err);
            });
        } else {
            if (viewer.getExtension(MINIMAP_EXT_ID)) {
                viewer.unloadExtension(MINIMAP_EXT_ID);
                console.log('[Viewer] Minimap extension unloaded');
            }
        }
    }, [minimapActive, viewerReady]);

    // Handle VR Toggle
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        // Try standard VR extension. Note: WebXR support varies by viewer version/browser.
        const VR_EXT_ID = 'Autodesk.Viewing.Extensions.VR';

        if (vrActive) {
            viewer.loadExtension(VR_EXT_ID).then(ext => {
                console.log('[Viewer] VR extension loaded');
            }).catch(err => {
                console.error('[Viewer] Failed to load VR extension:', err);
                alert('La extensión de VR no pudo cargarse en este entorno.');
            });
        } else {
            if (viewer.getExtension(VR_EXT_ID)) {
                viewer.unloadExtension(VR_EXT_ID);
            }
        }
    }, [vrActive, viewerReady]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;
        const navigation = viewer.getNavigation?.();
        if (!navigation) return;
        navigation.setReverseZoomDirection(false);
    }, [viewerReady, models]);

    // (Custom pivot behavior reverted by user request)

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;
        const palette = [
            '#3AA0FF',
            '#F97316',
            '#10B981',
            '#F43F5E',
            '#A855F7',
            '#0EA5E9',
            '#EAB308'
        ].map(color => new window.THREE.Color(color));



        // ... (existing refs)

        // ...

        const handleFiltersApply = event => {
            const detail = event?.detail;
            lastFilterDetailRef.current = detail;

            // RESET EVERYTHING FIRST to ensure clean slate
            Object.values(loadedModelsRef.current).forEach(model => {
                viewer.clearThemingColors(model);
            });
            viewer.clearSelection();

            // If no filters are active, show all (clear isolation) and exit
            // We use 'isFiltering' flag if available, otherwise fallback to checking dbIds length (legacy behavior)
            const isFiltering = detail.isFiltering !== undefined ? detail.isFiltering : (detail.dbIds && detail.dbIds.length > 0);

            if (!isFiltering) {
                viewer.setGhosting(true);
                // viewer.showAll(); 
                viewer.impl.visibilityManager.isolate([]); // Clear isolation

                // Force update to remove colors/ghosting immediately
                viewer.impl.invalidate(true, true, true);
                viewer.impl.sceneUpdated(true);
                return;
            }

            // 1. Enable Ghosting
            viewer.prefs.set('ghosting', true);

            // 2. Isolate matching items PER MODEL
            const idsByModel = new Map();
            // Pre-fill all loaded models with empty arrays to ensure we isolate (hide/ghost) non-matching models
            const loadedUrns = Object.keys(loadedModelsRef.current);
            loadedUrns.forEach(urn => idsByModel.set(urn, []));

            console.log('[Viewer] Applying filters. Details:', detail);
            console.log('[Viewer] Loaded URNs:', loadedUrns);

            detail.dbIds.forEach(item => {
                let targetUrn = item.modelUrn;

                // 1. Exact Match
                if (targetUrn && idsByModel.has(targetUrn)) {
                    idsByModel.get(targetUrn).push(item.id);
                    return;
                }

                // 2. Prefix/Suffix Match (Handle 'urn:' prefix discrepancies)
                if (targetUrn) {
                    const match = loadedUrns.find(u => u.includes(targetUrn) || targetUrn.includes(u));
                    if (match) {
                        idsByModel.get(match).push(item.id);
                        return;
                    }
                }

                // 3. Fallback: Fuzzy Match if only 1 model matches
                if (loadedUrns.length === 1) {
                    const singleUrn = loadedUrns[0];
                    // console.log(`[Viewer] Fuzzy Match for Filter: Mapping ${item.modelUrn} -> ${singleUrn}`);
                    idsByModel.get(singleUrn).push(item.id);
                } else if (item.modelUrn) {
                    console.warn(`[Viewer] Filter item has unmatched URN: ${item.modelUrn}`);
                }
            });

            idsByModel.forEach((ids, urn) => {
                // CRITICAL: Do not touch hidden models. Let them stay hidden.
                if (hiddenModelUrnsRef.current.includes(urn)) return;

                const model = loadedModelsRef.current[urn];
                if (model) {
                    if (ids.length === 0) {
                        // Isolate "nothing" in this model -> Everything becomes Ghosted
                        console.log(`[Viewer] Ghosting all elements for model ${urn} (No matches)`);
                        viewer.impl.visibilityManager.isolate([-1], model);
                    } else {
                        console.log(`[Viewer] Isolating ${ids.length} elements for model ${urn}`);
                        viewer.impl.visibilityManager.isolate(ids, model);
                    }
                }
            });

            // 3. Apply Colors to matching items PER MODEL (GPU Batching ASYNC CHUNKING)
            const applyColorsAsynchronously = async () => {
                for (let index = 0; index < (detail.groups || []).length; index++) {
                    const group = detail.groups[index];
                    let color;
                    if (group.color) {
                        color = new window.THREE.Color(group.color);
                    } else {
                        color = palette[index % palette.length];
                    }

                    const vector = new window.THREE.Vector4(color.r, color.g, color.b, 1);

                    // Agrupar elementos por modelo para evitar sobre-búsquedas
                    const itemsByModel = new Map();

                    group.dbIds.forEach(item => {
                        let targetUrn = item.modelUrn;
                        let model = loadedModelsRef.current[targetUrn];

                        if (!model && targetUrn) {
                            const matchUrn = Object.keys(loadedModelsRef.current).find(u => u.includes(targetUrn) || targetUrn.includes(u));
                            if (matchUrn) model = loadedModelsRef.current[matchUrn];
                        }
                        if (!model && Object.keys(loadedModelsRef.current).length === 1) {
                            model = loadedModelsRef.current[Object.keys(loadedModelsRef.current)[0]];
                        }

                        if (model) {
                            if (!itemsByModel.has(model)) itemsByModel.set(model, []);
                            itemsByModel.get(model).push(item.id);
                        }
                    });

                    // Procesamiento en Lotes por Modelo
                    for (const [model, ids] of itemsByModel.entries()) {
                        const CHUNK_SIZE = 5000;
                        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
                            const chunk = ids.slice(i, i + CHUNK_SIZE);
                            chunk.forEach(id => {
                                viewer.setThemingColor(id, vector, model, false); // GPU Shading Directo
                            });
                            // Respiro al Thread UI
                            await new Promise(resolve => setTimeout(resolve, 0));
                           viewer.setGhosting(true);
                            viewer.impl.invalidate(true, true, true);
                        }
                    }
                }

                // Flush final atómico
                viewer.setGhosting(true);
                viewer.impl.invalidate(true, true, true);
                viewer.impl.sceneUpdated(true);
            };

            applyColorsAsynchronously();

            // Force visual update for colors and ghosting
            // Ensure ghosting is definitely on
            viewer.prefs.set('ghosting', true);

            // 1. Immediate invalidation
            viewer.impl.invalidate(true, true, true);
            viewer.impl.sceneUpdated(true);

            // 2. Delayed invalidation (Next Tick) to catch any post-processing delays
            setTimeout(() => {
                if (viewer.impl) {
                    viewer.setGhosting(true);
                    viewer.impl.invalidate(true, true, true);
                    viewer.impl.sceneUpdated(true);
                }
            }, 50); // Increased to 50ms to be safe
        };




        window.addEventListener('filters-apply', handleFiltersApply);

        // --- CUSTOM ESCAPE KEY BEHAVIOR ---
        // Prevents "Esc" from unhiding elements (APS default is Show All on Esc).
        // We want Esc to ONLY clear selection.
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                // 1. Block APS Viewer default (which shows all hidden items)
                event.stopImmediatePropagation();

                // 2. Clear Selection if exists
                if (viewer.getSelection().length > 0) {
                    viewer.clearSelection();
                }

                // 3. Optional: Cancel tools if needed, but DO NOT Unhide.
            }
        };
        // Use capture phase to intercept before Viewer gets it
        window.addEventListener('keydown', handleKeyDown, true);

        // --- SELECTION ISOLATION LOGIC ---
        const handleSelectionChanged = (event) => {
            const selection = event.dbIdArray;
            // const model = event.model; // Unused now

            if (selection.length === 1) {
                // REMOVED: Auto-isolation causes issues with "Hide" context menu.
                // Single item selected -> Just let it be selected (standard behavior)
                // viewer.setGhosting(true);
                // viewer.impl.visibilityManager.isolate(selection, model);
                // ...
            } else if (selection.length === 0) {
                // Selection Cleared
                // Check if we should restore filters
                const lastFilter = lastFilterDetailRef.current;
                const isFiltering = lastFilter && (lastFilter.isFiltering || (lastFilter.dbIds && lastFilter.dbIds.length > 0));

                if (isFiltering) {
                    console.log('[Viewer] selection cleared, restoring active filters...');
                    handleFiltersApply({ detail: lastFilter });
                } else {
                    // REMOVED: Do NOT force showAll/isolate([]). 
                    // This resets manually hidden items (via 'Hide' context menu).
                    // viewer.impl.visibilityManager.isolate([]);
                    // viewer.setGhosting(true); 
                }
            }
        };

        viewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, handleSelectionChanged);

        return () => {
            window.removeEventListener('filters-apply', handleFiltersApply);
            viewer.removeEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, handleSelectionChanged);
        };
    }, [viewerReady]);

    // Handle Canvas Click for Pin Creation (Normal & Docs)
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        const handleCanvasClick = (event) => {
            // Priority: Sprite Placement Mode
            if (placementMode) {
                let result = viewer.impl.hitTest(event.clientX, event.clientY, true);

                // FALLBACK: If no geometry hit, try to hit the "Ground Plane" (Z=0)
                // This ensures we can place pins even if the user clicks "off" the model on the floor level.
                if (!result) {
                    const rect = viewer.canvas.getBoundingClientRect();
                    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
                    const camera = viewer.impl.camera;
                    const raycaster = new window.THREE.Raycaster();
                    raycaster.setFromCamera(new window.THREE.Vector2(x, y), camera);

                    // Assume Z=0 ground plane for fallback
                    const plane = new window.THREE.Plane(new window.THREE.Vector3(0, 0, 1), 0);
                    const target = new window.THREE.Vector3();
                    const hit = raycaster.ray.intersectPlane(plane, target);

                    if (hit) {
                        console.log('[Viewer] HitTest failed. Using Fallback hit on ground plane:', target);
                        // Mock a result object
                        result = { intersectPoint: target, dbId: 0 };
                    }
                }

                if (result) {
                    onPlacementComplete({
                        x: result.intersectPoint.x,
                        y: result.intersectPoint.y,
                        z: result.intersectPoint.z,
                        dbId: result.dbId || 0
                    });
                } else {
                    console.warn('[Viewer] Could not determine placement point. Please click on the model or the ground.');
                }
                return;
            }

            // Priority: Doc Placement Mode
            if (docPlacementMode) {
                const result = viewer.impl.hitTest(event.clientX, event.clientY, true);
                if (result && onDocPlacementComplete) {
                    console.log('[Viewer] Creating Doc Pin at:', result.intersectPoint);
                    onDocPlacementComplete({
                        x: result.intersectPoint.x,
                        y: result.intersectPoint.y,
                        z: result.intersectPoint.z
                    });
                }
                return;
            }
        };

        const container = viewer.container;
        if (placementMode || docPlacementMode) {
            container.addEventListener('click', handleCanvasClick);
            container.style.cursor = 'crosshair';
        } else {
            container.style.cursor = 'default';
        }

        return () => {
            container.removeEventListener('click', handleCanvasClick);
            container.style.cursor = 'default';
        };
    }, [viewerReady, placementMode, docPlacementMode, onPlacementComplete, onDocPlacementComplete]);

    // --- Native Overlay Implementation (Robust & Scaled) ---
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        // Custom Scene Setup
        if (!viewer.overlays.hasScene('custom-scene')) {
            viewer.overlays.addScene('custom-scene');
        }

        // Calculate dynamic size
        const pinSize = getOptimalPinSize();
        // console.log('[Viewer] Optimal Pin Size calculated:', pinSize);

        // Geometries/Materials
        if (!spriteStylesRef.current) spriteStylesRef.current = {};

        // 1. Doc Pin: Document Icon Sprite (uses module-level getDocTexture)
        if (!spriteStylesRef.current.docMat) {
            const tex = getDocTexture();
            spriteStylesRef.current.docMat = new window.THREE.SpriteMaterial({
                map: tex,
                color: 0xffffff,
                depthTest: false, // Always on top
                depthWrite: false
            });
        }

        // 2. Alert Pin: Sphere (Red)
        if (!spriteStylesRef.current.redMat) {
            spriteStylesRef.current.alertGeom = new window.THREE.SphereGeometry(1, 16, 16);
            spriteStylesRef.current.redMat = new window.THREE.MeshBasicMaterial({
                color: 0xff0000,
                depthTest: false,
                depthWrite: false
            });
        }

        // 3. Build Pin: Sprite (Dalux Style, uses module-level getDaluxTexture)
        if (!spriteStylesRef.current.blueMat) {
            const tex = getDaluxTexture();
            spriteStylesRef.current.blueMat = new window.THREE.SpriteMaterial({
                map: tex,
                color: 0xffffff,
                depthTest: false,
                depthWrite: false
            });
        }

        const docMat = spriteStylesRef.current.docMat;
        const redMat = spriteStylesRef.current.redMat;
        const blueMat = spriteStylesRef.current.blueMat; // Now a SpriteMaterial
        const alertGeom = spriteStylesRef.current.alertGeom || new window.THREE.SphereGeometry(1, 16, 16);

        const currentMeshes = spriteMeshesRef.current;
        const allItems = [
            ...(sprites || []).map(s => ({ ...s, type: 'alert' })),
            ...(docPins || []).map(d => ({ ...d, type: 'doc' })),
            ...(buildPins || []).map(b => ({ ...b, type: 'build', id: 'build-' + b.id }))
        ];

        const activeIds = new Set(allItems.map(i => i.id));

        // Sync: Remove Old or Hidden
        Object.keys(currentMeshes).forEach(id => {
            // Check if active AND if it should be visible
            const item = allItems.find(i => i.id === id);
            const isBuild = id.startsWith('build-');

            if (!activeIds.has(id) || (isBuild && !showBuildPins)) {
                viewer.overlays.removeMesh(currentMeshes[id], 'custom-scene');
                delete currentMeshes[id];
            }
        });

        // Sync: Add/Update
        allItems.forEach(item => {
            const isBuild = item.type === 'build';
            if (isBuild && !showBuildPins) return; // Skip hidden build pins

            if (!currentMeshes[item.id]) {
                const isDoc = item.type === 'doc';
                let mesh;

                if (isDoc) {
                    // Sprite for Docs
                    mesh = new window.THREE.Sprite(docMat);
                    // Scale Sprite
                    const s = pinSize * 2.5;
                    mesh.scale.set(s, s, 1);
                } else if (isBuild) {
                    // Sprite for Build (Dalux Style)
                    mesh = new window.THREE.Sprite(blueMat);
                    // Scale Sprite: Huge scale for Infraworks (often KM based)
                    // Try a very large base scale, or make it relative to model bounds if possible.
                    // For now, let's try 50x general pin size.
                    const s = pinSize * 50;
                    mesh.scale.set(s, s, 1);
                } else {
                    // Sphere for Alerts (Red)
                    mesh = new window.THREE.Mesh(alertGeom, redMat);
                    mesh.scale.set(pinSize, pinSize, pinSize);
                }



                mesh.position.set(item.x, item.y, item.z);
                mesh.name = item.id;

                viewer.overlays.addMesh(mesh, 'custom-scene');
                currentMeshes[item.id] = mesh;
            }
        });

        viewer.impl.invalidate(true, true, true);

    }, [sprites, docPins, viewerReady]); // Re-run if pins change

    // Standard Overlay Fallback for Alerts (Keep Red Dot logic separate or migrate later)
    useEffect(() => {
        // ... (Keeping the clean overlay logic for simple alerts if needed, or removing if conflicting)
        // For SAFETY, let's Remove the manually added Doc Sprites from previous attempts
        const viewer = viewerRef.current;
        if (viewer && viewer.overlays.hasScene('custom-scene')) {
            // This clears the entire custom-scene, which now only contains alert sprites.
            // If docPins were previously added to custom-scene, this would clear them.
            // With DataViz, docPins are managed separately.
            // So, this cleanup is now primarily for alert sprites if they were removed.
            // For now, we'll keep it as a general cleanup for the custom-scene.
            // viewer.overlays.clearScene('custom-scene'); // Start clean - This would clear alerts too.
            // Better to manage alert sprites lifecycle within their own effect.
        }
    }, [docPins, viewerReady]); // This effect's dependencies might need adjustment based on its actual purpose.
    // If it's just for initial cleanup, it might run once.
    // If it's meant to clear doc-pins from custom-scene, it's no longer needed with DataViz.


    // Handle Clicks on Sprites (All types: Alert, Doc, Build)
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        // --- BUILD PIN CREATION (Manual Mode) ---
        // We use the manual hit test logic (separate useEffect) to capture exact Model URN.
        // This effect ensures the official extension's creation mode is DISABLED so it doesn't conflict.
        if (buildPlacementMode) {
            const extension = viewer.getExtension('Autodesk.BIM360.Extension.PushPin');
            if (extension) {
                extension.endCreateItem();
            }
        }
    }, [buildPlacementMode, viewerReady]);


    // --- STANDARD INTERACTION (Sprites, Docs, etc) ---
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        const handleCanvasInteraction = (event) => {
            // Only process on CLICK
            if (event.type !== 'click') return;
            if (placementMode || docPlacementMode) return;

            // Get canvas bounds
            const rect = viewer.canvas.getBoundingClientRect();
            const canvasX = event.clientX - rect.left;
            const canvasY = event.clientY - rect.top;

            // Raycast for sprites
            const camera = viewer.impl.camera;
            const pointer = new window.THREE.Vector3(
                (canvasX / rect.width) * 2 - 1,
                -(canvasY / rect.height) * 2 + 1,
                0.5
            );
            pointer.unproject(camera);

            const raycaster = new window.THREE.Raycaster(camera.position, pointer.sub(camera.position).normalize());

            const meshes = Object.values(spriteMeshesRef.current);
            const intersects = raycaster.intersectObjects(meshes);

            if (intersects.length > 0) {
                const hitSprite = intersects[0].object;
                const id = hitSprite.name;

                if (id.startsWith('doc-')) {
                    if (onDocPinSelect) onDocPinSelect(id);
                } else if (id.startsWith('build-')) {
                    const realId = id.replace('build-', '');
                    if (onBuildPinSelect) onBuildPinSelect(realId);
                } else {
                    if (onSpriteSelect) onSpriteSelect(id);
                }
                event.stopImmediatePropagation();
                event.preventDefault();
                return;
            }
        };

        const container = viewer.container;
        if (container) {
            container.addEventListener('click', handleCanvasInteraction, true);
        }
        return () => {
            if (container) {
                container.removeEventListener('click', handleCanvasInteraction, true);
            }
        };
    }, [viewerReady, placementMode, docPlacementMode, buildPlacementMode, buildMode, onSpriteSelect, onDocPinSelect, onBuildPinSelect, onBuildPinCreate]);

    // Handle Clicks on Doc Pins
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        // This is handled in the unified 'handleCanvasClick' effect above (if it was added correctly).
        // Let's verify standard capture handlers.
    }, [viewerReady]);

    // Handle View State Capture and Restore
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        const handleRequestState = () => {
            const state = viewer.getState({ viewport: true, renderOptions: true, objectSet: true }); // Captura aislamientos (ocultos, seleccionados)
            window.dispatchEvent(new CustomEvent('viewer-state-captured', { detail: state }));
        };

        const handleRestoreState = (e) => {
            const state = e.detail;
            if (state) {
                viewer.restoreState(state);
            }
        };

        window.addEventListener('viewer-request-state', handleRequestState);
        window.addEventListener('viewer-restore-state', handleRestoreState);

        return () => {
            window.removeEventListener('viewer-request-state', handleRequestState);
            window.removeEventListener('viewer-restore-state', handleRestoreState);
        };
    }, [viewerReady]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;
        const loaded = loadedModelsRef.current;
        const targetUrns = models.map(model => model.urn);

        if (!models.length) {
            baseOffsetRef.current = null;
            basePlacementRef.current = null;
        }

        Object.entries(loaded).forEach(([urn, model]) => {
            if (!targetUrns.includes(urn)) {
                console.log('[Viewer] Unloading model:', urn);
                // Use unloadModel if it's not the primary one, or unloadDocumentNode
                viewer.unloadModel(model);
                // Also check if it's the current 'model' property of viewer to force clear?
                if (viewer.model === model) {
                    // viewer.impl.unloadCurrentModel(); // Sometimes needed for full cleanup
                }

                delete loadedModelsRef.current[urn];

                // Remove sheets for this model
                if (sheetsMapRef.current[urn]) {
                    delete sheetsMapRef.current[urn];
                    const allSheets = Object.values(sheetsMapRef.current).flat();
                    onSheetsLoaded?.(allSheets);
                }
            }
        });

        // Helper to load a single model document
        // Returns a Promise that resolves when the model is fully added to the viewer
        // Helper to load a single model document
        // (Function now defined at component scope to be shared)


        // Load models sequentially to ensure race conditions don't mess up the globalOffset
        const loadAll = async () => {
            for (const model of models) {
                await loadModelSequentially(model);
            }
        };

        loadAll();
    }, [models, viewerReady]);

    // Handle Model Visibility
    // Handle Model Visibility
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        console.log('[Viewer] Updating visibility. Hidden URNs:', hiddenModelUrns);
        const allLoaded = Object.keys(loadedModelsRef.current);
        console.log('[Viewer] Loaded Models URNs:', allLoaded);

        Object.entries(loadedModelsRef.current).forEach(([urn, model]) => {
            if (!model) return;
            const shouldHide = hiddenModelUrns.includes(urn);

            console.log(`[Viewer] Processing visibility for ${urn} (ID: ${model.id}): Hide? ${shouldHide}`);

            try {
                if (shouldHide) {
                    viewer.hideModel(model.id);
                } else {
                    viewer.showModel(model.id);
                }
            } catch (e) {
                console.error(`[Viewer] Error toggling visibility for ${urn}:`, e);
            }
        });
        // Force a full scene update to ensure changes take effect immediately
        // viewer.impl.invalidate(true, true, true);
    }, [hiddenModelUrns, viewerReady]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;
        const overlayName = 'docs-sprites';
        const overlayManager = viewer.impl?.overlayManager;
        if (!overlayManager) return;
        if (!overlayManager.hasScene(overlayName)) {
            viewer.impl.createOverlayScene(overlayName);
        }
        Object.values(spriteMeshesRef.current).forEach(mesh => {
            viewer.impl.removeOverlay(overlayName, mesh);
        });
        spriteMeshesRef.current = {};
        if (!showSprites || !sprites.length) {
            viewer.impl.invalidate(true, true, true);
            return;
        }
        sprites.forEach(sprite => {
            const position = sprite.position || { x: 0, y: 0, z: 0 };
            const colorHex = sprite.id === activeSpriteId ? 0x3aa0ff : 0xff5a5a;

            // Create a much larger, more visible sprite
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');

            // Draw a glowing circle
            const centerX = 64;
            const centerY = 64;
            const radius = 50;

            // Outer glow
            const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
            gradient.addColorStop(0, sprite.id === activeSpriteId ? 'rgba(58, 160, 255, 1)' : 'rgba(255, 90, 90, 1)');
            gradient.addColorStop(0.5, sprite.id === activeSpriteId ? 'rgba(58, 160, 255, 0.8)' : 'rgba(255, 90, 90, 0.8)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 128, 128);

            // Inner bright circle
            ctx.beginPath();
            ctx.arc(centerX, centerY, 30, 0, Math.PI * 2);
            ctx.fillStyle = sprite.id === activeSpriteId ? '#60a5fa' : '#ff7a7a';
            ctx.fill();

            // White center dot
            ctx.beginPath();
            ctx.arc(centerX, centerY, 15, 0, Math.PI * 2);
            ctx.fillStyle = 'white';
            ctx.fill();

            const texture = new window.THREE.CanvasTexture(canvas);
            const material = new window.THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                depthTest: false,  // Always visible, even behind objects
                depthWrite: false
            });
            const spriteMesh = new window.THREE.Sprite(material);
            spriteMesh.position.set(position.x, position.y, position.z);
            spriteMesh.scale.set(20, 20, 20);  // Much larger
            spriteMesh.userData.sprite = sprite;
            spriteMesh.renderOrder = 999;  // Render on top
            viewer.impl.addOverlay(overlayName, spriteMesh);
            spriteMeshesRef.current[sprite.id] = spriteMesh;
        });
        viewer.impl.invalidate(true, true, true);
    }, [sprites, showSprites, activeSpriteId, viewerReady]);

    // RENDER BUILD PINS (DataViz Extension Logic)
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        const extensionName = 'Autodesk.BIM360.Extension.PushPin';

        // Load extension and render items
        viewer.loadExtension(extensionName).then((extension) => {
            // console.log('[Viewer] PushPin Extension Loaded. Rendering Pins:', buildPins.length);

            // 1. Clear existing
            extension.removeAllItems();

            if (!showBuildPins) return;

            // 2. Prepare Data
            const globalOffset = viewer.model?.getData()?.globalOffset || { x: 0, y: 0, z: 0 };

            const pushPinItems = buildPins
                .filter(pin => {
                    // Safety check for coords
                    if (pin.x === undefined) return false;

                    // Filter based on Model Visibility
                    if (pin.modelUrn) {
                        return !hiddenModelUrns.includes(pin.modelUrn);
                    }
                    return true; // If no modelUrn (legacy), show it? or hide it? Let's show it by default to be safe.
                })
                .map((pin, index) => {
                    // Check if pin is World Coordinate (Large value heuristic)
                    // If > 10,000, assumes it's world coordinate and subtracts globalOffset
                    const isWorldCoord = Math.abs(pin.x) > 10000;

                    let finalX = isWorldCoord ? pin.x - globalOffset.x : pin.x;
                    let finalY = isWorldCoord ? pin.y - globalOffset.y : pin.y;
                    let finalZ = isWorldCoord ? pin.z - globalOffset.z : pin.z;

                    return {
                        id: pin.id || index.toString(),
                        label: pin.name || `Pin ${index + 1}`,
                        // Map our custom types to 'status' which controls color in standard extension
                        // STATUS controls color. 
                        // Mappings based on BIM360 defaults: open(orange), answered(blue), closed(grey), void(black)
                        // However, user reports might imply different theme. Testing robust mapping:
                        // STATUS MAPPING for Visual Differentiation:
                        // We map our types to standard BIM360 statuses to leverage existing icon logic.
                        // RESTRICCION -> 'open' (Orange default) -> Will override to RED in CSS
                        // DOCS        -> 'answered' (Blue default) -> Will keep BLUE
                        // AVANCE      -> 'closed' (Grey default) -> Will override to GREEN in CSS
                        status: pin.status || (() => {
                            const t = (pin.type || '').toLowerCase();
                            if (t === 'restriccion') return 'open';
                            if (t === 'docs') return 'answered';
                            if (t === 'avance') return 'closed';
                            return 'open'; // Default
                        })(),
                        position: { x: finalX, y: finalY, z: finalZ },
                        type: 'issues', // Ensure visibility
                        objectId: pin.objectId || 0,
                        seedUrn: (() => {
                            // Robust URN Resolution
                            // 1. Try keying off specific model if pin has it
                            if (pin.modelUrn) return pin.modelUrn;

                            // 2. Fallback: Use the URN of the first loaded model
                            // The PushPin extension *requires* a valid URN corresponding to a loaded model
                            // to project 3D coordinates efficiently.
                            const allModels = viewer.getAllModels();
                            if (allModels.length > 0) {
                                return allModels[0].getData().urn;
                            }
                            return null;
                        })(),
                        viewerState: null // PREVENT AUTO-RESTORE: Ensure clicking a pin doesn't reset visibility/isolation
                    };
                }).filter(item => {
                    if (!item.seedUrn) {
                        console.warn('[Viewer] Skipping pin due to missing/invalid URN:', item.label);
                        return false;
                    }
                    return true;
                });

            // 3. Load
            if (pushPinItems.length > 0) {
                // console.log('[Viewer] Loading PushPins with URNs:', pushPinItems.map(p => p.seedUrn));
                extension.removeAllItems();

                // Use V2 if available (recommended by Autodesk for 3D models to fix URN issues)
                if (extension.loadItemsV2) {
                    extension.loadItemsV2(pushPinItems);
                } else {
                    extension.loadItems(pushPinItems);
                }

                // NUCLEAR FIX: Override internal methods to prevent visibility reset
                // The PushPin extension saves/restores state automatically. We disable this behavior.
                if (extension.pushPinManager) {
                    // 1. Disable restoring state (fixes "hidden elements reappear")
                    extension.pushPinManager.restoreViewerState = function () {
                        console.log('[Viewer] Prevented PushPin state restore.');
                    };

                    // 2. Disable saving state on new pins (optional, but cleaner)
                    // extension.pushPinManager.saveViewerState = function() { return null; };
                }
            }

            // 4. Handle Selection
            // 4. Handle Selection
            const handlePinSelect = (event) => {
                // Prevent extension from restoring state if possible (though often internal)
                if (event.preventDefault) event.preventDefault();

                console.log('[Viewer] PushPin Event Fired:', event.type, event);

                // Get selected items
                const selectedItems = event.data;
                if (selectedItems && selectedItems.length > 0) {
                    const pinId = selectedItems[0].id; // This is the ID we assigned (string)
                    console.log('[Viewer] Pin Selected ID:', pinId);

                    if (onBuildPinSelect) {
                        onBuildPinSelect(pinId);
                    }

                    // HACK: Restore invalidation to prevent "flash" of restored state if the extension forces it
                    // Or, simpler: Immediately deselect in the extension to stop it from holding "active" state?
                    // extension.pushPinManager.deselectAll(); // This might close the label too?
                }
            };

            // Attempt to resolve known constants or use known strings
            // The casing 'pushPin.selected' is critical if the constant is missing.
            const eventsToListen = [
                'pushPin.selected',
                'bim360.pushPin.selected',
                Autodesk?.BIM360?.Extension?.PushPin?.EVENT_ITEM_SELECT
            ];

            // Filter unique and defined
            const uniqueEvents = [...new Set(eventsToListen.filter(Boolean))];

            console.log('[Viewer] Listening for PushPin events on Viewer:', uniqueEvents);

            // 1. Listen on Viewer (Global)
            uniqueEvents.forEach(evt => {
                viewer.removeEventListener(evt, handlePinSelect);
                viewer.addEventListener(evt, handlePinSelect);
            });

            // 2. Listen on PushPinManager (Specific - often required for newer versions)
            if (extension.pushPinManager) {
                console.log('[Viewer] Also listening on PushPinManager');
                uniqueEvents.forEach(evt => {
                    // Manager might use different method signatures or only support specific events
                    // But typically it mimics EventDispatcher
                    if (extension.pushPinManager.addEventListener) {
                        extension.pushPinManager.removeEventListener(evt, handlePinSelect);
                        extension.pushPinManager.addEventListener(evt, handlePinSelect);
                    }
                });
            }

        }).catch(err => {
            console.error('[Viewer] Failed to load PushPin extension:', err);
        });

    }, [buildPins, showBuildPins, viewerReady, onBuildPinSelect, hiddenModelUrns]);

    // MANUAL HIT TEST (Bypass Extension Logic)
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady || !showBuildPins) return;


        const container = viewer.container;
        const canvas = viewer.canvas;
        if (!container || !canvas) return;

        let hoveredPin = null;
        let downPin = null;

        // Helper: Project Logic
        const getHitPin = (clientX, clientY) => {
            const rect = canvas.getBoundingClientRect();
            const x = clientX - rect.left;
            const y = clientY - rect.top;

            let closest = null;
            let minDistance = 35;

            buildPins.forEach(pin => {
                if (pin.x === undefined || pin.y === undefined || pin.z === undefined) return;
                const screenPos = viewer.worldToClient(new window.THREE.Vector3(pin.x, pin.y, pin.z));
                const dx = screenPos.x - x;
                const dy = screenPos.y - y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < minDistance) {
                    minDistance = dist;
                    closest = pin;
                }
            });
            return closest;
        };

        // 1. Hover Effect
        const handleMouseMove = (e) => {
            const pin = getHitPin(e.clientX, e.clientY);
            if (pin) {
                if (!hoveredPin) canvas.style.cursor = 'pointer';
                hoveredPin = pin;
            } else if (hoveredPin) {
                canvas.style.cursor = 'default';
                hoveredPin = null;
            }
        };

        // 2. Block Down
        const handlePointerDown = (e) => {
            const pin = getHitPin(e.clientX, e.clientY);
            if (pin) {
                downPin = pin;
                e.preventDefault();
                e.stopImmediatePropagation();
            } else {
                downPin = null;
            }
        };

        // 3. Trigger Click on Up
        const handlePointerUp = (e) => {
            if (downPin) {
                const pin = getHitPin(e.clientX, e.clientY);
                if (pin && pin.id === downPin.id) {
                    console.log('[Viewer] Manual Interaction Success:', pin.id);
                    if (onBuildPinSelect) onBuildPinSelect(pin.id);
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    viewer.clearSelection();
                }
                downPin = null;
            }
        };

        // 4. Cleanup Click
        const handleClick = (e) => {
            const pin = getHitPin(e.clientX, e.clientY);
            if (pin) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        };

        container.addEventListener('mousemove', handleMouseMove, { capture: true });
        container.addEventListener('pointerdown', handlePointerDown, { capture: true });
        container.addEventListener('pointerup', handlePointerUp, { capture: true });
        container.addEventListener('click', handleClick, { capture: true });

        return () => {
            container.removeEventListener('mousemove', handleMouseMove, { capture: true });
            container.removeEventListener('pointerdown', handlePointerDown, { capture: true });
            container.removeEventListener('pointerup', handlePointerUp, { capture: true });
            container.removeEventListener('click', handleClick, { capture: true });
            if (canvas) canvas.style.cursor = '';
        };
    }, [viewerReady, buildPins, showBuildPins, onBuildPinSelect]);

    // ZOOM TO SELECTED PIN
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady || !selectedPinId) return;

        const pin = buildPins.find(p => p.id === selectedPinId);
        // Ensure we have valid numeric coordinates
        if (!pin || pin.x === undefined) return;

        console.log('[Viewer] Zooming to pin:', pin.name, pin);

        // COORDINATE SYSTEM HANDLING (Adaptive)
        const globalOffset = viewer.model?.getData()?.globalOffset || { x: 0, y: 0, z: 0 };
        // Same heuristic as rendering: Large coords = World
        const isWorldCoord = Math.abs(pin.x) > 1000000 || Math.abs(pin.y) > 1000000;

        let targetX, targetY, targetZ;

        if (isWorldCoord) {
            targetX = pin.x - globalOffset.x;
            targetY = pin.y - globalOffset.y;
            targetZ = pin.z - globalOffset.z;
        } else {
            targetX = pin.x;
            targetY = pin.y;
            targetZ = pin.z;
        }

        const target = new window.THREE.Vector3(targetX, targetY, targetZ);

        // Dynamic Distance based on model scale
        // Default to a reasonable standoff if calculation fails
        const pinSize = getOptimalPinSize();
        const standoffDist = pinSize * 15; // Stand back to see context

        // 1. Set Pivot
        if (viewer.navigation.setPivotPoint) {
            viewer.navigation.setPivotPoint(target);
        }

        // 2. Move Camera - DISABLED to prevent zooming out/moving away
        // User requested that the view stays put when selecting.
        /*
        const camera = viewer.impl.camera;
        const currentPos = camera.position.clone();
        let direction = currentPos.clone().sub(target).normalize();
        if (direction.lengthSq() < 0.0001) direction = new window.THREE.Vector3(0, 0, 1);
        const newPos = target.clone().add(direction.multiplyScalar(standoffDist));
        viewer.navigation.setPosition(newPos);
        */

        // Just look at target? Or do nothing?
        // Doing nothing maintains current view which is what "MANTENGA AHI" likely implies.
        // We only needed to target it for pivot rotation.

        // viewer.navigation.setTarget(target); // This might shift view slightly if target is not center. 
        // Let's rely on setPivotPoint for rotation center, but not change camera position/target abruptly.

        // Force update
        viewer.impl.invalidate(true, true, true);

    }, [selectedPinId, viewerReady, buildPins]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        // Manual Hit Test for Build Pins (Fallback for extension events/HTML labels)
        const handleCanvasClick = (event) => {
            // If we are in ANY placement mode, do not select pins
            if (placementMode || docPlacementMode || trackingPlacementMode || buildPlacementMode) return;

            // 1. Check if we clicked on an HTML Label directly (if accessible)
            // Sometimes labels consume events. If we catch it in capture phase, we can check target.
            // But manual distance check is more reliable for 3D/2D mix.

            const rect = viewer.container.getBoundingClientRect();
            const clickX = event.clientX - rect.left;
            const clickY = event.clientY - rect.top;

            const globalOffset = viewer.model?.getData()?.globalOffset || { x: 0, y: 0, z: 0 };
            let closestPin = null;
            let minDistance = 999; // Start large to allow box-based hits to register

            buildPins.forEach(pin => {
                if (!showBuildPins) return;

                // Consistency with Rendering Logic
                const isWorldCoord = Math.abs(pin.x) > 10000;
                const point = new window.THREE.Vector3(pin.x, pin.y, pin.z);

                if (isWorldCoord) {
                    point.sub(globalOffset);
                }

                // Project to screen
                const screenPoint = viewer.worldToClient(point);

                if (screenPoint) {
                    // Manual Hit Logic:
                    // PushPins often render visually "above" the anchor point (stem + head).
                    // Or they might be centered.
                    // To cover all cases (and user's report of "clicking outside works but on it doesn't"),
                    // we'll define a generous "Hit Box" relative to the anchor.

                    // Coordinates: Y increases downwards.
                    // screenPoint is the anchor (3D point projected).
                    // We allow clicks:
                    // - Horizontal: +/- 40px (Wide enough for label or loose clicking)
                    // - Vertical: 10px below anchor (tolerance) to 80px above anchor (head of pin)

                    const dx = Math.abs(screenPoint.x - clickX);
                    const dy = screenPoint.y - clickY; // Positive if click is ABOVE anchor

                    // Check Horizontal
                    const isHorizontallyClose = dx < 40;

                    // Check Vertical (Allow from -10px (below) to +80px (above))
                    const isVerticallyClose = dy > -10 && dy < 80;

                    if (isHorizontallyClose && isVerticallyClose) {
                        // Use a "score" to find the closest one if multiple overlap
                        // Score = simple euclidean distance for sorting, but validation was box-based
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist < minDistance) {
                            minDistance = dist;
                            closestPin = pin;
                        }
                    }
                }
            });

            if (closestPin) {
                console.log('[Viewer] Manual Hit Detected on Pin:', closestPin.name, closestPin.id);
                // Stop other handlers if we found a pin?
                // event.stopPropagation(); // Maybe? risky if it blocks other viewer interactions.
                onBuildPinSelect?.(closestPin.id);
            }
        };

        // Use Capture Phase to ensure we get the event even if the PushPin label stops propagation
        viewer.container.addEventListener('click', handleCanvasClick, true);

        return () => {
            if (viewer && viewer.container) {
                viewer.container.removeEventListener('click', handleCanvasClick, true);
            }
        };
    }, [buildPins, showBuildPins, viewerReady, placementMode, onBuildPinSelect]);



    // Context menu for sprite creation (right-click / long-press)
    // AND existing sprite interaction
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady || placementMode) return;

        const canvas = viewer.canvas || viewer.impl?.canvas || viewer.container;
        if (!canvas) return;

        // Helper to find if we clicked on an existing sprite
        const getSpriteAtScreenPoint = (clientX, clientY) => {
            if (!showSprites || !sprites.length) return null;

            const rect = canvas.getBoundingClientRect();
            const canvasX = clientX - rect.left;
            const canvasY = clientY - rect.top;

            // Check each sprite
            // We need to project sprite 3D position to 2D screen space
            for (const sprite of sprites) {
                if (!sprite.position) continue;

                const vec = new window.THREE.Vector3(sprite.position.x, sprite.position.y, sprite.position.z);
                const screenPoint = viewer.worldToClient(vec);

                // Check if point is within canvas bounds (visible)
                // and close enough to click
                if (screenPoint.z > 0 && screenPoint.z < 1) { // Inside frustum
                    const dx = screenPoint.x - canvasX;
                    const dy = screenPoint.y - canvasY;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 30) { // 30px radius hit area
                        return sprite;
                    }
                }
            }
            return null;
        };

        const openMenu = (clientX, clientY, hitResult, sprite) => {
            if (sprite) {
                setContextMenu({
                    visible: true,
                    x: clientX,
                    y: clientY,
                    type: 'existing',
                    sprite: sprite
                });
            } else if (hitResult && hitResult.point) {
                setContextMenu({
                    visible: true,
                    x: clientX,
                    y: clientY,
                    type: 'create',
                    position: { x: hitResult.point.x, y: hitResult.point.y, z: hitResult.point.z },
                    dbId: hitResult.dbId
                });
            }
        };

        // Right-click handler (desktop)
        const handleContextMenu = (event) => {
            event.preventDefault();
            event.stopPropagation();

            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            // 1. Check for existing sprite
            const sprite = getSpriteAtScreenPoint(event.clientX, event.clientY);

            // 2. Check for model geometry
            const hit = viewer.impl.hitTest(x, y, true);

            if (sprite || (hit && hit.point)) {
                openMenu(event.clientX, event.clientY, hit, sprite);
            }
        };

        // Long-press handlers (mobile/tablet)
        const handleMouseDown = (event) => {
            if (event.button === 2) return; // Ignore right-click
            if (event.touches && event.touches.length > 1) return; // Ignore multi-touch

            isLongPressRef.current = false;

            longPressTimerRef.current = setTimeout(() => {
                isLongPressRef.current = true;

                const clientX = event.touches ? event.touches[0].clientX : event.clientX;
                const clientY = event.touches ? event.touches[0].clientY : event.clientY;

                const sprite = getSpriteAtScreenPoint(clientX, clientY);

                const rect = canvas.getBoundingClientRect();
                const x = clientX - rect.left;
                const y = clientY - rect.top;
                const hit = viewer.impl.hitTest(x, y, true);

                if (sprite || (hit && hit.point)) {
                    openMenu(clientX, clientY, hit, sprite);
                }
            }, 800);
        };

        const handleMouseUp = () => {
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        };

        const handleMouseMove = () => {
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        };

        const handleClickOutside = () => setContextMenu(null);

        // canvas.addEventListener('contextmenu', handleContextMenu, true);
        // canvas.addEventListener('mousedown', handleMouseDown);
        // canvas.addEventListener('touchstart', handleMouseDown);
        // canvas.addEventListener('mouseup', handleMouseUp);
        // canvas.addEventListener('touchend', handleMouseUp);
        // canvas.addEventListener('mousemove', handleMouseMove);
        // canvas.addEventListener('touchmove', handleMouseMove);
        window.addEventListener('click', handleClickOutside);

        return () => {
            // canvas.removeEventListener('contextmenu', handleContextMenu, true);
            // canvas.removeEventListener('mousedown', handleMouseDown);
            // canvas.removeEventListener('touchstart', handleMouseDown);
            // canvas.removeEventListener('mouseup', handleMouseUp);
            // canvas.removeEventListener('touchend', handleMouseUp);
            // canvas.removeEventListener('mousemove', handleMouseMove);
            // canvas.removeEventListener('touchmove', handleMouseMove);
            window.removeEventListener('click', handleClickOutside);
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        };
    }, [viewerReady, placementMode, sprites, showSprites]);


    const handleCreateSpriteFromMenu = () => {
        if (contextMenu && contextMenu.position && onPlacementComplete) {
            onPlacementComplete({
                position: contextMenu.position,
                dbId: contextMenu.dbId
            });
        }
        setContextMenu(null);
    };

    const handleTakeScreenshot = () => {
        const viewer = viewerRef.current;
        if (!viewer) return;

        // Increase resolution (2x scaling for high quality)
        const scaleFactor = 2; 
        const renderWidth = viewer.container.clientWidth * scaleFactor;
        const renderHeight = viewer.container.clientHeight * scaleFactor;

        // 1. Get raw WebGL screenshot from APS in High Definition
        viewer.getScreenShot(renderWidth, renderHeight, (blobUrl) => {
            const img = new Image();
            img.src = blobUrl;
            img.crossOrigin = "Anonymous";
            img.onload = async () => {
                
                const originalCanvasDisplay = viewer.canvas.style.display;
                viewer.canvas.style.display = 'none';

                img.style.position = 'absolute';
                img.style.left = '0';
                img.style.top = '0';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.zIndex = '0';
                img.style.pointerEvents = 'none';
                
                viewer.container.insertBefore(img, viewer.container.firstChild);

                try {
                    // Try to generate composite 2D image at HD scale
                    const html2canvas = (await import('html2canvas')).default;
                    const canvas2d = await html2canvas(viewer.container, {
                        backgroundColor: null,
                        useCORS: true,
                        logging: false,
                        scale: scaleFactor // Captura los marcadores HTML en Alta Resolución
                    });
                    
                    const finalUrl = canvas2d.toDataURL('image/png', 1.0);
                    const a = document.createElement('a');
                    a.href = finalUrl;
                    a.download = `Visor_Tandem_Reporte_${new Date().toISOString().slice(0, 10)}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                } catch (error) {
                    console.error("[Viewer] Screenshots composite failed:", error);
                    // Fallback to WebGL only
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = `Visor_Solo_3D_${new Date().toISOString().slice(0, 10)}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                } finally {
                    // Restore 3D viewer
                    viewer.canvas.style.display = originalCanvasDisplay;
                    if (img.parentNode) {
                        img.parentNode.removeChild(img);
                    }
                }
            };
        });
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            {/* BACKGROUND CAMERA (Always Active/Ready) */}
            {/* BACKGROUND CAMERA REMOVED */}

            <div
                id="viewer-container"
                ref={containerRef}
                className="viewer-container"
                style={{ width: '100%', height: '100%', position: 'relative', zIndex: 1 }}
            />


            {/* Sprite Context Menu */}
            {contextMenu && contextMenu.visible && (
                <div
                    className="viewer-context-menu"
                    style={{
                        position: 'fixed',
                        left: contextMenu.x,
                        top: contextMenu.y,
                        background: 'rgba(30, 41, 59, 0.98)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        padding: '8px',
                        zIndex: 10000,
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {contextMenu.type === 'create' ? (
                        <button
                            onClick={handleCreateSpriteFromMenu}
                            style={{
                                width: '100%',
                                padding: '10px 16px',
                                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '600',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => e.target.style.transform = 'translateY(-1px)'}
                            onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
                        >
                            Crear Sprite
                            <small style={{ fontSize: '11px', opacity: 0.9 }}>Marcador 3D</small>
                        </button>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <button
                                onClick={() => {
                                    onSpriteSelect?.(contextMenu.sprite.id);
                                    setContextMenu(null);
                                }}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    background: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: '500',
                                    textAlign: 'left'
                                }}
                            >
                                👁️ Ver {contextMenu.sprite.name}
                            </button>
                            <button
                                onClick={() => {
                                    if (window.confirm('¿Eliminar este sprite?')) {
                                        onSpriteDelete?.(contextMenu.sprite.id);
                                    }
                                    setContextMenu(null);
                                }}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    background: '#ef4444',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: '500',
                                    textAlign: 'left'
                                }}
                            >
                                🗑️ Eliminar
                            </button>
                        </div>
                    )}
                </div>
            )}
            
            {/* Workfronts Config Panel */}
            <WorkfrontsPanel 
                isVisible={isWorkfrontsPanelOpen} 
                onClose={() => setWorkfrontsPanelOpen(false)} 
                workfronts={workfronts} 
                setWorkfronts={setWorkfronts} 
            />

            {/* Botones Flotantes (Obras Lineales) - Solo visibles en tab Maquinaria */}
            {trackingTab === 'maquinaria' && (
                <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 90, display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => setShowProgressives(!showProgressives)}
                        className={`px-5 py-2 rounded-full font-bold shadow-lg transition ${showProgressives ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
                        style={{ backdropFilter: 'blur(4px)' }}
                    >
                        {showProgressives ? "🗺️ Ocultar Progresivas" : "🗺️ Mostrar Progresivas (Trazo)"}
                    </button>
                    {showProgressives && (
                        <button
                            onClick={() => setWorkfrontsPanelOpen(!isWorkfrontsPanelOpen)}
                            className={`p-2 rounded-full font-bold shadow-lg transition ${isWorkfrontsPanelOpen ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
                            style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Configurar Frentes de Trabajo (Heatmap)"
                        >
                            ⚙️
                        </button>
                    )}
                    
                    {/* Botón de Captura de Pantalla Nítida */}
                    <button
                        onClick={handleTakeScreenshot}
                        className="p-2 rounded-full font-bold shadow-lg transition bg-gray-800 text-white hover:bg-gray-700"
                        style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
                        title="Tomar Captura de Pantalla (JPG/PNG HD)"
                    >
                        📸
                    </button>
                </div>
            )}
            
        </div>
    );
};

export default Viewer;
