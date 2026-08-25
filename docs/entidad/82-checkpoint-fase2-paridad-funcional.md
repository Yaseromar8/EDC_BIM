# 82 · CHECKPOINT FASE II — PARIDAD FUNCIONAL ACC / PROCORE

**Fecha de consulta de todas las fuentes:** 24 de agosto de 2026.
**Naturaleza:** investigación y normalización. **No se implementó nada.**
**Método:** el benchmark se construyó ANTES de mirar ALEPHIA, desde documentación
oficial del fabricante. Ningún blog comparativo se usó como autoridad.

Marcas de evidencia, como en el doc 44:
**[D]** documentado directamente por el fabricante · **[I]** inferido de varias
fuentes oficiales · **[N]** no demostrado / decisión nuestra.

---

# 0 · HALLAZGO QUE OBLIGA A CORREGIR LA NOMENCLATURA

> ## Autodesk Construction Cloud ya no se llama así: es **AUTODESK FORMA** [D]

Tres pruebas independientes, todas de dominio Autodesk:

1. La página oficial «About Autodesk Construction Cloud» hoy dice: *«Autodesk
   Forma™ is an end-to-end, cloud-based, AI-native platform»*, y añade que las
   ofertas *«are unified by utilising **Forma Data Management** as the common
   data environment»*.
2. `construction.autodesk.com/products/autodesk-build/` responde **301** a
   `autodesk.com/products/forma-build/overview`.
3. `construction.autodesk.com/products/autodesk-docs/` responde **301** a
   `autodesk.com/products/forma-data-management/overview`.

**Correspondencia de nombres** *(afecta a los docs 43, 44, 54, 63, 64, 80 y 81,
que usan la nomenclatura anterior)*:

| nombre en nuestra investigación histórica | nombre oficial hoy |
|---|---|
| Autodesk Construction Cloud (ACC) | **Autodesk Forma** |
| Autodesk Docs | **Forma Data Management** |
| Autodesk Build | **Forma Build** |
| BIM Collaborate / Pro | **Autodesk Forma + Navisworks** (Model Management) |
| Autodesk Takeoff | **Forma Takeoff** |
| Pype AutoSpecs | **Forma AutoSpecs** |

Los hallazgos de **permisos** del doc 44 no quedan invalidados por el renombrado;
lo que cambia es el **catálogo**, que es justo lo que esta fase levanta. Uso «ACC»
y «Forma» como sinónimos por continuidad.

---

# 1 · ÁRBOL OFICIAL · AUTODESK FORMA (ex ACC)

## 1.1 · Productos de la plataforma [D]

```
AUTODESK FORMA
│
├─ FORMA DATA MANAGEMENT ......... el CDE; unifica el resto
├─ FORMA BUILD ................... ejecución de obra
├─ FORMA DESIGN COLLABORATION .... paquetes y compartición de diseño
├─ MODEL COORDINATION ............ coordinación e interferencias
├─ PRECONSTRUCTION ............... incluye FORMA TAKEOFF
├─ FORMA AUTOSPECS ............... especificaciones
├─ FORMA SITE DESIGN ............. diseño de emplazamiento
│
├─ INSIGHT ....................... analítica + Construction IQ (IA)
└─ ADMINISTRATION ................ miembros, permisos, PLANTILLAS,
                                   configuración de proyecto, autenticación

Integrados por API: Assemble · BuildingConnected · PlanGrid · Pype
```

## 1.2 · Herramientas, según el índice oficial de ayuda [D]

```
FORMA BUILD                        FORMA DATA MANAGEMENT
  Forma Mobile App                   Forma Mobile App
  Administration                     Administration
  My Home                            My Home
  Project Home                       Autodesk Assistant (IA)
  Sheets            ← PLANOS         Files
  Files                              Specifications
  Specifications    ← ESPECIF.       Reviews        ← APROBACIÓN DOCUMENTAL
  Autodesk Assistant (IA)            Transmittals
  Issues                             Issues
  Forms             ← FORMULARIOS    Reports
  Photos                             Members
  RFIs                               Forma Board
  Submittals                         Bridge         ← ENTRE PROYECTOS/HUBS
  Meetings                           Insight
  Correspondence
  Schedule
  Assets            ← ACTIVOS
  Reports
  Bridge
  Members
  Cost Management
  Insight
```

**Lo que NO aparece en el índice de Forma Build:** no hay *Daily Log* ni *Punch
List* como herramientas propias — el parte diario **no existe como tal** [D], y
el punch se resuelve dentro de **Issues** [I].

---

# 2 · ÁRBOL OFICIAL · PROCORE

Procore no organiza por «productos» sino por **NIVEL**. Conservo su estructura.

## 2.1 · Nivel PROYECTO — 52 herramientas, verbatim del user guide [D]

```
Action Plans · Project Admin · Agent Builder · Assist · Bidding · Budget ·
Change Events · Change Orders · Client Contracts · Commitments ·
Connection Manager · Coordination Issues · Correspondence · Clash Manager ·
Crews · Daily Log · Project Archive · Direct Costs · Project Directory ·
Document Management · Project Documents · Drawings · Emails ·
Project Equipment · Estimating · Forms · Funding · Home (Legacy) ·
Incidents · Project Inspections · Instructions · Invoicing · Project Map ·
Materials · Meetings · Models · Observations · Photos · Prime Contracts ·
Progress Billings · Project Overview · Punch List · Project 360 Reporting ·
RFIs · Project Schedule · Project Scheduling · Specifications · Submittals ·
Tasks · Project Timesheets · T&M Tickets · Transmittals
```

## 2.2 · Nivel EMPRESA — 22 herramientas, verbatim [D]

```
Company Admin · Analytics 2.0 · Bid Board · Conversations · Cost Catalog ·
Company Directory · Company Documents · ERP Integrations ·
Company Inspections · Payments · Permissions Tool · Planroom ·
Procore Home · Prequalification Portal · Prequalifications ·
Project Status Snapshots · Company 360 Reporting · Resource Planning ·
Company Schedule · Timecard · Company Timesheets · Workflows
```

## 2.3 · Dato estructural que ACC no tiene [D]

Procore mantiene **DOS herramientas documentales a la vez**: `Project Documents`
(clásica, con carpetas) y `Document Management` (nueva). La nueva **no tiene
carpetas**: organiza por *Saved Views* y *Collections*, captura metadatos por
*machine learning*, y **sus permisos se conceden por GRUPOS BASADOS EN METADATOS**
(estado, tipo, disciplina) en vez de por rol sobre carpeta. Su documentación
afirma que *«manages information in accordance with international standards such
as ISO 19650»*.

---

# 3 · FUENTES Y COBERTURA

