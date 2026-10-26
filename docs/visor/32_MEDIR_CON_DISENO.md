# 32 · Criterios de medida de la obra («Medir con…») — DISEÑO

26-oct-2026 · Sigue a docs/visor/23 §7-§8 (mandan las nativas) y docs/visor/27 (quién hace qué).
Pedido del dueño: que funcione, **integral y no puntual**: no para una familia ni para una obra,
sino para los casos que habrá en muchas obras de Latinoamérica.

---

## 1 · El problema, en general

La Planilla da la cantidad de cada partida con la **medida nativa** del elemento según la unidad
(m → Longitud, m² → Área, m³ → Volumen, kg → barra × kg/m, und → 1). En toda obra hay elementos
que no traen esa medida:

| Caso | Ejemplo | Dónde está la medida |
|---|---|---|
| Familias propias con sus parámetros | malla de cerco (Interferencias): `Cotas › Long. Reja`, `Largo Total` | en un parámetro de la familia |
| Genéricos o «modelo in situ» | un sardinel modelado como genérico | en un parámetro que puso el cadista |
| Metrado por material | encofrado: área de la tabla de materiales de Revit | **no viaja a Autodesk** (docs/visor/23 §8); solo si se vuelca a un parámetro del elemento |
| Otros programas (IFC de Archicad, Tekla, Civil 3D…) | `Qto_WallBaseQuantities › NetVolume` | en conjuntos de cantidades con otros nombres |
| Revit en otro idioma | Revit en portugués, inglés | mismo dato, otro nombre |

Lo común: **la medida existe en algún parámetro del elemento, con su unidad, y solo la obra sabe
cuál es el correcto**. En un elemento real, Largo Total = 24,0098 y Long. Reja = 23,8098: elegir uno
es criterio de obra, no algo que el sistema pueda deducir.

Lo que esto **no** resuelve: si la medida no llega al visor (el área por material que no se volcó a un
parámetro), no hay dato que elegir. La salida es volcarla en Revit a un parámetro del elemento.

## 2 · Principios

1. **La nativa manda.** Un criterio solo **rellena** los elementos que no tienen medida nativa. Si un
   elemento trae su Longitud, Área o Volumen, se usa esa y el criterio no la toca.
2. **El criterio es de la obra, no del código.** No se escribe en el programa ni el nombre de una
   familia, ni el de un parámetro, ni un idioma. Cada obra pone sus criterios y quedan a la vista.
3. **No se adivina.** No hay coincidencias por nombre ni sugerencias preseleccionadas, y no se usa IA.
   Se enseñan los candidatos con sus números y el usuario elige.
4. **Siempre se ve el origen.** Una cantidad que sale de un criterio lleva su marca en la tabla,
   en la ayuda y en el Excel, y nunca se confunde con una nativa.
5. **Unidad comprobada.** Solo se aceptan parámetros cuyo valor trae la misma unidad que la partida
   («11.983 m» para una partida en m). No se mezclan unidades ni se suponen.

## 3 · Qué es un criterio

```
unidad      m                                     obligatoria: m · m² · m³ · kg
partida     01.02                                 opcional: sin ella, vale para TODAS las partidas
                                                  de esa unidad en la obra
solo donde  Datos de identidad › Nombre de tipo   opcional: limita a ciertos elementos,
            contiene «MALLA_HDPE»                 con cualquier campo del modelo (es / contiene)
medir con   1. Cotas › Long. Reja                 uno o varios, en orden: se usa el primero
            2. Cotas › Largo Total                que tenga valor > 0 en la unidad
```

Con las mismas cuatro piezas se cubren todos los casos de §1 sin código nuevo:

| Caso | Criterio |
|---|---|
| Malla de cerco, solo la partida del cerco | m · 01.02 · medir con Long. Reja |
| Todas las mallas, en cualquier partida | m · solo donde Nombre de tipo contiene «MALLA» · medir con Long. Reja |
| Obra que viene en IFC | m³ · (toda la obra) · medir con `Qto_…BaseQuantities › NetVolume` |
| Encofrado volcado a un parámetro | m² · solo donde Categoría es «Muros» · medir con `Otros › Área de encofrado` |
| Revit en portugués | m · (toda la obra) · medir con `Cotas › Comprimento` |

