# Guía: desplegar la instancia de una entidad

**Para:** el propietario, el día que una entidad firme. **Duración real:** ~medio día.
**Modelo:** instancia dedicada (decisión en `10-decision-modelo-de-entidad.md`).
**Resultado:** un portal documental propio de la entidad, aislado físicamente,
con la postura de seguridad completa **desde el día uno**.

> Verificado ejecutando, el 19-ago-2026, sobre una base **virgen** (clúster
> PostgreSQL 18 creado para la prueba): bootstrap → verificación → arranque →
> login → 2FA completo. Lo que aquí se afirma se midió; lo que no se pudo medir
> se dice en §7. Si algo no casa con lo que ves, el código manda.

---

## 0 · Antes de empezar

- Nombre corto de la entidad, sin espacios (ejemplo: `muni-talara`).
- Correo del administrador **de la entidad** (quien operará el portal allí).
- Cuenta de Google Cloud (bucket) y de Render (servicios y base).
- El repositorio `Yaseromar8/EDC_BIM` accesible desde Render.

## 1 · La base de datos (PostgreSQL)

Una base **nueva y solo suya**.

1. Crear la base `ecd_<entidad>`.
2. Crear el usuario de aplicación `ecd_app_<entidad>`, **dueño de la base**,
   **sin** `CREATEDB` y **sin** superusuario.
3. Instalar la extensión `pgcrypto` (la pone el superusuario del proveedor, una
   vez; la aplicación no puede y no debe poder).

> **Por qué el usuario tiene que ser DUEÑO.** El bootstrap añade columnas a sus
> propias tablas (`ALTER TABLE`). Si no es dueño, esos `ALTER` se rechazan y la
> instancia queda con tablas completas y **columnas ausentes** — que es un fallo
> diferido: no se ve al desplegar, se ve meses después. Desde el 19-ago la
> verificación lo detecta y **para el despliegue**; antes decía «COMPLETO».

## 2 · El bucket (Google Cloud Storage)

1. Bucket `ecd-<entidad>-docs`. **Sin espacio de nombres jerarquico (HNS).**

   > Comprobado el 20-ago-2026 sobre el bucket real: con HNS habilitado, Google
   > **no permite activar el control de versiones de objetos** -- aparece en la
   > lista oficial de capacidades no soportadas, junto con Bucket Lock y Object
   > Retention Lock. La aplicacion no necesita HNS: escribe objetos con nombre
   > plano y nunca renombra carpetas en el bucket. Renunciar a el no cuesta nada
   > y devuelve el versionado.
2. Cuenta de servicio `ecd-<entidad>@…` con permiso **solo sobre ese bucket**
   (`Storage Object Admin` a nivel de bucket, nunca de proyecto).
3. Su clave JSON va al panel de Render como **Secret File**, nunca al repositorio.

> La protección del bucket (soft delete, versionado, copia independiente) está en
> `14-cierre-de-continuidad-y-gate.md` §1 y §2. No se despacha aquí.

## 3 · El backend (Render, Web Service)

Nuevo servicio desde `Yaseromar8/EDC_BIM`, rama `main`, **Root directory
`backend`**, **runtime Node**, build `npm install`, start `npm start`.

**`backend/package.json` es la ÚNICA fuente de verdad del arranque.** Su `start`
ejecuta `bootstrap_esquema.py` y **después** gunicorn con `--workers 1 --threads 4`.
Hubo un `render.yaml` que decía otra cosa (`alembic upgrade head`, 4 workers);
ninguna migración de alembic crea el esquema del segundo factor, así que
aprovisionar desde ahí dejaba la instancia **sin 2FA**. Se retiró el 19-ago, y
una prueba (`test_fuente_de_verdad_del_arranque.py`) impide que vuelva la
divergencia.

**Plan:** de pago, 2 GB (Standard). Medido: ~70 MB residentes por proceso en
reposo; con un expediente real, ficheros de 220 MB y exportaciones completas, el
margen es el producto. En 512 MB ya murió una vez.

### 3.1 · Variables OBLIGATORIAS

Sin alguna de estas, la instancia no funciona o no es segura.