## 3.1 · Fuentes primarias consultadas — todas el 24-ago-2026

| # | fabricante | documento | URL |
|---|---|---|---|
| 1 | Autodesk | About Autodesk Construction Cloud / Forma | help.autodesk.com/cloudhelp/ENG/Docs-About-ACC/files/About_Autodesk_Construction_Cloud.html |
| 2 | Autodesk | About Autodesk Build | help.autodesk.com/cloudhelp/ENG/Build-About/files/What_is_Build.html |
| 3 | Autodesk | Forma Build — índice de ayuda | help.autodesk.com/view/BUILD/ENU/ |
| 4 | Autodesk | Forma Data Management — índice de ayuda | help.autodesk.com/view/DOCS/ENU/ |
| 5 | Autodesk | Getting Started with Submittals | help.autodesk.com/cloudhelp/ENU/Build-Submittals/files/getting_started_submittals/Submittals_Overview.html |
| 6 | Autodesk | Create Form Templates · Fill Out and Submit Forms | help.autodesk.com/cloudhelp/ENU/Build-Forms/files/Build_Forms_templates_html.html |
| 7 | Autodesk | Create and Edit Approval Workflows (Reviews) | help.autodesk.com/cloudhelp/ENU/Docs-Reviews/files/getting-started-reviews/Reviews_Create_Edit.html |
| 8 | Autodesk | Add and Publish Sheets to the Field · Markups | help.autodesk.com/cloudhelp/ENU/Build-Sheets/files/Upload_And_Publish_Sheets.html |
| 9 | Autodesk | Issue Permissions · Issue Custom Fields | help.autodesk.com/cloudhelp/ENU/Build-Issues/files/configure-issues/Issues_Permissions.html |
| 10 | Autodesk | Work with Assets · Barcodes and QR Codes | help.autodesk.com/cloudhelp/ENU/Build-Assets/files/Assets_Work_with_Assets.html |
| 11 | Autodesk | About Bridge · Bridge Workflows | help.autodesk.com/cloudhelp/ENU/Build-Bridge/files/getting-started/About_Bridge.html |
| 12 | Autodesk | Cost: Budget and Contract Tables · CORs/OCOs/SCOs · Payments | help.autodesk.com/cloudhelp/ENU/Build-Cost/files/budgets-costs/Cost_Budget_and_Contract_Tables.html |
| 13 | Autodesk | Create Transmittals | help.autodesk.com/cloudhelp/ENU/Docs-Transmittals/files/Create_Transmittal.html |
| 14 | Autodesk | Sync and Download Projects (móvil / offline) | help.autodesk.com/cloudhelp/ENU/Build-Mobile/files/Download_Project_Mobile.html |
| 15 | Autodesk | Project Templates (Account Admin) | help.autodesk.com/view/DOCS/ENU/?guid=Account_Admin_Project_Templates |
| 16 | Autodesk | Single Sign-on and Directory Sync · Set up SSO | help.autodesk.com/view/DOCS/ENU/?guid=ACC_SSO_Directory_Sync |
| 17 | Autodesk | APS — Forma APIs (Issues, RFIs, Forms, Assets, Cost) | aps.autodesk.com/en/docs/acc/v1/overview/ |
| 18 | Autodesk | APS — Webhooks | aps.autodesk.com/apis-and-services/webhooks |
| 19 | Procore | Project-level tools (índice) | support.procore.com/products/online/user-guide/project-level |
| 20 | Procore | Company-level tools (índice) | support.procore.com/products/online/user-guide/company-level |
| 21 | Procore | Submittals | support.procore.com/products/online/user-guide/project-level/submittals |
| 22 | Procore | Inspections | support.procore.com/products/online/user-guide/project-level/inspections |
| 23 | Procore | Observations | support.procore.com/products/online/user-guide/project-level/observations |
| 24 | Procore | Punch List | support.procore.com/products/online/user-guide/project-level/punch-list |
| 25 | Procore | Daily Log | support.procore.com/products/online/user-guide/project-level/daily-log |
| 26 | Procore | Drawings | support.procore.com/products/online/user-guide/project-level/drawings |
| 27 | Procore | Specifications | support.procore.com/products/online/user-guide/project-level/specifications |
| 28 | Procore | Document Management | support.procore.com/products/online/user-guide/project-level/document-management |
| 29 | Procore | Workflows (empresa) | support.procore.com/products/online/user-guide/company-level/workflows |
| 30 | Procore | ¿Qué se copia de una plantilla de proyecto? | support.procore.com/faq/what-gets-copied-over-to-a-new-project-when-applying-a-project-template |
| 31 | Procore | 360 Reporting (proyecto y empresa) | support.procore.com/products/online/user-guide/company-level/reports |
| 32 | Procore | SSO: proveedores soportados · Custom SSO | support.procore.com/faq/which-sso-identity-providers-are-supported-by-procore |
| 33 | Procore | REST API v2 · Webhooks API | developers.procore.com/documentation/webhooks-api |

Se **suman** a las 14 fuentes del doc 44 (permisos, miembros, roles, plantillas,
cuenta), que siguen vigentes para el PLANO A. Total acumulado: **47 fuentes**.

## 3.2 · Cobertura honesta de ESTA investigación

| plano | cobertura |
|---|---|
| Catálogo de herramientas (qué existe) | **ALTA** — enumeración verbatim de ambos fabricantes |
| Comportamiento de capacidad | **ALTA** en Submittals, Forms, Inspections, Punch, Observations, Daily Log, Drawings, Specs, Sheets, Reviews, Document Management, Workflows, plantillas, SSO, API/webhooks, móvil |
| Comportamiento de capacidad | **MEDIA** en Cost/contratos, Meetings, Correspondence, Assets, Schedule, Coordination, Takeoff, Bidding |
| Precios, límites de escala, SLA | **NULA** — no se investigó; no hace falta para esta pregunta |
| Comportamiento real bajo uso | **NULA** — no tenemos cuenta en ninguno de los dos. Todo es documentación, no observación [N] |

---

# 4 · CAPACIDADES, AL NIVEL QUE SE PIDIÓ (no el nombre del módulo)

## 4.1 · SUBMITTALS

