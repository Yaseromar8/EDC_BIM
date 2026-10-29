// ChartCard — un NODO del lienzo del Tablero.
// Render de gráficos con Chart.js + tema unificado (chartjsTheme): barras,
// dona, línea, área y dispersión con tooltips/animaciones de producto.
// Tabla, KPI y la fuente de Parámetros (QA) siguen en DOM (ahí es lo correcto).
// Interacción (heredada del engine, no del dibujo):
//   · clic en barra/segmento/punto → aislar en el 3D
//   · "Pintar" → colorear grupos en el 3D (y en Revit vía Live Link)
//
// Diseño (docs/visor/41): todas las tarjetas tienen las mismas partes —
// cabecera (título + pregunta), cuerpo y pie con de dónde sale el dato— y los
// colores de tema.js (paleta oficial): un color solo dice algo si el dato lo dice.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Chart from './chartjsTheme';
import { aggregate, scatterPoints, distinctValues, fmt, groupsToCsv } from './engine';
import { C, FUENTE, RADIO, colorDeGrupo, tieneColoresPropios, nombreCampo, nombreValor } from './tema';

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
    ctx.strokeStyle = C.orange30D;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (onX) { ctx.moveTo(px, chartArea.top); ctx.lineTo(px, chartArea.bottom); }
    else { ctx.moveTo(chartArea.left, px); ctx.lineTo(chartArea.right, px); }
    ctx.stroke();
    if (opts.label) {
      ctx.fillStyle = C.orange30D;
      ctx.font = `600 10px ${FUENTE}`;
      if (onX) { ctx.textAlign = 'left'; ctx.fillText(opts.label, px + 5, chartArea.top + 11); }
      else { ctx.textAlign = 'right'; ctx.fillText(opts.label, chartArea.right - 5, px - 5); }
    }
    ctx.restore();
  },
};

// La cifra al final de cada barra: se lee sin ir al eje (Few; Bach «números»).
const valorEnBarraPlugin = {
  id: 'ecdValorEnBarra',
  afterDatasetsDraw(chart) {
    const meta = chart.getDatasetMeta(0);
    const valores = chart.data.datasets[0]?.data || [];
    const { ctx } = chart;
    ctx.save();
    ctx.font = `500 11px ${FUENTE}`;
    ctx.fillStyle = C.dark;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    meta.data.forEach((barra, i) => {
      const v = valores[i];
      if (!Number.isFinite(v)) return;
      ctx.fillText(fmt(v), barra.x + 6, barra.y);
    });
    ctx.restore();
  },
};

// El total en el centro de la dona.
const totalEnDonaPlugin = {
  id: 'ecdTotalEnDona',
  afterDraw(chart, _args, opts) {
    const meta = chart.getDatasetMeta(0);
    const arco = meta?.data?.[0];
    if (!arco || !Number.isFinite(opts?.total)) return;
    const { ctx } = chart;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.dark;
    ctx.font = `600 18px ${FUENTE}`;
    ctx.fillText(fmt(opts.total), arco.x, arco.y - 6);
    ctx.fillStyle = C.gris600;
    ctx.font = `400 10.5px ${FUENTE}`;
    ctx.fillText(opts.unidad || '', arco.x, arco.y + 12);
    ctx.restore();
  },
};

const METRIC_LABEL = { count: 'Cantidad', sum: 'Suma', avg: 'Promedio' };
const CJS_TYPES = new Set(['bar', 'donut', 'line', 'area', 'scatter']);
// Atenuar lo no elegido: el color del grupo con poca opacidad (sigue siendo el suyo).
const atenuar = (hex) => hex + '40';

function IconBtn({ title, onClick, children, danger }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer',
      color: danger ? C.error : C.gris600, padding: 0,
    }}
      onMouseEnter={e => { e.currentTarget.style.background = C.light50; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >{children}</button>
  );
}

// Resolución del canvas según el zoom del lienzo: el chart vive dentro de un
// transform:scale() — si no subimos su devicePixelRatio al acercarse, el bitmap
// se estira y se ve borroso. Tope 4 para no comer memoria en nodos grandes.
const dprFor = (zoom) => Math.min(Math.max((window.devicePixelRatio || 1) * (zoom || 1), 1), 4);

