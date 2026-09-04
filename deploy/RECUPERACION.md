# Recuperación de ALEPHIA · qué hay, dónde vive y qué pasa si se pierde

Escrito el **4-sep-2026**, el día que el producto pasó a servirse en
`alephia.com.pe`. Todo lo que sigue está **observado**, no supuesto: cada valor
se leyó del panel correspondiente ese día. Lo que no se pudo comprobar va
marcado como tal en vez de rellenarse con lo probable.

La topología completa está en [`render.yaml`](render.yaml), que es un **registro**,
no un Blueprint aplicado — está en `deploy/` y no en la raíz justamente para que
no pueda activarse por accidente.

---

## Los cinco frentes, y cuál está cubierto

| | Qué se puede perder | Dónde vive | Estado |
|---|---|---|---|
| 1 | 518 líneas del 4D sin commitear | *era* solo un disco | ✅ **rama `respaldo/4d-22ago`** |
| 2 | ~123 MB de datos fuente sin versionar | solo un disco | ❌ **sin copia** |
| 3 | Base de datos de producción | Cloud SQL | ✅ **copia + restauración demostradas** |
| 4 | Ficheros de obra | GCS | ❌ **sin verificar** |
| 5 | Configuración de despliegue | solo el panel de Render | ⚠️ **este documento** |

El 5 queda **parcialmente** cubierto: la topología ya está aquí, pero **los
valores de los secretos siguen existiendo en un único sitio**. Ver más abajo.

---

## 1 · El trabajo del 4D — resuelto

```
rama    respaldo/4d-22ago
commit  44a4746d38c74408fea07c5a3b0c18ef9e7ca9ea
```

Tres ficheros (`LOB4DExtension.js`, `ViewerLabelsBar.jsx`, `predictBim.js`),
modificados el 22-ago-2026 y nunca commiteados, +518/−116.

**No es una propuesta de fusión.** El contenido no se revisó ni se probó, y
**no se modificó**: se creó con fontanería de git (`write-tree` + `commit-tree`)
precisamente para no tocar el árbol de trabajo. En el disco siguen modificados
y sin commitear, byte a byte como estaban — comprobado por SHA-256 antes y
después, y por `git diff` contra la rama.

> Cambiar de rama en ese repositorio **sobrescribiría esos ficheros** con la
> versión de `main`. Con la rama subida ya no sería una pérdida, pero conviene
> saberlo antes de hacer un `checkout`.

## 2 · Los datos fuente — pendiente, y necesita una decisión

```
82 MB  500125-PQ08-LB00_R00_SEM26-1.xml        el cronograma del 4D
33 MB  PDF/
7.7 MB DURACIONES LB00_R00.xlsm
0.3 MB Metrados RIBA 5 - Paquete 8_SINOHYDRO_V03.xlsx
```

**No van a git**: el XML de 82 MB no tiene sitio ahí y el repositorio no es un
almacén de datos. Necesitan una copia fuera del portátil (Drive, disco externo,
bucket) y verificada por hash. **Falta decidir dónde.**

## 3 · La base de datos — HECHA Y DEMOSTRADA (4-sep-2026)

```
copia        D:/copias-ecd/produccion/ecd_20260904_214510.copia.gz   15,4 MB
sha256       137c9055b54b8dc9c284d4d5634429704032e35fdeefb90438c8613ecb01fdd0
origen       34.86.206.187 / postgres / ecd_migrator / sesión read only
contenido    118 tablas · 86.277 filas · 57 secuencias · doc_reviews = 9
```

**La cadena completa, cada eslabón medido:**

```
produccion       120 tablas · 9 revisiones            censo, solo lectura
  -> copia       118 tablas · 86.277 filas            manifiesto, releida y verificada
    -> restaurada 118/118 · fila a fila               ensayo: VEREDICTO RESTAURABLE
      -> huella  05fb263c9cee...  IDENTICA            contenido, no solo recuento
```

La huella es la misma que se congeló en la fase A de REVIEWS-R01 sobre producción.
Que la reproduzca una base restaurada desde la copia demuestra que las revisiones
no solo *están*: son **los mismos datos**. El ensayo por sí solo cuenta filas; eso
no habría detectado un contenido corrompido.

Una fila de `pdf_markups` quedó **en cuarentena** (un `file_node_id` que no es
UUID): no se pierde, se aparta en un `.cuarentena-*.csv` esperando decisión
humana. Es un problema de datos que ya venía de producción, no de la copia.

