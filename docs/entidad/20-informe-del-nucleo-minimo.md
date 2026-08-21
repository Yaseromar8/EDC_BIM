# INFORME DEL NÚCLEO MÍNIMO PROFESIONAL

**20-ago-2026** · Commit `4072a9f` · Cierra el plan del informe [19](19-nucleo-minimo-profesional.md)

> **Ningún documento, versión, ruta de objeto ni SHA-256 cambió.** Medido antes y
> después con `herramientas/invariantes.py`; las huellas son idénticas.

---

## 1 · Qué cambié

### 1.1 · Integridad referencial — `backend/integridad_referencial.py` (nuevo)

Cuatro claves ajenas que el código declaraba y la base nunca tuvo:

```
project_users.project_id  → projects.id   ON DELETE CASCADE
project_users.user_id     → users.id      ON DELETE CASCADE
projects.hub_id           → hubs.id       ON DELETE RESTRICT
project_ref.project_id     → projects.id   ON DELETE CASCADE
```

**Por qué faltaban.** `project_users` se define dos veces y gana la que no las
lleva: `esquema_base.py:106` se extrajo de una producción donde la tabla se creó
a mano; cuando le toca a `routes/auth.py:136`, que sí las declara, la tabla ya
existe y `CREATE TABLE IF NOT EXISTS` la convierte en un no-op.

**Cómo se crean, y por qué así.** `ADD CONSTRAINT ... NOT VALID` primero, y
`VALIDATE CONSTRAINT` después, en transacciones separadas. Una clave ajena
normal examina todas las filas existentes y falla si hay una sola huérfana: en
una base con años de uso eso convierte un despliegue en una caída, y la única
salida rápida sería **borrar filas de un cliente**. Con `NOT VALID` el agujero
se cierra para el futuro sin tocar el pasado; si los datos están limpios, la
validación posterior la deja plenamente validada; si no, se queda como está y se
dice, con nombres y números, qué filas lo impiden. **Ninguna rama borra ni
modifica una sola fila.**

### 1.2 · Identidad determinista — `backend/referencias_de_obra.py` (nuevo) + `db.py`

Tabla nueva `project_ref`, con clave primaria `(account_id, alias)`:

| columna | para qué |
|---|---|
| `account_id` | hoy siempre `''` = esta instancia. Ver §5 |
| `alias` | la cadena de alcance tal como aparece en los datos |
| `kind` | `PROJECT` · `LEGACY_NAME` · `LEGACY_PATH` · `MODEL` · `FRONT` · `EXTERNAL` · `GLOBAL` |
| `project_id` | la obra, con clave ajena real |
| `es_escritura` | cuál de los alias usa esta obra para **guardar** (§1.3) |
| `origen` | de dónde salió la fila — auditable |

**Se retiraron dos heurísticas** de `resolve_project_id`, y son las dos que daban
respuestas dependientes del estado de la base:

- **`by_name`** — coincidencia por nombre de obra. `projects` no tiene `UNIQUE`
  sobre `name` y hay **cuatro** obras llamadas `HOSPITAL_MATUCANA`: el alias
  `proyectos/HOSPITAL_MATUCANA` resolvía a una de las cuatro según el orden en
  que la base devolviera las filas.
- **`default`** — «si hay una sola obra activa, esa». Mientras hubiera una obra,
  **cualquier** alcance desconocido acababa en ella y todo parecía funcionar.

**La heurística no desaparece: se degrada a ayuda de siembra.** Se usa una vez,
en `herramientas/sembrar_referencias.py`, para proponer a qué obra pertenece cada
alias observado. Lo que propone de forma ambigua **no se escribe**: se informa.

**`dataset_id` entra en `_CLAVES_OBRA`** (`auth_middleware.py:433`). Once tablas
del 4D LOB no tienen ninguna otra columna de obra, y `/api/lob` **sí** está en
`_PROJECT_SCOPED_PREFIXES`: sin esa clave, el módulo entero habría contestado
**403 PROJECT_UNRESOLVED** a todo el que no fuera administrador en cuanto se
encendiera la autorización.

