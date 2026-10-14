# Paleta oficial de Claude · definición cerrada — 14-oct-2026

> El propietario: «guarda la paleta oficial de Claude, la usaremos desde ahora» · «definamos bien la
> paleta oficial de Claude y sus derivados, para tomar una mejor elección».
>
> **Esta es la fuente de verdad del color de ALEPHIA** (decisión D-24 en `docs/AI_DECISIONS.md`).
> Lámina visual: `docs/ux/maquetas/paleta_oficial_claude.html` (banco `/paleta-claude.html`).
>
> **Por qué hacía falta:** los derivados se habían ido sacando sobre la marcha y aparecieron tonos
> sueltos. Por ejemplo, la barra del inicio en `#302f2e`, que es un derivado para líneas del modo
> oscuro y no para barras. Desde ahora solo existe esta lista.

## 1 · Método

- Cada derivado es **un color oficial mezclado con Light (para aclarar) o con Dark (para
  oscurecer), en porcentaje redondo**. Así cualquiera puede rehacerlo y comprobarlo.
- **Todo color que se use para texto alcanza 4,5:1 o más** sobre Light (WCAG AA).
- **Lista cerrada:** ningún color fuera de ella en la interfaz. La única excepción es el color que
  es dato: marcas de PDF y CAD, comparación de planos y gráficos.

## 2 · Los siete oficiales

Fuente: guía de marca de Anthropic, skill `brand-guidelines` del repositorio `anthropics/skills`.

| Nombre | Color | Uso |
|---|---|---|
| Dark | `#141413` | Texto principal, acción principal, fondos oscuros |
| Light | `#faf9f5` | Fondo de página, texto sobre oscuro |
| Mid Gray | `#b0aea5` | Deshabilitado, marcador de posición, icono inactivo (2,1:1: no es texto) |
| Light Gray | `#e8e6dc` | Bordes, separadores, fondos sutiles |
| Orange | `#d97757` | Acento principal, **la marca** (3,0:1: no es texto) |
| Blue | `#6a9bcc` | Acento secundario, **interacción** (2,8:1: no es texto) |
| Green | `#788c5d` | Acento terciario, **aprobado** (3,5:1: solo texto grande) |

## 3 · Neutros (de Light a Dark)

| Nombre | Color | Cómo se obtiene | Contraste | Uso |
|---|---|---|---|---|
| Blanco | `#ffffff` | Excepción: claude.com lo usa en tarjetas | — | Tarjetas, tablas, campos, diálogos |
| Light | `#faf9f5` | Oficial | — | Página |
| Light 50 | `#f1f0e8` | Light + 50 % Light Gray | — | Laterales, cabecera de tabla, hover |
| Light Gray | `#e8e6dc` | Oficial | — | Bordes, separadores |
| Gris 300 | `#cccac0` | Light Gray + 50 % Mid Gray | — | Borde fuerte, borde de botón secundario y de campo |
| Mid Gray | `#b0aea5` | Oficial | 2,1:1 | Deshabilitado, icono inactivo |
| Gris 500 | `#918f88` | Mid Gray + 20 % Dark | 3,3:1 (sobre Dark 04: 5,3:1) | **Solo en oscuro (View):** texto de apoyo sobre paneles oscuros. Añadido el 14-oct-2026 |
| Gris 600 | `#72706b` | Mid Gray + 40 % Dark | 4,7:1 | Texto de apoyo: fechas, códigos, metadatos |
| Gris 700 | `#52524d` | Mid Gray + 60 % Dark | 7,5:1 | Texto secundario: descripciones, etiquetas |
| Gris 850 | `#333330` | Mid Gray + 80 % Dark | 12,0:1 | Botón Dark al pasar el ratón |
| Dark | `#141413` | Oficial | 17,5:1 | Texto principal, botón principal |

## 4 · Modo oscuro (solo pantallas oscuras, como la de acceso)

| Nombre | Color | Cómo se obtiene | Light encima | Uso |
|---|---|---|---|---|
| Dark | `#141413` | Oficial | 17,5:1 | Fondo oscuro |
| Dark 04 | `#1d1d1c` | Dark + 4 % Light | 16,0:1 | Superficie elevada: campos, tarjetas oscuras |
| Dark 12 | `#302f2e` | Dark + 12 % Light | 12,7:1 | Líneas y bordes en oscuro, y **la barra superior** (decisión del propietario, §9) |

## 5 · Acentos

