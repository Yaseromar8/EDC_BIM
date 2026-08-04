// Pruebas de la calibración por esquina.
//
// La prueba clave es de IDA Y VUELTA: se elige una colocación conocida (un giro
// y un origen), se fabrican las caras del modelo aplicándole esa colocación a
// las caras reales, y se comprueba que la calibración recupera exactamente los
// números de partida. Si el convenio de signos o de ejes estuviera mal, esto
// falla — y el signo es justo donde se pierden las tardes en campo, porque un
// modelo girado 90° parece "casi bien" hasta que caminas diez metros.

import assert from 'node:assert/strict';
import test from 'node:test';
import { calibrarPorEsquina, arAVisor, giraZ } from '../arCornerCalib.js';

// El observador está DENTRO del rincón (x>0, y>0, z>0 en ejes de ARCore): es
// donde se planta el operario para apuntar a las tres caras.
const OBS_MUNDO = [1, 1.5, 1];

const rad = (g) => (g * Math.PI) / 180;

// Rincón real medido por ARCore (Y arriba, metros): piso y dos muros.
const MUNDO = [
  { n: [0, 1, 0], p: [0, 0, 0] },       // piso
  { n: [1, 0, 0], p: [0, 0, 0] },       // muro que mira a +X
  { n: [0, 0, 1], p: [0, 0, 0] },       // muro que mira a +Z
];

/** Dónde cae el observador dentro del modelo con esa misma colocación. */
function obsModelo(yawGrados, origen, upm) {
  const v = giraZ(arAVisor(OBS_MUNDO), -rad(yawGrados));
  return [v[0] * upm + origen.x, v[1] * upm + origen.y, v[2] * upm + origen.z];
}

/** Aplica una colocación conocida a las caras reales para fabricar las del modelo. */
function fabricarModelo(mundo, yawGrados, origen, upm) {
  const y = rad(yawGrados);
  return mundo.map((q) => {
    const n = giraZ(arAVisor(q.n), -y);
    const pv = giraZ(arAVisor(q.p), -y);
    return {
      n,
      p: [pv[0] * upm + origen.x, pv[1] * upm + origen.y, pv[2] * upm + origen.z],
    };
  });
}

test('recupera el giro y el origen de una colocación conocida', () => {
  const upm = 1000;                       // modelo en milímetros
  const yaw = 37;
  const origen = { x: 12345, y: -6789, z: 250 };
  const modelo = fabricarModelo(MUNDO, yaw, origen, upm);

  const r = calibrarPorEsquina(modelo, MUNDO, {
    upm, obsMundo: OBS_MUNDO, obsModelo: obsModelo(yaw, origen, upm),
  });
  assert.equal(r.ok, true, r.motivo);
  assert.ok(Math.abs(r.yaw - yaw) < 0.01, `giro ${r.yaw} != ${yaw}`);
  assert.ok(Math.abs(r.modelOrigin.x - origen.x) < 0.5, `x ${r.modelOrigin.x}`);
  assert.ok(Math.abs(r.modelOrigin.y - origen.y) < 0.5, `y ${r.modelOrigin.y}`);
  assert.ok(Math.abs(r.modelOrigin.z - origen.z) < 0.5, `z ${r.modelOrigin.z}`);
  assert.ok(r.discrepanciaMuros < 0.01);
});

test('el rincón junto a ±180° no rompe el promedio de los dos muros', () => {
  const upm = 1;
  for (const yaw of [179, -179, 180, 0, 90, -90]) {
    const modelo = fabricarModelo(MUNDO, yaw, { x: 0, y: 0, z: 0 }, upm);
    const r = calibrarPorEsquina(modelo, MUNDO, {
      upm, obsMundo: OBS_MUNDO, obsModelo: obsModelo(yaw, { x: 0, y: 0, z: 0 }, upm),
    });
    assert.equal(r.ok, true, `giro ${yaw}: ${r.motivo}`);
    // 180 y −180 son el mismo giro: se compara por el coseno del error.
    const err = Math.abs(Math.atan2(Math.sin(rad(r.yaw - yaw)), Math.cos(rad(r.yaw - yaw))));
    assert.ok(err < rad(0.01), `giro ${yaw} -> ${r.yaw}`);
  }
});

