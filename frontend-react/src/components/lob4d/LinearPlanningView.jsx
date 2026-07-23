import React, { useMemo, useState } from 'react';

const PROJECT_TYPES = [
    ['road', 'Carretera'],
    ['rail', 'Ferrocarril'],
    ['canal', 'Canal'],
    ['pipeline', 'Tuberia'],
    ['tunnel', 'Tunel'],
    ['transmission', 'Linea de transmision'],
    ['other', 'Otro proyecto lineal'],
];

const formatPk = (value) => {
    const numeric = Number(value || 0);
    const km = Math.floor(Math.abs(numeric) / 1000);
    const metres = Math.abs(numeric) % 1000;
    return `${numeric < 0 ? '-' : ''}${km}+${metres.toFixed(2).padStart(6, '0')}`;
};

function SetupForm({ onSubmit, busy, error, initialRange }) {
    const [name, setName] = useState('');
    const [projectType, setProjectType] = useState('canal');
    const [stationStart, setStationStart] = useState(initialRange.start);
    const [stationEnd, setStationEnd] = useState(initialRange.end);
    const [segmentLength, setSegmentLength] = useState(100);
    const [hoursPerDay, setHoursPerDay] = useState(8);

    const submit = (event) => {
        event.preventDefault();
        onSubmit({
            name: name.trim() || undefined,
            project_type: projectType,
            station_start: Number(stationStart),
            station_end: Number(stationEnd),
            segment_length: Number(segmentLength),
            station_unit: 'm',
            calendar: { work_days: [1, 2, 3, 4, 5, 6], hours_per_day: Number(hoursPerDay) },
        });
    };

    return (
        <form className="lob-linear-setup" onSubmit={submit}>
            <div className="lob-linear-setup-heading">
                <span className="lob4d-badge">1.0</span>
                <div>
                    <div className="lob4d-view-title">Configurar proyecto lineal</div>
                    <div className="lob4d-view-copy">Define el sistema de ubicaciones que gobernara cronograma, BIM, costos y campo.</div>
                </div>
            </div>
            <div className="lob-linear-form-grid">
                <label className="lob4d-field lob-linear-span-2">
                    <span>Nombre del plan lineal</span>
                    <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Plan maestro de ejecucion" />
                </label>
                <label className="lob4d-field">
                    <span>Tipo de infraestructura</span>
                    <select value={projectType} onChange={(event) => setProjectType(event.target.value)}>
                        {PROJECT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                </label>
                <label className="lob4d-field">
                    <span>Jornada</span>
                    <input type="number" min="1" max="24" value={hoursPerDay} onChange={(event) => setHoursPerDay(event.target.value)} />
                </label>
                <label className="lob4d-field">
                    <span>P.K. inicial</span>
                    <input type="number" step="0.01" value={stationStart} onChange={(event) => setStationStart(event.target.value)} required />
                </label>
                <label className="lob4d-field">
                    <span>P.K. final</span>
                    <input type="number" step="0.01" value={stationEnd} onChange={(event) => setStationEnd(event.target.value)} required />
                </label>
                <label className="lob4d-field lob-linear-span-2">
                    <span>Longitud de sector de produccion</span>
                    <input type="number" min="1" step="1" value={segmentLength} onChange={(event) => setSegmentLength(event.target.value)} required />
                </label>
            </div>
            {error && <div className="lob4d-import-error">{error}</div>}
            <div className="lob-linear-setup-actions">
                <span>Los rendimientos iniciales son plantillas y deben calibrarse con el contrato.</span>
                <button type="submit" className="lob4d-button primary" disabled={busy}>
                    {busy ? 'Configurando...' : 'Crear estandar lineal'}
                </button>
            </div>
        </form>
    );
}

function Readiness({ report }) {
    return (
        <section className="lob-linear-readiness">
            <div className="lob-linear-section-head">
                <div>
                    <div className="lob4d-label">Preparacion del proyecto</div>
                    <strong>{report?.score || 0}%</strong>
                </div>
                <div className="lob-linear-score-track"><span style={{ width: `${report?.score || 0}%` }} /></div>
            </div>
            <div className="lob-linear-checks">
                {(report?.checks || []).map((check) => (
                    <div key={check.key} className={check.ready ? 'ready' : ''}>
                        <span>{check.ready ? 'OK' : '--'}</span>
                        {check.label}
                    </div>
                ))}
            </div>
        </section>
    );
}

function TimeLocationPreview({ zones, steps }) {
    const rows = zones.slice(0, 16);
    const columns = steps.slice(0, 10);
    return (
        <section className="lob-linear-flow">
            <div className="lob-linear-section-head">
                <div>
                    <div className="lob4d-view-title">Sistema de produccion por ubicacion</div>
                    <div className="lob4d-view-copy">Sectores y secuencia base del metodo constructivo.</div>
                </div>
                <span className="lob4d-mono">{zones.length} sectores x {steps.length} procesos</span>
            </div>
            <div className="lob-linear-flow-scroll">
                <div className="lob-linear-flow-grid" style={{ '--lob-linear-cols': Math.max(1, columns.length) }}>
                    <div className="lob-linear-flow-corner">P.K.</div>
                    {columns.map((step) => (
                        <div key={step.step_code} className="lob-linear-flow-header" title={step.name}>
                            <span style={{ background: step.color }} />{step.step_code}
                        </div>
                    ))}
                    {rows.map((zone, rowIndex) => (
                        <React.Fragment key={zone.id || zone.code}>
                            <div className="lob-linear-zone-label">
                                <strong>{zone.code}</strong>
                                <span>{formatPk(zone.station_start)} - {formatPk(zone.station_end)}</span>
                            </div>
                            {columns.map((step, colIndex) => (
                                <div key={`${zone.code}-${step.step_code}`} className="lob-linear-flow-cell">
                                    <span
                                        style={{
                                            background: step.color,
                                            transform: `translateX(${Math.min(48, (rowIndex + colIndex) * 3)}%)`,
                                        }}
                                        title={`${zone.name} / ${step.name}`}
                                    />
                                </div>
                            ))}
                        </React.Fragment>
                    ))}
                </div>
            </div>
            {zones.length > rows.length && <div className="lob-linear-more">+ {zones.length - rows.length} sectores adicionales</div>}
        </section>
    );
}

export default function LinearPlanningView({ state, lobData, onBootstrap, onDeriveStations, busy, error }) {
    const initialRange = useMemo(() => {
        const locations = Object.values(lobData?.locations || {});
        const values = locations.flatMap((location) => [Number(location.station_start), Number(location.station_end)]).filter(Number.isFinite);
        return { start: values.length ? Math.min(...values) : 0, end: values.length ? Math.max(...values) : 1000 };
    }, [lobData]);

    if (!state?.profile) {
        return (
            <div className="lob4d-workspace-view lob-linear-empty-view">
                <SetupForm onSubmit={onBootstrap} busy={busy} error={error} initialRange={initialRange} />
            </div>
        );
    }

    const methodology = state.methodologies?.find((item) => item.is_default) || state.methodologies?.[0];
    const steps = methodology?.steps || [];
    const profile = state.profile;

    return (
        <div className="lob4d-workspace-view">
            <div className="lob4d-view-header lob-linear-header">
                <div>
                    <div className="lob4d-view-title">{profile.name}</div>
                    <div className="lob4d-view-copy">
                        {profile.standard_version} / {PROJECT_TYPES.find(([value]) => value === profile.project_type)?.[1] || profile.project_type}
                        {' / '}{formatPk(profile.station_start)} - {formatPk(profile.station_end)}
                    </div>
                </div>
                <div className="lob4d-topbar-spacer" />
                <span className={`lob-linear-status ${state.readiness?.ready ? 'ready' : ''}`}>
                    {state.readiness?.ready ? 'Listo para control' : 'Configuracion en curso'}
                </span>
                <button type="button" className="lob4d-button" onClick={onDeriveStations} disabled={busy || !state.dataset}>
                    Calcular P.K. desde eje
                </button>
            </div>
            <div className="lob4d-content-scroll lob-linear-content">
                <Readiness report={state.readiness} />
                <div className="lob-linear-kpis">
                    <div><span>Sectores</span><strong>{state.counts?.zones || 0}</strong></div>
                    <div><span>Procesos</span><strong>{state.counts?.steps || 0}</strong></div>
                    <div><span>Cuadrillas</span><strong>{state.counts?.resources || 0}</strong></div>
                    <div><span>Relaciones P6</span><strong>{state.counts?.relations || 0}</strong></div>
                    <div><span>Elementos BIM</span><strong>{state.counts?.links || 0}</strong></div>
                    <div><span>Registros de campo</span><strong>{state.counts?.progress_events || 0}</strong></div>
                </div>
                <TimeLocationPreview zones={state.zones || []} steps={steps} />
                <div className="lob-linear-grid-two">
                    <section className="lob-linear-table-section">
                        <div className="lob-linear-section-head">
                            <div className="lob4d-view-title">Metodologia base</div>
                            <span>{methodology?.name || 'Sin metodologia'}</span>
                        </div>
                        <div className="lob-linear-step-list">
                            {steps.map((step) => (
                                <div key={step.step_code}>
                                    <span className="lob-linear-step-color" style={{ background: step.color }} />
                                    <strong>{step.sequence}. {step.name}</strong>
                                    <span>{step.production_rate || '-'} {step.production_unit || ''}</span>
                                    <span>{step.crew_code || '-'}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                    <section className="lob-linear-table-section">
                        <div className="lob-linear-section-head">
                            <div className="lob4d-view-title">Escenarios y lineas base</div>
                            <span>{state.scenarios?.length || 0} versiones</span>
                        </div>
                        <div className="lob-linear-scenario-list">
                            {(state.scenarios || []).map((scenario) => (
                                <div key={scenario.id}>
                                    <span className={scenario.is_active ? 'active' : ''} />
                                    <strong>{scenario.name}</strong>
                                    <small>{scenario.scenario_type}</small>
                                    <em>{scenario.status}</em>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
