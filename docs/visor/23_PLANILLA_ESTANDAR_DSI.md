# Planilla · que entienda el estándar DSI (diseño, ejecución, gestión)

24-oct-2026. Corrección del propietario: «la Planilla debería servir para **diseño, ejecución y gestión**.
Tus ejemplos son genéricos: si selecciono en el modelo lo que me interesa y quiero longitud, área o
volumen, la Planilla no sabrá y me dará los cientos de columnas de lo que seleccione».

Tiene razón: la Planilla trata los 357 parámetros como iguales. Pero **la parametrización DSI ya dice qué
es cada cosa**. Medido sobre Drenaje (8.378 elementos, solo lectura).

## 1 · Cómo está hecha la parametrización DSI

Los parámetros `NN_NN_DSI_…` están ordenados por grupos:

| Grupo | Qué responde | Ejemplos (con dato en Drenaje) |
|---|---|---|
| **00** | datos propios de familia | `00_SYP_Altura_Solado` |
| **01** | **qué es y dónde está** | Localizador (54 %), Ubicación (84 %), SubUbicación (76 %), Zona, SubZona (54 %), Estado, Disciplina, Material, Paquete, Componente |
| **02** | **cuánto** | `Unidad1…5`, `Longitud1…3`, `Area1…3`, `Volumen1…3`, `Peso`, `MetradoElemento`, `MetradoPartida` |
| **03** | **a qué partida pertenece** | `CodigoDePartida`, `CodigoDePartida1…4`, `NombreDePartida`, `NombreDePartida1…5`, FaseObra, Planos, PPTP |
| **04** | **ejecución y gestión** | `InicioProgramado1…`, `InicioReal1…` (46 %), `FinProgramado`, `FinReal`, MesEjecutado, ControlesCalidad, LiberacionCalidad, ResponsableBIM, MetradoContractual, costos `04_28…04_32` |

Y lo más importante: **cada elemento lleva hasta 5 «líneas de partida»**, numeradas. La línea *i* reúne
`CodigoDePartida{i}` + `NombreDePartida{i}` + `Unidad{i}` + su cantidad + `InicioReal{i}` / `FinReal{i}`. Una
losa no es una fila: son **las partidas que esa losa genera**.

## 2 · Ejemplos reales

**Losa `Suelo [6762790]`** (Revit: Área 7,080 m², Volumen 1,416 m³):

| Línea | Código | Partida | Unidad | Cantidad | Real |
|---|---|---|---|---|---|
| 1 | 06.03.02.05.01 | CORTE Y ROTURA DE PAVIMENTO RIGIDO - CONCRETO | m³ | **1,522** (parámetro) | 24/10/2026 |
| 2 | 06.03.02.05.02 | ELIMINACIÓN DE MATERIAL PROVENIENTE DE DEMOLICIÓN | m³ | **0,000** | 24/10/2026 |
| 3 | 06.08.02.05.07 | *(sin nombre)* | m³ | **0,000** | — |

Tres cosas que hoy la Planilla no dice: el volumen parametrizado (1,522) **no coincide** con el de Revit
(1,416, −7 %); la línea 2 **no tiene cantidad**; la línea 3 **no tiene nombre ni cantidad**.

**Barra `Barra de armadura [7031992]`** (Revit: longitud total 0,660 m; `02_06_DSI_Peso` = 0,994 kg/m):

| Línea | Código | Partida | Unidad | Cantidad |
|---|---|---|---|---|
| 1 | *(sin código)* | SUMINISTRO Y DIMENSIONADO DE ACERO CORRUGADO | kg | — |
| 2 | 06.07.01.03.04 | INSTALACION DE ACERO CORRUGADO… | kg | — |

El peso no está escrito en ninguna línea, pero **se puede calcular**: 0,660 m × 0,994 kg/m = **0,656 kg**.

## 3 · Dónde está la cantidad de cada línea (medido)