test('no importa el orden de captura ni hacia dónde miren las normales', () => {
  const upm = 1000;
  const yaw = -22;
  const origen = { x: 500, y: 500, z: 0 };
  const modelo = fabricarModelo(MUNDO, yaw, origen, upm);

  // El operario captura en otro orden y con normales hacia el otro lado.
  const revuelto = [MUNDO[2], MUNDO[0], MUNDO[1]].map((q, i) => (
    i === 0 ? { n: q.n.map((c) => -c), p: q.p } : q
  ));

  const r = calibrarPorEsquina(modelo, revuelto, {
    upm, obsMundo: OBS_MUNDO, obsModelo: obsModelo(yaw, origen, upm),
  });
  assert.equal(r.ok, true, r.motivo);
  assert.ok(Math.abs(r.yaw - yaw) < 0.01, `giro ${r.yaw} != ${yaw}`);
  assert.ok(Math.abs(r.modelOrigin.x - origen.x) < 0.5);
});

test('se niega si los dos muros son casi paralelos', () => {
  const upm = 1;
  const casiParalelo = [
    { n: [0, 1, 0], p: [0, 0, 0] },
    { n: [1, 0, 0], p: [0, 0, 0] },
    { n: [1, 0, 0.08], p: [0, 0, -2] },
  ];
  const modelo = fabricarModelo(MUNDO, 10, { x: 0, y: 0, z: 0 }, upm);
  const r = calibrarPorEsquina(modelo, casiParalelo, {
    upm, obsMundo: OBS_MUNDO, obsModelo: obsModelo(10, { x: 0, y: 0, z: 0 }, upm),
  });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /paralelos/);
});

test('se niega si no hay piso', () => {
  const upm = 1;
  const sinPiso = [
    { n: [1, 0, 0], p: [0, 0, 0] },
    { n: [0, 0, 1], p: [0, 0, 0] },
    { n: [0.7, 0, 0.7], p: [0, 0, 0] },
  ];
  const modelo = fabricarModelo(MUNDO, 0, { x: 0, y: 0, z: 0 }, upm);
  const r = calibrarPorEsquina(modelo, sinPiso, {
    upm, obsMundo: OBS_MUNDO, obsModelo: obsModelo(0, { x: 0, y: 0, z: 0 }, upm),
  });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /piso|muros/);
});

test('avisa cuando las caras no casan del todo, pero resuelve', () => {
  const upm = 1000;
  const modelo = fabricarModelo(MUNDO, 15, { x: 0, y: 0, z: 0 }, upm);
  // Un muro real capturado con 8° de error, como pasa apuntando deprisa.
  const torcido = MUNDO.map((q, i) => (
    i === 2 ? { n: [Math.sin(rad(8)), 0, Math.cos(rad(8))], p: q.p } : q
  ));
  const r = calibrarPorEsquina(modelo, torcido, {
    upm, obsMundo: OBS_MUNDO, obsModelo: obsModelo(15, { x: 0, y: 0, z: 0 }, upm),
  });
  assert.equal(r.ok, true, r.motivo);
  assert.ok(r.discrepanciaMuros > 5 && r.discrepanciaMuros < 20, `${r.discrepanciaMuros}`);
  assert.ok(r.avisos.some((a) => /no coinciden/.test(a)));
  // El error se traduce a lo que se ve en obra: centímetros a 10 metros.
  assert.ok(r.errorA10m > 0.5, `${r.errorA10m}`);
});

test('el error angular se traduce a desvío a 10 m', () => {
  const upm = 1;
  const modelo = fabricarModelo(MUNDO, 0, { x: 0, y: 0, z: 0 }, upm);
  const r = calibrarPorEsquina(modelo, MUNDO, {
    upm, obsMundo: OBS_MUNDO, obsModelo: obsModelo(0, { x: 0, y: 0, z: 0 }, upm),
  });
  assert.ok(r.errorA10m < 0.01, `un rincón perfecto no puede tener error: ${r.errorA10m}`);
});

test('sin las posiciones de cámara se niega en vez de adivinar', () => {
  // Un rincón de 90° admite DOS emparejamientos igual de consistentes. Sin el
  // dato que desempata, resolver "lo mejor posible" acierta la mitad de las
  // veces — y la mitad mala sale girada 90°. Negarse es lo correcto.
  const modelo = fabricarModelo(MUNDO, 45, { x: 0, y: 0, z: 0 }, 1);
  const r = calibrarPorEsquina(modelo, MUNDO, { upm: 1 });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /cámara/);
});
