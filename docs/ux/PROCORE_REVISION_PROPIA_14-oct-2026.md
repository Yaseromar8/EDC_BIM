# Procore · revisión propia, completa (14-oct-2026, noche)

> El propietario: «¿revisaste bien la página de Procore? … revisa tú».
>
> Complementa `PROCORE_VS_ALEPHIA_NUCLEO_DOCUMENTAL.md` (§1–§8). Aquella revisión la hizo otra sesión mirando
> fotogramas de unos 60 vídeos. Esta la hice yo leyendo lo que Procore publica por escrito.
>
> Criterio de siempre: el estándar se usa; lo que es de Procore (marca, textos, iconos) no se toma. No es asesoría
> legal.

## 1 · Método, y por qué así

- **Videoteca en español: 121 vídeos.** Los conté en el catálogo de la propia página
  (`v2.support.procore.com/es-es/video-library/`). Ninguno trae subtítulos: los consulté uno a uno en Wistia,
  0 de 121. Son demostraciones en pantalla sin texto que leer.
- **Primero leí los manuales escritos** (`/es-es/product-manuals/`, 168 manuales), porque la ventana del navegador
  estaba detrás de otra y no dibujaba capturas.
- **Después vi los vídeos.** El propietario: «no veo que hayas revisado algún vídeo».
  - Cada vídeo se colocó en varios momentos en el reproductor de Procore (Wistia) y se miró la pantalla, sin
    descargar nada.
  - Son **90 vídeos**, todos menos los de finanzas, y unos 200 fotogramas. Los del núcleo documental (gestión
    documental, documentos, planos, especificaciones, RFI, submittals y correspondencia) se vieron en 3 a 7
    momentos; el resto, en 1 o 2.
  - Las notas, vídeo por vídeo, están en `PROCORE_VIDEOS_NOTAS_14-oct-2026.md`. Lo que solo se vio en los vídeos
    está en §7.
  - Recorrí la lista de tutoriales de **35 herramientas**: unos **1.100 títulos**.
  - Leí **enteros** los artículos que deciden algo para ALEPHIA: vistas guardadas, colecciones, paquetes, grupos
    de permisos, requisitos de carga, marcadores de posición, registro de comentarios, elementos conectados,
    flujos, QR, archivo del proyecto, elementos abiertos, planos obsoletos y enlazado automático de láminas.
- Las finanzas (presupuesto, contratos, facturación, costes) se dejaron fuera, como la vez anterior.

## 2 · Lo que cambia respecto a lo que creíamos

1. **Procore ya dice cumplir ISO 19650.** Su herramienta *Document Management* (hoy solo en Reino Unido, Irlanda,
   Australia y Nueva Zelanda) se presenta con:
   - gestión de la información según ISO 19650;
   - metadatos capturados por aprendizaje automático;
   - **permisos por metadato**: grupos que ven según el estado, el tipo o la empresa que origina el documento, no
     por carpeta.

   **Consecuencia:** «entendemos ISO 19650» deja de ser lo que nos distingue. Lo que sigue siendo solo nuestro:
   - el registro **sellado** y la huella demostrable;
   - el **plan de entregas vivo** (MIDP/TIDP que se cumple solo);
   - la **norma peruana**: Guía BIM, Ley 32069 y los plazos legales;
   - comprobar un archivo, y el QR que **certifica** (ver el punto 4).
2. **Las vistas guardadas viven dentro de COLECCIONES.**
   - **Colecciones de fábrica:** «En revisión» y «Publicados», que no se pueden borrar. El administrador puede
     crear hasta 10 más.
   - **Vistas de fábrica:** «Todos los publicados», «Planos», «Especificaciones», «Todos en revisión», «Asignados a
     mí», «Asignados a mi empresa» y, al pie, «Todos los documentos».
   - **Dentro de una colección,** cada persona crea vistas que heredan sus filtros. Una vista de proyecto no se
     puede convertir en personal.

   Nuestras vistas (A2-2) acertaron en los niveles y en lo de ISO y el plan. **Les falta la colección por estado
   y la vista «Asignados a mi empresa».**