| Nombre | Color | Cómo se obtiene | Contraste | Uso |
|---|---|---|---|---|
| Orange | `#d97757` | Oficial | 3,0:1 | Marca: indicador activo, icono de enviar. **Nunca texto** |
| Orange tinte | `#f7ece5` | Light + 10 % Orange | — | Fondo de un aviso de marca |
| Orange 30D | `#9e5943` | Orange + 30 % Dark | 5,0:1 (blanco encima: 5,3) | **Botón de enviar** con texto blanco, texto naranja |
| Blue | `#6a9bcc` | Oficial | 2,8:1 | Anillo de foco, iconos informativos. **Nunca texto** |
| Blue tinte | `#ecf0f1` | Light + 10 % Blue | — | Selección suave: carpeta abierta, fila marcada |
| Blue borde | `#c8d8e7` | Light + 35 % Blue | — | Borde del chip «Compartido» |
| Blue 30D | `#507294` | Blue + 30 % Dark | 4,8:1 | Enlaces, texto «Compartido» |
| Green | `#788c5d` | Oficial | 3,5:1 | Barra de estado aprobado, iconos de éxito |
| Green tinte | `#e0e3d7` | Light + 20 % Green | — | Fondo del chip «Aprobado / Publicado» |
| Green 20D | `#64744e` | Green + 20 % Dark | 4,8:1 | Texto «Aprobado / Publicado» |

## 6 · Estados que la paleta oficial no trae (del sistema de la app de Claude)

| Nombre | Color | Contraste | Uso |
|---|---|---|---|
| Error | `#b93535` | 5,5:1 | Rechazado, eliminar, error |
| Error fondo | `#fbebeb` | — | Fondo de mensaje de error |
| Aviso | `#734500` | 7,7:1 | En revisión, por vencer |
| Aviso fondo | `#f9eeda` | — | Fondo de aviso |

**Total:** 7 oficiales + 16 derivados (Gris 500 se añadió para View) + 4 de estado = **27 colores**.

## 7 · Reglas de uso

1. **Más del 95 % de la pantalla es neutra.** Los acentos marcan algo concreto; nunca decoran.
2. **Acción principal en Dark**; al pasar el ratón, Gris 850.
3. **Orange solo para la marca:** el gesto de enviar (en Orange 30D, porque lleva texto) y el
   indicador de lo activo.
4. **Blue para la interacción:** foco (Blue), selección (Blue tinte) y enlaces (Blue 30D).
5. **Green para lo aprobado:** chip en Green tinte con texto Green 20D.
6. **Orange, Blue, Green y Mid Gray nunca se usan como texto.** Para escribir con ellos se usa su versión «D».
7. **Página Light, contenido sobre Blanco**, con bordes Light Gray y esquinas de 8 px.

## 8 · Aplicado al portal (14-oct-2026, en local, sin commit)

El propietario: «guardemos esa paleta y sus derivados, debemos combinar con todos esos».

- **1.579 valores en 70 ficheros** y la capa `tema-claude.css` llevados a la lista cerrada, con una segunda pasada estable.
- **Resultado:** 2.607 de los 2.621 colores del código están en la lista. Los otros 14 son siete colores de categoría (aqua y magenta), que se dejan a propósito.
- **Respaldo previo:** `respaldo/frontend-docs-src-antes-de-la-lista-cerrada.tar`.

Equivalencias aplicadas:

| Hoy en el portal | Pasa a | Por qué |
|---|---|---|
| `#5e5d59` texto secundario | Gris 700 `#52524d` | Derivado con método |
| `#6d6b67` texto de apoyo | Gris 600 `#72706b` | Derivado con método |
| `#d4d2c8` borde fuerte | Gris 300 `#cccac0` | Derivado con método |
| `#e6ecef` selección | Blue tinte `#ecf0f1` | Derivado con método |
| `#c6613f` botón de enviar | Orange 30D `#9e5943` | El de antes daba 3,9:1 con texto blanco: no llegaba a AA |
| `#667650` / `#e8eaE0` aprobado | Green 20D `#64744e` / Green tinte `#e0e3d7` | Derivado con método |
| Barra del inicio `#302f2e` | Opción A o B (abajo) | Dark 12 es para líneas, no para barras |
| Otros tonos sueltos (`#222220`, `#f5f4ee`, `#efede5`, `#fcfcfa`, `#3b5674`, `#4d5a3c`…) | El derivado más cercano de la lista | Lista cerrada |

## 9 · Barra superior: DECIDIDO · Dark 12 `#302f2e` (14-oct-2026)

