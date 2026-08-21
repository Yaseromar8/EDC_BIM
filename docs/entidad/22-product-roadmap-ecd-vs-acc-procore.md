# PRODUCT ROADMAP — ECD vs ACC / PROCORE

**20-ago-2026** · Sobre el commit `ae22e58`
**No se ha modificado código.** Es diagnóstico funcional y decisión de producto.

> ⚠ **TRES REVISIONES.** Ver [23 — Revisiones y alcance de la Generación 1](23-revisiones-y-alcance-generacion-1.md).
> 1. **§4.4 corregido: RFI NO se fusiona con Issue.** Lo comprobé en los datos, no
>    solo en el esquema: los RFI tienen ciclo de vida (`En revisión` 6, `Respondido` 1)
>    y los redlines nacen cerrados (33 de 33). Se comparte un **motor de encargo**;
>    RFI, Review, Issue y Transmittal siguen siendo objetos distintos. `Redline`
>    evoluciona a **Issue/Markup**, no a RFI.
> 2. **§4.1 corregido: no se añade `project_users.role`.** Mezclaría cinco conceptos.
>    El modelo mínimo es una tabla `project_companies(project_id, company_id, funcion)`
>    y la función de una persona se **deriva**.
> 3. **§8 corregido: Cost Management pasa de «NO NECESARIO» a REEVALUAR** tras la
>    Generación 2. Lo físico (metrado, avance, valorización) es nuestro; lo
>    financiero (SIAF, INFOBRAS) no.

---

## 0 · La conclusión, antes de los detalles

### El siguiente paso es PROFUNDIZAR, no añadir un módulo

El producto tiene hoy **una decena de flujos de colaboración a medio construir y
ninguno completo**. Añadir Submittals, Punch List o Formularios daría trece flujos
a medio construir.

Y la pieza que falta **no es un módulo: es la persona.**

> Todo en este producto está organizado por **obra** y por **carpeta**.
> **Nada** está organizado por *quién debe hacer qué*.
>
> Medido: de los cuatro módulos de colaboración —`reviews`, `rfis`, `redlines`,
> `transmittals`— **ninguno tiene un solo endpoint que responda «¿qué está
> esperando por mí?»**. Todos listan por `model_urn`.

En ACC y en Procore, *eso* es el producto. Se entra y se ve lo que uno debe. Aquí
se entra y se ven carpetas. Esa diferencia no se cierra con módulos nuevos: se
cierra dándole al sistema el concepto de **encargo**.

**Lo bueno es que casi todo el dato ya está.** `doc_reviews.steps` ya lleva los
revisores, `doc_rfis.responsable` ya existe, `transmittals.recipients` y `acuses`
ya existen, y `mailer.enviar()` ya funciona —lo usan las invitaciones y los
transmittals—. Lo que falta es **atarlo a las personas y darle plazo**.

---

## 1 · Estado real actual, dominio por dominio

Medido sobre la base de desarrollo (filas = *¿se ejercita?*, no volumen de
producción) y sobre las rutas registradas.

### Dónde está de verdad el peso del producto

```
lob_element_links   31.894      ← el 4D LOB es, con diferencia, lo más desarrollado
inventory_assets    20.844
lob_activities       6.567
lob_partidas         4.515
lob_cost_items       3.010
lob_avance           2.157
doc_partidas         1.498
lob_progress_entries 1.438
plan_entregas        1.108
─────────────────────────
doc_redlines            33
doc_rfis                25
file_emisiones          13
doc_reviews              1      ← los flujos de colaboración están apenas tocados
transmittals             1
daily_reports            1
dashboards               1
photo_evidences          0
```

**Eso es un dato estratégico, no una curiosidad.** El centro de gravedad real de
este producto no es el gestor documental: es **el motor 4D de obra lineal con
metrados y avance**. Y eso es justamente lo que ACC y Procore hacen *mal*, porque
están pensados para edificación, no para obra lineal con progresivas y frentes.

