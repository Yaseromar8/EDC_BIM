# CIERRE DE F2 — INTERFAZ DE RFI

**21-ago-2026** · Primera de las cuatro piezas del [mapa de cierre](33-mapa-de-cierre-de-frontend-docs.md)

> **El RFI ya es usable de extremo a extremo desde `frontend-docs`.**
> Sin tocar `frontend-react`, 3D, 4D ni LOB.

---

## 1 · Qué cambió

### El módulo está montado

`FilesPage` tiene un botón **RFI** en la barra lateral, antes de Red Line —
porque el RFI es el objeto **contractual** y la observación es interna.

### Un interruptor, no una bifurcación

`RfiModule` enciende `usaDirectorio: true` en su `cfg`. `IssueModule` —el
componente que RFI y Observaciones **comparten**— se comporta según ese
interruptor. **Observaciones no cambia**: su semántica se decide en F1, y
compartir componente no obliga a compartir flujo.

### Las siete cosas que pedía el alcance

| | |
|---|---|
| **Responsable por identidad** | El selector lee `GET /api/projects/<id>/miembros` y manda `responsable_id`. El nombre viaja solo como etiqueta. **El «+ añadir nombre» desaparece** con directorio: teclear un nombre suelto es justo el defecto que se quita |
| **Ball-in-Court** | Las reglas del backend, espejadas en la pantalla para **no ofrecer un botón que el servidor va a negar** |
| **Plazo** | Columna «Vence», selector de fecha, con el aviso escrito: *día calendario, no hay calendario de días hábiles* |
| **Flujo / BLOQUEADO** | Fila de aviso bajo el RFI cuando no puede avanzar, con el motivo del servidor |
| **Adopción de legacy** | Aviso propio: *«Viene del registro anterior. Su responsable es sólo el texto «…». Asigna a un miembro antes de responderlo»*, y dice que el texto original se conserva |
| **Veredicto** | La columna se llama **«Veredicto»**, y **solo la edita quien tiene el RFI** |
| **Documentos por versión** | Al adjuntar se fija `version_id` y `rol`; al abrir se firma esa versión y la etiqueta dice `· v3` o `· versión actual` |
| **Historial** | Panel bajo la fila al editar: quién asignó, quién respondió con qué veredicto, quién cerró |
| **Mi Trabajo** | Sigue funcionando por `encargos`, sin tocar nada |

---

## 2 · Un endpoint que faltaba, y por qué

El selector necesita los miembros **de la obra**. Lo que había no servía:

- `GET /api/projects/<id>/users` es **solo administrador** y devuelve **solo
  ids**. Un residente creando un RFI recibiría un 403.
- `GET /api/users` devuelve la **instancia entera**, incluidas personas que no
  están en esa obra. Un selector que ofrece a alguien a quien el sistema va a
  rechazar —`abrir()` se niega a dar encargo a un no miembro— **no es un
  selector: es una trampa**.

`GET /api/projects/<id>/miembros`, en `routes/directorio.py` (que ya es el dueño
del concepto): lo llama **cualquier miembro** y devuelve **solo miembros de esa
obra**, con nombre, empresa y función. **No amplía acceso**: son los nombres de
las personas con quienes ya se comparte la obra.

---

## 3 · Dos defectos reales encontrados

### 3.1 · Rompí el contrato de la lista al reescribir el módulo

Ayer, al reescribir `routes/rfis.py`, cambié `{"results": [...]}` por una lista
pelada. **Sin ninguna razón**, y como el módulo no estaba montado **nadie lo
notó**: la lista habría salido vacía el día que se encendiera. Y
`doc_redlines`, que comparte el mismo componente, seguía con el contrato viejo.

Restaurado — **y lo que importa: el ensayo tampoco lo veía.** Crear y consultar
la base no es lo mismo que ser un cliente HTTP. El ensayo tiene ahora tres
comprobaciones nuevas sobre `GET`: el contrato, que el RFI recién creado
aparece, y que trae su estado de flujo.

### 3.2 · El formulario enviaba todos los campos en cada guardado

Con las reglas nuevas eso es un problema de verdad: **reenviar `respuesta` sin
haberla tocado cuenta como dictar el veredicto**, y a quien no tiene el RFI le
devolvía un 403 por un campo que ni quería cambiar. Ahora el `PATCH` manda
**solo lo que cambió**, y si el servidor niega algo, la pantalla enseña **su
motivo** en vez de un «no se pudo guardar».

