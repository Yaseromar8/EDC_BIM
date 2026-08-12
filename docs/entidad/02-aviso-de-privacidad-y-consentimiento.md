# Aviso de privacidad y consentimiento para el tratamiento de datos personales

**Documento:** 02 — Aviso de privacidad (Ley N.° 29733) y consentimiento para fotografías en obra
**Versión 1.0 - borrador**
**Fecha de emisión:** [PENDIENTE: fecha]
**Emitido por:** [PENDIENTE: razón social del titular del banco de datos]
**Dirigido a:** titulares de los datos personales (usuarios de la plataforma y personal en obra) y, como anexo informativo, al área legal y de TI de la entidad contratante.

> **Advertencia sobre el estado del documento.** Este es un borrador. Contiene datos verificados directamente sobre la plataforma en operación al 12 de agosto de 2026 y huecos marcados como `[PENDIENTE: ...]` que solo puede completar el titular del banco de datos. **No debe entregarse a una entidad pública ni publicarse en obra mientras conserve huecos pendientes o no cuente con la revisión indicada en la sección final.**

---

## Índice

- **Parte A — Aviso de privacidad** (documento formal, Ley N.° 29733 y su reglamento)
- **Parte B — Cartel y formulario de consentimiento para fotografías en obra** (una hoja A4, lenguaje llano, para imprimir)
- **Nota final para el propietario** (no forma parte del aviso; no se entrega a la entidad ni se publica en obra)

---

# PARTE A — AVISO DE PRIVACIDAD

Este aviso se emite conforme a la Ley N.° 29733, Ley de Protección de Datos Personales, y su reglamento, y describe cómo se tratan los datos personales dentro de la plataforma de gestión documental (entorno común de datos) que se describe en este documento.

[PENDIENTE: confirmación por abogado peruano de la norma reglamentaria vigente a la fecha de emisión y de su numeración exacta, así como de la denominación vigente de la autoridad competente. Este borrador cita la Ley N.° 29733 y "su reglamento" sin fijar el número del decreto supremo, para no consignar una referencia que pueda estar desactualizada.]

## A.1. Identidad y domicilio del titular del banco de datos personales

| Dato | Valor |
|---|---|
| Razón social | [PENDIENTE: razón social] |
| RUC | [PENDIENTE: RUC] |
| Domicilio fiscal | [PENDIENTE: domicilio fiscal completo, incluido distrito, provincia y departamento] |
| Correo electrónico de contacto para protección de datos | [PENDIENTE: correo de contacto] |
| Teléfono | [PENDIENTE: teléfono] |
| Responsable designado para atender los derechos del titular | [PENDIENTE: nombres, apellidos y cargo de la persona responsable] |
| Denominación del banco de datos personales | [PENDIENTE: denominación con la que se inscribirá el banco de datos] |
| Código de inscripción en el Registro Nacional de Protección de Datos Personales | [PENDIENTE: **el banco de datos personales no se encuentra inscrito ante el Registro Nacional de Protección de Datos Personales a la fecha de emisión; la inscripción está pendiente de trámite.**] |

**Declaración expresa:** a la fecha de este borrador **no existe un encargado de protección de datos designado formalmente** ni un registro de actividades de tratamiento documentado. Ambas cosas están pendientes.

## A.2. Datos personales que se tratan y de quiénes

Lo que sigue es el inventario real, obtenido mediante consulta de solo lectura de la base de datos el 12 de agosto de 2026. No es una descripción genérica: son los campos y los volúmenes que la plataforma tiene hoy.

### A.2.1. Personas con cuenta de usuario en la plataforma

Se trata de personal de las empresas participantes en la obra que accede a la plataforma. Hoy son **5 cuentas** (1 administrador y 4 usuarios).

| Dato | ¿Se trata? | Detalle |
|---|---|---|
| Nombres y apellidos | Sí | Campo `name`. |
| Correo electrónico | Sí | Es el dato identificativo principal de la cuenta. |
| Contraseña | Sí, cifrada | Se guarda únicamente el resultado de una función de derivación `scrypt` con sal distinta por usuario. **No se guarda ni se puede recuperar la contraseña en claro.** De las 5 cuentas, 3 tienen contraseña establecida y 2 corresponden a invitados que nunca la fijaron. |
| Empresa y cargo | Sí | Referencia a los catálogos internos de empresas (4 registradas) y cargos (10 registrados). |
| Rol dentro de la plataforma | Sí | `admin` o `user`. |
| Fecha de creación de la cuenta y fecha del último acceso | Sí | — |
| Documento Nacional de Identidad (DNI) | **No** | La plataforma no tiene campo de DNI. |
| Teléfono | **No** | No existe el campo. |
| Dirección domiciliaria | **No** | No existe el campo. |
| Fecha de nacimiento | **No** | No existe el campo. |
| Datos de salud, origen étnico, afiliación sindical, ingresos, biometría | **No** | No existen columnas para ello y no se realiza tratamiento biométrico ni reconocimiento facial. |

