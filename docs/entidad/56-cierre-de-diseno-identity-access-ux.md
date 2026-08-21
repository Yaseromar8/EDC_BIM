# CIERRE DE DISEÑO — IDENTITY & ACCESS UX

**Fecha:** 21 de agosto de 2026 · Cierra los cuatro puntos abiertos del doc 55, **contra el código real**.
**No se implementa nada. No se toca producción, ni la ventana, ni `frontend-react`.**

**Secuencia fijada:** `DISEÑO — AHORA (este documento)` · `IMPLEMENTACIÓN — DESPUÉS DE LA CONTROLLED WINDOW`. Esta fase **no entra** en el paquete pendiente de despliegue: la ventana conserva su alcance congelado.

---

## 1 · SESIONES — la contradicción, resuelta

**El doc 55 se contradecía y la respuesta es: existe un G4, y es backend nuevo.**

Lo auditado (`auth_middleware.py`):

- La tabla `sessions` guarda: `token` (huella, no el token), `user_id` (FK CASCADE), `created_at`, `expires_at`, `is_active`. **No guarda** dispositivo, IP ni último uso.
- **No existe ninguna ruta** que liste sesiones ni que revoque UNA sesión concreta. Lo que existe: logout (la propia), y revocación **total** por cambio de rol, activación de 2FA, reset de contraseña y suspensión.
- `validate_session` comprueba `is_active` del usuario en cada petición («defensa en profundidad») — eso sí está.

**Resolución:**

| | |
|---|---|
| **P6 v1** (esta fase) | Contraseña + 2FA + un botón honesto: **«Cerrar TODAS mis otras sesiones»** — la revocación total ya existe como mecanismo; solo se expone. Sin lista |
| **G4 — gestión de sesiones** (declarado, backend nuevo) | Listar las propias y cerrar una: exige **rutas nuevas** y **columnas nuevas** (`user_agent`, `ip`, `last_used_at` — hoy no hay nada que mostrar). Migración de esquema ⇒ **post-window en su propia ventana de esquema**, nunca colada en esta fase de pantallas |

No se finge que existe: G4 queda declarado como nuevo, con su coste dicho.

---

## 2 · ESTADO DE CUENTA — la derivación propuesta era AMBIGUA; STOP y representación mínima

**`password_hash vacío = PENDIENTE` NO es una invariante válida.** Auditados los cinco caminos:

| Camino | Qué hace de verdad | Efecto sobre la derivación |
|---|---|---|
| Invitación → activación con contraseña | `register` exige el token firmado, fija `password_hash`, emite sesión | ✅ hash deja de estar vacío |
| **Invitación → entrada con Google** | `auth/google` busca por correo y **si el usuario existe, entra — sin mirar `password_hash`** y **sin fijarlo nunca** | ❌ **ROMPE LA INVARIANTE**: un invitado con Gmail entra, trabaja durante meses… y su hash sigue vacío. «Pendiente» mentiría |
| Recuperación | `forgot-password` se niega si el hash está vacío («no hay nada que restablecer») | ✅ no interfiere |
| Suspensión | `is_active=FALSE`, sesiones revocadas, último admin protegido | ✅ ortogonal al hash |
| Reactivación | **No existe** (G2) | — |

Dos hallazgos colaterales de la misma auditoría, para el orden de implementación:

- **`auth/google` no comprueba `is_active`**: un suspendido obtiene un `session_token` (el daño real lo frena `validate_session`, que rechaza cada petición — pero el login «exitoso» de un suspendido es incorrecto y deja fila de sesión).
- **`register` tampoco comprueba `is_active`**: una invitación revocada-por-desactivación podría aún «reclamarse» (de nuevo, `validate_session` frena el uso; el estado queda sucio).

**Representación mínima correcta** (decisión propuesta, **no se agrega ahora** — es migración post-window):

```
users.activated_at TIMESTAMP NULL          ← UNA columna, nada más

PENDIENTE  = activated_at IS NULL  AND is_active
ACTIVO     = activated_at NOT NULL AND is_active
SUSPENDIDO = NOT is_active                  (ortogonal: pendiente o activo por debajo)
```

- Se fija en `register` (al reclamar) **y** en la primera entrada Google de un usuario sin activar — con eso el camino Google deja de romper el estado.
- **Backfill sin adivinar:** `activated_at := created_at` donde `password_hash <> ''` (activación demostrada); los pendientes reales (producción tiene 2) se quedan NULL, que es la verdad.
- **Tests de la invariante:** los tres estados derivan igual por los cinco caminos; Google-primera-entrada activa; suspensión no toca `activated_at`; reactivación tampoco.

---

## 3 · SEMÁNTICA DE INVITACIÓN / REENVÍO / REVOCACIÓN

### «Revocar = purgar» queda RECHAZADO por los datos reales

**Un pendiente SÍ puede tener relaciones — producción lo demuestra hoy**: dos `(Invitado pendiente)` son **miembros de la obra `1`** (`project_users`). Y las FKs hacen la purga destructiva:

| Referencia a `users` | Al purgar |
|---|---|
| `project_users.user_id` | **CASCADE** — borra la membresía |
| `encargos.destino_usuario` | **CASCADE** — **borra sus deudas**: reescritura de responsabilidad |
| `doc_rfis`/`doc_redlines.responsable_id` | **SET NULL** — un RFI abierto pierde a su responsable en silencio |
| `folder_permissions.user_id` · `sessions` · `totp_recuperacion` | CASCADE |
| `transmittals.recipients` (JSONB) · `activity_log` (texto) | **sin FK** — quedan referencias colgantes / irresolubles |

