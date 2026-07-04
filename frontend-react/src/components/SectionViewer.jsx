import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ── SectionViewer — panel de secciones estilo InfraWorks, DOCKEADO a la derecha ──
// El modelo queda visible. Sincronización DUAL con el visor 3D:
//   panel → modelo: cambiar estación mueve el marcador PK (y el corte si está activo)
//   modelo → panel: mover la progresiva en el 3D (evento LOB4D_PK_CONTEXT_CHANGED)
//                   salta a la sección más cercana.
// "Corte 3D" activa un plano de corte real perpendicular al eje en esa progresiva.
// Esquemas v1 (links sueltos → cadenas) y v2 (puntos ordenados + estilo + área).

const KNOWN_TYPES = [
    { test: /terreno|natural|existing|\beg\b|\bng\b/i, key: 'terreno', label: 'Terreno natural', color: '#10b981', fill: false },
    { test: /rasante|subrasante|datum|dise[nñ]o|design|corredor|corridor/i, key: 'diseno', label: 'Diseño / Rasante', color: '#38bdf8', fill: false },
    { test: /relleno|terrapl|fill|embankment/i, key: 'relleno', label: 'Relleno', color: '#f59e0b', fill: true },
    { test: /corte|excav|\bcut\b|desmonte/i, key: 'corte', label: 'Corte / Excavación', color: '#3b82f6', fill: true },
    { test: /mejoramiento|improve/i, key: 'mejora', label: 'Mejoramiento', color: '#b45309', fill: true },
    { test: /concreto|concrete|f'?c|cajon|box|muro|estructura/i, key: 'concreto', label: 'Concreto / Estructura', color: '#94a3b8', fill: true },
    { test: /solado/i, key: 'solado', label: 'Solado', color: '#64748b', fill: true },
    { test: /pavimento|pave|asfalt|carpeta/i, key: 'pavimento', label: 'Pavimento', color: '#4b5563', fill: true },
    { test: /sub.?base|\bbase\b|granular|afirmado/i, key: 'base', label: 'Base / Subbase', color: '#a16207', fill: true },
    { test: /geotext|geomembrana|geo/i, key: 'geo', label: 'Geosintético', color: '#8b5cf6', fill: true },
];

const AUTO_PALETTE = ['#e879f9', '#22d3ee', '#facc15', '#fb7185', '#4ade80', '#c084fc', '#2dd4bf', '#f97316', '#a3e635', '#60a5fa'];
const hashColor = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
    return AUTO_PALETTE[Math.abs(h) % AUTO_PALETTE.length];
};

const labelFromName = (raw) => {
    let s = String(raw || '').trim();
    s = s.replace(/^.*?material list\s*-\s*\(\d+\)\s*-\s*/i, '');
    s = s.replace(/^secciones\s*-\s*sl-?\d+\s*-\s*/i, '');
    s = s.replace(/\(.*$/, '').trim();
    s = s.replace(/^_+/, '').replace(/\s+\[copy\]$/i, '').replace(/^\d+\s+/, '').trim();
    const parts = s.split(/\s*-\s*/).filter(Boolean);
    return (parts[parts.length - 1] || s || 'Otro').trim();
};

const classify = (name) => {
    for (const t of KNOWN_TYPES) if (t.test.test(name || '')) return t;
    // Estilos de Civil tipo "01 Linea Top", "04 Linea Proyeccion", "All Codes - DR":
    // son LÍNEAS de diseño (no áreas), cada una con color estable propio.
    if (/l[ií]nea|projection|proyeccion|all codes/i.test(name || '')) {
        const label = String(name).replace(/^\d+\s*/, '').trim();
        return { key: `ln:${label.toLowerCase()}`, label, color: hashColor(label.toLowerCase()), fill: false };
    }
    const label = labelFromName(name);
    return { key: `auto:${label.toLowerCase()}`, label, color: hashColor(label.toLowerCase()), fill: true };
};

const EPS = 0.03;
const ptEq = (a, b) => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;

function buildChains(links) {
    const segs = (links || [])
        .map((l) => [[l.startOffset, l.startElevation], [l.endOffset, l.endElevation]])
        .filter((s) => s.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])) && !ptEq(s[0], s[1]));
    const used = new Array(segs.length).fill(false);
    const chains = [];
    for (let i = 0; i < segs.length; i += 1) {
        if (used[i]) continue;
        used[i] = true;
        const chain = [...segs[i]];
        let extended = true;
        while (extended) {
            extended = false;
            for (let j = 0; j < segs.length; j += 1) {
                if (used[j]) continue;
                const [a, b] = segs[j];
                const head = chain[0];
                const tail = chain[chain.length - 1];
                if (ptEq(tail, a)) { chain.push(b); used[j] = true; extended = true; }
                else if (ptEq(tail, b)) { chain.push(a); used[j] = true; extended = true; }
                else if (ptEq(head, b)) { chain.unshift(a); used[j] = true; extended = true; }
                else if (ptEq(head, a)) { chain.unshift(b); used[j] = true; extended = true; }
            }
        }
        const closed = chain.length > 3 && ptEq(chain[0], chain[chain.length - 1]);
        chains.push({ pts: chain, closed });
    }
    return chains;
}

