# MATRIZ DELTA ACC/PROCORE → ECD · REV.02 FINAL

**Fecha:** 21 de agosto de 2026 · Comparación de cierre contra la investigación ya hecha (docs 43–44).
**Sin investigación nueva de fabricante. Sin código. Sin producción. Sin tocar la Controlled Window ni el mapa maestro.**

> **REV.01** corrigió cuatro clasificaciones: Project Membership (experiencia),
> Identity/Principal (operativa), la paridad operativa global (partida en dos), y
> una afirmación sobre ACC que **nuestra propia investigación no estableció** —
> retirada.
>
> **REV.02 FINAL** elimina las dos últimas inconsistencias internas: `ESTADO
> REAL` tenía **dos semánticas implícitas** (capas marcadas `COMPLETE` con
> experiencia 🟡) — ahora hay **una sola, definida abajo** —; y el foundation
> documental incluía la capa 8, que está DEFER y no forma parte del backend
> implementado.
>
> Ninguna corrección impacta la Controlled Window.

**La pregunta que se responde:** ¿nuestro ECD **representa correctamente** las
capas profesionales que la investigación ACC/Procore nos enseñó? — no si tenemos
sus funciones. Donde diferimos a propósito se marca **DIFERENCIA DELIBERADA
ECD**, y no cuenta como deuda.

**Los tres niveles de paridad**, que no se confunden entre sí:

```
ARCHITECTURAL  ¿el modelo conceptual está resuelto?
OPERATIONAL    ¿el backend lo hace correctamente?
EXPERIENCE     ¿se puede operar profesionalmente desde la interfaz?
```

### `ESTADO REAL` — definición única *(REV.02)*

`ESTADO REAL` es **el estado de la capa COMO PRODUCTO**, y es exactamente la
suma de las tres paridades. No hay segunda lectura:

```
COMPLETE  ⇔  arq ✅  ∧  op ✅  ∧  exp ✅
PARTIAL   ⇔  alguna de las tres no está en ✅
DEFER     ⇔  capa deliberadamente no iniciada, con su trigger escrito
             (no es un grado de avance: es una decisión)
```

Una capa con motor probado y sin interfaz operable **es PARTIAL**, por muy
sólido que sea el motor: el producto es lo que una persona puede hacer. Las
capas que bajan de `COMPLETE` a `PARTIAL` en esta revisión **no pierden nada de
lo construido** — su arquitectura y su backend siguen en ✅, y así se lee en la
tabla de §4.C.

---

# 1 · AUDITORÍA DE LAS 16 CAPAS

### 1 · Identity / Principal
**ACC/Procore nos enseñó:** la identidad es de la persona, vive por encima del proyecto y se revoca en un sitio.
**Modelo objetivo ECD:** `users` + `sessions`, identidad **numérica** revocable, 2FA, política de contraseña en servidor.
**ESTADO REAL: PARTIAL** — **arq ✅ · op 🟡 · exp 🟡**, distinguiendo dos cosas que no son la misma:

- **Motor actual existente (op ✅ para lo que hace):** login, 2FA, sesiones, recuperación, suspensión, política de contraseña en servidor. Opera hoy, en producción.
- **Modelo definitivo diseñado, POST-WINDOW (op 🟡):** el state machine cerrado (docs 58–61) contiene **correcciones backend reales de identidad todavía no implementadas** — G5a (`auth/google` y `register` no comprueban `is_active`), G6 (el reset promete un solo uso y no lo es), G7 (`activated_at` + `invitacion_gen`, la única migración), y el invariante `sesión válida ⇒ activada`. No son mejoras cosméticas: son huecos de identidad ya diagnosticados.

**GAP REAL:** los de G5a/G6/G7 + el invariante de sesión. **¿BLOQUEA PILOTO?** **SÍ** — viajan dentro de Identity & Access UX (capa 12), que ya está en el baseline. **TRIGGER:** —
**DIFERENCIA DELIBERADA ECD:** identidad numérica estricta en toda proyección (ACC/Procore toleran cotejo por texto en varios sitios; nosotros lo prohibimos tras pagarlo cinco veces).

