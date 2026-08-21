# CIERRE DE ADMINISTRATION FOUNDATION — `frontend-docs`

**Fecha:** 21 de agosto de 2026
**Alcance:** `frontend-docs` (backend documental + interfaz de expediente).
**Fuera de alcance y sin tocar:** `frontend-react`, visor 3D/4D, LOB, AR, Live
Link, Tablero, Multimedia, holograma de movimiento de tierras.

---

## VEREDICTO

**ADMINISTRATION FOUNDATION CERRADA.**

Con dos cosas dichas en voz alta, porque cerrar no es lo mismo que terminar:

1. La **Enmienda 1 no está resuelta, está preparada** — y así lo pedía el
   encargo. El inventario existe y está abajo; la decisión cuenta por cuenta es
   de una persona, no de este trabajo. Hay una cuenta que salta a la vista.
2. Nada de esto está desplegado. Corre en local y en clúster de ensayo. El
   despliegue es una decisión tuya, y hay una condición previa que está en la
   última sección.

---

## 1 · QUÉ ERA EL PROBLEMA, MEDIDO

`users.role = 'admin'` significaba tres cosas a la vez. Con sonda, sobre un
`admin` que **no era miembro de la obra** y **sin ninguna concesión de carpeta**:

```
200  /api/docs/list · global-search · indice-expediente · activity
200  POST …/participantes   → cambió la función contractual de una empresa
200  POST /api/rfis         → EMITIÓ UN RFI EN UNA OBRA AJENA
     permiso_efectivo(admin, contrato) = 'admin'
```

No era un permiso mal configurado. Era una llave maestra sin cerradura debajo.

---

## 2 · LAS TRES FIGURAS, Y DÓNDE VIVE CADA UNA

| Figura | Dónde vive | Alcance |
|---|---|---|
| **ENTITY ADMIN** | `users.role = 'admin'` | La instancia del cliente. Crea y archiva obras, administra cuentas y el catálogo de idoneidad. **Conserva alcance global**, y eso es deliberado mientras 1 instancia = 1 cliente. |
| **PROJECT ADMIN** | `project_users.es_admin` | **Una obra**. Su directorio, sus permisos documentales, sus rescates. Termina ahí. |
| **SYSTEM / PLATFORM OPERATOR** | **No es un rol de esta aplicación** | Quien tiene credenciales de PostgreSQL, GCS o Render entra por fuera de Flask. Ningún valor de `users.role` lo impide. Se dice aquí en vez de fingir que esto lo aísla. |

### Por qué una columna y no una tabla

Porque «un Project Admin debe ser miembro de la obra» queda garantizado por la
**forma de la tabla**, no por una regla que alguien tiene que acordarse de
comprobar: la administración *es* la fila de membresía. Sacar a alguien de la
obra le retira la administración en el mismo acto. El ensayo lo mide
(sección 5).

---

## 3 · LA RESOLUCIÓN CANÓNICA

Todo pasa por una sola función, en `backend/administracion_de_obra.py`:

```python
es_admin_de_obra(cur, usuario, obra)   # Entity Admin  o  project_users.es_admin
```

- La identidad de la obra se resuelve **siempre** con `resolve_project_id`
  antes de preguntar. Un `model_urn` es un *alias* — la obra `'1'` tiene ocho
  registrados — y resolver por alias dejaría a la misma persona administrando
  bajo un alias y no bajo otro.
- **Fail-closed** en los tres caminos: sesión sin identidad numérica, obra
  indeterminable, o error de base → responde que **no**.

### Los 12 puntos de decisión, cerrados

| # | Dónde | Qué decía | Qué dice |
|---|---|---|---|
| B1–B3 | `perimetro_de_obra.py` | `role == 'admin'` | perímetro por entidad · guardia por obra |
| B4 | `permiso_documental.py` | `role == 'admin'` → `'admin'` | `es_admin_de_obra` |
| B5–B9 | `folder_permissions.py`, `file_system_db.py`, `acceso_a_blobs.py`, `routes/documents.py` | íd. | íd. |
| B10 | `verify_project_access`, `_puede_descargar` | íd. | íd. |
| B11 | `routes/transmittals.py` | acuse indistinguible | `ADMIN_RECORDED_RECEIPT` (§5) |
| B12 | `routes/reviews.py` | el admin **aprobaba por el revisor** | ya no |
| — | `routes/directorio.py` (×3) | `role != 'admin'` | `guardia_administrativa` |
| — | `flujo_de_registro.py` | posición ADMIN global | administración **de la obra del objeto** |

Quedan **cero** comprobaciones `role == 'admin'` en el perímetro documental. Las
que quedan son ENTITY a propósito y están comentadas donde están: catálogo de
idoneidad, cuentas de la instancia, archivar obra.

### Lo que la posición ADMIN nunca ha concedido, y sigue sin conceder

Dictar el veredicto. En RFI y Red Line es `quien_dicta_veredicto=(RESPONSABLE,)`,
y ADMIN no está. En Reviews lo estaba de hecho — **eso era B12** — y ya no:

> Un administrador podía **aprobar o rechazar** el paso asignado a otra persona.
> El rescate legítimo sigue existiendo y es otro: sustituir al revisor de una
> revisión *bloqueada*, con auditoría. Eso cambia **quién debe actuar**; no actúa
> por él.

---

## 4 · LA INTERFAZ

`GET /api/projects/<id>/mi-administracion` → `{es_entity_admin, es_admin_de_obra}`.

- `useAdministracion(project)` lo consulta; `useFileExplorer` deja de derivar
  `isAdmin` de `user.role` y pasa a preguntarlo **por obra**.
- **Fail-closed también aquí**: mientras no se sabe, se enseña de menos. Un
  botón que aparece medio segundo tarde es mejor que uno que revienta.
- Lo que es **de la entidad** dejó de pedir administración de obra: catálogo de
  idoneidad, archivar obra, y cambiar el rol de una cuenta en «Usuarios del
  sistema».
- **Esto no autoriza nada.** Cada ruta lo vuelve a comprobar, y el ensayo lo
  demuestra llamándolas con la sesión equivocada (sección 9).

### Participantes — el control mínimo

Columna **«Administra esta obra»**, separada del «perfil del sistema» a
propósito: confundirlos fue el problema original.

- Casilla para **nombrar** y **retirar**, con confirmación al retirar que dice
  qué **no** se pierde (participación y permisos de carpeta).
- Un Entity Admin se muestra como *«Administrador de la entidad»* sin
  interruptor: no hay nada que nombrar, y un interruptor que no hace nada sería
  peor que ninguno.
- **Nadie se queda sin administrador por descuido**: retirar al último devuelve
  `409 ULTIMO_ADMIN_DE_OBRA` salvo que quien lo haga sea Entity Admin — que
  siempre puede devolver uno.

---

## 5 · ENMIENDA 2 — TRANSMITTALS

Pediste que un Project Admin **no** produzca un acuse indistinguible del acuse
del destinatario. Al implementarlo apareció un defecto real, más grave que el
que había que corregir:

> La vía administrativa cerraba el encargo de **quien registraba** — que no
> tenía ninguno. El destinatario seguía debiéndolo mientras la emisión mostraba
> un acuse. Un encargo que desaparece de la bandeja de quien lo debe se pierde
> de la peor forma: sin hacer ruido.

Lo implementado:

| | Acuse del destinatario | Registro administrativo |
|---|---|---|
| forma | `por`, `por_id`, `via: 'destinatario'` | `tipo: 'ADMIN_RECORDED_RECEIPT'` |
| de quién | implícito: quien actuó | `destinatario_id`, `destinatario` |
| quién lo anotó | — | `registrado_por`, `registrado_por_id` |
| motivo | — | opcional, se conserva |
| salda a | quien acusó | **el destinatario** |

- Registrar **exige** decir de qué destinatario se trata (`400
  FALTA_DESTINATARIO`) y se valida contra los destinatarios reales de la emisión
  (`400 NO_ES_DESTINATARIO`). «Recibido» sin sujeto no es un registro.
- **Nunca** se convierte en `acknowledged_by = recipient`: la fila no lleva
  `por` ni `por_id`, así que no hay forma de leerla como si el destinatario
  hubiera actuado.
- `encargos._acuso` entiende `destinatario_id` y salda a la persona correcta.
- No hizo falta ampliar Transmittals materialmente: es un campo más en el JSON
  que ya existía y una rama en el manejador.

**Tres pruebas cambiaron de contrato a propósito.** Fijaban exactamente el
comportamiento que la Enmienda 2 ordena dejar de tener (`via: 'admin'` sobre
una fila por lo demás idéntica). No fallaron: describían el modelo anterior.
Están reescritas y dicho en la cabecera del fichero.

---

## 6 · QUÉ NO SE HA CONSTRUIDO, Y SIGUE SIN CONSTRUIRSE

Account Membership · Account Roles · Permission Profiles · Project Templates ·
Tool Activation · Member Tool Access · SSO/SCIM · grupos de empresa.

Y no se ha creado ningún sistema de autorización nuevo: esto son una columna,
una función y doce llamadas que ya existían apuntando al sitio correcto.

---

## 7 · CÓMO SE MIDIÓ

| | |
|---|---|
| `ensayo_de_administracion.py` (nuevo) | **32 / 32** |
| Batería completa (11 ensayos + expediente) | **449 / 449** |
| Suite `backend/tests` | **886 pasan, 1 omitida, 0 fallan** |
| Build `frontend-docs` | limpio (417 módulos) |
| Bootstrap sobre clúster **virgen** | 95 tablas · 872 columnas · 510 restricciones · 184 índices — 0 fallos, `ESQUEMA_ESTRICTO=true` |

El manifiesto se regeneró **desde un clúster virgen creado para esto y
destruido después** — no desde una base existente, que congelaría sus taras.
Cambio total: **tres líneas**.

