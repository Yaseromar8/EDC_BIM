# 44 · Centro de datos de la obra: arquitectura — INVESTIGACIÓN Y ANÁLISIS A FONDO

29-oct-2026. Solo análisis, sin código. El dueño: «¿entonces ese sería nuestro centro de datos, como queríamos hacer
para Planilla?» y «pero analicemos e investiguemos».

Une cuatro documentos:
- doc 37: el centro de datos en otra pantalla;
- doc 40: el Tablero con el núcleo de la Planilla;
- doc 41: el diseño propio;
- doc 43: el Tablero como capa de análisis del ECD.

Regla del dueño: **integral, no puntual**. Todo lo que sigue vale para cualquier obra.

## 0 · Respuesta corta

Sí: **es el mismo centro de datos**. El doc 37 decía dónde se ve (una segunda pantalla con paneles). El doc 43 dice de
qué bebe (modelo, Planilla y ECD). Lo que faltaba, y es lo que más importa, es **cómo se organizan los datos para que
todo cuadre**. La investigación coincide en una idea:

> **Una sola capa de definiciones**: qué se cuenta, por qué se agrupa y quién puede verlo. Todas las caras (Planilla,
> Tablero, listas, 3D, Power BI, reportes) piden a esa capa, en vez de calcular cada una por su cuenta.

Así lo hacen:
- Bentley (Reporting API);
- Cube y dbt (capa semántica);
- los almacenes de datos clásicos (Kimball).

Es lo que garantiza que **un número sea el mismo en todas partes**.

## 1 · Lo que se investigó (fuentes leídas)

| Fuente | Qué enseña para nosotros |
|---|---|
| **Bentley iTwin, Reporting API** (documentación oficial) | Junta datos de **varias fuentes en un solo formato y lugar**: un *mapping* elige elementos (grupos por consulta) y propiedades; un *report* une varios mappings. Se lee por **OData v4**, que Power BI abre solo, con clave de acceso. Es casi nuestro esquema «fuentes + agrupaciones + salida» |
| **Autodesk, AEC Data Model** (AEC Magazine, jul-2024; la documentación no se dejó leer) | Datos **por elemento, no por archivo**, con consulta por versión. Solo lectura, **con límite de consultas (6.000 puntos por minuto)** y condiciones de acceso que fija Autodesk. Nuestro inventario en Postgres ya es granular y **no depende de esos límites**: es una ventaja que conviene conservar |
| **Capa semántica** (Cube; dbt) | Se definen **una vez** las medidas, las dimensiones, las uniones y los permisos (aplicados **antes** de consultar), y se precalculan los resúmenes frecuentes. El resultado es **«una sola versión de la verdad»** en el tablero, la hoja de cálculo y la app |
| **Kimball, modelado dimensional** | Tres tipos de hechos:<ul><li>**transacción**: un evento;</li><li>**foto periódica**: el estado al final de cada periodo;</li><li>**foto acumulada**: un proceso con hitos, con una fila que se actualiza en cada hito y guarda los tiempos entre hitos.</li></ul>Además, **dimensiones compartidas** que permiten cruzar procesos distintos |
| **Postgres «a una fecha»** | Postgres no trae tablas versionadas por el sistema (SQL:2011); hay extensiones (`periods`, `temporal_tables`). Para informes a una fecha, lo práctico es una **foto periódica explícita** |
| **Motores de análisis en el navegador** | DuckDB-WASM (SQL en el navegador, artículo de VLDB 2022; pesa varios MB) y Perspective (FINOS; tablas dinámicas en streaming). Sirven para cientos de miles o millones de filas |
| **Tandem «Detach» e iTwin (ventanas hijas)** | El panel separado tiene **la misma funcionalidad** y **comparte el mismo contexto de JavaScript**. Es lo que ya hicimos con la Planilla (doc 37) |
| **Aconex Insights** (doc 43) | Las reglas del tablero (qué es «cerrado», a los cuántos días se cierra) **las configura la organización** y no cambian el dato. **Cada organización ve solo los procesos en los que participa** |
| **Ghosh et al., ASC 2024** (doc 43) | Lo que más cuesta en los tableros de obra es **integrar los datos**; lo que valoran los usuarios es tenerlos al día, poder interactuar y personalizar |

## 2 · Lo que tenemos (leído en el código)

