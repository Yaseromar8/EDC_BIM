# Inventory · qué parámetros extraemos y cuáles sirven

23-oct-2026. Medido sobre el inventario real del **Frente Drenaje Urbano** (8.378 elementos, leído
desde el banco en solo lectura) y sobre el propio modelo en el visor (432 elementos de muestra).
Pregunta del propietario: ¿por qué salen parámetros «raros» (Envolvente en inserciones, Grosor
predeterminado…), es así en ACC y Tandem, y qué nos interesa de verdad de cada elemento?

## 1 · De dónde salen

`backend/routes/inventory.py` → `extract_metadata_task`:

1. Pide a Autodesk **todas** las propiedades de la vista 3D (`properties:query` con `query: {}`, paginado).
2. Para cada elemento **fusiona** las propiedades de todos sus antecesores en el árbol del modelo
   (`deep_merge` de la ruta raíz → categoría → familia → tipo → elemento): la «Fusión Genética».
3. Guarda solo valores no vacíos y solo instancias (descarta tipos, categorías, líneas, sistemas MEP
   y ejes de tubería).

No hay ningún filtro de qué parámetros interesan: entra todo lo que Revit exporta.

## 2 · Qué son los «raros»

**No son ocultos ni inventados: son parámetros reales de Revit.** El visor de Autodesk los enseña en el
panel de propiedades del elemento: 331 de nuestras 357 propiedades aparecen tal cual en
`getProperties` de LMV (que ya incluye lo heredado del tipo). Es lo mismo que ve el panel de
propiedades de ACC al seleccionar un elemento.

| Parámetro | Qué es en Revit | Con dato | Valores |
|---|---|---|---|
| Construcción › Envolvente en inserciones | muro: cómo envuelven las capas en huecos | 3,3 % | Interior 152 · Ambas 124 |
| Construcción › Envolvente en extremos | muro: envolvente en los extremos | 3,3 % | Interior (siempre) |
| Construcción › Grosor predeterminado | espesor del tipo de suelo/muro | 6,7 % | 0,200 m ×401 · 0,100 m ×69 … |
| Construcción › Partición | armadura: partición del juego | 0,8 % | MUROS · TECHO … |
| Construcción › Instrucciones de taller | armadura | 2 elementos | «Mantener recto» |
| Propiedades analíticas › Coeficiente de incremento de calor solar | análisis energético del tipo | 1 elemento | 0,000 |
| Texto › Refuerzo | parámetro de familia | 0,2 % | A |

**Los ocultos de verdad** (`__parent__`, `__viewable_in__`, `__categoryId__`, `__internalref__`) LMV los
marca `hidden` y **no** llegan a nuestro inventario. Los únicos internos que hay son los nuestros
(`__category__`, `__node__`), que la tabla no enseña.

## 3 · Lo que sí está mal: datos del proyecto copiados en cada elemento

26 propiedades no son del elemento sino del **proyecto**: Nombre de cliente, Estado / Nombre / Número /
Dirección / Fecha de emisión de proyecto, Autor, Nombre del edificio, Organización, IfcProject /
IfcSite / IfcBuilding GUID… La fusión las copia desde la raíz del árbol a los 8.378 elementos. Mismo
valor en todos: ruido en la tabla y en la base (×8.378).

## 4 · Cuántas sirven (8.378 elementos, 357 propiedades, 71 por elemento de media)

| Clase | Propiedades | Ejemplos |
|---|---|---|
| Con dato en ≥ 5 % de los elementos **y** que varían | **128** | Cotas › Área/Volumen/Longitud, Datos › 01_14_DSI_SubZona (9 valores), 01_02_DSI_Localizador (50+), 02_07_DSI_MetradoPartida |
| Mismo valor en todos los que la tienen | 138 | Función, Relacionado con masa, Exportar a IFC, Imagen de tipo, las 26 del proyecto |
| Con dato en < 1 % | 124 | Partición, Instrucciones de taller, Refuerzo, parámetros de forma de armadura |
| Parámetros del proyecto (DSI) | 96 | grupos Datos y Construcción |

**Hallazgo de datos, no de software:** `Construcción › 04_10_DSI_MetradoContractual` vale **0,000 en los
8.378 elementos**; y `02_07_DSI_MetradoPartida` vale 0,000 en 5.940 de 6.410. En el modelo no está
cargado. Se informa, no se toca.

