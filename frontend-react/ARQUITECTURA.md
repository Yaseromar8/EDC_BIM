# ARQUITECTURA DEL VISOR — `frontend-react` (ALEPHIA View)

> **Para quién es este documento.** Para una persona o una IA que tenga que trabajar
> en `frontend-react/` sin haberlo leído entero. Describe qué es cada módulo, qué
> hace, qué recibe, qué renderiza, a qué endpoints llama y **cómo se conectan entre
> sí**. Todo lo que hay aquí se **extrajo del código** el 4-sep-2026 (commit `95a6fe6`
> en `main`, con las modificaciones locales sin commitear del 4D incluidas) mediante
> inventario mecánico del fuente, build con sourcemap y cruce contra `backend/`. Donde
> una cifra o una relación no pudo verificarse, se dice.
>
> **Cómo usarlo.** Las secciones 1–9 explican el sistema. La sección 10 es la tabla
> de endpoints (contrato con el backend). La sección 11 es el **catálogo de los 98
> módulos**, uno por uno, con el mismo formato — busca el fichero por nombre.

---

## 0 · Qué es, en cinco líneas

- **SPA en React 19 + Vite 7**, JavaScript (0 TypeScript), **sin router**: la
  navegación es estado en `App.jsx` más parámetros de la URL. **63.407 líneas** en
  **98 módulos**; tres monolitos concentran el 22 %: `App.jsx` (5.015),
  `components/Viewer.jsx` (4.668) y `aps/extensions/LOB4DExtension.js` (4.522).
- Es el **visor 3D/2D de modelos BIM y civiles** sobre el **visor de Autodesk
  Platform Services** (LMV `viewer3D.min.js` 7.x, cargado por CDN en `index.html`),
  con carga **federada y alineada** de varios modelos, inventario de elementos,
  documentos anclados al modelo, fotos de obra, progresivas civiles, 4D por líneas de
  balance (LOB), presupuesto 5D, comparación de versiones, tablero de gráficos,
  realidad aumentada y enlace en vivo con Revit.
- Se sirve en **`https://visor.alephia.com.pe`** (Render, sitio estático; regla de
  reescritura `/api/*` → `visor-ecd-backend.onrender.com`). También se empaqueta como
  **APK Android** con **Capacitor 8** (`com.visoraps.app`) con AR nativo (ARCore).
- Habla con **un backend Flask** (`backend/`, mismo repositorio) por `/api/*`; con un
  segundo servicio, **PREDICT** (`VITE_PREDICT_URL`, por defecto `127.0.0.1:5001`)
  para `/api/graph/bim`; y con **Autodesk** directamente solo para descargar el visor
  y sus estilos (el token APS lo emite el backend en `/api/token`).
- Tiene un **portal hermano**, `frontend-docs` (ALEPHIA Docs, `https://alephia.com.pe`),
  que es el Hub de entrada. El visor vuelve a él con un ticket SSO (`utils/hubLink.js`).

---

## 1 · Arranque: de `index.html` a la primera pantalla

### 1.1 `index.html` (lo que existe antes de React)

Carga por CDN, en este orden: Font Awesome 5, **estilos y `viewer3D.min.js` de
Autodesk (`7.*`)**, tres familias de Google Fonts, **Tailwind Play CDN** con una
config inline (`primary #1473e6`, `darkMode: 'class'`), **Google Identity Services**
(`accounts.google.com/gsi/client`), **`webxr-polyfill@latest`** (sin fijar versión;
`window.polyfill = new WebXRPolyfill()`), y `<div id="root">` + `/src/main.jsx`.

Además carga como **módulos ES independientes, fuera de Vite**, tres extensiones
"legacy" desde `public/extensions/`: `base/BaseExtension.js`,
`logger/LoggerExtension.js`, `histogram/HistogramExtension.js` (+ `HistogramPanel.js`,
`utils/dom.js`, `utils/model.js`). Son la versión antigua de `src/aps/extensions/`;
conviven, no se importan desde `src/`.

### 1.2 `main.jsx`

`createRoot(#root).render(<StrictMode><ErrorBoundary scope="app"><App/></ErrorBoundary></StrictMode>)`.
En `import.meta.env.DEV` pinta un sello «LIVE-RELOAD» fijo arriba; en build no existe.

### 1.3 `App.jsx`: la secuencia de arranque (líneas reales)

`App` es **la raíz de todo el estado** (86 `useState`, 42 `useEffect`) y el único
sitio que decide qué pantalla se ve. No hay router: la pantalla es una función de
`user`, `selectedProject`, `isSharedMode` y varios flags.

1. **Modo compartido** — `isSharedMode` nace de `?shareView=<id>` (línea 772). Si
   está: `selectedProject` se construye desde `/api/vista-compartida/<id>`
   (1441-1451) y **no hay sesión**; el inventario sale de
   `/api/vista-compartida/<id>/inventario` (`utils/enlaceCompartido.js`, que existe
   precisamente para que la rejilla no vuelva a pedir `/api/inventory`, que a un
   invitado le da 401).
2. **Sesión** (605-623) — salvo que venga `?sso_ticket`, `apiFetch('/api/auth/me')`
   → `user`. Un 401 limpia `visor_selectedProject`.
3. **Ticket SSO desde el portal** (634-652) — `?sso_ticket` → `POST
   /api/auth/handoff/exchange` → `session_token` → `localStorage.visor_session_token`
   → `/api/auth/me` → se borra el parámetro de la URL.
4. **Entrada directa a un frente** (952-1040) — `?project=<id>&frente=<id>[&fn=<nombre>]`.
   `?pick=1` fuerza la Landing borrando `visor_selectedProject`.
5. **Sin `user`** → `<LoginScreen>`. **Con `user` y sin `selectedProject`** →
   `<LandingPage onSelectProject>`. **Con proyecto** → el layout del visor (§1.4).
   `selectedProject` se persiste en `localStorage.visor_selectedProject` (977-993) y
   al cambiar de frente `utils/frenteSession.js` reinicia los globales de `window`
   que pertenecen al frente (§5.3).
6. **Token APS** — `apiFetch('/api/token')` (1330) → `accessToken` → prop de
   `<Viewer>`. `Viewer.jsx` vuelve a pedirlo en `getAccessToken` (464-468) cuando el
   visor lo necesita refrescar.
7. **Modelos del frente** — `/api/config/project` (`routes/digital_twin.py:250`) →
   `config.models` → `setModels(...)` (2629, 2671) → `<Viewer models>`. Otras entradas
   a `setModels`: importar (2044, 2459, 2549, 2971), quitar (2990), relink (3012),
   modo compartido (3033).

### 1.4 El layout del visor (`App.jsx` 3888-5015)

```
<div class="app-layout">
  <TopBar/>                                   (3891)
  {showSplash && <splash/>}                   (3915)
  <rail izquierdo de botones>                 filtros · carpetas · progreso · 4D LOB · civil ·
                                              topografía · comparar · tablero · 5D · inventario
  {compareMode && <CompareView/>}             (4111)
  <LOB4DPanel/>                               (4117)  → lob4d/LOB4DWorkspace
  {geoPanelOpen && <GeoControlPanel/>}        (4125)
  <TandemSidebar/>                            (4166)  paneles: filtros / carpetas / progreso / búsqueda IA
    <ErrorBoundary><Viewer …35 props…/>       (4334-4339)
    <ProfilePanel/> <SheetViewerPanel/>       (4386, 4390)
    <Suspense><DashboardWorkspace/>           (4395)  único React.lazy
    avisos: webglLost · permToast · relocatingPin · pinPrompt
    <ViewerLabelsBar rightSlot={<SectionCutTool/> <LinkRevitBadge/>}/>   (4561-4567)
    {budgetTabOpen && <BudgetTree/>}          (4643)
    {inventoryTabOpen && <InventoryDataGrid/>}(4698)
  {activeSheet && panel dividido}             (4713)  <PdfReader/> | <SecondaryViewer/>
  paneles flotantes: <PhotoAlbumModal/> (4873) <ProgressDetailPanel/> (4895) <DocPinPanel/> (4917)
  modales: <ImportModelModal/> <ViewsPanel/> <AddDocumentModal/> <FilterConfiguratorModal/>
  {nativeArActive && <NativeARView/>}         (4998)
  <DocumentManager/>                          (5004)
</div>
```

Muchos botones del rail exigen `isAdminUser` (título «(requiere permisos)»).

---

## 2 · Autenticación y sesión

- **`utils/apiFetch.js`** es la única puerta de red autenticada: añade
  `Authorization: Bearer <visor_session_token>` (localStorage, si no sessionStorage);
  si el backend devuelve **401**, borra `visor_user`, `visor_session_token`,
  `visor_selectedProject`, olvida los permisos de lectura (`permisosDeLectura`) y
  **emite el evento `auth-expired`**, que `App.jsx` escucha para volver al login.
  Excluye `AUTH_ENDPOINTS` (`login`, `register`, `google`). **No hay `DEMO_TOKEN`**: sin
  sesión devuelve `null` y el backend responde 401.
- **`components/LoginScreen.jsx`** (textos ES/EN en un diccionario `t`; tiene dos
  claves `volver` duplicadas por idioma, inofensivo): `POST /api/auth/login` → si
  `requiere_2fa`, guarda `desafio` y pide código → `POST /api/auth/2fa/verify`;
  registro `POST /api/auth/register` (con `?invite=`); recuperación
  `POST /api/auth/forgot-password` y `POST /api/auth/reset-password` (`?reset=<token>`
  en la URL, luego inicia sesión sola); **Google** con `window.google.accounts.id`
  (`VITE_GOOGLE_CLIENT_ID`) → `POST /api/auth/google`. En APK usa la URL absoluta del
  backend; en web, ruta relativa (nunca al backend del proveedor).
- **`utils/permisosDeLectura.js`** — las `<img>` y el lector de PDF no pueden mandar
  cabecera, así que piden **permisos firmados por fichero** a `POST
  /api/docs/asset-tokens` (24 h, un solo fichero), los guardan en **sessionStorage**
  y los reutilizan para que la caché del navegador funcione. Hook `useUrlFirmada`.
- **Vuelta al Hub** — `utils/hubLink.js`: `goToHub()` pide `POST /api/auth/handoff`
  (ticket de un solo uso, 60 s) y navega a `${VITE_DOCS_URL}?hub=1&sso_ticket=…`.
  `VITE_DOCS_URL` = `https://alephia.com.pe` en producción (respaldo:
  `visor-ecd-portal.onrender.com`). El atajo Visor→Documentos está apagado
  (`VISOR_DOCS_SHORTCUT = false`).

---

## 3 · Elegir la obra y el frente

- **`components/LandingPage.jsx`** — `GET /api/hubs` y `GET /api/projects` (hubs y
  proyectos de ACC vía backend) y `GET /api/frentes?base=<id>` (frentes propios de
  un proyecto base; `POST /api/frentes` crea uno). `onSelectProject({...})` → App
  `setSelectedProject`.
- **`components/NativeFileTree.jsx`** (APK) — navega `hubs → projects → topFolders →
  contents` del Data Management de APS a través de `/api/hubs/...`.
- **`components/ImportModelModal.jsx`** — añade modelos al frente
  (`POST /api/config/project/add`), extrae inventario (`POST /api/inventory/extract`,
  `GET …/status`), lista viewables (`GET /api/inventory/viewables`), purga
  (`POST /api/inventory/purge-source`). Subida directa a APS OSS desde `App.jsx`:
  `POST /api/modelos/firmar-subida` → `PUT` a la URL firmada →
  `POST /api/modelos/cerrar-subida` → `POST /api/config/project/upload/finalize`.
  Actualizaciones: `check-updates`, `update`, `update-all`, `relink`, `remove`.
- **`utils/frenteSession.js`** — al cambiar de frente **no se recarga la página**, así
  que los datos pesados que viven en `window` sobrevivirían. Este módulo declara la
  lista `FRENTE_SCOPED` (`postgresInventory`, `postgresInventoryUrn`,
  `__inventoryPreloadPromise`, …) y los devuelve a su valor inicial, emitiendo
  `ecd-frente-reset` y `ecd-source-tints-reset`. Regla: lo que describe **este**
  frente se reinicia; lo que es infraestructura o preferencia se respeta.

---

## 4 · El visor de Autodesk (`components/Viewer.jsx`)

### 4.1 Inicialización (464-550)

```
Autodesk.Viewing.Initializer({ …, getAccessToken: cb => apiFetch('/api/token') → cb(token, expires) }, () => {
  theExtensionManager.registerExtension('BaseExtension'      , BaseExtension)        // 494
  theExtensionManager.registerExtension('IconMarkupExtension', IconMarkupExtension)  // 495
  theExtensionManager.registerExtension('ProgressiveExtension', ProgressiveExtension)// 496
  theExtensionManager.registerExtension('LOB4DExtension'     , LOB4DExtension)       // 497
  const viewer = new Autodesk.Viewing.GuiViewer3D(containerRef.current, config)      // 525
  viewer.setTheme('dark-theme')                                                       // 530
  window.viewer = viewer; window.NOP_VIEWER = viewer;                                 // 549-550
  window.__mainViewer = viewer                                                        // 933
})
```

`window.viewer` / `window.NOP_VIEWER` / `window.__mainViewer` son **el puente** por el
que los módulos que no reciben el visor por props (extensiones, `ViewerLabelsBar`,
`lob4d/*`, `native/*`, `SectionCutTool`) lo alcanzan.

### 4.2 Carga federada y alineada (1946-2215)

`loadModelSequentially(model)` (2215) carga los modelos **uno detrás de otro** para
que compartan `globalOffset`: `Autodesk.Viewing.Document.load` (1958) →
`loadDocumentNode(doc, viewable, loadOptions)` (2103/2117) **solo con nodos
`type=geometry`**, `applyScaling: 'mm'`, `applyRefPoint: true` (2063-2064),
`globalOffset` capturado del primer modelo y reutilizado (2085, 2134-2135), y si el
viewable trae `placementTransform`, `setModelTransform(matrix)` (2155-2161). La misma
receta, reutilizable para cualquier visor embebido (4D, Comparar, AR), está en
**`aps/utils/loadAlignedModels.js`** — úsala en vez de reimplementarla.

### 4.3 Lo que escucha del LMV y lo que devuelve a `App`

Eventos LMV: `OBJECT_TREE_CREATED`, `GEOMETRY_LOADED`, `SELECTION_CHANGED`,
`AGGREGATE_SELECTION_CHANGED`, `ISOLATE` (×2), `SHOW_ALL`.

Recibe **35 props** de `App` (modelos, sprites, pines de documento/construcción/
seguimiento, modos de colocación, `activeSheet`, `accessToken`, `aiModelCommand`,
`hideToolbar`, `relocatingPin`…) y devuelve por callbacks: `onSheetsLoaded`,
`onViewablesLoaded`, `onModelProperties`, `onSelectionChanged`, `onSpriteSelect/Delete`,
`onPlacementComplete`, `onDocPlacementComplete`, `onDocPinSelect`,
`onBuildPinCreate/Select`, `onTrackingPinCreate/Click`, `onPinRelocateComplete`.

**«Rosetta»** — al cargar, `Viewer` construye los mapas `window.rosettaToDbId`,
`window.rosettaToExtId`, `window.rosettaValidExtIds` entre el `externalId` de Revit y
el `dbId` del LMV, y emite `rosetta-ready`. Todo lo que colorea o aísla por
inventario pasa por ahí.

### 4.4 Extensiones

| Extensión | Qué es | Quién la carga |
|---|---|---|
| `IconMarkupExtension` (propia, `aps/extensions/`) | iconos DOM anclados a puntos 3D para documentos/sprites | `Viewer.jsx:2255` |
| `LOB4DExtension` (propia, **protegida**) | 4D: tematizado por fecha, cursor de progresiva, rótulos de zona, hover, excavación fantasma | `CivilToolsPanel.jsx:755`, `lob4d/LOB4DViewer.jsx:127` |
| `ProgressiveExtension` (propia) | marcadores de progresivas y cortes de sección arrastrables sobre el alineamiento | registrada en 496; **no se encontró una carga por nombre literal** — comprobar antes de asumirla activa |
| `BaseExtension` (propia) | clase base: engancha árbol/selección/aislamiento y emite `viewer-model-properties` | superclase de las anteriores |
| `Autodesk.BIM360.Extension.PushPin` | pines de construcción (`buildPins`) | `Viewer.jsx:3336` |
| `Autodesk.AEC.Minimap3DExtension` | minimapa | `Viewer.jsx:2498-2508` (`minimapActive`) |
| `Autodesk.Viewing.Extensions.VR` | VR | `Viewer.jsx:2520-2531` (`vrActive`) |
| `Autodesk.DataVisualization` | mapas de calor / sprites de datos | `aps/utils/DataVizEngine.js` |
| `Autodesk.Section` | planos de corte | `components/SectionCutTool.jsx:237` |

`aps/extensions/DeviceOrientationExtension.js` (giroscopio) **no la importa nadie**.

---

## 5 · Cómo se conectan los módulos (léelo antes de tocar nada)

Hay **cuatro mecanismos** conviviendo. Cualquier cambio tiene que respetar los cuatro.

### 5.1 Props desde `App.jsx`

`App` renderiza 36 componentes y les baja estado y callbacks. El estado es plano en
`App` (86 `useState`; la lista completa está en su ficha, §11). No hay contexto de
React ni gestor de estado externo: **cualquier cambio de un panel re-renderiza desde
la raíz**.

### 5.2 El bus de eventos DOM (`window.dispatchEvent(new CustomEvent(...))`)

Es la conexión real entre módulos que no comparten props: **80 eventos
personalizados**. Los importantes, por dominio:

| Dominio | Evento | Emite → Escucha |
|---|---|---|
| Sesión | `auth-expired` | `apiFetch` → `App` |
| Frente | `ecd-frente-reset`, `ecd-source-tints-reset`, `ecd-source-tints-restore`, `custom-colors-restored` | `frenteSession`/`App` → `TandemFilterPanel` |
| Visor → App | `rosetta-ready`, `viewer-geometry-loaded`, `viewer-show-all`, `viewer-state-captured`, `viewer-webgl-lost/restored`, `viewer-model-properties` (desde `BaseExtension`) | `Viewer` → `App` |
| App → Visor | `viewer-request-state`, `viewer-restore-state`, `viewer-select`, `recalculate-filters`, `theme-property-bucket`, `isolate-property-bucket`, `filters-apply` | `App`/`InventoryDataGrid`/`TandemFilterPanel` → `Viewer` |
| Filtros ↔ inventario | `filters-calculated`, `filters-reset-all`, `inventory-highlight-row`, `inventory-selection-sync`, `inventory-isolation-sync`, `inventory-needs-refresh`, `restore-inventory-config`, `close-inventory` | `Viewer`/`TandemFilterPanel`/`InventoryDataGrid` ↔ `App` |
| Barra superior | `toggle-progressives`, `toggle-station-tracker`, `toggle-workfronts-panel` | `TopBar` → `Viewer` |
| Civil | `civil-data-changed`, `civil-data-updated`, `station-drag-update` (`ProgressiveExtension` → `StationTracker`), `LOB4D_PK_CONTEXT_CHANGED` | `CivilToolsPanel`/`App`/extensiones |
| Excavación fantasma | `ghost-earthworks`, `ghost-earthworks-body` → `App`; `ghost-earthworks-result` → `ViewerLabelsBar`; `lob-ghost-excavation(-result)` ↔ `LOB4DExtension` | `ViewerLabelsBar` ↔ `App`/`LOB4DExtension` |
| **LOB 4D** | `lob-play`, `lob-seek`, `lob-time-update`, `lob-scope-change`, `lob-clear`, `lob-focus-elements`, `lob-isolate-state`, `lob-derive-stations` → `lob-stations-derived`, `lob-param-scan` → `lob-param-scanned`, `lob-param-step/clear`, `lob-activities-found`, `LOB4D_DIAG`, `LOB4D_EXCAV_FRONT_CHANGED`, `LOB4D_PARAM_PHASE_CHANGED` | `lob4d/LOB4DWorkspace`/`LOB4DViewer` ↔ `LOB4DExtension` |
| Rótulos y hover de zona | `lob-zone-labels(-result)`, `lob-group-labels(-result)`, `lob-zone-hover`, `lob-zone-hover-data/-error`, `lob-pk-heatmap`, `zona-rotulo-click/-cerrar`, `viewer-toggle-profile`, `viewer-profile-state` | `ViewerLabelsBar` ↔ `LOB4DExtension`/`ProfilePanel` |
| PREDICT | `predict-avance-listo` | `lib/predictBim` → `LOB4DExtension` |
| Presupuesto | `budget-tandem-highlight` → `Viewer`; `budget-select-partidas`; `viewer-schema-extracted` → `BudgetTree` | `BudgetTree` ↔ `Viewer`/`App` |
| Tablero | `tablero-width` → `App`; `viewer-colors-applied` → `LinkRevitBadge` | `DashboardWorkspace`/`Viewer` |
| Otros | `phasing-get-properties`/`phasing-properties`, `maqPinUpdateFromTooltip`, `viewer-open-doc-panel`, `unhandledrejection` (App lo captura) | |

Eventos con emisor **no localizado en `src/`** (`filters-apply`, `isolate-property-bucket`,
`lob-play`, `lob-seek`, `lob-group-labels-result`, `lob-zone-labels-result`,
`phasing-properties`, `maqPinUpdateFromTooltip`): o se emiten con nombre construido
dinámicamente, o desde las extensiones de `public/extensions/`, o están muertos.
Compruébalo antes de depender de ellos.

### 5.3 Globales en `window` (estado compartido fuera de React)

Los módulos comparten datos pesados colgándolos de `window`. Los principales y su
dueño:

| Global | Qué es | Dueño |
|---|---|---|
| `viewer`, `NOP_VIEWER`, `__mainViewer` | la instancia `GuiViewer3D` | `Viewer.jsx` |
| `postgresInventory`, `postgresInventoryUrn`, `__inventoryCache`, `__inventoryPreloadPromise`, `__inventoryPreloadKey`, `__inventoryCacheSelectedColumns` | el inventario del frente (hasta ~73 MB), su URN, la caché y la descarga en curso | `App.jsx` / `InventoryDataGrid` / `utils/inventoryCache` |
| `rosettaToDbId`, `rosettaToExtId`, `rosettaValidExtIds` | mapas externalId ↔ dbId | `Viewer.jsx` |
| `__lobCivilAlignments`, `__civilToolsSession` | alineamientos civiles y la sesión del panel civil | `CivilToolsPanel` / `lob4d/LOB4DViewer` |
| `__lob4dDiag`, `__pkHeatmap`, `__excavGhostStyle`, `__zoneHoverField/Color/ExecField`, `__predictAvance`, `__modelLabelByUrn`, `__viewerLiveModels` | estado del 4D, mapa de calor por PK, estilo de la excavación fantasma, hover de zona, avance de PREDICT | `LOB4DExtension` / `ViewerLabelsBar` / `predictBim` |
| `_customValueColors`, `__ecdSourceCustomColors`, `__ecdSourceColorOn`, `__ecdSourceAssigned`, `_lastHasActiveFilters`, `_lastValidDbIds`, `_filterIsolationInProgress`, `_lastCalculatedBuckets`, `_lastThemeEventConfig` | colores y filtros vigentes | `TandemFilterPanel` / `Viewer` |
| `__vq`, `__vqBg`, `__vqAoRadius`, `__vqAoIntensity` | calidad visual (preferencia) | `ProfilePanel` |
| `__treeCache`, `__stabilityLog`, `onPhotoUploadedCallback_for_background` | caché del árbol, registro de estabilidad, callback de subida en segundo plano | varios |

