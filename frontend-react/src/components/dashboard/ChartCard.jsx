// ChartCard — un NODO del lienzo del Tablero.
// Render de gráficos con Chart.js + tema unificado (chartjsTheme): barras,
// dona, línea, área y dispersión con tooltips/animaciones de producto.
// Tabla, KPI y la fuente de Parámetros (QA) siguen en DOM (ahí es lo correcto).
// Interacción (heredada del engine, no del dibujo):
//   · clic en barra/segmento/punto → aislar en el 3D
//   · "Pintar" → colorear grupos en el 3D (y en Revit vía Live Link)
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Chart from './chartjsTheme';
import { aggregate, scatterPoints, distinctValues, colorAt, fmt, groupsToCsv } from './engine';

// Línea de referencia (patrón de los tableros Plotly: umbral/meta punteada con
// etiqueta). Plugin propio de chart.js — sin dependencias extra.
const refLinePlugin = {
  id: 'ecdRefLine',
  afterDatasetsDraw(chart, _args, opts) {
    const v = Number(opts?.value);
    if (!Number.isFinite(v)) return;
    const onX = opts.axis === 'x'; // barras horizontales: el eje de VALOR es X
    const scale = onX ? chart.scales.x : chart.scales.y;
    const { ctx, chartArea } = chart;
    if (!scale || !chartArea) return;
    const px = scale.getPixelForValue(v);
    if (!Number.isFinite(px)) return;
    ctx.save();
    ctx.strokeStyle = '#e0a63f';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (onX) { ctx.moveTo(px, chartArea.top); ctx.lineTo(px, chartArea.bottom); }
    else { ctx.moveTo(chartArea.left, px); ctx.lineTo(chartArea.right, px); }
    ctx.stroke();
    if (opts.label) {
      ctx.fillStyle = '#e0a63f';
      ctx.font = "600 10px 'Inter', sans-serif";
      if (onX) { ctx.textAlign = 'left'; ctx.fillText(opts.label, px + 5, chartArea.top + 11); }
      else { ctx.textAlign = 'right'; ctx.fillText(opts.label, chartArea.right - 5, px - 5); }
    }
    ctx.restore();
  },
};

const METRIC_LABEL = { count: 'Cantidad', sum: 'Suma', avg: 'Promedio' };
const ACCENT = '#5b8fd6';
const CJS_TYPES = new Set(['bar', 'donut', 'line', 'area', 'scatter']);

function IconBtn({ title, onClick, children, danger }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer',
      color: danger ? '#c65555' : '#66707e', padding: 0,
    }}
      onMouseEnter={e => { e.currentTarget.style.background = '#eef1f5'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >{children}</button>
  );
}

// Resolución del canvas según el zoom del lienzo: el chart vive dentro de un
// transform:scale() — si no subimos su devicePixelRatio al acercarse, el bitmap
// se estira y se ve borroso. Tope 4 para no comer memoria en nodos grandes.
const dprFor = (zoom) => Math.min(Math.max((window.devicePixelRatio || 1) * (zoom || 1), 1), 4);

