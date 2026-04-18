import React, { useState, useEffect } from 'react';
import './DocPinPanel.css'; // Reutilizamos estilos base de paneles flotantes

const MaqPinPanel = ({
    isOpen,
    onClose,
    pin,
    onUpdate
}) => {
    if (!isOpen || !pin) return null;

    const [equipo, setEquipo] = useState(pin.equipo || '');
    const [personal, setPersonal] = useState(pin.personal || '');
    const [actividad, setActividad] = useState(pin.actividad || '');

    // Sincronizar estado local si el pin cambia exteriormente
    useEffect(() => {
        if (pin) {
            setEquipo(pin.equipo || '');
            setPersonal(pin.personal || '');
            setActividad(pin.actividad || '');
        }
    }, [pin]);

    const handleSave = () => {
        if (onUpdate) {
            onUpdate('maquinaria', pin.id, {
                equipo,
                personal,
                actividad,
                val: equipo // Mantener compatibilidad interna si usa 'val'
            });
        }
    };

    return (
        <div className="docpin-modal" style={{ width: '350px', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(168, 85, 247, 0.5)' }}>
            <header className="docpin-header" style={{ borderBottom: '1px solid rgba(168, 85, 247, 0.3)', padding: '12px 16px' }}>
                <div className="docpin-title-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>🚜</span>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: 0, fontSize: '14px', color: '#fff', textTransform: 'uppercase' }}>Editar Maquinaria</h3>
                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>ID: {pin.id?.substring(0, 8)}</span>
                    </div>
                </div>
                <div className="docpin-actions">
                    <button className="docpin-close-btn" onClick={onClose} style={{ color: '#fff' }}>&times;</button>
                </div>
            </header>

            <div className="docpin-content" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 600, textTransform: 'uppercase' }}>Tipo de Equipo</label>
                    <input 
                        type="text" 
                        value={equipo} 
                        onChange={e => setEquipo(e.target.value)}
                        onBlur={handleSave}
                        placeholder="Ej: Excavadora, Grúa, Volquete"
                        style={{
                            background: 'rgba(30, 41, 59, 0.8)',
                            border: '1px solid #475569',
                            color: 'white',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            fontSize: '13px',
                            outline: 'none',
                            transition: 'border-color 0.2s ease'
                        }}
                        onFocus={e => e.target.style.borderColor = '#a855f7'}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 600, textTransform: 'uppercase' }}>Personal a Cargo</label>
                    <input 
                        type="text" 
                        value={personal} 
                        onChange={e => setPersonal(e.target.value)}
                        onBlur={handleSave}
                        placeholder="Nombre del operario"
                        style={{
                            background: 'rgba(30, 41, 59, 0.8)',
                            border: '1px solid #475569',
                            color: 'white',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            fontSize: '13px',
                            outline: 'none',
                            transition: 'border-color 0.2s ease'
                        }}
                        onFocus={e => e.target.style.borderColor = '#a855f7'}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 600, textTransform: 'uppercase' }}>Actividad Actual</label>
                    <textarea 
                        value={actividad} 
                        onChange={e => setActividad(e.target.value)}
                        onBlur={handleSave}
                        placeholder="Describa la labor que está realizando"
                        rows={3}
                        style={{
                            background: 'rgba(30, 41, 59, 0.8)',
                            border: '1px solid #475569',
                            color: 'white',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            fontSize: '13px',
                            outline: 'none',
                            resize: 'none',
                            fontFamily: 'inherit',
                            transition: 'border-color 0.2s ease'
                        }}
                        onFocus={e => e.target.style.borderColor = '#a855f7'}
                    />
                </div>
            </div>
            <div style={{ padding: '0 16px 16px 16px', display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ fontSize: '10px', color: '#a855f7', fontStyle: 'italic' }}>
                    * Los cambios se guardan automáticamente
                </div>
            </div>
        </div>
    );
};

export default MaqPinPanel;