| | **FORMA BUILD** [D] | **PROCORE** [D] |
|---|---|---|
| Papeles | Responsible Contractor · Submittal Manager · Reviewers | Submitter · Approver(s) |
| Flujo | crear+asignar → enviar → el manager distribuye → respuestas → respuesta final, cerrar y distribuir | secuencial **o paralelo**, con reenvío entre revisores |
| Plantillas de flujo | — | **Submittal Workflow Templates**, heredables por plantilla de proyecto |
| Agrupación | **Spec Sections** (por trabajo) + **Packages** (por ubicación) | **Packages** con acciones masivas |
| Ball-in-Court | **explícito**, «current responsible party for action» | **explícito**, indicador dinámico |
| Plazos | días naturales o hábiles **calculados desde el cronograma** | «Submittal Schedule Calculations»: due date por paso desde la fecha «Submit by» |
| Origen | manual | **Submittal Builder: genera submittals DESDE LAS ESPECIFICACIONES** (con IA desde mar-2026) |
| Estados | respuestas personalizables | estados por defecto + **custom log statuses** |
| Revisiones | sí | sí, con historial |
| Privacidad | permisos configurables sobre quién crea | «Mark a Submittal as Private» |
| Permisos | por herramienta | **None / Read Only / Standard / Admin** + granulares |
| Móvil | sí | ver, descargar adjuntos, QR, compartir |

**ALEPHIA: ❌ no existe.** Ni tabla, ni ruta, ni pantalla.

## 4.2 · FORMULARIOS E INSPECCIONES

| | **FORMA BUILD — Forms** [D] | **PROCORE — Forms + Inspections** [D] |
|---|---|---|
| Quién crea plantillas | **solo project administrator** | nivel **empresa** o proyecto |
| Tipos | plantillas del *Template Builder* (secciones + preguntas: opción múltiple, texto…) **y PDF Forms rellenables** | plantillas con secciones y *line items* |
| Lógica condicional | no documentada [N] | **sí**, controla qué ítems se muestran según la respuesta |
| Exigencias por respuesta | — | un ítem puede **exigir foto, observación o firma** |
| Firmas | — | **múltiples firmantes**, y firma por ítem |
| Referencias | **bidireccionales** a fotos, issues y otros elementos | adjuntos, incl. ficheros de Document Management |
| Escalado | — | **«Create an Observation from an Inspection»** |
| Móvil | plantillas **sincronizan a la app** | iOS/Android |
| Permisos | Editor/Manager sobre la plantilla para poder crear un form | 4 niveles + granulares (reinspección, ver privadas) |

**ALEPHIA: ❌ no existe** ninguna de las dos.

## 4.3 · PUNCH / OBSERVACIONES

**Procore — Punch List** [D]: `Punch Item Managers` + asignados + **Final
Approvers**; estados `Draft · Open · In Dispute · Ready to Close · Closed`;
plazos con aviso automático de vencido; ligado a **planos y fotos**; plantillas;
4 niveles + granulares; móvil **con offline**; export PDF/CSV.

**Procore — Observations** [D]: tipos `quality · safety · commissioning ·
warranty · work to complete`; estados `Open · Ready for Review · Closed ·
Rejected`; distribución a grupos; ligado a **Locations**; creable **desde
inspections y desde punch**.

**Forma**: ambas se resuelven dentro de **Issues**, con **tipos y categorías
configurables, campos personalizados, causa raíz y estados configurables**, y
permisos asignables a **miembro, ROL o EMPRESA** [D].

**ALEPHIA: ❌ punch. 🟡 observaciones** — `doc_redlines` cubre la forma
(observación con responsable, respuesta y cierre) pero **sin tipos, sin campos
personalizados, sin causa raíz y sin ubicación**.

## 4.4 · PARTE DIARIO

**Procore — Daily Log** [D]: ~16 secciones (mano de obra, timecards, equipo,
entregas de material, clima, inspecciones, accidentes, violaciones de seguridad,
retrasos, productividad, residuos, llamadas, visitas, revisiones de plano,
cantidades); **las entradas de colaborador REQUIEREN APROBACIÓN**; **clima
automático** (servicio Dark Sky o estación en obra); las fotos suben solas al
tool Photos; ubicaciones multinivel; export PDF.

**Forma: no existe como herramienta** [D].

**ALEPHIA: 🟡** — `daily_reports` tiene cinco columnas útiles (`weather`,
`personnel_count`, `critical_issues`, `tasks_completed`, fecha). Sin secciones,
sin aprobación, sin clima automático, sin firma. Es un esqueleto, y así se
declaró ya en el doc 22.

## 4.5 · PLANOS Y ESPECIFICACIONES

**Procore — Drawings** [D]: sets y revisiones, comparar revisiones, ver
revisiones borradas, **OCR que rellena número y título** (y detecta la revisión
tras un punto o guion bajo), **markups personales vs publicados**, medidas a
1/32", enlaces entre hojas, y **vinculación de RFIs, observations, punch y
coordination issues A UNA POSICIÓN DEL PLANO**; móvil con offline.

**Forma — Sheets** [D]: publicación por **version sets** (sesión de publicación,
PDF o RVT); **los markups nacen NO PUBLICADOS y solo los ve su autor** — solo
quien tiene permiso `Create` o superior puede publicarlos; markups sobre
PDF/PNG/JPG y sobre elementos 2D de DWG y RVT.

**Specifications**: ambos tienen divisiones y secciones, **OCR al subir**, sets
con revisiones automáticas, y en Procore **generan submittals** [D].

**ALEPHIA: ❌ ambas.** Los planos son ficheros PDF dentro del expediente: no hay
objeto «plano» con número, revisión, set ni posición. Sí hay `pdf_markups` y
comparación de PDF, **pero sin la distinción personal/publicado**.

## 4.6 · REVISIÓN Y APROBACIÓN DOCUMENTAL

**Forma — Reviews** [D]: plantillas de **uno a seis pasos**
(`One Step Approval` … `Six Step Approval`); cada paso define **initiators,
reviewers y approvers**; tipo de revisor `Single Reviewer` o lista de
candidatos; y **el sujeto designado puede ser una persona, SU ROL o SU EMPRESA**.

**Procore — Workflows** (nivel empresa) [D]: motor transversal que gobierna
`Change Orders · Commitments · Prime Contracts · Custom Tools · Document
Management · Owner Invoices · Correspondence`; plantillas de empresa con pasos
por **rol**, plazos, **lógica condicional** (p. ej. importe sobre presupuesto) y
webhooks.

**ALEPHIA: 🟡** — `doc_reviews` es un motor multi-paso real (`steps` JSONB con
plazo por paso, `current_step`, historial, y comprobación de que el revisor no
sea el autor). **Lo que falta es la plantilla reutilizable**: cada revisión se
arma a mano. Y el motor **no es transversal**: no gobierna otros objetos.

## 4.7 · PLANTILLAS DE PROYECTO — el contraste que más importa