// Color de cada grupo según el tipo de gráfico y lo elegido (aislado).
function coloresDe(config, groups, activeKey) {
  const unaSerie = config.type === 'bar' && !tieneColoresPropios(config.groupBy);
  return groups.map((g, i) => {
    const base = colorDeGrupo(config, g, i, { unaSerie });
    if (!activeKey) return base;
    if (g.key === activeKey) return unaSerie ? C.blue : base;   // lo elegido, en el azul de selección
    return unaSerie ? C.gris300 : atenuar(base);
  });
}

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
    x: config.xField, y: config.yField, by: config.groupBy,
    r: [config.refValue, config.refLabel],
  }), [config.type, config.xField, config.yField, config.groupBy, config.refValue, config.refLabel, agg, points]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    try { chartRef.current?.destroy(); } catch { /* */ }

    const groups = agg?.groups || [];
    const labels = groups.map(g => nombreValor(g.key));
    const values = groups.map(g => g.value);
    const colors = coloresDe(config, groups, null);

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
    const axisTitle = (text) => ({ display: !!text, text: text || '', font: { size: 10 }, color: C.gris600 });

    let cfg;
    if (config.type === 'donut') {
      const total = values.reduce((s, v) => s + v, 0);
      cfg = {
        type: 'doughnut',
        plugins: [totalEnDonaPlugin],
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: C.blanco, borderWidth: 2, hoverOffset: 4 }] },
        options: {
          ...base, cutout: '66%',
          plugins: {
            legend: { display: false },   // la leyenda va en la tarjeta, completa y con cifras
            ecdTotalEnDona: { total, unidad: config.metric === 'count' ? 'elementos' : metricLabel.toLowerCase() },
            tooltip: {
              callbacks: {
                label: (c) => {
                  const g = groups[c.dataIndex];
                  return ` ${fmt(c.parsed)} (${Math.round((c.parsed / (total || 1)) * 100)} %) · ${fmt(g?.count ?? 0)} elem.`;
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
            data: values, borderColor: C.gris700, borderWidth: 2, tension: 0.3,
            fill: config.type === 'area', backgroundColor: 'rgba(82, 82, 77, 0.10)',
            pointRadius: 2.5, pointHoverRadius: 5, pointBackgroundColor: C.gris700,
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
            x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 }, autoSkipPadding: 8 }, title: axisTitle(nombreCampo(config.groupBy)) },
            y: { ticks: { callback: (v) => fmt(v) }, title: axisTitle(metricLabel) },
          },
        },
      };
    } else if (config.type === 'scatter') {
      const pts = points?.points || [];
      cfg = {
        type: 'scatter',
        plugins: [refLinePlugin],
        data: { datasets: [{ data: pts.map(p => ({ x: p.x, y: p.y })), backgroundColor: 'rgba(106, 155, 204, 0.55)', pointRadius: 2.6, pointHoverRadius: 6, pointHoverBackgroundColor: C.blue30D }] },
        options: {
          ...base,
          plugins: {
            legend: { display: false },
            ecdRefLine: refOpts,
            tooltip: {
              callbacks: {
                title: (items) => liveRef.current.points[items[0]?.dataIndex]?.name || '',
                label: (c) => ` ${nombreCampo(config.xField)}: ${fmt(c.parsed.x)} · ${nombreCampo(config.yField)}: ${fmt(c.parsed.y)}`,
              },
            },
          },
          scales: {
            x: { title: { display: true, text: nombreCampo(config.xField), font: { size: 10 } }, ticks: { callback: (v) => fmt(v) } },
            y: { title: { display: true, text: nombreCampo(config.yField), font: { size: 10 } }, ticks: { callback: (v) => fmt(v) } },
          },
        },
      };
    } else {
      // Barras horizontales (los nombres largos de obra se leen mejor así), con la
      // cifra al final de cada barra: el eje de valores sobra y se oculta.
      cfg = {
        type: 'bar',
        plugins: [refLinePlugin, valorEnBarraPlugin],
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 2, borderSkipped: false, maxBarThickness: 18 }] },
        options: {
          ...base, indexAxis: 'y',
          layout: { padding: { right: 56 } },
          plugins: {
            legend: { display: false },
            ecdRefLine: refOpts,
            tooltip: {
              callbacks: {
                title: (items) => nombreValor(groups[items[0]?.dataIndex]?.key),
                label: (c) => {
                  const g = groups[c.dataIndex];
                  return ` ${metricLabel}: ${fmt(c.parsed.x)} · ${fmt(g?.count ?? 0)} elem.`;
                },
              },
            },
          },
          scales: {
            x: { display: false, beginAtZero: true },
            y: {
              grid: { display: false },
              border: { display: false },
              ticks: {
                autoSkip: false, font: { size: 11 }, color: C.dark,
                // Recorte según el ancho real de la tarjeta (en una S no caben 26 letras):
                // la etiqueta entera sigue en el aviso al pasar el ratón.
                callback(v) {
                  const l = this.getLabelForValue(v);
                  const max = Math.max(8, Math.floor((this.chart.width * 0.4) / 6.4));
                  return l.length > max ? l.slice(0, max - 1) + '…' : l;
                },
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
    ch.data.datasets[0].backgroundColor = coloresDe(config, agg?.groups || [], activeKey);
    ch.update('none');
  }, [activeKey, sig]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

// ── Renderizadores DOM (tabla / KPI / leyenda de la dona / fuente QA) ────────

function Kpi({ total, totalCount, config }) {
  const ref = Number(config.refValue);
  const conRef = Number.isFinite(ref) && ref > 0;
  const pct = conRef ? Math.min(total / ref, 1) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', gap: 8 }}>
      <div style={{ fontSize: 34, fontWeight: 600, color: C.dark, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fmt(total)}</div>
      <div style={{ fontSize: 11.5, color: C.gris600 }}>
        {METRIC_LABEL[config.metric || 'count']}{config.metric !== 'count' && config.valueField ? ` de ${nombreCampo(config.valueField)}` : ''} · {fmt(totalCount)} elementos
      </div>
      {/* Barra contra la referencia (bullet graph de Few): cuánto falta para la meta */}
      {conRef && (
        <div>
          <div style={{ position: 'relative', height: 8, background: C.light50, borderRadius: 2 }}>
            <div style={{ width: `${pct * 100}%`, height: '100%', background: C.gris700, borderRadius: 2 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.gris600, marginTop: 4 }}>
            <span>{Math.round((total / ref) * 100)} % de {config.refLabel || 'la referencia'}</span>
            <span style={{ color: C.orange30D }}>{fmt(ref)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function LeyendaDona({ config, groups, total, activeKey, onSegment }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, minWidth: 0 }}>
      {groups.map((g, i) => (
        <button key={g.key} onClick={() => onSegment(g)} title={`${nombreValor(g.key)} · clic: aislar en el 3D`}
          style={{
            display: 'grid', gridTemplateColumns: '10px 1fr auto', alignItems: 'center', gap: 8, padding: '3px 6px',
            border: 'none', borderRadius: 4, cursor: 'pointer', textAlign: 'left', font: 'inherit', fontSize: 11.5,
            background: activeKey === g.key ? C.blueTinte : 'transparent', color: C.dark,
          }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: colorDeGrupo(config, g, i) }} />
          <span style={{ lineHeight: 1.3 }}>{nombreValor(g.key)}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {fmt(g.value)} <span style={{ color: C.gris600 }}>{total > 0 ? Math.round((g.value / total) * 100) : 0} %</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function TableView({ config, groups, total, metricLabel, onSegment, activeKey }) {
  const conColor = tieneColoresPropios(config.groupBy);
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
      <thead>
        <tr>
          {['Grupo', metricLabel, '%'].map(h => (
            <th key={h} style={{ position: 'sticky', top: 0, background: C.light50, textAlign: h === 'Grupo' ? 'left' : 'right', color: C.gris600, fontWeight: 600, padding: '5px 8px', borderBottom: `1px solid ${C.lightGray}` }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {groups.map((g, i) => (
          <tr key={g.key} onClick={() => onSegment(g)}
            style={{ cursor: 'pointer', background: activeKey === g.key ? C.blueTinte : 'transparent', borderBottom: `1px solid ${C.light50}` }}>
            <td style={{ padding: '4px 8px', color: C.dark }}>
              {conColor && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: colorDeGrupo(config, g, i), marginRight: 6 }} />}
              {nombreValor(g.key)}
            </td>
            <td style={{ padding: '4px 8px', textAlign: 'right', color: C.dark, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{fmt(g.value)}</td>
            <td style={{ padding: '4px 8px', textAlign: 'right', color: C.gris600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{total > 0 ? Math.round((g.value / total) * 100) : 0} %</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Completitud: verde completo, naranja a medias, rojo casi vacío (paleta oficial).
const colorCompletitud = (pct) => (pct >= 90 ? C.green : pct >= 50 ? C.orange : C.error);

// Nodo FUENTE: parámetros del modelo con su completitud (QA). Clic en uno →
// crear un gráfico agrupado por ese parámetro (flujo Vyssuals). Agrupados por su
// grupo de Revit y, dentro, los INCOMPLETOS primero: es lo que interesa revisar.
function ParamsSource({ fields, onCreateFromField }) {
  const [q, setQ] = useState('');
  const grupos = useMemo(() => {
    let f = fields;
    if (q.trim()) f = f.filter(x => x.key.toLowerCase().includes(q.toLowerCase()));
    const por = new Map();
    for (const x of f.slice(0, 400)) {
      const i = x.key.indexOf('::');
      const grupo = i > 0 ? x.key.slice(0, i) : 'Generales';
      if (!por.has(grupo)) por.set(grupo, []);
      por.get(grupo).push({ ...x, nombre: i > 0 ? x.key.slice(i + 2) : x.key });
    }
    const out = [...por.entries()].map(([grupo, lista]) => ({
      grupo,
      lista: lista.sort((a, b) => a.fillPct - b.fillPct || a.nombre.localeCompare(b.nombre, 'es', { numeric: true })),
    }));
    out.sort((a, b) => a.grupo.localeCompare(b.grupo, 'es'));
    return out;
  }, [fields, q]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <input
        value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar parámetro…"
        onPointerDown={e => e.stopPropagation()}
        style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.gris300}`, background: C.blanco, color: C.dark, fontSize: 12, outline: 'none', flexShrink: 0, fontFamily: FUENTE }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.gris600, padding: '0 2px', flexShrink: 0 }}>
        <span>Clic en un parámetro para graficarlo</span><span>Con dato</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {grupos.map(({ grupo, lista }) => (
          <div key={grupo}>
            <div style={{ position: 'sticky', top: 0, background: C.blanco, fontSize: 10.5, fontWeight: 600, color: C.gris600, padding: '6px 8px 3px', borderBottom: `1px solid ${C.light50}` }}>
              {grupo} <span style={{ fontWeight: 400 }}>· {lista.length}</span>
            </div>
            {lista.map(f => (
              <div key={f.key} onClick={() => onCreateFromField(f)}
                title={`${nombreCampo(f.key)} — ${f.fillPct} % de los elementos con dato · ${f.isNumeric ? 'número' : 'texto'} · ${f.distinct >= 60 ? '60 o más' : f.distinct} valores distintos · clic: crear gráfico`}
                style={{ padding: '5px 8px', borderRadius: 4, cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.background = C.light50; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5 }}>
                  <span style={{ color: C.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre}</span>
                  <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: colorCompletitud(f.fillPct) }}>{f.fillPct} %</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                  <div style={{ flex: 1, height: 3, background: C.light50, borderRadius: 2 }}>
                    <div style={{ width: `${f.fillPct}%`, height: '100%', borderRadius: 2, background: colorCompletitud(f.fillPct) }} />
                  </div>
                  <span style={{ fontSize: 10, color: C.gris600, flexShrink: 0 }}>{f.isNumeric ? 'número' : 'texto'} · {f.distinct >= 60 ? '60+' : f.distinct}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Nodo ─────────────────────────────────────────────────────────────────────
export default function ChartCard({ config, rows, fields = [], meta = null, onEdit, onUpdate, onDelete, onIsolate, onPaint, onCreateFromField, activeKey, dragHandlers, zoom = 1 }) {
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

  const metricLabel = METRIC_LABEL[config.metric || 'count'] + (config.metric !== 'count' && config.valueField ? ` · ${nombreCampo(config.valueField)}` : '');

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

  // Título legible: el que puso el usuario o el del campo («Planilla › Capítulo»).
  const titulo = nombreCampo(config.title || config.groupBy) || (isQa ? 'Parámetros del modelo' : 'Gráfico');
  const subtitle = isQa
    ? `${fields.length} parámetros · % de elementos con dato`
    : isScatter
      ? `${nombreCampo(config.yField) || '?'} frente a ${nombreCampo(config.xField) || '?'}`
      : `${config.groupBy ? `por ${nombreCampo(config.groupBy)}` : 'total'} · ${metricLabel}`;

  // Pie: de dónde sale el dato y sobre cuántos elementos (Bach: metainformación).
  const pie = isQa
    ? `${meta?.fuente || 'Inventario'} · ${fmt(rows?.length || 0)} elementos${meta?.hora ? ` · ${meta.hora}` : ''}`
    : [
      meta?.fuente || 'Inventario',
      isScatter ? `${fmt(points?.total || 0)} elementos${points?.sampled ? ' (muestreo)' : ''}` : `${fmt(agg.totalCount)} elementos`,
      config.filter?.values?.length ? `filtro: ${nombreCampo(config.filter.field)}` : null,
      meta?.hora || null,
    ].filter(Boolean).join(' · ');

  const vacio = (texto) => <div style={{ padding: 18, color: C.gris600, fontSize: 12 }}>{texto}</div>;
  const body = isQa
    ? <ParamsSource fields={fields} onCreateFromField={onCreateFromField} />
    : config.type === 'kpi'
      ? <Kpi total={agg.total} totalCount={agg.totalCount} config={config} />
      : config.type === 'table'
        ? <TableView config={config} groups={agg.groups} total={agg.total} metricLabel={METRIC_LABEL[config.metric || 'count']} onSegment={handleSegment} activeKey={activeKey} />
        : (!isScatter && !agg.groups.length)
          ? vacio('Sin datos para esta configuración.')
          : (isScatter && !(points?.points?.length))
            ? vacio(`Sin pares numéricos para ${nombreCampo(config.xField) || '?'} / ${nombreCampo(config.yField) || '?'}.`)
            : config.type === 'donut'
              ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 44%) 1fr', gap: 12, height: '100%' }}>
                  <CjsChart config={config} agg={agg} points={points} onSegment={handleSegment} activeKey={activeKey} metricLabel={METRIC_LABEL[config.metric || 'count']} zoom={zoom} />
                  <LeyendaDona config={config} groups={agg.groups} total={agg.total} activeKey={activeKey} onSegment={handleSegment} />
                </div>
              )
              : <CjsChart config={config} agg={agg} points={points} onSegment={handleSegment} activeKey={activeKey} metricLabel={METRIC_LABEL[config.metric || 'count']} zoom={zoom} />;

  return (
    <div style={{
      width: '100%', height: '100%', boxSizing: 'border-box',
      background: C.blanco, border: `1px solid ${C.lightGray}`, borderRadius: RADIO,
      padding: '12px 14px 0', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0,
      fontFamily: FUENTE, color: C.dark,
    }}>
      {/* Cabecera = asa de arrastre del nodo en el lienzo */}
      <div {...dragHandlers}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'grab', flexShrink: 0, userSelect: 'none', touchAction: 'none' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={titulo}>{titulo}</div>
          {/* La PREGUNTA que responde el gráfico (patrón editorial); si no hay, de qué es */}
          <div style={{ fontSize: 11, color: C.gris600, marginTop: 2, lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: config.question ? 'normal' : 'nowrap' }}>
            {config.question || subtitle}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onPointerDown={e => e.stopPropagation()}>
          {!isQa && !isScatter && config.type !== 'kpi' && (
            <IconBtn title={painted ? 'Pintado en el 3D' : 'Pintar grupos en el 3D (y en Revit si está vinculado)'} onClick={handlePaint}>
              {painted
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
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
      {/* Filtro rápido: valores del campo filtrado (sin abrir el editor).
          Ninguno seleccionado = mostrar todo. */}
      {filterOpts.length > 0 && (
        <div onPointerDown={e => e.stopPropagation()}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', flexShrink: 0, maxHeight: 46, overflow: 'hidden' }}>
          <span style={{ fontSize: 10.5, color: C.gris600, flexShrink: 0 }}>{nombreCampo(config.filter.field)}:</span>
          {filterOpts.map(o => {
            const on = config.filter?.values?.includes(o.value);
            return (
              <button key={o.value} onClick={() => toggleFilterValue(o.value)}
                title={`${nombreValor(o.value)} · ${fmt(o.count)} elem.`}
                style={{
                  flexShrink: 0, padding: '2px 8px', borderRadius: 4, fontSize: 10.5, cursor: 'pointer', fontFamily: FUENTE,
                  border: `1px solid ${on ? C.blue : C.gris300}`,
                  background: on ? C.blueTinte : C.blanco, color: on ? C.blue30D : C.texto2,
                  maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{nombreValor(o.value)}</button>
            );
          })}
        </div>
      )}

      {/* Cuerpo: los gráficos canvas llenan sin scroll; tabla/QA sí se desplazan */}
      <div style={{ flex: 1, minHeight: 0, overflowY: isCjs ? 'hidden' : 'auto' }} onPointerDown={e => e.stopPropagation()}>
        {body}
      </div>

      {/* Pie: de dónde sale el dato */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${C.light50}`, padding: '6px 0 8px', fontSize: 10.5, color: C.gris600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pie}>
        {pie}
      </div>
    </div>
  );
}
