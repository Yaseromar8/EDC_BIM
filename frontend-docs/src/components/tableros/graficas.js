// Gráficas de View en el tablero de Docs (docs/visor/68): formato, fecha, el enlace de vuelta a View y la limpieza al
// pegar. Puro, para probarlo sin navegador (pruebas/graficasTablero.prueba.mjs).

export const TIPOS_DE_GRAFICA = ['bar', 'donut', 'kpi', 'line', 'area'];
const txt = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const formato = (v, metrica) => Number(v || 0).toLocaleString('es-PE', { maximumFractionDigits: metrica === 'count' ? 0 : 2 });

export function fechaDeDatos(iso) {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`;
}

// El enlace al Tablero del frente en View: obra, frente y tablero, como el que da View al compartir una vista
// (docs/visor/52). Sin visor contratado (`visorUrl` vacío) no hay enlace.
export function enlaceAView(visorUrl, o) {
  if (!visorUrl || !o?.obra || !o?.frenteId) return null;
  const u = new URL(visorUrl);
  u.searchParams.set('project', o.obra);
  u.searchParams.set('frente', o.frenteId);
  if (o.frenteNombre) u.searchParams.set('fn', o.frenteNombre);
  if (o.tablero) u.searchParams.set('tablero', o.tablero);
  return u.toString();
}

// Al pegar: solo pasa lo que una gráfica trae, con tamaños acotados (como lo valida el servidor al recibirla de View).
export function limpiarGrafica(n) {
  if (!TIPOS_DE_GRAFICA.includes(n?.grafica) || !Array.isArray(n.grupos) || !n.origen?.frente || !n.origen?.grafica) return null;
  const grupos = n.grupos.slice(0, 60).map((g) => {
    const v = num(g?.v);
    if (v === null) return null;
    return { k: txt(g?.k, 200) || '(sin valor)', v, ...(typeof g?.c === 'string' && /^#[0-9a-f]{6}$/i.test(g.c) ? { c: g.c } : {}) };
  }).filter(Boolean);
  return {
    grafica: n.grafica,
    metrica: ['count', 'sum', 'avg'].includes(n.metrica) ? n.metrica : 'count',
    nombre: txt(n.nombre, 200) || 'Gráfica', subtitulo: txt(n.subtitulo, 300), campo: txt(n.campo, 200),
    grupos, total: num(n.total) ?? grupos.reduce((a, g) => a + g.v, 0),
    ...(num(n.elementos) !== null ? { elementos: num(n.elementos) } : {}),
    unidad: txt(n.unidad, 40), fecha: txt(n.fecha, 40), enviadaPor: txt(n.enviadaPor, 120),
    origen: Object.fromEntries(['frente', 'obra', 'frenteId', 'frenteNombre', 'tablero', 'grafica']
      .map(k => [k, txt(n.origen[k], 120)]).filter(([, v]) => v)),
  };
}