**Cuál manda si hay varios.** Para cada línea de partida de un elemento sin medida nativa, se
toma el criterio más específico que le aplique:

1. partida + «solo donde»;
2. partida;
3. «solo donde» (toda la obra);
4. toda la obra para esa unidad.

Si dos criterios del mismo nivel le aplican al mismo elemento, **no se elige uno en silencio**: el
elemento queda «sin medida» y se avisa del conflicto, diciendo cuáles son los dos criterios. El
diálogo además impide guardar dos criterios iguales.

## 4 · Cómo se usa

### 4.1 · Desde una partida

En Partidas, en la columna «Sin medida» (si es mayor que 0), el administrador de la obra ve
**«Medir con…»**. Los demás usuarios ven los criterios que hay, pero no los cambian.

```
Medir con… · 01.02 CERCO DE MALLA HDPE…  (m) · 188 elementos sin medida nativa

  Medir con (en orden):
    [1] Cotas › Long. Reja        188 de 188 con dato en m · Σ 455,49 m   [quitar]
    [+ añadir otro por si el primero falta]
        candidatos: Largo Total (188 · Σ …) · Largo_Caja (12 · Σ …) · …

  Vale para:  (•) esta partida          ( ) todas las partidas en m de la obra
  [ ] solo donde  [Nombre de tipo ▾] [contiene ▾] [SP.1.2_MALLA_HDPE…]   → 188 elementos

  Resultado: 188 elementos medidos · 0 siguen sin medida · Σ 455,49 m

                                                     [Cancelar]  [Guardar criterio]
```

- **Candidatos**: los parámetros numéricos de esos elementos cuyo valor trae la unidad de la partida,
  ordenados por cuántos elementos tienen dato. Ninguno viene marcado.
- Los valores del campo «solo donde» se proponen a partir de los elementos sin medida, con su número
  de elementos, para no tener que escribirlos.
- El resultado se calcula antes de guardar: se ve qué pasará.

### 4.2 · Lista de criterios de la obra

Junto a «cómo se leyó» aparece **«Criterios de medida (n)»**. Ahí se ven todos los criterios, con
cuántos elementos mide cada uno en lo que hay cargado, y el administrador los puede quitar. Si un
criterio no mide nada, se dice: «sin efecto: ningún elemento tiene ese parámetro».

### 4.3 · En la tabla y en el Excel

- La cantidad lleva **·crit.**, como hoy **·calc.** para el acero. Al pasar el ratón: «188 medidos con
  Cotas › Long. Reja (criterio de la obra v3, <quién>, 26-oct-2026)».
- La columna de cantidad pasa a llamarse **«Cantidad»**, y la línea de resumen distingue entre
  «x medidas con criterio» y «y sin medida».
- **Excel**: la columna «Origen» dice `nativa`, `calculada` o `criterio: Long. Reja`, y la hoja
  «Criterios» lista los criterios de medida vigentes.

### 4.4 · Avisos

| Situación | Qué pasa |
|---|---|
| El elemento tiene medida nativa | Se usa la nativa (principio 1). |
| Ningún parámetro del criterio tiene valor > 0 en ese elemento | Sigue «sin medida» y se cuenta. |
| El valor trae otra unidad («2.5 m²» para una partida en m) | No se usa; se cuenta como «unidad distinta». |
| Dos criterios del mismo nivel | «Sin medida» con aviso de conflicto (§3). |
| La partida del criterio ya no está en el itemizado | El criterio queda inactivo y se dice; no se borra. |

## 5 · Dónde se guarda

Se usa el mismo patrón ya probado con el itemizado (migración 40):

- Tabla **`planilla_criterios_medida`** (**migración 41**, aditiva, con rollback, la aplica
  `ecd_migrator`): una fila por **versión del juego completo** de criterios de la obra (`criterios`
  JSONB, `n_criterios`, `huella`), con una sola vigente por obra, autor, fecha y retirada.
  **Quitar no borra.** `ecd_app` tiene SELECT/INSERT/UPDATE y no tiene DELETE.
