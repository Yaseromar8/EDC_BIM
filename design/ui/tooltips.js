// TOOLTIPS · uno solo para todo el producto (UI polish F5, 13-oct-2026).
//
// El portal tenía 166 `title` nativos: cada uno con el retardo del navegador
// (casi un segundo), con su estilo de sistema y sin aparecer al llegar con el
// teclado. Migrarlos uno a uno a un componente es mucho cambio para poco, y el
// siguiente `title` que alguien escriba volvería a ser nativo.
//
// Aquí se hace al revés: un único escuchador para todo el documento. Cuando el
// puntero o el foco de teclado llegan a un elemento con `title`, se le quita
// el atributo mientras dura (así el navegador no pinta el suyo) y se muestra el
// tooltip propio, con un retardo, una posición y un estilo. Al salir, el
// `title` vuelve a su sitio: el código que lo lee o lo cambia sigue viendo lo
// mismo que antes. Escribir `title="…"` sigue siendo la forma de pedir uno.
//
// Lo que se cuida para no empeorar nada:
//   · Accesibilidad: si el `title` era el ÚNICO nombre del elemento (un botón
//     de solo icono), se le pone `aria-label` mientras no está; y si tiene
//     texto, el tooltip queda como su descripción (`aria-describedby`).
//   · En pantallas táctiles no se muestra (no hay «pasar por encima»).
//   · Se cierra al pulsar, al desplazar, con la rueda y con Escape.
import './Tooltip.css';

const RETARDO = 450;   // ms hasta el primero
const CALIENTE = 400;  // si otro se cerró hace menos, el siguiente sale ya
const SEPARACION = 6;  // px entre el elemento y el tooltip
const MARGEN = 8;      // px mínimos al borde de la ventana

let instalado = false;

export function instalarTooltips() {
  if (instalado || typeof document === 'undefined') return;
  instalado = true;

  const tip = document.createElement('div');
  tip.className = 'a-tip';
  tip.id = 'a-tip';
  tip.setAttribute('role', 'tooltip');
  const conPopover = typeof tip.showPopover === 'function';
  if (conPopover) tip.setAttribute('popover', 'manual');
  document.body.appendChild(tip);

  let actual = null;      // elemento con el tooltip
  let texto = '';
  let puseEtiqueta = false;
  let puseDescripcion = false;
  let reloj = 0;
  let ultimoCierre = 0;

  const abierto = () => tip.classList.contains('a-tip--visible');

  const colocar = () => {
    const r = actual.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    let top = r.bottom + SEPARACION;
    if (top + t.height > window.innerHeight - MARGEN) top = r.top - t.height - SEPARACION;
    let left = r.left + r.width / 2 - t.width / 2;
    left = Math.max(MARGEN, Math.min(left, window.innerWidth - t.width - MARGEN));
    tip.style.top = `${Math.max(MARGEN, top)}px`;
    tip.style.left = `${left}px`;
  };

  const mostrar = () => {
    if (!actual || !actual.isConnected) return;
    tip.textContent = texto;
    if (conPopover && !tip.matches(':popover-open')) tip.showPopover();
    tip.classList.add('a-tip--visible');
    colocar();
  };

  const salir = () => {
    clearTimeout(reloj);
    if (actual) {
      // Si alguien cambió el `title` mientras estaba quitado, manda el suyo.
      if (!actual.hasAttribute('title')) actual.setAttribute('title', texto);
      if (puseEtiqueta) actual.removeAttribute('aria-label');
      if (puseDescripcion) actual.removeAttribute('aria-describedby');
      if (abierto()) ultimoCierre = Date.now();
    }
    tip.classList.remove('a-tip--visible');
    if (conPopover && tip.matches(':popover-open')) tip.hidePopover();
    actual = null;
    texto = '';
    puseEtiqueta = false;
    puseDescripcion = false;
  };

  const entrar = (el, inmediato = false) => {
    if (el === actual) return;
    salir();
    const t = el.getAttribute('title');
    if (!t || !t.trim()) return;
    actual = el;
    texto = t;
    el.removeAttribute('title');
    if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby') && !el.textContent.trim()) {
      el.setAttribute('aria-label', t);
      puseEtiqueta = true;
    } else if (!el.hasAttribute('aria-describedby')) {
      el.setAttribute('aria-describedby', tip.id);
      puseDescripcion = true;
    }
    // `data-tip-recortado`: el tooltip solo repite un texto que NO se ve entero
    // (un nombre cortado con «…»). Si cabe, no sale nada: repetir lo que ya se
    // lee es ruido. El `title` se quita igual, para que tampoco salga el nativo.
    if (el.hasAttribute('data-tip-recortado') && el.scrollWidth <= el.clientWidth) return;
    const caliente = Date.now() - ultimoCierre < CALIENTE;
    reloj = setTimeout(mostrar, inmediato || caliente ? 0 : RETARDO);
  };

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    if (actual && actual.contains(e.target)) return;
    const el = e.target instanceof Element ? e.target.closest('[title]') : null;
    if (el) entrar(el);
    else if (actual) salir();
  }, true);

  document.addEventListener('pointerout', (e) => {
    if (actual && !(e.relatedTarget instanceof Node && actual.contains(e.relatedTarget))) salir();
  }, true);

  document.addEventListener('focusin', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el || !el.hasAttribute('title')) return;
    let deTeclado = false;
    try { deTeclado = el.matches(':focus-visible'); } catch { deTeclado = false; }
    if (deTeclado) entrar(el, true);
  }, true);

  document.addEventListener('focusout', (e) => { if (actual && e.target === actual) salir(); }, true);
  document.addEventListener('pointerdown', () => { if (actual) salir(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && actual) salir(); }, true);
  window.addEventListener('wheel', () => { if (actual) salir(); }, { capture: true, passive: true });
  window.addEventListener('scroll', () => { if (actual) salir(); }, true);
  window.addEventListener('blur', () => { if (actual) salir(); });
}
