# 50 · Auditoría de los modelos frente al presupuesto (Canal y Drenaje urbano)

30-oct-2026. Hecho en local, en el banco del visor, con los datos reales de la nube. Lo pidió el dueño para su exposición:

> Cuántos elementos por lo menos tienen una partida o descripción de acuerdo a estas plantillas […] la auditoría debe ser por itemizado, descripción y unidad.

## Fuentes

- **Presupuestos** (los entregó el dueño; los cargará él en la Planilla de cada frente):
  - `Presupuesto_Rv00_COMPONENTE 11.2.xlsx`, hoja `CAOV`: **Drenaje urbano**, 852 ítems, de ellos **741 partidas** con unidad.
  - `Presupuesto_Rv00_COMPONENTE 4.xlsx`, hoja `CAOV`: **Canal y estabilización**, 568 ítems, de ellos **486 partidas** con unidad.
  - Columnas: A ítem · B descripción · C unidad. Un ítem sin unidad es un título.
  - El 30-oct el dueño quitó el metrado del Canal: «los dos solo deberían estar hasta unidad». Ítem, descripción y unidad no cambiaron (0 diferencias), así que las cifras de abajo siguen valiendo.
- **Modelos**: el inventario de la nube de cada frente.
  - Drenaje urbano: **8.379 elementos**.
  - Canal: **19.889 elementos**.

## Cómo se audita

- **Hasta 6 partidas por elemento.** Cada una se forma con sus tres parámetros del mismo número (sufijo vacío, 1, 2… 5):
  - `03_05_DSI_CodigoDePartidaN` → el **ítem**;
  - `03_04_DSI_NombreDePartidaN` → la **descripción**;
  - `02_01_DSI_UnidadN` → la **unidad**.
- **Tres pruebas** por cada partida asignada:
  1. **Ítem:** ¿el código existe en el presupuesto como partida y no como título?
  2. **Descripción:** ¿es igual a la del presupuesto? No cuentan las mayúsculas, las tildes ni los espacios.
  3. **Unidad:** ¿es igual? Se tratan como iguales m² y m2, m³ y m3, und y u.
- **Cada elemento queda en una sola clase**, la mejor de sus partidas:

| Clase | Significa |
|---|---|
| Ítem, descripción y unidad correctos | Al menos una partida pasa las tres pruebas |
| Ítem existe; descripción o unidad distinta | El código es bueno, pero el texto o la unidad no cuadran |
| Descripción del presupuesto, sin código | No tiene código, pero su descripción es exactamente una partida del presupuesto |
| Código que no está en el presupuesto | El código no existe en el itemizado |
| Sin partida | Ni código ni descripción |

- **«Con partida»** reúne las tres primeras clases. El elemento se puede asignar a una partida del presupuesto.

## Resultados

### Canal (Componente 4) · 19.889 elementos

| Clase | Elementos | % |
|---|---:|---:|
| Ítem, descripción y unidad correctos | 18.284 | 91,9 % |
| Ítem existe; descripción o unidad distinta | 893 | 4,5 % |
| Descripción del presupuesto, sin código | 382 | 1,9 % |
| Código que no está en el presupuesto | 40 | 0,2 % |
| Sin partida | 290 | 1,5 % |
| **Con partida** | **19.559** | **98,3 %** |

- **Las tres pruebas**, sobre 22.810 partidas asignadas:
  - **ítem** existe en 22.698;
  - **descripción** igual en 21.541, distinta en 435 y vacía en 722;
  - **unidad** igual en 22.693 y distinta en 5.
- **Lo que hay que corregir:**
  - **Descripción distinta (11 códigos):** el modelo antepone el elemento a la descripción del presupuesto. Por ejemplo, `05.14.03.03` dice «**LOSA** CONCRETO CICLOPEO (f'c 175…)» o «**MURO** CONCRETO CICLOPEO…», y el presupuesto, «CONCRETO CICLOPEO (f'c 175 kg/cm2 + 30% PG)». Es el mismo trabajo con otro texto.
  - **Unidad distinta:** solo `05.19.08.08`, con m³ en el modelo y m² en el presupuesto (5 elementos).
  - **Códigos que no existen:** `00.0000.00` en 40 elementos de Planting y `0` en 72 partidas.
  - **Sin partida:** sobre todo 201 Walls, 43 Piezas y 24 «Other Entities».
- **Cobertura del presupuesto:** **133 de 486 partidas (27 %)** tienen al menos un elemento.

### Drenaje urbano (Componente 11.2) · 8.379 elementos

| Clase | Elementos | % |
|---|---:|---:|
| Ítem, descripción y unidad correctos | 3.876 | 46,3 % |
| Ítem existe; descripción o unidad distinta | 432 | 5,2 % |
| Descripción del presupuesto, sin código | 2.551 | 30,4 % |
| Código que no está en el presupuesto | 318 | 3,8 % |
| Sin partida | 1.202 | 14,3 % |
| **Con partida** | **6.859** | **81,9 %** |