### Rutas por módulo — dónde hay profundidad y dónde no

```
documents.py      48   auth.py      25   digital_twin.py  18   projects.py  12
compare.py         8   lob4d.py      8   pins.py           7   uploads.py    6
─────────────────────────────────────────────────────────────────────────────
transmittals.py    3   rfis.py       3   reviews.py        3   redlines.py   3
```

Tres rutas por flujo de colaboración: **crear, listar, actuar**. Eso es el
esqueleto de un flujo, no un flujo.

---

## 2 · Clasificación por dominio

### 🟢 YA ESTÁ SÓLIDO — no merece trabajo importante ahora

| dominio | qué hay | por qué está sólido |
|---|---|---|
| **Documents** | `file_nodes` + `file_versions`, 48 rutas, permisos por carpeta con herencia, estados ISO 19650 (WIP/SHARED/PUBLISHED/ARCHIVED), códigos de idoneidad configurables por obra (13 en catálogo), nomenclatura configurable, SHA-256 por versión | Es un CDE ISO 19650 de verdad. Identidad separada de contenido y de almacenamiento. La inmutabilidad del contenido está garantizada **en SQL** |
| **Versions** | `version_number`, `sha256`, `huella_en`, `codigo_idoneidad`, `codigo_revision`, `emitida_en/por` | El versionado ya lleva la trazabilidad contractual, no solo la técnica |
| **Usuarios / auth** | 2FA TOTP cifrado en reposo, sesiones con pimienta, `auth_events`, invitaciones por correo, códigos de recuperación | Endurecido y probado |
| **Auditoría** | `activity_log` de solo anexar, encadenada | Suficiente para un piloto |
| **Exportación** | Índice xlsx + descarga masiva + SHA-256 por versión + copia/restauración ensayada | Un cliente puede irse con sus datos. Poca gente lo tiene |
| **Permisos** | Membresía por obra + `folder_permissions` con herencia + política declarada por endpoint + aislamiento probado en ambos sentidos | Cerrado en el núcleo mínimo |
| **Models / Viewer** | `model_config` (17), `inventory_assets` (20.844), `saved_views` (14), comparador, extracción | Funciona y tiene datos reales |

### 🟡 EXISTE PERO DEBE MADURAR — hay base útil, falta convertirla en capacidad profesional

| dominio | qué hay | qué le falta para ser profesional |
|---|---|---|
| **Reviews** | Motor multi-paso real: `items`, `steps`, `current_step`, `history`, `final_status`, `cerrada_en`. Comprueba que el revisor no sea el autor | **Plazos. Notificación. Recordatorio. Bandeja del revisor.** Hoy nadie se entera de que tiene una revisión: `reviews.py` **no llama al mailer** |
| **RFIs** | 25 filas reales. `codigo, titulo, estado, responsable, respuesta, fecha_respuesta` | Plazo, *ball-in-court*, lista de distribución, vínculo a documento/modelo/progresiva, impacto en plazo o costo |
| **Redlines** | 33 filas, **todas cerradas y todas con respuesta**. Esquema idéntico a `doc_rfis` pero uso distinto | Evoluciona a **Issue/Markup** con ubicación, ligada a `pdf_markups`. **No se fusiona con RFI** — ver [23 §1](23-revisiones-y-alcance-generacion-1.md) |
| **Transmittals** | `number, subject, recipients, items, notificado, acuses`. **Sí notifica** por correo | Cerrar el círculo del acuse: quién no ha acusado, recordatorio, y qué versión exacta recibió cada quien |
| **Emisiones** | `file_emisiones` (13): versión → destino con idoneidad y revisión | Es la pieza contractual y está casi lista. Le falta el informe: «qué se emitió, a quién, cuándo, con qué código» |
| **Project directory** | `project_users(project_id, user_id, assigned_at)` + `companies` (4) + `job_titles` (10) | **Es binario: se está o no se está. NO tiene rol.** Ver §3 |
| **4D / LOB** | El módulo más rico en datos: importación de duraciones/metrados/cronograma, versionado inmutable de datasets, zonas lineales con progresivas, enlaces a 31.894 elementos | Es una tubería de **importar y visualizar**. No cierra el bucle: el avance entra por importación, no desde la obra |
| **Planificación** | `plan_entregas` (1.108), `doc_partidas` (1.498) | Existe el plan de entregas (MIDP/TIDP). Falta ligarlo al cumplimiento real y avisar de vencimientos |
| **Campo** | `tracking_pins` (30) con posición 3D, `geo_control_points`, AR | `tracking_progress` y `photo_evidences` están **vacíos**. `daily_reports` es un esqueleto (1 fila) |
| **Reportes** | `dashboards` (1) con motor de gráficos sobre inventario | Un dashboard configurable no es un informe. Falta el informe que una entidad presenta |

