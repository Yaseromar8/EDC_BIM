/**
 * UploadModal.jsx — Modal de carga de archivos (Chunked Upload)
 * Refactorización Fase 2: Capa de Modales
 * Extraído de App.jsx líneas 2691-2821
 */
import React from 'react';
import { renderFileIconSop } from '../../utils/fileIcons';
import { formatSizeDetailed } from '../../utils/helpers';
import { confirmAction } from '../../utils/confirm';

/**
 * ACTIVIDAD Y PROGRESO, SEPARADOS.
 *
 * Antes había una barra que se llenaba con el porcentaje real. El porcentaje
 * real NO avanza de forma regular -- llega a saltos, y entre trozo y trozo hay
 * viajes de ida y vuelta en los que no se mueve nada -- así que la barra pegaba
 * tirones y se quedaba congelada. Medido en ACC sobre una subida de 9,1 MB: su
 * porcentaje salta igual que el nuestro (4-7 puntos cada ~330 ms, y un salto de
 * 55 a 77 tras 1,9 s parado), y por eso ACC NO dibuja barra: pone un girador
 * continuo al lado del número. El girador dice «esto sigue vivo», el número dice
 * «cuánto llevas», y ninguna de las dos señales estropea a la otra.
 *
 * Aquí se adopta ese principio y se conserva lo que ya teníamos de más: los
 * bytes transferidos sobre el total, el motivo real de cada espera y Cancelar.
 * Nada se simula ni se interpola: todo sale de los estados que expone
 * `useChunkedUpload`.
 */

/** ¿Sigue pasando algo? Sólo donde el motor está realmente trabajando o esperando él. */
function hayActividad(item) {
  if (['queued', 'init', 'uploading', 'confirming'].includes(item.status)) return true;
  // `paused` son DOS cosas distintas: la cuenta atrás de un reintento (el motor
  // espera solo) y «hace falta el fichero» (espera a una persona). Girar en el
  // segundo caso sería mentir: ahí no avanza nada hasta que alguien actúe.
  return item.status === 'paused' && !item.needsFile;
}

function uploadStatusLabel(item, formatSize) {
  switch (item.status) {
    case 'queued': return 'En cola…';
    case 'init': return 'Preparando la carga segura…';
    // El porcentaje REAL, y los bytes reales: el dato se conserva entero, sólo
    // deja de dibujarse como barra.
    case 'uploading': return `Subiendo · ${item.progress}% · ${formatSize(item.bytesUploaded || 0)} de ${formatSize(item.sizeBytes || 0)}`;
    // Transferencia terminada, confirmación pendiente.
    case 'confirming': return 'Procesando archivo…';
    // El texto del motor, tal cual: «Reintentando en 2s... (1/3)» o «Archivo
    // necesario para reanudar». Lleva los números reales del reintento.
    case 'paused': return item.statusText || 'Conexión interrumpida';
    case 'completed': return item.statusText || 'Archivo listo';
    case 'cancelled': return 'Cancelado';
    default: return item.statusText || 'Esperando…';
  }
}