const chainSig = (pts) => {
    let sx = 0; let sy = 0;
    pts.forEach(([x, y]) => { sx += x; sy += y; });
    return `${pts.length}:${sx.toFixed(2)}:${sy.toFixed(2)}`;
};

const shoelace = (pts) => {
    let area = 0;
    for (let i = 0; i < pts.length - 1; i += 1) {
        area += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
    }
    return Math.abs(area) / 2;
};

function normalizeStations(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (raw.schemaVersion >= 2 && Array.isArray(raw.stations)) return raw.stations;
    return [];
}

function niceStep(range, target = 8) {
    const rough = range / target;
    const pow = Math.pow(10, Math.floor(Math.log10(rough || 1)));
    for (const m of [1, 2, 5, 10]) if (rough <= m * pow) return m * pow;
    return 10 * pow;
}

function formatStation(m) {
    const v = Number(m) || 0;
    const km = Math.floor(v / 1000);
    const rest = (v - km * 1000).toFixed(2).padStart(6, '0');
    return `${km}+${rest}`;
}

// Cuadro de volúmenes (áreas medias). Fuente de área por prioridad:
// 1) area real de Civil (v2, cuando la API la expone y es > 0)
// 2) shoelace de los puntos ORDENADOS y cerrados (v2 siempre los trae)
// Material: materialName de Civil o, si no llega, el nombre de la Material List.
function computeVolumes(stations) {
    const byAlign = new Map();
    stations.forEach((st) => {
        if (st?.station == null) return;
        (st.sections || []).forEach((sec) => {
            const isMaterial = !!sec.materialName || /material list/i.test(sec.name || '');
            if (!isMaterial) return;
            const mat = sec.materialName || labelFromName(sec.name);
            if (!mat) return;
            let area = Number(sec.area);
            if (!Number.isFinite(area) || area <= 0) {
                const pts = (sec.points || [])
                    .map((p) => [Number(p?.[0]), Number(p?.[1])])
                    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
                if (sec.closed && pts.length >= 3) area = shoelace(pts);
                else return;
            }
            if (!Number.isFinite(area) || area <= 0) return;
            const key = st.alignmentId || '—';
            if (!byAlign.has(key)) byAlign.set(key, new Map());
            const mats = byAlign.get(key);
            if (!mats.has(mat)) mats.set(mat, new Map());
            mats.get(mat).set(st.station, (mats.get(mat).get(st.station) || 0) + area);
        });
    });
    const materials = [];
    byAlign.forEach((mats, alignmentId) => {
        mats.forEach((rows, mat) => {
            const sorted = [...rows.entries()].sort((a, b) => a[0] - b[0]);
            let acum = 0;
            const table = sorted.map(([pk, area], i) => {
                let parcial = 0;
                if (i > 0) {
                    const [pkPrev, areaPrev] = sorted[i - 1];
                    parcial = ((areaPrev + area) / 2) * (pk - pkPrev);
                }
                acum += parcial;
                return { pk, area, parcial, acum };
            });
            materials.push({ alignmentId, material: mat, table, total: acum });
        });
    });
    materials.sort((a, b) => a.material.localeCompare(b.material));
    return materials;
}

