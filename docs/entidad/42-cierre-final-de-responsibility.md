# CIERRE FINAL DE RESPONSIBILITY — `frontend-docs`

**21-ago-2026** · Cierra la deuda declarada en el
[cierre de Foundation de acceso](41-cierre-de-foundation-de-acceso.md).

---

## 1 · Qué estaba mal

`_es_destinatario` ya usaba identidad estricta. **La proyección no.** Tres
puntos, todos del mismo objeto:

| | antes |
|---|---|
| **El acuse se firmaba** | `por = name or email` — **texto, y el nombre primero** |
| **`_acuso` cotejaba** | ese texto contra el nombre **o** el correo del usuario |
| **`_faltantes` resolvía** | al destinatario por **correo**, ignorando el `user_id` que la emisión ya guardaba |

> **El acuse de un homónimo cerraba el encargo de otra persona.** Y un encargo
> cerrado por error **desaparece de la bandeja de quien todavía lo debe** — la
> peor forma de perderlo, porque no hace ruido.

---

## 2 · Qué se cambió

**El acuse se firma con identidad.** Gana `por_id`; `por` se conserva porque es
lo que se enseña y lo que llevan los acuses ya emitidos. Y la comprobación de
«¿ya acusó?» pasa a ser por identidad — antes, cambiar de nombre permitía acusar
dos veces.

**`_acuso(acuses, email, nombre, user_id=None)`** — identidad estricta cuando la
hay: un acuse con `por_id` decide **solo** por identidad, **sin respaldo por
nombre ni correo**. El respaldo por texto queda **exclusivamente** para acuses
legacy, que no se convierten.

**`_faltantes`** usa el `user_id` del destinatario si la emisión lo lleva, y
sólo recurre a `usuario_por_email` en emisiones heredadas.

**Nada más de `encargos` cambió**: los estados de cierre, los cuatro tipos, el
`JOIN project_users` de Mi Trabajo y la negativa a abrir un encargo a un no
miembro siguen exactamente igual — y el ensayo lo comprueba en su sección 7.

---

## 3 · Pruebas

**`ensayo_de_acuse_por_identidad.py` — 28 / 28**, con dos «Ana Torres» reales:

| escenario | resultado |
|---|---|
| **Mismo nombre** | Dos usuarios distintos se llaman igual — el caso real de dos empresas |
| **Mismo correo** | **No existe en este modelo**: `users.email` es único. Se comprueba intentándolo, en vez de suponerlo |
| **Emisión nueva** | Cada destinataria nace con **su** `user_id`, no con su nombre |
| **Acusa una** | Su encargo se cierra; **el de su homónima sigue abierto** — era el defecto exacto |
| **Firma** | El acuse queda con `por_id`, no sólo con el nombre |
| **Conciliación** | No declara sobrante el de quien no acusó, ni echa en falta el de quien sí. **Idempotente**: la segunda pasada no mueve nada |
| **Mi Trabajo** | Dice lo mismo antes y después de conciliar |
| **Acusa la segunda** | Los **dos** acuses constan, cada uno con su identidad |
| **Emisión legacy** | **No se convierte**: sigue sin `user_id`, y un acuse por texto la sigue saldando |
| **El texto no alcanza a la nueva** | Un acuse con `por_id` **no** alcanza a la homónima; sí a quien de verdad acusó |

### Batería completa

| | |
|---|---|
| **Suite** | **881 pasan · 0 fallan** |
| **Acuse por identidad** *(nuevo)* | **28 / 28** |
| Encargos · Expediente · Acceso documental | **31/31** · **86/86** · **31/31** |
| Búsqueda · Participantes · Red Line · Desacople | **23/23** · **33/33** · **58/58** · **22/22** |
| RFI · Revisiones · Dos obras | **49/49** · **50/50** · **16/16** |
| **Invariantes vs. Foundation de acceso** | **0 diferencias** |
| Build `frontend-docs` | correcto |

---

## 4 · Un doble de prueba que se engañaba solo

`test_dos_personas_distintas_suman_dos_acuses` falló al aplicar el cambio. La
causa **no era el código**: el doble daba **`id: 3` a las tres personas**, así
que «dos personas distintas» eran, por identidad, la misma. Mientras el acuse se
cotejaba por texto nadie lo notaba; en cuanto pasó a cotejarse por identidad, el
segundo acuse quedó —correctamente— como repetido.

**Una prueba que se llama «dos personas distintas» tiene que usar dos.** Cada
persona tiene ahora su identidad, y la prueba comprueba lo que su nombre dice.

Es la misma familia de defecto que ya apareció dos veces en este proyecto —el
harness que reasignaba una global de módulo— y que sólo se ve cuando el código
se vuelve más estricto que el doble.

---

## 5 · Estado de la capa

> **Permiso ≠ responsabilidad**, y ahora ambas se deciden **por identidad**.

- Un encargo se abre y se cierra **sólo** como consecuencia de una transición de
  su objeto. Ninguna ruta escribe encargos —lo ata
  `test_no_existe_ninguna_ruta_que_escriba_encargos`—.
- La pertenencia va **dentro** de la consulta de Mi Trabajo, como `JOIN`.
- La proyección es **reconstruible e idempotente**.
- Y ya **no se cierra por parecido de nombre**.

---

**STOP.** No se tocó Account, Tool Activation, Tool Access, `frontend-react`,
3D, 4D ni LOB.
