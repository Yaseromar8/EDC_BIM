import React, { useState, useEffect, useRef } from 'react';

const CivilStationTracker = ({ viewerRef }) => {
    const [isVisible, setIsVisible] = useState(true);
    const [position, setPosition] = useState({ x: 20, y: 100 });
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const [contextData, setContextData] = useState(null);
    const [stationInput, setStationInput] = useState('0+000.00');
    const [isPlaying, setIsPlaying] = useState(false);

    // Manejar arrastre
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

    // Escuchar evento del Tracker
    useEffect(() => {
        const handleContextChange = (e) => {
            const data = e.detail;
            setContextData(data);
            
            // Format station input if not currently typing
            if (document.activeElement?.id !== 'station-input') {
                setStationInput(formatStation(data.station));
            }
        };

        window.addEventListener('LOB4D_PK_CONTEXT_CHANGED', handleContextChange);
        return () => window.removeEventListener('LOB4D_PK_CONTEXT_CHANGED', handleContextChange);
    }, []);

    const formatStation = (stationMeters) => {
        if (stationMeters == null || isNaN(stationMeters)) return '0+000.00';
        const km = Math.floor(Math.abs(stationMeters) / 1000);
        const m = Math.abs(stationMeters) % 1000;
        const sign = stationMeters < 0 ? '-' : '';
        return `${sign}${km}+${m.toFixed(2).padStart(6, '0')}`;
    };

    const parseStation = (str) => {
        const parts = String(str).split('+');
        if (parts.length === 2) {
            const km = parseFloat(parts[0]) || 0;
            const m = parseFloat(parts[1]) || 0;
            return (km >= 0 ? 1 : -1) * (Math.abs(km) * 1000 + m);
        }
        return parseFloat(str) || 0;
    };

    const handleStationSubmit = (e) => {
        if (e.key === 'Enter') {
            const val = parseStation(stationInput);
            if (!isNaN(val) && viewerRef?.current) {
                const ext = viewerRef.current.getExtension('LOB4DExtension');
                if (ext && ext.setStation) {
                    ext.setStation(val);
                }
            }
        }
    };

    const handleStep = (delta) => {
        if (!contextData || !viewerRef?.current) return;
        const newVal = contextData.station + delta;
        const ext = viewerRef.current.getExtension('LOB4DExtension');
        if (ext && ext.setStation) {
            ext.setStation(newVal);
        }
    };

    const toggleSimulation = () => {
        if (!viewerRef?.current) return;
        const ext = viewerRef.current.getExtension('LOB4DExtension');
        if (ext) {
            if (isPlaying) {
                ext.stopAnimation();
                setIsPlaying(false);
            } else {
                ext.startAnimation();
                setIsPlaying(true);
            }
        }
    };

    if (!isVisible) return null;

    const rowStyle = "flex justify-between items-center py-2 text-[13px] border-b border-gray-100";
    const labelStyle = "text-gray-600 font-medium";
    const valStyle = "text-gray-800";
    const sectionHeader = "bg-gray-50 px-4 py-2 font-semibold text-sm text-gray-700 flex items-center border-y border-gray-200 mt-2 cursor-pointer";

    return (
        <div style={{
            position: 'fixed', left: `${position.x}px`, top: `${position.y}px`,
            width: '320px', zIndex: 1000, userSelect: 'none'
        }} className="bg-white shadow-xl rounded-md border border-gray-200 flex flex-col font-sans overflow-hidden">
            
            {/* Header ACC Style */}
            <div 
                onMouseDown={handleMouseDown} 
                className="bg-white px-4 py-3 border-b border-gray-200 flex justify-between items-center cursor-move"
            >
                <h3 className="text-gray-800 font-medium text-[15px]">Herramientas de civil</h3>
                <div className="flex space-x-2 text-gray-500">
                    <button className="hover:text-blue-500 transition-colors">⚙️</button>
                    <button onClick={() => setIsVisible(false)} className="hover:text-red-500 transition-colors">✕</button>
                </div>
            </div>

            {!contextData ? (
                <div className="p-6 text-center text-gray-500 text-sm">
                    Esperando datos topográficos...<br/><br/>
                    Selecciona un Eje en el panel 4D LOB o extrae las curvas.
                </div>
            ) : (
                <>
                    {/* P.K. Controller */}
                    <div className="px-4 py-3">
                        <div className="text-sm font-semibold text-gray-700 mb-2">P.K. actual</div>
                        <div className="flex items-center space-x-1">
                            <button onClick={() => handleStep(-(contextData.stationIncrement || 10))} className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded">«</button>
                            <button onClick={() => handleStep(-1)} className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded">‹</button>
                            
                            <input 
                                id="station-input"
                                type="text" 
                                value={stationInput}
                                onChange={(e) => setStationInput(e.target.value)}
                                onKeyDown={handleStationSubmit}
                                onBlur={() => setStationInput(formatStation(contextData.station))}
                                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-center text-sm font-medium focus:outline-none focus:border-blue-500"
                            />
                            
                            <button onClick={() => handleStep(1)} className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded">›</button>
                            <button onClick={() => handleStep(contextData.stationIncrement || 10)} className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded">»</button>
                        </div>
                        
                        <div className="mt-3">
                            <button 
                                onClick={toggleSimulation}
                                className={`w-full py-1.5 rounded text-sm font-medium transition-colors ${
                                    isPlaying 
                                    ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100' 
                                    : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100'
                                }`}
                            >
                                {isPlaying ? '⏹ Detener Simulación Espacial' : '▶ Iniciar Simulación Espacial'}
                            </button>
                            <p className="text-[11px] text-gray-400 mt-1 text-center leading-tight">
                                Demuestra cómo la aplicación aísla geométricamente los objetos a medida que avanza el PK.
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto max-h-[400px]">
                        {/* Coordenadas */}
                        <div className="px-4 pb-2">
                            <div className={rowStyle}>
                                <span className={labelStyle}>X (Abscisa)</span>
                                <span className={valStyle}>{contextData.x?.toFixed(2)} m</span>
                            </div>
                            <div className={rowStyle}>
                                <span className={labelStyle}>Y (Ordenada)</span>
                                <span className={valStyle}>{contextData.y?.toFixed(2)} m</span>
                            </div>
                            <div className={rowStyle}>
                                <span className={labelStyle}>Z (Alzado)</span>
                                <span className={valStyle}>{contextData.z?.toFixed(2)} m</span>
                            </div>
                        </div>

                        {/* Horizontal Tangent / Curve */}
                        {contextData.horizontal && (
                            <>
                                <div className={sectionHeader}>
                                    <span className="mr-2">˅</span> Horizontal {contextData.horizontal.type}
                                </div>
                                <div className="px-4 py-1">
                                    <div className={rowStyle}>
                                        <span className={labelStyle}>P.K. inicial</span>
                                        <span className={valStyle}>{contextData.horizontal.startStation?.toFixed(2)} m</span>
                                    </div>
                                    <div className={rowStyle}>
                                        <span className={labelStyle}>P.K. final</span>
                                        <span className={valStyle}>{contextData.horizontal.endStation?.toFixed(2)} m</span>
                                    </div>
                                    <div className={rowStyle}>
                                        <span className={labelStyle}>Longitud</span>
                                        <span className={valStyle}>{contextData.horizontal.length?.toFixed(2)} m</span>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Vertical Tangent / Parabola */}
                        {contextData.vertical && (
                            <>
                                <div className={sectionHeader}>
                                    <span className="mr-2">˅</span> Vertical {contextData.vertical.type}
                                </div>
                                <div className="px-4 py-1 pb-4">
                                    <div className={rowStyle}>
                                        <span className={labelStyle}>P.K. inicial</span>
                                        <span className={valStyle}>{contextData.vertical.startStation?.toFixed(2)} m</span>
                                    </div>
                                    <div className={rowStyle}>
                                        <span className={labelStyle}>P.K. final</span>
                                        <span className={valStyle}>{contextData.vertical.endStation?.toFixed(2)} m</span>
                                    </div>
                                    <div className={rowStyle}>
                                        <span className={labelStyle}>Longitud</span>
                                        <span className={valStyle}>{contextData.vertical.length?.toFixed(2)} m</span>
                                    </div>
                                    {contextData.vertical.grade !== undefined && (
                                        <div className={rowStyle}>
                                            <span className={labelStyle}>Pendiente</span>
                                            <span className={valStyle}>{(contextData.vertical.grade * 100).toFixed(2)} %</span>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default CivilStationTracker;
