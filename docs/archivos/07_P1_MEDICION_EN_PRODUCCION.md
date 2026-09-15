# P1 · Medición en producción, antes y después

15-sep-2026. Sigue a `06_P1_APERTURA_SIN_TRABAJO_REPETIDO.md`. P1 (`27ea400`, que va sobre el lector `1810d11`) ya está desplegado. Aquí se compara con la medición de antes, contra las puertas que pusiste.

**Estado:** P1 está desplegado y medido. La medición destapó un defecto que no viene de P1, sino del lector (`1810d11`): al reabrir un plano, la hoja se dibuja dos veces. Al probar el arreglo salió otro defecto, anterior al lector: a veces la hoja se queda descentrada al abrir. Los dos arreglos son pequeños, solo tocan `PDFViewer.jsx` y están probados en el banco. Con tu autorización («APLICA») van en **dos commits aparte, sin push ni despliegue**: primero el del dibujado repetido (§4) y después el del centrado (§5).

## En corto

- **Las seis puertas de P1 pasan** (§3), con dos avisos:
  - la carga en frío del plano pesado no se puede comparar, porque ese rato la red iba 2,4 veces más lenta;
  - la versión fija, el enlace directo y Reviews se probaron en el banco antes del commit. En producción solo se usó Atrás.
- **DWG:**
  - legible a los 2,39 s en frío (antes, 3,52 s);
  - al reabrir, a los 1,76 s (antes, 2,05 s);
  - ACC, con su visor ya cargado, tarda 2,7 s;
  - según tu regla, **P2 no hace falta**. Queda como opción.
- **PDF de 400 KB:** primer trazo a los 2,82 s en frío (antes, 3,36 s). Al reabrir tarda lo mismo que antes, 0,09 s.
- **Plano pesado:** ya no baja las vecinas grandes. Antes bajaba dos de unos 23 MB cada una (~46 MB) sin que nadie las pidiera. Ahora no baja ninguna.
- **Peticiones repetidas:**
  - la segunda URL firmada ya no se pide en ninguna apertura;
  - la traducción del CAD ya no va a Autodesk si el plano ya estaba traducido.
- **Defecto del lector, no de P1:**
  - al reabrir un plano, la hoja se ve bien y, una décima después, se vuelve a dibujar entera fuera de pantalla;
  - con el plano de paisajismo 004122 son **12,6 s con el procesador ocupado** justo después de verse la hoja, con bloqueos de hasta 1 s: el zoom y el desplazamiento van a saltos;
  - con planos ligeros son 0,2–0,5 s y no se nota;
  - **causa:** desde el lector, cada encuadre pide un dibujado nuevo aunque la escala no cambie, y al abrir hay un encuadre de más;
  - **arreglo:** pedirlo solo si se cortó un zoom a medias, que es para lo que se añadió, y que el doble clic no viaje si la hoja entera ya se ve (§4);
  - en el banco, al reabrir, la hoja vuelve a dibujarse una sola vez, y todo gesto que tiene que dibujar sigue dibujando.
- **Otro defecto, anterior al lector:**
  - a veces la hoja sale descentrada al abrir y se queda así: en el banco, 10 de 108 aperturas sin el arreglo;
  - **arreglo:** dar al lienzo su tamaño antes de centrarlo (§5). Con él, 0 de 56 veces.

## 1 · Cómo se midió

- **Igual que la medición de antes:**
  - en tu Chrome;
  - con los mismos tres archivos, abiertos desde su carpeta;
  - con la pestaña a la vista.
- **Qué se registró dentro de la página:**
  - la hora del primer clic;
  - cada petición;
  - las marcas `[lector]`;
  - los eventos del visor de Autodesk;
  - las tareas largas.
- **Tres hitos por apertura:**
  - **respuesta visual:** el lector o el giro del visor en pantalla;
  - **legible:** el primer trazo del PDF o el primer fotograma del CAD;
  - **final:** el dibujo completo o el fotograma final.
