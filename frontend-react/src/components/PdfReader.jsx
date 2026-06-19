// PdfReader.jsx — Visor PDF propio para frontend-react (el mismo motor que en docs).
// Lector profesional: miniaturas, ajustar página/ancho, zoom al cursor, pan,
// navegación de páginas, rotación y descarga. Reemplaza el <iframe> crudo.
import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

function Thumb({ pdf, pageNum, active, onClick }) {
    const ref = useRef(null);
    useEffect(() => {
        let task = null, cancelled = false;
        (async () => {
            try {
                const page = await pdf.getPage(pageNum);
                if (cancelled) return;
                const v0 = page.getViewport({ scale: 1 });
                const scale = 120 / v0.width;
                const vp = page.getViewport({ scale });
                const canvas = ref.current;
                if (!canvas) return;
                const dpr = window.devicePixelRatio || 1;
                canvas.width = vp.width * dpr; canvas.height = vp.height * dpr;
                canvas.style.width = `${vp.width}px`; canvas.style.height = `${vp.height}px`;
                const ctx = canvas.getContext('2d');
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                task = page.render({ canvasContext: ctx, viewport: vp });
                await task.promise;
            } catch (e) { /* cancel */ }
        })();
        return () => { cancelled = true; if (task) task.cancel(); };
    }, [pdf, pageNum]);
    return (
        <div data-thumb={pageNum} onClick={onClick} style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', background: active ? 'rgba(126,155,189,0.12)' : 'transparent', borderBottom: '1px solid #2a2b30' }}>
            <div style={{ boxShadow: active ? '0 0 0 2px #7e9bbd' : '0 1px 4px rgba(0,0,0,0.4)', background: '#fff', borderRadius: 2 }}>
                <canvas ref={ref} />
            </div>
            <span style={{ fontSize: 11, color: active ? '#cdd3da' : '#777', marginTop: 6, fontWeight: active ? 600 : 400 }}>{pageNum}</span>
        </div>
    );
}

