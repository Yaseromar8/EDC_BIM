// frontend-docs/src/components/PDFViewer.jsx
// ═══════════════════════════════════════════════════════════════
// FACADE PATTERN: Visor PDF profesional basado en Mozilla PDF.js
// Modo: Single-Page (100% Zoom, Scroll-Zoom, Click-Pan)
// ═══════════════════════════════════════════════════════════════
import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import PdfToolsOverlay, { COLORS } from './PdfToolsOverlay';
import './PDFViewer.css';

// Configurar el worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// ----------------------------------------------------------------------
// Sub-componente para renderizar Miniaturas en el Sidebar
// ----------------------------------------------------------------------
// Techo de resolución del canvas (~16 MP). Sin esto, un plano A0 a 8× con
// devicePixelRatio 2 pedía cientos de megapíxeles: el navegador se arrodilla.
const MAX_CANVAS_PIXELS = 16_000_000;

// Buscar sin tildes ni mayúsculas: "excavacion" encuentra "EXCAVACIÓN".
const normalizeText = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const THUMB_W = 140;          // ancho fijo de miniatura
const THUMB_PLACEHOLDER_H = 181; // alto aprox. A4 → reserva espacio y evita saltos de scroll

function Thumbnail({ pdf, pageNum, isActive, onClick }) {
  const canvasRef = useRef(null);
  const hostRef = useRef(null);
  // RENDIMIENTO: antes TODAS las miniaturas se dibujaban al montar (un PDF de
  // 200 páginas = 200 renders simultáneos → congelaba el visor). Ahora cada una
  // se dibuja SOLO cuando está por entrar en pantalla, y una única vez.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { rootMargin: '400px 0px' }); // pre-carga un poco antes de que se vea
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    let renderTask = null;
    let cancelled = false;

    const renderThumb = async () => {
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;

        const viewport0 = page.getViewport({ scale: 1 });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const scale = THUMB_W / viewport0.width;
        const viewport = page.getViewport({ scale });

        // Las miniaturas NO necesitan devicePixelRatio completo: a 140px de
        // ancho, 1x se ve igual y cuesta la cuarta parte de píxeles.
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.round(viewport.width * dpr);
        canvas.height = Math.round(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext('2d'); // sin alpha:false → nada de miniaturas negras
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
        if (!cancelled) setReady(true);
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException' && err?.name !== 'RenderingCancelled') {
          console.error('Thumbnail render error:', err);
        }
      }
    };

    renderThumb();
    return () => {
      cancelled = true;
      if (renderTask) renderTask.cancel();
    };
  }, [visible, pdf, pageNum]);

  return (
    <div
      ref={hostRef}
      data-thumb-page={pageNum}
      role="button"
      tabIndex={0}
      aria-current={isActive ? 'page' : undefined}
      aria-label={`Ir a la página ${pageNum}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '12px 0', cursor: 'pointer',
        background: isActive ? '#e8e8e8' : 'transparent',
        borderBottom: '1px solid #ddd',
        transition: 'background 0.2s'
      }}
    >
      <div style={{
        boxShadow: isActive ? '0 0 0 2px #5f7fa3' : '0 2px 5px rgba(0,0,0,0.2)',
        background: '#fff', padding: 2, borderRadius: 2,
        // Reserva el espacio antes de dibujar: la lista no "salta" al hacer scroll.
        minHeight: ready ? undefined : THUMB_PLACEHOLDER_H,
        width: THUMB_W + 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <canvas ref={canvasRef} />
      </div>
      <span style={{ fontSize: 11, color: '#555', marginTop: 8, fontWeight: isActive ? 600 : 400 }}>
        {pageNum}
      </span>
    </div>
  );
}


// ----------------------------------------------------------------------
// Visor Principal
// ----------------------------------------------------------------------
export default function PDFViewer({ url, fileName = 'documento.pdf', nodeId = null, projectPrefix = '' }) {
  const viewerRef = useRef(null); // Para Fullscreen
  const canvasRef = useRef(null);
  const wrapRef = useRef(null); // Envuelve canvas + overlay de herramientas
  const containerRef = useRef(null);
  const sidebarRef = useRef(null);
  const pdfDocRef = useRef(null);
  const loadingTaskRef = useRef(null);
  const renderTaskRef = useRef(null);
  const renderSequenceRef = useRef(0);
  const baseVpRef = useRef({});          // cache "pagina:rotacion" → viewport a escala 1
  const renderDebounceRef = useRef(null); // coalesce de renders durante el zoom
  // Texto por página SOLO EN MEMORIA: se lee del PDF al vuelo y se descarta al
  // cerrar el documento. No se extrae ni se guarda nada en el servidor.
  const textCacheRef = useRef(new Map());

  // ── Búsqueda dentro del documento ──
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matches, setMatches] = useState([]);      // [{ page, itemIndex }]
  const [matchIdx, setMatchIdx] = useState(0);
  const [searching, setSearching] = useState(false);

  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageDraft, setPageDraft] = useState('1');
  const [scale, setScale] = useState(1.0); // 100% por defecto
  const [rotation, setRotation] = useState(0);
  const [fitMode, setFitMode] = useState('page'); // page | width | custom
  
  // UI States
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0); // % de descarga del documento
  const [error, setError] = useState(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pageRendering, setPageRendering] = useState(false);
  const [renderError, setRenderError] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  
  // Pan States
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  // Herramientas de ingeniería (overlay)
  const [tool, setTool] = useState('pan');
  const [markupColor, setMarkupColor] = useState(COLORS[0]);
  const [vpInfo, setVpInfo] = useState(null); // { vp, w, h } del render actual
  const userName = (() => {
    try { return JSON.parse(localStorage.getItem('visor_user') || sessionStorage.getItem('visor_user') || '{}').name || ''; }
    catch { return ''; }
  })();

  // Load PDF document
  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setProgress(0);
    setCurrentPage(1);
    setPageDraft('1');
    setScale(1.0);
    setRotation(0);
    baseVpRef.current = {}; // el cache de viewports es por documento
    textCacheRef.current = new Map(); // el texto leído se descarta al cambiar de PDF
    setMatches([]); setMatchIdx(0); setSearchQuery(''); setSearchOpen(false);

    const loadPDF = async () => {
      try {
        // Descarga en streaming continuo (comportamiento por defecto de PDF.js).
        // NO activar `disableAutoFetch`: para PDFs normales dispara decenas de
        // peticiones por rangos y sale MÁS LENTO que bajar el archivo de corrido.
        const loadingTask = pdfjsLib.getDocument({ url, withCredentials: false });
        loadingTaskRef.current = loadingTask;
        loadingTask.onProgress = ({ loaded, total }) => {
          if (!cancelled && total) setProgress(Math.min(99, Math.round((loaded / total) * 100)));
        };
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setLoading(false);
        setShowSidebar(pdf.numPages > 1);
      } catch (err) {
        if (cancelled) return;
        console.error('[PDFViewer] Error loading PDF:', err);
        setError(err.message || 'No se pudo cargar el PDF');
        setLoading(false);
      }
    };

    loadPDF();
    return () => {
      cancelled = true;
      clearTimeout(renderDebounceRef.current);
      renderSequenceRef.current += 1;
      try { renderTaskRef.current?.cancel(); } catch { /* render ya finalizado */ }
      try { loadingTaskRef.current?.destroy(); } catch { /* tarea ya finalizada */ }
      try { pdfDocRef.current?.destroy(); } catch { /* documento ya liberado */ }
      renderTaskRef.current = null;
      loadingTaskRef.current = null;
      pdfDocRef.current = null;
    };
  }, [url, retryNonce]);

  // ZOOM INSTANTÁNEO: al cambiar la escala se ajusta el tamaño CSS de una vez
  // (el navegador reescala el bitmap actual → respuesta inmediata) y la
  // rasterización nítida llega ~110 ms después, ya sin la rueda girando.
  const applyPreviewSize = useCallback(async () => {
    const pdf = pdfDocRef.current, canvas = canvasRef.current;
    if (!pdf || !canvas) return;
    const key = `${currentPage}:${rotation}`;
    let base = baseVpRef.current[key];
    if (!base) {
      try {
        const page = await pdf.getPage(currentPage);
        const vp1 = page.getViewport({ scale: 1, rotation });
        base = { width: vp1.width, height: vp1.height };
        baseVpRef.current[key] = base;
      } catch { return; }
    }
    if (!canvasRef.current) return;
    canvasRef.current.style.width = `${base.width * (scale || 1)}px`;
    canvasRef.current.style.height = `${base.height * (scale || 1)}px`;
  }, [currentPage, rotation, scale]);

  // Render nítido de la página actual
  const renderPage = useCallback(async () => {
    const pdf = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch { /* el render ya terminó */ }
    }

    const renderSequence = ++renderSequenceRef.current;
    setVpInfo(null);
    setPageRendering(true);
    setRenderError('');
    try {
      const page = await pdf.getPage(currentPage);

      const effectiveScale = scale || 1.0;
      const viewport = page.getViewport({ scale: effectiveScale, rotation });

      // TOPE DE PÍXELES: sin esto, un plano grande a 8× con dpr 2 pedía un
      // canvas de cientos de megapíxeles → memoria disparada y render lentísimo.
      let dpr = window.devicePixelRatio || 1;
      const wanted = viewport.width * viewport.height * dpr * dpr;
      if (wanted > MAX_CANVAS_PIXELS) {
        dpr = Math.max(0.1, dpr * Math.sqrt(MAX_CANVAS_PIXELS / wanted));
      }

      canvas.width = Math.round(viewport.width * dpr);
      canvas.height = Math.round(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      // OJO: NO usar { alpha:false } — deja el canvas NEGRO opaco hasta que
      // termina de dibujar, tapando el fondo blanco (se veía una hoja negra).
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const renderContext = { canvasContext: ctx, viewport };
      renderTaskRef.current = page.render(renderContext);
      await renderTaskRef.current.promise;
      if (renderSequence !== renderSequenceRef.current) return;
      // El overlay necesita el viewport vigente para transformar coordenadas PDF<->pantalla
      setVpInfo({ vp: viewport, w: viewport.width, h: viewport.height });
    } catch (err) {
      if (renderSequence === renderSequenceRef.current && err?.name !== 'RenderingCancelledException' && err?.name !== 'RenderingCancelled') {
        console.error('[PDFViewer] Render error:', err);
        setRenderError('No se pudo representar esta página.');
      }
    } finally {
      if (renderSequence === renderSequenceRef.current) setPageRendering(false);
    }
  }, [currentPage, scale, rotation]);

  // Render principal. El debounce se aplica SOLO al zoom (para no rasterizar 15
  // veces en un gesto de rueda). Abrir el documento o cambiar de página rinde
  // AL INSTANTE — meter el retardo ahí era lo que se sentía lento.
  const lastSigRef = useRef('');
  useEffect(() => {
    if (loading || !pdfDocRef.current) return undefined;
    const sig = `${currentPage}:${rotation}`;
    const soloCambioElZoom = sig === lastSigRef.current;
    lastSigRef.current = sig;

    applyPreviewSize();
    clearTimeout(renderDebounceRef.current);
    if (soloCambioElZoom) {
      renderDebounceRef.current = setTimeout(renderPage, 110);
    } else {
      renderPage(); // primera carga / cambio de página → sin esperar
    }
    return () => clearTimeout(renderDebounceRef.current);
  }, [loading, currentPage, rotation, applyPreviewSize, renderPage]);

  // Auto-scroll sidebar thumbnail into view when page changes
  useEffect(() => {
    if (!showSidebar || !sidebarRef.current) return;
    const activeThumb = sidebarRef.current.querySelector(`[data-thumb-page="${currentPage}"]`);
    if (activeThumb) {
      activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentPage, showSidebar]);

  // --- Controles de Navegación ---
  const goToPage = useCallback((p) => {
    const clamped = Math.max(1, Math.min(p, numPages));
    setCurrentPage(clamped);
    setPageDraft(String(clamped));
  }, [numPages]);

  useEffect(() => setPageDraft(String(currentPage)), [currentPage]);

  // ── BÚSQUEDA DENTRO DEL DOCUMENTO ─────────────────────────────────────────
  // Lee el texto que el PDF YA trae, al vuelo y en memoria. No extrae, no sube
  // ni guarda nada: al cerrar el documento se descarta.
  const getPageText = useCallback(async (pageNum) => {
    const cached = textCacheRef.current.get(pageNum);
    if (cached) return cached;
    const page = await pdfDocRef.current.getPage(pageNum);
    const tc = await page.getTextContent();
    textCacheRef.current.set(pageNum, tc.items);
    return tc.items;
  }, []);

  const runSearch = useCallback(async (q) => {
    const needle = normalizeText(q);
    if (needle.length < 2 || !pdfDocRef.current) { setMatches([]); setMatchIdx(0); return; }
    setSearching(true);
    const found = [];
    for (let p = 1; p <= numPages; p++) {
      try {
        const items = await getPageText(p);
        items.forEach((it, i) => {
          if (it.str && normalizeText(it.str).includes(needle)) found.push({ page: p, itemIndex: i });
        });
      } catch { /* página ilegible: seguir con las demás */ }
    }
    setMatches(found);
    setMatchIdx(0);
    setSearching(false);
    if (found.length) setCurrentPage(found[0].page);
  }, [numPages, getPageText]);

  const gotoMatch = useCallback((delta) => {
    if (!matches.length) return;
    const next = (matchIdx + delta + matches.length) % matches.length;
    setMatchIdx(next);
    setCurrentPage(matches[next].page);
  }, [matches, matchIdx]);

  // Rectángulos a resaltar en la página visible (se recalculan con el zoom).
  const highlights = React.useMemo(() => {
    if (!vpInfo || !matches.length) return [];
    const items = textCacheRef.current.get(currentPage);
    if (!items) return [];
    return matches
      .map((m, i) => ({ ...m, globalIdx: i }))
      .filter(m => m.page === currentPage)
      .map(m => {
        const it = items[m.itemIndex];
        if (!it) return null;
        const tx = pdfjsLib.Util.transform(vpInfo.vp.transform, it.transform);
        const h = Math.hypot(tx[2], tx[3]) || 10;
        return {
          key: m.globalIdx,
          active: m.globalIdx === matchIdx,
          left: tx[4],
          top: tx[5] - h,
          width: Math.max(4, (it.width || 0) * (vpInfo.vp.scale || 1)),
          height: h,
        };
      })
      .filter(Boolean);
  }, [matches, matchIdx, currentPage, vpInfo]);

  const zoomIn = useCallback(() => { setFitMode('custom'); setScale(prev => Math.min((prev || 1.0) * 1.2, 8.0)); }, []);
  const zoomOut = useCallback(() => { setFitMode('custom'); setScale(prev => Math.max((prev || 1.0) / 1.2, 0.2)); }, []);

  // Zoom anclado al cursor: el punto bajo el mouse se mantiene en su sitio
  const zoomAt = useCallback((dir, clientX, clientY) => {
    const cont = containerRef.current;
    if (!cont) { dir > 0 ? zoomIn() : zoomOut(); return; }
    const rect = cont.getBoundingClientRect();
    const mx = clientX - rect.left + cont.scrollLeft;
    const my = clientY - rect.top + cont.scrollTop;
    setFitMode('custom');
    setScale(prev => {
      const next = dir > 0 ? Math.min(prev * 1.2, 8.0) : Math.max(prev / 1.2, 0.2);
      const ratio = next / prev;
      requestAnimationFrame(() => {
        cont.scrollLeft = mx * ratio - (clientX - rect.left);
        cont.scrollTop = my * ratio - (clientY - rect.top);
      });
      return next;
    });
  }, [zoomIn, zoomOut]);

  // Ajustar a página / ancho según el tamaño real del contenedor
  const fitTo = useCallback(async (mode) => {
    const pdf = pdfDocRef.current, cont = containerRef.current;
    if (!pdf || !cont) return;
    try {
      const page = await pdf.getPage(currentPage);
      const vp1 = page.getViewport({ scale: 1, rotation });
      const sW = (cont.clientWidth - 64) / vp1.width;
      const sH = (cont.clientHeight - 64) / vp1.height;
      setFitMode(mode);
      setScale(Math.max(0.2, mode === 'width' ? sW : Math.min(sW, sH)));
    } catch { /* el documento puede estar cerrándose */ }
  }, [currentPage, rotation]);

  // Al abrir un documento, ajustarlo a la vista (no 100% arbitrario)
  useEffect(() => {
    if (!loading && pdfDocRef.current) fitTo('page');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Mantiene "ajustar a página/ancho" al redimensionar la ventana o el panel.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || fitMode === 'custom' || typeof ResizeObserver === 'undefined') return undefined;
    let timer;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => fitTo(fitMode), 120);
    });
    ro.observe(el);
    return () => { clearTimeout(timer); ro.disconnect(); };
  }, [fitMode, fitTo]);
  const rotateRight = () => setRotation(r => (r + 90) % 360);
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      viewerRef.current?.requestFullscreen().catch(err => console.log(err));
    } else {
      document.exitFullscreen();
    }
  };
  // Imprimir vía iframe oculto: `window.open(url).print()` disparaba print()
  // ANTES de que el PDF terminara de cargar (hoja en blanco o nada). Si el
  // origen bloquea el acceso al iframe (URL firmada de GCS), abre pestaña.
  const printDocument = () => {
    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, { position: 'fixed', right: 0, bottom: 0, width: 0, height: 0, border: 0 });
    iframe.src = url;
    iframe.onload = () => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
      catch { window.open(url, '_blank', 'noopener'); }
    };
    document.body.appendChild(iframe);
    setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* ya removido */ } }, 60000);
  };

  // Fullscreen Listener
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!viewerRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return;
      // Ctrl+F / Cmd+F abre la búsqueda del documento (no la del navegador).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => document.getElementById('pdf-search-input')?.focus(), 0);
        return;
      }
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName) || e.target?.isContentEditable) return;
      if (e.key === 'Escape' && searchOpen) { setSearchOpen(false); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault(); goToPage(currentPage - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault(); goToPage(currentPage + 1);
      } else if (e.key === 'Home') {
        e.preventDefault(); goToPage(1);
      } else if (e.key === 'End') {
        e.preventDefault(); goToPage(numPages);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault(); zoomIn();
      } else if (e.key === '-') {
        e.preventDefault(); zoomOut();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault(); fitTo('page');
      } else if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault(); setFitMode('custom'); setScale(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, numPages, searchOpen, fitTo, goToPage, zoomIn, zoomOut]);

  // Scroll handling: Zoom en Canvas / Cambiar Página en Fondo Gris
  useEffect(() => {
    if (loading || error) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let lastPageChange = 0;

    const handleWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey) || !wrapRef.current?.contains(e.target)) return;
      // Bloquear scroll vertical nativo (importante para que el zoom y cambio de pág funcionen sin que brinque la pantalla)
      e.preventDefault(); 
      
      if (wrapRef.current && wrapRef.current.contains(e.target)) {
        // Si el mouse está sobre la hoja (canvas u overlay) -> Zoom anclado al cursor
        zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
      } else if (e.target === container) {
        // Si el mouse está sobre el fondo gris -> Cambiar Página
        const now = Date.now();
        if (now - lastPageChange < 300) return; // Cooldown de 300ms
        lastPageChange = now;

        if (e.deltaY < 0) {
          setCurrentPage(prev => Math.max(1, prev - 1));
        } else if (e.deltaY > 0) {
          setCurrentPage(prev => Math.min(numPages, prev + 1));
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [loading, error, numPages, zoomAt]);

  // --- Click & Drag Panning Logic ---
  const handleMouseDown = (e) => {
    // Con una herramienta activa, el clic sobre la hoja es para dibujar, no para panear
    if (tool !== 'pan' && wrapRef.current && wrapRef.current.contains(e.target)) return;
    // 0 = Click Izquierdo, 1 = Click Rueda (Middle Click)
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault(); // Evitar scroll automático al usar click central
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: containerRef.current.scrollLeft,
      scrollTop: containerRef.current.scrollTop
    };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    containerRef.current.scrollLeft = dragStart.current.scrollLeft - dx;
    containerRef.current.scrollTop = dragStart.current.scrollTop - dy;
  };

  const handleMouseUp = () => setIsDragging(false);

  // --- Render ---
  if (loading) {
    return (
      <div style={styles.center} role="status" aria-live="polite">
        <div style={styles.spinner} />
        <div style={{ fontSize: 14, color: '#666', marginTop: 16 }}>
          {progress > 0 && progress < 100 ? `Cargando documento… ${progress}%` : 'Cargando documento PDF…'}
        </div>
        {progress > 0 && progress < 100 && (
          <div style={{ width: 200, height: 4, background: '#e0e0e0', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: '#5f7fa3', transition: 'width .2s' }} />
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.center} role="alert">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="#d32f2f">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        <div style={{ fontSize: 14, color: '#666', marginTop: 12 }}>No se pudo cargar el PDF</div>
        <details className="pdf-error-details">
          <summary>Ver detalle técnico</summary>
          <div>{error}</div>
        </details>
        <div className="pdf-error-actions">
          <button type="button" onClick={() => setRetryNonce(n => n + 1)} style={styles.downloadBtn}>Reintentar</button>
          <a href={url} target="_blank" rel="noopener noreferrer" style={styles.downloadBtn}>Descargar archivo</a>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={viewerRef}
      className="pdf-viewer"
      tabIndex={-1}
      aria-busy={pageRendering}
      style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#888', overflow: 'hidden' }}
    >
      
      {/* ▀▀▀ ACC Dark Toolbar ▀▀▀ */}
      <div className="pdf-toolbar" style={styles.toolbar} role="toolbar" aria-label="Controles del documento PDF">
        
        {/* Izquierda: Menú + Búsqueda */}
        <div className="pdf-toolbar__group pdf-toolbar__left" style={styles.toolbarGroupLeft}>
          <button aria-label="Alternar panel de miniaturas" aria-pressed={showSidebar} onClick={() => setShowSidebar(!showSidebar)} style={{...styles.toolBtnDark, background: showSidebar ? '#444' : 'transparent'}} title="Alternar panel de miniaturas">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
          </button>

          <button onClick={() => { setSearchOpen(o => !o); setTimeout(() => document.getElementById('pdf-search-input')?.focus(), 0); }}
            aria-label="Buscar en el documento" aria-pressed={searchOpen}
            style={{ ...styles.toolBtnDark, background: searchOpen ? '#444' : 'transparent' }} title="Buscar en el documento (Ctrl+F)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>

          {searchOpen && (
            <div style={styles.searchBox}>
              <input
                id="pdf-search-input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); matches.length ? gotoMatch(e.shiftKey ? -1 : 1) : runSearch(searchQuery); }
                  if (e.key === 'Escape') setSearchOpen(false);
                }}
                placeholder="Buscar en el documento…"
                style={styles.searchInput}
              />
              <span style={{ fontSize: 11, color: '#999', minWidth: 68, textAlign: 'center' }}>
                {searching ? 'Buscando…'
                  : matches.length ? `${matchIdx + 1} de ${matches.length}`
                  : searchQuery.trim().length >= 2 ? 'Sin resultados' : ''}
              </span>
              <button onClick={() => runSearch(searchQuery)} style={styles.searchBtn} title="Buscar">Ir</button>
              <button onClick={() => gotoMatch(-1)} disabled={!matches.length} style={styles.searchBtn} title="Anterior (Shift+Enter)">‹</button>
              <button onClick={() => gotoMatch(1)} disabled={!matches.length} style={styles.searchBtn} title="Siguiente (Enter)">›</button>
            </div>
          )}
          {!searchOpen && <span className="pdf-file-title" title={fileName}>{fileName}</span>}
        </div>

        {/* Centro: Herramientas Principales */}
        <div className="pdf-toolbar__group pdf-toolbar__center" style={styles.toolbarGroupCenter}>

          <button onClick={zoomOut} style={styles.toolBtnDark} title="Reducir zoom">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>
          </button>

          <span style={{ fontSize: 12, color: '#aaa', minWidth: 42, textAlign: 'center', fontWeight: 500 }}>
            {Math.round(scale * 100)}%
          </span>

          <button onClick={zoomIn} style={styles.toolBtnDark} title="Aumentar zoom">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          </button>

          <button onClick={() => fitTo('page')} style={styles.toolBtnDark} title="Ajustar página completa">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8l-2 2 2 2M15 8l2 2-2 2"/></svg>
          </button>
          <button onClick={() => fitTo('width')} style={styles.toolBtnDark} title="Ajustar al ancho">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg>
          </button>

          <div style={styles.separatorDark} />

          <div style={styles.pageInfoDark}>
            <span>Página</span>
            <button aria-label="Página anterior" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} style={styles.pageNavBtnDark}>
               <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
            </button>
            <input 
              aria-label="Número de página"
              inputMode="numeric"
              type="number" value={pageDraft}
              onChange={(e) => setPageDraft(e.target.value)}
              onBlur={() => goToPage(Number(pageDraft) || currentPage)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  goToPage(Number(pageDraft) || currentPage);
                  e.currentTarget.blur();
                }
                if (e.key === 'Escape') {
                  setPageDraft(String(currentPage));
                  e.currentTarget.blur();
                }
              }}
              style={styles.pageInputDark} min={1} max={numPages} 
            />
            <button aria-label="Página siguiente" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages} style={styles.pageNavBtnDark}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </button>
            <span>de {numPages}</span>
          </div>

        </div>

        {/* Derecha: Opciones Extra */}
        <div className="pdf-toolbar__group pdf-toolbar__right" style={styles.toolbarGroupRight}>
          <button onClick={rotateRight} style={styles.toolBtnDark} title="Rotar 90 grados">
             <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M15.55 5.55L11 1v3C7.06 4 4 7.06 4 11s3.06 7 7 7c1.53 0 2.95-.49 4.1-1.32l-1.5-1.5C12.82 15.69 11.95 16 11 16c-2.76 0-5-2.24-5-5s2.24-5 5-5v3l4.55-4.55zM13 11c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z"/></svg>
          </button>

          <div style={styles.separatorDark} />

          <button onClick={printDocument} style={styles.toolBtnDark} title="Imprimir">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
          </button>
          
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...styles.toolBtnDark, textDecoration: 'none' }} title="Descargar PDF">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
          </a>

          <div style={styles.separatorDark} />

          <button onClick={toggleFullscreen} style={styles.toolBtnDark} title="Pantalla completa">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              {isFullscreen ? 
                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/> :
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
              }
            </svg>
          </button>
        </div>
      </div>

      {/* ▀▀▀ Barra de herramientas de ingeniería ▀▀▀ */}
      {nodeId && (
        <div className="pdf-tools-bar" style={styles.toolsBar} role="toolbar" aria-label="Herramientas de ingeniería">
          {[
            { id: 'pan', title: 'Navegar (pan y zoom)', icon: <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/> },
            { id: 'calibrate', title: 'Calibrar escala: clic en 2 puntos de una distancia conocida', icon: <><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M7 17L17 7M10 14l1 1M13 11l1 1"/></> },
            { id: 'measure', title: 'Medir distancia: clic por puntos, doble clic termina', icon: <><rect x="1" y="9" width="22" height="6" rx="1" transform="rotate(-45 12 12)"/><path d="M8 12l1.5 1.5M11 9l1.5 1.5M14 6l1.5 1.5"/></> },
            { id: 'area', title: 'Medir área: clic por vértices, doble clic cierra', icon: <path d="M12 2l9 7-3.5 11h-11L3 9z"/> },
            { id: 'count', title: 'Conteo: cada clic suma 1', icon: <><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></> },
            { id: 'cloud', title: 'Nube de revisión: arrastrar', icon: <path d="M17.5 19a4.5 4.5 0 0 0 .42-8.98 7 7 0 0 0-13.6 1.9A4 4 0 0 0 6 19z"/> },
            { id: 'arrow', title: 'Flecha: arrastrar', icon: <path d="M5 19L19 5M19 5h-8M19 5v8"/> },
            { id: 'rect', title: 'Rectángulo: arrastrar', icon: <rect x="4" y="6" width="16" height="12" rx="1"/> },
            { id: 'pen', title: 'Lápiz libre: arrastrar', icon: <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/> },
            { id: 'text', title: 'Texto: clic donde quieras escribir', icon: <path d="M5 6V4h14v2M12 4v16M9 20h6"/> },
            { id: 'erase', title: 'Borrar: clic sobre una anotación', icon: <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/></> },
          ].map(t => (
            <button key={t.id} onClick={() => setTool(prev => prev === t.id ? 'pan' : t.id)} title={t.title}
              style={{ ...styles.toolsBtn, background: tool === t.id ? '#5f7fa3' : 'transparent', color: tool === t.id ? '#fff' : '#ccc' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
            </button>
          ))}
          <div style={{ width: 1, height: 20, background: '#444', margin: '0 6px' }} />
          {COLORS.map(c => (
            <button key={c} onClick={() => setMarkupColor(c)} title="Color"
              style={{ width: 18, height: 18, borderRadius: '50%', background: c, cursor: 'pointer', border: markupColor === c ? '2px solid #fff' : '2px solid transparent', padding: 0 }} />
          ))}
          <span className="pdf-tools-hint" style={{ marginLeft: 'auto', fontSize: 11, color: '#888', paddingRight: 8 }}>
            {tool === 'pan' ? 'Elige una herramienta para medir o anotar' : 'Esc cancela · doble clic termina líneas/áreas'}
          </span>
        </div>
      )}

      {/* ▀▀▀ MAIN AREA (1 Página) ▀▀▀ */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        
        {/* Sidebar Miniaturas */}
        {showSidebar && (
          <div ref={sidebarRef} className="pdf-sidebar" style={styles.sidebar} aria-label="Miniaturas de páginas">
            {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
              <Thumbnail 
                key={pageNum}
                pdf={pdfDocRef.current}
                pageNum={pageNum}
                isActive={currentPage === pageNum}
                onClick={() => goToPage(pageNum)}
              />
            ))}
          </div>
        )}

        {/* Canvas de Documento */}
        <div 
          ref={containerRef} 
          className="pdf-canvas-container"
          style={{
            ...styles.canvasContainer,
            cursor: isDragging ? 'grabbing' : 'grab' // Aplica a toda el área
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {pageRendering && (
            <div className="pdf-render-status" role="status" aria-live="polite">
              Actualizando página {currentPage}…
            </div>
          )}
          {renderError && (
            <div className="pdf-render-error" role="alert">
              <span>{renderError}</span>
              <button type="button" onClick={renderPage}>Reintentar</button>
            </div>
          )}
          {/* minWidth 100% + width fit-content: centra cuando el plano es mas
              chico que la pantalla, pero crece y deja hacer scroll a TODOS los
              lados cuando el zoom lo hace mas grande (sin recortar los bordes). */}
          <div style={{ padding: 48, boxSizing: 'border-box', minWidth: '100%', width: 'fit-content', margin: '0 auto', display: 'flex', justifyContent: 'center' }}>
            <div ref={wrapRef} style={{ position: 'relative' }}>
              <canvas ref={canvasRef} style={styles.canvas} />

              {/* Resaltado de coincidencias — no intercepta clics (las herramientas siguen funcionando) */}
              {highlights.map(h => (
                <div key={h.key} style={{
                  position: 'absolute', pointerEvents: 'none',
                  left: h.left, top: h.top, width: h.width, height: h.height,
                  background: h.active ? 'rgba(255,145,0,0.55)' : 'rgba(255,235,59,0.38)',
                  outline: h.active ? '1px solid #ff6d00' : 'none',
                  borderRadius: 2,
                }} />
              ))}
              {nodeId && vpInfo && (
                <PdfToolsOverlay
                  vpInfo={vpInfo} page={currentPage} nodeId={nodeId}
                  projectPrefix={projectPrefix} tool={tool} setTool={setTool}
                  color={markupColor} userName={userName}
                />
              )}
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}

// --- Inline Styles ---
const styles = {
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', gap: 4, background: '#f5f5f5' },
  spinner: { width: 36, height: 36, border: '3px solid #e0e0e0', borderTop: '3px solid #5f7fa3', borderRadius: '50%', animation: 'spin-acc 1s linear infinite' },
  
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', height: 48, background: '#222222', color: '#fff', flexShrink: 0, zIndex: 10 },
  toolbarGroupLeft: { display: 'flex', alignItems: 'center', flex: 1 },
  toolbarGroupCenter: { display: 'flex', alignItems: 'center', gap: 4, flex: 2, justifyContent: 'center' },
  toolbarGroupRight: { display: 'flex', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'flex-end' },
  
  toolBtnDark: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, border: 'none', background: 'transparent', borderRadius: 4, cursor: 'pointer', color: '#ddd', transition: 'background 0.2s, color 0.2s' },
  separatorDark: { width: 1, height: 24, background: '#444', margin: '0 8px' },

  searchBox: { display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6, background: '#111', border: '1px solid #444', borderRadius: 4, padding: '2px 4px' },
  searchInput: { width: 190, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 12, padding: '5px 6px', fontFamily: 'inherit' },
  searchBtn: { background: 'transparent', border: 'none', color: '#ddd', cursor: 'pointer', fontSize: 14, padding: '2px 7px', borderRadius: 3 },
  
  pageInfoDark: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#bbb' },
  pageInputDark: { width: 40, textAlign: 'center', border: '1px solid #444', borderRadius: 4, padding: '4px 4px', fontSize: 13, outline: 'none', background: '#111', color: '#fff', fontFamily: 'inherit' },
  pageNavBtnDark: { background: 'transparent', border: 'none', color: '#ddd', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 },
  
  toolsBar: { display: 'flex', alignItems: 'center', gap: 2, padding: '0 12px', height: 38, background: '#2b2b2b', borderTop: '1px solid #3a3a3a', flexShrink: 0, zIndex: 9 },
  toolsBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 28, border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14, transition: 'background 0.15s' },

  sidebar: { width: 220, background: '#f9f9f9', borderRight: '1px solid #ccc', overflowY: 'auto', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  canvasContainer: { flex: 1, overflow: 'auto' },
  canvas: { boxShadow: '0 4px 16px rgba(0,0,0,0.3)', background: '#fff' },
  downloadBtn: { marginTop: 16, padding: '8px 20px', background: '#5f7fa3', color: '#fff', border: 'none', borderRadius: 4, textDecoration: 'none', fontSize: 13, fontWeight: 500 },
};