### 2 · Account / Entity
**Nos enseñó:** todo cuelga de una cuenta; el expediente tiene dueño institucional.
**Objetivo ECD:** **1 instancia = 1 entidad** — la cuenta *es* el despliegue.
**ESTADO REAL: PARTIAL** — arq ✅ · op ✅ (para el alcance actual) · **exp 🟡**.
**GAP REAL:** la entidad es **técnicamente implícita** y la UI no la nombra como objeto: se ven proyectos y usuarios, pero no «esta es la entidad, la administran estos, participan estas empresas».
**¿BLOQUEA PILOTO?** NO — pero su **UX sí entra** en el baseline (§4). **TRIGGER:** capa 15.
**DIFERENCIA DELIBERADA ECD:** una entidad por instancia en vez de multi-tenant. Menos flexible, radicalmente más simple de auditar: «¿quién pudo ver esto?» tiene respuesta acotada por construcción.

### 3 · Project Membership
**Nos enseñó:** el proyecto es la frontera; sin membresía no hay nada.
**Objetivo ECD:** `project_users` — **LA FRONTERA REAL**.
**ESTADO REAL: PARTIAL** (arq ✅ · op ✅ · **exp 🟡**) — la asignación existe (modal de accesos en la pantalla de entidad; Participantes por obra), pero **el flujo profesional de alta en obra es P5, pendiente de la implementación post-window**: hoy no hay un camino guiado «añadir persona a esta obra → empresa → función → ¿administra?» desde Participantes.
**GAP REAL:** P5. **¿BLOQUEA PILOTO?** **SÍ** — dentro del baseline, como parte de la administración profesional de participantes.
**DIFERENCIA DELIBERADA ECD:** el perímetro es transversal y **fail-closed** (`ENFORCE_PROJECT_AUTHZ`), no una comprobación por herramienta.

### 4 · Company
**Nos enseñó:** las personas pertenecen a organizaciones, y eso importa en obra.
**Objetivo ECD:** `users.company_id` — **global**, propiedad de la persona.
**ESTADO REAL: PARTIAL** (arq ✅ · op ✅ · **exp 🟡** — se edita en Participantes, pero la entidad no tiene vista de «empresas que participan»).
**GAP REAL:** vista de empresas a nivel entidad. **¿BLOQUEA PILOTO?** NO — entra en la UX de entidad del baseline.
**DIFERENCIA DELIBERADA ECD:** la empresa es de la **persona** y es la misma en todas las obras; lo que cambia por obra es su **función** (capa 5). ACC mezcla ambas nociones en «Company» del proyecto.

### 5 · Contractual Function
**Nos enseñó (por ausencia):** ni ACC ni Procore modelan «en qué calidad contractual participa esta empresa **en esta obra**». Es la pregunta de obra pública que ninguno responde.
**Objetivo ECD:** `project_companies.funcion`, del par (empresa, obra); la función de la **persona se deriva**, no se guarda.
**ESTADO REAL: COMPLETE** (arq ✅ · op ✅ · exp ✅ — chips en Participantes, con el aviso de que no concede permisos).
**GAP REAL:** ninguno. **¿BLOQUEA PILOTO?** NO.
**DIFERENCIA DELIBERADA ECD:** **capa propia, inexistente en ambos fabricantes.** Y `CONTRACTUAL FUNCTION ≠ PERMISSION PROFILE`: es contexto organizacional que la resolución **usa como sujeto**, no una plantilla de accesos.

### 6 · Entity Admin
**Nos enseñó:** Account Admin custodia la cuenta; no es el que mantiene los servidores.
**Objetivo ECD:** `users.role='admin'` — custodio de la instancia; alcance global mientras 1=1.
**ESTADO REAL: PARTIAL** (arq ✅ · op ✅ · **exp 🟡** — se cambia el rol desde «Usuarios del sistema»; falta la ficha que explique qué significa).
**GAP REAL:** adjudicación pendiente en producción (3 cuentas admin, una técnica). **¿BLOQUEA PILOTO?** **SÍ** — antes de un tercero, «¿quién pudo ver esto?» debe tener respuesta acotada. Es paso 14 de la ventana.
**DIFERENCIA DELIBERADA ECD:** **SYSTEM OPERATOR fuera de la cadena** — separación que ACC/Procore no necesitan hacer explícita porque son SaaS; nosotros sí, y se declara en vez de fingir aislamiento.

