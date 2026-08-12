# Ficha técnica y de tratamiento de datos

**Plataforma:** Entorno Común de Datos (ECD) para gestión documental y modelos BIM de obra
**Versión 1.0 - borrador**
**Fecha de emisión:** [PENDIENTE: fecha]
**Dirigido a:** área de Tecnologías de la Información y área legal de la Entidad
**Fecha de corte de los datos técnicos:** 12 de agosto de 2026

---

## 0. Identificación del proveedor

| Dato | Valor |
|---|---|
| Razón social | [PENDIENTE: razón social] |
| RUC | [PENDIENTE: RUC] |
| Registro Nacional de Proveedores (RNP) | [PENDIENTE: número y vigencia del RNP] |
| Domicilio fiscal | [PENDIENTE: domicilio fiscal] |
| Representante legal | [PENDIENTE: nombre y DNI del representante legal] |
| Correo y teléfono de contacto | [PENDIENTE: correo y teléfono] |
| Contacto para asuntos de protección de datos | [PENDIENTE: no hay encargado de protección de datos designado] |

---

## 1. Alcance y propósito de este documento

Este documento describe el estado **real y verificado** de la plataforma a la fecha de corte: qué hace,
qué información guarda, dónde reside físicamente esa información, quién puede acceder a ella, qué
proveedores externos intervienen, cómo se respalda y cómo la Entidad recupera toda su información si
decide terminar la relación.

Reglas seguidas al redactarlo, para que el lector sepa qué está leyendo:

1. Todo dato numérico o técnico proviene de una consulta de solo lectura sobre el sistema en producción
   o de la lectura directa del código fuente y de los ficheros de configuración.
2. Lo que no se pudo verificar se marca literalmente como **[PENDIENTE: ...]**. No se ha estimado ni
   supuesto ningún valor.
3. Las carencias se declaran de forma expresa en la sección 12. La plataforma **no cuenta con ninguna
   certificación** (ni ISO 27001, ni ISO 9001, ni SOC 2, ni ninguna otra) y **no tiene ningún proceso de
   certificación iniciado**.
4. Cuando una función está prevista pero no existe, se indica "no disponible actualmente". No se asumen
   compromisos de plazo en este documento.

---

## 2. Qué es la plataforma y qué hace

Es un entorno común de datos (ECD) para obra de infraestructura, compuesto por:

- **Un backend** en Python (Flask), servido con gunicorn (4 procesos de trabajo).
- **Una base de datos** PostgreSQL 18.2 administrada (Google Cloud SQL).
- **Un almacenamiento de ficheros** en Google Cloud Storage.
- **Tres portales web** (React): visor de modelos, gestión documental y portal de acceso.
- **Un visor 3D/CAD** que se apoya en Autodesk Platform Services (APS).

Funciones que existen y están en uso, comprobadas por la presencia de datos reales en las tablas
correspondientes:

| Función | Estado verificado |
|---|---|
| Gestión documental por carpetas, con papelera y restauración | En uso: 2,824 ficheros y 196 carpetas vivas |
| Versionado de documentos | En uso, pero poco: 2,830 versiones y la revisión más alta alcanzada es la 2 |
| Permisos por carpeta al estilo ISO 19650 / ACC, con herencia | Implementado; **casi sin usar** (1 sola regla registrada) |
| Registro de actividad sobre documentos | En uso: 1,034 registros entre el 22-mar-2026 y el 11-ago-2026 |
| Visor de PDF y de planos, con marcas (redlines) | En uso: 33 redlines |
| Consultas técnicas (RFI) | En uso: 25 RFI |
| Revisiones, transmittals y sets documentales | Uso mínimo: 1 revisión, 1 transmittal |
| Reporte diario de obra | Uso mínimo: 1 reporte |
| Fotografía de campo y multimedia | En uso intensivo: 2,756 imágenes (1,028 MB) |
| Pines de seguimiento georreferenciados en el modelo | En uso: 34 pines |
| Visor 3D de modelos Revit/CAD (Autodesk APS) | En uso: 2 ficheros RVT y 2 DWG publicados |
| Inventario de elementos del modelo 3D | En uso: 20,116 elementos |
| Asistente documental con inteligencia artificial (Google Vertex AI) | Implementado y operativo — ver secciones 5 y 7, tiene implicancias de confidencialidad |
| Buscador documental sobre índice de IA (Vertex AI Search) | Implementado |
| Compartir documentos con terceros externos | Implementado; 0 usos registrados a la fecha |

*Sobre la mención a ISO 19650 (en esta tabla y en la sección 6.2): la referencia describe el modelo
de niveles de permiso adoptado; **no implica conformidad ni certificación respecto de la norma ISO
19650**, que la plataforma no ostenta.*

**Advertencia sobre el volumen de obras, para que no se lea una cifra inflada:** la plataforma registra
9 obras (3 activas y 6 archivadas), pero **solo 2 corresponden a trabajo real** (PQT8_TALARA, que es el
expediente, y PQT8_INTERFERENCIAS, que es el archivo fotográfico). El resto son proyectos de prueba,
cuatro registros duplicados de un mismo proyecto creados el mismo minuto, y una obra creada durante el
incidente de seguridad del 07-ago-2026 (sección 6.5). Presentar "9 obras gestionadas" sería engañoso.

**Nota sobre obras y frentes (idéntica en los cuatro documentos de este expediente):** una obra puede
organizarse en varios ámbitos de trabajo o *frentes*, y por eso el recuento por ámbito y el recuento por
obra no coinciden. `1_CANAL` y `1_DRENAJE` son **frentes de la obra PQT8_TALARA (obra `1`)**, no obras
distintas ni proyectos de prueba: comprobado el 12-ago-2026 contra la base de producción con
`db.resolve_project_id()`, donde `proyectos/PQT8_TALARA`, `1_CANAL` y `1_DRENAJE` resuelven los tres a la
obra `1`. Entre los dos frentes suman **284 ficheros y 241 MB de contenido real de esa obra**.

