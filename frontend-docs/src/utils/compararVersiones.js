/**
 * La matemática de «Comparar versiones» (3-nov-2026), sin DOM: se prueba con node
 * (pruebas/compararVersiones.prueba.mjs) y la usa components/PdfCompareView.jsx.
 *
 * Lo estándar, medido en ACC (Autodesk Build, «Compare Sheets») y Procore («Compare Drawings»):
 *   - rojo = solo en la versión base (lo que se quitó), azul = solo en la otra (lo añadido), negro = igual en las dos;
 *   - apagar los colores o cada versión; lado a lado con zoom vinculado; cortina; alinear a mano.
 * Lo nuestro: los CAMBIOS se detectan solos y se encierran en nubes numeradas, con su lista, para recorrerlos uno a uno.
 *
 * Todo trabaja en píxeles de la «hoja de comparación»: las dos versiones dibujadas al mismo ancho.
 */

// La tinta que cuenta: por debajo es papel, antialias o una trama muy clara.
export const UMBRAL_TINTA = 60;

// Colores de la paleta oficial (D-24): el rojo de error y el azul 30D; lo común, Dark.
export const COLOR_QUITADO = [185, 53, 53];   // #B93535 · solo en la anterior
export const COLOR_ANADIDO = [80, 114, 148];  // #507294 · solo en la nueva
export const COLOR_COMUN = [20, 20, 19];      // #141413

/** Tinta (0 = papel, 255 = negro) de un RGBA: 255 − luminancia; un píxel transparente es papel. */
export function tintaDe(rgba) {
  const n = rgba.length >> 2;
  const t = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = rgba[j + 3] / 255;
    const lum = (0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]) * a + 255 * (1 - a);
    t[i] = 255 - lum;
  }
  return t;
}

/** Máximo en una vecindad de radio r (separable). Sirve de TOLERANCIA: una línea movida medio píxel no es un cambio. */
export function dilatar(t, w, h, r = 1) {
  if (r <= 0) return t;
  const tmp = new Uint8Array(t.length);
  const out = new Uint8Array(t.length);
  for (let y = 0; y < h; y++) {
    const fila = y * w;
    for (let x = 0; x < w; x++) {
      let m = 0;
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
      for (let k = x0; k <= x1; k++) if (t[fila + k] > m) m = t[fila + k];
      tmp[fila + x] = m;
    }
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = y0; k <= y1; k++) { const v = tmp[k * w + x]; if (v > m) m = v; }
      out[y * w + x] = m;
    }
  }
  return out;
}

/**
 * Compone la superposición y marca lo que cambió.
 *
 * a, b: tinta de cada versión (w × h, ya al mismo ancho; una versión más corta se rellena con papel).
 * dilA, dilB: sus dilataciones (tolerancia). dx, dy: el desplazamiento de A (alinear), en píxeles.
 * opciones: { colores, verA, verB, atenuar (0–1: cuánto se ve lo que no cambió) }.
 * Escribe en `salida` (Uint8ClampedArray RGBA w × h) y devuelve el mapa de cambios: 1 quitado, 2 añadido.
 * Sin `salida`, solo el mapa (para buscar cambios sin pintar).
 */
