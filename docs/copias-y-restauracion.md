# Copias de seguridad y restauración

Probado de punta a punta el 9 de agosto de 2026 contra la base real: base vacía →
esquema → restauración → comprobación de contenido. **78 tablas, 83.563 filas,
idénticas.**

## Lo que se descubrió al probarlo

La prueba encontró que, hasta ese día, **la plataforma no se podía reconstruir**:

| | |
|---|---|
| tablas en producción | 81 |
| tablas que el código sabía crear | **34** |
| tablas que no creaba nadie | **47** |

Entre las que faltaban: `projects`, `users`, `hubs`, `project_users`,
`folder_permissions` y `sessions` — es decir, quiénes son tus usuarios, qué obras
existen y quién puede ver qué. Se habían creado a mano tiempo atrás y el proyecto
llevaba desde entonces viviendo de eso. La migración base de Alembic lo admitía
por escrito.

Con las copias que fueran, **no había dónde cargarlas**. Está corregido en
[backend/esquema_base.py](../backend/esquema_base.py): esas definiciones se
extrajeron de la base real y ahora se crean al arrancar, antes que nada.

> Si añades una tabla nueva, añádela también ahí. O volverás a tener una
> plataforma que no se puede reproducir.

## Hacer una copia

```bash
python backend/copia_de_seguridad.py --destino D:/copias
```

Recorre todas las tablas (las lee de `information_schema`, así que no se le
escapa ninguna nueva), guarda los contadores de los id automáticos, escribe un
manifiesto con el recuento por tabla y **vuelve a leer el fichero para comprobar
que cuadra**. Si no cuadra, avisa y termina con error.

Tamaño actual: unos 7 MB comprimidos.

## Restaurar

**1. Base vacía.** Créala en Cloud SQL (o donde sea).

**2. El esquema lo crea la aplicación.** Apunta el backend a esa base y arráncalo
una vez. Comprueba en el log que dice `0 fallos`.

**3. Cargar los datos:**

```bash
python backend/restaurar.py D:/copias/ecd_AAAAMMDD_HHMMSS.copia.gz --base <la_nueva> --confirmar
```

Sin `--confirmar` no escribe nada: enseña lo que haría. Y **se niega a escribir
sobre la base de producción** salvo que se lo pidas con `--sobre-produccion`.

Carga **por nombre de columna**, no por posición — producción fue creciendo con
`ALTER TABLE ADD COLUMN`, que añade al final, y ese orden no coincide con el del
`CREATE TABLE` del código. Cargar por posición metía una fecha en una columna de
JSON.

Retira las claves ajenas durante la carga y las devuelve al terminar. Si alguna
no vuelve a entrar, los datos no son consistentes y lo dice.

**4. Los secretos.** Sin esto la base arranca pero no sirve:

- `APP_SECRET` — firma invitaciones, recuperación de contraseña y los permisos de
  cada foto y cada PDF. **Ojo con el respaldo**: si no está definida, la clave se
  deriva de la configuración de la base, así que al restaurar en otro servidor
  cambia sola y en silencio, y todos los enlaces emitidos dejan de valer sin que
  nadie entienda por qué.
- `SESSION_PEPPER` — sin ella, ninguna sesión existente vale.
- Credenciales de Google (bucket), `APS_CLIENT_ID` / `APS_CLIENT_SECRET`,
  `RESEND_API_KEY`.

En Render, `APP_SECRET` y `SESSION_PEPPER` están declaradas con `generateValue`:
**existen solo dentro de Render**. Sácalas hoy y guárdalas en un gestor de
contraseñas. No en el repositorio, y no en el mismo sitio que la copia de datos.

**5. Los ficheros.** Los planos, las fotos y los modelos **no están en esta
copia**: viven en Google Cloud Storage. Necesitan copia aparte.

## Lo que falta por cerrar

- **Programar la copia.** Hoy se lanza a mano. Debería correr sola cada día.
- **Sacarla del mismo proyecto de Google.** Mientras la copia viva junto a lo que
  copia, no protege del caso que ya pasó de verdad: la facturación en mora dejó
  el almacenamiento inaccesible. Si la copia hubiera estado ahí, se habría
  cortado también.
- **Copia de los ficheros del bucket**, que es el volumen de verdad.
- **Verificar en la consola de Google** que Cloud SQL tiene copias automáticas y
  recuperación a un punto en el tiempo. Vienen por defecto, pero *por defecto* no
  es *comprobado*.

## Por qué probarla, y no solo tenerla

Todo lo de la primera sección salió de ejecutar la restauración una vez. Ninguno
de esos tres fallos —las 47 tablas, el orden de las columnas, los contadores que
abortaban la transacción entera— se veía leyendo el código.

Una copia que nunca se ha restaurado no es una copia: es una intención.
