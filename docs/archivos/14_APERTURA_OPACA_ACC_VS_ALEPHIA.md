# 14 · «Sigue iniciando opaco»: la lámina 004120 en ACC y en ALEPHIA, medida

20-sep-2026. Queja del propietario: «actualmente en ALEPHIA sigue iniciando opaco y recién cuando nos acercamos se
ve». Medido sobre el **mismo fichero** en los dos sitios, en SU Chrome (cuenta OMAR, sesiones suyas):
`500125-CSSP001-740-XX-DR-LS-004120.pdf`, **71,9 MB**, en producción (`alephia.com.pe`) y en ACC/Autodesk Forma
(proyecto PQT8 · DRENAJE PLUVIAL TALARA). **Sólo medición: no se tocó código.**

## 1 · En corto

ACC no dibuja el PDF: dibuja un **derivado vectorial** que le prepara su servidor y lo pinta con **WebGL**. Nosotros
bajamos el PDF entero y lo **rasterizamos con pdf.js**. De ahí salen las dos cosas que el propietario ve:

1. **Lo primero que aparece en ALEPHIA no es la lámina, es la vista previa de 2.000 px** (a los 2,1 s), y esa vista
   previa **pierde la tinta**: medido en §7, deja un 1,3 % de píxeles negros donde el lector deja un 9,3 %. Eso es
   «opaco», y dura todo lo que tarda en bajar el PDF de 71,9 MB.
2. **Al acercar, el lector sí redibuja desde el PDF y entonces «se ve»** — exactamente lo que él describe.
3. **CORRECCIÓN de la hipótesis inicial (§7):** se dio por hecho que el borroso era de pdf.js rasterizando líneas
   finas. **Es al revés:** a la misma resolución, pdf.js deja MÁS tinta que el rasterizador del servidor (9,3 % frente
   a 1,5 %). El lector dibuja bien; lo que se ve mal es la imagen de espera.

## 2 · Cómo se midió (y una trampa que invalida medir de cualquier otra forma)

- Instrumentación dentro de la propia página (MutationObserver + muestreo cada 25–60 ms): cuándo aparece el lienzo, con
  qué resolución real (`canvas.width`) frente a su tamaño en pantalla, cuándo aparece y desaparece la vista previa, y
  `getImageData` sobre la zona del cajetín para medir luminancia media, % de píxeles oscuros y gradiente.
- Red: `performance.getEntriesByType('resource')` en las dos pestañas.
- Capturas de pantalla de la misma zona del cajetín en los dos, al mismo tamaño en pantalla.
- **TRAMPA (ya conocida, vuelve a morder):** con la ventana de Chrome tapada por otra, la pestaña queda `hidden`,
  `requestAnimationFrame` **no dispara ni un fotograma en un segundo** (medido: 0 fps) y el lector no redibuja nunca;
  además el viewport se encoge (219×177 px). Todas las medidas de esta nota se tomaron con las dos ventanas **lado a
  lado** y la pestaña `visible` (101 fps medidos en el momento de la prueba).

## 3 · Resultados

### 3.1 · Al abrir (clic → lámina en pantalla)

| | ACC (Forma) | ALEPHIA |
|---|---|---|
| Lienzo creado | 1,26 s | 13 ms (vacío) |
| Primera imagen de la lámina | **~4–5 s, ya nítida** | **2,1 s, vista previa de 2.000 px** |
| Dibujo real del PDF | no lo necesita para mostrar | cuando pdf.js tiene el documento (**210 peticiones por rangos** al almacenamiento para los 71,9 MB) |
| Apertura con el PDF ya en caché | — | lienzo a **0,88 s**, hoja nítida a ~3 s |
| Lo que baja para pintar | **107 peticiones, 1,07 MB medibles**, de los que 868 KB son su propio JS; la geometría va en **14 `.zip`** (tamaño oculto por CORS) | el PDF entero, **71,9 MB** |
| El PDF original | lo baja **en segundo plano** (barra «Descargando 15,0 MIB / 71,9 MIB» con la lámina ya dibujada) | es la única fuente |

### 3.2 · Cómo dibuja cada uno

| | ACC | ALEPHIA |
|---|---|---|
| Motor | `<canvas>` **sin contexto 2D** → **WebGL** (geometría vectorial en la GPU) | pdf.js → **canvas 2D rasterizado** |
| Resolución del lienzo | 1.875×752 px reales para 2.000 px CSS (**1,0**) | 972×687 px reales para 1.167 px CSS (**1,0**) |
| Píxeles por mm de papel (hoja completa) | ≈ **1,28** | ≈ **1,16** |
| Nitidez del cajetín al mismo tamaño | texto de revisiones, fechas y tablas **legible** | el mismo texto, **gris y blando** |
| Medida del cajetín (pdf.js) | — | luminancia media 217,6 · 5,7 % de píxeles oscuros · gradiente 8,5 |

