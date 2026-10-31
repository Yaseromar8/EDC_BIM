// Miniatura de un tablero (docs/visor/58): un SVG pequeño de rectángulos —secciones, notas con su color y textos
// como líneas— y el trazado de las formas (docs/visor/60), que el navegador genera al guardar y la lista enseña como
// imagen, como las de ACC. Solo rectángulos y trazados con números y colores conocidos: el servidor rechaza lo demás.
import { COLORES_NOTA } from './notas.js';
import { trazadoDe, colorForma, grosorForma, trazadoDeFlecha, trazadoDeTrazo } from './formas.js';

const ANCHO = 160, ALTO = 100, MAX = 300;
const n = (v) => Math.round(v * 10) / 10;

export function miniaturaSvg(contenido) {
  const secciones = (contenido?.secciones || []).slice(0, MAX), notas = (contenido?.notas || []).slice(0, MAX);
  const todo = [...secciones, ...notas];
  if (!todo.length) return '';
  const x1 = Math.min(...todo.map(c => c.x)), y1 = Math.min(...todo.map(c => c.y));
  const x2 = Math.max(...todo.map(c => c.x + c.w)), y2 = Math.max(...todo.map(c => c.y + c.h));
  const m = 0.06 * Math.max(x2 - x1, y2 - y1, 1);
  const w = x2 - x1 + 2 * m, h = y2 - y1 + 2 * m;
  const k = Math.min(ANCHO / w, ALTO / h);
  const ox = (ANCHO - w * k) / 2 - (x1 - m) * k, oy = (ALTO - h * k) / 2 - (y1 - m) * k;
  const r = (c, extra) => `<rect x="${n(c.x * k + ox)}" y="${n(c.y * k + oy)}" width="${n(Math.max(c.w * k, 0.6))}" height="${n(Math.max(c.h * k, 0.6))}" ${extra}/>`;
  const partes = [
    ...secciones.map(f => r(f, 'rx="1.5" fill="#F1F0E8" stroke="#D9D7CD" stroke-width="0.6"')),
    ...notas.map(c => (c.tipo === 'flecha' || c.tipo === 'trazo'
      ? `<path d="${c.tipo === 'flecha' ? trazadoDeFlecha(c) : trazadoDeTrazo(c)}" transform="translate(${n(c.x * k + ox)} ${n(c.y * k + oy)}) scale(${k.toPrecision(4)})" fill="none" stroke="${colorForma(c)}" stroke-width="${n(Math.max(grosorForma(c), 0.6 / k))}"/>`
      : c.tipo === 'forma'
      ? `<path d="${trazadoDe(c.forma, c.w, c.h, grosorForma(c))}" transform="translate(${n(c.x * k + ox)} ${n(c.y * k + oy)}) scale(${k.toPrecision(4)})" fill="${c.relleno === 'solido' || c.relleno === 'suave' ? colorForma(c) : 'none'}"${c.relleno === 'suave' ? ' fill-opacity="0.16"' : ''} stroke="${colorForma(c)}" stroke-width="${n(Math.max(grosorForma(c), 0.6 / k))}"/>`
      : c.tipo === 'texto'
      ? r({ x: c.x, y: c.y + c.h * 0.3, w: c.w, h: c.h * 0.4 }, 'rx="0.6" fill="#72706B" fill-opacity="0.55"')
      : c.tipo === 'nota' || !c.tipo
        ? r(c, `rx="0.8" fill="${COLORES_NOTA[c.color] || COLORES_NOTA.amarillo}"`)
        // un documento u otro tipo registrado: hoja blanca con borde
        : r(c, 'rx="0.8" fill="#FFFFFF" stroke="#B0AEA5" stroke-width="0.6"'))),
  ];
  // El servidor admite hasta 24.000 caracteres: con tableros enormes se dibuja lo que cabe (secciones primero).
  let cuerpo = '';
  for (const parte of partes) { if (cuerpo.length + parte.length > 23000) break; cuerpo += parte; }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ANCHO} ${ALTO}" width="${ANCHO}" height="${ALTO}">${cuerpo}</svg>`;
}
