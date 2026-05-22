import React, { useState, useEffect, useRef, useMemo } from 'react';

const StationTracker = ({ isVisible, onClose, markers, viewerRef }) => {
    // --- Draggable ---
    const [position, setPosition] = useState({ x: 80, y: 120 });
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const handleMouseDown = (e) => {
        setIsDragging(true);
        dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    };
    useEffect(() => {
        const move = (e) => isDragging && setPosition({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
        const up = () => setIsDragging(false);
        if (isDragging) { window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); }
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    }, [isDragging]);

    // --- State ---
    const [selectedTrack, setSelectedTrack] = useState('');
    const [currentStationIdx, setCurrentStationIdx] = useState(0);
    const [stationInput, setStationInput] = useState('');
    const [showProperties, setShowProperties] = useState(true);

    // --- Derived Data ---
    const tracks = useMemo(() => {
        if (!markers || markers.length === 0) return [];
        const tags = [...new Set(markers.map(m => m.tag))];
        return tags;
    }, [markers]);

    // Auto-select first track
    useEffect(() => {
        if (tracks.length > 0 && !tracks.includes(selectedTrack)) {
            setSelectedTrack(tracks[0]);
            setCurrentStationIdx(0);
        }
    }, [tracks]);

    // Sync from drag events on the 3D labels
    useEffect(() => {
        const handleDragSync = (e) => {
            const { station, tag } = e.detail;
            if (tag !== selectedTrack) setSelectedTrack(tag);
            const filtered = markers.filter(m => m.tag === tag);
            let closestIdx = 0;
            let closestDist = Infinity;
            filtered.forEach((m, i) => {
                const d = Math.abs(m.station - station);
                if (d < closestDist) { closestDist = d; closestIdx = i; }
            });
            setCurrentStationIdx(closestIdx);
        };
        window.addEventListener('station-drag-update', handleDragSync);
        return () => window.removeEventListener('station-drag-update', handleDragSync);
    }, [markers, selectedTrack]);

    const trackMarkers = useMemo(() => {
        if (!markers || !selectedTrack) return [];
        return markers.filter(m => m.tag === selectedTrack);
    }, [markers, selectedTrack]);

    const currentMarker = trackMarkers[currentStationIdx] || null;

    // --- Format station label ---
    const formatStation = (stationMeters) => {
        if (stationMeters == null) return '--';
        const km = Math.floor(stationMeters / 1000);
        const m = Math.round(stationMeters % 1000);
        return `${km}+${m.toString().padStart(3, '0')}`;
    };

    // --- Navigation ---
    const navigate = (delta) => {
        const newIdx = Math.max(0, Math.min(trackMarkers.length - 1, currentStationIdx + delta));
        setCurrentStationIdx(newIdx);
        flyTo(trackMarkers[newIdx]);
    };

    const jumpToStation = () => {
        const target = parseFloat(stationInput);
        if (isNaN(target) || trackMarkers.length === 0) return;
        // Find closest marker by station value
        let closestIdx = 0;
        let closestDist = Infinity;
        trackMarkers.forEach((m, i) => {
            const d = Math.abs(m.station - target);
            if (d < closestDist) { closestDist = d; closestIdx = i; }
        });
        setCurrentStationIdx(closestIdx);
        flyTo(trackMarkers[closestIdx]);
    };

    // --- Fly To Station ---
    const flyTo = (marker) => {
        if (!marker || !viewerRef?.current) return;
        const viewer = viewerRef.current;
        const ext = viewer.getExtension('ProgressiveExtension');
        if (ext && ext.flyToStation) {
            ext.flyToStation(marker);
        }
    };

    // --- Section Cut ---
    const sectionCut = () => {
        if (!currentMarker || !viewerRef?.current) return;
        const viewer = viewerRef.current;
        const ext = viewer.getExtension('ProgressiveExtension');
        if (ext && ext.sectionAtStation) {
            ext.sectionAtStation(currentMarker);
        }
    };

    const clearSection = () => {
        if (!viewerRef?.current) return;
        viewerRef.current.setCutPlanes([]);
    };

    // --- Track Change ---
    const handleTrackChange = (tag) => {
        setSelectedTrack(tag);
        setCurrentStationIdx(0);
    };

    if (!isVisible || !markers || markers.length === 0) return null;

    const totalLength = trackMarkers.length > 0 ? trackMarkers[trackMarkers.length - 1].station : 0;
    const progress = totalLength > 0 && currentMarker ? (currentMarker.station / totalLength) * 100 : 0;

    return (
        <div style={{
            position: 'fixed',
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: '300px',
            backgroundColor: 'rgba(30,30,30,0.96)',
            border: '1px solid #444',
            borderRadius: '8px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
            zIndex: 1000,
            color: 'white',
            fontFamily: 'Inter, sans-serif',
            overflow: 'hidden',
            userSelect: 'none'
        }}>
            {/* Header */}
            <div
                onMouseDown={handleMouseDown}
                style={{
                    padding: '10px 14px',
                    backgroundColor: '#1a1a2e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'grab',
                    borderBottom: '1px solid #333'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                        <path d="M21 16.5c0 0-4-6.5-12-6.5S3 14 3 14" /><path d="M3 17h18" /><path d="M3 14v4" /><path d="M21 14v4" />
                        <path d="M6 17v-1.5" /><path d="M9 17v-1.5" /><path d="M12 17v-1.5" /><path d="M15 17v-1.5" /><path d="M18 17v-1.5" />
                    </svg>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#E0E0E0', letterSpacing: '0.03em' }}>
                        Herramientas de Civil
                    </span>
                </div>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: 0, display: 'flex' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
            </div>

            {/* Track Selector */}
            {tracks.length > 1 && (
                <div style={{ padding: '8px 14px', borderBottom: '1px solid #333' }}>
                    <select
                        value={selectedTrack}
                        onChange={(e) => handleTrackChange(e.target.value)}
                        style={{
                            width: '100%', background: '#222', border: '1px solid #444',
                            color: 'white', padding: '6px 10px', borderRadius: '4px',
                            fontSize: '12px', outline: 'none', cursor: 'pointer'
                        }}
                    >
                        {tracks.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* P.K. Navigation */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #333' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        P.K. actual
                    </span>
                    <div style={{ display: 'flex', gap: '2px' }}>
                        {/* Zoom to station */}
                        <button onClick={() => flyTo(currentMarker)} title="Zoom a estación"
                            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '2px', display: 'flex' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
                        </button>
                        {/* Section cut */}
                        <button onClick={sectionCut} title="Corte transversal"
                            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '2px', display: 'flex' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 3H3v18h18V3zM3 12h18" /><path d="M12 3v18" strokeDasharray="2 2" /></svg>
                        </button>
                        {/* Clear section */}
                        <button onClick={clearSection} title="Limpiar corte"
                            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '2px', display: 'flex' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                        </button>
                    </div>
                </div>

                {/* Navigation Buttons + Station Display */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button onClick={() => navigate(-10)} title="-100m" style={navBtnStyle}>«</button>
                    <button onClick={() => navigate(-1)} title="-10m" style={navBtnStyle}>‹</button>
                    <div style={{
                        flex: 1, textAlign: 'center', background: '#111',
                        border: '1px solid #444', borderRadius: '4px', padding: '6px 8px',
                        fontSize: '14px', fontWeight: 700, fontFamily: 'monospace',
                        color: '#3b82f6', letterSpacing: '0.5px'
                    }}>
                        {currentMarker ? formatStation(currentMarker.station) : '--'}
                    </div>
                    <button onClick={() => navigate(1)} title="+10m" style={navBtnStyle}>›</button>
                    <button onClick={() => navigate(10)} title="+100m" style={navBtnStyle}>»</button>
                </div>

                {/* Progress Bar */}
                <div style={{ marginTop: '8px', height: '3px', background: '#333', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${progress}%`, height: '100%', background: '#3b82f6', borderRadius: '2px', transition: 'width 0.2s' }} />
                </div>

                {/* Direct Station Input */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <input
                        type="number"
                        value={stationInput}
                        onChange={(e) => setStationInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && jumpToStation()}
                        placeholder="Ir a estación (m)"
                        style={{
                            flex: 1, background: '#111', border: '1px solid #444',
                            color: 'white', padding: '5px 8px', borderRadius: '4px',
                            fontSize: '11px', outline: 'none'
                        }}
                    />
                    <button onClick={jumpToStation} style={{
                        background: '#3b82f6', color: 'white', border: 'none',
                        borderRadius: '4px', padding: '5px 10px', fontSize: '11px',
                        fontWeight: 600, cursor: 'pointer'
                    }}>
                        Ir
                    </button>
                </div>
            </div>

            {/* Properties Panel */}
            <div style={{ borderBottom: '1px solid #333' }}>
                <button
                    onClick={() => setShowProperties(!showProperties)}
                    style={{
                        width: '100%', background: 'none', border: 'none', color: '#aaa',
                        padding: '8px 14px', fontSize: '11px', fontWeight: 600,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                        textTransform: 'uppercase', letterSpacing: '0.5px'
                    }}
                >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{ transform: showProperties ? 'rotate(90deg)' : 'rotate(0deg)', transition: '0.2s' }}>
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                    Propiedades de P.K.
                </button>

                {showProperties && currentMarker && (
                    <div style={{ padding: '0 14px 12px' }}>
                        <PropertyRow label="X (Abscisa)" value={`${currentMarker.x.toFixed(2)} m`} />
                        <PropertyRow label="Y (Ordenada)" value={`${currentMarker.y.toFixed(2)} m`} />
                        <PropertyRow label="Z (Alzado)" value={`${currentMarker.z.toFixed(2)} m`} />
                        <div style={{ borderTop: '1px solid #333', marginTop: '8px', paddingTop: '8px' }}>
                            <PropertyRow label="Estación" value={`${currentMarker.station.toFixed(1)} m`} />
                            <PropertyRow label="Longitud Total" value={`${totalLength.toFixed(1)} m`} />
                            <PropertyRow label="Track" value={selectedTrack} />
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Info */}
            <div style={{ padding: '6px 14px', fontSize: '10px', color: '#555', textAlign: 'center' }}>
                {trackMarkers.length} estaciones · cada 10m
            </div>
        </div>
    );
};

// --- Sub-components ---
const PropertyRow = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
        <span style={{ fontSize: '11px', color: '#888' }}>{label}</span>
        <span style={{ fontSize: '12px', color: '#e0e0e0', fontFamily: 'monospace', fontWeight: 500 }}>{value}</span>
    </div>
);

const navBtnStyle = {
    background: '#222', border: '1px solid #444', color: '#ccc',
    width: '30px', height: '30px', borderRadius: '4px',
    fontSize: '16px', fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0, lineHeight: 1
};

export default StationTracker;
