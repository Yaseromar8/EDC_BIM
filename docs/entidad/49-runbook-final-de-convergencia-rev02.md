# RUNBOOK FINAL DE CONVERGENCIA — `frontend-docs` · REV.02

**Fecha:** 21 de agosto de 2026 · **Sustituye a** `48-runbook-final-de-convergencia.md`.
**No se ha desplegado. No se ha tocado producción. No se ha tocado ninguna cuenta.
No se ha implementado funcionalidad.**

---

# GATES

## `PRODUCTION TECHNICAL DEPLOYMENT: WAITING FOR E1–E5`

…**y bloqueado además por dos defectos nuevos, medidos hoy, en la propia
herramienta de convergencia.** Ver §1. Mientras no se corrijan, no hay ventana
que ejecutar.

## `EXTERNAL DOCUMENT PILOT: BLOCKED`

**Causa: C7.** Los bytes de GCS no tienen copia, ni versionado, ni ninguna
recuperación demostrada. Ver §5.

---

# 1 · OWNERSHIP — **STOP. NO TOCAR PRODUCCIÓN**

Tenías razón en la sospecha, y es peor de lo que parecía. Reproducido en un
clúster desechable cuyo estado de partida es **equivalente al de producción**, y
destruido después.

## 1.1 · El fixture

```
initdb -U postgres            → superusuario `postgres`, como Cloud SQL
CREATE DATABASE ecd_conv
ROL_MIGRADOR=postgres python bootstrap_esquema.py
```

Salida del arranque — la misma línea que viste tú contra Cloud SQL:

```
esquema construido en 33.8 s · 0 fallos
tablas 95/95 · columnas 872/872 · restricciones 510/510 · índices 184/184
FALLO DE PERMISOS: role "ecd_app" does not exist
```

### OWNER INICIAL

| clase | owner | nº |
|---|---|---|
| schema | `pg_database_owner` (public) · `postgres` (ai_brain) | 2 |
| tabla | **`postgres`** | **95** |
| secuencia | **`postgres`** | **36** |
| índice | **`postgres`** | **185** |
| función | **`postgres`** | **38** |
| roles `ecd_*` | **NINGUNO** | 0 |

Estado de partida idéntico al de producción: todo de `postgres`, sin `ecd_app`,
sin `ecd_migrator`.

## 1.2 · Se crearon los roles y se ejecutó la convergencia

`sql/00_roles.sql` → los dos roles creados, `rolsuper=f`, `rolcreatedb=f`,
`rolcreaterole=f`. Correcto.

Después, `converger_propiedad.converger()` — el mismo camino de código que
ejecuta el CLI:

```
RuntimeError: bootstrap constructor rechazado: PostgreSQL autenticó como
«postgres» y se exige «ecd_migrator».
```

### OWNER FINAL (real, tras el fallo)

| clase | owner | nº | |
|---|---|---|---|
| schema | **`ecd_migrator`** | 2 | ✅ movido |
| tabla | **`postgres`** | **95** | ❌ **sin mover** |
| secuencia | **`postgres`** | **36** | ❌ **sin mover** |
| índice | **`postgres`** | **185** | ❌ **sin mover** |
| función | **`postgres`** | **38** | ❌ **sin mover** |
| `CREATE` de `ecd_app` | `false` · `false` | | ✅ revocado |
| **grants de datos a `ecd_app`** | **0 tablas** | | ❌ **nunca aplicados** |

**Y la transacción SQL había hecho `COMMIT`.** El fallo llegó después. Esto es
exactamente la ventana rota a mitad: esquemas del migrador, tablas de
`postgres`, y un `ecd_app` que **no puede leer ni una tabla**. Si esto ocurre en
producción y se hace el cutover, el servicio queda muerto.

## 1.3 · Los dos defectos

### D1 · La convergencia sólo mira objetos de `ecd_app`

`sql/05_convergencia_propiedad.sql`, los tres bucles:

```sql
WHERE n.nspname IN ('public','ai_brain')
  AND pg_get_userbyid(c.relowner) = 'ecd_app'      -- ← tablas y vistas
  AND pg_get_userbyid(c.relowner) = 'ecd_app'      -- ← secuencias
  AND pg_get_userbyid(p.proowner) = 'ecd_app'      -- ← funciones
```

En producción **no hay ni un objeto de `ecd_app`**: los tiene `postgres`. Los
bucles recorren cero filas. Lo único que se mueve es
`ALTER SCHEMA … OWNER TO ecd_migrator`, que va sin condición.

