# Metrados por valorización desde el modelo · diseño

21-oct-2026. Solo diseño: no se ha tocado código. Alcance pedido por el propietario: **solo cantidades**.
Costos recibe los metrados y hace la valorización; los costos no son nuestros.

## 1 · Lo que Costos recibe hoy (medido)

`Sustento de Valorizacion N°11_Rev03.xlsx`, hoja **RESUMEN** (leída solo la estructura, por guion):

| ÍTEM | CUENTA COSTOS | DESCRIPCIÓN | UND. | METRADO (contractual) | VAL. N°01 … VAL. N°11 | ACUMULADO | % ACUMULADO | PENDIENTES · RESPONSABLES · FECHA |
|---|---|---|---|---|---|---|---|---|

- **1.310 partidas**: 739 del 06 (Drenaje), 486 del 05 (Canal), y el resto de obras provisionales, campamento y
  otros.
- En la **Val. 11** tienen cantidad 157 partidas: 104 del 06, 48 del 05 y 5 del 01.
- Los ítems usan **los mismos códigos** que el presupuesto y que el parámetro `03_05_DSI_CodigoDePartida` del
  modelo (`05.03.03.06`…).
- El libro tiene además unas 30 hojas de sustento por partida o componente (`S1.3`, `COMPONENTE 04`,
  `BUZONES`…). Son lo que el 3D puede respaldar.

## 2 · Lo que el modelo ya trae (medido en el inventario de producción)

- **Partida:** `03_05_DSI_CodigoDePartida1..4`, hasta 4 por elemento.
- **Cantidad por partida:** `02_02_DSI_Longitud{n}`, `02_04_DSI_Area{n}`, `02_05_DSI_Volumen{n}`,
  `02_06_DSI_Peso{n}` y `03_06_DSI_Metrado{n}`, o la nativa de Revit.
- **Cuándo se valorizó:** `04_20_DSI_FinReal{n}`, una fecha `AAAAMMDD` por número de partida. Casi todas
  caen en día **24** (corte). Drenaje empieza en noviembre de 2025.
- **Dónde:** `04_24_DSI_Frente` (paño) y `04_23_DSI_Sector`.
- Hay **fechas raras**: `20261225` (futura) y `20250124` (probable error de tipeo).

Es decir: el modelo ya sabe **qué**, **cuánto** y **cuándo**. Falta convertirlo en la tabla de Costos.

## 2 bis · Cómo lo hace Autodesk Takeoff (la referencia de metrado por modelo de Autodesk)

Documentación oficial y materiales de Autodesk, 21-oct-2026. **No se ha visto funcionando en una cuenta
real**: el propietario no tiene Autodesk Takeoff, así que todo sale de la documentación.

| Concepto de Takeoff | Qué es | Equivalente nuestro |
|---|---|---|
| **Package** | un juego de metrados (planos y modelos) | la valorización o el frente |
| **Takeoff type** | qué se mide y en qué unidad, con **Classification 1 y 2** | la partida (`CodigoDePartida`) y su unidad |
| **Inventory** | lista acumulada de todo lo metrado; agrupar por clasificación, documento, tipo o **ubicación** | árbol de partidas; agrupar por paño o sector |
| **Panel de detalle** | clic en una línea: cantidades, encuadre en el modelo, reasignar, editar en bloque | sustento en el visor |
| **Export** | XLSX con dos hojas: **resumen** según la agrupación y **detalle** de cada objeto | hoja RESUMEN para Costos y detalle por elemento |
| **Snapshots** | registro **congelado** de los metrados en un hito, para reabrirlo y compararlo con el trabajo en curso antes de exportar la planilla final | el **corte congelado** de la Val. N |
| **Compare** | snapshot frente al metrado activo, superpuesto en el visor y en el inventario | Val. N frente a la versión nueva del modelo |

Conclusión: Autodesk resuelve el problema con la misma estructura que se propone aquí. Las clasificaciones
son la partida, la exportación lleva resumen más detalle, y los snapshots son el corte que no cambia. Lo que
Takeoff **no** trae es lo nuestro: la fecha de valorización ya parametrizada en Revit
(`FinReal`), el formato RESUMEN que pide la supervisión peruana y el corte mensual del contrato.

