# PDF pesado · P0 · ¿la descarga por rangos es la causa? · y peticiones repetidas de miniaturas

17-sep-2026. Autorización del propietario «PDF HEAVY · PERFORMANCE P0»: experimento controlado sobre la descarga
por rangos de pdf.js con `500125-CSSP001-740-XX-DR-LS-004120.pdf` y `…-004122.pdf`, cuatro variantes (baseline,
`disableRange`, `rangeChunkSize` 1 MB y 2 MB) sin mezclar otros cambios del lector; y, aparte, quitar las
peticiones repetidas a `api/docs/miniaturas/urls` si se demuestra que son redundantes.

**Estado:**
- **Rangos:** medido. **Ninguna variante pasa la puerta** → no se implementa ninguna. La hipótesis «la tormenta de
  rangos es la causa raíz» queda **descartada**.
- **Miniaturas:** redundancia demostrada y arreglada en `frontend-docs/src/components/MatrixGrid.jsx`, **sin
  commit**. Demostrado con el componente real en un arnés; la medición del arreglo en producción queda pendiente
  (§4.4).
- Sin commit, push ni despliegue.

## 1 · En corto

Medianas de primeras aperturas en frío contra producción; entre corchetes, el rango observado. «Tinta»: primer
dibujo de la lámina. «Legible»: el 80 % de los bordes nítidos del resultado final ya en pantalla.

### `004120` · 71,9 MB

| | **BASELINE** | **disableRange** | **1 MB** | **2 MB** |
|---|---|---|---|---|
| n | 5 | 5 | 2 | 2 |
| Peticiones del PDF | 458 [383–461] | **1** | 4 | 4 |
| MB bajados | 70,3 [69,5–123,0] | 71,9 | **142,8** | **141,8** |
| Clic → descarga útil terminada | 32,8 s [23,9–54,6] | 28,0 s [22,8–42,5] | 56,2 s | 61,1 s |
| Clic → primera tinta | 43,5 s [34,9–64,7] | 39,9 s [33,3–53,3] | 64,8 s | 67,9 s |
| Clic → lámina legible | 43,7 s [35,1–67,7] | 40,0 s [33,4–53,4] | 67,7 s | 69,5 s |
| Clic → completa y nítida | 46,5 s [38,1–67,7] | 43,3 s [36,2–56,2] | 67,8 s | 70,7 s |
| CPU del renderizador | 33,0 s [28,8–37,4] | 27,2 s [23,1–32,1] | 38,1 s | 41,6 s |
| · de ella, tras la descarga | 18,2 s | 18,0 s | 14,9 s | 12,8 s |
| Pico de heap JS | 42 MB [31–70] | 51 MB [42–69] | 54 MB | 45 MB |
| Reapertura caliente (tinta / completa) | 0,22 / 0,63 s | 0,21 / 0,59 s | 0,23 / 0,62 s | 0,23 / 0,64 s |

### `004122` · 23,4 MB

| | **BASELINE** | **disableRange** | **1 MB** | **2 MB** |
|---|---|---|---|---|
| n | 5 | 5 | 2 | 2 |
| Peticiones del PDF | 133 [131–139] | **1** | 4 | 4 |
| MB bajados | 22,2 [21,8–45,2] | 23,4 | **45,8** | **44,8** |
| Clic → descarga útil terminada | 11,4 s [9,3–28,3] | 8,1 s [6,9–15,3] | 15,8 s | 20,8 s |
| Clic → primera tinta | 15,0 s [11,5–32,3] | 12,0 s [10,3–19,2] | 18,4 s | 22,8 s |
| Clic → lámina legible | 17,0 s [13,5–34,1] | 13,9 s [12,2–21,2] | 20,3 s | 24,6 s |
| Clic → completa y nítida | 16,9 s [13,5–34,2] | 13,9 s [12,1–21,2] | 20,3 s | 24,6 s |
| CPU del renderizador | 13,5 s [12,2–22,3] | 10,7 s [9,8–12,2] | 14,1 s | 16,7 s |
| Pico de heap JS | 42 MB [37–42] | 37 MB [32–70] | 40 MB | 38 MB |
| Reapertura caliente (tinta / completa) | 0,21 / 0,59 s | 0,21 / 0,60 s | 0,24 / 0,67 s | 0,19 / 0,57 s |

