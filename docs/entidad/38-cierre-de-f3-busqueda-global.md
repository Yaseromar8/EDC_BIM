# CIERRE DE F3 — BÚSQUEDA GLOBAL

**21-ago-2026** · Última de las cuatro piezas del [mapa de cierre](33-mapa-de-cierre-de-frontend-docs.md)
Incluye la corrección previa de **higiene de tests**.

---

# PARTE 1 · HIGIENE DE TESTS

## El hallazgo

Ejecutar `pytest` desde la raíz insertaba una fila en `photo_evidences` de la
base **real**. No fue una prueba portándose mal: en la raíz hay **~28 ficheros
`test_*.py` que no son pruebas, sino guiones de diagnóstico** cuyo cuerpo se
ejecuta **al importarse**. `test_tracking.py` carga el `.env` real y hace un
`INSERT` sobre el alcance real `1_CANAL`. **Recolectarlo basta** — la ejecución
ni siquiera llegó a empezar, porque abortó con errores de recolección.

## La corrección: dos puertas, y ninguna sobra

| | |
|---|---|
| **`pytest.ini`** | `testpaths = backend/tests`. `pytest` a secas mira **solo la suite oficial** |
| **`conftest.py` (raíz)** | `collect_ignore_glob` aparta los guiones **en silencio**, para que la suite siga corriendo. Y si alguien **nombra uno expresamente**, se le explica por qué no: callar diría «no tests ran» y no sabría que acaba de esquivar un `INSERT` |
| **`backend/tests/conftest.py`** | **Fail closed**: si `DB_NAME` no identifica una base de prueba, abrir la base **revienta** con un mensaje claro |

### Dónde vive cada puerta, y por qué ahí

La primera versión puso el candado de base en el `conftest.py` de la raíz. **No
se ejecutaba nunca**: cuando el objetivo es `backend/tests` —que es como se
lanza la suite— pytest no carga ese fichero. Se comprobó, falló, y por eso el
candado está en el conftest de la suite.

### Y se parchea el DRIVER, no `db`

La segunda versión sustituía `db.get_db_connection`. `test_aislamiento_por_obra`
hace `importlib.reload(db)`: **el módulo volvía a nacer con las funciones
originales y el candado desaparecía a mitad de la suite** — sin que nadie se
enterara, porque el candado seguía «puesto» en el fichero. Lo encontró la propia
prueba guardiana. Ahora se parchea `psycopg2.connect`, por donde pasa todo
—incluido el pool— y que ningún `reload` nuestro restaura.

## Cómo se ejecuta una prueba de integración

Apuntando `DB_NAME` a una base **identificada como de prueba** (que contenga
`test`, `ensayo` o `prueba`). Los ensayos de `backend/herramientas/` no pasan por
aquí —no son pytest— y ya corren contra un clúster desechable.

## Verificado

- `pytest` desde la raíz → **881 recolectadas, solo la suite oficial**.
- `pytest test_tracking.py` → **rechazado** con su motivo.
- Tras ambos intentos, `photo_evidences` sigue en **0 filas**.
- **5 pruebas guardianas nuevas** que comprueban el **efecto**, no que exista una
  función con buen nombre: se intenta abrir la base de verdad y tiene que
  reventar.

**Los 28 guiones no se han tocado.** Quedan protegidos, y su reclasificación es
una tarea aparte ya señalada (junto con `test_ingestor.py`, import roto, y
`backend/test_filter.py`, que pide un servidor vivo).

---

# PARTE 2 · BÚSQUEDA GLOBAL

## Lo que había: una excepción de seguridad para una ruta inexistente

`/api/docs/global-search` estaba **declarada como excepción** en
`auth_middleware.py:533` —con su motivo escrito— y **no existía en ningún
blueprint**. Una excepción para una ruta que no existe no protege nada y además
engaña a quien lee la lista.

Ahora existe, exige `model_urn` y busca en **una sola obra** — así que **sale de
la lista**, que según su propio comentario «solo puede ENCOGER».

## Comportamiento

Busca en **toda la obra** por `name` (donde vive el código documental), `tags` y
`metadata`. Devuelve, por cada resultado: **ruta** (`PQT8 / Planos / Drenaje`),
estado, **versión vigente**, fecha, y lo necesario para abrirlo con
`useDocPreview` — el mismo camino que ya usan RFI y Red Line.

- **Menos de dos caracteres**: no devuelve media obra, lo dice.
- **El texto del usuario no es un patrón**: buscar `100%` encuentra el que dice
  100%, y `DRE_PL` **no** casa con `DRE-PL`. Sin escapar, `_` y `%` son
  comodines y el usuario escribe texto, no un patrón.
- **La papelera no se busca**.
- Cada búsqueda **lleva número**: si vuelve una vieja después de una nueva, se
  descarta.

## Seguridad — el permiso se resuelve DENTRO de la consulta

