# 30 · Cerebro de consulta · diseño (25-oct-2026)

SOLO DISEÑO, sin código. Aclaración del propietario: el minicerebro del doc 29 «es para el Excel
subido; me refería más ya a CONSULTAR INFORMACIÓN».

**Qué es:** preguntarle a la obra en palabras de obra («volumen de concreto en losas del paño 3 por
nivel») y recibir la respuesta con su cifra, su desglose, los elementos en el 3D y **cómo se
entendió la pregunta**. **Sin IA**: un vocabulario fijo de obra, el diccionario que la Planilla
deduce de los datos, y la memoria de lo que el usuario enseña. Si no entiende una palabra, lo dice:
no adivina.

## 0 · De dónde sale la idea (medido, no supuesto)

- **ThoughtSpot**, la «búsqueda» de datos más conocida, nació así:
  - se escriben **palabras sueltas** (nombres de columna, valores de celda y operadores como «>» o
    «ayer»), no frases;
  - cada palabra se vuelve una **ficha de color**: medida, atributo o filtro;
  - las palabras de relleno («de», «por») no cambian el resultado.
- **Power BI Q&A** usaba un **esquema lingüístico** con **sinónimos** editables por el dueño del modelo.
  **Microsoft lo retira en diciembre de 2026** para pasar a Copilot, que es IA.
- **Nosotros nos quedamos con la vía determinista** (decisión del propietario, docs 24 §8 y 26): es
  la que se puede explicar y auditar en una valorización.

Lo que ya existe en la Planilla y se reutiliza:
- `inventoryBuscar`: índice de valores y comparación sin tildes;
- `inventoryTabla`: filtros por tipo, agrupado, sumas;
- `planillaPerfil`: forma de cada parámetro;
- campos derivados: Estado y Capítulo;
- el aislamiento momentáneo en 3D.

Falta la capa que **entiende la pregunta**.

---

## 1 · Las piezas

```
 «volumen de concreto en losas del paño 3 por nivel»
                │
   ① ENTENDER   │  vocabulario de obra + diccionario de la obra + memoria
                ▼
   [Σ Volumen] [Material ∋ concreto] [Categoría = Suelos] [Paño = 3] [por Nivel]   ← fichas visibles y editables
                │
   ② RESPONDER  │  el motor de siempre (filtrar, agrupar, sumar) — sin IA
                ▼
   1.240,5 m³ · 312 losas · por nivel: N1 410,2 · N2 830,3
   ⚠ 12 losas sin volumen nativo: no se suman (verlas)
                │
   ③ ENSEÑAR    ├── tarjeta de respuesta + tabla + 3D aislado
                └── «cómo se entendió»: cada palabra → qué se hizo con ella
```

### 1.1 · El diccionario de la obra: lo que el cerebro sabe de los datos

Se arma solo al cargar la obra, con la forma de los valores (`planillaPerfil`) y los nombres de los
parámetros. Cada parámetro queda con un **papel**:

| Papel | Qué es | Cómo se reconoce | Ejemplos |
|---|---|---|---|
| **medida** | se suma | numérico; las nativas de Revit tienen su unidad | Volumen (m³), Área (m²), Longitud (m), longitud de barra, peso |
| **lugar** | dónde | texto con pocos valores que se repiten | Frente, Sector, Zona, Nivel, Paño, progresiva |
| **qué** | qué es | categoría, familia, tipo, material | Suelos, Muro básico, Concreto f'c=280 |
| **partida** | criterio de obra | del itemizado (doc 24, 27) | 05.15.04.01, Capítulo 05 |
| **tiempo** | cuándo | valores con forma de fecha | Inicio real, Fin programado |
| **estado** | cómo va | pocos valores de estado | Ejecutado, Liberado, Pendiente |

