# CIERRE DE SEIS PUNTOS — antes de autorizar A1/A2

**20-ago-2026** · Complemento del informe [17](17-foundation-v2-architecture-discovery.md)
**No se ha implementado nada.** Inspección de solo lectura.

> **Alcance de la evidencia.** Las consultas de este documento se ejecutaron
> contra la **base de desarrollo local** (PostgreSQL 18.4, `127.0.0.1:5433`):
> 17 usuarios, 10 obras, 18 `file_nodes`, 0 `file_versions`. **No es
> producción.** Los *formatos*, *rutas de código* y *comportamientos* medidos sí
> son los mismos; los *recuentos de filas* de este documento son de esa base y no
> deben leerse como cifras de producción.

---

## 0 · Dos correcciones al informe 17

Antes de responder, dos cosas que dije mal y que la inspección desmiente.

### Corrección 1 — sobre el 403 a los 14 usuarios (§1 del informe 17)

Escribí que `_user_in_project()` compara contra `proyectos/PQT8_TALARA`, que no
hay ninguna fila, y que con `ENFORCE` los 14 no administradores recibirían 403
sobre el expediente.

**Es falso.** El guardián no compara la cadena cruda: llama antes a
`resolve_project_id()`. Y ése **sí** traduce:

```
proyectos/PQT8_TALARA  ->  1        (medido)
```

Y `project_users` tiene 4 filas para `'1'`. Los miembros pasan.

Lo que sí es cierto, y es otro problema, está en §5 y §6 de abajo.

### Corrección 2 — sobre la frontera de la IA (§14 del informe 17)

Escribí que había «una frontera rota» porque `_download_pdf` empieza por una
ruta. **Es falso.** Las cinco rutas de IA tienen guardia, y lo comprobé línea a
línea:

| ruta | guardia | línea |
|---|---|---|
| `/api/ai/warmup` | `guardia_del_documento(node_id, full_path)` | `routes/ai.py:293` |
| `/api/ai/ask` | `guardia_del_documento(node_id, full_path)` | `routes/ai.py:354` |
| `/api/ai/feedback` | `guardia_de_recurso('ai_brain.feedback_buffer', …)` | `routes/ai.py:526` |
| `/api/ai/universal-search` | `guardia_de_obra(model_urn, …)` | `routes/ai.py:674` |
| `/api/ai/analyze-title` | `guardia_del_documento(node_id, full_path)` | `routes/ai.py:841` |

Y `guardia_del_documento` es **fail-closed** por diseño escrito
(`perimetro_de_obra.py:243-282`): si la ruta del objeto no corresponde a ningún
nodo vivo, corta con 404.

B4 sigue necesitando cambios —§6— pero **son otros**, y menores de lo que dije.

---

## 1 · ¿Es `projects.id` una identidad 100% interna?

### Inventario de formatos observados en `projects.id`

| formato | ejemplo | origen | acuñado |
|---|---|---|---|
| entero desnudo | `1` | obra original heredada | histórico |
| `b.proj_{slug}_{t%100000}` | `b.proj_hospital_matucana_60633` | `routes/projects.py:343` | **aquí** |
| slug a mano | `p_talara_pruebas` | `herramientas/obra_de_prueba.py:85` | **aquí** |

```python
# routes/projects.py:343
proj_id = f"b.proj_{re.sub(r'[^a-z0-9]', '_', data['name'].lower())}_{int(time.time()) % 100000}"
```

**Respuesta directa: sí, `projects.id` es 100% interno.** Ningún valor procede de
Autodesk. Las rutas APS de hubs y proyectos (`server.py:712-750`) son **proxies
puros**: piden a `developer.api.autodesk.com` y devuelven el JSON. **No escriben
en ninguna tabla nuestra.** No existe ninguna ruta de ingesta que persista un id
de Autodesk en `projects.id`.

### Pero el *espacio de identificadores* sí es mixto

Ids externos que **sí** están en la base:

| dónde | valor | qué es |
|---|---|---|
| `projects.model_urn` | `b.a7ce4d60-79f3-4dbf-b059-fefaf14f7b1d` | **id de proyecto ACC** (`b.` + UUID), y es el de la obra real `PQT8_TALARA` |
| `model_config.project_id` | `b.3fcc21c3-6d58-45bb-8057-ab3352b1b58f` (17 filas) | **id de proyecto ACC** |
| `civil_sections`, `civil_design_automation` | columna `acc_project_id` | id de proyecto ACC |
| `civil_alignments.model_urn` | `urn:adsk.objects:os.object:test/test.dwg` | URN de objeto de Autodesk |

