# Lector de planos · por qué se ve borroso al acercar, y qué se puede hacer

17-sep-2026. Pregunta del propietario tras desplegar P1: «me acerco, se ve borroso, espero unos segundos y se ve
nítido, y así cada vez que me acerco» — y en ACC eso no se ve. **§1–§6: sólo diagnóstico, sin tocar código.**
**§7 (18-sep): arreglo de la apertura aplicado y medido en local, sin commit.** El zoom sigue sin tocar.

## 1 · En corto

Hay **dos situaciones distintas**, y conviene no mezclarlas:

1. **Acercar cuando la lámina ya está dibujada entera.** El lector agranda al instante lo que ya tiene y luego lo
   vuelve a dibujar a la escala nueva. En este PC, con un Chrome limpio, se pone nítido en **0,16–0,64 s**. En tu
   Chrome de todos los días se midió **~1 s** entre ×3 y ×8 (informe 09). **ACC: ~0,3 s**, y sin tirones.
2. **Acercar mientras la lámina todavía está cargando.** En producción, el documento se abre en ~4 s: ya se puede
   acercar, pero el PDF de una lámina pesada no termina de bajar hasta ~35–45 s. Mientras tanto no hay con qué
   dibujarla nítida, así que lo que se agranda es la imagen previa, y **se queda borrosa hasta que termina el
   vector**. Antes de P1 pasaba lo mismo, pero con la miniatura, y no se notaba porque casi no se veía nada. Ahora
   la lámina se ve enseguida, dan ganas de acercar, y se nota.

**ACC no tiene ninguno de los dos problemas** porque, al subir el plano, prepara la lámina a varias resoluciones
en trozos («pirámide de mosaicos»): al acercar sólo trae los trozos de la zona que miras, ya hechos a ese tamaño.
Nosotros volvemos a dibujar el PDF.

## 2 · Medido (lámina `004120`, 71,9 MB, banco local con el lector real)

Tiempo desde la última muesca de rueda hasta que la hoja se ve nítida:

| Zoom | Chrome sin ventana, escala 1 | Sin ventana, escala 1,25 | **Con ventana real, escala 1,25** |
|---|---|---|---|
| ×1,5 | 0,60 s | 0,49 s | **0,47 s** |
| ×2 | 0,56 s | 0,42 s | **0,43 s** |
| ×3 | 0,44 s | 0,39 s | **0,37 s** |
| ×4 | 0,42 s | 0,83 s | **0,40 s** |
| ×6 | 0,81 s | 0,34 s | **0,64 s** |
| ×8 | 0,33 s | 0,17 s | **0,29 s** |
| ×12 | 0,17 s | 0,17 s | **0,16 s** |

**En qué se va el tiempo:**
- 110 ms de espera fija antes de empezar a redibujar, para no dibujar a mitad de un gesto.
- Hasta ~×5, el lector **redibuja la hoja entera** a la escala nueva, hasta 16 megapíxeles. El hilo principal de
  JavaScript está casi parado (el perfil de CPU da 150–300 ms de `drawImage` en siete segundos): el trabajo es de la
  tarjeta gráfica, que pinta la foto aérea y miles de líneas.
- **El peor punto es el salto de ~×4–×6**, donde se juntan dos pasadas —la hoja entera al tope y después el detalle
  nítido de la zona visible—: 0,64–0,83 s.
- Por encima del tope sólo se dibuja la zona visible: 0,16–0,34 s, ya comparable con ACC.

**Acercar durante la carga** (red emulada como la de producción): la hoja no se pone nítida hasta que termina el
vector, **47 s después** en esta lámina. En el banco el documento abre tarde y la rueda no hace nada hasta entonces;
en producción abre a los ~4 s, así que ahí sí se puede acercar y ver la imagen previa agrandada durante ~40 s.

## 3 · Opciones, de menor a mayor

### A · Afinar el redibujado del lector (pequeño, sólo el portal)

- Dibujar **primero la zona visible** a la escala nueva, que es lo que se está mirando, y la hoja entera después,
  cuando esté libre. Así desaparece la doble pasada del salto ×4–×6.
