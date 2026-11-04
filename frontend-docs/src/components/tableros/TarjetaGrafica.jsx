// TarjetaGrafica — una gráfica de View en el tablero de Docs (docs/visor/68). View la calcula con su modelo y la deja
// aquí como una FOTO CON FECHA: barras, dona, línea o área, o un número, con los colores que tenía en View. Se
// actualiza volviéndola a enviar desde View (la misma tarjeta, en su sitio). «Abrir en View» lleva al Tablero del frente,
// donde está el modelo y se puede aislar en el 3D.
import React from 'react';
import { VISOR_URL } from '../../utils/helpers';
import { formato, fechaDeDatos, enlaceAView } from './graficas';

const TINTA = '#141413', GRIS = '#72706B', BORDE = '#E5E3DA', SUAVE = '#f1f0e8';
const PALETA = ['#d97757', '#6a9bcc', '#788c5d', '#9e5943', '#507294', '#b0aea5', '#c99a2e', '#8e5bc9'];
const NOMBRE_METRICA = { count: 'Cantidad', sum: 'Suma', avg: 'Promedio' };

const color = (g, i) => g.c || PALETA[i % PALETA.length];

function Barras({ g, metrica }) {
  const max = Math.max(...g.grupos.map(x => Math.abs(x.v)), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
      {g.grupos.map((x, i) => (
        <div key={x.k + i} style={{ display: 'grid', gridTemplateColumns: 'minmax(70px, 36%) 1fr auto', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span title={x.k} style={{ color: TINTA, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.k}</span>
          <span style={{ height: 12, background: SUAVE, borderRadius: 2, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${(Math.abs(x.v) / max) * 100}%`, background: color(x, i), borderRadius: 2 }} />
          </span>
          <span style={{ color: GRIS, fontVariantNumeric: 'tabular-nums' }}>{formato(x.v, metrica)}</span>
        </div>
      ))}
    </div>
  );
}

function Dona({ g, metrica }) {
  const total = g.grupos.reduce((a, x) => a + Math.max(0, x.v), 0) || 1;
  const R = 46, r = 28;
  const inicios = [];
  for (let i = 0, a = -Math.PI / 2; i < g.grupos.length; i++) { inicios.push(a); a += (Math.max(0, g.grupos[i].v) / total) * Math.PI * 2; }
  const arcos = g.grupos.map((x, i) => {
    const a0 = inicios[i], a1 = a0 + (Math.max(0, x.v) / total) * Math.PI * 2;
    const grande = a1 - a0 > Math.PI ? 1 : 0;
    const p = (ang, rad) => `${(60 + rad * Math.cos(ang)).toFixed(2)} ${(60 + rad * Math.sin(ang)).toFixed(2)}`;
    const d = a1 - a0 >= Math.PI * 2 - 1e-6
      ? `M60 ${60 - R} A${R} ${R} 0 1 1 59.99 ${60 - R} L59.99 ${60 - r} A${r} ${r} 0 1 0 60 ${60 - r} Z`
      : `M${p(a0, R)} A${R} ${R} 0 ${grande} 1 ${p(a1, R)} L${p(a1, r)} A${r} ${r} 0 ${grande} 0 ${p(a0, r)} Z`;
    return <path key={x.k + i} d={d} fill={color(x, i)} />;
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 0 }}>
      <svg viewBox="0 0 120 120" style={{ width: 120, height: 120, flexShrink: 0 }} aria-hidden="true">{arcos}
        <text x="60" y="64" textAnchor="middle" style={{ fontSize: 14, fontWeight: 600, fill: TINTA }}>{formato(g.total, metrica)}</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, fontSize: 12 }}>
        {g.grupos.map((x, i) => (
          <span key={x.k + i} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color(x, i), flexShrink: 0 }} />
            <span title={x.k} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: TINTA }}>{x.k}</span>
            <span style={{ color: GRIS, marginLeft: 'auto', paddingLeft: 6 }}>{Math.round((Math.max(0, x.v) / total) * 100)} %</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Linea({ g, metrica, area }) {
  const n = g.grupos.length, max = Math.max(...g.grupos.map(x => x.v), 1), min = Math.min(0, ...g.grupos.map(x => x.v));
  const W = 300, H = 120, px = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * W), py = (v) => H - ((v - min) / (max - min || 1)) * H;
  const puntos = g.grupos.map((x, i) => `${px(i).toFixed(1)},${py(x.v).toFixed(1)}`).join(' ');
  const c = color(g.grupos[0] || {}, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
      <svg viewBox={`-6 -6 ${W + 12} ${H + 12}`} preserveAspectRatio="none" style={{ width: '100%', height: 130 }} aria-hidden="true">
        {area && <polygon points={`0,${H} ${puntos} ${W},${H}`} fill={c} opacity="0.18" />}
        <polyline points={puntos} fill="none" stroke={c} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: GRIS }}>
        <span>{g.grupos[0]?.k}</span><span>máx. {formato(max, metrica)}</span><span>{g.grupos[n - 1]?.k}</span>
      </div>
    </div>
  );
}

export default function TarjetaGrafica({ elemento: g }) {
  const enlace = enlaceAView(VISOR_URL, g.origen);
  const metrica = g.metrica || 'count';
  const subtitulo = g.subtitulo || [g.origen?.frenteNombre, NOMBRE_METRICA[metrica], g.campo].filter(Boolean).join(' · ');
  return (
    <div data-grafica={g.id} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', padding: '12px 14px 10px',
      background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.06)', fontFamily: 'var(--a-font-sans)', color: TINTA, overflow: 'hidden' }}>
      <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.nombre || 'Gráfica'}</div>
      <div style={{ fontSize: 12, color: GRIS, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitulo}</div>
      {g.filtro && <div style={{ fontSize: 11, color: GRIS, marginTop: 2 }}>Filtro: {g.filtro.campo} = {g.filtro.valores.join(', ')}</div>}
      <div style={{ flex: 1, minHeight: 0, marginTop: 10, overflow: 'hidden' }}>
        {g.grafica === 'kpi' ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 600, lineHeight: 1.1 }}>{formato(g.total, metrica)}{g.unidad ? <span style={{ fontSize: 16, color: GRIS }}> {g.unidad}</span> : null}</div>
            {g.elementos != null && <div style={{ fontSize: 12, color: GRIS, marginTop: 4 }}>{formato(g.elementos, 'count')} elementos</div>}
          </div>
        ) : !g.grupos?.length ? (
          <div style={{ fontSize: 13, color: GRIS }}>Sin datos.</div>
        ) : g.grafica === 'donut' ? <Dona g={g} metrica={metrica} />
          : g.grafica === 'line' || g.grafica === 'area' ? <Linea g={g} metrica={metrica} area={g.grafica === 'area'} />
            : <Barras g={g} metrica={metrica} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BORDE}`, fontSize: 11, color: GRIS }}>
        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          title="Foto de View">
          Datos del {fechaDeDatos(g.fecha)}{g.enviadaPor ? ` · ${g.enviadaPor}` : ''} · de View
        </span>
        {enlace && (
          <a href={enlace} target="_blank" rel="noopener noreferrer" onPointerDown={e => e.stopPropagation()}
            style={{ color: '#0D66B4', textDecoration: 'none', whiteSpace: 'nowrap' }}>Abrir en View ↗</a>
        )}
      </div>
    </div>
  );
}
