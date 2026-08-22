# PLAN DE CONVERGENCIA Y DESPLIEGUE — `frontend-docs`

**Fecha:** 21 de agosto de 2026 · **Naturaleza:** auditoría de puerta. Sin cambios.
**Estado del código:** congelado. No se añadió funcionalidad. No se desplegó nada.

---

# VEREDICTO

## `NOT READY`

Cuatro cosas faltan. Dos son defectos **medidos**; dos son hechos de producción
que **no se pueden asumir y todavía no se han medido**.

| # | Qué falta | Naturaleza | Quién lo cierra |
|---|---|---|---|
| **B1** | `ecd_app` y `ecd_migrator` **no existen en producción**. La convergencia de propiedad nunca se ejecutó. | Medido | Tú, con la identidad administrativa de Cloud SQL |
| **B2** | `asegurar_columna()` **ejecuta DDL aunque `DDL_EN_CALIENTE=false`**. Rompe exactamente la propiedad que exige el estado objetivo. | Medido | Un decorador. Fuera del congelado: es un defecto, no una función |
| **B3** | El estado real de producción —roles, dueños, grants, qué objetos del esquema existen, qué punto de postura falla— **no está medido**. | No medido | Cuatro órdenes de solo lectura, abajo |
| **B4** | La copia de seguridad **nunca se ha restaurado de punta a punta**. Una copia sin restaurar es una intención. | No medido | `ensayo_de_restauracion.py`, con contraseña tecleada |

Y una corrección a lo que dije ayer, porque cambia el plan: **no es una columna.
Son 31 objetos de esquema nuevos y uno retirado.**

---

# 1 · NO USAR `postgres` COMO ESTRATEGIA — ESTADO REAL

## 1.1 · Lo que está medido

**Producción no tiene los roles.** Evidencia: tu propia ejecución del bootstrap
contra Cloud SQL el 20/21-ago terminó en

```
FALLO DE PERMISOS: role "ecd_app" does not exist
```

Eso lo imprime `aplicar_grants_aplicacion()` **después** de construir el esquema.
Es decir: el esquema se construyó como `postgres`, y el paso que reparte permisos
al runtime no pudo ni empezar porque el rol destinatario no existe. Si `ecd_app`
no existe, `ecd_migrator` tampoco, y no hay ninguna separación: hay una única
identidad que es dueña de todo y además sirve la aplicación.

**El repositorio ya tiene el procedimiento completo.** No hay que diseñarlo, hay
que ejecutarlo — y nunca se ejecutó en producción:

| Pieza | Qué hace |
|---|---|
| `backend/sql/00_roles.sql` | Crea los dos roles. Las contraseñas van por variable de `psql`, **tecleadas**, nunca en el fichero ni en el historial |
| `backend/sql/05_convergencia_propiedad.sql` | Transfiere a `ecd_migrator` **todos** los objetos que `ecd_app` posea en `public` y `ai_brain`. Transaccional. No toca una sola fila |
| `backend/herramientas/converger_propiedad.py` | Orquesta la ventana única: exige `session_user=current_user=postgres`, toma invariantes, ejecuta el SQL, cierra el pool administrativo, reabre con `SET ROLE ecd_migrator`, construye, verifica, concede, y **demuestra que ninguna invariante histórica cambió** |
| `backend/sql/03_grants_ida.sql` | `ecd_app`: `SELECT/INSERT/UPDATE/DELETE` sobre datos, `USAGE` sobre secuencias. **`REVOKE CREATE`** sobre ambos esquemas. Y `REVOKE UPDATE, DELETE, TRUNCATE ON activity_log, auth_events` — la auditoría es append-only **a nivel de privilegio**, no solo por convención |

El único proceso permanente que usa `ecd_migrator` es… ninguno: `yarn start`
corre como `ecd_app` y su primer paso es `bootstrap_esquema.py --verificar`, que
sólo lee el catálogo.

**Medido en el clúster de ensayo, con `DB_USER=ecd_app`:**