- **Frío:** página recién cargada. **Caliente:** reabrir en la misma página.
- **Carga masiva:** no hubo durante ninguna de las dos mediciones. La última entrada de la Sala de Cuarentena es de las 10:17:26. Se midió antes de 11:11 a 11:38 y después, de 15:05 a 15:35.
- **Diferencias entre las dos:**
  - el backend se había reiniciado una hora antes, porque se colgó tras el despliegue (§6);
  - con el plano pesado en frío, la bajada desde Google Cloud tardó 14,8 s, frente a 6,2 s antes. P1 no toca esa bajada, así que esos tiempos de dibujo no se comparan. Las peticiones sí.
- **Versiones medidas:** backend `27ea400f7a0a` y portal `index-ebE4CIvV.js`.

## 2 · Resultados

Tiempos en segundos desde el clic. En las cronologías, «inicio→fin» en milisegundos.

### PDF de 400 KB · `500125-SP-CNS-GEN-ICE-P08-0001_1.pdf`

| | Frío, antes | Frío, después | Caliente, antes | Caliente, después |
|---|---|---|---|---|
| Respuesta visual (lector) | 0,04 | 0,04 | 0,02 | 0,01 |
| Silueta | 1,95 | 2,27 | — | — |
| **Legible** (primer trazo) | **3,36** | **2,82** | **0,08** | **0,09** |
| **Final** (dibujo completo) | 3,58 | 3,04 | 0,11 | 0,10 |
| Peticiones al abrir | 6 | 5 | 5 | 4 |

- **Frío, antes:**
  - marcas 11→544 · calibración 11→537 · miniaturas 11→992 · versiones 11→756;
  - **URL firmada 11→729** (para el escritorio) · **URL firmada 11→1226** (para la vista);
  - el plano se baja de 1279 a 3196.
- **Frío, después:**
  - marcas 11→835 · calibración 11→610 · miniaturas 12→1279 · versiones 13→880;
  - **URL firmada 13→874, una sola**;
  - el plano se baja de 946 a 2680: empieza 0,33 s antes, porque la vista ya no espera su propia URL.
- **La silueta, 0,3 s más tarde:** las miniaturas respondieron más tarde (1,28 s frente a 0,99 s). Fue la primera llamada tras reiniciar el backend. En los otros tres casos, las miniaturas tardaron lo mismo o menos (0,84→0,61; 0,90→0,79; 1,16→1,16).
- **Caliente:** antes se pedía una URL firmada que sobraba (16→620). Ahora no se pide.

### DWG de 2,1 MB · `RELLENO_POLITECNICO.shared_1.dwg`

| | Frío, antes | Frío, después | Caliente, antes | Caliente, después |
|---|---|---|---|---|
| Respuesta visual | 0,05 («Preparando vista segura…»); giro del CAD a 0,92 | 0,04 (giro del CAD) | 0,01 | 0,01 |
| Visor creado | 3,22 | 2,08 | 1,85 | 1,52 |
| **Legible** (primer fotograma) | **3,52** | **2,39** | **2,05** | **1,76** |
| **Final** (fotograma final) | 3,59 | 2,44 | 2,20 | 1,92 |

- **Frío, antes:**
  - URL firmada 8→504 (escritorio) · **URL firmada 8→901, para la vista, que el CAD no usa** · versiones 8→722;
  - **traducción 904→2133**, que va a Autodesk · script del visor 2134→2199;
  - token 2181→2761 · tarea larga de 453 ms · visor 3222 · primer fotograma 3524.
- **Frío, después:**
  - **URL firmada 14→667, una sola** · versiones 14→643;
  - **traducción 316→1152, con lo guardado** · script del visor 1154→1213;
  - token 1205→1666 · tarea larga de 407 ms · visor 2080 · primer fotograma 2385.
