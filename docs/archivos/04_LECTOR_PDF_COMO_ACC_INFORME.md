# Lector de planos · manejar el plano como en ACC · informe

15-sep-2026. Pedido: la opción A de `03_LECTOR_PDF_MANIPULACION_COMO_ACC.md` («vamos, con cuidado y profesionalismo»). Solo cuenta cómo responde el plano a la mano; los botones quedan fuera.

**Estado:** hecho y probado en local, en el banco del lector. **Commiteado** con tu autorización («HAGAMOS LOS DOS COMIT»), en un commit propio, antes del lote P1 de velocidad. **Sin push ni despliegue** (§7). El servidor no cambia.

## En corto

- **Rueda:**
  - acerca ×1,10 por muesca y aleja ×0,91, con un paso suave que termina en unos 64 ms;
  - el punto bajo el cursor se mueve menos de 1 px;
  - funciona igual sobre el margen gris, donde antes desplazaba la vista.
- **Doble clic:** la hoja entera en medio segundo. Termina exactamente donde «Ajustar página».
- **Nitidez:**
  - a cualquier zoom, lo que se ve está a la resolución de la pantalla;
  - se puede acercar hasta 64 (antes, 8).
- **Marcas** (nubes, medidas, conteos…): acompañan a la hoja durante el zoom. Antes se despegaban y parpadeaban.
- **De paso:** «+» y «−» del teclado no agrandaban el plano. Ahora sí.

## 1 · Gesto por gesto

«Antes» y «Ahora» están medidos en el banco. «ACC» son las cifras del 13-sep.

| Gesto | ACC | Antes | Ahora |
|---|---|---|---|
| **Rueda sobre la hoja** | ×1,10 al acercar, ×0,91 al alejar. La mitad del paso a los 12 ms, el 90 % a los 44 ms, termina a los ~60 ms | ×1,2 de golpe | ×1,10 y ×0,91. La mitad a los 15 ms, el 90 % a los 43–50 ms, termina a los 63–64 ms |
| **Varias muescas en un solo evento** | Como una | Como una | Como una |
| **Punto bajo el cursor** | Quieto | Menos de 0,5 px (1,6 px en ráfaga) | Menos de 0,7 px, también en ráfaga |
| **Rueda sobre el margen gris** | Zoom | Desplazaba la vista 100 px por muesca | Zoom, igual que sobre la hoja |
| **Alejar** | Hasta ~3,5 veces la hoja | Hasta 0,2. Alejando con el cursor cerca de un borde, 16 de 20 muescas desplazaron la vista en vez de alejar, y el punto se fue 362 px | Hasta 3,5 veces menos que la hoja encuadrada. En una esquina, el punto a menos de 0,6 px |
| **Acercar** | Sin tope práctico | Hasta 8 | Hasta 64 |
| **Arrastrar** | 1:1, sin inercia | 1:1 | 1:1, sin cambios |
| **Doble clic** | Hoja entera, ~0,5 s | Nada | Hoja entera en 0,49 s. Misma posición y tamaño que «Ajustar página» (0 px de diferencia) |
| **Nitidez al acercar** | Vectorial | A 8×, un píxel de imagen por cada 4 o 5 de pantalla | Uno a uno a 8×, 20×, 40× y 64× |
| **Cambiar de página** | Conserva el encuadre | Conserva el encuadre | Igual |

- **Los 3 a 6 ms de diferencia con ACC** en la mitad y el final del paso son el primer fotograma que se pinta tras la muesca. La curva es la misma.
- **Sobre las barras de desplazamiento**, según el código, la rueda cambiaba de página; en el resto del margen desplazaba la vista, como mide la tabla. Ahora la página se cambia con las flechas, RePág/AvPág y la barra de arriba.

## 2 · Lo que además se nota

- **Las marcas siguen a la hoja.**
  - Antes, durante el zoom se despegaban hasta 219 px en una muesca y 1.954 px en una ráfaga, y desaparecían entre 9 y 40 fotogramas mientras el plano se redibujaba.
  - Ahora: 0 px y ningún fotograma sin marcas.
  - Solo se retiran al cambiar de página, girar o abrir otro documento, porque ahí su posición anterior ya no vale.
- **Sin redibujado a medio gesto.**
  - Mientras la rueda gira no se empieza a dibujar la imagen nítida: se dibuja al parar.
  - Con muescas llegando mientras el plano se redibujaba, antes el 5 % de los fotogramas pasaba de 29 ms y el peor llegó a 438 ms; ahora, 18 ms y 155 ms.
- **Teclado.**
  - Antes, «+» agrandaba solo la capa de marcas: el plano no crecía y las marcas quedaban desplazadas 1.626 px.
  - Ahora «+» y «−» acercan y alejan ×1,2 desde el centro, con el mismo paso suave. Ctrl+1 (100 %) también.
- **Panel táctil y pellizco.**
  - No se midieron en ACC.
  - Antes, cada evento del panel era un ×1,2, y un panel manda decenas por segundo.
  - Ahora cuentan en proporción a lo que se desliza.

