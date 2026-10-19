// Mantiene la misma direccion de rueda al cambiar de Source/viewable.
// LMV puede aplicar preferencias de la vista durante la carga de geometria;
// el ajuste inicial del Viewer no basta para un frente federado como Canal.
// Canal y Drenaje comparten la convencion verificada por el propietario:
// rueda hacia adelante acerca. No dejar a Drenaje en false al cambiar de
// frente: el efecto de Viewer se vuelve a montar y anulaba su sentido correcto.
// 17-oct-2026, como ACC en TODAS las obras: la rueda hacia ADELANTE ACERCA y hacia atrás aleja (en este
// motor eso es la navegación invertida: probado por el propietario, con `false` la rueda alejaba), y el
// interruptor «Invertir dirección de zoom» se ve APAGADO, como en ACC. El perfil «AEC» de los RVT lo
// cambiaba al cargar cada modelo.
export const forwardWheelDirectionForScope = () => true;

export function installForwardWheelZoom(viewer, geometryLoadedEvent, stateRestoredEvent,
  reverseZoomDirection = false) {
  const apply = () => {
    // La PREFERENCIA, no solo la navegación: el perfil que LMV aplica al cargar cada modelo reescribe
    // la preferencia y, con ella, la navegación. Fijándola, el interruptor de Configuración dice lo
    // mismo que hace la rueda.
    // El interruptor, apagado como en ACC; lo que manda es la navegación, que va DESPUÉS.
    try {
      if (viewer?.prefs?.get?.('reverseMouseZoomDir') !== false) viewer?.prefs?.set?.('reverseMouseZoomDir', false);
    } catch { /* sin preferencias: basta la navegación */ }
    const navigation = viewer?.getNavigation?.() || viewer?.navigation;
    navigation?.setReverseZoomDirection?.(reverseZoomDirection);
  };
  apply();
  const perfil = globalThis.Autodesk?.Viewing?.PROFILE_CHANGE_EVENT;
  const events = [...new Set([geometryLoadedEvent, stateRestoredEvent, perfil].filter(Boolean))];
  for (const event of events) viewer?.addEventListener?.(event, apply);
  return () => {
    for (const event of events) viewer?.removeEventListener?.(event, apply);
  };
}
