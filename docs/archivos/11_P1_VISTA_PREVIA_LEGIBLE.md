# PDF pesado · P1 · una vista previa legible antes del PDF

17-sep-2026. Autorización del propietario al cerrar P0 (`RANGE HYPOTHESIS = DISCARDED`): reducir
`click → lámina legible` **sin** esperar a descargar y rasterizar el PDF original, **primero** con una
previsualización/proxy por versión y **sin** montar todavía una infraestructura de mosaicos.

*(Este «P1» es el programa nuevo de la vista previa. El «P1» de los informes 06 y 07 era otro: el lote de apertura
sin trabajo repetido, ya desplegado en septiembre.)*

**Estado:** prototipo aceptado por el propietario (`P1 CONCEPT = PASS`, `2000 px JPEG q85 = CANDIDATO`) e
**integrado de verdad en el backend**, con su autorización, su generación al subir y su cola. Medido en local con
las dos láminas (`004120` y `004122`, §11). **`979c2d7` empujado el 17-sep por orden del propietario y desplegado
por él; verificado en producción** (`/api/health` 979c2d7 y el portal sirve el código nuevo). La apertura de las
láminas SIN vista previa se trató después: informe 13 §7.

El cierre exigido está en §9.

## 1 · En corto

Con una imagen de 2000 px preparada de antemano, la lámina de 71,9 MB **se lee a 1,1 s** en vez de a los 45–50 s.
El PDF sigue bajando por detrás y, cuando termina, el dibujo vectorial la sustituye **sin mover nada**.

| | Hoy | Con vista previa (2000 px) |
|---|---|---|
| Clic → algo en pantalla | 0,45 s (miniatura de 420 px, **ilegible**) | **1,1 s, legible** |
| Clic → lámina legible | 45–50 s | **1,1 s** |
| Clic → primera tinta del vector | 44,7–47,2 s | 45,0–47,9 s (igual) |
| Clic → dibujo completo | 48,0–50,4 s | 48,3–50,9 s (igual) |
| Reapertura | 1,07–1,47 s | 1,10–1,56 s (y la lámina ligera reaparece a 0,9 s) |
| CPU del renderizador | 26–35 s | 27–35 s (igual) |
| Pico de heap | 12–17 MB | 12–16 MB (igual) |

`GATE · click → lámina legible ≤ 5 s` → **1,1 s** · `PASS`, y dentro del 1–3 s preferido.

La prueba de que se lee de verdad está en `docs/archivos/evidencias/P1_vista_previa/P1_cajetin_comparado.png`:
el mismo cajetín a 1,1 s con la miniatura de hoy (una mancha), con la vista previa (se lee entero) y el dibujo
vectorial al final.

## 2 · El contrato, punto por punto

| Lo pedido | Cómo queda |
|---|---|
| Existir una representación ligera preparada previamente | **Hecho** (§7): `crear_vista_previa(urn)` sobre el generador de siempre, `<gcs_urn>__thumb2000.jpg` en el mismo bucket y prefijo, y se encola al subir el PDF |
| Identidad ligada a `version_id`, no al documento actual | **Hecho**: el cliente manda documento y versión, **el servidor resuelve el objeto** y comprueba que esa versión es de ese documento; el nombre cuelga del `gcs_urn`, único por subida |
| Misma autorización documental que la versión original | **Hecho** (§7.1): `POST /api/docs/vista-previa/url` pasa por `_acceso_al_recurso`, **la misma función** que `/api/docs/signed-url` y `/api/docs/view`: sesión → obra del objeto → `permiso_documental.guardia` con documento y versión, y fail-closed si no se puede decidir |
| Al abrir el documento, mostrar esa representación inmediatamente | **Cumplido y medido**: 0,92–1,39 s según el tamaño del proxy |
| Descargar/procesar el PDF original en segundo plano | **Sin cambios**: mismas peticiones, mismos 33–35 s de descarga y mismo dibujado |
| Sustituir el proxy por el render vectorial cuando esté listo | **Cumplido**: la vista previa se retira con el dibujo **completo**, no con el primer trazo (ver §4.3) |
| Sin cambiar zoom, centro, scroll ni posición del usuario | **Cumplido y medido**, también arrastrando durante la espera: scroll idéntico y la hoja en el mismo píxel (§4.4) |
| Si no existe proxy, fallback al lector actual | **Cumplido**: sin URL de vista previa el lector se comporta igual que hoy (variante `off` de la campaña) |
| No generar la preview durante la apertura normal | **Diseñado así**: se genera al subir (donde ya se encola la miniatura) o en la cola existente; la apertura sólo pide una URL |
| Reutilizar el pipeline existente | **Sí**: mismo generador (PyMuPDF), mismo bucket y prefijo, mismo patrón de nombre, misma cola de 2 hilos y la misma caché de URLs firmadas |