- **Caliente, antes:**
  - traducción 5→948 · URL firmada 6→455 · versiones 6→772;
  - token 949→1473 · visor 1850 · primer fotograma 2054.
- **Caliente, después:**
  - traducción 6→704, con lo guardado · **sin URL firmada** · versiones 6→754;
  - token 705→1094 · visor 1522 · primer fotograma 1760.
- **La traducción, ya sin ir a Autodesk,** todavía tarda 0,7–0,8 s. Es lo que cuesta cualquier petición a este servidor: versiones tarda lo mismo.
- **En frío, la traducción empieza a los 0,32 s:** son los ~0,3 s que React espera antes de enseñar el primer CAD de cada página (anotado en `06`). Es cosa de P2.

### Plano de paisajismo de 23,4 MB · `500125-CSSP001-740-XX-DR-LS-004122.pdf`

| | Frío, antes | Frío, después | Caliente, antes | Caliente, después |
|---|---|---|---|---|
| Respuesta visual (lector) | 0,05 | 0,06 | 0,02 | 0,02 |
| Silueta | 1,49 | 1,98 | — | — |
| Bajada del plano | 1,13→7,30 (6,2 s) | 0,89→15,71 (14,8 s, red lenta) | — | — |
| **Legible / final** | 11,30 / 12,82 | no comparable (red) | ~0,21 / 0,47 | 0,33 / 0,57 |
| Peticiones al abrir | 6 | 5 | 5 | 4 |
| **Vecinas** | 6 firmas y **2 bajadas (~46 MB)** hasta los 26,4 s | 6 firmas y **0 bajadas** | — | — |
| **Procesador tras verse la hoja** | — | — | 1 tarea larga de 61 ms | **12,6 s ocupado** (§4) |

- **Frío, antes:**
  - la vecina 004123 se firma de 9720 a 10090 y se baja de 10149 a 16821, a la vez que se dibuja el plano abierto;
  - la vecina 004121 se firma de 16846 a 17832 y se baja de 17880 a 23927.
- **Frío, después:** seis firmas entre 18128 y 23333, y ninguna bajada. La única otra bajada de Google Cloud es la miniatura, de 794 a 1968.
- **Silueta más tarde (1,98 s):** la miniatura se bajó con la misma red lenta. La petición de miniaturas fue más rápida que antes: 0,79 s frente a 0,90 s.
- **Caliente, después:** hubo dos pasadas.
  - En la primera, la marca de dibujo completo no llegó en 8 s, y hubo 75 tareas largas que sumaron 7,4 s.
  - La segunda se hizo con los lienzos vigilados: la hoja salió completa a los 0,57 s y después vino el dibujado repetido.

## 3 · Las puertas

| Puerta | Resultado |
|---|---|
| El PDF pequeño no empeora perceptiblemente | ✓ En frío, el primer trazo pasa de 3,36 a 2,82 s. En caliente, de 0,08 a 0,09 s, que es ruido. La silueta en frío salió 0,3 s más tarde por las miniaturas tras el reinicio (§2). |
| El DWG en caliente mejora o no empeora | ✓ Legible: de 2,05 a 1,76 s. Final: de 2,20 a 1,92 s. En frío, de 3,52 a 2,39 s. |
| Hay menos peticiones redundantes, demostradas | ✓ **URL firmada:** PDF en frío 2→1 y en caliente 1→0; DWG en frío 2→1 y en caliente 1→0; plano pesado en frío 2→1 y en caliente 1→0. **Traducción:** responde con `origen: guardado`, sin ir a Autodesk: de 1,23 a 0,84 s en frío y de 0,94 a 0,70 s al reabrir. |
| El PDF pesado deja de bajar vecinas grandes que nadie pidió | ✓ De 2 bajadas (~46 MB) a 0. Las 6 firmas siguen: son baratas. |
| No se rompe la versión fija, el enlace directo, Atrás/Adelante ni la apertura desde Reviews | ✓ Probado en el banco antes del commit (`06`, §3). En producción, Atrás cerró el visor en todas las aperturas. Lo demás no se repitió. |
| No hay memoria persistente nueva ni peticiones huérfanas al cerrar | ✓ En todos los cierres: ninguna petición empezada o terminada después de cerrar, ningún lienzo y el visor de Autodesk liberado. La memoria se midió en el banco: igual que en HEAD (`06`). La prueba de cerrar con una vecina bajando ya no aplica a PAISAJISMO, porque allí todas pesan más de 5 MB y no se bajan. |

