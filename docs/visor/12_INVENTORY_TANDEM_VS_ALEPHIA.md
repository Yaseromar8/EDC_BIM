# Inventory · Tandem frente a ALEPHIA, y qué mejorar

21-oct-2026. Análisis, sin cambios de código. Sustituye al borrador «metrado por material» de esta misma
fecha: el metrado es **un** uso de Inventory, no el tema.

## 0 · En una frase

Nuestro Inventory ya iguala a Tandem en lo básico y le gana en edición. Le faltan tres cosas que Tandem ya
tiene: agrupación anidada, la suma o el promedio elegidos por columna, e importar. Y lo que nos haría
**distintos** no está en Tandem: unir la tabla con lo que solo tiene un CDE de obra pública, como documentos,
observaciones, avance y calidad del dato.

## 1 · Fuentes

- **Tandem, observado** en la cuenta del propietario (facility `DRENAJE_URBANO`, 21-oct). Se vieron la
  barra y el menú del panel. Las filas **no se pudieron cargar**: con Floors, Building Element o Floor
  marcados en Filters, el panel siguió en «Change the current filters to display data». No se forzó más y los
  filtros quedaron restablecidos.
- **Tandem, nota de versión** de febrero en el foro de Autodesk, «Improvements to the Inventory Panel». Se
  conoce por el resumen del buscador, porque el foro devolvió 403: agrupar por cualquier parámetro, agrupación
  **anidada** y agregación **por columna** (suma, promedio…).
- **Tandem, novedades** en su página de inicio: Tickets, Metrics, Named States y Custom Formulas (sobre datos
  de operación y sensores, no sobre la tabla).
- **ALEPHIA, código publicado** (`origin/main`, `InventoryDataGrid.jsx` 1.470 líneas, `lib/inventoryConfig`)
  y **datos reales** del inventario de PQT8_TALARA: Canal 19.889 elementos, Drenaje 8.378.

## 2 · Qué hace cada uno hoy

| Función | Tandem | ALEPHIA |
|---|---|---|
| Filas = lo que deja pasar Filters | sí | sí |
| Elegir columnas | sí | sí |
| Agrupar por un parámetro | sí | sí, con grupos plegables |
| **Agrupar anidado** (nivel → tipo) | **sí** | no |
| Total al pie | sí («Show footer totals») | sí |
| **Totales por grupo** | **sí** («Show group totals») | no (solo recuento) |
| **Suma, promedio… por columna** | **sí** | solo suma |
| Solo activos | «Assets only» | «Solo activos» |
| Seguir la selección del 3D | «Follow selection», desactivable | sincronización siempre activa |
| Clic en fila → 3D | sí | sí |
| Exportar a Excel | sí | sí, con totales |
| **Importar** (actualizar parámetros desde un fichero) | **sí** | no |
| Editar celdas | parámetros de Tandem | sí: Material, Status, Costo, Notas, Proveedor, Fase |
| Edición **en bloque** y **crear un campo propio** | no visto | **sí** |
| Pestaña de incidencias | «Tickets» (CMMS) | no en la tabla |
| Guardar la configuración | en la vista | en la vista guardada (`inventoryConfig`) |
| Ventana aparte | sí | sí |

## 3 · Lo que hay que saber de nuestros datos

- La columna **Material** sale **vacía en el 100 %** de las filas de los dos frentes. El material está en
  `01_08_DSI_Material`, en «Material estructural» o en «Material», según quién modeló. En cuanto alguien
  agrupe por Material, verá un solo grupo vacío.
- Los volúmenes vienen como texto con unidad («1.234 m^3») y en varios parámetros (`Cotas › Volumen`,
  `02_05_DSI_Volumen`, `Dynamo_Volumen`). El acero trae longitud, diámetro y peso, y se metra en kg.
- 5.666 elementos del Canal tienen el material sin asignar («-» o «<Por categoría>»).

