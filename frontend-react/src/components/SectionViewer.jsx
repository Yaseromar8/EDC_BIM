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
        return { key: `ln:${label.toLowerCase()}`, label, color: hashColor(label.toLowerCase()), fill: false, isLink: true };
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

// Un hatch de Civil puede traer VARIOS contornos (islas) concatenados en una sola
// lista de puntos. Dibujarlo como un solo polígono crea "puentes" que no existen
// en Civil. Se parte en loops: cada vez que la lista vuelve al punto inicial del
// loop en curso, ahí cierra uno y empieza el siguiente.
const splitLoops = (pts, eps = 0.05) => {
    const loops = [];
    let start = 0;
    for (let i = start + 2; i < pts.length; i += 1) {
        const dx = pts[i][0] - pts[start][0];
        const dy = pts[i][1] - pts[start][1];
        if (Math.hypot(dx, dy) < eps) {
            loops.push(pts.slice(start, i + 1));
            start = i + 1;
            i = start + 1;
        }
    }
    if (start < pts.length - 1) loops.push(pts.slice(start));
    return loops.filter((l) => l.length >= 3);
};

// Eleva la cota de una polilínea en un offset dado (interpolación lineal en el
// segmento que cruza ese offset). null si la línea no cruza ahí.
const elevAt = (pts, off = 0) => {
    for (let i = 1; i < pts.length; i += 1) {
        const [x1, y1] = pts[i - 1];
        const [x2, y2] = pts[i];
        if ((x1 <= off && x2 >= off) || (x2 <= off && x1 >= off)) {
            if (Math.abs(x2 - x1) < 1e-9) return y1;
            return y1 + ((y2 - y1) * (off - x1)) / (x2 - x1);
        }
    }
    return null;
};

