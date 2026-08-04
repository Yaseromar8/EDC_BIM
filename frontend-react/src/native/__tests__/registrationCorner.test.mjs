// Prueba numerica de la calibracion POR ESQUINA (dos muros + piso).
//
//   node src/native/__tests__/registrationCorner.test.mjs
//
// Se ejecuta en Node. La geometria del registro es lo unico del AR que se puede
// verificar sin tablet ni salir a obra, y conviene tenerla clavada antes de
// construir interfaz encima.
import { solveCorner, cornerPoint } from '../registrationCorner.js';

let fallos = 0;
const ok = (cond, txt, extra = '') => {
  if (!cond) fallos++;
  console.log('  %s %s %s', cond ? 'OK  ' : 'FALLA', txt, extra);
};

function rot(ax, ay, az) {
  const c = Math.cos, s = Math.sin;
  const Rx = [[1, 0, 0], [0, c(ax), -s(ax)], [0, s(ax), c(ax)]];
  const Ry = [[c(ay), 0, s(ay)], [0, 1, 0], [-s(ay), 0, c(ay)]];
  const Rz = [[c(az), -s(az), 0], [s(az), c(az), 0], [0, 0, 1]];
  const mul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((t, v, k) => t + v * B[k][j], 0)));
  return mul(mul(Rz, Ry), Rx);
}
const ap = (R, v) => [
  R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2],
  R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
  R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2],
];

/** Genera los 3 planos del mundo aplicando (R,t) a los del modelo (en metros). */
function mundoDesde(modelo, R, t, s) {
  return modelo.map((q) => ({
    n: ap(R, q.n),
    p: ap(R, [q.p[0] * s, q.p[1] * s, q.p[2] * s]).map((v, i) => v + t[i]),
  }));
}

// Rincón canónico en el modelo, en MILÍMETROS (Z arriba): piso + dos muros.
const RINCON_MM = [
  { n: [0, 0, 1], p: [0, 0, 0] },        // piso
  { n: [1, 0, 0], p: [0, 0, 0] },        // muro A
  { n: [0, 1, 0], p: [0, 0, 0] },        // muro B
];

console.log('=== 1. Rincon exacto, modelo en mm ===');
{
  const R = rot(0, 0, 1.2), t = [14.5, -7.25, 0.6];
  const mundo = mundoDesde(RINCON_MM, R, t, 0.001);
  const r = solveCorner(RINCON_MM, mundo, { escala: 1000 });
  ok(r.ok, 'resuelve');
  ok(r.rmsAngle < 1e-6, 'sin desajuste angular', 'ang=' + r.rmsAngle.toExponential(2) + ' grados');
  const err = Math.max(...r.t.map((v, i) => Math.abs(v - t[i])));
  ok(err < 1e-9, 'traslacion exacta', 'err=' + err.toExponential(2));
}

console.log('=== 2. Normales VOLTEADAS (el modelo y ARCore no coinciden en sentido) ===');
{
  const R = rot(0, 0, -0.8), t = [3, 9, 0.2];
  const mundo = mundoDesde(RINCON_MM, R, t, 0.001);
  // ARCore da dos de las normales al reves — pasa constantemente
  mundo[1].n = mundo[1].n.map((v) => -v);
  mundo[2].n = mundo[2].n.map((v) => -v);
  const r = solveCorner(RINCON_MM, mundo, { escala: 1000 });
  ok(r.ok && r.rmsAngle < 1e-6, 'el volteo de normales no rompe nada', 'ang=' + r.rmsAngle.toExponential(2));
  const err = Math.max(...r.t.map((v, i) => Math.abs(v - t[i])));
  ok(err < 1e-8, 'traslacion sigue exacta', 'err=' + err.toExponential(2));
}

console.log('=== 3. Rincon inclinado (canal trapezoidal: dos taludes + fondo) ===');
{
  const modelo = [
    { n: [0, 0, 1], p: [0, 0, 0] },                                  // fondo
    { n: [0.6, 0, 0.8], p: [-1200, 0, 0] },                          // talud izq
    { n: [-0.5, 0.3, 0.81], p: [1500, 0, 0] },                       // talud der
  ];
  const R = rot(0.05, -0.03, 2.1), t = [-22.4, 61.8, 1.4];
  const mundo = mundoDesde(modelo, R, t, 0.001);
  const r = solveCorner(modelo, mundo, { escala: 1000 });
  ok(r.ok, 'resuelve un rincon no ortogonal');
  ok(r.rmsAngle < 1e-6, 'sin desajuste angular', 'ang=' + r.rmsAngle.toExponential(2));
}

