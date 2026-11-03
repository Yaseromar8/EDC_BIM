# Comparar versiones de un plano — 3-nov-2026

> Pedido del dueño: «necesitamos hacer Comparar versiones muy profesional. Así como ACC, Procore, pero nuestro.»

## 1 · Qué había

`PdfCompareView` tenía:

- un superpuesto rojo/azul y un lado a lado;
- zoom por botones de 20 %, sin arrastrar ni rueda;
- siempre la V vigente contra la anterior, sin poder elegir;
- sin detección de cambios;
- todo dibujado con pdf.js.

## 2 · El estándar (medido en la ayuda oficial)

- **Autodesk Build, «Compare Sheets».**
  - Superpuesto por defecto, con las diferencias en rojo y azul.
  - Un botón apaga los colores, y un ojo apaga cada hoja.
  - «Lado a lado» es una cortina que se arrastra.
  - **Align**: se arrastra una hoja sobre la otra.
- **Procore, «Compare Drawings».**
  - Azul = solo en la segunda, rojo = solo en la base, negro = igual.
  - Lado a lado con **Link Zoom**.
  - **Show Semantics**: marca en amarillo los TEXTOS que cambiaron y los lista.
  - En iOS, **Realign** con arrastre o flechas.

## 3 · Lo que se hizo

### Lo estándar

- **Elegir las dos versiones** (Anterior y Nueva), cada una con su fecha y su autor, e **intercambiarlas**.
- **Superpuesto** con la paleta oficial:
  - rojo #B93535 = solo en la anterior;
  - azul #507294 = solo en la nueva;
  - Dark = igual;
  - se puede apagar cada versión o los colores.
- **Cortina**: una línea que se arrastra, con la anterior a la izquierda y la nueva a la derecha.
- **Lado a lado**, con el zoom vinculado o suelto.
- **Alinear**: se arrastra la anterior, o se usan las flechas (1 px; con Mayús, 10 px). Mientras se alinea, se ve un
  superpuesto en vivo con las dos capas teñidas y multiplicadas; al terminar se vuelve a comparar.
- **Navegación del lector**:
  - rueda anclada en el cursor;
  - arrastre;
  - doble clic o «0» = hoja entera;
  - + y −;
  - «1», «2» y «3» cambian de modo;
  - Esc cierra.
- **Tolerancia de un píxel**: una línea corrida medio píxel no es un cambio.

### Lo nuestro

- **Los cambios se encuentran solos**.
  - Los píxeles cambiados se agrupan en zonas (rejilla de 12 px y unión de 3 celdas).
  - Cada zona va marcada con un rectángulo fino y su número; la activa, en Dark y con trazo doble.
  - La zonas se ordenan como se lee una lámina: por bandas, de arriba abajo.
- **Cómo se reconoce cada cambio.** El dueño preguntó «¿cómo reconocerá que fue agregado, modificado o eliminado?».
  Se usa un solo código en la hoja, la lista y la leyenda, con los colores del propio dibujo y un signo:

  | Tipo | Signo | Color | Recuadro |
  |---|---|---|---|
  | Añadido | **+** | azul de la nueva | continuo |
  | Quitado | **−** | rojo de la anterior | discontinuo |
  | Modificado | **±** | Dark | continuo |

  El signo sirve también donde el dibujo no va teñido (cortina, lado a lado) y a quien no distinga colores. La leyenda
  dice «Quitado · solo en V1» y «Añadido · solo en V2».
- **Filtro en la lista**: Todos · + Añadidos · − Quitados · ± Modificados. Las marcas de la hoja y N / Mayús+N siguen el
  filtro.
- **Lista de cambios**, con una miniatura de cada zona y si se añadió, se quitó o se modificó.
  - Dice dónde está en la hoja («arriba a la izquierda»).
  - Se recorre con N y Mayús+N, o pulsando la miniatura o la nube.
- **Los textos también se comparan** (lo que Procore llama Semantics), dentro de la misma lista.
  - Una cota que pasa de 21.35 a 24.60 casi no deja huella en los píxeles: los dígitos se pisan, menos del 1 % de su
    caja.
  - Comparando el texto que el PDF escribe sale **«Modificado · L = 21.35 m → L = 24.60 m»**.
  - Lo nuevo sale con «+» y lo quitado con «−».
- **«Igual» se atenúa a voluntad** (del 10 al 100 %) para que salte lo que cambió.
- **No es OCR.** El dueño preguntó «¿es alguna lectura OCR?». Son dos lecturas:
  - el **dibujo**, píxel a píxel;
  - el **texto que el PDF ya guarda**, el que exporta el CAD cuando el texto es texto.
- **Pasada fina** (`detectarAfinando`).
  - En DR-803 solo **14 palabras** son texto: el resto de cotas y rótulos están exportados como líneas (fuentes SHX). Una
    cota que cambia un dígito no la ve la comparación de textos.
  - Con un píxel de tolerancia, en el dibujo deja 13 píxeles cambiados; sin tolerancia, 149. Medido con las teselas
    reales.
  - Por eso hay una segunda pasada sin tolerancia, que solo se usa si las dos versiones están **en registro**: lo que
    añade es menos del 3 % de la tinta. Con la hoja corrida 1 px se apaga sola y no inventa cambios.
  - En el banco encontró la cota **y** una fila de dígitos a la que la edición de prueba le borró trazos. Ninguna de las
    dos salía con tolerancia.
  - Cuesta ~0,3 s más.

### Que vaya rápido y se vea nítido

