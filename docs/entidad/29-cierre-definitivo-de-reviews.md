# CIERRE DEFINITIVO DE REVIEWS

**21-ago-2026** · Cierra los dos puntos operativos pendientes de [27](27-informe-de-reviews-maduras.md)

> **Ningún documento, versión, SHA-256, permiso ni frontera entre obras cambió.**
> **Ninguna revisión histórica se reescribió.**

---

## 1 · Qué cambió

### 1.1 · Salida controlada de una Review BLOQUEADA

`POST /api/reviews/<rid>/reasignar` con `{user_id, motivo}`.

**Cinco puertas, y todas obligatorias:**

| puerta | código | por qué |
|---|---|---|
| Solo administrador | `SOLO_ADMIN` | Sustituir a un revisor es una decisión de obra |
| **Solo si está BLOQUEADA** | `NO_ESTA_BLOQUEADA` | No es administración de flujos. Permitirlo en una revisión que avanza convertiría una vía de rescate en una forma de **elegir quién firma** |
| Motivo obligatorio | `FALTA_MOTIVO` | Una sustitución sin explicación deja el historial contando *qué* pasó y no *por qué* — la mitad inútil de una trazabilidad |
| El nuevo revisor es miembro de la obra | `REVISOR_FUERA_DE_LA_OBRA` | Igual que al crear. Si no, la revisión nacería otra vez bloqueada |
| **La independencia se vuelve a comprobar** | `REVISION_SIN_INDEPENDENCIA` | Una sustitución no puede dejar al autor como único revisor: sería una firma delante del espejo, y por la puerta de atrás |

**Nunca automática.** El sistema ejecuta la decisión; no la toma.

### 1.2 · Recordatorios — memoria y honestidad

Columna nueva `encargos.recordado_en`, y la consulta excluye lo recordado dentro
de las últimas `--cada-horas` (24 por defecto).

**Sin eso, programarlo cada hora enviaba un correo por hora** a la misma persona
por el mismo encargo — el camino más corto para que la gente mande los avisos del
sistema a la papelera, y entonces ya no sirve ninguno.

Son **dos columnas y no una** a propósito: `avisado_en` dice cuándo se anunció el
encargo (una vez, al empezar el turno) y `recordado_en` cuándo se insistió por
última vez. Con una sola, cada recordatorio borraría la fecha del anuncio y ya no
se podría saber cuánto lleva alguien debiendo algo.

### 1.3 · «Días calendario», dicho donde se teclea

En la interfaz (etiqueta visible, no solo el *tooltip*), en el correo de aviso y
en la documentación. Se dice ahí y no solo al pasar el ratón porque **un plazo
que el usuario cree en días hábiles y el sistema cuenta en naturales es una
discusión garantizada la primera vez que uno vence en sábado.**

### 1.4 · Dos defectos de banco de pruebas, encontrados y corregidos

Ninguno del producto, pero los dos ocultaban resultados:

- **En mi ensayo nuevo**: `cliente_como` reasigna `am.validate_session`, que es
  una global del módulo. Guardar dos clientes y alternar entre ellos hace que
  **ambos hablen con la identidad del último creado**.
- **En `ensayo_de_segunda_obra`**: el mismo patrón. Al añadirse la comprobación
  del administrador, el cliente anterior pasó a hablar como administrador — y un
  administrador salta la comprobación de obra **a propósito**. El criterio 5
  devolvía 200 y parecía un fallo del producto cuando era del banco. Venía
  fallando así desde `b671559`.

### 1.5 · Una ruta que había que declarar

`reasignar_revisor` recibe solo el id de la revisión, así que su obra sale de la
fila. Sin declararla en `perimetro_de_obra.RUTAS_POR_RECURSO` devolvía **403
PROJECT_UNRESOLVED antes de llegar a sus propias comprobaciones** — y una
revisión parada se quedaba sin la única vía que tiene para desatascarse. Es el
mismo mecanismo que ya usa `act_on_review`.

---

## 2 · Comportamiento de la sustitución

```
Revisión BLOQUEADA (el revisor del paso salió de la obra)
        │
        ├─ administrador ──► POST /api/reviews/<id>/reasignar {user_id, motivo}
        │                       │
        │                       ├─ cinco puertas
        │                       ├─ steps[paso_actual] ← nuevo revisor
        │                       │    y `reasignado_de` ← el anterior, tal cual
        │                       ├─ history += step_reassigned {from,to,by,reason,at}
        │                       ├─ se cierra el encargo del que se fue
        │                       └─ arranca el turno: plazo recalculado + aviso
        │
        └─ resultado: ACTIVA. El nuevo revisor la ve en su bandeja y puede firmar.
```

**Solo se reescribe el paso EN CURSO.** Los pasos ya resueltos y los futuros
quedan intactos, y el historial solo se **añade**: ninguna aprobación anterior se
toca. Sustituir a quien todavía no ha actuado no cambia lo que ya hizo otro.

El encargo **no se toca directamente**: se cierra y se abre por la misma vía que
el resto del flujo (`_empieza_el_turno`), porque `encargos` es la proyección y se
mueve cuando se mueve el objeto.

---

## 3 · Trazabilidad

Dos sitios, y cada uno responde a una pregunta distinta:

