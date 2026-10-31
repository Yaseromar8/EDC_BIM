# 54 · Nuestro Tablero frente a Forma Board (los «Tableros» de ACC): funcionalidad por funcionalidad

30-oct-2026. El dueño pidió revisar a fondo cada funcionalidad de los Tableros de ACC, manipulándolos, «para poder llegar nosotros también a esa calidad».

**Cómo se midió:**
- **En el tablero real de ACC** (CONSTRUCCIÓN D06), solo lectura. Se leyó la configuración del motor desde el árbol de React y el zoom con la rueda. El guardián de seguridad impidió crear notas: es un proyecto real y compartido, y esa negativa se respetó. La vista del dueño se dejó como estaba.
- **La manipulación**, en **tldraw.com**: es la demo pública del mismo motor (Forma Board está construido sobre tldraw) y queda solo en el navegador. Lo creado se borró al terminar.

## 1 · Qué tiene Forma Board

**Motor:** tldraw. **Interfaz:** su sistema de diseño Weave. **Límites:** 4.000 formas por página y 40 páginas.

**Herramientas (17):** seleccionar, mano, borrador, puntero láser, zoom, texto, lápiz, resaltador, formas geométricas, línea, flecha, marco, nota, nota de Forma, **kanban**, sticker de voto y comentario.

**Formas propias de Autodesk** (además de las de tldraw: texto, dibujo, formas, nota, línea, flecha, marco, imagen, vídeo, marcador, embebido y grupo):
- **Documentos de ACC en vivo:** `docs-pdf`, `docs-image`, `docs-autocad`, `docs-rvt`, `docs-rvt-sheet`, `docs-viewer` y `docs-review`.
- **Datos de obra:** `forma-issue-widget` (incidencias), `forma-kanban-widget`, `forma-link-widget` e `iframe-widget`.
- **Análisis de Forma:** sol, viento, microclima, cifras clave, propuesta, foto fija, diseño de calle, placa solar y comparación de imágenes con IA.

**Barra izquierda:** Site Design, Data Management («Añadir archivos de Data Management», con los vistos recientemente), Incidencias (elegir incidencias o crear una), Imagen, Buscar, deshacer y rehacer.

**Comportamiento fino** (configuración leída del motor):

| Qué | Valor |
|---|---|
| Rueda | Zoom **×1,10 por muesca, instantáneo** (en un solo fotograma) y anclado al cursor (medido en ACC) |
| Botones y atajos de zoom | Escalones 1 · 10 · 25 · 50 · 75 · 100 · 125 · 150 · 200 · 400 %; animaciones de 320 ms |
| Mover el lienzo | Mano, **barra espaciadora** y **clic derecho**; inercia al soltar (fricción 0,09) |
| Arrastrar | Empieza a partir de 4 px; desplaza solo el lienzo al acercarse al borde |
| Imanes | A 8 px, con guías de alineación entre objetos; rejilla de 10 px que se activa a voluntad |
| Doble clic en el vacío | Crea un texto |
| Muchos objetos | Con más de 500, al hacer zoom se dibujan en versión ligera |
| Contacto táctil | Pulsación larga de 500 ms; asas e impacto más grandes para el dedo |
| Ayudas | Aparecen a los 700 ms |

## 2 · Lo que se manipuló (tldraw.com, el mismo motor)

| Acción | Cómo responde |
|---|---|
| Crear nota | Herramienta → clic: la nota aparece **lista para escribir**, sin otro clic |
| Seleccionar | Contorno azul fino y asas pequeñas. Aparecen a la vez un **panel de estilo** a la derecha (12 colores, opacidad, tamaños S/M/L/XL, 4 letras, alineación) y una **barra de acciones rápidas** (deshacer, rehacer, borrar, duplicar, comentar, más) |
| Punto lateral de la nota | Crea **otra nota al lado**, a 10 px y alineada, lista para escribir: así se hace una fila de notas en segundos |
| Clic derecho sobre un objeto | Comentario · Editar ▸ · Reordenar ▸ · Mover a página ▸ · Cortar / Copiar / Pegar / Duplicar / Eliminar (con su atajo) · Copiar como ▸ · Exportar como ▸ · Seleccionar todo |
| Clic derecho con dos objetos | Un solo recuadro con 4 asas; aparece **Organizar ▸** (alinear, distribuir, apilar). Editar ▸ trae Agrupar, Aplanar (⇧F), Enmarcar selección y Bloquear (⇧L) |
| Menú de zoom | Acercar (Ctrl +), Alejar (Ctrl −), Zoom a 100 % (⇧0), Zoom para ajustar (⇧1), Zoom a la selección (⇧2) |
| Ctrl+A y Supr | Selecciona todo y lo borra (deshacible con Ctrl+Z) |