Y se exige que **el alcance y la obra declarada coincidan**. `lob_datasets.project_id`
sale de `request.form.get('project_id')` (`routes/lob4d.py:373`). Está gateado por
pertenencia, así que nadie puede atribuirse una obra ajena — pero quien sea
miembro de **dos** obras sí podía publicar un dataset declarando A mientras traía
el alcance de B, y desde ese momento cualquier miembro de A alcanzaba datos de B.
Ahora, cuando las dos señales no dicen lo mismo, no se elige: no resuelve
(`db.py`, y el guardia en `_scope_context`).

### 1.3 · El alcance de escritura se mide, no se deriva — **cambio de diseño**

**Esto no es lo que propuse, y conviene decir por qué.** En el informe 19 escribí
que el navegador dejaría de fabricar el alcance y mandaría `projects.id`. **No se
puede.** Al ir a hacerlo lo medí:

```
doc_partidas   1498 filas         file_nodes        1 fila
plan_entregas  1108              doc_sets          1
doc_redlines     33              doc_reviews       1
doc_rfis         25              transmittals      1     ← todas bajo 'proyectos/PQT8_TALARA'
```

Si lo nuevo se guardara bajo `1`, **el árbol documental quedaría partido en dos**:
la obra conservaría su historia y los usuarios verían una carpeta vacía al lado.

Así que el alcance de escritura **se mide una vez** sobre el expediente que ya
existe, se guarda en `project_ref.es_escritura`, y **el servidor se lo dice al
cliente** (`scope_escritura` en las tres respuestas que describen una obra).
Resultado medido:

```
1                                 escribe en  proyectos/PQT8_TALARA   (2668 filas)
las otras 9 obras                 escriben en  su propio projects.id
```

Renombrar una obra deja de mover nada. Las obras **nuevas** —que no tienen
historia que partir— escriben con su `projects.id`, que es inmutable. **Lo viejo
se conserva; lo nuevo no hereda el defecto.**

### 1.4 · Dos fallos encontrados al mirar

- **`create_hub` respondía `201 Created` cuando el INSERT chocaba**, devolviendo
  el id de la cartera **de otro** (`ON CONFLICT DO NOTHING` seguido de un 201
  incondicional; el sufijo `int(time.time()) % 100000` da la vuelta cada 27,7 h).
  Ahora **409**.
- **`_traducir` leía el mapa con corchetes.** Si faltaba una clave, el `except` de
  `resolve_project_id` lo convertía en «no resuelve **nada**», en silencio — y el
  síntoma visible habría sido «nadie tiene acceso a nada». Ahora degrada lo que
  le falte en vez de apagar la traducción entera.

### 1.5 · Una prueba que fijaba una posición pasa a fijar una dependencia

`test_las_columnas_pendientes_siguen_siendo_las_ultimas` comprobaba
`orden[-1] == 'columnas_pendientes'`. Al añadir el paso de claves ajenas falló —
no porque nada se hubiera roto, sino porque una aserción posicional no distingue
«se coló algo indebido» de «entró algo que también tiene que ir al final». Ahora
comprueba la dependencia real: las claves ajenas no pueden referenciar una
columna que `columnas_pendientes` todavía no ha creado.

### 1.6 · Herramientas nuevas

| guion | para qué |
|---|---|
| `herramientas/invariantes.py` | huella de lo que no debe cambiar, antes y después |
| `herramientas/sembrar_referencias.py` | puebla `project_ref`; en seco por defecto |
| `herramientas/ensayo_de_segunda_obra.py` | el ensayo de aceptación completo |
| `herramientas/antes_de_enforce.py` | qué pasaría al encender la autorización, sin encenderla |

---

## 2 · Antes / después

| | antes | después |
|---|---|---|
| Claves ajenas en `project_users` / `projects` | **0** | **4**, validadas en instancia virgen |
| Vocabularios de alcance que resuelven | **4 de 7** | **7 de 7** |
| Filas bajo alcances irresolubles *(base de desarrollo)* | **~45.200** | **3** |
| Heurísticas que deciden la obra en cada petición | **3** | **0** — la decide una tabla |
| `global` (4.440 filas) | resolvía por accidente | decisión explícita, registrada |
| `dataset_id` (40.776 filas, 11 tablas) | **no resolvía** | resuelve, con las dos señales cotejadas |
| Alcance de escritura | lo fabricaba el navegador desde el nombre visible | lo mide y lo dice el servidor |
| `create_hub` ante colisión | `201` con el id de otro | `409` |
| Pruebas | **801** | **813** |
| Manifiesto de esquema | — | **+24 objetos exigidos** (tabla, columnas, restricciones, índices) |

