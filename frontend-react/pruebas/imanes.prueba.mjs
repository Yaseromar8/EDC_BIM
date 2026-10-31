import { prepararImanes, imantarArrastre } from '../../design/lienzo/imanes.js';
const A = [0, 0, 100, 100], B = [300, 0, 400, 100];
const cache = prepararImanes([A, B]);
const C = [0, 300, 100, 400];     // tarjeta de 100 x 100 que arrastro
let ok = 0, n = 0;
const ver = (nombre, cond, info) => { n++; if (cond) ok++; console.log((cond ? 'PASS ' : 'FAIL ') + nombre, JSON.stringify(info)); };
// 1 · Alineación de bordes: la arrastro a x=4 (cerca de 0) en zoom 1 → se pega a x=0
let r = imantarArrastre(cache, C, 4, -297, 1);
ver('borde izquierdo se pega a 0 (umbral 8 px)', r.dx === 0, r);
// 2 · Fuera de umbral: a x=12 no se pega
r = imantarArrastre(cache, C, 12, 50, 1);
ver('a 12 px no se pega en x', r.dx === 12, { dx: r.dx });
// 3 · Mismo umbral en pantalla con zoom 0,5: 12 px de mundo = 6 px de pantalla → se pega
r = imantarArrastre(cache, C, 12, 50, 0.5);
ver('zoom 0,5: 12 px de mundo (6 de pantalla) se pega', r.dx === 0, { dx: r.dx });
// 4 · Centrado en el hueco entre A y B (hueco 100..300, centro 200 → caja 150..250): la llevo a x=146
r = imantarArrastre(cache, C, 146, -300, 1);
ver('centrado en el hueco horizontal', r.dx === 150 && r.lineas.some(l => l.tipo === 'hueco'), { dx: r.dx, dy: r.dy, lineas: r.lineas.length });
// 5 · Misma distancia: B a la derecha a 200 de A; C a la derecha de B a ~200 → x=600
r = imantarArrastre(cache, C, 595, -300, 1);
ver('repite la distancia del hueco (x=600)', r.dx === 600, { dx: r.dx });
console.log(`${ok}/${n}`);
