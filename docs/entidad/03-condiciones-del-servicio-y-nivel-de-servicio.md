# Condiciones del servicio, nivel de servicio (SLA) y salida del contrato

**Documento 03 del expediente para entidades públicas**
**Versión 1.0 - borrador**
**Fecha: [PENDIENTE: fecha]**

| Campo | Contenido |
|---|---|
| Proveedor (en adelante, EL PROVEEDOR) | [PENDIENTE: razón social] |
| RUC | [PENDIENTE: RUC] |
| Domicilio fiscal | [PENDIENTE: domicilio fiscal] |
| Registro Nacional de Proveedores (RNP) | [PENDIENTE: número de RNP y vigencia, si corresponde al tipo de contratación] |
| Representante legal | [PENDIENTE: nombre y DNI] |
| Correo y teléfono de contacto | [PENDIENTE: correo y teléfono] |
| Entidad contratante (en adelante, LA ENTIDAD) | [PENDIENTE: nombre de la entidad, RUC y domicilio] |
| Servicio | Plataforma web de Entorno Común de Datos (ECD) para gestión documental de obra, visualización de modelos BIM y registro fotográfico de campo |
| Vigencia | [PENDIENTE: fecha de inicio y de fin] |
| Contraprestación | [PENDIENTE: precio, moneda, forma y periodicidad de pago] |

> **Aviso sobre el estado de este documento.** Este es un borrador de trabajo. No ha sido revisado por un abogado y no debe firmarse ni entregarse como oferta en firme sin esa revisión. Ver la sección 17.

---

## 1. Objeto y alcance

### 1.1 Objeto

EL PROVEEDOR pone a disposición de LA ENTIDAD, en la modalidad de servicio en la nube (el software no se instala en servidores de LA ENTIDAD), una plataforma web para:

- Almacenar, organizar en carpetas y versionar documentos de obra (planos en PDF, expedientes, fotografías de campo, modelos RVT y DWG).
- Controlar el acceso a esos documentos por carpeta, con seis niveles de permiso.
- Visualizar modelos 3D y planos CAD en el navegador, sin instalar software de escritorio.
- Registrar consultas técnicas (RFI), anotaciones sobre planos (redlines), revisiones, transmittals y reportes diarios.
- Consultar un asistente documental basado en inteligencia artificial sobre los documentos cargados.

### 1.2 Alcance funcional comprometido

Solo se compromete lo que la plataforma hace hoy y ha sido verificado. Cualquier funcionalidad no listada en el Anexo A no forma parte del contrato, aunque aparezca en la interfaz, en material de presentación o en conversaciones previas.

### 1.3 Exclusiones expresas del alcance

EL PROVEEDOR **no** presta, como parte de este contrato:

- Digitalización, escaneo, saneamiento ni carga masiva inicial de documentos de LA ENTIDAD. [PENDIENTE: definir si se contrata aparte y su precio]
- Modelado BIM, revisión técnica de proyectos, compatibilización ni supervisión de obra.
- Suministro de licencias de software de escritorio (Revit, AutoCAD, Civil 3D u otros).
- Equipos, conectividad ni soporte a la infraestructura interna de LA ENTIDAD.
- Capacitación, más allá de la indicada en [PENDIENTE: definir horas de capacitación incluidas, si las hay].
- Firma digital de documentos, sello de tiempo o valor probatorio electrónico. La plataforma **no** cuenta con estas funciones (ver sección 15).
- Integración con sistemas de LA ENTIDAD (SIAF, SEACE, trámite documentario u otros). No existe hoy ninguna integración de ese tipo.

### 1.4 Usuarios

El servicio se presta para hasta [PENDIENTE: número de usuarios nominales incluidos] usuarios nominales. Las cuentas son personales e intransferibles: no se admiten cuentas compartidas entre varias personas, porque el registro de actividad quedaría inservible como evidencia.

---

## 2. Definiciones

- **Información de LA ENTIDAD**: todo dato, documento, fichero, fotografía, modelo, metadato, anotación y registro cargado, generado o derivado del uso del servicio por LA ENTIDAD o por sus usuarios.
- **Incidencia**: cualquier fallo, degradación o comportamiento del servicio distinto del descrito en el Anexo A.
- **Indisponibilidad**: periodo durante el cual la plataforma no responde o responde con error a las peticiones de LA ENTIDAD, por causa imputable al servicio.
- **Tiempo de respuesta**: tiempo entre el registro de la incidencia por el canal oficial y el primer acuse de EL PROVEEDOR con diagnóstico inicial. **No es** el tiempo de solución.
- **Tiempo de solución**: tiempo hasta el restablecimiento del servicio o hasta una solución temporal aceptada por LA ENTIDAD.
- **Subencargado**: tercero que trata información de LA ENTIDAD por cuenta de EL PROVEEDOR (sección 11).
- **Horario hábil**: lunes a viernes de [PENDIENTE: hora inicio] a [PENDIENTE: hora fin], hora de Perú (UTC-5), excluidos feriados calendario del Perú.

---

## 3. PROPIEDAD DE LA INFORMACIÓN

> ## **LA INFORMACIÓN ES DE LA ENTIDAD. SIEMPRE. SIN EXCEPCIÓN.**
>
> **Toda la información que LA ENTIDAD cargue, genere o derive del uso de esta plataforma es y sigue siendo de su exclusiva propiedad, durante la vigencia del contrato y después de terminado, cualquiera sea la causa de la terminación, y aunque existan pagos pendientes.**

3.1 EL PROVEEDOR no adquiere ningún derecho de propiedad, licencia de uso, explotación, cesión ni titularidad sobre la Información de LA ENTIDAD. Su rol es exclusivamente el de custodio y procesador por cuenta de LA ENTIDAD.

3.2 **EL PROVEEDOR no usará la Información de LA ENTIDAD para ningún fin distinto de prestar el servicio contratado.** En particular, y de forma expresa, no la usará para: entrenar modelos de inteligencia artificial propios ni para cederla con ese fin; elaborar estadísticas, informes de mercado o material comercial; alimentar demostraciones a otros clientes; ni cederla, venderla o publicarla.

**Alcance real de este compromiso respecto de terceros.** Respecto del servicio de inteligencia artificial de terceros descrito en 11.2, el compromiso equivalente **depende de las condiciones contractuales de ese proveedor**, y a la fecha no consta ningún acuerdo de tratamiento firmado con él (ver 11.4). [PENDIENTE: suscribir el acuerdo de tratamiento con Google y adjuntar la cláusula que excluya el uso del contenido para entrenamiento; hasta entonces, el módulo debe entregarse desactivado.]

3.3 **No hay retención por impago.** EL PROVEEDOR no podrá retener, bloquear ni condicionar la devolución o el borrado de la Información de LA ENTIDAD alegando facturas impagas, controversias contractuales o cualquier otro motivo. Las controversias económicas se resuelven por la vía prevista en la sección 16, nunca reteniendo información pública.

3.4 LA ENTIDAD puede solicitar en cualquier momento, durante la vigencia del contrato y sin coste adicional, una copia de su información en los términos de la sección 12. Se admiten hasta [PENDIENTE: definir número de solicitudes de copia sin coste al año; recomendación: 2 al año, para que la cláusula sea sostenible para un proveedor pequeño] solicitudes anuales.

3.5 El software de la plataforma, su código fuente y su documentación técnica son propiedad de EL PROVEEDOR. LA ENTIDAD recibe un derecho de uso no exclusivo y no transferible durante la vigencia del contrato. Esta cláusula **no** alcanza a la Información de LA ENTIDAD, regida por 3.1 a 3.4.

3.6 Los documentos, planos y modelos de LA ENTIDAD que se carguen en la plataforma pueden estar sujetos a derechos de terceros (proyectistas, contratistas). LA ENTIDAD declara contar con las autorizaciones necesarias para cargarlos. EL PROVEEDOR no verifica ni puede verificar la titularidad de lo que se carga.

