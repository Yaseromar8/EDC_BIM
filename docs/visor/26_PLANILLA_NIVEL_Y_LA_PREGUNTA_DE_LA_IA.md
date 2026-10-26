# 26 · Planilla como cerebro de datos: en qué nivel estamos, y la pregunta de la IA (24-oct-2026)

SOLO ANÁLISIS. Dos preguntas del propietario:
1. ¿A qué nivel estamos de que la Planilla sea el centro y cerebro de datos?
2. Tratándose de datos de obra, ¿conectarle IA ayudaría, sabiendo que la IA alucina?

---

## Parte A · En qué nivel estamos

### A.1 · La vara de medir: lo que nos pusimos como meta

El doc 15 (*Inventory como cerebro de datos*, 22-oct) listó diez pedidos. Este es su
estado en lo que hoy está en `main` (`857061ed`):

| # | Pedido (doc 15) | Hoy | Estado |
|---|---|---|---|
| 1 | Tablas de Revit en la web, clic → 3D | tabla con orden, agrupado multinivel, totales; clic vuela y aísla | ✔ |
| 2 | Filtros avanzados **que se guarden** | Y / O anidados y operadores por tipo (texto, número, fecha); **no se guardan como consulta con nombre** | ½ |
| 3 | Agrupación profesional | multinivel con subtotales ✔; **pivote** (partida × periodo) ✗ | ½ |
| 4 | Saber qué parámetros sirven | % con dato, constantes y casi vacíos en el selector; rellenos («NA», «-») detectados | ½ |
| 5 | Metrado por partida (5D) | Partidas con la medida nativa, guiadas por el itemizado ✔; **precios y presupuesto** ✗ | ½ |
| 6 | Metrados por valorización | pivote por periodo y **corte congelado** | ✗ |
| 7 | Sustento ante la supervisión | «Cómo se leyó» y aislar en 3D ✔; detalle por cifra de qué elemento y parámetro sale, a medias | ½ |
| 8 | Adicionales y deductivos | comparar el corte con la versión nueva | ✗ |
| 9 | Calidad antes de valorizar | avisos del pie y contadores del cruce; **no hay vista de «qué falta»** (doc 25, P1) | ½ |
| 10 | Cualquier obra y cualquier dato | deducción por la forma de los valores, sin nombres ✔; **plantillas reutilizables** ✗ | ½ |

**Recuento:** 1 hecho, 7 a medias y 2 sin empezar. Contando la mitad como medio punto da
**4,5 de 10**, unos **45 %**. Es una estimación con esta regla, no una medida.

### A.2 · Dicho por niveles

| Nivel | Qué significa | Planilla |
|---|---|---|
| **1 · Ver** | todos los datos extraídos, en una tabla fiable, con Excel | ✔ hecho |
| **2 · Entender** | tipos reales, salud de parámetros, qué campo es código, descripción o unidad, partidas | ✔ casi hecho |
| **3 · Responder** | preguntas guardadas que se recalculan con cada versión; colorear el 3D; ver qué falta; pivote | ✗ empieza aquí |
| **4 · Recordar** | el itemizado guardado; cortes congelados; comparar versiones; plantillas entre obras | ✗ (pero los datos de cada versión **ya se guardan**, doc 25 §2) |
| **5 · Cruzar** | presupuesto, cortes de valorización, avance (PREDICT), observaciones y documentos de Docs | ✗ en la Planilla; partes sueltas en otros paneles (5D, Avance en local) |

**En una frase:** la Planilla ya **ve y entiende** los datos (niveles 1-2), pero todavía
**no recuerda ni cruza** (niveles 4-5). Por eso aún no es «el cerebro»: un cerebro
guarda lo que aprendió, y hoy lo que hace el usuario en la Planilla se pierde al
recargar, salvo las columnas que ya guarda una vista guardada.

### A.3 · Qué la llevaría al siguiente nivel (sin IA)

