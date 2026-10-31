# 60 · Tableros: notas que se escalan y formas (nube de revisión)

31-oct-2026. El dueño, comparando con su panel de ACC: «las notas se pueden agrandar o reducir, ¿por qué el nuestro
no? ¿Por qué sus herramientas tienen nube y el nuestro no?», y después: «todo debe ser con profesionalismo».

## 1 · Qué hace ACC (medido en su panel, sin cambiar nada)

- **Nota elegida:** cuatro asas en las esquinas; la letra en «Automático» (su desplegable dice «Autor»). La barra:
  candado · color · letra · tamaño · alineación · vertical · ⋮.
- **Barra de abajo:** seleccionar · mano · notas · lápiz · +1 · texto · flecha · **formas ▾** · sección ▾ · ·· · comentario.
- **Formas ▾:** nube, rectángulo, elipse, triángulo, rombo, pentágono, hexágono, octógono, estrella, paralelogramo,
  trapecios, cápsula, flechas, «Rectángulo con una X», corazón… El botón conserva la última elegida (la del dueño, la
  nube). Forma Board está hecho sobre tldraw: son sus formas «geo».
- **Forma elegida:** candado · **línea** (cuatro grosores; continuo, a mano, discontinuo, punteado) · color del texto ·
  resaltado del texto · **relleno** (opacidad; sin relleno, claro, oscuro, sólido; color) · **T+** (añadir texto, que
  abre su barra de texto: letra, tamaño, negrita, alineación, lista, enlace, vertical) · ⋮.
- Una nube sin relleno se coge por su línea; lo de dentro (la lámina) sigue a la vista y se puede elegir.

## 2 · Lo nuestro

| | Cómo |
|---|---|
| **Notas con asas** | Cuatro esquinas; la nota se **escala entera**: sigue cuadrada, su relleno interior y su letra (automática o fija) van en proporción al ancho. Mínimo 80 × 80. Si su texto no cabe, sigue creciendo hacia abajo |
| **Formas** (`design/lienzo/formas.js`) | 15: nube de revisión, rectángulo, elipse, triángulo, rombo, pentágono, hexágono, octógono, estrella, paralelogramo, trapecio, cápsula, flecha a la derecha, flecha a la izquierda y rectángulo con una X. Trazado SVG calculado sobre su caja y siempre dentro de ella. **La nube**: festones hacia fuera a lo largo de una elipse, con su número según el contorno, de modo que el festón mide parecido en una nube pequeña y en una grande |
| **Barra de abajo** | Botón de formas con la última elegida y su desplegable (5 × 3, con el nombre al pasar). **R** la pone. Arrastrar dibuja la caja (con Mayús, cuadrada); un clic, 200 × 200 centrada |
| **Por omisión** | Nube **roja**, continua, sin relleno, grosor M: como se marca una revisión en una lámina |
| **Barra de la forma** | Candado · **Línea** (grosor S/M/L/XL; continuo, discontinuo, punteado) · **Color** (10, fuertes para leerse encima de una lámina) · **Relleno** (opacidad 10–100 %, sin relleno, suave, sólido) · **Añadir texto** y, cuando hay texto, letra · tamaño · alineación · vertical · ⋮ |
| **Coger una forma** | Sin relleno, solo por su línea (una franja de 14 px): lo de dentro se sigue pudiendo elegir, como en ACC. Con relleno, por toda ella |
| **Tamaño** | Libre por sus esquinas; con Mayús, en proporción |
| **Deshacer** | Cada cambio es un paso; la opacidad se arrastra en vivo y se apunta una vez, al soltar |
| **Copiar, pegar, duplicar, buscar, miniatura** | Pegar valida forma, color, relleno, opacidad, grosor y trazo; Buscar la llama «Forma»; la miniatura de la lista dibuja su trazado |

**No se copia:** el lápiz, la flecha, el «+1» y el comentario van en la vuelta siguiente (§4). Tampoco el trazo «a
mano» ni el resaltado del texto: en una lámina de obra se quiere una línea limpia.

**Encontrado al probar y corregido (producto):** al soltar el deslizador de la opacidad, el foco se quedaba en él y
Ctrl+Z no llegaba al lienzo (el lienzo ignora las teclas cuando se escribe en un campo). El deslizador suelta el
foco al terminar y el lienzo ya no trata un deslizador o una casilla como un sitio donde se escribe.

**Encontrado y corregido (prueba):** la nota de la prueba nacía tan abajo que, agrandada, su esquina quedaba fuera de
la pantalla y el segundo arrastre no tocaba nada.

## 3 · Evidencia

Banco: rutas reales de Tableros contra PostgreSQL desechable; Chrome sin ventana con ratón y teclado reales.

| Suite | Resultado |
|---|---|
| `prueba_formas.py`: desplegable (15, la nube primero), herramienta puesta, dibujar arrastrando (340 × 220, elegida), estilo por omisión, barra, vuelve a Seleccionar, Color, Línea XL discontinua, Relleno suave, opacidad arrastrada y un solo Ctrl+Z, hueca no se elige por dentro y sí por el contorno, esquina libre y con Mayús en proporción, «Añadir texto», barra de texto, R, clic = 200 × 200 centrada, Ctrl+D con estilo, nota con asas, se agranda cuadrada y su letra crece, mínimo 80, Ctrl+Z, guardado con estilo y texto, miniatura con trazado | **27/27** |
| Node `miniaturaTablero` (+2: las formas, y nada que el servidor rechace) · `fusionTablero` | 8/8 · 10/10 |
| Lint de `design/lienzo` y `tableros/` | limpio |
| View compila con las piezas nuevas | sí (35 s) |

## 4 · Siguiente

1. **Flecha** (de punto a punto, que se engancha a lo que toca) y **lápiz** (dibujo a mano), para marcar sobre las
   láminas.
2. **2B**: la imagen de los DWG y RVT (doc 59 §8).