---

## 4. Confidencialidad

4.1 EL PROVEEDOR tratará como confidencial toda la Información de LA ENTIDAD, incluidos los documentos de obra, los datos de sus funcionarios y servidores usuarios de la plataforma, y la propia configuración del servicio.

4.2 El deber de confidencialidad se mantiene durante la vigencia del contrato y por [PENDIENTE: definir plazo posterior; recomendación: 5 años desde la terminación] años después de su terminación, y sobrevive a cualquier causa de resolución.

4.3 Solo el personal de EL PROVEEDOR que necesite acceder para prestar el servicio podrá hacerlo. **Declaración honesta y verificada: hoy ese personal es una sola persona.** No existe un segundo administrador ni separación de funciones (ver sección 15.3).

4.4 EL PROVEEDOR podrá revelar información confidencial únicamente cuando lo exija una autoridad competente mediante requerimiento formal. En ese caso lo comunicará a LA ENTIDAD dentro de las 24 horas de recibido el requerimiento, salvo prohibición legal expresa de comunicarlo.

4.5 **Limitación material que debe conocerse:** el personal de EL PROVEEDOR con acceso administrativo puede leer cualquier documento almacenado. La plataforma **no** cuenta con cifrado de extremo a extremo ni con cifrado por campo en la aplicación (ver sección 9.3). El cifrado protege frente a terceros, no frente al administrador del sistema.

4.6 LA ENTIDAD se obliga, por su parte, a que sus usuarios no compartan credenciales y a comunicar de inmediato el cese o cambio de funciones de cualquier usuario, para su baja.

---

## 5. Disponibilidad comprometida y cómo se mide

### 5.1 Punto de partida honesto

**Hoy no existe ningún sistema de monitoreo ni de alertas que mida la disponibilidad de la plataforma.** No hay sonda externa, no hay panel de estado público, no hay aviso automático de caída. Verificado: no hay servicio de monitoreo declarado en la configuración de despliegue.

Esto tiene dos consecuencias que no se pueden esquivar:

1. **No se puede comprometer hoy un porcentaje de disponibilidad, porque no se puede medir ni demostrar.** Comprometer una cifra que nadie mide es comprometer nada.
2. Antes de firmar con una entidad, debe implementarse la medición. Sin medición, la cláusula de SLA es decorativa y, ante un reclamo, EL PROVEEDOR no tendría cómo defenderse ni LA ENTIDAD cómo acreditar el incumplimiento.

### 5.2 Compromiso de disponibilidad

**[PENDIENTE: definir el porcentaje de disponibilidad comprometido.]**

**Recomendación prudente y por qué:**

Para el primer periodo (piloto de [PENDIENTE: definir duración; recomendación: 6 meses]), lo recomendable es **no comprometer un porcentaje** y declarar el servicio como *prestado bajo criterio de mejor esfuerzo, con medición obligatoria y reporte mensual*. Al término del piloto, con seis meses de mediciones reales, se fija el porcentaje con datos y no con una suposición.

Si LA ENTIDAD exige una cifra desde el inicio, la recomendación es **99.0 % mensual medido solo en horario hábil**, que equivale a poco más de dos horas de indisponibilidad tolerada al mes. No se recomienda ofrecer más que eso, por cinco razones verificadas:

| Motivo | Hecho verificado |
|---|---|
| No hay redundancia | Un solo servicio de backend, en una sola región (Oregón, Estados Unidos). No hay segunda instancia ni conmutación por error. |
| No hay monitoreo | Una caída de madrugada podría no detectarse hasta que un usuario la reporte al día siguiente. |
| Cadena de tres proveedores | El servicio depende simultáneamente de Render (ejecución), Google (base de datos y almacenamiento) y Autodesk (visor 3D). La disponibilidad real es el producto de las tres, no la de la mejor. |
| Un solo responsable | El soporte y la recuperación dependen de una sola persona, sin turnos ni guardia. |
| Precedente real | Ya ocurrió una interrupción del almacenamiento por facturación en mora. Es un riesgo demostrado, no teórico. |

Equivalencias, para que la cifra que se firme se entienda antes de firmarla:

| Compromiso | Indisponibilidad tolerada, mes completo (720 h) | Indisponibilidad tolerada, solo horario hábil (≈220 h) |
|---|---|---|
| 99.9 % | 43 minutos | 13 minutos |
| 99.5 % | 3 h 36 min | 1 h 6 min |
| 99.0 % | 7 h 12 min | 2 h 12 min |
| 98.0 % | 14 h 24 min | 4 h 24 min |

### 5.3 Cómo se mide

Una vez implementada la medición, regirán estas reglas:

- **Instrumento**: sonda externa e independiente que consulte el punto de verificación de salud del backend (`/api/health`) cada [PENDIENTE: definir intervalo; recomendación: 1 minuto] desde al menos dos ubicaciones distintas. [PENDIENTE: contratar y configurar el servicio de monitoreo; no existe hoy]
- **Criterio de caída**: se considera indisponibilidad cuando dos comprobaciones consecutivas, desde ubicaciones distintas, fallan o superan [PENDIENTE: definir umbral de tiempo de respuesta; recomendación: 30 segundos].
- **Periodo de cálculo**: mes calendario.
- **Fórmula**: Disponibilidad (%) = (Minutos del periodo − Minutos de indisponibilidad computable) / Minutos del periodo × 100.
- **Reporte**: EL PROVEEDOR entregará a LA ENTIDAD, dentro de los primeros [PENDIENTE: definir; recomendación: 10] días hábiles de cada mes, un reporte con la disponibilidad medida, el detalle de cada interrupción, su causa y su duración.
- **Discrepancias**: si la medición de LA ENTIDAD difiere de la de EL PROVEEDOR, prevalece la de la sonda externa acordada. Si no hay sonda acordada, no hay medición y no hay penalidad exigible; por eso 5.3 es condición para 5.2.

### 5.4 Qué no computa como indisponibilidad

- Ventanas de mantenimiento programadas conforme a la sección 6.
- Fallas de la conectividad a internet, de los equipos o de la red interna de LA ENTIDAD.
- Interrupciones causadas por proveedores de infraestructura de terceros (Google, Render, Autodesk), **de las que EL PROVEEDOR debe informar igualmente a LA ENTIDAD, con la causa y la referencia pública del incidente del proveedor.** Esta exclusión es real y hay que declararla: EL PROVEEDOR no puede comprometer una disponibilidad mayor que la de la infraestructura que revende. [PENDIENTE: decidir si esta exclusión se acepta tal cual o si se pacta un tope, por ejemplo que las caídas de terceros excluidas no superen X horas al año antes de habilitar la resolución del contrato]
- Suspensión del servicio ordenada por autoridad competente.
- Uso del servicio fuera de las condiciones del Anexo A (por ejemplo, carga de ficheros que exceden el límite soportado).
- Caso fortuito o fuerza mayor debidamente acreditados.

### 5.5 Consecuencias del incumplimiento

**[PENDIENTE: definir penalidades.]**

Recomendación: en un primer contrato, en lugar de penalidad económica, pactar **crédito de servicio** (descuento en la siguiente facturación) y un umbral de resolución por incumplimiento reiterado. Motivo: una penalidad económica sobre un proveedor pequeño que depende de infraestructura de terceros puede volverse impagable por una caída que no originó, y termina en controversia en lugar de en servicio restablecido. Debe además revisarse si el régimen de contratación pública aplicable impone un régimen de penalidades obligatorio que desplace lo aquí pactado. [PENDIENTE: verificar con abogado el régimen de penalidades exigible según la modalidad de contratación]

---

## 6. Ventanas de mantenimiento

6.1 **Mantenimiento programado.** EL PROVEEDOR podrá suspender el servicio para tareas de mantenimiento, actualización o migración, con aviso previo a LA ENTIDAD de al menos [PENDIENTE: definir; recomendación: 5 días hábiles] por el canal de la sección 7.