export function componer({ a, b, dilA, dilB, w, h, dx = 0, dy = 0, salida, colores = true, verA = true, verB = true, atenuar = 0.4 }) {
  const cambios = new Uint8Array(w * h);
  const U = UMBRAL_TINTA;
  const atn = Math.max(0, Math.min(1, atenuar));
  for (let y = 0; y < h; y++) {
    const ya = y - dy;
    const filaA = ya >= 0 && ya < h ? ya * w : -1;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const xa = x - dx;
      const ia = filaA >= 0 && xa >= 0 && xa < w ? filaA + xa : -1;
      const ta = ia >= 0 ? a[ia] : 0;
      const tb = b[i];
      const quitado = ta > U && dilB[i] <= U;
      const anadido = tb > U && (ia >= 0 ? dilA[ia] : 0) <= U;
      if (quitado) cambios[i] = 1; else if (anadido) cambios[i] = 2;
      if (!salida) continue;
      let color = null, k = 0;
      if (!verA && !verB) { k = 0; }
      else if (!verA) { color = COLOR_COMUN; k = tb / 255; }
      else if (!verB) { color = COLOR_COMUN; k = ta / 255; }
      else if (!colores) { color = COLOR_COMUN; k = Math.max(ta, tb) / 255; }
      else if (quitado) { color = COLOR_QUITADO; k = ta / 255; }
      else if (anadido) { color = COLOR_ANADIDO; k = tb / 255; }
      else { color = COLOR_COMUN; k = (Math.max(ta, tb) / 255) * atn; }
      const j = i * 4;
      if (!color || k <= 0) {
        salida[j] = 255; salida[j + 1] = 255; salida[j + 2] = 255;
      } else {
        salida[j] = 255 + (color[0] - 255) * k;
        salida[j + 1] = 255 + (color[1] - 255) * k;
        salida[j + 2] = 255 + (color[2] - 255) * k;
      }
      salida[j + 3] = 255;
    }
  }
  return cambios;
}

/**
 * Las ZONAS que cambiaron: rejilla de celdas, se marcan las que tienen bastante cambio, se unen las vecinas
 * (con una holgura de `union` celdas, para que una cota y su texto sean una sola zona) y se devuelven sus cajas.
 * Ordenadas como se lee una lámina: por bandas de arriba abajo y, en cada banda, de izquierda a derecha.
 */
export function detectarCambios(cambios, w, h, { celda = 12, minimo = 6, union = 3, minPixeles = 40, margen = 10, tope = 200 } = {}) {
  const cw = Math.ceil(w / celda), ch = Math.ceil(h / celda);
  const cuenta = new Uint32Array(cw * ch);
  const quitados = new Uint32Array(cw * ch);
  for (let y = 0; y < h; y++) {
    const fy = ((y / celda) | 0) * cw;
    for (let x = 0; x < w; x++) {
      const v = cambios[y * w + x];
      if (v) { const c = fy + ((x / celda) | 0); cuenta[c]++; if (v === 1) quitados[c]++; }
    }
  }
  const activa = new Uint8Array(cw * ch);
  for (let c = 0; c < activa.length; c++) if (cuenta[c] >= minimo) activa[c] = 1;
  const visto = new Int32Array(cw * ch).fill(-1);
  const zonas = [];
  const cola = new Int32Array(cw * ch);
  for (let c0 = 0; c0 < activa.length; c0++) {
    if (!activa[c0] || visto[c0] >= 0) continue;
    let ini = 0, fin = 0;
    cola[fin++] = c0; visto[c0] = zonas.length;
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1, pix = 0, quit = 0;
    while (ini < fin) {
      const c = cola[ini++];
      const cx = c % cw, cy = (c / cw) | 0;
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
      pix += cuenta[c]; quit += quitados[c];
      for (let yy = Math.max(0, cy - union); yy <= Math.min(ch - 1, cy + union); yy++) {
        for (let xx = Math.max(0, cx - union); xx <= Math.min(cw - 1, cx + union); xx++) {
          const n = yy * cw + xx;
          if (activa[n] && visto[n] < 0) { visto[n] = zonas.length; cola[fin++] = n; }
        }
      }
    }
    if (pix < minPixeles) continue;
    zonas.push({
      x: Math.max(0, x0 * celda - margen), y: Math.max(0, y0 * celda - margen),
      x2: Math.min(w, (x1 + 1) * celda + margen), y2: Math.min(h, (y1 + 1) * celda + margen),
      pixeles: pix, quitados: quit, anadidos: pix - quit,
    });
  }
  const unidas = unirSolapadas(zonas);
  const banda = Math.max(1, h / 8);
  unidas.sort((p, q) => (Math.floor(p.y / banda) - Math.floor(q.y / banda)) || (p.x - q.x));
  return unidas.slice(0, tope).map((z, i) => ({ ...z, n: i + 1, w: z.x2 - z.x, h: z.y2 - z.y,
    tipo: tipoDeCambio(z), lugar: lugarEnLaHoja(z, w, h) }));
}