3. **Requisitos de carga, por tipo de documento.** El administrador fija:
   - la **convención de nombres** obligatoria;
   - los **campos obligatorios por tipo** (nombre, tipo, estado y revisión, siempre);
   - si se admiten identificadores de revisión duplicados.

   Lo que no cumple no se puede «enviar»: se queda en «Cargas» hasta completarse, y se puede completar **en
   bloque**. Es nuestro B2, y confirma que va bien encaminado.
4. **El QR de Procore solo abre.** El de los planos se escanea con la app de Procore y abre la lámina. El del
   visor incluye nombre de proyecto, archivo, versión y grupo de marcas. **Ninguno dice si la hoja impresa sigue
   siendo la vigente.** Nuestro «QR de vigencia» sigue sin equivalente.

## 3 · Lo que hay en Procore y no recogía el informe

Ordenado por herramienta. Al lado, lo que tiene ALEPHIA hoy, en el código local.

| Herramienta | Funciones (de sus tutoriales) | ALEPHIA hoy |
|---|---|---|
| **Gestión documental** | **Paquetes**: contenedores de documentos y marcadores por hito, con dueño, progreso en vivo y revisión secuencial, sin tocar permisos. **Registro de comentarios** en el flujo: agrupa marcas bajo un comentario o incidencia. **Elementos conectados**: fijar RFI, observaciones, inspecciones e issues sobre un punto del plano. Comparar documentos. Mover una revisión a otro documento. Exportar. Historial de cambios. Métricas en la portada | Conjuntos (no son paquetes con progreso); marcas CAD y Red Line; comparar PDF; ficha con trazabilidad (hoy) |
| **Documentos** | **Seguimiento** de archivos y carpetas (avisos de cambios). **Reservar/liberar** (check-in/out). Capas de marcas **privadas y públicas**. Firma con DocuSign. Abrir en Office 365. **Estructura de carpetas estándar** para cada proyecto. Etiquetas | Reserva sí; seguimiento no; plantillas de obra (estructura) parcial |
| **Planos** | **Enlazado automático de láminas por OCR** (las llamadas «ver A-201» se vuelven enlaces). **Buscar texto dentro de los planos.** Marcar **obsoleto** (fuera del juego vigente, consultable). Áreas y juegos de planos. Revisar y confirmar al cargar. Croquis. Informe de mediciones. Ubicaciones generadas desde los planos y **mapa de calor** de elementos | Vigente frente a superado sí; OCR, enlazado y búsqueda de texto no |
| **Especificaciones** | Partir el libro por secciones y revisarlas antes de publicar. **Generador de submittals desde las especificaciones** (también con IA) | Especificaciones sin partir |
| **RFI** | Respuesta oficial. **«Pelota en tu campo»** (quién debe actuar). Prefijo y numeración. Crear desde el RFI una instrucción, un evento de cambio o una correspondencia. Revisar o reabrir un RFI. Informes compartidos. Borrador con IA. Vistas guardadas | Responsable por identidad, plazo y veredicto; faltan respuesta oficial, encadenar y vistas |
| **Submittals** | **Paquetes de submittals** (revisar y distribuir en bloque). **Cálculo del calendario** (fecha requerida en obra → «presentar antes del»). Informe del **tiempo de respuesta de cada aprobador**. Sellos personales. Importar desde plantilla | Submittal con veredicto; sin calendario ni paquetes |
| **Correspondencia** | Conjuntos de campos configurables por tipo. **Estados propios por tipo.** Plantilla de flujo. Enlazar con el origen (RFI o correspondencia). Acciones en bloque. QR por elemento. Firma | Cuaderno de obra y transmittals; no hay tipos de comunicación con plazo |
| **Instrucciones** | Emitir y **reemitir** instrucciones; crearlas desde un RFI; evento de cambio | Instrucción con acuse en el cuaderno |
| **Reuniones** | **Agenda → acta**. **Aprobar o rechazar el acta** como asistente. Reunión de seguimiento que arrastra los puntos abiertos. Asistencia. Tareas | No existe |
| **Registro diario** | Unos 20 tipos de entrada (mano de obra, equipos, demoras, entregas, accidentes, clima, visitas, cantidades, productividad…). Aprobar o rechazar entradas. **Marcar el día como completo** y reabrirlo. Segmentos | Cuaderno: parte, asiento e instrucción (con valor legal) |
| **Inspecciones** | Plantillas con **lógica condicional**, calendario de inspecciones, **firmas**, reinspección, observación desde la inspección | Protocolos |
| **Observaciones** | Tipos, plantillas, **análisis de causa raíz**, separar calidad de seguridad | Issues y punch |
| **Planes de acción** | Planes de calidad con plantillas, métodos de verificación, **registros adjuntos por punto**, firmas por punto y del plan, varios planes por ubicación | Protocolos (parcial) |
| **Coordinación** | **Importar BCF**, elevar a RFI, pasar a observación, complemento para Navisworks | Superposiciones en View |
| **Portada** (*Project Overview*) | Tarjetas configurables, «Mis elementos abiertos» filtrables por tipo y por fecha límite, **crear rápido** un elemento, cronología, notas, enlaces, equipo, clima | Portada por plazos (hoy) |
| **Directorio y permisos** | **Plantillas de permisos** de empresa y de proyecto, con permisos finos e **historial de cambios**. Grupos de distribución. Alta en bloque. Seguros de la empresa. Usuario de prueba | Rol + permisos por carpeta; directorio con empresas y funciones |
| **Flujos** | Plantillas de empresa, flujos lineales, **rol de comentarista**, devolver a un paso anterior, reiniciar o terminar, **sustituir asignados en bloque**, historial exportable | Flujos de revisión con plantillas; faltan comentarista, devolver y sustitución en bloque |
| **Archivo del proyecto** | **Crear archivos del proyecto** con filtros y agrupación por herramienta, y descargarlos completos | Índice del expediente (exportación); no es un archivo de cierre por herramienta |
| **Correos** | Correo del proyecto con etiquetas, privado o público, y crear un cambio desde un correo | No existe |
| **IA** | Asistente de preguntas sobre el proyecto, informes generados, **agentes** con automatizaciones, borradores de RFI | Predict en View; nada en Docs |