- Bajar la espera fija de 110 ms a ~40 ms.
- **Esperado:** nítido en ~0,2–0,35 s en todo el recorrido, como ACC, **una vez cargada la lámina**.
- **No arregla** el acercar durante la carga.
- **Coste:** cambio acotado en `PDFViewer.jsx`, medible en el banco que ya existe antes de subir nada.

### B · Una vista previa más grande

Una imagen de 4000 px pesa 1–1,5 MB y aguantaría nítida hasta ~×2 durante la carga, pero a ×4 vuelve a verse
borrosa. Arregla poco y engorda la primera apertura. **No la recomiendo.**

### C · Mosaicos como ACC (grande)

- Al subir el plano, preparar la lámina en trozos a varios niveles de zoom.
- El lector enseña los trozos de lo que miras, al zoom que tienes: **nítido a cualquier zoom, también durante la
  carga**, y el PDF vectorial ya no haría falta para mirar el plano.
- **Coste:** generación al subir (varios segundos por lámina en el servidor), almacenamiento (~10–30 MB por
  lámina), una ruta nueva y un visor de mosaicos en el lector. Es la «pirámide de mosaicos» que quedó sin
  autorizar.

## 4 · Recomendación

**A**, primero. Es barato, se mide en el banco y quita la mayor parte de la diferencia con ACC en el uso normal:
acercar una lámina ya abierta. **C** sólo si acercar durante la carga resulta ser lo que de verdad molesta en obra.


## 5 · Corrección tras la observación del propietario: así no se usa el zoom, y la apertura también falla

El propietario señaló dos fallos del diagnóstico anterior, y los dos eran ciertos:

1. **El zoom se midió por escalones, con pausas.** Una persona gira la rueda **seguida** hasta su punto de interés.
2. **La apertura que él describe no estaba reproducida.** Sus palabras: «abro cualquier PDF, se ve borroso, espero a
   que cargue, es como si se actualizara, vuelve a aparecer incompleto, va cargando y recién carga todo».

### 5.1 · Zoom con la rueda seguida

Chrome con ventana real, escala 1,25, lámina `004120` ya dibujada. La rueda se gira como con el dedo: ráfagas de 6
muescas cada 35 ms, con 220 ms entre ráfagas, de ×1 a **×9,85** en 2,3 s.

- **El movimiento es fluido:** fotograma p95 de 21 ms, el peor de 69 ms, ninguno por encima de 100 ms.
- **Pero durante todo el gesto no se redibuja nada.** El lector estira el dibujo que tenía al empezar, hecho para la
  hoja encuadrada, **hasta ×10**. Al soltar la rueda la vista es una mancha
  (`docs/archivos/evidencias/zoom/zoom_seguido_al_parar_y_despues.png`), y se pone nítida ~0,5 s después.
- **Eso es lo que se ve y lo que ACC no hace.** ACC va trayendo sus mosaicos del nivel de zoom de cada momento
  mientras giras, así que la imagen nunca llega a verse así de borrosa. El problema no es tanto lo que tarda en
  afinar al final —0,5 s— como **lo borroso que llega a estar mientras acercas**.
- Al alejar pasa lo mismo, a la inversa: nítido a los 0,54 s.

### 5.2 · La apertura de un PDF que todavía no tiene vista previa

Lámina pesada, red emulada como la de producción, fotograma a fotograma
(`docs/archivos/evidencias/zoom/apertura_sin_vista_previa.png`):

| Tiempo | Qué se ve | En palabras del propietario |
|---|---|---|
| 0,06 s | la miniatura de 420 px **estirada** | «se ve borroso» |
| 36,6 s | el documento abre y la miniatura queda **tapada por una hoja en blanco** | «es como si se actualizara» |
| 36,6 → 47,1 s | **10,5 s de hoja en blanco** mientras pdf.js prepara el dibujo | |
| 47,1 s | empieza a pintarse por trozos | «vuelve a aparecer incompleto» |
| 47,4 → 50,4 s | se sigue pintando hasta completarse | «va cargando y recién carga todo» |

