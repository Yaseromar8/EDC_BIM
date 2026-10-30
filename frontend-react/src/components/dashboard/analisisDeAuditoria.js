// analisisDeAuditoria.js — el registro de los análisis de la auditoría frente al itemizado
// (docs/visor/50): qué responde cada uno, su tamaño y cómo lo dibuja su motor. Lo usan la
// tarjeta (GraficoAuditoria.jsx), el editor y la plantilla del Tablero.
import { C, FUENTE } from './tema';
import { fmt } from './engine';
import { CLASES, PRUEBAS_COLOR, META, pasosEmbudo, pctConPartida, colorPct } from './auditoriaPresupuesto';

const corta = (s, n = 34) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
const PALETA_ARBOL = [C.blue30D, C.green20D, C.orange30D, C.gris700, C.blue, C.green, C.orange];
const pctDe = (o, e) => { const t = Object.values(o).reduce((s, v) => s + v, 0); return Math.round(((o[e] || 0) / (t || 1)) * 1000) / 10; };

// ── El registro: lo que cada análisis responde y cómo se dibuja ─────────────────────────────
export const ANALISIS = {
  indicador: {
    titulo: '% de elementos con partida', pregunta: `¿Cuántos elementos tienen partida del itemizado? Referencia ${META} %`, size: 's',
    echarts: (res) => ({
      option: {
        series: [{
          type: 'gauge', min: 0, max: 100, startAngle: 200, endAngle: -20, radius: '95%', center: ['50%', '62%'],
          progress: { show: true, width: 16, itemStyle: { color: colorPct(pctConPartida(res)) } },
          axisLine: { lineStyle: { width: 16, color: [[1, C.light50]] } },
          axisTick: { show: false }, splitLine: { length: 7, lineStyle: { color: C.gris300 } }, axisLabel: { distance: 20, fontSize: 10, color: C.gris600 },
          pointer: { show: false }, anchor: { show: false },
          title: { offsetCenter: [0, '30%'], fontSize: 11, color: C.gris600 },
          detail: { offsetCenter: [0, '-5%'], fontSize: 28, fontWeight: 600, formatter: '{value} %', color: C.dark },
          data: [{ value: pctConPartida(res), name: `${fmt(res.conPartida)} de ${fmt(res.total)}` }],
        }],
      },
    }),
  },
  resumen: {
    titulo: 'Elementos según su partida', pregunta: '¿Cuántos elementos tienen ítem, descripción y unidad del itemizado?', size: 's',
    echarts: (res, onIds) => ({
      option: {
        tooltip: { formatter: (p) => `${p.name}<br/><b>${fmt(p.value)}</b> elementos (${p.percent} %)` },
        series: [{ type: 'pie', radius: ['50%', '76%'], center: ['50%', '50%'], itemStyle: { borderColor: C.blanco, borderWidth: 2 },
          label: { show: false },
          data: CLASES.map(c => ({ name: c.nombre, value: res.clases[c.id].length, itemStyle: { color: c.color } })).filter(d => d.value) }],
        graphic: [{ type: 'text', left: 'center', top: 'middle', style: { text: `${Math.round(pctConPartida(res))} %\ncon partida`, align: 'center',
          fontSize: 14, fontWeight: 600, fill: C.dark, fontFamily: FUENTE } }],
      },
      click: (p) => { const c = CLASES.find(k => k.nombre === p.name); if (c) onIds(res.clases[c.id], c.nombre); },
    }),
  },
  embudo: {
    titulo: 'Embudo de calidad', pregunta: '¿Cuántos se quedan en cada paso? Cada paso exige el anterior', size: 's',
    echarts: (res, onIds) => {
      const pe = pasosEmbudo(res);
      return {
        option: {
          tooltip: { formatter: (p) => `${p.name}<br/><b>${fmt(p.value)}</b> (${Math.round((p.value / (res.total || 1)) * 100)} % del total)` },
          series: [{ type: 'funnel', sort: 'none', left: 6, right: 6, top: 4, bottom: 4, gap: 3, minSize: '24%',
            label: { position: 'inside', formatter: (p) => `${fmt(p.value)} · ${Math.round((p.value / (res.total || 1)) * 100)} %`, fontSize: 10.5, color: C.blanco },
            data: pe.map((x, i) => ({ name: x.paso, value: x.n, itemStyle: { color: [C.gris700, C.blue30D, C.blue, C.green20D, C.green][i] } })) }],
        },
        click: (p) => { const x = pe.find(k => k.paso === p.name); if (x?.ids) onIds(x.ids, x.paso); },
      };
    },
  },
  categorias: {
    titulo: 'Resultado por categoría de Revit', pregunta: '¿Qué categorías tienen más elementos sin partida o con datos distintos?', size: 'm',
    echarts: (res, onIds) => ({
      option: {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { bottom: 0, textStyle: { fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
        grid: { left: 130, right: 16, top: 6, bottom: 56 },
        xAxis: { type: 'value' }, yAxis: { type: 'category', inverse: true, data: res.cats.map(c => c.cat) },
        series: CLASES.map(c => ({ name: c.nombre, type: 'bar', stack: 't', itemStyle: { color: c.color }, data: res.cats.map(x => x.cl[c.id].length) })),
      },
      click: (p) => { const c = CLASES.find(k => k.nombre === p.seriesName); onIds(res.cats[p.dataIndex].cl[c.id], `${p.name} · ${p.seriesName}`); },
    }),
  },
  pruebas: {
    titulo: 'Las tres pruebas', pregunta: '¿El ítem existe, la descripción y la unidad son las del itemizado?', size: 's',
    echarts: (res) => {
      const nombres = Object.keys(res.pruebas);
      return {
        option: {
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => `${v} %` },
          legend: { bottom: 0, textStyle: { fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
          grid: { left: 84, right: 12, top: 6, bottom: 40 },
          xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value} %' } }, yAxis: { type: 'category', inverse: true, data: nombres },
          series: Object.keys(PRUEBAS_COLOR).map(e => ({ name: e, type: 'bar', stack: 'p', itemStyle: { color: PRUEBAS_COLOR[e] },
            data: nombres.map(k => pctDe(res.pruebas[k], e)) })),
        },
      };
    },
  },
  pareto: {
    titulo: 'Pareto de errores', pregunta: '¿Qué códigos concentran los errores? Empezar a corregir por la izquierda', size: 'm',
    echarts: (res) => ({
      option: {
        tooltip: { trigger: 'axis', formatter: (ps) => { const d = res.pareto[ps[0].dataIndex]; return d ? `${d.codigo} ${corta(d.nombre, 50)}<br/>${fmt(d.n)} elementos · ${d.tipos}<br/>acumulado ${d.acum} %` : ''; } },
        grid: { left: 40, right: 40, top: 16, bottom: 70 },
        xAxis: { type: 'category', data: res.pareto.map(p => p.codigo), axisLabel: { rotate: 45, fontSize: 9.5 } },
        yAxis: [{ type: 'value', name: 'elementos', nameTextStyle: { fontSize: 10 } }, { type: 'value', max: 100, axisLabel: { formatter: '{value} %' }, splitLine: { show: false } }],
        series: [
          { type: 'bar', data: res.pareto.map(p => p.n), itemStyle: { color: C.error }, barMaxWidth: 22 },
          { type: 'line', yAxisIndex: 1, data: res.pareto.map(p => p.acum), symbolSize: 5, lineStyle: { color: C.dark }, itemStyle: { color: C.dark },
            markLine: { silent: true, symbol: 'none', data: [{ yAxis: 80 }], lineStyle: { color: C.orange30D, type: 'dashed' }, label: { formatter: '80 %' } } },
        ],
      },
    }),
  },
  cobertura: {
    titulo: 'Cobertura del itemizado por capítulo', pregunta: '¿Qué capítulos tienen elementos en el modelo? (las partidas que no se modelan no son un error)', size: 'l',
    echarts: (res) => ({
      option: {
        tooltip: { formatter: (p) => `${p.data.full}<br/>${p.data.con} de ${p.value} partidas con elementos (${p.data.pct} %)` },
        series: [{ type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false }, width: '100%', height: '100%',
          label: { formatter: (p) => `${corta(p.data.full, 26)}\n${p.data.pct} %`, fontSize: 10.5 },
          data: res.capitulos.map(k => ({ name: k.cap, full: `${k.cap} ${k.nombre}`, value: k.partidas, con: k.conElementos, pct: k.pct,
            itemStyle: { color: k.pct >= 60 ? C.green : k.pct >= 25 ? C.orange : C.error, borderColor: C.blanco, borderWidth: 2 } })) }],
      },
    }),
  },
  peso: {
    titulo: 'Dónde está el modelo dentro del itemizado', pregunta: 'Capítulo → subcapítulo → partida, por elementos asignados', size: 's', alto: true,
    echarts: (res) => ({
      option: {
        color: PALETA_ARBOL,
        tooltip: { formatter: (p) => `${p.data.full || p.name}<br/><b>${fmt(p.value)}</b> elementos asignados` },
        series: [{ type: 'sunburst', data: res.arbol, radius: ['10%', '95%'], sort: 'desc', itemStyle: { borderColor: C.blanco, borderWidth: 1 },
          levels: [{}, { label: { fontSize: 10, rotate: 'tangential' } }, { label: { fontSize: 9 } }, { label: { show: false } }] }],
      },
    }),
  },
  flujo: {
    titulo: 'De qué categoría a qué resultado', pregunta: '¿Dónde se pierden los elementos de cada categoría?', size: 'l', alto: true,
    echarts: (res) => {
      const nodos = [...res.cats.map(c => ({ name: c.cat, itemStyle: { color: C.gris700 } })), ...CLASES.map(c => ({ name: c.nombre, itemStyle: { color: c.color } }))];
      const enlaces = res.cats.flatMap(c => CLASES.map(k => ({ source: c.cat, target: k.nombre, value: c.cl[k.id].length })).filter(l => l.value));
      return { option: { tooltip: { trigger: 'item' },
        series: [{ type: 'sankey', left: 8, right: 220, nodeGap: 8, data: nodos, links: enlaces, lineStyle: { color: 'gradient', opacity: 0.35 }, label: { fontSize: 10.5 } }] } };
    },
  },
  recorrido: {
    titulo: 'Recorrido de cada elemento', pregunta: 'Categoría → ítem → descripción → unidad, por su mejor partida', size: 'l', alto: true, motor: 'plotly',
    plotly: (P, el, res) => P.newPlot(el, [{
      type: 'parcats', counts: res.paralelas.map(x => x.n), arrangement: 'freeform',
      dimensions: ['Categoría', 'Ítem', 'Descripción', 'Unidad'].map((label, i) => ({ label, values: res.paralelas.map(x => x.pasos[i]) })),
      line: { color: res.paralelas.map(x => (x.pasos[3] === 'Unidad igual' && x.pasos[2] === 'Descripción igual' ? 1 : 0)), colorscale: [[0, C.orange], [1, C.green]], shape: 'hspline' },
      labelfont: { size: 11, family: FUENTE }, tickfont: { size: 10, family: FUENTE },
    }], { margin: { l: 110, r: 120, t: 24, b: 10 }, font: { family: FUENTE, size: 10.5, color: C.dark }, paper_bgcolor: C.blanco, plot_bgcolor: C.blanco },
    { displaylogo: false, displayModeBar: false, responsive: true }),
  },
};
// Orden de la plantilla «Auditoría del presupuesto» (y del selector del editor).
export const ORDEN_ANALISIS = ['indicador', 'resumen', 'embudo', 'categorias', 'pruebas', 'pareto', 'peso', 'cobertura', 'flujo', 'recorrido'];

