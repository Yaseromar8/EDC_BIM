# E1 · Hallazgos de la prueba en producción

13-sep-2026. Salen de la parte B de la guía: crear las revisiones de prueba.

**Ninguno lo introdujo E1.** El alta de revisiones (`ReviewModal`), las reglas del alta en el servidor y la pantalla de Participantes son las mismas que en `5967760`.

## H1 · Un administrador de la entidad no puede ser revisor — DEFECTO

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

## H2 · Cambiar el «Flujo de revisión» borra los revisores elegidos — DEFECTO DE EXPERIENCIA

**Qué pasó (imagen 2).** Con los revisores ya puestos, al tocar el selector de flujo la secuencia se vació.

**Qué hace hoy el código** ([ReviewsModule.jsx:49](../../frontend-docs/src/components/ReviewsModule.jsx)):
- **Elegir una plantilla** sustituye la secuencia por la de la plantilla, sin avisar.
- **Volver a «— a mano, paso a paso —»** vacía la secuencia.
- **Tocar los pasos después de elegir una plantilla** los conserva, pero la revisión deja de constar como aplicación de esa plantilla: es el aviso amarillo de la imagen 1. Esto es correcto.

**Lo correcto y lo que no.** Que una plantilla imponga sus pasos está bien, porque el flujo lo define ella. Lo que no está bien es perder sin aviso lo que ya escribiste.

**Propuesta R-H2.**
- Si ya hay revisores y eliges una plantilla, pedir confirmación antes: «La plantilla sustituye a los N revisores que has puesto».
- Volver a «a mano» no vacía nada: los pasos que haya quedan como punto de partida editable.

## H3 · La lista de revisores ofrece a quien no se puede elegir — DEFECTO DE EXPERIENCIA

**Qué pasa.** La lista del alta muestra a **toda la entidad**, también a cuentas que el servidor va a rechazar:
- las que no participan en la obra;
- las retiradas. En la imagen 1 salen «Piloto Uno» y «YASER HUAMANI», que están retiradas.

El error solo aparece al pulsar «Iniciar revisión».

**Por qué.** La lista sale de `/api/users`, que a un administrador le devuelve el padrón completo. El servidor, en cambio, exige que el revisor esté activo y participe en la obra ([reviews.py:117](../../backend/routes/reviews.py)).

**Propuesta R-H3.** Que la lista muestre solo a los participantes activos de la obra, con su empresa, y explique cómo añadir a quien falte. Ya estaba anotado fuera de E1 en el contrato: «selector de revisores solo con miembros».

## H4 · Faltan tildes en el mensaje — MENOR

El mensaje de H1 dice «asi» y «Anadelo»; debería decir «así» y «Añádelo» ([reviews.py:131](../../backend/routes/reviews.py)). La pantalla de sustitución ya lo escribe bien ([reviews.py:1406](../../backend/routes/reviews.py)).

## Qué hacer con ellos

| # | Tipo | Propuesta | Qué toca | Prioridad |
|---|---|---|---|---|
| H1 | Defecto | R-H1: poder añadir al administrador como participante | Candidatos y pantalla de Participantes | **Alta**: hoy no puedes revisar tú |
| H2 | Experiencia | R-H2: confirmar antes de sustituir; «a mano» no vacía | Alta de revisiones (pantalla) | Media |
| H3 | Experiencia | R-H3: lista solo con participantes activos | Alta de revisiones (pantalla), con la lista de miembros de la obra que ya existe | Media |
| H4 | Menor | Tildes | Un mensaje | Baja |

Los cuatro tocan el alta o Participantes, que E1 dejó sin cambios a propósito. Necesitan tu autorización como lote aparte y el mismo proceso de siempre: contrato corto, código, pruebas, banco, commit, push y despliegue.
