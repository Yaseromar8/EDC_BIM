import { workingDaysBetween, addWorkingDays } from './peruvianCalendar';
import { classifyPartida } from './partidaTaxonomy';

export const cleanUrn = (urn) => String(urn || '').replace(/^urn:/i, '');

// Baseline localStorage: instantánea del plan actual congelada. Se compara con
// el plan vivo → deriva de fechas (cuánto se ha movido el plan desde la firma).
const BASELINE_KEY = (scope) => `lob4d_baseline_${scope || 'global'}`;
export const loadBaseline = (scope) => {
    try {
        const raw = localStorage.getItem(BASELINE_KEY(scope));
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
};
export const saveBaseline = (scope, snapshot) => {
    try { localStorage.setItem(BASELINE_KEY(scope), JSON.stringify(snapshot)); return true; }
    catch { return false; }
};
export const clearBaseline = (scope) => {
    try { localStorage.removeItem(BASELINE_KEY(scope)); } catch { /* noop */ }
};
export const snapshotBaseline = (lobData, scope) => {
    if (!lobData?.partidas) return null;
    const partidas = {};
    (lobData.partidas || []).forEach((p) => {
        if ((p.tipo || 'partida') !== 'partida' || !p.activity_id) return;
        const act = lobData.activities?.[p.activity_id];
        if (!act?.start || !act?.finish) return;
        partidas[p.codigo] = {
            activity_id: p.activity_id,
            start: String(act.start).slice(0, 10),
            finish: String(act.finish).slice(0, 10),
            metrado: Number(p.metrado || 0),
        };
    });
    const snapshot = {
        savedAt: new Date().toISOString(),
        scope: scope || 'global',
        datasetVersion: lobData?.dataset?.version || null,
        partidas,
    };
    saveBaseline(scope, snapshot);
    return snapshot;
};

export const modelUrnOf = (model) => cleanUrn(model?.urn || model?.derivativeUrn || model?.id);
export const modelLabelOf = (model) => model?.name || model?.displayName || model?.fileName || modelUrnOf(model);
export const modelFrontOf = (model) => model?.appProjectId || model?.project || model?.front || model?.frente || 'Frente actual';

export const money = (value) => {
    if (value == null || Number.isNaN(Number(value))) return '-';
    return `S/ ${Math.round(Number(value)).toLocaleString('es-PE')}`;
};

export const numberText = (value, digits = 2) => {
    if (value == null || Number.isNaN(Number(value))) return '-';
    return Number(value).toLocaleString('es-PE', { maximumFractionDigits: digits });
};

export const percentText = (value, digits = 1) => {
    if (value == null || Number.isNaN(Number(value))) return '-';
    return `${Number(value).toFixed(digits)}%`;
};

export const formatDate = (iso, options = {}) => {
    if (!iso) return '-';
    const date = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('es-PE', {
        day: '2-digit',
        month: 'short',
        year: options.year ? 'numeric' : undefined,
    });
};

export const addDays = (iso, days) => {
    if (!iso) return null;
    const date = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    date.setDate(date.getDate() + Number(days || 0));
    return date;
};

export const getMaxPeriod = (lobData) => {
    let max = 1;
    Object.values(lobData?.avance || {}).forEach((periods) => {
        Object.keys(periods || {}).forEach((period) => {
            max = Math.max(max, Number(period) || 1);
        });
    });
    return max;
};

// activeFrente puede ser: null/[] (todos), un nombre ('CANAL SANTA RITA'), una
// rama EDT ('EDT:05.06'), o un ARRAY mezclando ambos (multi-selección) → la
// unión de códigos. Un solo punto de entrada → simulación, stats, LOB, matriz
// y control respetan la misma selección.
export const getFrontCodes = (lobData, activeFrente) => {
    if (!activeFrente || (Array.isArray(activeFrente) && !activeFrente.length)) return null;
    const list = Array.isArray(activeFrente) ? activeFrente : [activeFrente];
    const out = [];
    for (const item of list) {
        if (!item) continue;
        const value = String(item);
        if (value.startsWith('EDT:')) {
            const code = value.slice(4).trim();
            if (code) out.push(code);
        } else {
            (lobData?.frentes?.[value] || []).forEach((code) => out.push(String(code)));
        }
    }
    return out.length ? out : null;
};

export const isPartidaInFront = (codigo, frontCodes) => {
    if (!frontCodes) return true;
    const value = String(codigo || '');
    return frontCodes.some((base) => value.startsWith(base) || String(base).startsWith(value));
};

export const getFilteredPartidas = (lobData, activeFrente, options = {}) => {
    const frontCodes = getFrontCodes(lobData, activeFrente);
    const includeTitles = !!options.includeTitles;
    return (lobData?.partidas || [])
        .filter((partida) => includeTitles || (partida.tipo || 'partida') === 'partida')
        .filter((partida) => isPartidaInFront(partida.codigo, frontCodes));
};

export const buildEdtTree = (lobData, activeFrente) => {
    const rows = getFilteredPartidas(lobData, activeFrente, { includeTitles: true });
    const avance = lobData?.avance || {};
    const nodes = new Map();

    const ensure = (codigo) => {
        const key = String(codigo || '').trim();
        if (!key) return null;
        if (!nodes.has(key)) {
            nodes.set(key, {
                codigo: key,
                nombre: null,
                unidad: null,
                metrado: null,
                pu: null,
                rendimiento: null,
                duracion: null,
                activity_id: null,
                frente_label: null,
                tipo: 'titulo',
                contractual: 0,
                valorizado: 0,
                ejecutado: 0,
                partidas: 0,
                linked: 0,
                hijos: [],
                nivel: key.split('.').length,
            });
        }
        return nodes.get(key);
    };

    rows.forEach((partida) => {
        const node = ensure(partida.codigo);
        if (!node) return;
        const isPartida = (partida.tipo || 'partida') === 'partida';
        node.nombre = partida.descripcion || node.nombre;
        node.tipo = isPartida ? 'partida' : 'titulo';
        node.unidad = partida.unidad || node.unidad;
        node.metrado = partida.metrado ?? node.metrado;
        node.pu = partida.pu ?? node.pu;
        node.rendimiento = partida.rendimiento ?? node.rendimiento;
        node.duracion = partida.duracion ?? node.duracion;
        node.activity_id = partida.activity_id || node.activity_id;
        node.frente_label = partida.frente_label || node.frente_label;

        if (isPartida) {
            const metrado = Number(partida.metrado || 0);
            const pu = Number(partida.pu || 0);
            const ejecutado = Object.values(avance[partida.codigo] || {}).reduce((acc, val) => acc + Number(val || 0), 0);
            node.contractual = metrado * pu;
            node.valorizado = Math.min(metrado, ejecutado) * pu;
            node.ejecutado = ejecutado;
            node.partidas = 1;
            node.linked = partida.activity_id ? 1 : 0;
        }
    });

    [...nodes.keys()].forEach((codigo) => {
        const parts = codigo.split('.');
        for (let i = 1; i < parts.length; i += 1) {
            ensure(parts.slice(0, i).join('.'));
        }
    });

    const roots = [];
    [...nodes.values()].forEach((node) => {
        const parts = node.codigo.split('.');
        if (parts.length === 1) {
            roots.push(node);
            return;
        }
        const parent = ensure(parts.slice(0, -1).join('.'));
        if (parent && !parent.hijos.includes(node)) parent.hijos.push(node);
    });

    const aggregate = (node) => {
        node.hijos.sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
        node.hijos.forEach((child) => {
            aggregate(child);
            node.contractual += child.contractual;
            node.valorizado += child.valorizado;
            node.ejecutado += child.ejecutado;
            node.partidas += child.partidas;
            node.linked += child.linked;
        });
        node.pct = node.contractual > 0 ? (node.valorizado / node.contractual) * 100 : null;
    };

    roots.sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
    roots.forEach(aggregate);
    return { roots, nodes };
};

export const flattenTree = (roots, expanded) => {
    const rows = [];
    const walk = (node) => {
        rows.push(node);
        if (expanded.has(node.codigo)) node.hijos.forEach(walk);
    };
    roots.forEach(walk);
    return rows;
};

export const computeSimulationState = (lobData, simPeriod, activeFrente) => {
    const current = Math.floor(Number(simPeriod || 0)) + 1;
    const progressWithinPeriod = Number(simPeriod || 0) - Math.floor(Number(simPeriod || 0));
    const partidas = getFilteredPartidas(lobData, activeFrente);
    const avance = lobData?.avance || {};
    const completedTasks = [];
    const activeTasks = [];
    const plannedTasks = [];
    const pendingTasks = [];
    const taskRows = [];
    let valorizado = 0;
    let total = 0;

    partidas.forEach((partida) => {
        const periods = avance[partida.codigo] || {};
        let previous = 0;
        let running = 0;
        let future = 0;
        Object.entries(periods).forEach(([period, value]) => {
            const n = Number(period);
            const amount = Number(value || 0);
            if (n < current) previous += amount;
            else if (n === current) running += amount;
            else future += amount;
        });

        const metrado = Number(partida.metrado || 0);
        const pu = Number(partida.pu || 0);
        if (metrado > 0 && pu > 0) {
            total += metrado * pu;
            const physical = Math.min(1, (previous + running * progressWithinPeriod) / metrado);
            valorizado += metrado * pu * physical;
        }

        let status = 'pending';
        if (metrado > 0 && previous >= metrado * 0.995) status = 'done';
        else if (running > 0 || previous > 0) status = 'executing';
        else if (future > 0) status = 'planned';

        const task = {
            id: partida.activity_id,
            activityId: partida.activity_id,
            code: partida.codigo,
            codigo: partida.codigo,
        };
        if (status === 'done') completedTasks.push(task);
        if (status === 'executing') activeTasks.push(task);
        if (status === 'planned') plannedTasks.push(task);
        if (status === 'pending') pendingTasks.push(task);

        taskRows.push({
            ...partida,
            previous,
            running,
            future,
            status,
            executedToDate: previous + running * progressWithinPeriod,
            percent: metrado > 0 ? Math.min(100, ((previous + running * progressWithinPeriod) / metrado) * 100) : 0,
        });
    });

    const config = lobData?.config || {};
    const date = config.fecha_inicio
        ? addDays(config.fecha_inicio, Math.round(Number(simPeriod || 0) * (config.dias_por_periodo || 30)))
        : null;
    const dateISO = date ? date.toISOString() : null;
    const dateLabel = date
        ? date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
        : `VAL N ${String(current).padStart(2, '0')}`;

    return {
        current,
        date,
        dateISO,
        dateLabel,
        completedTasks,
        activeTasks,
        plannedTasks,
        pendingTasks,
        taskRows,
        progress: total > 0 ? (valorizado / total) * 100 : 0,
        total,
        valorizado,
        counts: {
            done: completedTasks.length,
            executing: activeTasks.length,
            planned: plannedTasks.length,
            pending: Math.max(0, partidas.length - completedTasks.length - activeTasks.length - plannedTasks.length),
        },
    };
};

export const buildScheduleRows = (lobData, activeFrente) => {
    const activities = lobData?.activities || {};
    return getFilteredPartidas(lobData, activeFrente)
        .map((partida) => {
            const activity = partida.activity_id ? activities[partida.activity_id] : null;
            return {
                ...partida,
                start: activity?.start || null,
                finish: activity?.finish || null,
                percentP6: activity?.percent ?? null,
                p6Status: activity?.status || null,
            };
        })
        .filter((row) => row.activity_id || row.start || row.finish);
};

export const getDateDomain = (rows) => {
    const dates = [];
    rows.forEach((row) => {
        if (row.start) dates.push(new Date(`${row.start}T00:00:00`).getTime());
        if (row.finish) dates.push(new Date(`${row.finish}T00:00:00`).getTime());
    });
    if (!dates.length) return null;
    return { min: Math.min(...dates), max: Math.max(...dates) };
};

const progressAtDate = (lobData, codigo, atMs) => {
    const values = lobData?.avance?.[codigo] || {};
    const periods = new Map((lobData?.periods || []).map((period) => [String(period.period), period]));
    const dated = [...periods.values()].some((period) => period.end);
    if (dated) {
        return Object.entries(values).reduce((total, [period, value]) => {
            const end = periods.get(String(period))?.end;
            if (!end) return total;
            const endMs = Date.parse(`${String(end).slice(0, 10)}T00:00:00`);
            return Number.isFinite(endMs) && endMs <= atMs ? total + Number(value || 0) : total;
        }, 0);
    }
    const dataDate = lobData?.dataset?.data_date;
    if (!dataDate) return Object.values(values).reduce((total, value) => total + Number(value || 0), 0);
    const dataMs = Date.parse(`${String(dataDate).slice(0, 10)}T00:00:00`);
    if (!Number.isFinite(dataMs) || atMs < dataMs) return 0;
    return Object.values(values).reduce((total, value) => total + Number(value || 0), 0);
};

export const statusColor = (status) => {
    if (status === 'done') return '#22c55e';
    if (status === 'executing') return '#f59e0b';
    if (status === 'planned') return '#3aa0ff';
    return '#252b34';
};

// ─────────────────────────────────────────────────────────────────────────────
// TIMELAPSE POR CALENDARIO REAL (fechas P6) — reemplaza el scrub por VAL cuando
// hay cronograma vinculado. Clasificación por fecha: done (fin pasado),
// executing (en ventana), planned (futuro). El % del anillo = avance PROGRAMADO
// a la fecha (construcción simulada), ponderado por costo.
// ─────────────────────────────────────────────────────────────────────────────

export const getScheduleDomain = (lobData, activeFrente) => {
    const activities = lobData?.activities || {};
    let min = Infinity;
    let max = -Infinity;
    getFilteredPartidas(lobData, activeFrente).forEach((p) => {
        const act = p.activity_id ? activities[p.activity_id] : null;
        if (!act?.start || !act?.finish) return;
        const s = Date.parse(`${String(act.start).slice(0, 10)}T00:00:00`);
        const f = Date.parse(`${String(act.finish).slice(0, 10)}T00:00:00`);
        if (Number.isFinite(s)) min = Math.min(min, s);
        if (Number.isFinite(f)) max = Math.max(max, f);
    });
    // +1 día al fin: las fechas se guardan a las 00:00, así el último tramo del
    // slider queda DESPUÉS del último fin y todo cierra en 'ejecutado' (verde).
    return Number.isFinite(min) && max > min ? { min, max: max + 86400000 } : null;
};

export const computeSimulationStateByDate = (lobData, activeFrente, atMs) => {
    const DAY = 86400000;
    const activities = lobData?.activities || {};
    const partidas = getFilteredPartidas(lobData, activeFrente);

    const completedTasks = [];
    const activeTasks = [];
    const plannedTasks = [];
    const pendingTasks = [];
    const taskRows = [];
    let earned = 0;
    let totalCost = 0;

    partidas.forEach((partida) => {
        const metrado = Number(partida.metrado || 0);
        const pu = Number(partida.pu || 0);
        const cost = metrado * pu;
        const ejecutado = progressAtDate(lobData, partida.codigo, atMs);
        const realPct = metrado > 0 ? Math.min(100, (ejecutado / metrado) * 100) : 0;
        if (cost > 0) {
            totalCost += cost;
            earned += cost * (realPct / 100);
        }

        const act = partida.activity_id ? activities[partida.activity_id] : null;
        const start = act?.start ? Date.parse(`${String(act.start).slice(0, 10)}T00:00:00`) : null;
        const finish = act?.finish ? Date.parse(`${String(act.finish).slice(0, 10)}T00:00:00`) : null;
        const actualStart = act?.actual_start ? Date.parse(`${String(act.actual_start).slice(0, 10)}T00:00:00`) : null;
        const actualFinish = act?.actual_finish ? Date.parse(`${String(act.actual_finish).slice(0, 10)}T23:59:59`) : null;

        let status = 'pending';
        let plannedPct = 0;
        if (start != null && finish != null) {
            plannedPct = atMs <= start ? 0 : atMs >= finish ? 100
                : ((atMs - start) / Math.max(DAY, finish - start)) * 100;
            if (actualFinish != null && actualFinish <= atMs) status = 'done';
            else if (realPct >= 99.5) status = 'done';
            else if (realPct > 0 || (actualStart != null && actualStart <= atMs)) status = 'executing';
            else if (atMs < start) status = 'planned';
            else status = 'pending';
        } else if (realPct >= 99.5) status = 'done';
        else if (realPct > 0) status = 'executing';

        const task = {
            id: partida.activity_id,
            activityId: partida.activity_id,
            code: partida.codigo,
            codigo: partida.codigo,
        };
        if (status === 'done') completedTasks.push(task);
        if (status === 'executing') activeTasks.push(task);
        if (status === 'planned') plannedTasks.push(task);
        if (status === 'pending') pendingTasks.push(task);

        taskRows.push({
            ...partida,
            status,
            percent: realPct,
            simulationPct: realPct,
            plannedPct,
            realPct,
            start: act?.start || null,
            finish: act?.finish || null,
        });
    });

    // ── COLOREO DIRECTO DESDE EL P6 ────────────────────────────────────────
    // Muchas actividades del P6 NO tienen partida en Duraciones que las
    // referencie. Los elementos del modelo conocen su actividad por
    // CodigoPlaneamiento → hay que clasificar TODAS las actividades por fecha,
    // no solo las que tienen partida-puente. Estas alimentan SOLO el coloreo
    // 3D (los conteos del resumen siguen siendo por partida).
    const actDone = [];
    const actExecuting = [];
    const actPlanned = [];
    Object.entries(activities).forEach(([activityId, act]) => {
        if (!activityId) return;
        const s = act?.start ? Date.parse(`${String(act.start).slice(0, 10)}T00:00:00`) : null;
        const f = act?.finish ? Date.parse(`${String(act.finish).slice(0, 10)}T00:00:00`) : null;
        if (s == null || f == null) return;
        const task = { id: activityId, activityId };
        if (atMs >= f) actDone.push(task);
        else if (atMs >= s) actExecuting.push(task);
        else actPlanned.push(task);
    });

    const date = new Date(atMs);
    return {
        mode: 'dates',
        date,
        dateISO: date.toISOString(),
        dateLabel: date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }),
        completedTasks,
        activeTasks,
        plannedTasks,
        pendingTasks,
        // tareas por ACTIVIDAD (P6) para el coloreo directo por CodigoPlaneamiento
        activityDone: actDone,
        activityExecuting: actExecuting,
        activityPlanned: actPlanned,
        taskRows,
        progress: totalCost > 0 ? (earned / totalCost) * 100 : 0,
        total: totalCost,
        valorizado: earned,
        progressKind: 'real',
        counts: {
            done: completedTasks.length,
            executing: activeTasks.length,
            planned: plannedTasks.length,
            pending: Math.max(0, partidas.length - completedTasks.length - activeTasks.length - plannedTasks.length),
        },
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// LÍNEA DE BALANCE PROFESIONAL — Tiempo (X) × Ubicación (Y).
// Ubicación = ZONAS del EDT (rama nivel 2, ej. 05.03 = Canal Ppal. Sta. Rita),
// nombradas con los TÍTULOS reales. Cada FAMILIA de actividad (palabra clave de
// la descripción) es una serie: un trazo diagonal por zona (inicio→fin) cuya
// pendiente ES el ritmo. Atrasadas (fin pasado sin avance) se marcan.
// ─────────────────────────────────────────────────────────────────────────────

const familyOf = (descripcion) => {
    const s = String(descripcion || '').toUpperCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '');
    const words = s.split(/[^A-ZÑ]+/).filter((w) => w.length >= 4);
    const skip = new Set(['PARA', 'CON', 'TIPO', 'SEGUN']);
    const first = words.find((w) => !skip.has(w));
    return first || 'OTROS';
};

