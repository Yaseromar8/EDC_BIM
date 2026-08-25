# 88 · GAP 05 · LA ESPECIFICACIÓN COMO OBJETO

**Fecha:** 25-ago-2026 · **Benchmark:** `docs/82 §4.5` (congelado)
**Veredicto:** **COMPLETE**

---

## 1 · LA PREGUNTA QUE EL OBJETO RESPONDE

> ¿QUÉ EXIGE EL PROYECTO PARA ESTO, Y EN QUÉ REVISIÓN LO EXIGE?

Hasta hoy las especificaciones eran PDF sueltos dentro del expediente. Eso basta
para guardarlas y no basta para lo único que se les pide en obra: que un
submittal diga **contra qué** se aprueba un material, y que ese «contra qué»
siga siendo citable cuando la especificación se revise.

El benchmark pedía cuatro cosas, y las cuatro están: **divisiones y secciones**,
**OCR al subir**, **sets con revisiones**, y **generar submittals desde la
sección**.

---

## 2 · LA DECISIÓN DE ARQUITECTURA: UN SOLO MOTOR DE REVISIÓN

Planos (GAP 02) y especificaciones revisan igual:

```
    una IDENTIDAD estable          el número de plano / el número de sección
    varias REVISIONES sobre ella   A, B, C…  o  00, 01, 02…
    UNA SOLA VIGENTE               índice único parcial, en la BASE
    la nueva SUPERA a la anterior  en la misma transacción, o ninguna
```

Escribirlo dos veces era la opción obvia y la equivocada. Este producto ya pagó
ese error en el frontend —`IssueModule` nació de fusionar 1.387 líneas idénticas
entre RFI y Red Line— y la lección es la misma: lo que diverge no son las dos
copias el día que se escriben, es la tercera vez que alguien arregla un fallo en
una y no en la otra.

`revisiones_de_documento.py` tiene la mecánica; `planos_de_obra` **delega** en
ella y conserva sus nombres, porque «número de plano» es lo correcto en ese
vocabulario. La semántica —disciplina y anclaje en un punto para el plano;
división y generación de submittals para la sección— **no vive ahí y no debe
acabar viviendo ahí**. Es el mismo reparto que `flujo_de_registro` hace con RFI,
submittal, protocolo e issue.

Las dos tablas de revisiones tienen **la misma forma a propósito**: si
divergieran, el motor común dejaría de servir para una de las dos.

---

## 3 · LAS DECISIONES QUE NO SON OBVIAS

### 3.1 · Las divisiones las fija el CONTRATO, no la plataforma

Los dos fabricantes usan **MasterFormat** (divisiones 00–48), que es el estándar
norteamericano. En obra pública peruana la estructura que manda es la del
**presupuesto**, porque es contra ella contra la que se valoriza. Imponer
MasterFormat obligaría a la entidad a mantener dos estructuras paralelas del
mismo proyecto.

Así que las divisiones son **datos de la obra**. Lo que sí damos es el catálogo
estándar **sugerido**, para que crearlas sea un clic y no un dictado. Una
división fuera del catálogo y sin título se rechaza (`SIN_TITULO`): lo que no
está, no se inventa.

### 3.2 · Las dos convenciones conviven sin convertirse

```
    MasterFormat   03 30 00
    Partida        03.02.01
```

Se normaliza **cada una en su propia forma**. Convertir una en la otra sería
inventarle al contrato una codificación que no usa.

### 3.3 · No se reescribe la historia

La migración añade `spec_section_id` a `doc_submittals` —la clave foránea que
GAP 01 dejó prevista con la nota «hoy texto, mañana clave foránea (GAP 05)»—
pero **no convierte** el texto viejo. Esos submittals escribieron la
especificación a mano y no hay forma de saber a qué sección se referían sin
inventarlo. El texto se conserva al lado; enlazar es un acto manual y queda
registrado.

Medido en producción: **0 submittals enlazados por la migración, 4 textos
intactos**.

### 3.4 · Generar un submittal no es un segundo camino de alta

`submittal-propuesto` es un **GET** que devuelve los campos. El alta sigue
siendo `POST /api/submittals`, con su veredicto, su BIC y sus permisos. Un
segundo camino de alta acabaría dejando de comprobar algo que el primero sí
comprueba, y nadie se daría cuenta hasta que hiciera falta.

La propuesta apunta a la **sección**, no a la revisión: un submittal se somete
contra «03 30 00 Concreto», y cuando esa sección se revise tiene que seguir
apuntando a la exigencia y no a un soporte superado.

---

## 4 · EL HUECO DE INTERFAZ QUE APARECIÓ POR EL CAMINO

El portal **no tenía dónde elegir un fichero del expediente**. La única
navegación estaba enterrada dentro de `IssueModule` (el componente de RFI y Red
Line), inaccesible para nadie más.

Consecuencia medible: **la pantalla de Planos podía crear la identidad de un
plano pero no emitir su primera revisión**. `POST /api/planos/<pid>/revisiones`
existe desde GAP 02 y no la llamaba nadie. GAP 02 se declaró COMPLETE porque su
EXP fue contra la API directamente.

