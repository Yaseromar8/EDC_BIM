/**
 * COMO RESPONDE EL PLANO A LA MANO, EN CIFRAS.
 *
 * Las cifras son las del lector de planos de ACC, medidas el 13-sep-2026 en
 * PQT8 con raton real simulado (docs/archivos/03_LECTOR_PDF_MANIPULACION_COMO_ACC.md):
 *
 *   · una muesca de rueda acerca ×1,10 y aleja ×0,91 (es decir, ÷1,10);
 *   · el paso no llega de golpe: la mitad a los ~12 ms, el 90 % a los ~44 ms,
 *     y termina hacia los 60 ms;
 *   · un evento que trae varias muescas juntas da el mismo paso que una;
 *   · se puede alejar hasta ver la hoja unas 3,5 veces mas pequeña que
 *     encuadrada.
 *
 * Aqui solo hay aritmetica, sin DOM: se prueba con node
 * (pruebas/navegacionLector.prueba.mjs) y el lector se limita a aplicarla.
 *
 * LA ESCALA SE SUAVIZA EN LOGARITMOS. Un paso de zoom es una MULTIPLICACION,
 * asi que dos muescas seguidas tienen que sumar dos pasos iguales, no uno
 * grande y otro pequeño. En logaritmos eso es una suma y la curva sale igual a
 * cualquier escala.
 */

export const PASO_DE_RUEDA = 1.10;
export const LN_PASO_DE_RUEDA = Math.log(PASO_DE_RUEDA);

// + y - del teclado: el paso que ya tenia el lector. En ACC no se midio.
export const PASO_DE_TECLADO = 1.2;

// Suavizado exponencial: con τ = 18 ms la mitad llega a los 12 ms y el 90 % a
// los 41 ms, que es la curva medida.
export const TAU_MS = 18;

// Se da por llegado cuando falta menos del 4 % de una muesca: con τ = 18 ms eso
// ocurre a los ~58 ms, el final medido. El salto que queda es de un 0,4 % de
// escala, invisible.
export const RESTO_AL_LLEGAR = 0.04;

export const ALEJAR_HASTA = 3.5;

// Acercar hasta que 1 pt del plano ocupe 64 px. El tope era 8, y pasado 8 no
// se ganaba nada: la imagen de la hoja ya estaba al tope de pixeles y solo se
// estiraba. Con el detalle nitido de lo visible (ver areaDelDetalle) cada zoom
// se dibuja a la resolucion de la pantalla. ACC no tiene tope practico.
export const ZOOM_MAXIMO = 64;

// Doble clic: la hoja entera con un viaje de ~0,5 s, como en ACC.
export const DURACION_DE_HOJA_ENTERA_MS = 500;

// La misma holgura que usa el encuadre del lector (32 px por lado).
export const HOLGURA_DE_ENCUADRE = 64;

// Firefox da la rueda en LINEAS (3 por muesca) y a veces en paginas; Chrome y
// Edge, en pixeles (100 por muesca). Todo se pasa a pixeles antes de decidir.
const PX_POR_LINEA = 100 / 3;
const PX_POR_PAGINA = 800;

// Desde aqui un evento cuenta como una muesca entera. Por debajo llegan los
// eventos finos de un panel tactil o de una rueda de alta resolucion: cuentan
// en proporcion, para que deslizar dos dedos no dispare un ×1,10 por cada
// evento -- que son decenas por segundo.
const PX_DE_UNA_MUESCA = 50;

/**
 * Cuanto cambia la escala con UN evento de rueda, en logaritmo natural.
 * Positivo acerca, negativo aleja, 0 no hace nada.
 *
 * Con Ctrl y un evento fino es un PELLIZCO del panel tactil (el navegador lo
 * entrega asi): sigue a los dedos en vez de ir por muescas. Ni el panel ni el
 * pellizco se midieron en ACC; esto solo evita que vayan peor que la rueda.
 */
export function pasoDeRueda({ deltaY = 0, deltaMode = 0, ctrlKey = false } = {}) {
  const px = deltaY * (deltaMode === 1 ? PX_POR_LINEA : deltaMode === 2 ? PX_POR_PAGINA : 1);
  if (!Number.isFinite(px) || px === 0) return 0;
  if (ctrlKey && Math.abs(px) < PX_DE_UNA_MUESCA) return -px / 100;
  return -Math.sign(px) * Math.min(1, Math.abs(px) / PX_DE_UNA_MUESCA) * LN_PASO_DE_RUEDA;
}

/**
 * Un fotograma del suavizado: acerca `lnActual` a `lnObjetivo` segun el tiempo
 * real transcurrido. Con el tiempo REAL y no por fotogramas: si el navegador
 * se atasca un fotograma (pdf.js dibujando), el zoom no va a camara lenta,
 * recupera lo perdido.
 */
export function suavizar(lnActual, lnObjetivo, dtMs, tau = TAU_MS) {
  const resto = (lnObjetivo - lnActual) * Math.exp(-Math.max(0, dtMs) / tau);
  if (!(Math.abs(resto) > RESTO_AL_LLEGAR * LN_PASO_DE_RUEDA)) return { ln: lnObjetivo, llegado: true };
  return { ln: lnObjetivo - resto, llegado: false };
}

