# Escala de letra de ALEPHIA (Docs y View)

31-oct-2026. Aprobada por el dueño («okey, vamos») tras preguntar por qué el texto de ACC se ve más nítido que el
nuestro en todo Docs y View.

## Por qué

Medido, no supuesto (commit `8df97083`):

- **No era la letra mal cargada.** La IBM Plex Sans que servimos (`design/fuentes`) es la fuente variable: a 40 px el
  mismo texto mide 451,7 · 458,5 · 468,6 · 475,1 · 482,0 px a los pesos 300–700, así que todos los grosores son reales.
- **No era el color.** En Chrome a 125 % (la escala de la pantalla del dueño) el trazo llega al #3C3C3C igual a 12,5,
  13 y 14 px.
- **Era el tamaño.** Docs tenía unos 1.300 textos entre 9 y 13,5 px y solo 84 a 14; View, unos 590 y 53. ACC usa
  14 px para casi todo el texto de la interfaz. IBM Plex, más estrecha y fina que la letra de Autodesk, se ve débil
  por debajo de 14 px en Windows. En las capturas del dueño, a igual ancho de menú, las líneas de ACC eran ~1,5 veces
  más altas y nuestro trazo nunca llegaba a la tinta (luminancia del núcleo 110 frente a 73).

## La regla

| Uso | Tamaño |
|---|---|
| Texto normal: tablas, menús, botones, formularios | **14 px** |
| Texto secundario: ayudas, fechas, pies | **13 px** |
| Mínimo: etiquetas pequeñas, chapas, mayúsculas de sección | **12 px** |
| Medios píxeles (12,5 · 11,5 · 10,5) | **nunca** |

Aplicada a todo con la misma regla: 9–11,5 → 12 · 12–12,5 → 13 · 13–13,5 → 14 · 14 o más, igual (JSX `fontSize`,
CSS `font-size` y el atajo `font:`). Lo que se escriba a partir de hoy sigue la tabla.

**Fuera de la regla, a propósito:**
- lo que no es pantalla: estilos de los PDF que genera jsPDF / autoTable y `setFontSize`;
- el «PDF» dibujado dentro del icono de fichero (es parte del icono);
- los textos del propio visor de Autodesk (ayudas de su barra: «Órbita libre», «Primera persona»…);
- los ficheros protegidos (4D LOB, barra de etiquetas, Predict, fachada del visor APS).

**Única excepción:** el pie de icono del rail de View, **11 px** seminegrita sin espaciado. El rail mide 64 px y
«Seguimiento» a 12 px mide 69–72: no cabe. A 11 px mide 62–64, como los pies de icono de la paleta de Forma.
Ensanchar el rail tocaría el visor 3D, el Tablero y App.jsx (con trabajo ajeno): no compensa por un pie de icono.

## Commits (rama local `publicar-30oct`, sin push)

- `8df97083` menús del lienzo a 14 / 13 px.
- `adb74f90` Docs: 89 ficheros, 1.383 cambios.
- `2434e13b` View: 60 ficheros, 638 cambios, con la excepción del rail y los títulos de las tarjetas del Tablero en
  hasta dos líneas antes de cortar (a 14 px dos títulos de tarjeta pequeña quedaban en «…»).

Cada fichero se cambió desde su versión de la rama: el trabajo ajeno sin commitear de esos mismos ficheros no sube.

## Evidencia (Chrome sin ventana, 1536 × 816 a 125 %, antes y después)

| Pantalla | Textos que no caben en su caja | Tamaño mínimo visible |
|---|---|---|
| Docs · Archivos (FilesPage real) | 18 → 18 | 8,8 → 8,8 (solo el «PDF» del icono; el resto ≥ 12) |
| Docs · tabla de ficheros | 12 → 12 | 10 → 12 |
| Docs · Revisiones | 3 → 3 | 11 → 12 |
| Docs · Flujos, Plan, Subida, Entrada | 0 → 0 | 10–13 → 12–14 |
| View · inicio / Filters / Tablero (sesión del dueño, guardados bloqueados) | 0 / 6 / 11 → 0 / 6 / 10 | 9,5 → 11 (el rail) |
| View · rail | 12 de 12 pies dentro del rail, 0 solapes | |

Ningún texto cortado nuevo; los que ya estaban cortados (cabeceras estrechas, fechas largas) siguen igual. Pruebas de
View de AGENTS.md (63/63, 150/150, 111/111, 20/20, 20/20) y del lienzo (5/5, 10/10, 6/6) en verde; las dos
aplicaciones compilan desde la rama.

## Pendiente, aparte

- **La barra inferior de View en el teléfono ya estaba rota antes de la escala:** 12 botones en 390 px, etiquetas
  apretadas y cortadas por abajo, y «Agrupación» se solapa con «Corte». Se dejó con sus tamaños de antes (9 / 8 px)
  para no empeorarla; necesita su propio diseño (pocos botones fijos y el resto en «Más», como las apps móviles).
- Los textos que ya venían cortados (p. ej. «Estado ISO 19650», «Finalizada el», fechas largas en columnas estrechas)
  son de ancho de columna, no de letra: van en su propia pasada.
