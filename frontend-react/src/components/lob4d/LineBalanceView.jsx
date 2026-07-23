import React, { useMemo, useState } from 'react';
import { buildLobSeries, formatDate } from './lob4dUtils';
import { FAMILY_LABEL } from './partidaTaxonomy';
import { svgPatternDefs, DEFINED_PATTERNS } from './partidaPatterns';

// Paletas del gráfico: dark (pantalla) y light (TILOS-imprenta, como los PDF
// de ejemplo de Trimble). El toggle 🖨 cambia SOLO el lienzo SVG.
const THEMES = {
    dark: {
        bg: '#10141a', band: 'rgba(255,255,255,0.018)',
        gridSoft: 'rgba(255,255,255,0.06)', gridMinor: 'rgba(255,255,255,0.04)', gridMajor: 'rgba(255,255,255,0.14)',
        tickText: '#8793a5', pkMajor: '#8ecbff', pkMinor: '#4b5361',
        zoneCode: '#8ecbff', zoneName: '#8d98a8',
        histBg: 'rgba(255,255,255,0.02)', histBorder: 'rgba(255,255,255,0.05)', histLabel: '#8d98a8',
        holeFill: '#10141a', gapStroke: '#8d98a8', baselineStroke: '#66707e',
        sectorBg: 'rgba(255,255,255,0.02)', sectorBorder: 'rgba(255,255,255,0.06)',
    },
    light: {
        bg: '#ffffff', band: 'rgba(0,0,0,0.030)',
        gridSoft: 'rgba(0,0,0,0.08)', gridMinor: 'rgba(0,0,0,0.05)', gridMajor: 'rgba(0,0,0,0.22)',
        tickText: '#4b5563', pkMajor: '#0b62a8', pkMinor: '#9aa4af',
        zoneCode: '#0b62a8', zoneName: '#556070',
        histBg: 'rgba(0,0,0,0.025)', histBorder: 'rgba(0,0,0,0.10)', histLabel: '#5b6570',
        holeFill: '#ffffff', gapStroke: '#6b7280', baselineStroke: '#9ca3af',
        sectorBg: 'rgba(0,0,0,0.02)', sectorBorder: 'rgba(0,0,0,0.08)',
    },
};

// ── LÍNEA DE BALANCE profesional estilo TILOS ──
// Cada actividad muestra DOS trazos: PLAN (baseline, semitransparente) y REAL
// (sólido, hasta el punto de avance real). Círculos "plan aquí" (hueco) y "real
// aquí" (lleno) muestran dónde estás y dónde deberías estar; el segmento gris
// que los une = brecha visible. Clic → Progress Dashboard con métricas plan/real.

const COLORS = ['#f59e0b', '#3aa0ff', '#22c55e', '#8b5cf6', '#eab308', '#14b8a6', '#fb7185', '#a3e635', '#22d3ee', '#c084fc'];
const formatPk = (value) => `${Math.floor(Number(value || 0) / 1000)}+${String(Math.round(Number(value || 0) % 1000)).padStart(3, '0')}`;

// Panel emergente (estilo "Progress Dashboard" de TILOS): al clic en un trazo,
// muestra plan vs real de esa actividad — PK actual/objetivo, brechas y ritmo.
function ProgressDashboard({ seg, colorFamily, onClose, onJumpDate, onShow3D }) {
    if (!seg) return null;
    const hasPk = seg.stationAtNow != null;
    const status = seg.late ? 'late' : seg.realPct >= 99.5 ? 'done'
        : (seg.deltaDays != null && seg.deltaDays > 3) ? 'behind'
            : (seg.deltaDays != null && seg.deltaDays < -3) ? 'ahead' : 'ok';
    const statusMeta = {
        done: { color: '#22c55e', label: 'Ejecutado' },
        ok: { color: '#22c55e', label: 'En ritmo' },
        ahead: { color: '#3aa0ff', label: 'Adelantado' },
        behind: { color: '#f59e0b', label: 'Atrasado' },
        late: { color: '#ef4444', label: 'Vencido' },
    }[status];
    const Row = ({ label, value, hint, valColor }) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0' }}>
            <span style={{ color: '#8d98a8', fontSize: 11 }}>{label}</span>
            <span style={{ color: valColor || '#dce3ee', fontSize: 12, fontFamily: 'Consolas, monospace', fontWeight: 700, textAlign: 'right' }}>
                {value}{hint ? <small style={{ color: '#66707e', fontWeight: 400, marginLeft: 5 }}>{hint}</small> : null}
            </span>
        </div>
    );
    return (
        <div style={{
            position: 'absolute', top: 14, right: 26, width: 320, zIndex: 40,
            background: '#12161d', border: `1px solid ${statusMeta.color}`, borderRadius: 8,
            padding: 12, boxShadow: '0 10px 32px rgba(0,0,0,.55)', color: '#dce3ee',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: colorFamily }} />
                <span style={{ fontWeight: 800, fontSize: 12 }}>Progress Dashboard</span>
                <span style={{
                    marginLeft: 'auto', fontSize: 10, fontWeight: 800, letterSpacing: '.06em',
                    background: statusMeta.color, color: '#0b0d10', padding: '2px 7px', borderRadius: 4,
                }}>{statusMeta.label}</span>
                <button
                    type="button" onClick={onClose}
                    style={{ background: 'transparent', border: 'none', color: '#8d98a8', cursor: 'pointer', fontSize: 16, marginLeft: 4 }}
                    title="Cerrar"
                >×</button>
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 2, lineHeight: 1.3 }}>
                {seg.descripcion || seg.codigo}
            </div>
            <div style={{ fontSize: 10.5, color: '#8d98a8', marginBottom: 10, fontFamily: 'Consolas, monospace' }}>
                {seg.codigo} · {seg.zone} · act {seg.activity_id || '—'}
            </div>
            <Row label="% Real / Plan" value={`${seg.realPct.toFixed(0)}% / ${seg.plannedPct != null ? seg.plannedPct.toFixed(0) : '—'}%`} />
            {hasPk && (
                <>
                    <Row label="PK avance real" value={formatPk(seg.stationAtNow)} valColor={statusMeta.color} />
                    <Row label="PK debería estar" value={formatPk(seg.stationPlanNow)} />
                    <Row
                        label="Brecha lineal"
                        value={`${seg.deltaMeters > 0 ? '−' : seg.deltaMeters < 0 ? '+' : ''}${Math.abs(seg.deltaMeters).toFixed(1)} m`}
                        valColor={Math.abs(seg.deltaMeters) < 1 ? '#dce3ee' : (seg.deltaMeters > 0 ? '#f59e0b' : '#3aa0ff')}
                    />
                    <Row
                        label="Ritmo real / plan"
                        value={`${(seg.rateActual || 0).toFixed(1)} / ${(seg.productionRate || 0).toFixed(1)}`}
                        hint="m/día"
                    />
                </>
            )}
            <div style={{ height: 1, background: 'rgba(255,255,255,.08)', margin: '10px 0' }} />
            <Row
                label="Inicio → Fin plan"
                value={`${formatDate(new Date(seg.start).toISOString())} → ${formatDate(new Date(seg.finish).toISOString())}`}
            />
            {seg.etaFinish != null && (
                <Row
                    label="ETA fin real"
                    value={formatDate(new Date(seg.etaFinish).toISOString())}
                    valColor={seg.deltaDays > 0 ? '#f59e0b' : seg.deltaDays < 0 ? '#3aa0ff' : '#dce3ee'}
                    hint={seg.deltaDays === 0 ? 'a tiempo' : seg.deltaDays > 0 ? `+${seg.deltaDays}d` : `${seg.deltaDays}d`}
                />
            )}
            <Row label="Metrado" value={`${(seg.ejecutado || 0).toFixed(1)} / ${(seg.metrado || 0).toFixed(1)}`} hint={seg.unidad || ''} />
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                {onShow3D && (
                    <button
                        type="button"
                        onClick={() => onShow3D({ codes: [seg.codigo] })}
                        title="Aislar esta partida en el modelo 3D y volar hacia ella"
                        style={{ flex: 1, background: '#1d4ed8', border: '1px solid #2563eb', color: '#fff', fontSize: 11, padding: '5px 8px', borderRadius: 5, cursor: 'pointer', fontWeight: 700 }}
                    >
                        🎯 Ver en 3D
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => onJumpDate?.(seg.start)}
                    style={{ flex: 1, background: '#252b34', border: '1px solid #2a323d', color: '#c7d0dc', fontSize: 11, padding: '5px 8px', borderRadius: 5, cursor: 'pointer' }}
                >
                    Ir a inicio plan
                </button>
                {seg.etaFinish != null && (
                    <button
                        type="button"
                        onClick={() => onJumpDate?.(seg.etaFinish)}
                        style={{ flex: 1, background: '#252b34', border: '1px solid #2a323d', color: '#c7d0dc', fontSize: 11, padding: '5px 8px', borderRadius: 5, cursor: 'pointer' }}
                    >
                        Ir a ETA
                    </button>
                )}
            </div>
        </div>
    );
}

