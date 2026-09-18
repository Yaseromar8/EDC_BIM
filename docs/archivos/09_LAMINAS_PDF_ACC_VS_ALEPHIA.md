# Láminas en PDF · apertura y acercamiento · ACC frente a ALEPHIA

17-sep-2026. Pedido del propietario: comparar la apertura de PDF, sus cargas y el acercamiento, **en láminas y
no en documentos de texto**, con la misma lámina abierta en los dos.

**Estado:** solo medición. No hay código. En ACC y en ALEPHIA solo se abrieron, cerraron y ampliaron documentos;
no se cambió nada.

## En corto

- **Lámina:** `500125-CSSP001-740-XX-DR-LS-004120.pdf` (paisajismo, con foto aérea de fondo). El propietario la
  subió a ACC para esta prueba; en ALEPHIA está en `…/PAISAJISMO/PDF`.
- **Primera apertura (página recién cargada):**
  - **ALEPHIA:** miniatura borrosa a los **0,6 s**, pero la lámina no se lee hasta los **33–36 s** (dos pasadas) y
    se completa a los 36–38 s. El lector bajó el PDF en **448–455 peticiones por rangos**, que tardaron ~26 s, y
    después dibujó durante 8–10 s.
  - **ACC:** 4,8 s para arrancar su visor. La lámina aparece en **mosaicos de imagen** entre **5,6 y 9 s**. Su PDF
    vectorial se sigue bajando aparte (43 s) y sustituye a los mosaicos a los **59 s**, cuando la lámina ya se lee.
- **Reabrir en la misma página:** **ALEPHIA 0,36 s** (0,76 s completo) · **ACC ~2,1 s** (4,85 s completo; vuelve a
  pedir los mosaicos).
- **Acercamiento con la rueda:**
  - **Por muesca, los dos igual:** ×1,10 y el punto bajo el cursor quieto (<1 px). ALEPHIA termina el paso en
    64–86 ms; ACC llega al 90 % a los 72–106 ms y se asienta a los 220–270 ms.
  - **Profundo:**
    - **ACC** es fluido en todo el recorrido: fotograma p95 de 16 ms, el peor de 37 ms, y nítido a los ~0,3 s de la
      última muesca.
    - **ALEPHIA:** hasta ×3 va bien, con un parón aislado de 287 ms, y desde ×8 va suelto. **Entre ×3 y ×8 da
      tirones:** 5 fotogramas pasan de 100 ms, el peor llega a 365 ms, y la zona no está nítida hasta 0,96 s
      después. ACC, en ese mismo tramo, no pasa de 34 ms.
- **Dónde está la diferencia real:** en la primera apertura de una lámina pesada. ACC la prepara al subirla, en
  mosaicos y en una página PDF aparte. Nosotros bajamos y dibujamos el PDF entero al abrirlo, y con esta lámina el
  lector hizo una tormenta de peticiones por rangos.
- **Artefacto descartado:** la rueda simulada por la extensión de Chrome añade un desplazamiento nativo de 100 px
  unos 200 ms después. Parecía un salto del lector y **no lo es** (§4).

## 1 · Cómo se midió

- **Dónde:**
  - tu Chrome, con tus sesiones, en Windows y desde tu red;
  - dos pestañas del grupo de Claude, con la pestaña medida siempre a la vista (comprobado con
    `document.visibilityState`);
  - ventana de 2560×1140 px CSS con `devicePixelRatio` 0,75 (zoom de página al 75 %).
- **Apertura:**
  - «frío» es la página de la carpeta recién cargada y clic real en la lámina; «caliente», cerrar el documento y
    volver a abrirlo en la misma página;
  - en ALEPHIA se registran las marcas `[lector]` (url-firmada, descargado, PRIMERA-TINTA, total), cada petición y
    la aparición de la miniatura;
  - en ACC, los eventos de su visor (raíz del modelo, geometría, fotogramas parcial/final) y cada petición.
- **Acercamiento:**
  - **ALEPHIA:** rueda lanzada desde la propia página (`WheelEvent` con el `deltaY` real de una muesca, −133,3), y
    la hoja medida fotograma a fotograma.
  - **ACC:** su visor ignora esa rueda simulada (la cámara no se movió), así que se usó una muesca real de la
    extensión y se midió la **cámara** del visor (`orthoScale`) y la posición en pantalla del punto del mundo bajo
    el cursor. Eso no se ve afectado por el artefacto del §4.
