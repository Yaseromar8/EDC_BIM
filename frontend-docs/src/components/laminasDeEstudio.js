/**
 * laminasDeEstudio.js — las seis LÁMINAS DE ESTUDIO de ingeniería civil que el
 * propietario aprobó el 14-oct-2026 («esas estuvieron bien»): canal + buzón,
 * alcantarilla, gaviones, perfil longitudinal, sección vial y excavadora.
 *
 * Estilo (la identidad): boceto de dibujante sobre papel, LÍNEAS DE
 * CONSTRUCCIÓN a la vista (fugas, ejes, guías), cotas escritas a mano, rayado
 * de corte en partes y un único color de detalle (el agua). Lo descartado: la
 * lámina de 16 piezas con maniquíes.
 *
 * Cada función devuelve { viewBox, markup } con SVG generado AQUÍ (sin datos de
 * nadie): seguro para insertarlo tal cual. El temblor de la mano usa semilla
 * fija: el mismo dibujo en cada carga. Los colores se pasan: en pantalla, gris
 * tenue y sin papel; en el banco, tinta y papel.
 */

export const COLORES_TINTA = { tinta: '#34332F', guia: '#A39F95', agua: '#3E6EA5', papel: '#F3EFE6' };

function lienzo(semilla, col, prefijo) {
  let s0 = semilla | 0;
  const R = () => {
    s0 = (s0 + 0x6D2B79F5) | 0;
    let t = Math.imul(s0 ^ (s0 >>> 15), 1 | s0);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const G = col.tinta, GC = col.guia;
  let s = '';
  let nId = 0;
  const jt = (p, a) => [p[0] + (R() - 0.5) * a, p[1] + (R() - 0.5) * a];
  const seg = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
  const cr = (p) => {
    let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
      d += ` C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)} ${(b[1] + (c[1] - a[1]) / 6).toFixed(1)} ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)} ${(c[1] - (e[1] - b[1]) / 6).toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`;
    }
    return d;
  };
  const L = (pts, { w = 1.6, c = G, n = 2, a = 1.2, op = 0.95 } = {}) => {
    for (let k = 0; k < n; k++) {
      s += `<path d="${cr(pts.map(p => jt(p, a)))}" fill="none" stroke="${c}" stroke-width="${k ? w * 0.5 : w}" stroke-linecap="round" stroke-linejoin="round" opacity="${k ? op * 0.55 : op}"/>`;
    }
  };
  const R2 = (a, b, o = {}) => L(seg(a, b, Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 16))), o);
  const P = (pts, o) => { for (let i = 0; i < pts.length - 1; i++) R2(pts[i], pts[i + 1], o); };
  const guia = (a, b, ext = 40) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    R2([a[0] - dx / l * ext, a[1] - dy / l * ext], [b[0] + dx / l * ext, b[1] + dy / l * ext], { w: 0.6, c: GC, n: 1, a: 0.6, op: 0.9 });
  };
  const txt = (x, y, t, rot = 0, sz = 15, c = G, anc = 'middle') => {
    s += `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" style="font-family:Caveat,'Segoe Print','Bradley Hand',cursive;font-size:${sz}px;fill:${c}" text-anchor="${anc}">${t}</text>`;
  };
  const cota = (a, b, t, off = 0, rot = 0) => {
    R2(a, b, { w: 0.8, n: 1, a: 0.4 });
    const an = Math.atan2(b[1] - a[1], b[0] - a[0]);
    [[a, an], [b, an + Math.PI]].forEach(([p, q]) => {
      R2(p, [p[0] + Math.cos(q + 0.35) * 7, p[1] + Math.sin(q + 0.35) * 7], { w: 0.8, n: 1, a: 0.3 });
      R2(p, [p[0] + Math.cos(q - 0.35) * 7, p[1] + Math.sin(q - 0.35) * 7], { w: 0.8, n: 1, a: 0.3 });
    });
    txt((a[0] + b[0]) / 2 + off * Math.cos(an - Math.PI / 2), (a[1] + b[1]) / 2 + off * Math.sin(an - Math.PI / 2), t, rot);
  };
  const rayar = (poly, ang, paso, op = 0.55, w = 0.7) => {
    const id = `${prefijo}-r${nId++}`;
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    s += `<clipPath id="${id}"><polygon points="${poly.map(p => p.join(',')).join(' ')}"/></clipPath><g clip-path="url(#${id})">`;
    const Lg = (x1 - x0) + (y1 - y0), dx = Math.cos(ang), dy = Math.sin(ang);
    for (let t = -Lg; t < Lg; t += paso) {
      const ox = (x0 + x1) / 2 - dy * t, oy = (y0 + y1) / 2 + dx * t;
      s += `<line x1="${(ox - dx * Lg).toFixed(1)}" y1="${(oy - dy * Lg + (R() - 0.5) * 1.5).toFixed(1)}" x2="${(ox + dx * Lg).toFixed(1)}" y2="${(oy + dy * Lg).toFixed(1)}" stroke="${G}" stroke-width="${w}" opacity="${op}"/>`;
    }
    s += '</g>';
  };
  const circ = (cx, cy, r, o) => L(Array.from({ length: 25 }, (_, i) => [cx + r * Math.cos(i / 24 * Math.PI * 2), cy + r * Math.sin(i / 24 * Math.PI * 2)]), o);
  const arco = (cx, cy, r, a0, a1, o) => L(Array.from({ length: 21 }, (_, i) => { const a = a0 + (a1 - a0) * i / 20; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }), o);
  const papel = (w, h) => { if (col.papel) s += `<rect width="${w}" height="${h}" rx="10" fill="${col.papel}"/>`; };
  const punto = (x, y, r, op = 0.5) => { s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${G}" opacity="${op}"/>`; };
  const anillo = (x, y, r, op = 0.6) => { s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${G}" stroke-width=".6" opacity="${op}"/>`; };
  return { R, G, GC, AZ: col.agua, L, R2, P, guia, txt, cota, rayar, circ, arco, seg, papel, punto, anillo, fin: () => s, raw: (x) => { s += x; } };
}

// ── 1 · Canal trapezoidal en perspectiva + buzón ─────────────────────────────
export function laminaCanalBuzon(col = COLORES_TINTA) {
  const c = lienzo(31, col, 'cb');
  const { L, R2, guia, txt, cota, rayar, seg, R, AZ, GC } = c;
  c.papel(680, 430);
  const VP = [470, 150];
  guia([10, 150], [660, 150], 0); txt(40, 144, 'horizonte', 0, 13);
  const fr = [[60, 250], [110, 330], [250, 330], [300, 250]];
  const fo = [[44, 250], [100, 342], [260, 342], [316, 250]];
  const k = 0.42, back = p => [VP[0] + (p[0] - VP[0]) * k, VP[1] + (p[1] - VP[1]) * k];
  fr.forEach(p => guia(p, VP, 30)); fo.forEach(p => guia(p, VP, 20));
  guia([10, 250], [680, 250], 0);
  const fb = fr.map(back), fob = fo.map(back);
  rayar([...fo, ...fr.slice().reverse()], 0.8, 4, 0.6, 0.7);
  L([fo[0], fo[1], fo[2], fo[3]], { w: 2.2 }); L([fr[0], fr[1], fr[2], fr[3]], { w: 1.8 });
  [0, 1, 2, 3].forEach(i => R2(fr[i], fb[i], { w: 1.4 })); R2(fo[1], fob[1], { w: 1 }); R2(fo[2], fob[2], { w: 1 });
  L([fb[0], fb[1], fb[2], fb[3]], { w: 1.2, op: 0.8 });
  for (let t = 0.2; t < 1; t += 0.2) {
    const a = [fr[1][0] + (fb[1][0] - fr[1][0]) * t, fr[1][1] + (fb[1][1] - fr[1][1]) * t];
    const b = [fr[2][0] + (fb[2][0] - fr[2][0]) * t, fr[2][1] + (fb[2][1] - fr[2][1]) * t];
    R2(a, b, { w: 0.7, n: 1, op: 0.7 });
  }
  const w1 = [fr[0][0] + (fr[1][0] - fr[0][0]) * 0.35, fr[0][1] + (fr[1][1] - fr[0][1]) * 0.35];
  const w2 = [fr[3][0] + (fr[2][0] - fr[3][0]) * 0.35, fr[3][1] + (fr[2][1] - fr[3][1]) * 0.35];
  L(seg(w1, w2, 8), { w: 1.2, c: AZ, n: 1 }); R2(back(w1), back(w2), { w: 0.9, c: AZ, n: 1 });
  R2(w1, back(w1), { w: 0.8, c: AZ, n: 1, op: 0.7 }); R2(w2, back(w2), { w: 0.8, c: AZ, n: 1, op: 0.7 });
  [[140, 292], [190, 296], [230, 292]].forEach(([x, y]) => L([[x, y], [x + 8, y - 3], [x + 16, y]], { w: 0.8, c: AZ, n: 1 }));
  for (let i = 0; i < 14; i++) c.punto(60 + R() * 240, 255 + R() * 80, 0.9);
  cota([110, 362], [250, 362], 'b = 1.50', -12);
  cota([30, 250], [30, 330], 'H = 1.20', -6, -90);
  cota([60, 232], [300, 232], 'T = 3.90', 8);
  L([[268, 282], [284, 282], [284, 266]], { w: 0.9, n: 1 }); txt(296, 276, '1:1', 0, 14);
  txt(180, 388, 'Sección típica · canal revestido', 0, 16);
  for (let i = 0; i < 7; i++) { const x = 20 + i * 48; R2([x, 250], [x + 10, 240], { w: 0.7, n: 1, op: 0.7 }); }
  for (let i = 0; i < 5; i++) { const x = 330 + i * 42; R2([x, 250], [x + 10, 240], { w: 0.7, n: 1, op: 0.7 }); }
  const cx = 545, yT = 110, yB = 318, rx = 46, ry = 13;
  const elip = (cy, r1, r2, a0 = 0, a1 = Math.PI * 2, n = 28) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + r1 * Math.cos(a), cy + r2 * Math.sin(a)]; });
  guia([cx, 60], [cx, 370], 0);
  L(elip(yT, rx + 20, ry + 6), { w: 0.6, c: GC, n: 1, a: 0.6 }); L(elip(yB, rx + 20, ry + 6, 0, Math.PI), { w: 0.6, c: GC, n: 1, a: 0.6 });
  guia([cx - rx, yT], [cx - rx, yB], 12); guia([cx + rx, yT], [cx + rx, yB], 12);
  L(elip(yT, rx, ry), { w: 2 }); L(elip(yT - 6, rx + 6, ry + 3, Math.PI, Math.PI * 2, 16), { w: 1.6 });
  R2([cx - rx - 6, yT - 6], [cx - rx, yT], { w: 1.4 }); R2([cx + rx + 6, yT - 6], [cx + rx, yT], { w: 1.4 });
  R2([cx - rx, yT], [cx - rx, yB], { w: 2 }); R2([cx + rx, yT], [cx + rx, yB], { w: 2 });
  L(elip(yB, rx, ry, 0, Math.PI), { w: 2 }); L(elip(yB, rx, ry, Math.PI, Math.PI * 2), { w: 0.8, c: GC, n: 1 });
  rayar([[cx + rx - 22, yT + 10], [cx + rx, yT + 4], [cx + rx, yB], [cx + rx - 22, yB + 10]], 2.3, 4, 0.55, 0.7);
  rayar([[cx + rx - 12, yT + 10], [cx + rx, yT + 4], [cx + rx, yB], [cx + rx - 12, yB + 10]], 0.7, 5, 0.35, 0.6);
  for (let y = yT + 34; y < yB - 20; y += 30) L([[cx - 14, y], [cx - 14, y + 8], [cx + 14, y + 8], [cx + 14, y]], { w: 1.2, n: 1 });
  L(elip(yB - 40, 13, 24, 0, Math.PI * 2, 20).map(([x, y]) => [x - rx + 2, y]), { w: 1.4 });
  R2([cx - rx - 70, yB - 62], [cx - rx, yB - 64], { w: 1.4 }); R2([cx - rx - 70, yB - 16], [cx - rx, yB - 16], { w: 1.4 });
  cota([cx - rx, 92], [cx + rx, 92], 'Ø 1.20', 8);
  cota([cx + rx + 34, yT], [cx + rx + 34, yB], 'h = 2.50', -8, 90);
  txt(cx + rx + 40, yT - 14, 'tapa F°F°', 0, 14); R2([cx + rx + 14, yT - 14], [cx + rx + 4, yT - 6], { w: 0.8, n: 1 });
  txt(cx - rx - 46, yB - 74, 'Ø 12"', 0, 14);
  txt(cx, 398, 'Buzón tipo · construcción', 0, 16);
  return { viewBox: '0 0 680 430', markup: c.fin() };
}

