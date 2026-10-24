# 24 · Planilla dinámica por plantillas — investigación (24-oct-2026)

> SOLO ANÁLISIS. Nada implementado ni guardado. Pedido del propietario: «no solo para
> esta actividad, debería ser dinámico en plantilla; y no sé si almacenar en Postgres:
> primero investiga».

## 1 · La pregunta, bien planteada

Hoy la vista «Partidas» funciona porque el código conoce el estándar DSI de esta obra
(`planillaPartidas.js`: nombres `NN_NN_DSI_…`, 6 líneas, códigos `06.02…`, tabla kg/m,
unidad → medida). Otro proyecto con otra parametrización no la puede usar, y lo mismo
pasaría con la próxima vista (avance por fechas, costos, responsables…) si se programa
igual. La pregunta no es «cómo hago Partidas genérica», sino:

**¿cómo describe una plataforma, como DATO y no como código, qué significa cada
parámetro del modelo y qué consultas se hacen con él? ¿Y dónde vive esa descripción?**

## 2 · Cómo lo resuelven las herramientas serias

Lo investigado se separa siempre en **tres capas**, aunque cada producto les ponga otro
nombre:

| Capa | Qué responde | Ejemplos |
|---|---|---|
| **A · Diccionario** | qué significa cada parámetro del modelo (código, descripción, unidad, cantidad, fecha…) y cómo se traduce | Tandem: *facility template* = sistema de clasificación + parámetros, y **mapeo** de los parámetros de Revit a los suyos. Trimble Connect: bibliotecas de *property set definitions* con esquema (nombres y tipos). Navisworks Quantification: *property map* que asigna propiedades del modelo a cada propiedad de cuantificación. bSDD: diccionarios de clases y propiedades con API. |
| **B · Reglas** | qué debe tener cada elemento y cómo se calcula | IDS (buildingSMART, estándar oficial desde el 1-jun-2024): XML con *aplicabilidad* (a qué elementos) + *requisitos* (qué propiedad, qué valores). Solibri: *rulesets* y clasificaciones por reglas. |
| **C · Consultas** | qué columnas, agrupación, filtros y sumas se miran | Solibri ITO (*Information TakeOff*), vinculado a una clasificación. BIMcollab Smart Views. Tandem *saved views*. Navisworks *Quantification Workbook*. Tablas de planificación de Revit. |

Lo que tienen en común, y que nosotros no tenemos todavía:

1. **La regla es un dato, no código.** Ninguno programa «Partidas»: el usuario mapea su
   parámetro de código y su unidad, y la herramienta agrupa y suma.
2. **Se define una vez y se aplica muchas veces.** Tandem crea plantillas por tipo de
   instalación y las aplica a cada una; Solibri dice que la clasificación y el ITO «se
   crean una vez y se reutilizan»; Navisworks exporta el catálogo para futuros proyectos.
3. **Aplicar = copiar, con versión.** Tandem: «all components are versioned» y la
   instalación puede incorporar la versión nueva de la plantilla cuando quiera. ACC
   Takeoff: la clasificación se importa desde Excel por JSON y **no se puede cambiar una
   vez usada**. Trimble: cada edición de un esquema crea una versión nueva.
4. **Hay un estándar de fábrica y uno propio.** Tandem trae plantillas de estándares
   del sector («library templates») y permite partir de ellas o crear la tuya.

## 3 · Dónde guardan las plantillas

| Tipo de producto | Dónde | Lo bueno | Lo malo |
|---|---|---|---|
| Escritorio (Navisworks, Solibri, Revit) | **ficheros**: XML del *property map*, `.classification`, ITO, `.txt` de *keynotes* y *assembly codes* | portables, se mandan por correo | sin autor ni historial; Revit ni siquiera ve el cambio hasta cerrar y reabrir el proyecto; versión «la que tenga cada uno» |
| Nube (Tandem, Trimble Connect, BIMcollab, ACC Takeoff) | **en la base de la plataforma**, detrás de una API | compartida por todo el equipo, con permisos y versiones | depende de la plataforma |
| Intercambio entre plataformas | **ficheros estándar**: IDS (XML), bSDD (JSON por API), Excel | abiertos, sirven entre herramientas | solo para intercambio, no para trabajar día a día |

ALEPHIA es una plataforma en la nube como las de la segunda fila. El patrón que siguen
todas es: **guardar en la base de la plataforma y exportar o importar como fichero**.

### Opciones para ALEPHIA

