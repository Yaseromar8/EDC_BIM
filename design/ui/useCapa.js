// `useCapa(activa, opciones)`: mientras `activa`, la pieza es una capa que Escape y el clic fuera descartan (capas.js).
// Las opciones se leen en el momento de la tecla o del clic (la última versión), así que pueden cambiar en cada dibujado
// sin volver a registrar la capa.
import { useEffect, useRef } from 'react';
import { abrirCapa } from './capas.js';

export default function useCapa(activa, opciones) {
  const ultimas = useRef(opciones);
  ultimas.current = opciones;
  useEffect(() => {
    if (!activa) return undefined;
    const o = () => ultimas.current || {};
    return abrirCapa({
      nivel: o().nivel ?? 0,
      contiene: (t) => !!o().contiene?.(t),
      propios: (t) => !!(o().propios || o().contiene)?.(t),
      cerrar: (porque) => o().cerrar?.(porque),
      get alPulsarFuera() { return o().alPulsarFuera !== false; },
      get escapeDesdeCampos() { return !!o().escapeDesdeCampos; },
      get bloquea() { return !!o().bloquea; },
    });
  }, [activa]); // eslint-disable-line react-hooks/exhaustive-deps -- las opciones se leen al usarse
}