// ── 2 · Alcantarilla tipo cajón ──────────────────────────────────────────────
export function laminaAlcantarilla(col = COLORES_TINTA) {
  const c = lienzo(41, col, 'al');
  const { L, R2, P, guia, txt, cota, rayar, seg, AZ } = c;
  c.papel(680, 400);
  const D = [150, -70], m = (p, f = 1) => [p[0] + D[0] * f, p[1] + D[1] * f];
  const oF = [[190, 200], [370, 200], [370, 320], [190, 320]], iF = [[214, 224], [346, 224], [346, 308], [214, 308]];
  [...oF, ...iF].forEach(p => guia(p, m(p), 30));
  guia([20, 320], [660, 320], 0); guia([20, 200], [660, 200], 0);
  rayar([...oF, oF[0], iF[0], iF[3], iF[2], iF[1], iF[0]], 0.8, 4, 0.6);
  P([...oF, oF[0]], { w: 2.2 }); P([...iF, iF[0]], { w: 1.8 });
  [0, 1, 2].forEach(i => R2(oF[i], m(oF[i]), { w: 1.6 })); P([m(oF[0]), m(oF[1]), m(oF[2])], { w: 1.4 });
  R2(iF[1], m(iF[1], 0.55), { w: 1 }); R2(iF[0], m(iF[0], 0.55), { w: 1 });
  P([[190, 320], [96, 370], [96, 396]], { w: 1.8 }); P([[190, 200], [96, 262], [96, 370]], { w: 1.8 });
  rayar([[190, 200], [96, 262], [96, 370], [190, 320]], 2.1, 6, 0.35, 0.6);
  P([[370, 320], [452, 372]], { w: 1.8 }); P([[370, 200], [452, 252], [452, 372]], { w: 1.8 });
  L(seg([214, 286], [346, 286], 8), { w: 1.2, c: AZ, n: 1 }); R2([346, 286], m([346, 286], 0.55), { w: 0.9, c: AZ, n: 1 });
  [[236, 298], [286, 300], [320, 296]].forEach(([x, y]) => L([[x, y], [x + 8, y - 3], [x + 16, y]], { w: 0.8, c: AZ, n: 1 }));
  P([[150, 200], [190, 186], [370, 186], [520, 116], [600, 116]], { w: 1.4 });
  P([[150, 206], [190, 194], [370, 194], [520, 124]], { w: 0.8, n: 1, op: 0.8 });
  for (let i = 0; i < 9; i++) { const x = 200 + i * 20; R2([x, 186], [x + 6, 194], { w: 0.6, n: 1, op: 0.7 }); }
  cota([214, 338], [346, 338], 'B = 2.00', -12); cota([400, 224], [400, 308], 'H = 1.50', -8, 90);
  cota([170, 200], [170, 224], 'e = .25', 14, 0); cota([380, 330], [520, 260], 'L = 8.00', 14, -25);
  cota([96, 384], [190, 384], 'alero', -10);
  txt(560, 108, 'calzada', 0, 14); txt(100, 250, '45°', 0, 14);
  txt(300, 385, 'Alcantarilla tipo cajón · perspectiva', 0, 16);
  return { viewBox: '0 0 680 400', markup: c.fin() };
}

