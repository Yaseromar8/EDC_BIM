# 31 · El resumen al entrar y «dar por resuelto» una nube (13-nov-2026)

Pedido del dueño (13-nov-2026):

> «En las nubes, cuando se requieren fotos o algún documento, dice Entregar. Pero ¿qué pasa si solo es mover o
> actualizar? Deberíamos tener alguna forma de indicar que se solucionó. Y al inicio, agregar un resumen de cada
> usuario de lo que está pendiente, vencido y entregado.»
>
> «Debe ser en el inicio, para que cada vez que ingresen sepa qué le falta.»

**En local: sin push, sin desplegar. Sin migración.**

---

## Las cuatro preguntas

| | |
|---|---|
| **¿Qué problema resuelve?** | Quien solo tenía que mover o corregir algo veía «Entregar» y pensaba que había que subir un archivo. Y al entrar se veía la lista de lo pendiente, pero no cuánto había, cuánto estaba vencido, ni qué pasó con lo que uno ya entregó. |
| **¿Qué cambió?** | La respuesta a una nube se llama por lo que es: «Dar por resuelto» si no se adjunta nada, «Entregar» si se adjunta. Y «Mi trabajo», en el inicio, abre con tres números —pendiente, vencido, entregado— y enseña lo que la persona ya entregó y espera respuesta. |
| **¿Cómo se comprobó?** | En pantalla con los componentes reales, contra PostgreSQL local con la ruta real, y con pruebas (§4). |
| **¿Cómo se vuelve atrás?** | Revirtiendo el commit. No se guarda nada nuevo. |

## 1 · «Dar por resuelto»

**Lo que ya existía.** Desde el 4-nov la respuesta a una nube es un solo cuadro: se escribe qué se hizo y, si hace
falta, se adjunta. Bastaba una de las dos cosas. Lo que confundía era la palabra.

**Lo que cambia, solo en las palabras:**

| Dónde | Antes | Ahora |
|---|---|---|
| El botón de la nube que te toca | Entregar | **Responder** |
| El botón que confirma, sin adjuntos | Entregar | **Dar por resuelto** |
| El botón que confirma, con adjuntos | Entregar | Entregar |
| El aviso al hacerlo | Entregado: le llega al encargado… | **Resuelto:** … / Entregado: … |
| El estado de la nube, respondida sin adjuntos | Entregada | **Resuelta** |
| En «Mi trabajo», lo que respondiste sin adjuntos | — | **Resuelto en ISS-002: …** |

**Lo que no cambia.** Por dentro es el mismo acto y el mismo estado: quien pidió sigue aceptando o devolviendo. Sin
escribir nada ni adjuntar, el botón sigue apagado: «resuelto» sin decir qué se hizo no vale.

**Lo que no se tocó:** el aviso que le llega al encargado sigue diciendo «Entregado en ISS-002: …» aunque la
respuesta fuera solo una nota. Cambiarlo toca `encargos.py`, que tiene cambios de las rondas sin publicar.

## 2 · El resumen al entrar

En el inicio, «Mi trabajo» abre con tres números:

- **Pendiente**: lo que te toca y aún está en plazo (o no tiene fecha).
- **Vencido**: lo que te toca y ya pasó su fecha. Se cuenta aparte y es lo único que lleva color, y solo cuando
  hay alguno.
- **Entregado**: lo que ya hiciste y espera a otro.

Debajo:

1. **Lo pendiente, con lo vencido primero** y lo más atrasado arriba.
2. **«Entregado, esperando respuesta»**: cada cosa con a qué espera («que lo acepten», «que lo verifiquen») y desde
   cuándo («hoy», «ayer», «hace 4 d»). Pulsarla abre el plano en esa nube.

**Qué cuenta como entregado** (con lo que ya se guarda):

- una nube tuya, o de tu empresa, que ya respondiste y que el encargado del plano aún no aceptó ni devolvió;
- una incidencia de la que eres responsable y que diste por corregida, pendiente de que otro la verifique.