6.2 Franja recomendada para el mantenimiento programado: [PENDIENTE: definir; recomendación: sábados o domingos entre las 00:00 y las 06:00, hora de Perú], por ser la franja de menor actividad de obra.

6.3 Duración máxima acumulada de mantenimiento programado: [PENDIENTE: definir; recomendación: 4 horas al mes]. El mantenimiento programado dentro de este límite y avisado no computa como indisponibilidad.

6.4 **Mantenimiento de emergencia.** Ante un riesgo de seguridad o de pérdida de información, EL PROVEEDOR podrá intervenir de inmediato sin aviso previo, comunicándolo a LA ENTIDAD dentro de la hora siguiente al inicio de la intervención y remitiendo un informe dentro de las 48 horas siguientes a su cierre.

6.5 **Advertencia verificada:** no existe un entorno de pruebas separado del de producción. Los cambios se validan sobre el mismo entorno que usa LA ENTIDAD. Esto eleva el riesgo de que un despliegue afecte el servicio. [PENDIENTE: habilitar un entorno de pruebas separado antes de la puesta en producción con una entidad; ver sección 14]

6.6 Cada despliegue reinicia el servicio. La reanudación de la base de datos y del proceso implica una interrupción breve. [PENDIENTE: medir la duración real de esa interrupción y declararla aquí]

---

## 7. Soporte

### 7.1 Canal oficial

| Concepto | Detalle |
|---|---|
| Correo de soporte | [PENDIENTE: correo de soporte] |
| Teléfono / WhatsApp | [PENDIENTE: número] |
| Horario de atención | [PENDIENTE: definir; recomendación: lunes a viernes de 08:00 a 18:00, hora de Perú, excluidos feriados] |
| Fuera de horario | Solo para incidencias de Gravedad 1, por el canal telefónico. No hay guardia 24/7. |

Únicamente las incidencias registradas por el canal oficial cuentan para el cómputo de los tiempos de respuesta. Los avisos por vías informales no generan obligación de plazo.

### 7.2 Niveles de gravedad y tiempos

**Advertencia: "tiempo de respuesta" es el primer acuse con diagnóstico inicial. No es el tiempo de solución.** Los tiempos de solución no se comprometen en firme porque una parte de las causas posibles está en manos de terceros (Google, Render, Autodesk) y EL PROVEEDOR no controla su tiempo de reacción.

| Gravedad | Definición | Tiempo de respuesta | Objetivo de solución |
|---|---|---|---|
| **1 – Crítica** | Plataforma inaccesible para todos los usuarios; o pérdida, corrupción o exposición no autorizada de información. | [PENDIENTE: definir; recomendación: 2 horas hábiles] | Mitigación inmediata e informe de avance cada [PENDIENTE; recomendación: 4 horas hábiles] hasta el cierre. |
| **2 – Alta** | Un módulo esencial (subida, descarga, permisos, visor) inoperativo, sin alternativa, con trabajo de obra bloqueado. | [PENDIENTE: definir; recomendación: 1 día hábil] | [PENDIENTE: definir; recomendación: 3 días hábiles] |
| **3 – Media** | Fallo que degrada el uso pero admite una alternativa. | [PENDIENTE: definir; recomendación: 3 días hábiles] | [PENDIENTE: definir; recomendación: 10 días hábiles] |
| **4 – Baja** | Consulta de uso, solicitud de mejora, duda funcional. | [PENDIENTE: definir; recomendación: 5 días hábiles] | Según planificación; sin compromiso de fecha. |

La clasificación inicial la propone LA ENTIDAD al registrar la incidencia. Si EL PROVEEDOR discrepa, debe justificarlo por escrito dentro del tiempo de respuesta del nivel propuesto por LA ENTIDAD; mientras no lo justifique, rige la clasificación de LA ENTIDAD.

### 7.3 Limitación de capacidad que debe declararse

**El soporte lo presta una sola persona.** No hay mesa de ayuda, ni turnos, ni relevo. En caso de enfermedad, viaje o cualquier indisponibilidad personal, los tiempos de la tabla 7.2 no podrán cumplirse. [PENDIENTE: definir un plan de contingencia de personal —segunda persona capacitada o acuerdo con un tercero— y declararlo aquí. Sin esto, los plazos de la tabla 7.2 son una expectativa, no una garantía.]

### 7.4 Escalamiento

| Nivel | Responsable | Contacto |
|---|---|---|
| Nivel 1 | [PENDIENTE: nombre y cargo] | [PENDIENTE] |
| Nivel 2 (titular) | [PENDIENTE: nombre del representante legal] | [PENDIENTE] |

---

## 8. Copias de seguridad y recuperación

Esta sección se redacta con lo que existe hoy, verificado. Lo que no existe, se dice.

### 8.1 Lo que sí existe

- Herramienta propia de copia de la **base de datos**: `backend/copia_de_seguridad.py`. Recorre todas las tablas leyéndolas de `information_schema`, **salvo dos que se excluyen a propósito por contener datos transitorios** (`upload_sessions` y `gemelo_ingestion_status`); una tabla nueva se incorpora sola. Conserva los contadores de identificadores, escribe un manifiesto con el recuento por tabla y vuelve a leer el fichero generado para comprobar que cuadra; si no cuadra, termina con error.
- Herramienta propia de restauración: `backend/restaurar.py`. Carga por nombre de columna, desactiva las claves foráneas durante la carga y las restablece al terminar. Sin la confirmación explícita no escribe, y se niega a escribir sobre producción salvo indicación expresa.
- Procedimiento documentado en `docs/copias-y-restauracion.md`.
- **Prueba real de restauración ejecutada el 09-ago-2026**, de punta a punta contra la base real: base vacía, esquema, restauración y comprobación. Resultado: 78 tablas y 83,563 filas idénticas. Tamaño de la copia: aproximadamente 7 MB comprimidos.

**Nota sobre el recuento de tablas y de filas (idéntica en los cuatro documentos de este expediente):** la prueba del 09-ago-2026 restauró 78 tablas sobre las 81 que había en producción ese día. Dos se excluyen a propósito del respaldo por contener datos transitorios (`upload_sessions` y `gemelo_ingestion_status`, constante `PRESCINDIBLES` de `backend/copia_de_seguridad.py`). [PENDIENTE: identificar y declarar la diferencia restante entre las tablas existentes y las restauradas.] Al 12-ago-2026 la base tiene 82 tablas. **Además, aquella prueba restauró 83,563 filas y al 12-ago-2026 la base registra aproximadamente 83,137: hoy hay menos filas y más tablas que hace tres días.** No se ofrece explicación porque no se ha verificado ninguna. [PENDIENTE: explicar la variación de filas entre el 09 y el 12-ago-2026.]

### 8.2 Lo que NO existe hoy, y hay que decirlo sin rodeos

1. **No hay copia de seguridad de los ficheros.** Los 6,093 objetos y 6.39 GB del almacenamiento (planos, 2,756 fotografías, modelos RVT y DWG) **no se respaldan en ningún sitio**. La copia de la base guarda la ficha de cada documento —nombre, versión, estado, quién y cuándo— pero **no los bytes del PDF ni de la fotografía**. Si el almacenamiento se pierde, la plataforma conserva el índice de documentos que ya no existen.
2. **No hay copia automática ni programada.** La copia se lanza a mano. No hay tarea programada en la infraestructura de despliegue ni en el repositorio.
3. **No consta ninguna copia conservada.** Al 12-ago-2026 no se encontró ningún fichero de copia guardado en el equipo del operador.
4. **No está verificado** que la base de datos tenga activadas las copias automáticas del proveedor de nube ni la recuperación a un punto en el tiempo. [PENDIENTE: comprobarlo en la consola del proveedor y declarar la retención]
5. **No hay copia fuera del mismo proveedor y proyecto de nube.** El precedente de la interrupción por facturación en mora demuestra que una copia alojada en el mismo proyecto se habría cortado también.
6. **No se respaldan los secretos** de firma y de sesión, que existen únicamente en el proveedor de ejecución. Una base restaurada sin ellos arranca pero no sirve: se invalidan todos los enlaces firmados y todas las sesiones.
7. **No hay prueba de restauración de ficheros**, porque no hay copia de ficheros que restaurar.