function unirSolapadas(zonas) {
  const lista = zonas.map(z => ({ ...z }));
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (let i = 0; i < lista.length && !cambio; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const p = lista[i], q = lista[j];
        if (p.x < q.x2 && q.x < p.x2 && p.y < q.y2 && q.y < p.y2) {
          lista[i] = { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), x2: Math.max(p.x2, q.x2), y2: Math.max(p.y2, q.y2),
            pixeles: p.pixeles + q.pixeles, quitados: p.quitados + q.quitados, anadidos: p.anadidos + q.anadidos };
          lista.splice(j, 1);
          cambio = true;
          break;
        }
      }
    }
  }
  return lista;
}

/**
 * LAS ZONAS, AFINANDO DONDE SE PUEDE (3-nov-2026). Con un píxel de tolerancia, una cota dibujada con líneas (fuentes
 * SHX: en los planos de PQT8 casi ningún texto es texto) que pasa de 21.35 a 24.60 deja 13 píxeles cambiados y no sale;
 * sin tolerancia deja 149 y sale, en su sitio (medido con las teselas reales del banco). Pero sin tolerancia una hoja
 * corrida medio píxel se marcaría entera. Así que la pasada fina solo se usa si las dos versiones están EN REGISTRO:
 * si lo que añade sin tolerancia es menos del `tope` (3 %) de la tinta. Lo que encuentra y no estaba ya se clasifica
 * igual que lo demás: un dígito que cambia quita y pone en el mismo sitio, «modificado».
 *
 * mapa: el de `componer` con tolerancia. Devuelve { zonas, afinado } (afinado: si se usó la pasada fina).
 */
export function detectarAfinando({ mapa, a, b, w, h, dx = 0, dy = 0, tope = 0.03, opciones = {} }) {
  const zonas = detectarCambios(mapa, w, h, opciones);
  const fino = componer({ a, b, dilA: a, dilB: b, w, h, dx, dy, salida: null });
  let tinta = 0, conTolerancia = 0, sinTolerancia = 0;
  for (let i = 0; i < b.length; i++) {
    if (b[i] > UMBRAL_TINTA) tinta++;
    if (mapa[i]) conTolerancia++;
    if (fino[i]) sinTolerancia++;
  }
  if (!tinta || (sinTolerancia - conTolerancia) / tinta > tope) return { zonas, afinado: false };
  const nuevas = detectarCambios(fino, w, h, { ...opciones, minPixeles: 30 })
    .filter(f => !zonas.some(z => f.x < z.x2 && z.x < f.x2 && f.y < z.y2 && z.y < f.y2))
    .map(f => ({ ...f, fina: true }));
  if (!nuevas.length) return { zonas, afinado: true };
  const todas = [...zonas, ...nuevas];
  const banda = Math.max(1, h / 8);
  todas.sort((p, q) => (Math.floor(p.y / banda) - Math.floor(q.y / banda)) || (p.x - q.x));
  return { zonas: todas.map((z, i) => ({ ...z, n: i + 1 })), afinado: true };
}

/**
 * LOS TEXTOS QUE CAMBIARON (como «Show Semantics» de Procore, pero dentro de la lista de cambios). Una cota que pasa
 * de 21.35 a 24.60 casi no deja huella en los píxeles —los dígitos se pisan—, pero su texto sí cambió.
 *
 * itemsA, itemsB: [{ s, x, y, w, h }] en píxeles de la hoja (la A ya desplazada). Un texto es «el mismo» si dice lo
 * mismo y su centro está a menos de `tolerancia` px. Lo que sobra de un lado y del otro en el mismo sitio es
 * «modificado» (antes → después); lo que sobra solo de un lado, «quitado» o «añadido».
 */
