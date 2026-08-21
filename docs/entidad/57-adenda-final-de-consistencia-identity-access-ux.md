# ADENDA FINAL DE CONSISTENCIA — IDENTITY & ACCESS UX

**Fecha:** 21 de agosto de 2026 · Cierra los cinco puntos de verificación, contra el código real.
**Sin código nuevo. Sin producción. Sin ventana. Sin `frontend-react`. Sin capas nuevas.**
Donde esta adenda contradice al doc 56, **manda la adenda**.

---

## 1 · «Cerrar todas mis otras sesiones» — demostrado, con una precisión

El mecanismo exacto **ya existe y ya está en uso en producción de facto**:

```python
# auth_middleware.py:314
def revoke_all_sessions(user_id, excepto=None):
    ...
    if excepto:
        UPDATE sessions SET is_active = FALSE
         WHERE user_id = %s AND token <> %s AND is_active = TRUE
               -- %s = hash_de_token(excepto)
```

Y **el parámetro `excepto` no es teórico**: `change-password` lo llama hoy con
`excepto=actual` (`routes/auth.py:710`) — cambiar la contraseña cierra todas las
sesiones **menos la que está cambiándola**. La semántica «otras = todas excepto
el token de esta petición» está implementada, probada por uso, y con su
invalidación de caché en memoria incluida.

**La precisión que faltaba reconocer:** lo que NO existe es una **ruta** que lo
haga sin cambiar la contraseña. Exponer el botón de P6 exige un endpoint nuevo,
aunque sea de tres líneas sobre un helper ya rodado. Queda declarado:

| | Qué es | Esquema |
|---|---|---|
| **G4a** — «cerrar mis otras sesiones» | **Ruta nueva** que envuelve `revoke_all_sessions(uid, excepto=token_actual)` | **Ninguno** — puede ir con las pantallas |
| **G4b** — listar/cerrar UNA | Rutas + columnas (`user_agent`, `ip`, `last_used_at`) | **Sí** — decisión y ventana propias, al final |

P6 v1 = contraseña + 2FA + G4a. El doc 56 decía «solo se expone»; lo exacto es
«se expone **mediante una ruta nueva** sobre un mecanismo existente».

---

## 2 · El `role` del token de invitación — la autoridad actual prevalece, demostrado

Leído el camino completo de reclamo (`routes/auth.py:599–622`):

1. El token se usa **solo como prueba de autorización para reclamar**: de su
   contenido se lee **únicamente `email`**, que debe casar con la fila.
   **`datos.get('role')` no se lee jamás en el reclamo.**
2. El `UPDATE` del reclamo fija `name, password_hash, company_id, job_title_id`
   — **`role` no está en la lista**.
3. El rol con el que la persona queda dentro es `u_role`: **el de la FILA**,
   leído de la base en ese momento.

**El escenario adverso, resuelto:** invitación emitida con `role=admin`
(token A) → el Entity Admin corrige la fila a `user` (`PATCH /users/<id>/role`)
→ token A sigue firmado y vigente → quien reclama con token A entra como
**`user`**: la metadata histórica del token **no puede restaurar ni sobrescribir
autoridad**. La única vía por la que el `role` del token toca la base es el
`INSERT` **en el momento de invitar** — después es letra muerta.

**Nota de diseño para G3 (reenviar):** el token nuevo debe tomar el rol **de la
fila**, no repetir el del token viejo — y dado que el reclamo nunca lo lee, la
recomendación es **dejar de incluir `role` en el payload** de los tokens nuevos:
metadata que no gobierna nada solo puede confundir a quien la lea.

---

## 3 · `activated_at` — semántica formal

