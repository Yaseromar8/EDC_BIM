# E1 · Guía de prueba en producción

13-sep-2026. Probarás lo que ya está desplegado: backend `68b14b8` en Virginia y el portal con E1. Calcula entre 30 y 40 minutos.

Marca cada paso con ✅ o ❌. Si algo falla, anota el número del paso y, si puedes, haz una captura.

## 0 · Antes de empezar

**Qué necesitas**
- **Dos cuentas revisoras que NO sean administradoras y que participen en la obra**; aquí se llaman **cuenta A** y **cuenta B**:
  - no pueden ser administradoras porque hoy un administrador de la entidad no puede ser revisor: no se le deja añadir como participante (hallazgo H1 en `E1_UAT_HALLAZGOS.md`);
  - sirven, por ejemplo, «yaser omar 02» y otra cuenta tuya de prueba;
  - tú creas las revisiones con tu cuenta principal y actúas entrando con A y con B;
  - hacen falta dos porque quien crea la revisión no puede ser su único revisor, y la misma persona no puede estar en dos pasos.
- **Una carpeta de prueba** a la que tengáis acceso los dos, con **dos PDF recién subidos** (sirve cualquier PDF). Si tenéis una obra de pruebas, úsala.
- **Avisar al colega**: puede recibir el aviso de la revisión.

**Qué no hacer**
- **No pulses Dar conformidad, Aprobar, Aprobar y cerrar ni Rechazar en revisiones reales.** Todo queda registrado, y «Aprobar y cerrar» cambia el estado de los documentos.
- **Las revisiones de prueba se quedarán en la obra**, porque anular y archivar llegan con E2. Pon títulos que empiecen por **«PRUEBA E1 —»**.

## A · Solo mirar, sobre revisiones reales

No se pulsa ningún botón de acto: no hay riesgo.

| # | Haz esto | Debe pasar |
|---|---|---|
| A1 | Entra al portal, abre la obra y, en el menú de la izquierda, pulsa **Revisión y entrega → Revisiones** | Ves la lista con código RV-###, título y estado. Arriba están los filtros **Todas · Me toca · En curso · Bloqueadas · Terminadas · Iniciadas por mí** |
| A2 | Pulsa cada filtro | La lista cambia y el filtro activo queda marcado. «Me toca» solo muestra revisiones cuyo paso actual es tuyo |
| A3 | Si hay más de 20 revisiones, baja hasta el final | Aparece **Cargar más** y añade las siguientes sin repetir ninguna |
| A4 | Abre una revisión | Ves el detalle: **← Revisiones**, código, título, estado y las secciones **Documentos**, **Pasos** e **Historial**. La dirección del navegador termina en `?obra=…&revision=…` |
| A5 | En Documentos, pulsa un documento | Se abre la vista previa **de la versión que se revisa**, con el nombre y la versión por separado. Si después se subió una versión más nueva, aparece la etiqueta «hay vN» |
| A6 | Mira Pasos | Cada paso dice su papel (Revisa, Aprueba o Aprueba y cierra), el responsable, el estado, el plazo o «Sin plazo», y quién actuó y cuándo |
| A7 | Mira Historial | Cuenta en orden lo que pasó: creación, pasos iniciados, conformidades, aprobaciones, rechazos y sustituciones |
| A8 | Abre una revisión en curso cuyo paso **no** sea tuyo | No hay botones de acto y dice «Este paso le corresponde a …», aunque seas administrador |
| A9 | Pulsa **← Revisiones**; luego usa **Atrás** y **Adelante** del navegador; después ve a **Archivos** | Atrás y Adelante cierran y reabren el detalle. Al salir a Archivos, la dirección ya no lleva `revision=` |
| A10 | Ve a la portada (Hub), sección **Mi trabajo**, y pulsa una fila de tipo *Revisión* | Se abre directamente el detalle, con la obra ya elegida (si no tienes nada pendiente, se comprueba en C1) |
| A11 (opcional) | Si el filtro **Bloqueadas** muestra alguna, ábrela | Dice «La revisión no puede avanzar» y el motivo. Si eres administrador general, verás **Sustituir revisor…**: no lo uses en una real |

## B · Crear dos revisiones de prueba

**B0.** En la obra, ve a **Administración → Participantes → + Añadir persona a esta obra** y añade la cuenta A y la cuenta B. Ojo: en «Enviar a revisión», la lista de revisores enseña a toda la entidad, también a quien no participa o tiene el acceso retirado (hallazgo H3). Elige solo esas dos.

**B1.** En **Archivos**, entra en la carpeta de prueba, selecciona los dos PDF y pulsa **Enviar a revisión**.

**B2.** Rellena la primera:
- **Título:** `PRUEBA E1 — T1`.
- **Flujo de revisión**, si aparece: «— a mano, paso a paso —».
- **Secuencia de revisores:** pulsa primero la **cuenta A** y después la **cuenta B**. El paso 1 queda en **REVISA** y el 2 en **APRUEBA**. En el paso 1, escribe **1** en «d. cal.» (el plazo en días).
- **Al aprobar, los documentos pasan a:** Compartido.
- **Al aprobarse, ¿para qué queda autorizado?:** sin especificar.
- Pulsa **Iniciar revisión**. Debe salir «Revisión iniciada».

