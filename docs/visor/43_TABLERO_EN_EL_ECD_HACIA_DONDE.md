# 43 · El Tablero dentro del ECD: para qué sirve, de qué bebe y hacia dónde conecta — INVESTIGACIÓN

29-oct-2026. Solo investigación, sin código. El dueño: «¿o sería más que nada gráficas de filtro que uno hace? No sé
qué me recomiendas. Podemos investigar a profundidad cómo podemos usar ese tablero en estos entornos y hacia dónde
podemos conectar o apuntar». Regla del dueño para todo lo que sigue: **integral, no dirigido a algo puntual**.

## 0 · Respuesta corta

**Las gráficas de filtro son la base, pero no el producto.** En los entornos comunes de datos (ECD) serios, el tablero es
**la capa de análisis de TODO el entorno**: documentos, revisiones, observaciones, plan de entregas y modelo. No es una
herramienta de gráficos del modelo.

Recomendación: el Tablero de ALEPHIA es **«la vista de análisis del ECD»**, con cuatro propiedades genéricas:

1. **Muchas fuentes, un solo registro.** El motor ya tiene un registro de fuentes pensado para crecer: el modelo hoy, y
   después la Planilla, los documentos, las revisiones, las observaciones y el plan de entregas.
2. **Un solo juego de filtros.** El de Filters, como coordinador (doc 40).
3. **Reglas que escribe la obra**: umbrales, coherencia entre datos, requisitos de información. No hay nada de una obra
   en el código, y nada de IA.
4. **Cortes con fecha**: una «foto» del tablero en un momento dado (fin de mes, entrega), que no cambia aunque el modelo
   cambie. Es lo que piden la valorización, la entrega y la auditoría, y encaja con lo que ya nos distingue: huella,
   cadena sellada y QR que certifica.

Y hacia fuera: **salida abierta** (Power BI, Excel), **estándares abiertos** (IDS, BCF, IFC) y **reportes al Estado**
(INFOBRAS, SEACE, Pladicop), como reportes y no por API, porque no se encontró ninguna pública.

## 1 · Qué hacen los ECD con sus tableros

| Producto | Sobre qué datos | Para qué |
|---|---|---|
| **Oracle Aconex Insights** | Correspondencia, documentos, flujos de trabajo, usuarios, de **varios proyectos** | Detectar correspondencia vencida y cuellos de botella; tiempo medio de respuesta de los RFI; estado de revisión por disciplina; transmisiones enviadas y recibidas. Del panel entre proyectos se baja al detalle con un clic |
| **Autodesk Forma (ACC) Insight** | Datos del proyecto: incidencias, estimaciones, transmisiones, salud del modelo | Tableros por rol en la portada del proyecto, con plantillas; tarjetas de socios; analítica del modelo (sincronizaciones, crecimiento, alineación de versiones) |
| **Morta (planificación ISO 19650)** | MIDP/TIDP conectados al ECD | Cumplimiento de entregas por disciplina, autor e hito, actualizado según se suben los documentos |
| **Speckle Intelligence** | Modelos y sus versiones | Filtros de página para todos los widgets, campos calculados, «escenarios» (filtro + color guardados), comparación entre versiones |
| **Power BI + conector de Autodesk** | Lo que exporte el ECD | El usuario arma sus propios informes; el visor 3D resalta y filtra con los gráficos |

**Lo común:** el tablero mira **el entorno entero, no solo el modelo**, y su pregunta principal es **«¿dónde está el
atasco o lo que falta?»**: lo vencido, lo no entregado, lo sin responder, lo sin dato.

## 2 · Qué mide la gestión de información (ISO 19650 y obra pública peruana)

- **ISO 19650**:
  - **entregas a tiempo frente al MIDP**: fecha prevista contra real;
  - **avance de los estados** de cada contenedor (S0…S4, A…);
  - **rechazos** en la autorización;
  - **re-registros** de metadatos.

  La norma no fija un tablero; los indicadores salen del plan de entregas y de los estados.
- **Guía Nacional BIM (Perú, 2023, obligatoria; BIM obligatorio desde ago-2026)**:
  - el estado va por metadato;
  - hay revisión;
  - hay usuario y fecha de cada cambio.

  Son justamente los datos que un tablero del ECD agrega.
