
import React, { useEffect, useRef, useState } from 'react';
import './ARView.css';

const ARView = ({ models, onExit }) => {
    const viewerDivRef = useRef(null);
    const viewerRef = useRef(null);
    const videoRef = useRef(null);
    // Auto-enable logic
    const [gyroEnabled, setGyroEnabled] = useState(false);
    const [permStatus, setPermStatus] = useState("init");

    // 1. Initialize Camera (Background)
    useEffect(() => {
        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' },
                    audio: false
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => videoRef.current.play();
                }
            } catch (err) {
                console.error("Camera Error:", err);
            }
        };
        startCamera();

        // Auto-start Gyro attempt (For Android/PC)
        setGyroEnabled(true);

        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    // 2. Initialize Viewer (Foreground)
    useEffect(() => {
        if (!models || models.length === 0) return;

        const options = {
            env: 'AutodeskProduction',
            getAccessToken: (onSuccess) => {
                fetch('/api/token').then(res => res.json())
                    .then(data => onSuccess(data.access_token, data.expires_in));
            }
        };

        Autodesk.Viewing.Initializer(options, () => {
            if (!viewerDivRef.current) return;
            // Config for Transparency
            const config = {
                extensions: ['Autodesk.Viewing.ZoomWindow'],
                canvasConfig: { alpha: true, premultipliedAlpha: false }
            };
            const viewer = new Autodesk.Viewing.GuiViewer3D(viewerDivRef.current, config);
            viewer.start();
            viewerRef.current = viewer;

            Autodesk.Viewing.Document.load('urn:' + models[0].urn, (doc) => {
                const defaultModel = doc.getRoot().getDefaultGeometry();
                viewer.loadDocumentNode(doc, defaultModel, {
                    keepCurrentModels: false,
                    globalOffset: { x: 0, y: 0, z: 0 }
                }).then(() => {
                    // Force Transparent Background
                    viewer.container.style.background = 'transparent';
                    const renderer = viewer.impl.glrenderer ? viewer.impl.glrenderer() : viewer.impl.renderer();
                    if (renderer) {
                        renderer.setClearColor(0xffffff, 0);
                        if (renderer.setClearAlpha) renderer.setClearAlpha(0);
                    }
                    viewer.impl.invalidate(true, true, true);
                    viewer.fitToView();
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

    // 3. Gyroscope Math Loop
    useEffect(() => {
        if (!gyroEnabled) return;

        const handleOrientation = (event) => {
            if (!viewerRef.current) return;

            // Safe THREE access
            let THREE = window.THREE;
            if (!THREE && Autodesk && Autodesk.Viewing && Autodesk.Viewing.Private) {
                THREE = Autodesk.Viewing.Private.THREE;
            }
            if (!THREE) return;

            const { alpha, beta, gamma } = event;
            if (alpha === null) return; // No sensor data

            // Math: Euler -> Quaternion
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

        // Try adding listener
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            // iOS requires explicit button click, handled in UI
            setPermStatus('pending');
        } else {
            // Android/PC adds immediately
            window.addEventListener('deviceorientation', handleOrientation);
            setPermStatus('active');
        }

        // Always add listener in case it works (non-iOS)
        window.addEventListener('deviceorientation', handleOrientation);

        return () => {
            window.removeEventListener('deviceorientation', handleOrientation);
        };
    }, [gyroEnabled]);

    return (
        <div className="ar-view-container">
            {/* Background Camera */}
            <video ref={videoRef} className="ar-video-feed" playsInline autoPlay muted />

            {/* Foreground Viewer */}
            <div ref={viewerDivRef} className="ar-viewer-canvas" />

            {/* Simple UI */}
            <div className="ar-ui-overlay">
                <div className="ar-top-bar">
                    <button className="ar-close-btn" onClick={onExit}>✕ Salir</button>
                </div>

                {/* Only show this button if iOS needs permission */}
                {permStatus === 'pending' && (
                    <div style={{ position: 'absolute', bottom: '50px', width: '100%', display: 'flex', justifyContent: 'center' }}>
                        <button
                            className="ar-close-btn"
                            style={{ background: '#4ade80', color: 'black', fontSize: '16px', padding: '12px 24px' }}
                            onClick={async () => {
                                try {
                                    const res = await DeviceOrientationEvent.requestPermission();
                                    if (res === 'granted') setPermStatus('active');
                                    else alert("Permiso denegado. Revisa configuración.");
                                } catch (e) { console.error(e); }
                            }}
                        >
                            Activar Movimiento
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ARView;