**`utils/frenteSession.js` es la autoridad** sobre cuáles de estos se reinician al
cambiar de frente. Si añades un global que describe el frente, añádelo ahí o el dato
del frente anterior se filtrará al siguiente.

### 5.4 Almacenamiento del navegador

| Dónde | Clave | Qué |
|---|---|---|
| localStorage | `visor_session_token`, `visor_user` | sesión (por origen: cambiar de dominio obliga a entrar de nuevo) |
| localStorage | `visor_selectedProject` | último frente abierto |
| localStorage | `profile_panel_h`, baseline del LOB (`lob4dUtils`) | preferencias |
| sessionStorage | permisos de lectura firmados | `permisosDeLectura` |
| IndexedDB `edc_cde` / `inventory` | caché del inventario por huella de versión (`/api/inventory/version`) | `utils/inventoryCache.js` |
| IndexedDB `visor_upload_queue` / `pending_photos` | fotos pendientes de subir; se reanudan al recargar | `services/uploadQueue.js` |

### 5.5 Variables de entorno (`import.meta.env`, se hornean al compilar)

`VITE_BACKEND_URL` (17 sitios; vacío = mismo origen), `VITE_API_URL`, `VITE_DOCS_URL`
(= `https://alephia.com.pe`), `VITE_GOOGLE_CLIENT_ID`, `VITE_PREDICT_URL`. En **APK**
(`Capacitor.isNativePlatform()`) 17 ficheros caen a la URL absoluta
`https://visor-ecd-backend.onrender.com` porque el WebView no tiene origen propio.

---

## 6 · Dominios funcionales: quién hace qué y con qué endpoints

**Inventario de elementos** — `InventoryDataGrid` (rejilla, exporta con `xlsx`),
`TandemFilterPanel` + `FilterConfiguratorModal` (facetas y colores), `ColumnConfiguratorModal`,
`HeatmapConfigPanel` (paletas), `aps/utils/DataVizEngine` (mapas de calor con
`Autodesk.DataVisualization`), `utils/inventoryCache` (IndexedDB), `utils/enlaceCompartido`.
Endpoints: `GET /api/inventory[?model_urn]` (`server.py:1235`), `GET /api/inventory/version`,
`PATCH /api/inventory/bulk` (`server.py:1651`). Los colores llegan al visor por
`theme-property-bucket`; la selección viaja por `viewer-select`/`inventory-selection-sync`.

**Documentos anclados y pines** — `DocPinPanel` (lista, búsqueda, IA), `DocumentManager`
(carpetas y subida), `DocsPanel`/`DocumentPanel`, `AddDocumentModal`, `PdfReader`
(pdf.js directo) / `SecondaryViewer` (segundo visor LMV para un URN) / `SheetViewerPanel`
(láminas 2D), `IconMarkupExtension` (iconos 3D). Endpoints: familia `/api/docs/*`
(`routes/documents.py`: `list`, `folder`, `delete`, `upload-url`, `upload-confirm`,
`proxy`, `batch`, `asset-tokens`), `/api/documents[/link|/upload]`, `/api/element-docs`
(`routes/element_docs.py` — **sustituye a `/api/docs/mutate-bind`, que ya no existe pero
`App.jsx` y `DocPinPanel.jsx` aún llaman**), `/api/pins` (`routes/pins.py`). IA:
`/api/ai/ask`, `/api/ai/analyze-title`, `/api/ai/warmup` (`DocPinPanel`) y
`/api/ai/universal-search` (`App` → `TandemSidebar` → `DiscoverySearchPanel`).

**Fotos de obra** — `PhotoAlbumModal` (álbum por pin, EXIF con `exifr`),
`CameraCapture`, `services/uploadQueue` (IndexedDB, reanuda), `services/uploadService`
(`axios` con progreso). Flujo: captura → IndexedDB → `POST /api/docs/upload-url` (URL
firmada) → `PUT` directo a GCS → `POST /api/docs/upload-confirm`. Callback global
`window.onPhotoUploadedCallback_for_background`.

**Seguimiento y progreso** — `ProgressDetailPanel` (partidas, avance), `BuildPanel`
(pines de construcción con `PushPin`), `StationTracker`, `WorkfrontsPanel`, pines de
seguimiento en `Viewer`. Endpoints: `/api/project-pins` (`routes/tracking.py`),
`/api/build/signed-read` (`server.py:271`).

**Civil / obra lineal** — `CivilToolsPanel` (2.105 líneas: alineamientos, secciones,
superficies, Design Automation), `SectionViewer`, `SectionCutTool`,
`ghostEarthworks.js` (corte/relleno), `ProgressiveExtension`, `GeoControlPanel`
(puntos de control y amarre UTM). Endpoints: `/api/civil/alignments|sections|surfaces`
(GET/POST/DELETE), `extract-curves|extract-sections-test|extract-surfaces` (POST, Design
Automation), `workitem-status`, `alignment-result` (`routes/civil_design_automation.py`,
`civil_solids.py`), `earthworks-mesh` (`civil_ghost.py`), `earthworks-solids`
(`civil_solids.py`), `base-axis` (`server.py:1417`), `/api/geo/control-points|georef`
(`routes/geo_control.py`). **Regla del proyecto: la matemática no vive en el visor —
llega en JSON del backend.** `workers/alignmentWorker.js` (PK más cercano en un Web
Worker) **no lo usa nadie**.

**LOB 4D (PROTEGIDO)** — `LOB4DPanel` → `lob4d/LOB4DWorkspace` (1.824 líneas; orquesta
`EdtExplorer`, `LineBalanceView`, `ProgressMatrixView`, `ControlView`, `WorkPackagePanel`,
`LinearPlanningView`, `LOB4DViewer` embebido con `loadAlignedModels`,
`executiveReport` en jsPDF, `lob4dUtils`, `partidaTaxonomy`/`partidaPatterns`,
`peruvianCalendar`), la extensión `LOB4DExtension` (tematizado por fecha,
`simulate4D`, cursor de progresiva, rótulos de zona, hover, excavación fantasma) y
`ViewerLabelsBar` (perfiles, rótulos, mapa de calor por PK, `predictBim`).
Endpoints: `/api/lob/import|timeline|datasets|links|links/rebuild|locations`
(`routes/lob4d.py`), `/api/lob/linear/state|bootstrap` (`routes/lob4d_linear.py`) y
**`/api/graph/bim` en PREDICT** (`lib/predictBim.js`: catálogo en memoria + detalle
cacheado; `VITE_PREDICT_URL`). Se comunican casi exclusivamente por el bus `lob-*`.

**Presupuesto 5D** — `BudgetTree` + `budgetEngine.js`, exporta con `exceljs`.
`GET /api/presupuesto/<model_urn>`, `POST /import`, `POST /import-json`
(`routes/presupuesto.py`). Resalta en el visor con `budget-tandem-highlight`.

**Comparar versiones** — `CompareView`: `/api/compare/versions|prepare-version|diff|
extracted|metrados|element|element-metrados|cleanup` (`routes/compare.py`).

**Tablero de análisis** — `dashboard/DashboardWorkspace` (**el único `React.lazy`**),
`ChartCard`, `ChartEditor`, `engine.js` (motor puro), `chartjsTheme` (`chart.js`).
`/api/dashboards` (`routes/dashboards.py`). Sincroniza colores con el visor
(`viewer-colors-applied`).

**Vistas guardadas y enlaces compartidos** — `ViewsPanel`: `/api/views` (`routes/views.py`);
captura/restaura estado del visor con `viewer-request-state`/`viewer-state-captured`/
`viewer-restore-state`. Enlace público: `/api/vista-compartida/<id>` (`server.py:1507`).

**Enlace en vivo con Revit** — `LinkRevitBadge`: `/api/link/status` (sondeo),
`/api/link/cmd`, `/api/link/report`; `App` anuncia presencia con `/api/link/web-presence`.

**Realidad aumentada** — `NativeARView` (72 commits en 90 días: el frente más activo),
`ArCornerPanel`, `ArAdjustPanel`, y `native/*`: `arcore.js` (plugin Capacitor
`registerPlugin`; **`?arsim=1`** activa `arSim.js`, un simulador con la misma forma de
eventos para desarrollar en escritorio), `arViewerBridge.js` (pose ARCore Y-arriba/m →
cámara LMV Z-arriba/mm), `arCornerCalib.js` + `registrationCorner.js` + `modelFacePick.js`
(calibración por esquina, la de Revizto), `registration3p.js` (Horn 1987, tres pares de
puntos), `geoAnchor.js` (WGS84 → UTM 17S, EPSG:32717) + `georefFit.js` (Helmert 2D +
cota), `arStake.js` (estaca de verificación). En navegador cae a WebXR (polyfill).

**Perfil y calidad visual** — `ProfilePanel` (globales `__vq*`), `TopBar` (marca,
conmutadores), `TandemIcons` (iconos SVG), `ErrorBoundary` (`scope` para acotar).

---

## 7 · Empaquetado y despliegue

- **Build**: `vite build` → `dist/`. `esbuild.pure` elimina `console.log/debug` en
  producción (191 en el fuente, 0 servidos). `manualChunks`: `vendor`, `xlsx`, `pdf`
  — **`vendor` sale casi vacío** (12 kB) porque en React 19 lo que pesa es
  `react-dom/client` y no está en la lista; los 525 kB de `react-dom` caen en el
  chunk principal. `chunkSizeWarningLimit: 1600` no acalla el aviso: el principal pesa
  **3,08 MB** (28 % `pdfjs-dist`, 16 % `exceljs`, 42 % código propio). `pdf` y `xlsx`
  van como `modulepreload`: se descargan en la primera carga aunque no se usen.
- **Producción**: Render, sitio estático `visor-ecd-frontend`, `rootDir frontend-react`,
  `npm run build`, publica `frontend-react/dist`; reescrituras `/api/* →
  https://visor-ecd-backend.onrender.com/api/*` y `/* → /index.html`. Dominio
  `visor.alephia.com.pe`. **Auto-Deploy en `Off`**: un push a `main` no publica; hay que
  hacer Manual Deploy. Cloudflare cachea `index.html` 5 min (`s-maxage=300`).
- **APK**: Capacitor 8, `capacitor.config.json` (`webDir: dist`, `server.url
  http://192.168.10.75:5173` = configuración de **desarrollo** con live-reload;
  `capacitor.config.prod.json` para producción), plugins `core`, `app`, `filesystem`,
  `network`, `@capawesome/background-task`, `CapacitorHttp` activado; carpeta
  `android/` (91 ficheros versionados, sin artefactos de build).
- **CI** (`.github/workflows/ci.yml`): `npm ci && npm run build`. **No lintea, no
  prueba** (no hay pruebas: 0 ficheros `.test`).
- **Dev**: `vite --host`; proxy `/api`, `/maps/uploads`, `/docs/uploads` →
  `http://127.0.0.1:3000` (el backend local).

---

## 8 · Zonas protegidas y reglas de trabajo para una IA

1. **No modificar ni un byte**: `aps/extensions/LOB4DExtension.js`,
   `components/ViewerLabelsBar.jsx`, `lib/predictBim.js`, `components/lob4d/*`. Es
   regla del propietario. Tres de ellos tienen **cambios locales sin commitear** desde
   el 22-ago-2026 (+518/−116), respaldados en la rama `respaldo/4d-22ago` (`44a4746`).
   Los `.bak` que hay al lado son copias manuales anteriores.
2. **La matemática civil/AR/4D no vive en el visor**: llega calculada del backend (JSON)
   o vive en `native/*` como geometría pura. No dupliques cálculo en componentes.
3. **Reutiliza** `apiFetch` (nunca `fetch` a `/api` sin él), `loadAlignedModels`
   (nunca otra receta de carga), `frenteSession` (todo global de frente se declara
   ahí), `permisosDeLectura` (nunca pegues el token de sesión a una URL de imagen).
4. **Antes de emitir o escuchar un evento nuevo**, busca si ya existe en §5.2. El bus
   no tiene tipos ni registro: un nombre mal escrito falla en silencio.
5. **No hay red de seguridad**: 0 pruebas, lint fuera del CI. Verifica en el
   navegador. `npm run lint` da 17.036 errores porque `eslint.config.js` solo ignora
   `dist` y traga `dist-banco/`, `public/` y `android/`; sobre `src/` son **381**.
6. Ficheros sin versionar que no son código de producto: `dist-banco/`,
   `probar-primitivas.*`, `vite.banco.config.js` (banco de pruebas de UX-01) y los
   `.bak`.

---

## 9 · Defectos conocidos (medidos el 4-sep-2026; no los «descubras» otra vez)

| Tipo | Dónde | Qué |
|---|---|---|
| `ReferenceError` alcanzable | `components/TandemSidebar.jsx:233-237` | `universalSearch` no está en el ámbito: abrir el panel `search` revienta el render |
| `ReferenceError` alcanzable | `components/DocPinPanel.jsx:1007`, `:1045` | `handleClearSearch` y `statusFilter` no existen: escribir en el buscador revienta |
| `ReferenceError` alcanzable | `components/PhotoAlbumModal.jsx:187` | `firmarUrls` no existe: las fotos pendientes no se firman |
| `ReferenceError` alcanzable | `components/lob4d/LOB4DWorkspace.jsx:954` (**protegido**) | `setSimPlaying?.()` sobre nombre no declarado |
| Hooks condicionales (crash latente) | `DocPinPanel.jsx` (38), `PhotoAlbumModal.jsx` (29), `lob4d/LineBalanceView.jsx` (8) | `return` temprano antes de hooks; hoy no revienta porque el padre monta/desmonta |
| Endpoint inexistente | `App.jsx`, `DocPinPanel.jsx` → `/api/docs/mutate-bind`; `DocumentManager.jsx` → `/api/docs/upload-complete` | el backend no los sirve |
| Clave duplicada | `LoginScreen.jsx:45/68` y `:99/112` | `volver` dos veces por idioma (valores iguales) |
| Módulos muertos | `aps/extensions/DeviceOrientationExtension.js`, `components/CivilStationTracker.jsx`, `components/PdfViewer.jsx`, `workers/alignmentWorker.js` | nadie los importa |
| Activos muertos | `public/canal.png` 6,2 MB, `drenaje.png` 6,0 MB, `logo.png` 1,5 MB | no referenciados; viajan en el APK |
| Dependencias | `d3`, `sass`, `sass-embedded` sin usar; `xlsx` 0.18 (vulnerable, sin arreglo en npm) y `exceljs` (dos librerías de Excel); `pdfjs-dist` 5.7 (aviso alto); `axios` 2 usos frente a 12 `fetch` | `npm audit`: 35 (2 críticas, 23 altas, la mayoría de utillaje) |
| CDN en producción | `cdn.tailwindcss.com` (Play CDN, ~10 usos reales), `webxr-polyfill@latest` sin fijar | `index.html:26`, `:51` |
| URLs a mano | 17 ficheros con `visor-ecd-backend.onrender.com` | parte es el respaldo legítimo del APK |
| Duplicados con `frontend-docs` | `LoginScreen`, `ErrorBoundary`, `apiFetch`, `uploadQueue`, `uploadService` | dos copias de la misma cola de subida y de la pantalla de acceso |

---

## 10 · Contrato con el backend: cada endpoint y su manejador

89 endpoints distintos. Manejador = fichero y línea del decorador `@route` en
`backend/`. «≈» = resuelto por prefijo (el visor recorta la ruta antes de un
parámetro). Métodos tal como los declara Flask.

| Endpoint que llama el visor | Manejador en `backend/` | Métodos | Lo llama | Nota |
|---|---|---|---|---|
| `/api/ai/analyze-title` | `routes/ai.py:826` | POST | DocPinPanel.jsx |  |
| `/api/ai/ask` | `routes/ai.py:336` | POST | DocPinPanel.jsx |  |
| `/api/ai/universal-search` | `routes/ai.py:576` | POST | App.jsx |  |
| `/api/ai/warmup` | `routes/ai.py:275` | POST | DocPinPanel.jsx |  |
| `/api/auth/2fa/verify` | `routes/auth.py:1715` | POST | LoginScreen.jsx |  |
| `/api/auth/forgot-password` | `routes/auth.py:536` | POST | LoginScreen.jsx |  |
| `/api/auth/google` | `routes/auth.py:293` | POST | LoginScreen.jsx, utils/apiFetch.js |  |
| `/api/auth/handoff` | `routes/auth.py:517` | POST | utils/hubLink.js |  |
| `/api/auth/handoff/exchange` | `routes/auth.py:526` | POST | App.jsx |  |
| `/api/auth/login` | `routes/auth.py:402` | POST | LoginScreen.jsx, utils/apiFetch.js |  |
| `/api/auth/me` | `routes/auth.py:791` | GET | App.jsx |  |
| `/api/auth/register` | `routes/auth.py:663` | POST | LoginScreen.jsx, utils/apiFetch.js |  |
| `/api/auth/reset-password` | `routes/auth.py:600` | POST | LoginScreen.jsx |  |
| `/api/build/signed-read` | `server.py:271` | POST | App.jsx |  |
| `/api/civil/alignment-result` | `routes/civil_design_automation.py:857` | GET | App.jsx, CivilToolsPanel.jsx |  |
| `/api/civil/alignments` | `routes/civil_design_automation.py:756` | GET,POST,DELETE | App.jsx, CivilToolsPanel.jsx |  |
| `/api/civil/base-axis` | `server.py:1417` | GET,PUT | App.jsx, CivilToolsPanel.jsx |  |
| `/api/civil/earthworks-mesh` | `routes/civil_ghost.py:1017` | GET | App.jsx |  |
| `/api/civil/earthworks-solids` | `routes/civil_solids.py:853` | GET | App.jsx |  |
| `/api/civil/extract-curves` | `routes/civil_design_automation.py:95` | POST | App.jsx, CivilToolsPanel.jsx |  |
| `/api/civil/extract-sections-test` | `routes/civil_design_automation.py:279` | POST | App.jsx, CivilToolsPanel.jsx |  |
| `/api/civil/extract-surfaces` | `routes/civil_solids.py:186` | POST | CivilToolsPanel.jsx |  |
| `/api/civil/sections` | `routes/civil_design_automation.py:639` | GET,POST,DELETE | App.jsx, CivilToolsPanel.jsx |  |
| `/api/civil/surfaces` | `routes/civil_solids.py:123` | GET,POST | CivilToolsPanel.jsx |  |
| `/api/civil/workitem-status` | `routes/civil_design_automation.py:916` | GET | App.jsx, CivilToolsPanel.jsx | coincide por prefijo: 1 rutas debajo (`/api/civil/workitem-status/<workitem_id>`…) |
| `/api/compare/cleanup` | `routes/compare.py:468` | POST | CompareView.jsx |  |
| `/api/compare/diff` | `routes/compare.py:278` | POST | CompareView.jsx |  |
| `/api/compare/element` | `routes/compare.py:654` | POST | CompareView.jsx |  |
| `/api/compare/element-metrados` | `routes/compare.py:607` | POST | CompareView.jsx |  |
| `/api/compare/extracted` | `routes/compare.py:485` | GET | CompareView.jsx |  |
| `/api/compare/metrados` | `routes/compare.py:508` | POST | CompareView.jsx |  |
| `/api/compare/prepare-version` | `routes/compare.py:400` | POST | CompareView.jsx |  |
| `/api/compare/versions` | `routes/compare.py:348` | GET | CompareView.jsx |  |
| `/api/config/project` | `routes/digital_twin.py:250` | GET | App.jsx, CompareView.jsx |  |
| `/api/config/project/add` | `routes/digital_twin.py:331` | POST | App.jsx |  |
| `/api/config/project/check-updates` | `routes/digital_twin.py:1422` | POST | App.jsx |  |
| `/api/config/project/relink` | `routes/digital_twin.py:1319` | POST | App.jsx |  |
| `/api/config/project/remove` | `routes/digital_twin.py:1258` | POST | App.jsx |  |
| `/api/config/project/update` | `routes/digital_twin.py:388` | POST | App.jsx |  |
| `/api/config/project/update-all` | `routes/digital_twin.py:553` | POST | App.jsx |  |
| `/api/config/project/upload/finalize` | `routes/digital_twin.py:946` | POST | App.jsx |  |
| `/api/dashboards` | `routes/dashboards.py:113` | POST | dashboard/DashboardWorkspace.jsx |  |
| `/api/docs` | `routes/documents.py:413` | POST | DocPinPanel.jsx, PhotoAlbumModal.jsx | coincide por prefijo: 54 rutas debajo (`/api/docs/asset-tokens`…) |
| `/api/docs/asset-tokens` | `routes/documents.py:413` | POST | utils/permisosDeLectura.js |  |
| `/api/docs/batch` | `routes/documents.py:1962` | POST | DocPinPanel.jsx |  |
| `/api/docs/delete` | `routes/documents.py:1232` | DELETE | DocumentManager.jsx |  |
| `/api/docs/folder` | `routes/documents.py:1041` | POST | DocumentManager.jsx |  |
| `/api/docs/list` | `routes/documents.py:875` | GET | DocumentManager.jsx |  |
| `/api/docs/mutate-bind` | **NO EXISTE** | — | App.jsx, DocPinPanel.jsx | `routes/element_docs.py:3` lo declara sustituido por `/api/element-docs`; el visor aún lo llama |
| `/api/docs/proxy` | `routes/documents.py:734` | GET,OPTIONS | App.jsx, DocPinPanel.jsx, PhotoAlbumModal.jsx, services/uploadQueue.js, utils/permisosDeLectura.js |  |
| `/api/docs/upload-complete` | **NO EXISTE** | — | DocumentManager.jsx | ninguna ruta del backend responde; lo llama `DocumentManager.jsx` |
| `/api/docs/upload-confirm` | `routes/documents.py:1537` | POST | PhotoAlbumModal.jsx, services/uploadQueue.js |  |
| `/api/docs/upload-url` | `routes/documents.py:1500` | POST | DocumentManager.jsx, PhotoAlbumModal.jsx, services/uploadQueue.js |  |
| `/api/documents` | `routes/documents.py:617` | GET | App.jsx | coincide por prefijo: 2 rutas debajo (`/api/documents/<int:node_id>`…) |
| `/api/documents/link` | `routes/documents.py:617` | GET | AddDocumentModal.jsx |  |
| `/api/documents/upload` | `routes/documents.py:617` | GET | AddDocumentModal.jsx |  |
| `/api/element-docs` | `routes/element_docs.py:39` | GET | DocsPanel.jsx |  |
| `/api/frentes` | `routes/digital_twin.py:1095` | DELETE | LandingPage.jsx |  |
| `/api/geo/control-points` | `routes/geo_control.py:63` | GET | GeoControlPanel.jsx, NativeARView.jsx |  |
| `/api/geo/georef` | `routes/geo_control.py:150` | GET | GeoControlPanel.jsx, NativeARView.jsx |  |
| `/api/graph/bim` | **PREDICT** (servicio aparte) | GET | lib/predictBim.js | `VITE_PREDICT_URL`, por defecto `http://127.0.0.1:5001` — NO es este backend |
| `/api/hubs` | `routes/projects.py:198` | GET | ImportModelModal.jsx, LandingPage.jsx, NativeFileTree.jsx |  |
| `/api/inventory` | `server.py:1235` | GET | InventoryDataGrid.jsx, utils/enlaceCompartido.js |  |
| `/api/inventory/bulk` | `server.py:1651` | PATCH | InventoryDataGrid.jsx |  |
| `/api/inventory/extract` | `routes/inventory.py:825` | POST | App.jsx, CompareView.jsx, ImportModelModal.jsx |  |
| `/api/inventory/extract/status` | `routes/inventory.py:851` | GET | App.jsx, CompareView.jsx, ImportModelModal.jsx | coincide por prefijo: 1 rutas debajo (`/api/inventory/extract/status/<job_id>`…) |
| `/api/inventory/purge-source` | `routes/digital_twin.py:1220` | POST | ImportModelModal.jsx |  |
| `/api/inventory/viewables` | `routes/inventory.py:864` | GET | ImportModelModal.jsx | coincide por prefijo: 1 rutas debajo (`/api/inventory/viewables/<path:urn>`…) |
| `/api/link/cmd` | `routes/link.py:93` | POST | LinkRevitBadge.jsx |  |
| `/api/link/report` | `routes/link.py:258` | POST | LinkRevitBadge.jsx |  |
| `/api/link/status` | `routes/link.py:173` | GET | LinkRevitBadge.jsx |  |
| `/api/link/web-presence` | `routes/link.py:206` | POST | App.jsx |  |
| `/api/lob/datasets` | `routes/lob4d.py:672` | GET | lob4d/LOB4DWorkspace.jsx |  |
| `/api/lob/import` | `routes/lob4d.py:386` | POST | lob4d/LOB4DWorkspace.jsx |  |
| `/api/lob/linear/bootstrap` | `routes/lob4d_linear.py:164` | POST | lob4d/LOB4DWorkspace.jsx |  |
| `/api/lob/linear/state` | `routes/lob4d_linear.py:146` | GET | lob4d/LOB4DWorkspace.jsx |  |
| `/api/lob/links` | `routes/lob4d.py:734` | GET | lob4d/LOB4DWorkspace.jsx |  |
| `/api/lob/links/rebuild` | `routes/lob4d.py:765` | POST | lob4d/LOB4DWorkspace.jsx |  |
| `/api/lob/locations` | `routes/lob4d.py:801` | POST | lob4d/LOB4DWorkspace.jsx |  |
| `/api/lob/timeline` | `routes/lob4d.py:635` | GET | lob4d/LOB4DWorkspace.jsx |  |
| `/api/modelos/cerrar-subida` | `routes/digital_twin.py:850` | POST | App.jsx |  |
| `/api/modelos/firmar-subida` | `routes/digital_twin.py:802` | POST | App.jsx |  |
| `/api/pins` | `routes/pins.py:104` | POST | App.jsx |  |
| `/api/presupuesto` | `routes/presupuesto.py:57` | GET | BudgetTree.jsx | prefijo del blueprint; rutas `/<path:model_urn>`, `/import`, `/import-json` |
| `/api/project-pins` | `routes/tracking.py:300` | GET | App.jsx |  |
| `/api/projects` | `routes/projects.py:275` | GET | LandingPage.jsx, NativeFileTree.jsx |  |
| `/api/token` | `server.py:672` | GET | App.jsx, Viewer.jsx |  |
| `/api/views` | `routes/views.py:154` | GET | App.jsx |  |
| `/api/vista-compartida` | `server.py:1507` | GET | utils/enlaceCompartido.js | coincide por prefijo: 2 rutas debajo (`/api/vista-compartida/<view_id>/inventario`…) |

