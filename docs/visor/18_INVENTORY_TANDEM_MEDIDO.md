# Inventory de Tandem · análisis medido, función por función

23-oct-2026. Observado **en la cuenta del propietario**, en su Chrome, sobre la facility **HOSPITAL**
(117.895 elementos). Cada punto es lo que se hizo y lo que respondió Tandem.

Al terminar se dejó el Inventory como estaba (12 columnas, orden Name descendente, sin totales por grupo).

**No probado:**
- **Export:** descarga un fichero al PC del propietario.
- **Import:** abre el selector de archivos de Windows directamente; se canceló.
- Guardar una edición de celda.
- Seleccionar en el 3D para ver la tabla (los clics de la extensión no llegan al lienzo del visor).
- Arrastrar columnas.

**DRENAJE_URBANO:** su Inventory se queda en «Change the current filters to display data». La consola
muestra `TypeError … getLocationsMap` (un error de Tandem en esa facility), no un problema de uso.

## 1 · El panel

- Acoplado abajo del visor, **oscuro y semitransparente** (se ve el modelo detrás).
- Cabecera: «INVENTORY» · pestañas **General / Tickets** · ventana aparte · cerrar.
- Rejilla **SlickGrid** virtualizada: 117.895 filas sin tirones; cabecera y numeración de filas fijas.
- **Tickets** usa la misma rejilla para los tickets de mantenimiento (vacía en HOSPITAL).

## 2 · La barra

| Izquierda | Derecha |
|---|---|
| **Advanced filters** (embudo, con contador «(2)») · **Edit columns** · **Group rows** (con contador «(2)») | **Assets only** · **Follow selection** · menú **⋮**: Export, Import, **Show group totals**, **Show footer totals** |

## 3 · Advanced filters

- Filas de **campo · operador · valor**, cada una con ✕; **+ Add condition**; **Clear filters**.
- El selector de campo tiene **buscador** y muestra la **categoría bajo cada campo** («Elevation ·
  Common»).
- **Operadores según el tipo:**
  - texto: Empty, Not empty, = Equals, ≠ Not equal, Contains, Does not contain, Begins with, Ends with;
  - número: Empty, Not empty, =, ≠, < Less than, > Greater than.
- **Solo Y.** `Elevation > 20` → 18 filas; añadir `Name contiene «Techos»` → 2 filas. No hay O, ni
  «entre», ni fechas.
- Efecto inmediato: el pie se recalcula (Avg 28,26 → 49,59 → 80,87) y el embudo marca **«(n)»**.

## 4 · Group rows

- **Varios niveles** con **+ Add a group** (probado: Level › Category Name) · **Clear groups** · contador
  «(2)».
- Grupos **plegados** por defecto, con etiqueta **«Valor (N items)»**; los vacíos van a **«(empty)»**.
- También desde la cabecera: clic derecho → **Group by column / Clear Grouping**.

## 5 · Cabeceras

- Clic = **ordenar** ascendente o descendente con indicador; **una sola columna** (Mayús + clic no
  añade un segundo criterio).
- Columnas **redimensionables**.
- Clic derecho: **Hide column · Group by column · Clear Grouping**.

## 6 · Totales

- **Pie:** recuento en la primera columna y, en cada columna numérica, **un cálculo elegido según el
  dato**: *Elevation* → **Avg: 28.26**; *Volume (m³)* → **Sum: 6942.983**. No se encontró dónde
  cambiarlo (ni en el pie, ni en la cabecera, ni en «Edit columns»).
- **Show group totals:** una fila de totales **bajo cada grupo**, con recuento y los mismos cálculos
  («87831 · Avg 28.26 · Sum 1329.502»), visible aunque el grupo esté plegado.
- Todo respeta los filtros.

## 7 · Edit columns

- Ventana modal: **Available Columns (2.560)** a la izquierda, **Selected Columns (12)** a la derecha.
- Disponibles en secciones: **Standard (12) · Applied · Revit Element (1.262) · Revit Type (1.298)**.
  Separa las propiedades **del ejemplar** y **del tipo**.
- Cada propiedad muestra su **categoría debajo** y la **unidad en el nombre** («Lining Thickness (mm) ·
  Aislamiento interior»). Al buscar «Volum» salen **«Volume (m³) · Cotas»** y **«Volume (m³) ·
  Mecánica»** como columnas distintas.
- Elegidas: **ruta** («Standard › Common»), asa para ordenar, papelera. **Reset default** · Cancel ·
  Update.
- Al añadir una columna, **solo entonces carga sus datos** (indicador de carga).
- El identificador interno de la columna incluye la categoría: `[Common][Classification]`.

## 8 · Fila y 3D

- Clic en una fila: **se selecciona el elemento en 3D** (resaltado azul translúcido) y **la cámara vuela
  hasta él**; en la barra inferior aparece **Auto View**.