### 8.3 Compromiso que se asume en este contrato

Estos compromisos **solo pueden firmarse una vez subsanado lo de 8.2**; hasta entonces son requisitos previos, no compromisos vigentes (ver sección 14).

| Concepto | Compromiso |
|---|---|
| Frecuencia de copia de la base de datos | [PENDIENTE: definir; recomendación: diaria automática, más retención de 30 días] |
| Frecuencia de copia de los ficheros | [PENDIENTE: definir; recomendación: diaria automática hacia un proveedor o proyecto distinto del principal] |
| Ubicación de las copias | [PENDIENTE: definir; recomendación: proveedor y cuenta de facturación distintos de los de producción, por el precedente de la mora] |
| Retención | [PENDIENTE: definir] |
| RPO (información máxima que se acepta perder) | [PENDIENTE: definir; recomendación: 24 horas] |
| RTO (tiempo máximo de restablecimiento) | [PENDIENTE: definir; recomendación: 24 horas hábiles para la base; el plazo de los ficheros depende del volumen y no puede fijarse sin una prueba real] |
| Prueba de restauración | [PENDIENTE: definir periodicidad; recomendación: semestral, con acta remitida a LA ENTIDAD] |

### 8.4 Deber de LA ENTIDAD

Mientras subsista lo declarado en 8.2, **LA ENTIDAD debe conservar sus propios respaldos de la documentación original que cargue**. La plataforma no debe ser, hoy, el único lugar donde exista un documento de obra. Esta advertencia es parte del contrato y no una nota informativa.

---

## 9. Seguridad

Se declara únicamente lo comprobado.

### 9.1 Lo que existe

- **Contraseñas**: se almacenan derivadas con `scrypt` (parámetros 32768:8:1), con sal distinta por usuario. No existen contraseñas en claro en la base de datos.
- **Sesiones**: identificador de 256 bits. **En la base no se guarda el identificador de sesión, sino su huella criptográfica** calculada con una clave que vive fuera de la base. Un volcado de la base no permite suplantar sesiones. Caducidad: 7 días. Una revocación surte efecto en 15 segundos como máximo.
- **Cifrado en tránsito**: los portales y la interfaz de programación se sirven por HTTPS. La conexión entre el backend y la base de datos se comprobó cifrada con TLS 1.3 (TLS_AES_256_GCM_SHA384, 256 bits).
- **Cifrado en reposo**: el cifrado por defecto del proveedor de nube, con claves gestionadas por el proveedor.
- **El almacenamiento no es público**: comprobado con peticiones anónimas, que reciben error de autorización. Los ficheros se entregan mediante enlaces firmados con caducidad máxima de 24 horas.
- **Registro de actividad**: 1,034 asientos desde el 22-mar-2026 (subidas, creación de carpetas, borrados, renombrados, movimientos, restauraciones, revisiones y transmittals) y registro de eventos de inicio de sesión con correo, dirección IP y navegador.
- **Control de acceso por carpeta**: seis niveles (restringido, ver, ver y descargar, ver/descargar/marcar, editar y subir, administrar) con herencia de la carpeta padre. Un usuario ordinario parte sin acceso a documentos hasta que se le concede permiso explícito. **El mecanismo está implementado y es correcto, pero en la práctica no se ha ejercido: existe una sola regla registrada y la operación se ha realizado con cuentas de administrador, que lo eluden por diseño. Su comportamiento con usuarios sin privilegios no está probado en producción.**
- **Límite de peticiones** por minuto en la interfaz de programación.

### 9.2 Limitación relevante del registro de descargas

El registro de acceso a documentos anota el momento en que **se entregó el acceso** a un documento. Como el fichero se entrega mediante un enlace firmado y los bytes viajan después directamente desde el almacenamiento, **no puede afirmarse "esta persona completó la descarga", solo "a esta persona se le entregó el acceso a este documento, a esta hora y por esta vía"**. Si LA ENTIDAD necesita evidencia de descarga efectiva para un procedimiento administrativo o legal, esta plataforma no la provee hoy.

### 9.3 Lo que NO existe (declaración expresa)

- No hay segundo factor de autenticación (2FA/MFA).
- No hay cifrado de extremo a extremo, ni cifrado por campo, ni claves de cifrado gestionadas por el cliente.
- No hay análisis antivirus ni antimalware sobre los ficheros que se suben.
- No hay prueba de penetración ni auditoría de seguridad externa.
- **No hay ninguna certificación: ni ISO 27001, ni ISO 9001, ni SOC 2, ni ninguna otra, ni proceso de certificación iniciado.**
- No hay separación de funciones: una sola persona administra la aplicación, la base de datos, la nube, el repositorio y la cuenta del proveedor de ejecución. No hay control de doble aprobación para acciones destructivas.
- El límite de peticiones se contabiliza por proceso, no de forma central; con cuatro procesos en producción el límite efectivo contra ataques de fuerza bruta se multiplica por cuatro.
- La conexión a la base de datos negocia cifrado pero no lo exige, y la base tiene dirección IP pública. [PENDIENTE: fijar el modo de cifrado obligatorio y revisar las redes autorizadas]
- **La separación entre obras no se aplica hoy de forma transversal.** El control transversal de separación entre obras está en modo registro: anota a quién bloquearía y deja pasar. Los módulos documentales (documentos, subidas, transmittals, revisiones, sets, atributos) aplican además su propia comprobación de pertenencia a la obra, que sí bloquea. **No la aplican** los módulos de RFI, redlines, pines de campo, vistas guardadas, inventario 3D y obra civil: en ellos, hoy, una sesión válida alcanza datos de obras a las que el usuario no está asignado. Debe activarse el control transversal antes de atender a más de una entidad. (Ver sección 14.)
- La política de acceso "denegar por defecto" está en modo sombra: evalúa y anota, pero decide la lógica anterior.
- No hay retención definida ni centralización de registros. Los registros viven en la misma base que los datos, el de actividad cubre desde el 22-mar-2026 y el de accesos desde el 07-ago-2026.
- No hay política documentada de retención ni de eliminación de datos, ni procedimiento documentado de alta y baja de usuarios, ni política de contraseñas escrita.
- Las credenciales de Autodesk son recuperables del historial del repositorio de código desde el primer commit. [PENDIENTE: confirmar si el repositorio es privado y rotar esas credenciales antes de presentar el servicio a una entidad]

---

## 10. Incidentes de seguridad y notificación

### 10.1 Definición

Se considera incidente de seguridad todo acceso no autorizado, divulgación, alteración, pérdida o destrucción no autorizada de Información de LA ENTIDAD, así como todo intento fundado de lograrlo.

### 10.2 Plazo de notificación

**EL PROVEEDOR notificará a LA ENTIDAD todo incidente de seguridad que afecte o pueda afectar a su información dentro de las 24 horas siguientes a haber tomado conocimiento del hecho**, por el canal de la sección 7 y por escrito al correo institucional que LA ENTIDAD designe.

[PENDIENTE: verificar con abogado peruano el plazo legal de notificación a la Autoridad Nacional de Protección de Datos Personales y a los titulares afectados conforme a la Ley N.º 29733 y su reglamento vigente, y ajustar este plazo contractual para que nunca sea posterior al legal.]

### 10.3 Contenido de la notificación