/** Escala minima y maxima para una hoja en una vista. */
export function limitesDeZoom({ anchoHoja, altoHoja, anchoVista, altoVista }) {
  const encaje = Math.min(
    (anchoVista - HOLGURA_DE_ENCUADRE) / anchoHoja,
    (altoVista - HOLGURA_DE_ENCUADRE) / altoHoja,
  );
  const minimo = Number.isFinite(encaje) && encaje > 0 ? encaje / ALEJAR_HASTA : 0.05;
  return { minimo: Math.min(minimo, ZOOM_MAXIMO), maximo: ZOOM_MAXIMO };
}

/**
 * La escala a la que tiene que ir el zoom, dentro de los limites.
 *
 * Si la escala actual YA esta fuera --la ventana se estrecho y el minimo
 * subio-- no se la devuelve dentro de golpe: solo se impide seguir
 * alejandose del limite. Un salto que el usuario no pidio es justo lo que
 * hace perder el punto.
 */
export function objetivoDelZoom(lnPedido, lnActual, { minimo, maximo }) {
  const lnMinimo = Math.min(Math.log(minimo), lnActual);
  const lnMaximo = Math.max(Math.log(maximo), lnActual);
  return Math.min(lnMaximo, Math.max(lnMinimo, lnPedido));
}

/**
 * El punto del plano que hay bajo el cursor, en unidades de la hoja (sin
 * escala). Puede caer fuera de la hoja: en ACC el zoom se ancla igual en el
 * margen, y la cuenta no cambia.
 */
export function puntoBajoElCursor(rectHoja, clientX, clientY, escala) {
  return {
    clientX, clientY,
    ux: (clientX - rectHoja.left) / escala,
    uy: (clientY - rectHoja.top) / escala,
  };
}

/** Cuanto hay que desplazar la vista para que ese punto vuelva bajo el cursor. */
export function desfaseDelPunto(rectHoja, punto, escala) {
  return {
    dx: rectHoja.left + punto.ux * escala - punto.clientX,
    dy: rectHoja.top + punto.uy * escala - punto.clientY,
  };
}

/**
 * El punto que tiene que conservar el zoom de este evento.
 *
 * Si el cursor no se ha movido y el punto anotado sigue bajo el (a menos de
 * pixel y medio: lo que redondean el scroll y la maqueta), se conserva el
 * ANOTADO en vez de medirlo otra vez. Medirlo en cada muesca le sumaba el
 * redondeo de la anterior, y en una rafaga de cinco muescas el punto se iba
 * 1,4 px (medido en el banco). Si se movio el cursor, o la vista por otro lado
 * (un arrastre, un encuadre), se anota de nuevo.
 */
export function puntoParaElZoom(anterior, rectHoja, clientX, clientY, escala) {
  if (anterior && anterior.clientX === clientX && anterior.clientY === clientY) {
    const { dx, dy } = desfaseDelPunto(rectHoja, anterior, escala);
    if (Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5) return anterior;
  }
  return puntoBajoElCursor(rectHoja, clientX, clientY, escala);
}

/**
 * EL DETALLE NITIDO: que trozo de la hoja dibujar aparte, y a que resolucion.
 *
 * La imagen de la hoja entera tiene un tope de pixeles; pasado cierto zoom se
 * estira y se ve borrosa. Encima se dibuja SOLO lo visible, a la resolucion de
 * la pantalla: lo visible cabe siempre en el presupuesto, sea cual sea el zoom.
 * Es la idea del visor de pdf.js («detail view»), y de el salen las dos reglas:
 * el margen alrededor de lo visible (hasta un ancho de lo visible por lado, si
 * cabe) y cuando redibujar (ver detalleSigueValiendo).
 *
 * Todo en unidades del viewport de pdf.js (px CSS a la escala del dibujado).
 *   vista: { left, top, right, bottom } zona visible del contenedor (client)
 *   hoja:  { left, top, width, height } rectangulo de la hoja en pantalla
 * Devuelve el area con margen, la resolucion (px de imagen por unidad) y lo
 * visible; o null si la hoja no se ve.
 */
export function areaDelDetalle({ vista, hoja, anchoVp, altoVp, dpr, presupuesto }) {
  const k = anchoVp / hoja.width;
  const visible = {
    minX: Math.max(0, (vista.left - hoja.left) * k),
    maxX: Math.min(anchoVp, (vista.right - hoja.left) * k),
    minY: Math.max(0, (vista.top - hoja.top) * k),
    maxY: Math.min(altoVp, (vista.bottom - hoja.top) * k),
  };
  if (!(visible.maxX > visible.minX && visible.maxY > visible.minY)) return null;
  const ancho = visible.maxX - visible.minX, alto = visible.maxY - visible.minY;
  const holgura = Math.max(0, Math.min(1, (Math.sqrt(presupuesto / (ancho * alto * dpr * dpr)) - 1) / 2));
  const area = {
    minX: Math.max(0, visible.minX - ancho * holgura),
    maxX: Math.min(anchoVp, visible.maxX + ancho * holgura),
    minY: Math.max(0, visible.minY - alto * holgura),
    maxY: Math.min(altoVp, visible.maxY + alto * holgura),
  };
  // Si ni lo visible cabe (una pantalla enorme), se baja la resolucion lo justo.
  const superficie = (area.maxX - area.minX) * (area.maxY - area.minY);
  return { ...area, resolucion: Math.min(dpr, Math.sqrt(presupuesto / superficie)), visible };
}