---

## 11 · Catálogo de módulos (98), uno por uno

Formato fijo por ficha: propósito (cabecera del fichero, si la tiene) · exporta · props · estado · hooks · renderiza · importa · **lo importan** · endpoints · almacenamiento · extensiones · eventos · variables · funciones con su línea. Extraído mecánicamente: donde un campo no aparece es que no se detectó, no que no exista.

## Entrada y raiz

_2 módulos, 5044 líneas._

### `App.jsx` — 5016 líneas

> Raíz de la aplicación y dueña de todo el estado: sesión, frente elegido, modelos, paneles abiertos, pines, filtros, hojas 2D, AR. Decide qué pantalla se ve (login / landing / visor) sin router. Ver §1.3 y §1.4 para la secuencia de arranque y el árbol de pantalla con sus líneas.

- **Exporta:** default `App`
- **Props:** ninguna — es la raíz (la firma `{ open, availableProperties, selectedIds, onClose, onSave, onReset }` que aparece en el fichero es de un subcomponente interno: el configurador de columnas/filtros)
- **Estado local (`useState`):** 86 — `pendingSelection`, `availableQuery`, `selectedQuery`, `hideLocations`, `includeMultiLevel`, `user`, `permToast`, `webglLost`, `models`, `relinkTargetModel`, `extractionJobs`, `hiddenModelUrns`, `isSharedMode`, `sharedViewData`, `savedViews`, `documents`, `sprites`, `activeSpriteId`, `showSprites`, `spritePlacementActive`, `activePanel`, `compareMode`, `panelVisible`, `inventoryTabOpen`, `inventoryPanelHeight`, `budgetTabOpen`, `budgetPoppedOut`, `budgetPanelHeight`, `lob4dTabOpen`, `geoPanelOpen`, `tableroOpen`, `tableroW`, `sidebarWidth`, `isolatedExtIds`, `importModalOpen`, `documentsModalOpen`, `filterConfiguratorOpen`, `availableProperties`, `filterProperties`, `filterSelections` …
- **Hooks:** `useCallback`×36, `useEffect`×42, `useMemo`×2, `useRef`×4, `useState`×86
- **Renderiza:** `AddDocumentModal`, `BudgetIcon`, `BudgetTree`, `CivilRoadIcon`, `CompareView`, `DashboardWorkspace`, `DocPinPanel`, `DocumentManager`, `ErrorBoundary`, `FilterConfiguratorModal`, `FilterIcon`, `FolderIcon`, `FourDIcon`, `GeoControlPanel`, `ImportModelModal`, `InventoryDataGrid`, `InventoryIcon`, `LOB4DPanel`, `LandingPage`, `LinkRevitBadge`, `LoginScreen`, `NativeARView`, `PdfReader`, `PhotoAlbumModal`, `ProfilePanel`, `ProgressDetailPanel`, `ProgressIcon`, `React.Suspense`, `SecondaryViewer`, `SectionCutTool`, `SheetViewerPanel`, `TandemSidebar`, `TopBar`, `Viewer`, `ViewerLabelsBar`, `ViewsPanel`
- **Importa (local):** `./App.css`, `./components/AddDocumentModal`, `./components/BudgetTree`, `./components/CompareView`, `./components/DocPinPanel`, `./components/DocumentManager`, `./components/DocumentPanel`, `./components/ErrorBoundary`, `./components/FilterConfiguratorModal`, `./components/GeoControlPanel`, `./components/ImportModelModal`, `./components/InventoryDataGrid`, `./components/LOB4DPanel`, `./components/LandingPage`, `./components/LinkRevitBadge`, `./components/LoginScreen`, `./components/NativeARView`, `./components/NativeFileTree`, `./components/PdfReader`, `./components/PhotoAlbumModal`, `./components/ProfilePanel`, `./components/ProgressDetailPanel`, `./components/SecondaryViewer`, `./components/SectionCutTool`, `./components/SheetViewerPanel`, `./components/SourceFilesPanel`, `./components/TandemFilterPanel`, `./components/TandemSidebar`, `./components/TopBar`, `./components/Viewer`, `./components/ViewerLabelsBar`, `./components/ViewsPanel`, `./native/arcore`, `./services/uploadQueue`, `./services/uploadService`, `./utils/apiFetch`, `./utils/enlaceCompartido`, `./utils/frenteSession`, `./utils/inventoryCache`
- **Carga perezosa:** `./components/dashboard/DashboardWorkspace`, `./components/ghostEarthworks`
- **Paquetes:** `@capacitor/app`, `@capacitor/network`, `@capawesome/capacitor-background-task`, `react`
- **Lo importan:** `main.jsx`
- **Endpoints del backend:** `/api/ai/universal-search`, `/api/auth/handoff/exchange`, `/api/auth/me`, `/api/build/signed-read`, `/api/civil/alignment-result`, `/api/civil/alignments`, `/api/civil/base-axis`, `/api/civil/earthworks-mesh`, `/api/civil/earthworks-solids`, `/api/civil/extract-curves`, `/api/civil/extract-sections-test`, `/api/civil/sections`, `/api/civil/workitem-status`, `/api/config/project`, `/api/config/project/add`, `/api/config/project/check-updates`, `/api/config/project/relink`, `/api/config/project/remove`, `/api/config/project/update`, `/api/config/project/update-all`, `/api/config/project/upload/finalize`, `/api/docs/mutate-bind`, `/api/docs/proxy`, `/api/documents`, `/api/inventory/extract`, `/api/inventory/extract/status`, `/api/link/web-presence`, `/api/modelos/cerrar-subida`, `/api/modelos/firmar-subida`, `/api/pins`, `/api/project-pins`, `/api/token`, `/api/views`, `/api/views`
- **Llamadas de red:** `apiFetch`×39, `fetch`×3
- **Almacenamiento:** localStorage `visor_selectedProject`, `visor_session_token`, `visor_user`; sessionStorage `visor_session_token`
- **Capacitor:** `@capacitor/app`, `@capacitor/network`, `@capawesome/capacitor-background-task`
- **Eventos DOM:** emite `civil-data-updated`, `custom-colors-restored`, `ecd-source-tints-restore`, `ghost-earthworks-result`, `inventory-needs-refresh`, `lob-pk-heatmap`, `phasing-get-properties`, `recalculate-filters`, `restore-inventory-config`, `theme-property-bucket`, `viewer-request-state`, `viewer-restore-state`, `viewer-schema-extracted`, `viewer-select`; escucha `auth-expired`, `civil-data-changed`, `error`, `filters-calculated`, `ghost-earthworks`, `ghost-earthworks-body`, `inventory-highlight-row`, `inventory-isolation-sync`, `inventory-needs-refresh`, `maqPinUpdateFromTooltip`, `message`, `mousemove`, `mouseup`, `phasing-properties`, `rosetta-ready`, `tablero-width`, `unhandledrejection`, `viewer-geometry-loaded`, `viewer-model-properties`, `viewer-schema-extracted`, `viewer-show-all`, `viewer-state-captured`, `viewer-webgl-lost`, `viewer-webgl-restored`
- **Variables de entorno:** `VITE_BACKEND_URL`
- **Funciones de módulo (línea):** `normalizeRevitCategory`:109, `ARIcon`:121, `FilterIcon`:131, `GearIcon`:143, `RevertIcon`:154, `ClusterIconTandem`:165, `SearchIconTandem`:171, `PaletteIconTandem`:177, `SearchIcon`:183, `TargetIcon`:190, `FolderIcon`:202, `DocumentIcon`:214, `ProgressIcon`:230, `FourDIcon`:251, `CivilRoadIcon`:261, `InventoryIcon`:271, `BudgetIcon`:283, `normalizePropertyList`:304, `groupProperties`:333, `formatPropertyValue`:358, `getPropertyKeyFromRaw`:368, `FilterConfigurator`:374, `App`:573
- **Funciones internas del componente (línea):** `handleSave`:406, `handleLoginSuccess`:588, `denyAccess`:676, `handleLogout`:683, `onAuthExpired`:692, `push`:704, `onRejection`:708, `onError`:712, `onGlLost`:713, `onGlRestored`:714, `onW`:796, `tagInventory`:809, `handlePopoutMessage`:818, `forwardIsolation`:844, `forwardHighlight`:875, `handleBudgetMessage`:901, `onShowAll`:922, `beat`:1115, `toggleSpritesVisibility`:1138, `handleUniversalSearch`:1162, `handleOpenDocByNodeId`:1233, `handleViewablesLoaded`:1267, `togglePanel`:1276, `toggleRail`:1309, `handleLoadSpecificView`:1314, `getToken`:1328, `handleDocPinComplete`:1340, `handleDocPinSelect`:1383, `handleModelProperties`:1404, `handleSchemaExtracted`:1411, `handleGeometryLoaded`:1470, `handleSaveView`:1544, `handleStateCapture`:1545, `handleDeleteView`:1592, `handleLoadView`:1602, `handleToggleModelVisibility`:1689, `norm`:1691, `handleProperties`:1726, `handleExternalProps`:1735, `resetFiltersToDefault`:1773, `resolvePin`:1808, `attempt`:1827, `fetchPayload`:1886, `onToggle`:1905, `onCivilChanged`:1945, `onBody`:1977, `fetchInventoryResilient`:2054, `handleRefresh`:2230, `checkForUpdates`:2302, `triggerBackgroundExtraction`:2341, `stopPoll`:2367, `handleModelUpdate`:2421, `handleUpdateAll`:2506, `pending`:2507, `updatedResults`:2553, `handleLinkDocs`:2595, `handleExtractCivilData`:2767, `report`:2774, `wait`:2777, `runWorkitem`:2779, `handleLocalUpload`:2905, `report`:2910, `removeModel`:2988, `loadSingleModel`:3029, `fetchSignedRead`:3036, `addDocuments`:3054, `removeDocument`:3068, `addSprite`:3072, `requestSpritePlacement`:3089, `handlePlacementComplete`:3102, `handleSpriteDelete`:3111, `handleSpriteSelect`:3118, `fetchTracking`:3135, `fetchDocPins`:3162, `resumePendingUploads`:3187, `handleTooltipUpdate`:3243, `saveTrackingData`:3252, `findPinCategory`:3291, `commitTrackingPin`:3299, `handleTrackingPinCreate`:3308 …(+22)

### `main.jsx` — 28 líneas

> Sello de LIVE-RELOAD: solo en modo desarrollo (dev server). En el APK de obra vite compila con DEV=false y el sello desaparece — antes era un texto fijo que salía SIEMPRE y mentía sobre desde dónde cargaba la app.

- **Exporta (con nombre):** —
- **Renderiza:** `App`, `ErrorBoundary`, `StrictMode`
- **Importa (local):** `./App.jsx`, `./components/ErrorBoundary.jsx`, `./index.css`
- **Paquetes:** `react`, `react-dom/client`
- **Lo importan:** *(nadie — entrada, huérfano, o cargado por otra vía)*
- **Variables de entorno:** `DEV`


## Infraestructura: utils/, services/, lib/, workers/

_11 módulos, 1230 líneas._

### `lib/predictBim.js` — 189 líneas · **PROTEGIDO — no modificar**

> Cliente del cerebro PREDICT (obra PQT-8). --------------------------------------------------------------------------- Traduce el código de agrupación del modelo (el mismo valor del parámetro compartido de Revit) a las partidas del expediente: metrado, precio, valorizado. El visor solo aporta el código; el dato vive en PREDICT y siempre llega fresco — al cargar una valorización nueva no hay que tocar ni el modelo ni e

- **Exporta (con nombre):** `coberturaPredict`, `codigosPredict`, `detallePredict`, `iniciarPredict`, `predictListo`, `resumenPredict`, `soles`
- **Lo importan:** `components/ViewerLabelsBar.jsx`
- **Endpoints del backend:** `/api/graph/bim`
- **Llamadas de red:** `fetch`×1
- **Eventos DOM:** emite `predict-avance-listo`
- **Funciones de módulo (línea):** `_url`:29, `_pedir`:31, `iniciarPredict`:45, `publicarAvance`:127, `resumenPredict`:143, `detallePredict`:149, `predictListo`:171, `codigosPredict`:172, `coberturaPredict`:175, `soles`:187
- **Funciones internas del componente (línea):** `p`:155

### `services/uploadQueue.js` — 246 líneas

> 📸 Upload Queue Service (Dalux-style Background Uploads) Saves photos to IndexedDB immediately when captured. If the page is closed/refreshed before the upload finishes, the queue automatically resumes on next page load. Flow: 1. User takes photo → saved instantly to IndexedDB (survives refresh/close) 2. Upload starts in background 3. On success → removed from IndexedDB 4. On page reload → pending uploads auto-resume

- **Exporta (con nombre):** `dequeuePhoto`, `enqueuePhoto`, `getPendingCount`, `getPendingPhotos`, `getPendingThumbnails`, `processPendingUploads`
- **Props:** `id`, `file`, `pinId`, `modelUrn`, `uploadPath`, `captureDate`, `desc`
- **Carga perezosa:** `../utils/apiFetch`, `./uploadService`
- **Lo importan:** `App.jsx`, `components/PhotoAlbumModal.jsx`
- **Endpoints del backend:** `/api/docs/proxy`, `/api/docs/upload-confirm`, `/api/docs/upload-url`
- **Llamadas de red:** `apiFetch`×2
- **Funciones de módulo (línea):** `openDB`:21, `enqueuePhoto`:39, `dequeuePhoto`:80, `getPendingPhotos`:99, `getPendingCount`:125, `getPendingThumbnails`:135, `processPendingUploads`:162

### `services/uploadService.js` — 42 líneas

> Uploads a file with progress tracking. @param {File} file - The file to upload. @param {string} url - The endpoint or signed URL. @param {Object} options - Additional options. @param {Function} options.onProgress - Callback for progress (0-100). @param {boolean} options.isDirect - If true, it uses a PUT request (Direct to GCS/S3). @param {Object} options.formData - Optional form data labels/projects if not direct.

- **Exporta (con nombre):** `uploadFile`
- **Paquetes:** `axios`
- **Lo importan:** `App.jsx`, `components/DocumentManager.jsx`, `components/PhotoAlbumModal.jsx`, `services/uploadQueue.js`
- **Llamadas de red:** `axios.post`×1, `axios.put`×1
- **Funciones de módulo (línea):** `uploadFile`:12

### `utils/apiFetch.js` — 96 líneas

> apiFetch — Centralized authenticated fetch for Visor 3D Automatically injects session token on every API request. Redirects to login on 401 (expired/invalid session). See frontend-docs/src/utils/apiFetch.js for full documentation.

- **Exporta (con nombre):** `apiFetch`, `getUploadAuthHeaders`
- **Carga perezosa:** `./permisosDeLectura.js`
- **Lo importan:** `App.jsx`, `components/AddDocumentModal.jsx`, `components/BudgetTree.jsx`, `components/CivilToolsPanel.jsx`, `components/CompareView.jsx`, `components/DocPinPanel.jsx`, `components/DocsPanel.jsx`, `components/DocumentManager.jsx`, `components/GeoControlPanel.jsx`, `components/ImportModelModal.jsx`, `components/InventoryDataGrid.jsx`, `components/LandingPage.jsx`, `components/LinkRevitBadge.jsx`, `components/NativeARView.jsx`, `components/NativeFileTree.jsx`, `components/PhotoAlbumModal.jsx`, `components/Viewer.jsx`, `components/dashboard/DashboardWorkspace.jsx`, `components/lob4d/LOB4DWorkspace.jsx`, `services/uploadQueue.js`, `utils/hubLink.js`, `utils/permisosDeLectura.js`
- **Endpoints del backend:** `/api/auth/google`, `/api/auth/login`, `/api/auth/register`
- **Llamadas de red:** `apiFetch`×1, `fetch`×1
- **Almacenamiento:** localStorage `visor_selectedProject`, `visor_session_token`, `visor_user`; sessionStorage `visor_session_token`, `visor_user`
- **Eventos DOM:** emite `auth-expired`
- **Funciones de módulo (línea):** `getToken`:12, `clearSession`:18, `apiFetch`:32, `getUploadAuthHeaders`:90

### `utils/enlaceCompartido.js` — 28 líneas

> De donde sale el inventario segun se entre con sesion o por enlace. VIVE AQUI Y NO DENTRO DE App.jsx A PROPOSITO: la primera version estaba duplicada en el componente y la rejilla del inventario siguio pidiendo /api/inventory por su cuenta, que a un invitado le devuelve 401. Un ayudante compartido es lo que impide que ese desfase vuelva. Con sesion: /api/inventory?model_urn=... como siempre.

- **Exporta (con nombre):** `enlaceCompartido`, `urlInventario`
- **Lo importan:** `App.jsx`, `components/InventoryDataGrid.jsx`
- **Endpoints del backend:** `/api/inventory`, `/api/vista-compartida`
- **Funciones de módulo (línea):** `enlaceCompartido`:14, `urlInventario`:20

### `utils/frenteSession.js` — 113 líneas

> frenteSession.js — LO DE UN FRENTE SE QUEDA EN ESE FRENTE. El visor guarda mucho estado en `window` para que módulos que no se hablan entre sí compartan datos pesados (el inventario, los mapas de identidad, los alineamientos). Cambiar de frente NO recarga la página, así que todo eso sobrevive: por eso el inventario de Canal aparecía en Drenaje Urbano. Ir cazando cada global suelta era interminable. Aquí están DECLARA

- **Exporta (con nombre):** `FRENTE_SCOPED_NAMES`, `resetFrenteSession`
- **Lo importan:** `App.jsx`
- **Eventos DOM:** emite `custom-colors-restored`, `ecd-frente-reset`, `ecd-source-tints-reset`
- **Funciones de módulo (línea):** `resetFrenteSession`:93

### `utils/hubLink.js` — 53 líneas

> hubLink.js — Única salida del Visor hacia la otra app. REGLA DE NAVEGACIÓN (simétrica a DOCS_VISOR_SHORTCUT en frontend-docs): dentro del Visor no hay atajo a Documentos. Lo único que ofrece es "Inicio" → el Hub, la pantalla donde se elige producto; allí las dos tarjetas están activas y el gate de Docs (solo admin) hace su trabajo. Se cierran los puentes laterales, no el camino normal. El Hub vive en la app de Docs, 

- **Exporta (con nombre):** `DOCS_URL`, `VISOR_DOCS_SHORTCUT`, `goToHub`
- **Importa (local):** `./apiFetch`
- **Lo importan:** `components/LandingPage.jsx`, `components/TopBar.jsx`
- **Endpoints del backend:** `/api/auth/handoff`
- **Llamadas de red:** `apiFetch`×1
- **Variables de entorno:** `VITE_BACKEND_URL`, `VITE_DOCS_URL`
- **Funciones de módulo (línea):** `goToHub`:44

### `utils/inventoryCache.js` — 49 líneas

> ── Caché local del inventario CDE (IndexedDB) ────────────────────────────── Patrón estándar de los software grandes (Tandem/ACC/Notion): el cliente guarda el dataset una vez; en cada apertura compara una HUELLA de versión (~100 bytes) con el servidor y solo re-descarga si algo cambió. localStorage no sirve aquí (límite ~5MB); IndexedDB maneja cientos de MB.

- **Exporta (con nombre):** `getCachedInventory`, `setCachedInventory`
- **Lo importan:** `App.jsx`
- **Funciones de módulo (línea):** `openDb`:10, `getCachedInventory`:23, `setCachedInventory`:36

### `utils/permisosDeLectura.js` — 143 líneas

> Permisos de lectura para etiquetas <img> y para el lector de PDF. POR QUE EXISTE Las fotos de obra se sirven por /api/docs/proxy, y una etiqueta <img> no puede mandar cabecera de autorización. La solución que había era pegar `?session_token=<sesión>` a la URL — y esa URL se GUARDABA en la base de datos y se compartía por WhatsApp. Es decir: quien recibía la foto heredaba la sesión entera del que la subió: 7 días, reu

