// Banco de lib/encuadreCamara.js — node frontend-react/pruebas/encuadreCamara.prueba.mjs
import * as E from '../src/lib/encuadreCamara.js';

let total = 0, fallos = 0;
const ok = (nombre, cond) => { total++; if (!cond) fallos++; console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${nombre}`); };
const titulo = t => { console.log(''); console.log(t); };
const cerca = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;

// El caso medido en el banco: lienzo 48–812 px de alto, 2.048 de ancho, panel
// de Inventory desde 572 px hasta abajo.
const LIENZO = { left: 0, top: 48, right: 2048, bottom: 812 };
const PANEL = { left: 0, top: 572, right: 2048, bottom: 852 };

console.log('\nZONA LIBRE');
let z = E.zonaLibre(LIENZO, [PANEL]);
ok('el panel de abajo recorta por abajo (572 − 48 = 524)', z.arriba === 0 && z.abajo === 524 && z.izq === 0 && z.der === 2048);
ok('sin paneles, el lienzo entero', JSON.stringify(E.zonaLibre(LIENZO, [])) === JSON.stringify({ izq: 0, arriba: 0, der: 2048, abajo: 764 }));
ok('un panel fuera del lienzo no recorta', E.zonaLibre(LIENZO, [{ left: 0, top: 820, right: 2048, bottom: 900 }]).abajo === 764);
z = E.zonaLibre(LIENZO, [{ left: 1700, top: 48, right: 2048, bottom: 812 }]);
ok('un panel lateral a la derecha recorta por la derecha', z.der === 1700 && z.abajo === 764);
z = E.zonaLibre(LIENZO, [{ left: 0, top: 48, right: 2048, bottom: 100 }]);
ok('una barra arriba recorta por arriba', z.arriba === 52 && z.abajo === 764);
ok('un panel casi maximizado no deja una rendija: lienzo entero', E.zonaLibre(LIENZO, [{ left: 0, top: 150, right: 2048, bottom: 852 }]).abajo === 764);
ok('un botón pequeño encima no recorta', E.zonaLibre(LIENZO, [{ left: 900, top: 700, right: 1000, bottom: 740 }]).abajo === 764);

console.log('\nENCUADRE');
const lienzo = { ancho: 2048, alto: 764 };
const libre = E.zonaLibre(LIENZO, [PANEL]);
const camaraIso = { direccion: [-1, 1, -1], arriba: [-0.408, 0.408, 0.816], fovVertical: 53.13 };
const centro = [28934, 35512, 373];
let v = E.vistaDeEncuadre({ centro, radio: 330, ...camaraIso, lienzo, libre });
let p = E.proyectar(centro, v, lienzo);
ok('el centro del elemento cae en el centro de la zona libre', cerca(p[0], 1024) && cerca(p[1], 262));
const d = [v.objetivo[0] - v.posicion[0], v.objetivo[1] - v.posicion[1], v.objetivo[2] - v.posicion[2]];
const l = Math.hypot(...d);
ok('no gira la vista: misma dirección', cerca(d[0] / l, -1 / Math.sqrt(3), 1e-9) && cerca(d[2] / l, -1 / Math.sqrt(3), 1e-9));
// El diámetro, en px, ocupa el 60 % del lado corto de la zona libre (524 px).
const arribaP = v.arriba;
const sup = E.proyectar(centro.map((c, i) => c + arribaP[i] * 330), v, lienzo);
const inf = E.proyectar(centro.map((c, i) => c - arribaP[i] * 330), v, lienzo);
ok('el diámetro ocupa el 60 % del alto libre', cerca(inf[1] - sup[1], 0.6 * 524, 1));
ok('el elemento entero queda por encima del panel', inf[1] < 524 && sup[1] > 0);

v = E.vistaDeEncuadre({ centro, radio: 330, ...camaraIso, lienzo, libre: { izq: 0, arriba: 0, der: 2048, abajo: 764 } });
ok('sin paneles, mira al centro del elemento', v.objetivo.every((c, i) => cerca(c, centro[i], 1e-6)));

const pieza = E.vistaDeEncuadre({ centro, radio: 6, ...camaraIso, lienzo, libre, radioMinimo: 500 });
const grande = E.vistaDeEncuadre({ centro, radio: 500, ...camaraIso, lienzo, libre });
ok('una pieza diminuta se enseña con el contexto mínimo', cerca(pieza.distancia, grande.distancia, 1e-6));
ok('una pieza mayor que el mínimo no se ve afectada', E.vistaDeEncuadre({ centro, radio: 900, ...camaraIso, lienzo, libre, radioMinimo: 500 }).distancia > grande.distancia);

const estrecha = E.vistaDeEncuadre({ centro, radio: 330, ...camaraIso, lienzo, libre: { izq: 0, arriba: 0, der: 400, abajo: 764 } });
const izq = E.proyectar(centro.map((c, i) => c - estrecha.arriba[i] * 0), estrecha, lienzo);
ok('en una zona libre estrecha manda el ancho', estrecha.distancia > E.vistaDeEncuadre({ centro, radio: 330, ...camaraIso, lienzo, libre: { izq: 0, arriba: 0, der: 2048, abajo: 764 } }).distancia && cerca(izq[0], 200));

console.log('\nCUALQUIER VISTA');
let todasBien = true;
for (let i = 0; i < 200; i++) {
    const dir = [Math.sin(i) * 3, Math.cos(i * 1.7) * 2, -1 - (i % 5)];
    const up0 = [0, 0, 1];
    const c = [i * 1000, -i * 333, i % 7];
    const vi = E.vistaDeEncuadre({ centro: c, radio: 50 + i, direccion: dir, arriba: up0, fovVertical: 45, lienzo, libre });
    const pi = E.proyectar(c, vi, lienzo);
    if (!(cerca(pi[0], 1024, 1e-3) && cerca(pi[1], 262, 1e-3)) || !vi.posicion.every(Number.isFinite)) todasBien = false;
}
ok('200 direcciones de cámara: el centro siempre en el centro libre', todasBien);

titulo('CONJUNTO REPARTIDO (ajuste a lo que se ve, no a la esfera)');
// Cuatro losas de Drenaje en 45 × 35 m (medidas el 24-oct-2026), muy planas, vistas en diagonal.
const losas = [];
for (const [cx, cy] of [[0, 0], [45000, -23000], [-4500, 11000], [-12000, 600]]) {
    for (const X of [cx - 3500, cx + 3500]) for (const Y of [cy - 3000, cy + 3000]) for (const Z of [0, 250]) losas.push([X, Y, Z]);
}
const conPuntos = E.vistaDeEncuadre({ ...camaraIso, lienzo, libre, ocupacion: 0.75, puntos: losas });
let radioEsfera = 0;
const medio = losas.reduce((m, q) => m.map((c, i) => c + q[i] / losas.length), [0, 0, 0]);
for (const q of losas) radioEsfera = Math.max(radioEsfera, Math.hypot(q[0] - medio[0], q[1] - medio[1], q[2] - medio[2]));
const conEsfera = E.vistaDeEncuadre({ centro: medio, radio: radioEsfera, ...camaraIso, lienzo, libre, ocupacion: 0.75 });
ok('se acerca más que con la esfera', conPuntos.distancia < conEsfera.distancia * 0.8);
const px = losas.map(q => E.proyectar(q, conPuntos, lienzo));
const anchoPx = Math.max(...px.map(q => q[0])) - Math.min(...px.map(q => q[0]));
const altoPx = Math.max(...px.map(q => q[1])) - Math.min(...px.map(q => q[1]));
ok('el conjunto llena el 75 % de la zona libre en el eje que manda, sin salirse', cerca(Math.max(anchoPx / (0.75 * 2048), altoPx / (0.75 * 524)), 1, 0.01));
const cxPx = (Math.max(...px.map(q => q[0])) + Math.min(...px.map(q => q[0]))) / 2;
const cyPx = (Math.max(...px.map(q => q[1])) + Math.min(...px.map(q => q[1]))) / 2;
ok('el rectángulo del conjunto queda centrado en la zona libre', cerca(cxPx, 1024, 1) && cerca(cyPx, 262, 1));
const unPunto = E.vistaDeEncuadre({ ...camaraIso, lienzo, libre, ocupacion: 0.75, puntos: [centro], radioMinimo: 500 });
ok('un solo punto se enseña con el contexto mínimo', Number.isFinite(unPunto.distancia) && unPunto.distancia > 0);

console.log(`\n${total - fallos}/${total} ${fallos ? 'CON FALLOS' : 'en verde'}\n`);
process.exit(fallos ? 1 : 0);
