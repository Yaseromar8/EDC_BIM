# AUDITORÍA DE LA CONVERGENCIA CODEX

**21-ago-2026** · Sobre `b671559`
**Solo lectura.** No se ha modificado código, ni Render, ni ninguna base de datos.

---

# Veredicto

# REQUIERE CAMBIOS

Dos defectos bloqueantes, uno de premisa y cinco menores. **Ninguno es peligroso
para los datos** —el diseño transaccional es correcto y ya demostró serlo al
fallar en Render sin dejar nada a medias— pero tal como está **volvería a fallar,
y por un motivo distinto del de la primera vez.**

---

## 1 · Qué pretende hacer cada fichero

| fichero | origen | qué hace |
|---|---|---|
| `sql/00_roles.sql` | 13-ago (previo) | Crea `ecd_app` y `ecd_migrator`. Contraseñas por variable de psql, nunca en el fichero. `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`. Concede la pertenencia a quien ejecuta y `CONNECT` sobre la base |
| `sql/01_ownership_ida.sql` | 13-ago | **Lista fija**: pasa la propiedad `postgres → ecd_migrator` |
| `sql/02_ownership_vuelta.sql` | 13-ago | **Lista fija** (90 líneas): la devuelve a `postgres` |
| `sql/03_grants_ida.sql` | Codex (+2) | Quita `CREATE` a `PUBLIC` y a `ecd_app`; le da datos (SELECT/INSERT/UPDATE/DELETE), secuencias, `EXECUTE` sobre `resolve_folder_path`, y privilegios por defecto para objetos futuros |
| `sql/04_grants_vuelta.sql` | Codex (+5) | Inverso de `03`. No borra roles, a propósito |
| `sql/05_convergencia_propiedad.sql` | **Codex, nuevo** | **La pieza central**: transfiere a `ecd_migrator` *todo* lo que `ecd_app` posea en `public` y `ai_brain` — **por propietario, no por nombre** —, revoca `CREATE`, y se autoverifica dentro de la transacción |
| `herramientas/converger_propiedad.py` | **Codex, nuevo** | Orquesta: exige identidad administrativa → invariantes antes → `05` → invariantes → `SET ROLE ecd_migrator` → bootstrap → verificar → grants → invariantes → postcondiciones → servidor de salud |
| `herramientas/auditar_identidades_db.py` | **Codex, nuevo** | Auditoría de solo lectura de roles, propiedad y privilegios |
| `bootstrap_esquema.py` | Codex (+57) | `exigir_identidad_migrador()` y `aplicar_grants_aplicacion()` |
| `package.json` | Codex | `yarn start` = `--verificar && gunicorn`; nuevos guiones `migrate`, `converge:ownership`, `verify:schema`, `test:postgres`, `test:authz` |

---

## 2 · Qué está correcto — y hay bastante

1. **`05` es dinámico, no una lista.** Es exactamente el arreglo correcto al
   problema que describe: el DDL en caliente creó tablas después de la foto del
   12-ago, y una lista fija no las alcanzaría. Transfiere por
   `pg_get_userbyid(relowner)='ecd_app'`, y cubre tablas, vistas, materializadas,
   foráneas, secuencias sueltas, funciones, procedimientos y agregados.

2. **Transacción única con autoverificación dentro.** El bloque final cuenta
   objetos y rutinas que sigan siendo de `ecd_app` y comprueba que no le quede
   `CREATE`; si algo sobrevive, `RAISE EXCEPTION` **antes del `COMMIT`** y todo
   se deshace. **No puede quedar a medias.** Eso ya se demostró en Render: falló
   y no transfirió nada.

3. **`lock_timeout = '5s'`.** No se queda colgado detrás de otra transacción —
   que es como un mantenimiento se convierte en una caída.

4. **Invariantes antes y después**, comparadas y con excepción si algo cambió.
   La misma disciplina del resto del proyecto.

5. **La contraseña del migrador nunca se guarda en Render.** Esto es lo mejor de
   todo el trabajo: `PGOPTIONS='-c role=ecd_migrator'` hace que PostgreSQL
   ejecute con `current_user = ecd_migrator` autenticando como el administrador.
   Los objetos nacen con el propietario correcto **sin meter una segunda
   credencial permanente en la configuración del servicio**. Es elegante y es
   seguro.