/**
 * ¿Sirve todavia el detalle dibujado para lo que se ve ahora?
 *
 * No, si lo visible se sale de el. Y tampoco si lo visible ya casi toca un
 * borde del detalle con margen de sobra al otro lado (mas de 3 a 1, la regla
 * del visor de pdf.js): se redibuja centrado antes de que el arrastre destape
 * la imagen borrosa. Pegado al borde de la HOJA no cuenta: alli no hay mas
 * plano que dibujar.
 */
export function detalleSigueValiendo(dibujado, visible, { anchoVp, altoVp }) {
  if (!dibujado || !visible) return false;
  const e = 0.5;
  if (visible.minX < dibujado.minX - e || visible.maxX > dibujado.maxX + e
    || visible.minY < dibujado.minY - e || visible.maxY > dibujado.maxY + e) return false;
  const izquierda = visible.minX - dibujado.minX, derecha = dibujado.maxX - visible.maxX;
  const arriba = visible.minY - dibujado.minY, abajo = dibujado.maxY - visible.maxY;
  if (dibujado.minX > 0 && derecha / izquierda > 3) return false;
  if (dibujado.maxX < anchoVp && izquierda / derecha > 3) return false;
  if (dibujado.minY > 0 && abajo / arriba > 3) return false;
  if (dibujado.maxY < altoVp && arriba / abajo > 3) return false;
  return true;
}

/** Curva del viaje a la hoja entera: sale y llega suave. */
export function suaveEntradaSalida(fraccion) {
  const x = Math.min(1, Math.max(0, fraccion));
  return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
}

/**
 * La hoja entera y centrada: la MISMA vista que deja el boton «Ajustar
 * pagina» (`fitTo`), para que el doble clic y el boton terminen igual.
 *
 * `fitTo` centra el scroll, y el relleno del escenario no es simetrico --deja
 * aire a la derecha para el carril de herramientas y abajo para el mando--,
 * asi que la hoja queda centrada en lo que ese aire deja libre. Aqui se
 * reproduce con el relleno real.
 *
 *   vista:   { left, top, ancho, alto } de la zona visible del contenedor
 *   relleno: { izquierda, derecha, arriba, abajo } del `.pdf-page-pad`
 * Devuelve { escala, left, top }: la escala y la esquina de la hoja en pantalla.
 */
export function vistaDeHojaEntera({ anchoHoja, altoHoja, vista, relleno }) {
  const escala = Math.max(0.2, Math.min(
    (vista.ancho - HOLGURA_DE_ENCUADRE) / anchoHoja,
    (vista.alto - HOLGURA_DE_ENCUADRE) / altoHoja,
  ));
  return {
    escala,
    left: vista.left + (vista.ancho - anchoHoja * escala) / 2 + (relleno.izquierda - relleno.derecha) / 2,
    top: vista.top + (vista.alto - altoHoja * escala) / 2 + (relleno.arriba - relleno.abajo) / 2,
  };
}

/**
 * Un fotograma del viaje entre dos vistas ({ escala, left, top }).
 *
 * La escala va en logaritmos, como la rueda. La posicion se elige para que el
 * punto del plano que coincide al principio y al final --el punto fijo del
 * viaje-- no se mueva en todo el camino: se ve como UN zoom alrededor de ese
 * punto, y no como una hoja que a la vez encoge y se desliza torcida. Si las
 * dos escalas casi coinciden no hay punto fijo util, y la hoja se desliza en
 * linea recta.
 */
export function vistaIntermedia(desde, hasta, fraccion) {
  const e = suaveEntradaSalida(fraccion);
  const escala = Math.exp(Math.log(desde.escala) + (Math.log(hasta.escala) - Math.log(desde.escala)) * e);
  if (Math.abs(hasta.escala - desde.escala) / Math.max(desde.escala, hasta.escala) < 0.02) {
    return {
      escala,
      left: desde.left + (hasta.left - desde.left) * e,
      top: desde.top + (hasta.top - desde.top) * e,
    };
  }
  const ux = (hasta.left - desde.left) / (desde.escala - hasta.escala);
  const uy = (hasta.top - desde.top) / (desde.escala - hasta.escala);
  const fijoX = desde.left + desde.escala * ux;
  const fijoY = desde.top + desde.escala * uy;
  return { escala, left: fijoX - escala * ux, top: fijoY - escala * uy };
}
