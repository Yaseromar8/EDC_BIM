# REVIEWS — diagnóstico del flujo actual y alcance mínimo

**20-ago-2026** · Segunda pieza de la Generación 1
**No se ha tocado código.**

---

## 0 · La conclusión, primero

El motor de Reviews está **mucho más construido de lo que sugería su recuento de
filas**. Tiene pasos secuenciales, historial fechado, bloqueo de fila al actuar,
comprobación de que la versión no cambió bajo los revisores, regla de
independencia, y transición ISO por la máquina de estados. Eso no hay que
rehacerlo.

Lo que falta se reduce a **tres cosas**, y una de ellas es un defecto real:

1. **El plazo vive en el sitio equivocado** — solo en la proyección, solo para el
   primer paso, y la interfaz nunca lo envía. Está muerto.
2. **Una revisión cuyo revisor deja la obra se para en silencio** — y además hace
   que la conciliación **no converja**.
3. **Hay dos formas distintas de decidir quién es el revisor** y pueden discrepar.

---

## 1 · Qué ya existe

### El motor, revisado línea a línea

| capacidad | dónde | estado |
|---|---|---|
| Pasos secuenciales con revisor por paso | `steps` JSONB, `current_step` | ✔ |
| Historial fechado de cada acto | `history` + `{event, step, by, comment, at}` | ✔ |
| Cierre con fecha | `cerrada_en` | ✔ |
| Idoneidad resultante, **validada al crear** | `codigo_idoneidad` + `idoneidad.validar_para` | ✔ *«enterarse de que el código no sirve cuando ya han firmado tres revisores es tarde y humillante»* |
| Transición ISO por la máquina de estados | `estados_ecd`, no `UPDATE` directo | ✔ |
| **La versión no cambió bajo los revisores** | compara `version_id` al aprobar | ✔ — sella sobre lo que se miró, no sobre lo que haya |
| Regla de independencia (el autor no puede ser el único) | `_revision_independiente` | ✔ |
| Permiso sobre los documentos incluidos | `_puede_con_estos_documentos` | ✔ |
| Bloqueo de concurrencia | `SELECT … FOR UPDATE` | ✔ |
| **Encargo al revisor del paso** | `_encargo_del_paso` | ✔ (bloque anterior) |
| **Aviso por correo al entrar el turno** | `_enc.avisar()` | ✔ (bloque anterior) |
| **Aparece en «Mi Trabajo»** | `encargos` | ✔ (bloque anterior) |
| El fallo del encargo no tumba la aprobación | `try` alrededor | ✔ |

**Casi todo lo que un flujo profesional necesita ya está.** Por eso esta pieza es
pequeña.

---

## 2 · Qué falta realmente

### 2.1 · El plazo está en el sitio equivocado, y está muerto

Tres hechos medidos:

```python
# routes/reviews.py:225 — solo el PRIMER paso recibe plazo
_encargo_del_paso(cur, rid, steps, 0, d.get('vence_en'), …)

# routes/reviews.py:292 — al avanzar de paso: None
_encargo_del_paso(cur, rid, rev['steps'], rev['current_step'] + 1, None, …)
```

```jsx
// frontend-docs/src/components/ReviewsModule.jsx:80 — la interfaz NUNCA lo manda
steps: steps.map(s => ({ email: s.email, name: s.name })),
```

Y `doc_reviews` **no tiene ninguna columna de plazo**: sus únicas dos añadidas son
`codigo_idoneidad` y `cerrada_en`.

**Consecuencias:**

- **Ninguna revisión tiene plazo hoy.** `herramientas/recordatorios.py`, que
  funciona sobre `encargos.vence_en`, no encuentra nada que recordar en Reviews.
- **Y aunque lo tuviera, estaría solo en la proyección**, que es exactamente al
  revés de la regla que fijamos: *el Review es la fuente de verdad de su proceso*.
  Si el encargo se pierde y se reconstruye por conciliación, **el plazo
  desaparece** — porque el Review no sabía cuál era.

### 2.2 · Una revisión cuyo revisor deja la obra se para en silencio

La cadena, seguida en el código:

1. La persona sale de `project_users`.
2. `abrir()` **se niega** a abrirle un encargo — correctamente: *un encargo no da
   acceso*.