### A.2.2. Datos de conexión y de actividad

| Origen | Qué contiene | Volumen al 12-ago-2026 |
|---|---|---|
| Sesiones abiertas | Huella criptográfica del token de sesión, identificador del usuario, fecha de inicio y de caducidad. **No se guarda la dirección IP ni el dispositivo.** | 27 sesiones (26 activas) |
| Eventos de autenticación | Correo electrónico, identificador de usuario, **dirección IP**, **identificación del navegador y dispositivo (user-agent)**, tipo de evento y fecha. | 32 eventos (30 accesos correctos, 2 fallidos), **únicamente del 07 al 12 de agosto de 2026**. No existe registro de accesos anterior a esa fecha. |
| Registro de actividad documental | Nombre o correo de quien realizó la acción (en texto), tipo de acción, documento o carpeta afectada y fecha. En 17 de las filas el detalle incluye además la dirección IP. Acciones registradas: subida de archivos, creación de carpetas, eliminación definitiva, cambio de descripción, eliminación, restauración, acceso a documento, renombrado y movimiento. | 1,034 registros, del 22 de marzo al 11 de agosto de 2026, con 6 identificadores distintos de personas |
| Códigos de un solo uso | Correo electrónico y código temporal. | 2 registros de febrero de 2026, ya caducados |

### A.2.3. Nombres de personas dentro de la información de obra

Además de las cuentas, la plataforma contiene nombres de personas escritos en campos de texto de los registros de obra:

- **Pines de seguimiento en campo** (34 registros): 2 contienen el nombre de trabajadores de obra en el campo de personal, junto al equipo y la actividad realizada.
- **Consultas técnicas — RFI** (25 registros): campo de responsable con el nombre de una profesional.
- **Anotaciones sobre planos — redlines** (33 registros): campo de responsable con nombre.
- **Transmittals** (1 registro): destinatarios en formato JSON, con nombre y correo electrónico.
- **Reportes diarios** (1 registro): recuento de personal (una cifra, sin nombres) y autor del reporte.
- **Documentos compartidos con externos**: hoy **0 registros**, pero la funcionalidad está diseñada para almacenar la lista de correos electrónicos de los destinatarios externos con quienes se comparta un documento. Cuando se use, esos correos quedarán almacenados.

**Total de personas identificables en la base de datos al 12 de agosto de 2026:** 5 titulares de cuenta y al menos 5 personas nombradas en texto libre (2 operarios en pines de campo, 1 responsable de RFI, 1 responsable de redlines y 1 destinatario de transmittal).

### A.2.4. Fotografías tomadas en obra

Es la categoría más sensible del inventario y por eso se detalla aparte y se acompaña del consentimiento de la Parte B.

- **2,756 imágenes** almacenadas (1,028 MB), en formato JPEG y PNG. No hay video ni audio.
- De ellas, **2,363 fueron importadas desde conversaciones de WhatsApp** exportadas localmente, con fechas de captura entre el 26 de noviembre de 2025 y el 8 de julio de 2026. La plataforma **no se conecta a WhatsApp ni a Meta**; la importación se hizo desde un archivo exportado por el propio equipo de obra.
- Finalidad de las fotografías: evidencia de avance de obra, control de calidad, registro de interferencias y sustento documental del expediente.
- **[PENDIENTE: revisión manual de una muestra representativa de las 2,756 imágenes para declarar formalmente si contienen rostros de trabajadores identificables.** No es posible determinarlo automáticamente. Mientras esa revisión no se realice, debe asumirse que sí los contienen y aplicarse el consentimiento de la Parte B.]

### A.2.5. Datos de ubicación (EXIF y GPS) — declaración precisa

Se declara por separado porque el dato **existe dentro de los archivos aunque no exista en la base de datos**:

- **En la base de datos no existe ninguna columna de coordenadas GPS de fotografías**: ni latitud, ni longitud, ni lugar de captura. La plataforma **no guarda en la base la ubicación de la fotografía**.
- Sí existe en la ficha del documento un campo de metadatos EXIF: **102 registros lo tienen y los 102 lo tienen vacío**.
- **Dónde sí están las coordenadas: dentro del propio archivo JPEG.** El archivo original de cada fotografía se conserva tal cual en el almacenamiento en la nube y **la plataforma no le quita el EXIF al subirlo**. En una muestra de **6 fotografías reales tomadas del almacenamiento el 12 de agosto de 2026, las 6 conservaban coordenadas GPS y hora de captura dentro del archivo**. Solo la miniatura que genera el sistema pierde el EXIF al regenerarse. Las 2,363 fotografías provenientes de WhatsApp no traen EXIF porque WhatsApp lo elimina al enviarlas.
- **[PENDIENTE: revisión de una muestra mayor para declarar qué proporción de las 2,756 fotografías conserva coordenadas GPS y hora de captura dentro del archivo.]**
- El visor 3D solicita la geolocalización del navegador para orientar la vista, pero **la mantiene únicamente en la memoria del navegador; ninguna tabla la almacena**.
- Las coordenadas topográficas almacenadas (3 puntos de control y 1 georreferenciación de modelo) corresponden a puntos de la obra, **no a personas**.

## A.3. Finalidades del tratamiento

Los datos se tratan exclusivamente para:

1. **Prestar el servicio de gestión documental de obra:** almacenar, versionar, organizar, revisar y distribuir documentos, planos, modelos y fotografías del proyecto.
2. **Controlar el acceso a la información:** autenticar a los usuarios, mantener sus sesiones y aplicar los permisos por carpeta.
3. **Dejar trazabilidad y sustento:** registrar quién subió, modificó, eliminó o accedió a un documento y cuándo, para auditoría del proyecto y para investigar incidentes de seguridad.
4. **Enviar correos operativos:** invitación a la plataforma y recuperación de contraseña.
5. **Asistente documental basado en inteligencia artificial:** cuando un usuario lo solicita expresamente sobre un documento, el contenido de ese documento se envía a un servicio de inteligencia artificial de terceros para su análisis (ver A.6).
6. **Evidencia de ejecución de obra:** las fotografías sirven como sustento de avance, calidad, seguridad e interferencias.

**No se realiza:** elaboración de perfiles de comportamiento, decisiones automatizadas con efectos jurídicos sobre las personas, publicidad, cesión con fines comerciales, ni venta o alquiler de datos a terceros.

## A.4. Base legal del tratamiento

| Categoría de datos | Base legal |
|---|---|
| Datos de las cuentas de usuario (nombre, correo, empresa, cargo) y datos de conexión y actividad | Ejecución de la relación contractual o de servicios en el marco del proyecto, conforme al artículo 14 de la Ley N.° 29733, que exceptúa del consentimiento los datos necesarios para la ejecución de una relación contractual en la que el titular sea parte, así como el cumplimiento de obligaciones de trazabilidad del proyecto. |
| Fotografías en las que aparecen personas identificables | **Consentimiento previo, informado, expreso e inequívoco** del titular, conforme al artículo 5 de la Ley N.° 29733, otorgado mediante el formulario de la Parte B de este documento. |
| Nombres de personas consignados en registros de obra (RFI, redlines, pines, transmittals) | Ejecución de la relación contractual y sustento técnico del proyecto. |

[PENDIENTE: verificación por abogado peruano de la numeración y el contenido vigente de los artículos invocados (5, 14 y 15) y de la norma reglamentaria aplicable. Debe confirmarse en particular el numeral exacto del artículo 14 y si, en el marco de un contrato con una entidad pública, corresponde invocar además el cumplimiento de una obligación legal o el ejercicio de función pública por parte de la entidad contratante.]

## A.5. Plazo de conservación

**Se declara con franqueza: a la fecha de este borrador la organización no cuenta con una política documentada de retención ni de eliminación de datos.** No está definido cuánto tiempo se conserva un documento, una fotografía o un registro de actividad. En la práctica, la información permanece almacenada de forma indefinida hasta que un usuario con permiso la elimina.

Datos de hecho relevantes:
- El registro de actividad conserva información desde el 22 de marzo de 2026 y no se depura.
- El registro de accesos existe únicamente desde el 7 de agosto de 2026.
- Las fotografías más antiguas son del 26 de noviembre de 2025.
- La eliminación desde el portal puede ser lógica (el elemento queda marcado como eliminado y es recuperable) o definitiva. Se han registrado 160 eliminaciones definitivas.

[PENDIENTE: definir y documentar los plazos de conservación por tipo de dato — documentos del expediente, fotografías, registros de actividad, registros de acceso, cuentas de usuario dadas de baja — y el procedimiento de eliminación al término del contrato. Sin esto, el aviso no puede declarar un plazo y **no debe inventarse uno**.]

