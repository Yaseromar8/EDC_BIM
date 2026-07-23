import React, { useMemo, useState } from 'react';
import { computeControlState, formatDate, money, numberText } from './lob4dUtils';

// ── CONTROL DE OBRA (1d) — programación P6 vs ejecución real, por costo ──
// Fecha de corte ajustable (default: hoy). Todo respeta el frente activo.

const DAY_MS = 86400000;

const spiColor = (spi) => {
    if (spi == null) return '#8793a5';
    if (spi >= 0.95) return '#22c55e';
    if (spi >= 0.8) return '#f59e0b';
    return '#ef4444';
};

function KpiCard({ label, value, sub, color }) {
    return (
        <div className="lob4d-mini" style={{ minWidth: 170, flex: 1 }}>
            <div className="lob4d-label">{label}</div>
            <strong style={{ display: 'block', marginTop: 8, fontSize: 22, color: color || '#e6ebf3' }}>{value}</strong>
            {sub && <div style={{ marginTop: 4, fontSize: 11, color: '#8793a5' }}>{sub}</div>}
        </div>
    );
}

function TaskList({ title, color, rows, empty, metric }) {
    return (
        <div className="lob4d-panel-section" style={{ flex: 1, minWidth: 260 }}>
            <div className="lob4d-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="lob4d-status-dot" style={{ background: color }} />
                {title} ({rows.length})
            </div>
            <div className="lob4d-task-list" style={{ maxHeight: 300, overflowY: 'auto' }}>
                {rows.length ? rows.slice(0, 14).map((row) => (
                    <div key={row.codigo} className="lob4d-task-item" title={`${row.codigo} · ${row.descripcion || ''}`}>
                        <span style={{ minWidth: 0 }}>
                            <span className="lob4d-task-name">{row.descripcion || row.codigo}</span>
                            <span className="lob4d-task-code">
                                {row.activity_id || row.codigo} · {formatDate(row.start)} → {formatDate(row.finish)}
                            </span>
                        </span>
                        <span className="lob4d-mono" style={{ color, fontSize: 11, textAlign: 'right' }}>
                            {metric(row)}
                        </span>
                    </div>
                )) : <div style={{ color: '#758298', marginTop: 10 }}>{empty}</div>}
            </div>
        </div>
    );
}

