# Documentación Técnica Detallada: Arquitectura CDE y Gemelo Digital (Visor APS)

Este documento representa el mapa arquitectónico de bajo nivel y el inventario técnico de las características construidas en el Visor APS React. Sirve como registro "As-Built" del código fuente actual.

---

## 1. Patrón de Arquitectura Global
El sistema utiliza una arquitectura federada **Bifurcada (Client-Side Orchestration)**. 
- **LMV (Large Model Viewer):** Proporciona renderizado WebGL acelerado por hardware y un árbol de propiedades espaciales (Spatial Index).
- **PostgreSQL / Flask Backend:** Provee la "Fuerza de la Verdad" (Single Source of Truth) para la metada operativa.
- **Client (React Base):** El intermediario que reconcilia ambos mundos usando eventos asíncronos y Web Workers.

---

## 2. Descripción de Módulos (Corner to Corner)

### 2.1 Orquestador Multi-Modelo (`App.jsx`)
Es el componente Padre. Su trabajo es cargar las piezas y comunicar la vista 3D con la Interfaz de Gestión.
*   **Gestión de Estado (Hooks Clave):**
    *   `models`: Array de objetos modelo federados en la sesión.
    *   `filterSelections` y `filterProperties`: Estado maestro de configuración del Panel Tandem.
    *   `trackingTab` & `activeSpriteId`: Estados para el control HUD sobre el modelo (Avance, Fotos, RFI).
*   **Gestión de Autenticación (APS Auth):** Implementa el hook `useEffect` que verifica `window.location.search` por el token OAuth2 y hace fallback al Backend Flask para autorizar la sesión HTTP contra los servidores de Autodesk.
*   **Flujo CDE (Common Data Environment - Files Modal):** 
    *   Consolida la visualización de la estructura de carpetas (Hubs > Projects > Folders).
    *   El método `loadModel(urn, name)` no borra el canvas anterior, sino que hace un *LoadDocumentNode* concurrente al motor LMV, logrando Federación en Tiempo Real.
*   **Sistema de Sprites (Inspector Mode):** Activa el Data Viz `DataVizCore`. Captura el plano Normal `(XYZ)` sobre el *mesh* intersectado por el Raycast del mouse y "clava" un pin HTML (Sprite). Se conecta a `handleSubmitTracking` para subir ese contexto espacial a la base de datos `pins`.

### 2.2 Motor Gráfico y Manipulación 3D (`Viewer.jsx`)
No usa un Iframe plano. Inyecta y sobrescribe directamente el Core Viewer de Autodesk360 (`Autodesk.Viewing.GuiViewer3D`).
*   **Pipeline de Inicialización:**
    1.  Carga de librerías CSS/JS estáticas de Autodesk.
    2.  `Autodesk.Viewing.Initializer`: Valida el token contra los servidores de USA.
    3.  `viewer.loadDocumentNode`: Descarga los paquetes SVF/SVF2.
*   **Theming Engine (Aislamiento Visual Avanzado):**
    *   Contiene la lógica de **Gray Ghosting**. Cuando un filtro se aplica, la función `handleTheme` recibe un arreglo `validDbIds`.
    *   **Paso A:** `viewer.clearThemingColors(model)` limpia rastros viejos.
    *   **Paso B:** A cada ID válido se le pinta con un `THREE.Vector4(R, G, B, Opacidad)` asignado estáticamente.
    *   **Paso C:** A cada ID estático que NO está en la lista de aprobados se le inyecta un Ghost Vector `THREE.Vector4(0.8, 0.8, 0.8, 0.2)` en las dependencias geométricas (`setThemingColor`).
*   **Restauración Fotográfica (Memoria Activa):**
    *   **Problema resuelto:** Los visores WebGL reseteaban masivamente los elementos ocultos manualmente mediante `Hide Selected` tras aplicar un tema de color (Filtro).
    *   **Solución:** Uso de caché interno `window._lastHasActiveFilters` y lectura de `viewer.getAggregateHiddenNodes()`. Cada vez que el motor recalcula colores, primero guarda la caché local de nodos oscuros, aplica las matemáticas de filtro, y *restaura* forzosamente los nodos oscuros (`viewer.hide(IDs)`), asegurando estabilidad UX sin parpadeos.

