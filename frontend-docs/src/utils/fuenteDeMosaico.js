// LA FUENTE DE UN MOSAICO: de dónde salen el manifiesto y las URL de las teselas
// de una lámina (paso B de docs/archivos/15). La usa la capa de mosaicos del
// lector (components/CapaMosaico.jsx).
//
// Aquí solo está la lógica, sin red: quien pregunta al servidor se pasa por
// parámetro (`preguntar`), así se prueba de verdad en Node
// (pruebas/fuenteDeMosaico.prueba.mjs). El lector la usa a través de
// utils/mosaicoRemoto.js, que le pone la ruta /api/docs/mosaico.
//
// LO QUE CUIDA:
//  · con el manifiesto llegan ya las URL de los niveles preparados (la hoja
//    entera y el primer acercamiento): el primer gesto no espera otra ida y
//    vuelta, que desde Perú cuesta 0,3-0,8 s;
//  · las de los niveles profundos se piden al llegar a ellos, del centro hacia
//    fuera y en lotes pequeños a la vez: el servidor las dibuja de una en una
//    por lámina, y así aparecen según salen y no todas al final. Las de un
//    nivel ya PREPARADO no hay que dibujarlas: van todas en una petición;
//  · mientras se pasea, las teselas que van entrando se juntan un momento
//    antes de pedirlas: una petición por gesto, no una por fotograma (el
//    servidor de producción se recicla cada ~300 peticiones);
//  · una tesela que falla se reintenta una vez y luego se deja: se ve el nivel
//    de abajo, nunca un bucle de peticiones.

export const AJUSTES = {
  // Recién subida, la lámina tarda unos segundos en tener mosaico: se vuelve a
  // mirar cada 5 s durante medio minuto y, si no, se sigue como hoy.
  reintentosSiSePrepara: 6,
  esperaSiSePrepara: 5000,
  juntarMs: 100,
  porLote: 6,          // teselas por peticion si el servidor tiene que dibujarlas
  porLotePreparado: 64, // ...y si ya estan (el tope del servidor)
  maxFallos: 2,
};

/**
 * @param documento  { node_id, version_id }: lo que se manda al servidor.
 * @param preguntar  (cuerpo, timeoutMs) => Promise<respuesta | null>; null si
 *                   falló (red, permiso, servidor): el lector sigue como hoy.
 */
export function crearFuente(documento, preguntar, ajustes = {}) {
  const A = { ...AJUSTES, ...ajustes };
  const urls = new Map();       // 'z/x_y' -> URL firmada
  const enCamino = new Set();   // pedidas (o a punto de pedirse) y sin respuesta
  const fallos = new Map();     // 'z/x_y' -> veces que no se pudo
  let cola = { z: null, teselas: [], avisar: null };
  let reloj = null;
  let preparados = new Set();   // niveles que el servidor ya tiene enteros

  const clave = (z, x, y) => `${z}/${x}_${y}`;
  const agotada = (k) => (fallos.get(k) || 0) >= A.maxFallos;
  const vaciarCola = () => {
    if (reloj) { clearTimeout(reloj); reloj = null; }
    cola.teselas.forEach(([x, y]) => enCamino.delete(clave(cola.z, x, y)));
    cola = { z: null, teselas: [], avisar: null };
  };

  const enviar = () => {
    reloj = null;
    const { z, teselas, avisar } = cola;
    cola = { z: null, teselas: [], avisar: null };
    const porLote = preparados.has(z) ? A.porLotePreparado : A.porLote;
    for (let i = 0; i < teselas.length; i += porLote) {
      const lote = teselas.slice(i, i + porLote);
      Promise.resolve(preguntar({ ...documento, z, teselas: lote }, 60000)).then((d) => {
        const llegadas = (d && d.urls) || {};
        lote.forEach(([x, y]) => {
          const k = clave(z, x, y);
          enCamino.delete(k);
          if (llegadas[k]) urls.set(k, llegadas[k]);
          else fallos.set(k, (fallos.get(k) || 0) + 1);
        });
        if (avisar) avisar();
      });
    }
  };

  return {
    clave: `doc:${documento.node_id || ''}:${documento.version_id || ''}`,

    // El manifiesto, o null si esa versión no tiene (no es un PDF, o falló).
    // `sigue()` dice si el lector sigue mirando este documento.
    async manifiesto(sigue) {
      for (let i = 0; i <= A.reintentosSiSePrepara; i += 1) {
        const d = await preguntar(documento, 20000);
        if (!sigue() || !d) return null;
        if (d.manifiesto) {
          Object.entries(d.urls || {}).forEach(([k, v]) => urls.set(k, v));
          preparados = new Set(d.manifiesto.preparados || []);
          return d.manifiesto;
        }
        if (!d.pendiente || i === A.reintentosSiSePrepara) return null;
        await new Promise((listo) => setTimeout(listo, A.esperaSiSePrepara));
        if (!sigue()) return null;
      }
      return null;
    },

    url(z, x, y) {
      const k = clave(z, x, y);
      return agotada(k) ? null : (urls.get(k) || null);
    },

    // Pide las que falten de esas (ya ordenadas del centro hacia fuera);
    // `avisar` se llama cada vez que llega un lote.
    pedir(z, teselas, avisar) {
      // Si cambió el nivel antes de enviar, lo encolado ya no hace falta.
      if (cola.z !== null && cola.z !== z) vaciarCola();
      const nuevas = teselas.filter(([x, y]) => {
        const k = clave(z, x, y);
        return !urls.has(k) && !enCamino.has(k) && !agotada(k);
      });
      if (!nuevas.length) return;
      nuevas.forEach(([x, y]) => enCamino.add(clave(z, x, y)));
      cola = { z, teselas: [...cola.teselas, ...nuevas], avisar };
      if (!reloj) reloj = setTimeout(enviar, A.juntarMs);
    },

    // La imagen no cargó (p. ej. la URL caducó con la lámina abierta un día
    // entero): se olvida y se vuelve a pedir, como mucho `maxFallos` veces.
    fallo(z, x, y) {
      const k = clave(z, x, y);
      urls.delete(k);
      fallos.set(k, (fallos.get(k) || 0) + 1);
    },

    cerrar: vaciarCola,
  };
}