## 3 · Nitidez, en cifras

A 125 % (la escala de tu pantalla), con el plano A1 del banco:

| Zoom | Imagen de la hoja entera (píxeles de imagen por píxel de pantalla) | Lo que se ve, ahora | Nítido tras la última muesca |
|---|---|---|---|
| Hoja encuadrada | 1,00 | 1,00 | — |
| 8× | 0,20 | 1,00 | ~1 s. Es la primera vez que se pasa del tope, y se redibuja también la hoja entera |
| 20× | 0,08 | 1,00 | 0,33 s |
| 40× | 0,04 | 1,00 | 0,32 s |
| 64× | 0,02 | 1,00 | — |

- **Cómo:** encima de la imagen de la hoja entera se dibuja aparte solo lo que se ve, más un margen, a la resolución de la pantalla. Lo que se ve cabe siempre en el presupuesto, sea cual sea el zoom. Es la misma idea del visor de pdf.js.
- **Memoria:** 24 MP en lienzos a cualquier zoom: 16 de la hoja entera y 8 del detalle. El búfer de 16 MP que antes se quedaba ocupado tras cada zoom ahora se suelta al usarlo.
- **Arrastrar a 40×:** 500 px sin que asome nada borroso, porque el margen del detalle lo cubría.
- **Cambiar de página, girar u abrir otro documento a 20×:** en ningún fotograma queda a la vista el detalle de la hoja anterior. El nuevo llega en ~0,3 s.
- **Menos trabajo a mucho zoom:** si la hoja entera ya estaba al tope de píxeles, no se vuelve a dibujar, porque saldría igual. Solo se dibuja el detalle.

Te paso en el chat dos recortes del mismo sitio a 8×, con el detalle y sin él. «Sin detalle» es lo que se veía antes.

## 4 · Cómo se midió

- **El método de ACC:** ratón y teclado simulados por CDP, y la hoja registrada fotograma a fotograma.
- **Dónde:** en un Chrome sin ventana, con perfil propio y solo el banco local. El panel de navegador del escritorio estaba oculto, y ahí no corren los fotogramas.
- **Con qué:**
  - a 100 % y a 125 %;
  - el A1 vectorial del banco, un plano de dos páginas y marcas simuladas;
  - el lector de `6e51793` (antes) y el nuevo (ahora).
- **Tiempos de dibujado:** vienen de un Chrome sin tarjeta gráfica, así que en tu PC deberían ser iguales o mejores. El paso, la curva y el punto bajo el cursor no dependen de eso.
- **Pruebas:**
  - `npm test`: 8 bancos en verde, con 35 pruebas nuevas en `navegacionLector` (paso, curva, límites, punto, viaje y detalle);
  - ESLint: ningún error nuevo; los 6 que salen ya estaban;
  - build del banco: OK.

## 5 · Qué no cambia y qué queda

- **No cambia:**
  - arrastrar;
  - las herramientas de medir y marcar: con una activa, el doble clic sigue siendo suyo, porque cierra la medida o el área;
  - las teclas de página, los botones y la carga de planos.
- **Queda, si lo quieres:**
  - «Ajustar página» y «Ajustar ancho» siguen saltando de golpe. Se les puede dar el mismo viaje que al doble clic;
  - el panel táctil y el pellizco están tratados, pero sin medir con un panel real.
- **Observado, sin tocar:** después de un zoom, un cambio de página dibuja la página dos veces (medido: dos dibujados). Ya pasaba antes. No lo toco aquí porque afecta a cómo aparece un plano al cambiar, y eso se afinó con tus pruebas.

## 6 · Ficheros

- `frontend-docs/src/utils/navegacionLector.js` (nuevo): las cuentas.
- `frontend-docs/pruebas/navegacionLector.prueba.mjs` (nuevo): 35 pruebas.
- `frontend-docs/src/components/PDFViewer.jsx`: el motor del zoom, la rueda, el doble clic y el detalle nítido.
- `frontend-docs/src/components/PDFViewer.css`: la holgura de la hoja y el lienzo del detalle.
- `frontend-docs/src/components/PdfToolsOverlay.jsx`: la capa de marcas sigue a la hoja.
- `frontend-docs/src/probar-lector.jsx`: el banco, con un plano de dos páginas y marcas.
- Documentos: este informe, la propuesta (`03_…`) y `docs/AI_WORKSTATE.md`.
- **Fuera del commit:** `FilesPage.jsx`, con sus bloques ajenos, y `probar-primitivas.*`.

## 7 · Para producción (autorización tuya en cada paso)

1. **Probarlo tú**, si quieres, con tu ratón antes del commit: `http://localhost:5180/probar-lector.html`. Son los planos de prueba y no pide sesión.
2. **Commit: hecho** («HAGAMOS LOS DOS COMIT»). El lote P1 va en el commit siguiente.
3. **Push** desde tu terminal.
4. **Manual Deploy del portal:** el lector no toca el servidor. Va en el mismo push que el lote P1, que sí lo toca, así que el orden es portal primero y backend después. Después lo compruebo por contenido.
