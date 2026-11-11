# 03 · El inventario de un modelo pesado ya no se junta en memoria (11-nov-2026)

Paso 1 del plan de [02 · modelos pesados](02_MODELOS_PESADOS_HOSPITALES.md). **En local, sin push ni despliegue.**
El dueño dio la orden («vayamos con el trabajo fuerte»); para esto se abrió el contrato B1 (extracción, publicación y
lectura del inventario), y **solo en cómo se mueve el dato, no en qué se guarda**.

## 1 · Las cuatro preguntas

| | |
|---|---|
| **¿Qué problema se resolvió?** | Extraer el inventario de un modelo y enviarlo al visor guardaba el modelo entero en la memoria del servidor, varias veces. Medido: con 50.000 elementos ya no cabía en los 2 GB de producción, y al quedarse sin memoria Render reinicia el servidor y se caen Docs y View para todos. |
| **¿Qué cambió?** | Los datos pasan por el servidor de a poco: lo que llega de Autodesk va a un fichero temporal en disco, las filas se guardan en la base por lotes, y el inventario se envía al visor fila a fila. Se quitó el tope de 100.000 elementos, que existía solo por la memoria. |
| **¿Cómo se comprobó?** | Con un Autodesk de mentira que fabrica modelos de 20.000 a 300.000 elementos, contra PostgreSQL de verdad. El código viejo y el nuevo dan **la misma huella del inventario y el mismo JSON, byte a byte**, en todos los casos; la memoria baja de gigas a decenas de MB (§3). |
| **¿Cómo se vuelve atrás?** | Revirtiendo el commit. No hay migración ni cambio en la base: lo guardado tiene la misma forma y la misma huella que antes. |

## 2 · Qué se midió con el código anterior

El análisis de 02 proyectaba desde un solo dato de producción (el Canal). Medido de verdad, era peor:

| Elementos | Extraer (memoria extra) | Servir al visor (memoria extra) |
|---|---|---|
| 20.000 · perfil Canal | 628 MB | 452 MB |
| 50.000 · perfil Canal | **1.559 MB** | 1.125 MB |
| 95.000 · perfil Canal | **2.964 MB** | 2.138 MB |
| 50.000 · perfil hospital | **2.890 MB** | 2.000 MB |
| 95.000 · perfil hospital | **5.498 MB** | — |
| 120.000 · perfil Canal | falla: `INCOMPLETE_EXTRACTION_PAGE_LIMIT` | — |

- **≈ 31 MB por cada 1.000 elementos al extraer** y ≈ 22 MB al servir (perfil Canal). El servidor tiene 2 GB para
  todo: el techo real estaba cerca de **40.000 elementos por modelo**, no en 100.000.
- «Perfil Canal» = 3,2 KB de propiedades por elemento. Está calibrado con producción: el frente Canal real son
  19.889 elementos y 66,5 MB de JSON; el sintético de 20.000 da 68,6 MB.
- «Perfil hospital» = 6 KB por elemento (familias MEP con muchos parámetros). **Es un supuesto**: no hay ningún
  hospital medido.

**Por qué tanto.** El modelo vivía en memoria hasta seis veces a la vez: la lista de lo bajado de Autodesk, las
filas armadas, su copia con la obra, las filas validadas, el JSON entero para calcular la huella y sus bytes. Al
servir: todas las filas, su JSON entero y el gzip.

## 3 · Qué se mide ahora

| Elementos | Extraer: antes → ahora | Servir: antes → ahora | ¿Mismo resultado? |
|---|---|---|---|
| 20.000 · Canal | 628 → **31 MB** | 452 → **19 MB** | sí |
| 50.000 · Canal | 1.559 → **42 MB** | 1.125 → **41 MB** | sí |
| 95.000 · Canal | 2.964 → **62 MB** | 2.138 → **79 MB** | sí |
| 20.000 · hospital | 1.162 → **49 MB** | — | sí |
| 50.000 · hospital | 2.890 → **59 MB** | 2.000 → **86 MB** | sí |
| 95.000 · hospital | 5.498 → **81 MB** | — | sí |
| 120.000 · Canal | fallaba → **73 MB** | — | (antes no había) |
| 300.000 · Canal | fallaba → **141 MB** | — | (antes no había) |
| 300.000 · hospital | fallaba → **165 MB** | — | (antes no había) |

- «Mismo resultado» = misma huella del snapshot (`content_hash`) y mismo número de filas al extraer; mismo JSON,
  byte a byte, al servir.
- **Tarda un poco más**: 95.000 elementos del perfil Canal, 56 s antes y 77 s ahora, en el banco (sin la espera de
  Autodesk, que en la vida real es casi todo el tiempo). Es el precio de comprimir a disco.
- La memoria al servir es lo que ocupa el inventario ya comprimido (8 MB cada 20.000 elementos), que es justo lo
  que se guarda en la caché «una vez por revisión» (`f0cfec98`).

## 4 · Qué cambió, fichero por fichero

