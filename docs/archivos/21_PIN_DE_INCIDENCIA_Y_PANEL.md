# 21 · El pin de la incidencia en la hoja y el panel como ACC

2-nov-2026. Sigue a [18](18_ESTADOS_Y_OBSERVACION_DEL_PLANO.md), [19](19_INCIDENCIA_EN_TODAS_LAS_HERRAMIENTAS.md)
y [20](20_MENU_DE_LA_MARCA_Y_NUBE.md).

## Qué pidió el dueño

> «El icono del issue parece como si fuese un mensaje. ¿No hay otro icono? Generalmente el issue en ACC se ve en el
> plano, y su diseño del panel es más profesional.»

Eligió **«Pin + panel nuevo»**: la herramienta «Incidencia» sustituye a «Contar». Al hacer clic en la hoja se pone un pin
numerado con el color de su estado y se abre el panel. El panel lleva cabecera, filas editables, adjuntos con miniatura
y la actividad.

## Qué se hizo

### 1 · El pin en la hoja

- **Estuche del lector** (`PDFViewer.jsx`):
  - «Contar» sale y entra «Incidencia», con la tecla **I**, en el bloque de Sello y Foto.
  - Los conteos que ya existen se siguen viendo y se pueden borrar; solo no se crean nuevos.
  - Medir queda con Distancia y Área.
- **Clic en la hoja** (`PdfToolsOverlay.jsx`), igual que la foto:
  - se apunta `{pagina, p}` en coordenadas del PDF;
  - se dibuja un pin gris de prueba;
  - el panel del plano se abre en el alta, y la herramienta vuelve a «Seleccionar».
- **Los pines** se dibujan encima de las marcas:
  - tienen tamaño fijo en pantalla y la punta en el punto;
  - el color es el de su estado y el número sale de su código;
  - el que está abierto en el panel lleva un aro.
  - Al hacer clic en un pin se abre esa incidencia en el panel.
- **Qué pines se ven en cada versión:**
  - en la versión vigente se ven todos, porque la incidencia sigue al plano, como en ACC;
  - en una versión anterior, solo los que se pusieron en ella.
- **El pin no es una marca.** Va en la evidencia `plano` de la incidencia (`doc_issues.evidencia`, `{"tipo":"plano", …,
  "pin":{"pagina":N,"p":[x,y]}}`). Por eso no se publica aparte ni se edita como una nube, y **no hace falta
  migración**.
- **Backend** (`routes/pdf_tools.py`):
  - `POST /api/pdf/planos/<plano>/observacion` acepta `pin`. Valida la página (1–5000) y que el punto tenga dos números
    finitos.
  - La ubicación pasa a decir «pág. N».
  - La lista que acompaña a las marcas devuelve `pin`.
- **En el alta** se ve «Pin en la hoja · Página N», con la opción **Quitar**. Con pin no se marcan por defecto todas las
  marcas libres, porque se está señalando un solo sitio.
- **En el detalle** se ve «Pin en la página N · Ver en el plano».

### 2 · El icono

- **El pin** sustituye al bocadillo, que se leía como «un mensaje». Están en el juego oficial
  (`design/iconos/iconos-obra.json`):
  - `incidencia`: un pin con «!», en el botón del rail «Incidencias del plano»;
  - `incidencia-nueva`: un pin con «+», en la herramienta.
- El menú de la marca también usa el pin («Crear observación»).

### 3 · El panel (`design/incidencias/PanelDeIncidencia.jsx`, compartido)

Es el mismo en todas las herramientas: lector, Issues y punch, y tableros. La disposición es la de ACC:

- **Cabecera:**
  - el pin con el color del estado y su número;
  - el código;
  - debajo, el tipo y la ubicación.
- **Cabeza:**
  - el título;
  - el estado (chip), «Vencida» si toca, y a quién le toca.
- **Actos:** los botones que permiten las reglas (`actosDeIssue`).
- **Detalles:** filas de etiqueta y valor, con la acción en la misma fila:
  - Estado;
  - Asignada a (**Reasignar**);
  - Verifica;
  - Fecha límite;
  - Tipo;
  - Ubicación;
  - Observadores (**Seguir** / **Cambiar**);
  - Clasificación (**Editar** o **Causa raíz** si está cerrada);
  - Levantó.
