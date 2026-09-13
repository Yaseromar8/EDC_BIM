# Usuarios · administrador único y eliminar usuarios

13-sep-2026. **Solo análisis:** no se ha cambiado nada, ni en el código ni en producción. Todo sale del código actual y de tu captura de la tabla de usuarios.

## 1 · Lo que hay hoy

### Dos administradores de la entidad

| Cuenta | Qué es |
|---|---|
| «Yaser Omar» (`omarsanchezh8@…`) | Tu cuenta principal |
| «yaser omar 02» (`yaseromarsanchez8@…`, id 19) | El **segundo custodio** que decidiste el 22-ago y nombraste el 23-ago (`docs/entidad/76-decisiones-de-gate-custodio-y-go.md`) |

- **Por qué existe:** si pierdes la cuenta principal (contraseña o segundo factor), sigue habiendo alguien que puede administrar. Como es otra cuenta tuya, no cubre el caso de que tú no estés disponible.
- **Quitarle el rol ya se puede hacer desde la interfaz**, sin programar nada:
  1. Entra con tu cuenta **principal**.
  2. Abre cualquier obra.
  3. En el menú izquierdo, **Administración → Usuarios del sistema**.
  4. En «yaser omar 02», cambia el rol y confirma **«Quitar administrador»**.
- **Por qué lo permite el servidor:** queda otro administrador activo (tú). No deja quitarse el rol a uno mismo ni dejar la plataforma sin administrador. Además cierra al momento las sesiones de esa cuenta.
- **Qué se pierde:** esa puerta de recuperación. Si después pierdes la cuenta principal, te quedan los **códigos de recuperación del segundo factor** y, como último recurso, el guion `backend/herramientas/recuperar_custodia.py`, que se ejecuta con la credencial de la aplicación. **Antes de quitarlo, confirma que tienes esos códigos a mano.**

### La papelera de la tabla no elimina: retira el acceso

- **Qué hace «Retirar acceso» (la papelera):** desactiva la cuenta y cierra sus sesiones, pero conserva lo que hizo. Por eso la fila se queda como DESACTIVADO, con el botón «Reactivar». Es deliberado: el borrado físico que había antes se llevaba por delante quién hizo qué.
- **El borrado real existe en el servidor** (`DELETE /api/users/<id>?purgar=1`), pero no está en la pantalla, también a propósito.
- **Las filas de administrador no tienen ni papelera ni «Reactivar».**

**Qué pasaría al borrar de verdad a alguien**, según las reglas de la base:

| Efecto | Dónde |
|---|---|
| Se borra con la cuenta | Sesiones, membresías de obra, permisos de carpeta, acceso a herramientas, roles de cuenta y segundo factor |
| Se queda sin autor | Algunas referencias pasan a vacío; por ejemplo, las vistas guardadas |
| **La base se niega a borrar** | Si la persona es autora, responsable, verificadora o emisora en incidencias, submittals, protocolos, cuaderno de obra o sincronización de campo |
| No se toca | Lo que guarda el nombre o el correo como texto (revisiones, historial, registro de accesos): queda como huella histórica |

## 2 · Propuesta

### U1 · Administrador único

**Hecho por el propietario el 13-sep**, según sus capturas: id 19 pasó al perfil «Editar» y queda un solo ADMIN, «Yaser Omar».

Es un acto tuyo y se puede hacer hoy: quitarle el rol a id 19 como se explica arriba.

- Si ya no usas esa cuenta, además puedes retirarle el acceso.
- Si la conservas como usuario normal, **te sirve como segunda cuenta para la prueba de E1**. Para eso añádela como participante de la obra de prueba, porque al dejar de ser administradora ya no entra en todas las obras.

### U2 · Lista limpia sin perder el rastro

Es un desarrollo pequeño:
- la tabla muestra por defecto solo cuentas **activas y pendientes**;
- las retiradas pasan detrás de un filtro **«Mostrar retiradas»**;
- no se borra ningún dato.

