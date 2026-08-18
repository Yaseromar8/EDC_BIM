# Guía: desplegar la instancia de una entidad

**Para:** el propietario, el día que una entidad firme. **Duración real:** ~medio día.
**Modelo:** instancia dedicada (decisión en `10-decision-modelo-de-entidad.md`).
**Resultado:** un portal documental propio de la entidad, aislado físicamente,
con la postura de seguridad completa **desde el día uno** — sin heredar ninguna
de las deudas que esta instancia tuvo que sanear a posteriori.

> Verificado contra el código el 18-ago-2026. Si algo de aquí no casa con lo que
> ves, el código manda y esta guía se corrige — no al revés.

---

## 0 · Lo que hace falta antes de empezar

- Nombre corto de la entidad, sin espacios (ejemplo: `muni-talara`). Aparece en
  los nombres de servicio y bucket.
- Correo del administrador **de la entidad** (quien operará el portal allí).
- Cuenta de Google Cloud (para el bucket) y de Render (para servicio y base).
- El repositorio `Yaseromar8/EDC_BIM` accesible desde Render.

## 1 · La base de datos (Postgres)

Una base **nueva y solo suya**. Cloud SQL (como la actual) o el Postgres de
Render — cualquiera vale; lo innegociable es que no se comparte con nadie.

1. Crear instancia/base `ecd_<entidad>`.
2. Crear el usuario de aplicación (no superusuario): `ecd_app_<entidad>`, dueño
   de la base, **sin** `CREATEDB` y **sin** rol de superusuario.
3. Anotar host, puerto, nombre, usuario y contraseña. **No** escribirlos en
   ningún fichero del repositorio: van solo al panel de Render (paso 3).

## 2 · El bucket (Google Cloud Storage)

1. Bucket nuevo: `ecd-<entidad>-docs`, región `us` (o la que el contrato pida —
   ver plantilla contractual, cláusula de localización).
2. Cuenta de servicio nueva `ecd-<entidad>@…`, con permiso **solo sobre ese
   bucket** (`Storage Object Admin` a nivel de bucket, nunca de proyecto).
   Esto es lo que acota C5: la credencial de esta instancia no puede tocar los
   datos de ninguna otra.
3. Descargar su clave JSON. Va al panel de Render como **Secret File**
   (`gcp_sa.json`), nunca al repositorio.

## 3 · El backend (Render, Web Service)

Nuevo servicio desde `Yaseromar8/EDC_BIM`, rama `main` — el mismo repositorio y
el mismo commit que todo lo demás; lo que cambia es la configuración:

- **Nombre:** `ecd-<entidad>-backend`
- **Runtime Node** (ejecuta `yarn start`, que lanza el bootstrap de esquema y
  después gunicorn — igual que la instancia actual)
- **Plan:** de pago, con 2 GB. Una entidad no puede vivir en un plan que se
  duerme; el costo entra en el precio al cliente.

**Variables de entorno** (todas en el panel; las marcadas `Generate` las genera
Render y no se copian a ningún otro sitio):