## 3 · Qué se ha tocado (sin commit)

- `frontend-docs/src/components/PDFViewer.jsx`: pide la vista previa de la versión abierta; la dibuja **dentro de
  la caja de la hoja** (no flotando sobre el visor, como la silueta); encuadra con la proporción de la imagen
  mientras pdf.js todavía no ha abierto el fichero; conserva el encuadre del usuario si éste movió la hoja durante
  la espera; retira la imagen cuando el dibujo vectorial está completo; marca `vista-url` y `VISTA-PREVIA` en el
  cronómetro del lector.
- `frontend-docs/src/components/PDFViewer.css`: `.pdf-vista`, sin desvanecido (dos versiones de la misma hoja
  cruzándose se ve como un parpadeo).
- `frontend-docs/src/components/DocumentViewer.jsx`: le pasa al lector la versión que se está viendo.
- `frontend-docs/src/utils/colaMiniaturas.js`: `urlDeVistaPrevia(nodeId, versionId)`.
- `frontend-docs/src/probar-lector.jsx` (banco, no entra en producción): la lámina pesada real, el endpoint de
  vista previa simulado, `?vista=` para elegir tamaño y `?inicial=vacio` para medir la primera apertura con el
  lienzo limpio.
- `backend/gcs_manager.py`: `PX_VISTA_PREVIA`/`CALIDAD_VISTA_PREVIA`, `nombre_de_vista_previa`,
  `vista_previa_lista`, `crear_vista_previa`, y la calidad del JPEG como parámetro del generador de siempre.
- `backend/routes/documents.py`: `POST /api/docs/vista-previa/url`, `_documento_para_vista_previa` y
  `_encolar_vistas_previas`.
- `backend/routes/uploads.py` y la subida de Multimedia: encolan la vista previa al subir un PDF.
- `backend/tests/test_vista_previa_legible.py`: 19 pruebas nuevas.

## 4 · Medición

### 4.1 · Método

- **Banco local** `probar-lector.html` con el **PDFViewer real** y la lámina `500125-CSSP001-740-XX-DR-LS-004120.pdf`
  (71,9 MB, A1 de 2384 × 1684 pt) servida como fichero estático.
- **Chrome sin ventana**, 1920 × 945, escala 1; la hoja encuadrada ocupa 1043 × 737 px.
- **Red emulada** con lo medido en producción el 17-sep: **2,4 MB/s y 200 ms**. Comprobación: el PDF baja en
  33,1–34,9 s en el banco frente a **32,8 s** de mediana en producción (P0), así que el modelo no regala tiempo.
- Caché desactivada; la URL firmada se simula con 500 ms (en producción se midió 0,47–0,51 s).
- **Primera apertura de verdad**: el lector se monta al abrir, con el lienzo vacío, como al abrir desde el
  explorador.
- Cada apertura registra las marcas del propio lector, los fotogramas de la pantalla, las peticiones y bytes, la
  CPU del renderizador y el pico de heap.

### 4.2 · Tamaños de la vista previa

| Vista previa | Peso | Generar (proceso frío) | Clic → visible | Clic → primera tinta | Clic → completo |
|---|---|---|---|---|---|
| **Hoy: 420 px JPEG** | 27 KB | 0,88 s | 0,45 s **pero ilegible** | 44,7–47,2 s | 48,0–50,4 s |
| 1600 px JPEG q85 | 291 KB | 0,89 s | **0,98 s** | 45,6 s | 48,4 s |
| **2000 px JPEG q85** | 436 KB | 0,94 s | **1,10–1,15 s** | 45,0–47,9 s | 48,3–50,9 s |
| 2600 px JPEG q85 | 699 KB | 1,21 s | 1,25 s | 45,0 s | 48,1 s |
| 3200 px JPEG q85 | 1005 KB | 1,24 s | 1,39 s | 44,7 s | 47,6 s |
| 2000 px WebP q75 | 195 KB | 1,5 s (≈0,6 s de compresión) | **0,92 s** | 45,7 s | 49,1 s |