- Fecha y hora de ocurrencia (o del periodo estimado) y de detección.
- Descripción de lo ocurrido y cómo se detectó.
- Categorías y volumen aproximado de información y de personas afectadas.
- Medidas de contención ya adoptadas.
- Medidas correctivas previstas y plazo.
- Persona de contacto de EL PROVEEDOR para el seguimiento.

Si al momento de notificar no se cuenta con toda la información, se notifica igualmente con lo que se tiene y se completa en entregas sucesivas. **No se admite retrasar la notificación para investigar primero.**

### 10.4 Informe final

EL PROVEEDOR remitirá un informe final dentro de los [PENDIENTE: definir; recomendación: 15] días hábiles del cierre del incidente, con la causa raíz y las medidas adoptadas para que no se repita.

### 10.5 Colaboración con LA ENTIDAD

EL PROVEEDOR colaborará con LA ENTIDAD en las comunicaciones que esta deba cursar a la autoridad de protección de datos, a los titulares afectados o a los órganos de control, y le entregará la evidencia técnica en su poder.

### 10.6 Antecedente que se declara por transparencia

El 07-ago-2026 se produjo un incidente en la plataforma: una persona con sesión válida archivó una obra completa.

**La causa técnica fue que la comprobación de rol de administrador era puramente declarativa mientras la política de acceso estaba en modo no bloqueante, de modo que cualquier sesión válida podía crear, renombrar y archivar obras sin ser administrador; y la auditoría de entonces solo registraba entradas y salidas, no cambios sobre obras.** Ambas cosas se corrigieron el mismo día (commit `0891e78`), con comprobaciones efectivas dentro de cada vista y registro de la acción; comprobado el 12-ago-2026, ninguna comprobación de rol queda hoy en modo declarativo. Lo que sigue sin bloquear es el control transversal de separación entre obras (sección 9.3).

**Los datos estaban intactos y fueron restaurados, se revocaron 62 sesiones y se rotaron los códigos de acceso. El incidente se cerró sin poder determinar quién lo hizo**, porque el registro de accesos con dirección IP y navegador comenzó precisamente ese día y no existía traza anterior. De ese incidente surgió el trabajo de auditoría que sustenta este expediente.

[PENDIENTE: la revocación alcanzó a 62 sesiones existentes ese día, pero la tabla de sesiones registra hoy 27 filas (26 activas). Antes de entregar el documento debe explicarse por qué el recuento actual no refleja aquellas 62 revocaciones.]

### 10.7 Limitación de la capacidad forense

**No hay procedimiento documentado de respuesta a incidentes.** El registro de accesos existe solo desde el 07-ago-2026 y no está centralizado ni replicado fuera de la base de datos que registra. Ante un incidente que comprometa la base, la evidencia podría comprometerse con ella. [PENDIENTE: documentar el procedimiento de respuesta y enviar los registros a un destino externo e inmutable antes de la puesta en producción]

---

## 11. Subencargados y ubicación de la información

### 11.1 Declaración de ubicación

> **Ningún dato de LA ENTIDAD reside en el Perú.** Toda la información se aloja y se procesa en el extranjero, principalmente en Estados Unidos. Existe transferencia internacional de datos hacia, al menos, tres proveedores distintos, y en el caso del servicio de búsqueda documental, hacia una ubicación declarada como "global", lo que significa que el proveedor puede servirla desde cualquiera de sus regiones.

Si el marco normativo aplicable a LA ENTIDAD exige que determinada información permanezca en territorio nacional, **este servicio no puede cumplirlo hoy**. [PENDIENTE: LA ENTIDAD debe verificar si le aplica alguna exigencia de localización o de clasificación de la información —por ejemplo, información reservada o secreta— antes de contratar.]

### 11.2 Relación de subencargados autorizados

| Subencargado | Servicio prestado | Qué información trata | Ubicación |
|---|---|---|---|
| Google LLC | Base de datos gestionada | Todo el modelo de datos: usuarios, sesiones, registros de actividad y de acceso, fichas de documentos, nombres de personas en campos de texto | Estados Unidos (Virginia del Norte) |
| Google LLC | Almacenamiento de objetos | Los bytes de todo: planos, fotografías, modelos RVT y DWG | [PENDIENTE: no se pudo leer la región del almacenamiento por falta de permisos de la cuenta de servicio. Debe confirmarse en la consola del proveedor antes de firmar.] |
| Google LLC | Modelo de inteligencia artificial (asistente documental) | **El contenido de los documentos.** Al usar el asistente, el backend descarga el PDF, lo convierte a texto (hasta 60,000 caracteres) o a imágenes por página (hasta 12 páginas) y lo envía al servicio para su análisis. **En un caso de excepción —documento que el sistema no logra preparar— se envía el fichero PDF completo, sin tope.** | Estados Unidos (Iowa) |
| Google LLC | Búsqueda documental | Índice de búsqueda sobre los documentos | **"Global"** |
| Google LLC | Inicio de sesión con Google | El correo electrónico del usuario que inicia sesión | [PENDIENTE: región] |
| Render, Inc. | Ejecución del backend y de los portales web | **Ve todo el tráfico en claro dentro del servidor**: la contraseña en el momento del inicio de sesión, el contenido de los documentos que pasan por el servidor y las peticiones completas. Custodia además las claves de firma y de sesión | Estados Unidos (Oregón) |
| Autodesk, Inc. | Visor 3D y traducción de modelos | **Una copia permanente de los modelos 3D y CAD.** Se suben con política de conservación permanente y se traducen en la región de Estados Unidos | Estados Unidos |
| Resend | Correo transaccional (recuperación de contraseña, invitaciones) | Nombre y dirección de correo del destinatario, y el cuerpo del mensaje | [PENDIENTE: confirmar región del proveedor] |
| GitHub (Microsoft) | Custodia del código fuente | El código de la plataforma. No contiene información de LA ENTIDAD | [PENDIENTE: región] |

### 11.3 Advertencias sobre los subencargados

1. **El contenido de los documentos sale hacia el servicio de inteligencia artificial cada vez que se usa el asistente documental.** Si LA ENTIDAD no acepta ese tratamiento, debe solicitarlo expresamente y EL PROVEEDOR deberá deshabilitar el módulo. [PENDIENTE: definir si el módulo se entrega activado o desactivado por defecto; recomendación: desactivado, y activarlo solo por pedido escrito de LA ENTIDAD]
2. **Los modelos 3D quedan alojados de forma permanente en infraestructura de Autodesk**, con una política de conservación que no caduca sola. Su eliminación exige una acción expresa (ver 12.5).
3. **El correo sale desde un remitente compartido de pruebas del proveedor de correo, no desde un dominio propio.** Esto implica que los correos de invitación y de recuperación de contraseña llegan desde una dirección que no identifica al proveedor ni a LA ENTIDAD, y tienen mayor probabilidad de ser marcados como no deseados. [PENDIENTE: contratar un dominio de correo propio antes de la puesta en producción]
4. **Si falta la clave del servicio de correo, el sistema no se detiene: escribe el enlace en el registro para envío manual.** Eso significa que enlaces de recuperación de contraseña pueden quedar escritos en los registros del proveedor de ejecución. [PENDIENTE: corregir este comportamiento]
5. **La cuenta de nube presenta rasgos de cuenta personal y no de organización corporativa** (nombre del proyecto y del almacenamiento). Ya hubo una interrupción del almacenamiento por facturación en mora. [PENDIENTE: confirmar la titularidad de la cuenta de facturación y migrar a una organización de nube a nombre de la razón social antes de contratar con una entidad]

### 11.4 Situación contractual con los subencargados

**[PENDIENTE — y es el punto que el área legal de LA ENTIDAD revisará primero:] no consta ningún contrato de encargo de tratamiento ni acuerdo de protección de datos firmado con Google, Render, Autodesk ni Resend, pese a que los cuatro tratan información. Tampoco constan cláusulas de transferencia internacional, ni un registro de actividades de tratamiento, ni evaluación de impacto, ni designación de un responsable de protección de datos.**