En cuanto el otro actúa, sale sola de la lista: si la aceptó, ya no hay nada que mirar; si la devolvió, vuelve a
«pendiente» por el camino de siempre.

**Los tres números salen siempre**, también con todo a cero. Si no hay nada pendiente pero sí entregado, lo dice:
«No tienes nada pendiente. Lo que entregaste espera respuesta».

## 3 · Lo que NO hace todavía

- **La importancia del plano.** Lo vencido va primero; lo que se debe en un plano crítico todavía no se distingue.
  Es la pieza 3 de `30_IMPORTANCIA_Y_CIERRE_DEL_PLANO.md`: necesita un dato nuevo (migración) y tus respuestas a
  sus cuatro preguntas.
- **El resumen de los demás.** Cada persona ve lo suyo. Quien dirige la obra no tiene aún una tabla con «quién debe
  qué» de todo el equipo. Es la pieza 1 de ese mismo documento.
- **Las revisiones y los RFI no cuentan como «entregado»**: al actuar en ellos no queda nada esperando que sea tuyo.

## 4 · Evidencia (13-nov-2026)

**En pantalla, con los componentes reales y respuestas simuladas**
- «Mi trabajo»: con cuatro pendientes (dos vencidos) y dos entregados dice 2 · 2 · 2, lo vencido arriba («vencido
  hace 9 d» antes que «hace 2 d») y el «2» de vencido en rojo; pulsar un entregado pide abrir su plano en su nube.
  Vacío: 0 · 0 · 0 y «No tienes nada pendiente». Solo con entregados: su frase. Con un servidor anterior, que no
  manda `entregados`: 1 · 0 · 0, sin romperse. Sin errores en la consola.
- La pestaña «Nubes»: la nube pedida ofrece «Responder»; el botón de confirmar está apagado hasta escribir; con
  solo la nota dice «Dar por resuelto»; se envía el mismo acto de siempre (`entregar`, con la nota); el aviso dice
  «Resuelto: le llega al encargado del plano» y la nube pasa a leerse «Resuelta». Una respondida con un documento
  se lee «Entregada».

**Contra PostgreSQL local, con la ruta real** (`backend/herramientas/ensayo_de_lo_entregado.py`): 9 de 9. Quien
aporta ve sus dos nubes entregadas y su incidencia corregida y nada más: ni la pedida, ni la ya aceptada, ni la de
otra persona, ni las de una incidencia cerrada o descartada, ni la de una obra de la que no es miembro.

**Pruebas**
- `backend/tests/test_lo_entregado.py`: 15. Encontraron un fallo mío antes de salir (la consulta se rompía con
  cualquier persona, por unas llaves del propio SQL).
- `frontend-docs/pruebas/miTrabajo.prueba.mjs`: 9.
- La suite entera del backend, los bancos del portal y la compilación: sobre el árbol exacto del commit, en su
  mensaje.

**No comprobado:** en producción, con datos y sesiones reales. Los bancos de pantalla que usé eran temporales y los
borré; no queda un banco versionado de «Mi trabajo» ni de la pestaña «Nubes».

## 5 · Ficheros

| Fichero | Qué es |
|---|---|
| `backend/lo_entregado.py` (nuevo) | Qué entregó una persona y espera respuesta |
| `backend/routes/directorio.py` | `GET /api/mi-trabajo` añade `entregados`, como última lectura |
| `frontend-docs/src/utils/miTrabajo.js` (nuevo) | Contar y ordenar, puro |
| `frontend-docs/src/components/MiTrabajo.jsx` | Los tres números y la lista de lo entregado |
| `design/incidencias/respuestaDeNube.js` (nuevo) | Cómo se llama la respuesta según lleve adjuntos |
| `design/incidencias/NubesDeIncidencia.jsx` | Usa esas palabras |
| `backend/herramientas/ensayo_de_lo_entregado.py`, `backend/tests/test_lo_entregado.py`, `frontend-docs/pruebas/miTrabajo.prueba.mjs` (nuevos) | Ensayo y pruebas |
