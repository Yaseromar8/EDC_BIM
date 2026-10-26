# 31 · Listas de consulta en Excel · diseño (25-oct-2026)

SOLO DISEÑO. Pedido del propietario: «¿hay alguna forma estándar de que un usuario suba un Excel
de interés, una lista de partidas de interés o información de interés, de acuerdo a lo
parametrizado, y que pueda consultarse desde ahí?».

## 1 · La idea en una frase

**Tu Excel es la pregunta.** Cada fila de tu lista se busca en el modelo, y la Planilla te
devuelve **tu misma tabla completada**:
- cuántos elementos hay;
- cuánto miden;
- si se encontró o no;
- un clic para verlos en el 3D.

Sin IA: los valores de tu Excel se comparan con los valores del modelo, con reglas fijas y su
porqué.

Ejemplo, las partidas que le interesan al residente esta semana:

| Tu Excel | → | Lo que devuelve la Planilla |
|---|---|---|
| `06.02.01.03.05` | | ✔ 31 elementos · 1.240,5 m · ver en 3D |
| `06.05.02.04.03` | | ✔ 9 elementos · 9 und |
| `05.15.04.01` | | ✗ no está en el modelo |
| `TUBERIA HDPE DN 1500` | | ✔ 12 elementos (por descripción) · 480,0 m |

Sirve igual para una lista de **IDs de elementos** (los del informe de interferencias), de **zonas
o paños**, de **tipos**, de **activos**… Lo que sea, siempre que esté parametrizado en el modelo.

## 2 · ¿Hay un estándar?

| Estándar | Qué es | ¿Sirve aquí? |
|---|---|---|
| **IDS** (buildingSMART, oficial desde 2024) | XML que dice qué información debe tener cada tipo de elemento | Para **exigir** información, no para consultarla. Se podría importar después. |
| **COBie** | hojas de Excel con activos y espacios para entregar a operación | Es una **entrega**, no una consulta. |
| **Search sets** (Navisworks) y **Smart Views** (BIMcollab) | consultas guardadas | Se definen dentro de la herramienta, no se suben en Excel. |

**No hay un estándar para «subo mi lista de interés y la consulto».** Por eso proponemos el formato
más simple que ya se usa en obra en Latinoamérica: **un Excel cualquiera, con una o varias columnas de
valores**. Sin plantilla obligatoria ni encabezados fijos: la Planilla reconoce cada columna por sus
**valores**, igual que con el itemizado (doc 24).

## 3 · Cómo razona

1. **Lee el Excel**: todas las hojas y las columnas con datos. Elige la hoja con más valores que existen
   en el modelo.
2. **Cruza cada columna con los parámetros del modelo.** Por cada columna, en qué parámetro está la
   mayor parte de sus valores, comparados sin tildes ni espacios (la regla de `inventoryBuscar`). Lo
   dice: *«columna B → `Datos › 03_05_DSI_CodigoDePartida1` (41 de 44 valores)»*. Si una columna cuadra
   con dos parámetros, **pregunta**.
3. **Cada fila es una consulta.** Si la fila tiene varias columnas reconocidas, se cumplen todas a la vez
   (código **y** zona). Una columna que no cuadra con nada (comentarios, precios) se ignora y se dice.
4. **Busca y mide.**
   - Valor exacto primero; si no, sub-partida (doc 24); y si es texto largo, por descripción.
   - La cantidad sale de la medida nativa de Revit según la unidad. La unidad sale del Excel si trae
     columna de unidad; si no, del itemizado de la obra; y si tampoco, se dan las medidas que tenga el
     elemento.
5. **Estado de cada fila**:
   - ✔ encontrado;
   - ✗ no está en el modelo;
   - ⚠ ambiguo: el mismo elemento cumple dos filas, o el valor está en dos parámetros.

## 4 · Qué se puede hacer con la lista

- **Clic en una fila**: aislar sus elementos (el aislamiento momentáneo de siempre); otro clic, mostrar
  todo.
- **«Todo lo de la lista»**: aislar todas las filas encontradas.
- **«Lo que NO está en la lista»**: el resto, para ver qué falta revisar.
- **Colorear en Filters** por fila: la lista entra como campo derivado («Planilla › Lista: Interés
  semana 43»), igual que Estado y Capítulo (doc 27).
- **Exportar = tu mismo Excel** con columnas nuevas: Elementos, Cantidad, Unidad, Estado y en qué
  parámetro se encontró. Se lo devuelves a quien te lo pidió tal cual.

## 5 · Guardar y compartir

- Una lista se puede **guardar en la obra** con nombre («Interferencias semana 43», «Partidas
  críticas»), quién y cuándo, y versiones.
- Guarda **la lista, no los elementos**: se vuelve a responder con cada versión del modelo.
- Es la **misma tabla que el itemizado** (migración 40), generalizada. El itemizado es una lista con un
  papel especial: el criterio de partidas de la obra. Una migración aditiva (41) añade el tipo y el
  nombre a `planilla_itemizados`, o se hace una tabla hermana `planilla_listas`; se decide al
  implementar, sin borrar nada.

## 6 · Fases

| Fase | Qué | Guarda | Necesita |
|---|---|---|---|
| **L1** | Subir un Excel, reconocer columnas, buscar fila por fila, estado y cantidades, clic → 3D, exportar el Excel completado (solo en tu navegador) | no | — |
| **L2** | Guardar listas en la obra, con nombre y versiones; compartirlas | sí | tu OK a la migración |
| **L3** | La lista como campo para Filters; «lo que no está en la lista» | no | — |
| **L4** | Importar **IDS** (buildingSMART) como lista de exigencias | no | si lo pide una entidad |

**L1 ya resuelve el caso de todos los días**: «aquí está mi lista, ¿cuánto hay de cada cosa y dónde?».

## 7 · Límites, dichos

- Solo encuentra lo que **está parametrizado**. Si un valor del Excel no existe en ningún parámetro, la
  fila sale ✗ y no se adivina.
- La búsqueda por descripción enseña siempre la cifra de parecido y no se aplica sola cuando hay dudas.

## 8 · Decisiones del propietario

1. ¿Es esto lo que querías decir?
2. ¿Empezamos por L1 (sin guardar) para probarlo con un Excel tuyo?