export function cambiosDeTexto(itemsA, itemsB, { tolerancia = 6 } = {}) {
  const limpio = (t) => String(t.s || '').replace(/\s+/g, ' ').trim();
  const cx = (t) => t.x + t.w / 2, cy = (t) => t.y + t.h / 2;
  const A = itemsA.filter(t => limpio(t)), B = itemsB.filter(t => limpio(t));
  const usadoB = new Uint8Array(B.length);
  const solosA = [];
  for (const t of A) {
    const s = limpio(t);
    let k = -1;
    for (let j = 0; j < B.length; j++) {
      if (!usadoB[j] && limpio(B[j]) === s && Math.abs(cx(B[j]) - cx(t)) <= tolerancia && Math.abs(cy(B[j]) - cy(t)) <= tolerancia) { k = j; break; }
    }
    if (k >= 0) usadoB[k] = 1; else solosA.push(t);
  }
  const solosB = B.filter((_, j) => !usadoB[j]);
  const tomadoB = new Uint8Array(solosB.length);
  const salida = [];
  for (const t of solosA) {
    let k = -1;
    for (let j = 0; j < solosB.length; j++) {
      const u = solosB[j];
      if (tomadoB[j]) continue;
      const solapan = t.x < u.x + u.w && u.x < t.x + t.w && t.y < u.y + u.h && u.y < t.y + t.h;
      const cerca = Math.abs(cy(u) - cy(t)) <= Math.max(t.h, u.h) * 0.6 && Math.abs(t.x - u.x) <= Math.max(t.h, u.h) * 2;
      if (solapan || cerca) { k = j; break; }
    }
    if (k >= 0) {
      tomadoB[k] = 1;
      const u = solosB[k];
      salida.push({ x: Math.min(t.x, u.x), y: Math.min(t.y, u.y), x2: Math.max(t.x + t.w, u.x + u.w), y2: Math.max(t.y + t.h, u.y + u.h),
        tipo: 'modificado', antes: limpio(t), despues: limpio(u) });
    } else {
      salida.push({ x: t.x, y: t.y, x2: t.x + t.w, y2: t.y + t.h, tipo: 'quitado', antes: limpio(t), despues: null });
    }
  }
  solosB.forEach((u, j) => {
    if (!tomadoB[j]) salida.push({ x: u.x, y: u.y, x2: u.x + u.w, y2: u.y + u.h, tipo: 'añadido', antes: null, despues: limpio(u) });
  });
  return salida;
}

/**
 * Junta las zonas de píxeles con los cambios de texto: el texto que cae dentro de una zona se le apunta (y si es una
 * cota cambiada, la zona pasa a «modificado»); el que no cae en ninguna es una zona nueva. Se renumera en orden de lectura.
 */
export function juntarConTexto(zonas, textos, w, h, { margen = 10 } = {}) {
  const lista = zonas.map(z => ({ ...z, textos: [] }));
  for (const t of textos) {
    const dentro = lista.find(z => t.x < z.x2 && z.x < t.x2 && t.y < z.y2 && z.y < t.y2);
    if (dentro) {
      dentro.textos.push(t);
      if (t.tipo === 'modificado') dentro.tipo = 'modificado';
      dentro.x = Math.min(dentro.x, t.x - margen); dentro.y = Math.min(dentro.y, t.y - margen);
      dentro.x2 = Math.max(dentro.x2, t.x2 + margen); dentro.y2 = Math.max(dentro.y2, t.y2 + margen);
    } else {
      lista.push({ x: Math.max(0, t.x - margen), y: Math.max(0, t.y - margen), x2: Math.min(w, t.x2 + margen), y2: Math.min(h, t.y2 + margen),
        pixeles: 0, quitados: 0, anadidos: 0, tipo: t.tipo, textos: [t] });
    }
  }
  const banda = Math.max(1, h / 8);
  lista.sort((p, q) => (Math.floor(p.y / banda) - Math.floor(q.y / banda)) || (p.x - q.x));
  return lista.map((z, i) => ({ ...z, n: i + 1, w: z.x2 - z.x, h: z.y2 - z.y, lugar: lugarEnLaHoja(z, w, h) }));
}

