# TRES REVISIONES, Y EL ALCANCE EXACTO DEL PRIMER BLOQUE

**20-ago-2026** · Revisa el roadmap [22](22-product-roadmap-ecd-vs-acc-procore.md)
**No se ha implementado nada.**

---

# 1 · RFI no debe fusionarse con Issue. Tenía razón usted.

## Por qué me equivoqué

Recomendé fusionarlos porque medí que `doc_rfis` y `doc_redlines` tienen **el
mismo esquema y los mismos tres endpoints, byte a byte**. De ahí concluí «es el
mismo primitivo duplicado».

**Esquema idéntico no es semántica idéntica.** Es exactamente el error que llevo
toda la revisión corrigiendo en otros sitios: juzgar por la forma en vez de por el
comportamiento. Y el comportamiento estaba en los datos, que no miré:

| | `doc_rfis` (25) | `doc_redlines` (33) |
|---|---|---|
| Prefijo de código | `RFI-` | `RL-` |
| Estados en uso | `Cerrado` 18 · **`En revisión` 6** · **`Respondido` 1** | `Cerrado` 33 — **y nada más** |
| Con respuesta | 19 de 25 | **33 de 33** |

**Los RFI tienen ciclo de vida; los redlines no.** Un redline nace y muere cerrado,
siempre con respuesta: es un **registro de observación resuelta sobre un plano**.
Un RFI está vivo, tiene alguien pensándoselo, y seis de ellos están ahora mismo en
revisión. Son dos objetos de negocio distintos que comparten esquema **por
accidente de implementación**, no por naturaleza.

## La arquitectura correcta: motor común, objetos distintos

```
                    MOTOR DE ENCARGO           ← esto es lo que se comparte
        (responsable · plazo · ball-in-court · aviso · cierre)
                            │
      ┌──────────┬──────────┼──────────┬──────────────┐
      ▼          ▼          ▼          ▼              ▼
    REVIEW      RFI      ISSUE /    TRANSMITTAL   (mañana: SUBMITTAL)
                        OBSERVACIÓN
   aprueba   pregunta    detecta      emite
   versiones formalmente  y cierra    formalmente
```

Cada uno conserva **lo que le hace ser lo que es**:

| objeto | lo que NO comparte con los demás |
|---|---|
| **RFI** | Numeración formal propia (`RFI-###`), respuesta **oficial** distinta de los comentarios, estados propios, impacto declarado en plazo o costo, y puede **referenciar** un Issue |
| **Review** | Secuencia de pasos, transición de estado ISO 19650 al aprobar, código de idoneidad resultante |
| **Issue / Observación** | Ubicación (elemento del modelo, plano, **progresiva**), tipo, y cierre por verificación |
| **Transmittal** | Destinatarios, acuse de recibo, y la versión exacta que recibió cada quien |

Esto coincide con las referencias: **ACC** tiene un *RFI Tool* separado de *Issues*
—con Ball-in-Court, Manager/Reviewer y respuesta oficial— y un RFI puede
referenciar un Issue. **Procore** separa RFI de Observations, Punch e Inspections.
Ninguno de los dos los fusiona, y no es casualidad: **el RFI es un objeto
contractual**, y un objeto contractual no puede compartir numeración ni estados
con una observación de campo.

## Redline → Issue / Markup, no → RFI

Sí, y por tres razones medidas:

1. **Se comporta como observación, no como consulta**: nace cerrado, siempre con
   respuesta, sin estados intermedios.
2. **Se levanta contra un plano**, que es la definición de una observación con
   ubicación.
3. **Ya existe `pdf_markups`** (la geometría del marcado) como tabla aparte. El
   redline es la **observación**; el markup es **dónde está dibujada**. Son las dos
   mitades del mismo Issue, y hoy viven en dos sitios que no se hablan.

**Evolución recomendada:** `doc_redlines` → **Issue con tipo `REDLINE`**, ligado a
su `pdf_markups` cuando lo tenga. Los 33 registros históricos se conservan tal
cual y pasan a ser Issues cerradas de ese tipo. **`doc_rfis` no se toca.**

> **Corrección al roadmap 22 §4.4.** Donde decía «Issues unificadas — fusionar RFI
> y Redline» debe leerse: **motor de encargo común, y `Redline` evoluciona a
> `Issue`. El RFI permanece como objeto formal independiente.**

---

# 2 · Project Directory: cinco conceptos que hoy están mezclados

## Lo que hay, y por qué avisa usted bien

Miré las dos tablas que ya existen y **las dos ya están semánticamente sucias**:

```
companies    (1,'SINOHYDRO')  (2,'S&P')  (4,'INTERFERENCIAS')  (5,'x')
                                              ↑ eso no es una empresa,
                                                es el nombre de una obra

job_titles   CALIDAD · PRODUCCION · COSTOS · PLANEAMIENTO · BIM ·
             OFICINA TECNICA · SEGURIDAD · AMBIENTAL · SOCIAL · x
                    ↑ eso no son cargos: son ÁREAS o disciplinas
```

Y **las dos cuelgan de `users`**, no de la obra (`routes/auth.py:123-124`). Es
decir: la empresa y el «cargo» de una persona son globales a la instancia.

Añadir ahora un `project_users.role` habría metido en una sola columna las cinco
cosas que siguen. Habría sido **exactamente el error que este proyecto acaba de
pasar tres semanas deshaciendo** con `project_id`.

## Los cinco conceptos, separados

| # | concepto | ejemplo | de qué depende | ¿existe hoy? |
|---|---|---|---|---|
| 1 | **Empresa** | SINOHYDRO | de la persona | `users.company_id` — **sí** |
| 2 | **Función contractual** | Contratista · Supervisión · Entidad · Proyectista | **de la empresa EN ESA OBRA** | **no** |
| 3 | **Área / disciplina** | Calidad · Producción · BIM | de la persona | `users.job_title_id` — sí, mal nombrado |
| 4 | **Responsabilidad de flujo** | «quién puede recibir esta revisión» | de 2 | **se deriva, no se declara** |
| 5 | **Permiso** | qué puede hacer | del rol global + carpeta | **sí, y NO SE TOCA** |

**La clave está en el 2: la función contractual es una propiedad de (empresa ×
obra), no de la persona.** SINOHYDRO es contratista en esta obra y podría ser otra
cosa en la siguiente. Y «emitir a la Supervisión» significa *a las personas cuya
empresa ejerce de Supervisión en esta obra* — que es **derivable**, no una columna
más.

## El modelo mínimo: UNA tabla

```sql
project_companies
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE
    company_id   INTEGER NOT NULL REFERENCES companies(id)
    funcion      TEXT NOT NULL   -- ENTIDAD | SUPERVISION | CONTRATISTA |
                                 -- PROYECTISTA | OTRO
    PRIMARY KEY (project_id, company_id)
```

*(cumple el vocabulario congelado del informe [21](21-vocabulario-y-clave-de-referencias.md):
`project_id` con clave ajena real.)*

Con eso, y **sin ninguna columna nueva en `project_users`**, se responden las tres
preguntas:

| pregunta | cómo se responde |
|---|---|
| ¿A qué empresa pertenece? | `users.company_id` — ya existe |
| ¿Cuál es su función en la obra? | la `funcion` de su empresa en esa obra — derivada |
| ¿Qué responsabilidades puede recibir? | un encargo se dirige **a una persona** o **a una función** |

### Lo que deliberadamente NO se añade

- **`project_users.role`** — sería la columna ambigua. La función se deriva; el
  permiso ya existe.
- **`project_users.cargo`** (Residente, Jefe de Supervisión) — hace falta el día
  que un flujo diga «lo aprueba el Residente» y no baste «lo aprueba la
  Supervisión». **El piloto lo dirá.** Añadirlo después es una columna aditiva.
- **Renombrar `job_titles` a `areas`** — es cosmético y tiene lectores. Se anota
  como deuda, no se toca ahora.
- **Empresa por obra** (una persona en dos empresas según la obra) — caso raro. Si
  aparece, se resuelve con una columna en `project_companies`, no rediseñando.
- **Cualquier cambio en permisos.** Función ≠ permiso. Mezclarlas es el error.

### Una advertencia de datos

`companies` tiene una obra (`INTERFERENCIAS`) y basura (`x`) dentro. Antes de que
la función contractual cuelgue de ahí, hay que limpiarlo. **Es decisión suya:** yo
no borro filas que puedan estar referenciadas por usuarios reales.

---

# 3 · Cost Management: de «NO NECESARIO» a «REEVALUAR DESPUÉS»

Aceptado, y con un matiz que conviene fijar ahora para no perderlo.

## Dónde está la línea

| **SÍ es nuestro** — control físico | **NO es nuestro** — registro financiero |
|---|---|
| Metrado contractual (`lob_partidas`, 4.515) | Ejecución presupuestal y devengado |
| Metrado ejecutado y avance (`lob_avance` 2.157, `lob_progress_entries` 1.438) | Asientos contables |
| Precios unitarios y valorización **física** (`lob_cost_items`, 3.010) | Pagos y tesorería |
| Adicionales y deductivos: **cuánta obra más o menos** | El expediente de contratación |
| Impacto en plazo de un RFI o una interferencia | La aprobación formal del adicional |

**El principio:** producimos **la cantidad y el avance**; SIAF e INFOBRAS registran
**el dinero**. Nuestra salida alimenta su proceso, no lo sustituye. Así no hay dos
verdades sobre el dinero — que era mi objeción, y sigue en pie *solo para la parte
financiera*.