Los objetos nuevos están **en el manifiesto**, así que una instancia donde no se
creen **no arranca**: la verificación de esquema devuelve código 1. La garantía
no es que el código los cree — es que el arranque se niega si no están.

---

## 3 · Resultado de las pruebas

| prueba | resultado |
|---|---|
| **Suite completa** | **813 pasan, 0 fallan** (línea base: 801) |
| **Ensayo de segunda obra**, instancia virgen | **15 de 15** |
| — los alcances existentes resuelven igual tras crear la segunda obra | ✔ |
| — cada alcance resuelve a una obra; lo inventado no resuelve | ✔ |
| — miembro de A **no** alcanza B · miembro de B **no** alcanza A | ✔ ambos sentidos |
| — cada uno **sí** alcanza lo suyo | ✔ |
| — alcance indeterminable → **403 PROJECT_UNRESOLVED** | ✔ |
| — al borrar las obras, membresías y referencias se van con ellas | ✔ |
| **Bootstrap desde base vacía** | 93 tablas · 840 columnas · 476 restricciones · **0 fallos** |
| **Copia → base vacía → restauración** | **88 tablas, todas cuadran**; las 4 claves ajenas vuelven **validadas** |
| **Invariantes antes/después** | `file_nodes` idéntico · `file_versions` idéntico · 46 columnas de alcance, **ninguna reescrita** · auditoría solo anexa |

**Una salvedad honesta sobre la evidencia.** La base de desarrollo contra la que
medí tiene **18 `file_nodes` y 0 `file_versions`**. La comprobación de que ninguna
huella cambió es por tanto **vacía para las versiones** en este entorno: lo que sí
demuestra es que ninguno de los 46 conjuntos de alcances se reescribió. La
herramienta está hecha para ejecutarse igual sobre producción, antes y después.

---

## 4 · Qué dejé deliberadamente sin hacer

| | por qué |
|---|---|
| **`UNIQUE (hub_id, name)` en `projects`** | Estaba en mi plan y **lo retiro**. Hay 4 obras llamadas `HOSPITAL_MATUCANA` y añadir la restricción obligaría a **renombrar tres** — modificar datos existentes por una garantía que ya no hace falta ahí: la unicidad que importa vive ahora en `project_ref`. Se informa en cada siembra y queda como decisión del propietario |
| **Roles por obra (B3)** | Membresía + rol global + permisos de carpeta ya cubren el caso. Añadir la columna después es aditivo |
| **Account tipado (B2)** | Con instancia dedicada, la instancia **es** la cuenta |
| **Frontera de IA (B4)** | Decisión de producto: no vender IA en el primer producto. En perfil portal ya devuelve 404 |
| **Ciclo de vida de 5 estados (B5)** | `active`/`archived` basta |
| **Migrar los `model_urn` históricos** | No hace falta y sería el único paso peligroso. Se traducen, no se sustituyen |
| **Todo lo de DESPUÉS y MUCHO DESPUÉS** | No se tocó nada |

---

## 5 · Deuda legacy que permanece

1. **Siete vocabularios de alcance siguen en los datos.** Se traducen; no se han
   unificado. Es deliberado: unificarlos exigiría reescribir 36 tablas.
2. **`projects.name` sin `UNIQUE`**, y cuatro obras comparten nombre. Sus alias
   por nombre no se siembran y el sembrador lo informa.
3. **`project_id` significa tres cosas distintas** según la tabla (`db.py:964-967`):
   la obra, el frente, y el id de ACC. No se renombró nada. La regla para tablas
   nuevas está en [21 — Vocabulario congelado](21-vocabulario-y-clave-de-referencias.md).

   > **Corrección.** Aquí decía «`project_uid` para la obra … y nunca
   > `project_id` en una tabla nueva». **Era incorrecto y podía inducir a
   > error:** no existe ningún `project_uid` en este diseño, ni está previsto
   > antes de multi-Account. La identidad canónica es `projects.id`, de tipo
   > TEXT. Lo que está quemado no es el nombre `project_id` sino su uso **sin
   > clave ajena**: la regla real es que una tabla nueva puede llamarla
   > `project_id` **si y solo si** lleva `REFERENCES projects(id)`.
4. **La columna `project_id` de las 11 tablas del «Pilar Identidad» sigue dormida**
   (`db.py:978`): está poblada y ninguna consulta de autorización la lee. Hoy no
   estorba; sigue siendo un dato sin lector.
