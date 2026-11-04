/**
 * QUÉ ESTÁ ELEGIDO EN EL LECTOR DE PLANOS: una sola máquina de estados (docs/archivos/25, P4).
 *
 * Antes lo elegido vivía en varios sitios —la marca en la capa de marcas, el panel del plano en el lector, el pedido al
 * panel, la marca que llegaba por la dirección— y dos efectos se cerraban el uno al otro, cada uno con su excepción
 * («salvo una nube de una incidencia»). Con una nube de ISS-A elegida, un clic en el pin de ISS-B dejaba la barra de A
 * abierta junto al panel de B. Aquí cada acto dice a la vez qué pasa con la barra de la marca y con el panel:
 *
 *   marca   la marca elegida (su barra), o null;
 *   que     lo que se pidió abrir en su barra («referencias», «comentarios»), o null;
 *   panel   el panel del plano: null, o { vista: 'lista' | 'nueva' | id de la incidencia, pin, nube };
 *   n       el número del último pedido: el panel lo atiende aunque se pida lo mismo dos veces seguidas;
 *   trasCambiar  la marca a elegir cuando llegue la otra versión («Llevar a la vigente»).
 *
 * El panel y la barra de una marca ocupan el mismo costado: elegir una marca cierra el panel, salvo que sea una NUBE de
 * una incidencia, cuya barra y cuyo panel van juntos. Es una función pura: se prueba sin pantalla.
 */

export const SIN_SELECCION = Object.freeze({ marca: null, que: null, panel: null, n: 0, trasCambiar: null });

const comoId = (x) => (x == null || x === '' ? null : (Number(x) || x));

export function seleccion(estado, accion) {
  switch (accion.tipo) {
    // Otro documento u otra versión: nada de lo anterior sigue elegido. Lo que pida la dirección («Mi trabajo»,
    // «Citado en») o la marca que se llevó a la vigente, sí.
    case 'documento': {
      const marca = comoId(estado.trasCambiar ?? accion.marca);
      const panel = accion.incidencia != null
        ? { vista: String(accion.incidencia), pin: null, nube: comoId(accion.nube) }
        : null;
      return { ...SIN_SELECCION, marca, panel, n: estado.n + 1 };
    }
    // Una marca. Si es nube de una incidencia, su panel se abre en ella; si no, el panel se cierra.
    case 'elegirMarca': {
      const panel = accion.incidencia != null
        ? { vista: String(accion.incidencia), pin: null, nube: comoId(accion.id) }
        : null;
      return { ...estado, marca: comoId(accion.id), que: accion.que ?? null, panel, n: estado.n + 1 };
    }
    case 'soltarMarca':
      return estado.marca == null ? estado : { ...estado, marca: null, que: null };
    // Una incidencia (su pin, su código en la barra, «Mi trabajo»). La barra solo sigue si es la de la nube pedida.
    case 'abrirIncidencia': {
      const nube = comoId(accion.nube);
      const sigue = nube != null && estado.marca != null && String(nube) === String(estado.marca);
      return { ...estado, marca: sigue ? estado.marca : null, que: sigue ? estado.que : null,
               panel: { vista: String(accion.id), pin: null, nube }, n: estado.n + 1 };
    }
    case 'nuevaIncidencia':
      return { ...estado, marca: null, que: null, panel: { vista: 'nueva', pin: accion.pin ?? null, nube: null },
               n: estado.n + 1 };
    case 'abrirLista':
      return { ...estado, marca: null, que: null, panel: { vista: 'lista', pin: null, nube: null }, n: estado.n + 1 };
    case 'cerrarPanel':
      return estado.panel == null ? estado : { ...estado, panel: null };
    case 'llevarA':
      return { ...estado, trasCambiar: comoId(accion.id) };
    default:
      return estado;
  }
}

/** Lo que el panel del plano necesita para atender el último pedido: { vista, pin, nube, n }, o null si está cerrado. */
export function pedidoAlPanel(estado) {
  return estado.panel ? { ...estado.panel, n: estado.n } : null;
}

/** Lo que la barra de la marca necesita para abrir algo en ella: { que, n }, o null. */
export function pedidoALaBarra(estado) {
  return estado.que ? { que: estado.que, n: estado.n } : null;
}