## A.6. Destinatarios, encargados de tratamiento y transferencia internacional

**Declaración expresa y central de este aviso: ningún dato de la plataforma reside en el territorio peruano.** La totalidad de la información —base de datos, archivos, fotografías y modelos— se aloja en infraestructura de terceros ubicada en los Estados Unidos de América, y en un caso en una ubicación declarada por el proveedor simplemente como "global". Esto constituye un flujo transfronterizo de datos personales en los términos del artículo 15 de la Ley N.° 29733.

**Las copias de seguridad de la base de datos, cuando se generan, se escriben en un equipo del proveedor y no en infraestructura del proveedor de nube; a la fecha no consta ninguna copia conservada (ver documento 01, sección 8).** El día que exista una copia local, residirá en el Perú y deberá declararse expresamente en este aviso.

[PENDIENTE: verificación por abogado peruano de la numeración y el contenido vigente de los artículos invocados (5, 14 y 15) y de la norma reglamentaria aplicable.]

### A.6.1. Proveedores que tratan los datos

| Proveedor | Servicio y rol | Qué datos personales toca | Ubicación verificada |
|---|---|---|---|
| **Google LLC** | Base de datos gestionada (Cloud SQL for PostgreSQL) | Todo el modelo de datos: cuentas y contraseñas cifradas, sesiones, 1,034 registros de actividad, 32 eventos de acceso con IP y navegador, ficha de los 2,824 documentos y nombres de personas en texto libre | **us-east4 — Ashburn, Virginia, EE. UU.** (verificado contra el listado público de rangos de IP de Google) |
| **Google LLC** | Almacenamiento de archivos (Cloud Storage) | Los archivos en sí: 6,093 objetos y 6.39 GB, incluidas las 2,756 fotografías, los planos en PDF y los modelos RVT y DWG | [PENDIENTE: la región del depósito de almacenamiento **no se pudo leer** porque la cuenta de servicio no tiene el permiso necesario y la consulta devuelve error 403. Debe verificarse en la consola de Google y consignarse aquí.] |
| **Google LLC** | Inteligencia artificial (Vertex AI, modelo Gemini 2.0 Flash) | Cuando un usuario usa el asistente documental, el sistema descarga el documento, lo convierte a texto (hasta 60,000 caracteres) o a imágenes por página (hasta 12 páginas) y **envía ese contenido a Google para su análisis**. **En un caso de excepción —documento que el sistema no logra preparar— se envía el archivo PDF completo, sin tope.** Si el documento contiene datos personales, esos datos salen hacia el servicio de IA | **us-central1 — Council Bluffs, Iowa, EE. UU.** |
| **Google LLC** | Buscador documental (Vertex AI Search / Discovery Engine) | Índice de búsqueda sobre los documentos del proyecto | **Ubicación declarada como `global`**, lo que significa que el proveedor puede atenderlo desde cualquiera de sus regiones en el mundo |
| **Google LLC** | Inicio de sesión con Google | El correo electrónico del usuario que inicia sesión es verificado contra Google | [PENDIENTE: región] |
| **Render, Inc.** | Ejecución del servidor y de los portales web | Al ser quien ejecuta el proceso, **ve el tráfico en claro dentro del servidor**: la contraseña en el momento del inicio de sesión, el contenido de los documentos que pasan por el servidor y las peticiones completas. Custodia además las claves criptográficas de la aplicación | **Oregón, EE. UU.** |
| **Autodesk, Inc.** (Autodesk Platform Services) | Visualización de modelos 3D y CAD | Recibe **una copia permanente de los modelos 3D y CAD** del proyecto (hoy 2 archivos RVT y 2 DWG). Los modelos pueden contener nombres de autores y responsables incrustados en sus propiedades | Región `us` (**Estados Unidos**), con política de almacenamiento permanente |
| **Resend** (resend.com) | Envío de correo transaccional | Recibe **el nombre y la dirección de correo del destinatario** y el cuerpo del mensaje cada vez que se envía una invitación o una recuperación de contraseña | [PENDIENTE: región de procesamiento del proveedor de correo] |
| **GitHub (Microsoft)** | Custodia del código fuente | Custodia el código de la plataforma. **No almacena datos personales de los titulares ni documentos de obra** | [PENDIENTE: región. Debe confirmarse además si el repositorio es privado o público] |

### A.6.2. Lo que falta en el plano contractual — declaración honesta