### 🔴 NO EXISTE (y hay que decidir si debe existir)

| | estado |
|---|---|
| **Issues** como modelo de primera clase | **No existe** — pero su forma existe **dos veces** (`doc_rfis` y `doc_redlines` son idénticas) |
| **Bandeja personal / ball-in-court** | **No existe ni un endpoint** en los cuatro módulos de colaboración |
| **Roles por obra** | No existe la columna |
| **Submittals** | No existe |
| **Formularios / inspecciones / checklists** | No existe |
| **Punch list / observaciones de cierre** | No existe |
| **Notificación de flujo de trabajo** | El mailer existe; solo lo usan invitaciones y transmittals |
| **Reuniones, licitación, costos/órdenes de cambio** | No existen |

---

## 3 · La dependencia que manda sobre todas

> **Sin directorio de obra con roles, ningún flujo de colaboración puede ser
> profesional.** Y como `project_users` no tiene columna `role`, hoy no se puede
> expresar «la Supervisión aprueba el paso 2» ni «distribuir a todos los
> Residentes».

Esto merece una rectificación explícita: en el informe [19](19-nucleo-minimo-profesional.md)
**bajé los roles por obra a DESPUÉS**, y era correcto **como cimiento de
seguridad** — membresía + rol global + permisos de carpeta ya cubren el
aislamiento. Pero como **prerrequisito funcional vuelve a subir**, y por otra
razón completamente distinta: no para impedir accesos, sino para **poder asignar
trabajo**.

La cadena, y hay que respetarla en este orden:

```
Directorio de obra con roles
        ↓
Encargo con responsable y plazo  (ball-in-court)
        ↓
Notificación y recordatorio      (el mailer YA existe)
        ↓
Reviews · Issues · Transmittals se vuelven flujos de verdad
        ↓
Submittals   ← proponerlo antes de esto sería construir sobre nada
```

**Por eso NO propongo Submittals ahora**, aunque sea lo primero que un cliente que
venga de ACC pregunte. Un Submittal es una Review con tipo contractual y
responsable: sin Reviews maduras y sin directorio, sería una tabla más.

---

## 4 · GENERACIÓN 1 — «El expediente se mueve»

**Bloque: PRODUCT CORE + COLLABORATION.** Propósito único: *que el sistema sepa
quién debe hacer qué, y cuándo.*

### 4.1 · Directorio de obra con roles

| | |
|---|---|
| **1 · Qué problema resuelve** | Hoy no se puede decir a quién le toca nada. La pertenencia es binaria y el rol es global a la instancia: un `editor` lo es en todas sus obras |
| **2 · Qué ya existe** | `project_users`, `companies` (4), `job_titles` (10), invitaciones por correo funcionando, permisos de carpeta con herencia |
| **3 · Qué falta** | Rol **por obra** (Residente, Supervisor, Proyectista, Contratista, Entidad), empresa participante por obra, y que el rol se pueda usar como destinatario («la Supervisión») |
| **4 · Por qué antes que lo demás** | Todo lo de abajo lo necesita. Y es aditivo: `ALTER TABLE ADD COLUMN role`, sin migración |
| **5 · Dependencias** | Ninguna. Es la raíz |
| **6 · Qué aprenderíamos del piloto** | Cuántos roles de verdad usa una obra pública peruana. Sospecho que 4 o 5, no los 20 de ACC |
| **7 · Referencia ACC/Procore** | El **Project Directory** de Procore y los **roles de proyecto** de ACC. En ambos, el directorio es la tabla de la que cuelga todo lo demás |
| **8 · Qué NO construir aún** | Permisos granulares por rol y herramienta (la matriz de ACC). Basta rol + permisos de carpeta, que ya existen |