- **Teselas del servidor.**
  - Dibujar un plano de CAD pesado con pdf.js cuesta 30–40 s, igual que el lector en septiembre.
  - La comparación usa las **teselas que el servidor prepara al subir** (`/api/docs/mosaico`).
  - La hoja base sale del nivel z1 (3.000 px de lado mayor); la zona nítida, del nivel que pida el zoom (z2 o z3).
  - Las teselas se traen con `fetch` en modo CORS y se reintenta una vez saltando la caché. El lector las pone en
    `<img>` sin CORS, y esa copia guardada sin cabeceras se rechazaría al leer sus píxeles.
- **Se recurre a pdf.js** en las páginas 2 en adelante (el mosaico es solo de la primera), en las versiones sin mosaico
  y si las teselas no se pueden leer.
- **Nitidez al acercar.** Al dejar de moverse con zoom por encima de la hoja base, se vuelve a pedir la zona visible a la
  resolución de la pantalla y se vuelve a comparar esa zona. Debajo sigue la hoja base, para que nunca haya hueco.

### Aspecto: «más profesional y serio» (el dueño, sobre la primera versión)

Con el lenguaje del lector y la paleta oficial:

- **Barra y campo.** Barra blanca; campo Light 50 liso, sin rejilla; líneas #E8E6DC; iconos Gris 600.
- **Segunda vuelta** («los colores de los botones, muy a dibujo animado»): los controles van **solo en grises**. Lo
  encendido, en Light Gray sobre Dark. El color vive solo en el dibujo superpuesto y en su leyenda, como una clave de
  capas de CAD: una raya corta. No hay cuadros de color, barras de color en las versiones ni naranja.
- **Modos.** Un control segmentado sobre el campo.
- **Versiones.** Su rótulo en minúscula de oración («Anterior», «Nueva»). Sin puntos, sin mayúsculas y sin color.
- **Marcas de los cambios.** Un **rectángulo fino** (1,25 px) y una **etiqueta con el número** de tamaño fijo en
  pantalla. Las nubes de festones, sobre toda la hoja, se veían recargadas.
- **Controles flotantes,** como el mando del lector, con radio 10 y su sombra. La leyenda va en una tarjeta propia
  arriba a la izquierda, y el mando de página, zoom, alinear y marcas abajo al centro.
- **Cargando.** Una barra fina arriba y una línea de texto, en vez de una caja con un círculo girando.
- **Lista.** Más densa: etiqueta numerada, miniatura de 76 × 50, el tipo en texto, el texto cambiado en monoespaciada y
  el lugar.

## 4 · Evidencia

- **Matemática** (`utils/compararVersiones.js`): `node frontend-docs/pruebas/compararVersiones.prueba.mjs`, **17/17**.
  Comprueba:
  - tinta;
  - tolerancia de 1 px;
  - colores;
  - quitado, añadido y modificado;
  - alinear con el desfase correcto deja cero cambios;
  - apagar capas;
  - orden de lectura;
  - ruido;
  - nube;
  - encuadre;
  - zoom anclado;
  - cambios de texto;
  - pasada fina: ve un trazo corrido un píxel y se apaga con la hoja fuera de registro.
- **Banco** (`frontend-docs/probar-comparar.html`, sin commit).
  - Dos versiones de DR-803 con cambios conocidos, hechas con PyMuPDF:
    - quitada una zona del perfil;
    - añadida la «CAMARA NUEVA CR-05»;
    - una cota que pasa de 21.35 a 24.60.
  - Su mosaico real, generado con `backend/mosaicos.py`.
  - Encuentra lo puesto y algo más, real:
    - Añadido + CAMARA NUEVA CR-05;
    - Quitado al centro, en dos zonas (el perfil quitado son dos bandas separadas);
    - Modificado L = 21.35 m → L = 24.60 m;
    - y, con la pasada fina, una fila de dígitos dibujados con líneas que la edición de prueba recortó.
  - **Hoja visible en ~1 s** con teselas, cuando con pdf.js eran **36 s**; la lista completa, con los textos, en ~1,9 s.
  - Zona nítida al acercar en ~3 s.
  - Página 2, sin mosaico y por pdf.js: 13 s, «Sin cambios», correcto.
  - Alinear 20 × 10 px convierte la hoja entera en un cambio; restablecer devuelve los 4.
  - Cortina y lado a lado comprobados en pantalla.
- **Una trampa vista en el banco.** Con la pestaña tapada el navegador no da fotogramas y la lista se quedaba en «Sin
  cambios». Ahora la composición va con temporizador, no con `requestAnimationFrame`.

## 5 · Lo que no se probó y lo que falta

- **En producción, sin probar todavía:**
  - que el bucket entregue las teselas con CORS a `fetch`. Si no, se recurre a pdf.js, lento pero correcto;
  - una lámina de PQT8 real con versiones subidas antes del 21-sep: no tendrán mosaico y van por pdf.js.
- **Falta, en este orden:**
  1. **Levantar una incidencia desde un cambio**: la nube del cambio pasa a ser el pin de la incidencia en la versión
     nueva.
  2. **Comparar con otro documento** (Procore deja superponer dos planos distintos de la misma zona).
  3. **Exportar la comparación a PDF**, con las nubes y la lista: para adjuntarla a una observación o a una emisión.
  4. Pellizco con dos dedos en la tableta (hoy, rueda, botones y arrastre).
  5. Mosaico de todas las páginas, no solo de la primera (es del backend: `mosaicos.preparar` usa la página 0).