| Categoría · línea · unidad | Líneas | Con su propio campo de cantidad | Dónde está la cantidad |
|---|---|---|---|
| Structural Rebar · 2 · kg | 1.465 | 70 | `Longitud total de barra` × `02_06_DSI_Peso` (kg/m) |
| Structural Rebar · 1 · kg | 1.201 | 110 | ídem |
| Walls · 1 · m² | 1.449 | 179 | **en ningún sitio** |
| Walls · 1 · m | 1.433 | 0 | **en ningún sitio** (p. ej. juntas de dilatación) |
| Walls · 2 · m² | 1.215 | 103 | **en ningún sitio** |
| Floors · 1 · m³ | 352 | 150 | `Cotas › Volumen` (322) |
| Generic Models · 1 · m | 292 | 239 | el propio campo |
| Floors · 2 · m³ | 276 | 2 | `Cotas › Volumen` (274) |

Conclusión: la unidad y la partida **sí** están parametrizadas; la cantidad muchas veces **no**, y hay que
sacarla de Revit con una regla, o avisar de que falta. Además `04_10_DSI_MetradoContractual` = 0 en los
8.378 elementos.

## 4 · Propuesta: la Planilla lee el estándar

### 4.1 · Diccionario del estándar (una vez, para todos los proyectos que lo usen)

Qué parámetro es código, nombre, unidad, cantidad, inicio y fin de cada línea; qué grupo es «dónde», «cuánto»,
«partida», «ejecución», «gestión». Para DSI se reconoce solo por la numeración (`03_05` = código…). Otro
estándar se configura una vez. Sin IA: es una tabla de equivalencias que se ve y se corrige.

### 4.2 · Receta de cantidad por unidad (visible, confirmada por el usuario)

| Unidad | Primero | Si no hay | Si no hay |
|---|---|---|---|
| m³ | `Volumen{i}` | `Cotas › Volumen` | «sin cantidad» |
| m² | `Area{i}` | `Cotas › Área` | «sin cantidad» |
| m | `Longitud{i}` | `Cotas › Longitud` | «sin cantidad» |
| kg | `Peso{i}` | `Longitud total de barra` × `02_06_DSI_Peso` | «sin cantidad» |
| und | 1 por elemento | | |

Cada cantidad dice **de dónde salió** (parámetro / Revit / calculada) y avisa si parámetro y Revit no
coinciden (la losa: −7 %).

### 4.3 · Vista «Partidas»: una fila por línea de partida, no por elemento

Seleccionas en el modelo lo que te interesa y la Planilla enseña **solo sus partidas**, cada una en su
unidad y sumada (maqueta: **las cifras son ilustrativas**, no medidas):

```
Selección: 12 elementos · 7 partidas
06.03.02.05.01  CORTE Y ROTURA DE PAVIMENTO RIGIDO     m³   18,264   (parámetro 12)
06.03.02.05.02  ELIMINACIÓN DE MATERIAL DE DEMOLICIÓN  m³    —       sin cantidad en 12  (aviso)
06.07.01.03.04  INSTALACION DE ACERO CORRUGADO         kg   412,70   (calculada: long. × kg/m)
…
```

Sin cientos de columnas: la unidad la pone la propia partida. Clic en una partida → sus elementos en 3D.

### 4.4 · Tres lentes sobre los mismos datos (botón de la barra)

| Lente | Para | Responde |
|---|---|---|
| **Diseño** | el modelador / BIM | ¿está bien parametrizado? líneas sin código, sin nombre, sin unidad, sin cantidad; parámetro ≠ Revit; diámetros raros (601/801 mm); qué falta por zona |
| **Ejecución** | producción / oficina técnica | ¿qué se ejecutó y cuándo? por `InicioReal`/`FinReal` de cada línea, por mes; programado vs real; liberación de calidad |
| **Gestión** | valorización / control | ¿cuánto vale? metrado del modelo por partida vs contractual (hoy 0 en todo: no comparable), costos `04_28–04_32`, valorización del mes |