[PENDIENTE: **no consta ningún contrato de encargo de tratamiento ni acuerdo de protección de datos (DPA) firmado con Google, Render, Autodesk ni Resend**, pese a que los cuatro tratan datos personales por cuenta del titular del banco de datos.]

[PENDIENTE: **no consta cláusula contractual de flujo transfronterizo** ni la comunicación o autorización que corresponda ante la autoridad nacional para la transferencia internacional descrita en A.6.1.]

Ambos puntos deben resolverse **antes** de que este aviso se entregue a una entidad pública. Es lo primero que revisará su área legal.

## A.7. Medidas de seguridad

### A.7.1. Medidas implementadas y verificadas

- **Contraseñas:** almacenadas con `scrypt`, algoritmo de derivación lento, con sal distinta por usuario. No hay contraseñas en claro.
- **Sesiones:** token aleatorio de 256 bits. En la base de datos **no se guarda el token sino su huella criptográfica**, calculada con una clave que vive fuera de la base de datos; una copia de la base no permite suplantar sesiones. Las sesiones caducan a los 7 días y pueden revocarse, con efecto en un máximo de 15 segundos.
- **Cifrado en tránsito:** los portales y la interfaz de programación se sirven por HTTPS. La conexión del servidor con la base de datos se verificó en operación real con TLS 1.3 y cifrado de 256 bits.
- **Cifrado en reposo:** el cifrado por defecto del proveedor de nube, con claves gestionadas por el proveedor.
- **El almacenamiento no es público:** se comprobó con peticiones anónimas que tanto la lectura de metadatos como el listado de objetos son rechazados. Los archivos se entregan mediante enlaces firmados con caducidad máxima de 24 horas.
- **Permisos por carpeta:** seis niveles de permiso (restringido, ver, ver y descargar, ver-descargar-marcar, editar y subir, administrar) con herencia estricta de la carpeta padre. Un usuario común no accede a ningún documento hasta que se le concede permiso explícito. **El mecanismo está implementado y es correcto, pero en la práctica no se ha ejercido: existe una sola regla registrada y la operación se ha realizado con cuentas de administrador, que lo eluden por diseño. Su comportamiento con usuarios sin privilegios no está probado en producción.**
- **Registro de actividad y de accesos**, en los términos y con los límites descritos en A.2.2.
- **Registro de entrega de documentos:** se anota a quién se le entregó el acceso a un documento, a qué hora y por qué vía. Corresponde precisar el límite real de este registro: como el archivo se entrega mediante un enlace firmado y los bytes viajan después directamente desde el proveedor de nube, **no se puede afirmar que "esta persona completó la descarga", solo que "a esta persona se le entregó el acceso a este documento"**.

### A.7.2. Limitaciones vigentes que se declaran expresamente

Se consignan porque omitirlas convertiría este aviso en una declaración falsa:

- **No existe segundo factor de autenticación (2FA/MFA).** El acceso es por contraseña o inicio de sesión con Google.
- **La separación entre obras no se está aplicando de forma transversal.** El control transversal de separación entre obras está en modo registro: anota a quién bloquearía y deja pasar. Los módulos documentales (documentos, subidas, transmittals, revisiones, sets, atributos) aplican además su propia comprobación de pertenencia a la obra, que sí bloquea. **No la aplican** los módulos de RFI, redlines, pines de campo, vistas guardadas, inventario 3D y obra civil: en ellos, hoy, una sesión válida alcanza datos de obras a las que el usuario no está asignado. Debe activarse el control transversal antes de atender a más de una entidad. [PENDIENTE: confirmar y activar en el panel del proveedor de ejecución.]

  **Nota sobre obras y frentes (idéntica en los cuatro documentos de este expediente):** una obra puede organizarse en varios ámbitos de trabajo o *frentes*, y por eso el recuento por ámbito y el recuento por obra no coinciden. `1_CANAL` y `1_DRENAJE` son **frentes de la obra PQT8_TALARA (obra `1`)**, no obras distintas ni proyectos de prueba: comprobado el 12-ago-2026 contra la base de producción con `db.resolve_project_id()`, donde `proyectos/PQT8_TALARA`, `1_CANAL` y `1_DRENAJE` resuelven los tres a la obra `1`. Entre los dos frentes suman **284 ficheros y 241 MB de contenido real de esa obra**.