| Opción | Veredicto |
|---|---|
| Navegador (`localStorage`) | **No.** Solo la ve quien la creó, en ese equipo, y se pierde. Sirve como banco, nunca como solución. |
| Fichero dentro de un proyecto de Docs (JSON versionado como documento) | Tentador por ISO 19650, pero **no**: una plantilla es configuración, no un entregable; no se puede consultar ni validar al guardar, y dos personas editándola chocan. |
| Fichero en el repositorio (código) | **No** para lo de cada obra: es justo lo que hay hoy con DSI. Sí para **las plantillas de fábrica** (DSI como preajuste que viene con el producto). |
| **Postgres, JSONB, con versiones** | **Sí.** Es lo que hacen Tandem, Trimble y ACC Takeoff; tenemos el mismo patrón **ya en producción** para revisiones (`doc_review_plantillas`, migración 19) y para la configuración de obra (`plantillas_de_obra`, migración 12): un molde JSONB, plantillas de entidad y de obra, autoridad ya definida, y «aplicar = copiar, lo ya aplicado no se entera del cambio». Además, el inventario ya vive en Postgres (`inventory_identity_b1`), así que la plantilla puede ejecutarse un día en el servidor si las obras crecen (como hace el Model Properties API de ACC con su índice). |
| + exportar/importar como fichero JSON | **Sí, como complemento**: para llevar una plantilla a otra entidad, para respaldo y para revisarla fuera. IDS solo para la capa B y más adelante. |

Validación: la extensión `pg_jsonschema` permitiría validar el JSON en la propia base,
pero **no he comprobado que Cloud SQL la admita**; la validación iría en el backend
(Python), igual que hoy los moldes de revisión.

## 4 · Lo que propongo: «Plantilla de Planilla»

Un documento JSON con las tres capas. Partidas deja de ser código y pasa a ser **una
consulta más** de la plantilla; Avance, Costos o Responsables serían otras, sin
programar cada una.

```
Plantilla de Planilla  (de fábrica · de entidad · de obra)
├── A · Diccionario   «rol» → parámetro del modelo
│     código de partida, descripción, unidad          (líneas: sin número, 1…n)
│     inicio/fin programado y real, costo, responsable, zona…
│     medidas nativas: longitud, área, volumen, barra, diámetro
├── B · Reglas de cálculo (deterministas, sin IA)
│     unidad → medida nativa   (m → longitud, m² → área, kg → barra × kg/m…)
│     tablas: kg/m por diámetro
│     qué es «código» (patrón) y cómo se forma el capítulo
├── C · Consultas
│     «Partidas»: agrupar por código+unidad, sumar la cantidad del rol, ordenar por capítulo
│     «Avance»:   agrupar por zona, contar por fecha real…
│     cada una: columnas, niveles de agrupación, filtros, sumas
└── Metadatos: versión, autor, fecha, «aplicada desde» (procedencia)
```

- **DSI = la primera plantilla de fábrica.** Con ella, lo de hoy debe dar exactamente
  lo mismo (las 42 pruebas pasan a ser las pruebas de la plantilla DSI).
- **Un proyecto nuevo** aplica DSI, o parte de ella, o mapea sus parámetros una vez con
  el selector de campos que ya existe. Si el modelo no tiene un rol, la consulta lo dice
  («Sin partida · n elementos») en vez de esconderlos.
- **Aplicar = copiar con versión**, como Tandem y como nuestras plantillas de revisión:
  cambiar la plantilla de entidad no altera una obra hasta que su administrador decide
  incorporar la versión nueva.
- **Autoridad, la que ya existe:** plantilla de obra → quien administra la obra;
  plantilla de entidad → facultad `gestionar_perfiles`. Sin facultad nueva.
- **Lo CERRADO no se toca:** Saved Views e `inventoryConfig` siguen como están. Una vista
  guardada podría un día recordar qué consulta usaba, pero eso es una decisión aparte.

## 4-bis · Integral: un motor, cualquier consulta, cualquier proyecto

La plantilla **no guarda datos**: el inventario completo ya está en Postgres
(`inventory_identity_b1`). Guarda las reglas de lectura (unos KB) y se calcula al
momento sobre el inventario. Lo integral no es «Partidas para todos», sino que:

1. **Los roles son libres.** «código de partida» es un rol; también lo son «zona», «frente»,
   «fecha real de fin», «precio unitario», «responsable», «material», «sistema». Cada
   proyecto apunta cada rol a SU parámetro: DSI, Assembly Code, Keynote, Uniformat, un
   parámetro propio, una propiedad IFC o de Civil 3D. Lo que no exista en el modelo se dice.
2. **Varias líneas por elemento es un concepto general**, no algo de DSI: partidas 1…5,
   fases, capas de material o varios costos. Un elemento puede convertirse en varias filas
   de consulta.
