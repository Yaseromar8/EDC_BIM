import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch';

const BACKEND_URL = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ? 'https://visor-ecd-backend.onrender.com' : (import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3000' : (typeof window !== 'undefined' && window.location.hostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/) ? `http://${window.location.hostname}:3000` : 'https://visor-ecd-backend.onrender.com')));

// Resuelve el external_id (ancla estable) del elemento seleccionado a partir de
// su dbId+urn, usando el mapa external_id->dbId que arma el visor al cargar.
function resolveExternalId(urn, dbId) {
    const map = window.rosettaToDbId && urn ? window.rosettaToDbId[urn] : null;
    if (map) {
        for (const ext in map) if (map[ext] === dbId) return ext;
    }
    // Fallback: buscar en cualquier urn cargado
    if (window.rosettaToDbId) {
        for (const u in window.rosettaToDbId) {
            const m = window.rosettaToDbId[u];
            for (const ext in m) if (m[ext] === dbId) return ext;
        }
    }
    return null;
}

const TYPE_ICON = { url: '🔗', pdf: '📄', image: '🖼️' };

const DocsPanel = ({ selectedElement }) => {
    const [accLink, setAccLink] = useState('');
    const [title, setTitle] = useState('');
    const [docType, setDocType] = useState('url');
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState(null); // { type:'ok'|'err', msg }
    const [docs, setDocs] = useState([]);

    const extId = selectedElement && selectedElement.dbId != null
        ? resolveExternalId(selectedElement.urn, selectedElement.dbId)
        : null;

    const loadDocs = useCallback(async (ext, urn) => {
        if (!ext) { setDocs([]); return; }
        try {
            // La obra viaja tambien en la LECTURA. El POST de al lado ya la
            // mandaba y el GET no, asi que el control por obra no podia saber de
            // que obra era esta consulta: un `external_id` no identifica una
            // obra -- en inventory_assets solo es unico JUNTO al model_urn.
            const q = new URLSearchParams({ external_id: ext });
            if (urn) q.set('model_urn', urn);
            const r = await apiFetch(`${BACKEND_URL}/api/element-docs?${q.toString()}`);
            const d = await r.json();
            setDocs(d.success ? d.docs : []);
        } catch (e) { setDocs([]); }
    }, []);

    useEffect(() => { loadDocs(extId, selectedElement?.urn); setStatus(null); },
        [extId, selectedElement, loadDocs]);

    const handleAdd = async () => {
        if (!extId) { setStatus({ type: 'err', msg: 'Selecciona un elemento en el modelo primero.' }); return; }
        if (!accLink.trim()) return;
        setBusy(true); setStatus(null);
        try {
            const r = await apiFetch(`${BACKEND_URL}/api/element-docs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    external_id: extId, url: accLink.trim(), doc_type: docType,
                    title: title.trim() || null, model_urn: selectedElement.urn
                })
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.error || 'No se pudo vincular');
            setAccLink(''); setTitle('');
            setStatus({ type: 'ok', msg: 'Documento vinculado al elemento.' });
            loadDocs(extId, selectedElement?.urn);
        } catch (e) {
            setStatus({ type: 'err', msg: e.message || 'Error al vincular el documento.' });
        } finally { setBusy(false); }
    };

    const handleRemove = async (id) => {
        try {
            await apiFetch(`${BACKEND_URL}/api/element-docs/${id}`, { method: 'DELETE' });
            setDocs(prev => prev.filter(x => x.id !== id));
        } catch (e) { setStatus({ type: 'err', msg: 'No se pudo eliminar.' }); }
    };

    return (
        <div className="docs-panel" style={{ padding: '20px', color: '#fff', background: 'transparent', height: '100%', overflowY: 'auto' }}>
            <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px', marginTop: 0 }}>Documentos del elemento</h3>
            <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '18px', lineHeight: '1.4' }}>
                Vincula URLs o documentos (ACC, planos, fotos) al elemento seleccionado. Se guardan en PostgreSQL por su ID estable, así sobreviven a las actualizaciones del modelo.
            </p>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', color: '#888', textTransform: 'uppercase' }}>Elemento destino</label>
                <div style={{ background: '#0f1115', padding: '12px', borderRadius: '4px', fontSize: '13px', border: '1px solid #333' }}>
                    {selectedElement ? (
                        extId ? (
                            <>
                                <span style={{ color: '#7e9bbd', fontWeight: 'bold' }}>ID …{String(extId).slice(-12)}</span><br />
                                <span style={{ color: '#666', fontSize: '10px' }}>{selectedElement.urn?.split('/').pop()}</span>
                            </>
                        ) : (
                            <span style={{ color: '#e0a23d' }}>Elemento sin ID estable (no se puede vincular).</span>
                        )
                    ) : 'Ninguno. Selecciona en el canvas.'}
                </div>
            </div>

            {/* Lista de documentos ya vinculados */}
            {docs.length > 0 && (
                <div style={{ marginBottom: '18px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', color: '#888', textTransform: 'uppercase' }}>Vinculados ({docs.length})</label>
                    {docs.map(doc => (
                        <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0f1115', border: '1px solid #2a2f3a', borderRadius: 4, padding: '8px 10px', marginBottom: 6 }}>
                            <span>{TYPE_ICON[doc.doc_type] || '🔗'}</span>
                            <a href={doc.url} target="_blank" rel="noopener noreferrer" title={doc.url}
                                style={{ flex: 1, color: '#7e9bbd', fontSize: 12, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {doc.title || doc.url}
                            </a>
                            <button onClick={() => handleRemove(doc.id)} title="Quitar"
                                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14 }}>×</button>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', color: '#888', textTransform: 'uppercase' }}>Tipo</label>
                <select value={docType} onChange={e => setDocType(e.target.value)}
                    style={{ width: '100%', padding: '10px', background: '#0f1115', border: '1px solid #333', color: '#fff', outline: 'none', borderRadius: '4px' }}>
                    <option value="url">URL / Enlace web (ACC)</option>
                    <option value="pdf">Documento PDF</option>
                    <option value="image">Imagen / Foto</option>
                </select>
            </div>

            <div style={{ marginBottom: '12px' }}>
                <input type="text" placeholder="Título (opcional)" value={title} onChange={e => setTitle(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px', background: '#0f1115', border: '1px solid #333', color: '#fff', outline: 'none', borderRadius: '4px' }} />
            </div>

            <div style={{ marginBottom: '16px' }}>
                <input type="text" placeholder="https://acc.autodesk.com/docs/..." value={accLink}
                    onChange={(e) => setAccLink(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px', background: '#0f1115', border: '1px solid #333', color: '#fff', outline: 'none', borderRadius: '4px' }} />
            </div>

            {status && (
                <div style={{ marginBottom: 12, fontSize: 12, padding: '8px 10px', borderRadius: 4, background: status.type === 'ok' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: status.type === 'ok' ? '#5fbf67' : '#e06a6a', border: `1px solid ${status.type === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                    {status.msg}
                </div>
            )}

            <button onClick={handleAdd} disabled={busy || !extId || !accLink.trim()}
                style={{ width: '100%', padding: '12px', background: (extId && accLink.trim() && !busy) ? '#3b82f6' : '#4b5563', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: '600', cursor: (extId && accLink.trim() && !busy) ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }}>
                {busy ? 'Vinculando…' : 'Vincular documento'}
            </button>
        </div>
    );
};

export default DocsPanel;
