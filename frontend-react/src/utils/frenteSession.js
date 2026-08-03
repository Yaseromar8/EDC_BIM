// frenteSession.js — LO DE UN FRENTE SE QUEDA EN ESE FRENTE.
//
// El visor guarda mucho estado en `window` para que módulos que no se hablan
// entre sí compartan datos pesados (el inventario, los mapas de identidad, los
// alineamientos). Cambiar de frente NO recarga la página, así que todo eso
// sobrevive: por eso el inventario de Canal aparecía en Drenaje Urbano.
//
// Ir cazando cada global suelta era interminable. Aquí están DECLARADOS todos
// los que pertenecen a un frente, con el valor al que vuelven. Un solo sitio
// que gobierna la regla, y una lista que crece cuando alguien añade un global
// nuevo — si no lo añade, el olvido se nota como una fuga y se corrige aquí,
// no en cinco archivos.
//
// La regla que separa las dos familias:
//   · ¿El dato describe ESTE frente (sus modelos, sus filtros, sus colores)?
//     → se reinicia.
//   · ¿Es infraestructura o preferencia del usuario (la instancia del visor,
//     una función, la calidad visual)? → se respeta.

// Estado que PERTENECE al frente. [nombre, valor al que vuelve]
const FRENTE_SCOPED = [
  // ── Inventario ───────────────────────────────────────────────────────────
  // El grande: 73 MB de filas compartidas para no bajarlas dos veces.
  ['postgresInventory', null],
  ['postgresInventoryUrn', null],
  ['__inventoryPreloadPromise', null],   // una descarga en curso del frente viejo
  ['__inventoryPreloadKey', null],
  ['__inventoryCacheSelectedColumns', null],  // columnas elegidas en el grid

  // ── Identidad del modelo ─────────────────────────────────────────────────
  // Mapas dbId↔extId del modelo cargado. Aplicarlos a otro modelo señala
  // elementos equivocados: es la fuga más silenciosa y la más dañina.
  ['rosettaToDbId', null],
  ['rosettaToExtId', null],
  ['rosettaValidExtIds', null],
  ['__modelLabelByUrn', null],
  ['__viewerLiveModels', null],

  // ── Filtros y coloreado ──────────────────────────────────────────────────
  ['_customValueColors', {}],
  ['__ecdSourceColorOn', false],
  ['__ecdSourceCustomColors', {}],
  ['__ecdSourceAssigned', {}],
  ['_lastCalculatedBuckets', null],
  ['_lastHasActiveFilters', false],
  ['_lastValidDbIds', null],
  ['_lastThemeEventConfig', null],
  ['_filterIsolationInProgress', false],

  // ── Capa de Ejecución / avance ───────────────────────────────────────────
  ['__zoneHoverField', null],
  ['__zoneHoverExecField', null],
  ['__zoneHoverColor', null],
  ['__pkHeatmap', null],

  // ── Obra civil ───────────────────────────────────────────────────────────
  ['__lobCivilAlignments', null],
  ['__lobScope', null],
  ['__civilToolsSession', null],
  ['__excavGhostStyle', null],

  // ── Árbol de modelos ─────────────────────────────────────────────────────
  ['__treeCache', null],
];

// NO se tocan. Van uno por uno y con su motivo, porque esta lista se audita:
// cualquier global que no esté ni arriba ni aquí es un olvido, y así se ve.
//   __mainViewer .................... la instancia del visor, viva entre frentes
//   viewer .......................... alias de lo mismo
//   __ghostCleanup .................. función de limpieza del holograma
//   __ecdReapplySourceTints ......... función que reaplica los tintes
//   __applyViewerVisualQuality ...... función de calidad visual
//   __ecdTintApplying ............... guarda de reentrancia, no es dato
//   __jsPDF ......................... librería cargada bajo demanda
//   __vq ............................ calidad visual: preferencia del USUARIO
//   __vqAoIntensity ................. idem (oclusión ambiental)
//   __vqAoRadius .................... idem
//   __vqBg .......................... color de fondo elegido por el usuario
//   __inventoryCache ................ ya está partido por frente (clave = urn)
//   __budgetPopup ................... ventana abierta; cerrarla es otra decisión
//   __inventoryPopup ................ idem
//   __lob4dDiag ..................... diagnóstico
//   __stabilityLog .................. diagnóstico
//   onPhotoUploadedCallback_for_background ... callback de subida de fotos

/**
 * Devuelve el estado de frente a su punto de partida.
 *
 * Se llama en UN solo lugar: al detectar cambio de frente. Además avisa a los
 * paneles que mantienen copia propia en estado de React, para que sus controles
 * (los puntitos de color, el selector abierto) se sincronicen.
 */
export function resetFrenteSession() {
  for (const [nombre, valor] of FRENTE_SCOPED) {
    try {
      window[nombre] = (valor && typeof valor === 'object') ? (Array.isArray(valor) ? [] : {}) : valor;
    } catch { /* un global protegido no debe abortar el resto */ }
  }

  // Cachés con API propia.
  try { window.__ecdSourceTintCache?.clear?.(); } catch { /* noop */ }

  // Los paneles escuchan y se ponen al día.
  try {
    window.dispatchEvent(new CustomEvent('custom-colors-restored', { detail: {} }));
    window.dispatchEvent(new CustomEvent('ecd-source-tints-reset'));
    window.dispatchEvent(new CustomEvent('ecd-frente-reset'));
  } catch { /* noop */ }
}

/** Los nombres, por si algún día hace falta auditarlos desde fuera. */
export const FRENTE_SCOPED_NAMES = FRENTE_SCOPED.map(([n]) => n);