**Procore copia** [D]: empresas y **USUARIOS** («User data, Project Roles,
Contacts, Permissions»), herramientas activas, WBS y códigos de coste, ajustes
del proyecto, y plantillas de workflow con asignados.
**Procore NO copia** [D]: nombre/número/fechas/valor, daily logs, planos, fotos,
documentos subidos, facturas, estimaciones, órdenes de cambio, y **los permisos
de carpeta del tool Documents**. Textual: el template es *«a configuration
framework rather than a data replicator»*.

**Forma** [D]: las plantillas configuran *«members, standard files y mucho más»*;
se crean en blanco **o desde un proyecto existente**; se publican/despublican; y
los productos configurables dependen del acceso a producto **en la plantilla**.

> **Los dos fabricantes copian miembros. ALEPHIA decidió deliberadamente no
> hacerlo** (doc 80 §3). Esta investigación **confirma que la divergencia es
> real** — y que es una decisión, no un desconocimiento.

## 4.8 · MÓVIL Y OFFLINE

**Forma** [D]: se descarga el proyecto completo al dispositivo y **se trabaja sin
conexión**; opciones de descarga por carpeta y fichero; carpeta *For the Field*
accesible a todo miembro con permiso View; markups, issues y fotos en campo;
almacenamiento interno o externo.
**Procore** [D]: offline en drawings, punch, specs; daily log, inspections y
submittals en app nativa iOS/Android.

**ALEPHIA: ❌.** No hay app nativa, ni PWA, ni *service worker*, ni descarga
offline. Verificado en el repositorio: sin `manifest.json` ni `serviceWorker`.

## 4.9 · PLATAFORMA Y ESCALA

| capacidad | **FORMA** [D] | **PROCORE** [D] | **ALEPHIA** |
|---|---|---|---|
| API pública | APS / Forma APIs: Issues, RFIs, Submittals, Forms, Assets, Cost, Data Management, Account Admin | REST v2 con OAuth, rate limiting, sandbox | ❌ — `app_tokens` es el almacén del token **de Autodesk**, no una API para terceros |
| Webhooks | sí (`issue.created-1.0`…); **solo un Project Admin puede crearlos** | sí, con *deliveries* | ❌ |
| SSO empresarial | SAML 2.0 (Okta, Azure, OneLogin, ADFS) | cualquier IdP SAML 2.0, SP- e IdP-initiated | ❌ — solo login Google (consumo), no SAML |
| Aprovisionamiento | **Directory Sync** (con Business Success Plan) | **NO soportado** | ❌ |
| Multi-inquilino | sí (hubs/cuentas) | sí (empresas) | ❌ — 1 instancia = 1 entidad |
| Informes de cartera | Insight + Reports | **360 Reporting de EMPRESA**: cross-tool y cross-project, activos e inactivos | ❌ |

Detalle que conviene retener: **el SSO de Procore apunta por DOMINIO DE CORREO, y
un dominio solo puede apuntarse una vez en todo Procore** [D].

## 4.10 · LO QUE UN FABRICANTE TIENE Y EL OTRO NO

| capacidad | ACC/Forma | Procore |
|---|---|---|
| **Bridge** — compartir y **sincronizar automáticamente** contenido entre proyectos y hubs distintos, creando copias y notificando a ambos lados | **sí** [D] | no equivalente |
| **Directory Sync** de identidades | **sí** [D] | **no** («auto-provisioning is not supported») [D] |
| **Daily Log** | **no existe** [D] | **sí** [D] |
| **Punch List** como herramienta propia | no; vive en Issues [I] | **sí** [D] |
| **Prequalification / Bid Board / Planroom** | vía BuildingConnected (producto aparte) | **nativo a nivel empresa** [D] |
| **Documental sin carpetas, con permisos por metadatos** | no | **sí** (Document Management) [D] |
| **Workflow transversal configurable por el cliente** | por herramienta | **sí, motor único** (Workflows) [D] |

---

# 5 · DIAGRAMA MAESTRO — TRES PLANOS

```
════════════════════════════════════════════════════════════════════════════
 PLANO A · GOVERNANCE / AUTHORIZATION            (Fase I — doc 80, doc 81)
════════════════════════════════════════════════════════════════════════════
                                        ACC    PC     ALEPHIA
 Identity / Principal ................. ✅     ✅     ✅
 Account / Entity ..................... ✅     ✅     ✅
 Project Membership ................... ✅     ✅     ✅
 Company .............................. ✅     ✅     ✅
 Contractual Function ................. ❌     ❌     🔵  propio
 Entity Admin ......................... ✅     ✅     ✅
 Project Admin ........................ ✅     ✅     ✅
 Tool Activation ...................... ✅     ✅     ✅
 Member Tool Access ................... ✅     ✅     ✅
 Permission Profiles .................. ✅     ✅     ✅
 Project Templates .................... ✅     ✅     ✅  (no copia miembros)
 Resource Permission .................. ✅     ✅     ✅  closest-wins 🔵
 Workflow Authorization ............... ✅     ✅     ✅
 Responsibility / BIC ................. ✅     ✅     ✅  capa propia 🔵
 Account Roles ........................ ✅     ✅     ✅  (facultades, no tenencia)
 Identity & Access UX ................. ✅     ✅     🟡  sin tercero externo

                        PLANO A · ALEPHIA = 16/16, EXP 🟡

════════════════════════════════════════════════════════════════════════════
 PLANO B · FUNCTIONAL PRODUCT SURFACE                    (Fase II — ESTE doc)
════════════════════════════════════════════════════════════════════════════
                                        ACC    PC     ALEPHIA
 DOCUMENT MANAGEMENT
   expediente · versiones · ISO 19650 .. 🟡     ✅     ✅
   planos como objeto (sets/OCR) ....... ✅     ✅     ❌
   especificaciones .................... ✅     ✅     ❌
   revisión con plantillas ............. ✅     ✅     🟡
   transmittal con acuse ............... 🟡     🟡     ✅ 🔵
 COLLABORATION
   RFI ................................. ✅     ✅     🟡
   Submittals .......................... ✅     ✅     ❌
   Issues de 1ª clase .................. ✅     ✅     🟡
   Correspondencia ..................... ✅     ✅     ❌
   Reuniones ........................... ✅     ✅     ⚪
   Ball-in-Court ....................... ✅     ✅     ✅ 🔵
 QUALITY / SAFETY
   Formularios ......................... ✅     ✅     ❌
   Inspecciones/checklists ............. ✅     ✅     ❌
   Punch list .......................... 🟡     ✅     ❌
   Incidentes .......................... 🟡     ✅     ❌
 FIELD
   Parte diario ........................ ❌     ✅     🟡
   Fotos ............................... ✅     ✅     🟡
   Activos con QR ...................... ✅     🟡     🟡
   Móvil offline ....................... ✅     ✅     ❌
   Avance desde campo .................. ✅     🟡     🟡
 PROJECT CONTROLS
   Cronograma .......................... ✅     ✅     🟡
   Presupuesto ......................... ✅     ✅     🟡
   Contratos / órdenes de cambio ....... ✅     ✅     ❌
   Valorizaciones ...................... ✅     ✅     ⚪
   Metrados / takeoff .................. ✅     ✅     ✅
   Licitación .......................... ✅     ✅     ⚪
 DESIGN / MODEL
   Visor 3D federado ................... ✅     ✅     ✅
   Coordinación / clash ................ ✅     ✅     ⚪
   4D ligado a cronograma .............. ✅     🟡     ✅
   4D LINEAL con progresivas ........... ❌     ❌     🔵
   Topografía / mov. de tierras ........ 🟡     ❌     🔵
   Realidad aumentada .................. 🟡     ❌     🟡
 INSIGHT / REPORTING
   Informes por proyecto ............... ✅     ✅     🟡
   Informes de cartera ................. ✅     ✅     ❌
   IA / predictivo ..................... ✅     ✅     🟡

════════════════════════════════════════════════════════════════════════════
 PLANO C · ENTERPRISE / PLATFORM SCALE
════════════════════════════════════════════════════════════════════════════
                                        ACC    PC     ALEPHIA
 API pública .......................... ✅     ✅     ❌
 Webhooks ............................. ✅     ✅     ❌
 SSO SAML ............................. ✅     ✅     ❌
 Directory sync ....................... ✅     ❌     ❌
 Multi-inquilino ...................... ✅     ✅     ❌
 Compartir entre proyectos/hubs ....... ✅ Bridge  🟡   🟡
 Marketplace .......................... ✅     ✅     ⚪

           PLANO C · ALEPHIA = ausente por decisión con trigger escrito
```

