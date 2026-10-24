# Planilla · ¿la estamos mejorando o sobrecargando? Orden propuesto

23-oct-2026. Pregunta del propietario: «¿modificamos bien la Planilla o la sobrecargamos o la
desordenamos? ¿Cómo deberíamos organizarla? La idea es que sea un **cerebro central de consulta de
metadatos**.»

Respuesta corta: **la estamos sobrecargando.** Cada mejora de hoy es correcta por separado (motor, Excel,
encuadre, buscador, selección), pero se ha ido añadiendo como una franja o un modo más, y ya hay siete
maneras de acotar filas y cuatro de sumar, repartidas en cinco franjas que se comen la tabla.

## 1 · Diagnóstico medido

### 1.1 · La tabla casi no se ve

Panel por defecto: **280 px** (`inventoryPanelHeight`, App.jsx). Alturas del código, confirmadas con las
capturas del banco de hoy:

| Franja | Alto | Siempre |
|---|---|---|
| Título «PLANILLA» | 35 px | sí |
| Línea de estado («coincidencias visuales · filas locales · Aplicación visual pausada…») | ~24 px | sí |
| Barra de herramientas | 36 px | sí |
| Barra de edición en bloque | 34 px | al seleccionar |
| Contador («8.378 filas») | ~26 px | sí |
| Barra del buscador (ámbito, resultado, parecidos, «Sumar») | 60–200 px | al buscar |
| Cabecera de columnas | ~30 px | sí |
| Fila «Σ selección» | 28 px | al seleccionar |
| Pie | 30 px | sí |

| Estado | Barras | Queda para datos | Filas visibles (25 px) |
|---|---|---|---|
| En reposo | 181 px (65 %) | 99 px | **~4** (una es el grupo) |
| Con una selección | 243 px (87 %) | 37 px | **1** |
| Buscando con parecidos | > 280 px | 0 | **0** |

Captura del banco al buscar: solo se veía la lista de parecidos; ninguna fila. Con una selección: solo la
cabecera del grupo y la fila Σ. Y al seleccionar, la barra de edición **empuja la tabla 34 px**: la fila que
se iba a pulsar con Mayús ya no está ahí. Por eso «Mayús no funciona».

### 1.2 · Siete maneras de acotar filas, en cinco sitios

1. **Filters** (otro panel).
2. **Filtros de la tabla** (embudo).
3. **Buscador**.
4. **«Buscar en lo seleccionado»**.
5. **«Filtrar selección (n)»** (botón de sincronía con el 3D).
6. **Aislar en el 3D** (refina la tabla).
7. **Solo con metrado**.

Nada las reúne: para saber por qué la tabla tiene 5 filas hay que mirar en cinco sitios.

### 1.3 · Cuatro maneras de sumar

Pie (cálculo por columna) · fila «Σ selección» · botones «Sumar» del buscador · botón «Sumas» (el antiguo,
que se guarda en las vistas). Cuatro respuestas a la misma pregunta («¿cuánto suma esto?»).

### 1.4 · Contradicciones visibles

- «6 sel.» y a la vez «Filtrar selección (12)»: la tabla y el 3D usan claves distintas
  (`inventoryRowKey` y `viewerElementKey`) y se cuentan dos veces.
- Buscar un código padre («06.02.01.03») trae 10 elementos por 11 códigos hijos repartidos en 4 parámetros
  (NombreDePartida, CodigoDePartida1/2/3), **sin decir cuáles**; y propone «parecidos» de códigos con los
  mismos números en otro orden (error de la regla: con códigos el orden importa).

## 2 · Cómo lo resuelven los que lo hacen bien

| | Acotar | Ver qué está acotado | Sumar | Guardar la consulta |
|---|---|---|---|---|
| **Excel** | autofiltro en la cabecera: lista de **valores con casilla** y buscador | flecha marcada en la cabecera | **barra de estado**: suma, promedio y recuento de **lo seleccionado** | — |
| **Tandem** (medido, doc 18) | Advanced filters (con contador) y Filters | contador «(2)» en el botón | pie y totales de grupo; la selección **no** suma | Views, en su panel |
| **Airtable / Notion** | una sola barra: Filtro · Agrupar · Ordenar · Campos, y búsqueda | contador en cada botón | barra de resumen por columna | **cada vista guardada es una consulta** |