Los tiempos de generación son de esta máquina, con PyMuPDF (la librería que el backend ya tiene) y el PDF ya
descargado: abrir el fichero y rasterizar la página 1. **En Render (1 vCPU) no está medido.**

### 4.3 · Cuánto se lee, y cuándo se sustituye

- **A 1,1 s se lee el cajetín entero** con 2000 px: título, plano, especialidad, uso, zona, escala, fecha, revisión
  y el código del plano. Con la miniatura de hoy, a esa misma hora, no se lee ninguno.
- Comparada con el dibujo vectorial, la vista previa de 2000 px reproduce el **81 %** de sus trazos (umbral suave) y
  el **59 %** con el umbral estricto de bordes nítidos; en el cajetín, **92 %** y **63 %**. La diferencia es de
  nitidez, no de contenido: la hoja está entera desde el primer momento.
- **La sustitución ocurre con el dibujo COMPLETO.** El primer prototipo la quitaba en la primera tinta y dejaba ver
  la hoja pintándose durante 3–4 s; corregido.
- Diferencia media de gris dentro de la hoja al sustituir: **10 sobre 255**; es un afinado, no un cambio de imagen.

### 4.4 · Que no se mueva nada

Prueba con arrastre real durante la espera (ratón por CDP, 320 × 144 px):

| | scroll | hoja en pantalla | lienzo |
|---|---|---|---|
| Antes de mover | 1523, 872 | 405, 51, 1043 × 737 | 1043,17 × 737 px |
| Tras arrastrar | 1843, 1016 | 85, −93, 1043 × 737 | 1043,17 × 737 px |
| **Tras entrar el vector** | **1843, 1016** | **85, −93, 1043 × 737** | 1043,17 × 736,87 px |

`SCROLL CONSERVADO = 0 px` · `POSICIÓN DE LA HOJA = 0 px` · el alto del lienzo cambia **0,13 px** (redondeo del
encuadre), por debajo de un píxel.

Sin arrastrar, la caja de la hoja antes y después de la sustitución coincide dentro de 2 px de su recuadro.

## 5 · Recomendación

**2000 px de lado mayor.** Por medición:

- 1600 px ya se lee encuadrado, pero deja la hoja al 1,5× de lo que muestra la pantalla: cualquier acercamiento la
  ablanda antes.
- 2000 px da 1,9× la resolución de pantalla por 436 KB y 1,1 s. Es el punto donde la pantalla ya no puede enseñar
  más detalle.
- 2600 y 3200 px **no mejoran lo que se ve** encuadrado —la pantalla es el límite— y cuestan 0,15–0,3 s más y el
  doble o el triple de bytes.
- **Formato:** JPEG q85 mantiene el pipeline tal cual (`__thumb2000.jpg`). WebP q75 pesa menos de la mitad
  (195 KB) y sale 0,2 s antes, a cambio de ~0,6 s más de compresión en el servidor; queda como mejora opcional.

## 6 · La integración en el backend (17-sep, sin commit)

### 6.1 · La puerta

`POST /api/docs/vista-previa/url` recibe `{node_id, version_id}` — **nunca el objeto del almacén**, que lo resuelve
el servidor — y hace, en este orden:

1. **Resuelve el objeto de esa versión** (`_documento_para_vista_previa`). Con `version_id` exige que la versión sea
   **de ese documento**; si no lo es, responde `404 Documento no encontrado`, igual que si no existiera.
2. **`_acceso_al_recurso(gcs_urn, node_id, version_id)`**: es *la misma función* que gobierna el PDF original, así
   que la cadena es idéntica — sesión → obra real del objeto (`obra_del_blob` + `verify_project_access`) →
   `permiso_documental.guardia` con los tres identificadores. Si algo no se puede decidir, **503 y no se entrega**.
3. Sólo PDF. Si la vista previa existe, devuelve su **URL firmada** (con la caché de URLs firmadas de siempre). Si
   no, **encola una sola preparación** y responde `pendiente`, y el lector sigue comportándose como hoy.

Lo que NO hace, a propósito: preparar la imagen dentro de la petición (eso sería mudar la espera al servidor), y
devolver nombre, tamaño o cualquier otra señal del documento.