---

# 6 · MATRIZ DE PARIDAD REAL

Distinta de la 01–16: aquí la unidad es la **capacidad**, no la capa.

**Leyenda:** ✅ equivalente demostrado · 🟡 parcial · ❌ ausente ·
⚪ decidido no adoptar · 🔵 diferencial propio.

**DOCUMENT MANAGEMENT**

| # | capacidad | ACC | PC | ALEPHIA | clasificación |
|---|---|:-:|:-:|:-:|---|
| 1 | Repositorio de ficheros con carpetas | ✅ | ✅ | ✅ | PARIDAD |
| 2 | Versionado con historial e inmutabilidad | ✅ | ✅ | ✅ | PARIDAD |
| 3 | Estados / idoneidad ISO 19650 | 🟡 | ✅ | ✅ | PARIDAD |
| 4 | Nomenclatura normalizada configurable | ✅ | ✅ | ✅ | PARIDAD |
| 5 | Permisos por carpeta con varios sujetos | ✅ | ✅ | ✅ | PARIDAD |
| 6 | Flujo de revision/aprobacion documental | ✅ | ✅ | 🟡 | GAP PARCIAL |
| 7 | Plantillas de flujo de revision reutilizables | ✅ | ✅ | ❌ | GAP REAL |
| 8 | Transmittal / emision formal | ✅ | ✅ | ✅ | EQUIVALENCIA POR OTRO DISEÑO |
| 9 | Acuse de recibo trazable por destinatario | 🟡 | 🟡 | ✅ | DIFERENCIACIÓN SUPERIOR |
| 10 | Planos como objeto (sets, revisiones, OCR) | ✅ | ✅ | ❌ | GAP REAL |
| 11 | Especificaciones como objeto | ✅ | ✅ | ❌ | GAP REAL |
| 12 | Markups sobre PDF/plano | ✅ | ✅ | 🟡 | GAP PARCIAL |
| 13 | Markup personal vs publicado | ✅ | ✅ | ❌ | GAP REAL |
| 14 | Comparacion de versiones | ✅ | ✅ | ✅ | PARIDAD |
| 15 | Compartir entre proyectos / cuentas | ✅ | 🟡 | 🟡 | GAP PARCIAL |
| 16 | Exportacion verificable del expediente | 🟡 | 🟡 | ✅ | DIFERENCIACIÓN SUPERIOR |

**COLLABORATION**

| # | capacidad | ACC | PC | ALEPHIA | clasificación |
|---|---|:-:|:-:|:-:|---|
| 17 | RFI | ✅ | ✅ | 🟡 | GAP PARCIAL |
| 18 | Submittals | ✅ | ✅ | ❌ | GAP REAL |
| 19 | Issues de primera clase (tipos, campos, causa raiz) | ✅ | ✅ | 🟡 | GAP PARCIAL |
| 20 | Reuniones y actas | ✅ | ✅ | ⚪ | DECISIÓN DE NO ADOPTAR |
| 21 | Correspondencia formal | ✅ | ✅ | ❌ | GAP REAL |
| 22 | Ball-in-Court / bandeja personal | ✅ | ✅ | ✅ | DIFERENCIACIÓN SUPERIOR |
| 23 | Aviso y recordatorio de flujo | ✅ | ✅ | ✅ | PARIDAD |

**QUALITY / SAFETY**

| # | capacidad | ACC | PC | ALEPHIA | clasificación |
|---|---|:-:|:-:|:-:|---|
| 24 | Formularios con plantillas configurables | ✅ | ✅ | ❌ | GAP REAL |
| 25 | Inspecciones/checklists con logica y firma | ✅ | ✅ | ❌ | GAP REAL |
| 26 | Observaciones de calidad/seguridad con ciclo | ✅ | ✅ | 🟡 | GAP PARCIAL |
| 27 | Punch list / observaciones de cierre | 🟡 | ✅ | ❌ | GAP REAL |
| 28 | Incidentes de seguridad | 🟡 | ✅ | ❌ | GAP REAL |

**FIELD**

| # | capacidad | ACC | PC | ALEPHIA | clasificación |
|---|---|:-:|:-:|:-:|---|
| 29 | Parte diario | ❌ | ✅ | 🟡 | GAP PARCIAL |
| 30 | Fotos de obra | ✅ | ✅ | 🟡 | GAP PARCIAL |
| 31 | Activos con QR/codigo de barras | ✅ | 🟡 | 🟡 | GAP PARCIAL |
| 32 | Movil con trabajo offline | ✅ | ✅ | ❌ | GAP REAL |
| 33 | Avance fisico capturado en obra | ✅ | 🟡 | 🟡 | GAP PARCIAL |

**PROJECT CONTROLS**