Para una obra pública, esto importa más que cualquier función nueva: **una tabla que suma mal o agrupa vacío
es peor que no tenerla**.

## 4 · Qué mejorar, por orden

### A · Ponernos al día con Tandem (lo que ya existe en el mercado)

1. **Totales por grupo** y **suma, promedio, mínimo, máximo o recuento por columna**.
2. **Agrupación anidada**: dos o tres niveles.
3. **Importar desde Excel** para actualizar parámetros en bloque (estado, vaciado, avance), con vista previa de
   lo que cambia antes de aplicarlo.
4. Interruptor **«Seguir selección»**, para poder recorrer la tabla sin que el 3D la cambie.

### B · Que la tabla diga la verdad (calidad del dato)

5. **Parámetros equivalentes por obra.** Se declara una vez que «Material» = `01_08_DSI_Material` →
   `Material estructural` → `Material`, y lo mismo para Volumen y Área. Lo hace el administrador de la obra,
   porque cada consultora usa los suyos.
6. **Números con unidad.** Leer «1.234 m^3» como 1.234 m³ y totalizar cada unidad aparte, sin mezclar m³ con
   kg.
7. **Aviso de huecos.** Un contador visible de «sin material», «sin volumen» o «sin nivel», con clic para
   verlos en 3D. Es lo que se revisa antes de una valorización.

### C · Lo que nos hace distintos (no está en Tandem)

8. **Clic en un grupo → se aísla y colorea en 3D**, con la cámara hacia él. La tabla deja de ser una lista y
   pasa a ser una forma de navegar el modelo.
9. **Documentos de cada elemento.** Una columna con los planos, especificaciones y RFI enlazados en Docs; un
   clic abre el lector. Tandem tiene Tickets de mantenimiento, y nosotros tenemos el expediente técnico.
10. **Observaciones de la supervisión** sobre los elementos (las de Docs, `doc_issues`), con su estado y su
    plazo.
11. **Avance y valorización.** Las columnas de estado y vaciado, ya editables, alimentan Avance y PREDICT; con
    la importación (A3), la oficina técnica actualiza cientos de filas de una vez.
12. **Comparar versiones.** Qué filas aparecen, desaparecen o cambian de valor entre dos versiones del modelo.
    Ya existe el comparador 3D, pero falta su lado en la tabla.

### D · Más adelante

13. **Columnas calculadas** (volumen × precio, peso × longitud).
14. **Tablas con nombre** por obra (no solo dentro de una vista guardada).
15. Metrado exacto **por capas** pidiéndoselo a Revit con el plugin ECDLink (`GetMaterialVolume`); solo si
    hace falta.

## 5 · Qué toca cada bloque

- **Inventory (lectura e identidad, B1) y Filters CORE están CLOSED.** Ningún punto de la lista cambia la
  identidad ni la lectura, pero todos añaden funciones al panel: hace falta la autorización expresa del
  propietario para reabrirlo (AGENTS §4.4).
- **A, B y C8** son solo del visor: no tocan el backend ni la base de datos.
- **A3** (importar) escribe por la ruta de edición que ya existe (`PATCH /api/inventory/bulk`).
- **C9 y C10** necesitan una consulta nueva en el backend (elemento → documentos u observaciones), sin
  migración si el enlace ya existe.

## 6 · Recomendación

Primero **B5–B7 y C8**: hacen que lo que ya tenemos funcione bien con los datos reales de la obra, y son la
base de todo lo demás. Después **A1–A2**. Luego **C9–C11**, que es donde ALEPHIA deja de parecerse a Tandem.
Todo en local, con banco de pruebas y sin publicar hasta que lo apruebe el propietario.

## 7 · Decisiones del propietario

1. ¿Autoriza reabrir Inventory para el primer bloque (B5–B7 + C8)?
2. ¿El panel conserva el nombre «Inventory» o pasa a uno propio?
3. ¿Qué es más útil en obra después: documentos y observaciones por elemento (C9–C10) o importar y avance
   (A3 + C11)?