---

## 3. Qué información guarda la plataforma

### 3.1 Datos de personas

| Origen | Qué contiene | Cantidad hoy |
|---|---|---|
| `users` (cuentas) | Nombre, correo electrónico, contraseña cifrada, rol, empresa, cargo, último acceso | 5 registros |
| `sessions` (sesiones) | Huella del token, usuario, creación, caducidad, activa sí/no. **No guarda IP ni dispositivo** | 27 (26 activas) |
| `auth_events` (accesos) | Correo, usuario, **dirección IP**, **navegador/dispositivo**, evento y fecha | 32 registros |
| `activity_log` (actividad) | Acción, documento, autor en texto libre, fecha; la clave `ip` aparece en 17 filas | 1,034 registros |
| `otp_codes` | Correo y código de un solo uso, ya caducados | 2 registros |
| Nombres en texto libre dentro de datos de obra | 2 nombres de operarios en pines de seguimiento; 1 responsable en RFI; 1 responsable en redlines; 1 destinatario (nombre y correo) en transmittal | — |

**La tabla de usuarios no tiene columna de DNI, teléfono, dirección ni fecha de nacimiento.** El dato
identificativo es el nombre y el correo electrónico.

**Total de personas identificables en la base:** 5 titulares de cuenta más al menos 5 personas nombradas
en texto libre (2 operarios en pines de seguimiento, 1 responsable en RFI, 1 responsable en redlines y
1 destinatario de transmittal). **No existen categorías especiales de datos** (salud, biometría, sindicación, origen
étnico) en ninguna columna estructurada.

De los 5 correos, 4 son de dominio `gmail.com` y 1 de dominio corporativo. 3 usuarios tienen contraseña
establecida; 2 son invitados que nunca la fijaron.

**Alcance temporal de la trazabilidad, dicho sin adorno:** el registro de accesos (`auth_events`) solo
cubre **del 07-ago-2026 al 12-ago-2026**. Antes de esa fecha **no hay registro de quién entró**.

### 3.2 Datos de obra y documentos

Fichas de documento (nombre, versión, estado, idoneidad, autor, fecha), planos PDF, fotografías de
campo, modelos Revit y DWG, elementos del modelo 3D, superficies y secciones topográficas, puntos de
control geodésicos y vistas guardadas. Los puntos de control (`geo_control_points`, 3 filas) y la
georreferenciación del modelo (1 fila) contienen coordenadas **de obra, no de personas**.

### 3.3 Fotografías, metadatos EXIF y coordenadas GPS

Este punto se detalla porque el dato **sí existe, dentro de los ficheros**, aunque no esté en la base
de datos, y el área legal debe conocerlo antes y no después:

- De las 2,756 imágenes, **2,363 fueron importadas desde una exportación local de conversaciones de
  WhatsApp**, con fechas de captura entre el 26-nov-2025 y el 08-jul-2026. La plataforma **no se conecta
  a WhatsApp ni a Meta**; fue una carga de ficheros.
- **En la base de datos no existe ninguna columna de coordenadas GPS de fotografías**: ni latitud, ni
  longitud, ni lugar de captura. La plataforma **no guarda la ubicación de la foto en la base**.
- Sí existe en la ficha del documento un campo de metadatos EXIF: **102 registros lo tienen y los 102 lo
  tienen vacío**.
- **Dónde sí están las coordenadas: dentro del propio fichero JPEG.** El fichero original de cada foto se
  guarda tal cual en el almacenamiento en la nube y **la plataforma no le quita el EXIF al subirlo**. En
  una muestra de **6 fotografías reales tomadas del almacenamiento el 12-ago-2026, las 6 conservaban
  coordenadas GPS y hora de captura dentro del fichero**. Solo la miniatura que genera el sistema pierde
  el EXIF al regenerarse. Las fotos importadas de WhatsApp no traen EXIF porque ese servicio lo elimina
  al enviar.
  [PENDIENTE: revisión de una muestra mayor para declarar qué proporción de las 2,756 fotografías
  conserva coordenadas GPS dentro del fichero.]
- El visor 3D pide la geolocalización del navegador, pero la mantiene únicamente en memoria del
  navegador; **ninguna tabla la almacena**.

[PENDIENTE: revisión manual de una muestra de las 2,756 imágenes para declarar si contienen rostros de
trabajadores identificables. No es determinable de forma automática.]

---

## 4. Volumen actual (12-ago-2026)

**Base de datos:** 82 tablas, aproximadamente 83,137 filas, **236 MB**. Las tablas más pesadas son el
inventario de elementos 3D (158 MB), los vínculos de elementos (26 MB), las superficies topográficas
(13 MB) y el árbol documental (8.7 MB).

**Documentos:** 2,824 ficheros vivos y 196 carpetas, **2,413 MB (2.36 GB)**.

| Tipo | Cantidad | Peso |
|---|---|---|
| Imágenes JPEG | 2,732 | 1,010 MB |
| Documentos PDF | 64 | 693 MB |
| Imágenes PNG | 24 | 18 MB |
| Modelos de diseño (2 DWG + 2 RVT) | 4 | 692 MB |

No hay vídeo ni audio.

**Reparto por ámbito:** PQT8_INTERFERENCIAS 2,471 ficheros (970 MB); 1_CANAL 182 (156 MB); 1_DRENAJE 102
(85 MB); PQT8_TALARA 52 ficheros (965 MB, el expediente y los modelos); el resto, 17 ficheros (~5 MB).