Cada lente es solo un orden de columnas, un agrupado y unos avisos sobre la vista «Partidas»; los datos son
los mismos.

## 5 · Qué hace falta y qué no

- No toca la extracción ni el dato: todo se lee de lo que ya hay.
- El diccionario y las recetas confirmadas se guardan: en local primero; para compartirlas con el equipo
  hace falta guardarlas en el servidor (**autorización**).
- La vista «Partidas» es una transformación pura (elemento → líneas), con pruebas, como el resto del motor.

## 6 · Orden

1. Arreglar lo que estorba (tabla que salta, una sola suma; doc 21 paso 1).
2. **Vista «Partidas»** con el diccionario DSI y las recetas (lo que pide el propietario: elegir en el
   modelo y obtener longitud, área, volumen o kg según la partida).
3. Lente **Diseño** (avisos de completitud): es la que más valor da hoy, por lo medido en §3.
4. Lentes **Ejecución** y **Gestión**.
5. Guardar diccionario, recetas y consultas para el equipo y otros proyectos (autorización).

## 7 · Decisión del propietario (24-oct-2026): mandan las medidas nativas

> «Debe ser solo nativos; solo en casos donde se haya modelado con genérico o familias que no dan medidas y
> se haya colocado manual en algún parámetro, ahí veríamos cómo hacer.»

Sustituye a la receta del §4.2 (que ponía primero el parámetro): **la cantidad de una línea es la medida
nativa de Revit** según su unidad (m → Longitud, m² → Área, m³ → Volumen). El parámetro manual
(`Longitud{i}`, `Area{i}`, `Volumen{i}`, `Peso{i}`) **no se suma con lo nativo**: se enseña aparte como
«manual» y su tratamiento queda por decidir.

Aplicada a todas las líneas de Drenaje (24-oct, solo lectura):

| | Líneas |
|---|---|
| con medida **nativa** | 2.028 |
| sin nativa, **solo manual** | 872 |
| **sin medida** | 6.442 |
| unidad no estándar («Kg», «und», «01», «0») | 310 |

| Categoría · unidad | Líneas | Nativa | Solo manual | Sin medida |
|---|---|---|---|---|
| Pipes · m | 195 | **195** | 0 | 0 |
| Floors · m³ | 990 | **956** | 0 | 34 |
| Floors · m² | 606 | **578** | 16 | 12 |
| Walls · m³ (Muro básico) | 253 | **253** | 0 | 0 |
| Slab Edges · m³ | 46 | **46** | 0 | 0 |
| Walls · m² | 2.823 | 0 | 435 | 2.388 |
| Walls · m | 1.433 | 0 | 0 | 1.433 |
| Structural Rebar · kg | 2.666 (+278 «Kg») | 0 | 180 | 2.486 |
| Generic Models · m | 328 | 0 | 239 | 89 |

**Lo que hay detrás de los vacíos:**
- **Encofrados modelados como muros.** Los «Walls» con partida son casi todos encofrados: `Encofrado_Plano`
  (2.080), `Encofrado_Monolitico_Neto` (401), `Encofrado_Curvo_Diamante` (111)… **No traen área, volumen ni
  longitud nativos**, y el visor de Autodesk tampoco las tiene (comprobado con `getProperties` sobre tres de
  ellos): el dato no llega de Revit a Autodesk; no es nuestra extracción. Es el caso «familias que no dan
  medidas» del propietario. Caminos posibles, por decidir: medir la superficie en la geometría 3D (regla fija,
  validada contra Revit), exportarla desde Revit (plugin / Design Automation) o el parámetro manual.
- **Armadura (kg).** Revit da la **longitud total de barra** nativa (todas la tienen), pero no el peso. El
  peso sería longitud nativa × peso nominal por diámetro (tabla normativa) — por decidir con el propietario.
- **Unidades escritas de varias formas** («kg» / «Kg», «m2» / «m²»): se normalizan al leer.

## 8 · Cómo se metran en Revit los que no traen medida (aclaración del propietario, 24-oct)

