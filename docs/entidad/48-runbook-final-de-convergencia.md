# RUNBOOK FINAL DE CONVERGENCIA — `frontend-docs`

**Fecha:** 21 de agosto de 2026 · **Estado del código:** congelado, sin funcionalidad nueva.
**No se ha desplegado. No se ha tocado producción. No se ha tocado ninguna cuenta.**

---

# GATE

## `WAITING FOR PRODUCTION EVIDENCE`

No es `READY TO DEPLOY` y no es `NOT READY`. Los defectos de código están
cerrados; lo que falta son **hechos de producción que sólo se obtienen
midiendo**, y una restauración real.

| Evidencia pendiente | Quién |
|---|---|
| **E1** · Manifiesto/esquema: qué objetos faltan realmente | Tú · §PASO 0.a |
| **E2** · Roles, dueños y grants | Tú · §PASO 0.b |
| **E3** · Qué punto de postura falla (1 de 6) | Tú · §PASO 0.c |
| **E4** · Variables del servicio web en Render | Tú · §PASO 0.d |
| **E5** · `DATABASE RESTORABLE` demostrado | Tú · §PASO 2 |

Con las cinco entregadas, el gate se recalcula. Antes no.

---

# 1 · B2 — CORREGIDO Y DEMOSTRADO

`fc4eb57`. Se aplicó **el mecanismo que ya existe**, `@solo_con_ddl`. No se
inventó un segundo. No cambió ninguna funcionalidad.

## La demostración, en las dos direcciones

**A · `DDL_EN_CALIENTE=false` → no ejecuta.** Partiendo de una base **sin** la
columna:

```
ddl_permitido() = False
decorada        = True
devuelve        = None
columna en la base: 0        ← sigue sin existir
```

**B · `with permitir_ddl()` → el bootstrap sí puede.** Misma base, mismo
proceso, misma variable de entorno apagada:

```
[admin] project_users.es_admin verificada.
columna en la base: 1
índice parcial:     1
```

**C · La condición exacta de producción.** Bootstrap completo sobre un clúster
**virgen**, creado para esto y destruido después, con `DDL_EN_CALIENTE=false`
puesto en el entorno:

```
esquema construido en 38.0 s · 0 fallos
tablas 95/95 · columnas 872/872 · restricciones 510/510
índices 184/184 · funciones 24/24 · extensiones 2/2
es_admin: 1 · índice parcial: 1
```

La vía de migración no se ve afectada porque `construir()` corre dentro de
`with permitir_ddl()`. La vía de ejecución queda muda.

## El guardián que faltaba

Había dos, y ninguno cubría este caso:

| Guardián existente | Qué mira | Por qué no lo vio |
|---|---|---|
| `test_solo_con_ddl_solo_donde_hay_ddl` | funciones **con** decorador y **sin** DDL | es el caso contrario |
| `test_ningun_ddl_sin_guardia_en_camino_de_peticion` | DDL suelto en un **manejador HTTP** | `asegurar_columna` no es una ruta |

El hueco: **una función con DDL, llamada desde el arranque, que no es una ruta**.
Nuevo guardián `test_toda_rutina_del_arranque_respeta_el_interruptor`: toda
rutina de la lista de `_run_schema_setup` que contenga DDL tiene que llevar el
decorador.

**Y se comprobó quitando el decorador**, porque un control que se describe por
intención y no por comportamiento no controla nada:

```
E  AssertionError: estas rutinas se ejecutan en cada arranque, construyen
   esquema y NO llevan @solo_con_ddl: administracion_de_obra.py:asegurar_columna
1 failed
```

Restaurado: `1 passed`.

## Baterías

| | |
|---|---|
| Suite `backend/tests` | **887 pasan**, 1 omitida, 0 fallan |
| Batería completa (12 ensayos) | **449 / 449** |
| Bootstrap sobre clúster virgen, `ESQUEMA_ESTRICTO=true` | 0 fallos |

---

# 2 · TERMINOLOGÍA — LO QUE SE PUEDE AFIRMAR Y LO QUE NO

## `DATABASE RESTORABLE`

La copia de PostgreSQL se restaura sobre una base vacía y sus invariantes
coinciden. Es lo que este gate exige y lo que `ensayo_de_restauracion.py`
demuestra. **Sólo cubre la base.**

## `FULL ECD DISASTER RECOVERY`