- Va **separada del itemizado**: el itemizado dice qué partidas hay y los criterios dicen cómo se
  mide. Cambiar de itemizado no hace perder los criterios.
- Rutas `GET/POST /api/planilla/criterios-medida`: `guardia_de_obra`, cambios solo para el
  administrador de la obra, bloqueo por obra, validación en el servidor, `503 MIGRATION_MISSING`
  sin la tabla y nunca un 401 con sesión. Quitar un criterio es guardar el juego sin él (otra
  versión).
- Sin la migración, la Planilla pasa a **modo navegador** con aviso, igual que el itemizado.

## 6 · Qué cambia en el código

| Pieza | Cambio |
|---|---|
| `lib/criteriosDeMedida.js` (nuevo) | validar, el índice por especificidad con conflictos, medir una línea, candidatos con cobertura y suma, describir. Puro, con banco. |
| `lib/almacenDeObra.js` (nuevo) | El almacén por obra (cargar, guardar, modo navegador, respuestas tardías) sale de `itemizadoDeObra.js` y sirve a los dos. El banco del itemizado sigue igual. |
| `lib/planillaPartidas.js` | Cantidad de una línea: nativa → criterio → sin medida. Se cuentan los orígenes, los conflictos y las unidades distintas. Excel con el origen y los criterios. |
| `TablaDePartidas.jsx` | «Medir con…», la lista de criterios, la marca ·crit. y el resumen. |
| Backend | `planilla_criterios_medida.py` (validación), rutas en `routes/planilla.py`, `sql/41` + rollback, `esquema_base.py`, pruebas. |

**No cambia:** la regla de las nativas, Filters (CLOSED), la cobertura y «qué falta», y la barra
«Sumar», que sigue siendo una calculadora momentánea.

## 7 · Fuera de esta versión (anotado)

- Ampliar la lista fija de medidas nativas (Revit en portugués, conjuntos de cantidades IFC). Hasta
  entonces, un criterio de toda la obra lo cubre sin código.
- Usar los parámetros manuales DSI (`02_0x_DSI_…{i}`) como criterio: son por línea y hoy se enseñan
  aparte. Hace falta decidir cómo se emparejan con su línea.
- Criterios con fórmula (p. ej. largo × alto). Solo parámetros tal cual: lo que se ve es lo que se suma.

## 8 · Escritos a mano (26-oct-2026)

Caso del dueño: un **modelo genérico** sin medida nativa donde quien modeló escribió la medida a mano
(`02_02_DSI_Longitud = 33.725`, o Área, o Espesor). Llega como número **sin unidad**, y el principio 5
lo dejaba fuera.

- Un criterio puede llevar **`aMano: true`**: acepta números sin unidad, leídos en la unidad de la
  partida. Un valor con **otra** unidad sigue sin usarse. Lo confirma el administrador al elegir un
  parámetro del apartado «Escritos a mano».
- La cantidad sale con **«·man.»** (origen «a mano» en el Excel), no «·crit.»: lo declaró quien modeló,
  no es geometría. Sirve al revisor.
- **No se enseñan los 50 parámetros numéricos**: solo los **probables**, con su razón, por señales que
  se pueden comprobar (ni nombres ni IA):
  1. con número en la mitad o más de los elementos sin medida de la partida;
  2. **coincide** (±2 %) con la medida de Revit en los elementos que sí la tienen; o
  3. está lleno **solo donde falta** la medida (≤ 10 % de los que la tienen). Fechas, códigos y costos,
     llenos en todas partes, quedan fuera.
  Además: lo que empieza por cero y otra cifra («08.01») es un código, no una medida; un parámetro con
  **solo enteros** (conteos, números de tramo) no se propone. El resto queda en «ver todos (n)».
- Medido en Canal local: CURADO 05.03.03.07 (m², 239 vigas sin área nativa) propone 2 (VAL_Encofrado
  Σ 4.139 m² y 02_04_DSI_Area1 Σ 3.779 m²) y deja 5 en «ver todos». Con Area1: **3.783,4 m² ·man.**
  (10 nativas + 234 a mano), 5 sin medida.
- Las fórmulas (Área × Espesor para m³) siguen fuera (§7).
