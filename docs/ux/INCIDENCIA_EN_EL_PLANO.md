# «Contar» se convierte en «Incidencia» en el plano — INVESTIGACIÓN DE ACC Y PROPUESTA PROPIA (29-oct-2026)

Solo análisis, sin código. El dueño: «creo que [Contar] no nos funcionaría así. Creo que podemos transformarlo a como
funciona una incidencia en ACC; podemos investigar un *issue* para hacerlo nuestro».

Sigue a docs/ux/REVISION_DE_PLANOS_REFORZAR.md (R1–R6) y a docs/ux/MARCAS_REVISION_LO_PROFESIONAL.md (observación
desde una marca). Regla: **integral**. Los tipos, las causas y los campos los configura la cuenta, no el código.

## 1 · Cómo funciona una incidencia en ACC (leído en la ayuda oficial)

**Crear** (ayuda de Build, «Create Issues», leída entera):
- Desde la herramienta Incidencias, desde el móvil, **importando hasta 500 desde Excel o CSV**, **como marca sobre una
  hoja o un archivo**, o como referencia desde un RFI, un submittal o un activo.
- **Desde una plantilla** opcional: las tres últimas usadas, o se busca por nombre.
- **Colocación**: en la hoja o el modelo 3D se elige la herramienta de incidencia y el tipo, y **se hace clic para poner
  el pin**:
  - se genera **una miniatura con el pin** de la vista actual, que se puede retomar o marcar;
  - **una incidencia va en un solo archivo u hoja**;
  - cada una recibe **el número siguiente**.
- **Campos**:
  - **obligatorios**: título, estado y tipo (agrupado en categorías);
  - el **tipo puede exigir más campos**;
  - **de serie**: descripción, **asignado a** (persona, rol o **empresa**; quien se asigna pasa a ser **observador**),
    **observadores** (personas, roles o empresas), **ubicación** (solo las configuradas en el proyecto) y su detalle,
    **inicio y fecha límite**, **causa raíz** (de una lista) y adjuntos;
  - **campos propios del tipo**.

**Estados** (ayuda de BIM 360 Document Management, leída):
- **Conjunto básico** (coordinación, diseño): Borrador, Abierta, Respondida, Cerrada.
- **Conjunto de campo** (observación, punch list, calidad, seguridad): Borrador, Abierta, **Trabajo terminado**,
  **Esperando inspección**, **No aprobada**, **En disputa**, Cerrada, Anulada.
- **El tipo decide qué estados se pueden usar.**
- **Solo quien la creó o el administrador ve los borradores y puede cerrarla.** El asignado puede pasarla a
  «Respondida» o «Trabajo terminado», pero **no cerrarla**.
- Hoy Build ofrece al crear Abierta, Pendiente, En revisión y Cerrada.

**Configuración del proyecto** (ayudas y guías):
- **tipos y subtipos**, **campos propios**, **causas raíz** y **plantillas**;
- las plantillas prellenan tipo, estado inicial, asignado, ubicación, causa raíz, descripción, campos propios y
  observadores, **pero no las fechas ni la colocación**.

**Permisos** (guía de consultor): ver todas, crear, ver y crear, y control total, por persona, **rol o empresa**. Todos
ven lo que se les asignó.

**Informes** (ayuda de Build):
- **Resumen**, en Excel o PDF: estado, n.°, tipo, asignado, causa raíz, fechas, título, ubicación y descripción;
- **Detalle**, en PDF: con campos propios, **fotos** y referencias.

## 2 · Lo que ya tenemos (leído en el código)

