import React, { useState, useRef, useEffect, useCallback } from 'react';

/**
 * CameraCapture — Built-in camera with device selection.
 * Lists all available cameras (front, back, USB) and lets the user pick.
 * Captures photo as a File object and returns it via onCapture callback.
 */
const CameraCapture = ({ isOpen, onClose, onCapture }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const [cameras, setCameras] = useState([]);
    const [selectedCamera, setSelectedCamera] = useState('');
    const [error, setError] = useState(null);
    const [ready, setReady] = useState(false);

    // Enumerate all video devices
    const loadCameras = useCallback(async () => {
        try {
            // Need a temporary stream first to get permission, then enumerate
            const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
            tempStream.getTracks().forEach(t => t.stop());

            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            setCameras(videoDevices);
            if (videoDevices.length > 0 && !selectedCamera) {
                // Default to back camera if available
                const back = videoDevices.find(d =>
                    d.label.toLowerCase().includes('back') ||
                    d.label.toLowerCase().includes('rear') ||
                    d.label.toLowerCase().includes('trasera') ||
                    d.label.toLowerCase().includes('environment')
                );
                setSelectedCamera(back ? back.deviceId : videoDevices[0].deviceId);
            }
        } catch (err) {
            console.error('[CameraCapture] Permission denied:', err);
            setError('No se pudo acceder a la cámara. Verifica los permisos del navegador.');
        }
    }, [selectedCamera]);

    // Start/restart stream when camera changes
    const startStream = useCallback(async (deviceId) => {
        // Stop previous stream
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }
        setReady(false);

        try {
            const constraints = {
                video: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    facingMode: deviceId ? undefined : 'environment'
                }
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => setReady(true);
            }
            setError(null);
        } catch (err) {
            console.error('[CameraCapture] Failed to start stream:', err);
            setError(`Error al iniciar cámara: ${err.message}`);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadCameras();
        }
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
        };
    }, [isOpen, loadCameras]);

    useEffect(() => {
        if (isOpen && selectedCamera) {
            startStream(selectedCamera);
        }
    }, [isOpen, selectedCamera, startStream]);

    const handleCapture = () => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        canvas.toBlob((blob) => {
            if (blob) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const file = new File([blob], `foto_${timestamp}.jpg`, { type: 'image/jpeg' });
                if (onCapture) onCapture(file);
                handleClose();
            }
        }, 'image/jpeg', 0.92);
    };

    const handleClose = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setReady(false);
        if (onClose) onClose();
    };

    if (!isOpen) return null;

    // Get a clean label for the camera
    const getCameraLabel = (device, index) => {
        if (device.label) {
            return device.label;
        }
        return `Cámara ${index + 1}`;
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: '#000', zIndex: 100000,
            display: 'flex', flexDirection: 'column'
        }}>
            {/* Top bar */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', background: 'rgba(0,0,0,0.8)', zIndex: 2
            }}>
                <button onClick={handleClose} style={{
                    background: 'none', border: 'none', color: '#fff',
                    fontSize: '14px', cursor: 'pointer', padding: '6px 12px'
                }}>
                    ✕ Cerrar
                </button>

                {cameras.length > 1 && (
                    <select
                        value={selectedCamera}
                        onChange={(e) => setSelectedCamera(e.target.value)}
                        style={{
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: '#fff', padding: '6px 10px',
                            borderRadius: '4px', fontSize: '12px',
                            maxWidth: '200px', outline: 'none'
                        }}
                    >
                        {cameras.map((cam, i) => (
                            <option key={cam.deviceId} value={cam.deviceId} style={{ color: '#000' }}>
                                {getCameraLabel(cam, i)}
                            </option>
                        ))}
                    </select>
                )}

                <div style={{ width: '80px' }} />
            </div>

            {/* Video preview */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {error ? (
                    <div style={{ color: '#ef4444', textAlign: 'center', padding: '20px', fontSize: '14px' }}>
                        {error}
                    </div>
                ) : (
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                )}
            </div>

            {/* Capture button */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '20px', background: 'rgba(0,0,0,0.8)'
            }}>
                <button
                    onClick={handleCapture}
                    disabled={!ready}
                    style={{
                        width: '64px', height: '64px', borderRadius: '50%',
                        background: ready ? '#fff' : 'rgba(255,255,255,0.2)',
                        border: '4px solid rgba(255,255,255,0.4)',
                        cursor: ready ? 'pointer' : 'default',
                        transition: 'transform 0.1s',
                        outline: 'none'
                    }}
                    onMouseDown={(e) => { if (ready) e.target.style.transform = 'scale(0.9)'; }}
                    onMouseUp={(e) => { e.target.style.transform = 'scale(1)'; }}
                />
            </div>

            {/* Hidden canvas for capture */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
    );
};

export default CameraCapture;