**Control:** el lector que está hoy en producción, sin tocar, abrió `004120` con 350 peticiones, 115,7 MB, tinta a
los 55,1 s y completa a los 58,2 s. Es el mismo comportamiento que BASELINE.

### Recomendación

**No implementar ninguna variante de rangos.** Los datos no sostienen que los rangos sean la causa:

1. **La descarga útil es el fichero entero.** En las 29 aperturas, todos los bytes llegaron antes de la primera
   tinta, con cualquier variante: una lámina de una sola hoja necesita casi todo el fichero para dibujarse. Pedirlo
   por rangos no ahorra bytes, solo cambia cómo llegan.
2. **Lo que pesa son los 72 MB y el dibujo.** Con la conexión medida (~2–2,6 MB/s desde el almacén) son 28–33 s de
   descarga, más 10–12 s de dibujo: tinta menos descarga útil en cada una de las 10 aperturas de BASELINE y
   `disableRange` de `004120`. En 1 MB y 2 MB sale menos porque parte del dibujo ocurre mientras baja la segunda
   copia. Ninguna opción de rangos toca ninguna de las dos cosas.
3. **`disableRange` no mejora de forma clara.**
   - Mediana 3,6 s menos de tinta en `004120` (−8 %), pero por rondas emparejadas son −15,2 / −11,3 / −1,4 /
     +0,6 / +3,5 s: dos rondas ganan mucho y tres no ganan nada.
   - La dispersión de la red (útil de 23,9 a 54,6 s con la **misma** variante) es mayor que el efecto.
   - A favor: menos CPU en las 5 parejas de las dos láminas y siempre 1× los bytes.
   - En contra: con `disableRange`, pdf.js no interpreta nada hasta tener el fichero completo, y eso no se ha medido
     con documentos de muchas páginas, donde hoy la primera página llega antes gracias a los rangos.
4. **1 MB y 2 MB empeoran claramente:** bajan el fichero **dos veces** (142,8 MB de 71,9) y la tinta llega 21–24 s
   más tarde en `004120`. Descartadas.

Lo que sí bajaría la primera apertura de forma grande es no tener que bajar y dibujar 72 MB antes de ver la lámina.
En el informe 09, ACC muestra mosaicos preparados al subir en 5,6–9 s. Ese camino (mosaicos, vista previa en el
servidor) **sigue sin autorizar**, y este P0 no lo toca.

## 2 · Puerta

| Condición del propietario | disableRange | 1 MB | 2 MB |
|---|---|---|---|
| Reduce **claramente** la primera apertura de `004120` | **NO** (−8 % en mediana; 3 de 5 rondas sin ganancia) | **NO** (+49 %) | **NO** (+56 %) |
| No empeora de forma material `004122` | sí (−20 % en mediana; 2 de 5 rondas sin ganancia o peor) | **NO** (+23 %) | **NO** (+52 %) |
| No empeora la reapertura caliente | sí (igual) | sí (igual) | sí (igual) |
| Versión fija, enlace directo, cierre/reapertura y cancelación | NOT RUN | NOT RUN | NOT RUN |

`PUERTA = NO SUPERADA POR NINGUNA VARIANTE` · `IMPLEMENTACIÓN DE RANGOS = NINGUNA`

La prueba funcional (`puerta_p0.mjs`, preparada) no se ejecutó: solo tenía sentido para una variante que hubiera
pasado la primera condición.

## 3 · Método

- **Contra producción**, en un Chrome con ventana y perfil propio (puerto 9500), con la sesión iniciada por el
  propietario. El banco sirvió **las compilaciones locales de cada variante** con el mismo origen
  (`https://alephia.com.pe`) mediante `Fetch.fulfillRequest`. Las llamadas a `/api` y la descarga del PDF desde el
  almacén fueron las reales.
- **Las cuatro compilaciones solo difieren en `RECURSOS_PDF`** (`src/utils/pdfjs.js`), que usan el lector, su
  precarga y la comparación. La variante se inyectó en la carga de Vite, sin tocar el repositorio.
- **Primera apertura de verdad:** el backend reutiliza la URL firmada ~22 h, así que el navegador sacaría el PDF de
  su disco. Por eso la caché se vació al empezar y se desactivó durante todo el banco. La primera campaña se
  descartó entera: `004122` salió de caché (0,0 MB) antes de corregirlo.
