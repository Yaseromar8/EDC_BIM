import React, { useEffect, useMemo, useState } from 'react';
import {
    buildEdtTree,
    flattenTree,
    formatDate,
    money,
    numberText,
    percentText,
} from './lob4dUtils';

const nodeTitle = (node) => node?.nombre || node?.descripcion || node?.codigo || '-';

function DetailPanel({ node, lobData }) {
    if (!node) {
        return (
            <div className="lob4d-detail">
                <div className="lob4d-detail-inner" style={{ color: '#758298' }}>
                    Selecciona una partida para ver metrado, valorizacion y fechas P6.
                </div>
            </div>
        );
    }

    const activity = node.activity_id ? lobData?.activities?.[node.activity_id] : null;
    const physical = node.metrado > 0 ? Math.min(100, ((node.ejecutado || 0) / node.metrado) * 100) : null;
    const periods = lobData?.avance?.[node.codigo] || {};

    return (
        <div className="lob4d-detail">
            <div className="lob4d-detail-inner">
                <div className="lob4d-label">Partida seleccionada</div>
                <div style={{ marginTop: 6, fontSize: 16, fontWeight: 900, color: '#f2f5f9', lineHeight: 1.35 }}>
                    {nodeTitle(node)}
                </div>
                <div style={{ marginTop: 8, color: '#8ecbff' }} className="lob4d-mono">
                    {node.codigo}{node.activity_id ? ` / ${node.activity_id}` : ''}
                </div>

                <div className="lob4d-mini-grid">
                    <div className="lob4d-mini">
                        <div className="lob4d-label">Cronograma P6</div>
                        <strong style={{ display: 'block', marginTop: 7, color: '#f2f5f9' }}>
                            {activity?.start ? `${formatDate(activity.start)} - ${formatDate(activity.finish)}` : 'Sin fechas'}
                        </strong>
                        <div style={{ marginTop: 5, color: '#8d98a8', fontSize: 11 }}>
                            {activity?.status || 'Sin estado P6'}
                        </div>
                    </div>
                    <div className="lob4d-mini">
                        <div className="lob4d-label">Presupuesto</div>
                        <strong style={{ display: 'block', marginTop: 7, color: '#f2f5f9' }}>
                            {money(node.contractual)}
                        </strong>
                        <div style={{ marginTop: 5, color: '#8d98a8', fontSize: 11 }}>
                            {numberText(node.metrado)} {node.unidad || ''} x {numberText(node.pu)}
                        </div>
                    </div>
                    <div className="lob4d-mini">
                        <div className="lob4d-label">Avance fisico</div>
                        <strong style={{ display: 'block', marginTop: 7, color: '#f2f5f9' }}>
                            {percentText(physical)}
                        </strong>
                        <div className="lob4d-progress-bar" style={{ marginTop: 9 }}>
                            <span style={{ width: `${Math.min(100, physical || 0)}%`, background: '#22c55e' }} />
                        </div>
                    </div>
                    <div className="lob4d-mini">
                        <div className="lob4d-label">Valorizado</div>
                        <strong style={{ display: 'block', marginTop: 7, color: '#f2f5f9' }}>
                            {money(node.valorizado)}
                        </strong>
                        <div style={{ marginTop: 5, color: '#8d98a8', fontSize: 11 }}>
                            {percentText(node.pct)}
                        </div>
                    </div>
                </div>

                {Object.keys(periods).length > 0 && (
                    <div style={{ marginTop: 16 }}>
                        <div className="lob4d-label">Ejecucion por valorizacion</div>
                        <table className="lob4d-table" style={{ marginTop: 8 }}>
                            <tbody>
                                {Object.entries(periods)
                                    .sort(([a], [b]) => Number(a) - Number(b))
                                    .map(([period, value]) => (
                                        <tr key={period}>
                                            <td>VAL {String(period).padStart(2, '0')}</td>
                                            <td style={{ textAlign: 'right' }} className="lob4d-mono">
                                                {numberText(value)} {node.unidad || ''}
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function EdtExplorer({ lobData, activeFrente }) {
    const { roots, nodes } = useMemo(() => buildEdtTree(lobData, activeFrente), [lobData, activeFrente]);
    const [expanded, setExpanded] = useState(new Set());
    const [selectedCode, setSelectedCode] = useState(null);

    useEffect(() => {
        const first = roots[0]?.codigo;
        const next = new Set();
        roots.forEach((root) => next.add(root.codigo));
        setExpanded(next);
        setSelectedCode((prev) => (prev && nodes.has(prev) ? prev : first || null));
    }, [roots, nodes]);

    const rows = useMemo(() => flattenTree(roots, expanded), [roots, expanded]);
    const selected = selectedCode ? nodes.get(selectedCode) : null;

    const totals = useMemo(() => {
        return roots.reduce((acc, root) => {
            acc.contractual += root.contractual || 0;
            acc.valorizado += root.valorizado || 0;
            acc.partidas += root.partidas || 0;
            acc.linked += root.linked || 0;
            return acc;
        }, { contractual: 0, valorizado: 0, partidas: 0, linked: 0 });
    }, [roots]);
    const pct = totals.contractual > 0 ? (totals.valorizado / totals.contractual) * 100 : 0;

    const toggle = (event, code) => {
        event.stopPropagation();
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    };

    return (
        <div className="lob4d-workspace-view">
            <div className="lob4d-view-header">
                <div>
                    <div className="lob4d-view-title">Explorador EDT</div>
                    <div className="lob4d-view-copy">Cruce nativo entre presupuesto, valorizaciones y cronograma P6.</div>
                </div>
            </div>

            <div className="lob4d-content-scroll">
                <div className="lob4d-kpi-grid" style={{ marginBottom: 14 }}>
                    <div className="lob4d-kpi">
                        <div className="lob4d-label">Presupuesto contractual</div>
                        <strong>{money(totals.contractual)}</strong>
                    </div>
                    <div className="lob4d-kpi">
                        <div className="lob4d-label">Valorizado acumulado</div>
                        <strong>{money(totals.valorizado)}</strong>
                    </div>
                    <div className="lob4d-kpi">
                        <div className="lob4d-label">Avance economico</div>
                        <strong>{percentText(pct)}</strong>
                    </div>
                    <div className="lob4d-kpi">
                        <div className="lob4d-label">Partidas con Activity ID</div>
                        <strong>{totals.linked}/{totals.partidas}</strong>
                    </div>
                </div>

                <div className="lob4d-grid-two">
                    <div style={{ minWidth: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, background: '#10141a' }}>
                        <div className="lob4d-row-button" style={{ cursor: 'default', background: '#171d25', color: '#758298', fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', fontWeight: 900 }}>
                            <span />
                            <span>Codigo</span>
                            <span>Descripcion</span>
                            <span>Actividad</span>
                            <span>Und.</span>
                            <span>Metrado</span>
                            <span>Avance</span>
                        </div>
                        <div style={{ maxHeight: 'calc(100vh - 278px)', overflow: 'auto' }}>
                            {rows.map((node) => {
                                const hasKids = node.hijos.length > 0;
                                const isSelected = selectedCode === node.codigo;
                                const indent = Math.min(44, Math.max(0, (node.nivel - 1) * 12));
                                return (
                                    <button
                                        key={node.codigo}
                                        type="button"
                                        className={`lob4d-row-button${isSelected ? ' selected' : ''}`}
                                        onClick={() => setSelectedCode(node.codigo)}
                                        title={nodeTitle(node)}
                                    >
                                        <span
                                            className="lob4d-row-toggle"
                                            style={{ marginLeft: indent }}
                                            onClick={(event) => hasKids && toggle(event, node.codigo)}
                                        >
                                            {hasKids ? (expanded.has(node.codigo) ? '-' : '+') : ''}
                                        </span>
                                        <span className="lob4d-row-code">{node.codigo}</span>
                                        <span className="lob4d-row-name" style={{ fontWeight: node.tipo === 'partida' ? 500 : 900 }}>
                                            {nodeTitle(node)}
                                        </span>
                                        <span className="lob4d-mono" style={{ color: '#8d98a8', fontSize: 10 }}>
                                            {node.activity_id || ''}
                                        </span>
                                        <span style={{ color: '#8d98a8' }}>{node.unidad || ''}</span>
                                        <span className="lob4d-mono" style={{ textAlign: 'right' }}>{node.tipo === 'partida' ? numberText(node.metrado) : ''}</span>
                                        <span>
                                            <div className="lob4d-progress-bar">
                                                <span style={{ width: `${Math.min(100, node.pct || 0)}%` }} />
                                            </div>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <DetailPanel node={selected} lobData={lobData} />
                </div>
            </div>
        </div>
    );
}