Y el propio código lo documenta:

```python
# db.py:966
#   - model_config.project_id  = ACC Project ID ('b.3fcc...') usado por update/relink
```

Es decir: **hay una columna llamada `project_id` cuyo contenido es un
identificador de Autodesk.** Y `db.py:964-967` enumera **tres semánticas
distintas** conviviendo bajo ese mismo nombre de columna:

```
model_config.project_id  = ACC Project ID
saved_views.project_id   = frente ('1_CANAL')
control_pins.project_id  = frente
```

### El inventario completo del alcance: **siete** vocabularios, no cuatro

Corrijo la cifra del informe 17. Clasificados todos los valores distintos de
`model_urn`/`project_id`/`scope_urn`/`dataset_id`/`hub_id` de la base:

| # | vocabulario | ejemplo | ¿resuelve a obra? |
|---|---|---|---|
| 1 | entero heredado | `1` | ✔ `1` |
| 2 | ruta-slug | `proyectos/PQT8_TALARA` | ✔ `1` |
| 3 | compuesto obra+modelo | `1_CANAL`, `1_DRENAJE` | ✔ `1` |
| 4 | nombre desnudo | `PQT8_TALARA` | ✔ `1` |
| 5 | acuñado aquí | `b.proj_pqt8_interferencias_4852` | ✔ |
| 6 | **id de Autodesk** | `b.a7ce4d60-…`, `b.3fcc21c3-…` | ✘ **None** |
| 7 | **UUID de dataset** | `653fea31-…`, `9c12f449-…` | ✘ **None** |
| — | **sin obra** | `global` | ✘ **None** |

Medido ejecutando `db.resolve_project_id()` sobre cada valor real.

### Veredicto de §1

**Sí hace falta un `project_uid` interno e inmutable.** Tres razones medidas:

1. **`projects.id` ya tiene tres formatos** y uno de ellos (`b.proj_…`) *imita*
   el vocabulario de Autodesk, lo que garantiza confusión futura al leer datos.
2. **`projects.model_urn` contiene hoy un id de ACC** para la obra real. Es decir:
   la obra ya tiene un identificador externo pegado a su fila.
3. `projects.id` viaja como valor en 24 tablas sin ser clave ajena en ninguna, de
   modo que **cambiarlo es imposible** sin reescribir esas 24 tablas. Un `uid`
   inmutable separado resuelve eso de raíz.

**Diseño recomendado:** `projects.uid UUID` (inmutable, nunca visible, nunca
reutilizado) + `projects.id` degradado a **clave legible** + `model_urn` y los
`acc_project_id` degradados a **referencias externas** en una tabla aparte.

---

## 2 · ¿Es `hubs` nuestro Account nativo o un Autodesk Hub?

### Cómo se acuña

```python
# routes/projects.py:218  (POST /api/hubs — la única vía de creación)
hub_id = f"b.mdc_{re.sub(r'[^a-z0-9]', '_', data['name'].lower())}_{int(time.time()) % 100000}"
```

```python
# routes/projects.py:136  (el hub por defecto, literal en el código)
default_hub_id = 'b.mdc_default_legacy'
```

**Respuesta directa: `hubs` es nuestro Account nativo.** Los dos valores que
existen se acuñan aquí. El prefijo `b.` es **mimetismo cosmético** del
vocabulario de Autodesk (donde `b.` significa BIM 360 account), sin ninguna
relación con Autodesk. **No hay ninguna dependencia que romper**, porque no
existe.

### Pero hay un defecto real que encontré al mirarlo

`create_hub` puede **aliasar silenciosamente al Account de otro**:

```python
INSERT INTO hubs (id, name, region, logo_url) VALUES (%s,%s,%s,%s)
ON CONFLICT (id) DO NOTHING          # ← si choca, NO hace nada
...
return jsonify({"id": hub_id, "name": data['name']}), 201   # ← y aun así dice 201 CREADO
```

`int(time.time()) % 100000` da la vuelta **cada 27,7 horas**. Dos Accounts con el
mismo nombre creados con esa separación producen el mismo `hub_id`; el segundo
`INSERT` no hace nada y la respuesta dice **201 Created** devolviendo el id del
primero. El llamador cree haber creado una entidad nueva y está apuntando a la
ajena.