- **La política de acceso restrictiva por defecto está en modo sombra:** evalúa y anota lo que cerraría, pero decide la lógica anterior.
- **No hay copia de seguridad de los archivos.** Se respalda la base de datos mediante un procedimiento manual y probado de extremo a extremo el 9 de agosto de 2026 (78 tablas y 83,563 filas restauradas de forma idéntica), pero **los 6,093 objetos del almacenamiento —planos, fotografías y modelos— no se respaldan en ningún sitio**. Tampoco existe una tarea programada: la copia se lanza a mano y, a la fecha, **no consta ninguna copia conservada**.

  **Nota sobre el recuento de tablas y de filas (idéntica en los cuatro documentos de este expediente):** la prueba del 09-ago-2026 restauró 78 tablas sobre las 81 que había en producción ese día. Dos se excluyen a propósito del respaldo por contener datos transitorios (`upload_sessions` y `gemelo_ingestion_status`, constante `PRESCINDIBLES` de `backend/copia_de_seguridad.py`). [PENDIENTE: identificar y declarar la diferencia restante entre las tablas existentes y las restauradas.] Al 12-ago-2026 la base tiene 82 tablas. **Además, aquella prueba restauró 83,563 filas y al 12-ago-2026 la base registra aproximadamente 83,137: hoy hay menos filas y más tablas que hace tres días.** No se ofrece explicación porque no se ha verificado ninguna. [PENDIENTE: explicar la variación de filas entre el 09 y el 12-ago-2026.]
- **No hay análisis antivirus ni antimalware** sobre los archivos que se suben.
- **No hay separación de funciones:** una sola persona administra la aplicación, la base de datos, la nube, el repositorio y la cuenta del proveedor de ejecución. No existe un segundo administrador ni control de cuatro ojos para acciones destructivas.
- **No hay procedimiento documentado de respuesta a incidentes ni de notificación.** El 7 de agosto de 2026 ocurrió un incidente —una persona con sesión válida archivó una obra— que se cerró restaurando los datos y revocando 62 sesiones, pero **sin poder determinar quién fue**, por falta de registro de accesos anterior a esa fecha. La causa técnica fue que la comprobación de rol de administrador era puramente declarativa mientras la política de acceso estaba en modo sombra —no hacía falta ser administrador para archivar una obra— y que la auditoría de entonces solo registraba entradas y salidas, no cambios sobre obras; ambas cosas se corrigieron el mismo día (commit `0891e78`).

  [PENDIENTE: la revocación alcanzó a 62 sesiones existentes ese día, pero la tabla de sesiones registra hoy 27 filas (26 activas). Antes de entregar el documento debe explicarse por qué el recuento actual no refleja aquellas 62 revocaciones.]
- **No existe ninguna certificación** (ISO 27001, ISO 9001, SOC 2 u otra) ni proceso de certificación iniciado, ni prueba de penetración o auditoría de seguridad externa.
- **No existe entorno de pruebas separado del de producción.**
- **No hay compromiso de disponibilidad ni acuerdo de nivel de servicio**, ni sistema de monitoreo o alertas.

## A.8. Derechos del titular de los datos y cómo ejercerlos

Toda persona cuyos datos personales sean tratados por la plataforma puede ejercer los siguientes derechos, reconocidos por la Ley N.° 29733:

| Derecho | En qué consiste |
|---|---|
| **Acceso** | Conocer qué datos suyos se tratan, con qué finalidad, de dónde se obtuvieron y a quién se han comunicado o transferido. |
| **Rectificación** | Corregir datos suyos que sean inexactos, incompletos o desactualizados. |
| **Cancelación (supresión)** | Pedir que se eliminen sus datos cuando ya no sean necesarios para la finalidad, cuando haya retirado su consentimiento o cuando el tratamiento sea contrario a la ley. Incluye pedir el retiro de una fotografía en la que aparezca. |
| **Oposición** | Oponerse al tratamiento de sus datos por un motivo legítimo, cuando la ley lo permita. |
| **Revocación del consentimiento** | Retirar en cualquier momento el consentimiento otorgado para las fotografías, sin necesidad de justificar el motivo y sin que ello le genere perjuicio alguno. |

### A.8.1. Canal de atención

| Elemento | Valor |
|---|---|
| Correo electrónico para solicitudes | [PENDIENTE: correo de contacto] |
| Domicilio para presentación física de la solicitud | [PENDIENTE: domicilio fiscal] |
| Responsable de atender la solicitud | [PENDIENTE: nombres, apellidos y cargo] |
| Qué debe adjuntar el solicitante | Solicitud con sus nombres y apellidos, copia de su documento de identidad, el derecho que ejerce, el detalle de lo que pide y un medio de contacto para la respuesta. |
| Costo | Gratuito. |

