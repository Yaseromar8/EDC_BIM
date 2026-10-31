// Imanes del lienzo (docs/visor/55): al arrastrar, lo que se mueve se alinea con los demás elementos
// visibles —esquinas y centros— y con los huecos entre ellos (misma distancia o centrado), con un umbral
// de 8 px de PANTALLA a cualquier zoom, y devuelve las líneas guía para dibujarlas.
//
// Adaptado de Excalidraw, packages/excalidraw/snapping.ts (getVisibleGaps, getGapSnaps, getPointSnaps,
// snapDraggedElements, createPointSnapLines, createGapSnapLines), simplificado a rectángulos sin giro.
// Excalidraw: MIT License, Copyright (c) 2020 Excalidraw — https://github.com/excalidraw/excalidraw
//
// Una caja es [minX, minY, maxX, maxY] en coordenadas del mundo.

export const DISTANCIA_IMAN = 8;   // px de pantalla (SNAP_DISTANCE de Excalidraw; snapThreshold de tldraw)

const redondear = (x) => Math.round(x * 1e6) / 1e6;
const solapan = (a0, a1, b0, b1) => a0 <= b1 && b0 <= a1;
const interseccion = (a0, a1, b0, b1) => { const lo = Math.max(a0, b0), hi = Math.min(a1, b1); return lo <= hi ? [lo, hi] : null; };

// Esquinas y centro de una caja (los puntos que se alinean).
const puntosDe = ([x1, y1, x2, y2]) => [[x1, y1], [x2, y1], [x1, y2], [x2, y2], [(x1 + x2) / 2, (y1 + y2) / 2]];

// Se calcula UNA vez al empezar a arrastrar (SnapCache de Excalidraw): puntos y huecos de las referencias.
export function prepararImanes(cajas) {
  const puntos = cajas.flatMap(puntosDe);
  const huecosH = [], huecosV = [];
  const porX = [...cajas].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < porX.length; i++) {
    for (let j = i + 1; j < porX.length; j++) {
      const a = porX[i], b = porX[j];
      if (a[2] < b[0] && solapan(a[1], a[3], b[1], b[3])) {
        huecosH.push({ ini: a, fin: b, desde: a[2], hasta: b[0], largo: b[0] - a[2], solape: interseccion(a[1], a[3], b[1], b[3]) });
      }
    }
  }
  const porY = [...cajas].sort((a, b) => a[1] - b[1]);
  for (let i = 0; i < porY.length; i++) {
    for (let j = i + 1; j < porY.length; j++) {
      const a = porY[i], b = porY[j];
      if (a[3] < b[1] && solapan(a[0], a[2], b[0], b[2])) {
        huecosV.push({ ini: a, fin: b, desde: a[3], hasta: b[1], largo: b[1] - a[3], solape: interseccion(a[0], a[2], b[0], b[2]) });
      }
    }
  }
  return { puntos, huecosH, huecosV };
}

// Busca el imán más cercano en cada eje para la caja `c` (ya desplazada).
function buscar(cache, c, min) {
  const cx = [], cy = [];
  const tomar = (lista, eje, cand) => {
    const d = Math.abs(cand.offset);
    if (d > min[eje]) return;
    if (d < min[eje]) lista.length = 0;
    min[eje] = d;
    lista.push(cand);
  };
  // Puntos: esquinas y centro contra esquinas y centros de las referencias.
  for (const p of puntosDe(c)) {
    for (const q of cache.puntos) {
      tomar(cx, 'x', { tipo: 'punto', puntos: [p, q], offset: q[0] - p[0] });
      tomar(cy, 'y', { tipo: 'punto', puntos: [p, q], offset: q[1] - p[1] });
    }
  }
  // Huecos: centrar en un hueco mayor que la selección, o repetir la distancia de los vecinos.
  const [x1, y1, x2, y2] = c, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  for (const g of cache.huecosH) {
    if (!solapan(y1, y2, g.solape[0], g.solape[1])) continue;
    if (g.largo > x2 - x1) tomar(cx, 'x', { tipo: 'hueco', dir: 'centroH', g, offset: redondear(g.desde + g.largo / 2 - mx) });
    tomar(cx, 'x', { tipo: 'hueco', dir: 'derecha', g, offset: redondear(g.largo - (x1 - g.fin[2])) });
    tomar(cx, 'x', { tipo: 'hueco', dir: 'izquierda', g, offset: redondear((g.ini[0] - x2) - g.largo) });
  }
  for (const g of cache.huecosV) {
    if (!solapan(x1, x2, g.solape[0], g.solape[1])) continue;
    if (g.largo > y2 - y1) tomar(cy, 'y', { tipo: 'hueco', dir: 'centroV', g, offset: redondear(g.desde + g.largo / 2 - my) });
    tomar(cy, 'y', { tipo: 'hueco', dir: 'abajo', g, offset: redondear(g.largo - (y1 - g.fin[3])) });
    tomar(cy, 'y', { tipo: 'hueco', dir: 'arriba', g, offset: redondear((g.ini[1] - y2) - g.largo) });
  }
  return { cx, cy };
}