- La selección es **por celda** (marco en la celda pulsada).
- Doble clic: celdas **editables** según el campo (Classification lo es). Se canceló sin guardar.

## 9 · Assets only

Restringe a los **activos** de Tandem y cambia a sus columnas. En HOSPITAL no hay ninguno: estado vacío
con «Change the current filters to display data» y el botón **Change Filters**.

## 10 · Frente al nuestro (doc 16)

| Función | Tandem | ALEPHIA hoy |
|---|---|---|
| Columna = categoría + propiedad, unidad en el nombre | ✔ | ✗ (71 valores pisados, 711 columnas con duplicados) |
| Columnas por secciones, ejemplar / tipo | ✔ | ✗ |
| Carga de la columna al añadirla | ✔ | trae todo de golpe |
| Filtros avanzados por tipo de dato, con contador | ✔ (solo Y) | ✗ (solo facetas en Filters) |
| Agrupar en varios niveles, «(empty)», plegado | ✔ | 1 nivel |
| Menú de cabecera: ocultar, agrupar | ✔ | ✗ |
| Ordenar por cabecera | ✔ (1 columna) | ✗ |
| Pie con cálculo según el dato (Sum / Avg) | ✔ | solo suma, elegida a mano |
| Totales por grupo | ✔ (opcional) | ✗ |
| Fila → 3D con vuelo de cámara | ✔ | ✔ vuela igual (medido 23-oct, ver §12); encuadraba tapado por el panel |
| Exportar / Importar | ✔ | exportar sí, importar no |
| Edición de celdas | ✔ por campo | 6 campos fijos + en bloque |

## 10 bis · El nuestro, revisado igual (producción, Frente Drenaje Urbano, 8.378 elementos)

Observado en `visor.alephia.com.pe` con la sesión del propietario y confirmado en el código publicado
(`InventoryDataGrid.jsx`).

| Lo que se ve o se pulsa | Qué pasa |
|---|---|
| Línea de estado | «8378 coincidencias globales · 8378 filas locales · **Aplicación visual pausada: external-tool**», y otro rótulo técnico en la esquina del visor. Son textos internos a la vista del usuario. |
| Primera columna | **EXT ID** (el identificador interno largo), no el nombre |
| Columnas | **duplicadas**: «Cotas::Área» y «Área», «Cotas::Volumen» y «Volumen»; unidades como texto («4.112 m^2») |
| Al abrir | **agrupado solo** por «000_TIPO TE» (la SubZona de PQT8) |
| **Embudo** | **no hace nada**: el botón no tiene acción (`<ToolBtn icon={<Icons.Filter />} />`). Los filtros viven en el panel Filters (facetas). |
| Columnas | ventana «Editar columnas» (711 columnas, todo marcado; «Quitar todas» solo en local) |
| Agrupar | menú «Agrupar por»: Sin agrupar · la SubZona marcada AUTO · lista de propiedades. **Un nivel.** |
| **Pestaña Tickets** | **no hace nada**: solo cambia el subrayado; el contenido es el mismo |
| Cabeceras | **sin ordenar, sin ensanchar, sin menú**; solo la casilla de seleccionar todo |
| Clic en fila | selecciona el elemento y la cámara **vuela** hasta él (`fitToView` → `setRequestTransitionWithUp`, ~490 ms: ver §12; lo de «salta» se dijo por el código, sin medir, y era falso); además marca la fila y abre la barra de edición en bloque («1 sel.», campo, valor, Aplicar) y «Sync (1)» |
| Doble clic | edita solo Material, Status, Costo, Notas, Proveedor, Fase |
| Totales | botón «Σ Totals»: elegir columnas a sumar a mano; **solo suma**; no hay totales por grupo |
| Exportar | Excel con los datos y una fila de totales |
| Ventana aparte | otra ventana oscura con una tabla simple (sin agrupar ni totales) |
| Assets only / Follow selection | existen, como en Tandem |
| Propio nuestro | edición en bloque y **campos propios** (Tandem no lo ofrece así) |

## 11 · Plan: primero igual a Tandem, luego nuestro

**Fase T · igualar a Tandem** (en local; Inventory es CLOSED: necesita la autorización del propietario):
1. Columna = categoría + propiedad (sin pisarse), unidad en el nombre; «Edit columns» por secciones,
   con ruta, buscador y «Reset default».
2. Filtros avanzados con operadores por tipo, «+ Add condition», «Clear filters» y contador.
3. Agrupar en varios niveles, con «(N items)», «(empty)», plegado y menú de cabecera.
4. Ordenar por cabecera.
5. Pie con el cálculo según el dato y «Show group totals».
6. Clic en fila → selección y vuelo de cámara.