- **Límites:**
  - **Red lenta hoy:** la descarga de Google Cloud y la del CDN de Autodesk fueron lentas a la vez. El `page.pdf` de
    ACC tardó 36 s; el plano `004122` de ALEPHIA, 18 s, frente a 5–6 s el 15-sep. Los tiempos de descarga no son de
    un día normal, pero afectaron a los dos.
  - ALEPHIA en frío se midió dos veces; ACC en frío, una.
  - No se vació la caché del navegador, porque te habría cerrado las sesiones.
  - Las ráfagas de ACC salieron a una muesca cada ~566 ms (lo que tarda la extensión) y las de ALEPHIA a una cada
    60 ms. Se compara lo que pasa **tras la última muesca** y la fluidez, no la duración de la ráfaga.

## 2 · Apertura

Segundos desde el clic.

| Hito | ALEPHIA · frío (2 pasadas) | ACC · frío | ALEPHIA · caliente | ACC · caliente |
|---|---|---|---|---|
| Algo en pantalla | Miniatura borrosa a **0,62** | Visor a **4,78** (arranque de su código) | — | Visor a 0,99 |
| URL firmada / manifiesto | 0,46 / 0,57 | Manifiesto 5,24–5,54 | 0,003 | 1,23–1,51 |
| **Se lee la lámina** | **33,13 / 35,57** (primera tinta) | **~6,7** (mosaicos 5,55–8,94; fotogramas 6,65–9,03) | **0,36** | **~2,1** (mosaicos 1,52–4,74) |
| Completa | 35,73 / 38,37 | Mosaicos 9,03 · **vectorial 59,15** | 0,76 | 4,85 |
| Descarga del PDF | 448 / 455 peticiones por rangos: la mitad terminadas a los 10,7 s, la última a los 26–42 s | `page.pdf` 6,69 → 43,09, en segundo plano | Ninguna | Mosaicos otra vez; ningún `page.pdf` en 20 s |

- **ALEPHIA en frío, por dentro:**
  - el documento queda «interpretado» a los 2,6–2,8 s, pero la página necesita casi todo el fichero;
  - las 448 peticiones empezaron a la vez a los 2,7 s: mediana de 4,5 s cada una, p90 de 15 s, máximo 41 s;
  - la primera tinta llega 8–10 s después de la última petición útil: es el dibujado de la lámina (foto aérea más
    vectores) en el procesador.
- **El plano `004122` (23,4 MB), medido antes en la misma sesión**, bajó en **3 peticiones** en 18,3 s y tuvo la
  primera tinta a los 22,4 s. Con la misma red, `004120` fue 11–13 s más lenta por la tormenta de rangos.
- **ACC en frío, por dentro:** carga unos 240 ficheros de su propia aplicación, más telemetría (Segment, Pendo,
  LaunchDarkly, Bugsnag, Dynatrace), antes de abrir el visor. Luego pide 14 paquetes de mosaicos
  (`tiles_files.zip`) y, en paralelo, el `page.pdf` que ACC generó al subir la lámina.
- **Al reabrir, ALEPHIA gana:** guarda el documento ya interpretado y no vuelve a bajar nada. ACC vuelve a pedir
  sus 14 paquetes de mosaicos.
- **Peticiones repetidas en ALEPHIA** en cada apertura: `api/docs/miniaturas/urls` 4 veces, y tras abrir, 5
  `api/docs/signed-url` para preparar las vecinas.

## 3 · Acercamiento

### Una muesca

| | ALEPHIA (lámina 004120) | ACC (misma lámina) |
|---|---|---|
| Acercar | ×1,10 | ×1,1056 |
| Alejar | ×0,909 | ×0,908 |
| Mitad del paso | 17–20 ms (una vez 59) | 12–15 ms |
| 90 % del paso | 51–61 ms | 72–106 ms |
| Paso terminado | 64–86 ms | 219–267 ms (cola larga y suave) |
| Punto bajo el cursor | ≤ 1,14 px | 0,05 px |
| Peor fotograma durante el paso | 43–67 ms | 32–37 ms |
| Fotograma final del visor | — | 348–372 ms tras la muesca |

- **La sensación es la misma:** el paso es igual de grande y el punto no se mueve.
- **ACC tiene una cola más larga**, casi imperceptible, que termina a los ~250 ms. El 13-sep, con otro plano, midió
  44 ms al 90 % y ~60 ms al final. Hoy su visor también estaba cargando mosaicos o el vectorial.

### Muchas muescas seguidas

Diez muescas por ráfaga. Aumento respecto a la lámina encuadrada.

