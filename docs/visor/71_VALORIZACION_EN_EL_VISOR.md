# 71 · La valorización del mes en el visor (25-nov-2026)

Pedido del dueño: el de costos quiere ver y capturar lo que corresponde a la Val. 13. «Lo del visor lo decía para lo
que corresponde a Revit.» «La idea es que se muestre eso en nuestro visor. Por eso te hice analizar.»

**Sólo propuesta. No se ha construido nada.**

---

## 1 · Lo que se aprendió de las láminas (docs/valorizaciones/VAL13_DRENAJE_LAMINAS_VS_EXCEL_25-nov-2026.md)

Las 34 láminas de la Val. 13 de Drenaje son, cada una, tres cosas juntas:

1. **La planta** con los elementos de la partida pintados (azul) y el resto en gris de referencia.
2. **El cuadro de valorización** de esa calle: partida, contractual, metrado final (as-built), acumulado Val. 12,
   Val. 13, acumulado y %.
3. **La tabla de metrados de Revit** que lo sustenta: código de partida, descripción, **sub ubicación** (CT-SP-1,
   CS-SF-1…), unidad y metrado de cada elemento.

Cruzadas con lo verde del Excel: 248 partidas se cobran este mes; 125 tienen lámina y su cantidad cuadra; 123 no
(zanja, obra provisional, arena: no está en Revit). Y salieron tres tipos de error que hoy sólo se ven leyendo a mano:

- **el mismo elemento con códigos distintos** (San Felipe 0583: 06.06.01.05.06 en el modelo, 06.06.02.05.06 en la
  tabla, 06.06.02.04.06 en el cuadro);
- **una partida que se cobra y no tiene lámina** (buzón 06.06.02.03.01 de San Felipe);
- **la lámina cobra y el Excel no** (cuatro buzones de la red primaria, por el margen de 0,05).

## 2 · Lo que el visor YA tiene (publicado)

| Pieza | Qué hace | Para la valorización |
|---|---|---|
| **Itemizado por frente** (Planilla, migraciones 40–42) | El presupuesto de Drenaje subido por la obra: partida, descripción, unidad, contractual | Es la columna CONTRACTUAL |
| **Partida de cada elemento** | Lee los parámetros de código de partida de Revit (también `CodigoDePartida1/2/3`, con o sin ceros) | Es lo que agrupa las tablas de metrados |
| **Cantidad nativa** («Medir con…») | Longitud, área o volumen de la geometría de Revit, no el parámetro manual | Es el METRADO FINAL (AS-BUILT) |
| **Colorear en Filters** | Pinta en 3D los elementos por partida, capítulo o estado | Es la planta pintada |
| **Vistas guardadas** | Cámara, aislamiento y colores, para volver | Una vista por calle |
| **Captura** | Imagen al doble de resolución con su leyenda (`Viewer.jsx` `handleTakeScreenshot`) | Es la lámina |

Lo que **no** tiene: el ACUMULADO ANTERIOR y la VAL. 13. Eso es de costos, no del modelo.

## 3 · Propuesta: «Valorización» en la Planilla

### V1 · Cargar la valorización del mes y verla en 3D (sin migración)

- En la Planilla, «Cargar valorización»: el mismo Excel que prepara costos (la hoja del frente). Se leen, por partida,
  **lo ya cobrado** y **lo que se valoriza este mes**. El visor no inventa la regla del cobro: la pone el Excel
  ([[criterio-lo-sube-el-usuario]]). Si el Excel llega sin los resultados de sus fórmulas (pasa con el de la Val. 13),
  se avisa y se pide guardarlo desde Excel.
- **Modo Val. 13** en el 3D: en verde los elementos de las partidas que se cobran este mes, en gris el resto. Por
  calle (la sub ubicación o la carpeta del frente).
- **El cuadro de la calle** al lado del 3D, con las mismas columnas que la lámina: contractual (itemizado), as-built
  (**del modelo**, nativo), acumulado anterior y Val. 13 (del Excel), acumulado y %. Clic en una fila → aísla sus
  elementos y enseña su tabla de metrados por sub ubicación, como la lámina.
- **Captura** de la vista con su cuadro y su leyenda, y una vista guardada por calle para el mes siguiente.