```
tablas 95/95 · columnas 872/872 · restricciones 510/510
índices 184/184 · funciones 24/24 · extensiones 2/2      código de salida 0
```

`ecd_app` puede verificar el esquema completo sin ningún privilegio de DDL. El
paso «probar `ecd_app` sin DDL» de tu orden **ya está demostrado**.

Y al revés, medido contra `ecd_dr12d` (donde la separación sí existe):

```
ALTER TABLE project_users ADD COLUMN … → ERROR: debe ser dueño de la tabla project_users
```

## 1.2 · B2 — el código nuevo se salta el congelado del DDL. Medido

`DDL_EN_CALIENTE=false` funciona porque 43 funciones de esquema llevan
`@solo_con_ddl`: con el interruptor apagado devuelven sin tocar la base.
**`asegurar_columna()` no lo lleva.** Medido:

```
ddl_permitido() = False
ensure_columnas_pendientes decorada: True
asegurar_columna decorada:          False

-- con el DDL CONGELADO, se le pide a cada una que actúe --
[admin] project_users.es_admin verificada.        ← ejecutó su ALTER TABLE
```

`ensure_columnas_pendientes` calla, como debe. La mía **ejecuta**. Y `server.py`
la llama en cada arranque, sin condición.

Consecuencia en el estado objetivo: la aplicación intentaría `ALTER TABLE` como
`ecd_app` en cada boot, fallaría —correctamente— y dejaría un error en el log
del arranque para siempre. Peor: mientras esté sin decorar, la frase
«`DDL_EN_CALIENTE=false` ⇒ la aplicación no puede alterar su esquema» **deja de
ser cierta**, y esa frase es uno de los seis puntos de postura.

**Corrección:** una línea, `@solo_con_ddl` sobre `asegurar_columna`. El bootstrap
no se ve afectado: usa `with permitir_ddl()`. **No la he aplicado** — el código
está congelado y la decisión es tuya.

## 1.3 · Corrección a lo que dije ayer

Escribí que `es_admin_de_obra` es *fail-closed* si la columna falta. Es cierto
para la **respuesta**, y es falso para la **petición**. Medido:

```
resultado: False
la transacción queda ABORTADA → current transaction is aborted,
                                commands ignored until end of transaction block
```

El `SELECT` fallido envenena la transacción en curso: la petición que llamó a la
comprobación revienta después, en cualquier otra sentencia. No es degradación
elegante — es un 500. Segunda razón independiente para que la columna exista
**antes** de que arranque el código, y razón para no confiar en ese camino como
red de seguridad.

Con `ESQUEMA_ESTRICTO=true` el riesgo no llega a materializarse: el servicio no
arranca. Es el proceso el que protege, no el código.

---

# 2 · ORDEN DE DESPLIEGUE — CORREGIDO

Tu orden es correcta en su lógica. El repositorio exige **cinco correcciones**.

## 2.1 · Las cinco correcciones

**C1 · Faltaba el paso de identidades, y va antes que todo lo demás.**
No se puede «aplicar el esquema con el rol migrador» cuando el rol migrador no
existe y todos los objetos los posee `postgres`. La ventana de convergencia
(`00_roles.sql` → `converger_propiedad.py`) es un paso previo, único, y con
identidad administrativa.

**C2 · `ESQUEMA_ESTRICTO=true` va DESPUÉS de desplegar, no antes.**
Esto es una trampa real y hoy está armada:

> El commit que corre (`b671559`) lleva un manifiesto que **exige**
> `folder_permissions not null user_id`. El esquema que tú construiste el 20-ago
> **ya no la tiene**: el modelo de sujetos la retira. Si activas
> `ESQUEMA_ESTRICTO=true` **antes** de desplegar el código nuevo,
> `bootstrap_esquema.py --verificar` sale con 1 y **gunicorn no arranca**.
> Tumbas el servicio con una variable, sin desplegar nada.

