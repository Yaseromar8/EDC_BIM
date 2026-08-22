import { apiFetch } from '../utils/apiFetch';
import { installPivotUnderPointer } from '../utils/pivotUnderPointer';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import './viewer.css';
import './IconMarkup.css'; // Add this line
import { BaseExtension } from '../aps/extensions/BaseExtension';
import { findLeafNodes, getBulkProperties, calculateDynamicFilterBucketsNative, extractPartidasNative, extractSchemaNative, calculateBucketsFromPostgres } from '../aps/utils/model';
import IconMarkupExtension from '../aps/extensions/IconMarkupExtension';
import ProgressiveExtension from '../aps/extensions/ProgressiveExtension';
import LOB4DExtension from '../aps/extensions/LOB4DExtension';
import WorkfrontsPanel from './WorkfrontsPanel';
import StationTracker from './StationTracker';
import { DataVizEngine } from '../aps/utils/DataVizEngine';

const BACKEND_URL = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ? 'https://visor-ecd-backend.onrender.com' : (import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3000' : (typeof window !== 'undefined' && window.location.hostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/) ? `http://${window.location.hostname}:3000` : 'https://visor-ecd-backend.onrender.com')));

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
    trackingPinsVisible = true,
    trackingPlacementMode = false,
    onTrackingPinCreate,
    onTrackingPinClick,

    // Gemelo / General Selection (removed - was only used for GemeloPropertiesPanel)
    onSelectionChanged,
    aiModelCommand,
    hideToolbar = false,
    // Pin Relocation
    relocatingPin,
    onPinRelocateComplete
}) => {
    // --- Refs ---
    const viewerRef = useRef(null);
    const containerRef = useRef(null);
    const loadedModelsRef = useRef({});
    const loadingUrnsRef = useRef(new Set()); // URNs con carga EN CURSO (anti-duplicado por carrera)
    const loadedViewGuidsRef = useRef({}); // Tracks the GUID of the currently loaded view per model URN
    const baseOffsetRef = useRef(null);
    const loadQueueRef = useRef(Promise.resolve()); // cola única de cargas de modelos
    const swapGenRef = useRef(0); // generación del intercambio de modelos (aborta corridas obsoletas)
    // Matrices de emplazamiento aplicadas con setModelTransform: LMV las PIERDE
    // en el ciclo hideModel→showModel, así que se guardan para re-aplicarlas.
    const modelTransformsRef = useRef({});
    const pushPinListenerRef = useRef(null); // último handler PushPin registrado (anti-fuga)
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
    const ghostMeshRef = useRef(null); // Reference to the 3D sprite mesh
    const dataVizEngineRef = useRef(null);
    const viewerReadyRef = useRef(false);
    const recalcDebounceRef = useRef(null);
    const activeViewableGuidsRef = useRef(activeViewableGuids);

    // Keep ref synced with latest prop value
    useEffect(() => {
        activeViewableGuidsRef.current = activeViewableGuids;
    }, [activeViewableGuids]);

    // --- States ---
    const [viewerReady, setViewerReady] = useState(false);
    const [mobileToolsVisible, setMobileToolsVisible] = useState(false);
    const [contextMenu, setContextMenu] = useState(null);
    const [showProgressives, setShowProgressives] = useState(false);
    const [isStationTrackerOpen, setStationTrackerOpen] = useState(false);
    const [stationTrackerMarkers, setStationTrackerMarkers] = useState([]);
    
    // Workfronts State
    const [isWorkfrontsPanelOpen, setWorkfrontsPanelOpen] = useState(false);
    const [workfronts, setWorkfronts] = useState([
        { id: '1', start: 0, end: 500, color: '#ffaaaa', name: 'Frente 1: Excavación', track: 'PG' },
        { id: '2', start: 500, end: 1100, color: '#9c27b0', name: 'Frente 2: Base', track: 'PG' },
        { id: '3', start: 1100, end: 2000, color: '#4caf50', name: 'Frente 3: Asfalto', track: 'PG' }
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

            // Priority 0: Pin Relocation ("Mover" mode)
            if (relocatingPin && onPinRelocateComplete) {
                const hit = viewer.impl.hitTest(x, y, false);
                if (hit && hit.intersectPoint) {
                    onPinRelocateComplete({
                        x: hit.intersectPoint.x,
                        y: hit.intersectPoint.y,
                        z: hit.intersectPoint.z
                    });
                }
                return;
            }

            // Priority 1: Tracking Pins
            if (trackingPlacementMode) {
                const hit = viewer.impl.hitTest(x, y, false);
                if (hit) {
                    const pos = hit.intersectPoint;
                    const getPartidaInfo = (model, dbId) => new Promise((resolve) => {
                        if (!model || !dbId) return resolve({ code: null, name: null, externalId: null });
                        model.getProperties(dbId, (result) => {
                            const codeProp = result.properties?.find(p => p.displayName === '03_05_DSI_CodigoDePartida');
                            const nameProp = result.properties?.find(p => p.displayName === '03_04_DSI_NombreDePartida');
                            resolve({
                                code: codeProp ? codeProp.displayValue : null,
                                name: nameProp ? nameProp.displayValue : null,
                                externalId: result.externalId || null  // ancla estable al elemento
                            });
                        }, () => resolve({ code: null, name: null, externalId: null }));
                    });

                    getPartidaInfo(hit.model, hit.dbId).then(({ code, name, externalId }) => {
                        onTrackingPinCreate?.({
                            id: Date.now().toString(),
                            x: pos.x, y: pos.y, z: pos.z,
                            dbId: hit.dbId || null,
                            externalId: externalId,
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

        const isAnyPlacementActive = !!relocatingPin || trackingPlacementMode || docPlacementMode || placementMode || buildPlacementMode;

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
    }, [viewerReady, relocatingPin, trackingPlacementMode, docPlacementMode, placementMode, buildPlacementMode, trackingTab, onTrackingPinCreate, onDocPlacementComplete, onPlacementComplete, onBuildPinCreate, onPinRelocateComplete]);
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
                // SVF2 (streamingV2) = el formato de Tandem/ACC: INSTANCIA la
                // geometría repetida (5,799 barras de acero ≈ 1 geometría re-usada)
                // y streamea por visibilidad. Con SVF1 cada barra era malla
                // completa → millones de triángulos, paginación y lentitud.
                // Los modelos ACC (wipprod) ya traen derivado SVF2 de fábrica.
                env: 'AutodeskProduction2',
                api: 'streamingV2',
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
                Autodesk.Viewing.theExtensionManager.registerExtension('LOB4DExtension', LOB4DExtension);
                // Custom extensions removed to simplify UI

                const config = {
                    canvasConfig: {
                        alpha: true,
                        premultipliedAlpha: false,
                        preserveDrawingBuffer: false
                    },
                    extensions: [
                        'BaseExtension',
                        // ViewCube: NO se cargaba explícitamente → por eso no
                        // aparecía el cubo de orientación (Tandem sí lo tiene).
                        'Autodesk.ViewCubeUi',
                        'Autodesk.BIM360.Extension.PushPin',
                        'Autodesk.PDF',
                        'Autodesk.AEC.LevelsExtension',
                        'Autodesk.AEC.Minimap3DExtension',
                        'ProgressiveExtension',
                        'LOB4DExtension',
                        'Autodesk.DataVisualization'
                    ],
                    disabledExtensions: {
                        measure: false,
                        section: false
                    }
                };

                const viewer = new Autodesk.Viewing.GuiViewer3D(containerRef.current, config);
                // CANAL ALFA del lienzo. Sin el, el contexto WebGL se crea
                // opaco y ninguna llamada de limpieza puede volverlo
                // transparente: en AR el area del visor tapaba la camara.
                //
                // Va en el QUINTO argumento de start(), no en la config del
                // constructor. Leido en el propio LMV:
                //   Viewer3D.start(url, opts, onOk, onErr, initOptions)
                //     -> this.initialize(initOptions) -> impl.initialize(e)
                //     -> createRenderer(canvas, e.webglInitParams)
                //   y ademas: removeAlphaInOutput = (webglInitParams?.alpha !== true)
                //
                // En uso normal no cambia nada — el visor sigue pintando su
                // fondo; solo habilita que el AR pueda apagarlo.
                viewer.start(undefined, undefined, undefined, undefined, {
                    webglInitParams: { alpha: true }
                });
                
                // Expose globally for panels and extensions
                window.viewer = viewer;
                window.NOP_VIEWER = viewer;

                const applyViewerVisualQuality = () => {
                    try {
                        if (typeof viewer.setQualityLevel === 'function') {
                            viewer.setQualityLevel(true, true);
                        }
                        if (viewer.prefs && typeof viewer.prefs.set === 'function') {
                            viewer.prefs.set('ambientShadows', true);
                            viewer.prefs.set('antialiasing', true);
                        }
                        // SAO más profundo: radio amplio (escena civil grande) +
                        // intensidad alta → el contacto entre elementos se lee
                        // (estilo Tandem). Default LMV es tímido (5 / ~0.4).
                        if (viewer.impl && typeof viewer.impl.setAOOptions === 'function') {
                            viewer.impl.setAOOptions(window.__vqAoRadius ?? 12, window.__vqAoIntensity ?? 1.0);
                        }
                        // BORDES estilo Tandem: aristas oscuras en la geometría —
                        // es LO que hace que Tandem se vea "sólido" y definido.
                        if (typeof viewer.setDisplayEdges === 'function') {
                            viewer.setDisplayEdges(true);
                        }
                        if (typeof viewer.setGroundShadow === 'function') {
                            viewer.setGroundShadow(true);
                        }
                        if (typeof viewer.setGroundShadowAlpha === 'function') {
                            viewer.setGroundShadowAlpha(0.85);
                        }
                        if (typeof viewer.setGroundReflection === 'function') {
                            viewer.setGroundReflection(false);
                        }
                        // ── ANTI-PARPADEO equilibrado ────────────────────────
                        // Progresivo ON con PRESUPUESTO DE FRAME alto → la
                        // primera pasada dibuja casi todo (parpadeo mínimo)
                        // sin sacrificar fluidez.
                        // OJO: optimizeNavigation queda OFF a propósito — ese
                        // modo OCULTA los objetos TRANSPARENTES al navegar
                        // (los sólidos rojos de excavación desaparecían al
                        // acercarse y solo volvían al cambiar de herramienta).
                        if (typeof viewer.setProgressiveRendering === 'function') {
                            viewer.setProgressiveRendering(true);
                        }
                        if (viewer.impl && 'targetFrameBudget' in viewer.impl) {
                            viewer.impl.targetFrameBudget = 100; // ms por pasada (default ~16-30)
                        }
                        if (viewer.prefs && typeof viewer.prefs.set === 'function') {
                            viewer.prefs.set('optimizeNavigation', false);
                        }
                        if (typeof viewer.setOptimizeNavigation === 'function') {
                            viewer.setOptimizeNavigation(false);
                        }
                        viewer.impl?.invalidate?.(true, true, true);
                    } catch (e) {
                        console.warn('[Viewer] No se pudo reforzar calidad visual:', e);
                    }
                };
                window.__applyViewerVisualQuality = applyViewerVisualQuality;
                applyViewerVisualQuality();

                // ── FONDO estilo Tandem ─────────────────────────────────────
                // El canvas es alpha:true → se veía el degradado AZULADO de la
                // página detrás del modelo. Tandem usa un GRIS MUY CLARO plano.
                // Solo se toca el fondo: la iluminación queda como estaba.
                try {
                    if (typeof viewer.setBackgroundColor === 'function') {
                        const bg = window.__vqBg || [243, 244, 246];
                        viewer.setBackgroundColor(bg[0], bg[1], bg[2], bg[0], bg[1], bg[2]);
                    }
                    // El ViewCube puede venir oculto según la versión del visor
                    if (typeof viewer.displayViewCube === 'function') {
                        viewer.displayViewCube(true);
                    }
                } catch (e) {
                    console.warn('[Viewer] No se pudo fijar el fondo:', e);
                }

                // Calibración visual EN VIVO (consola F12), sin recompilar:
                //   __vq.ao(12, 1)     → radio/intensidad de oclusión ambiental
                //   __vq.light(0..15)  → preset de iluminación/entorno
                //   __vq.edges(true)   → bordes de aristas on/off
                window.__vq = {
                    ao: (radius, intensity) => { try { window.__vqAoRadius = radius; window.__vqAoIntensity = intensity; viewer.impl.setAOOptions(radius, intensity); viewer.impl.invalidate(true, true, true); } catch (e) { console.warn(e); } },
                    light: (n) => { try { viewer.setLightPreset(n); } catch (e) { console.warn(e); } },
                    // __vq.bg(r,g,b) → fondo plano (más alto = más claro)
                    bg: (r, g, b) => { try { window.__vqBg = [r, g, b]; viewer.setBackgroundColor(r, g, b, r, g, b); } catch (e) { console.warn(e); } },
                    cube: (on) => { try { viewer.displayViewCube(on !== false); } catch (e) { console.warn(e); } },
                    edges: (on) => { try { viewer.setDisplayEdges(!!on); viewer.impl.invalidate(true, true, true); } catch (e) { console.warn(e); } },
                    // __vq.progressive(true|false) → render progresivo (true = más
                    // fluido en escenas gigantes pero parpadea; false = estable Tandem)
                    progressive: (on) => { try { viewer.setProgressiveRendering(!!on); viewer.prefs?.set?.('progressiveRendering', !!on); viewer.impl.invalidate(true, true, true); } catch (e) { console.warn(e); } },
                };

                // ── ÓRBITA ALREDEDOR DE LO QUE APUNTAS (estilo Tandem/Fusion) ─
                // Mouse en escritorio y DEDO en tablet: el punto del modelo bajo
                // el puntero pasa a ser el pivote de órbita. Ver utils/pivotUnderPointer.js.
                try {
                    viewer.__pivotUnderCursor = installPivotUnderPointer(viewer);
                } catch (e) {
                    console.warn('[Viewer] Pivote bajo el puntero no disponible:', e);
                }

                // ── FORZAR COMPORTAMIENTO NATIVO DE CLIC ──────────────────────
                // Forzamos explícitamente que el clic simple seleccione y deseleccione,
                // previniendo que extensiones como DataVisualization o PushPin interfieran.
                try {
                    if (viewer.setClickConfig) {
                        viewer.setClickConfig("click", "onObject", ["selectOnly"]);
                        viewer.setClickConfig("click", "offObject", ["deselectAll"]);
                    }
                } catch (e) {
                    console.warn('[Viewer] Error seteando click config:', e);
                }

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
                     applyViewerVisualQuality();
                     console.log('[GHOST ACC] ✅ Modo ACC reforzado en GEOMETRY_LOADED');
                     
                     // Auto-ocultar grillas de sección de Civil 3D para limpiar el 3D
                     try {
                         ['vista de secciones', 'section view', '02.09'].forEach(kw => {
                             viewer.search(kw, (dbIds) => {
                                 if (dbIds && dbIds.length > 0) viewer.hide(dbIds);
                             }, null, ['Layer', 'name']);
                         });
                     } catch (e) {
                         console.warn('[APS LMV] Error ocultando capas de Civil:', e);
                     }
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
                    // (los tintes por FUENTE ya los restaura el choke-point de
                    // clearThemingColors; repetir aquí duplicaba el repintado)
                    viewer.impl.invalidate(true, true, true);
                };

                window.__ghostCleanup = stopGhostEnforcement;

                // CHOKE-POINT anti-parpadeo de tintes por FUENTE: cualquier
                // clearThemingColors — venga del flujo que venga (reset de
                // filtros, LOB4D, tableros, aislamiento, código futuro) —
                // restaura el tinte del modelo EN LA MISMA LLAMADA. Un solo
                // punto en vez de perseguir cada sitio que borra.
                try {
                    const _origClearTheming = viewer.clearThemingColors.bind(viewer);
                    viewer.clearThemingColors = (model) => {
                        const r = _origClearTheming(model);
                        try {
                            if (window.__ecdReapplySourceTints) window.__ecdReapplySourceTints(viewer, model);
                        } catch { /* noop */ }
                        return r;
                    };
                } catch { /* noop */ }
                
                // GHOST ENFORCEMENT: Solo visual — mantenido aquí porque depende de
                // las closures startGhostEnforcement/stopGhostEnforcement del Initializer.
                // La sincronización con Inventory se maneja en un useEffect separado
                // (ver "Isolation → Inventory Sync" más abajo) para resiliencia con HMR.
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
                });
                viewer.addEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, (event) => {
                     console.log(`[APS LMV] ⏱️ ${performance.now().toFixed(2)}ms - Evento: OBJECT_TREE_CREATED_EVENT`);
                     
                     const modelLoaded = event.model;
                     if (!modelLoaded) return;
                     const urn = modelLoaded.getData().urn;
                     const tree = modelLoaded.getInstanceTree();

                     modelLoaded.getExternalIdMapping((mapping) => {
                         // PIEDRA ROSETTA: Solo mapear NODOS HOJA con geometría real.
                         // Un nodo hoja es aquel que NO tiene hijos en el árbol de instancias.
                         // Excluimos nodos padre (Type, Category, Family) porque:
                         //   1. No representan elementos constructivos individuales
                         //   2. Aislarlos muestra toda su subrama (efecto "doble modelo")
                         //   3. Sus propiedades son de tipo, no de instancia
                         const leafPhysicalDbIds = new Set();
                         if (tree) {
                             const rootId = tree.getRootId();
                             const scanLeaves = (dbId) => {
                                 const childCount = tree.getChildCount(dbId);
                                 if (childCount === 0) {
                                     // Nodo hoja: verificar si tiene geometría (fragmentos)
                                     let hasFragments = false;
                                     tree.enumNodeFragments(dbId, () => { hasFragments = true; });
                                     if (hasFragments) leafPhysicalDbIds.add(dbId);
                                 } else {
                                     // Nodo padre: descender pero NO agregarlo al diccionario
                                     tree.enumNodeChildren(dbId, (childId) => {
                                         scanLeaves(childId);
                                     });
                                 }
                             };
                             scanLeaves(rootId);
                         }

                         window.rosettaToDbId = window.rosettaToDbId || {};
                         window.rosettaToDbId[urn] = {};
                     
                         window.rosettaToExtId = window.rosettaToExtId || {};
                         window.rosettaToExtId[urn] = {};
                         
                         let rawCount = 0;
                         let leafCount = 0;

                         for (const extId in mapping) {
                             if (mapping.hasOwnProperty(extId)) {
                                 const dbId = mapping[extId];
                                 rawCount++;

                                 // rosettaToExtId: TODOS los nodos (dbId → extId)
                                 // Necesario para que highlight y isolation sync funcionen
                                 // con TODAS las categorías (incluyendo genéricas con sub-componentes).
                                 window.rosettaToExtId[urn][dbId] = extId;

                                 // rosettaToDbId: SOLO hojas físicas (extId → dbId)
                                 // Usado por Inventory para purgar nodos fantasma (Type/Category/Family)
                                 // que no representan elementos constructivos individuales.
                                 if (leafPhysicalDbIds.has(dbId)) {
                                     window.rosettaToDbId[urn][extId] = dbId;
                                     leafCount++;
                                 }
                             }
                         }
                         
                         console.log(`[Piedra Rosetta Multi-Modelo] Diccionario Creado (${urn}). Nodos Crudos: ${rawCount} -> Hojas Físicas: ${leafCount}`);

                         // IFC BRIDGE: Para modelos IFC, el viewer usa IDs path-based (0/0/0/X)
                         // pero la DB almacena IfcGUIDs (2q0BjkWCptwm...). Construir mapeo adicional.
                         const sampleExtId = Object.keys(window.rosettaToDbId[urn])[0];
                         if (sampleExtId && sampleExtId.includes('/')) {
                             console.log(`[Piedra Rosetta] Detectado modelo IFC — construyendo puente IfcGUID...`);
                             const leafDbIds = Array.from(leafPhysicalDbIds);
                             modelLoaded.getBulkProperties(leafDbIds, ['IfcGUID'], (results) => {
                                 let bridgeCount = 0;
                                 results.forEach(result => {
                                     const guidProp = result.properties.find(p => p.displayName === 'IfcGUID');
                                     if (guidProp && guidProp.displayValue) {
                                         // Agregar IfcGUID como clave adicional (no sobrescribe path-based)
                                         window.rosettaToDbId[urn][guidProp.displayValue] = result.dbId;
                                         // Mapeo inverso: dbId → IfcGUID (para click-to-select e isolation sync)
                                         window.rosettaToExtId[urn][result.dbId] = guidProp.displayValue;
                                         bridgeCount++;
                                     }
                                 });
                                 console.log(`[Piedra Rosetta] IfcGUID bridge completado: ${bridgeCount} elementos mapeados.`);
                                 window.dispatchEvent(new CustomEvent('rosetta-ready'));
                             });
                         } else {
                             window.dispatchEvent(new CustomEvent('rosetta-ready'));
                         }
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

                // El contenedor cambia de tamaño DESPUÉS de iniciar (barra de
                // Capas inferior, paneles). Sin esto el canvas conserva el
                // tamaño viejo → picking/órbita "descuadrados" y franjas.
                try {
                    let resizeRaf = null;
                    const ro = new ResizeObserver(() => {
                        if (resizeRaf) cancelAnimationFrame(resizeRaf);
                        resizeRaf = requestAnimationFrame(() => {
                            try { viewer.resize(); } catch { /* noop */ }
                        });
                    });
                    ro.observe(containerRef.current);
                    viewer.__containerResizeObserver = ro;
                } catch { /* ResizeObserver no disponible */ }

                // NOTA: se probó "calidad/resolución adaptativa al movimiento"
                // (bajar SAO/bordes/píxeles al orbitar). REVERTIDO: en LMV el
                // cambio de framebuffer y el toggle de pipeline generan MÁS
                // parpadeo del que ahorran, y descolocan el HUD (ViewCube).
                // La fluidez real vino de: memoria 2GB (sin pop-in), overlays
                // en el arrastre de PK y el render progresivo calibrado.

                // PÉRDIDA DE CONTEXTO WebGL (GPU reset por driver/suspensión/VRAM):
                // sin manejar, el canvas queda NEGRO para siempre y el usuario
                // cree que la app murió. Avisamos a la UI para ofrecer recarga
                // y re-render automático si el contexto vuelve (estilo Tandem).
                try {
                    const glCanvas = viewer.canvas || viewer.impl?.canvas;
                    if (glCanvas) {
                        glCanvas.addEventListener('webglcontextlost', (ev) => {
                            ev.preventDefault();
                            console.error('[Viewer] ⚠️ Contexto WebGL PERDIDO (reset de GPU).');
                            window.dispatchEvent(new CustomEvent('viewer-webgl-lost'));
                        }, false);
                        glCanvas.addEventListener('webglcontextrestored', () => {
                            console.warn('[Viewer] Contexto WebGL restaurado — re-render completo.');
                            try { viewer.impl.invalidate(true, true, true); } catch { /* noop */ }
                            window.dispatchEvent(new CustomEvent('viewer-webgl-restored'));
                        }, false);
                    }
                } catch { /* noop */ }

                // COHERENCIA FILTRO ↔ VISOR: "Mostrar todo" (menú contextual de LMV)
                // limpia la escena, pero el panel Filters quedaba con la selección
                // marcada (p. ej. "Structural Rebar 1 of 8") — mentía. Avisar a la
                // App para que resetee las selecciones y ambos queden alineados.
                try {
                    if (Autodesk.Viewing.SHOW_ALL_EVENT) {
                        viewer.addEventListener(Autodesk.Viewing.SHOW_ALL_EVENT, () => {
                            window.dispatchEvent(new CustomEvent('viewer-show-all'));
                        });
                    }
                } catch { /* noop */ }

                // Referencia ESTABLE al visor principal. window.NOP_VIEWER apunta al
                // ÚLTIMO GuiViewer3D creado (láminas, comparador…) — no es confiable
                // para quien necesita el 3D principal (Live Link, AR).
                window.__mainViewer = viewer;

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
                try { v.__pivotUnderCursor?.(); } catch (e) { /* noop */ }
                try { v.__containerResizeObserver?.disconnect(); } catch (e) { /* noop */ }

                try {
                    v.finish();
                } catch (e) {
                    console.warn("Error finishing viewer:", e);
                }
                if (window.NOP_VIEWER === v) {
                    window.NOP_VIEWER = null;
                }
                window.__viewerLiveModels = {};
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accessToken]);

    // ============== EVENTOS GLOBALES DE TOPBAR ==============
    useEffect(() => {
        const toggleProg = () => setShowProgressives(prev => !prev);
        const toggleWF = () => setWorkfrontsPanelOpen(prev => !prev);
        const toggleST = () => setStationTrackerOpen(prev => !prev);
        window.addEventListener('toggle-progressives', toggleProg);
        window.addEventListener('toggle-workfronts-panel', toggleWF);
        window.addEventListener('toggle-station-tracker', toggleST);
        return () => {
            window.removeEventListener('toggle-progressives', toggleProg);
            window.removeEventListener('toggle-workfronts-panel', toggleWF);
            window.removeEventListener('toggle-station-tracker', toggleST);
        };
    }, []);

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

        // REMOVIDO: Ya no extraeremos partidas nativamente desde Viewer.jsx
        // El App.jsx ahora construye availablePartidas directamente desde postgresInventory
        // cuando recibe el evento viewer-schema-extracted.

        // REMOVIDO: extractSchemaNative ya no se utiliza porque la metadata
        // se construye ahora basándose en PostgreSQL (App.jsx), que garantiza
        // incluir *todas* las propiedades DSI (inclusive las instancias únicas)
        // a través de todos los modelos federados sin truncamiento.

        // NOTA: fitToView() se ejecuta condicionalmente en loadModelSequentially
        // para evitar destruir la cámara/Section Box de la Vista 3D seleccionada.
    }, [onModelProperties]);

    // Recalcular Filtros nativamente desde el API de APS (con debounce para evitar double-fire)
    useEffect(() => {
        const handleRecalculateFilters = (event) => {
            // Coalescer ráfagas del mismo tick (evita double-fire) pero instantáneo:
            // el cálculo ahora usa índice cacheado (FacetIndex), no re-escanea el
            // inventario en cada clic → ya no necesita 50ms de espera.
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
                console.log(`[VIEWER EXECUTE] filterSelections:`, JSON.stringify(detail.filterSelections));
                
                // TANDEM GRAY-GHOST: Guardar el filtro global en la memoria para el manejador de Temas
                window._lastHasActiveFilters = activeFilters.length > 0;
                window._lastValidDbIds = mergedValidIdsByUrn;

                // GUARD: Señalizar que la isolation viene del sistema de filtros,
                // NO del usuario. Esto evita que handleIsolationSync dispare
                // un MASTER RESET que crearía un feedback loop infinito.
                window._filterIsolationInProgress = true;

                if (activeFilters.length === 0) {
                     console.log(`[VIEWER EXECUTE] 🔄 No active filters. Resetting isolation per-model.`);
                     const modelsQueue = viewer.impl.modelQueue().getModels();
                     modelsQueue.forEach(m => {
                         // Respect Sources visibility — don't un-hide models that are toggled off
                         const rawUrn = m.getData()?.urn;
                         const normViewerUrn = normalizeUrn(rawUrn);
                         if (hiddenModelUrnsRef.current && hiddenModelUrnsRef.current.some(u => normalizeUrn(u) === normViewerUrn)) {
                             viewer.hideModel(m.id);
                             return;
                         }
                         viewer.isolate([], m);
                     });
                     if (window.__ghostCleanup) window.__ghostCleanup();
                } else {
                    viewer.setGhosting(true);
                     const modelsQueue = viewer.impl.modelQueue().getModels();
                     let totalIsolated = 0;
                     console.log(`[VIEWER EXECUTE] modelsQueue: ${modelsQueue.length} model instances`, modelsQueue.map(m => m.getData()?.urn?.slice(-20)));

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
                             // LEAF-ONLY FILTER: Aislar nodos padre hace visible toda su subrama.
                             // Elementos Unassigned a menudo incluyen nodos Type/Category de Revit
                             // que no tienen el parámetro de instancia. Filtramos a hojas solamente.
                             const tree = m.getInstanceTree();
                             const leafIds = tree 
                                 ? idsArray.filter(id => tree.getChildCount(id) === 0) 
                                 : idsArray;
                             if (leafIds.length > 0) {
                                 viewer.impl.visibilityManager.isolate(leafIds, m);
                             } else {
                                 viewer.impl.visibilityManager.isolate([-1], m); // No leaf matches → ghost all
                             }
                             console.log(`[VIEWER EXECUTE]   Model ${idx} (${viewerUrn?.slice(-20)}): ${leafIds.length} leaf elements isolated (${idsArray.length} raw).`);
                             totalIsolated += leafIds.length;
                         } else {
                             viewer.impl.visibilityManager.isolate([-1], m); // Forzar ghost: dbId -1 no existe → todo el modelo queda fantasma
                             console.log(`[VIEWER EXECUTE]   Model ${idx} (${viewerUrn?.slice(-20)}): fully ghosted`);
                         }
                     });

                     console.log(`[VIEWER EXECUTE] \uD83C\uDFAF Per-model isolation complete: ${totalIsolated} total elements visible`);
                     viewer.impl.invalidate(true, true, true);
                }
                
                // GUARD: Liberar la bandera después de un tick para que el ISOLATE_EVENT
                // (que se despacha asincrónicamente por el viewer) sea ignorado.
                setTimeout(() => { window._filterIsolationInProgress = false; }, 300);
                
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
            }, 50); // coalesce del storm de carga (rosetta-ready x modelo); el
                    // cálculo ya es instantáneo por el FacetIndex cacheado.
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
                modelsQueue.forEach(m => {
                    const rawUrn = m.getData()?.urn;
                    const normUrn = normalizeUrn(rawUrn);
                    if (hiddenModelUrnsRef.current && hiddenModelUrnsRef.current.some(u => normalizeUrn(u) === normUrn)) {
                        viewer.hideModel(m.id);
                        return;
                    }
                    viewer.isolate([], m);
                });
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
                // Reset: Show all on every model (but respect Sources visibility)
                const modelsQueue = viewer.impl.modelQueue().getModels();
                modelsQueue.forEach(m => {
                    const rawUrn = m.getData()?.urn;
                    const normUrn = normalizeUrn(rawUrn);
                    if (hiddenModelUrnsRef.current && hiddenModelUrnsRef.current.some(u => normalizeUrn(u) === normUrn)) {
                        viewer.hideModel(m.id);
                        return;
                    }
                    viewer.isolate([], m);
                });
            }
        };

        const handleTheme = (e) => {
            const { propId, values, active, customColors } = e.detail;
            window._lastThemeEventConfig = { propId, values, active }; // MEMORIA FOTOGRAFICA
            console.log(`[PUENTE] ⏱️ ${performance.now().toFixed(2)}ms - Recibido: theme-property-bucket - propId: ${propId}, active: ${active}`);
            
            const PALETTE = [
                '#7e9bbd', '#F97316', '#10B981', '#F43F5E', '#A855F7', '#5f7fa3', '#EAB308',
                '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6', '#84CC16', '#F59E0B'
            ];
            // 0.6: el tinte domina pero DEJA PASAR el sombreado (AO/luz) — con
            // 0.82 el terreno quedaba plano al colorear (el theming de LMV mezcla
            // el color DESPUÉS de la iluminación: alfa alto = relieve borrado).
            const THEME_COLOR_ALPHA = 0.6;

            // Merge custom per-value color overrides (from color picker or global store)
            const customOverrides = customColors || window._customValueColors || {};

            const modelsQueue = viewer.impl.modelQueue().getModels();
            
            if (!active) {
                console.log(`[PUENTE] ⏱️ ${performance.now().toFixed(2)}ms - Ejecutando: viewer.clearThemingColors()`);
                modelsQueue.forEach(m => viewer.clearThemingColors(m));
                window.__applyViewerVisualQuality?.();
                // Live Link: colores apagados → Revit también despinta
                window.dispatchEvent(new CustomEvent('viewer-colors-applied', { detail: { groups: [] } }));
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
                        // Check for custom per-value color override first, fall back to PALETTE
                        const overrideKey = `${propId}::${val}`;
                        const override = customOverrides[overrideKey];
                        if (override === 'none') return; // usuario EXCLUYÓ este valor del coloreo (✕ en el picker)
                        const hexColor = override || PALETTE[originalIndex % PALETTE.length];
                        
                        // Parse hex to Vector4 (Shader readable)
                        const rgb = parseInt(hexColor.replace('#', ''), 16);
                        const r = ((rgb >> 16) & 255) / 255;
                        const g = ((rgb >> 8) & 255) / 255;
                        const b = (rgb & 255) / 255;
                        const colorVector = new window.THREE.Vector4(r, g, b, THEME_COLOR_ALPHA);

                        // Mapeo en Diccionario por URN
                        entry.dbIds.forEach(item => {
                            if (validIdsFilter) {
                                const urnSet = validIdsFilter[item.modelUrn];
                                if (!urnSet || !urnSet.has(item.id)) return; // No pintar si está ghosteado o no hay filtro válido para este modelo
                            }
                            if(!colorMapByUrn[item.modelUrn]) colorMapByUrn[item.modelUrn] = [];
                            colorMapByUrn[item.modelUrn].push({ id: item.id, colorVector, hex: hexColor });
                        });
                    }
                });

                // Inyección Nativa al Pipeline GPU (Non-blocking ASYNC CHUNKING)
                const startGPU = performance.now();
                console.log(`[GPU] 🚀 Compilando ColorMap de FacetsManager para ${Object.keys(colorMapByUrn).length} modelos federados...`);
                
                const processGPUBuffer = async () => {
                    // Live Link: acumular color→(modelo→ids) para replicar en Revit
                    const linkByColor = new Map();
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
                                    if (inst.hex) {
                                        if (!linkByColor.has(inst.hex)) linkByColor.set(inst.hex, new Map());
                                        const modelMap = linkByColor.get(inst.hex);
                                        if (!modelMap.has(m)) modelMap.set(m, []);
                                        modelMap.get(m).push(inst.id);
                                    }
                                });
                                // Liberar el Hilo Principal del Navegador brevemente
                                await new Promise(resolve => setTimeout(resolve, 0));
                                viewer.impl.invalidate(true, true, true); // Intercambio Parcial (Efecto Progreso Fluido)
                            }
                        }
                    }

                    // Forzar el repintado final de shader
                    viewer.impl.invalidate(true, true, true);
                    window.__applyViewerVisualQuality?.();
                    console.log(`[GPU] ⚡ Tema visual re-renderizado asíncronamente en ${(performance.now() - startGPU).toFixed(2)}ms`);

                    // Live Link: publicar el estado de colores (Revit lo replica)
                    const linkColorGroups = Array.from(linkByColor.entries()).map(([hex, modelMap]) => ({
                        color: hex,
                        entries: Array.from(modelMap.entries()).map(([mm, ids]) => ({ model: mm, dbIds: ids })),
                    }));
                    window.dispatchEvent(new CustomEvent('viewer-colors-applied', { detail: { groups: linkColorGroups } }));
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
             window.__applyViewerVisualQuality?.();
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

            // --- Sincronización de Selección Múltiple (Silenciosa) ---
            try {
                const allSelectedExtIds = [];
                let hasSelection = false;

                for (const sel of selections) {
                    if (!sel.dbIdArray || sel.dbIdArray.length === 0 || !sel.model) continue;
                    hasSelection = true;
                    const selModel = sel.model;
                    const modelUrn = selModel.getData()?.urn;
                    const safeUrn = modelUrn ? String(modelUrn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';
                    const urnDict = window.rosettaToExtId?.[modelUrn] || window.rosettaToExtId?.[safeUrn];

                    if (!urnDict) continue;

                    const instanceTree = selModel.getInstanceTree();
                    
                    for (const dbId of sel.dbIdArray) {
                        const extId = urnDict[dbId];
                        const isParent = instanceTree && instanceTree.getChildCount(dbId) > 0;

                        if (extId) {
                            allSelectedExtIds.push(extId);
                        }

                        // Expandir a hojas
                        if (isParent) {
                            instanceTree.enumNodeChildren(dbId, (childId) => {
                                if (instanceTree.getChildCount(childId) === 0) {
                                    const childExtId = urnDict[childId];
                                    if (childExtId) {
                                        allSelectedExtIds.push(childExtId);
                                    }
                                }
                            }, true);
                        }
                    }
                }

                window.dispatchEvent(new CustomEvent('inventory-selection-sync', {
                    detail: { selectedExtIds: allSelectedExtIds }
                }));
            } catch (err) {
                console.error('[SYNC ❌] Error en selection sync:', err);
            }
        };

        viewer.addEventListener(Autodesk.Viewing.AGGREGATE_SELECTION_CHANGED_EVENT, handleSelection);

        return () => {
            viewer.removeEventListener(Autodesk.Viewing.AGGREGATE_SELECTION_CHANGED_EVENT, handleSelection);
        }
    }, [viewerReady, onSelectionChanged]);

    // ═══════════════════════════════════════════════════════════════════════
    // MARQUEE COMPLETO (Shift + arrastre) — selección por CAJA DELIMITADORA
    // El marquee nativo lee píxeles visibles → olvida los elementos ocluidos
    // (detrás de otros). Este selecciona TODO elemento cuya bounding box, al
    // proyectarse a pantalla, toca el rectángulo — incluidos los ocluidos.
    // Excluye los OCULTOS (Hide/aislados fuera), no los simplemente tapados.
    // ═══════════════════════════════════════════════════════════════════════
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;
        if (!viewer.toolController) { console.warn('[Marquee] toolController no disponible aún.'); return; }
        const THREE = window.THREE
            || (window.Autodesk && Autodesk.Viewing && Autodesk.Viewing.Private && Autodesk.Viewing.Private.THREE)
            || (typeof globalThis !== 'undefined' && globalThis.THREE);
        if (!THREE) { console.warn('[Marquee] THREE no disponible; marquee completo deshabilitado.'); return; }

        let dragging = false;
        let start = null;     // {cx, cy} en px de canvas
        let last = null;
        let overlay = null;

        const getCanvasRect = () => (viewer.impl?.canvas || viewer.canvas).getBoundingClientRect();

        const ensureOverlay = () => {
            if (overlay) return overlay;
            overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed; border:1px solid #7e9bbd; background:rgba(126,155,189,0.18); pointer-events:none; z-index:9000;';
            document.body.appendChild(overlay);
            return overlay;
        };
        const removeOverlay = () => { if (overlay) { overlay.remove(); overlay = null; } };
        const updateOverlay = (a, b) => {
            const rect = getCanvasRect();
            const o = ensureOverlay();
            o.style.left = (rect.left + Math.min(a.cx, b.cx)) + 'px';
            o.style.top = (rect.top + Math.min(a.cy, b.cy)) + 'px';
            o.style.width = Math.abs(a.cx - b.cx) + 'px';
            o.style.height = Math.abs(a.cy - b.cy) + 'px';
        };

        const performBoxSelect = (a, b) => {
            try {
                const rect = getCanvasRect();
                const minX = Math.min(a.cx, b.cx), maxX = Math.max(a.cx, b.cx);
                const minY = Math.min(a.cy, b.cy), maxY = Math.max(a.cy, b.cy);
                const camera = viewer.impl.camera;
                const models = viewer.impl.modelQueue().getModels();
                const aggregate = [];
                const tmp = new THREE.Vector3();
                const box = new THREE.Box3();
                const fbox = new THREE.Box3();

                for (const model of models) {
                    const tree = model.getInstanceTree && model.getInstanceTree();
                    const frags = model.getFragmentList && model.getFragmentList();
                    if (!tree || !frags) continue;
                    const ids = [];
                    tree.enumNodeChildren(tree.getRootId(), (dbId) => {
                        if (tree.getChildCount(dbId) !== 0) return; // solo hojas
                        box.makeEmpty();
                        let has = false, vis = false;
                        tree.enumNodeFragments(dbId, (fragId) => {
                            frags.getWorldBounds(fragId, fbox);
                            box.union(fbox);
                            has = true;
                            if (frags.isFragVisible && frags.isFragVisible(fragId)) vis = true;
                        }, false);
                        if (!has || box.isEmpty() || !vis) return; // saltar ocultos
                        // Proyectar las 8 esquinas → AABB en pantalla
                        let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity, anyFront = false;
                        for (let i = 0; i < 8; i++) {
                            tmp.set((i & 1) ? box.max.x : box.min.x,
                                    (i & 2) ? box.max.y : box.min.y,
                                    (i & 4) ? box.max.z : box.min.z);
                            tmp.project(camera);
                            if (tmp.z <= 1) anyFront = true;
                            const sx = (tmp.x * 0.5 + 0.5) * rect.width;
                            const sy = (-tmp.y * 0.5 + 0.5) * rect.height;
                            if (sx < sMinX) sMinX = sx; if (sx > sMaxX) sMaxX = sx;
                            if (sy < sMinY) sMinY = sy; if (sy > sMaxY) sMaxY = sy;
                        }
                        if (!anyFront) return;
                        // Intersección AABB pantalla vs rectángulo marquee
                        if (sMaxX >= minX && sMinX <= maxX && sMaxY >= minY && sMinY <= maxY) ids.push(dbId);
                    }, true);
                    if (ids.length) aggregate.push({ model, selection: ids });
                }

                const _total = aggregate.reduce((n, a) => n + (a.selection ? a.selection.length : 0), 0);
                console.log(`[Marquee] caja → ${_total} elementos seleccionados (incluye ocluidos)`);

                if (aggregate.length) viewer.setAggregateSelection(aggregate);
                else viewer.clearSelection();
            } catch (e) {
                console.warn('[Marquee] error en selección por caja:', e);
            }
        };

        // ¿Hay una herramienta INTERACTIVA activa que necesita los clics para
        // colocar puntos? (Medir, Sección, Marcado, Pins). Este marquee tiene
        // prioridad 1000 y consumía TODOS los clics → Medir nunca los recibía.
        // Con este guard, el marquee CEDE el clic a esas herramientas.
        const interactiveToolActive = () => {
            try {
                for (const n of ['Autodesk.Measure', 'Autodesk.Section']) {
                    const ext = viewer.getExtension(n);
                    if (ext && (ext.isActive?.() || ext.activeStatus)) return true;
                }
                const mk = viewer.getExtension('Autodesk.Viewing.MarkupsCore');
                if (mk && (mk.duringEditMode || mk.duringViewMode)) return true;
                const tn = viewer.toolController?.getActiveToolName?.() || '';
                if (/measure|section|markup|dimension|pin|pushpin/i.test(tn)) return true;
            } catch (e) { /* ante duda, no bloquear */ }
            return false;
        };

        const tool = {
            getNames: () => ['CompleteBoxSelectTool'],
            getPriority: () => 1000, // alta: intercepta antes que orbitar/marquee nativo
            register: () => {},
            deregister: () => { removeOverlay(); },
            activate: () => {},
            deactivate: () => { dragging = false; removeOverlay(); },
            update: () => false,
            handleButtonDown: (event, button) => {
                if (interactiveToolActive()) return false; // ceder a Medir/Sección/etc.
                if (button === 0 && event.shiftKey) {
                    dragging = true;
                    start = { cx: event.canvasX, cy: event.canvasY };
                    last = start;
                    updateOverlay(start, start);
                    console.log('[Marquee] inicio arrastre (Shift)');
                    return true; // consume → no orbita
                }
                return false;
            },
            handleSingleClick: (event, button) => {
                if (interactiveToolActive()) return false; // Medir/Sección se quedan con el clic
                if (button === 0) {
                    // El raycast natively ignora elementos ocultos/ghosted según la config
                    const hit = viewer.impl.hitTest(event.canvasX, event.canvasY, false);
                    if (hit && hit.dbId) {
                        viewer.select(hit.dbId, hit.model);
                    } else {
                        viewer.clearSelection();
                    }
                    // Retornamos true para consumir el evento y evitar que extensiones rebeldes
                    // (como BIM360 PushPin) se roben el clic. Los sprites (DataViz) están a salvo
                    // porque son interceptados en la fase de captura antes de llegar aquí.
                    return true;
                }
                return false;
            },
            handleDoubleClick: () => false,
            handleMouseMove: (event) => {
                if (!dragging) return false;
                last = { cx: event.canvasX, cy: event.canvasY };
                updateOverlay(start, last);
                return true;
            },
            handleButtonUp: (event, button) => {
                if (!dragging || button !== 0) return false;
                dragging = false;
                const end = { cx: event.canvasX, cy: event.canvasY };
                removeOverlay();
                // Arrastre real (no un click): >3px en algún eje
                if (Math.abs(end.cx - start.cx) > 3 || Math.abs(end.cy - start.cy) > 3) {
                    performBoxSelect(start, end);
                }
                return true;
            },
            handleGesture: () => dragging,
            handleBlur: () => { dragging = false; removeOverlay(); return false; },
        };

        // Red de seguridad: si el mouseup ocurre fuera del canvas, cerrar el arrastre.
        const safetyUp = () => { if (dragging) { dragging = false; removeOverlay(); } };
        window.addEventListener('mouseup', safetyUp, true);

        try {
            viewer.toolController.registerTool(tool);
            const ok = viewer.toolController.activateTool('CompleteBoxSelectTool');
            console.log(`[Marquee] tool registrado y activado (ok=${ok}). Usa Shift + arrastre.`);
        } catch (e) {
            console.warn('[Marquee] no se pudo registrar/activar el tool:', e);
        }

        return () => {
            window.removeEventListener('mouseup', safetyUp, true);
            removeOverlay();
            try {
                viewer.toolController.deactivateTool('CompleteBoxSelectTool');
                viewer.toolController.deregisterTool(tool);
            } catch (e) { /* viewer ya destruido */ }
        };
    }, [viewerReady]);

    // ═══════════════════════════════════════════════════════════
    // Isolation → Inventory Sync
    // En su propio useEffect([viewerReady]) para que se re-registre con HMR,
    // igual que el handler de SELECTION de arriba (que SÍ funciona).
    // ═══════════════════════════════════════════════════════════
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        const handleIsolationSync = (event) => {
            // GUARD: Si la isolation fue disparada por el sistema de filtros (recalculate-filters),
            // NO propagar al App.jsx. Esto rompe el feedback loop:
            //   filter→isolate→ISOLATE_EVENT→sync(0 ids)→MASTER RESET→filter(vacío)→loop
            if (window._filterIsolationInProgress) {
                console.log(`[ISOLATE_EVENT] ⏭️ Ignorado (filterIsolationInProgress=true)`);
                return;
            }
            console.log(`[ISOLATE_EVENT] Payload:`, event);
            // Pequeño retardo para asegurar que el estado interno del viewer se haya actualizado
            setTimeout(() => {
                try {
                    const allIsolatedExtIds = [];
                    const models = viewer.impl.modelQueue().getModels();
                    let hasIsolation = false;

                    console.log(`[ISOLATE_EVENT] Disparado (post-timeout). Modelos: ${models.length}`);

                for (const model of models) {
                    const isolatedIds = viewer.getIsolatedNodes(model);
                    if (!isolatedIds || isolatedIds.length === 0) continue;
                    hasIsolation = true;

                    const modelUrn = model.getData()?.urn;
                    const safeUrn = modelUrn ? String(modelUrn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';
                    const urnDict = window.rosettaToExtId?.[modelUrn] || window.rosettaToExtId?.[safeUrn];

                    if (!urnDict) {
                        console.warn(`[SYNC ⚠️] Sin Rosetta para: ${(modelUrn || '').substring(0, 60)}`);
                        console.warn(`[SYNC ⚠️]   Claves disponibles:`, Object.keys(window.rosettaToExtId || {}));
                        continue;
                    }

                    const instanceTree = model.getInstanceTree();
                    let directHits = 0, expandedHits = 0, misses = 0;

                    for (const dbId of isolatedIds) {
                        const extId = urnDict[dbId];
                        const isParent = instanceTree && instanceTree.getChildCount(dbId) > 0;

                        if (extId) {
                            allIsolatedExtIds.push(extId);
                            directHits++;
                        }

                        // SIEMPRE expandir nodos padre a sus hijos hoja.
                        // Antes esto era un "else if", lo cual impedía la expansión
                        // cuando el padre tenía extId (y rosettaToExtId mapea TODOS los nodos).
                        // La tabla de inventario solo muestra hojas (instancias), así que
                        // necesitamos los extIds de los hijos para que el filtro funcione.
                        if (isParent) {
                            instanceTree.enumNodeChildren(dbId, (childId) => {
                                if (instanceTree.getChildCount(childId) === 0) {
                                    const childExtId = urnDict[childId];
                                    if (childExtId) {
                                        allIsolatedExtIds.push(childExtId);
                                        expandedHits++;
                                    }
                                }
                            }, true);
                        }

                        if (!extId && !isParent) {
                            misses++;
                        }
                    }
                    console.log(`[SYNC] Modelo ${(modelUrn || '').substring(0, 30)}... | ids: ${isolatedIds.length} | directos: ${directHits} | expandidos: ${expandedHits} | misses: ${misses}`);
                }

                window.dispatchEvent(new CustomEvent('inventory-isolation-sync', {
                    detail: { isolatedExtIds: allIsolatedExtIds }
                }));
                console.log(`[SYNC ✅] ${allIsolatedExtIds.length} extIds despachados (hasIsolation=${hasIsolation})`);
            } catch (err) {
                console.error('[SYNC ❌] Error en isolation sync:', err);
            }
            }, 150); // 150ms timeout para estabilización del viewer
        };

        viewer.addEventListener(Autodesk.Viewing.ISOLATE_EVENT, handleIsolationSync);
        console.log('[Viewer] ✅ ISOLATE_EVENT sync listener registrado (useEffect)');

        return () => {
            viewer.removeEventListener(Autodesk.Viewing.ISOLATE_EVENT, handleIsolationSync);
        };
    }, [viewerReady]);

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
                console.log(`[Viewer-Select] Seleccionando dbIds: ${dbIds} en URN: ${urn.slice(-15)}`);
                viewer.setAggregateSelection([{ model: targetModel, ids: dbIds }]);
                
                // Si 'followCamera' no fue enviado explicitly como 'false', movemos la cámara.
                if (e.detail.followCamera !== false) {
                    viewer.fitToView(dbIds, targetModel);
                }
            } else {
                console.warn(`[Viewer-Select] Modelo no encontrado para URN: ${urn}`);
            }
        };

        const handleTandemHighlight = async (e) => {
            const { idsByUrn, simpleIds } = e.detail;
            
            // Si la selección está vacía, limpiamos
            if (Object.keys(idsByUrn).length === 0 && simpleIds.length === 0) {
                if (dataVizEngineRef.current) dataVizEngineRef.current.clearTandemStripes();
                return;
            }

            // Inicializamos el motor on-demand si no existe
            if (!dataVizEngineRef.current && viewerRef.current) {
                dataVizEngineRef.current = new DataVizEngine(viewerRef.current);
            }

            if (dataVizEngineRef.current) {
                await dataVizEngineRef.current.applyTandemStripes(idsByUrn);
            }
        };

        window.addEventListener('viewer-select', handleViewerSelect);
        window.addEventListener('budget-tandem-highlight', handleTandemHighlight);
        
        return () => {
            window.removeEventListener('viewer-select', handleViewerSelect);
            window.removeEventListener('budget-tandem-highlight', handleTandemHighlight);
        };
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
    const loadModelInner = async (model) => {
        const viewer = viewerRef.current;
        if (!viewer) return;
        // Guard anti-duplicado: descarta si ya está cargado O si hay una carga EN CURSO
        // del mismo URN. loadedModelsRef se setea recién al TERMINAR la carga async, así
        // que dos efectos podían cargar el mismo modelo a la vez → geometría duplicada.
        if (!model?.urn || loadedModelsRef.current[model.urn] || loadingUrnsRef.current.has(model.urn)) return;
        loadingUrnsRef.current.add(model.urn);

        try {
        return await new Promise((resolve, reject) => {
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

                        const extractedViews = viewables.map(v => {
                            const guids = [v.guid()];
                            if (v.children) {
                                v.children.forEach(child => {
                                    if (child.guid) guids.push(child.guid());
                                    if (child.children) {
                                        child.children.forEach(grandchild => {
                                            if (grandchild.guid) guids.push(grandchild.guid());
                                        });
                                    }
                                });
                            }
                            return { guid: v.guid(), allGuids: guids, name: v.name() };
                        });
                        console.log('[Viewer] All Found Geometries:', allGeometries.map(v => `${v.name()} (${v.data.role})`));
                        console.log('[Viewer] Filtered 3D Viewables:', extractedViews);

                        if (onViewablesLoaded) {
                            onViewablesLoaded({ urn: model.urn, views: extractedViews });
                        }

                        // Determine which view to load
                        let viewable = null;
                        let targetLogicalViewNode = null;
                        // Usamos el ref para overrides en runtime, y model.defaultViewGuid como respaldo persistido
                        const targetGuid = activeViewableGuidsRef.current[model.urn] || model.defaultViewGuid;

                        if (targetGuid) {
                            const node = doc.getRoot().findByGuid(targetGuid);
                            if (node) {
                                targetLogicalViewNode = node;
                                // VALIDACIÓN PREVIA: loadDocumentNode SOLO acepta nodos type=geometry.
                                // Si el GUID apunta a un sub-recurso (type=resource, role=graphics),
                                // lo escalamos al padre geometry ANTES de intentar cargar,
                                // evitando que Autodesk muestre el diálogo de Error 13.
                                if (node.data.type === 'geometry') {
                                    viewable = node;
                                } else {
                                    let parent = node;
                                    while (parent && parent.data.type !== 'geometry' && parent.parent) {
                                        parent = parent.parent;
                                    }
                                    if (parent && parent.data.type === 'geometry') {
                                        console.log(`[Viewer] GUID ${targetGuid} es type=${node.data.type}. Escalando a Geometry Parent: ${parent.name()}`);
                                        viewable = parent;
                                    }
                                }
                            }
                        }

                        if (!viewable) {
                            viewable = doc.getRoot().getDefaultGeometry();
                            if (!viewable) {
                                viewable = viewables.find(v => v.name() && v.name().toLowerCase() === 'master') || viewables[0];
                            }
                        }

                        if (!viewable) {
                            console.error('[Viewer] No viewable geometry found for model:', model.urn);
                            resolve(null);
                            return;
                        }

                        console.log(`[Viewer] Loading view: ${viewable.name()} (${viewable.guid()}) | Target: ${targetGuid || 'Default'}`);

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
                            // 512MB quedó CHICO con los aceros (265k fragmentos): al
                            // excederse, LMV PAGINA geometría durante la navegación →
                            // objetos que aparecen/desaparecen (el "parpadeo de
                            // modelos"). 2GB mantiene la escena residente.
                            memoryLimit: 2048
                        };

                        // El DWG de sólidos de excavación se carga SIN consolidación:
                        // LMV no permite des-consolidar en caliente ("Unconsolidate is
                        // not supported with incremental consolidation"), y el material
                        // fantasma (rojo translúcido) no aplica a fragmentos consolidados.
                        // Son ~15 fragmentos → cero impacto en rendimiento.
                        const excavPattern = window.__excavModelPattern || /solid|excav|corte/i;
                        if (excavPattern.test(model.label || '')) {
                            loadOptions.useConsolidation = false;
                            console.log(`[Viewer] "${model.label}": consolidación OFF (sólidos de excavación, material dinámico).`);
                        }

                        if (baseOffsetRef.current) {
                            loadOptions.globalOffset = baseOffsetRef.current;
                        }

                        try {
                            if (viewable && viewable.data && !viewable.data.unit) viewable.data.unit = 'm';
                            if (doc.getRoot() && doc.getRoot().data && !doc.getRoot().data.unit) doc.getRoot().data.unit = 'm';
                        } catch (e) { }

                        const timeoutPromise = new Promise((_, reject) => {
                            setTimeout(() => reject(new Error('Model load timeout triggered')), 120000);
                        });

                        let viewableToLoad = viewable;
                        let loadedModel = null;
                        
                        try {
                            console.log(`[Viewer] Attempting loadDocumentNode: type=${viewableToLoad.data.type}, role=${viewableToLoad.data.role || 'N/A'}`);
                            loadedModel = await Promise.race([
                                viewer.loadDocumentNode(doc, viewableToLoad, loadOptions),
                                timeoutPromise
                            ]);
                        } catch (err) {
                            // Error 13 = Nodo lógico sin geometría descargable. Fallback a Geometry Parent.
                            console.warn(`[Viewer] Direct load failed (Error ${err}). Falling back to Geometry Parent.`);
                            let fallbackNode = targetLogicalViewNode || viewableToLoad;
                            while (fallbackNode && fallbackNode.data.type !== 'geometry' && fallbackNode.parent) {
                                fallbackNode = fallbackNode.parent;
                            }
                            if (fallbackNode && fallbackNode.data.type === 'geometry') {
                                console.log(`[Viewer] Fallback loading Geometry Master: ${fallbackNode.name()}`);
                                viewableToLoad = fallbackNode;
                                loadedModel = await Promise.race([
                                    viewer.loadDocumentNode(doc, viewableToLoad, loadOptions),
                                    timeoutPromise
                                ]);
                            } else {
                                console.error('[Viewer] Exhausted fallback options. Could not find Geometry.');
                            }
                        }

                        // Registrar el GUID de la vista cargada para evitar loops de recarga
                        if (loadedModel) {
                            loadedViewGuidsRef.current[model.urn] = targetGuid || viewableToLoad.guid();
                        }

                        loadedModelsRef.current[model.urn] = loadedModel;

                        if (loadedModel) {
                            const modelData = loadedModel.getData();
                            if (!baseOffsetRef.current && modelData && modelData.globalOffset) {
                                baseOffsetRef.current = modelData.globalOffset;
                                console.log('[Viewer] Established Base Global Offset:', baseOffsetRef.current);
                            }

                            // REGISTRO VIVO: fuente autoritativa de "qué está cargado y con qué
                            // vista" para visores embebidos (4D LOB, AR…). El URN y el GUID de la
                            // vista efectivamente cargada los conoce SOLO este loader; re-derivarlos
                            // desde el Model con getData() es frágil. Se limpia al descargar/desmontar.
                            window.__viewerLiveModels = window.__viewerLiveModels || {};
                            window.__viewerLiveModels[model.urn] = {
                                urn: String(model.urn).replace(/^urn:/i, ''),
                                name: model.label || model.name || null,
                                // GUID del nodo de GEOMETRÍA que realmente se renderizó
                                // (ya escalado/fallback). NO el targetGuid lógico: para DWG
                                // ese apunta a una vista 2D/lógica que no renderiza en el 4D.
                                viewGuid: (viewableToLoad && viewableToLoad.guid && viewableToLoad.guid()) || targetGuid || null,
                            };
                        }

                        // Matrix Alignment Check
                        if (window.THREE && viewable.placementTransform) {
                            const matrix = new window.THREE.Matrix4().fromArray(viewable.placementTransform);
                            const elements = matrix.elements;
                            const isIdentity = elements[0] === 1 && elements[5] === 1 && elements[10] === 1 && elements[12] === 0 && elements[13] === 0 && elements[14] === 0;

                            if (!isIdentity) {
                                loadedModel.setModelTransform(matrix);
                                // Guardar para re-aplicar tras showModel (LMV la pierde al ocultar/mostrar)
                                modelTransformsRef.current[model.urn] = matrix;
                            }
                        }


                        if (loadedModel) {
                            const shouldHide = hiddenModelUrnsRef.current.some(u => normalizeUrn(u) === normalizeUrn(model.urn));
                            try {
                                if (shouldHide) {
                                    viewer.hideModel(loadedModel.id);
                                } else {
                                    viewer.showModel(loadedModel.id);
                                }
                            } catch (e) {
                                console.error('[Viewer] Error setting initial visibility:', e);
                            }

                            handleModelLoaded({ model: loadedModel });

                            // Solo hacer fitToView si NO hay vista específica seleccionada
                            // (para no destruir la cámara/section box de la vista elegida)
                            if (!targetGuid) {
                                viewer.fitToView(null, loadedModel);
                            }
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
        } finally {
            loadingUrnsRef.current.delete(model.urn);
        }
    };

    // COLA GLOBAL DE CARGA: varios efectos pueden pedir cargas "secuenciales"
    // a la vez (montaje inicial + cambio de props) → dos cadenas CONCURRENTES.
    // Si un modelo arrancaba antes de que el primero estableciera el
    // baseOffset, cargaba con SU propio offset → modelo descolocado hasta el
    // siguiente refresh. Encadenar TODO en una sola cola lo hace determinista.
    const loadModelSequentially = (model) => {
        const next = loadQueueRef.current.then(() => loadModelInner(model));
        loadQueueRef.current = next.catch(() => { /* la cola sigue ante errores */ });
        return next;
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
            if (!trackingPinsVisible) {
                // Ojo (mostrar/ocultar) apagado: limpiar marcadores sin perder data
            } else if (trackingTab === 'avance') {
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

    }, [viewerReady, trackingTab, trackingData, trackingPinsVisible, onTrackingPinClick]);

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

                        // Both tracks keep their CSV order (KM 0 starts at the same end)

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

                            markers.push({ x, y, z, label, station, dx, dy, dz, tag });
                        }
                    });
                    
                    // Inject actual Workfronts state
                    ext.setWorkfronts(workfronts);
                    ext.setMarkers(markers);
                    ext.toggleVisibility(true);
                    // Store markers for StationTracker
                    setStationTrackerMarkers(markers);
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

        Object.entries(activeViewableGuids).forEach(async ([urn, targetGuid]) => {
            const loadedModel = loadedModelsRef.current[urn];
            if (!loadedModel) return;

            // ANTI-LOOP: Solo recargar si el GUID realmente cambió
            const currentGuid = loadedViewGuidsRef.current[urn];
            if (currentGuid === targetGuid) {
                return; // Ya estamos en la vista correcta
            }

            console.log(`[Viewer] Switching view for ${urn}: ${currentGuid} → ${targetGuid}`);

            viewer.unloadModel(loadedModel);
            delete loadedModelsRef.current[urn];
            delete loadedViewGuidsRef.current[urn];

            const modelConfig = models.find(m => normalizeUrn(m.urn) === normalizeUrn(urn));
            if (modelConfig) {
                await loadModelSequentially(modelConfig);
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
            '#7e9bbd',
            '#F97316',
            '#10B981',
            '#F43F5E',
            '#A855F7',
            '#5f7fa3',
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
            // (los tintes por FUENTE los restaura el choke-point dentro de
            // cada clearThemingColors; los colores por propiedad se aplican
            // después por dbId y ganan sobre el tinte donde corresponde)
            viewer.clearSelection();

            // If no filters are active, show all (clear isolation) and exit
            // We use 'isFiltering' flag if available, otherwise fallback to checking dbIds length (legacy behavior)
            const isFiltering = detail.isFiltering !== undefined ? detail.isFiltering : (detail.dbIds && detail.dbIds.length > 0);

            // Live Link: al limpiar filtros, Revit también borra sus colores
            if (!isFiltering) {
                window.dispatchEvent(new CustomEvent('viewer-colors-applied', { detail: { groups: [] } }));
            }

            if (!isFiltering) {
                viewer.setGhosting(true);
                // viewer.showAll(); 
                viewer.impl.visibilityManager.isolate([]); // Clear isolation

                // Force update to remove colors/ghosting immediately
                viewer.impl.invalidate(true, true, true);
                viewer.impl.sceneUpdated(true);
                window.__applyViewerVisualQuality?.();
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
                if (hiddenModelUrnsRef.current.some(u => normalizeUrn(u) === normalizeUrn(urn))) return;

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
                // 0.6 (antes 0.82): conserva el relieve del terreno al colorear —
                // el theming reemplaza el color YA ILUMINADO; alfa alto lo aplana.
                const FILTER_COLOR_ALPHA = 0.6;
                // Live Link: acumular los grupos de color aplicados para publicarlos
                // a Revit (mismo pintado, allá vía OverrideGraphicSettings).
                const linkColorGroups = [];
                for (let index = 0; index < (detail.groups || []).length; index++) {
                    const group = detail.groups[index];
                    let color;
                    if (group.color) {
                        color = new window.THREE.Color(group.color);
                    } else {
                        color = palette[index % palette.length];
                    }

                    const vector = new window.THREE.Vector4(color.r, color.g, color.b, FILTER_COLOR_ALPHA);

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

                    if (itemsByModel.size > 0) {
                        linkColorGroups.push({
                            color: '#' + color.getHexString(),
                            entries: Array.from(itemsByModel.entries()).map(([m, mids]) => ({ model: m, dbIds: mids })),
                        });
                    }

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
                window.__applyViewerVisualQuality?.();

                // Live Link: publicar el estado de colores (Revit los replica)
                window.dispatchEvent(new CustomEvent('viewer-colors-applied', { detail: { groups: linkColorGroups } }));
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

        const docMat = spriteStylesRef.current.docMat;
        const redMat = spriteStylesRef.current.redMat;
        const alertGeom = spriteStylesRef.current.alertGeom || new window.THREE.SphereGeometry(1, 16, 16);

        const currentMeshes = spriteMeshesRef.current;
        const allItems = [
            ...(sprites || []).map(s => ({ ...s, type: 'alert' })),
            ...(docPins || []).map(d => ({ ...d, type: 'doc' }))
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
            if (!currentMeshes[item.id]) {
                const isDoc = item.type === 'doc';
                let mesh;

                if (isDoc) {
                    // Sprite for Docs
                    mesh = new window.THREE.Sprite(docMat);
                    // Scale Sprite
                    const s = pinSize * 2.5;
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

        const toRemove = Object.entries(loaded)
            .filter(([urn]) => !targetUrns.some(t => normalizeUrn(t) === normalizeUrn(urn)));

        const unloadOne = (urn, model) => {
            console.log('[Viewer] Unloading removed model:', urn);

            // If this is the primary (first-loaded) model, unloadModel alone
            // won't clear its geometry. We need unloadCurrentModel for full cleanup.
            if (viewer.model === model) {
                try {
                    viewer.impl.unloadCurrentModel();
                    console.log('[Viewer] Primary model unloaded via impl.unloadCurrentModel()');
                } catch (e) {
                    console.warn('[Viewer] unloadCurrentModel fallback:', e);
                    viewer.unloadModel(model);
                }
            } else {
                viewer.unloadModel(model);
            }

            delete loadedModelsRef.current[urn];
            delete loadedViewGuidsRef.current[urn];
            delete modelTransformsRef.current[urn];
            if (window.__viewerLiveModels) delete window.__viewerLiveModels[urn];

            // Clean Rosetta maps for the removed model
            if (window.rosettaToDbId) delete window.rosettaToDbId[urn];
            if (window.rosettaToExtId) delete window.rosettaToExtId[urn];

            // Remove sheets for this model
            if (sheetsMapRef.current[urn]) {
                delete sheetsMapRef.current[urn];
                const allSheets = Object.values(sheetsMapRef.current).flat();
                onSheetsLoaded?.(allSheets);
            }
        };

        // INTERCAMBIO PAUSADO (fix "pantalla negra" del update masivo):
        // antes se descargaban TODOS los modelos viejos de golpe, síncrono, mientras
        // arrancaban las cargas nuevas. Con 2+ modelos SVF2 el pico de VRAM reseteaba
        // el driver → contexto WebGL perdido → canvas negro + banner de recarga.
        // Ahora: (1) se esperan las cargas en vuelo, (2) se descarga de a UNO con un
        // respiro entre cada uno, (3) recién ahí se cargan los nuevos en secuencia.
        const gen = ++swapGenRef.current;
        const swapAll = async () => {
            try { await loadQueueRef.current; } catch { /* la cola sigue ante errores */ }
            if (swapGenRef.current !== gen) return; // llegó un cambio de modelos más nuevo

            for (const [urn, model] of toRemove) {
                if (swapGenRef.current !== gen) return;
                try { unloadOne(urn, model); } catch (e) { console.warn('[Viewer] unload error:', e); }
                // Respiro para que el driver libere VRAM antes del siguiente unload/load
                await new Promise(r => setTimeout(r, 120));
            }

            // Load models sequentially to ensure race conditions don't mess up the globalOffset
            for (const model of models) {
                if (swapGenRef.current !== gen) return;
                await loadModelSequentially(model);
            }
        };

        swapAll();
    }, [models, viewerReady]);

    // Handle Model Visibility
    // Handle Model Visibility
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        console.log('[Viewer] Updating visibility. Hidden URNs:', hiddenModelUrns);
        const allLoaded = Object.keys(loadedModelsRef.current);
        console.log('[Viewer] Loaded Models URNs:', allLoaded);

        // CÁMARA QUIRÚRGICA: si la escena quedó vacía (se ocultó el último modelo),
        // LMV trata el próximo showModel como "primer modelo" y RESETEA la cámara a
        // la vista por defecto (encuadre total → "aparece en otro lugar"). La
        // geometría/georreferenciación NO se mueve — es solo el encuadre. Se captura
        // la cámara ANTES del toggle y se restaura DESPUÉS. No toca offsets ni matrices.
        const nav = viewer.navigation;
        const savedCam = (() => {
            try {
                return {
                    pos: nav.getPosition().clone(),
                    target: nav.getTarget().clone(),
                    up: nav.getCameraUpVector().clone(),
                };
            } catch { return null; }
        })();
        let shownAny = false;

        // Pre-normalize hidden list once for O(1) lookups
        const hiddenNormSet = new Set(hiddenModelUrns.map(u => normalizeUrn(u)));

        Object.entries(loadedModelsRef.current).forEach(([urn, model]) => {
            if (!model) return;
            const shouldHide = hiddenNormSet.has(normalizeUrn(urn));

            console.log(`[Viewer] Processing visibility for ${urn} (ID: ${model.id}): Hide? ${shouldHide}`);

            try {
                if (shouldHide) {
                    viewer.hideModel(model.id);
                } else {
                    viewer.showModel(model.id);
                    shownAny = true;
                    // LMV pierde el setModelTransform dinámico en el ciclo hide→show.
                    // Re-aplicar EXACTAMENTE la matriz guardada (la misma instancia
                    // aplicada al cargar — no se recalcula nada de georreferenciación).
                    const savedMatrix = modelTransformsRef.current[urn];
                    if (savedMatrix && model.setModelTransform) {
                        try {
                            model.setModelTransform(savedMatrix);
                        } catch (te) { console.warn('[Viewer] No se pudo re-aplicar transform:', te); }
                    }
                }
            } catch (e) {
                console.error(`[Viewer] Error toggling visibility for ${urn}:`, e);
            }
        });

        // Restaurar la cámara del usuario tras mostrar (LMV puede re-encuadrar en
        // el frame siguiente, por eso el doble intento: rAF + colchón de 120 ms).
        if (shownAny && savedCam) {
            const restore = () => {
                try {
                    nav.setView(savedCam.pos, savedCam.target);
                    nav.setCameraUpVector(savedCam.up);
                    viewer.impl.invalidate(true, true, true);
                } catch { /* el visor pudo desmontarse */ }
            };
            requestAnimationFrame(restore);
            setTimeout(restore, 120);
        } else if (shownAny) {
            viewer.impl.invalidate(true, true, true);
        }
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
                        return !hiddenModelUrns.some(u => normalizeUrn(u) === normalizeUrn(pin.modelUrn));
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

            // FUGA CORREGIDA: este efecto corre en cada cambio de pins/modelos y
            // ANTES quitaba el handler NUEVO (nunca registrado) → los viejos se
            // ACUMULABAN (decenas de listeners tras una sesión: memoria + eventos
            // duplicados). Ahora removemos el ÚLTIMO registrado y limpiamos al
            // desmontar/re-ejecutar.
            const prev = pushPinListenerRef.current;
            if (prev) {
                prev.events.forEach(evt => {
                    try { viewer.removeEventListener(evt, prev.handler); } catch { /* noop */ }
                    try { prev.manager?.removeEventListener?.(evt, prev.handler); } catch { /* noop */ }
                });
            }

            // 1. Listen on Viewer (Global)
            uniqueEvents.forEach(evt => viewer.addEventListener(evt, handlePinSelect));

            // 2. Listen on PushPinManager (Specific - often required for newer versions)
            if (extension.pushPinManager?.addEventListener) {
                uniqueEvents.forEach(evt => extension.pushPinManager.addEventListener(evt, handlePinSelect));
            }
            pushPinListenerRef.current = { events: uniqueEvents, handler: handlePinSelect, manager: extension.pushPinManager || null };

        }).catch(err => {
            console.error('[Viewer] Failed to load PushPin extension:', err);
        });

        return () => {
            const reg = pushPinListenerRef.current;
            if (reg) {
                reg.events.forEach(evt => {
                    try { viewer.removeEventListener(evt, reg.handler); } catch { /* noop */ }
                    try { reg.manager?.removeEventListener?.(evt, reg.handler); } catch { /* noop */ }
                });
                pushPinListenerRef.current = null;
            }
        };
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

    // ====== EXPORT PDF — Ficha Técnica Profesional con Vista 3D + Leyenda ======
    const handleExportPDF = () => {
        const viewer = viewerRef.current;
        if (!viewer) return;

        const PALETTE = [
            '#7e9bbd', '#F97316', '#10B981', '#F43F5E', '#A855F7', '#5f7fa3', '#EAB308',
            '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6', '#84CC16', '#F59E0B'
        ];

        // --- Natural sort helper: "FASE 02" < "FASE 10", "VC-1" < "VC-12" ---
        const naturalCompare = (a, b) => {
            const ax = String(a).split(/(\d+)/);
            const bx = String(b).split(/(\d+)/);
            for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
                const ai = ax[i] || '', bi = bx[i] || '';
                const an = parseInt(ai, 10), bn = parseInt(bi, 10);
                if (!isNaN(an) && !isNaN(bn)) {
                    if (an !== bn) return an - bn;
                } else {
                    const cmp = ai.localeCompare(bi, undefined, { sensitivity: 'base' });
                    if (cmp !== 0) return cmp;
                }
            }
            return 0;
        };

        // 1. Recopilar información de la leyenda activa ANTES de la captura
        const themeConfig = window._lastThemeEventConfig;
        const buckets = window._lastCalculatedBuckets;
        const customColors = window._customValueColors || {};

        let legendItems = [];
        let legendTitle = '';

        // --- Helper: Parsear volumen de un string como "4.520 m^3" o "4.520" ---
        const parseVolume = (raw) => {
            if (raw === null || raw === undefined || raw === '') return 0;
            const cleaned = String(raw).replace(/[^0-9.,\-]/g, '').replace(',', '.');
            const val = parseFloat(cleaned);
            return isNaN(val) ? 0 : val;
        };

        // --- Construir reverse lookup: viewerDbId → extId (por modelo/URN) ---
        const viewerDbIdToExtId = {};
        if (window.rosettaToDbId) {
            Object.entries(window.rosettaToDbId).forEach(([urn, mapping]) => {
                Object.entries(mapping).forEach(([extId, viewerDbId]) => {
                    const key = `${urn}::${viewerDbId}`;
                    viewerDbIdToExtId[key] = extId;
                });
            });
        }

        // --- Construir lookup rápido: extId → inventory row ---
        const inventoryByExtId = {};
        if (window.postgresInventory) {
            window.postgresInventory.forEach(row => {
                if (row.dbId) inventoryByExtId[row.dbId] = row;
            });
        }

        // --- Función: calcular Σ Dynamo_Volumen para un conjunto de dbIds del bucket ---
        const computeVolumeForDbIds = (dbIds) => {
            let sum = 0;
            if (!dbIds || !dbIds.length) return sum;
            dbIds.forEach(({ id, modelUrn }) => {
                // Buscar extId via reverse rosetta
                const key = `${modelUrn}::${id}`;
                const extId = viewerDbIdToExtId[key];
                if (extId && inventoryByExtId[extId]) {
                    sum += parseVolume(inventoryByExtId[extId]['Dynamo_Volumen']);
                }
            });
            return sum;
        };

        if (themeConfig && themeConfig.active && buckets && buckets[themeConfig.propId]) {
            const bucket = buckets[themeConfig.propId];
            legendTitle = bucket.meta?.name || themeConfig.propId.split('::').pop() || themeConfig.propId;

            const activeValues = (themeConfig.values && themeConfig.values.length > 0)
                ? themeConfig.values
                : bucket.values.map(v => v.value);

            activeValues.forEach((val) => {
                const originalIndex = bucket.values.findIndex(v => v.value === val);
                const entry = bucket.values[originalIndex];
                if (originalIndex !== -1 && entry) {
                    const overrideKey = `${themeConfig.propId}::${val}`;
                    const color = customColors[overrideKey] || PALETTE[originalIndex % PALETTE.length];
                    const volume = computeVolumeForDbIds(entry.dbIds);
                    legendItems.push({ value: val, color, count: entry.count, volume });
                }
            });

            // Ordenar leyenda de forma natural (FASE 01, FASE 02, ... FASE 10)
            legendItems.sort((a, b) => naturalCompare(a.value, b.value));
        }

        // 2. Captura de alta resolución preservando proporciones
        const scaleFactor = 2;
        const srcW = viewer.container.clientWidth;
        const srcH = viewer.container.clientHeight;
        const renderWidth = srcW * scaleFactor;
        const renderHeight = srcH * scaleFactor;
        const srcAspect = srcW / srcH; // Aspect ratio original del visor

        viewer.getScreenShot(renderWidth, renderHeight, async (blobUrl) => {
            try {
                const { jsPDF } = await import('jspdf');

                // Configuración de página — Landscape A3
                const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
                const pageW = pdf.internal.pageSize.getWidth();  // ~420mm
                const pageH = pdf.internal.pageSize.getHeight(); // ~297mm

                // ── COLORES DEL TEMA MINIMALISTA ──
                const C = {
                    bg:        [255, 255, 255],  // Fondo blanco
                    headerBg:  [245, 247, 250],  // Header gris muy claro
                    accent:    [ 41, 98, 255],    // Azul profesional
                    textDark:  [ 30,  30,  35],   // Texto principal
                    textMid:   [100, 105, 115],   // Texto secundario
                    textLight: [160, 165, 175],   // Texto sutil
                    border:    [215, 220, 228],   // Bordes suaves
                    legendBg:  [250, 251, 253],   // Fondo leyenda
                };

                // ── METADATOS ──
                const now = new Date();
                const projectTitle = document.querySelector('.breadcrumb-project')?.textContent
                    || document.querySelector('.breadcrumb-view')?.textContent
                    || 'Proyecto';
                const viewName = document.querySelector('.breadcrumb-view')?.textContent || '';
                const dateStr = now.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });
                const timeStr = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

                // ══════════════════════════════════════════════════
                //  FONDO BLANCO
                // ══════════════════════════════════════════════════
                pdf.setFillColor(...C.bg);
                pdf.rect(0, 0, pageW, pageH, 'F');

                // ══════════════════════════════════════════════════
                //  HEADER — Franja superior limpia
                // ══════════════════════════════════════════════════
                const headerH = 22;
                pdf.setFillColor(...C.headerBg);
                pdf.rect(0, 0, pageW, headerH, 'F');
                // Línea de acento inferior (delgada, azul)
                pdf.setFillColor(...C.accent);
                pdf.rect(0, headerH, pageW, 0.6, 'F');

                // Título del proyecto (izquierda)
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(13);
                pdf.setTextColor(...C.textDark);
                pdf.text(projectTitle.toUpperCase(), 12, 10);

                // Sub-título: vista + parámetro de leyenda (si existe)
                if (viewName || legendTitle) {
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(9);
                    pdf.setTextColor(...C.textMid);
                    const sub = [viewName, legendTitle ? `Filtro: ${legendTitle}` : ''].filter(Boolean).join('  ·  ');
                    pdf.text(sub, 12, 16);
                }

                // Fecha y hora (derecha)
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(8);
                pdf.setTextColor(...C.textLight);
                pdf.text(`Generado: ${dateStr}  —  ${timeStr}`, pageW - 12, 10, { align: 'right' });

                // Logo/marca (derecha, segunda línea)
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(8);
                pdf.setTextColor(...C.accent);
                pdf.text('ALEPHIA', pageW - 12, 16, { align: 'right' });

                // ══════════════════════════════════════════════════
                //  LAYOUT PRINCIPAL
                // ══════════════════════════════════════════════════
                const marginX = 12;
                const bodyTop = headerH + 4;
                const footerZone = 10;
                const bodyBottom = pageH - footerZone - 4;
                const bodyH = bodyBottom - bodyTop;
                const hasLegend = legendItems.length > 0;
                const totalVolume = hasLegend ? legendItems.reduce((s, i) => s + i.volume, 0) : 0;

                // Sidebar derecho más ancho para incluir todo el contenido
                const sideW = hasLegend ? 120 : 0;
                const gap = hasLegend ? 6 : 0;

                // ── Helper para parsear color hex ──
                const hexRGB = (hex) => {
                    const h = hex.replace('#', '');
                    return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
                };

                // ══════════════════════════════════════════════════
                //  IMAGEN 3D — Área izquierda (aspect ratio preservado)
                // ══════════════════════════════════════════════════
                const statsStripH = hasLegend ? 28 : 0; // Franja de estadísticas bajo la imagen
                const imgAreaW = pageW - marginX * 2 - sideW - gap;
                const imgAreaH = bodyH - statsStripH;

                let imgW, imgH;
                const fitByWidth = imgAreaW / srcAspect;
                if (fitByWidth <= imgAreaH) {
                    imgW = imgAreaW;
                    imgH = fitByWidth;
                } else {
                    imgH = imgAreaH;
                    imgW = imgAreaH * srcAspect;
                }
                const imgX = marginX + (imgAreaW - imgW) / 2;
                const imgY = bodyTop + (imgAreaH - imgH) / 2;

                // Fondo gris claro detrás de la imagen (para que no haya blanco vacío)
                pdf.setFillColor(248, 249, 251);
                pdf.roundedRect(marginX, bodyTop, imgAreaW, imgAreaH, 2, 2, 'F');
                pdf.setDrawColor(...C.border);
                pdf.setLineWidth(0.2);
                pdf.roundedRect(marginX, bodyTop, imgAreaW, imgAreaH, 2, 2, 'S');

                // Etiqueta "VISTA 3D" esquina superior izquierda de la imagen
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(7);
                pdf.setTextColor(...C.textLight);
                pdf.text('VISTA 3D', marginX + 4, bodyTop + 5);

                pdf.addImage(blobUrl, 'PNG', imgX, imgY, imgW, imgH);

                // ══════════════════════════════════════════════════
                //  FRANJA DE ESTADÍSTICAS — bajo la imagen
                // ══════════════════════════════════════════════════
                if (hasLegend && statsStripH > 0) {
                    const ssY = bodyTop + imgAreaH + 3;
                    const ssW = imgAreaW;
                    const colW = ssW / legendItems.length;

                    // Fondo
                    pdf.setFillColor(...C.legendBg);
                    pdf.roundedRect(marginX, ssY, ssW, statsStripH - 3, 2, 2, 'F');
                    pdf.setDrawColor(...C.border);
                    pdf.setLineWidth(0.15);
                    pdf.roundedRect(marginX, ssY, ssW, statsStripH - 3, 2, 2, 'S');

                    // Mini tarjetas de cada valor con porcentaje por volumen
                    legendItems.forEach((item, i) => {
                        const cx = marginX + i * colW;
                        const pct = totalVolume > 0 ? ((item.volume / totalVolume) * 100).toFixed(1) : '0';
                        const [cr, cg, cb] = hexRGB(item.color);

                        // Barra de color indicadora (izquierda de cada celda)
                        pdf.setFillColor(cr, cg, cb);
                        pdf.rect(cx + 3, ssY + 3, 2, statsStripH - 9, 'F');

                        // Nombre
                        pdf.setFont('helvetica', 'bold');
                        pdf.setFontSize(7.5);
                        pdf.setTextColor(...C.textDark);
                        const shortVal = String(item.value).length > 12 ? String(item.value).substring(0, 10) + '…' : String(item.value);
                        pdf.text(shortVal, cx + 8, ssY + 8);

                        // Porcentaje grande (basado en volumen)
                        pdf.setFont('helvetica', 'bold');
                        pdf.setFontSize(11);
                        pdf.setTextColor(cr, cg, cb);
                        pdf.text(`${pct}%`, cx + 8, ssY + 17);

                        // Volumen en m³
                        pdf.setFont('helvetica', 'normal');
                        pdf.setFontSize(6.5);
                        pdf.setTextColor(...C.textLight);
                        pdf.text(`${item.volume.toFixed(2)} m³`, cx + 8, ssY + 22);

                        // Separador vertical
                        if (i < legendItems.length - 1) {
                            pdf.setDrawColor(...C.border);
                            pdf.setLineWidth(0.1);
                            pdf.line(cx + colW, ssY + 3, cx + colW, ssY + statsStripH - 6);
                        }
                    });
                }

                // ══════════════════════════════════════════════════
                //  SIDEBAR DERECHO — Leyenda + Gráfico + Info
                // ══════════════════════════════════════════════════
                if (hasLegend) {
                    const sx = pageW - marginX - sideW;
                    const sy = bodyTop;
                    const sw = sideW;
                    const sideH = bodyH;

                    // ─── SECCIÓN 1: LEYENDA ───
                    const legendItemH = 10;
                    const legendHeaderH = 24;
                    const legendContentH = legendHeaderH + legendItems.length * legendItemH + 8;
                    const s1h = Math.min(legendContentH, sideH * 0.38);

                    pdf.setFillColor(...C.legendBg);
                    pdf.roundedRect(sx, sy, sw, s1h, 2, 2, 'F');
                    pdf.setDrawColor(...C.border);
                    pdf.setLineWidth(0.2);
                    pdf.roundedRect(sx, sy, sw, s1h, 2, 2, 'S');
                    pdf.setFillColor(...C.accent);
                    pdf.rect(sx + 0.5, sy + 0.5, sw - 1, 1.2, 'F');

                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(9);
                    pdf.setTextColor(...C.textDark);
                    pdf.text('LEYENDA', sx + sw / 2, sy + 9, { align: 'center' });

                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(7.5);
                    pdf.setTextColor(...C.accent);
                    pdf.text(legendTitle, sx + sw / 2, sy + 16, { align: 'center' });

                    pdf.setDrawColor(...C.border);
                    pdf.setLineWidth(0.1);
                    pdf.line(sx + 6, sy + 20, sx + sw - 6, sy + 20);

                    let curY = sy + legendHeaderH;
                    legendItems.forEach((item) => {
                        if (curY + legendItemH > sy + s1h - 4) return;
                        const [cr, cg, cb] = hexRGB(item.color);
                        const pct = totalVolume > 0 ? ((item.volume / totalVolume) * 100).toFixed(1) : '0';

                        pdf.setFillColor(cr, cg, cb);
                        pdf.roundedRect(sx + 6, curY - 2, 5, 5, 1, 1, 'F');

                        pdf.setFont('helvetica', 'normal');
                        pdf.setFontSize(8);
                        pdf.setTextColor(...C.textDark);
                        pdf.text(String(item.value), sx + 14, curY + 1.5);

                        pdf.setFontSize(7);
                        pdf.setTextColor(...C.textMid);
                        pdf.text(`${item.volume.toFixed(2)} m³`, sx + sw - 22, curY + 1.5, { align: 'right' });

                        pdf.setTextColor(...C.textLight);
                        pdf.text(`${pct}%`, sx + sw - 6, curY + 1.5, { align: 'right' });

                        curY += legendItemH;
                    });
                    // Total
                    pdf.setDrawColor(...C.border);
                    pdf.setLineWidth(0.1);
                    const totalY = Math.min(curY + 1, sy + s1h - 8);
                    pdf.line(sx + 6, totalY, sx + sw - 6, totalY);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(8);
                    pdf.setTextColor(...C.textDark);
                    pdf.text('Total', sx + 14, totalY + 5);
                    pdf.text(`${totalVolume.toFixed(2)} m³`, sx + sw - 22, totalY + 5, { align: 'right' });
                    pdf.text('100%', sx + sw - 6, totalY + 5, { align: 'right' });

                    // ─── SECCIÓN 2: GRÁFICO DE BARRAS HORIZONTALES ───
                    const s2y = sy + s1h + 4;
                    const s2h = Math.min(sideH * 0.35, 20 + legendItems.length * 14);

                    pdf.setFillColor(...C.legendBg);
                    pdf.roundedRect(sx, s2y, sw, s2h, 2, 2, 'F');
                    pdf.setDrawColor(...C.border);
                    pdf.setLineWidth(0.2);
                    pdf.roundedRect(sx, s2y, sw, s2h, 2, 2, 'S');
                    pdf.setFillColor(...C.accent);
                    pdf.rect(sx + 0.5, s2y + 0.5, sw - 1, 1.2, 'F');

                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(9);
                    pdf.setTextColor(...C.textDark);
                    pdf.text('DISTRIBUCIÓN', sx + sw / 2, s2y + 9, { align: 'center' });

                    const barStartY = s2y + 16;
                    const barMaxW = sw - 40;
                    const barH = 6;
                    const barGap = legendItems.length <= 6 ? 14 : 10;
                    const maxVolume = Math.max(...legendItems.map(i => i.volume), 0.01);

                    legendItems.forEach((item, i) => {
                        const by = barStartY + i * barGap;
                        if (by + barH > s2y + s2h - 4) return;
                        const [cr, cg, cb] = hexRGB(item.color);
                        const bw = (item.volume / maxVolume) * barMaxW;

                        // Label
                        pdf.setFont('helvetica', 'normal');
                        pdf.setFontSize(6.5);
                        pdf.setTextColor(...C.textMid);
                        const shortLabel = String(item.value).length > 10 ? String(item.value).substring(0, 8) + '…' : String(item.value);
                        pdf.text(shortLabel, sx + 6, by + barH / 2 + 1);

                        // Bar background
                        pdf.setFillColor(235, 238, 243);
                        pdf.roundedRect(sx + 32, by, barMaxW, barH, 1.5, 1.5, 'F');

                        // Bar fill
                        if (bw > 2) {
                            pdf.setFillColor(cr, cg, cb);
                            pdf.roundedRect(sx + 32, by, bw, barH, 1.5, 1.5, 'F');
                        }

                        // Volume label (m³)
                        pdf.setFont('helvetica', 'bold');
                        pdf.setFontSize(6.5);
                        pdf.setTextColor(...C.textDark);
                        pdf.text(`${item.volume.toFixed(1)}`, sx + 33 + barMaxW + 2, by + barH / 2 + 1);
                    });

                    // ─── SECCIÓN 3: INFORMACIÓN DEL PROYECTO ───
                    const s3y = s2y + s2h + 4;
                    const s3h = Math.max(bodyBottom - s3y, 40);

                    if (s3h > 30) {
                        pdf.setFillColor(...C.legendBg);
                        pdf.roundedRect(sx, s3y, sw, s3h, 2, 2, 'F');
                        pdf.setDrawColor(...C.border);
                        pdf.setLineWidth(0.2);
                        pdf.roundedRect(sx, s3y, sw, s3h, 2, 2, 'S');
                        pdf.setFillColor(...C.accent);
                        pdf.rect(sx + 0.5, s3y + 0.5, sw - 1, 1.2, 'F');

                        pdf.setFont('helvetica', 'bold');
                        pdf.setFontSize(9);
                        pdf.setTextColor(...C.textDark);
                        pdf.text('INFORMACIÓN', sx + sw / 2, s3y + 9, { align: 'center' });

                        const infoItems = [
                            ['Proyecto', projectTitle],
                            ['Vista', viewName || '—'],
                            ['Parámetro', legendTitle || '—'],
                            ['Categorías', String(legendItems.length)],
                            ['Volumen Total', `${totalVolume.toFixed(2)} m³`],
                            ['Fecha', dateStr],
                            ['Hora', timeStr],
                        ];

                        let iy = s3y + 18;
                        infoItems.forEach(([label, val]) => {
                            if (iy + 9 > s3y + s3h - 2) return;
                            pdf.setFont('helvetica', 'normal');
                            pdf.setFontSize(7);
                            pdf.setTextColor(...C.textLight);
                            pdf.text(label, sx + 6, iy);
                            pdf.setFont('helvetica', 'bold');
                            pdf.setFontSize(7.5);
                            pdf.setTextColor(...C.textDark);
                            const dispVal = String(val).length > 22 ? String(val).substring(0, 20) + '…' : String(val);
                            pdf.text(dispVal, sx + 6, iy + 5);
                            // Separador
                            pdf.setDrawColor(235, 238, 243);
                            pdf.setLineWidth(0.1);
                            pdf.line(sx + 6, iy + 8, sx + sw - 6, iy + 8);
                            iy += 12;
                        });
                    }
                }

                // ══════════════════════════════════════════════════
                //  FOOTER
                // ══════════════════════════════════════════════════
                const footerY = pageH - 8;
                pdf.setDrawColor(...C.border);
                pdf.setLineWidth(0.15);
                pdf.line(marginX, footerY - 2, pageW - marginX, footerY - 2);

                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(6.5);
                pdf.setTextColor(...C.textLight);
                pdf.text('ALEPHIA View  ·  Inteligencia para proyectos e infraestructura', marginX, footerY + 1);
                pdf.text(`Ficha Técnica  ·  ${dateStr}`, pageW / 2, footerY + 1, { align: 'center' });
                pdf.text('Página 1 de 1', pageW - marginX, footerY + 1, { align: 'right' });

                // ══════════════════════════════════════════════════
                //  GUARDAR
                // ══════════════════════════════════════════════════
                const safeTitle = (legendTitle || 'Vista3D').replace(/[^a-zA-Z0-9_-]/g, '_');
                const fileName = `Ficha_${safeTitle}_${now.toISOString().slice(0, 10)}.pdf`;
                pdf.save(fileName);
                console.log(`[PDF] ✅ Ficha técnica exportada: ${fileName}`);

            } catch (error) {
                console.error('[PDF] ❌ Error generando PDF:', error);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = `Vista3D_${new Date().toISOString().slice(0, 10)}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
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

            {/* Station Tracker Panel (Civil Tools) */}
            <StationTracker
                isVisible={isStationTrackerOpen && showProgressives}
                onClose={() => setStationTrackerOpen(false)}
                markers={stationTrackerMarkers}
                viewerRef={viewerRef}
            />

            {/* Civil Station Tracker Panel (ACC Style) */}

            {/* Botón de Captura de Pantalla Global */}
            {viewerReady && (
                <button
                    onClick={handleTakeScreenshot}
                    title="Tomar Captura de Pantalla"
                    style={{
                        position: 'absolute',
                        top: '18px',
                        right: '70px',
                        zIndex: 100,
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(180, 180, 180, 0.7)',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'white'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(180, 180, 180, 0.7)'}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                        <circle cx="12" cy="13" r="4"></circle>
                    </svg>
                </button>
            )}

            {/* Botón de Exportar PDF con Leyenda */}
            {viewerReady && (
                <button
                    onClick={handleExportPDF}
                    title="Exportar Ficha PDF con Leyenda"
                    style={{
                        position: 'absolute',
                        top: '18px',
                        right: '106px',
                        zIndex: 100,
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(180, 180, 180, 0.7)',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#7e9bbd'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(180, 180, 180, 0.7)'}
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                </button>
            )}

        </div>
    );
};

export default Viewer;