// Líneas guía: las de puntos agrupadas por la coordenada común; las de hueco, dos tramos con la medida.
function lineas(cx, cy, c) {
  const out = [];
  const agrupar = (lista, eje) => {
    const grupos = new Map();
    for (const s of lista) {
      if (s.tipo !== 'punto') continue;
      const k = redondear(s.puntos[0][eje]);
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(...s.puntos);
    }
    for (const [k, ps] of grupos) {
      const otro = eje === 0 ? 1 : 0;
      const vals = ps.map(p => p[otro]);
      const a = Math.min(...vals), b = Math.max(...vals);
      out.push({ tipo: 'puntos', de: eje === 0 ? [k, a] : [a, k], a: eje === 0 ? [k, b] : [b, k], marcas: ps.map(p => (eje === 0 ? [k, p[1]] : [p[0], k])) });
    }
  };
  agrupar(cx, 0);
  agrupar(cy, 1);
  const [x1, y1, x2, y2] = c;
  for (const s of [...cx, ...cy]) {
    if (s.tipo !== 'hueco') continue;
    const g = s.g;
    if (s.dir === 'centroH' || s.dir === 'derecha' || s.dir === 'izquierda') {
      const v = interseccion(y1, y2, g.solape[0], g.solape[1]);
      if (!v) continue;
      const y = (v[0] + v[1]) / 2;
      const tramos = s.dir === 'centroH' ? [[g.desde, x1], [x2, g.hasta]]
        : s.dir === 'derecha' ? [[g.ini[2], g.fin[0]], [g.fin[2], x1]]
          : [[x2, g.ini[0]], [g.ini[2], g.fin[0]]];
      for (const [a, b] of tramos) out.push({ tipo: 'hueco', dir: 'h', de: [a, y], a: [b, y] });
    } else {
      const h = interseccion(x1, x2, g.solape[0], g.solape[1]);
      if (!h) continue;
      const x = (h[0] + h[1]) / 2;
      const tramos = s.dir === 'centroV' ? [[g.desde, y1], [y2, g.hasta]]
        : s.dir === 'abajo' ? [[g.ini[3], g.fin[1]], [g.fin[3], y1]]
          : [[y2, g.ini[1]], [g.ini[3], g.fin[1]]];
      for (const [a, b] of tramos) out.push({ tipo: 'hueco', dir: 'v', de: [x, a], a: [x, b] });
    }
  }
  return out;
}

// Imán para un arrastre: la caja de la selección al empezar, el desplazamiento crudo y el zoom.
// Devuelve el desplazamiento corregido y las líneas guía (calculadas desde la posición ya imantada,
// para que coincidan exactas, como hace Excalidraw).
export function imantarArrastre(cache, caja, dx, dy, zoom) {
  const umbral = DISTANCIA_IMAN / zoom;
  const mover = (ox, oy) => [caja[0] + ox, caja[1] + oy, caja[2] + ox, caja[3] + oy];
  const r1 = buscar(cache, mover(dx, dy), { x: umbral, y: umbral });
  const sx = dx + (r1.cx[0]?.offset ?? 0), sy = dy + (r1.cy[0]?.offset ?? 0);
  const c2 = mover(sx, sy);
  const r2 = buscar(cache, c2, { x: 0, y: 0 });
  return { dx: sx, dy: sy, lineas: lineas(r2.cx, r2.cy, c2) };
}

// SVG de las líneas guía (en coordenadas del mundo; los grosores se dividen por el zoom, como Excalidraw).
export function svgDeLineas(ls, zoom, color = '#E5484D') {
  const w = 1 / zoom, cruz = 2.5 / zoom, tic = 4 / zoom;
  let d = '', marcas = '';
  for (const l of ls) {
    d += `M${l.de[0]} ${l.de[1]}L${l.a[0]} ${l.a[1]}`;
    if (l.tipo === 'puntos') {
      for (const [x, y] of l.marcas) marcas += `M${x - cruz} ${y - cruz}L${x + cruz} ${y + cruz}M${x + cruz} ${y - cruz}L${x - cruz} ${y + cruz}`;
    } else if (l.dir === 'h') {
      for (const [x, y] of [l.de, l.a]) marcas += `M${x} ${y - tic}L${x} ${y + tic}`;
    } else {
      for (const [x, y] of [l.de, l.a]) marcas += `M${x - tic} ${y}L${x + tic} ${y}`;
    }
  }
  return `<path d="${d}${marcas}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
}