### 4.2 · Bandeja personal (*ball-in-court*)

| | |
|---|---|
| **1 · Qué problema resuelve** | **El más grande de todos.** Nadie sabe qué le toca. Se entra y se ven carpetas |
| **2 · Qué ya existe** | Los datos: `doc_reviews.steps` lleva revisores, `doc_rfis.responsable`, `transmittals.recipients` y `acuses`, `plan_entregas` con fechas |
| **3 · Qué falta** | **Una consulta transversal por persona** y su pantalla. Ni un endpoint la tiene hoy |
| **4 · Por qué antes** | Es lo que convierte un repositorio en una plataforma de ejecución, y es lo más barato de todo el roadmap: **el dato ya está** |
| **5 · Dependencias** | 4.1 para que «lo mío» incluya lo dirigido a mi rol |
| **6 · Qué aprenderíamos** | Si la gente vuelve al sistema por sí sola. Es *la* métrica de un CDE: uso recurrente sin que nadie obligue |
| **7 · Referencia** | El *ball-in-court* de Procore y el panel **My Work** de ACC. En los dos, la portada del producto es una lista de deudas |
| **8 · Qué NO construir aún** | Notificaciones dentro de la aplicación, panel configurable, móvil. Correo + una pantalla |

### 4.3 · Reviews maduras (plazo, aviso, recordatorio)

| | |
|---|---|
| **1 · Qué problema resuelve** | Una revisión que nadie sabe que existe no es un flujo de aprobación: es una fila |
| **2 · Qué ya existe** | **Mucho.** Motor multi-paso con historial, transición de estado ISO al aprobar, control de que el revisor no sea el autor, `codigo_idoneidad` y `cerrada_en`. Y `mailer.enviar()` funciona |
| **3 · Qué falta** | Plazo por paso, aviso al entrar el turno, recordatorio al vencer, y **conectar el mailer, que hoy `reviews.py` no llama** |
| **4 · Por qué antes** | Porque es lo más completo que hay a medio hacer. Rematarlo es barato y es el flujo que sostiene la promesa ISO 19650 |
| **5 · Dependencias** | 4.1 y 4.2 |
| **6 · Qué aprenderíamos** | Cuántos pasos usa de verdad una revisión de expediente público. Y si el plazo se respeta o solo se registra |
| **7 · Referencia** | **ACC Reviews** — el módulo que este ya imita, y su propio docstring lo dice |
| **8 · Qué NO construir aún** | Plantillas de flujo, aprobaciones condicionales, firma digital |

### 4.4 · Issues — `Redline` evoluciona a Issue · **el RFI NO se fusiona** (ver [23](23-revisiones-y-alcance-generacion-1.md))

| | |
|---|---|
| **1 · Qué problema resuelve** | `doc_rfis` y `doc_redlines` tienen **el mismo esquema exacto** y las mismas tres rutas. Es un primitivo duplicado: dos veces el mantenimiento, dos veces los defectos, dos pantallas que hacen lo mismo |
| **2 · Qué ya existe** | Las dos tablas, con 58 filas reales entre ambas, y el patrón pregunta → responsable → respuesta ya funcionando |
| **3 · Qué falta** | Un modelo con **tipo** (RFI · Observación · No conformidad · Redline), plazo, *ball-in-court*, y vínculo a documento, elemento del modelo o **progresiva** |
| **4 · Por qué antes** | Porque no es construir: es **consolidar**. Y porque el vínculo a progresiva es nuestro diferencial: una observación en el PK 634+20, no «en el plano 12» |
| **5 · Dependencias** | 4.1 y 4.2. La fusión de datos es aditiva: tipo con valor por defecto y las dos tablas conviven mientras haga falta |
| **6 · Qué aprenderíamos** | Qué proporción son consultas al proyectista y qué proporción son observaciones de campo. Eso decide la Generación 2 |
| **7 · Referencia** | **ACC Issues** (un modelo con tipos) frente a Procore (RFIs y Observations separados). **ACC acierta más para nosotros**: menos superficie, misma capacidad |
| **8 · Qué NO construir aún** | Issues en móvil sin conexión, plantillas por tipo, flujos de aprobación de cierre |

