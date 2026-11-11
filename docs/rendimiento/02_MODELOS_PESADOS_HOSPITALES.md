# 02 · ¿Aguantan Docs y View modelos pesados, como los de hospitales grandes? (10-nov-2026)

Pregunta del dueño: «nuestro Docs y visor ¿aguantarán modelos pesados de hospitales grandes? Creo que son los más
pesados».

**Respuesta corta:** **ver** el modelo, sí (lo dibuja el motor de Autodesk, el mismo de ACC). **Subirlo y traducirlo**,
sí, hasta 2 GB por fichero. **Su inventario (las propiedades en la tabla, filtros, Planilla, colores por dato), hoy
no**: falla en dos sitios nuestros, y uno de ellos puede tumbar el servidor entero (Docs incluido). Se arregla sin
cambiar de producto, pero hay que hacerlo antes de cargar un hospital grande.

Todo lo de abajo está leído en el código o medido en producción; lo proyectado se dice proyectado.

> **Corrección del 11-nov-2026, tras medir** ([03](03_INVENTARIO_SIN_MEMORIA.md)). La proyección de §2 era
> optimista: extraer costaba ~31 MB por cada 1.000 elementos, no ~17, así que el techo real estaba cerca de
> **40.000 elementos por modelo**, no en 100.000. El **paso 1 de §4 está hecho en local** (extraer y servir sin
> juntar el modelo en memoria; tope de 100.000 retirado). Siguen pendientes los pasos 2 y 3, y **el límite real para
> un hospital es ahora el navegador**, que sigue recibiendo el inventario entero.

## 1 · Eslabón por eslabón

| Eslabón | Cómo está hecho | ¿Aguanta un hospital grande? |
|---|---|---|
| **Subir a Docs** | Directo del navegador al almacén (GCS), por bloques y reanudable (`routes/uploads.py`); el servidor no toca los bytes | **Sí, hasta 2 GB por fichero** (`file_validator.ABSOLUTE_MAX_MB = 2048`). Un modelo central de más de 2 GB no entra |
| **Traducir** | Model Derivative de Autodesk, formato **SVF2** (`docs_cad.py:270`) | **Sí.** Es el servicio de Autodesk; un modelo grande tarda (decenas de minutos) y la pantalla lo espera |
| **Ver en el visor** | Autodesk Viewer 7 con SVF2, que carga por partes según la cámara | **Sí, con matices.** Es el mismo motor de ACC. Federar varios modelos grandes a la vez (Arquitectura + Estructuras + MEP) pide memoria del navegador y de la tarjeta gráfica: conviene cargar por disciplina o nivel |
| **Extraer el inventario** | `extract_metadata_task`: baja TODAS las propiedades a memoria (páginas de 500), más el árbol entero, y después las escribe | **No.** (a) Tope de **100.000 objetos** (`max_pages = 200`, `routes/inventory.py:631`): por encima falla con `INCOMPLETE_EXTRACTION_PAGE_LIMIT` (falla a la vista, no guarda un inventario a medias). (b) Corre **dentro del mismo proceso web**: lo que ocupa en memoria se lo quita a Docs y al visor |
| **Servir el inventario al visor** | `/api/inventory` arma la lista entera del frente, con todas las propiedades, en un solo JSON (hecho una vez por versión, `f0cfec98`) | **No.** Ver §2: un hospital no cabe en la memoria del servidor |
| **Tabla del inventario en el navegador** | Dibuja solo las filas visibles (`InventoryDataGrid.jsx:1245`) | **Sí** la tabla; lo pesado es bajar y leer el JSON (§2) |
| **El servidor** | Producción: **1 CPU, 2 GB, un proceso con 8 hilos** (`backend/package.json`, «1c-2g» en Render) para Docs + View + extracciones | Es el cuello: un trabajo grande de memoria tumba a todos (como las caídas del 14-oct por las láminas) |