Por grupo de Revit (propiedades · útiles): Datos 76 · 46 · Cotas 51 · 21 · Construcción 50 · 21 ·
Restricciones 33 · 3 · Otros 28 · 6 · Datos de identidad 24 · 8 · Texto 16 · 5 · Mecánica 14 · 0 ·
Parámetros IFC 11 · 2 · Estructura 10 · 2 · Mecánico-Flujo 9 · 0 · Propiedades analíticas 9 · 5 · resto 1–5.

## 5 · ACC y Tandem

- **Tandem** (medido en la cuenta del propietario, doc 18 §7): expone **más** que nosotros —2.560
  columnas en HOSPITAL—, pero **ordenadas**: secciones Standard (12) · Applied · Revit Element (1.262) ·
  Revit Type (1.298); la categoría debajo de cada propiedad, la unidad en el nombre, buscador; y la tabla
  arranca con **12 columnas**, no con todas. Separa ejemplar y tipo.
- **ACC**: el panel de propiedades de un elemento enseña la lista completa agrupada por grupo de Revit
  (Construcción, Cotas, Datos…), con los mismos «raros».

Conclusión: **ninguno esconde parámetros; los ordenan y empiezan con pocos.** Nuestro fallo no es
extraer de más: es enseñarlo todo a la vez, sin orden, con la clave interna (`Construcción::Partición`)
y con los datos del proyecto repetidos.

## 5 bis · Tandem, medido por su propia API (23-oct-2026)

Leído en solo lectura con la sesión del propietario (`aus.tandem.autodesk.com/api/v1/modeldata/{modelo}/schema`),
facility **DRENAJE urbano**, que contiene **un** RVT: `500125-CSSP001-780-XX-DR-HD-011264@011268.rvt`.

**Extrae todo, más que nosotros:** 1.022 parámetros de un solo RVT, en 52 grupos (nosotros: 357 de tres
RVT). Grupos más grandes: Gráficos 141 · Otros 131 · Cotas 95 · Materiales y acabados 82 · Datos de
identidad 80 · Datos 61 · Construcción 52 · Restricciones 45 · Texto 42 · Análisis energético 32 · Mecánica
26 · Parámetros IFC 19 … también Cámara, Visibilidad, Unidades principales.

**Los «raros» están igual:** Construcción › Envolvente en inserciones, Envolvente en extremos, Grosor
predeterminado (con unidad «meters»), Partición. También los del proyecto (Autor, Nombre / Número /
Estado / Dirección / Fecha de emisión de proyecto, Nombre de cliente, Organización, IfcProject GUID).
Si van en cada elemento o solo en el de «Información de proyecto» **no se comprobó** (habría que leer
los elementos, no el esquema).

**Cómo los ordena** (cada parámetro es un registro con estos campos: `fam`, `category`, `name`,
`displayName`, `dataType`, `forgeUnit`, `flags`, `context`…):

| Familia | Nº | Qué es | En «Edit columns» |
|---|---|---|---|
| `r` | 949 | parámetros de Revit, con su grupo de Revit como `category` | Revit Element / Revit Type |
| `n` | 24 | estándar de Tandem: Name, Elevation, Tandem Category, Category/Family… | Standard |
| `z` | 22 | parámetros propios de la facility (plantilla): Expected Life, Warranty Start Date, Air Flow… con `context` t (tipo) / e (elemento) | Applied |
| `l` | 8 | **enlaces**: Parent, Level, Rooms, **Family Type** (del elemento a su tipo) | — |
| `x`, `s`, `0` | 19 | referencias externas, estado, geometría (Fragment, Bounding Box…) | — |

- **Nombre interno en inglés, nombre visible en el idioma del modelo** (`Default Thickness` → «Grosor
  predeterminado»); el grupo es el de Revit (Cotas, Construcción…), como el nuestro.
- **La unidad es un dato del parámetro** (`forgeUnit`: squareMeters, cubicMeters, meters, liters…; 245 de
  949), no un texto pegado al valor. Nosotros la sacamos leyendo «4.112 m^2».