### Semántica definitiva

```
REVOCAR INVITACIÓN (siempre disponible sobre un PENDIENTE):
  1. is_active = FALSE                      ← mata el reclamo y la entrada Google
     (exige las correcciones: register y auth/google comprueban is_active)
  2. PURGA solo si el chequeo de relaciones da CERO:
     sin project_users, sin encargos, sin responsable_id, sin apariciones
     en recipients, sin actividad propia
     → entonces sí: nunca actuó y nadie lo referencia; el DELETE es limpio
  3. Con CUALQUIER relación: queda desactivado, identidad conservada.
     La historia no se reescribe para ahorrar una fila.
```

### Reenviar, y los tokens anteriores — dicho expresamente

Los tokens son **sin estado** (`itsdangerous`, firmados, `max_age` 14 días; contenido `{email, role}`). Por tanto:

> **Reenviar NO invalida el enlace anterior. Ambos siguen siendo válidos** hasta que ocurra lo primero de: (a) **caducidad** (14 días desde su emisión); (b) **muerte por estado** — el reclamo comprueba que la cuenta siga pendiente, así que la **activación** (por cualquiera de los dos enlaces, o por Google) mata todos los demás, y la **revocación** (con las correcciones de `is_active`) también.

No existe hoy mecanismo de invalidación por-token, y **no se inventa uno**: la invalidación **por estado** cubre los dos casos que importan (ya entró / ya no debe entrar). El kill-switch de un enlace enviado a quien no debía es **revocar**, y así se documenta en la pantalla.

### Hallazgo colateral (mismo mecanismo): el enlace de reset

El correo promete «solo puede usarse una vez», pero el token (`{uid, email}`, 1 h) es igual de sin-estado: **dentro de su hora puede usarse dos veces**. Corrección de una línea para la fase: incluir la **huella del `password_hash`** en el token — al cambiar la contraseña, el enlace muere solo. (Mitigante actual: cada uso cierra todas las sesiones.)

---

## 4 · LOS RESULTADOS DEFINITIVOS

### GAPS BACKEND DEFINITIVOS

| # | Gap | Naturaleza |
|---|---|---|
| G1 | Correo de invitación no se envía (enlace copiado a mano) | Llamada a `mailer` que ya existe |
| G2 | Reactivación no existe | Ruta nueva pequeña, simétrica de suspender |
| G3 | Ciclo de invitación (reenviar / revocar con la semántica de §3) | Rutas nuevas pequeñas |
| **G4** | Gestión de sesiones (listar/cerrar una) | **Backend nuevo + columnas nuevas** — post-window, ventana de esquema propia |
| **G5** | `auth/google` y `register` no comprueban `is_active`; Google no activa el estado | Correcciones de coherencia, requisito de §2 y §3 |
| G6 | Reset reutilizable dentro de su hora | Huella del hash en el token |
| **G7** | Columna `users.activated_at` | **Única migración de esquema de la fase** (junto a G4 si se aprueba) |

### GAPS FRONTEND DEFINITIVOS

P1 Login con identidad propia · P2 Activación dedicada (**verificar antes el rewrite de `/registro`** en el static site) · P3 Usuarios de la entidad con estado real + invitar/reenviar/revocar/suspender/reactivar · P4 Ficha de persona (escalera, solo lectura) · P5 Añadir persona a obra en Participantes · P6 v1 Mi cuenta (contraseña + 2FA + cerrar otras sesiones)

### MODELO DE ESTADO · SEMÁNTICA DE INVITACIÓN · SESIONES

Los de §2, §3 y §1 — definitivos.

### E2E DEFINITIVOS

Los 10 del doc 55 §8, más: **11** — invitado entra por Google → queda ACTIVO (y su hash vacío no lo devuelve a «pendiente»); **12** — suspendido no entra por Google ni reclama invitación; **13** — revocar con relaciones desactiva sin purgar, y sin relaciones purga; **14** — reenviar: el enlace viejo muere al activarse por el nuevo; **15** — reset usado dos veces: el segundo falla.

### ORDEN DE IMPLEMENTACIÓN — TODO POST-WINDOW

```
0  CONTROLLED WINDOW                        (alcance congelado; esta fase NO entra)
────────────────────────────────────────────
1  G5 — coherencia is_active/activación      (sin esquema; es requisito de todo lo demás)
2  G7 — activated_at + backfill + invariante (la única migración; con su ensayo)
3  G1–G3 — correo, reactivar, ciclo          (rutas pequeñas sobre 1 y 2)
4  P3 → P2 → P1 — pantallas de entidad, activación, login
5  P4 · P5 · P6 v1                           (ficha, membresía, mi cuenta)
6  G6 — reset de un solo uso                 (independiente; puede adelantarse)
7  E2E completos (1–15)
────────────────────────────────────────────
G4 — sesiones: SU PROPIA decisión y ventana de esquema, después de 1–7
```

---

## 5 · TABLERO MAESTRO — capa 12

El estado de la capa **no cambia** (`PARCIAL` — ahora con diseño **cerrado**). Se actualiza solo su «siguiente acción» en doc 54: → *implementación post-window según doc 56*.

**STOP.**
