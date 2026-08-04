// arCornerCalib.js — Calibración POR ESQUINA, la de Revizto.
//
// El operario apunta a las tres caras de un rincón real (dos muros y el piso) y
// señala esas mismas tres caras en el modelo. Con eso queda fijado dónde está el
// modelo y hacia dónde mira. Es el método más preciso que existe en obra
// cerrada, porque un rincón define un punto y una orientación sin ambigüedad.
//
// POR QUÉ NO SE APLICA LA ROTACIÓN COMPLETA
// El puente (arViewerBridge) coloca el modelo con `yaw` + `modelOrigin`, es
// decir giro alrededor de la vertical y traslación. Eso NO es una limitación a
// la que haya que resignarse: es lo correcto. Un modelo de obra está a plomo, y
// la vertical de ARCore es la gravedad medida por el acelerómetro. Si la
// solución pidiera inclinar el modelo, lo que hay es un error de captura —una
// cara mal apuntada, un muro que no está a plomo—, y disimularlo torciendo el
// modelo esconde el problema en vez de enseñarlo.
//
// Por eso aquí se resuelve giro + traslación, y la inclinación sobrante se
// MIDE y se AVISA. El operario ve "el rincón no está a plomo: 4°" y decide.
//
// Convenio del puente, que es lo que esta función debe alimentar:
//     V(q) = upm · Rz(−yaw) · B · q + modelOrigin
// donde q es un punto del mundo de ARCore (metros) y B pasa los ejes de ARCore
// (Y arriba) a los del visor (Z arriba):  B·(x,y,z) = (x, −z, y).

// Con extensión .js a propósito: así este módulo se puede ejecutar tal cual con
// `node --test`, sin empaquetador de por medio. La matemática del AR se prueba
// en la terminal en un segundo; el resto necesita tablet.
import { cornerPoint } from './registrationCorner.js';

const norma = (v) => {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
};
const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const grados = (r) => (r * 180) / Math.PI;

/** Ejes de ARCore (Y arriba) → ejes del visor (Z arriba). */
export const arAVisor = (v) => [v[0], -v[2], v[1]];

/** Giro alrededor de la vertical del visor. */
export function giraZ(v, radianes) {
  const c = Math.cos(radianes);
  const s = Math.sin(radianes);
  return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]];
}

/**
 * Plano a partir de la pose que emiten ARCore y el simulador.
 * ARCore define la pose de un plano con su eje Y perpendicular a la superficie,
 * tanto en pisos como en muros, así que la normal sale de la segunda columna.
 * @param {number[]} m matriz 4x4 por columnas (16 números)
 */
export function planoDesdePose(m) {
  if (!m || m.length !== 16) return null;
  return { n: norma([m[4], m[5], m[6]]), p: [m[12], m[13], m[14]] };
}

/**
 * Separa un trío de planos en piso y muros mirando cuánto se alinea cada normal
 * con la vertical. Se hace en vez de exigir un orden de captura porque
 * equivocarse de orden es el error más fácil de cometer en campo —y el más
 * caro: emparejar el piso con un muro manda el modelo a tomar por saco sin que
 * nada avise.
 */
export function clasificar(planos, arriba = [0, 0, 1]) {
  const conVertical = planos.map((q, i) => ({
    i, q, vert: Math.abs(punto(norma(q.n), arriba)),
  }));
  const ordenados = [...conVertical].sort((a, b) => b.vert - a.vert);
  const piso = ordenados[0];
  const muros = [ordenados[1], ordenados[2]];
  return {
    piso: piso.q,
    muros: muros.map((m) => m.q),
    // Un piso de verdad tiene la normal casi vertical y los muros casi
    // horizontal. Si no, lo capturado no es un rincón.
    pisoVert: piso.vert,
    muroVertMax: Math.max(muros[0].vert, muros[1].vert),
  };
}

/**
 * Orienta las normales HACIA EL OBSERVADOR.
 *
 * Sin esto la calibración es ambigua y falla de la peor manera posible. En un
 * rincón de 90° las dos formas de emparejar los muros son igual de
 * consistentes —las dos dan discrepancia cero—, así que elegir "la que mejor
 * casa" desempata a cara o cruz y sale un modelo girado 90°: parece casi bien
 * hasta que caminas diez metros y todo está cambiado de sitio.
 *
 * El desempate real es la QUIRALIDAD: cruzar los muros produce una imagen
 * especular, y el signo del determinante lo delata. Pero ese signo solo
 * significa algo si las normales apuntan las tres al mismo lado, y el lado
 * natural es hacia quien mira: solo se puede apuntar a una cara que se ve, y
 * una cara visible tiene su normal mirando a la cámara. Vale igual para ARCore
 * —que solo detecta superficies encaradas— y para el modelo.
 */
