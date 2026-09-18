# Comparador · varios modelos en un lado, archivo local y modelos de ECD Docs

18-sep-2026. Preguntas del propietario: «¿funciona bien con archivos vinculados? O sea, en uno vincular varios y el
otro solo» · «¿podemos cargar un archivo local para esa comparativa?» · «debería ser posible cargar modelos desde
nuestra carpeta de ECD Docs, ¿es posible?». **Medición en producción y lectura de código; no se ha cambiado nada.**

## 1 · En corto

- **Varios modelos en un lado y uno en el otro: funciona** (medido en producción). Datos, 3D y alineación
  correctos. Una salvedad medida: si dos ficheros del mismo lado comparten elementos —un derivado como
  «…-ENCOFRADOS», hecho a partir del principal—, el comparador no sabe de cuál es cada uno. Resultado: 1 elemento
  sale «modificado» sin poder estarlo, y en 3D los elementos compartidos se pintan y se seleccionan en uno solo de
  los dos ficheros.
- **Archivo local y ECD Docs: posible, y la mitad ya existe.** El visor ya sube un modelo local a Autodesk y el
  portal ya «publica al visor» un documento del ECD. Lo que falta es que esos modelos tengan **datos**: desde B1
  (7-sep) el inventario solo acepta modelos que vienen de ACC y rechaza los demás (`INVALID_SOURCE_URN`). Sin datos,
  el comparador solo podría enseñar la geometría, no qué cambió. Para ECD Docs hace falta una decisión sobre la
  identidad de B1.

## 2 · Varios modelos en un lado (medido el 18-sep-2026)

Chrome del propietario, frente `1_DRENAJE`, solo versiones actuales (así no se crea ninguna extracción temporal):

- **A:** `…DR-HD-011264@011268.rvt` v64.
- **B:** el mismo v64 **+** `…DR-HD-011264@011268-ENCOFRADOS.rvt` v31.

| Resultado | Valor |
|---|---|
| Elementos en el inventario | A 406 · B 3.849 (406 + 3.443) |
| Agregados | **3.442**, todos del fichero de encofrados |
| Eliminados | 0 |
| Modificados | **1**, y ese elemento está en los DOS ficheros de B |
| Ids repetidos dentro de las listas | 0 |
| Ids compartidos entre el principal y el de encofrados (mapeo de LMV) | **131.833** de 399.144 |
| 3D | B carga los dos ficheros con el mismo origen (`globalOffset`) que A: alineados |

**Qué significa.** El de encofrados se hizo a partir del principal y conserva los identificadores de Revit de
buena parte de sus elementos. El comparador empareja elementos **solo por ese identificador**, sin mirar de qué
fichero es cada uno:

- El «1 modificado» es falso: el principal es la misma versión en los dos lados y no puede haber cambiado. Sale
  porque la copia de ese elemento dentro del fichero de encofrados tiene otras propiedades.
- En 3D, el comparador guarda un solo elemento por identificador. Para los 131.833 compartidos, el color y la
  selección espejo caen en uno de los dos ficheros (el último cargado), no en los dos.
- Con ficheros independientes entre sí (sin elementos compartidos) no pasa nada de esto.

### 2.1 · Arreglo: emparejar por documento (18-sep; commit y push autorizados, falta desplegar)

Aceptado por el propietario («si»). La regla: **si algún lado tiene más de un documento, cada documento se compara
solo consigo mismo** (otra versión del mismo linaje) y uno que solo está en un lado cuenta entero como agregado o
eliminado. Con un documento por lado —el caso de siempre, y el que permite comparar un modelo con un derivado suyo—
se sigue emparejando solo por identificador. Un frente entero, igual que antes.

- **Backend** (`routes/compare.py`): en ese modo el diff empareja por `external_id` **y** `source_lineage` (la
  vista de B1 ya lo trae: sin migración) y cada fila dice de qué documento es (`fa`/`fb`, índices en `fuentes`).
  `/api/compare/element` acepta un lado ausente, para no traer la copia de otro documento.