### V2 · Los avisos que hoy se encuentran a mano

Los tres errores del §1, solos, en la misma pantalla:

- **«As-built del modelo ≠ as-built del Excel»** por partida (la lámina y el Excel deben salir del modelo);
- **«Se cobra y no hay ningún elemento con esa partida»** (el buzón de San Felipe);
- **«Elementos con una partida que no está en el cuadro»** (el encofrado con tres códigos).

### V3 · Guardar cada valorización (con migración)

Que la Val. 13 quede guardada en la plataforma con su fecha: la Val. 14 toma de ahí lo ya cobrado sin volver a
cargarlo, y se puede ver cualquier mes anterior («¿qué se cobró en la Val. 9 en San Agustín?»).

## 4 · Lo que no se puede (y por qué)

- **Qué elemento exacto es «de este mes».** La valorización es por cantidad: de 12,77 m de tubería se cobran 0,17 m
  este mes. El visor pinta la partida, no los 17 cm. Para pintar el elemento exacto, Revit tendría que llevar en cada
  elemento en qué valorización se cobró (un parámetro). Pregunta abierta al dueño.
- **Lo que no está modelado** (las 123 partidas de zanja, provisionales y suministros) no sale en 3D en V1. La zanja
  podría venir después del tubo y sus capas de relleno o de Civil 3D.

## 5 · Antes de construir

1. Comprobar con el modelo REAL de Drenaje en el visor que cada elemento trae su código de partida y su sub ubicación
   (las tablas de las láminas dicen que sí, en Revit).
2. Probarlo en el banco local con el Excel de la Val. 13 y las láminas de San Pablo y San Felipe como referencia: el
   visor tiene que dar los mismos números y encontrar los mismos tres errores.

## 6 · Decisiones del dueño

1. ¿Empezamos por V1 + V2 (cargar el Excel cada mes), dejando V3 (guardar en la plataforma) para después?
2. ¿La «calle» del cuadro sale de la sub ubicación de Revit (CT-SP-1 → San Pablo) o de la carpeta del frente?
3. ¿Revit lleva o puede llevar un parámetro «valorización n.º» por elemento?

---

## 7 · Hecho en local (25-nov-2026): seleccionar los elementos de la Val. 13

El dueño: «más que el saldo, me interesa que se seleccione el elemento o elementos de la tabla que corresponden a la
Val. 13»; «probemos, y que reconozca esas filas verdes» del mismo Excel. **Sin commit, sin push. Sólo visor, sin
backend ni migración.**

| Fichero | Qué es |
|---|---|
| `frontend-react/src/lib/valorizacionDelMes.js` (nuevo) | Lee el Excel con SheetJS: la cabecera («PARTIDA», «YA COBRADO», «SE VALORIZA EN LA VAL. n», «t»), las filas P y su VALOR calculado por Excel; verde = «se valoriza» > 0 (la regla del formato condicional del propio libro). Casa los códigos con los del modelo (quita los niveles de delante que sobren: «1.06…» → «06…», lo deciden los datos). Tono por elemento. Calle = `01_11_DSI_Ubicacion` |
| `frontend-react/src/components/ValorizacionDelMes.jsx` (nuevo) | El panel: cargar el Excel, hoja, resumen, por calle y por partida; clic = aislar y pintar en el 3D; «ver todo en el 3D»; «sin elementos en el modelo» |
| `frontend-react/src/components/TablaDePartidas.jsx` | El enlace «valorización del mes» en la barra de cobertura de la Planilla › Partidas y el panel debajo |
| `frontend-react/pruebas/valorizacionDelMes.prueba.mjs` (nuevo) | 18 casos sin Excel; con el Excel real como argumento, 24 |

**Dos tonos:** verde `#2e9d44` = la partida entra entera este mes (ya cobrado = 0); verde amarillento `#e3f28c` =
sólo completa un saldo. Un verde pálido salía en pantalla igual que el fuerte (el visor oscurece los claros con su
luz): por eso el amarillento.

**El Excel tal como llegó** (generado por un programa, sin los resultados de sus fórmulas): el visor no pinta nada y
dice «Este Excel se guardó sin los resultados de sus fórmulas… Ábrelo en Excel, guárdalo y vuelve a cargarlo».
Guardado desde Excel: lo lee entero.

