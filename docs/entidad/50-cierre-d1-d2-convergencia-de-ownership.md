# CIERRE D1/D2 — CONVERGENCIA DE OWNERSHIP

**Fecha:** 21 de agosto de 2026
**No se ha tocado producción. No Render. No cuentas. No `frontend-react`.**
Todo lo que sigue se midió en clústeres desechables, creados para esto y
destruidos al terminar.

---

# VEREDICTO

## `CONVERGENCIA PROBADA EN FIXTURE EQUIVALENTE`

**89 de 89 comprobaciones**, en cuatro rondas: dos estados de partida nuevos e
independientes, una repetición sobre la base ya convergida, y una cuarta que
**provoca** el fail-closed para ver si de verdad se para.

Esto habilita el paso 6 del runbook. **No habilita ejecutarlo**: siguen faltando
E1–E5, y la decisión de abrir la ventana es tuya.

---

# 1 · TENÍAS RAZÓN EN EL REPARO A D1

La regla que propuse —«todo lo que no sea de `ecd_migrator`»— habría sido un
error. El inventario lo dice sin ambigüedad.

## Inventario del fixture, clasificado POR EL CATÁLOGO

`pg_depend` con `deptype='e'` — la pertenencia a extensión que el propio
PostgreSQL usa para que `DROP EXTENSION` se lleve el objeto. **Nunca por nombre
ni por prefijo.**

### Extensiones instaladas

| extensión | schema | owner | versión |
|---|---|---|---|
| `pgcrypto` | `public` | `postgres` | 1.4 |
| `plpgsql` | `pg_catalog` | `postgres` | 1.0 |

### Clasificación

| clase | APPLICATION OBJECT | EXTENSION MEMBER | OTHER / UNKNOWN |
|---|---|---|---|
| **schema** | 2 — `public` (`pg_database_owner`), `ai_brain` (`postgres`) | 0 | 0 |
| **tabla** | **95** (`postgres`) | 0 | 0 |
| **vista / materializada** | 0 | 0 | 0 |
| **secuencia** | **36** (`postgres`) | 0 | 0 |
| **índice** | **185** (`postgres`) | 0 | 0 |
| **función / procedimiento** | **1** — `public.resolve_folder_path` | **37 — `pgcrypto`** | 0 |
| **tipo** | 0 propios — 95 compuestos + 95 arrays, **derivados** | 0 | 0 |
| **extensión** | — | 2 | 0 |
| operador · collation · conversión · estadística · dicc. texto · config. texto · opclass · opfamily | 0 | 0 | 0 |

> **De las 38 funciones de `public`, 37 son de `pgcrypto`.** Una regla ciega les
> habría cambiado el dueño a las 37.

## Por qué eso habría sido un daño real

`pg_dump` **no emite** cambios de propiedad sobre miembros de extensión, y un
`DROP/CREATE EXTENSION` los reinicializa. La propiedad habría divergido en
silencio entre la base y su copia — y sólo se habría notado el día de una
restauración, que es el peor día posible.

## Límites de PostgreSQL, medidos (no supuestos)

| Intento | Resultado |
|---|---|
| `ALTER EXTENSION pgcrypto OWNER TO …` | **`syntax error at or near "OWNER"`** — no existe |
| `ALTER TYPE public.project_users OWNER TO …` | **`project_users is a table's row type`** |
| `ALTER TABLE t OWNER TO r` y mirar su índice | el índice **pasa solo** de `postgres` a `zz_prueba` |

De ahí las tres decisiones: las extensiones **no se pueden** tocar, los tipos
derivados **no se deben**, y los índices **no hace falta**.

---

# 2 · EL CAMBIO MÍNIMO

## D1 · `sql/05_convergencia_propiedad.sql`

| | Antes | Ahora |
|---|---|---|
| Criterio de los bucles | `pg_get_userbyid(…) = 'ecd_app'` | `IS DISTINCT FROM 'ecd_migrator'` **y** `deptype='e'` ⇒ excluido |
| Cobertura | sólo `ecd_app` | `postgres`, `ecd_app` y cualquier dueño heredado |
| Extensiones | no se planteaba | **excluidas por catálogo**, en los tres bucles |
| Ante lo desconocido | nada | **`RAISE EXCEPTION 'CONVERGENCIA DETENIDA…'`**, nombrándolo |
| Postcondición | «¿quedan objetos de `ecd_app`?» — la misma pregunta del bucle | **«¿queda algún objeto APLICATIVO fuera de `ecd_migrator`?»** |

El bloque de parada recorre **diez** clases: relaciones de `relkind` no tratado,
tipos propios (`enum`, dominio, rango, compuesto suelto), operadores,
collations, conversiones, estadísticas extendidas, diccionarios y
configuraciones de texto, opclasses y opfamilies. Cualquiera de ellas que no
pertenezca a una extensión **detiene la transacción**.

## D2 · `SET ROLE` acotado a la convergencia

`db.py` — las opciones dejan de estar escritas dentro de la llamada:

```python
OPCIONES_DE_CONEXION = '-c statement_timeout=30000 -c lock_timeout=5000'

def init_db_pool(opciones=None):
    ...
    options=(opciones or OPCIONES_DE_CONEXION)
```

`converger_propiedad.py`:

```python
db.init_db_pool(opciones=db.OPCIONES_DE_CONEXION + ' -c role=ecd_migrator')
```

**No se pierde ninguna opción** — se declaran una vez y se añade la del rol.
Escribirlas otra vez allí habría creado dos verdades que divergen en cuanto
alguien toque una.

**Ninguna conexión ordinaria recibe `SET ROLE`:** `init_db_pool()` sin argumento
se comporta exactamente como antes. Hay dos comprobaciones que lo fijan —el
valor por defecto es `None` y `OPCIONES_DE_CONEXION` no contiene `role=`— y el
ensayo lo mide abriendo una conexión normal después de la migración.

Y la herramienta **lo demuestra en tiempo de ejecución** en vez de darlo por
hecho: tras reabrir el pool consulta `session_user, current_user` y aborta si no
son los esperados, imprimiendo lo que obtuvo.

---

# 3 · EL ENSAYO

`backend/herramientas/ensayo_de_convergencia.py` — re-ejecutable, sobre un
clúster desechable cuyo superusuario se llama `postgres`, como Cloud SQL. Se
niega si la base de destino no lleva el prefijo `zz_conv_`.

```bash
ECD_ENSAYO_HOST=127.0.0.1 ECD_ENSAYO_PORT=5460 ECD_ENSAYO_PASS=… \
    python herramientas/ensayo_de_convergencia.py
```

Cada ronda construye su fixture llamando al **`bootstrap_esquema.py` real** con
`ROL_MIGRADOR=postgres`, y ejecuta la **herramienta real** en un proceso aparte,
igual que producción.

## Inventario antes → después (ronda 1, idéntico en la 2)

```
OWNER INICIAL                          OWNER FINAL
  funcion    APLICATIVO postgres    1    funcion    APLICATIVO ecd_migrator    1
  funcion    EXTENSION  postgres   37    funcion    EXTENSION  postgres       37   ← intactas
  indice     APLICATIVO postgres  185    indice     APLICATIVO ecd_migrator  185
  schema     APLICATIVO pg_database_owner 1
  schema     APLICATIVO postgres    1    schema     APLICATIVO ecd_migrator    2
  secuencia  APLICATIVO postgres   36    secuencia  APLICATIVO ecd_migrator   36
  tabla      APLICATIVO postgres   95    tabla      APLICATIVO ecd_migrator   95
```

## Lo que se comprueba, y con qué resultado

### Identidad durante la migración

```
session_user=postgres · current_user=ecd_migrator
```

Impreso por la propia herramienta, y verificado también en la conexión
ordinaria: `('postgres', 'postgres')` — **no hereda el `SET ROLE`**.

### Propiedad

| | |
|---|---|
| objetos aplicativos fuera de `ecd_migrator` | **0** |
| schemas · tablas · secuencias · índices · funciones | 2 · 95 · 36 · 185 · 1 → `ecd_migrator` |
| funciones de `pgcrypto` | **37, con su dueño original** |
| objetos OTHER / UNKNOWN | **0** |

### Grants

| | |
|---|---|
| `ecd_app` puede crear en `public` | **false** |
| `ecd_app` puede reescribir la auditoría | **false** |
| tablas con `SELECT` para `ecd_app` | **95** |

### Privilegios de `ecd_app`, medidos intentándolos

| Operación | Resultado |
|---|---|
| `SELECT` | permitido |
| `INSERT` | permitido |
| `UPDATE` de datos | permitido |
| `ALTER TABLE` | **denegado** — `must be owner of table project_users` |
| `CREATE TABLE` | **denegado** — `permission denied for schema public` |
| `UPDATE activity_log` | **denegado** — `permission denied for table activity_log` |
| `DELETE activity_log` | **denegado** — `permission denied for table activity_log` |

### Invariantes

`file_nodes` (recuento + huella), `file_versions`, `activity_log` (recuento +
huella de `id:action`), `auth_events`, `projects` (recuento + huella de
`id:name`): **idénticas antes y después.**

> **Una corrección a mi propia medida.** La primera versión del ensayo metía
> `users` entre las invariantes y fallaba: crecía de 1 a 2. No era una
> reescritura — el bootstrap **siembra** el administrador inicial. Aflojar la
> comprobación en silencio habría sido trampa, así que se separó: lo histórico
> tiene que salir **idéntico**, y de las cuentas se exige que **ninguna anterior
> desaparezca ni cambie**, diciendo cuántas se sembraron (1 en la primera
> convergencia, **0** al repetir).

### Reproducibilidad

Ronda 2 sobre un estado **nuevo e independiente** — base distinta, y los roles
borrados y vueltos a crear entre medias, para que el punto de partida sea nuevo
de verdad y no el de la ronda anterior con otro nombre. Mismos resultados.

### Idempotencia

Ronda 3 sobre la base **ya convergida**:

