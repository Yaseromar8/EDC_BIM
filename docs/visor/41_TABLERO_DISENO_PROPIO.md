# 41 · Tablero: que sea nuestro, que encaje y cuadre — DIAGNÓSTICO Y PROPUESTA DE DISEÑO

29-oct-2026. Solo análisis, sin código. El dueño: «antes de enlazarlo quería ver cómo podemos hacer más profesional y
nuestro ese tablero, algo más vistoso, que todo encaje y cuadre». Sigue al doc 40, que trata el enlace con la Planilla
y se deja para después.

Reglas que aplican:
- **paleta oficial de Claude** (D-24);
- **IBM Plex Sans** (D-26);
- **rediseño sobrio**: misma estructura y funciones, sin nada que parezca hecho con IA (brillos, cristal, emojis,
  píldoras);
- **se conserva el lienzo tipo Miro y las secciones**, que pidió el dueño.

## 1 · Cómo se ve hoy (medido en el banco, con la sesión del dueño)

Frente Drenaje Urbano, tablero «General» (una sección y el nodo de parámetros). Se crearon dos gráficos de prueba,
uno de barras con «04_22_DSI_Restriccion» y una dona con «Planilla › Estado frente al itemizado»:
- **el guardado se bloqueó en la pestaña**: 3 PUT interceptados;
- al recargar, el tablero de producción seguía igual.