- **Aperturas en frío:** carpeta recién cargada y clic real en el nombre. **En caliente:** cerrar y volver a abrir
  en la misma página.
- **Rondas intercaladas:**
  - Campaña 2 (11:36–11:50): 2 rondas de las 4 variantes, con el orden rotado, más el control de producción.
  - Campaña 3 (11:51–11:59): 3 rondas de BASELINE y `disableRange`, con el orden alternado.
- **Métricas:**
  - **Peticiones y bytes:** de `Network` (`encodedDataLength`).
  - **Descarga útil:** la última petición del PDF terminada antes de la primera tinta.
  - **Tinta y completa:** marcas `[lector]` del propio lector.
  - **Legible:** fotogramas de `Page.startScreencast` y bordes nítidos dentro de la lámina.
  - **CPU:** suma de los procesos renderizadores (`SystemInfo.getProcessInfo`), que incluye el worker de pdf.js.
  - **Heap:** `Runtime.getHeapUsage` de la página; no incluye el worker ni la memoria de los lienzos.
- **Ventana:** 1920×945, escala 1.

### Rondas emparejadas (BASELINE y `disableRange` de la misma ronda; tiempos en s)

| Ronda | `004120` tinta base → dR | Δ | CPU base → dR | `004122` tinta base → dR | Δ | CPU base → dR |
|---|---|---|---|---|---|---|
| C2 · r1 | 43,5 → 47,0 | +3,5 | 33,0 → 28,5 | 15,0 → 12,0 | −3,0 | 13,5 → 11,0 |
| C2 · r2 | 48,6 → 33,3 | −15,2 | 37,4 → 26,3 | 32,3 → 10,3 | −22,0 | 22,3 → 9,8 |
| C3 · r1 | 64,7 → 53,3 | −11,3 | 37,0 → 32,1 | 19,2 → 19,2 | 0,0 | 13,5 → 12,2 |
| C3 · r2 | 34,9 → 35,5 | +0,6 | 28,8 → 23,1 | 11,5 → 17,9 | +6,5 | 12,2 → 10,7 |
| C3 · r3 | 41,3 → 39,9 | −1,4 | 33,0 → 27,2 | 13,4 → 11,6 | −1,8 | 12,3 → 10,4 |

### Un hallazgo lateral: BASELINE a veces baja el fichero casi dos veces

En 3 de 11 aperturas con la configuración de hoy (las 10 de BASELINE y el control), se bajaron **1,6–1,9 veces**
los bytes del fichero:
- `004120`: 123,0 MB (C3 · r1) y 115,7 MB (control de producción);
- `004122`: 45,2 MB (C3 · r2).

El flujo completo y las peticiones por rangos se solapan. Es desperdicio real de datos, pero su efecto en tiempo no
es constante: la de 123 MB fue la más lenta (64,7 s) y la de 45,2 MB, la más rápida de su lámina (11,5 s). No
cambia la conclusión. Queda anotado por si algún día se revisa la descarga para documentos de muchas páginas.

### Límites

- **Una sola conexión y una sola máquina,** en horario de oficina. Con n = 5, la variación de la red impide ver
  efectos por debajo del ~15–20 %.
- **1 MB y 2 MB tienen n = 2.** Basta para descartarlas: bajan el doble de bytes en las 4 aperturas.
- **El pico de heap no cuenta el worker ni los lienzos.** Sin diferencia relevante entre variantes.

## 4 · Quick win · `api/docs/miniaturas/urls`

### Por qué se repiten

`FilesPage` pasa a `MatrixGrid` `files={fe.filteredFiles}`, y `useFileExplorer` calcula `filteredFiles` con un
`files.filter(…)` en cada renderizado: **un array nuevo en cada pasada, con el mismo contenido**. El efecto que
pide las URLs dependía de `[files, projectPrefix]`, así que **cada renderizado del explorador lanzaba otra petición
idéntica**. Esto incluye clics, cambios de estado y el documento abierto encima, porque la cuadrícula sigue montada
debajo del lector.

Además, la limpieza del efecto (`vivo = false`) **anulaba la respuesta anterior**: de N peticiones solo se usaba la
última.

### Prueba de que son redundantes (producción, vista en cuadrícula, antes del arreglo)

