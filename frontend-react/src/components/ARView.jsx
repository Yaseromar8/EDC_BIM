import React, { useEffect, useRef, useState } from 'react';
import './ARView.css';
import '../aps/extensions/DeviceOrientationExtension'; // Import the new extension

const ARView = ({ models, onExit }) => {
    const viewerDivRef = useRef(null);
    const viewerRef = useRef(null);
    const videoRef = useRef(null);

    // UI States
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

        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    // 2. Initialize Viewer & Auto-Start Logic
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

            const config = {
                extensions: ['Autodesk.Viewing.ZoomWindow', 'DeviceOrientationExtension'], // Load Extension
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
                    // --- FORCE TRANSPARENCY ROBUSTLY ---
                    const makeTransparent = () => {
                        viewer.container.style.background = 'transparent';
                        const renderer = viewer.impl.glrenderer ? viewer.impl.glrenderer() : viewer.impl.renderer();
                        if (renderer) {
                            renderer.setClearColor(0xffffff, 0);
                            if (renderer.setClearAlpha) renderer.setClearAlpha(0);
                        }
                        viewer.impl.invalidate(true, true, true);
                    };

                    makeTransparent(); // Initial Call
                    viewer.addEventListener(Autodesk.Viewing.TEXTURES_LOADED_EVENT, makeTransparent);
                    viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, makeTransparent);

                    viewer.fitToView();

                    // --- AUTO START GYRO (ANDROID/PC) ---
                    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') {
                        const ext = viewer.getExtension('DeviceOrientationExtension');
                        if (ext) {
                            ext.activate();
                            setPermStatus('active');
                        }
                    } else {
                        // iOS needs button
                        setPermStatus('pending');
                    }
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

    return (
        <div className="ar-view-container">
            {/* Background Camera */}
            <video
                ref={videoRef} className="ar-video-feed" playsInline autoPlay muted
                style={{ opacity: 1 }}
            />

            {/* Foreground Viewer */}
            <div
                ref={viewerDivRef} className="ar-viewer-canvas"
                style={{ opacity: 1 }}
            />

            {/* Simple UI */}
            <div className="ar-ui-overlay">
                <div className="ar-top-bar">
                    <button className="ar-close-btn" onClick={onExit}>✕ Salir</button>
                </div>

                {/* iOS Permission Button */}
                {permStatus === 'pending' && (
                    <div style={{ position: 'absolute', bottom: '50px', width: '100%', display: 'flex', justifyContent: 'center' }}>
                        <button
                            className="ar-close-btn"
                            style={{ background: '#4ade80', color: 'black', fontSize: '16px', padding: '12px 24px' }}
                            onClick={async () => {
                                try {
                                    // 1. Request OS Permission
                                    const res = await DeviceOrientationEvent.requestPermission();
                                    if (res === 'granted') {
                                        setPermStatus('active');
                                        // 2. Activate Extension
                                        if (viewerRef.current) {
                                            const ext = viewerRef.current.getExtension('DeviceOrientationExtension');
                                            if (ext) ext.activate();
                                        }
                                    } else {
                                        alert("Permiso denegado.");
                                    }
                                } catch (e) { console.error(e); }
                            }}
                        >
                            Activar Movimiento (iOS)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ARView;