**Y la postcondición del propio SQL cuenta lo mismo que el bucle** —«¿quedan
objetos de `ecd_app`?»— así que da **0**, la transacción **confirma**, y el
guion se declara correcto habiendo dejado 95 tablas donde estaban. Es un control
que se describe por intención en vez de por comportamiento: el mismo defecto que
este proyecto ya pagó tres veces.

Aquí no llegó a imprimir el banner verde sólo porque D2 lo mata antes.

### D2 · `PGOPTIONS` no llega: `db.py` lo pisa

`_migrar_como_rol()` hace `os.environ['PGOPTIONS'] = '-c role=ecd_migrator'` y
reabre el pool. Pero `db.py` pasa `options=` explícitamente en la conexión, y
libpq da precedencia al parámetro sobre la variable de entorno. Medido, mismo
`PGOPTIONS` en los tres casos:

| conexión | `session_user, current_user` |
|---|---|
| sin `options=` | `('postgres', 'ecd_migrator')` ✅ |
| **con `options=` — lo que hace `db.py`** | **`('postgres', 'postgres')`** ❌ |
| con `options=` incluyendo `role` | `('postgres', 'ecd_migrator')` ✅ |

`exigir_identidad_migrador()` hace **bien** su trabajo: detecta que sigue siendo
`postgres` y se niega. El defecto no es esa guardia — es que el `SET ROLE` nunca
llegó.

### Corregir D2 no basta

Con `role=ecd_migrator` efectivo, pero las tablas todavía de `postgres`:

```
actuando como: ecd_migrator
ALTER de una tabla de postgres   -> must be owner of table project_users
GRANT sobre tablas de postgres   -> permission denied for table auth_events
```

`construir()` fallaría en cada `ALTER`, y `aplicar_grants_aplicacion()` no
podría conceder nada. **Hay que corregir D1 y D2.**

## 1.4 · Forma mínima de la corrección — **no aplicada**

Tu instrucción es explícita: *«si el script actual no transforma ese estado,
STOP»*. No transforma ese estado. **STOP.** Esto queda descrito, no hecho, y a
la espera de tu aprobación — es el único paso irreversible del plan y no es
sitio para un arreglo con prisa.

| | Qué cambiaría |
|---|---|
| **D1** | Los tres bucles y la postcondición dejan de preguntar «¿es de `ecd_app`?» y pasan a preguntar «**¿no es de `ecd_migrator`?**», acotado a `public` y `ai_brain`. Así cubre `ecd_app`, `postgres` y cualquier otro dueño heredado, y la postcondición mide lo mismo que persigue: **cero objetos que no sean del migrador** |
| **D2** | El `SET ROLE` viaja dentro del `options=` de la conexión, no por `PGOPTIONS` — o `db.py` deja de fijar `options=` cuando ya viene uno del entorno. Lo primero es más acotado |
| **Prueba** | Este mismo fixture, y la condición de aceptación de §1.5. Un ensayo re-ejecutable, no una comprobación a mano |

Los índices (185) no se transfieren por separado: siguen al dueño de su tabla.

## 1.5 · Condición de aceptación

Sobre un clúster desechable con el estado de partida de §1.1, tras la
convergencia:

```
schema     ecd_migrator = 2      · postgres = 0 · ecd_app = 0
tabla      ecd_migrator = 95     · postgres = 0 · ecd_app = 0
secuencia  ecd_migrator = 36     · postgres = 0 · ecd_app = 0
índice     ecd_migrator = 185    · postgres = 0 · ecd_app = 0
función    ecd_migrator = 38     · postgres = 0 · ecd_app = 0
has_schema_privilege('ecd_app', …, 'CREATE') = false, false
grants de datos a ecd_app = 95 tablas
invariantes históricas: idénticas antes y después
```

*(«`postgres` = 0 ownership aplicativo»: las extensiones y los objetos del
catálogo siguen siendo suyos y **deben** seguir siéndolo — no son objetos de la
aplicación.)*

## 1.6 · Reproducir el fixture

```bash
initdb -D <dir> -U postgres --pwfile=<fichero> -E UTF8 --locale=C
pg_ctl -D <dir> -o "-p 5458" -w start
psql -p 5458 -U postgres -d postgres -c "CREATE DATABASE ecd_conv"
cd backend && ROL_MIGRADOR=postgres ESQUEMA_ESTRICTO=true python bootstrap_esquema.py
```

Después, el inventario de dueños de §1.1 y §1.2. Dos minutos, y se destruye
al terminar.

