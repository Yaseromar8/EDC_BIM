# Procore · notas de los 90 vídeos vistos (14-oct-2026, noche)

> Vistos fotograma a fotograma en el reproductor de Procore (Wistia), sin descargar nada: entre 1 y 7 momentos por vídeo, más en los del núcleo documental. Fuera, a propósito, los vídeos de finanzas (presupuesto, contratos, facturación, costes, pedidos, gestión de cambios). Informe: `PROCORE_REVISION_PROPIA_14-oct-2026.md`.


## GD · Resumen de Gestión documental (ehfv1dckp6, 305 s)
- Pantalla: pestañas Documentos · Cargas · Papelera de reciclaje. Botones Exportar ▾ y Añadir ▾ (naranja).
- Panel «Vistas guardadas» (+ Crear): colección Publicados → Todos los documentos de Publicados · Especificaciones · Planos · Planos eléctricos; colección En revisión → Asignado a mí · Asignado a mi empresa · Todos los documentos en revisión; colecciones propias: Recursos de la empresa, Construcción, Anteproyecto. «Todos los documentos» fijo al pie.
- Tabla: Nombre (código) · Descripción · Tipo («PL - Plano») · Revisión · Versión («1/2» + botón Ver todo) · Estado («AP - Aprobado») · Flujo de trabajo asignado · Etapa de documento · iconos ver/descargar. «Última versión | Todas las versiones». «Configurar». Paginación «1-20 de 27».
- Abrir una vista = FICHAS de filtro visibles («Tipo: PL - Plano ✕») + migas «Publicados › Planos». «Todos los filtros».
- Ver todo (versiones): modal con Versión («V2 última versión de la revisión»), Revisión, Estado (AP-Aprobado, RC-Rechazado), Etapa, Fecha de emisión, Fecha de carga.
- Correo del flujo: «Paso del flujo de trabajo que se le ha asignado», estado del elemento, vencimiento, paso actual («Aprobación del controlador de documentos»), quién no ha respondido, botón «Revisar el flujo», «Ver historial».
- Ajustes: pestañas Vistas · Permisos · Documentos · Flujos de trabajo · Notificaciones. «Colecciones de documentos» (5/12): descripción, visualización predeterminada (Última versión / Todas), nº de atributos; reordenar, editar, duplicar, eliminar.
- Compartir en correspondencia: formulario con fecha límite, miembro de distribución, ubicación, descripción; tabla de adjuntos con tipo/revisión/estado/etapa; «Guardar como borrador» / «Crear y enviar».

## GD · Configurar campos (rr934kq18z, 147 s)
- Admin de EMPRESA → «Conjuntos de campos · Campos predeterminados · Campos personalizados». Conjunto «Gestión documental / Información general»: Archivo, Autor, Cargado por, Clasificación, Descripción, Disciplina, Elaborado por, Estado… cada uno con interruptor y casilla «Obligatorio»; «Añadir campo personalizado» (1 de 20 usados).
- Campos predeterminados = LISTAS DE CÓDIGOS: Clasificación, Disciplina, Estado, Etapa del documento, Tipo (PL Plano, MO Modelo, ESP Especificaciones, DOC Documento, FO Foto), Volumen/sistema. Código · Descripción · Activo. «Descargar plantilla» / importar. Cada proyecto puede mostrar u ocultar valores.

## GD · Flujo de aprobación (rhpkvbo7gr, 178 s)
- Plantillas de flujo (herramienta Flujos de empresa) asignadas a documentos.
- La decisión se toma DENTRO DEL VISOR del plano: panel «Flujo de trabajo» con Respuesta ▾, Adjuntar archivos, «Motivo de la respuesta», Enviar; y panel «Problemas de coordinación» al lado.
- Al decidir, el estado del documento cambia solo (ER-En revisión → AP-Aprobado). Decisiones, anotaciones y adjuntos se conservan.
- Pestaña Cargas: a la izquierda «Cargas de documentos» y «Marcadores de posición»; rejilla con Acción necesaria, Archivo, Nombre, Descripción, Tipo, Revisión, Estado, Flujo de trabajo asignado, Versión; errores en rojo por celda; ventana flotante «Cargas 100 %».