### LA RECETA DE VUELTA — y el fallo que tenía

El primer ensayo contra esta copia dio **`CON DESCUADRES`: 86 de 118 tablas**.
Entre las 32 que no volvían iban **`users`, `project_users` y `doc_reviews`** — una
recuperación en la que **nadie podría entrar**. Lo engañoso: eran solo 294 filas de
86.277 (0,34 %), porque el bulto son `lob_element_links` e `inventory_assets`, que
son derivados regenerables. *La recuperación salvaba lo recalculable y perdía el
expediente.*

La causa, censada y no supuesta: **las 28 tablas y las 10 columnas que faltaban
vienen TODAS de `backend/sql/`, ninguna de código Python.** El esquema de esta
plataforma es **código MÁS migraciones**, y la receta solo tenía la primera mitad.
`bootstrap.verificar()` decía «completo» porque su manifiesto tampoco las conoce.

**El orden correcto, ya demostrado:**

```
1. base vacia            propietario = ecd_migrator (como en produccion)
2. bootstrap_esquema     el esquema que es codigo
3. aplicar_migraciones   backend/sql/ de la 06 en adelante, COMO ecd_migrator
4. restaurar             la copia
```

El paso 3 no existía: es `backend/herramientas/aplicar_migraciones.py`, escrito
hoy. Y **el rol importa**: aplicadas como `ecd_app` pasan 22 de 23 y falla
`26_ng04_avance.sql`, que empieza por `ALTER DEFAULT PRIVILEGES FOR ROLE
ecd_migrator` — sentencia que solo ese rol puede ejecutar. Un privilegio de
diferencia, invisible hasta el día que hace falta.

`herramientas/ensayo_de_restauracion.py` ya hace los cuatro pasos, así que
repetir el ensayo vuelve a validar **el procedimiento real**, no uno parecido.

### Lo que sigue pendiente aquí

- **La copia está en el mismo disco que todo lo demás.** Falta sacarla fuera.
- **Cloud SQL**: sin comprobar si tiene copias automáticas y PITR.
- Las dos copias de agosto en `D:/copias-ecd/` **no son de producción** (90 tablas,
  1 y 2 revisiones): son de la base local. Se dejan donde están, sin borrar, pero
  no cuentan como respaldo.

## 3-bis · Cómo se toma la copia (y por qué agosto salió mal)

Producción es `34.86.206.187`, base `postgres`: **120 tablas, 9 revisiones**.

Las dos copias de `D:/copias-ecd/*.copia.gz` (22-ago-2026) **no son de
producción**: tienen el perfil de `ecd_dr12d` — 91 tablas, 1 revisión. El `.env`
del repositorio apunta a `127.0.0.1:5433`, que tampoco es producción.

Para tomar una de verdad hay que **sobrescribir** `DB_HOST` / `DB_PORT` /
`DB_NAME` / `DB_USER` / `DB_PASS` y poner `PGSSLMODE=require`. **El manifiesto
tiene que decir 120 tablas y 9 filas en `doc_reviews`**, o no es de producción.

Y una copia no restaurada no es una copia: es una creencia. **La prueba es
restaurarla** en un clúster desechable y volver a contar.

Sin comprobar todavía: si Cloud SQL tiene copias automáticas y PITR encendidos.

## 4 · Los ficheros de obra

Viven en Google Cloud Storage (`GCS_BUCKET_NAME`). **Sin verificar** si el
bucket tiene versionado de objetos y protección contra borrado. Diez minutos de
consola, y es la diferencia entre que un borrado sea recuperable o definitivo.

---

## 5 · La configuración

### DNS — punto.pe (usuario `YASERSANCHEZ`)

Dominio `alephia.com.pe`, activo hasta el **21-ago-2027**, servidores
`ns.rcp.net.pe` / `ns2.rcp.net.pe`. Tres registros, en
*Administrar dominio → Registros MX/CNAME/A/TXT → (administrar registros)*:

| Nombre | Tipo | Contenido |
|---|---|---|
| *(vacío)* | A | `216.24.57.1` |
| `www` | CNAME | `visor-ecd-portal.onrender.com` |
| `visor` | CNAME | `visor-ecd-frontend.onrender.com` |

