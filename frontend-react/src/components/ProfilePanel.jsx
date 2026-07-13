import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ProfileIcon } from './TandemIcons';

// ── PANEL DE PERFIL LONGITUDINAL interactivo ────────────────────────────────
// Dibuja los perfiles (terreno, rasante, corona…) del eje activo bajo el visor,
// SINCRONIZADO con la progresiva 3D en ambos sentidos:
//   · mueves el cursor/etiqueta en el 3D  → la línea del perfil se mueve
//   · arrastras dentro del perfil          → el marcador 3D salta a esa PK
// Fuente de datos: window.__lobCivilAlignments (extracción de Civil en BD).

const PROFILE_COLORS = [
    { re: /terreno|surface|existing|natural|\beg\b/i, color: '#8b9e54', label: 'terreno' },
    { re: /rasante|finished|proposed|design|layout|\bfg\b/i, color: '#3aa0ff', label: 'rasante' },
    { re: /corona/i, color: '#f59e0b', label: 'corona' },
    { re: /fondo|invert|clave/i, color: '#22d3ee', label: 'fondo' },
];
const FALLBACK_COLORS = ['#c084fc', '#fb7185', '#a3e635', '#eab308'];

const colorForProfile = (name, idx) => {
    for (const rule of PROFILE_COLORS) {
        if (rule.re.test(String(name || ''))) return rule.color;
    }
    return FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
};

const fmtPk = (v) => `${Math.floor(Number(v || 0) / 1000)}+${String((Number(v || 0) % 1000).toFixed(2)).padStart(6, '0')}`;

const validPoints = (profile) => (Array.isArray(profile?.points) ? profile.points : [])
    .filter((p) => Number.isFinite(Number(p.station)) && Number.isFinite(Number(p.z)))
    .map((p) => ({ s: Number(p.station), z: Number(p.z) }))
    .sort((a, b) => a.s - b.s);

const zAt = (pts, station) => {
    if (!pts.length) return null;
    if (station <= pts[0].s) return pts[0].z;
    if (station >= pts[pts.length - 1].s) return pts[pts.length - 1].z;
    let lo = 0; let hi = pts.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (pts[mid].s <= station) lo = mid; else hi = mid;
    }
    const a = pts[lo]; const b = pts[hi];
    const t = (station - a.s) / Math.max(1e-9, b.s - a.s);
    return a.z + (b.z - a.z) * t;
};