---

# 2 · UNA SOLA VENTANA — SIN CÓDIGO VIEJO CONTRA ESQUEMA NUEVO

## 2.1 · La incompatibilidad, demostrada

No es precaución: **el backend viejo no puede escribir en el esquema nuevo**. Su
`INSERT` literal, contra el esquema nuevo:

```sql
INSERT INTO folder_permissions (folder_node_id, user_id, permission_level, granted_by)
VALUES (…)
ON CONFLICT (folder_node_id, user_id) DO UPDATE …
```

```
ERROR: null value in column "sujeto_id" of relation "folder_permissions"
       violates not-null constraint
```

Dos roturas independientes: `sujeto_id` es `NOT NULL` **sin default**, y el
`ON CONFLICT (folder_node_id, user_id)` ya no corresponde a ningún índice único
—ahora es `(folder_node_id, sujeto_tipo, sujeto_id)`—.

**Conceder un permiso de carpeta con el código viejo sobre el esquema nuevo
falla.** Queda prohibida la ventana.

> ⚠️ **Y esto puede estar ocurriendo YA.** Tú reconstruiste el esquema desde
> `main` el 20-ago contra Cloud SQL. Si la medición **0.a** confirma que
> `folder_permissions.sujeto_id NOT NULL` está en producción, entonces **el
> servicio desplegado no puede conceder permisos de carpeta desde ese día**.
> Es lo primero que hay que mirar de las cinco lecturas.

## 2.2 · El orden corregido

La ventana empieza cerrando el tráfico y no lo abre hasta el final.

```
0 · MEDIR (fuera de ventana, sólo lectura)
1 · COPIA          (fuera de ventana)
2 · RESTAURACIÓN   (fuera de ventana) → DATABASE RESTORABLE
────────────────── VENTANA ──────────────────
3 · MANTENIMIENTO: suspender el servicio web  ← el tráfico se cierra AQUÍ
4 · ROLES           (identidad administrativa)
5 · CONVERGENCIA + MIGRACIÓN + GRANTS  (un solo acto, desde `main`)
6 · VERIFICAR ecd_app  (--verificar = 0 · ALTER denegado)
7 · CUTOVER  DB_USER=ecd_app  ·  retirar toda credencial administrativa
8 · DESPLEGAR BACKEND NUEVO   ← el commit nuevo es el PRIMERO que arranca
9 · ARRANCAR y reanudar el servicio
10 · DEMOSTRAR pg_stat_activity = ecd_app
11 · ESQUEMA_ESTRICTO=true + reinicio
12 · PORTAL NUEVO
13 · SMOKE TESTS  (obra de prueba)
14 · ABRIR TRÁFICO
────────────────── FIN DE VENTANA ──────────────────
15 · ADJUDICACIÓN DE ADMINS  (decisión, no despliegue)
```

**Lo que cambia frente a REV.01:** el backend nuevo ya no se despliega antes de
la convergencia. Con el servicio suspendido, la convergencia se ejecuta desde el
árbol local en `main` —así usa el manifiesto nuevo— y el primer proceso que
sirve tráfico después es el commit nuevo, contra el esquema nuevo, como
`ecd_app`. **No existe ningún instante con código viejo escribiendo en el
esquema nuevo.**

**Coste:** el servicio está caído desde el paso 3 hasta el 14 — convergencia
(~2 min) + despliegue del backend (~5–10 min) + portal + smoke. Planifícalo
como una ventana de **una hora**, con margen.

**Y si algo falla entre 5 y 11:** el servicio ya está suspendido, así que no hay
usuarios afectados. Se investiga con calma y, si hace falta, se restaura la
copia del paso 1 sobre una base nueva. **Lo que no se hace nunca es devolver
`DB_USER` a `postgres` para «que arranque»**: eso es el fallback silencioso que
todo esto elimina.

---

# 3 · SECRETOS — CORREGIDO

REV.01 mostraba `psql -v app_pw=… -v mig_pw=…`. Estaba mal: **eso es argv**,
visible en `ps` y en el historial. Era además una contradicción con lo que el
propio documento exigía dos líneas antes.

## El mecanismo, que ya está en el guion

`sql/00_roles.sql` tiene `\prompt`: si las variables no llegan, las pide. Pero
**`\prompt` no oculta lo que se teclea** —psql no tiene entrada enmascarada—, y
el comentario del fichero que dice «sin que se vean escritas» es inexacto. No
cumple tu quinto criterio implícito: la pantalla.

## Procedimiento correcto

