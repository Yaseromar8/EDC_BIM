// PdfToolsOverlay.jsx — Capa de ingeniería sobre PDF.js
// Mediciones (distancia/área/conteo), anotaciones (nube, flecha, rect, lápiz, texto)
// y calibración de escala. Geometrías en coordenadas PDF (independientes del zoom).
import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';

const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#000000'];

function dist2d(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
function polyLength(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += dist2d(pts[i - 1], pts[i]); return s; }
function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}
function fmt(n) { return n >= 100 ? n.toFixed(1) : n.toFixed(2); }

// Path de nube de revisión: arcos festoneados sobre el perímetro de un rect
function cloudPath(x, y, w, h) {
  const r = Math.max(6, Math.min(14, Math.min(Math.abs(w), Math.abs(h)) / 6));
  const seg = (x1, y1, x2, y2) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.round(len / (r * 1.6)));
    let d = '';
    for (let i = 0; i < n; i++) {
      const t2 = (i + 1) / n;
      d += ` A ${r} ${r} 0 0 1 ${x1 + (x2 - x1) * t2} ${y1 + (y2 - y1) * t2}`;
    }
    return d;
  };
  const x2 = x + w, y2 = y + h;
  return `M ${x} ${y}` + seg(x, y, x2, y) + seg(x2, y, x2, y2) + seg(x2, y2, x, y2) + seg(x, y2, x, y) + ' Z';
}