3. **Un solo motor.** Elementos, Partidas, el buscador, los filtros, el Excel y el coloreado
   del 3D leen las mismas reglas; hoy el motor genérico ya existe (`inventoryTabla`: agrupar,
   calcular, filtrar), y Partidas es la única parte escrita a medida.

Ejemplos de consultas de la MISMA plantilla, una por cada uso:

| Uso | Consulta (como dato) | Roles que usa |
|---|---|---|
| Diseño | «¿Qué elementos no tienen partida, unidad o material?», por categoría (requisitos tipo IDS) | código, unidad, material |
| Diseño | «Metrado por partida» (lo de hoy) | código, nombre, unidad + medida nativa |
| Ejecución | «Avance por frente»: agrupar por zona/frente, sumar la cantidad con fin real ≤ hoy frente al total | zona, fin real, cantidad |
| Ejecución | «Programado frente a real» por semana | inicio/fin programado y real |
| Gestión | «Costo por capítulo»: cantidad × precio unitario, agrupado por capítulo | código, cantidad, precio |
| Gestión | «Pendientes por responsable» | responsable, estado |

Otro proyecto (una edificación con Uniformat, por ejemplo) usa las mismas consultas con
otro diccionario: no se programa nada nuevo.

## 4-ter · Idea del propietario: partir del presupuesto, no del nombre del parámetro

Problema real: en Latinoamérica **no hay un nombre estándar** para el parámetro de la
partida o el ítem; cada obra lo llama a su manera. Lo que SÍ es estándar es buscar por
**partida (código) o descripción**, y que exista un presupuesto o itemizado (S10, Presto,
Delphin, Opus, Excel propio) con código, descripción, unidad y metrado.

Por eso la plantilla no debería empezar preguntando «¿cómo se llama tu parámetro?», sino
**«sube tu lista de partidas»**:

1. **Subir la lista** (Excel/CSV del presupuesto o itemizado): código, descripción, unidad
   y, si está, el metrado contractual y el precio. Queda en la plantilla de la obra como
   catálogo, versionado.
2. **La Planilla busca sola dónde está**: recorre los parámetros del inventario (que ya
   está en Postgres) y cuenta en cuáles aparecen los códigos o las descripciones de la
   lista, con la misma comparación tolerante del buscador (sin tildes, comas ni espacios
   de más). Resultado con evidencia, por ejemplo: «`03_05_DSI_CodigoDePartida1`: 2.812
   valores coinciden con códigos de tu lista (98 %)».
3. **Tú confirmas** el mapeo propuesto. Lo confirmado queda guardado como diccionario de la
   plantilla («aprender = recordar lo confirmado»).
4. **La unidad sale de la lista**, no del modelo: el parámetro Unidad deja de ser necesario
   (y con él, muchos «sin unidad»).
5. **Lo que no coincide se dice**: partidas de la lista sin ningún elemento en el modelo y
   valores del modelo que no están en la lista (posible error de parametrización, como los
   67 intercambiados de Drenaje).

Todo es determinista y verificable: contar coincidencias no es interpretar.

### «Skills» para la Planilla: criterios subidos

La analogía con las *skills* de la IA es buena para la forma (subir un paquete que
enseña algo), pero no para el cálculo. Propuesta, de menos a más:

| Qué se sube | Cómo se usa | ¿IA? |
|---|---|---|
| Lista de partidas / itemizado | catálogo + detección del mapeo (arriba) | No |
| Tabla de criterios (Excel con forma fija): unidad → medida nativa, kg/m por diámetro, qué categoría se mide cómo | reglas de cálculo de la plantilla | No |
| Plantilla completa exportada de otra obra (JSON) | se aplica como copia con versión | No |
| Documento libre (PDF de criterios de metrado, norma, especificaciones) | un asistente PROPONE reglas a partir del texto; el propietario las revisa y confirma; solo lo confirmado se guarda como regla determinista | Solo para proponer, nunca para calcular |

La última fila choca con la regla «sin IA en datos» si la IA calcula; no choca si solo
redacta una propuesta que una persona confirma. Es una decisión del propietario y no hace
falta para lo demás.

> **Precisión del propietario (24-oct):** lo que se sube es **el itemizado en 3 columnas:
> ítem, descripción y unidad** («es con lo que más se parametriza en obras»). Ni metrado ni
> precio. La unidad de cada partida sale del itemizado; la del modelo, si existe, solo se
> contrasta con ella (y la diferencia se avisa).

## 8 · «Planilla inteligente»: ¿machine learning que aprenda del usuario?