**Datos**
- Modelo: inventario por versión en Postgres; en el navegador, `window.postgresInventory`, con caché en IndexedDB.
- Planilla: itemizado (sql/40), criterios (sql/41) y campos derivados (`lib/camposDerivados.js`).
- ECD: unas cuarenta tablas (doc 43 §4 bis). **Casi todas son actos con estado, responsable y fechas.**
- Auditoría con cadena sellada (`auditoria_encadenada.py`) y emisiones con su código de idoneidad.

**Coordinación**
- **Filters** (CLOSED) decide qué se mira. La Planilla lee lo que deja pasar (`filterInventoryRows`).
- Las puertas públicas de Filters ya existen: `theme-property-bucket`, `recalculate-filters` y la revisión del
  inventario.

**Caras**
- La Planilla, abajo o en otra ventana (doc 37).
- El Tablero, en local con el diseño nuevo (doc 41). Todavía lee todo el inventario y pinta por su cuenta (doc 40).

**Una restricción de despliegue que el diseño tiene que respetar** (`server.py`):

| Rutas | Perfil «portal» (Docs) | Perfil del visor |
|---|---|---|
| Documentos, revisiones, transmisiones, submittals, planos, protocolos, **observaciones**, especificaciones, cuaderno, **avance de campo**, **plan de entregas**, sustento, auditoría | **sí** | sí |
| Inventario, **Tablero** (`/api/dashboards`), **Planilla** (`/api/planilla`), RFI, redlines, 4D | **no** | sí |

Es decir, **el visor ya puede leer todo el ECD**, pero **Docs no sirve ni el Tablero ni la Planilla**. Si el centro de
datos tiene que verse también desde Docs, hay que decidirlo (§6, decisión 2).

## 3 · La arquitectura: cuatro capas

```
  CARAS        Planilla · Tablero · Lista de actos · 3D · Salida OData/Power BI · Cortes y reportes
                 ▲  todas piden a la misma capa; ninguna calcula por su cuenta
  COORDINACIÓN Filters (qué se mira) · selección · periodo · obra/frente
                 ▲
  DEFINICIONES medidas · dimensiones compartidas · reglas de la obra · permisos
                 ▲
  FUENTES      modelo · Planilla · actos · documentos y emisiones · plan de entregas · campo · sustento · actividad
```

### 3.1 · Fuentes: cada una con su «grano» declarado (Kimball)

| Fuente | Una fila es… | Tipo de hecho |
|---|---|---|
| Modelo (inventario) | un elemento en una versión | foto (ya se guarda por versión) |
| Planilla | una línea de partida de un elemento | derivado del modelo + itemizado |
| **Actos** (observaciones, submittals, revisiones, RFI, redlines, encargos, instrucciones, actas) | un acto | **foto acumulada**: hitos creado → (corregido) → (verificado) → cerrado, con `vence_en` |
| Documentos y emisiones | una emisión de una versión | transacción (idoneidad y revisión con fecha) |
| Plan de entregas | un entregable comprometido | foto acumulada: comprometido → vinculado → emitido |
| Campo (`avance_campo`, partes, asientos) | una captura de avance | transacción (cantidad, unidad, fecha operativa) |
| Sustento | un vínculo partida ↔ zona de un documento | transacción |
| Actividad | un evento | transacción |
| **Cortes** (nuevo) | el estado de una fuente al cierre de un periodo | **foto periódica**, con huella |

**El adaptador «actos»** es la pieza más rentable. Todas las tablas de actos se leen con la misma forma (estado,
responsable, empresa, función, creado, vence y cerrado, más la ubicación y la progresiva si las tienen). Dan los mismos
indicadores (§3.2) sin programar uno por tabla. Es la «foto acumulada» de Kimball.

### 3.2 · Definiciones: medidas y dimensiones compartidas

**Medidas, definidas una vez:**
- elementos;
- cantidad, con medida nativa y si falta criterio de la obra (la regla de la Planilla);
- actos abiertos, vencidos y por vencer;
- **tiempo de ciclo** (creado → cerrado) y **tiempo por hito** (Kimball: un desfase por paso);
- devoluciones y re-entregas;
- previsto frente a entregado;
- emitido por estado.

**Dimensiones compartidas** (las que permiten cruzar). Marcas: ● la fuente la trae; ◐ se obtiene uniendo con otra
fuente.

