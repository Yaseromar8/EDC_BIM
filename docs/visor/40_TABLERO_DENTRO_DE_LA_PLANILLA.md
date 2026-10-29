# 40 · Tablero: ¿botón propio o dentro de la Planilla? — INVESTIGACIÓN A FONDO

29-oct-2026. Solo análisis, sin código. El dueño: «investiga, qué me recomiendas, que eso tenga su botón o esté
dentro de Planilla, así como vimos antes; y qué repositorios e investigaciones podemos leer para hacerlo más
profesional». Luego: «investiga mejor y a profundidad». «Así como vimos antes» = el reparto de papeles entre Filters y
la Planilla (doc 27).

**Corrección sobre la primera versión de este documento.** La primera versión recomendaba cambiar el lienzo libre por
una rejilla. Al repasar la historia del Tablero (§2), resultó que **el lienzo tipo Miro fue un pedido explícito del
dueño**. Esa recomendación se retira: el lienzo se queda.

## 0 · Respuesta corta

- **El Tablero conserva su botón y su lienzo**, pero **comparte el mismo núcleo de datos que la Planilla**:
  - lee lo que Filters deja pasar;
  - conoce las partidas;
  - aísla de forma momentánea;
  - colorea a través de Filters.
- No va «dentro» de la Planilla como tercera pestaña. Un lienzo necesita ancho y la Planilla es una franja horizontal.
  Ninguno de los referentes mete los gráficos dentro de la tabla: los ponen en su propio espacio, pero **con los mismos
  datos y los mismos filtros** que el resto.
- Lo que hoy está mal no es el botón: es que **el Tablero mira otros datos y pinta por su cuenta** (§3).

## 1 · La pregunta de fondo

«¿Botón propio o dentro de la Planilla?» parece una pregunta de pantalla. En los productos serios la respuesta es casi
siempre la misma:
- los gráficos tienen **su propio espacio**: una página, un tablero, una tarjeta;
- pero **beben de la misma fuente y obedecen a los mismos filtros** que la tabla.

En la literatura esto se llama **vistas múltiples coordinadas** (Roberts, 2007). En Excel es la **tabla dinámica y su
gráfico dinámico**: dos caras de la misma caché; si filtras una, cambia la otra.

Así que la pregunta útil es otra: **¿el Tablero y la Planilla son dos caras de los mismos datos, o dos programas
distintos?** Hoy son dos programas distintos.

## 2 · Historia del Tablero (de las notas de julio y del código)

| Versión | Qué | Quién lo decidió |
|---|---|---|
| v1 (28-jul) | Gráficos en rejilla sobre el Inventory; motor puro con registro de fuentes **pensado para crecer** («futuro: metrados, avance, 5D») | Inspirado en Vyssuals, analizado en vivo |
| v2 | **Lienzo infinito tipo Miro** (mover, zoom, nodos libres) | **Pedido explícito del dueño** tras ver el lienzo de Vyssuals |
| v3 | Chart.js como único motor de gráficos | «Un solo sistema visual» |
| v4 | Diseño editorial: la **pregunta** que responde cada gráfico, chips de filtro rápido en la tarjeta, **línea de referencia** | El dueño enseñó un tablero de Plotly; se tomó el diseño sin meter Plotly |
| v5 | **Secciones** con título de color | El dueño enseñó su Miro «EB - Proveedores» y pidió solo los marcos |
| v5.1 / v5.2 | Panel dividido de verdad (el 3D se reacomoda) y tema claro | Pedido del dueño |

Desde julio quedaron pendientes:
- **probarlo con datos reales** (nunca se hizo);
- una plantilla de «Gestión de avance» con PREDICT;
- una fuente de metrados.

Solo lo abre un administrador.

**Lo que tiene de valioso y hay que conservar:**
- el lienzo y las secciones;
- la pregunta de cada gráfico y la línea de referencia;
- el nodo «Parámetros» con su **completitud** (el % de elementos que traen cada dato, como Vyssuals);
- el clic en una barra que aísla sus elementos;
- **el color que llega a Revit por el Live Link**.

## 3 · Qué hace hoy y dónde choca (leído en el código)