## GD · Permisos (ki97tvnfbu, 264 s)
- Ajustes › Permisos: «Grupos de permisos» (Equipo de obra 33, Equipo de diseño, Electricista, Controlador de documentos, Archivos de la empresa [solo lectura]); matriz «Permisos de documentos» acción × Administrador/Estándar/Lector.
- Crear grupo: Personas | Permisos. Permisos de carga (Cargar nuevos archivos, Enviar archivos nuevos); de marcadores (Crear); de documentos POR REGLA: «Todos los documentos en los que Disciplina (4) y Estado (2)» → nivel; acceso a plantillas de flujo (todas automáticamente / selección).
- Ni los administradores ven el botón Cargar si no están en un grupo con ese permiso.

## GD · Cargar documentos (rr8yks7sqm, 182 s)
- «Añadir ▾»: Documentos · Cargar archivo · Importar metadatos · Marcadores de posición · Crear con escáner · Crear manualmente.
- Marcador de posición: «espacio reservado para un archivo previsto: qué documento, quién responde y cuándo se entrega, antes de que exista».
- Envío en bloque: seleccionar 10 → «¿Desea iniciar flujos de trabajo? 10 de 10 iniciarán un flujo».

## GD · Ver documentos (syyts1lin1, 241 s)
- Panel lateral «Filtros»: Disciplina, Clasificación, Etapa del proyecto, Formato, Fecha de elaboración, Elaborado por, Fecha de carga… «Borrar todos los filtros». Vista «Planos eléctricos» = fichas «Tipo: PL - Plano ✕» + «Disciplina: E - Electricidad ✕».
- Mensaje: «las vistas funcionan con filtros y permisos: nadie tiene que pedir acceso cada vez que se añaden archivos o revisiones».
- Visor: migas (colección › vista), ‹ › entre documentos, selector «Versión V1 · Revisión C · Aprobado ▾», «Añadir anotación», raíl izquierdo (capas, chinchetas, árbol), abajo «Comparar», mosaico y zoom.

## GD · Anotaciones (kcpjyro3rn, 230 s)
- Barra de herramientas: texto, formas, nube, flecha, medición, sellos ✓/✗; capa «My Markups».

## GD · Ajustes (vjb9jteimq, 325 s)
- Vistas: colecciones (2/12 al principio), «Crear colección», descripción, visualización predeterminada, atributos.
- Permisos: grupos + «Permisos de documentos» + «Permisos de flujo de trabajo».
- Documentos: «Requisitos de carga» = Regla predeterminada (norma de nomenclatura; ajuste de revisión «permitir identificadores duplicados»; campos obligatorios Tipo, Nombre, Estado, Revisión) + «Crear regla condicional» («Si Tipo es Foto o Especificaciones, entonces…» con sus campos). «Reglas del documento»: flujos simultáneos con versiones distintas. «Normas de nomenclatura». «Campos de documento».
- Flujos de trabajo: «Plantillas de empresa» con radio «Flujo predeterminado», estado CONFIGURADO / NO CONFIGURADO, nombre (Revisión del diseño; Proceso de revisión del plano de construcción; Aprobación de documentos), roles, gestor, grupo de distribución.
- Notificaciones.

## GD · Compartir en correspondencia (8i2vcr8yu8, 110 s)
- «Adjuntar archivos»: orígenes Mi ordenador · Fotos · Documentos · Planos · Formularios · Gestión documental; filtros (Autor, Volumen/Sistema, Ubicación, Disciplina, Flujo asignado, Personas asignadas al flujo / al paso actual, Fecha límite del paso…); «Última revisión | Todas las revisiones».

