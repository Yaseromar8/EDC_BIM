# 48 · Simulación: alguien compra una cuenta y entra de cero — PASO A PASO, CONTRA EL CÓDIGO DE HOY

29-oct-2026. Solo análisis. El dueño: «me interesa primero poder separar. Que simulemos que algún usuario compre una
cuenta y cómo accedería de cero».

Cada paso tiene cuatro partes:
- **qué ve el usuario**;
- **qué pasa por dentro**;
- **qué hace hoy ALEPHIA**, comprobado en el código;
- **qué falta** para que la separación sea real.

Marcas: ✓ funciona igual que en el diseño · ✗ hoy se cruza o no existe · ◐ existe a medias.

Personajes de la simulación (inventados):
- **Carla**, ingeniera independiente, compra una **cuenta personal**.
- La **Municipalidad Distrital de San Isidro de Prueba** compra una **cuenta de entidad**. Invita a su contratista
  (**Constructora Andes**) y a su supervisión. La supervisión contrata a Carla.
- **Tú**, como operador de la plataforma (ALEPHIA).

## A · Carla compra una cuenta personal

| # | Lo que ve Carla | Por dentro | Hoy | Falta |
|---|---|---|---|---|
| A1 | En `alephia.com.pe` pulsa **«Crear cuenta»** y elige **Personal**: plan, cuotas (p. ej. 3 obras y 5 GB) y pago | Se crea una **cuenta** de tipo personal, con Carla como dueña, y su **identidad** (correo y contraseña o Google) | ✗ **El alta está cerrada**: `/api/auth/register` solo funciona con invitación (`ALLOW_OPEN_REGISTRATION=false`), y entrar con Google sin invitación devuelve «pide al administrador que te invite». **No hay tabla de cuentas, planes ni pago** | La tabla **cuentas** (tipo, plan, cuotas, estado, región), el alta pública que crea solo una cuenta personal vacía, la verificación del correo (ya hay `mailer.py` con Resend) y la pasarela de pago (al principio, alta con un código de prueba sin pago) |
| A2 | Primera entrada: **«Mi espacio»**, vacío | La sesión lleva **la cuenta activa** | ◐ La **lista de obras sí sale vacía**: `GET /api/projects` filtra por pertenencia ✓. Pero ✗ **`GET /api/hubs` es público** y le enseñaría los nombres de todas las municipalidades y cuántas obras tienen | La cuenta activa en la sesión, el selector de cuenta en la barra (como Tandem y ACC) y `/api/hubs` con sesión |
| A3 | Pulsa **«Nueva obra»** | La obra nace **dentro de su cuenta**, si la cuota lo permite | ✗ **Solo el administrador de la plataforma** puede crear obras o hubs (`@requiere_rol('admin')` en `POST /api/projects` y `POST /api/hubs`) | Que el **dueño o el administrador de la cuenta** cree obras en su cuenta, con cuota |
| A4 | Sube su **RVT** | El archivo va a Google Cloud y se traduce en Autodesk | ◐ Se guarda y se traduce. ✗ **La ruta en Google Cloud no lleva la cuenta** y **hay un solo bucket de Autodesk**. ✗ El **token público del visor lleva `data:read`** (doc 47 §3) | Prefijo de cuenta en las rutas; bucket por cuenta; token `viewables:read` |
| A5 | Abre **View**: su modelo, la Planilla y el Tablero | Todo cuelga de su obra | ✓ Planilla, Tablero, vistas y observaciones van **por obra**, vigiladas por `guardia_de_obra` | — |
| A6 | Crea su empresa **«Carla Ingeniería»** y una plantilla de obra | Catálogos **de su cuenta** | ✗ `companies` y `plantillas_de_obra` son **globales**: **su empresa y su plantilla aparecerían a todos los clientes**, y ella vería las de los demás | Catálogos por cuenta |
| A7 | Invita a un compañero de estudio | Entra a **su** obra, dentro de la cuota | ◐ Hay invitación por correo con enlace firmado, pero hoy la emite el administrador | Que la emita el dueño de la cuenta, con cuota |

## B · La municipalidad compra una cuenta de entidad