Pregunta del propietario: ¿se puede meter en la Planilla un machine learning que aprenda
de quien la usa (sus filtros, sus búsquedas)? Lo investigado separa **cuatro niveles** de
«inteligencia», de lo más simple y seguro a lo más pesado:

| Nivel | Qué aprende | Cómo lo hacen otros | ¿Toca las cantidades? |
|---|---|---|---|
| **1 · Del uso** | qué campos, búsquedas, agrupaciones y consultas usas más y más recientemente → te los ofrece primero | Firefox ordena su barra de direcciones por *frecency* (frecuencia + recencia, con decaimiento exponencial y peso por interacción). No hace falta un modelo entrenado. | No |
| **2 · De lo confirmado** | equivalencias que tú validas: «este parecido sí es esta partida», «esta partida se mide en m²», «este parámetro es el código» → la próxima vez es automático | Power BI Q&A: se revisan las preguntas que hicieron los usuarios y se le «enseñan» términos y sinónimos. Lo que hay es un bucle manual de revisión, no aprendizaje automático. En investigación, el *active learning* para emparejar esquemas: el sistema pregunta solo lo más dudoso y aprende de la respuesta. | No: recuerda decisiones humanas |
| **3 · Clasificador (ML)** | propone el itemizado para elementos SIN partida, a partir de los que sí la tienen en la misma obra (categoría, familia, tipo, material, medidas) | Investigación: Random Forest con Uniclass sobre 8.715 objetos IFC, exactitud 0,99–1,00 (validación cruzada en un solo conjunto de datos); SVM 0,91–0,94 sobre 4.187 elementos. En emparejar metrados con partidas de costo, lo que se usa en la práctica es códigos + reglas + coincidencia aproximada, y lo dudoso pasa a revisión humana. | Solo propone; nunca asigna solo |
| **4 · Lenguaje natural** | preguntas en español («¿cuántos metros de HDPE 1500 en el frente 2?») convertidas en una consulta de la plantilla | Autodesk Assistant (preguntas con respuestas citadas), AutoSpecs (propone submittals a partir de las especificaciones). | No: traduce a una consulta; el cálculo sigue siendo determinista |

Lo que dice la evidencia:

- **Tandem no usa ML para clasificar**: su mapeo es por reglas, y exige que el código del
  parámetro de Revit sea idéntico al del sistema de clasificación. La «IA» de Autodesk que
  clasifica es la de ReCap Pro (nubes de puntos), no la de Tandem.
- Las cifras altas de ML (0,99) salen de **un solo conjunto de datos** y los propios
  autores no garantizan que se trasladen a otra obra o a otra manera de modelar.
- Los clics y las búsquedas son una señal **escasa y sesgada** (se pulsa lo que aparece
  primero; cada usuario busca cosas distintas). Con los pocos usuarios de una obra, un
  modelo entrenado sobre clics aprendería poco; contar frecuencia y recencia, sí.

### Recomendación

1. **Niveles 1 y 2 primero.** Encajan con la regla «sin IA en datos / aprender = recordar
   lo confirmado», son explicables («te lo propongo porque lo usaste 14 veces esta
   semana») y baratos. Parte ya existe: los parecidos confirmables del buscador.
2. **Nivel 3 como experimento medido, no como producto.** Con Drenaje (8.378 elementos,
   la mayoría con partida) se puede medir en local cuántas partidas acertaría un
   clasificador, ocultando las partidas reales de una parte de los elementos. Si no supera
   un umbral que fijes tú, no se hace.
3. **Nivel 4 más adelante.** Ya existe «Preguntar a la IA sobre el proyecto» en la barra
   superior; podría traducir preguntas a consultas de la Planilla.

**Dónde guardar lo aprendido.** Las preferencias personales del nivel 1 pueden vivir en el
navegador de cada uno. Lo confirmado del nivel 2 es de la obra: va con la plantilla, en
Postgres, con autor y fecha. Registrar el uso de cada persona es guardar actividad de
usuarios en el servidor: necesita tu autorización y avisar a los usuarios.

> **Decisión del propietario (24-oct-2026): NADA DE IA.** Fuera los niveles 3 (machine
> learning) y 4 (lenguaje natural). «Inteligente» = deducido de los datos que el visor ya
> tiene o extrajo, con reglas fijas y explicadas, más el uso y lo confirmado (niveles 1 y 2).

## 9 · Inteligencia que sale de los datos extraídos (sin IA)

El inventario completo ya está en Postgres. De él se puede deducir mucho con reglas que
cualquiera puede comprobar, **sin depender de cómo se llamen los parámetros**:

1. **Perfil de cada parámetro** (se calcula sobre lo extraído): tipo de valor (número,
   texto, código, fecha), % de elementos que lo tienen lleno, valores distintos, relleno
   («0», «NA», «-»), forma de los valores. El selector de campos dice qué es cada uno.
2. **Roles deducidos por la forma de los valores, no por el nombre:**
   - *código*: valores con forma de código (cifras con separadores: `06.02.01.03`,
     `OE.2.1`, `1.2.3`);
   - *descripción*: texto largo que va de la mano con un código (a cada código le
     corresponde casi siempre la misma descripción);
   - *unidad*: valores de un conjunto pequeño (m, m², m³, kg, und, glb…);
   - *fecha*, *zona/frente*: forma de fecha / pocos valores que agrupan muchos elementos.
   Cada propuesta lleva su porqué, por ejemplo: «`X`: el 97 % de sus valores tienen forma
   de código y a cada uno le corresponde una sola descripción en `Y`».
3. **Con el itemizado subido** (código + descripción): se cuenta en qué parámetro
   aparecen sus códigos y descripciones (comparación tolerante del buscador).
4. **Calidad, deducida y explicada:** código y descripción intercambiados (67 en Drenaje),
   la misma partida con distintas unidades o descripciones, líneas repetidas, elementos
   sin partida, códigos que no están en el itemizado.
5. **Uso:** lo que más usas y lo más reciente, primero (frecuencia + recencia, con su
   porqué).
6. **Lo confirmado se recuerda:** mapeos, parecidos y unidades que validas quedan en la
   plantilla de la obra.

Con 1 y 2, la Planilla puede **proponer la plantilla de una obra nueva sola**; tú la
confirmas o la corriges. DSI deja de estar escrito en el código: sería lo que la Planilla
deduce de Drenaje, y debe coincidir con lo de hoy (42/42).

## 10 · Hecho: puntos 1 y 2 (24-oct-2026, en local, sin commit)

`frontend-react/src/lib/planillaPerfil.js` (pruebas `pruebas/planillaPerfil.prueba.mjs`, 25/25) y el
enlace «cómo se leyó» en la vista Partidas (`TablaDePartidas.jsx`). Sin IA y sin guardar nada.

- **Perfil** de cada parámetro: forma de sus valores, llenos, distintos, relleno, letras y palabras
  de media. El inventario trae cada parámetro dos veces (`Datos::X` y `X`): se perfila el que lleva
  grupo.
- **Código**: ≥ 80 % de los valores con forma de código (`06.02.01`, `OE.2.1`, `01.01`; no `1.522`),
  ≥ 5 códigos distintos y que se repitan. Así quedan fuera una clasificación, un tipo o una fecha con
  forma de código, y las marcas.
- **Descripción**: texto de palabras (≥ 12 letras, ≥ 3 palabras, ≥ 3 textos) que cada código lleva
  igual (≥ 75 %) y que se llena en los mismos elementos (≥ 35 %). Gana el más específico (una zona
  también va con el código, pero agrupa muchos). Se reparte entre todas las líneas a la vez, y se
  prefiere el parámetro con el mismo número de línea. Si otro candidato queda cerca: **por
  confirmar**.
- **Unidad**: valores con forma de unidad, la misma por código (≥ 90 %).
- **Avisos de calidad**: código con textos dentro (cambiados de sitio), códigos con más de una
  descripción (con ejemplo), unidad con números dentro.

**Medido en Drenaje** (base local, 3.102 elementos, 540 parámetros, 0,6 s):

| Línea | Código | Descripción | Unidad |
|---|---|---|---|
| sin número | = DSI | = DSI (con aviso: 20 códigos con dos descripciones) | **distinta**: «LONGITUD» frente a `02_01_DSI_Unidad`, que tiene 460 números entre 728 valores |
| 1, 2, 3 | = DSI | = DSI | = DSI |

Calidad idéntica a la del diccionario DSI escrito a mano (165 con padre, 65 intercambiadas, 484
repetidas). La única diferencia es la unidad de la línea sin número, y es un defecto del dato: la
resolverá la columna Unidad del itemizado (paso 3). Mientras tanto, si el modelo usa DSI se usa DSI, y
si no, lo deducido.

**Lo que costó llegar ahí, dicho:** la primera regla de descripción («cada descripción, un solo
código») era falsa en obra real: en Drenaje 191 códigos comparten 23 descripciones (el «FUSTE» de
cada buzón). Y dar demasiado peso a la especificidad eligió un GUID. Sin itemizado, la descripción
puede ser ambigua; por eso existe «por confirmar».