export default function PdfToolsOverlay({ vpInfo, page, nodeId, projectPrefix, tool, setTool, color, userName }) {
  const [markups, setMarkups] = useState([]);          // todos los del documento
  const [calibrations, setCalibrations] = useState({}); // { page: {units_per_pdf, display_unit} }
  const [draft, setDraft] = useState(null);            // figura en construcción
  const [textDraft, setTextDraft] = useState(null);    // { px, py } posición de input de texto
  const [calibAsk, setCalibAsk] = useState(null);      // { p1, p2 } pidiendo distancia real
  const svgRef = useRef(null);
  const draftRef = useRef(null);
  draftRef.current = draft;

  const vp = vpInfo?.vp;
  const cal = calibrations[String(page)];

  // ── Cargar markups + calibraciones del documento ──
  useEffect(() => {
    if (!nodeId) return;
    apiFetch(`${API}/api/pdf/markups?node_id=${nodeId}`).then(r => r.json())
      .then(d => { if (d.success) setMarkups(d.markups); }).catch(() => {});
    apiFetch(`${API}/api/pdf/calibration?node_id=${nodeId}`).then(r => r.json())
      .then(d => { if (d.success) setCalibrations(d.calibrations || {}); }).catch(() => {});
  }, [nodeId]);

  // ── Transformaciones ──
  const toPdf = useCallback((e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return vp.convertToPdfPoint(e.clientX - rect.left, e.clientY - rect.top);
  }, [vp]);
  const toScr = useCallback((p) => vp.convertToViewportPoint(p[0], p[1]), [vp]);

  // ── Persistencia ──
  const saveMarkup = async (kind, geometry, text = null) => {
    const local = { id: `tmp_${Date.now()}`, page, kind, geometry, style: { color }, text, created_by: userName, _unsaved: true };
    setMarkups(prev => [...prev, local]);
    try {
      const r = await apiFetch(`${API}/api/pdf/markups`, {
        method: 'POST',
        body: JSON.stringify({ node_id: nodeId, model_urn: projectPrefix, page, kind, geometry, style: { color }, text, user: userName })
      });
      if (r.status === 404) throw new Error('endpoint-404');
      const d = await r.json();
      if (d.success) setMarkups(prev => prev.map(m => m.id === local.id ? { ...m, id: d.id, _unsaved: false } : m));
      else throw new Error(d.error || 'fallo');
    } catch (e) {
      // No borramos la anotación: el usuario no pierde su trabajo en la sesión.
      // Queda marcada como no-guardada (no sobrevive a recargar hasta que el
      // backend responda). Mensaje accionable según el tipo de fallo.
      if (String(e.message).includes('404')) {
        toast.error('Backend desactualizado: reinícialo para guardar anotaciones.', { duration: 5000 });
      } else {
        toast.error('No se pudo guardar la anotación (revisa el backend).');
      }
    }
  };

  const deleteMarkup = async (m) => {
    setMarkups(prev => prev.filter(x => x.id !== m.id));
    try {
      const r = await apiFetch(`${API}/api/pdf/markups/${m.id}`, { method: 'DELETE' });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error); }
    } catch (e) {
      toast.error(e.message || 'No se pudo eliminar');
      setMarkups(prev => [...prev, m]);
    }
  };

  // ── Interacción de dibujo ──
  const onPointerDown = (e) => {
    if (tool === 'pan' || !vp) return;
    e.preventDefault(); e.stopPropagation();
    const p = toPdf(e);

    if (tool === 'count') { saveMarkup('count', { p }); return; }
    if (tool === 'text') { setTextDraft({ p }); return; }
    if (tool === 'measure' || tool === 'area' || tool === 'calibrate') {
      setDraft(prev => {
        const pts = prev?.points ? [...prev.points, p] : [p];
        if (tool === 'calibrate' && pts.length === 2) { setCalibAsk({ p1: pts[0], p2: pts[1] }); return null; }
        return { kind: tool, points: pts, cursor: p };
      });
      return;
    }
    // Figuras por arrastre
    if (['cloud', 'rect', 'arrow', 'pen'].includes(tool)) {
      setDraft({ kind: tool, start: p, end: p, points: [p], dragging: true });
    }
  };

  const onPointerMove = (e) => {
    const d = draftRef.current;
    if (!d || !vp) return;
    const p = toPdf(e);
    if (d.dragging) {
      setDraft(prev => prev && ({ ...prev, end: p, points: prev.kind === 'pen' ? [...prev.points, p] : prev.points }));
    } else if (d.points) {
      setDraft(prev => prev && ({ ...prev, cursor: p }));
    }
  };

  const onPointerUp = () => {
    const d = draftRef.current;
    if (!d || !d.dragging) return;
    setDraft(null);
    const { kind, start, end, points } = d;
    if (kind === 'pen') { if (points.length > 2) saveMarkup('pen', { points }); return; }
    if (dist2d(start, end) < 2) return; // clic accidental
    if (kind === 'arrow') saveMarkup('arrow', { p1: start, p2: end });
    else saveMarkup(kind, { x: Math.min(start[0], end[0]), y: Math.min(start[1], end[1]), w: Math.abs(end[0] - start[0]), h: Math.abs(end[1] - start[1]) });
  };

  const onDoubleClick = (e) => {
    const d = draftRef.current;
    if (!d || !d.points || d.points.length < 2) return;
    e.preventDefault(); e.stopPropagation();
    const pts = d.points;
    setDraft(null);
    if (d.kind === 'measure' && pts.length >= 2) saveMarkup('measure', { points: pts });
    if (d.kind === 'area' && pts.length >= 3) saveMarkup('area', { points: pts });
  };

  // Esc cancela el dibujo en curso
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setDraft(null); setTextDraft(null); setCalibAsk(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Etiquetas con escala ──
  const lenLabel = (pts) => {
    const u = polyLength(pts);
    return cal ? `${fmt(u * cal.units_per_pdf)} ${cal.display_unit}` : `${fmt(u)} pt (sin escala)`;
  };
  const areaLabel = (pts) => {
    const a = polyArea(pts);
    return cal ? `${fmt(a * cal.units_per_pdf * cal.units_per_pdf)} ${cal.display_unit}²` : `${fmt(a)} pt² (sin escala)`;
  };

  if (!vp) return null;
  const pageMarkups = markups.filter(m => m.page === page);
  const countTotal = pageMarkups.filter(m => m.kind === 'count').length;

  // ── Render de un markup ──
  const renderMarkup = (m, i) => {
    const c = m.style?.color || '#e53935';
    const common = {
      stroke: c, fill: 'none', strokeWidth: 2,
      style: { cursor: tool === 'erase' ? 'not-allowed' : 'default', pointerEvents: tool === 'erase' ? 'all' : 'none' },
      onClick: tool === 'erase' ? () => deleteMarkup(m) : undefined
    };
    const g = m.geometry || {};
    if (m.kind === 'measure' || m.kind === 'area' || m.kind === 'pen') {
      const pts = (g.points || []).map(toScr);
      if (pts.length < 2) return null;
      const mid = pts[Math.floor(pts.length / 2)];
      return (
        <g key={m.id}>
          {m.kind === 'area'
            ? <polygon points={pts.map(p => p.join(',')).join(' ')} {...common} fill={c + '22'} />
            : <polyline points={pts.map(p => p.join(',')).join(' ')} {...common} />}
          {m.kind !== 'pen' && (
            <text x={mid[0] + 6} y={mid[1] - 6} fontSize="13" fontWeight="700" fill={c} stroke="#fff" strokeWidth="3" paintOrder="stroke" style={{ pointerEvents: 'none' }}>
              {m.kind === 'measure' ? lenLabel(g.points) : areaLabel(g.points)}
            </text>
          )}
        </g>
      );
    }
    if (m.kind === 'count') {
      const s = toScr(g.p);
      const idx = pageMarkups.filter(x => x.kind === 'count').indexOf(m) + 1;
      return (
        <g key={m.id} style={common.style} onClick={common.onClick}>
          <circle cx={s[0]} cy={s[1]} r="10" fill={c} stroke="#fff" strokeWidth="2" pointerEvents={tool === 'erase' ? 'all' : 'none'} />
          <text x={s[0]} y={s[1] + 4} fontSize="11" fontWeight="700" fill="#fff" textAnchor="middle" style={{ pointerEvents: 'none' }}>{idx}</text>
        </g>
      );
    }
    if (m.kind === 'arrow') {
      const a = toScr(g.p1), b = toScr(g.p2);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const h = 12;
      return (
        <g key={m.id}>
          <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...common} strokeWidth={2.5} />
          <polygon points={`${b[0]},${b[1]} ${b[0] - h * Math.cos(ang - 0.45)},${b[1] - h * Math.sin(ang - 0.45)} ${b[0] - h * Math.cos(ang + 0.45)},${b[1] - h * Math.sin(ang + 0.45)}`}
            fill={c} style={common.style} onClick={common.onClick} pointerEvents={tool === 'erase' ? 'all' : 'none'} />
        </g>
      );
    }
    if (m.kind === 'rect' || m.kind === 'cloud') {
      const a = toScr([g.x, g.y]), b = toScr([g.x + g.w, g.y + g.h]);
      const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
      return m.kind === 'cloud'
        ? <path key={m.id} d={cloudPath(x, y, w, h)} {...common} strokeWidth={2.2} />
        : <rect key={m.id} x={x} y={y} width={w} height={h} {...common} />;
    }
    if (m.kind === 'text') {
      const s = toScr(g.p);
      return (
        <text key={m.id} x={s[0]} y={s[1]} fontSize="14" fontWeight="600" fill={c} stroke="#fff" strokeWidth="3" paintOrder="stroke"
          style={{ cursor: tool === 'erase' ? 'not-allowed' : 'default' }} pointerEvents={tool === 'erase' ? 'all' : 'none'}
          onClick={tool === 'erase' ? () => deleteMarkup(m) : undefined}>
          {m.text}
        </text>
      );
    }
    return null;
  };

  // ── Borrador en curso ──
  const renderDraft = () => {
    if (!draft) return null;
    if (draft.points && (draft.kind === 'measure' || draft.kind === 'area' || draft.kind === 'calibrate')) {
      const all = draft.cursor ? [...draft.points, draft.cursor] : draft.points;
      const pts = all.map(toScr);
      return (
        <g>
          <polyline points={pts.map(p => p.join(',')).join(' ')} stroke={color} strokeWidth="2" strokeDasharray="6 4" fill={draft.kind === 'area' ? color + '18' : 'none'} />
          {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill={color} />)}
          {draft.kind !== 'calibrate' && all.length >= 2 && (
            <text x={pts[pts.length - 1][0] + 8} y={pts[pts.length - 1][1] - 8} fontSize="13" fontWeight="700" fill={color} stroke="#fff" strokeWidth="3" paintOrder="stroke">
              {draft.kind === 'area' ? areaLabel(all) : lenLabel(all)}
            </text>
          )}
        </g>
      );
    }
    if (draft.dragging) {
      const { kind, start, end, points } = draft;
      if (kind === 'pen') return <polyline points={points.map(toScr).map(p => p.join(',')).join(' ')} stroke={color} strokeWidth="2" fill="none" />;
      if (kind === 'arrow') { const a = toScr(start), b = toScr(end); return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth="2.5" strokeDasharray="6 4" />; }
      const a = toScr(start), b = toScr(end);
      const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
      return kind === 'cloud'
        ? <path d={cloudPath(x, y, w, h)} stroke={color} strokeWidth="2" fill="none" strokeDasharray="6 4" />
        : <rect x={x} y={y} width={w} height={h} stroke={color} strokeWidth="2" fill="none" strokeDasharray="6 4" />;
    }
    return null;
  };

  const confirmCalibration = async (meters, unit) => {
    const pdfDist = dist2d(calibAsk.p1, calibAsk.p2);
    if (!pdfDist || !meters) return;
    const upp = meters / pdfDist;
    setCalibrations(prev => ({ ...prev, [String(page)]: { units_per_pdf: upp, display_unit: unit } }));
    setCalibAsk(null);
    setTool('measure');
    try {
      await apiFetch(`${API}/api/pdf/calibration`, {
        method: 'PUT',
        body: JSON.stringify({ node_id: nodeId, page, units_per_pdf: upp, display_unit: unit })
      });
      toast.success(`Escala calibrada: 1 pt = ${upp.toFixed(4)} ${unit}`);
    } catch (e) { toast.error('No se pudo guardar la calibración'); }
  };

  const interactive = tool !== 'pan';
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: interactive ? 'auto' : 'none' }}>
      <svg
        ref={svgRef}
        width={vpInfo.w} height={vpInfo.h}
        style={{ display: 'block', cursor: interactive ? (tool === 'erase' ? 'pointer' : 'crosshair') : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {pageMarkups.map(renderMarkup)}
        {renderDraft()}
      </svg>

      {/* Input de texto flotante */}
      {textDraft && (() => {
        const s = toScr(textDraft.p);
        return (
          <input
            autoFocus
            placeholder="Texto…"
            style={{ position: 'absolute', left: s[0], top: s[1] - 14, width: 180, padding: '4px 8px', fontSize: 13, border: `2px solid ${color}`, borderRadius: 4, outline: 'none', background: '#fff' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) saveMarkup('text', { p: textDraft.p }, v); setTextDraft(null); }
              if (e.key === 'Escape') setTextDraft(null);
            }}
            onBlur={() => setTextDraft(null)}
          />
        );
      })()}

      {/* Diálogo de calibración */}
      {calibAsk && (
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: '#1c2027', color: '#fff', padding: '14px 18px', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: 10, zIndex: 50 }}>
          <span style={{ fontSize: 13 }}>Distancia real entre los 2 puntos:</span>
          <input id="calib-input" autoFocus type="number" step="any" placeholder="10.00"
            style={{ width: 90, padding: '5px 8px', borderRadius: 6, border: '1px solid #555', background: '#12151a', color: '#fff', fontSize: 13 }}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmCalibration(parseFloat(e.target.value), document.getElementById('calib-unit').value); }} />
          <select id="calib-unit" defaultValue="m" style={{ padding: '5px', borderRadius: 6, background: '#12151a', color: '#fff', border: '1px solid #555' }}>
            <option value="m">m</option><option value="cm">cm</option><option value="km">km</option><option value="ft">ft</option>
          </select>
          <button onClick={() => confirmCalibration(parseFloat(document.getElementById('calib-input').value), document.getElementById('calib-unit').value)}
            style={{ background: '#5f7fa3', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>OK</button>
          <button onClick={() => setCalibAsk(null)} style={{ background: 'transparent', border: '1px solid #555', color: '#bbb', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>✕</button>
        </div>
      )}

      {/* Barra de estado: totales de la página */}
      {(pageMarkups.length > 0 || draft) && (
        <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(28,32,39,0.92)', color: '#eee', padding: '6px 14px', borderRadius: 8, fontSize: 12, display: 'flex', gap: 14, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          <span>{cal ? `Escala: 1 pt = ${cal.units_per_pdf.toFixed(4)} ${cal.display_unit}` : '⚠ Sin calibrar'}</span>
          {countTotal > 0 && <span>Conteo: <b>{countTotal}</b></span>}
          {(() => {
            const ms = pageMarkups.filter(m => m.kind === 'measure');
            if (!ms.length || !cal) return null;
            const tot = ms.reduce((s, m) => s + polyLength(m.geometry.points), 0) * cal.units_per_pdf;
            return <span>Σ Distancias: <b>{fmt(tot)} {cal.display_unit}</b></span>;
          })()}
          {(() => {
            const as = pageMarkups.filter(m => m.kind === 'area');
            if (!as.length || !cal) return null;
            const tot = as.reduce((s, m) => s + polyArea(m.geometry.points), 0) * cal.units_per_pdf * cal.units_per_pdf;
            return <span>Σ Áreas: <b>{fmt(tot)} {cal.display_unit}²</b></span>;
          })()}
        </div>
      )}
    </div>
  );
}

export { COLORS };