### 7 · Project Admin
**Nos enseñó:** administrar un proyecto es un rol propio, no una llave maestra.
**Objetivo ECD:** `project_users.es_admin` — **es la fila de membresía**; nace FALSE, nadie hereda.
**ESTADO REAL: PARTIAL** (arq ✅ · op ✅ · **exp 🟡** — el control existe en Participantes; falta la ficha de persona y el flujo de alta).
**GAP REAL:** experiencia parcial (marcado 🟡 en el mapa maestro). **¿BLOQUEA PILOTO?** NO por sí solo; su UX va con el baseline.
**DIFERENCIA DELIBERADA ECD:** la administración **ES la membresía** — `project_users.es_admin`, una columna en la fila de participación: retirar de la obra retira la administración en el mismo acto, sin que nadie tenga que acordarse, y no puede existir un administrador que no sea miembro.
*(REV.01 — retirada la afirmación «en ACC son objetos separados que pueden desincronizarse». Nuestra investigación estableció que ACC maneja el nivel de acceso **asociado al miembro del proyecto** — `Project member` / `Project administrator` —, no una separación entre objetos. Nuestra implementación se presenta por lo que es, sin apoyarse en un contraste que la investigación no soporta.)*

### 8 · Member Tool Access — **DEFER**
**Nos enseñó:** ACC da nivel de acceso por herramienta al miembro; Procore, plantillas por herramienta.
**Objetivo ECD:** entre membresía y recurso — qué herramientas alcanza un miembro.
**ESTADO REAL: DEFER — NO INICIADO.** **GAP REAL: NO** (una capa DEFER con trigger apagado no es gap, por la regla del encargo).
**¿BLOQUEA PILOTO?** **Ver §3 — evaluación honesta: TRIGGER PROBABLE EN PILOTO.**
**TRIGGER:** el primer miembro que necesite acceso distinto por herramienta (`Documents YES · RFI NO · Reviews NO · Transmittals READ`).
**DIFERENCIA DELIBERADA ECD:** posición **reservada y visible** en el organigrama, sin construir. No se adelanta por reflejo.

### 9 · Resource Permission
**Nos enseñó:** ACC = herencia grant-only aditiva (no puede reservar una carpeta); Procore = público/privado + tres capas apiladas (nadie sabe explicar por qué alguien ve algo).
**Objetivo ECD:** **CLOSEST-WINS** con sujetos `USER > COMPANY > FUNCTION`, una sola guardia de recurso.
**ESTADO REAL: PARTIAL** (arq ✅ · op ✅ · **exp 🟡 — el gap real de esta matriz**).
**GAP REAL:** **medido hoy**: `AddPermissionModal.jsx` y `FolderPermissionsPanel.jsx` existen y **son USER-only** — cero apariciones de `sujeto_tipo`, `COMPANY` o `CONTRACTUAL_FUNCTION` en todo el JSX, y ninguna vista de permiso efectivo. El motor tiene tres sujetos; la interfaz expone uno.
**¿BLOQUEA PILOTO?** **SÍ.** Ver §2. **TRIGGER:** —
**DIFERENCIA DELIBERADA ECD:** closest-wins **es decisión propia y mejor para el ECD**, no deuda por no copiar: permite **reservar** una carpeta (ACC no puede), `none` niega sin capa de deny aparte, y la respuesta se lee **mirando una sola carpeta**.

### 10 · Workflow Authorization
**Nos enseñó:** los flujos tienen participantes con papeles; quién puede actuar depende del paso.
**Objetivo ECD:** posiciones **del flujo** (`AUTOR · RESPONSABLE · ADMIN`) declaradas por objeto; el administrador **no dicta veredicto**.
**ESTADO REAL: COMPLETE** (arq ✅ · op ✅ · exp ✅ — RFI, Red Line, Reviews y Transmittals operables).
**GAP REAL:** ninguno. **¿BLOQUEA PILOTO?** NO.
**DIFERENCIA DELIBERADA ECD:** «un veredicto que puede dictar cualquiera no prueba nada» — el ADMIN rescata (reasigna, desatasca) pero **nunca actúa por el responsable**. En ACC/Procore el project admin suele poder cerrar por otro.