### 2.3 Procesador "Rosetta" y WebWorker (`aps/utils/model.js`)
Librería Matemática (C++ WASM Proxy). Extrae y cruza información del *Property Database* (PDB) del visor sin colapsar el hilo de UI de React.
*   **`calculateDynamicFilterBucketsNative`:** Método principal de agregación. Lee millones de "Attributes" geométricos de Revit directamente del archivo SVF.
*   **Tandem Noise Reduction:**
    *   **Mecanismo:** El modelo de Revit exporta geometría invisible auxiliar ("Ruido"). Esta función extrae el `externalId` del LMV y cruza contra la memoria persistente de PostgreSQL inyectada en `window.rosettaValidExtIds`.
    *   **Resultado:** Frena el cómputo de `(Unassigned) 234732` fragmentos poligonales. Si PostgreSQL no reconoce el UUID, lo ignora de la agrupación visual, filtrando solo "Assets con Información Relevante".
*   **Cross-Faceting (Cruce Matricial):** Construye los mapas de conteo `values: [{count: 10, dbIds: []}]` respetando selecciones entre cruces múltiples (Ej: *Zapatas* [OR] *Muros*, AND *Fase 1*).

### 2.4 Control Bi-Direccional e Inventario (`InventoryDataGrid.jsx`)
Mapea el esquema PostgreSQL y controla el Gemelo Digital desde la base de datos relacional.
*   **Data Virtualization:** No renderiza el DOM entero (causaría crash). Utiliza `visibleRows.map` y cálculos `scrollTop` interceptando eventos nativos para solo renderizar un *Overscan* predeterminado mientras "simula" el scroll (React Virtualized Pattern).
*   **Efecto Resonancia (Bi-Direccionalidad):** 
    *   Recepción (`handleRowClick`): El click despacha un Evento Custom de JS hacia `Viewer.jsx` disparando el Zoom/Isolate 3D.
    *   Despacho (`onSelectionChanged` en Viewer.jsx): Al cliquear el modelo 3D, emite un evento `highlight` que la tabla recibe, scrolleando en Y hasta el dato correspondiente.
*   **Live Editing (Paridad con Facility Templates):**
    *   Las celdas Native-Revit (Volumen, Categoría) son protegidas (`Read-Only`) bajo la arquitectura Master-Node validando la constante `EDITABLE_COLUMNS`.
    *   Las celdas de "Data facility" (Status, Material, Costos y Parámetros asombrosos extendidos) abren Inputs Reactivos sobre Doble Clic. En el "Blur/Enter", empujan un payload vía `PATCH /api/inventory` usando `Optimistic Updates` (Estado intermedio de pintado). La DB resuelve el jsonb en python (`server.py`).

### 2.5 HUD de Panel y Filtros CDE (`TandemFilterPanel.jsx`)
*   **Autoscanning API Schema:** En el montaje, consulta a `GET /api/inventory/schema` que le devuelve la estructura topológica de todos los parámetros embebidos (A nivel proyecto y sistema). 
*   **Dynamic Grouping:** Convierte identificadores planos y estáticos (`General::Categoría_Host`) en arboles renderizables en cascada (Agrupadores en React).

---

## 3. Topología del Backend Microservicios (`d:/VISOR_APS_TL/backend/routes/`)

*   `digital_twin.py`: Realiza el "Upsert" y la traducción JSONB de variables masivas extraídas de ACC al esquema SQL.
*   `tracking.py`: Recibe los reportes (ej. Checkbox de "Hormigonado Completado"). Modifica la tabla de control del cronograma.
*   `documents.py`: Resuelve integraciones pesadas de I/O. Transforma Documentos o Fotos subidas del HUD Frontend y las envía al Bucket Cloud.
*   `pins.py`: Traduce matrices trigonométricas vectoriales de THREE.js (`x,y,z`) y las inyecta en bases de Datos espaciales para la preservación Eterna del contexto BIM.

---

## 4. Próxima Frontera Tecnológica (Hoja de Ruta)
*   Integración Plena de Chatbot AI / NLP contextual contra el Bucket JSON.
*   Creación de "Nuevos Parámetros" desde la Web para el `InventoryDataGrid.jsx` (Añadir Columnas en el inventario que no existen nativamente en el modelo).
*   Sliders Dinámicos O(1) de Rangos Numéricos en el `TandemFilterPanel` (Ej. Aísla tuberías con diámetro entre 10cm y 15cm).
