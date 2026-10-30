// motores.js — los motores de gráfico del Tablero, INSTALADOS en el visor (docs/visor/49 y 50).
// Apache ECharts es el principal; Plotly dibuja solo lo que ECharts no tiene (categorías
// paralelas). Ninguno se baja de un CDN: lo publicado es lo mismo que se probó.
// Se cargan con el primer gráfico que los necesita: quien no abre el Tablero no los baja,
// y quien no usa un análisis de Plotly no baja Plotly.
let echarts = null;
let plotly = null;

export function cargarECharts() {
  if (!echarts) {
    echarts = Promise.all([
      import('echarts/core'), import('echarts/charts'), import('echarts/components'), import('echarts/renderers'),
    ]).then(([core, charts, comps, render]) => {
      core.use([
        charts.BarChart, charts.LineChart, charts.PieChart, charts.TreemapChart, charts.SunburstChart,
        charts.SankeyChart, charts.FunnelChart, charts.GaugeChart,
        comps.GridComponent, comps.TooltipComponent, comps.LegendComponent, comps.MarkLineComponent,
        comps.GraphicComponent, render.CanvasRenderer,
      ]);
      return core;
    });
  }
  return echarts;
}

export function cargarPlotly() {
  if (!plotly) plotly = import('plotly.js-dist-min').then(m => m.default || m);
  return plotly;
}
