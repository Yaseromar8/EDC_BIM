// DocQuickView.jsx — Visor rápido de documentos (overlay) para Revisiones, Conjuntos, etc.
// Recibe { name, url, nodeId } ya resuelto (signed URL) y muestra PDF/imagen/video.
import React from 'react';
import PDFViewer from './PDFViewer';

export default function DocQuickView({ file, projectPrefix, onClose,
                                       versionLabel = null, versionInfo = null }) {
  if (!file) return null;
  const lower = file.name.toLowerCase();
  const isPdf = lower.endsWith('.pdf');
  const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].some(e => lower.endsWith(e));
  const isVideo = ['.mp4', '.webm', '.ogg'].some(e => lower.endsWith(e));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 12000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '92vw', height: '90vh', background: '#fff', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 50px rgba(0,0,0,0.4)' }}>
        <div style={{ height: 46, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e5e5e5', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a href={file.url} target="_blank" rel="noopener noreferrer" title="Descargar"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, color: '#666', textDecoration: 'none' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </a>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#666', cursor: 'pointer' }}>✕</button>
          </div>
        </div>
        <div style={{ flex: 1, position: 'relative', background: '#f5f5f5', minHeight: 0 }}>
          {isPdf && <PDFViewer url={file.url} fileName={file.name} nodeId={file.nodeId || null}
                               projectPrefix={projectPrefix}
                               versionLabel={versionLabel} versionInfo={versionInfo} />}
          {isImage && (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <img src={file.url} alt={file.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
          )}
          {isVideo && (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
              <video controls autoPlay style={{ maxWidth: '100%', maxHeight: '100%' }}><source src={file.url} /></video>
            </div>
          )}
          {!isPdf && !isImage && !isVideo && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: '#666', fontSize: 14 }}>
              Sin vista previa para este formato.
              <a href={file.url} target="_blank" rel="noopener noreferrer" style={{ background: 'var(--accent)', color: '#fff', padding: '9px 20px', borderRadius: 6, textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>Descargar archivo</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
