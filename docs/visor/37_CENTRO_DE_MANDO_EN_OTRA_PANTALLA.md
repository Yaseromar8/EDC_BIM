# 37 · Centro de datos de la obra en otra pantalla — INVESTIGACIÓN A FONDO

27-oct-2026 · Solo investigación, sin código. Pedido del dueño: «abrir en otra ventana» no debe ser una
lista sencilla, sino un **centro de datos donde se pueda gestionar todo**, en una segunda pantalla,
funcionando como la Planilla de abajo y creciendo después con gráficas y más. «Investiga a fondo, y
también Tandem».

---

## 1 · Qué tenemos hoy

| Pieza | Dónde | Estado |
|---|---|---|
| Ventana aparte «Planilla» | `lib/inventoryFilterPopout.js` (161 líneas, del trabajo de Filters, **CLOSED**) | Página `about:blank` con una tabla de solo lectura dibujada a mano: la lista que filtra Filters. Sin Partidas, buscador, Sumar, «medir con…» ni criterios. |
| Planilla completa | `InventoryDataGrid` + `TablaDePartidas`, abajo del visor | Elementos y Partidas, plantilla del itemizado, criterios de medida, cobertura, «qué falta». |
| **Tablero de análisis** | `components/dashboard/*` (en `main`) | Lienzo de tarjetas con Chart.js (barra, dona, línea, área, dispersión, tabla, KPI, completitud de parámetros), clic → aislar en 3D, colores al 3D y a Revit, guardado por obra (`/api/dashboards`). **Construido, sin probar con datos reales.** |
| Filters, Vistas guardadas, Avance, BIM 5D, 4D | rail del visor | Cada uno en su panel del visor. |

La ventana aparte de hoy no es un error: se hizo para un encargo pequeño de Filters. Pero no sirve para lo
que pide el dueño.

## 2 · Qué hacen los demás

### 2.1 · Autodesk Tandem (referente directo)

| Función | Qué hace | Fuente |
|---|---|---|
| **Detach the Inventory panel** | El inventario pasa a **otra ventana** con «the same functionality» que el panel acoplado; el visor en la otra. | Autodesk Learn |
| **Dashboards** | Barra de filtros arriba (fuentes, niveles, categorías Revit); el visor **refleja siempre** la selección; tarjetas y tablas abajo; tarta, dona y starburst; *drill-down* por clasificación o tipo. | AEC Magazine |
| Disposiciones y plantillas | Dos estilos: **con 3D** (contexto) o **solo datos**; plantillas de completitud de datos, monitoreo de activos o en blanco; biblioteca de tarjetas reutilizables. | Tandem, Dashboards beta |
| Completitud de datos | Tarjetas de «% con nombre», «estado de etiquetado», «número de modelo»; al filtrar (p. ej. calentadores) se recalcula. | intandem.autodesk.com |
| Operación | Tarjetas de **series de tiempo y medidores** de sensores (Streams), resumen de umbrales superados; a futuro, selector global de fechas. | Tandem, Dashboards beta |
| Inventario y vistas | Tabla con importación masiva, edición, búsqueda y filtro; **las vistas guardadas capturan filtros, columnas del inventario y ajustes del visor**. | Autodesk Tandem, product details |

No encontré documentación de Tandem sobre cómo sincroniza la selección entre las dos ventanas, ni sobre
si recuerda la pantalla.

### 2.2 · Bentley iTwin (AppUI) — el mismo problema, resuelto en su marco

| Regla | Cita |
|---|---|
| Los paneles («widgets») que se pueden separar llevan `canPopout`; un botón en su título los saca a una ventana propia y **al cerrarla vuelven al panel**. | iTwin.js, Widgets |
| La ventana hija **comparte el mismo contexto de JavaScript** que la aplicación: mismo estado, mismos datos. | «A child browser window shares the same javascript context…» |
| Al abrir, se **copian los estilos** de la ventana principal. | Child Window Manager |
| Los componentes **no deben escuchar en el `window`/`document` global** (apuntan a la principal); deben usar `ownerDocument` y `ownerDocument.defaultView`. | Child Window Manager |
| Se recuerda tamaño y posición de cada panel separado. | Child Window Manager |
| Al recargar, el navegador no deja reabrir ventanas solas: vuelven como paneles flotantes. Chrome abre la ventana **en la misma pantalla** que la principal. | iTwin.js, Widgets |

