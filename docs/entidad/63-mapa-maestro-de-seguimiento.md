# MAPA MAESTRO DE SEGUIMIENTO ACC/PROCORE → ECD

**Fecha:** 21 de agosto de 2026 · **Fuente de verdad de seguimiento** para las fases siguientes.
Dos vistas, deliberadamente separadas y que **no se sustituyen entre sí**:

| Vista | Pregunta que responde | Qué NO responde |
|---|---|---|
| **A · Organigrama de arquitectura** | ¿Cómo está estructurado el producto? | No dice qué está terminado |
| **B · Mapa de avance** | ¿Dónde estamos de verdad? | No define capas ni invariantes |

El detalle por capa (referencias ACC/Procore, evidencia, dependencias, «qué no
confundir») sigue viviendo en el **doc 54**; este documento gobierna el
**seguimiento** y el 54 le da el fondo. Ninguno de los dos se edita sin el otro
a la vista.

---

# A · ORGANIGRAMA DE ARQUITECTURA ACC/PROCORE → ECD

*¿Cómo está estructurado el producto?* — la cadena es estructura, no cronología.

```
SYSTEM / PLATFORM OPERATOR
       [fuera de la autorización documental ordinaria — mantiene, no custodia]

ACCOUNT / ENTITY                      1 instancia = 1 entidad
       ↓
IDENTITY / PRINCIPAL                  users + sessions · identidad numérica revocable
       ↓
PROJECT MEMBERSHIP                    project_users · LA FRONTERA REAL
       ↓
COMPANY                               users.company_id · global, de la persona
       ↓
CONTRACTUAL FUNCTION                  project_companies.funcion · del par (empresa, obra)
       ↓
PROJECT / ENTITY ADMINISTRATION       users.role='admin' · project_users.es_admin
       ↓
MEMBER TOOL ACCESS          [DEFER]   posición reservada: membresía → herramientas
       ↓
RESOURCE PERMISSION                   CLOSEST-WINS · sujetos USER > COMPANY > FUNCTION
       ↓
WORKFLOW AUTHORIZATION                posiciones del flujo: AUTOR · RESPONSABLE · ADMIN
       ↓
RESPONSIBILITY / BALL-IN-COURT        encargos · proyección reconstruible
```

### Invariantes — cerradas; solo evidencia nueva las reabre

```
IDENTITY ≠ MEMBERSHIP ≠ COMPANY ≠ CONTRACTUAL FUNCTION ≠ ADMINISTRATION
         ≠ TOOL ACCESS ≠ RESOURCE PERMISSION ≠ WORKFLOW AUTHORIZATION
         ≠ RESPONSIBILITY

SYSTEM / PLATFORM OPERATOR  — fuera de la cadena ordinaria de autorización documental
CONTRACTUAL FUNCTION        ≠ PERMISSION PROFILE
PERMISSION                  ≠ RESPONSIBILITY / BALL-IN-COURT
```

---

# B · MAPA MAESTRO DE AVANCE

*¿Dónde estamos de verdad?*

```
ACC / PROCORE RESEARCH                              ✅  docs 43–44 (REV.02)
         ↓
MODELO OBJETIVO DEFINIDO                            ✅  docs 45–46 · 54
         ↓
┌────────────────────────────┬──────────────────────────────┐
│ BACKEND / FOUNDATIONS      │ PRODUCT EXPERIENCE           │
│                            │                              │
│ Membership              ✅ │ Login UX                  ⏳ │
│ Company/Function        ✅ │ Invitations UX            ⏳ │
│ Resource Permission     ✅ │ User Admin UX             ⏳ │
│ Workflow                ✅ │ Account/Entity UX         ⏳ │
│ Responsibility/BIC      ✅ │ Project Admin UX          🟡 │
│ Administration          ✅ │   (checkbox en Participantes │
│                            │    existe; ficha y flujo, no)│
│                            │ Identity & Access UX         │
│                            │   Diseño                  ✅ │
│                            │   (docs 55–61, definitivo)   │
│                            │   Implementación          ⏳ │
└──────────────┬─────────────┴──────────────────────────────┘
               ↓
      PRODUCTION HARDENING
               │
      PRE-WINDOW                                    ✅  docs 47–53 · 62
               ↓
      CONTROLLED WINDOW                                 ✅  ejecutada 22-ago-2026
               │                                        criterios §7 del doc 53: 7/7
               │                                        con evidencia (doc 65)
               ↓
      ╔══════════════════════════════════════════╗
      ║ PRODUCTION STABILIZATION   ⏳            ║
      ║ ← ESTAMOS AQUÍ OPERATIVAMENTE            ║
      ╚══════════════════════════════════════════╝                          smoke sostenido · adjudicación de
               ↓                                        admins · sembrar project_ref
      IMPLEMENTAR IDENTITY & ACCESS UX                  orden: adenda 57 §4 + notas 59–61
               ↓                                        (G5a → G7 → G1–G3 → pantallas; G4b aparte)
      RESOURCE PERMISSION UX                            conceder por COMPANY /
      (COMPANY / CONTRACTUAL FUNCTION)                  CONTRACTUAL FUNCTION — capa 9
               ↓
      EXTERNAL PILOT GATE                               C7 residual (proyecto/región del
               ↓                                        bucket) · 19650-5 · MFA admin
      PILOTO EXTERNO
```