### 4.5 · Cerrar el círculo del acuse en Transmittals

| | |
|---|---|
| **1 · Qué problema resuelve** | En obra pública, «se le entregó» es una afirmación contractual. Hoy se registra pero no se persigue |
| **2 · Qué ya existe** | Casi todo: `recipients`, `items`, `notificado`, `acuses`, y **ya envía correo** |
| **3 · Qué falta** | Quién no ha acusado, recordatorio, y un certificado imprimible de emisión con la versión y el código exactos |
| **4 · Por qué antes** | Es el flujo más cerca de estar terminado y el de mayor valor contractual demostrable ante una entidad |
| **5 · Dependencias** | 4.1 para poder emitir «a la Supervisión» en vez de a una lista de correos escrita a mano |
| **6 · Qué aprenderíamos** | Si el acuse por correo le vale a una entidad pública o exige otra cosa |
| **7 · Referencia** | Los **Transmittals** de Procore y las **Issued Sheets** de ACC |
| **8 · Qué NO construir aún** | Firma electrónica avanzada, sellado de tiempo cualificado |

---

## 5 · GENERACIÓN 2 — «La obra se mide»

**Bloque: PROJECT CONTROLS + FIELD.** Propósito: *cerrar el bucle entre lo
planificado y lo ejecutado* — que es donde está nuestro diferencial y donde ACC y
Procore son más débiles para obra lineal.

| # | qué | por qué aquí y no antes |
|---|---|---|
| **5.1** | **El avance entra desde la obra, no por importación.** Hoy `lob_avance` (2.157) y `lob_progress_entries` (1.438) se llenan importando un fichero | Necesita la Generación 1: sin responsable ni plazo, un parte de avance no tiene autor ni compromiso |
| **5.2** | **Parte diario de verdad.** `daily_reports` existe con `weather`, `personnel_count`, `tasks_completed` — y **1 fila** | Es el corazón del Field de Procore, y es el dato que alimenta 5.1 |
| **5.3** | **Fotos de campo georreferenciadas.** `photo_evidences` está **vacía**; `tracking_pins` (30) ya guarda posición 3D | La infraestructura existe, el flujo no |
| **5.4** | **Valorización: metrado ejecutado frente a contractual, por frente y progresiva** | `lob_partidas` (4.515) y `lob_cost_items` (3.010) ya tienen el lado contractual |
| **5.5** | **Informe de avance por frente y progresiva** | Esto es lo que una entidad pública pide todos los meses, y hoy se hace fuera del sistema |

**Por qué esta generación es nuestro foso y no una copia.** ACC y Procore están
construidos para edificación: pisos, habitaciones, especialidades. Nuestro modelo
ya tiene `lob_linear_zones` con `station_start`/`station_end`, `project_frentes`
(22) y alineamientos de Civil 3D. **Un avance en el PK 634+20 no se expresa bien
en ninguno de los dos productos de referencia.** Ahí no competimos: hacemos algo
que ellos no hacen.

---

## 6 · GENERACIÓN 3 — «El expediente se entrega»

**Bloque: CLOSEOUT + el resto de COLLABORATION.**