| | Tablero (`components/dashboard/`, 1.658 líneas) | Planilla | Regla del doc 27 |
|---|---|---|---|
| Qué datos lee | **Todo el inventario** (`window.postgresInventory`), sin mirar Filters | Lo que Filters deja pasar (`filterInventoryRows`) | Filters decide QUÉ se mira |
| Aislar | `viewer.isolate` directo: **se queda** | Momentáneo (`lib/aislamientoTemporal.js`) y devuelve lo de Filters | Lo de la Planilla es momentáneo |
| Colorear | `setThemingColor` directo | Abre Filters con el campo y lo colorea allí | **Un solo dueño del color: Filters** |
| Partidas | No las conoce: cuenta o suma un parámetro | Itemizado, medida nativa, criterios, cobertura | — |
| Campos derivados | Los ve, porque recorre todas las claves de la fila («Planilla › Capítulo» ya sale en su lista) | Los calcula | — |

Consecuencias concretas:
1. Con Filters activo, **un mismo número puede salir distinto** en el Tablero y en la Planilla.
2. «Pintar» del Tablero **pisa** el color de Filters sin avisar, y al revés.
3. Un gráfico de «metrado por partida» **no se puede hacer**: el Tablero no tiene cantidades con la medida nativa ni
   los criterios de la obra.

Comprobado: **el color de Filters también llega a Revit** (`filterVisualDriver` emite `viewer-colors-applied`, el mismo
aviso que escucha el Live Link). Pasar el color por Filters **no pierde** esa función.

## 4 · Qué hacen los referentes (a fondo)

| Producto | Dónde viven los gráficos | Datos y filtros | Interacción con el 3D | Qué aprender |
|---|---|---|---|---|
| **Speckle Intelligence dashboards** | Espacio propio (lienzo de widgets, secciones, cambio de tamaño y orden) | **El visor del modelo es la fuente** de todos los widgets. **Filtros de página como chips**, arriba, que afectan a todos (O dentro de un chip, Y entre chips: igual que nuestro Filters). Campos calculados sin tocar el modelo publicado | Los widgets filtran, colorean y se responden entre sí | Es casi exactamente nuestra arquitectura con Filters y los campos derivados. Sus **«escenarios»** guardan filtro + color con nombre, como nuestras vistas guardadas. Sus dashboards quedaron en mantenimiento y lo nuevo va a «Reports» |
| **Autodesk Data Connector para Power BI 3.0** (jul-2026) | Página de informe con la visual del Viewer | Mismos filtros en todas las visuales; filtros que siguen entre páginas | Clic en la barra resalta el modelo, y clic en el modelo resalta la barra, por `ExternalElementID`. **Filtrar** (quita lo demás) no es lo mismo que **resaltar** (deja lo demás atenuado), y lo decide quien diseña el informe | Distinguir «filtrar» de «resaltar» por gráfico |
| **Excel: tabla dinámica + gráfico dinámico** | Dos objetos en la hoja | **La misma caché**: filtrar uno cambia el otro | — | La Planilla es la tabla dinámica; el Tablero debería ser su gráfico dinámico |
| **ACC / Autodesk Forma Insight** | Módulo aparte y tarjetas en la portada del proyecto. Las tarjetas se pueden redimensionar. Hay plantillas por rol | Conjuntos de datos del proyecto | Una tarjeta de diseño puede incrustar el modelo | **Plantillas de tablero** por rol |
| **Autodesk Tandem** | Tableros como vistas filtradas hechas de tarjetas | Los mismos filtros de la instalación | Desde una tarjeta se salta a la lista o a la **vista filtrada de lo que falta** | El tablero sirve para **encontrar lo que falta**, como nuestra Planilla |
| **Vyssuals** (Revit) | Aplicación web aparte | Sincroniza con Revit en vivo | Colorea la vista 3D de Revit desde los gráficos | Lo que copiamos en julio: completitud + gráfico + color |
| **Bentley iTwin IoT** | Tableros de series temporales | Sensores | Enfoca los elementos con alertas | Para avance en el tiempo, más adelante |

**Lo que todos comparten:**
- **un solo juego de filtros**;
- **una sola fuente de datos**;
- **los gráficos en su propio espacio**.