| ACC | ALEPHIA hoy | Dónde |
|---|---|---|
| Incidencia con número, tipo, responsable, plazo y ubicación | ✓ `doc_issues`: código, tipo, título, descripción, **responsable**, **verificado por**, `vence_en`, ubicación, **progresiva** (ACC no la tiene), evidencia, historial | `backend/flujo_de_issue.py`, sql/16 |
| Estados del conjunto de campo | ✓ casi iguales, y **como actos de quien le toca**: **Abierta → Corregida** (el responsable, **con evidencia**) **→ Verificada** (quien la levantó) · **Reabierta** (con motivo) · **Anulada** (con motivo) | `flujo_de_issue.py` |
| Solo quien la crea o el administrador cierra | ✓ verifica quien la levantó | ídem |
| Tipos | ◐ **Lista cerrada en el código**: punch, no conformidad, calidad, seguridad (y observación con la migración 37). El propio código dice «configurarlos es GAP 11 grande» | `flujo_de_issue.py` línea 67 |
| Crearla desde una marca | ✓ en local: «Crear observación» desde una nube o una flecha | `ObservacionDeMarca.jsx` |
| Pin en la hoja | ✗ — hoy la incidencia cuelga de una marca, no es un pin propio | — |
| Borrador | ✗ | — |
| En disputa | ✗ | — |
| Observadores, causa raíz, campos propios, plantillas, importar de Excel | ✗ | — |
| Miniatura con el pin | ✗ | — |
| Informe resumen y detalle | ◐ el módulo de incidencias lista; la matriz con fotos está propuesta en R1 | — |
| Aviso al responsable | ✓ encargo en «Mi trabajo» | `encargos` |

**Conclusión:** el **motor ya es como el de ACC**, y en dos cosas mejor: estados como actos con evidencia, y
progresiva. Falta **ponerlo en el plano como herramienta** y **dejar que la cuenta lo configure**.

## 3 · La propuesta: la herramienta «Incidencia»

### 3.1 · En el estuche

- **«Contar» sale del estuche** y en su lugar entra **«Incidencia»**, en un grupo nuevo **«Revisar»**, junto a «Sello».
- Las marcas de conteo que ya existan **se siguen viendo**. Es lo mismo que se hizo con Marco y Lápiz el 16-oct.
- **Un clic en la hoja = un pin numerado** (ISS-012) con el color de su estado. Se abre el panel de la derecha.

### 3.2 · El panel

| Campo | Cómo |
|---|---|
| **Tipo** | De la **lista de la cuenta** (con categorías). El tipo decide qué campos son obligatorios y qué estados tiene |
| Título y descripción | Con **frases frecuentes** de la cuenta (R5) |
| **Responsable** | Persona, **rol o empresa** de la obra |
| **Observadores** | Personas, roles o empresas; reciben aviso |
| **Plazo** | Fecha, o días hábiles desde hoy |
| **Ubicación** | Lista de ubicaciones de la obra + **progresiva** si la obra tiene eje (lo propio) |
| **Causa raíz** | Lista de la cuenta |
| Campos propios | Los del tipo, definidos por la cuenta |
| **Fotos y referencias** | La foto es un documento de la obra (como hoy); las referencias a otros documentos |
| **Miniatura** | Recorte automático de la zona con el pin, que va en el informe |

**Plantillas de incidencia de la cuenta**: «Falta cota», «No coincide con metrado», «Interferencia»… Prellenan todo
menos las fechas y la posición, como en ACC.

### 3.3 · Los estados (los nuestros, con dos añadidos de ACC)

| Estado | Lo hace | Exige |
|---|---|---|
| **Borrador** (nuevo) | Quien la crea; solo la ve él y el administrador | — |
| **Abierta** | Quien la crea, al publicarla o al **emitir la ronda** (R2) | Responsable y plazo |
| **Corregida** | El responsable | **Evidencia**: el documento o la versión corregida |
| **En disputa** (nuevo) | El responsable, si no está de acuerdo | **Motivo** |
| **Verificada / cerrada** | Quien la levantó | — |
| **Reabierta** | Quien la levantó | Motivo |
| **Anulada** | Quien la levantó o el administrador | Motivo |

«En disputa» importa en obra pública: deja escrito el desacuerdo, con su fecha, en vez de perderlo en un correo.

### 3.4 · Lo que la hace nuestra

1. **Una sola incidencia en el plano y en el 3D.** La misma `doc_issues` se ve con su pin en la hoja de Docs y, si se
   coloca en el modelo, en View. Es el mismo número y el mismo historial.
2. **Progresiva**: en obra lineal, cada incidencia lleva su progresiva. En el centro de datos (doc 44) se ven las
   incidencias **a lo largo del eje**.
3. **Pasa a la versión nueva**: con una versión nueva del plano, el pin aparece en el mismo sitio. Al verificar se ve
   **la zona antes y después** (R3).
4. **Estados como actos con evidencia**: no se cierra sin documento corregido y no se reabre sin motivo, y todo va a la
   cadena sellada.