- **Reglamento de la Ley 32069**:
  - el ECD es **fuente de información accesible a los aplicativos del SNPMGI** (art. 154.5);
  - los adjudicadores de la JPRD acceden al ECD (art. 224.3);
  - hay plazos con silencio positivo (ampliaciones, liquidación).

  Un tablero que mida **plazos que corren** es útil para todas las partes.
- **El Estado ya pide reportes** (hechos verificados, sin API pública encontrada):
  - **INFOBRAS** (Contraloría): avance físico y financiero de cada obra;
  - **valorizaciones electrónicas en el SEACE** (OECE, Res. D000083-2025): el residente registra y presenta, y la
    entidad da conformidad;
  - **cuaderno de incidencias** en Pladicop.

## 3 · Para quién es (el mismo tablero, otra mirada)

| Quien | Lo que pregunta | Fuente |
|---|---|---|
| **Entidad / supervisión** | ¿Qué está vencido? ¿Qué se observó y no se levantó? ¿Lo valorizado tiene sustento? | revisiones, observaciones, plan de entregas, Planilla |
| **Contratista / oficina técnica** | ¿Cuánto se puede valorizar? ¿Qué falta modelar o medir? | Planilla, modelo |
| **Coordinador BIM** | ¿Cumple el modelo los requisitos de información? ¿Qué falta en cada entrega? | modelo, requisitos (IDS), versiones |
| **Dirección** | ¿Cómo van todas mis obras? | todas, entre proyectos |

Son los mismos gráficos y filtros, sobre otra fuente y otra plantilla. **Las plantillas las arma cada organización**, no
el código.

## 4 · De qué beberá (fuentes del registro, en orden)

| Fuente | Ya existe en ALEPHIA | Qué permite graficar |
|---|---|---|
| Modelo (inventario por versión) | Sí: es la fuente de hoy | Cualquier parámetro; completitud; versión a versión |
| Planilla (itemizado, cantidades, criterios) | Sí (doc 40, fuente «Partidas») | Metrado por partida o capítulo, cobertura, sin medir |
| Documentos (estado, revisión, disciplina, autor) | Sí, en Docs | Contenedores por estado; vigentes y sustituidos |
| Revisiones (flujos, aprobaciones, plazos) | Sí, en Docs | Pendientes por revisor; tiempo de respuesta; vencidas |
| Observaciones / incidencias (doc_issues) | Sí, en Docs | Abiertas y cerradas; por responsable; antigüedad |
| Plan de entregas (MIDP/TIDP) | Sí (PQT8) | Previsto frente a entregado; atrasos por disciplina |
| Auditoría (cadena sellada) | Sí | Actividad por usuario y fecha; prueba de cada dato |

Todas entran por el mismo registro, con **los mismos tipos de gráfico, los mismos filtros y las mismas reglas**. Es lo
genérico.

## 4 bis · Qué guarda hoy nuestro ECD (leído del esquema, 29-oct)

Leído de `esquema_base.py`, `db.py`, las migraciones `sql/` y las rutas. **Que una tabla exista no quiere decir que
tenga datos** en cada obra: falta contar filas por obra en producción, y eso solo se hace si el dueño lo pide.

**El hallazgo que lo hace genérico:** casi todo el ECD tiene **la misma forma**, un **acto con estado, responsable y
fechas** (creado, vence, cerrado). Basta **un solo adaptador «actos»** para que todos den los mismos indicadores, sin
programar uno por tabla.

