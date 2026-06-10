# ROLLOUT — Cimientos escalables (rama `cimientos-escalables`)

Runbook para llevar a producción el trabajo de cimientos. **`main` está intacto**;
todo vive en la rama `cimientos-escalables` (9 commits). Nada se desplegó aún.

> Regla de oro: **probar local → mergear → desplegar → recién entonces activar el enforce.**

---

## 1. Qué cambió (resumen)

| Commit | Qué hace | Riesgo de deploy |
|---|---|---|
| `ee81f10` asset_user_data | La data del usuario (estado/material/slots) ya no se pierde al actualizar modelos | Bajo (aditivo) |
| `a6bb35f` DEMO_TOKEN + CORS | Cierra el backdoor admin; CORS configurable | **Medio** (auth) |
| `e5a950c` + `4c3a3ae` identidad | `project_id` canónico en todas las tablas + dual-read | Bajo (aditivo) |
| `6845c82` authz por proyecto | Cada usuario solo ve su obra (log-only por defecto) | Bajo (no bloquea aún) |
| `e6c1f81` hardening auth | `/api/inventory`,`/api/presupuesto`,`/api/config/*` exigen sesión | **Medio** (auth) |
| `3c365f0` pins por externalId | Pines siguen al elemento entre versiones | Bajo |
| `b6c12e4` update transaccional | Update/relink ya no dejan el inventario vacío si falla | Bajo |

El riesgo "Medio" es de **auth**: el visor DEBE mandar token (ya lo hace vía gateway + apiFetch). Por eso el paso 3 (probar local) es obligatorio.

---

## 2. Variables de entorno (Render — backend)

| Variable | Producción | Para qué |
|---|---|---|
| `ALLOW_DEMO_TOKEN` | **NO setear** (o `false`) | Mantiene cerrado el backdoor admin |
| `ENFORCE_PROJECT_AUTHZ` | `false` al inicio → `true` cuando todos tengan acceso asignado | Activa el bloqueo real por proyecto |
| `CORS_ORIGINS` | `https://TU-DOMINIO-netlify` (coma-separado si varios) | Restringe CORS |
| `ADMIN_PASSWORD` | una contraseña fuerte | Seed de admin sin `admin123` |

En **local (dev)**, para comodidad: `ALLOW_DEMO_TOKEN=true` en tu `.env` (NUNCA en Render).

---

## 3. Pre-deploy (en orden)

1. **Rotar `admin123`** (el admin existente sigue con esa clave):
   ```
   cd backend
   set ADMIN_PASSWORD=TuPasswordFuerte    # PowerShell: $env:ADMIN_PASSWORD="..."
   python set_admin_password.py
   ```
2. **Probar local end-to-end** (con `ALLOW_DEMO_TOKEN` SIN setear, para simular prod):
   - Entrar por el gateway (`frontend-docs`) con tu cuenta → abrir el visor.
   - Confirmar que **cargan**: inventario, presupuesto, vistas, pins. (Ahora van con token.)
   - Editar una celda del inventario → recargar → el cambio persiste.
   - Si algo da 401: revisar que esa llamada use `apiFetch` (no `fetch` crudo).

## 4. Deploy

3. Merge a `main` cuando local esté OK:
   ```
   git checkout main && git merge cimientos-escalables
   git push
   ```
   (Netlify reconstruye el frontend solo; Render redepliega el backend.)
4. Setear las env vars del paso 2 en Render. **Dejar `ENFORCE_PROJECT_AUTHZ=false`** todavía.

## 5. Post-deploy (verificación)

5. Probar la app desplegada igual que en el paso 2.
6. Revisar logs de Render: deben aparecer
   `[security] DEMO_TOKEN deshabilitado` y `[security] Autorizacion por proyecto: log-only`.
7. En log-only, buscar líneas `[authz][log-only] ... SIN acceso a obra=...`:
   - Si NO aparecen para usuarios legítimos → es seguro activar el enforce.
8. **Activar el bloqueo real**: `ENFORCE_PROJECT_AUTHZ=true` en Render. Re-verificar que tu cuenta sigue entrando.

---

## 6. Migraciones de datos (ya corridas en la BD actual)

Estas ya se ejecutaron contra la BD en uso. Documentadas para entornos nuevos
(staging, otro cliente). Correr una vez, en orden, con el `.env` apuntando a esa BD:

```
cd backend
python migrate_asset_user_data.py      # copia data de usuario (idempotente)
python migrate_project_identity.py     # backfill project_id (idempotente)
python restore_acc_project_id.py        # restaura ACC id en model_config (solo si se corrió el backfill)
```
Las columnas las crea el arranque del backend (`ensure_*`), así que estos scripts
solo hacen el backfill.

---

## 7. Rollback

- **Antes del merge:** nada que revertir; `main` está limpio.
- **Después del merge:** `git revert` del merge, o redeploy del commit previo. La tabla
  `inventory_assets` y todos los datos viejos quedaron **intactos** (todo fue aditivo),
  así que no hay pérdida de datos al revertir.
- **Auth rompió algo:** set `ALLOW_DEMO_TOKEN=true` temporalmente en Render para
  reabrir acceso mientras se diagnostica (recordar quitarlo después).

---

## 8. Pendiente (no bloquea producción)

- **Fase 5** — Alembic (migraciones versionadas). Hacer al meter 2º cliente/staging.
- **Fase 6 (resto)** — cola de jobs (RQ+Redis), sesión/rate-limit a Redis, logging con
  niveles (reemplazar `print`), `except:` desnudos, suite `pytest` + CI.
- Re-anclaje visual de pins a la nueva posición del elemento (hoy se guarda el `externalId`).
