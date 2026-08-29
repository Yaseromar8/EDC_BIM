// De donde sale el inventario segun se entre con sesion o por enlace.
//
// VIVE AQUI Y NO DENTRO DE App.jsx A PROPOSITO: la primera version estaba
// duplicada en el componente y la rejilla del inventario siguio pidiendo
// /api/inventory por su cuenta, que a un invitado le devuelve 401. Un ayudante
// compartido es lo que impide que ese desfase vuelva.
//
// Con sesion: /api/inventory?model_urn=... como siempre.
// Por enlace: /api/vista-compartida/<id>/inventario, que NO lleva obra en la
// peticion -- la resuelve el backend desde el identificador del enlace. Esa es
// la garantia: el invitado no puede leer otra obra porque no hay parametro que
// cambiar. /api/inventory sigue devolviendo 401 sin sesion.

export function enlaceCompartido() {
  try {
    return new URLSearchParams(window.location.search).get('shareView') || null;
  } catch { return null; }
}

export function urlInventario(base, obraId, { version = false } = {}) {
  const enlace = enlaceCompartido();
  if (enlace) {
    return `${base}/api/vista-compartida/${encodeURIComponent(enlace)}/inventario${version ? '/version' : ''}`;
  }
  const cola = obraId && obraId !== 'global' ? `?model_urn=${encodeURIComponent(obraId)}` : '';
  return `${base}/api/inventory${version ? '/version' : ''}${cola}`;
}