| Familia | Tablas (campos que sirven para analizar) | Qué se puede graficar, igual para todas |
|---|---|---|
| **Actos con plazo** | <ul><li>`doc_issues` (observaciones: tipo, estado, responsable, `vence_en`, `corregido_en`, `verificado_en`, `cerrado_en`, ubicación, **progresiva**)</li><li>`doc_submittals` (paso, `paso_vence_en`, veredicto, revisión, `revision_de`)</li><li>`doc_reviews` (pasos, estado, historia)</li><li>`doc_rfis` y `doc_redlines` (estado, responsable, fecha, respuesta)</li><li>`encargos` (destino, `vence_en`, avisado, recordado)</li><li>`doc_instrucciones` (acuses, atención)</li><li>`doc_actas` (protocolo, firmas, `vence_en`, progresiva)</li></ul> | <ul><li>abiertos y cerrados;</li><li>**vencidos** y por vencer;</li><li>**antigüedad**;</li><li>**tiempo de ciclo** (de creado a cerrado);</li><li>por responsable, empresa o función;</li><li>tasa de rechazo o devolución;</li><li>re-entregas (`revision_de`);</li><li>todo semana a semana</li></ul> |
| **Documentos y su estado** | <ul><li>`file_nodes` y `file_versions` (estado, etiquetas, metadatos, versiones)</li><li>`file_emisiones` (**código de idoneidad y de revisión**, destino, quién y cuándo)</li><li>`doc_planos` y `doc_plano_revisiones` (emitida, **superada**)</li><li>conjuntos de especificaciones</li></ul> | <ul><li>documentos por estado ISO 19650;</li><li>emisiones por mes;</li><li>revisiones superadas;</li><li>versiones por documento (cuánto se rehace);</li><li>vigente frente a sustituido</li></ul> |
| **Plan de entregas** | `plan_entregas` (disciplina, originador, responsable, **`fecha_comprometida`**, hito, idoneidad y revisión previstas, `file_node_id` y `vinculado_en`) | <ul><li>**previsto frente a entregado**;</li><li>atrasos por disciplina u originador;</li><li>idoneidad prevista frente a la emitida (cruce con `file_emisiones`)</li></ul> |
| **Campo** | <ul><li>`avance_campo` (**cantidad y unidad**, actividad, partida `cost_item_codigo`, frente, **progresiva inicio y fin**, estado, aprobado por)</li><li>`doc_partes` (parte diario)</li><li>`doc_asientos` (cuaderno: tipo, estado, aprobado o devuelto)</li><li>`daily_reports` (personal, clima)</li><li>fotos de avance y evidencias</li></ul> | <ul><li>avance físico por actividad, partida, frente y **tramo de progresiva**, semana a semana;</li><li>lo aprobado frente a lo capturado;</li><li>asientos por tipo y estado;</li><li>personal y clima por día</li></ul> |
| **Sustento** | `vinculos_de_sustento` (ítem, cantidad, unidad, documento, versión, página, zona) | **Partidas con sustento y sin él**, que es lo que pide una valorización |
| **Actividad** | `activity_log`, `auth_events`, registro de descargas | <ul><li>quién hizo qué y cuándo;</li><li>uso de cada herramienta (como el informe de uso de Procore)</li></ul> |
| **Modelo** | inventario por versión, vistas guardadas, `element_docs` (elemento ↔ documento), `tracking_*` | Lo de hoy, más elementos con documento enlazado o sin él |

**Tres cruces que ningún referente revisado hace junto (valor propio):**

1. **Por progresiva**: observaciones, actas y avance de campo traen **progresiva**. Junto con el eje de Civil, el
   Tablero puede mostrar **todo lo del ECD a lo largo de la obra lineal**: qué tramo tiene más observaciones abiertas,
   avance o atraso. Es genérico para cualquier obra con eje.
2. **Partida ↔ avance ↔ sustento**:
   - `avance_campo.cost_item_codigo`, el itemizado de la Planilla y `vinculos_de_sustento` hablan de las **mismas
     partidas**;
   - eso da **cuánto se ejecutó, cuánto se metró en el modelo y qué tiene sustento**, por partida.
3. **Plan ↔ emisión ↔ revisión**:
   - lo comprometido en el plan de entregas;
   - lo emitido con su idoneidad;
   - lo que la revisión aprobó o devolvió.

   Es la cadena entera de ISO 19650, medida.

## 5 · Lo que lo hace profesional (capacidades, no casos)

1. **Filtros compartidos**: un clic en una barra filtra las demás tarjetas y el 3D. Patrón «vistas coordinadas»; en
   Power BI, filtrar frente a resaltar.
