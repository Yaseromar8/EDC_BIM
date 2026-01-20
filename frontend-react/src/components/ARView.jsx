import React, { useEffect, useRef, useState } from 'react';
import './ARView.css';
import '../aps/extensions/DeviceOrientationExtension'; // Make sure this path is correct

// --- STATIC TOKEN CONFIGURATION ---
// PASTE YOUR VALID TOKEN HERE IF BACKEND IS DOWN
const STATIC_TOKEN = "";

const ARView = ({ models, onExit }) => {
    const viewerDivRef = useRef(null);
    const viewerRef = useRef(null);
    const videoRef = useRef(null);
    const [permStatus, setPermStatus] = useState("init");

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
                // 'environment' requests the back camera
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' },
                    audio: false
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    // Play only when metadata loads to avoid black frame
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current.play().catch(e => console.error("Play error:", e));
                    };
                }
            } catch (err) {
                console.error("Camera Error:", err);
                // Don't alert blocking errors in dev, just log
            }
        };

        startCamera();

        // Cleanup
        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

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

            // CONFIGURATION FOR TRANSPARENCY
            const config = {
                extensions: ['DeviceOrientationExtension'], // Load our custom gyro logic
                canvasConfig: { alpha: true, premultipliedAlpha: false }
            };

            const viewer = new Autodesk.Viewing.GuiViewer3D(viewerDivRef.current, config);
            viewer.start();
            viewerRef.current = viewer;

            // Load Model
            Autodesk.Viewing.Document.load('urn:' + models[0].urn, (doc) => {
                const defaultModel = doc.getRoot().getDefaultGeometry();
                viewer.loadDocumentNode(doc, defaultModel, {
                    keepCurrentModels: false,
                    globalOffset: { x: 0, y: 0, z: 0 }, // Prevent Jitter
                    placementTransform: new THREE.Matrix4() // Reset transform
                }).then(() => {
                    // --- SUCCESS LINK: MODEL LOADED ---
                    console.log("AR Model Loaded. Applying Transparency...");

                    // A. FORCE TRANSPARENCY (The "Ghost" Fix)
                    const makeTransparent = () => {
                        viewer.container.style.background = 'transparent';
                        viewer.container.style.backgroundColor = 'transparent';

                        const renderer = viewer.impl.glrenderer ? viewer.impl.glrenderer() : viewer.impl.renderer();
                        if (renderer) {
                            renderer.setClearColor(0xffffff, 0); // 0 Alpha
                            if (renderer.setClearAlpha) renderer.setClearAlpha(0);
                        }
                        viewer.impl.invalidate(true, true, true);
                    };

                    makeTransparent();
                    // Re-apply on events just in case viewer resets it
                    viewer.addEventListener(Autodesk.Viewing.TEXTURES_LOADED_EVENT, makeTransparent);
                    viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, makeTransparent);

                    viewer.fitToView();

                    // B. AUTO-START EXTENSION (If Android)
                    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') {
                        // Android doesn't need explicit permission click usually
                        const ext = viewer.getExtension('DeviceOrientationExtension');
                        if (ext) {
                            ext.activate();
                            setPermStatus("active");
                        }
                    } else {
                        // iOS needs explicit button
                        setPermStatus("pending_ios");
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

    // 3. RENDER UI
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
                </div>

                {/* iOS ENABLE BUTTON */}
                <div className="ar-bottom-controls">
                    {permStatus === 'pending_ios' && (
                        <button
                            className="ar-btn ar-btn-primary"
                            onClick={async () => {
                                try {
                                    // Request iOS Permission
                                    const response = await DeviceOrientationEvent.requestPermission();
                                    if (response === 'granted') {
                                        setPermStatus('active');
                                        // Activate Extension
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
                </div>
            </div>
        </div>
    );
};

export default ARView;
