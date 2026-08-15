# Como arranca este backend, y por que

`yarn start` es lo que ejecuta Render, y ese script encadena dos cosas:

    ./venv/bin/python bootstrap_esquema.py    (construye/actualiza el esquema)
      &&
    ./venv/bin/gunicorn ... server:app        (levanta la aplicacion)

**Va encadenado en `start` y no en un `prestart` a proposito.** Yarn 1 ejecuta
los guiones `pre*` automaticamente, pero Yarn 2 y posteriores **no**: dejarlo en
`prestart` habria sido escribir un paso de migracion que, segun la version de
yarn que use Render, podria no ejecutarse nunca -- y nadie se enteraria, porque
el arranque seguiria funcionando igual gracias al DDL en caliente. Un `&&` no
depende de la version de nada.

El `&&` tambien es la garantia de orden: si el bootstrap devuelve error,
gunicorn NO llega a arrancar.

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
