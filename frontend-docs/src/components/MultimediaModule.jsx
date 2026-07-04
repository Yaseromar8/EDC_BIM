import React, { useState, useEffect, useRef } from 'react';
import exifr from 'exifr';
import { apiFetch } from '../utils/apiFetch';
import { API } from '../utils/helpers';
import toast from 'react-hot-toast';
import { enqueuePhoto } from '../services/uploadQueue';
import { uploadFile } from '../services/uploadService';
import './MultimediaModule.css';

const lbBtn = { width: 28, height: 28, borderRadius: '50%', background: 'transparent', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };

export default function MultimediaModule({ project, user }) {
  // El API de proyectos devuelve model_urn, NO urn → modelUrn era undefined.
  // El scope de Docs es 'proyectos/{nombre}' (igual que useFileExplorer/todo el
  // resto). Usamos ESE mismo scope para que las fotos aparezcan en esta pestaña.
  const modelUrn = `proyectos/${String(project?.name || '').replace(/ /g, '_')}`;

  // Un <img>/<video> no puede mandar el header Authorization → el proxy protegido
  // devolvía 401 (imagen en blanco). El middleware acepta ?session_token= como
  // fallback, así que lo anexamos a cada URL de media.
  // thumb=true → miniatura ~20 KB (galería); sin thumb → imagen completa (lightbox).
  const proxyUrl = (id, thumb = false) => {
    const tok = localStorage.getItem('visor_session_token') || sessionStorage.getItem('visor_session_token') || '';
    return `${API}/api/docs/proxy?id=${id}${thumb ? '&thumb=1' : ''}${tok ? `&session_token=${encodeURIComponent(tok)}` : ''}`;
  };
  const PAGE = 80;
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [lbZoom, setLbZoom] = useState(1);
  const [lbPan, setLbPan] = useState({ x: 0, y: 0 });
  const lbDrag = useRef(null);
  const photosRef = useRef([]);
  const activeUploadsRef = useRef(0);
  const whatsappPollRef = useRef(null);

  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [mediaType, setMediaType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [whatsappPreview, setWhatsappPreview] = useState(null);
  const [whatsappStatus, setWhatsappStatus] = useState(null);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const fileInputRef = useRef(null);

  // Prevent closing page if uploading
  useEffect(() => {
    const handleBeforeUnload = (e) => {
        if (activeUploadsRef.current > 0) {
            e.preventDefault();
            e.returnValue = 'Hay fotos subiendo. Si sales ahora se perderán.';
            return e.returnValue;
        }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (modelUrn) { setPhotos([]); photosRef.current = []; setOffset(0); fetchMultimedia(0, true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrn]);

  useEffect(() => () => {
    if (whatsappPollRef.current) clearTimeout(whatsappPollRef.current);
  }, []);

  // Scroll infinito: cuando el sentinel entra en viewport, trae la siguiente tanda.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loadingMore && hasMore) {
        fetchMultimedia(offset, false);
      }
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, loadingMore, offset]);

  const mapMediaRow = (f) => {
    const captureDate = f.capture_date || f.created_at || new Date().toISOString();
    return {
      id: f.id,
      src: proxyUrl(f.id, true),        // GALERÍA: miniatura ligera
      fullSrc: proxyUrl(f.id, false),   // LIGHTBOX: imagen completa
      desc: f.description || '',
      filename: f.name,
      mimeType: f.mime_type || '',
      mediaType: f.media_type || (String(f.mime_type || '').startsWith('video/') ? 'video' : 'image'),
      date: String(captureDate).split('T')[0],
      displayDate: new Date(captureDate).toLocaleDateString(),
      location: f.latitude ? { lat: f.latitude, lng: f.longitude } : null,
    };
  };

  // Carga PAGINADA (scroll infinito): 80 por tanda, miniaturas → arranca al instante.
  const fetchMultimedia = async (from = 0, reset = false) => {
    if (from === 0) setLoading(true); else setLoadingMore(true);
    try {
      const res = await apiFetch(`${API}/api/docs/media?model_urn=${encodeURIComponent(modelUrn)}&limit=${PAGE}&offset=${from}`);
      if (res.ok) {
        const data = await res.json();
        const mapped = (data.files || []).map(mapMediaRow);
        setPhotos(prev => {
          const next = reset ? mapped : [...prev, ...mapped];
          photosRef.current = next;
          return next;
        });
        setHasMore(!!data.has_more);
        setOffset(from + mapped.length);
      }
    } catch (err) {
      console.error('Error fetching multimedia:', err);
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  };

  useEffect(() => {
    setLbZoom(1);
    setLbPan({ x: 0, y: 0 });
    setDescriptionDraft(selectedPhoto?.desc || '');
    setEditingDescription(false);
  }, [selectedPhoto?.id]);

  useEffect(() => {
    if (!selectedPhoto) return;
    const onKey = (e) => {
        const list = photosRef.current || [];
        const idx = list.findIndex(p => String(p.id) === String(selectedPhoto.id));
        if (e.key === 'Escape') setSelectedPhoto(null);
        else if (e.key === 'ArrowLeft' && list.length > 1) setSelectedPhoto(list[idx > 0 ? idx - 1 : list.length - 1]);
        else if (e.key === 'ArrowRight' && list.length > 1) setSelectedPhoto(list[idx < list.length - 1 ? idx + 1 : 0]);
        else if (e.key === '+' || e.key === '=') setLbZoom(z => Math.min(z * 1.3, 6));
        else if (e.key === '-') setLbZoom(z => Math.max(z / 1.3, 1));
        else if (e.key === '0') { setLbZoom(1); setLbPan({ x: 0, y: 0 }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedPhoto]);

  const setQuickFilter = (type) => {
    const today = new Date();
    const end = today.toISOString().split('T')[0];
    let start = '';
    if (type === 'today') start = end;
    else if (type === 'week') {
        const lastWeek = new Date();
        lastWeek.setDate(today.getDate() - 7);
        start = lastWeek.toISOString().split('T')[0];
    }
    else if (type === 'month') {
        const lastMonth = new Date();
        lastMonth.setMonth(today.getMonth() - 1);
        start = lastMonth.toISOString().split('T')[0];
    }
    setDateRange({ start, end });
  };

  const isVideoFile = (name) => {
    if (!name) return false;
    const low = name.toLowerCase();
    return low.endsWith('.mp4') || low.endsWith('.webm') || low.endsWith('.ogg') || low.endsWith('.mov') || low.endsWith('.3gp') || low.endsWith('.avi') || low.endsWith('.m4v');
  };

  const previewWhatsappImport = async () => {
    if (!modelUrn) return;
    setWhatsappLoading(true);
    try {
      const resp = await apiFetch(`${API}/api/docs/multimedia/whatsapp/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_urn: modelUrn })
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || 'No se pudo revisar la carpeta');
      setWhatsappPreview(data);
      toast.success(`Detectados ${data.total} archivos historicos`);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Error revisando WhatsApp');
    } finally {
      setWhatsappLoading(false);
    }
  };

  const pollWhatsappImport = (jobId) => {
    if (whatsappPollRef.current) clearTimeout(whatsappPollRef.current);
    whatsappPollRef.current = setTimeout(async () => {
      try {
        const resp = await apiFetch(`${API}/api/docs/multimedia/whatsapp/import/${jobId}`);
        const data = await resp.json();
        if (!data.success) throw new Error(data.error || 'No se pudo consultar el avance');
        setWhatsappStatus(data.job);
        if (['completed', 'completed_with_errors', 'failed'].includes(data.job.status)) {
          if (data.job.status === 'failed') toast.error(data.job.message || 'Importacion fallida');
          else toast.success(data.job.message || 'Importacion terminada');
          fetchMultimedia();
          return;
        }
        pollWhatsappImport(jobId);
      } catch (err) {
        console.error(err);
        toast.error(err.message || 'Error consultando avance');
      }
    }, 1800);
  };

  const startWhatsappImport = async () => {
    if (!modelUrn) return;
    setWhatsappLoading(true);
    try {
      const resp = await apiFetch(`${API}/api/docs/multimedia/whatsapp/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_urn: modelUrn,
          description: ''
        })
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || 'No se pudo iniciar la importacion');
      setWhatsappStatus(data.job);
      toast.success('Importacion historica iniciada');
      pollWhatsappImport(data.job_id);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Error iniciando importacion');
    } finally {
      setWhatsappLoading(false);
    }
  };

  const saveSelectedDescription = async () => {
    if (!selectedPhoto?.id) return;
    try {
      const resp = await apiFetch(`${API}/api/docs/description`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node_id: selectedPhoto.id,
          model_urn: modelUrn,
          description: descriptionDraft
        })
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || 'No se pudo guardar');
      const updated = { ...selectedPhoto, desc: descriptionDraft };
      setSelectedPhoto(updated);
      setPhotos(prev => prev.map(p => String(p.id) === String(selectedPhoto.id) ? updated : p));
      photosRef.current = photosRef.current.map(p => String(p.id) === String(selectedPhoto.id) ? updated : p);
      setEditingDescription(false);
      toast.success('Descripcion guardada');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'No se pudo guardar la descripcion');
    }
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    e.target.value = null;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let captureDate = new Date();
        let location = null;
        let allExifData = {};

        try {
            if (!isVideoFile(file.name)) {
                // Extract ALL metadata
                const parsedExif = await exifr.parse(file);
                if (parsedExif) {
                    allExifData = parsedExif; // Store everything for the backend
                    if (parsedExif.DateTimeOriginal) {
                        captureDate = new Date(parsedExif.DateTimeOriginal);
                    }
                    if (parsedExif.latitude && parsedExif.longitude) {
                        location = { lat: parsedExif.latitude, lng: parsedExif.longitude };
                    }
                } else if (file.lastModified) {
                    captureDate = new Date(file.lastModified);
                }
            } else if (file.lastModified) {
                captureDate = new Date(file.lastModified);
            }
        } catch (err) {
            console.warn("Could not extract EXIF date", err);
        }

        // 1. Optimistic UI
        const temporaryUrl = URL.createObjectURL(file);
        const tempId = `temp-${Date.now()}-${i}`;
        const newPhotoTemp = {
            id: tempId,
            src: temporaryUrl,
            desc: file.name,
            date: captureDate.toISOString().split('T')[0],
            displayDate: captureDate.toLocaleDateString(),
            location: location,
            fullPath: 'Subiendo...',
            isUploading: true
        };

        setPhotos(prev => [newPhotoTemp, ...prev]);
        photosRef.current = [newPhotoTemp, ...photosRef.current];

        const uploadPath = `MULTIMEDIA/`;

        // 2. Persistencia en IndexedDB (Dalux-style)
        await enqueuePhoto({
            id: tempId,
            file,
            pinId: 'multimedia', // Dummy pin for docs
            modelUrn: modelUrn,
            uploadPath,
            captureDate,
            desc: file.name,
            location
        });

        activeUploadsRef.current++;

        // 3. Subida a GCS en Background (3 Pasos)
        (async (currentTempId, currentFile, currentUploadPath) => {
            try {
                // A) Pedir URL Firmada
                const urlResp = await apiFetch(`${API}/api/docs/upload-url`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: currentFile.name,
                        contentType: currentFile.type || 'application/octet-stream',
                        model_urn: modelUrn
                    })
                });
                const urlData = await urlResp.json();
                if (!urlData.success) throw new Error(urlData.error);

                // B) Subida directa a GCS (UploadDirect)
                await uploadFile(currentFile, urlData.uploadUrl, { isDirect: true });

                // C) Confirmar al backend con custom_attributes
                const customAttrs = {
                    capture_date: captureDate.toISOString(),
                    exif_data: allExifData // Toda la data EXIF viaja aquí
                };
                if (location) {
                    customAttrs.latitude = location.lat;
                    customAttrs.longitude = location.lng;
                }

                const confirmResp = await apiFetch(`${API}/api/docs/upload-confirm`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: currentFile.name,
                        gcs_urn: urlData.gcs_urn,
                        size_bytes: currentFile.size,
                        mime_type: currentFile.type || 'application/octet-stream',
                        path: currentUploadPath,
                        model_urn: modelUrn,
                        custom_attributes: customAttrs
                    })
                });
                const confirmData = await confirmResp.json();

                if (confirmData.success) {
                    const finalUrl = proxyUrl(confirmData.file?.id || urlData.gcs_urn);
                    
                    // Actualizar UI quitando el estado de 'isUploading'
                    setPhotos(prev => prev.map(p => p.id === currentTempId ? {
                        ...p,
                        id: confirmData.file?.id || p.id,
                        src: finalUrl,
                        isUploading: false,
                        fullPath: confirmData.file?.fullName || `${currentUploadPath}${currentFile.name}`
                    } : p));
                    photosRef.current = photosRef.current.map(p => p.id === currentTempId ? { ...p, src: finalUrl, isUploading: false } : p);

                    // Eliminar de cola local (IndexedDB)
                    const { dequeuePhoto } = await import('../services/uploadQueue');
                    await dequeuePhoto(currentTempId);
                } else {
                    toast.error(`Error confirmando ${currentFile.name}`);
                }
            } catch (err) {
                console.error("Upload error", err);
                toast.error(`Fallo la subida de ${currentFile.name}`);
            } finally {
                activeUploadsRef.current--;
            }
        })(tempId, file, uploadPath);
    }
  };

  const filteredPhotos = photos.filter(p => {
    const isVideo = p.mediaType === 'video' || String(p.mimeType || '').startsWith('video/') || isVideoFile(p.filename || p.desc);
    if (mediaType === 'image' && isVideo) return false;
    if (mediaType === 'video' && !isVideo) return false;
    if (searchTerm && !(p.desc || '').toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (dateRange.start && p.date < dateRange.start) return false;
    if (dateRange.end && p.date > dateRange.end) return false;
    return true;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="multimedia-module" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f5f7f9', width: '100%' }}>
      
      {/* ── Toolbar Superior ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', background: '#fff', borderBottom: '1px solid #e0e0e0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#333' }}>Multimedia</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0f2f5', padding: '4px', borderRadius: 6 }}>
            <input 
              type="text" 
              placeholder="Buscar por descripción..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ border: 'none', background: 'transparent', padding: '6px 12px', outline: 'none', fontSize: 13, width: 200 }}
            />
          </div>
          
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="acc-filter-btn" onClick={() => setQuickFilter('today')} style={{ padding: '6px 12px', background: '#eef2f7', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Hoy</button>
            <button className="acc-filter-btn" onClick={() => setQuickFilter('week')} style={{ padding: '6px 12px', background: '#eef2f7', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Semana</button>
            <button className="acc-filter-btn" onClick={() => setQuickFilter('month')} style={{ padding: '6px 12px', background: '#eef2f7', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Mes</button>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>Desde:</span>
            <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} style={{ border: '1px solid #ddd', padding: '4px 8px', borderRadius: 4, fontSize: 12 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>Hasta:</span>
            <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} style={{ border: '1px solid #ddd', padding: '4px 8px', borderRadius: 4, fontSize: 12 }} />
            {(dateRange.start || dateRange.end) && (
              <button onClick={() => setDateRange({start: '', end: ''})} style={{ background: 'none', border: '1px solid #ccc', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>× Reset</button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#666' }}>{filteredPhotos.length} ítems</span>
          <button 
            onClick={() => fileInputRef.current?.click()}
            style={{ background: '#5f7fa3', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 4, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            Subir multimedia
          </button>
          <button
            onClick={previewWhatsappImport}
            disabled={whatsappLoading}
            style={{ background: '#1f7a4d', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 4, fontWeight: 600, cursor: whatsappLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: whatsappLoading ? 0.7 : 1 }}
            title="Carga historica temporal desde la carpeta local de WhatsApp"
          >
            {whatsappLoading ? 'Revisando...' : 'Importar WhatsApp'}
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/*,video/*" style={{ display: 'none' }} />
        </div>
      </div>

      {/* ── Galería Grid ── */}
      {(whatsappPreview || whatsappStatus) && (
        <div style={{ padding: '12px 24px', background: '#fff', borderBottom: '1px solid #e0e0e0' }}>
          {whatsappPreview && !whatsappStatus && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, background: '#f5faf7', border: '1px solid #bfe4cf', borderRadius: 6, padding: '12px 14px' }}>
              <div style={{ color: '#24543a', fontSize: 13 }}>
                <strong>Carga historica WhatsApp:</strong> {whatsappPreview.total} archivos ({whatsappPreview.images} fotos / {whatsappPreview.videos} videos), fechas {whatsappPreview.date_start || '-'} a {whatsappPreview.date_end || '-'}.
                <span style={{ marginLeft: 8, color: '#6b7c72' }}>{whatsappPreview.skipped} archivos omitidos por nombre o extension.</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setWhatsappPreview(null)} style={{ border: '1px solid #b7c8bf', background: '#fff', color: '#24543a', padding: '7px 12px', borderRadius: 4, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={startWhatsappImport} disabled={whatsappLoading || !whatsappPreview.total} style={{ border: 'none', background: '#1f7a4d', color: '#fff', padding: '8px 14px', borderRadius: 4, fontWeight: 700, cursor: whatsappLoading ? 'wait' : 'pointer' }}>Iniciar importacion</button>
              </div>
            </div>
          )}
          {whatsappStatus && (
            <div style={{ background: '#f6f8fb', border: '1px solid #ccd6e2', borderRadius: 6, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', fontSize: 13, color: '#263447' }}>
                <strong>{whatsappStatus.message || 'Importando multimedia...'}</strong>
                <span>{whatsappStatus.progress || 0}%</span>
              </div>
              <div style={{ height: 8, background: '#d9e2ec', borderRadius: 999, marginTop: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, Number(whatsappStatus.progress || 0))}%`, background: whatsappStatus.status === 'failed' ? '#d9534f' : '#1f7a4d', transition: 'width 0.25s ease' }} />
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: '#667085' }}>
                <span>Procesados: {whatsappStatus.processed || 0}/{whatsappStatus.total || 0}</span>
                <span>Importados: {whatsappStatus.imported || 0}</span>
                <span>Duplicados: {whatsappStatus.skipped || 0}</span>
                <span>Errores: {whatsappStatus.failed || 0}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Cargando multimedia...</div>
        ) : filteredPhotos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>No se encontraron archivos multimedia. Sube fotos usando el botón superior.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {filteredPhotos.map((p) => (
              <div 
                key={p.id} 
                onClick={() => setSelectedPhoto(p)}
                style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', cursor: 'pointer', border: '1px solid #eaeaea', transition: 'transform 0.2s', position: 'relative' }}
                onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseOut={e => e.currentTarget.style.transform = 'none'}
              >
                <div style={{ height: 160, background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  {p.mediaType === 'video' || String(p.mimeType || '').startsWith('video/') || isVideoFile(p.filename || p.desc) ? (
                    <video src={p.src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <img src={p.src} alt={p.desc} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: p.isUploading ? 0.5 : 1 }} loading="lazy" />
                  )}
                  {p.isUploading && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.7)', fontWeight: 600, color: '#5f7fa3' }}>
                        Subiendo...
                    </div>
                  )}
                  {p.location && (
                    <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.7)', padding: '4px 8px', borderRadius: 12, fontSize: 11, color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }} title="Con Ubicación GPS">
                      📍 GPS
                    </div>
                  )}
                </div>
                <div style={{ padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.desc}>{p.desc || 'Sin descripción'}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{p.displayDate || p.date}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sentinel de scroll infinito: al entrar en vista, trae la siguiente tanda */}
        {hasMore && !searchTerm && !dateRange.start && (
          <div ref={sentinelRef} style={{ textAlign: 'center', padding: 24, color: '#999', fontSize: 13 }}>
            {loadingMore ? 'Cargando más fotos…' : `Mostrando ${photos.length}… desliza para ver más`}
          </div>
        )}
      </div>

      {/* ── Lightbox Modal ── */}
      {selectedPhoto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,36,0.95)', zIndex: 100000, display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' }}>
            <div style={{ color: '#fff' }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{selectedPhoto.desc || 'Sin descripcion'}</div>
              <button onClick={() => setEditingDescription(true)} style={{ marginTop: 8, border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.12)', color: '#fff', padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Editar descripcion</button>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {false && selectedPhoto.rawMetadata && (
                  <button onClick={(e) => { e.stopPropagation(); console.log(selectedPhoto.rawMetadata); toast.success('Metadatos EXIF enviados a consola'); }} style={{ background: '#333', color: '#fff', border: '1px solid #555', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                      Ver Metadatos EXIF
                  </button>
              )}
              {false && selectedPhoto.location && (
                <a 
                  href={`https://www.google.com/maps/search/?api=1&query=${selectedPhoto.location.lat},${selectedPhoto.location.lng}`} 
                  target="_blank" rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#e8f0fe', color: '#1a73e8', padding: '6px 12px', borderRadius: 16, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
                  onClick={e => e.stopPropagation()}
                >
                  📍 Ver en Mapa
                </a>
              )}
              <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: 4 }}>
                <button style={lbBtn} onClick={() => setLbZoom(z => Math.max(z / 1.3, 1))}>-</button>
                <button style={lbBtn} onClick={() => { setLbZoom(1); setLbPan({x:0, y:0}); }}>1:1</button>
                <button style={lbBtn} onClick={() => setLbZoom(z => Math.min(z * 1.3, 6))}>+</button>
              </div>
              <button onClick={() => setSelectedPhoto(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
          </div>

          {editingDescription && (
            <div style={{ padding: '0 24px 14px', background: 'rgba(0,0,0,0.65)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <textarea
                value={descriptionDraft}
                onChange={e => setDescriptionDraft(e.target.value)}
                placeholder="Escribe una descripcion..."
                rows={3}
                style={{ width: 'min(720px, 70vw)', resize: 'vertical', borderRadius: 6, border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.12)', color: '#fff', padding: '8px 10px', outline: 'none' }}
              />
              <button onClick={saveSelectedDescription} style={{ border: 'none', background: '#1f7a4d', color: '#fff', padding: '8px 12px', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}>Guardar</button>
              <button onClick={() => { setEditingDescription(false); setDescriptionDraft(selectedPhoto.desc || ''); }} style={{ border: '1px solid rgba(255,255,255,0.35)', background: 'transparent', color: '#fff', padding: '8px 12px', borderRadius: 4, cursor: 'pointer' }}>Cancelar</button>
            </div>
          )}

          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
               onWheel={e => {
                   if (e.ctrlKey) { e.preventDefault(); setLbZoom(z => Math.max(1, Math.min(6, z - e.deltaY * 0.01))); }
               }}
               onMouseDown={e => { if (lbZoom > 1) lbDrag.current = { startX: e.clientX - lbPan.x, startY: e.clientY - lbPan.y }; }}
               onMouseMove={e => { if (lbDrag.current) setLbPan({ x: e.clientX - lbDrag.current.startX, y: e.clientY - lbDrag.current.startY }); }}
               onMouseUp={() => lbDrag.current = null}
               onMouseLeave={() => lbDrag.current = null}
          >
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {selectedPhoto.mediaType === 'video' || String(selectedPhoto.mimeType || '').startsWith('video/') || isVideoFile(selectedPhoto.filename || selectedPhoto.desc) ? (
                  <video src={selectedPhoto.src} controls autoPlay style={{ maxWidth: '90%', maxHeight: '90%', transform: `scale(${lbZoom}) translate(${lbPan.x/lbZoom}px, ${lbPan.y/lbZoom}px)`, transition: lbDrag.current ? 'none' : 'transform 0.2s' }} />
              ) : (
                  <img src={selectedPhoto.fullSrc || selectedPhoto.src} alt="" draggable={false} style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain', transform: `scale(${lbZoom}) translate(${lbPan.x/lbZoom}px, ${lbPan.y/lbZoom}px)`, transition: lbDrag.current ? 'none' : 'transform 0.2s', cursor: lbZoom > 1 ? 'grab' : 'default' }} />
              )}
            </div>
            
            <button onClick={(e) => { e.stopPropagation(); const list = photosRef.current; const idx = list.findIndex(p => String(p.id) === String(selectedPhoto.id)); if(list.length>1) setSelectedPhoto(list[idx > 0 ? idx - 1 : list.length - 1]); }} style={{ position: 'absolute', left: 24, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', width: 48, height: 48, borderRadius: '50%', fontSize: 24, cursor: 'pointer', zIndex: 10 }}>‹</button>
            <button onClick={(e) => { e.stopPropagation(); const list = photosRef.current; const idx = list.findIndex(p => String(p.id) === String(selectedPhoto.id)); if(list.length>1) setSelectedPhoto(list[idx < list.length - 1 ? idx + 1 : 0]); }} style={{ position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', width: 48, height: 48, borderRadius: '50%', fontSize: 24, cursor: 'pointer', zIndex: 10 }}>›</button>
          </div>
        </div>
      )}

    </div>
  );
}
