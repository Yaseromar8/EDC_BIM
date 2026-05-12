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
        const newWf = { id, start: start, end: end, color: '#3b82f6', name: `Frente ${workfronts.length + 1}`, track: 'PG' };
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
            backgroundColor: 'rgba(30,30,30,0.95)',
            border: '1px solid #444',
            borderRadius: '6px',
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
                    backgroundColor: '#2A2A2A',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'grab',
                    borderBottom: '1px solid #444',
                    borderTopLeftRadius: '6px',
                    borderTopRightRadius: '6px'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{color: '#888', display: 'flex', alignItems: 'center', opacity: 0.7}}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
                    </div>
                    <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#E0E0E0', letterSpacing: '0.02em' }}>
                        Gestor de Frentes (Heatmap)
                    </h3>
                </div>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 0, display: 'flex' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
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
                        marginBottom: '16px', padding: '12px', backgroundColor: '#333', 
                        borderRadius: '6px', borderLeft: `6px solid ${wf.color}` 
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <input 
                                type="text"
                                value={wf.name}
                                onChange={(e) => updateWorkfront(wf.id, 'name', e.target.value)}
                                style={{ background: 'transparent', border: 'none', color: 'white', fontWeight: 'bold', fontSize: '13px', outline: 'none', flex: 1 }}
                            />
                            <button onClick={() => removeWorkfront(wf.id)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'} onMouseLeave={(e) => e.currentTarget.style.color = '#888'}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                <label style={{ fontSize: '10px', color: '#888', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Progresiva</label>
                                <select
                                    value={wf.track || 'ALL'}
                                    onChange={(e) => updateWorkfront(wf.id, 'track', e.target.value)}
                                    style={{ background: '#222', border: '1px solid #555', color: 'white', padding: '6px 8px', borderRadius: '4px', fontSize: '12px', width: '100%', outline: 'none', cursor: 'pointer' }}
                                >
                                    <option value="PG">Santa Rita (PG)</option>
                                    <option value="POL">Politécnico (POL)</option>
                                    <option value="ALL">Ambos</option>
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                <label style={{ fontSize: '10px', color: '#888', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>KM Inicio</label>
                                <input 
                                    type="number" 
                                    value={wf.start}
                                    onChange={(e) => updateWorkfront(wf.id, 'start', parseInt(e.target.value, 10) || 0)}
                                    style={{ background: '#222', border: '1px solid #555', color: 'white', padding: '6px 8px', borderRadius: '4px', fontSize: '12px', width: '100%', outline: 'none' }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                <label style={{ fontSize: '10px', color: '#888', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>KM Fin</label>
                                <input 
                                    type="number" 
                                    value={wf.end}
                                    onChange={(e) => updateWorkfront(wf.id, 'end', parseInt(e.target.value, 10) || 0)}
                                    style={{ background: '#222', border: '1px solid #555', color: 'white', padding: '6px 8px', borderRadius: '4px', fontSize: '12px', width: '100%', outline: 'none' }}
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
                        width: '100%', padding: '8px', backgroundColor: 'transparent', color: '#3AA0FF', 
                        border: '1px dashed #3AA0FF', borderRadius: '4px', fontSize: '13px', fontWeight: '500', 
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { e.target.style.backgroundColor = 'rgba(58, 160, 255, 0.1)'; e.target.style.color = '#4db8ff'; }}
                    onMouseLeave={(e) => { e.target.style.backgroundColor = 'transparent'; e.target.style.color = '#3AA0FF'; }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    Agregar Segmento
                </button>
            </div>
        </div>
    );
};

export default WorkfrontsPanel;