2. **Reglas de la obra, explicadas**:
   - umbrales y metas («línea de referencia», ya existe);
   - **reglas de coherencia** escritas por la obra, del tipo «si A, entonces B»;
   - **requisitos de información en IDS** (buildingSMART, estándar final desde 2024): el Tablero cuenta cumplimientos
     y fallos por requisito y aísla los fallos.
3. **Historia y proyección por regla**: cualquier cifra, versión a versión, y su ritmo («a este ritmo, llega a X hacia
   tal fecha», con su rango). Sin modelos entrenados.
4. **Cortes congelados**: el tablero «al 31 de octubre» se guarda con su fecha, su versión de cada fuente y su huella.
   Sirve para la valorización, la entrega y la auditoría. **Esto no lo hace ninguno de los referentes con huella
   verificable**: es donde ALEPHIA puede ser distinto.
5. **Entre obras**: la misma plantilla sobre varias obras, para dirección. Es lo que Aconex hace con sus datos.

## 6 · Hacia dónde conectar

| Destino | Cómo | Para qué |
|---|---|---|
| **Power BI / Excel** | Una **salida de solo lectura por obra**, con los mismos permisos del ECD. Lo más fiable para Power BI es un servicio OData, que describe sus tablas y pagina; si no, JSON con paginación. Además, CSV o Excel de cada tarjeta, que ya existe | Que cada organización haga sus propios informes sin pedirnos nada (lo mismo que ofrece Autodesk con su conector) |
| **IDS** (requisitos de información) | Leer el archivo IDS que sube la obra y comprobarlo contra el inventario | Cumplimiento de requisitos por entrega, sin criterio en el código |
| **BCF** (incidencias entre programas) | Importar y exportar las observaciones en BCF 3.0 | Que las observaciones de Solibri, Navisworks o Revizto entren al ECD y se cuenten en el Tablero |
| **IFC** | Ya se trabaja con modelos; IDS se comprueba sobre IFC | Base de lo anterior |
| **El Estado** (INFOBRAS, SEACE, Pladicop, SNPMGI) | **Reportes** con el formato que piden, generados desde un corte congelado. No se encontró API pública: si aparece, se conecta | La «salida al Estado» del doc «ECD ideal para Perú» |

## 6 bis · Segunda ronda: fuentes leídas enteras

El dueño señaló que la primera ronda se quedó en los resúmenes de las búsquedas. Se leyeron completos:
- la ayuda de Aconex;
- la página de Revizto;
- el instructivo del MEF del Formato 12-B (20 págs.);
- el estudio de ASC 2024 (9 págs.);
- la documentación de Procore Analytics 2.0.

Dos páginas no se dejaron leer (Autodesk Insight Builder y las notas de Dalux 2026.3, ambas 403); de ellas solo hay
resumen de búsqueda.

| Fuente | Lo que aporta, leído |
|---|---|
| **Aconex Insights** (ayuda oficial) | El tablero se arma sobre **procesos que configura la organización** (qué cuenta como «abierto», «respondido» o «cerrado», y a los cuántos días se cierra solo). Esas reglas **solo valen en el tablero**: no cambian el correo. Cada organización ve solo los procesos en los que participa. La vista de cartera muestra las obras con al menos un proceso. Se refresca cada 15 min a 6 h según la región. Se exporta a Excel o PDF |
| **Procore Analytics 2.0** (documentación oficial) | **Informes de Power BI ya hechos** sobre el modelo de datos de Procore (salud del proyecto, estado, causa raíz, uso de las herramientas), que la empresa abre en su propio Power BI o dentro de Procore. Datos refrescados cada hora. Para verlos hacen falta permisos en el proyecto y en Power BI |
| **Revizto** (página del producto) | Tableros con modelos, interferencias e incidencias, **enlazados al 2D y al 3D**; informes con enlaces directos a cada incidencia; **se comparten con cualquiera, sin licencia**; API de incidencias y conexión a herramientas de BI |
| **Dalux 2026.3** (solo resumen) | Gráfico de **historia de la validación del modelo** a lo largo del tiempo, y un tablero de entrega de activos |
| **MEF, Formato 12-B** (instructivo leído) | El avance de la inversión se declara **por producto y componente** (los del Formato 08). Hay entregables programados por periodo con su ponderación (que debe sumar 100 %) y un porcentaje real declarado. El sistema calcula solo el avance físico. Se actualiza **cada mes**; el avance real se toma de la última valorización |
| **Guía Nacional BIM** (resumen) | El proveedor del ECD debe dar a la DGPMI del MEF **acceso permanente** a lo «Publicado» y lo «Archivado» de las inversiones públicas |
| **Ghosh et al., «Use of Visual Dashboards in Construction Projects»**, ASC 2024 (leído) | Revisión de 27 artículos y encuesta a profesionales con más de 5 años de experiencia. Lo que valoran: **datos al día, interacción, facilidad y que se pueda personalizar**. El problema principal es **integrar los datos** de varias fuentes. Piden diseño pensado en el usuario y actualizaciones regulares |

