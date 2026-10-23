# Inventory profesional · investigación detallada y diseño

22-oct-2026. Fuentes **primarias** (la ayuda oficial de cada producto, leída página a página) cruzadas con el
análisis **medido** de nuestro Inventory (doc 16). Sin cambios de código.

Requisitos del propietario: genérico (cualquier obra y cualquier dato), sin IA, todo verificable hasta el
elemento, sin botones nuevos en el riel, primero en local.

**Límite de esta investigación:**
- No se vio funcionando ninguna de estas herramientas: no hay licencias, y la tabla de Tandem no cargó en la
  cuenta del propietario. Todo sale de su documentación oficial.
- La ayuda de Solibri (help center) devolvió 403; se usó su artículo oficial de aprendizaje.

## 1 · Qué hacen las herramientas profesionales (de su documentación)

### Revit · tablas de planificación
- **Campos** elegidos por el usuario; **valor calculado** (fórmula) como columna.
- **Filtro** por condiciones (solo Y; el O lleva años pedido en el foro de Autodesk).
- **Ordenar/agrupar** por varios campos (la ayuda muestra Familia y Tipo), con **cabecera y pie por
  grupo** y línea en blanco entre grupos.
- **«Detallar cada ejemplar»**: activado, una fila por elemento; desactivado, **una fila por combinación
  de valores agrupados** (resumen).
- **Totales:** se marca «calcular totales» por columna y se activan **totales generales** (título,
  recuento, totales).

### Solibri · Information Takeoff (ITO)
- Una **definición** con nombre, que es: filtro de componentes + columnas.
- **Filtro** por filas: estado *Incluir/Excluir* · tipo de componente · propiedad · operador (*uno de*,
  *está definido*…) · valor.
- **Tipos de columna:** identificación, clasificación, **cantidad**, ubicación (planta…), **relación**
  (componentes vinculados), recuento con nombre propio, y **color** (pinta el 3D por esa columna).
- **Agrupar por columna:** cada valor distinto es una fila; varias columnas agrupadas forman una sola
  clave. En las columnas **no agrupadas**, el texto se lista y las **cantidades se reducen con Suma,
  Máximo, Mínimo o Promedio**. Alternativa: «un componente por fila».
- **«Valor de»:** una columna puede traer una propiedad del **contenedor** (el área de la planta del
  elemento, su zona, su sistema).
- **Seleccionar filas aísla esos componentes en 3D.** «Takeoff All» frente a «Takeoff Selected» (solo lo
  seleccionado). Exportación a Excel igual a lo que se ve.

### Autodesk Takeoff (Forma)
- **Tipos de metrado** con **salida principal + salidas adicionales**. Cada salida tiene unidad
  (obligatoria), clasificaciones, coste opcional y **fórmula**.
- **Mapeo de propiedades del modelo (3D):** un mapeo por defecto según la regla de la salida, editable con
  fórmulas, operaciones, constantes y propiedades del modelo. **Si el objeto no tiene la propiedad o la
  fórmula no es válida, la cantidad no se calcula** (no se inventa).
- **Inventario** acumulado del paquete: agrupar por clasificación, documento, tipo o ubicación; panel de
  detalle a la derecha (cantidades, encuadre en el modelo, reasignar, edición en bloque).
- **Exportación** en Excel con **dos hojas: resumen (según la agrupación) y detalle**.
- **Snapshots:** el metrado congelado en un hito, comparable con el trabajo en curso.

### Navisworks · Quantification
- **Libro de trabajo + Catálogo de partidas + Catálogo de recursos.** «Los catálogos definen la estructura
  organizativa del proyecto.»
- **Mapeo de propiedades:** cada tipo de partida tiene una propiedad por defecto (lineal → Longitud,
  superficie → Área…). Se cambia **por partida o de forma global**, y la plantilla de mapeo **se comparte**
  entre proyectos.
- Metrado del modelo (automático), virtual (manual) y 2D.

### Rejillas de datos profesionales (AG Grid) y pautas de uso (Nielsen Norman Group)
- **Agregación por columna:** suma, mínimo, máximo, recuento, promedio, primero, último y funciones
  propias. **Fila de total por grupo y total general.** **Los totales respetan el filtro.**
- **Para usuarios expertos (NN/g):**
  - ocultar y reordenar columnas con poco esfuerzo, y **mostrar cuántas hay ocultas**;
  - **fijar la cabecera y la primera columna**, con un identificador legible y no un ID interno;
  - **ordenar por cualquier columna**, separado del filtrado;
  - **indicador visible de filtros activos** y sintaxis de filtro transparente;
  - **panel lateral no modal** para ver o editar un registro sin tapar la tabla;
  - acciones en bloque con casillas y barra.

## 2 · Comparación con nuestro Inventory (medido en el doc 16)