| # | capacidad | ACC | PC | ALEPHIA | clasificación |
|---|---|:-:|:-:|:-:|---|
| 34 | Cronograma | ✅ | ✅ | 🟡 | GAP PARCIAL |
| 35 | Presupuesto | ✅ | ✅ | 🟡 | GAP PARCIAL |
| 36 | Contratos / commitments | ✅ | ✅ | ❌ | GAP REAL |
| 37 | Ordenes de cambio | ✅ | ✅ | ❌ | GAP REAL |
| 38 | Valorizaciones / facturacion | ✅ | ✅ | ⚪ | DECISIÓN DE NO ADOPTAR |
| 39 | Metrados / takeoff | ✅ | ✅ | ✅ | EQUIVALENCIA POR OTRO DISEÑO |
| 40 | Licitacion | ✅ | ✅ | ⚪ | DECISIÓN DE NO ADOPTAR |

**DESIGN / MODEL**

| # | capacidad | ACC | PC | ALEPHIA | clasificación |
|---|---|:-:|:-:|:-:|---|
| 41 | Visor 3D federado | ✅ | ✅ | ✅ | PARIDAD |
| 42 | Coordinacion / deteccion de interferencias | ✅ | ✅ | ⚪ | DECISIÓN DE NO ADOPTAR |
| 43 | Inventario y atributos de elementos | ✅ | 🟡 | ✅ | PARIDAD |
| 44 | 4D ligado a cronograma | ✅ | 🟡 | ✅ | PARIDAD |
| 45 | 4D LINEAL con progresivas y frentes | ❌ | ❌ | 🔵 | DIFERENCIACIÓN SUPERIOR |
| 46 | Topografia / movimiento de tierras | 🟡 | ❌ | 🔵 | DIFERENCIACIÓN SUPERIOR |
| 47 | Realidad aumentada en obra | 🟡 | ❌ | 🟡 | GAP PARCIAL |
| 48 | Enlace vivo con la herramienta de autoria | ✅ | 🟡 | 🟡 | GAP PARCIAL |

**INSIGHT / REPORTING**

| # | capacidad | ACC | PC | ALEPHIA | clasificación |
|---|---|:-:|:-:|:-:|---|
| 49 | Informes por proyecto | ✅ | ✅ | 🟡 | GAP PARCIAL |
| 50 | Informes de cartera entre obras | ✅ | ✅ | ❌ | GAP REAL |
| 51 | Cuadros de mando configurables | ✅ | ✅ | 🟡 | GAP PARCIAL |
| 52 | IA / analitica predictiva | ✅ | ✅ | 🟡 | GAP PARCIAL |

**PLATFORM / INTEGRATIONS**

| # | capacidad | ACC | PC | ALEPHIA | clasificación |
|---|---|:-:|:-:|:-:|---|
| 53 | API publica | ✅ | ✅ | ❌ | GAP REAL |
| 54 | Webhooks | ✅ | ✅ | ❌ | GAP REAL |
| 55 | SSO SAML empresarial | ✅ | ✅ | ❌ | GAP REAL |
| 56 | Sincronizacion de directorio / aprovisionamiento | ✅ | ❌ | ❌ | GAP REAL |
| 57 | Multi-inquilino | ✅ | ✅ | ❌ | GAP REAL |
| 58 | Marketplace de integraciones | ✅ | ✅ | ⚪ | DECISIÓN DE NO ADOPTAR |

**GOVERNANCE / ADMIN**

| # | capacidad | ACC | PC | ALEPHIA | clasificación |
|---|---|:-:|:-:|:-:|---|
| 59 | Plantillas de proyecto | ✅ | ✅ | ✅ | EQUIVALENCIA POR OTRO DISEÑO |
| 60 | Directorio de proyecto | ✅ | ✅ | ✅ | PARIDAD |
| 61 | Perfiles de permiso reutilizables | ✅ | ✅ | ✅ | PARIDAD |
| 62 | Activacion de herramientas por obra | ✅ | ✅ | ✅ | PARIDAD |
| 63 | Acceso a herramienta por miembro | ✅ | ✅ | ✅ | PARIDAD |
| 64 | Funcion contractual como sujeto de permiso | ❌ | ❌ | 🔵 | DIFERENCIACIÓN SUPERIOR |
| 65 | Resolucion de conflicto de permisos explicable | ❌ | ❌ | 🔵 | DIFERENCIACIÓN SUPERIOR |
| 66 | Auditoria de solo anexar | 🟡 | 🟡 | ✅ | DIFERENCIACIÓN SUPERIOR |
| 67 | Triaje de seguridad ISO 19650-5 | ❌ | ❌ | 🔵 | DIFERENCIACIÓN SUPERIOR |
| 68 | MIDP/TIDP - plan de entregas contractual | ❌ | ❌ | 🔵 | DIFERENCIACIÓN SUPERIOR |

**HANDOVER / CLOSEOUT**

| # | capacidad | ACC | PC | ALEPHIA | clasificación |
|---|---|:-:|:-:|:-:|---|
| 69 | As-built / cierre de expediente | ✅ | ✅ | ❌ | GAP REAL |
| 70 | Traspaso de activos a operacion | ✅ | 🟡 | ❌ | GAP REAL |

## 6.1 · Las cifras, con el denominador declarado

**Cómo se construye el denominador.** Cada fila de la matriz es una capacidad
normalizada a partir de los dos catálogos oficiales del §1 y §2. Una capacidad
«existe» en un fabricante si está ✅ o 🟡. Las capacidades ⚪ **salen del
denominador**: no son deuda, son alcance de producto decidido — y se cuentan
aparte. Se puntúa ✅ y 🔵 = 1, 🟡 = 0,5, ❌ = 0.

```
CAPACIDADES NORMALIZADAS TOTALES ...................... 70
   comunes a ACC y Procore ............................ 61
   solo ACC ........................................... 3   (topografía, AR, directory sync)
   solo Procore ....................................... 1   (parte diario)
   en ninguno de los dos — nuestros ................... 5

COBERTURA FUNCIONAL DE ALEPHIA
   sobre el NÚCLEO COMÚN ACC ∩ PROCORE ... N=56 ...... 51 %   (✅21 · 🟡15 · ❌20)
   sobre el CATÁLOGO ACC ................. N=59 ...... 51 %   (✅22 · 🟡16 · ❌21)
   sobre el CATÁLOGO PROCORE ............. N=57 ...... 51 %   (✅21 · 🟡16 · ❌20)
   sobre el CATÁLOGO NORMALIZADO ......... N=65 ...... 55 %   (incluye lo nuestro)

   capacidades excluidas por DECISIÓN DE NO ADOPTAR ... 5
```