- **Mismo nombre en dos grupos = dos parámetros** (Cotas › Volumen en m³ y Mecánica › Volumen en litros),
  como nuestras columnas con categoría.
- **Ocultos** marcados con `flags` 1/9 (34: `__parent__`, `__internalref__`, `__revit__ ElementId`…): no se
  enseñan. Coincide con los que LMV marca `hidden` y que a nosotros no nos llegan.
- **Ejemplar frente a tipo:** el tipo es un elemento aparte y cada ejemplar lo enlaza (`Family Type`); por
  eso Tandem puede enseñar una sección «Revit Type». Nosotros copiamos lo del tipo dentro de cada ejemplar
  (la fusión del extractor) y ya no se puede separar.

**Conclusión:** Tandem no filtra parámetros en la extracción: guarda todo y lo **ordena** (familia, grupo,
nombre visible, unidad como dato, ocultos marcados, tipo enlazado) y la tabla arranca con pocas columnas.
Lo nuestro extrae lo mismo; lo que nos falta es ese orden en la pantalla.

## 6 · Propuesta (genérica: sirve para cualquier obra y modelo, sin IA)

1. **Extractor:** los datos del proyecto se guardan una vez por modelo, no en cada elemento. Backend,
   en local; los modelos se reextraen al aplicarlo.
2. **Catálogo de columnas** calculado de los datos (regla fija, verificable): por propiedad, su grupo de
   Revit, su unidad, % de elementos con dato y nº de valores distintos.
3. **Selector propio** (filtro, «Añadir nivel», «Editar columnas»): buscador; nombre grande y
   «grupo · % con dato» debajo; secciones **Nuestras · Con dato · Por grupo de Revit**; las de < 1 % y
   las de valor único, al final y atenuadas (no se esconden).
4. **Columnas al abrir:** las nuestras (Name, Material, Status, Vaciado_Nro) + las que tienen dato en
   una parte real de los elementos y varían, hasta ~15 por orden de cobertura. Las demás, a un clic.
5. **Después (Fase B):** el servidor envía solo las columnas pedidas (escala a 20.000+ elementos).

Lo que **no** se puede distinguir hoy con nuestros datos: ejemplar frente a tipo (la fusión y LMV los
mezclan). Tandem lo separa porque lo lee de otra fuente; se deja anotado, no se promete.

## 7 · Aplicado (23-oct-2026, en local) · nombre propio: «Planilla»

Decisión del propietario: no copiar los nombres de Tandem. El módulo se llama **Planilla** (barra lateral,
título del panel y de la ventana aparte) y los textos visibles son nuestros: Seguir el 3D, Filtrar selección,
Exportar Excel, Sumas, Id. elemento, Abrir en otra ventana. Las claves internas, eventos y la configuración
guardada no cambian.

Sin tocar la extracción ni ningún dato:
- `lib/inventoryCatalogo.js` (19/19): por campo, nombre limpio, grupo, unidad, % con dato y clase
  (propio · útil · mismo valor en todos · casi sin datos · interno). Drenaje: catálogo en ~0,4 s.
- `SelectorDeCampo.jsx`: buscador sin tildes por nombre, grupo o unidad; secciones Planilla · Con más datos ·
  grupos de Revit; «grupo · % con dato» bajo cada campo; teclado. Sustituye a la lista nativa del navegador
  en el filtro, en «Añadir nivel» y en «Agrupar por». Los internos (`__category__`, `__node__`) no se ofrecen.
- «Editar columnas»: «Planilla» en lugar de «Standard», grupos por cantidad de campos con dato, % con dato
  por campo y los de poco uso atenuados (no escondidos).

**Fallo previo arreglado de paso:** Escape no funcionaba en ningún panel de View con el visor abierto.
`Viewer.jsx` (desde marzo) corta todos los Escape de la página para que Autodesk no «muestre todo»; ahora deja
pasar los que nacen en un panel marcado `data-escape-propio` (la Planilla), que los consume y no llegan al
visor. Medido: en la Planilla, Escape cierra el desplegable del campo, luego el filtro, y cierra Agrupar; en el
lienzo 3D el visor sigue quedándose con Escape como antes. (La tecla de la extensión de Chrome no llega a la
página: se probó con eventos de teclado en la propia página.)