### Comprobado

- Banco: `node frontend-react/pruebas/valorizacionDelMes.prueba.mjs <Excel guardado> <Excel sin calcular>` → **24/24**
  (Drenaje 739 partidas, 252 verdes, los cuatro buzones de margen 0,005 incluidos; Canal 25; el sin calcular avisado).
  `planillaPartidas.prueba.mjs` 44/44. `vite build` del visor: bien. eslint limpio en los tres ficheros.
- **En el visor local** (`npm run dev` :5173 + backend :3000, base PostgreSQL LOCAL en 5433, sin conexión a la nube),
  Frente Drenaje Urbano, Planilla › Partidas › «valorización del mes», con el Excel guardado:
  - elige sola la hoja «06 DRENAJE URBANO», Val. 13; **252 en verde**; detecta el «1.» de más;
  - agrupa por calle con `Datos::01_11_DSI_Ubicacion` (Av. San Francisco, Calle San Agustín…);
  - clic en «CALLE SAN AGUSTIN» → aísla sus 207 elementos y los pinta: el visor registra 5 en el verde fuerte y 202 en
    el amarillento (`db2ThemingColor`), y de cerca se ven distintos (tubería entera / captación con saldo);
  - el Excel sin calcular → el aviso, nada pintado. Sin errores nuevos en la consola.
- **No comprobado:** con el modelo VIGENTE. El inventario de la base local es antiguo: 3.102 elementos y 291 códigos;
  de las 129 partidas de las láminas casa con **65** (le faltan, p. ej., las tuberías de San Felipe y varias
  reposiciones). En local salieron 67 partidas con elementos; con el modelo de producción tendrían que salir las 129 de
  las láminas (más las verdes modeladas que no tienen lámina).

### 7.1 · Cualquier Excel, tal como venga (25-nov-2026)

El dueño: «¿no se supone que pueda cargar el Excel que quiero?». El Excel de la Val. 13 se generó con un programa y
llega sin los resultados de sus fórmulas. Antes se pedía abrirlo y guardarlo en Excel; ahora **el visor calcula las
fórmulas del propio libro, cada celda con la suya** (`frontend-react/src/lib/formulasDeExcel.js`: IF, ROUND, N, AND,
OR, NOT, ABS, MIN, MAX, IFERROR, SUM, SUMIF, SUMIFS, aritmética y comparaciones; rangos de la misma hoja). Lo que no
sabe calcular (p. ej. referencias a otra hoja, como RESUMEN) queda **sin valor**, nunca con uno inventado, y lo que
dependa de ello tampoco se calcula.

**Comprobado celda a celda contra Microsoft Excel:** las **2.769** celdas con fórmula de «05 CANAL» y «06 DRENAJE
URBANO» del Excel original, calculadas por el visor, dan lo mismo que el mismo libro guardado desde Excel (banco
29/29). En el visor local, con el Excel ORIGINAL: «el visor calculó 2.327 fórmulas», 252 en verde, y las mismas
calles y elementos que con el guardado.

### 7.2 · La hoja tal como el Excel (25-nov-2026)

«No me pongas ver en el 3D. Necesito que el formato del Excel se pase ahí y yo seleccione la fila, como si tuviera
mi Excel, y me lleve a ese grupo de elementos.» El panel enseña la hoja TAL CUAL (columnas, títulos, partidas, números
con el formato de su celda, filas en verde) más una columna «Elementos». Clic en una partida → sus elementos; en un
título → los de sus partidas en verde; otro clic → todo el modelo. Ocupa el cuerpo de la Planilla mientras está
abierto. Los dos tonos se quedan («la 1 está bien, déjalo como está»).

### 7.3 · Contexto y rótulos de la Agrupación (25-nov-2026)

- **Contexto:** «se necesita tener referencia de los otros elementos… más disimulados». Mientras se elige en la
  valorización, el fantasma del visor (`impl.fadeMaterial`, opacidad 0,1 casi negro) pasa a **gris medio, opacidad
  0,3**; vuelve a como estaba al cerrar el panel o volver a todo el modelo.