### 2.3 · Vyssuals (tablero ↔ Revit, en lo que se inspiró nuestro Tablero)

- Tablero web conectado a Revit por un complemento: **colorea el modelo desde los gráficos**,
  **selecciona en Revit desde un gráfico**, y se actualiza en vivo cuando cambia el modelo.
- **Rule Charts**: gráficos de reglas para **validar** los datos del modelo.

### 2.4 · Otros

| Producto | Lo pertinente |
|---|---|
| ACC Insights (Forma) | Tableros ya armados por área (inicio, riesgo, diseño, calidad), compartibles por equipo; datos extraídos a intervalos para **Power BI**. |
| Procore Analytics | Más de 100 informes y tableros sobre todos los módulos; análisis histórico. |
| Navisworks Quantification | Libro de cómputo con catálogos de **ítems y recursos**; al revisar el modelo **marca los cambios** en cada cómputo. Exporta a Excel/XML. |
| Revizto | Gestor de incidencias en el navegador (comentarios, adjuntos, edición), aparte de la app de escritorio. |

**Lectura conjunta:** los referentes separan (a) un **panel de datos desacoplable con todas sus
funciones** y (b) un **tablero de tarjetas** conectado al 3D. Nadie lo deja como lista de solo lectura.

## 3 · Cómo se construye bien (técnica)

### 3.1 · Mismo programa en la otra ventana, no una copia

Como iTwin: la ventana nueva **comparte el contexto de JavaScript** (React la dibuja con un *portal*).
Mismos datos (no se descarga el inventario dos veces), mismo estado (selección, filtros, criterios), y
cada mejora sale en los dos sitios. Una página aparte comunicada por mensajes (`BroadcastChannel`) sirve
para avisos simples entre pestañas, pero duplicaría los datos y la lógica; se descarta para esto.

### 3.2 · Un «escritorio de paneles» (docking)

Para que sea un centro de datos y no una ventana fija, lo profesional es un **gestor de paneles**: el
usuario coloca, agrupa y separa paneles (Planilla, Partidas, Tablero, Detalle de la partida, Criterios,
Qué falta, Vistas…) y **saca un grupo de paneles a otra ventana**.

**dockview** (React, sin dependencias) ya trae justo esto:
- `addPopoutGroup` abre un grupo en una ventana nativa, **que sigue siendo parte del mismo diseño**;
- necesita una página en blanco del mismo sitio (`/popout.html`);
- **copia el CSS** a la ventana; los menús y superposiciones se dibujan en el `document` de esa ventana;
- avisa si el navegador la bloquea (`'blocked'`) y al cerrarla **devuelve los paneles** a la principal;
- eventos de tamaño y posición para recordarlos.

Alternativa: hacerlo a mano con portales (más control, más trabajo y más riesgo).

### 3.3 · Abrir en la segunda pantalla

**Window Management API** (Chrome): `getScreenDetails()` pide permiso una vez y devuelve las pantallas;
la ventana se abre con la posición y el tamaño de la otra. Sin ella, Chrome la abre en la misma pantalla.

### 3.4 · Lo que hay que cuidar (medido en otros, a comprobar aquí)

| Riesgo | Por qué | Qué hacer |
|---|---|---|
| Escuchas en `window`/`document` globales | apuntan a la principal (regla de iTwin) | revisar la Planilla: `ResizeObserver`, teclado y eventos deben usar el `document` donde está el panel |
| Estilos que se cargan tarde | no se copian solos | copiarlos al abrir y vigilar los nuevos |
| Ventanas bloqueadas | el navegador exige un clic | abrir siempre desde un botón; avisar si se bloquea |
| Recargar la página | las ventanas no se reabren solas | recordar el diseño y ofrecer «reabrir en la otra pantalla» |
| El visor 3D | un contexto WebGL no se puede mudar de ventana | el 3D se queda en la principal; un segundo visor en la otra pantalla sería otra instancia, con el doble de memoria (solo si se pide) |
| Rendimiento | dos ventanas pintando a la vez | la tabla ya dibuja solo lo visible; medir con Interferencias y Canal |