Es una ruta de administrador y la ventana es estrecha, pero el modo de fallo es
del tipo que no se detecta nunca: no hay error, hay una entidad de menos.

*(`create_hub_project` tiene el mismo sufijo pero **sin** `ON CONFLICT`, así que
una colisión ahí revienta con violación de clave primaria — ruidoso, y por tanto
mejor.)*

### Veredicto de §2

El Account canónico **no dependerá de Autodesk**, porque hoy tampoco depende.
Dos enmiendas:

1. Acuñar `accounts.uid UUID` propio. `b.mdc_*` pasa a alias heredado.
2. Dejar de imitar el prefijo `b.` en identificadores nuestros: hace que un id
   propio y uno de ACC sean indistinguibles a simple vista, y este informe ha
   necesitado una consulta para separarlos.

---

## 3 · Revisión del diseño de `project_alias`

**Mi propuesta del informe 17 —`project_alias(alias TEXT PRIMARY KEY, project_id, origen)`— es insuficiente. La retiro.**

Tres fallos independientes, cada uno bastaría.

### Fallo a — confunde tipos de alias que no son intercambiables

`1_CANAL` **no es otro nombre de la obra 1**. Es *la obra 1 ∩ el modelo CANAL*.
Colapsarlo a `PROJECT 1` resuelve la autorización y **destruye la dimensión de
modelo**, de la que dependen `saved_views`, `control_pins` e `inventory_assets`
(18.245 filas bajo `1_CANAL` en esta base).

Los tipos son cinco y hay que declararlos:

| tipo | ejemplo | unicidad |
|---|---|---|
| `PROJECT` | `1`, `b.proj_…_4852` | por Account |
| `LEGACY_PATH` | `proyectos/PQT8_TALARA` | **derivado del nombre → colisiona** |
| `MODEL` | `1_CANAL`, `…_4852_DRENAJE_URBANO` | por proyecto |
| `FRONT` | `1_DRENAJE`, `1_INFRAWORKS` | por proyecto |
| `DATASET` | `653fea31-…` (uuid4) | **globalmente único ya** |

### Fallo b — colisión entre Accounts, y ya ocurre hoy dentro de uno

El alias de ruta **se fabrica en el navegador a partir del nombre visible**:

```jsx
// frontend-react/src/App.jsx:4861
modelUrn={selectedProject?.baseName ? `proyectos/${selectedProject.baseName.replace(/ /g,'_')}` : 'global'}
```

Y `projects` **no tiene UNIQUE sobre `name`**:

```
restricciones únicas en projects: ['UNIQUE (invite_code)', 'PRIMARY KEY (id)']
obras con NOMBRE DUPLICADO: [('HOSPITAL_MATUCANA', 4)]
```

**Cuatro obras se llaman igual. Y el resolvedor ya elige una arbitrariamente:**

```
proyectos/HOSPITAL_MATUCANA  ->  b.proj_hospital_matucana_60638
HOSPITAL_MATUCANA            ->  b.proj_hospital_matucana_60638
```

Las otras tres son inalcanzables por nombre. Con `alias TEXT PRIMARY KEY` habría
**una sola fila** para `proyectos/HOSPITAL_MATUCANA`, y sería **incorrecta para
tres de las cuatro obras**.

Con dos entidades esto pasa de accidente a certeza: dos municipalidades con un
proyecto llamado «Expediente Técnico» producen el mismo alias.

Además: **renombrar un proyecto en la interfaz cambia el alias de todo lo que se
escriba después.** El identificador de alcance depende de un campo editable.

### Fallo c — colisión en la acuñación

`{int(time.time()) % 100000}` (§2). Un alias derivado de un id colisionable
hereda la colisión.

### Diseño corregido

```
project_ref
  account_uid  UUID  NOT NULL
  kind         TEXT  NOT NULL   -- PROJECT | LEGACY_PATH | MODEL | FRONT | DATASET
  alias        TEXT  NOT NULL
  project_uid  UUID  NOT NULL   -- REFERENCES projects(uid)
  model_code   TEXT             -- solo para MODEL/FRONT: la dimensión que no se pierde
  origen       TEXT  NOT NULL   -- de dónde salió este alias (auditoría)
  PRIMARY KEY (account_uid, kind, alias)
```

**No `alias TEXT PRIMARY KEY`.** La clave es `(account_uid, kind, alias)`.