| Tramo | ALEPHIA | ACC |
|---|---|---|
| Hasta ×3–4 (ALEPHIA ×1,2→×3,1 · ACC ×1,5→×4,1) | Fotograma p95 21 ms, peor 287 ms. La hoja entera se redibuja nítida | p95 16 ms, peor 37 ms. Fotograma final a los 315 ms |
| **El tramo de los tirones** (ALEPHIA ×3,1→×8,1 · ACC ×4,1→×11,2) | **p95 68 ms, 5 fotogramas de más de 100 ms, peor 365 ms.** Borroso justo tras la última muesca (1 px de imagen por 2,6 de pantalla), nítido a los **961 ms** | p95 16 ms, peor 34 ms. Fotograma final a los 306 ms |
| Más profundo (ALEPHIA ×8,1→×21) | p95 15 ms, peor 22 ms. Nítido a los 127 ms | No medido |

- **ACC dibuja con la tarjeta gráfica**, sobre el PDF vectorial que preparó al subir: fluido a cualquier zoom.
- **ALEPHIA dibuja con el procesador.**
  - Entre ×3 y ×8 todavía redibuja la hoja entera cerca de su tope de píxeles, y eso bloquea la página: son los
    tirones.
  - A más zoom solo dibuja el recorte visible, y vuelve a ir suelto.
- **Nitidez al final:** las dos quedan nítidas. En el recorte de ACC a ×11, las líneas se ven vectoriales.

## 4 · El «salto de 100 px» era de la herramienta, no del lector

- **Lo que se vio:** con la rueda de la extensión de Chrome, tras cada muesca la vista de ALEPHIA bajaba 100 px
  (subía al alejar), siempre la misma cifra y a cualquier zoom.
- **Comprobado:**
  - el evento de rueda llega **anulado** (`defaultPrevented`);
  - durante el paso, el lector corrige el scroll y mantiene el punto a menos de 1 px;
  - ~210 ms después, el contenedor salta 100 px **sin ninguna asignación desde el código de la página**
    (interceptadas `scrollTop`, `scrollTo` y `scrollBy`);
  - con la rueda lanzada desde la página, **no hay salto** y el punto se queda a 0,1 px.
- **Conclusión:** la extensión desplaza la vista por su cuenta después de la rueda. En ACC no se nota porque su
  visor no desplaza la página.
- **Para próximas mediciones:** en ALEPHIA, rueda desde la página. En ACC, rueda real midiendo la cámara.

## 5 · Qué se podría hacer (no hecho; cada punto con su autorización)

Ordenado por impacto en la primera apertura, que es donde se pierde.

1. **Cortar la tormenta de rangos (horas).**
   - **Qué pasa:** con `004120`, pdf.js pasó a pedir el fichero en trozos de 64 KB, ~450 a la vez. Con `004122`,
     bajó en 3 peticiones.
   - **Probar:** `disableRange` para las URL firmadas de Google Cloud, o trozos mucho mayores (`rangeChunkSize` de
     1–2 MB), y medir con estas dos láminas.
   - **Esperable:** la descarga de `004120` como la de `004122`, ~11–13 s menos hoy. Hay que confirmar la causa
     antes: es la hipótesis que mejor encaja, no está demostrada.
2. **Una vista legible en 1–2 s, como los mosaicos de ACC (días; toca el servidor).**
   - **Idea:** generar al subir una imagen de la lámina a alta resolución (o una pirámide de mosaicos) y enseñarla
     mientras llega el PDF.
   - **Por qué:** hoy la miniatura de 0,6 s no se lee. Es lo que hace que ACC «se vea» a los 6 s aunque su
     vectorial llegue a los 59.
3. **Dibujar primero en baja resolución (horas).** La primera tinta de una lámina pesada cuesta 8–10 s de
   procesador. Un primer dibujado rápido a la mitad de resolución y el refinado después reduciría la espera
   visible.
4. **Quitar los tirones entre ×3 y ×8 (horas).** No redibujar la hoja entera mientras la rueda sigue girando y
   pasar antes al recorte visible.
5. **Peticiones repetidas (minutos).** `miniaturas/urls` se pide 4 veces en cada apertura.

## 6 · Qué no se tocó

- En ACC y en ALEPHIA no se cambió ningún dato ni ajuste.
- Se abrieron y cerraron documentos, se ampliaron y se recorrieron carpetas.
- La ventana de ACC quedó ampliada a ×11 sobre la lámina.
- No hay código ni commit.
