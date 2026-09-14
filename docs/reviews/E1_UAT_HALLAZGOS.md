# E1 · Hallazgos de la prueba en producción

13-sep-2026.

**Estado:**
- **Primera parte (H1–H4):** creación de las revisiones de prueba. Corregida en E1.1 (`8875f9e`) y desplegada el 13-sep.
- **Segunda parte (H5–H9):** tu prueba de la noche, bloques C y D.
  - **E1.2 corrige H5, H6 y H9 y aplica H7-A (avisar).** Está en producción desde el 13-sep (`27e1a42`): `E1_2_INFORME_DE_CIERRE.md`.
  - H8 ya quedó corregido en la guía.
  - B (impedir) queda fuera.

## Primera parte · crear las revisiones de prueba (bloque B)

**Ninguno lo introdujo E1.** El alta de revisiones (`ReviewModal`), las reglas del alta en el servidor y la pantalla de Participantes son las mismas que en `5967760`.

### H1 · Un administrador de la entidad no puede ser revisor — DEFECTO

**Qué pasó (imagen 1).** Al crear T1 con «Yaser Omar» en el paso 1, el servidor respondió «Yaser Omar no pertenece a esta obra, asi que no puede revisar el paso 1. Anadelo a la obra primero.»

**Por qué.** Dos reglas se contradicen:
- **Para revisar hay que participar en la obra.** El alta lo comprueba paso a paso ([reviews.py:122](../../backend/routes/reviews.py), código `REVISOR_FUERA_DE_LA_OBRA`). El motivo está escrito en el código: sin membresía, el encargo no se puede abrir y la revisión nacería bloqueada.
- **Un administrador de la entidad no se puede añadir como participante.** «Añadir persona a esta obra» lo excluye a propósito, porque alcanza todas las obras sin ser participante ([administracion.py:176](../../backend/routes/administracion.py)). La lista de acceso de la portada tampoco lo ofrece: solo muestra cuentas que no son administradoras.

**Resultado.** El mensaje pide algo que la interfaz no deja hacer. Tu cuenta principal no puede ser revisora en ninguna obra.

**Propuesta R-H1.** Permitir añadir a un administrador de la entidad como participante de una obra, igual que a cualquier otra persona:
- sigue administrándolo todo sin necesidad de participar;
- solo entra en el equipo de una obra si se le añade, y entonces puede revisar en ella.

Se descarta eximirlo de la regla, porque revisar sin estar en el equipo de la obra rompe el control de quién participa.

**Mientras tanto.** La guía usa dos cuentas revisoras que no son administradoras, añadidas como participantes en el paso B0.

### H2 · Cambiar el «Flujo de revisión» borra los revisores elegidos — DEFECTO DE EXPERIENCIA

**Qué pasó (imagen 2).** Con los revisores ya puestos, al tocar el selector de flujo la secuencia se vació.

**Qué hace hoy el código** ([ReviewsModule.jsx:49](../../frontend-docs/src/components/ReviewsModule.jsx)):
- **Elegir una plantilla** sustituye la secuencia por la de la plantilla, sin avisar.
- **Volver a «— a mano, paso a paso —»** vacía la secuencia.
- **Tocar los pasos después de elegir una plantilla** los conserva, pero la revisión deja de constar como aplicación de esa plantilla: es el aviso amarillo de la imagen 1. Esto es correcto.

**Lo correcto y lo que no.** Que una plantilla imponga sus pasos está bien, porque el flujo lo define ella. Lo que no está bien es perder sin aviso lo que ya escribiste.

**Propuesta R-H2.**
- Si ya hay revisores y eliges una plantilla, pedir confirmación antes: «La plantilla sustituye a los N revisores que has puesto».
- Volver a «a mano» no vacía nada: los pasos que haya quedan como punto de partida editable.

### H3 · La lista de revisores ofrece a quien no se puede elegir — DEFECTO DE EXPERIENCIA

**Qué pasa.** La lista del alta muestra a **toda la entidad**, también a cuentas que el servidor va a rechazar:
- las que no participan en la obra;
- las retiradas. En la imagen 1 salen «Piloto Uno» y «YASER HUAMANI», que están retiradas.

El error solo aparece al pulsar «Iniciar revisión».

**Por qué.** La lista sale de `/api/users`, que a un administrador le devuelve el padrón completo. El servidor, en cambio, exige que el revisor esté activo y participe en la obra ([reviews.py:117](../../backend/routes/reviews.py)).

**Propuesta R-H3.** Que la lista muestre solo a los participantes activos de la obra, con su empresa, y explique cómo añadir a quien falte. Ya estaba anotado fuera de E1 en el contrato: «selector de revisores solo con miembros».

### H4 · Faltan tildes en el mensaje — MENOR

El mensaje de H1 dice «asi» y «Anadelo»; debería decir «así» y «Añádelo» ([reviews.py:131](../../backend/routes/reviews.py)). La pantalla de sustitución ya lo escribe bien ([reviews.py:1406](../../backend/routes/reviews.py)).