**Reparto por obra:** como `1_CANAL` y `1_DRENAJE` son frentes de PQT8_TALARA (ver la nota sobre obras y
frentes en la sección 2), esa obra suma **336 ficheros y 1,206 MB**; PQT8_INTERFERENCIAS, 2,471 ficheros
(970 MB); el resto, 17 ficheros (~5 MB). Los ficheros cuadran con los 2,824 declarados arriba.
*El peso no: este reparto suma 2,181 MB frente a los 2,413 MB declarados arriba, faltan 232 MB, que es
exactamente el peso de los dos ficheros RVT.* [PENDIENTE: recomprobar la consulta de reparto y declarar
la línea que falta.]

**Almacenamiento en la nube:** 6,093 objetos y **6.39 GB**. La diferencia con los 2.36 GB de documentos
vivos se explica por las miniaturas generadas, las versiones históricas y objetos huérfanos. (La base de
datos, 236 MB, es un volumen distinto y no interviene en esta comparación.)

**Usuarios y organización:** 5 usuarios (1 administrador, 4 usuarios), 4 empresas y 10 cargos definidos
en los catálogos, 5 asignaciones a obras, 2 hubs.

---

## 5. Dónde está físicamente la información

**Ningún dato reside en el Perú.** Todo el tratamiento ocurre fuera del territorio nacional, en al menos
tres proveedores distintos, y en un caso en una ubicación declarada como "global".

| Componente | Proveedor | Ubicación verificada | Cómo se verificó |
|---|---|---|---|
| Base de datos (Cloud SQL PostgreSQL 18.2, 236 MB) | Google LLC | **us-east4 — Ashburn, Virginia, EE.UU.** | El rango de la IP pública figura como us-east4 en el fichero público de rangos de Google Cloud |
| Almacenamiento de ficheros (6,093 objetos, 6.39 GB, clase NEARLINE) | Google LLC | **[PENDIENTE: región no legible. La cuenta de servicio carece del permiso de lectura de metadatos del bucket y la consulta devuelve HTTP 403. Debe confirmarse en la consola de Google.]** | Intento de lectura fallido |
| Backend (API) | Render, Inc. | **Oregón, EE.UU.** | Declarado en el fichero de despliegue del repositorio |
| Portales web (3 servicios) | Render, Inc. | **[PENDIENTE: confirmar la región de cada uno de los tres portales en el panel de Render.]** | — |
| Modelo de inteligencia artificial (Gemini 2.0 Flash sobre Vertex AI) | Google LLC | **us-central1 — Council Bluffs, Iowa, EE.UU.** | Constante en el código |
| Buscador documental (Vertex AI Search / Discovery Engine) | Google LLC | **`global`** — Google puede servirlo desde cualquiera de sus regiones | Constante en el código |
| Modelos 3D y CAD | Autodesk, Inc. | **Región `us`, EE.UU., con almacenamiento permanente** | Constantes en el código: `policyKey: persistent`, `region: us` |
| Código fuente | GitHub (Microsoft) | [PENDIENTE: región] | — |
| Correo transaccional | Resend | [PENDIENTE: país de procesamiento no verificado] | — |

**Dato incómodo pero verificable, que se declara para que la Entidad no lo descubra por su cuenta:** el
proyecto de Google Cloud se llama `correos-gmail-425301`. Ese nombre, la cuenta de servicio asociada y
el nombre del bucket (que incluye el nombre de pila del propietario) son propios de un proyecto creado
desde una cuenta Gmail particular; **nada indica una organización corporativa de Google Cloud**. El
proyecto nació para otro fin y la plataforma se montó encima. Además, consta en la documentación interna
que **una mora en la facturación ya dejó el almacenamiento inaccesible en una ocasión**.

[PENDIENTE: confirmar si la cuenta de facturación asociada es personal o de una empresa, y si el
proyecto pertenece a una organización de Google Cloud o a un usuario individual. Es condición previa
razonable para una contratación pública.]

[PENDIENTE: confirmar en la consola de Google el nombre de la instancia de Cloud SQL y sus redes
autorizadas. La base tiene **IP pública** y acepta conexión desde una máquina particular en el Perú; si
las redes autorizadas están abiertas a 0.0.0.0/0, admite intentos de conexión desde todo internet.]

---

## 6. Quién puede acceder y con qué control

### 6.1 Roles globales

Hoy: **1 administrador y 4 usuarios**. El rol global se traduce a permiso documental así:

| Rol global | Permiso documental que otorga |
|---|---|
| `viewer` | Ninguno |
| `user` | Ninguno |
| `editor` | Editar |
| `admin` | Administrar |

Es decir, **un usuario corriente parte sin acceso a documentos** hasta que se le concede permiso
explícito sobre una carpeta.

### 6.2 Permisos por carpeta

Seis niveles al estilo ACC / ISO 19650, con herencia estricta de la carpeta padre a la hija:
Restringido, Ver, Ver y descargar, Ver-descargar-marcar, Editar y subir, y Administrar (incluye
eliminar).

**Estado real:** la tabla de permisos por carpeta contiene **una sola fila**. El mecanismo existe y está
bien construido, pero prácticamente no se está usando.

### 6.3 Asignación a obras

5 asignaciones registradas: cuatro usuarios a PQT8_TALARA y uno a PQT8_INTERFERENCIAS.

### 6.4 Dos fallas de autorización activas hoy (se declaran expresamente)