export default function ProfilePanel() {
    const [open, setOpen] = useState(false);
    const [alignments, setAlignments] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [cursorPk, setCursorPk] = useState(null);
    // Altura del panel: grande por defecto (~40% de pantalla), redimensionable
    // arrastrando el borde superior; recordada entre sesiones.
    const [panelH, setPanelH] = useState(() => {
        const saved = Number(localStorage.getItem('profile_panel_h'));
        return Number.isFinite(saved) && saved >= 180 ? saved : Math.round(window.innerHeight * 0.4);
    });
    // Exageración vertical: 'auto' = ajustar al alto; número = V:H real (10 = 10x)
    const [vExag, setVExag] = useState('auto');
    const [pxPlot, setPxPlot] = useState(null); // medidas reales en px del plot
    // Capas "profesionales" del perfil (corte/relleno, pendientes, cotas)
    const [showFill, setShowFill] = useState(true);
    const [showSlopes, setShowSlopes] = useState(false);
    const [showBands, setShowBands] = useState(false); // banda de datos por PK bajo el cursor
    const svgRef = useRef(null);
    const draggingRef = useRef(false);
    const resizingRef = useRef(null);

    useEffect(() => {
        try { localStorage.setItem('profile_panel_h', String(panelH)); } catch { /* noop */ }
    }, [panelH]);

    const startResize = (e) => {
        resizingRef.current = { y0: e.clientY, h0: panelH };
        const onMove = (ev) => {
            if (!resizingRef.current) return;
            const next = resizingRef.current.h0 + (resizingRef.current.y0 - ev.clientY);
            setPanelH(Math.max(180, Math.min(Math.round(window.innerHeight * 0.65), next)));
        };
        const onUp = () => {
            resizingRef.current = null;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        e.preventDefault();
    };

    // refrescar lista al abrir + al recibir eventos de PK (el eje pudo cambiar)
    const syncAlignments = useCallback(() => {
        const list = Array.isArray(window.__lobCivilAlignments) ? window.__lobCivilAlignments : [];
        setAlignments(list);
        setActiveId((prev) => {
            if (prev && list.some((a) => (a.alignmentId || a.name) === prev)) return prev;
            return list.length ? (list[0].alignmentId || list[0].name) : null;
        });
    }, []);

    useEffect(() => {
        const onPk = (e) => {
            const d = e.detail || {};
            if (d.alignmentId) setActiveId(d.alignmentId);
            if (Number.isFinite(Number(d.station))) setCursorPk(Number(d.station));
            if (!alignments.length) syncAlignments();
        };
        window.addEventListener('LOB4D_PK_CONTEXT_CHANGED', onPk);
        return () => window.removeEventListener('LOB4D_PK_CONTEXT_CHANGED', onPk);
    }, [alignments.length, syncAlignments]);

    // La barra inferior del visor controla abrir/cerrar por evento; el panel
    // avisa su estado para mantener el check en sync.
    useEffect(() => {
        const onToggle = (e) => {
            const v = e?.detail?.open;
            setOpen(prev => {
                const next = (v === undefined) ? !prev : !!v;
                if (next) syncAlignments();
                return next;
            });
        };
        window.addEventListener('viewer-toggle-profile', onToggle);
        return () => window.removeEventListener('viewer-toggle-profile', onToggle);
    }, [syncAlignments]);
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('viewer-profile-state', { detail: { open } }));
    }, [open]);

    const alignment = useMemo(
        () => alignments.find((a) => (a.alignmentId || a.name) === activeId) || null,
        [alignments, activeId]
    );

    const series = useMemo(() => {
        if (!alignment) return [];
        return (alignment.profiles || [])
            .map((p, i) => ({ name: p.name || `Perfil ${i + 1}`, pts: validPoints(p), color: colorForProfile(p.name, i) }))
            .filter((sr) => sr.pts.length >= 2);
    }, [alignment]);

    // Terreno (superficie natural) y rasante (diseño) para el corte/relleno.
    const terrainSeries = useMemo(
        () => series.find(s => /terreno|surface|existing|natural|\beg\b|tirante/i.test(s.name)) || null,
        [series]
    );
    const gradeSeries = useMemo(
        () => series.find(s => /rasante|finished|proposed|design|layout|\bfg\b/i.test(s.name)) || null,
        [series]
    );

    // Muestreo de corte/relleno: a lo largo del dominio común, dz = rasante - terreno.
    //   dz > 0  → RELLENO (rasante sobre el terreno)
    //   dz < 0  → CORTE   (excavación: rasante bajo el terreno)
    const cutFill = useMemo(() => {
        if (!terrainSeries || !gradeSeries) return [];
        const s0 = Math.max(terrainSeries.pts[0].s, gradeSeries.pts[0].s);
        const s1 = Math.min(terrainSeries.pts[terrainSeries.pts.length - 1].s, gradeSeries.pts[gradeSeries.pts.length - 1].s);
        if (!(s1 > s0)) return [];
        const N = 320;
        const step = (s1 - s0) / N;
        const out = [];
        for (let i = 0; i <= N; i++) {
            const s = s0 + step * i;
            const zt = zAt(terrainSeries.pts, s);
            const zr = zAt(gradeSeries.pts, s);
            if (zt == null || zr == null) continue;
            out.push({ s, zt, zr });
        }
        return out;
    }, [terrainSeries, gradeSeries]);

    // layout SVG — el alto del viewBox = px reales (1:1 vertical) para que la
    // exageración V:H calculada sea la de PANTALLA de verdad.
    const W = 1200;
    const H = Math.max(140, panelH - 52);
    const L = 64; const R = 16; const T = 14; const B = 26;

    // medir px reales del plot (para la escala V:H exacta)
    useEffect(() => {
        if (!open) return undefined;
        const measure = () => {
            const rect = svgRef.current?.getBoundingClientRect();
            if (rect?.width) setPxPlot({ w: rect.width * ((W - L - R) / W), h: H - T - B });
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [open, panelH, H]);

    // Extensión TOTAL de los datos (PK y cotas de todos los perfiles)
    const dataExtent = useMemo(() => {
        if (!series.length) return null;
        let s0 = Infinity; let s1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
        series.forEach(({ pts }) => pts.forEach((p) => {
            s0 = Math.min(s0, p.s); s1 = Math.max(s1, p.s);
            z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
        }));
        if (!(s1 > s0)) return null;
        return { s0, s1, z0, z1 };
    }, [series]);

    // 🔍 VENTANA de PK visible (zoom/pan). null = ver todo el eje.
    const [view, setView] = useState(null);
    useEffect(() => { setView(null); }, [activeId]); // cambiar de eje resetea el zoom
    const viewS0 = view?.s0 ?? dataExtent?.s0;
    const viewS1 = view?.s1 ?? dataExtent?.s1;

    // Encaje VERTICAL sobre lo visible: al hacer zoom, el perfil se re-encuadra
    // a las cotas del tramo que estás viendo (más detalle real).
    const zFitVisible = useMemo(() => {
        if (!dataExtent) return null;
        let z0 = Infinity; let z1 = -Infinity;
        series.forEach(({ pts }) => pts.forEach((p) => {
            if (p.s < viewS0 - 1 || p.s > viewS1 + 1) return;
            z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
        }));
        if (!Number.isFinite(z0)) { z0 = dataExtent.z0; z1 = dataExtent.z1; }
        const zPad = Math.max(0.4, (z1 - z0) * 0.08);
        return { z0: z0 - zPad, z1: z1 + zPad };
    }, [series, dataExtent, viewS0, viewS1]);

    // Dominio final según exageración: 'auto' = ajusta al alto (llena el panel);
    // número N = escala vertical N veces la horizontal (1 = escala verdadera).
    const domain = useMemo(() => {
        if (!dataExtent || !zFitVisible) return null;
        const base = { s0: viewS0, s1: viewS1, z0: zFitVisible.z0, z1: zFitVisible.z1 };
        if (vExag === 'auto' || !pxPlot?.w) return base;
        const spanS = base.s1 - base.s0;
        const mPerPxX = spanS / pxPlot.w;
        const mPerPxY = mPerPxX / Number(vExag);
        const zSpan = (H - T - B) * mPerPxY;
        const zMid = (base.z0 + base.z1) / 2;
        return { ...base, z0: zMid - zSpan / 2, z1: zMid + zSpan / 2 };
    }, [dataExtent, zFitVisible, viewS0, viewS1, vExag, pxPlot, H]);

    // exageración efectiva (informativa) del modo auto
    const effectiveExag = useMemo(() => {
        if (!domain || !pxPlot?.w) return null;
        const mPerPxX = (domain.s1 - domain.s0) / pxPlot.w;
        const mPerPxY = (domain.z1 - domain.z0) / Math.max(1, H - T - B);
        return mPerPxX / mPerPxY;
    }, [domain, pxPlot, H]);

    // 🔍 zoom con RUEDA anclado a la PK bajo el cursor (listener no-pasivo
    // porque hay que preventDefault para no scrollear la página).
    useEffect(() => {
        const el = svgRef.current;
        if (!el || !open) return undefined;
        const onWheel = (e) => {
            if (!dataExtent) return;
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * W;
            const curS0 = viewS0; const curS1 = viewS1;
            const span = curS1 - curS0;
            const anchor = curS0 + ((px - L) / (W - L - R)) * span;
            const factor = e.deltaY > 0 ? 1.18 : 1 / 1.18;
            const fullSpan = dataExtent.s1 - dataExtent.s0;
            const minSpan = Math.max(5, fullSpan / 400);
            let nextSpan = Math.max(minSpan, Math.min(fullSpan, span * factor));
            const ratio = (anchor - curS0) / span;
            let nS0 = anchor - nextSpan * ratio;
            let nS1 = nS0 + nextSpan;
            if (nS0 < dataExtent.s0) { nS0 = dataExtent.s0; nS1 = nS0 + nextSpan; }
            if (nS1 > dataExtent.s1) { nS1 = dataExtent.s1; nS0 = nS1 - nextSpan; }
            setView(nextSpan >= fullSpan - 1e-6 ? null : { s0: nS0, s1: nS1 });
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [open, dataExtent, viewS0, viewS1]);

    const x = useCallback((s) => L + ((s - domain.s0) / (domain.s1 - domain.s0)) * (W - L - R), [domain]);
    const y = useCallback((z) => T + ((domain.z1 - z) / (domain.z1 - domain.z0)) * (H - T - B), [domain]);

    // arrastre en el perfil → mueve el marcador 3D (bidireccional)
    const stationFromEvent = useCallback((event) => {
        if (!domain || !svgRef.current) return null;
        const rect = svgRef.current.getBoundingClientRect();
        const px = ((event.clientX - rect.left) / rect.width) * W;
        const s = domain.s0 + ((px - L) / (W - L - R)) * (domain.s1 - domain.s0);
        return Math.max(domain.s0, Math.min(domain.s1, s));
    }, [domain]);

    const driveViewer = useCallback((station) => {
        setCursorPk(station);
        try {
            const ext = window.NOP_VIEWER?.getExtension?.('LOB4DExtension');
            if (!ext) return;
            const target = (ext.activeAlignments || []).find((a) => (a.alignmentId || a.name) === activeId)
                || alignment;
            if (target) ext.activeAlignment = target;
            ext.activateStationCursor?.(station);
        } catch { /* noop */ }
    }, [activeId, alignment]);

    const panRef = useRef(null);
    const onPointerDown = (e) => {
        // Shift+arrastre (o botón central) = PAN de la ventana de PK;
        // arrastre normal = mover la progresiva (sincroniza el 3D).
        if ((e.shiftKey || e.button === 1) && domain) {
            panRef.current = { x0: e.clientX, s0: domain.s0, s1: domain.s1 };
            e.currentTarget.setPointerCapture?.(e.pointerId);
            e.preventDefault();
            return;
        }
        const s = stationFromEvent(e);
        if (s == null) return;
        draggingRef.current = true;
        driveViewer(s);
        e.currentTarget.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
        if (panRef.current && dataExtent && svgRef.current) {
            const rect = svgRef.current.getBoundingClientRect();
            const plotWpx = rect.width * ((W - L - R) / W);
            const span = panRef.current.s1 - panRef.current.s0;
            const dS = -((e.clientX - panRef.current.x0) / Math.max(1, plotWpx)) * span;
            let nS0 = panRef.current.s0 + dS;
            let nS1 = panRef.current.s1 + dS;
            if (nS0 < dataExtent.s0) { nS0 = dataExtent.s0; nS1 = nS0 + span; }
            if (nS1 > dataExtent.s1) { nS1 = dataExtent.s1; nS0 = nS1 - span; }
            setView({ s0: nS0, s1: nS1 });
            return;
        }
        if (!draggingRef.current) return;
        const s = stationFromEvent(e);
        if (s != null) driveViewer(s);
    };
    const onPointerUp = () => { draggingRef.current = false; panRef.current = null; };
    const onDoubleClick = () => setView(null); // doble clic = ver todo el eje

    // Cerrado: no renderiza nada (la barra inferior del visor lo abre por evento).
    if (!open) return null;

    // Progresivas DINÁMICAS: el paso se adapta al zoom (250m → 100 → 50 → 25 → 10 → 5)
    const pickPkStep = (span) => {
        if (span <= 60) return 5;
        if (span <= 150) return 10;
        if (span <= 400) return 25;
        if (span <= 900) return 50;
        if (span <= 2500) return 100;
        if (span <= 6000) return 250;
        return 500;
    };
    const ticksX = [];
    if (domain) {
        const stepMinor = pickPkStep(domain.s1 - domain.s0);
        const stepMajor = stepMinor * 5;
        for (let s = Math.ceil(domain.s0 / stepMinor) * stepMinor; s <= domain.s1 + 1e-6; s += stepMinor) {
            const major = Math.abs(s - Math.round(s / stepMajor) * stepMajor) < 1e-3;
            ticksX.push({ s, major });
        }
    }
    const ticksY = domain ? Array.from({ length: 5 }, (_, i) => domain.z0 + ((domain.z1 - domain.z0) * i) / 4) : [];
    const zoomed = view != null;
    const cursor = cursorPk != null && domain && cursorPk >= domain.s0 && cursorPk <= domain.s1 ? cursorPk : null;

    // Segmentos de pendiente de la rasante (fusiona tramos casi colineales).
    const slopeSegs = (() => {
        if (!gradeSeries) return [];
        const pts = gradeSeries.pts;
        if (pts.length < 2) return [];
        const slopeOf = (a, b) => (b.z - a.z) / Math.max(1e-6, b.s - a.s);
        const cuts = [0];
        for (let i = 1; i < pts.length - 1; i++) {
            const sPrev = slopeOf(pts[cuts[cuts.length - 1]], pts[i]);
            const sNext = slopeOf(pts[i], pts[i + 1]);
            if (Math.abs(sNext - sPrev) > 0.003) cuts.push(i);
        }
        cuts.push(pts.length - 1);
        const segs = [];
        for (let i = 0; i < cuts.length - 1; i++) {
            const p1 = pts[cuts[i]]; const p2 = pts[cuts[i + 1]];
            if (p2.s - p1.s < 4) continue;
            segs.push({ sm: (p1.s + p2.s) / 2, zm: (p1.z + p2.z) / 2, slope: slopeOf(p1, p2) * 100 });
        }
        return segs;
    })();

    return (
        <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 40,
            height: panelH,
            background: 'rgba(13,17,23,0.96)', borderTop: '1px solid #2a323d',
            padding: '0 12px 6px', backdropFilter: 'blur(3px)',
            display: 'flex', flexDirection: 'column',
        }}>
            {/* barra de redimensionado: arrastra para agrandar/achicar el panel */}
            <div
                onPointerDown={startResize}
                title="Arrastra para cambiar la altura del panel"
                style={{ height: 8, margin: '0 -12px', cursor: 'ns-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
                <div style={{ width: 54, height: 3.5, borderRadius: 2, background: '#3b4553' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ color: '#8ecbff', fontWeight: 800, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <ProfileIcon /> Perfil longitudinal
                </span>
                {/* escala vertical: auto (llena el panel) o exageración V:H real */}
                <select
                    value={vExag}
                    onChange={(e) => setVExag(e.target.value)}
                    title="Escala vertical: auto ajusta al panel; 1x = escala verdadera; 10x = exagerada 10 veces"
                    style={{ background: '#0f1216', border: '1px solid #2a323d', color: '#dce3ee', borderRadius: 4, padding: '3px 6px', fontSize: 11 }}
                >
                    <option value="auto">Escala V: auto{effectiveExag ? ` (≈${effectiveExag.toFixed(1)}x)` : ''}</option>
                    <option value="1">1x (verdadera)</option>
                    <option value="2">2x</option>
                    <option value="5">5x</option>
                    <option value="10">10x</option>
                    <option value="20">20x</option>
                </select>
                {zoomed && (
                    <button
                        type="button"
                        onClick={() => setView(null)}
                        title="Ver todo el eje (o doble clic en el gráfico)"
                        style={{ background: 'rgba(50,151,255,.16)', border: '1px solid #2d5a8a', color: '#7cbcff', borderRadius: 4, padding: '2px 8px', fontSize: 10.5, cursor: 'pointer', fontWeight: 700 }}
                    >
                        🔍 {fmtPk(viewS0)}–{fmtPk(viewS1)} · ver todo
                    </button>
                )}
                {/* Capas profesionales del perfil */}
                {(terrainSeries && gradeSeries) && (
                    <button
                        type="button"
                        onClick={() => setShowFill(v => !v)}
                        title="Sombrear corte (excavación) y relleno entre terreno y rasante"
                        style={{ background: showFill ? 'rgba(16,185,129,.16)' : '#0f1216', border: `1px solid ${showFill ? '#0f9d58' : '#2a323d'}`, color: showFill ? '#34d399' : '#8d98a8', borderRadius: 4, padding: '2px 8px', fontSize: 10.5, cursor: 'pointer', fontWeight: 700 }}
                    >▨ Corte/Relleno</button>
                )}
                {gradeSeries && (
                    <button
                        type="button"
                        onClick={() => setShowSlopes(v => !v)}
                        title="Etiquetar pendientes (%) de la rasante"
                        style={{ background: showSlopes ? 'rgba(245,158,11,.16)' : '#0f1216', border: `1px solid ${showSlopes ? '#f59e0b' : '#2a323d'}`, color: showSlopes ? '#fbbf24' : '#8d98a8', borderRadius: 4, padding: '2px 8px', fontSize: 10.5, cursor: 'pointer', fontWeight: 700 }}
                    >∠ Pendientes</button>
                )}
                <span style={{ color: '#5b6570', fontSize: 10 }}>
                    rueda: zoom · Shift+arrastrar: pan · doble clic: todo
                </span>
                {alignments.length > 1 && (
                    <select
                        value={activeId || ''}
                        onChange={(e) => setActiveId(e.target.value)}
                        style={{ background: '#0f1216', border: '1px solid #2a323d', color: '#dce3ee', borderRadius: 4, padding: '3px 8px', fontSize: 11 }}
                    >
                        {alignments.map((a) => {
                            const id = a.alignmentId || a.name;
                            return <option key={id} value={id}>{id}</option>;
                        })}
                    </select>
                )}
                {/* leyenda de perfiles */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {series.map((sr) => (
                        <span key={sr.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#c7d0dc' }}>
                            <span style={{ width: 14, height: 2.5, background: sr.color, display: 'inline-block' }} />
                            {sr.name.slice(0, 24)}
                            {cursor != null && (
                                <b style={{ color: sr.color, fontFamily: 'Consolas, monospace' }}>
                                    {(() => { const z = zAt(sr.pts, cursor); return z != null ? z.toFixed(2) : '—'; })()}
                                </b>
                            )}
                        </span>
                    ))}
                </div>
                {cursor != null && (
                    <span className="lob4d-mono" style={{ marginLeft: 'auto', color: '#fbbf24', fontSize: 12, fontWeight: 800, fontFamily: 'Consolas, monospace' }}>
                        PK {fmtPk(cursor)}
                    </span>
                )}
                <button
                    type="button" onClick={() => setOpen(false)}
                    style={{ marginLeft: cursor != null ? 8 : 'auto', background: 'transparent', border: 'none', color: '#8d98a8', cursor: 'pointer', fontSize: 15 }}
                    title="Cerrar panel de perfil"
                >×</button>
            </div>

            {(!alignment || !series.length) ? (
                <div style={{ color: '#8d98a8', fontSize: 12, padding: '14px 4px' }}>
                    Sin perfiles: selecciona un eje en el panel Civil (o fija un eje base 📌 con perfiles extraídos).
                </div>
            ) : (
                <svg
                    ref={svgRef}
                    viewBox={`0 0 ${W} ${H}`}
                    preserveAspectRatio="none"
                    style={{ width: '100%', height: H, display: 'block', cursor: 'crosshair', touchAction: 'none', flex: 1 }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerLeave={onPointerUp}
                    onDoubleClick={onDoubleClick}
                >
                    <defs>
                        <pattern id="pf-cut" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                            <rect width="7" height="7" fill="rgba(239,68,68,0.10)" />
                            <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(239,68,68,0.55)" strokeWidth="1" />
                        </pattern>
                        <pattern id="pf-fill" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                            <rect width="7" height="7" fill="rgba(16,185,129,0.10)" />
                            <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(16,185,129,0.55)" strokeWidth="1" />
                        </pattern>
                    </defs>
                    <rect x="0" y="0" width={W} height={H} fill="#0d1117" />

                    {/* Corte (rojo) / Relleno (verde) entre terreno y rasante */}
                    {showFill && cutFill.map((p, i) => {
                        if (i === cutFill.length - 1) return null;
                        const q = cutFill[i + 1];
                        const dzMid = ((p.zr - p.zt) + (q.zr - q.zt)) / 2;
                        if (Math.abs(dzMid) < 0.02) return null;
                        const fillRef = dzMid > 0 ? 'url(#pf-fill)' : 'url(#pf-cut)';
                        const pts = `${x(p.s).toFixed(1)},${y(p.zt).toFixed(1)} ${x(p.s).toFixed(1)},${y(p.zr).toFixed(1)} ${x(q.s).toFixed(1)},${y(q.zr).toFixed(1)} ${x(q.s).toFixed(1)},${y(q.zt).toFixed(1)}`;
                        return <polygon key={`cf${i}`} points={pts} fill={fillRef} stroke="none" />;
                    })}

                    {/* grid de progresivas: menor tenue, mayor con etiqueta */}
                    {ticksX.map(({ s, major }) => (
                        <g key={`gx${s}`}>
                            <line
                                x1={x(s)} y1={T} x2={x(s)} y2={H - B}
                                stroke={major ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.05)'}
                                strokeWidth={major ? 0.9 : 0.5}
                            />
                            {major && (
                                <text x={x(s)} y={H - 10} fill="#8ecbff" fontSize="10" textAnchor="middle" fontFamily="Consolas, monospace">
                                    {fmtPk(s)}
                                </text>
                            )}
                        </g>
                    ))}
                    {ticksY.map((z) => (
                        <g key={`gy${z}`}>
                            <line x1={L} y1={y(z)} x2={W - R} y2={y(z)} stroke="rgba(255,255,255,0.05)" />
                            <text x={L - 6} y={y(z) + 3} fill="#66707e" fontSize="9.5" textAnchor="end" fontFamily="Consolas, monospace">
                                {z.toFixed(1)}
                            </text>
                        </g>
                    ))}
                    {/* perfiles */}
                    {series.map((sr) => (
                        <polyline
                            key={sr.name}
                            fill="none" stroke={sr.color} strokeWidth="1.8"
                            points={sr.pts.map((p) => `${x(p.s).toFixed(1)},${y(p.z).toFixed(1)}`).join(' ')}
                        />
                    ))}

                    {/* pendientes de la rasante (%) */}
                    {showSlopes && slopeSegs.filter(seg => seg.sm >= domain.s0 && seg.sm <= domain.s1).map((seg, i) => (
                        <text
                            key={`sl${i}`}
                            x={x(seg.sm)} y={y(seg.zm) - 6}
                            fill="#fbbf24" fontSize="9.5" fontWeight="700" textAnchor="middle"
                            fontFamily="Consolas, monospace"
                            style={{ paintOrder: 'stroke', stroke: '#0d1117', strokeWidth: 3 }}
                        >
                            {seg.slope >= 0 ? '+' : ''}{seg.slope.toFixed(2)}%
                        </text>
                    ))}
                    {/* cursor de progresiva sincronizado */}
                    {cursor != null && (
                        <g>
                            <line x1={x(cursor)} y1={T - 4} x2={x(cursor)} y2={H - B + 4} stroke="#fbbf24" strokeWidth="1.6" />
                            {series.map((sr) => {
                                const z = zAt(sr.pts, cursor);
                                if (z == null) return null;
                                return <circle key={`c${sr.name}`} cx={x(cursor)} cy={y(z)} r="3.4" fill={sr.color} stroke="#0d1117" strokeWidth="1" />;
                            })}
                        </g>
                    )}
                </svg>
            )}
        </div>
    );
}
