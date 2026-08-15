# Como arranca este backend, y por que

`yarn start` es lo que ejecuta Render. Yarn corre `prestart` antes de `start`,
asi que el orden real es:

    prestart  ->  python bootstrap_esquema.py     (construye/actualiza el esquema)
    start     ->  gunicorn ... server:app         (levanta la aplicacion)

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

**Un fallo aqui NO tumba el servicio.** Render solo manda trafico a la instancia
nueva cuando arranca bien; si `prestart` devuelve error, el despliegue se marca
como fallido y la **version anterior** sigue sirviendo. Lo que se ve es un
despliegue en rojo en el panel, no una caida.

Lo que hay que hacer en ese caso es leer el log del despliegue: `construir()`
imprime una linea por rutina, con `ok` o `FALLO` y el motivo. El esquema no
queda a medias de forma silenciosa.

`bootstrap_esquema.py` es idempotente (todo `IF NOT EXISTS`) y devuelve codigo 1
solo si alguna rutina falla de verdad.

## El paso que falta, y es de la cuenta

Con esto el esquema ya se construye de forma deliberada en cada despliegue, asi
que el DDL en caliente sobra. Queda por poner en Render:

    DDL_EN_CALIENTE=false

Mientras esa variable no exista, sigue valiendo `true` por defecto y la
aplicacion conserva permiso para tocar el esquema en caliente -- o sea, el
agujero sigue abierto aunque el paso previo ya haga su trabajo.