export default function PdfReader({ url, fileName = 'documento.pdf' }) {
    const wrapRef = useRef(null);
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const sidebarRef = useRef(null);
    const pdfRef = useRef(null);
    const renderRef = useRef(null);

    const [numPages, setNumPages] = useState(0);
    const [page, setPage] = useState(1);
    const [scale, setScale] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showThumbs, setShowThumbs] = useState(false);
    const drag = useRef(null);

    // Cargar documento
    useEffect(() => {
        if (!url) return;
        let cancelled = false;
        setLoading(true); setError(null); setPage(1); setRotation(0);
        pdfjsLib.getDocument({ url }).promise.then(pdf => {
            if (cancelled) return;
            pdfRef.current = pdf;
            setNumPages(pdf.numPages);
            setShowThumbs(pdf.numPages > 1);
            setLoading(false);
        }).catch(e => { if (!cancelled) { setError(e.message || 'No se pudo cargar el PDF'); setLoading(false); } });
        return () => { cancelled = true; };
    }, [url]);

    // Render de la página actual
    const renderPage = useCallback(async () => {
        const pdf = pdfRef.current, canvas = canvasRef.current;
        if (!pdf || !canvas) return;
        if (renderRef.current) { try { renderRef.current.cancel(); } catch (e) {} }
        try {
            const p = await pdf.getPage(page);
            const vp = p.getViewport({ scale: scale || 1, rotation });
            const dpr = window.devicePixelRatio || 1;
            canvas.width = vp.width * dpr; canvas.height = vp.height * dpr;
            canvas.style.width = `${vp.width}px`; canvas.style.height = `${vp.height}px`;
            const ctx = canvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            renderRef.current = p.render({ canvasContext: ctx, viewport: vp });
            await renderRef.current.promise;
        } catch (e) { /* cancel */ }
    }, [page, scale, rotation]);

    useEffect(() => { if (!loading && pdfRef.current) renderPage(); }, [loading, renderPage]);

    // Ajustar a página/ancho
    const fitTo = useCallback(async (mode) => {
        const pdf = pdfRef.current, cont = containerRef.current;
        if (!pdf || !cont) return;
        try {
            const p = await pdf.getPage(page);
            const v1 = p.getViewport({ scale: 1, rotation });
            const sW = (cont.clientWidth - 48) / v1.width;
            const sH = (cont.clientHeight - 48) / v1.height;
            setScale(Math.max(0.2, mode === 'width' ? sW : Math.min(sW, sH)));
        } catch (e) {}
    }, [page, rotation]);

    useEffect(() => { if (!loading && pdfRef.current) fitTo('page'); /* al abrir */ // eslint-disable-next-line
    }, [loading]);

    // Miniatura activa a la vista
    useEffect(() => {
        if (!showThumbs || !sidebarRef.current) return;
        const el = sidebarRef.current.querySelector(`[data-thumb="${page}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [page, showThumbs]);

    const goTo = (p) => setPage(Math.max(1, Math.min(p, numPages)));
    const zoomAt = (dir, cx, cy) => {
        const cont = containerRef.current;
        if (!cont) { setScale(s => Math.min(Math.max(dir > 0 ? s * 1.2 : s / 1.2, 0.2), 8)); return; }
        const rect = cont.getBoundingClientRect();
        const mx = cx - rect.left + cont.scrollLeft, my = cy - rect.top + cont.scrollTop;
        setScale(prev => {
            const next = Math.min(Math.max(dir > 0 ? prev * 1.2 : prev / 1.2, 0.2), 8);
            const r = next / prev;
            requestAnimationFrame(() => { cont.scrollLeft = mx * r - (cx - rect.left); cont.scrollTop = my * r - (cy - rect.top); });
            return next;
        });
    };

    // Rueda: zoom sobre la hoja, cambio de página sobre el fondo
    useEffect(() => {
        if (loading || error) return;
        const cont = containerRef.current; if (!cont) return;
        let last = 0;
        const onWheel = (e) => {
            e.preventDefault();
            if (wrapRef.current && wrapRef.current.contains(e.target)) zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
            else { const now = Date.now(); if (now - last < 250) return; last = now; e.deltaY < 0 ? goTo(page - 1) : goTo(page + 1); }
        };
        cont.addEventListener('wheel', onWheel, { passive: false });
        return () => cont.removeEventListener('wheel', onWheel);
    }, [loading, error, page, numPages]);

    // Teclado
    useEffect(() => {
        const onKey = (e) => {
            if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) return;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goTo(page - 1); }
            else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goTo(page + 1); }
            else if (e.key === '+' || e.key === '=') setScale(s => Math.min(s * 1.2, 8));
            else if (e.key === '-') setScale(s => Math.max(s / 1.2, 0.2));
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [page, numPages]);

    const onDown = (e) => {
        if (wrapRef.current && wrapRef.current.contains(e.target) && scale > 1) { /* permitir pan sobre la hoja */ }
        if (e.button !== 0 && e.button !== 1) return;
        drag.current = { x: e.clientX, y: e.clientY, sl: containerRef.current.scrollLeft, st: containerRef.current.scrollTop };
    };
    const onMove = (e) => { if (!drag.current) return; containerRef.current.scrollLeft = drag.current.sl - (e.clientX - drag.current.x); containerRef.current.scrollTop = drag.current.st - (e.clientY - drag.current.y); };
    const onUp = () => { drag.current = null; };

    if (loading) return <div style={S.center}><div style={S.spin} /><div style={{ color: '#888', marginTop: 14, fontSize: 13 }}>Cargando documento…</div></div>;
    if (error) return (
        <div style={S.center}>
            <div style={{ color: '#bd8585', fontSize: 14 }}>No se pudo cargar el PDF</div>
            <div style={{ color: '#777', fontSize: 12, marginTop: 4 }}>{error}</div>
            <a href={url} target="_blank" rel="noopener noreferrer" style={S.dl}>Descargar archivo</a>
        </div>
    );

    return (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#16181c', overflow: 'hidden' }}>
            {/* Toolbar */}
            <div style={S.bar}>
                <button onClick={() => setShowThumbs(s => !s)} title="Miniaturas" style={{ ...S.btn, background: showThumbs ? '#2a2b30' : 'transparent' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" /></svg>
                </button>
                <div style={{ flex: 1 }} />
                <button onClick={() => setScale(s => Math.max(s / 1.2, 0.2))} style={S.btn} title="Alejar">−</button>
                <span style={{ fontSize: 12, color: '#aab1bb', minWidth: 42, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
                <button onClick={() => setScale(s => Math.min(s * 1.2, 8))} style={S.btn} title="Acercar">+</button>
                <button onClick={() => fitTo('page')} style={S.btn} title="Ajustar página">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 8l-2 2 2 2M15 8l2 2-2 2" /></svg>
                </button>
                <button onClick={() => fitTo('width')} style={S.btn} title="Ajustar ancho">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3" /></svg>
                </button>
                <div style={S.sep} />
                <button onClick={() => goTo(page - 1)} disabled={page <= 1} style={S.btn}>‹</button>
                <input type="number" value={page} onChange={e => goTo(parseInt(e.target.value) || 1)} style={S.pageInput} min={1} max={numPages} />
                <span style={{ fontSize: 12, color: '#888' }}>/ {numPages}</span>
                <button onClick={() => goTo(page + 1)} disabled={page >= numPages} style={S.btn}>›</button>
                <div style={S.sep} />
                <button onClick={() => setRotation(r => (r + 90) % 360)} style={S.btn} title="Rotar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.55 5.55L11 1v3C7.06 4 4 7.06 4 11s3.06 7 7 7 7-3.06 7-7h-2c0 2.76-2.24 5-5 5s-5-2.24-5-5 2.24-5 5-5v3l4.55-4.45z" /></svg>
                </button>
                <a href={url} download={fileName} target="_blank" rel="noopener noreferrer" style={S.btn} title="Descargar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                </a>
            </div>

            {/* Cuerpo */}
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                {showThumbs && (
                    <div ref={sidebarRef} style={{ width: 160, background: '#1a1b1f', borderRight: '1px solid #2a2b30', overflowY: 'auto', flexShrink: 0 }}>
                        {Array.from({ length: numPages }, (_, i) => i + 1).map(n => (
                            <Thumb key={n} pdf={pdfRef.current} pageNum={n} active={page === n} onClick={() => goTo(n)} />
                        ))}
                    </div>
                )}
                <div ref={containerRef} style={{ flex: 1, overflow: 'auto', cursor: drag.current ? 'grabbing' : 'grab' }}
                    onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
                    <div style={{ padding: 40, minWidth: '100%', width: 'fit-content', boxSizing: 'border-box', margin: '0 auto', display: 'flex', justifyContent: 'center' }}>
                        <div ref={wrapRef}><canvas ref={canvasRef} style={{ boxShadow: '0 4px 18px rgba(0,0,0,0.4)', background: '#fff' }} /></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

const S = {
    center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', background: '#16181c' },
    spin: { width: 34, height: 34, border: '3px solid #2a2b30', borderTop: '3px solid #7e9bbd', borderRadius: '50%', animation: 'spin-acc 1s linear infinite' },
    dl: { marginTop: 14, padding: '8px 18px', background: '#7e9bbd', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 600 },
    bar: { display: 'flex', alignItems: 'center', gap: 3, padding: '0 10px', height: 44, background: '#1c1e22', borderBottom: '1px solid #2a2b30', flexShrink: 0 },
    btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 30, height: 30, border: 'none', background: 'transparent', borderRadius: 5, cursor: 'pointer', color: '#cdd3da', fontSize: 16, padding: '0 6px' },
    sep: { width: 1, height: 22, background: '#2a2b30', margin: '0 6px' },
    pageInput: { width: 40, textAlign: 'center', border: '1px solid #2a2b30', borderRadius: 4, padding: '4px', fontSize: 12, background: '#111315', color: '#fff', outline: 'none' },
};
