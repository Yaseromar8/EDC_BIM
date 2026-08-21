# ADENDA 02 — STATE MACHINE DE IDENTIDAD

**Fecha:** 21 de agosto de 2026 · Cierra los dos problemas materiales (A: backfill; B: revocación/reactivación), con auditoría ejecutada, no inferida.
**Sin código. Sin producción. Sin ventana. Sin pantallas nuevas. Sin capas nuevas.**

---

## A · BACKFILL — INVENTARIO REAL Y CRITERIO SIN INFERENCIA

### A.1 · El hecho que gobierna todo, auditado en el código

**La entrada por Google no deja NINGÚN rastro durable.** `google_auth` no llama a
`registrar_evento` — ni una vez en sus 73 líneas. `login_ok` se escribe **solo**
en el camino de contraseña (`auth.py:406`) y en el canje 2FA (`:1250`). La
sesión es efímera (limpieza de expiradas). Conclusión formal:

> **La pregunta «¿entró por Google?» es INDECIDIBLE retroactivamente** para una
> cuenta que solo entró y miró. Lo decidible es lo POSITIVO: credencial fijada,
> logins registrados, actos autorados.

### A.2 · Inventario real de cuentas passwordless

**Base local `ecd_dr12d`** (medido hoy, solo lectura — 17 cuentas, 5 con clave):

| Filas `password_hash` vacío | Nombre | Logins en `auth_events` | Actos en `activity_log` |
|---|---|---|---|
| **12** (ids 18, 20, 22–29, 31–32) | **todas** `(Invitado pendiente)` | **0** en las 12 | **0** en las 12 |

Universo de eventos del rastro: `login_ok` 35 · `login_fallido` 6 · `2fa_*` 2 —
ninguna clase de evento registra entradas Google, confirmando A.1.

**Producción** (del diagnóstico ya versionado, 5 cuentas):

| id | Evidencia disponible | Clasificación |
|---|---|---|
| 2 (Yaser) | login por contraseña + 2FA **hoy** (E3) ⇒ hash fijado, `login_ok` en el rastro | **ACTIVADA** — evidencia positiva |
| 17, 19 | nombre fijado ⇒ pasaron por `register` (es el único camino que fija nombre desde el payload) ⇒ hash fijado | **ACTIVADA** — evidencia positiva |
| 18, 20 | nombre `(Invitado pendiente)` ⇒ nunca reclamaron ⇒ hash vacío; entrada Google **indecidible** (A.1) | **AMBIGUA** |

### A.3 · Criterio de backfill — mecánico, en tres clases, sin inferir

```
ACTIVADA   ⇔ evidencia POSITIVA:  password_hash <> ''
                                   O auth_events login_ok/2fa con su uid
                                   O actos autorados en activity_log
             → activated_at := created_at   (marcador; semántica de adenda 01 §3:
               valor < M = convencional, nunca fecha histórica)

AMBIGUA    ⇔ hash vacío Y cero evidencia positiva.
             NO se convierte automáticamente en pendiente ni en activada.
             → queda NULL **y listada nominalmente en la evidencia de la
               migración**; la resuelve el Entity Admin fila a fila (es quien
               invitó). Universo CERRADO y enumerable: 12 filas en local,
               2 en producción.

PENDIENTE  ⇔ no existe como clase de backfill: la pendencia no se puede
             demostrar retroactivamente (A.1). Solo la produce una decisión
             humana sobre una AMBIGUA, o el flujo normal post-migración.
```

**Por qué el conjunto AMBIGUA no vuelve a crecer:** tras G5b, la primera entrada
Google **escribe** `activated_at`; y dentro de G5a se añade una línea — `google_auth`
registra `login_ok` como ya hace el camino de contraseña — con lo que el rastro
queda completo hacia adelante. La ambigüedad es un problema del pasado, acotado,
que se resuelve una sola vez.

---

## B · REVOCACIÓN vs REACTIVACIÓN — LA RESURRECCIÓN DEL TOKEN, RESUELTA

### B.1 · La secuencia adversa, sin presuponer

Con **solo** `is_active` como guardia, la secuencia `emitir A → revocar →
reactivar → A funciona otra vez` **es real**: nada en un token sin estado sabe
de la revocación. Lo que la impide no es una esperanza — son **dos guardias
sobre datos que ya existen**:

**Guardia 1 — la reactivación no aplica a invitaciones.** Con `activated_at`,
`REVOCADA (NULL, inactiva)` y `SUSPENDIDA (NOT NULL, inactiva)` son **estados
distintos y distinguibles**. G2 (reactivar) exige `activated_at IS NOT NULL`:
sobre una invitación revocada **no hay botón que apretar**. La única salida de
REVOCADA es la **re-invitación deliberada** (G3).