## Por qué puede ser un diferencial

Porque el motor ya existe y tiene datos, y porque **la valorización de obra lineal
por frente y progresiva es justo lo que ACC y Procore no saben expresar**. Una
valorización mensual que sale sola del modelo, del metrado y del avance de campo
—con la trazabilidad hasta el elemento— es algo que hoy se hace en Excel en todas
las obras del país.

**Reclasificado:** Cost Management pasa de «NO NECESARIO» a **PROJECT CONTROLS —
REEVALUAR DESPUÉS DE LA GENERACIÓN 2**, cuando el avance entre desde la obra. Sin
avance real de campo, una valorización automática es una hoja de cálculo con más
pasos.

---

# 4 · ¿Sigue siendo correcto el primer bloque?

## Sí — y las revisiones lo refuerzan

Precisamente porque RFI, Review, Issue y Transmittal **siguen siendo cuatro objetos
distintos**, lo que comparten se vuelve más evidente y más valioso: **el encargo**.
Construirlo una vez y que lo usen los cuatro es mejor arquitectura que la fusión
que yo proponía.

El bloque se reformula así, y es el mismo con nombres más honestos:

```
Project Directory mínimo  →  Motor de encargo  →  Mi Trabajo
   (una tabla)              (una tabla, cuatro     (una consulta,
                             objetos la usan)       una pantalla)
```

## Alcance mínimo exacto

### DENTRO

| # | qué | detalle |
|---|---|---|
| **1** | `project_companies` | La tabla de §2. Más una pantalla para mantenerla |
| **2** | **`encargos`** — una tabla, el sistema de registro de «quién debe qué» | `(id, project_id → FK, objeto_tipo, objeto_id, destino_usuario \| destino_funcion, estado, vence_en, creado_por, creado_en, cerrado_en, cerrado_por)` |
| **3** | Conectar los **cuatro objetos que ya existen** | Review: abre encargo al entrar cada paso, lo cierra al aprobar. RFI: abre al asignar responsable, cierra al responder. Redline: igual. Transmittal: abre uno por destinatario, cierra con el acuse |
| **4** | **`GET /api/mi-trabajo`** | Una consulta transversal: lo dirigido a mí **o a mi función**, abierto, ordenado por vencimiento |
| **5** | Aviso y recordatorio | `mailer.enviar()` **ya existe y funciona** (`routes/auth.py:506`, `routes/transmittals.py:97`). Solo hay que llamarlo desde reviews, rfis y redlines, que hoy no lo hacen |
| **6** | Una pantalla: **Mi Trabajo** | Portada del usuario. Nada más |

### FUERA — deliberadamente

| | por qué |
|---|---|
| **Fusionar RFI con Issue** | Revisión 1 de este documento |
| **`project_users.role` o `.cargo`** | Revisión 2. La función se deriva |
| **Tocar permisos** | El núcleo mínimo acaba de cerrarse y está probado |
| **Cambiar la numeración o los estados del RFI** | Funcionan y tienen 25 registros reales |
| **Migrar `doc_redlines` a Issue** | Es la Generación 1 *después* de que el motor funcione. Primero el encargo, luego el objeto |
| **Notificaciones dentro de la aplicación** | Correo y una pantalla |
| **Panel configurable, filtros avanzados, móvil** | Una lista ordenada por vencimiento |
| **Plantillas de flujo** | El piloto dirá si hacen falta |
| **Submittals** | Necesita Reviews maduras. Generación 3 |
| **Cualquier cosa de costos** | Revisión 3: después de la Generación 2 |
| **Escalado, reasignación automática, delegación** | Complejidad de flujo sin un solo usuario que la haya pedido |

## El riesgo de diseño que hay que vigilar

Una tabla `encargos` **separada** de los objetos crea el riesgo de **dos verdades**:
que el `responsable` del RFI diga una cosa y el encargo abierto diga otra.

La regla que lo evita, y hay que escribirla antes de codificar: **el objeto es
dueño de su dato de dominio; el encargo se abre y se cierra únicamente desde las
transiciones del objeto, nunca por separado.** No habrá un endpoint para editar un
encargo a mano. Si aparece la tentación de tenerlo, es que el modelo está mal.

## Qué aprenderíamos del piloto

1. **Si la gente vuelve al sistema sin que nadie la obligue.** Es *la* métrica.
2. **Si «la Supervisión» basta como destinatario** o hace falta el cargo (`§2`).
3. **Qué proporción de encargos vence.** Si vence casi todo, el problema no es la
   herramienta.
4. **Si el correo sirve** en obra pública peruana o hace falta otra vía.

---

**Fin de las revisiones. No he implementado nada.**