- **Las tres pruebas**, sobre 8.635 partidas asignadas:
  - **ítem** existe en 7.890 y no existe en 745;
  - **descripción** igual en 7.311, distinta en 416 y vacía en 163;
  - **unidad** igual en 6.987, distinta en 641 y vacía en 262.
- **Lo que hay que corregir:**
  - **2.551 elementos tienen la descripción exacta de una partida, pero no el código.** Son sobre todo Walls (2.496). Es la mejora más grande y la más fácil: poner el código que corresponde a esa descripción.
  - **Unidad «01» en lugar de la unidad real.** Por ejemplo, las rejillas `06.05.01.04.01`, `06.08.01.04.01` y `06.07.01.04.01`, que deberían ser **m**, y `06.08.01.03.05` y `06.07.01.03.05`, que deberían ser **m³**. También aparece m³ donde el presupuesto dice und (`06.05.02.04.01`).
  - **Códigos de 6 niveles que no existen en el presupuesto,** como `06.02.01.04.08.11` (83) o `06.02.01.04.06.19`. El presupuesto llega a 5 niveles: el buzón `06.02.01.04.08` es una partida en **und**, y el modelo apunta a un sub-ítem de su análisis de precios.
  - **Descripciones escritas en el campo del código,** por ejemplo «INSTALACION DE TUBERIA CORRUGADA PEAD … DN 250 MM».
  - **Sin partida:** 1.131 Walls, 46 Structural Rebar y 19 Plumbing Fixtures.
- **Por categoría:** Structural Rebar 1.624/1.785 correctos, Generic Models 296/322, Floors 441/613, Walls 1.468/5.514 y Pipes 0/65 (los 65 con descripción o unidad distinta).
- **Cobertura del presupuesto:** **287 de 741 partidas (39 %)** tienen al menos un elemento.

### Cómo leer la cobertura

Una partida sin elementos no es un error del modelo. Muchas partidas no se modelan: transportes, eliminación de material, señalización o cercos. La cobertura sirve para ver qué capítulos del presupuesto están en el modelo y cuáles no. No es una nota.

## Los gráficos (banco, Tablero → «Auditoría presupuesto»)

Hay cinco gráficos con un selector de motor (Apache ECharts, Observable Plot, Plotly). Un clic en una parte aísla en el 3D esos elementos.

1. **¿Cuántos elementos tienen partida?**
   - En ECharts y Plotly es una dona con el % en el centro.
   - En Plot es una barra al 100 %, porque Plot no hace tortas.
2. **Resultado por categoría de Revit:** barras apiladas.
3. **Las tres pruebas:** ítem, descripción y unidad, al 100 %.
4. **Cobertura del presupuesto por capítulo:**
   - En ECharts y Plotly es un treemap; el tamaño son las partidas del capítulo y el color, su % con elementos.
   - En Plot son barras.
5. **De qué categoría a qué resultado:**
   - En ECharts y Plotly es un sankey.
   - En Plot es una matriz, porque Plot no hace sankey.

**Comprobado en el banco:**
- **Canal:** el clic en «Walls · Descripción del presupuesto, sin código» aisló 382 elementos.
- **Drenaje:** las cifras salen del mismo cálculo.

### Segunda tanda (pedido del dueño: «¿esas son todas las gráficas? Reforcemos bien»)

Hay cinco gráficos más, y la vista llega a diez:

6. **Embudo de calidad:**
   - Pasos: elementos → con código → el código existe → … y la descripción es igual → … y la unidad es igual.
   - En Canal: 19.889 → 19.217 (97 %) → 19.177 (96 %) → 18.289 (92 %) → 18.284 (92 %).
   - Un clic en un paso aísla esos elementos.
7. **Pareto:**
   - Los 15 códigos que concentran los errores (no existe, descripción o unidad distintas), con su % acumulado y la línea del 80 %.
   - Dice por dónde empezar a corregir.
8. **Sunburst:** capítulo → subcapítulo → partida, por elementos asignados. Muestra dónde está el peso del modelo dentro del presupuesto.
9. **Indicador:** el % con partida frente a una meta de referencia del 95 %. En Canal, 98,3 % (+3,3 puntos).
10. **Recorrido de 4 pasos** (categoría → ítem → descripción → unidad):
    - En ECharts es un sankey de varios niveles.
    - En Plotly son **categorías paralelas**.

### Catálogo de tipos de las tres bibliotecas (lo que más sirve en obra)

