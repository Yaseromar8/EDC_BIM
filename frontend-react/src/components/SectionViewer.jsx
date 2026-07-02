import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';

// ── Clasificación de materiales/superficies desde el "Name" de Civil 3D ──
// Nivel 1 (sin re-deploy): la identidad ya viene embebida en section.Name, p.ej.
//   "SECCIONES - SL-1340 - Material List - (48) - Relleno(78...)"
//   "SECCIONES - SL-1340 - RELL_EXPUESTO_CANAL_CERR..."
//   "00 Terreno Natural"
// Auto-descubrimos el material (sin hardcodear la lista) y le asignamos color+leyenda.

// Tipos conocidos → color y si se rellena como área (material) o es línea (superficie).
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

// Paleta para materiales NO reconocidos (auto-descubiertos). Color estable por hash del label.
const AUTO_PALETTE = ['#e879f9', '#22d3ee', '#facc15', '#fb7185', '#4ade80', '#c084fc', '#2dd4bf', '#f97316', '#a3e635', '#60a5fa'];
const hashColor = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
    return AUTO_PALETTE[Math.abs(h) % AUTO_PALETTE.length];
};

// Extrae una etiqueta legible del Name (para materiales no reconocidos).
const labelFromName = (raw) => {
    let s = String(raw || '').trim();
    // quitar prefijos "SECCIONES - SL-#### - " y "Material List - (nn) - "
    s = s.replace(/^.*?material list\s*-\s*\(\d+\)\s*-\s*/i, '');
    s = s.replace(/^secciones\s*-\s*sl-?\d+\s*-\s*/i, '');
    s = s.replace(/\(.*$/, '').trim();          // cortar "(78.34 m2..."
    s = s.replace(/^_+/, '').replace(/\s+\[copy\]$/i, '').trim();
    const parts = s.split(/\s*-\s*/).filter(Boolean);
    return (parts[parts.length - 1] || s || 'Otro').trim();
};

const classify = (name) => {
    for (const t of KNOWN_TYPES) if (t.test.test(name || '')) return t;
    const label = labelFromName(name);
    return { key: `auto:${label.toLowerCase()}`, label, color: hashColor(label.toLowerCase()), fill: true };
};

// ── Reconstrucción de cadenas continuas (como dibuja Civil 3D) ──
// Los links llegan como segmentos SUELTOS y desordenados. Cerrarlos "a ciegas"
// produce polígonos basura cruzando toda la sección. Aquí unimos segmentos por
// sus extremos (tolerancia) → cadenas; solo la cadena que CIERRA de verdad se
// rellena como área; lo abierto se dibuja como línea.
const EPS = 0.03;
const ptEq = (a, b) => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;

function buildChains(links) {
    const segs = (links || [])
        .map((l) => [[l.startOffset, l.startElevation], [l.endOffset, l.endElevation]])
        .filter((s) => s.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
            && !ptEq(s[0], s[1]));
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

// Firma geométrica para deduplicar cadenas idénticas (varias Material List
// re-trazan las mismas superficies).
const chainSig = (pts) => {
    let sx = 0; let sy = 0;
    pts.forEach(([x, y]) => { sx += x; sy += y; });
    return `${pts.length}:${sx.toFixed(2)}:${sy.toFixed(2)}`;
};

const SectionViewer = ({ sectionsData, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [hidden, setHidden] = useState(() => new Set()); // keys ocultos por la leyenda

    if (!sectionsData || sectionsData.length === 0) {
        return createPortal(
            <div style={overlayStyle}>
                <p style={{ color: '#d7dbe2' }}>No hay datos de secciones disponibles.</p>
                <button onClick={onClose} style={btn(true)}>Cerrar</button>
            </div>,
            document.body
        );
    }

    const station = sectionsData[currentIndex];
    const stationLabel = station?.station != null
        ? `PK ${formatStation(station.station)}`
        : (station?.sampleLineName || `Estación ${currentIndex}`);

    // Clasificar y reconstruir SOLO lo visible de la sección (estilo Civil/InfraWorks):
    // 1) cadenas continuas desde los links (cerrada→área, abierta→línea),
    // 2) deduplicado geométrico (las Material List re-trazan las mismas superficies),
    // 3) polígonos del corredor solo si su elevación es compatible con la sección
    //    (vienen relativos a la rasante → si no calzan, son la "sección fantasma").
    const shapes = useMemo(() => {
        const out = [];
        const seen = new Set();
        let elevMin = Infinity;
        let elevMax = -Infinity;

        (station.sections || []).forEach((sec, i) => {
            const cls = classify(sec.name);
            buildChains(sec.links).forEach((chain, c) => {
                const sig = chainSig(chain.pts);
                if (seen.has(sig)) return;             // duplicado exacto de otra sección
                seen.add(sig);
                chain.pts.forEach(([, y]) => { elevMin = Math.min(elevMin, y); elevMax = Math.max(elevMax, y); });
                if (chain.closed && cls.fill) {
                    out.push({ id: `l${i}-${c}`, cls, pts: chain.pts, closed: true });
                } else if (!cls.fill || !chain.closed) {
                    // superficies → línea; contornos de material que NO cierran → línea fina
                    out.push({ id: `l${i}-${c}`, cls, pts: chain.pts, closed: false, thin: cls.fill });
                }
            });
        });

        // Polígonos del corredor: incluir solo si su rango de elevación intersecta
        // el de las superficies (si no, están en coordenadas relativas → excluir).
        (station.sections || []).forEach((sec, i) => {
            (sec.polygons || []).forEach((poly, j) => {
                const pts = (poly.points || [])
                    .map((p) => [p.startOffset, p.startElevation])
                    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
                if (pts.length < 3) return;
                const ys = pts.map(([, y]) => y);
                const pMin = Math.min(...ys);
                const pMax = Math.max(...ys);
                const compatible = !Number.isFinite(elevMin) || (pMax >= elevMin && pMin <= elevMax);
                if (!compatible) return;
                const sig = chainSig(pts);
                if (seen.has(sig)) return;
                seen.add(sig);
                out.push({ id: `p${i}-${j}`, cls: classify(poly.name || sec.name), pts, closed: true });
            });
        });

        return out;
    }, [station]);

    // Leyenda: tipos distintos presentes en ESTA estación.
    const legend = useMemo(() => {
        const map = new Map();
        shapes.forEach((s) => { if (!map.has(s.cls.key)) map.set(s.cls.key, s.cls); });
        return [...map.values()];
    }, [shapes]);

    // Bounding box de todo lo visible.
    const bbox = useMemo(() => {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, has = false;
        shapes.forEach((s) => s.pts.forEach(([x, y]) => {
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y); has = true;
        }));
        if (!has) return { minX: -10, maxX: 10, minY: -5, maxY: 5, width: 20, height: 10 };
        const w = maxX - minX, h = maxY - minY;
        const px = w * 0.08 || 5, py = h * 0.15 || 2;
        return { minX: minX - px, maxX: maxX + px, minY: minY - py, maxY: maxY + py, width: w + px * 2, height: h + py * 2 };
    }, [shapes]);

    const toX = (x) => x - bbox.minX;
    const toY = (y) => bbox.maxY - (y - bbox.minY);
    const stroke = bbox.width * 0.0025;

    const go = (i) => setCurrentIndex(Math.max(0, Math.min(sectionsData.length - 1, i)));
    const toggle = (key) => setHidden((prev) => {
        const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n;
    });

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '85vw', height: '85vh', display: 'flex', flexDirection: 'column', background: 'rgba(10,11,13,0.97)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.1)', fontFamily: 'Inter, system-ui, sans-serif' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid #23262d', background: '#101317' }}>
                <div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#e6e8ec' }}>Secciones transversales · Civil 3D</div>
                    <div style={{ fontSize: 12, color: '#8a919c', marginTop: 2 }}>
                        {station.alignmentId} · {station.sampleLineGroupId} · <span style={{ color: '#8ecbff', fontFamily: 'IBM Plex Mono, monospace' }}>{stationLabel}</span>
                    </div>
                </div>
                <button onClick={onClose} style={btn(false)}>✕ Cerrar</button>
            </div>

            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                {/* Dibujo */}
                <div style={{ flex: 1, minWidth: 0, background: '#0a0b0d', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
                    <svg style={{ width: '100%', height: '100%' }} viewBox={`0 0 ${bbox.width} ${bbox.height}`} preserveAspectRatio="xMidYMid meet">
                        {/* Eje central (offset 0) */}
                        <line x1={toX(0)} y1={0} x2={toX(0)} y2={bbox.height} stroke="#2a2f37" strokeWidth={stroke} strokeDasharray={`${bbox.width * 0.008}`} />
                        {/* Áreas (rellenas) primero, luego líneas encima */}
                        {shapes.filter((s) => s.closed && !hidden.has(s.cls.key)).map((s) => (
                            <polygon key={s.id} points={s.pts.map(([x, y]) => `${toX(x)},${toY(y)}`).join(' ')}
                                fill={s.cls.color} fillOpacity={0.32} stroke={s.cls.color} strokeWidth={stroke} strokeOpacity={0.9}>
                                <title>{s.cls.label}</title>
                            </polygon>
                        ))}
                        {shapes.filter((s) => !s.closed && !hidden.has(s.cls.key)).map((s) => (
                            <polyline key={s.id} points={s.pts.map(([x, y]) => `${toX(x)},${toY(y)}`).join(' ')}
                                fill="none" stroke={s.cls.color}
                                strokeWidth={s.thin ? stroke * 0.7 : stroke * 1.6}
                                strokeOpacity={s.thin ? 0.55 : 1}
                                strokeLinejoin="round" strokeLinecap="round">
                                <title>{s.cls.label}</title>
                            </polyline>
                        ))}
                    </svg>
                </div>

                {/* Leyenda (auto-descubierta) */}
                <div style={{ width: 240, flexShrink: 0, borderLeft: '1px solid #23262d', background: '#0e1014', padding: '14px 14px', overflowY: 'auto' }}>
                    <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 700, marginBottom: 10 }}>
                        Materiales / superficies ({legend.length})
                    </div>
                    {legend.map((t) => {
                        const off = hidden.has(t.key);
                        return (
                            <button key={t.key} onClick={() => toggle(t.key)} title="Mostrar / ocultar"
                                style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '7px 6px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', opacity: off ? 0.4 : 1 }}>
                                <span style={{ width: 14, height: 14, borderRadius: 3, background: t.color, border: `1px solid ${t.color}`, flexShrink: 0 }} />
                                <span style={{ fontSize: 12, color: '#d7dbe2', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                                <span style={{ fontSize: 9, color: '#6b7280' }}>{t.fill ? 'área' : 'línea'}</span>
                            </button>
                        );
                    })}
                    <div style={{ marginTop: 14, fontSize: 10.5, color: '#5d6672', lineHeight: 1.5 }}>
                        {shapes.length} shapes en esta estación. Clic en la leyenda para aislar. Identidad leída del nombre de Civil 3D.
                    </div>
                </div>
            </div>

            {/* Controles de estación */}
            <div style={{ padding: '12px 18px', background: '#101317', borderTop: '1px solid #23262d', display: 'flex', alignItems: 'center', gap: 14 }}>
                <button onClick={() => go(currentIndex - 1)} disabled={currentIndex === 0} style={btn(false, currentIndex === 0)}>← Anterior</button>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: '#c8cdd6', minWidth: 130, textAlign: 'center' }}>
                    {stationLabel} · {currentIndex + 1}/{sectionsData.length}
                </span>
                <input type="range" min={0} max={sectionsData.length - 1} value={currentIndex}
                    onChange={(e) => go(parseInt(e.target.value, 10))} style={{ flex: 1, accentColor: '#3aa0ff' }} />
                <button onClick={() => go(currentIndex + 1)} disabled={currentIndex === sectionsData.length - 1} style={btn(false, currentIndex === sectionsData.length - 1)}>Siguiente →</button>
            </div>
        </div>
        </div>,
        document.body
    );
};

function formatStation(m) {
    const v = Number(m) || 0;
    const km = Math.floor(v / 1000);
    const rest = (v - km * 1000).toFixed(2).padStart(6, '0');
    return `${km}+${rest}`;
}

const overlayStyle = { position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(3px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 };
const btn = (primary, disabled) => ({
    padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
    border: primary ? 'none' : '1px solid rgba(255,255,255,0.14)',
    background: primary ? '#3aa0ff' : 'rgba(255,255,255,0.04)', color: primary ? '#fff' : '#d7dbe2',
    opacity: disabled ? 0.4 : 1,
});

export default SectionViewer;
