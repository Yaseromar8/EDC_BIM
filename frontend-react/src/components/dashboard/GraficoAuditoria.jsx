// GraficoAuditoria — un análisis de la auditoría frente al itemizado, dibujado dentro de una
// tarjeta del Tablero (docs/visor/50). ECharts dibuja nueve; Plotly, las categorías paralelas.
// Clic en una parte: aísla esos elementos en el 3D (como el resto de tarjetas).
import React, { useEffect, useRef, useState } from 'react';
import { cargarECharts, cargarPlotly } from './motores';
import { C, FUENTE } from './tema';
import { ANALISIS } from './analisisDeAuditoria';

export default function GraficoAuditoria({ analisis, res, onIds }) {
  const ref = useRef(null);
  const [error, setError] = useState('');
  const def = ANALISIS[analisis];
  useEffect(() => {
    const el = ref.current;
    if (!el || !def || !res) return undefined;
    let vivo = true, chart = null, ro = null, P = null;
    setError('');
    if (def.motor === 'plotly') {
      cargarPlotly().then((Pl) => {
        if (!vivo) return;
        P = Pl;
        def.plotly(P, el, res, onIds);
        ro = new ResizeObserver(() => { try { P.Plots.resize(el); } catch { /* */ } });
        ro.observe(el);
      }).catch(e => setError(String(e?.message || e)));
    } else {
      cargarECharts().then((echarts) => {
        if (!vivo) return;
        chart = echarts.init(el);
        const { option, click } = def.echarts(res, onIds);
        chart.setOption({ textStyle: { fontFamily: FUENTE, color: C.dark }, animationDuration: 400, ...option });
        if (click) chart.on('click', click);
        ro = new ResizeObserver(() => chart?.resize());
        ro.observe(el);
      }).catch(e => setError(String(e?.message || e)));
    }
    return () => {
      vivo = false;
      ro?.disconnect();
      try { chart?.dispose(); } catch { /* */ }
      try { P?.purge(el); } catch { /* */ }
    };
  }, [def, res, onIds]);
  if (!def) return <div style={{ padding: 12, fontSize: 12, color: C.gris600 }}>Análisis desconocido.</div>;
  if (error) return <div style={{ padding: 12, fontSize: 12, color: C.error }}>No se pudo dibujar: {error}</div>;
  return <div ref={ref} style={{ width: '100%', height: '100%', minHeight: 160 }} />;
}