| variable | valor | qué pasa si falta |
|---|---|---|
| `DEPLOY_PROFILE` | `portal` | por defecto `completo`: se exponen 270 rutas en vez de 151 |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASS` | los del paso 1 | por defecto apunta a `localhost/postgres`: no arranca |
| `GCS_BUCKET_NAME` | `ecd-<entidad>-docs` | sin bucket no hay documentos |
| `GOOGLE_APPLICATION_CREDENTIALS` | ruta del Secret File | subir y descargar fallan con 500 |
| `APP_SECRET` | **Generate** (≥32) | la clave de firma se deriva de la credencial de la base |
| `SESSION_PEPPER` | **Generate** (≥32) | la pimienta efectiva es una constante pública del repositorio |
| `CORS_ORIGINS` | la URL del portal (paso 4) | por defecto vacío → **el backend acepta cualquier origen** |
| `DDL_EN_CALIENTE` | `false` | por defecto `true`: la aplicación puede alterar su propio esquema |
| `ENFORCE_PROJECT_AUTHZ` | `true` | **por defecto `false`**: no se comprueba la pertenencia a la obra |
| `AUTH_POLICY_MODE` | `estricto` | **por defecto `sombra`**: los decoradores de rol no bloquean a nadie |
| `ADMIN_EMAIL` | correo del admin **de la entidad** | en perfil portal **no se crea administrador** y el log lo dice. Antes caía al correo del desarrollador |
| `ADMIN_PASSWORD` | **Generate**; se entrega por canal seguro y se cambia al entrar | se genera una aleatoria que solo aparece una vez en el log |
| `APP_URL` | la URL del portal (paso 4) | por defecto apunta al **frontend del desarrollador**: ahí irían los enlaces de invitación |
| `MAIL_FROM` | remitente propio | por defecto el remitente de pruebas de Resend, que **solo entrega al buzón del desarrollador** |
| `RESEND_API_KEY` | clave propia | el correo queda degradado: los enlaces de restablecimiento se quedan en el log |
| `ECD_CANDADO_ESTADOS` | `true` | sin él la base acepta cualquier cadena como estado. **Probado**: con él puesto, `INSERT ... status='INVENTADO'` es rechazado por la base |
| `STRICT_ISO_VISIBILITY` | `true` | **Probado**: con `false`, un usuario no administrador con permiso de carpeta **ve los documentos en Trabajo en curso**; con `true` solo ve los Compartidos. Es la semántica de ISO 19650, y una instancia nueva nace vacía, así que aquí no hay nada que romper |

### 3.2 · Variables RECOMENDADAS

| variable | valor | por qué |
|---|---|---|
| `ADMIN_NAME` | nombre del admin | si falta se usa la parte local del correo |
| `EXIGIR_2FA` | `admin` (ya es el defecto) | explícito es mejor que heredado |
| `EXIGIR_2FA_ESTRICTO` | **`false` ahora; `true` en el paso 5.4** | ver el aviso de abajo |
| `LOG_LEVEL` | `INFO` | ya es el defecto |
| `SESSION_CACHE_TTL` | `15` | segundos hasta que una revocación surte efecto |
| `APS_CLIENT_ID` / `APS_CLIENT_SECRET` / `APS_AUTH_URL` / `APS_DATA_URL` | credencial APS | solo si la entidad va a ver DWG/RVT dentro de Documentos |

> ### ⚠ `EXIGIR_2FA_ESTRICTO` no se enciende al aprovisionar
> **Probado el 19-ago**: con `EXIGIR_2FA_ESTRICTO=true` y el administrador aún sin
> segundo factor, el login devuelve **HTTP 403 `SEGUNDO_FACTOR_OBLIGATORIO`**. En
> una instancia nueva ese es el **único** administrador: la entidad se queda fuera
> de su propio expediente sin nadie que pueda ayudarla. Se enciende **después** de
> que el administrador tenga el 2FA activo (paso 5.4).

### 3.2 bis · La valvula de emergencia

`ESQUEMA_ESTRICTO` — **no la definas.** Su valor por defecto (bloquear) es el
correcto: un servicio que arranca sobre un esquema que no es el que su codigo
espera hace daño en silencio, y asi aparecio el HTTP 500 del segundo factor.

Existe para una sola situacion: la noche en que el arranque se detiene, hay que
servir igual, y se repara despues. Poniendola en `false` el servicio arranca y
grita en el log en cada arranque lo que falta. **Se quita en cuanto se repara.**

Se anadio el 20-ago-2026 despues de que esta comprobacion detuviera dos
despliegues seguidos por dos errores de quien la escribio, sin que hubiera un
solo problema real en la base. La leccion no fue aflojar el control: fue que un
control nuevo se prueba contra una base CON HISTORIA antes de desplegarlo, no
solo contra una recien creada, donde todo es perfecto por construccion.

### 3.3 · OPCIONALES (dejar sin definir salvo necesidad)

`REDIS_URL` (exactitud del limitador con varios procesos; con un solo worker no
hace falta) · `PORT` (lo pone Render) · `WHATSAPP_IMPORT_WORKERS` ·
`MAPS_PREPARATION_SECONDS` · `PURGA_FOTOS_HUERFANAS` · `TOPE_PURGA_FOTOS`.

### 3.4 · SOLO DESARROLLO — **nunca** en la instancia de una entidad

`ALLOW_DEMO_TOKEN` · `FLASK_DEBUG` · `ALLOW_OPEN_REGISTRATION` ·
`PROFILER_SESSION_TOKEN` · `ECD_URL`, `ECD_CORREO_A/B`, `ECD_CLAVE_A/B`,
`ECD_OBRA_A/B` (son de la herramienta de verificación y **contienen credenciales
de prueba**).

Las tres primeras vienen apagadas por defecto, comprobado. No hay que apagarlas:
hay que **no encenderlas**.

### 3.5 · COMPATIBILIDAD / LEGADO — no configurar

`DATABASE_URL` (este proyecto no la usa) · `DB_PASSWORD` (solo en un guion
suelto; la de verdad es `DB_PASS`) · `ACC_PROJECT_ID`, `ACC_FOLDER_URN`,
`APS_DOCS_BUCKET`, `APS_FRONTEND_URL`, `APS_REDIRECT_URI`,
`LOB_REQUIRE_SOURCE_ARCHIVE` (todas del visor, no del portal) ·
`GOOGLE_CLIENT_ID` (entrada con Google; solo si se usa) · `GIT_COMMIT`,
`RENDER_GIT_BRANCH`, `RENDER_GIT_COMMIT` (los pone Render).

## 4 · El portal (Render, Static Site)

- **Root directory** `frontend-docs` · **Build** `npm install && npm run build` ·
  **Publish** `dist`
- **Variable de build:** `VITE_BACKEND_URL` = la URL del backend del paso 3.
- Anotar la URL resultante, ponerla en `CORS_ORIGINS` y `APP_URL` del backend, y
  redesplegar el backend una vez.

## 5 · Verificación — nada se da por bueno sin medirlo

1. **El esquema.** En el log del primer arranque, el bootstrap tiene que terminar
   con las seis líneas cuadradas y **sin** «FALTAN»:
   `tablas`, `columnas`, `restricciones`, `indices`, `funciones`, `extensiones`.
   Si falta cualquier objeto, **el arranque se detiene con código 1**. Para
   comprobarlo por separado: `python bootstrap_esquema.py --verificar`.
2. `GET <backend>/api/health` → `configuracion: {completa: true, faltan: 0, puntos: 7}`.
3. El log dice `[perfil] despliegue: portal`.
4. **El administrador y su segundo factor**, en este orden:
   1. entrar con `ADMIN_EMAIL` + `ADMIN_PASSWORD` y **cambiar la contraseña**;
   2. activar el 2FA y **guardar en papel los 8 códigos de recuperación** (se
      muestran una sola vez);
   3. **cerrar sesión y volver a entrar** para ver que pide el segundo factor;
   4. **solo entonces** poner `EXIGIR_2FA_ESTRICTO=true` y redesplegar.
5. Crear la primera obra, subir un documento, verlo, descargarlo.
6. **Miembros**: invitar a un segundo usuario y cambiarle el rol desde la pantalla.
7. **Configuración → Exportar el expediente**: bajar el índice y el zip. Si la
   salida no funciona el día uno, no existirá el día que importe.
8. **El ensayo de restauración** contra esta instancia:
   `python herramientas/copia_de_seguridad.py` y después `ensayo_de_restauracion.py`.
9. Sin sesión: `<backend>/api/docs/list?path=` → **401**. Y una ruta del visor:
   `<backend>/api/lob/timeline` → **404**.

## 6 · Lo que queda declarado (no oculto)

- **Acceso del proveedor:** la cuenta de servicio de la instancia lee su bucket
  por fuera de la aplicación. Alcance: solo esa entidad. Va en el contrato.
- El botón «publicar al visor» responde 404 en perfil portal: esa capacidad es
  del producto visor.
- Los datos viven donde diga el contrato; por defecto, `us`.

## 7 · Lo que esta guía NO ha podido comprobar

- **El camino de los bytes** (subir, descargar, huella al subir): exige el bucket
  real. Es el paso 5.5, y hay que hacerlo el día del despliegue.
- **El ensayo completo de restauración**: exige la contraseña de administración
  de la base, que el usuario de aplicación correctamente no tiene.