// ── 3 · Muro de gaviones ─────────────────────────────────────────────────────
export function laminaGaviones(col = COLORES_TINTA) {
  const c = lienzo(53, col, 'ga');
  const { L, R2, P, guia, txt, cota, rayar, R, AZ } = c;
  c.papel(680, 400);
  const piedras = (x, y, w, h, n) => { for (let i = 0; i < n; i++) { const cx = x + 6 + R() * (w - 12), cy = y + 6 + R() * (h - 12), r = 4 + R() * 5; L(Array.from({ length: 7 }, (_, k) => { const a = k / 6 * Math.PI * 2, rr = r * (0.75 + R() * 0.4); return [cx + rr * Math.cos(a), cy + rr * 0.8 * Math.sin(a)]; }), { w: 0.9, n: 1, a: 0.4 }); } };
  const malla = (x, y, w, h) => { for (let k = -h; k < w; k += 14) { R2([x + Math.max(k, 0), y + Math.max(-k, 0)], [x + Math.min(k + h, w), y + Math.min(h, w - k)], { w: 0.5, n: 1, a: 0.3, op: 0.55 }); R2([x + Math.max(k, 0), y + h - Math.max(-k, 0)], [x + Math.min(k + h, w), y + h - Math.min(h, w - k)], { w: 0.5, n: 1, a: 0.3, op: 0.55 }); } };
  const u = 70, X0 = 150, YB = 330;
  guia([20, YB], [660, YB], 0);
  [1, 2, 3].forEach(k => guia([X0 - 30, YB - k * u], [X0 + 3 * u + 80, YB - k * u], 0));
  [0, 1, 2, 3].forEach(k => guia([X0 + k * u, YB + 30], [X0 + k * u, YB - 3 * u - 20], 0));
  [[0, 0, 3, 1, true], [0, 1, 2, 1, false], [0, 2, 1, 1, true]].forEach(([i, j, w, h, acab]) => {
    const x = X0 + i * u, y = YB - (j + 1) * u, W = w * u, H = h * u;
    P([[x, y], [x + W, y], [x + W, y + H], [x, y + H], [x, y]], { w: 2 });
    for (let k = 1; k < w; k++) R2([x + k * u, y], [x + k * u, y + H], { w: 1.2 });
    if (acab) { malla(x, y, W, H); piedras(x, y, W, H, w * 9); }
  });
  P([[X0 + 3 * u, YB], [X0 + 3 * u + 130, YB - 3 * u - 10]], { w: 1.4 }); P([[X0 + u, YB - 3 * u], [X0 + 3 * u + 130, YB - 3 * u - 10]], { w: 1.2 });
  rayar([[X0 + 2 * u, YB - u], [X0 + 3 * u, YB - u], [X0 + 3 * u, YB], [X0 + 3 * u + 130, YB - 3 * u - 10], [X0 + u, YB - 3 * u], [X0 + u, YB - 2 * u], [X0 + 2 * u, YB - 2 * u]], 0.9, 7, 0.3, 0.6);
  P([[X0 + 3 * u + 4, YB - 4], [X0 + 3 * u + 4, YB - u + 4], [X0 + 2 * u + 4, YB - u + 4], [X0 + 2 * u + 4, YB - 2 * u + 4], [X0 + u + 4, YB - 2 * u + 4], [X0 + u + 4, YB - 3 * u + 4]], { w: 1, n: 1 });
  txt(X0 + 3 * u + 120, YB - 60, 'relleno', 0, 15); txt(X0 + 3 * u + 36, YB - u - 6, 'geotextil', 0, 13);
  R2([X0 + 3 * u + 18, YB - u - 2], [X0 + 3 * u + 6, YB - u + 10], { w: 0.7, n: 1 });
  P([[30, YB - 40], [X0, YB - 40]], { w: 1.2, c: AZ, n: 1 });
  [[50, YB - 30], [96, YB - 28]].forEach(([x, y]) => L([[x, y], [x + 8, y - 3], [x + 16, y]], { w: 0.8, c: AZ, n: 1 }));
  L([[40, YB - 48], [46, YB - 56], [52, YB - 48], [40, YB - 48]], { w: 0.9, c: AZ, n: 1 }); txt(78, YB - 52, 'NAME', 0, 13, AZ);
  rayar([[30, YB], [X0 + 3 * u + 200, YB], [X0 + 3 * u + 200, YB + 28], [30, YB + 28]], 0.8, 8, 0.35, 0.6);
  P([[X0 - 10, YB], [X0 - 10, YB + 16], [X0 + 3 * u + 10, YB + 16], [X0 + 3 * u + 10, YB]], { w: 1.2, n: 1 }); txt(X0 + 3 * u + 40, YB + 14, 'solado', 0, 13);
  cota([X0, YB + 44], [X0 + 3 * u, YB + 44], '3.00', -10); cota([X0, YB - 3 * u - 24], [X0 + u, YB - 3 * u - 24], '1.00', 10);
  cota([X0 - 34, YB], [X0 - 34, YB - u], '1.00', -6, -90); cota([X0 - 34, YB - u], [X0 - 34, YB - 2 * u], '1.00', -6, -90); cota([X0 - 34, YB - 2 * u], [X0 - 34, YB - 3 * u], '1.00', -6, -90);
  txt(470, 90, 'malla 10x12 · Ø 2.7 mm', 0, 14); R2([440, 96], [X0 + u - 10, YB - 3 * u + 16], { w: 0.7, n: 1 });
  txt(340, 388, 'Muro de gaviones · sección', 0, 16);
  return { viewBox: '0 0 680 400', markup: c.fin() };
}