Base **y** bytes. Hoy **no es alcanzable**, y no por descuido: es el hallazgo
**C7**, abierto desde la auditoría de agosto.

> El bucket de Google Cloud Storage **no tiene copia ni Object Versioning**.
> Los bytes de planos, fotos y modelos viven ahí, no en la base. La cabecera de
> `copia_de_seguridad.py` lo dice desde el primer día: la copia guarda la
> **ficha** de cada documento —nombre, versión, estado, idoneidad, quién y
> cuándo— **no el PDF**.

**No hay evidencia de recuperación del bucket.** No existe. Por tanto:

- ✅ Se puede afirmar: *«la base es restaurable, demostrado el <fecha>»*.
- ❌ **No** se puede afirmar: *«el ECD es recuperable end-to-end»*.
- 📌 **GCS backup / recovery = fuera de este gate**, y sigue siendo el pendiente
  más grave del proyecto. Se cierra en la consola de Google —Object Versioning
  + retención + copia fuera del proyecto—, no en este repositorio.

Una restauración de base sobre un bucket vaciado devuelve un expediente que
**sabe qué documentos hubo y no tiene ninguno**. Decir «restaurado» de eso sería
falsear la única prueba que importa el día que haga falta.

---

# 3 · CÓMO SE DEMUESTRA QUE EL RUNTIME USA `ecd_app`

Pediste la forma menos invasiva, sin exponer `current_user` ni crear un endpoint
permanente. Son **tres capas**, y ninguna toca el código.

## Capa 1 — Prueba por construcción (la más fuerte)

Después del cutover, el servicio web **sólo tiene la credencial de `ecd_app`**.
No puede conectarse como otra cosa porque no dispone de otra cosa. `db.py` lee
`DB_USER`/`DB_PASS` del entorno y **no tiene ningún valor por defecto**
—verificado en el código—, así que no hay fallback al que caer.

Y no cae en silencio. Medido:

| Escenario | `bootstrap_esquema.py --verificar` | Consecuencia |
|---|---|---|
| Credencial inválida | **código 1** | `yarn start` es `--verificar && gunicorn`: **gunicorn no arranca** |
| `DB_USER` ausente | **código 1** | ídem |

El despliegue **falla**; no vuelve a `postgres` ni se degrada.

## Capa 2 — La base de datos lo dice (la verificación efectiva)

No un auto-informe de la aplicación: el registro del propio PostgreSQL de sus
conexiones vivas. Con la identidad administrativa, **una vez**, durante la
ventana:

```sql
SELECT usename, client_addr, count(*) AS conexiones,
       min(backend_start) AS mas_antigua
  FROM pg_stat_activity
 WHERE datname = current_database() AND usename IS NOT NULL
 GROUP BY 1,2 ORDER BY 3 DESC;
```

**Esperado:** filas de `ecd_app` desde la IP de salida de Render, con al menos
**2** conexiones —el pool arranca con `Min:2`— y `backend_start` posterior al
reinicio. **Cero** filas de `postgres` o `ecd_migrator` desde esa IP.

Por qué esto y no otra cosa:

- Observa **el proceso web real**, no una conexión de CLI que demuestra
  únicamente que la credencial funciona.
- **Cero código, cero endpoints, cero exposición.** `pg_stat_activity` no es
  pública: pedirle `usename` de otras sesiones exige identidad privilegiada, que
  ya está en juego durante la ventana y sale de ella al terminar.
- Es la base la que declara quién está conectado. Un `current_user` devuelto por
  la aplicación sería el acusado dando fe de sí mismo.

## Capa 3 — Comportamiento (confirmación negativa, gratis)

Con la convergencia hecha, `ecd_app` no posee ninguna tabla. Si el proceso web
siguiera siendo `postgres`, seguiría pudiendo alterar el esquema. Con
`DDL_EN_CALIENTE=false` y `@solo_con_ddl` ya no lo intenta, así que **el log de
arranque no debe contener ni un `[schema] FALLO`** por permisos — y tampoco
ningún `ALTER` con éxito. Un log de arranque limpio, con `0 fallos`, es
coherente sólo con el estado objetivo.

## Descartado, y por qué

| Idea | Por qué no |
|---|---|
| Añadir `current_user` a `/api/health` | Público. Sería regalar el nombre del rol de base de datos |
| Añadirlo a `/api/seguridad/postura` | Endpoint permanente ampliado para una comprobación de una sola vez; y sigue siendo auto-informe |
| Endpoint de diagnóstico temporal | Código nuevo bajo congelación, para algo que la base ya responde |