// ── Gráficos Chart.js (un componente, todos los tipos) ───────────────────────
function CjsChart({ config, agg, points, onSegment, activeKey, metricLabel, zoom = 1 }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  // refs vivas para los handlers (evitan closures viejos sin recrear el chart)
  const liveRef = useRef({});
  useEffect(() => {
    liveRef.current = { onSegment, groups: agg?.groups || [], points: points?.points || [], type: config.type };
  });

  // Firma estructural: recrear SOLO si cambian datos o tipo (no por hover/aislado)
  const sig = useMemo(() => JSON.stringify({
    t: config.type,
    g: (agg?.groups || []).map(g => [g.key, g.value]),
    p: points?.points?.length || 0,
    x: config.xField, y: config.yField,
    r: [config.refValue, config.refLabel],
  }), [config.type, config.xField, config.yField, config.refValue, config.refLabel, agg, points]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    try { chartRef.current?.destroy(); } catch { /* */ }

    const groups = agg?.groups || [];
    const labels = groups.map(g => g.key);
    const values = groups.map(g => g.value);
    const colors = groups.map((g, i) => (g.isOthers ? '#525a66' : colorAt(i)));

    const onClick = (evt, els) => {
      const el = els?.[0];
      if (!el) return;
      const live = liveRef.current;
      if (live.type === 'scatter') {
        const p = live.points[el.index];
        if (p) live.onSegment({ key: p.name, value: p.y, count: 1, externalIds: [p.externalId] });
      } else {
        const g = live.groups[el.index];
        if (g) live.onSegment(g);
      }
    };
    const onHover = (e, els) => {
      if (e?.native?.target) e.native.target.style.cursor = els.length ? 'pointer' : 'default';
    };
    const base = { responsive: true, maintainAspectRatio: false, onClick, onHover, devicePixelRatio: dprFor(zoomRef.current) };
    // Línea de referencia: en barras horizontales el valor vive en X; en el resto, en Y.
    const refOpts = { value: config.refValue, label: config.refLabel, axis: config.type === 'bar' ? 'x' : 'y' };
    const axisTitle = (text) => ({ display: !!text, text: text || '', font: { size: 10 }, color: '#6f7987' });

    let cfg;
    if (config.type === 'donut') {
      cfg = {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: '#ffffff', borderWidth: 2, hoverOffset: 7 }] },
        options: {
          ...base, cutout: '62%',
          plugins: {
            legend: { position: 'right', labels: { font: { size: 10.5 } } },
            tooltip: {
              callbacks: {
                label: (c) => {
                  const total = values.reduce((s, v) => s + v, 0) || 1;
                  const g = groups[c.dataIndex];
                  return ` ${fmt(c.parsed)} (${Math.round((c.parsed / total) * 100)}%) · ${fmt(g?.count ?? 0)} elem.`;
                },
              },
            },
          },
        },
      };
    } else if (config.type === 'line' || config.type === 'area') {
      cfg = {
        type: 'line',
        plugins: [refLinePlugin],
        data: {
          labels,
          datasets: [{
            data: values, borderColor: ACCENT, borderWidth: 2, tension: 0.35,
            fill: config.type === 'area', backgroundColor: 'rgba(91,143,214,0.16)',
            pointRadius: 2.5, pointHoverRadius: 5.5, pointBackgroundColor: ACCENT,
          }],
        },
        options: {
          ...base,
          plugins: {
            legend: { display: false },
            ecdRefLine: refOpts,
            tooltip: {
              callbacks: {
                label: (c) => {
                  const g = groups[c.dataIndex];
                  return ` ${metricLabel}: ${fmt(c.parsed.y)} · ${fmt(g?.count ?? 0)} elem.`;
                },
              },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 }, autoSkipPadding: 8 }, title: axisTitle(config.groupBy) },
            y: { ticks: { callback: (v) => fmt(v) }, title: axisTitle(metricLabel) },
          },
        },
      };
    } else if (config.type === 'scatter') {
      const pts = points?.points || [];
      cfg = {
        type: 'scatter',
        plugins: [refLinePlugin],
        data: { datasets: [{ data: pts.map(p => ({ x: p.x, y: p.y })), backgroundColor: 'rgba(91,143,214,0.55)', pointRadius: 2.6, pointHoverRadius: 6, pointHoverBackgroundColor: '#8fb8e8' }] },
        options: {
          ...base,
          plugins: {
            legend: { display: false },
            ecdRefLine: refOpts,
            tooltip: {
              callbacks: {
                title: (items) => liveRef.current.points[items[0]?.dataIndex]?.name || '',
                label: (c) => ` ${config.xField}: ${fmt(c.parsed.x)} · ${config.yField}: ${fmt(c.parsed.y)}`,
              },
            },
          },
          scales: {
            x: { title: { display: true, text: config.xField, font: { size: 10 } }, ticks: { callback: (v) => fmt(v) } },
            y: { title: { display: true, text: config.yField, font: { size: 10 } }, ticks: { callback: (v) => fmt(v) } },
          },
        },
      };
    } else {
      // barras horizontales (nombres largos de obra se leen mejor así)
      cfg = {
        type: 'bar',
        plugins: [refLinePlugin],
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 4, borderSkipped: false, maxBarThickness: 24 }] },
        options: {
          ...base, indexAxis: 'y',
          plugins: {
            legend: { display: false },
            ecdRefLine: refOpts,
            tooltip: {
              callbacks: {
                label: (c) => {
                  const g = groups[c.dataIndex];
                  return ` ${metricLabel}: ${fmt(c.parsed.x)} · ${fmt(g?.count ?? 0)} elem.`;
                },
              },
            },
          },
          scales: {
            x: { ticks: { callback: (v) => fmt(v) }, title: axisTitle(metricLabel) },
            y: {
              grid: { display: false },
              ticks: {
                autoSkip: false, font: { size: 10.5 },
                callback(v) { const l = this.getLabelForValue(v); return l.length > 22 ? l.slice(0, 21) + '…' : l; },
              },
            },
          },
        },
      };
    }

    chartRef.current = new Chart(canvas, cfg);
    return () => { try { chartRef.current?.destroy(); } catch { /* */ } chartRef.current = null; };
  }, [sig]);

  // Re-rasterizar al asentarse el zoom (debounce: no redibujar en cada tick de
  // rueda). Así el gráfico queda NÍTIDO a cualquier acercamiento.
  useEffect(() => {
    const t = setTimeout(() => {
      const ch = chartRef.current;
      if (!ch) return;
      const target = dprFor(zoom);
      const cur = ch.options.devicePixelRatio || 1;
      if (Math.abs(target - cur) / cur > 0.12) {
        ch.options.devicePixelRatio = target;
        ch.resize();
      }
    }, 220);
    return () => clearTimeout(t);
  }, [zoom]);

  // Resaltar el grupo aislado SIN recrear (y sin re-animar)
  useEffect(() => {
    const ch = chartRef.current;
    if (!ch || (config.type !== 'bar' && config.type !== 'donut')) return;
    const groups = agg?.groups || [];
    ch.data.datasets[0].backgroundColor = groups.map((g, i) => {
      const baseColor = g.isOthers ? '#525a66' : colorAt(i);
      if (!activeKey) return baseColor;
      return g.key === activeKey ? baseColor : baseColor + '3d';
    });
    ch.update('none');
  }, [activeKey, sig]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

// ── Renderizadores DOM (tabla / KPI / fuente QA) ─────────────────────────────

function Kpi({ total, totalCount, config }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ fontSize: 40, fontWeight: 700, color: '#171c24', letterSpacing: -1, fontVariantNumeric: 'tabular-nums', fontFamily: "'Poppins', 'Inter', sans-serif" }}>{fmt(total)}</div>
      <div style={{ fontSize: 12, color: '#7a8494', marginTop: 6, textAlign: 'center' }}>
        {METRIC_LABEL[config.metric || 'count']}{config.metric !== 'count' && config.valueField ? ` de ${config.valueField}` : ''} · {fmt(totalCount)} elementos
      </div>
    </div>
  );
}

