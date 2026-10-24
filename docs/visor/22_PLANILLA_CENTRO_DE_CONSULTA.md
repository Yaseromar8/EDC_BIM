# Planilla · cómo se hace un centro de consulta de metadatos (investigación)

23-oct-2026. Pedido del propietario: «investiga bien; la idea es que el usuario sienta que la Planilla es su
**centro de consulta de la metadata de cualquier proyecto**». Complementa el doc 21 (diagnóstico medido de la
sobrecarga actual).

## 1 · Qué hacen los que ya lo resuelven

| Herramienta | Lo que aporta a la idea de «centro de consulta» | Fuente |
|---|---|---|
| **Navisworks** | Distingue **selección** (lista fija de elementos) y **búsqueda guardada** (*search set*: guarda los **criterios**, no los elementos). La búsqueda guardada se vuelve a ejecutar cuando el modelo cambia y recoge los elementos nuevos que cumplen; se exporta en XML y se comparte. Se recomienda la búsqueda guardada para el trabajo que se repite. | Autodesk Help «Create and Use Sets of Objects»; AUGI «Power up with search and selection sets»; Arkance «Navisworks: Using Search sets» |
| **Solibri — Information Takeoff (ITO)** | Tablas de información definidas por **reglas**; **agrupar** pone en una fila los elementos con el mismo valor y combina las cantidades (**suma**, máximo, mínimo). Las definiciones se guardan aparte y se **reutilizan en otros proyectos**, cada una con sus plantillas de Excel. | Solibri Help «Understanding Information Takeoff (ITO)» |
| **BIMcollab Zoom — Smart Views** | Vistas por **reglas** (tipo de elemento · propiedad · operador · valor) que muestran, ocultan o **colorean** en 3D; el **auto-color** lee los valores que haya en el modelo, por eso las mismas vistas sirven **en distintos proyectos**; pueden ser del proyecto o independientes, y se **comparten** con el equipo. Se venden como validación de datos. | BIMcollab «Basics of making smart views»; producto «Smart Views» |
| **Speckle** | Filtro sobre **cualquier propiedad**, varias a la vez, con operadores («es», «está entre»), y **colorear por propiedad** desde el mismo panel. | Speckle docs «Exploration»; «Advanced filtering» |
| **ACC / Autodesk Docs — Model Browser** | Filtros básicos y avanzados (propiedad · operador · valor; texto, número, booleano); lo que queda se guarda como vista. Los usuarios piden poder **guardar y recuperar filtros** en Takeoff y Autodesk lo reconoce como pendiente. | Autodesk Help «Model Browser»; ACC Ideas «Filter models by model properties» |
| **Dalux** | Filtrar el 3D por una o varias propiedades desde la ficha del elemento; **los filtros activos se ven y se quitan**; filtros guardados y compartidos con el equipo. | Dalux Support «BIM properties» |
| **Revit — tablas de planificación** | El interruptor **«Detallar cada ejemplar»**: o una fila por elemento, o **una fila por grupo** con su recuento y totales. Los valores calculados se aplican elemento a elemento y luego se suman. Se recomiendan campos de control de calidad para marcar lo que falta. | Autodesk Help «Calculate Totals in a Schedule»; NOVEDGE (tips de tablas) |
| **Excel** | Al seleccionar dos o más celdas numéricas, la **barra de estado** muestra promedio, recuento y suma, y se puede elegir qué enseñar (mín., máx., recuento numérico). | Microsoft Support «View summary data on the status bar» |
| **Airtable** | Una sola barra: **Ocultar campos · Filtro · Agrupar · Ordenar · Color**; cada **vista guarda su configuración**, así el equipo trabaja con distintas miradas sobre la misma tabla; filtrar oculta, no borra. | Airtable Guide «Filtering and sorting views»; O'Reilly «Learning Airtable», cap. 4 |
| **Buenas prácticas de filtros** | Enseñar solo valores que existen en lo que queda; deshacer un filtro de forma obvia y consistente; lo general arriba y lo específico abajo. En Power BI, el panel de filtros por defecto **abruma** a quien no es técnico: lo clave a la vista y lo avanzado aparte. | UXmatters (Nudelman) «Best practices for designing faceted search filters»; Algolia (cita a NN/g); guías de Power BI (The Bricks, Pragmatic Works) |

