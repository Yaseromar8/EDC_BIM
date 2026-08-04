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

// El modo simulado se ACTIVA con ?arsim=1 y se QUEDA activo hasta apagarlo con
// ?arsim=0. Depender del parámetro en cada carga era frágil: el visor reescribe
// el URL en varios sitios (limpia `pick`, `sso_ticket`, `project`...) y basta
// una navegación para perderlo — con el resultado de que el simulador parecía
// no existir.
export function simActivo() {
  if (typeof window === 'undefined') return false;
  try {
    const p = new URLSearchParams(window.location.search);
    const v = p.get('arsim');
    if (v === '1') { sessionStorage.setItem('ecd_arsim', '1'); return true; }
    if (v === '0') { sessionStorage.removeItem('ecd_arsim'); return false; }
    return sessionStorage.getItem('ecd_arsim') === '1';
  } catch {
    return /(\?|&)arsim=1/.test(window.location.search);
  }
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
// A qué cara se está apuntando (índice de SIM_PLANOS) o null para orbitar.
// Existe porque la calibración por esquina exige apuntar a TRES caras
// concretas, y una cámara que da vueltas sola no permite ensayar eso. Con
// las teclas 1/2/3 el simulador se planta dentro del rincón y mira a la cara
// que toca — igual que el operario girándose en el sitio.
let mirando = null;

// Punto dentro del rincón desde donde mira el operario, y a dónde mira en
// cada cara. El rincón está en (−1.5, 0, −2): piso, muro en X y muro en Z.
const DENTRO = [0, 1.6, 0];
const MIRAS = [
  [-0.5, 0, -0.7],      // piso
  [-1.5, 1.0, -0.7],    // muro que mira a +X
  [-0.5, 1.0, -2.0],    // muro que mira a +Z
];

export function simMirarA(indice) {
  mirando = (indice == null) ? null : Math.max(0, Math.min(2, indice | 0));
}
export function simMirando() { return mirando; }

/** Dónde está la cámara y a dónde apunta en este instante. */
function camaraEnSegundo(seg) {
  if (mirando != null) return { ojo: DENTRO, mira: MIRAS[mirando] };
  const a = seg * 0.25;                       // rad/s: una vuelta cada ~25 s
  const r = 3.0;
  return { ojo: [Math.sin(a) * r, 1.6, Math.cos(a) * r], mira: [0, 0.5, 0] };
}

function poseEnSegundo(seg) {
  const { ojo, mira } = camaraEnSegundo(seg);

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

/**
 * Lanza el rayo de la cámara contra las caras del rincón y devuelve la que
 * corta, con la MISMA forma que el hit-test de ARCore: una pose cuyo eje Y es
 * la normal de la superficie. Antes esto devolvía siempre la identidad, que
 * sirve para probar "hay suelo, ancla" pero no para calibrar: las tres caras
 * salían idénticas y la esquina era irresoluble.
 */
export function simReticuloEnSegundo(seg = 3) {
  return reticuloEnSegundo(seg);
}

function reticuloEnSegundo(seg) {
  const { ojo, mira } = camaraEnSegundo(seg);
  const dir = normaliza([mira[0] - ojo[0], mira[1] - ojo[1], mira[2] - ojo[2]]);

  let mejor = null;
  for (const plano of SIM_PLANOS) {
    const denom = plano.n[0] * dir[0] + plano.n[1] * dir[1] + plano.n[2] * dir[2];
    if (denom > -1e-6) continue;               // de espaldas o de canto
    const haciaPlano = [plano.p[0] - ojo[0], plano.p[1] - ojo[1], plano.p[2] - ojo[2]];
    const t = (plano.n[0] * haciaPlano[0] + plano.n[1] * haciaPlano[1] + plano.n[2] * haciaPlano[2]) / denom;
    if (t <= 0.05) continue;
    const golpe = [ojo[0] + dir[0] * t, ojo[1] + dir[1] * t, ojo[2] + dir[2] * t];
    // Las caras son finitas: 4 m alrededor del rincón. Sin esto el rayo
    // "acierta" en planos infinitos a 200 m y el retículo miente.
    if (Math.hypot(golpe[0] + 1.5, golpe[2] + 2.0) > 4.5) continue;
    if (!mejor || t < mejor.t) mejor = { t, plano, golpe };
  }

  if (!mejor) return { found: false, type: null, planes: SIM_PLANOS.length };

  // Pose con el eje Y en la normal, como la da ARCore.
  const ejeY = normaliza(mejor.plano.n);
  const auxiliar = Math.abs(ejeY[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const ejeX = normaliza(cruz(auxiliar, ejeY));
  const ejeZ = cruz(ejeX, ejeY);
  return {
    found: true, type: 'plane', planes: SIM_PLANOS.length,
    matrix: [
      ejeX[0], ejeX[1], ejeX[2], 0,
      ejeY[0], ejeY[1], ejeY[2], 0,
      ejeZ[0], ejeZ[1], ejeZ[2], 0,
      mejor.golpe[0], mejor.golpe[1], mejor.golpe[2], 1,
    ],
  };
}

const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normaliza = (v) => {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
};

export function simStart() {
  if (temporizador) clearInterval(temporizador);
  t0 = performance.now();
  frames = 0;

  // Se tarda unos segundos en "reconocer", como ARCore de verdad: así la
  // interfaz de espera también se prueba, en vez de saltársela siempre.
  emitir('onTracking', { state: 'paused' });
  setTimeout(() => emitir('onTracking', { state: 'tracking' }), 2500);

  // Ciclo con setInterval, no con requestAnimationFrame: rAF se detiene POR
  // COMPLETO en pestaña de fondo, y eso impide comprobarlo desde fuera. Con
  // intervalo, el navegador lo estrangula a ~2 Hz en segundo plano pero sigue
  // latiendo, así que la simulación se puede verificar sin depender de que
  // alguien esté mirando la pantalla.
  //
  // Quién puede PARAR este ciclo se decide en arcore.js con un testigo de
  // sesión. Aquí hubo una guarda por generación que se autorizaba a sí misma
  // —leía la generación en el momento de la llamada, que ya era la del
  // montaje siguiente— y por eso un efecto viejo mataba el ciclo del nuevo.
  let ultimoLatido = 0;
  const tick = () => {
    const seg = (performance.now() - t0) / 1000;
    frames++;
    if (seg > 2.5) {
      emitir('onCameraPose', poseEnSegundo(seg));
      emitir('onReticle', reticuloEnSegundo(seg));
    }
    // Latido por TIEMPO, no por número de frames: si el ritmo baja, el latido
    // sigue llegando y el panel sigue diciendo la verdad.
    if (seg - ultimoLatido >= 1) {
      ultimoLatido = seg;
      emitir('onArStats', {
        frames, state: seg > 2.5 ? 'TRACKING' : 'PAUSED', reason: 'NONE',
        ts: seg > 2.5 ? Math.round(seg * 1e9) : 0, cam: seg > 2.5,
        tex: 1, glError: '', resumes: 1, camCfgs: 3, sim: true,
      });
    }
  };
  temporizador = setInterval(tick, 33);
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