## 4 · Lo que ninguno trae (se confirma)

Revisados los 35 manuales, Procore **no** tiene:
- huella de cada versión;
- registro encadenado y verificable;
- comprobar un archivo traído de fuera;
- un QR que diga si la hoja es la vigente;
- plan de entregas que se cumple solo al subir;
- plazos legales calculados (Ley 32069) ni aviso de silencio.

Su «ISO 19650» es de metadatos y de permisos, no de prueba.

## 5 · Cómo queda lo hecho hoy

| Hecho hoy | Frente a Procore |
|---|---|
| Vistas guardadas (A2-2) | Bien en niveles y contenido. **Faltan las colecciones por estado y «Asignados a mi empresa»** |
| Ficha con pestañas | A la par en estructura (Información, Historial, Relacionados). Por delante en integridad y en comprobar un archivo |
| Portada por plazos | A la par en «Mis elementos» y en plazos. Les falta crear rápido y las tarjetas configurables; nos sobra el plan de entregas |

## 6 · Recomendación de orden (revisada)

1. **Carga con requisitos por tipo (B2).** Convención obligatoria, campos obligatorios por tipo, completar en
   bloque y «Cargas» pendientes de enviar. Es el estándar, y lo nuestro es que el nombre ya trae los campos.
2. **Colecciones en las vistas,** más «Asignados a mi empresa». Es un cambio pequeño sobre lo de hoy.
3. **QR de vigencia.** Lo de Procore solo abre la lámina; el nuestro certifica.
4. **Paquetes de entrega por hito,** unidos al plan de entregas: el progreso del paquete es el MIDP cumpliéndose.
5. **Archivo del proyecto,** el expediente de liquidación para la entidad.
6. Después:
   - planos (obsoleto, buscar texto, enlazado por OCR);
   - respuesta oficial y «pelota en tu campo» del RFI;
   - calendario de submittals;
   - reuniones con acta aprobada.
7. **Decisión grande, solo del propietario:** permisos **por metadato** (estado, tipo, empresa) además de por
   carpeta. Procore ya lo hace, pero cambia el modelo de autorización (capa 12 cerrada) y necesita su visto bueno
   expreso.