## 2 · Lo que se repite (y lo que nos falta)

| Rasgo de un centro de consulta | Quién lo tiene | Planilla hoy |
|---|---|---|
| **Una regla = campo · operador · valor**, sobre cualquier propiedad | todos | ✔ (filtro de la tabla) |
| **Se ve y se deshace lo que filtra** | Dalux, buenas prácticas | ✗ repartido en 5 sitios (doc 21) |
| **Resumen de lo elegido** donde siempre | Excel (barra de estado) | a medias: fila Σ que tapa la tabla |
| **Una fila por grupo con su cantidad** («no detallar») | Revit, Solibri | ✗ (agrupa, pero siempre detalla) |
| **Colorear el 3D por los valores** | BIMcollab, Speckle | ✗ en la Planilla (sí en otros paneles) |
| **Guardar la consulta, no los elementos**, que se actualiza con el modelo | Navisworks, BIMcollab, Solibri, Dalux | ✗ (ACC tampoco: lo piden sus usuarios) |
| **La misma consulta sirve en otro proyecto** | Solibri, BIMcollab | ✗ |
| **Validar: qué falta parametrizar** | BIMcollab, Revit (QA) | se puede con «está vacío», sin camino directo |

Conclusión: lo que hace que una herramienta se sienta **el sitio donde se pregunta** no es tener más
botones, es: **(1)** preguntar siempre de la misma forma, **(2)** ver siempre qué se está preguntando,
**(3)** leer la respuesta siempre en el mismo lugar, en tabla y en 3D, y **(4)** guardar la pregunta para
repetirla, también en otro proyecto.

## 3 · Propuesta: la Planilla en tres capas

### Capa 1 · Preguntar (una sola barra)

`[Buscar o pegar…▾]  Filtro (n)  Columnas  Agrupar (n)  Detalle | Resumen  │  Seguir 3D  Colorear  Exportar  ⋮`

- **Buscar** con la lista de valores encontrados con casilla (el autofiltro de Excel; doc 21 §3).
- **Detalle | Resumen**: el «Detallar cada ejemplar» de Revit. En Resumen, una fila por grupo con recuento y
  totales: la tabla de metrados por partida sale con dos clics (Agrupar por CodigoDePartida → Resumen).
- **Colorear**: pinta el 3D por el primer nivel de agrupación (como el auto-color de BIMcollab); vuelve al
  color normal al quitarlo.

### Capa 2 · Ver la respuesta (siempre en el mismo sitio)

- **Línea de ámbito**: todo lo que acota, como chips con ✕ y «n de N» (doc 21).
- **Tabla** sin saltos; **pie = barra de estado** (con 2 o más elegidos, resume lo elegido).
- **3D sincronizado**: elegir en la tabla elige en el 3D y al revés (ya existe), aislar y colorear.

### Capa 3 · Recordar (biblioteca de consultas) — lo que la hace «centro»

- **Guardar consulta** con nombre: guarda **las reglas** (búsqueda, filtros, columnas, agrupado, cálculos),
  no la lista de elementos; al abrirla sobre el modelo actualizado responde con lo de hoy (como las búsquedas
  guardadas de Navisworks).
- **Consultas de la obra** (compartidas con el equipo) y **consultas mías**.
- **Plantillas entre proyectos**: como usan nombres de parámetro (`03_05_DSI_CodigoDePartida`…), la misma
  consulta sirve en cualquier proyecto con la misma convención; si un parámetro no existe, lo dice.
