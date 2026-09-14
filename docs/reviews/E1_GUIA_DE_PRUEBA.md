# E1 y E1.1 · Guía de prueba en producción

13-sep-2026, revisada tras tu prueba de la noche. **Requiere E1.1 desplegado:** backend `8875f9e` en Virginia y el portal con E1.1. Antes de empezar lo compruebo yo.

**Si ya hiciste A–E, no las repitas.**
- Te falta el bloque **F**, con un flujo creado.
- Si quieres confirmar en producción la causa del enlace cruzado, haz también **D4**.
- Lo que salió en tu prueba está en `E1_UAT_HALLAZGOS.md` (H5–H9).

La guía entera lleva entre 40 y 50 minutos; el bloque F, unos 15. Marca cada paso con ✅ o ❌. Si algo falla, anota el número del paso y, si puedes, haz una captura.

## 0 · Antes de empezar

**Qué necesitas**
- **Dos cuentas:**
  - **«Tú»:** tu cuenta principal (Yaser Omar).
  - **«Colega»:** «yaser omar 02», abierta en tu otro perfil de Chrome.
  - Hacen falta dos porque quien crea una revisión no puede ser su único revisor, y la misma persona no puede estar en dos pasos.
- **Una carpeta de prueba con seis PDF recién subidos** (sirve cualquier PDF). Aquí se llaman PDF-1 a PDF-6, y **cada revisión de prueba lleva los suyos:**
  - T1: PDF-1 y PDF-2;
  - T2: PDF-3 y PDF-4;
  - T3, en el bloque F: PDF-5 y PDF-6.
- **No compartas documentos entre revisiones de prueba.** Cada documento tiene un solo estado. Si dos revisiones llevan el mismo PDF, aprobar una cambia lo que la otra sigue revisando, y parecen cruzadas (H7).

**Qué no hacer**
- **No pulses Dar conformidad, Aprobar, Aprobar y cerrar ni Rechazar en revisiones reales.** Todo queda registrado, y «Aprobar y cerrar» cambia el estado de los documentos.
- **Las revisiones de prueba se quedarán en la obra**, porque anular y archivar llegan con E2. Pon títulos que empiecen por **«PRUEBA E1 —»**.
- **Retirar a alguien de la obra bloquea sus revisiones en curso.** No retires a nadie que tenga revisiones reales pendientes.
- **Mientras no llegue la corrección (E1.2):**
  - con una confirmación abierta, no uses Atrás ni Adelante del navegador (H6);
  - copia la dirección solo desde el detalle de una revisión (H5);
  - ojo con los gestos del touchpad: también van atrás y adelante.

## A · Solo mirar, sobre revisiones reales

No se pulsa ningún botón de acto: no hay riesgo.

| # | Haz esto | Debe pasar |
|---|---|---|
| A1 | Abre la obra y ve a **Revisión y entrega → Revisiones** | Lista con código RV-###, título y estado. Arriba, los filtros **Todas · Me toca · En curso · Bloqueadas · Terminadas · Iniciadas por mí** |
| A2 | Pulsa cada filtro | La lista cambia y el filtro activo queda marcado. «Me toca» solo muestra revisiones cuyo paso actual es tuyo |
| A3 | Si hay más de 20, baja hasta el final | Aparece **Cargar más** y añade las siguientes sin repetir |
| A4 | Abre una revisión | Detalle con **← Revisiones**, código, título, estado, **Documentos**, **Pasos** e **Historial**. La dirección del navegador termina en `?obra=…&revision=…` |
| A5 | En Documentos, pulsa un documento | Se abre la vista previa **de la versión que se revisa**, con nombre y versión por separado. Si hay una versión más nueva, sale «hay vN» |
| A6 | Mira Pasos | Cada paso dice su papel (Revisa, Aprueba o Aprueba y cierra), responsable, estado, plazo o «Sin plazo», y quién actuó y cuándo |
| A7 | Mira Historial | Cuenta en orden lo que pasó: creación, pasos, conformidades, aprobaciones, rechazos y sustituciones |
| A8 | Abre una revisión en curso cuyo paso **no** sea tuyo | No hay botones de acto y dice «Este paso le corresponde a …», aunque seas administrador |
| A9 | Pulsa **← Revisiones**, luego **Atrás** y **Adelante** del navegador, y después ve a **Archivos** | Atrás y Adelante cierran y reabren el detalle. En Archivos, la dirección ya no lleva `revision=` |
| A10 | En la portada, sección **Mi trabajo**, pulsa una fila de tipo *Revisión* | Se abre el detalle con la obra ya elegida. Si no tienes nada pendiente, se comprueba en C1 |