### 11.5 Cambio de subencargados

EL PROVEEDOR comunicará a LA ENTIDAD, con [PENDIENTE: definir; recomendación: 30 días] de anticipación, la incorporación o sustitución de cualquier subencargado. LA ENTIDAD podrá oponerse por motivos fundados; si la oposición hace inviable la prestación, cualquiera de las partes podrá resolver el contrato sin penalidad, con devolución de la información conforme a la sección 12.

---

## 12. Salida del contrato: devolución y borrado

Esta es la sección que protege a LA ENTIDAD si la relación termina, sea por vencimiento, por resolución, por mutuo acuerdo o porque EL PROVEEDOR cesa en su actividad.

### 12.1 Principio

**Al terminar el contrato, por cualquier causa, LA ENTIDAD recupera toda su información y EL PROVEEDOR la elimina de todos los lugares donde la haya alojado.** Sin condiciones, sin retención por deudas y sin coste adicional por la devolución ordinaria.

### 12.2 Periodo de transición

Desde la comunicación de terminación, se abre un periodo de transición de [PENDIENTE: definir; recomendación: 30 días calendario] durante el cual:

- El servicio se mantiene operativo. [PENDIENTE: la plataforma no dispone hoy de un modo de solo lectura —no existe esa función en el sistema y el rol de administrador elude las comprobaciones de permiso, de modo que tampoco puede emularse bajando permisos de carpeta—; si LA ENTIDAD lo exige durante la transición, debe construirse y declararse como requisito previo de la sección 14.]
- EL PROVEEDOR prepara y entrega la devolución conforme a 12.3.
- No se ejecuta ningún borrado.

### 12.3 Qué se devuelve, en qué formato y en qué plazo

| Componente | Formato de devolución | Estado hoy |
|---|---|---|
| **Ficheros** (planos PDF, fotografías, modelos RVT y DWG) | Los ficheros originales, **con sus nombres originales y respetando la estructura de carpetas** | **Existe.** La plataforma cuenta con una función que recorre el árbol de una carpeta y devuelve la ruta relativa de cada fichero junto con un enlace de descarga (`/api/docs/download_folder_urls`, en `backend/routes/documents.py`). Sobre esa base puede armarse la entrega. |
| **Metadatos y registros** (ficha de cada documento, versiones, estados, permisos, RFI, redlines, revisiones, transmittals, reportes diarios, registro de actividad) | CSV o Excel, una tabla por entidad de información, más un índice que enlace cada fichero entregado con su ficha | **NO existe.** Hoy la única extracción disponible es una copia técnica de **toda** la base de datos, de todos los clientes a la vez, que no se puede entregar a una entidad. [PENDIENTE: construir el exportador por entidad antes de firmar. Sin él, esta cláusula no se puede cumplir.] |
| **Modelos 3D** | El fichero original RVT o DWG, tal como se cargó | **Existe** (el original está en el almacenamiento). **Advertencia:** no se devuelve la traducción que genera Autodesk para el visor, por ser un formato propietario que no es exportable. El modelo se devuelve, la experiencia de visor no. |
| **Estructura de carpetas y permisos** | Listado en CSV o Excel de carpetas, niveles de permiso y usuarios asignados | [PENDIENTE: forma parte del exportador por construir] |
| **Medio de entrega** | [PENDIENTE: definir; opciones: descarga directa desde la plataforma, copia a un almacenamiento en la nube que indique LA ENTIDAD, o disco físico entregado con acta. Definir también quién asume el costo de transferencia de datos, que para 6.39 GB es menor, pero crece con el uso] | |

**Plazo de entrega:** [PENDIENTE: definir; recomendación: 15 días hábiles desde la solicitud para la primera entrega completa, y 5 días hábiles para una reentrega por defecto detectado.]

**Verificación:** la entrega se documenta con un acta firmada por ambas partes que incluya el recuento de ficheros entregados, el volumen total y la suma de verificación de la entrega. LA ENTIDAD dispone de [PENDIENTE: definir; recomendación: 15 días hábiles] para observar la entrega.

### 12.4 Advertencia sobre el riesgo de la devolución

**Mientras no exista copia de seguridad de los ficheros (sección 8.2.1), la devolución depende de que el almacenamiento esté disponible en ese momento.** Si el almacenamiento se perdiera antes de la devolución, no habría de dónde reconstruirla: solo se conservaría el índice de documentos inexistentes. Esta es la razón principal por la que la copia de ficheros es un requisito previo y no una mejora futura.

### 12.5 Qué se borra, dónde y cuándo

Transcurrido el plazo de verificación de 12.3 sin observaciones, o resueltas estas, EL PROVEEDOR eliminará la Información de LA ENTIDAD dentro de [PENDIENTE: definir; recomendación: 30 días calendario] de los siguientes lugares, **todos los cuales deben nombrarse porque la información vive en todos ellos**:

1. La base de datos de producción (fichas de documentos, usuarios, permisos, registros de actividad y de acceso).
2. El almacenamiento de objetos: ficheros originales, **miniaturas generadas** y versiones históricas. Debe advertirse que el almacenamiento contiene objetos huérfanos no referenciados por la base; el borrado debe hacerse por inventario del almacenamiento, no solo por lo que la base declara.
3. **El almacenamiento de Autodesk**, donde los modelos quedan con política de conservación permanente, junto con sus traducciones. **Verificado: la plataforma no implementa hoy ninguna función de eliminación de objetos en Autodesk.** [PENDIENTE: implementar el borrado en Autodesk, o documentar el procedimiento manual por consola, antes de firmar. Sin esto, no se puede afirmar que la información se elimina en su totalidad.]
4. El índice del servicio de búsqueda documental. **Verificado: la plataforma no implementa hoy ninguna función de purga de ese índice.** [PENDIENTE: comprobar cómo se alimenta el índice y si la eliminación del objeto en el almacenamiento lo depura, o si requiere acción manual en consola.]
5. Las copias de seguridad, conforme al ciclo de retención pactado en 8.3. Debe explicitarse que una copia no se borra de inmediato: se borra al vencer su retención. [PENDIENTE: declarar aquí el plazo máximo real de permanencia en copias]
6. Los registros del proveedor de ejecución, sujetos a la retención propia de ese proveedor, que EL PROVEEDOR no controla. [PENDIENTE: consultar y declarar esa retención]
7. Cualquier copia local en equipos de EL PROVEEDOR.

### 12.6 Constancia de eliminación

EL PROVEEDOR entregará a LA ENTIDAD una constancia escrita y firmada de eliminación, indicando fecha, lugares alcanzados, recuentos antes y después, y las excepciones legales si las hubiera.

**Declaración honesta: no existe hoy un proceso de destrucción certificada por un tercero independiente.** Lo que puede ofrecerse es la constancia firmada por EL PROVEEDOR con la evidencia técnica de los recuentos. [PENDIENTE: definir si LA ENTIDAD acepta ese nivel de constancia o exige certificación de un tercero, en cuyo caso debe presupuestarse]

### 12.7 Excepciones al borrado

Únicamente se conservará la información cuya conservación imponga una norma legal o un requerimiento de autoridad competente, por el plazo estrictamente exigido, informando de ello a LA ENTIDAD. Fuera de ese supuesto, no hay conservación.

### 12.8 Cese de actividad de EL PROVEEDOR

Si EL PROVEEDOR cesa en su actividad, se declara en insolvencia o queda impedido de prestar el servicio, se activa de inmediato el procedimiento de la sección 12 con carácter prioritario. [PENDIENTE: evaluar con abogado un mecanismo de resguardo —depósito de credenciales ante notario o tercero de confianza, con instrucciones de entrega a LA ENTIDAD— dado que hoy toda la administración depende de una sola persona. Sin ese mecanismo, el fallecimiento o incapacidad del titular dejaría a LA ENTIDAD sin acceso ni a la información ni a quien pueda entregarla. Es un riesgo real en una operación de una sola persona y el área legal de la entidad lo detectará.]

