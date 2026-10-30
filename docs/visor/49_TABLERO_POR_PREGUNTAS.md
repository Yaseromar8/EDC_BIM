# 49 · Tablero: empezar por la pregunta, no por el tipo de gráfico

30-oct-2026. Propuesta, sin código. Lo pidió el dueño mirando el editor «Nuevo gráfico»:

> Necesito muchas más formas de análisis, de parametrizado, para hacer gráficas interesantes. Esa opción me confunde. ¿Cómo podemos mejorar para que sea intuitivo?

Viene de la Auditoría hecha en local el mismo día (`memory: tablero-analisis`, 30-oct).

## 1 · Por qué confunde hoy

El editor pregunta **cómo dibujar**, cuando lo que el usuario sabe es **qué quiere saber**.

| Lo que pide hoy | Por qué no se entiende |
|---|---|
| Título, lo primero | Aún no sabes qué gráfico vas a hacer. |
| Tipo: Barras, Línea, Área, Dona, Dispersión, Tabla, Cifra, Auditoría | Son 8 formas de dibujar y ninguna dice para qué sirve. |
| «Agrupar por», «Métrica: Contar / Sumar / Promediar» | Es jerga de tabla dinámica. |
| «Máximo de grupos», «Línea de referencia» | Son ajustes finos que salen al mismo nivel que lo esencial. |
| Clic en un parámetro de «Parámetros del modelo» | Agrupa por ese parámetro aunque sea un número (p. ej. «Cantidad»), y sale una barra por cada valor distinto, que no dice nada. |
| Los nombres `02_04_DSI_Area1`, `Conjunto de armaduras › Cantidad` | Se leen como códigos, no como datos de obra. |

## 2 · Propuesta: dos pasos

### Paso 1 · «¿Qué quieres saber?»

Una galería de preguntas en lenguaje de obra, por familias.

**Calidad de datos** (lo que pidió para la reunión)
1. **¿Qué elementos no tienen un dato?** Es la Auditoría de hoy.
2. **¿Qué parámetros faltan en cada categoría?** Es un mapa de calor: categorías × parámetros, y cada celda es el % con dato. De un vistazo se ve que «Pipes no tiene Sector». Clic en la celda: se aíslan los que faltan.
3. **¿Hay valores raros?** Para un parámetro elegido busca:
   - ceros y negativos;
   - repetidos donde no debería haberlos (dos elementos con la misma marca o el mismo código);
   - el mismo valor escrito de varias formas («Canal», «canal », «CANAL»).
4. **¿Los códigos existen en el itemizado?** Compara con la Planilla: con partida, sin partida o con un código que no existe. Ya existen los colores de estado.

**Cantidades**

5. **¿Cuánto hay de algo, separado por…?** Por ejemplo: volumen por sector, área por frente o longitud por partida. El sistema propone solo los parámetros numéricos para «cuánto» y solo los de texto para «separado por».
6. **¿Cómo se reparten los tamaños?** Un histograma de un número, por ejemplo cuántos muros hay de 0–1 m³, de 1–2 m³… Sirve para ver piezas absurdas.
7. **Los más grandes:** los 20 elementos con más volumen o área, con clic para ir a cada uno.

**Avance y Planilla**

8. **Contractual frente a ejecutado,** dos medidas lado a lado por sector o partida (`04_10_DSI_MetradoContractual` frente a `04_25_DSI_EjecutadoActual`).
9. **¿Qué está sin partida?** Es el estado frente al itemizado.
10. **Liberado por calidad frente a pendiente** (`04_26_DSI_LiberacionCalidad`).

**Libre**

11. **Tabla cruzada:** un parámetro × otro, con conteo o suma. Es el editor de hoy, para quien sepa lo que hace.

### Paso 2 · Solo los datos que esa pregunta necesita

- **Las preguntas se hacen en lenguaje de obra:** «¿De qué elementos?», «¿Qué datos deberían tener?», «¿Cuánto de qué?», «¿Separado por?».
- **Vista previa en vivo con los datos reales** mientras se elige: no se pulsa «Añadir» a ciegas.
- **El tipo de gráfico lo elige el sistema según la pregunta,** y se puede cambiar en «Más opciones».
- **«Más opciones»** va cerrado e incluye tamaño, máximo de grupos, línea de referencia, título y pregunta.
- **Título automático,** a partir de la pregunta y lo elegido, por ejemplo «Walls y Floors sin altura de solado».

### Nombres legibles

- Quitar el prefijo numérico de los parámetros DSI y ponerlos en palabras: `02_04_DSI_Area1` → «Área 1», con el código real visible al pasar el ratón.
- Agrupar el selector por su grupo de Revit, como ya hace «Parámetros del modelo».
- Marcar con un icono si el parámetro es **número** o **texto**.
- No ofrecer en «separado por» un parámetro con un valor distinto por elemento, ni en «cuánto» uno que no sea número.

### Plantilla «Auditoría de datos» de un clic

Botón en la cabecera del Tablero, junto a «Parámetros». Crea una sección con:
- el mapa categorías × parámetros DSI;
- la cifra «% de elementos completos»;
- la auditoría de los parámetros con menos datos;
- «valores raros» del código de partida.

Es el tablero listo para una reunión de coordinación.

## 3 · Orden recomendado

| Fase | Qué | Tamaño |
|---|---|---|
| A | Editor en dos pasos con las preguntas 1, 5, 9 y 11. Las 1 y 11 ya existen: es reordenar el editor, poner nombres legibles y la vista previa. | 1 sesión |
| B | Calidad de datos completa: mapa de calor (2), valores raros (3), plantilla de auditoría | 1 sesión |
| C | Cantidades y avance: histograma (6), los más grandes (7), dos medidas (8) y liberado (10) | 1 sesión |
| D | Códigos frente al itemizado (4): depende de la Planilla | aparte |

Todo sale de los datos que ya están en la nube (`postgresInventory`): no requiere servidor ni migración. Solo hay que publicar el visor.

## 4 · Decisiones del dueño

1. ¿Vale el editor en dos pasos («¿Qué quieres saber?» → datos → vista previa) en vez del formulario actual?
2. ¿Se deja el editor de hoy como «Tabla cruzada (libre)» dentro de la galería, o se quita?
3. ¿Qué preguntas faltan de la obra, por ejemplo por PK o progresiva, por vaciado o por fecha?
4. ¿Se publica antes la Auditoría ya hecha, para la reunión de hoy, o se espera a la fase A?
