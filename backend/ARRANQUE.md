# Como arranca este backend, y por que

El despliegue tiene dos identidades y, por tanto, dos comandos distintos:

    yarn migrate   # servicio/job de migracion: DB_USER=ecd_migrator
    yarn start     # servicio web: DB_USER=ecd_app

`yarn migrate` construye o actualiza el esquema. Debe ejecutarse en un servicio
o job dedicado que solo tenga la credencial del migrador. Esa credencial
**no se declara en el servicio web**: ocultarla en una variable con otro nombre
dentro del mismo proceso no seria separacion, porque una aplicacion comprometida
podria leerla.

El bootstrap consulta `current_user` en PostgreSQL y se detiene antes del primer
DDL si la identidad real no es `ecd_migrator`. Al terminar aplica de forma
idempotente `sql/03_grants_ida.sql`: `ecd_app` recibe lectura/escritura de datos
y valores de secuencias, pero no propiedad ni `CREATE` sobre los schemas.

El bootstrap consulta `current_user` en PostgreSQL y se detiene antes del primer
DDL si la identidad real no es `ecd_migrator`. Al terminar aplica de forma
idempotente `sql/03_grants_ida.sql`: `ecd_app` recibe lectura/escritura de datos
y valores de secuencias, pero no propiedad ni `CREATE` sobre los schemas.

`yarn start` no ejecuta DDL. Primero corre `bootstrap_esquema.py --verificar` con
la identidad de aplicacion, que solo lee el catalogo; Gunicorn arranca unicamente
si el esquema ya esta completo. El orden operativo del despliegue es:

1. job migrador: `yarn migrate`;
2. servicio web: `yarn start`.

### Convergencia unica de una instancia anterior

Si la instancia ya fue usada con DDL en caliente, puede haber objetos poseidos
por `ecd_app`. Una identidad administrativa de Cloud SQL debe ejecutar una sola
vez `sql/05_convergencia_propiedad.sql` **antes** del primer `yarn migrate` con
el nuevo modelo. El guion es transaccional, no cambia filas y falla si queda un
objeto de aplicacion o si `ecd_app` conserva `CREATE`.

Orden para esa unica convergencia:

1. proceso administrativo de mantenimiento: `yarn converge:ownership`;
2. servicio dedicado como `ecd_migrator`: `yarn migrate`;
3. servicio web como `ecd_app`: `yarn start`.

En Render Free no existe Pre-Deploy Command. En esta instancia las migraciones
se ejecutan manualmente antes del despliegue, con la identidad
`ecd_migrator`. No se crea un segundo servicio permanente.

La primera vez, el servicio web heredado todavia se autentica como `postgres`.
Se usa una unica ventana de mantenimiento con:

    CONFIRMAR_CONVERGENCIA_PROPIEDAD=SI_UNA_VEZ
    Start Command: yarn converge:ownership

La herramienta exige `session_user=current_user=postgres`, toma invariantes,
transfiere todos los objetos y rutinas, revoca `CREATE`, cierra el pool
administrativo y vuelve a conectar con `current_user=ecd_migrator` mediante
`SET ROLE`. Construye, verifica y concede permisos sin guardar la contraseña
del migrador en el servicio web. No arranca la aplicacion. En cuanto queda
verde, la variable temporal de confirmacion se elimina del servicio web.

La configuracion permanente queda:

- `visor-ecd-backend`: `DB_USER=ecd_app`, `DDL_EN_CALIENTE=false`,
  `ESQUEMA_ESTRICTO=true`, `AUTH_POLICY_MODE=estricto` y
  `ENFORCE_PROJECT_AUTHZ=true`;
- las migraciones futuras se ejecutan manualmente como `ecd_migrator` antes
  del despliegue; su contraseña no aparece en el servicio web.

### Convergencia unica de una instancia anterior

Si la instancia ya fue usada con DDL en caliente, puede haber objetos poseidos
por `ecd_app`. Una identidad administrativa de Cloud SQL debe ejecutar una sola
vez `sql/05_convergencia_propiedad.sql` **antes** del primer `yarn migrate` con
el nuevo modelo. El guion es transaccional, no cambia filas y falla si queda un
objeto de aplicacion o si `ecd_app` conserva `CREATE`.

Orden para esa unica convergencia:

1. administrador Cloud SQL: `sql/05_convergencia_propiedad.sql`;
2. job dedicado como `ecd_migrator`: `yarn migrate`;
3. servicio web como `ecd_app`: `yarn start`.

Si el job falla, no se publica el codigo nuevo. Si alguien omite el job, la
verificacion del servicio web falla y Gunicorn no llega a abrir el puerto.

## Por que existe el paso previo (hallazgo N2)

Hasta el 15-ago-2026 `yarn start` lanzaba gunicorn **directamente**. No habia
ningun paso de migracion, asi que el esquema de produccion se construia solo, en
caliente, desde los propios manejadores HTTP: 237 sentencias de DDL, 8 de ellas
en caminos de peticion, y un `CREATE TABLE sessions` en **cada login**.

Eso tiene dos consecuencias que no son de rendimiento:

1. **Obliga a que la aplicacion sea duena de las tablas.** Y mientras el usuario
   de aplicacion pueda alterar el esquema, no hay separacion de identidades: un
   propietario es indistinguible de un administrador. Es la raiz de C1 y de que
   el registro de auditoria sea alterable (C3).
2. **El esquema depende de que alguien entre por la ruta correcta.** Una base
   recien restaurada se queda incompleta hasta que se usa -- y asi es como se
   descubre tarde, el dia que hace falta.

## Que pasa si el paso previo falla

El despliegue falla, y es lo correcto: desplegar codigo nuevo contra un esquema
que no migro es peor que no desplegar.

**Un fallo aqui NO debe tumbar el servicio anterior.** Si falla el job migrador,
no se despliega el servicio web. Si se intenta desplegarlo igualmente, su
`--verificar` falla antes de Gunicorn y Render conserva la **version anterior**.

Lo que hay que hacer en ese caso es leer el log del despliegue: `construir()`
imprime una linea por rutina, con `ok` o `FALLO` y el motivo. El esquema no
queda a medias de forma silenciosa.

`bootstrap_esquema.py` es idempotente (todo `IF NOT EXISTS`) y devuelve codigo 1
solo si alguna rutina falla de verdad.

## Configuracion obligatoria

En el servicio/job migrador dedicado:

    DB_USER=ecd_migrator
    DB_PASS=<credencial exclusiva del migrador>

En el servicio web:

    DB_USER=ecd_app
    DB_PASS=<credencial exclusiva de la aplicacion>
    DDL_EN_CALIENTE=false
    ESQUEMA_ESTRICTO=true

El job puede reutilizar el mismo codigo porque `bootstrap_esquema.py` habilita
DDL dentro de su propio proceso. El servicio web no recibe la contraseña del
migrador y su rol PostgreSQL tampoco posee objetos ni `CREATE` sobre los schemas.
