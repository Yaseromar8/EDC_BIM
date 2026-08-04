// Prueba numerica del solver de registro por 3 puntos.
//
//   node src/native/__tests__/registration3p.test.mjs
//
// Se ejecuta en Node, sin navegador ni tablet: la matematica del registro es lo
// unico de todo el AR que se puede verificar sin salir a campo, y conviene
// tenerla clavada ANTES de construir interfaz encima.
import { solveRigid, applyTransform } from '../registration3p.js';

let fallos = 0;
const ok = (cond, txt, extra = '') => {
  if (!cond) fallos++;
  console.log('  %s %s %s', cond ? 'OK  ' : 'FALLA', txt, extra);
};

function rot(ax, ay, az) {
  const ca = Math.cos, sa = Math.sin;
  const Rx = [[1, 0, 0], [0, ca(ax), -sa(ax)], [0, sa(ax), ca(ax)]];
  const Ry = [[ca(ay), 0, sa(ay)], [0, 1, 0], [-sa(ay), 0, ca(ay)]];
  const Rz = [[ca(az), -sa(az), 0], [sa(az), ca(az), 0], [0, 0, 1]];
  const mul = (A, B) => A.map((r, i) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
  return mul(mul(Rz, Ry), Rx);
}

console.log('=== 1. Transformacion conocida, sin ruido ===');
{
  const R = rot(0.0, 0.0, 0.7);          // giro en planta de 40 grados
  const t = [12.5, -3.25, 0.8];
  const src = [[0, 0, 0], [1.2, 0, 0], [0, 0.9, 0.35]];
  const dst = src.map((p) => applyTransform(R, 1, t, p));
  const r = solveRigid(src, dst);
  ok(r.ok, 'resuelve');
  ok(r.rms < 1e-9, 'residuo nulo', 'rms=' + r.rms.toExponential(2));
  const err = Math.max(...r.t.map((v, i) => Math.abs(v - t[i])));
  ok(err < 1e-9, 'traslacion exacta', 'err=' + err.toExponential(2));
}

console.log('=== 2. Giro completo en 3 ejes ===');
{
  const R = rot(0.3, -0.45, 1.9);
  const t = [-104.2, 55.9, 3.14];
  const src = [[0, 0, 0], [2, 0.5, 0], [0.4, 1.7, 1.1], [-1, 2, 0.6]];
  const dst = src.map((p) => applyTransform(R, 1, t, p));
  const r = solveRigid(src, dst);
  ok(r.rms < 1e-9, 'residuo nulo con 4 puntos', 'rms=' + r.rms.toExponential(2));
  const maxR = Math.max(...R.flatMap((row, i) => row.map((v, j) => Math.abs(v - r.R[i][j]))));
  ok(maxR < 1e-8, 'rotacion recuperada', 'err=' + maxR.toExponential(2));
}

console.log('=== 3. Con ruido de punteria (2 cm) el residuo lo DELATA ===');
{
  const R = rot(0, 0, 1.1), t = [30, 40, 1];
  const src = [[0, 0, 0], [1.5, 0, 0], [0, 1.5, 0.5]];
  const ruido = [[0.02, -0.01, 0.005], [-0.015, 0.02, -0.01], [0.01, 0.012, 0.02]];
  const dst = src.map((p, i) => applyTransform(R, 1, t, p).map((v, j) => v + ruido[i][j]));
  const r = solveRigid(src, dst);
  ok(r.ok && r.rms > 0.001 && r.rms < 0.1, 'residuo del orden del ruido', 'rms=' + r.rms.toFixed(4) + ' m');
}

console.log('=== 4. Escala (modelo en mm, mundo en m) ===');
{
  const R = rot(0, 0, 0.3), t = [5, 5, 0];
  const src = [[0, 0, 0], [1000, 0, 0], [0, 800, 300]];   // milimetros
  const dst = src.map((p) => applyTransform(R, 0.001, t, p));
  const r = solveRigid(src, dst, { estimateScale: true });
  ok(Math.abs(r.scale - 0.001) < 1e-9, 'escala estimada', 's=' + r.scale);
  ok(r.rms < 1e-9, 'residuo nulo con escala', 'rms=' + r.rms.toExponential(2));
}

console.log('=== 5. Casos que DEBEN rechazarse ===');
{
  const colineales = solveRigid([[0, 0, 0], [1, 0, 0], [2, 0, 0]], [[0, 0, 0], [1, 0, 0], [2, 0, 0]]);
  ok(!colineales.ok, 'rechaza 3 puntos en linea recta', colineales.motivo || '');
  const pocos = solveRigid([[0, 0, 0], [1, 0, 0]], [[0, 0, 0], [1, 0, 0]]);
  ok(!pocos.ok, 'rechaza menos de 3 puntos', pocos.motivo || '');
  const desparejos = solveRigid([[0, 0, 0], [1, 0, 0], [0, 1, 0]], [[0, 0, 0], [1, 0, 0]]);
  ok(!desparejos.ok, 'rechaza listas desiguales', desparejos.motivo || '');
}

console.log('=== 6. Orden CAMBIADO: el residuo debe dispararse ===');
{
  const R = rot(0, 0, 0.5), t = [10, 2, 0];
  const src = [[0, 0, 0], [2, 0, 0], [0, 2, 0.4]];
  const bien = src.map((p) => applyTransform(R, 1, t, p));
  const mal = [bien[1], bien[0], bien[2]];        // dos puntos permutados
  const r = solveRigid(src, mal);
  ok(r.rms > 0.5, 'un orden equivocado se detecta', 'rms=' + r.rms.toFixed(3) + ' m');
}

console.log('=== 7. Caso realista de obra: buzon + punto lejano ===');
{
  // Modelo en mm (Z arriba). Dos esquinas del buzon y un punto a 25 m.
  const R = rot(0, 0, 2.4), t = [-8.3, 15.7, 0.25];
  const src = [[0, 0, 0], [900, 0, 0], [24000, 6000, -400]];
  const dst = src.map((p) => applyTransform(R, 0.001, t, p));
  // 1.5 cm de error humano al tocar cada esquina
  const err = [[0.015, -0.01, 0.008], [-0.012, 0.014, -0.006], [0.02, 0.01, 0.015]];
  const medido = dst.map((p, i) => p.map((v, j) => v + err[i][j]));
  const r = solveRigid(src, medido, { estimateScale: true });
  ok(r.ok, 'resuelve el caso de obra');
  ok(Math.abs(r.scale - 0.001) / 0.001 < 0.01, 'escala dentro del 1%', 's=' + r.scale.toExponential(4));
  ok(r.rms < 0.05, 'residuo por debajo de 5 cm', 'rms=' + (r.rms * 100).toFixed(1) + ' cm');
}

console.log('\n%s', fallos === 0 ? 'TODAS LAS PRUEBAS PASAN' : fallos + ' PRUEBA(S) FALLAN');
process.exit(fallos === 0 ? 0 : 1);
