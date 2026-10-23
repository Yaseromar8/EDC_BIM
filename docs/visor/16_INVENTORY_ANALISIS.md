# Inventory · análisis de cómo funciona hoy

22-oct-2026. Lectura del código publicado (`origin/main`) y **medición** sobre el inventario real de
producción de PQT8 (Frente Canal 19.889 elementos, Frente Drenaje 8.378), solo leyendo. No se ha tocado
código, salvo el botón «Quitar todas» (en local, §4).

Es la base de la investigación de filtros (doc 15): antes de añadir funciones, hay que saber qué hace bien y
qué hace mal lo que ya existe.

## 1 · Cómo funciona

```
Postgres (inventario por versión)
  → GET /api/inventory?model_urn=<frente>          (66 MB; cacheado por revisión desde f0cfec98)
  → App.jsx aplana cada elemento: propiedades «Categoría › Nombre» → columna «Nombre»
  → window.postgresInventory (+ IndexedDB)
  → Filters calcula qué elementos pasan (filtersCore)
  → InventoryDataGrid: filas = las que pasan Filters, refinadas por «Solo activos» y por la selección del 3D
       columnas · agrupar (1 nivel) · total al pie · editar 6 campos · exportar Excel · ventana aparte
```

| Pieza | Fichero | Qué hace |
|---|---|---|
| Carga y aplanado | `App.jsx:3060` y, de respaldo, `InventoryDataGrid.jsx:386` | una fila por elemento; cada propiedad pasa a columna **por su nombre, sin la categoría** |
| Filas visibles | `InventoryDataGrid.jsx:564` | resultado de Filters, luego «Solo activos» y aislamiento del 3D |
| Columnas | `ColumnConfiguratorModal.jsx` + `lib/inventoryConfig` | elegir y ordenar; se guardan en la vista guardada |
| Agrupar | `InventoryDataGrid.jsx:746–795` | un nivel; **se agrupa sola por «SubZona»** si existe un parámetro con ese nombre |
| Totales | `parseNumericCell` (`:234`) | suma lo que parezca número, sin mirar la unidad |
| Editar | `InventoryRow` (`:162`) | solo 6 columnas fijas: Material, Status, Costo, Notas, Proveedor, Fase; además edición en bloque y campos propios |
| 3D | `handleRowClick` (`:677`) y los eventos `inventory-*` | fila → selección en 3D; selección 3D → fila |
| Rendimiento | rejilla virtualizada (25 px por fila) | 19.889 filas sin problema |

## 2 · Lo medido en los datos reales

| | Canal | Drenaje |
|---|---|---|
| Elementos | 19.889 | 8.378 |
| Propiedades distintas (categoría + nombre) | 382 | 357 |
| Columnas que ofrece «Editar columnas» | **711** | — |
| Propiedades **constantes** (el mismo valor en todos los elementos que la tienen) | **149 (39 %)** | **138 (39 %)** |
| Nombres de propiedad que existen en **varias categorías** | 9 | 7 |
| Elementos donde dos categorías traen **el mismo nombre con valores distintos** | **42** | **29** |

Ejemplos del último punto: en el Canal, «Altura» vale `0.000 m` en una categoría y `0.900 m` en otra; en
Drenaje, `02_02_DSI_Longitud` vale `27.7025` en una y `0.000 m` en otra.

## 3 · Defectos y límites, por importancia

1. **Se pierde la categoría y un valor puede pisar a otro.** Al aplanar, la columna es solo el nombre. Si
   dos categorías tienen una propiedad con el mismo nombre, se queda la primera con valor. En 71
   elementos de PQT8 la tabla muestra un valor que no es el de la categoría que el usuario cree estar
   viendo. Para metrados esto es grave: puede sumarse la «Longitud» equivocada.
2. **711 columnas para 382 propiedades reales.** El configurador mezcla la columna aplanada («Área») con
   la del esquema («Cotas › Área»), así que aparecen duplicadas. Es el ruido que el propietario ve al
   abrir «Editar columnas».
3. **El 39 % de las propiedades no aporta nada** (valor constante), pero se ofrecen igual que las útiles.
   Es la «salud de parámetros» del doc 15.
4. **Todo marcado y sin «Quitar todas».** Arreglado en local (§4).
5. **Totales ciegos a la unidad.** Suma «m», «m²», «kg» o texto con número sin distinguir. Además, con
   formato `1.234,5` sumaría mal (trata la coma como separador de miles).
6. **Un solo nivel de agrupación**, sin subtotal por grupo, y el clic en el grupo solo lo pliega.
7. **Comportamiento atado a una obra.** El agrupado automático por «SubZona» busca el nombre de un
   parámetro de PQT8 (`00_05_DSI_SYP_SubZona`); las columnas editables son 6 nombres fijos.
8. **Dos caminos de aplanado distintos.** `App.jsx` y el respaldo de `InventoryDataGrid` limpian los
   nombres de forma diferente (prefijos de Civil 3D). Según cómo se abra el panel, las columnas pueden
   llamarse distinto.
9. **La columna «Material» propia sale vacía** en el 100 % de las filas: el material del modelo vive en
   otros parámetros (doc 12/15).

## 4 · Hecho hoy (en local, sin publicar)

- **«Quitar todas»** en «Editar columnas»: deja solo «Name» y desde ahí se marca lo que se quiere.
  `ColumnConfiguratorModal.jsx`, 14 líneas. Pasa ESLint y Vite lo compila; falta la prueba del propietario
  en `localhost:5173`.

## 5 · Qué significa para la investigación de filtros

El orden lógico, de menos a más:

1. **Que la tabla no mienta (1, 2, 8):** una columna = **categoría + nombre**, un solo camino de aplanado y
   sin duplicados. Todo lo demás (filtros avanzados, metrados, pivote) se apoya en esto.
2. **Salud de parámetros (3):** esconder por defecto lo constante y lo vacío, con el motivo a la vista.
3. **Números con unidad (5):** totales por unidad.
4. **Agrupación multinivel con subtotales y clic que resalta en 3D (6).**
5. **Consultas guardadas** (doc 15).
6. **Quitar lo atado a PQT8 (7):** lo propio de la obra como ajuste o plantilla.

Inventory y Filters CORE están **CLOSED**: cada punto necesita la autorización del propietario. El punto 1
toca la identidad de las columnas que también usan las vistas guardadas, así que hay que demostrar que las
vistas existentes siguen abriendo igual.
