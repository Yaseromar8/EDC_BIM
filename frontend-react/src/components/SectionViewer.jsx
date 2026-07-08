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

const SectionViewer = ({ sectionsData, onClose, onSync, getModelSlice, alignmentId }) => {
    // Multi-eje: mostrar SOLO las estaciones del alineamiento activo (un DWG
    // puede traer varios ejes de distintos frentes). Sin eje activo o si el
    // nombre no matchea (data vieja), se muestran todas.
    const allStations = useMemo(() => normalizeStations(sectionsData), [sectionsData]);
    const stations = useMemo(() => {
        if (!alignmentId) return allStations;
        const f = allStations.filter((st) => (st.alignmentId || '') === alignmentId);
        return f.length ? f : allStations;
    }, [allStations, alignmentId]);
    const [currentIndex, setCurrentIndex] = useState(0);
    useEffect(() => { setCurrentIndex(0); }, [alignmentId]);
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
    const [mdlSlice, setMdlSlice] = useState([]);       // corte del modelo 3D del visor en esta estación
    const [showModel, setShowModel] = useState(true);   // toggle capa "Modelo 3D"
    const [light, setLight] = useState(false);          // modo "Plano": fondo blanco como lámina impresa
    const [cvSize, setCvSize] = useState({ w: 0, h: 0 }); // tamaño del lienzo en px (para reglas de pantalla)
    const wrapRef = useRef(null);

    useEffect(() => {
        const el = wrapRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver((entries) => {
            const r = entries[0]?.contentRect;
            if (r) setCvSize({ w: r.width, h: r.height });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [mode]);
    const dragRef = useRef(null);
    const svgRef = useRef(null);
    const lastSyncRef = useRef(null);
    const volumes = useMemo(() => computeVolumes(stations), [stations]);

    const station = stations[Math.min(currentIndex, Math.max(0, stations.length - 1))];

    // Corte del MODELO 3D del visor en la estación actual (referencia visual;
    // los números oficiales vienen del JSON). Debounced para no rebanar en
    // cada tick del slider.
    useEffect(() => {
        if (!getModelSlice || !station) { setMdlSlice([]); return undefined; }
        const st = Number(station.station);
        if (!Number.isFinite(st)) { setMdlSlice([]); return undefined; }
        const id = setTimeout(async () => {
            try { setMdlSlice(await getModelSlice(st) || []); }
            catch (e) { console.warn('[SectionViewer] slice 3D:', e); setMdlSlice([]); }
        }, 140);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [station?.station, getModelSlice]);

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
                    // Un hatch de Civil = contornos exteriores + AGUJEROS (islas).
                    // Se dibuja como UN path con todos los loops y regla even-odd:
                    // los agujeros quedan vacíos (antes cada loop se rellenaba por
                    // separado y el hatch invadía zonas que Civil deja limpias).
                    const loops = splitLoops(pts);
                    if (loops.length) {
                        out.push({ id: `s${i}`, cls, pts, loops, closed: true, area: sec.area, corridor: relCorr, pat, rawName: sec.name || '' });
                    }
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
            const a = (Number.isFinite(Number(s.area)) && Number(s.area) > 0)
                ? Number(s.area)
                : (s.loops || [s.pts]).reduce((t, l) => t + shoelace(l), 0);
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

    // Imán topográfico sobre la geometría visible (en coords SVG):
    //  · vértices (esquinas/quiebres)
    //  · INTERSECCIONES línea-línea (donde se cruzan superficies/diseño)
    //  · borde de línea (proyección al segmento más cercano) — en onPointerMove
    // Si hay marco v3, no engancha a geometría recortada (fuera del marco).
    const { snapVerts, snapSegs, snapInters } = useMemo(() => {
        const verts = [];
        const segs = [];
        const inFrame = ([x, y]) => !frame || (x >= frame.l && x <= frame.r && y >= frame.b && y <= frame.t);
        shapes.forEach((s) => {
            if (hidden.has(s.cls.key)) return;
            (s.loops || [s.pts]).forEach((loop) => {
                loop.forEach((p, i) => {
                    if (inFrame(p)) verts.push([p[0], -p[1] * aspect]);
                    if (i > 0 && (inFrame(loop[i - 1]) || inFrame(p))) {
                        segs.push([loop[i - 1][0], -loop[i - 1][1] * aspect, p[0], -p[1] * aspect]);
                    }
                });
            });
        });
        // Intersecciones (tope de seguridad para no colgar con dibujos enormes).
        // Solo entre líneas del CADISTA — el corte del modelo 3D (malla) metería
        // miles de cruces sin significado topográfico.
        const inters = [];
        if (segs.length <= 1600) {
            for (let a = 0; a < segs.length; a += 1) {
                for (let b = a + 1; b < segs.length; b += 1) {
                    const [x1, y1, x2, y2] = segs[a];
                    const [x3, y3, x4, y4] = segs[b];
                    const den = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
                    if (Math.abs(den) < 1e-12) continue;
                    const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / den;
                    const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / den;
                    if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999) {
                        inters.push([x1 + t * (x2 - x1), y1 + t * (y2 - y1)]);
                    }
                }
            }
        }
        // El corte del MODELO 3D también es consultable (borde + extremos).
        if (showModel && mdlSlice.length) {
            mdlSlice.forEach((m) => m.segs.forEach(([x1, y1, x2, y2]) => {
                const aIn = inFrame([x1, y1]); const bIn = inFrame([x2, y2]);
                if (aIn) verts.push([x1, -y1 * aspect]);
                if (bIn) verts.push([x2, -y2 * aspect]);
                if (aIn || bIn) segs.push([x1, -y1 * aspect, x2, -y2 * aspect]);
            }));
        }
        return { snapVerts: verts, snapSegs: segs, snapInters: inters };
    }, [shapes, hidden, aspect, frame, mdlSlice, showModel]);

    const onPointerDown = (ev) => {
        movedRef.current = false;
        dragRef.current = { start: clientToWorld(ev), view: { ...v } };
        ev.currentTarget.setPointerCapture(ev.pointerId);
    };
    const onPointerMove = (ev) => {
        // Cursor consultable con IMÁN topográfico. Prioridad:
        // 1) vértice (esquina/quiebre)  2) intersección de líneas
        // 3) punto SOBRE la línea (proyección al segmento) — cotas de superficie.
        const [wx, wy] = clientToWorld(ev);
        const thr = px * 10;
        let best = null;
        let bestD = thr;
        let kind = null;
        for (const [sx, sy] of snapVerts) {
            const dd = Math.hypot(sx - wx, sy - wy);
            if (dd < bestD) { bestD = dd; best = [sx, sy]; kind = 'vertice'; }
        }
        if (!best) {
            for (const [sx, sy] of snapInters) {
                const dd = Math.hypot(sx - wx, sy - wy);
                if (dd < bestD) { bestD = dd; best = [sx, sy]; kind = 'interseccion'; }
            }
        }
        if (!best) {
            let bestE = px * 8; // borde: radio algo menor que vértice
            for (const [x1, y1, x2, y2] of snapSegs) {
                const dx = x2 - x1; const dy = y2 - y1;
                const len2 = dx * dx + dy * dy;
                if (len2 < 1e-12) continue;
                let t = ((wx - x1) * dx + (wy - y1) * dy) / len2;
                t = Math.max(0, Math.min(1, t));
                const qx = x1 + t * dx; const qy = y1 + t * dy;
                const dd = Math.hypot(qx - wx, qy - wy);
                if (dd < bestE) { bestE = dd; best = [qx, qy]; kind = 'linea'; }
            }
        }
        setProbe(best
            ? { off: best[0], elev: -best[1] / aspect, snapped: true, kind }
            : { off: wx, elev: -wy / aspect, snapped: false });
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
            total += (Number.isFinite(Number(s.area)) && Number(s.area) > 0)
                ? Number(s.area)
                : (s.loops || [s.pts]).reduce((t, l) => t + shoelace(l), 0);
            loops += (s.loops ? s.loops.length : 1);
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
    // Cruces con el eje POR LOOP (los hatch multi-contorno tienen "puentes"
    // internos en pts que no son geometría real — nunca usarlos).
    const shapeElevsAt = (s, off = 0) => {
        const res = [];
        (s.loops || [s.pts]).forEach((loop) => res.push(...elevsAt(loop, off)));
        return res;
    };

    const ctcc = useMemo(() => {
        // CT: techo de la EXCAVACIÓN en el eje (= terreno).
        // CC: fondo REAL = el punto más profundo de TODOS los cuerpos que cruzan
        // el eje — la cama de roca/solado queda BAJO el hatch de corte, y el
        // fondo de excavación de Civil es el fondo de esa cama (p.ej. 3.64,
        // no el 3.68 donde termina el corte).
        const excavEls = [];
        const allEls = [];
        shapes.forEach((s) => {
            if (!s.closed || hidden.has(s.cls.key)) return;
            const els = shapeElevsAt(s, 0);
            allEls.push(...els);
            if (s.pat === 'hatchCut' || /corte|excav/i.test(`${s.cls.label} ${s.rawName || ''}`)) excavEls.push(...els);
        });
        if (!allEls.length) return { ct: null, cc: null };
        return {
            ct: excavEls.length ? Math.max(...excavEls) : Math.max(...allEls),
            cc: Math.min(...allEls)
        };
    }, [shapes, hidden]);

    // v4: CT/CC de la LÁMINA (textos de banda del cadista, extraídos tal cual).
    // Si vienen, son el dato oficial; los calculados quedan como "(diseño)".
    // 0.00 = banda sin superficie asignada en esa vista (placeholder) → se ignora.
    const cleanBand = (v) => (Number.isFinite(Number(v)) && Math.abs(Number(v)) > 0.005) ? Number(v) : null;
    const bandCT = cleanBand(station?.bandCT);
    const bandCC = cleanBand(station?.bandCC);
    const fromBand = bandCT != null || bandCC != null;
    const labelCT = bandCT != null ? bandCT : ctcc.ct;
    const labelCC = bandCC != null ? bandCC : ctcc.cc;

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

    // ── Tema de lámina: oscuro (cabina) / claro ("Plano", como impreso) ──
    const T = light ? {
        canvas: '#f7f8f9', band: '#eceef1', bandText: '#3a424d', grid: '#dde0e5',
        axis: '#2f7d4f', frame: '#aab1bb', label: '#1f242b', probe: '#0d74c4', snap: '#b7791f'
    } : {
        canvas: '#17191c', band: '#121418', bandText: '#8a919c', grid: '#2b2f34',
        axis: '#3f9e63', frame: '#39424f', label: '#c6ccd4', probe: '#8ecbff', snap: '#ffc400'
    };
    // En modo Plano, el color ACAD 7 (blanco en pantalla oscura) se ve NEGRO,
    // exactamente como en la lámina impresa del cadista.
    const dispColor = (c) => {
        if (!light || !c) return c;
        const m = /^#([0-9a-f]{6})$/i.exec(c);
        if (!m) return c;
        const n = parseInt(m[1], 16);
        const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
        return (r > 225 && g > 225 && b > 225) ? '#1a1a1a' : c;
    };
    // Reglas de PANTALLA (px reales, nunca tapan el dibujo al alejar)
    const RB = { h: 22, w: 36 }; // alto banda inferior / ancho bandas laterales
    const worldToScreen = (wx, wy) => {
        const cw = cvSize.w || 1; const ch = cvSize.h || 1;
        const scale = Math.max(v.w / cw, v.h / ch);
        const offX = (cw - v.w / scale) / 2;
        const offY = (ch - v.h / scale) / 2;
        return [offX + (wx - v.x) / scale, offY + (wy - v.y) / scale];
    };

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
                <div ref={wrapRef} style={{ flex: 1, minHeight: 0, position: 'relative', background: T.canvas }}>
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
                            <line key={`gx${gx}`} x1={gx} y1={v.y} x2={gx} y2={v.y + v.h} stroke={T.grid} strokeWidth={px} />
                        ))}
                        {gridY.map((gy) => (
                            <line key={`gy${gy}`} x1={v.x} y1={gy} x2={v.x + v.w} y2={gy} stroke={T.grid} strokeWidth={px} />
                        ))}
                        <line x1={0} y1={v.y} x2={0} y2={v.y + v.h} stroke={T.axis} strokeWidth={px * 1.3} strokeDasharray={`${px * 9} ${px * 5}`} />

                        {/* Marco de la lámina (Section View del cadista) + eje ℄ */}
                        {frame && (
                            <g style={{ pointerEvents: 'none' }}>
                                <rect x={frame.l} y={-frame.t * aspect} width={frame.r - frame.l} height={(frame.t - frame.b) * aspect}
                                    fill="none" stroke={T.frame} strokeWidth={px * 1.2} />
                                <text x={0} y={-frame.t * aspect - px * 6} fill={T.bandText} fontSize={fontSize * 1.15} fontFamily="IBM Plex Mono, monospace" textAnchor="middle">℄</text>
                            </g>
                        )}

                        <g clipPath={frame ? 'url(#secFrame)' : undefined}>
                        {shapes.filter((s) => s.closed && !hidden.has(s.cls.key)).map((s) => {
                            // FIEL A CIVIL: hatch = un solo path con loops + even-odd (los
                            // agujeros quedan vacíos) y SIN contorno — Civil no dibuja el
                            // borde del hatch. Borde solo al seleccionar (highlight).
                            const d = (s.loops || [s.pts])
                                .map((loop) => `M ${loop.map(([x, y]) => `${toX(x)},${toY(y)}`).join(' L ')} Z`)
                                .join(' ');
                            return (
                                <path key={s.id} d={d} fillRule="evenodd"
                                    fill={s.pat ? `url(#${s.pat})` : dispColor(s.cls.color)}
                                    style={{ color: dispColor(s.cls.color), cursor: 'pointer' }}
                                    fillOpacity={s.pat ? 1 : 0.28}
                                    stroke={selKey === s.cls.key ? T.snap : (s.pat ? 'none' : dispColor(s.cls.color))}
                                    strokeWidth={selKey === s.cls.key ? px * 2.6 : (s.pat ? 0 : px * 1.3)}
                                    strokeOpacity={0.95}
                                    onClick={() => {
                                        if (movedRef.current) return; // fue arrastre, no clic
                                        setSelKey((k) => (k === s.cls.key ? null : s.cls.key));
                                    }}>
                                    <title>{s.cls.label}{s.area != null ? ` · ${Number(s.area).toFixed(2)} m²` : ''}</title>
                                </path>
                            );
                        })}
                        {shapes.filter((s) => !s.closed && !hidden.has(s.cls.key)).map((s) => (
                            <polyline key={s.id} points={s.pts.map(([x, y]) => `${toX(x)},${toY(y)}`).join(' ')}
                                fill="none" stroke={dispColor(s.cls.color)}
                                strokeWidth={s.thin ? px * 1.0 : px * 2.0}
                                strokeOpacity={s.thin ? 0.55 : 1}
                                strokeLinejoin="round" strokeLinecap="round">
                                <title>{s.cls.label}</title>
                            </polyline>
                        ))}

                        {/* Corte del MODELO 3D del visor (referencia visual, cian). */}
                        {showModel && mdlSlice.map((m, mi) => (
                            <path key={`mdl${mi}`}
                                d={m.segs.map((sg) => `M ${sg[0]},${-sg[1] * aspect} L ${sg[2]},${-sg[3] * aspect}`).join(' ')}
                                fill="none"
                                stroke={['#00d5ff', '#ff9f43', '#a29bfe', '#2ecc71'][mi % 4]}
                                strokeWidth={px * 1.1}
                                strokeOpacity={0.9}
                                strokeLinecap="round">
                                <title>{`Modelo 3D: ${m.name}`}</title>
                            </path>
                        ))}
                        </g>

                        {/* CT/CC estilo lámina (los de BANDA del cadista si existen) */}
                        {(labelCT != null || labelCC != null) && (() => {
                            const yBase = frame ? (-frame.b * aspect + fontSize * 2.0) : (v.y + v.h - fontSize * 3.4);
                            return (
                                <g style={{ pointerEvents: 'none' }}>
                                    {labelCT != null && (
                                        <text x={0} y={yBase} fill={T.label} fontSize={fontSize * 1.05} fontFamily="IBM Plex Mono, monospace" textAnchor="middle">
                                            CT={labelCT.toFixed(2)}
                                        </text>
                                    )}
                                    {labelCC != null && (
                                        <text x={0} y={yBase + fontSize * 1.4} fill={T.label} fontSize={fontSize * 1.05} fontFamily="IBM Plex Mono, monospace" textAnchor="middle">
                                            CC={labelCC.toFixed(2)}
                                        </text>
                                    )}
                                </g>
                            );
                        })()}

                        {/* Cursor consultable: cruz + imán (valores en reglas de pantalla y cabina) */}
                        {probe && (
                            <g style={{ pointerEvents: 'none' }}>
                                <line x1={probe.off} y1={v.y} x2={probe.off} y2={v.y + v.h} stroke={T.probe} strokeWidth={px * 0.8} strokeDasharray={`${px * 4} ${px * 4}`} opacity={0.6} />
                                <line x1={v.x} y1={-probe.elev * aspect} x2={v.x + v.w} y2={-probe.elev * aspect} stroke={T.probe} strokeWidth={px * 0.8} strokeDasharray={`${px * 4} ${px * 4}`} opacity={0.6} />
                                {probe.snapped && (
                                    <>
                                        <circle cx={probe.off} cy={-probe.elev * aspect} r={px * 5} fill="none" stroke={T.snap} strokeWidth={px * 1.6} />
                                        <circle cx={probe.off} cy={-probe.elev * aspect} r={px * 1.6} fill={T.snap} />
                                    </>
                                )}
                            </g>
                        )}
                    </svg>

                    {/* ── Reglas de PANTALLA: franjas fijas en px, nunca tapan el dibujo ── */}
                    {cvSize.w > 0 && (
                        <svg width={cvSize.w} height={cvSize.h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                            <rect x={0} y={cvSize.h - RB.h} width={cvSize.w} height={RB.h} fill={T.band} opacity={0.94} />
                            <rect x={0} y={0} width={RB.w} height={cvSize.h - RB.h} fill={T.band} opacity={0.94} />
                            <rect x={cvSize.w - RB.w} y={0} width={RB.w} height={cvSize.h - RB.h} fill={T.band} opacity={0.94} />
                            <line x1={0} y1={cvSize.h - RB.h} x2={cvSize.w} y2={cvSize.h - RB.h} stroke={T.frame} strokeWidth={1} />
                            <line x1={RB.w} y1={0} x2={RB.w} y2={cvSize.h - RB.h} stroke={T.frame} strokeWidth={1} />
                            <line x1={cvSize.w - RB.w} y1={0} x2={cvSize.w - RB.w} y2={cvSize.h - RB.h} stroke={T.frame} strokeWidth={1} />
                            {gridX.map((gx) => {
                                const [sx] = worldToScreen(gx, 0);
                                if (sx < RB.w + 8 || sx > cvSize.w - RB.w - 8) return null;
                                return (
                                    <g key={`sx${gx}`}>
                                        <line x1={sx} y1={cvSize.h - RB.h} x2={sx} y2={cvSize.h - RB.h + 5} stroke={T.bandText} strokeWidth={1} />
                                        <text x={sx} y={cvSize.h - 6} fill={T.bandText} fontSize={10.5} fontFamily="IBM Plex Mono, monospace" textAnchor="middle">
                                            {Math.abs(gx) < 1e-9 ? '0' : gx.toFixed(gx % 1 ? 1 : 0)}
                                        </text>
                                    </g>
                                );
                            })}
                            {gridY.map((gy) => {
                                const [, sy] = worldToScreen(0, gy);
                                if (sy < 12 || sy > cvSize.h - RB.h - 6) return null;
                                return (
                                    <g key={`sy${gy}`}>
                                        <text x={RB.w - 5} y={sy - 3} fill={T.bandText} fontSize={10.5} fontFamily="IBM Plex Mono, monospace" textAnchor="end">{(-gy / aspect).toFixed(0)}</text>
                                        <text x={cvSize.w - RB.w + 5} y={sy - 3} fill={T.bandText} fontSize={10.5} fontFamily="IBM Plex Mono, monospace">{(-gy / aspect).toFixed(0)}</text>
                                    </g>
                                );
                            })}
                            <text x={RB.w - 5} y={13} fill={T.bandText} fontSize={9.5} fontFamily="IBM Plex Mono, monospace" textAnchor="end">m</text>
                            {/* valores del cursor marcados SOBRE las reglas */}
                            {probe && (() => {
                                const [sx, sy] = worldToScreen(probe.off, -probe.elev * aspect);
                                return (
                                    <g>
                                        {sx > RB.w && sx < cvSize.w - RB.w && (
                                            <text x={sx} y={cvSize.h - 6} fill={T.probe} fontSize={10.5} fontWeight="700" fontFamily="IBM Plex Mono, monospace" textAnchor="middle" stroke={T.band} strokeWidth={3} paintOrder="stroke">
                                                {probe.off.toFixed(2)}
                                            </text>
                                        )}
                                        {sy > 12 && sy < cvSize.h - RB.h && (
                                            <text x={RB.w - 5} y={sy - 3} fill={T.probe} fontSize={10.5} fontWeight="700" fontFamily="IBM Plex Mono, monospace" textAnchor="end" stroke={T.band} strokeWidth={3} paintOrder="stroke">
                                                {probe.elev.toFixed(2)}
                                            </text>
                                        )}
                                    </g>
                                );
                            })()}
                        </svg>
                    )}

                    {/* Cabina de datos: todo lo necesario, fijo y quieto */}
                    <div style={{ position: 'absolute', left: 10, bottom: 10, background: light ? 'rgba(255,255,255,0.92)' : 'rgba(18,20,24,0.92)', border: `1px solid ${light ? '#c9ced6' : '#2e3540'}`, borderRadius: 6, padding: '7px 10px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, lineHeight: 1.6, color: light ? '#26303c' : '#c6ccd4', pointerEvents: 'none', minWidth: 148 }}>
                        <div><span style={{ opacity: 0.65 }}>PK </span>{formatStation(station.station)}</div>
                        <div>
                            <span style={{ opacity: 0.65 }}>Off </span>{probe ? `${probe.off.toFixed(2)}m` : '—'}
                            <span style={{ opacity: 0.65 }}>  Cota </span>{probe ? `${probe.elev.toFixed(2)}m` : '—'}
                        </div>
                        {probe?.snapped && <div style={{ color: T.snap }}>⊙ {probe.kind}</div>}
                        {(labelCT != null || labelCC != null) && (
                            <div style={{ borderTop: `1px solid ${light ? '#dde1e7' : '#262c35'}`, marginTop: 3, paddingTop: 3 }}>
                                {labelCT != null ? `CT ${labelCT.toFixed(2)}` : ''}{labelCT != null && labelCC != null ? ' · ' : ''}{labelCC != null ? `CC ${labelCC.toFixed(2)}` : ''}
                                <span style={{ opacity: 0.55 }}> {fromBand ? '(lámina)' : '(diseño)'}</span>
                            </div>
                        )}
                        {fromBand && ctcc.cc != null && (
                            <div style={{ opacity: 0.6, fontSize: 10 }}>
                                diseño: {ctcc.ct != null ? `CT ${ctcc.ct.toFixed(2)} · ` : ''}CC {ctcc.cc.toFixed(2)}
                            </div>
                        )}
                    </div>
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
                {/* Cinta de progresivas: un tick por sección extraída; clic = saltar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <svg width="100%" height="34" style={{ flex: 1, display: 'block' }}>
                        {(() => {
                            const n = stations.length;
                            if (!n) return null;
                            const s0 = Number(stations[0].station);
                            const s1 = Number(stations[n - 1].station);
                            const span = Math.max(1e-9, s1 - s0);
                            const X = (st) => 8 + ((Number(st) - s0) / span) * 84; // % con margen
                            return (
                                <>
                                    <line x1="2%" y1="24" x2="98%" y2="24" stroke="#39424f" strokeWidth="1.5" />
                                    {stations.map((st, i) => (
                                        <g key={i} style={{ cursor: 'pointer' }} onClick={() => goIndex(i)}>
                                            <rect x={`${X(st.station) - 1.2}%`} y="10" width="2.4%" height="24" fill="transparent" />
                                            <line x1={`${X(st.station)}%`} y1={i === currentIndex ? 15 : 19} x2={`${X(st.station)}%`} y2="29"
                                                stroke={i === currentIndex ? '#8ecbff' : '#5b6572'} strokeWidth={i === currentIndex ? 3 : 1.5} />
                                            <title>{formatStation(st.station)}</title>
                                        </g>
                                    ))}
                                    <text x={`${X(stations[currentIndex].station)}%`} y="9" fill="#8ecbff" fontSize="10" fontWeight="700" fontFamily="IBM Plex Mono, monospace" textAnchor="middle">
                                        {formatStation(stations[currentIndex].station)}
                                    </text>
                                </>
                            );
                        })()}
                    </svg>
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10.5, color: '#8a919c', flexShrink: 0 }}>
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
                    {mdlSlice.length > 0 && (
                        <button
                            onClick={() => setShowModel((p) => !p)}
                            title="Superponer el corte de los modelos 3D cargados en el visor (referencia visual)"
                            style={{ ...btn(showModel), padding: '3px 10px', fontSize: 11, color: showModel ? '#00d5ff' : undefined }}
                        >
                            Modelo 3D
                        </button>
                    )}
                    <div style={{ flex: 1 }} />
                    <button
                        onClick={() => setLight((p) => !p)}
                        title="Modo Plano: fondo blanco como la lámina impresa (los revisores comparan 1:1 contra el PDF)"
                        style={{ ...btn(light), padding: '3px 10px', fontSize: 11 }}
                    >
                        {light ? '◑ Oscuro' : '◐ Plano'}
                    </button>
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