- **Rótulos:** «cuando esté activo Agrupación y seleccione esa fila, ¿sólo se podrían ver las agrupaciones que le
  corresponden?». **Con permiso explícito del dueño** («el resto sí hazlo»), `LOB4DExtension.js` (protegido) recibe un
  evento `lob-zone-labels-filter` `{ porModelo: [{ model, dbIds }] | null }`: se dibujan sólo los rótulos cuyos grupos
  contienen algún elemento elegido; con null, todos. Tres trozos pequeños (oyente, `filtrarRotulos` /
  `_calcularFiltroDeRotulos`, y el filtro en `updateZoneLabels`); el fichero del disco lleva además trabajo del dueño
  sin publicar (PREDICT), que no se toca. eslint: los mismos 16 avisos que la versión publicada.
- **No comprobado en pantalla** por mí (el navegador de la app estaba oculto y no carga los modelos); lo prueba el
  dueño en su Chrome.

## 8 · Guardada para toda la obra, y la cabecera de la Planilla ordenada (25-nov-2026)

El dueño: «eso solo yo lo podría subir con admin, ese Excel. Y debe permanecer para todos. ¿Podemos ordenar esa parte
superior de la Planilla? La veo llena de cosas; quizá las de análisis puedan ir ocultas».

### La valorización guardada (migración 52)

- `backend/sql/52_planilla_valorizaciones.sql` (+ rollback): tabla `planilla_valorizaciones` (obra, frente, versión,
  archivo, tamaño ≤ 8 MB, huella sha256, **el Excel tal cual** en BYTEA, vigente, quién y cuándo). Una vigente por obra
  y frente. **ecd_app sólo lee, añade y retira la vigente**: los permisos por defecto del esquema daban SELECT/INSERT/
  UPDATE/DELETE completos a toda tabla nueva (medido), así que la migración hace `REVOKE ALL` y concede lo justo, y
  comprueba al final que no se puede borrar ni reescribir. La 52 y no la 51 porque la 51 es la de las rondas (en local).
- `backend/routes/planilla.py`: `GET/POST/DELETE /api/planilla/valorizacion?project=<obra>_<FRENTE>`, con las mismas
  guardas que el itemizado (`guardia_de_obra`, obra resuelta en el servidor, frente de esa obra); subir y quitar, sólo
  ADMINISTRADOR DE LA OBRA; candado por obra y frente; el mismo Excel no crea otra versión; quitar no borra (historial).
  Sin la tabla: 503 MIGRATION_MISSING. **No entra en `esquema_base` ni en el manifiesto de arranque**: si entrara, un
  backend desplegado antes que la 52 no arrancaría.
- El panel: al abrirlo, carga la vigente del frente (la misma para todos). Administrador: «Subir el Excel» / «subir
  otra versión» / «quitar»; miembro: sólo la ve. Sin la 52: funciona como antes, sólo en ese navegador, y lo dice.

### La cabecera

Una barra: «Valorización del mes», «Análisis ▸», «solo con dato» (y «desplegar todo» / «usar toda la tabla» cuando
aplican) y el itemizado con sus acciones. Tras «Análisis» (se recuerda en el navegador): los conteos, sin medida,
criterios de medida, repetidas, intercambiados, cómo se leyó, cobertura, qué falta y colorear en Filters.

### Comprobado

- `backend/herramientas/ensayo_de_valorizacion.py`, PostgreSQL desechable con la 52, aplicación real, sesiones reales,
  con el Excel REAL de la Val. 13: **22/22** (sólo la administradora sube y quita; el miembro recibe el Excel byte a byte;
  el de otra obra no lo ve; mismo Excel → sin versión nueva; la anterior queda en el historial; lo que no es Excel se
  rechaza; ecd_app no puede borrar ni reescribir).
- `backend/tests/test_planilla_valorizacion.py` (nuevo) + cobertura de autorización + perfil portal + itemizado: 57/57.
- La 52 aplicada dos veces seguidas sin error. También aplicada en la base local del desarrollo (`ecd_dr12d`, 5433).
- Visor: eslint limpio en lo tocado, `vite build` bien.

- 25-nov-2026: las filas sin elementos en el modelo (lo que no está en Revit) se ven **atenuadas y sin clic**, «no está en el modelo» al pasar el ratón. Más adelante llevarán a su sustento de metrado (pedido del dueño).