/** «21.35 → 24.60», «añadido: CR-05», «quitado: N.T.»: lo que se dice de un cambio de texto, corto. */
export function textoDelCambio(t, tope = 40) {
  const corto = (x) => (x && x.length > tope ? `${x.slice(0, tope - 1)}…` : x);
  if (t.tipo === 'modificado') return `${corto(t.antes)} → ${corto(t.despues)}`;
  if (t.tipo === 'añadido') return `+ ${corto(t.despues)}`;
  return `− ${corto(t.antes)}`;
}

/** «Añadido», «Quitado» o «Modificado» (hay de las dos), con un 85 % para llamarlo de un solo lado. */
export function tipoDeCambio(z) {
  const total = z.quitados + z.anadidos;
  if (!total) return 'modificado';
  if (z.anadidos / total >= 0.85) return 'añadido';
  if (z.quitados / total >= 0.85) return 'quitado';
  return 'modificado';
}

/** Dónde está en la hoja, en tercios: «arriba a la izquierda», «al centro», «abajo a la derecha»… */
export function lugarEnLaHoja(z, w, h) {
  const cx = (z.x + z.x2) / 2 / w, cy = (z.y + z.y2) / 2 / h;
  const v = cy < 1 / 3 ? 'arriba' : cy > 2 / 3 ? 'abajo' : '';
  const hz = cx < 1 / 3 ? 'a la izquierda' : cx > 2 / 3 ? 'a la derecha' : '';
  if (!v && !hz) return 'al centro';
  if (!v) return `al centro, ${hz}`;
  if (!hz) return `${v}, al centro`;
  return `${v} ${hz}`;
}

/**
 * El contorno de NUBE de una caja (festones hacia fuera), como la nube de revisión del lector.
 * Se recorre en el sentido de las agujas del reloj: con el eje y hacia abajo, `sweep = 1` abomba hacia fuera.
 */
export function nubeDeCaja(x, y, w, h, radio = null) {
  const r = radio || Math.max(6, Math.min(24, Math.min(w, h) / 5));
  const lados = [[x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]];
  let d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
  for (const [ax, ay, bx, by] of lados) {
    const largo = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(largo / (2 * r)));
    const paso = largo / n;
    for (let k = 1; k <= n; k++) {
      const px = ax + ((bx - ax) * k) / n, py = ay + ((by - ay) * k) / n;
      d += ` A${(paso / 2).toFixed(1)} ${(paso / 2).toFixed(1)} 0 0 1 ${px.toFixed(1)} ${py.toFixed(1)}`;
    }
  }
  return `${d} Z`;
}

/** La vista que encuadra una caja en un visor de vw × vh, con aire, sin pasar de `maximo`. */
export function encuadrar(caja, vw, vh, { aire = 0.18, maximo = 3, minimo = 0.05 } = {}) {
  const s = Math.max(minimo, Math.min(maximo, Math.min(vw / (caja.w * (1 + 2 * aire)), vh / (caja.h * (1 + 2 * aire)))));
  return { s, x: vw / 2 - (caja.x + caja.w / 2) * s, y: vh / 2 - (caja.y + caja.h / 2) * s };
}

/** Zoom anclado en un punto de la pantalla (el cursor): lo que está bajo él no se mueve. */
export function zoomEn(vista, px, py, factor, { minimo = 0.05, maximo = 8 } = {}) {
  const s = Math.max(minimo, Math.min(maximo, vista.s * factor));
  const k = s / vista.s;
  return { s, x: px - (px - vista.x) * k, y: py - (py - vista.y) * k };
}