Ninguno tiene dos sistemas que pinten el mismo modelo, ni gráficos que cuenten otros datos que la tabla.

## 5 · Qué dice la investigación

1. **Bach et al., «Dashboard Design Patterns» (IEEE VIS 2022, TVCG 29(1)).** 144 tableros analizados, patrones en ocho
   grupos. Los que nos tocan:
   - **Valores derivados** y **umbrales**: el gráfico juzga contra un límite. Ya existe la línea de referencia; con
     partidas sería «metrado del expediente».
   - **Metainformación**: **fuente de los datos** y **fecha de actualización** en cada tarjeta. Hoy no se dice qué
     itemizado ni qué filtro usa un gráfico.
   - **Detalle a petición**: de la tarjeta a la Planilla.
   - **Disposiciones agrupadas** y **esquemáticas**: secciones, y planta o perfil como fondo. El lienzo libre es un
     patrón reconocido («open/grouped»), no un error.
   - **Color semántico** (verde, rojo) frente a color por categoría.
   - **Personalización**: mover y redimensionar.
2. **Sarikaya et al., «What Do We Talk About When We Talk About Dashboards?» (IEEE TVCG, 2018).** Clasifica los
   tableros por propósito:
   - para **decidir**;
   - para **estar al tanto**;
   - para **comunicar**.

   El nuestro es para decidir: ¿este metrado sirve para valorizar? Por eso los gráficos deben llevar a la acción
   (aislar, ir a la partida, «medir con…»), no solo verse bien.
3. **Roberts, «State of the Art: Coordinated & Multiple Views» (CMV 2007).** La base del «seleccionar aquí resalta
   allá», que es lo que hacemos con el 3D.
4. **Mackinlay et al., «Show Me» (InfoVis 2007)** y **Moritz et al., «Draco» (2018).** Elegir el tipo de gráfico
   según el tipo de dato con **reglas escritas**, no con IA. Draco las escribe como restricciones explícitas. Es lo
   que ya hace el nodo «Parámetros» (clic → gráfico preparado), y encaja con la regla «sin IA».
5. **Few, «Information Dashboard Design» (2.ª ed., 2013).** Ver de un vistazo; *bullet graphs* y *sparklines* en
   lugar de diales. Útil para las tarjetas KPI.
6. **Construcción:**
   - un sistema de **cómputo de cantidades desde BIM con tablero en Power BI** compara cantidades 2D frente a BIM y
     **sigue sus cambios en el tiempo** (es la regla A6 del doc 39);
   - un **tablero BIM para control de obra (ASCE)** relaciona avance, **pagos a contratistas** (valorizaciones) y
     avance por sector en el 3D;
   - un **tablero de inteligencia de negocio con BIM (Buildings, 2026)** enlaza el modelo con la tabla de
     actividades.

   Todos apuntan a lo mismo: el tablero vale cuando se ata a las **partidas y a su avance**.

## 6 · Las tres opciones, evaluadas

| | A · Dentro de la Planilla (tercera pestaña) | B · Como hoy | **C · Botón propio + núcleo compartido** |
|---|---|---|---|
| Mismos datos que la tabla | Sí | **No** | Sí |
| Mismas reglas de 3D (momentáneo; color en Filters) | Sí | **No** | Sí |
| Partidas y cantidades | Sí | **No** | Sí (fuente nueva «Partidas») |
| Espacio para el lienzo | **Poco** (franja de abajo) | Panel a la derecha | Panel a la derecha **o** otra ventana |
| Respeta lo decidido (lienzo Miro, secciones) | A medias | Sí | Sí |
| Lo que hacen los referentes | No | No | **Sí** |
| Trabajo | Alto (mudar el lienzo) | Ninguno | Medio (cambiar las costuras, no el lienzo) |

**Recomendación: C.**

## 7 · Cómo sería C

1. **La fuente es lo que Filters deja pasar**, con el mismo `filterInventoryRows` que la Planilla. Cada tarjeta dice
   arriba «filtrado por Filters: N de M elementos». Es el patrón de metainformación de Bach; Speckle lo hace con sus
   chips.