| # | qué | dependencia que ahora sí está satisfecha |
|---|---|---|
| **6.1** | **Submittals** (aprobación de materiales y equipos) | Reviews maduras + directorio con roles (Gen. 1) |
| **6.2** | **Formularios e inspecciones de calidad (protocolos)** | Field real (Gen. 2) |
| **6.3** | **Punch list / observaciones de cierre** | Issues unificadas (Gen. 1) + Field (Gen. 2) |
| **6.4** | **As-built y dossier de liquidación** | Todo lo anterior: es la suma sellada |
| **6.5** | **Entrega de activos al operador** | `inventory_assets` (20.844) ya es el inventario |

---

## 7 · ESCALA FUTURA — no antes de varios clientes

Account tipado y membresía de cuenta · Plantillas de proyecto · Plano de control ·
*Pooled* multi-inquilino · SSO/SAML · Facturación y medición de consumo · API
pública y webhooks · Móvil sin conexión · Roles y permisos granulares por
herramienta · Informes entre obras.

Todo esto está justificado en los informes [19](19-nucleo-minimo-profesional.md)
§«MUCHO DESPUÉS» y [21](21-vocabulario-y-clave-de-referencias.md) §1.

---

## 8 · NO NECESARIO PARA NUESTRO PRODUCTO

Cosas que ACC o Procore tienen y que **no debemos copiar**, cada una con su motivo:

| | por qué no |
|---|---|
| ~~**Gestión de costos y órdenes de cambio**~~ · **RECLASIFICADO a REEVALUAR DESPUÉS** (ver [23 §3](23-revisiones-y-alcance-generacion-1.md)) — solo la parte **financiera** queda fuera | En obra pública peruana el dinero se mueve por SIAF, INFOBRAS y los procedimientos de contrataciones del Estado. Duplicar ese circuito sin ser el sistema de registro oficial crea dos verdades sobre el dinero — el peor sitio para tener dos verdades. **Lo nuestro es el metrado y el avance físico**, que sí alimentan la valorización |
| **Licitación / *bid management*** | Ocurre antes de la ejecución y fuera de nuestro alcance. Y en obra pública lo gobierna el portal del Estado |
| **Detección de interferencias propia** | Navisworks y ACC lo hacen, nuestros clientes ya lo tienen, y competir ahí es caro y sin premio. Lo que sí aporta valor es **federar y registrar** la interferencia como Issue con su progresiva |
| **Traducción y visualización propia de modelos** | La licencia de Autodesk está pagada y funciona. Reconstruirlo no añadiría ni un usuario |
| **Módulo de reuniones y actas** | Se hace en Word y se sube al CDE. Un módulo aquí compite con una costumbre, no con una carencia |
| **Marketplace de integraciones** | No hay a quién integrar todavía |
| **Chat / mensajería** | WhatsApp existe. Perderíamos |
| **Plantillas de proyecto avanzadas** | Con menos de cinco obras, copiar la configuración a mano es más rápido que mantener un motor de plantillas |

---

## 9 · Evolución por generaciones

```
PRODUCTO ACTUAL
   CDE ISO 19650 (documentos · versiones · estados · idoneidad · emisiones)
   + visor 3D con inventario (20.844 activos)
   + motor 4D de obra lineal (60.000+ filas: metrados, cronograma, avance, enlaces)
   + auditoría, exportación verificable, copia y restauración ensayadas
   + aislamiento entre obras que bloquea de verdad
   PERO: nada está organizado por persona. El expediente no se mueve solo.

→ GENERACIÓN 1 · «EL EXPEDIENTE SE MUEVE»          [PRODUCT CORE + COLLABORATION]
   Propósito: que el sistema sepa quién debe hacer qué y cuándo.
     1. Directorio de obra con roles
     2. Bandeja personal (ball-in-court)
     3. Reviews con plazo, aviso y recordatorio
     4. Issues unificadas (fusionar RFI + Redline, con vínculo a progresiva)
     5. Transmittals: cerrar el círculo del acuse
   Casi todo es PROFUNDIZAR y CONSOLIDAR. Solo el rol y la bandeja son nuevos.

→ GENERACIÓN 2 · «LA OBRA SE MIDE»                 [PROJECT CONTROLS + FIELD]
   Propósito: cerrar el bucle entre lo planificado y lo ejecutado.
     1. El avance entra desde la obra, no por importación
     2. Parte diario real
     3. Fotos de campo georreferenciadas
     4. Metrado ejecutado vs contractual, por frente y progresiva
     5. Informe de avance que la entidad pueda presentar
   Aquí está el diferencial: obra lineal, que ACC y Procore no cubren bien.

→ GENERACIÓN 3 · «EL EXPEDIENTE SE ENTREGA»        [CLOSEOUT + COLLABORATION]
     Submittals · Protocolos e inspecciones · Punch list · As-built · Activos

→ ESCALA FUTURA                                    [ENTERPRISE / SaaS]
     Account · Plantillas · Plano de control · Pooled · SSO · Facturación · API
```