**Fase N · hacerlo nuestro**, sobre esa base (docs 15 y 17): Y / O / NO, «entre» y fechas; elegir el
cálculo por columna; totales por unidad; tablas guardadas y congeladas; panel de detalle con el origen de
cada cifra; avisos; vista por asignación; la paleta clara de ALEPHIA.

## 12 · Fila → 3D, medido (23-oct-2026, banco, ventana a la vista)

**El vuelo ya existía.** Con la ventana tapada Chrome da 3 fotogramas en 2,5 s y LMV no puede animar:
de ahí venía la impresión de «salto». A la vista, 3 filas: 42–63 pasos de `setView` en 484–487 ms, la
misma llamada que Tandem (`setRequestTransitionWithUp`, ~500 ms).

**El defecto era el encuadre.** El lienzo va de 48 a 812 px y el panel de Inventory lo tapa desde 572:
se ve el 69 % de arriba. `fitToView` centra en el lienzo entero (y = 429), así que el elemento quedaba
pegado al panel o medio debajo; y en una barra de 0,5 m el zoom perdía el contexto.

**Cambio** (`lib/encuadreCamara.js`, puro, 16/16; `lib/irAElemento.js`; `Viewer.jsx` en `viewer-select`;
`data-tapa-visor` en el panel de `App.jsx`):
- encuadre en la zona que se ve: centro del elemento en el centro de esa zona, diámetro = 60 % de su
  lado corto; sin panel, el lienzo entero (como antes);
- nunca más cerca que una pieza de 1 m (contexto para estribos y pernos);
- pivote de órbita en el elemento: al girar después, se gira a su alrededor;
- misma dirección de vista, mismo viaje de LMV (~490 ms); 2D sigue con `fitToView`.

| Fila | Centro (y) | Caja (y) | Borde del panel | Viaje |
|---|---|---|---|---|
| Suelo [3279863] | 310 = centro libre | 211–408 | 572 | 457 ms · 53 pasos |
| Barra [3279943] | 310 | 234–385 | 572 | 490 ms · 60 pasos |
| Barra [3279948] | 310 | 241–379 | 572 | 488 ms · 41 pasos |
| Suelo [2717663], 14,7 m | — | 218–401 | 572 | — |
| sin panel | 430 = centro del lienzo | — | — | — |

Clics seguidos (2.º clic a 100 / 250 / 400 ms), clic durante la vuelta a Home, hilo ocupado (~4 fps) y
fotogramas congelados 600 ms: aterriza bien en todos, igual que `fitToView`.

**De paso, un defecto previo arreglado:** al pulsar filas de modelos distintos la selección se
acumulaba («3 sel. (3D)», «Sync (3)»): `setAggregateSelection` solo reemplazaba el modelo destino. Ahora
vacía los demás en la misma llamada (un solo evento). Medido: 1 → 2 antes, 1 → 1 → 1 después.

**No reproducido:** en dos medidas de la sesión la cámara acabó en la vista Home en vez de en el
elemento (3 de 7 en una tanda, todas con el clic poco después de pedir Home y la ventana sin fotogramas
durante 240 ms). Controlado no vuelve a salir (más de 40 intentos), tampoco con `fitToView`. No se ha
añadido nada a ciegas.

## 13 · Excel = lo que se ve (23-oct-2026)

Antes «Export Excel» sacaba lo que dejaba pasar Filters, sin los filtros de la tabla, sin «Solo con
metrado», sin el orden y con las sumas antiguas. Ahora lo prepara `lib/inventoryExport.js` (puro,
37/37, con vuelta completa por la librería de Excel) y la pantalla solo lo escribe:

- **Inventario:** las filas visibles en su orden (agrupadas: una columna por nivel delante), las columnas
  visibles; números como números con la unidad en la cabecera, fechas como fechas (medianoche local),
  códigos «001» como texto, una celda con otra unidad que la de su columna como texto; al final el
  cálculo de cada columna, el mismo del pie, sin ruido de coma flotante; autofiltro en la cabecera.
- **Totales por grupo** (si hay grupos): una fila por grupo y subgrupo con sus cálculos.
- **Criterios:** fecha, filas de cuántas, filtros de la tabla en texto, Solo con metrado, orden, grupos,
  columnas y cálculos (una línea por tipo).

Comprobado en el banco con el botón real: filtro «Name contiene muro basico» + Solo con metrado + orden
por volumen ↓ → 276 de 8.378 filas; el Excel trae 276, el orden, el filtro escrito y las sumas del pie
(1126,726 m² · 239,594 m³ · 1047,26 m).

**Queda:** con las 363 columnas que enseña hoy la tabla, exportar las 8.378 filas pesa 106 MB y tarda ~19 s
con la pantalla parada. No es el exportador: es la selección de columnas por defecto (Tandem enseña 12) y la
carga de todas de golpe; es el punto 5 pendiente.