// TODAS las cotas donde un contorno cruza un offset dado (un cuerpo cerrado
// cruza el eje al menos 2 veces: techo y fondo).
const elevsAt = (pts, off = 0) => {
    const res = [];
    for (let i = 1; i < pts.length; i += 1) {
        const [x1, y1] = pts[i - 1];
        const [x2, y2] = pts[i];
        if ((x1 <= off && x2 >= off) || (x2 <= off && x1 >= off)) {
            if (Math.abs(x2 - x1) < 1e-9) res.push(y1, y2);
            else res.push(y1 + ((y2 - y1) * (off - x1)) / (x2 - x1));
        }
    }
    return res;
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
    const initializedHidden = useRef(false);
    const userTouchedRef = useRef(new Set());
    const [view, setView] = useState(null);
    const [mode, setMode] = useState('seccion');
    const [volMaterial, setVolMaterial] = useState(0);
    const [aspect, setAspect] = useState(1);            // relación anchura/altura (exageración vertical)
    const [cutOn, setCutOn] = useState(false);          // corte 3D real en el modelo
    const [syncOn, setSyncOn] = useState(true);         // dual: modelo→panel
    const [legendOpen, setLegendOpen] = useState(false);
    const [probe, setProbe] = useState(null);           // cursor consultable: {off, elev} reales
    const [selKey, setSelKey] = useState(null);         // material seleccionado (clic) → áreas
    const movedRef = useRef(false);                     // distingue arrastre de clic
    const dragRef = useRef(null);
    const svgRef = useRef(null);
    const lastSyncRef = useRef(null);
    const volumes = useMemo(() => computeVolumes(stations), [stations]);

    const station = stations[Math.min(currentIndex, Math.max(0, stations.length - 1))];

    // v3: marco de la Section View del cadista → el dibujo se RECORTA a este
    // rectángulo, igual que Civil (fuera del marco no se dibuja nada).
    const frame = useMemo(() => {
        if (!station) return null;
        const l = Number(station.viewOffsetLeft);
        const r = Number(station.viewOffsetRight);
        const b = Number(station.viewElevMin);
        const t = Number(station.viewElevMax);
        if ([l, r, b, t].every(Number.isFinite) && r > l && t > b) return { l, r, b, t };
        return null;
    }, [station]);

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
            // FIDELIDAD CIVIL 3D: se respeta la config del cadista tal cual.
            // draw=false (check "Draw" de la Section View) e _Invisible NO se dibujan.
            if (sec.draw === false) return;
            const styleName = String(sec.styleName || '').trim();
            const invisible = /invisible/i.test(styleName) || /invisible/i.test(sec.layer || '');
            if (invisible) return;

            const baseCls = classify(sec.materialName || sec.styleName || sec.name);
            let cls = { ...baseCls };

            // Propiedades reales extraídas de Civil: color exacto + hatch del estilo.
            if (sec.exactColor && /^#/.test(sec.exactColor)) cls.color = sec.exactColor;
            if (sec.isHatch !== undefined) cls.fill = !!sec.isHatch;
            // Leyenda con el NOMBRE REAL del estilo del cadista (no la clasificación).
            if (styleName) {
                cls.key = `st:${styleName.toLowerCase()}`;
                cls.label = styleName.replace(/^_+/, '');
            }

            if (Array.isArray(sec.points) && sec.points.length >= 2) {
                const pts = sec.points
                    .map((p) => [Number(p?.[0]), Number(p?.[1])])
                    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
                if (pts.length < 2) return;
                // Secciones "sin datos" en esta estación: Civil exporta una línea
                // plana exactamente en cota 0.00 (placeholder). Civil no la dibuja
                // (queda fuera del marco); aquí tampoco. Evita el falso CC=0.
                const ys = pts.map((p) => p[1]);
                if (Math.max(...ys) - Math.min(...ys) < 0.001 && Math.abs(ys[0]) < 0.01) return;
                const relCorr = sec.sourceType === 'CorridorShape' && sec.absolute === false;

                if (relCorr) cls = { ...cls, key: `corr:${cls.key}`, label: `${cls.label} (corredor)` };

                // Un hatch ES un área: se cierra aunque la polilínea venga closed=false
                // (p.ej. _Hatch Relleno viene abierta y por eso no se pintaba).
                // Patrón de achurado según el estilo (como en Civil): corte=diagonal,
                // roca/copy=puntos (grava), resto=diagonal inversa.
                if (sec.isHatch) {
                    const pat = /corte|excav/i.test(styleName) ? 'hatchCut'
                        : /copy|roca/i.test(styleName) ? 'hatchRock'
                        : 'hatchFill';
                    // Varios contornos vienen concatenados: partirlos evita los
                    // "puentes" (líneas que no existen en Civil).
                    const loops = splitLoops(pts);
                    loops.forEach((loop, k) => {
                        // El área real de Civil solo aplica si hay UN contorno; con
                        // varios, shoelace por loop (evita duplicar).
                        out.push({ id: `s${i}-L${k}`, cls, pts: loop, closed: true, area: loops.length === 1 ? sec.area : 0, corridor: relCorr, pat, rawName: sec.name || '' });
                    });
                    return;
                }
                const closed = (sec.closed === true) && cls.fill;
                out.push({ id: `s${i}`, cls, pts, closed, area: sec.area, corridor: relCorr, pat: null, rawName: sec.name || '' });
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
            shapes.forEach((s) => {
                // Estilos reales del cadista (st:) se muestran tal cual Civil; solo se
                // auto-ocultan corredores y clasificaciones sintéticas (ln:/auto:).
                if (s.cls.key.startsWith('st:')) return;
                if ((s.corridor || s.cls.key.startsWith('ln:') || s.cls.isLink) && !userTouchedRef.current.has(s.cls.key)) {
                    next.add(s.cls.key);
                }
            });
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
            // Con leyenda por estilo real, clasificar por nombre/estilo; la roca
            // ("[Copy]"/ROCA) NO es terraplén.
            const n = `${s.cls.label} ${s.rawName || ''}`;
            if (s.cls.key === 'corte' || /corte|excav|desmonte/i.test(n)) cut += a;
            else if ((s.cls.key === 'relleno' || /relleno|terrapl/i.test(n)) && !/copy|roca/i.test(n)) fill += a;
        });
        return { cut, fill };
    }, [shapes]);

    const legend = useMemo(() => {
        const map = new Map();
        shapes.forEach((s) => { if (!map.has(s.cls.key)) map.set(s.cls.key, s.cls); });
        return [...map.values()];
    }, [shapes]);

    useEffect(() => {
        if (!initializedHidden.current && legend.length > 0) {
            const initial = new Set();
            legend.forEach(t => {
                if (t.key.startsWith('ln:') || t.key.startsWith('auto:')) {
                    initial.add(t.key);
                }
            });
            setHidden(initial);
            initializedHidden.current = true;
        }
    }, [legend]);

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

    // Imán: vértices (esquinas/quiebres) de la geometría visible, en coords SVG.
    // Si hay marco v3, no engancha a vértices recortados (fuera del marco).
    const snapVerts = useMemo(() => {
        const verts = [];
        shapes.forEach((s) => {
            if (hidden.has(s.cls.key)) return;
            s.pts.forEach(([x, y]) => {
                if (frame && (x < frame.l || x > frame.r || y < frame.b || y > frame.t)) return;
                verts.push([x, -y * aspect, y]);
            });
        });
        return verts;
    }, [shapes, hidden, aspect, frame]);

    const onPointerDown = (ev) => {
        movedRef.current = false;
        dragRef.current = { start: clientToWorld(ev), view: { ...v } };
        ev.currentTarget.setPointerCapture(ev.pointerId);
    };
    const onPointerMove = (ev) => {
        // Cursor consultable: offset + cota REAL bajo el mouse (como en Civil),
        // con IMÁN a la esquina/quiebre más cercano para picar con certeza.
        const [wx, wy] = clientToWorld(ev);
        const thr = px * 10; // radio de imán (~10px de pantalla)
        let best = null;
        let bestD = thr;
        for (const [sx, sy, yReal] of snapVerts) {
            const dd = Math.hypot(sx - wx, sy - wy);
            if (dd < bestD) { bestD = dd; best = { off: sx, elev: yReal }; }
        }
        setProbe(best ? { ...best, snapped: true } : { off: wx, elev: -wy / aspect, snapped: false });
        if (!dragRef.current) return;
        const d = dragRef.current;
        if (Math.hypot(wx - d.start[0], wy - d.start[1]) > px * 3) movedRef.current = true;
        setView({ ...d.view, x: d.view.x - (wx - d.start[0]), y: d.view.y - (wy - d.start[1]) });
    };
    const onPointerUp = () => { dragRef.current = null; };

    // Áreas del material seleccionado (clic sobre un hatch): usa el área REAL de
    // Civil cuando viene (>0); si no, shoelace por contorno. Suma todos los
    // contornos del material en esta estación.
    const selInfo = useMemo(() => {
        if (!selKey) return null;
        let total = 0;
        let loops = 0;
        let label = '';
        let color = '#8ecbff';
        shapes.forEach((s) => {
            if (s.cls.key !== selKey || !s.closed || s.corridor) return;
            total += (Number.isFinite(Number(s.area)) && Number(s.area) > 0) ? Number(s.area) : shoelace(s.pts);
            loops += 1;
            label = s.cls.label;
            color = s.cls.color;
        });
        if (!loops) return null;
        return { label, color, total, loops };
    }, [selKey, shapes]);
    const onPointerLeave = () => { setProbe(null); dragRef.current = null; };

    // CT (cota de terreno) y CC (cota de fondo) en el EJE, como en Civil.
    // Fuente: el material de EXCAVACIÓN del cadista (determinístico, sin
    // heurísticas): el cuerpo de excavación va del terreno al fondo, así que en
    // el eje CT = su cota superior y CC = su cota inferior.
    const ctcc = useMemo(() => {
        const excav = shapes.filter((s) => s.closed && !hidden.has(s.cls.key)
            && (s.pat === 'hatchCut' || /corte|excav/i.test(`${s.cls.label} ${s.rawName || ''}`)));
        const els = [];
        excav.forEach((s) => els.push(...elevsAt(s.pts, 0)));
        if (els.length >= 2) return { ct: Math.max(...els), cc: Math.min(...els) };
        // Sin excavación cruzando el eje: cae al cuerpo cerrado visible (techo/fondo)
        const all = [];
        shapes.forEach((s) => {
            if (!s.closed || hidden.has(s.cls.key)) return;
            all.push(...elevsAt(s.pts, 0));
        });
        if (all.length >= 2) return { ct: Math.max(...all), cc: Math.min(...all) };
        return { ct: null, cc: null };
    }, [shapes, hidden]);

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
                        onPointerLeave={onPointerLeave}
                        onDoubleClick={() => setView(null)}
                    >
                        <defs>
                            {/* Patrones estilo Civil: corte=diagonal, relleno=diagonal inversa, roca=grava */}
                            <pattern id="hatchCut" width={px * 24} height={px * 24} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                                <line x1={0} y1={0} x2={0} y2={px * 24} stroke="currentColor" strokeWidth={px * 1.5} opacity={0.7} />
                            </pattern>
                            <pattern id="hatchFill" width={px * 24} height={px * 24} patternUnits="userSpaceOnUse" patternTransform="rotate(60)">
                                {/* trazos cortos (como el relleno de Civil), no línea continua: evita la X al solaparse con el corte */}
                                <line x1={0} y1={0} x2={0} y2={px * 24} stroke="currentColor" strokeWidth={px * 1.5} opacity={0.75} strokeDasharray={`${px * 7} ${px * 6}`} />
                            </pattern>
                            <pattern id="hatchRock" width={px * 26} height={px * 26} patternUnits="userSpaceOnUse">
                                <circle cx={px * 7} cy={px * 8} r={px * 3.2} fill="none" stroke="currentColor" strokeWidth={px * 1.1} opacity={0.7} />
                                <circle cx={px * 18} cy={px * 19} r={px * 2.4} fill="none" stroke="currentColor" strokeWidth={px * 1.1} opacity={0.55} />
                            </pattern>
                            {frame && (
                                <clipPath id="secFrame">
                                    <rect x={frame.l} y={-frame.t * aspect} width={frame.r - frame.l} height={(frame.t - frame.b) * aspect} />
                                </clipPath>
                            )}
                        </defs>
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

                        <g clipPath={frame ? 'url(#secFrame)' : undefined}>
                        {shapes.filter((s) => s.closed && !hidden.has(s.cls.key)).map((s) => (
                            <polygon key={s.id} points={s.pts.map(([x, y]) => `${toX(x)},${toY(y)}`).join(' ')}
                                fill={s.pat ? `url(#${s.pat})` : s.cls.color}
                                style={{ color: s.cls.color, cursor: 'pointer' }}
                                fillOpacity={s.pat ? 1 : 0.28}
                                // FIEL A CIVIL: un hatch es SOLO patrón — Civil no dibuja el
                                // contorno del hatch (los bordes visibles son líneas aparte
                                // del cadista). Borde solo al seleccionar (highlight).
                                stroke={selKey === s.cls.key ? '#ffc400' : (s.pat ? 'none' : s.cls.color)}
                                strokeWidth={selKey === s.cls.key ? px * 2.6 : (s.pat ? 0 : px * 1.3)}
                                strokeOpacity={0.95}
                                onClick={() => {
                                    if (movedRef.current) return; // fue arrastre, no clic
                                    setSelKey((k) => (k === s.cls.key ? null : s.cls.key));
                                }}>
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
                        </g>

                        {/* CT/CC en el eje, como la etiqueta de sección de Civil */}
                        {(ctcc.ct != null || ctcc.cc != null) && (
                            <text x={0} y={v.y + v.h - fontSize * 2.2} fill="#c6ccd4" fontSize={fontSize * 1.05} fontFamily="IBM Plex Mono, monospace" textAnchor="middle" style={{ pointerEvents: 'none' }}>
                                {ctcc.ct != null ? `CT=${ctcc.ct.toFixed(2)}` : ''}{ctcc.ct != null && ctcc.cc != null ? '  ·  ' : ''}{ctcc.cc != null ? `CC=${ctcc.cc.toFixed(2)}` : ''}
                            </text>
                        )}

                        {/* Cursor consultable: cruz + offset/cota reales bajo el mouse.
                            Con imán activo (snapped) marca el vértice exacto. */}
                        {probe && (
                            <g style={{ pointerEvents: 'none' }}>
                                <line x1={probe.off} y1={v.y} x2={probe.off} y2={v.y + v.h} stroke="#8ecbff" strokeWidth={px * 0.8} strokeDasharray={`${px * 4} ${px * 4}`} opacity={0.55} />
                                <line x1={v.x} y1={-probe.elev * aspect} x2={v.x + v.w} y2={-probe.elev * aspect} stroke="#8ecbff" strokeWidth={px * 0.8} strokeDasharray={`${px * 4} ${px * 4}`} opacity={0.55} />
                                {probe.snapped && (
                                    <>
                                        <circle cx={probe.off} cy={-probe.elev * aspect} r={px * 5} fill="none" stroke="#ffc400" strokeWidth={px * 1.6} />
                                        <circle cx={probe.off} cy={-probe.elev * aspect} r={px * 1.6} fill="#ffc400" />
                                    </>
                                )}
                                <text x={probe.off + px * 10} y={-probe.elev * aspect - px * 8} fill={probe.snapped ? '#ffc400' : '#8ecbff'} fontSize={fontSize} fontFamily="IBM Plex Mono, monospace">
                                    {`${probe.snapped ? '⊙ ' : ''}${probe.off.toFixed(2)}m · cota ${probe.elev.toFixed(2)}m`}
                                </text>
                            </g>
                        )}
                    </svg>
                    <div style={{ position: 'absolute', right: 10, bottom: 8, fontSize: 10, color: '#43506b', pointerEvents: 'none' }}>
                        rueda = zoom · arrastre = mover · doble clic = encuadrar · clic en material = área
                    </div>

                    {/* Rótulo del material seleccionado: sus áreas respectivas */}
                    {selInfo && (
                        <div style={{ position: 'absolute', left: 10, top: 10, background: 'rgba(23,26,31,0.94)', border: '1px solid #33507a', borderRadius: 6, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 3px 10px rgba(0,0,0,0.45)' }}>
                            <span style={{ width: 12, height: 12, borderRadius: 3, background: selInfo.color, border: '1px solid rgba(255,255,255,0.35)', flexShrink: 0 }} />
                            <div style={{ lineHeight: 1.35 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#dfe6ee' }}>{selInfo.label}</div>
                                <div style={{ fontSize: 12, color: '#8ecbff', fontFamily: 'IBM Plex Mono, monospace' }}>
                                    Área: {selInfo.total.toFixed(3)} m²{selInfo.loops > 1 ? ` · ${selInfo.loops} contornos` : ''}
                                </div>
                            </div>
                            <button onClick={() => setSelKey(null)} style={{ background: 'transparent', border: 'none', color: '#7f8791', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
                        </div>
                    )}
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