## 3 · Nuestro Tablero hoy, frente a eso

| Funcionalidad | Forma Board | Nuestro Tablero |
|---|---|---|
| **Gráficas vivas del modelo** (aislar y pintar en 3D, auditoría frente al itemizado, vistas, PNG/PDF, enlace) | **No tiene** | **Sí**: es nuestro valor |
| Zoom con la rueda | ×1,10, instantáneo, anclado | ×1,14 (`exp(-Δ·0,0013)`), anclado, entre 20 % y 220 % — equivalente |
| Menú de zoom (100 %, ajustar, a la selección) y atajos | Sí | Solo + / − / encuadrar |
| Mover con espacio o clic derecho, con inercia | Sí | Solo arrastrando el fondo; sin inercia |
| Imanes | Guías entre objetos (8 px) y rejilla opcional | Solo rejilla fija de 16 px |
| **Selección múltiple** (marco de selección, Mayús+clic) | Sí | **No** |
| **Deshacer y rehacer** (Ctrl+Z / Ctrl+Y) | Sí | **No** |
| **Menú contextual** | Sí, completo | **No** |
| Duplicar, copiar y pegar | Sí (Ctrl+D, C, V) | **No** |
| Alinear, distribuir, agrupar, bloquear | Sí | Solo «Ordenar» la sección entera |
| Atajos de teclado (V, H, N, T, Supr…) | Sí | **No** |
| Notas, texto libre, flechas, formas, imagen | Sí | **No** (solo secciones con título) |
| Documentos de ACC e incidencias en el tablero | Sí | **No** (son nuestras de Docs) |
| Editar con doble clic | Sí | Sí (añadido hoy) |
| Comentarios y colaboración en vivo (cursores) | Sí | No |
| Presentar | Sí | Vistas fijadas: es nuestro equivalente |

## 4 · Plan para llegar a esa calidad sin cambiar de motor

Por orden de uso real; cada paso por separado, probado en el banco antes de pasar al siguiente.

1. **Lo básico de un editor** (lo que más se nota):
   - selección múltiple con marco y Mayús+clic;
   - Supr para borrar;
   - **Ctrl+Z / Ctrl+Y** (historial de cambios del lienzo);
   - Ctrl+D para duplicar y Ctrl+C / Ctrl+V;
   - Ctrl+A para seleccionar todo;
   - Escape para soltar la selección.
2. **Menú contextual** como el de tldraw: Editar, Duplicar, Eliminar, Copiar como imagen, Bloquear, Llevar al frente o atrás y Organizar (alinear y distribuir), con sus atajos a la vista.
3. **Guías inteligentes al arrastrar:** líneas que aparecen al alinear bordes o centros con otra tarjeta, con imán a 8 px. Además: barra espaciadora o clic derecho para mover el lienzo, e inercia.
4. **Menú de zoom:** 100 %, ajustar a todo y a la selección (⇧0, ⇧1, ⇧2).
5. **Piezas de pizarra:**
   - nota con su punto lateral para crear la siguiente;
   - texto libre con doble clic en el vacío;
   - imagen o PDF pegados o arrastrados (a una carpeta `TABLERO/` de Docs);
   - flecha entre tarjetas.
6. **Datos de obra como tarjetas:** un documento de Docs o una incidencia, como hace Forma Board con ACC.