### Qué hacer con ellos

| # | Tipo | Propuesta | Qué toca | Prioridad |
|---|---|---|---|---|
| H1 | Defecto | R-H1: poder añadir al administrador como participante | Candidatos y pantalla de Participantes | **Alta**: hoy no puedes revisar tú |
| H2 | Experiencia | R-H2: confirmar antes de sustituir; «a mano» no vacía | Alta de revisiones (pantalla) | Media |
| H3 | Experiencia | R-H3: lista solo con participantes activos | Alta de revisiones (pantalla), con la lista de miembros de la obra que ya existe | Media |
| H4 | Menor | Tildes | Un mensaje | Baja |

Los cuatro tocan el alta o Participantes, que E1 dejó sin cambios a propósito. Necesitan tu autorización como lote aparte y el mismo proceso de siempre: contrato corto, código, pruebas, banco, commit, push y despliegue.

## Segunda parte · bloques C y D (13-sep-2026, noche)

**Lo que viste**
1. «Cuando le di aceptar a uno, el otro también se puso en aceptar.»
2. «Cuando copio el link de uno, me abre el otro.»
3. «En ningún momento usamos algún flujo creado; solo paso a paso.»

**En corto**
- **Los datos no se cruzan.** Repetí tu recorrido en local y cada acto cambió solo su revisión.
- **Lo que viste tiene causas reales:**
  - dos defectos de pantalla de E1 (H5 y H6);
  - una cuestión de diseño (H7);
  - una trampa de la guía (H8).
  - Aparte, las horas salen 5 horas adelantadas (H9).
- **Tienes razón con el flujo:** la guía no probaba uno creado. Lo probé en local y ya está en la guía, como bloque F.

### Cómo lo repetí

**Contra PostgreSQL, con la aplicación real y los permisos activos. Resultado: 29/29**, incluido el flujo creado.
- T1 y T2 con los mismos dos PDF y las mismas dos personas, en el orden de la guía.
- Los actos C3, C6, C8, C9 y C10.
- Tras cada acto:
  - las dos revisiones, vistas por las dos personas;
  - «Me toca» y Mi Trabajo de cada una;
  - la fila de la revisión que no se tocó, comparada byte a byte con la de antes.

**En la pantalla real:** el portal construido con el código de hoy, contra el backend del banco y con personas ficticias.
- Mi trabajo → detalle.
- Lista → detalle, Atrás y Adelante.
- El enlace pegado en otra pestaña.
- Archivos y Adelante.
- Una confirmación abierta y Atrás.
- La lista vista por Colega.

### Lo que no pasa (medido)

- Un acto nunca toca la otra revisión: tras cada acto, la fila de la otra sale idéntica.
- Cada enlace abre su revisión, a las dos personas y en otra pestaña.
- «Me toca» y Mi Trabajo dicen lo correcto en cada paso.
- Un segundo «Aprobar y cerrar» avisa de que otra persona actuó antes y no registra nada.

### H5 · La dirección se queda con el enlace de una revisión que ya no ves — DEFECTO DE E1

**Reproducido en pantalla:**
1. Lista → abrir T2 → «← Revisiones».
2. Archivos.
3. **Adelante** del navegador, del ratón o del touchpad.

**Qué pasa:**
- La dirección vuelve a `?obra=…&revision=` de T2, pero la pantalla sigue en Archivos. Si la copias ahí, copias el enlace de T2.
- Al pulsar **Revisiones** se abre T2 directamente, no la lista.
- «Enviar a revisión» entra en Revisiones por el mismo camino, así que después de crear una revisión se puede abrir otra antigua. Esto sale del código: no lo ejecuté en pantalla.

**Por qué.** E1 lee la revisión de la dirección al entrar en Revisiones y la quita al salir. Fuera de Revisiones, Atrás y Adelante cambian la dirección sin que ninguna pantalla la mire.

**Es la causa más probable de «copio el link de uno y me abre el otro».** Pero el caso exacto no lo he reproducido: copiada desde el detalle, la dirección siempre fue la de la revisión que se veía. Para confirmarlo en producción está el paso D4 de la guía.

**Propuesta R-H5.** Que la dirección y la pantalla digan siempre lo mismo:
- si Atrás o Adelante traen una revisión, se abre esa revisión;
- «Revisiones» en el menú y «Enviar a revisión» abren siempre la lista.

### H6 · Una confirmación abierta sobrevive a Atrás — DEFECTO DE E1

**Reproducido en pantalla:**
1. En T1, «Dar conformidad». Sale la confirmación.
2. **Atrás** del navegador.

**Qué pasa:**
- La lista queda debajo y la confirmación «Dar conformidad · RV-…» sigue encima.
- Al aceptarla sale «Conformidad registrada» y T1 avanza, aunque ya no está en pantalla.

**Qué no hace.** No actúa sobre otra revisión: la confirmación lleva el código de la suya y el acto va a esa.