En producción el documento abre mucho antes (~4 s, porque baja por rangos), así que **la hoja en blanco dura
todavía más**. Esto le pasa a **cualquier PDF que aún no tenga su vista previa**, que hoy son casi todos: se preparan
la primera vez que se abren. Con vista previa, la imagen está dentro de la hoja y tapa el lienzo en blanco hasta que
el dibujo termina, así que esta secuencia no aparece.

## 6 · Lo que lo arreglaría (sin tocar todavía nada)

### Apertura (pequeño, sólo el lector)

Tratar la miniatura **igual que la vista previa**: ponerla dentro de la hoja, en su sitio, y quitarla sólo cuando el
dibujo esté **completo**. Resultado: borroso → nítido **de un solo paso**, sin hoja en blanco y sin pintarse por
trozos, tenga o no vista previa. Reutiliza lo que ya hace P1.

### Zoom con la rueda seguida (mediano, sólo el lector)

1. **Tener preparado un dibujo de más resolución antes de que acerques.** Cuando la hoja termina de dibujarse, en un
   momento libre, dibujarla también al tope de 16 MP. Al acercar se estira ése, no el de la hoja encuadrada, y hasta
   ×3–×4 se ve nítido desde el primer instante.
2. **Refrescar la zona visible durante el gesto**, en las pausas naturales del dedo (~200 ms), sin frenar el
   movimiento.
3. **Al soltar, la zona visible primero** y la hoja entera después.

Esperado: la vista deja de degradarse mientras acercas y afina en ~0,2–0,35 s al soltar. Hay que medirlo con este
mismo gesto antes de subir nada.

### La solución de fondo (grande)

Los **mosaicos** en el servidor, como ACC: nítido a cualquier zoom, incluso mientras carga. Sigue sin autorizar.

## 7 · Apertura: arreglo aplicado y medido en local (18-sep-2026)

Autorizado por el propietario («si») sobre la propuesta de §6. **En local, sin commit, sin push, sin despliegue.** Sólo
`frontend-docs/src/components/PDFViewer.jsx` y `PDFViewer.css`. El zoom (§6, segundo apartado) sigue sin tocar.

### 7.1 · Qué cambia

- La miniatura **ya no flota** sobre el visor: usa la misma capa que la vista previa, **dentro de la hoja y en su
  sitio**. Si la lámina tiene vista previa se enseña ésa; si no, la miniatura.
- Se retira **sólo cuando la página 1 está dibujada entera**, igual que ya hacía la vista previa. Mientras tanto
  pdf.js dibuja debajo sin que se vea: ni hoja en blanco ni trozos.
- **Al cambiar de lámina** con el lector abierto —lo normal en obra, con la cinta o las flechas— la imagen de la
  lámina nueva sale al instante y encuadrada, aunque la anterior estuviera ampliada. La vista previa de P1 no lo
  hacía: sólo aparecía cuando se abría el documento nuevo. Lo vi al revisar el cambio, antes de medir, y va en él.
- Si la vista previa no carga, se vuelve a la miniatura.

### 7.2 · Medido

Misma lámina (`004120`, 71,9 MB), mismo banco y misma red que §5.2: Chrome sin ventana 1920×945, 2,4 MB/s + 200 ms,
fotograma a fotograma (`docs/archivos/evidencias/zoom/apertura_con_el_arreglo.png` y `apertura_medicion.json`).

**Abrir la lámina sin vista previa** (lo que hoy les pasa a casi todas):

| | Antes (`979c2d7`, 17-sep) | Ahora |
|---|---|---|
| Primera imagen | 0,30 s — miniatura flotante, **más grande que la hoja y fuera de su sitio** | **0,33 s — la lámina entera, en su sitio** |
| Hoja en blanco | 36,6 → 47,1 s (**10,5 s**) | **ninguna** |
| Pintándose por trozos | 47,1 → 50,5 s (3,4 s, una veintena de fotogramas distintos) | **ninguno** |
| Nítida | 50,46 s | 47,86 s |
| Fotogramas en blanco o a medias después de verse la lámina | todos los de 36,6 a 50,5 s | **0** |

