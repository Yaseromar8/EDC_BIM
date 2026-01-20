import React, { useEffect, useRef, useState } from 'react';
import './ARView.css';
import '../aps/extensions/DeviceOrientationExtension'; // Make sure this path is correct

// --- STATIC TOKEN CONFIGURATION ---
// PASTE YOUR VALID TOKEN HERE IF BACKEND IS DOWN
const STATIC_TOKEN = "";

const ARView = ({ models, initialCamera, onExit }) => {
    const viewerDivRef = useRef(null);
    const viewerRef = useRef(null);
    const videoRef = useRef(null);
    const [permStatus, setPermStatus] = useState("init");
    const [modelOpacity, setModelOpacity] = useState(0.8); // Control model transparency (0.0 = invisible, 1.0 = solid)
    const [modelScale, setModelScale] = useState(1.0);
    const [modelHeight, setModelHeight] = useState(0);
    const [modelRotationY, setModelRotationY] = useState(0);

    // 1. INITIALIZE CAMERA FEED & CHECK AR SUPPORT
    useEffect(() => {
        // A. Check for WebXR (True AR) Support (Enabled by our Native Changes)
        if (navigator.xr) {
            navigator.xr.isSessionSupported('immersive-ar')
                .then((supported) => {
                    console.log(`[ARView] WebXR 'immersive-ar' Supported: ${supported}`);
                    if (supported) {
                        console.log("✅ ARCore Activo: Sistema Listo");
                    } else {
                        console.warn("[ARView] WebXR supported but AR not available.");
                    }
                })
                .catch(err => console.warn("[ARView] WebXR Check Error:", err));
        } else {
            console.log("[ARView] WebXR API not found (Passthrough Mode Active)");
        }

        const startCamera = async () => {
            try {
                // Stop any existing stream first
                if (videoRef.current && videoRef.current.srcObject) {
                    videoRef.current.srcObject.getTracks().forEach(track => track.stop());
                }

                // Request new stream with 'environment' (back camera)
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'environment',
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    },
                    audio: false
                });

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current.play().catch(e => console.error("Play error:", e));
                    };
                }
            } catch (err) {
                console.error("Camera Error:", err);
                // Don't block AR with alerts, just log
            }
        };

        startCamera();

        // Cleanup only on unmount
        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            }
        };
    }, []); // Empty dependency to run once

    // 2. INITIALIZE AUTODESK VIEWER
    useEffect(() => {
        if (!models || models.length === 0) return;

        // AUTH LOGIC (Static vs Fetch)
        // Use Render backend URL for Capacitor (native app)
        const BACKEND_URL = 'https://visor-ecd-backend.onrender.com';

        const getAccessToken = (onSuccess) => {
            if (STATIC_TOKEN && STATIC_TOKEN.length > 10) {
                console.log("Using STATIC_TOKEN");
                onSuccess(STATIC_TOKEN, 3600);
            } else {
                // Fallback to fetch using full URL
                fetch(`${BACKEND_URL}/api/token`)
                    .then(res => {
                        if (!res.ok) throw new Error("Backend Token Fetch Failed");
                        return res.json();
                    })
                    .then(data => onSuccess(data.access_token, data.expires_in))
                    .catch(err => {
                        console.error(err);
                        alert("Token Error: Backend unreachable. Please use STATIC_TOKEN in ARView.jsx");
                    });
            }
        };

        const options = {
            env: 'AutodeskProduction',
            getAccessToken: getAccessToken
        };

        Autodesk.Viewing.Initializer(options, () => {
            if (!viewerDivRef.current) return;

            const config = {
                extensions: ['DeviceOrientationExtension'], // Re-enable for rotation if possible
                canvasConfig: {
                    alpha: true,
                    premultipliedAlpha: false,
                    preserveDrawingBuffer: false
                }
            };

            const viewer = new Autodesk.Viewing.GuiViewer3D(viewerDivRef.current, config);
            viewer.start();
            viewerRef.current = viewer;

            // CLEAN TRANSPARENCY SETUP (Run ONCE)
            viewer.addEventListener(Autodesk.Viewing.VIEWER_INITIALIZED, () => {
                // Remove Viewer Background
                viewer.container.style.background = 'transparent';
                viewer.container.style.backgroundColor = 'transparent';

                // Set Renderer to Transparent
                if (viewer.impl.renderer()) {
                    viewer.impl.renderer().setClearColor(0x000000, 0);
                    viewer.impl.renderer().setClearAlpha(0);
                }

                // Disable Environment (Skybox/Ground)
                viewer.setEnvMapBackground(false);
                viewer.impl.setLightPreset(0); // Simple lighting

                // Invalidate to apply
                viewer.impl.invalidate(true, true, true);
            });

            // Backup transparency check (run once after 1s)
            setTimeout(() => {
                if (viewer.impl.renderer()) {
                    viewer.impl.renderer().setClearColor(0x000000, 0);
                    viewer.impl.invalidate(true, true, true);
                }
            }, 1000);

            // Helper to enforce transparency
            const makeTransparent = () => {
                if (!viewer || !viewer.impl) return;
                viewer.container.style.background = 'transparent';
                if (viewer.impl.renderer()) {
                    viewer.impl.renderer().setClearColor(0x000000, 0);
                    viewer.impl.renderer().setClearAlpha(0);
                }
                viewer.impl.invalidate(true, true, true);
            };

            // LOAD ALL MODELS (Aggregation)
            let loadedCount = 0;
            const totalModels = models.length;

            models.forEach((model, index) => {
                Autodesk.Viewing.Document.load('urn:' + model.urn, (doc) => {
                    const defaultModel = doc.getRoot().getDefaultGeometry();
                    viewer.loadDocumentNode(doc, defaultModel, {
                        keepCurrentModels: index > 0,
                        globalOffset: model.globalOffset || { x: 0, y: 0, z: 0 },
                        placementTransform: model.placementTransform || new THREE.Matrix4()
                    }).then(() => {
                        loadedCount++;
                        makeTransparent();

                        if (loadedCount === totalModels) {
                            console.log("[AR] All models loaded.");

                            // Initial Fit
                            if (initialCamera) {
                                // Try to respect initial camera roughly
                                viewer.navigation.setView(initialCamera.position, initialCamera.target);
                                if (initialCamera.up) viewer.navigation.setCameraUpVector(initialCamera.up);
                            } else {
                                viewer.fitToView();
                            }
                            makeTransparent();

                            // Activate Gyroscope (DeviceOrientation)
                            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') {
                                const ext = viewer.getExtension('DeviceOrientationExtension');
                                if (ext) {
                                    ext.activate();
                                    setPermStatus("active");
                                }
                            } else {
                                setPermStatus("pending_ios");
                            }
                        }
                    });
                });
            });
        });

        return () => {
            if (viewerRef.current) {
                viewerRef.current.finish();
                viewerRef.current = null;
            }
        };
    }, [models]);

    // 3. APPLY MODEL OPACITY
    useEffect(() => {
        if (viewerRef.current && viewerRef.current.container) {
            viewerRef.current.container.style.opacity = modelOpacity;
        }
    }, [modelOpacity]);

    const [isPositioning, setIsPositioning] = useState(false);

    // 4. APPLY PLACEMENT (MODEL TRANSFORM)
    // Runs continously if isPositioning is true to "follow" the reticle
    useEffect(() => {
        if (!viewerRef.current) return;

        let interval;
        if (isPositioning) {
            interval = setInterval(() => {
                const viewer = viewerRef.current;
                if (!viewer.navigation) return;

                // 1. Get Camera Info
                const cam = viewer.navigation.getCamera();
                const threeCam = cam; // Autodesk camera is a THREE.Camera

                // 2. Define Virtual Floor (at -1.6m relative to camera)
                // We assume camera is at (0,0,0) locally, so floor is at Y = -1.6
                // But Autodesk camera moves. 
                // Using Raycaster:

                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera(new THREE.Vector2(0, 0), threeCam); // Center of screen

                // Plane at Y = modelHeight (default -1.6 relative to camera eye)
                // Actually, let's assume world floor is at Y = modelHeight
                // And we intersect it.

                const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -modelHeight);
                const target = new THREE.Vector3();
                const intersection = raycaster.ray.intersectPlane(plane, target);

                if (intersection) {
                    // Update Model Translation ONLY (keep scale/rotation)
                    const models = viewer.impl.modelQueue().getModels();
                    models.forEach(m => {
                        const matrix = new THREE.Matrix4();
                        matrix.makeScale(modelScale, modelScale, modelScale);

                        const rotMatrix = new THREE.Matrix4();
                        rotMatrix.makeRotationY(THREE.MathUtils.degToRad(modelRotationY));
                        matrix.multiply(rotMatrix);

                        const transMatrix = new THREE.Matrix4();
                        // Move to intersection point
                        transMatrix.setPosition(intersection);

                        // Combine: Scale -> Rotate -> Translate
                        // Correct order for multiply: Translate * Rotate * Scale
                        // But m.setPlacementTransform expects the final matrix

                        // Let's decompose current, or just rebuild:
                        const finalM = new THREE.Matrix4();
                        finalM.makeTranslation(intersection.x, intersection.y, intersection.z);
                        finalM.multiply(rotMatrix);
                        finalM.scale(new THREE.Vector3(modelScale, modelScale, modelScale));

                        m.setPlacementTransform(finalM);
                    });
                    viewer.impl.invalidate(true, true, true);
                }
            }, 50); // High refresh rate for smoothness
        } else {
            // Just apply static transforms (Scale/Rot/Height) from state
            // This is handled by the other useEffect below/merged
            applyStaticTransform();
        }

        return () => clearfix(interval);
    }, [isPositioning, modelScale, modelRotationY, modelHeight]);

    // Helper to apply transform when NOT in positioning mode (manual sliders)
    const applyStaticTransform = () => {
        if (!viewerRef.current) return;
        const viewer = viewerRef.current;
        const models = viewer.impl.modelQueue().getModels();

        models.forEach(m => {
            // Here modelHeight works as absolute Y
            const finalM = new THREE.Matrix4();
            finalM.makeTranslation(0, modelHeight, 0); // Default to center 0,H,0

            const rotMatrix = new THREE.Matrix4();
            rotMatrix.makeRotationY(THREE.MathUtils.degToRad(modelRotationY));
            finalM.multiply(rotMatrix);

            finalM.scale(new THREE.Vector3(modelScale, modelScale, modelScale));

            m.setPlacementTransform(finalM);
        });
        viewer.impl.invalidate(true, true, true);
    };

    // Trigger static transform when sliders change (and not positioning)
    useEffect(() => {
        if (!isPositioning) {
            applyStaticTransform();
        }
    }, [modelScale, modelRotationY, modelHeight, isPositioning]);

    function clearfix(i) { if (i) clearInterval(i); }

    const resetPlacement = () => {
        setModelScale(1.0);
        setModelHeight(0);
        setModelRotationY(0);
    };

    const rotateModel = () => {
        setModelRotationY(p => (p + 90) % 360);
    };

    // 4. RENDER UI
    return (
        <div className="ar-view-container">
            {/* LAYER 0: Camera */}
            <video ref={videoRef} className="ar-video-feed" playsInline autoPlay muted />

            {/* LAYER 1: Viewer */}
            <div ref={viewerDivRef} className="ar-viewer-canvas" />

            {/* LAYER 2: UI Overlay */}
            <div className="ar-ui-overlay">
                <div className="ar-top-bar">
                    <button className="ar-btn" onClick={onExit}>✕ Salir</button>

                    {/* OPACITY SLIDER */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        background: 'rgba(0,0,0,0.6)',
                        padding: '8px 16px',
                        borderRadius: '20px',
                        backdropFilter: 'blur(5px)'
                    }}>
                        <span style={{ color: 'white', fontSize: '13px', fontWeight: 'bold' }}>Transparencia:</span>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={modelOpacity}
                            onChange={(e) => setModelOpacity(parseFloat(e.target.value))}
                            style={{
                                width: '120px',
                                cursor: 'pointer'
                            }}
                        />
                        <span style={{ color: 'white', fontSize: '12px', minWidth: '35px' }}>
                            {Math.round(modelOpacity * 100)}%
                        </span>
                    </div>
                </div>

                {/* RETICLE (Aiming Point) */}
                <div className="ar-reticle" />

                {/* BOTTOM CONTROLS */}
                <div className="ar-bottom-controls">

                    {/* iOS Permission Button */}
                    {permStatus === 'pending_ios' && (
                        <button
                            className="ar-btn ar-btn-primary"
                            onClick={async () => {
                                try {
                                    const response = await DeviceOrientationEvent.requestPermission();
                                    if (response === 'granted') {
                                        setPermStatus('active');
                                        if (viewerRef.current) {
                                            const ext = viewerRef.current.getExtension('DeviceOrientationExtension');
                                            if (ext) ext.activate();
                                        }
                                    } else {
                                        alert("Permission Denied (iOS). Please reset site permissions.");
                                    }
                                } catch (e) {
                                    console.error(e);
                                    alert("Error requesting permission: " + e.message);
                                }
                            }}
                        >
                            Activar AR (Permitir Movimiento)
                        </button>
                    )}

                    {/* PLACEMENT CONTROLS PANEL */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        background: 'rgba(0,0,0,0.7)',
                        padding: '15px',
                        borderRadius: '15px',
                        backdropFilter: 'blur(10px)',
                        minWidth: '280px',
                        maxWidth: '90vw'
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '10px'
                        }}>
                            <span style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '14px' }}>🎯 Ajustes del Modelo</span>

                            {/* MODE TOGGLE */}
                            <button
                                className="ar-btn"
                                onClick={() => setIsPositioning(!isPositioning)}
                                style={{
                                    padding: '6px 14px',
                                    fontSize: '12px',
                                    background: isPositioning ? '#ef4444' : '#8b5cf6',
                                    fontWeight: 'bold',
                                    boxShadow: isPositioning ? '0 0 10px #ef4444' : 'none'
                                }}
                            >
                                {isPositioning ? "🚫 FIJAR" : "📍 Mover con Mira"}
                            </button>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '5px' }}>
                            <button
                                onClick={resetPlacement}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#aaa',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    textDecoration: 'underline'
                                }}
                            >
                                Resetear Valores
                            </button>
                        </div>

                        {/* SCALE SLIDER */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ color: 'white', fontSize: '12px', minWidth: '60px', fontWeight: 'bold' }}>Escala:</span>
                            <input
                                type="range"
                                min="0.1"
                                max="3"
                                step="0.1"
                                value={modelScale}
                                onChange={(e) => setModelScale(parseFloat(e.target.value))}
                                style={{ flex: 1, cursor: 'pointer' }}
                            />
                            <span style={{ color: 'white', fontSize: '12px', minWidth: '45px' }}>
                                {Math.round(modelScale * 100)}%
                            </span>
                        </div>

                        {/* HEIGHT SLIDER */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ color: 'white', fontSize: '12px', minWidth: '60px', fontWeight: 'bold' }}>Altura:</span>
                            <input
                                type="range"
                                min="-50"
                                max="50"
                                step="1"
                                value={modelHeight}
                                onChange={(e) => setModelHeight(parseFloat(e.target.value))}
                                style={{ flex: 1, cursor: 'pointer' }}
                            />
                            <span style={{ color: 'white', fontSize: '12px', minWidth: '45px' }}>
                                {modelHeight > 0 ? '+' : ''}{modelHeight}m
                            </span>
                        </div>

                        {/* ROTATION BUTTON */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ color: 'white', fontSize: '12px', minWidth: '60px', fontWeight: 'bold' }}>Rotación:</span>
                            <button
                                className="ar-btn"
                                onClick={rotateModel}
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    background: '#3aa0ff',
                                    fontSize: '13px'
                                }}
                            >
                                🔄 Girar 90°
                            </button>
                            <span style={{ color: 'white', fontSize: '12px', minWidth: '45px' }}>
                                {modelRotationY}°
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ARView;