---

## 13. Visor 3D y licencia de Autodesk

Esta cláusula se incluye porque la dependencia es real y omitirla sería ocultar un riesgo previsible.

13.1 La visualización de modelos 3D y de planos CAD en el navegador **no es tecnología propia de EL PROVEEDOR**: se presta mediante los servicios de Autodesk Platform Services, bajo condiciones de licencia que, **según manifestación del proveedor**, se renuevan anualmente. [PENDIENTE: verificar contra el contrato vigente la modalidad exacta de licenciamiento, su fecha de vencimiento y sus condiciones de renovación.]

13.2 **Qué ocurre si la licencia no se renueva o Autodesk modifica sus condiciones:**

- **Se pierde**: la visualización de modelos 3D y de planos CAD en el navegador, la navegación por el modelo, la vinculación de elementos del modelo con documentos y las funciones que dependen del visor.
- **No se pierde**: los ficheros originales RVT y DWG, que están en el almacenamiento y se devuelven íntegros; los documentos PDF, las fotografías y toda la gestión documental, los permisos, las revisiones, los RFI y los transmittals, que **no** dependen de Autodesk y siguen funcionando.

13.3 **Obligación de aviso.** EL PROVEEDOR comunicará a LA ENTIDAD, con al menos [PENDIENTE: definir; recomendación: 60 días] de anticipación al vencimiento, si la licencia será renovada o no. Si no lo será, LA ENTIDAD podrá:

  a) Continuar con el servicio sin el módulo de visor, con la reducción proporcional de la contraprestación que corresponda. [PENDIENTE: definir el porcentaje del precio atribuible al visor, para que esta cláusula sea aplicable]
  b) Resolver el contrato sin penalidad, con devolución de la información conforme a la sección 12.

13.4 **Traslado de condiciones.** Las condiciones de uso del visor las fija Autodesk y pueden cambiar sin intervención de EL PROVEEDOR. Un cambio de precios, de política de conservación o de disponibilidad regional por parte de Autodesk afecta al servicio y EL PROVEEDOR lo comunicará dentro de los [PENDIENTE: definir; recomendación: 10] días hábiles de conocerlo.

13.5 **Recordatorio de la sección 11.3.2:** los modelos cargados quedan alojados de forma permanente en infraestructura de Autodesk. La terminación de la licencia **no** implica automáticamente su borrado; este debe ejecutarse conforme a 12.5.3.

---

## 14. Requisitos previos a la puesta en producción

Las secciones anteriores contienen compromisos que hoy **no pueden cumplirse** con el estado actual de la plataforma. Se listan aquí de forma expresa para que ninguna de las dos partes firme una obligación imposible. **Hasta que cada punto esté subsanado y verificado, la cláusula que depende de él queda suspendida y así debe constar.**

| # | Requisito | Cláusula que depende |
|---|---|---|
| 1 | Activar la separación efectiva entre obras, de modo que un usuario de una entidad no pueda acceder a datos de otra | 9.3, y es condición para prestar el servicio a más de una entidad |
| 2 | Poner la política de acceso en modo estricto (denegar por defecto), no en modo sombra | 9.3 |
| 3 | Implementar copia de seguridad automática de los ficheros, en proveedor o cuenta distintos de los de producción | 8.3, 12.4 |
| 4 | Implementar copia automática y programada de la base de datos, con retención declarada y prueba periódica | 8.3 |
| 5 | Verificar y declarar las copias automáticas y la recuperación a un punto en el tiempo del proveedor de base de datos | 8.2.4 |
| 6 | Implementar monitoreo externo y alertas de disponibilidad | 5.1, 5.3 |
| 7 | Construir el exportador de información por entidad (metadatos en CSV o Excel + índice) | 12.3 |
| 8 | Implementar o documentar la eliminación de los modelos alojados en Autodesk | 12.5.3 |
| 9 | Rotar las credenciales de Autodesk expuestas en el historial del repositorio y confirmar que el repositorio es privado | 9.3 |
| 10 | Suscribir los acuerdos de tratamiento de datos con Google, Render, Autodesk y Resend | 11.4 |
| 11 | Migrar a una cuenta de nube a nombre de la razón social, con facturación empresarial | 11.3.5 |
| 12 | Contratar un dominio de correo propio para los correos del sistema | 11.3.3 |
| 13 | Habilitar un entorno de pruebas separado de producción | 6.5 |
| 14 | Documentar los procedimientos de alta y baja de usuarios, respuesta a incidentes y política de contraseñas | 9.3, 10.7 |
| 15 | Definir un plan de contingencia de personal y un mecanismo de resguardo de credenciales | 7.3, 12.8 |
| 16 | Publicar política de privacidad y términos de servicio | [PENDIENTE: solo el propietario puede aportarlos] |

[PENDIENTE: acordar con LA ENTIDAD el plazo de subsanación de cada punto y si alguno es condición suspensiva de la firma o del inicio de la prestación.]

---

## 15. Declaraciones y limitaciones generales

15.1 EL PROVEEDOR declara que la plataforma se entrega **en el estado en que se encuentra**, descrito con detalle en este documento y en los que lo acompañan, y que no ha omitido ninguna limitación conocida al momento de su redacción.

15.2 EL PROVEEDOR **no garantiza** que el servicio esté libre de errores, ni que sea apto para fines distintos de los descritos en la sección 1, ni el cumplimiento de exigencias normativas específicas de LA ENTIDAD que no hayan sido declaradas por escrito antes de la firma.

15.3 **Limitación de responsabilidad.** [PENDIENTE: definir el tope de responsabilidad; recomendación: limitarla al monto de la contraprestación de los últimos 12 meses, con exclusión expresa del dolo y la culpa inexcusable, que no admiten limitación. Debe verificarse con abogado si el régimen de contratación pública aplicable admite esta limitación; en contratación estatal frecuentemente no se admite y la cláusula podría ser inaplicable.]

15.4 **Seguros.** [PENDIENTE: definir si se contrata póliza de responsabilidad civil o de ciberseguridad y su cobertura. Hoy no consta ninguna.]

15.5 **Cesión.** Ninguna de las partes podrá ceder su posición contractual sin autorización escrita de la otra.

---

## 16. Vigencia, terminación y ley aplicable

16.1 **Vigencia**: [PENDIENTE: definir plazo y régimen de renovación].

16.2 **Terminación por LA ENTIDAD sin causa**: con aviso previo de [PENDIENTE: definir; recomendación: 30 días], sin penalidad, activándose la sección 12.

16.3 **Terminación por incumplimiento**: cualquiera de las partes podrá resolver el contrato si la otra incumple una obligación esencial y no la subsana dentro de [PENDIENTE: definir; recomendación: 15 días hábiles] de requerida por escrito.

16.4 **Ley aplicable y solución de controversias**: [PENDIENTE: definir; debe ajustarse al régimen de contratación pública aplicable a LA ENTIDAD, que puede imponer una vía obligatoria de solución de controversias].

16.5 **Marco normativo de protección de datos**: el tratamiento de datos personales se sujeta a la Ley N.º 29733, Ley de Protección de Datos Personales, y su reglamento. [PENDIENTE: verificar con abogado peruano cuál es el reglamento vigente y exigible a la fecha de firma, las obligaciones concretas de transferencia internacional aplicables a este caso —donde ningún dato reside en el Perú— y si corresponde inscribir bancos de datos ante la autoridad.]

16.6 **Régimen de contratación**: [PENDIENTE: identificar la modalidad de contratación por la que LA ENTIDAD contrataría este servicio y verificar qué cláusulas de este documento quedan desplazadas por cláusulas obligatorias del régimen estatal.]

