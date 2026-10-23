# Inventory como cerebro de datos · investigación (segunda versión)

22-oct-2026. Sustituye a la primera versión de este fichero, que se centró en el «material» sin motivo.
Solo investigación y propuesta: no se ha tocado código.

## 0 · El pedido

Filtros muy avanzados que combinen muchas cosas para sacar **mi tabla**, que esa tabla **se guarde**, una
agrupación profesional, y poder **cruzar cualquier información**: que Inventory sea un cerebro de datos.

## 0 bis · Principio: genérico, para cualquier obra y cualquier dato

Requisito del propietario (22-oct): **no se diseña para una obra concreta**. El motor no sabe qué es una
«partida», una «valorización» ni un parámetro DSI. Solo conoce campos, tipos, grupos repetidos, consultas y
tablas. Lo propio de cada obra vive en **plantillas** (consultas y tablas guardadas) que se crean, se
comparten y se importan.

- **Descubrir los campos solo:** se leen todas las propiedades de cualquier origen (Revit, IFC, Civil 3D,
  campos propios de la web) y se **deduce el tipo**: número con unidad, fecha, texto, sí/no.
- **Detectar grupos repetidos solo:** parámetros con la misma base y un número al final (`X1…Xn`), o los
  conjuntos de cantidades de IFC (`Qto_…BaseQuantities`), se proponen como «vista por asignación». El
  usuario lo confirma o lo corrige; nada va escrito en el código.
- **Consultas, agrupación, pivote y tablas** trabajan sobre campos genéricos.
- PQT8 y su estándar DSI (§1) son **un caso de prueba**, no el diseño.

### Qué significa «aprendizaje»: sin IA

Decisión del propietario (22-oct): **nada de IA en esta herramienta**. Quien hace un metrado tiene que poder
corroborarlo, y la IA invita a pedir hasta lo mínimo sin entenderlo.

- Todo es **reglas visibles y deterministas**: la misma consulta sobre la misma versión del modelo da siempre
  el mismo resultado, y cada cifra se puede rastrear hasta sus elementos.
- **«Aprender» = recordar lo que el usuario confirma:** tipos corregidos, grupos repetidos aceptados,
  plantillas. Una obra nueva arranca con eso como sugerencia que se acepta o se descarta.
- La detección de tipos, grupos repetidos y salud de parámetros son **reglas fijas y explicadas** (por
  ejemplo: «constante porque el 100 % vale No»), no modelos estadísticos.

### Salud de los parámetros: cuáles sirven

Un elemento trae decenas de parámetros. El motor los perfila todos y clasifica cada uno:

| Estado | Regla | Ejemplo medido en PQT8 (Canal) |
|---|---|---|
| **Vacío** | sin valor en casi todos los elementos | `04_10_MetradoContractual` = 0,000 en los 14.861 |
| **Constante** | el mismo valor en todos | `04_22_Restriccion` = No en 14.861; `VAL_Concreto` = 0,000 en 6.094 |
| **Marcador** | valores de relleno: «NA», «-», «<Por categoría>», 0 | `02_04_DSI_Area` = «NA» |
| **Duplicado** | repite otro parámetro elemento por elemento | por medir |
| **Útil** | variado, con datos y del tipo esperado | `04_20_FinReal1` (fechas de corte), `04_24_Frente` (paños) |

- Se muestran el % de relleno, los valores distintos y un ejemplo.
- Los no útiles se **esconden por defecto** en los selectores de columnas y filtros (sin borrarlos).
- Sirve también de **control de calidad del modelo**: un parámetro que debería estar lleno y está vacío es un
  aviso para el modelador antes de valorizar.
- Referencia: el *Property Checker* de BEXEL y las reglas de Solibri hacen esta comprobación de forma
  manual. Aquí se hace sola sobre todos los parámetros.

### Cómo sería, en una pantalla