- **P2 (visor de CAD precargado):** tu regla era proponerlo si el primer CAD seguía muy por encima de ACC.
  - Nuestro primer CAD de la página sale a los 2,39 s. ACC tarda 2,7 s con su visor ya cargado; su primera vez no se pudo medir.
  - **No lo propongo ahora.** Si más adelante interesa, lo que queda es: los ~0,3 s de espera de React, arrancar el visor (0,4 s de tarea larga) y la traducción (0,7–0,8 s, de servidor).

## 4 · Defecto del lector: la hoja se dibuja dos veces al reabrir

### Qué pasa

- **En producción, al reabrir el 004122:**
  - la hoja sale completa a los 0,57 s;
  - a los 0,71 s empieza otro dibujado de la hoja entera, en un lienzo fuera de pantalla;
  - termina a los 13,3 s y se vuelca encima con la misma imagen;
  - mientras tanto, hay tareas largas de 0,5 a 1,1 s cada segundo (≈90 % del hilo ocupado) y pdf.js usa 4938 lienzos temporales.
- **Antes del lector (6e51793), la misma reapertura:** 0,47 s y una sola tarea larga de 61 ms.
- **Reproducido en el banco** (Chrome sin ventana, pantalla al 125 %). Se construyó el mismo banco con el árbol de 6e51793 y con HEAD, y se contaron los dibujados de la hoja:

| Caso | 6e51793 | HEAD `27ea400` |
|---|---|---|
| Cinta de vecinas, abrir en frío | 1 dibujado · 6,36 s | 1 dibujado · 5,97 s |
| Cinta de vecinas, **reabrir** | 1 dibujado · 0,44 s · 0 ms en tareas largas | **2 dibujados:** el segundo, en el búfer, de 0,37 a 0,84 s · 182 ms en tareas largas |
| Expediente, abrir en frío | 1 dibujado · 7,21 s | 1 dibujado · 8,43 s |
| Expediente, **reabrir** | 1 dibujado · 0,34 s | **2 dibujados:** 0,37 s y otro, en el búfer, de 0,38 a 0,62 s |

### Por qué

1. **Al abrir, el vigilante de tamaño avisa nada más engancharse** y reencuadra 120 ms después (`fitTo`):
   - eso ya pasaba antes del lector y no costaba nada;
   - `setScale` con la misma escala no cambia nada.
2. **El lector añadió a `fitTo` un contador,** `setEscalaFijada(n => n + 1)`, que obliga a dibujar nítido aunque la escala no cambie:
   - hace falta cuando se corta un zoom a medias, porque el zoom abandona su dibujado al empezar;
   - pero se puso para todos los encuadres.
3. **Ese dibujado forzado va por el camino del zoom:**
   - dibuja en un lienzo fuera de pantalla, que la tarjeta gráfica no acelera;
   - con un plano ligero son décimas de segundo; con 004122, 12,6 s.

- **En frío no pasa:** el primer aviso llega antes que el documento, y `fitTo` sale sin hacer nada.
- **Por qué salió en la medición de P1:** P1 no dibuja nada. El defecto entró con el lector y llegó a producción en el mismo despliegue.

### El arreglo

