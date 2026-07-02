import React, { useMemo } from 'react';
import { buildScheduleRows, formatDate, getDateDomain, numberText } from './lob4dUtils';

const COLORS = ['#f59e0b', '#3aa0ff', '#22c55e', '#8b5cf6', '#eab308', '#ef4444', '#14b8a6'];

const safeTime = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00`).getTime();

export default function LineBalanceView({ lobData, activeFrente, simulationState }) {
    const rows = useMemo(() => buildScheduleRows(lobData, activeFrente), [lobData, activeFrente]);
    const domain = useMemo(() => getDateDomain(rows), [rows]);

    const chartRows = useMemo(() => {
        return rows
            .filter((row) => row.start && row.finish)
            .sort((a, b) => (a.orden || 0) - (b.orden || 0) || String(a.codigo).localeCompare(String(b.codigo), undefined, { numeric: true }))
            .slice(0, 36);
    }, [rows]);

    const kpi = useMemo(() => {
        const withDates = rows.filter((row) => row.start && row.finish).length;
        const linked = rows.filter((row) => row.activity_id).length;
        return { total: rows.length, withDates, linked };
    }, [rows]);

    if (!domain || !chartRows.length) {
        return (
            <div className="lob4d-workspace-view">
                <div className="lob4d-view-header">
                    <div>
                        <div className="lob4d-view-title">Linea de Balance</div>
                        <div className="lob4d-view-copy">Se activara cuando el timeline tenga fechas P6 vinculadas.</div>
                    </div>
                </div>
                <div className="lob4d-content-scroll">
                    <div className="lob4d-empty">No hay actividades con fechas para graficar.</div>
                </div>
            </div>
        );
    }

    const width = 1200;
    const height = Math.max(520, chartRows.length * 26 + 110);
    const left = 170;
    const right = 36;
    const top = 42;
    const bottom = 56;
    const innerW = width - left - right;
    const innerH = height - top - bottom;
    const span = Math.max(1, domain.max - domain.min);
    const x = (time) => left + ((time - domain.min) / span) * innerW;
    const y = (index) => top + (index / Math.max(1, chartRows.length - 1)) * innerH;
    const nowX = simulationState?.date ? x(simulationState.date.getTime()) : null;

    const tickCount = 6;
    const ticks = Array.from({ length: tickCount }, (_, i) => {
        const t = domain.min + (span * i) / (tickCount - 1);
        return { t, x: x(t), label: formatDate(new Date(t).toISOString()) };
    });

    return (
        <div className="lob4d-workspace-view">
            <div className="lob4d-view-header">
                <div>
                    <div className="lob4d-view-title">Linea de Balance</div>
                    <div className="lob4d-view-copy">Actividades P6 contra el orden EDT. Base lista para mapear a PK por partida.</div>
                </div>
                <div className="lob4d-topbar-spacer" />
                <div className="lob4d-label">Actividades</div>
                <strong>{kpi.withDates}/{kpi.total}</strong>
            </div>
            <div className="lob4d-content-scroll">
                <div className="lob4d-chart-shell">
                    <svg className="lob4d-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Linea de balance 4D">
                        <rect x="0" y="0" width={width} height={height} fill="#10141a" />
                        {ticks.map((tick) => (
                            <g key={tick.t}>
                                <line x1={tick.x} y1={top - 14} x2={tick.x} y2={height - bottom + 8} stroke="rgba(255,255,255,0.08)" />
                                <text x={tick.x} y={height - 22} fill="#8793a5" fontSize="12" textAnchor="middle">{tick.label}</text>
                            </g>
                        ))}
                        {chartRows.map((row, index) => (
                            <g key={row.codigo}>
                                <line x1={left - 12} y1={y(index)} x2={width - right} y2={y(index)} stroke="rgba(255,255,255,0.045)" />
                                <text x={16} y={y(index) + 4} fill="#8ecbff" fontSize="11" fontFamily="Consolas, monospace">{row.codigo}</text>
                                <text x={88} y={y(index) + 4} fill="#d8dee8" fontSize="11">
                                    {String(row.descripcion || '').slice(0, 34)}
                                </text>
                                <line
                                    x1={x(safeTime(row.start))}
                                    y1={y(index)}
                                    x2={x(safeTime(row.finish))}
                                    y2={y(index)}
                                    stroke={COLORS[index % COLORS.length]}
                                    strokeWidth="8"
                                    strokeLinecap="round"
                                    opacity="0.82"
                                />
                                <circle cx={x(safeTime(row.start))} cy={y(index)} r="4" fill="#11161d" stroke={COLORS[index % COLORS.length]} strokeWidth="2" />
                                <circle cx={x(safeTime(row.finish))} cy={y(index)} r="4" fill="#11161d" stroke={COLORS[index % COLORS.length]} strokeWidth="2" />
                            </g>
                        ))}
                        {nowX != null && Number.isFinite(nowX) && (
                            <g>
                                <line x1={nowX} y1={top - 20} x2={nowX} y2={height - bottom + 12} stroke="#ef4444" strokeWidth="2" />
                                <text x={nowX + 6} y={top - 24} fill="#ef4444" fontSize="11" fontWeight="800">HOY / {simulationState.dateLabel}</text>
                            </g>
                        )}
                    </svg>
                </div>
                <div style={{ marginTop: 10, color: '#8793a5', fontSize: 12 }}>
                    {kpi.linked} actividades tienen Activity ID. Avance fisico global actual: {numberText(simulationState?.progress, 1)}%.
                </div>
            </div>
        </div>
    );
}