Y los alias ambiguos —los cuatro `HOSPITAL_MATUCANA`— **no se resuelven
automáticamente**: se marcan y se deciden a mano. Un resolvedor que elige uno de
cuatro en silencio es peor que uno que dice «no sé».

---

## 4 · Política NEW WRITE

Desde Foundation en adelante, **todo lo nuevo**:

### Tablas nuevas

```sql
project_uid  UUID NOT NULL REFERENCES projects(uid)   -- SIEMPRE, y como clave ajena real
account_uid  UUID NOT NULL REFERENCES accounts(uid)   -- desnormalizado a propósito: la
                                                       -- autorización no debe hacer un salto
model_code   TEXT                                      -- la dimensión de modelo, APARTE
```

**Nunca** una cadena compuesta como `1_CANAL`. Las dos dimensiones van en dos
columnas. `pgcrypto` ya está instalado y `file_nodes`/`file_versions` ya usan
`uuid DEFAULT gen_random_uuid()`: el patrón está probado en este esquema.

### Registros nuevos en tablas existentes

**Doble escritura durante la transición:** se sigue escribiendo el `model_urn`
heredado (para que nada se rompa) **y además** `project_uid`. Lo nuevo se lee por
`project_uid`; lo viejo se resuelve por `project_ref`.

Esto no es teoría: **ya existe la mitad**. `ensure_project_identity_columns()`
(`db.py:978`) añadió `project_id TEXT` a 11 tablas y `migrate_project_identity.py`
las rellenó. Su propio docstring dice el estado:

> *«No cambia el comportamiento en runtime (ninguna query lo lee todavía); es el
> cimiento del Pilar Identidad.»*

Verificado: ninguna consulta de autorización lee esa columna. **A1 está a medio
construir y dormido.**

### Relaciones nuevas

`(project_uid, src_type, src_uid, dst_type, dst_uid)`. Nunca una relación sin
obra.

### Objetos de almacenamiento nuevos

Hoy: `multi-tenant/{model_urn}/{ts}_{uuid8}_{fichero}` — y `model_urn` puede ser
`proyectos/{NOMBRE_EDITABLE}`. **La ruta física depende de un campo que el
usuario puede cambiar.**

Nuevo: `p/{project_uid}/{yyyy}/{version_uid}` — `project_uid` es inmutable.

Y la regla que ya se cumple y hay que **escribir para que no se pierda**: **la
ruta es opaca.** Ningún código deriva la obra de la ruta; la obra está en la
fila. Verificado en `perimetro_de_obra.py:232` — resuelve consultando
`file_nodes`, no analizando la cadena.

**Nada de esto reescribe un solo byte histórico.** Se aplica a lo nuevo.

### Vocabulario de nombres de columna — congelarlo

Hoy `project_id` significa tres cosas distintas según la tabla (`db.py:964-967`),
y conviven `app_project_id`, `acc_project_id`, `base_project_id`, `model_urn`,
`scope_urn`, `dataset_id`: **ocho nombres para la idea de «alcance»**.

| a partir de ahora | significa | prohibido |
|---|---|---|
| `project_uid` | la obra canónica | — |
| `account_uid` | la entidad | — |
| `model_code` | el modelo/frente | `app_project_id`, `scope_urn` |
| `external_ref` | id de un sistema ajeno (ACC…) | `acc_project_id` en tabla nueva |
| — | — | **`project_id` en tabla nueva** (está quemado) |

---

## 5 · Reevaluación de B1 y B3

El supuesto cambia: **múltiples participantes externos** (entidad, supervisión,
contratista, proyectista) en la misma obra.

### B1 — integridad referencial mínima → **al primer núcleo**

Ya no es higiene. Evidencia:

- `project_users` = `(project_id, user_id, assigned_at)`, **PK compuesta y ninguna
  clave ajena**, pese a que `ensure_users_tables` declara
  `REFERENCES projects(id) ON DELETE CASCADE`. La referencia **nunca se
  materializa**, ni en una instancia recién construida.
- Consecuencia con participantes externos: **borrar una obra no borra sus
  membresías.** Quedan filas huérfanas apuntando a un `project_id` que ya no
  existe. Si ese id se reutiliza —y `b.proj_{slug}_{t%100000}` **puede
  repetirse**— la membresía huérfana **revive sobre la obra nueva**. Un
  contratista de una obra cerrada aparece como miembro de una obra distinta.
