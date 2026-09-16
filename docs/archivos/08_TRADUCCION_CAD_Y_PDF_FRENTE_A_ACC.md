# Traducción de CAD y estado de los PDF, frente a ACC

15/16-sep-2026. Tu encargo: «necesito que vuelvas a auditar la rapidez de traducción de archivos CAD, Revit, PDF. La idea es replicar la velocidad de ACC… si el usuario ve que es lento, lo descartará». Y tres observaciones tuyas: los PDF salen raros, el CAD tarda en traducir y abrir, y parece que al subir no se traduce, solo al abrir.

**Estado:** medición hecha esta noche con cuatro archivos reales: un DWG de 260,3 MB subido a ACC y a ALEPHIA, y además un RVT de 158 MB, un DWG de 211,6 MB y un PDF, subidos solo a ALEPHIA. Hay un archivo que quedó roto sin arreglo posible y un error de base de datos en cada apertura de PDF. Nada de esto está tocado: aquí solo se mide y se explica.

## En corto

- **La traducción SÍ arranca al subir, y funciona.** Medido esta noche con tres archivos: el RVT de 158 MB y el DWG de 211,6 MB se tradujeron solos, sin que nadie los abriera, y abren bien.
- **El fallo es de nuestra subida, y es intermitente.** El DWG de 260,3 MB llegó mal a Autodesk. Subido OTRA VEZ, el mismo archivo por el mismo camino, **tradujo bien** (§6.1). El primero sigue roto porque **al reintentar no se vuelve a subir**: el backend se conforma con que el objeto «pese más de cero».
- **Nadie se entera de nada.** Nuestra lista no muestra estado: ni «preparando», ni «listo», ni «falló». ACC muestra «Procesando» y un círculo. De ahí la impresión de que solo se traduce al abrir.
- **El proceso web se reinicia solo** («Autorestarting worker») y se lleva por delante lo que esté traduciendo, sin dejar rastro en pantalla.
- **En velocidad estamos a la par de ACC.** La subida la manda tu conexión y la preparación tarda parecido: ACC, 3 min con 260 MB; nosotros, unos 4–5 min con 211,6 MB.
- **Los PDF no están «raros» por el lector: es un error de base de datos.** Cada apertura pide las marcas y el servidor responde 500 (`invalid input syntax for type integer`).
- **El nombre pierde caracteres:** `…011220@011222…` quedó como `…011220011222…`. ACC conserva la `@`. Eso rompe la nomenclatura de rangos del TIDP.

## 1 · Lo medido esta noche

Mismo archivo en los dos: `500125-CSSP001-780-XX-DR-HD-011220@011222-C02_SLC_V02.dwg`, **260,3 MB** (272.897.021 bytes), DWG de AutoCAD 2018 (`AC1032`), que Model Derivative admite.

| | ACC | ALEPHIA |
|---|---|---|
| Subida | 22:41 → 22:46 (5 min) | 22:34:26 → 22:39:24 (**4 min 58 s**) |
| Qué hace al terminar | «Procesando» a la vista, en la lista y en el diálogo | nada: la lista no dice nada |
| Preparación | 22:46 → 22:49 (**3 min**) y listo para abrir | entregado a Autodesk a las 22:40:08 (36 s) y **traducción fallida** |
| Al abrir | abre | «Autodesk no pudo traducir este dibujo: puede estar dañado…» |

- La subida la manda tu enlace: 260 MB a ~0,9 MB/s en los dos casos. Ahí no hay diferencia que arreglar.
- **La fecha que ACC muestra en la lista es la del fin del procesado**, no la del fin de la subida.

**Cronología del nuestro, del log de Render (UTC; réstale 5 h):**

```
03:39:32  [Uploads] Completed — …011222-C02_SLC_V02.dwg V1 (272.897.021 bytes)
03:40:08  [CAD pre] …011222-C02_SLC_V02.dwg: subido y traduciendose
03:48:20  Autorestarting worker after current request · Booting worker with pid 4200
```

Y del archivo anterior, de 33 MB:

```
03:16:59  [Uploads] Completed — P22-DA-5711-…_preliminar.dwg V1 (32.968.761 bytes)
03:39:32  [CAD pre] P22-DA-5711-…_preliminar.dwg: subido y traduciendose      ← ojo: hora de volcado
```

## 2 · Por qué nuestro camino es más largo que el de ACC

