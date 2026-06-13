# ROLLOUT — Despliegue a producción (rama `cimientos-escalables`)

Runbook para llevar a producción TODO lo construido. **`main` está intacto**
(no se mueve hace semanas); todo vive en `cimientos-escalables` (~40 commits).
El merge a `main` es **limpio (0 conflictos, verificado)**.

> Regla de oro: **probar local → mergear → desplegar → recién entonces activar el enforce.**

---

## 0. Antes de empezar — confirma el wiring de deploy

El remote de git es `old-origin → github.com/yaseromarsanchez8-arch/VISOR_ECD.git`,
pero los deploys apuntan a `visor-ecd-backend.onrender.com` y a un sitio Netlify.
**Confirma cuál remote/rama dispara producción** antes de hacer `git push`. Si no
estás seguro, revisa en los dashboards de Netlify y Render qué repo/branch tienen conectado.

- **Netlify** (frontend-react / visor): `base=frontend-react`, `npm run build`, publica `dist`.
  Reconstruye solo → el `dist/` commiteado se ignora (no te preocupes por ese ruido en git).
- **frontend-docs**: sitio Netlify aparte (no está en este `netlify.toml`). Verifica su deploy.
- **Render** (backend): `pip install -r backend/requirements.txt` + gunicorn.

---

## 1. Qué se despliega (grandes bloques)

**Cimientos (seguridad/identidad):** asset_user_data, cierre del backdoor DEMO_TOKEN,
`project_id` canónico + dual-read, authz por proyecto (log-only), hardening de auth,
pins por externalId, update transaccional.

**Gestión documental (≈90% de ACC Docs):** coherencia de clicks, frentes 3D desde BD,
control de versiones corregido + guards de seguridad (promote/restore/permanent-delete/share),
visor PDF propio (calibración, medición, anotaciones), comparación de versiones PDF (overlay),
búsqueda global, log de actividad, flujos de revisión/aprobación, transmittals, atributos
personalizados, conjuntos (sets), filtro por estado, **enlaces compartidos con expiración/revocación**.

**Comparador:** scope multi-modelo + diff 5D por elemento (hover), leyenda fija.

---

## 2. Variables de entorno (Render — backend)

| Variable | Producción | Para qué |
|---|---|---|
| `ALLOW_DEMO_TOKEN` | **NO setear** (o `false`) | Mantiene cerrado el backdoor admin |
| `ENFORCE_PROJECT_AUTHZ` | `false` al inicio → `true` tras verificar logs | Bloqueo real por proyecto |
| `STRICT_ISO_VISIBILITY` | `false` al inicio → `true` cuando quieras modo ISO estricto | No-admins solo ven Compartido/Publicado |
| `CORS_ORIGINS` | `https://<dominio-netlify-visor>,https://<dominio-netlify-docs>` | Restringe CORS |
| `ADMIN_PASSWORD` | una contraseña fuerte | Seed de admin sin `admin123` |
| `APS_CLIENT_SECRET` | **valor NUEVO rotado** (ver §3) | Secreto de Autodesk APS |

En **local**: `ALLOW_DEMO_TOKEN=true` en tu `.env` (NUNCA en Render).

---

## 3. Pre-deploy (en orden) — pasos que SOLO tú puedes hacer

1. **Rotar `APS_CLIENT_SECRET`** (está en el historial de git → comprometido):
   - Portal APS (aps.autodesk.com) → tu app → **regenerar el client secret**.
   - Poner el secreto NUEVO en Render (env var). NO commitearlo.
   - El visor sigue funcionando porque usa el secreto del entorno, no del código.
2. **Rotar `admin123`** (la cuenta admin existente sigue con esa clave):
   ```
   cd backend
   $env:ADMIN_PASSWORD="TuPasswordFuerte"
   python set_admin_password.py
   ```
3. **Probar local end-to-end** con `ALLOW_DEMO_TOKEN` SIN setear (simula prod):
   - Entrar por el gateway (frontend-docs) con tu cuenta → abrir el visor.
   - Confirmar que cargan: inventario, presupuesto, vistas, pins, documentos.
   - Editar una celda del inventario → recargar → persiste.
   - Probar: comparar 2 versiones de un PDF, enviar a revisión, crear un transmittal.
   - Si algo da 401 → esa llamada usa `fetch` crudo en vez de `apiFetch`.

---

## 4. Deploy

4. Merge a `main` (limpio):
   ```
   git checkout main
   git merge cimientos-escalables
   git push <remote-de-produccion> main
   ```
   (Netlify reconstruye los frontends; Render redepliega el backend.
   Las tablas nuevas — pdf_markups, doc_reviews, transmittals, custom_attr_*,
   doc_sets, document_shares.revoked, etc. — las crea el arranque del backend
   vía `ensure_*`. No hay migración manual.)
5. Setear las env vars del §2 en Render. **Dejar `ENFORCE_PROJECT_AUTHZ=false`** todavía.

---

## 5. Post-deploy (verificación)

6. Probar la app desplegada igual que en el §3.
7. Logs de Render: deben aparecer `DEMO_TOKEN deshabilitado` y la autorización en log-only.
8. Buscar `[authz][log-only] ... SIN acceso a obra=...`:
   - Si NO aparece para usuarios legítimos → seguro activar el enforce.
9. **Activar bloqueo real**: `ENFORCE_PROJECT_AUTHZ=true`. Re-verificar que tu cuenta entra.
10. (Opcional) **Modo ISO estricto**: `STRICT_ISO_VISIBILITY=true` cuando el equipo
    entienda que los no-admin dejarán de ver los WIP.

---

## 6. Rollback

- **Antes del merge:** nada que revertir; `main` limpio.
- **Después del merge:** `git revert` del merge o redeploy del commit previo. Todo fue
  **aditivo** (columnas/tablas nuevas, nada se borró) → sin pérdida de datos al revertir.
- **Auth rompió algo:** `ALLOW_DEMO_TOKEN=true` temporal en Render para reabrir acceso
  mientras diagnosticas (quitarlo después).

---

## 7. Pendiente (no bloquea producción)

- **Notificaciones por correo** (revisión asignada, transmittal): falta SMTP. La lógica
  de a-quién-avisar ya está; solo falta el proveedor de correo.
- **Filtros del visor desde Postgres** (hoy leen del LMV de Autodesk).
- **Alineamiento/progresivas** vía LandXML (estacionado real).
- **Exportar comparador** (acta de cambios a Excel/PDF).
- **Alembic** (migraciones versionadas) al meter 2º cliente/staging.
- `tokens.css` compartido, más tests (hoy 14 backend, 0 frontend).
