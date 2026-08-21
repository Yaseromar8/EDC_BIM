# INFORME — REVIEWS MADURAS

**20-ago-2026** · Segunda pieza de la Generación 1
Alcance de [26](26-reviews-diagnostico-y-alcance.md), con la corrección del punto D.

> **Ningún documento, versión, SHA-256, permiso ni frontera entre obras cambió.**
> Y **ninguna revisión histórica se reescribió.**

---

## 1 · Qué cambié

### 1.1 · El revisor de un paso nuevo tiene identidad — `flujo_de_revision.py`

```json
{"user_id": 42, "email": "a@obra.pe", "name": "Ana Pérez", "dias": 5}
    ↑ identidad          ↑ instantánea: a quién se le pidió y con qué nombre
```

**La regla que no se puede relajar:** si el paso trae `user_id`, los respaldos por
correo y por nombre **no se consultan**. Consultarlos «por si acaso» devolvería
exactamente la ambigüedad que el `user_id` viene a eliminar.

| | resuelve por | |
|---|---|---|
| paso **nuevo** | `user_id` | y **solo** por eso |
| paso legacy con correo | `email` | el correo manda sobre el nombre |
| paso legacy solo con nombre | `name` | **legacy documentado**: es el único caso en que el nombre decide |

`email` y `name` se conservan en los pasos nuevos, pero como **instantánea**:
dicen a quién se le pidió y con qué nombre, aunque esa persona se llame distinto
dentro de dos años.

**Los pasos históricos no se convierten.** Transformar un nombre antiguo en un
usuario de hoy sería adivinar sobre el expediente.

Se exige **al crear**, no al aprobar — descubrir que el paso 3 apunta a nadie
cuando ya han firmado dos revisores es tarde — y se comprueba también que el
revisor **pertenezca a la obra**: si no, la revisión nacería bloqueada.

### 1.2 · El plazo vive en el Review — `doc_reviews.paso_vence_en`

Antes: solo en la proyección, solo para el primer paso, y la interfaz nunca lo
enviaba. **Estaba muerto.**

Ahora: `steps[i].dias` (opcional) y el vencimiento del turno **en curso** guardado
en el Review. Se calcula **al empezar el turno**, no al crear —cuando se crea no
se sabe cuándo le tocará al paso 3— y el encargo lo **copia**.

**Y eso es lo que hace que sobreviva:** si el encargo se pierde, la conciliación
lo reconstruye **con su plazo**, porque el Review lo sabía.

### 1.3 · El historial registra el comienzo del turno

```json
{"event": "step_started", "step": 1, "to": "Revisor Dos", "to_user_id": 8,
 "due": "2026-08-25T…", "at": "2026-08-20T…"}
```

«Cuánto tardó cada revisor» y «con qué plazo se le pidió» se **leen**, ya no se
infieren de la fila anterior.

### 1.4 · Una revisión bloqueada se detecta y se dice

`flujo_de_revision.estado_del_flujo()` → `ACTIVA` · `BLOQUEADA` · `CERRADA`, con
motivo. **Se calcula al mirarla; no se guarda**: un estado guardado habría que
mantenerlo al día, y un estado que puede quedarse viejo es peor que no tenerlo.
Y **no es un estado nuevo del ciclo de vida** — `status` sigue siendo
`pending`/`approved`/`rejected`.

Y arregla el efecto colateral que ya existía: la conciliación **listaba** la
revisión bloqueada como «falta un encargo», intentaba repararla, `abrir()` se
negaba —un encargo no da acceso— e imprimía «no converge» sin decir por qué.
Ahora las lista aparte y **converge**.

**No se reasigna sola.** Quién sustituye a un revisor que se fue es una decisión
de obra; automatizarlo podría acabar poniendo de revisor a quien creó la
revisión, rompiendo la regla de independencia.

### 1.5 · La independencia se comprueba por identidad

`_revision_independiente` comparaba correo o nombre. Con dos personas llamadas
igual, un tocayo podía «dar independencia» a una revisión en la que en realidad
solo firmaba el autor. Ahora compara identidades cuando las hay.

### 1.6 · La interfaz