`get_effective_permission` sube por el árbol haciendo **una consulta por salto**.
Llamarla por resultado sería lento, pero sobre todo **frágil**: el filtro viviría
fuera de la consulta y quien escriba la siguiente pantalla podría olvidarlo. Es
la lección de `encargos._MI_TRABAJO`, donde la pertenencia es un `JOIN`.

Aquí una **CTE recursiva** recorre la cadena de ancestros **una vez**, y de ella
salen las dos cosas que hacen falta: el permiso heredado más cercano y la ruta.

| prueba | resultado |
|---|---|
| **1. No cruza la obra** | El residente de A encuentra **solo el suyo**, no el homónimo de B. Alguien de B recibe **403** al buscar en A |
| **2. Sin permiso no se descubre** | Ni el nombre, ni la carpeta, ni los metadatos, **ni que exista**. Y **el contador cuenta lo que se ve**: un «12» enseñando 3 ya sería una filtración |
| **Ciego por defecto** | Un miembro `user` sin permiso explícito no ve **nada** — ISO 19650 |
| **3. El administrador** | Ve la carpeta reservada **de esa obra**. Administrador no es «todo a la vez»: en B ve solo B |
| **5. Legacy y nuevos** | El nuevo trae `version_id` y **v3**; el heredado **no inventa versión** — abre el nodo vivo, como siempre |

## Rendimiento observado, e índices

Medido en clúster propio, **5.008 documentos** en la obra, mediana de 5 pasadas:

| búsqueda | sin índice de texto | con índice trigrama |
|---|---|---|
| `EST-PL-04242` (código) | **8 ms** | 8 ms |
| `Estructura` (nombre) | **35 ms** | 34 ms |
| `ESTRUCTURAS` (metadatos) | **68 ms** | 64 ms |

> **No se añade ningún índice.** El trigrama da un **7 %** de diferencia porque
> el coste dominante no es casar el nombre —eso ya lo acota
> `idx_file_nodes_model_urn`, parcial sobre `is_deleted = false`— sino recorrer
> `metadata::text` y la CTE de ancestros. **Añadir un índice que no mejora nada
> es deuda con aspecto de mejora.** El ensayo lo crea sólo para medir y lo
> retira; si un día la obra crece hasta que duela, la medición ya está escrita.

**Índice aprovechado:** `idx_file_nodes_model_urn` (existente).
**Índices añadidos:** ninguno. **Extensiones:** ninguna.

## Interfaz

**Buscar** encabeza el bloque «Obra» de la barra lateral — es lo que se hace
cuando **no** se sabe en qué carpeta está algo; el filtro de la barra de archivos
sólo mira la carpeta abierta, que es otra cosa. Sin dependencia de
`frontend-react`. Fragmento propio, carga perezosa.

*Verificado en el navegador: resultados con ruta, estado y versión —v3 frente a
«versión actual» en el heredado—, y el caso sin resultados. Sin errores de
consola.*

Cuando no hay nada, se dice también la otra posibilidad **sin revelar nada**:
que el documento exista y no se pueda ver es indistinguible de que no exista, y
así debe ser — pero quien busca merece saber que esa puerta existe.

## Un defecto que cazó el propio proyecto

La primera versión de la pantalla **se inventó los colores de estado**. Lo
detuvo `test_ningun_modulo_se_inventa_el_color_de_un_estado`: el mismo estado se
habría visto de un color en Archivos y de otro en Buscar. Ahora usa `Ficha`, el
vocabulario común.

---

## Pruebas

| | resultado |
|---|---|
| **Suite completa** | **881 pasan · 0 fallan** (876 + 5 de higiene) |
| **Ensayo de búsqueda** *(nuevo)* | **22 / 22** |
| Participantes · Red Line · Desacople | **33/33** · **58/58** · **22/22** |
| RFI · Revisiones · Encargos · Dos obras | **49/49** · **50/50** · **31/31** · **16/16** |
| **Invariantes vs. cierre de F4** | **0 diferencias** |
| Build · fragmento propio | correcto · `BusquedaGlobalModule-*.js` |

---

## Lo que deliberadamente NO se construyó

Elasticsearch/OpenSearch · embeddings · búsqueda semántica · índice externo ·
búsqueda 3D · modelos · 4D/LOB · ninguna tabla nueva · ningún índice nuevo.

**1 ruta · 1 módulo de dominio · 1 pantalla · 1 excepción de seguridad
retirada.**

---

## Deuda declarada

1. **Se busca sobre `metadata::text`**, no sobre claves concretas. Es lo que
   permite encontrar por disciplina sin saber cómo se llama el campo, pero
   también es lo más caro de la consulta. Si un día duele, ahí está la medición.
2. **Tope de 200 resultados** y 50 por defecto. Una búsqueda no es una
   exportación del expediente; cuando se recorta, se dice.
3. **No hay resaltado del término** ni ordenación por relevancia: se ordena por
   fecha de actualización. Con 68 ms y una obra real, ordenar por relevancia
   habría sido adivinar qué es relevante.

---

**STOP.** No hago todavía el ensayo final del expediente. No se tocó
`frontend-react`, 3D, 4D, LOB ni Issues.