No hace falta licencia de tldraw: desde la versión 4 es comercial de pago. Todo esto cabe en el lienzo propio, que ya tiene la cámara, las tarjetas y las vistas.

## 5 · Paso 1 hecho (30-oct, noche): pantalla completa, cámara rápida, selección y teclado

**El dueño:** «que al hacer clic en Tablero use toda la pantalla; más adelante veremos un botón que lo coloque a la derecha. La idea es replicar su velocidad y la experiencia de navegación».

**Pantalla completa.** El tablero va de la barra lateral del visor (64 px) al borde derecho, por encima del 3D. Se anuncia 0 a App.jsx, así que **el 3D no se redimensiona nunca** (redibujarlo cuesta ≈ 220 ms, §7 del doc 52). El panel acoplado a la derecha (55 % / 70 % con doble búfer) queda en `53f2a2b4` para el futuro botón «acoplar».

**Cámara, como tldraw.**
- Mover y hacer zoom cambia el DOM directamente (transformación del contenido y fondo de la cuadrícula) **sin pasar por React**. Antes, cada movimiento redibujaba todas las tarjetas. React se entera cuando la cámara se queda quieta 180 ms, y entonces las gráficas se re-rasterizan nítidas.
- **Rueda:** ×1,10 por muesca, instantánea y hacia el cursor; Ctrl + rueda (pellizco del panel táctil) da zoom continuo; zoom entre 10 % y 400 %.
- **Mover el lienzo:** **barra espaciadora + arrastrar, clic derecho o botón central**, con **inercia** al soltar (fricción 0,09).
- **Arrastrar el fondo con el botón izquierdo dibuja un marco de selección**: selecciona las tarjetas que toca y las secciones que quedan enteras dentro.
- **Encuadres animados** (320 ms, suaves): ajustar a todo, a la selección y a 100 %. Ctrl + y Ctrl − van por los escalones 10 · 25 · 50 · 75 · 100 · 125 · 150 · 200 · 400 %.
- **Menú de zoom** en el porcentaje: Acercar, Alejar, Zoom a 100 % (⇧0), Ajustar a todo (⇧1), Zoom a la selección (⇧2), más una ayuda de los gestos.

**Selección y edición.**
- Clic selecciona; Mayús+clic suma o quita. Contorno azul en tarjetas y secciones.
- Arrastrar la cabecera de una tarjeta o el asa de una sección mueve **todo lo seleccionado** (las secciones, con sus tarjetas). Empieza a partir de 4 px.
- **Teclado** (con el foco en el tablero, sin escribir en un campo):
  - Supr o Retroceso: borrar;
  - **Ctrl+Z / Ctrl+Y (o Ctrl+Mayús+Z)**: deshacer y rehacer, hasta 100 pasos; un arrastre cuenta como un paso;
  - Ctrl+D: duplicar;
  - Ctrl+C / Ctrl+V: copiar y pegar, desplazado 32 px por cada vez que se pega;
  - Ctrl+A: seleccionar todo; Esc: soltar la selección;
  - flechas: empujar la selección 16 px (64 px con Mayús).
- El panel lleva `data-escape-propio` para que el visor no se quede con Escape.

**Medido** con Chrome sin ventana, la sesión del dueño y su GPU, en el Frente Canal, el tablero real (31 tarjetas) y los guardados bloqueados:

| Prueba | Resultado |
|---|---|
| Rueda: 8 muescas hacia dentro y 8 hacia fuera | 34 % → 72 % → 34 % (×1,10 cada una); **7 ms por fotograma de media, máximo 14, ninguno lento, ninguna tarea larga** |
| Clic derecho + arrastrar 400 px y soltar con velocidad | El lienzo se movió 400 px y **siguió deslizándose 90 px** por inercia; sin el menú del navegador; 6,9 ms de media, máximo 15, ninguno lento |
| Marco de selección | Selecciona las tarjetas que toca |
| Supr → Ctrl+Z → Ctrl+Y → Ctrl+Z | 31 → 29 → 31 → 29 → 31 tarjetas |
| Ctrl+A → Ctrl+D → Ctrl+Z | 31 seleccionadas → 62 tarjetas → 31 |
| Ctrl+C, Ctrl+V → Ctrl+Z | 62 → 31 |
| ⇧1, Ctrl +, Ctrl −, ⇧0 | 10 % (el contenido mide ≈ 8.700 px de alto), 25 %, 10 %, 100 % |
| Guardados | Todos bloqueados en la pestaña: el tablero de producción no cambió |