2. **Fuente nueva «Partidas»** en el registro `SOURCES`, que ya se diseñó para eso:
   - las cantidades que calcula la Planilla (medida nativa, y si falta, criterio de la obra);
   - por partida, capítulo y estado frente al itemizado.

   Con eso salen:
   - metrado por capítulo;
   - cobertura por capítulo;
   - lo que falta medir;
   - comparación con el expediente (con la línea de referencia que ya existe).

   Cada tarjeta dice qué itemizado y qué versión usa.
3. **El clic aísla un momento** con la misma `lib/aislamientoTemporal.js` de la Planilla, y devuelve lo que había.
   Por gráfico se elige **filtrar** o **resaltar**, como en Power BI.
4. **«Pintar» pide el color a Filters**: abre Filters con el campo del gráfico y lo colorea, como «Colorear en
   Filters». Sigue llegando a Revit, porque Filters emite el mismo aviso.
5. **Enlaces cruzados**, para el detalle a petición:
   - desde una partida de la Planilla, «ver en el Tablero»;
   - desde una barra del Tablero, «ver en la Planilla», con esa partida o ese valor.
6. **«Abrir en otra ventana»** para el Tablero, con el mismo `PanelAparte` del doc 37, que ya sirve para cualquier
   panel. El lienzo grande en la segunda pantalla.
7. **Plantillas** de tablero, como Forma y Speckle: «Metrado por capítulo», «Cobertura del itemizado», «Qué falta».
   Son criterios que **sube o arma la obra**, no fijos en el código.
8. **Se conserva** el lienzo, las secciones, la pregunta, la línea de referencia, la completitud, el Live Link y los
   tableros guardados (`/api/dashboards`, sin migración).

### Orden propuesto

| Fase | Qué | Por qué primero |
|---|---|---|
| **F0** | Probar el Tablero de hoy con datos reales en el banco (pendiente desde julio) y contar los tableros guardados en producción | No se cambia lo que nunca se probó |
| **F1** | Núcleo compartido: fuente filtrada, aislamiento momentáneo, color por Filters | Arregla los choques del §3 |
| **F2** | Fuente «Partidas» + metainformación + plantillas | El valor nuevo para metrados |
| **F3** | Enlaces cruzados con la Planilla + otra ventana | Comodidad, sobre lo ya sólido |

## 8 · Qué leer, en orden de utilidad

**Primero (diseño):**
1. **Patrones de Bach et al.**: las fichas en `dashboarddesignpatterns.github.io`, como lista de revisión de cada
   tarjeta.
2. **Speckle Intelligence dashboards** (documentación): el producto más parecido a lo que queremos. Mirar filtros de
   página, campos calculados y escenarios.
3. **Power BI, «Change how visuals interact»**: filtrar frente a resaltar, y quién lo decide.

**Después (arquitectura):**

4. **`uwdata/mosaic`**: vistas enlazadas con un **coordinador central**. Es el papel que debe tener Filters.
5. **`autodesk-platform-services/aps-powerbi-tools`**: cómo enlaza Autodesk gráfico ↔ elementos por
   `ExternalElementID`, que es lo que hace nuestro motor.
6. **`autodesk-platform-services/aps-data-connector-dashboard`**: ejemplo oficial de tablero con Chart.js, la misma
   biblioteca que usamos.

**Para más adelante:**

7. **`mathuo/dockview`** (MIT): paneles acoplables y ventanas aparte que siguen conectadas, si el Tablero y la
   Planilla acaban juntos en la segunda pantalla.
8. **`xyflow/xyflow`** (React Flow, MIT): solo si el lienzo propio se queda corto (selección múltiple, minimapa,
   atajos). Hoy no hace falta: el lienzo propio pesa 34 kB y funciona.
9. **Sarikaya et al. 2018**, **Roberts 2007**, **Show Me 2007** y **Draco 2018**: fondo teórico.
10. **Few 2013**: diseño de tarjetas KPI.

## 9 · Decisiones del dueño

