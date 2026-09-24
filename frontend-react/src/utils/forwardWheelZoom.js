// Mantiene la misma direccion de rueda al cambiar de Source/viewable.
// LMV puede aplicar preferencias de la vista durante la carga de geometria;
// el ajuste inicial del Viewer no basta para un frente federado como Canal.
export function installForwardWheelZoom(viewer, geometryLoadedEvent, stateRestoredEvent,
  reverseZoomDirection = false) {
  const apply = () => {
    const navigation = viewer?.getNavigation?.() || viewer?.navigation;
    navigation?.setReverseZoomDirection?.(reverseZoomDirection);
  };
  apply();
  const events = [...new Set([geometryLoadedEvent, stateRestoredEvent].filter(Boolean))];
  for (const event of events) viewer?.addEventListener?.(event, apply);
  return () => {
    for (const event of events) viewer?.removeEventListener?.(event, apply);
  };
}