**Guardia 2 — anti-resurrección en la re-invitación.** Si el admin re-invita,
¿revive también el token viejo (quizá filtrado, que fue el motivo de revocar)?
No, por mecánica ya presente en el sistema:

1. Los tokens **llevan marca de tiempo firmada**: `emitir` usa
   `URLSafeTimedSerializer` («firmado y con marca de tiempo», su propio
   docstring); `leer` ya valida `max_age` sobre esa marca. Exponerla es una
   capacidad de la librería en uso (`return_timestamp`), no infraestructura
   nueva.
2. La desactivación **queda registrada de forma durable**: `usuario_desactivado`
   en `auth_events` (`user_id`, `creado_en`), tabla **append-only por
   privilegio** (`REVOKE UPDATE, DELETE … FROM ecd_app`).
3. Guardia en el reclamo:

```
ts(token) > última auth_events('usuario_desactivado', uid)      — o no hay reclamo
```

El token A es anterior a la revocación **por construcción** (se revocó después
de emitirlo); el token nuevo es posterior. A muere para siempre; el nuevo vive.
El reloj es el del servidor en ambos lados (emisión y evento), así que no hay
carrera de relojes de cliente.

### B.2 · `register` one-shot — condición exacta

```
register reclama  ⇔  activated_at IS NULL
                  ∧  is_active
                  ∧  email(token) = email(fila)
                  ∧  ts(token) > última desactivación(uid)     [B.1]
```

Con `activated_at IS NOT NULL`, **ningún token de invitación vuelve a ejecutar
la activación, nunca** — ni siquiera uno vigente. Esto además cierra un agujero
**del código actual** encontrado en esta auditoría: hoy la guardia es
`password_hash == ''`, así que un activado-por-Google (hash vacío) con un token
aún vigente puede ser «re-reclamado» — nombre, empresa y clave sobrescritos
dentro de los 14 días. Con la condición nueva, muere.

### B.3 · Tabla de estados y transiciones

**Dos campos persistidos, cuatro estados — todos inequívocos:**

| Estado | `activated_at` | `is_active` |
|---|---|---|
| **PENDIENTE** | NULL | TRUE |
| **ACTIVADA** | NOT NULL | TRUE |
| **SUSPENDIDA** | NOT NULL | FALSE |
| **INVITACIÓN REVOCADA** | NULL | FALSE |

*(REACTIVACIÓN no es un estado: es la transición SUSPENDIDA→ACTIVADA.)*

| Transición | Guardia | Efecto sobre tokens de invitación viejos |
|---|---|---|
| invitar → PENDIENTE | correo nuevo | nace el primer token |
| PENDIENTE → ACTIVADA (reclamo) | condición B.2 · fija `activated_at` | **todos mueren** (activated_at NOT NULL) |
| PENDIENTE → ACTIVADA (1ª entrada Google) | G5b · fija `activated_at` | **todos mueren** |
| PENDIENTE → REVOCADA | G3 revocar = `is_active=FALSE` + evento durable | **todos mueren** (`is_active` + quedan < marca) |
| REVOCADA → PENDIENTE (re-invitación) | acto deliberado G3 · nuevo token · `is_active=TRUE` | **siguen muertos** — B.1: `ts ≤ desactivación`; solo el nuevo vive |
| ACTIVADA → SUSPENDIDA | G2/G5a · sesiones revocadas | irrelevantes: ya estaban muertos |
| SUSPENDIDA → ACTIVADA (**reactivación**) | G2 · exige `activated_at IS NOT NULL` — **inaplicable a REVOCADA** | irrelevantes: siguen muertos |
| REVOCADA → (nada por G2) | **no existe la transición** | — |

Ninguna celda depende de estado en el token: toda la máquina vive en la fila y
en un registro append-only.

---

## CONCLUSIÓN

| | |
|---|---|
| **A** | **PASS** — inventario medido (12 local + 2 producción sin clave, cero rastro las 14); criterio mecánico en tres clases; las AMBIGUA quedan NULL, **listadas nominalmente** y resueltas por decisión humana registrada — nunca convertidas por inferencia. El conjunto no crece tras G5a+G5b |
| **B** | **PASS** — REVOCADA ≠ SUSPENDIDA por datos; reactivación inaplicable a invitaciones; anti-resurrección por marca de tiempo firmada contra evento durable append-only; `register` one-shot con condición exacta, que además mata un agujero del código actual |

```
DISEÑO IDENTITY & ACCESS UX — CERRADO
```

Implementación: post-window, orden de la adenda 01 §4 (la condición B.2 y el
evento de Google entran en G5a/G3 sin alterar ese orden). **STOP.**