*(De paso: `.map` solo devuelve un elemento raíz, así que las filas de aviso e
historial necesitaron un `React.Fragment`.)*

---

## 4 · Pruebas

| | resultado |
|---|---|
| **Suite completa** | **876 pasan · 0 fallan** |
| **Ensayo de RFI** | **49 / 49** (antes 46; +3 del contrato HTTP) |
| Revisiones · Encargos · Dos obras | **50/50** · **31/31** · **16/16** |
| **Build de `frontend-docs`** | correcto |
| **Invariantes** | `file_nodes` y `file_versions` **idénticas** · alcances **sin reescribir** |

---

## 5 · Deuda de esta pieza

1. **`RedLineModule` sigue con `localStorage`** — deliberado, es F1.
2. **No hay pantalla para pasar la pelota fuera del modo edición.** Se cambia el
   responsable editando la fila; suficiente, y una acción directa se puede
   añadir si el piloto la pide.
3. **El aviso de bloqueo no ofrece un botón de reasignar**: el usuario abre la
   edición y cambia el responsable. La regla no lleva puertas, así que no hace
   falta un diálogo aparte como en Reviews.
4. **`vence_en` se manda como fecha**, no como días. Es lo que el backend del
   RFI espera; Reviews usa días por paso porque allí el turno empieza después.

---

# 6 · Diagnóstico previo de Observaciones (para F1)

Como pidió — **breve, y sin arquitectura**.

### Qué objeto representa hoy

`doc_redlines` es **gemela exacta** de `doc_rfis`: mismas columnas, mismas tres
rutas, y el **mismo componente** `IssueModule`. Pero los datos dicen que se usa
distinto:

| | RFI (25) | Redline (33) |
|---|---|---|
| Prefijo | `RFI-` | `RL-` |
| Estados | `Cerrado` 18 · `En revisión` 6 · `Respondido` 1 | **`Cerrado` 33 — y nada más** |
| Con respuesta | 19 de 25 | **33 de 33** |

**El RFI tiene ciclo de vida; la observación nace cerrada.** No es una consulta
esperando respuesta: es **el registro de algo detectado y ya resuelto** sobre un
plano.

### Los siete puntos

| | |
|---|---|
| **Quién crea** | Hoy cualquiera con acceso a la obra. En la práctica, quien revisa un plano |
| **Quién resuelve** | Hoy cualquiera. Mismo defecto que tenía el RFI |
| **Su «veredicto»** | Mismos valores `Aceptado`/`Rechazado` — pero aquí significan **«se acepta la observación»**, no «se acepta la respuesta». Es una **verificación de cierre**, no una respuesta contractual |
| **Estados** | Los cuatro existen; **solo se usa `Cerrado`**. El ciclo real parece ser detectar → corregir → verificar |
| **Responsable** | Texto de `localStorage`, un único valor en las 33 |
| **Cierre** | Sin gobierno. Ni fecha de verificación, ni quién verificó |
| **Referencias** | `adjuntos` → `file_nodes` (29 de 33 tienen uno), **sin `version_id`** — y una observación **debe** apuntar a la versión en la que se detectó, o pierde su sentido |
| **Históricos** | 33, todas cerradas, todas de la misma obra |

### El mínimo para ser nuestro Issue documental — mi lectura preliminar

**No copiar el RFI.** Tres diferencias que veo, y que conviene discutir antes de
decidir el alcance:

1. **El «responsable» de una observación es quien debe CORREGIR**, no quien debe
   responder. El ciclo natural es *quien detecta → quien corrige → quien
   verifica*, y **quien verifica suele ser quien detectó** — al revés que el RFI,
   donde cierra quien preguntó pero responde otro.
2. **El veredicto es una verificación**, así que lo lógico es que lo dicte **quien
   la levantó**, no quien la recibió. **Es la regla opuesta a la del RFI**, y por
   eso no se debe copiar el módulo sin pensar.
3. **La referencia a la versión es más importante aquí que en el RFI**: «esto está
   mal en el plano» sin decir *en qué versión* no se puede ni verificar ni cerrar.

Lo que sí se reutiliza tal cual: identidad estructurada, `encargos`, Mi Trabajo,
plazos, notificación, historial y conciliación.

**No propongo alcance todavía** — eso es lo siguiente que revisamos.

---

**STOP.** No he tocado `frontend-react`, ni 3D, ni 4D, ni LOB. No he empezado F1.