export default function LineBalanceView({
    lobData,
    activeFrente,
    simulationState,
    selectedCode,
    onPartidaSelect,
    onZoneSelect,
    onJumpDate,
    onDeriveStations,
    onShow3D,
}) {
    const atMs = simulationState?.date ? simulationState.date.getTime() : null;
    const lob = useMemo(() => buildLobSeries(lobData, activeFrente, atMs), [lobData, activeFrente, atMs]);
    const [soloFamily, setSoloFamily] = useState(null);
    const [showAuxiliary, setShowAuxiliary] = useState(false);   // por defecto oculta indirectos
    const [vZoom, setVZoom] = useState(1);                        // zoom vertical: 1, 1.5, 2, 3, 4
    const [lightMode, setLightMode] = useState(false);            // 🖨 tema TILOS-imprenta
    const [focusZone, setFocusZone] = useState(null);             // 🔍 zoom a UNA calle (clic en fila)
    const T = THEMES[lightMode ? 'light' : 'dark'];
    // si el frente/dataset cambió y la calle enfocada ya no existe → sin foco
    const focus = focusZone && (lob.zones || []).some((z) => z.code === focusZone) ? focusZone : null;

    if (!lob.domain || !lob.zones.length) {
        return (
            <div className="lob4d-workspace-view">
                <div className="lob4d-view-header">
                    <div>
                        <div className="lob4d-view-title">Linea de Balance</div>
                        <div className="lob4d-view-copy">Se activa cuando hay fechas P6 vinculadas a las partidas.</div>
                    </div>
                </div>
                <div className="lob4d-content-scroll">
                    <div className="lob4d-empty">No hay actividades con fechas para graficar.</div>
                </div>
            </div>
        );
    }

    // Familias reales del dataset (con contadores) + orden por prioridad TILOS
    const familiesInScope = useMemo(() => {
        const map = new Map();
        (lob.segments || []).forEach((s) => {
            const key = s.taxonomy?.key || s.family;
            const entry = map.get(key) || { key, label: FAMILY_LABEL[key] || key, color: s.taxonomy?.color || '#8d98a8', count: 0, isAuxiliary: !!s.taxonomy?.isAuxiliary, priority: s.taxonomy?.priority || 99 };
            entry.count += 1;
            map.set(key, entry);
        });
        return [...map.values()].sort((a, b) => a.priority - b.priority);
    }, [lob.segments]);

    const colorOf = new Map(familiesInScope.map((f) => [f.key, f.color]));

    // Filtro: si se pide "solo familia" y "auxiliares ocultos" → cortan juntos.
    // Los buzones (puntuales) NO se dibujan aquí — van aparte como circles.
    const visibleSegments = (lob.segments || []).filter((s) => {
        const tax = s.taxonomy || {};
        if (tax.isPunctual) return false; // los puntuales se dibujan aparte
        if (focus && s.zone !== focus) return false; // 🔍 zoom a una calle
        if (!showAuxiliary && tax.isAuxiliary) return false;
        if (soloFamily && (tax.key || s.family) !== soloFamily) return false;
        return true;
    });
    const punctualSegments = (lob.segments || []).filter((s) => {
        const tax = s.taxonomy || {};
        if (!tax.isPunctual) return false;
        if (focus && s.zone !== focus) return false;
        if (!showAuxiliary && tax.isAuxiliary) return false;
        if (soloFamily && (tax.key || s.family) !== soloFamily) return false;
        return true;
    });
    const hiddenAuxCount = (lob.segments || []).filter((s) => s.taxonomy?.isAuxiliary && (!soloFamily || (s.taxonomy?.key || s.family) === soloFamily)).length;

    // ── Zonas RELEVANTES (con actividades visibles) — el resto colapsa ──────
    // Sin esto: 63 zonas EDT apretadas en 720px = 11px por zona → ilegible.
    // Ahora solo pintamos zonas que tienen trazos o puntos visibles.
    const visibleZoneCodes = useMemo(() => {
        const set = new Set();
        visibleSegments.forEach((s) => set.add(s.zone));
        punctualSegments.forEach((s) => set.add(s.zone));
        return set;
    }, [visibleSegments, punctualSegments]);
    const activeZones = useMemo(() => lob.zones.filter((z) => (focus ? z.code === focus : visibleZoneCodes.has(z.code))), [lob.zones, visibleZoneCodes, focus]);

    // Máximo de carriles (fases) en una calle → la fila crece para que cada
    // fase tenga ≥13px aunque el zoom esté en 1× (sin esto, 8 fases = 5px c/u).
    const maxLanesPerZone = useMemo(() => {
        const m = new Map();
        [...visibleSegments, ...punctualSegments].forEach((s) => {
            const f = s.taxonomy?.flow ?? 0;
            if (!m.has(s.zone)) m.set(s.zone, new Set());
            m.get(s.zone).add(f);
        });
        let mx = 1;
        m.forEach((set) => { mx = Math.max(mx, set.size); });
        return mx;
    }, [visibleSegments, punctualSegments]);

    // 🔍 FOCO: dominio temporal re-encuadrado a la calle enfocada (+5% aire)
    const dom = useMemo(() => {
        if (!focus) return lob.domain;
        const segs = [...visibleSegments, ...punctualSegments];
        if (!segs.length) return lob.domain;
        let mn = Infinity; let mx = -Infinity;
        segs.forEach((s) => { mn = Math.min(mn, s.start); mx = Math.max(mx, s.finish); });
        if (!Number.isFinite(mn) || !(mx > mn)) return lob.domain;
        const pad = Math.max(86400000, (mx - mn) * 0.05);
        return { min: mn - pad, max: mx + pad };
    }, [focus, visibleSegments, punctualSegments, lob.domain]);

    // Layout — altura dinámica con zoom vertical. En modo zonas: filas más altas
    // + zoom. En modo progresiva (locationBased): altura escalada por PK y zoom.
    const width = 1240;
    const rowH = focus
        ? Math.max(440 * vZoom, maxLanesPerZone * 34 * vZoom)
        : Math.max(46 * vZoom, 34, maxLanesPerZone * 13 * vZoom);
    const SECTOR_W = 60;
    const left = 250; const right = 34; const top = 34; const bottomAxis = 54;
    const sectorX = left - SECTOR_W - 8;
    const histH = 90;
    const chartBottom = bottomAxis + histH;
    const stationChartH = Math.max(720, 720 * vZoom);
    const height = lob.locationBased
        ? stationChartH + chartBottom
        : top + chartBottom + Math.max(activeZones.length, 1) * rowH;
    const innerW = width - left - right;
    const span = Math.max(1, dom.max - dom.min);
    const x = (t) => left + ((t - dom.min) / span) * innerW;
    const chartBottomY = height - chartBottom;
    const zoneIndex = new Map(activeZones.map((z, i) => [z.code, i]));
    const yTop = (zone) => top + (zoneIndex.get(zone) ?? 0) * rowH + 7;
    const yBot = (zone) => top + (zoneIndex.get(zone) ?? 0) * rowH + rowH - 7;

    // ── CARRILES por secuencia constructiva (modo zonas, estilo TILOS) ──────
    // Dentro de cada calle, cada FASE (flow: excav=1 → refine=2 → cama=3 →
    // tubería=4 → relleno=5 → …) ocupa su propio sub-carril: excavación abajo,
    // relleno arriba. Así se LEE la secuencia en vez del espagueti cruzado.
    const zoneLanes = useMemo(() => {
        const raw = new Map();
        [...visibleSegments, ...punctualSegments].forEach((s) => {
            const f = s.taxonomy?.flow ?? 0;
            if (!raw.has(s.zone)) raw.set(s.zone, new Set());
            raw.get(s.zone).add(f);
        });
        const out = new Map();
        raw.forEach((set, z) => out.set(z, [...set].sort((a, b) => a - b)));
        return out;
    }, [visibleSegments, punctualSegments]);

    const laneRange = (zone, flow) => {
        const lanes = zoneLanes.get(zone) || [0];
        const idx = Math.max(0, lanes.indexOf(flow ?? 0));
        const innerH = rowH - 12;
        const laneH = innerH / lanes.length;
        const y0 = top + (zoneIndex.get(zone) ?? 0) * rowH + 6;
        const yBotL = y0 + innerH - idx * laneH;
        const yTopL = yBotL - laneH + Math.min(3, laneH * 0.25);
        return { yBotL, yTopL };
    };

    // ── ESTADO por calle: ✔ hechas · ▶ en curso · ◻ pendientes · % ponderado ─
    const zoneStatus = useMemo(() => {
        const m = new Map();
        [...visibleSegments, ...punctualSegments].forEach((s) => {
            const st = m.get(s.zone) || { done: 0, run: 0, pend: 0, late: 0, w: 0, wr: 0 };
            const isDone = (s.realPct || 0) >= 99.5;
            const isStarted = (s.realPct || 0) > 0.5 || (atMs != null && s.start <= atMs);
            if (isDone) st.done += 1;
            else if (isStarted) st.run += 1;
            else st.pend += 1;
            if (s.late) st.late += 1;
            const w = Math.max(1, Number(s.metrado) || 1);
            st.w += w; st.wr += w * (s.realPct || 0);
            m.set(s.zone, st);
        });
        m.forEach((st) => { st.pct = st.w > 0 ? st.wr / st.w : 0; });
        return m;
    }, [visibleSegments, punctualSegments, atMs]);
    const stationSpan = Math.max(1, (lob.stationDomain?.max || 1) - (lob.stationDomain?.min || 0));
    const yStation = (station) => top + ((lob.stationDomain.max - station) / stationSpan) * (chartBottomY - top);

    // ── Sector Profile (perfil vertical del eje activo) ─────────────────────
    // Franja delgada a la IZQUIERDA del área de gráfico: elevación (Z) contra
    // progresiva. Se pinta como área rellena, dando la estética TILOS/InfraWorks
    // en la LOB. Fuente: window.__lobCivilAlignments (compartida por el visor).
    const sectorPath = useMemo(() => {
        if (!lob.locationBased) return null;
        const alignments = typeof window !== 'undefined' ? window.__lobCivilAlignments : null;
        if (!Array.isArray(alignments) || !alignments.length) return null;
        // busca el 1er alineamiento con puntos de perfil (Z reales)
        for (const a of alignments) {
            for (const p of (a.profiles || [])) {
                const pts = (p.points || []).filter((it) => Number.isFinite(Number(it.station)) && Number.isFinite(Number(it.z)));
                if (pts.length >= 2) return { name: p.name || a.alignmentId, pts: pts.map((it) => ({ s: Number(it.station), z: Number(it.z) })) };
            }
        }
        return null;
    }, [lob.locationBased, lob.stationDomain?.min, lob.stationDomain?.max]);
    const pickStationStep = (spanM) => {
        if (spanM <= 400) return 25;
        if (spanM <= 1200) return 50;
        if (spanM <= 3000) return 100;
        if (spanM <= 8000) return 250;
        return 500;
    };
    const stationTicks = [];
    if (lob.locationBased) {
        const stepMinor = pickStationStep(stationSpan);
        const stepMajor = stepMinor * 5;
        const s0 = Math.ceil(lob.stationDomain.min / stepMinor) * stepMinor;
        for (let s = s0; s <= lob.stationDomain.max; s += stepMinor) {
            const major = Math.abs(s - Math.round(s / stepMajor) * stepMajor) < 1e-3;
            stationTicks.push({ station: s, y: yStation(s), major });
        }
    }

    const ticks = Array.from({ length: 7 }, (_, i) => {
        const t = dom.min + (span * i) / 6;
        return { t, x: x(t), label: formatDate(new Date(t).toISOString()) };
    });
    const cutX = atMs != null && atMs >= dom.min && atMs <= dom.max ? x(atMs) : null;
    const lateCount = lob.segments.filter((s) => s.late).length;
    const conflictCount = lob.conflicts?.length || 0;

    return (
        <div className="lob4d-workspace-view">
            <div className="lob4d-view-header">
                <div>
                    <div className="lob4d-view-title">Linea de Balance — Tiempo × Ubicación</div>
                    <div className="lob4d-view-copy">
                        {lob.locationBased
                            ? `PK ${formatPk(lob.stationDomain.min)}–${formatPk(lob.stationDomain.max)} · ${visibleSegments.length + punctualSegments.length}/${lob.segments.length} actividades visibles`
                            : `${activeZones.length}/${lob.zones.length} zonas con actividad · ${visibleSegments.length}/${lob.segments.length} trazos`}
                        {` · pendiente = ritmo${lateCount ? ` · ${lateCount} vencidas` : ''}`}
                    </div>
                </div>
                <div className="lob4d-topbar-spacer" />
                {/* 🔍 Banner de FOCO: una calle expandida a pantalla completa */}
                {focus && (() => {
                    const z = lob.zones.find((it) => it.code === focus);
                    const st = zoneStatus.get(focus);
                    return (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            background: '#16202c', border: '1px solid #2d5a8a',
                            borderRadius: 7, padding: '5px 10px', marginRight: 8,
                        }}>
                            <span style={{ fontSize: 12, color: '#7cbcff', fontWeight: 800 }}>
                                🔍 {focus} · {String(z?.name || '').slice(0, 30)}
                            </span>
                            {st && (
                                <span className="lob4d-mono" style={{ fontSize: 11, color: '#c7d0dc' }}>
                                    {st.pct.toFixed(0)}% · ✔{st.done} ▶{st.run} ◻{st.pend}{st.late ? ` ⚠${st.late}` : ''}
                                </span>
                            )}
                            {onShow3D && (
                                <button
                                    type="button" className="lob4d-button ghost"
                                    style={{ padding: '2px 8px' }}
                                    onClick={() => onShow3D({ prefix: `${focus}.` })}
                                    title="Aislar los elementos de esta calle en el modelo 3D y volar hacia ellos"
                                >
                                    🎯 Ver en 3D
                                </button>
                            )}
                            <button
                                type="button" className="lob4d-button ghost"
                                style={{ padding: '2px 8px' }}
                                onClick={() => onZoneSelect?.(focus)}
                                title="Filtrar TODO el 4D (simulación, resumen, 3D) a esta rama"
                            >
                                Filtrar 4D
                            </button>
                            <button
                                type="button" className="lob4d-button primary"
                                style={{ padding: '2px 10px' }}
                                onClick={() => setFocusZone(null)}
                            >
                                ← Todas
                            </button>
                        </div>
                    );
                })()}
                {/* CTA: activar PK real sin salir de la vista (necesita eje Civil activo) */}
                {!lob.locationBased && onDeriveStations && (
                    <button
                        type="button"
                        className="lob4d-button primary"
                        onClick={onDeriveStations}
                        title="Proyecta los elementos al eje activo de Civil → el eje Y pasa de zonas EDT a progresiva real (0+000…)"
                    >
                        📍 Activar PK real
                    </button>
                )}
                {/* Tema imprenta (TILOS blanco) */}
                <button
                    type="button"
                    className={`lob4d-button ghost${lightMode ? ' active' : ''}`}
                    onClick={() => setLightMode((v) => !v)}
                    title="Alternar lienzo claro estilo TILOS-imprenta"
                >
                    🖨 {lightMode ? 'Oscuro' : 'Claro'}
                </button>
                {/* Zoom vertical */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginRight: 10, color: '#8d98a8', fontSize: 11 }}>
                    <span>Zoom Y</span>
                    <button type="button" className="lob4d-icon-button" onClick={() => setVZoom((v) => Math.max(1, v - 0.5))} disabled={vZoom <= 1} title="Reducir">−</button>
                    <span className="lob4d-mono" style={{ minWidth: 28, textAlign: 'center' }}>{vZoom}×</span>
                    <button type="button" className="lob4d-icon-button" onClick={() => setVZoom((v) => Math.min(4, v + 0.5))} disabled={vZoom >= 4} title="Aumentar">+</button>
                </div>
                <div className={`lob4d-lob-alert${conflictCount ? ' danger' : ''}`}>
                    <span>{conflictCount}</span>
                    solapes tiempo-ubicacion
                </div>
                {soloFamily && (
                    <button type="button" className="lob4d-button ghost" onClick={() => setSoloFamily(null)}>
                        Ver todas
                    </button>
                )}
            </div>

            {/* Leyenda TILOS-drenaje: iconos SVG mini con patrón por familia */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 18px 0', alignItems: 'center' }}>
                <label
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                        color: '#c7d0dc', background: '#161b23', border: '1px solid #2a323d',
                        borderRadius: 6, padding: '4px 8px', cursor: 'pointer', userSelect: 'none',
                    }}
                    title={`${hiddenAuxCount} partidas auxiliares (indirectos: suministro, transporte, seguridad, trazo, etc.)`}
                >
                    <input type="checkbox" checked={showAuxiliary} onChange={(e) => setShowAuxiliary(e.target.checked)} style={{ margin: 0, accentColor: '#3aa0ff' }} />
                    Auxiliares <small style={{ color: '#758298' }}>{hiddenAuxCount}</small>
                </label>
                <span style={{ width: 1, height: 18, background: '#2a323d', margin: '0 2px' }} />
                {familiesInScope
                    .filter((f) => showAuxiliary || !f.isAuxiliary)
                    .slice(0, 20)
                    .map((f) => {
                        const active = soloFamily === f.key;
                        return (
                            <button
                                key={f.key}
                                type="button"
                                onClick={() => setSoloFamily((prev) => (prev === f.key ? null : f.key))}
                                title={`${f.count} actividades — ${f.label}`}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 5, fontSize: 11,
                                    padding: '3px 8px 3px 4px', borderRadius: 5,
                                    background: active ? '#1e2733' : '#12161d',
                                    border: `1px solid ${active ? f.color : '#2a323d'}`,
                                    color: '#dce3ee', cursor: 'pointer', opacity: f.isAuxiliary ? 0.7 : 1,
                                }}
                            >
                                <svg width="18" height="10" viewBox="0 0 18 10">
                                    <rect x="0" y="0" width="18" height="10" fill={f.color} opacity="0.15" />
                                    <line x1="0" y1="5" x2="18" y2="5" stroke={f.color} strokeWidth="2" />
                                </svg>
                                <span style={{ color: '#c7d0dc' }}>{f.label}</span>
                                <small style={{ color: '#758298' }}>{f.count}</small>
                            </button>
                        );
                    })}
            </div>

            <div className="lob4d-content-scroll">
                <div className="lob4d-chart-shell" style={{ position: 'relative' }}>
                    {(() => {
                        const seg = selectedCode ? visibleSegments.find((s) => s.codigo === selectedCode) : null;
                        if (!seg) return null;
                        return (
                            <ProgressDashboard
                                seg={seg}
                                colorFamily={colorOf.get(seg.family) || '#8d98a8'}
                                onClose={() => onPartidaSelect?.(null)}
                                onJumpDate={onJumpDate}
                                onShow3D={onShow3D}
                            />
                        );
                    })()}
                    <svg className="lob4d-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Línea de balance tiempo por ubicación">
                        {svgPatternDefs()}
                        <rect x="0" y="0" width={width} height={height} fill={T.bg} />

                        {/* Sector Profile — perfil vertical del eje activo como fondo (estilo TILOS) */}
                        {lob.locationBased && sectorPath && (() => {
                            const zMin = Math.min(...sectorPath.pts.map((p) => p.z));
                            const zMax = Math.max(...sectorPath.pts.map((p) => p.z));
                            const zSpan = Math.max(1, zMax - zMin);
                            const xOf = (z) => sectorX + ((z - zMin) / zSpan) * SECTOR_W;
                            const filtered = sectorPath.pts.filter((p) => p.s >= lob.stationDomain.min - 1 && p.s <= lob.stationDomain.max + 1);
                            if (filtered.length < 2) return null;
                            let d = `M ${sectorX} ${yStation(filtered[0].s)} `;
                            filtered.forEach((p, i) => { d += `${i === 0 ? 'M' : 'L'} ${xOf(p.z).toFixed(1)} ${yStation(p.s).toFixed(1)} `; });
                            d += `L ${sectorX} ${yStation(filtered[filtered.length - 1].s)} Z`;
                            return (
                                <g>
                                    <rect x={sectorX} y={top} width={SECTOR_W} height={chartBottomY - top}
                                          fill={T.sectorBg} stroke={T.sectorBorder} />
                                    {/* área de terreno */}
                                    <path d={d} fill="rgba(139,158,84,0.20)" stroke="#8b9e54" strokeWidth="0.9" opacity="0.9" />
                                    {/* etiquetas mín/máx elevación */}
                                    <text x={sectorX + 2} y={top + 9} fill="#8b9e54" fontSize="8" fontFamily="Consolas, monospace">
                                        {zMax.toFixed(0)}m
                                    </text>
                                    <text x={sectorX + 2} y={chartBottomY - 3} fill="#8b9e54" fontSize="8" fontFamily="Consolas, monospace">
                                        {zMin.toFixed(0)}m
                                    </text>
                                    <text x={sectorX + SECTOR_W / 2} y={top - 4} fill="#8b9e54" fontSize="8"
                                          textAnchor="middle" fontFamily="Consolas, monospace">
                                        Perfil {sectorPath.name?.slice(0, 10) || ''}
                                    </text>
                                </g>
                            );
                        })()}

                        {/* Grid TILOS: menor cada N m, mayor cada 5N con etiqueta */}
                        {lob.locationBased ? stationTicks.map((tick) => (
                            <g key={tick.station}>
                                <line
                                    x1={left} y1={tick.y} x2={width - right} y2={tick.y}
                                    stroke={tick.major ? T.gridMajor : T.gridMinor}
                                    strokeWidth={tick.major ? 0.9 : 0.5}
                                />
                                {tick.major && (
                                    <text x={left - 10} y={tick.y + 4} fill={T.pkMajor} fontSize="11" textAnchor="end" fontFamily="Consolas, monospace">
                                        {formatPk(tick.station)}
                                    </text>
                                )}
                                {!tick.major && (
                                    <text x={left - 8} y={tick.y + 3} fill={T.pkMinor} fontSize="8.5" textAnchor="end" fontFamily="Consolas, monospace">
                                        {formatPk(tick.station)}
                                    </text>
                                )}
                            </g>
                        )) : activeZones.map((zone, i) => (
                            <g
                                key={zone.code}
                                onClick={() => setFocusZone(focus === zone.code ? null : zone.code)}
                                style={{ cursor: 'pointer' }}
                            >
                                <rect
                                    x={left} y={top + i * rowH}
                                    width={innerW} height={rowH}
                                    fill={i % 2 ? T.band : 'transparent'}
                                />
                                <line x1={left} y1={top + (i + 1) * rowH} x2={width - right} y2={top + (i + 1) * rowH} stroke={T.gridSoft} />
                                <text x={16} y={top + i * rowH + rowH / 2 - 8} fill={T.zoneCode} fontSize="11" fontFamily="Consolas, monospace">
                                    {zone.code}
                                    <title>Clic: filtrar todo el 4D a esta rama ({zone.code})</title>
                                </text>
                                <text x={16} y={top + i * rowH + rowH / 2 + 5} fill={T.zoneName} fontSize="10.5">
                                    {String(zone.name || '').slice(0, 34)}
                                </text>
                                {/* Estado de la calle: barra de avance + ✔ hechas ▶ en curso ◻ faltan */}
                                {(() => {
                                    const st = zoneStatus.get(zone.code);
                                    if (!st) return null;
                                    const barW = 130;
                                    const by = top + i * rowH + rowH / 2 + 12;
                                    return (
                                        <g>
                                            <rect x={16} y={by} width={barW} height={5} rx={2.5} fill={T.gridSoft} />
                                            <rect x={16} y={by} width={Math.max(1, barW * Math.min(100, st.pct) / 100)} height={5} rx={2.5} fill="#22c55e" />
                                            <text x={16 + barW + 6} y={by + 5.5} fill={T.zoneName} fontSize="9.5" fontFamily="Consolas, monospace">
                                                {`${st.pct.toFixed(0)}% · ✔${st.done} ▶${st.run} ◻${st.pend}${st.late ? ` ⚠${st.late}` : ''}`}
                                            </text>
                                            <title>{`${st.pct.toFixed(1)}% avance ponderado · ${st.done} ejecutadas · ${st.run} en curso · ${st.pend} sin iniciar${st.late ? ` · ${st.late} vencidas` : ''}`}</title>
                                        </g>
                                    );
                                })()}
                            </g>
                        ))}

                        {/* Ticks de tiempo */}
                        {ticks.map((tick) => (
                            <g key={tick.t}>
                                <line x1={tick.x} y1={top} x2={tick.x} y2={chartBottomY} stroke={T.gridSoft} />
                                <text x={tick.x} y={height - 20} fill={T.tickText} fontSize="12" textAnchor="middle">{tick.label}</text>
                            </g>
                        ))}

                        {/* HAMMOCKS estilo TILOS: rectángulo padre envolviendo las partidas
                            de un mismo paño (CodigoPlaneamiento). Se dibuja PRIMERO para
                            que quede detrás de los trazos individuales. */}
                        {(lob.hammocks || [])
                            .filter((h) => !soloFamily || h.family === soloFamily)
                            .map((h) => {
                                const color = colorOf.get(h.family) || '#8d98a8';
                                const x1 = x(h.start); const x2 = x(h.finish);
                                const y1 = lob.locationBased && h.hasStation ? yStation(h.stationMin) : yTop(h.zone);
                                const y2 = lob.locationBased && h.hasStation ? yStation(h.stationMax) : yBot(h.zone);
                                return (
                                    <g key={`hammock-${h.activity_id}`}>
                                        <title>
                                            {`Hammock ${h.activity_id}\n${h.children.length} partidas · ${formatDate(new Date(h.start).toISOString())} → ${formatDate(new Date(h.finish).toISOString())}\navance ${h.realPct.toFixed(0)}%`}
                                        </title>
                                        <rect
                                            x={Math.min(x1, x2)} y={Math.min(y1, y2)}
                                            width={Math.abs(x2 - x1)} height={Math.max(4, Math.abs(y2 - y1))}
                                            fill={color} opacity="0.06"
                                            stroke={color} strokeWidth="0.8" strokeOpacity="0.35"
                                            strokeDasharray="2 3"
                                            rx="3"
                                        />
                                        {/* etiqueta solo si el bloque es ancho (evita colisiones) */}
                                        {Math.abs(x2 - x1) > 70 && (
                                            <text
                                                x={Math.min(x1, x2) + 4}
                                                y={Math.min(y1, y2) + 10}
                                                fill={color} fontSize="8.5" opacity="0.55"
                                                fontFamily="Consolas, monospace"
                                            >
                                                {h.activity_id}
                                            </text>
                                        )}
                                    </g>
                                );
                            })}

                        {/* Trazos LOB estilo TILOS: PLAN + REAL + brecha visible.
                            El color SIEMPRE es el de la familia (la secuencia se lee);
                            vencida = anillo rojo al fin del plan, no trazo rojo entero. */}
                        {visibleSegments.map((seg, i) => {
                            const color = seg.taxonomy?.color || colorOf.get(seg.family) || '#8d98a8';
                            const dimmed = selectedCode && selectedCode !== seg.codigo;
                            let y1; let y2;
                            if (lob.locationBased) {
                                y1 = yStation(seg.stationStart);
                                y2 = yStation(seg.stationEnd);
                            } else {
                                const lane = laneRange(seg.zone, seg.taxonomy?.flow);
                                y1 = lane.yBotL;
                                y2 = lane.yTopL;
                            }
                            const x1 = x(seg.start); const x2 = x(seg.finish);

                            // Punto "REAL aquí" — interpolación por %real sobre el segmento plan
                            const p = Math.max(0, Math.min(1, (seg.realPct || 0) / 100));
                            const xReal = x1 + (x2 - x1) * p;
                            const yReal = y1 + (y2 - y1) * p;

                            // Punto "PLAN aquí" — dónde debería estar hoy según el plan
                            const pp = seg.plannedPct != null ? Math.max(0, Math.min(1, seg.plannedPct / 100)) : null;
                            const xPlan = pp != null ? x1 + (x2 - x1) * pp : null;
                            const yPlan = pp != null ? y1 + (y2 - y1) * pp : null;

                            // BASELINE — línea fantasma del plan congelado (si existe)
                            const hasBaseline = seg.baselineStart != null && seg.baselineFinish != null;
                            const xB1 = hasBaseline ? x(seg.baselineStart) : null;
                            const xB2 = hasBaseline ? x(seg.baselineFinish) : null;
                            return (
                                <g
                                    key={`${seg.codigo}-${i}`}
                                    onClick={() => onPartidaSelect?.(selectedCode === seg.codigo ? null : seg.codigo)}
                                    style={{ cursor: onPartidaSelect ? 'pointer' : 'default' }}
                                >
                                    <title>
                                        {`${seg.codigo} · ${seg.descripcion || ''}\n${seg.activity_id || ''} · ${formatDate(new Date(seg.start).toISOString())} → ${formatDate(new Date(seg.finish).toISOString())}\nreal ${seg.realPct.toFixed(0)}% · plan ${seg.plannedPct?.toFixed(0) ?? '—'}%${seg.deltaMeters != null ? ` · brecha ${seg.deltaMeters.toFixed(0)} m` : ''}${hasBaseline ? `\nbaseline corrido ${seg.baselineShiftFinishDays ?? 0}d` : ''}${seg.late ? ' · VENCIDA' : ''}\nClic para dashboard`}
                                    </title>
                                    {/* BASELINE — trazo fantasma del plan congelado */}
                                    {hasBaseline && !dimmed && (
                                        <line
                                            x1={xB1} y1={y1} x2={xB2} y2={y2}
                                            stroke="#66707e" strokeWidth="1.4"
                                            strokeDasharray="4 4" opacity="0.8"
                                        >
                                            <title>{`Baseline: ${formatDate(new Date(seg.baselineStart).toISOString())} → ${formatDate(new Date(seg.baselineFinish).toISOString())}`}</title>
                                        </line>
                                    )}
                                    {/* PLAN — banda con HATCH de la familia (estilo TILOS puro);
                                        si la familia no tiene patrón, línea de color translúcida */}
                                    {DEFINED_PATTERNS.has(seg.taxonomy?.pattern) ? (
                                        <>
                                            <line
                                                x1={x1} y1={y1} x2={x2} y2={y2}
                                                stroke={`url(#lobpat-${seg.taxonomy.pattern})`}
                                                strokeWidth={selectedCode === seg.codigo ? 11 : 8}
                                                strokeLinecap="butt"
                                                opacity={dimmed ? 0.15 : 0.75}
                                            />
                                            <line
                                                x1={x1} y1={y1} x2={x2} y2={y2}
                                                stroke={color} strokeWidth="0.9"
                                                opacity={dimmed ? 0.15 : 0.5}
                                            />
                                        </>
                                    ) : (
                                        <line
                                            x1={x1} y1={y1} x2={x2} y2={y2}
                                            stroke={color} strokeWidth={selectedCode === seg.codigo ? 6 : 4}
                                            strokeLinecap="round"
                                            opacity={dimmed ? 0.12 : 0.28}
                                        />
                                    )}
                                    {/* REAL — trazo sólido hasta el punto de avance */}
                                    {p > 0.001 && (
                                        <line
                                            x1={x1} y1={y1} x2={xReal} y2={yReal}
                                            stroke={color} strokeWidth={selectedCode === seg.codigo ? 4 : 2.8}
                                            strokeLinecap="round"
                                            opacity={dimmed ? 0.25 : 1}
                                        />
                                    )}
                                    {/* Brecha plan↔real (segmento gris punteado): "cuánto te falta" */}
                                    {xPlan != null && Math.abs(xPlan - xReal) + Math.abs(yPlan - yReal) > 4 && !dimmed && (
                                        <line
                                            x1={xReal} y1={yReal} x2={xPlan} y2={yPlan}
                                            stroke="#8d98a8" strokeWidth="1.4"
                                            strokeDasharray="3 3" opacity="0.7"
                                        />
                                    )}
                                    {/* Punto REAL — círculo lleno (aquí estás) */}
                                    {p > 0.001 && (
                                        <circle
                                            cx={xReal} cy={yReal} r={selectedCode === seg.codigo ? 4.2 : 3.4}
                                            fill={color} stroke={T.bg} strokeWidth="1"
                                            opacity={dimmed ? 0.35 : 1}
                                        />
                                    )}
                                    {/* Punto PLAN — círculo hueco (aquí deberías estar) */}
                                    {xPlan != null && !dimmed && (
                                        <circle
                                            cx={xPlan} cy={yPlan} r="3.4"
                                            fill={T.holeFill} stroke={color} strokeWidth="1.6"
                                        />
                                    )}
                                    {/* Punto de fin del plan */}
                                    <circle cx={x2} cy={y2} r="2.2" fill={color} opacity={dimmed ? 0.3 : 0.85} />
                                    {/* VENCIDA: anillo rojo en el fin del plan (sin teñir el trazo) */}
                                    {seg.late && !dimmed && (
                                        <circle cx={x2} cy={y2} r="5" fill="none" stroke="#ef4444" strokeWidth="1.7">
                                            <title>VENCIDA: fin plan pasado con avance {seg.realPct.toFixed(0)}%</title>
                                        </circle>
                                    )}
                                </g>
                            );
                        })}

                        {/* Elementos PUNTUALES estilo TILOS (buzones): círculos en su PK */}
                        {punctualSegments.map((seg, i) => {
                            const color = seg.taxonomy?.color || '#dc2626';
                            let py;
                            if (lob.locationBased && seg.stationStart != null) {
                                py = yStation((seg.stationStart + (seg.stationEnd ?? seg.stationStart)) / 2);
                            } else {
                                const lane = laneRange(seg.zone, seg.taxonomy?.flow);
                                py = (lane.yBotL + lane.yTopL) / 2;
                            }
                            // El buzón se instala como HITO en su fecha planeada (inicio del rango)
                            const px = x(seg.start);
                            const pReal = Math.max(0, Math.min(1, (seg.realPct || 0) / 100));
                            const done = pReal >= 0.995;
                            return (
                                <g
                                    key={`pt-${seg.codigo}-${i}`}
                                    onClick={() => onPartidaSelect?.(selectedCode === seg.codigo ? null : seg.codigo)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <title>{`${seg.codigo} · ${seg.descripcion || ''}\n${formatDate(new Date(seg.start).toISOString())}${lob.locationBased && seg.stationStart != null ? ` · ${formatPk(seg.stationStart)}` : ''}\nreal ${seg.realPct.toFixed(0)}%`}</title>
                                    {/* halo */}
                                    <circle cx={px} cy={py} r={selectedCode === seg.codigo ? 8 : 6}
                                            fill={color} opacity="0.15" />
                                    {/* borde */}
                                    <circle cx={px} cy={py} r="4"
                                            fill={done ? color : '#10141a'}
                                            stroke={color} strokeWidth="1.8" />
                                    {/* punto interno si ejecutado */}
                                    {done && <circle cx={px} cy={py} r="1.4" fill="#10141a" />}
                                </g>
                            );
                        })}

                        {/* Línea de corte (fecha de simulación) */}
                        {(lob.conflicts || []).slice(0, 40).map((conflict, index) => {
                            const middleTime = (conflict.start + conflict.finish) / 2;
                            const conflictY = lob.locationBased
                                ? yStation((conflict.stationStart + conflict.stationEnd) / 2)
                                : (yTop(conflict.a.zone) + yBot(conflict.a.zone)) / 2;
                            return (
                                <g
                                    key={`${conflict.a.codigo}-${conflict.b.codigo}-${index}`}
                                    onClick={() => onPartidaSelect?.(conflict.a.codigo)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <circle cx={x(middleTime)} cy={conflictY} r="7" fill="#10141a" stroke="#ef4444" strokeWidth="2" />
                                    <path
                                        d={`M${x(middleTime) - 3},${conflictY - 3} L${x(middleTime) + 3},${conflictY + 3} M${x(middleTime) + 3},${conflictY - 3} L${x(middleTime) - 3},${conflictY + 3}`}
                                        stroke="#ef4444"
                                        strokeWidth="1.5"
                                    >
                                        <title>{`Conflicto potencial\n${conflict.a.codigo} / ${conflict.b.codigo}\n${formatDate(new Date(conflict.start).toISOString())} - ${formatDate(new Date(conflict.finish).toISOString())}`}</title>
                                    </path>
                                </g>
                            );
                        })}

                        {cutX != null && (
                            <g>
                                <line x1={cutX} y1={top - 12} x2={cutX} y2={chartBottomY + histH + 6} stroke="#ef4444" strokeWidth="2" />
                                <text x={cutX + 6} y={top - 16} fill="#ef4444" fontSize="11" fontWeight="800">
                                    {simulationState?.dateLabel}
                                </text>
                            </g>
                        )}

                        {/* HISTOGRAMA + DOBLE CURVA S estilo Primavera/TILOS/Bexel:
                            Barras azules = PV semanal (plan) · barras verdes = EV semanal
                            (real); línea azul = Curva-S PLAN acumulada · línea verde =
                            Curva-S REAL. Brecha vertical entre curvas a "hoy" = SV visible. */}
                        {lob.histogram && (() => {
                            const { bucketMs, startBucket, bins, binsReal, maxBin, totalMetrado } = lob.histogram;
                            const barY0 = chartBottomY + 10;
                            const barMaxH = histH - 22;
                            const pathOf = (arr) => arr.map((v, i) => {
                                const t = startBucket + (i + 0.5) * bucketMs;
                                return `${i === 0 ? 'M' : 'L'}${x(t).toFixed(1)},${(barY0 + barMaxH - v * barMaxH).toFixed(1)}`;
                            }).join(' ');
                            const pathPlan = pathOf(lob.curveSPlan || []);
                            const pathReal = pathOf(lob.curveSReal || []);
                            return (
                                <g>
                                    <rect x={left} y={chartBottomY + 4} width={innerW} height={histH - 8}
                                          fill={T.histBg} stroke={T.histBorder} />
                                    {/* barras PV (plan) — azules translúcidas */}
                                    {bins.map((v, i) => {
                                        if (v <= 0) return null;
                                        const t0 = startBucket + i * bucketMs;
                                        const t1 = t0 + bucketMs;
                                        if (t1 <= dom.min || t0 >= dom.max) return null;
                                        const bx = x(Math.max(t0, dom.min));
                                        const bw = Math.max(0.8, x(Math.min(t1, dom.max)) - bx - 1);
                                        const bh = (v / maxBin) * barMaxH;
                                        return <rect key={`p${i}`} x={bx} y={barY0 + barMaxH - bh}
                                                     width={bw} height={bh}
                                                     fill="#3aa0ff" opacity="0.35" />;
                                    })}
                                    {/* barras EV (real) — verdes sólidas encima */}
                                    {(binsReal || []).map((v, i) => {
                                        if (v <= 0) return null;
                                        const t0 = startBucket + i * bucketMs;
                                        const t1 = t0 + bucketMs;
                                        if (t1 <= dom.min || t0 >= dom.max) return null;
                                        const bx = x(Math.max(t0, dom.min));
                                        const bw = Math.max(0.8, x(Math.min(t1, dom.max)) - bx - 1);
                                        const bh = (v / maxBin) * barMaxH;
                                        return <rect key={`r${i}`} x={bx + bw * 0.15} y={barY0 + barMaxH - bh}
                                                     width={bw * 0.7} height={bh}
                                                     fill="#22c55e" opacity="0.75" />;
                                    })}
                                    {/* curva S plan (azul) */}
                                    {pathPlan && <path d={pathPlan} fill="none" stroke="#3aa0ff" strokeWidth="1.8" opacity="0.9" />}
                                    {/* curva S real (verde) */}
                                    {pathReal && <path d={pathReal} fill="none" stroke="#22c55e" strokeWidth="2" />}
                                    {/* etiquetas */}
                                    <text x={left + 6} y={chartBottomY + 16} fill={T.histLabel} fontSize="10">
                                        PV / EV semanal · Curva-S Plan vs Real
                                    </text>
                                    <text x={width - right - 6} y={chartBottomY + 16} fill={T.histLabel} fontSize="10" textAnchor="end">
                                        {`Σ plan ${totalMetrado.toFixed(0)} · pico/sem ${maxBin.toFixed(0)}`}
                                    </text>
                                </g>
                            );
                        })()}
                    </svg>
                </div>
                <div style={{ marginTop: 10, color: '#8793a5', fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <svg width="34" height="10"><line x1="1" y1="5" x2="33" y2="5" stroke="#9ca3af" strokeWidth="4" opacity="0.4" /></svg>
                        Plan (baseline)
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <svg width="34" height="10"><line x1="1" y1="5" x2="33" y2="5" stroke="#e5e7eb" strokeWidth="2.8" /></svg>
                        Real
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <svg width="12" height="12"><circle cx="6" cy="6" r="3.4" fill="#e5e7eb" /></svg>
                        avance real
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <svg width="12" height="12"><circle cx="6" cy="6" r="3.4" fill="#10141a" stroke="#e5e7eb" strokeWidth="1.6" /></svg>
                        plan a hoy
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <svg width="34" height="10"><line x1="1" y1="5" x2="33" y2="5" stroke="#8d98a8" strokeWidth="1.4" strokeDasharray="3 3" /></svg>
                        brecha
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <svg width="14" height="14"><circle cx="7" cy="7" r="4" fill="#10141a" stroke="#dc2626" strokeWidth="1.8" /></svg>
                        buzón
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="none" stroke="#ef4444" strokeWidth="1.7" /></svg>
                        vencida
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#8d98a8' }}>
                        Secuencia en cada calle (abajo→arriba): excav → refine → cama → tubería → relleno → concreto
                    </span>
                    <span style={{ marginLeft: 'auto', color: '#66707e' }}>Clic en trazo → Progress Dashboard</span>
                </div>
            </div>
        </div>
    );
}