## 2 · Lo que se midió, y lo que se proyecta

**Medido en producción** (docs/rendimiento/01 §2.3, frente Canal): 19.889 elementos → **66,5 MB** de JSON (**≈ 3,3 KB por
elemento**), y armarlo ocupó **~340 MB** de memoria del servidor (≈ 5 veces el JSON). Un proceso en reposo ocupa ~250 MB.

**Proyección** con esas mismas proporciones (el Canal es obra civil; un edificio suele llevar MÁS parámetros por
elemento, así que esto es optimista):

| Elementos del frente | JSON del inventario | Memoria para armarlo | En 2 GB (con ~250 MB ya ocupados) |
|---|---|---|---|
| 20.000 (Canal, hoy) | 66 MB | ~340 MB | cabe |
| 50.000 | ~165 MB | ~850 MB | justo, y sin margen si coincide con otra cosa |
| 100.000 | ~330 MB | ~1,7 GB | **no cabe**: el servidor se reinicia por falta de memoria |
| 200.000 | ~670 MB | ~3,4 GB | **no cabe** (y la extracción ya habría fallado por el tope) |

Un hospital grande, sumando disciplinas en un frente, está con facilidad entre 100.000 y varios cientos de miles de
elementos. **Esa cifra hay que confirmarla con un modelo suyo** (§4, paso 0): es lo que decide.

La extracción no está medida por separado, pero tiene la misma forma (todo en memoria a la vez: propiedades crudas,
árbol y filas armadas), así que su pico es del mismo orden o mayor.

## 3 · Qué se ve si hoy se carga un hospital grande

1. Subirlo y verlo en el visor: funciona.
2. La extracción del inventario: o falla con «límite de páginas» (más de 100.000 objetos), o, antes de llegar,
   **se queda sin memoria y Render reinicia el servidor**: Docs y View dejan de responder un rato para todos.
3. Si la extracción entrara, abrir el frente pediría un inventario de cientos de MB: el mismo riesgo de memoria, y
   en el navegador una espera larga la primera vez (luego queda en su caché).

## 4 · Qué haría, en orden (nada hecho todavía)

0. **Medir con un modelo real de hospital, en local.** Cuántos elementos, cuántos MB de propiedades, cuánta memoria
   pide la extracción y cuánto tarda el visor federando. Sin esto todo lo demás es proyección.
1. **Extracción por partes y con memoria constante.** Escribir cada página de propiedades en B1 según llega, en vez
   de juntarlas todas; con eso el tope de 100.000 deja de hacer falta. Es el cambio que más protege.
2. **La extracción fuera del proceso web** (una cola con su propio proceso, o un trabajo de Render aparte), para que
   un modelo enorme no pueda tumbar Docs ni el visor.
3. **El inventario al visor por partes.** Las columnas que se usan (nombre, categoría, nivel, estado, las de la
   Planilla) en la carga, y el resto de propiedades al pedirlas (al seleccionar o filtrar por ellas). Hoy se manda
   todo de golpe. Es lo que hace que abrir un hospital sea viable en el navegador.
4. **En el visor: cargar por disciplina o nivel** al federar modelos grandes, y la «gestión de memoria» del visor de
   Autodesk activada para esos frentes.
5. **Infraestructura**, solo si tras 1–3 sigue haciendo falta: un plan de Render con más memoria. Antes no: pagaría el
   síntoma y el diseño seguiría sin escalar.

Lo que no cambia: Docs para documentos, láminas y PDF no depende de esto, salvo que comparte el servidor (por eso el
paso 2).

## 5 · Lo que no sé

- No hay ningún hospital medido: las cifras de §2 son las del Canal escaladas.
- No sé cuántos parámetros por elemento traen sus modelos de hospital (familias MEP con muchos parámetros compartidos
  pesan bastante más que 3,3 KB por elemento).
- No probé el visor federando varios modelos de cientos de MB: depende del equipo de quien lo abre.