| variable | valor | por qué |
|---|---|---|
| `DEPLOY_PROFILE` | `portal` | solo el portal documental: 151 rutas, no 270 |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASS` | los del paso 1 | la base de la entidad |
| `GCS_BUCKET_NAME` | `ecd-<entidad>-docs` | el bucket de la entidad |
| `GOOGLE_APPLICATION_CREDENTIALS` | ruta del Secret File | la credencial acotada |
| `APP_SECRET` | Generate (≥32) | firma de enlaces; sin ella se deriva de la credencial de la base (N65) |
| `SESSION_PEPPER` | Generate (≥32) | pimienta de sesiones y códigos 2FA |
| `CORS_ORIGINS` | la URL del portal del paso 4 | sin ella el backend acepta cualquier origen |
| `DDL_EN_CALIENTE` | `false` | la aplicación no altera su propio esquema |
| `ENFORCE_PROJECT_AUTHZ` | `true` | en instancia nueva se enciende desde el día uno: no hay tráfico legado que proteger |
| `AUTH_POLICY_MODE` | `estricto` | la política declarada manda; sin modo sombra que arrastrar |
| `ADMIN_EMAIL` | correo del admin **de la entidad** | el primer administrador. Sin esta variable, el arranque crea el admin histórico del desarrollador — configurable desde el 18-ago |
| `ADMIN_NAME` | nombre del admin de la entidad | ídem |
| `ADMIN_PASSWORD` | Generate — se entrega al admin por canal seguro y la cambia al entrar | sin ella se genera una aleatoria que solo aparece una vez en el log |
| `APP_URL` | la URL del portal del paso 4 | destino de los enlaces de los correos |
| `MAIL_FROM` | remitente con el dominio de la entidad (o del servicio) | sin él, el correo cae en el remitente de pruebas de Resend, que **solo entrega al buzón del desarrollador**: los restablecimientos de contraseña de la entidad no llegarían |
| `RESEND_API_KEY` | clave de Resend **propia del servicio** | sin ella el correo queda en modo degradado: los enlaces de restablecimiento se quedan en el log para envío a mano |
| `APS_CLIENT_ID` / `APS_CLIENT_SECRET` / `APS_AUTH_URL` / `APS_DATA_URL` | credencial APS | ver DWG/CAD dentro de Documentos traduce vía Autodesk. **Decisión**: credencial APS propia por entidad (limpio) o la común (más simple; los modelos CAD de la entidad pasan por la cuenta APS del proveedor — se declara en el contrato) |

**Qué NO se configura**, a propósito: `ALLOW_DEMO_TOKEN` (jamás), `DATABASE_URL`
(este proyecto no la usa), nada del visor (`ACC_*`, `APS_DOCS_BUCKET`…).

## 4 · El portal (Render, Static Site)

Nuevo Static Site desde el mismo repositorio:

- **Root directory:** `frontend-docs` · **Build:** `npm install && npm run build` · **Publish:** `dist`
- **Variable de build:** `VITE_BACKEND_URL` = la URL del backend del paso 3.
  (Así resuelve el portal dónde está su backend: `src/utils/helpers.js`.)
- Anotar la URL resultante y ponerla en `CORS_ORIGINS` y `APP_URL` del backend
  (paso 3), y redesplegar el backend una vez.

## 5 · Verificación — nada se da por bueno sin medirlo

En orden, y cada una tiene que salir exactamente así:

1. `GET <backend>/api/health` → `configuracion: {completa: true, faltan: 0}`.
   La instancia de la entidad **nace con postura completa**; si dice otra cosa,
   falta una variable del paso 3.
2. El log del primer arranque dice `[perfil] despliegue: portal` y el bootstrap
   termina con las tablas del manifiesto completas.
3. Entrar al portal con `ADMIN_EMAIL` + `ADMIN_PASSWORD` → cambiar la contraseña
   → **activar el 2FA** y guardar los códigos de recuperación en papel.
4. Crear la primera obra, subir un documento de prueba, verlo, descargarlo.
5. **Miembros**: invitar a un segundo usuario, cambiarle el rol — debe funcionar
   desde la pantalla.
6. **Configuración → Exportar el expediente**: bajar el índice y el zip. Si la
   salida no funciona el día uno, no existirá el día que importe.
7. **El ensayo de restauración**, contra esta instancia:
   `python herramientas/copia_de_seguridad.py` + `ensayo_de_restauracion.py`.
   Una instancia sin copia probada no se entrega — es el punto 3 del mínimo.
8. Un usuario **sin** sesión: `<backend>/api/docs/list?path=` → 401. Y una ruta
   del visor: `<backend>/api/lob/timeline` → **404** (el perfil portal no la
   sirve — esa es la reducción de perímetro, medible).

## 6 · Lo que queda declarado (no oculto)

- **C5 acotado, no cerrado:** la cuenta de servicio de la instancia lee su
  bucket por fuera de la aplicación. Alcance: solo esa entidad. Se declara en el
  contrato (cláusula de acceso del proveedor).
- El botón «publicar al visor» responde 404 en perfil portal: esa capacidad es
  del producto visor. Si la entidad lo contrata, se cambia `DEPLOY_PROFILE` a
  `completo` y se despliega el visor — mismo repositorio.
- Los datos viven en `us` (Render/GCS) salvo que el contrato exija otra región.