### 6.2 · La generación

- `gcs_manager.crear_vista_previa(urn)` = `get_or_create_thumbnail(urn, 2000, calidad=85)`. El generador es el
  mismo (PyMuPDF, temporal en disco, tope de 120 MB, `cache_control` inmutable); lo único nuevo es que la calidad
  del JPEG es un parámetro, para no cambiar la miniatura de 420 px que ya está en producción.
- **Al subir**: las dos rutas de subida encolan la vista previa junto a la miniatura, sólo para PDF.
- **Históricos**: sin lote masivo. La primera apertura encola, y la siguiente ya la encuentra.
- **Una sola vez**: la marca de «ya encolada» lleva el tamaño dentro (`…__thumb2000.jpg`), así que ni se pisa con la
  silueta de 420 px ni dos aperturas simultáneas preparan la misma imagen dos veces.

### 6.3 · Lo medido en la integración

| Comprobación | Resultado |
|---|---|
| Acceso permitido | 200 con la URL firmada de `…__thumb2000.jpg`; no se vuelve a preparar nada |
| Sin sesión | 401, sin URL y sin encolar |
| Otra obra | 403, sin URL, sin nombre del fichero y sin tocar el almacén |
| Sin permiso documental | 403 `SIN_PERMISO_DOCUMENTAL`, ídem |
| No se puede decidir (base caída) | 503, fail-closed |
| Versión de otro documento | 404, como si no existiera; no se encola |
| Versión fijada | devuelve la vista previa **de esa versión**, no la de la viva |
| Lo que no es PDF | 200 con `url: null`, sin encolar |
| Histórico pendiente | `pendiente: true` → una sola preparación → la siguiente apertura ya trae la URL |
| Dos aperturas a la vez | 8 hilos simultáneos encolan **1** sola preparación |
| Cola ocupada (4 trabajos, 2 hilos) | la petición contesta en **< 0,2 s**: la cola no bloquea |
| Coste de preparar (lámina de 71,9 MB) | **1,9–2,5 s de reloj y 1,8–2,5 s de CPU**, 453 KB, pico del proceso 253–263 MB. La miniatura de 420 px de hoy cuesta 1,1–1,6 s en la misma máquina |

19 pruebas nuevas en `backend/tests/test_vista_previa_legible.py`. Suite completa del backend: **1974 pasan, 1 falla**,
y ese fallo es anterior y ajeno (`/api/docs/miniaturas/preparar`, una ruta de administrador sin pantalla en ningún
cliente; mi ruta no es de administrador). `npm test` del portal: 10 bancos en verde. ESLint de lo tocado: los mismos
errores que HEAD (4 en `PDFViewer.jsx`, 1 en `DocumentViewer.jsx`, 2 en el banco, 0 en `colaMiniaturas.js`).

**Lo que no se ha podido ejecutar en local:** no hay credenciales de Google en esta máquina, así que la generación
**contra GCS de verdad** (bajar el original del bucket y subir la imagen) no se ejecutó; el coste de arriba mide el
camino completo del servidor **menos la red**, con el PDF servido desde disco por un doble del almacén. En Render
(1 vCPU) el coste sigue **NOT MEASURED**: medirlo allí exige desplegar, que no está autorizado.

### 6.4 · El lector, después de la integración

El lector pide la vista previa **por documento y versión** (antes, en el prototipo, iba por el objeto de la cinta:
con una versión fijada habría enseñado la de la versión viva). Medido otra vez con el banco tras el cambio: vista
previa a **1,13 s** en frío y a **0,51 s** al reabrir; el vector sigue llegando a 49,9 s.

## 7 · Lo que falta antes de que esto pueda ir a producción

1. **Ejecutar el camino contra GCS de verdad**: en esta máquina no hay credenciales de Google, así que la
   generación se midió con un doble del almacén (todo el trabajo del servidor menos la red) y la subida no se
   ejecutó de punta a punta. Hace falta un entorno con acceso al bucket.
2. **Medir la generación en Render** (1 vCPU, 2 GB, gunicorn con 1 worker y la cola de 2 hilos): `NOT MEASURED`,
   porque medir allí exige desplegar y eso no está autorizado.