## Documentos (herramienta de carpetas): información y ajustes (bdxrgrapx6), cargar (8782sh4ujr), versiones (aw77bgrdnl), estructura (jsa828qird)
- Árbol de carpetas; al pie «Nuevos documentos esta semana», «Elementos bajo seguimiento», «Papelera de reciclaje». «Añadir filtro ▾», «+ Nuevo ▾».
- Panel lateral del archivo: Información general (miniatura, Título editable, Creado el, Última versión, Descripción, Ubicación, Versión, Tipo, Tamaño) · Permisos · SEGUIMIENTO («Realizar seguimiento de este archivo», «Gestionar seguimiento», lista de quién lo sigue; avisa al añadir un archivo a la carpeta o subir versión) · Etiquetas de archivo · Registro de descargas · Historial de cambios · Correos electrónicos · Elementos relacionados (vincular a Instrucción, Inspección, Observación, Oferta, Orden de cambio, Plano, RFI, Reunión, Revisión de plano, Sección de especificaciones, Solicitud de cambio…).
- «Cargar nueva versión»: versión actual → nueva versión + COMENTARIOS. Historial «Versiones de: …»: n.º, cambio hecho (fecha y por quién), nombre, COMENTARIO.
- Reservar / «Reincorporar archivo» (check-out / check-in) con aviso amarillo en el panel «Archivo reservado».
- PLANTILLA DE PROYECTO: «Plantilla de proyecto estándar» con estructura de carpetas (01 Archivos de diseño › BIM, Libro de especificaciones, Planos; 02 Archivos internos › Cierre y anteproyecto, Documentación de garantía, …, Seguridad › Hojas de datos de seguridad; 03 Documentos de licitación; Planificaciones; Subcontratos). Aviso: «está viendo una plantilla; al crear un proyecto desde ella se aplican sus carpetas».

## Planos: cargar (k5xaj0epgz), ver (408pb8c6qm)
- «Cargar planos»: Juego de planos (crear/elegir) · Fecha del juego · Fecha de recepción predeterminada.
- «Ayúdenos a que Procore etiquete automáticamente su carga»: el usuario MARCA UNA VEZ la región del n.º de plano y del título en el cajetín; Procore los lee en todas las láminas («Confirmar la región» / «Omitir este paso»).
- Tras procesar: «77 planos no publicados: solo visibles para administradores. Publicar» → revisar y publicar.
- Lista agrupada por disciplina; «Reordenar planos en Arquitectura»; interruptor «Suscribirse»; informes: Todos los juegos y revisiones · Bocetos · Revisiones de planos eliminadas · Medidas.
- Ficha del plano: pestañas General · Bocetos · Registro de descargas · Elementos relacionados · Correos electrónicos · Historial de cambios; Número, Título, Disciplina, Obsoleto; tabla Versiones (Revisión, Juego, Fecha del plano, Fecha de recepción, Estado Publicado); ‹ ›; Descargar, Descargar con anotaciones, Correo, Añadir boceto, Eliminar revisión.

## Planos: anotaciones (781c8rnat7) · Especificaciones (nk5gciga2l, 3qd4a1euba)
- Visor de planos, barra superior: Descargar · Código QR · Anotaciones · Filtro · Info · Buscar · Actividad. Herramientas a la izquierda (seleccionar, lápiz, nube, línea, texto, cota, foto, color).
- Anotación → «Publicar» (de capa Personal a Publicada) y vincular. «Filtrar anotaciones»: Capas (Publicado / Personal) y Tipos (RFI, Bocetos, Documentos, Submittals, Fotos, Problemas de coordinación, Observaciones, Inspecciones, Medidas, Todas las demás).
- Especificaciones: misma estructura que Planos (Cargar → «Revisar especificación» antes de publicar; «Crear división / sección manualmente»). Ficha de sección: General · Registro de descargas · Elementos relacionados · Correos · Historial de cambios; «Revisiones de sección»: Revisión, Fecha de emisión, Fecha de recepción, Juego.

## RFI: crear (50adgpx9ze), responder (vkwf2245ep), ver (of2wba0ox4), revisión (mkq4zxfdgw)
- Formulario: Número (automático) · Fecha límite (calculada por los días configurados) · GESTOR DE RFI* · Estado · Recibido de · Personas asignadas* · Lista de distribución · Responsable · Contratista responsable · Sección de especificaciones · Ubicación (por niveles: «Nivel 3 › Ala norte › Oficina 185») · Etapa · Número de plano · Código de coste · Impacto en la planificación · Impacto en los costes · Referencia · Privado. «Crear como borrador» / «Crear como abierto».
- «El rol de gestor de RFI permite a quien no puede crear RFI hacer borradores y asignarlos al gestor».
- Página del RFI: General · Elementos relacionados · Correos electrónicos · Historial de cambios. «Redactar nuevo correo» desde el RFI (Para/CC/CCO, Privado).
- Responder POR CORREO: el aviso trae la pregunta y los detalles; se contesta en Outlook.
- Lista con VISTAS GUARDADAS en tres grupos: «Vistas de la empresa», «Vistas de proyecto», «Vistas personales». «Al crear una vista guardada se conservan los filtros, la configuración de columnas, su orden, las columnas fijadas e incluso su ancho».
- Revisión de un RFI: mismo número con «Revisión 1».

