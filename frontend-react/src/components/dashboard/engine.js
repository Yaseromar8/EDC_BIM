// engine.js — Motor de datos del Tablero de análisis.
// =====================================================
// Capa PURA (sin UI): fuentes de datos, descubrimiento de campos con % de
// completitud (base del QA de parámetros), y agregación (contar/sumar/promediar).
//
// PRINCIPIO: el tablero lee SOLO de la nube (window.postgresInventory, que ya
// baja de Postgres con caché IndexedDB). Nada de Revit ni IFC en este camino.
//
// ESCALABILIDAD: `SOURCES` es un registro — para añadir una fuente nueva
// (metrados, avance, EVM) se registra aquí y el resto del tablero la hereda.

// ── Paleta categórica (tema oscuro, contraste alto) ──────────────────────────
export const PALETTE = [
  '#5b8fd6', '#8b6cf0', '#3fb27f', '#e0a63f', '#d66a6a',
  '#4fc1c9', '#c477c9', '#9aa856', '#6f83a8', '#c98a5e',
  '#7dd3a0', '#e08fb2', '#8fa3e0', '#d6c05b', '#a08bd6',
];
export const colorAt = (i) => PALETTE[i % PALETTE.length];

// Campos internos del pipeline que no son "propiedades" para el usuario.
const HIDDEN_FIELDS = new Set(['dbId', 'model_urn', 'source_urn', '__category__']);

