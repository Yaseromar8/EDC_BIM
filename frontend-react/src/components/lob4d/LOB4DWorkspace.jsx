import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../utils/apiFetch';
import LOB4DViewer from './LOB4DViewer';
import EdtExplorer from './EdtExplorer';
import LineBalanceView from './LineBalanceView';
import ProgressMatrixView from './ProgressMatrixView';
import ControlView from './ControlView';
import {
    computeSimulationState,
    getFilteredPartidas,
    getMaxPeriod,
    modelFrontOf,
    modelLabelOf,
    modelUrnOf,
    money,
    numberText,
    percentText,
    statusColor,
} from './lob4dUtils';
import './LOB4DWorkspace.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || (
    typeof window !== 'undefined' && window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : 'https://visor-ecd-backend.onrender.com'
);

const LOB_DATA_FILES = [
    '/lob-data/DURACIONES%20LB00_R00.xlsm',
    '/lob-data/Metrados%20RIBA%205%20-%20Paquete%208_SINOHYDRO_V03.xlsx',
];
const LOB_P6_FILE = '/lob-data/cronograma_p6.xml';

const TABS = [
    { id: 'simulation', code: '1b', label: 'Simulacion 4D' },
    { id: 'balance', code: '1a', label: 'Linea de Balance' },
    { id: 'matrix', code: '1c', label: 'Matriz de Avance' },
    { id: 'edt', code: '2a', label: 'Explorador EDT' },
    { id: 'control', code: '1d', label: 'Control de Obra' },
];

const STATUS_ITEMS = [
    { key: 'done', label: 'Ejecutado' },
    { key: 'executing', label: 'En ejecucion' },
    { key: 'planned', label: 'Programado' },
    { key: 'pending', label: 'Pendiente' },
];

function ModelPicker({ models, selectedUrns, onToggle, onAll, onClose }) {
    return (
        <div className="lob4d-modal-backdrop" onClick={onClose}>
            <div className="lob4d-modal" onClick={(event) => event.stopPropagation()}>
                <div className="lob4d-modal-header">
                    <div>
                        <div className="lob4d-view-title">Modelos vinculados al 4D LOB</div>
                        <div className="lob4d-view-copy">Estos modelos se cargan dentro de la cabina 3D de Simulacion 4D.</div>
                    </div>
                    <div className="lob4d-topbar-spacer" />
                    <button type="button" className="lob4d-icon-button" onClick={onClose} title="Cerrar">x</button>
                </div>
                <div className="lob4d-modal-body">
                    {models.map((model) => {
                        const checked = selectedUrns.includes(model._lobUrn);
                        return (
                            <label key={model._lobUrn} className="lob4d-model-row">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onToggle(model._lobUrn)}
                                    style={{ accentColor: '#3297ff' }}
                                />
                                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {model._lobLabel}
                                </span>
                                <span style={{ color: '#8793a5', fontSize: 11 }}>{model._lobFront}</span>
                            </label>
                        );
                    })}
                </div>
                <div className="lob4d-modal-footer">
                    <button type="button" className="lob4d-button ghost" onClick={onAll}>Cargar todos</button>
                    <button type="button" className="lob4d-button primary" onClick={onClose}>Aplicar</button>
                </div>
            </div>
        </div>
    );
}