## B · Preparar la prueba (E1.1)

| # | Haz esto | Debe pasar |
|---|---|---|
| B1 | En la obra de prueba ve a **Administración → Participantes → + Añadir persona a esta obra** y abre la lista | **Sales tú** como «Yaser Omar — … · Administrador de la entidad». No salen ni las cuentas retiradas ni quien ya participa |
| B2 | Elígete | **No aparece** la casilla «administra esta obra». Sí aparece la nota «Ya administra toda la entidad. Participar le permite revisar y recibir encargos en esta obra.» |
| B3 | Pulsa **Incorporar**. Repite con «yaser omar 02» si no participa ya | Apareces en la lista y tu fila tiene el botón **×** para retirarte. En «Administra esta obra» dice «Administrador de la entidad» |
| B4 (opcional) | En la portada, abre los accesos de esta obra (Proyectos) y pulsa **Guardar** sin cambiar nada; vuelve a Participantes | **Sigues en la lista**: guardar los accesos ya no te saca de la obra |
| B5 | En **Archivos**, entra en la carpeta de prueba, selecciona **PDF-1 y PDF-2** y pulsa **Enviar a revisión** | La lista de revisores **solo muestra participantes activos de esta obra** (tú, «yaser omar 02» y quien más participe), con empresa y marca de pendiente. Debajo: «Solo aparecen participantes activos de esta obra. ¿Falta alguien? Añádelo en Administración → Participantes.» |

**B6 · El selector de flujo.** Solo si aparece «Flujo de revisión», porque la obra ya tiene flujos. El flujo creado se prueba entero en el bloque F.

| # | Haz esto | Debe pasar |
|---|---|---|
| B6a | Añade a mano dos revisores y elige un flujo | Sale «Aplicar la plantilla · «…» sustituye a los 2 revisores que has puesto. ¿La aplicas?» |
| B6b | Pulsa **Cancelar** (o Esc) | Siguen tus dos revisores y el flujo sigue en «a mano» |
| B6c | Elige otra vez el flujo y pulsa **Sustituir** | Los pasos pasan a ser los del flujo |
| B6d | Vuelve a «— a mano, paso a paso —» | **Se conservan los pasos** y avisa «Has vuelto a «a mano»: se conservan los pasos…» |
| B6e | Quita esos pasos con **×** y sigue con B7 | — |

**B7.** Crea la primera revisión, sobre **PDF-1 y PDF-2**:
- **Título:** `PRUEBA E1 — T1`.
- **Flujo de revisión:** «a mano».
- **Revisores:** pulsa primero **tu nombre** y después **«yaser omar 02»**. El paso 1 queda en **REVISA** y el 2 en **APRUEBA**. En el paso 1 escribe **1** en «d. cal.».
- **Al aprobar, los documentos pasan a:** Compartido. **¿Para qué queda autorizado?:** sin especificar.
- Pulsa **Iniciar revisión**. Debe salir «Revisión iniciada».

**B8.** Crea la segunda, sobre **PDF-3 y PDF-4**: selecciónalos en Archivos y pulsa **Enviar a revisión**.
- **Título:** `PRUEBA E1 — T2`.
- **Revisores:** **«yaser omar 02» primero** (cambia su paso a **APRUEBA**) y **tú segundo** (APRUEBA).

## C · Actuar sobre las revisiones de prueba

«Colega» es «yaser omar 02» en tu otro perfil de Chrome.