---

## Anexo A — Alcance funcional comprometido

Relación tomada del inventario funcional verificado el 12-ago-2026 (documento 01, sección 2). **Solo se compromete lo aquí listado**, con los límites que se indican en cada fila y en las notas finales de este anexo.

**Nota sobre obras y frentes (idéntica en los cuatro documentos de este expediente):** una obra puede organizarse en varios ámbitos de trabajo o *frentes*, y por eso el recuento por ámbito y el recuento por obra no coinciden. `1_CANAL` y `1_DRENAJE` son **frentes de la obra PQT8_TALARA (obra `1`)**, no obras distintas ni proyectos de prueba: comprobado el 12-ago-2026 contra la base de producción con `db.resolve_project_id()`, donde `proyectos/PQT8_TALARA`, `1_CANAL` y `1_DRENAJE` resuelven los tres a la obra `1`. Entre los dos frentes suman **284 ficheros y 241 MB de contenido real de esa obra**.

| # | Módulo | Qué hace | Límites y estado verificado |
|---|---|---|---|
| A.1 | Gestión documental por carpetas | Cargar, organizar en carpetas, renombrar, mover, eliminar (lógico) y restaurar desde papelera | En uso real: 2,824 ficheros y 196 carpetas vivas |
| A.2 | Versionado de documentos | Conservar versiones sucesivas de un mismo documento | En uso: 2,830 versiones; la revisión más alta alcanzada es la 2. No hay flujo de aprobación formal de versiones |
| A.3 | Permisos por carpeta | Seis niveles con herencia estricta de la carpeta padre | Implementado y correcto, pero **no ejercido en producción**: una sola regla registrada y operación con cuentas de administrador, que lo eluden por diseño (ver 9.1) |
| A.4 | Registro de actividad documental | Anota acción, documento, autor (en texto libre) y fecha | 1,034 asientos desde el 22-mar-2026. El registro de acceso a documentos no acredita descarga efectiva (ver 9.2) |
| A.5 | Visor de PDF y de planos con marcas (redlines) | Ver documentos y anotar sobre ellos | En uso: 33 redlines |
| A.6 | Consultas técnicas (RFI) | Registrar y seguir consultas técnicas | En uso: 25 RFI |
| A.7 | Revisiones, transmittals y sets documentales | Circuito de revisión y envío formal de documentación | Uso mínimo verificado: 1 revisión y 1 transmittal |
| A.8 | Reporte diario de obra | Registrar el parte diario | Uso mínimo: 1 reporte |
| A.9 | Fotografía de campo y multimedia | Cargar y consultar fotografías de obra | En uso intensivo: 2,756 imágenes (1,028 MB). No hay difuminado de rostros ni búsqueda por persona; la localización de una fotografía concreta es manual |
| A.10 | Pines de seguimiento georreferenciados | Marcar puntos de seguimiento sobre el modelo | En uso: 34 pines |
| A.11 | Visor 3D de modelos Revit/CAD | Visualizar RVT y DWG en el navegador mediante Autodesk Platform Services | Depende de un tercero: ver sección 13. No se devuelve la traducción propietaria del visor |
| A.12 | Inventario de elementos del modelo 3D | Consultar los elementos y sus propiedades | En uso: 20,116 elementos |
| A.13 | Asistente documental con inteligencia artificial | Responder consultas sobre un documento cargado | **El contenido del documento sale hacia un tercero** (ver 11.2 y 11.3.1). Límites por documento: 60,000 caracteres de texto o 12 páginas convertidas a imagen; **en el caso de excepción se envía el PDF completo, sin tope** |
| A.14 | Buscador documental sobre índice de IA | Buscar dentro del contenido de los documentos | El índice se aloja en una ubicación declarada como "global" y **no existe hoy función de purga del índice** (ver 12.5.4) |
| A.15 | Compartir documentos con terceros externos | Entregar un documento a un correo externo | Implementado; **0 usos registrados a la fecha**, por lo que su comportamiento no está probado en operación |
| A.16 | Descarga de carpeta completa | Recorre el árbol y entrega cada fichero por enlace firmado, conservando estructura y nombres | Es la base de la devolución de la sección 12.3. No hay empaquetado en el servidor ni entrega en medio físico |

**Límites transversales que forman parte del alcance comprometido:**

1. **Tamaño máximo por fichero en una subida: 2 GB** (`MAX_CONTENT_LENGTH`, verificado en `backend/server.py`).
2. **Límite de peticiones: 200 por minuto**, contabilizado **por proceso** y no de forma central (ver 9.3).
3. **Los enlaces de descarga son firmados y caducan como máximo a las 24 horas.**
4. **Sesiones de 7 días sin cierre por inactividad.**
5. **Formatos:** la plataforma admite cualquier fichero dentro del límite de tamaño; la visualización en el navegador está comprometida para PDF, imágenes JPEG/PNG y los formatos RVT y DWG a través del visor 3D.

**No forma parte del alcance comprometido** ninguna función no listada arriba, ni las expresamente excluidas en 1.3 (firma digital, sello de tiempo, integraciones con sistemas de LA ENTIDAD, antivirus, entre otras), ni las capacidades cuya inexistencia se declara en 8.2, 9.3 y 12.3.

## Anexo B — Datos personales tratados

[PENDIENTE: adjuntar el detalle de categorías de datos personales, finalidad, base legal y plazo de conservación. Debe partir del inventario verificado, que a la fecha registra 5 titulares de cuenta con nombre y correo, más nombres de personas en campos de texto libre de datos de obra, y direcciones IP y navegador en los registros de acceso.]

## Anexo C — Contactos y escalamiento

[PENDIENTE: nombres, cargos, correos y teléfonos de ambas partes.]

## Anexo D — Acuerdo de nivel de servicio, valores definitivos

[PENDIENTE: consolidar aquí, ya sin huecos, los valores decididos de disponibilidad, tiempos de respuesta, RPO, RTO y ventanas de mantenimiento, una vez cubiertos los requisitos de la sección 14.]

---

## 17. Nota al propietario (no forma parte del contrato — retirar antes de entregar)

**Esto es un borrador de trabajo. Necesita la revisión de un abogado peruano antes de firmarse con nadie.**

Tres motivos concretos, no una fórmula de cortesía:

1. **Contratación pública.** Al contratar con una entidad del Estado, el régimen aplicable puede imponer cláusulas obligatorias de penalidades, garantías, responsabilidad y solución de controversias que **desplazan** lo que aquí se pacte. Varias cláusulas de este borrador —limitación de responsabilidad, penalidades, ley aplicable— podrían ser inaplicables tal como están redactadas.
2. **Protección de datos.** No hay ningún acuerdo de tratamiento firmado con Google, Render, Autodesk ni Resend, y ningún dato reside en el Perú. Un abogado debe determinar qué exige exactamente la normativa peruana para esa transferencia internacional y qué documentación hay que tener antes de recibir el primer documento de una entidad.
3. **Cláusulas que hoy no se pueden cumplir.** La sección 14 lista dieciséis puntos. Los más críticos, si se firma sin subsanarlos: el control transversal de separación entre obras no bloquea —los módulos documentales sí comprueban la pertenencia a la obra, pero RFI, redlines, pines de campo, vistas guardadas, inventario 3D y obra civil no, de modo que una entidad podría alcanzar parte de los datos de otra—, los ficheros no tienen copia de seguridad (una pérdida sería irreversible), y no existe la función que exporta la información de una sola entidad (la cláusula de salida no se podría cumplir el día que la pidan).

No entregar este documento a una entidad con las marcas [PENDIENTE] visibles sin acompañarlo de un cronograma de subsanación. Un área legal que vea dieciséis pendientes sin plazo asociado cierra el expediente. La misma lista con fechas y responsable se lee como un proveedor que sabe dónde está parado.

---

*Fin del documento. Versión 1.0 - borrador.*