3. Nadie recibe aviso, no aparece en la bandeja de nadie.
4. Esa persona tampoco puede actuar: `verify_project_access` la bloquea.
5. **La revisión queda parada y nada lo dice.** Solo un administrador podría
   desatascarla, y tendría que enterarse por su cuenta.

Y hay un efecto secundario que ya está en el código de conciliación:
`_faltantes()` la detectará como *falta un encargo*, `conciliar(aplicar=True)`
llamará a `abrir()`, `abrir()` se negará otra vez, y la herramienta imprimirá
**«la conciliación no converge»** — un mensaje verdadero pero que no dice cuál es
el problema.

**Es un defecto real, y es el más importante de los tres.**

### 2.3 · Dos formas de decidir quién es el revisor

| para qué | cómo | riesgo |
|---|---|---|
| **Autorizar** el acto (`reviews.py:264`) | `u.email == step.email` **o** `u.name == step.name` | Dos personas con el mismo nombre; un cambio de nombre |
| **Abrir el encargo** (`_encargo_del_paso`) | `usuario_por_email(step.email)` → `user_id` | — |

Pueden discrepar: un paso con `name` y sin `email` deja actuar a alguien pero
**no produce ningún encargo**, así que nadie se entera de que le toca. En los
datos reales los pasos llevan las dos claves, así que hoy no muerde — pero es una
divergencia que conviene cerrar mientras es barata.

### 2.4 · El historial registra los actos, no los turnos

Hay entrada al aprobar y al rechazar, no al **empezar** un paso. El tiempo de
respuesta es *inferible* —el turno de un paso empieza cuando acabó el anterior—
pero no está escrito, y el plazo con el que se pidió no queda en ninguna parte.

### 2.5 · Lo que NO falta, aunque ACC lo tenga

| | por qué no |
|---|---|
| Pasos en **paralelo** (varios revisores a la vez) | Nuestro flujo es secuencial y ninguna obra lo ha pedido. Es un cambio de modelo, no un refinamiento |
| **Reasignación y delegación** | Es una decisión, no un automatismo. Y toca la regla de independencia |
| **Escalado automático** al vencer | Sin un solo plazo en producción todavía, escalar es diseñar para un problema que no se ha tenido |
| **Plantillas de flujo** | El piloto dirá si dos obras usan los mismos pasos |
| Firma electrónica avanzada | Fuera del núcleo |

---

## 3 · Qué reutilizamos del bloque recién construido

**Todo. Esta pieza no añade infraestructura.**

| pieza | cómo se aprovecha |
|---|---|
| `encargos` | Ya proyecta el turno del paso. Solo hay que darle un plazo que venga del Review |
| `Mi Trabajo` | Ya muestra el encargo y **ya ordena por `vence_en`**. En cuanto haya plazos, ordena por urgencia sin tocar una línea |
| `MiTrabajo.jsx` | **Ya pinta «vencido hace N d» en rojo.** Está escrito y hoy no se ve nunca porque no hay plazos |
| `mailer` + `avisar()` | Ya avisa al entrar el turno |
| `herramientas/recordatorios.py` | Ya recuerda lo vencido. Hoy no encuentra Reviews porque no tienen plazo |
| `conciliar_encargos.py` | Ya reconstruye el encargo del paso actual. Solo hay que enseñarle a distinguir *falta* de *bloqueada* |
| Directorio con funciones | No hace falta ahora: los pasos van a personas. Dirigir un paso a «la Supervisión» es Generación 2 |

Es la señal de que el bloque anterior era el correcto: **la mitad de esta pieza ya
está escrita y esperando datos.**

---

## 4 · Qué cambiaría — el alcance mínimo

### A · El plazo vive en el Review, y se aplica a **todos** los pasos

- `steps[i].dias` — **opcional**, días naturales de plazo para ese paso.
- `doc_reviews.paso_vence_en` — cuándo vence **el paso actual**. Se calcula al
  entrar el turno (`ahora + dias`) y se guarda **en el Review**.
- El encargo copia ese valor. Si el encargo se pierde, la conciliación lo
  reconstruye **con su plazo**, porque el Review lo sabe.

Por qué duración y no fecha absoluta: al crear la revisión **no se sabe** cuándo
empezará el paso 3. La fecha se fija cuando el turno empieza, y ahí queda escrita.

### B · El historial registra el comienzo de cada turno

