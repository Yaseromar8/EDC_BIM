import React, { useState, useEffect, useRef } from 'react';

const WorkfrontsPanel = ({ workfronts, setWorkfronts, onClose, isVisible }) => {
    const [position, setPosition] = useState({ x: 300, y: 100 });
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const handleMouseDown = (e) => {
        setIsDragging(true);
        dragOffset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    };

    const handleMouseMove = (e) => {
        if (isDragging) {
            setPosition({
                x: e.clientX - dragOffset.current.x,
                y: e.clientY - dragOffset.current.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    if (!isVisible) return null;

    const addWorkfront = () => {
        const id = Date.now().toString();
        // default next segment
        const last = workfronts[workfronts.length - 1];
        const start = last ? parseInt(last.end, 10) : 0;
        const end = start + 500;
        const newWf = { id, start: start, end: end, color: '#3b82f6', name: `Frente ${workfronts.length + 1}` };
        setWorkfronts([...workfronts, newWf]);
    };

    const removeWorkfront = (id) => {
        setWorkfronts(workfronts.filter(w => w.id !== id));
    };

    const updateWorkfront = (id, field, value) => {
        setWorkfronts(workfronts.map(w => {
            if (w.id === id) {
                return { ...w, [field]: value };
            }
            return w;
        }));
    };

    return (
        <div style={{
            position: 'fixed',
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: '380px',
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '8px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            zIndex: 1000,
            color: 'white',
            fontFamily: 'Inter, sans-serif',
            overflow: 'hidden'
        }}>
            {/* Header / Drag Handle */}
            <div 
                onMouseDown={handleMouseDown}
                style={{
                    padding: '12px 16px',
                    backgroundColor: '#111827',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'grab',
                    borderBottom: '1px solid #374151'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{color: '#9ca3af', fontSize:'14px'}}>✋</span>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#f3f4f6' }}>
                        Gestor de Frentes (Heatmap)
                    </h3>
                </div>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, display: 'flex', fontSize:'14px' }}>
                    ❌
                </button>
            </div>

            {/* List */}
            <div style={{ padding: '16px', maxHeight: '400px', overflowY: 'auto' }}>
                <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: 0, marginBottom: '16px' }}>
                    Define los rangos de kilometraje para pintar la vía 3D.
                </p>

                {workfronts.map((wf, index) => (
                    <div key={wf.id || index} style={{ 
                        display: 'flex', flexDirection: 'column', gap: '8px', 
                        marginBottom: '16px', padding: '12px', backgroundColor: '#374151', 
                        borderRadius: '6px', borderLeft: `4px solid ${wf.color}` 
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <input 
                                type="text"
                                value={wf.name}
                                onChange={(e) => updateWorkfront(wf.id, 'name', e.target.value)}
                                style={{ background: 'transparent', border: 'none', color: 'white', fontWeight: 'bold', fontSize: '13px', outline: 'none', flex: 1 }}
                            />
                            <button onClick={() => removeWorkfront(wf.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize:'14px' }}>
                                🗑️
                            </button>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                <label style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '2px' }}>KM Inicio</label>
                                <input 
                                    type="number" 
                                    value={wf.start}
                                    onChange={(e) => updateWorkfront(wf.id, 'start', parseInt(e.target.value, 10) || 0)}
                                    style={{ background: '#111827', border: '1px solid #4b5563', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', width: '100%' }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                <label style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '2px' }}>KM Fin</label>
                                <input 
                                    type="number" 
                                    value={wf.end}
                                    onChange={(e) => updateWorkfront(wf.id, 'end', parseInt(e.target.value, 10) || 0)}
                                    style={{ background: '#111827', border: '1px solid #4b5563', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', width: '100%' }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', width: '40px' }}>
                                <label style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '2px' }}>Color</label>
                                <input 
                                    type="color" 
                                    value={wf.color}
                                    onChange={(e) => updateWorkfront(wf.id, 'color', e.target.value)}
                                    style={{ background: 'none', border: 'none', width: '100%', height: '24px', cursor: 'pointer', padding: 0 }}
                                />
                            </div>
                        </div>
                    </div>
                ))}

                <button 
                    onClick={addWorkfront}
                    style={{
                        width: '100%', padding: '8px', backgroundColor: '#3b82f6', color: 'white', 
                        border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold', 
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#2563eb'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = '#3b82f6'}
                >
                    ➕ Agregar Rango
                </button>
            </div>
        </div>
    );
};

export default WorkfrontsPanel;