| # | Quién | Haz esto | Debe pasar |
|---|---|---|---|
| C1 | Tú | Revisiones, filtro **Me toca**; luego **Mi trabajo** en la portada | T1 sale con **Te toca**; T2 no. En Mi trabajo, la fila de T1 abre su detalle |
| C2 | Tú | Abre T1 | **Te toca actuar**, con la consecuencia («Queda registrada tu conformidad y la revisión pasa al paso 2 …»), **Comentario (opcional)**, **Dar conformidad** y **Rechazar**. El paso 1 muestra su plazo |
| C3 | Tú | Escribe un comentario y pulsa **Dar conformidad** | Confirmación con la consecuencia; al aceptar, aviso verde. El paso 1 queda hecho con tu comentario y el paso 2 pasa a estar en curso |
| C4 | Tú | Vuelve a la lista y abre T1 | Sin botones: «Este paso le corresponde a yaser omar 02». La conformidad aparece en el historial |
| C5 | Colega | Abre T2 | Ve **Aprobar**, no «Aprobar y cerrar», y la consecuencia de que pasa a tu paso. **En su lista, T1 y T2 salen con «Te toca»:** T1 está en su paso 2 y T2 en su paso 1. Es lo esperado, no un cruce |
| C6 | Colega | Pulsa **Aprobar** y confirma | T2 pasa a tu paso. T1 sigue con «Te toca» para Colega |
| C7 | Tú | Abre T2 **en dos pestañas** | Las dos muestran **Aprobar y cerrar**, con la consecuencia de cerrar y pasar a Compartido |
| C8 | Tú | En la primera pestaña, pulsa **Aprobar y cerrar** y confirma | T2 queda **Aprobada** con fecha de cierre. En Archivos, **PDF-3 y PDF-4** salen como Compartido y **PDF-1 y PDF-2 no cambian** |
| C9 | Tú | En la segunda pestaña, sin recargar, pulsa **Aprobar y cerrar** | «Otra persona actuó antes: la revisión ya no está en curso. Se ha vuelto a cargar.», y la muestra Aprobada. No se registra un segundo acto |
| C10 | Colega | Abre T1 y pulsa **Rechazar** con un comentario | T1 queda **Rechazada**, y PDF-1 y PDF-2 no cambian de estado |
| C11 | Tú | Filtros **Terminadas** e **Iniciadas por mí** | T1 y T2 salen en los dos |

## D · Enlace y sesión

| # | Haz esto | Debe pasar |
|---|---|---|
| D1 | Abre T1, copia la dirección y pégala en otra pestaña | Se abre T1 directamente |
| D2 | Cierra sesión, pega el enlace e inicia sesión | Tras entrar se abre T1, sin pasar por la lista de obras |
| D3 (opcional) | Pasa el enlace a alguien que **no** sea de la obra | «No tienes acceso a la obra de esa revisión, o ya no existe.» y no ve nada de la revisión |
| D4 (opcional, confirma H5) | Abre T2 desde la lista y pulsa **← Revisiones**. Ve a **Archivos** y pulsa **Adelante** del navegador. Mira la dirección y después pulsa **Revisiones** | **Sin E1.2 desplegado, esto es H5:** la dirección vuelve a llevar `revision=` aunque sigues en Archivos, y «Revisiones» abre T2 en vez de la lista. **Con E1.2 desplegado:** Adelante abre T2, y «Revisiones» abre la lista |

## E · Teclado, pantalla ancha y lector de pantalla

| # | Haz esto | Debe pasar |
|---|---|---|
| E1 | Sin ratón, con **Tab**, llega a los filtros, a una revisión, a **← Revisiones** y a los botones del detalle; actívalos con **Enter** y con **Espacio** | Todo responde a las dos teclas y se ve dónde está el foco |
| E2 | En la confirmación, usa Tab, Enter y Esc | Se confirma y se cancela sin ratón |
| E3 | Ventana maximizada en un monitor ancho | Lista, detalle, Participantes y el alta se leen bien, sin textos estirados ni cortados |
| E4 (opcional) | Narrador de Windows (Ctrl+Win+Enter) o NVDA | Los botones se anuncian por su nombre, los filtros dicen si están pulsados y los avisos se leen solos |