Una entrada más: `{event: 'step_started', step, to, due, at}`. Con eso, «cuánto
tardó cada revisor» y «con qué plazo se le pidió» se leen del historial en vez de
inferirse.

### C · Una revisión bloqueada se detecta y **se dice**

Cuando el revisor del paso actual no es miembro de la obra, o su correo no
corresponde a ningún usuario activo:

- `conciliar_encargos` la lista aparte, como **BLOQUEADA**, con el motivo y el
  nombre del revisor — no como «falta un encargo».
- La conciliación **converge**: una bloqueada no es una divergencia reparable, es
  un asunto que necesita una persona.
- El Review lo dice al consultarlo (un campo calculado en la respuesta, **no una
  columna de estado**: no se añade un estado nuevo al ciclo de vida).

**Deliberadamente no se reasigna sola.** Quién sustituye a un revisor que se fue
es una decisión de obra, y automatizarla rompería la regla de independencia.

### D · Un solo criterio de «quién es el revisor»

Al autorizar el acto se acepta también «el usuario resuelto desde el correo del
paso es quien pide». **Se conservan** las comparaciones por correo y por nombre:
los pasos históricos pueden tener solo nombre, y quitarlas dejaría revisiones
antiguas sin nadie que pueda actuar.

### E · La interfaz permite poner el plazo

Un campo de días por paso en `ReviewsModule.jsx`. Sin él, A no llega nunca al
usuario.

### Sobre las revisiones históricas

**No se reinterpretan ni se reescriben.** Un `steps[i]` sin `dias` no tiene plazo:
`paso_vence_en` queda nulo, el encargo se abre sin vencimiento y «Mi Trabajo» no
pinta urgencia. Exactamente como hoy. La columna nueva nace nula y ninguna
revisión existente cambia.

---

## 5 · Qué dejo deliberadamente fuera

Pasos en paralelo · reasignación, delegación y escalado · plantillas de flujo ·
estados nuevos en el ciclo de vida del Review · notificaciones dentro de la
aplicación · días hábiles y calendario laboral *(días naturales: un calendario de
feriados peruanos es un módulo, no un campo)* · cambiar la lógica de idoneidad o
de `final_status` · **y cualquier cosa de RFI, Issues o Transmittals**.

---

## 6 · Cómo probaría que el flujo completo funciona

**Sin base de datos** (`tests/`): el cálculo del vencimiento desde `dias`; que una
revisión sin `dias` sigue sin plazo; que el criterio de revisor acepta las tres
formas; que una bloqueada no se cuenta como divergencia reparable.

**Contra PostgreSQL**, ampliando `herramientas/ensayo_de_encargos.py` con el ciclo
completo de una revisión de **dos pasos**:

| # | comprobación |
|---|---|
| 1 | Se crea con plazo → el revisor 1 la ve en su bandeja **con vencimiento**, el revisor 2 **no** |
| 2 | El historial registra el comienzo del turno, con destinatario y plazo |
| 3 | El revisor 2 **no puede actuar** en el paso 1 (403) |
| 4 | El revisor 1 aprueba → su encargo se cierra, **y se abre el del revisor 2 con su propio plazo** |
| 5 | El revisor 2 aprueba → los documentos transicionan al estado ISO y `cerrada_en` queda fechada |
| 6 | No queda ningún encargo abierto de esa revisión |
| 7 | **Un revisor sale de la obra a mitad**: la revisión se reporta **BLOQUEADA** con su motivo, y la conciliación **converge** |
| 8 | Se borra el encargo a mano (fallo de proyección) → la conciliación lo reconstruye **con el plazo del Review**, no sin él |
| 9 | Una revisión **histórica sin `dias`** sigue funcionando igual y sin plazo |
| 10 | El recordatorio encuentra la revisión vencida |

La 8 es la que demuestra que el plazo está en el sitio correcto. La 7, el defecto
que motiva esta pieza.

---

## Tamaño

| | |
|---|---|
| Columnas nuevas | **1** (`doc_reviews.paso_vence_en`) |
| Tablas nuevas | **0** |
| Módulos nuevos | **0** |
| Ficheros tocados | `routes/reviews.py`, `encargos.py`, `herramientas/conciliar_encargos.py`, `ReviewsModule.jsx` |
| Datos históricos | **no se tocan** |

---

**No he implementado nada. Espero su revisión del alcance.**