export const buildLobSeries = (lobData, activeFrente, atMs) => {
    const activities = lobData?.activities || {};
    const locations = lobData?.locations || {};
    const partidas = getFilteredPartidas(lobData, activeFrente);
    const titulos = new Map();
    (lobData?.partidas || []).forEach((p) => {
        if ((p.tipo || 'partida') === 'titulo') titulos.set(p.codigo, p.descripcion);
    });

    // Ramas PUNTUALES por título del EDT: los buzones viven como rama
    // ("06.02.01.04 BUZONES DE REGISTRO") y sus hijas tienen descripciones
    // genéricas (encofrado, muro…) → la rama manda, no la descripción.
    const punctualBranchPrefixes = [];
    titulos.forEach((desc, code) => {
        if (/buz[oó]n|c[aá]mara\s+de/i.test(String(desc || ''))) punctualBranchPrefixes.push(`${code}.`);
    });

    const zoneOf = (codigo) => {
        const segs = String(codigo).split('.');
        return segs.length >= 2 ? segs.slice(0, 2).join('.') : segs[0];
    };

    const zonesMap = new Map();   // code -> {code, name}
    const segments = [];          // {zone, family, start, finish, late, row}
    let min = Infinity; let max = -Infinity;
    let stationMin = Infinity; let stationMax = -Infinity;

    partidas.forEach((partida) => {
        const act = partida.activity_id ? activities[partida.activity_id] : null;
        if (!act?.start || !act?.finish) return;
        const s = Date.parse(`${String(act.start).slice(0, 10)}T00:00:00`);
        const f = Date.parse(`${String(act.finish).slice(0, 10)}T00:00:00`);
        if (!Number.isFinite(s) || !Number.isFinite(f) || f <= s) return;

        const zone = zoneOf(partida.codigo);
        if (!zonesMap.has(zone)) {
            zonesMap.set(zone, { code: zone, name: titulos.get(zone) || zone });
        }
        min = Math.min(min, s); max = Math.max(max, f);

        const metrado = Number(partida.metrado || 0);
        const ejecutado = progressAtDate(lobData, partida.codigo, atMs);
        const realPct = metrado > 0 ? Math.min(100, (ejecutado / metrado) * 100) : 0;
        const late = atMs != null && f < atMs && realPct < 99.5;
        const location = locations[partida.codigo];
        const stationStart = Number(location?.station_start);
        const stationEnd = Number(location?.station_end);
          const hasStation = Number.isFinite(stationStart) && Number.isFinite(stationEnd) && stationStart !== stationEnd;
          const durationDays = Math.max(1, (f - s) / DAY_MS);
          const locationLength = hasStation ? Math.abs(stationEnd - stationStart) : null;
          if (hasStation) {
            stationMin = Math.min(stationMin, stationStart, stationEnd);
            stationMax = Math.max(stationMax, stationStart, stationEnd);
        }

        // ── Métricas TILOS por actividad (plan vs real, "dónde estás y cuánto falta") ──
        // deltaDays ahora en DÍAS ÚTILES (calendario peruano: sin domingos ni feriados)
        let plannedPct = null;
        let stationAtNow = null;
        let stationPlanNow = null;
        let deltaMeters = null;
        let deltaDays = null;         // días útiles
        let deltaDaysNatural = null;  // días naturales (para curvas)
        let rateActual = null;
        let etaFinish = null;
        if (atMs != null) {
            plannedPct = atMs <= s ? 0 : atMs >= f ? 100
                : ((atMs - s) / Math.max(DAY_MS, f - s)) * 100;
        }
        if (hasStation && atMs != null) {
            const dir = stationEnd >= stationStart ? 1 : -1;
            const absLen = Math.abs(stationEnd - stationStart);
            stationAtNow = stationStart + dir * absLen * (realPct / 100);
            stationPlanNow = stationStart + dir * absLen * ((plannedPct || 0) / 100);
            deltaMeters = (stationPlanNow - stationAtNow) * dir; // + = atrasado
            const workingDaysUsed = Math.max(1, workingDaysBetween(s, Math.min(atMs, f)));
            const advanced = Math.abs(stationAtNow - stationStart);
            rateActual = advanced > 0 ? advanced / workingDaysUsed : 0; // m / día útil
            if (rateActual > 0 && realPct < 100) {
                const remainingM = absLen - advanced;
                const remainingWorkingDays = Math.ceil(remainingM / rateActual);
                etaFinish = addWorkingDays(atMs, remainingWorkingDays);
                deltaDays = workingDaysBetween(f, etaFinish); // + tarde, − adelantado (útiles)
                deltaDaysNatural = Math.round((etaFinish - f) / DAY_MS);
            } else if (realPct >= 100) {
                deltaDays = 0;
                deltaDaysNatural = 0;
            }
        }

        let taxonomy = classifyPartida(partida.descripcion, partida.codigo);
        // Rama de buzones → la partida ES un buzón (puntual), aunque su
        // descripción diga "encofrado/muro". subKey conserva el paso interno.
        if (punctualBranchPrefixes.some((pre) => String(partida.codigo).startsWith(pre))) {
            taxonomy = { ...classifyPartida('BUZON DE REGISTRO', partida.codigo), subKey: taxonomy.key };
        }
        segments.push({
            zone,
            family: taxonomy.key,       // reemplaza el familyOf viejo con la key TILOS-drenaje
            taxonomy,                    // {key, color, pattern, priority, flow, isAuxiliary, isPunctual}
            start: s,
            finish: f,
            late,
            realPct,
            plannedPct,
            codigo: partida.codigo,
            descripcion: partida.descripcion,
            activity_id: partida.activity_id,
            alignment_id: location?.alignment_id || null,
            stationStart: hasStation ? stationStart : null,
            stationEnd: hasStation ? stationEnd : null,
            stationAtNow, stationPlanNow,
            deltaMeters, deltaDays, deltaDaysNatural,
            durationDays,
            productionRate: locationLength != null ? locationLength / durationDays : null,
            rateActual,
            etaFinish,
            unidad: partida.unidad,
            metrado: Number(partida.metrado || 0),
            ejecutado,
            pu: Number(partida.pu || 0),
        });
    });

    // ── BASELINE localStorage: deriva de fechas del plan vivo vs snapshot ──
    // Si hay baseline congelado, cada segmento gana baselineStart/baselineFinish
    // y baselineShiftDays (útil para "el plan se movió N días desde la firma").
    const baseline = loadBaseline(lobData?.scope || lobData?.dataset?.scope_urn);
    let baselineActive = null;
    if (baseline?.partidas) {
        baselineActive = {
            savedAt: baseline.savedAt,
            datasetVersion: baseline.datasetVersion,
            partidasCount: Object.keys(baseline.partidas).length,
        };
        segments.forEach((seg) => {
            const b = baseline.partidas[seg.codigo];
            if (!b) return;
            const bs = Date.parse(`${b.start}T00:00:00`);
            const bf = Date.parse(`${b.finish}T00:00:00`);
            if (!Number.isFinite(bs) || !Number.isFinite(bf)) return;
            seg.baselineStart = bs;
            seg.baselineFinish = bf;
            seg.baselineShiftStartDays = workingDaysBetween(bs, seg.start); // + plan se corrió
            seg.baselineShiftFinishDays = workingDaysBetween(bf, seg.finish);
        });
    }

    const locationSegments = segments.filter((segment) => segment.stationStart != null && segment.stationEnd != null);
    const locationBased = locationSegments.length > 0;

    const zones = [...zonesMap.values()].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    const familyTotals = new Map();
    segments.forEach((seg) => familyTotals.set(seg.family, (familyTotals.get(seg.family) || 0) + 1));
      const families = [...familyTotals.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => ({ name, count }));

      // Conflicto lineal: dos actividades distintas ocupan el mismo tramo durante
      // fechas superpuestas. El barrido temporal evita comparar pares imposibles.
      const conflictSource = (locationBased ? locationSegments : segments)
          .slice()
          .sort((a, b) => a.start - b.start || a.finish - b.finish);
      const conflicts = [];
      for (let i = 0; i < conflictSource.length; i += 1) {
          const current = conflictSource[i];
          for (let j = i + 1; j < conflictSource.length; j += 1) {
              const candidate = conflictSource[j];
              if (candidate.start >= current.finish) break;
              if (candidate.codigo === current.codigo) continue;
              let sameLocation = current.zone === candidate.zone;
              let stationStart = null;
              let stationEnd = null;
              if (locationBased) {
                  const currentMin = Math.min(current.stationStart, current.stationEnd);
                  const currentMax = Math.max(current.stationStart, current.stationEnd);
                  const candidateMin = Math.min(candidate.stationStart, candidate.stationEnd);
                  const candidateMax = Math.max(candidate.stationStart, candidate.stationEnd);
                  stationStart = Math.max(currentMin, candidateMin);
                  stationEnd = Math.min(currentMax, candidateMax);
                  sameLocation = stationEnd > stationStart;
              }
              if (!sameLocation) continue;
              conflicts.push({
                  a: current,
                  b: candidate,
                  start: Math.max(current.start, candidate.start),
                  finish: Math.min(current.finish, candidate.finish),
                  stationStart,
                  stationEnd,
              });
              if (conflicts.length >= 200) break;
          }
          if (conflicts.length >= 200) break;
      }

    // ── HAMMOCKS (actividades resumen estilo TILOS) ─────────────────────────
    // Agrupa por CodigoPlaneamiento (paño): rectángulo envolvente inicio→fin
    // de todas sus partidas, con el rango de PK unido. Solo si tiene ≥2 hijos.
    const hammocksMap = new Map();
    (locationBased ? locationSegments : segments).forEach((seg) => {
        const plan = seg.activity_id || null;
        if (!plan) return;
        const h = hammocksMap.get(plan) || {
            activity_id: plan, zone: seg.zone, family: seg.family,
            start: seg.start, finish: seg.finish,
            stationMin: Infinity, stationMax: -Infinity,
            children: [], metradoTotal: 0, ejecutadoTotal: 0,
        };
        h.start = Math.min(h.start, seg.start);
        h.finish = Math.max(h.finish, seg.finish);
        if (seg.stationStart != null && seg.stationEnd != null) {
            h.stationMin = Math.min(h.stationMin, seg.stationStart, seg.stationEnd);
            h.stationMax = Math.max(h.stationMax, seg.stationStart, seg.stationEnd);
        }
        h.metradoTotal += Number(seg.metrado || 0);
        h.ejecutadoTotal += Number(seg.ejecutado || 0);
        h.children.push(seg);
        hammocksMap.set(plan, h);
    });
    const hammocks = [...hammocksMap.values()]
        .filter((h) => h.children.length >= 2)
        .map((h) => ({
            ...h,
            hasStation: Number.isFinite(h.stationMin) && Number.isFinite(h.stationMax) && h.stationMax > h.stationMin,
            realPct: h.metradoTotal > 0 ? Math.min(100, (h.ejecutadoTotal / h.metradoTotal) * 100) : 0,
        }));

    // ── HISTOGRAMA + CURVA S DOBLE (Plan vs Real ponderado por costo) ───────
    // Curva S profesional: acumulado normalizado del PV (Planned Value) y EV
    // (Earned Value), ponderado por COSTO (metrado × PU) — el estándar EVM
    // que hablan Primavera/TILOS/Bexel. Barras = PV semanal (m³ ó S/ según
    // convenga). La brecha vertical PV−EV a la fecha = SV (Schedule Variance).
    let histogram = null;
    let curveSPlan = null;
    let curveSReal = null;
    const source = locationBased ? locationSegments : segments;
    if (source.length && Number.isFinite(min) && Number.isFinite(max)) {
        const bucketMs = 7 * DAY_MS;
        const startBucket = Math.floor(min / bucketMs) * bucketMs;
        const nBuckets = Math.ceil((max - startBucket) / bucketMs) + 1;
        const bins = new Array(nBuckets).fill(0);           // PV semanal (metrado plan)
        const binsReal = new Array(nBuckets).fill(0);       // EV semanal (metrado real)
        let totalMetrado = 0;
        const periodEndMap = new Map((lobData?.periods || []).map((p) => {
            const end = Date.parse(`${String(p.end || '').slice(0, 10)}T00:00:00`);
            return [String(p.period), Number.isFinite(end) ? end : null];
        }));

        source.forEach((seg) => {
            const m = Number(seg.metrado || 0);
            if (m <= 0) return;
            totalMetrado += m;
            // Distribución PLAN: lineal en el plazo P6 de la partida.
            const days = Math.max(1, (seg.finish - seg.start) / DAY_MS);
            const perDay = m / days;
            const startBin = Math.max(0, Math.floor((seg.start - startBucket) / bucketMs));
            const endBin = Math.min(nBuckets - 1, Math.floor((seg.finish - startBucket) / bucketMs));
            for (let b = startBin; b <= endBin; b += 1) {
                const bStart = startBucket + b * bucketMs;
                const bEnd = bStart + bucketMs;
                const overlap = Math.max(0, Math.min(seg.finish, bEnd) - Math.max(seg.start, bStart));
                bins[b] += (overlap / DAY_MS) * perDay;
            }
            // Distribución REAL: si hay valorizaciones con fecha de cierre, cada
            // capítulo se asigna al bucket que contiene su fecha (cortes reales
            // del proyecto). Sin fechas → todo al último bucket del plan.
            const values = lobData?.avance?.[seg.codigo] || {};
            Object.entries(values).forEach(([period, val]) => {
                const v = Number(val || 0);
                if (v <= 0) return;
                const endMs = periodEndMap.get(String(period));
                const t = endMs != null ? endMs : Math.min(seg.finish, atMs || seg.finish);
                const idx = Math.floor((t - startBucket) / bucketMs);
                if (idx >= 0 && idx < nBuckets) binsReal[idx] += v;
            });
        });

        const maxBin = Math.max(1, ...bins);
        histogram = { bucketMs, startBucket, bins, binsReal, maxBin, totalMetrado };
        // Curvas S normalizadas al 100% del plan.
        let acc = 0; let accR = 0;
        curveSPlan = bins.map((v) => { acc += v; return totalMetrado > 0 ? acc / totalMetrado : 0; });
        curveSReal = binsReal.map((v) => { accR += v; return totalMetrado > 0 ? accR / totalMetrado : 0; });
    }

    // ── EVM (Earned Value Management) ponderado por COSTO ───────────────────
    // Estándar PMBOK/Primavera: para cada partida a la fecha atMs se calcula
    // PV = costo × %plan  y  EV = costo × %real. Métricas ejecutivas:
    // SV=EV-PV (adelanto/atraso en soles) · CV=EV-AC (ganancia/pérdida)
    // SPI=EV/PV (>1 adelantado) · CPI=EV/AC (>1 rentable)
    // EAC (Estimate At Completion): BAC/CPI (proyección de costo final).
    let evm = null;
    if (atMs != null && source.length) {
        let pv = 0, ev = 0, bac = 0;
        source.forEach((seg) => {
            const cost = (Number(seg.metrado || 0)) * (Number(lobData?.partidas?.find((p) => p.codigo === seg.codigo)?.pu || 0));
            if (cost <= 0) return;
            bac += cost;
            const planPct = Math.max(0, Math.min(1, (seg.plannedPct || 0) / 100));
            const realPct = Math.max(0, Math.min(1, (seg.realPct || 0) / 100));
            pv += cost * planPct;
            ev += cost * realPct;
        });
        // AC (Actual Cost) no lo trackeamos aún → usamos EV como proxy conservador.
        const ac = ev;
        const sv = ev - pv;
        const cv = ev - ac;
        const spi = pv > 0 ? ev / pv : null;
        const cpi = ac > 0 ? ev / ac : null;
        const eac = cpi ? bac / cpi : bac;
        const vac = bac - eac;
        evm = { bac, pv, ev, ac, sv, cv, spi, cpi, eac, vac };
    }

    // ── LOOK-AHEAD ejecutivo (próximas 2/4 semanas + atrasos críticos) ──────
    // Lo que necesita un jefe de obra para la reunión semanal: qué termina,
    // qué inicia, cuáles están atrasadas y golpean más el presupuesto.
    let lookahead = null;
    if (atMs != null && source.length) {
        const partidaByCodigo = new Map((lobData?.partidas || []).map((p) => [p.codigo, p]));
        const costOf = (seg) => {
            const p = partidaByCodigo.get(seg.codigo);
            return (Number(seg.metrado || 0)) * (Number(p?.pu || 0));
        };
        const win2w = atMs + 14 * DAY_MS;
        const win4w = atMs + 28 * DAY_MS;
        const upcoming2w = [];   // inician en 14d
        const upcoming4w = [];   // inician en 28d
        const closing2w = [];    // terminan en 14d
        const criticalLate = []; // fin vencido y % real < 99.5
        source.forEach((seg) => {
            const cost = costOf(seg);
            const impact = seg.deltaDays != null && seg.deltaDays > 0 ? cost * seg.deltaDays : 0;
            if (seg.start > atMs && seg.start <= win2w) upcoming2w.push({ ...seg, cost });
            else if (seg.start > win2w && seg.start <= win4w) upcoming4w.push({ ...seg, cost });
            if (seg.finish > atMs && seg.finish <= win2w) closing2w.push({ ...seg, cost });
            if (seg.finish < atMs && seg.realPct < 99.5) criticalLate.push({ ...seg, cost, impact });
        });
        upcoming2w.sort((a, b) => a.start - b.start);
        upcoming4w.sort((a, b) => a.start - b.start);
        closing2w.sort((a, b) => a.finish - b.finish);
        criticalLate.sort((a, b) => b.impact - a.impact);
        lookahead = {
            upcoming2w: upcoming2w.slice(0, 10),
            upcoming4w: upcoming4w.slice(0, 10),
            closing2w: closing2w.slice(0, 10),
            criticalLate: criticalLate.slice(0, 8),
        };
    }

    // ── SISTEMA DE ALERTAS empresariales ─────────────────────────────────────
    // Reglas simples pero directamente accionables (para el toast/campana):
    //  - EVM: SPI < 0.85 (severidad por rango)
    //  - Partida: atraso crítico (deltaDays > 7 días útiles)
    //  - Partida: cierre inminente en riesgo (fin ≤ 3d útiles y %real < 80)
    //  - Baseline: plan corrido > 5 días desde la firma
    const alerts = [];
    if (evm?.spi != null) {
        if (evm.spi < 0.7) alerts.push({ id: 'spi-critical', severity: 'critical', kind: 'evm', title: `SPI ${evm.spi.toFixed(2)} — cronograma CRÍTICO`, hint: `Faltan ${((1 - evm.spi) * 100).toFixed(0)}% respecto al plan` });
        else if (evm.spi < 0.85) alerts.push({ id: 'spi-low', severity: 'high', kind: 'evm', title: `SPI ${evm.spi.toFixed(2)} — cronograma atrasado`, hint: `EV/PV bajo — revisar ritmos` });
        else if (evm.spi < 0.95) alerts.push({ id: 'spi-mid', severity: 'medium', kind: 'evm', title: `SPI ${evm.spi.toFixed(2)} — leve atraso`, hint: `Vigilar cierre de partidas activas` });
    }
    if (baselineActive) {
        const shifts = segments.map((s) => s.baselineShiftFinishDays).filter((v) => Number.isFinite(v));
        if (shifts.length) {
            const maxShift = Math.max(...shifts);
            if (maxShift >= 5) alerts.push({
                id: 'baseline-drift', severity: maxShift >= 15 ? 'high' : 'medium', kind: 'baseline',
                title: `Plan corrido ${maxShift}d desde la firma (baseline v${baselineActive.datasetVersion || '?'})`,
                hint: `${shifts.filter((v) => v >= 5).length} partidas movidas`,
            });
        }
    }
    (source || []).forEach((seg) => {
        if (seg.deltaDays != null && seg.deltaDays > 7) {
            alerts.push({
                id: `late-${seg.codigo}`, severity: seg.deltaDays >= 20 ? 'critical' : seg.deltaDays >= 15 ? 'high' : 'medium',
                kind: 'late', title: `${seg.codigo} — atraso ${seg.deltaDays}d útiles`,
                hint: `${(seg.descripcion || '').slice(0, 42)}${seg.deltaMeters != null ? ` · brecha ${Math.abs(seg.deltaMeters).toFixed(0)}m` : ''}`,
                start: seg.start, codigo: seg.codigo,
            });
        }
        if (atMs != null && seg.finish > atMs) {
            const daysToFinish = workingDaysBetween(atMs, seg.finish);
            if (daysToFinish <= 3 && seg.realPct < 80) {
                alerts.push({
                    id: `risk-${seg.codigo}`, severity: seg.realPct < 40 ? 'high' : 'medium',
                    kind: 'risk', title: `${seg.codigo} — cierra en ${daysToFinish}d con ${seg.realPct.toFixed(0)}%`,
                    hint: (seg.descripcion || '').slice(0, 60),
                    start: seg.start, codigo: seg.codigo,
                });
            }
        }
    });
    // Orden: severidad (critical→medium), luego los del cronograma primero
    const sevRank = { critical: 0, high: 1, medium: 2 };
    alerts.sort((a, b) => (sevRank[a.severity] - sevRank[b.severity]) || 0);

    return {
        zones,
        families,
        segments: locationBased ? locationSegments : segments,
        hammocks,
        histogram,
        curveSPlan,
        curveSReal,
        evm,
        lookahead,
        alerts,
        baseline: baselineActive,
        domain: Number.isFinite(min) && max > min ? { min, max } : null,
        locationBased,
        stationDomain: locationBased ? { min: stationMin, max: stationMax } : null,
        conflicts,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL DE OBRA — programado (fechas P6) vs real (valorizaciones), por costo.
// Valor ganado ligero: PV = Σ costo × %programado(fecha), EV = Σ costo × %real.
// SPI = EV/PV. Semáforo: atrasadas / en curso / próximas, con brecha en puntos.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86400000;
const parseDay = (iso) => {
    const t = Date.parse(`${String(iso).slice(0, 10)}T00:00:00`);
    return Number.isFinite(t) ? t : null;
};

export const computeControlState = (lobData, activeFrente, atMs) => {
    const activities = lobData?.activities || {};
    const partidas = getFilteredPartidas(lobData, activeFrente);

    let pv = 0;
    let ev = 0;
    let total = 0;
    let totalConFechas = 0;
    let domainMin = Infinity;
    let domainMax = -Infinity;
    const late = [];
    const executing = [];
    const upcoming = [];
    let sinVinculo = 0;

    const rowsConFechas = [];

    partidas.forEach((partida) => {
        const metrado = Number(partida.metrado || 0);
        const pu = Number(partida.pu || 0);
        const cost = metrado * pu;
        const ejecutado = progressAtDate(lobData, partida.codigo, atMs);
        const realPct = metrado > 0 ? Math.min(1, ejecutado / metrado) : 0;
        total += cost;
        ev += cost * realPct;

        const activity = partida.activity_id ? activities[partida.activity_id] : null;
        const start = activity ? parseDay(activity.start) : null;
        const finish = activity ? parseDay(activity.finish) : null;
        if (start == null || finish == null) {
            if (cost > 0) sinVinculo += 1;
            return;
        }

        domainMin = Math.min(domainMin, start);
        domainMax = Math.max(domainMax, finish);
        totalConFechas += cost;

        const plannedPct = atMs <= start ? 0
            : atMs >= finish ? 1
                : (atMs - start) / Math.max(DAY_MS, finish - start);
        pv += cost * plannedPct;

        const row = {
            codigo: partida.codigo,
            descripcion: partida.descripcion,
            activity_id: partida.activity_id,
            unidad: partida.unidad,
            cost,
            start: activity.start,
            finish: activity.finish,
            plannedPct: plannedPct * 100,
            realPct: realPct * 100,
            gap: (plannedPct - realPct) * 100,
        };
        rowsConFechas.push(row);

        if (plannedPct >= 1 && realPct < 0.995) {
            late.push({ ...row, delayDays: Math.max(1, Math.round((atMs - finish) / DAY_MS)) });
        } else if (plannedPct > 0 && plannedPct < 1 && (plannedPct - realPct) > 0.15) {
            late.push({ ...row, delayDays: 0 });
        } else if (plannedPct > 0 && plannedPct < 1) {
            executing.push(row);
        } else if (start > atMs && (start - atMs) <= 14 * DAY_MS) {
            upcoming.push({ ...row, inDays: Math.max(1, Math.ceil((start - atMs) / DAY_MS)) });
        }
    });

    late.sort((a, b) => (b.gap * b.cost) - (a.gap * a.cost));      // peor impacto primero
    executing.sort((a, b) => b.cost - a.cost);
    upcoming.sort((a, b) => a.inDays - b.inDays);

    const spi = pv > 0 ? ev / pv : null;
    const domain = Number.isFinite(domainMin) ? { min: domainMin, max: domainMax } : null;

    // Curva S programada (PV mensual) + curva real si hay ancla de fechas de VAL.
    const curve = [];
    if (domain) {
        const steps = 26;
        for (let i = 0; i <= steps; i += 1) {
            const t = domain.min + ((domain.max - domain.min) * i) / steps;
            let pvT = 0;
            rowsConFechas.forEach((row) => {
                const s = parseDay(row.start);
                const f = parseDay(row.finish);
                const pct = t <= s ? 0 : t >= f ? 1 : (t - s) / Math.max(DAY_MS, f - s);
                pvT += row.cost * pct;
            });
            curve.push({ t, pv: pvT });
        }
    }

    return {
        atMs,
        domain,
        pv,
        ev,
        total,
        totalConFechas,
        spi,
        desviacion: ev - pv,
        pctProgramado: totalConFechas > 0 ? (pv / totalConFechas) * 100 : 0,
        pctReal: total > 0 ? (ev / total) * 100 : 0,
        late,
        executing,
        upcoming,
        sinVinculo,
        partidasConFechas: rowsConFechas.length,
        partidasTotal: partidas.length,
        curve,
    };
};
