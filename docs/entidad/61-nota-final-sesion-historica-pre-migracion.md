# NOTA FINAL — SESIÓN HISTÓRICA PRE-MIGRACIÓN

**Fecha:** 21 de agosto de 2026 · Último caso del diseño Identity & Access UX.
**Sin código. Sin producción. Sin ventana. Nada de lo cerrado se reabre.**

---

## VEREDICTO

```
REQUIERE AJUSTE — el caso real es C
```

…y el ajuste mínimo queda incorporado al diseño (§3). Con él, el diseño cierra.

---

## 1 · COMPORTAMIENTO ACTUAL — leído, no presupuesto

| Pieza | Hecho medido en el código |
|---|---|
| `sessions` | Viven **7 días** (`expires_at = now + timedelta(days=7)`) |
| `google_auth` | **Hoy crea sesiones para cuentas con hash vacío** — es exactamente el origen del escenario |
| `validate_session` | Comprueba: huella del token, `s.is_active`, `s.expires_at`, `u.is_active`. **Nada sobre activación** — y con caché en memoria de **15 s** por worker |
| `revoke_all_sessions` | Existe, por usuario — pero **nadie lo llama en la migración diseñada** |
| Migración G7 (docs 58/60) | Adjudica y escribe `activated_at`. **No toca `sessions`** |

**A es falsa** — la migración diseñada no invalida nada.
**B es falsa** — ningún perímetro diseñado hasta hoy mira `activated_at`.
**C es el caso real.**

## 2 · EL RIESGO, EXISTE Y ACOTADO

Una cuenta AMBIGUA que entró por Google en los 7 días previos a M y es
adjudicada PENDIENTE conserva una sesión que `validate_session` seguirá
aceptando (`is_active=TRUE`, no caducada, y el usuario activo). Resultado: una
identidad **operativamente PENDIENTE con acceso efectivo**, hasta 7 días después
de M. El state machine diría una cosa y el perímetro haría otra — precisamente
la clase de divergencia que este proyecto ha pagado ya varias veces.

## 3 · CONDICIÓN AUTORITATIVA FINAL — el ajuste mínimo, en dos piezas

**3.a — Invariante permanente de perímetro** *(la condición autoritativa)*:

```
SESIÓN VÁLIDA  ⇒  activated_at IS NOT NULL
```

Se añade a la misma consulta de `validate_session` que ya comprueba
`COALESCE(u.is_active, TRUE)` — el patrón «defensa en profundidad» que ese
código ya practica. **No rechaza ninguna sesión legítima, demostrable por
enumeración de los emisores**: login por contraseña ⇒ hash fijado ⇒ activada
(backfill o reclamo); `register` ⇒ fija `activated_at` en el mismo acto;
Google ⇒ G5b la fija en la primera entrada; canje 2FA ⇒ camino de contraseña.
No existe camino que emita sesión para una no-activada — el invariante solo
puede morder residuos, que es su oficio.

**3.b — En G7, misma transacción que la adjudicación:**

```
UPDATE sessions SET is_active = FALSE
 WHERE user_id IN (filas adjudicadas PENDIENTE)
```

SQL directo **dentro de la transacción de la migración** — no el helper
`revoke_all_sessions`, que abre su propia conexión y rompería la atomicidad. Si
la migración se deshace, la revocación también; llegan juntas o ninguna.

**Por qué las dos:** 3.b cierra el caso **en el instante M**, aunque el código
del perímetro nuevo aún no esté sirviendo; 3.a lo hace **estructuralmente
imposible para siempre**, cubra lo que cubra el futuro. Residuo declarado: el
caché en memoria — **≤ 15 segundos por worker**, acotado y dicho.

**E2E nº 19:** cuenta con sesión pre-M adjudicada PENDIENTE ⇒ su sesión no
valida tras M; y una cuenta legítima recién activada ⇒ su sesión sí.

## 4 · IMPACTO SOBRE LA MIGRACIÓN G7

- G7 suma el `UPDATE sessions` de 3.b a su transacción única. Sigue siendo
  **una** migración, **una** ventana de esquema, con su ensayo — que añade la
  comprobación 19.
- El orden de implementación de la adenda 01 §4 **no cambia**; 3.a entra en el
  mismo paquete de código de G5a (tocan la misma zona del perímetro).

## 5 · CORRECCIÓN SEMÁNTICA DOCUMENTAL

Donde el doc 60 dice que el Entity Admin «declaró que esta persona no ha
entrado», léase — porque la entrada histórica es indecidible y así quedó
demostrado:

> **Adjudicar PENDIENTE significa únicamente: «esta identidad debe quedar
> operativamente en estado PENDIENTE».**

No es una afirmación sobre el pasado; es una orden sobre el presente. Y con 3.a
+ 3.b, esa orden es **completa**: estado pendiente ⇒ sin acceso efectivo, sin
importar qué sesiones existieran antes de M.

---

```
DISEÑO IDENTITY & ACCESS UX — CERRADO DEFINITIVAMENTE
```

**STOP.**
