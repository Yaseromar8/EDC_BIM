import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ── SectionViewer — secciones transversales estilo Civil 3D ──
// Soporta 2 esquemas del extractor C#:
//   v1 (actual): [{ station, sections: [{ name, links: [segmentos sueltos], polygons }] }]
//       → reconstruimos cadenas continuas (heurística) y clasificamos por nombre.
//   v2 (Nivel 2): { schemaVersion: 2, stations: [{ station, sections: [{ name,
//       styleName, area, closed, points: [[off, elev], ...] (YA ordenados) }] }] }
//       → dibujamos tal cual, clasificamos por styleName (exacto).
// Cuadrícula con ejes rotulados, zoom (rueda), pan (arrastre), leyenda con aislamiento.

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
    const label = labelFromName(name);
    return { key: `auto:${label.toLowerCase()}`, label, color: hashColor(label.toLowerCase()), fill: true };
};

// ── Reconstrucción de cadenas (solo esquema v1: links sueltos y desordenados) ──
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

// Normaliza v1/v2 a una lista de estaciones uniforme.
function normalizeStations(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;                       // v1
    if (raw.schemaVersion >= 2 && Array.isArray(raw.stations)) return raw.stations; // v2
    return [];
}

// Paso "bonito" para la cuadrícula (1/2/5 × 10^n).
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