Orden seguro: esquema → desplegar código nuevo (con estricto todavía en `false`)
→ comprobar → **entonces** activar `true` y reiniciar. Si el reinicio falla,
devolver la variable a `false` deja el servicio en pie mientras se investiga.

**C3 · No es una columna. Son 31 objetos y una retirada.**
Lo que el código pendiente exige y el desplegado no:

| | |
|---|---|
| columnas | `doc_rfis` y `doc_redlines`: `responsable_id`, `historial`, `vence_en`, `cerrado_por` · `encargos.recordado_en` · `folder_permissions.sujeto_tipo`, `sujeto_id` · **`project_users.es_admin`** |
| restricciones | 14 — unicidad por obra de RFI y Red Line, `CHECK` de estados, claves ajenas a `projects`/`users`, `NOT NULL` de sujeto y de `es_admin`, `CHECK` del tipo de sujeto |
| índices | 5 — únicos de código por obra, sujeto de permiso, y el parcial de administración |
| **retirado** | `folder_permissions not null user_id` |

Parte de esto **puede** estar ya en producción: tú ejecutaste el bootstrap desde
`main` el 20-ago. Pero eso no se asume — se mide (§3, paso 0).

**C4 · La verificación de restaurabilidad tiene un requisito que no es de este
proyecto.** `ensayo_de_restauracion.py` pide una contraseña **tecleada**
(`getpass`) porque crear una base exige `CREATEDB`, y ni `ecd_app` ni
`ecd_migrator` lo tienen. Eso es correcto y no se va a cambiar; hay que
preverlo: **no es automatizable, se hace a mano y con tiempo**.

**C5 · Falta el portal.** `frontend-docs` es un Static Site aparte
(root `frontend-docs`, build `npm install && npm run build`, publish `dist`). El
backend nuevo devuelve `/api/projects/<id>/mi-administracion`; el portal viejo no
lo llama, así que **la interfaz seguiría enseñando los botones por `user.role`**.
No rompe nada — el servidor bloquea igual — pero deja ofrecidos botones que dan
403. Los dos despliegues van juntos, backend primero.

## 2.2 · El orden

> Las contraseñas se **teclean** en cada paso. No se pegan aquí, no se pasan por
> argumento (queda en el historial y en la lista de procesos), no se guardan.
> **La credencial del migrador no se declara nunca en el servicio web.**

**PASO 0 — MEDIR (solo lectura, sin ventana de mantenimiento)**
Las cuatro órdenes de §3. Sin esto no se empieza: todo lo que sigue depende de
qué hay realmente ahí.

**PASO 1 — COPIA, Y DEMOSTRAR QUE SE RESTAURA**
1. `python backend/copia_de_seguridad.py --destino <fuera de GCP>`
2. `python backend/herramientas/ensayo_de_restauracion.py` — contraseña tecleada.
3. Recordar lo que la copia **no** cubre y está escrito en su cabecera: **los
   bytes de GCS no van dentro**, ni los secretos. Copia del bucket aparte.

**PASO 2 — VENTANA ÚNICA DE CONVERGENCIA DE IDENTIDADES** *(sólo la primera vez)*
1. `psql … -v app_pw=… -v mig_pw=… -f backend/sql/00_roles.sql` (tecleadas).
2. En el servicio web de Render, temporalmente:
   `CONFIRMAR_CONVERGENCIA_PROPIEDAD=SI_UNA_VEZ` · Start Command
   `yarn converge:ownership`.
3. Esperar el verde. La herramienta transfiere propiedad, revoca `CREATE`,
   construye, verifica, concede, y **compara invariantes antes/después**.
4. **Borrar la variable temporal** y devolver el Start Command a `yarn start`.

**PASO 3 — ESQUEMA CON EL ROL MIGRADOR**
`DB_USER=ecd_migrator` (contraseña tecleada) → `python bootstrap_esquema.py`.
No hace falta `ROL_MIGRADOR`: su valor por defecto ya es `ecd_migrator`.
Debe terminar en `95 tablas · 872 columnas · 510 restricciones · 184 índices`, 0
faltantes, y `permisos de ecd_app aplicados: datos SI, DDL NO`.