console.log('=== 4. Ruido realista al detectar los planos (1 cm y 1 grado) ===');
{
  const R = rot(0, 0, 0.9), t = [8, 2, 0.3];
  const mundo = mundoDesde(RINCON_MM, R, t, 0.001);
  // ARCore estima cada plano con algo de error: se desplaza y se inclina un poco
  const g = 1 * Math.PI / 180;
  mundo[0].p = mundo[0].p.map((v, i) => v + [0.008, -0.006, 0.011][i]);
  mundo[1].n = ap(rot(0, g, 0), mundo[1].n);
  mundo[2].n = ap(rot(g, 0, 0), mundo[2].n);
  const r = solveCorner(RINCON_MM, mundo, { escala: 1000 });
  ok(r.ok, 'resuelve con ruido');
  // Lo importante: el desajuste angular SI refleja el ruido inyectado (1 grado).
  ok(r.rmsAngle > 0.2 && r.rmsAngle < 2, 'el angulo delata el ruido', 'ang=' + r.rmsAngle.toFixed(2) + ' grados');
  ok(r.errorA(30) > 0.1, 'y se traduce a desviacion a 30 m', '= ' + (r.errorA(30) * 100).toFixed(0) + ' cm');
}

console.log('=== 5. Casos que DEBEN rechazarse ===');
{
  // Dos muros PARALELOS + piso: no es un rincon, falta una direccion
  const malo = [
    { n: [0, 0, 1], p: [0, 0, 0] },
    { n: [1, 0, 0], p: [0, 0, 0] },
    { n: [1, 0, 0], p: [2000, 0, 0] },
  ];
  const mundo = mundoDesde(malo, rot(0, 0, 0.4), [1, 1, 0], 0.001);
  const r = solveCorner(malo, mundo, { escala: 1000 });
  ok(!r.ok, 'rechaza dos muros paralelos', r.motivo || '');

  const pocos = solveCorner(RINCON_MM.slice(0, 2), [{ n: [0, 0, 1], p: [0, 0, 0] }]);
  ok(!pocos.ok, 'rechaza si no son 3 caras', pocos.motivo || '');
}

console.log('=== 6. El punto de la esquina se calcula bien ===');
{
  const R = rot(0, 0, 0.6), t = [5, -4, 0.75];
  const mundo = mundoDesde(RINCON_MM, R, t, 0.001);
  const c = cornerPoint(mundo);
  const err = Math.max(...c.map((v, i) => Math.abs(v - t[i])));
  ok(err < 1e-9, 'la esquina cae donde debe', 'err=' + err.toExponential(2));
}

console.log('=== 7. Caso de obra: buzon rectangular, camara a 1.5 m ===');
{
  // Buzon de 1.2 x 1.0 m en el modelo (mm). Piso + dos paredes interiores.
  const buzon = [
    { n: [0, 0, 1], p: [600, 500, -1800] },        // fondo del buzon
    { n: [1, 0, 0], p: [0, 500, -900] },           // pared corta
    { n: [0, 1, 0], p: [600, 0, -900] },           // pared larga
  ];
  const R = rot(0, 0, 2.7), t = [-140.2, 78.5, 0.9];
  const mundo = mundoDesde(buzon, R, t, 0.001);
  // ARCore: 1.5 cm de error de posicion y 0.8 grados de inclinacion por plano
  const g = 0.8 * Math.PI / 180;
  mundo[0].p = mundo[0].p.map((v, i) => v + [0.012, -0.009, 0.015][i]);
  mundo[1].n = ap(rot(0, g, 0), mundo[1].n);
  mundo[2].n = ap(rot(g, 0, 0), mundo[2].n);
  const r = solveCorner(buzon, mundo, { escala: 1000 });
  ok(r.ok, 'resuelve el buzon');
  ok(r.rmsAngle < 1.5, 'desajuste angular por debajo de 1.5 grados', 'ang=' + r.rmsAngle.toFixed(2));
  console.log('     -> desviacion esperable a 30 m: %s cm', (r.errorA(30) * 100).toFixed(0));
}

console.log('\n%s', fallos === 0 ? 'TODAS LAS PRUEBAS PASAN' : fallos + ' PRUEBA(S) FALLAN');
process.exit(fallos === 0 ? 0 : 1);
