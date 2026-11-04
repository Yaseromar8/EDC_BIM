// `useNubesDeIncidencia(leer, id)`: las nubes de una incidencia desde la copia única (datosDeNubes.js), o null
// mientras llegan. Se piden frescas al montar, una sola vez aunque las pidan varios a la vez.
import { useEffect, useState } from 'react';
import { cargarNubes, clave, leerDe, nubesGuardadas } from './datosDeNubes.js';

export default function useNubesDeIncidencia(leer, id) {
  const [d, setD] = useState(() => (id != null ? nubesGuardadas(id) ?? null : null));
  useEffect(() => {
    if (id == null) { setD(null); return undefined; }
    const k = clave(id);
    setD(nubesGuardadas(k) ?? null);
    const dejar = leerDe(k, setD);
    cargarNubes(leer, k, { fresco: true }).catch(() => {});
    return dejar;
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- `leer` cambia en cada dibujado; la clave es el id
  return d;
}
