# 38 · «Material: Volumen» sin plugin: el volumen desde la geometría — INVESTIGACIÓN Y MEDICIÓN

28-oct-2026. Solo investigación y medición, sin código en el producto. Sigue al doc 36: los entibados de la partida
2.1.2.1.5 se metran en Revit con **Material: Volumen**, y ese dato no llega a la web.

Pregunta del dueño: investigar algo que ayude a Docs y View mientras él hace otra actividad. Se eligió esta porque
hoy frena una partida en obra y puede ahorrar el plugin.

## 1 · ¿Hay un camino de Autodesk que ya lo traiga?

No se encontró ninguno:

| Camino | Qué dice la documentación | ¿Sirve? |
|---|---|---|
| Traducción de Autodesk (Model Derivative, SVF/SVF2) | Exporta parámetros. «Material: Volumen / Área» se calculan al vuelo para las tablas de materiales y no son parámetros. No hay opción documentada para incluirlos. | No |
| Exportación IFC con *base quantities* | Son cantidades del elemento entero (área, volumen), no por material. Las cantidades exactas por material no salen por *base quantities*; habría que reconstruirlas con los espesores de capa. | No por material; y además obliga a publicar IFC |
| Navisworks / Quantification | Las capas de elementos compuestos de Revit pueden no salir en NWC: recomiendan dividir en piezas en Revit. | No |
| Dynamo o plugin que copie el valor a un parámetro compartido | Es lo habitual: la API de Revit da `GetMaterialVolume` / `GetMaterialArea`, solo para categorías con cantidades de material. | Sí, pero hay que ejecutarlo antes de cada publicación (doc 36) |

## 2 · El camino nuevo: calcularlo desde la geometría que ya llega al visor

El visor recibe los triángulos de cada elemento. Si la malla es cerrada, la suma de los tetraedros que forman cada
triángulo con un punto fijo es su volumen exacto (divergencia). Autodesk lo publica como técnica para el visor; avisa
de que depende de la teselación.

### 2.1 · Cómo se midió

- En el banco local (`localhost:5181`), con la sesión del dueño, en **Frente Drenaje Urbano**: 5 modelos SVF2 en mm.
- Solo lectura; la pestaña se cerró al terminar.
- Para cada elemento que **sí** trae «Volumen» nativo de Revit, se calculó el volumen de su malla y se comparó.

### 2.2 · El detalle que decide si sale bien

- Un muro llega partido en **varios trozos por material**, y cada trozo por separado es una superficie abierta.
  - Calculado trozo a trozo: errores del 35–45 %.
  - Calculado con **todos los triángulos del elemento y un origen común**: la suma cierra.
  - Ejemplo: 223,845 − 222,749 = 1,096 m³, exactamente su «Volumen» de Revit (1,096).
- SVF2 guarda los vértices normalizados: la matriz del fragmento los escala (determinante ≈ 2·10⁹). Hay que aplicarla
  entera y respetar su signo (las piezas en espejo invierten los triángulos).

### 2.3 · Resultado: 1.207 elementos con volumen nativo

| Categoría | Elementos | ≤ 0,5 % | ≤ 1 % | ≤ 5 % | Mediana del error | Peor |
|---|---:|---:|---:|---:|---:|---:|
| Bordes de losa | 50 | 50 | 50 | 50 | 0,004 % | 0,0 % |
| Muros | 276 | 275 | 275 | 276 | 0,026 % | 4,4 % |
| Modelos genéricos | 318 | 254 | 282 | 318 | 0 % | 3,0 % |
| Suelos | 563 | 474 | 512 | 546 | 0,096 % | 58,1 % |
| **Total** | **1.207** | **1.053 (87 %)** | **1.119 (93 %)** | **1.190 (98,6 %)** | **0,024 %** | 58,1 % |

### 2.4 · Por qué fallan los que fallan

- **Modelos genéricos fuera del 1 % (36):** todos son piezas curvas diminutas (uniones de PVC de 0,003 m³). La malla
  siempre queda **por debajo**, hasta un 3 %: los triángulos recortan la curva. En piezas planas, como un entibado de
  planchas, este error no aparece.