- **Descripción.**
- **Adjuntos:**
  - las fotos se ven en miniatura, a través de `entorno.miniatura(id)`; en Docs es el proxy con `thumb=1`, el mismo de la
    galería;
  - los documentos se ven con su icono;
  - quien lo subió puede quitarlo.
- **Actividad:** **un solo hilo** con los comentarios y el historial en orden, con iniciales, y la caja de comentar
  debajo (Ctrl+Enter envía). Sustituye a las tres pestañas de antes.

### 4 · Todo es nuestro, nada copiado de ACC

El dueño: «debe ser nuestro, respetando nuestra paleta de colores, las fuentes con el relieve que quedamos, y el dibujo
de los iconos». De ACC tomamos solo la disposición: el pin en la hoja y el panel por secciones. El aspecto es el
nuestro:

- **Dibujo:**
  - el pin es el trazado del juego oficial (`incidencia`: retícula 24, trazo 1,5, puntas redondas), el mismo en la hoja,
    en la cabecera del panel y en las listas;
  - el rail, la cabecera de la lista y el menú de la marca usan `IconoModulo`, con los iconos del juego.
- **Color:**
  - el relleno del pin es el color de su estado, de la lista cerrada D-24;
  - el perfil y el número van en Light `#faf9f5`;
  - el pin gris que aparece al hacer clic es `#72706b`;
  - el aro del pin abierto es Dark `#141413`;
  - en el CSS, solo tokens `--a-*`.
- **Letra:**
  - IBM Plex Sans en todo el panel; el número del pin en 600, peso que sí se carga desde `design/fuentes`;
  - los títulos de sección van en 13 px 600, sin mayúsculas, igual que `.mce-sec h3`.
- **Relieve:**
  - superficies, bordes y sombras con tokens (`--a-surface-*`, `--a-border-*`, `--a-shadow-sm`);
  - el anillo de foco de dos bandas (`--a-focus-ring`) en todos los botones del panel, también las miniaturas;
  - la «×» de un adjunto es un círculo de superficie elevada con borde, sin negro translúcido.

## Evidencia

**Pruebas:**

- `pytest backend/tests/test_observacion_del_plano.py test_marcas_con_enlace.py test_gap07_cliente_offline.py
  test_perfil_portal.py`: **139 pasan**. Incluyen tres del pin: se guarda y se devuelve; uno inválido da 400; sin pin, igual
  que antes.
- `node frontend-docs/pruebas/estadosDeIssue.prueba.mjs`: **7/7**.
- `node frontend-docs/pruebas/marcasConEnlace.prueba.mjs`: **11/11**.

**Banco local** (lector real y servidor real, sobre una base desechable):

- El estuche muestra «Incidencia» y ya no «Contar».
- Se creó una incidencia con pin, que volvió con `{"pagina":1,"p":[300.5,420.25]}`.
- En la lista se ve el pin numerado y «pág. 1».
- El detalle muestra la cabecera con el pin, las secciones Detalles, Descripción, Adjuntos y Actividad, las filas con
  Reasignar, Seguir y Cambiar, y «Ver en el plano».

**Con la hoja dibujada** (navegador visible, clics reales):

- «Incidencia» y un clic en la hoja abren el panel «Nueva incidencia» con «Pin en la hoja · Página 1». No viene ninguna
  marca elegida.
- Al crearla sale la ISS-002, y su pin 2 queda en la hoja justo donde se hizo el clic, junto al 1.
- Al hacer clic en el pin 1 se abre la ISS-001 en el panel, con el aro en su pin.
- El pin mide lo mismo en pantalla a cualquier zoom. La capa está en píxeles del dibujado y la escala se mide tras
  colocarla; en la primera medida salía a la mitad.
- La caja es de 34 px y el pin visible mide unos 18 × 26 px.

## Qué queda fuera

- Arrastrar un pin ya puesto para moverlo. ACC lo permite; aquí habría que añadir un acto `mover pin`.
- Pines en las incidencias de una marca: esas se ven en su marca.
- Filtrar los pines por estado o responsable en la hoja.

## 5 · Lo que vio el dueño en producción (2-nov-2026, noche) y cómo quedó