## F · Un flujo de revisión creado

Un flujo es el molde de pasos que se aplica al crear una revisión. La revisión se queda con una copia: cambiar el flujo después no la toca. Este bloque lo probé entero en local, con la aplicación real contra PostgreSQL.

| # | Quién | Haz esto | Debe pasar |
|---|---|---|---|
| F1 | Tú | **Revisión y entrega → Flujos de revisión → Nuevo flujo** | Se abre «Nuevo flujo de revisión» |
| F2 | Tú | Rellena el flujo (detalle debajo de la tabla) y pulsa **Crear flujo** | «Flujo «PRUEBA E1 — FLUJO» creado». En la lista sale con **v1**, «0 revisión(es) abiertas con él» y sus dos pasos |
| F3 (opcional) | Tú | **Nuevo flujo** con un solo paso de tipo **Revisa**, y pulsa Crear flujo | No se guarda: «El último paso de este flujo sólo revisa, así que la revisión no podría cerrarse nunca…» |
| F4 | Tú | En Archivos, selecciona **PDF-5 y PDF-6** y pulsa **Enviar a revisión**. Título `PRUEBA E1 — T3`. En **Flujo de revisión** elige «PRUEBA E1 — FLUJO · v1 · 2 pasos» | La secuencia pasa a «1. Revisión técnica — yaser omar 02» (REVISA, 2) y «2. Aprobación — Yaser Omar» (APRUEBA). **No toques los pasos:** cambiar uno suelta el flujo y sale el aviso «Has cambiado los pasos…» |
| F5 | Tú | Pulsa **Iniciar revisión** y abre T3 | Debajo del título dice «flujo «PRUEBA E1 — FLUJO» v1». Los pasos llevan su nombre y le toca a yaser omar 02 |
| F6 | Tú | En Flujos de revisión, pulsa **Editar**. Cambia el plazo del paso 1 a **5**, escribe el motivo «prueba» y pulsa **Guardar nueva versión** | Antes de guardar avisa de que las revisiones ya abiertas no cambian. Después: «Guardado — ahora es la versión 2», y la lista dice **v2** y «1 revisión(es) abiertas con él». **T3 sigue diciendo v1** y su plazo no cambia |
| F7 | Tú | Pulsa **Deshabilitar** y abre otra vez Enviar a revisión; luego Cancelar | El flujo sale DESHABILITADO y ya **no se ofrece** en «Flujo de revisión». Si era el único flujo, el selector desaparece. Vuelve a pulsar **Habilitar** |
| F8 | Colega y tú | Colega: **Dar conformidad** en T3. Tú: **Aprobar y cerrar** | T3 queda **Aprobada**. PDF-5 y PDF-6 pasan a Compartido; los demás PDF no cambian |

**F2 · El flujo:**
- **Nombre:** `PRUEBA E1 — FLUJO`. **Alcance:** «Solo esta obra».
- **Paso 1:** «Revisión técnica», **Revisa**, persona «yaser omar 02», **2** días.
- Pulsa **+ Añadir paso**.
- **Paso 2:** «Aprobación», **Aprueba**, persona tú.

## Qué me devuelves

Una línea por bloque. Si solo haces F y D4, basta con esas dos. Por ejemplo:

```
A = OK
B = OK (B6 no aplica: no hay flujos)
C = FALLA en C9: salió un error rojo en vez del aviso
D = OK (D4: sí pasa lo de H5)
E = OK (E4 no probado)
F = OK
```

## Qué no forma parte de esta prueba

- Anular y archivar (E2).
- Del contrato nuevo (E3 y E4): rondas, «Devolver al iniciador», «Volver al paso anterior», decisión por archivo, y cierre separado de la emisión.
- Exportación y contadores (E5).
- Correo opcional por acción.
- Flujos de la entidad, que designan funciones en vez de personas.
- Las correcciones de H5, H6 y H9 (E1.2) y la decisión sobre H7.
- Usuarios: una sola pantalla de cuentas y eliminar definitivamente (U2–U5, pendientes de tu decisión).
