# GATE TÉCNICO — EVIDENCIA COMPLETA E1–E5

**Fecha:** 21 de agosto de 2026 · E1–E4 medidas por el propietario, E5 ensayada en local.
**Nada se ha cambiado en producción.**

---

## LA TABLA

| | Veredicto | Evidencia |
|---|---|---|
| **E1** | **ALERT** — explicado y aceptado | ESTADO C = árbol del 20-ago: sujetos NOT NULL sí, `es_admin` no. Distancia al manifiesto: **exactamente 3 objetos**. Conceder permisos de carpeta **roto en producción desde el 20-ago** (backend viejo × modelo de sujetos). `evidencia-e1-2026-08-21.txt` |
| **E2** | **PASS** | Estado de partida **exacto** del fixture de convergencia: sin `ecd_app`/`ecd_migrator`, todo de `postgres` (38 funciones = 1 nuestra + 37 `pgcrypto`, idéntico al fixture), grants NINGUNO. `postgres` sin `rolsuper` pero con `createrole` — el caso Cloud SQL para el que `00_roles.sql` escribió su GRANT. `evidencia-e1-e2-2026-08-21.txt` |
| **E3** | **ALERT** | 5 de 6 cumplen. Falla **`ENFORCE_PROJECT_AUTHZ`**: el perímetro por obra está en log-only — registra lo que bloquearía, no bloquea. Se enciende **en la ventana, con el backend nuevo**, que es donde está ensayado (la batería corre con enforce). `evidencia-e3-2026-08-21.txt` |
| **E4** | **PASS con notas** | Declarado por el propietario sobre el panel: `DB_USER`, `DB_PASS`, `DDL_EN_CALIENTE`, `ESQUEMA_ESTRICTO`, `AUTH_POLICY_MODE`, `CORS_ORIGINS`, `APP_SECRET`, `SESSION_PEPPER` **presentes**. **Ausentes:** `ENFORCE_PROJECT_AUTHZ` (coherente con E3), `DEPLOY_PROFILE` (el default es el perfil completo; coherente con los 6 puntos de postura), y **`APP_URL`** (nota abajo) |
| **E5** | **PASS** — `DATABASE RESTORABLE = PROBADO` | 89 tablas · 78.171/78.172 · 1 fila en cuarentena anunciada (Demo User) · `RESTAURABLE`. Y el 20-ago ya se había restaurado la **copia real de producción** (83.410/83.410) |

### Notas de E4

- **`APP_URL` ausente**: los enlaces que el backend escribe en correos (invitación, restablecimiento) dependen de ella. No bloquea la ventana; **se añade en la ventana** junto con `ENFORCE_PROJECT_AUTHZ=true`.
- Dos comprobaciones del panel quedaron sin mirar (Start Command; que no exista `CONFIRMAR_CONVERGENCIA_PROPIEDAD`). Riesgo bajo — el servicio arranca normal, lo que descarta un Start Command roto — pero **se re-miran al abrir la ventana**, que para eso repite el paso 0.d.

### Cruces que dan consistencia al conjunto

- E1 (esquema sin `es_admin`) ⇄ E4 (`ESQUEMA_ESTRICTO=false` presente): el servicio arranca *porque* la válvula está abierta.
- E3 (`DDL_EN_CALIENTE_APAGADO` cumple) ⇄ B2: el defecto del decorador era **latente, no activo** — la aplicación no está alterando su esquema.
- E1 (`user_id` nullable=YES) ⇄ manifiesto viejo del commit desplegado (exigía NOT NULL): por eso la válvula tuvo que abrirse el 20-ago. Todo encaja con una sola historia.

---

## VEREDICTO

```
TECHNICAL DEPLOYMENT GATE:
READY FOR CONTROLLED WINDOW
```

**No se ejecuta la ventana.** La evidencia queda presentada; la decisión de
abrirla, la fecha y la hora son del propietario.

### Lo que E1–E4 añaden a la ventana ya diseñada (runbook REV.02)

1. La convergencia creará también los **3 objetos de `es_admin`** — ya lo hacía
   (`construir()` bajo `permitir_ddl()`); E1 lo convierte en verificación
   explícita del paso.
2. Al desplegar el backend nuevo: **añadir `ENFORCE_PROJECT_AUTHZ=true` y
   `APP_URL`** en el mismo cambio de variables del cutover.
3. Los smoke tests deben incluir **conceder un permiso de carpeta en la obra de
   prueba** — es la función rota desde el 20-ago y la prueba de que la ventana
   la cerró.
4. Re-mirar Start Command y la ausencia de `CONFIRMAR_CONVERGENCIA_PROPIEDAD`
   al abrir (paso 0.d de la ventana).

### Lo que este veredicto NO dice

- No dice `FULL ECD DISASTER RECOVERY` (los bytes de GCS tienen su propia
  protección, medida el 20-ago; el residual —mismo proyecto y región— se evalúa
  en el gate del piloto).
- No dice que el piloto externo esté listo: `EXTERNAL DOCUMENT PILOT` se evalúa
  aparte.
- No es una certificación ISO ni de tercero: es nuestro cierre técnico interno,
  con cada afirmación atada a una evidencia versionada.