**a) La separación entre obras no se aplica de forma transversal.** El control transversal de separación
entre obras está en modo registro: anota a quién bloquearía y deja pasar. Los módulos documentales
(documentos, subidas, transmittals, revisiones, sets, atributos) aplican además su propia comprobación
de pertenencia a la obra, que sí bloquea. **No la aplican** los módulos de RFI, redlines, pines de
campo, vistas guardadas, inventario 3D y obra civil: en ellos, hoy, una sesión válida alcanza datos de
obras a las que el usuario no está asignado. Debe activarse el control transversal antes de atender a
más de una entidad.

**b) La política de acceso "denegar por defecto" está en modo sombra.** Evalúa y anota lo que cerraría,
pero **la decisión sigue en manos de la lógica antigua**, que autoriza por prefijo de ruta. La propia
documentación interna advierte que un prefijo amplio podía cubrir rutas de escritura no revisadas.

[PENDIENTE: confirmar en el panel de Render si las variables que activan ambos controles fueron
definidas manualmente allí. En el repositorio **no lo están**, por lo que rigen los valores por defecto
descritos arriba.]

### 6.5 Concentración de la administración

**Una sola persona tiene acceso total, por cuatro caminos independientes:**

1. Es el **único administrador** de la aplicación.
2. Posee las credenciales del usuario `postgres` de la base de datos: acceso directo y completo a las
   82 tablas, **saltándose por completo la aplicación y sus permisos**.
3. Posee la clave de la cuenta de servicio de Google, que da acceso a los 6,093 objetos del
   almacenamiento.
4. Es propietario del repositorio de código y de la cuenta de Render, donde viven las claves
   criptográficas de la plataforma.

**No hay separación de funciones, no hay un segundo administrador y no hay control de "cuatro ojos"
para acciones destructivas.**

Consecuencia real y documentada: el **07-ago-2026 alguien con una sesión válida archivó la obra
PQT8_TALARA**. La causa técnica, ya confirmada en el código, es que la comprobación de rol de
administrador era **puramente declarativa** mientras la política de acceso estaba en modo sombra: **no
hacía falta ser administrador** para crear, renombrar ni archivar una obra; y la auditoría de entonces
solo registraba entradas y salidas, no cambios sobre obras. Ambas cosas se corrigieron el mismo día
(commit `0891e78`), con comprobaciones efectivas dentro de cada vista y registro de la acción. Los datos
estaban intactos y se restauraron, se revocaron 62 sesiones y se rotaron códigos, pero **no se pudo
determinar quién fue**, porque antes de esa fecha no existía registro de accesos.

[PENDIENTE: la revocación alcanzó a 62 sesiones existentes ese día, pero la tabla de sesiones registra
hoy 27 filas (26 activas). Antes de entregar el documento debe explicarse por qué el recuento actual no
refleja aquellas 62 revocaciones.]

### 6.6 Rutas accesibles sin iniciar sesión

Lista cerrada y revisada: verificación de salud del servicio, inicio de sesión, registro, inicio de
sesión con Google, canje de traspaso de sesión, cierre de sesión, estado, retorno de autenticación de
Autodesk, token del visor, olvido de contraseña y restablecimiento de contraseña. El inicio del flujo
de autenticación con Autodesk exige explícitamente rol de administrador.

El antiguo atajo de desarrollo que concedía acceso administrativo sin iniciar sesión (`DEMO_TOKEN`)
está **desactivado por defecto** y no aparece habilitado en la configuración de despliegue.

[PENDIENTE: no existe procedimiento documentado de alta y baja de usuarios, ni revisión periódica de
permisos, ni política de contraseñas escrita.]

---

## 7. Subencargados: terceros que tratan la información

Todos los siguientes tratan datos de la plataforma. Se listan con el país donde procesan.

| Proveedor | Servicio | Qué información trata | País / región de procesamiento |
|---|---|---|---|
| **Google LLC** | Cloud SQL (PostgreSQL) | **Todo el modelo de datos**: usuarios y contraseñas cifradas, sesiones, 1,034 registros de actividad, 32 eventos de acceso con IP y navegador, fichas de 2,824 documentos, nombres de personas en texto libre | EE.UU. — us-east4 (Virginia) |
| **Google LLC** | Cloud Storage | **Los bytes de todo**: planos PDF, 2,756 fotografías de campo, modelos RVT y DWG (6,093 objetos, 6.39 GB) | [PENDIENTE: región del bucket no legible] |
| **Google LLC** | Vertex AI — Gemini 2.0 Flash | **Contenido de los documentos**. Al usar el asistente documental, el servidor descarga el PDF, lo convierte a texto (hasta 60,000 caracteres) o a imágenes por página (hasta 12 páginas) y **envía ese contenido a Google para su análisis**. **En un caso de excepción —documento que el sistema no logra preparar— se envía el fichero PDF completo, sin tope.** | EE.UU. — us-central1 (Iowa) |
| **Google LLC** | Vertex AI Search (Discovery Engine) | Índice de búsqueda sobre los documentos | **`global`** |
| **Google LLC** | Google Sign-In | Correo electrónico del usuario que inicia sesión (Google verifica el token de identidad) | [PENDIENTE: región] |
| **Render, Inc.** | Ejecución del backend y de los tres portales | **Ve todo el tráfico en claro dentro del servidor**: la contraseña en el momento del inicio de sesión, el contenido de los documentos que pasan por el servidor y las peticiones completas. Además custodia las claves criptográficas de la plataforma, que **solo existen ahí** | EE.UU. — Oregón (backend verificado); [PENDIENTE: región de los tres portales] |
| **Autodesk, Inc.** (APS) | Traducción y visualización de modelos 3D/CAD | **Copia permanente de los modelos**: hoy 2 RVT (232 MB) y 2 DWG (460 MB). Se suben con política de almacenamiento *permanente* y se traducen en región `us` | EE.UU. |
| **Resend** | Correo transaccional (recuperación de contraseña e invitaciones) | Nombre y correo del destinatario, más el cuerpo del mensaje | [PENDIENTE: país de procesamiento] |
| **GitHub (Microsoft)** | Custodia del código fuente | Código fuente. No almacena datos de obra ni de personas de la plataforma | [PENDIENTE: región] |