## Submittals: crear (d6h0zvdpc2), cerrar y distribuir (9ss68cn9fn)
- Fechas: Presentar antes del · Fecha de recepción · Fecha de emisión · Fecha límite final. Planos vinculados. Lista de distribución. Privado («visible solo para administradores, flujo y distribución»).
- «Información de planificación del submittal»: Tarea de planificación · Fecha en que se requiere en la obra · Plazo de entrega (días) · Fecha prevista de devolución · Tiempo de revisión del equipo de diseño (14 días) · Fecha prevista de fin de revisión interna · Tiempo de revisión interna → «Fecha límite prevista de presentación».
- «Información de entrega»: prevista · confirmada · real.
- Flujo: pasos con Nombre, Rol (Aprobador / Revisor), Fecha límite; «Añadir paso»; plantilla.
- Cerrado: «El flujo se ha completado»; «Submittal distribuido»; «Resumen de distribución»: De · A · Mensaje («Aprobado para la construcción…») · Respuestas del flujo (comentario, adjunto, marca «Actual»). Botones Redistribuir, Exportar, Editar.

## Correspondencia: crear (h2mcashd48)
- Formulario con fecha límite, distribución, impacto en costes y en planificación, código de coste, ubicación, descripción; tabla de adjuntos (nombre, descripción, tipo, revisión, número, estado, formato…); «Guardar como borrador» / «Crear y enviar».

## Correspondencia: lista (h2mcashd48, 7vradszjn1), responder (v2iko40var), permisos (xt1en8nuac)
- Lista AGRUPADA POR TIPO con prefijo y número: «Aviso de retraso» AR-2 · «Correspondencia general» CG-1 · «Extensión de tiempo» EDT-1, EDT-2. Columnas: Número, Asunto, Última actividad, Personas asignadas, Creado por, Fecha de emisión, Fecha límite, Estado, Ubicación. Pestañas Lista · Archivo.
- Elemento «Extensión de tiempo N.º EDT-2: Retraso por causas meteorológicas»: pestañas General · Elementos relacionados · Correos · Historial de cambios · Permisos; «Vínculos»; «Actividad»: respuesta + adjuntos → «Publicar respuesta y cambiar estado» / «Publicar respuesta».
- Permisos POR TIPO de correspondencia (Ninguno / Solo lectura / Estándar / Admin) y finos: crear, responder a aquellos en que esté, editar los que creó, responder a los de su empresa, ver privados de su empresa. Cada tipo tiene su flujo.

## Reuniones: crear (blt4bjq06b), ver (lcu7lexibn)
- Lista agrupada por SERIE (Actas promotor-arquitecto-contratista, Reunión diaria, Previa a la instalación, Semanal…); columnas Título, Número, Resumen, Fecha, Ubicación, Estado («En modo de acta» / «Agenda»), Elementos, Plantilla.
- Reunión: Asistentes («Confirmar asistentes»); Agenda por categorías; cada punto: persona asignada, fecha límite, estado, prioridad, ORIGEN DE LA REUNIÓN, adjuntos, descripción, «Crear tarea», «Actas anteriores» del punto.
- Página del punto: General · Elementos relacionados · Historial; «Actividad reciente» con comentarios; ‹ › entre puntos.

## Registro diario: informes (mg6qm997wi), móvil (0lxvvd9elk)
- «Informe de mano de obra del registro diario»: gráfico por empresa y tabla (fecha, empresa, trabajadores, horas, ubicación, comentarios); filtros por fecha y empresa.
- Galería de plantillas de informe (RFI por estado, tiempo de respuesta de RFI, síntesis de submittals…).
- Móvil: «Crear fichaje» (horas, código de coste, tipo, facturable).

