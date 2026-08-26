# 89 · GAP 02 · CORRECCIÓN DE EXPERIENCIA, NO UN GAP NUEVO

**Fecha:** 25-ago-2026
**Origen:** inconsistencia del mapa señalada por el propietario.
**Veredicto:** **GAP 02 · ARQ ✅ · OP ✅ · EXP ✅ — restaurado**

---

## 1 · LA PREGUNTA, Y LA RESPUESTA MEDIDA

> ¿Puede hoy un usuario real emitir una nueva revisión de un plano
> completamente desde la interfaz?

**NO.** Medido, no supuesto. La pantalla hacía **5 llamadas y solo una
escribía** —crear la identidad del plano—. El backend ofrecía 5 rutas de
escritura:

| ruta de escritura | ¿la llamaba la pantalla? |
|---|---|
| `POST /api/planos` — crear la identidad | ✅ |
| `POST /<pid>/revisiones` — **emitir revisión** | ❌ |
| `POST /leer-cajetin` — OCR del cajetín | ❌ |
| `POST /sets` — crear la emisión | ❌ |
| `POST /revisiones/<rid>/anclajes` — clavar un registro | ❌ |

Un usuario real no podía responder desde la pantalla la única pregunta que este
objeto existe para responder —**cuál es la lámina vigente en obra**— y sin
embargo el gap figuraba COMPLETE.

> **Una EXP por API demuestra que el backend funciona.**
> **No demuestra que la capacidad exista para una persona.**

Se declaró COMPLETE porque su EXP se ejecutó con un script contra la API. Eso es
exactamente lo que el propietario señaló.

---

## 2 · TRES FALLOS QUE SOLO APARECIERON CONDUCIENDO LA INTERFAZ

Ninguno de los tres lo habría encontrado la suite ni una EXP por API.

### 2.1 · El selector deducía la ruta del NOMBRE de la obra

`SelectorDeDocumento` construía `proyectos/<NOMBRE_CON_GUIONES>`, copiado de
`IssueModule`. Los documentos de la obra piloto viven bajo su id canónico
`b.proj_…`, así que el selector **salía vacío**: cero carpetas y cero ficheros.

El botón ya estaba y emitir seguía siendo imposible. Una ruta deducida del
nombre solo acierta cuando el nombre coincide con la carpeta, que es una
coincidencia y no una regla. Ahora usa `project.model_urn`.

### 2.2 · El panel se quedaba en «Cargando…» para siempre

Tras emitir yo borraba la caché de revisiones para forzar la recarga, pero nadie
volvía a pedirlas. Separadas las dos cosas: `verRevisiones` usa la caché al
abrir y cerrar; `traerRevisiones` pide siempre y es la que corre tras emitir.

### 2.3 · Un módulo inventado había matado el OCR de GAP 05

`routes/specs.py` hacía `from storage import get_blob_data`. **Ese módulo no
existe.** El `except` lo convertía en un error educado y la lectura del
encabezado estaba muerta — el mismo fallo que ya había matado la lectura de
cajetín en GAP 02, por el mismo camino.

Además llamaba a `get_blob_data` con el id del nodo en vez del `gcs_urn` de su
versión.

---

## 3 · LA EXP, POR LA RUTA UI REAL

Ejecutada contra `visor-ecd-portal.onrender.com` con la sesión de **QA Revisor
Técnico (id 25)**, sin teclear ninguna contraseña en ningún formulario: la
sesión se obtuvo por la API y se inyectó en `localStorage`, que es lo que la
propia aplicación guarda al entrar.

```
    Planos → PL-EST-104 (rev B vigente, 2 revisiones)
           → «Emitir revisión»
           → selector del expediente → 02_Planos_Aprobados
           → PL-EST-104_revB.pdf
           → el cajetín se lee y SUGIERE «B»
```

### La negativa salió sola

El cajetín sugirió **B**, que ya existía. Pulsando Emitir tal cual:

```
    POST /api/planos/1/revisiones → 409
    {"code":"REVISION_DUPLICADA","error":"La revisión B de PL-EST-104 ya existe."}
```

### Y después el camino bueno

Dejando la revisión en blanco —serie automática— y escribiendo el motivo:

```
    rev C · vigente        3 revisiones
```

Comprobado en la base, que es la autoridad:

| rev | estado | emitida_por | superada_por | motivo |
|---|---|---|---|---|
| A | Superada | 23 | 2 | Emisión para construcción |
| B | **Superada** | 23 | **3** | Cambio de armadura eje 4 |
| C | **Vigente** | **25** | — | Ajuste de armadura en el eje 4 tras la consulta RFI-002 |

`vigentes: 1`. La emitió el usuario que condujo la pantalla, la anterior quedó
superada apuntando a la nueva, y el motivo quedó escrito.

### Negativas restantes

| caso | resultado |
|---|---|
| documento de **otra obra** | 409 `OTRA_OBRA` |
| documento que no existe | 404 |
| revisión sin documento | 400 |
| revisión duplicada (explícita) | 409 `REVISION_DUPLICADA` |
| **usuario fuera de obra** emite revisión | 403 `PROJECT_FORBIDDEN` |
| usuario fuera de obra crea plano | 403 |
| usuario fuera de obra crea emisión | 403 |

«Documento de otra obra» **no se puede producir desde la interfaz** —el selector
solo enseña el expediente de esta obra— y por eso se comprobó contra el
servidor: la defensa no puede depender de que la pantalla no ofrezca el camino.

---

## 4 · LA AUTORIDAD DE EMISIÓN — CORREGIDA EL MISMO DÍA

