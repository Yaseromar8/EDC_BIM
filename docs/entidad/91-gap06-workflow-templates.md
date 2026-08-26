# 91 · GAP 06 · PLANTILLAS DE FLUJO DE REVISIÓN

**Fecha:** 25-ago-2026 · **Benchmark:** `docs/82 §4.6` (congelado)
**Veredicto:** **ARQ ✅ · OP ✅ · EXP ✅ → COMPLETE**

---

## 1 · LA SEPARACIÓN QUE GOBIERNA EL OBJETO

```
    PLANTILLA  ──aplicar──▶  REVISIÓN        SÍ
    PLANTILLA  ──gobierna─▶  REVISIÓN        NUNCA
```

Cambiar una plantilla no toca una revisión iniciada ni una cerrada. Si la
gobernara en vivo, editar el molde reescribiría retroactivamente procesos ya
firmados — que en obra pública significa cambiar quién tenía que aprobar algo
**después** de que se aprobara.

## 2 · NO ES UN MOTOR DE REVISIÓN NUEVO

`doc_reviews.steps` **ya era** un snapshot: cada revisión guarda sus pasos en su
propia fila y `flujo_de_revision` los resuelve. Lo que faltaba no era el
snapshot — era **de dónde salen** esos pasos. La plantilla los produce y
desaparece.

La expansión vive **dentro** de `POST /api/reviews`, antes de las guardias, no
en una ruta paralela. Los pasos que salen del molde pasan por las mismas
comprobaciones que los escritos a mano: independencia autor/revisor, permiso
sobre los documentos, idoneidad, revisor miembro. Hay una prueba que comprueba
el **orden**, no solo la presencia.

## 3 · LO QUE GARANTIZA LA INVARIANTE

- El manejador que modifica el molde toca `doc_review_plantillas` y **nada más**:
  no hay una sola sentencia que escriba en `doc_reviews`, y una prueba lo
  comprueba sobre el código.
- **No hay clave foránea viva** de la revisión a la plantilla. `plantilla_id` es
  un número suelto a propósito: con una FK, borrar o editar el molde arrastraría
  procesos firmados.
- La revisión guarda **nombre y versión aplicados**, no solo el id. «Plantilla 4»
  dejaría de decir nada el día que esa plantilla se renombre.

## 4 · EL SUJETO DE UN PASO

```
    user_id   una PERSONA.  Solo en plantillas de OBRA: una persona concreta no
                            significa nada en otra obra.
    funcion   una FUNCIÓN contractual, resuelta AL APLICAR contra los miembros
                            de esa obra. Es lo que hace que una plantilla de
                            ENTIDAD sirva en veinte obras.
```

Se lee de `project_companies`, donde la función ya vive: no se creó una segunda
tabla ni una segunda fuente de autoridad. Con **varios candidatos no elige**:
devuelve las opciones. Elegir «el primero» sería repartir responsabilidad
contractual por orden alfabético.

**Autoridad reutilizada:** `guardia_administrativa` para plantillas de obra;
facultad `gestionar_perfiles` para las de entidad — que es literalmente «crear y
editar los perfiles reutilizables; aplicarlos sigue siendo un acto de cada obra».

## 5 · LO QUE **NO** SE ADOPTA, Y SE DICE

**Pasos en paralelo.** El motor es estrictamente secuencial. Adoptarlo no es un
campo más: es otro motor — estado por rama, regla de confluencia, redefinición
de «a quién le toca». El benchmark lo lista como «secuencial/paralelo **si se
adopta**»; aquí no se adopta, y el catálogo lo publica (`paralelo: false`) en vez
de callarlo.

---

## 6 · LO QUE LA EXP ENCONTRÓ

**La procedencia se guardaba y la API no la devolvía.** `doc_reviews` almacenaba
correctamente de qué plantilla, con qué nombre y en qué versión nació cada
revisión —comprobado en la base— pero `_row_to_dict` no incluía esas columnas.
La revisión sabía su procedencia y ninguna pantalla podía enseñarla.

Es la misma clase de capacidad muerta que «existe en el backend no cuenta como
implementado», un nivel más abajo: **existe en la base y no llega a salir**.
Corregido ampliando las tres consultas que alimentan el mapeo —ampliar solo el
mapeo habría leído fuera de la fila— con su prueba.

---

## 7 · LA EXP, CONTRA PRODUCCIÓN

### 7.1 · La prueba central

```
    R1 con C v1          →  2 pasos, procedencia v1
    ADMIN modifica C     →  v2, 3 pasos
    R1 SIGUE IGUAL       →  2 pasos, procedencia v1     ← la invariante
    R2 con C             →  3 pasos, procedencia v2
```

Verificado después contra el servicio desplegado, ya con la procedencia visible:

| | plantilla | versión | pasos | estado |
|---|---|---|---|---|
| R1 | Flujo EXP snapshot v2 | **1** | **2** | pending |
| R2 | Flujo EXP snapshot v2 | **2** | **3** | approved |

El molde va por la v2 con 3 pasos. R1 sigue en la 1.

### 7.2 · El historial del molde

```
    created    v1   qa.manager
    modified   v2   qa.manager   «Se añade el visto bueno del residente»
    disabled   —    qa.manager
```