- **Visor** (`CompareView.jsx`): mapa de identificadores por fichero; pintar, aislar y el detalle usan el
  documento de cada fila; la selección espejo va al fichero del mismo linaje en el otro lado, o a ninguno.
  Con un servidor anterior (sin `por_documento`) todo sigue como antes, así que el orden de despliegue da igual.

**Probado:**
- `tests/test_comparador_por_documento.py` (8, sin base): qué modo se elige; con un documento por lado ni la
  consulta ni la respuesta cambian; con varios, la consulta empareja por linaje y cada fila lleva su documento;
  el detalle con un lado ausente.
- `herramientas/ensayo_comparador_por_documento.py`, **12/12 contra PostgreSQL de verdad** (cluster desechable,
  ruta real): el caso de encofrados en pequeño da agregados = el fichero de encofrados entero, **0 modificados**
  y 0 eliminados; sobre los MISMOS datos, la consulta de antes reproduce el modificado falso; principal v60 contra
  v64 + encofrados da el p2 modificado entre versiones del principal (no contra su copia); con un documento por
  lado —versiones, o el principal contra su derivado— todo sale igual que antes.
- Banco `probar-comparar` (visores de mentira con ficheros que comparten identificadores): el modificado se pinta
  en el principal y no en su copia, la copia en encofrados; la selección de `p2` en A va al `p2` del principal en
  B, y la de la copia no selecciona nada en A; aislar agrupa por fichero; el detalle pide solo el documento del
  elemento. Con un documento por lado, el detalle sigue mandando los lados enteros.
- Suite backend 1997 pasan / 1 falla (la de siempre); ESLint de `CompareView.jsx` 4 = antes; banco 0.

**Desplegado y verificado (18-sep):** `/api/health` → `1bc97ae0296a` y el paquete del visor con el código nuevo.
Medido en producción (su Chrome, frente `1_CANAL`, versiones actuales, sin extracción temporal): A =
`…DR-ST-004120@004145` v58 (8.767 elementos) contra B = el mismo v58 + `…004120@004145-ENCOFRADO` v24 → **0
modificados, 0 eliminados, 6.094 agregados, todos del fichero de encofrado**, emparejado por documento. El caso de
drenaje (`011264`, esperado 3.443 y 0) no se repitió: su visor estaba en Canal y no se le cambió de frente.

## 5 · Modelo contractual contra modelos de ejecución (pregunta del propietario, 18-sep)

«Contractualmente nos entregaron un modelo, y yo comparo añadiendo otros que por la naturaleza de la ejecución se
agregaron; no necesariamente existen en el contractual.»

La medición de §2.1 lo ilustra: con el encofrado en B, el comparador dice **6.094 agregados**. Es correcto en lo que
mide —elementos que en A no existen—, pero leído como «agregados al contrato» engaña: son el método de ejecución,
no alcance nuevo. Que el modelo contractual no los dibuje tampoco los convierte en adicionales: encofrado y
excavación suelen ser partidas del presupuesto que el modelo no dibuja.

**Recomendación:**

1. **Para la pregunta contractual, un modelo contra sí mismo:** A = la versión que se entregó como contractual del
   modelo principal; B = su versión actual. Un documento por lado: agregados, eliminados y modificados son cambios
   sobre lo que dibuja el contrato, y son los candidatos a revisar como adicionales o deductivos (el comparador no
   los decide).
2. **Los modelos de ejecución, cada uno contra sus propias versiones** (p. ej. encofrado v10 → v24): responden
   cómo avanzó ese trabajo, no qué cambió del contrato. Nunca contra el contractual.
3. **Mejora propuesta (no hecha):** si alguien los pone juntos, que el comparador no los cuente como agregados:
   un documento que solo está en un lado se enseña aparte —«solo en B, sin equivalente contractual: …ENCOFRADO,
   6.094 elementos»—, en un color neutro en 3D. El servidor ya sabe qué documentos están en un solo lado (el
   emparejamiento por documento lo calcula), así que es un cambio pequeño.