- `projects.name` sin UNIQUE, con 4 duplicados ya presentes, y aliases derivados
  del nombre (§3).

**Veredicto: promover B1 de SHOULD a MUST.** Es barato hoy y no lo será nunca más.

### B3 — separación de admin → **al primer núcleo, y es más grande de lo que dije**

Escribí «separar el rol admin en instancia / entidad / obra». La inspección dice
que el problema es anterior:

```
project_users: project_id, user_id, assigned_at
```

**No hay columna `role`.** La pertenencia a una obra es **binaria**: se está o no
se está. Los roles viven solo en `users.role`, y son **globales a la instancia**:

```
users.role:  user 5 · editor 5 · viewer 4 · admin 3
```

Un `editor` es editor **en todas las obras a las que pertenece**. No existe
ninguna forma de expresar:

- supervisión que **lee todo pero no escribe**
- contratista que escribe **solo en su frente**
- proyectista con acceso a **una** obra de la entidad

Y el rol `admin` salta la comprobación entera en los dos guardianes:

```python
# auth_middleware.py:813
if user.get('role') != 'admin':

# perimetro_de_obra.py:262
if usuario.get('role') == 'admin':
    return None
```

**Veredicto: NEEDS DESIGN CHANGE, y promover a MUST.** Con un solo cliente y un
administrador no se nota. Con contratista y supervisión en la misma obra, la
única separación disponible es «dentro / fuera», y eso no describe una obra
pública.

---

## 6 · Reevaluación de B4 con IA en el primer producto comercial

Partiendo de la corrección 2: las cinco rutas **ya tienen guardia** y el guardia
documental es fail-closed. Lo que falta para que **ninguna operación pueda
empezar por `gcs_urn`/`nodeId`/`resource_id` sin Account + Project**:

### 6.1 · La caché de IA no tiene obra — **hay que cambiarla**

```
ia_documentos_preparados
  columnas:     gcs_urn, tipo, texto, imagenes, paginas, preparado
  restricción:  PRIMARY KEY (gcs_urn)
```

Guarda **el texto extraído de los documentos** con la ruta del objeto como única
clave. Consecuencias con IA comercial:

- No se puede **purgar la caché de una obra** al cerrarla o al exportarla.
- No se puede **auditar** qué documentos de qué entidad se procesaron.
- La retención de datos no es declarable por entidad: la caché no sabe de quién es.

**Cambio:** `(account_uid, project_uid)` NOT NULL, y la clave pasa a
`(project_uid, gcs_urn)`.

### 6.2 · `global_knowledge` — el riesgo más serio

```
ai_brain.global_knowledge   ->  columna: source_project_id
ai_brain.feedback_buffer    ->  columna: model_urn
```

Una tabla llamada *conocimiento global* con una columna *proyecto de origen*.
Si la escritura de una obra alimenta lecturas de otra, eso es **fuga de
conocimiento entre entidades** — no de bytes, pero de contenido, y en obra
pública el contenido es el expediente.

**No lo pude verificar**: el usuario de aplicación **no tiene permiso sobre el
esquema `ai_brain`** (`InsufficientPrivilege: permiso denegado al esquema
ai_brain`). Eso es, en sí mismo, una buena noticia —hay separación de privilegios
a nivel de esquema— pero deja la pregunta abierta.

**Queda como punto abierto y bloqueante para comercializar IA:** hay que leer el
camino de lectura de `global_knowledge` y demostrar que filtra por obra, o
cerrarlo.

### 6.3 · `universal-search` cae por defecto en una obra concreta

```python
# routes/ai.py:667
model_urn = data.get('model_urn') or "1"
```

`"1"` es el `projects.id` de **PQT8_TALARA**, la obra real de esta instalación,
escrito en el código fuente. Si el cliente no manda alcance, la búsqueda se
dirige a esa obra.

No es una fuga —`guardia_de_obra("1", …)` deniega a quien no sea miembro— pero:
en una instancia nueva **no existe ninguna obra `1`**, y un usuario que pertenezca
a varias obras y omita el alcance busca en la equivocada.

**Cambio:** sin alcance explícito, **400**. Nunca un valor por defecto.

### 6.4 · Las funciones internas siguen aceptando rutas sueltas

```python
# routes/ai.py:208
def _download_pdf(full_path: str, bucket_name: str) -> bytes:
```

