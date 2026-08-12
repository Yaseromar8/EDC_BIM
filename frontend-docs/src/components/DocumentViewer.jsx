// frontend-docs/src/components/DocumentViewer.jsx
import React, { useState, useEffect, lazy, Suspense } from 'react';
import PDFViewer from './PDFViewer';
import { apiFetch } from '../utils/apiFetch';
import { getRecentPdfUrl } from '../utils/recentPdfCache';

// El visor CAD arrastra el visor de Autodesk: diferido para que no pese en el
// arranque de quien nunca abre un DWG.
const CadViewer = lazy(() => import('./CadViewer'));

// Formatos que Model Derivative sabe traducir. Debe ir en paralelo con
// CAD_EXTENSIONS de backend/routes/docs_cad.py.
const CAD_EXTENSIONS = [
  '.dwg', '.dxf', '.dwf', '.dwfx', '.rvt', '.rfa', '.ifc', '.nwd', '.nwc',
  '.dgn', '.3dm', '.sat', '.step', '.stp', '.iges', '.igs', '.obj', '.fbx', '.stl',
];

// Utility formatters
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function DocumentViewer({
  file,
  projectPrefix,
  isShared = false,
  sharedRole = null,
  
  versionHistory = [],
  viewedVersionInfo = null,
  setViewedVersionInfo = null,
  showVersions = false,
  setShowVersions = null,
  
  isAdmin = false,
  onPromote = null,
  
  API,
  onClose
}) {

  const [officeUrl, setOfficeUrl] = useState('');
  const [loadingOffice, setLoadingOffice] = useState(false);
  const [securePreviewUrl, setSecurePreviewUrl] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewRetry, setPreviewRetry] = useState(0);

  useEffect(() => {
    if (!file) return;
    
    const lowerName = file.name.toLowerCase();
    if (['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'].some(ext => lowerName.endsWith(ext))) {
      // Si es enlace compartido, ya tenemos la URL firmada
      if (isShared && file.url) {
        queueMicrotask(() => setOfficeUrl(file.url));
        return;
      }
      
      // Lógica interna (plataforma)
      queueMicrotask(() => setLoadingOffice(true));
      const urn = viewedVersionInfo?.gcs_urn || file.gcs_urn;
      const url = urn 
        ? `${API}/api/docs/signed-url?urn=${encodeURIComponent(urn)}&model_urn=${encodeURIComponent(projectPrefix)}`
        : `${API}/api/docs/signed-url?path=${encodeURIComponent(file.fullName)}&model_urn=${encodeURIComponent(projectPrefix)}`;

      apiFetch(url)
        .then(r => r.json())
        .then(data => {
          if (data.success) setOfficeUrl(data.url);
          else console.error("Error fetching signed URL:", data.error);
        })
        .catch(err => console.error("Fetch Office URL error:", err))
        .finally(() => setLoadingOffice(false));
    } else {
      queueMicrotask(() => {
        setOfficeUrl('');
        setLoadingOffice(false);
      });
    }
  }, [file, viewedVersionInfo, projectPrefix, isShared, API]);

  useEffect(() => {
    if (!file) return undefined;
    const lowerName = file.name.toLowerCase();
    const isOffice = ['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'].some(ext => lowerName.endsWith(ext));
    const isPdf = lowerName.endsWith('.pdf') || lowerName.endsWith('.pdfx');
    if (isShared || isOffice) {
      queueMicrotask(() => {
        setSecurePreviewUrl(isShared ? (file.url || '') : '');
        setLoadingPreview(false);
        setPreviewError('');
      });
      return undefined;
    }

    const recentPdfUrl = isPdf && !viewedVersionInfo
      ? getRecentPdfUrl({
          nodeId: file.id,
          version: file.version || 1,
          gcsUrn: file.gcs_urn,
        })
      : null;
    if (recentPdfUrl) {
      queueMicrotask(() => {
        setSecurePreviewUrl(recentPdfUrl);
        setLoadingPreview(false);
        setPreviewError('');
      });
      return undefined;
    }

    let cancelled = false;
    const urn = viewedVersionInfo?.gcs_urn || file.gcs_urn;
    const url = urn
      ? `${API}/api/docs/signed-url?urn=${encodeURIComponent(urn)}&model_urn=${encodeURIComponent(projectPrefix)}`
      : `${API}/api/docs/signed-url?path=${encodeURIComponent(file.fullName)}&model_urn=${encodeURIComponent(projectPrefix)}`;

    queueMicrotask(() => {
      if (cancelled) return;
      setLoadingPreview(true);
      setPreviewError('');
      setSecurePreviewUrl('');
    });
    apiFetch(url)
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data.success || !data.url) throw new Error(data.error || 'No se pudo autorizar la vista previa');
        if (!cancelled) setSecurePreviewUrl(data.url);
      })
      .catch(err => {
        if (!cancelled) setPreviewError(err.message || 'No se pudo abrir el archivo');
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });

    return () => { cancelled = true; };
  }, [file, viewedVersionInfo, projectPrefix, isShared, API, previewRetry]);

  if (!file) return null;

  return (
    <div className="file-viewer-overlay" style={isShared ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', background: '#fff' } : undefined}>
      <div className="file-viewer-header" style={isShared ? { padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e0e0e0', flexShrink: 0 } : undefined}>
        <div className="file-viewer-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--accent)', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </span>
          
          <div style={{ position: 'relative' }}>
            <div 
              className="version-link-acc" 
              onClick={() => { if (!isShared && setShowVersions) setShowVersions(!showVersions); }}
              style={{ fontSize: 13, padding: '2px 12px', cursor: isShared ? 'default' : 'pointer' }}
            >
              {viewedVersionInfo ? `V${viewedVersionInfo.version_number}` : (file.version ? `V${file.version}` : 'V1')}
              {!isShared && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 6, transform: showVersions ? 'rotate(180deg)' : 'none' }}>
                  <path d="M7 10l5 5 5-5H7z"/>
                </svg>
              )}
            </div>

            {!isShared && showVersions && (
              <div className="version-popover" style={{ top: 32, left: 0, width: 350 }}>
                <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee', fontSize: 12, fontWeight: 600, color: '#666' }}>
                  Versiones
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {(!versionHistory || versionHistory.length === 0) ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#999', fontSize: 13 }}>
                       <div className="adsk-spinner" style={{ width: 20, height: 20, margin: '0 auto 8px', borderWidth: 2 }} />
                       Cargando historial...
                    </div>
                  ) : (
                    versionHistory.map((v, i) => {
                      const isLatest = v.version_number === (versionHistory[0]?.version_number || file.version);
                      return (
                       <div 
                        key={i} 
                        className="version-popover-item"
                        style={{ 
                          padding: '12px', 
                          borderBottom: '1px solid #f5f5f5',
                          background: viewedVersionInfo?.id === v.id ? '#f0faff' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <div 
                          onClick={() => { if (setViewedVersionInfo) setViewedVersionInfo(v); if (setShowVersions) setShowVersions(false); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', flex: 1 }}
                        >
                           <div className="version-link-acc" style={{ minWidth: 32 }}>V{v.version_number || 1}</div>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                             <span style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>{file.name}</span>
                             <span style={{ fontSize: 11, color: '#999' }}>
                               Cargado por <span style={{ textTransform: 'uppercase' }}>{v.updated_by || 'ADMIN'}</span> el {formatDate(v.updated)}
                             </span>
                           </div>
                        </div>
                        
                        {!isLatest && isAdmin && onPromote && (
                          <button 
                            className="acc-btn-promote"
                            onClick={(e) => { e.stopPropagation(); onPromote(v); }}
                            title="Hacer versión actual"
                            style={{ 
                              padding: '4px 8px', 
                              fontSize: 11, 
                              background: '#fff', 
                              border: '1px solid var(--accent)', 
                              color: 'var(--accent)', 
                              borderRadius: 2,
                              cursor: 'pointer'
                            }}
                          >
                            Hacer actual
                          </button>
                        )}
                      </div>
                    );
                  })
                  )}
                </div>
              </div>
            )}
          </div>

          {!isShared && viewedVersionInfo && viewedVersionInfo.version_number !== (versionHistory[0]?.version_number || file.version) && (
            <div className="no-actual-badge">
              No actual
            </div>
          )}
        </div>

        <div className="file-viewer-actions">
           {isShared && sharedRole && (
             <span style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 500, color: '#666', marginRight: 16 }}>
               Acceso compartido: {sharedRole === 'viewer' ? 'Lector' : 'Comentador'}
             </span>
           )}
           <button className="file-viewer-close" onClick={onClose || (() => window.close())}>✕</button>
        </div>
      </div>
      
      <div className="file-viewer-content" style={{ flex: 1, position: 'relative', background: '#f5f5f5', display: 'flex', justifyContent: 'center' }}>
        {(() => {
          const fileUrl = isShared && file.url ? file.url : securePreviewUrl;
          const lowerName = file.name.toLowerCase();

          if (!isShared && !['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'].some(ext => lowerName.endsWith(ext)) && loadingPreview) {
            return (
              <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
                <div className="spinner-acc" style={{ width: 40, height: 40, border: '3px solid #e5e7eb', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin-acc 1s linear infinite' }} />
                <div style={{ fontSize: 14, color: '#666' }}>Preparando vista segura…</div>
              </div>
            );
          }

          if (!isShared && previewError) {
            return (
              <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: '#5f6368' }}>
                <div>No se pudo abrir la vista previa.</div>
                <div style={{ fontSize: 12, color: '#8a9099' }}>{previewError}</div>
                <button type="button" onClick={() => setPreviewRetry(value => value + 1)} style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 4, cursor: 'pointer' }}>
                  Reintentar
                </button>
              </div>
            );
          }
          
          // 1. VIDEOS
          if (lowerName.endsWith('.mp4') || lowerName.endsWith('.webm') || lowerName.endsWith('.ogg')) {
            return (
              <video controls autoPlay style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', background: '#000' }}>
                <source src={fileUrl} type={`video/${lowerName.split('.').pop()}`} />
                Tu navegador no soporta la reproducción de video.
              </video>
            );
          }
          
          // 2. IMAGES
          if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].some(ext => lowerName.endsWith(ext))) {
            return (
              <div style={isShared ? { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 } : { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={fileUrl} alt={file.name} style={isShared ? { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', borderRadius: 8, background: '#fff' } : { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </div>
            );
          }
          
          // 3. OFFICE (Word, Excel, PPT)
          if (['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'].some(ext => lowerName.endsWith(ext))) {
            if (loadingOffice) {
              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
                  <div className="spinner-acc" style={{ width: 40, height: 40, border: '3px solid #f3f3f3', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin-acc 1s linear infinite' }}></div>
                  <div style={{ fontSize: 14, color: '#666' }}>Cargando visor de Office...</div>
                </div>
              );
            }
            if (!officeUrl) {
              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
                  <div style={{ fontSize: 14 }}>No se pudo cargar la vista previa de Office.</div>
                  <button onClick={() => window.open(fileUrl, '_blank')} style={{ marginTop: 12, padding: '8px 16px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Descargar archivo</button>
                </div>
              );
            }
            const viewerUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(officeUrl)}`;
            return (
              <iframe src={viewerUrl} title={file.name} style={{ width: '100%', height: '100%', border: 'none' }} />
            );
          }
          
          // 4. NO PREVIEW FOR OTHERS IN SHARED MODE
          if (!['.pdf', '.pdfx'].some(ext => lowerName.endsWith(ext)) && isShared) {
             return (
               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#fff', width: '100%' }}>
                 <div style={{ background: '#f1f3f4', padding: 32, borderRadius: '50%', marginBottom: 24 }}>
                   <svg width="48" height="48" viewBox="0 0 24 24" fill="#5f6368"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                 </div>
                 <p style={{ fontFamily: 'Inter', fontSize: 16, color: '#3c4043', fontWeight: 500 }}>No hay vista previa disponible</p>
                 <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 24, background: 'var(--accent)', color: '#fff', padding: '10px 24px', borderRadius: 20, textDecoration: 'none', fontFamily: 'Inter', fontWeight: 500, fontSize: 14, transition: 'background 0.2s' }}>
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                   Descargar Archivo
                 </a>
               </div>
             )
          }

          // 5. PDF (Mozilla PDF.js — Motor intercambiable)
          if (lowerName.endsWith('.pdf') || lowerName.endsWith('.pdfx')) {
            return <PDFViewer url={fileUrl} fileName={file.name}
              nodeId={isShared ? null : file.id} projectPrefix={projectPrefix} />;
          }

          // 6. CAD / BIM: DWG de Civil 3D, RVT, IFC... El navegador no sabe
          //    dibujarlos, así que el iframe genérico acababa DESCARGANDO el
          //    archivo. Se traducen con Model Derivative y se muestran con el
          //    visor de Autodesk, el mismo que usa ACC por dentro.
          //    En vistas compartidas no: un invitado no debe poder gastar
          //    créditos de traducción.
          if (!isShared && CAD_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
            return (
              <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>}>
                <CadViewer file={file} />
              </Suspense>
            );
          }

          // 7. DEFAULT FALLBACK (Iframe genérico)
          return (
            <iframe 
              src={fileUrl} 
              title={file.name} 
              style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
            />
          );
        })()}
      </div>
    </div>
  );
}
