# Plan de staging mínimo, y la alternativa sin staging

**13 de agosto de 2026 · Hallazgo 0.1 · documento de decisión, nada ejecutado**

Alcance: validar la separación `postgres` / `ecd_migrator` / `ecd_app` antes de
aplicarla en producción. La rotación de la credencial expuesta ya está cerrada y no
forma parte de esto.

---

## Lo primero, porque cambia la decisión: qué toca de verdad este cambio

La separación de identidades toca **exclusivamente PostgreSQL**: roles, propiedad de
objetos, permisos, y el interruptor que saca el DDL del tiempo de ejecución.

**No toca** el bucket de GCS, ni la clave de servicio de Google, ni Autodesk APS, ni
el visor, ni los frontends, ni el correo. Ninguna de esas piezas cambia de
credencial, de configuración ni de código.

Esto importa porque un staging que reproduzca GCS y el visor estaría validando
cosas **que este cambio no altera**. Se pagaría por confirmar que sigue funcionando
algo que no se ha tocado.

Lo único que en un staging cloud se comportaría distinto de la prueba local ya hecha
es **la semántica de roles de Cloud SQL**: allí `postgres` NO es superusuario de
verdad, sino miembro de `cloudsqlsuperuser`. Esa es la única incógnita real.

---

## 1. Recursos exactos a crear (ruta A)

| Recurso | Para qué | Temporal |
|---|---|---|
| Instancia Cloud SQL PostgreSQL 18, la más pequeña disponible | probar roles, propiedad y permisos con la semántica real de Cloud SQL | sí |
| Bucket GCS `ecd-staging-<algo>`, misma región | subida y descarga reales sin tocar el productivo | sí |
| Cuenta de servicio nueva, con acceso SOLO a ese bucket | que una fuga en staging no alcance producción | sí |
| Servicio web en Render, desde la misma rama | reproducir arranque, despliegue y variables | sí |

No hace falta clonar la instancia de producción. **Una instancia vacía basta**: el
bootstrap construye las 87 tablas en 3 segundos, y probar con datos reales no aporta
nada a la validación de permisos.

## 2. Qué puede ser temporal

**Todo.** Los cuatro recursos se crean para esto y se borran al terminar. Ninguno
necesita sobrevivir a la validación.

## 3. Qué copiar de producción

Solo **configuración**, y solo la que hace arrancar:

- Los nombres de las variables de entorno (no sus valores).
- `APS_CLIENT_ID` / `APS_CLIENT_SECRET` **solo si se quiere probar el visor** — pero
  ver el punto anterior: el visor no cambia con esto.
- `CORS_ORIGINS` apuntando a la URL del staging.

Y nada más. El esquema **no se copia**: se construye con `bootstrap_esquema.py`.

## 4. Qué NO debe copiarse, en ningún caso

- **Documentos, planos, fotos o modelos reales.** Ni uno.
- **La base de datos de producción.** Ni un volcado, ni un clon.
- **`gcp_sa.json`**, la clave de servicio de producción: abre el bucket real.
- **`APP_SECRET` y `SESSION_PEPPER`.** Compartirlos haría que un token emitido en
  staging valiera en producción.
- **La contraseña de `postgres` de producción**, recién rotada.
- Correos o nombres de personas reales en los usuarios de prueba.

## 5. Variables de entorno del staging

Obligatoria sin valor por defecto: `GOOGLE_APPLICATION_CREDENTIALS`.

```
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS   -> la instancia de staging
GCS_BUCKET_NAME                               -> el bucket de staging
GOOGLE_APPLICATION_CREDENTIALS                -> la clave de servicio nueva
APP_SECRET, SESSION_PEPPER                    -> generadas NUEVAS, distintas
CORS_ORIGINS, APP_URL                         -> la URL del staging
DDL_EN_CALIENTE=false                          -> el objeto de la prueba
AUTH_POLICY_MODE=sombra, ENFORCE_PROJECT_AUTHZ=false   -> como produccion hoy
```

`GCS_BUCKET_NAME` es **una sola variable** en todo el backend
(`gcs_manager.py:31` y `:89`): apuntarla a otro bucket aísla el almacenamiento por
completo, sin tocar código.

## 6. Orden de aprovisionamiento

1. Instancia Cloud SQL vacía → base vacía.
2. Como superusuario: `CREATE EXTENSION pgcrypto` + `ALTER SCHEMA public OWNER`.
3. Crear `ecd_migrator` y `ecd_app` con contraseñas nuevas.
4. `bootstrap_esquema.py` con `ecd_migrator` → 87 tablas.
5. `03_grants_ida.sql` con `ecd_migrator`, **leyendo la salida entera**.
6. Bucket + cuenta de servicio.
7. Servicio en Render con las variables de arriba.
8. Recorrido: login, sesión, obra, carpeta, subida real, descarga, versión, estados,
   transmittal, índice, redespliegue, y arranque sin DDL.

## 7. Cómo garantizar el aislamiento

- **Proyecto de Google distinto** si es posible; si no, al menos cuenta de servicio
  distinta con permiso únicamente sobre el bucket de staging.
- **`APP_SECRET` y `SESSION_PEPPER` nuevos**: sin esto, las sesiones son
  intercambiables entre los dos entornos.
- **Sin red entre ellos**: el staging no lleva la IP de producción en ninguna
  variable. Se comprueba mirando que `DB_HOST` no sea `34.86.x.x`.
- **Datos inventados**, con correos de un dominio que no exista.

## 8. Cómo eliminar el staging

Borrar la instancia Cloud SQL, el bucket con su contenido, la cuenta de servicio y
el servicio de Render. Cuatro borrados, ninguna dependencia con producción.

