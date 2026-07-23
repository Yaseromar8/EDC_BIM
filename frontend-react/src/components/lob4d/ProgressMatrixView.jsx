import React, { useMemo } from 'react';
import { getFilteredPartidas, getMaxPeriod, numberText, statusColor } from './lob4dUtils';

const statusAtPeriod = (partida, avance, period) => {
    const periods = avance?.[partida.codigo] || {};
    const metrado = Number(partida.metrado || 0);
    let previous = 0;
    let current = 0;
    let future = 0;

    Object.entries(periods).forEach(([key, value]) => {
        const p = Number(key);
        const amount = Number(value || 0);
        if (p < period) previous += amount;
        else if (p === period) current += amount;
        else future += amount;
    });

    if (metrado > 0 && previous >= metrado * 0.995) return 'done';
    if (current > 0 || previous > 0) return 'executing';
    if (future > 0) return 'planned';
    return 'pending';
};

export default function ProgressMatrixView({
    lobData,
    activeFrente,
    simulationState,
    selectedCode,
    onPartidaSelect,
}) {
    const maxPeriod = getMaxPeriod(lobData);
    const periods = Array.from({ length: maxPeriod }, (_, index) => index + 1);
    const rows = useMemo(() => {
        const sorted = getFilteredPartidas(lobData, activeFrente)
            .filter((partida) => partida.activity_id || lobData?.avance?.[partida.codigo])
            .sort((a, b) => (a.orden || 0) - (b.orden || 0) || String(a.codigo).localeCompare(String(b.codigo), undefined, { numeric: true }));
        const firstRows = sorted.slice(0, 32);
        if (!selectedCode || firstRows.some((partida) => partida.codigo === selectedCode)) return firstRows;
        const selected = sorted.find((partida) => partida.codigo === selectedCode);
        return selected ? [selected, ...firstRows.slice(0, 31)] : firstRows;
    }, [lobData, activeFrente, selectedCode]);

    return (
        <div className="lob4d-workspace-view">
            <div className="lob4d-view-header">
                <div>
                    <div className="lob4d-view-title">Matriz de Avance</div>
                    <div className="lob4d-view-copy">Estado por partida y valorizacion, alimentado por los mismos datos que colorean el visor.</div>
                </div>
                <div className="lob4d-topbar-spacer" />
                <div className="lob4d-label">Periodo activo</div>
                <strong>VAL {String(simulationState?.current || 1).padStart(2, '0')}</strong>
            </div>

            <div className="lob4d-content-scroll">
                <div style={{ overflow: 'auto' }}>
                    <div className="lob4d-matrix" style={{ '--lob-periods': periods.length }}>
                        <div className="lob4d-matrix-row">
                            <div className="lob4d-matrix-cell header label">Actividad / Partida</div>
                            {periods.map((period) => (
                                <div key={period} className="lob4d-matrix-cell header">
                                    VAL {String(period).padStart(2, '0')}
                                </div>
                            ))}
                        </div>

                        {rows.map((partida) => (
                            <div
                                key={partida.codigo}
                                className={`lob4d-matrix-row${selectedCode === partida.codigo ? ' selected' : ''}`}
                                onClick={() => onPartidaSelect?.(selectedCode === partida.codigo ? null : partida.codigo)}
                            >
                                <div className="lob4d-matrix-cell label" title={partida.descripcion}>
                                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        <span className="lob4d-mono" style={{ color: '#8ecbff', marginRight: 8 }}>{partida.codigo}</span>
                                        {partida.descripcion || partida.activity_id || '-'}
                                    </span>
                                </div>
                                {periods.map((period) => {
                                    const status = statusAtPeriod(partida, lobData?.avance, period);
                                    const value = lobData?.avance?.[partida.codigo]?.[String(period)];
                                    return (
                                        <div
                                            key={`${partida.codigo}-${period}`}
                                            className="lob4d-matrix-cell"
                                            style={{ background: statusColor(status), color: status === 'pending' ? '#7a8493' : '#071018', fontWeight: 900 }}
                                            title={`${partida.codigo} / VAL ${period}: ${status}`}
                                        >
                                            {value ? numberText(value, 0) : ''}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14, color: '#aab4c3' }}>
                    {[
                        ['Ejecutado', 'done'],
                        ['En ejecucion', 'executing'],
                        ['Programado', 'planned'],
                        ['Pendiente', 'pending'],
                    ].map(([label, status]) => (
                        <span key={status} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span className="lob4d-status-dot" style={{ background: statusColor(status) }} />
                            {label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