## 3 · El diseño

### 3.1 · Las reglas de metrado son un ajuste por obra, no código

| Regla | PQT8 (por defecto) |
|---|---|
| Código de partida | `03_05_DSI_CodigoDePartida{n}` |
| Cantidad por unidad | m → `02_02_DSI_Longitud{n}`; m² → `02_04_DSI_Area{n}`; m³ → `02_05_DSI_Volumen{n}`; kg → `02_06_DSI_Peso{n}`; und → recuento o `03_06_DSI_Metrado{n}` |
| Fecha de valorización | `04_20_DSI_FinReal{n}` |
| Calendario de cortes | Val. 1 = corte de nov-2025; corte el día 24 (**por confirmar**) |

Otra obra solo cambia este ajuste.

### 3.2 · El cálculo va en el servidor y el corte se congela

- Una función pura en Python toma el inventario de **una versión** del modelo y las reglas, y devuelve:
  partida × valorización → cantidad, número de elementos y la lista de elementos. Con banco de pruebas.
- **«Generar corte de la Val. N»** guarda el resultado con la versión del modelo y la fecha. Una
  actualización del modelo **no cambia un corte ya generado**: lo que se entregó a Costos queda como se
  entregó.
- Necesita **una tabla nueva** (migración aditiva, con su rollback). Es la única pieza de base de datos.

### 3.3 · Lo que sale

- **Excel para Costos con el mismo formato que la hoja RESUMEN**: ÍTEM, DESCRIPCIÓN, UND., METRADO
  contractual, VAL. N°01…N°N, ACUMULADO y %. Las partidas que el modelo no mide (glb, mes, planes) salen
  marcadas **«no modelada»**, para que Costos sepa que siguen siendo manuales.
- **Avisos**, no sumas silenciosas: elementos con partida pero sin cantidad, fechas fuera del calendario y
  códigos que no están en el presupuesto.
- **Sustento en el visor:** clic en una partida de la Val. N → sus elementos en color en 3D, con su lista
  (elemento, cantidad, paño y fecha). Es la última pieza y la única de interfaz.

### 3.4 · La prueba de aceptación

1. Cuadrar la **Val. 11 generada desde el modelo** contra la columna VAL. N°11 de este Excel, partida por
   partida, en las 152 partidas del 05 y del 06 con cantidad.
2. Cuadrar contra las **tablas de Revit** que ya existen.
3. Cada diferencia se explica (no modelado, fecha mal puesta, criterio distinto). Nunca se ajusta el cálculo
   para que cuadre a la fuerza.

## 4 · Orden

1. Confirmar el calendario de cortes (§3.1).
2. Motor en el servidor y banco de pruebas, en local.
3. Contraste con la Val. 11 (§3.4): es la puerta. Si no cuadra, se informa en qué y por qué.
4. Excel para Costos.
5. Tabla de cortes y su migración.
6. Sustento en el visor (dentro del 5D, sin botones nuevos).

Nada se publica sin la orden del propietario.

## 4 bis · Fuentes

- Autodesk Takeoff, *Takeoff Inventory* (ayuda oficial):
  https://help.autodesk.com/cloudhelp/ENU/Takeoff-Takeoff/files/Inventory.html
- Autodesk Construction Blog, *Snapshots and robust comparison capabilities*:
  https://www.autodesk.com/blogs/construction/have-you-tried-it-snapshots-and-robust-comparison-capabilities/
- Autodesk Learn, *Takeoff part 2 · 3D takeoff*:
  https://www.autodesk.com/learn/ondemand/module/project-or-get-started-in-the-classroom-with-docs-and-takeoff/unit/1dtqnIDKHamZOsNU9fN2Qt
- APS, comparar metrados entre versiones con la Model Properties API (2022): https://aps.autodesk.com/node/2254

## 5 · Decisiones del propietario

1. ¿Corte el día 24, Val. 1 = noviembre de 2025? ¿Canal y Drenaje con la misma numeración?
2. ¿Empezamos por el motor y el contraste con la Val. 11, en local?