6. **`exigir_identidad_migrador()` comprueba lo que PostgreSQL autenticó**, no lo
   que dice la variable de entorno. Es comprobar comportamiento y no intención —
   el instinto correcto.

7. **`yarn start` fail-closed.** Si al esquema le falta algo, el servicio no
   arranca. Es la razón de que el despliegue fallido **no sustituyera** al sano.

8. **`aplicar_grants_aplicacion()` se niega** si el `.sql` contiene órdenes
   exclusivas de psql. Defensa pequeña y bien puesta.

---

## 3 · Qué está mal

### 🔴 W1 · BLOQUEANTE — `05` da por hecho que existe `ai_brain`, y su propio orden garantiza que no exista

La cabecera de `05` dice, textualmente, que se ejecuta *«DESPUES de 00_roles.sql
y ANTES del primer bootstrap como ecd_migrator»*.

Pero el esquema `ai_brain` **lo crea el bootstrap** (`db.py:701`,
`CREATE SCHEMA IF NOT EXISTS ai_brain`).

Y `05` lo referencia **sin comprobar que exista**, cuatro veces:

```
línea 34   ALTER SCHEMA ai_brain OWNER TO ecd_migrator;
línea 87   REVOKE CREATE ON SCHEMA public, ai_brain FROM PUBLIC;
línea 88   REVOKE CREATE ON SCHEMA public, ai_brain FROM ecd_app;
final      has_schema_privilege('ecd_app','ai_brain','CREATE')
```

**Sobre una base que nunca ha ejecutado este bootstrap, la transacción aborta en
la línea 34.** Es decir: en cuanto se creen los roles y se vuelva a intentar,
`05` fallará otra vez — por un motivo nuevo y con un mensaje igual de opaco.

`03_grants_ida.sql` tiene la misma referencia incondicional (líneas 14-19 y
42-46), pero ahí **no muerde**, porque en el flujo de la herramienta se ejecuta
*después* del bootstrap.

**Arreglo:** o `05` guarda `ai_brain` tras un `IF EXISTS`, o se ejecuta después
del bootstrap. Lo segundo cambia el orden declarado; lo primero es tres líneas.

### 🔴 W2 · BLOQUEANTE (de diagnóstico) — el guardia amable de `05` es inalcanzable

```
línea 19   GRANT ecd_app, ecd_migrator TO CURRENT_USER WITH SET TRUE;
línea 25       RAISE EXCEPTION 'Faltan ecd_app/ecd_migrator; ejecuta antes 00_roles.sql';
```

El `GRANT` va **antes** de la comprobación que existe para explicarlo. Si los
roles no están, revienta en la 19 y la 25 nunca se ejecuta.

**Está demostrado:** en Render el operador recibió `role "ecd_app" does not
exist` en vez de la instrucción que el propio guion tenía escrita.

No es cosmético. Un mensaje que dice *qué hacer* frente a uno que dice *qué falló*
es la diferencia entre resolverlo en un minuto y abrir una investigación.

**Arreglo:** subir el bloque `DO` por encima del `GRANT`. Dos líneas movidas.

### 🟠 W3 · DE PREMISA — `05` está escrito para una base que no es la de Render

Su propósito declarado es *«sacar del proceso web la propiedad que adquirió
cuando el DDL se ejecutaba en caliente»*. Eso describe la base heredada
(`ecd_dr12d`), donde `ecd_app` posee 20 objetos.

**En el clúster de Render el rol `ecd_app` no existe.** Por tanto no hay ni un
objeto que sacarle. Allí `05` no convergería nada: su único efecto real sería
cambiar el propietario de `public` y revocar `CREATE`.

Lo que la base de Render necesita —si resulta ser la buena— **no es
convergencia: es alta inicial**. Roles, bootstrap y grants. `00` + bootstrap +
`03`, sin `05`.

**La herramienta está bien construida para el problema equivocado.** Y ésa es la
razón exacta por la que el inventario de solo lectura (fase B) tiene que ir
antes.

### 🟡 W4 · El rollback no es simétrico con `05`

`02_ownership_vuelta.sql` es una **lista fija de 90 objetos** congelada el
12-ago. `05` transfiere **dinámicamente**, incluidos los objetos creados
después — que es precisamente su motivo de existir.

