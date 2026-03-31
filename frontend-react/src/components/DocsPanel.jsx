import React, { useState } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const DocsPanel = ({ selectedElement }) => {
    const [accLink, setAccLink] = useState('');
    const [docType, setDocType] = useState('url'); // 'url', 'pdf', 'image'
    const [isInjecting, setIsInjecting] = useState(false);

    const handleInject = async () => {
        if (!selectedElement || !selectedElement.dbId) {
            alert('Por favor, selecciona un elemento en el modelo primero.');
            return;
        }
        if (!accLink) return;

        setIsInjecting(true);

        const keys = [selectedElement.dbId];
        const muts = [{
            urn: accLink,
            url: accLink,
            type: docType,
            dataType: 25 // Enlace / Hipervínculo nativo de Tandem LMV
        }];

        const payload = { keys, muts };

        try {
            console.log('[DocsPanel] Injecting ACC payload:', payload);
            const res = await fetch(`${BACKEND_URL}/api/docs/mutate-bind`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                alert('Vínculo ACC inyectado al modelo simétricamente.');
                setAccLink('');
            } else {
                alert('Error al inyectar el vínculo ACC. Verifica que la API esté encendida.');
            }
        } catch (e) {
            console.error(e);
            alert('Fallo de red al inyectar al modelo.');
        } finally {
            setIsInjecting(false);
        }
    };

    return (
        <div className="docs-panel" style={{ padding: '20px', color: '#fff', background: '#1c2027', height: '100%', overflowY: 'auto' }}>
            <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '10px', marginTop: 0 }}>Autodesk Docs (ACC)</h3>
            <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '20px', lineHeight: '1.4' }}>
                Pega la URL o URN de referencia de Autodesk Construction Cloud para inyectar su vínculo en el elemento seleccionado en el modelo.
            </p>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', color: '#888', textTransform: 'uppercase' }}>
                    Elemento Destino (Keys)
                </label>
                <div style={{ background: '#0f1115', padding: '12px', borderRadius: '4px', fontSize: '13px', border: '1px solid #333' }}>
                    {selectedElement ? (
                        <>
                            <span style={{ color: '#3aa0ff', fontWeight: 'bold' }}>DBID {selectedElement.dbId}</span>
                            <br/>
                            <span style={{ color: '#666', fontSize: '10px' }}>{selectedElement.modelUrn?.split('/').pop()}</span>
                        </>
                    ) : 'Ninguno. Selecciona en el canvas.'}
                </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', color: '#888', textTransform: 'uppercase' }}>
                    Tipo de Recurso (DataType: 25)
                </label>
                <select 
                    value={docType} 
                    onChange={e => setDocType(e.target.value)}
                    style={{ width: '100%', padding: '10px', background: '#0f1115', border: '1px solid #333', color: '#fff', outline: 'none', borderRadius: '4px' }}
                >
                    <option value="url">URL ACC Web</option>
                    <option value="pdf">Documento PDF (URN)</option>
                    <option value="image">Imagen / Foto</option>
                </select>
            </div>

            <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', color: '#888', textTransform: 'uppercase' }}>
                    URL o URN del Recurso (Muts)
                </label>
                <input
                    type="text"
                    placeholder="https://acc.autodesk.com/docs/..."
                    value={accLink}
                    onChange={(e) => setAccLink(e.target.value)}
                    style={{ width: '100%', padding: '10px', background: '#0f1115', border: '1px solid #333', color: '#fff', outline: 'none', borderRadius: '4px' }}
                />
            </div>

            <button
                onClick={handleInject}
                disabled={isInjecting || !selectedElement || !accLink}
                style={{ 
                    width: '100%', 
                    padding: '12px', 
                    background: selectedElement && accLink && !isInjecting ? '#3b82f6' : '#4b5563', 
                    color: '#fff', 
                    border: 'none', 
                    borderRadius: '4px', 
                    fontWeight: '600', 
                    cursor: selectedElement && accLink && !isInjecting ? 'pointer' : 'not-allowed',
                    transition: 'background 0.2s',
                    position: 'relative'
                }}
            >
                {isInjecting ? 'Inyectando...' : 'Inyectar Simetría (Apply Mut)'}
                
                {isInjecting && (
                    <div className="progressbg" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <div className="spinner" style={{ margin: 0 }}>
                            <div className="bounce1" style={{ width: '8px', height: '8px' }}></div>
                            <div className="bounce2" style={{ width: '8px', height: '8px' }}></div>
                            <div className="bounce3" style={{ width: '8px', height: '8px' }}></div>
                        </div>
                    </div>
                )}
            </button>
        </div>
    );
};

export default DocsPanel;