Además, un **índice de valores**: cada valor distinto («Suelos», «Paño 3», «Concreto f'c=280») →
en qué parámetro está y en cuántos elementos. Es lo que permite escribir **valores** sin decir
el parámetro, como en ThoughtSpot.

### 1.2 · El vocabulario de obra: fijo, escrito y en español

| Palabras | Se entiende como |
|---|---|
| cuánto, total, suma · volumen, m³ · área, m² · metros, longitud · peso, kg | **medida** que se suma |
| cuántos, cantidad de, número de | **contar** elementos |
| por, según, desglosado por | **agrupar** por ese papel |
| de, en, del, con | **filtro** con el valor que sigue |
| sin, falta, vacío | el parámetro **no tiene dato** |
| mayor que, más de, menor que, entre … y … | filtro numérico |
| en octubre, esta semana, antes del 15, entre fechas | filtro de **tiempo** |
| cuáles, lista | lista de elementos |
| dónde | aislar en el 3D |
| comparar A y B | dos respuestas lado a lado |

Las palabras vacías («el», «la», «que», «hay») se ignoran **y se dice** que se ignoraron.

### 1.3 · Entender: palabra a palabra, siempre visible

Por cada palabra o grupo de palabras, en este orden:
1. **Memoria de la obra**: lo que el usuario ya enseñó («vaciado» = Plan de Vaciado).
2. **Vocabulario fijo** (tabla de arriba).
3. **Nombre de un parámetro** («nivel» → Nivel).
4. **Valor exacto** en el índice («Suelos», «Paño 3»), comparado sin tildes y en forma compacta.
5. **Valor que empieza así** («concr» → «Concreto…»), con la cifra de cuántos casan.

El resultado son **fichas** de color, como en ThoughtSpot: medida, filtro y agrupar. Se pueden
quitar o cambiar con un clic. Lo que se ejecuta es **exactamente** lo que dicen las fichas.

**Si una palabra significa dos cosas**, se pregunta: *«“3”: ¿Paño 3 (412 elementos) o Nivel 3 (96)?»*.
La respuesta se guarda en la memoria, para no preguntar dos veces.

**Si una palabra no se entiende**, se marca en gris: *«no entendí “bonito”»*. No se descarta en silencio
ni se adivina.

### 1.4 · Responder: con el motor que ya hay, y razonando la calidad

- Filtrar, agrupar y sumar con `inventoryTabla`: 20.000 filas en 36-162 ms, medido.
- **No mezclar unidades**: «suma de longitud» no junta m con m³.
- **Cada elemento una vez**: las líneas de partida repetidas no duplican.
- **Decir lo que no entra en la cifra**: *«12 losas sin volumen nativo: no se suman (verlas)»*.
- **Partidas**: con «partida 05.15.04.01» o «capítulo 05», la cantidad es la de la vista Partidas
  (medida nativa según la unidad oficial).

### 1.5 · Enseñar: siempre en el mismo sitio

- **Tarjeta de respuesta** arriba de la Planilla:
  - la cifra con su unidad;
  - cuántos elementos;
  - el desglose;
  - los avisos.
- **Tabla** debajo, ya filtrada y agrupada como la pregunta.
- **3D**: «dónde» o un clic en la tarjeta aísla esos elementos (el aislamiento momentáneo de siempre).
- **«Cómo se entendió»**: cada palabra → qué se hizo con ella y por qué (memoria, vocabulario, nombre o
  valor).

### 1.6 · Memoria de la obra

Por obra, con versiones, quién y cuándo, y se puede deshacer. Es la misma tabla que el minicerebro
del doc 29 (migración 41).
- **Sinónimos que enseña el usuario**: «vaciado» = Plan de Vaciado; «losas» = Suelos.
- **Respuestas a ambigüedades**: «3» en esta obra es Paño.
- **Preguntas guardadas**, con nombre: «Concreto por nivel». Guardan **la pregunta, no los elementos**, así
  que se recalculan con cada versión del modelo, como las *search sets* de Navisworks (doc 22).
  - Se comparten con el equipo.
  - Se pueden llevar a otra obra como plantilla.

---

## 2 · Tipos de pregunta (primera versión)

| Pregunta | Ejemplo | Respuesta |
|---|---|---|
| ¿Cuánto? | volumen de concreto en losas | cifra + unidad |
| ¿Cuántos? | cuántas tuberías DN 1500 | conteo |
| ¿Por qué grupos? | volumen por nivel | desglose |
| ¿Cuáles / dónde? | dónde están los buzones T2 | lista + 3D |
| ¿Qué falta? | losas sin partida · tuberías sin longitud | lista + 3D |
| ¿Cuándo? | ejecutado en octubre | por fechas |
| Comparar | concreto paño 3 y paño 4 | lado a lado |

---

## 3 · Rendimiento y escala

- El diccionario y el índice se arman **una vez por versión del inventario**, junto con los campos
  derivados. Reutilizan el perfil ya medido: ~0,7 s en el peor caso de 14.000 × 330.
- Entender una pregunta: búsquedas en mapas, milisegundos.
- Responder: el motor de la tabla, 36-162 ms con 20.000 filas.
- Todo son funciones puras con pruebas, portables al servidor cuando haya varias obras o informes
  programados.

---

## 4 · Lo que no hace

- No responde lo que no está en los datos. Si se le pregunta por algo que no existe, dice «no hay
  ningún parámetro ni valor “X” en esta obra».
- No entiende frases libres ni contexto («¿y el de ayer?»). Entiende palabras y fichas, y lo dice.
- No da porcentajes de confianza: da cifras y elementos.

---

## 5 · Fases

| Fase | Qué | Guarda | Necesita |
|---|---|---|---|
| **Q1** | Diccionario de la obra (papeles) + índice de valores + vocabulario + fichas + tarjeta de respuesta + «cómo se entendió»: cuánto, cuántos, por, de/en/con, sin, dónde | no | — |
| **Q2** | Ambigüedad preguntada + **memoria** (sinónimos, respuestas) + **preguntas guardadas** | sí (migración 41, compartida con el doc 29) | tu OK |
| **Q3** | Tiempo (fechas en español), comparar, «qué falta» por papel; abrir la respuesta en Filters | no | — |
| **Q4** | Preguntas guardadas como plantilla entre obras; en el servidor para informes | sí | — |

**Q1 ya permite** escribir «volumen de concreto en losas por nivel» y tener la cifra, el desglose y el
3D en un clic, sabiendo cómo se calculó.

## 6 · Decisiones del propietario

1. ¿Este enfoque: palabras y fichas visibles, sin IA, con memoria de la obra?
2. ¿La barra de preguntas **sustituye** al buscador actual de la Planilla (que pasa a ser un caso: pegar un
   valor) o va aparte?
3. ¿Empezamos por Q1?