// ── Fuente: Inventory (Postgres → postgresInventory, ya aplanado) ────────────
async function getInventoryRows() {
  if (Array.isArray(window.postgresInventory) && window.postgresInventory.length) {
    return window.postgresInventory;
  }
  // El preload global puede estar en curso (App.jsx lo lanza al abrir el frente)
  try { await window.__inventoryPreloadPromise; } catch { /* seguirá el poll */ }
  for (let i = 0; i < 40; i++) {
    if (Array.isArray(window.postgresInventory) && window.postgresInventory.length) {
      return window.postgresInventory;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return Array.isArray(window.postgresInventory) ? window.postgresInventory : [];
}

export const SOURCES = {
  inventory: {
    id: 'inventory',
    label: 'Inventario (nube)',
    getRows: getInventoryRows,
  },
  // futuro: metrados (link_reports), avance (progress), presupuesto (5D)…
};

// ── Descubrimiento de campos ─────────────────────────────────────────────────
// Devuelve [{ key, fillPct, numericPct, isNumeric, distinct }] ordenado por
// completitud. fillPct = % de filas con valor → es la métrica de QA (estilo
// "Exists %" de Vyssuals): de un vistazo sabes qué parámetro está poblado.
const parseNum = (v) => {
  if (v == null) return NaN;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  const m = s.match(/^-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
};

export function discoverFields(rows) {
  if (!rows?.length) return [];
  const total = rows.length;
  const stats = new Map(); // key → { filled, numeric, values:Set (cap) }
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (HIDDEN_FIELDS.has(key) || key.startsWith('__')) continue;
      let st = stats.get(key);
      if (!st) { st = { filled: 0, numeric: 0, values: new Set() }; stats.set(key, st); }
      const v = row[key];
      if (v === '' || v == null) continue;
      st.filled++;
      if (Number.isFinite(parseNum(v))) st.numeric++;
      if (st.values.size < 60) st.values.add(String(v));
    }
  }
  const out = [];
  for (const [key, st] of stats.entries()) {
    if (!st.filled) continue;
    const fillPct = Math.round((st.filled / total) * 100);
    const numericPct = Math.round((st.numeric / st.filled) * 100);
    out.push({
      key,
      fillPct,
      numericPct,
      isNumeric: numericPct >= 80,
      distinct: st.values.size, // 60 = "60+" (cap de muestreo)
    });
  }
  out.sort((a, b) => b.fillPct - a.fillPct || a.key.localeCompare(b.key));
  return out;
}

// Valores distintos de un campo con su frecuencia (para el editor de filtros).
export function distinctValues(rows, field, limit = 30) {
  const freq = new Map();
  for (const row of rows) {
    const v = row[field];
    if (v === '' || v == null) continue;
    const s = String(v);
    freq.set(s, (freq.get(s) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

// ── Agregación ───────────────────────────────────────────────────────────────
// config: { groupBy, metric: 'count'|'sum'|'avg', valueField, topN,
//           filter: { field, values: [] } | null }
// Devuelve { groups: [{ key, value, count, externalIds }], total, totalCount }.
// Cada grupo CONSERVA sus externalIds → el 3D puede aislar/colorear el grupo.
export function aggregate(rows, config) {
  const { groupBy, metric = 'count', valueField, topN = 12, filter } = config || {};
  let data = rows || [];
  if (filter?.field && filter.values?.length) {
    const allow = new Set(filter.values.map(String));
    data = data.filter(r => allow.has(String(r[filter.field] ?? '')));
  }

  const acc = new Map(); // key → { sum, count, externalIds }
  for (const row of data) {
    const rawKey = groupBy ? row[groupBy] : '__total__';
    const key = (rawKey === '' || rawKey == null) ? '(sin valor)' : String(rawKey);
    let g = acc.get(key);
    if (!g) { g = { sum: 0, count: 0, externalIds: [] }; acc.set(key, g); }
    g.count++;
    if (row.dbId) g.externalIds.push(row.dbId);
    if (metric !== 'count' && valueField) {
      const n = parseNum(row[valueField]);
      if (Number.isFinite(n)) g.sum += n;
    }
  }

  let groups = [...acc.entries()].map(([key, g]) => ({
    key,
    count: g.count,
    value: metric === 'count' ? g.count : (metric === 'avg' ? (g.count ? g.sum / g.count : 0) : g.sum),
    externalIds: g.externalIds,
  }));

  // Series (línea/área): el eje X es una progresión → orden NATURAL por clave
  // (FASE 02 < FASE 10, 0+100 < 0+640), sin "Otros" (rompería la curva).
  if (config?.type === 'line' || config?.type === 'area') {
    groups.sort((a, b) => String(a.key).localeCompare(String(b.key), 'es', { numeric: true }));
    if (groups.length > 120) groups = groups.slice(0, 120);
    return {
      groups,
      total: groups.reduce((s, g) => s + g.value, 0),
      totalCount: data.length,
    };
  }

  groups.sort((a, b) => b.value - a.value);

  // Top N + "Otros" (agrupa la cola conservando sus ids para el 3D)
  if (topN && groups.length > topN) {
    const head = groups.slice(0, topN);
    const tail = groups.slice(topN);
    head.push({
      key: `Otros (${tail.length})`,
      count: tail.reduce((s, g) => s + g.count, 0),
      value: tail.reduce((s, g) => s + g.value, 0),
      externalIds: tail.flatMap(g => g.externalIds),
      isOthers: true,
    });
    groups = head;
  }

  return {
    groups,
    total: groups.reduce((s, g) => s + g.value, 0),
    totalCount: data.length,
  };
}

// ── Dispersión: puntos por ELEMENTO (dos campos numéricos) ───────────────────
// Cada punto conserva su externalId → clic en el punto = aislar ese elemento.
// Con modelos grandes se muestrea uniforme (chart.js se arrastra con >5k puntos).
export function scatterPoints(rows, config) {
  const { xField, yField, filter, cap = 4000 } = config || {};
  let data = rows || [];
  if (filter?.field && filter.values?.length) {
    const allow = new Set(filter.values.map(String));
    data = data.filter(r => allow.has(String(r[filter.field] ?? '')));
  }
  const pts = [];
  for (const row of data) {
    const x = parseNum(row[xField]);
    const y = parseNum(row[yField]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      pts.push({ x, y, externalId: row.dbId, name: row.Name || String(row.dbId) });
    }
  }
  if (pts.length > cap) {
    const step = pts.length / cap;
    const out = [];
    for (let i = 0; i < pts.length; i += step) out.push(pts[Math.floor(i)]);
    return { points: out, total: pts.length, sampled: true };
  }
  return { points: pts, total: pts.length, sampled: false };
}

// ── Formato de números (es-PE) ───────────────────────────────────────────────
const nfInt = new Intl.NumberFormat('es-PE');
const nfDec = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
export function fmt(n) {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e6) return nfDec.format(n / 1e6) + ' M';
  return Number.isInteger(n) ? nfInt.format(n) : nfDec.format(n);
}

// ── Puente con el visor 3D ───────────────────────────────────────────────────
// externalId → dbId por modelo cargado, con caché por modelo (el mapping es
// costoso en modelos grandes; se pide UNA vez por modelo y sesión).
const _extMapCache = new Map(); // model.id → Promise<map>

function getExtMapping(model) {
  const mid = model.id ?? model;
  if (_extMapCache.has(mid)) return _extMapCache.get(mid);
  const p = new Promise((resolve) => {
    try { model.getExternalIdMapping((map) => resolve(map || {}), () => resolve({})); }
    catch { resolve({}); }
  });
  _extMapCache.set(mid, p);
  return p;
}

function getViewer() {
  return window.__mainViewer || window.NOP_VIEWER || null;
}

async function resolveByModel(externalIds) {
  const viewer = getViewer();
  if (!viewer) return { viewer: null, byModel: new Map() };
  const models = viewer.getAllModels ? viewer.getAllModels() : (viewer.model ? [viewer.model] : []);
  const byModel = new Map();
  for (const m of models) {
    const map = await getExtMapping(m);
    const ids = [];
    for (const eid of externalIds) {
      const db = map[eid];
      if (db != null) ids.push(db);
    }
    if (ids.length) byModel.set(m, ids);
  }
  return { viewer, models, byModel };
}

// Aislar un grupo en el 3D (y encuadrar). Modelos sin elementos del grupo se ocultan.
export async function isolateInViewer(externalIds) {
  const { viewer, models, byModel } = await resolveByModel(externalIds || []);
  if (!viewer) return false;
  if (!externalIds?.length) { try { viewer.showAll(); } catch { /* */ } return true; }
  if (!byModel.size) return false;
  for (const m of (models || [])) {
    const ids = byModel.get(m);
    if (ids?.length) viewer.isolate(ids, m);
    else {
      try { viewer.hide(m.getRootId ? m.getRootId() : m, m); } catch { /* modelo sin raíz */ }
    }
  }
  const first = [...byModel.entries()][0];
  if (first) { try { viewer.fitToView(first[1], first[0]); } catch { /* */ } }
  return true;
}

// Pintar los grupos de un gráfico en el 3D con la paleta del tablero.
// Emite 'viewer-colors-applied' con la MISMA forma que el filtro de colores →
// si el Live Link con Revit está activo, estos colores se replican en Revit.
export async function colorizeInViewer(groups) {
  const viewer = getViewer();
  const THREE = window.THREE;
  if (!viewer || !THREE) return false;
  const models = viewer.getAllModels ? viewer.getAllModels() : (viewer.model ? [viewer.model] : []);
  for (const m of models) { try { viewer.clearThemingColors(m); } catch { /* */ } }

  const linkGroups = [];
  for (let i = 0; i < (groups || []).length; i++) {
    const g = groups[i];
    const hex = colorAt(i);
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const gc = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const vec = new THREE.Vector4(r, gc, b, 1);
    const { byModel } = await resolveByModel(g.externalIds || []);
    const entries = [];
    for (const [m, ids] of byModel.entries()) {
      for (const id of ids) { try { viewer.setThemingColor(id, vec, m, true); } catch { /* */ } }
      entries.push({ model: m, dbIds: ids });
    }
    if (entries.length) linkGroups.push({ color: hex, entries });
  }
  try { viewer.impl.invalidate(true, true, true); } catch { /* */ }
  window.dispatchEvent(new CustomEvent('viewer-colors-applied', { detail: { groups: linkGroups } }));
  return linkGroups.length > 0;
}

// Restaurar el 3D (colores + visibilidad) y avisar al Live Link.
export function clearViewerViz() {
  const viewer = getViewer();
  if (!viewer) return;
  const models = viewer.getAllModels ? viewer.getAllModels() : (viewer.model ? [viewer.model] : []);
  for (const m of models) { try { viewer.clearThemingColors(m); } catch { /* */ } }
  try { viewer.showAll(); } catch { /* */ }
  try { viewer.impl.invalidate(true, true, true); } catch { /* */ }
  window.dispatchEvent(new CustomEvent('viewer-colors-applied', { detail: { groups: [] } }));
}

// Invalidar cachés al cambiar de frente (los modelos cargados cambian).
export function resetEngineCaches() {
  _extMapCache.clear();
}

// CSV (con BOM para que Excel abra UTF-8; separador ';' es-PE).
export function groupsToCsv(title, metricLabel, groups) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [[title, metricLabel, 'Elementos'].map(esc).join(';')];
  for (const g of groups) lines.push([g.key, g.value, g.count].map(esc).join(';'));
  return '﻿' + lines.join('\r\n');
}
