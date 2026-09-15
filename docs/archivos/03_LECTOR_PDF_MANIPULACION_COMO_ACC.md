# Lector de PDF · manejar el plano como en ACC

15-sep-2026. **Propuesta aprobada (opción A) y aplicada:** ver `04_LECTOR_PDF_COMO_ACC_INFORME.md`, con las cifras de antes y después.

Tu pedido: «lo único que quiero es la experiencia en la manipulación del PDF, no si hay más botones o no».

Base: lo que medimos en el lector de planos de ACC el 13-sep, en PQT8. Lo nuestro está comprobado hoy en el código (`frontend-docs/src/components/PDFViewer.jsx`).

## En corto

- **Solo cuenta cómo responde el plano a la mano:** rueda, arrastre, doble clic y nitidez al acercar. Botones, barras y herramientas quedan fuera.
- **Lo que ya es igual:** arrastrar mueve el plano 1:1 y se para al soltar, sin inercia.
- **Lo que falta:**
  - la rueda de ACC acerca un 10 % suave, en cualquier punto; la nuestra, un 20 % de golpe, y sobre el margen gris desplaza la vista (medido al aplicarla: el cambio de página, según el código, solo ocurría sobre las barras de desplazamiento);
  - en ACC, doble clic muestra la hoja entera; en la nuestra no hace nada;
  - ACC sigue nítido a cualquier zoom; la nuestra se ve borrosa a mucho zoom (el «raster», §2).
- **Una decisión tuya** (§4): mejorar nuestro lector (recomendado) o cambiarlo por el motor de Autodesk que usa ACC.

## 1 · Gesto por gesto

| Gesto | ACC (medido el 13-sep) | ALEPHIA hoy (código) | Objetivo |
|---|---|---|---|
| **Rueda** | Zoom ×1,10 por muesca al acercar y ×0,91 al alejar. Suave: la mitad en 12 ms, termina en unos 60 ms. Anclado al cursor, en cualquier punto, también fuera de la hoja | Zoom ×1,2 de golpe, anclado al cursor, solo sobre la hoja. Sobre el margen gris **desplaza la vista** (medido después; según el código, sobre las barras de desplazamiento cambiaba de página) | Como ACC: ×1,10 suave y anclado, en cualquier punto. La página se cambia con las flechas y RePág/AvPág, que ya funcionan |
| **Varias muescas en un solo evento** | Mismo paso que una | Mismo paso que una | Igual |
| **Arrastrar** | 1:1, sin inercia, con botón izquierdo o central | 1:1, sin inercia: con el izquierdo si la herramienta es Mover (la de por defecto), y con el central siempre | Ya está. Con una herramienta de marcas activa, el izquierdo sigue siendo de la herramienta |
| **Doble clic** | Hoja entera, con transición de ~0,5 s | Nada | Hoja entera, con transición de ~0,5 s |
| **Nitidez al acercar** | Nítido a cualquier zoom: dibuja las líneas como vectores | Borroso a mucho zoom: la imagen de la página tiene un tope de 16 millones de píxeles (§2) | Nítido a la resolución de la pantalla en cualquier zoom |
| **Cuánto se puede acercar** | Sin límite práctico; alejar, hasta ~3,5 veces la hoja | De 0,2× a 8× | Acercar lo que pida el detalle (del orden de 64×); alejar hasta ver la hoja con margen |
| **Cambiar de página** | Conserva el encuadre | Por medir | Conservar el encuadre |

## 2 · Lo del «raster», explicado

- **ACC, lector de planos:** usa el visor de Autodesk con su extensión de PDF. Lee las líneas del plano como **vectores** y las vuelve a trazar en cada zoom, así que a 20× una línea sigue siendo una línea fina.
- **ALEPHIA:** pdf.js convierte la página en una **imagen** (raster) y la pinta en un lienzo.
  - Para verse nítida, la imagen necesita tantos píxeles como la pantalla por cada trozo de hoja.
  - Un A1 a 8× en una pantalla de alta densidad pediría cientos de millones de píxeles, y el navegador se colgaría.
  - Por eso hay un tope de 16 millones (`MAX_CANVAS_PIXELS`). Pasado el tope, la imagen tiene menos píxeles que la pantalla y **se ve borrosa**.
  - Además, al acercar primero se estira la imagen que ya hay y a los 110 ms se redibuja nítida. Por eso a veces se nota un pequeño salto.