| Lo que dijo | Causa | Cambio |
|---|---|---|
| «Volví a entrar al archivo y no veo ni la nube ni el pin» | La capa de marcas esperaba a que **terminara** el dibujo del PDF. En un plano con ortofoto eso son decenas de segundos, y mientras tanto las teselas ya enseñan la hoja. | El lector da la medida de la página a la capa en cuanto la conoce, antes de dibujar (`PDFViewer.jsx`). En el banco el pin sale a ~3 s de recargar; antes, a ~11–15 s. |
| «Cuando se hace clic a la referencia no abre nada» | El chip «🔗 N» de la nube solo elegía la marca. | Ahora la elige y abre su lista de referencias (`pedido` en `BarraDeMarca`). |
| «Cuando le doy publicar se queda eso» | El menú seguía abierto, con el botón marcado. | Publicar o retirar cierra el menú: es un acto terminado. |
| «Cuando adjunto la foto solo se ve texto» | El alta listaba los adjuntos por su nombre. | El alta usa las mismas miniaturas que el detalle. |
| «No veo los estados de revisión» (al crear) | El estado inicial era un segundo botón. | Campo **Estado** arriba: «Abierta» o «Borrador», si la obra usa borradores. El botón dice «Crear» o «Guardar borrador». |
| «No hay forma de cambiar o pasar al otro» | Los pasos eran botones sueltos, y quien no los tenía no veía nada. | **El estado se cambia desde su chip**, como en ACC: un desplegable con los pasos que salen del estado actual. Los tuyos se eligen; los de otros se ven apagados con «lo da Luis». Los que piden motivo o prueba abren su formulario. Reglas en `pasosDeEstado` (`reglas.js`). |
| «El chat solo es cuando un usuario quiere comentar algo» | La actividad mezclaba comentarios e historial, con eventos en inglés («edited», «attached»). | La sección **Comentarios** tiene solo lo que escribe la gente. Debajo va el **Historial**, plegado y en español: dice qué se editó («la reasignó», «adjuntó foto.jpg»), con `textoDeEvento`. Un comentario no sale dos veces aunque se pulse dos veces. |
| «El lápiz, hagámoslo más profesional» (lista de Archivos) | Era un lápiz propio, de trazo 2 y en color de acento. | El icono «editar» del juego oficial (retícula 24, trazo 1,5), en gris y como botón con ayuda: «Cambiar el nombre». |
| «Levantó · 09:04 p. m.» frente a «levantada 04:04 p. m.» | `creado_en` es TIMESTAMP sin zona, en UTC (Cloud SQL), y se leía como hora local. | El panel lee una fecha sin zona como UTC. **En el banco local** la base desechable va en hora de Lima, así que allí sale 5 h atrás. |

**Pruebas:**

- Suite backend: 2582 pasan y 1 fallo previo, ajeno a esto (`test_reconstruccion_desde_cero`).
- Node: `estadosDeIssue` 9/9 (dos casos nuevos: pasos de estado y texto del historial) y `marcasConEnlace` 11/11.
- Build de Docs.
- Banco con clics y eventos reales:
  - Ana ve los pasos apagados con «lo da Luis» y solo Anular.
  - Luis pasa la incidencia a «En curso» y el pin cambia de color en la hoja.
  - Al comentar pulsando dos veces se guarda un solo comentario, y el historial va aparte.
  - El alta trae el campo Estado, y en «Borrador» el botón dice «Guardar borrador».
  - El chip de referencias abre la lista.
  - Retirar cierra el menú.

**Sin probar:**

- La miniatura en el alta: el banco no sube fotos. Es el mismo componente del detalle, que en producción sí la enseñó.
- El lápiz nuevo en la lista: el banco del lector no la tiene. Docs compila.

## 6 · Descartar un borrador, ocultar las anuladas y un panel más claro (2-nov-2026, noche)

El dueño preguntó si una incidencia se puede eliminar. La respuesta es que no: se anula. Aprobó dos cambios («ok
vamos») y pidió que el panel fuera «más profesional e intuitivo».

**Descartar un borrador.**

- Un borrador nunca llegó a nadie. Antes, «descartarlo» lo anulaba y quedaba «Anulada» **a la vista de toda la obra**.
- Ahora `POST /api/issues/<id>/descartar` hace un descarte lógico: solo su autor, solo si sigue en borrador.
  - La incidencia pasa a «Anulado» con el evento `discarded`.
  - Ninguna lectura la devuelve: la lista, el resumen, el detalle (404), las del plano y las de la marca
    (`flujo_de_issue.SQL_NO_DESCARTADA`).
