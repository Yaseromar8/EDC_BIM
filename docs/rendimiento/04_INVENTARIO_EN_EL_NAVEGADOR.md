# 04 · El inventario de un modelo pesado en el navegador (11-nov-2026)

Sigue a [03](03_INVENTARIO_SIN_MEMORIA.md), que arregló el servidor. **En local, sin push ni despliegue.**
Aquí se midió qué hace el **navegador** con un inventario grande, se arregló lo que impedía cargarlo, y se deja
dicho con números lo que este paso **no** consigue.

## 1 · Las cuatro preguntas

| | |
|---|---|
| **¿Qué problema se resolvió?** | Un inventario de más de ~512 MB de JSON **no cargaba nunca** en el visor: el navegador no puede tener un texto tan largo en una sola cadena, `res.text()` devolvía vacío y salía «Unexpected end of JSON input». Ese tope son unos 150.000 elementos como los del Canal, o unos 88.000 con las propiedades de un hospital. |
| **¿Qué cambió?** | El servidor escribe el inventario con **una fila por línea** (sigue siendo la misma lista JSON) y el visor lo lee **línea a línea**: convierte y normaliza cada elemento según llega, sin tener nunca el texto entero ni la lista cruda. |
| **¿Cómo se comprobó?** | En Chrome sin ventana, con memoria exacta, contra la ruta `/api/inventory` de verdad sobre PostgreSQL. El resultado es idéntico al de antes (misma huella de filas, claves y valores) y cargan modelos que antes no: 95.000 elementos de hospital y 300.000 del Canal (§3). 33 pruebas nuevas del visor y 3 del servidor. |
| **¿Cómo se vuelve atrás?** | Revirtiendo el commit. El visor nuevo entiende al servidor anterior y el visor anterior entiende al servidor nuevo, así que no hay orden obligado de despliegue. |

## 2 · Lo que se midió con el código anterior

Chrome sin ventana (`--enable-precise-memory-info`), el mismo camino de `App.jsx`: texto entero → `JSON.parse` →
normalizar → guardar en IndexedDB.

| Elementos | JSON | Tiempo en el navegador | Memoria pico | Memoria que se queda |
|---|---|---|---|---|
| 20.000 · Canal | 69 MB | 5 s | 293 MB | 172 MB |
| 95.000 · Canal | 326 MB | 26 s, **15 de ellos con la pantalla congelada** | 1.272 MB | 776 MB |
| 95.000 · hospital | 549 MB | **no carga**: «Unexpected end of JSON input» | — | — |
| 300.000 · Canal | 1,0 GB | **no carga** | — | — |

El mensaje del fallo es el mismo que `App.jsx` ya trataba como «respuesta vacía, backend despertando» y
reintentaba: con un modelo grande no era el backend, era el tamaño.

## 3 · Lo que se mide ahora

De extremo a extremo: `/api/inventory` real (caché y gzip incluidos) → lector línea a línea → normalizador.

| Elementos | Tiempo en el navegador | Memoria pico | Memoria que se queda | ¿Mismo resultado? |
|---|---|---|---|---|
| 20.000 · Canal | 4 s | 256 MB | 150 MB | sí |
| 95.000 · Canal | 19 s, en trozos | 1.041 MB | 656 MB | sí |
| 95.000 · hospital | 54 s | 2.330 MB | 1.561 MB | (antes no cargaba) |
| 300.000 · Canal | 59 s | 2.684 MB | 1.907 MB | (antes no cargaba) |

- «Mismo resultado» = misma huella de todas las filas, con sus claves en el mismo orden y sus valores.
- A ese tiempo hay que sumarle, **solo la primera vez tras cada cambio del inventario**, lo que tarda el servidor en
  preparar la respuesta: 4 s con 20.000 elementos, 20 s con 95.000, 62 s con 300.000. Después sale de la caché.
- La memoria baja un 15–20 %, no más. **Este paso quita el muro, no hace ligero el inventario** (§5).

## 4 · Qué cambió, fichero por fichero

- **`backend/inventory_http.py` · `_construir_cuerpo`**: un salto de línea después de cada fila. En JSON es espacio
  en blanco: quitándolos queda, byte a byte, lo que se servía antes.
- **`frontend-react/src/lib/inventarioPorFilas.js`** (nuevo)
  - `leerInventarioPorFilas(respuesta, alLlegar)`: lee el cuerpo por trozos y entrega cada fila.
  - **Una respuesta cortada es un error**, aunque el corte caiga justo entre dos filas: la lista tiene que llegar a
    su «]». Una respuesta sin nada se informa como vacía, para que `App.jsx` reintente como hacía.
  - Si el servidor es el anterior (toda la lista en una línea), la entiende igual.
- **`frontend-react/src/lib/inventoryNormalizers.js`**
  - `crearNormalizador()`: el mismo algoritmo, alimentado fila a fila. `normalizeInventoryPreload` y
    `normalizeInventoryRefresh` lo usan por dentro.
  - El nombre limpio y la clave `Grupo::Propiedad` se calculan una vez por propiedad, no una vez por celda; los
    valores repetidos comparten una sola cadena.