**Qué significa y qué no.** El 51 % dice que **la mitad del núcleo común de la
industria está cubierta**, y que de la otra mitad **20 capacidades no existen en
absoluto**. No dice nada sobre profundidad relativa dentro de lo que sí existe:
un ✅ en «versionado» y un ✅ de ACC en «versionado» no tienen por qué ser
igual de profundos. **Es un denominador de existencia, no de madurez** [N].

---

# 7 · CAPACIDADES DELIBERADAMENTE DESCARTABLES

Estas **salen del cómputo de gaps** porque hay decisión escrita, con motivo:

| capacidad | motivo | dónde se decidió |
|---|---|---|
| **Valorizaciones y facturación** | en obra pública peruana el dinero se mueve por SIAF, INFOBRAS y contrataciones del Estado; duplicarlo crea dos verdades sobre el dinero | doc 22 §8 |
| **Licitación** | ocurre antes de la ejecución y lo gobierna el portal del Estado | doc 22 §8 |
| **Coordinación / detección de interferencias propia** | Navisworks y ACC ya lo hacen y el cliente lo tiene; lo que aporta valor es **federar y registrar** la interferencia como observación con progresiva | doc 22 §8 |
| **Reuniones y actas** | se hacen en Word y se suben al CDE; un módulo compite con una costumbre, no con una carencia | doc 22 §8 |
| **Marketplace de integraciones** | no hay a quién integrar todavía | doc 22 §8 |
| **Traducción y visor propios** | la licencia de Autodesk está pagada y funciona | doc 22 §8 |
| **Fusionar RFI con Red Line** | tienen ciclo de vida distinto, medido en los datos | doc 23 §1 |
| **Plantillas que copien miembros** | concedería acceso a quien nadie invitó a ESA obra | doc 80 §3 |
| **Herencia grant-only de ACC** | impide reservar una carpeta | doc 43 §8 |

**Candidatas a descartar que aún NO tienen decisión** — y que te corresponden a
ti, no a mí: `Prequalification / Bid Board` · `Timecards y nóminas de campo` ·
`Crews / Resource Planning` · `Materials / Equipment` · `Action Plans`.

---

# 8 · GAPS REALES, ORDENADOS

Orden por: **dependencia → valor contractual → frecuencia de uso → riesgo →
reutilización de motores existentes → impacto en el piloto**.

| GAP | capacidad | por qué aquí | motor que reutiliza | riesgo si no está |
|---|---|---|---|---|
| **01** | **Submittals** | El acto contractual más frecuente que hoy **no existe**, y el que más se nota en obra pública: aprobación de materiales y equipos contra especificación | `doc_reviews` (multi-paso) + `encargos` (BIC) + `file_emisiones` | La entidad lo resuelve por correo: el expediente pierde el acto |
| **02** | **Planos como objeto** (número, revisión, set) | Bloquea 03, 04 y buena parte de campo: sin objeto «plano» no hay dónde anclar nada | `file_nodes` + `file_versions` + `pdf_markups` | Un plano superado se sigue usando en obra |
| **03** | **Formularios e inspecciones con plantilla** | Protocolos y liberaciones son obligatorios en obra pública; hoy se hacen en papel | nuevo, pero se apoya en 02 | No hay evidencia de conformidad reutilizable |
| **04** | **Punch list / observaciones de cierre** | Es la recepción de obra. Depende de 02 (ubicación) y 03 (protocolo) | `doc_redlines` + `encargos` | La recepción se documenta fuera del sistema |
| **05** | **Especificaciones como objeto** | Habilita generar submittals desde la especificación, como hacen los dos | `file_nodes` | 01 se queda manual |
| **06** | **Plantillas de flujo de revisión** | Hoy cada revisión se arma a mano; es el multiplicador de 01 y 03 | `doc_reviews.steps` — **es una tabla nueva, no un motor nuevo** | Configuración repetida y divergente entre obras |
| **07** | **Móvil con trabajo offline** | Sin esto, 03 y 04 no llegan al campo — y en obra lineal no hay cobertura | PWA sobre lo existente | Lo de campo vuelve a entrar por transcripción |
| **08** | **Parte diario real** | Documento contractual diario en obra pública peruana | `daily_reports` (esqueleto) + `tracking_*` | Cuaderno de obra fuera del expediente |
| **09** | **Fotos de campo georreferenciadas** | Ya hay `tracking_pins` con posición 3D; la tabla está vacía | `photo_evidences` + `tracking_pins` | La evidencia gráfica no es citable |
| **10** | **Avance físico desde la obra** | Cierra el bucle del 4D: hoy el avance entra por importación | `lob_progress_entries` + `tracking_progress` | El 4D describe el plan, no la obra |
| **11** | **Issues de primera clase** (tipos, campos, causa raíz) | Sube 🟡→✅ observaciones y coordinación sin construir módulo nuevo | `doc_redlines` | Sin analítica de causa: no se aprende de los defectos |
| **12** | **Informes presentables** (no cuadros de mando) | Lo que una entidad entrega; el motor de datos ya está | `dashboards` + export | El informe se hace fuera, a mano |
| **13** | **Correspondencia formal** | Registro de comunicaciones con número y acuse | `transmittals` | Comunicación contractual fuera del expediente |
| **14** | **Contratos y órdenes de cambio** (parte NO financiera) | Alcance y plazo sí son nuestros; el dinero no | `presupuesto_maestro` + `doc_partidas` | Los cambios de alcance no tienen registro |
| **15** | **Informes de cartera entre obras** | Necesita datos ya consolidados; valor para la entidad, no para la obra | `list_all_projects` | Sin visión de cartera para la entidad |
| **16** | **As-built y traspaso de activos** | Final del ciclo; depende de 02, 03, 04 y 09 | — | La entrega a operación se hace fuera |
| **17** | **API pública y webhooks** | Trigger: la primera integración pedida | — | — |
| **18** | **SSO SAML empresarial** | Trigger: la primera entidad con directorio corporativo | — | — |
| **19** | **Multi-inquilino** | Trigger: el 2º cliente en la misma instancia | — | — |

**Los gaps 01–12 son el trabajo de producto. Los 13–16 son el cierre del ciclo.
Los 17–19 no se tocan hasta que su trigger se dispare.**

---

# 9 · INCERTIDUMBRES QUE TODAVÍA IMPIDEN HABLAR DE PARIDAD

Son cinco, y ninguna se resuelve escribiendo documentación:

1. **Nunca hemos visto ninguno de los dos productos funcionando.** Todo este
   benchmark es documentación del fabricante. La documentación describe lo que
   el producto promete, no cómo se comporta [N].
2. **Profundidad relativa sin medir.** Sabemos que ambos tienen «versionado» y
   nosotros también. No sabemos si nuestro ✅ y su ✅ son comparables en
   volumen, rendimiento o casos límite.
