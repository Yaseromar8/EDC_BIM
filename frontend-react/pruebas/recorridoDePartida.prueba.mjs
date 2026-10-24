// Banco de lib/recorridoDePartida.js — node frontend-react/pruebas/marcasDeSeleccion.prueba.mjs
import { gruposPorTramos, MAX_PIEZAS_SUELTAS } from '../src/lib/recorridoDePartida.js';

let total = 0, fallos = 0;
const ok = (nombre, cond) => { total++; if (!cond) fallos++; console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${nombre}`); };

const M = 1000;                       // el modelo está en mm
// Acero de un canal continuo de 700 m (una barra cada 0,2 m) y de cinco buzones de 3 × 3 m.
const centros = [];
for (let x = 0; x < 700 * M; x += 0.2 * M) centros.push([x, 0, 0]);
const enCanal = centros.length;
for (const bx of [50, 180, 320, 470, 640]) for (let i = 0; i < 60; i++) centros.push([bx * M + (i % 6) * 0.5 * M, 40 * M + Math.floor(i / 6) * 0.3 * M, 500]);
centros.push(null);                   // una pieza sin geometría

const t0 = performance.now();
const grupos = gruposPorTramos(centros, 15 * M);
const ms = performance.now() - t0;

ok(`${centros.length - 1} piezas: rápido (${ms.toFixed(1)} ms)`, ms < 200);
ok('el canal continuo se recorre por tramos de 15 m (47), no en un solo grupo', grupos.filter(g => g.every(i => i < enCanal)).length === 47);
ok('cada buzón cae en un tramo propio', grupos.filter(g => g.every(i => i >= enCanal)).length === 5);
ok('ninguna pieza se pierde ni se repite (la sin geometría queda fuera)', grupos.flat().length === centros.length - 1 && new Set(grupos.flat()).size === centros.length - 1);
const primeros = grupos.map(g => Math.min(...g.map(i => centros[i][0])));
ok('ordenados a lo largo de la obra', primeros.every((x, i) => i === 0 || x >= primeros[i - 1] - 15 * M));
ok('el umbral de piezas sueltas es razonable', MAX_PIEZAS_SUELTAS >= 20 && MAX_PIEZAS_SUELTAS <= 100);

console.log('');
console.log(fallos ? `${fallos} de ${total} FALLAN` : `${total}/${total} en verde`);
process.exit(fallos ? 1 : 0);