### 11 · Responsibility / Ball-in-Court
**Nos enseñó:** **Procore acertó** con Ball-in-Court; ACC lo tiene débil.
**Objetivo ECD:** `encargos` — proyección **reconstruible**, nunca fuente de verdad; identidad estricta; `ADMIN_RECORDED_RECEIPT`.
**ESTADO REAL: COMPLETE** (arq ✅ · op ✅ · exp ✅ — «Mi Trabajo»).
**GAP REAL:** ninguno. **¿BLOQUEA PILOTO?** NO.
**DIFERENCIA DELIBERADA ECD:** `PERMISSION ≠ RESPONSIBILITY`, y la proyección se **reconcilia** contra los objetos — si diverge, gana el objeto. Y el registro administrativo de recepción **no se disfraza** de acuse del destinatario.

### 12 · Identity & Access UX
**Nos enseñó:** la administración de personas y accesos es **producto**, no configuración.
**Objetivo ECD:** la escalera PERSONA→ENTIDAD→PROYECTOS→EMPRESA/FUNCIÓN→ADMINISTRACIÓN→PERMISOS, sin «rol gigante».
**ESTADO REAL: PARTIAL** — **DISEÑO ✅ (cerrado definitivamente, docs 55–61) · IMPLEMENTACIÓN POST-WINDOW**.
**GAP REAL:** implementación (G1–G7 + P1–P6). **¿BLOQUEA PILOTO?** **SÍ.** **TRIGGER:** —
**Verificación pedida (§4 del encargo):** el diseño cerrado cubre los doce elementos — Login ✅ · Invitación ✅(G1) · Activación ✅ · Recuperación ✅ · Suspensión ✅ / Reactivación ✅(G2) · Entity User Directory ✅(P3) · Project Membership ✅(P5) · Entity Admin ✅ · Project Admin ✅ · Company ✅ · Contractual Function ✅ · Mi cuenta ✅(P6). **Cobertura conceptual completa** frente a ACC/Procore.
**DIFERENCIA DELIBERADA ECD:** prohibición explícita del rol gigante — **verificado hoy en el código**: `SUPERVISOR`/`CONTRATISTA` aparecen **solo** como chips de función contractual en Participantes, nunca mezclados con el perfil del sistema.

### 13 · Permission Profiles — **DEFER**
**Nos enseñó:** ACC = `Role` como objeto administrado con default access level; Procore = Permission Templates.
**Objetivo ECD:** perfil declarado y reutilizable, **≠ función contractual**.
**ESTADO REAL: DEFER.** **GAP REAL: NO.** **¿BLOQUEA PILOTO?** NO.
**TRIGGER — confirmado apagado hoy:** no ha aparecido «que tenga los mismos accesos que X» ni configuraciones repetidas entre proyectos; con **1 obra activa real** y permisos USER-only, la repetición todavía no duele.
**DIFERENCIA DELIBERADA ECD:** la separación de la función contractual (corrección 6.A de REV.02) — copiarla mezclada sería heredar el defecto.

### 14 · Project Templates — **DEFER**
**Nos enseñó:** ambos los tienen para no repetir configuración al crear obra.
**ESTADO REAL: DEFER.** **GAP REAL: NO.** **¿BLOQUEA PILOTO?** NO.
**TRIGGER — confirmado apagado:** no ha ocurrido crear una obra copiando a mano estructura, miembros, módulos o permisos de otra. **Vigilancia:** el piloto de entidad creará su primera obra desde cero; el trigger se enciende con la **segunda**.

### 15 · Account Membership / Roles — **DEFER**
**ESTADO REAL: DEFER.** **GAP REAL: NO.** **¿BLOQUEA PILOTO?** NO.
**TRIGGER — apagado:** exige un **segundo cliente en la misma instancia**. **Confirmado: `1 instancia = 1 entidad` sigue siendo suficiente** — el piloto de entidad se despliega como instancia propia (doc 11), que es precisamente lo que mantiene el trigger apagado.

### 16 · Tool Activation por proyecto — **DEFER**
**ESTADO REAL: DEFER** (semilla real: `DEPLOY_PROFILE portal|completo` activa módulos **por instancia**).
**GAP REAL: NO.** **¿BLOQUEA PILOTO?** NO.
**TRIGGER — apagado:** la primera cartera con obras que no usen los mismos módulos.

### Recuento con la definición única *(REV.02)*