> «En Revit lo sacaron por material: área, o si no crean un parámetro combinado, así como para acero en kg.»

**Encofrados.** El área por material (tabla de materiales de Revit) **no viaja** a Autodesk: Model Derivative
exporta parámetros del elemento, no cantidades por material. El parámetro combinado existe —
`Otros › Área de encofrado`, en 1.756 de los 4.941 encofrados— pero **vale 0 en todos**. Hoy no hay área de
encofrado en ningún dato que llegue al visor. Caminos (decisión del propietario):
1. que el parámetro combinado `Área de encofrado` se calcule en Revit (como el kg del acero) → viaja y se lee;
2. exportar las cantidades por material desde Revit con el plugin ECDLink;
3. medir la superficie en la geometría 3D con una regla fija, validada contra la tabla de materiales.

**Acero.** La regla nativa funciona: `Cotas › Longitud total de barra` (nativa, en todas) × kg/m según
`Cotas › Diámetro de barra` (nativo; tabla normativa 3/8" 0,560 · 1/2" 0,994 · 5/8" 1,552 · 3/4" 2,235 ·
1" 3,973). Drenaje: 1.785 barras (1/2" 1.646 · 5/8" 104 · 3/8" 35) → **42.088 kg**. El kg/m de
`02_06_DSI_Peso` coincide con la tabla salvo en 8 barras.

El combinado de Revit en kg (`02_06_DSI_Peso1/2`) solo está en 312 barras y **no cuadra en 127 (41 %)**:
Revit 7.954,5 kg frente a 7.145,5 kg nativos en esas barras. Ejemplo: `Barra de armadura [3107152]`,
Ø 1/2" nativo, 20,25 m → 20,13 kg; Revit dice 11,232 kg, que es 20,25 m × 0,555 kg/m (peso de 3/8").
Con la regla del §7, el combinado se enseña aparte como «manual» con su diferencia; no se suma.

## 9 · Hecho: vista «Partidas» (24-oct-2026, en local, sin commit)

- `lib/planillaPartidas.js` (33/33): diccionario DSI por el nombre del parámetro (en cualquier grupo); líneas
  sin número y 1–5; cantidad **nativa** según la unidad (m/m²/m³; kg = longitud total de barra × kg/m del
  diámetro nativo; und = 1); lo manual aparte; rellenos («0», «NA», «-») no son partida ni unidad; «Und.»,
  «Kg», «m2» se normalizan; una fila = **código + unidad** (sin código: nombre + unidad), con el nombre más
  usado; Excel de partidas con hoja de criterios.
- `components/TablaDePartidas.jsx` y conmutador **Elementos | Partidas** en la barra. Ámbito: lo que el
  usuario selecciona (tabla o 3D); si no hay, la tabla. Pulsar una partida selecciona sus elementos en 3D sin
  cambiar el ámbito.
- Drenaje, toda la tabla: **633 partidas · 12.955 líneas · 7.709 sin medida nativa**. Ejemplos: 06.01.02.02
  Conformación… 185,4 m²; 06.01.03.02 Suministro de acero 3.568,8 kg (calc.) frente a 4.073,7 kg manual en 70;
  06.01.03.04 Encofrado cabezal muros: sin medida nativa en 28, manual 55,54 m²; 06.01.03.06 Concreto 280:
  30,69 m³.
- Selección real de 4 elementos (losas 000_TIPO TE y una barra): 4 partidas con código y nombre **sin unidad**
  en su línea → marcadas, sin adivinar.
- Arreglado al probar: al volver de Partidas a Elementos la rejilla quedaba vacía (el observador de altura se
  enganchaba una sola vez).

Pendiente: paso 1 del doc 21 (la tabla salta y en 280 px caben 2 filas).

## 10 · Multiselección en el modelo (24-oct-2026, en local)

