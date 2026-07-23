// Calendario laboral peruano — feriados nacionales oficiales (MTPE)
// y utilidades de días útiles para cálculos de ETA / atraso / look-ahead.
// El "faltan N días" pasa de días naturales a días útiles reales.

const DAY_MS = 86400000;

// Pascua por algoritmo de Meeus/Jones/Butcher (válido 1583+).
const computeEaster = (year) => {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const L = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * L) / 451);
    const month = Math.floor((h + L - 7 * m + 114) / 31); // 3=marzo, 4=abril
    const day = ((h + L - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
};

const iso = (date) => date.toISOString().slice(0, 10);

const holidaysForYear = (year) => {
    const easter = computeEaster(year);
    const jueves = new Date(easter); jueves.setUTCDate(easter.getUTCDate() - 3);
    const viernes = new Date(easter); viernes.setUTCDate(easter.getUTCDate() - 2);
    return new Set([
        `${year}-01-01`, // Año Nuevo
        iso(jueves),     // Jueves Santo
        iso(viernes),    // Viernes Santo
        `${year}-05-01`, // Día del Trabajo
        `${year}-06-29`, // San Pedro y San Pablo
        `${year}-07-23`, // Día de la Fuerza Aérea (Perú, feriado 2024+)
        `${year}-07-28`, // Fiestas Patrias
        `${year}-07-29`, // Fiestas Patrias
        `${year}-08-06`, // Batalla de Junín (feriado 2024+)
        `${year}-08-30`, // Santa Rosa de Lima
        `${year}-10-08`, // Combate de Angamos
        `${year}-11-01`, // Todos los Santos
        `${year}-12-08`, // Inmaculada Concepción
        `${year}-12-09`, // Batalla de Ayacucho (feriado 2024+)
        `${year}-12-25`, // Navidad
    ]);
};

// Cache: {year: Set<'YYYY-MM-DD'>}
const _holidayCache = new Map();
const holidaysOf = (year) => {
    if (!_holidayCache.has(year)) _holidayCache.set(year, holidaysForYear(year));
    return _holidayCache.get(year);
};

// ¿Es día útil? (no domingo, no feriado nacional)
export const isWorkingDay = (ms) => {
    const d = new Date(ms);
    if (d.getUTCDay() === 0) return false; // domingo (o sábado si quieres 5x2 → agregar 6)
    return !holidaysOf(d.getUTCFullYear()).has(iso(d));
};

// Cuenta días útiles entre from y to (excluye "to"). Puede ser negativo.
export const workingDaysBetween = (fromMs, toMs) => {
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
    const sign = toMs >= fromMs ? 1 : -1;
    const a = Math.min(fromMs, toMs);
    const b = Math.max(fromMs, toMs);
    // Rápido: aproximación por semanas + ajuste día a día en los extremos y feriados.
    let count = 0;
    for (let t = a; t < b; t += DAY_MS) if (isWorkingDay(t)) count += 1;
    return count * sign;
};

// Suma N días ÚTILES a una fecha (para calcular ETA con calendario peruano).
export const addWorkingDays = (fromMs, days) => {
    if (!Number.isFinite(fromMs) || !Number.isFinite(days) || days === 0) return fromMs;
    const step = days > 0 ? DAY_MS : -DAY_MS;
    let t = fromMs;
    let remaining = Math.abs(days);
    // Empezamos el día siguiente si el actual no es útil o para no contar el mismo.
    while (remaining > 0) {
        t += step;
        if (isWorkingDay(t)) remaining -= 1;
    }
    return t;
};

// Utilidad para el look-ahead: ¿este ms cae en la ventana de N días útiles?
export const isWithinWorkingDays = (baseMs, targetMs, workingDays) => {
    if (!Number.isFinite(baseMs) || !Number.isFinite(targetMs) || targetMs < baseMs) return false;
    const delta = workingDaysBetween(baseMs, targetMs);
    return delta >= 0 && delta <= workingDays;
};