| Carga | Peticiones | Contenido |
|---|---|---|
| Carpeta `…/PAISAJISMO/PDF` en cuadrícula, pasada 1 | **10** en 2,7 s | las 10 con los mismos 20 urns (huella `7dad4f2bc4`), todas desde el efecto de `MatrixGrid` |
| Ídem, pasada 2 | **9** en 2,6 s | las 9 con los mismos 20 urns (`7dad4f2bc4`) |
| Arranque de la página y cambio a cuadrícula | 5 y 4 | mismos 20 urns |

**Apertura desde la cuadrícula: NOT MEASURED en producción.** El clic del banco no abrió el documento. Después se
vio que la ventana del banco estaba oculta (`visibilityState: hidden`). Lo que ocurre al abrir lo cubre el arnés
(§4.2): cada renderizado del padre es una petición.

### 4.1 · Arreglo

`frontend-docs/src/components/MatrixGrid.jsx` (+14 −4), el mismo patrón que ya usa `PDFViewer` para su cinta
(`firmaHermanos`):
- una **firma** de los archivos con vista: `JSON.stringify` de sus `gcs_urn`, exacta y sin separadores ambiguos;
- el efecto depende de `[firmaVista, projectPrefix]` y reconstruye la lista con `JSON.parse(firmaVista)`;
- sin `eslint-disable`.

La petición solo se repite si cambian los archivos que se ven (otra carpeta, un filtro, una versión nueva con otro
`gcs_urn`) o la obra.

### 4.2 · Antes y después, con el componente real (arnés determinista)

`MatrixGrid` de HEAD frente al del árbol de trabajo, empaquetados con esbuild. La única pieza falsa es
`urlsDeMiniaturas`, sustituida por un doble que cuenta las llamadas. El padre imita a `FilesPage`: un array nuevo en
cada renderizado. Ejecutado en Chrome sin ventana, aparte del banco.

| Escenario | HEAD | Arreglo |
|---|---|---|
| Montaje | 1 | 1 |
| 10 renderizados del padre, misma carpeta | **+10** | **+0** |
| Cambia el conjunto (entra un archivo, 21 urns) | +1 | +1 |
| Mismos datos recargados (objetos nuevos, mismos urns) | +1 | +0 |
| Con 1 vista pendiente: 6 renderizados en 3 s | **+6** | **+0** |
| · reintento a los 12 s | **no llega** (cada renderizado lo reinicia) | llega, 1 vez |
| Miniaturas pintadas | 20/20 | 20/20 |
| **Total del guion** | **20 peticiones** | **4 peticiones** |

El arnés destapa un segundo defecto de HEAD, que el arreglo también resuelve: con vistas pendientes, cualquier
renderizado cancelaba el reintento de 12 s y lanzaba una petición inmediata en su lugar.

### 4.3 · Verificación local

- **ESLint** (`MatrixGrid.jsx`): 2 errores, **los mismos 2 que en HEAD** (`isAdmin` sin usar y `setState` síncrono
  en el efecto, que no se tocó). Ninguno nuevo.
- **`npm test`:** 10 bancos, todos en verde.
- **`vite build`:** correcto.

### 4.4 · Pendiente

- **Medición en producción del arreglo** (compilación `dist_dedup`, script `miniaturas_p0.mjs`, preparado para
  medir carpeta, apertura, documento abierto y cierre): **NOT RUN**. Poco antes de medir, el Chrome de banco perdió
  la sesión y quedó en la pantalla de acceso. No se tocó: el ingreso es del propietario. Después se cerró ese
  Chrome y se borró su perfil temporal, como estaba previsto. Para medirlo hay que abrir otro banco y que el
  propietario inicie sesión una vez; el banco ya arranca con `--disable-features=CalculateNativeWinOcclusion`, para
  que una ventana tapada no cuente como oculta.
- **No se le atribuye mejora del PDF pesado.** Son POST pequeños que no intervienen en la descarga del PDF ni en el
  dibujo.

## 5 · Qué no se tocó

- Nada del lector, de pdf.js ni de `RECURSOS_PDF` en el repositorio.
- Sin mosaicos, vista previa en servidor, cambio de motor, reescritura del lector, zoom ×3–×8 ni infraestructura.
- Único cambio en el repositorio: `MatrixGrid.jsx` y este informe. Sin commit, push ni despliegue.