export default function ControlView({ lobData, activeFrente }) {
    const [cutMs, setCutMs] = useState(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today.getTime();
    });

    const control = useMemo(
        () => computeControlState(lobData, activeFrente, cutMs),
        [lobData, activeFrente, cutMs]
    );

    if (!control.domain) {
        return (
            <div className="lob4d-workspace-view">
                <div className="lob4d-view-header">
                    <div>
                        <div className="lob4d-view-title">Control de Obra</div>
                        <div className="lob4d-view-copy">Se activa cuando hay fechas P6 vinculadas a las partidas (Activity ID).</div>
                    </div>
                </div>
                <div className="lob4d-content-scroll">
                    <div className="lob4d-empty">Sin actividades P6 con fechas en el filtro actual.</div>
                </div>
            </div>
        );
    }

    const clampedCut = Math.max(control.domain.min, Math.min(control.domain.max, cutMs));
    const cutLabel = new Date(clampedCut).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

    // ── Curva S (SVG) ──
    const width = 1200;
    const height = 320;
    const left = 70; const right = 30; const top = 26; const bottom = 40;
    const innerW = width - left - right;
    const innerH = height - top - bottom;
    const span = Math.max(1, control.domain.max - control.domain.min);
    const maxPv = Math.max(1, control.totalConFechas);
    const x = (t) => left + ((t - control.domain.min) / span) * innerW;
    const y = (v) => top + innerH - (v / maxPv) * innerH;
    const curvePath = control.curve.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.pv).toFixed(1)}`).join(' ');
    const cutX = x(clampedCut);
    const ticks = Array.from({ length: 6 }, (_, i) => {
        const t = control.domain.min + (span * i) / 5;
        return { t, x: x(t), label: formatDate(new Date(t).toISOString()) };
    });

    return (
        <div className="lob4d-workspace-view">
            <div className="lob4d-view-header">
                <div>
                    <div className="lob4d-view-title">Control de Obra — programado vs real</div>
                    <div className="lob4d-view-copy">
                        Programación P6 ⨯ valorizaciones, ponderado por costo. {(Array.isArray(activeFrente) ? activeFrente.join(' + ') : activeFrente) || 'Todos los frentes'} ·{' '}
                        {control.partidasConFechas}/{control.partidasTotal} partidas con fechas
                        {control.sinVinculo > 0 ? ` · ${control.sinVinculo} sin vínculo P6` : ''}
                    </div>
                </div>
                <div className="lob4d-topbar-spacer" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 380 }}>
                    <span className="lob4d-label" style={{ whiteSpace: 'nowrap' }}>Fecha de corte</span>
                    <input
                        type="range"
                        className="lob4d-range"
                        min={control.domain.min}
                        max={control.domain.max}
                        step={DAY_MS}
                        value={clampedCut}
                        onChange={(event) => setCutMs(Number(event.target.value))}
                    />
                    <strong className="lob4d-mono" style={{ whiteSpace: 'nowrap' }}>{cutLabel}</strong>
                </div>
            </div>

            <div className="lob4d-content-scroll">
                {/* KPIs de valor ganado */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <KpiCard
                        label="Programado a la fecha (PV)"
                        value={money(control.pv)}
                        sub={`${numberText(control.pctProgramado, 1)}% del monto con fechas`}
                        color="#3aa0ff"
                    />
                    <KpiCard
                        label="Ejecutado real (EV)"
                        value={money(control.ev)}
                        sub={`${numberText(control.pctReal, 1)}% del contractual`}
                        color="#22c55e"
                    />
                    <KpiCard
                        label="SPI (EV/PV)"
                        value={control.spi == null ? '—' : control.spi.toFixed(2)}
                        sub={control.spi == null ? 'sin programa a la fecha'
                            : control.spi >= 0.95 ? 'ritmo según programa'
                                : control.spi >= 0.8 ? 'atención: ritmo por debajo del plan'
                                    : 'crítico: muy por debajo del plan'}
                        color={spiColor(control.spi)}
                    />
                    <KpiCard
                        label="Desviación (EV − PV)"
                        value={money(control.desviacion)}
                        sub={control.desviacion >= 0 ? 'adelanto acumulado' : 'atraso acumulado en valor'}
                        color={control.desviacion >= 0 ? '#22c55e' : '#ef4444'}
                    />
                </div>

                {/* Curva S programada + corte */}
                <div className="lob4d-chart-shell" style={{ marginTop: 14 }}>
                    <svg className="lob4d-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Curva S programada">
                        <rect x="0" y="0" width={width} height={height} fill="#10141a" />
                        {ticks.map((tick) => (
                            <g key={tick.t}>
                                <line x1={tick.x} y1={top} x2={tick.x} y2={height - bottom} stroke="rgba(255,255,255,0.06)" />
                                <text x={tick.x} y={height - 14} fill="#8793a5" fontSize="12" textAnchor="middle">{tick.label}</text>
                            </g>
                        ))}
                        {[0.25, 0.5, 0.75, 1].map((f) => (
                            <g key={f}>
                                <line x1={left} y1={y(maxPv * f)} x2={width - right} y2={y(maxPv * f)} stroke="rgba(255,255,255,0.05)" />
                                <text x={left - 8} y={y(maxPv * f) + 4} fill="#8793a5" fontSize="11" textAnchor="end">{Math.round(f * 100)}%</text>
                            </g>
                        ))}
                        {/* Curva PV */}
                        <path d={curvePath} fill="none" stroke="#3aa0ff" strokeWidth="2.5" />
                        {/* Corte: línea + PV y EV en el corte */}
                        <line x1={cutX} y1={top - 6} x2={cutX} y2={height - bottom} stroke="#ef4444" strokeWidth="2" />
                        <circle cx={cutX} cy={y(control.pv)} r="5" fill="#3aa0ff" stroke="#10141a" strokeWidth="2" />
                        <circle cx={cutX} cy={y(Math.min(maxPv, control.ev))} r="5" fill="#22c55e" stroke="#10141a" strokeWidth="2" />
                        <text x={cutX + 8} y={top + 8} fill="#ef4444" fontSize="11" fontWeight="800">CORTE · {cutLabel}</text>
                        <text x={cutX + 8} y={y(control.pv) - 8} fill="#3aa0ff" fontSize="11">PV {money(control.pv)}</text>
                        <text x={cutX + 8} y={y(Math.min(maxPv, control.ev)) + 16} fill="#22c55e" fontSize="11">EV {money(control.ev)}</text>
                    </svg>
                </div>

                {/* Semáforo accionable */}
                <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
                    <TaskList
                        title="Atrasadas (mayor impacto primero)"
                        color="#ef4444"
                        rows={control.late}
                        empty="Sin partidas atrasadas a esta fecha. ✔"
                        metric={(row) => row.delayDays
                            ? `${row.delayDays} d vencida · ${numberText(row.realPct, 0)}%`
                            : `brecha ${numberText(row.gap, 0)} pts · ${numberText(row.realPct, 0)}%`}
                    />
                    <TaskList
                        title="En curso según programa"
                        color="#f59e0b"
                        rows={control.executing}
                        empty="Nada en ventana de ejecución a esta fecha."
                        metric={(row) => `plan ${numberText(row.plannedPct, 0)}% · real ${numberText(row.realPct, 0)}%`}
                    />
                    <TaskList
                        title="Inician en ≤ 14 días"
                        color="#3aa0ff"
                        rows={control.upcoming}
                        empty="Sin inicios programados en los próximos 14 días."
                        metric={(row) => `en ${row.inDays} d`}
                    />
                </div>

                <div style={{ marginTop: 12, color: '#8793a5', fontSize: 12 }}>
                    PV se calcula interpolando las fechas P6 de cada partida (ponderado por metrado × PU); EV es el valorizado real
                    acumulado. Las listas muestran hasta 14 partidas cada una, ordenadas por impacto.
                </div>
            </div>
        </div>
    );
}
