export const cleanUrn = (urn) => String(urn || '').replace(/^urn:/i, '');

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

export const getFrontCodes = (lobData, activeFrente) => {
    if (!activeFrente) return null;
    const codes = lobData?.frentes?.[activeFrente] || [];
    return codes.length ? codes.map(String) : null;
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
    const avance = lobData?.avance || {};
    const partidas = getFilteredPartidas(lobData, activeFrente);
    const completedTasks = [];
    const activeTasks = [];
    const plannedTasks = [];
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

export const statusColor = (status) => {
    if (status === 'done') return '#22c55e';
    if (status === 'executing') return '#f59e0b';
    if (status === 'planned') return '#3aa0ff';
    return '#252b34';
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
    const avance = lobData?.avance || {};
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
        const ejecutado = Object.values(avance[partida.codigo] || {})
            .reduce((acc, val) => acc + Number(val || 0), 0);
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