**PASO 4 — VERIFICAR EL MANIFIESTO CON LA IDENTIDAD DE APLICACIÓN**
`DB_USER=ecd_app` → `python bootstrap_esquema.py --verificar` → **código 0**.
Es la misma orden que corre `yarn start`, con el mismo rol. Demostrado en
ensayo.

**PASO 5 — DEMOSTRAR QUE `ecd_app` NO PUEDE DDL**
Como `ecd_app`, intentar un `ALTER TABLE` cualquiera. Tiene que fallar con
`debe ser dueño de la tabla`. Si tiene éxito, el paso 2 no terminó y **no se
sigue**.

**PASO 6 — DESPLEGAR EL BACKEND** — con `ESQUEMA_ESTRICTO` todavía en `false`.
Comprobar `/api/health`: `version` tiene que ser el commit nuevo.

**PASO 7 — ACTIVAR `ESQUEMA_ESTRICTO=true` Y REINICIAR**
Si arranca, el esquema está completo **y demostrado por el propio arranque**. Si
no arranca, volver la variable a `false` — el servicio vuelve — e ir al log.

**PASO 8 — DESPLEGAR EL PORTAL** (`frontend-docs`).

**PASO 9 — SMOKE TESTS** — §2.3.

**PASO 10 — ADJUDICACIÓN DE ADMINS** — §4, ya con el producto en pie y con la
columna existiendo. Es una decisión, no un despliegue.

## 2.3 · Smoke tests

Lo que **no** cuenta como smoke test: que la página cargue. Un 200 donde tocaba
un 403 es el fallo que hay que buscar.

| Comprobación | Esperado |
|---|---|
| `GET /api/health` sin credenciales | 200, `version` = commit nuevo |
| `GET /api/seguridad/postura` con sesión de Entity Admin | detalle; anotar qué punto falla |
| `herramientas/verificar_produccion.py` con dos usuarios de obras distintas | la batería completa; sin el segundo usuario, la mitad que demuestra el aislamiento **se salta y lo dice** |
| Participantes → columna «Administra esta obra» | visible; nombrar y retirar responden 200 |
| Retirar al único administrador de una obra, no siendo Entity Admin | **409 `ULTIMO_ADMIN_DE_OBRA`** |
| Un miembro corriente pulsa algo de administración | **403**, y la interfaz ya no se lo ofrecía |
| Transmittal: registrar recepción sin `destinatario_id` | **400 `FALTA_DESTINATARIO`** |
| Transmittal: registrarla con destinatario válido | 200, fila `ADMIN_RECORDED_RECEIPT`, y el encargo **del destinatario** desaparece de su bandeja |
| Un RFI y un Red Line existentes | se abren, y ningún histórico cambió |

---

# 3 · PASO 0 — LO QUE HAY QUE MEDIR ANTES DE NADA

Cuatro órdenes de solo lectura. **Ninguna cambia nada.**

**0.a — Qué objetos del esquema faltan realmente.** Desde tu equipo, apuntando a
Cloud SQL, con el árbol en `main`:

```bash
cd backend && ESQUEMA_ESTRICTO=true python bootstrap_esquema.py --verificar
```

Sólo lee el catálogo. Dice **cuáles** faltan, no cuántos. Código 0 = completo.

**0.b — Roles, dueños y permisos.**

```sql
SELECT rolname, rolsuper, rolcreatedb, rolcanlogin FROM pg_roles WHERE rolname NOT LIKE 'pg\_%' ORDER BY 1;
SELECT pg_get_userbyid(nspowner) AS dueno_schema, nspname FROM pg_namespace WHERE nspname IN ('public','ai_brain');
SELECT tableowner, count(*) FROM pg_tables WHERE schemaname IN ('public','ai_brain') GROUP BY 1 ORDER BY 2 DESC;
SELECT has_schema_privilege('ecd_app','public','CREATE') AS app_puede_crear;
SELECT has_table_privilege('ecd_app','activity_log','UPDATE') AS app_puede_reescribir_auditoria;
```

