/**
 * Encuadre de cámara para «ir a un elemento», sin LMV: solo vectores.
 *
 * Por qué existe (medido el 23-oct-2026 en el banco, Frente Drenaje Urbano):
 * `viewer.fitToView` ya vuela (~490 ms, la misma transición que Tandem), pero
 * encuadra en el LIENZO ENTERO. El panel de Inventory tapa el 31 % de abajo
 * (lienzo 48–812 px, panel desde 572 px), así que el elemento aterrizaba pegado
 * al borde del panel y medio escondido. Y en una pieza de 0,5 m (una barra) el
 * zoom se metía tanto que se perdía dónde estaba.
 *
 * Aquí se calcula el encuadre en la ZONA QUE SE VE: el elemento queda centrado
 * en ella y ocupando una fracción fija; las piezas muy pequeñas se enseñan con
 * un mínimo de contexto alrededor.
 *
 * Vale para cámara ortográfica y en perspectiva: LMV deriva la escala
 * ortográfica de la distancia (orthoScale = 2·D·tan(fov/2), comprobado en el
 * visor), así que en las dos el alto visible a la distancia D es 2·D·tan(fov/2).
 */

const resta = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const suma = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const escala = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const largo = a => Math.hypot(a[0], a[1], a[2]);
const unitario = a => { const l = largo(a); return l > 0 ? escala(a, 1 / l) : a; };

// Por debajo de esto la zona libre no sirve para encuadrar (un panel maximizado):
// mejor el lienzo entero que un encuadre en una rendija.
const LIBRE_MINIMO = 0.25;

/**
 * Parte del lienzo que no tapan los paneles. `lienzo` y `tapas` en coordenadas
 * de pantalla ({left, top, right, bottom}); el resultado, relativo al lienzo:
 * {izq, arriba, der, abajo} en px. Un panel que cruza el lienzo a lo ancho
 * recorta por arriba o por abajo; uno que lo cruza a lo alto, por un lado.
 */
export function zonaLibre(lienzo, tapas = []) {
    const ancho = lienzo.right - lienzo.left, alto = lienzo.bottom - lienzo.top;
    let izq = 0, arriba = 0, der = ancho, abajo = alto;
    for (const t of tapas) {
        const ow = Math.min(t.right, lienzo.right) - Math.max(t.left, lienzo.left);
        const oh = Math.min(t.bottom, lienzo.bottom) - Math.max(t.top, lienzo.top);
        if (ow <= 0 || oh <= 0) continue;
        if (ow >= ancho * 0.5) {
            const centro = (Math.max(t.top, lienzo.top) + Math.min(t.bottom, lienzo.bottom)) / 2 - lienzo.top;
            if (centro > alto / 2) abajo = Math.min(abajo, t.top - lienzo.top);
            else arriba = Math.max(arriba, t.bottom - lienzo.top);
        } else if (oh >= alto * 0.5) {
            const centro = (Math.max(t.left, lienzo.left) + Math.min(t.right, lienzo.right)) / 2 - lienzo.left;
            if (centro > ancho / 2) der = Math.min(der, t.left - lienzo.left);
            else izq = Math.max(izq, t.right - lienzo.left);
        }
    }
    if (abajo - arriba < alto * LIBRE_MINIMO || der - izq < ancho * LIBRE_MINIMO) {
        return { izq: 0, arriba: 0, der: ancho, abajo: alto };
    }
    return { izq, arriba, der, abajo };
}

/**
 * Cámara que enseña una esfera (centro, radio) en la zona libre del lienzo,
 * sin girar la vista: misma dirección y mismo «arriba» que la cámara actual.
 *
 *   ocupacion    fracción del lado corto de la zona libre que ocupa el diámetro
 *   radioMinimo  radio por debajo del cual no se acerca más (contexto)
 *   puntos       (opcional) [[x,y,z]…]: en vez de la esfera, el rectángulo que esos
 *                puntos ocupan VISTOS DESDE ESTA CÁMARA. Un conjunto repartido mirado
 *                en diagonal ocupa en pantalla mucho menos que su esfera (24-oct-2026,
 *                Drenaje: cuatro losas en 45 × 35 m quedaban en un tercio de la
 *                pantalla con `ocupacion` 0,75). Con los puntos, ancho y alto llenan
 *                `ocupacion` de la zona libre, cada uno en su eje.
 *
 * Devuelve { objetivo, posicion, arriba, distancia, altoVisible }.
 */