```
+columna      project_users.es_admin
+restriccion  project_users not null es_admin
+indice       create index on public.project_users using btree (project_id) where es_admin
```

El ensayo mide **rutas reales con la sesión equivocada**, no funciones con buen
nombre. Y se para si falta la columna, en vez de medir sobre una base que no es
la que el código espera.

`ensayo_de_restauracion.py` no entra en la batería: exige una contraseña
tecleada (`getpass`), y eso es correcto — crear una base pide un rol con
CREATEDB que ni `ecd_app` ni `ecd_migrator` tienen.

### Tres defectos míos, encontrados por lo que estaba construyendo

1. **Las cuatro reglas de flujo no aceptaban el cursor.** Derivé los nombres de
   los campos por transformación de cadenas (`quien_pasar_la_pelota` en vez de
   `quien_pasa_la_pelota`), no coincidió ninguno, y el guion **informó de éxito
   igualmente** porque no comprobaba nada. Lo encontró la batería. Ahora cada
   sustitución tiene su `assert`.
2. **Los clientes del ensayo no eran independientes.** `validate_session` se
   parchea a nivel de módulo: un cliente guardado en una variable actuaba como
   la última persona creada. Dos comprobaciones no *fallaban* — **enseñaban lo
   contrario de lo que pasa**, que es peor.
3. **Puse la ruta de nombrar administrador en el sitio equivocado.**
   `test_el_bloque_no_toca_documentos_ni_permisos` fija que el bloque de
   encargos no escriba en `project_users`. Tenía razón: nombrar un
   administrador cambia quién puede qué, y eso no es una proyección. La ruta se
   movió a `routes/administracion.py` en vez de ablandar el control.

Y una decisión sobre un contrato existente: la negativa administrativa conserva
`code: 'FORBIDDEN'` y añade `motivo: 'NO_ES_ADMIN_DE_OBRA'`. El código dice la
*clase* de negativa; la razón va al lado. Cambiarlo habría roto el contrato de
F4 para decir lo mismo con otra palabra.

---

## 8 · ENMIENDA 1 — INVENTARIO DE ADMINISTRADORES

**No se infirió nada.** La columna nace `FALSE` para todos y ninguna cuenta ha
perdido nada. Reparto de autoridad por adivinación es la peor clase de
inferencia, y no se hizo.

Medido en `ecd_dr12d`, **solo lectura**, 21-ago-2026 — 17 cuentas, 10 obras:

| id | nombre | correo | activa | obras |
|---|---|---|---|---|
| 2 | Yaser Omar | omarsanchezh8@gmail.com | sí | 1 |
| 21 | Administradora Municipal | admin@munisanmarcos.gob.pe | sí | 0 |
| 30 | Medicion Infra | medicion@local.test | sí | **0** |

Project Admins: **ninguno todavía** — la columna aún no existe en esa base.

### Lo que salta a la vista

**`Medicion Infra` (id 30)** es exactamente la cuenta que esta separación
pretende encontrar: técnica, activa, con Entity Admin, y participando en **cero
obras**. Custodio de la instancia entera para medir. No la he tocado.

`Administradora Municipal` (id 21) también está en cero obras, pero eso encaja
con lo que es: la cuenta del piloto de entidad.

**La decisión es tuya, cuenta por cuenta:** ¿custodio de la instancia, o le
bastaba administrar una obra concreta?

---

## 9 · ANTES DE DESPLEGAR — UNA CONDICIÓN

El servicio en Render corre hoy sobre el commit `b671559` con
`ESQUEMA_ESTRICTO=false`, y hay **12 commits locales sin subir**. Estos cambios
añaden una columna, así que:

1. `project_users.es_admin` tiene que existir antes de que arranque el código
   que la lee. Está cableada en `bootstrap_esquema.py` y en el arranque de
   `server.py`, y es idempotente — pero **el arranque corre como `ecd_app`, que
   a propósito no puede crear esquema**. En producción el rol es `postgres`, así
   que ahí sí se aplicará sola; en cualquier instancia con roles separados hay
   que pasar el bootstrap con el rol dueño.
2. Con la columna puesta, `ESQUEMA_ESTRICTO` puede volver a `true`: el
   manifiesto regenerado ya la incluye.

No he desplegado nada. Esa decisión es tuya.

---

## 10 · LÍMITES DE ESTE CIERRE

Esto es **nuestro cierre técnico interno**. No es una certificación ISO, ni de
un tercero, ni una declaración de conformidad ante ninguna entidad.

Lo que **no** se puede decir después de esto:

- Que el sistema esté aislado del operador de plataforma. **No lo está**, y no
  puede estarlo por este camino: quien tiene las credenciales de la base entra
  por fuera de la aplicación.
- Que un Entity Admin tenga alcance limitado. **No lo tiene**, a propósito,
  mientras 1 instancia = 1 cliente. Cuando eso deje de ser cierto, esa decisión
  hay que volver a tomarla.
- Que los históricos se hayan reinterpretado. **No se han tocado**: ni
  convertido, ni migrado por inferencia, ni reconstruidos sus actores.