const SectionViewer = ({ sectionsData, onClose, onSync }) => {
    const stations = useMemo(() => normalizeStations(sectionsData), [sectionsData]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [hidden, setHidden] = useState(() => new Set());
    const userTouchedRef = useRef(new Set());
    const [view, setView] = useState(null);
    const [mode, setMode] = useState('seccion');
    const [volMaterial, setVolMaterial] = useState(0);
    const [aspect, setAspect] = useState(1);            // relación anchura/altura (exageración vertical)
    const [cutOn, setCutOn] = useState(false);          // corte 3D real en el modelo
    const [syncOn, setSyncOn] = useState(true);         // dual: modelo→panel
    const [legendOpen, setLegendOpen] = useState(false);
    const dragRef = useRef(null);
    const svgRef = useRef(null);
    const lastSyncRef = useRef(null);
    const volumes = useMemo(() => computeVolumes(stations), [stations]);

    const station = stations[Math.min(currentIndex, Math.max(0, stations.length - 1))];

    // panel → modelo (marcador PK + corte si está activo)
    const pushToModel = useCallback((st, opts = {}) => {
        if (!onSync || !st || st.station == null) return;
        lastSyncRef.current = st.station;
        onSync(st.alignmentId, st.station, { cut: cutOn, ...opts });
    }, [onSync, cutOn]);

    const goIndex = useCallback((i, push = true) => {
        const idx = Math.max(0, Math.min(stations.length - 1, i));
        setCurrentIndex(idx);
        if (push) pushToModel(stations[idx]);
    }, [stations, pushToModel]);

    // modelo → panel: la progresiva del 3D mueve la sección mostrada
    useEffect(() => {
        if (!syncOn || !stations.length) return undefined;
        const handler = (e) => {
            const pk = e.detail?.station;
            if (pk == null) return;
            if (lastSyncRef.current != null && Math.abs(lastSyncRef.current - pk) < 0.01) return; // eco propio
            let best = 0; let bestD = Infinity;
            stations.forEach((st, i) => {
                const d = Math.abs((st.station ?? Infinity) - pk);
                if (d < bestD) { bestD = d; best = i; }
            });
            if (bestD < 50) setCurrentIndex(best);   // solo si hay una sección razonablemente cerca
        };
        window.addEventListener('LOB4D_PK_CONTEXT_CHANGED', handler);
        return () => window.removeEventListener('LOB4D_PK_CONTEXT_CHANGED', handler);
    }, [syncOn, stations]);

    // corte 3D: aplicar/limpiar al toggle y al cambiar de estación con corte activo
    useEffect(() => {
        if (!onSync || !station) return;
        if (cutOn) pushToModel(station, { cut: true });
        else onSync(station.alignmentId, station.station, { cut: false, markerOnly: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cutOn]);

    useEffect(() => () => { try { onSync?.(null, null, { cut: false, clearOnly: true }); } catch { /* noop */ } }, [onSync]);

    // ── Shapes de la estación actual (v1: cadenas · v2: puntos ordenados) ──
    const shapes = useMemo(() => {
        if (!station) return [];
        const out = [];
        const seen = new Set();

        (station.sections || []).forEach((sec, i) => {
            const cls = classify(sec.materialName || sec.styleName || sec.name);
            if (Array.isArray(sec.points) && sec.points.length >= 2) {
                const pts = sec.points
                    .map((p) => [Number(p?.[0]), Number(p?.[1])])
                    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
                if (pts.length < 2) return;
                const invisible = /invisible/i.test(sec.styleName || '') || /invisible/i.test(sec.layer || '');
                const relCorr = sec.sourceType === 'CorridorShape' && sec.absolute === false;
                let finalCls = cls;
                if (relCorr) finalCls = { ...cls, key: `corr:${cls.key}`, label: `${cls.label} (corredor)` };
                else if (invisible) finalCls = { ...cls, key: `inv:${cls.key}`, label: `${cls.label} (oculto en Civil)` };
                const closed = (sec.closed === true) && finalCls.fill;
                out.push({ id: `s${i}`, cls: finalCls, pts, closed, area: sec.area, corridor: relCorr || invisible });
                return;
            }
            buildChains(sec.links).forEach((chain, c) => {
                const sig = chainSig(chain.pts);
                if (seen.has(sig)) return;
                seen.add(sig);
                if (chain.closed && cls.fill) out.push({ id: `l${i}-${c}`, cls, pts: chain.pts, closed: true });
                else out.push({ id: `l${i}-${c}`, cls, pts: chain.pts, closed: false, thin: cls.fill });
            });
        });

        (station.sections || []).forEach((sec, i) => {
            (sec.polygons || []).forEach((poly, j) => {
                const pts = (poly.points || [])
                    .map((p) => [p.startOffset, p.startElevation])
                    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
                if (pts.length < 3) return;
                const sig = chainSig(pts);
                if (seen.has(sig)) return;
                seen.add(sig);
                const base = classify(poly.name || sec.name);
                out.push({
                    id: `p${i}-${j}`,
                    cls: { ...base, key: `corr:${base.key}`, label: `${base.label} (corredor)` },
                    pts, closed: true, corridor: true,
                });
            });
        });
        return out;
    }, [station]);

    useEffect(() => {
        setHidden((prev) => {
            const next = new Set(prev);
            shapes.forEach((s) => { if (s.corridor && !userTouchedRef.current.has(s.cls.key)) next.add(s.cls.key); });
            return next;
        });
    }, [shapes]);

    // Áreas de DESMONTE (corte) y TERRAPLÉN (relleno) de la estación — como InfraWorks.
    // v2: usa las áreas reales de Material List; v1: shoelace de las cadenas cerradas.
    const cutFill = useMemo(() => {
        let cut = 0; let fill = 0;
        shapes.forEach((s) => {
            if (!s.closed || s.corridor) return;
            // Civil a veces reporta area=0 aunque el contorno exista → shoelace de respaldo
            const a = (Number.isFinite(Number(s.area)) && Number(s.area) > 0) ? Number(s.area) : shoelace(s.pts);
            if (s.cls.key === 'corte') cut += a;
            else if (s.cls.key === 'relleno') fill += a;
        });
        return { cut, fill };
    }, [shapes]);

    const legend = useMemo(() => {
        const map = new Map();
        shapes.forEach((s) => { if (!map.has(s.cls.key)) map.set(s.cls.key, s.cls); });
        return [...map.values()];
    }, [shapes]);

    // BBox visible (Y multiplicada por la exageración vertical)
    const bbox = useMemo(() => {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, has = false;
        shapes.forEach((s) => {
            if (hidden.has(s.cls.key)) return;
            s.pts.forEach(([x, y]) => {
                minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                minY = Math.min(minY, y); maxY = Math.max(maxY, y); has = true;
            });
        });
        if (!has) return { minX: -10, maxX: 10, minY: -5, maxY: 5 };
        const px = (maxX - minX) * 0.10 || 5;
        const py = (maxY - minY) * 0.22 || 2;
        return { minX: minX - px, maxX: maxX + px, minY: minY - py, maxY: maxY + py };
    }, [shapes, hidden]);

    const world = useMemo(() => ({
        x: bbox.minX,
        y: -bbox.maxY * aspect,
        w: bbox.maxX - bbox.minX,
        h: (bbox.maxY - bbox.minY) * aspect,
    }), [bbox, aspect]);

    useEffect(() => { setView(null); }, [world.x, world.y, world.w, world.h]);

    const v = view || world;
    const toX = (x) => x;
    const toY = (y) => -y * aspect;
    const px = v.w / 700;

    const clientToWorld = useCallback((ev) => {
        const rect = svgRef.current.getBoundingClientRect();
        const scale = Math.max(v.w / rect.width, v.h / rect.height);
        const dispW = v.w / scale; const dispH = v.h / scale;
        const offX = (rect.width - dispW) / 2; const offY = (rect.height - dispH) / 2;
        return [v.x + (ev.clientX - rect.left - offX) * scale, v.y + (ev.clientY - rect.top - offY) * scale];
    }, [v]);

    const onWheel = useCallback((ev) => {
        ev.preventDefault();
        const [wx, wy] = clientToWorld(ev);
        const f = ev.deltaY > 0 ? 1.18 : 1 / 1.18;
        setView({ x: wx - (wx - v.x) * f, y: wy - (wy - v.y) * f, w: v.w * f, h: v.h * f });
    }, [v, clientToWorld]);

    useEffect(() => {
        const el = svgRef.current;
        if (!el) return undefined;
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [onWheel]);

    const onPointerDown = (ev) => {
        dragRef.current = { start: clientToWorld(ev), view: { ...v } };
        ev.currentTarget.setPointerCapture(ev.pointerId);
    };
    const onPointerMove = (ev) => {
        if (!dragRef.current) return;
        const [wx, wy] = clientToWorld(ev);
        const d = dragRef.current;
        setView({ ...d.view, x: d.view.x - (wx - d.start[0]), y: d.view.y - (wy - d.start[1]) });
    };
    const onPointerUp = () => { dragRef.current = null; };

    const toggle = (key) => {
        userTouchedRef.current.add(key);
        setHidden((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    };

    if (!station) {
        return createPortal(
            <div style={dockStyle}>
                <div style={{ padding: 20, color: '#8a919c', fontSize: 12 }}>No hay datos de secciones disponibles.</div>
                <button onClick={onClose} style={btn(true)}>Cerrar</button>
            </div>,
            document.body
        );
    }

    // Cuadrícula (los rótulos de elevación muestran el valor REAL, sin exageración)
    const gridX = [];
    const gridY = [];
    {
        const stepX = niceStep(v.w, 8);
        const stepY = niceStep(v.h / aspect, 6) * aspect;
        for (let gx = Math.ceil(v.x / stepX) * stepX; gx <= v.x + v.w; gx += stepX) gridX.push(gx);
        for (let gy = Math.ceil(v.y / stepY) * stepY; gy <= v.y + v.h; gy += stepY) gridY.push(gy);
    }
    const fontSize = 10.5 * px * (700 / 620);

    return createPortal(
        <div style={dockStyle}>
            {/* Título */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #23262d', background: '#202020', flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#e6e8ec' }}>Sección transversal</span>
                <span style={{ fontSize: 11, color: '#8a919c' }}>{station.alignmentId}</span>
                <div style={{ flex: 1 }} />
                {/* Spinner de progresiva (estilo InfraWorks) */}
                <div style={{ display: 'flex', alignItems: 'center', background: '#161616', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, overflow: 'hidden' }}>
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, fontWeight: 700, color: '#e6e8ec', padding: '5px 10px' }}>
                        {formatStation(station.station)}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid rgba(255,255,255,0.14)' }}>
                        <button onClick={() => goIndex(currentIndex + 1)} disabled={currentIndex >= stations.length - 1} style={spinBtn}>▲</button>
                        <button onClick={() => goIndex(currentIndex - 1)} disabled={currentIndex === 0} style={{ ...spinBtn, borderTop: '1px solid rgba(255,255,255,0.14)' }}>▼</button>
                    </div>
                </div>
                <button onClick={onClose} style={{ ...btn(false), padding: '5px 9px' }} title="Cerrar">✕</button>
            </div>

            {/* Áreas + controles */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#1a1a1a', flexShrink: 0, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5 }}>
                    <span style={{ color: '#ef4444', fontWeight: 700 }}>Área de desmonte:</span>{' '}
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#e6e8ec' }}>{cutFill.cut.toFixed(3)} m²</span>
                </span>
                <span style={{ fontSize: 11.5 }}>
                    <span style={{ color: '#22c55e', fontWeight: 700 }}>Área de terraplén:</span>{' '}
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#e6e8ec' }}>{cutFill.fill.toFixed(3)} m²</span>
                </span>
                <div style={{ flex: 1 }} />
                <button onClick={() => pushToModel(station, { fly: true })} style={btn(true)} title="Volar la cámara del modelo a esta progresiva">◎ Volar</button>
                <button onClick={() => setCutOn((p) => !p)} style={btn(cutOn)} title="Plano de corte real en el modelo 3D">✂ Corte 3D</button>
                <button onClick={() => setSyncOn((p) => !p)} style={btn(syncOn)} title="El panel sigue la progresiva que muevas en el modelo">⇄ Sync</button>
            </div>

            {/* Dibujo o volúmenes */}
            {mode === 'seccion' ? (
                <div style={{ flex: 1, minHeight: 0, position: 'relative', background: '#17191c' }}>
                    <svg
                        ref={svgRef}
                        style={{ width: '100%', height: '100%', cursor: dragRef.current ? 'grabbing' : 'grab', touchAction: 'none', display: 'block' }}
                        viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
                        preserveAspectRatio="xMidYMid meet"
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onDoubleClick={() => setView(null)}
                    >
                        {gridX.map((gx) => (
                            <line key={`gx${gx}`} x1={gx} y1={v.y} x2={gx} y2={v.y + v.h} stroke="#2b2f34" strokeWidth={px} />
                        ))}
                        {gridY.map((gy) => (
                            <line key={`gy${gy}`} x1={v.x} y1={gy} x2={v.x + v.w} y2={gy} stroke="#2b2f34" strokeWidth={px} />
                        ))}
                        <line x1={0} y1={v.y} x2={0} y2={v.y + v.h} stroke="#3f9e63" strokeWidth={px * 1.3} strokeDasharray={`${px * 9} ${px * 5}`} />

                        {/* offsets abajo · elevaciones a AMBOS lados (valor real) */}
                        {gridX.map((gx) => (
                            <text key={`tx${gx}`} x={gx + px * 3} y={v.y + v.h - fontSize * 0.5} fill="#7f8791" fontSize={fontSize} fontFamily="IBM Plex Mono, monospace">
                                {Math.abs(gx) < 1e-9 ? '0' : `${gx.toFixed(gx % 1 ? 1 : 0)}m`}
                            </text>
                        ))}
                        {gridY.map((gy) => (
                            <g key={`ty${gy}`}>
                                <text x={v.x + px * 5} y={gy - px * 3} fill="#7f8791" fontSize={fontSize} fontFamily="IBM Plex Mono, monospace">
                                    {(-gy / aspect).toFixed(0)}m
                                </text>
                                <text x={v.x + v.w - px * 5} y={gy - px * 3} fill="#7f8791" fontSize={fontSize} fontFamily="IBM Plex Mono, monospace" textAnchor="end">
                                    {(-gy / aspect).toFixed(0)}m
                                </text>
                            </g>
                        ))}

                        {shapes.filter((s) => s.closed && !hidden.has(s.cls.key)).map((s) => (
                            <polygon key={s.id} points={s.pts.map(([x, y]) => `${toX(x)},${toY(y)}`).join(' ')}
                                fill={s.cls.color} fillOpacity={0.28} stroke={s.cls.color} strokeWidth={px * 1.3} strokeOpacity={0.95}>
                                <title>{s.cls.label}{s.area != null ? ` · ${Number(s.area).toFixed(2)} m²` : ''}</title>
                            </polygon>
                        ))}
                        {shapes.filter((s) => !s.closed && !hidden.has(s.cls.key)).map((s) => (
                            <polyline key={s.id} points={s.pts.map(([x, y]) => `${toX(x)},${toY(y)}`).join(' ')}
                                fill="none" stroke={s.cls.color}
                                strokeWidth={s.thin ? px * 1.0 : px * 2.0}
                                strokeOpacity={s.thin ? 0.55 : 1}
                                strokeLinejoin="round" strokeLinecap="round">
                                <title>{s.cls.label}</title>
                            </polyline>
                        ))}
                    </svg>
                    <div style={{ position: 'absolute', right: 10, bottom: 8, fontSize: 10, color: '#43506b', pointerEvents: 'none' }}>
                        rueda = zoom · arrastre = mover · doble clic = encuadrar
                    </div>
                </div>
            ) : (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', background: '#191b1e' }}>
                    <div style={{ width: 190, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)', background: '#1a1a1a', padding: 10, overflowY: 'auto' }}>
                        {volumes.map((m, i) => (
                            <button key={`${m.alignmentId}:${m.material}`} onClick={() => setVolMaterial(i)}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 8px', borderRadius: 6, marginBottom: 5, cursor: 'pointer', border: volMaterial === i ? '1px solid #3aa0ff' : '1px solid rgba(255,255,255,0.07)', background: volMaterial === i ? 'rgba(58,160,255,0.12)' : 'transparent' }}>
                                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#d7dbe2' }}>{m.material}</div>
                                <div style={{ fontSize: 10, color: '#8a919c', marginTop: 2, fontFamily: 'IBM Plex Mono, monospace' }}>
                                    {m.total.toLocaleString('es-PE', { maximumFractionDigits: 1 })} m³
                                </div>
                            </button>
                        ))}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
                        {volumes[Math.min(volMaterial, volumes.length - 1)] && (() => {
                            const m = volumes[Math.min(volMaterial, volumes.length - 1)];
                            return (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                                    <thead>
                                        <tr style={{ position: 'sticky', top: 0, background: '#202020', color: '#8a8f98', textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '0.08em' }}>
                                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Progresiva</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Área m²</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Parcial m³</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Acum. m³</th>
                                        </tr>
                                    </thead>
                                    <tbody style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#c8cdd6' }}>
                                        {m.table.map((r) => (
                                            <tr key={r.pk} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                                <td style={{ padding: '6px 12px', color: '#8ecbff' }}>{formatStation(r.pk)}</td>
                                                <td style={{ padding: '6px 12px', textAlign: 'right' }}>{r.area.toFixed(2)}</td>
                                                <td style={{ padding: '6px 12px', textAlign: 'right' }}>{r.parcial.toFixed(2)}</td>
                                                <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 700 }}>{r.acum.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                        <tr style={{ borderTop: '2px solid rgba(255,255,255,0.14)', background: '#202020' }}>
                                            <td style={{ padding: '8px 12px', fontWeight: 800, color: '#e6e8ec' }}>TOTAL</td>
                                            <td /><td />
                                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#22c55e' }}>{m.total.toFixed(2)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Barra inferior: slider + relación + vistas + capas */}
            <div style={{ padding: '8px 12px', background: '#202020', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="range" min={0} max={Math.max(0, stations.length - 1)} value={currentIndex}
                        onChange={(e) => goIndex(parseInt(e.target.value, 10))} style={{ flex: 1, accentColor: '#3aa0ff' }} />
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10.5, color: '#8a919c' }}>
                        {currentIndex + 1}/{stations.length}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10.5, color: '#8a919c' }}>Relación</span>
                    {[1, 2, 4].map((a) => (
                        <button key={a} onClick={() => setAspect(a)} style={{ ...btn(aspect === a), padding: '3px 8px', fontSize: 11 }}>{a.toFixed(1)}</button>
                    ))}
                    <span style={{ width: 1, height: 16, background: '#2a2f37' }} />
                    <button onClick={() => setMode('seccion')} style={{ ...btn(mode === 'seccion'), padding: '3px 10px', fontSize: 11 }}>Sección</button>
                    {volumes.length > 0 && (
                        <button onClick={() => setMode('volumenes')} style={{ ...btn(mode === 'volumenes'), padding: '3px 10px', fontSize: 11 }}>Volúmenes</button>
                    )}
                    <div style={{ flex: 1 }} />
                    <button onClick={() => setLegendOpen((p) => !p)} style={{ ...btn(legendOpen), padding: '3px 10px', fontSize: 11 }}>
                        Capas ({legend.length})
                    </button>
                </div>
                {legendOpen && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, maxHeight: 96, overflowY: 'auto' }}>
                        {legend.map((t) => {
                            const off = hidden.has(t.key);
                            return (
                                <button key={t.key} onClick={() => toggle(t.key)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.10)', background: 'transparent', cursor: 'pointer', opacity: off ? 0.38 : 1 }}>
                                    <span style={{ width: 10, height: 10, borderRadius: 2, background: t.color }} />
                                    <span style={{ fontSize: 10.5, color: '#d7dbe2' }}>{t.label}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

// Paleta de la interfaz principal del visor (grises neutros + acento #0078d4)
const dockStyle = {
    position: 'fixed',
    top: 62,
    right: 12,
    bottom: 14,
    width: 'min(46vw, 720px)',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    background: '#1e1e1e',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    overflow: 'hidden',
    boxShadow: '0 16px 40px rgba(0,0,0,0.55)',
    fontFamily: 'inherit',
    color: '#e0e0e0',
};

const spinBtn = {
    border: 'none', background: 'transparent', color: '#9aa3ad', cursor: 'pointer',
    fontSize: 8, lineHeight: '11px', padding: '1px 7px',
};

const btn = (primary, disabled) => ({
    padding: '5px 12px', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
    border: primary ? '1px solid #0078d4' : '1px solid rgba(255,255,255,0.12)',
    background: primary ? 'rgba(0,120,212,0.18)' : 'transparent',
    color: primary ? '#4db2ff' : '#c9ced4',
    opacity: disabled ? 0.4 : 1,
});

export default SectionViewer;
