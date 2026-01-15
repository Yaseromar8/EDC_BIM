
import React, { useEffect, useRef, useState } from 'react';
import './ARView.css';

const ARView = ({ models, onExit }) => {
    const viewerDivRef = useRef(null);
    const viewerRef = useRef(null);
    const videoRef = useRef(null);
    const [cameraReady, setCameraReady] = useState(false);

    // Sliders & Debug
    const [videoOpacity, setVideoOpacity] = useState(1.0);
    const [viewerOpacity, setViewerOpacity] = useState(1.0); // New Control
    const [debugVideoOnTop, setDebugVideoOnTop] = useState(false);
    const [gyroEnabled, setGyroEnabled] = useState(false); // If true, video z-index > viewer

    // 1. Initialize Camera Loop
    useEffect(() => {
        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' },
                    audio: false
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        setCameraReady(true);
                        videoRef.current.play();
                    };
                }
            } catch (err) {
                console.error("AR Camera Error:", err);
                alert("Error accediendo a la cámara. Asegúrate de usar HTTPS o Localhost.");
            }
        };

        startCamera();

        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                const tracks = videoRef.current.srcObject.getTracks();
                tracks.forEach(track => track.stop());
            }
        };
    }, []);

    // 2. Initialize Viewer
    useEffect(() => {
        if (!models || models.length === 0) return;
        const mainModelUrn = models[0].urn;

        const options = {
            env: 'AutodeskProduction',
            getAccessToken: (onSuccess) => {
                fetch('/api/token')
                    .then(res => res.json())
                    .then(data => onSuccess(data.access_token, data.expires_in));
            }
        };

        Autodesk.Viewing.Initializer(options, () => {
            if (!viewerDivRef.current) return;

            const config = {
                extensions: ['Autodesk.Viewing.ZoomWindow'],
                canvasConfig: { alpha: true, premultipliedAlpha: false }
            };

            const viewer = new Autodesk.Viewing.GuiViewer3D(viewerDivRef.current, config);
            viewer.start();
            viewerRef.current = viewer;

            const documentId = 'urn:' + mainModelUrn;
            Autodesk.Viewing.Document.load(documentId, (doc) => {
                const defaultModel = doc.getRoot().getDefaultGeometry();
                viewer.loadDocumentNode(doc, defaultModel, {
                    keepCurrentModels: false,
                    globalOffset: { x: 0, y: 0, z: 0 }
                }).then(() => {
                    // Force Transparency
                    try {
                        // Removed setBackgroundColor (It creates gradients)
                        const renderer = viewer.impl.glrenderer ? viewer.impl.glrenderer() : viewer.impl.renderer();
                        if (renderer) {
                            renderer.setClearColor(0xffffff, 0);
                            if (renderer.setClearAlpha) renderer.setClearAlpha(0);
                        }
                    } catch (e) { console.warn(e); }

                    viewer.impl.invalidate(true, true, true);
                    viewer.fitToView();
                });
            });

            viewer.container.style.background = 'transparent';
            if (viewer.setGhosting) viewer.setGhosting(false);
        });

        return () => {
            if (viewerRef.current) {
                viewerRef.current.finish();
                viewerRef.current = null;
            }
        };
    }, [models]);

    // 3. GYROSCOPE LOGIC
    useEffect(() => {
        const handleOrientation = (event) => {
            if (!gyroEnabled || !viewerRef.current) return;

            // Check if THREE is available (Viewer usually exposes it)
            const THREE = window.THREE || Autodesk.Viewing.Private.THREE;
            if (!THREE) return;

            const { alpha, beta, gamma } = event;
            if (alpha === null) return;

            // Convert deg to rad
            const bg = THREE.Math.degToRad(beta);
            const ag = THREE.Math.degToRad(alpha);
            const gg = THREE.Math.degToRad(gamma);

            // Orientation of screen (0 for portrait, 90 for landscape)
            const orient = window.orientation ? THREE.Math.degToRad(window.orientation) : 0;

            // Math from standard libraries (DeviceOrientationControls)
            const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // - PI/2 around X
            const zee = new THREE.Vector3(0, 0, 1);
            const euler = new THREE.Euler();
            const q0 = new THREE.Quaternion();

            euler.set(bg, ag, -gg, 'YXZ');
            q0.setFromEuler(euler);
            q0.multiply(q1);

            const q2 = new THREE.Quaternion();
            q2.setFromAxisAngle(zee, -orient);
            q0.multiply(q2);

            // Apply to Camera
            const camera = viewerRef.current.impl.camera;
            camera.quaternion.copy(q0);
            // Standard APS camera is 'up' vector based, so we might need to sync dirty
            viewerRef.current.impl.invalidate(true, false, false);
        };

        if (gyroEnabled) {
            window.addEventListener('deviceorientation', handleOrientation);
        }

        return () => {
            window.removeEventListener('deviceorientation', handleOrientation);
        };
    }, [gyroEnabled]);

    return (
        <div className="ar-view-container">
            {/* Camera Layer */}
            <video
                ref={videoRef}
                className="ar-video-feed"
                playsInline
                autoPlay
                muted
                style={{
                    opacity: videoOpacity,
                    zIndex: debugVideoOnTop ? 10 : 1
                }}
            />

            {/* Viewer Layer */}
            <div
                ref={viewerDivRef}
                className="ar-viewer-canvas"
                style={{
                    zIndex: 5,
                    opacity: viewerOpacity // Controlled by slider
                }}
            />

            {/* UI Overlay */}
            <div className="ar-ui-overlay">
                <div style={{ pointerEvents: 'auto', display: 'flex', gap: '10px', flexDirection: 'column' }}>
                    <button className="ar-close-btn" onClick={onExit}>✕ Salir</button>

                    <div className="ar-instructions" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>

                        {/* Camera Controls */}
                        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '5px', borderRadius: '4px' }}>
                            <label>Cámara Opacidad: {Math.round(videoOpacity * 100)}%</label>
                            <input
                                type="range" min="0" max="1" step="0.1"
                                value={videoOpacity}
                                onChange={(e) => setVideoOpacity(parseFloat(e.target.value))}
                            />
                            <button
                                className="ar-close-btn"
                                onClick={() => setDebugVideoOnTop(!debugVideoOnTop)}
                                style={{ fontSize: '10px', width: '100%', marginTop: '5px', background: debugVideoOnTop ? 'orange' : '#333' }}
                            >
                                {debugVideoOnTop ? "Cámara: AL FRENTE (Debug)" : "Cámara: AL FONDO"}
                            </button>
                        </div>

                        {/* Viewer Controls */}
                        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '5px', borderRadius: '4px' }}>
                            <label>Modelo Opacidad: {Math.round(viewerOpacity * 100)}%</label>
                            <input
                                type="range" min="0" max="1" step="0.1"
                                value={viewerOpacity}
                                onChange={(e) => setViewerOpacity(parseFloat(e.target.value))}
                            />
                        </div>

                        {/* Gyro Control */}
                        <button
                            className="ar-close-btn"
                            onClick={async () => {
                                if (!gyroEnabled && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                                    try { await DeviceOrientationEvent.requestPermission(); } catch (e) { }
                                }
                                setGyroEnabled(!gyroEnabled);
                            }}
                            style={{ background: gyroEnabled ? '#00cc00' : '#444' }}
                        >
                            {gyroEnabled ? "Giroscopio: ACTIVO" : "Activar Giroscopio (Movimiento)"}
                        </button>

                    </div>
                </div>

                <div className="ar-instructions">
                    {cameraReady ? "Cámara Activa" : "Cargando..."}
                </div>
            </div>
        </div>
    );
};

export default ARView;