Lo que tiene que salir cuando esté bien: los tres roles existen · dueño de ambos
esquemas `ecd_migrator` · **cero** tablas de `ecd_app` o `postgres` ·
`app_puede_crear = false` · `app_puede_reescribir_auditoria = false`.

**0.c — Qué punto de postura falla.** El latido dice `faltan: 1` de 6 y **no
dice cuál, a propósito**. Con sesión de Entity Admin:

```
GET /api/seguridad/postura
```

Los seis son `APP_SECRET`, `SESSION_PEPPER`, `CORS_ORIGINS`,
`DDL_EN_CALIENTE_APAGADO`, `ENFORCE_PROJECT_AUTHZ`, `AUTH_POLICY_MODE_ESTRICTO`.
Que sean **6 y no 7** ya dice una cosa: `DEPLOY_PROFILE` no es `portal`.

> Si el que falla es `DDL_EN_CALIENTE_APAGADO`, entonces hoy la aplicación en
> producción **sí** puede alterar su propio esquema — y como además corre como
> `postgres`, lo consigue. Eso cambiaría B2 de «defecto latente» a «defecto
> activo».

**0.d — Variables del servicio web.** Confirmar en el panel de Render, sin
copiar ningún valor a ninguna parte: `DB_USER` · `DDL_EN_CALIENTE` ·
`ESQUEMA_ESTRICTO` · `ENFORCE_PROJECT_AUTHZ` · `AUTH_POLICY_MODE` ·
`DEPLOY_PROFILE` · `CORS_ORIGINS` (que sea una URL y no una fila de tabla pegada
— ya pasó el 20-ago) · `APP_URL`.

---

# 4 · ADJUDICACIÓN DE ADMINS — TABLA DE DECISIÓN

**No se ha cambiado ninguna cuenta. No se ha inferido nada.** `es_admin` nace
`FALSE` para todos y ninguna cuenta ha perdido nada.

> **Medido en `ecd_dr12d` (la base local), no en producción.** Es la única a la
> que tengo acceso. La adjudicación que vale es la de producción: la consulta
> para reproducir esto está al final de la sección.

17 cuentas · 10 obras · 3 con `role='admin'`:

| Cuenta | Tipo aparente | Obras donde participa | Actividad | Recomendación |
|---|---|---|---|---|
| **id 2 · Yaser Omar**<br>`omarsanchezh8@gmail.com`<br>alta 22-feb-2026 | Propietario del sistema | `PQT8 Talara (PRUEBAS)` — y **no** `PQT8_TALARA`, la real | 0 registros | **ENTITY ADMIN** |
| **id 21 · Administradora Municipal**<br>`admin@munisanmarcos.gob.pe`<br>alta 18-ago-2026 | Admin inicial del piloto de entidad | **ninguna** | 7 registros | **ENTITY ADMIN** |
| **id 30 · Medicion Infra**<br>`medicion@local.test`<br>alta 19-ago-2026 | **Cuenta técnica** | **ninguna** | **75 registros** | **CUENTA TÉCNICA SIN ADMIN DE APP** |

### El razonamiento, para que puedas discutirlo

**id 2 — Entity Admin.** Es tu cuenta, y las funciones que sólo tiene el Entity
Admin —crear y archivar obras, administrar cuentas, el catálogo de idoneidad de
la entidad— son tuyas. Aparte: participa en la obra de *pruebas* y no en
`PQT8_TALARA`. Hoy da igual porque el Entity Admin llega a todo; **el día que
esa cuenta deje de ser Entity Admin, perdería el acceso a la obra real**. Si
alguna vez se toca, primero membresía, después rol.

**id 21 — Entity Admin.** Es el administrador inicial declarado por
`ADMIN_EMAIL` del piloto municipal. Cero obras es coherente con lo que es. No
tocar.