```
DEFINICIÓN    activated_at es un MARCADOR DE ESTADO, no un registro histórico.

SIGNIFICADO   activated_at IS NOT NULL  ⇔  la cuenta completó activación.
              Es la NULIDAD lo que porta significado probatorio, no el valor.

VALOR         Sea M el instante de la migración que crea la columna (queda
              registrado en su evidencia):
                · activated_at ≥ M  → escrito por un CAMINO DE ACTIVACIÓN
                  (reclamo, o primera entrada Google de una cuenta sin activar):
                  fecha REAL del acto.
                · activated_at < M  → BACKFILL CONVENCIONAL (= created_at):
                  significa «activada en fecha no registrada, no anterior a
                  created_at y no posterior a M». NUNCA se presenta como fecha
                  histórica de activación.
              El discriminador es formal, no heurístico: la columna no existía
              antes de M, así que todo valor < M es, por construcción, backfill.

BACKFILL      activated_at := created_at  DONDE password_hash <> ''
              (la activación está demostrada; su fecha, no).
              Los pendientes reales quedan NULL — que es la verdad.

UI            Para valores < M: «activa (anterior al registro de activaciones)».
              Jamás «activada el <fecha>». Quien necesite evidencia de fechas
              usa auth_events, que sí es un registro de actos.

ORTOGONAL     is_active. Suspender/reactivar no toca activated_at nunca.
```

---

## 4 · Dependencia G5/G7 — corregida

Tenías razón: Google no puede escribir una columna que no existe. G5 se parte:

| | Contenido | Depende de |
|---|---|---|
| **G5a** | `auth/google` y `register` comprueban `is_active` (hoy no lo hacen; `validate_session` es la única red) | **Nada** — sin esquema, va PRIMERO |
| **G5b** | La primera entrada Google de una cuenta sin activar **fija `activated_at`** | **G7** — va después de la migración |

**Orden corregido (sustituye al del doc 56 §4):**

```
0   CONTROLLED WINDOW                       (intocada)
1   G5a  coherencia is_active               (sin esquema)
2   G7   activated_at + backfill + G5b      (la única migración, con su ensayo)
3   G1–G3  correo · reactivar · ciclo       (con la semántica de §5)
4   P3 → P2 → P1 · P4 · P5 · P6 v1 (+G4a)   (pantallas; G4a no lleva esquema)
5   G6   reset de un solo uso               (independiente)
6   E2E 1–15  (+16: «otras sesiones» conserva exactamente la actual;
              +17: reclamar con un token de rol viejo NO restaura autoridad)
────
G4b  sesiones con detalle: decisión y ventana de esquema PROPIAS, después
```

---

## 5 · Purga de pendientes — se adopta CONSERVAR, porque la ausencia total no es demostrable

Para demostrar «cero historia» habría que probar ausencia también en lo que
**no tiene clave ajena**, y eso no resiste:

| Dónde puede vivir la referencia | Por qué el chequeo no es fiable |
|---|---|
| `transmittals.recipients` / `acuses` (JSONB) | `user_id` dentro de JSON: sin FK, sin índice de integridad |
| `historial` de RFI / Red Line / Reviews (JSONB) | actores por id y por texto |
| `activity_log.performed_by`, `auth_events` (TEXTO) | nombre o correo: homónimos, renombres |
| adopciones, `granted_by`, comentarios, campos `por`/`registrado_por` | mezcla de id y texto según la generación del dato |

Un barrido textual que hoy dé cero no **demuestra** ausencia — solo no encontró.
Y sobre borrar historia, «no encontré» no alcanza. Por tanto, **sustituyendo al
doc 56 §3.2**:

```
REVOCAR INVITACIÓN = DESACTIVAR. SIEMPRE. La identidad se conserva.
La purga NUNCA es parte de la revocación ni es automática.
Lo que ya existe (?purgar=1) queda como acto humano explícito y separado,
y la pantalla de G3 no lo ofrece.
```

Coste de conservar: una fila. Coste de purgar mal: reescribir el expediente.
No hay decisión que tomar ahí.

---

## CIERRE

Los cinco puntos quedan demostrados o corregidos — dos de ellos contra el doc
56, que esta adenda enmienda (orden de implementación; purga).

```
DISEÑO IDENTITY & ACCESS UX — CERRADO
```

Implementación: **después de la CONTROLLED WINDOW**, en el orden del §4.
La ventana conserva su alcance congelado. **STOP.**