**Precisiones necesarias:**

- **El correo sale desde un remitente compartido de pruebas del proveedor (`onboarding@resend.dev`).
  No hay dominio de correo propio.** Además, si falta la clave del servicio de correo, el sistema no se
  detiene: escribe el enlace en el registro para envío manual, lo que implica que **enlaces de
  recuperación de contraseña pueden quedar escritos en los registros del servidor**.
- Existe en la configuración una variable de servidor SMTP genérico, pero **está vacía y no se usa**.
- Las 2,363 fotos marcadas como importación de WhatsApp provienen de una exportación local de
  conversaciones. **Ni WhatsApp ni Meta son subencargados**: la plataforma no se conecta a ellos.

[PENDIENTE: **no consta ningún contrato de encargo de tratamiento ni acuerdo de protección de datos
(DPA) firmado con Google, Render, Autodesk ni Resend**, pese a que los cuatro tratan datos. Tampoco
constan cláusulas de transferencia internacional, y ningún dato reside en el Perú. Para ofrecer el
servicio a una entidad pública peruana, estos acuerdos son lo primero que exigirá el área legal.]

[PENDIENTE: no existe registro de actividades de tratamiento, ni evaluación de impacto, ni encargado de
protección de datos designado.]

[PENDIENTE: según manifestación del proveedor, la licencia del visor de Autodesk se renueva anualmente;
debe verificarse contra el contrato vigente la modalidad exacta de licenciamiento, su fecha de
vencimiento y sus condiciones de renovación.]

---

## 8. Copias de seguridad

### 8.1 Lo que sí existe

Existe un procedimiento de copia y restauración **de la base de datos**, construido y documentado:

- El programa de copia recorre todas las tablas leyéndolas de `information_schema`, **salvo dos que se
  excluyen a propósito por contener datos transitorios** (`upload_sessions` y
  `gemelo_ingestion_status`); una tabla nueva se incorpora sola. Guarda los contadores de identificadores
  automáticos, escribe un manifiesto con el recuento por tabla y **vuelve a leer el fichero generado para
  comprobar que cuadra**. Si no cuadra, termina con error.
- El programa de restauración carga por nombre de columna (no por posición), retira las claves ajenas
  durante la carga y las restituye al terminar. Sin confirmación explícita no escribe, y se niega a
  escribir sobre producción salvo que se le fuerce con un parámetro específico.
- **Prueba real de restauración ejecutada el 09-ago-2026**, de punta a punta contra la base real (base
  vacía → esquema → restauración → comprobación): **78 tablas y 83,563 filas idénticas**. Tamaño de la
  copia: unos 7 MB comprimidos.

**Nota sobre el recuento de tablas y de filas (idéntica en los cuatro documentos de este expediente):**
la prueba del 09-ago-2026 restauró 78 tablas sobre las 81 que había en producción ese día. Dos se
excluyen a propósito del respaldo por contener datos transitorios (`upload_sessions` y
`gemelo_ingestion_status`, constante `PRESCINDIBLES` de `backend/copia_de_seguridad.py`). [PENDIENTE:
identificar y declarar la diferencia restante entre las tablas existentes y las restauradas.] Al
12-ago-2026 la base tiene 82 tablas. **Además, aquella prueba restauró 83,563 filas y al 12-ago-2026 la
base registra aproximadamente 83,137: hoy hay menos filas y más tablas que hace tres días.** No se
ofrece explicación porque no se ha verificado ninguna. [PENDIENTE: explicar la variación de filas entre
el 09 y el 12-ago-2026.]

### 8.2 Cada cuánto y dónde

**No hay periodicidad. La copia se lanza a mano.** No existe tarea programada: la configuración de
despliegue no declara ningún servicio de tipo cron, y el único flujo de integración continua solo
ejecuta pruebas y compilación.

El destino por defecto es una carpeta local del operador. **No se encontró ninguna copia conservada**:
se buscó en las rutas por defecto y por patrón de nombre en el disco del propietario y no se halló
ningún fichero de copia. **A la fecha de corte no consta ninguna copia guardada de la base de datos.**

### 8.3 Lo que no se respalda, dicho sin rodeos

1. **Los ficheros no tienen copia de seguridad.** Los 6,093 objetos y 6.39 GB del almacenamiento —los
   planos, las 2,756 fotografías, los modelos RVT y DWG— **no se respaldan en ningún sitio**. La copia
   de la base guarda la ficha de cada documento (nombre, versión, estado, idoneidad, quién y cuándo),
   pero **no los bytes del PDF ni de la foto**. Si el almacenamiento se pierde, la plataforma conserva
   el índice de documentos que ya no existen.
2. **Las claves criptográficas no están en ninguna copia.** Las dos claves maestras se generan y viven
   únicamente dentro de Render. Sin la primera dejan de valer todos los enlaces firmados de fotos, PDF,
   invitaciones y recuperación de contraseña; sin la segunda dejan de valer todas las sesiones. **Una
   base restaurada sin ellas arranca y no sirve.**
3. **Radio de explosión.** Si la copia se guardara en el mismo proyecto de Google que la base, no
   protegería del caso que ya ocurrió: la mora en la facturación dejó el almacenamiento inaccesible.