**id 30 — la que esta separación existe para encontrar.** Cuenta técnica
(`@local.test`), creada el 19-ago, **75 registros de actividad** —o sea, se usa—
y **cero obras**. Tiene administración de la instancia entera para hacer
mediciones. Es exactamente el caso del §7 del encargo: autoridad conservada por
inercia, que nadie detecta porque nada falla.

Lo que se recomienda **no** es «quitarle el admin y ya»: es decidir qué necesita
realmente. Si mide contra la base, no necesita ningún rol de aplicación —
necesita credenciales de PostgreSQL, que es otra cosa (§5). Si mide contra la
API, necesita ser **miembro de las obras que mide**, con el permiso mínimo, y
`role='user'`. **Bajarle el rol sin darle antes la membresía la deja sin acceso**
— y eso hay que hacerlo a propósito, no de golpe.

**Nada de esto se ejecuta hasta que una persona lo apruebe cuenta por cuenta.**

Para reproducir sobre producción (solo lectura):

```sql
SELECT u.id, u.name, u.email, u.role, COALESCE(u.is_active,TRUE) AS activa,
       COALESCE((SELECT string_agg(p.name,' · ' ORDER BY p.name)
                   FROM project_users pu JOIN projects p ON p.id=pu.project_id
                  WHERE pu.user_id=u.id),'—') AS obras,
       (SELECT count(*) FROM activity_log a WHERE a.performed_by IN (u.email,u.name)) AS actividad
  FROM users u WHERE u.role='admin' ORDER BY u.id;
```

---

# 5 · EL SYSTEM OPERATOR NO NECESITA ADMIN DE APLICACIÓN

Demostrado, no afirmado.

| Tarea | Qué necesita | ¿`users.role='admin'`? | Cómo se comprobó |
|---|---|---|---|
| **Deployment** | Acceso al panel de Render y a GitHub | **No** | `yarn start` no autentica contra la aplicación |
| **Migración** | `DB_USER=ecd_migrator` + contraseña | **No** | `bootstrap_esquema.py` es un CLI: no abre sesión, no lee `users` |
| **Backup / restore** | Credenciales de PostgreSQL (y `CREATEDB` para restaurar) | **No** | `copia_de_seguridad.py` y `restaurar.py` no importan `auth_middleware` ni tocan `current_user` |
| **Health** | Nada | **No** | Medido contra producción, sin credenciales: `GET /api/health` → **200** |
| **Logs** | Panel de Render | **No** | La aplicación no sirve sus logs por HTTP |

Contraste medido el mismo día, contra el servicio real:

```
/api/health              sin credenciales → 200
/api/seguridad/postura   sin credenciales → 401
/api/docs/list           sin credenciales → 401
```

El latido es público **a propósito** y lo dice en su propio docstring: se
consulta justo cuando el backend no responde y nadie puede autenticarse.

## Lo que sí exige Entity Admin, y por qué es correcto

- `/api/seguridad/postura` — **qué punto** de configuración falla. Público es un
  mapa de por dónde entrar; el recuento va en el latido para poder verificar
  desde fuera que un cambio se aplicó, sin señalar dónde.
- La lectura del rastro de auditoría (`routes/audit.py`).

Un operador que además necesite diagnosticar desde dentro necesita una sesión de
Entity Admin. **Eso es una segunda identidad, no un motivo para que la cuenta
técnica conserve el rol** — y es justo la decisión de §4.

## El límite, dicho

Quien tiene la contraseña de Cloud SQL o el panel de GCS **entra por fuera de
Flask**. Ningún valor de `users.role` lo impide, y esta separación no lo
pretende. IAM de nube no se resuelve aquí, tal como pediste. Lo que sí se puede
decir después de esto: **el operador no necesita autoridad dentro de la
aplicación para operarla**.

---

# 6 · CONVERGENCIA DE PRODUCCIÓN — INVENTARIO