function Hud({ simulationState }) {
    const progress = Math.max(0, Math.min(100, simulationState?.progress || 0));
    return (
        <>
            <div className="lob4d-hud-card date">
                <div className="lob4d-label">Fecha de simulacion</div>
                <div className="lob4d-kpi-value lob4d-mono">{simulationState?.dateLabel || '-'}</div>
                <div className="lob4d-muted-row">
                    <span className="lob4d-status-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: '#8d98a8' }} />
                    VAL {String(simulationState?.current || 1).padStart(2, '0')}
                </div>
            </div>

            <div className="lob4d-hud-card legend">
                <div className="lob4d-label">Estado 4D</div>
                {STATUS_ITEMS.map((item) => (
                    <div key={item.key} className="lob4d-status-row">
                        <span className="lob4d-status-dot" style={{ background: statusColor(item.key) }} />
                        {item.label}
                    </div>
                ))}
            </div>

            <div className="lob4d-hud-card progress">
                <div
                    className="lob4d-ring"
                    style={{ background: `conic-gradient(#22c55e 0 ${progress}%, #252b34 ${progress}% 100%)` }}
                />
                <div>
                    <div style={{ fontSize: 22, fontWeight: 900 }}>{percentText(progress)}</div>
                    <div style={{ color: '#8d98a8', fontSize: 11, marginTop: 4 }}>avance fisico global</div>
                </div>
            </div>
        </>
    );
}

