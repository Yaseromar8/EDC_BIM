// MODAL — semántica de diálogo sobre Overlay.
//
// Compone Overlay con `modal` activo y le añade lo que hace de una caja un
// DIÁLOGO: role, aria-modal y un título asociado. Hoy, de las 97
// superposiciones del producto, solo 2 declaran `role="dialog"`.
//
// La división con Overlay no es estética: Overlay sirve también a un panel
// lateral persistente, que NO debe atrapar el foco. El diálogo siempre sí.
//
// Esta primitiva NO migra ninguna de las 97 — eso es UX-05.
import React, { useId } from 'react';
import Overlay from './Overlay';
import Panel from './Panel';
import './Modal.css';

export default function Modal({
  abierto = true,
  titulo,                // OBLIGATORIO: un diálogo sin nombre no es anunciable
  descripcion,
  alCerrar,
  ancho = 'md',          // sm · md · lg
  children,
  pie,
}) {
  const idTitulo = useId();
  const idDesc = useId();

  if (!titulo) {
    throw new Error(
      'Modal: falta `titulo`. Un diálogo sin nombre accesible no se puede ' +
      'anunciar: el lector de pantalla dice «diálogo» y nada más.');
  }

  return (
    <Overlay
      modal                      // un diálogo SIEMPRE captura al usuario
      abierto={abierto}
      capa="modal"
      alCerrar={alCerrar}
      className={`a-modal a-modal--${ancho}`}
    >
      <Panel
        elevacion="lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={descripcion ? idDesc : undefined}
      >
        <header className="a-modal__cabecera">
          <h2 id={idTitulo} className="a-modal__titulo">{titulo}</h2>
          {alCerrar && (
            <button
              type="button"
              className="a-modal__cerrar"
              onClick={alCerrar}
              aria-label={`Cerrar ${titulo}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                   aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </header>
        {descripcion && (
          <p id={idDesc} className="a-modal__descripcion">{descripcion}</p>
        )}
        <div className="a-modal__cuerpo">{children}</div>
        {pie && <footer className="a-modal__pie">{pie}</footer>}
      </Panel>
    </Overlay>
  );
}