### A.8.2. Plazos de respuesta

- **Derecho de acceso:** hasta **20 días hábiles** desde la recepción de la solicitud.
- **Derechos de rectificación, cancelación y oposición:** hasta **10 días hábiles** desde la recepción de la solicitud.

[PENDIENTE: confirmación por abogado peruano de que estos plazos y sus posibles prórrogas corresponden a la norma reglamentaria vigente a la fecha de emisión.]

Si la solicitud es denegada o no se responde en plazo, el titular puede acudir a la autoridad nacional de protección de datos personales del Ministerio de Justicia y Derechos Humanos para presentar el reclamo que corresponda.

### A.8.3. Cómo se atiende hoy — declaración honesta

**La atención de estos derechos es manual.** La plataforma **no dispone actualmente** de ninguna función que exporte automáticamente los datos de una persona ni que los elimine de forma integral: no existe un procedimiento documentado ni una funcionalidad de autoservicio. Cada solicitud se atiende buscando y actuando manualmente sobre los registros y sobre los archivos almacenados.

Consecuencias prácticas que el titular debe conocer:
- El retiro de una fotografía implica eliminar el archivo del almacenamiento y su ficha en la base de datos; el registro de actividad conservará la traza de que hubo una eliminación, pero no la imagen.
- Si la fotografía ya fue descargada o compartida por un usuario autorizado antes de la solicitud, la plataforma no puede recuperar esa copia.
- Los modelos 3D y CAD entregados al proveedor de visualización se almacenan allí de forma permanente; su retiro requiere una acción manual adicional sobre ese proveedor.

[PENDIENTE: documentar el procedimiento interno de atención de derechos ARCO, con responsable, formato de solicitud, registro de solicitudes recibidas y evidencia de la respuesta.]

## A.9. Consentimiento

- Para las **cuentas de usuario**, el tratamiento se sustenta en la ejecución de la relación contractual (A.4) y no requiere consentimiento adicional; sin embargo, el usuario debe recibir este aviso al momento de su incorporación.
- Para las **fotografías en las que aparecen personas identificables**, el tratamiento requiere **consentimiento previo, informado, expreso e inequívoco**, que se recoge mediante el formulario de la Parte B.
- El consentimiento **puede revocarse en cualquier momento**, sin expresión de causa y sin consecuencia adversa para la persona ni para su permanencia en la obra.

---
---

# PARTE B — CARTEL Y FORMULARIO DE CONSENTIMIENTO PARA FOTOGRAFÍAS EN OBRA

> Instrucción de impresión: esta parte está pensada para imprimirse en **una sola hoja A4**. Imprimir desde el corte superior hasta el corte inferior, colgar el cartel en la caseta y mantener a la mano un juego de formularios firmados. No imprimir la Parte A junto con esta hoja.

---
✂ — — — — — — — — — — — — — — — — CORTE — — — — — — — — — — — — — — — — ✂

## AVISO: EN ESTA OBRA SE TOMAN FOTOGRAFÍAS

**[PENDIENTE: razón social] — RUC [PENDIENTE: RUC]**

### ¿Qué se fotografía?
Los trabajos, los equipos, los materiales, los avances y los problemas encontrados en obra. En algunas fotos puede aparecer usted mientras trabaja.

### ¿Para qué?
Solo para tres cosas: **dejar constancia del avance de la obra**, **sustentar el control de calidad y de seguridad** y **registrar interferencias o incidencias**. No se usan para publicidad, no se publican en redes sociales, no se venden y no sirven para evaluar ni sancionar a nadie.

### ¿Quién las ve?
El personal autorizado del proyecto y de la entidad contratante, cada uno según el permiso que tenga. Las fotos se guardan en servidores de un proveedor de nube **fuera del Perú**. **[PENDIENTE: país exacto del almacenamiento, una vez confirmado en la consola del proveedor.]** El acceso está protegido con usuario y contraseña.

### ¿Cuánto tiempo se guardan?
Mientras dure la obra y el plazo que exija el expediente del proyecto.
**[PENDIENTE: plazo exacto de conservación, una vez definido por la organización. Hasta entonces no se debe colgar este cartel con un plazo inventado.]**

### ¿Se guarda dónde estaba usted?
Las fotos tomadas con celular suelen guardar, **dentro del propio archivo**, el lugar y la hora en que se tomaron. Se revisaron 6 fotos del sistema y **las 6 tenían esa información dentro del archivo**. El sistema no la borra al subir la foto y no la muestra en pantalla, pero está ahí.