### 7.3 · El flujo, con identidades distintas

`25 → 23 → 24`, `approved`. El admin fue **rechazado (403)** en el paso que no le
tocaba.

### 7.4 · Negativas

| caso | resultado |
|---|---|
| un miembro define un flujo de obra | 403 |
| un ajeno define un flujo | 403 `PROJECT_FORBIDDEN` |
| plantilla sin pasos | 400 `PASOS_INVALIDOS` |
| paso que no designa a nadie | 400 `PASOS_INVALIDOS` |
| paso sin tipo de decisión | 400 `PASOS_INVALIDOS` |
| persona **y** función a la vez | 400 `PASOS_INVALIDOS` |
| revisor que no es miembro | 409 `REVISOR_NO_MIEMBRO` |
| plantilla de **entidad** con una persona | 400 `PASOS_INVALIDOS` |
| nombre duplicado en la obra | 409 |
| un miembro deshabilita | 403 |
| abrir revisión con plantilla **deshabilitada** | 409 `PLANTILLA_DESACTIVADA` |
| perímetro del ajeno (5 rutas) | 403 en las cinco |

**Deshabilitar no cancela nada:** R1 siguió en `pending` con sus 2 pasos.

### 7.5 · La pantalla

Verificada por clic en el portal desplegado. Enseña nombres resueltos, versión,
tipo de decisión, plazo por paso, el distintivo `DESHABILITADO`, y —lo que más
importa— **a cuántas revisiones se aplicó cada flujo**, que es el dato que hace
visible que editarlo no las cambia.

---

## 8 · LO QUE **NO** SE PUDO EJECUTAR, DECLARADO

### 8.1 · Plantilla de otra obra

```
    CROSS-PROJECT TEMPLATE
    unit / integration   ✅
    PROD EXP             NO EJECUTABLE CON FIXTURE ACTUAL
```

Las identidades de QA pertenecen a una sola obra. Ejecutarlo exigiría fabricar
acceso cross-project artificialmente, y eso no probaría el producto: probaría el
fixture. El perímetro project-scoped **sí** está probado (403 en las cinco rutas
para un ajeno) y no hay indicio de bypass.

### 8.2 · El clic de *aplicar* una plantilla

```
    APLICAR PLANTILLA DESDE LA PANTALLA
    código + tripwire    ✅
    API EXP              ✅
    UI EXP               NO EJECUTABLE CON FIXTURE ACTUAL
```

El modal de revisión se abre seleccionando documentos en **Archivos**, y para la
obra piloto esa pantalla enseña un árbol vacío — ver §9. No es que no se haya
intentado: está bloqueado por una inconsistencia de datos ajena a este gap.

---

## 9 · ESCALADO · EL EXPEDIENTE PARTIDO EN DOS ÁRBOLES

Lo que en el doc 89 quedó como hallazgo lateral **ahora bloquea una verificación**,
así que se mide y se sube a decisión.

`useFileExplorer.js:18` deriva la ruta del expediente del **nombre** de la obra:

```js
const projectPrefix = `proyectos/${project.name.replace(/ /g, '_')}`;
```

Medido en producción, nodos por obra según dónde vivan:

| obra | canónico | derivado | |
|---|---|---|---|
| PQT8_TALARA (`id=1`) | 0 | **118** | solo derivado |
| Proyectos Generales | 0 | **5** | solo derivado |
| HOSPITAL_MATUCANA ×4 | **8** c/u | 0 | solo canónico |
| PQT8_INTERFERENCIAS | 8 | **2 481** | **las dos** |
| PILOTO EXTERNO 2026 | **11** | 1 | **las dos** |
| ZZ PRUEBA VENTANA | 8 | 4 | **las dos** |
| obra pirata | 8 | 1 | **las dos** |

Las obras antiguas viven **solo** en la ruta derivada; las creadas después se
siembran en la **canónica**. Cuatro tienen las dos.

**Cambiar el explorador a la canónica rompería PQT8_TALARA y Proyectos
Generales**, que no tienen nada ahí. Por eso no se ha tocado.

Tres salidas, y la elección es del propietario porque afecta a expedientes
reales:

1. **Que el explorador acepte las dos** y una los resultados. No migra datos;
   cambia el comportamiento para todos.
2. **Migrar los nodos** a una sola convención. Toca expedientes reales — 2 481
   nodos solo en PQT8_INTERFERENCIAS.
3. **Corregir la siembra** de obras nuevas para que use la derivada, y migrar
   solo las cuatro partidas.

Recomendación: **(3)**, porque es la que toca menos historia — pero es una
decisión de datos, no de código.

---

## 10 · VEREDICTO

**GAP 06 · WORKFLOW TEMPLATES — ARQ ✅ · OP ✅ · EXP ✅ → COMPLETE**

Con dos declaraciones expresas: la negativa cross-project y el clic de aplicar,
ambas **no ejecutables con el fixture actual** y ninguna con indicio de bypass.

**1290 pruebas en verde** (27 nuevas). Migración 19 en producción: tabla creada,
3 columnas de procedencia, 0 revisiones tocadas, sin FK viva, las cuatro
restricciones muerden, idempotente.