| Dimensión | Modelo | Planilla | Actos | Documentos | Plan | Campo | Sustento |
|---|---|---|---|---|---|---|---|
| **Tiempo** (día, semana, mes, periodo de valorización) | versión | — | ● | ● | ● | ● | ● |
| **Partida / capítulo** (itemizado) | ● | ● | — | — | — | ● (`cost_item_codigo`) | ● |
| **Progresiva** (eje de Civil) | ◐ (por el eje) | ◐ | ● (observaciones, actas) | — | — | ● | — |
| **Responsable / empresa / función** | — | — | ● | ● (emisor) | ● | ● (autor, aprobador) | ● |
| **Disciplina** | ● | — | ◐ | ● | ● | — | — |
| **Documento / versión** | ● (`element_docs`) | — | ◐ (`revision_id`) | ● | ● | — | ● |
| **Elemento del modelo** | ● | ● | ◐ | ● (`element_docs`) | — | ● (`elemento_link_id`) | — |

**Lectura de la matriz:**
- **Partida**, **progresiva**, **responsable**, **documento** y **tiempo** son las cinco dimensiones que cruzan casi
  todo;
- con ellas salen los tres cruces propios del doc 43 (a lo largo de la obra lineal; partida ↔ avance ↔ sustento;
  plan ↔ emisión ↔ revisión);
- **si cada fuente las nombra igual**, el centro de datos cuadra. Esa es la tarea de esta capa.

**Reglas de la obra** (umbrales, coherencia «si A entonces B», qué cuenta como vencido o cerrado):
- viven aquí, se guardan con la obra y **no cambian el dato** (como en Aconex);
- son las mismas para todas las caras.

**Permisos**: se aplican **antes** de calcular (como en la capa semántica), con la misma guardia de obra de hoy. Cada
organización ve lo que ya ve en el ECD, como en Aconex.

### 3.3 · Coordinación

**Filters** sigue siendo el coordinador: lo que filtra vale para la tabla, los gráficos, las listas y el 3D (doc 40).
Se suman dos controles comunes:
- **el periodo**: semana, mes o periodo de valorización;
- **la obra o el frente**.

Todo entra por las puertas públicas de Filters, que es CLOSED y no se toca.

### 3.4 · Caras

| Cara | Para qué | Estado |
|---|---|---|
| Planilla | cuánto, en tabla, con criterios | hecha; sale a otra ventana |
| Tablero | lo mismo en gráficos, con plantillas | rediseño en local (doc 41) |
| **Lista de actos** | lo vencido y lo pendiente, de cualquier tipo | por hacer, con el adaptador «actos» |
| 3D | dónde está | hecho; color único vía Filters |
| Salida OData / Power BI | que cada organización haga sus informes | por hacer (patrón de Bentley y Procore) |
| **Cortes y reportes** | foto con fecha y huella; reportes al Estado (12-B, INFOBRAS, SEACE) | por hacer |

En la segunda pantalla, las caras son **paneles acoplables** (doc 37, fase 2) y el 3D se queda en la principal.

## 4 · Cortes con fecha: cómo hacerlo bien

**Qué se guarda:**
- una **foto periódica** (Kimball): en el cierre de un periodo, las medidas de cada fuente por sus dimensiones;
- la **versión** de cada fuente (versión del modelo, versión del itemizado);
- quién lo cerró y cuándo;
- su **huella** en la cadena sellada que ya existe.

**Por qué así y no con «viaje en el tiempo»:**
- Postgres no trae tablas versionadas por el sistema;
- un corte explícito es lo que pide la obra: la valorización del mes o el 12-B mensual;
- es pequeño, porque guarda resúmenes y no copias.

El modelo ya se guarda por versión, así que el detalle se puede reconstruir.

**Qué permite:**
- comparar meses;
- **el ritmo y la proyección** por regla explicada (doc «estadístico», sin IA);
- compartir un enlace de solo lectura, con su QR;
- generar el reporte al Estado desde ese corte.

## 5 · Rendimiento: medir antes de añadir motores

Tamaños reales conocidos:
- un frente: 8.378 elementos y 711 parámetros;
- los actos del ECD: miles por obra, no millones.

Con eso, **el cálculo en JavaScript del navegador basta**. El motor del Tablero ya agrupa 8.378 filas sin demora
visible, y los campos derivados tardan unos 30 ms con 20.000 elementos.

DuckDB-WASM o Perspective tienen sentido **si** llega el análisis **entre muchas obras**, con cientos de miles de filas.
Entonces mejor en el servidor (vistas resumidas en Postgres) que descargar varios MB al navegador. Hoy no hace falta.

## 6 · Riesgos y decisiones