// ── 4 · Perfil longitudinal ──────────────────────────────────────────────────
export function laminaPerfil(col = COLORES_TINTA) {
  const c = lienzo(67, col, 'pe');
  const { L, R2, P, txt, rayar, GC, AZ } = c;
  c.papel(680, 400);
  const X0 = 80, X1 = 640, Y0 = 40, Y1 = 300, cot0 = 12, cot1 = 17;
  const yC = v => Y1 - (v - cot0) / (cot1 - cot0) * (Y1 - Y0), xP = p => X0 + p / 200 * (X1 - X0);
  for (let v = cot0; v <= cot1; v++) { R2([X0, yC(v)], [X1, yC(v)], { w: 0.5, c: GC, n: 1, a: 0.4 }); txt(X0 - 12, yC(v) + 4, v.toFixed(2), 0, 13, c.G, 'end'); }
  for (let p = 0; p <= 200; p += 25) { R2([xP(p), Y0], [xP(p), Y1 + 8], { w: 0.5, c: GC, n: 1, a: 0.4 }); if (p % 50 === 0) txt(xP(p), Y1 + 24, `0+${String(p).padStart(3, '0')}`, 0, 13); }
  P([[X0, Y0], [X0, Y1], [X1, Y1]], { w: 1.4 });
  const ter = [[0, 15.6], [20, 15.9], [40, 15.4], [60, 15.7], [80, 15.2], [100, 15.5], [120, 14.9], [140, 15.1], [160, 14.6], [180, 14.9], [200, 14.4]].map(([p, v]) => [xP(p), yC(v)]);
  L(ter, { w: 2.2 });
  const bz = [[0, 15.6, 13.80], [50, 15.65, 13.40], [100, 15.5, 13.00], [150, 14.95, 12.62], [200, 14.4, 12.25]];
  const tubo = bz.map(([p, , cf]) => [xP(p), yC(cf)]);
  P(tubo, { w: 2, c: AZ }); P(tubo.map(([x, y]) => [x, y - 7]), { w: 1, c: AZ, n: 1 });
  rayar([...ter, [xP(200), yC(14.4)], [xP(200), yC(12.25) - 7], ...tubo.slice().reverse().map(([x, y]) => [x, y - 7])], 0.9, 9, 0.18, 0.6);
  bz.forEach(([p, ct, cf], i) => {
    const x = xP(p);
    P([[x - 7, yC(ct)], [x - 7, yC(cf) + 6], [x + 7, yC(cf) + 6], [x + 7, yC(ct)]], { w: 1.8 }); R2([x - 10, yC(ct)], [x + 10, yC(ct)], { w: 2.4 });
    txt(x, yC(ct) - 24, `BZ-${i + 1}`, 0, 15); txt(x + (i === 4 ? -6 : 0), yC(ct) - 10, `CT ${ct.toFixed(2)}`, 0, 12);
    txt(x + (i === 4 ? -30 : 22), yC(cf) + 22, `CF ${cf.toFixed(2)}`, 0, 12, AZ);
  });
  [[25, 'S = 0.80 %'], [75, 'S = 0.80 %'], [125, 'S = 0.76 %'], [175, 'S = 0.74 %']].forEach(([p, t]) => txt(xP(p), yC(13.2 - (p - 25) * 0.008) + 30, t, 0, 13, AZ));
  txt(xP(62), yC(16.05), 'terreno natural', 0, 14); R2([xP(62), yC(15.95)], [xP(62), yC(15.75)], { w: 0.7, n: 1 });
  txt(xP(110), yC(12.55), 'tubería PVC Ø 12"', 0, 14, AZ);
  txt(360, 388, 'Perfil longitudinal · colector', 0, 16);
  return { viewBox: '0 0 680 400', markup: c.fin() };
}

