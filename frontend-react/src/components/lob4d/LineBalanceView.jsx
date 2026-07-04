import React, { useMemo, useState } from 'react';
import { buildLobSeries, formatDate } from './lob4dUtils';

// ── LÍNEA DE BALANCE profesional: Tiempo (X) × Ubicación (Y) ──
// Y = zonas del EDT (ramas nivel 2, con sus nombres reales de título).
// Cada familia de actividad = una serie de trazos diagonales por zona
// (inicio→fin): la PENDIENTE es el ritmo. Rojo = vencida sin avance.
// Leyenda clicable para aislar familias. Línea de corte = fecha de simulación.

const COLORS = ['#f59e0b', '#3aa0ff', '#22c55e', '#8b5cf6', '#eab308', '#14b8a6', '#fb7185', '#a3e635', '#22d3ee', '#c084fc'];

export default function LineBalanceView({ lobData, activeFrente, simulationState }) {
    const atMs = simulationState?.date ? simulationState.date.getTime() : null;
    const lob = useMemo(() => buildLobSeries(lobData, activeFrente, atMs), [lobData, activeFrente, atMs]);
    const [soloFamily, setSoloFamily] = useState(null);

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

    const colorOf = new Map(lob.families.map((f, i) => [f.name, COLORS[i % COLORS.length]]));
    const visibleSegments = lob.segments.filter((s) => !soloFamily || s.family === soloFamily);

    // Layout
    const width = 1240;
    const rowH = 46;
    const left = 250; const right = 34; const top = 34; const bottom = 54;
    const height = top + bottom + lob.zones.length * rowH;
    const innerW = width - left - right;
    const span = Math.max(1, lob.domain.max - lob.domain.min);
    const x = (t) => left + ((t - lob.domain.min) / span) * innerW;
    const zoneIndex = new Map(lob.zones.map((z, i) => [z.code, i]));
    const yTop = (zone) => top + zoneIndex.get(zone) * rowH + 7;
    const yBot = (zone) => top + zoneIndex.get(zone) * rowH + rowH - 7;

    const ticks = Array.from({ length: 7 }, (_, i) => {
        const t = lob.domain.min + (span * i) / 6;
        return { t, x: x(t), label: formatDate(new Date(t).toISOString()) };
    });
    const cutX = atMs != null && atMs >= lob.domain.min && atMs <= lob.domain.max ? x(atMs) : null;
    const lateCount = lob.segments.filter((s) => s.late).length;

    return (
        <div className="lob4d-workspace-view">
            <div className="lob4d-view-header">
                <div>
                    <div className="lob4d-view-title">Linea de Balance — Tiempo × Ubicación</div>
                    <div className="lob4d-view-copy">
                        {lob.zones.length} zonas EDT · {lob.segments.length} actividades con fechas P6 · la pendiente de cada
                        trazo es el ritmo de la cuadrilla{lateCount ? ` · ${lateCount} vencidas sin cerrar` : ''}
                    </div>
                </div>
                <div className="lob4d-topbar-spacer" />
                {soloFamily && (
                    <button type="button" className="lob4d-button ghost" onClick={() => setSoloFamily(null)}>
                        Ver todas
                    </button>
                )}
            </div>

            {/* Leyenda clicable (aislar familia) */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 18px 0' }}>
                {lob.families.slice(0, 12).map((f) => (
                    <button
                        key={f.name}
                        type="button"
                        className={`lob4d-front-button${soloFamily === f.name ? ' active' : ''}`}
                        onClick={() => setSoloFamily((prev) => (prev === f.name ? null : f.name))}
                        style={{ display: 'flex', alignItems: 'center', gap: 7 }}
                        title={`${f.count} actividades`}
                    >
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: colorOf.get(f.name) }} />
                        {f.name} <small style={{ color: '#758298' }}>{f.count}</small>
                    </button>
                ))}
            </div>

            <div className="lob4d-content-scroll">
                <div className="lob4d-chart-shell">
                    <svg className="lob4d-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Línea de balance tiempo por ubicación">
                        <rect x="0" y="0" width={width} height={height} fill="#10141a" />

                        {/* Bandas de zona + nombres */}
                        {lob.zones.map((zone, i) => (
                            <g key={zone.code}>
                                <rect
                                    x={left} y={top + i * rowH}
                                    width={innerW} height={rowH}
                                    fill={i % 2 ? 'rgba(255,255,255,0.018)' : 'transparent'}
                                />
                                <line x1={left} y1={top + (i + 1) * rowH} x2={width - right} y2={top + (i + 1) * rowH} stroke="rgba(255,255,255,0.06)" />
                                <text x={16} y={top + i * rowH + rowH / 2 - 3} fill="#8ecbff" fontSize="11" fontFamily="Consolas, monospace">{zone.code}</text>
                                <text x={16} y={top + i * rowH + rowH / 2 + 12} fill="#8d98a8" fontSize="10.5">
                                    {String(zone.name || '').slice(0, 36)}
                                </text>
                            </g>
                        ))}

                        {/* Ticks de tiempo */}
                        {ticks.map((tick) => (
                            <g key={tick.t}>
                                <line x1={tick.x} y1={top} x2={tick.x} y2={height - bottom} stroke="rgba(255,255,255,0.06)" />
                                <text x={tick.x} y={height - 20} fill="#8793a5" fontSize="12" textAnchor="middle">{tick.label}</text>
                            </g>
                        ))}

                        {/* Trazos LOB: diagonal inicio→fin dentro de la banda de su zona */}
                        {visibleSegments.map((seg, i) => {
                            const color = seg.late ? '#ef4444' : (colorOf.get(seg.family) || '#8d98a8');
                            return (
                                <g key={`${seg.codigo}-${i}`}>
                                    <line
                                        x1={x(seg.start)} y1={yBot(seg.zone)}
                                        x2={x(seg.finish)} y2={yTop(seg.zone)}
                                        stroke={color}
                                        strokeWidth={seg.late ? 3.4 : 2.6}
                                        strokeLinecap="round"
                                        opacity={seg.late ? 1 : 0.85}
                                    >
                                        <title>
                                            {`${seg.codigo} · ${seg.descripcion || ''}\n${seg.activity_id || ''} · ${formatDate(new Date(seg.start).toISOString())} → ${formatDate(new Date(seg.finish).toISOString())}\nreal ${seg.realPct.toFixed(0)}%${seg.late ? ' · VENCIDA' : ''}`}
                                        </title>
                                    </line>
                                    <circle cx={x(seg.finish)} cy={yTop(seg.zone)} r="2.6" fill={color} />
                                </g>
                            );
                        })}

                        {/* Línea de corte (fecha de simulación) */}
                        {cutX != null && (
                            <g>
                                <line x1={cutX} y1={top - 12} x2={cutX} y2={height - bottom + 6} stroke="#ef4444" strokeWidth="2" />
                                <text x={cutX + 6} y={top - 16} fill="#ef4444" fontSize="11" fontWeight="800">
                                    {simulationState?.dateLabel}
                                </text>
                            </g>
                        )}
                    </svg>
                </div>
                <div style={{ marginTop: 10, color: '#8793a5', fontSize: 12 }}>
                    Cada trazo cruza su zona de abajo (inicio) hacia arriba (fin): trazos más verticales = ejecución más rápida.
                    Clic en una familia de la leyenda para aislarla. Rojo = fecha fin vencida con avance real &lt; 100%.
                </div>
            </div>
        </div>
    );
}