**Para la raíz el campo `Nombre` va VACÍO**, aunque Render diga `@`: el panel le
añade `.alephia.com.pe` solo. Y la raíz va por `A` y no por `CNAME` porque
punto.pe no ofrece `ALIAS`/`ANAME` y un `CNAME` en la raíz de un dominio no es
legal.

### Variables de entorno — los nombres, nunca los valores

Los seis que el backend declara **imprescindibles**
(`backend/postura_de_seguridad.py`; `GET /api/health` cuenta cuántos faltan sin
decir cuáles):

```
APP_SECRET  SESSION_PEPPER  CORS_ORIGINS
DDL_EN_CALIENTE (apagado)  ENFORCE_PROJECT_AUTHZ  AUTH_POLICY_MODE (no "sombra")
```

El resto que el código lee, agrupado por para qué sirven:

```
SECRETOS      APS_CLIENT_SECRET  DB_PASS  DB_PASSWORD  DATABASE_URL  REDIS_URL
              RESEND_API_KEY  ADMIN_PASSWORD  PROFILER_SESSION_TOKEN

CONEXION      DB_HOST  DB_PORT  DB_NAME  DB_USER  GCS_BUCKET_NAME  GOOGLE_CLIENT_ID
              APS_CLIENT_ID  APS_AUTH_URL  APS_DATA_URL  APS_DOCS_BUCKET
              ACC_PROJECT_ID  ACC_FOLDER_URN

POSTURA       ESQUEMA_ESTRICTO  STRICT_ISO_VISIBILITY  ALLOW_DEMO_TOKEN
              ECD_CANDADO_ESTADOS  ROL_MIGRADOR

URLS          APP_URL  APS_FRONTEND_URL  APS_REDIRECT_URI

OPERACION     DEPLOY_PROFILE  ADMIN_EMAIL  ADMIN_NAME  MAIL_FROM  LOG_LEVEL
              FLASK_DEBUG  SESSION_CACHE_TTL  MAPS_PREPARATION_SECONDS
              PURGA_FOTOS_HUERFANAS  TOPE_PURGA_FOTOS  LOB_REQUIRE_SOURCE_ARCHIVE

LAS PONE RENDER   PORT  PYTHON_VERSION  RENDER_GIT_BRANCH  RENDER_GIT_COMMIT  GIT_COMMIT
```

> **`APS_REDIRECT_URI` tiene pareja.** Si algún día el backend pasa a
> `api.alephia.com.pe`, hay que cambiarla **y** registrar el retorno nuevo en la
> consola de Autodesk. Si solo se cambia una de las dos, se cae el acceso a
> Autodesk.

### ⚠️ Lo que sigue sin copia

**Los valores de los secretos existen únicamente dentro del panel de Render.**
No están aquí a propósito —meter secretos en git fue uno de los hallazgos
críticos de la auditoría de junio de 2026— pero eso no resuelve el problema, lo
mueve: hoy siguen dependiendo de una sola cuenta de Google.

Lo que falta es un **gestor de contraseñas** con la lista completa, puesta por
el propietario. Ni yo la leo ni la escribo: solo señalo que el agujero está ahí.

---

## Trampas ya pagadas, para no volver a pagarlas

- **Ver un commit vivo NO prueba que el despliegue sea automático.** El
  `Auto-Deploy` de los dos frontends está en `Off` desde el 1-sep-2026: un push
  a `main` **no publica nada**. La única forma de saber qué está corriendo es
  `GET /api/health`, que devuelve el commit.
- **Delante de Render hay Cloudflare** y el `index.html` sale con
  `s-maxage=300`: el borde guarda la página **5 minutos**. `Ctrl+Shift+R` no lo
  evita. Tras un despliegue de frontend, verificar del lado del servidor
  (`curl` con un parámetro que la caché nunca haya visto), no por captura.
- **`VITE_VISOR_URL` y `VITE_DOCS_URL` se hornean al compilar.** Cambiarlas
  exige *Save and rebuild*; reiniciar no basta.
- **En el panel de Render, escribir con el teclado en un campo enmascarado no
  entra** y el valor viejo se queda sin avisar. Pasó dos veces el 4-sep-2026.
  Releer siempre el campo después de escribir.
- **El repositorio tiene `core.autocrlf=true`**: el disco es CRLF y git guarda
  LF. Comparar ficheros por SHA-256 crudo da falsos negativos. Comparar con
  `git diff`, que normaliza.