```
COMPLETE  3   Contractual Function (5) · Workflow (10) · Responsibility (11)
PARTIAL   8   Identity (1) · Account/Entity (2) · Membership (3) · Company (4)
              Entity Admin (6) · Project Admin (7) · Resource Permission (9)
              Identity & Access UX (12)
DEFER     5   Member Tool Access (8) · Permission Profiles (13)
              Project Templates (14) · Account Roles (15) · Tool Activation (16)
              ─────
              16 capas
```

**Las ocho PARTIAL lo son por experiencia, no por motor** — salvo Identity (1),
que además tiene gaps operativos reales, e Identity & Access UX (12), que es
diseño cerrado sin implementar. Ninguna PARTIAL tiene su arquitectura sin
resolver: la paridad arquitectónica sigue **alcanzada conceptualmente en 16/16**.

---

# 2 · RESOURCE PERMISSION UX — el gap real, definido

**Estado medido:** motor con tres sujetos y closest-wins, probado (31/31 + 86/86). Interfaz: **un solo sujeto (USER), sin permiso efectivo, sin explicación de qué regla gana.**

Lo que falta, en el orden del recorrido que pediste:

| # | Capacidad | Estado | Qué falta exactamente |
|---|---|---|---|
| 1 | Seleccionar carpeta/recurso | ✅ | — (el árbol ya lo permite) |
| 2 | **Ver permiso efectivo** de una persona aquí | ❌ | Vista que resuelva y muestre el resultado **y su origen** (qué carpeta, qué sujeto) |
| 3 | Conceder por **PERSONA** | ✅ | — (`AddPermissionModal`, hoy el único camino) |
| 4 | Conceder por **EMPRESA** | ❌ | Selector de sujeto + catálogo de empresas de la obra |
| 5 | Conceder por **FUNCIÓN CONTRACTUAL** | ❌ | Ídem, con el aviso: **alcanza a los futuros miembros** de esa función |
| 6 | **Entender qué regla gana** | ❌ | La explicación de closest-wins: «gana la regla de la carpeta más cercana; a igual carpeta, USER > COMPANY > FUNCTION» — visible donde se decide, no en una ayuda |

**Comparación conceptual, sin copiar semántica:** ACC administra permisos de
carpeta por miembro/rol/empresa con herencia aditiva — nos enseña que **conceder
a un colectivo es indispensable en obra** (es lo que nos falta: 4 y 5). Procore
nos enseña, por contraste, **qué no hacer**: tres capas apiladas cuya resolución
nadie sabe explicar. Nuestro closest-wins es **más explicable que ambos** — y
justo por eso el punto 6 es obligatorio: una regla que se puede explicar y no se
explica desperdicia su única ventaja.

**Clasificación:** los seis puntos son **MUST HAVE antes del piloto externo.**
Sin 4 y 5, repartir una obra a un tercero se hace persona a persona; sin 2 y 6,
nadie puede responder «¿por qué este ve esto?» — que es exactamente la pregunta
del auditor.

---

# 3 · MEMBER TOOL ACCESS — evaluación honesta del trigger

```
PROJECT MEMBERSHIP  →  MEMBER TOOL ACCESS  →  RESOURCE PERMISSION
TRIGGER: primer miembro que necesite acceso diferente por herramienta.
```

**Estado: `TRIGGER PROBABLE EN PILOTO`** — y esto **corrige mi propia
clasificación anterior**, que lo daba por simplemente apagado:

- **Hoy: apagado.** Nadie ha pedido acceso distinto por herramienta.
- **En el piloto: probable.** El alcance previsto (entidad municipal con
  supervisión y contratista externos) contiene el caso de manual: un auditor o
  un contratista que deba ver Documents y **no** RFI ni Reviews. Producción ya
  tiene invitados externos pendientes, incluido un contratista de otra
  organización.

**No se construye nada.** Se declara la vigilancia: si al definir el alcance del
primer piloto aparece un participante que necesita acceso por herramienta,
**`TRIGGER ACTIVADO`** y se decide entonces — antes de abrir el piloto, no
durante.

---

# 4 · LOS CUATRO RESULTADOS

## A · PARIDAD ARQUITECTÓNICA

```
✅ ALCANZADA — 16/16 capas con modelo conceptual resuelto
```