// ── 5 · Sección vial típica ──────────────────────────────────────────────────
export function laminaSeccionVial(col = COLORES_TINTA) {
  const c = lienzo(79, col, 'sv');
  const { L, R2, P, guia, txt, cota, rayar, R, GC, AZ } = c;
  c.papel(680, 380);
  const puntos = (poly, n) => {
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    const id = `sv-p${Math.floor(R() * 1e9)}`;
    c.raw(`<clipPath id="${id}"><polygon points="${poly.map(p => p.join(',')).join(' ')}"/></clipPath><g clip-path="url(#${id})">`);
    for (let i = 0; i < n; i++) c.anillo(Math.min(...xs) + R() * (Math.max(...xs) - Math.min(...xs)), Math.min(...ys) + R() * (Math.max(...ys) - Math.min(...ys)), 0.8 + R() * 1.6);
    c.raw('</g>');
  };
  const CL = 340, y0 = 150, hw = 180, bom = 7, berm = 50;
  const top = [[CL - hw - berm, y0 + bom + 4], [CL - hw, y0 + bom], [CL, y0], [CL + hw, y0 + bom], [CL + hw + berm, y0 + bom + 4]];
  const off = (pts, d) => pts.map(([x, y]) => [x, y + d]);
  guia([CL, 60], [CL, 300], 0); txt(CL + 16, 72, '℄', 0, 20);
  [CL - hw, CL + hw, CL - hw - berm, CL + hw + berm].forEach(x => guia([x, y0 - 50], [x, y0 + 120], 0));
  const c1 = off(top, 8), c2 = off(top, 30), c3 = off(top, 56);
  rayar([...top, ...c1.slice().reverse()], 0, 2.2, 0.7, 0.6);
  puntos([...c1, ...c2.slice().reverse()], 140);
  rayar([...c2, ...c3.slice().reverse()], 0.8, 8, 0.35, 0.6); puntos([...c2, ...c3.slice().reverse()], 60);
  [top, c1, c2, c3].forEach((l, i) => P(l, { w: i === 0 ? 2.2 : 1.3 }));
  const cuI = [[CL - hw - berm, y0 + bom + 4], [CL - hw - berm - 30, y0 + bom + 40], [CL - hw - berm - 60, y0 + bom + 4], [CL - hw - berm - 120, y0 - 12]];
  const cuD = cuI.map(([x, y]) => [2 * CL - x, y]);
  P(cuI, { w: 2 }); P(cuD, { w: 2 });
  [cuI, cuD].forEach(q => { const a = [q[0][0] + (q[1][0] - q[0][0]) * 0.5, q[0][1] + (q[1][1] - q[0][1]) * 0.5], b = [q[2][0] + (q[1][0] - q[2][0]) * 0.5, q[2][1] + (q[1][1] - q[2][1]) * 0.5]; R2(a, b, { w: 1.2, c: AZ, n: 1 }); });
  rayar([[20, y0 + 80], [660, y0 + 80], [660, y0 + 130], [20, y0 + 130]], 0.8, 9, 0.25, 0.6);
  P([[CL - hw - berm - 60, y0 + bom + 4], [CL - hw - berm - 60, y0 + 86], [CL + hw + berm + 60, y0 + 86], [CL + hw + berm + 60, y0 + bom + 4]], { w: 0.8, n: 1, c: GC });
  txt(CL - hw / 2, y0 - 8, '2 %', 0, 15); txt(CL + hw / 2, y0 - 8, '2 %', 0, 15);
  L([[CL - hw / 2 - 26, y0 - 2], [CL - hw / 2 + 26, y0 + 2]], { w: 0.9, n: 1 }); L([[CL + hw / 2 - 26, y0 + 2], [CL + hw / 2 + 26, y0 - 2]], { w: 0.9, n: 1 });
  cota([CL - hw, y0 - 40], [CL, y0 - 40], '3.60', 8); cota([CL, y0 - 40], [CL + hw, y0 - 40], '3.60', 8);
  cota([CL + hw, y0 - 40], [CL + hw + berm, y0 - 40], '1.20', 8); cota([CL - hw - berm, y0 - 40], [CL - hw, y0 - 40], '1.20', 8);
  const tag = (y, t) => { R2([CL + 30, y], [CL + 250, y + 60 - (y - y0) * 0.4], { w: 0.6, n: 1 }); txt(CL + 265, y + 64 - (y - y0) * 0.4, t, 0, 13); };
  tag(y0 + 4, 'carpeta asf. e = 2"'); tag(y0 + 18, 'base granular e = .20'); tag(y0 + 42, 'subbase e = .25');
  txt(110, y0 + 76, 'subrasante', 0, 14); txt(CL - hw - berm - 36, y0 + bom + 58, 'cuneta', 0, 14);
  txt(340, 360, 'Sección vial típica', 0, 16);
  return { viewBox: '0 0 680 380', markup: c.fin() };
}

