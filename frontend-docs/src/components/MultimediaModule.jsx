import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
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
  // variant: 'thumb' (galería ~25KB) | 'display' (lightbox mediana ~150KB) | 'full' (original)
  const proxyUrl = (id, variant = 'full') => {
    const tok = localStorage.getItem('visor_session_token') || sessionStorage.getItem('visor_session_token') || '';
    const q = variant === 'thumb' ? '&thumb=1' : variant === 'display' ? '&size=display' : '';
    return `${API}/api/docs/proxy?id=${id}${q}${tok ? `&session_token=${encodeURIComponent(tok)}` : ''}`;
  };
  const scrollRef = useRef(null);   // contenedor scrolleable de la galería
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
    if (modelUrn) { setPhotos([]); photosRef.current = []; fetchMultimedia(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrn]);

  useEffect(() => () => {
    if (whatsappPollRef.current) clearTimeout(whatsappPollRef.current);
  }, []);

  const mapMediaRow = (f) => {
    const captureDate = f.capture_date || f.created_at || new Date().toISOString();
    return {
      id: f.id,
      src: proxyUrl(f.id, 'thumb'),       // GALERÍA: miniatura ligera (~25KB)
      fullSrc: proxyUrl(f.id, 'display'), // LIGHTBOX: mediana 1600px (~150KB, abre rápido)
      originalSrc: proxyUrl(f.id, 'full'),// descarga/original a resolución completa
      desc: f.description || '',
      filename: f.name,
      mimeType: f.mime_type || '',
      mediaType: f.media_type || (String(f.mime_type || '').startsWith('video/') ? 'video' : 'image'),
      date: String(captureDate).split('T')[0],
      displayDate: new Date(captureDate).toLocaleDateString(),
      location: f.latitude ? { lat: f.latitude, lng: f.longitude } : null,
    };
  };

  // Carga TODA la metadata liviana de una vez (sin bytes de imagen): habilita
  // filtros coherentes + scrubber por fecha sobre el set completo. Las miniaturas
  // se cargan solas al ser visibles (lazy + content-visibility en las tiles).
  const fetchMultimedia = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API}/api/docs/media?model_urn=${encodeURIComponent(modelUrn)}&all=1`);
      if (res.ok) {
        const data = await res.json();
        const mapped = (data.files || []).map(mapMediaRow);
        setPhotos(mapped);
        photosRef.current = mapped;
      }
    } catch (err) {
      console.error('Error fetching multimedia:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLbZoom(1);
    setLbPan({ x: 0, y: 0 });
    setDescriptionDraft(selectedPhoto?.desc || '');
    setEditingDescription(false);
  }, [selectedPhoto?.id]);

  // Navegar respetando el ORDEN VISIBLE (filtrado). filteredRef se refresca en
  // cada render con la lista filtrada actual.
  const filteredRef = useRef([]);
  const navPhoto = (dir) => {
    const list = filteredRef.current || [];
    if (list.length < 2 || !selectedPhoto) return;
    const idx = list.findIndex(p => String(p.id) === String(selectedPhoto.id));
    const next = (idx + dir + list.length) % list.length;
    setSelectedPhoto(list[next]);
  };

  useEffect(() => {
    if (!selectedPhoto) return;
    const onKey = (e) => {
        if (e.key === 'Escape') setSelectedPhoto(null);
        else if (e.key === 'ArrowLeft') navPhoto(-1);
        else if (e.key === 'ArrowRight') navPhoto(1);
        else if (e.key === '+' || e.key === '=') setLbZoom(z => Math.min(z * 1.3, 6));
        else if (e.key === '-') setLbZoom(z => Math.max(z / 1.3, 1));
        else if (e.key === '0') { setLbZoom(1); setLbPan({ x: 0, y: 0 }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  filteredRef.current = filteredPhotos;   // para navegación del lightbox

  // Línea de tiempo estilo Google Fotos: agrupar por día (desc).
  const groupedPhotos = (() => {
    const map = new Map();
    filteredPhotos.forEach(p => {
      const key = p.date || 'sin-fecha';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    });
    return [...map.entries()].sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  })();

  const formatDayHeader = (dayKey) => {
    if (!dayKey || dayKey === 'sin-fecha') return 'Sin fecha';
    const d = new Date(`${dayKey}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dayKey;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
    if (d.getTime() === hoy.getTime()) return 'Hoy';
    if (d.getTime() === ayer.getTime()) return 'Ayer';
    return d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  // ── SCRUBBER de fecha: marcadores de año en la posición de scroll real de su
  // primera foto (preciso aunque un día tenga muchas fotos y otro pocas). ──
  const [yearMarkers, setYearMarkers] = useState([]);
  const [scrubLabel, setScrubLabel] = useState('');
  const [scrubY, setScrubY] = useState(0);
  const scrubbingRef = useRef(false);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || loading) { setYearMarkers([]); return; }
    // esperar a que el layout de las secciones esté listo
    const id = requestAnimationFrame(() => {
      const total = el.scrollHeight || 1;
      const seenYear = new Set();
      const marks = [];
      el.querySelectorAll('section[data-day]').forEach(sec => {
        const day = sec.getAttribute('data-day');
        const year = (day || '').slice(0, 4);
        if (year && !seenYear.has(year)) {
          seenYear.add(year);
          marks.push({ year, frac: Math.min(1, sec.offsetTop / total) });
        }
      });
      setYearMarkers(marks);
    });
    return () => cancelAnimationFrame(id);
  }, [groupedPhotos, loading]);

  const dateAtFraction = (frac) => {
    const el = scrollRef.current;
    if (!el) return '';
    const targetTop = frac * (el.scrollHeight - el.clientHeight);
    let best = null;
    el.querySelectorAll('section[data-day]').forEach(sec => {
      if (sec.offsetTop <= targetTop + 4) best = sec;
    });
    const day = (best || el.querySelector('section[data-day]'))?.getAttribute('data-day');
    if (!day) return '';
    const d = new Date(`${day}T00:00:00`);
    return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString('es-PE', { month: 'short', year: 'numeric' });
  };

  const scrubTo = (clientY, currentTarget) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    setScrubY(frac);
    setScrubLabel(dateAtFraction(frac));
    el.scrollTop = frac * (el.scrollHeight - el.clientHeight);
  };
  const onScrubStart = (e) => { scrubbingRef.current = true; scrubTo(e.clientY, e.currentTarget); };
  const onScrubMove = (e) => { if (scrubbingRef.current) scrubTo(e.clientY, e.currentTarget); };
  const onScrubEnd = () => { scrubbingRef.current = false; setScrubLabel(''); };

  // Al desplazar la galería, refresca la posición del indicador del scrubber.
  const onGalleryScroll = () => {
    const el = scrollRef.current;
    if (!el || scrubbingRef.current) return;
    const denom = (el.scrollHeight - el.clientHeight) || 1;
    setScrubY(Math.max(0, Math.min(1, el.scrollTop / denom)));
  };

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
          <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/*,video/*" style={{ display: 'none' }} />
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div ref={scrollRef} onScroll={onGalleryScroll} style={{ position: 'absolute', inset: 0, padding: '8px 40px 24px 24px', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Cargando multimedia...</div>
          ) : filteredPhotos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>No se encontraron archivos multimedia. Sube fotos usando el botón superior.</div>
          ) : (
            /* ── Línea de tiempo estilo Google Fotos: agrupado por día ── */
            groupedPhotos.map(([dayKey, dayPhotos]) => (
              <section key={dayKey} data-day={dayKey} style={{ marginBottom: 26 }}>
                <div style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f5f7f9', padding: '8px 2px 10px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#2b3440', textTransform: 'capitalize' }}>{formatDayHeader(dayKey)}</h3>
                  <span style={{ fontSize: 12, color: '#8a94a3' }}>{dayPhotos.length} {dayPhotos.length === 1 ? 'elemento' : 'elementos'}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 5 }}>
                  {dayPhotos.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPhoto(p)}
                      className="mm-tile"
                      style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', background: '#e9edf2', contentVisibility: 'auto', containIntrinsicSize: '180px' }}
                    >
                      {p.mediaType === 'video' || String(p.mimeType || '').startsWith('video/') || isVideoFile(p.filename || p.desc) ? (
                        <video src={p.src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} preload="metadata" />
                      ) : (
                        <img src={p.src} alt={p.desc} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: p.isUploading ? 0.5 : 1, transition: 'transform .25s' }} loading="lazy" />
                      )}
                      {(p.mediaType === 'video' || isVideoFile(p.filename || p.desc)) && (
                        <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 4, fontSize: 11, padding: '1px 6px' }}>▶ video</div>
                      )}
                      {p.location && (
                        <div style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 10, fontSize: 10, padding: '2px 6px' }} title="Con ubicación GPS">📍</div>
                      )}
                      {p.desc && (
                        <div className="mm-tile-desc" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 8px 6px', background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', color: '#fff', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.desc}</div>
                      )}
                      {p.isUploading && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.7)', fontWeight: 600, color: '#5f7fa3', fontSize: 12 }}>Subiendo…</div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        {/* ── Scrubber de fecha (estilo Google Fotos) ── */}
        {!loading && filteredPhotos.length > 0 && yearMarkers.length > 0 && (
          <div
            className="mm-scrubber"
            onMouseDown={onScrubStart}
            onMouseMove={onScrubMove}
            onMouseUp={onScrubEnd}
            onMouseLeave={onScrubEnd}
            style={{ position: 'absolute', top: 8, right: 4, bottom: 24, width: 34, cursor: 'ns-resize', zIndex: 5 }}
          >
            {yearMarkers.map(m => (
              <span key={m.year} style={{ position: 'absolute', right: 4, top: `${m.frac * 100}%`, transform: 'translateY(-50%)', fontSize: 11, color: '#8a94a3', background: '#f5f7f9', padding: '1px 4px', borderRadius: 4, pointerEvents: 'none', userSelect: 'none' }}>{m.year}</span>
            ))}
            {scrubLabel && (
              <span style={{ position: 'absolute', right: 40, top: `${scrubY * 100}%`, transform: 'translateY(-50%)', background: '#2b3440', color: '#fff', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', pointerEvents: 'none' }}>{scrubLabel}</span>
            )}
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
                   // rueda = zoom (sin Ctrl, como Google Fotos); centrado simple
                   e.preventDefault();
                   setLbZoom(z => Math.max(1, Math.min(6, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12))));
               }}
               onMouseDown={e => { if (lbZoom > 1) lbDrag.current = { startX: e.clientX - lbPan.x, startY: e.clientY - lbPan.y }; }}
               onMouseMove={e => { if (lbDrag.current) setLbPan({ x: e.clientX - lbDrag.current.startX, y: e.clientY - lbDrag.current.startY }); }}
               onMouseUp={() => lbDrag.current = null}
               onMouseLeave={() => lbDrag.current = null}
          >
            {/* Flechas en pantalla para pasar fotos */}
            {filteredRef.current.length > 1 && (
              <>
                <button onClick={(e) => { e.stopPropagation(); navPhoto(-1); }}
                  style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 3, width: 48, height: 48, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Anterior (←)">‹</button>
                <button onClick={(e) => { e.stopPropagation(); navPhoto(1); }}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 3, width: 48, height: 48, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Siguiente (→)">›</button>
              </>
            )}
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