Se creó `SelectorDeDocumento.jsx` como componente compartido y se usa en
Especificaciones. **La pantalla de Planos sigue sin usarlo**: queda señalado
como tarea propia, no arreglado de tapadillo dentro de otro gap.

---

## 5 · LO QUE LA EXP ENCONTRÓ

La EXP contra producción halló **un fallo real**, y es la parte más útil de este
documento.

### El fallo

`normalizar_seccion` solo reconocía bloques que **ya** venían con dos dígitos.
`3 30 00` pasaba tal cual, y `033000` —la misma exigencia— creaba una **segunda
sección**. El índice único no podía verlo: para la base eran dos números
distintos.

En obra eso significa dos personas registrando la misma especificación por
separado, cada una sometiendo materiales contra la suya, y el conflicto
apareciendo cuando el material ya está comprado. Y fallaba **justo en la forma
que más se teclea**: la que omite el cero a la izquierda.

### La corrección

Los bloques se rellenan a dos dígitos uno a uno. **Rellenar no es convertir**:
`3 30 00` y `03 30 00` son el mismo número con y sin el cero. La partida sigue
siendo partida, y hay una aserción que lo fija.

Verificado contra el servicio desplegado — las cinco formas apuntan a la misma
sección:

```
    '3 30 00'   409 SECCION_DUPLICADA → id 1
    '033000'    409 SECCION_DUPLICADA → id 1
    '03-30-00'  409 SECCION_DUPLICADA → id 1
    '3-30-0'    409 SECCION_DUPLICADA → id 1
    ' 3 30 0 '  409 SECCION_DUPLICADA → id 1
```

### La reconciliación

Las tres secciones se habían creado esa misma noche por la propia EXP y ninguna
tenía actividad de nadie. Se borró la duplicada **vacía** —0 revisiones, 0
submittals, y el script **aborta** si tuviera alguna— y se renumeró la buena,
que conserva sus 2 revisiones y su submittal. Los cuatro submittals anteriores
**no se tocaron**: su texto lo escribió una persona.

### Una falsa alarma, descartada

`SUB-003` aparecía dos veces. No es un fallo: rev 0 fue **Rechazado** y rev 1 es
su resometimiento, apuntando a la anterior por `revision_de`. El índice único es
`(project_id, codigo, revision)` — el diseño de GAP 01 funcionando.

---

## 6 · EL RESTO DE LA EXP, EN VERDE

| qué | resultado |
|---|---|
| un miembro define la estructura | 403 |
| un ajeno define la estructura | 403 `PROJECT_FORBIDDEN` |
| el admin crea la división `3` | 201 → `03 · Concreto`, del catálogo |
| la misma división otra vez | 409 `DIVISION_DUPLICADA` |
| división fuera del catálogo, sin título | 400 `SIN_TITULO` |
| `3.2.1` | 201 → `03.02.01`, **sin** convertirse a MasterFormat |
| sección sin título | 400 |
| dos revisiones emitidas | A `Superada` · B `Vigente` — **1 sola vigente** |
| repetir un código de revisión | 409 `REVISION_INVALIDA` |
| revisión sin documento | 400 |
| la propuesta de submittal | apunta a la **sección**, no a la revisión |
| crear el submittal por la vía de GAP 01 | 201 · sometimientos 0 → 1 |
| sección sin texto vigente | `sin_revision_vigente: true` |
| perímetro del ajeno (5 rutas) | 403 en las cinco |
| los 4 submittals antiguos | texto intacto, **sin enlazar** |

**No probado, y se declara:** que un documento de **otra obra** no se pueda
clavar como revisión. La guardia existe en el código y su prueba unitaria pasa,
pero en producción no había ningún documento de otra obra accesible con las
identidades de QA, así que la comprobación **contra el servicio** no se ejecutó.

---

## 7 · LA REGLA DE DESPLIEGUE, YA PAGADA DOS VECES

Esta mañana el backend salió **antes** que la migración 17 y `/api/issues`
devolvió 500 en toda su superficie hasta ejecutarla. Con GAP 05 el orden se
respetó: la migración 18 entró primero y el despliegue no rompió nada.

> Cuando una migración añade una columna que el código nuevo **lee**, la
> migración va **antes** del despliegue.

---

## 8 · ESTADO

| pieza | |
|---|---|
| Motor compartido de revisión | ✅ |
| Backend (identidad, revisiones, sets, OCR, propuesta) | ✅ |
| Migración 18 en producción | ✅ 4 tablas · 0 reescrituras · 11/11 obras |
| Pantalla + selector de documento | ✅ |
| Suite | ✅ **1257 en verde** (27 nuevas) |
| EXP contra producción | ✅ con un fallo hallado, corregido y reconciliado |

### Veredicto

**GAP 05 · ESPECIFICACIONES COMO OBJETO — COMPLETE**, con una ausencia
declarada: la comprobación de «documento de otra obra» no se ejecutó contra el
servicio desplegado por falta de datos, solo en pruebas unitarias.

**Fuera a propósito** (no son este gap): comparación de revisiones palabra por
palabra, y extracción automática de la tabla de contenidos para crear todas las
secciones de golpe. El OCR sugiere **una** sección por documento.