// ── 6 · Excavadora en construcción geométrica ────────────────────────────────
export function laminaExcavadora(col = COLORES_TINTA) {
  const c = lienzo(97, col, 'ex');
  const { R2, P, guia, txt, cota, rayar, circ, arco, GC } = c;
  c.papel(680, 400);
  const Y = 330; guia([20, Y], [660, Y], 0);
  for (let x = 20; x < 640; x += 10) R2([x, Y + 10], [x + 8, Y + 2], { w: 0.6, n: 1, op: 0.6 });
  P([[80, Y - 34], [300, Y - 34]], { w: 1.6 }); circ(100, Y - 17, 17, { w: 1.8 }); circ(282, Y - 17, 17, { w: 1.8 }); P([[100, Y], [282, Y]], { w: 1.8 });
  [140, 176, 212, 248].forEach(x => circ(x, Y - 16, 9, { w: 1 })); circ(100, Y - 17, 5, { w: 0.8, n: 1 }); circ(282, Y - 17, 5, { w: 0.8, n: 1 });
  guia([191, Y - 36], [191, 60], 0); txt(204, 74, 'eje de giro', 0, 13);
  const casa = [[96, Y - 36], [96, Y - 104], [256, Y - 104], [256, Y - 36]]; P([...casa, casa[0]], { w: 2 });
  P([[70, Y - 44], [70, Y - 96], [96, Y - 96]], { w: 1.8 }); P([[70, Y - 44], [96, Y - 44]], { w: 1.8 });
  rayar([[70, Y - 44], [70, Y - 96], [96, Y - 96], [96, Y - 44]], 0.8, 4, 0.6); rayar([[96, Y - 36], [96, Y - 104], [150, Y - 104], [150, Y - 36]], 2.3, 5, 0.35);
  [110, 122, 134].forEach(x => R2([x, Y - 96], [x, Y - 50], { w: 0.9, n: 1 }));
  P([[196, Y - 104], [196, Y - 170], [236, Y - 170], [256, Y - 136], [256, Y - 104]], { w: 2 });
  P([[204, Y - 162], [232, Y - 162], [246, Y - 138], [246, Y - 114], [204, Y - 114], [204, Y - 162]], { w: 1.1, n: 1 });
  const pb = [256, Y - 90], pc = [372, Y - 226], pm = [452, Y - 120], pk = [470, Y - 60];
  circ(...pb, 6, { w: 1.4 }); circ(...pc, 6, { w: 1.4 }); circ(...pm, 6, { w: 1.4 });
  guia(pb, pc, 30); guia(pc, pm, 30); guia(pm, pk, 20);
  const g1 = (a, b, w) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), nx = -dy / l * w, ny = dx / l * w; return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]; };
  const pl = g1(pb, pc, 11); P([...pl, pl[0]], { w: 2 }); rayar(pl, 2.4, 4, 0.5);
  const br = g1(pc, pm, 8); P([...br, br[0]], { w: 1.8 });
  P([[pb[0] - 20, pb[1] + 10], [pc[0] - 30, pc[1] + 56]], { w: 3, c: GC }); P([[pc[0] + 10, pc[1] + 14], [pm[0] - 16, pm[1] - 28]], { w: 3, c: GC });
  const cu = [[pm[0] - 6, pm[1] + 6], [pm[0] + 30, pm[1] + 20], [pm[0] + 34, pm[1] + 56], [pm[0] + 10, pm[1] + 78], [pm[0] - 18, pm[1] + 58]]; P([...cu, cu[0]], { w: 2 });
  [[0, 78], [10, 82], [20, 78]].forEach(([dx, dy]) => R2([pm[0] - 10 + dx, pm[1] + dy - 4], [pm[0] - 12 + dx, pm[1] + dy + 6], { w: 1.2, n: 1 }));
  arco(...pb, 262, -1.25, -0.1, { w: 0.7, c: GC, n: 1, a: 0.6 }); txt(560, 128, 'alcance máx. 9.80 m', 0, 14);
  arco(...pc, 96, 0.6, 1.3, { w: 0.7, c: GC, n: 1, a: 0.6 });
  cota([80, Y + 30], [300, Y + 30], '4.40', -10); cota([40, Y], [40, Y - 170], '3.05', -6, -90);
  cota([pb[0] + 18, pb[1] + 18], [pc[0] + 18, pc[1] + 18], 'pluma 5.70', -12, -49);
  txt(470, Y - 212, 'brazo 2.90', 0, 14); R2([440, Y - 206], [pc[0] + 40, pc[1] + 30], { w: 0.7, n: 1 });
  txt(530, Y - 50, 'cucharón 0.90 m³', 0, 14); R2([500, Y - 56], [pm[0] + 30, pm[1] + 50], { w: 0.7, n: 1 });
  txt(340, 388, 'Excavadora · construcción geométrica', 0, 16);
  return { viewBox: '0 0 680 400', markup: c.fin() };
}

export const LAMINAS = {
  canal: laminaCanalBuzon,
  alcantarilla: laminaAlcantarilla,
  gaviones: laminaGaviones,
  perfil: laminaPerfil,
  vial: laminaSeccionVial,
  excavadora: laminaExcavadora,
};