- **Exporta (con nombre):** `firmarUrl`, `firmarUrls`, `olvidarPermisos`, `useUrlFirmada`
- **Estado local (`useState`):** 1 — `firmada`
- **Hooks:** `useEffect`×1, `useState`×1, `useUrlFirmada`×1
- **Importa (local):** `./apiFetch`
- **Paquetes:** `react`
- **Lo importan:** `components/DocPinPanel.jsx`, `components/PdfReader.jsx`, `utils/apiFetch.js`
- **Endpoints del backend:** `/api/docs/asset-tokens`, `/api/docs/proxy`
- **Llamadas de red:** `apiFetch`×1
- **Funciones de módulo (línea):** `_leerAlmacen`:32, `_guardarAlmacen`:38, `recursoDeLaUrl`:47, `olvidarPermisos`:68, `firmarUrls`:76, `firmarUrl`:121, `useUrlFirmada`:132

### `utils/pivotUnderPointer.js` — 96 líneas

> pivotUnderPointer.js — El punto que tocas es el centro de giro. En escritorio ya funcionaba: al presionar el mouse se hace un hitTest y el punto del modelo BAJO el cursor pasa a ser el pivote, así orbitas alrededor de lo que estás mirando y no del centro del proyecto (estilo Tandem/Fusion). En tablet no ocurría nada: el visor mueve la cámara con eventos de PUNTERO (touch), y el `mousedown` sintético —cuando el navega

- **Exporta (con nombre):** `installPivotUnderPointer`
- **Lo importan:** `components/Viewer.jsx`, `components/lob4d/LOB4DViewer.jsx`
- **Funciones de módulo (línea):** `installPivotUnderPointer`:26
- **Funciones internas del componente (línea):** `blockedByTool`:36, `setPivotAt`:44, `onMouseDown`:54, `onTouchStart`:60

### `workers/alignmentWorker.js` — 175 líneas

> Alignment Math Web Worker Arquitectura 4D LOB - Vertex Attribute Baking Recibe vertices 3D y la definicion matematica de un alineamiento civil. Calcula la progresiva (PK) mas cercana sin bloquear el hilo principal.

- **Exporta (con nombre):** —
- **Lo importan:** *(nadie — entrada, huérfano, o cargado por otra vía)*
- **Funciones de módulo (línea):** `computeAABB`:9, `projectPointOnLine`:44, `normalizeAngle`:65, `angleTravel`:72, `projectPointOnArc`:78
- **Funciones internas del componente (línea):** `t`:53


## Visor de Autodesk: aps/

_8 módulos, 6661 líneas._

### `aps/extensions/BaseExtension.js` — 55 líneas

> OPTIMIZATION: Property extraction moved to Viewer.jsx "On-Demand" logic. This prevents double-processing and race conditions. const leafIds = await findLeafNodes(model); model.leafIds = leafIds; try { model.allProps = await getBulkProperties(model, leafIds); } catch (error) { console.error('Bulk property extraction failed', error); model.allProps = []; }

- **Exporta (con nombre):** `BaseExtension`
- **Importa (local):** `../utils/model.js`
- **Lo importan:** `aps/extensions/IconMarkupExtension.js`, `aps/extensions/ProgressiveExtension.js`, `components/Viewer.jsx`
- **API de Autodesk usada:** `Autodesk.Viewing.Extension`, `Autodesk.Viewing.ISOLATE_EVENT`, `Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT`, `Autodesk.Viewing.SELECTION_CHANGED_EVENT`
- **Eventos DOM:** emite `viewer-model-properties`

### `aps/extensions/DeviceOrientationExtension.js` — 357 líneas

> DeviceOrientationExtension.js global Autodesk, THREE

- **Exporta (con nombre):** `DeviceOrientationExtension`
- **Lo importan:** *(nadie — entrada, huérfano, o cargado por otra vía)*
- **Extensiones del visor:**  registra `DeviceOrientationExtension`
- **API de Autodesk usada:** `Autodesk.Viewing.Extension`, `Autodesk.Viewing.Private.THREE`, `Autodesk.Viewing.TOOLBAR_CREATED_EVENT`, `Autodesk.Viewing.UI.Button`, `Autodesk.Viewing.UI.Button.State.ACTIVE`, `Autodesk.Viewing.UI.Button.State.INACTIVE`, `Autodesk.Viewing.theExtensionManager.registerExtension`
- **Eventos DOM:** ; escucha `deviceorientation`, `orientationchange`

### `aps/extensions/IconMarkupExtension.js` — 403 líneas

- **Exporta:** default `IconMarkupExtension`
- **Importa (local):** `./BaseExtension`
- **Lo importan:** `components/Viewer.jsx`
- **Extensiones del visor:**  registra `IconMarkupExtension`
- **API de Autodesk usada:** `Autodesk.Viewing.CAMERA_CHANGE_EVENT`, `Autodesk.Viewing.GEOMETRY_LOADED_EVENT`, `Autodesk.Viewing.HIDE_EVENT`, `Autodesk.Viewing.ISOLATE_EVENT`, `Autodesk.Viewing.SHOW_EVENT`, `Autodesk.Viewing.theExtensionManager.registerExtension`

### `aps/extensions/LOB4DExtension.js` — 4523 líneas · **PROTEGIDO — no modificar**

> Valores que significan EJECUTADO. Los parametros Si/No de Revit se exportan en el idioma de la plantilla, y el inventario real de esta obra trae 'Yes' y 'No' en INGLES. La comprobacion anterior era ['1','si','sí','true','x'] -- sin 'yes' -- asi que 6.195 elementos marcados como ejecutados contaban como NO hechos, y la capa Ejecucion mostraba 0% en TODAS las zonas.

- **Exporta:** default `LOB4DExtension`
- **Lo importan:** `components/Viewer.jsx`
- **Llamadas de red:** `fetch`×1
- **Extensiones del visor:**  registra `LOB4DExtension`
- **API de Autodesk usada:** `Autodesk.Viewing.CAMERA_CHANGE_EVENT`, `Autodesk.Viewing.Extension`, `Autodesk.Viewing.theExtensionManager.registerExtension`
- **Eventos DOM:** emite `LOB4D_DIAG`, `LOB4D_EXCAV_FRONT_CHANGED`, `LOB4D_PARAM_PHASE_CHANGED`, `LOB4D_PK_CONTEXT_CHANGED`, `lob-activities-found`, `lob-ghost-excavation-result`, `lob-param-scanned`, `lob-stations-derived`, `lob-zone-hover-data`, `lob-zone-hover-error`, `zona-rotulo-cerrar`, `zona-rotulo-click`; escucha `lob-clear`, `lob-derive-stations`, `lob-focus-elements`, `lob-ghost-excavation`, `lob-group-labels`, `lob-isolate-state`, `lob-param-clear`, `lob-param-scan`, `lob-param-step`, `lob-pk-heatmap`, `lob-play`, `lob-scope-change`, `lob-seek`, `lob-time-update`, `lob-zone-hover`, `lob-zone-labels`, `pointermove`, `pointerup`, `predict-avance-listo`

### `aps/extensions/ProgressiveExtension.js` — 523 líneas

> Drag state for sliding section cuts along alignment

- **Exporta:** default `ProgressiveExtension`
- **Importa (local):** `./BaseExtension`
- **Lo importan:** `components/Viewer.jsx`
- **Extensiones del visor:**  registra `ProgressiveExtension`
- **API de Autodesk usada:** `Autodesk.Viewing.CAMERA_CHANGE_EVENT`, `Autodesk.Viewing.theExtensionManager.registerExtension`
- **Eventos DOM:** emite `station-drag-update`; escucha `mousemove`, `mouseup`

### `aps/utils/DataVizEngine.js` — 62 líneas

> Configurar color de selección al estilo Tandem (Amarillo con líneas diagonales nativas) El tipo MIXED o REGULAR con color fuerte produce el tramado diagonal.

- **Exporta (con nombre):** `DataVizEngine`
- **Lo importan:** `components/Viewer.jsx`
- **Extensiones del visor:**  carga `Autodesk.DataVisualization`
- **API de Autodesk usada:** `Autodesk.Viewing.SelectionType.MIXED`

### `aps/utils/loadAlignedModels.js` — 97 líneas

> loadAlignedModels — carga federada ALINEADA para cualquier visor embebido. Es la MISMA receta del visor principal (Viewer.jsx loadModelSequentially): - applyScaling:'mm' + applyRefPoint:true  → georreferencia correcta (evita que "uno que otro quede separado" en modelos con punto de referencia). - globalOffset compartido: se captura del PRIMER modelo y se reusa en el resto, así los modelos federados quedan en el mismo

- **Exporta (con nombre):** `loadAlignedModels`, `loadAlignedUrn`
- **Lo importan:** `components/CompareView.jsx`, `components/lob4d/LOB4DViewer.jsx`
- **Funciones de módulo (línea):** `isIdentityMatrix4`:14, `loadAlignedUrn`:22, `loadAlignedModels`:73
- **Funciones internas del componente (línea):** `list`:75

### `aps/utils/model.js` — 641 líneas

> Encuentra todos los nodos hoja en el árbol del modelo. @param {Autodesk.Viewing.Model} model El modelo del visor. @returns {Promise<number[]>} Una promesa que se resuelve con un array de IDs de nodos hoja.

- **Exporta (con nombre):** `calculateBucketsFromPostgres`, `calculateDynamicFilterBucketsNative`, `debounce`, `extractPartidasNative`, `extractSchemaNative`, `findLeafNodes`, `getBulkProperties`, `throttle`, `tryGetProperty`
- **Renderiza:** `Object`, `PropName`
- **Lo importan:** `aps/extensions/BaseExtension.js`, `components/Viewer.jsx`
- **API de Autodesk usada:** `Autodesk.Viewing.Model`
- **Funciones de módulo (línea):** `findLeafNodes`:6, `getBulkProperties`:29, `throttle`:42, `debounce`:62, `tryGetProperty`:76, `calculateDynamicFilterBucketsNative`:97, `extractPartidasNative`:277, `extractSchemaNative`:337, `_safeUrn`:390, `_normVal`:391, `_rosettaFingerprint`:401, `_buildFacetIndex`:412, `calculateBucketsFromPostgres`:487
- **Funciones internas del componente (línea):** `getRowValue`:529


## Realidad aumentada y nativo: native/

_10 módulos, 1906 líneas._

### `native/arCornerCalib.js` — 283 líneas

> arCornerCalib.js — Calibración POR ESQUINA, la de Revizto. El operario apunta a las tres caras de un rincón real (dos muros y el piso) y señala esas mismas tres caras en el modelo. Con eso queda fijado dónde está el modelo y hacia dónde mira. Es el método más preciso que existe en obra cerrada, porque un rincón define un punto y una orientación sin ambigüedad. POR QUÉ NO SE APLICA LA ROTACIÓN COMPLETA

- **Exporta (con nombre):** `arAVisor`, `calibrarPorEsquina`, `clasificar`, `giraZ`, `orientarHaciaObservador`, `planoDesdePose`
- **Importa (local):** `./registrationCorner.js`
- **Lo importan:** `components/ArCornerPanel.jsx`
- **Funciones de módulo (línea):** `norma`:30, `punto`:34, `grados`:35, `arAVisor`:38, `giraZ`:41, `planoDesdePose`:53, `clasificar`:65, `orientarHaciaObservador`:98, `quiralidad`:107, `rumbo`:114, `difAngulo`:117, `calibrarPorEsquina`:142
- **Funciones internas del componente (línea):** `fallo`:144, `aperturaRincon`:193, `cruzado`:223, `yawDeMuro`:226

### `native/arSim.js` — 283 líneas

> arSim.js — Simulador de AR para desarrollar en el escritorio. POR QUÉ EXISTE: el AR se estaba depurando compilando un APK por cada cambio, y eso convierte una tarde en veinte instalaciones. La capa nativa es un SENSOR —emite poses, planos y hit-tests—, y todo lo demás (calibración, ajuste, interfaz, residuos) es lógica que puede vivir y probarse en el navegador.

- **Exporta (con nombre):** `SIM_PLANOS`, `SIM_PLANOS_ABIERTO`, `simActivo`, `simAnchor`, `simCornerScan`, `simEmitirEsquina`, `simEsAbierto`, `simMirando`, `simMirarA`, `simReticuloEnSegundo`, `simRinconAbierto`, `simStart`, `simStop`, `simSubscribe`
- **Lo importan:** `components/ArCornerPanel.jsx`, `native/arcore.js`
- **Almacenamiento:** ; sessionStorage `ecd_arsim`
- **Funciones de módulo (línea):** `simActivo`:29, `simSubscribe`:42, `emitir`:52, `simRinconAbierto`:78, `simEsAbierto`:81, `simCornerScan`:87, `simEmitirEsquina`:88, `simMirarA`:124, `simMirando`:127, `camaraEnSegundo`:130, `poseEnSegundo`:140, `simReticuloEnSegundo`:178, `reticuloEnSegundo`:182, `cruz`:221, `normaliza`:222, `simStart`:227, `simStop`:271, `simAnchor`:278
- **Funciones internas del componente (línea):** `t`:191, `tick`:249, `seg`:250

### `native/arStake.js` — 75 líneas

> arStake.js — ESTACA DE VERIFICACIÓN del anclaje AR. Para saber si el modelo está realmente clavado al terreno (y no siguiéndote) hace falta una referencia que se pueda mirar de frente: un poste vertical de 1 m con marcas cada 25 cm, plantado EXACTAMENTE en el punto donde se creó el anclaje, más un anillo de 0.5 m en el suelo. Cómo se lee:

- **Exporta (con nombre):** `clearArStake`, `showArStake`
- **Lo importan:** `components/NativeARView.jsx`
- **Funciones de módulo (línea):** `showArStake`:20, `clearArStake`:67
- **Funciones internas del componente (línea):** `add`:30

### `native/arViewerBridge.js` — 363 líneas

> Connects the native ARCore pose to the Autodesk Viewer camera. ARCore reports a Y-up world in meters. The aggregated APS viewer uses a Z-up world in millimeters. We transform the camera instead of moving each model so every linked model keeps its existing alignment.

- **Exporta (con nombre):** `attachArToViewer`
- **Importa (local):** `./arcore`
- **Lo importan:** `components/NativeARView.jsx`
- **API de Autodesk usada:** `Autodesk.Viewing.Private`, `Autodesk.Viewing.Private.THREE`, `Autodesk.Viewing.Viewer3D`
- **Funciones de módulo (línea):** `attachArToViewer`:19
- **Funciones internas del componente (línea):** `abandonar`:29, `nop`:32, `premul`:75, `inverso`:81, `headingDeg`:99, `setAnchorMatrix`:108, `apply`:151, `restaurarCamara`:203

### `native/arcore.js` — 227 líneas

> arcore.js — Puente JS hacia el plugin nativo de ARCore (Capacitor). Arquitectura "sándwich transparente": - El plugin nativo (Kotlin/Java) arranca ARCore, dibuja la cámara a 60fps en una GLSurfaceView DETRÁS del WebView, y emite la pose por frame. - El WebView (esta app) tiene fondo transparente: el modelo de Autodesk se renderiza en su canvas FLOTANDO sobre la cámara real.

- **Exporta:** default `ARCore`; con nombre: `createAnchor`, `createAnchorAtCamera`, `createAnchorAtPoint`, `esSimulado`, `getDiagLog`, `getLastGeoPose`, `isNativeAR`, `onArStats`, `onCameraPose`, `onCornerDetect`, `onGeoPose`, `onReticle`, `onTracking`, `openNativeAr`, `setAimPoint`, `setDepth`, `setPlanesVisible`, `setTorch`, `simActivo`, `startCornerScan`, `startSession`, `stopCornerScan`, `stopSession`
- **Importa (local):** `./arSim`
- **Paquetes:** `@capacitor/core`
- **Lo importan:** `App.jsx`, `components/ArCornerPanel.jsx`, `components/NativeARView.jsx`, `native/arViewerBridge.js`
- **Capacitor:** `@capacitor/core`
- **Funciones de módulo (línea):** `esSimulado`:30, `isNativeAR`:38, `startSession`:61, `stopSession`:69, `createAnchor`:80, `onCameraPose`:87, `onTracking`:94, `onGeoPose`:107, `getLastGeoPose`:121, `createAnchorAtCamera`:127, `onReticle`:138, `setAimPoint`:146, `setPlanesVisible`:153, `onArStats`:160, `createAnchorAtPoint`:168, `setDepth`:175, `openNativeAr`:185, `setTorch`:191, `startCornerScan`:200, `stopCornerScan`:204, `onCornerDetect`:208, `getDiagLog`:216
- **Funciones internas del componente (línea):** `t`:71

### `native/geoAnchor.js` — 113 líneas

> geoAnchor.js — Convierte GPS (WGS84) a coordenadas del visor para anclar el modelo en campo por posición real. Es el "cerebro" del AR geoespacial. CADENA DE GEORREFERENCIA (confirmada con el cadista): El modelo Civil 3D está en WGS84/SIRGAS UTM 17S (EPSG:32717). El GPS del celular también entrega WGS84, así que NO hace falta transformación de datum. 1. GPS (lat/lon) ──► UTM 17S (E, N en metros)   [proyección de abajo

- **Exporta (con nombre):** `HEADING_BASE`, `HEADING_SIGN`, `geoToViewer`, `latLonToUtm`, `seedYawFromHeading`
- **Lo importan:** `components/NativeARView.jsx`
- **Funciones de módulo (línea):** `norm360`:32, `latLonToUtm`:42, `geoToViewer`:93, `seedYawFromHeading`:110
- **Funciones internas del componente (línea):** `lat`:43, `lon`:44, `lon0`:45

### `native/georefFit.js` — 111 líneas

> Ajuste HELMERT 2D + cota: la transformación entre dos sistemas con la vertical compartida — exactamente lo que un topógrafo llama "transformación de semejanza". Se usa dos veces en el AR georreferenciado: 1) AMARRE modelo↔UTM (web): pares clic-en-modelo ↔ coordenada UTM. Escala LIBRE: si el DWG está en pies, la escala sale 0.3048 y el desajuste de unidades se detecta solo, con número.

- **Exporta (con nombre):** `ajustarHelmert`, `cierreDePunto`
- **Lo importan:** `components/GeoControlPanel.jsx`
- **Funciones de módulo (línea):** `ajustarHelmert`:27, `cierreDePunto`:106
- **Funciones internas del componente (línea):** `a`:53, `b`:54, `aplicar`:69, `x`:94

### `native/modelFacePick.js` — 74 líneas

> modelFacePick.js — Qué cara del modelo hay debajo del dedo. La calibración por esquina necesita las tres caras del rincón EN EL MODELO, y la única forma razonable de señalarlas en una tablet es tocándolas. El detalle que se paga caro si se hace mal: la normal que devuelve el visor viene en coordenadas de la GEOMETRÍA, no del mundo. Un modelo enlazado o rotado tiene su propia matriz, así que usar esa normal tal cual d

- **Exporta (con nombre):** `camaraDelVisor`, `planoDelToque`
- **Lo importan:** `components/ArCornerPanel.jsx`
- **API de Autodesk usada:** `Autodesk.Viewing.Private`, `Autodesk.Viewing.Private.THREE`
- **Funciones de módulo (línea):** `tres`:12, `planoDelToque`:23, `camaraDelVisor`:66

### `native/registration3p.js` — 199 líneas

> registration3p.js — Registro por correspondencia de puntos (Horn, 1987). El problema: colocar el modelo BIM sobre la obra real con precisión de centímetros. El GPS de una tablet da ±16-31 m — medido en campo, en este mismo proyecto —, así que no sirve para calzar un buzón. La solución profesional es la que usan SiteVision, vGIS o Dalux cuando no hay un receptor GNSS topográfico: señalar en el mundo real los MISMOS pu

- **Exporta (con nombre):** `applyTransform`, `largestEigenvector4`, `quatToMatrix`, `solveRigid`, `toMatrix4`
- **Lo importan:** `native/registrationCorner.js`
- **Funciones de módulo (línea):** `centroid`:23, `largestEigenvector4`:33, `quatToMatrix`:79, `applyTransform`:91, `solveRigid`:112, `toMatrix4`:191
- **Funciones internas del componente (línea):** `theta`:49, `rot`:55, `fallo`:113

### `native/registrationCorner.js` — 178 líneas

> registrationCorner.js — Calibración POR ESQUINA (dos muros y el piso). Es el método que usa Revizto ("Calibrar por esquina") y hay una razón geométrica preciosa detrás: tres planos no paralelos se cortan en UN solo punto y fijan los seis grados de libertad — posición y giro — sin sobrar ni faltar información. Frente a marcar tres PUNTOS, esto gana donde importa, que es la mano del que

- **Exporta (con nombre):** `cornerPoint`, `solveCorner`
- **Importa (local):** `./registration3p.js`
- **Lo importan:** `components/ArCornerPanel.jsx`, `native/arCornerCalib.js`
- **Funciones de módulo (línea):** `dot`:26, `norm`:27, `rotar`:31, `det3`:38, `resolver3`:45, `rotacionDeDirecciones`:53, `solveCorner`:85, `cornerPoint`:172
- **Funciones internas del componente (línea):** `conCol`:48, `fallo`:86


## LOB 4D (PROTEGIDO): components/lob4d/

_13 módulos, 5658 líneas._

### `components/lob4d/ControlView.jsx` — 222 líneas · **PROTEGIDO — no modificar**

> ── CONTROL DE OBRA (1d) — programación P6 vs ejecución real, por costo ── Fecha de corte ajustable (default: hoy). Todo respeta el frente activo.

- **Exporta:** default `ControlView`
- **Props:** `lobData`, `activeFrente`
- **Estado local (`useState`):** 1 — `cutMs`
- **Hooks:** `useMemo`×1, `useState`×1
- **Renderiza:** `KpiCard`, `TaskList`
- **Importa (local):** `./lob4dUtils`
- **Paquetes:** `react`
- **Lo importan:** `components/lob4d/LOB4DWorkspace.jsx`
- **Funciones de módulo (línea):** `spiColor`:9, `KpiCard`:16, `TaskList`:26
- **Funciones internas del componente (línea):** `x`:91, `y`:92

### `components/lob4d/EdtExplorer.jsx` — 225 líneas · **PROTEGIDO — no modificar**

- **Exporta:** default `EdtExplorer`
- **Props:** `lobData`, `activeFrente`
- **Estado local (`useState`):** 2 — `expanded`, `selectedCode`
- **Hooks:** `useEffect`×1, `useMemo`×3, `useState`×2
- **Renderiza:** `DetailPanel`
- **Importa (local):** `./lob4dUtils`
- **Paquetes:** `react`
- **Lo importan:** `components/lob4d/LOB4DWorkspace.jsx`
- **Funciones de módulo (línea):** `nodeTitle`:11, `DetailPanel`:13
- **Funciones internas del componente (línea):** `toggle`:129

### `components/lob4d/LOB4DViewer.jsx` — 202 líneas · **PROTEGIDO — no modificar**

- **Exporta:** default `LOB4DViewer`
- **Props:** `models`, `selectedUrns`, `activeViewableGuids`
- **Hooks:** `useEffect`×3, `useMemo`×1, `useRef`×5
- **Importa (local):** `../../aps/utils/loadAlignedModels`, `../../utils/pivotUnderPointer`, `./lob4dUtils`
- **Paquetes:** `react`
- **Lo importan:** `components/lob4d/LOB4DWorkspace.jsx`
- **Extensiones del visor:**  carga `LOB4DExtension`
- **API de Autodesk usada:** `Autodesk.Viewing.SelectionMode.LEAF_OBJECT`
- **Eventos DOM:** emite `lob-clear`, `lob-scope-change`, `lob-time-update`
- **Funciones de módulo (línea):** `getCivilOverlaySeed`:6