**B3.** Repite con `PRUEBA E1 — T2`: **cuenta B primero** (cambia su paso a **APRUEBA**) y **cuenta A segunda** (APRUEBA).

Si al crearla sale un error:
- «… no pertenece a esta obra …»: esa cuenta no participa en la obra; vuelve a B0.
- Error de acceso a los documentos: esa cuenta no puede ver la carpeta.

**No cambies el «Flujo de revisión» después de elegir revisores**: borra la secuencia (hallazgo H2).

## C · Actuar sobre las revisiones de prueba

En esta tabla, **«Tú» es la cuenta A** y **«Colega» es la cuenta B**. Entra con cada una en un navegador o perfil distinto.

| # | Quién | Haz esto | Debe pasar |
|---|---|---|---|
| C1 | Tú | Revisiones, filtro **Me toca**; luego mira **Mi trabajo** en la portada | T1 sale con la marca **Te toca**; T2 no, porque su primer paso es de tu colega. En Mi trabajo, la fila de T1 abre su detalle |
| C2 | Tú | Abre T1 | Aparece **Te toca actuar**, con la consecuencia («Queda registrada tu conformidad y la revisión pasa al paso 2 …»), **Comentario (opcional)** y los botones **Dar conformidad** y **Rechazar**. El paso 1 muestra su plazo |
| C3 | Tú | Escribe un comentario y pulsa **Dar conformidad** | Primero sale una confirmación que repite la consecuencia. Al confirmar, un aviso verde; el paso 1 queda hecho con tu comentario y el paso 2 pasa a estar en curso |
| C4 | Tú | Vuelve a la lista y abre T1 otra vez | Ya no hay botones: «Este paso le corresponde a …» (tu colega). La conformidad aparece en el historial |
| C5 | Colega | Abre T2 | Ve **Aprobar**, no «Aprobar y cerrar», y la consecuencia de que pasa a tu paso |
| C6 | Colega | Pulsa **Aprobar** y confirma | T2 pasa a tu paso |
| C7 | Tú | Abre T2 **en dos pestañas** | Las dos muestran **Aprobar y cerrar**, con la consecuencia de que la revisión se cierra y los documentos pasan a Compartido |
| C8 | Tú | En la primera pestaña, pulsa **Aprobar y cerrar** y confirma | T2 queda **Aprobada**, con fecha de cierre, y en Archivos los dos PDF aparecen como Compartido |
| C9 | Tú | En la segunda pestaña, sin recargar, pulsa **Aprobar y cerrar** | Avisa «Otra persona actuó antes: la revisión ya no está en curso. Se ha vuelto a cargar.» y ahora la muestra Aprobada. No se registra un segundo acto |
| C10 | Colega | Abre T1 y pulsa **Rechazar**, con un comentario | T1 queda **Rechazada** y los documentos no cambian de estado |
| C11 | Tú | Filtros **Terminadas** e **Iniciadas por mí** | T1 y T2 aparecen en los dos |

## D · Enlace y sesión

| # | Haz esto | Debe pasar |
|---|---|---|
| D1 | Abre T1, copia la dirección del navegador y pégala en otra pestaña | Se abre T1 directamente |
| D2 | Cierra sesión, pega el enlace e inicia sesión | Tras entrar se abre T1, sin pasar por la lista de obras |
| D3 (opcional) | Pasa el enlace de T1 a alguien que **no** sea de la obra | Le avisa «No tienes acceso a la obra de esa revisión, o ya no existe.» y no ve nada de la revisión |

## E · Teclado, pantalla ancha y lector de pantalla

| # | Haz esto | Debe pasar |
|---|---|---|
| E1 | Sin ratón: con **Tab** llega a los filtros, a una revisión de la lista, a **← Revisiones** y a los botones del detalle, y actívalos con **Enter** y también con **Espacio** | Todo responde a las dos teclas y siempre se ve dónde está el foco |
| E2 | En la ventana de confirmación, usa Tab, Enter y Esc | Se puede confirmar y cancelar sin ratón |
| E3 | Pon la ventana maximizada en un monitor ancho | Lista y detalle se leen bien, sin textos estirados, montados ni cortados |
| E4 (opcional) | Usa el Narrador de Windows (Ctrl+Win+Enter) o NVDA | Cada botón se anuncia con su nombre («Dar conformidad, botón»), los filtros dicen si están pulsados y los avisos se leen solos |

## Qué me devuelves

Una línea por bloque. Por ejemplo:

```
A = OK
B = OK
C = FALLA en C9: salió un error rojo en vez del aviso
D = OK
E = OK (E4 no probado)
```

Con eso cierro la prueba de E1 o corrijo lo que haya salido.

## Qué no forma parte de E1

No lo busques todavía:
- anular y archivar (E2);
- del contrato nuevo (E3 y E4): rondas, «Devolver al iniciador», «Volver al paso anterior», decisión por archivo y cierre separado de la emisión;
- exportación y contadores (E5);
- correo opcional por acción.