Está guardada aguas arriba, pero la firma permite que un futuro llamador la use
sin guardia. **Cambio:** que reciba un descriptor ya autorizado
`(project_uid, node_id)` y resuelva la ruta por dentro, en lugar de recibir la
ruta.

### 6.5 · El almacén de búsqueda vectorial — punto abierto

`universal_search` consulta Vertex AI Search. **No he verificado si el
*datastore* está particionado por obra o si el filtrado ocurre solo en la
consulta.** Si es lo segundo, un fallo en la construcción del filtro devuelve
documentos de otras obras.

**Bloqueante para comercializar IA hasta demostrarlo.**

### Veredicto de §6

Con IA en el primer producto: **NEEDS DESIGN CHANGE**, con dos puntos abiertos
(6.2 y 6.5) que hay que cerrar **antes** de vender IA, no después.

---

# VEREDICTO

| | | |
|---|---|---|
| **A1** · Canonizar el identificador de obra | **NEEDS DESIGN CHANGE** | `project_alias(alias TEXT PK)` es insuficiente: confunde 5 tipos de alias, y los derivados del nombre ya colisionan hoy (`proyectos/HOSPITAL_MATUCANA` → una de 4 obras, arbitrariamente; `projects.name` sin UNIQUE). Son **7** vocabularios, no 4. Hace falta `project_uid` UUID inmutable + `project_ref(account_uid, kind, alias)`. **Atenuante:** `db.py:978` + `migrate_project_identity.py` ya construyeron y rellenaron la columna; está dormida. |
| **A2** · Encender `ENFORCE_PROJECT_AUTHZ` | **NEEDS DESIGN CHANGE** | No es un interruptor. Bajo ENFORCE el guardián es **fail-closed** (`auth_middleware.py:834`, `403 PROJECT_UNRESOLVED`). Y `dataset_id` **no está en `_CLAVES_OBRA`** (`auth_middleware.py:413`) ni resuelve → todo `/api/lob`, que **sí** está en `_PROJECT_SCOPED_PREFIXES:635`, daría 403 a cada no administrador. Igual `global` y los ids de ACC. Además: **14 no administradores activos y solo 5 con membresía** → 9 quedarían fuera de todo. Precondiciones: resolver `dataset_id`, decidir `global`, y sembrar membresías. |
| **B1** · Integridad referencial mínima | **CONFIRMED** — y **promover a MUST** | `project_users` sin ninguna clave ajena pese a declararla (`ensure_users_tables`), ni en instancia nueva. Con ids reutilizables (`{t%100000}`), una membresía huérfana **revive** sobre una obra distinta. Con participantes externos eso es acceso indebido, no desorden. |
| **B2** · Account tipado sobre `hubs` | **CONFIRMED** | `hubs` **es nuestro Account nativo**: se acuña en `routes/projects.py:218`; el `b.` es mimetismo, no dependencia. Las rutas APS (`server.py:712-750`) son proxies que no escriben. El Account canónico no dependerá de Autodesk porque hoy tampoco depende. Dos enmiendas: acuñar `account_uid` UUID propio, y arreglar el `ON CONFLICT DO NOTHING` que devuelve **201** aliasando al Account ajeno (`routes/projects.py:221-227`). |
| **B3** · Separar admin sistema/entidad/obra | **NEEDS DESIGN CHANGE** — y **promover a MUST** | Más grande de lo que dije: **`project_users` no tiene columna `role`**. La pertenencia es binaria y los roles son globales (`users.role`). No hay forma de expresar supervisión de solo lectura ni contratista limitado a su frente. Y `admin` salta ambos guardianes (`auth_middleware.py:813`, `perimetro_de_obra.py:262`). |
| **B4** · Frontera de IA | **NEEDS DESIGN CHANGE** | Corrijo el informe 17: las 5 rutas **sí** tienen guardia y el documental es fail-closed. Lo que falta: `ia_documentos_preparados` con PK `gcs_urn` y **sin obra** (no se puede purgar ni auditar por entidad); `universal_search` con **`or "1"`** en el código (`routes/ai.py:667`); `_download_pdf` aceptando rutas sueltas. **Dos puntos abiertos y bloqueantes antes de vender IA:** el camino de lectura de `ai_brain.global_knowledge` (no verificable: el usuario de aplicación no tiene permiso sobre el esquema) y la partición del datastore de Vertex AI Search. |

---

**No se ha implementado nada.**