La diferencia de tamaño (1,28 vs 1,16 px/mm) es del 10 %: **no explica** la diferencia de legibilidad. La explica el
vector frente al ráster.

### 3.3 · Al acercar con la rueda

| | ACC | ALEPHIA |
|---|---|---|
| Respuesta | la hoja cambia de escala y **el fotograma siguiente ya está nítido** (no hay fase borrosa: redibuja el vector) | la hoja crece al instante **estirando el mismo mapa de bits** |
| Fase borrosa | — | **0,48 s** a **0,75 px reales por píxel de pantalla** (rueda ×3: 1.283 → 1.708 px CSS con el lienzo quieto en 972 px) |
| Después | — | redibuja a 1.423×1.005 y vuelve a 1,0 px real por píxel |

(La rueda simulada por la extensión, que ACC ignoraba en las pruebas del 17-sep, esta vez sí le hizo efecto.)

## 4 · Por qué se ve «opaco» (medido en §7, no supuesto)

**La imagen de espera pierde la tinta.** La vista previa se dibuja en el servidor con MuPDF a 2.000 px **con el
suavizado de fábrica**, se guarda en JPEG y el navegador la reduce a los ~972 px en que se ve la hoja. En cada una de
esas dos reducciones la línea fina se promedia con el blanco: acaba en un **1,3 % de píxeles con tinta**, donde el
propio lector, cuando termina, deja un **9,3 %**. Esa imagen pálida es lo que se ve **todo el rato que tarda en bajar
el PDF de 71,9 MB**, y por eso «recién cuando nos acercamos se ve»: al acercar, el lector redibuja desde el PDF.

Frente a ACC hay además una diferencia de fondo que no se arregla con ajustes: ACC dibuja **vector en la GPU** y no
depende de los 71,9 MB para enseñar la lámina.

## 5 · Qué haría falta para replicar ACC

De menor a mayor, con lo que cada una arregla:

| | Qué es | Arregla | Coste |
|---|---|---|---|
| **A** | Dibujar a ×1,5–2 la resolución de pantalla y dejar que el navegador lo reduzca (supersampling), sólo en la zona visible | Mejora el texto pequeño, pero **NO devuelve el negro a las líneas finas**: al reducir, una línea de medio píxel sigue saliendo gris. Tampoco quita la espera de los 71,9 MB | Pequeño (sólo el lector); 2,25–4× de trabajo de rasterizado por pasada |
| **B** | **Mosaicos por lámina** generados en el servidor (pirámide tipo mapa) | Primera vista nítida en menos de 1 s, zoom sin fase borrosa, se baja sólo lo visible en vez de 71,9 MB | Mediano: trabajo en el backend (generar y guardar), cambio de lector a mosaicos |
| **C** | **Derivado vectorial en el servidor** (equivalente al F2D de Autodesk) + dibujo WebGL | Exactamente el comportamiento de ACC en nitidez y en zoom | Grande |

**Con lo medido en §7, el plan es en dos pasos:**

- **PASO 1 (pequeño, sólo backend, quita el «opaco» de hoy) — APLICADO EN LOCAL, ver §7.2:** la vista previa, a
  **1.500 px con máscara de enfoque**. Recupera el borde que se perdía (gradiente 9,92 frente a 6,43; el lector, 9,27),
  **pesa un 22 % menos** y se genera **12 veces más rápido**. No toca el lector ni el flujo: sólo cómo se dibuja esa
  imagen.
- **PASO 2 (mediano, es el camino de verdad): B, mosaicos por lámina.** Es lo único que quita la espera de los 71,9 MB
  y la fase borrosa del zoom, porque cada nivel se dibuja a su resolución y sólo se baja el trozo visible.

**A no sirve** para esto: reducir un dibujo grande no devuelve el negro a la línea fina. **C** sólo si más adelante se
quiere el comportamiento idéntico de ACC (selección de elementos y texto buscable como vector).

## 7 · Prueba controlada: quién pierde la tinta (20-sep-2026)

Antes de tocar nada se comparó, **sobre el mismo PDF y a la misma resolución**, lo que dibuja cada motor. Hoja de
prueba: `500125-CSSP001-740-XX-DR-HD-004120.pdf` (A1, 2,4 MB, copia local; la de 71,9 MB no está en disco). Se mide la
columna del cajetín (x 0,78–0,98, y 0,05–0,95) al tamaño en que se ve hoy, **972 px de ancho**: luminancia media,
**% de píxeles con tinta** (más oscuros que 64) y gradiente horizontal medio (cuanto más alto, más definido el borde).