- **Al abrir un proyecto nuevo**: «Qué hay aquí» — elementos, parámetros por grupo y **cuánto está
  parametrizado** en los parámetros clave (ya lo calcula el catálogo, doc 19), con un clic a «qué falta».

Requiere guardar datos nuevos: Saved Views es **CLOSED** y haría falta tabla o migración → **solo con
autorización**, y primero en local.

## 4 · Orden recomendado

| Paso | Qué | Toca datos |
|---|---|---|
| 1 | Sin saltos, pie como barra de estado, un solo recuento (arregla Mayús) | no |
| 2 | Línea de ámbito con chips | no |
| 3 | Buscador como autofiltro de Excel; códigos por tramos; parecidos solo con palabras | no |
| 4 | Una sola barra; **Detalle / Resumen**; **Colorear** | no |
| 5 | «Qué hay aquí» al abrir (catálogo + completitud) | no |
| 6 | Biblioteca de consultas y plantillas entre proyectos | **sí — autorización** |

## Fuentes

- [Autodesk Help — Create and Use Sets of Objects (Navisworks)](https://help.autodesk.com/cloudhelp/2020/ENU/Navisworks/files/GUID-8FD0DD39-EC51-4C2F-BD60-6F84A3540E52.htm)
- [AUGI — Power up with search and selection sets](https://augi.com/articles/detail/power-up-with-search-and-selection-sets)
- [Arkance — Navisworks: Using Search sets](https://emea.support.arkance.world/hc/cs/articles/36465725916562-Navisworks-Using-Search-sets)
- [Solibri Help — Understanding Information Takeoff (ITO)](https://help.solibri.com/hc/en-us/articles/1500004203942-Understanding-Information-Takeoff-ITO)
- [BIMcollab — Basics of making smart views](https://helpcenter.bimcollab.com/portal/en/kb/articles/basics-of-making-smart-views)
- [BIMcollab — Smart Views](https://www.bimcollab.com/en/products/bimcollab-zoom/smart-views/)
- [Speckle docs — Exploration](https://docs.speckle.systems/3d-viewer/exploration)
- [Speckle — Advanced filtering](https://speckle.systems/updates/advanced-filtering/)
- [Autodesk Help — Model Browser (Docs)](https://help.autodesk.com/cloudhelp/ENU/Docs-Files/files/view-files/Model_Browser.html)
- [ACC Ideas — Filter models by model properties](https://forums.autodesk.com/t5/acc-ideas/filter-models-by-model-properties/idi-p/12186484)
- [Dalux Support — BIM properties](https://support.dalux.com/hc/articles/5794445568924)
- [Autodesk Help — Calculate Totals in a Schedule (Revit LT)](https://help.autodesk.com/cloudhelp/2024/ENU/RevitLT-GetStarted/files/GUID-49643D6C-78D5-4B36-BB5D-9883DDED276D.htm)
- [NOVEDGE — Group Revit Schedule Items for Clearer Quantity Reporting](https://novedge.com/blogs/design-news/revit-tip-group-revit-schedule-items-for-clearer-quantity-reporting)
- [Microsoft Support — View summary data on the status bar](https://support.microsoft.com/en-us/excel/view-summary-data-on-the-status-bar)
- [Airtable Guide — Filtering and sorting views](https://guide.airtable.com/filtering-and-sorting-views)
- [O'Reilly — Learning Airtable, ch. 4 View Essentials](https://oreilly.com/library/view/learning-airtable/9781098133368/ch04.html)
- [UXmatters — Best practices for designing faceted search filters](https://uxmatters.com/mt/archives/2009/09/best-practices-for-designing-faceted-search-filters.php)
- [Algolia — Faceted search: an overview](https://www.algolia.com/blog/ux/faceted-search-an-overview/)
- [The Bricks — How to add a filter pane in Power BI](https://www.thebricks.com/resources/guide-how-to-add-filter-pane-in-power-bi)