| # | Lo que pasa | Por dentro | Hoy | Falta |
|---|---|---|---|---|
| B1 | Firma el contrato. **Tú** creas la cuenta de entidad y su **primer administrador** (el jefe de la oficina de infraestructura) | Cuenta de tipo entidad: plan, región y doble factor **obligatorio** | ◐ Existe `hubs` («municipalidades/cuentas»), pero ✗ el único administrador que existe es **el de la plataforma** (`role='admin'`), que **ve todas las obras de todos** | **Administrador de cuenta** distinto del **operador**. El operador crea la cuenta y su primer administrador, y **después no ve sus datos** salvo un acceso de emergencia registrado |
| B2 | El administrador de la municipalidad configura sus empresas, plantillas, idoneidad y roles | Todo **de su cuenta** | ✗ Catálogos globales; ◐ el doble factor obligatorio es hoy un ajuste global (`EXIGIR_2FA`), no por cuenta | Catálogos y ajustes **por cuenta** |
| B3 | Crea la obra **«Pistas y veredas del jirón Unión»** e invita a Constructora Andes y a la supervisión **sin costo para ellos** | Colaboradores gratis en una cuenta que paga (doc 46) | ◐ La obra y las invitaciones existen, pero las crea el administrador de la plataforma | Que el administrador **de la cuenta** cree e invite |
| B4 | **Carla**, que ya tenía su cuenta personal, recibe la invitación de la supervisión | **La misma identidad**, ahora miembro de una obra de **otra cuenta** | ◐ Hoy hay una sola lista de usuarios y la membresía va por obra ✓; no existe el concepto de «cuenta» | En la barra, Carla ve **dos cuentas**: «Mi espacio» y «Municipalidad San Isidro de Prueba». **Sus obras personales nunca salen en la cuenta de la municipalidad**, y la municipalidad **no ve su cuenta personal** |
| B5 | Constructora Andes sube un plano en su carpeta de trabajo (WIP) | **Regla tipo Aconex**: solo lo ve ella hasta que lo comparte | ◐ Hay estados ISO 19650 y permisos por carpeta, pero el administrador de obra lo ve todo | Que el WIP de cada organización sea suyo, también frente al administrador de la obra |
| B6 | La municipalidad mira su **centro de datos** | Solo sus obras; nunca de otra cuenta | ✓ hoy por obra; la vista entre obras no existe | Vista entre obras **solo dentro de la cuenta** |
| B7 | Termina el contrato | Exportación completa, después **supresión con constancia**, conservación máxima de 2 años (ley, arts. 29–31) | ◐ Hay copia y restauración de toda la base; no por cuenta | Exportación y supresión **por cuenta** |

## C · La prueba que demuestra que no se cruza nada

Con la cuenta de Carla y la de la municipalidad **en una base de ensayo** (nunca en producción), una prueba automática
hace, **ruta por ruta**:
- desde la sesión de Carla en «Mi espacio»: intentar **listar, leer, descargar y escribir** cualquier cosa de la
  municipalidad (obras, documentos, modelos, Planilla, Tablero, empresas, plantillas, enlaces, archivos de Google Cloud
  y de Autodesk). **Todo debe fallar**;
- desde el administrador de la municipalidad: lo mismo contra «Mi espacio» de Carla. **Todo debe fallar**;
- desde Carla dentro de la obra de la municipalidad: **solo** lo que su rol permite en esa obra;
- desde el operador: **nada sin el acceso de emergencia**, y el acceso de emergencia queda registrado.

Si una sola ruta deja pasar algo, **el despliegue se bloquea**. Ya existe la base:
`backend/tests/test_cobertura_autorizacion.py` y los ensayos contra una base desechable (`herramientas/ensayo_*.py`).

## D · Lo mínimo para que esta simulación salga entera en verde

| # | Qué | Cierra los pasos |
|---|---|---|
| M1 | **Tabla de cuentas** (entidad o personal) y **la cuenta de cada obra**. El `hub` de hoy pasa a ser la cuenta | A1, B1 |
| M2 | **La cuenta activa en la sesión** y el selector de cuenta | A2, B4 |
| M3 | **Administrador de cuenta ≠ operador de plataforma**: el administrador de cuenta crea obras e invita, con cuota; el operador sin acceso por defecto | A3, A7, B1, B3 |
| M4 | **`/api/hubs` con sesión** y filtrado por cuenta | A2 |
| M5 | **Catálogos por cuenta**: empresas, plantillas, cargos, perfiles y roles | A6, B2 |
| M6 | **Token del visor en `viewables:read`** | A4 |
| M7 | **Prueba de cruce entre cuentas** (§C), que bloquee el despliegue | todo |
| M8 | Alta personal desde la web, primero **con código de prueba y sin pago**; el pago, después | A1 |

Después, para endurecer: seguridad por filas en la base, prefijos de cuenta en Google Cloud, bucket de Autodesk por
cuenta, regla tipo Aconex, y exportación y supresión por cuenta (doc 47 §2).

**Cómo verlo funcionando sin tocar producción:** cuando M1–M7 estén hechos, se crea una **base de ensayo desechable**
con las dos cuentas de este documento. Se recorren los pasos A y B en el banco, y se pasa la prueba del §C. Así lo
verías tú con tus propios ojos antes de vender.

## E · Decisiones del dueño

1. ¿Empezamos por **M1–M7** (la separación) antes que por el pago (M8)?
2. ¿El `hub` de hoy se convierte en la **cuenta**? Las obras actuales quedarían en tu cuenta de entidad.
3. Cuotas iniciales de la cuenta personal: ¿cuántas obras, cuánto almacenamiento y cuántos modelos?