---

# 4 · `postgres` NO QUEDA COMO FALLBACK

## Estado objetivo

```
ecd_migrator   dueño del esquema · DDL · migraciones
               NO lo usa ningún proceso permanente

ecd_app        runtime Flask permanente · DML
               sin ownership · sin CREATE/ALTER/DROP
               sin UPDATE/DELETE/TRUNCATE sobre activity_log ni auth_events

postgres       identidad administrativa EXCEPCIONAL
               NO runtime · fuera de las variables del servicio web
```

## Lo que garantiza que no hay vuelta silenciosa

1. **`db.py` no tiene valor por defecto** para `DB_USER` ni `DB_PASS`.
   Verificado en el código: `os.environ.get("DB_USER")`, sin segundo argumento.
2. **`yarn start` es una cadena `&&`.** Si `--verificar` no puede conectarse,
   sale con 1 y gunicorn no llega a ejecutarse. Medido en los dos escenarios de
   §3.
3. **La credencial del migrador no se declara nunca en el servicio web.** Es la
   regla de `ARRANQUE.md` y el motivo de que la convergencia use `SET ROLE` en
   vez de guardar la contraseña.
4. **La variable temporal `CONFIRMAR_CONVERGENCIA_PROPIEDAD` se borra** al
   terminar la ventana. Sin ella, la herramienta se niega a ejecutarse.

## Pendiente de higiene, no bloqueante

Cuatro guiones sueltos llevan `os.getenv('DB_USER', 'postgres')`:
`audit_inventory.py` · `migrate_inventory_schema.py` ·
`rollback_inventory_schema.py` · `temp_query_dups.py` (y `--usuario` en
`verificar_credencial_revocada.py`).

**No están en el camino de ejecución**: comprobado, no los importa nadie. Pero
son exactamente el patrón «si no me dices quién soy, soy `postgres`» que este
trabajo elimina. Después del cutover, retirar el valor por defecto y dejar que
fallen si no se les dice. **No incluido aquí**: el código está congelado y no es
un bloqueante del gate.

---

# 5 · CORRECCIONES AL ORDEN QUE YO MISMO PROPUSE

## C1 · La convergencia se ejecuta desde `main`, **no** como Start Command de Render

`ARRANQUE.md` propone `Start Command: yarn converge:ownership`. **Render
ejecutaría el commit desplegado** (`b671559`), y `converger_propiedad.py` llama
a `bootstrap.verificar()` con el manifiesto **de ese** commit — que todavía
exige `folder_permissions not null user_id`, constraint que el esquema actual ya
no tiene.

Resultado: `RuntimeError('el esquema sigue incompleto')` **después** de que la
transferencia de propiedad ya se haya confirmado. Recuperable reejecutando, pero
es una ventana rota a mitad y con el servicio caído.

Se ejecuta desde tu equipo, sobre el árbol en `main`. Al imprimir
`CONVERGENCIA DE PROPIEDAD COMPLETA` la herramienta levanta un servidor de salud
que no termina solo: **Ctrl-C ahí es lo correcto** —existe para que Render marque
verde, y en local no hace falta.

## C2 · La convergencia **ya hace** la migración y los grants

`converger()` encadena: convergencia SQL → invariantes → `SET ROLE ecd_migrator`
→ `construir()` → `verificar()` → `aplicar_grants_aplicacion()` → invariantes
otra vez → postcondición. No hay un paso de migración separado antes: **estaría
duplicado y correría con la identidad equivocada**.

Por eso los pasos «esquema» y «grants» de tu secuencia son **verificaciones**
del resultado de la convergencia, no acciones aparte.

## C3 · El backend nuevo se despliega **después** del esquema, nunca antes

Si el código nuevo sirve tráfico sin `project_users.es_admin`, la comprobación
de administración **envenena la transacción** de la petición —medido en §1.3 del
plan anterior: `current transaction is aborted`—. No es una degradación elegante:
es un 500. El esquema va primero, siempre.

## C4 · `ESQUEMA_ESTRICTO=true` va al final

El manifiesto del commit desplegado exige una constraint que el esquema ya no
tiene. Activarlo antes de desplegar el código nuevo tumba el servicio con una
variable.

