# NOTA FINAL — AUTORIDAD DE REVOCACIÓN

**Fecha:** 21 de agosto de 2026 · Resuelve la única cuestión abierta de la adenda 02 (§B.1, guardia 2).
**Sin código. Sin producción. Sin ventana. Sin pantallas. Los demás puntos no se reabren.**

---

## VEREDICTO

```
REQUIERE ESTADO AUTORITATIVO
```

`auth_events` **no** es un event store autoritativo — y no por accidente: está
**deliberadamente diseñado para no serlo**. La guardia temporal de la adenda 02
queda **retirada** y sustituida por el mínimo estado autoritativo (§3).

---

## 1 · POR QUÉ `auth_events` ES AUDITORÍA Y NO AUTORIDAD — con su propio código

**a. Su contrato es best-effort, por diseño.** El docstring de `registrar_evento`:

> *«Deja rastro de los accesos. **Nunca revienta la petición por fallar.**»*

Todo el cuerpo va dentro de `try/except` que traga cualquier excepción y sigue.
Es la decisión **correcta** para auditoría — un log caído no puede tumbar el
login — y es exactamente lo que lo **descalifica como autoridad**: si el INSERT
falla durante una revocación, la revocación procede igual y **el marcador de
frontera nunca existe**. Una guardia que consulta ese marcador falla **abierta**
en el único momento en que importa.

**b. No es atómico con el cambio de estado.** El evento se escribe en **su
propia conexión y su propio commit**, separado del `UPDATE users SET
is_active=FALSE`. Puede confirmar uno y no el otro, en cualquier orden.

**c. Lo que sí tiene — inmutabilidad por privilegio** (`REVOKE UPDATE, DELETE,
TRUNCATE … FROM ecd_app`) — lo hace **evidencia** excelente. Permanencia e
inmutabilidad no convierten un registro en autoridad: la autoridad exige
escritura garantizada y atómica con la decisión. Este log garantiza lo
contrario a propósito.

**Principio que queda fijado:** `ESTADO AUTORITATIVO DE INVITACIÓN` ≠
`REGISTRO DE AUDITORÍA`. Las decisiones de autorización se toman contra la fila;
`auth_events` narra, no gobierna.

## 2 · LA COMPARACIÓN TEMPORAL, VALIDADA — y también falla

Medido hoy, no supuesto:

| Lado | Reloj | Resolución |
|---|---|---|
| `ts(token)` — itsdangerous | **servidor de aplicación** (Render) | **1 segundo** (`microsecond=0`, demostrado ejecutándolo) |
| `creado_en` — PostgreSQL `NOW()` | **servidor de base** (Cloud SQL) | microsegundos |

Dos relojes distintos y resolución de un segundo: en `revocar → reinvitar` muy
próximos, el orden real y el orden medido pueden divergir dentro de la ventana
de sesgo entre máquinas — abierto o cerrado según hacia dónde apunte el sesgo,
y **ambiguo por construcción** dentro del mismo segundo. Una guardia de
seguridad no puede depender de la sincronía de dos relojes que nadie garantiza.

## 3 · EL MÍNIMO ESTADO AUTORITATIVO

**Un entero en la fila y un campo en el token. Nada más.**

```
users.invitacion_gen  SMALLINT NOT NULL DEFAULT 0     ← la generación vigente

emitir / re-emitir invitación:
    invitacion_gen := invitacion_gen + 1               (mismo UPDATE, misma
    token.payload = {email, gen}                        transacción que el acto)

reclamo (register) — condición one-shot definitiva:
    activated_at IS NULL
  ∧ is_active
  ∧ email(token) = email(fila)
  ∧ gen(token) = invitacion_gen(fila)                  ← sustituye a ts(token)
```

Por qué es suficiente y por qué es mínimo:

- **Sin relojes**: igualdad de enteros. La ambigüedad temporal de §2 desaparece
  por construcción, no por sincronización.
- **Atómico y autoritativo**: la generación cambia en la **misma transacción**
  que el acto que la cambia. No hay «marcador que no llegó a escribirse».
- **Sin depender del log**: `auth_events` sigue narrando (`usuario_desactivado`,
  y el `login_ok` de Google de G5a) — como evidencia, que es su diseño.
- **Resurrección imposible**: re-invitar incrementa `gen`; el token filtrado
  lleva la generación anterior y muere **aunque no haya habido revocación** —
  lo que además **mejora la semántica de reenvío** de la adenda 01: reenviar
  ahora SÍ invalida el enlace anterior, sin inventar invalidación por-token.
- **Un solo dato nuevo**: viaja en la **misma y única migración** ya aprobada
  (G7), que pasa a llevar dos columnas (`activated_at`, `invitacion_gen`) en la
  misma ventana de esquema. El payload del token cambia a `{email, gen}` — y
  `role` sale, como ya recomendó la adenda 01 §2.

**Compatibilidad con lo emitido:** los tokens vigentes de hoy no llevan `gen`.
Regla de transición, sin excepción permanente: `gen(token) ausente` se trata
como `gen = 0`, que solo casa con filas nunca re-emitidas — los pendientes
actuales siguen pudiendo reclamar, y el primer reenvío o revocación los mata.
La excepción se extingue sola a los 14 días.

## 4 · QUÉ CAMBIA EN LAS ADENDAS

- **Adenda 02 §B.1 guardia 2 y §B.2**: la cláusula `ts(token) > última
  desactivación` queda **retirada**; la sustituye `gen(token) = invitacion_gen`.
  La guardia 1 (REVOCADA ≠ SUSPENDIDA; reactivación inaplicable a invitaciones)
  **no cambia**. La tabla de estados **no cambia** — solo la columna «efecto
  sobre tokens viejos», que ahora dice *«mueren por generación»* en re-invitación
  y reenvío.
- **Adenda 01 §3** (reenvío no invalida): **mejorada** — con `gen`, sí invalida.
- Orden de implementación: **sin cambios** (G7 absorbe la columna).

---

```
DISEÑO IDENTITY & ACCESS UX — CERRADO
```

**STOP.**
