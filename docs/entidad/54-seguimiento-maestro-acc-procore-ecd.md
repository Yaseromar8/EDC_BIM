# SEGUIMIENTO MAESTRO ACC / PROCORE → NUESTRO ECD

**Fecha:** 21 de agosto de 2026 · Continúa la investigación de docs 43–46. **No la reabre.**
Es el mapa de control del producto: qué capa existe, con qué evidencia, y qué despierta a cada una de las que duermen.

**Distinción que este tablero no permite perder:** «`frontend-docs` cerrado» ≠ «producto ACC/Procore cerrado». Lo cerrado es la **FOUNDATION BACKEND** del dominio documental. Ver §3.

---

## A · LA MATRIZ

| # | CAPA | REF. ACC | REF. PROCORE | MODELO ECD | ESTADO | EVIDENCIA | TRIGGER | SIGUIENTE ACCIÓN |
|---|---|---|---|---|---|---|---|---|
| 1 | **Identity / Principal** | Autodesk ID | Procore login | `users` + `sessions`: identidad **numérica** revocable, 2FA, política de contraseña en servidor | **IMPLEMENTADO** | `routes/auth.py` · `ensayo_de_acuse_por_identidad` 28/28 · 2FA activado en prod (20-ago) | — | Solo UX (fase §12) |
| 2 | **Account / Entity** | Hub / Account | Company (nivel cuenta) | **1 instancia = 1 entidad**. La entidad ES el despliegue (`DEPLOY_PROFILE`, `ADMIN_EMAIL`) | **IMPLEMENTADO** (como instancia) | `bootstrap_esquema.py` · guía de despliegue (doc 11) · piloto `munisanmarcos` | El 2º cliente en la misma instancia lo convertiría en objeto (capa 15) | Nada |
| 3 | **Project Membership** | Project Member | Project Directory | `project_users` — **LA FRONTERA REAL** | **IMPLEMENTADO** · ⚠ enforce en prod | `perimetro_de_obra.py` · `ensayo_de_segunda_obra` 16/16 | — | `ENFORCE_PROJECT_AUTHZ=true` **en la ventana** (E3) |
| 4 | **Company** | Company (account) | Company / Vendor | `users.company_id` — **global**, propiedad de la persona | **IMPLEMENTADO** | `companies` CRUD · Participantes (PATCH miembro) · F4 33/33 | — | Nada |
| 5 | **Contractual Function** | *(no existe como tal)* | Bid/contract context | `project_companies.funcion` — del par (empresa, obra); la de la persona se **deriva**, no se guarda | **IMPLEMENTADO** | `directorio_de_obra.py` · `ensayo_de_participantes` 33/33 | — | Nada |
| 6 | **Entity Admin** | Account Admin | Company Admin | `users.role='admin'` — custodio de la instancia, alcance global mientras 1=1 | **IMPLEMENTADO** | `administracion_de_obra.es_entity_admin` · doc 46 | — | Adjudicación en prod (ventana, paso 14) |
| 7 | **Project Admin** | Project Admin (puede crear proyectos salvo restricción del Hub Admin) | Project Admin | `project_users.es_admin` — **es la fila de membresía**; nace FALSE, nadie hereda | **IMPLEMENTADO** | `ensayo_de_administracion` 32/32 · ruta `miembros/<id>/admin` · UI Participantes | — | Nombrar los primeros en prod (post-ventana) |
| 8 | **Member Tool Access** | Docs access level por miembro | Permission Template por herramienta | Entre membresía y recurso: qué herramientas alcanza un miembro | **DEFER — NO INICIADO** | — (posición reservada en doc 44 §7, discontinua) | **El primer participante externo de acceso limitado** (Documents sí / RFI no) | Vigilar: ver §B.8 — trigger **NO activado** hoy |
| 9 | **Resource Permission** | Folder permissions (grant-only aditivo) | Docs: público/privado + tres capas | **CLOSEST-WINS** con sujetos `USER > COMPANY > FUNCTION`; una sola guardia de recurso | **IMPLEMENTADO** (motor) · **PARCIAL** (UI) | `permiso_documental.py` · `ensayo_de_acceso_documental` 31/31 · expediente 86/86 | UI por COMPANY/FUNCTION: **antes del piloto externo** (doc 44 §8) | Pantalla de concesión por empresa/función — fase propia, tras §12 |
| 10 | **Action / Workflow Authorization** | Reviews/Transmittals roles | Workflow assignees | Posiciones **del flujo** (`AUTOR·RESPONSABLE·ADMIN`), declaradas por objeto; el admin no dicta veredicto | **IMPLEMENTADO** | `flujo_de_registro.py` · B12 cerrado · drills RFI 49 · RL 58 · Reviews 50 | — | Nada |
| 11 | **Responsibility / Ball-in-Court** | *(débil)* | **Ball-in-Court** | `encargos` — proyección reconstruible; identidad estricta; `ADMIN_RECORDED_RECEIPT` | **IMPLEMENTADO** | `encargos.py` · drills 31/31 + 28/28 · doc 42 | — | Nada |
| 12 | **Identity & Access UX** | ACC account/project admin UI | Procore Directory UX | La escalera PERSONA→ENTIDAD→PROYECTOS→EMPRESA/FUNCIÓN→ADMINISTRACIÓN→PERMISOS, **sin un “rol” gigante** | **PARCIAL** — diseño CERRADO | LoginScreen (559 líneas, con invitación/reset/2FA) · Participantes · RolDeMiembro | **ABIERTO** — siguiente frente de Product Experience | **Implementación POST-WINDOW según doc 56 + adenda 57** (G5a→G7→G1–G3→pantallas+G4a; G4b aparte) |
| 13 | **Permission Profiles** | Roles con default access level (objeto administrado) | Permission Templates | Perfil declarado y reutilizable, **≠ función contractual** (doc 44 §6.A) | **DEFER** | — | Configuraciones repetidas entre personas: **>~3 obras vivas** o el primer «como el anterior» | Nada hasta el trigger |
| 14 | **Project Templates** | ACC Project Templates | Procore project templates | Copiar estructura/permisos al crear obra | **DEFER** | — | **La 2ª obra creada copiando la 1ª a mano** | Nada hasta el trigger |
| 15 | **Account Membership / Roles** | Account members + roles | Company directory + permissions | Miembros y roles al nivel de la cuenta | **DEFER** | — | **El 2º cliente en la misma instancia** | Nada hasta el trigger |
| 16 | **Tool Activation por proyecto** | Products activados por proyecto | Tool activation | Qué módulos tiene cada obra | **DEFER** (semilla: `DEPLOY_PROFILE portal/completo` activa módulos **por instancia**) | `server.py` (rutinas por perfil) | La primera cartera con obras que **no usan los mismos módulos** | Nada hasta el trigger |