export function orientarHaciaObservador(planos, obs) {
  return planos.map((q) => {
    const n = norma(q.n);
    const haciaMi = [obs[0] - q.p[0], obs[1] - q.p[1], obs[2] - q.p[2]];
    return punto(n, haciaMi) < 0 ? { n: n.map((c) => -c), p: q.p } : { n, p: q.p };
  });
}

/** Determinante de las tres normales: cambia de signo ante un reflejo. */
const quiralidad = (a, b, c) => (
  a[0] * (b[1] * c[2] - b[2] * c[1])
  - a[1] * (b[0] * c[2] - b[2] * c[0])
  + a[2] * (b[0] * c[1] - b[1] * c[0])
);

/** Ángulo horizontal de una normal, en radianes. */
const rumbo = (n) => Math.atan2(n[1], n[0]);

/** Diferencia de ángulos normalizada a (−π, π]. */
function difAngulo(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Calibra por esquina.
 *
 * @param {{n:number[],p:number[]}[]} planosModelo tres caras del MODELO, en
 *        unidades y ejes del visor (Z arriba)
 * @param {{n:number[],p:number[]}[]} planosMundo  tres caras REALES, en metros
 *        y ejes de ARCore (Y arriba). El orden NO tiene que coincidir.
 * @param {{upm:number, obsMundo:number[], obsModelo:number[]}} opts
 *        `upm`: unidades del visor por metro (1000 si el modelo está en mm).
 *        `obsMundo`: posición de la cámara de ARCore al capturar (metros, ejes
 *        de ARCore). `obsModelo`: posición de la cámara del visor al señalar
 *        las caras. Ambas hacen falta para orientar las normales — sin eso el
 *        emparejamiento de los muros es ambiguo en un rincón de 90°.
 * @returns {{ok:boolean, motivo?:string, yaw:number, modelOrigin:{x,y,z},
 *            discrepanciaMuros:number, desplomeGrados:number,
 *            errorA10m:number, avisos:string[]}}
 *        `yaw` en GRADOS, listo para detach.setYawDegrees.
 */
export function calibrarPorEsquina(planosModelo, planosMundo, opts = {}) {
  const upm = Number(opts.upm) > 0 ? Number(opts.upm) : 1;
  const fallo = (motivo) => ({
    ok: false, motivo, yaw: 0, modelOrigin: { x: 0, y: 0, z: 0 },
    discrepanciaMuros: Infinity, desplomeGrados: Infinity, errorA10m: Infinity,
    avisos: [],
  });

  if (!Array.isArray(planosModelo) || !Array.isArray(planosMundo)) return fallo('faltan caras');
  if (planosModelo.length !== 3 || planosMundo.length !== 3) {
    return fallo('hacen falta exactamente 3 caras: dos muros y el piso');
  }

  // El mundo real se pasa a los ejes del visor de una vez; a partir de aquí
  // todo vive en el mismo sistema y solo falta el giro y la traslación.
  // Los dos observadores son OBLIGATORIOS: sin ellos no hay forma de orientar
  // las normales y el emparejamiento de los muros se vuelve una moneda al aire.
  if (!opts.obsMundo || !opts.obsModelo) {
    return fallo('faltan las posiciones de cámara para orientar las caras');
  }

  const mundo = orientarHaciaObservador(
    planosMundo.map((q) => ({ n: norma(arAVisor(q.n)), p: arAVisor(q.p) })),
    arAVisor(opts.obsMundo),
  );
  const modelo = orientarHaciaObservador(
    planosModelo.map((q) => ({ n: norma(q.n), p: q.p })),
    opts.obsModelo,
  );

  const cm = clasificar(modelo);
  const cw = clasificar(mundo);

  const avisos = [];
  // ¿Es un rincón de verdad? Con tres caras casi paralelas —o dos muros
  // enfrentados— el punto de corte se dispara al infinito y el modelo aparece
  // a kilómetros. Vale más negarse que colocar algo absurdo.
  if (cm.pisoVert < 0.85 || cw.pisoVert < 0.85) {
    return fallo('no se reconoce un piso: apunta a una superficie horizontal');
  }
  if (cm.muroVertMax > 0.5 || cw.muroVertMax > 0.5) {
    return fallo('faltan dos muros verticales en el rincón');
  }

  // ¿Los dos muros se cortan en condiciones? Dos muros casi paralelos dejan la
  // posición indefinida a lo largo de ellos.
  // Cuánto se ABRE el rincón: el ángulo diedro entre las dos caras, con las
  // normales ya orientadas hacia el observador (apertura = 180° − ángulo entre
  // normales). Antes se plegaba con |dot| y un rincón de 135° salía como
  // "45°" — correcto para la matemática, incomprensible para quien está
  // mirando el rincón físico.
  const aperturaRincon = (ms) => {
    const c = Math.max(-1, Math.min(1, punto(norma(ms[0].n), norma(ms[1].n))));
    return 180 - grados(Math.acos(c));
  };
  const abreModelo = aperturaRincon(cm.muros);
  const abreMundo = aperturaRincon(cw.muros);
  if (abreModelo > 155 || abreMundo > 155) {
    return fallo('los dos muros son casi paralelos: el rincón es casi plano, busca uno más marcado');
  }
  if (abreModelo < 25 || abreMundo < 25) {
    return fallo('el rincón es demasiado cerrado para calibrar: busca uno más abierto');
  }

  // ¿Son EL MISMO rincón? La forma no depende de la orientación: el ángulo
  // con que se abren los dos muros tiene que coincidir a ambos lados. Si no
  // coincide, no hay nada que emparejar — y decir SOLO "no casan" obliga a
  // adivinar cuál de los dos lados está mal. Con los dos números, el operario
  // sabe al instante si tocó mal el modelo o escaneó otro rincón.
  if (Math.abs(abreModelo - abreMundo) > 20) {
    return fallo('no parecen el mismo rincón: el del modelo se abre '
      + abreModelo.toFixed(0) + '° y el de la obra ' + abreMundo.toFixed(0)
      + '°. Revisa las caras que tocaste en el modelo.');
  }

  // EMPAREJAR LOS MUROS por quiralidad, no por "el que mejor casa": ver el
  // comentario de orientarHaciaObservador. Con las normales ya orientadas
  // hacia el observador, el emparejamiento correcto es el que conserva el
  // signo del determinante; el cruzado lo invierte.
  const qm = quiralidad(cm.piso.n, cm.muros[0].n, cm.muros[1].n);
  const qw = quiralidad(cw.piso.n, cw.muros[0].n, cw.muros[1].n);
  const cruzado = (qm * qw) < 0;
  const par = cruzado ? [cw.muros[1], cw.muros[0]] : [cw.muros[0], cw.muros[1]];

  const yawDeMuro = (nModelo, nMundo) => difAngulo(rumbo(nMundo), rumbo(nModelo));
  const y0 = yawDeMuro(cm.muros[0].n, par[0].n);
  const y1 = yawDeMuro(cm.muros[1].n, par[1].n);
  // Media circular de los dos giros: promediar ángulos "a pelo" falla al cruzar
  // ±180°, y un rincón junto a esa frontera es tan válido como cualquier otro.
  const mejor = {
    yaw: Math.atan2((Math.sin(y0) + Math.sin(y1)) / 2, (Math.cos(y0) + Math.cos(y1)) / 2),
    discrepancia: Math.abs(difAngulo(y0, y1)),
  };

  const discrepanciaMuros = grados(mejor.discrepancia);
  if (discrepanciaMuros > 20) {
    return fallo(`las caras no casan (${discrepanciaMuros.toFixed(0)}° de diferencia): revisa que sean el mismo rincón`);
  }
  if (discrepanciaMuros > 5) {
    avisos.push(`los dos muros no coinciden del todo (${discrepanciaMuros.toFixed(1)}°)`);
  }

  // Desplome: cuánto se aparta de la vertical el piso real respecto al del
  // modelo. Es la parte que este método NO corrige, así que se enseña.
  const desplomeGrados = Math.abs(
    grados(Math.acos(Math.min(1, Math.abs(punto(norma(cm.piso.n), norma(cw.piso.n)))))),
  );
  if (desplomeGrados > 3) {
    avisos.push(`el piso real no está a plomo con el del modelo (${desplomeGrados.toFixed(1)}°): el modelo se dejará a nivel`);
  }

  // El punto del rincón: donde se cortan las tres caras. Es el punto que el
  // modelo y la realidad tienen que compartir.
  const Pm = cornerPoint(modelo);
  const Pw = cornerPoint(mundo);
  if (!Pm || !Pw) return fallo('las tres caras no se cortan en un punto');

  // modelOrigin sale de despejar la fórmula del puente en el rincón:
  //     Pm = upm · Rz(−yaw) · Pw + modelOrigin
  const giradoPw = giraZ(Pw, -mejor.yaw);
  const modelOrigin = {
    x: Pm[0] - upm * giradoPw[0],
    y: Pm[1] - upm * giradoPw[1],
    z: Pm[2] - upm * giradoPw[2],
  };

  // Traducción del error angular a algo que se entiende en obra: un grado de
  // giro son 17 cm de desvío a 10 m. Decirle al operario "0.4°" no significa
  // nada; decirle "7 cm a 10 m" le dice si puede replantear con esto.
  const errorA10m = Math.tan((discrepanciaMuros * Math.PI) / 180) * 10;

  return {
    ok: true,
    yaw: grados(mejor.yaw),
    modelOrigin,
    discrepanciaMuros,
    desplomeGrados,
    errorA10m,
    avisos,
  };
}
