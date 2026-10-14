# Procore frente a ALEPHIA · núcleo documental — 14-oct-2026

> El propietario: «sigamos revisando Procore y lo que ya tenemos para luego construir algo nuestro. Nuestro fin
> es construir el estándar que los demás querrán usar».
>
> **Fuente Procore:** la videoteca pública de soporte (`v2.support.procore.com/es-es/video-library/`). Se
> miraron fotogramas de 12 vídeos, sin descargarlos: Gestión documental (ver, cargar, flujo de aprobación,
> configurar campos), Documentos (ver, versiones, información), Planos (ver, cargar revisiones),
> Correspondencia (crear), RFI (crear) y Submittals (cerrar y distribuir).
>
> **Fuente ALEPHIA:** el código de `frontend-docs` y `backend` en local. Mismo criterio que
> `PROCORE_PATRONES_ESTANDAR.md`: lo estándar se usa; lo que es de Procore (marca, textos, iconos) no se toma.
> No es asesoría legal.

## 1 · Lo que Procore hace, y lo que tenemos

| Área | Procore (observado) | ALEPHIA hoy | Lectura |
|---|---|---|---|
| **Carga** | Cada archivo entra en una rejilla editable de metadatos (nombre, descripción, tipo, revisión, responsable, fecha límite). Varios campos se rellenan solos (icono ✦, una estimación); lo que falta sale en rojo y la columna **«Acción necesaria»** dice «Faltan atributos» o «Enviar» | Se sube y punto. La convención de nombres se comprueba **después**, en «Nombres fuera de convención» | **Nos falta el momento de la carga.** Pero nuestro dato ya viene en el nombre (ver §2-1) |
| **Marcadores de posición** | Documentos reservados **antes** de que exista el archivo, con responsable y fecha límite («Esperando archivo») | **Plan de entregas** (MIDP/TIDP): cada compromiso calcula su estado al leer (pendiente/vencido/vinculado/**entregado** si su documento está publicado), pero el vínculo con el documento se hace **a mano, uno a uno** (`plan_de_entrega.vincular`), y Archivos no lo muestra | **Lo tenemos, a medio conectar.** Es la pieza con más potencial (§2-2) |
| **Campos** | «Conjunto de campos» configurable: archivo, autor, clasificación, disciplina, elaborado por, estado, etapa, tipo, volumen o sistema, y hasta 20 propios. Nombre, revisión, estado y tipo, obligatorios | Patrón de nomenclatura por obra (proyecto, originador, volumen, nivel, tipo, disciplina, numeración) + catálogo de idoneidad por obra | Nuestro modelo es **ISO 19650 + Guía BIM del Perú**: los campos son el código |
| **Lista** | Nombre (código) · Descripción · Tipo · Revisión · Versión · Estado · Etapa · Flujo; «Configurar» columnas; «Última versión / Todas»; filtros por metadato; vistas guardadas | Desde hoy: Nombre · Descripción · Revisión · Estado ISO 19650 · Actualizado · Por · Tamaño. Filtro solo por estado | Faltan **filtros por metadato** y **vistas guardadas** (estándar) |
| **Panel del documento** | Al seleccionar: vista previa, título editable, fechas, ubicación, versión, permisos, seguimiento, etiquetas, registro de descargas, historial, correos | Desde hoy: recorrido ISO con fechas, **huella SHA-256**, eventos sellados, código leído, últimos movimientos | Patrón estándar; **nuestro contenido va más lejos** (integridad) |
| **Aprobación** | Dentro del visor del plano: panel «Flujo de trabajo» con respuesta, motivo, adjuntos, paso actual, fecha límite, **tipo de decisión** («la primera persona que responde decide») y quién falta | Revisiones con pasos y plazos (contrato R01: solo el aprobador decide), en su propia pantalla; revisión CAD aparte | Falta **decidir desde el lector**; hay maqueta (`maquetas/decision_revision_v1.html`) |
| **Planos** | Registro por disciplina: número, título, revisión, fecha del plano, fecha de recepción, juego; lista o miniaturas; al cargar **lee número y título del cajetín** (estimación que se confirma) | PlanosModule: «¿cuál es la revisión vigente?», con las superadas consultables | Falta leer el cajetín al cargar |
| **Correspondencia** | Tipos: aviso de retraso, extensión de tiempo, instrucción del cliente, solicitud de cambio, boletín… Con número por tipo, estado, fecha límite **manual**, distribución, impacto en plazo y coste, vínculos con RFI y cambios | Cuaderno de obra (parte, asiento, instrucción con acuse), Transmittals, RFI y Red Line | **Aquí está nuestra mayor diferencia posible** (§2-4) |
| **RFI** | Número automático, fecha límite calculada por días configurados, gestor, asignados, distribución, especificación, plano, ubicación, impacto | RFI con responsable por identidad, plazo en días calendario, veredicto solo de quien lo tiene, aviso de bloqueo | Equivalentes; lo nuestro ya es más estricto |
| **Submittals** | Cerrar y distribuir: se eligen qué respuestas y adjuntos se envían; «crear una revisión tras el cierre» | Submittals: «¿este material puede instalarse?», con veredicto | Falta la **distribución selectiva** al cerrar |
| **Seguimiento** | «Elementos bajo seguimiento», «Suscribirse» | No existe | Estándar; pide migración |

## 2 · Nuestro estándar: lo que nadie más hace

Lo que nos hace distintos no es la forma de la pantalla (eso es estándar), sino **qué sabe el sistema por su
cuenta** y **qué puede demostrar**.

1. **El nombre ES el dato (ISO 19650 + Guía BIM del Perú).**
   - Procore pide rellenar campos al cargar y adivina algunos.
   - Nosotros **leemos el código** (`500125-CSSP001-000-XX-DR-DR-004120`): tipo, disciplina, volumen y número salen
     del nombre, de forma **exacta**, no estimada.
   - Al cargar solo se pregunta lo que el código no dice (descripción, idoneidad), y los nombres fuera de
     convención se avisan **en el momento**, no después.
2. **El Plan de entregas dentro de Archivos.**
   - Los códigos del MIDP/TIDP son nuestros «marcadores de posición», con la ventaja de que **ya existen** y ya
     calculan su estado.
   - Lo que falta es el **vínculo automático**: al subir un archivo cuyo código coincide con un compromiso, se
     vincula solo. Hoy es manual. Al publicarse, el compromiso pasa a «entregado», como ya hace.
   - Una columna **«Entrega»** dice para cada documento: *planificada · por vencer · entregada · fuera de plan*.
   - Es el MIDP vivo que pide la Guía BIM, sin rellenar nada.
3. **Integridad demostrable.**
   - Huella de cada versión, registro sellado, «comprobar un archivo» y **constancia de trazabilidad**.
   - Ni ACC ni Procore lo ponen a la vista (ver `PROPUESTA_CONSULTA_Y_TRAZABILIDAD.md`).
4. **Actos con reloj legal.**
   - En Procore la fecha límite de una correspondencia la escribe alguien.
   - En una obra pública peruana el plazo **lo fija la norma**: ampliación de plazo (Reglamento de la Ley 32069,
     art. 200, con aprobación tácita si no se responde), consultas en cuaderno, liquidación (30/50/15 días),
     y días calendario salvo que diga otra cosa (art. 105.3).
   - ALEPHIA puede **calcular el plazo y avisar del silencio** por su cuenta. Ver `docs/ECD_REALIDAD_PERUANA.md`.
5. **Revisión vigente sin ambigüedad.** Ya lo hacemos en Planos y Especificaciones: lo superado se consulta,
   pero nunca se confunde con lo vigente.

## 3 · Hoja de ruta propuesta

**Tanda A · lo estándar que falta** (pantalla, sin migración):

| # | Qué | Base |
|---|---|---|
| A1 | Columnas **Tipo** y **Disciplina** leídas del código | Nomenclatura existente |
| A2 | **Filtros por metadato** (tipo, disciplina, estado, idoneidad) y **vistas guardadas** al pie del árbol | Patrón estándar (v5) |
| A3 | **Ficha completa** con la línea de tiempo «Trazabilidad» | Maqueta v8, paso 3 |

**Tanda B · lo nuestro** (lo que nos hace estándar):

| # | Qué | Base |
|---|---|---|
| B1 | **Plan de entregas ↔ Archivos**: vínculo automático por código al subir, y columna «Entrega» en Archivos | `plan_de_entrega` (estados y `vincular` ya existen) + nomenclatura |
| B2 | **Carga que lee el código**: al subir, se ve qué dice el nombre, qué falta y si está fuera de convención, antes de confirmar | Nomenclatura + «Nombres fuera de convención» |
| B3 | **Comprobar un archivo** y **constancia de trazabilidad** | Pasos 4 y 6 de la propuesta |

**Tanda C · obra pública peruana** (necesita decisiones):

| # | Qué | Base |
|---|---|---|
| C1 | **Actos con reloj**: tipos de comunicación con su plazo legal calculado (ampliación de plazo, consulta, liquidación) y aviso de silencio | Cuaderno + RFI + Reglamento 32069 |
| C2 | **Decidir desde el lector**: aprobar o rechazar una revisión sin salir del plano | Maqueta `decision_revision_v1.html` |
| C3 | Leer **número y título del cajetín** al cargar planos (del texto del PDF vectorial o del DWG, no adivinado) | Lector de DWG existente |

**Recomendación:** empezar por **B1 + A1**. Juntas hacen visible, en la pantalla que más se usa, lo que nadie
más tiene: el plan de entregas cumpliéndose solo, con el código leído. Después A2 y B2.

## 4 · Hecho en local: A1 + B1 (14-oct-2026, sin commit)

**A1 · Tipo y Disciplina en Archivos.**
- Columnas nuevas, leídas del código del nombre (`utils/codigoDelNombre.js`, la misma regla que usa el panel de
  consulta).
- Se muestra el **código** («DR»), no un significado: la Guía Nacional BIM fija qué campos lleva el nombre, no
  qué significa cada código; eso lo decide cada obra.
- Los nombres fuera de convención quedan en blanco. Se pueden ordenar.

**B1 · El plan de entregas se cumple solo.**
- **Al subir** (`file_system_db.create_file_record` → `plan_de_entrega.vincular_al_subir`), el documento se ata
  a su compromiso **solo si no hay ninguna duda**:
  - el nombre sin extensión ES el código;
  - hay un único compromiso libre con ese código;
  - el formato cuadra.

  Respeta lo que dejó escrito `sugerir_vinculos` («no atar por parecido»). Queda registrado y sellado como
  automático, y se deshace como cualquier vínculo.
- **Archivos** tiene una columna **«Entrega»** (entregado / vinculado / vencido / comprometido), con el mismo
  cálculo que la pantalla del plan. El listado la trae en una sola consulta; si el plan no existe, la lista sale
  igual.
- **Plan de entregas**: bloque «N documentos de Archivos coinciden con compromisos sin vincular». Usa la ruta
  `/api/plan/sugerencias`, que existía y ninguna pantalla usaba. Cada coincidencia trae su etapa y su fecha, y
  vienen marcadas solo las exactas y sin ambigüedad. Las demás las decide una persona.
- **Sin rutas nuevas** (el portal está en su tope) y **sin migración**.

**Pruebas:**
- `test_plan_vinculo_al_subir.py`, 9/9: los casos que sí y los que no, y la entrega en el listado.
- Suite: 2144 pasan; los 2 fallos son los de antes.
- Bancos de Docs: 20/20. `anchosColumnas` exige el ancho de fábrica del nombre en 400: se respetó, no se tocó la
  prueba.
- Banco nuevo `probar-plan.html`.
- Captura de Archivos con ficheros ISO inyectados en el banco.

## 5 · Segunda tanda de vídeos (14-oct-2026)

Vídeos revisados con el mismo método:
- RFI: responder y cerrar;
- Submittals: crear y responder;
- Correspondencia: responder;
- Registro diario: informes;
- Gestión documental: resumen.

| Patrón observado | Estándar | ALEPHIA | Lectura |
|---|---|---|---|
| **Vistas guardadas agrupadas por estado**: «Publicados», «En revisión → Asignados a mí / Asignados a mi empresa», «Planos eléctricos»… Organizan por estado y filtros, no por carpeta | Sí | Árbol de carpetas; «Mi trabajo» en el inicio | Falta: **A2** |
| **Filtros como fichas** que se quitan con ✕ («Tipo: PL - Plano ✕») y «Última versión / Todas las versiones» | Sí | Un buscador y un desplegable de estado | Falta: **A2** |
| **Respuesta oficial** del RFI: con varias respuestas, el gestor marca una como oficial antes de cerrar; «Devolver a las personas asignadas» | Sí | Veredicto solo de quien tiene el RFI | Revisar si cubre varias respuestas |
| **Submittals con plan hacia atrás**: fecha requerida en obra − plazo de entrega − tiempo de revisión = «presentar antes del». Pasos con fecha de envío, límite y devolución | Procore lo hace bien | «¿Puede instalarse?», con veredicto, sin plan de fechas | **Oportunidad**: unirlo al cronograma (4D/avance de View) |
| **Responder por correo**: el aviso llega con todo el detalle y se contesta respondiendo al correo | Procore | Avisos en «Mi trabajo» | Pide infraestructura de correo entrante; para después |
| **Informes de registro diario** (mano de obra por empresa, gráfico, PDF/CSV) | Sí | Cuaderno de obra (parte, asiento, instrucción) | El cuaderno peruano es legal; un informe de mano de obra se puede sacar de los partes |

**Siguiente que se construye: A2.** Filtros por metadato como fichas en Archivos (tipo, disciplina, estado ISO,
entrega), leídos del código y del plan. Es estándar, no necesita servidor nuevo y no cambia nada de lo que existe.

## 6 · Hecho en local: A2 · filtros por metadato (14-oct-2026, sin commit)

- **«Añadir filtro ▾»** junto al desplegable de estado (`components/FiltrosDeArchivos.jsx`).
  - Tres grupos: **Tipo** y **Disciplina** («· del código»), y **Entrega** (del plan de entregas).
  - Ofrece solo los valores que hay en la carpeta, con su recuento.
- **Fichas** de los filtros activos bajo la barra, que se quitan con ✕, y «Quitar todos» si hay más de uno.
- **Se suman** al buscador y al desplegable de estado, que no cambian. Con un filtro por metadato las carpetas se
  apartan, porque no tienen tipo ni entrega.
- El pie dice «Mostrando N de M».
- **Sin servidor nuevo**: filtra lo que ya está cargado (`hooks/useFileExplorer.js`).

**Comprobado en el banco** (clics reales):
- el menú lista DR 3 · M3 1 · RP 1 / DR 3 · ES 2 / Fuera del plan 402 · Entregado 1 · Vinculado 1 · Vencido 1;
- «Disciplina: ES» deja 2 documentos y, con «Entrega: Vencido», 1;
- las fichas se quitan.

Build sin errores; bancos de Docs 20/20.

**Lo que falta del patrón:** las **vistas guardadas** al pie del árbol («Vencidos del plan», «Publicados», «Me
toca»), que recorren toda la obra y no solo la carpeta. Piden apoyarse en la búsqueda de la obra
(`/api/docs/search`); es el siguiente paso de A2.

## 7 · Tercera tanda de vídeos: el contexto completo (14-oct-2026)

Se vieron **unos 60 vídeos** de la biblioteca pública de Procore: gestión documental, planos, especificaciones,
correspondencia, RFI, fotos, inspecciones, observaciones, coordinación, registro diario, reuniones, planificación y
Procore Drive. Las finanzas se dejaron fuera a propósito. Solo se miró: no se descargó nada ni se usó su API.
Al final se añadieron el directorio y las plantillas de administración (§7.4).

### 7.1 · Lo que se repite en TODAS las herramientas (el estándar real)

| Patrón | Dónde aparece en Procore | ALEPHIA hoy |
|---|---|---|
| **Un mismo esquema de elemento**: N.º, tipo, título, estado, especialidad, persona asignada, fecha límite, prioridad, ubicación, sección de especificaciones, distribución, «privado» y adjuntos | RFI, observaciones, inspecciones, coordinación, correspondencia | Cada módulo tiene sus propios campos. Está por revisar si comparten esquema |
| **Vistas guardadas en tres niveles**: empresa, proyecto y personal, en un panel a la izquierda de la lista. Al crear una se elige el nivel | RFI y gestión documental (las «colecciones»: Publicados, En revisión, Construcción) | No las hay. Es la parte 2 de A2 |
| **La ficha con pestañas**: General · Registro de descargas · Elementos relacionados · Correos · Historial de cambios | Especificaciones, documentos y RFI | Ya existen las piezas sueltas: el recorrido, el registro de descargas, la huella y la cadena. Hoy se ven a medias en el panel de consulta |
| **Edición masiva**: se marcan filas y se cambian estado, asignados, fecha o ubicación de golpe | Correspondencia, RFI y observaciones | Solo el borrado en lote |
| **Listas agrupadas por tipo**, por ejemplo «Aviso de retraso» o «Extensión de tiempo» | Correspondencia | No |
| **Papelera** propia de cada herramienta | RFI y documentos | Papelera de Archivos |
| **Portada de la obra**: atrasado, próximos 7 días y más de 7 días por herramienta, «Mis elementos abiertos», cambiados hace poco y planificación de hoy | Portada | «Mi trabajo» cubre los avisos, sin el resumen por plazos |

### 7.2 · Lo específico de planos y documentos

- **Al cargar planos** se piden la fecha del plano, la fecha de recepción y una revisión por defecto, y se pregunta si
  el número de plano trae la revisión. También se ofrece **«Obtener número y título a partir del nombre de archivo»**:
  es lo mismo que hace nuestro `codigoDelNombre` y confirma que C3 (leer el cajetín) va bien encaminado.
- **El visor de planos** tiene en la barra Descargar, **Código QR**, Anotaciones, Filtro, Info, Buscar y Actividad.
  El QR de cada lámina lleva a la versión vigente.
- **Especificaciones**: antes de publicar, el PDF se parte en secciones y se revisan el número y el título de cada una.
  Cada sección guarda su historial de revisiones con la fecha de emisión y la de recepción.
- **Plantilla de proyecto**: la estructura de carpetas se define una vez y cada obra nueva nace con ella.
- **Procore Drive**: un explorador de escritorio que sincroniza carpetas. Nuestro conector `alephia://` cubre abrir en
  Revit o Civil, pero no la sincronización.

### 7.3 · Lo de obra (para situarnos, no para copiar)

- **Registro diario** por apartados (clima, mano de obra, maquinaria, visitas, entregas e inspecciones), con un botón
  **«Completar día»**. Es lo más parecido a nuestro cuaderno de obra. El nuestro tiene además valor legal: el asiento.
- **Problemas de coordinación** con una miniatura del 3D y un punto en el plano. Es lo que hace View con las superposiciones.
- **Reuniones** con agenda por categorías y lista de asistentes. Los **elementos de seguimiento pasan solos a la
  siguiente reunión**.
- **Planificación** con Gantt y EDT, una vista de las tareas de hoy y un lookahead. Los submittals cuelgan de las tareas.

### 7.4 · Directorio y administración (la base de todo lo anterior)

- **Directorio de la obra agrupado por empresa.** Cada persona tiene una **plantilla de permisos** con una matriz
  herramienta × nivel (Ninguno · Solo lectura · Estándar · Administrador).
- Hay **grupos de distribución** («Directores de proyecto») que se usan como destinatarios en todas las herramientas.
- **Importación masiva** de personas y empresas desde una plantilla de Excel validada.
- La **administración de empresa** define una vez lo que luego usan todas las obras:
  - tipos de correspondencia con su **prefijo** (ANX, AR, CG, EDT, IC, SC), que numera cada elemento («AR-2», «EDT-1»);
  - **conjuntos de campos** (qué campos lleva cada tipo y cuáles son obligatorios), campos personalizados y estados;
  - plantillas de proyecto, valores por defecto, roles y webhooks;
  - **plantillas de formulario** (análisis de riesgo, charla de seguridad) que después se rellenan en obra.

**Para ALEPHIA:** ya tenemos Rol, la configuración de permisos por carpeta y las plantillas de flujo de revisión.
Lo que enseña Procore es que **la configuración vive en la empresa y la obra la hereda**. Eso encaja con la
nomenclatura de la Guía BIM: los códigos de tipo y disciplina que hoy leemos «crudos» del nombre los definiría cada
entidad una vez, y todas sus obras los mostrarían con su significado. Queda como opción, no en el orden de arriba.

### 7.5 · Qué hacemos con esto: estándar + lo nuestro

El estándar del sector ya está claro, y **no hace falta inventarlo**. Lo nuestro es lo que ninguno trae:

1. **Un QR que no solo abre: también certifica.** Procore lleva a la última versión. El nuestro diría además si esa
   lámina impresa **es la vigente**, con su huella SHA-256 y su sitio en la cadena. En obra pública peruana, con
   supervisor y Contraloría, eso vale más que la comodidad.
2. **Vistas guardadas que entienden ISO 19650 y el plan**, por ejemplo «Vencidos del plan», «Publicados sin entrega»
   o «Me toca revisar», en los tres niveles.
3. **La ficha con pestañas montada sobre lo que ya tenemos**: recorrido, descargas, relacionados (plan, revisiones,
   transmittals) e integridad. Sin datos nuevos.

**Orden recomendado:**
1. **A2-2 · vistas guardadas** en tres niveles, empezando por la personal y la de proyecto.
2. **Paso 3 · ficha con pestañas.**
3. **QR de vigencia**, que se apoya en la huella que ya se sella.
4. Edición masiva y portada por plazos.

### 7.6 · Complemento: los 24 montajes que solo se habían visto por muestra (14-oct-2026)

Se revisaron uno por uno. **El orden de §7.5 no cambia.** Lo nuevo que aportan:

**Documentos y especificaciones**
- **Subir un archivo con un nombre que ya existe en la carpeta**: Procore no lo rechaza ni lo pisa. Pregunta, archivo
  por archivo, «Cargar como nueva versión» o «Renombrar y cargar». **Comprobado en ALEPHIA:** el servidor versiona
  por nombre (`create_file_record`), así que el archivo se convierte en la versión siguiente **sin avisar ni preguntar**
  (`UploadModal.jsx` no dice nada). Es un candidato claro: avisar antes de subir y dejar elegir, sin cambiar el servidor.
- **Accesos fijos al pie del árbol de Documentos**: «Nuevos documentos esta semana», «Elementos bajo seguimiento» y
  «Papelera de reciclaje». Son vistas guardadas de serie y confirman el lugar que propone A2-2.
- **Especificaciones por juegos**: se cargan con fecha del juego, formato, fecha de emisión y fecha de recepción.
  Es el mismo esquema que en planos.

**Correspondencia y permisos**
- **Cada tipo de correspondencia** (Boletín, Aviso de retraso, Extensión de tiempo…) se comporta como una herramienta
  propia, con **sus permisos y su flujo de trabajo**.

**Reuniones**
- Las reuniones se agrupan por **serie**: semanal de seguimiento, diaria del equipo, promotor–arquitecto–contratista.
- Pasan de agenda a **acta** («En espera de acta» → «Acta»), con la asistencia marcada («Presente»), y se descargan en PDF.
- *Para ALEPHIA:* encaja con los actos con plazo legal (C1).

**Planificación**
- El cronograma se puede **importar en solo lectura** (P6, MS Project; se mantiene fuera) o **crear editable**.
- El **lookahead** se arma a partir del cronograma, por rango de fechas.
- *Para ALEPHIA:* el 4D y el avance de View ya parten de un cronograma; conviene mantener la misma separación.

**Fotos**
- **Álbumes** y la bandeja «Sin clasificar».
- **Edición masiva** de descripción, ubicación, especialidad, álbum y privacidad.
- **Mapa** con la posición GPS de cada foto; las fotos sin posición se colocan a mano.

**Inspecciones, observaciones y repasos**
- Las **plantillas se importan desde la empresa**.
- Las inspecciones muestran su avance (6/6). Sus tipos se separan en **Calidad / Seguridad**, y esa clasificación es
  permanente.
- Las **observaciones** pasan por estos estados: Iniciado → Listo para revisión → No aceptado / Cerrado.
- En la **lista de repasos** intervienen tres personas:
  - un **gestor**;
  - un **aprobador final**;
  - el **asignado**, que marca «Resuelto».

  Después, el gestor lo deja «Listo para cerrar». Cada repaso lleva sus planos vinculados y su actividad.

**Planes de acción (calidad)**
- Se organizan en secciones y elementos. Cada elemento lleva **criterio de aceptación**, referencias (otro elemento
  o un documento), método de verificación y **registros** de evidencia.
- Tienen aprobadores y personas que reciben el plan completado. Se guardan como borrador y luego se publican.
- *Para ALEPHIA:* es el equivalente de los **protocolos de calidad y el dossier** de una obra peruana. Si se hace,
  el registro de evidencia iría con huella y cadena, como los documentos.

**Incidentes**
- Tipo (lesión o enfermedad), hora del evento, «registrable», declaraciones de testigos, acciones y **alertas según
  la gravedad**.

**Informes 360**
- Informes que **cruzan herramientas y obras**, incluidas las inactivas, con columnas elegibles y columnas calculadas.
- Hay informes de empresa (todas las obras o algunas) e informes asignados.
- *Para ALEPHIA:* el tablero de análisis de View hace esto para el Inventario. El patrón sirve para la parte documental:
  cumplimiento del plan, revisiones abiertas por empresa…

## 8 · Hecho en local (14-oct-2026, noche, sin commit)

Del orden de §7.5:
- **1 · Vistas guardadas:** fase 1 hecha (`A2-2_VISTAS_GUARDADAS_PROPUESTA.md` §9).
- **2 · Ficha con pestañas:** hecha (`PROPUESTA_CONSULTA_Y_TRAZABILIDAD.md` §11), con «Comprobar un archivo» que
  calcula la huella en el navegador.
- **Portada por plazos:** hecha. Es la parte «portada» del punto 4; la edición masiva sigue pendiente.
  - Nueva entrada «Portada» en Documentos (`components/PortadaObra.jsx`, `utils/portadaObra.js`). Se sigue
    entrando a la obra por Archivos, como antes.
  - **Mis pendientes** de esta obra (de «Mi trabajo»), por tramos: atrasado, próximos 7 días, más adelante y sin
    plazo.
  - **Plazos de la obra** por herramienta:
    - revisiones en curso, por el plazo de su paso actual;
    - plan de entregas sin entregar, separando los compromisos atrasados sin documento: «no consta», no
      «incumplido».
  - **Documentos:** las cifras de las vistas de Archivos; cada una abre su vista.
  - Por día de calendario de Lima: lo que vence hoy no está atrasado.
  - Sin rutas nuevas. No usa `/api/activity`, que no filtra por permiso de carpeta.
  - **Sin fila de RFI.** El perfil portal (el despliegue de Docs) no sirve `/api/rfis`, y `test_perfil_portal`
    lo detectó. Los RFI de cada persona sí salen en «Mis pendientes».
  - **Hallazgo sin tocar.** La propia pantalla RFI de Docs (`RfiModule` → `IssueModule`) llama a `api/rfis` sin
    la barra inicial, así que esa prueba no la ve. En un despliegue solo-portal esa pantalla no tendría servidor.
    Hay que decidir si `/api/rfis` entra en el perfil portal.

**Siguen pendientes:**
- 3 · QR de vigencia.
- Edición masiva.
- Vistas de la obra guardadas en el servidor.