Las 11 activas están definidas y las 5 DEFER tienen **posición reservada en el
organigrama y trigger escrito** — que es la forma correcta de «resuelto» para
algo que no se construye. Cuatro capas **superan** conceptualmente a los
fabricantes: Contractual Function (no existe en ninguno), closest-wins
(explicable y con reserva), Ball-in-Court reconstruible, y la separación del
System Operator.

## B · PARIDAD OPERATIVA — en dos planos que no se confunden

```
FOUNDATION DOCUMENTAL   ✅ ALCANZADA EN EL ÁRBOL
                           pendiente de la Controlled Window para producción

MODELO ACTIVO TOTAL     🟡 PARCIAL
                           pendiente de Identity & Access post-window
```

**FOUNDATION DOCUMENTAL** — **capas activas 3–7 y 9–11** en su dominio:
membresía, empresa, función contractual, administración de entidad y de obra,
permiso de recurso, workflow y responsabilidad. *(La capa 8, Member Tool Access,
queda fuera: está DEFER y no forma parte del backend implementado — REV.02.)* Backend completo y probado: **459 comprobaciones de batería +
890 de suite**. Pendiente únicamente de cruzar la ventana, que cierra sus dos
ALERT vivos (permisos de carpeta rotos desde el 20-ago; enforce en log-only).

**MODELO ACTIVO TOTAL** — lo anterior **más identidad**. Aquí la paridad es
**PARCIAL**, y no por la ventana: la capa 1 tiene gaps operativos reales ya
diagnosticados y no implementados (G5a, G6, G7, invariante de sesión), que
viajan con la implementación de la capa 12, **post-window**.

Decir «backend completo en las 11 capas activas» habría sido inexacto por dos
motivos: no es completo en identidad, y las capas activas del foundation
documental son **3–7 y 9–11** — ocho, no nueve: la 8 está DEFER.

## C · PARIDAD DE EXPERIENCIA

```
🟡 PARCIAL — es el frente real que queda
```

| Capa | Arq | Op | Exp |
|---|---|---|---|
| Contractual Function · Workflow · Responsibility | ✅ | ✅ | ✅ |
| **Identity / Principal** | ✅ | **🟡** *(motor actual sí; modelo definitivo post-window)* | 🟡 |
| **Project Membership** | ✅ | ✅ | **🟡** *(P5 post-window)* |
| Account/Entity · Company · Entity Admin · Project Admin | ✅ | ✅ | 🟡 |
| **Resource Permission** | ✅ | ✅ | **🟡 — el gap** |
| Identity & Access UX | ✅ (diseño) | — | ⏳ |

**Verificación del recorrido profesional** (§3 del encargo)
`ENTIDAD → PERSONAS → PROYECTOS → PARTICIPANTES → EMPRESA → FUNCIÓN →
ADMINISTRACIÓN → ACCESO A DOCUMENTOS → WORKFLOW → RESPONSABILIDAD`:
el recorrido **existe entero**, pero con tres eslabones que un profesional no
puede operar sin conocer nuestra arquitectura: **ENTIDAD** (implícita, sin
pantalla propia), **ACCESO A DOCUMENTOS** (un sujeto de tres) y la **ficha de
persona** que une la escalera. Lo bueno: **el rol gigante no existe** —
verificado en el código, no supuesto.

## D · BASELINE MÍNIMO PARA PILOTO EXTERNO

Tu hipótesis, **verificada contra el tablero y el repositorio: correcta**, con
dos precisiones que la evidencia obliga a añadir.

### MUST HAVE BEFORE EXTERNAL PILOT

| | Por qué bloquea |
|---|---|
| **1 · Controlled Window + stabilization** | Sin ella, producción sirve código incompatible con su propio esquema |
| **2 · Identity & Access UX implementado** | Un tercero necesita ser invitado, activarse, recuperar su clave y ser suspendido — sin que un admin copie enlaces a mano |
| **3 · Resource Permission UX (COMPANY / FUNCTION + efectivo + explicación)** | §2. Sin colectivos, repartir es persona a persona; sin efectivo/explicación, «¿por qué este ve esto?» no tiene respuesta |
| **4 · Administración profesional de participantes** | Ficha de persona + alta en obra + significado de Entity/Project Admin visible |
| **5 · Gate externo de seguridad/DR** | C7 residual (ambos buckets, mismo proyecto y región), 19650-5, MFA de la cuenta administrativa |
| **+6 · Adjudicación de admins** *(precisión añadida)* | Ya identificada: 3 cuentas admin, una técnica con cero obras. Ante un tercero, la autoridad debe estar acotada **antes**, no después. Es paso 14 de la ventana — se cumple sola si la ventana se ejecuta entera |
| **+7 · UX de entidad** *(precisión añadida)* | §9 del encargo: quién pertenece, quién administra, qué proyectos, qué empresas. Hoy **no existe como vista**. Pertenece a Product Experience aunque la entidad sea técnicamente implícita |