- inventario **antes = después**, hasta el último objeto;
- invariantes idénticas;
- **0** cuentas sembradas;
- grants intactos: los 95 `SELECT` y las cuatro denegaciones siguen igual.

### Fail-closed, **provocado**

Se planta `CREATE TYPE public.zz_semaforo AS ENUM (…)` — ownable, sin extensión
detrás, y de una clase que el guion no transfiere:

| | |
|---|---|
| la convergencia | **no se declara correcta** |
| el mensaje | `CONVERGENCIA DETENIDA…`, nombrando `zz_semaforo` |
| el dueño del objeto desconocido | `postgres` → `postgres` — **no se lo apropió** |
| el resto del inventario | **sin un solo cambio**: la transacción entera se deshizo |
| las 95 tablas | siguen donde estaban |

Un «se para si aparece algo raro» que nunca se ha visto pararse es una promesa,
no un control.

---

# 4 · DOS PRUEBAS QUE FIJABAN LOS DEFECTOS

Al pasar la suite, dos pruebas fallaron. Miradas de cerca, **exigían literalmente
las dos líneas rotas**:

```python
assert "pg_get_userbyid(c.relowner)='ecd_app'" in texto      # ← D1
assert "os.environ['PGOPTIONS'] = '-c role=ecd_migrator'" in texto   # ← D2
```

Verdes todo el tiempo, sobre un guion que dejaba 95 tablas sin mover. Es el
patrón que este proyecto ya ha pagado varias veces: **un control que se describe
por intención en vez de por comportamiento.**

No se borraron. Se reescribieron para comprobar la **propiedad**, y se añadieron
dos que cierran los defectos:

| Prueba | Qué fija |
|---|---|
| `…conserva_sus_piezas_de_seguridad` | `ON_ERROR_STOP`, `lock_timeout`, los dos `REVOKE CREATE`, la postcondición nueva y la parada |
| `…no_toca_objetos_de_extension` | los tres bucles excluyen por `deptype='e'`, y **ninguna sentencia** nombra una extensión concreta (en los comentarios sí, a propósito) |
| `…no_depende_de_PGOPTIONS` | `PGOPTIONS` no aparece; el rol viaja en las opciones; no se pierden `statement_timeout` ni `lock_timeout` |
| `…la_conexion_ordinaria_no_lleva_SET_ROLE` | el parámetro sigue con `None` por defecto y `OPCIONES_DE_CONEXION` no lleva `role=` |

El comportamiento lo mide el ensayo contra PostgreSQL. Estas comprueban lo que
se puede comprobar sin base — que no se caiga ninguna guardia.

---

# 5 · SUITE Y BATERÍA

| | |
|---|---|
| `ensayo_de_convergencia.py` | **89 / 89** |
| Suite `backend/tests` | **890 pasan**, 1 omitida, **0 fallan** |
| Batería completa (12 ensayos) | **459 / 459** |

`db.py` es el módulo que toca todo el backend, así que la suite y la batería
completas eran obligatorias, no una formalidad.

---

# 6 · TRES DEFECTOS MÍOS, ENCONTRADOS AL CONSTRUIR EL ENSAYO

Se dicen porque explican por qué el ensayo vale más que la revisión a ojo:

1. **`with conn` de psycopg2 abre transacción aunque `autocommit` sea `True`.**
   Medido: el estado pasa a `INTRANS` tras la primera sentencia, y
   `CREATE DATABASE` no puede ir dentro de una transacción.
2. **`text || "char"` es ambiguo** en PostgreSQL: `relkind` y `typtype` necesitan
   `::text` explícito. El bloque de parada abortaba por eso — irónicamente, un
   fail-closed que fallaba al arrancar.
3. **`DROP ROLE` falla mientras exista la base de la ronda anterior**: los
   permisos concedidos allí dependen del rol («140 objects depend on it»).
   Primero la base, después el rol.

---

# 7 · QUÉ NO CAMBIA

- **No se ha tocado producción**, ni Render, ni ninguna cuenta, ni
  `frontend-react`.
- El **runbook completo no se ha reescrito**: eso viene después, y sólo si
  apruebas este cierre. Lo único que cambia en él es que el paso 6 deja de
  estar bloqueado.
- Siguen faltando **E1–E5**, y con ellas se recalcula el gate técnico.
- `EXTERNAL DOCUMENT PILOT` sigue **`BLOCKED`** por C7: los bytes de GCS no
  tienen copia, ni versionado, ni recuperación demostrada. Nada de lo de hoy
  toca eso.

## Diferencia conocida del fixture

En un clúster local `postgres` **es** superusuario; en Cloud SQL no lo es, sino
miembro de `cloudsqlsuperuser`. No afecta al criterio de los bucles —filtran por
dueño, no por privilegio— y el `GRANT … TO CURRENT_USER WITH SET TRUE` está
precisamente para ese caso. Donde sí podría notarse es en `ALTER SCHEMA public
OWNER TO`: si Cloud SQL lo rechazara, la transacción entera se deshace y no
queda nada a medias. **Es la primera cosa que se sabrá en la ventana real.**
