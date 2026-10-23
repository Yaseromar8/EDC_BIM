# Un solo 5D, gobernado por filtros · investigación y propuesta

21-oct-2026. Solo análisis: no se ha tocado código.

## 0 · El pedido

El propietario valoriza la obra cada mes y va por la **valorización 12**. Cada mes la supervisión pide
**sustento**. Lo que quiere es esto: ir a la valorización 12, hacer clic en una partida, ver sus elementos
aislados o en color en 3D, y ver el detalle si lo necesita.

Dos condiciones:
- **Ningún botón nuevo.** Un solo 5D que se adapte, con varias funciones dentro.
- **El visor no impone cómo se parametriza.** Por kilómetro, por tramo o por estructura lo decide el
  modelador en Revit o en el software que use. Lo nuestro tiene que funcionar **con filtros**.

## 1 · Cómo lo resuelve el mercado

- **Presto + Cost-It** (RIB, España y Latinoamérica): el modelo de Revit se enlaza con el presupuesto, y las
  **certificaciones** (nuestras valorizaciones) se hacen sobre las mismas mediciones. Es el flujo que enseñan
  los cursos de «Presto 5D».
- **RIB iTWO 5D**: un caso de obra pública alemana certifica por modelo (muro de contención en IFC4). De la
  hoja de medición aprobada y la certificación parcial sale la valorización, calculada con las cantidades
  certificadas y los precios del contrato.
- Lo común: **una sola estructura** (presupuesto × modelo) y **cortes** sobre ella: contractual, certificado
  del mes, acumulado. No son pantallas distintas.

## 2 · Lo que ya tenemos (y está disperso)

| Pieza | Qué hace | Estado |
|---|---|---|
| **5D** (`BudgetTree` + `budgetEngine`) | árbol de partidas, metrado del modelo frente al contractual, clic → resalta en 3D, Excel | publicado |
| **Filters** | filtra el 3D por cualquier parámetro del modelo | publicado, CLOSED |
| **Inventory** | tabla de elementos y edición en bloque (incluso campos propios) | publicado, CLOSED |
| **Avance por agrupación** | matriz partida × grupo con PREDICT en vivo | en local, sin publicar |
| **LOB 4D** | cronograma por progresiva | publicado, **protegido** |
| **Comparar versiones** | metrados entre dos versiones del modelo (`/api/compare/metrados`) | publicado |

Cómo une hoy el 5D partida y modelo: cada elemento lleva en Revit hasta 4 códigos de partida
(`03_05_DSI_CodigoDePartida1..4`). El metrado sale del parámetro de ese mismo número (`DSI_Volumen2` para la
partida 2) o del nativo (Volumen, Área, Longitud, Peso). Las und se cuentan, y glb vale 1.

### Lo que impide valorizar hoy

1. **El 5D no escucha a Filters.** Siempre calcula con el modelo entero (comprobado en el código: solo
   escucha `viewer-schema-extracted`).
2. **El presupuesto está dentro del visor.** En producción, `presupuesto_maestro` está vacío para
   `1_CANAL` y `1_DRENAJE`, y el visor carga `public/presupuesto_maestro.json`: 1.298 partidas, S/ 28,8 M,
   **el mismo para cualquier frente u obra**. Si cambia (adicionales, deductivos), hay que volver a publicar
   el visor.
3. **La importación lee un Excel fijo del servidor** (`Presupuesto_Rv01.xlsx`), no uno que suba el usuario.
4. **Los nombres de parámetro están fijos en el código** (`03_05_DSI_…`, `02_05_DSI_Volumen…`). Otra
   consultora con otros nombres no funcionaría.

## 3 · Propuesta: un 5D, tres ideas

### Idea 1 · El 5D trabaja sobre lo que deja pasar el filtro

Es lo único imprescindible. El 5D calcula con los elementos **que Filters deja pasar**, no con el modelo
entero:

- Valorización 12 → en Filters, `Valorización = 12` → el árbol muestra el metrado y el parcial **de la 12**.
- Acumulado hasta la 12 → marcar de la 1 a la 12.
- Un tramo, un frente, un km, un nivel → añadir ese filtro. Sin programar nada nuevo.