| | ACC | ALEPHIA |
|---|---|---|
| 1. El navegador sube el archivo | a Autodesk, directo | a Google Cloud, directo |
| 2. Bajarlo a un servidor | no existe | 260 MB al disco del backend |
| 3. Subirlo a Autodesk | no existe | 260 MB en 3 bloques de 90 MB, uno detrás de otro |
| 4. Traducir | Model Derivative | Model Derivative |

Son unos **520 MB de ida y vuelta** que ACC no hace, por una instancia de 1 CPU. Esta vez ese tramo tardó solo 36 s, así que **no es el cuello de botella hoy**; el problema es que lo que llega al otro lado no sirve.

## 3 · El fallo de traducción

- **El archivo está sano:** ACC lo tradujo, su cabecera es `AC1032` y en Google Cloud pesa exactamente lo mismo que el original.
- **Autodesk lo rechazó:** «Sorry, the drawing file is invalid and cannot be viewed».
- **Conclusión:** lo que nuestro backend depositó en Autodesk no sirve, y **no hay forma de que se rehaga**. Al preparar un CAD, el backend pregunta a Autodesk si el archivo ya está allí y se conforma con que «pese más de cero»:

```python
ya_subido = det.ok and (det.json().get('size') or 0) > 0
if ya_subido and not node.get('refs'):
    # lanza la traducción sin volver a subir
```

- **No es el número de bloques:** el DWG de 211,6 MB también se sube en tres y traduce bien (§6).
- **Sin comprobar todavía:** el tamaño del objeto que quedó en el almacén de Autodesk. Lo sabe su API de objetos, que solo puede consultar el backend.

## 4 · Los PDF

Cada apertura de un PDF deja esto en el log:

```
ERROR [db] invalid input syntax for type integer: "008db2c7-779a-4e6b-9872-7f5bf4148aca"
  File "backend/routes/pdf_tools.py", line 134, in list_markups
```

- Las tablas `pdf_markups` y `pdf_calibrations` tienen `file_node_id` **entero**; los documentos se identifican con **UUID**.
- El código ya lo sabe y trae una migración (`_migrar_a_uuid`), pero **en producción no se ha aplicado**. En el mismo arranque se ve por qué es probable: `[DB] project_id NOT NULL no aplicado: must be owner of table doc_redlines`. La aplicación no es dueña de esas tablas y no puede alterarlas.
- **Efecto para el usuario:** las marcas y las calibraciones de un plano no se leen ni se guardan. La herramienta está en el visor y el servidor la rechaza siempre.

## 5 · Lo que falta por comprobar

1. ~~Reintentar la traducción del DWG de 260 MB.~~ **Hecho:** falla igual, y el log explica por qué (§3).
2. ~~Medir RVT y otro DWG.~~ **Hecho:** §6. Los dos traducen solos y abren.
3. ~~El tamaño del objeto en Autodesk.~~ **Resuelto por otra vía:** la segunda copia traduce, así que la primera llegó mal (§6.1). Saber el tamaño exacto sigue siendo útil para el arreglo, no para el diagnóstico.
4. **Confirmar contigo qué ves «raro» en los PDF**: si son las marcas y mediciones que no aparecen, encaja con §4.
5. **Medir un PDF y un RVT en ACC** para tener su referencia, como se hizo con el DWG.

## 6 · Segunda tanda: RVT y dos DWG más (23:02–23:13)

Se subieron a la vez un DWG de 211,6 MB, un RVT de 158 MB y un PDF de 3,7 MB. Al ir en paralelo se reparten la conexión, así que los tiempos de subida no se comparan con los de arriba.

| Archivo | Tamaño | Subida terminada | Traducción | Resultado |
|---|---|---|---|---|
| PDF …011223 | 3,7 MB | 23:02:39 | no aplica | — |
| RVT …011264011268 | 158 MB | 23:07:19 | `[CAD pre] subido y traduciendose` | **abre rápido** |
| DWG …004151004153 | 211,6 MB | 23:08:25 | sola, sin abrirlo | **abre a las 23:13** |
| DWG …011220@011222 | 260,3 MB | 22:39:24 | sola, sin abrirlo | **sigue fallando** |

- **Queda descartado** que el fallo sea por el número de bloques de 90 MB: el de 211,6 MB también va en tres y funciona.
- **Lo que queda en pie** es que la copia del de 260,3 MB en Autodesk no sirve y **no hay forma de que se rehaga**: el log muestra cinco veces seguidas `[CAD] el fichero ya estaba en Autodesk: se lanza la traduccion sin volver a subir`.
- **Aviso sobre las horas del log:** varias líneas comparten el mismo milisegundo (cuatro a las 04:02:39.862), así que son horas de volcado, no del suceso. Los tiempos finos de esta tabla vienen del navegador.