## 7 · Lo que se ve en los vídeos (y cambia lo que hay que hacer)

Detalles de pantalla que los manuales no cuentan, o que confirman con hechos lo que solo suponíamos.

| # | Visto en el vídeo | Qué significa para ALEPHIA |
|---|---|---|
| 1 | Abrir una vista pone sus filtros como **fichas visibles** («Tipo: PL - Plano ✕», «Disciplina: E - Electricidad ✕») y una miga «Publicados › Planos». En RFI, la vista guarda **también las columnas**: cuáles, su orden, las fijadas y el ancho | Nuestras vistas (A2-2) esconden sus filtros y no guardan columnas. **Mostrar los filtros de la vista como fichas y guardar las columnas** |
| 2 | La decisión del flujo se toma **dentro del visor del plano** (panel con respuesta, adjuntos y motivo) y el estado cambia solo | Confirma C2, «decidir desde el lector», con el diseño exacto |
| 3 | Al cargar planos, el usuario **marca una vez en el cajetín** dónde están el número y el título; Procore los lee en todas las láminas y deja los planos **sin publicar** hasta revisarlos | Confirma C3 con su forma: región marcada una vez, lectura y revisión antes de publicar |
| 4 | Pestaña **«Cargas»**: rejilla donde se completan los campos, errores en rojo por celda, columna «Acción necesaria», **envío en bloque** («10 de 10 iniciarán un flujo») y marcadores de posición al lado | Es la forma de B2 |
| 5 | Nueva versión **con comentario**, y el historial lo enseña | Era nuestro paso 7 opcional; es estándar |
| 6 | **Seguimiento** de un archivo o carpeta (quién lo sigue, avisos al cambiar) | No lo tenemos |
| 7 | **Plantilla de proyecto** con la estructura de carpetas de la empresa | La tenemos a medias (plantillas de obra) |
| 8 | En RFI, **marcar la respuesta oficial** entre varias; responder **contestando al correo** | Lo primero es pequeño; lo segundo pide correo entrante |
| 9 | En Submittals, la planificación hacia atrás con sus campos: requerida en obra − plazo de entrega − revisión del diseño (14 días) − revisión interna = «presentar antes del». Entrega prevista, confirmada y real. Y los submittals **como tareas del cronograma** | Encaja con el avance de View |
| 10 | Correspondencia **agrupada por tipo** con prefijo (AR-2, CG-1, EDT-2) y **permisos por tipo** | Base de C1, «actos con reloj»: cada tipo, con su plazo legal |
| 11 | Reuniones por **serie**; cada punto con origen y **actas anteriores**; el acta se confirma | No lo tenemos |
| 12 | Móvil: **planos sin conexión** («29 de 29 descargados», «Sincronizar»), marcas que se publican y repasos con «Listo para revisión» | Trabajo de campo (GAP 07) cubre una parte |
| 13 | **Fecha límite en rojo** cuando vence, en todas las listas | Pequeño y de alto valor; nuestra portada ya lo hace con lo atrasado |
| 14 | «**Solicitar cambio de planificación**» por tarea, con historial | Base de la ampliación de plazo con su expediente |
| 15 | Planes de acción con «**bloqueo**»: no se pasa al punto siguiente sin la firma del anterior | Encaja con Protocolos |

### Orden recomendado, tras ver los vídeos

1. **Lo pequeño que corrige lo hecho hoy:**
   - fichas visibles de la vista activa;
   - colecciones por estado y «Asignados a mi empresa»;
   - guardar columnas en la vista;
   - fecha límite en rojo en las listas.
2. **Carga con requisitos por tipo (B2),** con la forma vista: pestaña «Cargas», rejilla, errores por celda, envío
   en bloque y comentario de versión.
3. **Decidir desde el lector (C2)**, más la marca de respuesta oficial en RFI.
4. **QR de vigencia.**
5. **Cajetín leído al cargar planos (C3),** con región marcada una vez y publicar tras revisar.
6. **Correspondencia por tipos con plazo legal (C1)** y seguimiento de archivos.