---

# 6 · RUNBOOK

> **Contraseñas: siempre tecleadas.** Nunca pegadas en un chat, nunca por
> argumento de línea de órdenes —queda en el historial y en la lista de
> procesos—, nunca en un fichero del repositorio.
>
> **Ventana de mantenimiento:** los pasos 5 a 12 son una sola ventana. Los pasos
> 0 a 4 se pueden hacer antes, sin cortar el servicio.

---

## PASO 0 · MEDIR — las cuatro lecturas

**IDENTIDAD:** tú, con la credencial administrativa de Cloud SQL y acceso al
panel de Render. **Sólo lectura.**

### 0.a · Manifiesto y esquema

| | |
|---|---|
| **PRECONDICIÓN** | Árbol local en `main` (`fc4eb57`). Acceso a Cloud SQL |
| **ACCIÓN** | `cd backend && ESQUEMA_ESTRICTO=true python bootstrap_esquema.py --verificar` |
| **RESULTADO ESPERADO** | Lista de objetos faltantes, o `código 0` si ya está completo. Sólo lee el catálogo |
| **STOP SI…** | No conecta. Sin esta lectura no se sigue: el resto del plan depende de qué hay realmente |

### 0.b · Roles, dueños, grants

| | |
|---|---|
| **PRECONDICIÓN** | Sesión `psql` contra la base de producción |
| **ACCIÓN** | Las cinco consultas de `47-plan-de-convergencia-y-despliegue.md` §3.0.b |
| **RESULTADO ESPERADO** | Hoy: probablemente sólo `postgres`; todo de su propiedad. **Anótalo tal cual salga** |
| **STOP SI…** | Aparecen tablas de `ecd_app`: hubo DDL en caliente y la convergencia tendrá más trabajo — no es motivo de parar, sí de saberlo antes |

### 0.c · Postura

| | |
|---|---|
| **PRECONDICIÓN** | Sesión de Entity Admin en el servicio |
| **ACCIÓN** | `GET /api/seguridad/postura` |
| **RESULTADO ESPERADO** | Qué punto de los 6 falla. El latido dice `faltan: 1` y **no dice cuál, a propósito** |
| **STOP SI…** | El que falla es `DDL_EN_CALIENTE_APAGADO`: entonces hoy la aplicación **sí** altera su esquema en producción y corre como `postgres`, o sea que **lo consigue**. Cambia B2 de latente a activo y hay que apagarlo en el PASO 4 antes que nada |

### 0.d · Variables del servicio web

| | |
|---|---|
| **PRECONDICIÓN** | Panel de Render |
| **ACCIÓN** | Anotar, sin copiar valores a ningún sitio: `DB_USER` · `DDL_EN_CALIENTE` · `ESQUEMA_ESTRICTO` · `ENFORCE_PROJECT_AUTHZ` · `AUTH_POLICY_MODE` · `DEPLOY_PROFILE` · `CORS_ORIGINS` · `APP_URL` |
| **RESULTADO ESPERADO** | Confirmar `DB_USER=postgres` y `ESQUEMA_ESTRICTO=false` |
| **STOP SI…** | `CORS_ORIGINS` contiene algo que no es una URL. Ya pasó el 20-ago: llevaba pegadas tres filas de una tabla de la guía |

---

## PASO 1 · COPIA DE SEGURIDAD DE POSTGRESQL

| | |
|---|---|
| **IDENTIDAD** | Credencial de lectura de PostgreSQL |
| **PRECONDICIÓN** | PASO 0 entregado. Destino **fuera** del proyecto de Google |
| **ACCIÓN** | `python backend/copia_de_seguridad.py --destino <ruta fuera de GCP>` |
| **RESULTADO ESPERADO** | Fichero de copia + su comprobación. La cabecera del guion recuerda lo que **no** cubre |
| **STOP SI…** | El destino está en el mismo proyecto de Google que la base. Ya pasó una vez: la facturación en mora dejó el almacenamiento inaccesible, y una copia ahí dentro no habría servido |

---

## PASO 2 · RESTAURACIÓN REAL — `DATABASE RESTORABLE`