### 6.1 · La prueba que lo cierra: el mismo archivo, subido otra vez

| | Primera copia | Segunda copia (`…_p02.dwg`) |
|---|---|---|
| Subida | 22:34:26 → 22:39:24 | 23:22:07 → **23:25:39** (3 min 32 s, sin compartir la conexión) |
| Traducción | falló: «the drawing file is invalid» | **success a las 23:32:27** |
| Al abrir | error, y el reintento no lo arregla nunca | abre |

- **Mismo archivo, mismo camino, resultado opuesto.** Luego no es el DWG ni es Autodesk: es que la primera copia llegó mal.
- **Es intermitente**, así que hay que buscarlo en la subida por bloques: un bloque que falla y se reintenta, o un cierre que ensambla lo que haya.
- **De punta a punta, 260 MB:** ACC 5 min de subida + 3 min de preparación. Nosotros 3 min 32 s de subida + unos 7 min hasta `success`.
- **El porcentaje, visto desde dentro:** se queda en 0 % mientras Autodesk no informa —solo corre el reloj— y luego salta a 99 %. No está roto: es que mide solo el último tramo.

## 7 · Lo que ya se puede decir del encargo

Para parecernos a ACC en esto, por orden de lo que más pesa:

1. **Que un archivo roto se pueda rehacer.** Comprobar que el objeto en Autodesk pesa lo que tiene que pesar y, si no, volver a subirlo. Demostrado que hace falta: la segunda copia traduce y la primera no, y hoy no hay manera de reemplazarla. Son pocas líneas.
2. **Que el fallo se vea.** ACC enseña «Procesando» y un círculo en la lista; nosotros no mostramos nada, ni cuando va bien ni cuando falla. Es lo que hace que parezca que «no se traduce hasta abrir».
3. **Arreglar las marcas de PDF** (tipo de columna). Hoy cada apertura de un plano deja un error y las marcas no se pueden ni leer ni guardar.
4. **Que la traducción no dependa de un proceso que se reinicia solo.** Hoy vive en hilos dentro del servidor web, y el propio gunicorn lo reinicia cada tantas peticiones.
5. **Conservar la `@`** en los nombres.
6. **Quitar el viaje de ida y vuelta**, subiendo a Autodesk desde el navegador, como ACC. Es el cambio más grande; hoy ese tramo tarda entre 36 s y 72 s, así que no es lo que más urge.

## 8 · Lo aplicado (16-sep, en dos commits locales; falta tu push y el Manual Deploy del backend)

El dueño autorizó los puntos 1 y 2 de la lista de arriba, más una pasada de
comparación de dibujado. Esto es lo hecho y lo comprobado.

### 8.1 · Un archivo roto se puede rehacer

`backend/routes/docs_cad.py`. Antes bastaba con que existiera **algo** en
Autodesk con ese nombre para darlo por subido, así que una copia truncada se
volvía permanente y los cinco reintentos del dueño no podían tocarla.

Ahora se pregunta el tamaño real del objeto (`/oss/v2/buckets/…/objects/…/details`)
y se compara con el del documento:

- si coincide, se reutiliza como hasta ahora (no se sube de más);
- si no coincide, se anota en el log cuántos bytes hay de cuántos y **se vuelve a subir**;
- si Autodesk no contesta o el documento es un enlace a otra versión, se sube igual (no se bloquea nada por una consulta caída).

**Defecto encontrado en producción con esto ya desplegado (16-sep, 00:30).** Rehacer
la copia no bastaba: la clave del objeto es estable, así que el URN de después es el
MISMO de antes, y Autodesk guarda el resultado por URN. Una petición de traducción
sin `x-ads-force` responde 200 y se limita a informar del trabajo anterior —el
`failed` de la copia mala—, de modo que los bytes buenos recién depositados no se
miraban nunca y el dibujo seguía dando «the drawing file is invalid». Ahora, cuando
se vuelve a subir, **se fuerza la traducción**. No hay riesgo del 409 que evita el
`force` por defecto: solo se llega ahí tras subir, y dentro del candado de la cola.