Consecuencia: tras un «rollback completo», todo objeto nacido después del 12-ago
**se queda perteneciendo a `ecd_migrator`**. La cabecera de `04` promete
*«inverso exacto»*: lo es de `03`, pero **no existe ningún inverso de `05`**.

No pone datos en riesgo —la propiedad no impide el DML de un rol con permisos—
pero la reversibilidad prometida no es la real, y eso se descubriría en el peor
momento.

### 🟡 W5 · `ALTER SCHEMA public OWNER TO ecd_migrator` es más de lo necesario

Para construir el esquema, `ecd_migrator` necesita `CREATE ON SCHEMA public`, no
ser su **dueño**. Desde PostgreSQL 15 `public` pertenece a `pg_database_owner`;
reasignarlo es un cambio más profundo y visible para el proveedor, y viaja en
copias y restauraciones.

No está mal, pero excede el objetivo, y es del tipo de cosa que sorprende cuando
se restaura una copia en otro sitio.

### 🟡 W6 · `_identidad_administrativa()` exige literalmente `postgres`

```python
if sesion != 'postgres' or actual != 'postgres':
```

Hoy coincide con Render (`DB_USER=postgres`). Pero es un nombre de rol escrito a
mano: con un proveedor cuyo administrador se llame de otro modo, la herramienta
rechaza una identidad que sí es administrativa, y el mensaje no ayuda.

### 🟡 W7 · Vaciar `DB_PASS` y `DB_USER` al final es cosmético

```python
os.environ.pop('DB_PASS', None)
os.environ.pop('DB_USER', None)
```

El proceso ya las usó, y borrarlas de su propio entorno **no las quita de la
configuración de Render**. No hace daño, pero el docstring sugiere una propiedad
de seguridad que no existe. No debe presentarse como un control.

### 🟡 W8 · El servidor de salud falso es una trampa operativa

`converger_propiedad.py` termina levantando un `ThreadingHTTPServer` que
responde `{"status":"ok"}` a todo, para que Render marque el despliegue verde.
Funciona, y la convergencia está protegida por `CONFIRMAR_CONVERGENCIA_PROPIEDAD`,
así que un reinicio del contenedor repite una operación idempotente. Aceptable.

Pero mientras ese Start Command esté activo, **el servicio no es la aplicación**:
el portal está caído mientras el panel lo enseña en verde. Si alguien olvida
restaurar `yarn start`, nadie se entera por el panel.

Codex lo restauró. Debe quedar como paso **comprobado**, no confiado.

### 🟢 W9 · `BEGIN`/`COMMIT` embebidos dentro de la transacción de psycopg2

`cur.execute()` ya abre transacción; el `BEGIN` del fichero emite un aviso y el
`COMMIT` del fichero es el que confirma, dejando el `conn.commit()` posterior
como no-op. Funciona, pero la intención queda confusa.

---

## 4 · Supuestos no demostrados

| # | supuesto | estado |
|---|---|---|
| U1 | La base `postgres` de Render **es** el expediente real de PQT8 Talara | **Sin demostrar.** Es la fase B |
| U2 | `ai_brain` existe en el destino | **Falso** en una base sin bootstrar. Ver W1 |
| U3 | `ecd_app` posee objetos en el destino | **Falso** en Render: el rol no existe. Ver W3 |
| U4 | El administrador se llama `postgres` | Cierto hoy en Render; escrito a mano. Ver W6 |
| U5 | Las listas fijas del 12-ago describen los objetos | **Falso por construcción** — es el motivo de `05`. Ver W4 |
| U6 | Existe una copia de seguridad reciente y restaurable del destino | **Sin demostrar, y en ningún sitio del procedimiento se pide** |

---

## 5 · Riesgos

| riesgo | gravedad | por qué |
|---|---|---|
| **Desplegar `b671559` sin converger deja el servicio sin arrancar** | **Alto** | `yarn start` verifica primero y Render no tiene `ESQUEMA_ESTRICTO`, cuyo defecto es `true`. Faltaban 21 objetos. Hoy lo contiene Auto-Deploy = Off |
| **`05` vuelve a fallar tras crear los roles** | **Alto** | W1: `ai_brain` no existe |
| Converger la base equivocada | **Alto** | W3 + U1 |
| Rollback incompleto de propiedad | Medio | W4 |
| Quedarse con el servidor de salud puesto | Medio | W8: caído en verde |
| Cambiar el dueño de `public` sin necesitarlo | Bajo | W5 |
| **No hay copia previa exigida en el procedimiento** | **Alto** | U6. Es la red que falta |

