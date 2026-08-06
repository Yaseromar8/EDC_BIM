// Tests del ajuste Helmert 2D+cota — la matemática se prueba en la laptop,
// no en la obra. node --test georefFit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajustarHelmert, cierreDePunto } from '../georefFit.js';

const RAD = Math.PI / 180;

// Fabrica pares aplicando una transformación conocida + ruido opcional
function fabricar(puntos, { escala = 1, yawDeg = 0, tx = 0, ty = 0, tz = 0, ruido = 0 }) {
  const c = Math.cos(yawDeg * RAD), s = Math.sin(yawDeg * RAD);
  return puntos.map(([x, y, z], i) => ({
    id: 'P' + i,
    origen: [x, y, z],
    destino: [
      escala * (c * x - s * y) + tx + (ruido ? (Math.random() - 0.5) * ruido : 0),
      escala * (s * x + c * y) + ty + (ruido ? (Math.random() - 0.5) * ruido : 0),
      escala * z + tz + (ruido ? (Math.random() - 0.5) * ruido : 0),
    ],
  }));
}

const RED = [[0, 0, 0], [80, 0, 0.5], [80, 45, 1.2], [0, 45, 0.8]]; // buzones cada ~80 m

test('recupera una transformación exacta (UTM Talara, giro y pies→metros)', () => {
  const pares = fabricar(RED, { escala: 0.3048, yawDeg: 37, tx: 471250, ty: 9494310, tz: 12.5 });
  const a = ajustarHelmert(pares);
  assert.ok(a.ok);
  assert.ok(Math.abs(a.escala - 0.3048) < 1e-9, 'detecta pies: ' + a.escala);
  assert.ok(Math.abs(a.yawDeg - 37) < 1e-9);
  assert.ok(a.rms < 1e-6, 'sin ruido el residual es cero');
});

test('con 2 puntos (mínimo de campo) también cierra exacto', () => {
  const pares = fabricar(RED.slice(0, 2), { yawDeg: -84, tx: 500, ty: -200, tz: 3 });
  const a = ajustarHelmert(pares, { escalaFija: 1 });
  assert.ok(a.ok);
  assert.ok(Math.abs(a.yawDeg - (-84)) < 1e-9);
  assert.ok(a.rms < 1e-9);
});

test('escala fija NO absorbe deriva: el residual la delata', () => {
  // El mundo AR encogió 2% (deriva): con escala libre mentiría rms≈0;
  // con escala fija el rms lo GRITA.
  const pares = fabricar(RED, { escala: 0.98, yawDeg: 10 });
  const libre = ajustarHelmert(pares);
  const fija = ajustarHelmert(pares, { escalaFija: 1 });
  assert.ok(libre.rms < 1e-6);
  assert.ok(fija.rms > 0.3, 'la deriva aparece en el residual: ' + fija.rms);
});

test('ruido de puntería (±3 cm) da residual del mismo orden', () => {
  const pares = fabricar(RED, { yawDeg: 122, tx: 471000, ty: 9494000, ruido: 0.06 });
  const a = ajustarHelmert(pares, { escalaFija: 1 });
  assert.ok(a.ok);
  assert.ok(a.rms > 0.001 && a.rms < 0.12, 'rms plausible: ' + a.rms);
  assert.ok(Math.abs(a.yawDeg - 122) < 0.2, 'rumbo estable con base de 80 m');
});

test('aplicar/inversa son consistentes ida y vuelta', () => {
  const pares = fabricar(RED, { escala: 0.3048, yawDeg: 200, tx: -50, ty: 30, tz: -8 });
  const a = ajustarHelmert(pares);
  const p = [12.3, -45.6, 2.2];
  const alla = a.aplicar(p);
  const vuelta = a.inversa(alla);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(vuelta[i] - p[i]) < 1e-9);
});

test('cierre de poligonal detecta cuánto se movió el mundo', () => {
  const pares = fabricar(RED.slice(0, 3), { yawDeg: 15, tx: 100, ty: 200 });
  const a = ajustarHelmert(pares, { escalaFija: 1 });
  // Re-medición del P0 con 40 cm de deriva acumulada
  const origenDerivado = [0.35, 0.2, 0.02];
  const cierre = cierreDePunto(a, origenDerivado, pares[0].destino);
  assert.ok(cierre > 0.3 && cierre < 0.5, 'cierre ≈ deriva real: ' + cierre);
});

test('rechaza casos degenerados con mensaje claro', () => {
  assert.equal(ajustarHelmert([]).ok, false);
  assert.equal(ajustarHelmert([{ origen: [0, 0, 0], destino: [1, 1, 0] }]).ok, false);
  const mismoSitio = [
    { origen: [5, 5, 0], destino: [100, 100, 0] },
    { origen: [5, 5, 0], destino: [101, 100, 0] },
  ];
  assert.equal(ajustarHelmert(mismoSitio).ok, false);
});
