// arSim.js — Simulador de AR para desarrollar en el escritorio.
//
// POR QUÉ EXISTE: el AR se estaba depurando compilando un APK por cada cambio,
// y eso convierte una tarde en veinte instalaciones. La capa nativa es un
// SENSOR —emite poses, planos y hit-tests—, y todo lo demás (calibración,
// ajuste, interfaz, residuos) es lógica que puede vivir y probarse en el
// navegador.
//
// Este módulo produce exactamente los mismos eventos que el plugin de ARCore,
// con datos sintéticos. Con él se desarrolla y se prueba el flujo completo en
// la laptop, en segundos, y la tablet queda para lo único que solo ella puede
// hacer: validar contra el mundo real.
//
// Se activa con ?arsim=1 en el URL.
//
// La escena simulada es un RINCÓN —piso y dos muros que se cortan—, que es
// justo lo que pide la calibración por esquina.

const suscriptores = { onCameraPose: [], onTracking: [], onReticle: [], onArStats: [], onGeoPose: [] };
let temporizador = null;
let t0 = 0;
let frames = 0;

export function simActivo() {
  return typeof window !== 'undefined' && /(\?|&)arsim=1/.test(window.location.search);
}

export function simSubscribe(evento, handler) {
  const lista = suscriptores[evento];
  if (!lista) return () => {};
  lista.push(handler);
  return () => {
    const i = lista.indexOf(handler);
    if (i >= 0) lista.splice(i, 1);
  };
}

const emitir = (evento, dato) => suscriptores[evento]?.forEach((h) => { try { h(dato); } catch { /* noop */ } });

// ── Escena simulada ─────────────────────────────────────────────────────────
// Mundo de ARCore: Y arriba, metros. El rincón está en el origen.
export const SIM_PLANOS = [
  { tipo: 'piso', n: [0, 1, 0], p: [0, 0, 0] },
  { tipo: 'muro', n: [1, 0, 0], p: [-1.5, 0, 0] },
  { tipo: 'muro', n: [0, 0, 1], p: [0, 0, -2.0] },
];

/**
 * Cámara dando una vuelta lenta alrededor del rincón, a 1.6 m de altura y
 * mirando hacia él. Reproduce lo que hace un operario caminando alrededor: si
 * el modelo se queda quieto en pantalla mientras esto gira, el puente de poses
 * está bien; si se arrastra con la cámara, está mal.
 */
function poseEnSegundo(seg) {
  const a = seg * 0.25;                       // rad/s: una vuelta cada ~25 s
  const r = 3.0;
  const ojo = [Math.sin(a) * r, 1.6, Math.cos(a) * r];
  const mira = [0, 0.5, 0];

  // Base de la cámara (OpenGL: mira hacia su -Z)
  const z = normaliza([ojo[0] - mira[0], ojo[1] - mira[1], ojo[2] - mira[2]]);
  const x = normaliza(cruz([0, 1, 0], z));
  const y = cruz(z, x);

  // Matriz de VISTA = inversa de la de cámara→mundo (rotación traspuesta).
  const view = [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * ojo[0] + x[1] * ojo[1] + x[2] * ojo[2]),
    -(y[0] * ojo[0] + y[1] * ojo[1] + y[2] * ojo[2]),
    -(z[0] * ojo[0] + z[1] * ojo[1] + z[2] * ojo[2]),
    1,
  ];

  // Proyección en perspectiva equivalente a la de un móvil (~60° vertical).
  const fov = 60 * Math.PI / 180, aspecto = 9 / 16, cerca = 0.05, lejos = 2000;
  const f = 1 / Math.tan(fov / 2);
  const proj = [
    f / aspecto, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (lejos + cerca) / (cerca - lejos), -1,
    0, 0, (2 * lejos * cerca) / (cerca - lejos), 0,
  ];
  return { view, proj };
}

const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normaliza = (v) => {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
};

export function simStart() {
  if (temporizador) return;
  t0 = performance.now();
  frames = 0;

  // Se tarda unos segundos en "reconocer", como ARCore de verdad: así la
  // interfaz de espera también se prueba, en vez de saltársela siempre.
  emitir('onTracking', { state: 'paused' });
  setTimeout(() => emitir('onTracking', { state: 'tracking' }), 2500);

  temporizador = setInterval(() => {
    const seg = (performance.now() - t0) / 1000;
    frames++;
    if (seg > 2.5) {
      emitir('onCameraPose', poseEnSegundo(seg));
      // El retículo encuentra piso en cuanto hay seguimiento.
      emitir('onReticle', {
        found: true, type: 'plane', planes: 1,
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      });
    }
    if (frames % 30 === 0) {
      emitir('onArStats', {
        frames, state: seg > 2.5 ? 'TRACKING' : 'PAUSED', reason: 'NONE',
        ts: seg > 2.5 ? Math.round(seg * 1e9) : 0, cam: seg > 2.5,
        tex: 1, glError: '', resumes: 1, camCfgs: 3, sim: true,
      });
    }
  }, 33);
}

export function simStop() {
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
  emitir('onTracking', { state: 'stopped' });
}

/** Anclaje simulado: identidad en el origen del rincón. */
export function simAnchor() {
  return Promise.resolve({
    anchorId: 'sim', matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  });
}