---

## B · DETALLE POR CAPA — problema, dependencias, y qué NO es

**1 · Identity.** *Resuelve:* que cada acto tenga un autor revocable — el homónimo ya no cierra el encargo de otro. *Depende de:* nada. *No confundir con:* membresía (existir ≠ pertenecer) ni con Company (la identidad no dice de quién eres empleado).

**2 · Entity.** *Resuelve:* de quién es el expediente. *Depende de:* 1. *No confundir con:* el hosting (SYSTEM OPERATOR mantiene, **no custodia** — fuera de la cadena ordinaria de autorización documental, y así queda).

**3 · Project Membership.** *Resuelve:* la frontera — quién está dentro de cada obra. *Depende de:* 1, 2. *No confundir con:* permiso de recurso (ser miembro no abre carpetas) ni con Tool Access.

**4 · Company.** *Resuelve:* de qué organización es la persona, igual en todas las obras. *Depende de:* 1. *No confundir con:* función contractual (SINOHYDRO puede ser contratista aquí y proyectista en la siguiente) ni con permisos.

**5 · Contractual Function.** *Resuelve:* en qué calidad participa una empresa en ESTA obra — la pregunta de obra pública «¿quién es quién aquí?». *Depende de:* 3, 4. *No confundir con:* **Permission Profile** (corrección 6.A de REV.02: la función es contexto organizacional que la resolución de permisos **usa como sujeto**, no una plantilla de accesos) ni con el rol del sistema.

**6 · Entity Admin.** *Resuelve:* quién custodia la instancia — cuentas, catálogo de idoneidad, archivar obras. *Depende de:* 1, 2. *No confundir con:* Project Admin (administrar una obra no es custodiar la entidad) ni con el operador de plataforma.

**7 · Project Admin.** *Resuelve:* administrar UNA obra sin la llave maestra — la autoridad termina en `project_users`. *Depende de:* 3, 6. *No confundir con:* posiciones de flujo (ADMIN de un RFI rescata, no dicta veredicto) ni con permisos de carpeta (administra, y por eso los reparte; no son lo mismo).