Estas tres carencias **no están corregidas a la fecha de corte. No se compromete plazo de corrección en
este documento.** Mientras no existan, **no deben considerarse una capacidad de la plataforma**.
[PENDIENTE: alcance y fecha de la corrección, que solo el propietario puede fijar.]

### 8.4 No verificado

[PENDIENTE: comprobar en la consola de Google si la instancia de base de datos tiene copias automáticas
y recuperación a un punto en el tiempo (PITR) activadas, y con qué retención. Vienen activadas por
defecto, pero "por defecto" no es "comprobado".]

[PENDIENTE: comprobar si el almacenamiento tiene versionado de objetos, reglas de ciclo de vida o
política de retención. No se pudo leer por falta de permisos de la cuenta de servicio.]

[PENDIENTE: no existe prueba de restauración de ficheros, porque no existe copia de ficheros que
restaurar.]

[PENDIENTE: no hay objetivo declarado de RPO (cuánta información se está dispuesto a perder) ni de RTO
(en cuánto tiempo se restablece el servicio).]

---

## 9. Medidas de seguridad realmente implementadas

Solo se listan medidas comprobadas.

**Contraseñas.** Algoritmo `scrypt` con parámetros `32768:8:1` y sal distinta por usuario, verificado
directamente sobre los registros almacenados. Es un algoritmo de derivación lento y adecuado. **No hay
contraseñas en claro.**

**Sesiones.**
- Token de 256 bits (64 caracteres hexadecimales), verificado en las 27 sesiones existentes.
- **En la base no se guarda el token, sino su huella HMAC-SHA256** calculada con una clave que vive
  fuera de la base. Un volcado de la base **no permite recalcular los tokens ni suplantar sesiones**.
- Caducidad de **7 días**, verificada en las 27 sesiones.
- Una revocación surte efecto en el resto de procesos en **15 segundos como máximo**.
- **No hay cierre por inactividad**: los 7 días corren desde el inicio de sesión, se use o no.

**Cifrado en tránsito.** Los portales y la API se sirven por HTTPS. La conexión entre el backend y la
base de datos se comprobó en una conexión real: **TLS 1.3, cifrado TLS_AES_256_GCM_SHA384, 256 bits**.
*Matiz honesto:* el cliente **no exige** el modo SSL, sino que lo prefiere; el cifrado se negocia, no se
impone. Si el servidor ofreciera una conexión sin cifrar, el cliente la aceptaría.
[PENDIENTE: fijar el modo SSL como obligatorio y confirmar en la consola si la instancia exige SSL.]

**Cifrado en reposo.** El cifrado por defecto de Google para base de datos y almacenamiento, con
**claves gestionadas por Google**. No hay claves gestionadas por el cliente (CMEK) ni cifrado a nivel de
campo en la aplicación.
[PENDIENTE: confirmar si el almacenamiento tiene alguna clave KMS asignada; no se pudo leer por falta de
permisos.]

**El almacenamiento no es público.** Comprobado con peticiones anónimas: leer los metadatos del bucket
y listar sus objetos devuelven **HTTP 401**. Los ficheros se entregan mediante **URL firmadas con
caducidad máxima de 24 horas**.
[PENDIENTE: existe en el repositorio un fichero de configuración CORS que declara origen `*` con métodos
GET, PUT, POST y DELETE. Debe confirmarse si esa configuración está aplicada hoy al almacenamiento y,
de estarlo, restringirse a los orígenes propios.]

**Límite de peticiones.** 200 peticiones por minuto por defecto. *Matiz:* el contador vive **en la
memoria de cada proceso**, porque no hay almacén compartido configurado; con 4 procesos de trabajo el
límite efectivo se multiplica por 4. Afecta directamente a la resistencia del inicio de sesión frente a
ataques de fuerza bruta.

**Validación de ficheros subidos.** Existe un validador de tipo y tamaño. **No hay análisis antivirus ni
antimalware.**

**Credenciales en el historial del código — hecho comprobado que no se puede disimular.** El primer
commit del repositorio incluye un fichero de configuración con el identificador y el secreto de cliente
de Autodesk. El fichero se dejó de rastrear después, pero **el contenido sigue siendo recuperable del
historial de Git**. Lo que acota el daño: ese fichero histórico contenía **únicamente** las claves de
Autodesk (no las de la base de datos), y la clave de la cuenta de servicio de Google **nunca se subió**
al repositorio.
[PENDIENTE: confirmar si el repositorio es privado y si las credenciales de Autodesk se rotaron. Si no
se han rotado, deben rotarse antes de presentar nada a una entidad.]

**No existe:** segundo factor de autenticación (2FA/MFA), cifrado de extremo a extremo, firma digital de
documentos, sello de tiempo, ni prueba de penetración o auditoría de seguridad externa.

---

## 10. Registro y trazabilidad

| Registro | Contenido | Cobertura temporal |
|---|---|---|
| Actividad documental (1,034 filas) | Subidas (485), creación de carpetas (174), **borrados definitivos (160)**, cambios de descripción (56), borrados (49), subidas por vía alterna (28), restauraciones (22), borrados por lote (21), accesos a documento (17), renombrados (13), movimientos (4) y otras acciones unitarias de revisión, transmittal y set (5). **La suma de este desglose es 1,034, el total de la tabla.** | 22-mar-2026 a 11-ago-2026 |
| Accesos (32 filas) | Correo, IP y navegador de cada inicio de sesión (30 correctos, 2 fallidos; 2 IP distintas) | **Solo desde el 07-ago-2026** |

**Límite del registro de descargas, dicho tal cual lo declara la propia herramienta:** como el fichero
se entrega mediante URL firmada y los bytes viajan después directamente desde el almacenamiento de
Google, **no se puede afirmar "esta persona completó la descarga", solo "a esta persona se le entregó el
acceso a este documento, a esta hora y por esta vía"**. Se anota una sola línea por persona, documento y
ventana de 5 minutos.