**Con vista previa (2000 px):** antes ya no había hoja en blanco, y sigue sin haberla. Ahora la miniatura aparece
dentro de la hoja a los 0,25 s, la vista previa legible la sustituye a los 1,18 s (antes 1,26 s) y el vector a los
48,28 s (antes 50,96 s). 0 fotogramas en blanco o a medias.

**Cambiar de lámina con el lector abierto** (de `plano-A` a la pesada; sólo código nuevo):

| Desde | La lámina nueva, entera y encuadrada | Nítida | En blanco o a medias |
|---|---|---|---|
| `plano-A` encuadrada | 0,28 s | 47,87 s | 0 |
| `plano-A` ampliada ×3,14 | 0,27 s | 47,11 s | 0 |
| `plano-A` ampliada ×3,14, con vista previa | 0,26 s (miniatura) → 1,18 s (vista previa) | 46,62 s | 0 |

Al cambiar desde ×3, el registro del DOM ve la caja de la imagen un instante en la posición de la ampliación anterior
antes de centrarse; **ningún fotograma lo enseña**: el centrado ocurre antes de pintar.

**Documento de varias páginas** (`plano-I`, dos páginas, sólo miniatura, red de 600 KB/s): los siete pasos de la
puerta del informe 11 §10. La miniatura sólo en la página 1; en la 2 no; al volver a la 1 reaparece hasta que la 1
está dibujada entera; bien tras 1→2→1 rápido; con el vector listo, nada encima. El estado final es idéntico al de
`979c2d7`.

**Lo que no cambia:** el dibujo del vector —de la descarga al dibujo completo 14,3 s frente a 15,5 s sin vista
previa y 14,8 s frente a 16,2 s con ella; CPU 26,9 s frente a 35,4 s—. Es una medición por variante: tomarlo como
«no más lento», no como una mejora. La reapertura sigue en ~1,1 s. ESLint de `PDFViewer.jsx` igual que HEAD (4, los
mismos); `npm test` 10 bancos en verde; el banco compila.

### 7.3 · Cómo se clasificó cada fotograma

Dentro del recuadro final de la hoja: parte de los bordes nítidos del final que ya están (nitidez), parte en blanco
puro, y parte que difiere del final a 240 px de ancho (lo que se ve «de lejos»). Tramos: fotogramas seguidos que
apenas cambian. Etiquetas, por orden: **NÍTIDA** (nitidez ≥ 0,99) · **EN BLANCO** (≥ 90 % blanco) · **VACÍA** (fondo
liso) · **ENTERA BORROSA** (difiere < 8 % del final a 240 px) · **A MEDIAS** (lo demás).

El clasificador se validó primero con la medición del código anterior, cuya secuencia ya se conocía (§5.2). Esa
validación destapó un fallo suyo: una hoja en blanco también es lisa y salía como «vacía». Se corrigió el orden de
las reglas **antes de clasificar las mediciones del código nuevo**. La miniatura flotante de antes sale como «a
medias» (difiere un 24 % de la hoja final) porque no ocupa el sitio de la hoja: es justo lo que el arreglo cambia.

### 7.4 · Lo que queda

- **Producción: sin probar.** Hace falta commit, push y despliegue del portal (el backend no cambia).
- **Si la lámina no tiene ni vista previa ni miniatura**, el lector se comporta como antes: marca de espera y después
  la hoja en blanco y el dibujo por trozos. Pasa la primera vez que se abre un PDF cuya miniatura no se ha preparado
  nunca: el lector la pide, pero si el servidor contesta «pendiente» no vuelve a pedirla mientras siga en esa lámina
  (salvo que se abra la cinta). Arreglarlo sería volver a pedirla a los pocos segundos; no está hecho ni autorizado.
- **El zoom** (§6): sin tocar, pendiente de decisión.