| | |
|---|---|
| **IDENTIDAD** | Un rol con `CREATEDB`. Ni `ecd_app` ni `ecd_migrator` lo tienen, **a propósito** |
| **PRECONDICIÓN** | La copia del PASO 1. Tiempo: no es automatizable |
| **ACCIÓN** | `python backend/herramientas/ensayo_de_restauracion.py` — contraseña **tecleada** con `getpass` |
| **RESULTADO ESPERADO** | Base vacía → bootstrap → carga → **comparación de invariantes**: `file_nodes`, `file_versions`, SHA-256, `activity_log`, `auth_events` y los alcances históricos, idénticos |
| **STOP SI…** | Cualquier invariante difiere. Y **si el guion no llega a ejecutarse, el gate no avanza**: una copia que nunca se ha restaurado es una intención, no una copia |
| **NO AFIRMAR** | «ECD recuperable». Esto es `DATABASE RESTORABLE`. Los bytes de GCS no están dentro (§2) |

---

## PASO 3 · `DDL_EN_CALIENTE=false` *(si 0.c dice que falta)*

| | |
|---|---|
| **IDENTIDAD** | Panel de Render |
| **PRECONDICIÓN** | Medido en 0.c |
| **ACCIÓN** | Poner `DDL_EN_CALIENTE=false` en el servicio web. Reiniciar |
| **RESULTADO ESPERADO** | `/api/health` → `faltan` baja en 1 |
| **STOP SI…** | El servicio no vuelve. Devolver la variable y mirar el log: significaría que algo del arranque dependía de crear esquema en caliente, y eso hay que entenderlo antes de seguir |

---

## PASO 4 · ESQUEMA COMPLETO ANTES DE NADA MÁS

Este paso lo absorbe el PASO 6 si la convergencia se hace en la misma ventana.
Se deja explícito porque **es la precondición de C3**: ningún código nuevo sirve
tráfico sin `es_admin`.

| | |
|---|---|
| **IDENTIDAD** | La que hoy posee el esquema. Hoy: `postgres` — **último uso legítimo de esa identidad para DDL** |
| **PRECONDICIÓN** | PASO 2 superado. Árbol en `main` |
| **ACCIÓN** | Nada, si el PASO 6 va en esta misma ventana. Si se separan: `ROL_MIGRADOR=postgres python bootstrap_esquema.py` desde `main` |
| **RESULTADO ESPERADO** | `872 de 872` columnas, `es_admin` incluida |
| **STOP SI…** | Quedan objetos faltantes tras construir |

---

## PASO 5 · CREACIÓN DE LOS ROLES

| | |
|---|---|
| **IDENTIDAD** | **Administrativa de Cloud SQL** (`postgres`) |
| **PRECONDICIÓN** | 0.b confirma que `ecd_app` y `ecd_migrator` no existen. Dos contraseñas fuertes, generadas por ti, listas para **teclear** |
| **ACCIÓN** | `psql "$CONEXION" -v app_pw=… -v mig_pw=… -f backend/sql/00_roles.sql`, con las contraseñas leídas por `read -s`, nunca en la orden |
| **RESULTADO ESPERADO** | `SELECT rolname FROM pg_roles` muestra los tres. Ninguno superusuario. Ninguno con `CREATEDB` |
| **STOP SI…** | Alguna contraseña ha pasado por el chat, por un fichero del repositorio o por un argumento. Se rota y se repite |

---

## PASO 6 · CONVERGENCIA DE PROPIEDAD *(una sola vez en la vida de la instancia)*

**Es el único paso irreversible del runbook.**

| | |
|---|---|
| **IDENTIDAD** | `postgres` — la herramienta exige `session_user = current_user = postgres` y se niega si no |
| **PRECONDICIÓN** | PASOS 1, 2 y 5 hechos. Árbol local en `main` (**no** como Start Command de Render: C1). `CONFIRMAR_CONVERGENCIA_PROPIEDAD=SI_UNA_VEZ` en el entorno local. Contraseña de `postgres` tecleada |
| **ACCIÓN** | `cd backend && python herramientas/converger_propiedad.py` |
| **RESULTADO ESPERADO** | `CONVERGENCIA DE PROPIEDAD COMPLETA` · `objetos de ecd_app: 0` · `rutinas de ecd_app: 0` · `CREATE de ecd_app: no` · `esquema obligatorio: COMPLETO` · y las invariantes idénticas **dos veces**: tras la transferencia y tras la migración. Después levanta un servidor de salud: **Ctrl-C** |
| **STOP SI…** | Cualquier invariante cambia — la herramienta aborta sola y hay que entender por qué **antes** de tocar nada más. O si falla la postcondición: quedan objetos de `ecd_app`, o conserva `CREATE` |
| **DESPUÉS** | Borrar `CONFIRMAR_CONVERGENCIA_PROPIEDAD` del entorno |