El autor de cada acción se guarda como **nombre o correo en texto libre**, no como identificador de
usuario; hoy hay 6 identificadores distintos en ese campo.

**No hay retención definida de registros ni envío a un sistema externo de registro: los registros viven
en la misma base de datos que los datos.**

---

## 11. Cómo recupera la Entidad toda su información si decide irse

Se describe lo que la plataforma permite **hoy**, no lo deseable.

### 11.1 Documentos y ficheros

Existe una función de **descarga de carpeta completa**: el servidor recorre el árbol de la carpeta de
forma recursiva, verifica que quien pide tenga al menos permiso de "Ver y descargar" sobre ella, y
devuelve un manifiesto de URL firmadas con la ruta relativa de cada fichero, que el navegador descarga
en paralelo y comprime localmente. **Esto permite bajar el árbol documental completo conservando la
estructura de carpetas y los nombres**, aplicándolo sobre la carpeta raíz de la obra.

Limitaciones que deben conocerse:

- La entrega es **fichero a fichero mediante URL firmada de corta duración**; el volumen actual por
  obra (hasta 970 MB en la obra fotográfica) es manejable, pero no hay una función de exportación
  masiva empaquetada en el servidor ni entrega en medio físico.
- La descarga entrega **los ficheros**, no las fichas. Los metadatos (versión, estado, idoneidad, autor,
  fechas, descripciones, RFI, redlines, transmittals, registro de actividad) viven en la base de datos.
- [PENDIENTE: no existe un procedimiento formal de salida ni de devolución y borrado certificado al
  término del servicio. Debe redactarse y anexarse al contrato.]

### 11.2 Metadatos y base de datos

La entrega de los metadatos se realiza mediante el **programa de copia de la base de datos** descrito en
la sección 8, cuya restauración fue probada de punta a punta el 09-ago-2026. El resultado es un fichero
de unos 7 MB comprimidos con las 78 tablas y su contenido íntegro (ver la nota sobre el recuento de
tablas en la sección 8.1).

**Formato de esa copia, dicho con precisión:** es **CSV por tabla con cabecera**, dentro de un único
fichero comprimido, acompañada de un manifiesto JSON con el recuento de filas de cada tabla. **Es
legible con herramientas comunes.** Lo que **no** existe hoy es (a) un diccionario de datos que explique
cada tabla y campo, y (b) la posibilidad de extraer solo la información de una entidad: la copia
contiene toda la base.
[PENDIENTE: construir ambos —diccionario de datos y exportador por entidad— si la Entidad exige
portabilidad en formato abierto y acotada a su propia información.]

### 11.3 Modelos 3D y CAD

Los ficheros originales RVT y DWG están en el almacenamiento y se descargan como cualquier otro
documento. **Adicionalmente, existe una copia de esos modelos en la infraestructura de Autodesk con
política de almacenamiento permanente.**
[PENDIENTE: no existe hoy un procedimiento documentado para solicitar y verificar la eliminación de esa
copia en Autodesk al término del servicio. Debe definirse.]

### 11.4 Lo que no se puede entregar

Las claves criptográficas de la plataforma viven únicamente en Render y **no se entregan**; carecen de
valor fuera de la instalación original, pero implica que una copia de la base entregada a la Entidad
**no puede levantarse tal cual** sin generar nuevas claves, lo que invalida los enlaces firmados
previos y todas las sesiones.

### 11.5 Derechos de las personas (acceso, rectificación, cancelación, oposición, portabilidad)

**No disponible actualmente.** No existe procedimiento documentado ni función en el sistema que exporte
o elimine los datos de un titular concreto. La atención de un pedido de este tipo hoy requeriría una
intervención manual del administrador sobre la base de datos.
[PENDIENTE: construir el procedimiento y, de ser exigido, la función que lo soporte.]

---

## 12. Carencias declaradas

Se listan de forma expresa. La lectura de esta sección es la razón por la que este documento existe.

1. **Ninguna certificación.** Ni ISO 27001, ni ISO 9001, ni SOC 2, ni ninguna otra. Ningún proceso de
   certificación iniciado.
2. **El almacenamiento documental no tiene copia de seguridad** (6,093 objetos, 6.39 GB). Solo se copia
   la base de datos.
3. **No hay copia automática ni programada**, y a la fecha de corte **no consta ninguna copia
   conservada**.
4. **No está verificado** que la base de datos administrada tenga copias automáticas ni recuperación a
   un punto en el tiempo.
5. **No hay copia fuera del mismo proveedor y proyecto de Google.** La mora en la facturación ya dejó el
   almacenamiento inaccesible una vez.
6. **La separación entre obras no se aplica de forma transversal:** el control transversal está en modo
   registro. Los módulos documentales sí comprueban por su cuenta la pertenencia a la obra y bloquean;
   los de RFI, redlines, pines de campo, vistas guardadas, inventario 3D y obra civil, no (ver 6.4 a).
   Incompatible con atender a más de una entidad a la vez.
7. **La política de "denegar por defecto" está en modo sombra:** evalúa y anota, pero no decide.
8. **No hay segundo factor de autenticación (2FA/MFA).**
9. **No hay una organización corporativa de Google Cloud.** El proyecto y el almacenamiento tienen
   nombres propios de una cuenta personal.
10. **No hay separación de funciones.** Una sola persona administra la aplicación, la base de datos, la
    nube, el repositorio y la cuenta del proveedor de ejecución.