- **No se borra la fila.** La aplicación no tiene DELETE sobre `doc_issues` desde el barrido de privilegios de la
  migración 26. Lo descubrió el banco: el primer intento con DELETE dio `permission denied`. Esa protección se queda.
- Lo enviado no se descarta (409): se anula, con su motivo.
- Techo de rutas del portal: 312 → 313.

**Un borrador del plano sin responsable.** El panel dejaba guardar un borrador sin responsable, pero el plano y la marca
respondían `SIN_RESPONSABLE`. Ahora se guarda, y el responsable se exige al enviarlo. Mientras falte, el panel lo dice y
no ofrece «Enviar».

**Los pines de las anuladas** ya no se clavan en la hoja; siguen en la lista del panel.

**El panel.** Antes los pasos eran enlaces diminutos al borde, la ubicación aparecía dos veces y no quedaba claro qué te
tocaba hacer. Ahora:

- **Cabecera:** el pin, el código y el tipo. La ubicación va en los detalles.
- **Línea de estado:**
  - el estado, como desplegable con quién da cada paso;
  - la fecha límite con su icono, en rojo si está vencida;
  - **Seguir / Siguiendo**, con campana.
- **«Lo que te toca»:** una tarjeta con borde del color del estado.
  - Si te toca a ti dice qué hacer, con el paso principal en negro y los otros al lado. Por ejemplo, «Te toca corregirla
    antes del 12 nov. 2026» con *Declarar corregida*, *Empezar* y *No procede*.
  - Si no te toca, dice a quién le toca y qué.
  - Cerrada o anulada, lo dice.
- **Detalles:**
  - el valor se pulsa para cambiarlo (Asignada a → reasignar, Clasificación); el lápiz aparece al pasar el ratón;
  - los observadores, como personas con sus iniciales y «+ Añadir / Cambiar»;
  - el pin, como una fila más («Página 1 · Ver en el plano»);
  - fuera «Tipo», que ya está en la cabecera.
- **Fotos y documentos:** mosaico de 88 px con una tesela «+ Añadir» que abre dos opciones: *Subir fotos* y *Documento
  de la obra*.
- **Comentarios | Historial:**
  - pestañas; los comentarios solo tienen lo que escribe la gente, y el historial es una línea de tiempo;
  - **la caja de comentar va fija abajo**, en una línea con el botón al lado, y crece si el texto es largo.

**Pruebas:**

- Suite backend: 2586 pasan y 1 fallo previo, ajeno (`test_reconstruccion_desde_cero`). Las nuevas:
  - descartar no borra la fila, pasa a «Anulado» con `discarded`, y solo si sigue en borrador;
  - lo enviado no se descarta;
  - el borrador ajeno no se descarta;
  - un descartado da 404 y la lista lo excluye;
  - un borrador del plano se guarda sin responsable;
  - el techo de rutas sube a 313.
- Node: 9/9 y 11/11.
- Build de Docs.
- Banco contra PostgreSQL real, como `ecd_app`:
  - el borrador desaparece de la lista, y leerlo da 404;
  - descartar algo enviado da 409;
  - un borrador del plano sin responsable se crea, y el envío lo frena;
  - desde el panel: «Descartar» → confirmar → vuelve a la lista y el pin desaparece.
- Panel en el banco:
  - como Ana (no le toca): «Le toca a Luis corregirla antes del 12 nov. 2026»;
  - como Luis: la tarjeta con *Declarar corregida / Empezar / No procede*;
  - el menú de «+ Añadir» ofrece sus dos opciones;
  - la pestaña Historial no muestra la caja de comentar.

## 7 · Comentarios en la nube (3-nov-2026)

Pedido: «en la nube, ¿hay forma de colocar comentarios? No crear su panel, sino colocarle comentarios».

Choca en apariencia con lo decidido el 20-oct (docs/ux/MARCAS_REVISION_LO_PROFESIONAL.md): entonces se quitaron los
comentarios de la marca *junto con* el estado libre y los asignados, porque los tres juntos eran una incidencia paralela,
y en aquella versión el autor de la marca podía borrar lo que habían escrito otros. Lo que se construye ahora es la
**opción B** de ese mismo documento, con sus garantías:

- **Solo se añaden.** Nadie edita ni borra un comentario, tampoco el autor de la marca. Cada uno queda con autor, id y
  hora (UTC).
- **Sin estado ni responsable.** Pedir una corrección con responsable y fecha sigue siendo «Crear observación».
- **Lo comenta cualquiera que vea la marca**: si está publicada, toda la obra; si es un borrador, solo su autor.

Cómo:

- **Ruta.** `POST /api/pdf/markups/<id>/comentarios` `{texto}` (1–2000 caracteres, hasta 200 por marca). Lleva la misma
  guardia de recurso que el resto de la marca.
- **Almacenamiento.** En `style.comentarios`, sin migración. Se añaden en la base con `||`, de modo que dos personas
  comentando a la vez no se pisan.
- **PATCH de la marca.** Conserva los comentarios que haya en la base (`style || {comentarios: los de la base}`). La
  respuesta no los devuelve y el lector se queda con los que tenía (`conSuConversacion`).
- **Duplicar y llevar a la vigente.** No copian la conversación: se queda en la original.
- **Menú de la marca.** Botón «Comentar» o «Comentarios (N)» con el icono `comentario` del juego. Despliega una NOTA
  DISCRETA de 240 px, no un panel. El dueño la vio grande: «solo para anotar… que no tape todo, que sea disimulado».
  - Cada comentario: autor y hora en 11 px, y el texto en 12 px. Si no es de hoy, sale la fecha corta; la completa
    va en el título.
  - La lista es de 128 px como máximo, con desplazamiento.
  - Abajo, un campo de una línea («Anotar un comentario…» / «Responder…») con una flecha para enviar; Enter también
    envía.
  - Sin texto de ayuda a la vista: «no se edita ni se borra» va en el título del campo.
- **Segunda vuelta del dueño:** «tapa la nube, y cuando le doy escape sigue viéndose, o cuando le doy clic afuera
  sigue viéndose».
  - La nota va DEBAJO de la nube (`bajoLaMarca`), no bajo el menú, que está encima.
  - Esc desde dentro del campo cierra la nota, y un segundo Esc deja la marca. Antes no llegaba: AISLADO para las
    teclas dentro del menú, a propósito, para que escribir no dispare los atajos.
  - Un clic fuera deja la marca, como en ACC. Arrastrar la hoja no cuenta.
  - Dos trampas de React:
    - el clic que abre el menú llegaba al documento después de montarse, y lo cerraba al instante;
    - `onCerrar`, nuevo en cada redibujo, quitaba y ponía el escuchador justo entre soltar el ratón y el clic.
  - Se arreglan registrando el escuchador tras un `setTimeout(0)` y guardando `onCerrar` en una ref.
  - Comprobado en el banco: abrir, Esc, Esc, clic fuera, arrastrar y comentar.
- **En la hoja.** Un distintivo con el número de comentarios, igual que el de referencias y a su izquierda. Al pulsarlo,
  se abre la marca en sus comentarios.
- **Colocación.** El menú y lo que despliega se corren a la izquierda si chocan con la columna de herramientas o con el
  borde de la ventana. Antes, el botón «Comentar» quedaba debajo de la columna.
- **Techo de rutas del portal.** Pasa de 313 a 314.

Evidencia:

- **Backend.** La suite da 2591 pasan y 1 falla; el fallo ya existía y no tiene que ver (`test_reconstruccion_desde_cero`).
  Pruebas nuevas:
  - se añade en la base con autor y fecha;
  - vacío y demasiado largo devuelven 400;
  - un borrador ajeno devuelve 404;
  - una marca llena devuelve 409;
  - el PATCH no pisa los comentarios;
  - duplicar y llevar no copian la conversación.
- **Docs.** El build pasa.
- **Banco con PostgreSQL real, como `ecd_app`:**
  - Luis comenta la nube publicada de Ana y Ana contesta;
  - Luis no puede comentar el borrador de Ana (404);
  - un comentario vacío da 400;
  - Ana cambia el color de su borrador ya comentado y el comentario sigue en la base.
- **Pantalla:**
  - el distintivo «2» en la hoja abre la nube en sus comentarios;
  - Luis comenta y el contador pasa a 3 en el menú y en la hoja;
  - al recargar como Ana, el comentario sigue y su menú completo queda fuera de la columna de herramientas.