3. **La segunda lámina del experimento, `004122` (23,4 MB): NOT MEASURED.** No tengo el fichero en local; basta con
   dejarlo en la carpeta de descargas, o abrir un banco con sesión iniciada por el propietario.
4. **Históricos**: sin lote masivo (no autorizado). Con la cola existente, la primera apertura de una lámina
   antigua encola su vista previa y la siguiente ya la tiene.
5. **Documentos de varias páginas**: la vista previa es de la página 1; el resto abre como hoy.
6. **Acercamiento durante la espera**: por encima de ~1,9× la vista previa se ve blanda hasta que llega el vector.
   Optimizar el zoom sigue sin autorizar.
7. **PUERTA DE PRODUCCIÓN · documentos de varias páginas (pedida por el propietario el 17-sep).** Antes del
   despliegue hay que demostrar con un PDF multipágina que: la vista previa sale **sólo en la página 1**; que al
   pasar a la página 2 mientras el vector todavía carga la página 1 **no puede quedar en pantalla haciéndose pasar
   por la 2**; que al volver a la 1 el comportamiento sigue siendo el correcto; y que sin vista previa todo se
   comporta como hoy. Es una prueba de corrección, no una optimización. Por código, la imagen está condicionada a
   `currentPage === 1` y se retira con el dibujo completo del documento, pero **eso hay que medirlo, no razonarlo**:
   el banco ya tiene `plano-I.pdf`, de dos páginas, para hacerlo.

## 8 · Lo que no se tocó

- Mosaicos, pirámide de tiles, WebP, motor PDF, infraestructura, migraciones de BD, lote masivo de históricos,
  optimización del zoom y despliegue: **fuera**, según la autorización.
- La miniatura de 420 px de hoy: sigue igual (la calidad del JPEG es ahora un parámetro con su mismo valor por
  defecto), y la ruta `/api/docs/miniaturas/urls` no se ha tocado.
- El camino actual del lector cuando no hay vista previa: intacto y medido (variante `off`).
- ESLint de lo tocado: los mismos errores que HEAD (4 en `PDFViewer.jsx`, 1 en `DocumentViewer.jsx`, 2 en el banco,
  0 en `colaMiniaturas.js`), ninguno nuevo. `npm test`: 10 bancos en verde. Suite del backend: 1974 pasan y falla
  una anterior y ajena (`/api/docs/miniaturas/preparar`, ruta de administrador sin pantalla).


## 9 · Cierre

Dictamen del propietario tras revisar la integración (17-sep): `P1 CODE/TEST GREEN LOCAL = PASS PARA COMMIT`.

```
PREVIEW AUTH                  = PASS
VERSION BINDING               = PASS
UPLOAD GENERATION CODE/TEST   = PASS
REAL GCS E2E                  = NOT TESTED
HISTORICAL LAZY QUEUE         = PASS
DUPLICATE GENERATION          = PREVENTED
004120                        = 1,13 s A LEGIBLE
004122                        = NOT MEASURED
RENDER COST                   = NOT MEASURED
PRODUCTION READY              = NO
```

Detrás de cada línea:

- **PREVIEW AUTH** · la misma función que el PDF (`_acceso_al_recurso`): sesión, obra real del objeto y
  `permiso_documental.guardia` con documento y versión; fail-closed en 503. Sin acceso no hay URL, ni nombre, ni
  almacén tocado, ni encolado. Probado: permitido, sin sesión (401), otra obra (403), sin permiso documental
  (403 `SIN_PERMISO_DOCUMENTAL`) y base caída (503).
- **VERSION BINDING** · el cliente manda documento y versión; el servidor resuelve el objeto y exige que la versión
  sea de ese documento. Una versión ajena responde 404, como si no existiera; una versión fijada devuelve la suya.
- **UPLOAD GENERATION CODE/TEST** · las dos rutas de subida encolan `crear_vista_previa` para los PDF, junto a la
  miniatura; comprobado por prueba sobre el código.
- **REAL GCS E2E** · **no ejecutado**: en la máquina de desarrollo no hay credenciales de Google, así que bajar el
  original del bucket y subir la imagen no se probó de punta a punta. El coste medido es el camino completo del
  servidor **menos la red**.
- **HISTORICAL LAZY QUEUE** · pendiente → una sola preparación en segundo plano → la siguiente apertura ya trae la
  URL. Nunca se prepara dentro de la petición, y con la cola ocupada la respuesta sigue por debajo de 0,2 s.
