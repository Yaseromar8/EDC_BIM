/**
 * BARRA LATERAL DE LA OBRA (UI polish F4, 17-sep-2026).
 *
 * Aquí solo se DIBUJA. Qué entradas hay, en qué grupos, quién las ve y qué hace
 * cada una lo sigue decidiendo `FilesPage` (permisos, herramientas de la obra,
 * trabajo de campo). Lo que vive aquí es lo que se ve y se toca: la lista o la
 * columna de iconos, la entrada activa, el hover, el foco, el nombre flotante y
 * el botón de contraer.
 *
 * Antes todo esto iba en línea dentro de FilesPage: sin hover posible, con
 * grises que no eran de la paleta y sin nombre en el botón de contraer. Medido
 * con la FilesPage real en un banco: docs/ux/UI_POLISH_03_F4_BARRA_LATERAL.md.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import './BarraLateral.css';

// El mismo umbral que ya decidía si se ven los títulos de grupo, con nombre.
// Por debajo de aquí la barra deja de ser una lista y pasa a ser una columna
// de iconos: el texto no cabe, así que no se dibuja.
const UMBRAL_ICONOS = 100;

// Lo que tarda en irse el nombre flotante al sacar el puntero. Da tiempo a
// llevar el puntero ENCIMA del nombre sin que desaparezca (WCAG 1.4.13).
const MARGEN_PARA_SOBREVOLAR_MS = 150;

const ALTERNAR = 'alternar';

export default function BarraLateral({ grupos, activo, ancho, onAlternar }) {
  const iconos = ancho <= UMBRAL_ICONOS;

  // NOMBRE FLOTANTE. Con la barra contraída el nombre de cada entrada ya no se
  // ve, y el `title` del navegador tarda en salir, no tiene estilo y no aparece
  // con el teclado. Uno solo para toda la barra: qué elemento lo pide y dónde.
  const [aviso, setAviso] = React.useState(null);          // { clave, texto, el }
  const [posicion, setPosicion] = React.useState(null);    // { x, y }
  const temporizador = React.useRef(null);

  const cancelarCierre = () => { clearTimeout(temporizador.current); temporizador.current = null; };
  const cerrar = React.useCallback(() => {
    clearTimeout(temporizador.current);
    temporizador.current = null;
    setAviso(null);
  }, []);
  const cerrarPronto = () => {
    cancelarCierre();
    temporizador.current = setTimeout(() => setAviso(null), MARGEN_PARA_SOBREVOLAR_MS);
  };
  const abrir = (clave, texto, el) => { cancelarCierre(); setAviso({ clave, texto, el }); };

  // A la derecha del elemento y centrado en su alto. Se mide otra vez al
  // contraer o expandir: el botón de contraer cambia de sitio bajo el puntero.
  React.useLayoutEffect(() => {
    if (!aviso || !aviso.el.isConnected) { setPosicion(null); return; }
    const r = aviso.el.getBoundingClientRect();
    setPosicion({ x: Math.round(r.right + 8), y: Math.round(r.top + r.height / 2) });
  }, [aviso, ancho]);

  // Escape lo quita sin mover el foco. Solo mientras hay uno a la vista: el
  // resto del tiempo Escape sigue siendo de la página (limpiar la selección).
  // En CAPTURA: FilesPage escucha Escape en `document` desde que se monta, así
  // que su manejador corría antes y limpiaba la selección con la misma tecla.
  // Ese manejador respeta `defaultPrevented`.
  React.useEffect(() => {
    if (!aviso) return undefined;
    const alPulsar = (e) => { if (e.key === 'Escape') { e.preventDefault(); cerrar(); } };
    document.addEventListener('keydown', alPulsar, true);
    return () => document.removeEventListener('keydown', alPulsar, true);
  }, [aviso, cerrar]);

  React.useEffect(() => () => clearTimeout(temporizador.current), []);

  // Solo con RATÓN o con foco de TECLADO. En una tableta el toque también
  // dispara «pointerenter», y el nombre se quedaba pegado tras navegar.
  const conAviso = (clave, texto) => ({
    onPointerEnter: (e) => { if (e.pointerType === 'mouse') abrir(clave, texto, e.currentTarget); },
    onPointerLeave: (e) => { if (e.pointerType === 'mouse') cerrarPronto(); },
    onFocus: (e) => { if (e.currentTarget.matches(':focus-visible')) abrir(clave, texto, e.currentTarget); },
    onBlur: cerrar,
  });

  const textoAviso = aviso && (aviso.clave === ALTERNAR ? (iconos ? 'Expandir' : 'Contraer') : aviso.texto);

  return (
    <nav aria-label="Módulos de la obra" className={'a-barra' + (iconos ? ' a-barra--iconos' : '')} style={{ width: ancho }}>
      <div className="a-barra__lista" onScroll={aviso ? cerrar : undefined}>
        <ul className="a-barra__grupos">
          {grupos.map((grupo, gi) => (
            <li key={grupo.titulo} className="a-barra__grupo">
              {iconos
                ? gi > 0 && <div className="a-barra__separador" aria-hidden="true" />
                : <div className="a-barra__titulo">{grupo.titulo}</div>}
              <ul className="a-barra__entradas">
                {grupo.items.map((item) => {
                  const esActiva = item.mode === activo;
                  return (
                    <li key={item.label}>
                      <button
                        type="button"
                        className={'a-barra__entrada' + (esActiva ? ' es-activa' : '')}
                        aria-current={esActiva ? 'page' : undefined}
                        // Contraída no hay texto: el nombre accesible va aquí.
                        aria-label={iconos ? item.label : undefined}
                        onClick={() => { if (item.onClick) item.onClick(); }}
                        {...(iconos ? conAviso(item.label, item.label) : {})}
                      >
                        {/* AL ENCOGER SE VA EL TEXTO, NO EL ICONO.
                            Medido con la barra en 60 px: el icono se aplastaba a
                            1,1-4,2 px. Icono y texto compartían una fila flex y
                            ninguno declaraba que no debe encogerse, así que el
                            texto --invisible por `overflow`, pero presente-- le
                            robaba el ancho, y cuanto más largo el nombre, más le
                            robaba. El icono no encoge NUNCA y el texto no se
                            dibuja cuando no cabe. */}
                        <span className="a-barra__icono">{item.icon}</span>
                        {!iconos && <span className="a-barra__texto">{item.label}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>

      <div className="a-barra__pie">
        <button
          type="button"
          className="a-barra__alternar"
          aria-label={iconos ? 'Expandir la barra lateral' : 'Contraer la barra lateral'}
          aria-expanded={!iconos}
          onClick={onAlternar}
          {...conAviso(ALTERNAR, null)}
        >
          <svg className="a-barra__flecha" aria-hidden="true" height="24" width="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20.75,12a.75.75,0,0,1-.75.75H10.49L12.76,15a.74.74,0,0,1,0,1.06.75.75,0,0,1-.53.22.79.79,0,0,1-.53-.22L8.15,12.53A.78.78,0,0,1,8,12.29a.73.73,0,0,1,0-.58.78.78,0,0,1,.16-.24L11.7,7.92a.75.75,0,0,1,1.06,0,.74.74,0,0,1,0,1.06l-2.27,2.27H20A.76.76,0,0,1,20.75,12Zm-16,8V4a.75.75,0,0,0-1.5,0V20a.75.75,0,0,0,1.5,0Z"></path></svg>
        </button>
      </div>

      {/* Fuera de la barra: la lista recorta todo lo que sale de ella. */}
      {aviso && posicion && createPortal(
        <div
          role="tooltip"
          className="a-barra__aviso"
          style={{ left: posicion.x, top: posicion.y }}
          onPointerEnter={cancelarCierre}
          onPointerLeave={cerrarPronto}
        >
          {textoAviso}
        </div>,
        document.body,
      )}
    </nav>
  );
}