Lo común: **una sola barra**, **un sitio por pregunta**, contadores en los botones en vez de franjas
nuevas, y el resumen siempre en el mismo lugar (abajo).

## 3 · El orden propuesto: una consulta = cuatro preguntas

Un «cerebro de consulta» responde siempre lo mismo, y cada respuesta tiene **un solo sitio**:

| Pregunta | Sitio | Qué reúne |
|---|---|---|
| **¿Qué elementos?** | barra superior + **línea de ámbito** | buscador, filtro de la tabla, selección, Filters, aislar, solo con metrado: todo como **chips con ✕** en una línea («Busca: DN 1000 · 5» · «Área > 1» · «Selección · 6» · «Filters: Drenaje») |
| **¿Qué ver?** | Columnas | columnas, y en búsqueda el parámetro encontrado delante |
| **¿Cómo agrupar?** | Agrupar | niveles y totales por grupo |
| **¿Cuánto es?** | **el pie, y solo el pie** | cálculo por columna; con 2 o más filas elegidas el pie pasa a ser **la selección** (como la barra de estado de Excel), en color y con «6 elegidas · volver al total» |

```
┌ PLANILLA ─────────────────────────────────────────────────────────────── ⧉ ✕ ┐
│ [Buscar o pegar un valor…      ▾]  Filtro (2)  Columnas  Agrupar (1)  │ Seguir 3D  Exportar  ⋮ │
│ 5 de 8.378 · Busca «DN 1000» (1 valor) ✕ · Área > 1 ✕ · Selección 6 ✕          │  ← solo si algo acota
├──────────────────────────────────────────────────────────────────────────────┤
│ Name │ 03_05_DSI_CodigoDePartida │ Cotas › Longitud │ …                      │
│ …  filas (6–7 visibles en 280 px, nunca 0)                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│ 6 elegidas      │                          │ Σ 291,97 m  │ …   volver al total │  ← pie = barra de estado
└──────────────────────────────────────────────────────────────────────────────┘
```

**Lo que se fusiona o se mueve:**
- **Buscador** → el desplegable bajo la caja muestra la **lista de valores encontrados con casilla**, como el
  autofiltro de Excel («06.02.01.03.02 · CodigoDePartida1 · 5»), con «parecidos» aparte y sin marcar. Al
  cerrar queda **un chip** en la línea de ámbito. Desaparece la barra del buscador.
- **«Sumar» del buscador y «Σ selección»** → el **pie**. Se elige qué sumar en el pie (ya se puede) y en
  búsqueda las medidas van delante en las columnas (ya hecho).
- **«Buscar en lo seleccionado»** → un chip «Selección · 6» en la línea de ámbito: si está, todo se busca
  dentro de él.
- **Edición en bloque** → botón «Editar (6)» que abre un menú, sin franja nueva. Nada empuja la tabla.
- **«Filtrar selección (n)»** → el chip «Selección»; un solo recuento (arreglar las claves).
- **Solo con metrado**, **ventana aparte**, **Sumas antiguas** → menú **⋮**.
- **Título + línea de estado + barra** → una sola barra. La línea de estado de Filters (texto técnico, trabajo
  de otra tarea) pasaría a un aviso al pasar el ratón: **decisión del propietario**.

**Resultado esperado:** de 181–330 px de barras a **96–120 px**; en el panel de 280 px, de 0–4 filas a
**6–7**. Siete maneras de acotar → **una línea** que las enseña todas. Cuatro maneras de sumar → **una**.

## 4 · Lo que hace de la Planilla un «cerebro» (y no solo una tabla)

Con ese orden, las preguntas reales de obra tienen un camino corto y siempre el mismo:

| Pregunta | Camino |
|---|---|
| ¿Cuánto mide la partida X? | pegar la descripción o el código → marcar valores → leer el pie |
| ¿Cuánto mide cada partida? | Agrupar por CodigoDePartida → totales por grupo → Exportar |
| ¿Qué falta parametrizar? | Filtro «CodigoDePartida está vacío» → n elementos → verlos en 3D |
| ¿Cuánto es lo que tengo seleccionado en 3D? | seleccionar (Ctrl en el visor o Mayús en la tabla) → el pie pasa a la selección |
| ¿Esto que veo, de dónde sale? | la línea de ámbito lo dice entera; el Excel lo repite en «Criterios» |

Siguiente paso natural, **solo con autorización** (Saved Views es CLOSED): **guardar una consulta con nombre**
(ámbito + columnas + agrupado + cálculos), como las vistas de Airtable, para repetir cada mes la misma
comprobación.

## 5 · Lo que no se toca

Extracción y datos; el motor (`inventoryTabla`, `inventoryBuscar`, `inventoryCatalogo`, `inventoryExport`,
con sus pruebas) se queda: el cambio es de **organización de la pantalla**. Las vistas guardadas siguen
leyéndose igual.

## 6 · Orden de trabajo propuesto

1. **Sin saltos y un solo pie** — edición en bloque a «Editar (n)», el pie como barra de estado de la
   selección, quitar la fila Σ, un solo recuento de selección. (Arregla «Mayús no funciona».)
2. **Línea de ámbito** — todos los acotamientos como chips con ✕ y «n de N».
3. **Buscador como autofiltro de Excel** — lista de valores con casilla; códigos por tramos («06.02.01.03»
   encuentra 06.02.01.03.xx, nunca 106.02… ni 06.03.01.02); parecidos solo para textos con palabras.
4. **Una sola barra** — título, barra y menú ⋮; la línea de estado de Filters, si el propietario lo autoriza.
5. (Con autorización) **Consultas guardadas**.

## Hecho · encuadre (24-oct-2026, en local, sin commit)

Pedido: «que todo salga encuadrado, ordenado; cuando pego una partida, que nada se salga de su zona».
Medido antes en el banco (ventana de 852 px, panel de 280 px):
- la Planilla tenía **opacidad 0,95**: la barra de herramientas del visor y «Capas · Agrupación» se veían a
  través de la tabla y del pie;
- el panel se apoyaba en el fondo y **tapaba la barra inferior del visor** (812–852) y la barra de
  herramientas (746–802);
- la Planilla no encogía con el tirador de 5 px: **se salía 5 px por abajo**;
- las franjas fijas ocupaban **187 de 279 px** en modo búsqueda: **cero filas de datos visibles**.

Cambios:
- Panel encima de la barra inferior (se mide su alto) y la barra de herramientas del visor sube por encima
  del panel (App.jsx).
- Planilla opaca y encogible dentro de su panel.
- Franjas: la línea de estado de Filtros va en la barra del título (mismo texto); el contador de filas va en
  la barra de herramientas; la edición masiva solo aparece al pulsar «Editar (n)»; «Buscar en» y «Sumar»
  en una sola línea: lo encontrado se desvanece en el borde si no cabe, las sumas siempre a la vista; los
  campos sin el prefijo del grupo (va en el título).
- Buscador: se ensancha con texto (hasta 560 px) y muestra lo pegado al pasar el ratón.
- Columnas en búsqueda: Nombre, el campo donde se encontró (≥ 320 px), las medidas que se suman y luego los
  demás campos donde aparece.
- Subtotal de grupo alineado con el pie (las celdas sumaban su relleno al ancho y se iban desplazando); el
  subtotal de la selección no se repite si coincide con el pie.
- Partidas: su línea de resumen en una sola línea.

Resultado medido: franjas fijas 97 px en búsqueda (antes 187; la tabla pasa de 92 a 177 px y la Planilla acaba en 812, el borde de su panel); a la altura normal se ven 5 filas sin
búsqueda y la selección con su subtotal y el pie con búsqueda; con el panel Filters abierto (ancho menor)
nada se sale. Pruebas: partidas 42/42, tabla 75/75, buscar 30/30, export 38/38, catálogo 19/19, encuadre 16/16.