Si algún día el contractual es un fichero DISTINTO en ACC (no una versión antigua del mismo), compararlo solo
contra el modelo principal, un documento por lado: el emparejamiento por documento sólo empareja versiones del
mismo linaje, y con varios documentos en un lado lo daría todo por agregado y eliminado.

## 3 · Archivo local y ECD Docs

### 3.1 · Lo que ya existe

| Vía | Qué hace | Quién |
|---|---|---|
| Visor → «Importar modelo» → FILE UPLOAD | Sube el fichero a Autodesk por URL firmadas, lo traduce y lo añade al frente (`/api/modelos/firmar-subida`, `/cerrar-subida`, `/api/config/project/upload/finalize`) | solo admin |
| Portal (ECD Docs) → «Publicar al visor» | Los bytes van del almacén del ECD a Autodesk sin volver a subirlos; no publica un borrador (WIP); la clave es la huella del contenido, así que no se paga dos veces; el URN queda guardado en el documento (`/api/modelos/publicar-desde-ecd`) | solo admin |

Traducir en Autodesk consume créditos de la cuenta; por eso las dos vías son solo de administrador.

### 3.2 · Lo que falta para compararlos

1. **Elegirlos en el comparador:** hoy cada lado solo ofrece los modelos vinculados al frente, con sus versiones
   de ACC. Haría falta una tercera fuente por lado: «documento del ECD» y «archivo de mi equipo».
2. **Sus datos.** El diff se calcula en Postgres sobre el inventario, y desde B1 (7-sep) el inventario solo acepta
   versiones de ACC (`urn:adsk.wipprod:fs.file:vf.…?version=N`, con su linaje). Un modelo subido o publicado desde
   el ECD es un objeto del almacén de Autodesk (`urn:adsk.objects:os.object:…`) y su extracción se rechaza:
   comprobado en local, `source_identity` devuelve `INVALID_SOURCE_URN` en claro y en base64. Se vería en 3D, sin
   datos, y sin datos no hay «agregado / eliminado / modificado».
   - **ECD Docs** tiene una identidad natural: el propio documento del ECD y su versión (`file_nodes` +
     `file_versions`), que es justo lo que pide B1 (un linaje estable y una versión). Aceptarla es ampliar la regla
     de identidad de B1, que está congelada: **decisión del propietario**.
   - **Un archivo local suelto** no tiene identidad estable: solo tiene sentido como lado **temporal** de una
     comparación (como las versiones históricas, `__cmp__`), sin quedarse en el inventario.
3. **Emparejar elementos:** funciona si el fichero es el mismo modelo de Revit —una copia de trabajo o una
   revisión emitida—, porque Revit conserva los identificadores. Dos ficheros sin relación darán todo como
   agregado y eliminado.

### 3.3 · Hallazgo lateral

Por la misma regla, **hoy un modelo subido desde el equipo o publicado desde el ECD a un frente se queda sin datos**:
se ve en 3D, pero Filters e Inventory no tienen nada suyo (la extracción falla en silencio, en un hilo). Según el
manifiesto de P0 (6-sep, `docs/filters/P0_PRECHECK.md` §3) los 12 modelos configurados son de ACC, así que no
afecta a nadie todavía; afectará al primero que use cualquiera de esas dos vías.

## 4 · Orden (aceptado por el propietario el 18-sep)

1. **Emparejar por documento** cuando un lado tiene varios (§2.1): hecho, empujado; falta desplegar y medir.
2. **Decisión pendiente:** ¿los documentos del ECD entran en el inventario con su propia identidad? Si sí: ECD
   Docs como fuente del comparador, y de paso los modelos publicados desde el ECD tendrían datos en Filters. Es
   cambiar la regla de identidad de B1: hay que pedirla explícitamente antes de tocar nada.
3. **Archivo local** como lado temporal de una comparación, solo admin por el coste de traducir.