5. **Tres filas** bajo alcances irresolubles (`test`, `test_scope`, un URN de
   objeto de Autodesk), todas de prueba.
6. **`_scope_context` sigue aceptando un `project_id` del formulario** — ahora
   cotejado contra el alcance, pero la señal de partida sigue viniendo del cliente.
7. **El administrador global salta la comprobación** (`auth_middleware.py:813`,
   `perimetro_de_obra.py:262`). Correcto mientras instancia = entidad; ver §6.

---

## 6 · Qué habrá que reabrir antes de multi-Account / *pooled*

Todo esto es **válido para la arquitectura dedicada de hoy, no una restricción
irreversible del producto**. Lo que asume que «instancia = entidad», nombrado:

| decisión de hoy | qué la sostiene | qué hay que reabrir |
|---|---|---|
| **`project_ref.account_id` vale siempre `''`** | Una instancia, una entidad | Ya está **en la clave primaria**. Poblarla es un `UPDATE` sobre decenas de filas; no hay que rehacer la clave |
| **`projects.id` como identificador canónico** | Único dentro de la instancia | Con varias cuentas en una base, `1` colisiona. Entonces —y solo entonces— hará falta un `uid` propio, y `project_ref` es el único punto de traducción que habría que ampliar |
| **El administrador global ve toda la instancia** | La instancia es de una entidad | Con dos entidades compartiendo base deja de ser aceptable: hay que separar administrador de sistema, de cuenta y de obra (B3) |
| **`CUENTA_DE_ESTA_INSTANCIA = ''`** | Constante en un solo sitio | Pasa a resolverse por petición |
| **Aislamiento físico como garantía principal** | Base, bucket y servicio propios | En *pooled* el aislamiento pasa a ser lógico, y entonces sí vuelve a ser la pregunta correcta el RLS de PostgreSQL |
| **Sin resolvedor de emplazamiento** | Todo sale del entorno del proceso | Habría que resolver base y bucket **por petición**, y revisar el cliente único de almacenamiento (`gcs_manager.py:26`) y el pool |

---

## 7 · Veredicto

# GO — para una instancia nueva de primer cliente

Una instancia virgen construida con este código pasa **15 de 15** comprobaciones
del ensayo de segunda obra **con la autorización por obra encendida**, y su
esquema se levanta desde vacío sin un solo fallo. No hereda ninguna de las
condiciones de abajo, porque no tiene usuarios sin membresía ni alcances
heredados.

### Tres acciones del propietario, y ninguna la puedo hacer yo

Para **la instancia heredada del propietario** (la que hoy tiene el expediente
real), antes de encender `ENFORCE_PROJECT_AUTHZ`:

| # | acción | por qué no la hago yo |
|---|---|---|
| **1** | Ejecutar el arranque **con la identidad de migración**: `ecd_migrator → python bootstrap_esquema.py` | Las claves ajenas exigen ser dueño de la tabla; `ecd_app` no lo es, **y eso es correcto** — es la separación de identidades funcionando |
| **2** | `python herramientas/sembrar_referencias.py --aplicar` y decidir a qué obra pertenece `global` | Es una decisión de quien conoce la obra, no del programa |
| **3** | Asignar su obra a los **10 usuarios sin ninguna membresía** (`herramientas/antes_de_enforce.py` los lista) | Son personas reales; a qué obra pertenece cada una no lo puedo inventar |

Después: `python herramientas/antes_de_enforce.py` debe decir **«Nada
pendiente»**, y entonces `ENFORCE_PROJECT_AUTHZ=true`.

### Y una reauditoría que sigue pendiente

Este trabajo **invalida** —como avisé— la evidencia de autorización, aislamiento y
restauración del GO anterior. Las tres se han repetido aquí sobre una instancia
virgen y pasan. **Sobre la instancia con datos reales hay que repetirlas después
de las tres acciones**, porque es ahí donde el resultado puede diferir.

Lo que **no** se ha reauditado y **no hacía falta**: arranque en Linux, bytes con
SHA-256 de punta a punta, lector PDF y 2FA. Ninguna de las tres piezas los toca,
y las invariantes demuestran que el almacenamiento no se ha rozado.

---

**Me detengo aquí.** No he continuado con nada de DESPUÉS ni de MUCHO DESPUÉS.