const SectionViewer = ({ sectionsData, onClose }) => {
    const stations = useMemo(() => normalizeStations(sectionsData), [sectionsData]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [hidden, setHidden] = useState(() => new Set());
    const userTouchedRef = useRef(new Set());   // keys que el usuario toggleó (no auto-ocultar)
    const [view, setView] = useState(null);     // viewBox {x,y,w,h} para zoom/pan
    const dragRef = useRef(null);
    const svgRef = useRef(null);

    const station = stations[Math.min(currentIndex, Math.max(0, stations.length - 1))];

    // ── Shapes de la estación actual ──
    const shapes = useMemo(() => {
        if (!station) return [];
        const out = [];
        const seen = new Set();

        (station.sections || []).forEach((sec, i) => {
            const cls = classify(sec.styleName || sec.name);
            // v2: puntos YA ordenados por Civil → dibujar tal cual
            if (Array.isArray(sec.points) && sec.points.length >= 2) {
                const pts = sec.points
                    .map((p) => [Number(p?.[0]), Number(p?.[1])])
                    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
                if (pts.length < 2) return;
                // shape de corredor SIN coordenadas absolutas → grupo aparte, apagado
                const relCorr = sec.sourceType === 'CorridorShape' && sec.absolute === false;
                const finalCls = relCorr
                    ? { ...cls, key: `corr:${cls.key}`, label: `${cls.label} (corredor)` }
                    : cls;
                const closed = (sec.closed === true) && finalCls.fill;
                out.push({ id: `s${i}`, cls: finalCls, pts, closed, area: sec.area, corridor: relCorr });
                return;
            }
            // v1: reconstruir cadenas desde links sueltos
            buildChains(sec.links).forEach((chain, c) => {
                const sig = chainSig(chain.pts);
                if (seen.has(sig)) return;
                seen.add(sig);
                if (chain.closed && cls.fill) out.push({ id: `l${i}-${c}`, cls, pts: chain.pts, closed: true });
                else out.push({ id: `l${i}-${c}`, cls, pts: chain.pts, closed: false, thin: cls.fill });
            });
        });

        // Shapes del corredor (v1: elevación RELATIVA a la rasante → grupo aparte,
        // apagado por defecto; el usuario puede encenderlo en la leyenda).
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

    // Auto-ocultar shapes de corredor (coordenadas relativas) salvo que el usuario los active.
    useEffect(() => {
        setHidden((prev) => {
            const next = new Set(prev);
            shapes.forEach((s) => {
                if (s.corridor && !userTouchedRef.current.has(s.cls.key)) next.add(s.cls.key);
            });
            return next;
        });
    }, [shapes]);

    const legend = useMemo(() => {
        const map = new Map();
        shapes.forEach((s) => { if (!map.has(s.cls.key)) map.set(s.cls.key, s.cls); });
        return [...map.values()];
    }, [shapes]);

    // BBox del contenido VISIBLE (sin los ocultos → el fantasma no arruina el encuadre).
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

    // Vista (viewBox) en coordenadas MUNDO-X / MUNDO-Y-invertida.
    const world = useMemo(() => ({
        x: bbox.minX, y: -bbox.maxY, w: bbox.maxX - bbox.minX, h: bbox.maxY - bbox.minY,
    }), [bbox]);

    useEffect(() => { setView(null); }, [world.x, world.y, world.w, world.h]); // re-encuadrar al cambiar estación/leyenda

    const v = view || world;
    const toX = (x) => x;
    const toY = (y) => -y;              // invertir Y una sola vez (SVG crece hacia abajo)
    const px = v.w / 900;               // 1 "pixel" visual en unidades de mundo (constante al zoom)

    // ── Zoom con rueda (centrado en el cursor) + pan con arrastre ──
    const clientToWorld = useCallback((ev) => {
        const rect = svgRef.current.getBoundingClientRect();
        // preserveAspectRatio=xMidYMid meet → escala uniforme con letterbox
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
        if (!el) return;
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

    const go = (i) => setCurrentIndex(Math.max(0, Math.min(stations.length - 1, i)));
    const toggle = (key) => {
        userTouchedRef.current.add(key);
        setHidden((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    };

    if (!station) {
        return createPortal(
            <div style={overlayStyle}>
                <p style={{ color: '#d7dbe2' }}>No hay datos de secciones disponibles.</p>
                <button onClick={onClose} style={btn(true)}>Cerrar</button>
            </div>,
            document.body
        );
    }

    const stationLabel = station.station != null ? `PK ${formatStation(station.station)}` : (station.sampleLineName || `Estación ${currentIndex}`);

    // ── Cuadrícula (recalculada con el zoom actual) ──
    const gridX = [];
    const gridY = [];
    {
        const stepX = niceStep(v.w, 10);
        const stepY = niceStep(v.h, 7);
        for (let gx = Math.ceil(v.x / stepX) * stepX; gx <= v.x + v.w; gx += stepX) gridX.push(gx);
        for (let gy = Math.ceil(v.y / stepY) * stepY; gy <= v.y + v.h; gy += stepY) gridY.push(gy);
    }
    const fontSize = 11 * px * (900 / 760);

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '88vw', height: '88vh', display: 'flex', flexDirection: 'column', background: 'rgba(10,11,13,0.97)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.1)', fontFamily: 'Inter, system-ui, sans-serif' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 22px', borderBottom: '1px solid #23262d', background: '#101317' }}>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#e6e8ec' }}>Secciones transversales · Civil 3D</div>
                        <div style={{ fontSize: 12, color: '#8a919c', marginTop: 2 }}>
                            {station.alignmentId} · {station.sampleLineGroupId} · <span style={{ color: '#8ecbff', fontFamily: 'IBM Plex Mono, monospace' }}>{stationLabel}</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setView(null)} style={btn(false)} title="Re-encuadrar">⤢ Encuadrar</button>
                        <button onClick={onClose} style={btn(false)}>✕ Cerrar</button>
                    </div>
                </div>

                <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                    {/* Dibujo */}
                    <div style={{ flex: 1, minWidth: 0, background: '#0b1220', position: 'relative' }}>
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
                            {/* Cuadrícula estilo Civil */}
                            {gridX.map((gx) => (
                                <line key={`gx${gx}`} x1={gx} y1={v.y} x2={gx} y2={v.y + v.h} stroke="#22304a" strokeWidth={px} />
                            ))}
                            {gridY.map((gy) => (
                                <line key={`gy${gy}`} x1={v.x} y1={gy} x2={v.x + v.w} y2={gy} stroke="#22304a" strokeWidth={px} />
                            ))}
                            {/* Eje central (offset 0) */}
                            <line x1={0} y1={v.y} x2={0} y2={v.y + v.h} stroke="#3f9e63" strokeWidth={px * 1.4} strokeDasharray={`${px * 10} ${px * 6}`} />
                            <text x={px * 6} y={v.y + fontSize * 1.6} fill="#3f9e63" fontSize={fontSize} fontFamily="IBM Plex Mono, monospace">CL</text>

                            {/* Rótulos: offsets (abajo) y elevaciones (izquierda) */}
                            {gridX.map((gx) => (
                                <text key={`tx${gx}`} x={gx + px * 3} y={v.y + v.h - fontSize * 0.6} fill="#5b7db1" fontSize={fontSize} fontFamily="IBM Plex Mono, monospace">
                                    {Math.abs(gx) < 1e-9 ? '0' : gx.toFixed(gx % 1 ? 1 : 0)}
                                </text>
                            ))}
                            {gridY.map((gy) => (
                                <text key={`ty${gy}`} x={v.x + px * 5} y={gy - px * 3} fill="#5b7db1" fontSize={fontSize} fontFamily="IBM Plex Mono, monospace">
                                    {(-gy).toFixed(gy % 1 ? 1 : 0)}
                                </text>
                            ))}

                            {/* Áreas primero, líneas encima */}
                            {shapes.filter((s) => s.closed && !hidden.has(s.cls.key)).map((s) => (
                                <polygon key={s.id} points={s.pts.map(([x, y]) => `${toX(x)},${toY(y)}`).join(' ')}
                                    fill={s.cls.color} fillOpacity={0.30} stroke={s.cls.color} strokeWidth={px * 1.4} strokeOpacity={0.95}>
                                    <title>{s.cls.label}{s.area != null ? ` · ${Number(s.area).toFixed(2)} m²` : ''}</title>
                                </polygon>
                            ))}
                            {shapes.filter((s) => !s.closed && !hidden.has(s.cls.key)).map((s) => (
                                <polyline key={s.id} points={s.pts.map(([x, y]) => `${toX(x)},${toY(y)}`).join(' ')}
                                    fill="none" stroke={s.cls.color}
                                    strokeWidth={s.thin ? px * 1.1 : px * 2.2}
                                    strokeOpacity={s.thin ? 0.55 : 1}
                                    strokeLinejoin="round" strokeLinecap="round">
                                    <title>{s.cls.label}</title>
                                </polyline>
                            ))}
                        </svg>
                        <div style={{ position: 'absolute', right: 12, bottom: 10, fontSize: 10.5, color: '#43506b', pointerEvents: 'none' }}>
                            rueda = zoom · arrastre = mover · doble clic = encuadrar
                        </div>
                    </div>

                    {/* Leyenda */}
                    <div style={{ width: 240, flexShrink: 0, borderLeft: '1px solid #23262d', background: '#0e1014', padding: 14, overflowY: 'auto' }}>
                        <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 700, marginBottom: 10 }}>
                            Materiales / superficies ({legend.length})
                        </div>
                        {legend.map((t) => {
                            const off = hidden.has(t.key);
                            return (
                                <button key={t.key} onClick={() => toggle(t.key)} title="Mostrar / ocultar"
                                    style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '7px 6px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', opacity: off ? 0.38 : 1 }}>
                                    <span style={{ width: 14, height: 14, borderRadius: 3, background: t.color, flexShrink: 0 }} />
                                    <span style={{ fontSize: 12, color: '#d7dbe2', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                                    <span style={{ fontSize: 9, color: '#6b7280' }}>{t.fill ? 'área' : 'línea'}</span>
                                </button>
                            );
                        })}
                        <div style={{ marginTop: 14, fontSize: 10.5, color: '#5d6672', lineHeight: 1.5 }}>
                            {shapes.length} shapes en esta estación. Los shapes "(corredor)" vienen en elevación relativa: apagados por defecto.
                        </div>
                    </div>
                </div>

                {/* Controles de estación */}
                <div style={{ padding: '11px 18px', background: '#101317', borderTop: '1px solid #23262d', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <button onClick={() => go(currentIndex - 1)} disabled={currentIndex === 0} style={btn(false, currentIndex === 0)}>← Anterior</button>
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: '#c8cdd6', minWidth: 150, textAlign: 'center' }}>
                        {stationLabel} · {currentIndex + 1}/{stations.length}
                    </span>
                    <input type="range" min={0} max={stations.length - 1} value={currentIndex}
                        onChange={(e) => go(parseInt(e.target.value, 10))} style={{ flex: 1, accentColor: '#3aa0ff' }} />
                    <button onClick={() => go(currentIndex + 1)} disabled={currentIndex === stations.length - 1} style={btn(false, currentIndex === stations.length - 1)}>Siguiente →</button>
                </div>
            </div>
        </div>,
        document.body
    );
};

const overlayStyle = { position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 };
const btn = (primary, disabled) => ({
    padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
    border: primary ? 'none' : '1px solid rgba(255,255,255,0.14)',
    background: primary ? '#3aa0ff' : 'rgba(255,255,255,0.04)', color: primary ? '#fff' : '#d7dbe2',
    opacity: disabled ? 0.4 : 1,
});

export default SectionViewer;
