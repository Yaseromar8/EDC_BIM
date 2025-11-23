import React, { useEffect, useRef, useState } from 'react';
import './viewer.css';
import { BaseExtension } from '../aps/extensions/BaseExtension';
import { LoggerExtension } from '../aps/extensions/LoggerExtension';
import { HistogramExtension } from '../aps/extensions/HistogramExtension';
import { PhasingExtension } from '../aps/extensions/PhasingExtension';

const Viewer = ({ models, sprites, showSprites, activeSpriteId, onSpriteSelect, onSpriteDelete, placementMode, onPlacementComplete, onModelProperties }) => {
    const viewerRef = useRef(null);
    const containerRef = useRef(null);
    const loadedModelsRef = useRef({});
    const baseOffsetRef = useRef(null);
    const basePlacementRef = useRef(null);
    const spriteViewRef = useRef(null);
    const spriteStylesRef = useRef(null);
    const spriteMeshesRef = useRef({});
    const [viewerReady, setViewerReady] = useState(false);

    // Context menu state for sprite creation
    const [contextMenu, setContextMenu] = useState(null); // { visible, x, y, position, dbId }
    const longPressTimerRef = useRef(null);
    const isLongPressRef = useRef(false);

    const toMatrix4 = transform => {
        if (!window.THREE || !transform) return null;
        const matrix = new THREE.Matrix4();
        if (Array.isArray(transform)) {
            if (transform.length === 16) {
                matrix.set(
                    transform[0], transform[1], transform[2], transform[3],
                    transform[4], transform[5], transform[6], transform[7],
                    transform[8], transform[9], transform[10], transform[11],
                    transform[12], transform[13], transform[14], transform[15]
                );
                return matrix;
            }
            if (transform.length === 12) {
                matrix.set(
                    transform[0], transform[1], transform[2], transform[3],
                    transform[4], transform[5], transform[6], transform[7],
                    transform[8], transform[9], transform[10], transform[11],
                    0, 0, 0, 1
                );
                return matrix;
            }
        }
        if (transform.elements && transform.elements.length === 16) {
            matrix.fromArray(transform.elements);
            return matrix;
        }
        return null;
    };

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
                    extensions: ['BaseExtension', 'LoggerExtension', 'HistogramExtension', 'PhasingExtension']
                };
                const viewer = new Autodesk.Viewing.GuiViewer3D(containerRef.current, config);
                viewer.start();
                viewerRef.current = viewer;
                viewer.loadExtension('Autodesk.DataVisualization').then(dataviz => {
                    const spriteView = new dataviz.SpriteView(viewer);
                    const styleBuilder = new dataviz.SpriteStyleBuilder();
                    styleBuilder.addStyle('default', { color: '#ff5a5a', size: 24 });
                    styleBuilder.addStyle('active', { color: '#3aa0ff', size: 26 });
                    const styleSet = styleBuilder.build();
                    spriteView.on(dataviz.SpriteView.Events.CLICKED, evt => {
                        const spriteId = evt?.viewable?.id;
                        if (spriteId) {
                            onSpriteSelect?.(spriteId);
                        }
                    });
                    spriteViewRef.current = spriteView;
                    spriteStylesRef.current = styleSet;
                    setViewerReady(true);
                }).catch(() => setViewerReady(true));
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
            const props = event?.model?.allProps || viewer?.model?.allProps || [];
            onModelProperties?.(props || []);
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
        }
    }, [models.length, onModelProperties]);

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
            viewer.clearThemingColors();
            if (!detail || !detail.dbIds || !detail.dbIds.length) {
                viewer.setGhosting(false);
                viewer.showAll();
                viewer.select([]);
                return;
            }
            viewer.setGhosting(true);
            viewer.showAll();
            viewer.select(detail.dbIds);
            detail.groups?.forEach((group, index) => {
                const color = palette[index % palette.length];
                group.dbIds.forEach(dbId => {
                    viewer.setThemingColor(dbId, color);
                });
            });
        };

        window.addEventListener('filters-apply', handleFiltersApply);
        return () => window.removeEventListener('filters-apply', handleFiltersApply);
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
            }
        });

        models.forEach(model => {
            if (!model?.urn || loaded[model.urn]) return;
            Autodesk.Viewing.Document.load(
                `urn:${model.urn}`,
                doc => {
                    const viewable = doc.getRoot().getDefaultGeometry();
                    const offset = viewable?.globalOffset || doc.getRoot()?.globalOffset || null;
                    const placementMatrix = toMatrix4(viewable?.placementTransform);
                    if (!basePlacementRef.current && placementMatrix) {
                        basePlacementRef.current = placementMatrix.clone();
                    }
                    if (!baseOffsetRef.current && offset) {
                        baseOffsetRef.current = { ...offset };
                    }
                    viewer.loadDocumentNode(doc, viewable, { keepCurrentModels: true }).then(loadedModel => {
                        loadedModelsRef.current[model.urn] = loadedModel;
                        const basePlacement = basePlacementRef.current;
                        if (basePlacement && placementMatrix) {
                            const inverse = placementMatrix.clone().invert();
                            const relative = new THREE.Matrix4().multiplyMatrices(basePlacement, inverse);
                            loadedModel.setModelTransform(relative);
                        } else {
                            const base = baseOffsetRef.current;
                            if (base && offset && window.THREE) {
                                const dx = (offset.x || 0) - (base.x || 0);
                                const dy = (offset.y || 0) - (base.y || 0);
                                const dz = (offset.z || 0) - (base.z || 0);
                                const translation = new THREE.Matrix4().makeTranslation(dx, dy, dz);
                                loadedModel.setModelTransform(translation);
                            }
                        }
                        if (Object.keys(loadedModelsRef.current).length === 1) {
                            viewer.fitToView();
                        }
                    }).catch(err => console.error('Error loading document node', err));
                },
                err => console.error('Error loading document', err)
            );
        });
    }, [models, viewerReady]);

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