Prueba: `backend/tests/test_copia_incompleta_en_autodesk.py`, 12 casos sin base
de datos (copia completa, copia a medias, objeto ausente, detalles que fallan,
tamaño desconocido, los dos sitios donde se decidía «ya estaba subido»).

### 8.2 · La preparación se ve en la lista

- **Backend:** `POST /api/docs/cad/estados` contesta, para los documentos que se le
  pidan, `subiendo` · `inprogress` · `success` · `failed` · `atascado` (empezó y
  lleva más de una hora) · `sin_preparar`. Solo CAD, solo obras con acceso, como
  mucho 300 por vez, sin preguntar a Autodesk (lee lo guardado en la versión) y,
  si la consulta falla, devuelve vacío para que la lista se pinte como antes.
  La pre-traducción ahora marca `subiendo` **al empezar**, que era justo el tramo
  largo en el que no se veía nada (3 min 32 s en el DWG de 260 MB).
- **Lista (`MatrixTable.jsx`):** chip junto al nombre — «Preparando…» con círculo
  mientras viaja o se traduce, «No se pudo preparar» si falló, «a medias» si se
  atascó, y nada cuando está listo. Pregunta cada 15 s **solo mientras queda algo
  preparándose** y se calla cuando no.
- **Pantalla de espera (`CadViewer.jsx`):** era `#2b2f36`, la «pantalla ploma».
  Ahora es clara (`#f6f7f9`, texto `#1f2733`), como la de ACC.

Pruebas: `backend/tests/test_estado_de_traduccion_en_la_lista.py` (10 casos) y un
banco de navegador con la tabla real y un backend de mentira, 13 comprobaciones
en verde (pregunta una sola vez al pintar, no pregunta por los PDF, cada estado
pinta lo suyo, insiste mientras haya algo en marcha, deja de insistir al acabar).
La pantalla clara se comprobó en el navegador: el fondo medido es
`rgb(246, 247, 249)` y el texto `rgb(31, 39, 51)`.

### 8.3 · Estado de las pruebas

- `pytest tests/test_copia_incompleta_en_autodesk.py tests/test_estado_de_traduccion_en_la_lista.py tests/test_cola_de_traduccion.py -q` → **25 passed**.
- Suite entera del backend → **1 failed, 1929 passed**; el fallo es `test_capacidades_con_puerta`, que ya fallaba antes de tocar nada.
- `npm test` en frontend-docs → **10 bancos, todos en verde**.
- ESLint sobre los dos ficheros de frontend → **mismos avisos que en HEAD**, ni uno más.

## 9 · El dibujado: lo medido en el nuestro (ACC, a medias)

Medido sobre el plano que el dueño dejó abierto
(`500125-CSSP001-780-XX-DR-HD-011220011222…`, vista 2D, unidades m):

| | Valor |
|---|---|
| Fondo del lienzo | `#ffffff` — **ya es blanco**, la diferencia que se ve no viene del fondo |
| Lienzo real (píxeles dibujados) | 1045 × 428 |
| Lienzo en pantalla (CSS) | 1115 × 457 |
| **Estiramiento** | **×1,067** |
| `devicePixelRatio` del navegador | 0,9375 |
| `screenSpaceLineWidth` | `false` |
| `lineRendering` | `true` · `edgeRendering` `false` |
| `antialiasing` (preferencia) | `true`; el contexto WebGL va sin `antialias` y sin SSAA (LMV suaviza en pasada aparte) |

**Lo que esto significa.** El visor dibuja a 0,9375 píxeles por píxel de pantalla
—porque sigue al navegador— y luego el navegador **estira esa imagen un 6,7 %**
para llenar el hueco. Todo lo fino (líneas de 1 px, textos de cota) se remuestrea:
es una fuente de borrosidad real y medida, no una impresión.

**Lo que falta para cerrar la comparación.** El `devicePixelRatio` de 0,9375 sale
del zoom del navegador del dueño, así que ACC, en esa misma ventana, podría leer
el mismo valor: no se puede afirmar que ahí esté la diferencia hasta medir ACC con
el mismo plano y la misma ventana. **Hace falta la pestaña de ACC en el grupo del
navegador**; con ella, se toman los mismos seis números y se cierra el punto 3.

Lo que sí queda probado y es accionable por sí solo: si se fuerza un mínimo de 1
píxel por píxel de pantalla, se acaba el estiramiento del 6,7 %. Es un cambio de
una línea en el arranque del visor, pero **no se aplica todavía**: primero la
medida contra ACC, para no cambiar el dibujado a ciegas.