---

## 10 · El MVP profesional recomendado

### «Un CDE ISO 19650 donde el expediente se mueve solo»

Es **PRODUCTO ACTUAL + GENERACIÓN 1**. Lo que se le puede enseñar a una entidad
sin fingir nada:

| se presenta como | y es cierto porque |
|---|---|
| Entorno Común de Datos ISO 19650 con estados y códigos de idoneidad | Ya está construido y probado |
| Cada documento con su versión, su huella SHA-256 y su historia | Ya está, y la inmutabilidad se garantiza en la base |
| Revisión y aprobación con responsables, plazos y aviso | Generación 1 |
| Emisión formal con acuse de recibo | Generación 1, sobre lo que ya existe |
| Consultas y observaciones con responsable y plazo, localizables en el modelo y en la progresiva | Generación 1 |
| Visor 3D federado con el inventario de activos | Ya está |
| Aislamiento entre obras, auditoría y exportación verificable | Ya está y está probado |
| **Modelo 4D de obra lineal con metrados y avance** | Ya está, y **es lo que nos distingue** |

### Y lo que hay que decir que **todavía no** somos

Sin control de costos ni órdenes de cambio · sin submittals · sin formularios de
inspección · sin punch list · sin móvil sin conexión · sin SSO corporativo · sin
informes entre obras.

**Decirlo es parte de la venta.** Un CDE completo con un 4D lineal que ACC no
tiene es una propuesta seria. Un «ACC peruano» a medias no lo es.

---

## 11 · Recomendación: el próximo bloque a construir

# La bandeja personal, y el rol de obra que la hace posible

Es decir: **4.1 + 4.2 de la Generación 1**, y nada más, hasta que estén.

**Por qué exactamente eso:**

1. **Es la carencia más grande y la más barata.** No hay un solo endpoint que
   responda «¿qué me toca?» — y el dato para responderlo **ya está guardado** en
   `doc_reviews.steps`, `doc_rfis.responsable`, `transmittals.recipients` y
   `plan_entregas`.
2. **Es lo que cambia la naturaleza del producto.** De repositorio a plataforma de
   ejecución. Ningún módulo nuevo hace eso.
3. **Desbloquea los otros tres.** Reviews, Issues y Transmittals se vuelven flujos
   reales en cuanto existen responsable y plazo, y no antes.
4. **Es aditivo.** Una columna `role` y una consulta transversal. Sin migración,
   sin tocar documentos, sin riesgo para el núcleo recién cerrado.
5. **Da la métrica que decide todo lo demás:** si la gente vuelve al sistema por su
   cuenta. Si con bandeja no vuelven, ningún módulo adicional lo va a arreglar, y
   más vale saberlo con un cliente que con diez.

**Y lo que deliberadamente NO se construye en ese paso:** notificaciones dentro de
la aplicación, panel configurable, móvil, plantillas de flujo, permisos
granulares por rol, y **Submittals** — por muy alto que suene en la lista de quien
venga de ACC.

---

**Fin del roadmap. No se ha modificado código ni se ha implementado nada.**
