import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, getUploadAuthHeaders } from '../../utils/apiFetch';
import LOB4DViewer from './LOB4DViewer';
import EdtExplorer from './EdtExplorer';
import LineBalanceView from './LineBalanceView';
import ProgressMatrixView from './ProgressMatrixView';
import ControlView from './ControlView';
import LinearPlanningView from './LinearPlanningView';
import WorkPackagePanel from './WorkPackagePanel';
import {
    buildEdtTree,
    buildLobSeries,
    clearBaseline,
    snapshotBaseline,
    loadBaseline,
    cleanUrn,
    computeSimulationState,
    computeSimulationStateByDate,
    getFrontCodes,
    getScheduleDomain,
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

const TABS = [
    { id: 'planner', code: '0a', label: 'Plan lineal' },
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

const todayISO = () => new Date().toISOString().slice(0, 10);

function DataImportModal({ hasDataset, onImport, onClose, busy, error }) {
    const [duraciones, setDuraciones] = useState(null);
    const [metrados, setMetrados] = useState(null);
    const [cronograma, setCronograma] = useState(null);
    const [name, setName] = useState('');
    const [dataDate, setDataDate] = useState(todayISO);
    const canSubmit = !busy && (hasDataset
        ? !!(duraciones || metrados || cronograma)
        : !!(duraciones && metrados));

    const submit = (event) => {
        event.preventDefault();
        if (!canSubmit) return;
        onImport({ duraciones, metrados, cronograma, name, dataDate });
    };

    return (
        <div className="lob4d-modal-backdrop" onClick={busy ? undefined : onClose}>
            <form className="lob4d-modal lob4d-data-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
                <div className="lob4d-modal-header">
                    <div>
                        <div className="lob4d-view-title">Publicar version 4D LOB</div>
                        <div className="lob4d-view-copy">{hasDataset ? 'Actualiza una o mas fuentes.' : 'La primera version requiere Duraciones y Metrados.'}</div>
                    </div>
                    <div className="lob4d-topbar-spacer" />
                    <button type="button" className="lob4d-icon-button" onClick={onClose} disabled={busy} title="Cerrar">x</button>
                </div>
                <div className="lob4d-modal-body lob4d-import-grid">
                    <label className="lob4d-field">
                        <span>Nombre de version</span>
                        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Corte semanal / baseline" />
                    </label>
                    <label className="lob4d-field">
                        <span>Fecha de datos</span>
                        <input type="date" value={dataDate} onChange={(event) => setDataDate(event.target.value)} required />
                    </label>
                    <label className="lob4d-file-field">
                        <span>Duraciones EDT</span>
                        <strong>{duraciones?.name || (hasDataset ? 'Conservar version activa' : 'Seleccionar XLSM')}</strong>
                        <input type="file" accept=".xlsm,.xlsx" onChange={(event) => setDuraciones(event.target.files?.[0] || null)} />
                    </label>
                    <label className="lob4d-file-field">
                        <span>Metrados y valorizaciones</span>
                        <strong>{metrados?.name || (hasDataset ? 'Conservar version activa' : 'Seleccionar XLSX')}</strong>
                        <input type="file" accept=".xlsx,.xlsm" onChange={(event) => setMetrados(event.target.files?.[0] || null)} />
                    </label>
                    <label className="lob4d-file-field">
                        <span>Cronograma Primavera P6</span>
                        <strong>{cronograma?.name || (hasDataset ? 'Conservar version activa' : 'Opcional')}</strong>
                        <input type="file" accept=".xml" onChange={(event) => setCronograma(event.target.files?.[0] || null)} />
                    </label>
                    {error && <div className="lob4d-import-error">{error}</div>}
                </div>
                <div className="lob4d-modal-footer">
                    <button type="button" className="lob4d-button ghost" onClick={onClose} disabled={busy}>Cancelar</button>
                    <button type="submit" className="lob4d-button primary" disabled={!canSubmit}>{busy ? 'Publicando...' : 'Publicar version'}</button>
                </div>
            </form>
        </div>
    );
}

function DatasetModal({ datasets, onActivate, onRebuildLinks, onClose, busy }) {
    return (
        <div className="lob4d-modal-backdrop" onClick={onClose}>
            <div className="lob4d-modal lob4d-data-modal" onClick={(event) => event.stopPropagation()}>
                <div className="lob4d-modal-header">
                    <div>
                        <div className="lob4d-view-title">Versiones 4D LOB</div>
                        <div className="lob4d-view-copy">Historial inmutable del frente.</div>
                    </div>
                    <div className="lob4d-topbar-spacer" />
                    <button type="button" className="lob4d-icon-button" onClick={onClose} title="Cerrar">x</button>
                </div>
                <div className="lob4d-modal-body lob4d-dataset-list">
                    {datasets.length ? datasets.map((dataset) => (
                        <div key={dataset.id} className={`lob4d-dataset-row${dataset.is_active ? ' active' : ''}`}>
                            <div>
                                <strong>v{dataset.version} - {dataset.name}</strong>
                                <span>{dataset.data_date || 'Sin fecha'} · {dataset.created_by || 'sistema'}</span>
                            </div>
                            <div className="lob4d-dataset-metrics">
                                <span>P6 {Number(dataset.stats?.cobertura_p6_pct || 0).toFixed(0)}%</span>
                                <span>BIM {dataset.stats?.elementos_bim_vinculados || 0}</span>
                                <span>Fuentes {dataset.stats?.fuentes_archivadas || 0}/{dataset.stats?.fuentes_total || 0}</span>
                            </div>
                            {dataset.is_active ? (
                                <button type="button" className="lob4d-button" onClick={() => onRebuildLinks(dataset.id)} disabled={busy}>Actualizar vinculos</button>
                            ) : (
                                <button type="button" className="lob4d-button ghost" onClick={() => onActivate(dataset.id)} disabled={busy}>Activar</button>
                            )}
                        </div>
                    )) : <div className="lob4d-empty">No hay versiones publicadas.</div>}
                </div>
                <div className="lob4d-modal-footer">
                    <button type="button" className="lob4d-button primary" onClick={onClose}>Cerrar</button>
                </div>
            </div>
        </div>
    );
}

function ModelPicker({ models, selectedUrns, excavUrns, onToggle, onToggleExcav, onAll, onClose }) {
    return (
        <div className="lob4d-modal-backdrop" onClick={onClose}>
            <div className="lob4d-modal" onClick={(event) => event.stopPropagation()}>
                <div className="lob4d-modal-header">
                    <div>
                        <div className="lob4d-view-title">Modelos vinculados al 4D LOB</div>
                        <div className="lob4d-view-copy">Estos modelos se cargan dentro de la cabina 3D de Simulacion 4D. Marca con ⛏ los solidos de excavacion/relleno: en la simulacion se recortan por progresiva segun el cronograma.</div>
                    </div>
                    <div className="lob4d-topbar-spacer" />
                    <button type="button" className="lob4d-icon-button" onClick={onClose} title="Cerrar">x</button>
                </div>
                <div className="lob4d-modal-body">
                    {models.map((model) => {
                        const checked = selectedUrns.includes(model._lobUrn);
                        const isExcav = excavUrns.includes(model._lobUrn);
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
                                <button
                                    type="button"
                                    className={`lob4d-front-button${isExcav ? ' active' : ''}`}
                                    style={{ padding: '2px 8px', flex: '0 0 auto' }}
                                    title="Solido de excavacion/relleno: en 4D se recorta por progresiva segun el avance del cronograma"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        onToggleExcav(model._lobUrn);
                                    }}
                                >
                                    ⛏
                                </button>
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

// ── Botón CAMPANA con contador de alertas + dropdown ──────────────────────
const SEV_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#eab308' };
function AlertsButton({ lobSeries, onJumpDate }) {
    const [open, setOpen] = useState(false);
    const alerts = lobSeries?.alerts || [];
    const critical = alerts.filter((a) => a.severity === 'critical').length;
    const high = alerts.filter((a) => a.severity === 'high').length;
    const dot = critical > 0 ? SEV_COLOR.critical : high > 0 ? SEV_COLOR.high : alerts.length ? SEV_COLOR.medium : '#3aa0ff';
    return (
        <div style={{ position: 'relative' }}>
            <button
                type="button"
                className="lob4d-button ghost"
                onClick={() => setOpen((o) => !o)}
                style={{ position: 'relative' }}
                title={`${alerts.length} alertas · ${critical} críticas · ${high} altas`}
            >
                🔔 Alertas
                {alerts.length > 0 && (
                    <span style={{
                        position: 'absolute', top: -6, right: -6,
                        background: dot, color: '#0b0d10', borderRadius: 10,
                        fontSize: 10, fontWeight: 900, minWidth: 18, height: 18,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
                    }}>{alerts.length}</span>
                )}
            </button>
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 380, maxHeight: 480,
                    overflowY: 'auto', background: '#12161d', border: '1px solid #2a323d',
                    borderRadius: 8, padding: 10, boxShadow: '0 12px 32px rgba(0,0,0,.55)', zIndex: 100,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ color: '#dce3ee', fontWeight: 800, fontSize: 12 }}>Alertas del proyecto</span>
                        <span style={{ marginLeft: 'auto', color: '#8d98a8', fontSize: 10 }}>{alerts.length} total</span>
                    </div>
                    {alerts.length === 0 ? (
                        <div style={{ color: '#66707e', fontSize: 11, padding: 12, textAlign: 'center' }}>Sin alertas. 🟢</div>
                    ) : alerts.map((a) => (
                        <div key={a.id}
                            onClick={() => a.start && onJumpDate?.(a.start)}
                            style={{
                                display: 'flex', gap: 8, padding: '7px 8px', borderRadius: 5,
                                marginBottom: 3, cursor: a.start ? 'pointer' : 'default',
                                background: 'rgba(255,255,255,.02)', borderLeft: `3px solid ${SEV_COLOR[a.severity]}`,
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.06)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.02)'; }}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ color: '#dce3ee', fontSize: 12, fontWeight: 700 }}>{a.title}</div>
                                {a.hint && <div style={{ color: '#8d98a8', fontSize: 10.5, marginTop: 2 }}>{a.hint}</div>}
                            </div>
                            <span style={{
                                fontSize: 9, fontWeight: 800, letterSpacing: '.06em',
                                background: SEV_COLOR[a.severity], color: '#0b0d10',
                                padding: '2px 6px', borderRadius: 3, alignSelf: 'flex-start',
                                whiteSpace: 'nowrap',
                            }}>{a.severity.toUpperCase()}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Botón BASELINE (congelar plan actual como línea base para comparar) ────
function BaselineButton({ hasBaseline, baselineInfo, onSnapshot, onClear }) {
    const [open, setOpen] = useState(false);
    return (
        <div style={{ position: 'relative' }}>
            <button
                type="button"
                className="lob4d-button ghost"
                onClick={() => setOpen((o) => !o)}
                title={hasBaseline ? `Baseline v${baselineInfo?.datasetVersion || '?'} congelado` : 'Congelar el plan actual como baseline'}
            >
                🔒 Baseline{hasBaseline ? ` v${baselineInfo?.datasetVersion || '?'}` : ''}
            </button>
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 300,
                    background: '#12161d', border: '1px solid #2a323d', borderRadius: 8,
                    padding: 12, boxShadow: '0 12px 32px rgba(0,0,0,.55)', zIndex: 100, color: '#dce3ee',
                }}>
                    <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 8 }}>Línea base del cronograma</div>
                    <div style={{ color: '#8d98a8', fontSize: 11, lineHeight: 1.4, marginBottom: 10 }}>
                        {hasBaseline
                            ? `Congelada con ${baselineInfo.partidasCount} partidas · ${new Date(baselineInfo.savedAt).toLocaleDateString('es-PE')}. La LOB compara el plan vivo contra esta línea.`
                            : 'Congela el plan actual como referencia. Cambios posteriores se muestran como "deriva" (cuánto se movió el plan desde la firma).'}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button
                            type="button"
                            className="lob4d-button primary"
                            style={{ flex: 1 }}
                            onClick={() => { onSnapshot?.(); setOpen(false); }}
                        >
                            {hasBaseline ? 'Sobrescribir' : 'Congelar ahora'}
                        </button>
                        {hasBaseline && (
                            <button
                                type="button"
                                className="lob4d-button ghost"
                                onClick={() => { onClear?.(); setOpen(false); }}
                            >
                                Quitar
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Panel LOOK-AHEAD ejecutivo (para reunión semanal de obra) ──────────────
// Muestra en 3 columnas: próximos arranques (2 sem), próximos cierres (2 sem)
// y atrasos críticos ordenados por impacto (costo × días). Es EL widget que
// piden los gerentes: "¿qué está por pasar y qué debo empujar?".
function LookaheadPanel({ lobSeries, onJumpDate }) {
    const [open, setOpen] = useState(false);
    const la = lobSeries?.lookahead;
    if (!la) return null;
    const total = (la.upcoming2w?.length || 0) + (la.closing2w?.length || 0) + (la.criticalLate?.length || 0);
    if (!open) {
        return (
            <button
                type="button"
                className="lob4d-button"
                style={{ position: 'absolute', left: 18, bottom: 148, zIndex: 30 }}
                onClick={() => setOpen(true)}
                title="Panel look-ahead: próximos arranques, próximos cierres y atrasos críticos"
            >
                🔭 Look-ahead ({total})
            </button>
        );
    }
    const money = (v) => v == null ? '—' : `S/ ${Math.round(v).toLocaleString('es-PE')}`;
    const dateShort = (t) => new Date(t).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
    const Row = ({ seg, right, tone }) => (
        <div
            onClick={() => onJumpDate?.(seg.start)}
            style={{ padding: '5px 7px', borderRadius: 5, cursor: 'pointer', background: 'rgba(255,255,255,.02)', marginBottom: 3 }}
            title={`${seg.codigo} · ${seg.descripcion || ''}\nClic: ir a inicio`}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.02)'; }}
        >
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontFamily: 'Consolas, monospace', color: '#66707e', minWidth: 62 }}>{seg.codigo}</span>
                <span style={{ fontSize: 11, color: '#dce3ee', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {seg.descripcion || seg.activity_id}
                </span>
                <span style={{ fontSize: 10, color: tone || '#8d98a8', fontFamily: 'Consolas, monospace', whiteSpace: 'nowrap' }}>{right}</span>
            </div>
        </div>
    );
    return (
        <div className="lob4d-hud-card" style={{
            position: 'absolute', left: 18, bottom: 148, zIndex: 30, width: 420,
            maxHeight: 420, display: 'flex', flexDirection: 'column', gap: 6,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="lob4d-label" style={{ flex: 1 }}>🔭 Look-ahead ejecutivo</div>
                <button type="button" className="lob4d-icon-button" onClick={() => setOpen(false)} title="Cerrar">×</button>
            </div>
            <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                    <div style={{ color: '#ef4444', fontSize: 10, letterSpacing: '.05em', fontWeight: 800, marginBottom: 3 }}>
                        🔴 ATRASOS CRÍTICOS (por impacto S/·días)
                    </div>
                    {la.criticalLate.length ? la.criticalLate.map((s) => (
                        <Row key={s.codigo} seg={s}
                             right={`${s.deltaDays ?? '?'}d · ${money(s.cost)}`}
                             tone="#ef4444" />
                    )) : <div style={{ color: '#66707e', fontSize: 10, padding: 4 }}>Sin atrasos.</div>}
                </div>
                <div>
                    <div style={{ color: '#3aa0ff', fontSize: 10, letterSpacing: '.05em', fontWeight: 800, marginBottom: 3 }}>
                        🔵 PRÓXIMOS ARRANQUES (≤14 días)
                    </div>
                    {la.upcoming2w.length ? la.upcoming2w.map((s) => (
                        <Row key={s.codigo} seg={s}
                             right={`${dateShort(s.start)}`}
                             tone="#3aa0ff" />
                    )) : <div style={{ color: '#66707e', fontSize: 10, padding: 4 }}>Nada arranca en 2 semanas.</div>}
                </div>
                <div>
                    <div style={{ color: '#22c55e', fontSize: 10, letterSpacing: '.05em', fontWeight: 800, marginBottom: 3 }}>
                        🟢 CIERRES PRÓXIMOS (≤14 días)
                    </div>
                    {la.closing2w.length ? la.closing2w.map((s) => (
                        <Row key={s.codigo} seg={s}
                             right={`${dateShort(s.finish)} · ${s.realPct.toFixed(0)}%`}
                             tone="#22c55e" />
                    )) : <div style={{ color: '#66707e', fontSize: 10, padding: 4 }}>Nada cierra en 2 semanas.</div>}
                </div>
            </div>
        </div>
    );
}

function Hud({ simulationState, lobSeries }) {
    const evm = lobSeries?.evm || null;
    const spiClass = evm?.spi == null ? '' : evm.spi >= 1 ? '#22c55e' : evm.spi >= 0.9 ? '#f59e0b' : '#ef4444';
    const cpiClass = evm?.cpi == null ? '' : evm.cpi >= 1 ? '#22c55e' : evm.cpi >= 0.9 ? '#f59e0b' : '#ef4444';
    const fmt = (v, d = 2) => v == null || !Number.isFinite(v) ? '—' : v.toFixed(d);
    const money = (v) => v == null ? '—' : `S/ ${Math.round(v).toLocaleString('es-PE')}`;
    const progress = Math.max(0, Math.min(100, simulationState?.progress || 0));
    const [excavFront, setExcavFront] = useState(null);
    const [diag, setDiag] = useState(null);

    useEffect(() => {
        const onFront = (event) => setExcavFront(event.detail || null);
        const onClear = () => setExcavFront(null);
        const onDiag = (event) => setDiag(event.detail || null);
        window.addEventListener('LOB4D_EXCAV_FRONT_CHANGED', onFront);
        window.addEventListener('LOB4D_DIAG', onDiag);
        window.addEventListener('lob-clear', onClear);
        return () => {
            window.removeEventListener('LOB4D_EXCAV_FRONT_CHANGED', onFront);
            window.removeEventListener('LOB4D_DIAG', onDiag);
            window.removeEventListener('lob-clear', onClear);
        };
    }, []);

    return (
        <>
            <div className="lob4d-hud-card date">
                <div className="lob4d-label">Fecha de simulacion</div>
                <div className="lob4d-kpi-value lob4d-mono">{simulationState?.dateLabel || '-'}</div>
                <div className="lob4d-muted-row">
                    <span className="lob4d-status-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: '#8d98a8' }} />
                    {simulationState?.mode === 'dates'
                        ? `${simulationState?.counts?.done || 0} listas · ${simulationState?.counts?.executing || 0} en curso`
                        : `VAL ${String(simulationState?.current || 1).padStart(2, '0')}`}
                </div>
                {excavFront && (
                    <div className="lob4d-muted-row" title="Frente de excavacion/relleno programado a la fecha (corta los solidos ⛏)">
                        <span className="lob4d-status-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: '#f97316' }} />
                        {`⛏ Tierras: ${excavFront.label} (${Number(excavFront.pct || 0).toFixed(1)}%)`}
                    </div>
                )}
                {diag && (
                    <div style={{ marginTop: 6, fontSize: 10, lineHeight: 1.5, color: diag.llavesQueCRUZAN > 0 ? '#7dd88f' : '#f08a8a', fontFamily: 'monospace' }}>
                        <div>índice: {diag.indiceLlaves} llaves · muestra {JSON.stringify(diag.indiceMuestra)}</div>
                        <div>tareas: {diag.tareasActivas} activas · muestra {JSON.stringify(diag.tareasMuestra)}</div>
                        <div style={{ fontWeight: 700 }}>llaves que CRUZAN: {diag.llavesQueCRUZAN}</div>
                    </div>
                )}
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
                    <div style={{ color: '#8d98a8', fontSize: 11, marginTop: 4 }}>
                        {simulationState?.progressKind === 'programado' ? 'avance programado a la fecha' : 'avance fisico global'}
                    </div>
                </div>
            </div>

            {evm && (
                <div className="lob4d-hud-card" style={{ minWidth: 220 }}>
                    <div className="lob4d-label">KPIs EVM (Earned Value)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6, fontSize: 12 }}>
                        <div>
                            <div style={{ color: '#8d98a8', fontSize: 10, letterSpacing: '.05em' }}>SPI</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: spiClass, fontFamily: 'Consolas, monospace' }}>
                                {fmt(evm.spi)}
                            </div>
                            <div style={{ color: '#66707e', fontSize: 10 }}>ritmo tiempo</div>
                        </div>
                        <div>
                            <div style={{ color: '#8d98a8', fontSize: 10, letterSpacing: '.05em' }}>CPI</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: cpiClass, fontFamily: 'Consolas, monospace' }}>
                                {fmt(evm.cpi)}
                            </div>
                            <div style={{ color: '#66707e', fontSize: 10 }}>rentabilidad</div>
                        </div>
                        <div style={{ gridColumn: '1 / -1', height: 1, background: 'rgba(255,255,255,.08)', margin: '4px 0' }} />
                        <div>
                            <div style={{ color: '#8d98a8', fontSize: 10 }}>PV plan</div>
                            <div style={{ fontFamily: 'Consolas, monospace' }}>{money(evm.pv)}</div>
                        </div>
                        <div>
                            <div style={{ color: '#8d98a8', fontSize: 10 }}>EV ganado</div>
                            <div style={{ fontFamily: 'Consolas, monospace' }}>{money(evm.ev)}</div>
                        </div>
                        <div>
                            <div style={{ color: '#8d98a8', fontSize: 10 }}>SV (adelanto/atraso)</div>
                            <div style={{ fontFamily: 'Consolas, monospace', color: evm.sv >= 0 ? '#22c55e' : '#ef4444' }}>
                                {evm.sv >= 0 ? '+' : ''}{money(evm.sv)}
                            </div>
                        </div>
                        <div>
                            <div style={{ color: '#8d98a8', fontSize: 10 }}>EAC proyectado</div>
                            <div style={{ fontFamily: 'Consolas, monospace' }}>{money(evm.eac)}</div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function SimulationSidePanel({ simulationState, activeFrente, lobData }) {
    const rows = simulationState?.taskRows || [];
    const executing = rows.filter((row) => row.status === 'executing').slice(0, 5);
    const planned = rows.filter((row) => row.status === 'planned').slice(0, 5);
    const allPartidas = getFilteredPartidas(lobData, activeFrente);
    const [isoState, setIsoState] = useState(null);

    const toggleIso = (key) => {
        const next = isoState === key ? null : key;
        setIsoState(next);
        window.dispatchEvent(new CustomEvent('lob-isolate-state', { detail: { state: next } }));
    };

    // Al cambiar de fecha/frente, el aislamiento deja de ser válido → limpiar.
    useEffect(() => {
        setIsoState(null);
        window.dispatchEvent(new CustomEvent('lob-isolate-state', { detail: { state: null } }));
    }, [activeFrente]);

    return (
        <aside className="lob4d-sim-panel">
            <div className="lob4d-panel-section">
                <div className="lob4d-label">Frente de trabajo</div>
                <div className="lob4d-side-title">
                    {simulationState?.mode === 'dates'
                        ? simulationState.dateLabel
                        : `VAL ${String(simulationState?.current || 1).padStart(2, '0')}`}
                </div>
                <div style={{ marginTop: 6, color: '#8d98a8' }}>
                    {(() => {
                        const list = Array.isArray(activeFrente) ? activeFrente : (activeFrente ? [activeFrente] : []);
                        if (!list.length) return 'Todos los frentes';
                        return list.map((f) => {
                            const value = String(f);
                            if (value.startsWith('EDT:')) {
                                const code = value.slice(4);
                                const t = (lobData?.partidas || []).find((p) => p.codigo === code);
                                return `${code} ${t?.descripcion ? `· ${t.descripcion.slice(0, 28)}` : ''}`;
                            }
                            return value;
                        }).join(' + ');
                    })()} - {allPartidas.length} partidas
                </div>
            </div>

            <div className="lob4d-panel-section">
                <div className="lob4d-label">
                    Resumen 4D
                    {isoState && <span style={{ color: '#8d98a8', fontWeight: 400 }}> · aislado: {STATUS_ITEMS.find((s) => s.key === isoState)?.label} (clic para quitar)</span>}
                </div>
                <div className="lob4d-mini-grid">
                    {STATUS_ITEMS.map((item) => {
                        const active = isoState === item.key;
                        return (
                            <div
                                key={item.key}
                                className="lob4d-mini"
                                onClick={() => toggleIso(item.key)}
                                title={`Resaltar solo lo ${item.label.toLowerCase()}`}
                                style={{
                                    cursor: 'pointer',
                                    outline: active ? `2px solid ${statusColor(item.key)}` : '2px solid transparent',
                                    opacity: isoState && !active ? 0.55 : 1,
                                    transition: 'opacity .15s, outline-color .15s',
                                }}
                            >
                                <div className="lob4d-status-row" style={{ marginTop: 0 }}>
                                    <span className="lob4d-status-dot" style={{ background: statusColor(item.key) }} />
                                    {item.label}
                                </div>
                                <strong style={{ display: 'block', marginTop: 8, fontSize: 20 }}>
                                    {simulationState?.counts?.[item.key] || 0}
                                </strong>
                            </div>
                        );
                    })}
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

const DAY_MS = 86400000;

// ── Frente por rama del EDT ──────────────────────────────────────────────────
// Árbol jerárquico de títulos del EDT (05 → 05.02, 05.06…). Elegir un nodo
// filtra la simulación 4D a esa rama Y aísla sus elementos en el 3D (por
// CodigoDePartida). Complementa a los frentes nombrados del mapeo.
function FrenteEdtPicker({ lobData, activeFrente, onSelect }) {
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState(() => new Set());
    // El desplegable va en position:fixed (anclado al botón): la barra de tabs
    // tiene overflow-x:auto y recorta cualquier hijo absoluto → parecía "muerto".
    const [anchor, setAnchor] = useState(null);

    const tree = useMemo(() => (lobData ? buildEdtTree(lobData, null) : { roots: [] }), [lobData]);
    const edtEntry = (Array.isArray(activeFrente) ? activeFrente : [activeFrente])
        .find((f) => String(f || '').startsWith('EDT:'));
    const isEdt = !!edtEntry;
    const activeCode = isEdt ? String(edtEntry).slice(4) : null;

    const toggleOpen = (event) => {
        if (!open) {
            const rect = event.currentTarget.getBoundingClientRect();
            setAnchor({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
        }
        setOpen((o) => !o);
    };

    const rows = useMemo(() => {
        const out = [];
        const walk = (node) => {
            if (node.tipo !== 'titulo') return; // frentes = niveles de agrupación, no partidas hoja
            out.push(node);
            if (expanded.has(node.codigo)) {
                node.hijos.forEach(walk);
            }
        };
        (tree.roots || []).forEach(walk);
        return out;
    }, [tree, expanded]);

    const toggleExpand = (codigo) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(codigo)) next.delete(codigo);
            else next.add(codigo);
            return next;
        });
    };

    return (
        <div style={{ position: 'relative' }}>
            <button
                type="button"
                className={`lob4d-front-button${isEdt ? ' active' : ''}`}
                onClick={toggleOpen}
                title="Elegir frente por rama del EDT (código de partida)"
            >
                {isEdt ? `EDT ${activeCode}` : 'EDT ▾'}
            </button>
            {open && anchor && (
                <div
                    style={{
                        position: 'fixed', top: anchor.top, right: anchor.right, zIndex: 200,
                        width: 420, maxHeight: 360, overflowY: 'auto',
                        background: '#12161d', border: '1px solid #2a323d',
                        borderRadius: 8, padding: 8, boxShadow: '0 8px 28px rgba(0,0,0,.5)',
                    }}
                >
                    <div
                        style={{ padding: '6px 8px', cursor: 'pointer', color: !isEdt ? '#3aa0ff' : '#c7d0dc', fontSize: 12, fontWeight: 700 }}
                        onClick={() => { onSelect(null); setOpen(false); }}
                    >
                        ✕ Sin filtro EDT (todos)
                    </div>
                    {rows.map((node) => {
                        const hasChildTitles = node.hijos.some((h) => h.tipo === 'titulo');
                        const isOpen = expanded.has(node.codigo);
                        const isActive = activeCode === node.codigo;
                        return (
                            <div
                                key={node.codigo}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '4px 6px', paddingLeft: 6 + (node.nivel - 1) * 16,
                                    borderRadius: 5, cursor: 'pointer', fontSize: 12,
                                    background: isActive ? 'rgba(50,151,255,.18)' : 'transparent',
                                    color: isActive ? '#7cbcff' : '#c7d0dc',
                                }}
                            >
                                <span
                                    onClick={(e) => { e.stopPropagation(); if (hasChildTitles) toggleExpand(node.codigo); }}
                                    style={{ width: 14, textAlign: 'center', color: '#7c8797', flex: '0 0 auto', cursor: hasChildTitles ? 'pointer' : 'default' }}
                                >
                                    {hasChildTitles ? (isOpen ? '▾' : '▸') : '·'}
                                </span>
                                <span
                                    onClick={() => { onSelect(`EDT:${node.codigo}`); setOpen(false); }}
                                    style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                    title={`${node.codigo} — ${node.nombre || ''} (${node.partidas} partidas)`}
                                >
                                    <span className="lob4d-mono" style={{ color: '#8d98a8' }}>{node.codigo}</span>
                                    {' '}{node.nombre || ''}
                                </span>
                                <span style={{ marginLeft: 'auto', color: '#66707e', fontSize: 10, flex: '0 0 auto' }}>{node.partidas}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Panel de prueba: anima el 4D por un parámetro custom del visor ──────────
// (p.ej. "Vaciado_Nro" con valores FASE 01..FASE 07). Independiente de P6:
// escanea el parámetro, descubre las fases y las recorre con su propio slider.
function ParamSimPanel({ onActiveChange }) {
    const [open, setOpen] = useState(false);
    const [propName, setPropName] = useState('Vaciado_Nro');
    const [scanning, setScanning] = useState(false);
    const [phases, setPhases] = useState(null); // string[]
    const [total, setTotal] = useState(0);
    const [idx, setIdx] = useState(0);
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        const onScanned = (e) => {
            setScanning(false);
            const d = e.detail;
            if (!d || !d.phases?.length) { setPhases([]); setTotal(0); return; }
            setPhases(d.phases);
            setTotal(d.total || 0);
            setIdx(0);
        };
        window.addEventListener('lob-param-scanned', onScanned);
        return () => window.removeEventListener('lob-param-scanned', onScanned);
    }, []);

    // Aplica la fase actual cada vez que cambia idx (con fases activas).
    useEffect(() => {
        if (!phases || !phases.length) return;
        onActiveChange?.(true);
        window.dispatchEvent(new CustomEvent('lob-param-step', { detail: { phaseIndex: idx } }));
    }, [idx, phases, onActiveChange]);

    // Reproducción automática fase por fase.
    useEffect(() => {
        if (!playing || !phases?.length) return undefined;
        const timer = window.setInterval(() => {
            setIdx((prev) => {
                if (prev >= phases.length - 1) { setPlaying(false); return prev; }
                return prev + 1;
            });
        }, 900);
        return () => window.clearInterval(timer);
    }, [playing, phases]);

    const scan = () => {
        setScanning(true);
        setPhases(null);
        setPlaying(false);
        window.dispatchEvent(new CustomEvent('lob-param-scan', { detail: { propName } }));
    };

    const exit = () => {
        setPlaying(false);
        setPhases(null);
        onActiveChange?.(false);
        window.dispatchEvent(new CustomEvent('lob-param-clear'));
    };

    if (!open) {
        return (
            <button
                type="button"
                className="lob4d-button"
                style={{ position: 'absolute', left: 18, bottom: 92, zIndex: 30 }}
                onClick={() => setOpen(true)}
                title="Anima el 4D usando un parámetro del visor (prueba controlada)"
            >
                🧪 Prueba por parámetro
            </button>
        );
    }

    return (
        <div className="lob4d-hud-card" style={{ position: 'absolute', left: 18, bottom: 92, zIndex: 30, width: 300, gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="lob4d-label" style={{ flex: 1 }}>Prueba por parámetro</div>
                <button type="button" className="lob4d-icon-button" onClick={() => { exit(); setOpen(false); }} title="Cerrar">x</button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
                <input
                    value={propName}
                    onChange={(e) => setPropName(e.target.value)}
                    placeholder="Nombre del parámetro"
                    style={{ flex: 1, minWidth: 0, background: '#0f1216', border: '1px solid #2a323d', color: '#dce3ee', borderRadius: 4, padding: '5px 8px', fontSize: 12 }}
                />
                <button type="button" className="lob4d-button primary" onClick={scan} disabled={scanning || !propName.trim()}>
                    {scanning ? '...' : 'Escanear'}
                </button>
            </div>

            {phases && phases.length === 0 && (
                <div style={{ color: '#f59e0b', fontSize: 11 }}>Sin valores para «{propName}» en los modelos cargados.</div>
            )}

            {phases && phases.length > 0 && (
                <>
                    <div style={{ color: '#8d98a8', fontSize: 11 }}>
                        {phases.length} fases · {total} elementos
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                            type="button"
                            className={`lob4d-play${playing ? ' pause' : ''}`}
                            style={{ width: 30, height: 30, flex: '0 0 auto' }}
                            onClick={() => setPlaying((p) => !p)}
                        >
                            {playing ? '||' : '>'}
                        </button>
                        <input
                            type="range"
                            className="lob4d-range"
                            min={0}
                            max={phases.length - 1}
                            step={1}
                            value={idx}
                            onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
                            style={{ flex: 1 }}
                        />
                    </div>
                    <div className="lob4d-mono" style={{ color: '#dce3ee', fontSize: 13, textAlign: 'center' }}>
                        {phases[idx]}
                        <span style={{ color: '#8d98a8', fontSize: 11 }}> · {idx + 1}/{phases.length}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#8d98a8', justifyContent: 'center' }}>
                        <span><span style={{ color: '#fb7318' }}>■</span> excavando</span>
                        <span><span style={{ color: '#3ac05c' }}>■</span> ejecutado</span>
                    </div>
                    <button type="button" className="lob4d-button ghost" onClick={exit}>Salir del modo prueba</button>
                </>
            )}
        </div>
    );
}

// Sólidos de movimiento de tierras: se detectan por nombre la primera vez y el
// usuario ajusta con el toggle ⛏ (persistido por navegador).
const EXCAV_STORE_KEY = 'lob4d_excav_urns';
const EXCAV_NAME_RE = /excav|relleno|mov(?:imiento)?[\s._-]*(?:de[\s._-]*)?tierra|earthwork/i;

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
    scheduleDomain,
    simDate,
    onDateChange,
    simSpeed,
    onSpeedChange,
    viewerStatus,
    setViewerStatus,
    activeFrente,
    lobData,
    excavationUrns,
    elementLinks,
    paramSimActive,
    onParamSimActiveChange,
    lobSeries,
}) {
    const dateMode = !!(scheduleDomain && simDate != null);
    return (
        <div className="lob4d-simulation">
            <div className="lob4d-viewer-shell">
                <LOB4DViewer
                    models={models}
                    selectedUrns={selectedUrns}
                    activeViewableGuids={activeViewableGuids}
                    simulationState={simulationState}
                    excavationUrns={excavationUrns}
                    elementLinks={elementLinks}
                    paramSimActive={paramSimActive}
                    onStatus={setViewerStatus}
                />
                <ParamSimPanel onActiveChange={onParamSimActiveChange} />
                <Hud simulationState={simulationState} lobSeries={lobSeries} />
                <LookaheadPanel lobSeries={lobSeries} onJumpDate={(t) => { setSimPlaying?.(false); onDateChange?.(t); }} />
                <div className="lob4d-timeline">
                    <button
                        type="button"
                        className={`lob4d-play${simPlaying ? ' pause' : ''}`}
                        onClick={onPlayToggle}
                        title={simPlaying ? 'Pausar' : 'Reproducir timelapse'}
                    >
                        {simPlaying ? '||' : '>'}
                    </button>
                    {dateMode ? (
                        <>
                            {[1, 7, 30].map((speed) => (
                                <button
                                    key={speed}
                                    type="button"
                                    className={`lob4d-front-button${simSpeed === speed ? ' active' : ''}`}
                                    style={{ padding: '3px 9px' }}
                                    onClick={() => onSpeedChange(speed)}
                                    title={`Paso: ${speed} día${speed === 1 ? '' : 's'} (para ◀ ▶ y Play)`}
                                >
                                    ×{speed}
                                </button>
                            ))}
                            {/* Control profesional: pasos discretos ◀ ▶ (día/semana/mes),
                                salto directo a fecha y botón Hoy. Play queda para timelapse. */}
                            <button
                                type="button"
                                className="lob4d-front-button"
                                style={{ padding: '3px 9px' }}
                                onClick={() => onDateChange(Math.max(scheduleDomain.min, (simDate ?? scheduleDomain.min) - simSpeed * DAY_MS))}
                                title={`Retroceder ${simSpeed} día${simSpeed === 1 ? '' : 's'}`}
                            >
                                ◀
                            </button>
                            <button
                                type="button"
                                className="lob4d-front-button"
                                style={{ padding: '3px 9px' }}
                                onClick={() => onDateChange(Math.min(scheduleDomain.max, (simDate ?? scheduleDomain.min) + simSpeed * DAY_MS))}
                                title={`Avanzar ${simSpeed} día${simSpeed === 1 ? '' : 's'}`}
                            >
                                ▶
                            </button>
                            <input
                                type="date"
                                value={simDate ? new Date(simDate).toISOString().slice(0, 10) : ''}
                                min={new Date(scheduleDomain.min).toISOString().slice(0, 10)}
                                max={new Date(scheduleDomain.max).toISOString().slice(0, 10)}
                                onChange={(event) => {
                                    const t = Date.parse(`${event.target.value}T00:00:00`);
                                    if (Number.isFinite(t)) onDateChange(Math.max(scheduleDomain.min, Math.min(scheduleDomain.max, t)));
                                }}
                                title="Saltar a una fecha exacta"
                                style={{ background: '#0f1216', border: '1px solid #2a323d', color: '#dce3ee', borderRadius: 5, padding: '3px 7px', fontSize: 12, colorScheme: 'dark' }}
                            />
                            <button
                                type="button"
                                className="lob4d-front-button"
                                style={{ padding: '3px 9px' }}
                                onClick={() => {
                                    const today = new Date(); today.setHours(0, 0, 0, 0);
                                    onDateChange(Math.max(scheduleDomain.min, Math.min(scheduleDomain.max, today.getTime())));
                                }}
                                title="Ir a la fecha de hoy"
                            >
                                Hoy
                            </button>
                            <input
                                type="range"
                                className="lob4d-range"
                                min={scheduleDomain.min}
                                max={scheduleDomain.max}
                                step={DAY_MS}
                                value={simDate}
                                onChange={(event) => onDateChange(Number(event.target.value))}
                            />
                            <span className="lob4d-mono" style={{ color: '#dce3ee', minWidth: 118, textAlign: 'right' }}>
                                {simulationState?.dateLabel}
                            </span>
                        </>
                    ) : (
                        <>
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
                        </>
                    )}
                </div>
                <div className="lob4d-viewer-status">{viewerStatus}</div>
            </div>
        </div>
    );
}

export default function LOB4DWorkspace({ onClose, models = [], activeViewableGuids = {}, project = null }) {
    const lobScope = useMemo(() => {
        const explicit = String(project?.id || '').trim();
        if (explicit) return explicit;
        const firstFront = modelFrontOf(models?.[0]);
        return firstFront && firstFront !== 'Frente actual' ? firstFront : null;
    }, [models, project]);
    const projectId = String(project?.baseName || project?.projectId || (lobScope ? lobScope.split('_')[0] : '') || '').trim();
    const frontId = String(project?.frontId || (lobScope && projectId && lobScope.startsWith(`${projectId}_`) ? lobScope.slice(projectId.length + 1) : '') || '').trim();
    const excavStoreKey = `${EXCAV_STORE_KEY}:${lobScope || 'unscoped'}`;

    const [activeTab, setActiveTab] = useState('planner');
    const [lobData, setLobData] = useState(null);
    const [linearState, setLinearState] = useState(null);
    const [dataStatus, setDataStatus] = useState({ text: 'Preparando base 4D...', progress: 5, state: 'loading' });
    const [viewerStatus, setViewerStatus] = useState('Preparando visor 4D...');
    const [selectedUrns, setSelectedUrns] = useState([]);
    const [modelPickerOpen, setModelPickerOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [datasetOpen, setDatasetOpen] = useState(false);
    const [datasets, setDatasets] = useState([]);
    const [elementLinks, setElementLinks] = useState([]);
    const [dataBusy, setDataBusy] = useState(false);
    const [dataError, setDataError] = useState('');
    const [excavUrns, setExcavUrns] = useState(null);
    // Multi-selección conectada: [] = todos; puede mezclar frentes nombrados y
    // una rama EDT. TODO el 4D (simulación, resumen, LOB, matriz, control y el
    // aislamiento 3D) se filtra por esta única selección.
    const [activeFrente, setActiveFrente] = useState([]);
    const [selectedPartidaCode, setSelectedPartidaCode] = useState(null);

    const toggleFrente = (front) => {
        setActiveFrente((prev) => {
            const list = Array.isArray(prev) ? prev : (prev ? [prev] : []);
            return list.includes(front) ? list.filter((f) => f !== front) : [...list, front];
        });
    };

    const setEdtScope = (value) => {
        setActiveFrente((prev) => {
            const list = (Array.isArray(prev) ? prev : (prev ? [prev] : [])).filter((f) => !String(f).startsWith('EDT:'));
            return value ? [...list, value] : list;
        });
    };
    const [simPeriod, setSimPeriod] = useState(0);
    const [simPlaying, setSimPlaying] = useState(false);
    const [simDate, setSimDate] = useState(null);   // timelapse por calendario P6 (ms)
    const [simSpeed, setSimSpeed] = useState(7);    // días por tick: 1 / 7 / 30
    const [paramSimActive, setParamSimActive] = useState(false); // modo prueba por parámetro

    // ESPEJO DEL VISOR: el 4D debe cargar EXACTAMENTE lo que está visible en el
    // visor principal al abrir — no la config del proyecto (que lista modelos que
    // el usuario quizá nunca cargó, y con vistas por defecto que no abrió).
    // Se captura una sola vez al montar, leyendo los modelos VISIBLES de NOP_VIEWER
    // + el GUID de la vista realmente cargada por cada uno.
    const [liveViewerModels] = useState(() => {
        // FUENTE AUTORITATIVA: registro que el visor principal publica al cargar
        // cada modelo (Viewer.jsx → window.__viewerLiveModels). Trae el URN real,
        // el GUID de la vista efectivamente cargada y el nombre. Es fiable; el visor
        // es quien conoce esos datos (re-derivarlos con getData() del Model falla).
        try {
            const registry = window.__viewerLiveModels;
            if (registry && typeof registry === 'object') {
                const items = Object.values(registry)
                    .filter((entry) => entry && entry.urn)
                    .map((entry) => ({
                        urn: cleanUrn(entry.urn),
                        name: entry.name || null,
                        viewGuid: entry.viewGuid || null,
                    }));
                if (items.length) return items;
            }
        } catch { /* cae al método por viewer */ }

        // Respaldo: leer del viewer directamente (menos fiable para vista/nombre).
        try {
            const viewer = window.NOP_VIEWER;
            if (!viewer) return [];
            let live = viewer.getVisibleModels?.();
            if (!live || !live.length) live = viewer.getAllModels?.() || [];
            return live
                .map((model) => {
                    const data = model.getData?.() || {};
                    if (!data.urn || data.is2d) return null;
                    const node = model.getDocumentNode?.();
                    let name = null;
                    try { name = node?.getModelName?.(); } catch { /* noop */ }
                    return {
                        urn: cleanUrn(data.urn),
                        name: name || null,
                        viewGuid: node?.data?.guid || null,
                    };
                })
                .filter(Boolean);
        } catch {
            return [];
        }
    });

    const availableModels = useMemo(() => {
        // Metadata de la config indexada por URN (para etiquetas/frente).
        const configByUrn = new Map();
        (models || []).forEach((model) => {
            const urn = modelUrnOf(model);
            if (urn) configByUrn.set(urn, model);
        });

        // Fuente autoritativa = lo visible en el visor. Enriquecido con la config.
        if (liveViewerModels.length) {
            return liveViewerModels.map((live) => {
                const cfg = configByUrn.get(live.urn) || {};
                return {
                    ...cfg,
                    ...live,
                    _lobUrn: live.urn,
                    _lobLabel: live.name || (cfg.name ? modelLabelOf(cfg) : null) || `Modelo ${live.urn.slice(0, 8)}…`,
                    _lobFront: cfg.appProjectId || cfg.project || cfg.front || cfg.frente || 'En visor',
                    // Prioriza la vista cargada en pantalla; si no, la de config.
                    defaultViewGuid: live.viewGuid || cfg.defaultViewGuid || null,
                };
            });
        }

        // Respaldo: sin visor disponible, usa la config del proyecto (comportamiento previo).
        return (models || [])
            .map((model) => ({
                ...model,
                _lobUrn: modelUrnOf(model),
                _lobLabel: modelLabelOf(model),
                _lobFront: modelFrontOf(model),
            }))
            .filter((model) => model._lobUrn);
    }, [models, liveViewerModels]);

    const maxPeriod = useMemo(() => getMaxPeriod(lobData), [lobData]);

    // Timelapse REAL: dominio de fechas P6 del frente activo. Si existe, el
    // scrub es por calendario (día a día); si no, cae al modo VAL antiguo.
    const scheduleDomain = useMemo(() => getScheduleDomain(lobData, activeFrente), [lobData, activeFrente]);

    useEffect(() => {
        if (!scheduleDomain) return;
        setSimDate((prev) => {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const seed = prev ?? today.getTime();
            return Math.max(scheduleDomain.min, Math.min(scheduleDomain.max, seed));
        });
    }, [scheduleDomain]);

    const simulationState = useMemo(() => {
        if (scheduleDomain && simDate != null) {
            return computeSimulationStateByDate(lobData, activeFrente, simDate);
        }
        return computeSimulationState(lobData, simPeriod, activeFrente);
    }, [lobData, simPeriod, activeFrente, scheduleDomain, simDate]);

    // Series LOB compartidas: la vista LOB las usa Y el HUD/side panel las
    // consumen para KPIs empresariales (EVM, look-ahead). Un solo cómputo.
    const lobSeries = useMemo(() => {
        if (!lobData || !simulationState?.date) return null;
        return buildLobSeries(lobData, activeFrente, simulationState.date.getTime());
    }, [lobData, activeFrente, simulationState]);

    useEffect(() => {
        if (!selectedPartidaCode) return;
        const valid = getFilteredPartidas(lobData, activeFrente)
            .some((partida) => partida.codigo === selectedPartidaCode);
        if (!valid) setSelectedPartidaCode(null);
    }, [activeFrente, lobData, selectedPartidaCode]);

    useEffect(() => {
        setSelectedUrns((prev) => {
            const valid = new Set(availableModels.map((model) => model._lobUrn));
            const kept = prev.filter((urn) => valid.has(urn));
            return kept.length ? kept : availableModels.map((model) => model._lobUrn);
        });
    }, [availableModels]);

    // Scope estricto: una seleccion de tierras nunca se hereda a otra obra/frente.
    useEffect(() => {
        if (!availableModels.length) return;
        try {
            const stored = localStorage.getItem(excavStoreKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                setExcavUrns(Array.isArray(parsed) ? parsed : []);
                return;
            }
        } catch { /* seed automatico */ }
        setExcavUrns(availableModels
            .filter((model) => EXCAV_NAME_RE.test(model._lobLabel || ''))
            .map((model) => model._lobUrn));
    }, [availableModels, excavStoreKey]);

    useEffect(() => {
        if (excavUrns == null) return;
        try { localStorage.setItem(excavStoreKey, JSON.stringify(excavUrns)); } catch { /* noop */ }
    }, [excavUrns, excavStoreKey]);

    // LOB → 3D: cambia a la cabina de Simulación y pide al visor aislar+volar
    // a los elementos de la partida (codes) o de la rama (prefix). Reintento a
    // 1.5s por si el visor 4D recién está arrancando.
    const show3DFor = useCallback((detail) => {
        setActiveTab('simulation');
        const fire = () => window.dispatchEvent(new CustomEvent('lob-focus-elements', { detail }));
        fire();
        window.setTimeout(fire, 1500);
    }, []);

    const toggleExcav = (urn) => {
        setExcavUrns((prev) => {
            const list = prev || [];
            return list.includes(urn) ? list.filter((item) => item !== urn) : [...list, urn];
        });
    };

    // Frente activo → 3D: aísla en el visor los elementos de la rama. Se envía:
    // codes (prefijos EDT), activityIds (actividades cuyas partidas caen en la
    // rama → pertenencia por PLANEAMIENTO, inmune a CodigoDePartida cruzados) y
    // mappedActivityIds (todas las mapeadas, para saber cuándo confiar en el
    // planeamiento). window.__lobScope queda para visores que arrancan después.
    useEffect(() => {
        const selectedPartida = selectedPartidaCode
            ? (lobData?.partidas || []).find((partida) => partida.codigo === selectedPartidaCode)
            : null;
        const codes = selectedPartida ? [selectedPartida.codigo] : getFrontCodes(lobData, activeFrente);
        let activityIds = null;
        let mappedActivityIds = null;
        if (codes) {
            const inScope = new Set();
            const scopedPartidas = selectedPartida ? [selectedPartida] : getFilteredPartidas(lobData, activeFrente);
            scopedPartidas.forEach((p) => {
                if (p.activity_id) inScope.add(String(p.activity_id).trim());
            });
            activityIds = [...inScope];
            const mapped = new Set();
            (lobData?.partidas || []).forEach((p) => {
                if ((p.tipo || 'partida') === 'partida' && p.activity_id) mapped.add(String(p.activity_id).trim());
            });
            mappedActivityIds = [...mapped];
        }
        const detail = { codes: codes || null, activityIds, mappedActivityIds };
        window.__lobScope = detail;
        window.dispatchEvent(new CustomEvent('lob-scope-change', { detail }));
    }, [activeFrente, activeTab, lobData, selectedPartidaCode]);


    useEffect(() => {
        try { window.NOP_VIEWER?.stop?.(); } catch { /* noop */ }
        return () => {
            try { window.dispatchEvent(new CustomEvent('lob-clear')); } catch { /* noop */ }
            try { window.NOP_VIEWER?.start?.(); } catch { /* noop */ }
        };
    }, []);

    const fetchTimeline = useCallback(async () => {
        if (!lobScope || !projectId) throw new Error('Abre 4D LOB desde un proyecto y frente validos.');
        const query = new URLSearchParams({ scope_urn: lobScope, project_id: projectId });
        if (frontId) query.set('front_id', frontId);
        const response = await apiFetch(`${BACKEND_URL}/api/lob/timeline?${query}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'No se pudo consultar el timeline 4D.');
        return data;
    }, [frontId, lobScope, projectId]);

    const fetchDatasets = useCallback(async () => {
        if (!lobScope || !projectId) return [];
        const query = new URLSearchParams({ scope_urn: lobScope, project_id: projectId });
        if (frontId) query.set('front_id', frontId);
        const response = await apiFetch(`${BACKEND_URL}/api/lob/datasets?${query}`);
        if (!response.ok) return [];
        const data = await response.json();
        return data.datasets || [];
    }, [frontId, lobScope, projectId]);

    const fetchElementLinks = useCallback(async (datasetId) => {
        if (!datasetId || !lobScope || !projectId) return [];
        const query = new URLSearchParams({ scope_urn: lobScope, project_id: projectId, dataset_id: datasetId });
        if (frontId) query.set('front_id', frontId);
        const response = await apiFetch(`${BACKEND_URL}/api/lob/links?${query}`);
        if (!response.ok) return [];
        const data = await response.json();
        return data.links || [];
    }, [frontId, lobScope, projectId]);

    const fetchLinearState = useCallback(async () => {
        if (!lobScope || !projectId) return null;
        const query = new URLSearchParams({ scope_urn: lobScope, project_id: projectId });
        if (frontId) query.set('front_id', frontId);
        const response = await apiFetch(`${BACKEND_URL}/api/lob/linear/state?${query}`);
        if (!response.ok) return null;
        return response.json();
    }, [frontId, lobScope, projectId]);

    const loadData = useCallback(async () => {
        try {
            setDataStatus({ text: 'Consultando dataset 4D...', progress: 18, state: 'loading' });
            const [data, versions, linear] = await Promise.all([fetchTimeline(), fetchDatasets(), fetchLinearState()]);
            setLobData(data);
            setDatasets(versions);
            setLinearState(linear);
            // multi-selección: conservar solo entradas aún válidas (EDT siempre lo es)
            setActiveFrente((prev) => {
                const list = Array.isArray(prev) ? prev : (prev ? [prev] : []);
                return list.filter((f) => String(f).startsWith('EDT:') || data.frentes?.[f]);
            });
            const links = data.dataset?.id ? await fetchElementLinks(data.dataset.id) : [];
            setElementLinks(links);
            const quality = data.quality || {};
            const versionLabel = data.dataset ? `v${data.dataset.version}` : quality.legacy ? 'heredado' : 'sin version';
            setDataStatus({
                text: (data.partidas || []).length
                    ? `Dataset ${versionLabel}: ${data.partidas.length} partidas · P6 ${Number(quality.cobertura_p6_pct || 0).toFixed(0)}% · ${links.length} vinculos BIM.`
                    : 'Sin dataset 4D publicado para este frente.',
                progress: 100,
                state: (data.partidas || []).length ? 'ready' : 'empty',
            });
        } catch (err) {
            console.error('[LOB4DWorkspace] datos:', err);
            setLobData(null);
            setElementLinks([]);
            setDataStatus({ text: `4D sin datos: ${err.message}`, progress: 100, state: 'error' });
        }
    }, [fetchDatasets, fetchElementLinks, fetchLinearState, fetchTimeline]);

    const bootstrapLinear = useCallback(async (values) => {
        if (!lobScope || !projectId) return;
        setDataBusy(true);
        setDataError('');
        setDataStatus({ text: 'Creando estandar LOB Linear 1.0...', progress: 35, state: 'loading' });
        try {
            const response = await apiFetch(`${BACKEND_URL}/api/lob/linear/bootstrap`, {
                method: 'POST',
                body: JSON.stringify({
                    ...values,
                    scope_urn: lobScope,
                    project_id: projectId,
                    front_id: frontId || undefined,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'No se pudo configurar el proyecto lineal.');
            setLinearState(payload);
            setDataStatus({ text: `${payload.standard}: proyecto lineal configurado.`, progress: 100, state: 'ready' });
        } catch (err) {
            setDataError(err.message);
            setDataStatus({ text: `Configuracion lineal detenida: ${err.message}`, progress: 100, state: 'error' });
        } finally {
            setDataBusy(false);
        }
    }, [frontId, lobScope, projectId]);

    // Progresivas desde el eje: pide al visor 4D proyectar cada elemento al
    // alineamiento activo → rangos por partida → persiste en lob_locations →
    // recarga el timeline (la Línea de Balance pasa a Tiempo × Progresiva).
    const deriveStationsFromAxis = useCallback(async () => {
        setDataStatus({ text: 'Proyectando elementos al eje activo...', progress: 25, state: 'loading' });
        const result = await new Promise((resolve) => {
            const onDone = (event) => {
                window.removeEventListener('lob-stations-derived', onDone);
                resolve(event.detail || null);
            };
            window.addEventListener('lob-stations-derived', onDone);
            window.dispatchEvent(new CustomEvent('lob-derive-stations'));
            window.setTimeout(() => {
                window.removeEventListener('lob-stations-derived', onDone);
                resolve(null);
            }, 90000);
        });

        if (!result) {
            setDataStatus({ text: 'Progresivas: el visor 4D no respondió — abre la pestaña Simulación 4D con los modelos cargados.', progress: 100, state: 'error' });
            return;
        }
        if (!result.ok) {
            setDataStatus({ text: `Progresivas: ${result.reason}`, progress: 100, state: 'error' });
            return;
        }
        if (!result.ranges?.length) {
            setDataStatus({ text: `Progresivas: ${result.elements} elementos proyectados pero ninguna partida obtuvo rango (¿elementos muy lejos del eje?).`, progress: 100, state: 'error' });
            return;
        }

        try {
            setDataStatus({ text: `Guardando ${result.ranges.length} rangos de progresiva...`, progress: 70, state: 'loading' });
            const response = await apiFetch(`${BACKEND_URL}/api/lob/locations`, {
                method: 'POST',
                body: JSON.stringify({
                    model_urn: lobScope,
                    project_id: projectId,
                    front_id: frontId || undefined,
                    locations: result.ranges.map((r) => ({
                        codigo: r.codigo,
                        alignment_id: result.alignmentId,
                        station_start: r.station_start,
                        station_end: r.station_end,
                        source: 'eje_visor',
                    })),
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'No se pudo guardar en lob_locations.');
            setDataStatus({ text: `Progresivas listas: ${result.elements} elementos → ${result.ranges.length} partidas con rango. Recargando...`, progress: 90, state: 'loading' });
            await loadData();
        } catch (err) {
            setDataStatus({ text: `Progresivas: ${err.message}`, progress: 100, state: 'error' });
        }
    }, [lobScope, projectId, frontId, loadData]);

    const importDataset = useCallback(async ({ duraciones, metrados, cronograma, name, dataDate }) => {
        if (!lobScope || !projectId) return;
        setDataBusy(true);
        setDataError('');
        const formData = new FormData();
        formData.append('scope_urn', lobScope);
        formData.append('project_id', projectId);
        if (frontId) formData.append('front_id', frontId);
        formData.append('data_date', dataDate || todayISO());
        if (name?.trim()) formData.append('name', name.trim());
        if (duraciones) formData.append('duraciones', duraciones);
        if (metrados) formData.append('metrados', metrados);
        if (cronograma) formData.append('cronograma', cronograma);

        try {
            await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', `${BACKEND_URL}/api/lob/import`);
                Object.entries(getUploadAuthHeaders()).forEach(([key, value]) => xhr.setRequestHeader(key, value));
                xhr.upload.onprogress = (event) => {
                    if (!event.lengthComputable) return;
                    const progress = 10 + Math.round((event.loaded / event.total) * 65);
                    setDataStatus({ text: 'Subiendo fuentes 4D...', progress, state: 'loading' });
                };
                xhr.upload.onload = () => {
                    setDataStatus({ text: 'Procesando Excel, P6 y vinculos BIM...', progress: 78, state: 'loading' });
                };
                xhr.onload = () => {
                    const result = (() => { try { return JSON.parse(xhr.responseText || '{}'); } catch { return {}; } })();
                    if (xhr.status >= 200 && xhr.status < 300) resolve(result);
                    else reject(new Error(result.error || `Importacion fallida (${xhr.status}).`));
                };
                xhr.onerror = () => reject(new Error('No se pudo conectar con el backend 4D.'));
                setDataStatus({ text: 'Preparando nueva version...', progress: 8, state: 'loading' });
                xhr.send(formData);
            });
            setDataStatus({ text: 'Actualizando espacio de trabajo...', progress: 92, state: 'loading' });
            await loadData();
            setImportOpen(false);
        } catch (err) {
            setDataError(err.message || 'No se pudo publicar el dataset.');
            setDataStatus({ text: `Importacion detenida: ${err.message}`, progress: 100, state: 'error' });
        } finally {
            setDataBusy(false);
        }
    }, [frontId, loadData, lobScope, projectId]);

    const activateDataset = useCallback(async (datasetId) => {
        setDataBusy(true);
        try {
            const response = await apiFetch(`${BACKEND_URL}/api/lob/datasets/${datasetId}/activate`, {
                method: 'POST',
                body: JSON.stringify({ scope_urn: lobScope, project_id: projectId, front_id: frontId || undefined }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || 'No se pudo activar la version.');
            await loadData();
        } catch (err) {
            setDataError(err.message);
        } finally {
            setDataBusy(false);
        }
    }, [frontId, loadData, lobScope, projectId]);

    const rebuildLinks = useCallback(async (datasetId) => {
        setDataBusy(true);
        try {
            const response = await apiFetch(`${BACKEND_URL}/api/lob/links/rebuild`, {
                method: 'POST',
                body: JSON.stringify({ scope_urn: lobScope, project_id: projectId, front_id: frontId || undefined, dataset_id: datasetId }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || 'No se pudieron actualizar los vinculos.');
            await loadData();
        } catch (err) {
            setDataError(err.message);
        } finally {
            setDataBusy(false);
        }
    }, [frontId, loadData, lobScope, projectId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (!simPlaying) return undefined;
        const DAY = 86400000;
        const timer = window.setInterval(() => {
            if (scheduleDomain) {
                setSimDate((prev) => {
                    const next = (prev ?? scheduleDomain.min) + simSpeed * DAY;
                    if (next >= scheduleDomain.max) {
                        setSimPlaying(false);
                        return scheduleDomain.max;
                    }
                    return next;
                });
            } else {
                setSimPeriod((prev) => {
                    const next = prev + 0.05;
                    if (next >= maxPeriod) {
                        setSimPlaying(false);
                        return maxPeriod;
                    }
                    return next;
                });
            }
        }, 130);
        return () => window.clearInterval(timer);
    }, [simPlaying, maxPeriod, scheduleDomain, simSpeed]);

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
                <button
                    type="button"
                    className="lob4d-button ghost"
                    onClick={async () => {
                        try {
                            setDataStatus({ text: 'Generando reporte PDF...', progress: 40, state: 'loading' });
                            const { jsPDF } = await import('jspdf');
                            window.__jsPDF = jsPDF;
                            const { generateExecutiveReport } = await import('./executiveReport');
                            const pdf = generateExecutiveReport({
                                projectName: project?.name || 'Proyecto',
                                frenteLabel: (Array.isArray(activeFrente) ? activeFrente.join(' + ') : activeFrente) || 'Todos los frentes',
                                dataset: lobData?.dataset,
                                simulationState,
                                lobSeries,
                            });
                            const stamp = new Date().toISOString().slice(0, 10);
                            pdf.save(`4DLOB_${(project?.name || 'proyecto').replace(/\s+/g, '_')}_${stamp}.pdf`);
                            setDataStatus({ text: 'Reporte PDF generado.', progress: 100, state: 'ready' });
                        } catch (err) {
                            console.error('[LOB4D] PDF report', err);
                            setDataStatus({ text: `PDF: ${err.message || err}`, progress: 100, state: 'error' });
                        }
                    }}
                    title="Descargar reporte PDF ejecutivo (KPIs, Curva S, Look-ahead, Alertas)"
                >
                    📄 Reporte PDF
                </button>
                <AlertsButton lobSeries={lobSeries} onJumpDate={(t) => { if (t) { setSimPlaying(false); setSimDate(t); } }} />
                <BaselineButton
                    scope={lobScope}
                    hasBaseline={!!lobSeries?.baseline}
                    baselineInfo={lobSeries?.baseline}
                    onSnapshot={() => {
                        const snap = snapshotBaseline(lobData, lobScope);
                        if (snap) setDataStatus({ text: `Baseline congelado: ${Object.keys(snap.partidas).length} partidas (v${lobData?.dataset?.version || '?'})`, progress: 100, state: 'ready' });
                    }}
                    onClear={() => { clearBaseline(lobScope); setDataStatus({ text: 'Baseline eliminado.', progress: 100, state: 'ready' }); }}
                />
                <button
                    type="button"
                    className="lob4d-button ghost"
                    onClick={deriveStationsFromAxis}
                    title="Proyecta cada elemento al eje activo de Civil → PK por elemento → rango de progresiva por partida (Línea de Balance Tiempo × Progresiva)"
                >
                    📍 Progresivas ← eje
                </button>
                <button type="button" className="lob4d-button ghost" onClick={() => { setDataError(''); setImportOpen(true); }}>
                    Publicar datos
                </button>
                <button type="button" className="lob4d-button ghost" onClick={() => setDatasetOpen(true)}>
                    {lobData?.dataset ? `Version v${lobData.dataset.version}` : 'Versiones'}
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
                        className={`lob4d-front-button${!activeFrente?.length ? ' active' : ''}`}
                        onClick={() => setActiveFrente([])}
                    >
                        Todos
                    </button>
                    {frontNames.map((front) => (
                        <button
                            key={front}
                            type="button"
                            className={`lob4d-front-button${activeFrente?.includes?.(front) ? ' active' : ''}`}
                            onClick={() => toggleFrente(front)}
                            title="Clic para sumar/quitar de la selección (multi-frente)"
                        >
                            {front}
                        </button>
                    ))}
                    <FrenteEdtPicker
                        lobData={lobData}
                        activeFrente={activeFrente}
                        onSelect={setEdtScope}
                    />
                </div>
            </div>

            <main className="lob4d-main">
                {activeTab === 'planner' && (
                    <LinearPlanningView
                        state={linearState}
                        lobData={lobData}
                        onBootstrap={bootstrapLinear}
                        onDeriveStations={deriveStationsFromAxis}
                        busy={dataBusy}
                        error={dataError}
                    />
                )}
                {['simulation', 'balance', 'matrix', 'control'].includes(activeTab) && (
                    <div className="lob4d-operational-layout">
                        <section className="lob4d-operational-view">
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
                                    scheduleDomain={scheduleDomain}
                                    simDate={simDate}
                                    onDateChange={(value) => { setSimPlaying(false); setSimDate(value); }}
                                    simSpeed={simSpeed}
                                    onSpeedChange={setSimSpeed}
                                    viewerStatus={viewerStatus}
                                    setViewerStatus={setViewerStatus}
                                    activeFrente={activeFrente}
                                    lobData={lobData}
                                    excavationUrns={excavUrns || []}
                                    elementLinks={lobData?.dataset ? elementLinks : null}
                                    paramSimActive={paramSimActive}
                                    onParamSimActiveChange={setParamSimActive}
                                    lobSeries={lobSeries}
                                />
                            )}
                            {activeTab === 'balance' && (
                                <LineBalanceView
                                    lobData={lobData}
                                    activeFrente={activeFrente}
                                    simulationState={simulationState}
                                    selectedCode={selectedPartidaCode}
                                    onPartidaSelect={setSelectedPartidaCode}
                                    onZoneSelect={(code) => setEdtScope(`EDT:${code}`)}
                                    onJumpDate={(t) => { setSimPlaying(false); setSimDate(Math.max(scheduleDomain?.min ?? t, Math.min(scheduleDomain?.max ?? t, t))); }}
                                    onDeriveStations={deriveStationsFromAxis}
                                    onShow3D={show3DFor}
                                />
                            )}
                            {activeTab === 'matrix' && (
                                <ProgressMatrixView
                                    lobData={lobData}
                                    activeFrente={activeFrente}
                                    simulationState={simulationState}
                                    selectedCode={selectedPartidaCode}
                                    onPartidaSelect={setSelectedPartidaCode}
                                />
                            )}
                            {activeTab === 'control' && (
                                <ControlView lobData={lobData} activeFrente={activeFrente} />
                            )}
                        </section>
                        <WorkPackagePanel
                            lobData={lobData}
                            activeFrente={activeFrente}
                            simulationState={simulationState}
                            selectedCode={selectedPartidaCode}
                            onSelect={setSelectedPartidaCode}
                        />
                    </div>
                )}
                {activeTab === 'edt' && (
                    <EdtExplorer lobData={lobData} activeFrente={activeFrente} />
                )}
            </main>

            {modelPickerOpen && (
                <ModelPicker
                    models={availableModels}
                    selectedUrns={selectedUrns}
                    excavUrns={excavUrns || []}
                    onToggle={toggleModel}
                    onToggleExcav={toggleExcav}
                    onAll={() => setSelectedUrns(availableModels.map((model) => model._lobUrn))}
                    onClose={() => setModelPickerOpen(false)}
                />
            )}

            {importOpen && (
                <DataImportModal
                    hasDataset={!!lobData?.dataset}
                    onImport={importDataset}
                    onClose={() => !dataBusy && setImportOpen(false)}
                    busy={dataBusy}
                    error={dataError}
                />
            )}

            {datasetOpen && (
                <DatasetModal
                    datasets={datasets}
                    onActivate={activateDataset}
                    onRebuildLinks={rebuildLinks}
                    onClose={() => setDatasetOpen(false)}
                    busy={dataBusy}
                />
            )}
        </div>
    );
}