- **DUPLICATE GENERATION** · 8 aperturas simultáneas encolan 1; la marca lleva el tamaño dentro, así que no se pisa
  con la miniatura de 420 px.
- **004120** · clic → lámina legible **1,13 s** (banco, red emulada con lo medido en producción), frente a 45–50 s
  hoy. El vector llega igual (49,9 s) y la reapertura sigue en 1,4 s, con la lámina ya a 0,51 s. Preparar la vista
  previa cuesta 1,9–2,5 s de reloj y 1,8–2,5 s de CPU, 453 KB y un pico de proceso de 253–263 MB.
- **004122 / RENDER COST** · sin medir (§7).
- **PRODUCTION READY = NO** · faltan el camino real contra GCS, el coste en Render, `004122` y la prueba de
  documentos de varias páginas (§7.7).

Autorizado un único commit con la integración y sus pruebas y documentación. Sin push ni despliegue.


## 10 · Puerta multipágina (17-sep, autorizada tras el commit `b82c4e6`)

**Escenario.** El PDF de dos páginas del banco (`plano-I.pdf`, 3,7 MB, dos A1), con vista previa **sólo de la
página 1**, red emulada a **600 KB/s** para que el vector siga cargando mientras se cambia de página, y el mismo
recorrido repetido **con vista previa y sin ella**. Evidencia:
`docs/archivos/evidencias/P1_vista_previa/P1_puerta_multipagina.png`.

En cada paso se anota qué elemento hay, qué página dice el lector, el recuadro de la hoja, el scroll y **una huella
del lienzo** (32 × 22 en gris) que se compara contra las dos páginas del PDF y contra el blanco: así se sabe qué se
estaba viendo de verdad, no sólo qué había en el DOM.

### 10.1 · Un defecto encontrado, y corregido

Con el código commiteado, la vista previa se retiraba cuando terminaba **el primer dibujado del documento**, fuera
de la página que fuera. Medido: al pasar a la página 2 mientras cargaba, el dibujado de **la 2** retiraba la vista
previa de **la 1**; al volver a la 1 —que no se había dibujado nunca— quedaba una **hoja en blanco durante 5 s**
teniendo la imagen legible a mano. Corregido en `PDFViewer.jsx` con una línea: la vista previa se retira cuando se
dibuja **su** página, la 1. Sin commit.

### 10.2 · Resultado tras la corrección

| Caso | Medido |
|---|---|
| 1 · Página 1 con vista previa mientras el vector carga | Vista previa visible a **2,6 s**; el documento no abre hasta 9,0 s |
| 2 y 3 · Pasar a la página 2 antes de que termine el vector | La vista previa **desaparece del DOM** en cuanto la página cambia; en los tres muestreos de la página 2 no existe, y el lienzo muestra blanco y luego la página 2 |
| 4 · La página 2 sin vista previa | Idéntica a la variante sin vista previa: mismo blanco, mismo recuadro, mismo scroll |
| 5 · Volver a la página 1 | La vista previa **reaparece** (13,0 s y 16,8 s) mientras la 1 no esté dibujada; cuando el vector de la 1 termina (21,6 s) se retira y queda el dibujo |
| 6 · El mismo recorrido sin vista previa | Mismo comportamiento que el lector de hoy, paso por paso |
| 7 · 1 → 2 → 1 rápido (400 ms) | Sin imagen cruzada: en la 2 nunca aparece la imagen de la 1, y en la 1 nunca se queda la 2. Sin peticiones huérfanas: las del PDF y las de la imagen son de la página que toca. El recuadro de la hoja y el scroll **no se mueven** en ningún paso (x = 499, scroll 1617/872 en los diez muestreos) |

```
MULTIPAGE PAGE1 PREVIEW         = PASS
PAGE1 PREVIEW LEAKS INTO PAGE2  = NO
PAGE2 FALLBACK                  = PASS
RETURN TO PAGE1                 = PASS  (tras la corrección de 10.1)
RAPID PAGE SWITCH               = PASS
ZOOM/SCROLL PRESERVED           = PASS  (ver la observación de 10.3)
CODE CHANGES                    = 1 línea en frontend-docs/src/components/PDFViewer.jsx
```

### 10.3 · Dos observaciones medidas, para decidir

