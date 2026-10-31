import { miniaturaSvg } from '../../design/lienzo/miniatura.js';
let ok = 0, n = 0;
const ver = (nombre, cond, info) => { n++; if (cond) ok++; console.log((cond ? 'PASS ' : 'FAIL ') + nombre, cond ? '' : JSON.stringify(info)); };
const nota = (i) => ({ id: 'n' + i, tipo: 'nota', x: (i % 40) * 210, y: Math.floor(i / 40) * 210, w: 200, h: 200, texto: 'x', color: 'verde' });
// La misma regla que backend/routes/tableros.py (_MINIATURA_PROHIBIDO)
const PROHIBIDO = /<\s*(script|foreignObject|iframe|object|embed|image|use|a|animate|set)\b|\bon\w+\s*=|javascript:|href\s*=|url\s*\(/i;

ver('vacío: cadena vacía (la miniatura se borra)', miniaturaSvg({ notas: [], secciones: [] }) === '', null);
const una = miniaturaSvg({ notas: [nota(0)], secciones: [] });
ver('una nota: un SVG con un rectángulo de su color', una.startsWith('<svg') && una.endsWith('</svg>') && (una.match(/<rect/g) || []).length === 1 && una.includes('#CFE6B9'), una);
const muchas = miniaturaSvg({ notas: Array.from({ length: 2000 }, (_, i) => nota(i)), secciones: [{ id: 's', x: 0, y: 0, w: 9000, h: 9000, titulo: 'S' }] });
ver('2.000 notas: cabe en el límite del servidor (24.000)', muchas.length <= 24000, muchas.length);
ver('y la sección va primero', muchas.indexOf('#F1F0E8') < muchas.indexOf('#CFE6B9'), null);
ver('sin nada que el servidor rechace', !PROHIBIDO.test(muchas) && !PROHIBIDO.test(una), null);
const texto = miniaturaSvg({ notas: [{ id: 't', tipo: 'texto', x: 0, y: 0, w: 100, h: 26, texto: 'Hola' }], secciones: [] });
ver('un texto: una línea gris', texto.includes('#72706B'), texto);
console.log(`${ok}/${n}`);