### U3 · Eliminar definitivamente, con dos candados

También es un desarrollo pequeño:
- **Dónde aparece:** un botón **«Eliminar definitivamente»**, solo en cuentas **ya retiradas** y **no administradoras**. Hay que confirmar escribiendo el correo de la cuenta.
- **Primer candado:** antes de borrar, el servidor **cuenta la huella** de la persona. Incluye documentos subidos, revisiones creadas o asignadas, transmittals, incidencias, submittals, protocolos, cuaderno y actividad; la lista exacta se medirá al implementarlo.
- **Segundo candado:** si hay huella, **no borra** y dice qué la retiene; la cuenta sigue retirada y oculta, como en U2. Si no hay huella, borra y lo anota en el registro de accesos.

Resultado: las cuentas de prueba que nunca hicieron nada se pueden eliminar. Quien trabajó en una obra se queda como retirada, porque su nombre sostiene el expediente.

### Alcance de U2 y U3

- Backend: el conteo de huella y el borrado con sus candados.
- Pantalla de Usuarios: el filtro y el botón.
- Pruebas y banco local.
- Commit, push y despliegue con tu autorización, como siempre.

No toca Reviews ni E1.

## 3 · Lo que necesito que decidas

| # | Decisión | Recomendación |
|---|---|---|
| U1 | ¿Quitar el segundo custodio (id 19) y quedarte como único administrador? | **Hecho** el 13-sep por el propietario |
| U1b | ¿Qué hacemos con id 19 después: usuario normal o retirada? | **Hecho:** perfil «Editar». Para la prueba de E1, añadirla como participante de la obra de prueba |
| U2 | ¿Ocultar por defecto las cuentas retiradas, con un filtro para verlas? | Sí |
| U3 | ¿Eliminar definitivamente solo sin huella, o también con huella? | Solo sin huella. Con huella se rompería quién hizo qué, y la base ya lo impide en varios módulos |
| U4 | ¿Cuándo? | U1 ya, porque es un clic. U2 y U3 después de la prueba de E1, o antes si la lista te estorba |
| U5 | ¿Unificar las dos pantallas de cuentas en la pestaña Usuarios de la portada? (ver §4) | Sí, y junto con U2 y U3: es la misma pantalla |

## 4 · Tres pantallas de usuarios (añadido el 13-sep)

Hoy hay tres sitios, pero son **dos niveles**:

| Pantalla | Dónde | Nivel | Qué deja hacer |
|---|---|---|---|
| **Usuarios** | Portada → pestaña Usuarios | Entidad: todas las cuentas | Invitar, ver empresa y cargo, retirar acceso, reactivar y reinvitar. **El perfil solo se ve, no se cambia** |
| **Usuarios del sistema** | Dentro de una obra → Administración | Entidad: **las mismas** cuentas | **Solo cambiar el perfil** (Ver, Usar o Editar). No dice si una cuenta está retirada o pendiente, y no deja invitar ni retirar |
| **Participantes** | Dentro de una obra → Administración | Obra | Quién participa en esa obra, su empresa y función contractual, si administra la obra, sus herramientas, y añadir o quitar personas |

**El problema:** las dos primeras administran lo mismo, las cuentas de la entidad, cada una a medias:
- para cambiar un perfil, que vale para toda la entidad, hay que entrar en una obra;
- la pantalla de dentro de la obra enseña las cuentas retiradas como si estuvieran activas.

**U5 · Una sola pantalla de cuentas**
- La pestaña **Usuarios** de la portada pasa a tenerlo todo: invitar, cambiar el perfil (con el mismo selector y las mismas protecciones), empresa y cargo, retirar y reactivar, más lo de U2 y U3.
- **«Usuarios del sistema» sale del menú de la obra**, o queda solo como enlace a la portada.
- **Participantes no cambia**: es el nivel de obra.

Quedan dos niveles, cuenta y obra, igual que ACC separa la administración de la cuenta (Account Admin) de la de cada proyecto (Project Admin).
