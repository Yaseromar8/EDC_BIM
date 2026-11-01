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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Chart from './chartjsTheme';
import { aggregate, auditar, scatterPoints, distinctValues, fmt, groupsToCsv } from './engine';
import { C, FUENTE, RADIO, colorDeGrupo, tieneColoresPropios, nombreCampo, nombreValor } from './tema';
import GraficoAuditoria from './GraficoAuditoria';
import { ANALISIS } from './analisisDeAuditoria';
import { CLASES, auditarConMemoria, gruposDeClases } from './auditoriaPresupuesto';

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
      <div style={{ fontSize: 12, color: C.gris600 }}>
        {METRIC_LABEL[config.metric || 'count']}{config.metric !== 'count' && config.valueField ? ` de ${nombreCampo(config.valueField)}` : ''} · {fmt(totalCount)} elementos
      </div>
      {/* Barra contra la referencia (bullet graph de Few): cuánto falta para la meta */}
      {conRef && (
        <div>
          <div style={{ position: 'relative', height: 8, background: C.light50, borderRadius: 2 }}>
            <div style={{ width: `${pct * 100}%`, height: '100%', background: C.gris700, borderRadius: 2 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.gris600, marginTop: 4 }}>
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
            border: 'none', borderRadius: 4, cursor: 'pointer', textAlign: 'left', font: 'inherit', fontSize: 12,
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
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
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

// Grupos de la auditoría para aislar y pintar: verde con todos los datos, rojo con alguno vacío.
const AUD_COMPLETOS = 'Con todos los datos';
const AUD_INCOMPLETOS = 'Les falta algún dato';
const gruposAuditoria = (res) => [
  { key: AUD_COMPLETOS, value: res.completos.count, count: res.completos.count, externalIds: res.completos.externalIds, color: C.green },
  { key: AUD_INCOMPLETOS, value: res.incompletos.count, count: res.incompletos.count, externalIds: res.incompletos.externalIds, color: C.error },
];

// Auditoría: cuántos elementos tienen los parámetros pedidos y cuáles no.
// Clic en una cifra → aislar en el 3D esos elementos.
function AuditView({ res, onSegment, activeKey }) {
  const [completos, incompletos] = gruposAuditoria(res);
  const boton = (g, color) => (
    <button onClick={() => onSegment(g)} title={`${g.key} · clic: aislar en el 3D`}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 4, cursor: 'pointer', font: 'inherit', fontSize: 12,
        border: `1px solid ${activeKey === g.key ? C.blue : C.lightGray}`, background: activeKey === g.key ? C.blueTinte : C.blanco, color: C.dark,
      }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
      {g.key} <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(g.count)}</b>
    </button>
  );
  const parte = (n) => (res.total ? (n / res.total) * 100 : 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 28, fontWeight: 600, color: colorCompletitud(res.pct), fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{res.pct} %</span>
          <span style={{ fontSize: 12, color: C.gris600 }}>{fmt(res.completos.count)} de {fmt(res.total)} elementos con todos los datos</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 2, overflow: 'hidden', background: C.light50, marginTop: 8 }}>
          <div style={{ width: `${parte(res.completos.count)}%`, background: C.green }} />
          <div style={{ width: `${parte(res.incompletos.count)}%`, background: C.error }} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {boton(completos, C.green)}
          {boton(incompletos, C.error)}
        </div>
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.gris600, padding: '0 2px 4px', borderBottom: `1px solid ${C.light50}` }}>
          <span>Parámetro (lo que más falta, primero)</span><span>Con dato · Sin dato</span>
        </div>
        {res.porCampo.map(f => {
          const gCon = { key: `${f.key} · con dato`, count: f.con, externalIds: f.idsCon };
          const gSin = { key: `${f.key} · sin dato`, count: f.sin, externalIds: f.idsSin };
          return (
            <div key={f.key} style={{ padding: '6px 2px', borderBottom: `1px solid ${C.light50}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                <span title={nombreCampo(f.key)} style={{ color: C.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombreCampo(f.key)}</span>
                <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: colorCompletitud(f.pct) }}>{f.pct} %</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <div style={{ flex: 1, display: 'flex', height: 6, borderRadius: 2, overflow: 'hidden', background: C.light50 }}>
                  <div style={{ width: `${parte(f.con)}%`, background: C.green }} />
                  <div style={{ width: `${parte(f.sin)}%`, background: C.error }} />
                </div>
                <span style={{ flexShrink: 0, fontSize: 12, fontVariantNumeric: 'tabular-nums', display: 'flex', gap: 4 }}>
                  <button onClick={() => onSegment(gCon)} disabled={!f.con} title="Aislar en el 3D los que tienen el dato"
                    style={{ border: 'none', background: activeKey === gCon.key ? C.blueTinte : 'transparent', padding: '1px 4px', borderRadius: 3, cursor: f.con ? 'pointer' : 'default', font: 'inherit', color: C.green20D }}>{fmt(f.con)}</button>
                  <span style={{ color: C.gris300 }}>·</span>
                  <button onClick={() => onSegment(gSin)} disabled={!f.sin} title="Aislar en el 3D los que NO tienen el dato"
                    style={{ border: 'none', background: activeKey === gSin.key ? C.blueTinte : 'transparent', padding: '1px 4px', borderRadius: 3, cursor: f.sin ? 'pointer' : 'default', font: 'inherit', color: f.sin ? C.error : C.gris600, fontWeight: f.sin ? 600 : 400 }}>{fmt(f.sin)}</button>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
        style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.gris300}`, background: C.blanco, color: C.dark, fontSize: 13, outline: 'none', flexShrink: 0, fontFamily: FUENTE }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.gris600, padding: '0 2px', flexShrink: 0 }}>
        <span>Clic en un parámetro para graficarlo</span><span>Con dato</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {grupos.map(({ grupo, lista }) => (
          <div key={grupo}>
            <div style={{ position: 'sticky', top: 0, background: C.blanco, fontSize: 12, fontWeight: 600, color: C.gris600, padding: '6px 8px 3px', borderBottom: `1px solid ${C.light50}` }}>
              {grupo} <span style={{ fontWeight: 400 }}>· {lista.length}</span>
            </div>
            {lista.map(f => (
              <div key={f.key} onClick={() => onCreateFromField(f)}
                title={`${nombreCampo(f.key)} — ${f.fillPct} % de los elementos con dato · ${f.isNumeric ? 'número' : 'texto'} · ${f.distinct >= 60 ? '60 o más' : f.distinct} valores distintos · clic: crear gráfico`}
                style={{ padding: '5px 8px', borderRadius: 4, cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.background = C.light50; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                  <span style={{ color: C.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre}</span>
                  <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: colorCompletitud(f.fillPct) }}>{f.fillPct} %</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                  <div style={{ flex: 1, height: 3, background: C.light50, borderRadius: 2 }}>
                    <div style={{ width: `${f.fillPct}%`, height: '100%', borderRadius: 2, background: colorCompletitud(f.fillPct) }} />
                  </div>
                  <span style={{ fontSize: 12, color: C.gris600, flexShrink: 0 }}>{f.isNumeric ? 'número' : 'texto'} · {f.distinct >= 60 ? '60+' : f.distinct}</span>
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
// Título editable con doble clic (todas las tarjetas): Intro guarda, Escape deja el que había.
function TituloEditable({ titulo, onCambiar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(titulo);
  if (!editando) {
    return (
      <div onDoubleClick={(e) => { if (onCambiar) { e.stopPropagation(); setTexto(titulo); setEditando(true); } }}
        // Hasta dos líneas antes de cortar (como las tarjetas de ACC): con 14 px, en una tarjeta pequeña el título
        // entero cabe en dos líneas y no queda «…».
        style={{ fontSize: 14, fontWeight: 600, color: C.dark, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}
        title={onCambiar ? `${titulo} · doble clic: cambiar el título` : titulo}>{titulo}</div>
    );
  }
  const guardar = () => { setEditando(false); const t = texto.trim(); if (t && t !== titulo) onCambiar(t); };
  return (
    <input autoFocus value={texto} onChange={e => setTexto(e.target.value)} onBlur={guardar}
      onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setEditando(false); }}
      onPointerDown={e => e.stopPropagation()}
      style={{ width: '100%', boxSizing: 'border-box', fontSize: 14, fontWeight: 600, color: C.dark, fontFamily: FUENTE,
        border: `1px solid ${C.blue}`, borderRadius: 4, padding: '1px 4px', outline: 'none' }} />
  );
}

// `onEnviar(paquete)`: «Enviar a un tablero de Docs» (docs/visor/68) — la gráfica tal como se ve, ya calculada.
export default function ChartCard({ config, rows, fields = [], meta = null, itemizado = null, onEdit, onUpdate, onDelete, onIsolate, onPaint, onCreateFromField, activeKey, dragHandlers, zoom = 1, onEnviar = null }) {
  const [painted, setPainted] = useState(false);
  const isQa = config.type === 'qa';
  const isScatter = config.type === 'scatter';
  const isAudit = config.type === 'audit';
  const isPresupuesto = config.type === 'presupuesto';   // auditoría frente al itemizado del frente (docs/visor/50)
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
    () => ((isQa || isScatter || isAudit || isPresupuesto) ? { groups: [], total: 0, totalCount: rows?.length || 0 } : aggregate(rows, config)),
    [rows, config, isQa, isScatter, isAudit, isPresupuesto]
  );
  // Presupuesto: las filas del filtro de la tarjeta (sin filtro, las MISMAS filas: las tarjetas de la
  // plantilla comparten un solo cálculo) contra el itemizado vigente del frente.
  const items = itemizado?.vigente?.items || null;
  const filasPresupuesto = useMemo(() => {
    if (!isPresupuesto) return null;
    const f = config.filter;
    if (!f?.field || !f.values?.length) return rows;
    const permitidos = new Set(f.values.map(String));
    return (rows || []).filter(r => permitidos.has(String(r[f.field] ?? '')));
  }, [isPresupuesto, rows, config.filter]);
  const presupuesto = useMemo(
    () => (isPresupuesto && items ? auditarConMemoria(filasPresupuesto, items, itemizado.vigente.huella || String(itemizado.vigente.version)) : null),
    [isPresupuesto, filasPresupuesto, items, itemizado]
  );
  // El gráfico no se redibuja por cada render de la tarjeta: su «aislar» lee lo último por referencia.
  const ultimo = useRef({});
  ultimo.current = { onIsolate, config };
  const aislarIds = useCallback((ids, que) => ultimo.current.onIsolate({ key: que, count: ids.length, externalIds: ids }, ultimo.current.config), []);
  const audit = useMemo(() => (isAudit ? auditar(rows, config) : null), [rows, config, isAudit]);
  const points = useMemo(
    () => (isScatter ? scatterPoints(rows, config) : null),
    [rows, config, isScatter]
  );

  const metricLabel = METRIC_LABEL[config.metric || 'count'] + (config.metric !== 'count' && config.valueField ? ` · ${nombreCampo(config.valueField)}` : '');

  const handleSegment = (g) => onIsolate(g, config);
  const handlePaint = async () => {
    const ok = await onPaint(isAudit ? gruposAuditoria(audit) : isPresupuesto ? (presupuesto ? gruposDeClases(presupuesto) : []) : agg.groups, config);
    setPainted(!!ok);
    setTimeout(() => setPainted(false), 1800);
  };
  const exportCsv = () => {
    let csv;
    if (isQa) csv = '﻿' + ['Parámetro;Completitud %;Tipo', ...fields.map(f => `${f.key};${f.fillPct};${f.isNumeric ? 'numérico' : 'texto'}`)].join('\r\n');
    else if (isAudit) csv = '﻿' + [
      `Elementos;${audit.total}`, `${AUD_COMPLETOS};${audit.completos.count}`, `${AUD_INCOMPLETOS};${audit.incompletos.count}`, '',
      'Parámetro;Con dato;Sin dato;% con dato', ...audit.porCampo.map(f => `${f.key};${f.con};${f.sin};${f.pct}`),
    ].join('\r\n');
    else if (isPresupuesto && presupuesto) csv = '\uFEFF' + [
      `Elementos;${presupuesto.total}`, `Con partida;${presupuesto.conPartida}`, '', 'Resultado;Elementos',
      ...CLASES.map(c => `${c.nombre};${presupuesto.clases[c.id].length}`), '', 'Prueba;Resultado;Partidas asignadas',
      ...Object.entries(presupuesto.pruebas).flatMap(([pr, o]) => Object.entries(o).map(([e, n]) => `${pr};${e};${n}`)),
      '', 'Código;Elementos con problema;Tipo;Descripción del itemizado',
      ...presupuesto.pareto.map(x => `${x.codigo};${x.n};${x.tipos};${String(x.nombre).replace(/;/g, ',')}`),
    ].join('\r\n');
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
  const titulo = nombreCampo(config.title || config.groupBy) || (isQa ? 'Parámetros del modelo' : isAudit ? 'Auditoría de datos'
    : isPresupuesto ? (ANALISIS[config.analisis]?.titulo || 'Auditoría del presupuesto') : 'Gráfico');
  const deQuien = itemizado?.heredado ? 'de la obra' : (itemizado?.porFrente && itemizado?.frente) ? `del frente ${itemizado.frente}` : 'de la obra';
  const subtitle = isPresupuesto
    ? (ANALISIS[config.analisis]?.pregunta || '')
    : isQa
    ? `${fields.length} parámetros · % de elementos con dato`
    : isAudit
      ? `${(config.auditFields || []).length} parámetros revisados${config.filter?.values?.length ? ` · ${config.filter.values.map(nombreValor).join(', ')}` : ' · todos los elementos'}`
    : isScatter
      ? `${nombreCampo(config.yField) || '?'} frente a ${nombreCampo(config.xField) || '?'}`
      : `${config.groupBy ? `por ${nombreCampo(config.groupBy)}` : 'total'} · ${metricLabel}`;

  // Pie: de dónde sale el dato y sobre cuántos elementos (Bach: metainformación).
  const pie = isPresupuesto
    ? [items ? `Itemizado ${deQuien} «${itemizado.vigente.archivo}» v${itemizado.vigente.version}` : 'Sin itemizado',
      `${fmt(presupuesto?.total ?? filasPresupuesto?.length ?? 0)} elementos`,
      config.filter?.values?.length ? `filtro: ${nombreCampo(config.filter.field)}` : null, meta?.hora || null].filter(Boolean).join(' · ')
    : isQa
    ? `${meta?.fuente || 'Inventario'} · ${fmt(rows?.length || 0)} elementos${meta?.hora ? ` · ${meta.hora}` : ''}`
    : [
      meta?.fuente || 'Inventario',
      isScatter ? `${fmt(points?.total || 0)} elementos${points?.sampled ? ' (muestreo)' : ''}` : isAudit ? `${fmt(audit.total)} elementos` : `${fmt(agg.totalCount)} elementos`,
      config.filter?.values?.length ? `filtro: ${nombreCampo(config.filter.field)}` : null,
      meta?.hora || null,
    ].filter(Boolean).join(' · ');

  const vacio = (texto) => <div style={{ padding: 18, color: C.gris600, fontSize: 13 }}>{texto}</div>;
  const body = isPresupuesto
    ? (!items ? vacio('Carga el itemizado del frente en la Planilla (ítem, descripción y unidad): la auditoría se hace contra él.')
      : !presupuesto?.total ? vacio('Ningún elemento cumple el filtro.')
        : <GraficoAuditoria analisis={config.analisis} res={presupuesto} onIds={aislarIds} />)
    : isQa
    ? <ParamsSource fields={fields} onCreateFromField={onCreateFromField} />
    : isAudit
      ? (!(config.auditFields || []).length ? vacio('Elige en «Editar» qué parámetros revisar.')
        : !audit.total ? vacio('Ningún elemento cumple el filtro.')
          : <AuditView res={audit} onSegment={handleSegment} activeKey={activeKey} />)
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

  // Doble clic en la gráfica = editarla (como en Miro o Excel); en el título, cambiar el título. El clic
  // simple sigue aislando en el 3D. Los botones, campos y la lista de parámetros no lo disparan.
  const editarConDobleClic = (e) => {
    if (isQa || !onEdit || e.target.closest?.('button, input, select, textarea, a')) return;
    onEdit(config);
  };

  return (
    <div onDoubleClick={editarConDobleClic} style={{
      width: '100%', height: '100%', boxSizing: 'border-box',
      background: C.blanco, border: `1px solid ${C.lightGray}`, borderRadius: RADIO,
      padding: '12px 14px 0', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0,
      fontFamily: FUENTE, color: C.dark,
    }}>
      {/* Cabecera = asa de arrastre del nodo en el lienzo */}
      <div {...dragHandlers}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'grab', flexShrink: 0, userSelect: 'none', touchAction: 'none' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <TituloEditable titulo={titulo} onCambiar={onUpdate ? (t) => onUpdate({ ...config, title: t }) : null} />
          {/* La PREGUNTA que responde el gráfico (patrón editorial); si no hay, de qué es */}
          <div style={{ fontSize: 12, color: C.gris600, marginTop: 2, lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: config.question ? 'normal' : 'nowrap' }}>
            {config.question || subtitle}
          </div>
        </div>
        <div data-sin-exportar="" style={{ display: 'flex', gap: 2, flexShrink: 0 }} onPointerDown={e => e.stopPropagation()}>
          {!isQa && !isScatter && config.type !== 'kpi' && (
            <IconBtn title={painted ? 'Pintado en el 3D' : 'Pintar grupos en el 3D (y en Revit si está vinculado)'} onClick={handlePaint}>
              {painted
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l7 7-9 9H4v-6l8-8z" /><path d="M15 5l4 4" /></svg>}
            </IconBtn>
          )}
          {onEnviar && ['bar', 'donut', 'line', 'area', 'kpi'].includes(config.type) && (
            <IconBtn title="Enviar a un tablero de Docs" onClick={() => {
              const colores = coloresDe(config, agg.groups, null);
              onEnviar({
                titulo, subtitulo: subtitle, tipo: config.type, metrica: config.metric || 'count',
                campo: nombreCampo(config.groupBy), valorCampo: nombreCampo(config.valueField),
                grupos: agg.groups.map((g, i) => ({ k: g.isOthers ? 'Otros' : nombreValor(g.key), v: g.value, n: g.count, c: colores[i] })),
                total: agg.total, elementos: agg.totalCount,
                filtro: config.filter?.values?.length ? { campo: nombreCampo(config.filter.field), valores: config.filter.values.map(nombreValor) } : null,
                grafica: config.id,
              });
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 8v7M8.5 11.5 12 8l3.5 3.5" /></svg>
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
          <span style={{ fontSize: 12, color: C.gris600, flexShrink: 0 }}>{nombreCampo(config.filter.field)}:</span>
          {filterOpts.map(o => {
            const on = config.filter?.values?.includes(o.value);
            return (
              <button key={o.value} onClick={() => toggleFilterValue(o.value)}
                title={`${nombreValor(o.value)} · ${fmt(o.count)} elem.`}
                style={{
                  flexShrink: 0, padding: '2px 8px', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontFamily: FUENTE,
                  border: `1px solid ${on ? C.blue : C.gris300}`,
                  background: on ? C.blueTinte : C.blanco, color: on ? C.blue30D : C.texto2,
                  maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{nombreValor(o.value)}</button>
            );
          })}
        </div>
      )}

      {/* Cuerpo: los gráficos canvas llenan sin scroll; tabla/QA sí se desplazan */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: (isCjs || isPresupuesto) ? 'hidden' : 'auto', overflowX: (isCjs || isPresupuesto) ? 'hidden' : 'auto' }} onPointerDown={e => e.stopPropagation()}>
        {body}
      </div>

      {/* Pie: de dónde sale el dato */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${C.light50}`, padding: '6px 0 8px', fontSize: 12, color: C.gris600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pie}>
        {pie}
      </div>
    </div>
  );
}
