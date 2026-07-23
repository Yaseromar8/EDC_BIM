import React, { useEffect, useMemo, useState } from 'react';
import {
    formatDate,
    getFilteredPartidas,
    money,
    numberText,
    statusColor,
} from './lob4dUtils';

const STATUS_ITEMS = [
    { key: 'done', label: 'Ejecutado' },
    { key: 'executing', label: 'En ejecucion' },
    { key: 'planned', label: 'Programado' },
    { key: 'pending', label: 'Pendiente' },
];

const PAGE_SIZE = 120;

const scopeLabel = (activeFrente, lobData) => {
    const values = Array.isArray(activeFrente) ? activeFrente : (activeFrente ? [activeFrente] : []);
    if (!values.length) return 'Todos los frentes';
    return values.map((entry) => {
        const value = String(entry);
        if (!value.startsWith('EDT:')) return value;
        const code = value.slice(4);
        const row = (lobData?.partidas || []).find((partida) => partida.codigo === code);
        return row?.descripcion ? `${code} · ${row.descripcion}` : code;
    }).join(' + ');
};

const formatPk = (value) => {
    const station = Number(value);
    if (!Number.isFinite(station)) return null;
    return `${Math.floor(station / 1000)}+${String(Math.round(station % 1000)).padStart(3, '0')}`;
};

export default function WorkPackagePanel({
    lobData,
    activeFrente,
    simulationState,
    selectedCode,
    onSelect,
}) {
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState(null);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    const allPartidas = useMemo(
        () => getFilteredPartidas(lobData, activeFrente),
        [lobData, activeFrente]
    );
    const stateByCode = useMemo(
        () => new Map((simulationState?.taskRows || []).map((row) => [String(row.codigo), row])),
        [simulationState]
    );

    const filtered = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase('es');
        return allPartidas
            .filter((partida) => {
                const state = stateByCode.get(String(partida.codigo))?.status || 'pending';
                if (statusFilter && state !== statusFilter) return false;
                if (!needle) return true;
                return [partida.codigo, partida.descripcion, partida.activity_id, partida.unidad]
                    .some((value) => String(value || '').toLocaleLowerCase('es').includes(needle));
            })
            .sort((a, b) => {
                const aState = stateByCode.get(String(a.codigo))?.status || 'pending';
                const bState = stateByCode.get(String(b.codigo))?.status || 'pending';
                const priority = { executing: 0, planned: 1, pending: 2, done: 3 };
                return priority[aState] - priority[bState]
                    || Number(a.orden || 0) - Number(b.orden || 0)
                    || String(a.codigo).localeCompare(String(b.codigo), undefined, { numeric: true });
            });
    }, [allPartidas, query, stateByCode, statusFilter]);

    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
        setStatusFilter(null);
        setQuery('');
    }, [activeFrente]);

    const currentLabel = simulationState?.mode === 'dates'
        ? simulationState.dateLabel
        : `VAL ${String(simulationState?.current || 1).padStart(2, '0')}`;

    return (
        <aside className="lob4d-work-package-panel" aria-label="Partidas del frente activo">
            <header className="lob4d-package-header">
                <div>
                    <div className="lob4d-label">Alcance operativo</div>
                    <div className="lob4d-side-title">{scopeLabel(activeFrente, lobData)}</div>
                    <div className="lob4d-package-meta">{currentLabel} · {allPartidas.length} partidas</div>
                </div>
                {selectedCode && (
                    <button type="button" className="lob4d-icon-button" onClick={() => onSelect?.(null)} title="Quitar seleccion">
                        x
                    </button>
                )}
            </header>

            <div className="lob4d-package-summary">
                {STATUS_ITEMS.map((item) => {
                    const active = statusFilter === item.key;
                    return (
                        <button
                            key={item.key}
                            type="button"
                            className={`lob4d-package-kpi${active ? ' active' : ''}`}
                            onClick={() => setStatusFilter((previous) => previous === item.key ? null : item.key)}
                            title={`Filtrar partidas: ${item.label}`}
                        >
                            <span className="lob4d-status-dot" style={{ background: statusColor(item.key) }} />
                            <strong>{simulationState?.counts?.[item.key] || 0}</strong>
                            <small>{item.label}</small>
                        </button>
                    );
                })}
            </div>

            <div className="lob4d-package-search">
                <span aria-hidden="true">⌕</span>
                <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar codigo, partida o Activity ID"
                    aria-label="Buscar partidas"
                />
            </div>

            <div className="lob4d-package-list" role="listbox" aria-label="Partidas">
                {filtered.slice(0, visibleCount).map((partida) => {
                    const row = stateByCode.get(String(partida.codigo)) || {};
                    const status = row.status || 'pending';
                    const location = lobData?.locations?.[partida.codigo];
                    const activity = partida.activity_id ? lobData?.activities?.[partida.activity_id] : null;
                    const startPk = formatPk(location?.station_start);
                    const endPk = formatPk(location?.station_end);
                    const active = selectedCode === partida.codigo;
                    return (
                        <button
                            key={partida.codigo}
                            type="button"
                            role="option"
                            aria-selected={active}
                            className={`lob4d-package-row${active ? ' active' : ''}`}
                            onClick={() => onSelect?.(active ? null : partida.codigo)}
                        >
                            <span className="lob4d-package-status" style={{ background: statusColor(status) }} />
                            <span className="lob4d-package-body">
                                <span className="lob4d-package-code">
                                    {partida.codigo}
                                    {partida.activity_id && <em>{partida.activity_id}</em>}
                                </span>
                                <strong title={partida.descripcion || partida.codigo}>{partida.descripcion || partida.codigo}</strong>
                                <span className="lob4d-package-detail">
                                    {startPk && endPk
                                        ? `${startPk} → ${endPk}`
                                        : activity?.start
                                            ? `${formatDate(activity.start)} → ${formatDate(activity.finish)}`
                                            : 'Sin ubicacion/fechas vinculadas'}
                                </span>
                            </span>
                            <span className="lob4d-package-progress">
                                <strong>{numberText(row.percent || 0, 0)}%</strong>
                                <span>{partida.unidad || ''}</span>
                            </span>
                        </button>
                    );
                })}
                {!filtered.length && <div className="lob4d-package-empty">No hay partidas para este filtro.</div>}
                {visibleCount < filtered.length && (
                    <button
                        type="button"
                        className="lob4d-package-more"
                        onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                    >
                        Mostrar {Math.min(PAGE_SIZE, filtered.length - visibleCount)} mas
                    </button>
                )}
            </div>

            <footer className="lob4d-package-footer">
                <span>Contractual <strong>{money(simulationState?.total || 0)}</strong></span>
                <span>Valorizado <strong>{money(simulationState?.valorizado || 0)}</strong></span>
            </footer>
        </aside>
    );
}