1. **Nivel 3**: ver qué falta y colorear (doc 25 P1 + P2), y consultas con nombre
   (doc 15 §4.2).
2. **Nivel 4**: guardar el itemizado (P3, migración) y comparar versiones (P4, sin
   migración). Después, el corte congelado para valorizar.
3. **Nivel 5**: cruzar con los cortes de valorización y con las observaciones de Docs.

---

## Parte B · ¿Conectarle IA? Lo que dice la evidencia

### B.1 · Lo medido

| Hallazgo | Dato | Fuente |
|---|---|---|
| **Con fuentes y citas, igual alucina** | Las herramientas de IA para abogados de LexisNexis y Thomson Reuters, que buscan en documentos reales y citan («RAG»), inventaron entre el **17 % y el 33 %** de las respuestas. Lexis acertó el 65 % y Westlaw el 42 %. | Stanford RegLab / Magesh et al. |
| **Sumar y contar en una tabla es su punto débil** | El razonamiento de los LLM sobre tablas tiene un **déficit significativo** y empeora con **valores vacíos, duplicados y cambios de estructura**, que es justo lo que tienen los modelos de obra. Funciona mejor si la IA **escribe código o una consulta** y quien calcula es un programa. | Wolff y Hulsebos, ACL 2025; SemEval-2025 tarea 8 |
| **Ni traduciendo a consulta es fiable del todo** | En BIRD, la prueba de preguntas → SQL, los mejores sistemas rondan el **~80 %** frente al **93 %** de expertos humanos. Una de cada cinco consultas sale mal y **devuelve un número que parece correcto**. | BIRD (paper original); resúmenes de 2025, cifra reciente sin fuente primaria |
| **En BIM, peor** | Los LLM generales **rinden mal en tareas BIM específicas**, y las evaluaciones usan conjuntos pequeños que no se pueden comparar entre sí. | Tsinghua (arXiv 2602.20812); arXiv 2605.01698 |
| **Los fabricantes no publican tasas de error** | Procore y Autodesk venden respuestas «con citas» y aprobación humana antes de actuar, sin cifras de acierto. Microsoft avisa de que Copilot en Excel y Power BI **puede dar fórmulas y resúmenes incorrectos** y pide validarlos. | prensa del sector; Autodesk; resúmenes de la documentación de Microsoft |
| **Perú** | El Reglamento de la Ley 31814 (D. S. 115-2025-PCM), **vigente desde el 22-ene-2026**, pide supervisión humana en sistemas de alto riesgo y políticas de IA en el sector público. No verifiqué si un metrado de obra pública entra en «alto riesgo». | El Peruano; LP Derecho; firmas de abogados |

### B.2 · Lo que eso significa para datos de obra

- En obra pública un metrado acaba en una **valorización**, que es un **pago**, y la firman
  el residente y el supervisor. Un número inventado que «parece correcto» no es un error
  de pantalla: es un problema contractual.
- Lo peligroso no es que la IA se equivoque, porque las personas también se equivocan.
  Lo peligroso es que **se equivoque sin que se note**: responde con la misma seguridad
  cuando acierta que cuando inventa.
- La regla actual, **NADA de IA**, está bien fundada para **calcular, rellenar o
  responder cifras**.

### B.3 · Dónde SÍ podría ayudar, y con qué condición

La condición: **la IA traduce, no calcula.** Nunca da un número. Solo propone una acción
que el usuario ve y que ejecuta nuestro motor, que no alucina.

| Uso | Cómo sería | Por qué el riesgo es bajo |
|---|---|---|
| **Pregunta en lenguaje normal → filtro visible** | «concreto de losas del paño 3» → la IA arma el filtro (Categoría = Suelos, Paño = 3, Material contiene «concreto») y **lo enseña**. El total lo calcula la Planilla. | Si se equivoca, el error **se ve** en el filtro, no se esconde en un número. |
| **Sugerir correspondencias** del itemizado cuando el modelo no trae códigos | «¿“Solado e=4” del modelo es la partida 06.01.03.01?» → **propuesta**, el usuario confirma y queda guardada. | Nada entra sin un clic humano. Lo confirmado pasa a ser regla determinista. |
| **Leer documentos** (especificaciones, TDR) | Fuera de la Planilla; otro tema. | — |

