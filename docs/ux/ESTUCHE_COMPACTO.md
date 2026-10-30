# Estuche compacto del lector: profesional y nuestro — PROPUESTA (29-oct-2026)

Solo análisis, con maqueta en el chat. El dueño, con la barra de ACC al lado: «nuestras herramientas no las veo tan
profesionales como las de ACC; el nuestro parece herramientas para niños. ¿Podemos mejorar pero hacerla nuestra?».

Cambia una decisión del 16-oct (el estuche con el nombre de cada herramienta y de su grupo, LDA-1 E1). Es un requisito
nuevo del dueño.

## 1 · Por qué el de hoy parece de juguete

- **Es ancho** (unos 180 px) y le quita sitio al plano.
- **Cada herramienta lleva su nombre** y cada grupo su título en mayúsculas: se lee como un menú, no como una
  herramienta de trabajo.
- **El color es un punto rojo suelto** y la herramienta activa va con una barra naranja: se ve decorativo.
- Todas las herramientas tienen el mismo peso. Las variantes (distancia y área; nube, flecha y texto) ocupan una fila
  cada una.
- «Borrar marca» es una herramienta aparte. En las herramientas profesionales se selecciona la marca y se pulsa Supr.

## 2 · Lo que hace ACC (en la captura)

- **Columna estrecha de iconos** (unos 40 px), oscura, con separadores entre grupos.
- **Un triángulo en la esquina** indica que el botón tiene variantes en un desplegable.
- La herramienta activa va **rellena de azul**.
- Abajo, **color del trazo y del relleno** como dos muestras.
- **Deshacer y rehacer** en un bloque aparte.
- El nombre sale solo **al pasar el ratón**.

## 3 · La propuesta (maqueta A oscura y B clara)

**La misma forma profesional y nuestra identidad**:
- **paleta oficial**: Dark 12 #302f2e en la A, blanco con borde Light Gray en la B, y lo activo en Blue 30D #507294;
- **nuestros iconos** de trazo fino, los que ya usa el lector;
- IBM Plex Sans en las etiquetas.

| Botón | Desplegable | Tecla |
|---|---|---|
| Seleccionar y mover | — | V (espacio para mover mientras se pulsa) |
| **Medir ▸** | Distancia · Área · Ángulo · Escala… | M · A · G |
| **Marcar ▸** | Nube · Rectángulo · Flecha · Lápiz | C · R · F · L |
| Texto | — | T |
| **Revisar ▸** | **Incidencia** (pin) · Sello | I · S |
| Foto | — | P |
| Color del trazo y del relleno | Paleta corta de la paleta oficial, más el grosor | — |
| Deshacer / Rehacer | Bloque aparte | Ctrl+Z / Ctrl+Y |

**Además:**
- **Borrar** = seleccionar la marca y pulsar **Supr**, o la papelera de su panel. Sale de la barra.
- **«Contar» sale** y en su lugar entra la **Incidencia** (docs/ux/INCIDENCIA_EN_EL_PLANO.md).
- El **desplegable recuerda la última variante usada**, como en ACC y Bluebeam.
- **Al pasar el ratón**, el nombre y su tecla. La pista de uso («doble clic termina la medición») sigue saliendo abajo
  mientras la herramienta está activa.
- ~~La barra se puede plegar~~: **descartado por el dueño** (29-oct): la barra va siempre visible y **a la derecha**.
- El icono de **Nube** es la nube de revisión de festones iguales; el de antes parecía una mancha.
- **Nube, rectángulo y flecha de dos clics**, como en ACC (29-oct, pedido del dueño): el primer clic fija una esquina (o el
  origen) y el segundo crea la figura; arrastrar de una vez también vale. La herramienta **sigue activa** para dibujar
  otra, y **Esc** cancela lo que esté a medias y la **desactiva** (vuelve a Seleccionar). Vale para todas las
  herramientas del lector; Foto y Sello siguen volviendo a Seleccionar porque abren su panel.
- Accesibilidad: cada botón con su nombre para lectores de pantalla y su foco visible (el anillo de dos bandas de la T2).

**Lo que la hace nuestra, además del aspecto:**
- **«Revisar»** como grupo propio: lo que distingue al ECD de un simple visor.
- **La incidencia con progresiva y por rondas** (los docs anteriores).
- Las **muestras de color salen de la paleta oficial** y de la lista de la cuenta, no de un selector de color libre.
  Así todas las revisiones de una obra se ven iguales.

## 4 · Decisiones del dueño

1. ¿Variante **A (oscura, como ACC)** o **B (clara, como el resto de Docs)**?
2. ¿El orden y los desplegables del §3?
3. ¿«Borrar» pasa a Supr y a la papelera del panel?
4. ¿Teclas de atajo como las del §3?

## 5 · Editar la marca seleccionada (29-oct-2026, en local)

El dueño eligió el paso 1 de la lista de lo que falta, y recordó que la revisión de CAD (`CadReviewOverlay`, 28-sep) ya
funciona como ACC. El lector de PDF copia ese modelo:

- Con **Seleccionar**, una marca **tuya en borrador** se arrastra entera; al elegirla salen **tiradores**: las cuatro
  esquinas de una nube o un rectángulo, los dos extremos de una flecha y los vértices de una medición o un área. El
  lápiz y las marcas de un punto (conteo, texto, sello, foto) solo se mueven.
- En su panel, la sección **Figura**: el **color** (las seis muestras de la paleta; el sello no, su color es su
  estado) y, en un texto, **Editar texto**.
- **Publicada o con una observación abierta, la figura queda fija**, como en la revisión de CAD: se retira de la obra
  para cambiarla, y con observación ni eso. El panel lo dice.
- Servidor: `PATCH /api/pdf/markups/<id>` acepta `geometria` (validada con la forma de su tipo), `color` (#rrggbb) y
  `texto`; 409 `MARCA_PUBLICADA` u `OBSERVACION_ABIERTA`. Todo en `pdf_markups`, **sin migración**.
- Pruebas: `test_marcas_con_enlace` 42/42 (9 nuevas); la suite entera 2417 en verde más el histórico
  `test_reconstruccion_desde_cero`.
- Banco (Chrome visible, servidor simulado en la pestaña): nube de dos clics → arrastrada (PATCH con la caja nueva) →
  esquina estirada (la opuesta no se mueve) → azul. Un arrastre rápido se perdía porque los escuchadores se ponían un
  fotograma tarde: ahora se ponen en el mismo clic.
- **Orden para publicar:** primero el backend (sin él, el servidor ignora la posición y la marca vuelve a su sitio),
  luego el portal.