**Siguen:** el paso 2 (menú contextual) y el 3 (guías inteligentes al arrastrar), según §4.

## 6 · Aspecto y piezas de pizarra (30-oct, noche)

**El dueño, comparando con sus capturas de Forma Board:**
- «sus selecciones son más profesionales y fluidas; las nuestras, toscas»;
- «su mundo es más grande y profundo»;
- «sus iconos son de líneas finas»;
- «lo de abajo no lo tenemos».

Además sugirió revisar tldraw, Excalidraw y dos clones de Miro:
- **tldraw:** ya es la referencia; su licencia es comercial, no se copia código.
- **Excalidraw:** MIT, para comparar.
- **Los clones de Miro:** proyectos didácticos en Next.js y Liveblocks, sin nada que tldraw no muestre.

**Hecho:**
- **Mundo profundo.**
  - Zoom del **1 % al 400 %**; los escalones de Ctrl + y Ctrl − son los de tldraw (1 · 10 · 25 · 50 · 75 · 100 · 125 · 150 · 200 · 400 %).
  - Cuadrícula **por niveles**: celda de 32 px × 4ⁿ que en pantalla queda entre 12 y 48 px; la línea menor se desvanece y la mayor toma su lugar, así hay rejilla a cualquier zoom.
- **Selección fina.**
  - Contorno de 1,5 px que no cambia con el zoom (`calc(1.5px / var(--s))`, y `--s` lo pone la cámara).
  - Asas blancas cuadradas en las esquinas; la de abajo a la derecha cambia el tamaño de una tarjeta o sección (ya no hay esquinas en L).
  - Realce suave al pasar el ratón.
  - Con varios elementos, un recuadro común.
  - Marco de selección azul tenue.
- **Barras flotantes** (`PiezasLienzo.jsx`):
  - **abajo**, las herramientas: Seleccionar (V), Mano (H), **Nota (N)** (el taco con el color de la próxima y 6 colores), **Texto (T)** y **Sección (F)**, que se dibuja arrastrando o, con un clic, sale de 640 × 400;
  - **a la izquierda**, los datos: **Gráfico** y **Parámetros**, como Data Management e Incidencias en Forma Board; debajo, **deshacer y rehacer**;
  - **abajo a la derecha**, la **píldora de zoom** «− % ▾ +»; su menú incluye bloquear las tarjetas.
  - La cabecera queda con Ordenar, Limpiar 3D y cerrar.
- **Iconos** con trazo de 1,5.
- **Notas y texto.**
  - La nota mide 200 × 200, sale **lista para escribir** y su letra se ajusta sola.
  - Con una nota seleccionada aparecen **cuatro puntos laterales** que crean la siguiente nota a 10 px, alineada y lista para escribir.
  - **Doble clic en el vacío** crea un texto; un texto vacío no se queda.
  - Doble clic o Intro sobre una nota la edita.
  - Se guardan en **`config.notas`**, aparte de `charts`, para que el visor publicado (que no las conoce) no intente dibujarlas como gráficas.
  - Las acciones de selección, borrar, copiar, pegar, empujar, encuadrar y deshacer incluyen las notas.

**Medido** con Chrome sin ventana, la sesión del dueño y los guardados bloqueados:

| Prueba | Resultado |
|---|---|
| Nota (botón) → clic → escribir | «Partida 03.05» |
| Punto lateral derecho → escribir | Segunda nota «Partida 03.06», al lado |
| Doble clic en el vacío → escribir | Texto «Revisión Canal» |
| Ctrl+Z × 3 → Ctrl+Y | Deshace por pasos y rehace |
| 45 muescas de rueda | El zoom llega al 1 %, con cuadrícula |