**En el paso** — para que se cuente por sí mismo, sin obligar a nadie a
reconstruirlo leyendo el historial entero:

```json
{"user_id": 44, "email": "r1@obra.pe", "name": "Revisor Uno", "dias": 2,
 "reasignado_de": {"user_id": 45, "name": "Revisor Dos"}}
```

**En el historial** — el relato completo, y la cadena si hubo más de una:

```json
{"event": "step_reassigned", "step": 0,
 "from": {"user_id": 45, "name": "Revisor Dos"},
 "to":   {"user_id": 44, "name": "Revisor Uno"},
 "by": "autor@obra.pe", "reason": "Revisor Dos dejó la obra",
 "at": "2026-08-21T12:09:34+00:00"}
```

Más `activity_log` con `review_reassigned`.

`reasignado_de` guarda al **inmediatamente anterior**, no una muñeca rusa: la
cadena completa vive en el historial, que es donde va el relato.

---

## 4 · Comportamiento de los recordatorios

> **No es un «recordatorio automático», y no debe presentarse como tal.**

Es una **capacidad disponible que alguien tiene que programar**. Mientras no
exista una ejecución programada cuya salida se pueda comprobar, decir «el sistema
recuerda solo» sería prometer algo que nadie puede demostrar — y **un
recordatorio que se para en silencio es peor que no tenerlo**, porque la gente
deja de vigilar sus plazos confiando en él.

**Cómo se programa, si se decide hacerlo.** Con la arquitectura de hoy, una tarea
programada del proveedor (en Render, un *Cron Job*) una vez al día:

```bash
cd backend && ./venv/bin/python herramientas/recordatorios.py --enviar
```

Ni demonio, ni cola, ni plano de control. **Lo que sí falta antes de llamarlo
automático es una forma de saber que corrió.**

**Y ahora es seguro repetirlo:** recuerda a lo sumo una vez cada `--cada-horas`.
Por defecto sigue sin enviar nada (`--enviar` es explícito).

---

## 5 · Compatibilidad histórica

| caso | comportamiento |
|---|---|
| Paso legacy **con correo** | Resuelve por correo. Igual que siempre |
| Paso legacy **solo con nombre** | Resuelve por nombre. **Único caso en que el nombre decide**, documentado como legacy y con prueba que lo fija |
| Revisión sin `dias` | Sin plazo. El encargo se abre sin vencimiento y la bandeja no pinta urgencia |
| Revisión sin `created_by` | La independencia no la bloquea: sin autor registrado no hay a quién excluir |
| Encargos anteriores a `recordado_en` | La columna nace nula: se recuerdan por primera vez con normalidad |
| Pasos históricos | **No se convierten ni se reescriben.** Transformar un nombre antiguo en un usuario de hoy sería adivinar sobre el expediente |

---

## 6 · Pruebas

| | resultado |
|---|---|
| **Suite completa** | **860 pasan · 0 fallan** (antes 852) |
| **Ensayo del ciclo de revisión** | **50 / 50** (antes 31) |
| Ensayo del motor de encargo | **31 / 31** |
| Ensayo de dos obras | **16 / 16** (venía dando 15/16 desde `b671559`) |

### Lo que demuestra el ensayo, sobre PostgreSQL

**Sustitución (§11):** un no administrador → 403 · sin motivo → 400 · sobre una
revisión no bloqueada → **409** · con alguien de fuera de la obra → 400 · dejando
al autor solo → 400 · y la buena → 200, con el paso apuntando al nuevo, el
anterior **conservado**, el historial con *quién, por quién, cuándo y por qué*,
ninguna entrada previa tocada, la revisión **deja de estar BLOQUEADA**, el nuevo
revisor la ve **con plazo**, y **la aprueba**.

**Recordatorios (§12):** la primera vez sale · recién recordado **ya no sale** ·
y cuando pasa la ventana, vuelve a salir.

### Invariantes

`file_nodes` y `file_versions` con **huella idéntica** · 46 columnas de alcance
**sin reescribir** · `activity_log` y `auth_events` **solo anexan**.

### Manifiesto

`+1 columna` (`encargos.recordado_en`). Nada perdido. Está en el manifiesto, así
que una instancia donde no se cree **no arranca**.

---

## 7 · Deuda deliberadamente pendiente

1. **No hay reasignación fuera de una revisión bloqueada.** Cambiar revisores de
   una revisión que avanza es administración de flujos, y no es esta pieza.
2. **Los pasos legacy solo con nombre siguen decidiendo por nombre.** Único caso,
   documentado, con prueba.
3. **El recordatorio hay que programarlo**, y no hay forma de comprobar que corrió.
   Hasta que la haya, **no se presenta como automático**.
4. **Días calendario, no hábiles.** Un calendario de feriados peruanos es un
   módulo, no un campo.
5. **Sin escalado, delegación, pasos en paralelo ni plantillas de flujo.**
6. **Línea operativa de despliegue abierta**, anotada en
   [28](28-auditoria-de-la-convergencia-codex.md): la convergencia de Render
   requiere cambios y la base de producción sigue sin inventariar. Producción
   sirve `f911b6d`, trece commits por detrás.

---

**Reviews queda cerrado. STOP.** No he avanzado a RFI.
