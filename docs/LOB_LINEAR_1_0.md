# LOB Linear 1.0

Estándar de planificación, simulación y control para proyectos de construcción lineal.

## Objetivo

LOB Linear conecta ubicación, tiempo, costo, recursos, BIM y avance de campo usando una identidad común. Aplica a carreteras, ferrocarriles, canales, tuberías, túneles y líneas de transmisión.

El estándar complementa, no reemplaza, las fuentes contractuales. Primavera P6 continúa siendo la fuente del cronograma; Metrados/Valorizaciones, la fuente de cantidades y avance; APS, la fuente del modelo federado; Civil 3D, la fuente geométrica de ejes y perfiles.

## Identidad obligatoria

| Dominio | Identificador |
| --- | --- |
| Organización/obra | `project_id` canónico |
| Frente | `scope_urn` / `front_id` |
| Dataset | UUID + versión inmutable |
| Actividad | `activity_id` de P6 |
| Partida | `codigo` EDT/DSI |
| Elemento BIM | `source_urn` + `external_id` |
| Ubicación | `alignment_id` + rango `station_start/station_end` |
| Zona | `scope_urn` + `zone_code` |
| Escenario | UUID |

No se permiten datasets globales ni vínculos por coincidencia parcial de nombres.

## Modelo espacio-tiempo

- El eje se expresa internamente en una unidad continua de estación.
- Cada zona tiene un rango no vacío `[station_start, station_end]`.
- Cada partida productiva debe vincularse a un rango de estación, directamente o por proyección de sus elementos BIM al eje.
- Las actividades se representan con fecha inicial/final y rango espacial.
- La pendiente en el diagrama tiempo-ubicación representa el ritmo de producción.
- Los conflictos se evalúan por superposición temporal, espacial y de recursos.

## Fuentes de verdad

1. Cronograma vigente P6: fechas, estado y relaciones lógicas.
2. Línea base aprobada: versión contractual separada del cronograma vigente.
3. Metrados y valorizaciones: cantidades, precios y avance certificado.
4. Inventario APS: vínculo elemento-partida y propiedades DSI.
5. Civil 3D: eje, perfil y geometría de referencia.
6. Campo: eventos diarios de producción, progresiva y evidencia.

Una importación crea una versión nueva. Nunca modifica la versión anterior.

## Mínimo para iniciar un proyecto

1. Tipo de infraestructura.
2. Eje o rango de progresivas.
3. Longitud de sector de producción.
4. Calendario y jornada.
5. Metodología constructiva inicial.
6. Cuadrillas y rendimientos iniciales.
7. Dataset P6/Metrados, cuando exista.

El asistente genera zonas, metodología y recursos como plantilla. Los rendimientos deben ser calibrados y aprobados antes de usarse como plan contractual.

## Estados 4D

| Estado | Regla |
| --- | --- |
| Pendiente | Sin inicio real ni avance a la fecha de corte |
| Programado | Inicio planificado posterior a la fecha de corte |
| En ejecución | Inicio real o avance mayor que cero, sin terminación |
| Ejecutado | Terminación real o avance físico mayor o igual a 99.5% |

El fin planificado por sí solo nunca convierte una actividad en ejecutada.

## Escenarios

- `contractual`: cronograma del contrato.
- `baseline`: línea base aprobada.
- `working`: plan de trabajo vigente.
- `what_if`: alternativa no aprobada.
- `actual`: reconstrucción as-built.

Solo un escenario puede estar activo por frente. La aprobación debe registrar usuario y fecha.

## Estructura de datos

- `lob_linear_profiles`: configuración del sistema lineal.
- `lob_linear_zones`: estructura de ubicaciones.
- `lob_linear_methodologies` y `lob_linear_methodology_steps`: secuencias reutilizables.
- `lob_linear_resources`: cuadrillas, equipos y capacidades.
- `lob_linear_scenarios`: baselines, plan vigente y alternativas.
- `lob_activity_relations`: lógica FS/SS/FF/SF importada de P6.
- `lob_linear_progress_events`: producción y evidencia de campo.
- `lob_datasets`: versiones inmutables de cronograma/costo/avance.
- `lob_locations`: rango espacial de cada partida.
- `lob_element_links`: vínculo exacto de BIM con partida y actividad.

## API principal

- `GET /api/lob/linear/state`: estado y auditoría de preparación.
- `POST /api/lob/linear/bootstrap`: configuración inicial estandarizada.
- `POST /api/lob/linear/scenarios`: creación de baseline o escenario.
- `POST /api/lob/linear/progress`: registro de avance de campo.
- `POST /api/lob/import`: publicación versionada de P6/Metrados.
- `POST /api/lob/locations`: persistencia de rangos por progresiva.
- `POST /api/lob/links/rebuild`: reconstrucción de vínculos BIM.

## Gobierno empresarial

- PostgreSQL almacena datos estructurados y auditoría.
- GCS almacena los archivos fuente inmutables.
- Alembic gobierna el esquema.
- El acceso se valida por proyecto.
- Cada cambio relevante registra usuario, fecha, alcance y versión.
- Las plantillas pueden reutilizarse, pero una metodología contractual debe aprobarse por proyecto.

## Contrato de interfaz

- El selector de frente/EDT es el único estado de alcance operativo.
- Simulación 4D, Línea de Balance, Matriz de Avance y Control de Obra consumen exactamente ese alcance.
- El explorador lateral de partidas permanece visible en todas las vistas operativas.
- Seleccionar una partida la resalta en los diagramas y aísla sus elementos vinculados en APS.
- La fecha de corte es compartida por simulación, estados, avance, riesgos y control económico.
- Ninguna vista puede calcular estados con una copia local o una fuente distinta del timeline activo.

## Controles tiempo-ubicación

- El ritmo espacial se expresa como longitud de progresiva por día (`m/día`).
- Una interferencia potencial existe cuando dos partidas distintas se superponen simultáneamente en fecha y ubicación.
- Los solapes se muestran como alertas, no como conflictos confirmados: deben validarse contra cuadrillas, accesos y restricciones.
- Los datasets sin progresivas conservan un modo heredado por zonas EDT, claramente identificado como menor nivel de madurez.
- El cálculo visual limita la cantidad de marcadores sin descartar el conteo ni la información persistida.

## Evolución prevista

1. Editor interactivo de zonas, metodologías, relaciones y recursos.
2. Ampliar el detector actual de solapes tiempo-ubicación con capacidad y disponibilidad real de recursos.
3. Generación y nivelación de escenarios.
4. Look-ahead de 3/6 semanas y restricciones.
5. Captura móvil/offline y conciliación de avance.
6. Reportes ejecutivos, curva S, SPI/CPI y análisis de demoras.
