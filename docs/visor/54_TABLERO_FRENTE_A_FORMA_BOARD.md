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