### `components/lob4d/LOB4DWorkspace.jsx` — 1825 líneas · **PROTEGIDO — no modificar**

- **Exporta:** default `LOB4DWorkspace`
- **Props:** `onClose`, `models`, `activeViewableGuids`
- **Estado local (`useState`):** 42 — `duraciones`, `metrados`, `cronograma`, `name`, `dataDate`, `open`, `open`, `open`, `excavFront`, `diag`, `isoState`, `open`, `expanded`, `anchor`, `open`, `propName`, `scanning`, `phases`, `total`, `idx`, `playing`, `activeTab`, `lobData`, `linearState`, `dataStatus`, `viewerStatus`, `selectedUrns`, `modelPickerOpen`, `importOpen`, `datasetOpen`, `datasets`, `elementLinks`, `dataBusy`, `dataError`, `excavUrns`, `activeFrente`, `selectedPartidaCode`, `simPeriod`, `simPlaying`, `simDate` …
- **Hooks:** `useCallback`×11, `useEffect`×14, `useMemo`×9, `useState`×43
- **Renderiza:** `AlertsButton`, `BaselineButton`, `ControlView`, `DataImportModal`, `DatasetModal`, `EdtExplorer`, `FrenteEdtPicker`, `Hud`, `LOB4DViewer`, `LineBalanceView`, `LinearPlanningView`, `LookaheadPanel`, `ModelPicker`, `ParamSimPanel`, `ProgressMatrixView`, `Row`, `SimulationView`, `WorkPackagePanel`
- **Importa (local):** `../../utils/apiFetch`, `./ControlView`, `./EdtExplorer`, `./LOB4DViewer`, `./LOB4DWorkspace.css`, `./LineBalanceView`, `./LinearPlanningView`, `./ProgressMatrixView`, `./WorkPackagePanel`, `./lob4dUtils`
- **Carga perezosa:** `./executiveReport`
- **Paquetes:** `react` · perezosos: `jspdf`
- **Lo importan:** `components/LOB4DPanel.jsx`
- **Endpoints del backend:** `/api/lob/datasets`, `/api/lob/datasets`, `/api/lob/import`, `/api/lob/linear/bootstrap`, `/api/lob/linear/state`, `/api/lob/links`, `/api/lob/links/rebuild`, `/api/lob/locations`, `/api/lob/timeline`
- **Llamadas de red:** `apiFetch`×8
- **Eventos DOM:** emite `lob-clear`, `lob-derive-stations`, `lob-focus-elements`, `lob-isolate-state`, `lob-param-clear`, `lob-param-scan`, `lob-param-step`, `lob-scope-change`; escucha `LOB4D_DIAG`, `LOB4D_EXCAV_FRONT_CHANGED`, `lob-clear`, `lob-param-scanned`, `lob-stations-derived`
- **Variables de entorno:** `VITE_BACKEND_URL`
- **Funciones de módulo (línea):** `todayISO`:55, `DataImportModal`:57, `DatasetModal`:119, `ModelPicker`:159, `AlertsButton`:214, `BaselineButton`:281, `LookaheadPanel`:334, `Hud`:416, `SimulationSidePanel`:533, `FrenteEdtPicker`:667, `ParamSimPanel`:777, `SimulationView`:913
- **Funciones internas del componente (línea):** `submit`:67, `total`:338, `money`:352, `dateShort`:353, `Row`:354, `fmt`:420, `money`:421, `toggleIso`:540, `edtEntry`:675, `toggleOpen`:680, `toggleExpand`:701, `scan`:818, `exit`:825, `toggleFrente`:1089, `setEdtScope`:1096, `show3DFor`:1260, `toggleExcav`:1267, `fetchTimeline`:1313, `fetchDatasets`:1323, `fetchElementLinks`:1333, `fetchLinearState`:1343, `loadData`:1352, `bootstrapLinear`:1383, `deriveStationsFromAxis`:1413, `importDataset`:1467 …(+4)

### `components/lob4d/LineBalanceView.jsx` — 952 líneas · **PROTEGIDO — no modificar**

> Paletas del gráfico: dark (pantalla) y light (TILOS-imprenta, como los PDF de ejemplo de Trimble). El toggle 🖨 cambia SOLO el lienzo SVG.

- **Exporta:** default `LineBalanceView`
- **Props:** `lobData`, `activeFrente`, `simulationState`, `selectedCode`, `onPartidaSelect`, `onZoneSelect`, `onJumpDate`, `onDeriveStations`, `onShow3D`
- **Estado local (`useState`):** 5 — `soloFamily`, `showAuxiliary`, `vZoom`, `lightMode`, `focusZone`
- **Hooks:** `useMemo`×9, `useState`×5
- **Renderiza:** `ProgressDashboard`, `Row`
- **Importa (local):** `./lob4dUtils`, `./partidaPatterns`, `./partidaTaxonomy`
- **Paquetes:** `react`
- **Lo importan:** `components/lob4d/LOB4DWorkspace.jsx`
- **Funciones de módulo (línea):** `formatPk`:36, `ProgressDashboard`:40
- **Funciones internas del componente (línea):** `Row`:53, `visibleSegments`:203, `punctualSegments`:211, `hiddenAuxCount`:219, `x`:275, `yTop`:278, `yBot`:279, `laneRange`:297, `yStation`:327, `pickStationStep`:346

### `components/lob4d/LinearPlanningView.jsx` — 243 líneas · **PROTEGIDO — no modificar**

- **Exporta:** default `LinearPlanningView`
- **Props:** `state`, `lobData`, `onBootstrap`, `onDeriveStations`, `busy`, `error`
- **Estado local (`useState`):** 6 — `name`, `projectType`, `stationStart`, `stationEnd`, `segmentLength`, `hoursPerDay`
- **Hooks:** `useMemo`×1, `useState`×6
- **Renderiza:** `React.Fragment`, `Readiness`, `SetupForm`, `TimeLocationPreview`
- **Paquetes:** `react`
- **Lo importan:** `components/lob4d/LOB4DWorkspace.jsx`
- **Funciones de módulo (línea):** `formatPk`:13, `SetupForm`:20, `Readiness`:89, `TimeLocationPreview`:111
- **Funciones internas del componente (línea):** `submit`:28

### `components/lob4d/ProgressMatrixView.jsx` — 116 líneas · **PROTEGIDO — no modificar**

- **Exporta:** default `ProgressMatrixView`
- **Props:** `lobData`, `activeFrente`, `simulationState`, `selectedCode`, `onPartidaSelect`
- **Hooks:** `useMemo`×1
- **Importa (local):** `./lob4dUtils`
- **Paquetes:** `react`
- **Lo importan:** `components/lob4d/LOB4DWorkspace.jsx`
- **Funciones de módulo (línea):** `statusAtPeriod`:4

### `components/lob4d/WorkPackagePanel.jsx` — 190 líneas · **PROTEGIDO — no modificar**

- **Exporta:** default `WorkPackagePanel`
- **Props:** `lobData`, `activeFrente`, `simulationState`, `selectedCode`, `onSelect`
- **Estado local (`useState`):** 3 — `query`, `statusFilter`, `visibleCount`
- **Hooks:** `useEffect`×1, `useMemo`×3, `useState`×3
- **Importa (local):** `./lob4dUtils`
- **Paquetes:** `react`
- **Lo importan:** `components/lob4d/LOB4DWorkspace.jsx`
- **Funciones de módulo (línea):** `scopeLabel`:19, `formatPk`:31

### `components/lob4d/executiveReport.js` — 334 líneas · **PROTEGIDO — no modificar**

> Reporte PDF ejecutivo estilo acta de reunión semanal de obra. Contenido: portada · KPIs EVM · Curva S doble · Look-ahead 2-4 semanas · Atrasos críticos · Alertas. Corre en el cliente (jsPDF), listo para email.

- **Exporta (con nombre):** `generateExecutiveReport`
- **Props:** `projectName`, `frenteLabel`, `dataset`, `simulationState`, `lobSeries`
- **Lo importan:** `components/lob4d/LOB4DWorkspace.jsx`
- **Funciones de módulo (línea):** `fmtMoney`:9, `fmtDate`:10, `fmtShort`:11, `fmtNum`:12, `trunc`:14, `drawHeader`:19, `drawFooter`:36, `drawKpiCard`:46, `drawCurveS`:70, `drawSection`:174, `drawTable`:185, `generateExecutiveReport`:222
- **Funciones internas del componente (línea):** `xOf`:98, `drawCurve`:137, `cw`:242, `alerts`:259, `colW`:282

### `components/lob4d/lob4dUtils.js` — 1074 líneas · **PROTEGIDO — no modificar**

> Baseline localStorage: instantánea del plan actual congelada. Se compara con el plan vivo → deriva de fechas (cuánto se ha movido el plan desde la firma).

- **Exporta (con nombre):** `addDays`, `buildEdtTree`, `buildLobSeries`, `buildScheduleRows`, `cleanUrn`, `clearBaseline`, `computeControlState`, `computeSimulationState`, `computeSimulationStateByDate`, `flattenTree`, `formatDate`, `getDateDomain`, `getFilteredPartidas`, `getFrontCodes`, `getMaxPeriod`, `getScheduleDomain`, `isPartidaInFront`, `loadBaseline`, `modelFrontOf`, `modelLabelOf`, `modelUrnOf`, `money`, `numberText`, `percentText`, `saveBaseline`, `snapshotBaseline`, `statusColor`
- **Importa (local):** `./partidaTaxonomy`, `./peruvianCalendar`
- **Lo importan:** `components/lob4d/ControlView.jsx`, `components/lob4d/EdtExplorer.jsx`, `components/lob4d/LOB4DViewer.jsx`, `components/lob4d/LOB4DWorkspace.jsx`, `components/lob4d/LineBalanceView.jsx`, `components/lob4d/ProgressMatrixView.jsx`, `components/lob4d/WorkPackagePanel.jsx`
- **Funciones de módulo (línea):** `cleanUrn`:4, `BASELINE_KEY`:8, `loadBaseline`:9, `saveBaseline`:15, `clearBaseline`:19, `snapshotBaseline`:22, `modelUrnOf`:46, `modelLabelOf`:47, `modelFrontOf`:48, `money`:50, `numberText`:55, `percentText`:60, `formatDate`:65, `addDays`:76, `getMaxPeriod`:84, `getFrontCodes`:98, `isPartidaInFront`:115, `getFilteredPartidas`:121, `buildEdtTree`:129, `flattenTree`:223, `computeSimulationState`:233, `buildScheduleRows`:325, `getDateDomain`:341, `progressAtDate`:351, `statusColor`:370, `getScheduleDomain`:384, `computeSimulationStateByDate`:401, `familyOf`:523, `buildLobSeries`:532, `parseDay`:957 …(+1)
- **Funciones internas del componente (línea):** `ensure`:134, `aggregate`:205, `walk`:225, `zoneOf`:549, `conflictSource`:692

### `components/lob4d/partidaPatterns.jsx` — 62 líneas · **PROTEGIDO — no modificar**

> Patrones realmente definidos abajo — el trazo usa hatch SOLO si su familia tiene patrón; si no, cae a línea de color sólido.

- **Exporta (con nombre):** `DEFINED_PATTERNS`, `svgPatternDefs`
- **Paquetes:** `react`
- **Lo importan:** `components/lob4d/LineBalanceView.jsx`
- **Funciones de módulo (línea):** `svgPatternDefs`:12

### `components/lob4d/partidaTaxonomy.js` — 116 líneas · **PROTEGIDO — no modificar**

> Taxonomía de partidas ESPECÍFICA para obra lineal drenaje+canal. Reglas ordenadas (primero lo más específico). Cada familia define: - color: paleta TILOS drenaje - pattern: id del patrón SVG (visible en <defs> del LineBalanceView) - priority: número menor = se dibuja arriba (encima) - isAuxiliary: no va a la LOB principal por defecto (indirectos)

- **Exporta (con nombre):** `FAMILY_LABEL`, `classifyPartida`
- **Lo importan:** `components/lob4d/LineBalanceView.jsx`, `components/lob4d/lob4dUtils.js`
- **Funciones de módulo (línea):** `R`:11, `classifyPartida`:59
- **Funciones internas del componente (línea):** `key`:60

### `components/lob4d/peruvianCalendar.js` — 97 líneas · **PROTEGIDO — no modificar**

> Calendario laboral peruano — feriados nacionales oficiales (MTPE) y utilidades de días útiles para cálculos de ETA / atraso / look-ahead. El "faltan N días" pasa de días naturales a días útiles reales.

- **Exporta (con nombre):** `addWorkingDays`, `isWithinWorkingDays`, `isWorkingDay`, `workingDaysBetween`
- **Lo importan:** `components/lob4d/lob4dUtils.js`
- **Funciones de módulo (línea):** `computeEaster`:8, `iso`:26, `holidaysForYear`:28, `holidaysOf`:53, `isWorkingDay`:59, `workingDaysBetween`:66, `addWorkingDays`:78, `isWithinWorkingDays`:92
- **Funciones internas del componente (línea):** `h`:16, `L`:19, `day`:22


## Tablero de analisis: components/dashboard/

_5 módulos, 1663 líneas._

### `components/dashboard/ChartCard.jsx` — 485 líneas

> ChartCard — un NODO del lienzo del Tablero. Render de gráficos con Chart.js + tema unificado (chartjsTheme): barras, dona, línea, área y dispersión con tooltips/animaciones de producto. Tabla, KPI y la fuente de Parámetros (QA) siguen en DOM (ahí es lo correcto). Interacción (heredada del engine, no del dibujo): · clic en barra/segmento/punto → aislar en el 3D

- **Exporta:** default `ChartCard`
- **Props:** `config`, `rows`, `fields`, `onEdit`, `onUpdate`, `onDelete`, `onIsolate`, `onPaint`, `onCreateFromField`, `activeKey`, `dragHandlers`, `zoom`
- **Estado local (`useState`):** 2 — `q`, `painted`
- **Hooks:** `useEffect`×5, `useMemo`×5, `useRef`×4, `useState`×2
- **Renderiza:** `CjsChart`, `IconBtn`, `Kpi`, `ParamsSource`, `TableView`
- **Importa (local):** `./chartjsTheme`, `./engine`
- **Paquetes:** `react`
- **Lo importan:** `components/dashboard/DashboardWorkspace.jsx`
- **Funciones de módulo (línea):** `IconBtn`:47, `dprFor`:63, `CjsChart`:66, `Kpi`:269, `TableView`:280, `ParamsSource`:309
- **Funciones internas del componente (línea):** `onClick`:96, `onHover`:108, `axisTitle`:114, `toggleFilterValue`:361, `handleSegment`:378, `handlePaint`:379, `exportCsv`:384

### `components/dashboard/ChartEditor.jsx` — 243 líneas

> ChartEditor — configurador de un gráfico del Tablero. El selector de campos muestra el % de COMPLETITUD de cada parámetro (cuántos elementos lo tienen lleno) — QA de datos integrado: antes de graficar ya ves qué tan poblado está el parámetro.

- **Exporta:** default `ChartEditor`
- **Props:** `initial`, `fields`, `rows`, `onSave`, `onCancel`
- **Estado local (`useState`):** 3 — `q`, `open`, `cfg`
- **Hooks:** `useMemo`×2, `useState`×3
- **Renderiza:** `FieldPicker`, `Segmented`
- **Importa (local):** `./engine`
- **Paquetes:** `react`
- **Lo importan:** `components/dashboard/DashboardWorkspace.jsx`
- **Funciones de módulo (línea):** `Segmented`:29, `FieldPicker`:44
- **Funciones internas del componente (línea):** `set`:100, `toggleFilterValue`:114

### `components/dashboard/DashboardWorkspace.jsx` — 574 líneas

> DashboardWorkspace — Tablero de análisis del frente (lienzo tipo Miro). ============================================================================= Panel dividido junto al 3D con un LIENZO INFINITO propio (sin dependencias): · pan (arrastrar el fondo) + zoom (rueda hacia el cursor) + encajar vista · nodos flotantes: los mueves (asa = cabecera) y redimensionas (esquina) · nodo "Parámetros": la fuente QA — clic en un

- **Exporta:** default `DashboardWorkspace`; con nombre: `FONT_TITLE`
- **Props:** `project`, `backendUrl`, `onClose`
- **Estado local (`useState`):** 12 — `rows`, `fields`, `dashId`, `dashName`, `charts`, `frames`, `editing`, `active`, `saveState`, `width`, `view`, `locked`
- **Hooks:** `useCallback`×4, `useEffect`×11, `useRef`×7, `useState`×12
- **Renderiza:** `ChartCard`, `ChartEditor`
- **Importa (local):** `../../utils/apiFetch`, `./ChartCard`, `./ChartEditor`, `./engine`
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`
- **Endpoints del backend:** `/api/dashboards`, `/api/dashboards`
- **Llamadas de red:** `apiFetch`×5
- **Eventos DOM:** emite `tablero-width`; escucha `pointermove`, `pointerup`
- **Funciones de módulo (línea):** `uid`:18, `clamp`:19, `snap`:25, `withLayout`:35
- **Funciones internas del componente (línea):** `onWheel`:147, `wx`:154, `onPanStart`:162, `onMove`:165, `onUp`:166, `startMove`:172, `onMove`:179, `dx`:180, `onUp`:183, `startResize`:189, `onMove`:196, `dw`:197, `onUp`:200, `addFrame`:206, `removeFrame`:214, `renameFrame`:215, `startMoveFrame`:218, `onMove`:232, `dx`:233, `onUp`:242, `startResizeFrame`:247, `onMove`:254, `dw`:255, `onUp`:258, `fitView`:264 …(+14)

### `components/dashboard/chartjsTheme.js` — 37 líneas

> chartjsTheme.js — Tema ÚNICO de Chart.js para el Tablero. ============================================================= Un solo lugar define fuente, colores, tooltips y rejillas: TODOS los gráficos del tablero salen de la misma familia visual (eso es lo que separa un producto de una colección de gráficos sueltos). Nota de peso: se importa solo desde el chunk del Tablero (React.lazy),

- **Exporta:** default `Chart`
- **Paquetes:** `chart.js/auto`
- **Lo importan:** `components/dashboard/ChartCard.jsx`

### `components/dashboard/engine.js` — 324 líneas

> engine.js — Motor de datos del Tablero de análisis. ===================================================== Capa PURA (sin UI): fuentes de datos, descubrimiento de campos con % de completitud (base del QA de parámetros), y agregación (contar/sumar/promediar). PRINCIPIO: el tablero lee SOLO de la nube (window.postgresInventory, que ya baja de Postgres con caché IndexedDB). Nada de Revit ni IFC en este camino.

- **Exporta (con nombre):** `PALETTE`, `SOURCES`, `aggregate`, `clearViewerViz`, `colorAt`, `colorizeInViewer`, `discoverFields`, `distinctValues`, `fmt`, `groupsToCsv`, `isolateInViewer`, `resetEngineCaches`, `scatterPoints`
- **Lo importan:** `components/dashboard/ChartCard.jsx`, `components/dashboard/ChartEditor.jsx`, `components/dashboard/DashboardWorkspace.jsx`
- **Eventos DOM:** emite `viewer-colors-applied`
- **Funciones de módulo (línea):** `colorAt`:18, `getInventoryRows`:24, `parseNum`:52, `discoverFields`:59, `distinctValues`:93, `aggregate`:112, `scatterPoints`:179, `fmt`:206, `getExtMapping`:217, `getViewer`:228, `resolveByModel`:232, `isolateInViewer`:250, `colorizeInViewer`:270, `clearViewerViz`:299, `resetEngineCaches`:310, `groupsToCsv`:315
- **Funciones internas del componente (línea):** `key`:123, `esc`:316


## Componentes de pantalla: components/

_48 módulos, 29164 líneas._

### `components/AddDocumentModal.jsx` — 163 líneas

- **Exporta:** default `AddDocumentModal`
- **Props:** `open`, `onClose`, `onConfirm`, `targetSpriteId`, `selectedProject`
- **Estado local (`useState`):** 5 — `tab`, `files`, `selectedAccDoc`, `uploading`, `error`
- **Hooks:** `useEffect`×1, `useState`×5
- **Renderiza:** `NativeFileTree`
- **Importa (local):** `../utils/apiFetch`, `./NativeFileTree`
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`
- **Endpoints del backend:** `/api/documents/link`, `/api/documents/upload`
- **Llamadas de red:** `apiFetch`×2
- **Variables de entorno:** `VITE_BACKEND_URL`
- **Funciones de módulo (línea):** `AddDocumentModal`:9
- **Funciones internas del componente (línea):** `uploadFiles`:33, `handleConfirm`:58

### `components/ArAdjustPanel.jsx` — 120 líneas

> ArAdjustPanel — la herramienta "Ajustar" del AR: mover, elevar y girar. Está copiada en intención de Revizto AR, que la ofrece en DOS de sus tres modos de calibración y la usa además para corregir la deriva sin recalibrar entero. Sin ella, el modo "sin calibración" no sirve para nada — y ese modo es el único que funciona en un canal a cielo abierto, donde no hay rincones que escanear.

- **Exporta:** default `ArAdjustPanel`
- **Props:** `bridge`, `onClose`
- **Estado local (`useState`):** 1 — `paso`
- **Hooks:** `useState`×2
- **Paquetes:** `react`
- **Lo importan:** `components/NativeARView.jsx`
- **Funciones internas del componente (línea):** `mover`:36, `girar`:40

### `components/ArCornerPanel.jsx` — 698 líneas

> esSimulado y no simActivo: desde que el navegador usa SIEMPRE el simulador (no hay otra fuente de poses sin plataforma nativa), simActivo() -- que solo mira el ?arsim=1 del URL -- quedo obsoleto como pregunta. Seguir usandolo dejaba las teclas 1/2/3 muertas y la pista escondida en cuanto el URL perdia el parametro, con el simulador corriendo perfectamente por debajo.

- **Exporta:** default `ArCornerPanel`; con nombre: `useTeclasSimulador`
- **Props:** `viewer`, `puente`, `upm`, `reticuloRef`, `modoCamara`, `mostrarModelo`, `onAplicar`, `onCancelar`
- **Estado local (`useState`):** 13 — `paso`, `carasModelo`, `carasObra`, `resultado`, `aviso`, `nubePuntos`, `profundidad`, `areas`, `linterna`, `profExp`, `mira`, `marcador`, `afinando`
- **Hooks:** `useCallback`×1, `useEffect`×9, `useRef`×10, `useState`×13, `useTeclasSimulador`×1
- **Importa (local):** `../native/arCornerCalib`, `../native/arSim`, `../native/arcore`, `../native/modelFacePick`, `../native/registrationCorner.js`
- **Paquetes:** `react`
- **Lo importan:** `components/NativeARView.jsx`
- **Eventos DOM:** ; escucha `keydown`
- **Funciones de módulo (línea):** `claseDeNormal`:38, `dot3`:45, `resumen`:54, `useTeclasSimulador`:682
- **Funciones internas del componente (línea):** `tocar`:227, `abajo`:251, `arriba`:252, `intentaCapturar`:268, `capturarObra`:287, `resolver`:360, `reiniciar`:417, `fichas`:445, `alPulsar`:685

### `components/BudgetTree.jsx` — 1208 líneas