**Lo que cambia en la recomendación:**

1. **Reglas del tablero aparte de los datos (Aconex).** Las reglas de «qué cuenta como vencido o cerrado» las configura
   la organización y viven en el tablero, sin tocar el documento. Es la misma idea de las reglas de la obra del §5, ya
   confirmada por un ECD grande.
2. **Plantillas de Power BI listas (Procore).** Además de la salida abierta, conviene entregar **una plantilla de Power
   BI** que ya lea esa salida. Así la organización no empieza de cero.
3. **Compartir un corte sin licencia (Revizto)**: un enlace de **solo lectura** a un corte congelado, con su huella.
   Encaja con el QR que certifica.
4. **El 12-B pide avance por producto y componente, cada mes.** El corte mensual del Tablero puede dar el **avance
   programado frente al real**. Hay que agrupar las partidas en esos productos y componentes, y **esa agrupación la hace
   la obra** (como el itemizado), no el código.
5. **La historia de la calidad del modelo (Dalux)** sale gratis con el inventario por versión: completitud y reglas
   cumplidas, versión a versión.
6. **Lo que más cuesta es integrar los datos (ASC 2024).** Es justo la ventaja de que el Tablero esté **dentro** del ECD,
   con un registro único de fuentes, en vez de exportar a otra herramienta.

## 7 · Recomendación y orden

**Sí a las gráficas de filtro, pero como la base de algo mayor**: la capa de análisis del ECD.

| Fase | Qué | Genérico porque… |
|---|---|---|
| Hecha (doc 41) | Diseño propio con la paleta, tarjetas que cuadran | Igual para cualquier fuente |
| 1 | Núcleo compartido con Filters y la Planilla (doc 40) | Un solo filtro y un solo color para todo |
| 2 | Registro de fuentes: documentos, revisiones, observaciones y plan de entregas | Cada fuente entra igual; las plantillas las arma la organización |
| 3 | Reglas de la obra (coherencia y umbrales) + historia por versión | Las reglas las escribe la obra |
| 4 | Cortes congelados con huella | Para cualquier fecha y cualquier tablero |
| 5 | Salida abierta (Power BI/Excel), IDS y BCF | Estándares, no integraciones a medida |
| 6 | Reportes al Estado desde un corte | El formato oficial, no el de una obra |

## 8 · Decisiones del dueño

1. ¿El Tablero se plantea como **la capa de análisis de todo el ECD** (Docs y View), o solo del modelo?
2. ¿Prioridad entre las fases 2–6? Mi propuesta es el orden de la tabla.
3. Los cortes congelados: ¿quién los puede hacer (cualquier usuario, o el administrador de la obra) y si se firman?
4. ¿La salida para Power BI se ofrece a todas las organizaciones de la obra, con sus permisos, o solo a la que
   administra?

## Fuentes

