
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
    const [gyroEnabled, setGyroEnabled] = useState(false);
    const [sensorData, setSensorData] = useState({ alpha: 0, beta: 0, gamma: 0 });
    const [permStatus, setPermStatus] = useState("init");

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
    // 3. GYROSCOPE LOGIC
    useEffect(() => {
        const handleOrientation = (event) => {
            // 1. DEBUG FIRST: Always update UI if event fires
            const { alpha, beta, gamma } = event;
            setSensorData({
                alpha: alpha ? alpha.toFixed(1) : 0,
                beta: beta ? beta.toFixed(1) : 0,
                gamma: gamma ? gamma.toFixed(1) : 0
            });

            if (!gyroEnabled || !viewerRef.current) return;

            // Check if THREE is available
            const THREE = window.THREE || Autodesk.Viewing.Private.THREE;
            if (!THREE) return;

            if (alpha === null) return;

            // ... (Rest of logic same) ...
            const bg = THREE.Math.degToRad(beta);
            const ag = THREE.Math.degToRad(alpha);
            const gg = THREE.Math.degToRad(gamma);
            const orient = window.orientation ? THREE.Math.degToRad(window.orientation) : 0;

            const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
            const zee = new THREE.Vector3(0, 0, 1);
            const euler = new THREE.Euler();
            const q0 = new THREE.Quaternion();

            euler.set(bg, ag, -gg, 'YXZ');
            q0.setFromEuler(euler);
            q0.multiply(q1);

            const q2 = new THREE.Quaternion();
            q2.setFromAxisAngle(zee, -orient);
            q0.multiply(q2);

            const camera = viewerRef.current.impl.camera;
            camera.quaternion.copy(q0);
            viewerRef.current.impl.invalidate(true, false, false);
        };

        // Always listen if gyroEnabled is true
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
                    opacity: viewerOpacity
                }}
            />

            {/* UI Overlay - MOBILE OPTIMIZED */}
            <div className="ar-ui-overlay">

                {/* Top: Exit Button */}
                <div className="ar-top-bar">
                    <button className="ar-close-btn" onClick={onExit}>✕ Salir</button>
                </div>

                {/* Bottom: Controls Panel */}
                <div className="ar-controls-panel">

                    {/* Camera Transparency */}
                    <div className="ar-slider-group">
                        <label>Cámara: {Math.round(videoOpacity * 100)}%</label>
                        <input
                            type="range" min="0" max="1" step="0.1"
                            value={videoOpacity}
                            onChange={(e) => setVideoOpacity(parseFloat(e.target.value))}
                        />
                    </div>

                    <button
                        className="ar-close-btn"
                        onClick={() => setDebugVideoOnTop(!debugVideoOnTop)}
                        style={{ fontSize: '10px', padding: '4px', background: debugVideoOnTop ? 'orange' : 'rgba(255,255,255,0.1)' }}
                    >
                        {debugVideoOnTop ? "Capa: CÁMARA ENCIMA" : "Capa: CÁMARA FONDO"}
                    </button>

                    {/* Model Transparency */}
                    <div className="ar-slider-group">
                        <label>Modelo: {Math.round(viewerOpacity * 100)}%</label>
                        <input
                            type="range" min="0" max="1" step="0.1"
                            value={viewerOpacity}
                            onChange={(e) => setViewerOpacity(parseFloat(e.target.value))}
                        />
                    </div>

                    {/* Gyro Toggle */}
                    {/* Gyro Toggle */}
                    <button
                        className="ar-close-btn"
                        onClick={async () => {
                            // 1. Check iOS Permission
                            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                                try {
                                    setPermStatus("requesting...");
                                    const response = await DeviceOrientationEvent.requestPermission();
                                    setPermStatus(response);
                                    if (response !== 'granted') {
                                        alert("Permiso RECHAZADO por el sistema (iOS). Recarga la página.");
                                        return;
                                    }
                                } catch (e) {
                                    console.error(e);
                                    setPermStatus("error: " + e.message);
                                }
                            } else {
                                setPermStatus("active (android/pc)");
                            }

                            // 2. Toggle State
                            setGyroEnabled(!gyroEnabled);
                        }}
                        style={{ background: gyroEnabled ? '#4ade80' : '#444', color: gyroEnabled ? 'black' : 'white' }}
                    >
                        {gyroEnabled ? "Giroscopio: ON" : "Activar Sensor"}
                    </button>

                    {/* Sensor Data Debug */}
                    <div className="ar-instructions" style={{ textAlign: 'left', fontFamily: 'monospace', fontSize: '9px', color: (sensorData.alpha == 0 && gyroEnabled) ? 'orange' : 'lime' }}>
                        Status: {permStatus}<br />
                        A:{sensorData.alpha} | B:{sensorData.beta} | G:{sensorData.gamma}
                    </div>

                </div>
            </div>
        </div>
    );
};

export default ARView;