### TRIGGER-BASED / DEFER

Member Tool Access *(salvo `TRIGGER ACTIVADO` en la definición del piloto — §3)*
· Permission Profiles · Project Templates · Account Membership/Roles · Tool
Activation.

**Dónde la evidencia matiza tu hipótesis, y por qué:**
+6 y +7 no la contradicen — la completan: la adjudicación ya viaja dentro de (1)
y la UX de entidad es el eslabón que faltaba nombrar dentro de (4). Y Member
Tool Access **podría saltar** de DEFER a MUST HAVE si el alcance del piloto lo
enciende: **se decide al definirlo, no ahora**.

---

# 5 · EL MAPA

```
                        YA ALCANZADO
    ├─ Paridad arquitectónica ...................... 16/16 capas
    ├─ Foundation documental (backend) ............. capas 3–7 y 9–11, probadas
    │     (identidad: motor actual sí; modelo definitivo, post-window)
    ├─ Contractual Function ........................ capa propia, más que ACC/Procore
    ├─ Closest-wins + 3 sujetos (motor) ............ más explicable que ambos
    ├─ Ball-in-Court reconstruible ................. mejor que ACC
    ├─ System Operator fuera de la cadena .......... separación explícita
    └─ Diseño Identity & Access UX ................. cerrado definitivamente
                             ↓
                       GAP QUE FALTA
    ├─ CONTROLLED WINDOW ........................... ⏳ ESTAMOS AQUÍ
    ├─ Identity & Access UX — implementación ....... post-window
    │     incluye G5a · G6 · G7 · invariante de sesión (gaps de identidad)
    ├─ Project Membership UX (P5) .................. alta guiada en obra
    ├─ Resource Permission UX — COMPANY/FUNCIÓN .... el gap real de experiencia
    │     efectivo · conceder por colectivo · qué regla gana
    ├─ UX de entidad + ficha de persona ............ el recorrido profesional entero
    ├─ Adjudicación de admins ...................... dentro de la ventana
    └─ Gate externo de seguridad / DR .............. C7 residual · 19650-5 · MFA
                             ↓
                    DEFER POR TRIGGER
    ├─ Member Tool Access .......... TRIGGER PROBABLE EN PILOTO — vigilar al definirlo
    ├─ Permission Profiles ......... apagado: sin «los mismos accesos que X»
    ├─ Project Templates ........... apagado: se enciende con la 2ª obra copiada
    ├─ Account Membership/Roles .... apagado: 1 instancia = 1 entidad, suficiente
    └─ Tool Activation ............. apagado: sin cartera de módulos distintos
```

---

*Análisis de cierre sobre la investigación existente. El mapa maestro (doc 63) y
el organigrama no se modifican con este documento: esta matriz los usa, no los
sustituye.*

**Lo que REV.01 NO cambia:** `Controlled Window = ESTAMOS AQUÍ` · Resource
Permission UX = gap antes del piloto · Identity & Access UX = diseño cerrado /
implementación post-window · Member Tool Access = TRIGGER PROBABLE EN PILOTO ·
las demás capas DEFER. **Ninguna corrección impacta la Controlled Window**: los
gaps reclasificados son todos post-window y no alteran su alcance congelado.

**REV.02 no cambia:** paridad arquitectónica alcanzada conceptualmente ·
`Controlled Window = ESTAMOS AQUÍ` · Identity & Access UX = diseño cerrado /
implementación post-window · Resource Permission UX = gap pre-piloto · Member
Tool Access = TRIGGER PROBABLE EN PILOTO · demás capas DEFER. Las capas que
bajan a `PARTIAL` no pierden nada construido: su arquitectura y su backend
siguen en ✅.

```
MATRIZ DELTA ACC/PROCORE → ECD · REV.02 FINAL
FUENTE DEFINITIVA DE PARIDAD
```

**STOP.**