**Cambio del mismo día.** El propietario: «el gris lo confundo mucho con lo que está en la pantalla.
Mejor pasémoslo a un tono Dark 12 #302f2e: lo veo mejor, y resalta». La barra Mid Gray se parecía a
las cabeceras y los laterales grises del contenido. Dark 12 la separa claramente.

- Barra `#302f2e` en el inicio, la lista de proyectos y Archivos.
- Logo y símbolo en Light: `ALEPHIA_*_Light.svg`, que son las versiones blancas del manual con
  `#FFFFFF` → `#FAF9F5`.
- Texto Light (12,7:1); enlaces del inicio en Light Gray.
- «Docs» en Light, con la línea divisoria en Gris 600.
- Selectores hundidos en Dark 04 `#1d1d1c` (como los campos del acceso), en Dark al pasar el ratón,
  con etiqueta pequeña en Mid Gray.
- Buscador Light y avatar Light con iniciales en Dark.

### Antes · C · Mid Gray (elegida y sustituida el mismo día)

Aplicada en el inicio (`HubPage`), la lista de proyectos (`SecureProjectsPage`), por las variables de `pages/entradaGris.css`, y en Archivos (`BarraSuperior`), por `tema-claude.css`. Detalle:
- logo en tinta;
- «Docs» en Dark;
- selectores en Gris 300;
- avatar Dark;
- página Light y tarjetas blancas con borde Light Gray.

### Opciones que se mostraron

El propietario: «podría ser, en vez de Dark, Mid Gray, algo así, que se asemeje». La lámina (sección 7 bis) muestra seis opciones, todas de la lista:

| Opción | Barra | Texto encima |
|---|---|---|
| A | Light + línea Light Gray | Dark |
| B | Dark | Light |
| C | **Mid Gray** `#b0aea5` | Dark (8,3:1) |
| D | Gris 300 `#cccac0` | Dark (11,2:1) |
| E | Gris 600 `#72706b` | Light (4,7:1) |
| F | Gris 700 `#52524d` | Light (7,5:1) |

- **A · Clara (recomendada):** Light con una línea Light Gray debajo, como el ejemplo de referencia
  y como la barra de Archivos.
- **B · Oscura:** Dark oficial `#141413`.

La misma barra iría en el inicio, en la lista de proyectos y en Archivos.

## 10 · Pulido de identidad (14-oct-2026, en local, sin commit)

El propietario: «combínalos de la mejor manera, que se vea bien presentable, porque esto quedará con
nuestra identidad mucho tiempo». Solo aspecto: misma estructura, mismos textos, mismas funciones.

### Cuatro reglas de composición (se suman a las de §7)

1. **Títulos de página** a 24 px y peso 400. Antes eran de peso 300 y se leían desvaídos.
2. **Lo activo se marca con una raya Orange de 2 px**: pestañas y menú de herramientas. El texto
   activo sigue en Dark y en negrita. Es el único sitio, junto con el botón de enviar, donde aparece
   la marca.
3. **Esquinas:** 8 px en botones, campos, tarjetas y tablas; 4–6 px en chips y filas. **Nada en
   píldora.**
4. **Toda tabla es una tarjeta blanca** con cabecera en Light 50 y borde Light Gray.

### Qué cambió, pantalla por pantalla

| Pantalla | Antes | Ahora |
|---|---|---|
| Archivos | Barra de herramientas de 32 px fijos: los botones se salían por arriba y tocaban el borde | Altura natural, con aire arriba y abajo |
| Archivos | Columna fija con sombra: dibujaba dos rayas grises (casilla y Nombre) | Una sola línea Light Gray tras Nombre; cabecera fija en Light 50, sin costura |
| Archivos, Proyectos | Raya de la pestaña activa en Dark | En **Orange** |
| Archivos, Transmittals, Conjuntos, Participantes, Búsqueda, Actividad, Configuración | Títulos de peso 300 | Peso 400 |
| Revisiones | Filtros en píldora; tabla suelta sobre la página; «En revisión» y «Aprobada» en negro | Filtros con esquina de 8 px; tabla en tarjeta blanca; el estado se escribe en el color de su barra (Aviso, Green 20D), como ya lo hacía «Rechazada» |
| Proyectos | Cabecera de la tabla en blanco; esquinas de 4 px; borde de campo y botones en Mid Gray | Cabecera en Light 50; esquinas de 8 px; bordes en Gris 300 |
| Inicio | Fichas y «Mi trabajo» con esquina de 4 px; etiquetas de 2 px | 8 px y 4 px |
| Botón de enviar | Al pasar el ratón se aclaraba a Orange con texto blanco (3,0:1, ilegible) | Se queda en Orange 30D y gana un halo Orange tinte |