---

# C · MARCADOR

```
ESTAMOS AQUÍ:
PRODUCTION STABILIZATION — la ventana se ejecutó el 22-ago-2026 y se declaró
exitosa con los siete criterios del doc 53 §7 en evidencia (doc 65)
```

Dentro de la estabilización quedan, por orden: PASO 14 — adjudicación de
admins (decisión humana del propietario, cuenta por cuenta) · sembrar
`project_ref` (obras legadas resuelven por el camino antiguo; el 403
`PROJECT_UNRESOLVED` medido lo confirma fail-closed) · smoke sostenido unos
días. La implementación de Identity & Access UX quedó ARRANCADA durante la
propia ventana por orden del propietario (retiro de la compuerta + G5a/G6 +
tramo de invitaciones, commits 31791e4·5b8f1a4·556820a) y continúa tras la
estabilización según la adenda 57 §4.

---

# D · CAPAS DEFER — visibles, fuera de la ruta inmediata

| Capa | Estado | Trigger que la despierta |
|---|---|---|
| **Member Tool Access** | DEFER | El primer participante externo de acceso limitado por herramienta (Documents sí / RFI no). Evaluado el 21-ago con los invitados externos reales: **NO activado** |
| **Permission Profiles** | DEFER | Configuraciones de acceso repetidas entre personas: >~3 obras vivas o el primer «que entre como el anterior» |
| **Project Templates** | DEFER | La 2ª obra que se cree copiando la estructura de la 1ª a mano |
| **Account Membership / Roles** | DEFER | El 2º cliente en la misma instancia |
| **Tool Activation por proyecto** | DEFER | La primera cartera con obras que no usan los mismos módulos (semilla existente: `DEPLOY_PROFILE` por instancia) |

Ninguna se construye antes de su trigger; cuando uno se active, se **reporta**
primero (`TRIGGER ACTIVADO`) y se decide — no se implementa por reflejo.

---

*Vista A = estructura. Vista B = avance. Mantener las dos al día es parte del
cierre de cada fase futura: una fase no está cerrada hasta que este mapa lo
dice.*

---

# D · ESTADO ACC/PROCORE — actualizado 22-ago-2026 (bloque de estabilización)

Solo se mueve lo que tiene evidencia nueva medida hoy.

```
 #  CAPA                          ARQ  OP  EXP   ESTADO
 01 Identity / Principal           ✅  🟡  🟡   PARTIAL   op mejora: G5a×3 + G6 cerrados
 02 Account / Entity               ✅  ✅  🟡   PARTIAL   sin cambio (falta vista de entidad)
 03 Project Membership             ✅  ✅  🟡   PARTIAL   op REFORZADO: Accesos ya no destruye
 04 Company                        ✅  ✅  🟡   PARTIAL   sin cambio
 05 Contractual Function           ✅  ✅  ✅   COMPLETE  sin cambio
 06 Entity Admin                   ✅  ✅  🟡   PARTIAL   sin cambio (adjudicación abierta)
 07 Project Admin                  ✅  ✅  🟡   PARTIAL   op REFORZADO: es_admin sobrevive al guardado
 08 Member Tool Access             ✅   —   —   DEFER     trigger apagado; posición limpia
 09 Resource Permission            ✅  ✅  🟡   PARTIAL   sin cambio — sigue el gap real
 10 Workflow Authorization         ✅  ✅  ✅   COMPLETE  ⬆ RECUPERADA con evidencia
 11 Responsibility / BIC           ✅  ✅  ✅   COMPLETE  sin cambio
 12 Identity & Access UX           ✅  🟡  🟡   ACTIVE    tramo invitaciones en producción
```

**Movimientos con su evidencia:**

