/**
 * UploadModal.jsx — Modal de carga de archivos (Chunked Upload)
 * Refactorización Fase 2: Capa de Modales
 * Extraído de App.jsx líneas 2691-2821
 */
import React, { useRef } from 'react';
import { renderFileIconSop } from '../../utils/fileIcons';
import { formatSizeDetailed } from '../../utils/helpers';

export default function UploadModal({
  isOpen,
  sopMinimized, setSopMinimized,
  currentPath,
  chunkedUpload,
  fileRef,
  dragOver,
  onDragOver, onDragLeave, onDrop,
  onUpload,
  onListo,
  onClose,
}) {
  if (!isOpen) return null;

  const formatSize = formatSizeDetailed;

  // ── Minimized Monitor ──
  if (sopMinimized) {
    return (
      <div className="acc-upload-monitor" style={{ position: 'fixed', bottom: 20, right: 20, width: 320, background: '#fff', border: '1px solid #ddd', borderRadius: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 10000, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', background: '#fcfcfc', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Cargar</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }} onClick={() => setSopMinimized(false)}>^</button>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }} onClick={onClose}>X</button>
          </div>
        </div>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          <div style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: 12, color: '#333' }}>Total de {chunkedUpload.uploads.length} {chunkedUpload.uploads.length === 1 ? 'archivo' : 'archivos'}...</span>
            <span style={{ fontSize: 12, color: '#0696d7', cursor: 'pointer', fontWeight: 600 }} onClick={() => { chunkedUpload.cancelAll(); onClose(); }}>Cancelar todo</span>
          </div>
          {chunkedUpload.uploads.map(item => (
            <div key={item.id} style={{ padding: '12px', borderBottom: '1px solid #f9f9f9', display: 'flex', gap: 12 }}>
              {renderFileIconSop(item.filename, 28)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.filename}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  {item.status === 'completed' ? (
                    <span style={{ fontSize: 11, color: '#33691e' }}>Listo</span>
                  ) : item.status === 'error' ? (
                    <span style={{ fontSize: 11, color: '#d32f2f' }}>Error</span>
                  ) : (
                    <span style={{ fontSize: 11, color: '#666' }}>{item.status === 'paused' ? 'Pausado' : item.status === 'queued' ? 'En cola' : `Cargando: ${item.progress}%`}</span>
                  )}
                  <span style={{ fontSize: 11, color: '#999' }}>| {formatSize(item.sizeBytes || 0)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Full Modal ──
  return (
    <div className="modal-overlay" onClick={() => { if (!chunkedUpload.hasActiveUploads) onClose(); }}>
      <div className="acc-upload-modal" onClick={e => e.stopPropagation()}>
        <div className="acc-upload-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Cargar archivos</span>
            <span style={{ color: '#999', fontSize: 12 }}>{currentPath.split('/').filter(Boolean).pop()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="file-viewer-close" style={{ background: 'none' }} onClick={() => setSopMinimized(true)}>-</button>
            <button className="file-viewer-close" style={{ background: 'none' }} onClick={() => { if (!chunkedUpload.hasActiveUploads) onClose(); else if (window.confirm('Cancelar cargas en curso?')) { chunkedUpload.cancelAll(); onClose(); } }}>X</button>
          </div>
        </div>
        <div className="acc-upload-body" style={{ maxHeight: 600, overflowY: 'auto' }}>
          <div className="acc-upload-entry-section" style={{ marginBottom: 20 }}>
            <button className="acc-upload-btn-secondary" style={{ width: '100%', border: '1px solid #0696d7', color: '#000', padding: '8px', marginBottom: 12, borderRadius: 2 }} onClick={() => fileRef.current.click()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#666"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
              Desde su equipo
            </button>
            <div className={`acc-upload-dropzone ${dragOver ? 'drag-over' : ''}`} onClick={() => fileRef.current.click()} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} style={{ border: '1px dashed #ddd', padding: '40px 20px', borderRadius: 2, textAlign: 'center' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ddd" strokeWidth="1"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15l3 3 3-3"/></svg>
              <div style={{ color: '#999', fontSize: 13, marginTop: 12 }}>Arrastre archivos aqui o elija una opcion arriba</div>
            </div>
            <input type="file" ref={fileRef} multiple style={{ display: 'none' }} onChange={e => onUpload(e.target.files)} />
          </div>
          {chunkedUpload.uploads.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 13, color: '#333', marginBottom: 16, fontWeight: 300 }}>
                Total de {chunkedUpload.uploads.length} {chunkedUpload.uploads.length === 1 ? 'archivo' : 'archivos'}
              </div>
              {chunkedUpload.uploads.map(item => (
                <div key={item.id} className="acc-upload-file-row">
                  {renderFileIconSop(item.filename, 32)}
                  <div className="acc-upload-file-info">
                    <div className="acc-upload-file-name">{item.filename}</div>
                    <div className="acc-upload-file-status" style={{ marginTop: 4 }}>
                      {item.status === 'completed' ? (
                        <div style={{ color: '#33691e', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                          {item.statusText}
                        </div>
                      ) : item.status === 'error' ? (
                        <div style={{ color: '#d32f2f', fontSize: 11 }}>{item.statusText}</div>
                      ) : item.status === 'paused' ? (
                        <div style={{ color: '#f57c00', fontSize: 11 }}>{item.statusText}</div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {(item.status === 'confirming' || item.status === 'init') && (
                                <div className="acc-mini-spinner" style={{ width: 10, height: 10, border: '2px solid #0696d7', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1.5s linear infinite' }} />
                              )}
                              <span style={{ fontSize: 11, color: '#666' }}>
                                {item.status === 'queued' ? 'En cola...' : item.status === 'init' ? 'Validando...' : item.status === 'confirming' ? 'Procesando...' : `Cargando... (${formatSize(item.bytesUploaded || 0)} / ${formatSize(item.sizeBytes || 0)})`}
                              </span>
                            </div>
                            {item.status === 'uploading' && <span style={{ fontSize: 11, color: '#0696d7', fontWeight: 600 }}>{item.progress}%</span>}
                          </div>
                          <div className="acc-progress-container" style={{ marginTop: 6, height: 6, background: '#e8e8e8', borderRadius: 3, overflow: 'hidden' }}>
                            {item.status === 'confirming' || item.status === 'init' ? (
                              <div className="acc-progress-bar indeterminate" style={{ height: '100%', borderRadius: 3 }} />
                            ) : (
                              <div className="acc-progress-bar" style={{ width: `${item.progress}%`, height: '100%', borderRadius: 3, transition: 'width 0.3s ease', background: item.status === 'paused' ? '#ff9800' : '#0696d7' }} />
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#999', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ minWidth: 60, textAlign: 'right' }}>{formatSize(item.sizeBytes || 0)}</span>
                    {item.status === 'completed' ? (
                      <span style={{ color: '#0696d7', fontWeight: 600, cursor: 'pointer' }}>Ver</span>
                    ) : item.status !== 'cancelled' ? (
                      <span onClick={() => chunkedUpload.cancelUpload(item.id)} style={{ cursor: 'pointer', fontSize: 16 }}>X</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="acc-upload-footer">
          <button className="acc-btn-listo" disabled={chunkedUpload.hasActiveUploads} onClick={onListo}>Listo</button>
        </div>
      </div>
    </div>
  );
}