Lo que hace por dentro, en orden: transferir propiedad de **todos** los objetos
de `ecd_app` en `public` y `ai_brain` → tomar invariantes → `SET ROLE
ecd_migrator` → `construir()` (con `permitir_ddl()`, así que **`es_admin` se
crea aquí**) → `verificar()` → `aplicar_grants_aplicacion()` → invariantes otra
vez → postcondición. **No cambia ni borra una fila de datos.**

---

## PASO 7 · GRANTS — VERIFICACIÓN

| | |
|---|---|
| **IDENTIDAD** | `psql` con identidad administrativa |
| **PRECONDICIÓN** | PASO 6 con banner de éxito |
| **ACCIÓN** | `SELECT has_schema_privilege('ecd_app','public','CREATE');`<br>`SELECT has_table_privilege('ecd_app','activity_log','UPDATE');`<br>`SELECT tableowner, count(*) FROM pg_tables WHERE schemaname IN ('public','ai_brain') GROUP BY 1;` |
| **RESULTADO ESPERADO** | `false` · `false` · **todo** de `ecd_migrator`, cero de `ecd_app`, cero de `postgres` |
| **STOP SI…** | `CREATE` es `true`, o `activity_log` acepta `UPDATE` de `ecd_app`: la auditoría dejaría de ser append-only a nivel de privilegio |

---

## PASO 8 · VERIFICACIÓN MANUAL DE `ecd_app` *(antes del cutover)*

| | |
|---|---|
| **IDENTIDAD** | `ecd_app`, contraseña tecleada, desde tu equipo |
| **PRECONDICIÓN** | PASO 7 verde |
| **ACCIÓN** | (1) `DB_USER=ecd_app ESQUEMA_ESTRICTO=true python bootstrap_esquema.py --verificar`<br>(2) Como `ecd_app`, en `psql`: `ALTER TABLE project_users ADD COLUMN zz_probe boolean;` |
| **RESULTADO ESPERADO** | (1) **código 0**, `872 de 872` — demostrado en ensayo: `ecd_app` verifica el esquema completo sin un solo privilegio de DDL.<br>(2) **`ERROR: debe ser dueño de la tabla project_users`** |
| **STOP SI…** | (1) falla → el runtime no arrancará. (2) **tiene éxito** → la convergencia no terminó y **no se hace el cutover**: se estaría poniendo en producción una identidad que sigue siendo dueña |

---

## PASO 9 · CUTOVER — `DB_USER = ecd_app` 🔒

**Es el gate de este runbook.** Hasta aquí, `ecd_app` es una credencial que
funciona. A partir de aquí, es **el runtime**.

| | |
|---|---|
| **IDENTIDAD** | Panel de Render |
| **PRECONDICIÓN** | PASO 8 con sus dos resultados, incluido el `ERROR` esperado |
| **ACCIÓN** | En el servicio web: `DB_USER = ecd_app` · `DB_PASS` = credencial de `ecd_app`.<br>**Eliminar** cualquier variable con credencial de `postgres` o de `ecd_migrator`.<br>**Eliminar** `CONFIRMAR_CONVERGENCIA_PROPIEDAD` si sigue ahí |
| **RESULTADO ESPERADO** | El servicio web queda con **una sola** credencial de base de datos, la de `ecd_app` |
| **STOP SI…** | Queda cualquier credencial administrativa en las variables del servicio. Mientras esté, no hay separación: hay una aplicación que **puede** volver a ser dueña |

---

## PASO 10 · RESTAURAR EL ARRANQUE Y ARRANCAR

| | |
|---|---|
| **IDENTIDAD** | Panel de Render |
| **PRECONDICIÓN** | PASO 9 |
| **ACCIÓN** | Start Command = `yarn start`. Desplegar |
| **RESULTADO ESPERADO** | `bootstrap_esquema.py --verificar` sale 0 **como `ecd_app`** y entonces arranca gunicorn. `GET /api/health` → 200. Log de arranque: `[schema] arranque completado … 0 fallos` |
| **STOP SI…** | No arranca. **No devolver `DB_USER` a `postgres`**: eso sería exactamente el fallback silencioso que este trabajo elimina. Leer el log — la cadena `&&` ya dice que el problema es la conexión o el esquema, no el código |