function TableView({ groups, total, metricLabel, onSegment, activeKey }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
      <thead>
        <tr>
          {['Grupo', metricLabel, '%'].map(h => (
            <th key={h} style={{ position: 'sticky', top: 0, background: '#f3f5f7', textAlign: h === 'Grupo' ? 'left' : 'right', color: '#66707e', fontWeight: 600, padding: '5px 8px', borderBottom: '1px solid #e2e6ea' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {groups.map((g, i) => (
          <tr key={g.key} onClick={() => onSegment(g)}
            style={{ cursor: 'pointer', background: activeKey === g.key ? '#e8f0fa' : (i % 2 ? '#f8fafb' : 'transparent') }}>
            <td style={{ padding: '4px 8px', color: '#2a313c' }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: g.isOthers ? '#9aa3ae' : colorAt(i), marginRight: 6 }} />
              {g.key}
            </td>
            <td style={{ padding: '4px 8px', textAlign: 'right', color: '#171c24', fontVariantNumeric: 'tabular-nums' }}>{fmt(g.value)}</td>
            <td style={{ padding: '4px 8px', textAlign: 'right', color: '#7a8494', fontVariantNumeric: 'tabular-nums' }}>{total > 0 ? Math.round((g.value / total) * 100) : 0}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Nodo FUENTE: parámetros del modelo con su completitud (QA). Clic en uno →
// crear un gráfico agrupado por ese parámetro (flujo Vyssuals).
function ParamsSource({ fields, onCreateFromField }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    let f = fields;
    if (q.trim()) f = f.filter(x => x.key.toLowerCase().includes(q.toLowerCase()));
    return f.slice(0, 120);
  }, [fields, q]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <input
        value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar parámetro…"
        onPointerDown={e => e.stopPropagation()}
        style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #d5dae1', background: '#ffffff', color: '#1f242c', fontSize: 12, outline: 'none', flexShrink: 0 }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#98a2b0', padding: '0 2px', flexShrink: 0 }}>
        <span>Parámetro · clic para graficar</span><span>Completitud</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {list.map(f => (
          <div key={f.key} onClick={() => onCreateFromField(f)}
            title={`${f.key} — ${f.fillPct}% con dato · clic: crear gráfico`}
            style={{ padding: '5px 8px', borderRadius: 6, cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#eef2f6'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5 }}>
              <span style={{ color: '#39424e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.key}</span>
              <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: f.fillPct >= 90 ? '#2f9e66' : f.fillPct >= 50 ? '#c98f2a' : '#c65555' }}>{f.fillPct}%</span>
            </div>
            <div style={{ height: 3, background: '#e8ebef', borderRadius: 2, marginTop: 3 }}>
              <div style={{ width: `${f.fillPct}%`, height: '100%', borderRadius: 2, background: f.fillPct >= 90 ? '#3fb27f' : f.fillPct >= 50 ? '#e0a63f' : '#d66a6a' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Nodo ─────────────────────────────────────────────────────────────────────
export default function ChartCard({ config, rows, fields = [], onEdit, onUpdate, onDelete, onIsolate, onPaint, onCreateFromField, activeKey, dragHandlers, zoom = 1 }) {
  const [painted, setPainted] = useState(false);
  const isQa = config.type === 'qa';
  const isScatter = config.type === 'scatter';
  const isCjs = CJS_TYPES.has(config.type);

  // Filtro rápido DENTRO de la tarjeta (patrón Plotly/Dash: controles en el
  // gráfico, sin abrir el editor). Solo si el gráfico tiene un campo de filtro.
  const filterOpts = useMemo(
    () => (!isQa && config.filter?.field ? distinctValues(rows, config.filter.field, 12) : []),
    [rows, config.filter?.field, isQa]
  );
  const toggleFilterValue = (v) => {
    const cur = new Set(config.filter?.values || []);
    if (cur.has(v)) cur.delete(v); else cur.add(v);
    onUpdate?.({ ...config, filter: { ...config.filter, values: [...cur] } });
  };

  const agg = useMemo(
    () => ((isQa || isScatter) ? { groups: [], total: 0, totalCount: rows?.length || 0 } : aggregate(rows, config)),
    [rows, config, isQa, isScatter]
  );
  const points = useMemo(
    () => (isScatter ? scatterPoints(rows, config) : null),
    [rows, config, isScatter]
  );

  const metricLabel = METRIC_LABEL[config.metric || 'count'] + (config.metric !== 'count' && config.valueField ? ` · ${config.valueField}` : '');

  const handleSegment = (g) => onIsolate(g, config);
  const handlePaint = async () => {
    const ok = await onPaint(agg.groups, config);
    setPainted(!!ok);
    setTimeout(() => setPainted(false), 1800);
  };
  const exportCsv = () => {
    let csv;
    if (isQa) csv = '﻿' + ['Parámetro;Completitud %;Tipo', ...fields.map(f => `${f.key};${f.fillPct};${f.isNumeric ? 'numérico' : 'texto'}`)].join('\r\n');
    else if (isScatter) csv = '﻿' + [`Elemento;${config.xField};${config.yField}`, ...(points?.points || []).map(p => `${String(p.name).replace(/;/g, ',')};${p.x};${p.y}`)].join('\r\n');
    else csv = groupsToCsv(config.groupBy || 'Total', metricLabel, agg.groups);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(config.title || 'grafico').replace(/[\\/:*?"<>|]/g, '_')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 800);
  };

  const subtitle = isQa
    ? `${fields.length} parámetros · % de elementos con dato`
    : isScatter
      ? `${config.yField || '?'} vs ${config.xField || '?'} · ${fmt(points?.total || 0)} puntos${points?.sampled ? ' (muestreado)' : ''}`
      : `${config.groupBy ? `por ${config.groupBy}` : 'total'} · ${metricLabel}${config.filter?.values?.length ? ` · filtro: ${config.filter.field}` : ''}`;

  const body = isQa
    ? <ParamsSource fields={fields} onCreateFromField={onCreateFromField} />
    : config.type === 'kpi'
      ? <Kpi total={agg.total} totalCount={agg.totalCount} config={config} />
      : config.type === 'table'
        ? <TableView groups={agg.groups} total={agg.total} metricLabel={METRIC_LABEL[config.metric || 'count']} onSegment={handleSegment} activeKey={activeKey} />
        : (!isScatter && !agg.groups.length)
          ? <div style={{ padding: 18, color: '#98a2b0', fontSize: 12 }}>Sin datos para esta configuración.</div>
          : (isScatter && !(points?.points?.length))
            ? <div style={{ padding: 18, color: '#98a2b0', fontSize: 12 }}>Sin pares numéricos para {config.xField || '?'} / {config.yField || '?'}.</div>
            : <CjsChart config={config} agg={agg} points={points} onSegment={handleSegment} activeKey={activeKey} metricLabel={METRIC_LABEL[config.metric || 'count']} zoom={zoom} />;

  return (
    <div style={{
      width: '100%', height: '100%', boxSizing: 'border-box',
      background: '#ffffff', border: '1px solid #e4e7eb', borderRadius: 14,
      padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0,
      boxShadow: '0 8px 22px -12px rgba(23,28,38,0.20)',
    }}>
      {/* Cabecera = asa de arrastre del nodo en el lienzo */}
      <div {...dragHandlers}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'grab', flexShrink: 0, userSelect: 'none', touchAction: 'none' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Título en Poppins (misma receta tipográfica de Vyssuals) */}
          <div style={{ fontSize: 14, fontWeight: 600, color: '#171c24', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Poppins', 'Inter', system-ui, sans-serif", letterSpacing: 0.1 }}>{config.title || config.groupBy || (isQa ? 'Parámetros del modelo' : 'Gráfico')}</div>
          <div style={{ fontSize: 10.5, color: '#8a93a1', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
          {/* La PREGUNTA que responde el gráfico (patrón editorial de Plotly/Dash) */}
          {config.question && (
            <div style={{ fontSize: 11, fontStyle: 'italic', color: '#6b7280', marginTop: 6, lineHeight: 1.5 }}>{config.question}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onPointerDown={e => e.stopPropagation()}>
          {!isQa && !isScatter && config.type !== 'kpi' && (
            <IconBtn title={painted ? '¡Pintado en el 3D!' : 'Pintar grupos en el 3D (y en Revit si está vinculado)'} onClick={handlePaint}>
              {painted
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3fb27f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l7 7-9 9H4v-6l8-8z" /><path d="M15 5l4 4" /></svg>}
            </IconBtn>
          )}
          <IconBtn title="Exportar CSV (Excel)" onClick={exportCsv}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          </IconBtn>
          {!isQa && (
            <IconBtn title="Editar gráfico" onClick={() => onEdit(config)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
            </IconBtn>
          )}
          <IconBtn title="Eliminar" onClick={() => onDelete(config.id)} danger>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </IconBtn>
        </div>
      </div>
      {/* Filtro rápido: chips de valores del campo filtrado (sin abrir el editor).
          Ninguno seleccionado = mostrar todo. */}
      {filterOpts.length > 0 && (
        <div onPointerDown={e => e.stopPropagation()}
          style={{ display: 'flex', gap: 4, alignItems: 'center', overflowX: 'auto', flexShrink: 0, paddingBottom: 2, scrollbarWidth: 'thin' }}>
          <span style={{ fontSize: 10, color: '#98a2b0', flexShrink: 0 }}>{config.filter.field}:</span>
          {filterOpts.map(o => {
            const on = config.filter?.values?.includes(o.value);
            return (
              <button key={o.value} onClick={() => toggleFilterValue(o.value)}
                title={`${o.value} · ${fmt(o.count)} elem.`}
                style={{
                  flexShrink: 0, padding: '2px 9px', borderRadius: 11, fontSize: 10.5, cursor: 'pointer',
                  border: `1px solid ${on ? '#7aa4d4' : '#d5dae1'}`,
                  background: on ? '#e3edf8' : '#ffffff', color: on ? '#28527e' : '#66707e',
                  maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{o.value}</button>
            );
          })}
        </div>
      )}

      {/* Cuerpo: los gráficos canvas llenan sin scroll; tabla/QA sí se desplazan */}
      <div style={{ flex: 1, minHeight: 0, overflowY: isCjs ? 'hidden' : 'auto' }} onPointerDown={e => e.stopPropagation()}>
        {body}
      </div>
    </div>
  );
}