Clic en una partida → se aíslan o colorean **sus elementos dentro del filtro**, y abajo aparece su detalle
(elemento, valor que aporta y parámetro del que sale). Esto último ya existe.

### Idea 2 · Modos dentro del mismo panel (no botones en el riel)

Una fila de pestañas arriba del árbol, sobre los mismos datos:

| Modo | Qué compara | Para qué |
|---|---|---|
| **Presupuesto** | contractual frente a modelo | lo de hoy |
| **Valorización** | lo filtrado (del mes o acumulado) frente al contractual, con su % | el sustento mensual |
| **Avance** | lo ejecutado según el parámetro de estado frente a lo previsto | seguimiento; se apoya en Avance y PREDICT |
| **Versiones** | metrado de la partida en la versión anterior frente a la actual | adicionales y deductivos con evidencia |

Mismo árbol, mismo clic, misma exportación. Lo que cambia es la columna de comparación.

### Idea 3 · Nada fijo en el código: configuración por obra

Un ajuste por obra (lo hace el administrador una vez) que dice:
- qué parámetros llevan el **código de partida**;
- de qué parámetro sale la **cantidad** para cada unidad (m, m², m³, kg, und);
- qué parámetro es la **valorización** (o el que use el modelador: fecha de vaciado, mes, km).

Por defecto, los nombres DSI de hoy, para que PQT8 siga igual sin tocar nada. Y el **presupuesto se sube
desde Excel por frente**, a la tabla `presupuesto_maestro` que ya existe (ruta `/import-json` existente), sin
publicar el visor.

### El sustento que se entrega

Botón **Exportar sustento** del modo Valorización: un Excel (y, más adelante, un PDF) con cada partida
valorizada, su metrado del modelo, la lista de elementos con su valor, y una captura del 3D con esos
elementos en color. Es lo que pide la supervisión cada mes, generado en un clic.

## 4 · Lo que el modelador tiene que hacer

- Poner en cada elemento su código de partida (ya lo hacen) y **su valorización**: un parámetro, el nombre
  que quieran.
- Si un elemento se valoriza en partes (60 % en la 11 y 40 % en la 12), **dividirlo en dos piezas**. Es lo
  limpio. La alternativa (un porcentaje por valorización) complica todo y no se recomienda.
- Si no lo parametrizan en Revit, la oficina técnica puede asignar la valorización desde la web con la edición
  en bloque de Inventory. Falta comprobar que Filters vea esos campos propios.

## 5 · Orden y alcance

1. **Idea 1** (el 5D escucha a Filters), en local. Basta para valorizar con el modelo de hoy si existe el
   parámetro de valorización.
2. **Presupuesto por frente desde Excel** (fin del JSON fijo).
3. **Modo Valorización y Exportar sustento.**
4. **Configuración por obra** de los nombres de parámetro.
5. Modos Avance y Versiones.

Ficheros: `BudgetTree.jsx` y `budgetEngine.js`. `BudgetTree.jsx` tiene **cambios del propietario sin
publicar** (unas 60 líneas): se trabaja sobre ellos sin pisarlos. Filters (CLOSED) no se modifica: solo se
**lee** su resultado. No se tocan LOB4D, `predictBim.js` ni `ViewerLabelsBar.jsx` (protegidos). Nada se
publica sin la orden del propietario.

## 6 · Decisiones del propietario

1. ¿Cómo se llama el parámetro de valorización en sus modelos, o ya existe alguno (por ejemplo
   `vaciado_nro`)?
2. ¿Una valorización de ejemplo (la 12) para contrastar el resultado?
3. ¿Empezamos por la Idea 1, en local?

## Fuentes

- Editeca, *Mediciones BIM con Cost-It y Presto* (temario):
  https://editeca.com/wp-content/uploads/2023/06/Mediciones-BIM-cost-it-y-presto.pdf
- COAC, curso Revit + Presto con módulo de certificaciones: https://arquitectes.cat/es/printpdf/29353
- BIM Community, caso de certificación por modelo con RIB iTWO: https://www.bimcommunity.com/?p=55418
- TU Wien, facturación basada en modelo con iTWO 5D: https://repositum.tuwien.at/handle/20.500.12708/1366