| | Estado | Fuente |
|---|---|---|
| **Commit que corre** | `b671559bc3e2`, rama `main` | `GET /api/health`, medido hoy |
| **Commits pendientes** | **16**, de `6f67472` a `f623ebc` | `git log origin/main..main` |
| **Esquema de producción** | **No medido.** El manifiesto pendiente exige **31 objetos** que el desplegado no, y retira 1 | `git diff` del manifiesto · §3 paso 0.a lo resuelve |
| **Roles PostgreSQL** | Sólo `postgres`. `ecd_app` y `ecd_migrator` **no existen** | Tu ejecución del bootstrap: `role "ecd_app" does not exist` |
| **Dueños** | Todo de `postgres`. Convergencia nunca ejecutada | Se deduce de lo anterior · §3 paso 0.b lo confirma |
| **Grants** | `03_grants_ida.sql` nunca aplicado: sin `ecd_app` no hay a quién conceder | íd. |
| **`ESQUEMA_ESTRICTO`** | `false` — puesto por ti el 20-ago para desbloquear el arranque | Tu sesión |
| **`DDL_EN_CALIENTE`** | **No medido.** Candidato al punto de postura que falla | §3 paso 0.c |
| **Postura** | `completa: false`, `faltan: 1` de **6** | `GET /api/health` |
| **`DEPLOY_PROFILE`** | **No** es `portal` (serían 7 puntos) | Deducido del recuento |
| **Variables nuevas que exige el código pendiente** | **Una:** `ROL_MIGRADOR`, por defecto `ecd_migrator`. En el estado objetivo **no hay que declararla** | `git diff` de `getenv` entre `origin/main` y `main` |

## Lo que el código pendiente exige y hoy no está

1. Los **31 objetos** de esquema. → Pasos 3 y 4.
2. Que la columna exista **antes** de arrancar. → §1.3: si falta, no degrada,
   revienta la petición.
3. Que `asegurar_columna` respete el congelado del DDL. → **B2**.
4. El portal reconstruido. → C5.

## Lo que hoy está y no debería

1. `ESQUEMA_ESTRICTO=false`. Es una válvula legítima —existe porque el 20-ago
   dos errores **míos** tumbaron dos despliegues sin un solo problema real en la
   base— pero **abierta permanentemente deja de ser una válvula y pasa a ser el
   estado**. Se cierra en el paso 7.
2. La aplicación sirviendo como `postgres`. Es **el** hallazgo de §1.

---

# 7 · QUÉ HARÍA FALTA PARA QUE ESTO DIGA `READY TO DEPLOY`

1. **§3 paso 0 ejecutado**, con sus cuatro resultados a la vista. Sin medir no
   hay puerta que valga.
2. **B2 corregido**: `@solo_con_ddl` sobre `asegurar_columna`, con la batería y
   la suite otra vez en verde. Un decorador — pero está congelado y no lo he
   tocado.
3. **B4**: una restauración completada de punta a punta, con su comparación de
   invariantes.
4. **Ventana de convergencia acordada**: es la única parte irreversible del
   plan y necesita la identidad administrativa de Cloud SQL, que no tengo y no
   debo tener.

Hechos 1–4, esta puerta se vuelve a mirar y el veredicto cambia. Los pasos 1–9
de §2.2 son entonces mecánicos, y cada uno tiene una comprobación que decide si
se sigue o se para.

---

# 8 · LÍMITES DE ESTE DOCUMENTO

Es una **auditoría de puerta**, no una certificación. No es ISO, no es de un
tercero, y no autoriza nada por sí misma.

- No he desplegado, no he cambiado ninguna cuenta, no he tocado producción.
- Todo lo marcado **«no medido»** lo está porque **no tengo las credenciales de
  producción, y no debo tenerlas**. No lo he estimado ni deducido: está señalado
  como lo que es, con la orden exacta que lo cierra.
- Lo marcado **«medido»** lleva al lado la salida real que lo demuestra.
- La adjudicación de §4 es una **recomendación**. La aprueba una persona.
- `frontend-react`, visor 3D/4D, LOB y AR: fuera de alcance, sin tocar.