**Propuesta R-H6.** Si la revisión deja de verse, su confirmación se cancela, igual que al pulsar Cancelar.

### H7 · Los mismos documentos pueden estar en dos revisiones en curso — DISEÑO, DECIDES TÚ

**Qué pasa (medido):**
- T1 y T2 se crean con los mismos dos PDF: el servidor lo permite.
- Al cerrar T2, los dos PDF pasan a Compartido. T1 sigue en curso sobre esos PDF ya compartidos, y a Colega le sigue ofreciendo «Aprobar y cerrar».
- Una tercera revisión sobre los mismos PDF se cerró como aprobada sin cambiar nada, y nada lo avisó.

**Por qué parece un cruce.** Cada documento tiene un solo estado, así que lo que emite una revisión se ve desde la otra.

**Qué hace ACC.** No se midió en la auditoría del 12-sep, así que no lo doy por supuesto.

**Opciones:**
- **A · Avisar (recomendada):**
  - en el alta: «PDF-01 ya está en RV-011, en curso»;
  - en el detalle: «Este documento también está en RV-012»;
  - al cerrar, si los documentos ya estaban en su destino, decirlo.
- **B · Impedirlo:** no dejar crear una revisión con una versión que ya está en otra revisión en curso.

A no cambia ninguna regla del servidor. B sí, y conviene decidirla con el contrato nuevo (E3 y E4).

### H8 · La guía hizo que T1 y T2 parecieran la misma — GUÍA

- **Usaban los mismos dos PDF** (H7).
- **Tras C3, «yaser omar 02» tenía las dos pendientes a la vez:** T1 en su paso 2 y T2 en su paso 1.
  - Aprobar una y seguir viendo la otra con «Te toca» era lo esperado, pero la guía no lo decía.
  - En la pantalla del banco, la lista de Colega muestra las dos con «Te toca».

**Corregido en la guía:**
- cada revisión lleva sus propios PDF;
- C5 avisa de que Colega tendrá las dos pendientes;
- el bloque F prueba un flujo creado.

### H9 · La hora de creación y los plazos salen 5 horas adelantados — DEFECTO MENOR

**Evidencia.** Tu captura dice que T2 se creó el «14 set. 2026 12:15:08 a. m.». En Lima todavía era 13 de septiembre.

**Por qué.**
- La fecha de creación y el plazo del paso se guardan sin zona horaria, en hora UTC.
- La pantalla los lee como hora de Lima (UTC−5).
- La fecha de cierre y el historial sí llevan zona. Por eso, en un mismo detalle, la creación y el historial no cuadran.

**De cuándo es.** La forma de guardar esas fechas es anterior a E1; E1 las enseña en la lista y en el detalle.

**Propuesta R-H9.** Devolver esas fechas con su zona horaria, sin migrar datos.

### El flujo creado, probado en local

| Comprobación | Resultado |
|---|---|
| Crear un flujo de obra con dos personas | Nace en la versión 1 |
| Crearlo siendo editor, sin administrar la obra | 403: «Solo un administrador de esta obra puede definir un flujo de revisión.» |
| Un flujo cuyo último paso solo revisa | No se guarda |
| Enviar a revisión, siendo cualquier participante | Lo ve en la lista, y la vista previa pone a las dos personas en orden |
| Crear la revisión con él | Nace con «flujo «…» v1» y los nombres de sus pasos, y le toca a la primera persona |
| Editar el flujo | Pasa a v2 y dice que se aplicó a 1 revisión. La revisión abierta conserva sus pasos y sigue en v1 |
| Deshabilitarlo | No deja crear otra revisión con él (409). La abierta sigue su curso hasta cerrarse |
| Aplicarlo siendo su único revisor | Se rechaza: hace falta al menos un revisor distinto de quien crea |

**Sin ver en la pantalla real: «Enviar a revisión».** Pasa lo mismo que en E1.1: el panel del banco no pinta la tabla de archivos. Lo cubren el ensayo y el banco del alta, y lo verás tú en el bloque F.

### Qué hacer con ellos

| # | Tipo | Propuesta | Qué toca | Prioridad |
|---|---|---|---|---|
| H5 | Defecto de E1 | R-H5: dirección y pantalla siempre iguales | El enlace de revisión (`App_Refactor`, `useFileExplorer`, `ReviewsModule`). No toca `FilesPage` | **Alta** |
| H6 | Defecto de E1 | R-H6: cancelar la confirmación si la revisión deja de verse | El detalle de la revisión y el diálogo de confirmación | Media |
| H7 | Diseño | A (avisar) o B (impedir) | Alta y detalle; con B, también el servidor | **Decides tú** |
| H8 | Guía | Ya corregida | La guía | Hecho |
| H9 | Defecto menor | R-H9: fechas con zona horaria | La lectura de revisiones | Baja |

H5, H6 y H9 irían juntos como **E1.2**, con el proceso de siempre: contrato corto, código, pruebas, banco, commit, push y despliegue. H7 espera tu decisión.