**Antes de borrar**, exportar los resultados: la salida de los permisos efectivos, la
de las pruebas negativas y los códigos HTTP del recorrido. Es la evidencia; si se
borra el entorno sin guardarla, hay que repetirlo todo.

## 9. Qué genera coste

No puedo darte cifras: dependen de tu región, del nivel que elijas y de tu
facturación, y no tengo acceso a tu consola. Lo que sí puedo decirte es **qué cobra**:

| | |
|---|---|
| **Instancia Cloud SQL** | **el grueso del coste**. Cobra por hora encendida, aunque no se use, y PostgreSQL no tiene nivel gratuito en Google Cloud |
| Bucket GCS | prácticamente nada con datos de prueba |
| Cuenta de servicio | gratis |
| Servicio Render | puede ser gratuito según tu plan — **a confirmar en tu panel** |

El coste real es **el tiempo que la instancia esté encendida**. Si la validación
lleva un día, es un día de instancia pequeña. Si se queda encendida tres semanas
porque nadie la borra, es tres semanas.

---

## 10. Ruta B: transición controlada en producción

### Por qué es viable

Los pasos 1 a 3 de la migración son **aditivos**: crear roles y conceder permisos no
cambia el comportamiento de la aplicación, que sigue conectando como `postgres`.
Durante todo ese tiempo el servicio funciona exactamente igual que ahora.

El único paso con efecto visible es cambiar `DB_USER`/`DB_PASS` a `ecd_app`, y se
revierte **con una variable de entorno**, en un minuto.

### La incógnita que hay que despejar, y cómo

Cloud SQL no da superusuario real. Hay que confirmar que `postgres` puede transferir
la propiedad de 121 objetos a `ecd_migrator`. Se prueba así, sin staging y en
minutos:

1. Crear los dos roles (aditivo, reversible con `DROP ROLE`).
2. `ALTER TABLE <una tabla intrascendente> OWNER TO ecd_migrator;`
3. Comprobar que el cambio se aplicó.
4. Devolverla: `ALTER TABLE <esa tabla> OWNER TO postgres;`

Si eso funciona, funcionan las 121. Si falla, se sabe **antes** de tocar nada más y
sin haber gastado un céntimo.

### Salvaguarda antes de cambiar el servicio

Con los permisos ya concedidos y la aplicación aún como `postgres`, ejecutar el
recorrido funcional **conectando como `ecd_app`** desde un proceso aparte. Eso
ejercita los caminos de código con la identidad restringida sin afectar a ningún
usuario. Es exactamente lo que se hizo en local y lo que destapó las ocho rutas de
DDL escondidas.

### Riesgo adicional real de B frente a A

**Uno solo:** que exista un camino de código no ejercitado que necesite un privilegio
que no concedimos. Sería un error 500 para el usuario que lo pise, resuelto
revirtiendo una variable.

Es un riesgo acotado porque `ecd_app` recibe SELECT/INSERT/UPDATE/DELETE sobre las 87
tablas, USAGE sobre las secuencias y EXECUTE sobre la función de rutas. Lo único que
podría faltar es más DDL escondido — y para eso está la comprobación estática, que
hoy da **cero** sentencias alcanzables por HTTP fuera del interruptor salvo el
`dev_wipe`, que además queda neutralizado por la propia separación.

**Lo que B no cubre y A tampoco:** ninguna de las dos prueba la subida a GCS con la
identidad nueva, porque **GCS no depende de la identidad de PostgreSQL**. Ese riesgo
es cero en ambas rutas.

---

## Recomendación: RUTA B

No por ahorrar, sino porque el staging validaría sobre todo cosas que este cambio no
toca. Reproducir bucket, visor y frontends para una migración que solo altera roles
de PostgreSQL es pagar por confirmar que sigue funcionando lo que no se ha movido.

Lo que sí aporta el staging —la semántica de roles de Cloud SQL— se despeja con la
prueba de una sola tabla descrita arriba, que es más directa, más barata y más
concluyente que reproducir un entorno entero.

Y el argumento decisivo: **cada paso tiene su inverso exacto ya escrito y probado**
(`02_ownership_vuelta.sql`, `04_grants_vuelta.sql`), y el único paso con efecto sobre
usuarios se revierte con una variable de entorno. Un cambio con rollback de un minuto
no justifica un entorno paralelo.

### Cuándo elegiría A en su lugar

- Si la prueba de la tabla suelta falla o da un resultado ambiguo.
- Si más adelante hay que probar algo **irreversible** (migración de datos, cambio de
  esquema con pérdida, cambio de región).
- Si entra un segundo cliente y ya no se puede tocar producción en horario laboral.

Ninguna de las tres es el caso hoy.

### Secuencia propuesta para B

1. Prueba de la tabla suelta *(minutos, reversible)*
2. Crear roles *(aditivo)*
3. `01_ownership_ida.sql` *(inverso escrito)*
4. `03_grants_ida.sql` **leyendo la salida entera**
5. Recorrido como `ecd_app` desde un proceso aparte *(no afecta a nadie)*
6. Sacar Alembic del `startCommand`
7. `DDL_EN_CALIENTE=false`, aún como `postgres`, y verificar
8. Cambiar a `ecd_app` **en horario de baja actividad**
9. Recorrido completo en el portal

Los pasos 1 a 5 no tienen efecto sobre ningún usuario. El 8 es el único con riesgo y
se revierte con una variable.

**Antes del paso 6 hay que resolver una cosa:** el servicio real se llama
`visor-ecd-backend` y `render.yaml` declara `visor-aps-backend`. Ese fichero **no está
desplegando nada**. Si se edita el `startCommand` ahí, no pasará nada y creeremos que
sí.