```
┌ Plantilla: [Metrado por partida y periodo ▾]  Vista: (•) por asignación ( ) por elemento   Versión modelo: v14 ┐
│ Consulta: [Fin entre 25-sep y 24-oct] Y [Frente es PAÑO 23 o PAÑO 45] Y NO [Estado es EXISTENTE]  ✎        │
│ Agrupar: Partida › Frente      Columnas: Unidad · Σ Cantidad · Nº elem.     [Pivote]  [Exportar] [Congelar] │
├ CAMPOS ──────────┬─ TABLA ──────────────────────────────────────────────┬─ DETALLE ───────────────────────┤
│ ● Fin (fecha)    │ ▾ 05.03.03.05  Concreto f'c 280   m³   412,6   87     │ 05.03.03.05 · PAÑO 23           │
│ ● Partida        │    ▸ PAÑO 23                       m³   201,3   41     │ 41 elementos · 201,3 m³         │
│ ● Cantidad (m³…) │    ▸ PAÑO 45                       m³   211,3   46     │ Muro M-12   4,8 m³  Volumen1    │
│ ● Frente         │ ▸ 05.03.03.06  Encofrado           m²  1.310,0  87     │ Muro M-13   5,1 m³  Volumen1    │
│ ○ Restricción    │ ▸ 05.03.03.07  Acero               kg  9.842,0 112     │ …                               │
│   constante (No) │                                                         │ [Ver en 3D]  [Copiar lista]     │
│ ○ MetradoContr.  │                                                         │                                 │
│   vacío          │                                                         │                                 │
├──────────────────┴─────────────────────────────────────────────────────────┴─────────────────────────────────┤
│ 3 partidas · 286 asignaciones · ⚠ 4 sin cantidad · ⚠ 1 fecha fuera de calendario                          │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Campos** (izquierda): todos los campos con su tipo y su salud; los útiles arriba (●) y los que no sirven
  plegados abajo (○), con el motivo. Se **arrastran** a la consulta, a las columnas o a la agrupación.
- **Consulta** (arriba): reglas Y / O / NO legibles como frase; se editan sin escribir código.
- **Tabla** (centro): grupos multinivel con subtotales, o pivote.
- **Detalle** (derecha): los elementos de la fila o grupo elegido, **de qué parámetro sale cada cifra**, y
  «Ver en 3D».
- **Pie**: recuentos y **avisos de calidad**, cada uno con clic para ver los elementos.
- **Versión del modelo** visible siempre; **Congelar** guarda el corte tal cual para una entrega.
- El 3D va sincronizado en los dos sentidos: elegir en la tabla aísla o colorea, y elegir en 3D marca la
  fila.

### Integral: todo lo investigado el 21 y 22-oct cabe en el mismo núcleo

Un solo núcleo de datos (campos con tipo y salud → vista por elemento o por asignación → consulta → tabla
guardada → corte congelado), y cada pedido es **un uso** de ese núcleo, no una herramienta aparte:

| Pedido investigado | Cómo queda resuelto en el núcleo | Documento |
|---|---|---|
| Tablas de Revit en la web, con clic → 3D | una **plantilla** que reproduce la tabla (campos, filtros, agrupación, totales); en el futuro, importar su definición con el plugin | este |
| Filtros súper avanzados que se guarden | **consulta** con nombre, Y / O / NO, rangos y fechas | este |
| Agrupación profesional | multinivel con subtotales, agregaciones y **pivote** | este |
| Saber qué parámetros sirven | **salud de parámetros** por reglas | este |
| Metrado por partida (5D) | plantilla «por asignación», agrupada por partida, con el **presupuesto** cruzado por código | 13 |
| Metrados por valorización para Costos | **pivote** partida × periodo + **corte congelado** + Excel con el formato RESUMEN (resumen y detalle) | 14 |
| Sustento ante la supervisión | panel de **detalle** (de qué parámetro sale cada cifra) + **Ver en 3D** | 14 |
| Adicionales y deductivos | **comparar** el corte congelado con la versión nueva del modelo | 14 |
| Calidad del modelo antes de valorizar | **avisos** del pie + salud de parámetros | este |
| Cualquier obra y cualquier dato | campos descubiertos solos, grupos repetidos detectados, **plantillas** exportables | este |

- **Filters** se queda como la vía rápida (facetas) y su resultado entra en la consulta como una regla más.
- El **5D** deja de ser un panel con su propio motor: pasa a ser la **plantilla de presupuesto** del núcleo,
  con el árbol de partidas como forma de mostrarla.
- Nada de IA. Todo rastreable.

### Investigación técnica: cómo lo resuelve Autodesk por debajo (APS)

Autodesk ya tiene dos motores de consulta de propiedades de modelos. Son la referencia técnica de cómo debe
ser el núcleo.

**1 · Model Properties API** (`construction/index/v2`, modelos en ACC/BIM 360 traducidos a SVF2)
- **Un índice por versión**, creado a demanda: manifiesto, lista de **campos** y propiedades de cada objeto.
- **Campos con clave, categoría, nombre, tipo y unidad.** Es justo la «capa de campos con tipo» propuesta
  aquí.
- **Consulta en JSON** con `$and` / `$or` anidados; `$eq`, `$ne`, `$gt`, `$lt`, `$between`, `$like`
  (comodines), `$isnull`, `$notnull`.
- **Columnas calculadas y agregados** en la misma consulta: `$add`, `$mul`, `$sum`, `$min`, `$max`, `$avg`,
  `$count`.
- **Diferencias entre dos versiones**: cada objeto sale como `OBJECT_ADDED`, `OBJECT_REMOVED` u
  `OBJECT_CHANGED`. Trae las propiedades **anteriores y actuales** (`s.prev.props` frente a `s.props`), y
  hashes de propiedades y de geometría. Se puede consultar, por ejemplo, «elementos cuyo volumen se duplicó».
- Limitación: trabaja sobre ficheros de ACC/BIM 360. Una subida directa a nuestro almacenamiento (OSS)
  quedaría fuera.

**2 · AEC Data Model API** (GraphQL)
- Filtros sobre elementos por propiedad, con Y/O, «contiene», «empieza por» y «termina en».
- **Valores distintos de una propiedad** en una consulta (oct-2024): es lo que hace falta para las facetas y
  para la salud de parámetros.
- Versiones por número. Límites: 50 elementos por página y hasta 500 propiedades. Los formatos soportados no
  quedan claros en lo leído (no confirmado para Civil 3D ni IFC).

**Qué se concluye**
- La gramática de consulta que propone este documento (Y / O / NO, rangos, comodines, columnas calculadas y
  agregados, comparación entre versiones) **es la misma que usa Autodesk**. No es una invención: conviene
  adoptar su forma JSON tal cual. Es documentada, conocida y compatible.
- Hay dos maneras de construirlo:
  - **A · Motor propio** con esa misma gramática, sobre nuestro inventario en Postgres. Funciona con
    cualquier origen (ACC, OSS, IFC, campos propios de la web) y no depende de Autodesk. **Recomendado.**
  - **B · Delegar en Model Properties API** solo donde aporta más, por ejemplo en las **diferencias entre
    versiones** (adicionales y deductivos), para modelos que estén en ACC.
- **Pendiente de medir, no supuesto:**
  - crear un índice y lanzar una consulta y una diferencia sobre un modelo real de PQT8 en ACC: tiempos,
    límites y coste;
  - comprobar qué formatos acepta el AEC Data Model.

## 1 · Caso de prueba: los datos de PQT8 ya forman un modelo de datos

La parametrización DSI de PQT8 (medida en el inventario de producción) no es una lista suelta de
parámetros: tiene **cuatro bloques** y un **número de asignación {n}** que los ata entre sí.

| Bloque | Parámetros (ejemplos medidos) | Qué describe |
|---|---|---|
| **01 · Identidad y lugar** | `01_03_Estado`, `01_11_Ubicacion`, `01_12_SubUbicacion`, `01_13_Zona`, `01_14_SubZona` | qué es y dónde está |
| **02 · Cantidades {n}** | `02_01_Unidad{n}`, `02_02_Longitud{n}`, `02_04_Area{n}`, `02_05_Volumen{n}`, `02_06_Peso{n}` | cuánto, por asignación |
| **03 · Partidas {n}** | `03_04_NombreDePartida{n}`, `03_05_CodigoDePartida{n}`, `03_06_Metrado{n}` | a qué partida va, por asignación |
| **04 · Planificación y ejecución** | `04_18_InicioReal{n}`, `04_20_FinReal{n}`, `04_23_Sector`, `04_24_Frente`, `04_25_EjecutadoActual`, `04_27_EjecutadoAcumulado`, `04_26_LiberacionCalidad`, `04_29_CodigoPlaneamiento{n}` | cuándo y en qué estado |

Un elemento puede tener **hasta 4 asignaciones**. Un muro, por ejemplo: {1} concreto en m³, {2} encofrado en
m², {3} acero en kg. Cada asignación tiene su partida, su unidad, su cantidad y sus fechas.

### El hallazgo

**Inventory muestra una fila por elemento**, con las 4 asignaciones repartidas en columnas sueltas
(`CodigoDePartida1`, `CodigoDePartida2`… `Volumen1`, `Volumen2`…). Con esa forma no se puede preguntar
«todo lo de la partida 05.03.03.05 terminado entre el 25-sep y el 24-oct», porque la partida, la cantidad y
la fecha de esa asignación están en columnas distintas según el {n}.

El cerebro de datos necesita una segunda forma de ver lo mismo: **una fila por asignación**
(elemento × {n}), con columnas alineadas: *Partida · Unidad · Cantidad · Inicio · Fin · Planeamiento*, más
los datos del elemento (lugar, frente, sector, estado). Con esa forma, cualquier filtro, agrupación o pivote
funciona solo.

Es lo mismo que hacen los profesionales:
- Revit, en la *Cuantificación de materiales*: una fila por material de cada elemento.
- Solibri ITO: puede mostrar «un componente por fila» o agrupado.
- Autodesk Takeoff: el inventario es por **objeto medido**, no por elemento.

## 2 · Cómo lo resuelven las herramientas profesionales

| Herramienta | Filtros | Agrupación y tabla | Guardado |
|---|---|---|---|
| **Revit · filtros de vista** | reglas anidadas **Y / O** (desde 2019) | — | en la plantilla de vista |
| **Revit · tablas** | solo **Y**, pocas reglas; el **O** se pide en el foro de Autodesk desde 2016 sin implementarse | hasta 4 niveles de orden/agrupación; «detallar cada ejemplar» o consolidar | en el modelo |
| **Navisworks · Search Sets** | condiciones con **Y / O / NO**; nombre visible o interno | — | con nombre, exportables a XML |
| **BEXEL Manager · Smart Selection Sets** | reglas que **incluyen o intersecan** por propiedad y valor, con condiciones numéricas | se combinan con desgloses propios (*Custom Breakdown*) | **se reordenan solos al actualizar el modelo**; plantillas en Excel (Carpeta, Nombre, Consulta) |
| **Solibri · ITO** | incluir/excluir por propiedad, operación y valor | agrupar o un componente por fila, totales, fórmulas | plantilla reutilizable en cada modelo |
| **Autodesk Takeoff** | por tipo y clasificación | agrupar por clasificación, documento, tipo o ubicación; resumen + detalle | snapshots congelados |
| **Power BI** (muy usado en Perú) | todo, sobre una tabla plana | pivote y tableros | informe guardado; tesis UPC 2024 (PRONIED): Dynamo → Power BI, metrados con 77 % menos tiempo |

Lecciones:
1. **La consulta es un objeto con nombre**, no lo que quedó marcado en la pantalla, y **se recalcula sola**
   con cada versión del modelo (BEXEL, Solibri, Navisworks).
2. **Se puede exportar e importar** como plantilla (Excel o XML) para llevarla a otra obra.
3. **Una fila por cosa medida**, no por elemento, cuando se mide (Takeoff, ITO, Cuantificación de
   materiales).
4. **Y / O / NO anidados.** Es lo que Revit no da en sus tablas, y la web sí puede darlo.
5. **El pivote es el informe.** Power BI lo demuestra: con una tabla plana bien hecha, el resumen sale solo.

## 3 · Lo que tenemos hoy

- **Filters** (CLOSED): facetas, con **O** dentro de una propiedad e **Y** entre propiedades. No tiene
  **NO**, rangos, «contiene» ni fechas.
- **Inventory** (CLOSED): una fila por elemento, un nivel de agrupación, suma, edición en bloque, campos
  propios y Excel. Se guarda dentro de las vistas guardadas.

## 4 · Propuesta

### 4.1 · Dos formas de ver el inventario

- **Por elemento** (como hoy).
- **Por asignación** (nueva): una fila por elemento × {n} con *Partida, Unidad, Cantidad, Inicio, Fin,
  Planeamiento* alineadas, más los datos del elemento. La regla que ata los parámetros con el {n} se declara
  una vez por obra (para PQT8, el estándar DSI).
- **Tipos reales:** números (sin el texto de la unidad) y fechas (`20261024` → 24-oct-2026).

### 4.2 · Consultas con nombre

- Reglas **Y / O / NO** anidadas. Operadores por tipo: texto (es, contiene, empieza, en lista, vacío),
  número (=, >, <, entre), fecha (antes, después, entre, periodo).
- Una consulta puede **usar otra** ya guardada.
- **Se recalculan solas** con cada versión del modelo.
- Las facetas de Filters siguen siendo la vía rápida.

### 4.3 · Tabla profesional

- Agrupación **multinivel** con subtotales.
- Agregación por columna: suma, promedio, mínimo, máximo, recuento y distintos.
- **Pivote**, por ejemplo filas = Partida, columnas = Fin por periodo, valores = Σ Cantidad.
- Clic en cualquier fila o grupo → se aísla o colorea en 3D.

### 4.4 · Tablas guardadas

Consulta + forma de ver + columnas + agrupación + pivote, con nombre, por obra y compartidas. Exportables e
importables como plantilla. **Dinámicas** por defecto; **congeladas** cuando son una entrega.

### 4.5 · Cruces (después)

Unir por código con el presupuesto, el calendario de cortes, los documentos y las observaciones de Docs.

## 5 · Escalabilidad

28.000 elementos son unas 40.000–60.000 asignaciones (hasta 4 por elemento). Eso sigue dentro de lo que se
calcula bien en el navegador (las rejillas profesionales manejan más de 100.000 filas en cliente). La
consulta es un objeto independiente, así que la **misma** definición podrá evaluarse en el servidor cuando
haga falta (varias obras, millones de filas, cortes congelados).

## 6 · Orden propuesto

1. **Vista por asignación + tipos reales.** Es la base: sin ella, lo demás se queda corto.
2. Consultas con nombre.
3. Agrupación multinivel y agregaciones; pivote al final.
4. Tablas guardadas (primero dentro de las vistas guardadas, sin migración).
5. Cruces.

Inventory y Filters CORE están **CLOSED**: hace falta la autorización expresa del propietario para reabrir
el panel. El motor de facetas no se modifica. Todo en local y sin publicar sin su orden.

## Fuentes

- APS, *Filtering Specific Elements Efficiently by Model Properties API*: https://aps.autodesk.com/blog/filtering-specific-elements-efficiently-model-properties-api
- APS, *Find model difference by Model Properties API*: https://aps.autodesk.com/zh-hans/node/2215
- APS, *Model Properties API vs Model Derivative API*: https://aps.autodesk.com/blog/model-properties-api-vs-model-derivative-api
- APS, *AEC Data Model API: distinct property values and filtering* (oct-2024): https://aps.autodesk.com/blog/aec-data-model-api-distinct-property-values-point-value-and-updates-filtering
- APS, *AEC Data Model · Standard filtering*: https://aps.autodesk.com/en/docs/aecdatamodel/v1/developers_guide/filtering/standard-filtering
- APS, tutorial del AEC Data Model: https://autodesk-platform-services.github.io/aps-aecdm-tutorial/explorer/home/

- BEXEL Manager, *Selection sets*: https://help.bexelmanager.com/support/help-center/bexel-manager/model-data-management/selection-sets/
- BEXEL Manager, *Smart Selection Sets* (vídeo): https://vimeo.com/861155327
- BEXEL Manager, manual: https://bexelmanager.com/wp-content/uploads/BEXEL_Manager-Manual.pdf
- Autodesk Revit, *Examples of Rule-Based Filters* (Y/O anidados): https://help.autodesk.com/cloudhelp/2023/ENU/Revit-DocumentPresent/files/GUID-B5B6E56F-B2F4-4344-9C72-9AD64B94A34D.htm
- Autodesk Revit Ideas, *"OR" in filter rules* (tablas): https://forums.autodesk.com/t5/revit-ideas/quot-or-quot-in-filter-rules/idi-p/6322629
- Novedge, agrupar tablas de Revit: https://novedge.com/blogs/design-news/revit-tip-group-revit-schedule-items-for-clearer-quantity-reporting
- Autodesk Navisworks, *Find Items Window*: https://help.autodesk.com/cloudhelp/2022/ENU/Navisworks/files/GUID-ED934808-665F-4C65-A937-3A23DD937428.htm
- Solibri, *Understanding Information Takeoff (ITO)*: https://www.solibri.com/learn/understanding-information-takeoff-ito
- Autodesk Takeoff, *Takeoff Inventory*: https://help.autodesk.com/cloudhelp/ENU/Takeoff-Takeoff/files/Inventory.html
- UPC (2024), Dynamo + Power BI para metrados (PRONIED): https://repositorioacademico.upc.edu.pe/handle/10757/684092
- ISPRS (2022), Dynamo + Power BI: https://isprs-archives.copernicus.org/articles/XLVIII-4-W4-2022/67/2022/
- AG Grid, *Row models*: https://www.ag-grid.com/react-data-grid/row-models.md