1. **La hoja se desplaza 94 px al abrirse el documento, y sólo en documentos de varias páginas.** No lo causa la
   vista previa: el lector abre solo el panel de miniaturas de páginas cuando descubre que hay más de una
   (`setShowSidebar(pdf.numPages > 1)`), ese panel mide 188 px y la hoja se recentra en el espacio que queda
   (medido: x = 405 → 499 al abrirse, con la misma anchura de hoja). Sin vista previa ocurre igual, pero no se ve
   porque en ese instante todavía no había nada en pantalla. **Es comportamiento previo del lector, no de P1**, y
   tocarlo no está autorizado.
2. **Al volver a la página 1, la imagen se vuelve a montar y se vuelve a pedir.** En el banco la caché está
   desactivada, así que se descargó otra vez (450 KB) y hubo ~1 s sin imagen. En producción el objeto es inmutable
   con `max-age=86400`, así que saldría de la caché del navegador. Se puede evitar del todo manteniendo el elemento
   montado y ocultándolo; no se ha tocado porque no estaba autorizado.


## 11 · La segunda lámina: `004122` (17-sep, medición local autorizada)

`500125-CSSP001-740-XX-DR-LS-004122.pdf` · 23,4 MB · una página A1 (2384 × 1684 pt). Mismo banco, mismo
contrato y misma red emulada que `004120` (2,4 MB/s y 200 ms), dos rondas con vista previa y sin ella, la lámina
montada en el banco sólo durante la medición y el banco devuelto después a `004120`. Sin tocar código.

| | Hoy (sin vista previa) | Con vista previa (2000 px) |
|---|---|---|
| Peso de la vista previa | — | **458 KB** (2000 × 1413, JPEG q85) |
| Generarla (PyMuPDF, render + JPEG) | — | **1,79 s** |
| Generarla por el camino del servidor, sin la red a GCS | — | **2,6–2,8 s de reloj, 2,5–2,7 s de CPU**, pico del proceso 161–171 MB (la miniatura de 420 px de hoy: 2,0–2,2 s) |
| Clic → algo en pantalla | ~0,45 s, miniatura de 420 px **ilegible** | **1,14 s**, legible |
| Clic → lámina legible | 17,5–17,9 s (cuando termina el vector) | **1,14 s** |
| Descarga del PDF | 11,8–11,9 s | 12,2 s (igual) |
| Clic → primera tinta del vector | 15,6–15,7 s | 15,7–15,8 s (igual) |
| Clic → dibujo completo | 17,5–17,8 s | 17,8–17,9 s (igual) |
| Sustitución vista previa → vector | — | con el dibujo **completo**; la hoja no se mueve (recuadro dentro de 2 px, diferencia media 12,8/255) |
| Fallback sin vista previa | igual que el lector de hoy | — |
| Reapertura | 1,04–1,10 s | 1,02–1,06 s, con la lámina ligera a 0,5–0,7 s |
| CPU del renderizador / pico de heap | 11,4–11,6 s / 10–11 MB | 11,5–11,6 s / 12–16 MB |

**Se lee de verdad:** `docs/archivos/evidencias/P1_vista_previa/P1_cajetin_004122.png` compara el mismo cajetín a
1,1 s con la miniatura de hoy (una mancha), con la vista previa (se lee entero: «PLANO DE ÁRBOLES EXISTENTES»,
especialidad, uso, zona, escala, fecha, revisión y el código `…LS-004122`) y con el dibujo vectorial al final. La
vista previa reproduce el **90 %** de los trazos del vector con el umbral suave y el **67 %** con el estricto
(**96 %** y **69 %** en el cajetín): algo más que en `004120`, porque esta lámina es de líneas y fotos pequeñas.

**Lo que cambia frente a `004120`:** la lámina pesa un tercio, así que el vector llega antes (17,8 s en vez de
49,9 s) y la ventaja absoluta es menor —16,7 s en vez de 48,8 s—, pero el punto de llegada es el mismo: **legible
a 1,1 s**, que es lo que fija la vista previa y no el tamaño del PDF.

```
004122 = 1,14 s A LEGIBLE · preview 458 KB · generación local 1,79 s · vector completo 17,8 s (sin cambio) ·
         sustitución sin movimiento · fallback = lector de hoy · reapertura 1,0–1,1 s
```