```bash
read -rs -p 'Contraseña para ecd_app: '      APP_PW; echo
read -rs -p 'Contraseña para ecd_migrator: ' MIG_PW; echo

psql "$CONEXION" <<SQL
\set app_pw '$APP_PW'
\set mig_pw '$MIG_PW'
\i sql/00_roles.sql
SQL

unset APP_PW MIG_PW
```

| Exposición | Cómo se evita |
|---|---|
| Historial del shell | `read -rs` no guarda lo tecleado; la orden sólo contiene `$APP_PW` |
| Argumentos / `ps` | Los valores viajan por **stdin** (heredoc), nunca por argv |
| Pantalla | `read -rs` no hace eco |
| Repositorio | Sólo la referencia a la variable |
| Chat | Nunca salen de tu terminal |
| Entorno del proceso | Variables del shell, **sin `export`** |

**Comprobado en el clúster desechable:** los dos roles se crearon por esta vía,
con `rolsuper=f`, `rolcreatedb=f`, `rolcreaterole=f`.

**Dos avisos.** Que la contraseña **no lleve comilla simple** —rompería el
`\set`—; Cloud SQL exige símbolos, y hay muchos otros. Y `HISTCONTROL=ignorespace`
con un espacio inicial es un cinturón extra, no el mecanismo.

Lo mismo aplica a `DB_PASS` de la convergencia y del cutover: **tecleada o
pegada directamente en el panel de Render**, nunca en una orden.

---

# 4 · SMOKE TESTS — CLASIFICADOS

**Regla:** ninguna prueba modifica datos contractuales reales. Lo que escribe,
escribe en una obra creada expresamente para probar.

## 4.0 · Preparar la obra de prueba (una vez, antes del paso 13)

Una obra nueva, nombrada de forma inequívoca —p. ej. `ZZ VERIFICACIÓN
DESPLIEGUE 2026-08` —, con dos usuarios de prueba, un documento inventado y un
transmittal emitido para la ocasión. **Nada copiado de producción**: ni un
documento, ni un usuario, ni una fotografía.

`herramientas/obra_de_prueba.py` genera una obra con la misma **forma** que la
real y contenido inventado — está escrita para la base local, así que sobre
producción se crea a mano desde la interfaz, que es además parte de la prueba.

**La obra de prueba se queda.** La auditoría es append-only por privilegio
—`REVOKE UPDATE, DELETE, TRUNCATE ON activity_log, auth_events FROM ecd_app`— y
borrarla sería reescribir el rastro. Se archiva al terminar; no se destruye.

## 4.1 · READ ONLY

| Prueba | Esperado |
|---|---|
| `GET /api/health` sin credenciales | 200, `version` = commit nuevo |
| `GET /api/seguridad/postura` con Entity Admin | qué punto de los 6 falla ahora |
| `GET /api/projects/<obra real>/mi-administracion` | `es_admin_de_obra` correcto |
| Abrir un RFI y un Red Line **reales** — sólo abrir | se abren; nada cambia |
| Listado del expediente de una obra real | lista lo que corresponde a esa sesión |
| Búsqueda global con dos sesiones distintas | cada una ve lo suyo |
| Como miembro corriente, pulsar administración | **403**, y la interfaz no lo ofrecía |
| `pg_stat_activity` (§6 del REV.01) | `ecd_app`, ≥2 conexiones |

## 4.2 · WRITE SOBRE DATOS DE PRUEBA CONTROLADOS

**Todas sobre la obra de prueba. Ninguna sobre un objeto contractual real.**

| Prueba | Objeto | Esperado |
|---|---|---|
| Nombrar administrador de obra | obra de prueba, usuario de prueba | 200 |
| Retirar al único administrador, sin ser Entity Admin | ídem | **409 `ULTIMO_ADMIN_DE_OBRA`** |
| Nombrar a quien no es miembro | ídem | **404 `NO_ES_MIEMBRO`** |
| Conceder permiso de carpeta | carpeta de prueba | 200 — **es la prueba de §2.1**: con el código viejo fallaba |
| Registrar recepción sin `destinatario_id` | **transmittal de prueba** | **400 `FALTA_DESTINATARIO`** |
| Registrar recepción con destinatario válido | **transmittal de prueba** | 200, `ADMIN_RECORDED_RECEIPT`, y el encargo **del destinatario** sale de su bandeja |
| Emitir un RFI y darle veredicto | obra de prueba | el veredicto sólo lo dicta el responsable |