> BudgetTree - Panel 5D de Presupuesto ====================================== Muestra el presupuesto maestro como árbol jerárquico colapsable. Integra motor de cálculo para METRADO REAL desde el modelo 3D. Hatch patterns: rojo (sin vincular), amarillo (sin metrado), verde (completo).

- **Exporta:** default `BudgetTree`
- **Props:** `activeModelUrn`, `onClose`, `onPoppedOut`
- **Estado local (`useState`):** 12 — `flatData`, `treeRoots`, `treeMap`, `expandedSet`, `engineResults`, `engineStatus`, `loading`, `error`, `selectedItem`, `scrollTop`, `containerHeight`, `isPoppedOut`
- **Hooks:** `useCallback`×7, `useEffect`×4, `useMemo`×2, `useRef`×1, `useState`×12
- **Importa (local):** `../utils/apiFetch`, `./budgetEngine`
- **Paquetes:** `exceljs`, `file-saver`, `react`
- **Lo importan:** `App.jsx`
- **Endpoints del backend:** `/api/presupuesto`
- **Llamadas de red:** `apiFetch`×1, `fetch`×1
- **Eventos DOM:** emite `budget-select-partidas`, `budget-tandem-highlight`; escucha `beforeunload`, `message`, `viewer-schema-extracted`
- **Variables de entorno:** `VITE_API_URL`
- **Funciones de módulo (línea):** `fmt`:18, `fmtS`:22, `buildTree`:42, `flattenVisible`:62, `getInitialExpanded`:102, `generatePopoutHTML`:111, `BudgetTree`:214
- **Funciones internas del componente (línea):** `walk`:64, `fmtPop`:112, `fmtQty`:113, `parcialReal`:125, `selectRow`:186, `dockBack`:199, `fetchData`:232, `runEngine`:281, `toggleExpand`:338, `expandAll`:350, `collapseAll`:356, `exportToExcel`:360, `applyRowStyles`:391, `addNodeToExcel`:441, `exportNodeToExcel`:530, `sheetName`:533, `applyStyles`:559, `addNode`:602, `safeName`:673, `normalizeUrn`:695, `getDbIdsForNode`:703, `collectLeafItems`:710, `handleRowSelect`:784, `handleRowIsolate`:811, `openPopout`:866 …(+1)

### `components/BuildPanel.jsx` — 457 líneas

> Reuse similar icons for consistency

- **Exporta:** default `BuildPanel`
- **Props:** `buildUploads`, `pins`, `selectedPinId`, `onPinSelect`, `onFileUpload`, `uploading`, `uploadError`, `// Model Props     models`, `hiddenModels`, `onImport`, `onToggleVisibility`, `onRemove`, `onPinDelete`, `onPinUpload`, `// Pin Visibility     showPins`, `onTogglePins`, `// Pin Placement     placementMode`, `onTogglePlacement`, `onCameraCapture`, `onPinMoveRequest`, `// New Prop for moving pins     onPinRename`
- **Estado local (`useState`):** 6 — `activeMenu`, `isModelsOpen`, `isPinsOpen`, `editingPinId`, `editingValue`, `activeTab`
- **Hooks:** `useMemo`×1, `useRef`×1, `useState`×6
- **Renderiza:** `ChevronDown`, `ChevronRight`, `DeleteIcon`, `EyeIcon`, `MoreIcon`, `PlusIcon`, `TargetIcon`
- **Importa (local):** `./BuildPanel.css`
- **Paquetes:** `react`
- **Lo importan:** `components/TandemSidebar.jsx`
- **Funciones de módulo (línea):** `PlusIcon`:5, `EyeIcon`:12, `DeleteIcon`:28, `TargetIcon`:35, `MoreIcon`:46, `ChevronDown`:54, `ChevronRight`:60, `BuildPanel`:66
- **Funciones internas del componente (línea):** `handlePinUploadClick`:100, `handleFileChange`:104, `handleTabChange`:133, `handleCameraClick`:146, `handleCameraChange`:152

### `components/CameraCapture.jsx` — 216 líneas

> CameraCapture — Built-in camera with device selection. Lists all available cameras (front, back, USB) and lets the user pick. Captures photo as a File object and returns it via onCapture callback.

- **Exporta:** default `CameraCapture`
- **Props:** `isOpen`, `onClose`, `onCapture`
- **Estado local (`useState`):** 4 — `cameras`, `selectedCamera`, `error`, `ready`
- **Hooks:** `useCallback`×2, `useEffect`×2, `useRef`×3, `useState`×4
- **Paquetes:** `react`
- **Lo importan:** `components/PhotoAlbumModal.jsx`
- **Funciones de módulo (línea):** `CameraCapture`:8
- **Funciones internas del componente (línea):** `loadCameras`:18, `startStream`:44, `handleCapture`:91, `handleClose`:111, `getCameraLabel`:123

### `components/CivilStationTracker.jsx` — 241 líneas

> Manejar arrastre

- **Exporta:** default `CivilStationTracker`
- **Props:** `viewerRef`
- **Estado local (`useState`):** 6 — `isVisible`, `position`, `isDragging`, `contextData`, `stationInput`, `isPlaying`
- **Hooks:** `useEffect`×2, `useRef`×1, `useState`×6
- **Paquetes:** `react`
- **Lo importan:** *(nadie — entrada, huérfano, o cargado por otra vía)*
- **Eventos DOM:** ; escucha `LOB4D_PK_CONTEXT_CHANGED`, `mousemove`, `mouseup`
- **Funciones de módulo (línea):** `CivilStationTracker`:3
- **Funciones internas del componente (línea):** `handleMouseDown`:14, `formatStation`:42, `parseStation`:50, `handleStationSubmit`:60, `handleStep`:72, `toggleSimulation`:81

### `components/CivilToolsPanel.jsx` — 2106 líneas

> ── Zonas del frente (varios DWG sobre el MISMO eje) ──────────────────────── Un archivo Civil = una zona; el backend fusiona sus estaciones por eje (en solape manda el más reciente). Aquí se lista cada zona con el estado de sus SECCIONES y de sus TOPOGRAFÍAS (estas últimas alimentan el modo "Topografía" del holograma) y se pueden extraer las topografías que falten — mismo flujo de workitem que las secciones.

- **Exporta:** default `CivilToolsPanel`
- **Props:** `activeModelUrn`, `models`, `docs`, `onClose`
- **Estado local (`useState`):** 31 — `zonas`, `surf`, `busy`, `open`, `alignmentData`, `selectedAlignmentId`, `activeAlignmentIds`, `selectedProfileName`, `selectedDwgUrn`, `isExtracting`, `extractProgress`, `extractMessage`, `extractError`, `extractReportUrl`, `civilOriginalUrn`, `contextData`, `stationInput`, `searchOpen`, `query`, `stationLabelsVisible`, `baseAxisPin`, `pollingInterval`, `sectionJSON`, `sectionIndex`, `showSectionViewer`, `isExtractingSections`, `sectionProgress`, `sectionMessage`, `availableCivilFiles`, `civilDbItems`, `sectionsMetaByUrn`
- **Hooks:** `useCallback`×10, `useEffect`×10, `useMemo`×8, `useRef`×4, `useState`×31
- **Renderiza:** `Chevron`, `CloseIcon`, `DownloadIcon`, `ProfileIcon`, `PropertyRow`, `RoadIconSmall`, `SearchIcon`, `Section`, `SectionViewer`, `ZonasFrente`
- **Importa (local):** `../utils/apiFetch`, `./SectionViewer`, `./SourceFilesPanel.css`
- **Paquetes:** `react`
- **Lo importan:** `components/TandemSidebar.jsx`
- **Endpoints del backend:** `/api/civil/alignment-result`, `/api/civil/alignments`, `/api/civil/base-axis`, `/api/civil/extract-curves`, `/api/civil/extract-sections-test`, `/api/civil/extract-surfaces`, `/api/civil/sections`, `/api/civil/surfaces`, `/api/civil/workitem-status`
- **Llamadas de red:** `apiFetch`×27
- **Extensiones del visor:**  carga `LOB4DExtension`
- **Eventos DOM:** emite `civil-data-changed`; escucha `LOB4D_PK_CONTEXT_CHANGED`, `civil-data-changed`
- **Funciones de módulo (línea):** `ZonasFrente`:24, `getCivilSession`:150, `getCacheKey`:158, `getInitialCache`:160, `formatStation`:166, `parseStation`:175, `getProfileText`:186, `isSurfaceProfile`:188, `isDesignProfile`:198, `normalizeSearchText`:210, `getSearchTokens`:215, `getAlignmentTokens`:217, `getAlignmentKeys`:223, `getProfileScore`:235, `getPrimaryProfile`:267, `getVisibleProfiles`:275, `getDefaultProfileName`:284, `resolveProfileName`:286, `normalizeAlignments`:292, `countVisibleProfiles`:301, `getProfileRole`:304, `formatValue`:310, `RoadIconSmall`:314, `ProfileIcon`:324, `SearchIcon`:334, `DownloadIcon`:341, `CloseIcon`:349, `Chevron`:356, `PropertyRow`:362, `Section`:378 …(+1)
- **Funciones internas del componente (línea):** `load`:29, `extraerTopo`:51, `requested`:287, `persistCache`:531, `refreshSectionsMeta`:696, `displayNameForUrn`:711, `notifyCivilChanged`:718, `getExtension`:747, `applyAlignment`:764, `toggleStationLabels`:835, `updateStation`:866, `handleSectionSync`:918, `resolveProjectId`:945, `handleExtractCurves`:951, `handleExtractSectionsLegacy`:1111, `handleExtractSections`:1246, `handleStationSubmit`:1399, `handleStep`:1404, `clearSelection`:1408, `handleClearCivilData`:1423

### `components/ColumnConfiguratorModal.jsx` — 344 líneas

> Group available columns by category (simulated from key name patterns)

- **Exporta:** default `ColumnConfiguratorModal`
- **Props:** `open`, `onClose`, `availableColumns`, `selectedColumns`, `onUpdate`
- **Estado local (`useState`):** 4 — `currentSelection`, `searchTermAvailable`, `searchTermSelected`, `expandedCategories`
- **Hooks:** `useEffect`×1, `useMemo`×3, `useRef`×2, `useState`×4
- **Paquetes:** `react`, `react-dom`
- **Lo importan:** `components/InventoryDataGrid.jsx`
- **Funciones de módulo (línea):** `ColumnConfiguratorModal`:4
- **Funciones internas del componente (línea):** `handleAdd`:64, `handleRemove`:70, `toggleCategory`:74, `toggleCategorySelection`:78, `handleSave`:98, `handleReset`:103, `handleSort`:108

### `components/CompareView.jsx` — 940 líneas

> CompareView — Comparador (contractual vs avance), estilo ACC Compare pero propio. - Setup minimalista: modelo/documento + VERSION ACC por lado (como el dialogo "Comparar documentos" de ACC), con swap A<->B. - Diff de DATOS en PostgreSQL por external_id (+ diff 5D valorizado). - Si una version historica no esta extraida, se extrae automaticamente a un scope temporal ('__cmp__') sin tocar el inventario del frente real.

- **Exporta:** default `CompareView`
- **Props:** `BACKEND_URL`, `projectId`, `onExit`
- **Estado local (`useState`):** 10 — `phase`, `models`, `side`, `status`, `busy`, `diff`, `fiveD`, `activeList`, `detail`, `tip`
- **Hooks:** `useCallback`×4, `useEffect`×3, `useMemo`×4, `useRef`×9, `useState`×10
- **Importa (local):** `../aps/utils/loadAlignedModels`, `../utils/apiFetch`
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`
- **Endpoints del backend:** `/api/compare/cleanup`, `/api/compare/diff`, `/api/compare/element`, `/api/compare/element-metrados`, `/api/compare/extracted`, `/api/compare/metrados`, `/api/compare/prepare-version`, `/api/compare/versions`, `/api/config/project`, `/api/inventory/extract`, `/api/inventory/extract/status`
- **Llamadas de red:** `apiFetch`×12
- **API de Autodesk usada:** `Autodesk.Viewing.CAMERA_CHANGE_EVENT`, `Autodesk.Viewing.GuiViewer3D`, `Autodesk.Viewing.Viewer3D`
- **Funciones de módulo (línea):** `createEmptySide`:58, `modelKey`:66
- **Funciones internas del componente (línea):** `doExit`:116, `pickModel`:138, `pickVersion`:178, `addLink`:179, `removeLink`:218, `clearLinks`:227, `swapSides`:236, `scopeOf`:238, `labelOf`:246, `makeViewer`:253, `sourceUrnsOf`:263, `buildExternalLookups`:269, `wireSync`:295, `wireHover`:313, `wireMirror`:376, `themeSide`:406, `ensureExtracted`:416, `runCompare`:464, `editSelection`:553, `isolate`:561, `showAll`:581, `openDetail`:588, `fmtMoney`:624, `fmtNum`:625, `listData`:638 …(+1)

### `components/DiscoverySearchPanel.jsx` — 105 líneas

- **Exporta:** default `DiscoverySearchPanel`
- **Props:** `results`, `answer`, `loading`, `query`, `messages`, `onOpenDocument`, `onClose`, `onUniversalSearch`
- **Hooks:** `useEffect`×1, `useRef`×1, `useState`×1
- **Importa (local):** `./DiscoverySearchPanel.css`
- **Paquetes:** `react`
- **Lo importan:** `components/TandemSidebar.jsx`
- **Funciones de módulo (línea):** `DiscoverySearchPanel`:4
- **Funciones internas del componente (línea):** `handleSend`:14

### `components/DocPinPanel.jsx` — 1372 líneas

> Cache para almacenar las miniaturas de los PDFs (DataURLs) y evitar re-renderizados costosos

- **Exporta:** default `DocPinPanel`
- **Props:** `isOpen`, `onClose`, `pin`, `onDelete`, `onAttachDoc`, `onAttachBatchDocs`, `onRemoveDoc`, `onRename`, `projectPrefix`, `modelUrn`, `variant`
- **Estado local (`useState`):** 30 — `thumbnail`, `loading`, `isEditingTitle`, `tempTitle`, `editingDocId`, `tempDesc`, `browsing`, `currentPath`, `folders`, `files`, `loading`, `viewingDoc`, `aiDoc`, `aiQuestion`, `aiResponse`, `aiLoading`, `warmupStatus`, `warmupDocType`, `cmdMessages`, `cmdInput`, `cmdLoading`, `cmdActive`, `cmdExpanded`, `searchQuery`, `searchResults`, `isSearching`, `searchLoading`, `selectedItems`, `notification`, `viewMode`
- **Hooks:** `useCallback`×2, `useEffect`×5, `useRef`×3, `useState`×30, `useUrlFirmada`×1
- **Renderiza:** `Document`, `IconDelete`, `IconFile`, `IconGrid`, `IconList`, `IconPDF`, `IconSparkles`, `Page`, `PdfReader`, `PdfThumbnail`
- **Importa (local):** `../utils/apiFetch`, `../utils/permisosDeLectura`, `./DocPinPanel.css`, `./PdfReader`
- **Paquetes:** `react`, `react-pdf`
- **Lo importan:** `App.jsx`
- **Endpoints del backend:** `/api/ai/analyze-title`, `/api/ai/ask`, `/api/ai/warmup`, `/api/docs`, `/api/docs/batch`, `/api/docs/mutate-bind`, `/api/docs/proxy`
- **Llamadas de red:** `apiFetch`×10, `fetch`×3
- **Variables de entorno:** `VITE_BACKEND_URL`
- **Funciones de módulo (línea):** `PdfThumbnail`:20, `IconPDF`:82, `IconFolder`:92, `IconFile`:98, `IconDelete`:105, `IconSparkles`:112, `IconGrid`:118, `IconList`:127, `DocPinPanel`:138
- **Funciones internas del componente (línea):** `onRenderSuccess`:24, `handleSaveDesc`:160, `showNotify`:223, `activateCmd`:281, `handleCmdAsk`:288, `fetchContents`:336, `handleCreateFolder`:415, `handleUpload`:438, `handleDelete`:468, `handleRename`:489, `navigateToFolder`:511, `navigateUp`:515, `handleSearch`:523, `toggleSelection`:547, `handleBatchDelete`:556, `handleBatchAttach`:583, `handleOpenDoc`:643, `handleAskAI`:651, `getFileIcon`:685, `content`:695

### `components/DocsPanel.jsx` — 163 líneas

> Resuelve el external_id (ancla estable) del elemento seleccionado a partir de su dbId+urn, usando el mapa external_id->dbId que arma el visor al cargar.

- **Exporta:** default `DocsPanel`
- **Props:** `selectedElement`
- **Estado local (`useState`):** 6 — `accLink`, `title`, `docType`, `busy`, `status`, `docs`
- **Hooks:** `useCallback`×1, `useEffect`×1, `useState`×6
- **Importa (local):** `../utils/apiFetch`
- **Paquetes:** `react`
- **Lo importan:** `components/TandemSidebar.jsx`
- **Endpoints del backend:** `/api/element-docs`, `/api/element-docs`
- **Llamadas de red:** `apiFetch`×3
- **Variables de entorno:** `VITE_BACKEND_URL`
- **Funciones de módulo (línea):** `resolveExternalId`:8, `DocsPanel`:25
- **Funciones internas del componente (línea):** `loadDocs`:37, `handleAdd`:55, `handleRemove`:78

### `components/DocumentManager.jsx` — 465 líneas

> Helper: format file size

- **Exporta:** default `DocumentManager`
- **Props:** `isOpen`, `onClose`
- **Estado local (`useState`):** 12 — `currentPath`, `folders`, `files`, `loading`, `selectedItems`, `showNewFolder`, `newFolderName`, `uploading`, `uploadProgress`, `dragOver`, `sidebarFolders`, `expandedPaths`
- **Hooks:** `useCallback`×2, `useEffect`×1, `useRef`×1, `useState`×12
- **Renderiza:** `Document`, `Page`, `React.Fragment`
- **Importa (local):** `../services/uploadService`, `../utils/apiFetch`, `./DocumentManager.css`
- **Paquetes:** `react`, `react-pdf`
- **Lo importan:** `App.jsx`
- **Endpoints del backend:** `/api/docs/delete`, `/api/docs/folder`, `/api/docs/list`, `/api/docs/upload-complete`, `/api/docs/upload-url`
- **Llamadas de red:** `apiFetch`×6
- **Variables de entorno:** `VITE_BACKEND_URL`
- **Funciones de módulo (línea):** `formatSize`:14, `formatDate`:22, `getFileIcon`:29
- **Funciones internas del componente (línea):** `fetchContents`:59, `fetchSidebarRoot`:78, `navigateToFolder`:97, `handleUpload`:109, `handleCreateFolder`:171, `handleDelete`:191, `toggleSelect`:212, `handleDragOver`:222, `handleDragLeave`:227, `handleDrop`:229

### `components/DocumentPanel.jsx` — 154 líneas

- **Exporta:** default `DocumentPanel`
- **Props:** `documents`, `sprites`, `activeSpriteId`, `showSprites`, `spritePlacementActive`, `onSelectSprite`, `onAddClick`, `onRemove`, `onToggleSprites`, `onRequestSprite`
- **Estado local (`useState`):** 2 — `search`, `selected`
- **Hooks:** `useEffect`×2, `useMemo`×3, `useState`×2
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`, `components/TandemSidebar.jsx`
- **Funciones de módulo (línea):** `DocumentPanel`:3

### `components/ErrorBoundary.jsx` — 86 líneas

> ErrorBoundary — atrapa errores de render de su subárbol y muestra una UI de recuperación en vez de dejar la app en pantalla blanca. Props: - scope: etiqueta para el log ('app' | 'viewer' | ...) - title / message: textos opcionales de la pantalla de recuperación - compact: variante chica (para envolver un panel, no toda la app) - onReset: callback opcional para reintentar sin recargar toda la página

- **Exporta:** default `ErrorBoundary`
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`, `main.jsx`

### `components/FilterConfiguratorModal.jsx` — 325 líneas

> Local state

- **Exporta:** default `FilterConfiguratorModal`
- **Props:** `open`, `onClose`, `availableProperties`, `selectedProperties`, `onUpdate`
- **Estado local (`useState`):** 4 — `currentSelection`, `searchTermAvailable`, `searchTermSelected`, `expandedCategories`
- **Hooks:** `useEffect`×1, `useMemo`×3, `useRef`×2, `useState`×4
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`
- **Funciones de módulo (línea):** `FilterConfiguratorModal`:8
- **Funciones internas del componente (línea):** `handleAdd`:73, `handleRemove`:79, `toggleCategory`:83, `handleSave`:87, `handleReset`:92, `handleSort`:97

### `components/GeoControlPanel.jsx` — 576 líneas

> TOPOGRAFÍA — Puntos de control + amarre modelo↔UTM. La columna vertebral del AR georreferenciado, del lado de gabinete: 1) CARGAR: el topógrafo sube su CSV de puntos (los mismos del dron: ID, Este, Norte, Cota[, descripción]). Viven en Postgres, por proyecto. 2) AMARRAR: 2+ pares "clic en el modelo ↔ punto de control" y el ajuste Helmert (con tests) da la transformación modelo↔UTM con su residual.