---

## PASO 11 · DEMOSTRAR QUE EL PROCESO WEB ESTÁ CONECTADO COMO `ecd_app` 🔍

| | |
|---|---|
| **IDENTIDAD** | Administrativa de Cloud SQL, **una vez**, y fuera al terminar |
| **PRECONDICIÓN** | PASO 10, servicio en pie y habiendo atendido al menos una petición |
| **ACCIÓN** | La consulta de `pg_stat_activity` de §3, Capa 2 |
| **RESULTADO ESPERADO** | ≥ 2 conexiones de **`ecd_app`** desde la IP de salida de Render (el pool arranca con `Min:2`), `backend_start` posterior al reinicio, y **cero** de `postgres` o `ecd_migrator` desde esa IP |
| **STOP SI…** | Aparece `postgres` conectado desde la IP del servicio. Significa que el cutover no se aplicó o que algo conserva la credencial vieja |
| **NOTA** | No basta una conexión de CLI de `ecd_app`: eso prueba que la credencial sirve, no que **el runtime la use**. Esta consulta observa el proceso real, y la responde la base — no la aplicación sobre sí misma |

---

## PASO 12 · DESPLEGAR EL BACKEND NUEVO

| | |
|---|---|
| **IDENTIDAD** | `git push` + Render |
| **PRECONDICIÓN** | PASO 11 verde. `ESQUEMA_ESTRICTO` **sigue en `false`** |
| **ACCIÓN** | `git push origin main` (18 commits, de `6f67472` a `fc4eb57`) |
| **RESULTADO ESPERADO** | `GET /api/health` → `version` = el commit nuevo |
| **STOP SI…** | `version` no cambia: el despliegue no entró. El latido existe precisamente para no tener que creerse el panel |

---

## PASO 13 · `ESQUEMA_ESTRICTO=true`

| | |
|---|---|
| **IDENTIDAD** | Panel de Render |
| **PRECONDICIÓN** | PASO 12 sirviendo el commit nuevo |
| **ACCIÓN** | `ESQUEMA_ESTRICTO=true`. Reiniciar |
| **RESULTADO ESPERADO** | Arranca. **Que arranque es la prueba**: `--verificar` comparó el manifiesto nuevo contra la base y salió 0 |
| **STOP SI…** | No arranca. Devolver a `false` —el servicio vuelve— y leer qué objetos nombra. La válvula existe porque el 20-ago dos errores míos tumbaron dos despliegues sin un solo problema real; lo que no puede es quedarse abierta para siempre |

---

## PASO 14 · PORTAL

| | |
|---|---|
| **IDENTIDAD** | Render, Static Site |
| **PRECONDICIÓN** | PASO 13 |
| **ACCIÓN** | Desplegar `frontend-docs` (root `frontend-docs`, build `npm install && npm run build`, publish `dist`, `VITE_BACKEND_URL` = URL del backend) |
| **RESULTADO ESPERADO** | El portal llama a `/api/projects/<id>/mi-administracion` y la columna «Administra esta obra» aparece en Participantes |
| **STOP SI…** | El build falla. Sin este paso nada se rompe —el servidor bloquea igual— pero la interfaz seguiría ofreciendo botones que devuelven 403 |

---

## PASO 15 · SMOKE TESTS

| | |
|---|---|
| **IDENTIDAD** | Dos usuarios reales de **obras distintas** |
| **PRECONDICIÓN** | PASOS 13 y 14 |
| **ACCIÓN** | `herramientas/verificar_produccion.py` con las credenciales por **entorno**, nunca por argumento. Más la tabla de abajo |
| **RESULTADO ESPERADO** | Ver tabla |
| **STOP SI…** | Un 200 donde tocaba 403 — **o un 403 donde tocaba 200**: un control que bloquea al legítimo tampoco se puede desplegar |