export function vistaDeEncuadre({
    centro, radio, direccion, arriba, fovVertical, lienzo, libre,
    ocupacion = 0.6, radioMinimo = 0, puntos = null,
}) {
    const libreAlto = libre.abajo - libre.arriba, libreAncho = libre.der - libre.izq;
    const d = unitario(direccion);
    const derecha = unitario(cruz(d, arriba));
    const arribaPantalla = unitario(cruz(derecha, d));
    const punto = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];

    let altoVisible;
    if (puntos && puntos.length) {
        // Rectángulo de los puntos en el plano de la pantalla (y su fondo, para el centro).
        let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity, minC = Infinity, maxC = -Infinity;
        for (const q of puntos) {
            const a = punto(q, derecha), b = punto(q, arribaPantalla), c = punto(q, d);
            minA = Math.min(minA, a); maxA = Math.max(maxA, a);
            minB = Math.min(minB, b); maxB = Math.max(maxB, b);
            minC = Math.min(minC, c); maxC = Math.max(maxC, c);
        }
        const minimo = 2 * (radioMinimo || 0);
        const ancho = Math.max(maxA - minA, minimo, 1e-9), alto = Math.max(maxB - minB, minimo, 1e-9);
        // Mundo por píxel para que el ancho quepa en `ocupacion` del ancho libre y el alto
        // en `ocupacion` del alto libre: manda el que más pide.
        const mundoPorPxNecesario = Math.max(alto / (ocupacion * libreAlto), ancho / (ocupacion * libreAncho));
        altoVisible = mundoPorPxNecesario * lienzo.alto;
        centro = suma(suma(escala(derecha, (minA + maxA) / 2), escala(arribaPantalla, (minB + maxB) / 2)), escala(d, (minC + maxC) / 2));
    } else {
        const r = Math.max(radio || 0, radioMinimo || 0, 1e-9);
        // Alto del mundo que cabe en el lienzo entero para que el diámetro ocupe
        // `ocupacion` del lado corto de la zona libre (en px, ancho y alto valen igual).
        altoVisible = (2 * r / ocupacion) * lienzo.alto / Math.min(libreAlto, libreAncho);
    }
    const tanMedio = Math.tan((fovVertical * Math.PI / 180) / 2);
    const distancia = altoVisible / (2 * tanMedio);
    const mundoPorPx = altoVisible / lienzo.alto;

    // El centro del elemento tiene que caer en el centro de la zona libre, no
    // en el del lienzo: se desplaza el punto al que mira la cámara.
    const dx = (libre.izq + libre.der) / 2 - lienzo.ancho / 2;   // + a la derecha
    const dy = (libre.arriba + libre.abajo) / 2 - lienzo.alto / 2; // + hacia abajo
    const objetivo = suma(suma(centro, escala(derecha, -dx * mundoPorPx)), escala(arribaPantalla, dy * mundoPorPx));
    const posicion = resta(objetivo, escala(d, distancia));
    return { objetivo, posicion, arriba: arribaPantalla, distancia, altoVisible };
}

/**
 * Dónde cae un punto del mundo en el lienzo con esa cámara (px, origen arriba a
 * la izquierda). Para las pruebas y para comprobar el encuadre en el visor.
 */
export function proyectar(punto, { objetivo, posicion, arriba, altoVisible }, lienzo) {
    const d = unitario(resta(objetivo, posicion));
    const derecha = unitario(cruz(d, arriba));
    const arribaPantalla = unitario(cruz(derecha, d));
    const rel = resta(punto, objetivo);
    const px = lienzo.alto / altoVisible;
    const x = rel[0] * derecha[0] + rel[1] * derecha[1] + rel[2] * derecha[2];
    const y = rel[0] * arribaPantalla[0] + rel[1] * arribaPantalla[1] + rel[2] * arribaPantalla[2];
    return [lienzo.ancho / 2 + x * px, lienzo.alto / 2 - y * px];
}