**Siguiente (paso 3):** subir el itemizado (ítem, descripción, unidad), contar en qué parámetros
aparecen sus códigos y descripciones, y tomar la unidad de ahí. Ojo: el presupuesto contractual
(`pm.json`, 1.498 ítems, 5 niveles) no basta, porque el modelo usa sub-partidas de 6 niveles
(`06.05.02.04.03.08` «FUSTE»). Hace falta el itemizado con el que se parametrizó.

## 11 · Hecho: paso 3, el itemizado (24-oct-2026, en local, sin commit)

`frontend-react/src/lib/planillaItemizado.js` (pruebas `pruebas/planillaItemizado.prueba.mjs`, 23/23).
En la vista Partidas, «cargar itemizado…» lee un Excel o CSV **en el navegador**: no se sube ni se
guarda, y al recargar hay que volver a cargarlo.

- **Columnas por sus valores:** ítem = la columna con más códigos (un número corto como «06» cuenta
  como capítulo), unidad = la que tiene más unidades (incluidas las de transporte: m3-km, t-km),
  descripción = la de texto con más palabras. Elige la hoja con más ítems con unidad (el cronograma
  repite los ítems sin unidad).
- **Ubicar un código del modelo:** exacto, **sub-partida** (un antecesor está en el itemizado: el
  modelo baja un nivel) o fuera.
- **La unidad y la descripción del itemizado mandan**; las del modelo se guardan para compararlas.
  El capítulo y el padre llevan su descripción oficial.
- **La deducción usa el itemizado como prueba:** un parámetro cuyos códigos están en él es de
  partidas aunque tenga pocos códigos distintos, y gana la descripción cuyos textos son los del
  itemizado.
- Marcas en la tabla: ↳ sub-partida, ∉ no está en el itemizado.

**Medido con `Presupuesto_Rv00.xlsx`** (PQ-08, hoja CAOV, columnas B/E/F, 1.498 ítems, 1.298 con
unidad) sobre Drenaje en la base local (3.102 elementos):

| Qué | Resultado |
|---|---|
| Códigos del modelo reconocidos | **100 % en las 4 líneas**; línea 1: 80 exactos + 111 sub-partidas (6.º nivel, p. ej. FUSTE) |
| Partidas fuera del itemizado | **0** |
| Descripciones del modelo que son las del itemizado | línea 2: 88 %; línea 1: 57 % (las sub-partidas no están en él) |
| Unidad distinta en el modelo | **23** (p. ej. buzones `06.02.01.04.03`: m³ en el modelo, und en el itemizado) |
| Descripción redactada distinto | 89 (se muestra la del itemizado) |
| Partidas del itemizado sin elementos | 1.119 de 1.298: normal, el itemizado es de todo el PQ-08 y el modelo es Drenaje |
| Partidas en la vista | 333 → 303 (la unidad oficial une las que el modelo partía por unidad); sin medida 2.308 → 1.941 |

**Por revisar con el propietario:** con unidad «und» la cantidad es 1 por elemento. Si un buzón está
modelado en varias piezas que llevan su código, el conteo sale inflado. Hay que comprobarlo en los
23 casos de unidad distinta.

## 12 · Decisión del propietario: el criterio sale SOLO del itemizado (24-oct-2026)

«No queremos que eso quede. Queremos limpiar de ese criterio y hacer otro de acuerdo a lo que subimos.»
Lo que quedaba era el estándar DSI **escrito en el código** (`diccionarioDSI`: los nombres
`03_05_DSI_…`), que la vista Partidas usaba siempre, sin que nadie hubiera subido nada. De la prueba
no quedó nada guardado (ni base, ni servidor, ni navegador).

Ahora, en local y sin commit:
- **Sin itemizado, Partidas está vacía** y pide «Cargar itemizado…». No hay criterio previo.
- **Con itemizado**, el criterio se arma con él: se buscan en el modelo los parámetros donde están
  sus ítems (por los valores, no por los nombres), y la descripción y la unidad son las suyas.
  «Cómo se leyó» lo dice así.
- **«✕ Quitar itemizado»** deja la vista vacía otra vez.
- La vista y el Excel exportado usan el mismo criterio. En InventoryDataGrid, `rolesPartidas` y
  `dicPartidas` sustituyen a `diccionarioDSI`. Sin itemizado, el Excel de la vista Partidas sale como
  el de Elementos.
- `diccionarioDSI` sigue existiendo en la librería (lo usan sus pruebas), pero la interfaz ya no lo usa.