- **Dónde:** solo `frontend-docs/src/components/PDFViewer.jsx`: 11 líneas de código (7 nuevas y 4 cambiadas), más sus comentarios.
- **Qué hace:**
  - `pararZoom` devuelve si había un zoom en marcha;
  - `fitTo` solo fuerza el dibujado si cortó un zoom. Si no había ninguno en marcha, hace lo mismo que antes del lector;
  - el doble clic no viaja ni pide dibujado si la hoja entera ya se ve (con menos de medio píxel de diferencia) y no había zoom que cortar.

```diff
   const pararZoom = useCallback((confirmar) => {
     const motor = zoomVivoRef.current;
-    if (!motor.raf) return;
+    if (!motor.raf) return false;
     cancelAnimationFrame(motor.raf);
     motor.raf = 0;
     if (confirmar) {
       setScale(escalaVisualRef.current);
       setEscalaFijada(n => n + 1);
     }
+    return true;
   }, []);
 …
   // verHojaEntera (doble clic)
-    pararZoom(false);
+    const habiaZoom = pararZoom(false);
 …
+    if (!habiaZoom && Math.abs(desde.escala - hasta.escala) * base.width < 0.5
+      && Math.abs(desde.left - hasta.left) < 0.5 && Math.abs(desde.top - hasta.top) < 0.5) {
+      fitModeRef.current = 'page';
+      setFitMode('page');
+      return;
+    }
 …
   // fitTo («Ajustar página», el encuadre al abrir y al cambiar el tamaño de la vista)
-      pararZoom(false);
+      const habiaZoom = pararZoom(false);
 …
-      setEscalaFijada(n => n + 1);
+      if (habiaZoom) setEscalaFijada(n => n + 1);
```

- **Por qué basta:**
  - todo zoom y todo viaje a la hoja entera ya pide su dibujado al terminar: la rueda al llegar, el doble clic al llegar y `pararZoom(true)`;
  - lo único que puede quedarse sin pedir es un zoom que `fitTo` o el doble clic cortan a medias, y ese caso se conserva.
- **Lo que no toca:**
  - si la hoja está a la escala de hoja entera pero desplazada, el doble clic sigue viajando y pide un dibujado de más. Es raro: con la hoja entera a la vista casi nunca hay nada que desplazar;
  - lo que ya pasaba antes del lector (§6).

### En el banco con el arreglo

Se construyó el mismo banco con estos árboles:

- `6e51793`, de antes del lector;
- HEAD `27ea400`;
- **v1:** HEAD con el cambio de `fitTo`;
- **v2:** v1 más el cambio del doble clic. Es el arreglo de esta sección;
- **v3:** v2 más el arreglo del §5.

**Reabrir.** Dibujados de la hoja y, entre paréntesis, cuándo termina el dibujo:

| Caso | 6e51793 | HEAD | v1 | v2 |
|---|---|---|---|---|
| Cinta de vecinas | 1 (0,40 s) | **2** (0,84 s) | 1 (0,34 s) | 1 (0,47 s) |
| Expediente | 1 (0,41 s) | **2** (0,71 s) | 1 (0,38 s) | 1 (0,43 s) |
| Abrir en frío (los dos casos) | 1 | 1 | 1 | 1 |

- HEAD, v1 y v2 salen de la misma pasada; 6e51793, de la pasada anterior, en la que HEAD también dibujó dos veces (0,79 s y 0,59 s). En una pasada más, con HEAD, v2 y v3, HEAD volvió a dibujar dos veces en los dos casos, y v2 y v3 una sola.
- En frío, el dibujo completo va de 5,1 a 8,8 s según la pasada, con cualquier versión. En la pasada de v2 del expediente, bajar e interpretar el PDF tardó 1,88 s antes de empezar a dibujar; no depende del cambio.

**Gestos con la hoja ya encuadrada.** Dibujados de la hoja:

| Gesto | 6e51793 | HEAD | v1 | v2 |
|---|---|---|---|---|
| «Ajustar página» sin haber tocado nada | 0 | **1** | 0 | 0 |
| Doble clic con la hoja ya entera | 0 (no había doble clic) | **1** | **1** | 0 |
| Una muesca de rueda | 1 | 1 | 1 | 1 |
| «Ajustar página» después del zoom | 1 | 1 | 1 | 1 |
| «Ajustar página» a los 40 ms de empezar un zoom | 1 | 1 | 1 | 1 |
| Zoom, doble clic y «Ajustar página» nada más llegar | 1 | 1 | 1 | 1 |

- En todos los casos la hoja termina nítida: la imagen tiene tantos píxeles como su tamaño en pantalla. Con v3 salió igual que con v2.
- Las cuatro últimas filas son gestos que sí tienen que dibujar, y el arreglo no se salta ninguno. Tampoco el del zoom cortado, que es para lo que existe el contador.

**Escenas del lector** (`medir.mjs`, 24 escenas, pantalla al 125 %; tres pasadas con HEAD, tres con v1, tres con v2 y tres con v3):

- Ninguna de las doce pasadas dio errores de página.
- Iguales en todas las versiones:
  - las escalas;
  - la nitidez del detalle, a 1 px de imagen por px de pantalla a 8×, 20×, 40× y 64×;
  - las marcas, pegadas a la hoja (0 px);
  - el error del punto bajo el cursor, por debajo de 0,6 px.
- El doble clic tras un zoom sigue llegando a la hoja entera en 0,50 s, con un dibujado, y la deja exactamente donde la deja «Ajustar página» (0 px).
- Lo que cambia entre pasadas cambia igual con cualquier versión:
  - la flecha que pasa de página dibuja una o dos veces, según el instante;
  - si la rueda corta el doble clic, la escala final depende del momento del viaje en que llega;
  - en una pasada de v3, las posiciones se separan entre 0,8 y 3,2 px. Son múltiplos de un píxel del dispositivo (0,8 px al 125 %) que se van sumando de una escena a la siguiente;
  - en dos pasadas de v2, la hoja arrancó descentrada: es el defecto del §5, y no viene del arreglo.
- **Medianas de tiempo**, en ms (HEAD | v2 | v3): una muesca 64 | 64 | 64 · ráfaga de 5 muescas 258 | 252 | 299 · tecla + 73 | 75 | 75 · alejar hasta el tope 1682 | 1695 | 1709 · doble clic a la hoja entera 498 | 496 | 500 · nítido a 8× 947 | 902 | 982 · a 20× 329 | 341 | 337 · a 40× 332 | 330 | 330 · al tope 106 | 110 | 113 · vuelta a la hoja entera 104 | 110 | 106 · plano I a 20× 719 | 835 | 838 · plano I girado 700 | 441 | 336.
- Las diferencias son del tamaño de lo que cambia una misma versión de una pasada a otra (hasta 404 ms en una misma escena). En estas escenas, el código cambiado no se ejecuta o toma el mismo camino que en HEAD: con la rueda, el modo pasa a «custom» y el vigilante de tamaño se desengancha; el doble clic después de un zoom no está en la hoja entera, y el tamaño del lienzo que pone `fitTo` es el mismo que pone después `applyPreviewSize`.

## 5 · Otro defecto, anterior al lector: la hoja puede salir descentrada al abrir

- **Qué pasa:**
  - a veces, al abrir, la hoja no queda en el centro, sino desplazada hacia la derecha y hacia abajo, y así sigue hasta que la mueves;
  - con el plano A del banco, el desplazamiento es de (+397,5, +311,8) px.
- **Cómo salió:** en dos pasadas de las escenas del lector con v2, todas las posiciones de un grupo de escenas estaban desplazadas lo mismo.
- **Cuántas veces:** se abrió el lector una y otra vez, intercalando versiones. Salió descentrada:
  - con HEAD, 5 de 68 veces;
  - con v1, 3 de 12 veces;
  - con v2, 2 de 28 veces.