### Ficheros

- `tema-claude.css`: bloque «PULIDO DE IDENTIDAD».
- `pages/entradaGris.css`: `--eg-indicador`, esquinas, cabecera, bordes.
- `pages/HubPage.jsx`, `components/MiTrabajo.jsx`: esquinas.
- `pages/FilesPage.jsx`: pestañas con `var(--a-indicador)`.
- Pesos de los títulos en `pages/FilesPage.jsx`, `BusquedaGlobalModule`, `ParticipantesModule`,
  `SetsModule`, `TransmittalsModule` y `modals/MoveModal`.

### Verificado

- Capturas reales con Chrome sin ventana (CDP) de inicio, proyectos, Archivos y Revisiones.
- La captura simple (`--screenshot`) cortaba la lista de Archivos unos 95 px antes del final.
  **No es un defecto del portal:** medido por CDP, la lista ocupa su tarjeta entera (491 px, 10 filas).
- El banco se reconstruyó y las maquetas se volvieron a colocar.

### Queda para decidir (no es solo aspecto)

- En Proyectos, «Creado el» muestra fecha, hora y segundos, y se corta con «…». Mostrar solo la fecha
  cambiaría el dato que se ve, así que se deja a tu decisión.

### Una sola marca en la barra de Archivos (14-oct-2026)

El propietario: «¿por qué arriba tenemos el logo y luego el logo y el nombre?». En Archivos salían el
símbolo suelto (botón Inicio) y, al lado, el logo, que lleva el mismo símbolo. Ahora el logo y «Docs»
forman **un solo botón de Inicio**, igual que en la lista de proyectos. El logo mide 26 px en esta barra
de 46 px; en proyectos mide 28 px en una de 48. Por debajo de 1.100 px de ancho queda solo el símbolo.
La función no cambia. Ficheros: `components/BarraSuperior.jsx` y `.css`.

## 11 · Identidad en todo: View, píldoras e iconos (14-oct-2026, en local, sin commit)

El propietario: «hagamos todos los cambios en todo lo demás combinando coherentemente, tanto en Docs como en
frontend-react, es hora de tener nuestra identidad. Y también diseñemos nuestros propios iconos: copiemos el
estilo de Claude, pero para ingeniería u obras».

### View (frontend-react) usa el modo oscuro de la paleta

| Pieza | Antes (Ink / Navy / Signal) | Ahora |
|---|---|---|
| Fondo | Ink `#0B0E12` | Dark `#141413` |
| Paneles y controles | `#13191F`, `#111925` | Dark 04 `#1d1d1c` |
| Superficie elevada y líneas | `#18212A`, `#24384C` | Dark 12 `#302f2e` |
| Marca (Navy) | `#153754` | Dark 12: Navy deja de existir en la interfaz |
| Interacción (Signal) | `#3E6F91` | Blue `#6a9bcc` (texto, borde y foco: 5,8:1 sobre oscuro) |
| Relleno Blue | Con texto blanco | Con texto Dark (6,3:1); el blanco daba 2,8:1 |
| Texto de apoyo | `#888`, `#AAB3BC` | Gris 500 `#918f88` y Mid Gray |
| Lo activo | Raya blanca | Raya Orange |

Piezas que cambian:
- **Entrada:** barra Dark 12, página Light, tarjetas blancas y acción Dark, igual que Docs.
- **Acceso:** el mismo que el de Docs; botón Light con texto Dark.
- **Logos:** en Light.

Cómo se hizo:
- **Capa de tokens:** `frontend-react/src/tema-claude.css`, importada en `index.css`. Quitar esa línea devuelve
  los tokens de antes.
- **Barrido:** 1.108 valores en 55 ficheros, **solo neutros y azules de interfaz**. Una segunda pasada cambia 0.
- **Turquesas y degradados de botones:** pasan a Blue liso.

Lo que no se tocó:
- **Nada del color que es dato:**
  - las paletas, es decir, toda lista de tres colores o más entre comillas: temas de color, filtros,
    Heatmap y gráficos;
  - lob4d, dashboard, `lib/`, `aps/`, `native/` y `utils/`;
  - la sección, el perfil, el avance, el presupuesto y el movimiento de tierras;
  - los rojos, ámbar y verdes de estado.
- **Ni los protegidos ni `Viewer.jsx`**, que tiene trabajo ajeno sin commitear.