### Sus derechos
Usted puede pedir, **gratis y en cualquier momento**:
- Pedir que se busquen y le muestren las fotografías en las que usted aparezca, con la ayuda del responsable de obra, ya que la búsqueda es manual.
- **Pedir que se retire una foto en la que aparezca.**
- Retirar su permiso, sin dar explicaciones y **sin ninguna consecuencia para su trabajo**.

**Cómo pedirlo:** hable con **[PENDIENTE: nombre y cargo del responsable en obra]** o escriba a **[PENDIENTE: correo de contacto]**.
Respuesta: hasta **20 días hábiles** para pedidos de acceso y **10 días hábiles** para retiro o corrección.

---

## FORMULARIO DE CONSENTIMIENTO

Declaro que he leído y entendido el aviso de arriba, que me lo explicaron y que pude hacer preguntas.

| | |
|---|---|
| Nombres y apellidos | |
| DNI o carné de extranjería | |
| Empresa | |
| Cargo / puesto en obra | |
| Obra / frente de trabajo | |
| Fecha | |

Marque una opción:

☐ **SÍ AUTORIZO** que se tomen y se guarden fotografías en las que aparezca, para las finalidades indicadas en este aviso.

☐ **NO AUTORIZO.** (Si marca esta opción, se seguirán tomando fotografías de los trabajos, pero se procurará no fotografiarlo de forma identificable y, si usted señala una fotografía en la que aparece, se retirará. **Esta decisión no afecta en nada su trabajo ni su permanencia en la obra.**)

Entiendo que puedo **retirar este permiso cuando quiera**, sin dar motivo, comunicándolo al responsable indicado arriba.

<br>

| Firma del trabajador | Huella digital | Firma del responsable que informó |
|---|---|---|
| <br><br><br> | <br><br><br> | <br><br><br> |

*[PENDIENTE: lugar de custodia de los formularios firmados y responsable de conservarlos. Estos formularios contienen DNI, un dato que la plataforma no almacena; su custodia es física o en archivo aparte y también está sujeta a la Ley N.° 29733.]*

✂ — — — — — — — — — — — — — — — — CORTE — — — — — — — — — — — — — — — — ✂

---
---

# NOTA FINAL — PARA EL PROPIETARIO

**Esta sección no forma parte del aviso. No se entrega a la entidad ni se cuelga en obra. Elimínela antes de imprimir o distribuir.**

1. **El banco de datos personales no está inscrito.** La Ley N.° 29733 obliga a inscribir los bancos de datos personales en el Registro Nacional de Protección de Datos Personales, ante la autoridad nacional de protección de datos personales del Ministerio de Justicia y Derechos Humanos. Hoy no hay inscripción, ni trámite iniciado. Una entidad pública lo va a preguntar, y la falta de inscripción es sancionable. **Este es el primer trámite a realizar.**

2. **Este texto necesita el visto bueno de un abogado peruano** especializado en protección de datos personales, antes de usarse con cualquier entidad. Este borrador fue redactado a partir de la verificación técnica del sistema, no de una asesoría legal. En particular deben revisarse: la norma reglamentaria vigente y su numeración, el numeral exacto del artículo 14 invocado como base legal, los plazos de respuesta y sus prórrogas, y el tratamiento del flujo transfronterizo del artículo 15.

3. **Hay tres cosas que conviene resolver antes de firmar nada con una entidad,** porque el área legal las va a encontrar:
   - No hay contrato de encargo de tratamiento ni acuerdo de protección de datos con Google, Render, Autodesk ni Resend, y ninguno de los datos está en el Perú.
   - El control transversal de separación entre obras no bloquea: los módulos documentales sí comprueban por su cuenta la pertenencia a la obra, pero los de RFI, redlines, pines de campo, vistas guardadas, inventario 3D y obra civil no lo hacen (ver A.7.2). Atender a dos entidades en ese estado expone parte de los datos de una a la otra.
   - No existe copia de seguridad de las fotografías ni de ningún archivo. Si se pierde el almacenamiento, queda el índice de documentos que ya no existen.

4. **No complete ningún `[PENDIENTE]` con una estimación.** Cada hueco de este documento corresponde a un dato que solo usted puede confirmar (razón social, RUC, domicilio, contacto, plazos de conservación) o que requiere una verificación en la consola del proveedor (región del depósito de almacenamiento, copias automáticas de la base de datos). Un dato inventado en un aviso de privacidad entregado a una entidad pública es peor que no tener el documento.

---

*Fin del documento. Versión 1.0 - borrador. Fecha de emisión: [PENDIENTE: fecha].*