**8 · Member Tool Access.** *Resuelve (cuando exista):* el auditor que necesita Documents y no RFI. *Posición exacta:* `PROJECT MEMBERSHIP → MEMBER TOOL ACCESS → RESOURCE PERMISSION`. *Depende de:* 3; los flujos ya autorizan por posición, así que la capa solo **recorta el alcance de herramientas**, no redefine permisos. *No confundir con:* Resource Permission (una cosa es llegar a la herramienta, otra a la carpeta) ni con Tool Activation (16: la obra tiene el módulo; 8: este miembro lo alcanza). **Estado del trigger, evaluado hoy:** producción tiene ya invitados externos pendientes (un contratista de PowerChina, un invitado más) — **pero nadie ha pedido aún acceso distinto por herramienta**, así que el trigger **NO está activado**; está *cerca*, y el primer alcance limitado que se pida lo activa. Se reporta, no se construye.

**9 · Resource Permission.** *Resuelve:* quién llega a qué documento, con una sola respuesta explicable mirando una carpeta (closest-wins; `none` niega sin capa de deny aparte). *Depende de:* 3, 4, 5. *No confundir con:* Responsibility (poder ver no es deber actuar) ni con Workflow.

**10 · Workflow Authorization.** *Resuelve:* quién puede ejecutar cada transición — y que un veredicto que puede dictar cualquiera no pruebe nada. *Depende de:* 1, 3, 7. *No confundir con:* permisos de recurso ni con jerarquía (el ADMIN de flujo es una posición declarada, no `users.role`).

**11 · Responsibility.** *Resuelve:* qué le toca a quién AHORA — la bandeja que un contrato de obra pública discute con plazos. *Depende de:* 10 (es su proyección; nunca fuente de verdad). *No confundir con:* **Permission** (la pelota no concede accesos) — el principio `PERMISSION ≠ RESPONSIBILITY` sigue cerrado.

**12 · Identity & Access UX.** *Resuelve:* que todo lo anterior se pueda **operar sin leer este documento** — hoy el motor existe y las pantallas lo exponen a medias. *Depende de:* 1–7. *No confundir con:* rediseño del modelo (la UI **representa** capas; no las mezcla — prohibido el «rol gigante» ADMINISTRADOR/SUPERVISOR/CONTRATISTA/USUARIO). → **Doc 55.**

**13–16.** Duermen con su trigger escrito en la matriz. Lo único que cambió desde REV.02: `DEPLOY_PROFILE` existe como **semilla** de Tool Activation por instancia (evidencia real), lo que hará barata la capa 16 si despierta.

---

## C · PRINCIPIOS CERRADOS (se conservan; solo evidencia nueva los reabre)

```
IDENTITY ≠ PROJECT MEMBERSHIP ≠ COMPANY ≠ CONTRACTUAL FUNCTION
        ≠ ADMINISTRATION ≠ TOOL ACCESS ≠ RESOURCE PERMISSION
        ≠ WORKFLOW AUTHORIZATION ≠ RESPONSIBILITY

SYSTEM / PLATFORM OPERATOR — fuera de la cadena ordinaria de autorización documental
CONTRACTUAL FUNCTION ≠ PERMISSION PROFILE          (REV.02 §6.A)
PERMISSION ≠ RESPONSIBILITY / BALL-IN-COURT        (doc 40, cerrado en doc 42)
```

---

## D · DÓNDE ESTAMOS — los cuatro planos, sin mezclarlos

| Plano | Estado | Qué significa exactamente |
|---|---|---|
| **FOUNDATION BACKEND** | **CERRADO** (dominio documental) | Capas 1–7, 9 (motor), 10, 11: implementadas, con 459 comprobaciones de batería + 890 de suite. Certificación interna V1 (doc 39) + Administration Foundation (doc 46) |
| **PRODUCT EXPERIENCE** | **PARCIAL** | La capa 12 es el hueco grande (fase abierta, doc 55); la UI de permisos por COMPANY/FUNCTION (capa 9) es el otro, y va **antes del piloto externo** |
| **PRODUCTION READINESS** | **READY FOR CONTROLLED WINDOW — ventana SIN ejecutar** | Gate E1–E5 aceptado (doc 52); paquete pre-window (doc 53). Producción sirve el commit viejo con dos ALERT conocidos. 28+ commits esperan la ventana |
| **EXTERNAL PILOT READINESS** | **BLOQUEADO / PENDIENTE** | Gate separado: residual GCS (mismo proyecto/región), adjudicación de admins, UI de permisos por sujeto, y la fase 12. **No se declara por arrastre de los otros tres** |

---

*Continuación de docs 43–46. Sin investigación nueva de ACC/Procore: las referencias de fabricante son las ya corregidas en REV.02, con sus fuentes allí.*