11. **Las credenciales de Autodesk son recuperables del historial de Git** desde el primer commit.
12. **No hay política documentada de retención ni de eliminación de datos.**
13. **No hay procedimiento ni función para atender derechos de las personas.**
14. **No hay contrato de encargo de tratamiento ni DPA firmado** con Google, Render, Autodesk ni Resend,
    ni cláusulas de transferencia internacional. Ningún dato reside en el Perú.
15. **No hay registro de actividades de tratamiento, ni evaluación de impacto, ni encargado de
    protección de datos designado.**
16. **No hay procedimiento documentado de respuesta a incidentes ni de notificación.** El incidente del
    07-ago-2026 se cerró sin determinar el autor.
17. **No hay retención ni centralización de registros.** La actividad cubre desde el 22-mar-2026 y los
    accesos apenas desde el 07-ago-2026; todo vive en la misma base que los datos.
18. **No hay compromiso de disponibilidad ni acuerdo de nivel de servicio (SLA), ni monitoreo o alertas**
    que avisen de una caída.
19. **No hay dominio de correo propio.** Los correos salen desde un remitente compartido de pruebas del
    proveedor.
20. **No hay análisis antivirus ni antimalware** sobre los ficheros que se suben.
21. **No consta prueba de penetración ni auditoría de seguridad externa.**
22. **El límite de peticiones es por proceso**, de modo que el límite efectivo contra fuerza bruta en el
    inicio de sesión se multiplica por el número de procesos de trabajo (4 en producción).
23. **La conexión a la base de datos negocia TLS pero no lo exige**, y la base tiene IP pública y acepta
    conexiones desde internet.
24. **No hay firma digital de documentos, sello de tiempo, cifrado de extremo a extremo ni claves de
    cifrado gestionadas por el cliente.**
25. **No hay política de privacidad ni términos de servicio publicados, ni contrato modelo de prestación
    de servicios.**
26. **No hay entorno de pruebas separado del de producción:** las obras de prueba y los duplicados
    conviven con la obra real en la misma base de datos.

---

## 13. Índice consolidado de pendientes

### 13.1 Solo el propietario puede aportarlos

- [PENDIENTE: razón social, RUC, RNP, domicilio fiscal, representante legal, correo y teléfono]
- [PENDIENTE: precios, plazos comerciales y condiciones de contratación]
- [PENDIENTE: política de privacidad, términos de servicio y contrato modelo de prestación de servicios]
- [PENDIENTE: designación de un contacto responsable de protección de datos]
- [PENDIENTE: alcance y fecha de la corrección de la copia de seguridad de ficheros]

### 13.2 Verificaciones en consolas de proveedores

- [PENDIENTE: región del bucket de almacenamiento en Google Cloud]
- [PENDIENTE: versionado, ciclo de vida, retención y clave KMS del bucket]
- [PENDIENTE: copias automáticas y PITR de la instancia de base de datos, con su retención]
- [PENDIENTE: nombre de la instancia de base de datos y sus redes autorizadas (¿está abierta a
  0.0.0.0/0?)]
- [PENDIENTE: si la instancia de base de datos exige SSL]
- [PENDIENTE: región de los tres portales web en Render]
- [PENDIENTE: si las variables que activan la separación entre obras y la política estricta fueron
  definidas manualmente en Render]
- [PENDIENTE: titularidad de la cuenta de facturación de Google y pertenencia del proyecto a una
  organización]
- [PENDIENTE: si el repositorio de código es privado, y si las credenciales de Autodesk se rotaron]
- [PENDIENTE: si la configuración CORS con origen `*` está aplicada hoy al almacenamiento]
- [PENDIENTE: fecha de vencimiento y condiciones de renovación de la licencia del visor de Autodesk]
- [PENDIENTE: país de procesamiento del proveedor de correo transaccional y región del repositorio de
  código]

### 13.3 Trabajo por realizar antes de una puesta en servicio

- [PENDIENTE: revisión manual de una muestra de las 2,756 imágenes para declarar si contienen rostros de
  trabajadores identificables, y qué proporción conserva coordenadas GPS dentro del fichero]
- [PENDIENTE: identificar y declarar la diferencia restante entre las tablas existentes y las 78
  restauradas en la prueba del 09-ago-2026 (ver la nota de la sección 8.1)]
- [PENDIENTE: explicar la variación de filas entre el 09 y el 12-ago-2026 —83,563 restauradas frente a
  ~83,137 hoy— (ver la nota de la sección 8.1)]
- [PENDIENTE: explicar por qué la tabla de sesiones no refleja las 62 revocaciones del 07-ago-2026]
- [PENDIENTE: recomprobar la consulta de reparto de ficheros por ámbito, cuyo peso no cuadra con el
  total declarado en la sección 4]
- [PENDIENTE: contratos de encargo de tratamiento (DPA) y cláusulas de transferencia internacional con
  Google, Render, Autodesk y el proveedor de correo]
- [PENDIENTE: registro de actividades de tratamiento y evaluación de impacto]
- [PENDIENTE: procedimiento de alta y baja de usuarios, revisión periódica de permisos y política de
  contraseñas]
- [PENDIENTE: procedimiento de respuesta a incidentes y de notificación]
- [PENDIENTE: política de retención y eliminación de datos]
- [PENDIENTE: procedimiento de salida, devolución y borrado certificado, incluida la eliminación de la
  copia permanente de los modelos en Autodesk]
- [PENDIENTE: diccionario de datos de la copia y exportador de metadatos acotado a una sola entidad]
- [PENDIENTE: objetivos de RPO y RTO]

---

*Documento en versión 1.0 - borrador. Cualquier valor marcado como [PENDIENTE] no debe darse por
resuelto hasta que se sustituya por un dato verificado. Este documento no constituye una oferta ni un
compromiso contractual.*