Queja del propietario: «la selección múltiple sigue sin funcionar en el modelo». Causa, previa (en producción):
`Viewer.jsx` registra una herramienta propia, `CompleteBoxSelectTool`, con prioridad 1000, que en **cada clic**
hacía `viewer.select(elemento)` —sustituye la selección— sin mirar Ctrl ni Mayús. Solo se podían elegir varios
con Mayús + arrastrar (recuadro).

Arreglo (solo el clic con tecla, el resto igual): **Ctrl / Mayús + clic** añade o quita ese elemento conservando
lo ya elegido, en una sola selección agregada (varios modelos). Medido con el ratón real: clic A → [A];
Ctrl+clic B → [A, B]; Mayús+clic C → [A, B, C]; Ctrl+clic A → [B, C].

También corregido: la vista Partidas toma **la última selección del usuario** (tabla o 3D); antes, con casillas
marcadas en la tabla, seleccionar en el 3D no cambiaba nada. Lo que la propia Planilla selecciona al pulsar una
partida se reconoce como eco y no cambia el ámbito. Medido: 3 tubos en el 3D → 11 partidas (suministro,
instalación y prueba hidráulica de cada tubo con su longitud nativa); pulsar una partida → su elemento en 3D,
la lista igual; deseleccionar → toda la obra (633).

## 11 · Selección del modelo y orden de las partidas (24-oct-2026, en local, sin commit)

Pedido del propietario: «lo que selecciono se debe seleccionar también en la Planilla y agruparse; en Código
aparece el nombre, ¿por qué?».

**Por qué salía el nombre en Código.** Medido en Drenaje: en 67 líneas (casi todas la línea sin número) el
modelador puso la descripción en `03_05_DSI_CodigoDePartida` y el código en `03_04_DSI_NombreDePartida`. Es un
error de parametrización en Revit, no de la Planilla. Ahora se reconoce por la forma del código (pares de cifras
con puntos, `06.02.01.03.07`), se lee al derecho y la partida queda marcada con ⇄ en rojo; el encabezado dice
cuántas. El dato en Revit sigue mal: hay que corregirlo allí.

**Estructura de las líneas (medida).** De 806 elementos con línea sin número y líneas numeradas:
- 151: la línea sin número es la **partida padre** (su código es prefijo de las numeradas: `06.05.02.04.03`
  «BUZON TIPO T2» → `06.05.02.04.03.08` «FUSTE…»). Encabeza, no suma.
- 576: la línea sin número **repite** una numerada. Cuenta una vez (antes salía dos veces, una con el nombre en
  el código). En total, 589 líneas repetidas dentro del mismo elemento se cuentan una vez.

**Orden.** La vista Partidas agrupa como un presupuesto: bajo la partida padre si la hay; si no, bajo su
capítulo (el código sin su último tramo, `06.02.01.03`); lo que no tiene código va al final en «Sin código». El
encabezado del grupo NO suma: sus partidas son actividades distintas sobre las mismas piezas (suministro,
instalación, prueba) y sumarlas multiplica (2 tubos: 337,64 m en vez de 112,55 m). Lo que falta (código, nombre,
unidad) se escribe en rojo. El Excel lleva las columnas Grupo y Nombre del grupo.

**Selección del modelo en Elementos.** Con «Seguir el 3D», lo elegido en el modelo sube a un grupo propio
«Seleccionado en el modelo» con sus filas marcadas y un subtotal. Si algo elegido no tiene fila (no está en el
inventario extraído) se dice: «— n sin fila en la planilla». Lo marcado en la tabla con Mayús/Ctrl NO se mueve
arriba: el siguiente clic caería en otra fila.

Verificado en el banco (5181) con dos tuberías HDPE DN 1500 [2528502] y [2528679]: Elementos → grupo con las 2
filas y Σ 112,55 m; Partidas → capítulo 06.02.01.03 con 3 partidas (suministro, instalación ⇄, prueba
hidráulica), 112,55 m cada una, sin la fila repetida. La tubería [2528503] está en el 3D pero no en la Planilla:
el aviso lo muestra (causa sin investigar: probablemente la extracción). Pruebas `planillaPartidas` 42/42.