**Dónde NO**, nunca:
- calcular metrados;
- escribir parámetros;
- responder «¿cuánto…?» en un párrafo;
- armar una valorización.

### B.4 · Mi opinión

1. **Ahora no.** El valor está en terminar los niveles 3 y 4 sin IA. Además, cuanto mejor
   sea nuestro motor (consultas visibles, explicaciones, «qué falta»), **más segura sería
   una IA después**, porque solo manejaría ese motor.
2. **Si algún día, solo como traductor**, con cuatro condiciones:
   - el filtro propuesto siempre visible;
   - jamás escribe datos;
   - un registro de lo que propuso;
   - un banco de preguntas con respuesta conocida que debe pasar antes de activarla.
3. Así se gana la comodidad de preguntar en palabras sin arriesgar una cifra.

---

## Qué no sé (dicho, no supuesto)

- No hay estudios serios de **tasas de alucinación en metrados BIM**. Lo de arriba son
  analogías medidas: derecho, tablas, SQL.
- La cifra de ~80 % en BIRD de 2025 viene de un resumen secundario. El 93 % humano y el
  54,9 % de GPT-4 salen del paper original.
- No leí el texto del D. S. 115-2025-PCM: no sé qué casos clasifica como alto riesgo.

## Fuentes

- Stanford RegLab, Magesh et al., «Hallucination-Free? Assessing the Reliability of Leading AI Legal Research Tools»: https://nlp.stanford.edu/~manning/papers/Magesh-Hallucination%E2%80%90Free-2025.pdf
- VentureBeat sobre el estudio de Stanford: https://venturebeat.com/ai/stanford-study-finds-ai-legal-research-tools-prone-to-hallucinations
- Wolff y Hulsebos, «How well do LLMs reason over tabular data, really?» (ACL 2025, TRL): https://arxiv.org/abs/2505.07453v1
- «Rethinking Tabular Data Understanding with Large Language Models»: https://arxiv.org/pdf/2312.16702
- BIRD, «Can LLM Already Serve as a Database Interface?»: https://huggingface.co/papers/2305.03111
- Agentar-Scale-SQL (BIRD, 2025): https://arxiv.org/pdf/2509.24403
- Benchmark BIM de Tsinghua: https://arxiv.org/abs/2602.20812v1
- BIM Information Extraction Through LLM-based Adaptive Exploration: https://arxiv.org/pdf/2605.01698
- Procore, agentes de IA (SiliconANGLE): https://siliconangle.com/2024/11/20/procore-add-ai-agents-construction-management-software-platform/
- Procore, búsqueda profunda y contratos (Construction Management): https://constructionmanagement.co.uk/procore-agentic-ai-tackles-deep-search-and-contract-reviews/
- Autodesk, «GCs, Meet Autodesk Assistant»: https://www.autodesk.com/blogs/construction/gcs-meet-autodesk-assistant-a-smart-tool-that-can-help-you-find-answers/
- Collab365, «Microsoft says Copilot answers in Excel and Power BI can be wrong»: https://spaces.collab365.com/posts/microsoft-says-copilot-answers-in-excel-and-power--deHRzB
- D. S. 115-2025-PCM (Congreso): https://www.congreso.gob.pe/Docs/DGP/DIDP/files/ds_115-2025-pcm.pdf
- LP Derecho, reglamento de la Ley 31814: https://lpderecho.pe/reglamento-ley-promueve-uso-inteligencia-artificial-desarrollo-economico-pais-decreto-supremo-115-2025-pcm/
- Garrigues, Perú aprueba el reglamento: https://www.garrigues.com/es_ES/noticia/peru-aprueba-reglamento-ley-promueve-uso-inteligencia-artificial-favor-desarrollo-economico