- **Exporta:** default `GeoControlPanel`; con nombre: `parsearCsvPuntos`
- **Props:** `project`, `BACKEND_URL`, `onClose`
- **Estado local (`useState`):** 11 — `urn`, `puntos`, `georef`, `pares`, `pcElegido`, `amarrando`, `msj`, `modoEnsayo`, `capturando`, `ensayoA`, `ensayoB`
- **Hooks:** `useEffect`×5, `useMemo`×2, `useRef`×2, `useState`×11
- **Importa (local):** `../native/georefFit`, `../utils/apiFetch`
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`
- **Endpoints del backend:** `/api/geo/control-points`, `/api/geo/control-points`, `/api/geo/georef`
- **Llamadas de red:** `apiFetch`×11
- **Funciones de módulo (línea):** `elViewer`:39, `parsearCsvPuntos`:46
- **Funciones internas del componente (línea):** `sep`:49, `num`:50, `norm`:51, `idx`:53, `delVisor`:91, `api`:108, `crearEnsayoOficina`:133, `guardarEnsayo`:142, `dTxt`:188, `diagnosticoMarco`:200, `borrarEnsayo`:244, `onDown`:271, `onClick`:272, `subirCsv`:300, `onClick`:322, `guardarAmarre`:348, `volarAPunto`:384

### `components/HeatmapConfigPanel.jsx` — 67 líneas

- **Exporta:** default `HeatmapConfigPanel`; con nombre: `THEME_PALETTES`
- **Props:** `propId`, `propName`, `initialPalette`, `onApply`, `onClose`
- **Estado local (`useState`):** 1 — `selectedPalette`
- **Hooks:** `useState`×1
- **Importa (local):** `./HeatmapConfigPanel.css`
- **Paquetes:** `react`, `react-dom`
- **Lo importan:** `components/TandemFilterPanel.jsx`
- **Funciones de módulo (línea):** `HeatmapConfigPanel`:12
- **Funciones internas del componente (línea):** `handleApply`:15

### `components/ImportModelModal.jsx` — 772 líneas

- **Exporta:** default `ImportModelModal`
- **Props:** `open`, `onClose`, `onLinkDocs`, `onUploadLocal`, `onExtractCivilData`, `selectedProject`, `relinkTarget`
- **Estado local (`useState`):** 27 — `activeTab`, `selectedDocs`, `accounts`, `projects`, `selectedAccountId`, `selectedProjectId`, `accountMenuOpen`, `projectMenuOpen`, `uploadLabel`, `extracting`, `extractionDone`, `progress`, `progressMsg`, `modelViews`, `selectedViewGuid`, `viewDropdownOpen`, `loadingViews`, `localFile`, `isDragOver`, `localUploading`, `localProgress`, `localMsg`, `errorMsg`, `civilMode`, `civilProcessing`, `civilProgress`, `civilMsg`
- **Hooks:** `useCallback`×2, `useEffect`×3, `useRef`×2, `useState`×27
- **Renderiza:** `ChevronDownIcon`, `CloseIcon`, `NativeFileTree`, `UploadIcon`
- **Importa (local):** `../utils/apiFetch`, `./ImportModelModal.css`, `./NativeFileTree`
- **Paquetes:** `@capacitor/core`, `react`
- **Lo importan:** `App.jsx`
- **Endpoints del backend:** `/api/hubs`, `/api/hubs`, `/api/inventory/extract`, `/api/inventory/extract/status`, `/api/inventory/purge-source`, `/api/inventory/viewables`
- **Llamadas de red:** `apiFetch`×6
- **Capacitor:** `@capacitor/core`
- **Eventos DOM:** emite `inventory-needs-refresh`
- **Variables de entorno:** `VITE_BACKEND_URL`
- **Funciones de módulo (línea):** `ChevronDownIcon`:9, `UploadIcon`:15, `CloseIcon`:21, `getSourceName`:29, `getSourceExt`:37, `isCadCivilSource`:43, `toViewerUrn`:45, `ImportModelModal`:59
- **Funciones internas del componente (línea):** `handleDocSelection`:151, `handleDrop`:159, `handleFileChange`:169, `purgeOrphanExtraction`:180, `cancelProcess`:195, `fetchViewables`:205, `handleStartExtraction`:223, `handleFinalImport`:312, `handleLocalUpload`:369

### `components/InventoryDataGrid.jsx` — 1597 líneas

> ─── Fractional-Inch Formatter ─────────────────────────────────────────── Autodesk Model Derivative API almacena diámetros y medidas como "0.375 fractional-in", pero el visor 3D los muestra como "3/8\"". Este formateador replica esa conversión para consistencia visual.

- **Exporta:** default `InventoryDataGrid`
- **Props:** `activeModelUrn`, `dynamicFilterBuckets`, `filterSelections`, `hiddenModelUrns`, `onClose`
- **Estado local (`useState`):** 28 — `editingCol`, `editValue`, `flattenedData`, `rawData`, `columns`, `allPropertyKeys`, `selectedColumnKeys`, `columnConfigOpen`, `highlightedDbId`, `scrollTop`, `containerHeight`, `activeTab`, `followSelection`, `showAssetsOnly`, `isLoading`, `totalsPickerOpen`, `totalColumns`, `checkedIds`, `bulkAssigning`, `bulkField`, `bulkNewField`, `bulkValue`, `groupByKey`, `groupMenuOpen`, `collapsedGroups`, `isolatedExtIds`, `localSelIds`, `activeSelectionFilter`
- **Hooks:** `useCallback`×5, `useEffect`×11, `useMemo`×4, `useRef`×5, `useState`×28
- **Renderiza:** `ColumnConfiguratorModal`, `Icons.Close`, `Icons.Columns`, `Icons.ExportAction`, `Icons.Filter`, `Icons.Group`, `Icons.Sigma`, `Icons.Sync`, `Icons.Undock`, `InventoryRow`, `ToolBtn`
- **Importa (local):** `../utils/apiFetch`, `../utils/enlaceCompartido`, `./ColumnConfiguratorModal`
- **Paquetes:** `@capacitor/core`, `react`, `xlsx` · perezosos: `@capacitor/filesystem`
- **Lo importan:** `App.jsx`
- **Endpoints del backend:** `/api/inventory`, `/api/inventory/bulk`
- **Llamadas de red:** `apiFetch`×3
- **Capacitor:** `@capacitor/core`
- **Eventos DOM:** emite `close-inventory`, `inventory-needs-refresh`, `recalculate-filters`, `viewer-select`; escucha `inventory-highlight-row`, `inventory-isolation-sync`, `inventory-selection-sync`, `message`, `restore-inventory-config`
- **Variables de entorno:** `VITE_BACKEND_URL`
- **Funciones de módulo (línea):** `formatFractionalInch`:17, `ToolBtn`:85, `InventoryDataGrid`:180
- **Funciones internas del componente (línea):** `gcd`:39, `parseNumericCell`:209, `handleExportExcel`:623, `handleRowClick`:709, `handleCellEdit`:742, `handleScroll`:782, `groupValueOf`:808

### `components/LOB4DPanel.jsx` — 7 líneas

- **Exporta:** default `LOB4DPanel`
- **Renderiza:** `LOB4DWorkspace`
- **Importa (local):** `./lob4d/LOB4DWorkspace`
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`

### `components/LandingPage.jsx` — 610 líneas

> ─── LandingPage (ACC-Style Hub + Project Selector) ───────────────────────── Replica el flujo de Autodesk ACC: 1. Se muestran los Hubs (Municipalidades) 2. Al hacer click en un Hub se ven sus Proyectos 3. Al elegir un Proyecto se entra al visor con ese contexto En la BD: Hub     → tabla 'hubs'     (id, name, region) Project → tabla 'projects' (id, hub_id, name, model_urn, ...)

- **Exporta:** default `LandingPage`
- **Props:** `onSelectProject`, `user`
- **Estado local (`useState`):** 22 — `hubs`, `projects`, `activeHubId`, `loading`, `searchQuery`, `showNewHubForm`, `showNewProjForm`, `newHubName`, `newHubRegion`, `newProjName`, `newProjType`, `newProjDesc`, `saving`, `selectedBaseProject`, `customFrentes`, `showNewFrente`, `newFrenteName`, `newFrenteDesc`, `newFrenteIcon`, `newFrenteType`, `savingFrente`, `frenteError`
- **Hooks:** `useCallback`×1, `useEffect`×2, `useState`×22
- **Renderiza:** `React.Fragment`
- **Importa (local):** `../utils/apiFetch`, `../utils/hubLink`, `./LandingPage.css`
- **Paquetes:** `@capacitor/core`, `react`
- **Lo importan:** `App.jsx`
- **Endpoints del backend:** `/api/frentes`, `/api/hubs`, `/api/hubs`, `/api/projects`
- **Llamadas de red:** `apiFetch`×8
- **Capacitor:** `@capacitor/core`
- **Variables de entorno:** `VITE_BACKEND_URL`
- **Funciones de módulo (línea):** `LandingPage`:21
- **Funciones internas del componente (línea):** `handleCreateFrente`:65, `fetchData`:96, `handleProjectClick`:121, `handleFrontSelect`:125, `handleCreateHub`:149, `handleCreateProject`:168

### `components/LinkRevitBadge.jsx` — 261 líneas

> LinkRevitBadge — icono de vínculo Web ↔ Revit (esquina inferior derecha). Al activarlo, lo que hagas en el visor (seleccionar / aislar) se publica al canal del frente (/api/link/cmd) y el plugin "ECD Link" instalado en el Revit del modelador lo aplica en ~1 s. El punto verde indica que hay un Revit vivo (heartbeat < 10 s). Los externalIds del visor SON los UniqueId de Revit, así que no hay tablas de mapeo: identidad 

- **Exporta:** default `LinkRevitBadge`
- **Props:** `project`, `backendUrl`, `variant`
- **Estado local (`useState`):** 2 — `active`, `revitOnline`
- **Hooks:** `useEffect`×5, `useRef`×5, `useState`×2
- **Importa (local):** `../utils/apiFetch`
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`
- **Endpoints del backend:** `/api/link/cmd`, `/api/link/report`, `/api/link/status`
- **Llamadas de red:** `apiFetch`×4
- **Eventos DOM:** ; escucha `viewer-colors-applied`
- **Funciones de módulo (línea):** `norm`:11, `toExternalIds`:14
- **Funciones internas del componente (línea):** `check`:43, `getModels`:62, `externalToDbIds`:63, `applyReverse`:73, `poll`:98, `publish`:122, `onSelection`:147, `onVisibility`:153, `iso`:154, `hidden`:155, `onColors`:173

### `components/LoginScreen.jsx` — 543 líneas

> ── IDENTIDAD ──────────────────────────────────────────────────────────────── ALEPHIA es la MARCA (logo oficial, nunca redibujado); «View» es el PRODUCTO; el proyecto (PIE_OBRA) es el PROYECTO. Tres niveles que no se mezclan.

- **Exporta:** default `LoginScreen`
- **Props:** `onLogin`
- **Estado local (`useState`):** 15 — `lang`, `pidiendoEnlace`, `enlaceEnviado`, `desafio2fa`, `codigo2fa`, `correo`, `clave`, `verClave`, `nombre`, `clave2`, `enviando`, `despertando`, `error`, `entrado`, `hayGoogle`
- **Hooks:** `useCallback`×1, `useEffect`×3, `useRef`×2, `useState`×15
- **Renderiza:** `IconoOjo`, `Marca`
- **Importa (local):** `./LoginScreen.css`
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`
- **Endpoints del backend:** `/api/auth/2fa/verify`, `/api/auth/forgot-password`, `/api/auth/google`, `/api/auth/login`, `/api/auth/register`, `/api/auth/reset-password`
- **Llamadas de red:** `fetch`×1
- **Variables de entorno:** `VITE_BACKEND_URL`, `VITE_GOOGLE_CLIENT_ID`
- **Funciones de módulo (línea):** `correoDeInvitacion`:120, `IconoOjo`:128, `Marca`:136, `LoginScreen`:146
- **Funciones internas del componente (línea):** `pedir`:197, `mensajeDeError`:219, `acceder`:234, `verificarCodigo`:255, `registrar`:275, `pedirEnlace`:291, `guardarNuevaClave`:304

### `components/NativeARView.jsx` — 989 líneas

> Ocultar/mostrar TODOS los modelos de forma robusta: la API cambia entre versiones de LMV y `hideModel` no siempre existe (por eso el modelo seguía visible al entrar en AR). Se prueban las tres vías conocidas. Devuelve al visor su aspecto de siempre: iluminación, entorno, sombras y fondo. La usan tanto la salida del AR como el paso ATRÁS desde la cámara al modelo — el AR es un modo temporal y no puede dejar el visor p

- **Exporta:** default `NativeARView`
- **Props:** `onExit`
- **Estado local (`useState`):** 19 — `status`, `tracking`, `anchored`, `reticle`, `enCamara`, `algoVaMal`, `yawDegrees`, `unitsPerMeter`, `escala`, `aligning`, `modo`, `ajustando`, `eligiendoModo`, `calibrandoEsquina`, `hud`, `transp`, `diagLog`, `arStats`, `geo`
- **Hooks:** `useEffect`×2, `useOverlayAlpha`×1, `useRef`×22, `useState`×19, `useTeclasSimulador`×1
- **Renderiza:** `ArAdjustPanel`, `ArCornerPanel`
- **Importa (local):** `../native/arStake`, `../native/arViewerBridge`, `../native/arcore`, `../native/geoAnchor`, `../utils/apiFetch`, `./ARTransparent.css`, `./ArAdjustPanel`, `./ArCornerPanel`
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`
- **Endpoints del backend:** `/api/geo/control-points`, `/api/geo/georef`
- **Llamadas de red:** `apiFetch`×2
- **Almacenamiento:** localStorage `visor_selectedProject`
- **Funciones de módulo (línea):** `restaurarAspecto`:24, `setModelsVisible`:41
- **Funciones internas del componente (línea):** `intenta`:26, `modelos`:44, `abrirMotorNativo`:147, `puntos`:164, `georef`:165, `handleTapPlace`:495, `colocarSinCalibrar`:509, `handleAnchor`:527, `handleGpsOrient`:567, `changeYaw`:602, `applyUpm`:611, `setYawAbsolute`:618, `norm`:619, `toggleAlign`:625

### `components/NativeFileTree.jsx` — 293 líneas

> Custom hook for fetching data

- **Exporta:** default `NativeFileTree`
- **Props:** `onSelectionChange`, `forcedHubId`, `forcedProjectId`, `onFileSelect`
- **Estado local (`useState`):** 5 — `data`, `error`, `loading`, `isOpen`, `selectedFiles`
- **Hooks:** `useEffect`×2, `useFetch`×2, `useState`×5
- **Renderiza:** `TreeNode`
- **Importa (local):** `../utils/apiFetch`, `./NativeFileTree.css`
- **Paquetes:** `@capacitor/core`, `react`
- **Lo importan:** `App.jsx`, `components/AddDocumentModal.jsx`, `components/ImportModelModal.jsx`
- **Endpoints del backend:** `/api/hubs`, `/api/hubs`, `/api/projects`
- **Llamadas de red:** `apiFetch`×3
- **Capacitor:** `@capacitor/core`
- **Variables de entorno:** `VITE_BACKEND_URL`
- **Funciones de módulo (línea):** `useFetch`:17, `middleTruncate`:48, `TreeNode`:55, `NativeFileTree`:224
- **Funciones internas del componente (línea):** `handleToggle`:86, `handleCheck`:98, `getIcon`:140, `handleFileSelect`:234

### `components/PdfReader.jsx` — 245 líneas

> PdfReader.jsx — Visor PDF propio para frontend-react (el mismo motor que en docs). Lector profesional: miniaturas, ajustar página/ancho, zoom al cursor, pan, navegación de páginas, rotación y descarga. Reemplaza el <iframe> crudo.

- **Exporta:** default `PdfReader`
- **Props:** `url`, `fileName`
- **Estado local (`useState`):** 7 — `numPages`, `page`, `scale`, `rotation`, `loading`, `error`, `showThumbs`
- **Hooks:** `useCallback`×2, `useEffect`×7, `useRef`×8, `useState`×7, `useUrlFirmada`×1
- **Renderiza:** `Thumb`
- **Importa (local):** `../utils/permisosDeLectura`
- **Paquetes:** `pdfjs-dist`, `react`
- **Lo importan:** `App.jsx`, `components/DocPinPanel.jsx`
- **Eventos DOM:** ; escucha `keydown`
- **Variables de entorno:** `VITE_BACKEND_URL`
- **Funciones de módulo (línea):** `Thumb`:10
- **Funciones internas del componente (línea):** `renderPage`:85, `fitTo`:105, `goTo`:127, `zoomAt`:128, `onDown`:168, `onMove`:173, `onUp`:174

### `components/PdfViewer.jsx` — 222 líneas

> Ensure worker is configured (same as DocPinPanel)

- **Exporta:** default `PdfViewer`
- **Props:** `url`, `onClose`
- **Estado local (`useState`):** 8 — `numPages`, `pageNumber`, `scale`, `offset`, `isDragging`, `lastMousePos`, `lastPinchDist`, `lastTouchPos`
- **Hooks:** `useCallback`×2, `useEffect`×1, `useRef`×2, `useState`×8
- **Renderiza:** `Document`, `Page`
- **Importa (local):** `./PdfViewer.css`
- **Paquetes:** `react`, `react-pdf`
- **Lo importan:** *(nadie — entrada, huérfano, o cargado por otra vía)*
- **Funciones de módulo (línea):** `PdfViewer`:8
- **Funciones internas del componente (línea):** `onDocumentLoadSuccess`:21, `handleMouseDown`:29, `handleDoubleClick`:37, `handleMouseMove`:42, `handleMouseUp`:55, `handleTouchStart`:60, `handleTouchMove`:78, `handleTouchEnd`:116, `handleWheel`:123

### `components/PhotoAlbumModal.jsx` — 1022 líneas

> Fallback image if source missing

- **Exporta:** default `PhotoAlbumModal`
- **Props:** `isOpen`, `onClose`, `pinId`, `title`, `photos`, `onAddPhoto`, `variant`, `onDelete`, `onDeletePhoto`, `onUpdatePhoto`, `onRename`, `modelUrn`, `targetPath`, `projectPrefix`
- **Estado local (`useState`):** 22 — `isEditingTitle`, `tempTitle`, `selectedPhoto`, `lbZoom`, `lbPan`, `editingDesc`, `tempDesc`, `isUploading`, `uploadProgress`, `showFilters`, `dateRange`, `mediaType`, `searchTerm`, `browsing`, `browseMode`, `browsePath`, `browseFolders`, `browseFiles`, `browseLoading`, `toastMsg`, `showCamera`, `urlsFirmadas`
- **Hooks:** `useEffect`×4, `useRef`×3, `useState`×22
- **Renderiza:** `CameraCapture`
- **Importa (local):** `../services/uploadQueue`, `../services/uploadService`, `../utils/apiFetch`, `./CameraCapture`, `./PhotoAlbumModal.css`
- **Paquetes:** `exifr`, `react`
- **Lo importan:** `App.jsx`
- **Endpoints del backend:** `/api/docs`, `/api/docs/proxy`, `/api/docs/upload-confirm`, `/api/docs/upload-url`
- **Llamadas de red:** `apiFetch`×3
- **Eventos DOM:** ; escucha `beforeunload`, `keydown`
- **Variables de entorno:** `VITE_BACKEND_URL`
- **Funciones de módulo (línea):** `conMiniatura`:29, `PhotoAlbumModal`:36
- **Funciones internas del componente (línea):** `showToast`:98, `BACKEND_URL`:103, `fetchBrowseContents`:106, `handleOpenBrowser`:124, `handleSelectFromECD`:134, `setQuickFilter`:199, `isVideoFile`:219, `handleFileChange`:225, `content`:398

### `components/ProfilePanel.jsx` — 581 líneas

> ── PANEL DE PERFIL LONGITUDINAL interactivo ──────────────────────────────── Dibuja los perfiles (terreno, rasante, corona…) del eje activo bajo el visor, SINCRONIZADO con la progresiva 3D en ambos sentidos: · mueves el cursor/etiqueta en el 3D  → la línea del perfil se mueve · arrastras dentro del perfil          → el marcador 3D salta a esa PK Fuente de datos: window.__lobCivilAlignments (extracción de Civil en BD)

- **Exporta:** default `ProfilePanel`
- **Estado local (`useState`):** 11 — `open`, `alignments`, `activeId`, `cursorPk`, `panelH`, `vExag`, `pxPlot`, `showFill`, `showSlopes`, `showBands`, `view`
- **Hooks:** `useCallback`×5, `useEffect`×7, `useMemo`×9, `useRef`×4, `useState`×11
- **Renderiza:** `ProfileIcon`
- **Importa (local):** `./TandemIcons`
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`
- **Almacenamiento:** localStorage `profile_panel_h`
- **Eventos DOM:** emite `viewer-profile-state`; escucha `LOB4D_PK_CONTEXT_CHANGED`, `pointermove`, `pointerup`, `resize`, `viewer-toggle-profile`
- **Funciones de módulo (línea):** `colorForProfile`:19, `fmtPk`:26, `validPoints`:28, `zAt`:33
- **Funciones internas del componente (línea):** `t`:43, `startResize`:73, `syncAlignments`:91, `x`:272, `y`:273, `stationFromEvent`:276, `driveViewer`:284, `onPointerDown`:297, `onPointerMove`:312, `onPointerUp`:329, `onDoubleClick`:330, `pickPkStep`:336, `slopeSegs`:359

### `components/ProgressDetailPanel.jsx` — 677 líneas

> State for Partida dropdown

- **Exporta:** default `ProgressDetailPanel`
- **Props:** `isOpen`, `onClose`, `pin`, `elementProps`, `onDelete`, `isDocked`, `onToggleDock`, `onUpdatePin`, `availablePartidas`
- **Estado local (`useState`):** 10 — `partidaDropdownOpen`, `partidaSearch`, `highlightedIndex`, `parametroBase`, `parametroBaseOpen`, `headerHighlightIndex`, `headerSearch`, `metradoRows`, `openRowDropdownId`, `rowHighlightIndex`
- **Hooks:** `useEffect`×7, `useMemo`×3, `useRef`×8, `useState`×10
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`
- **Eventos DOM:** ; escucha `mousedown`
- **Funciones de módulo (línea):** `ProgressDetailPanel`:4
- **Funciones internas del componente (línea):** `getValueForBase`:125, `getDataForGroup`:134, `handleSelectPartida`:214, `handleSelectHeader`:226, `handlePartidaKeyDown`:234, `handleHeaderKeyDown`:257, `handleRowDropdownKeyDown`:285, `toggleRowDropdown`:314, `handleRowChange`:324, `addRow`:340, `removeRow`:345

### `components/SecondaryViewer.jsx` — 95 líneas

> Initialize a new GUI Viewer instance (Headless would lack toolbar) We use the same Initializer as the main app (assumed running).

- **Exporta:** default `SecondaryViewer`
- **Props:** `document`, `node`, `urn`
- **Hooks:** `useEffect`×2, `useRef`×2
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`
- **API de Autodesk usada:** `Autodesk.Viewing.Document.load`, `Autodesk.Viewing.GuiViewer3D`
- **Funciones de módulo (línea):** `SecondaryViewer`:4

### `components/SectionCutTool.jsx` — 361 líneas

> SectionCutTool — corte PREDECIBLE para obra lineal. Regla de diseño: siempre se corta respecto al EJE de la obra y al elemento que tocas, nunca respecto a ejes globales (el modelo está georreferenciado y rotado: X/Y/Z del mundo dan planos diagonales inútiles). Tres cortes con significado FIJO — el mismo botón hace lo mismo toques la cara que toques:

- **Exporta:** default `SectionCutTool`
- **Props:** `plane`, `edge`, `planeColor`
- **Estado local (`useState`):** 3 — `mode`, `hit`, `applied`
- **Hooks:** `useEffect`×3, `useRef`×2, `useState`×3
- **Renderiza:** `IsoCutIcon`
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`
- **Extensiones del visor:**  carga `Autodesk.Section`
- **Funciones de módulo (línea):** `getFaceHit`:22, `radioEnPantalla`:47, `showPickMarker`:70, `clearPickMarker`:111, `axisFrameAt`:123, `IsoCutIcon`:140, `normalFor`:156, `fmtPk`:182
- **Funciones internas del componente (línea):** `onDown`:205, `onUp`:206, `applyPlane`:230, `chooseCut`:244, `invert`:251, `clearCut`:258, `exitMode`:266, `iconBtn`:273

### `components/SectionViewer.jsx` — 1302 líneas

> ── SectionViewer — panel de secciones estilo InfraWorks, DOCKEADO a la derecha ── El modelo queda visible. Sincronización DUAL con el visor 3D: panel → modelo: cambiar estación mueve el marcador PK (y el corte si está activo) modelo → panel: mover la progresiva en el 3D (evento LOB4D_PK_CONTEXT_CHANGED) salta a la sección más cercana. "Corte 3D" activa un plano de corte real perpendicular al eje en esa progresiva.

- **Exporta:** default `SectionViewer`
- **Props:** `sectionsData`, `onClose`, `onSync`, `getModelSlice`, `alignmentId`
- **Estado local (`useState`):** 15 — `currentIndex`, `hidden`, `view`, `mode`, `volMaterial`, `aspect`, `cutOn`, `syncOn`, `legendOpen`, `probe`, `selKey`, `mdlSlice`, `showModel`, `light`, `cvSize`
- **Hooks:** `useCallback`×4, `useEffect`×10, `useMemo`×13, `useRef`×7, `useState`×15
- **Paquetes:** `react`, `react-dom`
- **Lo importan:** `components/CivilToolsPanel.jsx`
- **Eventos DOM:** ; escucha `LOB4D_PK_CONTEXT_CHANGED`
- **Funciones de módulo (línea):** `hashColor`:26, `labelFromName`:32, `classify`:42, `ptEq`:55, `buildChains`:57, `chainSig`:87, `shoelace`:93, `splitLoops`:105, `elevAt`:123, `elevsAt`:137, `normalizeStations`:150, `niceStep`:157, `formatStation`:164, `computeVolumes`:175, `SectionViewer`:221, `btn`:1293
- **Funciones internas del componente (línea):** `segs`:58, `rest`:167, `pushToModel`:297, `goIndex`:303, `toX`:565, `toY`:566, `clientToWorld`:569, `onWheel`:577, `onPointerDown`:642, `onPointerMove`:647, `onPointerUp`:687, `onPointerLeave`:710, `shapeElevsAt`:718, `cleanBand`:748, `toggle`:755, `dispColor`:791, `worldToScreen`:801

### `components/SheetViewerPanel.jsx` — 92 líneas

> SheetViewerPanel — visor 2D de LÁMINAS de Revit (hojas del RVT ya traducidas). Abre la vista 2D (guid) del mismo URN ya cargado en el visor principal, en un panel dividido a la derecha, con su PROPIA instancia de GuiViewer3D. No toca el visor 3D ni su cámara/georreferenciación. Autodesk.Viewing ya está inicializado por el visor principal (token incluido), así que aquí solo se crea el visor y se carga el nodo 2D.

- **Exporta:** default `SheetViewerPanel`
- **Props:** `sheet`, `onClose`
- **Estado local (`useState`):** 1 — `status`
- **Hooks:** `useEffect`×1, `useRef`×2, `useState`×1
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`