**Fallo encontrado y arreglado:** al crear una nota con un clic, el navegador movía el foco al panel justo después y la nota dejaba de editarse; quedaba vacía. Se arregló con `preventDefault` al crear.

## 7 · Segunda visita a Forma Board, usándolo (30-oct, noche)

**El dueño:** «navega y utiliza, no tengas miedo». En su tablero «Sin título» se pudo **mirar, pasar el ratón, abrir menús y seleccionar**. **Crear** una nota volvió a bloquearlo el guardián del entorno (proyecto real, compartido), aun con su permiso. Al terminar, el tablero tenía 15 elementos, los mismos que al empezar; la vista del dueño se restauró.

**La barra de abajo, medida:**
- caja de **663 × 48 px**, blanca, radio 8, **sin borde**, sombra `0 0 16px rgba(0,0,0,.12)`, relleno 0 12 px y **12 px entre botones**;
- botones de **32 × 32**, radio 6, **iconos de 24 px a trazo 1**; el activo, fondo `#006EAF` con el icono en blanco;
- el **taco de notas** es una ilustración de 121 × 115 px que sobresale y **se levanta** al pasar el ratón; la plumilla también;
- **Sticker** es una imagen («+1» en pastilla morada); los desplegables son botones de 12 × 32 con ▾;
- al pasar el ratón, **etiqueta oscura con el atajo**: «Nota N», «Plumilla P», «Sticker I», «Añadir vista Kanban K».

**Desplegables:**
- **Formas:** 20, en rejilla de 7 (nube, rectángulo, elipse, triángulo, rombo, pentágono, hexágono, octógono, estrella, romboide, trapecio, óvalo, flechas, casilla con X o con ✓, corazón).
- **Marco:** Personalizado · 16:9 · 4:3 · 1:1 · A4 · A4 horizontal · Carta · Carta horizontal.

**La tarjeta de un DWG** (`docs-autocad`):
- guarda la **versión** (`versionId`) y el **documento** (`itemId`, el linaje), la página (`pageNumber` de `documentLength`), el nombre, el número de versión, la fecha, sus miniaturas y qué mostrar (nombre, versión, fecha, icono, datos, sombra);
- **carga por calidades**: se ve borrosa y se afina;
- al seleccionarla sale una **barra contextual debajo**: candado · V1 ▾ · Abrir en AutoCAD Web · Extraer modelo 3D · IA · comparar · ◀ 3/4 ▶ · pantalla completa · ⋮;
- encima se ven las anotaciones del dueño: nube, flecha, resaltador y nota «120M2».

**Otros:**
- hay una **tarjeta de incidencia** (#132 · PAISAJISMO_VARIOS · General · Gestión de cambios · Sin fecha límite);
- el «3D» rojo es una **imagen**, no un visor vivo.

**Lo replicado en nuestra barra** (`PiezasLienzo.jsx`):
- las mismas medidas (48 px, radio 8, sombra difusa, 12 px, botones de 32 con iconos de 24 a trazo 1, activo `#006EAF`);
- el **taco de notas en ilustración** que sobresale y se levanta;
- la **etiqueta oscura con el atajo**;
- **Sección ▾ con los mismos tamaños**: crea la sección centrada, la selecciona y la encuadra (una «página» A4 lista para fijar como vista);
- la paleta izquierda y la píldora de zoom pasan a la misma caja y a iconos de trazo 1.

**Fallo encontrado y arreglado:** tras usar un menú, el botón pulsado desaparece, el foco cae al documento y Ctrl+Z dejaba de responder. Los atajos se escuchan ahora en la ventana mientras el tablero está abierto, si el foco está en el tablero o en ninguna parte.

**Comprobado** con Chrome sin ventana y los guardados bloqueados:
- la barra, la etiqueta «Nota N» y el menú de tamaños;
- A4 crea la sección y **Ctrl+Z la deshace**;
- notas con sus puntos laterales, texto, Ctrl+Z × 3 y Ctrl+Y, y zoom al 1 %.