function SimulationSidePanel({ simulationState, activeFrente, lobData }) {
    const rows = simulationState?.taskRows || [];
    const executing = rows.filter((row) => row.status === 'executing').slice(0, 5);
    const planned = rows.filter((row) => row.status === 'planned').slice(0, 5);
    const allPartidas = getFilteredPartidas(lobData, activeFrente);

    return (
        <aside className="lob4d-sim-panel">
            <div className="lob4d-panel-section">
                <div className="lob4d-label">Frente de trabajo</div>
                <div className="lob4d-side-title">VAL {String(simulationState?.current || 1).padStart(2, '0')}</div>
                <div style={{ marginTop: 6, color: '#8d98a8' }}>
                    {activeFrente || 'Todos los frentes'} - {allPartidas.length} partidas
                </div>
            </div>

            <div className="lob4d-panel-section">
                <div className="lob4d-label">Resumen 4D</div>
                <div className="lob4d-mini-grid">
                    {STATUS_ITEMS.map((item) => (
                        <div key={item.key} className="lob4d-mini">
                            <div className="lob4d-status-row" style={{ marginTop: 0 }}>
                                <span className="lob4d-status-dot" style={{ background: statusColor(item.key) }} />
                                {item.label}
                            </div>
                            <strong style={{ display: 'block', marginTop: 8, fontSize: 20 }}>
                                {simulationState?.counts?.[item.key] || 0}
                            </strong>
                        </div>
                    ))}
                </div>
            </div>

            <div className="lob4d-panel-section">
                <div className="lob4d-label">En ejecucion ahora</div>
                <div className="lob4d-task-list">
                    {executing.length ? executing.map((row) => (
                        <div key={row.codigo} className="lob4d-task-item">
                            <span className="lob4d-status-dot" style={{ background: statusColor('executing') }} />
                            <span style={{ minWidth: 0 }}>
                                <span className="lob4d-task-name">{row.descripcion || row.codigo}</span>
                                <span className="lob4d-task-code">{row.activity_id || row.codigo}</span>
                            </span>
                            <span className="lob4d-mono">{numberText(row.percent, 0)}%</span>
                        </div>
                    )) : <div style={{ color: '#758298', marginTop: 10 }}>Sin partidas en ejecucion en este periodo.</div>}
                </div>
            </div>

            <div className="lob4d-panel-section">
                <div className="lob4d-label">Proximas partidas</div>
                <div className="lob4d-task-list">
                    {planned.length ? planned.map((row) => (
                        <div key={row.codigo} className="lob4d-task-item">
                            <span className="lob4d-status-dot" style={{ background: statusColor('planned') }} />
                            <span style={{ minWidth: 0 }}>
                                <span className="lob4d-task-name">{row.descripcion || row.codigo}</span>
                                <span className="lob4d-task-code">{row.activity_id || row.codigo}</span>
                            </span>
                            <span className="lob4d-mono">{row.unidad || ''}</span>
                        </div>
                    )) : <div style={{ color: '#758298', marginTop: 10 }}>No hay partidas futuras en el filtro actual.</div>}
                </div>
            </div>

            <div className="lob4d-panel-section">
                <div className="lob4d-label">Control economico</div>
                <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#8d98a8' }}>Total</span>
                        <strong>{money(simulationState?.total || 0)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#8d98a8' }}>Valorizado</span>
                        <strong>{money(simulationState?.valorizado || 0)}</strong>
                    </div>
                </div>
            </div>
        </aside>
    );
}

function SimulationView({
    models,
    selectedUrns,
    activeViewableGuids,
    simulationState,
    simPeriod,
    maxPeriod,
    simPlaying,
    onPlayToggle,
    onPeriodChange,
    viewerStatus,
    setViewerStatus,
    activeFrente,
    lobData,
}) {
    return (
        <div className="lob4d-simulation">
            <div className="lob4d-viewer-shell">
                <LOB4DViewer
                    models={models}
                    selectedUrns={selectedUrns}
                    activeViewableGuids={activeViewableGuids}
                    simulationState={simulationState}
                    onStatus={setViewerStatus}
                />
                <Hud simulationState={simulationState} />
                <div className="lob4d-timeline">
                    <button
                        type="button"
                        className={`lob4d-play${simPlaying ? ' pause' : ''}`}
                        onClick={onPlayToggle}
                        title={simPlaying ? 'Pausar' : 'Reproducir'}
                    >
                        {simPlaying ? '||' : '>'}
                    </button>
                    <input
                        type="range"
                        className="lob4d-range"
                        min={0}
                        max={maxPeriod}
                        step={0.05}
                        value={simPeriod}
                        onChange={(event) => onPeriodChange(Number(event.target.value))}
                    />
                    <span className="lob4d-mono" style={{ color: '#dce3ee', minWidth: 82, textAlign: 'right' }}>
                        VAL {String(Math.floor(simPeriod) + 1).padStart(2, '0')}/{String(maxPeriod).padStart(2, '0')}
                    </span>
                </div>
                <div className="lob4d-viewer-status">{viewerStatus}</div>
            </div>
            <SimulationSidePanel simulationState={simulationState} activeFrente={activeFrente} lobData={lobData} />
        </div>
    );
}

export default function LOB4DWorkspace({ onClose, models = [], activeViewableGuids = {} }) {
    const [activeTab, setActiveTab] = useState('simulation');
    const [lobData, setLobData] = useState(null);
    const [dataStatus, setDataStatus] = useState({ text: 'Preparando base 4D...', progress: 5, state: 'loading' });
    const [viewerStatus, setViewerStatus] = useState('Preparando visor 4D...');
    const [selectedUrns, setSelectedUrns] = useState([]);
    const [modelPickerOpen, setModelPickerOpen] = useState(false);
    const [activeFrente, setActiveFrente] = useState(null);
    const [simPeriod, setSimPeriod] = useState(0);
    const [simPlaying, setSimPlaying] = useState(false);

    const availableModels = useMemo(() => {
        return (models || [])
            .map((model) => ({
                ...model,
                _lobUrn: modelUrnOf(model),
                _lobLabel: modelLabelOf(model),
                _lobFront: modelFrontOf(model),
            }))
            .filter((model) => model._lobUrn);
    }, [models]);

    const lobScope = useMemo(() => {
        const firstFront = modelFrontOf(models?.[0]);
        return firstFront && firstFront !== 'Frente actual' ? firstFront : 'global';
    }, [models]);

    const maxPeriod = useMemo(() => getMaxPeriod(lobData), [lobData]);
    const simulationState = useMemo(
        () => computeSimulationState(lobData, simPeriod, activeFrente),
        [lobData, simPeriod, activeFrente]
    );

    useEffect(() => {
        setSelectedUrns((prev) => {
            const valid = new Set(availableModels.map((model) => model._lobUrn));
            const kept = prev.filter((urn) => valid.has(urn));
            return kept.length ? kept : availableModels.map((model) => model._lobUrn);
        });
    }, [availableModels]);

    useEffect(() => {
        try { window.NOP_VIEWER?.stop?.(); } catch { /* noop */ }
        return () => {
            try { window.dispatchEvent(new CustomEvent('lob-clear')); } catch { /* noop */ }
            try { window.NOP_VIEWER?.start?.(); } catch { /* noop */ }
        };
    }, []);

    const fetchTimeline = useCallback(async () => {
        const response = await apiFetch(`${BACKEND_URL}/api/lob/timeline?model_urn=${encodeURIComponent(lobScope)}`);
        if (!response.ok) return null;
        const data = await response.json();
        if (!data || data.error || !(data.partidas || []).length) return null;
        return data;
    }, [lobScope]);

    const importDefaultData = useCallback(async () => {
        setDataStatus({ text: 'Descargando archivos 4D locales...', progress: 28, state: 'loading' });
        const [duraciones, metrados, p6] = await Promise.all([
            fetch(LOB_DATA_FILES[0]).then((r) => (r.ok ? r.blob() : null)).catch(() => null),
            fetch(LOB_DATA_FILES[1]).then((r) => (r.ok ? r.blob() : null)).catch(() => null),
            fetch(LOB_P6_FILE).then((r) => (r.ok ? r.blob() : null)).catch(() => null),
        ]);

        if (!duraciones && !metrados && !p6) {
            throw new Error('No se encontraron archivos 4D en /lob-data.');
        }

        setDataStatus({ text: 'Importando cronograma, metrados y P6 al backend...', progress: 62, state: 'loading' });
        const formData = new FormData();
        formData.append('model_urn', lobScope);
        if (duraciones) formData.append('duraciones', new File([duraciones], 'duraciones.xlsm'));
        if (metrados) formData.append('metrados', new File([metrados], 'metrados.xlsx'));
        if (p6) formData.append('cronograma', new File([p6], 'cronograma_p6.xml'));

        const response = await apiFetch(`${BACKEND_URL}/api/lob/import`, {
            method: 'POST',
            body: formData,
            isUpload: true,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Import 4D fallido.');
        return result;
    }, [lobScope]);

    const loadData = useCallback(async (forceImport = false) => {
        try {
            setDataStatus({ text: 'Consultando base 4D...', progress: 12, state: 'loading' });
            let data = forceImport ? null : await fetchTimeline();
            const needsImport = !data || !Object.keys(data.activities || {}).length;
            if (needsImport) {
                await importDefaultData();
                setDataStatus({ text: 'Leyendo timeline normalizado...', progress: 86, state: 'loading' });
                data = await fetchTimeline();
            }
            if (!data) throw new Error('El backend no devolvio datos 4D.');
            setLobData(data);
            setActiveFrente((prev) => (prev && data.frentes?.[prev] ? prev : null));
            setDataStatus({
                text: `Base 4D lista: ${data.partidas.length} partidas, ${Object.keys(data.activities || {}).length} fechas P6, ${Object.keys(data.frentes || {}).length} frentes.`,
                progress: 100,
                state: 'ready',
            });
        } catch (err) {
            console.error('[LOB4DWorkspace] datos:', err);
            setDataStatus({
                text: `4D sin datos: ${err.message || 'reinicia el backend o revisa /api/lob.'}`,
                progress: 100,
                state: 'error',
            });
        }
    }, [fetchTimeline, importDefaultData]);

    useEffect(() => {
        loadData(false);
    }, [loadData]);

    useEffect(() => {
        if (!simPlaying) return undefined;
        const timer = window.setInterval(() => {
            setSimPeriod((prev) => {
                const next = prev + 0.05;
                if (next >= maxPeriod) {
                    setSimPlaying(false);
                    return maxPeriod;
                }
                return next;
            });
        }, 120);
        return () => window.clearInterval(timer);
    }, [simPlaying, maxPeriod]);

    const toggleModel = (urn) => {
        setSelectedUrns((prev) => {
            if (prev.includes(urn)) {
                const next = prev.filter((item) => item !== urn);
                return next.length ? next : prev;
            }
            return [...prev, urn];
        });
    };

    const frontNames = useMemo(() => Object.keys(lobData?.frentes || {}), [lobData]);

    const onPeriodChange = (value) => {
        setSimPlaying(false);
        setSimPeriod(Math.max(0, Math.min(maxPeriod, value)));
    };

    const progressWidth = `${Math.max(3, Math.min(100, dataStatus.progress || 0))}%`;

    return (
        <div className="lob4d-overlay">
            <div className="lob4d-topbar">
                <span className="lob4d-badge">4D</span>
                <span className="lob4d-title">4D LOB - Espacio de trabajo</span>
                <span className="lob4d-subtitle">{dataStatus.text}</span>
                <div className="lob4d-topbar-spacer" />
                <button type="button" className="lob4d-button ghost" onClick={() => loadData(true)}>
                    Reimportar
                </button>
                <button type="button" className="lob4d-button" onClick={() => setModelPickerOpen(true)}>
                    Modelos ({selectedUrns.length})
                </button>
                <button type="button" className="lob4d-icon-button" onClick={onClose} title="Cerrar 4D LOB">x</button>
            </div>

            <div style={{ height: 3, background: '#0b0d10', flex: '0 0 auto' }}>
                <div style={{ height: '100%', width: progressWidth, background: dataStatus.state === 'error' ? '#ef4444' : '#3297ff' }} />
            </div>

            <div className="lob4d-tabs">
                <span className="lob4d-tabs-label">Vistas</span>
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        className={`lob4d-tab${activeTab === tab.id ? ' active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <small>{tab.code}</small>
                        {tab.label}
                    </button>
                ))}

                <div className="lob4d-fronts">
                    <span className="lob4d-fronts-label">Frente</span>
                    <button
                        type="button"
                        className={`lob4d-front-button${activeFrente == null ? ' active' : ''}`}
                        onClick={() => setActiveFrente(null)}
                    >
                        Todos
                    </button>
                    {frontNames.map((front) => (
                        <button
                            key={front}
                            type="button"
                            className={`lob4d-front-button${activeFrente === front ? ' active' : ''}`}
                            onClick={() => setActiveFrente(front)}
                        >
                            {front}
                        </button>
                    ))}
                </div>
            </div>

            <main className="lob4d-main">
                {activeTab === 'simulation' && (
                    <SimulationView
                        models={availableModels}
                        selectedUrns={selectedUrns}
                        activeViewableGuids={activeViewableGuids}
                        simulationState={simulationState}
                        simPeriod={simPeriod}
                        maxPeriod={maxPeriod}
                        simPlaying={simPlaying}
                        onPlayToggle={() => setSimPlaying((prev) => !prev)}
                        onPeriodChange={onPeriodChange}
                        viewerStatus={viewerStatus}
                        setViewerStatus={setViewerStatus}
                        activeFrente={activeFrente}
                        lobData={lobData}
                    />
                )}
                {activeTab === 'balance' && (
                    <LineBalanceView lobData={lobData} activeFrente={activeFrente} simulationState={simulationState} />
                )}
                {activeTab === 'matrix' && (
                    <ProgressMatrixView lobData={lobData} activeFrente={activeFrente} simulationState={simulationState} />
                )}
                {activeTab === 'edt' && (
                    <EdtExplorer lobData={lobData} activeFrente={activeFrente} />
                )}
                {activeTab === 'control' && (
                    <ControlView lobData={lobData} activeFrente={activeFrente} />
                )}
            </main>

            {modelPickerOpen && (
                <ModelPicker
                    models={availableModels}
                    selectedUrns={selectedUrns}
                    onToggle={toggleModel}
                    onAll={() => setSelectedUrns(availableModels.map((model) => model._lobUrn))}
                    onClose={() => setModelPickerOpen(false)}
                />
            )}
        </div>
    );
}