- **Suelos fuera del 5 % (17):** la malla está cerrada y es estable. Lo distinto es lo que Revit llama «Volumen» en
  un suelo: **Área × Grosor** (2,3176 m² × 0,20 = 0,4635 m³, su valor exacto). La geometría dibujada es otra:
  - recortada por uniones con otros elementos (0,194 m³ frente a 0,464);
  - o con más material del nominal (1,216 frente a 0,949 en un solado «e = 0,10»).
  Aquí manda el nativo, que ya existe: el cálculo nunca lo sustituye.

## 3 · Lo que significa para la Planilla

- **Para los elementos sin medida nativa** (los entibados, las rejas), el volumen de la geometría acierta como Revit
  en la gran mayoría. Sin plugin, sin Dynamo, sin pasos antes de publicar, y para cualquier obra.
- **No sustituye a la medida nativa** (regla del dueño): solo entra donde no hay medida, como un criterio más de
  «medir con…».
- **Lo que no da:** el **volumen por material** de una pieza con varios materiales. Los trozos que llegan son grupos
  de caras por material, no sólidos por material (§2.2), así que no se puede repartir. Da el volumen de la pieza
  entera. Para un entibado de un solo material, eso **es** su «Material: Volumen».
- **El área** pide decidir qué área: la de todas las caras, la de una cara, o la proyectada. «Material: Área» de Revit
  depende de la familia. No se midió todavía.

## 4 · Cómo sería (propuesta, sin hacer)

1. En «medir con…», para unidades m³, un candidato más: **«Geometría › Volumen calculado»**.
   - Se ofrece solo para los elementos sin medida nativa.
   - Muestra cuántos se pudieron calcular y su suma, como cualquier candidato.
2. Se calcula en el visor, con los modelos cargados.
   - Unos 100 triángulos por pieza: miles de elementos en menos de un segundo.
   - Si la geometría de un modelo no está cargada, el elemento queda «sin medida» con su motivo. No se inventa.
3. En la Planilla, la cantidad lleva su marca propia (p. ej. **·geom.**) y el detalle dice «volumen de la geometría
   del modelo publicado». Así el revisor sabe que no es un parámetro de Revit.
4. Comprobación propia, sin IA: en cada obra, la Planilla puede medir el acuerdo en los elementos que sí traen
   volumen nativo (como §2.3) y avisar si en esa obra no cuadra.

## 5 · Decisiones del dueño

1. ¿Se acepta el **volumen de la geometría** como criterio de medida para elementos sin medida nativa (entibados,
   rejas), con su marca propia?
2. Si sí: ¿se calcula **solo en el visor** (al abrir la Planilla con los modelos cargados), o también **se guarda** con
   el inventario para que el Excel y otros usuarios lo vean igual sin cargar el 3D?
3. ¿Hace falta también el **área**? Si sí, ¿cuál (una cara, todas, proyectada)?
4. Con esto, el plugin del doc 36 queda solo para quien necesite **por material** en piezas de varios materiales.

## Fuentes

- Autodesk Platform Services: [Get volume and surface area in the viewer](https://aps.autodesk.com/blog/get-volume-and-surface-area-viewer)
- Revit API: [Material quantities](https://help.autodesk.com/view/RVT/2025/ENU/?guid=Revit_API_Revit_API_Developers_Guide_Revit_Geometric_Elements_Material_Material_quantities_html) y [Material Quantity Extraction (The Building Coder)](http://jeremytammik.github.io/tbc/a/0296_abg10_material_quantity.htm)
- buildingSMART: [cantidades por material en IFC](https://forums.buildingsmart.org/t/which-software-to-create-lists-of-quantities-of-the-used-building-materials/5181)
- Autodesk/revit-ifc: [Releases](https://github.com/Autodesk/revit-ifc/releases)
- One Click LCA: [cantidades por capa desde Navisworks](https://help.oneclicklca.com/en/articles/275844)
- iTwin.js: [sumTetrahedralVolumes](https://www.itwinjs.org/v3/reference/core-geometry/polyface/polyfacequery/sumtetrahedralvolumesstatic)
- Dynamo: [copiar parámetros con Dynamo](https://dynamobim.org/?p=43744)
- BIM Nature: [Revit: calculate the correct volumes](https://bimnature.wordpress.com/2018/01/22/revit-calculate-the-correct-volumes/)