La hoja de pruebas fue primero `…-DR-HD-004120.pdf` (A1 vectorial, 2,4 MB) y después **la de verdad**, la que ve el
propietario: `…-DR-LS-004120.pdf` (A1, **71,9 MB**, con foto aérea), que él copió a `PDF/`.

### 7.1 · Quién pierde la tinta

| Lo que se dibuja (lámina real 004120) | Tinta | Luminancia | Gradiente | Peso | Generar |
|---|---|---|---|---|---|
| **pdf.js a 972 px** (lo que el lector acaba enseñando) | **3,03 %** | 218,3 | 9,27 | — | 18,8 s en Node |
| **Vista previa de HOY**: MuPDF 2.000 px, suavizado de fábrica, JPEG 85, reducida por el navegador | **0,82 %** | 225,0 | 6,43 | 453 KB | 1,01 s |
| **LA QUE SE APLICA**: MuPDF **1.500 px + máscara de enfoque**, JPEG 85 | **1,33 %** | 221,0 | **9,92** | **352 KB** | **0,08 s** |
| Descartada: 1.500 px **sin suavizado** | 3,27 % | 214,2 | 12,81 | 323 KB | 0,12 s |
| Descartada: 1.500 px + **filtro de mínimo** (engordar la línea) + enfoque | 3,19 % | 209,6 | 8,73 | 306 KB | 1,20 s |

- El problema **no es pdf.js**: en la hoja vectorial deja seis veces más tinta que el rasterizador del servidor con su
  suavizado de fábrica (9,29 % frente a 1,48 % a la misma resolución). pdf.js respeta un grosor mínimo de línea.
- **La vista previa de hoy es la imagen pálida que se ve al abrir**, y se queda en pantalla todo lo que tarda el PDF.
- **Las dos variantes «con más tinta» se descartaron MIRÁNDOLAS**, no por el número: sin suavizado, las letras del
  cuadro de revisión salen ilegibles; con filtro de mínimo, el cajetín se emborrona y los rótulos sobre la foto salen
  como manchas negras. Comparación a la vista: `docs/archivos/evidencias/previa/LS_variantes_2zonas.png`.
- La elegida **recupera el borde** (gradiente 9,92 frente a 6,43; el lector, 9,27), **pesa un 22 % menos** y se genera
  **12 veces más rápido**.

### 7.2 · Lo aplicado (publicado el 21-sep-2026 con el paso 2, docs/archivos/15)

`backend/gcs_manager.py`: `PX_VISTA_PREVIA` 2000 → **1500**, `ENFOQUE_VISTA_PREVIA = (1.0, 160, 2)` y
`_afinar_vista_previa()` aplicado **sólo** cuando se genera la vista previa (la silueta de 420 px de la cuadrícula no
se toca). El nombre del fichero lleva el tamaño (`__thumb1500.jpg`), así que no hay migración: la primera vez que se
abre cada lámina se genera la nueva y la vieja queda huérfana.

Prueba local por el **camino real del backend**, con su propio entorno (`backend/venv`, sin numpy):

```
backend/venv/Scripts/python.exe backend/herramientas/prueba_vista_previa_nitidez.py
```

| lámina | ms | KB | tinta | lum | grad |
|---|---|---|---|---|---|
| LS-004120 (71,9 MB) | 1.409 | 352 | 1,29 | 221,1 | 9,80 |
| *el lector (pdf.js)* | — | — | *3,03* | *218,3* | *9,27* |
| HD-004120 (2,4 MB) | 577 | 417 | 2,23 | 228,4 | 14,68 |

**Sin comprobar todavía:** el efecto en producción de punta a punta (hay que desplegar el backend; generar una vista
previa escribe en el almacén real, así que no se hizo desde aquí). Y quedan las vistas previas viejas de 2.000 px
ocupando sitio: se pueden borrar cuando se quiera, no molestan.

## 8 · Lo que no se pudo medir

- **El tamaño real de la geometría que baja ACC:** sus `.zip` vienen sin `Timing-Allow-Origin`, así que el navegador
  reporta 0 bytes. Sabemos el número (14 paquetes) y que el total medible de la apertura es 1,07 MB.
- **La apertura en frío de ALEPHIA de punta a punta** (hasta que el PDF acaba de bajar y se dibuja): la primera vez se
  midió con la ventana tapada y por eso no vale; lo que sí quedó medido es que la vista previa entra a los 2,1 s y que
  el PDF va por 210 peticiones de rango.