| Capacidad | Revit | Solibri | Takeoff | Navisworks | **ALEPHIA hoy** |
|---|---|---|---|---|---|
| Definición con nombre reutilizable | tabla en el modelo | definición ITO | tipo + paquete | catálogo | solo dentro de una vista guardada |
| Filtro incluir / excluir con operadores | Y, limitado | ✔ | por clasificación | — | facetas (sin NO, sin rangos) |
| Columna = propiedad **sin ambigüedad** | ✔ | ✔ | mapeo explícito | mapeo explícito | **✗: 71 elementos con valor pisado** |
| Fórmula / valor calculado | ✔ | — (no documentado) | ✔ | ✔ | ✗ |
| Agrupar por varias columnas | ✔ | ✔ | por un eje | por catálogo | 1 nivel |
| Reducción por columna (suma, máximo, mínimo, promedio) | suma | ✔ | por salida | ✔ | solo suma, sin unidad |
| Resumen frente a «uno por fila» | ✔ | ✔ | resumen + detalle | ✔ | solo uno por fila |
| Valor del contenedor (planta, zona) | — | ✔ | ubicación | — | ✗ |
| Fila o grupo → 3D | — | aislar | encuadrar | ✔ | fila sí, grupo no |
| Color por columna en 3D | — | ✔ | estilo del tipo | — | en Filters, no desde la tabla |
| No inventar si falta el dato | — | — | ✔ | — | ✗: suma lo que parezca número |
| Exportar resumen + detalle | ✔ | igual a la vista | ✔ (2 hojas) | ✔ | detalle + total |
| Hito congelado | — | — | snapshots | — | ✗ |
| Plantilla compartible entre obras | — | archivo .ito | importar tipos | plantilla NWD | ✗ |
| Fijar cabecera y primera columna, ordenar, ocultas visibles | — | — | — | — | parcial (sin ordenar) |

## 3 · Diseño: un Inventory profesional en cuatro capas

### Capa A · Datos que no mienten (requisito previo)

1. **Columna = Categoría › Propiedad.** Se acabó el aplanado por nombre. Las 382 propiedades reales salen
   una vez, y los 71 elementos con valor pisado muestran el suyo.
2. **Un solo camino de aplanado** (hoy hay dos: `App.jsx` e `InventoryDataGrid`).
3. **Tipo de cada columna detectado por reglas:** número con unidad (`0.900 m` → 0,9 m), fecha
   (`20261024`), sí/no, texto. Las unidades salen del propio valor.
4. **Salud por reglas visibles:** constante (39 % hoy), casi vacía, marcador («NA», «-»). Se esconden por
   defecto en los selectores, mostrando el motivo.

### Capa B · La definición de tabla (el núcleo, como ITO o un tipo de Takeoff)

Una **definición con nombre**, guardada por obra y exportable a fichero, con:

| Parte | Contenido |
|---|---|
| **Alcance** | filas de reglas **Incluir/Excluir** · propiedad · operador (es, no es, uno de, contiene, empieza, está definida, vacía, =, ≠, >, <, entre, antes, después) · valor. Grupos Y / O. Se puede partir del resultado de Filters. |
| **Unidad de fila** | por elemento · **por asignación** (grupos repetidos `X1…Xn`, detectados por regla) · **resumen** (como «detallar cada ejemplar» desactivado) |
| **Columnas** | propiedad · **valor calculado** (fórmula sencilla: + − × ÷ y constantes sobre columnas numéricas; si falta un dato, la celda queda vacía y avisada, nunca 0) · recuento · **valor del contenedor** cuando el dato exista |
| **Agrupación** | varias columnas, en orden; por grupo: cabecera, recuento y subtotales |
| **Reducción** por columna no agrupada | suma, mínimo, máximo, promedio, recuento, distintos; **separada por unidad** |
| **Totales** | por grupo y general; respetan el alcance |
| **Color** | una columna puede pintar el 3D (como la columna «Color» de ITO) |

Las definiciones son **dinámicas** (se recalculan con cada versión del modelo) y se pueden **congelar**
(snapshot) cuando son una entrega.

### Capa C · La pantalla (pautas de NN/g aplicadas)

- Cabecera y primera columna **fijas**; primera columna = **nombre legible**, no «EXT ID».
- **Ordenar** al hacer clic en la cabecera.
- **Indicador de filtros activos** encima de la tabla, con el alcance escrito como frase y un clic para
  quitar cada regla.
- **«N columnas ocultas»** visible; «Quitar todas / Seleccionar todas» (hecho en local).
- **Panel de detalle lateral, no modal**: el registro entero, **de qué propiedad sale cada cifra**, «Ver en
  3D».
- **Clic en fila o grupo → aislar o colorear en 3D**; selección en 3D → fila.
- Acciones en bloque con casillas (ya existen).