- **`backend/routes/inventory.py` · `extract_metadata_task`**
  - **El árbol se pide antes que las propiedades.** Sabiendo qué nodos son padres (tipos, familias, categorías), de
    cada página solo se retienen en memoria las propiedades que las instancias heredan.
  - **Cada nodo de Autodesk va a un fichero temporal** (`_Carrete`), comprimido. Antes iba a una lista.
  - **La lógica por elemento no se tocó**: herencia del tipo, limpieza de Civil 3D, categoría, descarte de tipos,
    sistemas y ejes MEP. El parche la recorta y la vuelve a pegar tal cual.
  - **Tope de 100.000 elementos, fuera.** Queda un tope de seguridad de 2.000.000 por si Autodesk nunca diera la
    última página.
  - Los dos ficheros temporales se borran al terminar, falle o no.
  - **Latido mientras se guarda.** Guardar cientos de miles de filas tarda minutos; cada 30 s se renueva el estado
    del trabajo, para que el sondeo no lo dé por muerto a los 10 minutos estando vivo.
- **`backend/inventory_identity.py` · B1**
  - **`SnapshotRows`**: las filas del snapshot, validadas una a una con la misma regla de siempre (`_prepare_row`,
    recortada de `publish_snapshot`) y guardadas en disco. En memoria queda solo el identificador de cada fila.
  - **`publish_snapshot`** acepta una lista, como siempre, o un `SnapshotRows` sellado. Un iterador a medias sigue
    rechazado. La huella se calcula fila a fila con los mismos bytes (`_fingerprint_rows`), y la inserción va por
    lotes de 500 dentro de la misma transacción.
  - **`iter_inventory`**: lo mismo que `get_inventory`, fila a fila, con un cursor del lado del servidor.
    `get_inventory` es ahora su lista.
- **`backend/inventory_http.py`**
  - **`_construir_cuerpo`** escribe cada fila al compresor según llega de la base. Sale el mismo JSON.
  - El esquema de columnas (`inventory_schema_request`) mira sus 2.000 elementos sin traer el frente entero.

## 5 · Evidencia

- **Banco** (`scratchpad/pesados`, no se commitea): Autodesk de mentira determinista + la base desechable.
  - Seis modelos (20.000, 50.000 y 95.000 × dos perfiles): **misma huella** con el código viejo y el nuevo.
  - Cuatro variantes difíciles sobre 8.000 elementos: colección al revés (los tipos llegan después de sus
    instancias), 60 hojas que la paginación no trae y hay que recuperar, y las dos cosas juntas: **misma huella**.
  - Cuatro frentes servidos con el código viejo y el nuevo: **mismo JSON**.
  - Cortar la lectura a los 2.000 elementos de un frente de 50.000: 0,7 s, y la conexión sigue sirviendo.
- **Pruebas** `backend/tests/test_inventario_sin_memoria.py` (47 casos, sin base de datos):
  - la huella por filas es la de la lista, sobre datos aleatorios;
  - publicar desde disco escribe las mismas filas que desde la lista, aunque vayan en 14 lotes;
  - reextraer lo mismo no escribe nada, y lo distinto sigue siendo `SNAPSHOT_CONTENT_CONFLICT`;
  - un snapshot sin sellar o de otro modelo no se publica;
  - la instancia hereda de su tipo aunque el tipo llegue después;
  - una hoja ausente se recupera, y una irrecuperable sigue siendo error, no un inventario a medias;
  - el trabajo da señales de vida mientras se guarda, y calla al terminar;
  - guardias contra la vuelta de las listas y del tope.
- **Suite del backend**: sobre el árbol exacto del commit, 2.710 en verde y 2 fallos, los mismos dos que ya fallan en `origin/main`
  (`test_capacidades_con_puerta`, `test_reconstruccion_desde_cero`).

## 6 · Lo que este paso NO resuelve

1. **El navegador.** El inventario se sigue enviando entero: 95.000 elementos del perfil Canal son 326 MB de JSON
   (40 MB comprimido). El servidor ya lo aguanta; el navegador de quien lo abre, probablemente no. Es el paso 3
   (columnas en la carga, propiedades al pedirlas) y **es ahora el límite real para un hospital**.
2. **Una extracción larga puede morir a medias.** Con Autodesk de verdad, 300.000 elementos son 600 páginas y
   decenas de minutos, dentro del proceso web, que se recicla solo (`--max-requests 2000`) y con cada despliegue. No
   corrompe nada (no se publica nada a medias) pero hay que repetirla. Es el paso 2 (extracción en su propio proceso).
3. **El inventario muy grande no entra en la caché** de 128 MB comprimidos (≈ 300.000 elementos del perfil Canal):
   cada petición lo reconstruiría. Va con el paso 3.
4. **Disco temporal.** 300.000 elementos del perfil hospital ocupan hasta ~0,9 GB de ficheros temporales mientras se
   extrae. En Render no está comprobado cuánto disco temporal hay; si faltara, la extracción falla con su motivo,
   no tumba el servidor.
5. **El GET de respaldo** (cuando la paginación falla) sigue trayendo la colección entera en una respuesta.
6. **Otros lectores del inventario** (comparador, 4D/Planilla, PREDICT) no se han medido.

## 7 · Observaciones al paso

- Si Autodesk devolviera una página corta a mitad de la paginación, la extracción la toma por la última, y los
  tipos que no llegaron dejan a sus instancias sin lo heredado (y las de tuberías se descartarían como ejes). Lo
  hacía igual el código anterior; no hay evidencia de que Autodesk lo haga. Queda anotado, sin tocar.
- En una fila inválida, el error salta ahora al llegar esa fila y no al final: con dos defectos en el mismo modelo
  puede informarse uno distinto que antes. El resultado es el mismo: la extracción falla y no se publica nada.
