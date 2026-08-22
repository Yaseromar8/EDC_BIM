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