| Comprobación | Esperado |
|---|---|
| `/api/health` sin credenciales | 200, `version` = commit nuevo |
| `/api/seguridad/postura` con Entity Admin | anotar qué punto falla ahora |
| Sin el segundo usuario | la mitad que demuestra el aislamiento **se salta y lo dice**. No cuenta como aprobada |
| Participantes → «Administra esta obra» | visible; nombrar y retirar → 200 |
| Retirar al único administrador, sin ser Entity Admin | **409 `ULTIMO_ADMIN_DE_OBRA`** |
| Miembro corriente pulsa administración | **403**, y la interfaz ya no se lo ofrecía |
| Transmittal: registrar recepción sin `destinatario_id` | **400 `FALTA_DESTINATARIO`** |
| Transmittal: con destinatario válido | 200, `ADMIN_RECORDED_RECEIPT`, y el encargo **del destinatario** desaparece de su bandeja |
| Un RFI y un Red Line existentes | se abren; ningún histórico cambió |

---

## PASO 16 · ADJUDICACIÓN DE ADMINS

**No es un despliegue. Es una decisión, y la toma una persona.**

| | |
|---|---|
| **IDENTIDAD** | Entity Admin, desde la interfaz |
| **PRECONDICIÓN** | PASO 15 verde. La columna existe y nace `FALSE` para todos |
| **ACCIÓN** | Ejecutar la consulta de inventario **sobre producción** (`47-…` §4). Clasificar cuenta por cuenta: `ENTITY ADMIN` · `PROJECT ADMIN` · `CUENTA TÉCNICA SIN ADMIN DE APP` |
| **RESULTADO ESPERADO** | Una lista aprobada por ti, no inferida |
| **STOP SI…** | Se va a bajar el rol de alguien **antes** de darle la membresía o la administración de obra que necesita: se queda sin acceso. **Primero lo que gana, después lo que pierde** |

### Lo medido en `ecd_dr12d` — **no es producción**

| Cuenta | Obras | Actividad | Recomendación |
|---|---|---|---|
| id 2 · Yaser Omar | `PQT8 Talara (PRUEBAS)`, **no** `PQT8_TALARA` | 0 | **ENTITY ADMIN** |
| id 21 · Administradora Municipal | ninguna | 7 | **ENTITY ADMIN** |
| id 30 · **Medicion Infra** `@local.test` | **ninguna** | **75** | **CUENTA TÉCNICA SIN ADMIN DE APP** |

`Medicion Infra` es el caso que esta separación existe para encontrar: técnica,
activa, con autoridad sobre la instancia entera y participando en cero obras. Si
mide contra la base, no necesita **ningún** rol de aplicación (§5 del plan
anterior lo demuestra tarea por tarea). Si mide contra la API, necesita ser
miembro de las obras que mide, con permiso mínimo, y `role='user'`.

---

# 7 · RESUMEN DE IDENTIDADES POR PASO

| Paso | Identidad | Reversible |
|---|---|---|
| 0 · medir | lectura + panel | — (sólo lee) |
| 1 · copia | lectura PostgreSQL | sí |
| 2 · restauración | rol con `CREATEDB` (tecleada) | sí (base desechable) |
| 3 · `DDL_EN_CALIENTE` | panel | sí |
| 4 · esquema | dueño actual (`postgres`) — **último DDL con esa identidad** | sí (idempotente) |
| 5 · roles | **administrativa** | sí (`DROP ROLE`) |
| 6 · convergencia | **administrativa** → `SET ROLE ecd_migrator` | **NO** |
| 7 · grants | administrativa (verificación) | — |
| 8 · verificar `ecd_app` | `ecd_app` | — |
| 9 · **cutover** | panel | sí (pero no volviendo a `postgres`) |
| 10 · arranque | `ecd_app` | sí |
| 11 · demostración | administrativa, una vez | — |
| 12 · backend | git + Render | sí |
| 13 · estricto | panel | sí |
| 14 · portal | Render | sí |
| 15 · smoke | dos usuarios reales | — |
| 16 · adjudicación | Entity Admin | sí |

---

# 8 · LÍMITES

- **No se ha desplegado, no se ha tocado producción, no se ha tocado ninguna
  cuenta, no se ha tocado `frontend-react`.**
- Lo marcado «no medido» lo está porque **no tengo las credenciales de
  producción, y no debo tenerlas**. No lo he estimado: está señalado con la
  orden exacta que lo cierra.
- Lo marcado «demostrado» lleva al lado la salida real.
- Este runbook **no es una certificación** — ni ISO, ni de tercero.
- `FULL ECD DISASTER RECOVERY` **no** se afirma ni se afirmará mientras C7 siga
  abierto. El bucket sigue sin copia ni versionado, y eso se cierra en la
  consola de Google, no aquí.