**Riesgos**
- **Que cada fuente nombre distinto la misma cosa**: partida con y sin puntos, «Sector 3» y «Sector 03», empresa por
  nombre o por id. Es el problema que señala ASC 2024. Se resuelve en la capa de definiciones, con la regla a la vista.
- **Permisos entre organizaciones**: un tablero no puede enseñar lo que el ECD no deja ver.
- **Perfiles de despliegue**: Docs no sirve el Tablero ni la Planilla (§2).
- **Módulos CLOSED** (Filters, Saved Views): solo por sus puertas públicas.

**Decisiones del dueño**
1. ¿Se acepta esta arquitectura de cuatro capas como **el plan del centro de datos**, que une los docs 37, 40, 41 y 43?
2. ¿El centro de datos vive **solo en View** (que ya lee todo el ECD), o **también en Docs**? Lo segundo exige servir el
   Tablero y la Planilla en el perfil portal.
3. ¿Quién cierra un **corte** (el administrador de la obra, cualquier usuario) y si se firma?
4. Para saber qué fuentes ya tienen datos: **¿cuento las filas por obra en producción, solo lectura?**

## 7 · Orden propuesto (todos los documentos en uno)

| Fase | Qué | Doc |
|---|---|---|
| 0 | Rediseño del Tablero (hecho en local, falta tu visto bueno) | 41 |
| 1 | Tablero sobre el núcleo de la Planilla: fuente filtrada, momentáneo, color por Filters | 40 |
| 2 | **Capa de definiciones**: medidas y dimensiones compartidas; fuente «Partidas» | 44 §3.2 |
| 3 | **Adaptador «actos»** + lista de actos + indicadores de plazos y tiempo de ciclo | 43, 44 §3.1 |
| 4 | Paneles acoplables en la segunda pantalla (Planilla, Tablero, actos, Filters, vistas) | 37 fase 2 |
| 5 | Cortes con fecha y huella; ritmo y proyección | 44 §4 |
| 6 | Salida OData / Power BI con plantilla; IDS y BCF; reportes al Estado | 43 §6 |

## Fuentes

- Bentley:
  - [Reporting API, visión general](https://developer.bentley.com/apis/insights/) (leída entera);
  - [grupo Reporting & Insights](https://developer.bentley.com/api-groups/reporting-and-insights/);
  - [tutorial de informe con datos de iModel](https://developer.bentley.com/tutorials/creating-an-insights-report-using-imodel-data/)
- Autodesk:
  - [AEC Data Model, resumen para desarrolladores](https://aps.autodesk.com/en/docs/aecdatamodel/v1/developers_guide/overview/) (no se dejó leer);
  - [AEC Magazine, la estrategia de datos granulares](https://aecmag.com/technology/autodesks-granular-data-strategy/) (leída entera);
  - [disponibilidad general del AEC Data Model](https://aps.autodesk.com/blog/general-availability-aec-data-model-api-here)
- Capa semántica:
  - [Cube, qué es una capa semántica](https://cube.dev/articles/what-is-a-semantic-layer) (leída entera);
  - [dbt Semantic Layer](https://www.getdbt.com/blog/build-centralize-and-deliver-consistent-metrics-with-the-dbt-semantic-layer)
- Kimball Group:
  - [técnicas de modelado dimensional](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/);
  - [foto acumulada](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/accumulating-snapshot-fact-table/) (leída entera);
  - [Design Tip 130, fotos acumuladas en flujos complejos](https://www.kimballgroup.com/2010/12/design-tip-130-accumulating-snapshots-for-complex-workflows/)
- Postgres a una fecha:
  - [extensión `periods`](https://pigsty.io/ext/e/periods/);
  - [tablas versionadas por el sistema en Postgres](https://postgresweekly.com/link/150942/web)
- Motores en el navegador:
  - [DuckDB-Wasm (VLDB 2022)](https://db.in.tum.de/~kohn/papers/duckdb-wasm-vldb22.pdf);
  - [DuckDB-Wasm, anuncio](https://duckdb.org/2021/10/29/duckdb-wasm);
  - [Perspective (FINOS)](https://perspective.finos.org/)
- Autodesk Tandem: [separar el panel de inventario](https://app.learn-one.autodesk.com/learn/ondemand/tutorial/detach-the-inventory-panel)
- Y las fuentes de los docs 37, 40, 41 y 43 (Aconex, Procore, Revizto, Speckle, Power BI, IDS, BCF, MEF 12-B, INFOBRAS,
  SEACE, ASC 2024)