## 4 · Qué entraría en «gestionar todo»

| Panel | Ya existe | En el centro de datos |
|---|---|---|
| Planilla · Elementos | sí | igual que abajo |
| Planilla · Partidas (plantilla, criterios, qué falta) | sí | con más ancho; detalle de la partida al lado |
| Filters | sí | panel acoplable, junto a la Planilla |
| Vistas guardadas | sí | panel |
| Tablero de análisis (gráficas) | construido | tarjetas junto a la Planilla: metrado por capítulo, cobertura del itemizado, completitud de parámetros |
| Auditoría de metrados | por hacer | panel de controles (nativo vs a mano, duplicados, unidades) |
| Observaciones (ECD) | diseñadas | crear una observación desde una fila |
| Avance / 4D / BIM 5D | sí | más adelante, como paneles |

## 5 · Plan propuesto

| Fase | Qué | Referente |
|---|---|---|
| 0 | Prueba técnica: la Planilla actual dentro de un panel de dockview, separada a otra ventana; comprobar estilos, medidas, teclado, aislar en 3D y rendimiento con datos reales | iTwin, dockview |
| 1 | **Centro de datos v1**: botón «abrir centro de datos» → ventana en la segunda pantalla (Window Management API) con la Planilla completa; al cerrarla vuelve abajo | Tandem «Detach» |
| 2 | Paneles acoplables en esa ventana: Planilla, Detalle de la partida, Criterios, Qué falta, Filters, Vistas; el diseño se recuerda | iTwin / dockview |
| 3 | Tablero dentro del centro: tarjetas de la obra; clic en una tarjeta = aislar en 3D | Tandem Dashboards, Vyssuals |
| 4 | Plantillas de centro de datos (revisor, costos, planeamiento) | Tandem templates |

## 6 · Decisiones del dueño

1. **Reabrir** la ventana aparte (nació en Filters, CLOSED) como requisito nuevo: sí / no.
2. **Gestor de paneles** con dockview (recomendado) o ventana fija con la Planilla sola.
3. Empezar por la **fase 0** (prueba técnica, vista previa en su pestaña, sin publicar).

## 7 · Primera fase hecha en local (27-oct-2026)

El dueño: «por lo menos para esta primera fase necesito que en *new a window* pase lo que estamos usando
actualmente en Planilla» y «vamos, con cuidado y profesionalismo». Con eso queda **reabierta** la ventana aparte
como requisito nuevo (decisión 1 de §6). Sin dockview todavía: es la base de la fase 2.

### 7.1 · Cómo funciona

- La Planilla se dibuja siempre en **una caja propia**. Abajo, la caja vive en una ranura del panel; al pulsar
  «Abrir en otra ventana», **la misma caja se muda** a una ventana nueva. React no la vuelve a montar: conserva la
  vista (Elementos/Partidas), la búsqueda, los filtros de la tabla, lo agrupado y lo desplegado.
- Sigue siendo el mismo programa: lo que la Planilla manda al 3D (aislar, seleccionar, «seguir el 3D») llega al
  visor como siempre, y el 3D gana el espacio del panel de abajo mientras la Planilla está fuera.
- La ventana nueva copia las hojas de estilo de la principal (y las que se carguen después) y recuerda su tamaño y
  sitio para la próxima vez.
- Vuelve abajo, con todo lo que tenía, al pulsar **«Volver al visor»** o al cerrar la ventana con su X. Si se cierra
  la Planilla desde el visor, o se recarga el visor, la ventana se cierra con ella: no queda una ventana vacía.