- **El arreglo sin cambiar de motor:** dibujar en alta resolución **solo la parte que se ve**.
  - La pantalla tiene un tamaño fijo, así que la zona visible cabe siempre en el presupuesto de píxeles, sea cual sea el zoom.
  - Debajo se queda la página entera a baja resolución, para que al arrastrar nunca se vea un hueco.
  - Al parar de girar la rueda o de arrastrar, se redibuja nítida la zona visible.
  - Es lo que hacen los lectores raster serios. pdf.js 5, la versión que ya usamos, incluye una capa de detalle con esta misma idea.

## 3 · Qué no entra

Botones y barras; seleccionar texto; enlaces dentro del PDF; medir; girar; miniaturas; el lector de «documento continuo» de ACC; touchpad y pellizco, que tampoco medimos en ACC.

## 4 · Decisión tuya: con qué motor

| | A · Mejorar nuestro lector (recomendado) | B · El motor de Autodesk, como ACC |
|---|---|---|
| **Qué es** | Lo de §1 y §2 sobre pdf.js | Abrir los PDF con el visor de Autodesk y su extensión de PDF, que el portal ya carga para los CAD |
| **Experiencia** | Medible y ajustable a las cifras de ACC | La de ACC, porque es su mismo motor |
| **Nitidez** | La de la pantalla a cualquier zoom, redibujando lo visible | Vectorial |
| **Lo que ya tenemos encima del plano** | Se conserva: marcas de revisión, Red Line, incidencias y la tira de documentos de la carpeta | Hay que rehacerlo sobre otro sistema de coordenadas |
| **Apertura** | Como hoy | Carga el visor de Autodesk en cada PDF. En ACC medimos 12–16 s en frío |
| **Riesgo** | Bajo y por pasos | Alto: cambia el lector entero |

**Por qué A:** todo lo que el equipo ya hace sobre los planos (marcas, Red Line, incidencias) vive encima de nuestro lector. Lo que se echa en falta de ACC es el tacto y la nitidez, y los dos se alcanzan sin cambiar de motor.

## 5 · Cómo se comprobaría

Con el mismo método que usamos en ACC: ratón real simulado (CDP) sobre el lector del banco, con un plano A1 vectorial pesado, y registrando la escala fotograma a fotograma.

| Qué | Cómo se mide | Cifra objetivo |
|---|---|---|
| Paso de la rueda | Escala antes y después de una muesca | ×1,10 al acercar, ×0,91 al alejar |
| Suavidad | Escala en cada fotograma tras la muesca | La mitad en unos 12 ms, termina en unos 60 ms |
| Anclaje | Punto del plano bajo el cursor antes y después | Error menor de 1 px |
| Arrastre | Desplazamiento del plano frente al del ratón; qué pasa al soltar rápido | 1:1; se para al soltar |
| Doble clic | Hoja entera y tiempo de la transición | Hoja entera en ~0,5 s |
| Nitidez | Píxeles del lienzo por píxel de pantalla en la zona visible, a 8×, 20× y 40× | ≥ 1 a cualquier zoom |
| Memoria | Píxeles totales en uso | Acotados, sin crecer con el zoom |
| Cambio de página | Encuadre antes y después | Se conserva |

Y la prueba de siempre en la pantalla del banco, más tu recorrido con un plano real de PQT8.

## 6 · Orden propuesto (A)

1. **Rueda:** ×1,10 suave, anclada y en cualquier punto; la rueda deja de cambiar de página.
2. **Doble clic:** hoja entera con transición.
3. **Nitidez:** dibujar en alta resolución solo lo visible, y ampliar el límite de zoom.
4. **Medir contra las cifras de ACC** y ajustar.

Cada paso se prueba en el banco antes del siguiente. Todo va solo en el portal: el servidor no cambia.