- **No viene del arreglo del §4:** sale también con HEAD, sin él.
- **Por qué:**
  - `fitTo` centra el scroll en el siguiente fotograma. Si React todavía no ha dado al lienzo el tamaño de la escala nueva, se centra el tamaño que tenga, y un lienzo recién montado mide 300×150;
  - las cuentas cuadran: (1094,3 − 300)/2 = 397,2 y (773 − 150)/2 = 311,5;
  - el mismo centrado ya estaba en 6e51793, con una holgura de 45vh/45vw (leído en el código, no medido en el banco). El lector amplió la holgura a 100vh/100vw.
- **Arreglo:** `fitTo` da al lienzo su tamaño en el acto, antes de centrar. Es la misma cuenta que ya hace `applyPreviewSize`, pero sin esperar a React. Son 5 líneas de código.

```diff
       setFitMode(mode);
       setDesplazamiento({ x: 0, y: 0 });
+      baseVpRef.current[`${currentPage}:${rotation}`] = { width: vp1.width, height: vp1.height };
+      if (canvasRef.current) {
+        canvasRef.current.style.width = `${vp1.width * escalaVisualRef.current}px`;
+        canvasRef.current.style.height = `${vp1.height * escalaVisualRef.current}px`;
+      }
       // Con holgura alrededor, encuadrar tiene que dejar la hoja EN EL CENTRO
```

- **En el banco:**
  - con v3 (v2 más este cambio), la hoja salió descentrada 0 de 56 veces;
  - gestos, reapertura y escenas del lector, igual que con v2 (§4).
- **Dos commits:** primero el del §4 y después este. Así se midieron: v2 lleva solo el primero y v3, los dos.
- **En el repositorio:**
  - con el arreglo del §4, `PDFViewer.jsx` es byte a byte el de v2; con los dos, el de v3;
  - con los dos aplicados, el banco construido desde el repositorio dio: centrado al abrir 0 de 40 aperturas descentradas, frente a 7 de 40 con HEAD en la misma corrida; al reabrir, 1 dibujado en los dos casos (HEAD, 2); «Ajustar página» y doble clic con la hoja ya encuadrada, 0 dibujados (HEAD, 1); una muesca, «Ajustar página» tras el zoom o a medio zoom y zoom + doble clic + «Ajustar página», 1 dibujado y la hoja nítida; las 24 escenas del lector, tres pasadas sin errores de página e iguales a HEAD salvo lo que depende del instante (y, en una pasada, posiciones a 1–4 píxeles del dispositivo);
  - `npm test`: 10 bancos en verde;
  - ESLint de `PDFViewer.jsx`: los mismos 4 errores que HEAD (no-unused-vars, ya estaban), ninguno nuevo, tanto con A como con A+B.

## 6 · Otros

- **Cuelgue del backend tras el despliegue:**
  - arrancó bien (18:52:57Z «Booting worker», 18:53:05Z «Live») y dejó de responder;
  - lo reiniciaste a las 19:57:39Z y siguió estable durante los 30 min que se vigiló;
  - la causa no se sabe: faltan los registros de Render de 18:53 a 19:57 UTC;
  - con 1 proceso y 8 hilos, si los 8 se quedan esperando, el proceso sigue vivo y nadie lo reinicia;
  - es la tercera vez que pasa (3-ago, 13-sep, 15-sep).
- **Anterior al lector, no es regresión:** tras un zoom, el primer dibujado de la página o del documento siguiente también va por el búfer.
  - El dibujado lee el aviso de antes del cambio.
  - En planos pesados es el camino lento.
  - Queda anotado para otro lote.

## 7 · Qué falta

1. **Push y Manual Deploy del portal** con los dos commits del lector; el backend no cambia. Después, en producción: reabrir el 004122 (tiene que dibujarse una sola vez) y abrir planos varias veces para ver que salen centrados.
2. **Los registros de Render del cuelgue** (18:53–19:57 UTC), para saber la causa.
3. **Opcional:** repetir en producción la versión fija, el enlace directo y la apertura desde Reviews. Solo son lecturas.