### Capa D · Salidas

- **Excel con dos hojas:** resumen (según la agrupación) y detalle (una fila por elemento o asignación, con
  el origen de cada dato).
- **Definición exportable/importable** para llevarla a otra obra (como el .ito de Solibri o los tipos
  importables de Takeoff).
- **Corte congelado** con versión del modelo y fecha.

## 4 · Fases y criterio de aceptación (siempre con los datos reales de PQT8)

| Fase | Qué | Se acepta si |
|---|---|---|
| **1** | Capa A, puntos 1–2 | los 71 elementos con choque muestran el valor de su categoría; «Editar columnas» ofrece 382/357 columnas en vez de 711; **las vistas guardadas existentes abren igual** (banco `restaurarVistaV2`, `savedViewV2`) |
| **2** | Capa A, puntos 3–4 | los totales de `Cotas › Volumen` se dan por unidad y cuadran con una suma independiente; las 149 constantes salen escondidas y con motivo |
| **3** | Capa C (ordenar, fijar, indicador, panel lateral, grupo → 3D) | prueba del propietario en local |
| **4** | Capa B sin fórmulas: alcance + agrupación multinivel + reducciones + resumen | una tabla de Revit de metrados del propietario reproducida con los mismos totales |
| **5** | Fórmulas, unidad «por asignación», color por columna | metrado por partida que cuadre con la columna VAL. N°11 del Excel de Costos, en las partidas modeladas |
| **6** | Capa D: Excel de dos hojas, exportar/importar definición, corte congelado | — |

Cada fase va en local, con su banco de pruebas, y sin publicar sin la orden del propietario. Inventory y
Filters CORE están **CLOSED**: cada fase necesita su autorización.

## 5 · Lo que no se hace

- Nada de IA (decisión del propietario, 22-oct).
- No se replica Tandem.
- No se toca el motor de facetas de Filters: su resultado entra como una regla más del alcance.

## Fuentes

- Autodesk Revit, *Examples of Sorting and Grouping in Schedules*: https://help.autodesk.com/cloudhelp/2015/ENU/Revit-DocumentPresent/files/GUID-C9407EBB-C78C-45DA-AB6D-D9F6B09274C5.htm
- Autodesk Revit, *Sort and Group Fields in a Schedule*: https://help.autodesk.com/view/RVT/2022/ENU/?guid=GUID-3ED9C7F0-C340-4317-BCE6-327638ED4A39
- Autodesk Revit, *Schedule Formatting*: https://help.autodesk.com/view/RVT/2022/ENU/?guid=GUID-D42C5877-6384-46D4-BEE3-195F3DCDECF1
- Autodesk Revit Ideas, *"OR" in filter rules*: https://forums.autodesk.com/t5/revit-ideas/quot-or-quot-in-filter-rules/idi-p/6322629
- Solibri, *Understanding Information Takeoff (ITO)*: https://www.solibri.com/learn/understanding-information-takeoff-ito
- Autodesk Takeoff, *Takeoff Types*: https://help.autodesk.com/cloudhelp/ENU/Takeoff-Takeoff/files/takeoff-types/Takeoff_Types.html
- Autodesk Takeoff, *Create Takeoff Types*: https://help.autodesk.com/cloudhelp/ENU/Takeoff-Takeoff/files/takeoff-types/Create_Takeoff_Types.html
- Autodesk Takeoff, *Takeoff on 3D models*: https://help.autodesk.com/cloudhelp/ENU/Takeoff-Takeoff/files/Takeoff_3D_Models.html
- Autodesk Takeoff, *Performing Quantity Takeoff*: https://help.autodesk.com/cloudhelp/ENU/Takeoff-Takeoff/files/Performing_Takeoff.html
- Autodesk Takeoff, *Takeoff Inventory*: https://help.autodesk.com/cloudhelp/ENU/Takeoff-Takeoff/files/Inventory.html
- Autodesk Navisworks, *Explore Quantification*: https://help.autodesk.com/cloudhelp/2019/ENU/Navisworks/files/GUID-56DD2D51-4C08-496E-BB9C-858BA22FD29C.htm
- Autodesk Navisworks, *About Takeoff Property Mapping*: https://help.autodesk.com/cloudhelp/2022/ENU/Navisworks/files/GUID-6AB91503-3E69-41C5-89CD-A7D8BEDE74B6.htm
- Autodesk Navisworks, *To Map Individual Takeoff Properties*: https://help.autodesk.com/cloudhelp/2019/ENU/Navisworks/files/GUID-E2030254-7FD0-4227-86AC-E8E386EB0B33.htm
- AG Grid, *Aggregation*: https://www.ag-grid.com/react-data-grid/aggregation/
- Nielsen Norman Group, *Data Tables: Four Major User Tasks*: https://www.nngroup.com/articles/data-tables/
