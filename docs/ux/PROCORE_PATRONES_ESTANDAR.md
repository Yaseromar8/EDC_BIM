# Procore · patrones estándar para ALEPHIA, con identidad propia — 13-oct-2026

> El propietario: «sigamos rebuscando más Procore, obviamente con nuestra identidad, para después no
> tener problemas legales» · «no lo copiemos, pero sí tratemos de asemejarnos» · «la idea es que lo
> que sea estándar, lo usemos».
>
> **Fuente:** la videoteca pública de soporte de Procore (`v2.support.procore.com/es-es/video-library/`):
> fotogramas de «Documentos: organizar archivos y carpetas», «Documentos: gestionar versiones»,
> «RFI: responder a una RFI» y «Planos: ver planos». Solo se miró; nada se descargó ni se copió.
> **No es asesoría legal.**

## 1 · La regla

| Se USA (estándar del sector) | NO se toma (es de Procore) |
|---|---|
| Cómo se organiza la pantalla, cómo se navega y qué hace cada cosa: patrones que repiten ACC, Procore, Trimble, Aconex, Drive o SharePoint | Su **naranja**, su **logo**, sus **iconos**, sus **ilustraciones**, sus **textos** y frases, y su **nombre de marca** («Toolbox», «Procore Drive»…) |

La identidad de ALEPHIA va encima de lo estándar: Navy (manual de marca), el símbolo de ALEPHIA, los
iconos sólidos propios (estilo B), Inter y las señas propias de la v5 (recorrido ISO 19650, código
leído y «Lectura del documento»).

## 2 · Patrones observados

### Navegación (ya en la maqueta v4)

| Patrón | Estándar | En ALEPHIA |
|---|---|---|
| Barra superior fina con selector de **obra** y de **herramienta** (etiqueta pequeña encima) | Sí (ACC, Trimble y Aconex lo hacen igual) | v4: barra Navy oscuro, símbolo de ALEPHIA como inicio |
| Buscador global con atajo de teclado (Ctrl K) | Sí | v4 |
| Favoritos | Sí | v4 |
| Sin barra lateral de módulos; la izquierda es de la herramienta (árbol de carpetas) | Sí | v4 |
| Vistas guardadas al pie del árbol («nuevos esta semana», «papelera») | Sí | v4 |

### Lista de una herramienta

| Patrón | Estándar | Estado en ALEPHIA |
|---|---|---|
| Título + **descripción de una línea** («Visualice, gestione y cargue…») | Sí | **Falta**: ayuda a quien entra por primera vez |
| Pestañas de vista («Planos actuales · Juegos de planos») | Sí | Lo tenemos (Carpetas · Nombres fuera de convención · Papelera) |
| Buscar + «Añadir filtro ▾» | Sí | Parcial (buscador y filtro de estado); falta el filtro por campo |
| Contador «Mostrando 1–77 de 77» | Sí | Lo tenemos |
| **Agrupar por disciplina** (grupos plegables) | Sí | **Falta**: con la convención de nombres se puede agrupar por Rol o Tipo |
| **Barra de selección**: al marcar, la cabecera pasa a «✕ · *nombre* seleccionado» con las acciones como iconos | Sí (ACC también) | Tenemos acciones en la barra; falta que la cabecera de la tabla se convierta |
| Menú contextual: Info, Abrir, Descargar, Nueva versión, Reservar, Correo, Renombrar, Mover, Copiar, Eliminar | Sí | Casi igual; hecho hoy (36 px, pegado al ⋮) |
| Un solo botón de color «+ Nuevo ▾» | Sí | v4 |

### Detalle de un elemento (documento, plano, RFI)

