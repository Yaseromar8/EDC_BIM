// PdfCompareView.jsx — Comparación de dos versiones de un PDF (estilo Bluebeam/ACC).
// Modo Overlay: tinta A en rojo, B en azul; lo común queda negro. Modo Lado a lado.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

async function signedUrl(gcsUrn, projectPrefix) {
  const r = await apiFetch(`${API}/api/docs/signed-url?urn=${encodeURIComponent(gcsUrn)}&model_urn=${encodeURIComponent(projectPrefix)}`);
  const d = await r.json();
  if (!d.success) throw new Error(d.error || 'No se pudo obtener la URL');
  return d.url;
}

// Renderiza una página de un PDF a un canvas offscreen a la escala dada
async function renderToCanvas(pdf, pageNum, scale) {
  const page = await pdf.getPage(Math.min(pageNum, pdf.numPages));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas;
}

export default function PdfCompareView({ fileName, versionA, versionB, projectPrefix, onClose }) {
  const [pdfA, setPdfA] = useState(null);
  const [pdfB, setPdfB] = useState(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [mode, setMode] = useState('overlay'); // 'overlay' | 'side'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const overlayRef = useRef(null);
  const sideARef = useRef(null);
  const sideBRef = useRef(null);

  // Cargar ambas versiones
  useEffect(() => {
    let cancel = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const [urlA, urlB] = await Promise.all([
          signedUrl(versionA.gcs_urn, projectPrefix),
          signedUrl(versionB.gcs_urn, projectPrefix),
        ]);
        const [a, b] = await Promise.all([
          pdfjsLib.getDocument({ url: urlA }).promise,
          pdfjsLib.getDocument({ url: urlB }).promise,
        ]);
        if (cancel) return;
        setPdfA(a); setPdfB(b); setLoading(false);
      } catch (e) {
        if (!cancel) { setError(e.message || 'Error cargando versiones'); setLoading(false); }
      }
    })();
    return () => { cancel = true; };
  }, [versionA, versionB, projectPrefix]);

  const maxPages = pdfA && pdfB ? Math.max(pdfA.numPages, pdfB.numPages) : 1;

  // Render overlay rojo/azul
  const drawOverlay = useCallback(async () => {
    if (!pdfA || !pdfB || mode !== 'overlay') return;
    const [cA, cB] = await Promise.all([renderToCanvas(pdfA, page, scale), renderToCanvas(pdfB, page, scale)]);
    const w = Math.max(cA.width, cB.width), h = Math.max(cA.height, cB.height);
    const out = overlayRef.current;
    if (!out) return;
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    const ia = cA.getContext('2d').getImageData(0, 0, cA.width, cA.height);
    const ib = cB.getContext('2d').getImageData(0, 0, cB.width, cB.height);
    const res = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const oi = (y * w + x) * 4;
        const ai = (y < cA.height && x < cA.width) ? (y * cA.width + x) * 4 : -1;
        const bi = (y < cB.height && x < cB.width) ? (y * cB.width + x) * 4 : -1;
        // Tinta = 1 - luminancia (papel blanco = 0 tinta)
        const inkA = ai >= 0 ? 1 - (0.299 * ia.data[ai] + 0.587 * ia.data[ai + 1] + 0.114 * ia.data[ai + 2]) / 255 : 0;
        const inkB = bi >= 0 ? 1 - (0.299 * ib.data[bi] + 0.587 * ib.data[bi + 1] + 0.114 * ib.data[bi + 2]) / 255 : 0;
        // A→rojo (quita verde+azul), B→azul (quita rojo+verde); común→negro
        res.data[oi] = 255 - inkB * 255;
        res.data[oi + 1] = 255 - Math.max(inkA, inkB) * 255;
        res.data[oi + 2] = 255 - inkA * 255;
        res.data[oi + 3] = 255;
      }
    }
    ctx.putImageData(res, 0, 0);
  }, [pdfA, pdfB, page, scale, mode]);

  // Render lado a lado
  const drawSide = useCallback(async () => {
    if (!pdfA || !pdfB || mode !== 'side') return;
    const [cA, cB] = await Promise.all([renderToCanvas(pdfA, page, scale), renderToCanvas(pdfB, page, scale)]);
    [[sideARef, cA], [sideBRef, cB]].forEach(([ref, c]) => {
      const out = ref.current;
      if (!out) return;
      out.width = c.width; out.height = c.height;
      out.getContext('2d').drawImage(c, 0, 0);
    });
  }, [pdfA, pdfB, page, scale, mode]);

  useEffect(() => { drawOverlay(); }, [drawOverlay]);
  useEffect(() => { drawSide(); }, [drawSide]);

  const vNum = (v) => `V${v.version_number || 1}`;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 12500, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '94vw', height: '92vh', background: '#fff', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 50px rgba(0,0,0,0.4)' }}>
        {/* Toolbar */}
        <div style={{ height: 48, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #e5e5e5', flexShrink: 0, background: '#222', color: '#fff' }}>
          <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Comparar: {fileName}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ color: '#ff6b6b', fontWeight: 700 }}>● {vNum(versionA)}</span>
            <span style={{ color: '#888' }}>vs</span>
            <span style={{ color: '#5b9dff', fontWeight: 700 }}>● {vNum(versionB)}</span>
          </span>

          <div style={{ display: 'flex', gap: 2, marginLeft: 16, background: '#333', borderRadius: 6, padding: 2 }}>
            <button onClick={() => setMode('overlay')} style={{ padding: '5px 12px', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: mode === 'overlay' ? '#0696d7' : 'transparent', color: '#fff' }}>Superpuesto</button>
            <button onClick={() => setMode('side')} style={{ padding: '5px 12px', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: mode === 'side' ? '#0696d7' : 'transparent', color: '#fff' }}>Lado a lado</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16, fontSize: 13 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={navBtn}>‹</button>
            <span>Pág {page} / {maxPages}</span>
            <button onClick={() => setPage(p => Math.min(maxPages, p + 1))} disabled={page >= maxPages} style={navBtn}>›</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <button onClick={() => setScale(s => Math.max(0.4, s / 1.2))} style={navBtn}>−</button>
            <span>{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale(s => Math.min(4, s * 1.2))} style={navBtn}>+</button>
          </div>

          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', background: '#5a5a5a', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 24 }}>
          {loading && <div style={{ color: '#fff', marginTop: 60 }}>Cargando ambas versiones…</div>}
          {error && <div style={{ color: '#ffb4b4', marginTop: 60 }}>{error}</div>}
          {!loading && !error && mode === 'overlay' && (
            <canvas ref={overlayRef} style={{ background: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }} />
          )}
          {!loading && !error && mode === 'side' && (
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#ff8a8a', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{vNum(versionA)} (anterior)</div>
                <canvas ref={sideARef} style={{ background: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#9cc2ff', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{vNum(versionB)} (nueva)</div>
                <canvas ref={sideBRef} style={{ background: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }} />
              </div>
            </div>
          )}
        </div>

        {/* Leyenda */}
        {mode === 'overlay' && !loading && !error && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid #eee', display: 'flex', gap: 18, fontSize: 12, color: '#555', flexShrink: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, background: '#e53935', borderRadius: 2 }} /> Solo en {vNum(versionA)} (eliminado)</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, background: '#1e88e5', borderRadius: 2 }} /> Solo en {vNum(versionB)} (agregado)</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, background: '#222', borderRadius: 2 }} /> Sin cambios</span>
          </div>
        )}
      </div>
    </div>
  );
}

const navBtn = { background: '#333', border: '1px solid #444', color: '#fff', borderRadius: 4, width: 26, height: 26, cursor: 'pointer', fontSize: 15, lineHeight: 1 };