---

## 6 · Orden correcto, si hubiera que ejecutarlo

**Precondición absoluta:** copia de seguridad fresca del destino **y ensayo de
restauración** (`copia_de_seguridad.py` + `ensayo_de_restauracion.py` ya existen).
Sin eso, no se toca la propiedad de una base con datos reales.

```
0.  Inventario de SOLO LECTURA del destino  ......... fase B
    ¿es el expediente real? ¿qué esquema tiene? ¿quién posee qué?

1.  Copia de seguridad + ensayo de restauración

2.  Arreglar W1 y W2 en 05_convergencia_propiedad.sql

3.  00_roles.sql   con la identidad administrativa
    contraseñas tecleadas, nunca por chat

    ── A PARTIR DE AQUÍ, DOS CAMINOS SEGÚN LO QUE DIGA EL PASO 0 ──

    Si el destino YA fue usado por la aplicación (ecd_app posee objetos):
      4a. 05_convergencia_propiedad.sql
      5a. bootstrap como ecd_migrator
      6a. 03_grants_ida.sql

    Si el destino NUNCA fue bootstrado (es el caso probable de Render):
      4b. SALTAR 05 -- no hay nada que converger
      5b. bootstrap como ecd_migrator   (crea ai_brain)
      6b. 03_grants_ida.sql
      7b. 05 AHORA, si se quiere el cierre de CREATE y la comprobación

7.  bootstrap_esquema.py --verificar  →  0 objetos faltantes

8.  Demostrar sobre el destino:
      ecd_app: 0 objetos, 0 rutinas, CREATE = false en los dos schemas
      conexión real como ecd_app

9.  Ensayos contra PostgreSQL:
      ensayo_de_revisiones · ensayo_de_segunda_obra · conciliar_encargos (seco)

10. Solo con todo verde: cambiar DB_USER a ecd_app, ESQUEMA_ESTRICTO=true,
    DDL_EN_CALIENTE=false, ENFORCE_PROJECT_AUTHZ=true, y desplegar a mano
```

**Auto-Deploy permanece en `Off` durante todo el procedimiento.**

---

## 7 · Condiciones de rollback

| momento del fallo | qué pasa | qué hacer |
|---|---|---|
| **Dentro de `05`** | **Automático.** Cualquier `RAISE` deshace la transacción entera. Nada queda a medias — demostrado en Render | Nada. Corregir y repetir |
| Tras confirmar `05`, falla el bootstrap | `05` ya está confirmado | `04_grants_vuelta.sql` y luego `02_ownership_vuelta.sql`, **sabiendo que `02` es incompleto** (W4). En la práctica la aplicación sigue funcionando: el propietario no impide el DML |
| Tras cambiar Render a `ecd_app` | El despliegue nuevo falla o el servicio no arranca | Devolver `DB_USER` al valor anterior y **desplegar a mano el commit anterior**. La red real es que Auto-Deploy está Off y el despliegue sano sigue sirviendo |
| Corrupción o pérdida de datos | — | **Restaurar la copia del paso 1.** Es la única red de verdad, y hoy el procedimiento no la exige |

---

## 8 · Cambios mínimos para pasar a APTO

1. **W1** — guardar `ai_brain` tras una comprobación de existencia en `05`
   (y, por consistencia, en `03`). ~6 líneas.
2. **W2** — mover el bloque `DO` de comprobación de roles **por encima** del
   `GRANT`. 2 líneas movidas.
3. **W3** — decidir el destino con la fase B, y **bifurcar el procedimiento**:
   una base nunca bootstrada no necesita `05`.
4. **U6** — exigir copia + ensayo de restauración como paso 1 del procedimiento,
   por escrito.
5. **W4** — o escribir el inverso dinámico de `05`, o **corregir la cabecera de
   `04`** para que deje de prometer una simetría que no existe. Lo segundo basta.

Lo demás (W5–W9) es deuda anotada, no bloqueante.

---

**Veredicto: REQUIERE CAMBIOS.** El diseño es correcto y prudente; los fallos
están en los supuestos sobre el destino, no en la mecánica. **No ejecutar nada
sobre Render hasta cerrar la fase B.**

---

**No se ha ejecutado nada. No se ha modificado nada.**