Al hacer la EXP se descubrió que **«usuario sin autoridad» no existía como
negativa**: `guardia_de_recurso` es de pertenencia, así que cualquier miembro
podía emitir. Se reportó sin inventar la restricción, el propietario ordenó
cerrarlo, y se cerró.

### La autoridad ya existía; faltaba usarla

No se inventó ningún permiso. La escalera documental de seis niveles
(`none → viewer → view_download → view_markup → edit → admin`),
`check_folder_permission` que la aplica y `funcion_de` —que deriva la función
contractual de la empresa— llevaban ahí desde antes.

### Tres capas, y ninguna sobra

| capa | quién la resuelve | pregunta |
|---|---|---|
| Aislamiento de obra | `guardia_de_recurso` | ¿es de tu obra? |
| Permiso de recurso | `check_folder_permission` nivel `edit` | ¿puedes con **este** documento? |
| Autorización de flujo | admin de obra **o** función emisora | ¿te toca **decidir**? |

Solo con la segunda, un contratista con `edit` sobre su carpeta declararía
vigente lo que quisiera. Solo con la tercera, un administrador publicaría a
ciegas un documento que ni puede abrir. Por eso el permiso sobre el documento se
comprueba **primero, también al admin**.

**Quién emite:** `ENTIDAD` y `PROYECTISTA`. En obra pública la lámina la produce
el proyectista y la emite la entidad; la supervisión revisa y el contratista
construye contra lo emitido. Que cualquiera de esos dos decidiera qué versión
vale invertiría la cadena contractual.

Se aplicó **también a especificaciones** —el mismo acto, la misma autoridad— y a
crear una sección **con** documento, que emite su primera revisión: dejar esa vía
abierta habría sido la puerta de atrás del mismo acto.

### La EXP mínima, contra producción

El fixture sirvió tal cual, sin fabricar nada: 23 y 25 no son admin ni tienen
función; 24 administra la obra.

| caso | resultado |
|---|---|
| miembro ordinario (23) emite plano | **403** `SIN_AUTORIDAD_DE_EMISION` |
| miembro ordinario (25) emite plano | **403** `SIN_AUTORIDAD_DE_EMISION` |
| miembro ordinario emite especificación | **403** `SIN_AUTORIDAD_DE_EMISION` |
| miembro crea sección **con** documento (la puerta de atrás) | **403** `SIN_AUTORIDAD_DE_EMISION` |
| administrador de obra emite | **201** · rev **D** vigente, supera a la C |
| revisión duplicada | 409 `REVISION_DUPLICADA` |
| documento de otra obra | 409 `OTRA_OBRA` |
| ajeno a la obra | 403 `PROJECT_FORBIDDEN` |

**Y lo que el miembro ordinario sigue pudiendo hacer**, porque son actos
distintos: ver los planos (200), ver sus revisiones (200), ver las
especificaciones (200) y **crear la identidad de un plano** (201). Crear la
identidad no declara qué vale.

La historia del plano lo dice de un vistazo:

```
    rev A   Superada   emitida por 23     ← hoy sería DENY
    rev B   Superada   emitida por 23     ← hoy sería DENY
    rev C   Superada   emitida por 25     ← hoy sería DENY
    rev D   Vigente    emitida por 24     ← administrador de obra
```

`vigentes: 1`.

**GAP 02 · autorización de emisión — ✅ CORREGIDA.**

---

## 5 · LOS DOS TRIPWIRES QUE IMPIDEN LA REINCIDENCIA

Las dos clases de fallo ya habían mordido dos veces cada una.

### `test_capacidades_sin_pantalla`

Para las 5 herramientas del CDE, cada ruta que **escribe** tiene que ser llamada
por algún fichero del portal. Medido hoy: **27 de 28**. La única sin camino es
el anclaje sobre un punto del PDF, declarada con su motivo — exige interacción
de visor, no de formulario.

### `test_imports_inventados`

Mira **todos** los manejadores, distingue «no existe» de «es de terceros» con
`find_spec`, y usa AST: la primera versión con expresión regular daba 15 falsos
positivos por los alias `import x as y` y se saltaba en silencio los imports
entre paréntesis. Un detector con huecos es peor que no tenerlo.

---

## 6 · HALLAZGO APARTE, QUE NO SE TOCA

`useFileExplorer.js:18` deriva la ruta del expediente del **nombre** de la obra:

```js
const projectPrefix = `proyectos/${project.name.replace(/ /g, '_')}`;
```

Para la obra piloto eso apunta a un árbol vestigial con **0 elementos**, mientras
el expediente real —6 carpetas sembradas— vive bajo el id canónico. La pantalla
**Archivos** enseña una obra vacía que no lo está.

Las obras antiguas (`proyectos/PQT8_TALARA`, `proyectos/PQT8_INTERFERENCIAS`)
usan la forma derivada; la piloto se sembró con el id canónico. Es una decisión
de datos —migrar los nodos o hacer que el explorador acepte las dos formas— y
pertenece al propietario, no a este gap.

---

## 7 · VEREDICTO

**GAP 02 · PLANOS COMO OBJETO — ARQ ✅ · OP ✅ · EXP ✅**

La EXP ya no es por API: es por la pantalla, con un usuario real, y con la base
confirmando el resultado.

**GAP 05 · la evidencia que quedaba pendiente, COMPLETA.** Apareció de forma
natural un documento de otra obra (`proyectos/PQT8_TALARA`) durante estas
negativas, y se ejecutó lo que faltaba:

```
    revisión de sección con documento de otra obra  →  409 OTRA_OBRA
    leer encabezado de documento de otra obra       →  409 OTRA_OBRA
```

Ya no queda `PROD EXP ❌` en GAP 05.
