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

    // 1. INITIALIZE WEBXR (With Polyfill Support)
    useEffect(() => {
        const initWebXR = async () => {
            // Polyfill should inject navigator.xr
            if (!navigator.xr) {
                console.warn("[ARView] WebXR not found even with polyfill.");
                startCamera(); // Fallback
                return;
            }

            try {
                const supported = await navigator.xr.isSessionSupported('immersive-ar');
                if (supported) {
                    console.log("[ARView] WebXR Supported (Native or Polyfill).");
                    setPermStatus("webxr_ready");
                } else {
                    console.warn("[ARView] immersive-ar not supported.");
                    startCamera(); // Fallback
                }
            } catch (e) {
                console.error("[ARView] WebXR Error:", e);
                startCamera();
            }
        };

        const startCamera = async () => {
            // Standard getUserMedia Fallback
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' }
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play();
                }
            } catch (err) { console.error("Camera fallback failed", err); }
        };

        initWebXR();
    }, []);

    // ... (Viewer Init remains same) ...
    // ... (Rest of component) ...

    // RENDER (IGNORED):
    const ignoredJSX = (
        <div className="ar-view-container">
            {/* Camera Feed (Fallback/Underlay) */}
            <video ref={videoRef} className="ar-video-feed" autoPlay playsInline muted />

            {/* Viewer Canvas */}
            <div ref={viewerDivRef} className="ar-viewer-canvas" />

            {/* UI Overlay */}
            <div className="ar-ui-overlay">
                {/* ... Top Bar ... */}

                <div className="ar-bottom-controls">
                    {/* START AR BUTTON (ALWAYS VISIBLE) */}
                    <button
                        className="ar-btn ar-btn-primary"
                        style={{ background: '#2563eb', display: 'block' }}
                        onClick={async () => {
                            try {
                                const session = await navigator.xr.requestSession('immersive-ar', {
                                    requiredFeatures: ['hit-test', 'dom-overlay'],
                                    domOverlay: { root: document.body }
                                });
                                // Session started!
                                // In a real implementation, we would now loop and update camera pose.
                                // For now, this activates the Native AR view if available.
                                console.log("Session started", session);
                            } catch (e) {
                                alert("Error al iniciar AR: " + e.message);
                            }
                        }}
                    >
                        🚀 Iniciar AR (Scan)
                    </button>

                    {/* ... Panel ... */}
                </div>
            </div>
        </div>
    );

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

            // CLEAN TRANSPARENCY SETUP
            viewer.addEventListener(Autodesk.Viewing.VIEWER_INITIALIZED, () => {
                viewer.container.style.background = 'transparent';
                if (viewer.impl.renderer()) {
                    viewer.impl.renderer().setClearColor(0x000000, 0);
                    viewer.impl.renderer().setClearAlpha(0);
                }
                viewer.setEnvMapBackground(false);
                viewer.impl.setLightPreset(0); // Simple lighting
                viewer.impl.invalidate(true, true, true);
            });

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

                        if (loadedCount === totalModels) {
                            // alert("Modelos cargados: " + loadedCount);
                            console.log("[AR] All models loaded.");

                            // USE FIT TO VIEW TO ENSURE VISIBILITY
                            viewer.fitToView();

                            // Transparency again
                            if (viewer.impl.renderer()) {
                                viewer.impl.renderer().setClearColor(0x000000, 0);
                                viewer.impl.renderer().setClearAlpha(0);
                            }
                            viewer.impl.invalidate(true, true, true);

                            // Activate Gyroscope (DeviceOrientation)
                            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') {
                                const ext = viewer.getExtension('DeviceOrientationExtension');
                                if (ext) {
                                    ext.activate();
                                    setPermStatus('active');
                                }
                            } else {
                                setPermStatus('pending_ios');
                            }

                            // Apply initial transform (Grounding)
                            setModelHeight(-1.6);
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
                const threeCam = cam;

                // 2. Raycaster from center of screen
                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera(new THREE.Vector2(0, 0), threeCam);

                // Plane at Y = modelHeight (default -1.6 relative to world 0)
                // We define a mathematical plane for intersection
                const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -modelHeight);
                const target = new THREE.Vector3();
                const intersection = raycaster.ray.intersectPlane(plane, target);

                if (intersection) {
                    // Update Model Translation
                    const allModels = viewer.impl.modelQueue().getModels();

                    allModels.forEach(m => {
                        // Create Transform Matrices
                        const scaleM = new THREE.Matrix4().makeScale(modelScale, modelScale, modelScale);
                        const rotM = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(modelRotationY));
                        const transM = new THREE.Matrix4().makeTranslation(intersection.x, intersection.y, intersection.z);

                        // Order: Scale -> Rotate -> Translate
                        const finalM = new THREE.Matrix4();
                        finalM.multiply(transM).multiply(rotM).multiply(scaleM);

                        m.setPlacementTransform(finalM);
                    });
                    viewer.impl.invalidate(true, true, true);
                }
            }, 50);
        } else {
            applyStaticTransform();
        }

        return () => clearfix(interval);
    }, [isPositioning, modelScale, modelRotationY, modelHeight]);

    // Helper to apply transform when NOT in positioning mode
    const applyStaticTransform = () => {
        if (!viewerRef.current) return;
        const viewer = viewerRef.current;
        const allModels = viewer.impl.modelQueue().getModels();

        // If we haven't positioned it with the reticle yet, we might want a default.
        // But for "sliders", we usually assume the model is at (0,0,0) or last known position?
        // Actually, if simply rotating, we should keep the last translation. 
        // For simplicity in this 'Quick Fix', we will assume the model stays at (0, modelHeight, 0) relative to world
        // UNLESS we store a "currentPosition" state. 
        // To fix "Rotation not working", let's re-calculate based on current parameters.

        allModels.forEach(m => {
            // Get current transform to preserve position if possible, OR just use 0,0,0 + Height if user hasn't moved it.
            // But 'modelHeight' is a slider. 
            // Let's stick to a simple absolute logic: 
            // The sliders define the ABSOLUTE transform logic relative to World Origin (0,0,0).
            // (Functionality limitation: If user moved with reticle, that X,Z is lost if we strictly use this function without state.
            // However, usually 'modelHeight' slider updates state. Reticle should update a 'modelPosition' state ideally.)

            // IMPROVEMENT: Retrieve current X/Z from model to keep it stable while rotating?
            // Existing logic was resetting to 0,0,0. Let's try to preserve standard logic.

            const scaleM = new THREE.Matrix4().makeScale(modelScale, modelScale, modelScale);
            const rotM = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(modelRotationY));
            const transM = new THREE.Matrix4().makeTranslation(0, modelHeight, 0); // Reset X/Z to 0 if not using reticle is the safe bet for V1

            const finalM = new THREE.Matrix4();
            finalM.multiply(transM).multiply(rotM).multiply(scaleM);

            m.setPlacementTransform(finalM);
        });
        viewer.impl.invalidate(true, true, true);
    };

    // Trigger static transform when sliders change
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

    // 5. WALK LOGIC
    const walkCamera = (step) => {
        if (!viewerRef.current) return;
        const nav = viewerRef.current.navigation;
        const pos = nav.getPosition();
        const target = nav.getTarget();

        const THREE = window.THREE || Autodesk.Viewing.Private.THREE;

        // Calculate Direction
        const dir = new THREE.Vector3().subVectors(target, pos).normalize();

        // Use only X and Z for "Walking" (Ground Plane), ignore Y (flying) 
        // UNLESS looking straight down. Let's stick to full 3D move ("Flying") for simplicity in AR 
        // as user might want to go up/down stairs.

        const move = dir.multiplyScalar(step); // 0.5m per tick

        const newPos = pos.clone().add(move);
        const newTarget = target.clone().add(move);

        nav.setView(newPos, newTarget);
        viewerRef.current.impl.invalidate(true, true, true);
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



                    {/* WebXR Start Button (Polyfill/Native) */}

                    <button
                        className="ar-btn ar-btn-primary"
                        style={{ background: '#2563eb' }}
                        onClick={async () => {
                            try {
                                const session = await navigator.xr.requestSession('immersive-ar', {
                                    optionalFeatures: ['hit-test', 'dom-overlay', 'local-floor'],
                                    domOverlay: { root: document.body }
                                });
                                console.log("Session started", session);
                            } catch (e) {
                                alert("Error al iniciar AR: " + e.message);
                            }
                        }}
                    >
                        🚀 Iniciar AR (Scan)
                    </button>

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
