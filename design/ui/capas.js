// LAS CAPAS QUE SE DESCARTAN: Escape y el clic fuera, en un solo sitio (docs/archivos/25, P5).
//
// Antes cada pieza ponía sus propios escuchadores en `window` y se esquivaban unas a otras: la barra de la marca en
// fase de captura (porque el panel de la incidencia paraba las teclas), un `setTimeout(0)` para que el clic que la
// abría no la cerrase, refs para no volver a suscribirse… Una pulsación de Escape podía cerrar varias cosas a la vez.
// Es el patrón de los sistemas de diseño («dismissable layer»): cada cosa abierta que se descarta es una CAPA en una
// pila, y un único escuchador decide:
//
//   · Escape cierra SOLO la capa de arriba. En un campo de texto el Escape es del campo, salvo que la capa diga lo
//     contrario (`escapeDesdeCampos`) y el campo sea SUYO (`propios`; si no se da, lo que `contiene`): las notas de la
//     barra se cierran con Escape aunque se esté escribiendo en ellas, pero no si se escribe en el panel que la barra
//     cuenta como suyo para el clic (su incidencia).
//   · Un CLIC fuera (pulsar y soltar casi en el mismo sitio: arrastrar la hoja no cuenta) cierra, de arriba abajo, cada
//     capa de la que el clic queda fuera, hasta la primera que lo contiene o que `bloquea` (un diálogo encima).
//     Un clic dentro de un diálogo modal ajeno (una confirmación) no cuenta como fuera.
//   · Escucha en fase de CAPTURA en el documento: lo que paren las piezas (`stopPropagation`) no le afecta.
//   · El clic que abre una capa ya pasó cuando la capa se registra (se registra al montarse): no la cierra.
//
// Capa: { nivel, contiene(elemento), propios(elemento), cerrar(porque), alPulsarFuera = true, escapeDesdeCampos = false,
//         bloquea = false }.
// A igual nivel, manda la última abierta.

const pila = [];
let instalado = false;
let bajada = null;
const MOVIMIENTO = 5;   // px: más que esto entre pulsar y soltar es arrastrar, no un clic

const ordenadas = () => pila.map((c, k) => [c, k])
  .sort((a, b) => ((b[0].nivel || 0) - (a[0].nivel || 0)) || (b[1] - a[1])).map(x => x[0]);
const comoElemento = (x) => (x && typeof x.closest === 'function' ? x : null);
const esCampo = (t) => !!t?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]');

function alTeclear(e) {
  if (e.key !== 'Escape') return;
  const [arriba] = ordenadas();
  if (!arriba) return;
  const t = comoElemento(e.target);
  const suyo = (arriba.propios || arriba.contiene)(t);
  if (esCampo(t) && !(arriba.escapeDesdeCampos && suyo)) return;
  e.preventDefault();
  arriba.cerrar('escape');
}

function alPulsar(e) {
  bajada = { x: e.clientX, y: e.clientY, t: comoElemento(e.target) };
}

function alClicar(e) {
  const b = bajada;
  bajada = null;
  if (!b || !b.t || Math.hypot(e.clientX - b.x, e.clientY - b.y) > MOVIMIENTO) return;
  if (b.t.closest('[role="alertdialog"], [aria-modal="true"]')) return;
  for (const capa of ordenadas()) {
    if (capa.contiene(b.t) || capa.bloquea) break;
    if (capa.alPulsarFuera !== false) capa.cerrar('fuera');
  }
}

function instalar() {
  if (instalado || typeof document === 'undefined') return;
  instalado = true;
  document.addEventListener('keydown', alTeclear, true);
  document.addEventListener('pointerdown', alPulsar, true);
  document.addEventListener('click', alClicar, true);
}

/** Abre una capa (el objeto tal cual: sus propiedades pueden ser `get`, y se leen al usarse). Devuelve con qué
 * quitarla (al cerrarse o desmontarse). */
export function abrirCapa(capa) {
  const c = capa;
  pila.push(c);
  instalar();
  return () => {
    const k = pila.indexOf(c);
    if (k >= 0) pila.splice(k, 1);
  };
}

/** Solo para las pruebas: cuántas capas hay y la de arriba. */
export function _capasAbiertas() {
  return ordenadas();
}

/** Solo para las pruebas: lo que haría el documento con una tecla o un clic. */
export const _paraProbar = { alTeclear, alPulsar, alClicar };