| Tipo | ECharts | Plotly | Observable Plot | Para qué en la auditoría |
|---|:-:|:-:|:-:|---|
| Barras, apiladas, 100 % | sí | sí | sí | Resultado por categoría, por capítulo |
| Dona, torta | sí | sí | no | Proporción del total (máx. 3–4 partes) |
| Mapa de calor | sí | sí | sí | Categoría × parámetro, % con dato |
| Treemap | sí | sí | no | Cobertura del presupuesto por capítulo |
| Sunburst | sí | sí | no | Jerarquía capítulo → partida |
| Sankey | sí | sí | no | Flujo categoría → resultado |
| Categorías paralelas | no | sí | no | Recorrido de cada elemento por las tres pruebas |
| Embudo | sí | sí | no | Pasos de calidad |
| Pareto (barra + línea, doble eje) | sí | sí | a escala | Dónde se concentran los errores |
| Indicador, gauge | sí | sí | no | % frente a meta |
| Cascada (waterfall) | con truco | sí | no | Del total a lo correcto, restando cada error |
| Histograma, caja, violín | sí | sí | sí | Reparto de tamaños, metrados atípicos |
| Dispersión con regresión | sí | sí | sí | Metrado del modelo frente al presupuesto por partida |
| Calendario | sí | no | sí | Avance diario (cuando haya fechas) |
| Radar | sí | sí | no | Comparar frentes en varias medidas |
| Selección con lazo → 3D | sí | sí | no | Elegir puntos del gráfico y aislarlos |

**Siguiente, con lo que traen los presupuestos (ítem, descripción, unidad):**
1. Lista de correcciones por elemento (CSV para el modelador).
2. Unidad frente a geometría: m³ con volumen, m² con área, m con longitud, kg con acero, und como conteo.
3. Partidas físicas sin modelar frente a las que no se modelan (m³-km, glb, mes).
4. Matriz partida × categoría.
5. Doble conteo: el mismo código en dos campos del mismo elemento.

Sin metrado ni precios en los presupuestos, no hay auditoría de cantidades ni de costos.

## En el producto (30-oct-2026, decisión del dueño: ECharts + Plotly, tarjetas editables)

El dueño eligió **ECharts como motor principal y Plotly como complemento** («si elijo ambos…»). Pidió además que **lo publicado se vea tal cual se probó**. Por eso las pruebas por CDN se retiraron y la auditoría pasó a ser parte del Tablero:

- **Motores instalados en el visor** (`echarts` 5.5.1 y `plotly.js-dist-min` 2.35.2 en `package.json`). Se cargan con el primer gráfico que los usa (`dashboard/motores.js`):
  - ECharts va en el bloque del Tablero;
  - Plotly (4,7 MB, 1,4 MB comprimido) solo se baja si en pantalla hay un «Recorrido de cada elemento».
- **Fuente: el itemizado vigente DEL FRENTE**, el que se sube a la Planilla (docs/visor/51), leído del mismo almacén que la Planilla. Ya no hay archivo local.
  - Sin itemizado, la tarjeta lo pide.
  - El pie de cada tarjeta dice de qué itemizado sale: «Itemizado del frente CANAL «…» v2 · N elementos».
- **Tipo de tarjeta «Presupuesto»** (`ChartCard`), con 10 análisis registrados en `analisisDeAuditoria.js`:
  - indicador, dona, embudo, por categoría, tres pruebas, Pareto, sunburst, cobertura y flujo, dibujados con ECharts;
  - recorrido, con categorías paralelas de Plotly.
  - El cálculo es puro (`auditoriaPresupuesto.js`) y se hace **una vez** para todas las tarjetas que comparten filas e itemizado.
- **Botón «Auditoría del presupuesto»:** crea una sección «Auditoría del presupuesto · frente CANAL · <archivo>» con las 10 tarjetas, **debajo de lo que ya hay** en el lienzo, y lleva la vista hasta ella.
- **Las tarjetas son normales:** se mueven, se redimensionan, se borran y se editan.
  - En el editor: tipo «Presupuesto», «Qué quieres ver» (los 10) y «Elementos a revisar».
  - **El título de cualquier tarjeta se cambia con doble clic.**
- **Interacción:**
  - un clic en una parte aísla en el 3D;
  - «Pintar» colorea por clase;
  - «Exportar CSV» baja el resumen, las pruebas y el Pareto.

**Comprobado en el banco** (Chrome con la sesión del dueño, Frente Canal):
- El servidor publicado aún no tiene el itemizado por frente, así que se **simuló su respuesta**: el Componente 4 como «del frente CANAL».
- Guardar el Tablero y la Planilla estuvo bloqueado: se frenaron 2 PUT y el tablero «General» de producción no cambió.
- Se dibujan las 10 tarjetas (9 ECharts + 1 Plotly), sin errores en consola.
- La sección se crea bajo las tarjetas existentes.
- Clic en el tramo «Ítem existe; descripción o unidad distinta» de la dona: aísla 888 + 5 = **893 elementos**, que es esa clase.
- El título se cambia con doble clic: «Canal · % con partida del Componente 4».
- El editor ofrece «Presupuesto» con los 10 análisis.

## Estado

- Hecho en local, con commit en la rama local `publicar-30oct`, **sin push**.
- Para verlo publicado: migración 42 → backend → visor (docs/visor/51). Después, el dueño sube en cada frente su presupuesto.
- `frontend-react/dist-banco/presupuestos-local.json` es solo del banco, para simular la respuesta. No se publica.