- Si el navegador bloquea la ventana, avisa y la Planilla se queda abajo.
- Lo que depende de la pantalla pregunta a la ventana donde está la Planilla: posición de menús (Agrupar, cabecera,
  cálculo del pie, selector de campo), el diálogo «Columnas», el portapapeles, los avisos y la medida del alto que
  decide cuántas filas se dibujan.
- **Exportar Excel** se descarga desde la ventana donde está la Planilla. Antes lo bajaba un enlace de la ventana
  principal (`XLSX.writeFile`). Desde la ventana aparte ese enlace no lleva el clic del usuario y Chrome no bajaba el
  libro: lo destapó la segunda batería de pruebas.
- La espera de 250 ms de la búsqueda corre con el reloj de la ventana donde se escribe: si la principal queda
  minimizada o tapada, Chrome frena sus temporizadores (hallado en el repaso final, antes de publicar).

### 7.2 · Ficheros

| Fichero | Qué |
|---|---|
| `frontend-react/src/lib/ventanaAparte.js` (nuevo) | Abre la ventana, copia estilos, recuerda medidas, avisa una sola vez al cerrarse |
| `frontend-react/src/components/PanelAparte.jsx` (nuevo) | `usePanelAparte`, `RanuraDelPanel`, `EnElPanel` y `useVentanaDelPanel`; sirve para cualquier panel, no solo la Planilla |
| `frontend-react/src/App.jsx` | La Planilla en su caja; el panel de abajo se oculta mientras está fuera |
| `frontend-react/src/components/InventoryDataGrid.jsx` | Botón «Abrir en otra ventana» / «Volver al visor»; menús, portapapeles, aviso y medida con la ventana actual |
| `TablaDePartidas.jsx`, `SelectorDeCampo.jsx`, `ColumnConfiguratorModal.jsx` | Medida, posición y diálogo con la ventana actual |

`lib/inventoryFilterPopout.js` (la lista de solo lectura de Filters) **no se tocó**: solo la usa ya quien monta la
Planilla sin quien la saque (el banco `probar-panel`).

### 7.3 · Verificación

- **Banco con Chrome sin ventana (CDP, clics reales), Planilla REAL con 600 filas de prueba: 27/27.**
  - Sale, el panel de abajo desaparece y la ventana abre con su título.
  - Conserva la búsqueda (150 filas) y los estilos.
  - Al agrandar la ventana se dibujan más filas (26 → 43).
  - Un clic en una fila llega al visor de la ventana principal.
  - El menú Agrupar queda dentro de la ventana y «Columnas» se abre en ella, no en la principal.
  - Cambia a Partidas.
  - Buscar escribiendo dentro de la ventana aparte filtra (150).
  - «Volver al visor» la devuelve abajo con la búsqueda y se vuelve a medir (19 filas en 320 px).
  - Recuerda el tamaño; se reabre.
  - La X la devuelve; cerrar la Planilla desde el visor cierra la ventana; recargar el visor la cierra.
  - Sin errores en consola.
- **Segunda batería, todas las funciones dentro de la ventana aparte: 25/25.** Planilla REAL con partidas, itemizado
  y criterios (red simulada); cada gesto comparado con el mismo gesto abajo.
  - Exportar Excel baja `Inventario_….xlsx` hasta «completed», igual que abajo. Antes del arreglo: FALLABA.
  - Sumas, filtros de la tabla (y Escape), menú de columna con clic derecho: se abren dentro de la ventana aparte.
  - «Seguir el 3D»: un clic en el 3D lleva la ventana aparte hasta su fila.
  - Casilla → «Editar (1)» → edición masiva, y se escribe en ella.
  - Partidas con la plantilla del itemizado; «Cargar otra versión…» abre el selector de archivos en la ventana aparte.
  - Clic en una partida la aísla en el 3D.
  - «medir con…» se abre, propone «Long. reja», «Guardar criterio» lo guarda en el servidor y REJA queda en
    250 m ·crit.
  - Al volver abajo sigue en Partidas, con el criterio.
  - Sin errores en consola.
  - Los fallos intermedios fueron de la prueba, no de la Planilla: un selector con el mismo nombre que el botón, una
    casilla tapada por la cabecera fija, y un menú abierto que se tragaba el clic. Este último pasa igual abajo.