| Patrón | Estándar | Estado en ALEPHIA |
|---|---|---|
| Panel de detalle a la derecha («Información general»: vista previa, título, fechas, descripción, ubicación, versión, tipo, tamaño, permisos plegables) | Sí | v5: «Lectura del documento», más completa |
| Página de detalle con **pestañas**: General · Elementos relacionados · Correos · **Historial de cambios** · **Registro de descargas** | Sí (trazabilidad ISO 19650) | Parcial: «Actividad» existe como módulo, no por documento |
| Flechas ‹ › para pasar al anterior/siguiente sin volver a la lista | Sí | **Falta** (el lector ya tiene vecinas; la ficha no) |
| Secciones en **tarjetas plegables** con título en mayúsculas | Sí | Revisiones lo hace a medias |
| Editor de respuesta con **zona de arrastrar adjuntos** | Sí | Falta en RFI |

### Comportamiento

| Patrón | Estándar | Estado en ALEPHIA |
|---|---|---|
| **Reservar con caducidad** (1 h, 3 h, 6 h, 12 h, 24 h, 7 días; «caduca hoy a las 18:56») | Sí | **Falta**: nuestra reserva no caduca. Mejora funcional |
| Diálogo «Cargar nueva versión»: versión actual, nueva, comentario | Sí | Lo tenemos («Subir nueva versión»); falta el comentario de versión |
| **Aviso por correo con todos los datos** y enlaces «Ver en línea · Abrir · PDF» | Sí | Parcial: revisar qué llevan hoy nuestros correos |
| **Responder desde el correo** | Útil, más complejo | Opcional, para más adelante |
| Columna derecha de acciones con **informes** | Más propio de Procore | No hace falta; las acciones van en la barra |

## 3 · Lo que esto confirma de lo ya hecho

- El menú contextual, el resaltado inmediato, los botones de 36 px y la barra de acciones son
  estándar: van bien.
- La «Lectura del documento» de la v5 encaja en el patrón estándar de «Elementos relacionados», pero
  dibujada a nuestra manera (un solo trazo), así que es **nuestra**.

## 4 · Propuesta de orden

1. **Barra superior v4** (obra · herramienta · buscador · favoritos) y quitar la barra lateral.
2. **Ficha del documento** con pestañas: Lectura · Versiones · **Historial de cambios** · **Descargas**
   (los datos de actividad ya existen).
3. **Agrupar por disciplina** y **descripción de una línea** en cada herramienta.
4. **Reserva con caducidad** (función nueva, pequeña).
5. **Barra de selección** en la cabecera de la tabla.

Todo en local y por pasos, y cada paso con su maqueta antes si cambia la navegación.

## Columnas de la lista de documentos (revisado el 14-oct-2026)

Misma fuente y método: videoteca pública de soporte, fotogramas de «Gestión documental: Ver documentos» y de
«Documentos: Organizar archivos y carpetas». Solo se miró.

| Producto | Columnas |
|---|---|
| **ALEPHIA hasta hoy** (calcado de ACC) | Nombre · Descripción · Versión · Indicadores · Marcas de rev. · Incidencias · Tamaño · Últ. actualización · Actualizado por · Estado de rev. **Indicadores, Marcas de rev. e Incidencias estaban SIEMPRE vacías («--»)**: se copiaron de ACC sin datos detrás |
| Procore · Documentos (carpetas) | Nombre · «Creado el/última versión» (fecha **y** persona en una sola columna) |
| Procore · Gestión documental | Nombre (el código) · Descripción · Tipo · Revisión · Versión · Estado · Etapa del documento · Flujo de trabajo asignado · vista previa y descarga. Además: «Configurar» columnas, conmutador «Última versión / Todas las versiones», filtros por metadatos (disciplina, clasificación, etapa, formato, fecha de elaboración, elaborado por, fecha de carga) que se guardan como **vistas** |

**Estándar** (lo hacen todos):
- nombre, descripción, revisión o versión, estado;
- fecha con persona.

**Lo propio de ALEPHIA:**
- el **estado ISO 19650** junto a la revisión, con su idoneidad;
- ninguna columna vacía ni copiada.

**Siguiente, con datos reales:** una columna **Tipo/Disciplina** leída del propio código del documento (hoy el
nombre ya lo lleva) y una **«Vínculos»** con revisiones, envíos y RFI, cuando el listado los devuelva.