> **Prohibido explícitamente:** demostrar `ADMIN_RECORDED_RECEIPT` sobre un
> transmittal contractual real. Un acuse no se retira —la tabla es evidencia y
> sólo suma—, así que una prueba ahí **queda escrita para siempre en el
> expediente** y además afirma una recepción que nadie hizo.

## 4.3 · `verificar_produccion.py`

Batería autenticada, con dos usuarios de **obras distintas**, credenciales por
**entorno** y nunca por argumento. Sus escrituras deben apuntar a la obra de
prueba: repásalo antes de ejecutarla contra producción. Sin el segundo usuario,
la mitad que demuestra el aislamiento **se salta y lo dice** — y entonces **no
cuenta como aprobada**.

---

# 5 · LOS DOS GATES, Y C7

## `PRODUCTION TECHNICAL DEPLOYMENT`

Que el sistema arranque, sirva y respete sus propias reglas, con las identidades
separadas. **Estado: `WAITING FOR E1–E5` + bloqueado por D1 y D2 (§1).**

## `EXTERNAL DOCUMENT PILOT`

Que una entidad externa deposite documentos reales. **Estado: `BLOCKED`.**

**No puede ponerse verde mientras C7 siga abierto**, y no depende de este
repositorio: el bucket de GCS no tiene copia ni Object Versioning. Un despliegue
técnicamente impecable sobre un almacén sin protección sigue siendo un sitio
donde un borrado es definitivo.

### Evidencia mínima para desbloquearlo

Lo mínimo que hace falta. **No es una solución enterprise** y no hay que
diseñarla ahora:

| # | Evidencia | Cómo se aporta |
|---|---|---|
| **G1** | **Object Versioning activado** en el bucket de la entidad | Captura de la configuración de GCS |
| **G2** | **Regla de retención** de las versiones no vigentes (p. ej. 90 días), para que versionar no crezca sin control ni caduque antes de detectar un borrado | Captura de la Lifecycle rule |
| **G3** | **Una recuperación real, demostrada**: borrar un objeto **de prueba**, recuperarlo desde su versión anterior, y que su SHA-256 coincida con el registrado en `file_versions` | Registro de la prueba, con el hash antes y después |
| **G4** | **Copia fuera del proyecto de Google** que hospeda la base — el radio de explosión que ya se materializó una vez con la facturación en mora | Evidencia del destino y de su última sincronización |
| **G5** | **Conciliación almacén↔base ejecutada contra el bucket real**: `conciliacion_almacen.py` cruza las 8 columnas que apuntan a objetos, en las dos direcciones, sin borrar nada | Su salida, con el recuento de sobrantes y **faltantes** |

G3 es el que convierte «hay copia» en «se recupera». Los otros cuatro sin él
son configuración sin prueba — el mismo error que una copia de base que nunca se
ha restaurado.

Con G1–G5, `EXTERNAL DOCUMENT PILOT` pasa a `READY` en lo que respecta a C7.
Otros bloqueos —clasificación 19650-5, MFA sobre la cuenta administrativa— se
evalúan aparte y no se dan por cerrados aquí.

### Terminología, que no se mezcla

| | Cubre | Estado |
|---|---|---|
| `DATABASE RESTORABLE` | Base de PostgreSQL: fichas, estados, permisos, rastro | **Pendiente de E5** (§PASO 2) |
| `FULL ECD DISASTER RECOVERY` | Base **y** bytes | **No alcanzable hoy.** C7 abierto |

Una restauración de base sobre un bucket vaciado devuelve un expediente que sabe
qué documentos hubo y no tiene ninguno.

---

# 6 · PASO 0.b — CONSULTAS TOLERANTES

Primero existencia, después privilegios. Las de REV.01 fallaban si los roles no
existen — que es el caso real.