1. ¿Opción **C**? Botón y lienzo propios, con el mismo núcleo de datos que la Planilla.
2. ¿El color del Tablero pasa siempre por Filters? Revit lo sigue recibiendo.
3. ¿Empezamos por **F0**, probarlo con tus datos y contar los tableros guardados en producción?
4. ¿El Tablero sigue siendo solo para administradores?

## Fuentes

- Speckle: [Intelligence dashboards](https://docs.speckle.systems/analytics/intelligence-dashboards), [Dashboards (2026.9)](https://docs.speckle.systems/next/analytics/dashboards) y [Reports](https://docs.speckle.systems/next/analytics/reports)
- Autodesk: [Data Connector for Power BI 3.0.0](https://aps.autodesk.com/blog/unlock-faster-insights-autodeskr-data-connector-power-bi-300), [curso del conector](https://autodesk.com/learn/ondemand/curated/power-bi-data-connector/4aBMGzJtl0kAXmvtHFgit7) y [Viewer dentro de Power BI](https://aps.autodesk.com/blog/embed-forge-viewer-inside-power-bi-report)
- Autodesk Forma: [Insight Builder](https://www.autodesk.com/blogs/construction/simplify-custom-dashboard-creation-with-insight-builder-in-autodesk-construction-cloud/), [novedades de marzo de 2026](https://www.autodesk.com/blogs/construction/autodesk-forma-march-2026-construction-releases-built-for-whats-next/) y [personalizar tableros](https://help.autodesk.com/view/BUILD/ENU/?guid=Insight_Customize_Dashboards)
- Autodesk Tandem: [Data Dashboards](https://intandem.autodesk.com/?p=3360) y [AEC Magazine](https://aecmag.com/digital-twin/autodesk-tandem-dashboards)
- Microsoft: [Change how visuals interact in a Power BI report](https://learn.microsoft.com/en-us/power-bi/create-reports/service-reports-visual-interactions); tabla y gráfico dinámicos enlazados: [Sumproduct](https://sumproduct.com/blog/charts-and-dashboards-pivotchart-part-2-interactivity/)
- Vyssuals: [guía de inicio](https://vyssuals.com/blog/getting-started-guide), [visualización en tiempo real](https://yssentyl.com/blog/real-time-data-visualization-for-revit-with-vyssuals-com), [Balkan Architect](https://balkanarchitect.com/p/vyssuals-for-revit) y [Open Source Construction](https://opensource.construction/trainings/vyssuals/)
- Bentley: [iTwin IoT](https://www.bentley.com/en/products/itwin-iot/)
- Bach et al.: [Dashboard Design Patterns (arXiv)](https://arxiv.org/pdf/2205.00757), [IEEE VIS 2022](https://content.ieeevis.org/year/2022/paper_v-full-1554.html) y [fichas de patrones](https://dashboarddesignpatterns.github.io/patterns.html)
- Sarikaya et al.: [What Do We Talk About When We Talk About Dashboards?](https://alper.datav.is/publications/dashboards/)
- Roberts: [CMV 2007 (Kent)](https://kar.kent.ac.uk/14569)
- Mackinlay et al.: [Show Me](https://www.tableau.com/research/publications/show-me-automatic-presentation-visual-analysis)
- Moritz et al.: [Draco](https://idl.uw.edu/draco)
- Few: [Information Dashboard Design, 2.ª ed.](https://tenlong.com.tw/products/9781938377006)
- Mosaic: [qué es](https://idl.uw.edu/mosaic/what-is-mosaic) y [por qué](https://idl.uw.edu/mosaic/why-mosaic)
- APS: [aps-data-connector-dashboard](https://github.com/autodesk-platform-services/aps-data-connector-dashboard)
- dockview: [dockview.dev](https://dockview.dev/)
- React Flow: [@xyflow/react](https://www.npmjs.com/package/@xyflow/react)
- Construcción:
  - [cómputo de cantidades desde BIM con tablero en Power BI](https://www.sciencedirect.com/science/article/abs/pii/S0926580523004156)
  - [tablero BIM para control de obra (ASCE)](https://ascelibrary.org/doi/10.1061/9780784483961.137)
  - [tablero de inteligencia de negocio con BIM (Buildings 2026)](https://doi.org/10.3390/buildings16071318)