Segunda ronda (leídas enteras salvo donde se indica):
- [Procore Analytics 2.0](https://support.procore.com/products/online/user-guide/company-level/analytics), [Analytics Embedded 2.0](https://support.procore.com/products/online/user-guide/company-level/analytics/tutorials/procore-analytics-embedded-2.0) y [novedades de datos e informes](https://www.procore.com/whats-new/data-intelligence-and-power-bi-report-updates-for-procore-analytics-2-0)
- [Revizto: Connected Project Intelligence](https://revizto.com/product/connected-project-intelligence)
- [Dalux: notas de la versión 2026.3](https://support.dalux.com/hc/en-us/articles/26774543443356-Build-release-notes-2026-3) (solo resumen: la página devolvió 403)
- MEF:
  - [instructivo del avance de la ejecución en el Formato 12-B](https://www.mef.gob.pe/contenidos/inv_publica/docs/F12B/Instructivo_AvanceFisico.pdf);
  - [capacitación del Formato 12-B](https://www.mef.gob.pe/contenidos/inv_publica/docs/capacitaciones/Capacitacion_Formato_F12B.pdf);
  - [portal de seguimiento SSI](https://ofi5.mef.gob.pe/webSeguimiento/Index/Index)
- [Guía Nacional BIM, gestión de la información](https://www.mef.gob.pe/contenidos/inv_publica/anexos/anexo_RD003_2023EF6301.pdf) y [recursos del Plan BIM Perú](https://www.mef.gob.pe/planbimperu/recursosbim.html)
- Ghosh, Mukherjee y McCuen: [Use of Visual Dashboards in Construction Projects (ASC 2024)](https://easychair.org/publications/paper/PffL/download)

Primera ronda:

- Oracle Aconex: [Insights](https://help.aconex.com/aconex/our-main-application/using-aconex/aconex-insights/), [tablero de documentos](https://docs.oracle.com/cd/F49731_01/English/user/dvref/88937.htm), [tablero de correspondencia](https://docs.oracle.com/cd/F49731_01/English/user/dvref/88936.htm) y [panorama de la solución](https://prmyazilim.com/docs/aconex/Aconex_Solution_Overview.pdf)
- Autodesk Forma: [Insight Builder](https://www.autodesk.com/blogs/construction/simplify-custom-dashboard-creation-with-insight-builder-in-autodesk-construction-cloud/) y [novedades de marzo de 2026](https://www.autodesk.com/blogs/construction/autodesk-forma-march-2026-construction-releases-built-for-whats-next/)
- Morta: [planificación de entregas ISO 19650](https://www.morta.io/solutions/use-cases/information-delivery-planning)
- UK BIM Framework: [Guidance Part F, planificación de entregas](https://ukbimframework.org/wp-content/uploads/2020/09/Guidance-Part-F_About-information-delivery-planning_Edition-1.pdf)
- Speckle: [Intelligence dashboards](https://docs.speckle.systems/analytics/intelligence-dashboards)
- buildingSMART:
  - IDS: [IDS 1.0 aprobado](https://www.buildingsmart.org/information-delivery-specification-ids-v1-0-is-approved-as-a-final-standard/), [qué es IDS](https://www.buildingsmart.org/what-is-information-delivery-specification-ids/) y [encuesta 2026](https://www.buildingsmart.org/ids-survey-results-2026/)
  - BCF: [BCF 3.0](https://www.buildingsmart.org/bim-collaboration-format-bcf-3-0/) y [estándar BCF](https://technical.buildingsmart.org/standards/bcf/)
- Microsoft y conectores: [OData en Power BI](https://www.thebricks.com/resources/guide-what-is-odata-feed-in-power-bi) y [conector de Autodesk 3.0](https://aps.autodesk.com/blog/unlock-faster-insights-autodeskr-data-connector-power-bi-300)
- Perú:
  - [INFOBRAS](https://apps.contraloria.gob.pe/infobras/) y [Directiva 005-2023-CG/GMPL](https://busquedas.elperuano.pe/dispositivo/NL/2179937-1)
  - [valorizaciones en el SEACE (Res. D000083-2025-OECE-PRE)](https://lpderecho.pe/oece-directiva-registro-valorizaciones-obra-seace-resolucion-d000083-2025-oece-pre/)
  - [cuaderno de incidencias (Res. D000070-2025-OECE-PRE)](https://lpderecho.pe/directiva-disposiciones-uso-cuaderno-incidencias-del-oece-resolucion-d000070-2025-oece-pre/)
  - docs/ECD_IDEAL_PERU.md y docs/ECD_REALIDAD_PERUANA.md (Guía Nacional BIM y Reglamento de la Ley 32069, leídos enteros el 13-oct)