## Inspecciones (m00smer2km, yuepde5tl2, ndcz8niczh)
- Plantilla: secciones e ítems; tipo de respuesta (Pasa/No pasa/N/D); detalles; referencias.
- Planificación de inspección: plantilla, tipo, distribución, privado, ubicación, persona asignada, contratista, punto de contacto.
- Realizar: Conforme / No conforme / N/D por ítem; «Añadir solicitudes de firma»; panel de actividad por ítem; «Establecer como N/D» por sección; progreso de ítems.

## Observaciones (wgi3xkk7k2) · Lista de repasos informe (n83qj1aswz)
- Observaciones: pestañas Lista · Agrupado por tipo · Papelera; columnas N.º, Tipo, Especialidad, Título, Persona y Empresa asignada, Fecha límite (en rojo si vencida), Origen…
- Constructor de informes: columnas arrastrables, agrupar, «Probar informes 360».

## Planes de acción (fltf5brqbq) · Incidentes (dhb9dz5j90) · Informes 360 (pgsvh6tb2j)
- Plan: gestor, aprobadores, receptores del plan completado; secciones e ítems con Estado, Criterios de aceptación, Referencias (elemento de Procore / documento), Fecha límite, Personas asignadas, Métodos de verificación (Inspección), Registros (adjuntar), Notas. «Guardar borrador» / «Publicar».
- Incidente: registros (enfermedad/lesión con persona y partes del cuerpo), información de investigación, testigos, acciones, alertas.
- Informe 360: columnas personalizadas con fórmula (p. ej. horas por unidad), filtros, gráficos.

## Resto (directorio, administración, planificación, móvil, importaciones)
- Directorio: plantilla de permisos de proyecto = matriz herramienta × Ninguno/Solo lectura/Estándar/Admin + permisos finos; grupos de distribución («Directores de proyectos»); ficha de usuario y de empresa.
- Portada antigua del proyecto: «Elementos abiertos» (Mis / Todos), «Agrupar por fecha límite», Equipo de proyecto con teléfono y correo, mensaje del proyecto, clima.
- Admin de empresa: Correspondencia › Tipos · Conjuntos de campos · Campos personalizados · Estados (Anexo, Aviso de retraso, Boletín, Correspondencia general, Extensión de tiempo, Instrucción del cliente, Solicitud de cambio), cada conjunto asignado a N proyectos. Plantillas de reunión, de formulario (PDF con campos rellenables), de observación (categorías), de planes de acción («funcionalidad de bloqueo»: exigir la firma del ítem antes del siguiente; tipos; métodos de verificación), de repasos.
- Planificación: Gantt con EDT, % completado, estado (ATRASADO / EN CURSO), lookahead; «Solicitar cambio de planificación para esta tarea» con historial; importar (sustituye) y planificación editable; arrastrar aplica «No comenzar antes de»; los submittals como tareas (enviado antes de · revisión y aprobación · fabricación · obligatorio en obra).
- Planos (revisiones): lista con revisión, fecha, juego; ficha de plano.
- RFI cerrar: lista de respuestas con casilla «Marcar como oficial»; «La respuesta se ha marcado como oficial»; «Cerrar RFI».
- Submittal responder: aviso «Hay un elemento de acción: se requiere su respuesta»; sellos de aprobación propios (PNG) sobre el PDF.
- Procore Drive: explorador de escritorio con cola de subida/bajada.
- Importaciones: plantillas de Excel (submittals, usuarios, empresas, repasos) que deben coincidir con lo existente.
- Inspecciones/observaciones: separar calidad de seguridad por tipo; plantillas de empresa.
- Móvil: Gestión documental con fichas de filtro (Tipo, Disciplina, Descargado, Ubicación, Estado); planos SIN CONEXIÓN («29 de 29 descargados», «Buscar actualizaciones / Sincronizar»); marcas (Copiar · Vincular · Publicar · Eliminar); repaso: «Trabajo requerido / Listo para revisión / Trabajo no aceptado / Resuelto»; el gestor cierra; observación desde plantilla; inspección: comentario, adjunto, observación por ítem; formularios desde plantilla; reunión: agenda con «Vence en 3 d» y «Según la planificación»; fotos con ubicación en mapa (latitud/longitud) y privacidad.