- **Con la sesión del dueño** (banco `localhost:5181` → backend de producción), Frente Drenaje Urbano, 8.378 filas:
  - fuera con la búsqueda «buzon» intacta (338) y 24 hojas de estilo copiadas;
  - un clic en una fila de la ventana aparte selecciona en el 3D de la principal (0 → 1).
- **Ventana bloqueada:** el navegador integrado del escritorio bloquea las emergentes; avisa y la Planilla se queda
  abajo con su búsqueda.
- **Bancos de la Planilla:** criteriosDeMedida 77/77, planillaPlantilla 20/20, planillaPartidas 44/44.
- **Construcción:** `vite build` sin errores.
- **Corrección:** en la primera batería parecía que Escape no cerraba «Columnas». Era la prueba: en Chrome sin
  ventana las teclas de CDP no llegan. Con la tecla lanzada dentro del diálogo, Escape lo cierra.
- **Falta:** la prueba del dueño con su sesión y sus datos en `http://localhost:5181` (banco del visor, §9.6 del doc
  03), en su Chrome con dos pantallas. Sin commit ni publicación hasta su visto bueno.

### 7.4 · Lo que queda para las siguientes fases

- Abrirla directamente en la segunda pantalla (Window Management API; Chrome pide permiso una vez). Hoy recuerda
  dónde la dejaste dentro de lo que Chrome permite sin ese permiso.
- Paneles acoplables (dockview) y el Tablero dentro de la ventana (fases 2 y 3).

## Fuentes

- Autodesk Learn, «Detach the Inventory panel»: https://app.learn-one.autodesk.com/learn/ondemand/tutorial/detach-the-inventory-panel
- AEC Magazine, «Autodesk Tandem: dashboards»: https://aecmag.com/digital-twin/autodesk-tandem-dashboards
- Tandem, «Introducing Tandem’s new Dashboard Beta»: https://intandem.autodesk.com/resource/introducing-tandems-new-dashboards-beta/
- Tandem, «New Data Dashboards for digital twin building»: https://intandem.autodesk.com/resource/new-data-dashboards-for-digital-twin-building-inside-autodesk-tandem/
- Autodesk Tandem, product details: https://www.autodesk.com/products/tandem/product-details
- iTwin.js, Widgets: https://www.itwinjs.org/v3/learning/ui/appui-react/widgets/
- iTwin.js, Child Window Manager: https://www.itwinjs.org/v3/learning/ui/appui-react/childwindows/
- iTwin.js, appui-react changelog: https://www.itwinjs.org/reference/appui-react/changelog/
- dockview, Popout Windows: https://dockview.dev/docs/core/groups/popoutGroups/
- dockview, Introduction: https://dockview.dev/docs/overview/introduction/
- Scott Logic, «Popout windows in React»: https://blog.scottlogic.com/2019/10/29/popout-windows-in-react.html
- react-new-window: https://github.com/Hinaser/react-new-window
- Chrome, Window Management API: https://developer.chrome.com/articles/window-management
- Chrome, BroadcastChannel: https://developer.chrome.com/blog/broadcastchannel
- Vyssuals: https://vyssuals.com/ · Rule Charts: https://vyssuals.com/blog/rule-chart-model-validation-guide
- ACC Insights (Autodesk University): https://www.autodesk.com/autodesk-university/es/class/Making-Informed-Decisions-with-Autodesk-Construction-Cloud-and-Autodesk-Insight-2024
- Symetri, «ACC Insights and Power BI»: https://www.symetri.us/insights/blog/autodesk-construction-cloud-insights-and-power-bi/
- Procore Analytics: https://forconstructionpros.com/equipment/product/21111205/procore-technologies-inc-procore-advanced-analytics
- AUGI, «Navisworks Takes Off»: https://augi.com/articles/detail/navisworks-takes-off
- Revizto, Web Issue Tracker: https://revizto.com/en/web-issue-tracker-release/