/** Girador pequeño y continuo. Su velocidad no depende del progreso. */
function Girador({ tam = 10 }) {
  return (
    <div className="acc-mini-spinner" aria-hidden="true"
         style={{ width: tam, height: tam, flexShrink: 0, border: '2px solid var(--accent)',
                  borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1.5s linear infinite' }} />
  );
}

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
  onOpenUploaded,
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
            <span style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }} onClick={() => { chunkedUpload.cancelAll(); onClose(); }}>Cancelar todo</span>
          </div>
          {chunkedUpload.uploads.map(item => (
            <div key={item.id} style={{ padding: '12px', borderBottom: '1px solid #f9f9f9', display: 'flex', gap: 12 }}>
              {renderFileIconSop(item.filename, 28)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.filename}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  {item.status === 'completed' ? (
                    <span style={{ fontSize: 11, color: '#33691e' }}>{uploadStatusLabel(item, formatSize)}</span>
                  ) : item.status === 'error' ? (
                    // EL MISMO MOTIVO QUE ARRIBA. Aquí ponía «Error» a secas, así
                    // que minimizar la ventana te quitaba la razón del fallo:
                    // «No tienes permiso para subir aquí» pasaba a ser «Error».
                    <span style={{ fontSize: 11, color: '#d32f2f' }}>{item.statusText || 'Error'}</span>
                  ) : (
                    // La misma señal que en el modal grande: si las dos
                    // superficies se escriben por separado acaban divergiendo.
                    <>
                      {hayActividad(item) && <Girador tam={9} />}
                      <span style={{ fontSize: 11, color: item.status === 'paused' ? '#f57c00' : '#666' }}>{uploadStatusLabel(item, formatSize)}</span>
                    </>
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
            <button className="file-viewer-close" style={{ background: 'none' }} title="Cerrar"
              onClick={async () => {
                if (!chunkedUpload.hasActiveUploads) { onClose(); return; }
                const canCancel = chunkedUpload.uploads.some(item => ['queued', 'init', 'uploading', 'paused'].includes(item.status));
                if (!canCancel) {
                  setSopMinimized(true);
                  return;
                }
                const ok = await confirmAction({
                  title: 'Cancelar cargas en curso',
                  message: 'Hay archivos subiendo. Si cierras ahora, esas cargas se cancelarán.',
                  confirmText: 'Cancelar cargas',
                  cancelText: 'Seguir subiendo',
                  danger: true,
                });
                if (ok) { chunkedUpload.cancelAll(); onClose(); }
              }}>✕</button>
          </div>
        </div>
        <div className="acc-upload-body" style={{ maxHeight: 600, overflowY: 'auto' }}>
          <div className="acc-upload-entry-section" style={{ marginBottom: 20 }}>
            <button className="acc-upload-btn-secondary" style={{ width: '100%', border: '1px solid var(--accent)', color: '#000', padding: '8px', marginBottom: 12, borderRadius: 2 }} onClick={() => fileRef.current.click()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#666"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
              Desde su equipo
            </button>
            <div className={`acc-upload-dropzone ${dragOver ? 'drag-over' : ''}`} onClick={() => fileRef.current.click()} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} style={{ border: '1px dashed #ddd', padding: '40px 20px', borderRadius: 2, textAlign: 'center' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ddd" strokeWidth="1"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15l3 3 3-3"/></svg>
              <div style={{ color: '#999', fontSize: 13, marginTop: 12 }}>Arrastre archivos aqui o elija una opcion arriba</div>
            </div>
            <input
              type="file"
              ref={fileRef}
              multiple
              style={{ display: 'none' }}
              onChange={event => {
                onUpload(event.target.files);
                event.target.value = '';
              }}
            />
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
                      ) : (
                        // SIN BARRA. El papel de «progressbar» se conserva en la
                        // línea de texto: el rol describe la semántica, no el
                        // dibujo, así que un lector de pantalla sigue recibiendo
                        // el porcentaje aunque ya no haya nada que llenar.
                        <div
                          role="progressbar"
                          aria-label={`Progreso de ${item.filename}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={item.status === 'confirming' ? 100 : item.status === 'uploading' ? item.progress : undefined}
                          aria-valuetext={uploadStatusLabel(item, formatSize)}
                          aria-busy={hayActividad(item)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          {hayActividad(item) && <Girador />}
                          <span style={{ fontSize: 11, color: item.status === 'paused' ? '#f57c00' : '#666' }}>
                            {uploadStatusLabel(item, formatSize)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#999', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ minWidth: 60, textAlign: 'right' }}>{formatSize(item.sizeBytes || 0)}</span>
                    {item.status === 'completed' && item.nodeId && onOpenUploaded && (
                      <button
                        type="button"
                        onClick={() => onOpenUploaded(item)}
                        style={{ border: '1px solid var(--accent)', borderRadius: 4, background: '#fff', color: '#456b95', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '5px 10px' }}
                      >
                        Abrir
                      </button>
                    )}
                    {item.status === 'completed' ? (
                      <span style={{ color: '#33691e', fontSize: 16 }} title="Subido">✓</span>
                    ) : ['queued', 'init', 'uploading', 'paused'].includes(item.status) ? (
                      <span onClick={() => chunkedUpload.cancelUpload(item.id)} style={{ cursor: 'pointer', fontSize: 16 }} title="Cancelar">✕</span>
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