| # | Hallazgo | Dónde |
|---|---|---|
| 1 | **Parece otro producto.** 87 colores escritos a mano en tres ficheros y ningún token del sistema. Gris azulado (#171c24, #5f6b7a), mientras el resto de View usa el gris cálido de la paleta (#141413, #72706b). Radio 14 frente a 8, y botón principal azul marino frente a Dark | `DashboardWorkspace`, `ChartCard`, `ChartEditor` |
| 2 | **Paleta propia de 15 colores**, con violetas y rosas. El violeta se quitó de la identidad | `engine.js · PALETTE` |
| 3 | **Los mismos datos, con colores contrarios a los de la Planilla.** «Con partida» es azul aquí y verde en la Planilla; «fuera del itemizado» es violeta aquí y rojo allá | dona de prueba |
| 4 | **Barras de una sola serie con un color distinto por barra.** El color no dice nada | barras de prueba |
| 5 | **La dona no enseña cifras**: ni el total ni el %. Hay que pasar el ratón. La leyenda se corta («…o sin códi») | dona de prueba |
| 6 | **Nombres crudos.** El título dice «Planilla::Estado frente al itemizado»; los valores salen como «No / Yes», en inglés, tal como vienen de Revit | ambos |
| 7 | **Cada gráfico nuevo cae encima del anterior**: se inserta en el centro de la vista | lienzo |
| 8 | La línea de arriba mezcla datos y ayuda: «8,378 elementos · 711 propiedades · fuente… · rueda: zoom · fondo: mover» | cabecera |
| 9 | El nodo «Parámetros» empieza con una lista de parámetros al 100 %, que no dice nada. Son 711 sin agrupar | nodo Parámetros |
| 10 | El color de cada sección va por turnos (la primera salió rosa) y no tiene significado | secciones |

Lo que funciona bien y se conserva:
- el lienzo, las secciones y el ajuste a la cuadrícula;
- la pregunta de cada gráfico y la línea de referencia;
- los chips de filtro rápido;
- el clic en una barra, que aísla sus elementos;
- la completitud de cada parámetro;
- que la letra ya es IBM Plex Sans.

## 2 · La propuesta: un solo sistema visual con la Planilla

### 2.1 · Colores con significado (la regla que hoy falta)

1. **Los estados llevan siempre los colores de la Planilla y de Filters.** Habría una sola tabla de colores para los
   tres. Hoy ya existe `COLORES_ESTADO` en `lib/camposDerivados.js`.
2. **Una sola serie, un solo color**: Gris 700 (#52524d). La barra elegida va en Blue (#6a9bcc), que en la paleta es
   el color de selección.
3. **Categorías sin significado propio**: como mucho 6 colores sacados de la paleta oficial y sus derivados
   (Orange, Blue, Green, Mid Gray y sus 30D). Lo que sobra va en «Otros», en gris claro.
4. **Nada de violeta ni de rosa.**

### 2.2 · Todas las tarjetas iguales (para que cuadre)

Cada tarjeta tiene siempre cuatro partes, en el mismo orden:

1. **Cabecera**: título en minúscula de oración y, debajo en gris, la pregunta que responde.
2. **Cifra principal** (si la hay): el total o el % que importa, grande. Es el patrón «números» de Bach y Few.
3. **Gráfico**:
   - **barras horizontales ordenadas por valor**, con **la cifra al final de cada barra** (sin tener que leer el eje);
   - «Otros» siempre al final;
   - la dona solo para dos a cuatro partes, con el total en el centro y el % en la leyenda;
   - el KPI con su **barra de avance contra la referencia** (*bullet graph* de Few), no un número suelto.
4. **Pie de metainformación**, pequeño: fuente · filtro aplicado · N elementos · versión del itemizado · hora de
   actualización. Es el patrón «metainformación» de Bach; hoy no existe.

Además:
- **Nombres legibles**: «Planilla › Estado frente al itemizado» en vez de «Planilla::…». «Sí / No» en vez de
  «Yes / No». La unidad junto a la cifra.
- **Mismos tokens que la Planilla**:
  - página Light #faf9f5 y tarjetas blancas con borde Light Gray #e8e6dc;
  - radio 8 y sin sombras;
  - texto Dark #141413, secundario #72706b;
  - botón principal Dark.

### 2.3 · Lienzo que se ordena solo (sin perder el lienzo libre)

- **Tamaños fijos de tarjeta** sobre la cuadrícula: S (1 columna), M (2) y L (3). Con un espacio fijo entre tarjetas
  se alinean siempre los bordes. El ajuste a la cuadrícula ya existe (16 px); se suman los tamaños.
- **Una tarjeta nueva entra en el primer hueco libre** de la sección visible, nunca encima de otra.
- **Botón «Ordenar sección»**: acomoda sus tarjetas en filas, de arriba abajo y de izquierda a derecha. La posición
  libre se sigue pudiendo mover a mano.
- **Secciones sobrias**: título en Dark con una línea fina de color a la izquierda y fondo Light 50 (#f1f0e8). Nada de
  fondos rosados. El color de la sección lo elige el usuario de una lista corta de la paleta.

### 2.4 · Cabecera y nodo «Parámetros»

- **Cabecera**:
  - a la izquierda, el nombre del tablero y su selector;
  - a la derecha, una sola acción principal «Gráfico» y las demás discretas;
  - debajo, solo datos: «8.378 elementos · inventario de la nube · actualizado 10:42»;
  - la ayuda («rueda: zoom…») pasa a un ⓘ.
- **Nodo «Parámetros»**:
  - agrupado por grupo de Revit (Datos, Cotas, Planilla…);
  - **los incompletos primero**, que es lo que interesa revisar;
  - un icono de número o texto y cuántos valores distintos tiene cada parámetro, para saber qué gráfico sale.

## 3 · Qué NO se hace

- No se cambia el motor de gráficos (Chart.js), ni el lienzo, ni el formato guardado. Los tableros guardados se
  abren igual: solo cambia cómo se dibujan.
- No se enlaza todavía con la Planilla ni con Filters (doc 40). Va después, sobre esto.
- Sin animaciones decorativas, brillos, degradados ni sombras.

## 4 · Orden

| Paso | Qué | Ficheros |
|---|---|---|
| 1 | Tokens y paleta: quitar los 87 colores a mano y usar el sistema; la tabla de colores de estado compartida con la Planilla | los tres de `dashboard/`, `chartjsTheme.js`, `engine.js` |
| 2 | La tarjeta común: cabecera, cifra, gráfico y pie; nombres legibles; barras con cifra; dona con total | `ChartCard.jsx` |
| 3 | Lienzo: tamaños S/M/L, primer hueco libre, «Ordenar sección», secciones sobrias | `DashboardWorkspace.jsx` |
| 4 | Cabecera y nodo «Parámetros» | `DashboardWorkspace.jsx`, `ChartCard.jsx` |

Todo en local, comprobado en el banco con el guardado bloqueado en la pestaña (como en §1), y enseñado al dueño antes
de publicar nada.

## 5 · Decisiones del dueño

1. ¿Te gusta la dirección de la maqueta (en el chat)?
2. ¿Tamaños fijos S/M/L con «Ordenar sección», o prefieres seguir con el tamaño totalmente libre?
3. ¿La dona se queda solo para dos a cuatro partes, o la quitamos y siempre barras?

## 6 · Hecho en local (29-oct-2026, sin commit)

El dueño: «claro, recuerda respetar la paleta de colores». En lo no respondido se aplicó lo recomendado:
- tamaños fijos S/M/L con «Ordenar», sin quitar el mover a mano;
- la dona como mucho con tres partes y «Otros».

| Fichero | Qué |
|---|---|
| `dashboard/tema.js` (nuevo) | Paleta oficial y derivados en un solo sitio. Paleta de categorías: 7 colores oficiales o derivados, y los mismos mezclados al 50 % con Light (el método de la lista cerrada). Colores de estado = `COLORES_ESTADO` de la Planilla. Nombres legibles («Planilla › …», «Sí/No»). Tamaños S/M/L sobre columnas de 320 con huecos de 16 |
| `engine.js` | Sin paleta propia. La dona agrupa en tres más «Otros». **Pintar en el 3D usa los mismos colores del gráfico** |
| `chartjsTheme.js` | Ejes, rejilla y aviso con los colores del tema |
| `ChartCard.jsx` | La tarjeta común: cabecera (título y pregunta), cuerpo y **pie con la fuente, los elementos y la hora**. Además: <ul><li>barras con la cifra al final, un solo color salvo campos con colores propios, y lo elegido en azul;</li><li>dona con el total en el centro y leyenda completa con cifra y %;</li><li>cifra con barra contra la meta;</li><li>parámetros agrupados por grupo de Revit, los incompletos primero, con tipo y número de valores;</li><li>sin sombras y con radio 8</li></ul> |
| `ChartEditor.jsx` | Colores del tema, etiquetas en minúscula de oración. Nuevo: tamaño (pequeño/mediano/grande) y meta para la cifra |
| `DashboardWorkspace.jsx` | <ul><li>cabecera sobria con una sola acción principal en Dark («Nuevo gráfico»);</li><li>barra de datos sin la ayuda (pasa a un ⓘ);</li><li>**tarjeta nueva en el primer hueco libre**;</li><li>**«Ordenar»**: filas por sección, anchos S/M/L, la misma altura en cada fila y secciones viejas de 992 ensanchadas a tres columnas;</li><li>al redimensionar, el ancho salta a S, M o L;</li><li>secciones con fondo Light 50 y una línea de color;</li><li>lienzo Light con cuadrícula cálida</li></ul> |

**Sin colores fuera de la paleta**: comprobado con una búsqueda de `#rrggbb` (solo los tiene `tema.js`). Los `rgba` son
oficiales con opacidad.

**Verificado en el banco** (`localhost:5181`, sesión del dueño, Frente Drenaje Urbano, 8.378 elementos), con el
**guardado bloqueado en la pestaña**: se interceptaron los PUT a `/api/dashboards`, y el tablero «General» de producción
no se tocó.
- Barras por «Planilla › Estado frente al itemizado» con los colores de la Planilla: 4.159 + 2.553 + 1.201 + 465 =
  8.378, igual al pie.
- Dona de «04_22_DSI_Restriccion»: total 8.378 en el centro; «No 8.064 · 96 %» y «Sí 314 · 4 %».
- Un tablero guardado de antes (cuatro tarjetas amontonadas en una sección de 992) se abre sin error. Con «Ordenar»
  quedan tres tarjetas S en una fila de la misma altura y la cuarta debajo, y la sección pasa a 1.024.
- La tarjeta nueva entró en el hueco libre, sin tapar a otra.
- El clic en una barra aísla en el 3D y atenúa el resto. «Pintar» colorea el 3D con los colores del gráfico.
- Sin errores en la consola. `vite build` sin errores. eslint: solo el aviso de `FONT_TITLE` exportado, que ya estaba.
- Defectos encontrados y arreglados en la prueba:
  - etiquetas de barra cortadas en tarjetas S (ahora se recortan según el ancho);
  - el «%» de la tabla saltaba de línea;
  - la cifra se aplastaba en 176 px (alto mínimo por tipo al ordenar);
  - la fila de filtros enseñaba una barra de desplazamiento.

**Falta**: que el dueño lo vea y lo apruebe. Después, commit (sin el WIP ajeno), push y despliegue del visor.