3. **Ningún usuario externo ha operado ALEPHIA.** Sigue siendo la incertidumbre
   del doc 81, y ninguna investigación la cierra.
4. **Cobertura MEDIA en el bloque económico y de precons** (Cost, contratos,
   Meetings, Correspondence, Assets, Schedule, Coordination, Takeoff, Bidding).
   Los gaps 13–15 están clasificados con menos evidencia que los 01–12.
5. **El renombrado a Forma es reciente y el catálogo se está moviendo** — hay
   funciones fechadas en marzo de 2026 (el Submittal Builder con IA de Procore).
   Un benchmark congelado hoy envejece; hay que refrescarlo antes de cada
   decisión grande [N].

---

# 10 · LAS SEIS RESPUESTAS

### ¿En qué está ALEPHIA realmente al nivel de ACC/Procore?

En **el expediente y su gobierno**: repositorio con versionado inmutable,
estados ISO 19650, códigos de idoneidad, nomenclatura configurable, permisos de
carpeta con tres sujetos, emisión formal, comparación de versiones, exportación
verificable — y las **dieciséis capas de identidad, administración y
autorización** del Plano A, que es donde la Fase I ya demostró paridad.

### ¿En qué está por delante?

Seis cosas, y las seis por diseño, no por casualidad:

1. **4D de obra lineal con progresivas, frentes y metrados.** Ninguno de los dos
   lo cubre. Es el diferencial más grande.
2. **Topografía y movimiento de tierras** ligados al modelo.
3. **Función contractual derivada** como sujeto de permiso — ACC tiene `Role`,
   pero es **texto libre que alguien teclea**; la nuestra sale del par
   (empresa, obra) con lista cerrada.
4. **Resolución de conflicto de permisos explicable** — closest-wins con `none`
   como denegación explícita. ACC no documenta su regla de conflicto y Procore
   **se contradice en su propia documentación** (doc 44 §2.1).
5. **Acuse de recibo trazable** por destinatario en la emisión.
6. **MIDP/TIDP y triaje de seguridad ISO 19650-5** — ninguno de los dos los
   tiene como objeto propio.

### ¿En qué está por detrás?

En **la superficie funcional de ejecución de obra**: submittals, planos como
objeto, especificaciones, formularios, inspecciones, punch, correspondencia,
móvil offline, contratos y órdenes de cambio, informes de cartera, as-built. Y
en **todo el Plano C**.

### ¿Qué capacidades son críticas para NUESTRO tipo de proyecto?

Obra pública peruana, lineal, con expediente que se defiende ante un tercero.
Críticas, en este orden: **submittals · planos como objeto · formularios e
inspecciones · punch de recepción · parte diario · fotos georreferenciadas ·
avance desde campo · móvil offline**. Lo financiero **no** es crítico: lo
gobierna SIAF/INFOBRAS.

### ¿Qué NO tiene sentido copiar?

Lo del §7, más tres cosas de diseño que la investigación confirma que **hacemos
mejor**: la herencia grant-only de ACC (impide reservar una carpeta), la cadena
AND padre-hijo de Procore (deja fuera al usuario sin decirle por qué), y las
tres capas de permiso apiladas de Procore (nadie sabrá explicar por qué alguien
ve algo).

### ¿Cuál es el camino mínimo a paridad funcional demostrable?

**Gaps 01–07**, en ese orden, porque 02 desbloquea a 03 y 04, y 07 los lleva al
campo. Con eso la cobertura del núcleo común pasa de **51 % a ~70 %**, y —más
importante que la cifra— **el expediente cubriría el ciclo completo de un
contrato de obra**: aprobar materiales, trabajar contra el plano vigente,
levantar protocolos, y recibir la obra.

---

# 11 · DÓNDE ESTAMOS REALMENTE

```
╔════════════════════════════════════════════════════════════════════════╗
║  RESPECTO A ACC / AUTODESK FORMA                                       ║
╚════════════════════════════════════════════════════════════════════════╝

  GOBIERNO Y AUTORIZACIÓN ....... PARIDAD, con 4 puntos por delante
  EXPEDIENTE DOCUMENTAL ......... PARIDAD en el núcleo;
                                  POR DETRÁS en planos y especificaciones
  EJECUCIÓN DE OBRA ............. POR DETRÁS — falta el bloque entero
                                  (submittals, forms, assets, correspondence)
  MODELO Y 4D ................... PARIDAD en visor e inventario;
                                  POR DELANTE en 4D lineal y topografía
  CAMPO / MÓVIL ................. POR DETRÁS — no hay offline
  PLATAFORMA .................... POR DETRÁS — sin API, SSO ni multi-tenant

  Cobertura del catálogo ACC: 51 % (N=59, ✅22 🟡16 ❌21)

  En una frase: tenemos su modelo de gobierno y no tenemos su superficie
  de obra — salvo donde la nuestra es distinta y mejor.

╔════════════════════════════════════════════════════════════════════════╗
║  RESPECTO A PROCORE                                                    ║
╚════════════════════════════════════════════════════════════════════════╝

  GOBIERNO Y AUTORIZACIÓN ....... PARIDAD, y MÁS EXPLICABLE que la suya
                                  (su herencia documental se contradice)
  EXPEDIENTE DOCUMENTAL ......... PARIDAD; ellos van por delante en el
                                  permiso por METADATOS (Document Management)
  CALIDAD Y SEGURIDAD ........... MUY POR DETRÁS — es su punto más fuerte
                                  (inspections, observations, punch, incidents)
  CAMPO ......................... POR DETRÁS — daily log y offline
  CONTROLES ..................... POR DETRÁS en contratos y cambios;
                                  a la par en metrados; lo financiero es ⚪
  PLATAFORMA .................... POR DETRÁS, salvo aprovisionamiento:
                                  Procore TAMPOCO lo tiene

  Cobertura del catálogo Procore: 51 % (N=57, ✅21 🟡16 ❌20)

  En una frase: la distancia con Procore es MAYOR en calidad y campo, y
  MENOR en gobierno documental — donde su propio modelo es más confuso.
```

**Formulación que corresponde tras la Fase II:**

> CDE ISO 19650 con **paridad demostrada de gobierno y autorización**, un **4D
> de obra lineal que ningún fabricante cubre**, y **la mitad del núcleo funcional
> común de la industria** — con veinte capacidades comunes ausentes, de las que
> las siete primeras forman el camino mínimo a paridad funcional demostrable.

---

*Investigación y normalización. Sin código, sin base de datos, sin producción.
Benchmark CONGELADO a 24-ago-2026: refrescar antes de cualquier decisión grande.*