```sql
-- 1 · ¿EXISTEN? Esto contesta siempre, existan o no.
SELECT r.esperado,
       (SELECT count(*) FROM pg_roles p WHERE p.rolname = r.esperado) = 1 AS existe
  FROM (VALUES ('ecd_app'),('ecd_migrator'),('postgres')) AS r(esperado);

-- 2 · Los roles reales de la instancia, con sus atributos.
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin, rolbypassrls
  FROM pg_roles WHERE rolname NOT LIKE 'pg\_%' ORDER BY 1;

-- 3 · DUEÑOS. No pregunta por ningún rol concreto: pregunta quién posee qué.
SELECT 'schema' AS clase, pg_get_userbyid(nspowner) AS owner, count(*)
  FROM pg_namespace WHERE nspname IN ('public','ai_brain') GROUP BY 1,2
UNION ALL
SELECT 'tabla', pg_get_userbyid(c.relowner), count(*)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','ai_brain') AND c.relkind IN ('r','p') GROUP BY 1,2
UNION ALL
SELECT 'vista', pg_get_userbyid(c.relowner), count(*)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','ai_brain') AND c.relkind IN ('v','m') GROUP BY 1,2
UNION ALL
SELECT 'secuencia', pg_get_userbyid(c.relowner), count(*)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','ai_brain') AND c.relkind='S' GROUP BY 1,2
UNION ALL
SELECT 'indice', pg_get_userbyid(c.relowner), count(*)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','ai_brain') AND c.relkind='i' GROUP BY 1,2
UNION ALL
SELECT 'funcion', pg_get_userbyid(p.proowner), count(*)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','ai_brain') GROUP BY 1,2
ORDER BY 1,2;

-- 4 · PRIVILEGIOS: sólo si el rol existe. `has_*_privilege` sobre un rol
--     inexistente ABORTA la consulta; este CASE la deja contestar «no aplica».
SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ecd_app')
            THEN has_schema_privilege('ecd_app','public','CREATE')::text
            ELSE 'rol inexistente' END AS app_create_public,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ecd_app')
            THEN has_table_privilege('ecd_app','activity_log','UPDATE')::text
            ELSE 'rol inexistente' END AS app_reescribe_auditoria;

-- 5 · Grants de datos, tolerante por naturaleza: si no existe, salen 0 filas.
SELECT grantee, privilege_type, count(*)
  FROM information_schema.table_privileges
 WHERE grantee IN ('ecd_app','ecd_migrator') GROUP BY 1,2 ORDER BY 1,2;
```

**Cómo se lee el resultado.** Hoy se espera: consulta 1 → `ecd_app` y
`ecd_migrator` en `false`; consulta 3 → todo de `postgres`; consulta 4 → `rol
inexistente`; consulta 5 → vacía. **Ese es el estado de partida que §1
reprodujo**, y contra el que la convergencia todavía no funciona.

---

# 7 · QUÉ CAMBIA RESPECTO A REV.01

| | REV.01 | REV.02 |
|---|---|---|
| Ownership | Se daba por bueno el guion | **Reproducido: no transforma el estado de producción. STOP** |
| Ventana | Backend nuevo antes de la convergencia | **Servicio suspendido; el commit nuevo es el primero que sirve** |
| Incompatibilidad | Precaución razonada | **Demostrada**: el `INSERT` viejo viola `sujeto_id NOT NULL` |
| Secretos | `psql -v app_pw=…` (argv) | **stdin por heredoc + `read -rs`**, probado |
| Smoke | Una sola lista | **READ ONLY / WRITE sobre obra de prueba**, con prohibición explícita |
| Gates | Uno | **Dos**, y C7 con sus cinco evidencias |
| Paso 0.b | Fallaba sin los roles | **Tolerante**: existencia primero |

---

# 8 · LO QUE FALTA, EN ORDEN

1. **Decidir sobre D1 y D2** (§1.4). Sin eso no hay ventana. La corrección está
   descrita y **no aplicada**, esperando tu aprobación.
2. **Ensayo re-ejecutable** de la convergencia sobre el fixture de §1.1, con la
   condición de aceptación de §1.5 — para que la próxima vez no haya que
   demostrarlo a mano.
3. **E1–E5**: las cuatro lecturas y la restauración. **E1 primero**, por lo de
   §2.1: puede haber una rotura en producción desde el 20-ago.
4. **C7 / G1–G5**, en la consola de Google, para el segundo gate.

---

# 9 · LÍMITES

- **No se ha desplegado, no se ha tocado producción, no se ha tocado ninguna
  cuenta, no se ha tocado `frontend-react`, no se ha implementado
  funcionalidad.**
- Los clústeres desechables se crearon para estas medidas y se **destruyeron**,
  con sus credenciales de ensayo.
- Diferencia conocida del fixture: en un clúster local `postgres` **es**
  superusuario; en Cloud SQL no lo es, sino miembro de `cloudsqlsuperuser`. No
  afecta a D1 —los bucles filtran por dueño, no por privilegio— y en D2 favorece
  al fixture: si allí no funciona, en Cloud SQL tampoco.
- Este runbook **no es una certificación**, ni ISO ni de tercero.
- `FULL ECD DISASTER RECOVERY` no se afirma mientras C7 siga abierto.
