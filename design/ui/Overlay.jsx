// OVERLAY — la infraestructura que hoy cada modal reinventa.
//
// Hay 97 superposiciones propias en 63 ficheros: 7 usan portal, 26 cierran con
// Escape, NINGUNA atrapa el foco y NINGUNA bloquea el desplazamiento del fondo.
// Esto es la única implementación del producto; UX-05 migrará las 97 sobre ella.
//
// ─────────────────────────────────────────────────────────────────────────
// LA MODALIDAD ES OPCIONAL, Y NO TIENE VALOR POR DEFECTO
// ─────────────────────────────────────────────────────────────────────────
// Un Overlay no es necesariamente modal. Un panel lateral persistente se usa
// JUNTO al contenido principal: el usuario tabula al fondo y lo desplaza a
// propósito. Atrapar el foco ahí sería un defecto, no una garantía.
//
// Por eso `modal` es obligatorio y sin defecto: quien monta un Overlay decide
// EXPLÍCITAMENTE si captura al usuario. Olvidarlo revienta en desarrollo, que
// es donde debe reventar.
//
//   siempre      portal a document.body · capa · backdrop opcional
//   con modal    bloqueo de desplazamiento · contención y devolución del foco
//
// El portal va a document.body a propósito: ya hay 4 portales montando ahí, y
// el tema vive en documentElement, así que quedan cubiertos.
import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './Overlay.css';

const FOCALIZABLES = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Cuántos Overlay modales hay abiertos. El bloqueo del desplazamiento se
// libera cuando se cierra el ÚLTIMO, no el primero: con dos anidados, cerrar
// el de arriba no debe devolver el scroll al fondo.
let modalesAbiertos = 0;
let overflowPrevio = null;

export default function Overlay({
  modal,                 // OBLIGATORIO. Sin defecto: ver arriba.
  abierto = true,
  capa = 'modal',        // nombre de --a-layer-*, nunca un número
  conBackdrop = true,
  alCerrar,              // se llama con Escape o al pulsar el backdrop
  className = '',
  children,
}) {
  const cajaRef = useRef(null);
  const focoPrevioRef = useRef(null);

  if (modal === undefined) {
    throw new Error(
      'Overlay: falta la prop `modal`. No tiene valor por defecto a propósito — ' +
      'decide si esta superposición captura al usuario (diálogo) o le deja usar ' +
      'el fondo (panel lateral persistente).');
  }

  // ── FOCO: se guarda al abrir y se devuelve al cerrar ───────────────────
  // Solo en modo modal. Si nunca se capturó el foco, no hay nada que devolver.
  useEffect(() => {
    if (!abierto || !modal) return undefined;
    focoPrevioRef.current = document.activeElement;
    const caja = cajaRef.current;
    if (caja) {
      const primero = caja.querySelector(FOCALIZABLES);
      (primero || caja).focus({ preventScroll: true });
    }
    return () => {
      const previo = focoPrevioRef.current;
      if (previo && typeof previo.focus === 'function') {
        previo.focus({ preventScroll: true });
      }
    };
  }, [abierto, modal]);

  // ── DESPLAZAMIENTO: bloqueado mientras haya algún modal abierto ────────
  useEffect(() => {
    if (!abierto || !modal) return undefined;
    if (modalesAbiertos === 0) {
      overflowPrevio = document.body.style.overflow;
      // Compensar la barra que desaparece evita el salto lateral del fondo.
      const hueco = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      if (hueco > 0) document.body.style.paddingRight = `${hueco}px`;
    }
    modalesAbiertos += 1;
    return () => {
      modalesAbiertos -= 1;
      if (modalesAbiertos === 0) {
        document.body.style.overflow = overflowPrevio || '';
        document.body.style.paddingRight = '';
        overflowPrevio = null;
      }
    };
  }, [abierto, modal]);

  // ── TECLADO: Escape cierra; Tab no sale de la caja ─────────────────────
  const alPulsarTecla = useCallback((e) => {
    if (e.key === 'Escape' && alCerrar) { e.stopPropagation(); alCerrar(); return; }
    if (e.key !== 'Tab' || !modal) return;
    const caja = cajaRef.current;
    if (!caja) return;
    const focos = [...caja.querySelectorAll(FOCALIZABLES)]
      .filter(el => el.offsetParent !== null || el === document.activeElement);
    if (!focos.length) { e.preventDefault(); return; }
    const primero = focos[0];
    const ultimo = focos[focos.length - 1];
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault(); ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault(); primero.focus();
    }
  }, [alCerrar, modal]);

  if (!abierto) return null;

  const contenido = (
    <div
      className={`a-overlay a-overlay--capa-${capa}${modal ? ' a-overlay--modal' : ''}`}
      onKeyDown={alPulsarTecla}
    >
      {conBackdrop && (
        <div
          className="a-overlay__velo"
          onClick={alCerrar}
          // Decorativo: el cierre accesible es Escape o el botón del diálogo.
          aria-hidden="true"
        />
      )}
      <div ref={cajaRef} className={`a-overlay__caja ${className}`} tabIndex={-1}>
        {children}
      </div>
    </div>
  );

  return createPortal(contenido, document.body);
}