### `components/SourceFilesPanel.jsx` — 355 líneas

> --- ICONS ---

- **Exporta:** default `SourceFilesPanel`
- **Props:** `models`, `hiddenModels`, `onImport`, `onRemove`, `onToggleVisibility`, `modelViews`, `activeViewableGuids`, `onLoadView`, `onUpdate`, `onUpdateAll`, `updateAllBusy`, `onRelink`, `extractionJobs`
- **Estado local (`useState`):** 2 — `expandedModels`, `activeMenu`
- **Hooks:** `useState`×2
- **Renderiza:** `CheckIcon`, `ChevronDown`, `ChevronRight`, `ClockIcon`, `DeleteIcon`, `EyeIcon`, `InfoIcon`, `MoreIcon`, `PlusIcon`, `RelinkIcon`, `RevitIcon`, `StarIcon`, `UpdateIcon`, `ViewIcon`
- **Importa (local):** `./SourceFilesPanel.css`
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`, `components/TandemSidebar.jsx`
- **Funciones de módulo (línea):** `ChevronRight`:6, `ChevronDown`:12, `StarIcon`:18, `EyeIcon`:24, `MoreIcon`:34, `RevitIcon`:40, `ClockIcon`:47, `ViewIcon`:53, `InfoIcon`:59, `PlusIcon`:65, `CheckIcon`:72, `UpdateIcon`:78, `RelinkIcon`:79, `DeleteIcon`:80, `getTimeAgo`:83, `getActiveViewName`:98, `SourceFilesPanel`:119
- **Funciones internas del componente (línea):** `toggleExpand`:128

### `components/StationTracker.jsx` — 320 líneas

> --- Draggable ---

- **Exporta:** default `StationTracker`
- **Props:** `isVisible`, `onClose`, `markers`, `viewerRef`
- **Estado local (`useState`):** 6 — `position`, `isDragging`, `selectedTrack`, `currentStationIdx`, `stationInput`, `showProperties`
- **Hooks:** `useEffect`×3, `useMemo`×2, `useRef`×1, `useState`×6
- **Renderiza:** `PropertyRow`
- **Paquetes:** `react`
- **Lo importan:** `components/Viewer.jsx`
- **Eventos DOM:** ; escucha `mousemove`, `mouseup`, `station-drag-update`
- **Funciones de módulo (línea):** `StationTracker`:3, `PropertyRow`:304
- **Funciones internas del componente (línea):** `handleMouseDown`:9, `formatStation`:67, `navigate`:75, `jumpToStation`:81, `flyTo`:96, `sectionCut`:106, `clearSection`:115, `handleTrackChange`:121

### `components/TandemFilterPanel.jsx` — 872 líneas

> Subcomponente memoizado para evitar re-renders masivos

- **Exporta:** default `TandemFilterPanel`; con nombre: `restoreSourceTints`
- **Props:** `models`, `hiddenModelUrns`, `dynamicFilterBuckets`, `filterSelections`, `filterColors`, `expandedFilters`, `facetSearch`, `visiblePropertyObjects`, `hasMoreProperties`, `handleToggleModelVisibility`, `togglePropertyAll`, `handleValueToggle`, `toggleColor`, `setFilterConfiguratorOpen`, `setFilterSelections`, `setHiddenModelUrns`, `setExpandedFilters`, `setFacetSearch`, `setVisiblePropertiesCount`, `PALETTE`, `DEFAULT_VISIBLE_VALUES`
- **Estado local (`useState`):** 7 — `colorPickerTarget`, `sourcesColorOn`, `sourceCustomColors`, `sourcePickerUrn`, `heatmapConfig`, `isProcessing`, `customValueColors`
- **Hooks:** `useCallback`×4, `useEffect`×5, `useMemo`×2, `useState`×7
- **Renderiza:** `FilterCategory`, `GearIcon`, `PaletteIconTandem`, `React.Fragment`, `RevertIcon`, `SearchIconTandem`
- **Importa (local):** `./HeatmapConfigPanel`, `./TandemIcons`
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`, `components/TandemSidebar.jsx`
- **Eventos DOM:** emite `filters-reset-all`, `theme-property-bucket`; escucha `custom-colors-restored`, `ecd-source-tints-reset`, `ecd-source-tints-restore`, `filters-calculated`
- **Funciones de módulo (línea):** `normUrn`:305, `restoreSourceTints`:326, `TandemFilterPanel`:361
- **Funciones internas del componente (línea):** `searchQuery`:40, `handleSearchChange`:48, `isUrnHidden`:385, `sourceTintOf`:397, `_applySourceTint`:408, `toggleSourcesColor`:511, `setSourceColor`:518, `handleColorToggle`:542, `handleCustomColorChange`:568, `handleResetAll`:590

### `components/TandemIcons.jsx` — 91 líneas

> Perfil longitudinal: ejes + una línea de terreno (para la barra de capas)

- **Exporta (con nombre):** `ClusterIconTandem`, `EarthworksGhostIcon`, `ExcavationIcon`, `GearIcon`, `HeatmapIcon`, `HoverInfoIcon`, `PaletteIconTandem`, `ProfileIcon`, `RevertIcon`, `SearchIconTandem`, `ZoneTagIcon`
- **Paquetes:** `react`
- **Lo importan:** `components/ProfilePanel.jsx`, `components/TandemFilterPanel.jsx`, `components/ViewerLabelsBar.jsx`
- **Funciones de módulo (línea):** `GearIcon`:3, `RevertIcon`:10, `SearchIconTandem`:17, `PaletteIconTandem`:24, `ClusterIconTandem`:34, `ProfileIcon`:41, `ExcavationIcon`:49, `EarthworksGhostIcon`:59, `HeatmapIcon`:67, `HoverInfoIcon`:77, `ZoneTagIcon`:85

### `components/TandemSidebar.jsx` — 296 líneas

> SourceFilesPanel props

- **Exporta:** default `TandemSidebar`
- **Props:** `activePanel`, `panelVisible`, `sidebarWidth`, `setSidebarWidth`, `models`, `activeModelUrn`, `hiddenModelUrns`, `dynamicFilterBuckets`, `filterSelections`, `filterColors`, `expandedFilters`, `facetSearch`, `visiblePropertyObjects`, `hasMoreProperties`, `handleToggleModelVisibility`, `togglePropertyAll`, `handleValueToggle`, `toggleColor`, `setFilterConfiguratorOpen`, `setFilterSelections`, `setHiddenModelUrns`, `setExpandedFilters`, `setFacetSearch`, `setVisiblePropertiesCount`, `PALETTE`, `DEFAULT_VISIBLE_VALUES`, `// SourceFilesPanel props     modelViews`, `activeViewableGuids`, `handleLoadSpecificView`, `handleModelUpdate`, `handleUpdateAll`, `updateAllBusy`, `removeModel`, `setRelinkTargetModel`, `setImportModalOpen`, `extractionJobs`, `availableUpdates`, `updateCheckStatus`, `sheets`, `onOpenSheet`, `// DocumentPanel props     documents`, `sprites`, `activeSpriteId`, `showSprites`, `spritePlacementActive`, `handleSpriteSelect`, `setDocumentsModalOpen`, `removeDocument`, `toggleSpritesVisibility`, `requestSpritePlacement`, `onOpenDocument`, `onCloseUniversalSearch`, `onClosePanel`, `onUniversalSearch`, `// BuildPanel Props     trackingData`, `onTrackingPinClick`, `onTrackingPinDelete`, `onTrackingPlacementToggle`, `trackingPlacementMode`, `trackingPinsVisible`, `onToggleTrackingPins`, `onTrackingPinRename`, `selectedPinId`, `onCameraCapture`, `onPinMoveRequest`, `// New Prop     BACKEND_URL`, `selectedElement`
- **Hooks:** `useEffect`×1, `useRef`×3
- **Renderiza:** `BuildPanel`, `CivilToolsPanel`, `DiscoverySearchPanel`, `DocsPanel`, `DocumentPanel`, `SourceFilesPanel`, `TandemFilterPanel`
- **Importa (local):** `./BuildPanel`, `./CivilToolsPanel`, `./DiscoverySearchPanel`, `./DocsPanel`, `./DocumentPanel`, `./SourceFilesPanel`, `./TandemFilterPanel`
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`
- **Eventos DOM:** ; escucha `mousemove`, `mouseup`
- **Funciones de módulo (línea):** `TandemSidebar`:12
- **Funciones internas del componente (línea):** `handleMouseDown`:121

### `components/TopBar.jsx` — 344 líneas

> SVGs for Tandem-like icons

- **Exporta:** default `TopBar`
- **Props:** `user`, `onLogout`, `activePanel`, `togglePanel`, `isViewsActive`, `onLogoClick`, `selectedProject`, `onUniversalSearch`
- **Estado local (`useState`):** 3 — `timer`, `isLongPress`, `isProjectToolsOpen`
- **Hooks:** `useEffect`×1, `useRef`×1, `useState`×3
- **Renderiza:** `BookmarkIcon`, `HeatmapIcon`, `PinIcon`, `SearchIcon`, `SignOutIcon`
- **Importa (local):** `../utils/hubLink`, `./TopBar.css`
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`
- **Eventos DOM:** emite `toggle-progressives`, `toggle-station-tracker`, `toggle-workfronts-panel`; escucha `mousedown`
- **Funciones de módulo (línea):** `LogoIcon`:6, `SelectionIcon`:13, `MeasureIcon`:19, `ChevronDown`:33, `SearchIcon`:39, `BookmarkIcon`:46, `PieChartIcon`:52, `BellIcon`:59, `HelpIcon`:66, `SignOutIcon`:74, `OrbitIcon`:83, `RulerIcon`:92, `SectionIcon`:99, `ToolboxIcon`:106, `PinIcon`:114, `HeatmapIcon`:118, `TopBar`:122
- **Funciones internas del componente (línea):** `handleStart`:149, `handleEnd`:158

### `components/Viewer.jsx` — 4669 líneas

> Utilidad para normalizar base64 vs base64url-safe y comparar URNs sin cruzarse

- **Exporta:** default `Viewer`
- **Props (35, firma en la línea 39):** `models`, `hiddenModelUrns`, `sprites`, `showSprites`, `activeSpriteId`, `onSpriteSelect`, `onSpriteDelete`, `placementMode`, `onPlacementComplete`, `onModelProperties`, `minimapActive`, `vrActive`, `onSheetsLoaded`, `activeSheet`, `docPins`, `docPlacementMode`, `onDocPlacementComplete`, `onDocPinSelect`, `onViewablesLoaded`, `activeViewableGuids`, `buildMode`, `buildPlacementMode`, `buildPins`, `showBuildPins`, `onBuildPinCreate`, `onBuildPinSelect`, `selectedPinId`, `accessToken`, `trackingTab`, `trackingData`, `trackingPinsVisible`, `trackingPlacementMode`, `onTrackingPinCreate`, `onTrackingPinClick`, `onSelectionChanged`, `aiModelCommand`, `hideToolbar`, `relocatingPin`
- **Estado local (`useState`):** 8 — `viewerReady`, `mobileToolsVisible`, `contextMenu`, `showProgressives`, `isStationTrackerOpen`, `stationTrackerMarkers`, `isWorkfrontsPanelOpen`, `workfronts`
- **Hooks:** `useCallback`×1, `useEffect`×44, `useRef`×27, `useState`×8
- **Renderiza:** `StationTracker`, `WorkfrontsPanel`
- **Importa (local):** `../aps/extensions/BaseExtension`, `../aps/extensions/IconMarkupExtension`, `../aps/extensions/LOB4DExtension`, `../aps/extensions/ProgressiveExtension`, `../aps/utils/DataVizEngine`, `../aps/utils/model`, `../utils/apiFetch`, `../utils/pivotUnderPointer`, `./IconMarkup.css`, `./StationTracker`, `./WorkfrontsPanel`, `./viewer.css`
- **Paquetes:** `react` · perezosos: `html2canvas`, `jspdf`
- **Lo importan:** `App.jsx`
- **Endpoints del backend:** `/api/token`
- **Llamadas de red:** `apiFetch`×1, `fetch`×1
- **Extensiones del visor:**  carga `IconMarkupExtension` registra `BaseExtension`, `IconMarkupExtension`, `LOB4DExtension`, `ProgressiveExtension`
- **API de Autodesk usada:** `Autodesk.Viewing.AGGREGATE_SELECTION_CHANGED_EVENT`, `Autodesk.Viewing.Document.load`, `Autodesk.Viewing.Extensions.VR`, `Autodesk.Viewing.GEOMETRY_LOADED_EVENT`, `Autodesk.Viewing.GuiViewer3D`, `Autodesk.Viewing.ISOLATE_EVENT`, `Autodesk.Viewing.Initializer`, `Autodesk.Viewing.MarkupsCore`, `Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT`, `Autodesk.Viewing.Private`, `Autodesk.Viewing.Private.THREE`, `Autodesk.Viewing.SELECTION_CHANGED_EVENT` …
- **Eventos DOM:** emite `filters-calculated`, `inventory-highlight-row`, `inventory-isolation-sync`, `inventory-selection-sync`, `rosetta-ready`, `theme-property-bucket`, `viewer-colors-applied`, `viewer-geometry-loaded`, `viewer-open-doc-panel`, `viewer-show-all`, `viewer-state-captured`, `viewer-webgl-lost`, `viewer-webgl-restored`; escucha `budget-tandem-highlight`, `click`, `filters-apply`, `filters-reset-all`, `isolate-property-bucket`, `keydown`, `mouseup`, `recalculate-filters`, `theme-property-bucket`, `toggle-progressives`, `toggle-station-tracker`, `toggle-workfronts-panel`, `viewer-request-state`, `viewer-restore-state`, `viewer-select`
- **Variables de entorno:** `VITE_BACKEND_URL`
- **Funciones de módulo (línea):** `normalizeUrn`:18, `getDocTexture`:24
- **Funciones internas del componente (línea):** `handleModelLoaded`:986, `getOptimalPinSize`:1928, `loadModelInner`:1947, `loadModelSequentially`:2215, `handleCreateSpriteFromMenu`:3903, `handleTakeScreenshot`:3913, `handleExportPDF`:3981

### `components/ViewerLabelsBar.jsx` — 1389 líneas · **PROTEGIDO — no modificar**

> "0+125.50" o "125.5" → metros

- **Exporta:** default `ViewerLabelsBar`
- **Props:** `rightSlot`
- **Estado local (`useState`):** 24 — `profileOn`, `zonesOn`, `groupOn`, `groupCount`, `excavOn`, `ghostSecOn`, `ghostMode`, `ghostBodies`, `ghostHidden`, `toast`, `hoverOn`, `hoverData`, `predictDet`, `fijado`, `congelado`, `verTodas`, `etapa`, `execCfgOpen`, `execFields`, `heatOpen`, `heatConfig`, `heatAlign`, `heatAligns`, `layersOpen`
- **Hooks:** `useEffect`×13, `useMemo`×4, `useRef`×3, `useState`×24
- **Renderiza:** `EarthworksGhostIcon`, `ExcavationIcon`, `GroupPairIcon`, `HeatmapIcon`, `HoverInfoIcon`, `LayerRow`, `LayersIcon`, `ProfileIcon`, `ZoneTagIcon`
- **Importa (local):** `../lib/predictBim`, `./TandemIcons`
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`
- **Eventos DOM:** emite `ghost-earthworks`, `ghost-earthworks-body`, `lob-ghost-excavation`, `lob-group-labels`, `lob-pk-heatmap`, `lob-zone-hover`, `lob-zone-labels`, `viewer-toggle-profile`; escucha `ghost-earthworks-result`, `lob-clear`, `lob-ghost-excavation-result`, `lob-group-labels-result`, `lob-pk-heatmap`, `lob-zone-hover-data`, `lob-zone-hover-error`, `lob-zone-labels-result`, `pointerdown`, `viewer-profile-state`, `zona-rotulo-cerrar`, `zona-rotulo-click`
- **Funciones de módulo (línea):** `parsePk`:6, `fmtPk`:15
- **Funciones internas del componente (línea):** `toggleHover`:73, `congelar`:158, `soltar`:159, `salirPanel`:161, `applyExecField`:273, `pushHeatmap`:290, `openHeatPanel`:303, `toggleHeat`:310, `heatRanges`:316, `setRanges`:318, `toggleProfile`:436, `toggleZones`:441, `toggleGroup`:450, `toggleExcav`:456, `toggleGhostSec`:461, `switchGhostMode`:475, `toggleGhostBody`:486, `soloGhostBody`:497, `LayersIcon`:521, `GroupPairIcon`:529, `LayerRow`:536

### `components/ViewsPanel.jsx` — 231 líneas

> Simple Icons

- **Exporta:** default `ViewsPanel`
- **Props:** `onSaveView`, `onLoadView`, `onDeleteView`, `views`, `onClose`
- **Estado local (`useState`):** 6 — `borrando`, `enlaceDe`, `copiado`, `isCreating`, `newViewName`, `searchTerm`
- **Hooks:** `useState`×6
- **Renderiza:** `CheckIcon`, `SaveIcon`, `SearchIcon`, `ShareIcon`, `SortIcon`, `TrashIcon`
- **Importa (local):** `./ViewsPanel.css`
- **Paquetes:** `react`
- **Lo importan:** `App.jsx`
- **Funciones de módulo (línea):** `SearchIcon`:5, `SortIcon`:12, `MoreIcon`:19, `ShareIcon`:27, `SaveIcon`:35, `TrashIcon`:43, `CheckIcon`:50, `ViewsPanel`:56
- **Funciones internas del componente (línea):** `handleSave`:70, `urlDeVista`:77, `copiarAlPortapapeles`:80, `handleShare`:93

### `components/WorkfrontsPanel.jsx` — 201 líneas

- **Exporta:** default `WorkfrontsPanel`
- **Props:** `workfronts`, `setWorkfronts`, `onClose`, `isVisible`
- **Estado local (`useState`):** 2 — `position`, `isDragging`
- **Hooks:** `useEffect`×1, `useRef`×1, `useState`×2
- **Paquetes:** `react`
- **Lo importan:** `components/Viewer.jsx`
- **Eventos DOM:** ; escucha `mousemove`, `mouseup`
- **Funciones de módulo (línea):** `WorkfrontsPanel`:3
- **Funciones internas del componente (línea):** `handleMouseDown`:8, `handleMouseMove`:16, `handleMouseUp`:25, `addWorkfront`:45, `removeWorkfront`:55, `updateWorkfront`:59

### `components/budgetEngine.js` — 223 líneas

> budgetEngine.js – Motor de Cálculo BIM 5D (PostgreSQL Optimized) ================================================================ Extrae propiedades de medición usando la caché de PostgreSQL (window.postgresInventory) o hace fallback a la API nativa de APS si no está disponible.

- **Exporta (con nombre):** `calculateMetradoReal`, `extractModelMeasurements`
- **Lo importan:** `components/BudgetTree.jsx`
- **Funciones de módulo (línea):** `extractModelMeasurements`:34, `calculateMetradoReal`:147
- **Funciones internas del componente (línea):** `unidad`:154

### `components/ghostEarthworks.js` — 698 líneas

> ghostEarthworks.js — dibuja el holograma de movimiento de tierras (corte / relleno) que genera el backend desde las secciones persistidas de Civil 3D. El backend entrega POR CUERPO (una malla por lista de material de Civil) en METROS ABSOLUTOS. Aquí solo se convierte a unidades del visor — la conversión de verdad vive en LOB4DExtension.civilToViewerPoint (escala por unidades, globalOffset y transform del modelo, ya p

- **Exporta (con nombre):** `clearGhostEarthworks`, `drawGhostEarthworks`, `hasGhostEarthworks`, `setGhostBodyVisible`
- **Lo importan:** `App.jsx`
- **Funciones de módulo (línea):** `_shade`:28, `_getModel`:36, `_makeConverter`:41, `_ensureOverlay`:63, `_registerForCutplanes`:73, `_getActivePlanes`:98, `_planesHash`:110, `_clearCaps`:120, `_earClipJS`:129, `_hatchJS`:162, `_pointInLoop2`:196, `_sliceBody`:211, `_updateCaps`:262, `_scheduleCapRebuild`:399, `_attachCapListener`:407, `_detachCapListener`:426, `clearGhostEarthworks`:435, `setGhostBodyVisible`:456, `drawGhostEarthworks`:469, `hasGhostEarthworks`:695
- **Funciones internas del componente (línea):** `off`:59, `cross`:132, `inTri`:133, `loops`:163, `a`:167, `P`:213, `key`:232


## Otros

_1 módulos, 153 líneas._

### `probar-primitivas.jsx` — 153 líneas

> BANCO DE PRIMITIVAS · VIEW. El alias de React se anadio a los dos vite.config, pero un build verde en Docs no demuestra nada sobre el visor: son dos configuraciones, dos node_modules y dos grafos. Esta pagina lo comprueba EN el visor. Tambien comprueba que no hay dos copias de React -- el defecto que dejo el banco de UX-01 sin montar con «Invalid hook call».

- **Exporta (con nombre):** —
- **Estado local (`useState`):** 1 — `abierto`
- **Hooks:** `useId`×1, `useState`×1
- **Renderiza:** `Banco`, `Button`, `Field`, `Limite`, `Modal`, `Overlay`, `Panel`
- **Importa (local):** `../../design/ui/Button`, `../../design/ui/Field`, `../../design/ui/Modal`, `../../design/ui/Overlay`, `../../design/ui/Panel`, `./index.css`
- **Paquetes:** `react`, `react-dom/client`
- **Lo importan:** *(nadie — entrada, huérfano, o cargado por otra vía)*
- **Llamadas de red:** `fetch`×1
- **Funciones de módulo (línea):** `Banco`:20, `probarGuarda`:82
