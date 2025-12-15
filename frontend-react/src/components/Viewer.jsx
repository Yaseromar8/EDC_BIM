import React, { useEffect, useRef, useState } from 'react';
import './viewer.css';
import { BaseExtension } from '../aps/extensions/BaseExtension';
import { LoggerExtension } from '../aps/extensions/LoggerExtension';
import { HistogramExtension } from '../aps/extensions/HistogramExtension';
import { PhasingExtension } from '../aps/extensions/PhasingExtension';

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
    selectedPinId // Add this prop
}) => {
    const viewerRef = useRef(null);
    const containerRef = useRef(null);
    const loadedModelsRef = useRef({});
    const baseOffsetRef = useRef(null);
    const basePlacementRef = useRef(null);
    const spriteViewRef = useRef(null);
    const spriteStylesRef = useRef(null);
    const spriteMeshesRef = useRef({});
    const buildPinMeshesRef = useRef({}); // New ref for Build Pins
    const sheetsMapRef = useRef({});
    const [viewerReady, setViewerReady] = useState(false);
    // ...

    const [contextMenu, setContextMenu] = useState(null);
    const longPressTimerRef = useRef(null);
    const isLongPressRef = useRef(false);

    const ghostMeshRef = useRef(null);

    // ... (existing refs)

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

        // Helper: Create Document Icon Texture
        const getDocTexture = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');

            // 1. Orange Circle Background
            ctx.beginPath();
            ctx.arc(64, 64, 60, 0, 2 * Math.PI);
            ctx.fillStyle = '#F59E0B'; // Orange
            ctx.fill();
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            // 2. White Document Icon
            ctx.fillStyle = '#ffffff';
            // Draw a simple document shape (rect)
            ctx.fillRect(44, 34, 40, 60);

            // Folded corner effect (simple lines)
            ctx.fillStyle = '#E5E7EB';
            ctx.fillRect(44, 34, 40, 10); // Header strip

            // Lines/Text
            ctx.fillStyle = '#F59E0B';
            ctx.fillRect(50, 50, 28, 4);
            ctx.fillRect(50, 60, 28, 4);
            ctx.fillRect(50, 70, 20, 4);

            const tex = new THREE.Texture(canvas);
            tex.needsUpdate = true;
            return tex;
        };

        // Create Ghost Sprite if needed
        if (!ghostMeshRef.current) {
            const size = getOptimalPinSize() * 2.5; // Slightly larger for icon

            const tex = getDocTexture();
            const mat = new THREE.SpriteMaterial({
                map: tex,
                color: 0xffffff,
                opacity: 0.7,
                transparent: true,
                depthTest: false,
                depthWrite: false
            });

            const sprite = new THREE.Sprite(mat);
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
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        const handleCanvasClick = (event) => {
            // Priority: Sprite Placement Mode
            if (placementMode) {
                const result = viewer.impl.hitTest(event.clientX, event.clientY, true);
                if (result) {
                    onPlacementComplete({
                        x: result.intersectPoint.x,
                        y: result.intersectPoint.y,
                        z: result.intersectPoint.z,
                        dbId: result.dbId
                    });
                }
                return;
            }

            // Priority: Doc Placement Mode
            if (docPlacementMode) {
                // Optimize: If we have a visible ghost, use its position directly!
                if (ghostMeshRef.current && ghostMeshRef.current.visible) {
                    const pos = ghostMeshRef.current.position;
                    console.log('[Viewer] Fast Placement via Ghost at:', pos);
                    onDocPlacementComplete({
                        x: pos.x,
                        y: pos.y,
                        z: pos.z
                    });
                    return;
                }

                // Fallback to raycast
                const result = viewer.impl.hitTest(event.clientX, event.clientY, true);
                if (result && onDocPlacementComplete) {
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
    useEffect(() => {
        const initializeViewer = () => {
            const options = {
                env: 'AutodeskProduction',
                getAccessToken: (onSuccess) => {
                    fetch('/api/token')
                        .then(res => res.json())
                        .then(data => onSuccess(data.access_token, data.expires_in));
                }
            };

            Autodesk.Viewing.Initializer(options, () => {
                Autodesk.Viewing.theExtensionManager.registerExtension('BaseExtension', BaseExtension);
                Autodesk.Viewing.theExtensionManager.registerExtension('LoggerExtension', LoggerExtension);
                Autodesk.Viewing.theExtensionManager.registerExtension('HistogramExtension', HistogramExtension);
                Autodesk.Viewing.theExtensionManager.registerExtension('PhasingExtension', PhasingExtension);
                const config = {
                    extensions: [
                        'BaseExtension',
                        'LoggerExtension',
                        'HistogramExtension',
                        'PhasingExtension',
                        'Autodesk.BIM360.Extension.PushPin' // ADDED: Enable PushPin extension
                    ]
                };
                const viewer = new Autodesk.Viewing.GuiViewer3D(containerRef.current, config);
                viewer.start();
                viewerRef.current = viewer;
                setViewerReady(true);

                // --- PERFORMANCE OPTIMIZATIONS ---
                // Crucial for heavy Infraworks models with Orthophotos
                viewer.setOptimizeNavigation(true); // Lowers quality while moving
                viewer.setQualityLevel(false, false); // Disable ambient shadows/high quality
                viewer.setGroundShadow(false);
                viewer.setGroundReflection(false);
                viewer.setGhosting(true); // Keep ghosting for filters but verify performance

                // Increase memory limit for SVF2 if applicable (internal setting)
                // viewer.impl.setFPSTarget(30);

                console.log('[Viewer] Performance mode enabled for stability.');
            });
        };

        initializeViewer();

        return () => {
            spriteViewRef.current?.clear();
            if (viewerRef.current) {
                viewerRef.current.finish();
                viewerRef.current = null;
                setViewerReady(false);
            }
        };
    }, []);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;
        const handleModelLoaded = (event) => {
            const model = event?.model || viewer?.model;
            if (!model) return;
            const props = model.allProps || [];
            // Resolve URN by comparing model object with loadedModelsRef
            let urn = model.getData()?.urn;

            // Try to find the exact URN key from our loadedModelsRef that matches this model instance
            const foundUrn = Object.keys(loadedModelsRef.current).find(key => {
                const m = loadedModelsRef.current[key];
                return m === model || m?.id === model.id;
            });

            if (foundUrn) {
                urn = foundUrn;
            }

            onModelProperties?.({ urn, props });
        };
        viewer.addEventListener('model.loaded', handleModelLoaded);
        // In case BaseExtension already populated props before we subscribed
        if (viewer?.model?.allProps?.length) {
            handleModelLoaded({ model: viewer.model });
        }
        return () => {
            viewer.removeEventListener('model.loaded', handleModelLoaded);
        };
    }, [viewerReady, onModelProperties]);

    useEffect(() => {
        if (models.length === 0) {
            onModelProperties?.([]);
            sheetsMapRef.current = {};
            onSheetsLoaded?.([]);
        }
    }, [models.length, onModelProperties, onSheetsLoaded]);

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
                            console.log('[Viewer] AEC Model Data downloaded for:', model.label || model.urn);
                        } catch (aecErr) {
                            console.warn('[Viewer] Could not download AEC Model Data.', aecErr);
                        }

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
                            // Default logic: Try 'master', then first available
                            // Infraworks often names the main view 'master'
                            viewable = viewables.find(v => v.name().toLowerCase() === 'master') || viewables[0];

                            // If still null, fallback to getAllDefault
                            if (!viewable) viewable = doc.getRoot().getDefaultGeometry();
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
                            applyRefPoint: true
                        };

                        console.log(`[Viewer] Loading model: ${model.label || model.urn}`);

                        if (baseOffsetRef.current) {
                            loadOptions.globalOffset = baseOffsetRef.current;
                        }

                        const loadedModel = await viewer.loadDocumentNode(doc, viewable, loadOptions);
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

    // --- Native Overlay Implementation (Robust & Scaled) ---
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        if (activeSheet) {
            console.log('[Viewer] Active sheet selected. Splitting view...');
            // DO NOT load document node here. We want 3D to stay.
            // viewer.loadDocumentNode(activeSheet.document, activeSheet.node);

            // Resize viewer immediately to fit 50% width
            setTimeout(() => {
                viewer.resize();
            }, 350); // Wait for CSS transition
        } else {
            // Return to 3D if we have models loaded (but maybe hidden/unloaded by 2D switch)
            if (models.length > 0) {
                console.log('[Viewer] Returning to 3D view...');
                // We re-trigger loadAll or simply ensure models are shown.
                // Since loadDocumentNode(2D) replaces the "main" view, the safest way
                // to restore the aggregated 3D view is to reload the 3D nodes.

                // Clear state temporarily to force re-mount or re-load?
                // Better: iterate models and load document nodes again.
                // Note: loadedModelsRef might need clearing if viewer unloaded them.

                // Unload current 2D model first
                if (viewer.model && viewer.model.is2d()) {
                    // 1. Unload 2D
                    // viewer.unloadModel(viewer.model); // Might cause flash, but cleaner
                }

                // 2. Load all 3D models again
                // We use the helper function logic but we need to trigger it.
                // We can't call loadAll() directly as it is inside another effect.
                // Instead, we can use a small hack or simply duplicate the load logic here
                // OR better: we assume the 'models' effect will not run again because 'models' didn't change.

                // Strategy: Explicitly call load for each model.
                const reset3D = async () => {
                    for (const model of models) {
                        // We need to force load even if loadedModelsRef has it,
                        // because the viewer might have detached it.
                        // However, let's try unloading everything first to be clean.

                        // Check if model is actually in viewer?
                        // If we are in 2D, the 3D models are likely gone from the scene.

                        // Let's clear our ref to force re-load
                        if (loadedModelsRef.current[model.urn]) {
                            // viewer.unloadModel(loadedModelsRef.current[model.urn]);
                            delete loadedModelsRef.current[model.urn];
                        }

                        // Now trigger load
                        await loadModelSequentially(model);
                    }
                };
                reset3D();
            }
        }
    }, [activeSheet]); // Only run when activeSheet changes (to null or value)

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

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;
        const navigation = viewer.getNavigation?.();
        if (!navigation) return;

        navigation.setUsePivotAlways?.(true);
        navigation.setPivotVisible?.(false);

        const hidePivotAfterDelay = () => {
            if (navigation.setPivotVisible) {
                navigation.setPivotVisible(false);
            }
        };

        const canvas = viewer.canvas || viewer.impl?.canvas || viewer.container;
        const updatePivotFromEvent = event => {
            if (!canvas) return;
            const hit = viewer.impl?.hitTest(event.clientX, event.clientY, true);
            const pivot = hit?.intersectPoint || hit?.point;
            if (pivot) {
                navigation.setPivotPoint(pivot);
                navigation.setPivotVisible?.(true);
                if (viewer._pivotTimeout) {
                    clearTimeout(viewer._pivotTimeout);
                }
                viewer._pivotTimeout = setTimeout(hidePivotAfterDelay, 1500);
            }
        };

        const handleDoubleClick = event => updatePivotFromEvent(event);
        const handleMiddleClick = event => {
            if (event.button === 1) {
                event.preventDefault();
                updatePivotFromEvent(event);
            }
        };

        canvas?.addEventListener('dblclick', handleDoubleClick, true);
        canvas?.addEventListener('mousedown', handleMiddleClick, true);
        canvas?.addEventListener('auxclick', handleMiddleClick, true);

        return () => {
            canvas?.removeEventListener('dblclick', handleDoubleClick, true);
            canvas?.removeEventListener('mousedown', handleMiddleClick, true);
            canvas?.removeEventListener('auxclick', handleMiddleClick, true);
            if (viewer._pivotTimeout) {
                clearTimeout(viewer._pivotTimeout);
                viewer._pivotTimeout = null;
            }
        };
    }, [viewerReady]);

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
        ].map(color => new THREE.Color(color));

        const handleFiltersApply = event => {
            const detail = event?.detail;

            // RESET EVERYTHING FIRST to ensure clean slate
            viewer.clearThemingColors();
            viewer.clearSelection();

            // If no filters, show all and exit
            if (!detail || !detail.dbIds || !detail.dbIds.length) {
                viewer.setGhosting(false);
                viewer.showAll();
                return;
            }

            // 1. Enable Ghosting
            viewer.setGhosting(true);

            // 2. Isolate matching items PER MODEL
            const idsByModel = new Map();
            // Pre-fill all loaded models with empty arrays to ensure we isolate (hide/ghost) non-matching models
            const loadedUrns = Object.keys(loadedModelsRef.current);
            loadedUrns.forEach(urn => idsByModel.set(urn, []));

            detail.dbIds.forEach(item => {
                if (item.modelUrn && idsByModel.has(item.modelUrn)) {
                    idsByModel.get(item.modelUrn).push(item.id);
                }
            });

            idsByModel.forEach((ids, urn) => {
                const model = loadedModelsRef.current[urn];
                if (model) {
                    if (ids.length === 0) {
                        // Critical: isolate([]) resets isolation (makes model fully visible).
                        // To ghost the ENTIRE model, we isolate a non-existent ID (e.g. -1).
                        viewer.isolate([-1], model);
                    } else {
                        viewer.isolate(ids, model);
                    }
                }
            });

            // 3. Apply Colors to matching items PER MODEL
            detail.groups?.forEach((group, index) => {
                let color;
                if (group.color) {
                    color = new THREE.Color(group.color);
                } else {
                    color = palette[index % palette.length];
                }

                const vector = new THREE.Vector4(color.r, color.g, color.b, 1);

                group.dbIds.forEach(item => {
                    const model = loadedModelsRef.current[item.modelUrn];
                    if (model) {
                        viewer.setThemingColor(item.id, vector, model);
                    }
                });
            });

            // Force redraw
            viewer.impl.invalidate(true, true, true);
        };




        window.addEventListener('filters-apply', handleFiltersApply);
        return () => window.removeEventListener('filters-apply', handleFiltersApply);
    }, [viewerReady]);

    // Handle Canvas Click for Pin Creation (Normal & Docs)
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        const handleCanvasClick = (event) => {
            // Priority: Sprite Placement Mode
            if (placementMode) {
                const result = viewer.impl.hitTest(event.clientX, event.clientY, true);
                if (result) {
                    onPlacementComplete({
                        x: result.intersectPoint.x,
                        y: result.intersectPoint.y,
                        z: result.intersectPoint.z,
                        dbId: result.dbId
                    });
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

        // Helper: Create Document Icon Texture (Duplicated for availability)
        // Ideally moved to a common helper outside
        const getDocTexture = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');

            // 1. Orange Circle Background
            ctx.beginPath();
            ctx.arc(64, 64, 60, 0, 2 * Math.PI);
            ctx.fillStyle = '#F59E0B'; // Orange
            ctx.fill();
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            // 2. White Document Icon
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(44, 34, 40, 60);

            // Folded corner
            ctx.fillStyle = '#E5E7EB';
            ctx.fillRect(44, 34, 40, 10);

            // Lines
            ctx.fillStyle = '#F59E0B';
            ctx.fillRect(50, 50, 28, 4);
            ctx.fillRect(50, 60, 28, 4);
            ctx.fillRect(50, 70, 20, 4);

            const tex = new THREE.Texture(canvas);
            tex.needsUpdate = true;
            return tex;
        };

        // 1. Doc Pin: Document Icon Sprite
        if (!spriteStylesRef.current.docMat) {
            const tex = getDocTexture();
            spriteStylesRef.current.docMat = new THREE.SpriteMaterial({
                map: tex,
                color: 0xffffff,
                depthTest: false, // Always on top
                depthWrite: false
            });
        }

        // 2. Alert Pin: Sphere (Red)
        if (!spriteStylesRef.current.redMat) {
            spriteStylesRef.current.alertGeom = new THREE.SphereGeometry(1, 16, 16);
            spriteStylesRef.current.redMat = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                depthTest: false,
                depthWrite: false
            });
        }

        // Helper: Create Dalux-style Pin Texture (Light Blue + White Border)
        const getDaluxTexture = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');

            // White Border
            ctx.beginPath();
            ctx.arc(64, 64, 50, 0, 2 * Math.PI);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            // Blue Inner Circle
            ctx.beginPath();
            ctx.arc(64, 64, 42, 0, 2 * Math.PI);
            ctx.fillStyle = '#60a5fa'; // Light Blue
            ctx.fill();

            // Optional: Inner Dot
            ctx.beginPath();
            ctx.arc(64, 64, 15, 0, 2 * Math.PI);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            const tex = new THREE.Texture(canvas);
            tex.needsUpdate = true;
            return tex;
        };

        // 3. Build Pin: Sprite (Dalux Style)
        if (!spriteStylesRef.current.blueMat) {
            const tex = getDaluxTexture();
            spriteStylesRef.current.blueMat = new THREE.SpriteMaterial({
                map: tex,
                color: 0xffffff,
                depthTest: false,
                depthWrite: false
            });
        }

        const docMat = spriteStylesRef.current.docMat;
        const redMat = spriteStylesRef.current.redMat;
        const blueMat = spriteStylesRef.current.blueMat; // Now a SpriteMaterial
        const alertGeom = spriteStylesRef.current.alertGeom || new THREE.SphereGeometry(1, 16, 16);

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
                    mesh = new THREE.Sprite(docMat);
                    // Scale Sprite
                    const s = pinSize * 2.5;
                    mesh.scale.set(s, s, 1);
                } else if (isBuild) {
                    // Sprite for Build (Dalux Style)
                    mesh = new THREE.Sprite(blueMat);
                    // Scale Sprite: Huge scale for Infraworks (often KM based)
                    // Try a very large base scale, or make it relative to model bounds if possible.
                    // For now, let's try 50x general pin size.
                    const s = pinSize * 50;
                    mesh.scale.set(s, s, 1);
                } else {
                    // Sphere for Alerts (Red)
                    mesh = new THREE.Mesh(alertGeom, redMat);
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

        // --- BUILD PIN CREATION (Official Workflow) ---
        // This takes precedence over other interactions when active
        if (buildPlacementMode) {
            const extension = viewer.getExtension('Autodesk.BIM360.Extension.PushPin');
            if (extension) {
                // console.log('[Viewer] Starting PushPin Creation Mode via Extension...');

                // 1. Activate Extension Tool
                // This handles cursor and click sequence internally
                extension.startCreateItem({
                    label: 'New Issue',
                    status: 'open',
                    type: 'issues',
                    position: { x: 0, y: 0, z: 0 } // Placeholder, user will click
                });

                // 2. Listen for Creation Event
                const handlePushPinCreated = (event) => {
                    // event.value contains: { itemData: { position, objectId, ... } }
                    const newItem = event.value?.itemData;

                    if (newItem && onBuildPinCreate) {
                        // Get Global Offset to convert Local -> Global
                        const globalOffset = viewer.model?.getData()?.globalOffset || { x: 0, y: 0, z: 0 };

                        // Convert Local (Viewer) to World (Global)
                        const worldPoint = {
                            x: newItem.position.x + globalOffset.x,
                            y: newItem.position.y + globalOffset.y,
                            z: newItem.position.z + globalOffset.z,
                            objectId: newItem.objectId,
                            viewerState: viewer.getState({ viewport: true }),
                            seedUrn: viewer.model?.getData()?.urn
                        };

                        // console.log('[Viewer] PushPin Created via Extension:', worldPoint);
                        onBuildPinCreate(worldPoint);
                    }
                };

                // The extension fires 'pushpin.created' on its manager
                if (extension.pushPinManager) {
                    extension.pushPinManager.addEventListener('pushpin.created', handlePushPinCreated);
                }

                // Cleanup function when mode ends
                return () => {
                    if (extension.pushPinManager) {
                        extension.pushPinManager.removeEventListener('pushpin.created', handlePushPinCreated);
                    }
                    extension.endCreateItem();
                };
            } else {
                console.warn('[Viewer] PushPin extension not found during creation attempt.');
            }
            return; // Exit effect if in build mode
        }


        // --- STANDARD INTERACTION (Sprites, Docs, etc) ---
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
            const pointer = new THREE.Vector3(
                (canvasX / rect.width) * 2 - 1,
                -(canvasY / rect.height) * 2 + 1,
                0.5
            );
            pointer.unproject(camera);

            const raycaster = new THREE.Raycaster(camera.position, pointer.sub(camera.position).normalize());

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
            const state = viewer.getState({ viewport: true, renderOptions: true }); // Get basic state
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
                viewer.unloadModel(model);
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
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        Object.entries(loadedModelsRef.current).forEach(([urn, model]) => {
            const shouldHide = hiddenModelUrns.includes(urn);
            if (shouldHide) {
                viewer.hideModel(model.id);
            } else {
                viewer.showModel(model.id);
            }
        });
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

            const texture = new THREE.CanvasTexture(canvas);
            const material = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                depthTest: false,  // Always visible, even behind objects
                depthWrite: false
            });
            const spriteMesh = new THREE.Sprite(material);
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
                .filter(pin => pin.x !== undefined)
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
                        seedUrn: pin.seedUrn || viewer.model?.getData()?.urn // Pass seedUrn to link to specific model
                        // viewerState: pin.viewerState // Optional: restore camera state on click if saved
                    };
                });

            // 3. Load
            // 3. Load
            if (pushPinItems.length > 0) {
                extension.loadItems(pushPinItems);
            }

            // 4. Handle Selection
            const handlePinSelect = (event) => {
                console.log('[Viewer] PushPin Event Fired:', event.type, event);
                const selectedItems = event.data;
                if (selectedItems && selectedItems.length > 0) {
                    const pinId = selectedItems[0].id;
                    console.log('[Viewer] Pin Selected ID:', pinId);
                    if (onBuildPinSelect) {
                        onBuildPinSelect(pinId);
                    }
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

            console.log('[Viewer] Listening for PushPin events:', uniqueEvents);

            uniqueEvents.forEach(evt => {
                viewer.removeEventListener(evt, handlePinSelect);
                viewer.addEventListener(evt, handlePinSelect);
            });

        }).catch(err => {
            console.error('[Viewer] Failed to load PushPin extension:', err);
        });

    }, [buildPins, showBuildPins, viewerReady, onBuildPinSelect]);

    // ZOOM TO SELECTED PIN
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

        const target = new THREE.Vector3(targetX, targetY, targetZ);

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
        if (direction.lengthSq() < 0.0001) direction = new THREE.Vector3(0, 0, 1);
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
            // If we are in placement mode, do not select pins
            if (placementMode) return;

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
                const point = new THREE.Vector3(pin.x, pin.y, pin.z);

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
            viewer.container.removeEventListener('click', handleCanvasClick, true);
        };
    }, [buildPins, showBuildPins, viewerReady, placementMode, onBuildPinSelect]);


    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;
        if (!placementMode) {
            viewer.setCursor && viewer.setCursor('default');
            return;
        }
        viewer.setCursor && viewer.setCursor('crosshair');
        const target = viewer.canvas || viewer.impl?.canvas || viewer.container;
        if (!target) return;
        const handlePlacement = event => {
            event.stopPropagation();
            event.preventDefault();
            const rect = target.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const hit = viewer.impl.hitTest(x, y, true);
            console.log('Sprite placement - Hit test result:', hit);

            if (hit && hit.point) {
                console.log('✓ Sprite placed at:', {
                    position: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
                    dbId: hit.dbId
                });
                if (onPlacementComplete) {
                    onPlacementComplete({
                        position: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
                        dbId: hit.dbId
                    });
                }
            } else {
                console.warn('✗ No geometry detected at click position. Try clicking directly on the 3D model.');
                if (onPlacementComplete) {
                    onPlacementComplete(null);
                }
            }
        };
        target.addEventListener('click', handlePlacement, true);
        return () => {
            target.removeEventListener('click', handlePlacement, true);
            viewer.setCursor && viewer.setCursor('default');
        };
    }, [placementMode, onPlacementComplete, viewerReady]);

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

        canvas.addEventListener('contextmenu', handleContextMenu, true);
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('touchstart', handleMouseDown);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('touchend', handleMouseUp);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('touchmove', handleMouseMove);
        window.addEventListener('click', handleClickOutside);

        return () => {
            canvas.removeEventListener('contextmenu', handleContextMenu, true);
            canvas.removeEventListener('mousedown', handleMouseDown);
            canvas.removeEventListener('touchstart', handleMouseDown);
            canvas.removeEventListener('mouseup', handleMouseUp);
            canvas.removeEventListener('touchend', handleMouseUp);
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('touchmove', handleMouseMove);
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

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

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
        </div>
    );
};

export default Viewer;