5. **Rondas** (R2): las incidencias de una entrega forman una ronda con su n.° de informe y su plazo. La ronda
   siguiente hereda las no cerradas con su número.
6. **Matriz e informe** (R1): el resumen en Excel o PDF y el detalle con miniatura y fotos, que es la «matriz de
   levantamiento de observaciones» de la práctica peruana. Las columnas las elige la cuenta.

### 3.5 · Una sola idea en lugar de dos

Hoy hay **marca → observación** (en local). Con esto queda **un solo concepto, «incidencia»**, que nace de dos formas:
- con un **pin**: lo nuevo, lo rápido;
- **desde una marca** (nube, flecha): cuando hay que dibujar qué está mal.

Las dos son la misma `doc_issues`, con su origen. El tipo «Observación de documento» de la migración 37 pasa a ser uno
más de la lista de la cuenta.

## 4 · Qué haría falta construir

| # | Qué | Base |
|---|---|---|
| 1 | **Tipos, causas raíz, campos propios y plantillas configurables por cuenta**, con la lista cerrada de hoy como valores de partida (el «GAP 11» que anota el código) | migración aditiva |
| 2 | **Colocación**: hoja, versión, coordenadas del pin y miniatura en la incidencia | migración aditiva, sobre la 36 (marcas por versión) |
| 3 | Estados **Borrador** y **En disputa** | `flujo_de_issue.py` |
| 4 | **Observadores** | migración aditiva |
| 5 | Herramienta «Incidencia» en el estuche y panel | `PDFViewer.jsx`, `PdfToolsOverlay.jsx` |
| 6 | Informe resumen y detalle | R1 |
| 7 | Importar desde Excel | después |
| 8 | Pin en el 3D de View | después |

**Antes:** aplicar las migraciones **36 y 37** y probar lo que ya está en local.

## 5 · Decisiones del dueño

1. ¿**Quitamos «Contar»** del estuche y ponemos **«Incidencia»** en un grupo «Revisar»?
2. ¿Los estados del §3.3, con **Borrador** y **En disputa** añadidos?
3. ¿Unificamos **marca → observación** y **pin** en un solo concepto «incidencia»?
4. ¿Tipos, causas, campos y plantillas **los configura cada cuenta**, partiendo de la lista de hoy?

## Fuentes

- Autodesk Build:
  - [Create Issues](https://help.autodesk.com/cloudhelp/ENU/Build-Issues/files/Issues_Create.html) (leída entera)
  - [Issue Templates](https://knowledge.autodesk.com/support/build/learn-explore/caas/CloudHelp/cloudhelp/ENU/Build-Issues/files/configure-issues/Issues-Templates-html.html) (503; solo resumen)
  - [Issue Reports](https://help.autodesk.com/view/BUILD/ENU/?guid=Issue_Reports)
  - [Assign and Track Issues (blog de Autodesk)](https://www.autodesk.com/blogs/construction/assign-track-issues/)
- BIM 360:
  - [Issues in Document Management FAQ](https://help.autodesk.com/cloudhelp/ENU/BIM360D-Document-Management/files/To-Work-with-Document-Management/BIM360D_Document_Management_To_Work_with_Document_Management_Issues_in_Document_Management_FAQ_Reference_html.html) (leída)
  - [estados que no se pueden elegir](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Specific-issue-status-cannot-be-selected-in-BIM-360.html)
- APS:
  - [API de incidencias, GET issues](https://aps.autodesk.com/en/docs/acc/v1/reference/http/issues-issues-GET)
  - [ejemplo de incidencias con pin](https://github.com/autodesk-platform-services/aps-bim360-issues)
- Permisos (guías):
  - [Autodesk Learn, permisos en Issues](https://www.autodesk.com/learn/ondemand/tutorial/defining-permissions-in-issues)
  - [IMAGINiT, buenas prácticas de permisos](https://resources.imaginit.com/construction/acc-best-practice-part-2-permission-set-up)
- ALEPHIA:
  - `backend/flujo_de_issue.py`
  - `backend/sql/16_gap11core_issues.sql` y `backend/sql/37_observacion_de_documento.sql`
  - `frontend-docs/src/components/ObservacionDeMarca.jsx`