Verificado en el 5173: vacía → cargar `Presupuesto_Rv00.xlsx` → 303 partidas y 4 líneas leídas →
quitar → vacía.

## 13 · Partida → 3D: aislar, recorrer, volver (24-oct-2026, en local, sin commit)

Decisiones del propietario, en orden: volar a la partida a distancia prudente; marcas sobre las
piezas (después retiradas); «que sea lo mismo que Filter en todo… que se aísle»; «un clic aísla,
otro clic muestra todo»; volver debe ser inmediato, como «Mostrar todos los objetos».

**Arquitectura** (cada responsabilidad en un sitio, con pruebas):

| Pieza | Qué hace | Pruebas |
|---|---|---|
| `lib/aislamientoTemporal.js` | Controlador: guarda el estado del visor UNA vez (aislados y ocultos por modelo), aísla, re-aísla otra partida sin restaurar entre medias, ignora un paso «◀ ▶» de la misma partida, restaura (una operación como el menú si antes no había nada; si no, modelo por modelo), salta modelos descargados, deshace si falla a medias. `EVENTOS` con nombre. `conVisibilidadProgramada`: el contrato con Filters. | `aislamientoTemporal` 18/18 (visor simulado) |
| `lib/recorridoDePartida.js` | Centro de cada pieza y tramos de 15 m para recorrer miles de piezas. | `recorridoDePartida` 6/6 |
| `lib/encuadreCamara.js` + `lib/irAElemento.js` | Encuadre por lo que se ve desde la cámara (esquinas de las piezas), zona libre sin paneles. | `encuadreCamara` 20/20 |
| `Viewer.jsx` | Solo traduce eventos a llamadas al controlador (clic, segundo clic, Escape, otra selección). | — |
| `TablaDePartidas.jsx` | Clic = aislar (con la clave de la partida); clic en la activa = mostrar todo; «◀ ▶». | — |

**Contrato con Filters** (`lib/filterVisualDriver.js`, CLOSED, sin tocar): el conductor visual
recalcula TODOS los filtros ante un HIDE/SHOW/ISOLATE ajeno, salvo con
`window._filterIsolationInProgress`. El aislamiento de la Planilla es temporal y se deshace exacto,
así que se hace dentro de esa marca (la misma con que Filters aísla él mismo), que respeta también
la sincronización de aislamiento del visor (si no, volvería a filtrar la Planilla por lo aislado).

**Medido** (Canal, 13.866 filas, 896 barras de `05.15.03.05`, PerformanceObserver de tareas largas):

| Paso | Antes | Ahora | Recálculos de Filters |
|---|---|---|---|
| Segundo clic (mostrar todo) | 5.600 ms | 64–265 ms | 1 → 0 |
| Clic en la partida | — | 66–226 ms | 0 |
| «▶» de la misma partida | restauraba y re-aislaba | 69 ms, sin tocar la visibilidad | 0 |
| Otra partida | restauraba y re-aislaba | 113 ms, directo | 0 |

Lo oculto antes de aislar (1 elemento de Sources) sigue oculto después. La fluidez del 3D no se
puede medir desde la extensión (ventana en segundo plano: el navegador la frena); la confirma el
propietario.

**Lo que se probó y se descartó, dicho:** marcas numeradas (y agrupadas para miles de piezas) sobre
las piezas: con el aislamiento ya no aportan; seleccionar en vez de aislar: la pasada de resaltado
de LMV pesa con cientos de barras; restaurar modelo por modelo sin marcas: cada HIDE disparaba el
recálculo completo de Filters.

## 5 · Qué no sé todavía (dicho, no supuesto)

- No pude leer la ayuda de Solibri ni la página de IDS de buildingSMART (403). Lo de
  Solibri sale de sus notas de versión y su boletín; lo de IDS, del repositorio
  oficial en GitHub y de resúmenes.
- La ayuda de Tandem no dice si las plantillas se exportan como fichero ni dónde se
  guardan. La de Trimble no dice cómo persiste los datos: solo que versiona cada
  edición.
- No he medido el cálculo con obras mucho mayores que Drenaje (8.378 elementos).

## 6 · Decisiones del propietario

1. **¿Plantilla de Planilla con las tres capas (diccionario, reglas, consultas)?** ¿O
   solo la capa A por ahora?
2. **¿Guardar en Postgres** (JSONB con versiones, por entidad y por obra) **+
   exportar/importar JSON**? Supone una migración aditiva y su rollback, y no toca
   tablas existentes.
3. **Orden propuesto**:
   1. En local, sin guardar nada: la librería lee una plantilla y DSI queda como
      plantilla de fábrica (mismo resultado; 42/42).
   2. Grupo «Sin partida» y capítulo genérico.
   3. Con autorización: migración, API y pantalla para mapear.