`ReviewsModule.jsx` envía `user_id` y un campo de **días por paso**. Y filtra los
revisores ya elegidos por id, no por correo.

---

## 2 · Antes / después

| | antes | después |
|---|---|---|
| Identidad del revisor de un paso nuevo | `email` **o** `name` | **`user_id`** |
| Dos personas con el mismo nombre | **las dos podían firmar** | solo la correcta |
| Pasos con plazo | **ninguno** (el primero, y la UI no lo enviaba) | todos los que lo pidan |
| Dónde vive el plazo | solo en `encargos` | **en el Review**; el encargo lo copia |
| Encargo perdido y reconstruido | **sin plazo** | **con su plazo** |
| Comienzo del turno en el historial | no se registraba | `step_started` con destinatario y plazo |
| Revisión con el revisor fuera de la obra | parada **en silencio** | **BLOQUEADA**, con motivo y nombre |
| Conciliación ante una bloqueada | «no converge» | la lista aparte y **converge** |
| Revisiones históricas | — | **funcionan igual, sin plazo** |
| Pruebas | 831 | **846** |
| Ensayo de revisiones | — | **31 / 31** |
| Columnas nuevas · tablas nuevas | — | **1 · 0** |

---

## 3 · Pruebas

| | resultado |
|---|---|
| **Suite completa** | **846 pasan · 0 fallan** (antes 831) |
| **Ensayo del ciclo de revisión** | **31 / 31** |
| Ensayo del motor de encargo | **31 / 31** |
| Ensayo de dos obras | **15 / 15** |
| Invariantes | `file_nodes` y `file_versions` **idénticas** · 46 columnas de alcance **sin reescribir** · auditoría solo anexa |

### Las diez comprobaciones pedidas, más la guardiana

| # | | |
|---|---|---|
| 1 | Se crea con plazo; el revisor 1 la ve con vencimiento, el 2 no | ✔ |
| 2 | El historial registra el comienzo del turno con destinatario y plazo | ✔ |
| 3 | El revisor 2 no puede actuar en el paso 1 | ✔ 403 |
| 4 | El 1 aprueba → su encargo se cierra y se abre el del 2 **con su propio plazo** | ✔ 5 días, no 3 |
| 5 | El 2 aprueba → el documento pasa a `SHARED` y `cerrada_en` queda fechada | ✔ |
| 6 | No queda ningún encargo abierto | ✔ |
| 7 | **Un revisor sale de la obra** → BLOQUEADA con motivo, y la conciliación converge | ✔ |
| 8 | **Se pierde el encargo** → se reconstruye **con el mismo plazo** | ✔ |
| 9 | Una revisión histórica sin `user_id` ni `dias` sigue funcionando | ✔ |
| 10 | El recordatorio la encuentra vencida | ✔ |
| **G** | **El tocayo del revisor 1 no puede firmar en su lugar** | ✔ 403 |

La **8** demuestra que el plazo está en el sitio correcto. La **7** es el defecto
que motivaba la pieza. La **G** es lo que usted pidió congelar.

---

## 4 · Qué dejé deliberadamente fuera

Pasos en paralelo · reasignación, delegación y escalado · plantillas de flujo ·
estados nuevos en el ciclo de vida · notificaciones dentro de la aplicación ·
**días hábiles y calendario de feriados** (días naturales: un calendario peruano
es un módulo, no un campo) · cambiar la lógica de idoneidad o `final_status` · y
**cualquier cosa de RFI, Issues o Transmittals**.

## 5 · Deuda anotada

1. **Los pasos legacy solo con nombre siguen decidiendo por nombre.** Es el único
   caso que queda, está documentado como legacy y hay una prueba que lo fija.
   Quitarlo dejaría revisiones antiguas sin nadie que pueda actuar.
2. **Reasignar un revisor no existe todavía.** Una revisión bloqueada se ve y se
   nombra, pero desatascarla es hoy trabajo de un administrador.
3. **El recordatorio hay que programarlo** (`herramientas/recordatorios.py`).
4. Las reglas de siempre: en la base heredada faltan las claves ajenas hasta que
   el arranque corra como `ecd_migrator`.

---

**STOP.** No he avanzado a RFI, Issues ni Transmittals.