**Respaldo:** `respaldo/frontend-react-src-antes-de-la-paleta.tar`.

### Docs: coherencia final

- **Sin píldoras:**
  - el chip de estado («Compartido», «Publicado»…) pasa a 4 px;
  - campos de búsqueda, botones de compartir, chips de personas, filtros de Incidencias y el lector, a 6–8 px.
- **Ningún acento como texto:** 69 textos en Mid Gray (2,1:1) pasan a Gris 600; el «Blue» de un chip de
  Incidencias pasa a Blue 30D.

### Iconos de obra

Lámina: `docs/ux/maquetas/iconos_obra_v1.html` (banco `/iconos-obra.html`). Fuente única para Docs y View:
`design/iconos/iconos-obra.json`, con **60 iconos**:
- 24 herramientas de Docs;
- 24 de obra e ingeniería: zanja, perfil, alineamiento, topografía, corte y relleno, tubería, buzón, gavión,
  acero, cota, PK, estación total, casco, cono, grúa, maquinaria, dron, AR, 4D, 5D, predicción…;
- 6 del visor;
- 6 acciones.

Estilo de Claude:
- línea de 1,5 sobre retícula 24;
- puntas redondas;
- sin relleno;
- un solo color.

**APROBADOS el 14-oct-2026** («sí, queda así por ahora, guárdalo»). **Aplicados en Docs** el mismo día: `components/IconoModulo.jsx` lee `design/iconos/iconos-obra.json`, así que el menú de herramientas, el árbol y las carpetas de la tabla los usan. En View, todavía no.

### Verificado

- **Capturas** de entrada, acceso, panel de Filtros, Inventario y comparador de View, y de Archivos y
  Revisiones de Docs.
- **Builds de los dos** sin errores.
- **Bancos del visor:** capturarVistaV2 63/63, restaurarVistaV2 150/150, savedViewV2 111/111,
  inventoryConfig 20/20, frenteDeVistas 20/20.
- **Pendiente:** el espacio de trabajo del visor con un modelo cargado necesita la sesión del propietario
  (`localhost:5173`).

## 12 · View en claro, con la barra en Dark 12 (14-oct-2026, en local, sin commit)

**Sustituye al modo oscuro de §11.** El propietario: «no me gusta mucho el dark en barras y fondo de
paneles». Ante la lámina `docs/ux/maquetas/view_claro_v1.html` (banco `/view-claro.html`), eligió
«Dark 12 #302f2e»: la barra como en Docs y todo lo demás claro.

| Pieza | Ahora |
|---|---|
| Barra superior | Dark 12, avatar Light y lo activo con raya Orange |
| Página | Light |
| Paneles | Blanco |
| Laterales, cabeceras y hover | Light 50 |
| Líneas | Light Gray y Gris 300 |
| Texto | Dark, con Gris 700 y Gris 600 |
| Interacción | Blue 30D; los rellenos llevan texto blanco (4,9:1) |
| Casillas | Gris 600, y Blue 30D si el filtro está activo |
| Controles nativos | `color-scheme: light`; antes, con Windows en oscuro, las casillas salían negras |
| Paneles de Autodesk | `light-theme` |
| Lienzo 3D | Light 50 `rgb(241,240,232)` |

**Cómo se hizo:** `invertir_view.py` invierte los colores **por propiedad** dentro de cada regla u objeto de
estilo:
- fondo oscuro → claro;
- texto claro → oscuro;
- línea oscura → Light Gray;
- blanco translúcido → tinta translúcida;
- panel oscuro semitransparente → blanco con la misma opacidad.

Si la regla tiene un fondo de color, su texto blanco no se toca. La segunda pasada no cambia nada.

- **Cambios:** 1.196 en el primer paso y 136 en el segundo (líneas con llaves anidadas y colores que se
  asignan al pasar el ratón).
- **Respaldo:** `respaldo/frontend-react-src-antes-de-view-claro.tar`.

**Sigue oscuro, a propósito:**
- la barra inferior del visor (`ViewerLabelsBar`, protegida: trabajo 4D del propietario), con los chips
  Revit (`LinkRevitBadge`) y Corte (`SectionCutTool`);
- la realidad aumentada y la cámara (van sobre la imagen de la cámara);
- el color que es dato.

**Verificado:**
- **Capturas** del panel de Filtros y de Inventario (banco `probar-panel.html`, pasado a claro) y del comparador.
- **Build** sin errores.
- **Bancos del visor:** 364/364.

**Pendiente:** el espacio de trabajo con un modelo cargado, con la sesión del propietario.