## Fuentes

- Autodesk Tandem — Facility Templates: https://help.autodesk.com/cloudhelp/ENU/Tandem-Specify/files/tandem-facility-templates.html
- Autodesk Tandem — API de plantilla aplicada: https://aps.autodesk.com/en/docs/tandem/v1/reference/quick_reference/tandem-data-inlinetemplate-GET
- Autodesk Tandem — guardar vistas (foro): https://forums.autodesk.com/t5/tandem-forum/working-with-saved-views/td-p/10754008
- Trimble Connect — Property Set Service: https://developer.trimble.com/docs/connect/pset
- Navisworks — Customizing XML Property Files: https://help.autodesk.com/cloudhelp/2022/ENU/Navisworks/files/GUID-B04BF605-1303-4A49-805E-5D6EF2801057.htm
- Navisworks — exportar el catálogo (foro): https://forums.autodesk.com/t5/navisworks-forum/navisworks-2014-quantification/m-p/4331470
- Solibri 9.10.4 (ITO y extensiones): https://www.solibri.com/articles/solibri-9-10-4-release-notes
- Solibri 25.3.0 (fórmulas en ITO y clasificaciones): https://www.solibri.com/articles/solibri-25-3-0-release-notes
- Solibri Spotlight 6 (crear una vez, reutilizar): https://www.solibri.com/articles/solibri-spotlight-issue-6
- BIMcollab — Smart Views: https://helpcenter.bimcollab.com/portal/en/kb/articles/basics-of-making-smart-views
- ACC Takeoff — importar clasificaciones: https://aps.autodesk.com/en/docs/acc/v1/reference/http/takeoff-projects-project_id-classification-systems-system_id-classificationsimport-POST
- ACC Takeoff — ajustes: https://help.autodesk.com/cloudhelp/ENU/Takeoff-GS/files/Configure_Takeoff_Settings.html
- ACC Model Properties — lenguaje de consulta: https://aps.autodesk.com/en/docs/acc/v1/tutorials/model-properties/query-ref
- buildingSMART IDS (repositorio): https://github.com/buildingSMART/IDS
- buildingSMART — bSDD en IDS e IFC: https://technical.buildingsmart.org/services/bsdd/referencing-bsdd-in-ids-and-ifc/
- Revit — keynotes (tabla externa): https://help.autodesk.com/cloudhelp/2026/ENU/Revit-DocumentPresent/files/GUID-A3161C4C-6171-4C8E-BC2A-CF65E9F716D1.htm
- MEF — formatos EIR/BEP en actualización (oct-2025): https://mef.gob.pe/planbimperu/novedadesbim/novedad-20251020.html
- pg_jsonschema: https://docsearch.algolia.com/mcp/docs/repo/supabase/pg_jsonschema
- §8 · Firefox, ranking por frecency: https://firefox-source-docs.mozilla.org/browser/urlbar/ranking.html
- §8 · Power BI, enseñar a Q&A: https://learn.microsoft.com/en-us/power-bi/natural-language/q-and-a-tooling-intro
- §8 · Clasificación Uniclass con ML (Random Forest): https://www.preprints.org/manuscript/202505.1790/v1
- §8 · Clasificación con SVM de elementos BIM: https://pure.seoultech.ac.kr/en/publications/using-support-vector-machines-to-classify-building-elements-for-c/
- §8 · Tandem, clasificaciones (por reglas): https://help.autodesk.com/cloudhelp/ENU/Tandem-Specify/files/tandem-classifications.html
- §8 · Autodesk, transparencia de la IA: https://www.autodesk.com/fr/trust/trusted-ai/ai-transparency-cards
- §8 · Active learning para emparejar ontologías y esquemas: https://pubs.dbs.uni-leipzig.de/se/node/1033
- §8 · Clics sesgados en learning to rank: https://www.cs.cornell.edu/~schnabts/downloads/joachims2017ltr.pdf
- §8 · Emparejar elementos del modelo con partidas de costo (NLP): https://par.nsf.gov/servlets/purl/10104666
- §8 · Autodesk AutoSpecs: https://www.autodesk.com/autodesk-university/class/Spec-tacular-AI-Streamlining-Project-Specs-and-Submittals-with-Specifications-and-AutoSpecs-in-Construction-Cloud-2025
- En el repositorio: `backend/sql/12_capa14_project_templates.sql`, `backend/sql/19_gap06_plantillas_revision.sql`, `backend/routes/plantillas_revision.py`.