- **`frontend-react/src/App.jsx`**: la precarga y la recarga del inventario usan `inventarioDeRespuesta`. Los
  reintentos (500, cuerpo vacío) y los mensajes quedan como estaban.

## 5 · Lo que este paso NO resuelve, y por qué

**El inventario sigue pesando mucho en el navegador: ≈ 7 KB de memoria por elemento con ~170 propiedades, ≈ 16 KB
con ~330.** Se midió de qué está hecho, porque la primera sospecha (que las cadenas retenían el texto original)
resultó falsa:

- Cada elemento es un objeto con una entrada por propiedad, **dos veces**: `Grupo::Propiedad` y `Propiedad`.
- En un modelo real cada elemento trae un juego de propiedades algo distinto (las vacías no se guardan), y el motor
  del navegador gasta casi toda la memoria en describir esa forma, no en los valores: poner el mismo valor en todas
  las celdas no ahorra nada.
- Bajar de ahí pide **cambiar cómo se guarda el inventario en memoria** (por columnas, no un objeto por elemento).
  Eso toca a todo lo que lo lee: la tabla, Filters, la Planilla, los temas de color, 4D. Es un trabajo aparte y
  grande, sobre código CLOSED.

Además:

1. **La tabla de Inventory copia todas las filas al abrirse** (`InventoryDataGrid.jsx`, `{ ...row }` por elemento):
   con el panel abierto la memoria se duplica. No se tocó: es código CLOSED con cambios ajenos sin commitear.
2. **El servidor prepara la respuesta entera antes de mandar el primer byte.** El visor corta a los 120 s sin
   respuesta: un inventario que tarde más en prepararse (≈ 300.000 elementos de hospital) no llegaría. Y por encima
   de 128 MB comprimidos no entra en la caché, así que se prepararía en cada petición. Falta mandarlo según se
   construye.
3. **La caché local (IndexedDB)** guarda y relee el inventario entero. Guardar 300.000 elementos tardó 2 s; releerlo
   no se midió.
4. **No hay ningún hospital real medido.** El perfil «hospital» (6 KB de propiedades por elemento) es un supuesto.
5. **Una tableta no es un ordenador**: 1,5–2,7 GB de pico solo caben en un equipo de escritorio.

## 6 · Qué significa en la práctica

| Modelo de un frente | Antes | Ahora |
|---|---|---|
| Hasta ~40.000 elementos | funciona | funciona, con algo menos de memoria |
| 40.000–150.000 (tipo Canal) | el servidor se quedaba sin memoria al extraer | funciona en un ordenador de escritorio |
| Más de ~150.000 (tipo Canal) o ~88.000 (tipo hospital) | no cargaba | carga; lento y con 2–3 GB de navegador |
| Varios cientos de miles con propiedades de hospital | no cargaba | no medido; lo esperable es que no sea usable |

**Para un hospital grande hoy, lo que funciona es repartirlo en frentes por disciplina** (arquitectura, estructuras,
instalaciones), cada uno por debajo de ~100.000 elementos. Para cargarlo entero en un frente hace falta el cambio
de §5.

## 7 · Evidencia

- **Banco del navegador** (no se commitea): `probar-inventario-pesado.html` en el visor de desarrollo, medido con
  Chrome sin ventana por CDP (`medir_navegador.mjs`), con inventarios extraídos por el código real a la base
  desechable.
- **`node frontend-react/pruebas/inventarioPorFilas.prueba.mjs`: 33/33.**
  - el normalizador da lo mismo que el anterior (copiado en la prueba como referencia): filas, orden de claves,
    valores y esquema;
  - el cuerpo llega en trozos de 1, 7, 64, 1.000, 65.536 bytes y entero: las mismas filas, en orden;
  - servidor anterior (una sola línea): lo mismo;
  - vacío, lista vacía, cortado entre filas, cortado a media fila, datos después del final.
- **`backend/tests/test_inventario_sin_memoria.py`**: el cuerpo sin saltos es el JSON de antes byte a byte; una fila
  por línea, también cuando un valor lleva un salto de línea dentro.
- **Bancos existentes del visor y suite del backend**: sobre el árbol exacto del commit.
  - Backend: 2.711 en verde y 2 fallos, los mismos dos que ya fallan en `origin/main`.
  - Visor: 53 de 57 bancos en verde. Los 4 que fallan ya fallaban igual antes de este cambio
    (`filtersCore.b5BackendPayload`, `.interacciones`, `.interaccionesIntegradas`, `.popoutBrowser`).
  - El visor compila (`vite build`).
  - **Un banco existente se actualizó**: `filtersCore.normalizadores` comprobaba por texto que `App.jsx` llamara a
    `normalizeInventoryPreload(dbData, …)`. Esa llamada ya no existe (App lee fila a fila); ahora comprueba que App
    pase por `inventarioDeRespuesta` y que este use el normalizador real. Lo que vigila no cambió.

## 8 · Una corrección al banco de 03

El modelo sintético de 03 ponía a cada elemento **nombres de propiedad al azar**, cosa que un modelo real no hace.
No cambia nada de lo medido en el servidor (depende del tamaño, que es el mismo), pero inflaba la memoria por fila
en el navegador. Se corrigió antes de medir aquí: los nombres dependen de la categoría del elemento y solo varían
los valores.