- **Capa 10 → COMPLETE.** RV-002: autor 22 crea, **revisor 19 aprueba**, el
  documento transita (`review_approve` + `cambio_de_estado` a la misma hora,
  cada acto con su identidad). Independencia demostrada en los dos sentidos: el
  producto **negó** al autor-único-revisor (`400 REVISION_SIN_INDEPENDENCIA`) y
  **aceptó** al par independiente. Ningún Entity Admin en el flujo. Con esto,
  los cuatro flujos (RFI · Red Line · Transmittals · Reviews) tienen evidencia
  EXP con usuarios no-Entity-Admin.
- **Capas 3 y 7: OP reforzado, EXP sin cambio.** Guardar Accesos ya no borra
  `es_admin` ni `assigned_at` (verificado en producción). No suben de PARTIAL
  porque su carencia era y sigue siendo de experiencia (P5, ficha de persona).
- **Capa 3, prueba nueva:** el miembro 19 ve **2 obras de 10** — el filtrado por
  membresía, medido con sesión real.
- **Capa 1: OP mejora pero NO sube.** Cerrados G5a (las tres puertas respetan
  `is_active`) y G6 (reset de un solo uso). Queda G7 (`activated_at` +
  `invitacion_gen`) y el invariante de sesión: siguen 🟡.
- **Capa 8 sigue DEFER con trigger APAGADO.** Nadie ha pedido acceso distinto
  por herramienta. Su posición quedó limpia al retirar la compuerta.

**Ninguna otra capa cambia**: 02, 04, 06, 09 y 12 conservan su estado — no hubo
evidencia nueva sobre ellas y la ejecución de producto sigue retenida.

---

---

# E · ESTADO ACC/PROCORE — actualizado 23-ago-2026 (cierre de capas 12, P5 y 9)

Re-medición completa tras tres veredictos con EXP en producción. El detalle y
la evidencia de cada movimiento viven en los docs **72** (capa 12), **75**
(capa 9 + distancia al piloto) y **76** (decisiones de gate).

```
 #  CAPA                          ARQ  OP  EXP   ESTADO
 01 Identity / Principal           ✅  ✅  ✅   COMPLETE  ⬆ G7 entero + matriz E2E 10/10 (doc 71) + EXP prod
 02 Account / Entity               ✅  ✅  🟡   PARTIAL   falta vista de entidad consolidada — UX POLISH
 03 Project Membership             ✅  ✅  ✅   COMPLETE  ⬆ P5 operable desde la obra, verificado en prod
 04 Company                        ✅  ✅  ✅   COMPLETE  ⬆ empresa por interfaz (asignada y revertida en la EXP)
 05 Contractual Function           ✅  ✅  ✅   COMPLETE  reforzada: sus reglas de permiso ya APLICAN (31acf1f)
 06 Entity Admin                   ✅  ✅  ✅   COMPLETE  ⬆ PASO 14 cerrado; 2º custodio = gate humano, no capa
 07 Project Admin                  ✅  ✅  ✅   COMPLETE  ⬆ guardia_administrativa gobierna membresía y permisos
 08 Member Tool Access             ✅   —   —   DEFER     sin trigger (re-confirmado 23-ago)
 09 Resource Permission            ✅  ✅  ✅   COMPLETE  ⬆ doc 75: tres sujetos + inspector explicable
 10 Workflow Authorization         ✅  ✅  ✅   COMPLETE  sin cambio
 11 Responsibility / BIC           ✅  ✅  ✅   COMPLETE  sin cambio
 12 Identity & Access UX           ✅  ✅  ✅   COMPLETE  ⬆ doc 72
```

**Única PARTIAL: la 02.** Todo lo que la compone funciona por partes
(Usuarios, catálogo de empresas, configuración); falta la pantalla que las
reúne. No bloquea el piloto.

## Correcciones al doc 75 (medidas el 23-ago, honestidad de mapa)

El doc 75 declaró la distancia al piloto sin dos cosas que aparecieron al
montar la pista real del piloto por la interfaz:

| Hallazgo | Clase | Estado |
|---|---|---|
| **El correo de invitación no se envía en producción**: no hay `RESEND_API_KEY`. G1 degrada con gracia al enlace copiable — correcto como diseño, insuficiente para un externo, que espera un correo y no un enlace por WhatsApp | **SHOULD HAVE del piloto** (sube desde «no listado») | ABIERTO — configurar la clave en Render |
| **`/api/hubs` chocaba**: dos rutas (municipalidades locales vs cuentas APS) y con `DEPLOY_PROFILE=completo` ganaba la de Autodesk; el desplegable de «Crear proyecto» salía vacío y la obra nacía colgada del hub de respaldo | Defecto real de producto | **CERRADO** — el portal pide `/api/portal/hubs`, con contrato que lo fija |

Ninguno mueve una capa de estado: el primero es configuración de entorno, el
segundo era un choque de caminos entre los dos productos del mismo backend.
